import { describe, expect, it } from 'vitest'
import { detectWastedCooldowns } from './detect-wasted-cooldowns'
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

describe('detectWastedCooldowns', () => {
  it("ne détecte rien si le cooldown suivi est casté dès qu'il est prêt (au pull), segment court", () => {
    const timeline = timelineFrom([
      { timestamp: 500, spell: { id: ARCANE_SURGE, name: 'Éruption des Arcanes' } },
    ])

    expect(detectWastedCooldowns(timeline, CONFIG, 0, 1000)).toEqual([])
  })

  it('détecte un cooldown non recasté à temps, avant la fin du segment (castAt: null)', () => {
    const timeline = timelineFrom([])

    const errors = detectWastedCooldowns(timeline, CONFIG, 0, 10000)

    expect(errors).toEqual([
      { type: 'cooldown-wasted', spellId: ARCANE_SURGE, readyAt: 0, castAt: null, delayMs: 10000 },
    ])
  })

  it("ne détecte pas d'erreur si le délai reste sous le seuil de tolérance", () => {
    const timeline = timelineFrom([])

    expect(detectWastedCooldowns(timeline, CONFIG, 0, 2000)).toEqual([])
  })

  it('détecte un délai excessif entre le moment où le CD est prêt et le prochain cast réel', () => {
    const timeline = timelineFrom([
      { timestamp: 0, spell: { id: ARCANE_SURGE, name: 'Éruption des Arcanes' } },
      { timestamp: 95000, spell: { id: ARCANE_SURGE, name: 'Éruption des Arcanes' } },
    ])

    const errors = detectWastedCooldowns(timeline, CONFIG, 0, 96000)

    expect(errors).toEqual([
      {
        type: 'cooldown-wasted',
        spellId: ARCANE_SURGE,
        readyAt: 90000,
        castAt: 95000,
        delayMs: 5000,
      },
    ])
  })

  it('déduplique un cooldown suivi par plusieurs règles au même spellId (expression du "OU")', () => {
    const timeline = timelineFrom([])

    const configAvecPlusieursReglesOu: RotationConfig = {
      rules: [
        {
          spellId: ARCANE_SURGE,
          conditions: [{ type: 'spellCooldownReady', spellId: ARCANE_SURGE, cooldownMs: 90000 }],
        },
        {
          spellId: ARCANE_SURGE,
          conditions: [
            { type: 'spellCooldownReady', spellId: ARCANE_SURGE, cooldownMs: 90000 },
            { type: 'auraActive', spellId: 999, active: true },
          ],
        },
      ],
    }

    const errors = detectWastedCooldowns(timeline, configAvecPlusieursReglesOu, 0, 10000)

    expect(errors).toEqual([
      { type: 'cooldown-wasted', spellId: ARCANE_SURGE, readyAt: 0, castAt: null, delayMs: 10000 },
    ])
  })

  it('ignore les sorts non suivis (pas de condition spellCooldownReady auto-référencée)', () => {
    const timeline = timelineFrom([])

    const configSansTracking: RotationConfig = {
      rules: [{ spellId: ARCANE_BLAST, conditions: [] }],
    }

    expect(detectWastedCooldowns(timeline, configSansTracking, 0, 100000)).toEqual([])
  })

  it("utilise le début du segment (pas 0 en dur) comme instant où le CD suivi est considéré prêt : un cast dès le début du segment n'est jamais gaspillé même si la timeline (relative au fichier) a un timestamp bien supérieur à 0", () => {
    const timeline = timelineFrom([
      { timestamp: 54818, spell: { id: ARCANE_SURGE, name: 'Éruption des Arcanes' } },
    ])

    expect(detectWastedCooldowns(timeline, CONFIG, 54818, 60000)).toEqual([])
  })
})
