import { describe, expect, it } from 'vitest'
import { compareRotation, resolveExpectedSpell } from './compare-rotation'
import type { Aura, PlayerTimeline, RotationConfig } from '../types'

const ARCANE_BLAST = 30451
const ARCANE_BARRAGE = 44425
const ARCANE_MISSILES = 5143
const ARCANE_CHARGES = 36032
const CLEARCASTING = 263725

/** Config simplifiée sur le modèle de la config Arcane par défaut. */
const CONFIG: RotationConfig = {
  rules: [
    {
      spellId: ARCANE_BARRAGE,
      conditions: [
        { type: 'auraStacks', spellId: ARCANE_CHARGES, operator: '>=', value: 4 },
        { type: 'auraActive', spellId: CLEARCASTING, active: false },
      ],
    },
    {
      spellId: ARCANE_MISSILES,
      conditions: [{ type: 'auraActive', spellId: CLEARCASTING, active: true }],
    },
    { spellId: ARCANE_BLAST, conditions: [] },
  ],
}

function timelineFrom(
  casts: PlayerTimeline['casts'],
  auraChanges: PlayerTimeline['auraChanges'],
): PlayerTimeline {
  return { playerGuid: 'Player-1-AAAA', playerName: 'Someone', casts, auraChanges, damageTicks: [] }
}

describe('resolveExpectedSpell', () => {
  it('retourne le sort de la première règle qui matche', () => {
    const activeAuras = new Map<number, Aura>([
      [
        ARCANE_CHARGES,
        { spellId: ARCANE_CHARGES, name: 'Charges arcaniques', type: 'BUFF', stacks: 4 },
      ],
    ])

    expect(resolveExpectedSpell(CONFIG, activeAuras)).toBe(ARCANE_BARRAGE)
  })

  it('retourne le sort par défaut si aucune condition spécifique ne matche', () => {
    expect(resolveExpectedSpell(CONFIG, new Map())).toBe(ARCANE_BLAST)
  })

  it('retourne null si aucune règle ne matche (config sans "sinon")', () => {
    const configSansDefaut: RotationConfig = { rules: [CONFIG.rules[0]] }

    expect(resolveExpectedSpell(configSansDefaut, new Map())).toBeNull()
  })
})

describe('compareRotation', () => {
  it('marque un cast correct quand il correspond au sort attendu', () => {
    const timeline = timelineFrom(
      [{ timestamp: 1000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } }],
      [],
    )

    const [result] = compareRotation(timeline, CONFIG)

    expect(result).toEqual({
      timestamp: 1000,
      actualSpellId: ARCANE_BLAST,
      expectedSpellId: ARCANE_BLAST,
      isCorrect: true,
      activeAuras: [],
    })
  })

  it('détecte un mauvais sort casté par rapport à la priorité attendue', () => {
    const timeline = timelineFrom(
      [{ timestamp: 2000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } }],
      [
        {
          timestamp: 1000,
          aura: { spellId: ARCANE_CHARGES, name: 'Charges arcaniques', type: 'BUFF', stacks: 4 },
        },
      ],
    )

    const [result] = compareRotation(timeline, CONFIG)

    expect(result.isCorrect).toBe(false)
    expect(result.expectedSpellId).toBe(ARCANE_BARRAGE)
    expect(result.actualSpellId).toBe(ARCANE_BLAST)
  })

  it("ignore un changement d'aura survenant au même timestamp que le cast (conséquence du cast, pas cause)", () => {
    const timeline = timelineFrom(
      [{ timestamp: 1000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } }],
      [
        {
          timestamp: 1000,
          aura: { spellId: ARCANE_CHARGES, name: 'Charges arcaniques', type: 'BUFF', stacks: 4 },
        },
      ],
    )

    const [result] = compareRotation(timeline, CONFIG)

    expect(result.activeAuras).toEqual([])
    expect(result.expectedSpellId).toBe(ARCANE_BLAST)
  })

  it('reconstruit l’état de charges au fil de plusieurs changements successifs (dernière valeur connue)', () => {
    const timeline = timelineFrom(
      [{ timestamp: 3000, spell: { id: ARCANE_BARRAGE, name: 'Rafale des Arcanes' } }],
      [
        {
          timestamp: 1000,
          aura: { spellId: ARCANE_CHARGES, name: 'Charges arcaniques', type: 'BUFF', stacks: 1 },
        },
        {
          timestamp: 1500,
          aura: { spellId: ARCANE_CHARGES, name: 'Charges arcaniques', type: 'BUFF', stacks: 4 },
        },
      ],
    )

    const [result] = compareRotation(timeline, CONFIG)

    expect(result.isCorrect).toBe(true)
    expect(result.activeAuras).toEqual([
      { spellId: ARCANE_CHARGES, name: 'Charges arcaniques', type: 'BUFF', stacks: 4 },
    ])
  })

  it("retire une aura de l'état actif une fois qu'elle repasse à 0 charge", () => {
    const timeline = timelineFrom(
      [{ timestamp: 2000, spell: { id: ARCANE_MISSILES, name: 'Missiles des Arcanes' } }],
      [
        {
          timestamp: 500,
          aura: { spellId: CLEARCASTING, name: 'Lucidité', type: 'BUFF', stacks: 1 },
        },
        {
          timestamp: 1000,
          aura: { spellId: CLEARCASTING, name: 'Lucidité', type: 'BUFF', stacks: 0 },
        },
      ],
    )

    const [result] = compareRotation(timeline, CONFIG)

    expect(result.activeAuras).toEqual([])
    expect(result.expectedSpellId).toBe(ARCANE_BLAST)
    expect(result.isCorrect).toBe(false)
  })

  it('ne considère pas expectedSpellId null comme correct', () => {
    const configSansDefaut: RotationConfig = { rules: [CONFIG.rules[0]] }
    const timeline = timelineFrom(
      [{ timestamp: 1000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } }],
      [],
    )

    const [result] = compareRotation(timeline, configSansDefaut)

    expect(result.expectedSpellId).toBeNull()
    expect(result.isCorrect).toBe(false)
  })

  it('retourne un tableau vide sans cast', () => {
    expect(compareRotation(timelineFrom([], []), CONFIG)).toEqual([])
  })
})

