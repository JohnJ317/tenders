/**
 * 6 templates par défaut pour cabinets d'audit francophones en Afrique de l'Ouest.
 * Couvre 90% des AO rencontrés : audit financier, commissariat aux comptes,
 * passation de marchés, conseil/étude, audit IT, formation.
 */

export interface DefaultTemplate {
  code: string;
  label: string;
  description: string;
  typicalTeamSize: number;
  typicalDurationMonths: number;
  understandingPrompt: string;
  methodologyPrompt: string;
  planningPrompt: string;
  teamPrompt: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  // ============================================================
  // 1. AUDIT FINANCIER
  // ============================================================
  {
    code: 'audit_financier',
    label: 'Audit financier',
    description: 'Audit des états financiers selon les normes IFRS, IPSAS ou OHADA. Inclut revue du contrôle interne, tests substantifs et certification.',
    typicalTeamSize: 5,
    typicalDurationMonths: 4,
    understandingPrompt: `Rédige la compréhension du projet pour un AUDIT FINANCIER.
Axe-toi sur :
- Les enjeux de fiabilité et de sincérité des états financiers
- Le référentiel comptable applicable (IFRS, IPSAS, OHADA, SYSCOHADA)
- Les zones à risque typiques du secteur du client
- Les contraintes réglementaires (Commissaire aux Comptes, ACPR, BCEAO selon cas)
- La valeur ajoutée au-delà de la certification : recommandations d'amélioration du contrôle interne

Évite les généralités — cite explicitement le référentiel, les standards ISA/ISQC, et les spécificités sectorielles.`,

    methodologyPrompt: `Rédige la méthodologie d'un AUDIT FINANCIER en 4 phases :

**Phase 1 — Prise de connaissance et planification** (ISA 315)
- Compréhension de l'entité, de son environnement et du contrôle interne
- Identification et évaluation des risques d'anomalies significatives
- Détermination du seuil de matérialité
- Livrable : note d'orientation

**Phase 2 — Évaluation du contrôle interne** (ISA 330)
- Tests de conception et d'efficacité des contrôles clés
- Walk-throughs sur les cycles significatifs (ventes, achats, paie, trésorerie, immobilisations)
- Livrable : cartographie des risques + lettre de recommandations

**Phase 3 — Contrôle des comptes** (ISA 500 et suivantes)
- Procédures substantives (tests de détail + revue analytique)
- Circularisations (clients, fournisseurs, banques, avocats)
- Tests sur les comptes significatifs et à risque élevé
- Revue événements post-clôture

**Phase 4 — Synthèse et rapport** (ISA 700)
- Travaux de synthèse
- Revue par l'associé signataire
- Émission du rapport d'audit (opinion avec ou sans réserve)
- Livrable : rapport d'audit certifié + lettre de recommandations

Mentionne explicitement les normes ISA applicables à chaque phase. Structure en markdown avec ## pour les phases, - pour les livrables.`,

    planningPrompt: `Planning d'un AUDIT FINANCIER :
- Phase 1 (Planification) : 10-15% du temps total, généralement 2-3 semaines
- Phase 2 (Contrôle interne) : 25-30% du temps, 3-4 semaines
- Phase 3 (Contrôle des comptes - AUDIT FINAL) : 40-45% du temps, intervention pré-clôture et post-clôture
- Phase 4 (Synthèse et rapport) : 15-20% du temps

Inclus :
- Un tableau markdown phases/durées/livrables/jalons
- Les comités de pilotage : kick-off, revue intermédiaire, restitution finale
- La répartition jours-hommes par profil (associé, manager, senior, junior)
- Les dates clés en fonction de la date de clôture des comptes`,

    teamPrompt: `Équipe type pour un AUDIT FINANCIER :
- 1 Associé signataire (commissaire aux comptes ou équivalent, 15+ ans exp)
- 1 Manager d'audit (chef de mission, 8-12 ans exp)
- 1-2 Auditeurs seniors (4-7 ans exp)
- 1-2 Auditeurs juniors (1-3 ans exp)

Privilégie :
- La séniorité de l'associé signataire (crédibilité vis-à-vis du bailleur)
- Un manager ayant déjà audité le même secteur (banque, santé, éducation, etc.)
- Au moins 1 auditeur maîtrisant le référentiel comptable applicable
- La diversité (genre, expérience) quand c'est un critère de l'AO`,
  },

