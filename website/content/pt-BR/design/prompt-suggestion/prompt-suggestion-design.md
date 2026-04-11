# Design de Sugestão de Prompt (NES)

> Prevê o que o usuário digitaria naturalmente em seguida após a conclusão da resposta da IA, exibindo-o como ghost text no prompt de entrada.
>
> Status da implementação: `prompt-suggestion-implementation.md`. Motor de especulação: `speculation-design.md`.

## Visão Geral

Uma **prompt suggestion** (Next-step Suggestion / NES) é uma previsão curta (2 a 12 palavras) da próxima entrada do usuário, gerada por uma chamada de LLM após cada resposta da IA. Ela aparece como ghost text no prompt de entrada. O usuário pode aceitá-la com Tab/Enter/Seta para a Direita ou descartá-la ao começar a digitar.

## Arquitetura

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

## Geração de Sugestão

### Prompt da LLM

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

### Regras de Filtro (12)

| Regra              | Exemplo bloqueado                                |
| ------------------ | ------------------------------------------------ |
| done               | "done"                                           |
| meta_text          | "nothing found", "no suggestion", "silence"      |
| meta_wrapped       | "(silence)", "[no suggestion]"                   |
| error_message      | "api error: 500"                                 |
| prefixed_label     | "Suggestion: commit"                             |
| too_few_words      | "hmm" (mas permite "yes", "commit", "push" etc.) |
| too_many_words     | > 12 palavras                                    |
| too_long           | >= 100 caracteres                                |
| multiple_sentences | "Run tests. Then commit."                        |
| has_formatting     | quebras de linha, negrito em markdown            |
| evaluative         | "looks good", "thanks" (com limites de palavra \b) |
| ai_voice           | "Let me...", "I'll...", "Here's..."              |

### Condições de Guarda

**AppContainer useEffect (13 verificações no código):**

| Guarda               | Verificação                                         |
| -------------------- | --------------------------------------------------- |
| Settings toggle      | `enableFollowupSuggestions`                         |
| Non-interactive      | `config.isInteractive()`                            |
| SDK mode             | `!config.getSdkMode()`                              |
| Streaming transition | `Responding → Idle` (2 verificações)                |
| API error (history)  | `historyManager.history[last]?.type !== 'error'`    |
| API error (pending)  | `!pendingGeminiHistoryItems.some(type === 'error')` |
| Confirmation dialogs | shell + general + loop detection (3 verificações)   |
| Permission dialog    | `isPermissionsDialogOpen`                           |
| Elicitation          | `settingInputRequests.length === 0`                 |
| Plan mode            | `ApprovalMode.PLAN`                                 |

**Dentro de `generatePromptSuggestion()`:**

| Guarda             | Verificação    |
| ------------------ | -------------- |
| Early conversation | `modelTurns < 2` |

**Feature flags separados (fora do bloco de guarda):**

| Flag                 | Controla                                                |
| -------------------- | ------------------------------------------------------- |
| `enableCacheSharing` | Se deve usar forked query ou fallback para generateJson |
| `enableSpeculation`  | Se deve iniciar a especulação na exibição da sugestão   |

## Gerenciamento de Estado

### FollowupState

```typescript
interface FollowupState {
  suggestion: string | null;
  isVisible: boolean;
  shownAt: number; // timestamp for telemetry
}
```

### FollowupController

Controlador agnóstico de framework compartilhado entre CLI (Ink) e WebUI (React):

