import type { CombatLogEvent, CombatSegment, Guid } from '../types'

/**
 * Filtre les événements pour ne garder que ceux concernant le joueur sélectionné
 * (source ou cible) sur le segment de combat choisi (SPECS.md §4).
 */
export function filterEventsByPlayer(
  events: CombatLogEvent[],
  playerGuid: Guid,
  segment: CombatSegment,
): CombatLogEvent[] {
  return events.filter(
    (event) =>
      (event.sourceGuid === playerGuid || event.destGuid === playerGuid) &&
      event.timestamp >= segment.startTimestamp &&
      event.timestamp <= segment.endTimestamp,
  )
}
