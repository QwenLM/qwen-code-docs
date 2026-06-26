# Documento de Design Técnico da Fase 2: Extensão de Capacidades

## 1. Objetivos e Restrições de Design

### 1.1 Objetivos

- Estender o `supportedModes` de 13 comandos built-in para incluir `non_interactive` e/ou `acp`
- Garantir que cada comando estendido retorne conteúdo textual adequado para consumo pela IDE nos caminhos ACP/não interativos
- Viabilizar o fluxo de invocação de modelo do comando prompt (`SkillTool` consumir `getModelInvocableCommands()`)
- Implementar detecção básica de slash command no meio da entrada (mid-input)

### 1.2 Restrições Obrigatórias

- **Degradação zero no caminho interativo**: O comportamento interativo existente de todos os comandos estendidos deve permanecer estritamente inalterado, adicionando apenas ramificações de modo dentro da ação, sem tocar no código do caminho interativo
- **Estratégia de implementação: ramificação de modo, não registro duplo**: Os 13 comandos devem usar a verificação `executionMode` dentro da `action`, sem usar o modo de registro duplo descrito na Seção 10.2 do documento de design da Fase 1 (registro duplo só é necessário quando a lógica interativa e não interativa difere drasticamente, o que não é o caso para a complexidade dos comandos desta fase)
- **Formato de mensagem ACP**: O conteúdo textual retornado pelo caminho ACP não deve conter estilos ANSI, preferencialmente Markdown ou texto simples, voltado para consumo por plugins de IDE
- **Pular efeitos colaterais dependentes do ambiente**: Operações que dependem de ambiente gráfico, como abrir navegador (`open()`), manipular área de transferência (`copyToClipboard()`), devem ser ignoradas nos caminhos não interativo/ACP

---

## 2. Estado Base Após a Conclusão da Fase 1

Principais pontos da arquitetura após a Fase 1 (a Fase 2 estende diretamente sobre isso):

