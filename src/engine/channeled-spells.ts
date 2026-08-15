import type { ChanneledSpellConfig, PlayerTimeline, RotationConfig } from '../types'

/** Vagues de dégâts corrélées à un cast canalisé (ordre chronologique). */
export interface ChannelTickInfo {
  config: ChanneledSpellConfig
  tickTimestamps: number[]
}

/**
 * Pour chaque cast de `timeline.casts`, corrèle les vagues de dégâts (`timeline.damageTicks`)
 * appartenant à ce cast s'il s'agit d'un sort canalisé déclaré dans `config.channeledSpells` —
 * `null` sinon. Fenêtre de corrélation : `[timestamp du cast, timestamp du prochain cast **du
 * même spellId**[` (ou jusqu'à la fin de la timeline si c'est le dernier). Ne pas borner par
 * le cast suivant quel qu'il soit : sur un vrai combat log, les dernières vagues d'un
 * Projectiles des Arcanes complet peuvent arriver après le `SPELL_CAST_SUCCESS` du sort suivant
 * (délai de vol du projectile) — les exclure sous-compterait les vagues d'une canalisation
 * pourtant menée à son terme.
 */
export function correlateChannelTicks(
  timeline: PlayerTimeline,
  config: RotationConfig,
): (ChannelTickInfo | null)[] {
  const channeledSpells = config.channeledSpells ?? []

  return timeline.casts.map((cast, index) => {
    const channeled = channeledSpells.find((c) => c.castSpellId === cast.spell.id)
    if (!channeled) {
      return null
    }

    const nextSameSpellCast = timeline.casts
      .slice(index + 1)
      .find((laterCast) => laterCast.spell.id === cast.spell.id)
    const windowEnd = nextSameSpellCast?.timestamp ?? Infinity

    const tickTimestamps = timeline.damageTicks
      .filter(
        (tick) =>
          tick.spellId === channeled.tickSpellId &&
          tick.timestamp >= cast.timestamp &&
          tick.timestamp < windowEnd,
      )
      .map((tick) => tick.timestamp)
      .sort((a, b) => a - b)

    return { config: channeled, tickTimestamps }
  })
}
