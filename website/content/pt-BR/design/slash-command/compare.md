# Plano de Refatoração do Módulo de Comandos do Qwen Code

## 1. Definição de Objetivos

Este plano tem como única premissa os seguintes princípios:

- **A arquitetura do código não precisa ser uma cópia do Claude Code**
- **Mas as funcionalidades centrais, a experiência de uso e a interação do sistema de comandos devem ter 95% de alinhamento com o Claude Code**

Aqui, "alinhamento" refere-se às capacidades diretamente perceptíveis pelo usuário, incluindo:

1. Cobertura de origens de comando
2. Help e discoverability de comandos
3. Autocomplete e experiência de mid-input slash command
4. Disponibilidade em ACP / non-interactive
5. Capacidade de invocação de modelo para prompt command / skill

Esta refatoração não se trata apenas de adicionar alguns campos ou fazer ajustes pontuais no `SlashCommand` existente, mas sim de elevar o módulo de comando de uma "capacidade anexa à UI interativa" para uma "plataforma unificada de comandos para interactive / ACP / non-interactive / model".

---

## 2. Conclusão da Reescrita

O problema do sistema de comandos atual do Qwen não é a falta total de capacidade, mas sim:

1. Funciona de forma mais completa apenas no fluxo principal interactive
2. O modelo de tipos é muito superficial para suportar o nível de produto do Claude
3. ACP / non-interactive depende de allowlist, com péssima extensibilidade
4. Embora existam origens de comando, elas não formam um entendimento unificado e visível para o usuário
5. O sistema de exposição de prompt command e skill do modelo é fragmentado

Portanto, a nova proposta deve resolver simultaneamente quatro questões:

1. **Completar as capacidades do Claude Code**
2. **Manter a vantagem de engenharia do modelo unificado de outcome do Qwen**
3. **Estabelecer uma arquitetura unificada de registry / resolver / executor / adapter**
4. **Fazer com que help, autocomplete, ACP available commands e documentação compartilhem o mesmo conjunto de metadados**

---

## 3. Princípios de Refatoração

### 3.1 Alinhamento funcional tem prioridade sobre alinhamento de implementação

Diferenças permitidas:

- Nomes de classes internas
- Forma de divisão de módulos
- Implementação do executor
- Estrutura de effect / outcome

Diferenças não permitidas:

- Redução perceptível na cobertura de origens de comando
- Degradação perceptível na experiência de help e autocomplete
- Degradação perceptível na disponibilidade para ACP / non-interactive
- Degradação perceptível na integração entre prompt command e capacidades do modelo

Em caso de trade-off, a prioridade deve ser:

1. Alinhamento da experiência do usuário
2. Alinhamento da cobertura de capacidades de comando
3. Alinhamento da consistência de padrões
4. Simplicidade da implementação interna

### 3.2 Manter o modelo unificado de outcome do Qwen

Não é recomendado replicar mecanicamente a implementação de execução do Claude.

O modelo de resultado unificado atual do Qwen ainda vale a pena ser mantido, pois é naturalmente adequado para:

- Controle pela UI
- Aprovação/confirmação
- Agendamento de tool
- Submissão de prompt
- Adaptação entre modos

No entanto, ele deve ser atualizado para suportar capacidades de comando no nível do Claude, em vez de continuar existindo como um framework simplificado de comandos de UI.

### 3.3 Tipo, origem, modo e visibilidade devem ser completamente desacoplados

O novo modelo de comando deve, no mínimo, separar as seguintes dimensões:

1. **Tipo**: como o comando é executado
2. **Origem**: de onde o comando vem
3. **Capacidade de modo**: em quais ambientes de execução está disponível
4. **Visibilidade**: se é visível para o usuário ou para o modelo

---

## 4. Capacidades do Claude Code que Precisam de Alinhamento

### 4.1 Tipos de Comando

O Qwen precisa suportar explicitamente três tipos de comando:

1. `prompt`
2. `local`
3. `local-jsx`

### 4.2 Origens de Comando

O schema de comando do Qwen deve cobrir as seguintes origens desde a primeira fase:

1. built-in commands
2. bundled skills
3. skill dir commands
4. workflow commands
5. plugin commands
6. plugin skills
7. dynamic skills
8. mcp prompts
9. mcp skills

