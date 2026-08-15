/**
 * Icônes de sorts (SPECS.md §8) : embarquées localement dans le repo
 * (`src/assets/spell-icons/<spellId>.jpg`, sourcées une fois depuis Wowhead/Zamimg) plutôt que
 * chargées depuis un CDN externe à l'exécution — l'app reste 100% autonome au runtime.
 * `import.meta.glob` avec `eager: true` inline les URLs résolues par Vite au build, pas de
 * requête réseau supplémentaire au chargement.
 */
const iconModules = import.meta.glob<string>('../assets/spell-icons/*.jpg', {
  eager: true,
  import: 'default',
})

const SPELL_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(iconModules).map(([path, url]) => {
    const spellId = path.match(/(\d+)\.jpg$/)?.[1]
    return [spellId ?? path, url]
  }),
)

/** URL de l'icône d'un sort, ou `null` si aucune icône n'est embarquée pour cet ID. */
export function getSpellIcon(spellId: number): string | null {
  return SPELL_ICONS[spellId] ?? null
}
