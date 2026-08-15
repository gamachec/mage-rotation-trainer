import { describe, expect, it } from 'vitest'
import { describeCondition, describeRuleConditions } from './describe-rotation-condition'
import type { RotationCondition } from '../types'

describe('describeCondition', () => {
  it('décrit une condition auraStacks', () => {
    const condition: RotationCondition = {
      type: 'auraStacks',
      spellId: 36032,
      operator: '>=',
      value: 4,
    }
    expect(describeCondition(condition)).toBe('Charge arcanique ≥ 4')
  })

  it('décrit une condition auraActive vraie', () => {
    const condition: RotationCondition = { type: 'auraActive', spellId: 263725, active: true }
    expect(describeCondition(condition)).toBe('Idées claires actif')
  })

  it('décrit une condition auraActive fausse', () => {
    const condition: RotationCondition = { type: 'auraActive', spellId: 263725, active: false }
    expect(describeCondition(condition)).toBe('Idées claires inactif')
  })

  it('décrit une condition spellCooldownReady', () => {
    const condition: RotationCondition = {
      type: 'spellCooldownReady',
      spellId: 365350,
      cooldownMs: 90000,
    }
    expect(describeCondition(condition)).toBe("Éruption d'arcanes prêt")
  })

  it('décrit une condition previousCastIs', () => {
    const condition: RotationCondition = { type: 'previousCastIs', spellId: 44425 }
    expect(describeCondition(condition)).toBe('sort précédent : Barrage des Arcanes')
  })

  it('décrit une condition resourceValue', () => {
    const condition: RotationCondition = {
      type: 'resourceValue',
      powerType: 16,
      operator: '==',
      value: 0,
    }
    expect(describeCondition(condition)).toBe('Charges arcaniques = 0')
  })
})

describe('describeRuleConditions', () => {
  it('joint plusieurs conditions avec "et"', () => {
    const conditions: RotationCondition[] = [
      { type: 'auraStacks', spellId: 36032, operator: '>=', value: 4 },
      { type: 'auraActive', spellId: 263725, active: false },
    ]
    expect(describeRuleConditions(conditions)).toBe('Charge arcanique ≥ 4 et Idées claires inactif')
  })

  it('signale une règle par défaut sans condition', () => {
    expect(describeRuleConditions([])).toBe('sort par défaut')
  })

  it('signale l’absence de règle applicable', () => {
    expect(describeRuleConditions(null)).toBe('aucune règle de config applicable')
  })
})
