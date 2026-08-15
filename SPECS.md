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
- Le format et son schéma de validation seront détaillés lors de la phase d'implémentation (hors périmètre de ce document).

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
- **Config de rotation cible** : liste de règles ordonnées par priorité (conditions → sort cible), premier match gagne. Le schéma JSON précis sera formalisé lors de l'implémentation (PLAN.md Étape 9).
- **Table ID de sort ↔ nom/icône** : fichier JSON statique maintenu à la main dans le repo, limité aux sorts/auras Arcane nécessaires au MVP.
- **Détection des segments de combat** : heuristique par inactivité (démarrage au premier événement de combat du joueur, fin après un seuil d'inactivité à calibrer).
- **Niveau de simulation d'état** : basique, uniquement à partir des événements réels du log — pas de modélisation du GCD, de la latence, ni des casts interrompus pour le MVP.
