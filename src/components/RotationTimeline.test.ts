// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RotationTimeline from './RotationTimeline.vue'
import type {
  PlayerTimeline,
  RotationComparisonResult,
  RotationConfig,
  RotationError,
} from '../types'

/** Référence 36032 (Charge Arcanique) via une condition, pour qu'elle reste affichée en colonne état. */
const config: RotationConfig = {
  rules: [
    {
      spellId: 44425,
      conditions: [{ type: 'auraStacks', spellId: 36032, operator: '>=', value: 4 }],
    },
    { spellId: 30451, conditions: [] },
  ],
}

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
    expectedSpellRuleConditions: [],
    isCorrect: true,
    activeAuras: [{ spellId: 36032, name: 'Charge Arcanique', type: 'BUFF', stacks: 1 }],
    resourceValues: [],
  },
  {
    timestamp: 5_000,
    actualSpellId: 5143,
    expectedSpellId: 44425,
    expectedSpellRuleConditions: [
      { type: 'auraStacks', spellId: 36032, operator: '>=', value: 4 },
    ],
    isCorrect: false,
    activeAuras: [{ spellId: 36032, name: 'Charge Arcanique', type: 'BUFF', stacks: 1 }],
    resourceValues: [],
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
        config,
      },
    })

    expect(wrapper.text()).toContain('Aucun événement à afficher')
  })

  it('affiche un cast par ligne, triés chronologiquement, avec l’état du personnage à droite', () => {
    const wrapper = mount(RotationTimeline, {
      props: { timeline, comparisonResults, errors, config },
    })

    const items = wrapper.findAll('.rotation-timeline__item')
    // 2 casts + 1 gap (le changement d'aura est fusionné dans l'état du cast, pas une ligne à part).
    expect(items).toHaveLength(3)
    expect(items[0].text()).toContain('Déflagration des Arcanes')
    expect(items[0].find('.rotation-timeline__aura').attributes('title')).toContain(
      'Charge Arcanique',
    )
    expect(items[1].text()).toContain('Temps mort')
    expect(items[1].text()).toContain('4s')
    expect(items[2].text()).toContain('Missiles Arcaniques')
  })

  it('surligne un cast incorrect avec le sort attendu et la règle qui le justifiait', () => {
    const wrapper = mount(RotationTimeline, {
      props: { timeline, comparisonResults, errors: [], config },
    })

    const wrongCast = wrapper.findAll('.rotation-timeline__item--wrong')
    expect(wrongCast).toHaveLength(1)
    expect(wrongCast[0].text()).toContain('Missiles Arcaniques')
    expect(wrongCast[0].text()).toContain('attendu')
    expect(wrongCast[0].text()).toContain('Barrage des Arcanes')
    expect(wrongCast[0].text()).toContain('Charge arcanique ≥ 4')
  })

  it('affiche un marqueur pour un cooldown de burst gaspillé, positionné à readyAt', () => {
    const cooldownWastedErrors: RotationError[] = [
      { type: 'cooldown-wasted', spellId: 321507, readyAt: 2_000, castAt: null, delayMs: 6_000 },
    ]

    const wrapper = mount(RotationTimeline, {
      props: { timeline, comparisonResults, errors: cooldownWastedErrors, config },
    })

    const marker = wrapper.findAll('.rotation-timeline__item--cooldown-wasted')
    expect(marker).toHaveLength(1)
    expect(marker[0].text()).toContain('Toucher des magi')
    expect(marker[0].text()).toContain('jamais')
  })

  it("ne montre en colonne état que les auras référencées par la config (filtre le bruit du log)", () => {
    const comparisonResultsWithNoise: RotationComparisonResult[] = [
      {
        timestamp: 1_000,
        actualSpellId: 30451,
        expectedSpellId: 30451,
        expectedSpellRuleConditions: [],
        isCorrect: true,
        activeAuras: [
          { spellId: 36032, name: 'Charge Arcanique', type: 'BUFF', stacks: 1 },
          { spellId: 999999, name: 'Buff sans rapport', type: 'BUFF', stacks: 1 },
        ],
        resourceValues: [],
      },
    ]

    const wrapper = mount(RotationTimeline, {
      props: {
        timeline: { ...timeline, casts: [timeline.casts[0]] },
        comparisonResults: comparisonResultsWithNoise,
        errors: [],
        config,
      },
    })

    const item = wrapper.find('.rotation-timeline__item')
    const auras = item.findAll('.rotation-timeline__aura')
    expect(auras).toHaveLength(1)
    expect(auras[0].attributes('title')).toContain('Charge Arcanique')
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
      props: { timeline, comparisonResults, errors: channelInterruptedErrors, config },
    })

    const marker = wrapper.findAll('.rotation-timeline__item--channel-interrupted')
    expect(marker).toHaveLength(1)
    expect(marker[0].text()).toContain('Projectiles des Arcanes')
    expect(marker[0].text()).toContain('3/7 vagues')
  })
})
