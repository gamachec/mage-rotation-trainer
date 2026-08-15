# Mage Rotation Trainer

Application web d'analyse de rotation WoW Mage (spé Arcane) à partir d'un combat log. Upload d'un fichier `WoWCombatLog.txt`, comparaison de la rotation réelle du joueur à une rotation cible configurable, rapport d'erreurs et score.

100% front-end : le combat log ne quitte jamais le navigateur (parsing en Web Worker).

Voir `SPECS.md` pour la spécification fonctionnelle complète et `CLAUDE.md` pour les règles de développement du projet.

## Stack

Vue 3 + TypeScript + Vite.

## Commandes

```bash
npm install
npm run dev       # serveur de dev
npm run build     # build de prod (type-check + bundle)
npm run test      # tests (vitest)
npm run lint      # eslint
npm run format    # prettier
```
