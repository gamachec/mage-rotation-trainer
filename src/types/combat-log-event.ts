import type { AuraType, Guid } from './spell'

/**
 * Champs communs à tous les événements du combat log WoW retail.
 * `timestamp` est en millisecondes, relatif au début du fichier (pas un timestamp absolu du log brut,
 * dont le format horaire varie selon la locale — la conversion se fait au parsing, étape 3).
 */
export interface CombatLogEventBase {
  timestamp: number
  sourceGuid: Guid
  sourceName: string
  destGuid: Guid
  destName: string
}

interface SpellEventFields {
  spellId: number
  spellName: string
}

export interface SpellCastSuccessEvent extends CombatLogEventBase, SpellEventFields {
  type: 'SPELL_CAST_SUCCESS'
}

export interface SpellAuraAppliedEvent extends CombatLogEventBase, SpellEventFields {
  type: 'SPELL_AURA_APPLIED'
  auraType: AuraType
}

export interface SpellAuraAppliedDoseEvent extends CombatLogEventBase, SpellEventFields {
  type: 'SPELL_AURA_APPLIED_DOSE'
  auraType: AuraType
  stacks: number
}

export interface SpellAuraRemovedEvent extends CombatLogEventBase, SpellEventFields {
  type: 'SPELL_AURA_REMOVED'
  auraType: AuraType
}

export interface SpellAuraRemovedDoseEvent extends CombatLogEventBase, SpellEventFields {
  type: 'SPELL_AURA_REMOVED_DOSE'
  auraType: AuraType
  stacks: number
}

export interface SpellDamageEvent extends CombatLogEventBase, SpellEventFields {
  type: 'SPELL_DAMAGE'
  amount: number
}

/**
 * Gain d'une ressource de personnage (mana, charges arcaniques, points de combo, ...).
 * `powerType` est l'ID numérique Blizzard de la ressource (ex : 16 = Charges Arcaniques),
 * générique — ce type n'est pas spécifique à une spé. `amount` est le gain observé (0 si
 * `SPELL_ENERGIZE` déclenché alors que la ressource était déjà au plafond `maxPower`, auquel
 * cas seul `overEnergize`, non capturé ici, est non nul dans le log brut). La perte/consommation
 * de la ressource n'est **pas** loguée par Blizzard (aucun événement de type "drain" observé sur
 * un vrai combat log) — elle doit être déduite d'une règle de jeu déclarée en config
 * (`RotationConfig.resourceConsumers`), pas lue directement ici.
 */
export interface SpellEnergizeEvent extends CombatLogEventBase, SpellEventFields {
  type: 'SPELL_ENERGIZE'
  powerType: number
  amount: number
  maxPower: number
}

/**
 * Sous-ensemble d'événements géré par l'application (SPECS.md §3-6) : casts réussis,
 * auras/stacks, dégâts, gains de ressource. Les autres types d'événements du log brut
 * (SPELL_CAST_FAILED, ENCOUNTER_START/END, UNIT_DIED, etc.) ne sont pas modélisés pour
 * l'instant — la détection des segments de combat s'appuie sur une heuristique d'inactivité,
 * pas sur des marqueurs d'encounter.
 */
export type CombatLogEvent =
  | SpellCastSuccessEvent
  | SpellAuraAppliedEvent
  | SpellAuraAppliedDoseEvent
  | SpellAuraRemovedEvent
  | SpellAuraRemovedDoseEvent
  | SpellDamageEvent
  | SpellEnergizeEvent

export type CombatLogEventType = CombatLogEvent['type']
