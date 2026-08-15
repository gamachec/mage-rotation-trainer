import type { CombatLogEvent } from '../types'
import type {
  CombatLogParserWorkerRequest,
  CombatLogParserWorkerResponse,
} from './combat-log-parser.worker'
import type { CombatLogParseProgress } from '../parser/combat-log-parser'

/**
 * Parse un fichier combat log dans un Web Worker dédié, pour ne pas geler l'UI sur les
 * gros fichiers (SPECS.md §8). Le worker est créé pour cet appel et
 * terminé une fois le résultat (ou l'erreur) reçu.
 */
export function parseCombatLogFile(
  file: File,
  onProgress?: (progress: CombatLogParseProgress) => void,
): Promise<CombatLogEvent[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./combat-log-parser.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<CombatLogParserWorkerResponse>) => {
      const message = event.data
      switch (message.type) {
        case 'progress':
          onProgress?.(message)
          break
        case 'result':
          worker.terminate()
          resolve(message.events)
          break
        case 'error':
          worker.terminate()
          reject(new Error(message.message))
          break
      }
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message))
    }

    const request: CombatLogParserWorkerRequest = { type: 'parse', file }
    worker.postMessage(request)
  })
}
