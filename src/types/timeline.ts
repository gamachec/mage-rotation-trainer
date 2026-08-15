import type { Aura, Guid, Spell } from './spell'

/**
 * Position dans le flux d'événements source (index dans le tableau `CombatLogEvent[]` filtré)
 * — le timestamp du log a une résolution limitée (ms) et deux
 * événements distincts peuvent partager le même timestamp affiché alors que leur ordre réel
 * de traitement diffère (observé sur un vrai log : un buff consommé par le cast précédent et
 * le `SPELL_CAST_SUCCESS` du cast suivant logués à la même ms). `sequence` est le seul signal
 * fiable pour trancher ces égalités — voir `resolveActiveAurasBefore`
 * (`src/engine/compare-rotation.ts`). Optionnel : seul `buildPlayerTimeline` (données réelles)
 * le renseigne ; une timeline construite à la main (tests) peut l'omettre, auquel cas la
 * comparaison retombe sur `timestamp` (comportement historique, insensible aux égalités).
 */

/**
 * Un sort casté avec succès par le joueur, à un instant donné.
 * `startTimestamp` : timestamp du `SPELL_CAST_START` correspondant, s'il existe (sort à temps
 * de cast non-instantané) — sinon absent (sort instantané, `timestamp` seul fait foi). Distinct
 * de `timestamp` (qui reste celui de `SPELL_CAST_SUCCESS`, la fin du cast) pour ne pas compter
 * la durée d'un cast variable (ex : Trait prismatique, plus court à charges arcaniques élevées)
 * comme un temps mort dans la rotation (voir `classifyRotationErrors`).
 */
export interface TimelineCast {
  timestamp: number
  startTimestamp?: number
  sequence?: number
  spell: Spell
}

/** Un changement d'état d'aura (apparition, retrait, ou changement de stacks) sur le joueur. */
export interface TimelineAuraChange {
  timestamp: number
  sequence?: number
  aura: Aura
}

/**
 * Une vague de dégâts infligée par le joueur (`SPELL_DAMAGE`) :
 * nécessaire pour corréler les vagues d'une canalisation (ex : Projectiles des Arcanes) à
 * son cast d'origine (`ChanneledSpellConfig`, `src/engine/channeled-spells.ts`) — pas utilisé
 * pour du suivi de dégâts généraliste (DPS, etc.), hors périmètre.
 */
export interface TimelineDamageTick {
  timestamp: number
  spellId: number
}

/**
 * Un gain de ressource de personnage observé (`SPELL_ENERGIZE`) — mana,
 * charges arcaniques, points de combo, etc., `powerType` étant l'ID numérique Blizzard de
 * la ressource concernée. Uniquement les **gains** : Blizzard ne logue pas les pertes/
 * consommations de ressource (aucun événement de ce type trouvé sur un vrai combat log) —
 * la consommation doit être déduite d'une règle de jeu déclarée en config
 * (`RotationConfig.resourceConsumers`), pas lue depuis la timeline.
 */
export interface TimelineResourceGain {
  timestamp: number
  powerType: number
  amount: number
  maxPower: number
}

/**
 * Timeline chronologique de l'état d'un joueur sur un segment de combat.
 * Structure pivot consommée par le moteur de comparaison et par
 * la visualisation. Reconstruite uniquement à partir des événements réels
 * du log (pas de simulation de GCD/latence/cast interrompu, sauf pour
 * les canalisations, voir `ChanneledSpellConfig`).
 */
export interface PlayerTimeline {
  playerGuid: Guid
  playerName: string
  casts: TimelineCast[]
  auraChanges: TimelineAuraChange[]
  damageTicks: TimelineDamageTick[]
  resourceGains: TimelineResourceGain[]
}
