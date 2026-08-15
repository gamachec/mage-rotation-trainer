import { describe, expect, it } from 'vitest'
import { getSpellName } from './get-spell-name'

describe('getSpellName', () => {
  it('retourne le nom connu pour un sort de la config Arcane par défaut', () => {
    expect(getSpellName(30451)).toBe('Déflagration des Arcanes')
    expect(getSpellName(44425)).toBe('Barrage des Arcanes')
    expect(getSpellName(5143)).toBe('Projectiles des Arcanes')
    expect(getSpellName(36032)).toBe('Charge arcanique')
    expect(getSpellName(263725)).toBe('Idées claires')
    expect(getSpellName(153626)).toBe('Orbe arcanique')
    expect(getSpellName(384452)).toBe('Salve arcanique')
    expect(getSpellName(451038)).toBe('Âme des arcanes')
    expect(getSpellName(1295924)).toBe('Trait prismatique')
  })

  it('retourne un libellé de repli pour un ID inconnu de la table', () => {
    expect(getSpellName(1)).toBe('Sort inconnu (#1)')
  })
})
