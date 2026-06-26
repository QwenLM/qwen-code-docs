# Plano de Refatoração do Módulo Command do Qwen Code

## 1. Definição do Objetivo

Este plano tem como única premissa os seguintes princípios:

- **A arquitetura do código não precisa copiar o Claude Code**
- **Mas as funcionalidades principais, a experiência de uso e a interação do sistema de comandos devem estar 95% alinhadas com o Claude Code**

"Alinhamento" aqui se refere às capacidades diretamente perceptíveis pelo usuário, incluindo:

1. Cobertura das fontes de comando
2. Ajuda e descoberta de comandos
3. Autocompletar comandos e experiência de slash command no meio da entrada
4. Usabilidade em ACP / modo não interativo
5. Capacidade de invocação de modelo para prompt command / skill

Esta refatoração não é sobre adicionar alguns campos, nem sobre fazer pequenos ajustes no `SlashCommand` existente. O objetivo é atualizar o módulo de comando de uma "capacidade auxiliar da UI interativa" para uma "plataforma unificada de comandos que funciona em modo interativo, ACP, não interativo e modelo".

---

## 2. Conclusão Após a Reescrita

O problema do sistema de comandos atual do Qwen não é uma falta total de capacidade, mas sim:

1. Ele é completo apenas no caminho principal interativo
2. O modelo de tipos é muito raso para suportar o nível de produto do Claude
3. ACP / modo não interativo dependem de uma lista de permissões, com péssima escalabilidade
4. Embora existam fontes de comando, elas não formam uma mentalidade unificada visível para o usuário
5. O prompt command e o sistema de exposição de skills do modelo são separados

Portanto, o novo plano deve resolver quatro coisas simultaneamente:

1. **Complementar a superfície de capacidades do Claude Code**
2. **Preservar as vantagens de engenharia do modelo de *outcome* unificado do Qwen**
3. **Estabelecer uma arquitetura unificada de registry / resolver / executor / adapter**
4. **Fazer com que ajuda, autocompletar, comandos disponíveis no ACP e documentação compartilhem o mesmo conjunto de metadados**

---

## 3. Princípios da Refatoração

### 3.1 Priorizar o Alinhamento de Funcionalidades em vez do Alinhamento de Implementação

Diferenças são permitidas em:

- Nomes de classes internas
- Forma de divisão dos módulos
- Implementação do executor
- Estrutura de effect / outcome

Diferenças não são permitidas em:

- Cobertura de fontes de comando visivelmente reduzida
- Experiência de ajuda e autocompletar de comandos visivelmente reduzida
- Usabilidade em ACP / modo não interativo visivelmente reduzida
- Integração do prompt command com a capacidade do modelo visivelmente reduzida

Se houver trade-offs, a prioridade deve ser:

1. Alinhamento da experiência do usuário
2. Alinhamento da cobertura de capacidades dos comandos
3. Alinhamento da consistência do modo
4. Simplicidade da implementação interna

### 3.2 Preservar o Modelo de Outcome Unificado do Qwen

Não é recomendado copiar mecanicamente a implementação de execução do Claude.

O modelo de resultado unificado atual do Qwen ainda vale a pena ser preservado, pois ele é naturalmente adequado para:

- Assunção de controle pela UI
- Aprovação/confirmação
- Agendamento de ferramentas
- Envio de prompts
- Adaptação entre modos

Mas ele deve ser atualizado para suportar as capacidades de comando do nível do Claude, em vez de continuar sendo um framework de comando de UI simplificado.

### 3.3 Tipo, Fonte, Modo e Visibilidade Devem Ser Totalmente Desacoplados

O novo modelo de comando deve, no mínimo, separar as seguintes dimensões:

1. **Tipo**: como o comando é executado
2. **Fonte**: de onde o comando vem
3. **Capacidade de Modo**: em quais ambientes de execução está disponível
4. **Visibilidade**: visível para o usuário ou para o modelo

---

