import { correlateChannelTicks } from './channeled-spells'
import {
  classifyRotationErrors,
  DEFAULT_ROTATION_GAP_THRESHOLD_MS,
} from './classify-rotation-errors'
import { compareRotation } from './compare-rotation'
import { detectInterruptedChannels } from './detect-interrupted-channels'
import {
  DEFAULT_COOLDOWN_WASTED_THRESHOLD_MS,
  detectWastedCooldowns,
} from './detect-wasted-cooldowns'
import type { PlayerTimeline, RotationAnalysisResult, RotationConfig } from '../types'

/**
 * Point d'orchestration de l'analyse d'une rotation (PLAN-BURST.md Étape 3, option (b),
 * révision post-Étape 16 pour les canalisations) :
 * `compareRotation` → `correlateChannelTicks` (vagues de dégâts corrélées à leur cast canalisé)
 * → `classifyRotationErrors` (score "casts seuls", gap corrigé par la fin de canalisation)
 * → `detectWastedCooldowns` + `detectInterruptedChannels`, fusion des trois listes d'erreurs et
 * recalcul du score final incluant les cooldowns de burst gaspillés et les canalisations
 * interrompues (décision BURST-0.4, étendue) :
 *
 *   scoredCasts = totalCasts - incompleteConfigCasts
 *   score = correctCasts / (scoredCasts + wastedCooldownsCount + interruptedChannelsCount)
 *
 * `correctCasts` est inchangé — un cooldown gaspillé ou une canalisation interrompue n'ajoute
 * jamais de point, ça agrandit uniquement le dénominateur. 100% par défaut si le dénominateur
 * est 0.
 */
export function analyzeRotation(
  timeline: PlayerTimeline,
  config: RotationConfig,
  segmentStartTimestamp: number,
  segmentEndTimestamp: number,
  gapThresholdMs: number = DEFAULT_ROTATION_GAP_THRESHOLD_MS,
  wastedThresholdMs: number = DEFAULT_COOLDOWN_WASTED_THRESHOLD_MS,
): RotationAnalysisResult {
  const comparisonResults = compareRotation(timeline, config)
  const channelEndTimestamps = correlateChannelTicks(timeline, config).map((tickInfo) =>
    tickInfo !== null && tickInfo.tickTimestamps.length > 0
      ? tickInfo.tickTimestamps[tickInfo.tickTimestamps.length - 1]
      : null,
  )
  const castsOnlyAnalysis = classifyRotationErrors(
    comparisonResults,
    gapThresholdMs,
    channelEndTimestamps,
  )
  const wastedCooldowns = detectWastedCooldowns(
    timeline,
    config,
    segmentStartTimestamp,
    segmentEndTimestamp,
    wastedThresholdMs,
  )
  const interruptedChannels = detectInterruptedChannels(timeline, config)

  const errors = [...castsOnlyAnalysis.errors, ...wastedCooldowns, ...interruptedChannels].sort(
    (a, b) => {
      const aTimestamp = a.type === 'cooldown-wasted' ? a.readyAt : a.timestamp
      const bTimestamp = b.type === 'cooldown-wasted' ? b.readyAt : b.timestamp
      return aTimestamp - bTimestamp
    },
  )

  const scoredCasts = castsOnlyAnalysis.totalCasts - castsOnlyAnalysis.incompleteConfigCasts
  const denominator = scoredCasts + wastedCooldowns.length + interruptedChannels.length
  const score =
    denominator > 0 ? Math.round((castsOnlyAnalysis.correctCasts / denominator) * 100) : 100

  return {
    score,
    totalCasts: castsOnlyAnalysis.totalCasts,
    correctCasts: castsOnlyAnalysis.correctCasts,
    incompleteConfigCasts: castsOnlyAnalysis.incompleteConfigCasts,
    wastedCooldownsCount: wastedCooldowns.length,
    interruptedChannelsCount: interruptedChannels.length,
    errors,
  }
}
