<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerTimeline, RotationComparisonResult, RotationError } from '../types'
import { getSpellName } from '../data/get-spell-name'

/**
 * Visualisation de la timeline du combat (SPECS.md §7, PLAN.md Étape 14) : sorts castés,
 * changements de buffs/stacks, avec surlignage des erreurs détectées. Fusionne quatre sources
 * déjà produites par le pipeline `/engine` en une seule liste chronologique :
 * - `timeline.casts` (Étape 8) recoupé avec `comparisonResults` (Étape 10, même ordre/longueur
 *   que `timeline.casts` — `compareRotation` mappe dans cet ordre) pour savoir si un cast est
 *   correct et quel sort était attendu à la place.
 * - `timeline.auraChanges` (Étape 8) pour les gains/pertes de stacks.
 * - `errors` filtré sur `rotation-gap` (Étape 11) pour les temps morts entre deux casts.
 * - `errors` filtré sur `cooldown-wasted` (PLAN-BURST.md Étape 5) pour les cooldowns de burst
 *   suivis restés prêts sans être recastés, positionnés à `readyAt`.
 */
const props = defineProps<{
  timeline: PlayerTimeline
  comparisonResults: RotationComparisonResult[]
  errors: RotationError[]
}>()

type CastItem = {
  kind: 'cast'
  timestamp: number
  actualSpellId: number
  actualSpellName: string
  isCorrect: boolean
  expectedSpellId: number | null
}

type AuraChangeItem = {
  kind: 'aura-change'
  timestamp: number
  spellName: string
  stacks: number
}

type GapItem = {
  kind: 'gap'
  timestamp: number
  durationMs: number
}

type CooldownWastedItem = {
  kind: 'cooldown-wasted'
  timestamp: number
  spellId: number
  castAt: number | null
  delayMs: number
}

type ChannelInterruptedItem = {
  kind: 'channel-interrupted'
  timestamp: number
  spellId: number
  actualTicks: number
  expectedTicks: number
}

type TimelineItem =
  CastItem | AuraChangeItem | GapItem | CooldownWastedItem | ChannelInterruptedItem

const items = computed<TimelineItem[]>(() => {
  const castItems: CastItem[] = props.timeline.casts.map((cast, index) => {
    const result = props.comparisonResults[index]
    return {
      kind: 'cast',
      timestamp: cast.timestamp,
      actualSpellId: cast.spell.id,
      actualSpellName: cast.spell.name,
      isCorrect: result?.isCorrect ?? false,
      expectedSpellId: result?.expectedSpellId ?? null,
    }
  })

  const auraChangeItems: AuraChangeItem[] = props.timeline.auraChanges.map((change) => ({
    kind: 'aura-change',
    timestamp: change.timestamp,
    spellName: change.aura.name,
    stacks: change.aura.stacks,
  }))

  const gapItems: GapItem[] = props.errors
    .filter((error) => error.type === 'rotation-gap')
    .map((error) => ({ kind: 'gap', timestamp: error.timestamp, durationMs: error.durationMs }))

  const cooldownWastedItems: CooldownWastedItem[] = props.errors
    .filter((error) => error.type === 'cooldown-wasted')
    .map((error) => ({
      kind: 'cooldown-wasted',
      timestamp: error.readyAt,
      spellId: error.spellId,
      castAt: error.castAt,
      delayMs: error.delayMs,
    }))

  const channelInterruptedItems: ChannelInterruptedItem[] = props.errors
    .filter((error) => error.type === 'channel-interrupted')
    .map((error) => ({
      kind: 'channel-interrupted',
      timestamp: error.timestamp,
      spellId: error.spellId,
      actualTicks: error.actualTicks,
      expectedTicks: error.expectedTicks,
    }))

  return [
    ...castItems,
    ...auraChangeItems,
    ...gapItems,
    ...cooldownWastedItems,
    ...channelInterruptedItems,
  ].sort((a, b) => a.timestamp - b.timestamp)
})

const startTimestamp = computed(() => {
  const timestamps = items.value.map((item) => item.timestamp)
  return timestamps.length > 0 ? Math.min(...timestamps) : 0
})

function formatOffset(timestamp: number): string {
  const elapsedSeconds = Math.max(0, Math.round((timestamp - startTimestamp.value) / 1000))
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
</script>

<template>
  <ol class="rotation-timeline">
    <li v-if="items.length === 0" class="rotation-timeline__empty">
      Aucun événement à afficher pour ce segment.
    </li>

    <li
      v-for="(item, index) in items"
      :key="index"
      class="rotation-timeline__item"
      :class="{
        'rotation-timeline__item--wrong': item.kind === 'cast' && !item.isCorrect,
        'rotation-timeline__item--gap': item.kind === 'gap',
        'rotation-timeline__item--cooldown-wasted': item.kind === 'cooldown-wasted',
        'rotation-timeline__item--channel-interrupted': item.kind === 'channel-interrupted',
      }"
    >
      <span class="rotation-timeline__time">{{ formatOffset(item.timestamp) }}</span>

      <template v-if="item.kind === 'cast'">
        <span class="rotation-timeline__label">{{ item.actualSpellName }}</span>
        <span
          v-if="!item.isCorrect && item.expectedSpellId !== null"
          class="rotation-timeline__note"
        >
          attendu : {{ getSpellName(item.expectedSpellId) }}
        </span>
      </template>

      <template v-else-if="item.kind === 'aura-change'">
        <span class="rotation-timeline__label rotation-timeline__label--aura">
          {{ item.spellName }} ({{ item.stacks }})
        </span>
      </template>

      <template v-else-if="item.kind === 'gap'">
        <span class="rotation-timeline__label"
          >Temps mort ({{ Math.round(item.durationMs / 1000) }}s)</span
        >
      </template>

      <template v-else-if="item.kind === 'cooldown-wasted'">
        <span class="rotation-timeline__label">
          CD gaspillé : {{ getSpellName(item.spellId) }} (prêt, recasté
          {{ item.castAt !== null ? `${Math.round(item.delayMs / 1000)}s plus tard` : 'jamais' }})
        </span>
      </template>

      <template v-else>
        <span class="rotation-timeline__label">
          Canalisation interrompue : {{ getSpellName(item.spellId) }} ({{ item.actualTicks }}/{{
            item.expectedTicks
          }}
          vagues)
        </span>
      </template>
    </li>
  </ol>
</template>

<style scoped>
.rotation-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 24rem;
  overflow-y: auto;
}

.rotation-timeline__item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.rotation-timeline__item--wrong {
  background: #fdecea;
}

.rotation-timeline__item--gap {
  background: #fdf3d0;
}

.rotation-timeline__item--cooldown-wasted {
  background: #f0e4fa;
}

.rotation-timeline__item--channel-interrupted {
  background: #fde2e2;
}

.rotation-timeline__time {
  font-variant-numeric: tabular-nums;
  color: #666;
  min-width: 3rem;
}

.rotation-timeline__label--aura {
  color: #555;
  font-size: 0.9em;
}

.rotation-timeline__note {
  color: #c0392b;
  font-size: 0.9em;
}

.rotation-timeline__empty {
  color: #666;
}
</style>
