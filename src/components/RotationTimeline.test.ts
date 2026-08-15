// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RotationTimeline from './RotationTimeline.vue'
import type { PlayerTimeline, RotationComparisonResult, RotationError } from '../types'

const timeline: PlayerTimeline = {
  playerGuid: 'Player-1127-0AC1C10B',
  playerName: 'Hânakiel',
  casts: [
    { timestamp: 1_000, spell: { id: 30451, name: 'Déflagration des Arcanes' } },
    { timestamp: 5_000, spell: { id: 5143, name: 'Missiles Arcaniques' } },
  ],
  auraChanges: [
    {
      timestamp: 500,
      aura: { spellId: 36032, name: 'Charge Arcanique', type: 'BUFF', stacks: 1 },
    },
  ],
  damageTicks: [],
  resourceGains: [],
}

const comparisonResults: RotationComparisonResult[] = [
  {
    timestamp: 1_000,
    actualSpellId: 30451,
    expectedSpellId: 30451,
    isCorrect: true,
    activeAuras: [],
  },
  {
    timestamp: 5_000,
    actualSpellId: 5143,
    expectedSpellId: 44425,
    isCorrect: false,
    activeAuras: [],
  },
]

const errors: RotationError[] = [{ type: 'rotation-gap', timestamp: 1_000, durationMs: 4_000 }]

describe('RotationTimeline', () => {
  it("affiche un message quand il n'y a aucun événement", () => {
    const wrapper = mount(RotationTimeline, {
      props: {
        timeline: { ...timeline, casts: [], auraChanges: [] },
        comparisonResults: [],
        errors: [],
      },
    })

    expect(wrapper.text()).toContain('Aucun événement à afficher')
  })

  it('affiche les casts, changements d’aura et gaps triés chronologiquement', () => {
    const wrapper = mount(RotationTimeline, {
      props: { timeline, comparisonResults, errors },
    })

    const items = wrapper.findAll('.rotation-timeline__item')
    expect(items).toHaveLength(4)
    expect(items[0].text()).toContain('Charge Arcanique')
    expect(items[1].text()).toContain('Déflagration des Arcanes')
    expect(items[2].text()).toContain('Temps mort')
    expect(items[2].text()).toContain('4s')
    expect(items[3].text()).toContain('Missiles Arcaniques')
  })

  it('surligne un cast incorrect avec le sort attendu', () => {
    const wrapper = mount(RotationTimeline, {
      props: { timeline, comparisonResults, errors: [] },
    })

    const wrongCast = wrapper.findAll('.rotation-timeline__item--wrong')
    expect(wrongCast).toHaveLength(1)
    expect(wrongCast[0].text()).toContain('Missiles Arcaniques')
    expect(wrongCast[0].text()).toContain('attendu')
  })

  it('affiche un marqueur pour un cooldown de burst gaspillé, positionné à readyAt', () => {
    const cooldownWastedErrors: RotationError[] = [
      { type: 'cooldown-wasted', spellId: 321507, readyAt: 2_000, castAt: null, delayMs: 6_000 },
    ]

    const wrapper = mount(RotationTimeline, {
      props: { timeline, comparisonResults, errors: cooldownWastedErrors },
    })

    const marker = wrapper.findAll('.rotation-timeline__item--cooldown-wasted')
    expect(marker).toHaveLength(1)
    expect(marker[0].text()).toContain('Toucher des magi')
    expect(marker[0].text()).toContain('jamais')
  })

  it('affiche un marqueur pour une canalisation interrompue', () => {
    const channelInterruptedErrors: RotationError[] = [
      {
        type: 'channel-interrupted',
        timestamp: 2_000,
        spellId: 5143,
        actualTicks: 3,
        expectedTicks: 7,
      },
    ]

    const wrapper = mount(RotationTimeline, {
      props: { timeline, comparisonResults, errors: channelInterruptedErrors },
    })

    const marker = wrapper.findAll('.rotation-timeline__item--channel-interrupted')
    expect(marker).toHaveLength(1)
    expect(marker[0].text()).toContain('Projectiles des Arcanes')
    expect(marker[0].text()).toContain('3/7 vagues')
  })
})
