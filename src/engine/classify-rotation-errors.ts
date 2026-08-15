import type {
  RotationAnalysisResult,
  RotationComparisonResult,
  RotationGapError,
  WrongSpellError,
} from '../types'

/**
 * Seuil au-delà duquel un délai entre deux casts successifs est considéré comme un temps
 * mort dans la rotation. Constante fixe (décision actée avec l'utilisateur) — à calibrer/exposer
 * si besoin après un test sur un vrai log, sur le même principe que le seuil d'inactivité de
 * `detectCombatSegments`.
 */
export const DEFAULT_ROTATION_GAP_THRESHOLD_MS = 3000

/**
 * Classifie les erreurs de rotation (SPECS.md §6) à partir de la sortie du
 * moteur de comparaison, et calcule le score global de conformité. Les casts sans
 * sort attendu (`expectedSpellId: null`, config incomplète) sont exclus du score et ne
 * génèrent pas d'erreur "wrong-spell".
 *
 * `channelEndTimestamps` (optionnel, calculé par `analyzeRotation` via
 * `correlateChannelTicks`) : même ordre/longueur que `results`, `null` sauf pour les casts de
 * sorts canalisés — indique alors le timestamp de la dernière vague corrélée. Quand présent, le
 * calcul du gap utilise ce timestamp comme fin d'occupation du cast précédent au lieu de son
 * timestamp de début, pour ne pas compter la durée d'une canalisation comme un temps mort.
 *
 * Côté cast courant, le gap se termine à `result.startTimestamp` (début réel du cast) plutôt
 * qu'à `result.timestamp` (fin du cast, `SPELL_CAST_SUCCESS`) quand disponible — sinon, pour un
 * sort à temps de cast variable (ex : Trait prismatique, plus court à charges arcaniques
 * élevées), sa propre durée de cast serait comptée à tort comme temps mort.
 */
export function classifyRotationErrors(
  results: RotationComparisonResult[],
  gapThresholdMs: number = DEFAULT_ROTATION_GAP_THRESHOLD_MS,
  channelEndTimestamps?: (number | null)[],
): RotationAnalysisResult {
  // Cette fonction ne produit que ces deux types d'erreur (le "cooldown-wasted" de
  // `RotationError` est ajouté en aval par `detectWastedCooldowns`/`analyzeRotation`) — typer
  // l'union restreinte plutôt que `RotationError[]` évite d'accéder à `timestamp` sur un type
  // qui ne l'a pas (`CooldownWastedError` n'a que `readyAt`).
  const errors: Array<WrongSpellError | RotationGapError> = []
  let correctCasts = 0
  let incompleteConfigCasts = 0

  results.forEach((result, index) => {
    if (result.expectedSpellId === null) {
      incompleteConfigCasts++
    } else if (result.isCorrect) {
      correctCasts++
    } else {
      errors.push({
        type: 'wrong-spell',
        timestamp: result.timestamp,
        actualSpellId: result.actualSpellId,
        expectedSpellId: result.expectedSpellId,
        activeAuras: result.activeAuras,
      })
    }

    if (index > 0) {
      const previousTimestamp = channelEndTimestamps?.[index - 1] ?? results[index - 1].timestamp
      const currentStartTimestamp = result.startTimestamp ?? result.timestamp
      const durationMs = Math.max(0, currentStartTimestamp - previousTimestamp)
      if (durationMs > gapThresholdMs) {
        errors.push({ type: 'rotation-gap', timestamp: previousTimestamp, durationMs })
      }
    }
  })

  errors.sort((a, b) => a.timestamp - b.timestamp)

  const scoredCasts = results.length - incompleteConfigCasts
  const score = scoredCasts > 0 ? Math.round((correctCasts / scoredCasts) * 100) : 100

  return {
    score,
    totalCasts: results.length,
    correctCasts,
    incompleteConfigCasts,
    wastedCooldownsCount: 0,
    interruptedChannelsCount: 0,
    errors,
  }
}
