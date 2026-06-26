# Conception de la suggestion de prompt (NES)

> Prédit ce que l’utilisateur taperait naturellement ensuite après la réponse de l’IA, et l’affiche sous forme de texte fantôme dans la zone de saisie.
>
> État d’implémentation : `prompt-suggestion-implementation.md`. Moteur de spéculation : `speculation-design.md`.

## Vue d’ensemble

Une **suggestion de prompt** (suggestion de prochaine étape / NES) est une courte prédiction (2-12 mots) de la prochaine saisie de l’utilisateur, générée par un appel LLM après chaque réponse de l’IA. Elle apparaît sous forme de texte fantôme dans la zone de saisie. L’utilisateur peut l’accepter avec Tab/Entrée/Flèche droite ou la rejeter en commençant à taper.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Transition Répondre → Inactif                              │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Conditions de garde (11 catégories)                 │    │
│  │  settings, interactive, sdk, plan mode, dialogs,    │    │
│  │  elicitation, API error                             │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams disponibles ? ───┐            │    │
│  │  │                                  │               │    │
│  │  ▼ OUI                         NON ▼               │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (conscient du cache)         (fallback autonome)   │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 règles de filtrage ────                    │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (indépendant du framework)       │    │
│  │  Délai de 300 ms → affichage en texte fantôme       │    │
│  │                                                     │    │
│  │  Tab    → accepter (remplit la saisie)              │    │
│  │  Entrée → accepter + soumettre                      │    │
│  │  Droite → accepter (remplit la saisie)              │    │
│  │  Saisie → rejeter + abandonner la spéculation       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Télémétrie (PromptSuggestionEvent)                 │    │
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

| Règle               | Exemple bloqué                                    |
| ------------------- | ------------------------------------------------- |
| done                | « fait »                                          |
| meta_text           | « rien trouvé », « pas de suggestion », « silence » |
| meta_wrapped        | « (silence) », « [pas de suggestion] »            |
| error_message       | « erreur api : 500 »                               |
| prefixed_label      | « Suggestion : commit »                           |
| too_few_words       | « hmm » (mais autorise « oui », « commit », « push », etc.) |
| too_many_words      | > 12 mots                                          |
| too_long            | >= 100 caractères                                  |
| multiple_sentences  | « Exécute les tests. Ensuite, commit. »            |
| has_formatting      | sauts de ligne, gras Markdown                     |
| evaluative          | « semble bon », « merci » (avec limites de mot \b) |
| ai_voice            | « Laissez-moi… », « Je vais… », « Voici… »        |

### Conditions de garde

**useEffect d’AppContainer (13 vérifications dans le code) :**

| Garde                    | Vérification                                          |
| ----------------------- | ----------------------------------------------------- |
| Activation réglage      | `enableFollowupSuggestions`                           |
| Non interactif          | `config.isInteractive()`                              |
| Mode SDK                | `!config.getSdkMode()`                                |
| Transition streaming    | `Répondre → Inactif` (2 vérifications)                |
| Erreur API (historique) | `historyManager.history[last]?.type !== 'error'`      |
| Erreur API (en attente) | `!pendingGeminiHistoryItems.some(type === 'error')`   |
| Boîtes de dialogue de confirmation | shell + général + détection de boucle (3 vérifications) |
| Dialogue d’autorisation | `isPermissionsDialogOpen`                             |
| Élicitation             | `settingInputRequests.length === 0`                   |
| Mode plan               | `ApprovalMode.PLAN`                                   |

**Dans generatePromptSuggestion() :**

| Garde                     | Vérification       |
| ------------------------- | ----------------- |
| Début de conversation     | `modelTurns < 2`  |

**Indicateurs de fonctionnalité distincts (pas dans le bloc de garde) :**

| Indicateur              | Contrôle                                                    |
| ----------------------- | ----------------------------------------------------------- |
| `enableCacheSharing`    | Utiliser une requête forkée ou recourir à generateJson      |
| `enableSpeculation`     | Démarrer la spéculation à l’affichage de la suggestion      |

## Gestion d’état

### FollowupState

```typescript
interface FollowupState {
  suggestion: string | null;
  isVisible: boolean;
  shownAt: number; // timestamp pour la télémétrie
}
```

### FollowupController

Contrôleur indépendant du framework, partagé entre le CLI (Ink) et la WebUI (React) :

