# SPECS — Mage Rotation Trainer

## 1. Objectif

Application web permettant à un joueur de World of Warcraft (Mage, spé **Arcane** en priorité) d'analyser sa rotation de sorts lors d'une session sur mannequin d'entraînement, en comparant son comportement réel (extrait d'un combat log) à une **rotation cible configurable**, afin d'identifier ses erreurs et ses axes d'amélioration.

## 2. Périmètre du MVP

- Spécialisation : **Arcane** en premier (architecture pensée pour accueillir Feu et Givre ensuite).
- Version du jeu : format de combat log **Retail** (The War Within / Midnight — formats considérés quasi-identiques pour le MVP).
- Contexte de test : combat sur **mannequin d'entraînement (training dummy)**, potentiellement avec d'autres joueurs frappant les mannequins voisins en même temps.
- Architecture : **application 100% front-end** (Vue.js), aucun envoi de données à un serveur. Le combat log ne quitte jamais le navigateur.

## 3. Flux utilisateur

1. L'utilisateur exporte/localise son fichier `WoWCombatLog.txt` (ou un extrait) depuis son client WoW.
2. Il l'upload dans l'application via un file input (glisser-déposer supporté).
3. L'application parse le fichier **côté client** (Web Worker recommandé pour ne pas geler l'UI sur les gros fichiers).
4. L'application détecte les personnages présents dans le log et demande à l'utilisateur de **sélectionner son propre personnage** (nom du joueur analysé) si plusieurs joueurs sont détectés.
5. L'application détecte automatiquement les **segments de combat** (encounters) contre un ou des mannequins, et permet à l'utilisateur de choisir quel segment analyser s'il y en a plusieurs.
6. L'application **filtre le log** pour ne garder que les événements liés au joueur sélectionné (sorts lancés, dégâts infligés, auras/buffs/stacks gagnés ou perdus sur ce joueur) — les autres joueurs tapant sur des mannequins voisins sont ignorés.
7. L'application reconstruit la **timeline de la rotation réelle** du joueur : sorts castés, procs/buffs actifs, stacks de ressources (charges arcanes, etc.), au fil du temps.
8. L'application charge une **rotation cible** (voir §5), définie par un fichier de configuration éditable par l'utilisateur.
9. L'application **compare** la timeline réelle à la rotation cible et calcule des écarts / erreurs (voir §6).
10. L'application affiche un **rapport d'analyse** : score global, timeline annotée, liste des erreurs identifiées, axes d'amélioration priorisés.

## 4. Nettoyage du combat log

Le combat log WoW contient les événements de **tous** les joueurs et créatures présents dans la zone (autres joueurs sur des mannequins voisins, pets, etc.). L'application doit :

- Identifier le joueur cible (celui sélectionné à l'étape 4) via son GUID unique de personnage dans le log (pas seulement le nom, pour éviter les ambiguïtés si homonymes).
- Ne conserver que les événements dont la **source** est ce GUID (sorts lancés par le joueur) ou dont la **cible** est ce GUID (auras/buffs reçus par le joueur, y compris ceux appliqués par ses propres sorts).
- Ignorer tous les événements des autres joueurs, de leurs pets, et des mannequins eux-mêmes en tant que source.
- Gérer le cas où le mannequin ciblé n'est pas identifiable individuellement (plusieurs mannequins identiques) : le filtrage se fait par joueur, pas par mannequin, donc ce n'est pas bloquant.

## 5. Rotation cible configurable

- La rotation cible est définie dans un **fichier de configuration** (format JSON) que l'utilisateur peut éditer lui-même, en dehors du code de l'application.
- Le format doit permettre d'exprimer une **liste de priorités conditionnelles** (proche d'un APL — Action Priority List — simplifié), par exemple :
  - "Si stacks de Charges Arcanes == 4 ET Buff X actif → lancer le sort Y"
  - "Si Buff Z va expirer dans < N secondes → lancer le sort W"
  - "Sinon → lancer le sort par défaut"
