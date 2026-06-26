# Design de Sugestão de Prompt (NES)

> Prevê o que o usuário digitaria naturalmente em seguida após a IA concluir uma resposta, exibindo como texto fantasma no campo de entrada.
>
> Status da implementação: `prompt-suggestion-implementation.md`. Mecanismo de especulação: `speculation-design.md`.

## Visão Geral

Uma **sugestão de prompt** (Sugestão de Próximo Passo / NES) é uma previsão curta (2-12 palavras) da próxima entrada do usuário, gerada por uma chamada de LLM após cada resposta da IA. Ela aparece como texto fantasma no campo de entrada. O usuário pode aceitá-la com Tab/Enter/Seta Direita ou descartá-la digitando.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Transição Respondendo → Ocioso                             │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Condições de Guarda (11 categorias)                 │    │
│  │  configurações, interativo, sdk, modo plano,        │    │
│  │  diálogos, elicitação, erro de API                   │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams disponível? ───┐              │    │
│  │  │                                  │               │    │
│  │  ▼ SIM                         NÃO ▼               │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (ciente de cache)      (fallback independente)    │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 regras de filtro ──────                    │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (independente de framework)     │    │
│  │  Atraso de 300ms → exibir como texto fantasma       │    │
│  │                                                     │    │
│  │  Tab    → aceitar (preencher entrada)               │    │
│  │  Enter  → aceitar + enviar                          │    │
│  │  Direita → aceitar (preencher entrada)              │    │
│  │  Digitar → descartar + abortar especulação          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Telemetria (PromptSuggestionEvent)                 │    │
│  │  resultado, método_aceite, tempo, similaridade,     │    │
│  │  tecla_pressionada, foco, motivo_supressão, id_prompt│   │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Geração da Sugestão

### Prompt do LLM

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

| Regra               | Exemplo bloqueado                                |
| ------------------- | ------------------------------------------------ |
| done                | "done"                                           |
| meta_text           | "nothing found", "no suggestion", "silence"      |
| meta_wrapped        | "(silence)", "[no suggestion]"                   |
| error_message       | "api error: 500"                                 |
| prefixed_label      | "Suggestion: commit"                             |
| too_few_words       | "hmm" (mas permite "yes", "commit", "push" etc.) |
| too_many_words      | > 12 palavras                                    |
| too_long            | >= 100 caracteres                                |
| multiple_sentences  | "Run tests. Then commit."                        |
| has_formatting      | quebras de linha, negrito markdown               |
| evaluative          | "looks good", "thanks" (com \b boundaries)       |
| ai_voice            | "Let me...", "I'll...", "Here's..."              |

### Condições de Guarda

**useEffect do AppContainer (13 verificações no código):**

| Guarda                    | Verificação                                          |
| ------------------------- | ---------------------------------------------------- |
| Alternância de config.    | `enableFollowupSuggestions`                          |
| Não interativo            | `config.isInteractive()`                             |
| Modo SDK                  | `!config.getSdkMode()`                               |
| Transição de streaming    | `Respondendo → Ocioso` (2 verificações)              |
| Erro de API (histórico)   | `historyManager.history[last]?.type !== 'error'`     |
| Erro de API (pendente)    | `!pendingGeminiHistoryItems.some(type === 'error')`  |
| Diálogos de confirmação   | shell + geral + detecção de loop (3 verificações)    |
| Diálogo de permissão      | `isPermissionsDialogOpen`                            |
| Elicitação                | `settingInputRequests.length === 0`                  |
| Modo plano                | `ApprovalMode.PLAN`                                  |

**Dentro de generatePromptSuggestion():**

| Guarda              | Verificação       |
| ------------------- | ----------------- |
| Início da conversa  | `modelTurns < 2`  |

**Flags de funcionalidade separadas (não no bloco de guarda):**

| Flag                  | Controla                                                   |
| --------------------- | ----------------------------------------------------------- |
| `enableCacheSharing`  | Se usa consulta bifurcada ou fallback para generateJson     |
| `enableSpeculation`   | Se inicia especulação ao exibir sugestão                    |

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

Controlador independente de framework compartilhado entre CLI (Ink) e WebUI (React):

