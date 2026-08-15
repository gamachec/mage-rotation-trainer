import { describe, expect, it } from 'vitest'
import { parseCombatLog, parseCombatLogLine } from './combat-log-parser'

/**
 * Lignes extraites telles quelles d'un vrai combat log retail (12.1.0, advanced logging
 * activé), généré par l'utilisateur sur un mannequin d'entraînement.
 */
const REAL_LINES = {
  castSuccess: `8/15/2026 11:27:15.9822  SPELL_CAST_SUCCESS,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Creature-0-3894-0-85410-243167-00007FC38E,"Mannequin d'entraînement de donjonage",0x10a28,0x80000000,30451,"Déflagration des Arcanes",0x40,Player-1127-0AC1C10B,0000000000000000,576620,576620,229,2481,541,592,152,0,0,331065,331065,6875,8196.63,-4344.20,2393,2.8493,293`,
  castStart: `8/15/2026 17:40:42.9232  SPELL_CAST_START,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,0000000000000000,nil,0x80000000,0x80000000,1295924,"Trait prismatique",0x40`,
  auraApplied: `8/15/2026 11:27:15.9832  SPELL_AURA_APPLIED,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,1242974,"Salve arcanique",0x40,BUFF`,
  auraAppliedDose: `8/15/2026 11:27:17.6962  SPELL_AURA_APPLIED_DOSE,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,1242974,"Salve arcanique",0x40,BUFF,4`,
  auraRemovedDose: `8/15/2026 11:27:21.9782  SPELL_AURA_REMOVED_DOSE,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,449322,"Cascade de mana",0x1,BUFF,1`,
  auraRemoved: `8/15/2026 11:27:23.6852  SPELL_AURA_REMOVED,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,449322,"Cascade de mana",0x1,BUFF`,
  damage: `8/15/2026 11:27:15.9852  SPELL_DAMAGE,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Creature-0-3894-0-85410-243167-00007FC38E,"Mannequin d'entraînement de donjonage",0x10a28,0x80000000,30451,"Déflagration des Arcanes",0x40,Creature-0-3894-0-85410-243167-00007FC38E,0000000000000000,4116245,7074100,0,0,1470,0,0,0,1,0,0,0,8181.56,-4338.34,2393,2.2479,90,14829,6595,-1,64,0,0,0,1,nil,nil,ST`,
  energize: `8/15/2026 15:25:55.0392  SPELL_ENERGIZE,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,Player-1127-0AC1C10B,"Hânakiel-KirinTor-EU",0x511,0x80000000,461524,"Haute tension",0x40,Player-1127-0AC1C10B,0000000000000000,576620,576620,229,2505,541,592,152,185959,0,57863,331065,0,8184.83,-4356.53,2393,4.8513,293,1.0000,0.0000,16,4`,
  unhandled: `8/15/2026 11:27:40.0222  SPELL_PERIODIC_DAMAGE,Player-1127-099B38FC,"Khazoute-LesSentinelles-EU",0x548,0x80000000,Creature-0-3894-0-85410-243166-00007FC38E,"Tank d'entraînement normal",0xa28,0x80000000,1287663,"Rune de persistance",0x6a,Creature-0-3894-0-85410-243166-00007FC38E,0000000000000000,1,3537050,0,0,1470,0,0,0,1,0,0,0,8210.03,-4353.90,2393,3.4441,90,361,360,360,106,0,0,0,nil,nil,nil,ST`,
  header: `8/15/2026 11:27:07.8822  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,12.1.0,PROJECT_ID,1`,
}

const ARBITRARY_BASE_MS = 0

