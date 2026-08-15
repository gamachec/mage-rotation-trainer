import type { AuraType, CombatLogEvent, CombatLogEventBase, CombatLogEventType } from '../types'

/**
 * Types d'événements gérés par l'application (SPECS.md §3-6). Toute autre ligne
 * (SPELL_CAST_FAILED, ENCOUNTER_START/END, UNIT_DIED, SPELL_PERIODIC_DAMAGE, ...)
 * est ignorée proprement plutôt qu'interprétée à moitié.
 */
const HANDLED_EVENT_TYPES = new Set<CombatLogEventType>([
  'SPELL_CAST_SUCCESS',
  'SPELL_AURA_APPLIED',
  'SPELL_AURA_APPLIED_DOSE',
  'SPELL_AURA_REMOVED',
  'SPELL_AURA_REMOVED_DOSE',
  'SPELL_DAMAGE',
  'SPELL_ENERGIZE',
])

/**
 * Sépare la partie CSV d'une ligne de log en champs de premier niveau, en respectant
 * les guillemets (noms contenant virgules/apostrophes) et les parenthèses imbriquées
 * (sous-listes utilisées par certains types d'événements non gérés par l'application).
 */
function splitFields(rest: string): string[] {
  const fields: string[] = []
  let current = ''
  let depth = 0
  let inQuotes = false

  for (const char of rest) {
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
    } else if (char === '(' && !inQuotes) {
      depth++
      current += char
    } else if (char === ')' && !inQuotes) {
      depth--
      current += char
    } else if (char === ',' && depth === 0 && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)

  return fields
}

function stripQuotes(field: string): string {
  if (field.startsWith('"') && field.endsWith('"')) {
    return field.slice(1, -1)
  }
  return field
}

/**
 * En-tête de ligne du combat log retail : "M/D/YYYY  H:MM:SS.ffff  <reste de la ligne>".
 * Le nombre de chiffres de la fraction de seconde varie selon la version du client
 * (observé : 3 ou 4 chiffres) — on l'interprète toujours comme une fraction décimale
 * de seconde, pas comme des millisecondes brutes.
 */
const LINE_HEADER_PATTERN =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})\.(\d+) {2}(.*)$/

function parseAbsoluteTimestampMs(
  month: string,
  day: string,
  year: string,
  hour: string,
  minute: string,
  second: string,
  fraction: string,
): number {
  const dateMs = Date.UTC(Number(year), Number(month) - 1, Number(day))
  const fractionMs = Math.round(Number(`0.${fraction}`) * 1000)
  const timeMs = (Number(hour) * 3600 + Number(minute) * 60 + Number(second)) * 1000 + fractionMs
  return dateMs + timeMs
}

/** Champs communs, extraits pour tous les types d'événements SPELL_* gérés. */
interface ParsedPrefix {
  eventType: CombatLogEventType
  base: Omit<CombatLogEventBase, 'timestamp'>
  spellId: number
  spellName: string
  /** Champs restants après le spellSchool (advanced logging + suffixe propre à l'événement). */
  rest: string[]
}

/** Index, dans `rest`, du champ `amount` de SPELL_DAMAGE (19 champs d'advanced logging avant lui). */
const SPELL_DAMAGE_AMOUNT_INDEX = 19

/**
 * Index, dans `rest`, des champs de suffixe propres à SPELL_ENERGIZE (mêmes 19 champs
 * d'advanced logging que SPELL_DAMAGE avant eux — vérifié empiriquement sur un vrai combat
 * log) : `amount, overEnergize, powerType, maxPower`. `overEnergize` n'est
 * pas capturé dans `SpellEnergizeEvent` (pas de besoin identifié).
 */
const SPELL_ENERGIZE_AMOUNT_INDEX = 19
const SPELL_ENERGIZE_POWER_TYPE_INDEX = 21
const SPELL_ENERGIZE_MAX_POWER_INDEX = 22

function parsePrefix(fields: string[], eventType: CombatLogEventType): ParsedPrefix | null {
  if (fields.length < 12) {
    return null
  }

  const spellId = Number(fields[9])
  if (Number.isNaN(spellId)) {
    return null
  }

  return {
    eventType,
    base: {
      sourceGuid: fields[1],
      sourceName: stripQuotes(fields[2]),
      destGuid: fields[5],
      destName: stripQuotes(fields[6]),
    },
    spellId,
    spellName: stripQuotes(fields[10]),
    rest: fields.slice(12),
  }
}

function isAuraType(value: string | undefined): value is AuraType {
  return value === 'BUFF' || value === 'DEBUFF'
}

