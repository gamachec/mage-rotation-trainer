// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerSelector from './PlayerSelector.vue'
import type { Player } from '../types'

const hanakiel: Player = { guid: 'Player-1127-0AC1C10B', name: 'Hânakiel-KirinTor-EU' }
const valeria: Player = { guid: 'Player-1127-0910D6B2', name: 'Valý-KirinTor-EU' }

describe('PlayerSelector', () => {
  it("affiche un message quand aucun joueur n'est détecté", () => {
    const wrapper = mount(PlayerSelector, { props: { players: [], modelValue: null } })

    expect(wrapper.text()).toContain('Aucun joueur détecté')
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it("sélectionne automatiquement l'unique joueur détecté, sans afficher de sélecteur", () => {
    const wrapper = mount(PlayerSelector, { props: { players: [hanakiel], modelValue: null } })

    expect(wrapper.text()).toContain('Hânakiel-KirinTor-EU')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toEqual([[hanakiel.guid]])
  })

  it('affiche un sélecteur quand plusieurs joueurs sont détectés, sans auto-sélection', () => {
    const wrapper = mount(PlayerSelector, {
      props: { players: [hanakiel, valeria], modelValue: null },
    })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.text())).toEqual(['-- Choisir --', hanakiel.name, valeria.name])
  })

  it('émet le GUID sélectionné au changement du sélecteur', async () => {
    const wrapper = mount(PlayerSelector, {
      props: { players: [hanakiel, valeria], modelValue: null },
    })

    await wrapper.find('select').setValue(valeria.guid)

    expect(wrapper.emitted('update:modelValue')).toEqual([[valeria.guid]])
  })
})
