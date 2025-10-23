# Qwen Code Core: Tools API

O core do Qwen Code (`packages/core`) apresenta um sistema robusto para definir, registrar e executar tools. Essas tools estendem as capacidades do modelo, permitindo que ele interaja com o ambiente local, busque conteúdo da web e execute várias ações além da simples geração de texto.

## Conceitos Principais

- **Tool (`tools.ts`)**: Uma interface e classe base (`BaseTool`) que define o contrato para todas as ferramentas. Cada tool deve ter:
  - `name`: Um nome interno único (usado nas chamadas da API para o modelo).
  - `displayName`: Um nome amigável para o usuário.
  - `description`: Uma explicação clara do que a ferramenta faz, fornecida ao modelo.
  - `parameterSchema`: Um schema JSON definindo os parâmetros aceitos pela ferramenta. Isso é essencial para que o modelo entenda como chamar a ferramenta corretamente.
  - `validateToolParams()`: Um método para validar os parâmetros recebidos.
  - `getDescription()`: Um método que retorna uma descrição legível por humanos sobre o que a ferramenta fará com os parâmetros específicos antes da execução.
  - `shouldConfirmExecute()`: Um método para determinar se é necessário confirmar com o usuário antes da execução (por exemplo, em operações potencialmente destrutivas).
  - `execute()`: O método principal que realiza a ação da ferramenta e retorna um `ToolResult`.

- **`ToolResult` (`tools.ts`)**: Uma interface que define a estrutura do resultado da execução de uma ferramenta:
  - `llmContent`: O conteúdo factual a ser incluído no histórico enviado de volta ao LLM como contexto. Pode ser uma string simples ou um `PartListUnion` (um array de objetos `Part` e strings) para conteúdo rico.
  - `returnDisplay`: Uma string amigável para o usuário (geralmente em Markdown) ou um objeto especial (como `FileDiff`) para exibição no CLI.

- **Retornando Conteúdo Rico**: As ferramentas não estão limitadas a retornar apenas texto simples. O campo `llmContent` pode ser um `PartListUnion`, que é um array contendo uma combinação de objetos `Part` (para imagens, áudio, etc.) e strings. Isso permite que uma única execução de ferramenta retorne múltiplos conteúdos ricos.

- **Registro de Ferramentas (`tool-registry.ts`)**: Uma classe (`ToolRegistry`) responsável por:
  - **Registrar Ferramentas**: Manter uma coleção de todas as ferramentas nativas disponíveis (ex.: `ReadFileTool`, `ShellTool`).
  - **Descobrir Ferramentas**: Também pode descobrir ferramentas dinamicamente:
    - **Descoberta via Comando**: Se `tools.toolDiscoveryCommand` estiver configurado nas settings, esse comando será executado. Espera-se que ele retorne um JSON descrevendo ferramentas personalizadas, que serão registradas como instâncias de `DiscoveredTool`.
    - **Descoberta via MCP**: Se `mcp.mcpServerCommand` estiver configurado, o registro pode conectar-se a um servidor Model Context Protocol (MCP) para listar e registrar ferramentas (`DiscoveredMCPTool`).
  - **Fornecer Schemas**: Expõe os schemas `FunctionDeclaration` de todas as ferramentas registradas ao modelo, para que ele saiba quais ferramentas estão disponíveis e como usá-las.
  - **Recuperar Ferramentas**: Permite que o núcleo obtenha uma ferramenta específica pelo nome para execução.

## Ferramentas Integradas

O core vem com um conjunto de ferramentas pré-definidas, normalmente encontradas em `packages/core/src/tools/`. Estas incluem:

