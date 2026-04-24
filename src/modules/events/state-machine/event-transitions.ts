import { EventStage } from '@prisma/client';

/**
 * State machine des manifestations (événements BD).
 *
 * Flux normal : IDENTIFIED → REGISTERED → ATTENDED → FOLLOW_UP → ROI_MEASURED
 *
 * Peut être CANCELLED à tout moment avant ATTENDED.
 * Une fois ATTENDED, on va forcément au suivi puis au ROI.
 */
export const EVENT_TRANSITIONS: Record<EventStage, EventStage[]> = {
  IDENTIFIED:   ['REGISTERED', 'CANCELLED'],
  REGISTERED:   ['ATTENDED', 'CANCELLED'],
  ATTENDED:     ['FOLLOW_UP', 'ROI_MEASURED'],
  FOLLOW_UP:    ['ROI_MEASURED'],
  ROI_MEASURED: [], // état final
  CANCELLED:    [], // état final
};

export const EVENT_STAGE_LABELS: Record<EventStage, string> = {
  IDENTIFIED:   'Repéré',
  REGISTERED:   'Inscrit',
  ATTENDED:     'Participé',
  FOLLOW_UP:    'En suivi',
  ROI_MEASURED: 'ROI mesuré',
  CANCELLED:    'Annulé',
};

export function canTransition(from: EventStage, to: EventStage): boolean {
  return EVENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: EventStage): EventStage[] {
  return EVENT_TRANSITIONS[from] ?? [];
}

export function isFinalStage(stage: EventStage): boolean {
  return stage === 'ROI_MEASURED' || stage === 'CANCELLED';
}
