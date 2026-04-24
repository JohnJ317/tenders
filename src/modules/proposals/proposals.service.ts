import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

interface TenderContext {
  id: string;
  title: string;
  description: string | null;
  clientName: string | null;
  sector: string | null;
  country: string | null;
  type: string;
  submissionDeadline: Date | null;
  budgetIndicative: any;
  currency: string;
}

interface ConsultantLite {
  id: string;
  fullName: string;
  title: string | null;
  kind: string;
  yearsExperience: number | null;
  skills: string[];
  sectors: string[];
  languages: string[];
}

interface ReferenceLite {
  id: string;
  projectName: string;
  clientName: string;
  country: string | null;
  sector: string | null;
  description: string;
  outcome: string | null;
  durationMonths: number | null;
  status: string;
  tags: string[];
}

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY manquante — la génération de propositions sera désactivée.');
    }
    this.client = new Anthropic({ apiKey: apiKey ?? 'missing' });
    this.model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5';
  }

  /** Récupère ou initialise la proposition pour un AO. */
  async getOrCreate(cabinetId: string, tenderId: string) {
    // Vérifie que le tender appartient au cabinet
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, cabinetId },
    });
    if (!tender) throw new NotFoundException('AO introuvable');

    let proposal = await this.prisma.tenderProposal.findUnique({
      where: { tenderId },
    });

    if (!proposal) {
      proposal = await this.prisma.tenderProposal.create({
        data: { tenderId, status: 'DRAFT' },
      });
    }

    return proposal;
  }

  /** Récupère le contexte complet pour générer (tender + analyse + consultants + refs) */
  private async buildContext(cabinetId: string, tenderId: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, cabinetId },
      include: { analysis: true },
    });
    if (!tender) throw new NotFoundException('AO introuvable');

    const consultants = await this.prisma.consultant.findMany({
      where: { cabinetId, isActive: true },
      select: {
        id: true, fullName: true, title: true, kind: true,
        yearsExperience: true, skills: true, sectors: true, languages: true,
      },
      orderBy: { yearsExperience: 'desc' },
    });

    const references = await this.prisma.reference.findMany({
      where: { cabinetId, status: { in: ['COMPLETED', 'ONGOING'] } },
      select: {
        id: true, projectName: true, clientName: true, country: true,
        sector: true, description: true, outcome: true,
        durationMonths: true, status: true, tags: true,
      },
      orderBy: { endDate: 'desc' },
      take: 30, // limite le contexte
    });

    return { tender, consultants, references };
  }

  // ======================================================
  // 1. GÉNÉRATION : sélection équipe + références
  // ======================================================
  async generateTeamAndRefs(cabinetId: string, tenderId: string) {
    const { tender, consultants, references } = await this.buildContext(cabinetId, tenderId);

    if (consultants.length === 0) {
      throw new BadRequestException(
        "Aucun consultant dans votre base. Ajoutez des consultants sur /consultants d'abord.",
      );
    }

    const analysisContext = tender.analysis
      ? `\n\n=== ANALYSE DCE DISPONIBLE ===\nRésumé : ${tender.analysis.summary ?? 'n/a'}\nSecteur : ${tender.analysis.sector ?? 'n/a'}\nPays : ${tender.analysis.country ?? 'n/a'}\nBudget estimé : ${tender.analysis.estimatedBudget ?? 'n/a'} ${tender.analysis.currency ?? ''}`
      : '';

    const prompt = `Tu es un expert en réponse aux appels d'offres pour cabinets d'audit francophones en Afrique.

=== APPEL D'OFFRES ===
Titre : ${tender.title}
Client : ${tender.clientName ?? 'non renseigné'}
Pays : ${tender.country ?? 'non renseigné'}
Secteur : ${tender.sector ?? 'non renseigné'}
Description : ${tender.description ?? 'non renseignée'}${analysisContext}

=== CONSULTANTS DISPONIBLES DU CABINET ===
${consultants.map((c, i) => `${i + 1}. [id:${c.id}] ${c.fullName} — ${c.title ?? 'sans titre'} (${c.kind}, ${c.yearsExperience ?? '?'} ans)
   Compétences : ${c.skills.join(', ')}
   Secteurs : ${c.sectors.join(', ')}
   Langues : ${c.languages.join(', ')}`).join('\n')}

=== RÉFÉRENCES PROJETS DU CABINET ===
${references.length === 0 ? 'Aucune référence disponible.' :
references.map((r, i) => `${i + 1}. [id:${r.id}] "${r.projectName}" pour ${r.clientName} (${r.country ?? '?'}, ${r.durationMonths ?? '?'} mois, ${r.status})
   Secteur : ${r.sector ?? '?'}
   Description : ${r.description.slice(0, 300)}${r.description.length > 300 ? '...' : ''}`).join('\n\n')}

=== TA MISSION ===
Sélectionne :
1. Une équipe cohérente de 3 à 6 consultants (Chef de mission, experts, juniors), en privilégiant :
   - L'adéquation compétences / besoins de l'AO
   - Un mélange senior/junior logique
   - La pertinence sectorielle
2. 2 à 5 références projets similaires, en privilégiant :
   - Même secteur ou secteur proche
   - Même pays ou région si possible
   - Missions récentes et réussies (status=COMPLETED de préférence)

Réponds UNIQUEMENT avec un JSON valide de ce format (pas de markdown, pas de préambule) :
{
  "team": [
    {
      "consultantId": "uuid-du-consultant",
      "roleInProposal": "Chef de mission",
      "justification": "Expert reconnu en audit financier avec 15 ans d'expérience..."
    }
  ],
  "references": [
    {
      "referenceId": "uuid-de-la-ref",
      "relevance": "Mission identique dans le même secteur en 2023, avec résultats probants..."
    }
  ]
}`;

    this.logger.log(`Claude generate team+refs for tender ${tenderId}`);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = this.extractText(response);
    const parsed = this.parseJson(text, 'team+refs');

    // Validation des IDs (sécurité : éviter que Claude invente des UUID)
    const validConsultantIds = new Set(consultants.map((c) => c.id));
    const validReferenceIds = new Set(references.map((r) => r.id));

    parsed.team = (parsed.team ?? []).filter((t: any) =>
      validConsultantIds.has(t.consultantId),
    );
    parsed.references = (parsed.references ?? []).filter((r: any) =>
      validReferenceIds.has(r.referenceId),
    );

    // Sauvegarde
    const existing = await this.getOrCreate(cabinetId, tenderId);
    const updated = await this.prisma.tenderProposal.update({
      where: { id: existing.id },
      data: {
        selectedTeam: parsed.team,
        selectedRefs: parsed.references,
        generatedAt: new Date(),
        tokensUsed: { increment: response.usage?.input_tokens + response.usage?.output_tokens || 0 },
      },
    });

    return {
      team: parsed.team,
      references: parsed.references,
    };
  }

  // ======================================================
  // 2. GÉNÉRATION : compréhension + méthodologie
  // ======================================================
  async generateMethodology(cabinetId: string, tenderId: string) {
    const { tender } = await this.buildContext(cabinetId, tenderId);

    const analysisContext = tender.analysis
      ? `\n\nContexte additionnel (analyse DCE) : ${tender.analysis.summary ?? ''}`
      : '';

    const prompt = `Tu es un expert en rédaction de propositions techniques pour cabinets d'audit francophones en Afrique de l'Ouest.

=== APPEL D'OFFRES ===
Titre : ${tender.title}
Client : ${tender.clientName ?? 'non renseigné'}
Pays : ${tender.country ?? 'non renseigné'}
Secteur : ${tender.sector ?? 'non renseigné'}
Description : ${tender.description ?? 'non renseignée'}${analysisContext}

=== TA MISSION ===
Rédige deux sections distinctes pour la proposition technique :

1. **Compréhension du projet** (400-600 mots)
   - Reformulation du besoin du client dans vos propres mots
   - Enjeux stratégiques identifiés
   - Contraintes et facteurs clés de succès
   - Votre vision de la valeur ajoutée à apporter

2. **Méthodologie** (800-1200 mots, découpée en 4-5 phases)
   - Phases d'intervention avec objectifs et livrables précis
   - Approche technique et outils mobilisés
   - Gouvernance du projet (comités, reporting)
   - Gestion de la qualité et des risques

Style : professionnel, structuré, précis. Utilise des sous-titres en markdown (##), des listes à puces pour les livrables et outils.

Réponds UNIQUEMENT avec un JSON valide (pas de markdown autour) :
{
  "understanding": "Le markdown de la compréhension ici...",
  "methodology": "Le markdown de la méthodologie ici..."
}`;

    this.logger.log(`Claude generate methodology for tender ${tenderId}`);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = this.extractText(response);
    const parsed = this.parseJson(text, 'methodology');

    const existing = await this.getOrCreate(cabinetId, tenderId);
    await this.prisma.tenderProposal.update({
      where: { id: existing.id },
      data: {
        understanding: parsed.understanding ?? null,
        methodology: parsed.methodology ?? null,
        tokensUsed: { increment: response.usage?.input_tokens + response.usage?.output_tokens || 0 },
      },
    });

    return {
      understanding: parsed.understanding,
      methodology: parsed.methodology,
    };
  }

  // ======================================================
  // 3. GÉNÉRATION : planning
  // ======================================================
  async generatePlanning(cabinetId: string, tenderId: string) {
    const { tender } = await this.buildContext(cabinetId, tenderId);

    // Récupère la méthodologie déjà générée pour cohérence planning ↔ phases
    const proposal = await this.prisma.tenderProposal.findUnique({
      where: { tenderId },
    });

    const methodologyContext = proposal?.methodology
      ? `\n\n=== MÉTHODOLOGIE DÉJÀ RÉDIGÉE ===\n${proposal.methodology.slice(0, 2000)}${proposal.methodology.length > 2000 ? '...' : ''}`
      : '';

    const deadlineContext = tender.submissionDeadline
      ? `Date limite de soumission : ${tender.submissionDeadline.toISOString().slice(0, 10)}`
      : 'Pas de date limite renseignée';

    const prompt = `Tu es un expert en planification de missions d'audit et de conseil.

=== APPEL D'OFFRES ===
Titre : ${tender.title}
Client : ${tender.clientName ?? 'non renseigné'}
${deadlineContext}${methodologyContext}

=== TA MISSION ===
Rédige un planning prévisionnel détaillé (600-900 mots) en markdown comprenant :

1. **Chronogramme général** : durée estimée en mois/semaines, date de démarrage cible, livrables intermédiaires
2. **Tableau des phases** : un tableau markdown avec colonnes (Phase | Activités | Durée | Livrables)
3. **Jalons clés** : dates des comités de pilotage, réunions de restitution
4. **Planning des charges** : répartition des jours-hommes par profil sur la période

Base-toi sur la méthodologie déjà rédigée pour garantir la cohérence des phases.

Utilise du markdown avec ## pour les sections, - pour les listes, et syntaxe tableau |col|col|.

Réponds UNIQUEMENT avec un JSON valide :
{
  "planning": "Le markdown du planning ici..."
}`;

    this.logger.log(`Claude generate planning for tender ${tenderId}`);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = this.extractText(response);
    const parsed = this.parseJson(text, 'planning');

    const existing = await this.getOrCreate(cabinetId, tenderId);
    await this.prisma.tenderProposal.update({
      where: { id: existing.id },
      data: {
        planning: parsed.planning ?? null,
        tokensUsed: { increment: response.usage?.input_tokens + response.usage?.output_tokens || 0 },
      },
    });

    return { planning: parsed.planning };
  }

  // ======================================================
  // HELPERS
  // ======================================================
  private extractText(response: Anthropic.Message): string {
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Réponse Claude vide');
    }
    return textBlock.text;
  }

  private parseJson(text: string, context: string): any {
    // Retire d'éventuels backticks markdown si Claude ne respecte pas l'instruction
    const cleaned = text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      this.logger.error(`Parse JSON échoué (${context}): ${cleaned.slice(0, 200)}`);
      throw new Error(`Claude a renvoyé un JSON invalide (${context})`);
    }
  }

  // ======================================================
  // Récupération complète (pour affichage UI)
  // ======================================================
  async getFullProposal(cabinetId: string, tenderId: string) {
    const proposal = await this.getOrCreate(cabinetId, tenderId);

    // Hydrate les IDs en données complètes
    const team = (proposal.selectedTeam as any[]) ?? [];
    const refs = (proposal.selectedRefs as any[]) ?? [];

    const teamHydrated = team.length > 0
      ? await this.prisma.consultant.findMany({
          where: {
            id: { in: team.map((t) => t.consultantId) },
            cabinetId,
          },
          select: {
            id: true, fullName: true, title: true, kind: true,
            yearsExperience: true, skills: true,
          },
        })
      : [];

    const refsHydrated = refs.length > 0
      ? await this.prisma.reference.findMany({
          where: {
            id: { in: refs.map((r) => r.referenceId) },
            cabinetId,
          },
          select: {
            id: true, projectName: true, clientName: true, country: true,
            sector: true, description: true, status: true, endDate: true,
          },
        })
      : [];

    return {
      ...proposal,
      teamHydrated: team.map((t) => ({
        ...t,
        consultant: teamHydrated.find((c) => c.id === t.consultantId),
      })),
      referencesHydrated: refs.map((r) => ({
        ...r,
        reference: refsHydrated.find((ref) => ref.id === r.referenceId),
      })),
    };
  }

  /** Update section manuellement (édition utilisateur) */
  async updateSection(
    cabinetId: string,
    tenderId: string,
    section: 'understanding' | 'methodology' | 'planning',
    content: string,
  ) {
    const proposal = await this.getOrCreate(cabinetId, tenderId);
    return this.prisma.tenderProposal.update({
      where: { id: proposal.id },
      data: { [section]: content },
    });
  }

  /** Update sélection équipe manuellement */
  async updateTeam(
    cabinetId: string,
    tenderId: string,
    team: Array<{ consultantId: string; roleInProposal?: string; justification?: string }>,
  ) {
    const proposal = await this.getOrCreate(cabinetId, tenderId);
    return this.prisma.tenderProposal.update({
      where: { id: proposal.id },
      data: { selectedTeam: team },
    });
  }

  /** Update sélection références manuellement */
  async updateReferences(
    cabinetId: string,
    tenderId: string,
    refs: Array<{ referenceId: string; relevance?: string }>,
  ) {
    const proposal = await this.getOrCreate(cabinetId, tenderId);
    return this.prisma.tenderProposal.update({
      where: { id: proposal.id },
      data: { selectedRefs: refs },
    });
  }

  /** Change le statut (DRAFT → READY → SUBMITTED) */
  async updateStatus(cabinetId: string, tenderId: string, status: 'DRAFT' | 'READY' | 'SUBMITTED') {
    const proposal = await this.getOrCreate(cabinetId, tenderId);
    return this.prisma.tenderProposal.update({
      where: { id: proposal.id },
      data: { status },
    });
  }

  /** Régénère l'équipe + références avec instruction utilisateur */
  async regenerateTeam(
    cabinetId: string,
    tenderId: string,
    instruction: string,
    targetedPassage?: string,
  ) {
    const { tender, consultants, references } = await this.buildContext(cabinetId, tenderId);

    if (consultants.length === 0) {
      throw new BadRequestException("Aucun consultant dans la base.");
    }

    // Récupère la sélection actuelle pour donner le contexte
    const currentProposal = await this.prisma.tenderProposal.findUnique({
      where: { tenderId },
    });
    const currentTeam = (currentProposal?.selectedTeam as any[]) ?? [];
    const currentRefs = (currentProposal?.selectedRefs as any[]) ?? [];

    const analysisContext = tender.analysis
      ? `\n\n=== ANALYSE DCE ===\nRésumé : ${tender.analysis.summary ?? 'n/a'}\nSecteur : ${tender.analysis.sector ?? 'n/a'}\nPays : ${tender.analysis.country ?? 'n/a'}`
      : '';

    const targetedBlock = targetedPassage
      ? `\n\n=== PASSAGE À MODIFIER EN PRIORITÉ ===\n${targetedPassage}\n\nApplique l'instruction surtout à ce passage, en gardant la cohérence avec le reste.`
      : '';

    const prompt = `Tu es un expert en réponse aux appels d'offres pour cabinets d'audit francophones en Afrique.

=== APPEL D'OFFRES ===
Titre : ${tender.title}
Client : ${tender.clientName ?? 'n/a'}
Pays : ${tender.country ?? 'n/a'}
Secteur : ${tender.sector ?? 'n/a'}${analysisContext}

=== SÉLECTION ACTUELLE À RECADRER ===
Équipe actuellement sélectionnée : ${currentTeam.length} consultants
${currentTeam.map((t: any) => {
  const c = consultants.find((x) => x.id === t.consultantId);
  return c ? `- ${c.fullName} (${t.roleInProposal ?? c.title ?? '?'})` : '';
}).filter(Boolean).join('\n')}

Références actuellement sélectionnées : ${currentRefs.length} projets
${currentRefs.map((r: any) => {
  const ref = references.find((x) => x.id === r.referenceId);
  return ref ? `- ${ref.projectName}` : '';
}).filter(Boolean).join('\n')}

=== INSTRUCTION UTILISATEUR ===
${instruction}${targetedBlock}

=== CONSULTANTS DISPONIBLES ===
${consultants.map((c, i) => `${i + 1}. [id:${c.id}] ${c.fullName} — ${c.title ?? '?'} (${c.kind}, ${c.yearsExperience ?? '?'} ans)
   Compétences : ${c.skills.join(', ')}
   Secteurs : ${c.sectors.join(', ')}
   Langues : ${c.languages.join(', ')}`).join('\n')}

=== RÉFÉRENCES DISPONIBLES ===
${references.length === 0 ? 'Aucune.' :
references.map((r, i) => `${i + 1}. [id:${r.id}] "${r.projectName}" pour ${r.clientName} (${r.country ?? '?'}, ${r.status})
   Secteur : ${r.sector ?? '?'}
   Description : ${r.description.slice(0, 200)}${r.description.length > 200 ? '...' : ''}`).join('\n\n')}

=== TA MISSION ===
Recompose la sélection d'équipe (3-6 consultants) et de références (2-5) en tenant compte de l'instruction utilisateur.
Utilise EXCLUSIVEMENT les IDs fournis ci-dessus. Tu peux garder certains choix actuels si pertinents.

Réponds UNIQUEMENT avec un JSON valide (pas de markdown) :
{
  "team": [{"consultantId": "...", "roleInProposal": "...", "justification": "..."}],
  "references": [{"referenceId": "...", "relevance": "..."}]
}`;

    this.logger.log(`Claude regenerate team for tender ${tenderId} with instruction`);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = this.extractText(response);
    const parsed = this.parseJson(text, 'regenerate-team');

    const validConsultantIds = new Set(consultants.map((c) => c.id));
    const validReferenceIds = new Set(references.map((r) => r.id));

    parsed.team = (parsed.team ?? []).filter((t: any) => validConsultantIds.has(t.consultantId));
    parsed.references = (parsed.references ?? []).filter((r: any) => validReferenceIds.has(r.referenceId));

    const existing = await this.getOrCreate(cabinetId, tenderId);
    await this.prisma.tenderProposal.update({
      where: { id: existing.id },
      data: {
        selectedTeam: parsed.team,
        selectedRefs: parsed.references,
        tokensUsed: { increment: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0) },
      },
    });

    return { team: parsed.team, references: parsed.references };
  }

  /** Régénère une section de texte (understanding, methodology, planning) avec instruction */
  async regenerateTextSection(
    cabinetId: string,
    tenderId: string,
    section: 'understanding' | 'methodology' | 'planning',
    instruction: string,
    targetedPassage?: string,
  ) {
    const { tender } = await this.buildContext(cabinetId, tenderId);
    const currentProposal = await this.prisma.tenderProposal.findUnique({
      where: { tenderId },
    });
    if (!currentProposal) {
      throw new BadRequestException('Proposition non trouvée. Génère-la d\'abord.');
    }

    const currentContent = currentProposal[section];
    if (!currentContent) {
      throw new BadRequestException(
        `Section ${section} vide. Utilise d\'abord la génération initiale.`,
      );
    }

    const sectionLabels = {
      understanding: 'Compréhension du projet',
      methodology: 'Méthodologie',
      planning: 'Planning prévisionnel',
    };

    const targetedBlock = targetedPassage
      ? `\n\n=== PASSAGE À MODIFIER EN PRIORITÉ ===\n"""\n${targetedPassage}\n"""\n\nApplique l'instruction surtout à ce passage. Garde le reste cohérent mais évite de le réécrire inutilement.`
      : '\n\nRéécris l\'intégralité de la section en tenant compte de l\'instruction.';

    const analysisContext = tender.analysis
      ? `\n\n=== ANALYSE DCE (pour contexte) ===\n${tender.analysis.summary ?? ''}`
      : '';

    const prompt = `Tu es un expert en rédaction de propositions techniques pour cabinets d'audit.

=== APPEL D'OFFRES ===
Titre : ${tender.title}
Client : ${tender.clientName ?? 'n/a'}
Pays : ${tender.country ?? 'n/a'}
Secteur : ${tender.sector ?? 'n/a'}${analysisContext}

=== CONTENU ACTUEL DE LA SECTION "${sectionLabels[section]}" ===
${currentContent}

=== INSTRUCTION UTILISATEUR ===
${instruction}${targetedBlock}

=== TA MISSION ===
Produis une version révisée complète de la section "${sectionLabels[section]}" en markdown, en tenant compte de l'instruction.
- Conserve la qualité et la structure professionnelle
- Utilise ## pour les sous-titres, - pour les listes, **gras** pour les emphases
- Ne produis que le markdown de la section, rien d'autre (pas de préambule)

Réponds UNIQUEMENT avec un JSON valide :
{
  "content": "Le markdown révisé ici..."
}`;

    this.logger.log(`Claude regenerate ${section} for tender ${tenderId}`);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = this.extractText(response);
    const parsed = this.parseJson(text, `regenerate-${section}`);

    if (!parsed.content) {
      throw new Error('Claude n\'a pas renvoyé de contenu');
    }

    await this.prisma.tenderProposal.update({
      where: { id: currentProposal.id },
      data: {
        [section]: parsed.content,
        tokensUsed: { increment: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0) },
      },
    });

    return { content: parsed.content };
  }

}
