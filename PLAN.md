# PLAN.md — Plan d'implémentation

Découpage en étapes ordonnées pour implémenter l'outil décrit dans `SPECS.md`, dans le respect des règles de `CLAUDE.md`. Chaque étape doit rester livrable et testable indépendamment avant de passer à la suivante. Ne pas paralléliser les étapes qui dépendent d'une décision non encore prise (voir §10 de SPECS.md).

---

## Étape 0 — Décisions préalables bloquantes ✅ Tranchées

Décisions actées avec l'utilisateur (remplacent SPECS.md §10) :

1. **Schéma de la config de rotation cible** : liste de règles ordonnées par priorité, évaluées de haut en bas (premier match gagne). Chaque règle = conditions (ex: `stacks >= 4`, `buffActive`, `cooldownReady`) + sort à lancer si vraies. Proche d'un APL simplifié, lisible et éditable à la main.
2. **Table de correspondance sort/aura ID ↔ nom** : fichier JSON statique maintenu à la main dans le repo (`/data`), limité aux sorts/auras Arcane pertinents pour le MVP. Pas d'extraction dynamique depuis le log — plus simple, pas de dépendance à ce que le log contienne bien tous les noms attendus par la config.
3. **Détection des segments de combat** : heuristique par inactivité — un segment démarre au premier événement de combat du joueur sélectionné et se termine après un seuil d'inactivité (ex: 5-10s sans nouvel événement le concernant). Le seuil exact sera calibré à l'étape 6/16 sur un vrai log.
4. **Niveau de simulation d'état** : basique — on s'appuie uniquement sur les événements réels du log (casts réussis, auras appliquées/retirées), sans modéliser GCD, latence ou casts interrompus. Suffisant pour détecter les erreurs de priorité/choix de sort ; pourra être enrichi plus tard si le besoin de détecter les "gaps" avec précision se confirme.

**Impact sur les étapes suivantes** : ces décisions sont maintenant reflétées dans les sections "Contexte" des étapes 2, 6, 8, 9 et 12 ci-dessous.

---

## Étape 1 — Setup du projet ✅ Faite

Initialiser un projet Vue 3 + Vite (+ TypeScript recommandé pour fiabiliser le parsing d'un format de fichier externe non typé nativement). Mettre en place : structure de dossiers, linter/formatter, config de build, script de dev.

**Contexte** :

- TypeScript est fortement recommandé ici (pas juste "nice to have") : le combat log est un format texte externe non garanti, et les types de sorts/auras/GUID sont manipulés dans tout le pipeline (parsing → filtrage → moteur de règles → UI). Le typage réduit fortement le risque d'erreurs silencieuses de comparaison.
- Prévoir dès la structure de dossiers une séparation claire entre : parsing (`/parser`), moteur d'analyse (`/engine`), données statiques (`/data` — table de sorts, config rotation par défaut), UI (`/components`, `/views`), et Web Worker (`/workers`). Cette séparation sert directement la contrainte d'extensibilité multi-spé de CLAUDE.md.
- Pas de backend : vérifier que le setup Vite ne prévoit aucun appel réseau nécessaire au fonctionnement (mode SPA statique, déployable sur un simple hébergement de fichiers statiques).

---

## Étape 2 — Modèle de données core (types) ✅ Faite

Définir les types TypeScript centraux : événement de combat log générique, GUID de joueur, sort (ID + nom), aura/buff (ID + stacks), timeline d'un joueur.

**Contexte** :

- Le combat log WoW a des dizaines de types d'événements (`SPELL_CAST_SUCCESS`, `SPELL_AURA_APPLIED`, `SPELL_AURA_APPLIED_DOSE`, `SPELL_AURA_REMOVED`, `SPELL_DAMAGE`, `UNIT_DIED`, `ENCOUNTER_START`/`END`, etc.). Le MVP n'a besoin que d'un sous-ensemble (casts, auras/stacks, dégâts, marqueurs de combat) — ne pas chercher à tout modéliser dès cette étape, seulement ce qui est listé dans SPECS.md §3-6.
- Les événements liés à la même entité utilisent un GUID stable (`Player-...`) — c'est la clé de filtrage définie en SPECS.md §4, à modéliser explicitement plutôt que de se reposer sur les noms (homonymes possibles).

---

## Étape 3 — Parser brut du fichier combat log ✅ Faite

Écrire le parser qui transforme le texte brut (CSV-like avec sous-structures) en liste d'événements typés (issus de l'étape 2). Couvrir uniquement les types d'événements nécessaires au MVP.

**Contexte** :

- Le format du combat log WoW retail encode chaque ligne comme : horodatage, type d'événement, puis une liste de champs CSV dont certains sont eux-mêmes des sous-listes entre parenthèses (ex : `SPELL_AURA_APPLIED` a des champs différents de `SPELL_DAMAGE`). Le parser doit gérer un nombre de champs variable selon le type d'événement.
- Écrire ce parser avec des tests unitaires basés sur de vraies lignes de log (échantillons à extraire d'un log réel de l'utilisateur), car le format a des subtilités (guillemets échappés dans les noms, champs optionnels, versions de format qui varient légèrement selon les patchs).
- Ne pas chercher l'exhaustivité du format à ce stade : lever une exception/ignorer proprement les types d'événements non gérés plutôt que de les interpréter à moitié.

---

## Étape 4 — Web Worker pour le parsing asynchrone ✅ Faite

Déplacer le parsing (étape 3) dans un Web Worker pour ne pas bloquer l'UI sur de gros fichiers, avec retour de progression à l'UI.

**Contexte** :

- Contrainte non-fonctionnelle de SPECS.md §8. À faire tôt dans le plan (pas en optimisation finale) car ça structure la façon dont le parser communique ses résultats (streaming/chunked vs résultat unique) — revenir dessus après coup serait plus coûteux.
- Prévoir un retour de progression (% de lignes traitées) pour l'UX sur un fichier de plusieurs Mo.

---

## Étape 5 — Détection des joueurs et sélection du personnage ✅ Faite

À partir des événements parsés, extraire la liste des GUID de joueurs distincts présents dans le log (avec leur nom associé), et construire l'UI de sélection du personnage à analyser (SPECS.md §3.4).

**Contexte** :

- Un joueur peut apparaître comme source ou cible d'événements ; la liste des candidats doit dédupliquer par GUID, pas par nom.
- Filtrer si possible les entités qui ne sont clairement pas des joueurs (mannequins, pets) en s'appuyant sur le préfixe du GUID (`Player-` vs `Creature-`/`Pet-`) pour ne proposer que des joueurs réels dans le sélecteur.

