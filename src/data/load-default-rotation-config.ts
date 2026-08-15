import { parseRotationConfig } from './load-rotation-config'
import type { RotationConfig } from '../types'
import defaultRotationArcaneRaw from './default-rotation-arcane.json'

/**
 * Config de rotation Arcane fournie par défaut (SPECS.md §8 : l'application doit rester
 * utilisable sans config personnalisée). Premier jet de règles à affiner avec l'utilisateur
 * une fois le pipeline validé de bout en bout (PLAN.md Étape 17) — les spellId utilisés
 * (Déflagration des Arcanes 30451, Missiles Arcaniques 5143, Barrage Arcanique 44425,
 * Dérive de l'esprit/Clearcasting 263725, Charge Arcanique 36032) sont ceux communément
 * stables depuis plusieurs extensions, à revalider sur un vrai log si le patch courant diffère.
 */
export function loadDefaultRotationConfig(): RotationConfig {
  return parseRotationConfig(defaultRotationArcaneRaw)
}
