/**
 * GUID d'entité du combat log WoW (ex: "Player-1234-00001111").
 * Modélisé explicitement (plutôt que de se fier au nom affiché) pour éviter
 * les ambiguïtés d'homonymes entre joueurs (SPECS.md §4).
 */
export type Guid = string

/** Sort identifié par son ID WoW, avec son nom résolu via la table de correspondance (voir /data). */
export interface Spell {
  id: number
  name: string
}

export type AuraType = 'BUFF' | 'DEBUFF'

/** Aura/buff actif sur une entité, avec son nombre de charges (stacks) courant. */
export interface Aura {
  spellId: number
  name: string
  type: AuraType
  stacks: number
}
