# Documento de Design Técnico da Fase 2: Expansão de Capacidades

## 1. Objetivos e Restrições de Design

### 1.1 Objetivos

- Expandir o `supportedModes` de 13 comandos built-in para incluir `non_interactive` e/ou `acp`
- Garantir que cada comando expandido retorne conteúdo textual adequado para consumo pela IDE nos caminhos ACP/non-interactive
- Habilitar o fluxo de chamada de modelo para `prompt command` (`SkillTool` consumindo `getModelInvocableCommands()`)
- Implementar detecção básica de `mid-input slash command`

### 1.2 Restrições Obrigatórias

- **Zero degradação no caminho `interactive`**: O comportamento `interactive` existente de todos os comandos expandidos permanece estritamente inalterado. Novos branches por modo são adicionados apenas dentro do `action`, sem tocar no código do caminho `interactive`.
- **Estratégia de implementação: branch por modo, em vez de registro duplo**: Os 13 comandos utilizarão a verificação de `executionMode` dentro do `action`. O padrão de registro duplo descrito no Documento de Design da Fase 1 §10.2 não será usado (o registro duplo só é necessário quando a lógica `interactive` e `non-interactive` difere drasticamente; a complexidade dos comandos desta fase não atinge esse limiar).
- **Formato de mensagem ACP**: O conteúdo textual retornado pelo caminho ACP não contém estilos ANSI, sendo preferível Markdown ou texto puro, voltado para consumo por plugins de IDE.
- **Ignorar efeitos colaterais dependentes de ambiente**: Operações que dependem de ambiente gráfico, como abrir navegador (`open()`) ou manipular área de transferência (`copyToClipboard()`), devem ser ignoradas nos caminhos `non-interactive`/`ACP`.

---

## 2. Estado Base Após a Conclusão da Fase 1

Pontos arquiteturais após o fim da Fase 1 (a Fase 2 expandirá diretamente sobre esta base):

- O campo `commandType` foi removido da interface `SlashCommand`; todos os comandos agora usam `supportedModes` explícito
- `getEffectiveSupportedModes()` utiliza inferência em dois níveis: `supportedModes` explícito → fallback para `CommandKind`
- `CommandService.getCommandsForMode(mode)` substitui a whitelist `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` original
- `btw`, `bug`, `compress`, `context`, `init`, `summary` já foram expandidos para todos os modos na Fase 1 e **não estão na lista desta fase**
- Todos os métodos em `createNonInteractiveUI()` são no-op: `addItem`, `clear`, `setDebugMessage`, `setPendingItem`, `reloadCommands` ignoram chamadas silenciosamente

---

## 3. Visão Geral do Escopo de Alterações

Esta fase envolve 13 comandos, divididos em quatro categorias com base na complexidade de implementação:

| Categoria  | Comandos                                     | Pontos de Alteração                                                                    |
| ---------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Cat. A** | `export`                                     | Apenas altera `supportedModes`; todos os caminhos do `action` já retornam tipos válidos |
| **Apenas Interativo** | `plan`, `statusline`                         | Decisão de design: semanticamente fortemente acoplados à UI interativa; mantêm `supportedModes: ['interactive']` |
| **Cat. A+** | `language`                                   | Altera `supportedModes` + tratamento leve de branch `non-interactive`                  |
| **Apenas Interativo** | `copy`, `restore`                            | Decisão de design: manipulação de clipboard e restauração de snapshot são inerentemente interativas; mantêm `supportedModes: ['interactive']` |
| **Cat. A'** | `model`, `approval-mode`                     | Caminhos com argumentos já retornam `message`; caminhos sem argumentos exigem novo branch `non-interactive` (atualmente acionam `dialog`) |
| **Cat. B** | `about`, `stats`, `insight`, `docs`, `clear` | Nenhum caminho do `action` retorna valor ou chamam `addItem`/`clear`; exige branch `non-interactive` completo |

---

## 4. Categoria A: Apenas alterar `supportedModes`

Todos os caminhos `action` destes comandos já retornam `message` ou `submit_prompt`, sem dependência de UI. O `handleCommandResult` pode processá-los diretamente.

### 4.1 `/export` (e subcomandos)

**Estado atual**: `supportedModes: ['interactive']`, todos os subcomandos retornam `MessageActionReturn`.

**Alteração**: Alterar `supportedModes` do comando pai e dos quatro subcomandos (`md`, `html`, `json`, `jsonl`) para `['interactive', 'non_interactive', 'acp']`.

**Conteúdo da mensagem ACP**: O retorno atual do `action` já inclui o caminho completo do arquivo (ex: `Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`), sendo amigável para consumo pela IDE, sem necessidade de modificar o texto.

> **Nota**: O comando pai `/export` não possui `action`, apenas subcomandos. Após alterar o `supportedModes` do pai para todos os modos, o `parseSlashCommand` consegue rotear para os subcomandos. Se o usuário digitar apenas `/export` sem subcomando, `commandToExecute.action` será `undefined`, e o `handleSlashCommand` retornará `no_command`, fazendo o chamador exibir a lista de subcomandos disponíveis. Este é o comportamento esperado.

