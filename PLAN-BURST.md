# PLAN-BURST.md — Gestion de l'opener et des cooldowns de burst (Arcane)

Extension post-MVP de `PLAN.md` (étapes 1-15 terminées, étape 16 « vrai log » en attente). Objectif : détecter la bonne utilisation de l'opener et des cooldowns de burst Arcane, en respectant l'architecture générique existante (`RotationConfig` + moteur `src/engine`), sans coder de règle Arcane en dur (CLAUDE.md).

Conformément au process CLAUDE.md, les décisions fonctionnelles ci-dessous (§ Étape BURST-0) doivent être tranchées avec l'utilisateur avant implémentation, puis répercutées dans `SPECS.md`.

---

## 1. Analyse de la séquence opener/burst (source Wowhead)

Séquence fournie par l'utilisateur, débarrassée des éléments hors-scope pour un mannequin d'entraînement (potions/trinkets, Distorsion temporelle) :

1. Cast **Éruption d'arcanes** (Arcane Surge).
2. Cast **Projectiles des Arcanes** une fois, puis **Barrage des Arcanes**.
3. Cast **Toucher des magi** (Touch of the Magi) si Barrage des Arcanes ou Trait prismatique est « mid-air », OU si Éruption d'arcanes a ≤ 13s restantes (si elle est active).
4. 45s plus tard, quand le cooldown de Toucher des magi est prêt, répéter l'étape 3.

**Observations clés pour la conception :**

- L'étape 2 (« Missiles une fois puis Barrage ») est **déjà couverte** par les règles existantes de `default-rotation-arcane.json` (Projectiles des Arcanes si Idées claires actif et charges < 12, sinon Barrage des Arcanes si charges ≥ 12) — pas de nouvelle logique nécessaire ici, à condition qu'Éruption d'arcanes déclenche bien un état équivalent (à vérifier sur un vrai log, voir Étape BURST-0.4).
- Les étapes 3 et 4 décrivent en réalité **une seule règle conditionnelle évaluée en continu** (pas un automate à états « ouverture » / « sustain ») : « caster Toucher des magi dès qu'il est prêt ET qu'une des conditions de timing est vraie ». Le fait que ça se reproduise toutes les 45s est une conséquence naturelle de la réévaluation continue du moteur existant, pas une mécanique à modéliser explicitement.
- Deux notions manquent au modèle actuel pour exprimer ça : **« ce sort est-il prêt (cooldown) »** et **« le sort précédent était-il X » (approximation de « mid-air »)**, plus optionnellement **« combien de temps reste-t-il sur cette aura »**.
- IDs de sorts vérifiés (Wowhead, retail actuel) : **Éruption d'arcanes = 365350** (cooldown 90s, durée du buff 12s), **Toucher des magi = 321507** (cooldown 45s). Barrage des Arcanes (44425) et Trait prismatique (1295924) sont déjà dans la config — rappel : l'ID 1295924 pour Trait prismatique reste une hypothèse non confirmée sur un vrai log (signalé dans PLAN.md « Repères pour reprendre à froid »), à revérifier en même temps que cette fonctionnalité.
- Point tranché avec l'utilisateur (voir Étape BURST-0) : la condition « Éruption d'arcanes ≤ 13s restantes » est abandonnée, simplifiée en `auraActive(365350, true)`. Pas besoin d'un type de condition « temps restant sur une aura » pour cette fonctionnalité.

---

## Étape BURST-0 — Décisions tranchées avec l'utilisateur ✅ Tranchées

