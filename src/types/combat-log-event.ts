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
 * Sous-ensemble d'événements géré par le MVP (SPECS.md §3-6) : casts réussis,
 * auras/stacks, dégâts. Les autres types d'événements du log brut (SPELL_CAST_FAILED,
 * ENCOUNTER_START/END, UNIT_DIED, etc.) ne sont pas modélisés pour l'instant —
 * la détection des segments de combat s'appuie sur une heuristique d'inactivité
 * (PLAN.md Étape 0/6), pas sur des marqueurs d'encounter.
 */
export type CombatLogEvent =
  | SpellCastSuccessEvent
  | SpellAuraAppliedEvent
  | SpellAuraAppliedDoseEvent
  | SpellAuraRemovedEvent
  | SpellAuraRemovedDoseEvent
  | SpellDamageEvent

export type CombatLogEventType = CombatLogEvent['type']
