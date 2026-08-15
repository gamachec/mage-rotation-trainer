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
 * Fenêtre en dessous de laquelle une *activation* d'aura (application/refresh, pas une
 * disparition) juste avant un cast est traitée comme une conséquence de ce cast plutôt qu'un
 * état qui a motivé le choix du joueur (ex : un cast qui proc un buff). Les vrais combat logs
 * WoW n'écrivent pas ces deux événements au même timestamp exact : observé jusqu'à 3 ms d'écart
 * entre le `SPELL_AURA_APPLIED` d'un buff et le `SPELL_CAST_SUCCESS` du cast qui l'a proc. Un
 * seuil de 300 ms reste très en dessous du GCD/temps de cast (~1s+), donc ne risque pas d'exclure
 * une activation réellement antérieure et décisionnelle.
 *
 * Ne s'applique volontairement PAS aux disparitions d'aura (stacks à 0, ex : buff consommé par
 * un cast) : observé sur un vrai log deux casts quasi simultanés (un cast instantané suivi 5 ms
 * plus tard d'un autre) où le retrait du buff consommé par le premier cast est loggé à peine
 * 2 ms avant le second cast — plus près dans le temps que sa propre cause. Fenêtrer aussi les
 * disparitions ferait perdre cette consommation réelle et biaiserait l'évaluation du second cast
 * (buff à tort vu comme encore actif). Une disparition compte donc dès qu'elle est strictement
 * avant le cast évalué, quel que soit l'écart.
 */
const AURA_ACTIVATION_CAUSALITY_WINDOW_MS = 300

/**
 * Reconstruit l'état des auras actives sur le joueur juste avant `timestamp`, à partir de
 * la liste chronologique (non agrégée) des changements d'aura de la timeline.
 *
 * L'ordre relatif utilise `sequence` (position dans le flux d'événements source) plutôt que
 * `timestamp` pour décider si un changement d'aura précède le cast évalué : un vrai combat log
 * a une résolution de timestamp limitée, et deux casts très rapprochés (ex : un cast quasi
 * instantané suivi d'un autre au tick suivant) peuvent partager le même timestamp qu'un
 * changement d'aura qui n'est la conséquence que de l'un des deux. Confirmé sur un vrai log :
 * un buff consommé par le cast précédent peut être logué exactement au même timestamp que le
 * `SPELL_CAST_SUCCESS` du cast suivant — avec une comparaison par `timestamp` seul, ce retrait
 * était exclu à tort (traité comme "conséquence du cast suivant") alors qu'il datait bien
 * d'avant lui. `sequence` lève cette ambiguïté (`change.sequence < sequence` ⟺ le changement a
 * été logué avant le cast évalué, indépendamment d'un timestamp identique). Repli sur
 * `timestamp` si `sequence` est absent (timelines construites à la main en test).
 */
function resolveActiveAurasBefore(
  auraChanges: TimelineAuraChange[],
  timestamp: number,
  sequence: number,
): Map<number, Aura> {
  const activeAuras = new Map<number, Aura>()

  for (const change of auraChanges) {
    if ((change.sequence ?? change.timestamp) >= sequence) {
      break
    }
    const isActivation = change.aura.stacks > 0
    if (isActivation && change.timestamp >= timestamp - AURA_ACTIVATION_CAUSALITY_WINDOW_MS) {
      continue
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
 * l'instant évalué), ou `null` si aucun.
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
 * vraies). `null` si aucune règle ne matche (config incomplète, pas de
 * "sinon" par défaut). `castsBefore`/`timestamp` ne sont utiles qu'aux conditions
 * `spellCooldownReady`/`previousCastIs`, `resourceGains` qu'aux
 * conditions `resourceValue` — omissibles pour les config qui n'en
 * utilisent pas.
 *
 * Ne tient pas compte d'`openerSequence` (voir `resolveExpectedSpell`/`compareRotation`) :
 * cette fonction reste la résolution "règles classiques" pure, réutilisée telle quelle une
 * fois l'opener épuisé.
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

/**
 * Même résolution que `resolveExpectedRule`, ne retournant que le `spellId` attendu.
 *
 * `openerCastIndex` (optionnel) : position du cast évalué parmi les casts
 * connus du segment (0-based). Si fournie et inférieure à `config.openerSequence.length`, le
 * sort attendu est directement `config.openerSequence[openerCastIndex]` — résolution
 * positionnelle prioritaire sur `rules`, qu'importe si les étapes précédentes de l'opener ont
 * été castées correctement (pas de pointeur qui reste bloqué sur une étape ratée, décision
 * utilisateur : la fenêtre est toujours limitée aux `openerSequence.length` premiers casts).
 */
export function resolveExpectedSpell(
  config: RotationConfig,
  activeAuras: Map<number, Aura>,
  castsBefore: TimelineCast[] = [],
  timestamp: number = Number.POSITIVE_INFINITY,
  resourceGains: TimelineResourceGain[] = [],
  openerCastIndex?: number,
): number | null {
  if (
    openerCastIndex !== undefined &&
    config.openerSequence !== undefined &&
    openerCastIndex < config.openerSequence.length
  ) {
    return config.openerSequence[openerCastIndex]
  }
  return (
    resolveExpectedRule(config, activeAuras, castsBefore, timestamp, resourceGains)?.spellId ??
    null
  )
}

/**
 * Moteur de comparaison (SPECS.md §6) : pour chaque cast réel de la
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
    const activeAuras = resolveActiveAurasBefore(
      timeline.auraChanges,
      cast.timestamp,
      cast.sequence ?? cast.timestamp,
    )
    const castsBefore = timeline.casts.slice(0, index)
    const isOpenerCast = index < (config.openerSequence?.length ?? 0)
    const expectedRule = isOpenerCast
      ? null
      : resolveExpectedRule(config, activeAuras, castsBefore, cast.timestamp, timeline.resourceGains)
    const expectedSpellId = resolveExpectedSpell(
      config,
      activeAuras,
      castsBefore,
      cast.timestamp,
      timeline.resourceGains,
      index,
    )
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
      ...(cast.startTimestamp !== undefined && { startTimestamp: cast.startTimestamp }),
      actualSpellId: cast.spell.id,
      expectedSpellId,
      expectedSpellRuleConditions: expectedRule?.conditions ?? null,
      isCorrect: expectedSpellId !== null && expectedSpellId === cast.spell.id,
      activeAuras: [...activeAuras.values()],
      resourceValues,
    }
  })
}
