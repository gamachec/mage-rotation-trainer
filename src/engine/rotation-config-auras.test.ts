import { describe, expect, it } from 'vitest'
import { getReferencedAuraSpellIds } from './rotation-config-auras'
import type { RotationConfig } from '../types'

describe('getReferencedAuraSpellIds', () => {
  it('collecte les spellId des conditions auraStacks et auraActive', () => {
    const config: RotationConfig = {
      rules: [
        {
          spellId: 44425,
          conditions: [
            { type: 'auraStacks', spellId: 36032, operator: '>=', value: 4 },
            { type: 'auraActive', spellId: 263725, active: false },
          ],
        },
        {
          spellId: 30451,
          conditions: [],
        },
      ],
    }

    expect(getReferencedAuraSpellIds(config)).toEqual(new Set([36032, 263725]))
  })

  it('ignore les conditions qui ne référencent pas une aura (spellCooldownReady, previousCastIs, resourceValue)', () => {
    const config: RotationConfig = {
      rules: [
        {
          spellId: 321507,
          conditions: [
            { type: 'spellCooldownReady', spellId: 321507, cooldownMs: 45000 },
            { type: 'previousCastIs', spellId: 44425 },
            { type: 'resourceValue', powerType: 16, operator: '==', value: 0 },
          ],
        },
      ],
    }

    expect(getReferencedAuraSpellIds(config)).toEqual(new Set())
  })

  it('retourne un ensemble vide pour une config sans règle', () => {
    expect(getReferencedAuraSpellIds({ rules: [] })).toEqual(new Set())
  })
})
