import { describe, expect, it } from 'vitest'
import { correlateChannelTicks } from './channeled-spells'
import type { PlayerTimeline, RotationConfig } from '../types'

const ARCANE_MISSILES = 5143
const ARCANE_MISSILES_TICK = 7268
const ARCANE_BARRAGE = 44425

const CONFIG: RotationConfig = {
  rules: [],
  channeledSpells: [
    { castSpellId: ARCANE_MISSILES, tickSpellId: ARCANE_MISSILES_TICK, expectedTicks: 7 },
  ],
}

function timelineFrom(
  casts: PlayerTimeline['casts'],
  damageTicks: PlayerTimeline['damageTicks'] = [],
): PlayerTimeline {
  return {
    playerGuid: 'Player-1-AAAA',
    playerName: 'Someone',
    casts,
    auraChanges: [],
    damageTicks,
    resourceGains: [],
  }
}

describe('correlateChannelTicks', () => {
  it('retourne null pour un cast qui ne correspond à aucun sort canalisé déclaré', () => {
    const timeline = timelineFrom([
      { timestamp: 0, spell: { id: ARCANE_BARRAGE, name: 'Barrage des Arcanes' } },
    ])

    expect(correlateChannelTicks(timeline, CONFIG)).toEqual([null])
  })

  it('corrèle les vagues dont le spellId, la fenêtre temporelle correspondent au cast canalisé', () => {
    const timeline = timelineFrom(
      [
        { timestamp: 1000, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } },
        { timestamp: 3000, spell: { id: ARCANE_BARRAGE, name: 'Barrage des Arcanes' } },
      ],
      [
        { timestamp: 1300, spellId: ARCANE_MISSILES_TICK },
        { timestamp: 1600, spellId: ARCANE_MISSILES_TICK },
        // survient après le cast suivant (délai de vol du projectile) : toujours corrélée.
        { timestamp: 3200, spellId: ARCANE_MISSILES_TICK },
      ],
    )

    const result = correlateChannelTicks(timeline, CONFIG)

    expect(result[0]?.tickTimestamps).toEqual([1300, 1600, 3200])
    expect(result[1]).toBeNull()
  })

  it("ne corrèle pas les vagues d'un autre spellId de tick", () => {
    const timeline = timelineFrom(
      [{ timestamp: 1000, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } }],
      [{ timestamp: 1300, spellId: 999 }],
    )

    expect(correlateChannelTicks(timeline, CONFIG)[0]?.tickTimestamps).toEqual([])
  })

  it("borne la fenêtre par le prochain cast du même spellId, pas par n'importe quel cast suivant", () => {
    const timeline = timelineFrom(
      [
        { timestamp: 1000, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } },
        { timestamp: 2000, spell: { id: ARCANE_BARRAGE, name: 'Barrage des Arcanes' } },
        { timestamp: 4000, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } },
      ],
      [
        { timestamp: 3000, spellId: ARCANE_MISSILES_TICK },
        { timestamp: 4500, spellId: ARCANE_MISSILES_TICK },
      ],
    )

    const result = correlateChannelTicks(timeline, CONFIG)

    expect(result[0]?.tickTimestamps).toEqual([3000])
    expect(result[2]?.tickTimestamps).toEqual([4500])
  })

  it('retourne un tableau vide sans config channeledSpells', () => {
    const timeline = timelineFrom([
      { timestamp: 0, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } },
    ])

    expect(correlateChannelTicks(timeline, { rules: [] })).toEqual([null])
  })
})
