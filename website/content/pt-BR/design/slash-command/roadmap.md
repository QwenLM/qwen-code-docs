# Roteiro de Reestruturação do Slash Command

## Objetivo Geral

Entregar uma plataforma de comandos que, na experiência externa, seja 95% alinhada ao Claude Code, utilizando o estilo arquitetônico interno da Qwen, ao mesmo tempo que corrige três problemas centrais: a divisão em três modos, a fonte única de comandos e a incapacidade de comandos prompt serem invocados pelo modelo.

---

## Princípios Centrais de Design

1. **Cada Fase pode ser entregue de forma independente**: o comportamento é autoconsistente após a conclusão, sem depender de fases futuras para funcionar
2. **A Fase 1 é puramente infraestrutura**: além de corrigir a interceptação incorreta do `MCP_PROMPT`, não altera nenhum conjunto de comandos disponíveis atualmente
3. **Mudanças de comportamento são separadas de mudanças arquiteturais**: a Fase 1 lida com arquitetura, a Fase 2 com extensão de capacidades
4. **Não se copia a arquitetura interna do Claude Code**: mas alinha-se com a superfície de capacidades perceptível pelo usuário

---

## Fase 1: Reconstrução da Infraestrutura (Puramente Arquitetural, Zero Mudança de Comportamento)

### Objetivo

Estabelecer um modelo unificado de metadados de comandos e um mecanismo de gerenciamento entre modos, fornecendo suporte de base para todas as fases subsequentes.

### Funcionalidades

#### 1.1 Estender o Modelo de Metadados do `SlashCommand`

Adicionar os seguintes campos à interface `SlashCommand` existente:

**Campos de origem**

