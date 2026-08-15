# SPECS — Mage Rotation Trainer

## 1. Objectif

Application web permettant à un joueur de World of Warcraft (Mage, spé **Arcane** en priorité) d'analyser sa rotation de sorts lors d'une session sur mannequin d'entraînement, en comparant son comportement réel (extrait d'un combat log) à une **rotation cible configurable**, afin d'identifier ses erreurs et ses axes d'amélioration.

## 2. Périmètre

- Spécialisation : **Arcane** en premier (architecture pensée pour accueillir Feu et Givre ensuite).
- Version du jeu : format de combat log **Retail** (The War Within / Midnight — formats considérés quasi-identiques).
- Contexte de test : combat sur **mannequin d'entraînement (training dummy)**, potentiellement avec d'autres joueurs frappant les mannequins voisins en même temps.
- Architecture : **application 100% front-end** (Vue.js), aucun envoi de données à un serveur. Le combat log ne quitte jamais le navigateur.

## 3. Flux utilisateur

1. L'utilisateur exporte/localise son fichier `WoWCombatLog.txt` (ou un extrait) depuis son client WoW.
2. Il l'upload dans l'application via un file input (glisser-déposer supporté).
3. L'application parse le fichier **côté client** (Web Worker, pour ne pas geler l'UI sur les gros fichiers).
4. L'application détecte les personnages présents dans le log et demande à l'utilisateur de **sélectionner son propre personnage** (nom du joueur analysé) si plusieurs joueurs sont détectés.
5. L'application détecte automatiquement les **segments de combat** (encounters) contre un ou des mannequins, et permet à l'utilisateur de choisir quel segment analyser s'il y en a plusieurs.
6. L'application **filtre le log** pour ne garder que les événements liés au joueur sélectionné (sorts lancés, dégâts infligés, auras/buffs/stacks gagnés ou perdus sur ce joueur) — les autres joueurs tapant sur des mannequins voisins sont ignorés.
7. L'application reconstruit la **timeline de la rotation réelle** du joueur : sorts castés, procs/buffs actifs, stacks de ressources (charges arcanes, etc.), au fil du temps.
8. L'application charge une **rotation cible** (voir §5), définie par un fichier de configuration éditable par l'utilisateur.
9. L'application **compare** la timeline réelle à la rotation cible et calcule des écarts / erreurs (voir §6).
10. L'application affiche un **rapport d'analyse** : score global, timeline annotée, liste des erreurs identifiées.

## 4. Nettoyage du combat log

Le combat log WoW contient les événements de **tous** les joueurs et créatures présents dans la zone (autres joueurs sur des mannequins voisins, pets, etc.). L'application :

