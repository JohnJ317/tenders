import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeUsageService } from '../../common/platform/claude-usage.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DEFAULT_TEMPLATES } from './default-templates';

export interface TemplateSuggestion {
  code: string;
  label: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}

@Injectable()
export class ProposalTemplatesService {
  private readonly logger = new Logger(ProposalTemplatesService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly usageService: ClaudeUsageService,
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.client = new Anthropic({ apiKey: apiKey ?? 'missing' });
    this.model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5';
  }

  /** Liste les templates actifs d'un cabinet */
  async list(cabinetId: string) {
    const templates = await this.prisma.proposalTemplate.findMany({
      where: { cabinetId, isActive: true },
      orderBy: [{ isSystem: 'desc' }, { label: 'asc' }],
    });

    // Si aucun template, initialise avec les 6 par défaut
    if (templates.length === 0) {
      await this.seedDefaultTemplates(cabinetId);
      return this.prisma.proposalTemplate.findMany({
        where: { cabinetId, isActive: true },
        orderBy: [{ isSystem: 'desc' }, { label: 'asc' }],
      });
    }

    return templates;
  }

  /** Initialise les 6 templates par défaut pour un cabinet */
  async seedDefaultTemplates(cabinetId: string) {
    this.logger.log(`Seeding default templates for cabinet ${cabinetId}`);
    for (const tmpl of DEFAULT_TEMPLATES) {
      await this.prisma.proposalTemplate.upsert({
        where: { cabinetId_code: { cabinetId, code: tmpl.code } },
        create: {
          cabinetId,
          code: tmpl.code,
          label: tmpl.label,
          description: tmpl.description,
          understandingPrompt: tmpl.understandingPrompt,
          methodologyPrompt: tmpl.methodologyPrompt,
          planningPrompt: tmpl.planningPrompt,
          teamPrompt: tmpl.teamPrompt,
          typicalTeamSize: tmpl.typicalTeamSize,
          typicalDurationMonths: tmpl.typicalDurationMonths,
          isActive: true,
          isSystem: true,
        },
        update: {},
      });
    }
  }

  /** Récupère un template par code */
  async getByCode(cabinetId: string, code: string) {
    const template = await this.prisma.proposalTemplate.findUnique({
      where: { cabinetId_code: { cabinetId, code } },
    });
    if (!template) throw new NotFoundException(`Template ${code} introuvable`);
    return template;
  }

  /** Met à jour un template */
  async update(
    cabinetId: string,
    id: string,
    data: {
      label?: string;
      description?: string;
      understandingPrompt?: string;
      methodologyPrompt?: string;
      planningPrompt?: string;
      teamPrompt?: string;
      typicalTeamSize?: number;
      typicalDurationMonths?: number;
      isActive?: boolean;
    },
  ) {
    const template = await this.prisma.proposalTemplate.findFirst({
      where: { id, cabinetId },
    });
    if (!template) throw new NotFoundException('Template introuvable');

    return this.prisma.proposalTemplate.update({
      where: { id },
      data,
    });
  }

  /** Réinitialise un template à sa valeur par défaut (si c'est un system template) */
  async resetToDefault(cabinetId: string, id: string) {
    const template = await this.prisma.proposalTemplate.findFirst({
      where: { id, cabinetId },
    });
    if (!template) throw new NotFoundException('Template introuvable');
    if (!template.isSystem) {
      throw new BadRequestException('Ce template n\'est pas un template système');
    }

    const defaultTmpl = DEFAULT_TEMPLATES.find((t) => t.code === template.code);
    if (!defaultTmpl) {
      throw new BadRequestException('Pas de valeur par défaut pour ce template');
    }

    return this.prisma.proposalTemplate.update({
      where: { id },
      data: {
        label: defaultTmpl.label,
        description: defaultTmpl.description,
        understandingPrompt: defaultTmpl.understandingPrompt,
        methodologyPrompt: defaultTmpl.methodologyPrompt,
        planningPrompt: defaultTmpl.planningPrompt,
        teamPrompt: defaultTmpl.teamPrompt,
        typicalTeamSize: defaultTmpl.typicalTeamSize,
        typicalDurationMonths: defaultTmpl.typicalDurationMonths,
      },
    });
  }

  /**
   * Utilise Claude pour suggérer 2-3 templates les plus pertinents pour un AO donné.
   * Se base sur le titre, la description et l'analyse DCE.
   */
  async suggestForTender(cabinetId: string, tenderId: string): Promise<TemplateSuggestion[]> {
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, cabinetId },
      include: { analysis: true },
    });
    if (!tender) throw new NotFoundException('AO introuvable');

    const templates = await this.list(cabinetId);

    const analysisContext = tender.analysis
      ? `\n\n=== ANALYSE DCE ===\nRésumé : ${tender.analysis.summary ?? 'n/a'}\nSecteur : ${tender.analysis.sector ?? 'n/a'}`
      : '';

    const prompt = `Tu es un expert en réponse aux appels d'offres pour cabinets d'audit francophones en Afrique de l'Ouest.

=== APPEL D'OFFRES ===
Titre : ${tender.title}
Description : ${tender.description ?? 'non précisée'}
Client : ${tender.clientName ?? 'n/a'}
Pays : ${tender.country ?? 'n/a'}
Secteur : ${tender.sector ?? 'n/a'}${analysisContext}

=== TEMPLATES DISPONIBLES ===
${templates.map((t) => `- [${t.code}] ${t.label} : ${t.description ?? ''}`).join('\n')}

=== TA MISSION ===
Identifie les 2 ou 3 templates les plus adaptés à cet AO, classés par pertinence décroissante.
Donne pour chacun :
- Le code du template
- Un justificatif court (1-2 phrases) expliquant pourquoi il convient
- Un niveau de confiance : high / medium / low

Réponds UNIQUEMENT avec un JSON valide (pas de markdown) :
{
  "suggestions": [
    {"code": "...", "reasoning": "...", "confidence": "high"}
  ]
}`;

    this.logger.log(`Claude suggest templates for tender ${tenderId}`);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Réponse Claude vide');
    }

    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    let parsed: { suggestions: Array<{ code: string; reasoning: string; confidence: string }> };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error(`JSON parse failed: ${cleaned.slice(0, 200)}`);
      throw new Error('Claude a renvoyé un JSON invalide');
    }

    // Validation : on ne garde que les codes valides
    const validCodes = new Set(templates.map((t) => t.code));
    return (parsed.suggestions ?? [])
      .filter((s) => validCodes.has(s.code))
      .slice(0, 3)
      .map((s) => {
        const t = templates.find((tmpl) => tmpl.code === s.code)!;
        return {
          code: s.code,
          label: t.label,
          reasoning: s.reasoning,
          confidence: (['high', 'medium', 'low'].includes(s.confidence)
            ? s.confidence
            : 'medium') as 'high' | 'medium' | 'low',
        };
      });
  }
}
