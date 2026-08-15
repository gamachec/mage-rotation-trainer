import spellDatabase from './spell-database.json'

/**
 * Table de correspondance sort/aura ID ↔ nom (SPECS.md §5, PLAN.md Étape 12), maintenue à la
 * main. Sert principalement à nommer les sorts *référencés par la config de rotation*
 * (Étape 9) quand ils n'apparaissent pas dans le log en cours d'analyse — le parser (Étape 3)
 * extrait déjà `spellName` directement depuis les événements réels du log.
 */
const SPELL_NAMES: Record<string, string> = spellDatabase

/** Nom lisible d'un sort/aura à partir de son ID, ou un libellé de repli si absent de la table. */
export function getSpellName(spellId: number): string {
  return SPELL_NAMES[spellId] ?? `Sort inconnu (#${spellId})`
}
