# Design do Título da Sessão

> Um título de sessão em sentence case com 3 a 7 palavras, gerado pelo modelo rápido após a primeira resposta do assistente. Persistido no JSONL da sessão com uma tag `titleSource: 'auto' | 'manual'`, exibido no seletor de sessões e regenerável sob demanda via `/rename --auto`.

## Overview

O comando `/rename` (#3093) permite que um usuário rotule uma sessão para encontrá-la novamente no seletor mais tarde, mas até que ele o execute, o seletor mostra o primeiro prompt do usuário — frequentemente truncado no meio da frase ou descrevendo uma pergunta inicial em vez do que a sessão realmente se tornou. Renomear manualmente é um atrito opcional que a maioria dos usuários nunca faz.

O objetivo é tornar os nomes das sessões _úteis por padrão_:

- **Descritivo** do que a sessão realmente realizou, não apenas a linha inicial. 3 a 7 palavras, sentence case, estilo de assunto de commit do git.
- **Best-effort**: executado em segundo plano após a primeira resposta; se falhar, o usuário nunca verá um erro.
- **Respeitoso com o usuário**: nunca sobrescreve um título definido via `/rename` que o usuário escolheu deliberadamente, mesmo entre abas do CLI na mesma sessão.
- **Explicitamente regenerável** via `/rename --auto` para o caso de "o título automático ficou desatualizado / quero um novo".

## Triggers

| Gatilho    | Condições                                                                                                                                                          | Implementação                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Automático**   | Após o disparo de `recordAssistantTurn`. Ignorado se um título existente estiver definido, outra tentativa estiver em andamento, o limite for atingido, modo não interativo, desabilitado por env ou sem modelo rápido. | `ChatRecordingService.maybeTriggerAutoTitle` — fire-and-forget |
| **Manual** | Usuário executa `/rename --auto`                                                                                                                                          | `renameCommand.ts` via `tryGenerateSessionTitle`               |

Ambos os caminhos convergem para uma única função — `tryGenerateSessionTitle(config, signal)` — para garantir prompt, schema, seleção de modelo e sanitização idênticos. O gatilho automático é uma chamada em segundo plano do tipo best-effort; o `/rename --auto` manual é uma ação de usuário bloqueante que exibe um erro específico com o motivo em caso de falha.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        packages/core/src/services/                      │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ chatRecordingService.ts  │                                           │
│  │                          │                                           │
│  │  recordAssistantTurn()   │                                           │
│  │     │                    │                                           │
│  │     ↓                    │                                           │
│  │  maybeTriggerAutoTitle() │── 6 guards ──→ IIFE(autoTitleController)  │
│  │     │                    │                       │                   │
│  │     └── resume hydrate   │                       ↓                   │
│  │         via              │          tryGenerateSessionTitle          │
│  │         getSessionTitle- │          (sessionTitle.ts)                │
│  │         Info             │                       │                   │
│  │                          │                       ↓                   │
│  └──────────────────────────┘          BaseLlmClient.generateJson       │
│                                        (fastModel + JSON schema)        │
│                                                       │                 │
│  ┌──────────────────────────┐                         ↓                 │
│  │ sessionService.ts        │         sanitizeTitle + sanity checks     │
│  │                          │                         │                 │
│  │  getSessionTitleInfo()   │◀── cross-process        ↓                 │
│  │      uses                │    re-read             recordCustomTitle  │
│  │  readLastJsonString-     │    before write        (…, 'auto')        │
│  │  FieldsSync              │                                           │
│  │  (sessionStorageUtils)   │                                           │
│  └──────────────────────────┘                                           │
│                                                                         │
│                          ┌─────────────────────┐                        │
│                          │ utils/terminalSafe  │                        │
│                          │ stripTerminalCtrl-  │                        │
│                          │ Sequences           │                        │
│                          └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     packages/cli/src/ui/                                │
│                                                                         │
│  commands/renameCommand.ts     ─── /rename <name>          → manual      │
│                                ─── /rename                 → kebab       │
│                                ─── /rename --auto          → auto       │
│                                ─── /rename -- --literal    → manual     │
│                                ─── /rename --unknown-flag  → error      │
│                                                                         │
│  components/SessionPicker.tsx  ── dims rows where                       │
│                                   session.titleSource === 'auto'        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Files

| Arquivo                                                 | Responsabilidade                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionTitle.ts`         | Chamada LLM one-shot + filtro de histórico + sanitização. Exporta `tryGenerateSessionTitle`.  |
| `packages/core/src/services/chatRecordingService.ts` | Gatilho `maybeTriggerAutoTitle`, guards, re-leitura cross-process, abort-on-finalize. |
| `packages/core/src/services/sessionService.ts`       | Acessor público `getSessionTitleInfo`; `renameSession` aceita `titleSource`.      |
| `packages/core/src/utils/sessionStorageUtils.ts`     | Leitor atômico de pares `extractLastJsonStringFields` + `readLastJsonStringFieldsSync`. |
| `packages/core/src/utils/terminalSafe.ts`            | `stripTerminalControlSequences` compartilhado pelos caminhos sentence-case e kebab.           |
| `packages/cli/src/ui/commands/renameCommand.ts`      | `/rename --auto`, parser sentinel, mapa de mensagens de motivo de falha.                     |
| `packages/cli/src/ui/components/SessionPicker.tsx`   | Estilo esmaecido para `titleSource === 'auto'`.                                          |

## Prompt Design

### System Prompt

Substitui o prompt do sistema do agente principal apenas para esta chamada, para que o modelo tente apenas rotular a sessão, e não se comportar como um assistente de programação.

Os itens abaixo correspondem 1:1 com `TITLE_SYSTEM_PROMPT`:

- 3 a 7 palavras, sentence case (apenas a primeira palavra e nomes próprios em maiúscula).
- Sem pontuação final, sem markdown, sem aspas.
- Corresponder ao idioma dominante da conversa; para chinês, reservar aproximadamente 12 a 20 caracteres.
- Ser específico sobre o objetivo real do usuário — nomear a feature, bug ou área de assunto. Evitar termos vagos como "Code changes" ou "Help request".
- Quatro bons exemplos (três em inglês + um em chinês) e quatro exemplos ruins (muito vago / muito longo / case incorreto / pontuação final).
- Retornar apenas um objeto JSON com uma única chave `title`.

### Structured Output (JSON schema)

Em vez de envolver a saída em tags (como o session-recap faz), usamos `BaseLlmClient.generateJson` com um schema de function calling:

```ts
const TITLE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description:
        'A concise sentence-case session title, 3-7 words, no trailing punctuation.',
    },
  },
  required: ['title'],
};
```

Por que function calling em vez de texto livre + extração de tags:

1. Confiabilidade cross-provider — endpoints compatíveis com OpenAI, Gemini e o tool-calling nativo do Qwen implementam function calling; o parsing de tags dependeria de cada modelo respeitar uma convenção de texto.
2. Sem vazamento de preâmbulo de raciocínio — os argumentos da chamada de função retornam estruturados, então um parágrafo de "thinking" antes da resposta não pode vazar para o título.
3. Pós-processamento mais simples — uma única verificação `typeof result.title === 'string'` mais `sanitizeTitle` cobre qualquer desvio realista do modelo.

O modelo ainda pode retornar algo que o schema permite, mas a UX rejeita (string vazia, apenas espaços, 500 chars, markdown fencing, control chars). `sanitizeTitle` lida com todos esses casos e retorna `''` → o serviço retorna `{ok: false, reason: 'empty_result'}`.

### Call Parameters

| Parâmetro         | Valor                          | Motivo                                                                                          |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `model`           | `getFastModel()` — sem fallback | Gerar títulos automaticamente com tokens do modelo principal é caro demais para ser silencioso.                                |
| `schema`          | `TITLE_SCHEMA`                 | Força `{title: string}`; filtra desvios de estrutura na camada de transporte.                           |
| `maxOutputTokens` | `100`                          | Mais do que suficiente para 7 palavras mais o overhead do schema.                                              |
| `temperature`     | `0.2`                          | Majoritariamente determinístico — títulos de sessão se beneficiam da estabilidade entre regenerações.               |
| `maxAttempts`     | `1`                            | Títulos são metadados cosméticos do tipo best-effort; retentivas ficariam na fila atrás do tráfego principal visível ao usuário. |

Em contraste com o session-recap, que faz fallback para o modelo principal. A geração de título é acionada automaticamente e frequentemente; gastar tokens do modelo principal silenciosamente sem opt-in do usuário é uma surpresa real na fatura. O `/rename --auto` manual falha explicitamente com `no_fast_model` em vez de fazer fallback — forçando o usuário a escolher o modelo rápido de forma consciente.

## History Filtering

`geminiClient.getChat().getHistory()` retorna `Content[]` que inclui tool calls, tool responses (frequentemente 10K+ tokens de conteúdo de arquivo) e partes de thought do modelo. Alimentar isso diretamente no LLM de título enviesaria o rótulo para ruído de implementação como "Called grep on auth module".

`filterToDialog` mantém apenas entradas `user` / `model` com texto não vazio e sem partes `thought` / `thoughtSignature`. `takeRecentDialog` fatia para as últimas 20 mensagens e se recusa a começar em uma resposta pendente de modelo/ferramenta. `flattenToTail` converte para linhas "Role: text" e fatia os últimos 1000 caracteres.

### The 1000-character tail slice

Uma sessão que começa com `help me debug X` mas muda para refatorar Y deve ter um título sobre Y. Titular pelo início trava o contexto inicial; titular pela cauda captura o que a sessão realmente se tornou.

### UTF-16 surrogate handling

`.slice(-1000)` em um limite de code-unit UTF-16 pode isolar um surrogate alto ou baixo se um caractere suplementar CJK ou emoji for cortado. Alguns provedores respondem ao UTF-16 inválido resultante com um 400 — o que, sem tratamento, consumiria uma tentativa sem motivo. `flattenToTail` descarta um surrogate baixo isolado no início; `sanitizeTitle` também limpa qualquer surrogate isolado após o corte de comprimento máximo no caminho de saída.

## Persistence

### Record shape

`CustomTitleRecordPayload` ganha um campo opcional `titleSource: 'auto' | 'manual'`:

```jsonc
{
  "type": "system",
  "subtype": "custom_title",
  "systemPayload": {
    "customTitle": "Debug login button on mobile",
    "titleSource": "auto",
  },
}
```

O campo é opcional e registros legados sem ele são tratados como `undefined`. `SessionPicker` esmaece linhas apenas em uma correspondência estrita `=== 'auto'` — um título de `/rename` definido pelo usuário antes da mudança nunca é reclassificado silenciosamente como um palpite do modelo.

### Resume hydration

No resume, o construtor do `ChatRecordingService` chama `sessionService.getSessionTitleInfo(sessionId)` para ler tanto o título quanto sua origem. Sem hidratar a origem, o re-append do `finalize()` (que roda em cada evento do ciclo de vida da sessão) reescreveria auto como manual em cada ciclo de resume — removendo silenciosamente a pista visual esmaecida.

### Atomic pair read

`extractLastJsonStringFields` retorna `customTitle` e `titleSource` da mesma linha correspondente em uma única varredura. Duas chamadas separadas de `readLastJsonStringFieldSync` poderiam cair em registros diferentes se uma linha mais antiga tiver apenas o campo principal, gerando um par incompatível. O extractor também exige uma aspas de fechamento adequada no valor principal, para que um registro final truncado por crash não vença a disputa de última correspondência.

### Full-file scan cap

A Fase 2 (quando o caminho rápido da janela de cauda falha) faz stream do arquivo inteiro em chunks de 64KB. Limitado a `MAX_FULL_SCAN_BYTES = 64 MB` para que um JSONL corrompido de vários GB não congele o seletor de sessões no main event loop. O envelope de latência do seletor sobrevive à corrupção.

### Symlink defense

Leituras de sessão abrem com `O_NOFOLLOW` (com fallback para leitura simples no Windows, onde a constante não é exposta). Defesa em profundidade para que um symlink plantado em `~/.qwen/projects/<proj>/chats/` não possa redirecionar uma leitura de metadados para um arquivo não relacionado.

## Concurrency and Edge Cases

### Trigger guard order

`maybeTriggerAutoTitle` verifica seis condições nesta ordem exata — cada uma faz short-circuit nas demais para que as mais baratas rodem primeiro:

1. `currentCustomTitle` definido → ignora. Nunca sobrescreve manual / auto anterior.
2. `autoTitleController !== undefined` → ignora. Uma tentativa por vez.
3. `autoTitleAttempts >= 3` → ignora. O limite restringe o desperdício total.
4. `!config.isInteractive()` → ignora. `qwen -p` headless / CI nunca gasta tokens de modelo rápido em uma sessão one-shot.
5. `autoTitleDisabledByEnv()` → ignora. `QWEN_DISABLE_AUTO_TITLE=1` opt-out explícito.
6. `!config.getFastModel()` → ignora. Sem modelo rápido → no-op.

### Why the cap is 3, not 1

A primeira resposta do assistente pode ser uma tool-call pura sem texto visível ao usuário (ex.: o modelo começa com um `grep`). `tryGenerateSessionTitle` retorna `{ok: false, reason: 'empty_history'}` nesse caso. Sem uma janela de retry, a chance de uma sessão inteira ter um título seria queimada na turn 1 antes do usuário dizer algo interessante. O limite de 3 cobre o caso comum "a primeira turn é ruído" enquanto ainda limita retentivas descontroladas em um modelo rápido com falha persistente.

### Cross-process manual-rename race

Duas abas do CLI no mesmo arquivo de sessão podem divergir em memória. A Aba A executa `/rename foo` e escreve `titleSource: manual`. O `ChatRecordingService` da Aba B tem seu próprio `currentCustomTitle = undefined` e sobrescreveria ingenuamente com um título automático.

Após a resolução da chamada LLM, a IIFE relê o JSONL via `sessionService.getSessionTitleInfo`. Se o arquivo mostrar `source: 'manual'`, a IIFE aborta E sincroniza seu estado em memória para que as turns subsequentes também respeitem o renomeio. Custo: uma leitura de cauda de 64KB por geração bem-sucedida; insignificante.

### Abort propagation on `finalize()`

`autoTitleController` também atua como flag in-flight. `finalize()` (executado na troca de sessão e no shutdown do processo) chama `autoTitleController.abort()` antes de re-anexar o registro de título. O socket LLM é cancelado prontamente; a troca de sessão não espera por uma chamada lenta ao modelo rápido. O bloco `finally` da IIFE limpa `autoTitleController` apenas se ele ainda for o ativo, para que um finalize em andamento não entre em race com um `recordAssistantTurn` concorrente.

### Manual `/rename` lands mid-flight

Entre a conclusão do `await` da IIFE e a chamada `recordCustomTitle('auto')`, o usuário poderia executar `/rename foo`. A IIFE verifica novamente `this.currentTitleSource === 'manual'` e aborta. A verificação in-process E a re-leitura cross-process são executadas; o manual vence em ambas as camadas.

## Configuration

### User-facing knobs

| Configuração / env var           | Padrão | Efeito                                                                                              |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `fastModel`                 | não definido   | Obrigatório para auto-titling. Não definido → no-op (sem fallback para modelo principal).                                  |
| `QWEN_DISABLE_AUTO_TITLE=1` | não definido   | Opt-out do gatilho automático sem desativar `fastModel`. `/rename --auto` ainda funciona sob demanda. |

Sem toggle no `settings.json` — a env var é o único desligador visível ao usuário. Justificativa: a feature é cosmética e barata; um toggle de configurações adicionaria uma superfície de UI para algo que pode viver como um env export único para os poucos usuários que desejam desativá-lo.

### Why auto doesn't fall back to the main model

O auto-titling é acionado incondicionalmente após cada resposta do assistente. Se um usuário sem um modelo rápido fosse cobrado silenciosamente com tokens do modelo principal pelo título de cada nova sessão, a diferença de custo seria invisível até a chegada da fatura mensal. Falhar silenciosamente (no-op, sem título, sem custo) é o padrão mais seguro. `/rename --auto` exibe `no_fast_model` como um erro acionável para que o usuário possa configurar um, se desejar.

## Observability

`createDebugLogger('SESSION_TITLE')` emite `debugLogger.warn` do bloco catch do generator. Falhas são totalmente transparentes para o usuário — auto-title é uma feature auxiliar e nunca lança erros na UI.

Desenvolvedores podem usar grep pela tag `[SESSION_TITLE]` no debug log (`~/.qwen/debug/<sessionId>.txt`; `latest.txt` é um symlink para a sessão atual). Uma chamada end-to-end funcionando não produz saída de log; uma com falha gera uma linha WARN com a mensagem de erro subjacente.

## Security Hardening

O valor do título é renderizado literalmente no terminal (seletor de sessões) E persistido em um arquivo JSONL legível pelo usuário. Ambas as superfícies são acessíveis a ataques se um modelo rápido comprometido ou com prompt-injected retornar texto hostil.

| Preocupação                                     | Proteção                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Injeção ANSI / OSC-8 / CSI                | `stripTerminalControlSequences` antes da escrita no JSONL e da renderização no picker.                                                    |
| Link clicável smuggle via OSC-8            | Igual — sequências OSC removidas como unidades inteiras, não apenas o byte ESC.                                                          |
| Surrogates UTF-16 inválidos                   | Limpados em `flattenToTail` (entrada LLM) e `sanitizeTitle` (saída LLM após corte de comprimento máximo).                               |
| Spoofing de linha subtype via conteúdo de mensagem do usuário | `lineContains: '"subtype":"custom_title"'` — texto do usuário que por acaso contém a frase literal não pode ofuscar um registro real. |
| Redirecionamento de symlink em leituras de sessão           | `O_NOFOLLOW` (no-op no Windows onde a constante está ausente).                                                                |
| Registro JSONL final truncado             | `extractLastJsonStringFields` exige uma aspas de fechamento antes que um registro vença a disputa de última correspondência.                            |
| Tamanho patológico de arquivo congelando o picker  | Limite de `MAX_FULL_SCAN_BYTES = 64 MB` na varredura completa do arquivo na Fase 2.                                                                  |
| Decoradores de colchetes CJK pareados (`【Draft】`) | Removidos como uma unidade para que uma aspa de fechamento isolada não fique pendurada.                                                                  |

## Out of Scope

| Item                                        | Por que não                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Regeneração automática quando o título fica desatualizado   | `/rename --auto` é o caminho explícito acionado pelo usuário. Trocas silenciosas de título no meio da sessão confundiriam usuários rolando para trás no seletor. |
| Paridade de estilo esmaecido WebUI / VSCode           | Essas superfícies já leem `customTitle` e mostrarão títulos automáticos como se fossem manuais. Um follow-up pode conectar o `titleSource`.           |
| Toggle no diálogo de configurações para geração automática  | A env var é o único controle. Uma UI de configurações completa é fácil de adicionar depois se a demanda do usuário surgir.                                                  |
| Entradas de catálogo de locale i18n para novas strings | Consistente com as strings existentes de `/rename`, que fazem fallback para inglês. Uma passagem i18n em todo o repo está fora do escopo.                           |
| Migração para reclassificar registros legados     | Back-compat por design: `titleSource` ausente é tratado como manual. Reescrever registros antigos arriscaria perder a intenção do usuário.                      |
| Auto-titling não interativo                | `qwen -p` / scripts de CI descartam a sessão; tokens de modelo rápido para um título que ninguém vai retomar são puro desperdício.                         |