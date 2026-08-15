import { describe, expect, it } from 'vitest'
import { analyzeRotation } from './analyze-rotation'
import type { PlayerTimeline, RotationConfig } from '../types'

const ARCANE_SURGE = 365350
const ARCANE_BLAST = 30451

const CONFIG: RotationConfig = {
  rules: [
    {
      spellId: ARCANE_SURGE,
      conditions: [{ type: 'spellCooldownReady', spellId: ARCANE_SURGE, cooldownMs: 90000 }],
    },
    { spellId: ARCANE_BLAST, conditions: [] },
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

describe('analyzeRotation', () => {
  it('fusionne les erreurs de casts et les cooldowns gaspillés, score à 100 si tout est correct', () => {
    const timeline = timelineFrom([
      { timestamp: 0, spell: { id: ARCANE_SURGE, name: 'Éruption des Arcanes' } },
    ])

    const analysis = analyzeRotation(timeline, CONFIG, 0, 1000)

    expect(analysis.score).toBe(100)
    expect(analysis.wastedCooldownsCount).toBe(0)
    expect(analysis.errors).toEqual([])
  })

  it('un cooldown de burst gaspillé agrandit le dénominateur du score sans ajouter de point', () => {
    const timeline = timelineFrom([])

    const analysis = analyzeRotation(timeline, CONFIG, 0, 10000)

    expect(analysis.wastedCooldownsCount).toBe(1)
    expect(analysis.correctCasts).toBe(0)
    expect(analysis.score).toBe(0)
    expect(analysis.errors).toEqual([
      {
        type: 'cooldown-wasted',
        spellId: ARCANE_SURGE,
        readyAt: 0,
        castAt: null,
        delayMs: 10000,
      },
    ])
  })

  it('mélange cast à config incomplète et cooldown gaspillé dans le calcul du score', () => {
    const ANTI_MAGIC_AURA = 999

    const timeline = timelineFrom([
      { timestamp: 0, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } },
    ])

    // Rule gatée par une aura absente : aucune règle ne matche le cast (config incomplète),
    // mais le cooldown reste suivi (auto-référence spellCooldownReady) et donc gaspillé.
    const configAvecConditionSupplementaire: RotationConfig = {
      rules: [
        {
          spellId: ARCANE_SURGE,
          conditions: [
            { type: 'spellCooldownReady', spellId: ARCANE_SURGE, cooldownMs: 90000 },
            { type: 'auraActive', spellId: ANTI_MAGIC_AURA, active: true },
          ],
        },
      ],
    }

    const analysis = analyzeRotation(timeline, configAvecConditionSupplementaire, 0, 10000)

    expect(analysis.incompleteConfigCasts).toBe(1)
    expect(analysis.wastedCooldownsCount).toBe(1)
    expect(analysis.score).toBe(0)
  })

  it('trie les erreurs fusionnées par timestamp/readyAt', () => {
    const timeline = timelineFrom([
      { timestamp: 20000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } },
    ])

    const analysis = analyzeRotation(timeline, CONFIG, 0, 20000, 3000, 2500)

    expect(analysis.errors.map((error) => error.type)).toEqual(['cooldown-wasted', 'wrong-spell'])
  })

  it('une canalisation interrompue agrandit le dénominateur du score sans ajouter de point, et ne compte pas comme un temps mort', () => {
    const ARCANE_MISSILES = 5143
    const ARCANE_MISSILES_TICK = 7268

    const timeline: PlayerTimeline = {
      playerGuid: 'Player-1-AAAA',
      playerName: 'Someone',
      casts: [
        { timestamp: 0, spell: { id: ARCANE_MISSILES, name: 'Projectiles des Arcanes' } },
        { timestamp: 1500, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } },
      ],
      auraChanges: [],
      // 2 vagues seulement (attendu : 7) : canalisation interrompue, dernière vague à 500ms.
      damageTicks: [
        { timestamp: 200, spellId: ARCANE_MISSILES_TICK },
        { timestamp: 500, spellId: ARCANE_MISSILES_TICK },
      ],
      resourceGains: [],
    }

    const configAvecCanalisation: RotationConfig = {
      rules: [
        {
          spellId: ARCANE_BLAST,
          conditions: [{ type: 'previousCastIs', spellId: ARCANE_MISSILES }],
        },
        { spellId: ARCANE_MISSILES, conditions: [] },
      ],
      channeledSpells: [
        { castSpellId: ARCANE_MISSILES, tickSpellId: ARCANE_MISSILES_TICK, expectedTicks: 7 },
      ],
    }

    const analysis = analyzeRotation(timeline, configAvecCanalisation, 0, 2000)

    expect(analysis.interruptedChannelsCount).toBe(1)
    expect(analysis.correctCasts).toBe(2)
    expect(analysis.score).toBe(67)
    expect(analysis.errors).toEqual([
      {
        type: 'channel-interrupted',
        timestamp: 0,
        spellId: ARCANE_MISSILES,
        actualTicks: 2,
        expectedTicks: 7,
      },
    ])
  })

  it('retourne un score de 100 sans aucun cast ni cooldown suivi', () => {
    const timeline = timelineFrom([])
    const configSansTracking: RotationConfig = {
      rules: [{ spellId: ARCANE_BLAST, conditions: [] }],
    }

    const analysis = analyzeRotation(timeline, configSansTracking, 0, 1000)

    expect(analysis.score).toBe(100)
    expect(analysis.wastedCooldownsCount).toBe(0)
  })
})
