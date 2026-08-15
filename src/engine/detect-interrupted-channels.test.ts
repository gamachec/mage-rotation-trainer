import { describe, expect, it } from 'vitest'
import { detectInterruptedChannels } from './detect-interrupted-channels'
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
  return { playerGuid: 'Player-1-AAAA', playerName: 'Someone', casts, auraChanges: [], damageTicks }
}

function ticksAt(timestamps: number[]): PlayerTimeline['damageTicks'] {
  return timestamps.map((timestamp) => ({ timestamp, spellId: ARCANE_MISSILES_TICK }))
}

describe('detectInterruptedChannels', () => {
  it('ne détecte rien si le nombre de vagues attendu est atteint', () => {
    const timeline = timelineFrom(
      [{ timestamp: 1000, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } }],
      ticksAt([1300, 1600, 1900, 2200, 2500, 2800, 3100]),
    )

    expect(detectInterruptedChannels(timeline, CONFIG)).toEqual([])
  })

  it('détecte une canalisation interrompue (moins de vagues que prévu)', () => {
    const timeline = timelineFrom(
      [
        { timestamp: 1000, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } },
        { timestamp: 2000, spell: { id: ARCANE_BARRAGE, name: 'Barrage des Arcanes' } },
      ],
      ticksAt([1300, 1600, 1900]),
    )

    expect(detectInterruptedChannels(timeline, CONFIG)).toEqual([
      {
        type: 'channel-interrupted',
        timestamp: 1000,
        spellId: ARCANE_MISSILES,
        actualTicks: 3,
        expectedTicks: 7,
      },
    ])
  })

  it('ignore les casts de sorts non déclarés canalisés', () => {
    const timeline = timelineFrom([
      { timestamp: 1000, spell: { id: ARCANE_BARRAGE, name: 'Barrage des Arcanes' } },
    ])

    expect(detectInterruptedChannels(timeline, CONFIG)).toEqual([])
  })

  it('trie les erreurs par timestamp', () => {
    const timeline = timelineFrom(
      [
        { timestamp: 1000, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } },
        { timestamp: 5000, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } },
      ],
      [],
    )

    const errors = detectInterruptedChannels(timeline, CONFIG)

    expect(errors.map((error) => error.timestamp)).toEqual([1000, 5000])
  })
})
