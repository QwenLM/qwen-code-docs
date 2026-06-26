# Design do Motor de Especulação

> Executa especulativamente a sugestão aceita antes da confirmação do usuário, usando isolamento de arquivos copy-on-write. Os resultados aparecem instantaneamente quando o usuário pressiona Tab.

## Visão Geral

Quando uma sugestão de prompt é mostrada, o **motor de especulação** imediatamente começa a executá-la em segundo plano usando um GeminiChat forkado. As gravações de arquivos vão para um diretório overlay temporário. Se o usuário aceitar a sugestão, os arquivos overlay são copiados para o sistema de arquivos real e a conversa especulada é injetada no histórico principal do chat. Se o usuário digitar outra coisa, a especulação é abortada e o overlay é limpo.

## Arquitetura

```
User sees suggestion "commit this"
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  startSpeculation()                                          │
│                                                              │
│  ┌─────────────────┐    ┌────────────────────┐               │
│  │ Forked GeminiChat│    │  OverlayFs          │              │
│  │ (cache-shared)   │    │  /tmp/qwen-         │              │
│  │                  │    │   speculation/       │              │
│  │  systemInstruction│   │   {pid}/{id}/        │              │
│  │  + tools          │   │                      │              │
│  │  + history prefix │   │  COW: first write    │              │
│  │                  │    │  copies original     │              │
│  └────────┬─────────┘    └──────────┬───────────┘             │
│           │                         │                         │
│           ▼                         │                         │
│  ┌──────────────────────────────────┴──────────────────────┐  │
│  │  Speculative Loop (max 20 turns, 100 messages)          │  │
│  │                                                         │  │
│  │  Model response                                         │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  speculationToolGate                             │   │  │
│  │  │                                                  │   │  │
│  │  │  Read/Grep/Glob/LS/LSP → allow (+ overlay read) │   │  │
│  │  │  Edit/WriteFile → redirect to overlay            │   │  │
│  │  │    (only in auto-edit/yolo mode)                 │   │  │
│  │  │  Shell → AST check read-only? allow : boundary   │   │  │
│  │  │  WebFetch/WebSearch → boundary                   │   │  │
│  │  │  Agent/Skill/Memory/Ask → boundary               │   │  │
│  │  │  Unknown/MCP → boundary                          │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  Tool execution: toolRegistry.getTool → build → execute │  │
│  │  (bypasses CoreToolScheduler — gated by toolGate)       │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  On completion → generatePipelinedSuggestion()               │
└──────────────────────────────────────────────────────────────┘
           │
           │  User presses Tab / Enter
           ▼
     ┌─── status === 'completed'? ───┐
     │ YES                      NO (boundary) │
     ▼                                ▼
┌─────────────────────────┐  ┌────────────────────────┐
│  acceptSpeculation()    │  │  Discard speculation    │
│                         │  │  abort + cleanup        │
│  1. applyToReal()       │  │  Submit query normally  │
│  2. ensureToolPairing() │  │  (addMessage)           │
│  3. addHistory()        │  └────────────────────────┘
│  4. render tool_group   │
│  5. cleanup overlay     │
│  6. pipelined suggest   │
└─────────────────────────┘
           │
           │  User types instead
           ▼
┌──────────────────────────────────────────────────────────────┐
│  abortSpeculation()                                          │
│                                                              │
│  1. abortController.abort() — cancel LLM call               │
│  2. overlayFs.cleanup() — delete temp directory              │
│  3. Update speculation state (no telemetry on abort)         │
└──────────────────────────────────────────────────────────────┘
```

## Overlay Copy-on-Write

```
Real CWD: /home/user/project/
Overlay:  /tmp/qwen-speculation/12345/a1b2c3d4/

Write to src/app.ts:
  1. Copy /home/user/project/src/app.ts → overlay/src/app.ts (first time only)
  2. Tool writes to overlay/src/app.ts

Read from src/app.ts:
  - If in writtenFiles → read from overlay/src/app.ts
  - Otherwise → read from /home/user/project/src/app.ts

New file (src/new.ts):
  - Create overlay/src/new.ts directly (no original to copy)

Accept:
  - copyFile(overlay/src/app.ts → /home/user/project/src/app.ts)
  - copyFile(overlay/src/new.ts → /home/user/project/src/new.ts)
  - rm -rf overlay/

Abort:
  - rm -rf overlay/
```

## Segurança do Tool Gate

| Ferramenta                                                 | Ação     | Condição                                    |
| ---------------------------------------------------------- | -------- | ------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | allow    | Caminhos de leitura resolvidos através do overlay |
| edit, write_file                                           | redirect | Apenas no modo de aprovação auto-edit / yolo      |
| edit, write_file                                           | boundary | No modo de aprovação padrão / plano               |
| shell                                                      | allow    | `isShellCommandReadOnlyAST()` retorna true        |
| shell                                                      | boundary | Comandos não somente leitura                      |
| web_fetch, web_search                                      | boundary | Requisições de rede exigem consentimento do usuário |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | boundary | Não é possível interagir com o usuário durante a especulação |
| Unknown / MCP tools                                        | boundary | Padrão seguro                                |

### Reescrita de Caminhos

