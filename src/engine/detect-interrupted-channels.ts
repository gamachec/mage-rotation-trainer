import { correlateChannelTicks } from './channeled-spells'
import type { ChannelInterruptedError, PlayerTimeline, RotationConfig } from '../types'

/**
 * Détecte les canalisations interrompues (révision post-Étape 16) : un cast d'un sort déclaré
 * canalisé dans `config.channeledSpells` dont le nombre de vagues corrélées (`channeled-spells.ts`)
 * est inférieur à `expectedTicks`. `timeline.damageTicks` étant déjà borné au segment analysé
 * (filtré en amont par `filterEventsByPlayer`), pas besoin de `segmentEndTimestamp` explicite ici.
 */
export function detectInterruptedChannels(
  timeline: PlayerTimeline,
  config: RotationConfig,
): ChannelInterruptedError[] {
  const errors: ChannelInterruptedError[] = []

  correlateChannelTicks(timeline, config).forEach((tickInfo, index) => {
    if (tickInfo === null) {
      return
    }

    if (tickInfo.tickTimestamps.length < tickInfo.config.expectedTicks) {
      errors.push({
        type: 'channel-interrupted',
        timestamp: timeline.casts[index].timestamp,
        spellId: tickInfo.config.castSpellId,
        actualTicks: tickInfo.tickTimestamps.length,
        expectedTicks: tickInfo.config.expectedTicks,
      })
    }
  })

  return errors.sort((a, b) => a.timestamp - b.timestamp)
}
