<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import PlayerSelector from './components/PlayerSelector.vue'
import SegmentSelector from './components/SegmentSelector.vue'
import RotationTimeline from './components/RotationTimeline.vue'
import RotationReport from './views/RotationReport.vue'
import {parseCombatLogFile} from './workers/parse-combat-log-file'
import {detectPlayers} from './parser/detect-players'
import {detectCombatSegments} from './parser/detect-combat-segments'
import {filterEventsByPlayer} from './parser/filter-events-by-player'
import {buildPlayerTimeline} from './parser/build-player-timeline'
import {compareRotation} from './engine/compare-rotation'
import {analyzeRotation} from './engine/analyze-rotation'
import {filterTimelineToKnownSpells} from './engine/known-rotation-spells'
import {loadDefaultRotationConfig} from './data/load-default-rotation-config'
import type {CombatLogEvent, CombatSegment, Guid, RotationAnalysisResult} from './types'
import type {CombatLogParseProgress} from './parser/combat-log-parser'

const rotationConfig = loadDefaultRotationConfig()

/**
 * Seuil d'inactivité utilisé pour la détection des segments de combat : 5s sans nouveau
 * sort casté par le joueur (voir `detectCombatSegments`).
 */
const INACTIVITY_THRESHOLD_MS = 5_000

/** Clé localStorage utilisée pour préselectionner automatiquement le dernier personnage choisi. */
const LAST_PLAYER_STORAGE_KEY = 'mage-rotation-trainer:last-player-name'

const isParsing = ref(false)
const isDraggingFile = ref(false)
const parseProgress = ref<CombatLogParseProgress | null>(null)
const parseError = ref<string | null>(null)
const events = ref<CombatLogEvent[]>([])
const fileName = ref<string | null>(null)

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

/**
 * Score de conformité (%) de chaque segment détecté, dans le même ordre que `segments` — affiché
 * dans `SegmentSelector` à côté de la durée pour aider à repérer le segment le plus propre sans
 * devoir tous les sélectionner un par un.
 */
const segmentScores = computed(() => {
  const player = selectedPlayer.value
  if (player === null) {
    return []
  }
  return segments.value.map((segment) => {
    const filteredEvents = filterEventsByPlayer(events.value, player.guid, segment)
    const timeline = filterTimelineToKnownSpells(buildPlayerTimeline(filteredEvents, player), rotationConfig)
    return analyzeRotation(timeline, rotationConfig, segment.startTimestamp, segment.endTimestamp).score
  })
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

// Préselectionne automatiquement le personnage utilisé lors de la session précédente : en
// pratique, on ne change pas de personnage d'un upload à l'autre. Ne s'applique que si un choix
// est réellement à faire (PlayerSelector gère déjà seul le cas d'un unique joueur détecté).
watch(players, (detectedPlayers) => {
  if (selectedPlayerGuid.value !== null || detectedPlayers.length <= 1) {
    return
  }
  const lastPlayerName = localStorage.getItem(LAST_PLAYER_STORAGE_KEY)
  const match = detectedPlayers.find((player) => player.name === lastPlayerName)
  if (match) {
    selectedPlayerGuid.value = match.guid
  }
})

watch(selectedPlayer, (player) => {
  if (player !== null) {
    localStorage.setItem(LAST_PLAYER_STORAGE_KEY, player.name)
  }
})

async function loadFile(file: File) {
  isParsing.value = true
  parseError.value = null
  parseProgress.value = null
  events.value = []
  fileName.value = file.name

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
  isDraggingFile.value = false
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

    <p class="instructions">
      Devant un mannequin, active les logs (<code>/combatlog</code>), exécute ta rotation (durée libre), arrête de
      caster pendant 5s, puis désactive les logs (<code>/combatlog</code>) pour éviter de polluer le fichier
      inutilement. Uploade ensuite le log ci-dessous. Tu peux répéter l'opération autant de fois que tu veux dans un
      même fichier.
    </p>

    <section class="setup">
      <div
          class="dropzone"
          :class="{ 'dropzone--active': isDraggingFile }"
          @dragover.prevent="isDraggingFile = true"
          @dragleave.prevent="isDraggingFile = false"
          @drop.prevent="onDrop"
      >
        <span class="dropzone__icon" aria-hidden="true">⇩</span>
        <p class="dropzone__hint">Glisse-dépose ton combat log ici</p>
        <label class="dropzone__browse">
          ou choisis un fichier
          <input type="file" accept=".txt" @change="onFileInputChange"/>
        </label>
        <p v-if="fileName" class="dropzone__filename">{{ fileName }}</p>
      </div>

      <div class="setup__selectors panel">
        <div v-if="!isParsing && events.length > 0" class="setup__item">
          <PlayerSelector v-model="selectedPlayerGuid" :players="players"/>
        </div>

        <div v-if="selectedPlayerGuid !== null" class="setup__item">
          <SegmentSelector v-model="selectedSegment" :segments="segments" :scores="segmentScores"/>
        </div>

        <p v-if="events.length === 0" class="setup__placeholder">
          Dépose un combat log à gauche pour commencer.
        </p>
      </div>
    </section>

    <section v-if="isParsing" class="progress">
      <p>Analyse du fichier en cours… {{ progressPercent }}%</p>
      <progress :value="progressPercent" max="100"/>
    </section>

    <p v-if="parseError" class="error" role="alert">{{ parseError }}</p>

    <section v-if="knownSpellsTimeline !== null" class="results">
      <RotationReport :analysis-result="analysisResult"/>
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

.instructions {
  color: var(--mist);
  font-size: 0.85rem;
  line-height: 1.5;
  margin: 0 0 1.25rem;
}

.instructions code {
  background: var(--ink-800);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 0.05rem 0.35rem;
  color: var(--gold-300);
  font-size: 0.82em;
}

.setup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.25rem;
  align-items: stretch;
}

@media (max-width: 640px) {
  .setup {
    grid-template-columns: 1fr;
  }
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;
  border: 2px dashed var(--hairline-strong);
  border-radius: 10px;
  padding: 1.5rem 1.25rem;
  background: var(--ink-900);
  transition: border-color 0.15s,
  background 0.15s;
}

.dropzone--active {
  border-color: var(--arcane-300);
  background: var(--ink-800);
}

.dropzone__icon {
  font-size: 1.4rem;
  color: var(--gold-400);
}

.dropzone__hint {
  color: var(--parchment);
  margin: 0;
  font-size: 0.9rem;
}

.dropzone__browse {
  position: relative;
  color: var(--mist);
  font-size: 0.8rem;
  cursor: pointer;
}

.dropzone__browse:hover {
  color: var(--gold-300);
}

.dropzone__browse input[type='file'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.dropzone__filename {
  margin: 0.3rem 0 0;
  color: var(--gold-300);
  font-size: 0.8rem;
}

.setup__selectors {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.9rem;
  margin-top: 0;
}

.setup__placeholder {
  color: var(--mist);
  font-size: 0.85rem;
  margin: 0;
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
