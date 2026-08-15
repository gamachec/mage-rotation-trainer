// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SegmentSelector from './SegmentSelector.vue'
import type { CombatSegment } from '../types'

const segmentA: CombatSegment = { startTimestamp: 0, endTimestamp: 45_000 }
const segmentB: CombatSegment = { startTimestamp: 120_000, endTimestamp: 210_000 }

describe('SegmentSelector', () => {
  it("affiche un message quand aucun segment n'est détecté", () => {
    const wrapper = mount(SegmentSelector, { props: { segments: [], modelValue: null } })

    expect(wrapper.text()).toContain('Aucun segment de combat détecté')
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it("sélectionne automatiquement l'unique segment détecté, sans afficher de sélecteur", () => {
    const wrapper = mount(SegmentSelector, {
      props: { segments: [segmentA], modelValue: null },
    })

    expect(wrapper.text()).toContain('45s')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toEqual([[segmentA]])
  })

  it('affiche un sélecteur quand plusieurs segments sont détectés, sans auto-sélection', () => {
    const wrapper = mount(SegmentSelector, {
      props: { segments: [segmentA, segmentB], modelValue: null },
    })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.text())).toEqual([
      '-- Choisir --',
      'Segment 1 (45s)',
      'Segment 2 (90s)',
    ])
  })

  it('émet le segment sélectionné au changement du sélecteur', async () => {
    const wrapper = mount(SegmentSelector, {
      props: { segments: [segmentA, segmentB], modelValue: null },
    })

    await wrapper.find('select').setValue('1')

    expect(wrapper.emitted('update:modelValue')).toEqual([[segmentB]])
  })
})
