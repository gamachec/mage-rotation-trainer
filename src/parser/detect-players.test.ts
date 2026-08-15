import { describe, expect, it } from 'vitest'
import { detectPlayers } from './detect-players'
import { parseCombatLog } from './combat-log-parser'
import type { CombatLogEvent } from '../types'

/** Lignes réelles issues du même log que combat-log-parser.test.ts. */
const REAL_LOG_TEXT = [
  `8/15/2026 11:27:07.8822  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,12.1.0,PROJECT_ID,1`,
  `8/15/2026 11:27:15.9822  SPELL_CAST_SUCCESS,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Creature-0-3894-0-85410-243167-00007FC38E,"Mannequin d'entraînement de donjonage",0x10a28,0x80000000,30451,"Déflagration des Arcanes",0x40,Player-1127-0AC1C10B,0000000000000000,576620,576620,229,2481,541,592,152,0,0,331065,331065,6875,8196.63,-4344.20,2393,2.8493,293`,
  `8/15/2026 11:27:08.4912  SPELL_AURA_APPLIED,Player-1127-04F2BE4F,"Meonys-LesSentinelles-EU",0x548,0x80000000,Player-1127-04F2BE4F,"Meonys-LesSentinelles-EU",0x548,0x80000000,1277482,"Désir du Vide",0x20,BUFF`,
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

describe('detectPlayers', () => {
  it('détecte les joueurs présents comme source ou cible sur un vrai log, en excluant le mannequin', () => {
    const events = parseCombatLog(REAL_LOG_TEXT)
    const players = detectPlayers(events)

    expect(players).toEqual([
      { guid: 'Player-1127-0AC1C10B', name: 'Hânakiel-KirinTor-EU' },
      { guid: 'Player-1127-04F2BE4F', name: 'Meonys-LesSentinelles-EU' },
    ])
  })

  it('déduplique par GUID, pas par nom', () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_CAST_SUCCESS',
        sourceGuid: 'Player-1-AAAA',
        sourceName: 'Hânakiel-KirinTor-EU',
        destGuid: 'Creature-0-1',
        destName: 'Mannequin',
      }),
      buildEvent({
        type: 'SPELL_CAST_SUCCESS',
        sourceGuid: 'Player-1-AAAA',
        sourceName: 'Hânakiel-KirinTor-EU',
        destGuid: 'Creature-0-1',
        destName: 'Mannequin',
      }),
      buildEvent({
        type: 'SPELL_CAST_SUCCESS',
        sourceGuid: 'Player-2-BBBB',
        sourceName: 'Hânakiel-AutreRoyaume-EU',
        destGuid: 'Creature-0-1',
        destName: 'Mannequin',
      }),
    ]

    expect(detectPlayers(events)).toEqual([
      { guid: 'Player-2-BBBB', name: 'Hânakiel-AutreRoyaume-EU' },
      { guid: 'Player-1-AAAA', name: 'Hânakiel-KirinTor-EU' },
    ])
  })

  it('exclut les créatures et les pets via le préfixe de leur GUID', () => {
    const events: CombatLogEvent[] = [
      buildEvent({
        type: 'SPELL_CAST_SUCCESS',
        sourceGuid: 'Player-1-AAAA',
        sourceName: 'Hânakiel-KirinTor-EU',
        destGuid: 'Creature-0-1',
        destName: 'Mannequin',
      }),
      buildEvent({
        type: 'SPELL_DAMAGE',
        sourceGuid: 'Pet-0-1-1127-1234-56789-00001111',
        sourceName: 'Familier',
        destGuid: 'Creature-0-1',
        destName: 'Mannequin',
        amount: 100,
      } as Partial<CombatLogEvent> & { type: 'SPELL_DAMAGE' }),
    ]

    expect(detectPlayers(events)).toEqual([{ guid: 'Player-1-AAAA', name: 'Hânakiel-KirinTor-EU' }])
  })

  it('retourne une liste vide sans joueur détecté', () => {
    expect(detectPlayers([])).toEqual([])
  })
})
