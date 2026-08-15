import { describe, expect, it } from 'vitest'
import { parseRotationConfig, RotationConfigValidationError } from './load-rotation-config'

describe('parseRotationConfig', () => {
  it('parse une config valide avec conditions auraStacks et auraActive', () => {
    const config = parseRotationConfig({
      rules: [
        {
          spellId: 44425,
          conditions: [
            { type: 'auraStacks', spellId: 36032, operator: '>=', value: 4 },
            { type: 'auraActive', spellId: 263725, active: false },
          ],
        },
        { spellId: 30451, conditions: [] },
      ],
    })

    expect(config.rules).toHaveLength(2)
    expect(config.rules[0]?.spellId).toBe(44425)
    expect(config.rules[1]).toEqual({ spellId: 30451, conditions: [] })
  })

  it("rejette une config qui n'est pas un objet", () => {
    expect(() => parseRotationConfig(null)).toThrow(RotationConfigValidationError)
    expect(() => parseRotationConfig('not an object')).toThrow(RotationConfigValidationError)
  })

  it('rejette une config sans rules ou avec un tableau rules vide', () => {
    expect(() => parseRotationConfig({})).toThrow(RotationConfigValidationError)
    expect(() => parseRotationConfig({ rules: [] })).toThrow(RotationConfigValidationError)
  })

  it('rejette une règle avec un spellId invalide', () => {
    try {
      parseRotationConfig({ rules: [{ spellId: -1, conditions: [] }] })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues[0]).toContain('rules[0].spellId')
    }
  })

  it('rejette une condition auraStacks avec un opérateur inconnu', () => {
    try {
      parseRotationConfig({
        rules: [
          {
            spellId: 1,
            conditions: [{ type: 'auraStacks', spellId: 2, operator: '~=', value: 1 }],
          },
        ],
      })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues[0]).toContain('operator')
    }
  })

  it('rejette une condition auraActive dont "active" n’est pas un booléen', () => {
    try {
      parseRotationConfig({
        rules: [{ spellId: 1, conditions: [{ type: 'auraActive', spellId: 2, active: 'yes' }] }],
      })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues[0]).toContain('active')
    }
  })

  it('parse une config valide avec conditions spellCooldownReady et previousCastIs', () => {
    const config = parseRotationConfig({
      rules: [
        {
          spellId: 365350,
          conditions: [{ type: 'spellCooldownReady', spellId: 365350, cooldownMs: 90000 }],
        },
        {
          spellId: 321507,
          conditions: [
            { type: 'spellCooldownReady', spellId: 321507, cooldownMs: 45000 },
            { type: 'previousCastIs', spellId: 44425 },
          ],
        },
      ],
    })

    expect(config.rules).toHaveLength(2)
    expect(config.rules[0]).toEqual({
      spellId: 365350,
      conditions: [{ type: 'spellCooldownReady', spellId: 365350, cooldownMs: 90000 }],
    })
    expect(config.rules[1]).toEqual({
      spellId: 321507,
      conditions: [
        { type: 'spellCooldownReady', spellId: 321507, cooldownMs: 45000 },
        { type: 'previousCastIs', spellId: 44425 },
      ],
    })
  })

  it('rejette une condition spellCooldownReady dont "cooldownMs" n’est pas un nombre', () => {
    try {
      parseRotationConfig({
        rules: [
          {
            spellId: 1,
            conditions: [{ type: 'spellCooldownReady', spellId: 2, cooldownMs: '90000' }],
          },
        ],
      })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues[0]).toContain('cooldownMs')
    }
  })

  it('rejette une condition previousCastIs avec un spellId invalide', () => {
    try {
      parseRotationConfig({
        rules: [{ spellId: 1, conditions: [{ type: 'previousCastIs', spellId: -2 }] }],
      })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues[0]).toContain('spellId')
    }
  })

  it('rejette un type de condition inconnu', () => {
    try {
      parseRotationConfig({
        rules: [{ spellId: 1, conditions: [{ type: 'cooldownReady', spellId: 2 }] }],
      })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues[0]).toContain('type')
    }
  })

  it('parse une config valide avec channeledSpells', () => {
    const config = parseRotationConfig({
      rules: [{ spellId: 5143, conditions: [] }],
      channeledSpells: [{ castSpellId: 5143, tickSpellId: 7268, expectedTicks: 7 }],
    })

    expect(config.channeledSpells).toEqual([
      { castSpellId: 5143, tickSpellId: 7268, expectedTicks: 7 },
    ])
  })

  it('omet channeledSpells si absent de la config brute', () => {
    const config = parseRotationConfig({ rules: [{ spellId: 5143, conditions: [] }] })

    expect(config.channeledSpells).toBeUndefined()
  })

  it('rejette une entrée channeledSpells avec expectedTicks invalide', () => {
    try {
      parseRotationConfig({
        rules: [{ spellId: 5143, conditions: [] }],
        channeledSpells: [{ castSpellId: 5143, tickSpellId: 7268, expectedTicks: 0 }],
      })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues[0]).toContain('expectedTicks')
    }
  })

  it('parse une config valide avec condition resourceValue', () => {
    const config = parseRotationConfig({
      rules: [
        {
          spellId: 153626,
          conditions: [{ type: 'resourceValue', powerType: 16, operator: '==', value: 0 }],
        },
      ],
    })

    expect(config.rules[0]).toEqual({
      spellId: 153626,
      conditions: [{ type: 'resourceValue', powerType: 16, operator: '==', value: 0 }],
    })
  })

  it('rejette une condition resourceValue avec un powerType invalide', () => {
    try {
      parseRotationConfig({
        rules: [
          {
            spellId: 1,
            conditions: [{ type: 'resourceValue', powerType: 'seize', operator: '==', value: 0 }],
          },
        ],
      })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues[0]).toContain('powerType')
    }
  })

  it('parse une config valide avec resourceConsumers', () => {
    const config = parseRotationConfig({
      rules: [{ spellId: 5143, conditions: [] }],
      resourceConsumers: [{ powerType: 16, spellIds: [44425] }],
    })

    expect(config.resourceConsumers).toEqual([{ powerType: 16, spellIds: [44425] }])
  })

  it('omet resourceConsumers si absent de la config brute', () => {
    const config = parseRotationConfig({ rules: [{ spellId: 5143, conditions: [] }] })

    expect(config.resourceConsumers).toBeUndefined()
  })

  it('rejette une entrée resourceConsumers avec spellIds vide', () => {
    try {
      parseRotationConfig({
        rules: [{ spellId: 5143, conditions: [] }],
        resourceConsumers: [{ powerType: 16, spellIds: [] }],
      })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues[0]).toContain('spellIds')
    }
  })

  it('collecte tous les problèmes trouvés plutôt que de s’arrêter au premier', () => {
    try {
      parseRotationConfig({
        rules: [
          { spellId: -1, conditions: [] },
          { spellId: 1, conditions: [{ type: 'auraStacks', spellId: -2, operator: '>=' }] },
        ],
      })
      expect.fail('devait lever une exception')
    } catch (error) {
      expect(error).toBeInstanceOf(RotationConfigValidationError)
      expect((error as RotationConfigValidationError).issues.length).toBeGreaterThanOrEqual(3)
    }
  })
})
