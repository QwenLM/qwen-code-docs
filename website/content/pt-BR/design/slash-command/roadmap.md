# Roteiro de Refatoração do Slash Command

## Objetivo Geral

Entregar uma plataforma de commands com 95% de paridade na experiência externa com o Claude Code, utilizando o estilo de arquitetura interna do Qwen, enquanto resolve três problemas centrais: a fragmentação entre os três modos, a origem única dos commands e a impossibilidade de o modelo invocar prompt commands.

---

## Princípios de Design Centrais

1. **Cada Phase pode ser entregue de forma independente**: após a conclusão, o comportamento é autossuficiente e não depende de fases futuras para funcionar
2. **A Phase 1 é infraestrutura pura**: além de corrigir a interceptação incorreta do `MCP_PROMPT`, não altera nenhum conjunto de commands existente
3. **Mudanças de comportamento e de arquitetura são separadas**: a Phase 1 cuida da arquitetura, a Phase 2 cuida da expansão de capacidades
4. **Não copiar a arquitetura interna do Claude Code**: mas alinhar as capacidades perceptíveis pelo usuário

---

## Phase 1: Reconstrução da Infraestrutura (arquitetura pura, zero mudança de comportamento)

### Objetivo

Estabelecer um modelo unificado de metadados de commands e um mecanismo de gerenciamento cross-mode para fornecer a base para todas as fases subsequentes.

### Funcionalidades

#### 1.1 Expansão do modelo de metadados `SlashCommand`

Adicionar os seguintes campos à interface `SlashCommand` existente:

**Campos de origem**