### 4.2 `/plan`

**Estado atual**: `supportedModes: ['interactive']`, todos os caminhos retornam `MessageActionReturn` ou `SubmitPromptActionReturn`.

**Decisão de design**: `/plan` é um comando que guia o usuário em um planejamento interativo de múltiplas rodadas, sendo semanticamente fortemente acoplado à interface interativa. Após discussão, decidiu-se manter `supportedModes: ['interactive']`, sem expansão para modos `non-interactive`/`acp`.

### 4.3 `/statusline`

**Estado atual**: `supportedModes: ['interactive']`, o `action` sempre retorna `SubmitPromptActionReturn` (submete o prompt de chamada do subagent ao modelo).

**Decisão de design**: `/statusline` aciona o subagent para resumir o estado atual, sendo semanticamente fortemente acoplado à interface interativa. Após discussão, decidiu-se manter `supportedModes: ['interactive']`, sem expansão para modos `non-interactive`/`acp`.

---

## 5. Categoria A+: Tratamento de poucos branches `non-interactive`

### 5.1 `/language`

**Estado atual**: Todos os caminhos do `action` retornam `MessageActionReturn` (lê/define configurações de idioma).

**Efeito colateral a tratar**: `setUiLanguage()` chama `context.ui.reloadCommands()`, que já é no-op na UI não interativa, não exigindo tratamento adicional.

**Alteração**:

- Alterar `supportedModes` do comando pai e dos subcomandos (`ui`, `output`, e subcomandos gerados dinamicamente via `SUPPORTED_LANGUAGES`) para `['interactive', 'non_interactive', 'acp']`.
- O `action` não precisa de branch por modo; o texto retornado já é adequado para consumo por máquina.

**Nota semântica ACP**: Executar `/language ui zh-CN` no modo `non-interactive` (chamada única) modifica a configuração persistente (grava no arquivo de settings), afetando sessões futuras. A i18n também entra em vigor imediatamente na sessão atual. Isso está alinhado com a expectativa do usuário.

### 5.2 `/copy`

**Estado atual**: O `action` chama `copyToClipboard()`, o que pode lançar exceção ou falhar silenciosamente em ambientes ACP/headless (clipboard indisponível).

**Alteração**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Adicionar branch por modo dentro do `action`:

```typescript
// 获取 last AI message（现有逻辑，可复用）
if (context.executionMode !== 'interactive') {
  // 非交互/ACP：跳过剪贴板，返回内容本身
  if (!lastAiOutput) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No output in history.',
    };
  }
  return {
    type: 'message',
    messageType: 'info',
    content: lastAiOutput,
  };
}
// interactive 路径：原有剪贴板逻辑不变
await copyToClipboard(lastAiOutput);
return {
  type: 'message',
  messageType: 'info',
  content: 'Last output copied to the clipboard',
};
```

**Semântica ACP**: A IDE recebe o texto bruto da última saída do modelo e pode decidir se o copia para a área de transferência ou o exibe ao usuário.

### 5.3 `/restore`

**Estado atual**: `supportedModes: ['interactive']`.

**Decisão de design**: A restauração de snapshot reexecuta chamadas de ferramentas, sendo semanticamente fortemente acoplada à interface interativa. Após discussão, decidiu-se manter `supportedModes: ['interactive']`, sem expansão para modos `non-interactive`/`acp`.

**Semântica ACP**: A restauração do estado git do checkpoint e a configuração do histórico do cliente gemini são executadas como efeitos colaterais; após receber a mensagem de confirmação, a IDE pode informar ao usuário que o "estado foi restaurado", cabendo à IDE decidir se aciona a reexecução das ferramentas.

---

## 6. Categoria A': Tratamento `non-interactive` para caminhos de `dialog` sem argumentos

### 6.1 `/model`

**Estado atual**:

| Entrada                          | Comportamento Atual                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `/model` (sem argumentos)        | → `{ type: 'dialog', dialog: 'model' }` (torna-se `unsupported` em `non-interactive`) |
| `/model <model-id>`              | Não implementado (apenas branch `--fast`)                                          |
| `/model --fast` (sem model name) | → `{ type: 'dialog', dialog: 'fast-model' }` (torna-se `unsupported` em `non-interactive`) |
| `/model --fast <model-id>`       | → `MessageActionReturn` ✅                                                         |

**Alteração**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Inserir branch `non-interactive` antes de cada caminho de `dialog` no `action`:

```typescript
// 无参数路径（原返回 dialog: 'model'）
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentModel = config.getModel() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current model: ${currentModel}\nUse "/model <model-id>" to switch models.`,
    };
  }
  return { type: 'dialog', dialog: 'model' };
}