Não podemos mais recuar para "suportar apenas as categorias já existentes".

### 4.3 Metadados de Comando

Adicionar, no mínimo, os seguintes campos:

1. `argumentHint`
2. `whenToUse`
3. `examples`
4. `sourceLabel`
5. `userFacingName`
6. `alias`
7. `immediate`
8. `isSensitive`
9. `userInvocable`
10. `modelInvocable`
11. `supportedModes`
12. `requiresUi`

### 4.4 Capacidades de Experiência (UX)

Adicionar, no mínimo, as seguintes experiências:

1. Autocomplete com hit de alias
2. Source badge
3. Dica de parâmetros
4. Ordenação por recently used
5. Detecção e autocomplete de mid-input slash command
6. Help em formato de diretório de comandos
7. Expressão completa de ACP available commands

---

## 5. Novo Modelo de Comando

## 5.1 Estrutura Central

Recomenda-se introduzir um `CommandDescriptor` unificado como formato de registro para todos os comandos.

Ele deve conter, no mínimo, quatro partes:

1. `identity`
2. `metadata`
3. `capabilities`
4. `handler`

### `identity`

- `id`
- `name`
- `altNames`
- `canonicalPath`

### `metadata`

- `description`
- `argumentHint`
- `whenToUse`
- `examples`
- `group`
- `source`
- `sourceLabel`
- `userFacingName`
- `hidden`

### `capabilities`

- `type`: `prompt | local | local-jsx`
- `supportedModes`: `interactive | acp | non_interactive`
- `requiresUi`
- `supportsDialog`
- `supportsStreaming`
- `supportsToolInvocation`
- `supportsConfirmation`
- `remoteSafe`
- `readOnly`
- `immediate`
- `isSensitive`
- `userInvocable`
- `modelInvocable`

### `handler`

- `resolveArgs()`
- `execute()`
- `completion()`
- `fallback()`

---

## 5.2 Responsabilidades dos Três Tipos de Comando

### `prompt`

Usado para:

- skills
- file commands
- workflow prompt commands
- plugin skills
- mcp prompt / skill

Características:

- Gera assets de prompt / skill
- Suporta interactive / ACP / non-interactive por padrão
- Pode ser invocado pelo usuário ou pelo modelo

### `local`

Usado para:

- Comandos de consulta
- Comandos de configuração
- Comandos de estado executáveis em headless
- Ponto de entrada principal de execução para a maioria dos built-in commands

Características:

- Não depende de UI
- Deve ser o tipo principal para ACP / non-interactive

### `local-jsx`

Usado para:

- picker
- painéis
- wizard
- interactive UI shell

Características:

- Lida apenas com interactive UI
- Não pode mais ser o único ponto de entrada de execução
- Deve fornecer fallback ou um subcomando local correspondente

---

## 6. Modelo de Origem de Comando

## 6.1 Modelo de Origem Externa

Este é o modelo de origem visível ao usuário e deve alinhar-se ao máximo com a mentalidade do Claude Code:

- `builtin-command`
- `bundled-skill`
- `skill-dir-command`
- `workflow-command`
- `plugin-command`
- `plugin-skill`
- `dynamic-skill`
- `builtin-plugin-skill`
- `mcp-prompt`
- `mcp-skill`

Este conjunto de campos será usado diretamente para:

- Agrupamento no Help
- Completion source badge
- ACP available commands
- Exportação de documentação

## 6.2 Modelo de Normalização Interna

Para não ficarmos presos a nomenclaturas externas, adicionamos uma camada interna de campos de implementação:

- `providerType`
- `artifactType`
- `activationMode`
- `builtinProvided`
- `originPath`
- `namespace`

Isso permite:

- Alinhar a experiência externa ao Claude
- Manter a manutenibilidade interna do Qwen

## 6.3 Estratégia de Conflito

Gerenciamento unificado por `id` estável, separando nome de exibição e nome de entrada:

1. `id`: identificador único estável
2. `name`: nome principal de entrada
3. `userFacingName`: nome exibido no help/autocomplete

Prioridade sugerida para conflitos:

1. built-in
2. bundled / skill-dir / workflow
3. plugin / builtin-plugin
4. dynamic
5. namespace independente do mcp

---

## 7. Arquitetura de Execução Unificada

