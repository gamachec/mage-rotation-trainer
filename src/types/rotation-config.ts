export type ComparisonOperator = '==' | '!=' | '>=' | '<=' | '>' | '<'

/** Vrai si le nombre de charges de l'aura `spellId` satisfait `operator value` (0 si l'aura est absente). */
export interface AuraStacksCondition {
  type: 'auraStacks'
  spellId: number
  operator: ComparisonOperator
  value: number
}

/** Vrai si l'aura `spellId` est active (`active: true`) ou absente (`active: false`). */
export interface AuraActiveCondition {
  type: 'auraActive'
  spellId: number
  active: boolean
}

/**
 * Vrai si aucun cast de `spellId` n'a eu lieu dans les `cooldownMs` précédant l'instant évalué
 * (approximation du cooldown réel : durée fixe connue, pas de calcul serveur/talents/haste).
 */
export interface SpellCooldownReadyCondition {
  type: 'spellCooldownReady'
  spellId: number
  cooldownMs: number
}

/**
 * Vrai si le cast immédiatement précédent dans la timeline était `spellId`
 * (approximation de « mid-air » : le sort a été casté juste avant celui-ci). Faux pour le
 * tout premier cast (pas de précédent).
 */
export interface PreviousCastCondition {
  type: 'previousCastIs'
  spellId: number
}

/**
 * Vrai si la valeur courante de la ressource de personnage `powerType` (ID numérique Blizzard,
 * ex : 16 = Charges Arcaniques) satisfait `operator value`. Reconstruite à
 * partir des gains observés (`PlayerTimeline.resourceGains`) et des remises à zéro déclarées
 * par `RotationConfig.resourceConsumers` — voir ce champ pour le détail, la perte de ressource
 * n'étant pas directement présente dans le combat log.
 */
export interface ResourceValueCondition {
  type: 'resourceValue'
  powerType: number
  operator: ComparisonOperator
  value: number
}

export type RotationCondition =
  | AuraStacksCondition
  | AuraActiveCondition
  | SpellCooldownReadyCondition
  | PreviousCastCondition
  | ResourceValueCondition

/**
 * Règle de rotation : si toutes les `conditions` sont vraies (ET logique), le sort attendu
 * est `spellId`. Une règle sans conditions (`conditions: []`) matche toujours — c'est la
 * façon d'exprimer un "sinon → sort par défaut" (SPECS.md §5), généralement en dernière position.
 */
export interface RotationRule {
  spellId: number
  conditions: RotationCondition[]
}

/**
 * Déclare qu'un sort casté est en réalité une canalisation à plusieurs vagues de dégâts.
 * `castSpellId` est l'ID vu sur `SPELL_CAST_SUCCESS` (une seule fois, au début de la canalisation) ;
 * `tickSpellId` est l'ID vu sur chaque `SPELL_DAMAGE` de vague — **différent** de `castSpellId`
 * pour Projectiles des Arcanes (5143 au cast, 7268 par vague), confirmé sur un vrai combat log.
 * `expectedTicks` est un **plancher** de vagues en-dessous duquel la canalisation est considérée
 * interrompue — pas une valeur exacte attendue : sur un vrai log, une canalisation menée à son
 * terme peut produire plus de vagues que la valeur du tooltip en jeu (7 pour Projectiles des
 * Arcanes) selon les buffs actifs au moment du cast (observé jusqu'à 11 vagues sur un vrai run),
 * mécanisme non modélisé par ce schéma (pas de conditions par cast). 7 reste un plancher sûr :
 * jamais observé en-dessous sur un vrai log, donc pas de faux positif, et suffisant pour
 * détecter une interruption franche (canalisation coupée après 1-3 vagues).
 */
export interface ChanneledSpellConfig {
  castSpellId: number
  tickSpellId: number
  expectedTicks: number
}

/**
 * Déclare que la réussite d'un cast de l'un des `spellIds` remet à zéro la ressource
 * `powerType`. Connaissance de mécanique de jeu **non présente dans le
 * combat log** (Blizzard ne logue que les gains de ressource via `SPELL_ENERGIZE`, jamais les
 * pertes/consommations) — doit donc être déclarée explicitement en config plutôt que déduite
 * du log, pour que le moteur reste générique (pas de règle Arcane en dur : Barrage des Arcanes
 * consommant les Charges Arcaniques est une donnée de la config par défaut, pas du moteur).
 */
export interface ResourceConsumerConfig {
  powerType: number
  spellIds: number[]
}

/**
 * Rotation cible configurable (SPECS.md §5) : liste de règles ordonnées
 * par priorité, évaluées de haut en bas — la première règle dont toutes les conditions
 * sont vraies détermine le sort attendu (premier match gagne).
 * `channeledSpells` (optionnel) déclare les sorts canalisés à surveiller pour la détection
 * de canalisation interrompue — donnée intrinsèque au sort, pas une préférence de rotation,
 * mais reste dans ce fichier de config pour rester éditable sans toucher au code.
 * `resourceConsumers` (optionnel) déclare les remises à zéro de ressource nécessaires à
 * l'évaluation des conditions `resourceValue` — voir `ResourceConsumerConfig`.
 * `openerSequence` (optionnel) déclare une séquence ordonnée de sorts attendue
 * en tout début de segment (opener), prioritaire sur `rules` tant qu'elle n'est pas épuisée —
 * voir `resolveExpectedSpell`/`compareRotation` pour la résolution positionnelle.
 */
export interface RotationConfig {
  rules: RotationRule[]
  channeledSpells?: ChanneledSpellConfig[]
  resourceConsumers?: ResourceConsumerConfig[]
  openerSequence?: number[]
}