  // ============================================================
  // 2. COMMISSARIAT AUX COMPTES
  // ============================================================
  {
    code: 'commissariat',
    label: 'Commissariat aux comptes',
    description: 'Mission légale de certification des comptes annuels (mandat pluriannuel 3-6 ans). Obligations spécifiques au commissariat OHADA.',
    typicalTeamSize: 4,
    typicalDurationMonths: 3,
    understandingPrompt: `Rédige la compréhension d'un mandat de COMMISSARIAT AUX COMPTES.
Axe-toi sur :
- Le caractère LÉGAL et pluriannuel de la mission (mandat 3 ou 6 ans OHADA)
- Les obligations propres au CAC : certification annuelle, alerte, signalement, information des actionnaires
- Le référentiel SYSCOHADA révisé ou IFRS selon l'entité
- La relation tripartite (entité / CAC / actionnaires)
- La continuité d'exploitation (cruciale pour les entités en difficulté)
- L'indépendance et la rotation du CAC

Insiste sur la différence AVEC un audit contractuel : le CAC a un rôle légal, il informe les actionnaires et signale les irrégularités.`,

    methodologyPrompt: `Méthodologie d'un COMMISSARIAT AUX COMPTES OHADA :

**Phase 1 — Acceptation et planification initiale** (ISA 210)
- Lettre de mission conforme au cadre OHADA
- Déclaration d'indépendance (Code d'éthique)
- Prise de connaissance approfondie de l'entité
- Plan de mission pluriannuel

**Phase 2 — Travaux de contrôle permanents**
- Revue du système de contrôle interne
- Assistance aux inventaires physiques
- Contrôles intercalaires trimestriels ou semestriels
- Revue des procès-verbaux des organes sociaux

**Phase 3 — Contrôle annuel des comptes** (ISA 330)
- Tests substantifs sur les comptes significatifs
- Circularisations systématiques
- Revue des engagements hors bilan
- Analyse de la continuité d'exploitation (OHADA article 150+)

**Phase 4 — Rapports légaux**
- Rapport général sur les comptes annuels
- Rapport spécial sur les conventions réglementées (art. 440 AUSCGIE)
- Rapport sur les rémunérations des dirigeants si applicable
- Procédure d'alerte si dégradation (art. 150 à 156 AUSC)

**Phase 5 — Assemblée générale**
- Présentation et lecture des rapports
- Réponses aux questions des actionnaires

Structure markdown. Cite explicitement les articles OHADA (AUSCGIE, AUPSRVE).`,

    planningPrompt: `Planning d'un COMMISSARIAT AUX COMPTES (cycle annuel) :

Respecter les obligations légales :
- **Contrôles intercalaires** : à réaliser 2-4 fois par an (mission permanente)
- **Contrôle annuel** : à concentrer entre la fin d'exercice et la date d'AG (3-4 mois)
- **Rapports légaux** : délai de 15 jours avant l'AG pour communication aux actionnaires (OHADA)

Inclus :
- Un chronogramme sur 12 mois avec les points de contrôle trimestriels
- Les travaux pré-clôture (octobre-novembre si exercice calendaire)
- Les travaux post-clôture (janvier-mars)
- La date d'émission des rapports (15 jours avant l'AG)
- Si mandat 3 ou 6 ans : montrer l'évolution et la planification annuelle
- Répartition jours-hommes sur l'année`,

    teamPrompt: `Équipe type pour un COMMISSARIAT AUX COMPTES OHADA :
- 1 Associé Commissaire aux Comptes INSCRIT À L'ORDRE (OBLIGATOIRE, signataire)
- 1 Manager expérimenté (chef de mission, 8+ ans)
- 1-2 Auditeurs seniors (4-7 ans)
- 1 Auditeur junior éventuel

EXIGENCE LÉGALE : l'associé signataire DOIT être inscrit à l'Ordre des Experts-Comptables et Commissaires aux Comptes (OECCA ou équivalent national).

Privilégie :
- Un associé avec mandat en cours (expérience récurrente)
- Un manager maîtrisant OHADA et le secteur (banque = BCEAO spécifique)
- La continuité d'équipe sur la durée du mandat (stabilité)
- Respecter la règle d'indépendance : pas de lien avec l'entité auditée`,
  },