- Chaque règle référence des sorts et des auras par leur **ID de sort WoW** (les noms affichés sont dérivés d'une table de correspondance locale, éditable/extensible).
- Le MVP fournit une configuration par défaut pour Arcane, mais l'utilisateur doit pouvoir la dupliquer/modifier sans toucher au code source de l'application.
- **Schéma formalisé (PLAN.md Étape 9, étendu PLAN-BURST.md Étape 1)** : `{ rules: RotationRule[] }`, où chaque `RotationRule` est `{ spellId: number, conditions: RotationCondition[] }` — une règle sans conditions (`conditions: []`) matche toujours (façon d'exprimer un "sinon → sort par défaut", généralement en dernière position). Les conditions d'une même règle sont en ET logique ; un "OU" s'exprime en dupliquant la règle (même `spellId`, conditions différentes). Quatre types de conditions supportés :
  - `{ type: 'auraStacks', spellId, operator, value }` (`operator` ∈ `==`, `!=`, `>=`, `<=`, `>`, `<`) : compare le nombre de charges courant de l'aura `spellId` (0 si absente) à `value`. Calculable à partir de la timeline reconstruite (Étape 8).
  - `{ type: 'auraActive', spellId, active }` : vrai si l'aura `spellId` est active (`active: true`) ou absente (`active: false`). Calculable à partir de la timeline reconstruite (Étape 8).
  - `{ type: 'spellCooldownReady', spellId, cooldownMs }` : vrai si aucun cast de `spellId` n'a eu lieu dans les `cooldownMs` précédant l'instant évalué. Approximation du cooldown réel (durée fixe donnée en config, pas de calcul serveur/talents/haste) — dérivée de l'historique des casts de la timeline, sans changement du parser.
  - `{ type: 'previousCastIs', spellId }` : vrai si le cast immédiatement précédent dans la timeline était `spellId` (approximation de « mid-air »). Faux pour le tout premier cast.
  - Validation : `parseRotationConfig` (`src/data/load-rotation-config.ts`) collecte l'ensemble des problèmes de structure trouvés (pas seulement le premier) et lève `RotationConfigValidationError` avec des messages ciblant le chemin exact (ex : `rules[0].conditions[1].operator`).
  - `channeledSpells` (optionnel, révision post-Étape 16) : tableau de `{ castSpellId, tickSpellId, expectedTicks }` déclarant les sorts canalisés à surveiller pour la détection de canalisation interrompue (voir §6). Donnée intrinsèque au sort (pas une priorité de rotation), mais reste dans ce fichier pour rester éditable sans toucher au code.

## 6. Analyse et comparaison

Pour chaque instant clé de la rotation réelle (typiquement chaque cast du joueur), l'application détermine :

- Quel sort **aurait dû** être casté selon la rotation cible, compte tenu de l'état simulé (stacks, buffs actifs, cooldowns) à ce moment précis.
- Si le sort réellement casté correspond → pas d'erreur.
- Si le sort diffère → une erreur est enregistrée, avec son type (voir ci-dessous) et son contexte (timestamp, état des ressources/buffs au moment de l'erreur).

Types d'erreurs à détecter (liste indicative, affinable en implémentation) :
- Mauvais sort casté par rapport à la priorité attendue.
- Sort clé manqué ou casté en retard (ex : buff important laissé expirer avant refresh).
- Gaspillage de ressource (ex : cast alors que les stacks ne sont pas au niveau attendu par la règle).
- Temps mort / gap dans la rotation (délai anormal entre deux casts, hors latence serveur/GCD).
- Mauvaise gestion des cooldowns (sort à cooldown lancé trop tôt/tard par rapport à la fenêtre optimale).

**Périmètre MVP tranché (PLAN.md Étape 11), étendu (PLAN-BURST.md Étape 3, révision post-Étape 16 pour les canalisations)** : quatre types sont implémentés :
- `wrong-spell` : mauvais sort casté par rapport au sort attendu par la config à cet instant (couvre aussi le cas "gaspillage de ressource", qui est la même détection vue sous l'angle des stacks). Dérivé directement de `RotationComparisonResult` (Étape 10) ; exclut les casts où `expectedSpellId` est `null` (config incomplète — pas imputable au joueur).
- `rotation-gap` : délai entre deux casts successifs dépassant un seuil fixe (`DEFAULT_ROTATION_GAP_THRESHOLD_MS = 3000` ms au MVP, non calibré sur un vrai log — à ajuster à l'Étape 16 si besoin). **Révision post-Étape 16** : pour un cast d'un sort canalisé (déclaré dans `RotationConfig.channeledSpells`, voir ci-dessous), le point de départ du délai n'est plus le timestamp du cast (début de la canalisation) mais celui de sa dernière vague de dégâts corrélée — sinon toute la durée d'une canalisation menée à son terme (ex : Projectiles des Arcanes, plusieurs secondes) était comptée à tort comme un temps mort.
- `cooldown-wasted` : un cooldown de burst **explicitement suivi** via la config (règle dont une condition `spellCooldownReady` porte sur son propre `spellId` — auto-référence, pas de champ de config dédié) reste prêt plus de `DEFAULT_COOLDOWN_WASTED_THRESHOLD_MS = 2500` ms sans être recasté. `castAt: null` si jamais recasté avant la fin du segment. **Ce n'est pas un système générique de cooldown pour tous les sorts** — uniquement pour les cooldowns explicitement déclarés de cette façon par la config (au MVP burst : Éruption d'arcanes 365350, Toucher des magi 321507).
- `channel-interrupted` (révision post-Étape 16) : un cast d'un sort déclaré canalisé dans `RotationConfig.channeledSpells` (`{ castSpellId, tickSpellId, expectedTicks }`) dont le nombre de vagues de dégâts corrélées (même `sourceGuid`, `spellId === tickSpellId`, dans la fenêtre `[cast, prochain cast **du même castSpellId**[`) est inférieur à `expectedTicks`. `tickSpellId` diffère de `castSpellId` pour Projectiles des Arcanes (5143 au cast, 7268 par vague — confirmé sur un vrai log). La fenêtre de corrélation n'est **pas** bornée par le cast suivant quel qu'il soit : les dernières vagues d'une canalisation complète peuvent arriver après le `SPELL_CAST_SUCCESS` du sort suivant (délai de vol du projectile), les exclure sous-compterait une canalisation pourtant menée à son terme. `expectedTicks` est un **plancher**, pas une valeur exacte : sur un vrai log, une canalisation complète de Projectiles des Arcanes produit régulièrement plus de vagues que la valeur du tooltip (7) selon les buffs actifs au cast (jusqu'à 11 vagues observées) — mécanisme non modélisé (pas de conditions par cast dans ce schéma). 7 reste un plancher sûr (jamais observé en-dessous sur un vrai log pour une canalisation menée à son terme).
- **Hors périmètre** : "sort manqué / casté en retard" au sens général (nécessite la durée de toutes les auras, non suivie) reste hors-scope. Le suivi de cooldown reste limité aux sorts explicitement déclarés (pas de suivi générique pour tous les sorts). La détection de canalisation interrompue reste limitée aux sorts explicitement déclarés dans `channeledSpells`, avec un plancher fixe (pas de nombre de vagues attendu variable selon les buffs actifs).
- **Score global** (SPECS.md §7, révisé PLAN-BURST.md Étape 3, étendu post-Étape 16) = `correctCasts / (scoredCasts + wastedCooldownsCount + interruptedChannelsCount)`, où `scoredCasts = totalCasts - incompleteConfigCasts`, arrondi en %. Chaque cooldown de burst gaspillé ou canalisation interrompue agrandit le dénominateur sans ajouter de point, au même titre qu'un `wrong-spell`. Vaut 100% si le dénominateur est nul (rien à juger). Calculé par `analyzeRotation` (`src/engine/analyze-rotation.ts`), point d'orchestration `compareRotation` → `correlateChannelTicks` → `classifyRotationErrors` → `detectWastedCooldowns` + `detectInterruptedChannels`.

## 7. Restitution / rapport

- **Score global** de conformité à la rotation cible (ex : % de casts corrects).
- **Timeline visuelle** du combat : sorts castés par le joueur, buffs/stacks actifs, avec surlignage des erreurs détectées.
- **Liste des erreurs**, groupées par type, avec explication en langage clair (ex : "Vous avez casté Arcane Blast alors que vous étiez à 4 charges arcanes sans Clearcasting actif — Arcane Barrage était attendu").
- **Axes d'amélioration priorisés** : les 3-5 erreurs les plus fréquentes/impactantes, mises en avant en premier.
- Statistiques complémentaires si pertinentes : DPS estimé sur le segment, uptime des buffs clés, temps de cast perdu.

## 8. Contraintes non-fonctionnelles

- 100% front-end : aucune donnée du combat log n'est envoyée à un serveur externe. Confidentialité totale du log du joueur.
- Doit pouvoir traiter des fichiers de combat log de plusieurs Mo sans bloquer l'interface (parsing en Web Worker).
- L'application doit rester utilisable sans configuration de rotation personnalisée (une config par défaut Arcane est fournie).
- Pas de dépendance à des services externes (pas d'API tierce requise pour le fonctionnement de base).

## 9. Hors périmètre du MVP

- Autres spécialisations que Arcane (prévues en extension future, mais l'architecture doit les anticiper).
- Import direct depuis Warcraft Logs (upload de fichier local uniquement pour le MVP).
- Interprétation d'un vrai APL SimulationCraft.
- Historique de sessions persistant entre les visites (pas de backend, pas de compte utilisateur).
- Support des logs Classic / Season of Discovery.

## 10. Décisions techniques actées

Ces points, initialement laissés ouverts, ont été tranchés lors de la phase de planification (voir PLAN.md, Étape 0) :
- **Config de rotation cible** : liste de règles ordonnées par priorité (conditions → sort cible), premier match gagne. Schéma JSON formalisé à l'implémentation (PLAN.md Étape 9, détail en §5) : conditions limitées à `auraStacks`/`auraActive`, pas de notion de cooldown/durée de buff au MVP (données non capturées par le parser).
- **Table ID de sort ↔ nom/icône** : fichier JSON statique maintenu à la main dans le repo, limité aux sorts/auras Arcane nécessaires au MVP.
- **Détection des segments de combat** : heuristique par inactivité (démarrage au premier événement de combat du joueur, fin après un seuil d'inactivité à calibrer). **Révisé après test sur un vrai log** (voir PLAN.md Étape 16) : un segment démarre au premier sort **casté** par le joueur (`SPELL_CAST_SUCCESS` dont il est la source), pas au premier événement le concernant au sens large (une aura reçue ou des dégâts subis juste avant l'opener démarraient artificiellement le segment trop tôt). L'inactivité se mesure aussi uniquement entre ses propres casts, pas entre tout événement le concernant. Seuil retenu : 5s (`INACTIVITY_THRESHOLD_MS` dans `App.vue`).
- **Niveau de simulation d'état** : basique, uniquement à partir des événements réels du log — pas de modélisation du GCD ni de la latence. **Révisé post-Étape 16** pour les canalisations interrompues (voir §6, `channel-interrupted`) : les vagues de dégâts (`SPELL_DAMAGE`) des sorts canalisés déclarés dans `channeledSpells` sont désormais suivies pour détecter une canalisation coupée avant son terme — reste limité aux sorts explicitement déclarés, pas une modélisation générique des casts interrompus.
