import type { CooldownWastedError, PlayerTimeline, RotationConfig } from '../types'

/**
 * Seuil au-delà duquel un cooldown de burst resté prêt sans être recasté est considéré comme
 * gaspillé.
 */
export const DEFAULT_COOLDOWN_WASTED_THRESHOLD_MS = 2500

type TrackedCooldown = { spellId: number; cooldownMs: number }

/**
 * Un cooldown de burst « suivi » est une règle dont une condition `spellCooldownReady` porte
 * sur le même `spellId` que la règle elle-même (auto-référence) : évite un champ de config
 * dédié, reste générique. Dédupliqué par `spellId` : plusieurs règles peuvent cibler le même
 * sort pour exprimer un "OU" (même `spellId`, conditions différentes), le cooldown ne doit
 * être suivi qu'une seule fois.
 */
function findTrackedCooldowns(config: RotationConfig): TrackedCooldown[] {
  const tracked = new Map<number, TrackedCooldown>()
  for (const rule of config.rules) {
    for (const condition of rule.conditions) {
      if (condition.type === 'spellCooldownReady' && condition.spellId === rule.spellId) {
        tracked.set(rule.spellId, { spellId: rule.spellId, cooldownMs: condition.cooldownMs })
      }
    }
  }
  return [...tracked.values()]
}

/**
 * Détecte les cooldowns de burst suivis prêts-et-non-utilisés au-delà
 * de `wastedThresholdMs`, sur la timeline d'un joueur. Le CD est supposé disponible dès le
 * début du segment (`segmentStartTimestamp`) puis redevient prêt `cooldownMs` après chaque
 * cast réel. `segmentStartTimestamp` doit être passé explicitement (pas de `0` en dur) : les
 * timestamps de la timeline restent relatifs au début du **fichier** de log, pas du segment
 * (ni `filterEventsByPlayer` ni `buildPlayerTimeline` ne les rebasent) — un `0` en dur aurait
 * produit un faux "délai" quand le segment démarre après le début du fichier.
 */
export function detectWastedCooldowns(
  timeline: PlayerTimeline,
  config: RotationConfig,
  segmentStartTimestamp: number,
  segmentEndTimestamp: number,
  wastedThresholdMs = DEFAULT_COOLDOWN_WASTED_THRESHOLD_MS,
): CooldownWastedError[] {
  const errors: CooldownWastedError[] = []

  for (const { spellId, cooldownMs } of findTrackedCooldowns(config)) {
    const castsOfSpell = timeline.casts
      .filter((cast) => cast.spell.id === spellId)
      .map((cast) => cast.timestamp)
      .sort((a, b) => a - b)

    const readyTimestamps = [
      segmentStartTimestamp,
      ...castsOfSpell.map((timestamp) => timestamp + cooldownMs),
    ]

    for (const readyAt of readyTimestamps) {
      const nextCast = castsOfSpell.find((timestamp) => timestamp >= readyAt)

      if (nextCast !== undefined) {
        const delayMs = nextCast - readyAt
        if (delayMs > wastedThresholdMs) {
          errors.push({ type: 'cooldown-wasted', spellId, readyAt, castAt: nextCast, delayMs })
        }
      } else {
        const delayMs = segmentEndTimestamp - readyAt
        if (delayMs > wastedThresholdMs) {
          errors.push({ type: 'cooldown-wasted', spellId, readyAt, castAt: null, delayMs })
        }
      }
    }
  }

  return errors.sort((a, b) => a.readyAt - b.readyAt)
}
