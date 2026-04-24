import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaudeUsageService } from '../../common/platform/claude-usage.service';
import { StorageService } from '../../common/storage/storage.service';

/**
 * Service d'analyse des AO par Claude API.
 *
 * Workflow :
 *  1. Récupère les documents DCE attachés au Tender
 *  2. Télécharge les PDF depuis MinIO
 *  3. Extrait le texte (via pdf-parse)
 *  4. Envoie à Claude Haiku avec un prompt structuré
 *  5. Parse la réponse JSON et sauve dans TenderAnalysis
 */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly anthropic: Anthropic | null;
  private readonly model: string;

  /** Tarification Claude Haiku 4.5 : $1/M input, $5/M output */
  private readonly COST_PER_INPUT_TOKEN = 1 / 1_000_000;
  private readonly COST_PER_OUTPUT_TOKEN = 5 / 1_000_000;

  /** Limite de texte envoyé pour éviter de dépasser la fenêtre de contexte */
  private readonly MAX_INPUT_CHARS = 400_000; // ~100k tokens

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly usageService: ClaudeUsageService,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
      this.logger.log(`Claude API configuré — modèle : ${this.model}`);
    } else {
      this.anthropic = null;
      this.logger.warn(
        'ANTHROPIC_API_KEY non défini — l\'analyse par Claude sera désactivée',
      );
    }
  }

  /** Point d'entrée principal : analyse un AO. */
  async analyzeTender(tenderId: string): Promise<any> {
    if (!this.anthropic) {
      throw new BadRequestException(
        'Claude API non configuré. Ajoute ANTHROPIC_API_KEY dans .env.',
      );
    }

    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: { documents: true },
    });
    if (!tender) throw new NotFoundException('AO introuvable');

    if (tender.documents.length === 0) {
      throw new BadRequestException(
        'Aucun document attaché à cet AO. Uploade un DCE (PDF) avant d\'analyser.',
      );
    }

    // Marquer RUNNING dès le début pour montrer l'état à l'UI
    await this.prisma.tenderAnalysis.upsert({
      where: { tenderId },
      update: { status: 'RUNNING', errorMessage: null },
      create: {
        tenderId,
        status: 'RUNNING',
        modelUsed: this.model,
        documentsCount: tender.documents.length,
      },
    });

    try {
      // 1. Extraire le texte de tous les PDFs
      const extracted = await this.extractTextFromDocuments(tender.documents);

      if (!extracted.text.trim()) {
        throw new Error(
          'Aucun texte extractible des documents (PDFs vides ou scannés non-OCR ?)',
        );
      }

      // 2. Tronquer si trop long (garde le début qui contient généralement l'essentiel)
      const inputText = extracted.text.slice(0, this.MAX_INPUT_CHARS);
      if (extracted.text.length > this.MAX_INPUT_CHARS) {
        this.logger.warn(
          `DCE tronqué : ${extracted.text.length} → ${this.MAX_INPUT_CHARS} caractères`,
        );
      }

      // 3. Appel à Claude
      const analysis = await this.callClaude({ title: tender.title, country: tender.country }, tenderId, tender.cabinetId, inputText);

      // 4. Sauver le résultat
      const saved = await this.prisma.tenderAnalysis.update({
        where: { tenderId },
        data: {
          status: 'COMPLETED',
          estimatedBudget: analysis.estimatedBudget ?? null,
          currency: analysis.currency ?? null,
          deadlineIso: analysis.deadline ? new Date(analysis.deadline) : null,
          country: analysis.country ?? null,
          sector: analysis.sector ?? null,
          summary: analysis.summary ?? null,
          confidence: analysis.confidence ?? null,
          inputTokens: analysis.usage.input_tokens,
          outputTokens: analysis.usage.output_tokens,
          costUsd:
            analysis.usage.input_tokens * this.COST_PER_INPUT_TOKEN
            + analysis.usage.output_tokens * this.COST_PER_OUTPUT_TOKEN,
          totalPages: extracted.totalPages,
          rawResponse: analysis.rawJson as any,
          errorMessage: null,
        },
      });

      this.logger.log(
        `Analyse ${tenderId} OK — ${analysis.usage.input_tokens}→${analysis.usage.output_tokens} tokens, coût $${saved.costUsd?.toFixed(4)}`,
      );

      return saved;
    } catch (err: any) {
      this.logger.error(`Analyse ${tenderId} échouée : ${err.message}`);
      await this.prisma.tenderAnalysis.update({
        where: { tenderId },
        data: {
          status: 'FAILED',
          errorMessage: err.message?.slice(0, 2000) ?? 'Erreur inconnue',
        },
      });
      throw err;
    }
  }

  /** Récupère l'analyse existante pour un AO. */
  async getAnalysis(tenderId: string) {
    return this.prisma.tenderAnalysis.findUnique({ where: { tenderId } });
  }

  /** Télécharge les PDF depuis MinIO et extrait leur texte. */
  private async extractTextFromDocuments(
    documents: Array<{ id: string; s3Key: string; filename: string; sizeBytes: bigint }>,
  ): Promise<{ text: string; totalPages: number }> {
    // Import dynamique pour ne pas peupler le bundle au démarrage
    const pdfParse = (await import('pdf-parse')).default;

    let allText = '';
    let totalPages = 0;

    for (const doc of documents) {
      // On n'essaie que les PDF (autres formats pourraient être ajoutés plus tard)
      if (!doc.filename.toLowerCase().endsWith('.pdf')) {
        this.logger.debug(`Document ignoré (non-PDF) : ${doc.filename}`);
        continue;
      }

      try {
        const buffer = await this.storage.downloadAsBuffer(doc.s3Key);
        const parsed = await pdfParse(buffer);
        allText += `\n\n=== Document : ${doc.filename} (${parsed.numpages} pages) ===\n\n`;
        allText += parsed.text;
        totalPages += parsed.numpages;
      } catch (err: any) {
        this.logger.warn(
          `Impossible de parser ${doc.filename} : ${err.message}`,
        );
      }
    }

    return { text: allText, totalPages };
  }

  /** Appelle Claude avec un prompt structuré et parse la réponse JSON. */
  private async callClaude(
    tender: { title: string; country: string | null },
    tenderId: string,
    cabinetId: string,
    documentsText: string,
  ) {
    const systemPrompt = `Tu es un expert en analyse d'appels d'offres publics et privés, spécialisé dans les marchés africains francophones. Ton rôle est d'extraire des informations structurées de dossiers de consultation des entreprises (DCE) pour aider un cabinet d'audit / conseil à décider rapidement d'y répondre ou non.

Tu réponds TOUJOURS et UNIQUEMENT en JSON valide selon le schéma exact fourni, sans texte avant ni après. Tu es factuel, tu n'inventes rien. Si une information n'est pas dans le DCE, tu mets null.`;

    const userPrompt = `Analyse ce DCE et retourne un JSON avec les champs suivants :

{
  "estimatedBudget": nombre OU null (montant total du marché en devise locale, uniquement si explicitement mentionné. Si une fourchette est donnée, prends la valeur centrale.),
  "currency": string OU null ("FCFA", "EUR", "USD", etc.),
  "deadline": "YYYY-MM-DD" OU null (date limite de dépôt des offres au format ISO),
  "country": string OU null (code ISO-2 du pays d'exécution : "CI", "SN", "BF", "ML", "TG", "BJ", "NE", "CM", "GA", "CD", "MG", etc.),
  "sector": string OU null (secteur métier concerné, en français, max 60 caractères. Ex: "audit financier", "commissariat aux comptes", "conseil stratégique", "études organisationnelles"),
  "summary": string OU null (résumé en 3 lignes MAX de l'objet du marché et des attentes principales, en français, max 500 caractères),
  "confidence": "HIGH" | "MEDIUM" | "LOW" (ta confiance dans la qualité de tes extractions : HIGH = toutes infos claires dans DCE, MEDIUM = partiellement déduit, LOW = très incomplet ou ambigu)
}

Contexte de l'AO (depuis notre scraping) :
- Titre : "${tender.title}"
- Pays connu : ${tender.country ?? 'non précisé'}

=== DÉBUT DU DCE ===

${documentsText}

=== FIN DU DCE ===

Retourne UNIQUEMENT le JSON, rien d'autre.`;

    const response = await this.anthropic!.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: 0.1, // déterministe pour extraction de faits
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Log usage for platform tracking
    await this.usageService.logUsage({
      cabinetId,
      feature: 'tender:analysis',
      model: this.model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      tenderId,
    });

    // Récupère le texte de la réponse
    const textBlock = response.content.find((b: any) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Réponse Claude sans bloc de texte');
    }

    // Parse le JSON (Claude peut renvoyer avec ```json fences ou sans)
    let jsonText = textBlock.text.trim();
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    let rawJson: any;
    try {
      rawJson = JSON.parse(jsonText);
    } catch (err: any) {
      throw new Error(
        `Claude a renvoyé un JSON invalide : ${err.message}. Extrait : ${jsonText.slice(0, 200)}`,
      );
    }

    return {
      estimatedBudget: typeof rawJson.estimatedBudget === 'number' ? rawJson.estimatedBudget : null,
      currency: typeof rawJson.currency === 'string' ? rawJson.currency : null,
      deadline: typeof rawJson.deadline === 'string' ? rawJson.deadline : null,
      country: typeof rawJson.country === 'string' ? rawJson.country : null,
      sector: typeof rawJson.sector === 'string' ? rawJson.sector.slice(0, 100) : null,
      summary: typeof rawJson.summary === 'string' ? rawJson.summary.slice(0, 600) : null,
      confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(rawJson.confidence) ? rawJson.confidence : null,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      rawJson,
    };
  }
}