- Identifie le joueur cible (celui sélectionné à l'étape 4) via son GUID unique de personnage dans le log (pas seulement le nom, pour éviter les ambiguïtés si homonymes).
- Ne conserve que les événements dont la **source** est ce GUID (sorts lancés par le joueur) ou dont la **cible** est ce GUID (auras/buffs reçus par le joueur, y compris ceux appliqués par ses propres sorts).
- Ignore tous les événements des autres joueurs, de leurs pets, et des mannequins eux-mêmes en tant que source.
- Ne dépend pas de l'identification individuelle du mannequin ciblé (plusieurs mannequins identiques possibles) : le filtrage se fait par joueur, pas par mannequin.

## 5. Rotation cible configurable

- La rotation cible est définie dans un **fichier de configuration** (format JSON) que l'utilisateur peut éditer lui-même, en dehors du code de l'application (`src/data/default-rotation-arcane.json` pour la config Arcane par défaut).
- Le format exprime une **liste de priorités conditionnelles** (proche d'un APL — Action Priority List — simplifié) : `{ rules: RotationRule[] }`, où chaque `RotationRule` est `{ spellId: number, conditions: RotationCondition[] }`, évaluées de haut en bas — la première règle dont toutes les conditions sont vraies détermine le sort attendu (premier match gagne). Une règle sans conditions (`conditions: []`) matche toujours (façon d'exprimer un "sinon → sort par défaut", généralement en dernière position). Les conditions d'une même règle sont en ET logique ; un "OU" s'exprime en dupliquant la règle (même `spellId`, conditions différentes).
- Chaque règle référence des sorts et des auras par leur **ID de sort WoW** (les noms affichés sont dérivés d'une table de correspondance locale, `src/data/spell-database.json`, éditable/extensible).
- Cinq types de conditions supportés :
  - `{ type: 'auraStacks', spellId, operator, value }` (`operator` ∈ `==`, `!=`, `>=`, `<=`, `>`, `<`) : compare le nombre de charges courant de l'aura `spellId` (0 si absente) à `value`.
  - `{ type: 'auraActive', spellId, active }` : vrai si l'aura `spellId` est active (`active: true`) ou absente (`active: false`).
  - `{ type: 'spellCooldownReady', spellId, cooldownMs }` : vrai si aucun cast de `spellId` n'a eu lieu dans les `cooldownMs` précédant l'instant évalué. Approximation du cooldown réel (durée fixe donnée en config, pas de calcul serveur/talents/haste) — dérivée de l'historique des casts de la timeline.
  - `{ type: 'previousCastIs', spellId }` : vrai si le cast immédiatement précédent dans la timeline était `spellId` (approximation de « mid-air »). Faux pour le tout premier cast.
  - `{ type: 'resourceValue', powerType, operator, value }` : compare la valeur courante de la ressource de personnage `powerType` (ID numérique Blizzard, ex : 16 = Charges Arcaniques — pas une aura, une ressource comme le mana ou les PV) à `value`. Reconstruite à partir des gains observés dans le log (`SPELL_ENERGIZE`) et des remises à zéro déclarées par `resourceConsumers` (voir ci-dessous) — Blizzard ne logue que les gains de ressource, jamais les pertes/consommations, donc cette reconstruction déroge partiellement au principe général de ne pas simuler au-delà des événements observés.
- Validation : `parseRotationConfig` (`src/data/load-rotation-config.ts`) collecte l'ensemble des problèmes de structure trouvés (pas seulement le premier) et lève `RotationConfigValidationError` avec des messages ciblant le chemin exact (ex : `rules[0].conditions[1].operator`).
- `channeledSpells` (optionnel) : tableau de `{ castSpellId, tickSpellId, expectedTicks }` déclarant les sorts canalisés à surveiller pour la détection de canalisation interrompue (voir §6). Donnée intrinsèque au sort (pas une priorité de rotation), mais reste dans ce fichier pour rester éditable sans toucher au code.
- `resourceConsumers` (optionnel) : tableau de `{ powerType, spellIds }` déclarant que la réussite d'un cast dans `spellIds` remet à zéro la ressource `powerType`, nécessaire à l'évaluation des conditions `resourceValue`. Connaissance de mécanique de jeu non présente dans le combat log (ex : Barrage des Arcanes consomme toutes les Charges Arcaniques) — déclarée en config plutôt qu'en dur dans le moteur.
- `openerSequence` (optionnel, "opener" façon Wowhead) : tableau ordonné de `spellId`, prioritaire sur `rules` pour les `openerSequence.length` premiers casts connus d'un segment. Modélise une séquence d'ouverture fixe (ex : Éruption d'arcanes → Projectiles des Arcanes → Barrage des Arcanes → Toucher des magi) qui ne respecte pas forcément les conditions de la rotation classique (ex : Barrage attendu après un seul Projectiles, sans attendre le seuil de charges normalement requis). Résolution **positionnelle**, pas un pointeur d'état : le N-ième cast connu du segment est toujours jugé contre `openerSequence[N-1]`, que les étapes précédentes aient été castées correctement ou non — pour éviter qu'une seule étape ratée en tout début de combat ne bloque l'évaluation de tout le reste du segment sur cette étape. Une fois les `openerSequence.length` premiers casts connus passés, l'évaluation retombe sur `rules`. Ne crée pas de nouveau type d'erreur : un écart par rapport à l'opener reste un `wrong-spell` classique (§6). Chaque segment (pull) a son propre opener (la position repart à 0 par segment).

## 6. Analyse et comparaison

Pour chaque instant clé de la rotation réelle (chaque cast du joueur), l'application détermine :

- Quel sort **aurait dû** être casté selon la rotation cible, compte tenu de l'état simulé (stacks, buffs actifs, cooldowns) à ce moment précis.
- Si le sort réellement casté correspond → pas d'erreur.
- Si le sort diffère → une erreur est enregistrée, avec son type (voir ci-dessous) et son contexte (timestamp, état des ressources/buffs au moment de l'erreur).

**Casts hors rotation ignorés** : avant toute comparaison, les casts du joueur dont le `spellId` n'est référencé par aucune règle de la config (ni comme `castSpellId` d'un `channeledSpells`, ni présent dans `openerSequence`) sont retirés de la timeline évaluée par `analyzeRotation`/`compareRotation` — `getKnownRotationSpellIds`/`filterTimelineToKnownSpells` (`src/engine/known-rotation-spells.ts`). Ce sont des sorts valides pour le joueur (soin, défensif, mobilité, cosmétique...) mais qu'aucune règle ne prétend juger ; les compter en `wrong-spell` biaiserait le score et pollue la timeline/le rapport sans apporter d'information sur la rotation. Le filtrage porte uniquement sur `timeline.casts` — auras, dégâts et gains de ressource restent inchangés, l'état du personnage doit rester fidèle au log réel.

Quatre types d'erreurs sont détectés :
- `wrong-spell` : mauvais sort casté par rapport au sort attendu par la config à cet instant (couvre aussi le cas "gaspillage de ressource", qui est la même détection vue sous l'angle des stacks). Dérivé de `RotationComparisonResult` ; exclut les casts où `expectedSpellId` est `null` (config incomplète — pas imputable au joueur).
- `rotation-gap` : délai entre deux casts successifs dépassant un seuil fixe (`DEFAULT_ROTATION_GAP_THRESHOLD_MS = 3000` ms, non calibré finement — à ajuster si besoin). Pour un cast d'un sort canalisé (déclaré dans `RotationConfig.channeledSpells`), le point de départ du délai n'est pas le timestamp du cast (début de la canalisation) mais celui de sa dernière vague de dégâts corrélée — sinon toute la durée d'une canalisation menée à son terme (ex : Projectiles des Arcanes, plusieurs secondes) serait comptée à tort comme un temps mort.
- `cooldown-wasted` : un cooldown de burst **explicitement suivi** via la config (règle dont une condition `spellCooldownReady` porte sur son propre `spellId` — auto-référence, pas de champ de config dédié) reste prêt plus de `DEFAULT_COOLDOWN_WASTED_THRESHOLD_MS = 2500` ms sans être recasté. `castAt: null` si jamais recasté avant la fin du segment. Ce n'est pas un système générique de cooldown pour tous les sorts — uniquement pour les cooldowns explicitement déclarés de cette façon par la config (ex : Éruption d'arcanes 365350, Toucher des magi 321507 dans la config par défaut).
- `channel-interrupted` : un cast d'un sort déclaré canalisé dans `RotationConfig.channeledSpells` (`{ castSpellId, tickSpellId, expectedTicks }`) dont le nombre de vagues de dégâts corrélées (même `sourceGuid`, `spellId === tickSpellId`, dans la fenêtre `[cast, prochain cast **du même castSpellId**[`) est inférieur à `expectedTicks`. `tickSpellId` diffère de `castSpellId` pour Projectiles des Arcanes (5143 au cast, 7268 par vague — confirmé sur un vrai log). La fenêtre de corrélation n'est **pas** bornée par le cast suivant quel qu'il soit : les dernières vagues d'une canalisation complète peuvent arriver après le `SPELL_CAST_SUCCESS` du sort suivant (délai de vol du projectile), les exclure sous-compterait une canalisation pourtant menée à son terme. `expectedTicks` est un **plancher**, pas une valeur exacte : sur un vrai log, une canalisation complète de Projectiles des Arcanes produit régulièrement plus de vagues que la valeur du tooltip (7) selon les buffs actifs au cast (jusqu'à 11 vagues observées) — mécanisme non modélisé (pas de conditions par cast dans ce schéma). 7 reste un plancher sûr (jamais observé en-dessous sur un vrai log pour une canalisation menée à son terme).
- **Hors périmètre** : "sort manqué / casté en retard" au sens général (nécessite la durée de toutes les auras, non suivie). Le suivi de cooldown reste limité aux sorts explicitement déclarés (pas de suivi générique pour tous les sorts). La détection de canalisation interrompue reste limitée aux sorts explicitement déclarés dans `channeledSpells`, avec un plancher fixe (pas de nombre de vagues attendu variable selon les buffs actifs).
- **Score global** = `correctCasts / (scoredCasts + wastedCooldownsCount + interruptedChannelsCount)`, où `scoredCasts = totalCasts - incompleteConfigCasts`, arrondi en %. Chaque cooldown de burst gaspillé ou canalisation interrompue agrandit le dénominateur sans ajouter de point, au même titre qu'un `wrong-spell`. Vaut 100% si le dénominateur est nul (rien à juger). Calculé par `analyzeRotation` (`src/engine/analyze-rotation.ts`), point d'orchestration `compareRotation` → `correlateChannelTicks` → `classifyRotationErrors` → `detectWastedCooldowns` + `detectInterruptedChannels`.

## 7. Restitution / rapport

- **Score global** de conformité à la rotation cible (% de casts corrects).
- **Timeline visuelle** du combat : sorts castés par le joueur, buffs/stacks actifs, avec surlignage des erreurs détectées.
- **Liste des erreurs**, groupées par type, avec contexte (timestamp, état des ressources/buffs).

## 8. Contraintes non-fonctionnelles

- 100% front-end : aucune donnée du combat log n'est envoyée à un serveur externe. Confidentialité totale du log du joueur.
- Doit pouvoir traiter des fichiers de combat log de plusieurs Mo sans bloquer l'interface (parsing en Web Worker).
- L'application reste utilisable sans configuration de rotation personnalisée (une config par défaut Arcane est fournie).
- Pas de dépendance à des services externes (pas d'API tierce requise pour le fonctionnement de base).

## 9. Hors périmètre

- Autres spécialisations que Arcane (prévues en extension future, mais l'architecture les anticipe).
- Import direct depuis Warcraft Logs (upload de fichier local uniquement).
- Interprétation d'un vrai APL SimulationCraft.
- Historique de sessions persistant entre les visites (pas de backend, pas de compte utilisateur).
- Support des logs Classic / Season of Discovery.

## 10. Décisions techniques

- **Config de rotation cible** : liste de règles ordonnées par priorité (conditions → sort cible), premier match gagne (voir §5 pour le schéma complet).
- **Table ID de sort ↔ nom/icône** : fichier JSON statique maintenu à la main dans le repo (`src/data/spell-database.json`), limité aux sorts/auras Arcane nécessaires.
- **Détection des segments de combat** : heuristique par inactivité. Un segment démarre au premier sort **casté** par le joueur (`SPELL_CAST_SUCCESS` dont il est la source), pas au premier événement le concernant au sens large (une aura reçue ou des dégâts subis juste avant l'opener démarreraient artificiellement le segment trop tôt). L'inactivité se mesure aussi uniquement entre ses propres casts. Seuil retenu : 5s (`INACTIVITY_THRESHOLD_MS` dans `App.vue`).
- **Niveau de simulation d'état** : basique, uniquement à partir des événements réels du log — pas de modélisation du GCD ni de la latence. Exception pour les canalisations interrompues (voir §6, `channel-interrupted`) : les vagues de dégâts (`SPELL_DAMAGE`) des sorts canalisés déclarés dans `channeledSpells` sont suivies pour détecter une canalisation coupée avant son terme — reste limité aux sorts explicitement déclarés, pas une modélisation générique des casts interrompus.
