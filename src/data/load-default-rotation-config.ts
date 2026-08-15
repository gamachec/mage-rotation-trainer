import { parseRotationConfig } from './load-rotation-config'
import type { RotationConfig } from '../types'
import defaultRotationArcaneRaw from './default-rotation-arcane.json'

/**
 * Config de rotation Arcane fournie par défaut (SPECS.md §8 : l'application doit rester
 * utilisable sans config personnalisée). Les spellId d'auras (Idées claires 263725,
 * Salve arcanique 1242974, Trait prismatique 1295942) ont été revalidés contre un vrai
 * combat log de la saison courante (ID corrigés : 384452 → 1242974, 1295924 → 1295942
 * pour l'aura, l'ID 1295924 restant correct comme spellId de cast). Charge Arcanique
 * (36032) n'a pas d'équivalent trouvé dans un vrai log de cette saison — point encore ouvert.
 */
export function loadDefaultRotationConfig(): RotationConfig {
  return parseRotationConfig(defaultRotationArcaneRaw)
}
