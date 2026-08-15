import { describe, expect, it } from 'vitest'
import { getSpellIcon } from './spell-icons'

describe('getSpellIcon', () => {
  it('retourne une URL pour un sort dont l’icône est embarquée', () => {
    expect(getSpellIcon(30451)).toMatch(/\.jpg$/)
  })

  it('retourne null pour un sort sans icône embarquée', () => {
    expect(getSpellIcon(999999)).toBeNull()
  })
})
