import type { Guid } from './spell'

/** Joueur distinct détecté dans le combat log, candidat à la sélection (SPECS.md §3.4). */
export interface Player {
  guid: Guid
  name: string
}
