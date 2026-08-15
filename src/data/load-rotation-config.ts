import type {
  AuraActiveCondition,
  AuraStacksCondition,
  ChanneledSpellConfig,
  ComparisonOperator,
  PreviousCastCondition,
  ResourceConsumerConfig,
  ResourceValueCondition,
  RotationCondition,
  RotationConfig,
  RotationRule,
  SpellCooldownReadyCondition,
} from '../types'

const COMPARISON_OPERATORS: ComparisonOperator[] = ['==', '!=', '>=', '<=', '>', '<']

/** Erreur levée par `parseRotationConfig` quand la config est structurellement invalide. */
export class RotationConfigValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Configuration de rotation invalide :\n${issues.map((issue) => `- ${issue}`).join('\n')}`)
    this.name = 'RotationConfigValidationError'
    this.issues = issues
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveIntegerSpellId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function validateCondition(raw: unknown, path: string, issues: string[]): RotationCondition | null {
  if (!isPlainObject(raw)) {
    issues.push(`${path} : doit être un objet (reçu ${JSON.stringify(raw)})`)
    return null
  }

  if (raw.type === 'auraStacks') {
    let valid = true
    if (!isPositiveIntegerSpellId(raw.spellId)) {
      issues.push(
        `${path}.spellId : doit être un entier positif (reçu ${JSON.stringify(raw.spellId)})`,
      )
      valid = false
    }
    if (!COMPARISON_OPERATORS.includes(raw.operator as ComparisonOperator)) {
      issues.push(
        `${path}.operator : doit être l'un de ${COMPARISON_OPERATORS.join(', ')} (reçu ${JSON.stringify(raw.operator)})`,
      )
      valid = false
    }
    if (typeof raw.value !== 'number') {
      issues.push(`${path}.value : doit être un nombre (reçu ${JSON.stringify(raw.value)})`)
      valid = false
    }
    return valid ? (raw as unknown as AuraStacksCondition) : null
  }

  if (raw.type === 'auraActive') {
    let valid = true
    if (!isPositiveIntegerSpellId(raw.spellId)) {
      issues.push(
        `${path}.spellId : doit être un entier positif (reçu ${JSON.stringify(raw.spellId)})`,
      )
      valid = false
    }
    if (typeof raw.active !== 'boolean') {
      issues.push(`${path}.active : doit être un booléen (reçu ${JSON.stringify(raw.active)})`)
      valid = false
    }
    return valid ? (raw as unknown as AuraActiveCondition) : null
  }

  if (raw.type === 'spellCooldownReady') {
    let valid = true
    if (!isPositiveIntegerSpellId(raw.spellId)) {
      issues.push(
        `${path}.spellId : doit être un entier positif (reçu ${JSON.stringify(raw.spellId)})`,
      )
      valid = false
    }
    if (typeof raw.cooldownMs !== 'number') {
      issues.push(
        `${path}.cooldownMs : doit être un nombre (reçu ${JSON.stringify(raw.cooldownMs)})`,
      )
      valid = false
    }
    return valid ? (raw as unknown as SpellCooldownReadyCondition) : null
  }

  if (raw.type === 'previousCastIs') {
    let valid = true
    if (!isPositiveIntegerSpellId(raw.spellId)) {
      issues.push(
        `${path}.spellId : doit être un entier positif (reçu ${JSON.stringify(raw.spellId)})`,
      )
      valid = false
    }
    return valid ? (raw as unknown as PreviousCastCondition) : null
  }

  if (raw.type === 'resourceValue') {
    let valid = true
    if (typeof raw.powerType !== 'number' || !Number.isInteger(raw.powerType)) {
      issues.push(`${path}.powerType : doit être un entier (reçu ${JSON.stringify(raw.powerType)})`)
      valid = false
    }
    if (!COMPARISON_OPERATORS.includes(raw.operator as ComparisonOperator)) {
      issues.push(
        `${path}.operator : doit être l'un de ${COMPARISON_OPERATORS.join(', ')} (reçu ${JSON.stringify(raw.operator)})`,
      )
      valid = false
    }
    if (typeof raw.value !== 'number') {
      issues.push(`${path}.value : doit être un nombre (reçu ${JSON.stringify(raw.value)})`)
      valid = false
    }
    return valid ? (raw as unknown as ResourceValueCondition) : null
  }

  issues.push(
    `${path}.type : doit être "auraStacks", "auraActive", "spellCooldownReady", "previousCastIs" ou "resourceValue" (reçu ${JSON.stringify(raw.type)})`,
  )
  return null
}

