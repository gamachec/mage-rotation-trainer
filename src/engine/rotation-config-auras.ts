import type { RotationConfig } from '../types'

/**
 * IDs d'aura référencés par les conditions `auraStacks`/`auraActive` de la config de rotation
 * — sert à filtrer l'affichage de l'état du personnage sur la timeline pour
 * ne montrer que les auras pertinentes pour juger la rotation, plutôt que toutes les auras
 * observées dans le log (beaucoup ne sont pas liées à la priorité de sorts, ex : buffs de
 * caractéristiques, procs cosmétiques). Générique : dérivé de la config, pas d'une liste
 * Arcane codée en dur dans le moteur ou l'UI (CLAUDE.md, extensibilité multi-spé).
 */
export function getReferencedAuraSpellIds(config: RotationConfig): Set<number> {
  const spellIds = new Set<number>()
  for (const rule of config.rules) {
    for (const condition of rule.conditions) {
      if (condition.type === 'auraStacks' || condition.type === 'auraActive') {
        spellIds.add(condition.spellId)
      }
    }
  }
  return spellIds
}