1. **IDs de sorts** (365350, 321507) : à confirmer sur un vrai combat log incluant un cast d'Éruption d'arcanes et de Toucher des magi (reste à faire — voir Étape BURST-6). Incertitude déjà connue sur 1295924 (Trait prismatique, cf. PLAN.md) à revérifier en même temps.
2. **✅ Tranché** : la condition « ≤ 13s restantes » est abandonnée, remplacée par `auraActive(365350, true)`. Pas de nouveau type de condition « temps restant » — le schéma n'a besoin que de `spellCooldownReady` et `previousCastIs` (Étape BURST-1).
3. **✅ Tranché** : le cooldown-tracking reste volontairement limité à Éruption d'arcanes et Toucher des magi pour l'instant — pas de système générique de cooldown pour tous les sorts (limite MVP toujours en vigueur pour le reste, SPECS.md §5). Le cooldown de ces deux sorts est approximé à partir de leurs propres casts dans la timeline (dernier cast + durée fixe connue), sans changement du parser.
4. **✅ Tranché** : le score global (%) **doit être impacté** par un cooldown de burst gaspillé. Chaque cooldown de burst prêt-et-non-utilisé (au sens du seuil BURST-0.5) compte comme une opportunité manquée, au même titre qu'un mauvais sort casté — voir formule révisée en Étape BURST-3.
5. **✅ Tranché** : seuil `DEFAULT_COOLDOWN_WASTED_THRESHOLD_MS = 2500` ms.
6. **✅ Tranché** : un cooldown non réutilisé avant la fin du segment (ex: Toucher des magi redevient prêt 10s avant la fin du combat et n'est jamais recasté) compte aussi comme une erreur si le temps restant avant la fin du segment dépasse le seuil (`castAt: null`) — et impacte donc également le score (cohérent avec le point 4).

Une fois l'implémentation faite, mettre à jour `SPECS.md` §5 (nouveaux types de condition) et §6 (le type d'erreur « mauvaise gestion des cooldowns » devient partiellement in-scope, uniquement pour les cooldowns explicitement suivis via la config — pas un système générique ; formule du score révisée pour inclure les cooldowns gaspillés).

---

## Étape BURST-1 — Extension du schéma de condition (`RotationCondition`) ✅ Faite

Ajouter deux nouveaux types de condition, génériques (pas de nom Arcane en dur), dans `src/types/rotation-config.ts` :

```ts
/** Vrai si aucun cast de `spellId` n'a eu lieu dans les `cooldownMs` précédant l'instant évalué
 *  (approximation du cooldown réel : durée fixe connue, pas de calcul serveur/talents/haste). */
interface SpellCooldownReadyCondition {
  type: 'spellCooldownReady'
  spellId: number
  cooldownMs: number
}

/** Vrai si le cast immédiatement précédent dans la timeline était `spellId»
 *  (approximation de « mid-air » : le sort a été casté juste avant celui-ci). */
