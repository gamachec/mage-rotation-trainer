import type { ComparisonOperator, RotationCondition } from '../types'
import { getSpellName } from './get-spell-name'
import { getPowerTypeName } from './power-type-name'

const OPERATOR_SYMBOLS: Record<ComparisonOperator, string> = {
  '==': '=',
  '!=': '≠',
  '>=': '≥',
  '<=': '≤',
  '>': '>',
  '<': '<',
}

/** Traduction en français lisible d'une condition de rotation, pour expliquer une règle à l'utilisateur. */
export function describeCondition(condition: RotationCondition): string {
  switch (condition.type) {
    case 'auraStacks':
      return `${getSpellName(condition.spellId)} ${OPERATOR_SYMBOLS[condition.operator]} ${condition.value}`
    case 'auraActive':
      return condition.active
        ? `${getSpellName(condition.spellId)} actif`
        : `${getSpellName(condition.spellId)} inactif`
    case 'spellCooldownReady':
      return `${getSpellName(condition.spellId)} prêt`
    case 'previousCastIs':
      return `sort précédent : ${getSpellName(condition.spellId)}`
    case 'resourceValue':
      return `${getPowerTypeName(condition.powerType)} ${OPERATOR_SYMBOLS[condition.operator]} ${condition.value}`
  }
}

/**
 * Traduction en français lisible d'un ensemble de conditions (ET logique, décision Étape 0) —
 * `[]` désigne une règle par défaut sans condition ("sinon"), `null` l'absence de règle
 * applicable (config incomplète).
 */
export function describeRuleConditions(conditions: RotationCondition[] | null): string {
  if (conditions === null) {
    return 'aucune règle de config applicable'
  }
  if (conditions.length === 0) {
    return 'sort par défaut'
  }
  return conditions.map(describeCondition).join(' et ')
}
