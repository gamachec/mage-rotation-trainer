import type { ResourceConsumerConfig, TimelineCast, TimelineResourceGain } from '../types'

type ResourceEvent =
  | { timestamp: number; kind: 'gain'; amount: number; maxPower: number }
  | { timestamp: number; kind: 'reset' }

/**
 * Reconstruit la valeur courante de la ressource `powerType` (ID numérique Blizzard, ex :
 * 16 = Charges Arcaniques) juste avant `timestamp`, à partir des gains observés
 * (`SPELL_ENERGIZE`, `PlayerTimeline.resourceGains`) et des remises à zéro déclarées par
 * `resourceConsumers` (réussite d'un cast d'un des `spellIds` consommateurs — PLAN.md Étape 18).
 *
 * Contrairement à `resolveActiveAurasBefore` (états purement observés dans le log), cette
 * reconstruction s'appuie en partie sur une règle de jeu non présente dans le log : Blizzard
 * ne logue que les **gains** de ressource, jamais les pertes/consommations. Exception assumée
 * à la décision Étape 0 ("pas de simulation au-delà des événements observés"), validée avec
 * l'utilisateur pour cette ressource spécifiquement.
 *
 * Strictement avant `timestamp` (`<`, pas `<=`), même convention que `resolveActiveAurasBefore` :
 * un gain ou une consommation au même timestamp qu'un cast est une conséquence de ce cast, pas
 * un état qui a motivé le choix du joueur.
 */
export function resolveResourceValueBefore(
  resourceGains: TimelineResourceGain[],
  casts: TimelineCast[],
  resourceConsumers: ResourceConsumerConfig[],
  powerType: number,
  timestamp: number,
): number {
  const consumerSpellIds = new Set(
    resourceConsumers
      .filter((consumer) => consumer.powerType === powerType)
      .flatMap((c) => c.spellIds),
  )

  const events: ResourceEvent[] = [
    ...resourceGains
      .filter((gain) => gain.powerType === powerType && gain.timestamp < timestamp)
      .map((gain): ResourceEvent => ({
        timestamp: gain.timestamp,
        kind: 'gain',
        amount: gain.amount,
        maxPower: gain.maxPower,
      })),
    ...casts
      .filter((cast) => consumerSpellIds.has(cast.spell.id) && cast.timestamp < timestamp)
      .map((cast): ResourceEvent => ({ timestamp: cast.timestamp, kind: 'reset' })),
  ].sort((a, b) => a.timestamp - b.timestamp)

  let value = 0
  for (const event of events) {
    value = event.kind === 'reset' ? 0 : Math.min(value + event.amount, event.maxPower)
  }
  return value
}
