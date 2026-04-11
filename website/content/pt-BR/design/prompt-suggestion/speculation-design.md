# Design do Motor de Especulação

> Executa especulativamente a sugestão antes da confirmação do usuário, usando isolamento de arquivos com copy-on-write. Os resultados aparecem instantaneamente quando o usuário pressiona Tab.

## Overview

Quando uma sugestão de prompt é exibida, o **motor de especulação** inicia imediatamente sua execução em segundo plano usando um GeminiChat em fork. As gravações de arquivo são direcionadas a um diretório de overlay temporário. Se o usuário aceitar a sugestão, os arquivos do overlay são copiados para o sistema de arquivos real e a conversa especulada é injetada no histórico principal do chat. Se o usuário digitar outra coisa, a especulação é abortada e o overlay é limpo.

## Architecture

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

## Copy-on-Write Overlay

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

## Tool Gate Security

| Ferramenta                                                   | Ação     | Condição                                     |
| ------------------------------------------------------------ | -------- | -------------------------------------------- |
| read_file, grep, glob, ls, lsp                               | allow    | Caminhos de leitura resolvidos via overlay   |
| edit, write_file                                             | redirect | Apenas no modo de aprovação auto-edit / yolo |
| edit, write_file                                             | boundary | No modo de aprovação padrão / plan           |
| shell                                                        | allow    | `isShellCommandReadOnlyAST()` retorna true   |
| shell                                                        | boundary | Comandos não somente leitura                 |
| web_fetch, web_search                                        | boundary | Requisições de rede exigem consentimento do usuário |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode   | boundary | Não é possível interagir com o usuário durante a especulação |
| Ferramentas desconhecidas / MCP                              | boundary | Padrão seguro                                |

### Path Rewrite

- **Ferramentas de escrita**: `rewritePathArgs()` redireciona `file_path` para o overlay via `overlayFs.redirectWrite()`
- **Ferramentas de leitura**: `resolveReadPaths()` redireciona `file_path` para o overlay via `overlayFs.resolveReadPath()` se já tiver sido gravado
- **Falha no redirecionamento**: Tratada como boundary (ex.: caminho absoluto fora do cwd gera erro em `redirectWrite`)

## Boundary Handling

Quando um boundary é atingido no meio de um turno:

1. Chamadas de ferramenta já executadas são preservadas (rastreamento por índice, não por nome)
2. Chamadas de função não executadas são removidas da mensagem do modelo
3. Respostas parciais de ferramentas são adicionadas ao histórico
4. `ensureToolResultPairing()` valida a completude antes da injeção

## Pipelined Suggestion

Após a conclusão da especulação (sem boundary), uma segunda chamada ao LLM gera a **próxima** sugestão:

```
Context: original conversation + "commit this" + speculated messages
→ LLM predicts: "push it"
→ Stored in state.pipelinedSuggestion
→ On accept: setPromptSuggestion("push it") — appears instantly
```

Isso permite fluxos de trabalho Tab-Tab-Tab, em que cada aceitação exibe imediatamente a próxima etapa.

A sugestão em pipeline reutiliza a constante exportada `SUGGESTION_PROMPT` de `suggestionGenerator.ts` (não uma cópia local) para garantir qualidade consistente com as sugestões iniciais.

## Fast Model

`startSpeculation` aceita um parâmetro opcional `options.model`, propagado por `runSpeculativeLoop` e `generatePipelinedSuggestion` até `runForkedQuery`. Configurado pela definição de nível superior `fastModel` (vazio = usa o modelo principal). O mesmo `fastModel` é usado para todas as tarefas em segundo plano: geração de sugestões, especulação e sugestões em pipeline. Definido via `/model --fast <name>` ou `settings.json`.

## UI Rendering

Quando a especulação é concluída, `acceptSpeculation` renderiza os resultados via `historyManager.addItem()`:

- **Mensagens do usuário**: renderizadas como itens `type: 'user'`
- **Texto do modelo**: renderizado como itens `type: 'gemini'`
- **Chamadas de ferramenta**: renderizadas como itens `type: 'tool_group'` com entradas estruturadas `IndividualToolCallDisplay` (nome da ferramenta, descrição do argumento, texto do resultado, status)

Isso exibe ao usuário a saída completa da especulação, incluindo detalhes das chamadas de ferramenta, e não apenas texto simples.

## Forked Query (Cache Sharing)

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
- Limpo em `startChat()` / `resetChat()` para evitar vazamento entre sessões
- Histórico truncado para 40 entradas; `createForkedChat` usa cópias superficiais (os parâmetros já são snapshots clonados profundamente)
- Modo de raciocínio explicitamente desativado (`thinkingConfig: { includeThoughts: false }`) — tokens de raciocínio não são necessários para especulação e aumentariam custo/latência desnecessariamente. Isso não afeta a correspondência de prefixo de cache (determinada apenas por systemInstruction + tools + history)
- Detecção de versão via comparação `JSON.stringify` de systemInstruction + tools

### Cache Mechanism

O DashScope já habilita o cache de prefixo via:

- Cabeçalho `X-DashScope-CacheControl: enable`
- Anotações `cache_control: { type: 'ephemeral' }` em mensagens e ferramentas

A instância `GeminiChat` em fork usa o mesmo `generationConfig` (incluindo ferramentas) e prefixo de histórico, portanto o mecanismo de cache existente do DashScope gera acertos de cache automaticamente.

## Constants

| Constante                | Valor | Descrição                                |
| ------------------------ | ----- | ---------------------------------------- |
| MAX_SPECULATION_TURNS    | 20    | Número máximo de round-trips da API      |
| MAX_SPECULATION_MESSAGES | 100   | Número máximo de mensagens no histórico especulado |
| SUGGESTION_DELAY_MS      | 300   | Atraso antes de exibir a sugestão        |
| ACCEPT_DEBOUNCE_MS       | 100   | Lock de debounce para aceitações rápidas |
| MAX_HISTORY_FOR_CACHE    | 40    | Entradas de histórico salvas em CacheSafeParams |

## File Structure

```
packages/core/src/followup/
├── followupState.ts          # Controlador de estado agnóstico a framework
├── suggestionGenerator.ts    # Geração de sugestões baseada em LLM + 12 regras de filtro
├── forkedQuery.ts            # Infraestrutura de consulta em fork com suporte a cache
├── overlayFs.ts              # Sistema de arquivos overlay com copy-on-write
├── speculationToolGate.ts    # Aplicação de boundary de ferramentas
├── speculation.ts            # Motor de especulação (start/accept/abort)
└── index.ts                  # Exportações do módulo
```