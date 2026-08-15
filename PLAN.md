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

## Étape 2 — Modèle de données core (types)

Définir les types TypeScript centraux : événement de combat log générique, GUID de joueur, sort (ID + nom), aura/buff (ID + stacks), timeline d'un joueur.

**Contexte** :
- Le combat log WoW a des dizaines de types d'événements (`SPELL_CAST_SUCCESS`, `SPELL_AURA_APPLIED`, `SPELL_AURA_APPLIED_DOSE`, `SPELL_AURA_REMOVED`, `SPELL_DAMAGE`, `UNIT_DIED`, `ENCOUNTER_START`/`END`, etc.). Le MVP n'a besoin que d'un sous-ensemble (casts, auras/stacks, dégâts, marqueurs de combat) — ne pas chercher à tout modéliser dès cette étape, seulement ce qui est listé dans SPECS.md §3-6.
- Les événements liés à la même entité utilisent un GUID stable (`Player-...`) — c'est la clé de filtrage définie en SPECS.md §4, à modéliser explicitement plutôt que de se reposer sur les noms (homonymes possibles).

---

## Étape 3 — Parser brut du fichier combat log

Écrire le parser qui transforme le texte brut (CSV-like avec sous-structures) en liste d'événements typés (issus de l'étape 2). Couvrir uniquement les types d'événements nécessaires au MVP.

**Contexte** :
- Le format du combat log WoW retail encode chaque ligne comme : horodatage, type d'événement, puis une liste de champs CSV dont certains sont eux-mêmes des sous-listes entre parenthèses (ex : `SPELL_AURA_APPLIED` a des champs différents de `SPELL_DAMAGE`). Le parser doit gérer un nombre de champs variable selon le type d'événement.
- Écrire ce parser avec des tests unitaires basés sur de vraies lignes de log (échantillons à extraire d'un log réel de l'utilisateur), car le format a des subtilités (guillemets échappés dans les noms, champs optionnels, versions de format qui varient légèrement selon les patchs).
- Ne pas chercher l'exhaustivité du format à ce stade : lever une exception/ignorer proprement les types d'événements non gérés plutôt que de les interpréter à moitié.

---

## Étape 4 — Web Worker pour le parsing asynchrone

Déplacer le parsing (étape 3) dans un Web Worker pour ne pas bloquer l'UI sur de gros fichiers, avec retour de progression à l'UI.

**Contexte** :
- Contrainte non-fonctionnelle de SPECS.md §8. À faire tôt dans le plan (pas en optimisation finale) car ça structure la façon dont le parser communique ses résultats (streaming/chunked vs résultat unique) — revenir dessus après coup serait plus coûteux.
- Prévoir un retour de progression (% de lignes traitées) pour l'UX sur un fichier de plusieurs Mo.

---

## Étape 5 — Détection des joueurs et sélection du personnage

À partir des événements parsés, extraire la liste des GUID de joueurs distincts présents dans le log (avec leur nom associé), et construire l'UI de sélection du personnage à analyser (SPECS.md §3.4).

**Contexte** :
- Un joueur peut apparaître comme source ou cible d'événements ; la liste des candidats doit dédupliquer par GUID, pas par nom.
- Filtrer si possible les entités qui ne sont clairement pas des joueurs (mannequins, pets) en s'appuyant sur le préfixe du GUID (`Player-` vs `Creature-`/`Pet-`) pour ne proposer que des joueurs réels dans le sélecteur.

---

## Étape 6 — Détection des segments de combat

Identifier automatiquement les segments de combat (début/fin) dans le log, pour permettre à l'utilisateur de choisir quel segment analyser si plusieurs existent (SPECS.md §3.5).

**Contexte** :
- Décision actée en Étape 0 : heuristique par inactivité. Un segment démarre au premier événement de combat du joueur sélectionné et se termine après un seuil d'inactivité configurable (valeur de départ à définir, ex: 5-10s).
- Garder cette logique isolée (fonction pure testable, seuil paramétrable) car le seuil optimal reste incertain — itération probable après le test sur un vrai log (Étape 16).

---

## Étape 7 — Filtrage du log par joueur

Implémenter le filtrage décrit en SPECS.md §4 : ne garder que les événements dont la source ou la cible est le GUID du joueur sélectionné, sur le segment de combat choisi.

**Contexte** :
- Cette étape doit être testée avec un log réel contenant plusieurs joueurs sur des mannequins voisins, pour vérifier concrètement qu'aucun événement d'un autre joueur ne fuit dans l'analyse.

---

## Étape 8 — Reconstruction de la timeline du joueur

Construire, à partir des événements filtrés, une timeline chronologique de l'état du joueur : sorts castés (avec succès/échec/interruption), buffs actifs et leurs stacks à chaque instant, ressources (charges arcanes) au fil du temps.

**Contexte** :
- C'est la structure de données pivot consommée à la fois par le moteur de comparaison (étape 10) et par la visualisation (étape 13). La concevoir en pensant aux deux usages en même temps évite une refonte de format plus tard.
- Décision actée en Étape 0 : simulation basique, uniquement à partir des événements réels du log (pas de GCD/latence/cast interrompu modélisés). La timeline reflète donc directement les événements observés, sans état "attendu" intermédiaire.

---

## Étape 9 — Format et chargement de la config de rotation cible