  // ============================================================
  // 3. PASSATION DE MARCHÉS
  // ============================================================
  {
    code: 'passation_marches',
    label: 'Audit de passation de marchés',
    description: "Audit indépendant de la passation des marchés d'un projet financé par un bailleur (BAD, BM, AFD, UE). Contrôle conformité aux procédures du bailleur et code national.",
    typicalTeamSize: 4,
    typicalDurationMonths: 3,
    understandingPrompt: `Rédige la compréhension d'un AUDIT DE PASSATION DE MARCHÉS.
Axe-toi sur :
- Le double référentiel applicable : **procédures du bailleur** (Banque Mondiale, BAD, AFD, UE) ET code national des marchés publics
- L'objectif : attester la régularité, l'économie et l'efficacité des marchés passés
- Les enjeux : éligibilité des dépenses au financement, continuation du décaissement
- Le type de marché audité : travaux, fournitures, services, consultants (IC et CFS)
- Les méthodes de passation : AOI, AON, AOR, SFQC, SFQ, QC, ED (directive BM)
- Les risques : fractionnement, conflit d'intérêts, non-conformité CV, irrégularités d'évaluation

Cite explicitement le bailleur et ses directives (ex: "Directives BM 2016 révisées", "Règles et procédures de la BAD édition 2015").`,

    methodologyPrompt: `Méthodologie d'un AUDIT DE PASSATION DE MARCHÉS :

**Phase 1 — Prise de connaissance du projet et du plan de passation**
- Revue du document d'évaluation du projet (PAD pour BM, PEP pour BAD)
- Analyse du Plan de Passation des Marchés (PPM) approuvé
- Identification du périmètre : marchés à auditer (tous ou par échantillonnage)
- Compréhension du système de passation (manuel de procédures du projet)

**Phase 2 — Échantillonnage et tests de conformité**
- Sélection des dossiers sur critères : montant, méthode, sensibilité
- Pour chaque marché : revue complète du dossier (DAO → contrat → exécution)
- Tests de conformité aux directives du bailleur
- Tests de conformité au code national
- Vérification des seuils, avis de non-objection, publications

**Phase 3 — Analyse des résultats et quantification**
- Classement des non-conformités : majeures / mineures / observations
- Impact potentiel sur l'éligibilité des dépenses
- Analyse des tendances (récurrence, zones à risque)
- Chiffrage des montants non éligibles le cas échéant

**Phase 4 — Rapport d'audit**
- Rapport conforme au template du bailleur
- Opinion sur la régularité des marchés
- Liste des non-conformités avec actions correctives
- Recommandations pour renforcer le dispositif

Structure markdown. Cite les directives exactes du bailleur (numéros d'articles).`,

    planningPrompt: `Planning d'un AUDIT DE PASSATION DE MARCHÉS :

- Phase 1 (Planification) : 2 semaines
- Phase 2 (Tests terrain) : 4-6 semaines selon volume de marchés
- Phase 3 (Analyse) : 1-2 semaines
- Phase 4 (Rapport) : 2 semaines incluant aller-retour avec le bailleur

Inclus :
- Un tableau phases/activités/durée/livrables
- Les étapes de validation : rapport draft → commentaires client → rapport final → revue bailleur
- Les missions sur le terrain (si implantations régionales)
- Répartition jours-hommes par profil
- Les jalons clés du bailleur (date limite pour rapport annuel)`,

    teamPrompt: `Équipe type pour un AUDIT DE PASSATION DE MARCHÉS :
- 1 Expert Senior en passation de marchés publics (CHEF DE MISSION, 15+ ans exp, certifié si possible)
- 1 Expert junior en passation (3-5 ans exp)
- 1 Auditeur financier senior (pour la partie conformité dépenses)
- 1 Juriste des marchés publics (consultation pour cas complexes)

PROFIL CRUCIAL : l'expert senior doit avoir **une expérience confirmée des procédures du bailleur concerné** (BM, BAD, AFD, UE). Les procédures diffèrent significativement d'un bailleur à l'autre.

Privilégie :
- Un chef de mission ayant déjà audité des projets du même bailleur
- Une expérience sur des projets de taille et de complexité similaires
- La connaissance du code national des marchés publics du pays
- Si l'AO exige des certifications (ex: CIPS, CPPS), les mettre en avant`,
  },