- O campo `commandType` foi removido da interface `SlashCommand`, todos os comandos agora usam `supportedModes` explícito
- `getEffectiveSupportedModes()` tem inferência em dois níveis: `supportedModes` explícito → fallback para `CommandKind`
- `CommandService.getCommandsForMode(mode)` substitui a antiga lista branca `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- `btw`, `bug`, `compress`, `context`, `init`, `summary` já foram estendidos para todos os modos na Fase 1, **não estão na lista desta fase**
- Todos os métodos em `createNonInteractiveUI()` são no-op: `addItem`, `clear`, `setDebugMessage`, `setPendingItem`, `reloadCommands` ignoram chamadas silenciosamente

---

## 3. Visão Geral do Escopo de Mudanças

Esta fase abrange 13 comandos, classificados em quatro categorias por complexidade de implementação:

| Categoria     | Comandos                                      | Principais Mudanças                                                                                      |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Classe A**  | `export`                                      | Apenas alterar `supportedModes`, todas as rotas da action já retornam tipos válidos                      |
| **Apenas interativo** | `plan`, `statusline`                | Decisão de design: semanticamente acoplados à interface interativa, manter `supportedModes: ['interactive']` |
| **Classe A+** | `language`                                    | Alterar `supportedModes` + pequeno tratamento de ramificação não interativa                              |
| **Apenas interativo** | `copy`, `restore`                   | Decisão de design: área de transferência e restauração de snapshot são essencialmente interativos, manter `supportedModes: ['interactive']` |
| **Classe A'** | `model`, `approval-mode`                      | Caminho com parâmetros já retorna `message`, caminho sem parâmetros precisa de nova ramificação não interativa (atualmente dispara dialog) |
| **Classe B**  | `about`, `stats`, `insight`, `docs`, `clear`  | Todas as rotas da action não retornam valor ou chamam `addItem`/`clear`, precisam de ramificação não interativa completa |

---

## 4. Classe A: Apenas Alterar `supportedModes`

Todos os caminhos de `action` desses três comandos já retornam `message` ou `submit_prompt`, sem dependência de UI, e `handleCommandResult` pode processá-los diretamente.

### 4.1 `/export` (e subcomandos)

**Estado atual**: `supportedModes: ['interactive']`, todas as actions dos subcomandos retornam `MessageActionReturn`.

**Mudança**: Alterar `supportedModes` do comando pai e dos quatro subcomandos (`md`, `html`, `json`, `jsonl`) para `['interactive', 'non_interactive', 'acp']`.

**Conteúdo da mensagem ACP**: O conteúdo retornado pela action já inclui o caminho completo do arquivo (ex: `Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`), amigável para consumo pela IDE, sem necessidade de alteração no texto.

> **Nota**: O comando pai `/export` não possui `action`, apenas subcomandos. Ao alterar o `supportedModes` do pai para todos os modos, `parseSlashCommand` consegue rotear os subcomandos, mas se o usuário digitar apenas `/export` sem subcomando, `commandToExecute.action` será undefined, e `handleSlashCommand` retornará `no_command`, exibindo dicas de subcomandos disponíveis. Este é o comportamento esperado.

### 4.2 `/plan`

**Estado atual**: `supportedModes: ['interactive']`, todas as rotas da action retornam `MessageActionReturn` ou `SubmitPromptActionReturn`.

**Decisão de design**: `/plan` é um comando que guia o usuário em uma interação de planejamento em múltiplas rodadas, semanticamente acoplado à interface interativa. Após discussão, decidiu-se manter `supportedModes: ['interactive']`, sem estender para modos não interativo/ACP.

### 4.3 `/statusline`

**Estado atual**: `supportedModes: ['interactive']`, action sempre retorna `SubmitPromptActionReturn` (envia o prompt de invocação do subagente para o modelo).

**Decisão de design**: `/statusline` é um comando que dispara o subagente para resumir o estado atual, semanticamente acoplado à interface interativa. Após discussão, decidiu-se manter `supportedModes: ['interactive']`, sem estender para modos não interativo/ACP.

---

## 5. Classe A+: Pequeno Tratamento de Ramificação Não Interativa

### 5.1 `/language`

**Estado atual**: Todas as rotas da action retornam `MessageActionReturn` (ler/definir configuração de idioma).

**Efeito colateral a tratar**: `setUiLanguage()` chama `context.ui.reloadCommands()`, que em UI não interativa já é no-op, sem necessidade de tratamento adicional.

**Mudança**:

- Alterar `supportedModes` do comando pai e dos subcomandos (`ui`, `output`, e os gerados dinamicamente por `SUPPORTED_LANGUAGES`) para `['interactive', 'non_interactive', 'acp']`.
- A action não precisa adicionar ramificação de modo, o texto retornado já é adequado para consumo por máquina.

**Esclarecimento semântico do ACP**: Executar `/language ui zh-CN` no modo não interativo (chamada única) modificará a configuração persistente (escrevendo no arquivo de configurações), e a alteração terá efeito nas sessões seguintes. A internacionalização (i18n) na sessão atual também será aplicada imediatamente. Isso está alinhado com as expectativas do usuário.

### 5.2 `/copy`

**Estado atual**: Action chama `copyToClipboard()`, que em ambiente ACP/headless pode lançar exceção ou falhar silenciosamente (área de transferência indisponível).

**Mudança**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Adicionar ramificação de modo na action:

```typescript
// Obter última mensagem do AI (lógica existente, reutilizável)
if (context.executionMode !== 'interactive') {
  // Não interativo/ACP: pular área de transferência, retornar o conteúdo
  if (!lastAiOutput) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'Nenhuma saída no histórico.',
    };
  }
  return {
    type: 'message',
    messageType: 'info',
    content: lastAiOutput,
  };
}
// Caminho interativo: lógica de área de transferência existente inalterada
await copyToClipboard(lastAiOutput);
return {
  type: 'message',
  messageType: 'info',
  content: 'Última saída copiada para a área de transferência',
};
```

**Semântica ACP**: A IDE recebe o texto original da última saída do modelo, podendo decidir se escreve na área de transferência ou exibe ao usuário.

### 5.3 `/restore`

**Estado atual**: `supportedModes: ['interactive']`.

**Decisão de design**: A restauração de snapshot posteriormente reexecuta chamadas de ferramenta, semanticamente acoplada à interface interativa. Após discussão, decidiu-se manter `supportedModes: ['interactive']`, sem estender para modos não interativo/ACP.

**Semântica ACP**: A restauração do estado git do checkpoint e a configuração do histórico do cliente Gemini são executadas como efeitos colaterais; a IDE recebe uma mensagem de confirmação e pode notificar o usuário "Estado restaurado". A reexecução das ferramentas fica a cargo da IDE decidir se dispara.

---

## 6. Classe A': Tratamento Não Interativo para Caminhos de Dialog Sem Parâmetros

### 6.1 `/model`

**Estado atual**:

| Entrada                            | Comportamento Atual                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `/model` (sem parâmetros)          | → `{ type: 'dialog', dialog: 'model' }` (torna-se unsupported no não interativo)      |
| `/model <model-id>`                | Não implementado (apenas ramificação `--fast`)                                        |
| `/model --fast` (sem nome modelo)  | → `{ type: 'dialog', dialog: 'fast-model' }` (torna-se unsupported no não interativo) |
| `/model --fast <model-id>`         | → `MessageActionReturn` ✅                                                            |

**Mudança**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Inserir ramificação não interativa antes de cada caminho de dialog na action:

```typescript
// Caminho sem parâmetros (original retornava dialog: 'model')
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentModel = config.getModel() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Modelo atual: ${currentModel}\nUse "/model <model-id>" para trocar de modelo.`,
    };
  }
  return { type: 'dialog', dialog: 'model' };
}

// Caminho --fast sem parâmetros (original retornava dialog: 'fast-model')
if (args.startsWith('--fast') && !modelName) {
  if (context.executionMode !== 'interactive') {
    const fastModel = context.services.settings?.merged?.fastModel ?? 'não definido';
    return {
      type: 'message',
      messageType: 'info',
      content: `Modelo rápido atual: ${fastModel}\nUse "/model --fast <model-id>" para definir o modelo rápido.`,
    };
  }
  return { type: 'dialog', dialog: 'fast-model' };
}
```

