<script setup lang="ts">
import { computed, watch } from 'vue'
import type { Guid, Player } from '../types'

/**
 * Sélection du personnage à analyser parmi les joueurs détectés dans le log (SPECS.md §3.4).
 * S'il n'y a qu'un seul joueur, il est sélectionné automatiquement sans solliciter
 * l'utilisateur (PLAN.md Étape 5) — le prompt ne s'affiche que s'il y a un choix à faire.
 */
const props = defineProps<{
  players: Player[]
  modelValue: Guid | null
}>()

const emit = defineEmits<{
  'update:modelValue': [guid: Guid]
}>()

const hasSinglePlayer = computed(() => props.players.length === 1)

watch(
  () => props.players,
  (players) => {
    if (players.length === 1) {
      emit('update:modelValue', players[0].guid)
    }
  },
  { immediate: true },
)

function onSelect(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="player-selector">
    <p v-if="players.length === 0" class="player-selector__empty">
      Aucun joueur détecté dans ce combat log.
    </p>

    <p v-else-if="hasSinglePlayer" class="player-selector__single">
      Personnage détecté : <strong>{{ players[0].name }}</strong>
    </p>

    <label v-else class="player-selector__field">
      Sélectionne ton personnage :
      <select :value="modelValue ?? ''" @change="onSelect">
        <option value="" disabled>-- Choisir --</option>
        <option v-for="player in players" :key="player.guid" :value="player.guid">
          {{ player.name }}
        </option>
      </select>
    </label>
  </div>
</template>
