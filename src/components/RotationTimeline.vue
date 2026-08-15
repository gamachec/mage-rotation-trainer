<script setup lang="ts">
import { computed } from 'vue'
import type {
  PlayerTimeline,
  RotationComparisonResult,
  RotationConfig,
  RotationError,
} from '../types'
import { getSpellName } from '../data/get-spell-name'
import { getSpellIcon } from '../data/spell-icons'
import { describeRuleConditions } from '../data/describe-rotation-condition'
import { getPowerTypeName } from '../data/power-type-name'
import { getReferencedAuraSpellIds } from '../engine/rotation-config-auras'

/**
 * Visualisation de la timeline du combat (SPECS.md §7) : une ligne par cast réel, avec l'état
 * du personnage (auras, ressources) reconstruit à cet instant en colonne droite — plutôt
 * qu'une ligne séparée par changement d'aura (les changements d'aura sont fusionnés dans
 * l'état affiché au cast suivant). Fusionnée avec deux autres sources déjà produites par
 * `/engine` en une seule liste chronologique :
 * - `timeline.casts` recoupé avec `comparisonResults` (même ordre/longueur que
 *   `timeline.casts`) pour l'état du personnage, la justesse du cast, et la règle qui
 *   justifiait le sort attendu en cas d'erreur.
 * - `errors` filtré sur `rotation-gap`/`cooldown-wasted`/`channel-interrupted` : ce ne sont pas
 *   des casts, ils restent des marqueurs pleine largeur sur la même ligne de temps.
 *
 * Les auras affichées en colonne droite sont filtrées aux seules auras référencées par les
 * conditions de `config` (`getReferencedAuraSpellIds`) — un combat log contient beaucoup
 * d'auras sans rapport avec la priorité de sorts (buffs de caractéristiques, procs cosmétiques,
 * consommables...), les afficher toutes noierait l'information utile à l'analyse de la rotation.
 */
const props = defineProps<{
  timeline: PlayerTimeline
  comparisonResults: RotationComparisonResult[]
  errors: RotationError[]
  config: RotationConfig
}>()

const relevantAuraSpellIds = computed(() => getReferencedAuraSpellIds(props.config))

type CastItem = {
  kind: 'cast'
  timestamp: number
  actualSpellId: number
  actualSpellName: string
  isCorrect: boolean
  expectedSpellId: number | null
  expectedRuleDescription: string
  activeAuras: RotationComparisonResult['activeAuras']
  resourceValues: RotationComparisonResult['resourceValues']
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

type TimelineItem = CastItem | GapItem | CooldownWastedItem | ChannelInterruptedItem

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
      expectedRuleDescription: describeRuleConditions(result?.expectedSpellRuleConditions ?? null),
      activeAuras: (result?.activeAuras ?? []).filter((aura) =>
        relevantAuraSpellIds.value.has(aura.spellId),
      ),
      resourceValues: result?.resourceValues ?? [],
    }
  })

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

  return [...castItems, ...gapItems, ...cooldownWastedItems, ...channelInterruptedItems].sort(
    (a, b) => a.timestamp - b.timestamp,
  )
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
        'rotation-timeline__item--cast': item.kind === 'cast',
        'rotation-timeline__item--wrong': item.kind === 'cast' && !item.isCorrect,
        'rotation-timeline__item--gap': item.kind === 'gap',
        'rotation-timeline__item--cooldown-wasted': item.kind === 'cooldown-wasted',
        'rotation-timeline__item--channel-interrupted': item.kind === 'channel-interrupted',
      }"
    >
      <span class="rotation-timeline__time">{{ formatOffset(item.timestamp) }}</span>
      <span class="rotation-timeline__node" aria-hidden="true"></span>

      <template v-if="item.kind === 'cast'">
        <div class="rotation-timeline__cast">
          <img
            v-if="getSpellIcon(item.actualSpellId)"
            class="rotation-timeline__icon"
            :src="getSpellIcon(item.actualSpellId)!"
            :alt="item.actualSpellName"
          />
          <div class="rotation-timeline__cast-text">
            <span class="rotation-timeline__label">{{ item.actualSpellName }}</span>
            <span v-if="!item.isCorrect && item.expectedSpellId !== null" class="rotation-timeline__note">
              attendu : {{ getSpellName(item.expectedSpellId) }}
              <span class="rotation-timeline__rule">({{ item.expectedRuleDescription }})</span>
            </span>
          </div>
        </div>

        <div class="rotation-timeline__state">
          <span
            v-for="aura in item.activeAuras"
            :key="aura.spellId"
            class="rotation-timeline__chip"
            :title="aura.name"
          >
            <img
              v-if="getSpellIcon(aura.spellId)"
              class="rotation-timeline__chip-icon"
              :src="getSpellIcon(aura.spellId)!"
              :alt="aura.name"
            />
            {{ aura.name }} <span class="rotation-timeline__chip-stacks">×{{ aura.stacks }}</span>
          </span>
          <span
            v-for="resource in item.resourceValues"
            :key="resource.powerType"
            class="rotation-timeline__chip rotation-timeline__chip--resource"
          >
            {{ getPowerTypeName(resource.powerType) }} : {{ resource.value }}
          </span>
        </div>
      </template>

      <template v-else-if="item.kind === 'gap'">
        <span class="rotation-timeline__label rotation-timeline__marker-label"
          >Temps mort ({{ Math.round(item.durationMs / 1000) }}s)</span
        >
      </template>

      <template v-else-if="item.kind === 'cooldown-wasted'">
        <span class="rotation-timeline__label rotation-timeline__marker-label">
          CD gaspillé : {{ getSpellName(item.spellId) }} (prêt, recasté
          {{ item.castAt !== null ? `${Math.round(item.delayMs / 1000)}s plus tard` : 'jamais' }})
        </span>
      </template>

      <template v-else>
        <span class="rotation-timeline__label rotation-timeline__marker-label">
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
  max-height: 34rem;
  overflow-y: auto;
  position: relative;
}