// --fast 无参数路径（原返回 dialog: 'fast-model'）
if (args.startsWith('--fast') && !modelName) {
  if (context.executionMode !== 'interactive') {
    const fastModel = context.services.settings?.merged?.fastModel ?? 'not set';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current fast model: ${fastModel}\nUse "/model --fast <model-id>" to set fast model.`,
    };
  }
  return { type: 'dialog', dialog: 'fast-model' };
}
```

**Semântica ACP**: A IDE exibe o nome do modelo atual para referência do usuário; a troca de modelo é feita via chamada com argumentos (`/model <model-id>`).

> **Nota**: `/model <model-id>` (sem `--fast`) atualmente não implementa a lógica para definir o modelo da sessão atual; apenas `--fast <model-id>` faz isso. Se a Fase 2 precisar suportar troca do modelo principal no ACP, a lógica de set para `/model <model-id>` deve ser implementada em paralelo. Este design reserva o caminho, mas o marca como opcional para a Fase 2, priorizando o caminho read-only "visualizar modelo atual".

### 6.2 `/approval-mode`

**Estado atual**:

| Entrada                    | Comportamento Atual                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `/approval-mode` (sem argumentos) | → `{ type: 'dialog', dialog: 'approval-mode' }` (torna-se `unsupported` em `non-interactive`) |
| `/approval-mode <mode>`    | → `MessageActionReturn` ✅                                                            |
| `/approval-mode <invalid>` | → `MessageActionReturn` (error) ✅                                                    |

**Alteração**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Inserir branch `non-interactive` no caminho sem argumentos (`!args.trim()`):

```typescript
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentMode = config?.getApprovalMode() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current approval mode: ${currentMode}\nAvailable modes: ${APPROVAL_MODES.join(', ')}\nUse "/approval-mode <mode>" to change.`,
    };
  }
  return { type: 'dialog', dialog: 'approval-mode' };
}
```

---

## 7. Categoria B: Requer branch `non-interactive` completo

Os `action` destes cinco comandos renderizam componentes React via `context.ui.addItem()` ou chamam `context.ui.clear()` no modo `interactive`, retornando `void`. No modo `non-interactive`, essas chamadas são no-op, fazendo com que o `handleSlashCommand` trate a ausência de retorno como `"Command executed successfully."`, sem saída real.

**Princípio de implementação**: Verificar `executionMode` no **início** do `action`. Se não for `interactive`, **retornar antecipadamente** um `message` com o conteúdo real. O código do caminho `interactive` permanece intocado.

### 7.1 `/about` (altName: `status`)

**Fonte de dados**: `getExtendedSystemInfo(context)` retorna `ExtendedSystemInfo`, contendo: `cliVersion`, `osPlatform`, `osArch`, `osRelease`, `nodeVersion`, `modelVersion`, `selectedAuthType`, `ideClient`, `sessionId`, `memoryUsage`, `baseUrl`, `apiKeyEnvKey`, `gitCommit`, `fastModel`. Todos os campos estão disponíveis em `non-interactive` (`context.services.config` e `settings` já estão injetados).

**Alteração**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Inserir branch por modo após a chamada `getExtendedSystemInfo`, antes do caminho `interactive`:

```typescript
action: async (context) => {
  const systemInfo = await getExtendedSystemInfo(context);

  if (context.executionMode !== 'interactive') {
    const lines = [
      `Qwen Code v${systemInfo.cliVersion}`,
      `Model: ${systemInfo.modelVersion}`,
      `Fast Model: ${systemInfo.fastModel ?? 'not set'}`,
      `Auth: ${systemInfo.selectedAuthType}`,
      `Platform: ${systemInfo.osPlatform} ${systemInfo.osArch} (${systemInfo.osRelease})`,
      `Node.js: ${systemInfo.nodeVersion}`,
      `Session: ${systemInfo.sessionId}`,
      ...(systemInfo.gitCommit ? [`Git commit: ${systemInfo.gitCommit}`] : []),
      ...(systemInfo.ideClient ? [`IDE: ${systemInfo.ideClient}`] : []),
    ];
    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
    };
  }

  // interactive 路径：原有 addItem 逻辑不变
  const aboutItem: Omit<HistoryItemAbout, 'id'> = { type: MessageType.ABOUT, systemInfo };
  context.ui.addItem(aboutItem, Date.now());
},
```

### 7.2 `/stats` (e subcomandos `model`, `tools`)

**Fonte de dados**: `context.session.stats` (`SessionStatsState`) contém `sessionStartTime`, `metrics` (`SessionMetrics`: `models`, `tools`, `files`), `promptCount`. Em `non-interactive`, `sessionStartTime` é o momento da chamada atual, `metrics` vem de `uiTelemetryService.getMetrics()` (valor acumulado desta chamada, geralmente zero), e `promptCount` é 1.

**Alteração**:

1. Alterar `supportedModes` do comando pai `stats` e dos subcomandos `model`, `tools` para `['interactive', 'non_interactive', 'acp']`.
2. Inserir branch por modo no `action` do comando pai e de cada subcomando, retornando antecipadamente estatísticas em formato de texto:

```typescript
// /stats 主命令
action: (context) => {
  if (context.executionMode !== 'interactive') {
    const now = new Date();
    const { sessionStartTime, promptCount, metrics } = context.session.stats;
    if (!sessionStartTime) {
      return { type: 'message', messageType: 'error', content: 'Session start time unavailable.' };
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    // 汇总所有 model 的 token 数
    let totalPromptTokens = 0, totalCandidateTokens = 0, totalRequests = 0;
    for (const modelMetrics of Object.values(metrics.models)) {
      totalPromptTokens += modelMetrics.tokens.prompt;
      totalCandidateTokens += modelMetrics.tokens.candidates;
      totalRequests += modelMetrics.api.totalRequests;
    }

    const lines = [
      `Session duration: ${formatDuration(wallDuration)}`,
      `Prompts: ${promptCount}`,
      `API requests: ${totalRequests}`,
      `Tokens — prompt: ${totalPromptTokens}, output: ${totalCandidateTokens}`,
      `Tool calls: ${metrics.tools.totalCalls} (${metrics.tools.totalSuccess} ok, ${metrics.tools.totalFail} fail)`,
      `Files: +${metrics.files.totalLinesAdded} / -${metrics.files.totalLinesRemoved} lines`,
    ];
    return { type: 'message', messageType: 'info', content: lines.join('\n') };
  }

  // interactive 路径：原有 addItem 逻辑不变
  const statsItem: HistoryItemStats = { type: MessageType.STATS, duration: formatDuration(wallDuration) };
  context.ui.addItem(statsItem, Date.now());
},
```

Os subcomandos `model` e `tools` também inserem seus próprios branches por modo, retornando estatísticas textuais por dimensão (tokens por nome de modelo; contagem de chamadas por ferramenta).

**Nota**: Em chamadas únicas `non-interactive`, as métricas geralmente são zero (nova sessão), mas a estrutura permanece intacta, não afetando a formatação. Em sessões ACP, podem haver valores acumulados com significado real.

### 7.3 `/insight`

**Estado atual**: O `action` retorna `void`, exibe progresso e resultados via `addItem`, e finalmente chama `open(outputPath)` para abrir o navegador. A lógica central é `insightGenerator.generateStaticInsight()` gerando um arquivo HTML.

**Alteração**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Dividir em três caminhos conforme `executionMode`:
   - `non_interactive`: geração síncrona, ignora callback de progresso, não abre navegador, retorna `message` (caminho do arquivo)
   - `acp`: inicia geração assíncrona, envia progresso (`encodeInsightProgressMessage`) e conclusão (`encodeInsightReadyMessage`) para a IDE via `stream_messages`
   - `interactive`: lógica original `addItem` + `setPendingItem` + `open()` permanece inalterada

```typescript
// non_interactive 路径
if (context.executionMode === 'non_interactive') {
  const outputPath = await insightGenerator.generateStaticInsight(
    projectsDir,
    () => {}, // no-op progress
  );
  return {
    type: 'message',
    messageType: 'info',
    content: t('Insight report generated at: {{path}}', { path: outputPath }),
  };
}

// acp 路径：stream_messages
if (context.executionMode === 'acp') {
  // ... 构造 streamMessages async generator，yield encodeInsightProgressMessage / encodeInsightReadyMessage ...
  return { type: 'stream_messages', messages: streamMessages() };
}

// interactive 路径：原有实现不变
```

**Justificativa de design**: O modo `non_interactive` (pipeline CLI) não suporta `stream_messages`, podendo retornar apenas uma `message` única. O modo ACP (plugin IDE) consome `stream_messages` e exibe progresso em tempo real, mantendo o caminho de streaming para ele.

**Formato de mensagem ACP**: `encodeInsightProgressMessage(stage, progress, detail?)` gera uma mensagem de barra de progresso analisável pela IDE; `encodeInsightReadyMessage(outputPath)` notifica a IDE que o arquivo está pronto, cabendo à IDE decidir como exibir o link.

### 7.4 `/docs`

**Estado atual**: O `action` retorna `void`, exibe mensagem via `addItem` e chama `open(docsUrl)` para abrir o navegador. Possui um branch de variável de ambiente `SANDBOX` (em sandbox, apenas `addItem`, sem abrir navegador).

**Alteração**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Modificar tipo de retorno do `action` para `Promise<void | MessageActionReturn>`.
3. Inserir branch `non-interactive` no início do `action`:

```typescript
action: async (context) => {
  const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
  const docsUrl = `https://qwenlm.github.io/qwen-code-docs/${langPath}`;

  if (context.executionMode !== 'interactive') {
    // 非交互/ACP：直接返回 URL，不打开浏览器，不调用 addItem
    return {
      type: 'message',
      messageType: 'info',
      content: `Qwen Code documentation: ${docsUrl}`,
    };
  }

  // interactive 路径：原有 SANDBOX 判断 + addItem + open() 不变
  if (process.env['SANDBOX'] && ...) {
    context.ui.addItem(...);
  } else {
    context.ui.addItem(...);
    await open(docsUrl);
  }
},
```

### 7.5 `/clear` (altNames: `reset`, `new`)

**Estado atual**: O `action` executa as seguintes operações e retorna `void`:

1. `config.getHookSystem()?.fireSessionEndEvent()` — aciona hook (efeito colateral)
2. `config.startNewSession()` — inicia novo ID de sessão (efeito colateral)
3. `uiTelemetryService.reset()` — reseta contadores de telemetry (efeito colateral)
4. `skillTool.clearLoadedSkills()` — limpa cache de skill (efeito colateral)
5. `context.ui.clear()` — limpa UI do terminal (**efeito colateral de UI, no-op em `non-interactive`**)
6. `geminiClient.resetChat()` — reseta histórico de chat (efeito colateral)
7. `config.getHookSystem()?.fireSessionStartEvent()` — aciona hook (efeito colateral)

**Análise semântica `non-interactive`/`ACP`**:

- `ui.clear()` já é no-op em `non-interactive`, não requer tratamento
- `geminiClient.resetChat()`: efeito colateral válido em sessão ACP (limpa histórico de chat), deve ser mantido; em chamada única `non-interactive`, cada chamada é uma sessão nova, tornando `resetChat` semanticamente redundante, mas inofensivo
- `config.startNewSession()`: válido em ACP (inicia novo ID de sessão); em chamada única `non-interactive`, também é redundante, mas inofensivo
- `fireSessionEndEvent` / `fireSessionStartEvent`: válidos em ACP (acionam hooks)

**Decisão**: Manter todos os efeitos colaterais significativos nos caminhos `non-interactive`/`ACP` (`resetChat`, `startNewSession`, eventos de hook), ignorando apenas `ui.clear()` (já é no-op) e retornando uma mensagem de marcador de limite de contexto.

**Alteração**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Modificar tipo de retorno do `action` para `Promise<void | MessageActionReturn>`.
3. Dentro do `action`, após a chamada `context.ui.clear()` (ou substituindo-a), adicionar branch por modo:

```typescript
action: async (context, _args) => {
  const { config } = context.services;

  if (config) {
    config.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Clear).catch(...);

    const newSessionId = config.startNewSession();
    uiTelemetryService.reset();

    const skillTool = config.getToolRegistry()?.getAllTools().find(...);
    if (skillTool instanceof SkillTool) skillTool.clearLoadedSkills();

    if (newSessionId && context.session.startNewSession) {
      context.session.startNewSession(newSessionId);
    }

    // ui.clear() 在非交互下已是 no-op，但依然调用（不需要条件分支）
    context.ui.clear();

    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.resetChat();
    }

    config.getHookSystem()?.fireSessionStartEvent(...).catch(...);
  } else {
    context.ui.clear();
  }

  // 根据模式决定返回值
  if (context.executionMode !== 'interactive') {
    return {
      type: 'message',
      messageType: 'info',
      content: 'Context cleared. Previous messages are no longer in context.',
    };
  }
  // interactive 路径：void（不返回，React UI 由 ui.clear() 驱动更新）
},
```

**Semântica ACP**: Após receber o marcador de limite de contexto, a IDE pode exibi-lo como separador de sessão (ex: aviso "Nova sessão iniciada") e limpar o cache local do histórico de chat.

---

## 8. Alterações em `handleCommandResult`

**Conclusão: não é necessária modificação.**

Após as alterações da Fase 2, os tipos de retorno nos caminhos `non-interactive`/`ACP` são `message` ou `submit_prompt`, ambos já tratados corretamente no `switch` do `handleCommandResult`.

---

## 9. Alterações em `createNonInteractiveUI()`

**Conclusão: não é necessária modificação.**

A implementação no-op atual é suficiente. Os métodos no-op `addItem`, `clear`, `setPendingItem`, etc., não serão chamados nos caminhos `non-interactive` dos comandos da Categoria B (devido ao `return` antecipado); o caminho `interactive` permanece inalterado.

---

## 10. Fase 2.2: Habilitar chamadas de modelo para `prompt command`

Na Fase 1, `CommandService.getModelInvocableCommands()` já foi implementado, e `BundledSkillLoader`, `FileCommandLoader` (comandos de usuário/projeto) e `McpPromptLoader` já definem `modelInvocable: true`.

O trabalho da Fase 2.2 é alterar o `SkillTool` para consumir `CommandService.getModelInvocableCommands()` além de `SkillManager.listSkills()`, unificando o ponto de entrada para comandos invocáveis por modelo.

**Arquivo alterado**: `packages/core/src/tools/SkillTool.ts` (ou caminho equivalente)

**Alterações específicas**:

1. O `SkillTool` recebe `CommandService` (ou o resultado de `getModelInvocableCommands()`) como injeção de dependência durante a inicialização
2. Ao construir a descrição da ferramenta, mescla os resultados de `listSkills()` e `getModelInvocableCommands()`
3. Garante que comandos built-in (`modelInvocable: false`) não apareçam na descrição da ferramenta

> **Nota**: A implementação específica do `SkillTool` depende da arquitetura interna do `packages/core`. Este documento descreve apenas as alterações de interface; os detalhes de implementação devem ser definidos com base na estrutura existente do pacote core.

---

## 11. Fase 2.3: Detecção de `mid-input slash command` (versão básica)

Detectar o token slash próximo ao cursor no componente `InputPrompt` (não restrito ao início da linha) e acionar o menu de autocompletar.

**Regras de detecção**:

- Quando um token começando com `/` e sem espaços existir antes do cursor, aciona o autocompletar de comandos
- Os candidatos vêm da lista visível de `getCommandsForMode('interactive')`
- O menu exibe nome do comando + description (sem `argumentHint`, etc., a ser adicionado na Fase 3)

> Esta funcionalidade é uma alteração na camada de UI, constituindo uma subtarefa independente da Fase 2.3, sem impacto na implementação das Fases 2.1/2.2.

---

## 12. Visão Geral das Alterações de Arquivos

### 12.1 Alterações em arquivos de comandos (Fase 2.1)

| Arquivo                    | Tipo de Alteração | Conteúdo Específico                                                                                                                             |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `exportCommand.ts`       | Cat. A     | Comando pai + 4 subcomandos: `supportedModes` → todos os modos                                                                                    |
| `planCommand.ts`         | Apenas Interativo   | Decisão de design: mantém `supportedModes: ['interactive']`, sem alterações                                                                             |
| `statuslineCommand.ts`   | Apenas Interativo   | Decisão de design: mantém `supportedModes: ['interactive']`, sem alterações                                                                             |
| `languageCommand.ts`     | Cat. A+    | Comando pai + subcomandos `ui`/`output` + subcomandos dinâmicos de idioma: `supportedModes` → todos os modos                                                   |
| `copyCommand.ts`         | Apenas Interativo   | Decisão de design: mantém `supportedModes: ['interactive']`, sem alterações                                                                             |
| `restoreCommand.ts`      | Apenas Interativo   | Decisão de design: mantém `supportedModes: ['interactive']`, sem alterações                                                                             |
| `modelCommand.ts`        | Cat. A'    | `supportedModes` → todos os modos + novo branch não interativo para caminhos sem argumentos/sem fast model                                                               |
| `approvalModeCommand.ts` | Cat. A'    | `supportedModes` → todos os modos + novo branch não interativo para caminho sem argumentos                                                                              |
| `aboutCommand.ts`        | Cat. B     | `supportedModes` → todos os modos + caminho não interativo retorna `message` (resumo de versão/modelo/ambiente)                                                        |
| `statsCommand.ts`        | Cat. B     | `supportedModes` → todos os modos + caminho não interativo retorna `message` (texto de stats); subcomandos tratados em paralelo                                                |
| `insightCommand.ts`      | Cat. B     | `supportedModes` → todos os modos + caminho `non_interactive` gera síncrono e retorna `message` (caminho do arquivo); caminho `acp` retorna `stream_messages` com push de progresso |
| `docsCommand.ts`         | Cat. B     | `supportedModes` → todos os modos + caminho não interativo retorna `message` (URL da documentação), sem abrir navegador                                                    |
| `clearCommand.ts`        | Cat. B     | `supportedModes` → todos os modos + `action` retorna `message` ou `void` conforme o modo no final                                                           |

### 12.2 Outras alterações de arquivos

| Arquivo                                                | Conteúdo da Alteração                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts`              | Fase 2.2: integração com `getModelInvocableCommands()` (design detalhado a definir) |
| `packages/cli/src/ui/InputPrompt.tsx` (ou componente equivalente) | Fase 2.3: lógica de detecção de mid-input slash                               |

