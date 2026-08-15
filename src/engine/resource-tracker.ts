import type { ResourceConsumerConfig, TimelineCast, TimelineResourceGain } from '../types'

type ResourceEvent =
  | { timestamp: number; kind: 'gain'; amount: number; maxPower: number }
  | { timestamp: number; kind: 'reset' }

/**
 * Reconstruit la valeur courante de la ressource `powerType` (ID numérique Blizzard, ex :
 * 16 = Charges Arcaniques) juste avant `timestamp`, à partir des gains observés
 * (`SPELL_ENERGIZE`, `PlayerTimeline.resourceGains`) et des remises à zéro déclarées par
 * `resourceConsumers` (réussite d'un cast d'un des `spellIds` consommateurs).
 *
 * Contrairement à `resolveActiveAurasBefore` (états purement observés dans le log), cette
 * reconstruction s'appuie en partie sur une règle de jeu non présente dans le log : Blizzard
 * ne logue que les **gains** de ressource, jamais les pertes/consommations. Exception assumée
 * au principe général de "pas de simulation au-delà des événements observés", validée avec
 * l'utilisateur pour cette ressource spécifiquement.
 *
 * Strictement avant `timestamp` (`<`, pas `<=`) pour les gains, même convention que
 * `resolveActiveAurasBefore` : un gain au même timestamp qu'un cast est une conséquence de ce
 * cast, pas un état qui a motivé le choix du joueur. Pas de filtre par timestamp équivalent
 * pour les casts consommateurs (`casts` déjà limité aux casts strictement antérieurs au cast
 * évalué par l'appelant — `castsBefore`, `src/engine/compare-rotation.ts`) : l'ordre garanti
 * par cette pré-sélection est plus fiable qu'une comparaison de timestamp, dont la résolution
 * limitée peut faire coïncider un cast consommateur avec le cast évalué (même bug que celui
 * corrigé dans `resolveActiveAurasBefore` via `sequence`) et exclure à tort une remise à zéro
 * pourtant bien antérieure.
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
      .filter((cast) => consumerSpellIds.has(cast.spell.id))
      .map((cast): ResourceEvent => ({ timestamp: cast.timestamp, kind: 'reset' })),
  ].sort((a, b) => a.timestamp - b.timestamp)

  let value = 0
  for (const event of events) {
    value = event.kind === 'reset' ? 0 : Math.min(value + event.amount, event.maxPower)
  }
  return value
}
