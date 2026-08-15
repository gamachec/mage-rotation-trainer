// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RotationReport from './RotationReport.vue'
import type { RotationAnalysisResult } from '../types'

const analysisResult: RotationAnalysisResult = {
  score: 50,
  totalCasts: 4,
  correctCasts: 2,
  incompleteConfigCasts: 1,
  wastedCooldownsCount: 1,
  interruptedChannelsCount: 1,
  errors: [
    {
      type: 'wrong-spell',
      timestamp: 1_000,
      actualSpellId: 5143,
      expectedSpellId: 44425,
      activeAuras: [],
    },
    {
      type: 'wrong-spell',
      timestamp: 2_000,
      actualSpellId: 5143,
      expectedSpellId: 44425,
      activeAuras: [],
    },
    { type: 'rotation-gap', timestamp: 3_000, durationMs: 4_000 },
    { type: 'cooldown-wasted', spellId: 321507, readyAt: 5_000, castAt: null, delayMs: 6_000 },
    {
      type: 'channel-interrupted',
      timestamp: 7_000,
      spellId: 5143,
      actualTicks: 3,
      expectedTicks: 7,
    },
  ],
}

describe('RotationReport', () => {
  it('affiche le score global', () => {
    const wrapper = mount(RotationReport, { props: { analysisResult } })

    expect(wrapper.text()).toContain('50%')
  })

  it('affiche les statistiques complémentaires', () => {
    const wrapper = mount(RotationReport, { props: { analysisResult } })

    expect(wrapper.text()).toContain('Casts analysés : 4')
    expect(wrapper.text()).toContain('Casts corrects : 2')
    expect(wrapper.text()).toContain('Casts sans règle de config applicable : 1')
    expect(wrapper.text()).toContain('4s au total')
  })

  it('regroupe les erreurs "wrong-spell" récurrentes en axe d’amélioration priorisé', () => {
    const wrapper = mount(RotationReport, { props: { analysisResult } })

    const axes = wrapper.findAll('.rotation-report__axes li')
    expect(axes).toHaveLength(1)
    expect(axes[0].text()).toContain('2 fois')
  })

  it('affiche les temps morts détaillés', () => {
    const wrapper = mount(RotationReport, { props: { analysisResult } })

    expect(wrapper.text()).toContain('Temps morts dans la rotation (1)')
    expect(wrapper.text()).toContain('4s sans cast')
  })

  it('affiche les cooldowns de burst gaspillés', () => {
    const wrapper = mount(RotationReport, { props: { analysisResult } })

    expect(wrapper.text()).toContain('Cooldowns de burst gaspillés : 1')
    expect(wrapper.text()).toContain('Cooldowns de burst gaspillés (1)')
    expect(wrapper.text()).toContain('Toucher des magi — 1 fois')
    expect(wrapper.text()).toContain('jamais')
  })

  it('affiche les canalisations interrompues', () => {
    const wrapper = mount(RotationReport, { props: { analysisResult } })

    expect(wrapper.text()).toContain('Canalisations interrompues : 1')
    expect(wrapper.text()).toContain('Canalisations interrompues (1)')
    expect(wrapper.text()).toContain('3/7 vagues')
  })

  it("n'affiche pas la section canalisations interrompues s'il n'y en a aucune", () => {
    const wrapper = mount(RotationReport, {
      props: {
        analysisResult: {
          ...analysisResult,
          interruptedChannelsCount: 0,
          errors: analysisResult.errors.filter((error) => error.type !== 'channel-interrupted'),
        },
      },
    })

    expect(wrapper.text()).not.toContain('Canalisations interrompues (')
  })

  it("n'affiche pas la section cooldowns gaspillés s'il n'y en a aucun", () => {
    const wrapper = mount(RotationReport, {
      props: {
        analysisResult: {
          ...analysisResult,
          wastedCooldownsCount: 0,
          errors: analysisResult.errors.filter((error) => error.type !== 'cooldown-wasted'),
        },
      },
    })

    expect(wrapper.text()).not.toContain('Cooldowns de burst gaspillés (')
  })

  it("n'affiche pas la section axes d'amélioration s'il n'y a aucune erreur wrong-spell", () => {
    const wrapper = mount(RotationReport, {
      props: {
        analysisResult: { ...analysisResult, errors: [] },
      },
    })

    expect(wrapper.find('.rotation-report__axes').exists()).toBe(false)
  })
})
