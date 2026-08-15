import type { CombatLogEvent, Player } from '../types'

/** Préfixe de GUID identifiant un joueur, par opposition aux créatures/mannequins/pets. */
const PLAYER_GUID_PREFIX = 'Player-'

function isPlayerGuid(guid: string): boolean {
  return guid.startsWith(PLAYER_GUID_PREFIX)
}

/**
 * Extrait la liste des joueurs distincts présents dans les événements parsés, dédupliqués
 * par GUID (pas par nom, pour éviter les ambiguïtés d'homonymes — SPECS.md §4). Un joueur
 * peut apparaître comme source ou cible d'événement ; les créatures/mannequins/pets sont
 * exclus via le préfixe de leur GUID (PLAN.md Étape 5).
 *
 * Résultat trié par nom pour un affichage stable dans le sélecteur (SPECS.md §3.4).
 */
export function detectPlayers(events: CombatLogEvent[]): Player[] {
  const nameByGuid = new Map<string, string>()

  for (const event of events) {
    if (isPlayerGuid(event.sourceGuid)) {
      nameByGuid.set(event.sourceGuid, event.sourceName)
    }
    if (isPlayerGuid(event.destGuid)) {
      nameByGuid.set(event.destGuid, event.destName)
    }
  }

  return Array.from(nameByGuid, ([guid, name]) => ({ guid, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}