  // ============================================================
  // 4. CONSEIL / ÉTUDE STRATÉGIQUE
  // ============================================================
  {
    code: 'conseil',
    label: 'Conseil / Étude',
    description: "Mission de conseil stratégique, étude de faisabilité, audit organisationnel, évaluation de projet. Travaux d'analyse et de recommandations plus libres dans leur méthodologie.",
    typicalTeamSize: 4,
    typicalDurationMonths: 5,
    understandingPrompt: `Rédige la compréhension d'une mission de CONSEIL / ÉTUDE.
Axe-toi sur :
- La problématique précise posée par le client (reformule-la)
- Le contexte institutionnel et sectoriel
- Les parties prenantes (client direct, bénéficiaires, bailleurs, autorités)
- Les livrables attendus : rapport, plan d'action, outils, recommandations
- Le positionnement de la mission dans une stratégie plus large (si applicable)
- Les facteurs clés de succès et risques identifiés

Insiste sur la VALEUR AJOUTÉE concrète : quels changements après votre mission ? Quels indicateurs d'impact ?`,

    methodologyPrompt: `Méthodologie d'une mission de CONSEIL / ÉTUDE en 4-5 phases :

**Phase 1 — Cadrage et diagnostic**
- Cadrage avec le client (note de cadrage validée)
- Analyse documentaire approfondie
- Entretiens avec les parties prenantes clés
- Diagnostic initial et hypothèses de travail
- Livrable : rapport de diagnostic

**Phase 2 — Analyse et benchmark**
- Approfondissement des axes identifiés
- Analyse quantitative (données disponibles + enquêtes si nécessaire)
- Benchmark international / régional
- Analyse des bonnes pratiques
- Livrable : rapport intermédiaire d'analyse

**Phase 3 — Élaboration des recommandations**
- Construction des scénarios / options stratégiques
- Évaluation multicritères (faisabilité, coût, impact, délai)
- Priorisation et séquencement
- Livrable : note de recommandations

**Phase 4 — Plan d'action et outils**
- Plan d'action détaillé (quoi, qui, quand, combien)
- Indicateurs de suivi
- Outils opérationnels (procédures, modèles, checklists)
- Livrable : plan d'action + kit d'outils

**Phase 5 — Restitution et appropriation**
- Atelier de restitution auprès des parties prenantes
- Transfert de compétences si applicable
- Rapport final intégrant les observations

Approche participative et itérative. Structure markdown avec phases, méthodes, livrables.`,

    planningPrompt: `Planning d'une mission de CONSEIL / ÉTUDE :

Répartition type :
- Phase 1 (Cadrage/Diagnostic) : 20%
- Phase 2 (Analyse/Benchmark) : 30%
- Phase 3 (Recommandations) : 20%
- Phase 4 (Plan d'action) : 15%
- Phase 5 (Restitution) : 15%

Inclus :
- Tableau markdown des phases avec jalons de validation client à chaque étape
- Comités de pilotage à fréquence bimensuelle
- Ateliers participatifs avec les parties prenantes
- Missions terrain si applicable (région, décentralisation)
- Répartition jours-hommes
- Date de restitution finale`,

    teamPrompt: `Équipe type pour une mission de CONSEIL / ÉTUDE :
- 1 Associé / Expert senior (chef de mission, 15+ ans exp)
- 1 Consultant confirmé (5-10 ans, expertise spécialisée selon le sujet)
- 1-2 Consultants (2-5 ans)
- 1 Analyste / junior

Privilégie :
- Une expertise SPÉCIFIQUE au sujet (santé publique, éducation, numérique, etc.)
- Des consultants ayant réalisé des études similaires (même secteur, même client type)
- Un chef de mission reconnu pour la qualité de ses rapports et présentations
- Si l'AO mentionne une approche participative : expérience en facilitation d'ateliers`,
  },