- `setSuggestion(text)` — exibição com atraso de 300ms, null limpa imediatamente
- `accept(method)` — limpa estado, dispara `onAccept` via microtask, trava de debounce de 100ms
- `dismiss()` — limpa estado, registra telemetria `ignored`
- `clear()` — reset completo de todo estado + timers
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` previne mutação acidental

## Interação por Teclado

| Tecla        | CLI                          | WebUI                                |
| ------------ | ---------------------------- | ------------------------------------ |
| Tab          | Preencher entrada (sem envio)| Preencher entrada (sem envio)        |
| Enter        | Preencher + enviar           | Preencher + enviar (`explicitText`)  |
| Seta Direita | Preencher entrada (sem envio)| Preencher entrada (sem envio)        |
| Digitação    | Descartar + abortar especulação | Descartar                          |
| Colar        | Descartar + abortar especulação | Descartar                          |

### Nota sobre Atalhos de Teclado

O manipulador de Tab usa `key.name === 'tab'` explicitamente (não o matcher `ACCEPT_SUGGESTION`) porque `ACCEPT_SUGGESTION` também corresponde a Enter, que precisa ser tratado pelo manipulador SUBMIT.

## Telemetria

### PromptSuggestionEvent

| Campo                       | Tipo                        | Descrição                            |
| --------------------------- | --------------------------- | ------------------------------------ |
| outcome                     | accepted/ignored/suppressed | Resultado final                      |
| prompt_id                   | string                      | Padrão: 'user_intent'                |
| accept_method               | tab/enter/right             | Como o usuário aceitou               |
| time_to_accept_ms           | number                      | Tempo da exibição até aceitar        |
| time_to_ignore_ms           | number                      | Tempo da exibição até descartar      |
| time_to_first_keystroke_ms  | number                      | Tempo até primeira tecla enquanto exibido |
| suggestion_length           | number                      | Contagem de caracteres               |
| similarity                  | number                      | 1.0 para aceite, 0.0 para ignorar    |
| was_focused_when_shown      | boolean                     | Terminal estava em foco              |
| reason                      | string                      | Para suprimido: nome da regra de filtro |

### SpeculationEvent

| Campo                    | Tipo                    | Descrição                |
| ------------------------ | ----------------------- | ------------------------ |
| outcome                  | accepted/aborted/failed | Resultado da especulação |
| turns_used               | number                  | Round-trips de API       |
| files_written            | number                  | Arquivos no overlay      |
| tool_use_count           | number                  | Ferramentas executadas   |
| duration_ms              | number                  | Tempo real decorrido     |
| boundary_type            | string                  | O que parou a especulação|
| had_pipelined_suggestion | boolean                 | Próxima sugestão gerada  |

## Flags de Funcionalidade e Configurações

| Configuração                  | Tipo    | Padrão | Descrição                                           |
| ----------------------------- | ------- | ------ | --------------------------------------------------- |
| `enableFollowupSuggestions`   | boolean | true   | Alternância principal para sugestões de prompt      |
| `enableCacheSharing`          | boolean | true   | Usa consultas bifurcadas cientes de cache           |
| `enableSpeculation`           | boolean | false  | Mecanismo de execução preditiva                     |
| `fastModel` (top-level)       | string  | ""     | Modelo para tarefas em segundo plano (vazio = modelo principal). Definido via `/model --fast` |

### Filtragem Interna de ID de Prompt

Operações em segundo plano usam IDs de prompt dedicados (`INTERNAL_PROMPT_IDS` em `utils/internalPromptIds.ts`) para evitar que seu tráfego de API e chamadas de ferramenta apareçam na interface visível ao usuário:

| ID do Prompt      | Usado por                    |
| ----------------- | ---------------------------- |
| `prompt_suggestion` | Geração de sugestão         |
| `forked_query`      | Consultas bifurcadas cientes de cache |
| `speculation`       | Mecanismo de especulação    |

**Filtragem aplicada:**

- `loggingContentGenerator` — pula `logApiRequest` e registro de interação OpenAI para IDs internos
- `logApiResponse` / `logApiError` — pula `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — pula `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **não filtrado** (garante que o rastreamento de tokens `/stats` funcione)

### Modo de Raciocínio (Thinking)

O modo de raciocínio é explicitamente desabilitado (`thinkingConfig: { includeThoughts: false }`) para todos os caminhos de tarefas em segundo plano:

- **Caminho de consulta bifurcada** (`createForkedChat`) — sobrescreve `thinkingConfig` no `generationConfig` clonado, cobrindo tanto geração de sugestão quanto especulação
- **Caminho de fallback BaseLlm** (`generateViaBaseLlm`) — configuração por requisição sobrescreve as configurações de raciocínio do gerador de conteúdo base

Isso é seguro porque:

- O prefixo de cache é determinado por systemInstruction + tools + history, não por `thinkingConfig` — os hits de cache não são afetados
- Todos os backends (Gemini, compatível com OpenAI, Anthropic) lidam com `includeThoughts: false` omitindo o campo de raciocínio — sem erros de API em modelos sem suporte a raciocínio
- A geração de sugestão e a especulação não se beneficiam de tokens de raciocínio