- `source: CommandSource`: enumeração da origem do comando (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt`, etc.)
- `sourceLabel?: string`: rótulo de origem para exibição (ex.: `"Built-in"` / `"MCP: github-server"`)

**Campos de capacidade de modo**

- `supportedModes: ExecutionMode[]`: declara em quais modos de execução o comando está disponível (`interactive` / `non_interactive` / `acp`)

**Campos de tipo de execução**

- `commandType: CommandType`: declara o tipo de execução (`prompt` / `local` / `local-jsx`)

**Campos de visibilidade**

- `userInvocable: boolean`: se o usuário pode invocar via slash command (padrão `true`)
- `modelInvocable: boolean`: se o modelo pode invocar via tool call (padrão `false`)

**Campos auxiliares de metadados** (reservados para a Fase 3; na Fase 1, apenas definidos, não utilizados)

- `argumentHint?: string`: dica de argumento, ex.: `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string`: descrição de quando invocar este comando (para uso do modelo)
- `examples?: string[]`: exemplos de uso

#### 1.2 Carregadores Preenchem os Campos `source`/`commandType`

Cada carregador deve preencher `source` e `commandType` ao construir um `SlashCommand`:

| Carregador                       | source              | commandType                                     |
| -------------------------------- | ------------------- | ----------------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | declarado por cada comando (`local` / `local-jsx`) |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                                        |
| `FileCommandLoader` (usuário/projeto) | `skill-dir-command` | `prompt`                                        |
| `FileCommandLoader` (plugin)    | `plugin-command`    | `prompt`                                        |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                                        |

#### 1.3 Comandos Internos Declaram `supportedModes` e `commandType`

Declarar explicitamente para todos os comandos built-in:

- `commandType`: `local` (sem dependência de UI) ou `local-jsx` (depende de diálogo/React)
- `supportedModes`: comandos do tipo `local` declaram `['interactive', 'non_interactive', 'acp']`; comandos do tipo `local-jsx` declaram `['interactive']`

#### 1.4 Substituir Lista Branca Hardcoded por Filtro Baseado em Capacidades

- Remover a constante `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Remover a função `filterCommandsForNonInteractive`
- Adicionar nova função `filterCommandsForMode(commands, mode)` que filtra com base no campo `supportedModes`
- Adicionar função utilitária `getEffectiveSupportedModes(cmd)` (considerando a estratégia padrão do `CommandKind`)
- Modificar as assinaturas de `handleSlashCommand` / `getAvailableCommands` para remover o parâmetro `allowedBuiltinCommandNames`

#### 1.5 CommandService Atualizado para um Registry Unificado

- Adicionar método `getCommandsForMode(mode: ExecutionMode)`
- Adicionar método `getModelInvocableCommands()` (usado nas Fases 2/3; na Fase 1, fornece a interface)
- O método existente `getCommands()` permanece inalterado (uso interativo)

### Critérios de Aceitação

- [ ] A interface `SlashCommand` contém todos os novos campos; a compilação TypeScript passa
- [ ] Todos os carregadores preenchem os campos `source` e `commandType`
- [ ] Todos os comandos built-in declaram `commandType` e `supportedModes`
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` foi removido e substituído pelo filtro de capacidades
- [ ] **O conjunto de comandos disponíveis em modo não interativo é exatamente o mesmo de antes da refatoração** (testes existentes não quebram)
- [ ] Comandos MCP prompt podem ser executados normalmente em modo não interativo/acp (corrigindo a restrição incorreta anterior)
- [ ] `CommandService.getCommandsForMode('non_interactive')` retorna o conjunto correto de comandos
- [ ] Todos os testes existentes passam

---

## Fase 2: Extensão de Capacidades (Organização de Comandos e Invocação de Comando Prompt pelo Modelo)

### Objetivo

Com base nos metadados da Fase 1, expandir o escopo de comandos disponíveis nos três modos e abrir o caminho para a invocação de comandos prompt pelo modelo.

### Funcionalidades

#### 2.1 Expandir o Conjunto de Comandos Disponíveis para non_interactive / acp

**Princípios de Design Semântico do ACP**

Antes de estender comandos para os modos ACP/não interativo, devem ser seguidos os seguintes princípios de design:

1. **Receptor diferente**: No modo ACP, o receptor da mensagem é o IDE (plugin Zed/VS Code), não o usuário do terminal. O conteúdo da mensagem deve ser adequado em texto puro ou formato Markdown, sem incluir estilos ANSI específicos do terminal.
2. **Estratégia de implementação é adicionar ramificações de modo, não substituir**: A abordagem correta é adicionar verificações de modo dentro da `action` do comando — o caminho interativo mantém a lógica de renderização de UI existente inalterada; o caminho não interativo/acp retorna uma `message` ou `submit_prompt` adequada para consumo por máquina. Os dois caminhos coexistem na mesma função `action`.
3. **Operações com estado precisam explicitar semântica**: Em uma chamada não interativa única (ex.: parâmetro CLI `-p`), alterações de comandos com estado como `/model set`, `/language set` são válidas apenas na sessão atual; isso deve ser indicado no texto de resposta do comando.
4. **Somente leitura vs. com efeitos colaterais**: Comandos somente leitura (ex.: `/about`, `/stats`) retornam diretamente o texto do estado atual; comandos com efeitos colaterais (ex.: `/model set`, `/language set`) devem confirmar o resultado da operação na resposta.
5. **Evitar efeitos colaterais dependentes do ambiente**: Operações como abrir navegador (`/docs`, `/insight`), manipular área de transferência (`/copy`), que dependem de ambiente gráfico, devem ser ignoradas no caminho não interativo/acp; em vez disso, devem retornar a URL relevante ou o próprio conteúdo no texto da resposta.

**Visão Geral dos Comandos a Serem Expandidos**

> Nota: `btw`, `bug`, `compress`, `context`, `init`, `summary` já foram expandidos para todos os modos na Fase 1, não estando nesta lista.

Os 13 comandos a seguir serão expandidos para os modos `non_interactive` e `acp` na Fase 2:

**Classe A: `action` já retorna `message` ou `submit_prompt`; basta estender `supportedModes` e projetar o conteúdo da mensagem ACP**

| Comando      | Tipo de Retorno  | Pontos de Tratamento para ACP/não interativo          |
| ------------ | ---------------- | ----------------------------------------------------- |
| `/copy`      | `message`        | No ACP, sem área de transferência; retornar o conteúdo em si ou uma dica no texto da resposta |
| `/export`    | `message`        | Retornar o caminho completo do arquivo exportado      |
| `/plan`      | `submit_prompt`  | Nenhuma alteração necessária; estender modo diretamente |
| `/restore`   | `message`        | Retornar a descrição do resultado da operação de restauração |
| `/language`  | `message`        | Retornar o texto da configuração de idioma atual ou confirmação de alteração |
| `/statusline`| `submit_prompt`  | Nenhuma alteração necessária; estender modo diretamente |

**Classe A': Executa normalmente com argumentos; sem argumentos, aciona um diálogo (necessita adicionar tratamento para o caminho não interativo sem argumentos)**
| Comando           | Comportamento interativo sem argumentos | Comportamento non_interactive/acp sem argumentos |
| ---------------- | --------------------------------------- | ------------------------------------------------ |
| `/model`         | Abre diálogo de seleção de modelo       | Retorna nome do modelo atual e texto explicativo  |
| `/approval-mode` | Abre diálogo de modo de aprovação       | Retorna modo de aprovação atual e texto explicativo |

**Classe B: comandos que internamente usam `context.ui.addItem()` para renderizar componente React, precisam adicionar ramo para retornar texto puro**

| Comando    | Comportamento interativo          | Conteúdo retornado em non_interactive/acp                                           |
| ---------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `/about`   | Renderiza componente React de versão/configuração | Resumo em texto puro do número de versão, modelo atual e configurações principais   |
| `/stats`   | Renderiza componente de estatísticas de tokens/custos | Formato texto puro das estatísticas da sessão                                        |
| `/insight` | Renderiza componente de análise + abre navegador | `non_interactive` gera e retorna caminho do arquivo de forma síncrona; `acp` envia progresso e resultado via `stream_messages` |
| `/docs`    | Renderiza entrada de documentação + abre navegador | Retorna URL da documentação, não abre navegador |

**Classe C: tratamento especial**

| Comando   | Comportamento interativo                       | Comportamento non_interactive/acp                                                                            |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/clear`  | Chama `context.ui.clear()` para limpar terminal | Retorna mensagem de marcador de limite de contexto com conteúdo `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 Integração de chamada de modelo para comandos prompt

- Implementar `getModelInvocableCommands()` em `CommandService` (ou `CommandRegistry`) que retorna todos os comandos com `modelInvocable: true`
- Marcar comandos carregados por `BundledSkillLoader` e `FileCommandLoader` (comandos de usuário/projeto) como `modelInvocable: true`
- **MCP prompt não é marcado como `modelInvocable`**: MCP prompt é chamado pelo modelo através do mecanismo independente de chamada de ferramenta MCP, sem necessidade de roteamento via `SkillTool`
- Reformular `SkillTool`: de consumir apenas `SkillManager.listSkills()` para também consumir `CommandService.getModelInvocableCommands()`
- Construir descrição unificada de comandos invocáveis pelo modelo e injetar na descrição do `SkillTool`

#### 2.3 Detecção de slash command no meio da entrada (versão básica)

- Detectar token de barra próximo ao cursor em `InputPrompt` (não limitado ao início da linha)
- Ao detectar token de barra, sugerir o melhor comando correspondente via texto fantasma inline (Tab para aceitar)
- **Não** incluir menu suspenso de preenchimento, dicas de argumentos, badges de origem, etc. (será feito na Fase 3)
- O conjunto de candidatos para texto fantasma é limitado a comandos com `modelInvocable: true` (skill / file command)

### Critérios de aceitação

**2.1 Extensão de comandos**

- [ ] Classe A: `/copy`, `/export`, `/plan`, `/restore`, `/language`, `/statusline` funcionam normalmente em modo non-interactive e acp e retornam saída de texto significativa
- [ ] Classe A': `/model`, `/approval-mode` sem argumentos retornam texto de estado atual em non-interactive/acp (sem abrir diálogo); com argumentos, executam alteração e retornam texto de confirmação
- [ ] Classe B: `/about`, `/stats`, `/docs` retornam texto puro em non-interactive/acp; `/docs` não abre navegador; `/insight` em `non_interactive` gera e retorna caminho do arquivo em mensagem síncrona; em `acp` envia progresso via `stream_messages`
- [ ] Classe C: `/clear` em non-interactive/acp retorna mensagem de marcador de limite de contexto, não chama `context.ui.clear()`
- [ ] Todos os comandos estendidos em modo interativo comportam-se exatamente como antes da reformulação (sem regressão)

**2.2 Chamada de modelo**

- [ ] O modelo pode chamar bundled skill e file command (usuário/projeto) através de `SkillTool` durante a conversa
- [ ] MCP prompt não passa por `SkillTool`, é chamado nativamente pelo modelo através do mecanismo de chamada de ferramenta MCP
- [ ] O modelo não pode chamar built-in commands (`userInvocable: true`, `modelInvocable: false`)
- [ ] A descrição do `SkillTool` contém descrições de todos os comandos `modelInvocable`

**2.3 Slash no meio da entrada**

- [ ] Slash no meio da entrada: ao digitar `/` no meio do texto, o melhor comando correspondente é sugerido via texto fantasma inline (Tab para aceitar)

---

## Fase 3: Alinhamento de experiência (aprimoramento de preenchimento + complemento de comandos do Claude Code)

### Objetivo

Com base nos metadados e capacidades de comandos da Fase 1/2, complementar a experiência de preenchimento e adicionar comandos ausentes no Qwen Code que existem no Claude Code.

### Funcionalidades

#### 3.1 Aprimoramento de experiência de preenchimento

**Badge de origem**

- Exibir etiqueta de origem do comando no menu de preenchimento (já existe `[MCP]`, expandir para `[Skill]`, `[Custom]`, etc.)
- Renderizar usando campos `source` / `sourceLabel`

**Dica de argumento**

- Exibir `argumentHint` após o nome do comando no menu de preenchimento (ex.: `set <model-id>`)
- `argumentHint` fornecido pelo campo de metadados da Fase 1

**Ordenação por uso recente**

- Registrar comandos usados recentemente pelo usuário (nível de sessão, sem persistência)
- Ponderar comandos usados recentemente na ordenação do preenchimento

**Destaque de alias correspondido**

- Quando o preenchimento corresponder a `altNames` em vez do nome principal, indicar na exibição (ex.: `help (alias: ?)`)

**Alinhamento de estratégia de conflito**

- Prioridade clara: built-in > bundled/skill-dir > plugin > mcp
- Renomear comandos de prioridade inferior em caso de conflito (ex.: `pluginName.commandName`)

#### 3.2 Versão completa do slash command no meio da entrada

- Na versão básica da Fase 2, adicionar exibição de dicas de argumentos e badges de origem
- Sugestão de texto fantasma (ao digitar `/he`, exibir sugestão esmaecida de `/help`)
- Destaque de token de comando válido (slash command já correspondido exibido em cor diferente)

#### 3.3 Reestruturação do menu de ajuda

Reformular `/help` de lista plana para diretório agrupado:

- **Comandos Embutidos** (local + local-jsx, indicar modo)
- **Habilidades Empacotadas**
- **Comandos Personalizados** (file commands de usuário/projeto)
- **Comandos de Plugin**
- **Comandos MCP**

Cada comando exibe: nome, argumentHint, descrição, origem, marcador de modos suportados

#### 3.4 Aprimoramento de metadados de comandos disponíveis no ACP

Expor mais metadados ao cliente ACP em `sendAvailableCommandsUpdate()`:

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands` (lista de nomes)
- `modelInvocable`

#### 3.5 Complemento de comandos ausentes do Claude Code

Confirmar e retornar o comando `/doctor` já existente no Qwen Code; `/release-notes` não será incluído nesta fase para evitar adicionar comandos embutidos superficiais sem requisitos claros de produto.

| Comando    | Tipo   | Descrição                                 |
| ---------- | ------ | ---------------------------------------- |
| `/doctor`  | `local` | Autodiagnóstico de ambiente, diagnóstico de configuração/conexão/estado de ferramenta |

> Nota: Comandos de tarefa como `/review`, `/commit` são fornecidos como habilidades empacotadas, não estão nesta lista.

### Critérios de aceitação

- [ ] Menu de preenchimento exibe badges de origem (`[MCP]`, `[Skill]`, `[Custom]`)
- [ ] Menu de preenchimento exibe dicas de argumento (ex.: `set <model-id>`)
- [ ] Comandos usados recentemente aparecem com prioridade na lista de preenchimento
- [ ] Quando alias é correspondido, o nome original é indicado no item de preenchimento
- [ ] Slash no meio da entrada: texto fantasma é renderizado corretamente
- [ ] `/help` exibe em estilo de abas do Claude Code, evitando acúmulo de comandos, e na página de comandos exibe marcadores de modo suportado
- [ ] Comandos disponíveis no ACP contêm campos `argumentHint`, `source`, `subcommands`
- [ ] Comando `/doctor` está disponível
- [ ] `/doctor` pode ser executado em modo non-interactive (retorna `message`)
- [ ] Não adicionar `/release-notes`
---

## Dependências de cada Phase

```
Phase 1 (metadados + filtragem unificada)
    │
    ├──► Phase 2 (extensão de capacidades)
    │        │
    │        ├──► divisão de subcomandos slash command
    │        └──► chamada de modelo do prompt command (requer getModelInvocableCommands())
    │
    └──► Phase 3 (alinhamento da experiência)
             │
             ├──► selo de origem (requer o campo source da Phase 1)
             ├──► dica de argumento (requer o campo argumentHint da Phase 1)
             └──► agrupamento da Ajuda (requer o campo source da Phase 1)
```

Phase 2 e Phase 3 não dependem uma da outra e podem ser executadas em paralelo (ou alguns subitens podem ser trocados conforme a prioridade).
