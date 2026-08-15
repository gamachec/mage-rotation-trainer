import { describe, expect, it } from 'vitest'
import { classifyRotationErrors } from './classify-rotation-errors'
import type { RotationComparisonResult } from '../types'

const ARCANE_BLAST = 30451
const ARCANE_BARRAGE = 44425

function correctResult(timestamp: number, spellId: number): RotationComparisonResult {
  return {
    timestamp,
    actualSpellId: spellId,
    expectedSpellId: spellId,
    expectedSpellRuleConditions: [],
    isCorrect: true,
    activeAuras: [],
    resourceValues: [],
  }
}

function wrongResult(
  timestamp: number,
  actualSpellId: number,
  expectedSpellId: number,
): RotationComparisonResult {
  return {
    timestamp,
    actualSpellId,
    expectedSpellId,
    expectedSpellRuleConditions: [],
    isCorrect: false,
    activeAuras: [],
    resourceValues: [],
  }
}

function incompleteConfigResult(
  timestamp: number,
  actualSpellId: number,
): RotationComparisonResult {
  return {
    timestamp,
    actualSpellId,
    expectedSpellId: null,
    expectedSpellRuleConditions: null,
    isCorrect: false,
    activeAuras: [],
    resourceValues: [],
  }
}

describe('classifyRotationErrors', () => {
  it('ne remonte aucune erreur et un score de 100 quand tous les casts sont corrects', () => {
    const results = [correctResult(1000, ARCANE_BLAST), correctResult(2000, ARCANE_BLAST)]

    const analysis = classifyRotationErrors(results)

    expect(analysis).toEqual({
      score: 100,
      totalCasts: 2,
      correctCasts: 2,
      incompleteConfigCasts: 0,
      wastedCooldownsCount: 0,
      interruptedChannelsCount: 0,
      errors: [],
    })
  })

  it('détecte une erreur "wrong-spell" pour un cast incorrect', () => {
    const results = [wrongResult(1000, ARCANE_BLAST, ARCANE_BARRAGE)]

    const analysis = classifyRotationErrors(results)

    expect(analysis.errors).toEqual([
      {
        type: 'wrong-spell',
        timestamp: 1000,
        actualSpellId: ARCANE_BLAST,
        expectedSpellId: ARCANE_BARRAGE,
        activeAuras: [],
      },
    ])
    expect(analysis.score).toBe(0)
  })

  it('exclut les casts à config incomplète du score et ne génère pas d\'erreur "wrong-spell" pour eux', () => {
    const results = [
      correctResult(1000, ARCANE_BLAST),
      incompleteConfigResult(2000, ARCANE_BARRAGE),
    ]

    const analysis = classifyRotationErrors(results)

    expect(analysis.errors).toEqual([])
    expect(analysis.incompleteConfigCasts).toBe(1)
    expect(analysis.score).toBe(100)
  })

  it('retourne un score de 100 quand tous les casts sont à config incomplète (rien à juger)', () => {
    const results = [incompleteConfigResult(1000, ARCANE_BLAST)]

    expect(classifyRotationErrors(results).score).toBe(100)
  })

  it('détecte un gap quand le délai entre deux casts dépasse le seuil', () => {
    const results = [correctResult(1000, ARCANE_BLAST), correctResult(5000, ARCANE_BLAST)]

    const analysis = classifyRotationErrors(results, 3000)

    expect(analysis.errors).toEqual([{ type: 'rotation-gap', timestamp: 1000, durationMs: 4000 }])
  })

  it('ne détecte pas de gap quand le délai reste sous le seuil', () => {
    const results = [correctResult(1000, ARCANE_BLAST), correctResult(3500, ARCANE_BLAST)]

    expect(classifyRotationErrors(results, 3000).errors).toEqual([])
  })

  it('trie les erreurs par timestamp quand un gap et un mauvais sort se combinent', () => {
    const results = [
      correctResult(0, ARCANE_BLAST),
      wrongResult(5000, ARCANE_BLAST, ARCANE_BARRAGE),
    ]

    const analysis = classifyRotationErrors(results, 3000)

    expect(analysis.errors.map((error) => error.type)).toEqual(['rotation-gap', 'wrong-spell'])
  })

  it('utilise channelEndTimestamps (fin de canalisation) comme point de départ du gap au lieu du timestamp de début de cast', () => {
    const results = [correctResult(1000, ARCANE_BLAST), correctResult(6000, ARCANE_BLAST)]

    // Cast à 1000 canalisé jusqu'à 5500 (dernière vague) : le gap réel n'est que de 500ms.
    const analysis = classifyRotationErrors(results, 3000, [5500, null])

    expect(analysis.errors).toEqual([])
  })

  it('channelEndTimestamps : détecte quand même un gap si le délai reste excessif après la fin de canalisation', () => {
    const results = [correctResult(1000, ARCANE_BLAST), correctResult(10000, ARCANE_BLAST)]

    const analysis = classifyRotationErrors(results, 3000, [2500, null])

    expect(analysis.errors).toEqual([{ type: 'rotation-gap', timestamp: 2500, durationMs: 7500 }])
  })

  it('retourne un score de 100 et aucune erreur sans aucun cast', () => {
    expect(classifyRotationErrors([])).toEqual({
      score: 100,
      totalCasts: 0,
      correctCasts: 0,
      incompleteConfigCasts: 0,
      wastedCooldownsCount: 0,
      interruptedChannelsCount: 0,
      errors: [],
    })
  })
})