describe('parseCombatLogLine', () => {
  it('parse un SPELL_CAST_SUCCESS', () => {
    const event = parseCombatLogLine(REAL_LINES.castSuccess, ARBITRARY_BASE_MS)
    expect(event).toMatchObject({
      type: 'SPELL_CAST_SUCCESS',
      sourceGuid: 'Player-1127-0AC1C10B',
      sourceName: 'Hânakiel-KirinTor-EU',
      destGuid: 'Creature-0-3894-0-85410-243167-00007FC38E',
      destName: "Mannequin d'entraînement de donjonage",
      spellId: 30451,
      spellName: 'Déflagration des Arcanes',
    })
  })

  it('parse un SPELL_CAST_START (début de cast, temps de cast non-instantané)', () => {
    const event = parseCombatLogLine(REAL_LINES.castStart, ARBITRARY_BASE_MS)
    expect(event).toMatchObject({
      type: 'SPELL_CAST_START',
      sourceGuid: 'Player-1127-0AC1C10B',
      sourceName: 'Hânakiel-KirinTor-EU',
      spellId: 1295924,
      spellName: 'Trait prismatique',
    })
  })

  it('parse un SPELL_AURA_APPLIED avec son type BUFF', () => {
    const event = parseCombatLogLine(REAL_LINES.auraApplied, ARBITRARY_BASE_MS)
    expect(event).toMatchObject({
      type: 'SPELL_AURA_APPLIED',
      spellId: 1242974,
      spellName: 'Salve arcanique',
      auraType: 'BUFF',
    })
  })

  it('parse un SPELL_AURA_APPLIED_DOSE avec ses stacks', () => {
    const event = parseCombatLogLine(REAL_LINES.auraAppliedDose, ARBITRARY_BASE_MS)
    expect(event).toMatchObject({
      type: 'SPELL_AURA_APPLIED_DOSE',
      auraType: 'BUFF',
      stacks: 4,
    })
  })

  it('parse un SPELL_AURA_REMOVED_DOSE avec ses stacks', () => {
    const event = parseCombatLogLine(REAL_LINES.auraRemovedDose, ARBITRARY_BASE_MS)
    expect(event).toMatchObject({
      type: 'SPELL_AURA_REMOVED_DOSE',
      auraType: 'BUFF',
      stacks: 1,
    })
  })

  it('parse un SPELL_AURA_REMOVED', () => {
    const event = parseCombatLogLine(REAL_LINES.auraRemoved, ARBITRARY_BASE_MS)
    expect(event).toMatchObject({
      type: 'SPELL_AURA_REMOVED',
      spellId: 449322,
      spellName: 'Cascade de mana',
      auraType: 'BUFF',
    })
  })

  it('parse un SPELL_DAMAGE en extrayant le montant malgré les champs advanced logging', () => {
    const event = parseCombatLogLine(REAL_LINES.damage, ARBITRARY_BASE_MS)
    expect(event).toMatchObject({
      type: 'SPELL_DAMAGE',
      spellId: 30451,
      amount: 14829,
    })
  })

  it('parse un SPELL_ENERGIZE (gain de ressource, ex : charges arcaniques powerType 16)', () => {
    const event = parseCombatLogLine(REAL_LINES.energize, ARBITRARY_BASE_MS)
    expect(event).toMatchObject({
      type: 'SPELL_ENERGIZE',
      spellId: 461524,
      spellName: 'Haute tension',
      amount: 1,
      powerType: 16,
      maxPower: 4,
    })
  })

  it("ignore un type d'événement non géré par l'application (SPELL_PERIODIC_DAMAGE)", () => {
    const event = parseCombatLogLine(REAL_LINES.unhandled, ARBITRARY_BASE_MS)
    expect(event).toBeNull()
  })

  it("ignore une ligne d'en-tête sans le format d'événement SPELL_*", () => {
    const event = parseCombatLogLine(REAL_LINES.header, ARBITRARY_BASE_MS)
    expect(event).toBeNull()
  })

  it("ignore une ligne malformée sans lever d'exception", () => {
    expect(() =>
      parseCombatLogLine("ceci n'est pas une ligne de log", ARBITRARY_BASE_MS),
    ).not.toThrow()
    expect(parseCombatLogLine("ceci n'est pas une ligne de log", ARBITRARY_BASE_MS)).toBeNull()
  })
})

describe('parseCombatLog', () => {
  it('calcule des timestamps relatifs au début du fichier', () => {
    const text = [REAL_LINES.header, REAL_LINES.castSuccess, REAL_LINES.damage].join('\n')
    const events = parseCombatLog(text)

    expect(events).toHaveLength(2)
    // header (11:27:07.8822) -> castSuccess (11:27:15.9822) : 8.1s plus tard
    expect(events[0]).toMatchObject({ type: 'SPELL_CAST_SUCCESS', timestamp: 8100 })
    // damage 3ms après le castSuccess dans le fichier réel
    expect(events[1]).toMatchObject({ type: 'SPELL_DAMAGE', timestamp: 8103 })
  })

  it('filtre les lignes non gérées et garde uniquement les événements gérés', () => {
    const text = [
      REAL_LINES.header,
      REAL_LINES.unhandled,
      REAL_LINES.auraApplied,
      REAL_LINES.auraAppliedDose,
    ].join('\n')
    const events = parseCombatLog(text)

    expect(events.map((e) => e.type)).toEqual(['SPELL_AURA_APPLIED', 'SPELL_AURA_APPLIED_DOSE'])
  })

  it('retourne une liste vide pour un fichier vide', () => {
    expect(parseCombatLog('')).toEqual([])
  })
})
