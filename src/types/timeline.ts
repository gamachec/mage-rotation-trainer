import type { Aura, Guid, Spell } from './spell'

/** Un sort casté avec succès par le joueur, à un instant donné. */
export interface TimelineCast {
  timestamp: number
  spell: Spell
}

/** Un changement d'état d'aura (apparition, retrait, ou changement de stacks) sur le joueur. */
export interface TimelineAuraChange {
  timestamp: number
  aura: Aura
}

/**
 * Une vague de dégâts infligée par le joueur (`SPELL_DAMAGE`), révision post-Étape 16 :
 * nécessaire pour corréler les vagues d'une canalisation (ex : Projectiles des Arcanes) à
 * son cast d'origine (`ChanneledSpellConfig`, `src/engine/channeled-spells.ts`) — pas utilisé
 * pour du suivi de dégâts généraliste (DPS, etc.), hors périmètre.
 */
export interface TimelineDamageTick {
  timestamp: number
  spellId: number
}

/**
 * Timeline chronologique de l'état d'un joueur sur un segment de combat.
 * Structure pivot consommée par le moteur de comparaison (PLAN.md Étape 10) et par
 * la visualisation (Étape 14). Reconstruite uniquement à partir des événements réels
 * du log (pas de simulation de GCD/latence/cast interrompu — décision Étape 0, revue pour
 * les canalisations, voir `ChanneledSpellConfig`).
 */
export interface PlayerTimeline {
  playerGuid: Guid
  playerName: string
  casts: TimelineCast[]
  auraChanges: TimelineAuraChange[]
  damageTicks: TimelineDamageTick[]
}
