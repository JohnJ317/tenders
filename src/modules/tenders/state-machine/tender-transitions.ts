import { TenderStage } from '@prisma/client';

/**
 * State machine des AO.
 *
 * Chaque clé = un état source, chaque valeur = les états cibles autorisés.
 * Une transition non listée = refusée (400 Bad Request).
 *
 * Flux normal : WATCHING → QUALIFICATION → (EOI → SHORTLISTED →)? PREPARING
 *               → SUBMITTED → (NEGOTIATION →)? WON | LOST
 *
 * Un AO peut toujours être CANCELLED tant qu'il n'est pas dans un état final.
 * WON, LOST et CANCELLED sont des états finaux — pas de retour en arrière.
 */
export const TENDER_TRANSITIONS: Record<TenderStage, TenderStage[]> = {
  WATCHING:      ['QUALIFICATION', 'CANCELLED'],
  QUALIFICATION: ['EOI', 'PREPARING', 'CANCELLED'],
  EOI:           ['SHORTLISTED', 'LOST', 'CANCELLED'],
  SHORTLISTED:   ['PREPARING', 'CANCELLED'],
  PREPARING:     ['SUBMITTED', 'CANCELLED'],
  SUBMITTED:     ['NEGOTIATION', 'WON', 'LOST'],
  NEGOTIATION:   ['WON', 'LOST'],
  WON:           [], // état final
  LOST:          [], // état final
  CANCELLED:     [], // état final
};

/**
 * États finaux où isOpen doit basculer à false.
 */
export const TENDER_CLOSED_STAGES: TenderStage[] = ['WON', 'LOST', 'CANCELLED'];

/**
 * Libellés FR pour affichage côté API.
 */
export const TENDER_STAGE_LABELS: Record<TenderStage, string> = {
  WATCHING:      'Veille',
  QUALIFICATION: 'Qualification',
  EOI:           "Manifestation d'intérêt",
  SHORTLISTED:   'Shortlisté',
  PREPARING:     'Préparation offre',
  SUBMITTED:     'Soumise',
  NEGOTIATION:   'Négociation',
  WON:           'Gagné',
  LOST:          'Perdu',
  CANCELLED:     'Annulé',
};

/**
 * Vérifie si une transition est autorisée.
 */
export function canTransition(from: TenderStage, to: TenderStage): boolean {
  return TENDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Retourne la liste des transitions possibles depuis un état.
 */
export function allowedTransitions(from: TenderStage): TenderStage[] {
  return TENDER_TRANSITIONS[from] ?? [];
}

/**
 * Un état est-il final ?
 */
export function isFinalStage(stage: TenderStage): boolean {
  return TENDER_CLOSED_STAGES.includes(stage);
}