## 4. Superfície de Capacidades do Claude Code que Precisam ser Alinhadas

### 4.1 Tipos de Comando

O Qwen precisa suportar explicitamente três tipos de comando:

1. `prompt`
2. `local`
3. `local-jsx`

### 4.2 Fontes de Comando

O schema de comando do Qwen deve cobrir as seguintes fontes desde a primeira fase:

1. Comandos internos (built-in)
2. Skills empacotadas (bundled)
3. Comandos do diretório de skills (skill dir)
4. Comandos de workflow
5. Comandos de plugin
6. Skills de plugin
7. Skills dinâmicas
8. Prompts MCP
9. Skills MCP

Não se pode voltar atrás para "suportar apenas os tipos que já existem atualmente".

### 4.3 Metadados do Comando

No mínimo, complementar os seguintes campos:

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

### 4.4 Capacidades de Experiência

No mínimo, complementar as seguintes experiências:

1. Autocompletar por alias
2. Badge de origem (source badge)
3. Dica de argumento
4. Ordenação por uso recente
5. Detecção e autocompletar de slash command no meio da entrada
6. Ajuda no formato de diretório de comandos
7. Expressão completa dos comandos disponíveis no ACP

---

## 5. Novo Modelo de Comando

## 5.1 Estrutura Central

É recomendado introduzir um `CommandDescriptor` unificado como formato de registro para todos os comandos.

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

- Skills
- File commands
- Comandos prompt de workflow
- Skills de plugin
- Prompt / skill MCP

Características:

- Gera ativos de prompt / skill
- Suporta interactive / ACP / non-interactive por padrão
- Pode ser invocado pelo usuário ou pelo modelo

### `local`

Usado para:

- Comandos de consulta
- Comandos de configuração
- Comandos de estado executáveis headless
- Ponto de entrada de execução central para a maioria dos comandos internos

Características:

- Não depende de UI
- Deve se tornar o principal tipo portador para ACP / modo não interativo

### `local-jsx`

Usado para:

- Picker
- Painéis
- Wizard
- Shell de UI interativa

Características:

- Processa apenas UI interativa
- Não pode mais ser o único ponto de entrada de execução
- Deve fornecer um fallback ou um subcomando `local` correspondente

---

## 6. Modelo de Fonte de Comando

## 6.1 Modelo de Fonte Externa

Este é o modelo de fonte mostrado ao usuário e deve ser o mais consistente possível com a mentalidade do Claude Code:

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

- Agrupamento da Ajuda
- Badge de origem no autocompletar
- Comandos disponíveis no ACP
- Exportação de documentação

## 6.2 Modelo de Normalização Interna

Para não ficar preso aos nomes externos, adicione uma camada interna de campos de implementação:

- `providerType`
- `artifactType`
- `activationMode`
- `builtinProvided`
- `originPath`
- `namespace`

Isso permite:

- Experiência externa alinhada com o Claude
- Implementação interna mantendo a facilidade de manutenção do Qwen

## 6.3 Estratégia de Conflitos

Gerenciar uniformemente pelo `id` estável, separando o nome de exibição do nome de entrada:

1. `id`: Identificador único estável
2. `name`: Nome principal de entrada
3. `userFacingName`: Nome de exibição na ajuda/autocompletar

Prioridade de conflito sugerida:

1. built-in
2. bundled / skill-dir / workflow
3. plugin / builtin-plugin
4. dynamic
5. mcp (namespace independente)

---

## 7. Arquitetura de Execução Unificada

## 7.1 `CommandRegistry`

Responsabilidades:

1. Agregar todos os loaders/providers
2. Estabelecer um índice multidimensional
3. Fornecer visões de ajuda, autocompletar, ACP e documentação
4. Fornecer visões independentes de comandos visíveis para o usuário e comandos visíveis para o modelo

Providers que devem ser suportados:

