import type {
  CombatLogEvent,
  Player,
  PlayerTimeline,
  TimelineAuraChange,
  TimelineCast,
  TimelineDamageTick,
  TimelineResourceGain,
} from '../types'

/**
 * Nombre de charges portées par un changement d'aura selon son type d'événement.
 * Les stacks des événements `_DOSE` sont des valeurs absolues (pas des deltas —
 * confirmé sur le vrai log, PLAN.md Étape 3) : il suffit de les reporter telles quelles.
 * `SPELL_AURA_APPLIED`/`SPELL_AURA_REMOVED` (sans `_DOSE`) n'ont pas de champ `stacks` :
 * une application initiale vaut 1 charge, un retrait ramène à 0.
 */
function resolveStacks(event: CombatLogEvent): number {
  switch (event.type) {
    case 'SPELL_AURA_APPLIED_DOSE':
    case 'SPELL_AURA_REMOVED_DOSE':
      return event.stacks
    case 'SPELL_AURA_APPLIED':
      return 1
    case 'SPELL_AURA_REMOVED':
      return 0
    default:
      throw new Error(`Type d'événement inattendu pour un changement d'aura : ${event.type}`)
  }
}

/**
 * Reconstruit la timeline chronologique d'un joueur à partir de ses événements filtrés
 * (sortie de `filterEventsByPlayer`, PLAN.md Étape 7) : les sorts castés et les
 * changements d'aura qui l'affectent. Simulation basique (décision Étape 0) — reflète
 * directement les événements observés, sans état "attendu" intermédiaire.
 */
export function buildPlayerTimeline(events: CombatLogEvent[], player: Player): PlayerTimeline {
  const casts: TimelineCast[] = []
  const auraChanges: TimelineAuraChange[] = []
  const damageTicks: TimelineDamageTick[] = []
  const resourceGains: TimelineResourceGain[] = []

  for (const event of events) {
    switch (event.type) {
      case 'SPELL_CAST_SUCCESS':
        if (event.sourceGuid === player.guid) {
          casts.push({
            timestamp: event.timestamp,
            spell: { id: event.spellId, name: event.spellName },
          })
        }
        break
      case 'SPELL_AURA_APPLIED':
      case 'SPELL_AURA_APPLIED_DOSE':
      case 'SPELL_AURA_REMOVED':
      case 'SPELL_AURA_REMOVED_DOSE':
        if (event.destGuid === player.guid) {
          auraChanges.push({
            timestamp: event.timestamp,
            aura: {
              spellId: event.spellId,
              name: event.spellName,
              type: event.auraType,
              stacks: resolveStacks(event),
            },
          })
        }
        break
      case 'SPELL_DAMAGE':
        if (event.sourceGuid === player.guid) {
          damageTicks.push({ timestamp: event.timestamp, spellId: event.spellId })
        }
        break
      case 'SPELL_ENERGIZE':
        if (event.destGuid === player.guid) {
          resourceGains.push({
            timestamp: event.timestamp,
            powerType: event.powerType,
            amount: event.amount,
            maxPower: event.maxPower,
          })
        }
        break
    }
  }

  return {
    playerGuid: player.guid,
    playerName: player.name,
    casts,
    auraChanges,
    damageTicks,
    resourceGains,
  }
}