function buildEvent(prefix: ParsedPrefix, timestamp: number): CombatLogEvent | null {
  const { eventType, base, spellId, spellName, rest } = prefix
  const spellFields = { spellId, spellName }

  switch (eventType) {
    case 'SPELL_CAST_SUCCESS':
      return { type: 'SPELL_CAST_SUCCESS', timestamp, ...base, ...spellFields }

    case 'SPELL_AURA_APPLIED':
    case 'SPELL_AURA_REMOVED': {
      const auraType = rest[0]
      if (!isAuraType(auraType)) {
        return null
      }
      return { type: eventType, timestamp, ...base, ...spellFields, auraType }
    }

    case 'SPELL_AURA_APPLIED_DOSE':
    case 'SPELL_AURA_REMOVED_DOSE': {
      const auraType = rest[0]
      const stacks = Number(rest[1])
      if (!isAuraType(auraType) || Number.isNaN(stacks)) {
        return null
      }
      return { type: eventType, timestamp, ...base, ...spellFields, auraType, stacks }
    }

    case 'SPELL_DAMAGE': {
      const amount = Number(rest[SPELL_DAMAGE_AMOUNT_INDEX])
      if (Number.isNaN(amount)) {
        return null
      }
      return { type: 'SPELL_DAMAGE', timestamp, ...base, ...spellFields, amount }
    }

    case 'SPELL_ENERGIZE': {
      const amount = Number(rest[SPELL_ENERGIZE_AMOUNT_INDEX])
      const powerType = Number(rest[SPELL_ENERGIZE_POWER_TYPE_INDEX])
      const maxPower = Number(rest[SPELL_ENERGIZE_MAX_POWER_INDEX])
      if (Number.isNaN(amount) || Number.isNaN(powerType) || Number.isNaN(maxPower)) {
        return null
      }
      return {
        type: 'SPELL_ENERGIZE',
        timestamp,
        ...base,
        ...spellFields,
        amount,
        powerType,
        maxPower,
      }
    }

    default:
      return null
  }
}

/**
 * Parse une ligne brute de combat log en événement typé.
 * Retourne `null` si la ligne n'est pas un type d'événement géré par l'application, ou si
 * elle est malformée — jamais d'exception, pour ne pas interrompre le parsing du fichier
 * sur une ligne isolée inattendue.
 *
 * `baseTimestampMs` est l'horodatage absolu (ms) de la première ligne du fichier ; le
 * `timestamp` de l'événement retourné est relatif à cette base (voir CombatLogEventBase).
 */
export function parseCombatLogLine(line: string, baseTimestampMs: number): CombatLogEvent | null {
  const headerMatch = LINE_HEADER_PATTERN.exec(line)
  if (!headerMatch) {
    return null
  }
  const [, month, day, year, hour, minute, second, fraction, rest] = headerMatch

  const eventType = rest.slice(0, rest.indexOf(',')) as CombatLogEventType
  if (!HANDLED_EVENT_TYPES.has(eventType)) {
    return null
  }

  const fields = splitFields(rest)
  const prefix = parsePrefix(fields, eventType)
  if (!prefix) {
    return null
  }

  const absoluteMs = parseAbsoluteTimestampMs(month, day, year, hour, minute, second, fraction)
  return buildEvent(prefix, absoluteMs - baseTimestampMs)
}

/** Extrait l'horodatage absolu (ms) de la première ligne du fichier, servant de base relative. */
function parseBaseTimestampMs(firstLine: string): number | null {
  const headerMatch = LINE_HEADER_PATTERN.exec(firstLine)
  if (!headerMatch) {
    return null
  }
  const [, month, day, year, hour, minute, second, fraction] = headerMatch
  return parseAbsoluteTimestampMs(month, day, year, hour, minute, second, fraction)
}

/** Avancement du parsing d'un fichier combat log complet. */
export interface CombatLogParseProgress {
  processedLines: number
  totalLines: number
}

/** Nombre de lignes traitées entre deux rapports de progression. */
const PROGRESS_REPORT_INTERVAL = 500

/**
 * Parse le texte brut d'un fichier combat log complet en liste d'événements typés.
 * Les lignes d'un type d'événement non géré par l'application, ou malformées, sont ignorées
 * silencieusement plutôt que d'interrompre le parsing.
 *
 * `onProgress`, si fourni, est appelé périodiquement pendant le parsing —
 * utilisé par le Web Worker pour faire remonter une progression à l'UI sur les gros fichiers.
 */
export function parseCombatLog(
  logText: string,
  onProgress?: (progress: CombatLogParseProgress) => void,
): CombatLogEvent[] {
  const lines = logText.split(/\r?\n/).filter((line) => line.length > 0)
  if (lines.length === 0) {
    return []
  }

  const baseTimestampMs = parseBaseTimestampMs(lines[0])
  if (baseTimestampMs === null) {
    return []
  }

  const totalLines = lines.length
  const events: CombatLogEvent[] = []
  for (let i = 0; i < totalLines; i++) {
    const event = parseCombatLogLine(lines[i], baseTimestampMs)
    if (event) {
      events.push(event)
    }

    const processedLines = i + 1
    if (
      onProgress &&
      (processedLines % PROGRESS_REPORT_INTERVAL === 0 || processedLines === totalLines)
    ) {
      onProgress({ processedLines, totalLines })
    }
  }
  return events
}
