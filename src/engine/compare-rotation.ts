import type {
  Aura,
  ComparisonOperator,
  PlayerTimeline,
  ResourceConsumerConfig,
  RotationComparisonResult,
  RotationCondition,
  RotationConfig,
  RotationRule,
  TimelineAuraChange,
  TimelineCast,
  TimelineResourceGain,
} from '../types'
import { resolveResourceValueBefore } from './resource-tracker'

function compareNumbers(current: number, operator: ComparisonOperator, value: number): boolean {
  switch (operator) {
    case '==':
      return current === value
    case '!=':
      return current !== value
    case '>=':
      return current >= value
    case '<=':
      return current <= value
    case '>':
      return current > value
    case '<':
      return current < value
  }
}

/**
 * Fenêtre en dessous de laquelle un changement d'aura juste avant un cast est traité comme une
 * conséquence de ce cast plutôt qu'un état qui a motivé le choix du joueur (ex : un cast qui proc
 * un buff). Les vrais combat logs WoW n'écrivent pas ces deux événements au même timestamp exact :
 * observé jusqu'à 3 ms d'écart entre le `SPELL_AURA_APPLIED` d'un buff et le `SPELL_CAST_SUCCESS`
 * du cast qui l'a proc. Un seuil de 300 ms reste très en dessous du GCD/temps de cast (~1s+), donc
 * ne risque pas d'exclure un changement d'aura réellement antérieur et décisionnel.
 */
const AURA_CHANGE_CAUSALITY_WINDOW_MS = 300

/**
 * Reconstruit l'état des auras actives sur le joueur juste avant `timestamp`, à partir de
 * la liste chronologique (non agrégée) des changements d'aura de la timeline.
 */
function resolveActiveAurasBefore(
  auraChanges: TimelineAuraChange[],
  timestamp: number,
): Map<number, Aura> {
  const activeAuras = new Map<number, Aura>()

  for (const change of auraChanges) {
    if (change.timestamp >= timestamp - AURA_CHANGE_CAUSALITY_WINDOW_MS) {
      break
    }
    if (change.aura.stacks <= 0) {
      activeAuras.delete(change.aura.spellId)
    } else {
      activeAuras.set(change.aura.spellId, change.aura)
    }
  }

  return activeAuras
}

/**
 * Timestamp du cast le plus récent de `spellId` dans `castsBefore` (casts strictement avant
 * l'instant évalué), ou `null` si aucun (PLAN-BURST.md Étape 2).
 */
function lastCastTimestampBefore(castsBefore: TimelineCast[], spellId: number): number | null {
  for (let i = castsBefore.length - 1; i >= 0; i--) {
    if (castsBefore[i].spell.id === spellId) {
      return castsBefore[i].timestamp
    }
  }
  return null
}

function evaluateCondition(
  condition: RotationCondition,
  activeAuras: Map<number, Aura>,
  castsBefore: TimelineCast[],
  timestamp: number,
  resourceGains: TimelineResourceGain[],
  resourceConsumers: ResourceConsumerConfig[],
): boolean {
  switch (condition.type) {
    case 'auraStacks': {
      const stacks = activeAuras.get(condition.spellId)?.stacks ?? 0
      return compareNumbers(stacks, condition.operator, condition.value)
    }
    case 'auraActive': {
      const isActive = activeAuras.has(condition.spellId)
      return isActive === condition.active
    }
    case 'spellCooldownReady': {
      const lastCastTimestamp = lastCastTimestampBefore(castsBefore, condition.spellId)
      return lastCastTimestamp === null || timestamp - lastCastTimestamp >= condition.cooldownMs
    }
    case 'previousCastIs': {
      const previousCast = castsBefore[castsBefore.length - 1]
      return previousCast !== undefined && previousCast.spell.id === condition.spellId
    }
    case 'resourceValue': {
      const value = resolveResourceValueBefore(
        resourceGains,
        castsBefore,
        resourceConsumers,
        condition.powerType,
        timestamp,
      )
      return compareNumbers(value, condition.operator, condition.value)
    }
  }
}