### 12.3 Arquivos inalterados

- `packages/cli/src/nonInteractiveCliCommands.ts` (`handleCommandResult`, `handleSlashCommand` não requerem modificação)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (UI stub não requer modificação)
- `packages/cli/src/services/commandUtils.ts` (`filterCommandsForMode`, `getEffectiveSupportedModes` não requerem modificação)
- `packages/cli/src/services/CommandService.ts` (`getCommandsForMode`, `getModelInvocableCommands` já implementados na Fase 1)

---

## 13. Estratégia de Testes

### 13.1 Testes unitários de comandos

Adicionar ou atualizar arquivos de teste (`*.test.ts`) no mesmo diretório de cada comando alterado, cobrindo os seguintes casos:

**Comandos Cat. A/A+** (`export`, `language`):

- `supportedModes` inclui corretamente `non_interactive` e `acp`
- Em `executionMode: 'non_interactive'`, o `action` retorna `MessageActionReturn` ou `SubmitPromptActionReturn`, sem chamar `ui.addItem` ou `ui.clear`
- Comportamento do caminho `interactive` idêntico ao pré-refatoração (teste de snapshot)

**Comandos Apenas Interativos** (`plan`, `statusline`, `copy`, `restore`):

- `supportedModes` é `['interactive']`, conforme decisão de design
- Verificar que a execução em `non-interactive` retorna corretamente `unsupported`

