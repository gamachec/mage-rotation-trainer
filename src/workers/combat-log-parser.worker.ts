/// <reference lib="webworker" />

import { parseCombatLog, type CombatLogParseProgress } from '../parser/combat-log-parser'
import type { CombatLogEvent } from '../types'

/** Message envoyé au worker pour démarrer le parsing d'un fichier combat log. */
export interface CombatLogParserWorkerRequest {
  type: 'parse'
  file: File
}

/**
 * Messages renvoyés par le worker : progression périodique (PLAN.md Étape 4), résultat
 * final, ou erreur (fichier illisible). Le parsing lui-même ne lève pas d'exception
 * (PLAN.md Étape 3) — seule la lecture du fichier peut échouer ici.
 */
export type CombatLogParserWorkerResponse =
  | ({ type: 'progress' } & CombatLogParseProgress)
  | { type: 'result'; events: CombatLogEvent[] }
  | { type: 'error'; message: string }

self.onmessage = async (event: MessageEvent<CombatLogParserWorkerRequest>) => {
  const { file } = event.data

  try {
    const logText = await file.text()
    const events = parseCombatLog(logText, (progress) => {
      const message: CombatLogParserWorkerResponse = { type: 'progress', ...progress }
      self.postMessage(message)
    })
    const message: CombatLogParserWorkerResponse = { type: 'result', events }
    self.postMessage(message)
  } catch (error) {
    const message: CombatLogParserWorkerResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(message)
  }
}