.rotation-timeline::before {
  content: '';
  position: absolute;
  top: 0.9rem;
  bottom: 0.9rem;
  left: 4.7rem;
  width: 2px;
  background: linear-gradient(
    to bottom,
    transparent,
    var(--arcane-line) 4%,
    var(--arcane-line) 96%,
    transparent
  );
  box-shadow: 0 0 8px var(--arcane-glow);
}

.rotation-timeline__item {
  position: relative;
  display: grid;
  grid-template-columns: 3.4rem 1fr;
  align-items: start;
  gap: 0 0.75rem;
  padding: 0.55rem 0.5rem 0.55rem 0;
  border-bottom: 1px solid var(--hairline);
}

.rotation-timeline__item--cast {
  grid-template-columns: 3.4rem minmax(0, 1fr) minmax(0, 1fr);
}

.rotation-timeline__time {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--mist);
  font-size: 0.82rem;
  padding-top: 0.15rem;
  text-align: right;
}

.rotation-timeline__node {
  position: absolute;
  left: 4.7rem;
  top: 0.85rem;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  transform: translateX(-4px);
  background: var(--arcane-400);
  box-shadow: 0 0 6px var(--arcane-glow);
}

.rotation-timeline__item--wrong .rotation-timeline__node {
  background: var(--error-400);
  box-shadow: 0 0 6px color-mix(in srgb, var(--error-400) 60%, transparent);
}

.rotation-timeline__item--gap .rotation-timeline__node,
.rotation-timeline__item--cooldown-wasted .rotation-timeline__node,
.rotation-timeline__item--channel-interrupted .rotation-timeline__node {
  background: var(--gold-400);
  box-shadow: 0 0 6px color-mix(in srgb, var(--gold-400) 60%, transparent);
}

.rotation-timeline__cast {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding-left: 0.9rem;
}

.rotation-timeline__icon {
  width: 2rem;
  height: 2rem;
  border-radius: 4px;
  border: 1px solid var(--hairline-strong);
  flex-shrink: 0;
}

.rotation-timeline__cast-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.rotation-timeline__label {
  font-family: var(--font-body);
  color: var(--parchment);
  font-size: 0.95rem;
}

.rotation-timeline__item--wrong .rotation-timeline__label {
  color: var(--error-300);
}

.rotation-timeline__note {
  color: var(--error-300);
  font-size: 0.8rem;
}

.rotation-timeline__rule {
  color: var(--mist);
  font-style: italic;
}

.rotation-timeline__state {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 0.3rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--hairline);
}

.rotation-timeline__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--hairline-strong);
  background: var(--ink-800);
  color: var(--mist);
  font-size: 0.72rem;
  white-space: nowrap;
}

.rotation-timeline__chip--resource {
  border-color: color-mix(in srgb, var(--gold-400) 40%, var(--hairline-strong));
  color: var(--gold-200);
}

.rotation-timeline__chip-icon {
  width: 1rem;
  height: 1rem;
  border-radius: 2px;
}

.rotation-timeline__chip-stacks {
  color: var(--arcane-300);
  font-family: var(--font-mono);
}

.rotation-timeline__marker-label {
  padding-left: 1.35rem;
  color: var(--gold-200);
  font-size: 0.85rem;
  grid-column: 2 / -1;
}

.rotation-timeline__empty {
  color: var(--mist);
  padding: 0.5rem 0;
}
</style>
