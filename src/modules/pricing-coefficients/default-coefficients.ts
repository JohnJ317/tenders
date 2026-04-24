import { PricingCoefficientCategory } from '@prisma/client';

/**
 * Coefficients standards du métier audit/EC.
 * Tous créés avec isSystem=true au seed d'un nouveau cabinet.
 * Le cabinet peut les modifier ou les désactiver, mais pas les supprimer.
 *
 * Multiplicateur = 1.00 → neutre ; > 1.00 = majoration ; < 1.00 = minoration.
 */
export const DEFAULT_COEFFICIENTS: Array<{
  code: string;
  label: string;
  category: PricingCoefficientCategory;
  multiplier: number;
  description?: string;
  sortOrder: number;
}> = [
  // === SECTEUR ===
  {
    code: 'SECTOR_STANDARD', label: 'Secteur standard',
    category: 'SECTOR', multiplier: 1.00, sortOrder: 10,
  },
  {
    code: 'SECTOR_BANK_INSURANCE', label: 'Banque / Assurance',
    category: 'SECTOR', multiplier: 1.25, sortOrder: 11,
    description: 'Secteur fortement réglementé — conformité BCEAO/CIMA, procédures renforcées',
  },
  {
    code: 'SECTOR_PUBLIC', label: 'Secteur public',
    category: 'SECTOR', multiplier: 1.15, sortOrder: 12,
    description: 'Administrations, collectivités — procédures marchés publics',
  },
  {
    code: 'SECTOR_NGO_DONOR', label: 'Projet financé bailleur',
    category: 'SECTOR', multiplier: 1.20, sortOrder: 13,
    description: 'BM, BAD, UE, AFD — normes comptables et audit strictes',
  },
  {
    code: 'SECTOR_INDUSTRY', label: 'Industrie',
    category: 'SECTOR', multiplier: 1.10, sortOrder: 14,
  },
  {
    code: 'SECTOR_TELECOM', label: 'Télécom / Médias',
    category: 'SECTOR', multiplier: 1.12, sortOrder: 15,
  },

  // === COMPLEXITÉ ===
  {
    code: 'COMPLEXITY_SIMPLE', label: 'Mission simple (PME mono-site)',
    category: 'COMPLEXITY', multiplier: 0.90, sortOrder: 20,
  },
  {
    code: 'COMPLEXITY_STANDARD', label: 'Complexité standard',
    category: 'COMPLEXITY', multiplier: 1.00, sortOrder: 21,
  },
  {
    code: 'COMPLEXITY_HIGH', label: 'Groupe multi-filiales',
    category: 'COMPLEXITY', multiplier: 1.15, sortOrder: 22,
  },
  {
    code: 'COMPLEXITY_VERY_HIGH', label: 'Consolidation complexe multi-pays',
    category: 'COMPLEXITY', multiplier: 1.30, sortOrder: 23,
    description: 'Plusieurs entités dans plusieurs pays UEMOA/CEMAC ou international',
  },

  // === URGENCE ===
  {
    code: 'URGENCY_NORMAL', label: 'Délai standard',
    category: 'URGENCY', multiplier: 1.00, sortOrder: 30,
  },
  {
    code: 'URGENCY_TIGHT', label: 'Délai serré',
    category: 'URGENCY', multiplier: 1.10, sortOrder: 31,
    description: 'Mobilisation accélérée de l\'équipe',
  },
  {
    code: 'URGENCY_RUSH', label: 'Mission express',
    category: 'URGENCY', multiplier: 1.25, sortOrder: 32,
    description: 'Heures sup obligatoires, priorité absolue',
  },

  // === RÉCURRENCE ===
  {
    code: 'RECURRENCE_FIRST', label: 'Première mission (setup référentiel)',
    category: 'RECURRENCE', multiplier: 1.15, sortOrder: 40,
    description: 'Charge année 1 plus élevée : prise de connaissance, cartographie SI, constitution dossier',
  },
  {
    code: 'RECURRENCE_NORMAL', label: 'Mission récurrente',
    category: 'RECURRENCE', multiplier: 1.00, sortOrder: 41,
  },
  {
    code: 'RECURRENCE_FOLLOW_UP', label: 'Suite de mission précédente',
    category: 'RECURRENCE', multiplier: 0.95, sortOrder: 42,
    description: 'Économie sur la prise de connaissance',
  },

  // === STRATÉGIQUE ===
  {
    code: 'STRATEGIC_ENTRY', label: "Mission d'entrée (logo stratégique)",
    category: 'STRATEGIC', multiplier: 0.85, sortOrder: 50,
    description: 'Prix réduit volontairement pour gagner un client stratégique',
  },
  {
    code: 'STRATEGIC_NORMAL', label: 'Stratégie standard',
    category: 'STRATEGIC', multiplier: 1.00, sortOrder: 51,
  },
  {
    code: 'STRATEGIC_PREMIUM', label: 'Client premium / marge haute',
    category: 'STRATEGIC', multiplier: 1.10, sortOrder: 52,
  },

  // === GÉOGRAPHIE ===
  {
    code: 'GEOGRAPHY_LOCAL', label: 'Mission locale (siège du cabinet)',
    category: 'GEOGRAPHY', multiplier: 1.00, sortOrder: 60,
  },
  {
    code: 'GEOGRAPHY_INTERIOR', label: "Mission intérieur pays",
    category: 'GEOGRAPHY', multiplier: 1.08, sortOrder: 61,
    description: 'Déplacements et per diem à prévoir',
  },
  {
    code: 'GEOGRAPHY_INTERNATIONAL', label: 'Multi-pays UEMOA/CEMAC',
    category: 'GEOGRAPHY', multiplier: 1.15, sortOrder: 62,
    description: 'Coordination multi-sites, déplacements internationaux',
  },
];
