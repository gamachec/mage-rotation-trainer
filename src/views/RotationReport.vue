<script setup lang="ts">
import { computed } from 'vue'
import type {
  ChannelInterruptedError,
  CooldownWastedError,
  RotationAnalysisResult,
  WrongSpellError,
} from '../types'
import { getSpellName } from '../data/get-spell-name'
import { getSpellIcon } from '../data/spell-icons'

/**
 * Écran de rapport final (SPECS.md §7) : score global, axes d'amélioration
 * priorisés et détail des erreurs par type. Consomme directement la sortie de
 * `classifyRotationErrors`, pas de nouvelle passe d'analyse ici.
 */
const props = defineProps<{
  analysisResult: RotationAnalysisResult
}>()

type WrongSpellGroup = {
  actualSpellId: number
  expectedSpellId: number
  count: number
}

const wrongSpellErrors = computed(
  () =>
    props.analysisResult.errors.filter(
      (error) => error.type === 'wrong-spell',
    ) as WrongSpellError[],
)

const gapErrors = computed(() =>
  props.analysisResult.errors.filter((error) => error.type === 'rotation-gap'),
)

const cooldownWastedErrors = computed(
  () =>
    props.analysisResult.errors.filter(
      (error) => error.type === 'cooldown-wasted',
    ) as CooldownWastedError[],
)

const interruptedChannelErrors = computed(
  () =>
    props.analysisResult.errors.filter(
      (error) => error.type === 'channel-interrupted',
    ) as ChannelInterruptedError[],
)

type CooldownWastedGroup = { spellId: number; count: number }