1. `BuiltinCommandLoader`
2. `BundledSkillLoader`
3. `FileCommandLoader`
4. `McpPromptLoader`
5. `WorkflowCommandLoader`
6. `PluginCommandLoader`
7. `PluginSkillLoader`
8. `DynamicSkillProvider`
9. `BuiltinPluginSkillLoader`

Mesmo que alguns providers não sejam totalmente implementados na primeira fase, o schema e a API devem suportá-los desde o início.

## 7.2 `CommandResolver`

Responsabilidades:

1. Resolver slash commands
2. Resolver aliases
3. Resolver caminhos de subcomandos
4. Identificar tokens de slash no meio da entrada
5. Produzir o comando resolvido canônico

## 7.3 `CommandExecutor`

Responsabilidades:

1. Verificar capacidades
2. Executar `prompt | local | local-jsx`
3. Produzir *outcome* unificado
4. Lidar com fallback / não suportado

## 7.4 `ModeAdapter`

Três adapters devem ser criados:

1. `InteractiveModeAdapter`
2. `AcpModeAdapter`
3. `NonInteractiveModeAdapter`

Dessa forma, os três modos podem compartilhar o mesmo registry e executor de comando, em vez de terem implementações codificadas separadamente.

---

## 8. Princípio de Refatoração de Comandos de UI: Separação do Comando Central do Shell Interativo

Esta é a chave para que ACP e modo não interativo sejam realmente utilizáveis.

Todos os comandos cuja natureza atual é "abrir um diálogo" devem ser transformados em:

1. Um shell interativo
2. Um conjunto de subcomandos `local`

### Primeiro lote de comandos que devem ser separados

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

### Exemplo de Formato Alvo

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

## 9. Design Unificado de Prompt Command / Skill

Este é o P0 da refatoração, não uma capacidade a ser adicionada depois.

## 9.1 Objetivo

Estabelecer um **Registry de Prompt Command Invocável por Modelo** unificado, combinando os seguintes ativos em uma única visão invocável pelo modelo:

1. Skills empacotadas (bundled)
2. File commands
3. Comandos prompt de workflow
4. Skills de plugin
5. Prompts MCP / Skills MCP

## 9.2 Campos Chave

Novos campos que devem ser adicionados:

1. `userInvocable`
2. `modelInvocable`
3. `allowedTools`
4. `whenToUse`
5. `argSchema` ou descrição mínima de argumento
6. `contextMode: inline | fork`
7. `agent`
8. `effort`

## 9.3 Relação com `SkillTool`

Após a refatoração, `SkillTool` não deve mais consumir apenas skills em sentido estrito.

Deve ser alterado para:

1. `CommandRegistry.getModelInvocablePromptCommands()` produz uma visão unificada
2. `SkillTool` ou um futuro command tool unificado consome essa visão
3. O slash command do usuário e a invocação de skill pelo modelo compartilham o mesmo pool de ativos de prompt-command

Dessa forma, o Qwen pode se aproximar da experiência do Claude ao lidar com capacidades como `/review`, `/commit`, `/openspec-apply`.

---

## 10. Refazer Ajuda / Autocompletar / Descoberta

## 10.1 Autocompletar

Os itens de autocompletar devem, no mínimo, exibir:

1. `label`
2. `description`
3. `argumentHint`
4. `sourceBadge`
5. `modeBadges`
6. `aliasHit`
7. `recentlyUsedScore`

A ordenação deve considerar, no mínimo:

1. Correspondência exata
2. Correspondência por alias
3. Uso recente
4. Correspondência por prefixo
5. Correspondência fuzzy

## 10.2 Slash Command no Meio da Entrada

Deve ser complementado:

1. Detecção de token de slash próximo ao cursor
2. Dica de texto fantasma (ghost text)
3. Conclusão com Tab
4. Destaque de token de comando válido

Na primeira fase, alinhar a experiência de entrada; a introdução de uma "semântica de execução de comando embutido" mais forte pode ser feita em iterações subsequentes.

## 10.3 Ajuda

A Ajuda não deve ser mais uma lista plana, mas um diretório completo de comandos.