- `setSuggestion(text)` — affichage différé de 300 ms, null efface immédiatement
- `accept(method)` — efface l’état, déclenche `onAccept` via microtask, verrou anti-rebond de 100 ms
- `dismiss()` — efface l’état, enregistre une télémétrie `ignored`
- `clear()` — réinitialisation complète de tout état + temporisateurs
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` empêche toute mutation accidentelle

## Interaction clavier

| Touche        | CLI                          | WebUI                                |
| ------------- | ---------------------------- | ------------------------------------ |
| Tab           | Remplit la saisie (sans envoi) | Remplit la saisie (sans envoi)      |
| Entrée        | Remplit + envoie             | Remplit + envoie (paramètre `explicitText`) |
| Flèche droite | Remplit la saisie (sans envoi) | Remplit la saisie (sans envoi)      |
| Saisie        | Rejette + abandonne la spéculation | Rejette                             |
| Coller        | Rejette + abandonne la spéculation | Rejette                             |

### Note sur la liaison des touches

Le gestionnaire Tab utilise explicitement `key.name === 'tab'` (pas le sélecteur `ACCEPT_SUGGESTION`) car `ACCEPT_SUGGESTION` correspond aussi à Entrée, qui doit être transmis au gestionnaire SOUMETTRE.

## Télémétrie

### PromptSuggestionEvent

| Champ                       | Type                        | Description                            |
| --------------------------- | --------------------------- | -------------------------------------- |
| outcome                     | accepted / ignored / suppressed | Résultat final                       |
| prompt_id                   | string                      | Par défaut : 'user_intent'             |
| accept_method               | tab / enter / right         | Comment l’utilisateur a accepté        |
| time_to_accept_ms           | number                      | Temps entre l’affichage et l’acceptation |
| time_to_ignore_ms           | number                      | Temps entre l’affichage et le rejet    |
| time_to_first_keystroke_ms  | number                      | Temps avant la première frappe pendant l’affichage |
| suggestion_length           | number                      | Nombre de caractères                   |
| similarity                  | number                      | 1.0 pour acceptation, 0.0 pour rejet   |
| was_focused_when_shown      | boolean                     | Le terminal avait le focus             |
| reason                      | string                      | Pour suppressed : nom de la règle de filtrage |

### SpeculationEvent

| Champ                      | Type                    | Description                     |
| -------------------------- | ----------------------- | ------------------------------- |
| outcome                    | accepted / aborted / failed | Résultat de la spéculation   |
| turns_used                 | number                  | Allers-retours API              |
| files_written              | number                  | Fichiers dans le calque         |
| tool_use_count             | number                  | Outils exécutés                 |
| duration_ms                | number                  | Temps réel écoulé               |
| boundary_type              | string                  | Ce qui a arrêté la spéculation  |
| had_pipelined_suggestion   | boolean                 | Suggestion suivante générée     |

## Indicateurs de fonctionnalité et réglages

| Réglage                      | Type    | Défaut | Description                                                |
| ---------------------------- | ------- | ------ | ---------------------------------------------------------- |
| `enableFollowupSuggestions`  | boolean | true   | Interrupteur principal pour les suggestions de prompt      |
| `enableCacheSharing`         | boolean | true   | Utiliser des requêtes forkées conscientes du cache         |
| `enableSpeculation`          | boolean | false  | Moteur d’exécution prédictive                              |
| `fastModel` (niveau supérieur) | string | ""     | Modèle pour toutes les tâches en arrière‑plan (vide = modèle principal). Défini via `/model --fast` |

### Filtrage interne par ID de prompt

Les opérations en arrière‑plan utilisent des ID de prompt dédiés (`INTERNAL_PROMPT_IDS` dans `utils/internalPromptIds.ts`) pour éviter que leur trafic API et leurs appels d’outils n’apparaissent dans l’interface utilisateur visible :

| ID de prompt    | Utilisé par                        |
| --------------- | ---------------------------------- |
| `prompt_suggestion` | Génération de la suggestion       |
| `forked_query`  | Requêtes forkées conscientes du cache |
| `speculation`   | Moteur de spéculation             |

**Filtrage appliqué :**

- `loggingContentGenerator` — ignore `logApiRequest` et la journalisation des interactions OpenAI pour les ID internes
- `logApiResponse` / `logApiError` — ignore `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — ignore `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **non filtré** (garantit le suivi des tokens `/stats`)

### Mode réflexion

La réflexion/le raisonnement est explicitement désactivé (`thinkingConfig: { includeThoughts: false }`) pour tous les chemins de tâches en arrière‑plan :

- **Chemin de requête forkée** (`createForkedChat`) — remplace `thinkingConfig` dans le `generationConfig` cloné, couvrant à la fois la génération de suggestion et la spéculation
- **Chemin de repli BaseLlm** (`generateViaBaseLlm`) — la configuration par requête remplace les réglages de réflexion du générateur de contenu de base

Ceci est sûr car :

- Le préfixe de cache est déterminé par systemInstruction + outils + historique, pas par `thinkingConfig` — les hits de cache ne sont pas affectés
- Tous les backends (Gemini, compatible OpenAI, Anthropic) gèrent `includeThoughts: false` en omettant le champ de réflexion — pas d’erreur API sur les modèles sans support de réflexion
- La génération de suggestion et la spéculation ne bénéficient pas des tokens de raisonnement