import { describe, expect, it } from 'vitest'
import { buildPlayerTimeline } from './build-player-timeline'
import { parseCombatLog } from './combat-log-parser'
import { filterEventsByPlayer } from './filter-events-by-player'
import type { CombatLogEvent, Player } from '../types'

const HANAKIEL: Player = { guid: 'Player-1127-0AC1C10B', name: 'Hânakiel-KirinTor-EU' }

/** Lignes réelles issues du même log que combat-log-parser.test.ts (PLAN.md Étape 3). */
const REAL_LOG_TEXT = [
  `8/15/2026 11:27:15.9822  SPELL_CAST_SUCCESS,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Creature-0-3894-0-85410-243167-00007FC38E,"Mannequin d'entraînement de donjonage",0x10a28,0x80000000,30451,"Déflagration des Arcanes",0x40,Player-1127-0AC1C10B,0000000000000000,576620,576620,229,2481,541,592,152,0,0,331065,331065,6875,8196.63,-4344.20,2393,2.8493,293`,
  `8/15/2026 11:27:15.9832  SPELL_AURA_APPLIED,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,1242974,"Salve arcanique",0x40,BUFF`,
  `8/15/2026 11:27:17.6962  SPELL_AURA_APPLIED_DOSE,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,1242974,"Salve arcanique",0x40,BUFF,4`,
  `8/15/2026 11:27:21.9782  SPELL_AURA_REMOVED_DOSE,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,449322,"Cascade de mana",0x1,BUFF,1`,
  `8/15/2026 11:27:23.6852  SPELL_AURA_REMOVED,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,449322,"Cascade de mana",0x1,BUFF`,
].join('\n')

function buildEvent(
  overrides: Partial<CombatLogEvent> & Pick<CombatLogEvent, 'type'>,
): CombatLogEvent {
  return {
    timestamp: 0,
    sourceGuid: 'Player-1-AAAA',
    sourceName: 'Someone-Realm',
    destGuid: 'Player-1-AAAA',
    destName: 'Someone-Realm',
    spellId: 1,
    spellName: 'Spell',
    ...overrides,
  } as CombatLogEvent
}

describe('buildPlayerTimeline', () => {
  it('reconstruit casts et changements d’aura à partir d’un vrai log', () => {
    const events = parseCombatLog(REAL_LOG_TEXT)
    const filtered = filterEventsByPlayer(events, HANAKIEL.guid, {
      startTimestamp: 0,
      endTimestamp: Infinity,
    })
    const timeline = buildPlayerTimeline(filtered, HANAKIEL)

    expect(timeline.playerGuid).toBe(HANAKIEL.guid)
    expect(timeline.playerName).toBe(HANAKIEL.name)
    expect(timeline.casts).toEqual([
      { timestamp: expect.any(Number), spell: { id: 30451, name: 'Déflagration des Arcanes' } },
    ])
    expect(timeline.auraChanges.map((c) => c.aura.stacks)).toEqual([1, 4, 1, 0])
    expect(timeline.damageTicks).toEqual([])
  })

  it('reporte la valeur absolue des stacks des événements _DOSE sans les accumuler', () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_AURA_APPLIED_DOSE',
        timestamp: 1000,
        auraType: 'BUFF',
        stacks: 3,
      } as Partial<CombatLogEvent> & { type: 'SPELL_AURA_APPLIED_DOSE' }),
      buildEvent({
        type: 'SPELL_AURA_APPLIED_DOSE',
        timestamp: 2000,
        auraType: 'BUFF',
        stacks: 4,
      } as Partial<CombatLogEvent> & { type: 'SPELL_AURA_APPLIED_DOSE' }),
    ]

    const timeline = buildPlayerTimeline(events, { guid: 'Player-1-AAAA', name: 'Someone' })

    expect(timeline.auraChanges.map((c) => c.aura.stacks)).toEqual([3, 4])
  })

  it("ignore les changements d'aura dont le joueur n'est pas la cible", () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_AURA_APPLIED',
        sourceGuid: 'Player-1-AAAA',
        destGuid: 'Player-2-BBBB',
        auraType: 'BUFF',
      } as Partial<CombatLogEvent> & { type: 'SPELL_AURA_APPLIED' }),
    ]

    const timeline = buildPlayerTimeline(events, { guid: 'Player-1-AAAA', name: 'Someone' })

    expect(timeline.auraChanges).toEqual([])
  })

  it("ignore les casts dont le joueur n'est pas la source", () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_CAST_SUCCESS',
        sourceGuid: 'Player-2-BBBB',
        destGuid: 'Player-1-AAAA',
      }),
    ]

    const timeline = buildPlayerTimeline(events, { guid: 'Player-1-AAAA', name: 'Someone' })

    expect(timeline.casts).toEqual([])
  })

  it('capture les événements de dégâts (spellId, timestamp) dont le joueur est la source', () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_DAMAGE',
        timestamp: 1234,
        sourceGuid: 'Player-1-AAAA',
        spellId: 7268,
        amount: 100,
      } as Partial<CombatLogEvent> & { type: 'SPELL_DAMAGE' }),
    ]

    const timeline = buildPlayerTimeline(events, { guid: 'Player-1-AAAA', name: 'Someone' })

    expect(timeline.casts).toEqual([])
    expect(timeline.auraChanges).toEqual([])
    expect(timeline.damageTicks).toEqual([{ timestamp: 1234, spellId: 7268 }])
  })

  it("ignore les événements de dégâts dont le joueur n'est pas la source", () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_DAMAGE',
        sourceGuid: 'Player-2-BBBB',
        destGuid: 'Player-1-AAAA',
        amount: 100,
      } as Partial<CombatLogEvent> & { type: 'SPELL_DAMAGE' }),
    ]

    const timeline = buildPlayerTimeline(events, { guid: 'Player-1-AAAA', name: 'Someone' })

    expect(timeline.damageTicks).toEqual([])
  })

  it('capture les gains de ressource (SPELL_ENERGIZE) dont le joueur est la cible', () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_ENERGIZE',
        timestamp: 1234,
        destGuid: 'Player-1-AAAA',
        powerType: 16,
        amount: 1,
        maxPower: 4,
      } as Partial<CombatLogEvent> & { type: 'SPELL_ENERGIZE' }),
    ]

    const timeline = buildPlayerTimeline(events, { guid: 'Player-1-AAAA', name: 'Someone' })

    expect(timeline.resourceGains).toEqual([
      { timestamp: 1234, powerType: 16, amount: 1, maxPower: 4 },
    ])
  })

  it("ignore les gains de ressource dont le joueur n'est pas la cible", () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_ENERGIZE',
        sourceGuid: 'Player-2-BBBB',
        destGuid: 'Player-2-BBBB',
        powerType: 16,
        amount: 1,
        maxPower: 4,
      } as Partial<CombatLogEvent> & { type: 'SPELL_ENERGIZE' }),
    ]

    const timeline = buildPlayerTimeline(events, { guid: 'Player-1-AAAA', name: 'Someone' })

    expect(timeline.resourceGains).toEqual([])
  })

  it('retourne une timeline vide sans événement', () => {
    const timeline = buildPlayerTimeline([], { guid: 'Player-1-AAAA', name: 'Someone' })

    expect(timeline).toEqual({
      playerGuid: 'Player-1-AAAA',
      playerName: 'Someone',
      casts: [],
      auraChanges: [],
      damageTicks: [],
      resourceGains: [],
    })
  })
})
