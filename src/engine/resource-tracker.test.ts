import { describe, expect, it } from 'vitest'
import { resolveResourceValueBefore } from './resource-tracker'
import type { ResourceConsumerConfig, TimelineCast, TimelineResourceGain } from '../types'

const ARCANE_CHARGES = 16
const BARRAGE = 44425

const RESOURCE_CONSUMERS: ResourceConsumerConfig[] = [
  { powerType: ARCANE_CHARGES, spellIds: [BARRAGE] },
]

describe('resolveResourceValueBefore', () => {
  it('vaut 0 sans aucun gain observé', () => {
    const value = resolveResourceValueBefore([], [], RESOURCE_CONSUMERS, ARCANE_CHARGES, 1000)
    expect(value).toBe(0)
  })

  it('accumule les gains successifs', () => {
    const gains: TimelineResourceGain[] = [
      { timestamp: 100, powerType: ARCANE_CHARGES, amount: 1, maxPower: 4 },
      { timestamp: 200, powerType: ARCANE_CHARGES, amount: 1, maxPower: 4 },
    ]
    const value = resolveResourceValueBefore(gains, [], RESOURCE_CONSUMERS, ARCANE_CHARGES, 1000)
    expect(value).toBe(2)
  })

  it('plafonne au maxPower du dernier gain, sans dépasser', () => {
    const gains: TimelineResourceGain[] = [
      { timestamp: 100, powerType: ARCANE_CHARGES, amount: 4, maxPower: 4 },
      { timestamp: 200, powerType: ARCANE_CHARGES, amount: 1, maxPower: 4 },
    ]
    const value = resolveResourceValueBefore(gains, [], RESOURCE_CONSUMERS, ARCANE_CHARGES, 1000)
    expect(value).toBe(4)
  })

  it('remet à zéro au cast d’un sort consommateur déclaré', () => {
    const gains: TimelineResourceGain[] = [
      { timestamp: 100, powerType: ARCANE_CHARGES, amount: 3, maxPower: 4 },
      { timestamp: 400, powerType: ARCANE_CHARGES, amount: 1, maxPower: 4 },
    ]
    const casts: TimelineCast[] = [{ timestamp: 200, spell: { id: BARRAGE, name: 'Barrage' } }]
    const value = resolveResourceValueBefore(gains, casts, RESOURCE_CONSUMERS, ARCANE_CHARGES, 1000)
    // 100: +3=3 ; 200: reset -> 0 ; 400: +1=1
    expect(value).toBe(1)
  })

  it('ignore les gains/resets à ou après `timestamp` (strictement avant)', () => {
    const gains: TimelineResourceGain[] = [
      { timestamp: 100, powerType: ARCANE_CHARGES, amount: 1, maxPower: 4 },
      { timestamp: 500, powerType: ARCANE_CHARGES, amount: 1, maxPower: 4 },
    ]
    const value = resolveResourceValueBefore(gains, [], RESOURCE_CONSUMERS, ARCANE_CHARGES, 500)
    expect(value).toBe(1)
  })

  it("ignore les gains d'un autre powerType", () => {
    const gains: TimelineResourceGain[] = [
      { timestamp: 100, powerType: 0, amount: 500, maxPower: 250000 },
    ]
    const value = resolveResourceValueBefore(gains, [], RESOURCE_CONSUMERS, ARCANE_CHARGES, 1000)
    expect(value).toBe(0)
  })

  it("ignore les casts d'un sort non déclaré consommateur pour ce powerType", () => {
    const gains: TimelineResourceGain[] = [
      { timestamp: 100, powerType: ARCANE_CHARGES, amount: 2, maxPower: 4 },
    ]
    const casts: TimelineCast[] = [{ timestamp: 200, spell: { id: 5143, name: 'Autre sort' } }]
    const value = resolveResourceValueBefore(gains, casts, RESOURCE_CONSUMERS, ARCANE_CHARGES, 1000)
    expect(value).toBe(2)
  })
})
