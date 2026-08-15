/**
 * SpellId d'icône associé à un type de ressource (`powerType`, ID numérique Blizzard),
 * réutilisé via `getSpellIcon` (même table d'icônes que les sorts/auras). Limité aux
 * ressources pertinentes pour la spé Arcane pour l'instant ; toute spé future ajoutant
 * sa propre ressource étend cette table plutôt que le moteur (générique, SPECS.md),
 * comme `power-type-name.ts`.
 */
const POWER_TYPE_ICON_SPELL_IDS: Record<number, number> = {
  16: 36032, // Charges arcaniques
}

/** SpellId d'icône pour un `powerType`, ou `null` si aucune icône associée. */
export function getPowerTypeIconSpellId(powerType: number): number | null {
  return POWER_TYPE_ICON_SPELL_IDS[powerType] ?? null
}
