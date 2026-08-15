import { describe, expect, it } from 'vitest'
import { loadDefaultRotationConfig } from './load-default-rotation-config'

describe('loadDefaultRotationConfig', () => {
  it('charge une config Arcane par défaut valide, avec une règle par défaut (sans conditions) en dernière position', () => {
    const config = loadDefaultRotationConfig()

    expect(config.rules.length).toBeGreaterThan(0)
    expect(config.rules.at(-1)?.conditions).toEqual([])
  })
})
