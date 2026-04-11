# Conception de la suggestion de prompt (NES)

> Prédit ce que l'utilisateur taperait naturellement ensuite après qu'une réponse de l'IA est terminée, en l'affichant sous forme de texte fantôme dans le champ de saisie.
>
> État de l'implémentation : `prompt-suggestion-implementation.md`. Moteur de spéculation : `speculation-design.md`.

## Vue d'ensemble

Une **suggestion de prompt** (Next-step Suggestion / NES) est une courte prédiction (2 à 12 mots) de la prochaine saisie de l'utilisateur, générée par un appel LLM après chaque réponse de l'IA. Elle s'affiche sous forme de texte fantôme dans le champ de saisie. L'utilisateur peut l'accepter avec Tab/Entrée/Flèche droite ou la rejeter en commençant à taper.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Responding → Idle transition                               │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Guard Conditions (11 categories)                    │    │
│  │  settings, interactive, sdk, plan mode, dialogs,    │    │
│  │  elicitation, API error                             │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams available? ───┐               │    │
│  │  │                                  │               │    │
│  │  ▼ YES                         NO ▼                 │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (cache-aware)         (standalone fallback)        │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 filter rules ──────                        │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (framework-agnostic)            │    │
│  │  300ms delay → show as ghost text                   │    │
│  │                                                     │    │
│  │  Tab    → accept (fill input)                       │    │
│  │  Enter  → accept + submit                           │    │
│  │  Right  → accept (fill input)                       │    │
│  │  Type   → dismiss + abort speculation               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Telemetry (PromptSuggestionEvent)                  │    │
│  │  outcome, accept_method, timing, similarity,        │    │
│  │  keystroke, focus, suppression reason, prompt_id     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Génération de la suggestion

### Prompt LLM

```
[SUGGESTION MODE: Suggest what the user might naturally type next.]

FIRST: Read the LAST FEW LINES of the assistant's most recent message — that's where
next-step hints, tips, and actionable suggestions usually appear. Then check the user's
recent messages and original request.

Your job is to predict what THEY would type - not what you think they should do.
THE TEST: Would they think "I was just about to type that"?

PRIORITY: If the assistant's last message contains a tip or hint like "Tip: type X to ..."
or "type X to ...", extract X as the suggestion. These are explicit next-step hints.

EXAMPLES:
Assistant says "Tip: type post comments to publish findings" → "post comments"
Assistant says "type /review to start" → "/review"
User asked "fix the bug and run tests", bug is fixed → "run the tests"
After code written → "try it out"
Task complete, obvious follow-up → "commit this" or "push it"

Format: 2-12 words, match the user's style. Or nothing.
Reply with ONLY the suggestion, no quotes or explanation.
```

### Règles de filtrage (12)

| Règle              | Exemple bloqué                                   |
| ------------------ | ------------------------------------------------ |
| done               | "done"                                           |
| meta_text          | "nothing found", "no suggestion", "silence"      |
| meta_wrapped       | "(silence)", "[no suggestion]"                   |
| error_message      | "api error: 500"                                 |
| prefixed_label     | "Suggestion: commit"                             |
| too_few_words      | "hmm" (mais autorise "yes", "commit", "push", etc.)  |
| too_many_words     | > 12 mots                                        |
| too_long           | >= 100 caractères                                |
| multiple_sentences | "Run tests. Then commit."                        |
| has_formatting     | sauts de ligne, gras markdown                    |
| evaluative         | "looks good", "thanks" (avec des limites de mots \b) |
| ai_voice           | "Let me...", "I'll...", "Here's..."              |

### Conditions de garde

**AppContainer useEffect (13 vérifications dans le code) :**

| Condition de garde     | Vérification                                          |
| ---------------------- | ----------------------------------------------------- |
| Paramètre activé/désactivé | `enableFollowupSuggestions`                         |
| Mode non interactif    | `config.isInteractive()`                              |
| Mode SDK               | `!config.getSdkMode()`                                |
| Transition de streaming| `Responding → Idle` (2 vérifications)                 |
| Erreur API (historique)| `historyManager.history[last]?.type !== 'error'`      |
| Erreur API (en attente)| `!pendingGeminiHistoryItems.some(type === 'error')`   |
| Boîtes de dialogue de confirmation | shell + general + détection de boucle (3 vérifications) |
| Boîte de dialogue d'autorisation | `isPermissionsDialogOpen`                       |
| Élicitation            | `settingInputRequests.length === 0`                   |
| Mode plan              | `ApprovalMode.PLAN`                                   |

**Dans `generatePromptSuggestion()` :**

| Condition de garde     | Vérification     |
| ---------------------- | ---------------- |
| Début de conversation  | `modelTurns < 2` |

**Flags de fonctionnalités séparés (hors bloc de garde) :**

| Flag                   | Contrôle                                                        |
| ---------------------- | --------------------------------------------------------------- |
| `enableCacheSharing`   | Utiliser la requête forkée ou le fallback vers generateJson     |
| `enableSpeculation`    | Démarrer la spéculation lors de l'affichage de la suggestion    |

## Gestion de l'état

### FollowupState

```typescript
interface FollowupState {
  suggestion: string | null;
  isVisible: boolean;
  shownAt: number; // timestamp for telemetry
}
```

### FollowupController

Contrôleur agnostique au framework partagé par la CLI (Ink) et la WebUI (React) :

