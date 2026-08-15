<script setup lang="ts">
import { computed, watch } from 'vue'
import type { CombatSegment } from '../types'

/**
 * Sélection du segment de combat à analyser parmi ceux détectés dans le log
 * (SPECS.md §3.5). S'il n'y a qu'un seul segment, il est sélectionné automatiquement
 * sans solliciter l'utilisateur, sur le même modèle que PlayerSelector (PLAN.md Étape 13).
 */
const props = defineProps<{
  segments: CombatSegment[]
  modelValue: CombatSegment | null
}>()

const emit = defineEmits<{
  'update:modelValue': [segment: CombatSegment]
}>()

const hasSingleSegment = computed(() => props.segments.length === 1)

const selectedIndex = computed(() => {
  if (props.modelValue === null) {
    return ''
  }
  // Comparaison par valeur plutôt que par référence : modelValue peut être un proxy Vue
  // distinct de l'élément d'origine dans `segments` après un aller-retour par le v-model
  // du parent (props réactives ré-enveloppées), même s'il représente le même segment.
  const value = props.modelValue
  const index = props.segments.findIndex(
    (segment) =>
      segment.startTimestamp === value.startTimestamp &&
      segment.endTimestamp === value.endTimestamp,
  )
  return index === -1 ? '' : index
})

watch(
  () => props.segments,
  (segments) => {
    if (segments.length === 1) {
      emit('update:modelValue', segments[0])
    }
  },
  { immediate: true },
)

function formatDuration(segment: CombatSegment): string {
  const seconds = Math.round((segment.endTimestamp - segment.startTimestamp) / 1000)
  return `${seconds}s`
}

function onSelect(event: Event) {
  const index = Number((event.target as HTMLSelectElement).value)
  emit('update:modelValue', props.segments[index])
}
</script>

<template>
  <div class="segment-selector">
    <p v-if="segments.length === 0" class="segment-selector__empty">
      Aucun segment de combat détecté pour ce joueur.
    </p>

    <p v-else-if="hasSingleSegment" class="segment-selector__single">
      Segment de combat détecté : <strong>{{ formatDuration(segments[0]) }}</strong>
    </p>

    <label v-else class="segment-selector__field">
      Sélectionne le segment de combat à analyser :
      <select :value="selectedIndex" @change="onSelect">
        <option value="" disabled>-- Choisir --</option>
        <option v-for="(segment, index) in segments" :key="index" :value="index">
          Segment {{ index + 1 }} ({{ formatDuration(segment) }})
        </option>
      </select>
    </label>
  </div>
</template>
