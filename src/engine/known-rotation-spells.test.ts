import { describe, expect, it } from 'vitest'
import { filterTimelineToKnownSpells, getKnownRotationSpellIds } from './known-rotation-spells'
import type { PlayerTimeline, RotationConfig } from '../types'

const ARCANE_BLAST = 30451
const ARCANE_MISSILES = 5143
const ARCANE_MISSILES_TICK = 7268
const INVISIBILITY = 66
const FROSTFIRE_BOLT = 44614

const CONFIG: RotationConfig = {
  rules: [
    { spellId: ARCANE_BLAST, conditions: [] },
    { spellId: ARCANE_MISSILES, conditions: [] },
  ],
  channeledSpells: [
    { castSpellId: ARCANE_MISSILES, tickSpellId: ARCANE_MISSILES_TICK, expectedTicks: 5 },
  ],
}

function timelineFrom(casts: PlayerTimeline['casts']): PlayerTimeline {
  return {
    playerGuid: 'Player-1-AAAA',
    playerName: 'Someone',
    casts,
    auraChanges: [],
    damageTicks: [],
    resourceGains: [],
  }
}

describe('getKnownRotationSpellIds', () => {
  it('inclut les spellId des règles et les castSpellId des sorts canalisés déclarés', () => {
    expect(getKnownRotationSpellIds(CONFIG)).toEqual(
      new Set([ARCANE_BLAST, ARCANE_MISSILES]),
    )
  })

  it('ne contient aucun sort hors config', () => {
    expect(getKnownRotationSpellIds(CONFIG).has(INVISIBILITY)).toBe(false)
  })

  it('inclut les spellId présents dans openerSequence même hors des règles', () => {
    const ARCANE_SURGE = 365350
    const configAvecOpener: RotationConfig = {
      ...CONFIG,
      openerSequence: [ARCANE_SURGE, ARCANE_BLAST],
    }

    expect(getKnownRotationSpellIds(configAvecOpener)).toEqual(
      new Set([ARCANE_BLAST, ARCANE_MISSILES, ARCANE_SURGE]),
    )
  })
})

describe('filterTimelineToKnownSpells', () => {
  it('conserve les casts de sorts référencés par la config', () => {
    const timeline = timelineFrom([
      { timestamp: 1000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } },
    ])

    const filtered = filterTimelineToKnownSpells(timeline, CONFIG)

    expect(filtered.casts).toEqual(timeline.casts)
  })

  it('retire les casts de sorts non référencés par la config (soin, défensif, mobilité...)', () => {
    const timeline = timelineFrom([
      { timestamp: 1000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } },
      { timestamp: 2000, spell: { id: INVISIBILITY, name: 'Invisibilité supérieure' } },
      { timestamp: 3000, spell: { id: FROSTFIRE_BOLT, name: 'Vague de chaleur de braisaile' } },
    ])

    const filtered = filterTimelineToKnownSpells(timeline, CONFIG)

    expect(filtered.casts).toEqual([
      { timestamp: 1000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } },
    ])
  })

  it('laisse les autres champs de la timeline inchangés', () => {
    const timeline: PlayerTimeline = {
      playerGuid: 'Player-1-AAAA',
      playerName: 'Someone',
      casts: [],
      auraChanges: [
        { timestamp: 500, aura: { spellId: 1, name: 'Buff', type: 'BUFF', stacks: 1 } },
      ],
      damageTicks: [{ timestamp: 600, spellId: ARCANE_MISSILES_TICK }],
      resourceGains: [{ timestamp: 700, powerType: 16, amount: 1, maxPower: 4 }],
    }

    const filtered = filterTimelineToKnownSpells(timeline, CONFIG)

    expect(filtered.auraChanges).toBe(timeline.auraChanges)
    expect(filtered.damageTicks).toBe(timeline.damageTicks)
    expect(filtered.resourceGains).toBe(timeline.resourceGains)
  })
})