**Comandos Cat. A'** (`model`, `approval-mode`):

- Sem argumentos + `executionMode: 'non_interactive'` → retorna `message` com estado atual, sem retornar `dialog`
- Com argumentos + `executionMode: 'non_interactive'` → lógica original de `message` executa normalmente
- Caminho `interactive`: sem argumentos → `dialog`, com argumentos → `message` (inalterado)

**Comandos Cat. B** (`about`, `stats`, `insight`, `docs`, `clear`):

- Em `executionMode: 'non_interactive'`, o `action` retorna `MessageActionReturn`, sem chamar nenhum método `ui.*`
- A string `content` retornada contém os campos-chave esperados (versão, modelo, URL, etc.)
- Caminho `interactive`: `ui.addItem` é chamado, `action` retorna `void` (inalterado)

**Caso especial para `clear`**:

- Em `executionMode: 'non_interactive'`, `geminiClient.resetChat()` ainda é chamado (efeito colateral mantido)
- Retorna `message` de limite de contexto com conteúdo `'Context cleared. Previous messages are no longer in context.'`

### 13.2 Testes de integração (`handleSlashCommand`)

Em `nonInteractiveCli.test.ts` ou novo arquivo de teste de integração:

- `handleSlashCommand('/about', ...)` em modo `non-interactive` retorna `{ type: 'message', content: contém versão }`
- `handleSlashCommand('/stats', ...)` em modo `non-interactive` retorna `{ type: 'message', content: contém 'Session duration' }`
- `handleSlashCommand('/docs', ...)` em modo `non-interactive` retorna `{ type: 'message', content: contém 'qwenlm.github.io' }`
- `handleSlashCommand('/clear', ...)` em modo `non-interactive` retorna `{ type: 'message', content: 'Context cleared.' }`
- `handleSlashCommand('/plan', ...)` em modo `non-interactive` retorna `unsupported` (comando apenas interativo)
- Comandos `non-interactive` existentes (`btw`, `bug`, etc.) sem degradação de comportamento

