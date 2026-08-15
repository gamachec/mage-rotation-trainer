import type { Aura } from './spell'

/**
 * Résultat de la comparaison, pour un cast réel donné, entre le sort attendu par la
 * rotation cible et le sort effectivement casté (SPECS.md §6, PLAN.md Étape 10).
 * `expectedSpellId` est `null` si aucune règle de la config ne matchait à cet instant
 * (config incomplète — pas de "sinon" par défaut) : ce cas n'est pas considéré comme
 * une erreur, faute de référence pour en juger.
 */
export interface RotationComparisonResult {
  timestamp: number
  actualSpellId: number
  expectedSpellId: number | null
  isCorrect: boolean
  activeAuras: Aura[]
}