function validateRule(raw: unknown, index: number, issues: string[]): RotationRule | null {
  const path = `rules[${index}]`

  if (!isPlainObject(raw)) {
    issues.push(`${path} : doit être un objet (reçu ${JSON.stringify(raw)})`)
    return null
  }

  let valid = true
  if (!isPositiveIntegerSpellId(raw.spellId)) {
    issues.push(
      `${path}.spellId : doit être un entier positif (reçu ${JSON.stringify(raw.spellId)})`,
    )
    valid = false
  }

  if (!Array.isArray(raw.conditions)) {
    issues.push(
      `${path}.conditions : doit être un tableau (reçu ${JSON.stringify(raw.conditions)})`,
    )
  } else {
    const conditions: RotationCondition[] = []
    raw.conditions.forEach((rawCondition, conditionIndex) => {
      const condition = validateCondition(
        rawCondition,
        `${path}.conditions[${conditionIndex}]`,
        issues,
      )
      if (condition !== null) {
        conditions.push(condition)
      } else {
        valid = false
      }
    })
    if (valid) {
      return { spellId: raw.spellId as number, conditions }
    }
  }

  return null
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function validateChanneledSpell(
  raw: unknown,
  index: number,
  issues: string[],
): ChanneledSpellConfig | null {
  const path = `channeledSpells[${index}]`

  if (!isPlainObject(raw)) {
    issues.push(`${path} : doit être un objet (reçu ${JSON.stringify(raw)})`)
    return null
  }

  let valid = true
  if (!isPositiveIntegerSpellId(raw.castSpellId)) {
    issues.push(
      `${path}.castSpellId : doit être un entier positif (reçu ${JSON.stringify(raw.castSpellId)})`,
    )
    valid = false
  }
  if (!isPositiveIntegerSpellId(raw.tickSpellId)) {
    issues.push(
      `${path}.tickSpellId : doit être un entier positif (reçu ${JSON.stringify(raw.tickSpellId)})`,
    )
    valid = false
  }
  if (!isPositiveInteger(raw.expectedTicks)) {
    issues.push(
      `${path}.expectedTicks : doit être un entier positif (reçu ${JSON.stringify(raw.expectedTicks)})`,
    )
    valid = false
  }

  return valid
    ? {
        castSpellId: raw.castSpellId as number,
        tickSpellId: raw.tickSpellId as number,
        expectedTicks: raw.expectedTicks as number,
      }
    : null
}

function validateResourceConsumer(
  raw: unknown,
  index: number,
  issues: string[],
): ResourceConsumerConfig | null {
  const path = `resourceConsumers[${index}]`

  if (!isPlainObject(raw)) {
    issues.push(`${path} : doit être un objet (reçu ${JSON.stringify(raw)})`)
    return null
  }

  let valid = true
  if (typeof raw.powerType !== 'number' || !Number.isInteger(raw.powerType)) {
    issues.push(`${path}.powerType : doit être un entier (reçu ${JSON.stringify(raw.powerType)})`)
    valid = false
  }
  if (
    !Array.isArray(raw.spellIds) ||
    raw.spellIds.length === 0 ||
    !raw.spellIds.every(isPositiveIntegerSpellId)
  ) {
    issues.push(
      `${path}.spellIds : doit être un tableau non vide d'entiers positifs (reçu ${JSON.stringify(raw.spellIds)})`,
    )
    valid = false
  }

  return valid ? { powerType: raw.powerType as number, spellIds: raw.spellIds as number[] } : null
}

/**
 * Valide et parse une config de rotation cible brute (typiquement issue de `JSON.parse`
 * sur un fichier édité à la main par l'utilisateur — SPECS.md §5). Collecte l'ensemble des
 * problèmes trouvés plutôt que de s'arrêter au premier, pour donner un retour complet en
 * une seule fois. Lève `RotationConfigValidationError` si la config est invalide.
 */
export function parseRotationConfig(raw: unknown): RotationConfig {
  const issues: string[] = []

  if (!isPlainObject(raw)) {
    throw new RotationConfigValidationError([
      `la config doit être un objet (reçu ${JSON.stringify(raw)})`,
    ])
  }

  if (!Array.isArray(raw.rules) || raw.rules.length === 0) {
    throw new RotationConfigValidationError([`rules : doit être un tableau non vide`])
  }

  const rules: RotationRule[] = []
  raw.rules.forEach((rawRule, index) => {
    const rule = validateRule(rawRule, index, issues)
    if (rule !== null) {
      rules.push(rule)
    }
  })

  let channeledSpells: ChanneledSpellConfig[] | undefined
  if (raw.channeledSpells !== undefined) {
    if (!Array.isArray(raw.channeledSpells)) {
      issues.push(
        `channeledSpells : doit être un tableau (reçu ${JSON.stringify(raw.channeledSpells)})`,
      )
    } else {
      const parsedChanneledSpells: ChanneledSpellConfig[] = []
      raw.channeledSpells.forEach((rawChanneledSpell, index) => {
        const channeledSpell = validateChanneledSpell(rawChanneledSpell, index, issues)
        if (channeledSpell !== null) {
          parsedChanneledSpells.push(channeledSpell)
        }
      })
      channeledSpells = parsedChanneledSpells
    }
  }

  let resourceConsumers: ResourceConsumerConfig[] | undefined
  if (raw.resourceConsumers !== undefined) {
    if (!Array.isArray(raw.resourceConsumers)) {
      issues.push(
        `resourceConsumers : doit être un tableau (reçu ${JSON.stringify(raw.resourceConsumers)})`,
      )
    } else {
      const parsedResourceConsumers: ResourceConsumerConfig[] = []
      raw.resourceConsumers.forEach((rawResourceConsumer, index) => {
        const resourceConsumer = validateResourceConsumer(rawResourceConsumer, index, issues)
        if (resourceConsumer !== null) {
          parsedResourceConsumers.push(resourceConsumer)
        }
      })
      resourceConsumers = parsedResourceConsumers
    }
  }

  if (issues.length > 0) {
    throw new RotationConfigValidationError(issues)
  }

  return {
    rules,
    ...(channeledSpells !== undefined ? { channeledSpells } : {}),
    ...(resourceConsumers !== undefined ? { resourceConsumers } : {}),
  }
}