Implémenter le chargement/validation du fichier JSON de rotation cible (SPECS.md §5), selon le schéma décidé en Étape 0. Fournir la config par défaut Arcane.

**Contexte** :
- Le moteur qui interprète cette config (étape 10) doit rester générique — ne pas coder de règles Arcane en dur dans le code de chargement/validation (règle CLAUDE.md sur l'extensibilité multi-spé). La logique spécifique à Arcane doit vivre uniquement dans le fichier de config par défaut, pas dans le code.
- Prévoir une validation avec messages d'erreur clairs (l'utilisateur éditera ce fichier à la main) : sorts référencés inconnus, structure de règle invalide, etc.
- Décision actée en Étape 0 : schéma = liste de règles ordonnées par priorité (tableau), chaque règle contenant un ensemble de conditions (stacks, buff actif, cooldown prêt, etc.) et un sort cible ; évaluation "premier match gagne". Le schéma JSON précis (noms de champs, types de conditions supportés) reste à formaliser lors de l'implémentation de cette étape, mais la structure générale est actée.

---

## Étape 10 — Moteur de comparaison (règles vs timeline réelle)

Implémenter le moteur qui, pour chaque instant clé de la timeline réelle (étape 8), évalue la config de rotation (étape 9) pour déterminer le sort attendu, et le compare au sort réellement casté.

**Contexte** :
- Cœur fonctionnel de l'outil (SPECS.md §6). À couvrir en priorité par des tests unitaires sur des scénarios construits à la main (timelines synthétiques), avant de tester sur un vrai log — plus facile à déboguer avec des cas contrôlés.
- Le moteur doit être découplé du parsing/de l'UI : il prend une timeline + une config, retourne une liste d'erreurs typées. Ce découplage facilite les tests et l'ajout futur d'autres spés.

---

## Étape 11 — Classification des erreurs et calcul du score

Implémenter les types d'erreurs listés en SPECS.md §6 (mauvais sort, sort manqué, gaspillage de ressource, gap dans la rotation, mauvaise gestion de cooldown) et le calcul du score global de conformité.

**Contexte** :
- Cette étape peut réutiliser directement la sortie de l'étape 10 — c'est une couche d'agrégation/présentation des erreurs brutes, pas une nouvelle passe d'analyse.

---

## Étape 12 — Table de correspondance sort/aura ID ↔ nom

Constituer la table statique de correspondance entre ID de sort WoW et nom (+ icône si souhaité), utilisée pour l'affichage humainement lisible dans le rapport.

**Contexte** :
- Peut être développée en parallèle des étapes 8-11 puisqu'elle n'a pas de dépendance forte (uniquement consommée par l'UI et les messages d'erreur). Démarrer avec uniquement les sorts/auras nécessaires à la config Arcane par défaut, extensible ensuite.
- Décision actée en Étape 0 : fichier JSON statique maintenu à la main dans le repo, pas d'extraction dynamique depuis le log.

---

## Étape 13 — UI : upload et sélection (joueur / segment)

Construire les écrans/composants Vue pour l'upload du fichier, l'affichage de la progression du parsing (étape 4), la sélection du personnage (étape 5) et du segment de combat (étape 6).

**Contexte** :
- Premier point de contact utilisateur avec l'outil — prioriser un flux simple et des messages d'erreur clairs si le fichier n'est pas un combat log valide ou si aucun joueur/segment n'est détecté.

---

## Étape 14 — UI : visualisation de la timeline

Construire la visualisation de la timeline du combat (sorts castés, buffs/stacks actifs) avec surlignage des erreurs détectées (SPECS.md §7).

**Contexte** :
- Cette étape est la plus exigeante visuellement. Évaluer à ce stade si une librairie de visualisation légère est nécessaire ou si une timeline custom en HTML/CSS suffit pour le volume de données attendu (durée d'un run sur mannequin, généralement quelques minutes).

---

## Étape 15 — UI : rapport d'analyse

Construire l'écran de rapport final : score global, liste des erreurs groupées par type, axes d'amélioration priorisés, statistiques complémentaires (SPECS.md §7).

**Contexte** :
- S'appuie directement sur la sortie de l'étape 11. Prioriser la clarté du message ("ce que je ne fais pas bien") plutôt que l'exhaustivité des stats — c'est l'objectif premier énoncé par l'utilisateur dans sa demande initiale.

---

## Étape 16 — Test de bout en bout avec un vrai combat log

Faire tester par l'utilisateur un vrai combat log de mannequin (idéalement avec d'autres joueurs présents, pour valider le filtrage) sur l'ensemble du pipeline, et ajuster les étapes précédentes en fonction des écarts constatés (format de log réel vs hypothèses, faux positifs/négatifs du moteur de comparaison).

**Contexte** :
- Cette étape validera concrètement les points laissés incertains en Étape 0 (détection de segments, format exact du log) — prévoir explicitement du temps d'itération après ce test plutôt que de considérer le plan figé jusque-là.

---

## Étape 17 — Polish et robustesse

Gestion des cas d'erreur (fichier invalide, log vide, joueur non trouvé), amélioration UX, revue de la config Arcane par défaut avec l'utilisateur pour s'assurer qu'elle reflète une rotation réellement optimale.

**Contexte** :
- À ne pas anticiper avant que le pipeline fonctionne de bout en bout (étape 16) — éviter de peaufiner une UI ou une gestion d'erreurs sur un moteur dont la logique n'est pas encore validée sur données réelles.
