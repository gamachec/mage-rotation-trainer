<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PlayerSelector from './components/PlayerSelector.vue'
import SegmentSelector from './components/SegmentSelector.vue'
import RotationTimeline from './components/RotationTimeline.vue'
import RotationReport from './views/RotationReport.vue'
import { parseCombatLogFile } from './workers/parse-combat-log-file'
import { detectPlayers } from './parser/detect-players'
import { detectCombatSegments } from './parser/detect-combat-segments'
import { filterEventsByPlayer } from './parser/filter-events-by-player'
import { buildPlayerTimeline } from './parser/build-player-timeline'
import { compareRotation } from './engine/compare-rotation'
import { analyzeRotation } from './engine/analyze-rotation'
import { loadDefaultRotationConfig } from './data/load-default-rotation-config'
import type { CombatLogEvent, CombatSegment, Guid, RotationAnalysisResult } from './types'
import type { CombatLogParseProgress } from './parser/combat-log-parser'

const rotationConfig = loadDefaultRotationConfig()

/**
 * Seuil d'inactivité utilisé pour la détection des segments de combat (PLAN.md Étape 6/13,
 * révisé) : 5s sans nouveau sort casté par le joueur (voir `detectCombatSegments`).
 */
const INACTIVITY_THRESHOLD_MS = 5_000

const isParsing = ref(false)
const parseProgress = ref<CombatLogParseProgress | null>(null)
const parseError = ref<string | null>(null)
const events = ref<CombatLogEvent[]>([])

const selectedPlayerGuid = ref<Guid | null>(null)
const selectedSegment = ref<CombatSegment | null>(null)

const players = computed(() => detectPlayers(events.value))

const segments = computed(() => {
  if (selectedPlayerGuid.value === null) {
    return []
  }
  return detectCombatSegments(events.value, selectedPlayerGuid.value, INACTIVITY_THRESHOLD_MS)
})

const selectedPlayer = computed(() => {
  if (selectedPlayerGuid.value === null) {
    return null
  }
  return players.value.find((player) => player.guid === selectedPlayerGuid.value) ?? null
})

const playerTimeline = computed(() => {
  if (selectedPlayer.value === null || selectedSegment.value === null) {
    return null
  }
  const filteredEvents = filterEventsByPlayer(
    events.value,
    selectedPlayer.value.guid,
    selectedSegment.value,
  )
  return buildPlayerTimeline(filteredEvents, selectedPlayer.value)
})

const comparisonResults = computed(() => {
  if (playerTimeline.value === null) {
    return []
  }
  return compareRotation(playerTimeline.value, rotationConfig)
})

const EMPTY_ANALYSIS_RESULT: RotationAnalysisResult = {
  score: 100,
  totalCasts: 0,
  correctCasts: 0,
  incompleteConfigCasts: 0,
  wastedCooldownsCount: 0,
  interruptedChannelsCount: 0,
  errors: [],
}

const analysisResult = computed(() => {
  if (playerTimeline.value === null || selectedSegment.value === null) {
    return EMPTY_ANALYSIS_RESULT
  }
  return analyzeRotation(
    playerTimeline.value,
    rotationConfig,
    selectedSegment.value.startTimestamp,
    selectedSegment.value.endTimestamp,
  )
})

const progressPercent = computed(() => {
  if (parseProgress.value === null || parseProgress.value.totalLines === 0) {
    return 0
  }
  return Math.round((parseProgress.value.processedLines / parseProgress.value.totalLines) * 100)
})

// Réinitialise les sélections en aval quand leur source change (nouveau fichier, autre joueur).
watch(events, () => {
  selectedPlayerGuid.value = null
})
watch(selectedPlayerGuid, () => {
  selectedSegment.value = null
})

async function loadFile(file: File) {
  isParsing.value = true
  parseError.value = null
  parseProgress.value = null
  events.value = []

  try {
    events.value = await parseCombatLogFile(file, (progress) => {
      parseProgress.value = progress
    })
    if (events.value.length === 0) {
      parseError.value = "Aucun événement exploitable n'a été trouvé dans ce fichier."
    }
  } catch (error) {
    parseError.value =
      error instanceof Error ? error.message : 'Erreur inattendue lors du parsing du fichier.'
  } finally {
    isParsing.value = false
  }
}

function onFileInputChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    loadFile(file)
  }
}

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    loadFile(file)
  }
}
</script>

<template>
  <main>
    <h1>Mage Rotation Trainer</h1>

    <section class="dropzone" @dragover.prevent @drop.prevent="onDrop">
      <p>Dépose ton combat log ici, ou choisis un fichier :</p>
      <input type="file" accept=".txt" @change="onFileInputChange" />
    </section>

    <section v-if="isParsing" class="progress">
      <p>Analyse du fichier en cours... {{ progressPercent }}%</p>
      <progress :value="progressPercent" max="100" />
    </section>

    <p v-if="parseError" class="error" role="alert">{{ parseError }}</p>

    <section v-if="!isParsing && events.length > 0">
      <PlayerSelector v-model="selectedPlayerGuid" :players="players" />
    </section>

    <section v-if="selectedPlayerGuid !== null">
      <SegmentSelector v-model="selectedSegment" :segments="segments" />
    </section>

    <section v-if="playerTimeline !== null">
      <RotationReport :analysis-result="analysisResult" />
      <RotationTimeline
        :timeline="playerTimeline"
        :comparison-results="comparisonResults"
        :errors="analysisResult.errors"
      />
    </section>
  </main>
</template>

<style scoped>
.dropzone {
  border: 2px dashed #888;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
}

.error {
  color: #c0392b;
}
</style>