  // ============================================================
  // 5. AUDIT IT / CYBERSÉCURITÉ
  // ============================================================
  {
    code: 'audit_it',
    label: 'Audit informatique / Cybersécurité',
    description: "Audit des systèmes d'information, de la posture cybersécurité, ou des projets IT. Inclut tests d'intrusion, revue des accès, conformité RGPD/UEMOA.",
    typicalTeamSize: 4,
    typicalDurationMonths: 3,
    understandingPrompt: `Rédige la compréhension d'un AUDIT IT / CYBERSÉCURITÉ.
Axe-toi sur :
- Le périmètre technique : SI complet, applications métiers, infrastructures, cloud, endpoints
- Les référentiels applicables : ISO 27001/27002, NIST CSF, COBIT 5/2019
- Les enjeux réglementaires : RGPD, loi sur la protection des données UEMOA, cadre BCEAO pour les banques
- Les menaces actuelles : ransomware, ingénierie sociale, fuite de données, attaques sur la chaîne d'approvisionnement
- Les spécificités sectorielles (banque = PCI DSS, opérateurs = exigences ARTCI/ARCEP)

Mentionne la maturité cybersécurité mesurable (score 0-100 ou niveaux 1-5).`,

    methodologyPrompt: `Méthodologie d'un AUDIT IT / CYBERSÉCURITÉ :

**Phase 1 — Cadrage et analyse de risques**
- Cadrage technique et fonctionnel
- Analyse de risques méthode EBIOS RM ou ISO 27005
- Identification des actifs critiques
- Matrice de probabilité/impact
- Livrable : note de cadrage + cartographie des risques

**Phase 2 — Revue de gouvernance et organisationnelle**
- Revue documentaire (politiques, procédures, PSSI)
- Entretiens DSI, RSSI, responsables métiers
- Revue des rôles et responsabilités
- Analyse de conformité aux référentiels
- Livrable : diagnostic gouvernance

**Phase 3 — Audit technique**
- Audit des configurations (systèmes, réseaux, applications)
- Revue des accès (comptes privilégiés, séparation des tâches)
- Audit des sauvegardes et de la continuité d'activité
- Tests d'intrusion (externe, interne, applicatif)
- Revue de la sécurité du code si applicable
- Livrable : rapport technique détaillé

**Phase 4 — Synthèse et plan de remédiation**
- Consolidation des vulnérabilités
- Classification : critique / élevée / moyenne / faible
- Scoring de maturité (0-100 ou niveau 1-5)
- Plan de remédiation priorisé (quick wins + mesures structurantes)
- Livrable : rapport exécutif + plan d'action

Structure markdown. Cite explicitement CVE, CWE, OWASP Top 10 quand pertinent.`,

    planningPrompt: `Planning d'un AUDIT IT / CYBERSÉCURITÉ :

- Phase 1 (Cadrage) : 1-2 semaines
- Phase 2 (Gouvernance) : 2-3 semaines
- Phase 3 (Technique + pentest) : 3-5 semaines (le pentest seul prend 2-3 semaines)
- Phase 4 (Synthèse) : 2 semaines

Inclus :
- Tableau des phases
- Planning détaillé du pentest (reconnaissance, scan, exploitation, post-exploitation)
- Créneaux de réunions avec DSI/RSSI
- Restitution exécutive (COMEX) + technique (DSI)
- Répartition jours-hommes par profil`,

    teamPrompt: `Équipe type pour un AUDIT IT / CYBERSÉCURITÉ :
- 1 Associé / Expert senior cyber (chef de mission, 15+ ans exp, certifié CISA/CISSP/CISM)
- 1 Auditeur cyber confirmé (pentester, 5-10 ans exp, certifications offensives type OSCP, CEH)
- 1-2 Auditeurs cyber (3-5 ans, compétences SI, réseau, AD)
- 1 Consultant gouvernance/conformité (connaissance ISO 27001, RGPD)

CERTIFICATIONS VALORISÉES :
- Gouvernance : CISA, CISM, ISO 27001 Lead Auditor
- Offensif : OSCP, OSEP, CEH, PNPT
- Cloud : CCSK, AWS/Azure security specialty

Privilégie :
- Un chef de mission CISA + expérience sectorielle (banque, télécom, administration)
- Au moins UN pentester certifié si pentest est demandé
- Des consultants ayant audité des SI similaires (taille, secteur, technologies)`,
  },

