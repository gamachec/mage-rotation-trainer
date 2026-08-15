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
 * (approximation du cooldown réel : durée fixe connue, pas de calcul serveur/talents/haste —
 * PLAN-BURST.md Étape 2).
 */
export interface SpellCooldownReadyCondition {
  type: 'spellCooldownReady'
  spellId: number
  cooldownMs: number
}

/**
 * Vrai si le cast immédiatement précédent dans la timeline était `spellId`
 * (approximation de « mid-air » : le sort a été casté juste avant celui-ci — PLAN-BURST.md
 * Étape 2). Faux pour le tout premier cast (pas de précédent).
 */
export interface PreviousCastCondition {
  type: 'previousCastIs'
  spellId: number
}

export type RotationCondition =
  AuraStacksCondition | AuraActiveCondition | SpellCooldownReadyCondition | PreviousCastCondition

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
 * Déclare qu'un sort casté est en réalité une canalisation à plusieurs vagues de dégâts
 * (PLAN-BURST.md, révision post-Étape 16 — canalisations non modélisées jusque-là). `castSpellId`
 * est l'ID vu sur `SPELL_CAST_SUCCESS` (une seule fois, au début de la canalisation) ;
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
 * Rotation cible configurable (SPECS.md §5, PLAN.md Étape 9) : liste de règles ordonnées
 * par priorité, évaluées de haut en bas — la première règle dont toutes les conditions
 * sont vraies détermine le sort attendu (premier match gagne, décision Étape 0).
 * `channeledSpells` (optionnel) déclare les sorts canalisés à surveiller pour la détection
 * de canalisation interrompue — donnée intrinsèque au sort, pas une préférence de rotation,
 * mais reste dans ce fichier de config pour rester éditable sans toucher au code.
 */
export interface RotationConfig {
  rules: RotationRule[]
  channeledSpells?: ChanneledSpellConfig[]
}