### 13.3 Testes de `commandUtils`

Em `commandUtils.test.ts`, adicionar (ou manter cobertura existente):

- Comandos expandidos (`export`, `language`, etc.) passam corretamente por `filterCommandsForMode(commands, 'non_interactive')` e `filterCommandsForMode(commands, 'acp')`
- Comandos apenas interativos (`plan`, `statusline`, `copy`, `restore`) são corretamente filtrados em `filterCommandsForMode(commands, 'non_interactive')`

---

## 14. Análise de Impacto no Comportamento

| Cenário                                         | Comportamento Pré-Fase 2                                            | Comportamento Pós-Fase 2                     | Natureza               |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------- | ------------------ |
| Executar `/export md` em `non-interactive`          | ❌ `unsupported` (filtrado)                                  | ✅ Retorna `message` com caminho do arquivo            | Expansão de capacidade           |
| Executar `/plan <task>` em `non-interactive`        | ❌ `unsupported`                                            | ❌ `unsupported` (decisão de design: apenas interativo) | Inalterado               |
| Executar `/statusline` em `non-interactive`         | ❌ `unsupported`                                            | ❌ `unsupported` (decisão de design: apenas interativo) | Inalterado               |
| Executar `/language ui zh-CN` em `non-interactive`  | ❌ `unsupported`                                            | ✅ Define idioma, retorna `message` de confirmação      | Expansão de capacidade           |
| Executar `/copy` em `non-interactive`               | ❌ `unsupported`                                            | ❌ `unsupported` (decisão de design: apenas interativo) | Inalterado               |
| Executar `/restore` (sem argumentos) em `non-interactive`  | ❌ `unsupported`                                            | ❌ `unsupported` (decisão de design: apenas interativo) | Inalterado               |
| Executar `/restore <id>` em `non-interactive`       | ❌ `unsupported`                                            | ❌ `unsupported` (decisão de design: apenas interativo) | Inalterado               |
| Executar `/model` em `non-interactive`              | ❌ `unsupported` (`dialog`)                                  | ✅ Retorna nome do modelo atual                | Expansão de capacidade           |
| Executar `/model <id>` em `non-interactive`         | ❌ `unsupported`                                            | 🔄 Opcional Fase 2: implementar lógica de troca      | Expansão de capacidade (opcional)   |
| Executar `/approval-mode` em `non-interactive`      | ❌ `unsupported` (`dialog`)                                  | ✅ Retorna modo de aprovação atual                | Expansão de capacidade           |
| Executar `/approval-mode yolo` em `non-interactive` | ❌ `unsupported`                                            | ✅ Define modo, retorna confirmação              | Expansão de capacidade           |
| Executar `/about` em `non-interactive`              | ❌ Retorna "Command executed successfully." (`addItem` no-op) | ✅ Retorna resumo de versão/modelo/ambiente          | Correção de bug + Expansão de capacidade |
| Executar `/stats` em `non-interactive`              | ❌ Retorna "Command executed successfully."                  | ✅ Retorna texto de estatísticas da sessão           | Correção de bug + Expansão de capacidade |
| Executar `/insight` em `non-interactive`            | ❌ Retorna "Command executed successfully." (gera sem saída)  | ✅ Gera e retorna caminho do arquivo              | Correção de bug + Expansão de capacidade |
| Executar `/docs` em `non-interactive`               | ❌ Retorna "Command executed successfully."                  | ✅ Retorna URL da documentação                    | Correção de bug + Expansão de capacidade |
| Executar `/clear` em `non-interactive`              | ❌ Retorna "Command executed successfully."                  | ✅ Retorna `message` de limite de contexto          | Correção de bug + Expansão de capacidade |
| Executar qualquer comando acima em `interactive`               | ✅ Comportamento original                                               | ✅ Comportamento original (zero degradação)              | Inalterado               |