- `source: CommandSource`: enum de origem do command (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt`, etc.)
- `sourceLabel?: string`: label de origem para exibição (ex. `"Built-in"` / `"MCP: github-server"`)

**Campos de capacidade de modo**

- `supportedModes: ExecutionMode[]`: declara em quais modos de execução está disponível (`interactive` / `non_interactive` / `acp`)

**Campos de tipo de execução**

- `commandType: CommandType`: declara o tipo de execução (`prompt` / `local` / `local-jsx`)

**Campos de visibilidade**

- `userInvocable: boolean`: se o usuário pode invocar via slash command (padrão `true`)
- `modelInvocable: boolean`: se o modelo pode invocar via tool call (padrão `false`)

**Campos de metadados auxiliares** (reservados para a Phase 3; na Phase 1 apenas definidos, não utilizados)

- `argumentHint?: string`: dica de argumento, ex. `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string`: explicação de quando invocar o command (para uso do modelo)
- `examples?: string[]`: exemplos de uso

#### 1.2 Preenchimento dos campos source/commandType pelo Loader

Cada Loader deve preencher `source` e `commandType` ao construir um `SlashCommand`:

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | Declarado por cada command (`local` / `local-jsx`) |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader` (usuário/projeto) | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader` (plugin)      | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 Declaração de `supportedModes` e `commandType` para commands built-in

Declarar explicitamente para todos os commands built-in:

- `commandType`: `local` (sem dependência de UI) ou `local-jsx` (depende de dialog/React)
- `supportedModes`: commands do tipo `local` declaram `['interactive', 'non_interactive', 'acp']`; commands do tipo `local-jsx` declaram `['interactive']`

#### 1.4 Substituição da whitelist hard-coded por filtro baseado em capabilities

- Remover a constante `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Remover a função `filterCommandsForNonInteractive`
- Adicionar a função `filterCommandsForMode(commands, mode)`, filtrando com base no campo `supportedModes`
- Adicionar a função utilitária `getEffectiveSupportedModes(cmd)` (considera a estratégia padrão do `CommandKind`)
- Modificar as assinaturas das funções `handleSlashCommand` / `getAvailableCommands`, removendo o parâmetro `allowedBuiltinCommandNames`

#### 1.5 Upgrade do CommandService para um Registry unificado

- Adicionar o método `getCommandsForMode(mode: ExecutionMode)`
- Adicionar o método `getModelInvocableCommands()` (usado nas Phases 2/3; a Phase 1 fornece a interface)
- Manter o `getCommands()` existente inalterado (usado no modo interactive)

### Critérios de Aceite

- [ ] A interface `SlashCommand` contém todos os novos campos e compila no TypeScript
- [ ] Todos os Loaders preenchem os campos `source` e `commandType`
- [ ] Todos os commands built-in declaram `commandType` e `supportedModes`
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` foi removido e substituído pelo filtro de capabilities
- [ ] **O conjunto de commands disponíveis no modo non-interactive é exatamente o mesmo de antes da refatoração** (testes existentes não quebram)
- [ ] MCP prompt commands executam normalmente nos modos non-interactive/acp (corrige a restrição incorreta anterior)
- [ ] `CommandService.getCommandsForMode('non_interactive')` retorna o conjunto correto de commands
- [ ] Todos os testes existentes passam

---

## Phase 2: Expansão de Capacidades (organização de commands e invocação de prompt command pelo modelo)

### Objetivo

Com base nos metadados da Phase 1, expandir o escopo de commands disponíveis nos três modos e habilitar a invocação de prompt commands pelo modelo.

### Funcionalidades

#### 2.1 Expansão do conjunto de commands disponíveis para non-interactive / acp

**Princípios de Design Semântico para ACP**

Antes de estender commands para os modos ACP/non-interactive, siga estes princípios de design:

1. **Destinatário diferente**: no modo ACP, o destinatário das mensagens é a IDE (plugin Zed/VS Code), não o usuário final. O conteúdo deve ser em texto puro ou Markdown, sem estilos ANSI específicos de terminal.
2. **Estratégia de implementação é adicionar branching por modo, não substituir**: a abordagem correta é adicionar uma verificação de modo dentro do `action` do command — o caminho interactive mantém a lógica de renderização de UI existente, enquanto o caminho non_interactive/acp retorna um `message` ou `submit_prompt` adequado para consumo por máquina. Ambos os caminhos coexistem na mesma função `action`.
3. **Operações com estado devem ter semântica clara**: em uma única chamada não interativa (ex. parâmetro `-p` da CLI), alterações em commands com estado como `/model set` ou `/language set` são válidas apenas para a session atual e devem ser indicadas no texto de resposta do command.
4. **Somente leitura vs. com efeitos colaterais**: commands somente leitura (ex. `/about`, `/stats`) retornam diretamente o texto do estado atual; commands com efeitos colaterais (ex. `/model set`, `/language set`) devem confirmar o resultado da operação na resposta.
5. **Evitar efeitos colaterais dependentes de ambiente**: operações que dependem de ambiente gráfico, como abrir navegador (`/docs`, `/insight`) ou manipular área de transferência (`/copy`), devem ser ignoradas no caminho non_interactive/acp, retornando a URL ou o conteúdo diretamente no texto da resposta.

**Visão Geral dos Commands a Serem Expandidos**

> Nota: `btw`, `bug`, `compress`, `context`, `init` e `summary` já foram expandidos para todos os modos na Phase 1 e não estão nesta lista.

Os 13 commands abaixo serão expandidos para os modos `non_interactive` e `acp` na Phase 2:

**Classe A: `action` já retorna `message` ou `submit_prompt`; basta expandir `supportedModes` e definir o conteúdo da mensagem ACP**

| Command          | Tipo de retorno        | Pontos de tratamento ACP/non-interactive                       |
| ------------- | --------------- | -------------------------------------------------- |
| `/copy`       | `message`       | Sem área de transferência no ACP; retornar o conteúdo ou um aviso no texto da resposta |
| `/export`     | `message`       | Retornar o caminho completo do arquivo exportado                             |
| `/plan`       | `submit_prompt` | Nenhuma alteração necessária; expandir o modo diretamente                             |
| `/restore`    | `message`       | Retornar a descrição do resultado da operação de restauração                             |
| `/language`   | `message`       | Retornar a configuração de idioma atual ou texto de confirmação da alteração                     |
| `/statusline` | `submit_prompt` | Nenhuma alteração necessária; expandir o modo diretamente                             |

**Classe A': executa normalmente com argumentos; aciona dialog sem argumentos (requer tratamento non-interactive para o caminho sem argumentos)**

| Command             | Comportamento interactive sem argumentos | Comportamento non_interactive/acp sem argumentos |
| ---------------- | ----------------------- | ------------------------------- |
| `/model`         | Abre dialog de seleção de modelo     | Retorna o nome do modelo atual e texto explicativo      |
| `/approval-mode` | Abre dialog de modo de aprovação     | Retorna o modo de aprovação atual e texto explicativo      |

**Classe B: `action` usa `context.ui.addItem()` para renderizar componentes React; requer branching por modo para retornar texto puro**

| Command       | Comportamento interactive          | Conteúdo retornado non_interactive/acp                                                        |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `/about`   | Renderiza componente React de versão/configuração  | Resumo em texto puro da versão, modelo atual e configurações principais                                              |
| `/stats`   | Renderiza componente de estatísticas de token/custo   | Formato em texto puro das estatísticas da session                                                        |
| `/insight` | Renderiza componente de análise + abre navegador | `non_interactive` gera e retorna o caminho do arquivo de forma síncrona; `acp` envia progresso e resultados via `stream_messages` |
| `/docs`    | Renderiza entrada de documentação + abre navegador | Retorna a URL da documentação, sem abrir o navegador                                                          |

**Classe C: Tratamento especial**

| Command     | Comportamento interactive                       | Comportamento non_interactive/acp                                                                            |
| -------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/clear` | Chama `context.ui.clear()` para limpar o terminal | Retorna uma message de delimitação de contexto com o conteúdo `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 Habilitação da invocação de prompt command pelo modelo

- Implementar `getModelInvocableCommands()` no `CommandService` (ou `CommandRegistry`), retornando todos os commands com `modelInvocable: true`
- Marcar os commands carregados pelo `BundledSkillLoader` e `FileCommandLoader` (commands de usuário/projeto) como `modelInvocable: true`
- **MCP prompt não é marcado como `modelInvocable`**: o MCP prompt é invocado pelo modelo por meio de um mecanismo independente de MCP tool call, sem passar pelo `SkillTool`
- Adaptar o `SkillTool`: em vez de consumir apenas `SkillManager.listSkills()`, passar a consumir também `CommandService.getModelInvocableCommands()`
- Construir uma descrição unificada dos commands invocáveis pelo modelo e injetá-la na description do `SkillTool`

#### 2.3 Detecção de mid-input slash command (versão básica)

- Detectar o token slash próximo ao cursor no `InputPrompt` (não restrito ao início da linha)
- Após detectar o token slash, sugerir o nome do command com melhor correspondência via inline ghost text (aceito com Tab)
- **Não** inclui menu dropdown de autocomplete, argument hints, source badge, etc. (feito na Phase 3)
- O conjunto de candidatos para o ghost text é restrito a commands com `modelInvocable: true` (skill / file command)

### Critérios de Aceite

**2.1 Expansão de Commands**

- [ ] Classe A: `/copy`, `/export`, `/plan`, `/restore`, `/language`, `/statusline` executam normalmente nos modos non-interactive e acp e retornam saída de texto significativa
- [ ] Classe A': `/model`, `/approval-mode` retornam o texto do estado atual nos modos non-interactive/acp quando sem argumentos (sem acionar dialog); com argumentos, executam a alteração e retornam texto de confirmação
- [ ] Classe B: `/about`, `/stats`, `/docs` retornam texto puro nos modos non-interactive/acp; `/docs` não abre o navegador; `/insight` gera e retorna uma message com o caminho do arquivo de forma síncrona no `non_interactive`, e envia progresso via `stream_messages` no `acp`
- [ ] Classe C: `/clear` retorna uma message de delimitação de contexto nos modos non-interactive/acp, sem chamar `context.ui.clear()`
- [ ] Todos os commands expandidos mantêm o comportamento exatamente igual ao de antes da refatoração no modo interactive (sem regressão)

**2.2 Invocação pelo Modelo**

- [ ] O modelo pode invocar bundled skill e file command (usuário/projeto) via `SkillTool` durante a conversa
- [ ] O MCP prompt não passa pelo `SkillTool` e é invocado nativamente pelo modelo via mecanismo de MCP tool call
- [ ] O modelo não pode invocar built-in commands (`userInvocable: true`, `modelInvocable: false`)
- [ ] A description do `SkillTool` contém as descrições de todos os commands `modelInvocable`

**2.3 mid-input slash**

- [ ] mid-input slash: ao digitar `/` no corpo do texto, o inline ghost text sugere o command com melhor correspondência (aceito com Tab)

---

## Phase 3: Alinhamento de Experiência (melhoria de autocomplete + adição de commands do Claude Code)

### Objetivo

Com base nos metadados e capacidades de commands das Phases 1/2, aprimorar a experiência de autocomplete e adicionar commands presentes no Claude Code que estão ausentes no Qwen Code.

### Funcionalidades

#### 3.1 Aprimoramento da Experiência de Autocomplete

**source badge**

- Exibir labels de origem dos commands no menu de autocomplete (`[MCP]` já existe; expandir para `[Skill]`, `[Custom]`, etc.)
- Renderizar usando os campos `source` / `sourceLabel`

**argument hint**

- Exibir `argumentHint` após o nome do command no menu de autocomplete (ex. `set <model-id>`)
- `argumentHint` é fornecido pelo campo de metadados da Phase 1

**recently used 排序**

- Rastrear os commands usados recentemente pelo usuário (nível de session, sem necessidade de persistência)
- Dar peso maior aos commands usados recentemente na ordenação do autocomplete

**alias 命中高亮**

- Quando o autocomplete corresponder a `altNames` em vez do nome principal, indicar na exibição (ex. `help (alias: ?)`)

**Alinhamento da Estratégia de Conflito**

- Definir prioridade clara: built-in > bundled/skill-dir > plugin > mcp
- Em caso de conflito, renomear o command de menor prioridade (ex. `pluginName.commandName`)

#### 3.2 Versão completa do mid-input slash command

- Adicionar exibição de argument hints e source badge à versão básica da Phase 2
- Sugestão de ghost text (exibir `/help` em tom claro ao digitar `/he`)
- Destaque de token de command válido (slash command correspondido exibido em cor diferente)

#### 3.3 Refatoração do Diretório `/help`

Alterar `/help` de uma lista plana para um diretório agrupado:

- **Built-in Commands** (local + local-jsx, com indicação do mode)
- **Bundled Skills**
- **Custom Commands** (file commands de usuário/projeto)
- **Plugin Commands**
- **MCP Commands**

Cada command exibe: nome, argumentHint, description, source e marcação de supportedModes

#### 3.4 Aprimoramento de Metadados para ACP available commands

Expor mais metadados ao cliente ACP em `sendAvailableCommandsUpdate()`:

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands` (lista de nomes)
- `modelInvocable`

#### 3.5 Adição de Commands Ausentes do Claude Code

Adicionar commands comuns presentes no Claude Code que atualmente não existem no Qwen Code:

| Command             | Tipo    | Descrição                                     |
| ---------------- | ------- | ---------------------------------------- |
| `/doctor`        | `local` | Autodiagnóstico do ambiente; exibe diagnóstico de configuração/conexão/status de ferramentas     |
| `/release-notes` | `local` | Exibe o changelog da versão atual                   |
| `/cost`          | `local` | Exibe o consumo de tokens e estimativa de custos da session atual |

> Nota: commands de tarefas como `/review` e `/commit` são fornecidos como bundled skill e não estão nesta lista.

### Critérios de Aceite

- [ ] O menu de autocomplete exibe source badge (`[MCP]`, `[Skill]`, `[Custom]`)
- [ ] O menu de autocomplete exibe argumentHint (ex. `set <model-id>`)
- [ ] Commands usados recentemente aparecem primeiro na lista de autocomplete
- [ ] Quando um alias é correspondido, o nome original é indicado no item de autocomplete
- [ ] mid-input slash: a sugestão de ghost text é renderizada corretamente
- [ ] A saída de `/help` é agrupada por origem, e cada command exibe a marcação de modos suportados
- [ ] ACP available commands contém os campos `argumentHint`, `source` e `subcommands`
- [ ] Os três commands `/doctor`, `/release-notes` e `/cost` estão disponíveis
- [ ] `/doctor` é executável no modo non-interactive (retorna `message`)

---

## Dependências entre as Phases

```
Phase 1 (metadados + filtro unificado)
    │
    ├──► Phase 2 (expansão de capacidades)
    │        │
    │        ├──► divisão de subcommands do slash command
    │        └──► invocação de prompt command pelo modelo (requer getModelInvocableCommands())
    │
    └──► Phase 3 (alinhamento de experiência)
             │
             ├──► source badge (requer campo source da Phase 1)
             ├──► argument hint (requer campo argumentHint da Phase 1)
             └──► agrupamento do Help (requer campo source da Phase 1)
```

As Phases 2 e 3 não dependem uma da outra e podem ser desenvolvidas em paralelo (ou ter subitens reordenados conforme a prioridade).