import { describe, expect, it } from 'vitest'
import { getPowerTypeName } from './power-type-name'

describe('getPowerTypeName', () => {
  it('retourne le nom connu pour un powerType référencé', () => {
    expect(getPowerTypeName(16)).toBe('Charges arcaniques')
  })

  it('retourne un libellé de repli pour un powerType inconnu', () => {
    expect(getPowerTypeName(999)).toBe('Ressource inconnue (#999)')
  })
})
