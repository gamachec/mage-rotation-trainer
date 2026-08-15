import type { Aura } from './spell'
import type { RotationCondition } from './rotation-config'

/**
 * Résultat de la comparaison, pour un cast réel donné, entre le sort attendu par la
 * rotation cible et le sort effectivement casté (SPECS.md §6).
 * `expectedSpellId` est `null` si aucune règle de la config ne matchait à cet instant
 * (config incomplète — pas de "sinon" par défaut) : ce cas n'est pas considéré comme
 * une erreur, faute de référence pour en juger.
 * `expectedSpellRuleConditions` donne les conditions de la règle qui a
 * déterminé `expectedSpellId` — `null` si `expectedSpellId` est `null`, `[]` pour une règle
 * par défaut sans condition — pour pouvoir expliquer à l'utilisateur *pourquoi* un autre
 * sort était attendu, pas seulement lequel.
 * `resourceValues` donne la valeur reconstruite de chaque ressource de
 * personnage observée dans la timeline (`TimelineResourceGain.powerType`) juste avant ce cast
 * — pour l'affichage de l'état du personnage (ex : charges arcaniques) dans le rapport,
 * générique à toute ressource plutôt que spécifique à Arcane.
 * `startTimestamp` : reprise de `TimelineCast.startTimestamp` (timestamp du début réel du cast,
 * pour les sorts à temps de cast non-instantané) — utilisé par `classifyRotationErrors` pour ne
 * pas compter la durée d'un cast comme un temps mort de rotation.
 */
export interface RotationComparisonResult {
  timestamp: number
  startTimestamp?: number
  actualSpellId: number
  expectedSpellId: number | null
  expectedSpellRuleConditions: RotationCondition[] | null
  isCorrect: boolean
  activeAuras: Aura[]
  resourceValues: { powerType: number; value: number }[]
}