---

## 15. Ordem de Implementação

Recomenda-se implementar na seguinte ordem; cada grupo pode ter commit e review independentes:

**Batch 1** (~30min): Cat. A — apenas altera `supportedModes`

Modificar `exportCommand.ts` (e subcomandos), verificar testes passando.

**Batch 2** (~45min): Cat. A+ — poucos branches

Modificar `languageCommand.ts`, adicionar branch não interativo para caminhos com efeitos colaterais, atualizar testes correspondentes. (`copyCommand.ts` e `restoreCommand.ts` mantidos como apenas interativos após discussão.)

**Batch 3** (~45min): Cat. A' — caminhos de `dialog`

Modificar `modelCommand.ts`, `approvalModeCommand.ts`, adicionar branch não interativo para caminhos sem argumentos, atualizar testes correspondentes.

**Batch 4** (~1.5h): Cat. B — branches completos

Modificar `aboutCommand.ts`, `statsCommand.ts` (incluindo subcomandos), `docsCommand.ts`.

**Batch 5** (~1h): Cat. B especial — `insightCommand.ts`, `clearCommand.ts`

Estes comandos possuem mais efeitos colaterais; commit separado, atualizar testes e testes de integração correspondentes.

**Batch 6** (~2h): Fase 2.2 — habilitar chamadas de modelo para `prompt command`