function matchesRule(
  rule: RotationRule,
  activeAuras: Map<number, Aura>,
  castsBefore: TimelineCast[],
  timestamp: number,
  resourceGains: TimelineResourceGain[],
  resourceConsumers: ResourceConsumerConfig[],
): boolean {
  return rule.conditions.every((condition) =>
    evaluateCondition(
      condition,
      activeAuras,
      castsBefore,
      timestamp,
      resourceGains,
      resourceConsumers,
    ),
  )
}

/**
 * Détermine la règle attendue par la config de rotation, compte tenu de l'état d'auras et de
 * l'historique des casts précédents donnés (première règle dont toutes les conditions sont
 * vraies, décision Étape 0). `null` si aucune règle ne matche (config incomplète, pas de
 * "sinon" par défaut). `castsBefore`/`timestamp` ne sont utiles qu'aux conditions
 * `spellCooldownReady`/`previousCastIs` (PLAN-BURST.md Étape 2), `resourceGains` qu'aux
 * conditions `resourceValue` (PLAN.md Étape 18) — omissibles pour les config qui n'en
 * utilisent pas.
 */
export function resolveExpectedRule(
  config: RotationConfig,
  activeAuras: Map<number, Aura>,
  castsBefore: TimelineCast[] = [],
  timestamp: number = Number.POSITIVE_INFINITY,
  resourceGains: TimelineResourceGain[] = [],
): RotationRule | null {
  const resourceConsumers = config.resourceConsumers ?? []
  return (
    config.rules.find((rule) =>
      matchesRule(rule, activeAuras, castsBefore, timestamp, resourceGains, resourceConsumers),
    ) ?? null
  )
}

/** Même résolution que `resolveExpectedRule`, ne retournant que le `spellId` attendu. */
export function resolveExpectedSpell(
  config: RotationConfig,
  activeAuras: Map<number, Aura>,
  castsBefore: TimelineCast[] = [],
  timestamp: number = Number.POSITIVE_INFINITY,
  resourceGains: TimelineResourceGain[] = [],
): number | null {
  return (
    resolveExpectedRule(config, activeAuras, castsBefore, timestamp, resourceGains)?.spellId ??
    null
  )
}

/**
 * Moteur de comparaison (SPECS.md §6, PLAN.md Étape 10) : pour chaque cast réel de la
 * timeline, détermine le sort attendu par la config de rotation compte tenu de l'état
 * d'auras au moment du cast, et le compare au sort effectivement casté. Générique — ne
 * contient aucune règle Arcane en dur, toute la logique spécifique vit dans `config`.
 */
export function compareRotation(
  timeline: PlayerTimeline,
  config: RotationConfig,
): RotationComparisonResult[] {
  const resourceConsumers = config.resourceConsumers ?? []
  const powerTypes = [...new Set(timeline.resourceGains.map((gain) => gain.powerType))]

  return timeline.casts.map((cast, index) => {
    const activeAuras = resolveActiveAurasBefore(timeline.auraChanges, cast.timestamp)
    const castsBefore = timeline.casts.slice(0, index)
    const expectedRule = resolveExpectedRule(
      config,
      activeAuras,
      castsBefore,
      cast.timestamp,
      timeline.resourceGains,
    )
    const expectedSpellId = expectedRule?.spellId ?? null
    const resourceValues = powerTypes.map((powerType) => ({
      powerType,
      value: resolveResourceValueBefore(
        timeline.resourceGains,
        castsBefore,
        resourceConsumers,
        powerType,
        cast.timestamp,
      ),
    }))

    return {
      timestamp: cast.timestamp,
      actualSpellId: cast.spell.id,
      expectedSpellId,
      expectedSpellRuleConditions: expectedRule?.conditions ?? null,
      isCorrect: expectedSpellId !== null && expectedSpellId === cast.spell.id,
      activeAuras: [...activeAuras.values()],
      resourceValues,
    }
  })
}
