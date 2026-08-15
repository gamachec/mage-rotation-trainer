/**
 * Nom lisible d'un type de ressource de personnage (`powerType`, ID numérique Blizzard),
 * maintenu à la main comme `spell-database.json`. Limité aux ressources
 * pertinentes pour la spé Arcane ; toute spé future ajoutant sa propre ressource étend cette
 * table plutôt que le moteur (générique, SPECS.md).
 */
const POWER_TYPE_NAMES: Record<number, string> = {
  16: 'Charges arcaniques',
}

/** Nom lisible d'une ressource à partir de son `powerType`, ou un libellé de repli si absent. */
export function getPowerTypeName(powerType: number): string {
  return POWER_TYPE_NAMES[powerType] ?? `Ressource inconnue (#${powerType})`
}