No mínimo, agrupar em:

1. Comandos Internos (Built-in)
2. Skills Empacotadas (Bundled)
3. Comandos do Diretório de Skills (Skill Dir)
4. Comandos de Workflow
5. Comandos de Plugin
6. Skills de Plugin
7. Skills Dinâmicas
8. Skills de Plugin Internas (Builtin Plugin)
9. Comandos MCP / Skills MCP

Cada comando deve, no mínimo, exibir:

1. Nome
2. Dica de argumento
3. Descrição
4. Origem
5. Modos suportados
6. Se é invocável pelo modelo
7. Resumo dos subcomandos

---

## 11. Refatoração de ACP / Não Interativo

## 11.1 Abandonar Completamente a Abordagem de Lista de Permissões

Esquema antigo:

- Lista de permissões interna (built-in allowlist)
- Caso especial para FILE / SKILL
- Outros tipos de resultado como não suportados

Novo esquema:

- Cada comando declara sua própria capacidade
- O registry é responsável por filtrar
- O adapter é responsável por executar e fazer fallback

## 11.2 Suporte a *Outcome* por Modo

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

## 11.3 Saída de Comandos Disponíveis no ACP

Deve conter, no mínimo:

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

## 12. Documentação, Ajuda e Autocompletar Compartilham os Mesmos Metadados

Após a refatoração, os seguintes itens devem ser exportados a partir da mesma visão do registry:

1. Ajuda
2. Autocompletar
3. Comandos disponíveis no ACP
4. Exportação de documentação

Isso resolve o problema atual de "implementação, ajuda e documentação terem superfícies de comando inconsistentes".

---

## 13. Fases de Implementação

## Fase 1: Reconstrução da Base

Entregas:

1. Novo `CommandDescriptor`
2. Schema completo de fontes
3. Modelo de capabilities
4. `userInvocable / modelInvocable`
5. `CommandRegistry`
6. `CommandResolver`
7. `CommandExecutor`
8. Três `ModeAdapter`
9. `getModelInvocablePromptCommands()`

## Fase 2: Migração de Comandos Centrais

Entregas:

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

Estes comandos devem ser refatorados para o formato "shell interativo + subcomando local".

## Fase 3: Integração da Capacidade do Modelo

Entregas:

1. `SkillTool` conecta-se à visão unificada do registry
2. File command / skill empacotada / prompt MCP / skill de plugin entram no conjunto unificado invocável pelo modelo
3. Prompt command e ativos de skill são completamente unificados

## Fase 4: Alinhamento da Camada de Experiência com o Claude

Entregas:

1. Ordenação por uso recente
2. Badge de origem (source badge)
3. Dica de argumento (argument hint)
4. Badge de modo (mode badge)
5. Diretório de ajuda completo
6. Experiência de slash command no meio da entrada
7. Exportação ou validação automatizada de documentação

---

## 14. Critérios de Aceitação

Após a conclusão, deve atender, no mínimo, a:

1. Ajuda, autocompletar, ACP e documentação podem expressar o modelo completo de fontes
2. Exceto comandos de shell puramente de UI, a maioria dos comandos internos pode ser usada em ACP / modo não interativo
3. Prompt command e invocação de skill pelo modelo usam o mesmo pool de ativos
4. A experiência do comando atinge 95% do nível do Claude Code em ajuda, autocompletar, expressão de origem, dica de argumento e experiência mid-input
5. Não depende mais de uma lista de permissões interna para manter as capacidades de comando em ACP / modo não interativo

---

## 15. Julgamento Final

A essência desta refatoração não é "adicionar mais alguns campos ao `SlashCommand` existente", mas sim:

- **Usar o estilo de arquitetura interna do Qwen para entregar uma plataforma de comando que, na experiência externa, esteja 95% alinhada com o Claude Code**

Se for necessário escolher entre:

- Implementação interna mais parecida com o Claude
- Experiência externa mais parecida com o Claude

Este plano escolhe claramente a segunda opção.