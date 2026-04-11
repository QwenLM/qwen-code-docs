# État d'implémentation de la suggestion de prompt

> Suit l'état d'implémentation de la fonctionnalité de suggestion de prompt (NES) dans tous les packages.

## Module principal (`packages/core/src/followup/`)

| Composant                | État  | Lignes | Description                                                   |
| ------------------------ | ----- | ------ | ------------------------------------------------------------- |
| `followupState.ts`       | ✅ Done | ~230   | Contrôleur agnostique au framework avec timer/debounce        |
| `suggestionGenerator.ts` | ✅ Done | ~260   | Génération LLM + 12 règles de filtrage + prise en charge des requêtes forkées |
| `forkedQuery.ts`         | ✅ Done | ~240   | CacheSafeParams + createForkedChat + runForkedQuery           |
| `overlayFs.ts`           | ✅ Done | ~140   | Système de fichiers overlay en copy-on-write                  |
| `speculationToolGate.ts` | ✅ Done | ~150   | Application des limites d'outils avec un analyseur AST shell  |
| `speculation.ts`         | ✅ Done | ~540   | Moteur de spéculation avec suggestion en pipeline + remplacement de modèle |

## Intégration CLI (`packages/cli/`)

| Composant                    | État  | Description                                                |
| ---------------------------- | ----- | ---------------------------------------------------------- |
| `AppContainer.tsx`           | ✅ Done | Génération de suggestions, cycle de vie de la spéculation, rendu UI |
| `InputPrompt.tsx`            | ✅ Done | Acceptation via Tab/Entrée/Flèche droite, rejet + annulation |
| `Composer.tsx`               | ✅ Done | Transmission des props                                     |
| `UIStateContext.tsx`         | ✅ Done | promptSuggestion + dismissPromptSuggestion                 |
| `useFollowupSuggestions.tsx` | ✅ Done | Hook React avec télémétrie + suivi des frappes             |
| `settingsSchema.ts`          | ✅ Done | 3 feature flags + paramètre fastModel                      |
| `settings.schema.json`       | ✅ Done | Schéma des paramètres VSCode                               |

## Intégration WebUI (`packages/webui/`)

| Composant                   | État  | Description                                 |
| --------------------------- | ----- | ------------------------------------------- |
| `InputForm.tsx`             | ✅ Done | Tab/Entrée/Flèche droite + soumission explicitText |
| `useFollowupSuggestions.ts` | ✅ Done | Hook React avec prise en charge de onOutcome |
| `followup.ts`               | ✅ Done | Point d'entrée du sous-chemin               |
| `components.css`            | ✅ Done | Style du texte fantôme                      |
| `vite.config.followup.ts`   | ✅ Done | Configuration de build séparée              |

## Télémétrie (`packages/core/src/telemetry/`)

| Composant               | État  | Description          |
| ----------------------- | ----- | -------------------- |
| `PromptSuggestionEvent` | ✅ Done | 10 champs            |
| `SpeculationEvent`      | ✅ Done | 7 champs             |
| `logPromptSuggestion()` | ✅ Done | Logger OpenTelemetry |
| `logSpeculation()`      | ✅ Done | Logger OpenTelemetry |

## Couverture de tests

| Fichier de test               | Tests | Description                                                     |
| ----------------------------- | ----- | --------------------------------------------------------------- |
| `followupState.test.ts`       | 14    | Timer du contrôleur, debounce, callback d'acceptation, onOutcome, clear |
| `suggestionGenerator.test.ts` | 16    | Les 12 règles de filtrage + cas limites + faux positifs         |
| `overlayFs.test.ts`           | 15    | Écriture COW, résolution de lecture, apply, cleanup, path traversal |
| `speculationToolGate.test.ts` | 27    | Catégories d'outils, mode d'approbation, AST shell, réécriture de chemin |
| `forkedQuery.test.ts`         | 6     | Sauvegarde/récupération/suppression des params cache, deep clone, détection de version |
| `speculation.test.ts`         | 7     | Cas limites de ensureToolResultPairing                          |
| `smoke.test.ts`               | 21    | E2E inter-modules : filter + overlay + toolGate + cache + pairing |
| `InputPrompt.test.tsx`        | 4     | Tab, Entrée+submit, Flèche droite, guard de complétion          |

## Historique des audits

| Tour            | Problèmes trouvés | Problèmes corrigés                                         |
| --------------- | ----------------- | ---------------------------------------------------------- |
| R1-R4           | 10                | 10 (moteur de règles → LLM, simplification de l'état)      |
| R5-R6           | 2                 | 2 (conflit de raccourci Entrée, télémétrie Flèche droite)  |
| R7-R8           | 3                 | 3 (télémétrie WebUI, type inutilisé, couverture de tests)  |
| R9              | 0                 | — (convergence)                                            |
| R10-R11         | 1                 | 1 (dépendance historyManager)                              |
| R12-R13         | 1                 | 1 (limites de mots pour les regex évaluatives)             |
| Phase 1+2 R1-R4 | 20+               | 20+ (contournement de permissions, sécurité overlay, race conditions) |
| **Total**       | **37+**           | **37+**                                                    |

## Alignement avec Claude Code

| Fonctionnalité                   | Alignement | Notes                                 |
| -------------------------------- | ---------- | ------------------------------------- |
| Texte du prompt                  | 100%       | Identique (nom de marque uniquement)  |
| 12 règles de filtrage            | 100%+      | Amélioration des limites de mots `\b` |
| Interaction UI (Tab/Entrée/Flèche droite) | 100% |                                       |
| Conditions de garde              | 100%       | 13 vérifications                      |
| Télémétrie                       | 100%       | 10+7 champs                           |
| Partage de cache                 | ✅         | DashScope cache_control               |
| Spéculation                      | ✅         | Overlay COW + gating d'outils         |
| Suggestion en pipeline           | ✅         | Générée après la fin de la spéculation |
| Gestion de l'état                | 100%+      | Pattern contrôleur, Object.freeze     |