- **Ferramentas de escrita**: `rewritePathArgs()` redireciona `file_path` para o overlay via `overlayFs.redirectWrite()`
- **Ferramentas de leitura**: `resolveReadPaths()` redireciona `file_path` para o overlay via `overlayFs.resolveReadPath()` se foi escrito anteriormente
- **Falha na reescrita**: Tratado como boundary (por exemplo, caminho absoluto fora do cwd gera erro em `redirectWrite`)

## Tratamento de Limites

Quando um limite é atingido no meio de um turno:

1. Chamadas de ferramentas já executadas são preservadas (rastreamento baseado em índice, não em nome)
2. Chamadas de função não executadas são removidas da mensagem do modelo
3. Respostas parciais de ferramentas são adicionadas ao histórico
4. `ensureToolResultPairing()` valida a completude antes da injeção

## Sugestão em Pipeline

Após a especulação ser concluída (sem boundary), uma segunda chamada LLM gera a **próxima** sugestão:

```
Context: original conversation + "commit this" + speculated messages
→ LLM predicts: "push it"
→ Stored in state.pipelinedSuggestion
→ On accept: setPromptSuggestion("push it") — appears instantly
```

Isso possibilita workflows Tab-Tab-Tab onde cada aceitação mostra imediatamente o próximo passo.

A sugestão em pipeline reutiliza a constante exportada `SUGGESTION_PROMPT` de `suggestionGenerator.ts` (não uma cópia local) para garantir qualidade consistente com as sugestões iniciais.

## Modelo Rápido

`startSpeculation` aceita um parâmetro opcional `options.model`, que é transmitido através de `runSpeculativeLoop` e `generatePipelinedSuggestion` para `runForkedQuery`. Configurado via a configuração de nível superior `fastModel` (vazio = usar modelo principal). O mesmo `fastModel` é usado para todas as tarefas em segundo plano: geração de sugestão, especulação e sugestões em pipeline. Definido via `/model --fast <name>` ou `settings.json`.

## Renderização da UI

Quando a especulação é concluída, `acceptSpeculation` renderiza os resultados via `historyManager.addItem()`:

- **Mensagens do usuário**: renderizadas como itens do tipo `'user'`
- **Texto do modelo**: renderizado como itens do tipo `'gemini'`
- **Chamadas de ferramenta**: renderizadas como itens do tipo `'tool_group'` com entradas estruturadas `IndividualToolCallDisplay` (nome da ferramenta, descrição do argumento, texto do resultado, status)

Isso mostra ao usuário a saída completa da especulação, incluindo detalhes das chamadas de ferramenta, não apenas texto simples.

## Consulta Forkada (Compartilhamento de Cache)

### CacheSafeParams

```typescript
interface CacheSafeParams {
  generationConfig: GenerateContentConfig; // systemInstruction + tools
  history: Content[]; // curated, max 40 entries
  model: string;
  version: number; // increments on config changes
}
```

- Salvo após cada turno principal bem-sucedido em `GeminiClient.sendMessageStream()`
- Limpado em `startChat()` / `resetChat()` para evitar vazamento entre sessões
- Histórico truncado para 40 entradas; `createForkedChat` usa cópias rasas (os parâmetros já são snapshots clonados em profundidade)
- Modo de pensamento explicitamente desabilitado (`thinkingConfig: { includeThoughts: false }`) — tokens de raciocínio não são necessários para especulação e desperdiçariam custo/latência. Isso não afeta a correspondência de prefixo do cache (determinada apenas por `systemInstruction` + `tools` + `history`)
- Detecção de versão via comparação `JSON.stringify` de `systemInstruction` + `tools`

### Mecanismo de Cache

DashScope já permite cache de prefixo via:

- Cabeçalho `X-DashScope-CacheControl: enable`
- Anotações `cache_control: { type: 'ephemeral' }` em mensagens e ferramentas

O GeminiChat forkado usa `generationConfig` idêntico (incluindo ferramentas) e prefixo de histórico, então o mecanismo de cache existente do DashScope produz acertos de cache automaticamente.

## Constantes

| Constante                 | Valor | Descrição                                    |
| ------------------------- | ----- | -------------------------------------------- |
| MAX_SPECULATION_TURNS     | 20    | Número máximo de idas e voltas da API        |
| MAX_SPECULATION_MESSAGES  | 100   | Número máximo de mensagens no histórico especulado |
| SUGGESTION_DELAY_MS       | 300   | Atraso antes de mostrar a sugestão           |
| ACCEPT_DEBOUNCE_MS        | 100   | Bloqueio de debounce para aceitações rápidas |
| MAX_HISTORY_FOR_CACHE     | 40    | Entradas de histórico salvas em CacheSafeParams |

## Estrutura de Arquivos

```
packages/core/src/followup/
├── followupState.ts          # Framework-agnostic state controller
├── suggestionGenerator.ts    # LLM-based suggestion generation + 12 filter rules
├── forkedQuery.ts            # Cache-aware forked query infrastructure
├── overlayFs.ts              # Copy-on-write overlay filesystem
├── speculationToolGate.ts    # Tool boundary enforcement
├── speculation.ts            # Speculation engine (start/accept/abort)
└── index.ts                  # Module exports
```