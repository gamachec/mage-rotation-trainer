import type { PlayerTimeline, RotationConfig } from '../types'

/**
 * IDs de sort que la config de rotation connaît (spécifiés dans une règle, déclarés comme
 * cast d'un sort canalisé suivi via `channeledSpells`, ou présents dans `openerSequence`) —
 * sert à distinguer les casts qui relèvent de la rotation évaluée des casts hors rotation
 * (soin, défensif, utilitaire, mobilité...) observés dans le log mais qu'aucune règle ne
 * prétend juger. Générique : dérivé de la config, pas d'une liste Arcane codée en dur
 * (CLAUDE.md, extensibilité multi-spé).
 */
export function getKnownRotationSpellIds(config: RotationConfig): Set<number> {
  const spellIds = new Set<number>()
  for (const rule of config.rules) {
    spellIds.add(rule.spellId)
  }
  for (const channeledSpell of config.channeledSpells ?? []) {
    spellIds.add(channeledSpell.castSpellId)
  }
  for (const spellId of config.openerSequence ?? []) {
    spellIds.add(spellId)
  }
  return spellIds
}

/**
 * Réduit `timeline.casts` aux seuls sorts connus de la config de rotation (voir
 * `getKnownRotationSpellIds`) — les casts hors rotation sont valides pour le joueur mais ne
 * doivent ni polluer le score/les erreurs de `analyzeRotation`, ni s'afficher dans la timeline
 * ou le rapport. Le reste de la timeline (auras, dégâts, gains de ressource) est conservé tel
 * quel : ces flux ne sont pas des casts, hors périmètre de ce filtre.
 */
export function filterTimelineToKnownSpells(
  timeline: PlayerTimeline,
  config: RotationConfig,
): PlayerTimeline {
  const knownSpellIds = getKnownRotationSpellIds(config)
  return {
    ...timeline,
    casts: timeline.casts.filter((cast) => knownSpellIds.has(cast.spell.id)),
  }
}