Modificar `SkillTool`, integrar `getModelInvocableCommands()`, atualizar testes do `SkillTool`.

**Batch 7** (~2h): Fase 2.3 — detecção de mid-input slash

Modificar componente `InputPrompt`, adicionar lógica de acionamento de autocompletar e testes de UI.

**Batch 8** (~30min): Testes completos + verificação de tipos

Executar `npm run typecheck`, `cd packages/cli && npx vitest run`, corrigir problemas remanescentes.

---

## 16. Checklist de Aceitação

**Fase 2.1 Expansão de Comandos**

- [ ] Cat. A: `/export` (e subcomandos), `/plan`, `/statusline` executam normalmente nos modos `non-interactive` e `acp`, retornando saída significativa
- [ ] Cat. A+: `/language` (e subcomandos) executa normalmente em `non-interactive`, definindo configuração persistente
- [ ] Cat. A+: `/copy` retorna texto da última saída da IA em `non-interactive`/`acp` (sem manipular clipboard)
- [ ] Cat. A+: `/restore` sem argumentos retorna lista de checkpoints em `non-interactive`; com argumentos restaura estado e retorna `message` de confirmação (sem retornar `type: 'tool'`)
- [ ] Cat. A': `/model` sem argumentos retorna nome do modelo atual em `non-interactive`/`acp` (sem acionar `dialog`); `/model --fast <id>` define normalmente
- [ ] Cat. A': `/approval-mode` sem argumentos retorna modo atual em `non-interactive`/`acp` (sem acionar `dialog`); com argumentos define normalmente
- [ ] Cat. B: `/about` retorna resumo em texto puro com versão e modelo em `non-interactive`/`acp`
- [ ] Cat. B: `/stats` (incluindo subcomandos) retorna estatísticas em texto puro em `non-interactive`/`acp`
- [ ] Cat. B: `/insight` gera arquivo de insight e retorna caminho do arquivo em `non-interactive`/`acp` (sem abrir navegador)
- [ ] Cat. B: `/docs` retorna URL da documentação em `non-interactive`/`acp` (sem abrir navegador)
- [ ] Cat. B: `/clear` retorna `message` de limite de contexto em `non-interactive`/`acp`, `geminiClient.resetChat()` executa normalmente
- [ ] Todos os 13 comandos mantêm comportamento idêntico ao pré-refatoração no modo `interactive` (zero degradação)
- [ ] Compilação TypeScript sem erros (`npm run typecheck`)
- [ ] `npm run lint` sem novos erros
- [ ] Todos os testes existentes passam (`cd packages/cli && npx vitest run`)

**Fase 2.2 Chamadas de Modelo**

- [ ] O modelo pode chamar bundled skill, file command (usuário/projeto) e MCP prompt via `SkillTool` durante a conversa
- [ ] O modelo não pode chamar comandos built-in
- [ ] A descrição da ferramenta `SkillTool` inclui nome e descrição de todos os comandos com `modelInvocable: true`

**Fase 2.3 mid-input slash**

- [ ] Digitar `/` no corpo da caixa de entrada aciona menu de autocompletar de comandos (não restrito ao início da linha)
- [ ] Menu exibe nome do comando + description
- [ ] Seleção do autocompletar preenche corretamente a caixa de entrada