- `setSuggestion(text)` — affichage retardé de 300 ms, `null` efface immédiatement
- `accept(method)` — efface l'état, déclenche `onAccept` via une microtask, verrou debounce de 100 ms
- `dismiss()` — efface l'état, enregistre la télémétrie `ignored`
- `clear()` — réinitialisation complète de l'état et des timers
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` empêche toute mutation accidentelle

## Interaction clavier

| Touche      | CLI                         | WebUI                                |
| ----------- | --------------------------- | ------------------------------------ |
| Tab         | Remplit le champ (sans soumettre)      | Remplit le champ (sans soumettre)               |
| Entrée      | Remplit + soumet            | Remplit + soumet (paramètre `explicitText`) |
| Flèche droite | Remplit le champ (sans soumettre)    | Remplit le champ (sans soumettre)               |
| Saisie      | Rejette + annule la spéculation | Rejette                              |
| Coller      | Rejette + annule la spéculation | Rejette                              |

### Note sur les raccourcis clavier

Le gestionnaire Tab utilise explicitement `key.name === 'tab'` (et non le matcher `ACCEPT_SUGGESTION`) car `ACCEPT_SUGGESTION` correspond aussi à Entrée, qui doit être propagée au gestionnaire SUBMIT.

## Télémétrie

### PromptSuggestionEvent

| Champ                      | Type                        | Description                         |
| -------------------------- | --------------------------- | ----------------------------------- |
| outcome                    | accepted/ignored/suppressed | Résultat final                      |
| prompt_id                  | string                      | Par défaut : 'user_intent'          |
| accept_method              | tab/enter/right             | Méthode d'acceptation par l'utilisateur |
| time_to_accept_ms          | number                      | Délai entre l'affichage et l'acceptation |
| time_to_ignore_ms          | number                      | Délai entre l'affichage et le rejet |
| time_to_first_keystroke_ms | number                      | Délai jusqu'à la première frappe pendant l'affichage |
| suggestion_length          | number                      | Nombre de caractères                |
| similarity                 | number                      | 1.0 pour accept, 0.0 pour ignore    |
| was_focused_when_shown     | boolean                     | Le terminal avait le focus          |
| reason                     | string                      | Pour suppressed : nom de la règle de filtrage |

### SpeculationEvent

| Champ                    | Type                    | Description               |
| ------------------------ | ----------------------- | ------------------------- |
| outcome                  | accepted/aborted/failed | Résultat de la spéculation |
| turns_used               | number                  | Allers-retours API        |
| files_written            | number                  | Fichiers dans l'overlay   |
| tool_use_count           | number                  | Outils exécutés           |
| duration_ms              | number                  | Temps réel (wall-clock)   |
| boundary_type            | string                  | Ce qui a arrêté la spéculation |
| had_pipelined_suggestion | boolean                 | Prochaine suggestion générée |

## Flags de fonctionnalités et paramètres

| Paramètre                     | Type    | Par défaut | Description                                                                      |
| --------------------------- | ------- | ------- | -------------------------------------------------------------------------------- |
| `enableFollowupSuggestions` | boolean | true    | Interrupteur principal pour les suggestions de prompt                            |
| `enableCacheSharing`        | boolean | true    | Utiliser les requêtes forkées avec prise en compte du cache                      |
| `enableSpeculation`         | boolean | false   | Moteur d'exécution prédictive                                                    |
| `fastModel` (niveau supérieur)     | string  | ""      | Modèle pour toutes les tâches en arrière-plan (vide = utiliser le modèle principal). Défini via `/model --fast` |

### Filtrage des ID de prompt internes

Les opérations en arrière-plan utilisent des ID de prompt dédiés (`INTERNAL_PROMPT_IDS` dans `utils/internalPromptIds.ts`) pour empêcher leur trafic API et leurs appels d'outils d'apparaître dans l'interface visible par l'utilisateur :

| Prompt ID           | Utilisé par                    |
| ------------------- | -------------------------- |
| `prompt_suggestion` | Génération de suggestion      |
| `forked_query`      | Requêtes forkées avec prise en compte du cache |
| `speculation`       | Moteur de spéculation         |

**Filtrage appliqué :**

- `loggingContentGenerator` — ignore `logApiRequest` et la journalisation des interactions OpenAI pour les ID internes
- `logApiResponse` / `logApiError` — ignore `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — ignore `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **non filtré** (garantit le suivi des tokens `/stats`)

### Mode Thinking

La réflexion/le raisonnement est explicitement désactivé (`thinkingConfig: { includeThoughts: false }`) pour tous les chemins de tâches en arrière-plan :

- **Chemin de requête forkée** (`createForkedChat`) — remplace `thinkingConfig` dans le `generationConfig` cloné, couvrant à la fois la génération de suggestion et la spéculation
- **Chemin de fallback BaseLlm** (`generateViaBaseLlm`) — la configuration par requête remplace les paramètres de réflexion du générateur de contenu de base

Cela est sûr car :

- Le préfixe de cache est déterminé par systemInstruction + tools + history, et non par `thinkingConfig` — les hits de cache ne sont pas affectés
- Tous les backends (Gemini, compatible OpenAI, Anthropic) gèrent `includeThoughts: false` en omettant le champ de réflexion — aucune erreur API sur les modèles sans support de réflexion
- La génération de suggestion et la spéculation ne tirent aucun avantage des tokens de raisonnement