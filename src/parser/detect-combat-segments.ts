import type { CombatLogEvent, CombatSegment, Guid } from '../types'

/**
 * Détecte les segments de combat du joueur sélectionné par heuristique d'inactivité
 * (PLAN.md Étape 0/6, révisé) : un segment démarre au premier sort casté par le joueur
 * (`SPELL_CAST_SUCCESS` dont il est la source — un log de combat n'a pas d'événement
 * d'entrée/sortie de combat exploitable) et se termine dès qu'aucun nouveau sort casté
 * par le joueur ne survient pendant `inactivityThresholdMs`. Les auras reçues, dégâts
 * subis, etc. ne comptent pas comme activité pour cette détection — seuls les sorts
 * effectivement lancés par le joueur en témoignent, ce qui évite de démarrer le segment
 * trop tôt sur un événement qui précède l'opener réel (ex: buff/proc reçu juste avant).
 * Les événements des autres joueurs n'influencent pas cette détection (comparaison
 * directe au GUID, pas par préfixe).
 *
 * Les événements doivent être triés par `timestamp` croissant (c'est le cas de la sortie
 * de `parseCombatLog`).
 */
export function detectCombatSegments(
  events: CombatLogEvent[],
  playerGuid: Guid,
  inactivityThresholdMs: number,
): CombatSegment[] {
  const segments: CombatSegment[] = []
  let current: CombatSegment | null = null

  for (const event of events) {
    if (event.type !== 'SPELL_CAST_SUCCESS' || event.sourceGuid !== playerGuid) {
      continue
    }

    if (current === null) {
      current = { startTimestamp: event.timestamp, endTimestamp: event.timestamp }
    } else if (event.timestamp - current.endTimestamp > inactivityThresholdMs) {
      segments.push(current)
      current = { startTimestamp: event.timestamp, endTimestamp: event.timestamp }
    } else {
      current.endTimestamp = event.timestamp
    }
  }

  if (current !== null) {
    segments.push(current)
  }

  return segments
}