---

## Étape 6 — Détection des segments de combat ✅ Faite

Identifier automatiquement les segments de combat (début/fin) dans le log, pour permettre à l'utilisateur de choisir quel segment analyser si plusieurs existent (SPECS.md §3.5).

**Contexte** :

- Décision actée en Étape 0 : heuristique par inactivité. Un segment démarre au premier événement de combat du joueur sélectionné et se termine après un seuil d'inactivité configurable (valeur de départ à définir, ex: 5-10s).
- Garder cette logique isolée (fonction pure testable, seuil paramétrable) car le seuil optimal reste incertain — itération probable après le test sur un vrai log (Étape 16).
- **À réutiliser** : entrée = `CombatLogEvent[]` issu de `parseCombatLog` (voir « Repères pour reprendre à froid » après l'étape 9) + le `Guid` du joueur choisi via `PlayerSelector`. Pour repérer les événements « du joueur sélectionné », s'inspirer du filtre `sourceGuid`/`destGuid` déjà utilisé dans `detect-players.ts` (comparaison directe au GUID cette fois, pas par préfixe). Créer `src/parser/detect-combat-segments.ts` (même convention de nommage que `detect-players.ts`), fonction du type `detectCombatSegments(events, playerGuid, inactivityThresholdMs) => CombatSegment[]` avec `CombatSegment = { startTimestamp: number; endTimestamp: number }` (à ajouter dans `src/types`, probablement un nouveau fichier `src/types/combat-segment.ts` réexporté par `index.ts`, suivant le pattern de `player.ts`). Le log réel mentionné ci-dessus (plusieurs joueurs sur mannequins) permet de vérifier que l'inactivité d'un _autre_ joueur ne coupe pas artificiellement le segment du joueur sélectionné.

---

## Étape 7 — Filtrage du log par joueur ✅ Faite

Implémenter le filtrage décrit en SPECS.md §4 : ne garder que les événements dont la source ou la cible est le GUID du joueur sélectionné, sur le segment de combat choisi.

**Contexte** :

- Cette étape doit être testée avec un log réel contenant plusieurs joueurs sur des mannequins voisins, pour vérifier concrètement qu'aucun événement d'un autre joueur ne fuit dans l'analyse.
- **À réutiliser** : combine le `Guid` du joueur (étape 5) et le `CombatSegment` choisi (étape 6, `{ startTimestamp, endTimestamp }`) pour filtrer le `CombatLogEvent[]` complet. Créer `src/parser/filter-events-by-player.ts` (convention `filter-*.ts`), fonction `filterEventsByPlayer(events, playerGuid, segment) => CombatLogEvent[]` : garder un événement si (`sourceGuid === playerGuid || destGuid === playerGuid`) ET `timestamp` dans `[startTimestamp, endTimestamp]`. Tester avec le vrai log mentionné en « Repères pour reprendre à froid » (après l'étape 9) en vérifiant qu'aucun événement dont ni `sourceGuid` ni `destGuid` ne correspond à `Player-1127-0AC1C10B` (Hânakiel) ne passe le filtre.

---

## Étape 8 — Reconstruction de la timeline du joueur ✅ Faite

Construire, à partir des événements filtrés, une timeline chronologique de l'état du joueur : sorts castés (avec succès/échec/interruption), buffs actifs et leurs stacks à chaque instant, ressources (charges arcanes) au fil du temps.

**Contexte** :

- C'est la structure de données pivot consommée à la fois par le moteur de comparaison (étape 10) et par la visualisation (étape 13). La concevoir en pensant aux deux usages en même temps évite une refonte de format plus tard.
- Décision actée en Étape 0 : simulation basique, uniquement à partir des événements réels du log (pas de GCD/latence/cast interrompu modélisés). La timeline reflète donc directement les événements observés, sans état "attendu" intermédiaire.
- **À réutiliser** : `PlayerTimeline`/`TimelineCast`/`TimelineAuraChange` sont **déjà définis** dans `src/types/timeline.ts` (étape 2) — ne pas les redéfinir, juste écrire la fonction qui les construit à partir de la sortie de l'étape 7 (`CombatLogEvent[]` filtré). Prévoir un fichier dans `/parser` (ex: `build-player-timeline.ts`) ou `/engine` selon si on la considère « parsing » ou « pivot du moteur » — trancher au moment de l'implémentation, pas de décision figée ici. Point important découvert en étape 3 : les champs `stacks` des événements `SPELL_AURA_APPLIED_DOSE`/`SPELL_AURA_REMOVED_DOSE` sont **absolus**, pas des deltas (voir « Repères pour reprendre à froid » après l'étape 9) — ne pas les accumuler, juste reporter la dernière valeur connue par aura.

---

## Étape 9 — Format et chargement de la config de rotation cible ✅ Faite

Implémenter le chargement/validation du fichier JSON de rotation cible (SPECS.md §5), selon le schéma décidé en Étape 0. Fournir la config par défaut Arcane.

**Contexte** :

- Le moteur qui interprète cette config (étape 10) doit rester générique — ne pas coder de règles Arcane en dur dans le code de chargement/validation (règle CLAUDE.md sur l'extensibilité multi-spé). La logique spécifique à Arcane doit vivre uniquement dans le fichier de config par défaut, pas dans le code.
- Prévoir une validation avec messages d'erreur clairs (l'utilisateur éditera ce fichier à la main) : sorts référencés inconnus, structure de règle invalide, etc.
- Décision actée en Étape 0 : schéma = liste de règles ordonnées par priorité (tableau), chaque règle contenant un ensemble de conditions (stacks, buff actif, cooldown prêt, etc.) et un sort cible ; évaluation "premier match gagne". Le schéma JSON précis (noms de champs, types de conditions supportés) reste à formaliser lors de l'implémentation de cette étape, mais la structure générale est actée.
- **À réutiliser** : `src/data/` existe déjà (dossier vide, `.gitkeep`) — y placer le JSON de config par défaut Arcane et son schéma/validateur. Les sorts référencés dans la config doivent utiliser les mêmes `spellId` numériques que ceux extraits par le parser (`CombatLogEvent.spellId` — le parser lit déjà le nom du sort directement depuis le log, donc la config n'a pas besoin de dupliquer les noms pour l'affichage des événements réels ; la table ID↔nom de l'étape 12 sert surtout à documenter/afficher les sorts _attendus_ par la config quand ils n'apparaissent pas forcément dans le log analysé).

---

## Repères pour reprendre à froid (état après Étape 15)

Cette section résume ce qui existe déjà dans le repo, pour permettre de reprendre l'étape 11+ sans avoir à relire tout l'historique de conversation. À tenir à jour au fil des étapes suivantes.

**Conventions établies (à respecter dès le premier fichier écrit) :**

- Formatage : Prettier sans point-virgule, quotes simples, `printWidth: 100` (`.prettierrc.json`). Avant de considérer une étape terminée, toujours lancer dans l'ordre : `npx prettier --write src`, `npx eslint src`, `npx vue-tsc -b --noEmit`, `npx vitest run` (script `npm test`).
- Tests colocalisés en `*.test.ts` à côté du fichier testé (ex : `combat-log-parser.ts` / `combat-log-parser.test.ts`). Les tests de composants Vue nécessitent la ligne `// @vitest-environment jsdom` en tout premier commentaire du fichier de test + `@vue/test-utils` (déjà en devDependencies).
- Séparation TypeScript en 3 projets référencés depuis `tsconfig.json` : `tsconfig.app.json` (lib DOM, tout `src/**/*.{ts,tsx,vue}` sauf `src/workers/*.worker.ts`), `tsconfig.worker.json` (lib `WebWorker` sans DOM, uniquement `src/workers/*.worker.ts` — évite un conflit de typage sur `self`), `tsconfig.node.json` (config Vite). Tout nouveau fichier `*.worker.ts` doit suivre ce même pattern d'exclusion croisée.
- Noms de fichiers du dossier `/parser` suivent le pattern `detect-*.ts` / `parse-*.ts` / `filter-*.ts` / `build-*.ts` selon l'action (voir `detect-players.ts`, `build-player-timeline.ts`). Dossier `/data` suit le pattern `load-*.ts` pour le chargement/validation (voir `load-rotation-config.ts`, `load-default-rotation-config.ts`). Pas encore de convention établie pour `/engine` (étape 10 = premier module de ce dossier) — `src/engine/` existe déjà (dossier vide, `.gitkeep`).
- `RotationConfigValidationError extends Error` (dans `load-rotation-config.ts`) déclare son champ `issues` explicitement dans le constructeur plutôt qu'en propriété de paramètre (`constructor(public readonly issues...)`) : `erasableSyntaxOnly` (tsconfig) interdit la syntaxe de propriété de paramètre. À garder en tête pour toute nouvelle classe d'erreur.
- Un fichier JSON de données statiques (ex : `default-rotation-arcane.json`) s'importe directement (`resolveJsonModule` actif) — pas besoin de `fetch`/chargement asynchrone pour les données embarquées au bundle.
- **Piège Vue découvert à l'étape 13** : dans un composant `v-model` dont la valeur est un objet (pas un primitif), ne jamais comparer `props.modelValue` aux éléments de `props.segments` (ou toute autre prop tableau) par référence (`===`/`indexOf`). Après un aller-retour par le `v-model` du parent, la valeur peut être ré-enveloppée dans un proxy Vue différent (reactive vs readonly) même si elle représente le même objet brut — la comparaison par référence échoue alors silencieusement (aucune erreur, juste un état visuellement incohérent). Comparer par valeur (ex : champs identifiants) à la place — voir `selectedIndex` dans `SegmentSelector.vue`. À garder en tête pour tout futur composant `v-model` sur un objet (ex : sélecteur d'erreur à l'étape 14/15).

**Ce qui existe déjà et doit être réutilisé (ne pas redéfinir) :**

- `src/types/index.ts` réexporte tout : `CombatLogEvent` (union des 6 types gérés : `SPELL_CAST_SUCCESS`, `SPELL_AURA_APPLIED`, `SPELL_AURA_APPLIED_DOSE`, `SPELL_AURA_REMOVED`, `SPELL_AURA_REMOVED_DOSE`, `SPELL_DAMAGE`), `CombatLogEventBase` (`timestamp`, `sourceGuid`, `sourceName`, `destGuid`, `destName`), `Spell`, `Aura`/`AuraType`, `Guid`, `Player`, `CombatSegment`, `PlayerTimeline`/`TimelineCast`/`TimelineAuraChange`, `RotationConfig`/`RotationRule`/`RotationCondition` (`AuraStacksCondition`/`AuraActiveCondition`).
- `src/parser/combat-log-parser.ts` : `parseCombatLog(logText, onProgress?) => CombatLogEvent[]` — timestamps **relatifs au début du fichier** (ms), ignore silencieusement les lignes non gérées ou malformées (jamais d'exception). `parseCombatLogLine(line, baseTimestampMs) => CombatLogEvent | null` pour du test ligne à ligne. Type `CombatLogParseProgress`.
- `src/parser/detect-players.ts` : `detectPlayers(events) => Player[]` — dédup par GUID, filtre les GUID par préfixe `'Player-'` (constante `PLAYER_GUID_PREFIX`, helper `isPlayerGuid`), trié par nom.
- `src/parser/detect-combat-segments.ts` : `detectCombatSegments(events, playerGuid, inactivityThresholdMs) => CombatSegment[]` — segmente par heuristique d'inactivité. **Révisé à l'étape 16** sur un vrai log : un log de combat n'a pas d'événement d'entrée/sortie de combat exploitable, et l'ancienne heuristique (démarrer sur n'importe quel événement `sourceGuid`/`destGuid` = `playerGuid`) démarrait parfois le segment sur une aura reçue juste avant l'opener réel, décalant artificiellement toute la timeline (ex : 4s de "temps mort" fictif en début de combat). Le segment démarre désormais au premier `SPELL_CAST_SUCCESS` dont le joueur est la **source** (un vrai sort casté par lui, pas un événement qui le concerne au sens large), et l'inactivité se mesure entre ses casts, pas entre tout événement le concernant. Seuil par défaut passé de 8s à 5s (`INACTIVITY_THRESHOLD_MS` dans `App.vue`). Aucune valeur de seuil par défaut choisie dans la fonction elle-même (paramètre obligatoire).
- `src/parser/filter-events-by-player.ts` : `filterEventsByPlayer(events, playerGuid, segment) => CombatLogEvent[]` — garde un événement si `sourceGuid === playerGuid || destGuid === playerGuid` (bornes du segment incluses).
- `src/parser/build-player-timeline.ts` : `buildPlayerTimeline(events, player) => PlayerTimeline` — construit `PlayerTimeline` (casts + changements d'aura) à partir de la sortie de `filterEventsByPlayer`. **C'est l'entrée principale du moteur de l'étape 10.** Stacks reportés tels quels pour les `_DOSE` (valeurs absolues, pas de deltas), convention `1` pour `APPLIED` et `0` pour `REMOVED` (pas de champ `stacks` sur ces deux-là dans le log brut). `TimelineAuraChange[]` n'est pas dédupliqué/agrégé par aura — c'est une liste chronologique de changements ; le moteur de l'étape 10 devra reconstituer "l'état d'aura courant à l'instant T" en parcourant cette liste (dernier changement connu par `spellId` avant/à T), pas en supposant un état déjà agrégé.
- `src/types/rotation-config.ts` + `src/data/load-rotation-config.ts` (`parseRotationConfig(raw) => RotationConfig`, lève `RotationConfigValidationError` avec `issues: string[]` si invalide) + `src/data/default-rotation-arcane.json` + `src/data/load-default-rotation-config.ts` (`loadDefaultRotationConfig() => RotationConfig`) : chaîne complète de chargement de la config de rotation, prête à être consommée par le moteur de l'étape 10. Rappel : conditions limitées à `auraStacks`/`auraActive` (voir SPECS.md §5) — pas de cooldown/durée de buff au MVP. **Config par défaut mise à jour** à partir du guide Wowhead Arcane (rotation-cooldowns-pve-dps, contenu "Midnight Season 2" au moment de l'extraction) : priorité "Easy Mode" adaptée single-target dummy (déjà cohérent avec le contexte SPECS.md §2 — pas de conditions de nombre de cibles/mana/cooldown, hors périmètre du schéma actuel) — Projectiles des Arcanes (5143, si Idées claires actif et Salve arcanique < 12) → Barrage des Arcanes (44425, si Âme des arcanes actif) → Trait prismatique (1295924, si son propre proc actif) → Barrage des Arcanes (44425, si Idées claires actif et Salve arcanique ≥ 12) → Orbe arcanique (153626, si 0 Charge arcanique) → Déflagration des Arcanes (30451, sort par défaut). Décision actée avec l'utilisateur : rester sur ce sous-ensemble simplifié plutôt que d'étendre le schéma de conditions (pas de sur-ingénierie avant qu'un besoin concret ne le justifie). **Point d'incertitude à vérifier à l'étape 16/17** : pas d'aura distincte trouvée sur Wowhead pour signaler la disponibilité du proc Trait prismatique — la règle utilise l'ID du sort lui-même (1295924) comme aura à vérifier (`auraActive`), hypothèse non confirmée sur un vrai combat log ; si le proc n'apparaît pas comme aura appliquée dans un vrai log, cette règle ne matchera jamais et il faudra investiguer/ajuster. Reste un premier jet à valider avec l'utilisateur sur un vrai run — en particulier la pertinence du choix Sunfury (arbre de héros recommandé par le guide) implicite dans ces règles.
- `src/workers/combat-log-parser.worker.ts` + `src/workers/parse-combat-log-file.ts` : `parseCombatLogFile(file: File, onProgress?) => Promise<CombatLogEvent[]>` — point d'entrée à utiliser depuis l'UI (étape 13), pas `parseCombatLog` directement.
- `src/components/PlayerSelector.vue` : composant `v-model` (props `players: Player[]`, `modelValue: Guid | null`) déjà fonctionnel et testé, mais **pas encore monté dans `App.vue`** (toujours le placeholder de l'étape 1). Intégration = étape 13.
- `src/types/rotation-comparison.ts` : `RotationComparisonResult` (`timestamp`, `actualSpellId`, `expectedSpellId: number | null`, `isCorrect`, `activeAuras: Aura[]`) — un par cast réel de la timeline. `expectedSpellId` vaut `null` si aucune règle de la config ne matchait (config incomplète, pas un cas d'erreur imputable au joueur) ; `isCorrect` est alors `false` mais l'étape 11 devra distinguer ce cas (config incomplète) d'un vrai mauvais sort casté.
- `src/engine/compare-rotation.ts` (premier module de `src/engine/`, `.gitkeep` retiré) : `compareRotation(timeline, config) => RotationComparisonResult[]` — **c'est la sortie que consommera l'étape 11** pour la classification des erreurs et le score. Expose aussi `resolveExpectedSpell(config, activeAuras: Map<number, Aura>) => number | null` (première règle qui matche, ET logique sur les conditions) réutilisable indépendamment. L'état d'auras à l'instant d'un cast est reconstruit en ne considérant que les changements d'aura **strictement avant** ce cast (`<`, pas `<=`) : un changement au même timestamp qu'un cast est traité comme une conséquence du cast (ex : gain de charge arcanique déclenché par le cast lui-même), pas comme un état qui a motivé le choix du joueur — voir le test dédié dans `compare-rotation.test.ts` si ce choix doit être révisé après le test sur un vrai log (étape 16).
- `src/engine/classify-rotation-errors.ts` : `classifyRotationErrors(results: RotationComparisonResult[], gapThresholdMs = DEFAULT_ROTATION_GAP_THRESHOLD_MS) => RotationAnalysisResult` — **c'est la sortie que consommera l'UI de rapport (étape 15)**. Types `RotationError` (`WrongSpellError | RotationGapError`) et `RotationAnalysisResult` dans `src/types/rotation-analysis.ts`. Périmètre MVP tranché avec l'utilisateur (voir SPECS.md §6) : seuls `wrong-spell` (dérivé 1:1 de `RotationComparisonResult`, exclut les casts à `expectedSpellId: null`) et `rotation-gap` (délai entre deux casts successifs > `DEFAULT_ROTATION_GAP_THRESHOLD_MS`, constante fixe = 3000ms, non calibrée sur un vrai log) sont implémentés — "sort manqué" et "mauvaise gestion de cooldown" restent hors périmètre faute de données de durée d'aura/cooldown. Score = `correctCasts / (totalCasts - incompleteConfigCasts)` arrondi en %, 100% par défaut s'il n'y a aucun cast évaluable. Erreurs triées par timestamp dans la liste retournée (gap et wrong-spell peuvent s'entrelacer).
- `src/data/spell-database.json` + `src/data/get-spell-name.ts` (`getSpellName(spellId) => string`) : table statique ID→nom des sorts/auras référencés par la config Arcane par défaut, maintenue à la main (pas d'icône au MVP — non nécessaire avant l'UI de l'étape 14, ajoutable plus tard sans changer la signature). Repli `"Sort inconnu (#id)"` si l'ID n'est pas dans la table. Ne pas confondre avec `CombatLogEvent.spellName` (déjà extrait du log réel par le parser, étape 3) — cette table sert à nommer les sorts _attendus par la config_ qui ne sont pas forcément castés dans le log analysé.
- `src/components/SegmentSelector.vue` : composant `v-model` (props `segments: CombatSegment[]`, `modelValue: CombatSegment | null`), même convention que `PlayerSelector.vue` (auto-sélection si un seul segment, sélecteur sinon). Testé (`SegmentSelector.test.ts`).
- `src/App.vue` : orchestre le flux complet (upload → `parseCombatLogFile` → `detectPlayers` → `<PlayerSelector>` → `detectCombatSegments` → `<SegmentSelector>` → `filterEventsByPlayer` → `buildPlayerTimeline` → `compareRotation` (avec `loadDefaultRotationConfig()`, calculé une seule fois hors des computed) → `classifyRotationErrors` → `<RotationReport>` (étape 15) + `<RotationTimeline>`). Seuil d'inactivité codé en constante locale `INACTIVITY_THRESHOLD_MS = 5_000` (révisé à l'étape 16, voir `detectCombatSegments` ci-dessus). Flux vérifié dans un vrai navigateur (Playwright + Chromium headless) avec un mini combat log synthétique, puis avec un vrai log à l'étape 16.
- **Bug corrigé à l'étape 16** (racine du "temps mort fictif en début de combat" signalé par l'utilisateur, en plus de la révision de `detectCombatSegments` ci-dessus) : `detectWastedCooldowns` (`src/engine/detect-wasted-cooldowns.ts`) traitait un cooldown suivi comme "prêt" à l'instant `0` en dur. Or les timestamps de `PlayerTimeline` restent relatifs au **début du fichier** de log (ni `filterEventsByPlayer` ni `buildPlayerTimeline` ne les rebasent sur le début du segment) — dès que le segment analysé démarre après le tout début du fichier, ce `0` en dur créait un faux cooldown gaspillé (l'écart entre le vrai début de fichier et le premier cast du segment), qui se répercutait aussi sur `RotationTimeline.vue` (son `startTimestamp` calculé par `Math.min` sur tous les items, y compris ce faux `readyAt: 0`). Fix : `detectWastedCooldowns` et `analyzeRotation` prennent maintenant un paramètre `segmentStartTimestamp` explicite (nouvelle signature : `analyzeRotation(timeline, config, segmentStartTimestamp, segmentEndTimestamp, gapThresholdMs?, wastedThresholdMs?)`), passé depuis `App.vue` (`selectedSegment.value.startTimestamp`). À garder en tête pour tout futur module `/engine` : ne jamais supposer que les timestamps d'une `PlayerTimeline` commencent à 0, toujours passer le début de segment explicitement.
- **Révision post-Étape 16 (canalisations, signalée par l'utilisateur)** : `classifyRotationErrors` comptait toute la durée d'une canalisation (ex : Projectiles des Arcanes, `SPELL_CAST_SUCCESS` une seule fois au début, plusieurs `SPELL_DAMAGE` ensuite) comme un `rotation-gap`, faute de suivi des vagues de dégâts (`buildPlayerTimeline` ignorait `SPELL_DAMAGE`). Fix, en plusieurs parties :
  - `PlayerTimeline.damageTicks: TimelineDamageTick[]` (`src/types/timeline.ts`) : `buildPlayerTimeline` capture désormais les `SPELL_DAMAGE` dont le joueur est la source (`{ timestamp, spellId }`).
  - `RotationConfig.channeledSpells?: ChanneledSpellConfig[]` (`src/types/rotation-config.ts`) : déclare les sorts canalisés à surveiller — `{ castSpellId, tickSpellId, expectedTicks }`. **Point important découvert sur un vrai log** : `tickSpellId` (ID vu sur chaque `SPELL_DAMAGE` de vague) est différent de `castSpellId` (ID vu sur le `SPELL_CAST_SUCCESS`) — pour Projectiles des Arcanes, 5143 au cast mais 7268 par vague. Config Arcane par défaut : `{ castSpellId: 5143, tickSpellId: 7268, expectedTicks: 7 }` (7 = valeur du tooltip en jeu, mais c'est un **plancher** pas une valeur exacte — voir ci-dessous).
  - `src/engine/channeled-spells.ts` (`correlateChannelTicks(timeline, config)`, nouveau module) : corrèle les vagues d'un cast canalisé. Fenêtre `[timestamp du cast, timestamp du prochain cast **du même castSpellId**[` — **pas** bornée par le cast suivant quel qu'il soit : vérifié sur le vrai log, les dernières vagues d'une canalisation complète peuvent arriver après le `SPELL_CAST_SUCCESS` du sort suivant (délai de vol du projectile), les exclure sous-compte une canalisation pourtant menée à son terme.
  - `src/engine/detect-interrupted-channels.ts` (`detectInterruptedChannels(timeline, config)`, nouveau module, sur le modèle de `detectWastedCooldowns`) : erreur `channel-interrupted` si le nombre de vagues corrélées < `expectedTicks`.
  - `classifyRotationErrors` accepte un 3ᵉ paramètre optionnel `channelEndTimestamps?: (number | null)[]` (même ordre que `results`, calculé par `analyzeRotation` via `correlateChannelTicks`) : pour un cast canalisé, le calcul du gap utilise le timestamp de la dernière vague corrélée comme fin d'occupation au lieu du timestamp de début de cast.
  - `analyzeRotation` orchestre le tout, `interruptedChannelsCount` s'ajoute au dénominateur du score au même titre que `wastedCooldownsCount` (décision actée avec l'utilisateur).
  - **Point de calibration non résolu, à garder en tête** : en testant sur le vrai log (`WoWCombatLog-081526_152550.txt`), le nombre de vagues d'une canalisation de Projectiles des Arcanes **menée à son terme** varie de 7 à 11 selon les buffs actifs au cast (probablement liés à Idées claires/Clearcasting ou un talent similaire, non investigué plus avant) — jamais observé en-dessous de 7. `expectedTicks: 7` est donc un plancher sûr (aucun faux positif observé) mais généreux : une interruption partielle (ex : coupée après 8 vagues alors qu'elle en aurait fait 10) ne sera pas détectée. Modéliser un nombre de vagues attendu variable selon les buffs actifs serait une extension du schéma de conditions, hors périmètre tant que le besoin n'est pas confirmé par l'utilisateur (règle CLAUDE.md anti-sur-ingénierie).
  - Vérifié sur le vrai log en navigateur (Playwright + Chromium headless) : le nombre de `rotation-gap` détectés sur le segment de test passe de 11 (avant fix) à 0 (après fix) — confirmant que c'était bien la canalisation de Projectiles des Arcanes qui générait les faux temps morts signalés par l'utilisateur.
- `src/components/RotationTimeline.vue` : composant d'affichage (pas de `v-model`, contrairement à `PlayerSelector`/`SegmentSelector`), props `timeline: PlayerTimeline`, `comparisonResults: RotationComparisonResult[]` (**doit venir de `compareRotation(timeline, config)`**, même ordre/longueur que `timeline.casts` — le composant fait un mapping par index, pas par recherche de timestamp), `errors: RotationError[]` (celles de type `rotation-gap` uniquement sont utilisées ; `wrong-spell` est recalculé localement à partir de `comparisonResults`, pas dupliqué depuis `errors`, pour rester au plus près de la source). Fusionne casts + changements d'aura + gaps en une seule liste triée par timestamp, rendue en `<ol>` (pas de librairie de viz — volume de données trop faible pour le justifier, conforme à CLAUDE.md sur la sur-ingénierie). Testé (`RotationTimeline.test.ts`).
- `src/views/RotationReport.vue` (étape 15, `src/views/` n'est plus vide) : écran de rapport final, prop unique `analysisResult: RotationAnalysisResult` (sortie directe de `classifyRotationErrors`, aucune nouvelle passe d'analyse). Affiche le score global, les « axes d'amélioration prioritaires » (erreurs `wrong-spell` regroupées par paire `actualSpellId`/`expectedSpellId`, comptées et triées par fréquence décroissante, top 5), des statistiques (`totalCasts`/`correctCasts`/`incompleteConfigCasts`, nombre et durée totale des `rotation-gap`), puis le détail des erreurs par type. Pas de DPS/uptime de buffs (SPECS.md §7, « si pertinentes ») : non implémenté au MVP faute de pipeline d'agrégation des dégâts déjà en place (`SPELL_DAMAGE` est parsé mais jamais agrégé dans `PlayerTimeline`) — ajouter ce pipeline serait de la sur-ingénierie tant que le besoin n'est pas confirmé par l'utilisateur. Testé (`RotationReport.test.ts`), monté dans `App.vue` au-dessus de `<RotationTimeline>`.

- **Bug corrigé post-Étape 16 (ID d'aura obsolètes dans la config Arcane par défaut, signalé par l'utilisateur comme "trop de 'Barrage au lieu de Projectiles' dans le rapport")** : l'hypothèse initiale de l'utilisateur (gestion manquante d'Idées claires) était fausse — vérifié en rejouant le pipeline complet sur `WoWCombatLog-081526_152550.txt` et en comparant l'état de l'aura 263725 calculé par `compareRotation` aux événements bruts du log pour les 21 cas signalés : Idées claires était bien active dans les 21 cas, la détection d'aura elle-même fonctionne. Le vrai problème : plusieurs `spellId` de `default-rotation-arcane.json` correspondaient à des ID obsolètes/incorrects par rapport au vrai log de la saison courante :
  - **Salve arcanique** : la config utilisait `384452` dans les conditions `auraStacks` des règles Projectiles (5143) et Barrage-si-stacks-hauts (44425), mais l'ID réel observé dans le log est `1242974`. `384452` n'apparaissant jamais dans un vrai log, la condition `stacks < 12` était vacuously toujours vraie (défaut à 0), ce qui faisait matcher la règle Projectiles dès qu'Idées claires était actif, sans jamais vérifier le vrai nombre de stacks (observé jusqu'à 25 dans le log réel) — et empêchait symétriquement la règle Barrage-si-stacks≥12 de jamais matcher elle non plus. **C'était la cause directe des faux positifs signalés.** Fix : `384452` → `1242974` dans les deux règles concernées, + `spell-database.json`/`get-spell-name.test.ts` mis à jour en conséquence.
  - **Trait prismatique** : la règle de proc (`spellId: 1295924`) vérifiait `auraActive` sur `1295924`, qui est en réalité l'ID du **cast** (confirmé : `1295924` apparaît comme `SPELL_CAST_SUCCESS` ET comme `SPELL_ENERGIZE` dans le vrai log, jamais comme aura), pas du buff. Le vrai buff observé est `1295942` (nommé "Trait prismatique !" dans le log, avec le point d'exclamation). Fix : la condition `auraActive` de cette règle utilise maintenant `1295942` ; `1295924` reste correct et inchangé comme `spellId` de la règle elle-même et dans les conditions `previousCastIs` (ce sont bien des références au cast, pas au buff). Confirme/résout le point d'incertitude noté à l'étape 15/16 sur l'absence d'aura distincte trouvée sur Wowhead pour ce proc.
  - **Point résolu à l'Étape 18** : voir ci-dessous — Charge arcanique n'est pas une aura mais une ressource de personnage (comme le mana), suivie via un mécanisme différent du log.

- **Étape 18 — Suivi de ressource numérique du personnage (Charges Arcaniques) ✅ Faite**, en réponse au point ouvert ci-dessus : signalé par l'utilisateur ("Charge arcanique, c'est une ressource comme le mana ou les HP, pas une aura"), confirmé en recherchant le format du combat log (`COMBAT_LOG_VERSION 22`, advanced logging) puis en vérifiant empiriquement sur le vrai log : les ressources de personnage (mana, Charges Arcaniques, etc.) apparaissent via un type d'événement `SPELL_ENERGIZE` non géré jusque-là par le parser, avec un champ `powerType` (ID numérique Blizzard, 16 = Charges Arcaniques, confirmé par le plafond `maxPower=4` observé et par "Toucher des magi" accordant `amount=4` instantanément — mécanique connue de ce sort). **Point important** : Blizzard ne logue que les **gains** de ressource (`SPELL_ENERGIZE`), jamais les pertes/consommations (aucun événement de ce type trouvé dans un vrai log) — la valeur courante doit donc être partiellement **déduite** d'une règle de jeu (Barrage des Arcanes consomme toutes les charges), pas uniquement lue depuis le log. Exception assumée à la décision Étape 0 ("pas de simulation au-delà des événements observés"), validée avec l'utilisateur.
  - `src/types/combat-log-event.ts` : nouveau type d'événement `SpellEnergizeEvent` (`powerType`, `amount`, `maxPower`).
  - `src/parser/combat-log-parser.ts` : `SPELL_ENERGIZE` géré, offsets des champs de suffixe (`amount`/`powerType`/`maxPower` à `rest[19]`/`rest[21]`/`rest[22]`) déterminés empiriquement sur le vrai log (même position que `SPELL_DAMAGE_AMOUNT_INDEX` pour `amount`, cohérent : même longueur de bloc advanced logging avant le suffixe).
  - `src/types/timeline.ts` : `TimelineResourceGain` + `PlayerTimeline.resourceGains` (uniquement les gains observés, pas de simulation à ce niveau — cohérent avec `buildPlayerTimeline`).
  - `src/types/rotation-config.ts` : nouvelle condition `ResourceValueCondition` (`resourceValue`) et `RotationConfig.resourceConsumers?: ResourceConsumerConfig[]` (`{ powerType, spellIds }`, déclare quels casts remettent la ressource à zéro — connaissance de jeu non présente dans le log, donc en config plutôt qu'en dur dans le moteur).
  - `src/engine/resource-tracker.ts` (nouveau module) : `resolveResourceValueBefore(resourceGains, casts, resourceConsumers, powerType, timestamp)` — accumule les gains (plafonnés à `maxPower`) et remet à 0 sur cast d'un consommateur déclaré, strictement avant `timestamp` (même convention que `resolveActiveAurasBefore`).
  - `src/engine/compare-rotation.ts` : `evaluateCondition`/`matchesRule`/`resolveExpectedSpell` acceptent `resourceGains/resourceConsumers` (paramètres optionnels, défaut `[]`) ; `compareRotation` les alimente depuis `timeline.resourceGains`/`config.resourceConsumers`.
  - `default-rotation-arcane.json` : règle Orbe arcanique corrigée (`auraStacks 36032 == 0` cassé → `resourceValue powerType 16 == 0`), `resourceConsumers: [{ powerType: 16, spellIds: [44425] }]` ajouté (Barrage des Arcanes consomme les Charges Arcaniques).
  - Revalidé sur le vrai log (`WoWCombatLog-081526_152550.txt`) : faux "Orbe arcanique attendu" passés de (majorité des erreurs) à **0**, total `wrong-spell` de 43 → 34, score de 53% → 63%.

**Fichier de combat log réel disponible pour les tests :**

- L'utilisateur a fourni un vrai combat log local pour l'étape 3 : `D:\Jeux\World of Warcraft\_retail_\Logs\WoWCombatLog-081526_112707.txt` (accessible depuis WSL via `/mnt/d/Jeux/...`). **Ce fichier n'est pas dans le repo** (ne pas le committer) — si une session future en a besoin (étape 16) et ne le trouve plus à ce chemin, redemander explicitement un extrait à l'utilisateur plutôt que de fabriquer des lignes de log à la main (le format retail a des subtilités, voir ci-dessous).
- Ce log contient plusieurs joueurs frappant des mannequins d'entraînement en parallèle. Personnage de l'utilisateur : `Hânakiel-KirinTor-EU`, GUID `Player-1127-0AC1C10B`.

**Subtilités du format de log retail découvertes en étape 3 (à connaître avant de retoucher au parser, ou avant d'interpréter `CombatLogEvent.timestamp`) :**

- Format de ligne : `M/D/YYYY H:MM:SS.ffff  EVENT,champ1,champ2,...` — **deux espaces** entre l'horodatage et le type d'événement.
- La fraction de seconde a un nombre de chiffres variable (3 ou 4 chiffres observés selon les lignes) ; elle s'interprète comme une fraction décimale de seconde (`0.ffff`), jamais comme des millisecondes brutes tronquées/paddées.
- L'« advanced logging » (toujours actif en retail) insère un bloc de champs supplémentaires après `spellSchool` pour certains types d'événements (`SPELL_CAST_SUCCESS`, `SPELL_DAMAGE`) mais pas pour les événements d'aura (`SPELL_AURA_APPLIED`/`REMOVED`/leurs variantes `_DOSE`). Pour `SPELL_DAMAGE`, le champ `amount` se trouve exactement au 19ᵉ champ après `spellSchool` (constante `SPELL_DAMAGE_AMOUNT_INDEX` dans `combat-log-parser.ts`, vérifiée empiriquement sur le vrai log — pas dans la doc générique Blizzard).
- Les champs `stacks` de `SPELL_AURA_APPLIED_DOSE`/`SPELL_AURA_REMOVED_DOSE` sont des valeurs **absolues** (nombre de charges après l'événement), pas des deltas — confirmé sur les fixtures réelles utilisées dans `combat-log-parser.test.ts`.

---

## Étape 10 — Moteur de comparaison (règles vs timeline réelle) ✅ Faite

Implémenter le moteur qui, pour chaque instant clé de la timeline réelle (étape 8), évalue la config de rotation (étape 9) pour déterminer le sort attendu, et le compare au sort réellement casté.

**Contexte** :

- Cœur fonctionnel de l'outil (SPECS.md §6). À couvrir en priorité par des tests unitaires sur des scénarios construits à la main (timelines synthétiques), avant de tester sur un vrai log — plus facile à déboguer avec des cas contrôlés.
- Le moteur doit être découplé du parsing/de l'UI : il prend une timeline + une config, retourne une liste d'erreurs typées. Ce découplage facilite les tests et l'ajout futur d'autres spés.
- **À réutiliser** : `src/engine/` existe déjà (dossier vide, `.gitkeep`) — y placer ce moteur. Entrées : `PlayerTimeline` (étape 8, type déjà défini dans `src/types/timeline.ts`) + la config chargée à l'étape 9. Rester générique comme le reste du projet : ce module ne doit contenir aucune règle Arcane en dur (règle CLAUDE.md), toute la logique spécifique vit dans le JSON de config.

---

## Étape 11 — Classification des erreurs et calcul du score ✅ Faite

Implémenter les types d'erreurs listés en SPECS.md §6 (mauvais sort, sort manqué, gaspillage de ressource, gap dans la rotation, mauvaise gestion de cooldown) et le calcul du score global de conformité.

**Contexte** :

- Cette étape peut réutiliser directement la sortie de l'étape 10 — c'est une couche d'agrégation/présentation des erreurs brutes, pas une nouvelle passe d'analyse.
- **À réutiliser** : reste dans `src/engine/` (créé à l'étape 10), en aval direct de son résultat. Pas de nouveau type de données source à connaître — voir le point précédent sur `src/engine/`.
- **Décision actée avec l'utilisateur** (périmètre non couvert par SPECS.md tel quel) : seuls `wrong-spell` et `rotation-gap` sont implémentés au MVP — voir SPECS.md §6 mis à jour et « Repères pour reprendre à froid » ci-dessous pour le détail.

---

## Étape 12 — Table de correspondance sort/aura ID ↔ nom ✅ Faite

Constituer la table statique de correspondance entre ID de sort WoW et nom (+ icône si souhaité), utilisée pour l'affichage humainement lisible dans le rapport.

**Contexte** :

- Peut être développée en parallèle des étapes 8-11 puisqu'elle n'a pas de dépendance forte (uniquement consommée par l'UI et les messages d'erreur). Démarrer avec uniquement les sorts/auras nécessaires à la config Arcane par défaut, extensible ensuite.
- Décision actée en Étape 0 : fichier JSON statique maintenu à la main dans le repo, pas d'extraction dynamique depuis le log.
- **À réutiliser** : `src/data/` existe déjà (voir étape 9). Rappel important : le parser (étape 3) extrait déjà `spellName` directement depuis chaque événement du log réel — cette table sert donc principalement à nommer/illustrer les sorts _référencés par la config_ (étape 9) qui ne seraient pas forcément castés dans le log en cours d'analyse, pas à ré-étiqueter les événements déjà présents dans `CombatLogEvent`.

---

## Étape 13 — UI : upload et sélection (joueur / segment) ✅ Faite

Construire les écrans/composants Vue pour l'upload du fichier, l'affichage de la progression du parsing (étape 4), la sélection du personnage (étape 5) et du segment de combat (étape 6).

**Contexte** :

- Premier point de contact utilisateur avec l'outil — prioriser un flux simple et des messages d'erreur clairs si le fichier n'est pas un combat log valide ou si aucun joueur/segment n'est détecté.
- **À réutiliser** : c'est ici que tout se branche pour la première fois dans `App.vue` (actuellement un simple placeholder de l'étape 1, à remplacer). Enchaînement attendu : upload de fichier → `parseCombatLogFile(file, onProgress)` (`src/workers/parse-combat-log-file.ts`, gère déjà le Web Worker et la progression) → `detectPlayers(events)` (`src/parser/detect-players.ts`) → `<PlayerSelector>` (`src/components/PlayerSelector.vue`, déjà fait et testé, juste à monter avec `v-model`) → `detectCombatSegments(events, playerGuid, threshold)` (étape 6, à créer) → sélecteur de segment (nouveau composant à créer, sur le modèle de `PlayerSelector.vue` : mêmes conventions props/`v-model`/tests). Conformément à CLAUDE.md, tester ce flux dans un vrai navigateur (`npm run dev`) une fois assemblé — c'est la première étape du plan qui le permet réellement.

---

## Étape 14 — UI : visualisation de la timeline ✅ Faite

Construire la visualisation de la timeline du combat (sorts castés, buffs/stacks actifs) avec surlignage des erreurs détectées (SPECS.md §7).

**Contexte** :

- Cette étape est la plus exigeante visuellement. Évaluer à ce stade si une librairie de visualisation légère est nécessaire ou si une timeline custom en HTML/CSS suffit pour le volume de données attendu (durée d'un run sur mannequin, généralement quelques minutes).
- **À réutiliser** : source de données = `PlayerTimeline` (étape 8) + liste d'erreurs typées (étape 10/11), tous deux déjà produits par le pipeline `/engine`. Placer les nouveaux composants dans `src/components/` (ou `src/views/`, actuellement vide, si c'est un écran entier plutôt qu'un composant réutilisable — trancher selon la granularité au moment de l'implémentation).

---

## Étape 15 — UI : rapport d'analyse ✅ Faite

Construire l'écran de rapport final : score global, liste des erreurs groupées par type, axes d'amélioration priorisés, statistiques complémentaires (SPECS.md §7).

**Contexte** :

- S'appuie directement sur la sortie de l'étape 11. Prioriser la clarté du message ("ce que je ne fais pas bien") plutôt que l'exhaustivité des stats — c'est l'objectif premier énoncé par l'utilisateur dans sa demande initiale.
- **À réutiliser** : même source de données que l'étape 14 (score + erreurs classées de l'étape 11). Probablement un composant/écran dans `src/views/` (actuellement vide) plutôt que `src/components/`, puisque c'est un écran final et non un élément réutilisable ailleurs — à confirmer selon la structure de navigation choisie à l'étape 13.

---

## Étape 16 — Test de bout en bout avec un vrai combat log

Faire tester par l'utilisateur un vrai combat log de mannequin (idéalement avec d'autres joueurs présents, pour valider le filtrage) sur l'ensemble du pipeline, et ajuster les étapes précédentes en fonction des écarts constatés (format de log réel vs hypothèses, faux positifs/négatifs du moteur de comparaison).

**Contexte** :

- Cette étape validera concrètement les points laissés incertains en Étape 0 (détection de segments, format exact du log) — prévoir explicitement du temps d'itération après ce test plutôt que de considérer le plan figé jusque-là.
- **À réutiliser** : le log fourni pour l'étape 3 (`D:\Jeux\World of Warcraft\_retail_\Logs\WoWCombatLog-081526_112707.txt`, voir « Repères pour reprendre à froid ») peut servir de premier passage de bout en bout, mais demander à l'utilisateur un log plus long/représentatif d'une vraie session d'entraînement si celui-ci est trop court pour bien exercer la détection de segments (étape 6) et le scoring (étape 11).

---

## Étape 17 — Polish et robustesse

Gestion des cas d'erreur (fichier invalide, log vide, joueur non trouvé), amélioration UX, revue de la config Arcane par défaut avec l'utilisateur pour s'assurer qu'elle reflète une rotation réellement optimale.

**Contexte** :

- À ne pas anticiper avant que le pipeline fonctionne de bout en bout (étape 16) — éviter de peaufiner une UI ou une gestion d'erreurs sur un moteur dont la logique n'est pas encore validée sur données réelles.