interface PreviousCastCondition {
  type: 'previousCastIs'
  spellId: number
}
```

Pas de troisième type de condition « temps restant sur une aura » (BURST-0.2 tranché : simplifié en `auraActive`) — ces deux types suffisent pour exprimer l'ensemble de la séquence opener/burst.

**Contexte** :

- Pas de logique « OU » ajoutée au niveau d'une règle (conditions restent en ET, décision Étape 0 du plan original) — une condition « OU » s'exprime en dupliquant la règle (même `spellId`, conditions différentes), comme c'est déjà implicitement possible avec le schéma actuel. C'est ainsi qu'on exprime « ToM si Barrage mid-air OU Spark mid-air OU Surge bientôt fini » : 2 ou 3 règles distinctes pointant vers 321507.
- `parseRotationConfig` (`src/data/load-rotation-config.ts`) doit valider ces nouveaux types (mêmes règles que les types existants : `spellId`/`cooldownMs`/`durationMs`/`thresholdMs` numériques, messages d'erreur ciblant le chemin exact).
- Mettre à jour `RotationCondition` (union) et tous les endroits qui font un `switch` exhaustif dessus (`compare-rotation.ts`) pour que le typage TS force la prise en compte des nouveaux cas.

---

## Étape BURST-2 — Extension du moteur (`compare-rotation.ts`) ✅ Faite

Le moteur actuel n'a accès, pour évaluer une règle, qu'à l'état des auras actives (`Map<number, Aura>`). Il faut lui donner deux informations supplémentaires, dérivables de `PlayerTimeline` sans toucher au parser :

**Historique des casts avant l'instant évalué** (pour `spellCooldownReady` et `previousCastIs`) : passer `timeline.casts` (ou la sous-liste des casts strictement avant le cast courant) en plus de `activeAuras` dans `evaluateCondition`/`matchesRule`/`resolveExpectedSpell`.
   - `spellCooldownReady(spellId, cooldownMs)` : vrai si `!lastCastBefore(spellId)` ou `timestamp - lastCastBefore(spellId).timestamp >= cooldownMs`.
   - `previousCastIs(spellId)` : vrai si le cast **immédiatement précédent** (index - 1 dans `timeline.casts`) a `spell.id === spellId`. Faux pour le tout premier cast (pas de précédent).

Pas besoin de suivre l'instant d'activation des auras (plus nécessaire depuis l'abandon de `auraRemainingBelow`, BURST-0.2) — `resolveActiveAurasBefore` reste inchangée.

**Contexte** :

- `resolveExpectedSpell`/`compareRotation` gardent la même signature de sortie (`RotationComparisonResult[]`) — seul l'interne change. Pas d'impact sur `classify-rotation-errors.ts` côté `wrong-spell`/`rotation-gap`, ni sur l'UI existante.
- Rester générique : ces deux notions (« dernier cast de X », « cast précédent ») sont réutilisables par n'importe quelle future spé, pas seulement Arcane — cohérent avec CLAUDE.md.
- Documenter explicitement l'approximation (commentaire, comme le reste du moteur le fait déjà pour l'absence de GCD/latence) : `spellCooldownReady` ignore les modificateurs de cooldown (talents, haste, réductions) — il suppose une durée fixe donnée dans la config, tout comme `auraRemainingBelow` suppose une durée de buff fixe. C'est un choix de simulation basique cohérent avec la décision Étape 0 du plan original.

---

## Étape BURST-3 — Détection des cooldowns de burst gaspillés ✅ Faite

Nouveau module `src/engine/detect-wasted-cooldowns.ts` (ne pas surcharger `classify-rotation-errors.ts`, même pattern de séparation que `compare-rotation.ts` / `classify-rotation-errors.ts`) :

```ts
function detectWastedCooldowns(
  timeline: PlayerTimeline,
  config: RotationConfig,
  segmentEndTimestamp: number,
  wastedThresholdMs = DEFAULT_COOLDOWN_WASTED_THRESHOLD_MS,
): CooldownWastedError[]
```

**Logique** :

1. Déterminer automatiquement la liste des « cooldowns de burst suivis » en scannant `config.rules` : toute règle dont une condition `spellCooldownReady` porte sur le **même `spellId` que la règle elle-même** (auto-référence) est traitée comme un cooldown suivi — évite d'ajouter un nouveau champ de config dupliqué, reste générique (n'importe quelle spé peut déclarer ses propres CDs de burst de cette façon, juste en écrivant sa config).
2. Pour chaque cooldown suivi `(spellId, cooldownMs)` : construire la liste triée des instants où il devient « prêt » — `0` (début du segment, hypothèse : CD dispo au pull) puis `castTimestamp + cooldownMs` pour chaque cast réel de `spellId`.
3. Pour chaque instant « prêt » `R`, chercher le prochain cast réel de `spellId` à un instant `C ≥ R` :
   - si `C - R > wastedThresholdMs` → erreur avec `castAt: C`.
   - si aucun cast suivant et `segmentEndTimestamp - R > wastedThresholdMs` → erreur avec `castAt: null`.

**Nouveau type d'erreur**, dans `src/types/rotation-analysis.ts` :

```ts
export interface CooldownWastedError {
  type: 'cooldown-wasted'
  spellId: number
  readyAt: number
  castAt: number | null
  delayMs: number
}
```

`RotationErrorType` devient `'wrong-spell' | 'rotation-gap' | 'cooldown-wasted'`, `RotationError` inclut `CooldownWastedError`.

**Contexte** :

- Nécessite de faire remonter `segmentEndTimestamp` (déjà connu dans `App.vue` via le `CombatSegment` choisi à l'étape 6/13) jusqu'au point d'appel de cette nouvelle fonction — pas de nouvelle donnée à extraire du log, juste du plumbing.

### Score global révisé (décision BURST-0.4)

Le score doit désormais tenir compte des cooldowns de burst gaspillés, pas seulement des casts. Chaque cooldown gaspillé (au sens BURST-3) compte comme une opportunité manquée, au même titre qu'un `wrong-spell` :

```
scoredCasts = totalCasts - incompleteConfigCasts
score = correctCasts / (scoredCasts + wastedCooldownsCount)
```

(`correctCasts` inchangé — un CD gaspillé n'ajoute jamais de point, il ne fait qu'agrandir le dénominateur ; 100% par défaut si le dénominateur est 0, comme aujourd'hui.)

Ce calcul ne peut plus se faire uniquement dans `classifyRotationErrors` (qui ne connaît que `RotationComparisonResult[]`, pas `timeline`/`config`/`segmentEndTimestamp`). Deux options :

- **(a)** Étendre `classifyRotationErrors` pour accepter `timeline`, `config` et `segmentEndTimestamp` en plus, et faire l'appel à `detectWastedCooldowns` en interne.
- **(b)** Introduire un nouveau point d'orchestration `src/engine/analyze-rotation.ts` — `analyzeRotation(timeline, config, segmentEndTimestamp) => RotationAnalysisResult` — qui appelle `compareRotation` → `classifyRotationErrors` (score « casts seuls », inchangée) → `detectWastedCooldowns`, fusionne les deux listes d'erreurs (triées par timestamp/`readyAt`) et **recalcule** le score final avec la formule ci-dessus. `classifyRotationErrors` reste testable isolément avec son score « casts seuls » actuel (utile pour les tests unitaires), mais n'est plus la fonction appelée directement par `App.vue`.

Préférence de ce plan : **(b)**, cohérent avec la séparation à une responsabilité par module déjà en place (`compare-rotation.ts` / `classify-rotation-errors.ts`) — `App.vue` appellerait alors uniquement `analyzeRotation(...)` à la place de la chaîne `compareRotation` → `classifyRotationErrors` actuelle. À confirmer/ajuster au moment de l'implémentation si (a) s'avère plus simple en pratique.

`RotationAnalysisResult` (`src/types/rotation-analysis.ts`) gagne un champ `wastedCooldownsCount: number` (transparence dans le rapport, cf. Étape BURST-5) en plus du champ `errors` qui contient déjà les `CooldownWastedError`.

---

## Étape BURST-4 — Config Arcane par défaut : règles opener/burst ✅ Faite

Mettre à jour `src/data/default-rotation-arcane.json`, en tête de la liste de règles (priorité la plus haute) :

1. `{ spellId: 365350, conditions: [{ type: 'spellCooldownReady', spellId: 365350, cooldownMs: 90000 }] }` — Éruption d'arcanes dès que prête.
2. Trois règles pour Toucher des magi (321507), chacune gatée par son propre cooldown :
   - `conditions: [spellCooldownReady(321507, 45000), previousCastIs(44425)]`
   - `conditions: [spellCooldownReady(321507, 45000), previousCastIs(1295924)]`
   - `conditions: [spellCooldownReady(321507, 45000), auraActive(365350, true)]`
3. Les règles existantes (Projectiles/Barrage/Trait prismatique/Orbe/Déflagration) restent **après**, inchangées.

**Contexte** :

- Ne pas dupliquer la config par défaut existante — cette étape n'ajoute que des règles en tête, ne modifie pas les 6 règles déjà en place (validées avec l'utilisateur en PLAN.md « Repères pour reprendre à froid »).
- `src/data/spell-database.json` : ajouter les entrées `"365350": "Éruption d'arcanes"` et `"321507": "Toucher des magi"` (table utilisée pour l'affichage des sorts attendus par la config, cf. PLAN.md Étape 12).

---

## Étape BURST-5 — UI : afficher le nouveau type d'erreur ✅ Faite

- `src/views/RotationReport.vue` : ajouter une section (ou une ligne de stats) pour `cooldown-wasted`, sur le modèle de ce qui existe déjà pour `rotation-gap` (nombre d'occurrences, détail par erreur : sort concerné, délai). Ne pas l'inclure dans le regroupement « axes d'amélioration » basé sur les paires `actualSpellId`/`expectedSpellId` (ce regroupement est spécifique à `wrong-spell`) — prévoir un groupement séparé si pertinent (par `spellId`).
- `src/components/RotationTimeline.vue` : décider si on affiche un marqueur « CD gaspillé » sur la timeline à l'instant `readyAt`/`castAt` — optionnel, à confirmer avec l'utilisateur une fois BURST-3 en place et testable visuellement (ne pas sur-construire avant d'avoir vu le rendu sur un vrai cas).

---

## Étape BURST-6 — Tests et validation sur un vrai log ⚠️ Partiellement faite

- Tests unitaires (obligatoires avant tout test navigateur, même conventions que le reste du projet) : `compare-rotation.test.ts` (nouveaux types de condition), `detect-wasted-cooldowns.test.ts` (nouveau), `classify-rotation-errors.test.ts` ou point de fusion si son périmètre change.
- Test navigateur (Playwright headless, cf. CLAUDE.md) après tout changement UI.
- Idéalement, valider sur un vrai combat log contenant un cast d'Éruption d'arcanes et de Toucher des magi (le log de PLAN.md Étape 16 n'en contient peut-être pas — redemander à l'utilisateur un extrait couvrant un opener si besoin) pour confirmer les IDs de sorts (BURST-0.1) et la cohérence de la détection `previousCastIs`/`spellCooldownReady` sur des timestamps réels.

### État à la fin de cette session (2026-08-15)

- BURST-0 à BURST-5 implémentées et testées (unitaires + Playwright headless sur un fixture combat log synthétique, cf. CLAUDE.md). 100 tests unitaires passent, `vue-tsc --noEmit` et `eslint .` propres.
- Décision utilisateur pendant BURST-5 : le marqueur « CD gaspillé » sur `RotationTimeline.vue` **a été ajouté** (positionné à `readyAt`, classe `.rotation-timeline__item--cooldown-wasted`) — ne plus le considérer comme optionnel/en attente.
- Bug trouvé et corrigé pendant le test navigateur : `detectWastedCooldowns` (`findTrackedCooldowns`) comptait un cooldown suivi une fois par règle, alors que la config Arcane par défaut exprime le « OU » sur Toucher des magi via 3 règles distinctes au même `spellId` (BURST-4) — sans déduplication par `spellId`, le même cooldown gaspillé apparaissait en triple. Corrigé (`Map` par `spellId`), test de non-régression ajouté dans `detect-wasted-cooldowns.test.ts`.
- **Reste à faire (BURST-6, non complété)** : validation sur un **vrai** combat log contenant un cast d'Éruption d'arcanes et de Toucher des magi — le fixture utilisé pour le test navigateur de cette session est synthétique (généré à la main, pas un vrai export retail). Les IDs 365350/321507/1295924 restent donc non confirmés sur un vrai log (BURST-0.1 toujours ouvert).
- Piège vécu (déjà documenté dans CLAUDE.md, reconfirmé ici) : le serveur `vite` lancé en arrière-plan via `(cmd &)` a servi du code obsolète après plusieurs éditions, y compris après un `pkill` par pattern qui n'a pas retrouvé le bon PID à cause d'un cache `node_modules/.vite` et de wrappers de process (`sh -c vite` vs le process `node` réel). Pour repartir à froid : toujours vérifier `ps aux | grep vite`, tuer le PID exact (`kill -9 <pid>`), au besoin `rm -rf node_modules/.vite`, avant de relancer et de retester.

---

## Résumé des fichiers impactés

| Fichier | Nature du changement |
|---|---|
| `src/types/rotation-config.ts` | +2 (ou 3) types de condition |
| `src/data/load-rotation-config.ts` | validation des nouveaux types |
| `src/engine/compare-rotation.ts` | accès à l'historique des casts pour les nouvelles conditions |
| `src/engine/detect-wasted-cooldowns.ts` | nouveau module |
| `src/engine/analyze-rotation.ts` | nouveau point d'orchestration (score révisé incluant les CD gaspillés) |
| `src/engine/classify-rotation-errors.ts` | inchangée en interne, plus appelée directement par `App.vue` |
| `src/types/rotation-analysis.ts` | +1 type d'erreur `cooldown-wasted`, +champ `wastedCooldownsCount` |
| `src/data/default-rotation-arcane.json` | +4 règles (opener/burst), en tête de liste |
| `src/data/spell-database.json` | +2 entrées (Éruption d'arcanes, Toucher des magi) |
| `src/views/RotationReport.vue` | affichage du nouveau type d'erreur |
| `src/components/RotationTimeline.vue` | affichage optionnel |
| `src/App.vue` | remplace `compareRotation`+`classifyRotationErrors` par `analyzeRotation`, plumbing `segmentEndTimestamp` |
| `SPECS.md` | §5 (nouveaux types de condition), §6 (portée revue de « mauvaise gestion des cooldowns » + formule du score révisée) |
