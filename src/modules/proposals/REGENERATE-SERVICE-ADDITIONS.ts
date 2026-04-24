// ============================================================
// MÉTHODES DE RÉGÉNÉRATION CIBLÉE
// À ajouter dans proposals.service.ts, avant la dernière accolade `}` de la classe
// ============================================================

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
