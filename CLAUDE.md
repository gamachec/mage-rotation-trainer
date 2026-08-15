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

## Test dans un vrai navigateur (Playwright + Chromium headless)

Pour les étapes UI (CLAUDE.md exige un test dans un vrai navigateur, pas juste `vue-tsc`/`vitest`), utiliser Playwright piloté en headless — aucun navigateur graphique n'est disponible dans cet environnement (WSL sans affichage, pas d'outil `chromium-cli`).

**Mise en place (déjà faite une fois, réutilisable telle quelle d'une session à l'autre — rien n'est stocké dans `/tmp`)** :

- Le paquet npm `playwright` n'est **pas** une dépendance du projet (ne pas l'ajouter à `package.json` — c'est un outil de test ad hoc pour l'agent, pas une dépendance de l'app livrée). L'installer à la demande avec `npm install playwright` dans un dossier de scratch (le cache npm `~/.npm` rend les installs suivantes quasi instantanées, pas de re-téléchargement).
- Le binaire Chromium headless est déjà installé et mis en cache dans `~/.cache/ms-playwright/` (persistant, hors `/tmp`). Si absent : `npx --yes playwright install chromium`.
- **Piège spécifique à cette machine** : `chromium-headless-shell` a besoin de `libnspr4`/`libnss3`, absentes du système et non installables sans mot de passe root (`sudo` non interactif indisponible ici — ne pas essayer `playwright install-deps`, ça échoue). Contournement sans toucher au système : les `.so` ont été extraites (via `apt-get download` + `dpkg-deb -x`, sans root) dans `~/.cache/claude-playwright-libs/` (persistant, hors `/tmp`, hors du repo). Si ce dossier disparaît, le recréer avec :
  ```bash
  mkdir -p ~/.cache/claude-playwright-libs
  cd /tmp && rm -rf pw-libs-tmp && mkdir pw-libs-tmp && cd pw-libs-tmp
  apt-get download libnspr4 libnss3
  for f in *.deb; do dpkg-deb -x "$f" ~/.cache/claude-playwright-libs; done
  cd .. && rm -rf pw-libs-tmp
  ```

**Utilisation** : toujours exporter le `LD_LIBRARY_PATH` avant de lancer Chromium via Playwright :

```bash
export LD_LIBRARY_PATH="$HOME/.cache/claude-playwright-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
# lancer le serveur de dev, ex: npm run dev -- --port 5183 &
# puis piloter avec un script Node utilisant `playwright` (chromium.launch({ args: ['--no-sandbox'] }))
```

Après toute modification de code, **redémarrer le serveur `vite` avant de retester** — un serveur déjà lancé avant l'édition peut servir une version stale du module malgré le HMR (piège vécu à l'étape 13 : un bug de binding `v-model` semblait persister alors qu'il était déjà corrigé, simplement parce que le serveur testé datait d'avant la correction).

## Langue

Toutes les communications avec l'utilisateur (explications, commentaires de code si besoin, documentation) doivent être en français. Les identifiants de code, noms de sorts WoW, et termes techniques restent dans leur forme originale (anglais).
