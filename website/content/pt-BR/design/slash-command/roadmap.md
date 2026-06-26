# Roteiro de Refatoração do Slash Command

## Objetivo Geral

Usando o estilo de arquitetura interna do Qwen, entregar uma plataforma de comandos que tenha 95% de alinhamento com a experiência externa do Claude Code, corrigindo ao mesmo tempo três problemas centrais: fragmentação dos três modos, fonte única de comandos, e a incapacidade de prompt command ser chamado pelo modelo.

---

## Princípios Centrais de Design

1. **Cada fase pode ser lançada de forma independente**: o comportamento após a conclusão é autoconsistente, não depende de fases futuras para funcionar.
2. **A Fase 1 é puramente infraestrutura**: exceto pela correção da interceptação incorreta de MCP_PROMPT, nenhum conjunto de comandos disponível existente é alterado.
3. **Mudanças de comportamento separadas de mudanças de arquitetura**: Fase 1 trata da arquitetura, Fase 2 trata da expansão de capacidades.
4. **Não copiar a arquitetura interna do Claude Code**: mas alinhar-se com as capacidades perceptíveis pelo usuário.

---

## Fase 1: Reconstrução da Infraestrutura (Puramente Arquitetura, Zero Mudança de Comportamento)

### Objetivo

Estabelecer um modelo de metadados unificado para comandos e um mecanismo de gerenciamento entre modos, fornecendo suporte subjacente para todas as fases subsequentes.

### Funcionalidades

#### 1.1 Estender o Modelo de Metadados `SlashCommand`

Adicionar os seguintes campos à interface `SlashCommand` existente:

**Campos de Fonte**