## 7.1 `CommandRegistry`

Responsabilidades:

1. Agregar todos os loader/provider
2. Criar índices multidimensionais
3. Exportar help, autocomplete, ACP e views de documentação
4. Fornecer views independentes para comandos visíveis ao usuário e ao modelo

Providers obrigatórios:

1. `BuiltinCommandLoader`
2. `BundledSkillLoader`
3. `FileCommandLoader`
4. `McpPromptLoader`
5. `WorkflowCommandLoader`
6. `PluginCommandLoader`
7. `PluginSkillLoader`
8. `DynamicSkillProvider`
9. `BuiltinPluginSkillLoader`

Mesmo que alguns providers não estejam totalmente implementados na primeira versão, o schema e a API já devem suportá-los.

## 7.2 `CommandResolver`

Responsabilidades:

1. Resolver slash command
2. Resolver alias
3. Resolver subcommand path
4. Identificar mid-input slash token
5. Retornar canonical resolved command

## 7.3 `CommandExecutor`

Responsabilidades:

1. Realizar verificação de capability
2. Executar `prompt | local | local-jsx`
3. Gerar outcome unificado
4. Tratar fallback / unsupported

## 7.4 `ModeAdapter`

É necessário separar três adapters:

1. `InteractiveModeAdapter`
2. `AcpModeAdapter`
3. `NonInteractiveModeAdapter`

Dessa forma, os três modos podem compartilhar o mesmo command registry e executor, em vez de codificarem lógicas separadas.

---

## 8. Princípios de Refatoração de Comandos de UI: Separação entre Comando Central e Shell Interativo

Este é o ponto crucial para que ACP e non-interactive funcionem de verdade.

Qualquer comando que atualmente funcione essencialmente como "abrir um dialog" deve ser refatorado para:

1. Um interactive shell
2. Um conjunto de subcomandos local

### Primeira leva de comandos a serem separados

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

### Exemplo da forma alvo

#### `/model`

- `/model`
- `/model show`
- `/model list`
- `/model set <id>`

#### `/permissions`

- `/permissions`
- `/permissions show`
- `/permissions set <mode>`
- `/permissions allow <tool>`
- `/permissions deny <tool>`

#### `/mcp`

- `/mcp`
- `/mcp list`
- `/mcp show <server>`
- `/mcp enable <server>`
- `/mcp disable <server>`

---

## 9. Design Unificado para Prompt Command / Skill

Esta é a prioridade P0 da refatoração, não uma capacidade a ser adicionada depois.

## 9.1 Objetivo

Criar um **Model-Invocable Prompt Command Registry** unificado, consolidando os seguintes assets em uma view invocável pelo modelo:

1. bundled skills
2. file commands
3. workflow prompt commands
4. plugin skills
5. mcp prompts / mcp skills

## 9.2 Campos Principais

Adicionar obrigatoriamente:

1. `userInvocable`
2. `modelInvocable`
3. `allowedTools`
4. `whenToUse`
5. `argSchema` ou descrição mínima de parâmetros
6. `contextMode: inline | fork`
7. `agent`
8. `effort`

## 9.3 Relação com `SkillTool`

Após a refatoração, o `SkillTool` não deve mais consumir apenas skills estritas.

A mudança deve ser:

1. `CommandRegistry.getModelInvocablePromptCommands()` gera a view unificada
2. `SkillTool` ou um futuro command tool unificado consome essa view
3. O slash command do usuário e a invocação de skill do modelo compartilham o mesmo pool de assets de prompt-command

Isso permitirá que o Qwen se aproxime da experiência do Claude ao lidar com capacidades como `/review`, `/commit`, `/openspec-apply`.

---

## 10. Reformulação de Help / Completion / Discoverability

## 10.1 Completion

Os itens de autocomplete devem exibir, no mínimo:

1. `label`
2. `description`
3. `argumentHint`
4. `sourceBadge`
5. `modeBadges`
6. `aliasHit`
7. `recentlyUsedScore`

A ordenação deve considerar, no mínimo:

1. Hit exato
2. Hit de alias
3. Uso recente
4. Hit por prefixo
5. Hit fuzzy

## 10.2 Mid-input slash command

Adicionar obrigatoriamente:

