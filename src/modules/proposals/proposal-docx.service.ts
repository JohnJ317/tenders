import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  PageBreak, TableOfContents, Header, Footer, PageNumber,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ProposalDocxService {
  private readonly logger = new Logger(ProposalDocxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Génère un DOCX complet de la proposition et retourne le Buffer */
  async generate(cabinetId: string, tenderId: string): Promise<Buffer> {
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, cabinetId },
      include: { cabinet: true },
    });
    if (!tender) throw new NotFoundException('AO introuvable');

    const proposal = await this.prisma.tenderProposal.findUnique({
      where: { tenderId },
    });
    if (!proposal) throw new NotFoundException('Proposition non générée');

    // Hydrate équipe + références
    const team = (proposal.selectedTeam as any[]) ?? [];
    const refs = (proposal.selectedRefs as any[]) ?? [];

    const teamHydrated = team.length > 0
      ? await this.prisma.consultant.findMany({
          where: { id: { in: team.map((t) => t.consultantId) }, cabinetId },
        })
      : [];

    const refsHydrated = refs.length > 0
      ? await this.prisma.reference.findMany({
          where: { id: { in: refs.map((r) => r.referenceId) }, cabinetId },
          include: { members: { include: { consultant: true } } },
        })
      : [];

    const doc = new Document({
      creator: tender.cabinet.name,
      title: `Proposition technique — ${tender.title}`,
      styles: {
        paragraphStyles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            run: { size: 32, bold: true, color: '0F766E' }, // teal-700
            paragraph: { spacing: { before: 400, after: 200 } },
          },
          {
            id: 'Heading2',
            name: 'Heading 2',
            run: { size: 26, bold: true, color: '115E59' },
            paragraph: { spacing: { before: 300, after: 150 } },
          },
          {
            id: 'Heading3',
            name: 'Heading 3',
            run: { size: 22, bold: true, color: '134E4A' },
            paragraph: { spacing: { before: 200, after: 100 } },
          },
        ],
      },
      sections: [
        // SECTION 1 — Page de garde
        {
          headers: { default: new Header({ children: [] }) },
          footers: { default: new Footer({ children: [] }) },
          children: this.buildCoverPage(tender, proposal),
        },
        // SECTION 2 — Sommaire + contenu
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: tender.cabinet.name,
                      size: 18,
                      color: '64748B',
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: 'Page ', size: 18, color: '64748B' }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '64748B' }),
                    new TextRun({ text: ' sur ', size: 18, color: '64748B' }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '64748B' }),
                  ],
                }),
              ],
            }),
          },
          children: [
            ...this.buildTableOfContents(),
            ...this.buildSection('1. Compréhension du projet', proposal.understanding),
            ...this.buildSection('2. Méthodologie proposée', proposal.methodology),
            ...this.buildTeamSection(team, teamHydrated),
            ...this.buildSection('4. Planning prévisionnel', proposal.planning),
            ...this.buildReferencesSection(refs, refsHydrated),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    this.logger.log(`DOCX généré pour tender ${tenderId} (${buffer.length} bytes)`);
    return buffer;
  }

  // ======================================================
  // COVER PAGE
  // ======================================================
  private buildCoverPage(tender: any, proposal: any): Paragraph[] {
    const today = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    return [
      new Paragraph({
        children: [new TextRun('')],
        spacing: { before: 2000 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'PROPOSITION TECHNIQUE',
            size: 56,
            bold: true,
            color: '0F766E',
          }),
        ],
        spacing: { after: 400 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: tender.title.toUpperCase(),
            size: 32,
            bold: true,
            color: '1E293B',
          }),
        ],
        spacing: { after: 1200 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'Soumise à',
            size: 22,
            color: '64748B',
          }),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: tender.clientName ?? '—',
            size: 28,
            bold: true,
            color: '1E293B',
          }),
        ],
        spacing: { after: 2400 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'Par',
            size: 22,
            color: '64748B',
          }),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: tender.cabinet.name,
            size: 32,
            bold: true,
            color: '0F766E',
          }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: today,
            size: 22,
            color: '64748B',
          }),
        ],
        spacing: { after: 400 },
      }),
      new Paragraph({
        children: [new PageBreak()],
      }),
    ];
  }

  // ======================================================
  // TABLE DES MATIÈRES
  // ======================================================
  private buildTableOfContents(): Paragraph[] {
    return [
      new Paragraph({
        text: 'Sommaire',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [
          new TextRun('1. Compréhension du projet'),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun('2. Méthodologie proposée'),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun('3. Équipe projet'),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun('4. Planning prévisionnel'),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun('5. Références similaires'),
        ],
        spacing: { after: 400 },
      }),
      new Paragraph({ children: [new PageBreak()] }),
    ];
  }

  // ======================================================
  // SECTION GÉNÉRIQUE (avec parsing markdown léger)
  // ======================================================
  private buildSection(heading: string, markdown: string | null): Paragraph[] {
    if (!markdown) {
      return [
        new Paragraph({ text: heading, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Section non renseignée.',
              italics: true,
              color: '94A3B8',
            }),
          ],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ];
    }

    const paragraphs: Paragraph[] = [
      new Paragraph({ text: heading, heading: HeadingLevel.HEADING_1 }),
    ];

    paragraphs.push(...this.parseMarkdown(markdown));
    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));

    return paragraphs;
  }

  // ======================================================
  // ÉQUIPE (avec tableau)
  // ======================================================
  private buildTeamSection(
    teamMeta: Array<{ consultantId: string; roleInProposal?: string; justification?: string }>,
    consultants: any[],
  ): (Paragraph | Table)[] {
    const blocks: (Paragraph | Table)[] = [
      new Paragraph({ text: '3. Équipe projet', heading: HeadingLevel.HEADING_1 }),
    ];

    if (consultants.length === 0) {
      blocks.push(new Paragraph({
        children: [new TextRun({ text: 'Équipe à sélectionner.', italics: true, color: '94A3B8' })],
      }));
      blocks.push(new Paragraph({ children: [new PageBreak()] }));
      return blocks;
    }

    blocks.push(new Paragraph({
      children: [new TextRun({
        text: `Nous mobilisons une équipe pluridisciplinaire de ${consultants.length} experts pour cette mission. Chaque profil a été retenu pour son adéquation aux exigences du cahier des charges.`,
      })],
      spacing: { after: 300 },
    }));

    // Tableau récapitulatif
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            this.headerCell('Consultant'),
            this.headerCell('Rôle'),
            this.headerCell('Expérience'),
          ],
        }),
        ...consultants.map((c) => {
          const meta = teamMeta.find((t) => t.consultantId === c.id);
          return new TableRow({
            children: [
              this.bodyCell(c.fullName),
              this.bodyCell(meta?.roleInProposal ?? c.title ?? '—'),
              this.bodyCell(`${c.yearsExperience ?? '?'} ans`),
            ],
          });
        }),
      ],
    }));

    blocks.push(new Paragraph({ spacing: { before: 400 } }));

    // Fiches détaillées
    for (const c of consultants) {
      const meta = teamMeta.find((t) => t.consultantId === c.id);
      blocks.push(new Paragraph({
        text: `${c.fullName} — ${meta?.roleInProposal ?? c.title ?? ''}`,
        heading: HeadingLevel.HEADING_2,
      }));

      if (c.title) {
        blocks.push(new Paragraph({
          children: [new TextRun({ text: c.title, italics: true, color: '64748B' })],
          spacing: { after: 100 },
        }));
      }

      if (meta?.justification) {
        blocks.push(new Paragraph({
          children: [
            new TextRun({ text: 'Justification : ', bold: true }),
            new TextRun({ text: meta.justification }),
          ],
          spacing: { after: 100 },
        }));
      }

      if (c.skills && c.skills.length > 0) {
        blocks.push(new Paragraph({
          children: [
            new TextRun({ text: 'Compétences clés : ', bold: true }),
            new TextRun({ text: c.skills.join(', ') }),
          ],
          spacing: { after: 100 },
        }));
      }

      if (c.yearsExperience) {
        blocks.push(new Paragraph({
          children: [
            new TextRun({ text: "Années d'expérience : ", bold: true }),
            new TextRun({ text: `${c.yearsExperience} ans` }),
          ],
          spacing: { after: 100 },
        }));
      }

      blocks.push(new Paragraph({ spacing: { after: 200 } }));
    }

    blocks.push(new Paragraph({ children: [new PageBreak()] }));
    return blocks;
  }

  // ======================================================
  // RÉFÉRENCES
  // ======================================================
  private buildReferencesSection(
    refsMeta: Array<{ referenceId: string; relevance?: string }>,
    references: any[],
  ): Paragraph[] {
    const paragraphs: Paragraph[] = [
      new Paragraph({ text: '5. Références similaires', heading: HeadingLevel.HEADING_1 }),
    ];

    if (references.length === 0) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: 'Références à sélectionner.', italics: true, color: '94A3B8' })],
      }));
      return paragraphs;
    }

    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: `Voici une sélection de ${references.length} missions représentatives réalisées par notre cabinet, dont le périmètre est comparable à celui de la présente mission.`,
      })],
      spacing: { after: 300 },
    }));

    for (const r of references) {
      const meta = refsMeta.find((m) => m.referenceId === r.id);

      paragraphs.push(new Paragraph({
        text: r.projectName,
        heading: HeadingLevel.HEADING_2,
      }));

      const infoLines: string[] = [];
      if (r.clientName) infoLines.push(`Client : ${r.clientName}`);
      if (r.country) infoLines.push(`Pays : ${r.country}`);
      if (r.sector) infoLines.push(`Secteur : ${r.sector}`);
      if (r.durationMonths) infoLines.push(`Durée : ${r.durationMonths} mois`);

      if (infoLines.length > 0) {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: infoLines.join(' — '), italics: true, color: '64748B' })],
          spacing: { after: 100 },
        }));
      }

      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: r.description })],
        spacing: { after: 100 },
      }));

      if (r.outcome) {
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({ text: 'Résultats : ', bold: true }),
            new TextRun({ text: r.outcome }),
          ],
          spacing: { after: 100 },
        }));
      }

      if (meta?.relevance) {
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({ text: 'Pertinence pour cette mission : ', bold: true, color: '0F766E' }),
            new TextRun({ text: meta.relevance, color: '0F766E' }),
          ],
          spacing: { after: 100 },
        }));
      }

      paragraphs.push(new Paragraph({ spacing: { after: 300 } }));
    }

    return paragraphs;
  }

  // ======================================================
  // PARSING MARKDOWN minimaliste
  // ======================================================
  private parseMarkdown(md: string): Paragraph[] {
    const lines = md.split('\n');
    const paragraphs: Paragraph[] = [];

    let currentListItems: Paragraph[] | null = null;

    const flushList = () => {
      if (currentListItems) {
        paragraphs.push(...currentListItems);
        currentListItems = null;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) {
        flushList();
        paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
        continue;
      }

      // Headings
      if (line.startsWith('### ')) {
        flushList();
        paragraphs.push(new Paragraph({
          text: line.slice(4),
          heading: HeadingLevel.HEADING_3,
        }));
        continue;
      }
      if (line.startsWith('## ')) {
        flushList();
        paragraphs.push(new Paragraph({
          text: line.slice(3),
          heading: HeadingLevel.HEADING_2,
        }));
        continue;
      }
      if (line.startsWith('# ')) {
        flushList();
        paragraphs.push(new Paragraph({
          text: line.slice(2),
          heading: HeadingLevel.HEADING_2,
        }));
        continue;
      }

      // Listes
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!currentListItems) currentListItems = [];
        currentListItems.push(new Paragraph({
          children: this.parseInline(line.slice(2)),
          bullet: { level: 0 },
        }));
        continue;
      }

      // Tables markdown (basique)
      if (line.includes('|') && line.split('|').length >= 3) {
        flushList();
        // Ignore les lignes de séparation |---|---|
        if (/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line)) continue;

        const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: cells.join(' | '), size: 20 })],
          spacing: { after: 50 },
        }));
        continue;
      }

      // Paragraphe normal
      flushList();
      paragraphs.push(new Paragraph({
        children: this.parseInline(line),
        spacing: { after: 100 },
      }));
    }

    flushList();
    return paragraphs;
  }

  /** Parse gras **texte** et italique *texte* basiques */
  private parseInline(text: string): TextRun[] {
    const runs: TextRun[] = [];
    const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        runs.push(new TextRun({ text: text.slice(lastIdx, match.index) }));
      }
      if (match[2]) {
        runs.push(new TextRun({ text: match[2], bold: true }));
      } else if (match[3]) {
        runs.push(new TextRun({ text: match[3], italics: true }));
      }
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < text.length) {
      runs.push(new TextRun({ text: text.slice(lastIdx) }));
    }

    return runs.length > 0 ? runs : [new TextRun({ text })];
  }

  private headerCell(text: string): TableCell {
    return new TableCell({
      shading: { fill: '0F766E' },
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20 })],
        }),
      ],
      borders: this.cellBorders(),
    });
  }

  private bodyCell(text: string): TableCell {
    return new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, size: 20 })],
        }),
      ],
      borders: this.cellBorders(),
    });
  }

  private cellBorders() {
    const b = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
    return { top: b, bottom: b, left: b, right: b };
  }
}