- `source: CommandSource`: enumeração da fonte do comando (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt`, etc.)
- `sourceLabel?: string`: rótulo de fonte para exibição (ex.: `"Built-in"` / `"MCP: github-server"`)

**Campos de Capacidade de Modo**

- `supportedModes: ExecutionMode[]`: declara em quais modos de execução está disponível (`interactive` / `non_interactive` / `acp`)

**Campos de Tipo de Execução**

- `commandType: CommandType`: declara o tipo de execução (`prompt` / `local` / `local-jsx`)

**Campos de Visibilidade**

- `userInvocable: boolean`: se o usuário pode invocar via slash command (padrão `true`)
- `modelInvocable: boolean`: se o modelo pode invocar via tool call (padrão `false`)

**Campos de Metadados Auxiliares** (reservados para Fase 3; Fase 1 apenas define, não usa)

- `argumentHint?: string`: dica de argumento, ex.: `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string`: descrição de quando invocar o comando (para uso do modelo)
- `examples?: string[]`: exemplos de uso

#### 1.2 Loaders Preenchem Campos `source` / `commandType`

Cada loader, ao construir um `SlashCommand`, deve preencher `source` e `commandType`:

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | Declarado por cada comando (`local` / `local-jsx`) |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader` (usuário/projeto) | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader` (plugin)     | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 Comandos Embutidos Declaram `supportedModes` e `commandType`

Para todos os comandos built-in, declarar explicitamente:

- `commandType`: `local` (sem dependência de UI) ou `local-jsx` (depende de dialog/React)
- `supportedModes`: comandos do tipo `local` declaram `['interactive', 'non_interactive', 'acp']`; comandos do tipo `local-jsx` declaram `['interactive']`

#### 1.4 Substituir Lista de Permissões Hardcoded por Filtragem Baseada em Capacidade

- Remover a constante `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Remover a função `filterCommandsForNonInteractive`
- Adicionar nova função `filterCommandsForMode(commands, mode)`, que filtra com base no campo `supportedModes`
- Adicionar função utilitária `getEffectiveSupportedModes(cmd)` (considera estratégia padrão de CommandKind)
- Modificar as assinaturas das funções `handleSlashCommand` / `getAvailableCommands`, removendo o parâmetro `allowedBuiltinCommandNames`

#### 1.5 CommandService Atualizado para Registry Unificado

- Adicionar método `getCommandsForMode(mode: ExecutionMode)`
- Adicionar método `getModelInvocableCommands()` (usado nas Fases 2/3; Fase 1 fornece interface)
- O método `getCommands()` existente permanece inalterado (usado no modo interativo)

### Critérios de Aceitação

- [ ] A interface `SlashCommand` contém todos os novos campos; compilação TypeScript bem-sucedida.
- [ ] Todos os loaders preenchem os campos `source` e `commandType`.
- [ ] Todos os comandos built-in declaram `commandType` e `supportedModes`.
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` foi removido, substituído pelo filtro de capacidade.
- [ ] **O conjunto de comandos disponíveis no modo non-interactive é exatamente o mesmo de antes da refatoração** (testes existentes não quebram).
- [ ] MCP prompt commands podem ser executados normalmente nos modos non-interactive/acp (corrigindo a restrição incorreta anterior).
- [ ] `CommandService.getCommandsForMode('non_interactive')` retorna o conjunto correto de comandos.
- [ ] Todos os testes existentes passam.

---

## Fase 2: Expansão de Capacidades (Organização de Comandos e Invocação de Prompt Command pelo Modelo)

### Objetivo

Com base na base de metadados da Fase 1, expandir o escopo de comandos disponíveis nos três modos e viabilizar o caminho de invocação de prompt command pelo modelo.

### Funcionalidades

#### 2.1 Expandir o Conjunto de Comandos Disponíveis no Modo non-interactive / acp

**Princípios de Design Semântico para ACP**

Antes de estender comandos para os modos ACP/non-interactive, seguir os seguintes princípios de design:

1. **Destinatário diferente**: no modo ACP, o destinatário da mensagem é o IDE (extensão Zed/VS Code), não o usuário do terminal. O conteúdo da mensagem deve ser texto simples ou Markdown, não deve conter estilos ANSI específicos de terminal.
2. **Estratégia de implementação é adicionar ramificações de modo, não substituir**: a abordagem correta é adicionar novas verificações de modo dentro do `action` do comando — o caminho interativo mantém a lógica de renderização de UI existente; os caminhos non_interactive/acp retornam `message` ou `submit_prompt` adequados para consumo por máquina. As duas ramificações coexistem na mesma função `action`.
3. **Operações com estado precisam explicar semântica**: em uma única chamada não interativa (ex.: parâmetro CLI `-p`), alterações de comandos com estado como `/model set`, `/language set` são válidas apenas dentro da sessão atual; isso deve ser indicado no texto de resposta do comando.
4. **Somente leitura vs. com efeitos colaterais**: comandos somente leitura (ex.: `/about`, `/stats`) retornam diretamente o texto do estado atual; comandos com efeitos colaterais (ex.: `/model set`, `/language set`) devem confirmar o resultado da operação na resposta.
5. **Evitar efeitos colaterais dependentes do ambiente**: operações que abrem navegador (`/docs`, `/insight`), manipulam área de transferência (`/copy`), etc., dependem de ambiente gráfico; nos caminhos non_interactive/acp, devem ser ignoradas e, em vez disso, retornar a URL ou o conteúdo relevante no texto da resposta.

**Visão Geral dos Comandos a Serem Estendidos**

> Nota: `btw`, `bug`, `compress`, `context`, `init`, `summary` já foram estendidos para todos os modos na Fase 1 e não estão nesta lista.

Os 13 comandos a seguir serão estendidos para os modos `non_interactive` e `acp` na Fase 2:

**Classe A: `action` já retorna `message` ou `submit_prompt`; basta estender `supportedModes` e projetar o conteúdo da mensagem ACP**

| Comando       | Tipo de Retorno  | Considerações para ACP/non-interactive                        |
| ------------- | ---------------- | ------------------------------------------------------------- |
| `/copy`       | `message`        | Sem área de transferência em ACP; retorna o conteúdo em texto ou uma dica |
| `/export`     | `message`        | Retorna o caminho completo do arquivo exportado               |
| `/plan`       | `submit_prompt`  | Nenhuma alteração necessária; estender modo diretamente       |
| `/restore`    | `message`        | Retorna descrição do resultado da operação de restauração     |
| `/language`   | `message`        | Retorna texto confirmando a configuração de idioma atual ou alteração |
| `/statusline` | `submit_prompt`  | Nenhuma alteração necessária; estender modo diretamente       |

**Classe A': Com argumentos, executa normalmente; sem argumentos, dispara dialog (precisa de tratamento para caminho sem argumentos em non-interactive)**

| Comando          | Comportamento interativo sem argumentos | Comportamento non_interactive/acp sem argumentos |
| ---------------- | --------------------------------------- | ----------------------------------------------- |
| `/model`         | Abre dialog de seleção de modelo        | Retorna o nome do modelo atual e texto explicativo |
| `/approval-mode` | Abre dialog de modo de aprovação        | Retorna o modo de aprovação atual e texto explicativo |

**Classe B: `action` usa `context.ui.addItem()` para renderizar componentes React; precisa adicionar ramificação de modo para retornar texto simples**

| Comando     | Comportamento interativo                    | Retorno non_interactive/acp                                                        |
| ----------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/about`    | Renderiza componente React de versão/config | Resumo em texto simples da versão, modelo atual, configurações-chave               |
| `/stats`    | Renderiza componente React de estatísticas  | Formato de texto simples dos dados estatísticos da sessão                          |
| `/insight`  | Renderiza componente de análise + abre navegador | `non_interactive`: gera e retorna caminho do arquivo; `acp`: envia progresso e resultado via `stream_messages` |
| `/docs`     | Renderiza entrada de documentação + abre navegador | Retorna URL da documentação, não abre navegador                                    |

**Classe C: Tratamento especial**

| Comando   | Comportamento interativo                                  | Comportamento non_interactive/acp                                                                             |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/clear`  | Chama `context.ui.clear()` para limpar a exibição do terminal | Retorna uma mensagem de marcação de limite de contexto: `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 Invocação de Prompt Command pelo Modelo

- Implementar `getModelInvocableCommands()` em `CommandService` (ou `CommandRegistry`), retornando todos os comandos com `modelInvocable: true`
- Marcar comandos carregados por `BundledSkillLoader` e `FileCommandLoader` (comandos de usuário/projeto) como `modelInvocable: true`
- **MCP prompt não deve ser marcado como `modelInvocable`**: MCP prompts são invocados pelo modelo através do mecanismo independente de MCP tool call, sem necessidade de passar pelo `SkillTool`
- Reformular `SkillTool`: de consumir apenas `SkillManager.listSkills()` para também consumir `CommandService.getModelInvocableCommands()`
- Construir uma descrição unificada de comandos invocáveis pelo modelo e injetá-la na `description` do `SkillTool`

#### 2.3 Detecção de Slash Command no Meio da Entrada (Versão Básica)

- Em `InputPrompt`, detectar tokens de slash próximos ao cursor (não limitado ao início da linha)
- Ao detectar um token de slash, exibir uma dica inline ghost text com o comando de melhor correspondência (Tab para aceitar)
- **Não** incluir menu suspenso de autocompletar, dicas de argumento, source badge, etc. (Fase 3 faz isso)
- O conjunto de candidatos para ghost text é limitado a comandos com `modelInvocable: true` (skill / file command)

### Critérios de Aceitação

**2.1 Extensão de Comandos**

- [ ] Classe A: `/copy`, `/export`, `/plan`, `/restore`, `/language`, `/statusline` podem ser executados normalmente nos modos non-interactive e acp e retornam saída de texto significativa.
- [ ] Classe A': `/model`, `/approval-mode` sem argumentos, no modo non-interactive/acp, retornam o texto do estado atual (sem disparar dialog); com argumentos, executam a alteração e retornam texto de confirmação.
- [ ] Classe B: `/about`, `/stats`, `/docs` no modo non-interactive/acp retornam texto simples; `/docs` não abre navegador; `/insight` em `non_interactive` gera e retorna mensagem com caminho de arquivo; em `acp`, envia progresso via `stream_messages`.
- [ ] Classe C: `/clear` no modo non-interactive/acp retorna mensagem de marcação de limite de contexto, não chama `context.ui.clear()`.
- [ ] Todos os comandos estendidos mantêm comportamento idêntico ao anterior no modo interativo (sem regressão).

**2.2 Invocação pelo Modelo**

- [ ] O modelo pode invocar bundled skills e file commands (usuário/projeto) através de `SkillTool` durante a conversa.
- [ ] MCP prompts não passam por `SkillTool`; são invocados nativamente pelo modelo através do mecanismo MCP tool call.
- [ ] O modelo não pode invocar comandos built-in (`userInvocable: true`, `modelInvocable: false`).
- [ ] A `description` do `SkillTool` inclui a descrição de todos os comandos `modelInvocable`.

**2.3 Slash no Meio da Entrada**

- [ ] Slash no meio da entrada: ao digitar `/` no corpo do texto, exibir uma dica inline ghost text com o comando de melhor correspondência (Tab para aceitar).

---

## Fase 3: Alinhamento da Experiência (Aprimoramento de Autocompletar + Preenchimento de Comandos do Claude Code)

### Objetivo

Sobre a base de metadados e capacidades de comando das Fases 1/2, completar a experiência de autocompletar e adicionar comandos presentes no Claude Code que estão ausentes no Qwen Code.

### Funcionalidades

#### 3.1 Aprimoramento da Experiência de Autocompletar

**Source badge**

- Exibir rótulos de fonte de comando no menu de autocompletar (`[MCP]` já existe; estender para `[Skill]`, `[Custom]`, etc.)
- Usar campos `source` / `sourceLabel` para renderização

**Argument hint**

- Exibir `argumentHint` após o nome do comando no menu de autocompletar (ex.: `set <model-id>`)
- `argumentHint` fornecido pelo campo de metadados da Fase 1

**Ordenação por uso recente**

- Registrar comandos usados recentemente pelo usuário (nível de sessão, sem persistência)
- Ponderar comandos usados recentemente na ordenação do autocompletar

**Destaque de correspondência por alias**

- Quando o autocompletar corresponder a `altNames` em vez do nome principal, indicar na exibição (ex.: `help (alias: ?)`)

**Alinhamento de estratégia de conflito**

- Prioridade clara: built-in > bundled/skill-dir > plugin > mcp
- Em caso de conflito, renomear o comando de prioridade mais baixa (ex.: `pluginName.commandName`)

#### 3.2 Slash Command no Meio da Entrada (Versão Completa)

- Sobre a versão básica da Fase 2, adicionar exibição de argument hints e source badge
- Dica ghost text (exibir sugestão esmaecida de `/help` ao digitar `/he`)
- Destaque de tokens de comando efetivos (slash command já correspondido exibe cor diferente)

#### 3.3 Reestruturação do Menu de Ajuda

Reorganizar `/help` de uma lista plana para um diretório agrupado:

- **Built-in Commands** (local + local-jsx, indicar mode)
- **Bundled Skills**
- **Custom Commands** (file commands de usuário/projeto)
- **Plugin Commands**
- **MCP Commands**

Cada comando exibe: nome, argumentHint, descrição, source, marcadores de supportedModes

#### 3.4 Aprimoramento de Metadados de Comandos Disponíveis via ACP

Em `sendAvailableCommandsUpdate()`, expor mais metadados ao cliente ACP:

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands` (lista de nomes)
- `modelInvocable`

#### 3.5 Preenchimento de Comandos Ausentes do Claude Code

Confirmar e trazer de volta o comando `/doctor` já existente no Qwen Code; `/release-notes` não será incluído nesta fase, para evitar introduzir comandos built-in superficiais sem requisitos claros de produto.

| Comando    | Tipo    | Descrição                                 |
| ---------- | ------- | ----------------------------------------- |
| `/doctor`  | `local` | Autoverificação do ambiente; diagnostica configuração/conexão/status de ferramentas |

> Nota: Comandos de tarefa como `/review`, `/commit` são fornecidos como bundled skills, não fazem parte desta lista.

### Critérios de Aceitação

- [ ] Menu de autocompletar exibe source badge (`[MCP]`, `[Skill]`, `[Custom]`)
- [ ] Menu de autocompletar exibe argumentHint (ex.: `set <model-id>`)
- [ ] Comandos usados recentemente aparecem com prioridade na lista de autocompletar
- [ ] Quando corresponder a um alias, o nome original é indicado no item de autocompletar
- [ ] Slash no meio da entrada: dica ghost text é renderizada corretamente
- [ ] `/help` é exibido no estilo do Claude Code com abas, evitando acúmulo de comandos, e na página de comandos são exibidos marcadores de modo suportado
- [ ] Comandos disponíveis via ACP incluem campos `argumentHint`, `source`, `subcommands`
- [ ] Comando `/doctor` está disponível
- [ ] `/doctor` pode ser executado no modo non-interactive (retorna `message`)
- [ ] Não adicionar `/release-notes`

---

## Dependências entre as Fases

```
Fase 1 (Metadados + Filtro Unificado)
   │
   ├──► Fase 2 (Expansão de Capacidades)
   │        │
   │        ├──► Divisão de subcomandos do slash command
   │        └──► Invocação de prompt command pelo modelo (precisa de getModelInvocableCommands())
   │
   └──► Fase 3 (Alinhamento de Experiência)
            │
            ├──► Source badge (precisa do campo source da Fase 1)
            ├──► Argument hint (precisa do campo argumentHint da Fase 1)
            └──► Agrupamento de Ajuda (precisa do campo source da Fase 1)
```

As Fases 2 e 3 não dependem uma da outra, podendo ser executadas em paralelo (ou com itens trocados conforme prioridade).