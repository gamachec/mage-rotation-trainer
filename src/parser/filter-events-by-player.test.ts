import { describe, expect, it } from 'vitest'
import { filterEventsByPlayer } from './filter-events-by-player'
import { parseCombatLog } from './combat-log-parser'
import type { CombatLogEvent } from '../types'

const HANAKIEL_GUID = 'Player-1127-0AC1C10B'

/** Lignes réelles issues du même log que combat-log-parser.test.ts (PLAN.md Étape 3). */
const REAL_LOG_TEXT = [
  `8/15/2026 11:27:07.8822  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,12.1.0,PROJECT_ID,1`,
  `8/15/2026 11:27:15.9822  SPELL_CAST_SUCCESS,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Creature-0-3894-0-85410-243167-00007FC38E,"Mannequin d'entraînement de donjonage",0x10a28,0x80000000,30451,"Déflagration des Arcanes",0x40,Player-1127-0AC1C10B,0000000000000000,576620,576620,229,2481,541,592,152,0,0,331065,331065,6875,8196.63,-4344.20,2393,2.8493,293`,
  `8/15/2026 11:27:16.9822  SPELL_CAST_SUCCESS,Player-1127-04F2BE4F,"Meonys-LesSentinelles-EU",0x548,0x80000000,Creature-0-3894-0-85410-243166-00007FC38E,"Tank d'entraînement normal",0xa28,0x80000000,1287663,"Rune de persistance",0x6a,Player-1127-04F2BE4F,0000000000000000,576620,576620,229,2481,541,592,152,0,0,331065,331065,6875,8196.63,-4344.20,2393,2.8493,293`,
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

describe('filterEventsByPlayer', () => {
  it('ne garde que les événements du joueur sélectionné sur un vrai log à plusieurs joueurs', () => {
    const events = parseCombatLog(REAL_LOG_TEXT)
    const filtered = filterEventsByPlayer(events, HANAKIEL_GUID, {
      startTimestamp: 0,
      endTimestamp: Infinity,
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toMatchObject({ sourceGuid: HANAKIEL_GUID })
  })

  it('garde un événement si le joueur est cible même sans en être la source', () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_DAMAGE',
        sourceGuid: 'Creature-0-1',
        destGuid: 'Player-1-AAAA',
        timestamp: 1000,
        amount: 100,
      } as Partial<CombatLogEvent> & { type: 'SPELL_DAMAGE' }),
    ]

    expect(
      filterEventsByPlayer(events, 'Player-1-AAAA', { startTimestamp: 0, endTimestamp: 5000 }),
    ).toHaveLength(1)
  })

  it('exclut les événements hors du segment de combat', () => {
    const events: CombatLogEvent[] = [
      buildEvent({ type: 'SPELL_CAST_SUCCESS', sourceGuid: 'Player-1-AAAA', timestamp: 500 }),
      buildEvent({ type: 'SPELL_CAST_SUCCESS', sourceGuid: 'Player-1-AAAA', timestamp: 10000 }),
    ]

    expect(
      filterEventsByPlayer(events, 'Player-1-AAAA', { startTimestamp: 0, endTimestamp: 1000 }),
    ).toHaveLength(1)
  })

  it('exclut les événements ne concernant pas le joueur, même dans le segment', () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_CAST_SUCCESS',
        sourceGuid: 'Player-2-BBBB',
        destGuid: 'Creature-0-1',
        timestamp: 500,
      }),
    ]

    expect(
      filterEventsByPlayer(events, 'Player-1-AAAA', { startTimestamp: 0, endTimestamp: 1000 }),
    ).toEqual([])
  })

  it('retourne une liste vide sans événement', () => {
    expect(
      filterEventsByPlayer([], 'Player-1-AAAA', { startTimestamp: 0, endTimestamp: 1000 }),
    ).toEqual([])
  })
})
