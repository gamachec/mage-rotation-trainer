import { describe, expect, it } from 'vitest'
import { detectCombatSegments } from './detect-combat-segments'
import type { CombatLogEvent } from '../types'

const PLAYER_GUID = 'Player-1127-0AC1C10B'
const OTHER_PLAYER_GUID = 'Player-1127-04F2BE4F'
const DUMMY_GUID = 'Creature-0-3894-0-85410-243167-00007FC38E'

function buildEvent(timestamp: number, sourceGuid: string, destGuid: string): CombatLogEvent {
  return {
    type: 'SPELL_CAST_SUCCESS',
    timestamp,
    sourceGuid,
    sourceName: 'Source',
    destGuid,
    destName: 'Dest',
    spellId: 30451,
    spellName: 'Déflagration des Arcanes',
  }
}

function buildAuraEvent(timestamp: number, sourceGuid: string, destGuid: string): CombatLogEvent {
  return {
    type: 'SPELL_AURA_APPLIED',
    timestamp,
    sourceGuid,
    sourceName: 'Source',
    destGuid,
    destName: 'Dest',
    spellId: 263725,
    spellName: 'Idées claires',
    auraType: 'BUFF',
  }
}

describe('detectCombatSegments', () => {
  it("retourne un unique segment pour une suite d'événements sans inactivité prolongée", () => {
    const events = [
      buildEvent(0, PLAYER_GUID, DUMMY_GUID),
      buildEvent(2000, PLAYER_GUID, DUMMY_GUID),
      buildEvent(4000, PLAYER_GUID, DUMMY_GUID),
    ]

    expect(detectCombatSegments(events, PLAYER_GUID, 5000)).toEqual([
      { startTimestamp: 0, endTimestamp: 4000 },
    ])
  })

  it("coupe en deux segments dès qu'un trou dépasse le seuil d'inactivité", () => {
    const events = [
      buildEvent(0, PLAYER_GUID, DUMMY_GUID),
      buildEvent(1000, PLAYER_GUID, DUMMY_GUID),
      buildEvent(10000, PLAYER_GUID, DUMMY_GUID),
      buildEvent(11000, PLAYER_GUID, DUMMY_GUID),
    ]

    expect(detectCombatSegments(events, PLAYER_GUID, 5000)).toEqual([
      { startTimestamp: 0, endTimestamp: 1000 },
      { startTimestamp: 10000, endTimestamp: 11000 },
    ])
  })

  it("l'inactivité d'un autre joueur ne coupe pas artificiellement le segment du joueur sélectionné", () => {
    const events = [
      buildEvent(0, PLAYER_GUID, DUMMY_GUID),
      buildEvent(1000, OTHER_PLAYER_GUID, DUMMY_GUID),
      buildEvent(4000, PLAYER_GUID, DUMMY_GUID),
    ]

    expect(detectCombatSegments(events, PLAYER_GUID, 5000)).toEqual([
      { startTimestamp: 0, endTimestamp: 4000 },
    ])
  })

  it('ignore les casts dont le joueur sélectionné est la cible plutôt que la source', () => {
    const events = [
      buildEvent(0, OTHER_PLAYER_GUID, DUMMY_GUID),
      buildEvent(1000, DUMMY_GUID, PLAYER_GUID),
    ]

    expect(detectCombatSegments(events, PLAYER_GUID, 5000)).toEqual([])
  })

  it("ignore les événements d'aura reçus par le joueur : ils ne démarrent pas un segment et ne comptent pas comme activité", () => {
    const events = [
      buildAuraEvent(0, DUMMY_GUID, PLAYER_GUID),
      buildEvent(4000, PLAYER_GUID, DUMMY_GUID),
      buildAuraEvent(4500, DUMMY_GUID, PLAYER_GUID),
      buildEvent(9000, PLAYER_GUID, DUMMY_GUID),
    ]

    expect(detectCombatSegments(events, PLAYER_GUID, 5000)).toEqual([
      { startTimestamp: 4000, endTimestamp: 9000 },
    ])
  })

  it('retourne une liste vide sans événement', () => {
    expect(detectCombatSegments([], PLAYER_GUID, 5000)).toEqual([])
  })
})