- `setSuggestion(text)` — exibição com atraso de 300ms, `null` limpa imediatamente
- `accept(method)` — limpa o estado, dispara `onAccept` via microtask, lock de debounce de 100ms
- `dismiss()` — limpa o estado, registra telemetria `ignored`
- `clear()` — reset completo de todo o estado + timers
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` previne mutação acidental

## Interação com o Teclado

| Tecla       | CLI                         | WebUI                                |
| ----------- | --------------------------- | ------------------------------------ |
| Tab         | Preenche o input (sem submit) | Preenche o input (sem submit)        |
| Enter       | Preenche + submit           | Preenche + submit (parâmetro `explicitText`) |
| Right Arrow | Preenche o input (sem submit) | Preenche o input (sem submit)        |
| Typing      | Descarta + aborta especulação | Descarta                             |
| Paste       | Descarta + aborta especulação | Descarta                             |

### Nota sobre Key Binding

O handler do Tab usa `key.name === 'tab'` explicitamente (e não o matcher `ACCEPT_SUGGESTION`) porque `ACCEPT_SUGGESTION` também corresponde ao Enter, que precisa passar para o handler `SUBMIT`.

## Telemetria

### PromptSuggestionEvent

| Campo                      | Tipo                        | Descrição                         |
| -------------------------- | --------------------------- | ----------------------------------- |
| outcome                    | accepted/ignored/suppressed | Resultado final                     |
| prompt_id                  | string                      | Padrão: 'user_intent'               |
| accept_method              | tab/enter/right             | Como o usuário aceitou              |
| time_to_accept_ms          | number                      | Tempo entre exibição e aceite       |
| time_to_ignore_ms          | number                      | Tempo entre exibição e descarte     |
| time_to_first_keystroke_ms | number                      | Tempo até a primeira tecla pressionada enquanto visível |
| suggestion_length          | number                      | Contagem de caracteres              |
| similarity                 | number                      | 1.0 para aceite, 0.0 para ignorado  |
| was_focused_when_shown     | boolean                     | Se o terminal estava em foco        |
| reason                     | string                      | Para suprimido: nome da regra de filtro |

### SpeculationEvent

| Campo                    | Tipo                    | Descrição               |
| ------------------------ | ----------------------- | ------------------------- |
| outcome                  | accepted/aborted/failed | Resultado da especulação  |
| turns_used               | number                  | Round-trips da API        |
| files_written            | number                  | Arquivos no overlay       |
| tool_use_count           | number                  | Ferramentas executadas    |
| duration_ms              | number                  | Tempo de relógio (wall-clock) |
| boundary_type            | string                  | O que interrompeu a especulação |
| had_pipelined_suggestion | boolean                 | Próxima sugestão gerada   |

## Feature Flags e Configurações

| Configuração                | Tipo    | Padrão | Descrição                                                                      |
| --------------------------- | ------- | ------ | -------------------------------------------------------------------------------- |
| `enableFollowupSuggestions` | boolean | true   | Toggle principal para prompt suggestions                                         |
| `enableCacheSharing`        | boolean | true   | Usa forked queries com awareness de cache                                        |
| `enableSpeculation`         | boolean | false  | Motor de execução preditiva                                                      |
| `fastModel` (top-level)     | string  | ""     | Modelo para todas as tarefas em background (vazio = usa o modelo principal). Definido via `/model --fast` |

### Filtragem de Internal Prompt ID

Operações em background usam prompt IDs dedicados (`INTERNAL_PROMPT_IDS` em `utils/internalPromptIds.ts`) para evitar que seu tráfego de API e chamadas de ferramentas apareçam na UI visível ao usuário:

| Prompt ID           | Usado por                    |
| ------------------- | ---------------------------- |
| `prompt_suggestion` | Geração de sugestão          |
| `forked_query`      | Forked queries com awareness de cache |
| `speculation`       | Motor de especulação         |

**Filtragem aplicada:**

- `loggingContentGenerator` — ignora `logApiRequest` e logging de interação OpenAI para IDs internos
- `logApiResponse` / `logApiError` — ignora `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — ignora `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **não filtrado** (garante que o tracking de tokens do `/stats` funcione)

### Thinking Mode

Thinking/reasoning é explicitamente desabilitado (`thinkingConfig: { includeThoughts: false }`) para todos os caminhos de tarefas em background:

- **Forked query path** (`createForkedChat`) — sobrescreve `thinkingConfig` no `generationConfig` clonado, cobrindo tanto a geração de sugestão quanto a especulação
- **BaseLlm fallback path** (`generateViaBaseLlm`) — config por requisição sobrescreve as configurações de thinking do content generator base

Isso é seguro porque:

- O prefixo do cache é determinado por `systemInstruction` + `tools` + `history`, e não por `thinkingConfig` — cache hits não são afetados
- Todos os backends (Gemini, OpenAI-compatible, Anthropic) tratam `includeThoughts: false` omitindo o campo thinking — sem erros de API em modelos sem suporte a thinking
- A geração de sugestão e a especulação não se beneficiam de reasoning tokens