# CLAUDE.md

Règles à suivre pour travailler sur ce projet.

## Documents de référence — à lire en tout début de session

- **`SPECS.md`** : spécification fonctionnelle complète du projet (flux utilisateur, règles de nettoyage du log, format de rotation cible, types d'erreurs détectées, contraintes non-fonctionnelles).
- **`PLAN.md`** : plan d'implémentation détaillé, découpé en étapes ordonnées, avec le contexte nécessaire à chaque étape. **Avant d'implémenter une étape demandée par l'utilisateur, toujours relire PLAN.md en entier** (l'étape ciblée + celles déjà marquées faites) pour respecter l'ordre et les décisions déjà actées, plutôt que de partir sur une hypothèse. Mettre à jour le statut de l'étape dans PLAN.md une fois implémentée.

Ces deux fichiers font foi sur le contexte fonctionnel et l'avancement du projet — les relire avant toute implémentation, même si le contexte de conversation semble suffisant.

## Contexte projet

Application web d'analyse de rotation WoW Mage (spé Arcane en priorité), à partir de combat logs uploadés par l'utilisateur. 100% front-end, Vue.js.

## Règles de développement

- **100% front-end** : aucune donnée de combat log ne doit jamais être envoyée vers un serveur, une API tierce, ou un quelconque service externe. Tout le parsing et l'analyse se fait dans le navigateur. Ne pas introduire de backend sans validation explicite de l'utilisateur — c'est une contrainte de confidentialité, pas juste une préférence de simplicité.
- **Stack** : Vue.js (le framework front que l'utilisateur maîtrise). Pas de framework front concurrent (React, Svelte, etc.) sans demande explicite.
- **Performance parsing** : les combat logs peuvent faire plusieurs Mo. Le parsing doit être fait de façon à ne pas geler l'UI (Web Worker ou équivalent) dès que la taille du fichier le justifie.
- **Rotation cible = donnée externe éditable** : la rotation cible ne doit jamais être codée en dur dans la logique applicative. Elle doit vivre dans un fichier de configuration (JSON) que l'utilisateur peut modifier sans toucher au code. Le moteur d'analyse doit être générique et interpréter cette configuration, pas contenir de règles Arcane hardcodées.
- **Extensibilité multi-spé** : même si le MVP cible uniquement Arcane, ne pas coder de raccourcis qui supposeraient qu'il n'y aura jamais que cette spé (ex: éviter les noms de variables/fonctions trop spécifiques à Arcane dans le moteur générique).
- **Pas de sur-ingénierie** : ne pas construire de couches d'abstraction pour des besoins hypothétiques non listés dans SPECS.md. Se référer à SPECS.md avant d'ajouter une fonctionnalité — si elle n'y est pas et que ce n'est pas trivialement nécessaire, demander avant d'implémenter.

## Process

- Suivre l'ordre des étapes de `PLAN.md`. Ne pas sauter une étape ou anticiper une étape ultérieure sans validation explicite de l'utilisateur.
- Si une étape de `PLAN.md` révèle une décision fonctionnelle non couverte par `SPECS.md`, la trancher avec l'utilisateur (pas unilatéralement) puis mettre à jour `SPECS.md` en conséquence.
- Garder `SPECS.md` et `PLAN.md` à jour au fil de l'implémentation : si une décision fonctionnelle ou technique change en cours de route, répercuter le changement dans le document concerné plutôt que de laisser la documentation diverger du code.

## Langue

Toutes les communications avec l'utilisateur (explications, commentaires de code si besoin, documentation) doivent être en français. Les identifiants de code, noms de sorts WoW, et termes techniques restent dans leur forme originale (anglais).