const cooldownWastedGroups = computed<CooldownWastedGroup[]>(() => {
  const counts = new Map<number, CooldownWastedGroup>()
  for (const error of cooldownWastedErrors.value) {
    const existing = counts.get(error.spellId)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(error.spellId, { spellId: error.spellId, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
})

const wrongSpellGroups = computed<WrongSpellGroup[]>(() => {
  const counts = new Map<string, WrongSpellGroup>()
  for (const error of wrongSpellErrors.value) {
    const key = `${error.actualSpellId}->${error.expectedSpellId}`
    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(key, {
        actualSpellId: error.actualSpellId,
        expectedSpellId: error.expectedSpellId,
        count: 1,
      })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
})

const topImprovementAxes = computed(() => wrongSpellGroups.value.slice(0, 5))

const totalGapDurationMs = computed(() =>
  gapErrors.value.reduce((sum, error) => sum + error.durationMs, 0),
)

function formatSeconds(durationMs: number): string {
  return `${Math.round(durationMs / 1000)}s`
}
</script>

<template>
  <section class="rotation-report">
    <div class="rotation-report__hero">
      <div class="rotation-report__dial" :style="{ '--score': analysisResult.score }">
        <span class="rotation-report__score">{{ analysisResult.score }}%</span>
        <span class="rotation-report__dial-label">conformité</span>
      </div>

      <section v-if="topImprovementAxes.length > 0" class="rotation-report__axes-block">
        <h3>Axes d'amélioration prioritaires</h3>
        <ol class="rotation-report__axes">
          <li
            v-for="axis in topImprovementAxes"
            :key="`${axis.actualSpellId}-${axis.expectedSpellId}`"
          >
            Vous avez casté <strong>{{ getSpellName(axis.actualSpellId) }}</strong> au lieu de
            <strong>{{ getSpellName(axis.expectedSpellId) }}</strong> attendu — {{ axis.count }}
            fois
          </li>
        </ol>
      </section>
    </div>

    <section class="rotation-report__section">
      <h3>Statistiques</h3>
      <ul class="rotation-report__stats">
        <li>Casts analysés : {{ analysisResult.totalCasts }}</li>
        <li>Casts corrects : {{ analysisResult.correctCasts }}</li>
        <li>Casts sans règle de config applicable : {{ analysisResult.incompleteConfigCasts }}</li>
        <li>
          Temps morts détectés : {{ gapErrors.length }} ({{ formatSeconds(totalGapDurationMs) }} au
          total)
        </li>
        <li>Cooldowns de burst gaspillés : {{ analysisResult.wastedCooldownsCount }}</li>
        <li>Canalisations interrompues : {{ analysisResult.interruptedChannelsCount }}</li>
      </ul>
    </section>

    <section v-if="wrongSpellGroups.length > 0" class="rotation-report__section">
      <h3>Mauvais sorts castés ({{ wrongSpellErrors.length }})</h3>
      <ul class="rotation-report__errors">
        <li
          v-for="group in wrongSpellGroups"
          :key="`${group.actualSpellId}-${group.expectedSpellId}`"
        >
          <img
            v-if="getSpellIcon(group.actualSpellId)"
            class="rotation-report__icon"
            :src="getSpellIcon(group.actualSpellId)!"
            :alt="getSpellName(group.actualSpellId)"
          />
          {{ getSpellName(group.actualSpellId) }} au lieu de
          {{ getSpellName(group.expectedSpellId) }} — {{ group.count }} fois
        </li>
      </ul>
    </section>

    <section v-if="gapErrors.length > 0" class="rotation-report__section">
      <h3>Temps morts dans la rotation ({{ gapErrors.length }})</h3>
      <ul class="rotation-report__errors">
        <li v-for="(error, index) in gapErrors" :key="index">
          {{ formatSeconds(error.durationMs) }} sans cast
        </li>
      </ul>
    </section>

    <section v-if="cooldownWastedGroups.length > 0" class="rotation-report__section">
      <h3>Cooldowns de burst gaspillés ({{ cooldownWastedErrors.length }})</h3>
      <ul class="rotation-report__errors">
        <li v-for="group in cooldownWastedGroups" :key="group.spellId">
          {{ getSpellName(group.spellId) }} — {{ group.count }} fois
        </li>
      </ul>
      <ul class="rotation-report__errors">
        <li v-for="(error, index) in cooldownWastedErrors" :key="index">
          {{ getSpellName(error.spellId) }} prêt à {{ formatSeconds(error.readyAt) }}, recasté
          {{ error.castAt !== null ? `à ${formatSeconds(error.castAt)}` : 'jamais' }} — délai de
          {{ formatSeconds(error.delayMs) }}
        </li>
      </ul>
    </section>

    <section v-if="interruptedChannelErrors.length > 0" class="rotation-report__section">
      <h3>Canalisations interrompues ({{ interruptedChannelErrors.length }})</h3>
      <ul class="rotation-report__errors">
        <li v-for="(error, index) in interruptedChannelErrors" :key="index">
          {{ getSpellName(error.spellId) }} à {{ formatSeconds(error.timestamp) }} —
          {{ error.actualTicks }}/{{ error.expectedTicks }} vagues
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.rotation-report__hero {
  display: flex;
  align-items: center;
  gap: 2rem;
  flex-wrap: wrap;
}

.rotation-report__dial {
  --ring-size: 8.5rem;
  width: var(--ring-size);
  height: var(--ring-size);
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: conic-gradient(
    var(--arcane-400) calc(var(--score) * 1%),
    var(--ink-800) calc(var(--score) * 1%)
  );
  box-shadow: 0 0 22px var(--arcane-glow);
  position: relative;
}

.rotation-report__dial::before {
  content: '';
  position: absolute;
  inset: 0.55rem;
  border-radius: 50%;
  background: var(--ink-900);
  border: 1px solid var(--hairline-strong);
}

.rotation-report__score {
  position: relative;
  font-family: var(--font-display);
  font-size: 2rem;
  color: var(--gold-300);
}

.rotation-report__dial-label {
  position: relative;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--mist);
}

.rotation-report__axes-block {
  flex: 1;
  min-width: 16rem;
}

.rotation-report__axes-block h3 {
  color: var(--gold-300);
  font-size: 1rem;
  margin-bottom: 0.6rem;
}

.rotation-report__section {
  margin-top: 1.75rem;
}

.rotation-report__section h3 {
  color: var(--gold-300);
  font-size: 1rem;
  margin-bottom: 0.6rem;
}

.rotation-report__axes,
.rotation-report__errors,
.rotation-report__stats {
  padding-left: 1.25rem;
  color: var(--parchment);
  font-size: 0.9rem;
  line-height: 1.7;
}

.rotation-report__stats {
  list-style: none;
  padding-left: 0;
  color: var(--mist);
}

.rotation-report__errors li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.rotation-report__icon {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 3px;
  border: 1px solid var(--hairline-strong);
}
</style>