1. Detecção de slash token próximo ao cursor
2. Ghost text hint
3. Tab completion
4. Highlight de token de comando válido

Na primeira fase, alinhamos a experiência de entrada; a introdução de uma "semântica de execução de comando embutida" mais robusta pode ficar para iterações futuras.

## 10.3 Help

O Help não será mais uma lista plana, mas um diretório completo de comandos.

Agrupamento mínimo:

1. Built-in Commands
2. Bundled Skills
3. Skill Dir Commands
4. Workflow Commands
5. Plugin Commands
6. Plugin Skills
7. Dynamic Skills
8. Builtin Plugin Skills
9. MCP Commands / MCP Skills

Cada comando deve exibir, no mínimo:

1. Nome
2. Dica de parâmetros
3. Descrição
4. Origem
5. Modos suportados
6. Se é invocável pelo modelo
7. Resumo de subcomandos

---

## 11. Refatoração para ACP / Non-Interactive

## 11.1 Abandonar Completamente a Abordagem de Allowlist

Abordagem antiga:

- built-in allowlist
- Tratamento especial para FILE / SKILL
- Outros tipos de resultado como unsupported

Nova abordagem:

- Cada comando declara sua própria capability
- O registry é responsável pelo filtro
- O adapter é responsável pela execução e fallback

## 11.2 Objetivos de Suporte para outcome

### interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `dialog`
- `load_history`
- `confirm_action`
- `confirm_shell_commands`

### acp

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback`

### non_interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback / structured failure`

## 11.3 Saída de ACP available commands

Deve incluir, no mínimo:

1. `name`
2. `description`
3. `argumentHint`
4. `source`
5. `examples`
6. `supportedModes`
7. `interactiveOnly`
8. `subcommands`
9. `modelInvocable`

---

## 12. Documentação, Help e Completion Compartilham os Mesmos Metadados

Após a refatoração, os seguintes itens devem ser exportados a partir da mesma view do registry:

1. Help
2. Completion
3. ACP available commands
4. Exportação de documentação

Isso resolve o problema atual de "implementação, help e documentação apresentarem três faces diferentes dos comandos".

---

## 13. Fases de Implementação

## Phase 1: Reconstrução da Base

Entregas:

1. Novo `CommandDescriptor`
2. Schema completo de origens
3. Modelo de capability
4. `userInvocable / modelInvocable`
5. `CommandRegistry`
6. `CommandResolver`
7. `CommandExecutor`
8. Três `ModeAdapter`
9. `getModelInvocablePromptCommands()`

## Phase 2: Migração de Comandos Centrais

Entregas:

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

Esses comandos devem concluir a refatoração para "interactive shell + subcomandos local".

## Phase 3: Integração de Capacidades do Modelo

Entregas:

1. `SkillTool` conectado à view unificada do registry
2. file command / bundled skill / mcp prompt / plugin skill integrados ao conjunto unificado model-invocable
3. Unificação completa dos assets de prompt command e skill

## Phase 4: Alinhamento da Camada de Experiência ao Claude

Entregas:

1. Ordenação por recently used
2. Source badge
3. Argument hint
4. Mode badge
5. Diretório completo de help
6. Experiência de mid-input slash command
7. Exportação ou validação automática de documentação

---

## 14. Critérios de Aceitação

Após a conclusão, deve-se atender, no mínimo:

1. Help, completion, ACP e documentação devem expressar o modelo completo de origens
2. Exceto comandos de shell puramente de UI, a maioria dos built-in command deve funcionar em ACP / non-interactive
3. A invocação de prompt command e skill do modelo deve usar o mesmo pool de assets
4. A experiência do comando deve atingir 95% do nível do Claude Code em help, completion, expressão de origem, dicas de parâmetros e experiência mid-input
5. Não depender mais de built-in allowlist para manter capacidades de comando em ACP / non-interactive

---

## 15. Conclusão Final

A essência desta refatoração não é "adicionar mais alguns campos ao SlashCommand existente", mas sim:

- **Entregar uma plataforma de comandos com 95% de alinhamento na experiência externa com o Claude Code, utilizando o estilo de arquitetura interna do Qwen**

Se for necessário escolher entre:

- Implementação interna mais parecida com o Claude
- Experiência externa mais parecida com o Claude

Este plano escolhe explicitamente a segunda opção.