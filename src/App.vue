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
import { filterTimelineToKnownSpells } from './engine/known-rotation-spells'
import { loadDefaultRotationConfig } from './data/load-default-rotation-config'
import type { CombatLogEvent, CombatSegment, Guid, RotationAnalysisResult } from './types'
import type { CombatLogParseProgress } from './parser/combat-log-parser'

const rotationConfig = loadDefaultRotationConfig()

/**
 * Seuil d'inactivité utilisé pour la détection des segments de combat : 5s sans nouveau
 * sort casté par le joueur (voir `detectCombatSegments`).
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

/**
 * Timeline réduite aux seuls sorts connus de la config de rotation (voir
 * `filterTimelineToKnownSpells`) : les casts hors rotation (soin, défensif, mobilité...) sont
 * valides pour le joueur mais ne doivent pas être jugés par le moteur ni s'afficher dans la
 * timeline/le rapport. Source unique consommée par `comparisonResults`, `analysisResult` et le
 * composant `RotationTimeline`, pour rester cohérente entre l'affichage et le score.
 */
const knownSpellsTimeline = computed(() => {
  if (playerTimeline.value === null) {
    return null
  }
  return filterTimelineToKnownSpells(playerTimeline.value, rotationConfig)
})

const comparisonResults = computed(() => {
  if (knownSpellsTimeline.value === null) {
    return []
  }
  return compareRotation(knownSpellsTimeline.value, rotationConfig)
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
  if (knownSpellsTimeline.value === null || selectedSegment.value === null) {
    return EMPTY_ANALYSIS_RESULT
  }
  return analyzeRotation(
    knownSpellsTimeline.value,
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
    <header class="app-header">
      <span class="app-header__glyph" aria-hidden="true">✦</span>
      <div>
        <h1 class="app-header__title">Mage Rotation Trainer</h1>
        <p class="app-header__subtitle">Analyse de rotation Arcane à partir d'un combat log</p>
      </div>
    </header>

    <section class="dropzone" @dragover.prevent @drop.prevent="onDrop">
      <p class="dropzone__hint">Dépose ton combat log ici, ou choisis un fichier</p>
      <input type="file" accept=".txt" @change="onFileInputChange" />
    </section>

    <section v-if="isParsing" class="progress">
      <p>Analyse du fichier en cours… {{ progressPercent }}%</p>
      <progress :value="progressPercent" max="100" />
    </section>

    <p v-if="parseError" class="error" role="alert">{{ parseError }}</p>

    <section v-if="!isParsing && events.length > 0" class="panel">
      <PlayerSelector v-model="selectedPlayerGuid" :players="players" />
    </section>

    <section v-if="selectedPlayerGuid !== null" class="panel">
      <SegmentSelector v-model="selectedSegment" :segments="segments" />
    </section>

    <section v-if="knownSpellsTimeline !== null" class="results">
      <RotationReport :analysis-result="analysisResult" />
      <div class="panel panel--timeline">
        <h3 class="panel__title">Timeline du combat</h3>
        <RotationTimeline
          :timeline="knownSpellsTimeline"
          :comparison-results="comparisonResults"
          :errors="analysisResult.errors"
          :config="rotationConfig"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.app-header__glyph {
  font-size: 2rem;
  color: var(--gold-400);
  text-shadow: 0 0 14px var(--arcane-glow);
}

.app-header__title {
  font-size: 1.9rem;
}

.app-header__subtitle {
  margin: 0.2rem 0 0;
  color: var(--mist);
  font-size: 0.9rem;
}

.panel {
  background: var(--ink-900);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
  margin-top: 1.25rem;
}

.panel__title {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: var(--gold-300);
}

.dropzone {
  border: 1px dashed var(--hairline-strong);
  border-radius: 10px;
  padding: 2.5rem 2rem;
  text-align: center;
  background: var(--ink-900);
}

.dropzone__hint {
  color: var(--mist);
  margin: 0 0 0.9rem;
}

.dropzone input[type='file'] {
  color: var(--mist);
  font: inherit;
  font-size: 0.85rem;
}

.dropzone input[type='file']::file-selector-button {
  background: var(--ink-800);
  color: var(--gold-300);
  border: 1px solid var(--hairline-strong);
  border-radius: 6px;
  padding: 0.45rem 0.9rem;
  font: inherit;
  cursor: pointer;
  margin-right: 0.75rem;
}

.dropzone input[type='file']::file-selector-button:hover {
  border-color: var(--arcane-300);
  color: var(--parchment);
}

.progress {
  margin-top: 1.25rem;
  color: var(--mist);
}

.results {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.panel--timeline {
  margin-top: 0;
}

.error {
  color: var(--error-400);
  margin-top: 1rem;
}
</style>
