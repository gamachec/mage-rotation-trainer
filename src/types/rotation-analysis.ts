import type { Aura } from './spell'

/**
 * Types d'erreurs détectés à partir de la sortie du moteur de comparaison (PLAN.md Étape 11,
 * PLAN-BURST.md Étape 3, révision post-Étape 16 pour `channel-interrupted`). "Mauvaise gestion
 * de cooldown" n'est in-scope que pour les cooldowns explicitement suivis via la config
 * (`spellCooldownReady` auto-référencée), pas un système générique de cooldown pour tous les
 * sorts (voir SPECS.md §6).
 */
export type RotationErrorType =
  'wrong-spell' | 'rotation-gap' | 'cooldown-wasted' | 'channel-interrupted'

/** Mauvais sort casté par rapport à la priorité attendue par la config à cet instant. */
export interface WrongSpellError {
  type: 'wrong-spell'
  timestamp: number
  actualSpellId: number
  expectedSpellId: number
  activeAuras: Aura[]
}

/** Délai anormalement long entre deux casts successifs du joueur. */
export interface RotationGapError {
  type: 'rotation-gap'
  timestamp: number
  durationMs: number
}

/**
 * Cooldown de burst suivi (config `spellCooldownReady` auto-référencée) resté prêt sans être
 * recasté au-delà du seuil de tolérance — PLAN-BURST.md Étape 3. `castAt: null` si le cooldown
 * n'a jamais été recasté avant la fin du segment.
 */
export interface CooldownWastedError {
  type: 'cooldown-wasted'
  spellId: number
  readyAt: number
  castAt: number | null
  delayMs: number
}

/**
 * Canalisation (ex : Projectiles des Arcanes) interrompue avant son terme — moins de
 * `expectedTicks` vagues de dégâts observées avant le cast suivant du même sort (ou la fin
 * du segment). Révision post-Étape 16 (canalisations non modélisées jusque-là, voir
 * `ChanneledSpellConfig`).
 */
export interface ChannelInterruptedError {
  type: 'channel-interrupted'
  timestamp: number
  spellId: number
  actualTicks: number
  expectedTicks: number
}

export type RotationError =
  WrongSpellError | RotationGapError | CooldownWastedError | ChannelInterruptedError

/**
 * Résultat agrégé de l'analyse d'une rotation : score global de conformité et liste des
 * erreurs détectées. Les casts pour lesquels aucune règle de la config ne matchait
 * (`expectedSpellId: null`, config incomplète) sont exclus du score et ne génèrent pas
 * d'erreur "wrong-spell" — ce n'est pas une erreur imputable au joueur. `wastedCooldownsCount`
 * (PLAN-BURST.md Étape 3) compte les cooldowns de burst gaspillés inclus dans `errors`, pour
 * transparence dans le rapport. `interruptedChannelsCount` (révision post-Étape 16) fait de
 * même pour les canalisations interrompues.
 */
export interface RotationAnalysisResult {
  score: number
  totalCasts: number
  correctCasts: number
  incompleteConfigCasts: number
  wastedCooldownsCount: number
  interruptedChannelsCount: number
  errors: RotationError[]
}