  // ============================================================
  // 6. FORMATION / RENFORCEMENT DE CAPACITÉS
  // ============================================================
  {
    code: 'formation',
    label: 'Formation / Renforcement de capacités',
    description: "Conception et animation de formations, ingénierie pédagogique, renforcement de compétences d'une équipe ou institution.",
    typicalTeamSize: 3,
    typicalDurationMonths: 4,
    understandingPrompt: `Rédige la compréhension d'une mission de FORMATION / RENFORCEMENT DE CAPACITÉS.
Axe-toi sur :
- Les besoins exprimés ET les besoins latents (diagnostic des compétences réelles)
- Le public cible : nombre, profils, niveaux de maturité, disponibilité
- Les contraintes : linguistique, géographique, pédagogique, budgétaire
- Les modalités possibles : présentiel, distanciel, hybride, e-learning
- Les livrables attendus : supports, manuels, plateforme, certification
- L'impact visé : transfert de compétences effectif et pérenne

Insiste sur la différence entre former (donner des connaissances) et renforcer les capacités (changer des pratiques durablement).`,

    methodologyPrompt: `Méthodologie d'une mission de FORMATION / RENFORCEMENT DE CAPACITÉS :

**Phase 1 — Ingénierie pédagogique**
- Analyse des besoins de formation (enquête, entretiens, tests de positionnement)
- Définition des objectifs pédagogiques (niveaux de Bloom)
- Conception du parcours pédagogique
- Choix des modalités (présentiel, e-learning, classe virtuelle, blended)
- Livrable : plan de formation + cahier pédagogique

**Phase 2 — Conception des contenus**
- Conception des supports (manuels, slides, exercices, études de cas)
- Production de ressources multimédias si applicable
- Validation pédagogique interne
- Test pilote si pertinent
- Livrables : modules de formation complets

**Phase 3 — Animation / Déploiement**
- Animation des sessions (présentiel ou distanciel)
- Suivi de la participation et de l'engagement
- Exercices pratiques et mise en situation
- Évaluation à chaud (satisfaction, acquis)
- Livrables : sessions tenues + feuilles de présence + évaluations

**Phase 4 — Évaluation à froid et pérennisation**
- Évaluation du transfert en situation professionnelle (Kirkpatrick niveau 3)
- Mesure d'impact sur les pratiques (Kirkpatrick niveau 4 si budget)
- Recommandations pour ancrage durable
- Formation de formateurs internes (ToT) si applicable
- Livrable : rapport d'évaluation + plan de pérennisation

Référentiels : Kirkpatrick, Bloom, ADDIE. Structure markdown.`,

    planningPrompt: `Planning d'une mission de FORMATION :

- Phase 1 (Ingénierie) : 20% (analyse + conception pédagogique)
- Phase 2 (Production) : 30% (supports, multimédia)
- Phase 3 (Animation) : 30% (sessions)
- Phase 4 (Évaluation) : 20% (à froid + rapport)

Inclus :
- Calendrier des sessions (dates, lieux, groupes)
- Répartition présentiel/distanciel
- Charge de préparation vs animation vs évaluation
- Validation des supports avant déploiement
- Dates des évaluations à chaud et à froid
- Répartition jours-hommes ingénieur pédagogique / formateurs / experts métiers`,

    teamPrompt: `Équipe type pour une mission de FORMATION :
- 1 Directeur pédagogique (chef de mission, 15+ ans en ingénierie de formation)
- 1-2 Formateurs experts (métier spécifique : audit, finance, marchés publics, numérique...)
- 1 Ingénieur pédagogique (conception, scénarisation)
- 1 Coordinateur logistique si sessions multi-sites

Privilégie :
- Des formateurs avec **double expertise** : métier ET animation pédagogique
- Une expérience CONFIRMÉE sur le public cible (cadres / agents / dirigeants)
- Des certifications pédagogiques (formateur certifié, Kirkpatrick)
- La capacité à produire rapidement des supports de qualité
- La maîtrise des outils e-learning (Moodle, Articulate) si distanciel`,
  },
];