**Semântica ACP**: A IDE exibe o nome do modelo atual para referência do usuário; a troca de modelo é feita via chamada com parâmetros (`/model <model-id>`).

> **Nota**: `/model <model-id>` (sem `--fast`) atualmente não possui lógica para definir o modelo da sessão atual, apenas `--fast <model-id>` tem. Se a Fase 2 quiser suportar a troca do modelo principal via ACP, será necessário implementar a lógica de definição para `/model <model-id>`. Este design reserva esse caminho, mas marca como opcional da Fase 2, priorizando o caminho somente leitura "visualizar modelo atual".

### 6.2 `/approval-mode`

**Estado atual**:

| Entrada                          | Comportamento Atual                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `/approval-mode` (sem parâmetros) | → `{ type: 'dialog', dialog: 'approval-mode' }` (torna-se unsupported no não interativo) |
| `/approval-mode <mode>`           | → `MessageActionReturn` ✅                                                               |
| `/approval-mode <invalid>`        | → `MessageActionReturn` (erro) ✅                                                        |

**Mudança**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Inserir ramificação não interativa no caminho sem parâmetros (`!args.trim()`):

```typescript
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentMode = config?.getApprovalMode() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Modo de aprovação atual: ${currentMode}\nModos disponíveis: ${APPROVAL_MODES.join(', ')}\nUse "/approval-mode <mode>" para alterar.`,
    };
  }
  return { type: 'dialog', dialog: 'approval-mode' };
}
```

---

## 7. Classe B: Necessita de Ramificação Não Interativa Completa

A action desses cinco comandos, no modo interativo, renderiza componentes React via `context.ui.addItem()` ou chama `context.ui.clear()`, com retorno `void`. No modo não interativo, essas chamadas são no-op, fazendo com que `handleSlashCommand` trate a ausência de retorno como `"Comando executado com sucesso."`, sem produzir conteúdo real.

**Princípio de implementação**: Verificar `executionMode` no **início** da action e, se não for interativo, **retornar antecipadamente** uma `message` com conteúdo real, sem tocar no código do caminho interativo.

### 7.1 `/about` (altName: `status`)

**Fonte de dados**: `getExtendedSystemInfo(context)` retorna `ExtendedSystemInfo` contendo: `cliVersion`, `osPlatform`, `osArch`, `osRelease`, `nodeVersion`, `modelVersion`, `selectedAuthType`, `ideClient`, `sessionId`, `memoryUsage`, `baseUrl`, `apiKeyEnvKey`, `gitCommit`, `fastModel`. Todos os campos estão disponíveis no modo não interativo (context.services.config e settings já foram injetados).

**Mudança**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Após a chamada `getExtendedSystemInfo`, antes do caminho interativo, inserir ramificação de modo:

```typescript
action: async (context) => {
  const systemInfo = await getExtendedSystemInfo(context);

  if (context.executionMode !== 'interactive') {
    const lines = [
      `Qwen Code v${systemInfo.cliVersion}`,
      `Modelo: ${systemInfo.modelVersion}`,
      `Modelo rápido: ${systemInfo.fastModel ?? 'não definido'}`,
      `Autenticação: ${systemInfo.selectedAuthType}`,
      `Plataforma: ${systemInfo.osPlatform} ${systemInfo.osArch} (${systemInfo.osRelease})`,
      `Node.js: ${systemInfo.nodeVersion}`,
      `Sessão: ${systemInfo.sessionId}`,
      ...(systemInfo.gitCommit ? [`Git commit: ${systemInfo.gitCommit}`] : []),
      ...(systemInfo.ideClient ? [`IDE: ${systemInfo.ideClient}`] : []),
    ];
    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
    };
  }

  // Caminho interativo: lógica addItem existente inalterada
  const aboutItem: Omit<HistoryItemAbout, 'id'> = { type: MessageType.ABOUT, systemInfo };
  context.ui.addItem(aboutItem, Date.now());
},
```

### 7.2 `/stats` (e subcomandos `model`, `tools`)

**Fonte de dados**: `context.session.stats` (`SessionStatsState`) contém `sessionStartTime`, `metrics` (`SessionMetrics`: `models`, `tools`, `files`), `promptCount`. No modo não interativo, `sessionStartTime` é o momento da chamada atual, `metrics` vem de `uiTelemetryService.getMetrics()` (valores acumulados da chamada atual, geralmente zero), `promptCount` é 1.

**Mudança**:

1. Alterar `supportedModes` do comando pai `stats` e dos subcomandos `model`, `tools` para `['interactive', 'non_interactive', 'acp']`.
2. Inserir ramificação de modo nas actions do pai e de cada subcomando, retornando estatísticas em formato texto:

```typescript
// Comando principal /stats
action: (context) => {
  if (context.executionMode !== 'interactive') {
    const now = new Date();
    const { sessionStartTime, promptCount, metrics } = context.session.stats;
    if (!sessionStartTime) {
      return { type: 'message', messageType: 'error', content: 'Horário de início da sessão indisponível.' };
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    // Somar tokens de todos os modelos
    let totalPromptTokens = 0, totalCandidateTokens = 0, totalRequests = 0;
    for (const modelMetrics of Object.values(metrics.models)) {
      totalPromptTokens += modelMetrics.tokens.prompt;
      totalCandidateTokens += modelMetrics.tokens.candidates;
      totalRequests += modelMetrics.api.totalRequests;
    }

    const lines = [
      `Duração da sessão: ${formatDuration(wallDuration)}`,
      `Prompts: ${promptCount}`,
      `Requisições de API: ${totalRequests}`,
      `Tokens — prompt: ${totalPromptTokens}, saída: ${totalCandidateTokens}`,
      `Chamadas de ferramenta: ${metrics.tools.totalCalls} (${metrics.tools.totalSuccess} ok, ${metrics.tools.totalFail} falha)`,
      `Arquivos: +${metrics.files.totalLinesAdded} / -${metrics.files.totalLinesRemoved} linhas`,
    ];
    return { type: 'message', messageType: 'info', content: lines.join('\n') };
  }

  // Caminho interativo: lógica addItem existente inalterada
  const statsItem: HistoryItemStats = { type: MessageType.STATS, duration: formatDuration(wallDuration) };
  context.ui.addItem(statsItem, Date.now());
},
```

Os subcomandos `model` e `tools` também inserem ramificações de modo, retornando estatísticas textuais da dimensão correspondente (dimensão modelo: listar uso de tokens por nome de modelo; dimensão ferramenta: listar número de chamadas por ferramenta).

**Explicação**: Em chamadas únicas não interativas, as métricas geralmente são zero (nova sessão), mas a estrutura é completa e não afeta o formato. Em sessões ACP, pode haver valores acumulados significativos.

### 7.3 `/insight`

**Estado atual**: Action retorna `void`, exibe progresso e resultados via `addItem`, e por fim chama `open(outputPath)` para abrir o navegador. A lógica central é `insightGenerator.generateStaticInsight()` que gera um arquivo HTML.

**Mudança**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Três ramificações baseadas em `executionMode`:
   - `non_interactive`: gerar sincronamente, ignorar callback de progresso, não abrir navegador, retornar `message` (caminho do arquivo)
   - `acp`: iniciar geração assíncrona, enviar progresso (`encodeInsightProgressMessage`) e conclusão (`encodeInsightReadyMessage`) via `stream_messages` para a IDE
   - `interactive`: lógica existente de `addItem` + `setPendingItem` + `open()` inalterada

```typescript
// Caminho non_interactive
if (context.executionMode === 'non_interactive') {
  const outputPath = await insightGenerator.generateStaticInsight(
    projectsDir,
    () => {}, // progresso no-op
  );
  return {
    type: 'message',
    messageType: 'info',
    content: t('Relatório de insight gerado em: {{path}}', { path: outputPath }),
  };
}

// Caminho acp: stream_messages
if (context.executionMode === 'acp') {
  // ... construir generator async streamMessages, produzir encodeInsightProgressMessage / encodeInsightReadyMessage ...
  return { type: 'stream_messages', messages: streamMessages() };
}

// Caminho interativo: implementação existente inalterada
```

**Justificativa de design**: O modo `non_interactive` (pipe CLI) não suporta `stream_messages`, só pode retornar uma única `message`; o modo ACP (plugin IDE) pode consumir `stream_messages` e exibir progresso em tempo real, por isso mantém o caminho de streaming.

**Formato da mensagem ACP**: `encodeInsightProgressMessage(stage, progress, detail?)` gera uma mensagem de barra de progresso interpretável pela IDE; `encodeInsightReadyMessage(outputPath)` notifica a IDE de que o arquivo está pronto, cabendo à IDE decidir como exibir o link.

### 7.4 `/docs`

**Estado atual**: Action retorna `void`, exibe mensagem via `addItem` e chama `open(docsUrl)` para abrir o navegador. Há uma ramificação da variável de ambiente `SANDBOX` (no sandbox, apenas addItem, sem abrir navegador).

**Mudança**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Modificar o tipo de retorno da action para `Promise<void | MessageActionReturn>`.
3. Inserir ramificação não interativa no início da action:

```typescript
action: async (context) => {
  const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
  const docsUrl = `https://qwenlm.github.io/qwen-code-docs/${langPath}`;

  if (context.executionMode !== 'interactive') {
    // Não interativo/ACP: retornar URL diretamente, sem abrir navegador, sem chamar addItem
    return {
      type: 'message',
      messageType: 'info',
      content: `Documentação do Qwen Code: ${docsUrl}`,
    };
  }

  // Caminho interativo: lógica SANDBOX + addItem + open() inalterada
  if (process.env['SANDBOX'] && ...) {
    context.ui.addItem(...);
  } else {
    context.ui.addItem(...);
    await open(docsUrl);
  }
},
```

### 7.5 `/clear` (altNames: `reset`, `new`)

**Estado atual**: Action executa as seguintes operações e retorna `void`:

1. `config.getHookSystem()?.fireSessionEndEvent()` — dispara hook (com efeito colateral)
2. `config.startNewSession()` — inicia novo ID de sessão (efeito colateral)
3. `uiTelemetryService.reset()` — redefine contadores de telemetria (efeito colateral)
4. `skillTool.clearLoadedSkills()` — limpa cache de skills (efeito colateral)
5. `context.ui.clear()` — limpa UI do terminal (**efeito colateral de UI, no-op no não interativo**)
6. `geminiClient.resetChat()` — redefine histórico do chat (efeito colateral)
7. `config.getHookSystem()?.fireSessionStartEvent()` — dispara hook (efeito colateral)

**Análise semântica não interativo/ACP**:

- `ui.clear()` no não interativo já é no-op, não precisa ser tratado
- `geminiClient.resetChat()`: em sessão ACP é um efeito colateral significativo (limpar histórico do chat), deve ser mantido; em chamada única não interativa, cada chamada é uma nova sessão, `resetChat` é redundante mas inofensivo
- `config.startNewSession()`: significativo em ACP (iniciar novo ID de sessão); em chamada única não interativa, igualmente redundante mas inofensivo
- `fireSessionEndEvent` / `fireSessionStartEvent`: significativos em ACP (disparar hooks)

**Decisão**: O caminho não interativo/ACP mantém todos os efeitos colaterais significativos (resetChat, startNewSession, eventos de hook), apenas pula `ui.clear()` (já no-op) e retorna uma mensagem de marcação de limite de contexto.

**Mudança**:

1. Alterar `supportedModes` para `['interactive', 'non_interactive', 'acp']`.
2. Modificar o tipo de retorno da action para `Promise<void | MessageActionReturn>`.
3. Dentro da action, após a chamada `context.ui.clear()` (ou em substituição a ela), ramificar conforme o modo:

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

    // ui.clear() no não interativo já é no-op, mas ainda chamamos (sem necessidade de ramificação condicional)
    context.ui.clear();

    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.resetChat();
    }

    config.getHookSystem()?.fireSessionStartEvent(...).catch(...);
  } else {
    context.ui.clear();
  }

  // Decidir valor de retorno baseado no modo
  if (context.executionMode !== 'interactive') {
    return {
      type: 'message',
      messageType: 'info',
      content: 'Contexto limpo. Mensagens anteriores não estão mais no contexto.',
    };
  }
  // Caminho interativo: void (sem retorno, React UI é atualizada por ui.clear())
},
```

**Semântica ACP**: A IDE, ao receber a marcação de limite de contexto, pode exibi-la como um separador de sessão (ex: dica "Nova sessão iniciada") e limpar o cache local do histórico do chat.

---

## 8. Mudanças no `handleCommandResult`

**Conclusão: Nenhuma modificação necessária.**

Após as mudanças desta Fase 2, todos os comandos nos caminhos não interativo/ACP retornam tipos `message` ou `submit_prompt`, que já são tratados corretamente no switch de `handleCommandResult`.

---

## 9. Mudanças no `createNonInteractiveUI()`

**Conclusão: Nenhuma modificação necessária.**

A implementação atual no-op já é suficiente. Métodos no-op como `addItem`, `clear`, `setPendingItem` não serão chamados no caminho não interativo dos comandos da Classe B (devido ao retorno antecipado); no caminho interativo, não são afetados.

---

## 10. Fase 2.2: Integração da Chamada de Modelo do Comando Prompt

Na Fase 1, `CommandService.getModelInvocableCommands()` já foi implementado, e `BundledSkillLoader`, `FileCommandLoader` (comandos de usuário/projeto) e `McpPromptLoader` já possuem `modelInvocable: true`.

O trabalho da Fase 2.2 é fazer com que `SkillTool` consuma não apenas `SkillManager.listSkills()`, mas também `CommandService.getModelInvocableCommands()`, unificando a entrada de comandos invocáveis pelo modelo.

**Arquivo alterado**: `packages/core/src/tools/SkillTool.ts` (ou caminho correspondente)

**Mudanças específicas**:

1. `SkillTool` recebe `CommandService` (ou o resultado de `getModelInvocableCommands()`) como injeção de dependência durante a inicialização
2. Ao construir a descrição da ferramenta, mesclar os resultados de `listSkills()` e `getModelInvocableCommands()`
3. Garantir que comandos built-in (`modelInvocable: false`) não apareçam na descrição da ferramenta

> **Nota**: A implementação concreta de `SkillTool` depende da arquitetura interna de `packages/core`. Este documento descreve apenas as mudanças de interface; os detalhes de implementação precisam ser definidos em conjunto com a estrutura existente do pacote core.

---

## 11. Fase 2.3: Detecção de Slash Command no Meio da Entrada (Versão Básica)

Detectar um token slash próximo ao cursor no componente `InputPrompt` (não limitado ao início da linha), disparando o menu de autocompletar.

**Regras de detecção**:

- Quando houver um token começando com `/` e sem espaços antes do cursor, disparar o autocompletar de comandos
- Os candidatos vêm da lista de comandos visíveis de `getCommandsForMode('interactive')`
- O menu de autocompletar exibe o nome do comando + descrição (sem `argumentHint` etc., a ser complementado na Fase 3)

> Esta funcionalidade é uma mudança na camada de UI, sub-tarefa independente da Fase 2.3, sem impacto na implementação das outras Fases 2.1/2.2.

---

## 12. Resumo de Arquivos Alterados

### 12.1 Arquivos de Comando (Fase 2.1)

| Arquivo                    | Tipo de Mudança | Detalhes                                                                                                                                    |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `exportCommand.ts`         | Classe A        | Comando pai + 4 subcomandos: `supportedModes` → todos os modos                                                                              |
| `planCommand.ts`           | Apenas interativo | Decisão de design: manter `supportedModes: ['interactive']`, inalterado                                                                     |
| `statuslineCommand.ts`     | Apenas interativo | Decisão de design: manter `supportedModes: ['interactive']`, inalterado                                                                     |
| `languageCommand.ts`       | Classe A+       | Comando pai + subcomandos `ui`/`output` + subcomandos dinâmicos de idioma: `supportedModes` → todos os modos                                |
| `copyCommand.ts`           | Apenas interativo | Decisão de design: manter `supportedModes: ['interactive']`, inalterado                                                                     |
| `restoreCommand.ts`        | Apenas interativo | Decisão de design: manter `supportedModes: ['interactive']`, inalterado                                                                     |
| `modelCommand.ts`          | Classe A'       | `supportedModes` → todos os modos + nova ramificação não interativa para caminhos sem parâmetros/sem modelo rápido                          |
| `approvalModeCommand.ts`   | Classe A'       | `supportedModes` → todos os modos + nova ramificação não interativa para caminho sem parâmetros                                             |
| `aboutCommand.ts`          | Classe B        | `supportedModes` → todos os modos + caminho não interativo retorna `message` (resumo versão/modelo/ambiente)                                |
| `statsCommand.ts`          | Classe B        | `supportedModes` → todos os modos + caminho não interativo retorna `message` (texto de estatísticas); subcomandos processados em conjunto   |
| `insightCommand.ts`        | Classe B        | `supportedModes` → todos os modos + caminho `non_interactive` gera síncrono retorna `message` (caminho do arquivo); caminho `acp` retorna `stream_messages` com envio de progresso |
| `docsCommand.ts`           | Classe B        | `supportedModes` → todos os modos + caminho não interativo retorna `message` (URL da documentação), sem abrir navegador                     |
| `clearCommand.ts`          | Classe B        | `supportedModes` → todos os modos + final da action retorna `message` ou `void` conforme o modo                                             |
### 12.2 Outras alterações de arquivos

| Arquivo                                               | Alterações                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts`                | Fase 2.2: Integrar `getModelInvocableCommands()` (detalhamento a definir) |
| `packages/cli/src/ui/InputPrompt.tsx` (ou componente equivalente) | Fase 2.3: Lógica de detecção de slash no meio da entrada        |

### 12.3 Arquivos inalterados

- `packages/cli/src/nonInteractiveCliCommands.ts` (`handleCommandResult`, `handleSlashCommand` não precisam de modificação)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (UI stub não precisa de modificação)
- `packages/cli/src/services/commandUtils.ts` (`filterCommandsForMode`, `getEffectiveSupportedModes` não precisam de modificação)
- `packages/cli/src/services/CommandService.ts` (`getCommandsForMode`, `getModelInvocableCommands` já implementados na Fase 1)

---

## 13. Estratégia de testes

### 13.1 Testes unitários de comandos

Para cada comando alterado, crie ou atualize o arquivo de teste (`*.test.ts`) no mesmo diretório, cobrindo os seguintes casos:

**Comandos Classe A/A+** (`export`, `language`):

- `supportedModes` deve incluir corretamente `non_interactive` e `acp`
- Em `executionMode: 'non_interactive'`, a action retorna `MessageActionReturn` ou `SubmitPromptActionReturn`, sem chamar `ui.addItem` ou `ui.clear`
- O comportamento interativo deve ser idêntico ao anterior à refatoração (teste de snapshot)

**Comandos apenas interativos** (`plan`, `statusline`, `copy`, `restore`):

- `supportedModes` deve ser `['interactive']` (decisão de design)
- Verificar que, ao executar em modo non-interactive, retorna corretamente `unsupported`

**Comandos Classe A'** (`model`, `approval-mode`):

- Sem parâmetros + `executionMode: 'non_interactive'` → retorna `message` com estado atual, sem retornar `dialog`
- Com parâmetros + `executionMode: 'non_interactive'` → a lógica original de `message` executa normalmente
- Caminho interativo: sem parâmetros → `dialog`, com parâmetros → `message` (inalterado)

**Comandos Classe B** (`about`, `stats`, `insight`, `docs`, `clear`):

- Em `executionMode: 'non_interactive'`, a action retorna `MessageActionReturn`, sem chamar nenhum método `ui.*`
- A string `content` retornada contém os campos‑chave esperados (versão, nome do modelo, URL, etc.)
- Caminho interativo: `ui.addItem` é chamado, `action` retorna `void` (inalterado)

**Caso especial do `clear`**:

- Em `executionMode: 'non_interactive'`, `geminiClient.resetChat()` ainda é chamado (efeito colateral mantido)
- Retorna uma `message` com o conteúdo `'Context cleared. Previous messages are no longer in context.'`

### 13.2 Testes de integração (`handleSlashCommand`)

Em `nonInteractiveCli.test.ts` ou em um novo arquivo de teste de integração:

- `handleSlashCommand('/about', ...)` em modo non-interactive retorna `{ type: 'message', content: contém número da versão }`
- `handleSlashCommand('/stats', ...)` em modo non-interactive retorna `{ type: 'message', content: contém 'Session duration' }`
- `handleSlashCommand('/docs', ...)` em modo non-interactive retorna `{ type: 'message', content: contém 'qwenlm.github.io' }`
- `handleSlashCommand('/clear', ...)` em modo non-interactive retorna `{ type: 'message', content: 'Context cleared.' }`
- `handleSlashCommand('/plan', ...)` em modo non-interactive retorna `unsupported` (comando apenas interativo)
- Comandos non-interactive existentes (`btw`, `bug`, etc.) não sofrem degradação

### 13.3 Testes do `commandUtils`

Em `commandUtils.test.ts`, crie novos testes (ou estenda os existentes) para cobrir:

- Os comandos estendidos (`export`, `language`, etc.) passam pelo filtro `filterCommandsForMode(commands, 'non_interactive')` e `filterCommandsForMode(commands, 'acp')`
- Os comandos apenas interativos (`plan`, `statusline`, `copy`, `restore`) são corretamente filtrados por `filterCommandsForMode(commands, 'non_interactive')`

---

## 14. Análise de impacto no comportamento

| Cenário                                        | Comportamento antes da Fase 2                                 | Comportamento depois da Fase 2           | Natureza         |
| ----------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| Executar `/export md` em non-interactive        | ❌ unsupported (filtrado)                                     | ✅ retorna mensagem com caminho do arquivo | Extensão de capacidade |
| Executar `/plan <tarefa>` em non-interactive    | ❌ unsupported                                                | ❌ unsupported (decisão de design: apenas interativo) | Inalterado    |
| Executar `/statusline` em non-interactive       | ❌ unsupported                                                | ❌ unsupported (decisão de design: apenas interativo) | Inalterado    |
| Executar `/language ui zh-CN` em non-interactive | ❌ unsupported                                               | ✅ define o idioma, retorna mensagem de confirmação | Extensão de capacidade |
| Executar `/copy` em non-interactive             | ❌ unsupported                                                | ❌ unsupported (decisão de design: apenas interativo) | Inalterado    |
| Executar `/restore` (sem parâmetros) em non-interactive | ❌ unsupported                                         | ❌ unsupported (decisão de design: apenas interativo) | Inalterado    |
| Executar `/restore <id>` em non-interactive     | ❌ unsupported                                                | ❌ unsupported (decisão de design: apenas interativo) | Inalterado    |
| Executar `/model` em non-interactive            | ❌ unsupported (dialog)                                       | ✅ retorna o nome do modelo atual        | Extensão de capacidade |
| Executar `/model <id>` em non-interactive       | ❌ unsupported                                                | 🔄 Opcional na Fase 2: implementar lógica de troca | Extensão de capacidade (opcional) |
| Executar `/approval-mode` em non-interactive    | ❌ unsupported (dialog)                                       | ✅ retorna o modo de aprovação atual     | Extensão de capacidade |
| Executar `/approval-mode yolo` em non-interactive | ❌ unsupported                                              | ✅ define o modo, retorna confirmação    | Extensão de capacidade |
| Executar `/about` em non-interactive            | ❌ retorna "Command executed successfully." (addItem no-op)   | ✅ retorna resumo versão/modelo/ambiente | Correção de bug + extensão |
| Executar `/stats` em non-interactive            | ❌ retorna "Command executed successfully."                   | ✅ retorna texto de estatísticas da sessão | Correção de bug + extensão |
| Executar `/insight` em non-interactive          | ❌ retorna "Command executed successfully." (gerado mas sem saída) | ✅ gera e retorna caminho do arquivo | Correção de bug + extensão |
| Executar `/docs` em non-interactive             | ❌ retorna "Command executed successfully."                   | ✅ retorna URL da documentação           | Correção de bug + extensão |
| Executar `/clear` em non-interactive            | ❌ retorna "Command executed successfully."                   | ✅ retorna mensagem de limite do contexto | Correção de bug + extensão |
| Executar qualquer comando acima em interactivo  | ✅ Comportamento original                                     | ✅ Comportamento original (zero degradação) | Inalterado    |

---

## 15. Ordem de implementação

Sugere‑se seguir a ordem abaixo; cada grupo pode ser commitado e revisado de forma independente.

**Lote 1** (~30min): Classe A — apenas alterar `supportedModes`

Modificar `exportCommand.ts` (e seus subcomandos). Verificar se os testes passam.

**Lote 2** (~45min): Classe A+ — poucas ramificações

Modificar `languageCommand.ts`, adicionar ramificação não interativa para caminhos com efeitos colaterais. Atualizar testes correspondentes. (`copyCommand.ts` e `restoreCommand.ts`, após discussão, permanecem apenas interativos.)

**Lote 3** (~45min): Classe A' — caminhos de dialog

Modificar `modelCommand.ts`, `approvalModeCommand.ts`, adicionar ramificação não interativa para caminhos sem parâmetros. Atualizar testes correspondentes.

**Lote 4** (~1,5h): Classe B — ramificações completas

Modificar `aboutCommand.ts`, `statsCommand.ts` (incluindo subcomandos), `docsCommand.ts`.

**Lote 5** (~1h): Classe B especiais — `insightCommand.ts`, `clearCommand.ts`

Esses dois comandos têm mais efeitos colaterais; commit separado. Atualizar testes correspondentes e testes de integração.

**Lote 6** (~2h): Fase 2.2 — integração do comando prompt com chamada de modelo

Modificar `SkillTool`, integrar `getModelInvocableCommands()`, atualizar testes do SkillTool.

**Lote 7** (~2h): Fase 2.3 — detecção de slash no meio da entrada

Modificar o componente `InputPrompt`, adicionar lógica de ativação de autocompletar e testes de UI.

**Lote 8** (~30min): Teste completo + verificação de tipos

Executar `npm run typecheck`, `cd packages/cli && npx vitest run`, corrigir problemas restantes.

---

## 16. Checklist de aceitação

**Fase 2.1 – Extensão de comandos**

- [ ] Classe A: `/export` (e subcomandos), `/plan`, `/statusline` executam corretamente nos modos non-interactive e acp, retornando saída significativa
- [ ] Classe A+: `/language` (e subcomandos) executa corretamente em non-interactive, com persistência da configuração
- [ ] Classe A+: `/copy` em non-interactive/acp retorna o texto da última saída da IA (não manipula a área de transferência)
- [ ] Classe A+: `/restore` sem parâmetros em non-interactive retorna a lista de checkpoints; com parâmetros restaura o estado e retorna mensagem de confirmação (sem retornar `type: 'tool'`)
- [ ] Classe A': `/model` sem parâmetros em non-interactive/acp retorna o nome do modelo atual (sem disparar dialog); `/model --fast <id>` define normalmente
- [ ] Classe A': `/approval-mode` sem parâmetros em non-interactive/acp retorna o modo atual (sem dialog); com parâmetros define normalmente
- [ ] Classe B: `/about` em non-interactive/acp retorna um resumo em texto simples contendo versão e nome do modelo
- [ ] Classe B: `/stats` (incluindo subcomandos) em non-interactive/acp retorna estatísticas em texto simples
- [ ] Classe B: `/insight` em non-interactive/acp gera o arquivo de insight e retorna o caminho do arquivo (sem abrir navegador)
- [ ] Classe B: `/docs` em non-interactive/acp retorna a URL da documentação (sem abrir navegador)
- [ ] Classe B: `/clear` em non-interactive/acp retorna mensagem de marcação de limite de contexto, e `geminiClient.resetChat()` é executado normalmente
- [ ] Todos os 13 comandos no modo interativo mantêm comportamento idêntico ao anterior à refatoração (sem degradação)
- [ ] Compilação TypeScript sem erros (`npm run typecheck`)
- [ ] `npm run lint` sem novos erros
- [ ] Todos os testes existentes passam (`cd packages/cli && npx vitest run`)

**Fase 2.2 – Chamada de modelo**

- [ ] O modelo pode, durante o diálogo, invocar via `SkillTool` comandos bundled skill, file command (usuário/projeto) e MCP prompt
- [ ] O modelo **não** pode invocar comandos built‑in
- [ ] A tool description do `SkillTool` contém o nome e a descrição de todos os comandos com `modelInvocable: true`

**Fase 2.3 – Slash no meio da entrada**

- [ ] Ao digitar `/` no corpo do campo de entrada (não apenas no início da linha), o menu de autocompletar de comandos é acionado
- [ ] O menu exibe nome do comando + descrição
- [ ] Após selecionar um item do autocompletar, o campo de entrada é preenchido corretamente