- **Ferramentas do Sistema de Arquivos:**
  - `LSTool` (`ls.ts`): Lista o conteúdo de um diretório.
  - `ReadFileTool` (`read-file.ts`): Lê o conteúdo de um único arquivo. Recebe um parâmetro `absolute_path`, que deve ser um caminho absoluto.
  - `WriteFileTool` (`write-file.ts`): Escreve conteúdo em um arquivo.
  - `GrepTool` (`grep.ts`): Busca por padrões em arquivos.
  - `GlobTool` (`glob.ts`): Encontra arquivos que correspondem a padrões glob.
  - `EditTool` (`edit.ts`): Realiza modificações in-place em arquivos (geralmente requer confirmação).
  - `ReadManyFilesTool` (`read-many-files.ts`): Lê e concatena conteúdo de múltiplos arquivos ou padrões glob (usado pelo comando `@` no CLI).
- **Ferramentas de Execução:**
  - `ShellTool` (`shell.ts`): Executa comandos shell arbitrários (requer sandboxing cuidadoso e confirmação do usuário).
- **Ferramentas Web:**
  - `WebFetchTool` (`web-fetch.ts`): Busca conteúdo de uma URL.
  - `WebSearchTool` (`web-search.ts`): Realiza uma busca na web.
- **Ferramentas de Memória:**
  - `MemoryTool` (`memoryTool.ts`): Interage com a memória da IA.

Cada uma dessas ferramentas estende `BaseTool` e implementa os métodos necessários para sua funcionalidade específica.

## Fluxo de Execução da Tool

1.  **Solicitação do Modelo:** Com base no prompt do usuário e nos schemas das tools fornecidos, o modelo decide usar uma tool e retorna uma parte `FunctionCall` em sua resposta, especificando o nome da tool e os argumentos.
2.  **Núcleo Recebe a Solicitação:** O núcleo faz o parse dessa `FunctionCall`.
3.  **Recuperação da Tool:** Ele procura a tool solicitada no `ToolRegistry`.
4.  **Validação dos Parâmetros:** O método `validateToolParams()` da tool é chamado.
5.  **Confirmação (se necessário):**
    - O método `shouldConfirmExecute()` da tool é chamado.
    - Se ele retornar detalhes para confirmação, o núcleo comunica isso de volta ao CLI, que solicita a confirmação ao usuário.
    - A decisão do usuário (ex.: continuar, cancelar) é enviada novamente ao núcleo.
6.  **Execução:** Se validado e confirmado (ou se nenhuma confirmação for necessária), o núcleo chama o método `execute()` da tool com os argumentos fornecidos e um `AbortSignal` (para possível cancelamento).
7.  **Processamento do Resultado:** O `ToolResult` retornado por `execute()` é recebido pelo núcleo.
8.  **Resposta ao Modelo:** O `llmContent` do `ToolResult` é empacotado como um `FunctionResponse` e enviado de volta ao modelo para que ele possa continuar gerando a resposta voltada ao usuário.
9.  **Exibição ao Usuário:** O `returnDisplay` do `ToolResult` é enviado ao CLI para mostrar ao usuário o que a tool fez.

## Extendendo com Ferramentas Personalizadas

Embora o registro programático direto de novas ferramentas pelos usuários não seja explicitamente detalhado como um fluxo de trabalho principal nos arquivos fornecidos para usuários finais típicos, a arquitetura suporta extensão através de:

- **Descoberta Baseada em Comandos:** Usuários avançados ou administradores de projeto podem definir um `tools.toolDiscoveryCommand` no `settings.json`. Este comando, quando executado pelo core, deve retornar um array JSON de objetos `FunctionDeclaration`. O core então disponibilizará essas funções como instâncias de `DiscoveredTool`. O `tools.toolCallCommand` correspondente será responsável por executar essas ferramentas personalizadas.
- **Servidores MCP:** Para cenários mais complexos, um ou mais servidores MCP podem ser configurados e definidos através da configuração `mcpServers` no `settings.json`. O core pode então descobrir e utilizar ferramentas expostas por esses servidores. Como mencionado, se você tiver múltiplos servidores MCP, os nomes das ferramentas serão prefixados com o nome do servidor da sua configuração (por exemplo, `serverAlias__actualToolName`).

Este sistema de ferramentas fornece uma maneira flexível e poderosa de ampliar as capacidades do modelo, tornando o Qwen Code um assistente versátil para uma ampla gama de tarefas.