describe('conditions spellCooldownReady et previousCastIs', () => {
  const ARCANE_SURGE = 365350
  const TOUCH_OF_THE_MAGI = 321507

  const BURST_CONFIG: RotationConfig = {
    rules: [
      {
        spellId: ARCANE_SURGE,
        conditions: [{ type: 'spellCooldownReady', spellId: ARCANE_SURGE, cooldownMs: 90000 }],
      },
      {
        spellId: TOUCH_OF_THE_MAGI,
        conditions: [
          { type: 'spellCooldownReady', spellId: TOUCH_OF_THE_MAGI, cooldownMs: 45000 },
          { type: 'previousCastIs', spellId: ARCANE_BARRAGE },
        ],
      },
      { spellId: ARCANE_BLAST, conditions: [] },
    ],
  }

  it('spellCooldownReady est vrai si le sort n’a jamais été casté', () => {
    const timeline = timelineFrom(
      [{ timestamp: 1000, spell: { id: ARCANE_SURGE, name: 'Éruption des Arcanes' } }],
      [],
    )

    const [result] = compareRotation(timeline, BURST_CONFIG)

    expect(result.expectedSpellId).toBe(ARCANE_SURGE)
    expect(result.isCorrect).toBe(true)
  })

  it('spellCooldownReady est faux tant que le cooldown n’est pas écoulé depuis le dernier cast', () => {
    const timeline = timelineFrom(
      [
        { timestamp: 1000, spell: { id: ARCANE_SURGE, name: 'Éruption des Arcanes' } },
        { timestamp: 50000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } },
      ],
      [],
    )

    const [, result] = compareRotation(timeline, BURST_CONFIG)

    expect(result.expectedSpellId).toBe(ARCANE_BLAST)
    expect(result.isCorrect).toBe(true)
  })

  it('spellCooldownReady redevient vrai une fois le cooldown écoulé', () => {
    const timeline = timelineFrom(
      [
        { timestamp: 1000, spell: { id: ARCANE_SURGE, name: 'Éruption des Arcanes' } },
        { timestamp: 91500, spell: { id: ARCANE_SURGE, name: 'Éruption des Arcanes' } },
      ],
      [],
    )

    const [, result] = compareRotation(timeline, BURST_CONFIG)

    expect(result.expectedSpellId).toBe(ARCANE_SURGE)
    expect(result.isCorrect).toBe(true)
  })

  // Config sans la règle ARCANE_SURGE (toujours prête au premier cast) pour isoler
  // previousCastIs des interférences de spellCooldownReady sur une autre règle.
  const TOM_ONLY_CONFIG: RotationConfig = {
    rules: BURST_CONFIG.rules.slice(1),
  }

  it('previousCastIs est vrai si le cast immédiatement précédent correspond', () => {
    const timeline = timelineFrom(
      [
        { timestamp: 1000, spell: { id: ARCANE_BARRAGE, name: 'Rafale des Arcanes' } },
        { timestamp: 2000, spell: { id: TOUCH_OF_THE_MAGI, name: 'Toucher des magi' } },
      ],
      [],
    )

    const [, result] = compareRotation(timeline, TOM_ONLY_CONFIG)

    expect(result.expectedSpellId).toBe(TOUCH_OF_THE_MAGI)
    expect(result.isCorrect).toBe(true)
  })

  it('previousCastIs est faux pour le tout premier cast (pas de précédent)', () => {
    const timeline = timelineFrom(
      [{ timestamp: 1000, spell: { id: TOUCH_OF_THE_MAGI, name: 'Toucher des magi' } }],
      [],
    )

    const [result] = compareRotation(timeline, TOM_ONLY_CONFIG)

    expect(result.expectedSpellId).toBe(ARCANE_BLAST)
  })

  it('previousCastIs est faux si un autre sort a été casté juste avant', () => {
    const timeline = timelineFrom(
      [
        { timestamp: 1000, spell: { id: ARCANE_BLAST, name: 'Déflagration des Arcanes' } },
        { timestamp: 2000, spell: { id: TOUCH_OF_THE_MAGI, name: 'Toucher des magi' } },
      ],
      [],
    )

    const [, result] = compareRotation(timeline, TOM_ONLY_CONFIG)

    expect(result.expectedSpellId).toBe(ARCANE_BLAST)
    expect(result.isCorrect).toBe(false)
  })
})
