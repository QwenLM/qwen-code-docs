# Statut de l'implémentation de la suggestion d'invite (Prompt Suggestion)

> Suit l'état d'implémentation de la fonctionnalité de suggestion d'invite (NES) dans tous les packages.

## Module principal (`packages/core/src/followup/`)

| Composant                 | Statut      | Lignes | Description                                                          |
| ------------------------- | ----------- | ------ | -------------------------------------------------------------------- |
| `followupState.ts`        | ✅ Terminé | ~230   | Contrôleur indépendant du framework avec minuteur/débounce           |
| `suggestionGenerator.ts`  | ✅ Terminé | ~260   | Génération LLM + 12 règles de filtrage + support des requêtes forkées |
| `forkedQuery.ts`          | ✅ Terminé | ~240   | CacheSafeParams + createForkedChat + runForkedQuery                  |
| `overlayFs.ts`            | ✅ Terminé | ~140   | Système de fichiers superposé (copy-on-write)                        |
| `speculationToolGate.ts`  | ✅ Terminé | ~150   | Application des limites d'outils avec analyseur AST shell            |
| `speculation.ts`          | ✅ Terminé | ~540   | Moteur de spéculation avec suggestion en pipeline + remplacement de modèle |

## Intégration CLI (`packages/cli/`)

| Composant                        | Statut      | Description                                                    |
| -------------------------------- | ----------- | -------------------------------------------------------------- |
| `AppContainer.tsx`               | ✅ Terminé | Génération de suggestions, cycle de vie de la spéculation, rendu UI |
| `InputPrompt.tsx`                | ✅ Terminé | Acceptation Tab/Entrée/Flèche droite, rejet + annulation       |
| `Composer.tsx`                   | ✅ Terminé | Transmission des props                                         |
| `UIStateContext.tsx`             | ✅ Terminé | promptSuggestion + dismissPromptSuggestion                     |
| `useFollowupSuggestions.tsx`     | ✅ Terminé | Hook React avec télémétrie + suivi des frappes                 |
| `settingsSchema.ts`              | ✅ Terminé | 3 indicateurs de fonctionnalité + paramètre fastModel          |
| `settings.schema.json`           | ✅ Terminé | Schéma de paramètres VS Code                                   |

## Intégration WebUI (`packages/webui/`)

| Composant                     | Statut      | Description                                    |
| ----------------------------- | ----------- | ---------------------------------------------- |
| `InputForm.tsx`               | ✅ Terminé | Tab/Entrée/Flèche droite + soumission explicitText |
| `useFollowupSuggestions.ts`   | ✅ Terminé | Hook React avec support onOutcome               |
| `followup.ts`                 | ✅ Terminé | Point d'entrée de sous-chemin                  |
| `components.css`              | ✅ Terminé | Style du texte fantôme (ghost text)            |
| `vite.config.followup.ts`     | ✅ Terminé | Configuration de build séparée                 |

## Télémétrie (`packages/core/src/telemetry/`)

| Composant                 | Statut      | Description              |
| ------------------------- | ----------- | ------------------------ |
| `PromptSuggestionEvent`   | ✅ Terminé | 10 champs                |
| `SpeculationEvent`        | ✅ Terminé | 7 champs                 |
| `logPromptSuggestion()`   | ✅ Terminé | Enregistreur OpenTelemetry |
| `logSpeculation()`        | ✅ Terminé | Enregistreur OpenTelemetry |

## Couverture des tests

| Fichier de test                 | Tests | Description                                                                 |
| ------------------------------- | ----- | --------------------------------------------------------------------------- |
| `followupState.test.ts`         | 14    | Minuteur du contrôleur, débounce, rappel accept, onOutcome, effacement      |
| `suggestionGenerator.test.ts`   | 16    | Toutes les 12 règles de filtrage + cas limites + faux positifs              |
| `overlayFs.test.ts`             | 15    | Écriture COW, résolution de lecture, application, nettoyage, traversée de chemin |
| `speculationToolGate.test.ts`   | 27    | Catégories d'outils, mode d'approbation, AST shell, réécriture de chemin    |
| `forkedQuery.test.ts`           | 6     | Sauvegarde/récupération/effacement des params de cache, clone profond, détection de version |
| `speculation.test.ts`           | 7     | Cas limites de ensureToolResultPairing                                      |
| `smoke.test.ts`                 | 21    | E2E inter-modules : filtre + overlay + toolGate + cache + appariement       |
| `InputPrompt.test.tsx`          | 4     | Tab, Entrée+soumettre, Flèche droite, garde de complétion                   |

## Historique des audits

| Tour              | Problèmes trouvés | Problèmes corrigés                          |
| ----------------- | ----------------- | ------------------------------------------- |
| R1-R4             | 10                | 10 (moteur de règles → LLM, simplification d'état) |
| R5-R6             | 2                 | 2 (conflit de raccourci Entrée, télémétrie Flèche droite) |
| R7-R8             | 3                 | 3 (télémétrie WebUI, type mort, couverture de test) |
| R9                | 0                 | — (convergence)                             |
| R10-R11           | 1                 | 1 (dépendance historyManager)               |
| R12-R13           | 1                 | 1 (limites de mots dans l'expression régulière évaluative) |
| Phase 1+2 R1-R4   | 20+               | 20+ (bypass de permission, sécurité overlay, conditions de concurrence) |
| **Total**         | **37+**           | **37+**                                     |

## Alignement avec Claude Code

| Fonctionnalité                       | Alignement | Notes                                    |
| ------------------------------------ | ---------- | ---------------------------------------- |
| Texte de l'invite                    | 100%       | Identique (nom de marque uniquement)     |
| 12 règles de filtrage                | 100%+      | Amélioration des limites de mots `\b`    |
| Interaction UI (Tab/Entrée/Flèche)   | 100%       |                                          |
| Conditions de garde                  | 100%       | 13 vérifications                         |
| Télémétrie                           | 100%       | 10+7 champs                              |
| Partage de cache                     | ✅         | cache_control DashScope                  |
| Spéculation                          | ✅         | Superposition COW + gating d'outils      |
| Suggestion en pipeline               | ✅         | Générée après la fin de la spéculation   |
| Gestion d'état                       | 100%+      | Pattern contrôleur, Object.freeze        |