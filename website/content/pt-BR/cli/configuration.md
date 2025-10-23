# Configuração do Qwen Code

**Nota sobre o Novo Formato de Configuração**

O formato do arquivo `settings.json` foi atualizado para uma nova estrutura mais organizada. O formato antigo será migrado automaticamente.

Para detalhes sobre o formato anterior, consulte a [documentação de Configuração v1](./configuration-v1.md).

O Qwen Code oferece várias maneiras de configurar seu comportamento, incluindo variáveis de ambiente, argumentos de linha de comando e arquivos de configuração. Este documento descreve os diferentes métodos de configuração e as opções disponíveis.

## Camadas de configuração

A configuração é aplicada na seguinte ordem de precedência (números mais baixos são sobrescritos por números mais altos):

1.  **Valores padrão:** Valores hardcoded dentro da aplicação.
2.  **Arquivo de defaults do sistema:** Configurações padrão do sistema que podem ser sobrescritas por outros arquivos de configuração.
3.  **Arquivo de configurações do usuário:** Configurações globais para o usuário atual.
4.  **Arquivo de configurações do projeto:** Configurações específicas do projeto.
5.  **Arquivo de configurações do sistema:** Configurações do sistema que sobrescrevem todos os outros arquivos de configuração.
6.  **Variáveis de ambiente:** Variáveis do sistema ou específicas da sessão, potencialmente carregadas de arquivos `.env`.
7.  **Argumentos de linha de comando:** Valores passados ao iniciar o CLI.

## Arquivos de configuração

O Qwen Code utiliza arquivos de configuração no formato JSON para armazenar configurações persistentes. Existem quatro locais possíveis para esses arquivos:

- **Arquivo de padrões do sistema:**
  - **Localização:** `/etc/qwen-code/system-defaults.json` (Linux), `C:\ProgramData\qwen-code\system-defaults.json` (Windows) ou `/Library/Application Support/QwenCode/system-defaults.json` (macOS). O caminho pode ser substituído utilizando a variável de ambiente `QWEN_CODE_SYSTEM_DEFAULTS_PATH`.
  - **Escopo:** Fornece uma camada base de configurações padrão em todo o sistema. Essas configurações têm a menor precedência e devem ser substituídas por configurações definidas pelo usuário, projeto ou pelo arquivo de substituição do sistema.
  
- **Arquivo de configurações do usuário:**
  - **Localização:** `~/.qwen/settings.json` (onde `~` é o seu diretório home).
  - **Escopo:** Aplica-se a todas as sessões do Qwen Code para o usuário atual.

- **Arquivo de configurações do projeto:**
  - **Localização:** `.qwen/settings.json` dentro do diretório raiz do seu projeto.
  - **Escopo:** Aplica-se apenas quando o Qwen Code é executado a partir desse projeto específico. As configurações do projeto sobrescrevem as do usuário.

- **Arquivo de configurações do sistema:**
  - **Localização:** `/etc/qwen-code/settings.json` (Linux), `C:\ProgramData\qwen-code\settings.json` (Windows) ou `/Library/Application Support/QwenCode/settings.json` (macOS). O caminho pode ser substituído utilizando a variável de ambiente `QWEN_CODE_SYSTEM_SETTINGS_PATH`.
  - **Escopo:** Aplica-se a todas as sessões do Qwen Code no sistema, para todos os usuários. As configurações do sistema sobrescrevem as do usuário e do projeto. Pode ser útil para administradores de sistemas corporativos que precisam controlar as configurações do Qwen Code dos usuários.

**Nota sobre variáveis de ambiente nas configurações:** Valores do tipo string nos seus arquivos `settings.json` podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`. Essas variáveis serão automaticamente resolvidas quando as configurações forem carregadas. Por exemplo, se você tiver uma variável de ambiente chamada `MY_API_TOKEN`, poderá usá-la no `settings.json` assim: `"apiKey": "$MY_API_TOKEN"`.

### O diretório `.qwen` no seu projeto

Além de um arquivo de configurações do projeto, o diretório `.qwen` pode conter outros arquivos específicos do projeto relacionados à operação do Qwen Code, como:

- [Perfis de sandbox personalizados](#sandboxing) (ex.: `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).

### Configurações disponíveis em `settings.json`

As configurações são organizadas em categorias. Todas as configurações devem ser colocadas dentro do objeto da categoria correspondente no seu arquivo `settings.json`.

#### `general`

- **`general.preferredEditor`** (string):
  - **Descrição:** O editor preferido para abrir arquivos.
  - **Padrão:** `undefined`

- **`general.vimMode`** (boolean):
  - **Descrição:** Habilita keybindings do Vim.
  - **Padrão:** `false`

- **`general.disableAutoUpdate`** (boolean):
  - **Descrição:** Desativa atualizações automáticas.
  - **Padrão:** `false`

- **`general.disableUpdateNag`** (boolean):
  - **Descrição:** Desativa notificações de atualização.
  - **Padrão:** `false`

- **`general.checkpointing.enabled`** (boolean):
  - **Descrição:** Habilita checkpointing de sessão para recuperação.
  - **Padrão:** `false`

#### `output`

- **`output.format`** (string):
  - **Descrição:** O formato da saída do CLI.
  - **Padrão:** `"text"`
  - **Valores:** `"text"`, `"json"`

#### `ui`

- **`ui.theme`** (string):
  - **Descrição:** O tema de cores para a UI. Veja [Temas](./themes.md) para as opções disponíveis.
  - **Padrão:** `undefined`

- **`ui.customThemes`** (object):
  - **Descrição:** Definições de temas personalizados.
  - **Padrão:** `{}`

- **`ui.hideWindowTitle`** (boolean):
  - **Descrição:** Oculta a barra de título da janela.
  - **Padrão:** `false`

- **`ui.hideTips`** (boolean):
  - **Descrição:** Oculta dicas úteis na UI.
  - **Padrão:** `false`

- **`ui.hideBanner`** (boolean):
  - **Descrição:** Oculta o banner do aplicativo.
  - **Padrão:** `false`

- **`ui.hideFooter`** (boolean):
  - **Descrição:** Oculta o rodapé da UI.
  - **Padrão:** `false`

- **`ui.showMemoryUsage`** (boolean):
  - **Descrição:** Exibe informações de uso de memória na UI.
  - **Padrão:** `false`

- **`ui.showLineNumbers`** (boolean):
  - **Descrição:** Mostra números de linha no chat.
  - **Padrão:** `false`

- **`ui.showCitations`** (boolean):
  - **Descrição:** Mostra citações para o texto gerado no chat.
  - **Padrão:** `true`

- **`enableWelcomeBack`** (boolean):
  - **Descrição:** Mostra o diálogo de boas-vindas ao retornar a um projeto com histórico de conversa.
  - **Padrão:** `true`

- **`ui.accessibility.disableLoadingPhrases`** (boolean):
  - **Descrição:** Desativa frases de carregamento para acessibilidade.
  - **Padrão:** `false`

- **`ui.customWittyPhrases`** (array of strings):
  - **Descrição:** Uma lista de frases personalizadas para exibir durante os estados de carregamento. Quando fornecidas, o CLI vai alternar entre essas frases em vez das padrão.
  - **Padrão:** `[]`

#### `ide`

- **`ide.enabled`** (boolean):
  - **Descrição:** Habilita o modo de integração com IDE.
  - **Padrão:** `false`

- **`ide.hasSeenNudge`** (boolean):
  - **Descrição:** Indica se o usuário já viu a notificação de integração com IDE.
  - **Padrão:** `false`

#### `privacy`

- **`privacy.usageStatisticsEnabled`** (boolean):
  - **Descrição:** Habilita a coleta de estatísticas de uso.
  - **Padrão:** `true`

#### `model`

- **`model.name`** (string):
  - **Descrição:** O modelo Qwen a ser usado para as conversas.
  - **Padrão:** `undefined`

- **`model.maxSessionTurns`** (number):
  - **Descrição:** Número máximo de turnos usuário/modelo/ferramenta a serem mantidos em uma sessão. -1 significa ilimitado.
  - **Padrão:** `-1`

- **`model.summarizeToolOutput`** (object):
  - **Descrição:** Ativa ou desativa o resumo da saída da ferramenta. Você pode especificar o orçamento de tokens para o resumo usando a configuração `tokenBudget`. Nota: Atualmente apenas a ferramenta `run_shell_command` é suportada. Por exemplo `{"run_shell_command": {"tokenBudget": 2000}}`
  - **Padrão:** `undefined`

- **`model.chatCompression.contextPercentageThreshold`** (number):
  - **Descrição:** Define o limite para compressão do histórico do chat como uma porcentagem do limite total de tokens do modelo. Este é um valor entre 0 e 1 que se aplica tanto à compressão automática quanto ao comando manual `/compress`. Por exemplo, um valor de `0.6` irá acionar a compressão quando o histórico do chat exceder 60% do limite de tokens.
  - **Padrão:** `0.7`

- **`model.skipNextSpeakerCheck`** (boolean):
  - **Descrição:** Pula a verificação do próximo falante.
  - **Padrão:** `false`

- **`model.skipLoopDetection`**(boolean):
  - **Descrição:** Desativa as verificações de detecção de loops. A detecção de loops previne loops infinitos nas respostas da IA, mas pode gerar falsos positivos que interrompem fluxos de trabalho legítimos. Habilite esta opção se você experimentar interrupções frequentes por detecção de loops falsos.
  - **Padrão:** `false`

#### `context`

- **`context.fileName`** (string ou array de strings):
  - **Descrição:** O nome do(s) arquivo(s) de contexto.
  - **Padrão:** `undefined`

- **`context.importFormat`** (string):
  - **Descrição:** O formato a ser usado ao importar memória.
  - **Padrão:** `undefined`

- **`context.discoveryMaxDirs`** (number):
  - **Descrição:** Número máximo de diretórios para buscar memória.
  - **Padrão:** `200`

- **`context.includeDirectories`** (array):
  - **Descrição:** Diretórios adicionais a serem incluídos no contexto do workspace. Diretórios ausentes serão ignorados com um aviso.
  - **Padrão:** `[]`

- **`context.loadFromIncludeDirectories`** (boolean):
  - **Descrição:** Controla o comportamento do comando `/memory refresh`. Se definido como `true`, os arquivos `QWEN.md` devem ser carregados de todos os diretórios adicionados. Se definido como `false`, o `QWEN.md` deve ser carregado apenas do diretório atual.
  - **Padrão:** `false`

- **`context.fileFiltering.respectGitIgnore`** (boolean):
  - **Descrição:** Respeitar os arquivos `.gitignore` durante a busca.
  - **Padrão:** `true`

- **`context.fileFiltering.respectQwenIgnore`** (boolean):
  - **Descrição:** Respeitar os arquivos `.qwenignore` durante a busca.
  - **Padrão:** `true`

- **`context.fileFiltering.enableRecursiveFileSearch`** (boolean):
  - **Descrição:** Define se a busca recursiva por nomes de arquivos na árvore atual será habilitada ao completar prefixos `@` no prompt.
  - **Padrão:** `true`

#### `tools`

- **`tools.sandbox`** (boolean ou string):
  - **Descrição:** Ambiente de execução sandbox (pode ser um boolean ou uma string com o caminho).
  - **Padrão:** `undefined`

- **`tools.shell.enableInteractiveShell`** (boolean):

  Usa `node-pty` para uma experiência interativa no shell. O fallback para `child_process` ainda se aplica. O valor padrão é `false`.

- **`tools.core`** (array de strings):
  - **Descrição:** Pode ser usado para restringir o conjunto de ferramentas nativas [com uma lista de permissões](./enterprise.md#restricting-tool-access). Veja [Ferramentas Nativas](../core/tools-api.md#built-in-tools) para ver a lista das ferramentas principais. A semântica de correspondência é a mesma que em `tools.allowed`.
  - **Padrão:** `undefined`

- **`tools.exclude`** (array de strings):
  - **Descrição:** Nomes das ferramentas que devem ser excluídas da descoberta.
  - **Padrão:** `undefined`

- **`tools.allowed`** (array de strings):
  - **Descrição:** Lista de nomes de ferramentas que irão ignorar o diálogo de confirmação. Isso é útil para ferramentas em que você confia e usa com frequência. Por exemplo, `["run_shell_command(git)", "run_shell_command(npm test)"]` vai pular o diálogo de confirmação ao executar qualquer comando `git` ou `npm test`. Veja [Restrições de comandos da Shell Tool](../tools/shell.md#command-restrictions) para mais detalhes sobre prefixos, encadeamento de comandos, etc.
  - **Padrão:** `undefined`

- **`tools.approvalMode`** (string):
  - **Descrição:** Define o modo padrão de aprovação para uso das ferramentas. Valores aceitos são:
    - `plan`: Apenas análise, não modifica arquivos nem executa comandos.
    - `default`: Exige aprovação antes de editar arquivos ou rodar comandos shell.
    - `auto-edit`: Aprova automaticamente edições em arquivos.
    - `yolo`: Aprova automaticamente todas as chamadas de ferramentas.
  - **Padrão:** `default`

- **`tools.discoveryCommand`** (string):
  - **Descrição:** Comando a ser executado para descobrir ferramentas.
  - **Padrão:** `undefined`

- **`tools.callCommand`** (string):
  - **Descrição:** Define um comando shell personalizado para chamar uma ferramenta específica descoberta usando `tools.discoveryCommand`. O comando shell deve atender aos seguintes critérios:
    - Deve receber o `name` da função (exatamente como na [declaração da função](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) como primeiro argumento da linha de comando.
    - Deve ler os argumentos da função como JSON via `stdin`, similar ao [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - Deve retornar a saída da função como JSON via `stdout`, similar ao [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Padrão:** `undefined`

#### `mcp`

- **`mcp.serverCommand`** (string):
  - **Descrição:** Comando para iniciar um servidor MCP.
  - **Padrão:** `undefined`

- **`mcp.allowed`** (array de strings):
  - **Descrição:** Uma lista de permissões de servidores MCP permitidos.
  - **Padrão:** `undefined`

- **`mcp.excluded`** (array de strings):
  - **Descrição:** Uma lista de bloqueios de servidores MCP excluídos.
  - **Padrão:** `undefined`

#### `security`

- **`security.folderTrust.enabled`** (boolean):
  - **Descrição:** Configuração para controlar se a confiança de pasta está habilitada.
  - **Padrão:** `false`

- **`security.auth.selectedType`** (string):
  - **Descrição:** O tipo de autenticação atualmente selecionado.
  - **Padrão:** `undefined`

- **`security.auth.enforcedType`** (string):
  - **Descrição:** O tipo de autenticação obrigatório (útil para empresas).
  - **Padrão:** `undefined`

- **`security.auth.useExternal`** (boolean):
  - **Descrição:** Se deve usar um fluxo de autenticação externo.
  - **Padrão:** `undefined`

#### `advanced`

- **`advanced.autoConfigureMemory`** (boolean):
  - **Descrição:** Configura automaticamente os limites de memória do Node.js.
  - **Padrão:** `false`

- **`advanced.dnsResolutionOrder`** (string):
  - **Descrição:** A ordem de resolução DNS.
  - **Padrão:** `undefined`

- **`advanced.excludedEnvVars`** (array de strings):
  - **Descrição:** Variáveis de ambiente a serem excluídas do contexto do projeto.
  - **Padrão:** `["DEBUG","DEBUG_MODE"]`

- **`advanced.bugCommand`** (object):
  - **Descrição:** Configuração para o comando de relatório de bugs.
  - **Padrão:** `undefined`

- **`advanced.tavilyApiKey`** (string):
  - **Descrição:** Chave de API para o serviço de busca web Tavily. Necessária para habilitar a funcionalidade da tool `web_search`. Se não configurada, a tool de busca web será desabilitada e ignorada.
  - **Padrão:** `undefined`

#### `mcpServers`

Configura conexões com um ou mais servidores Model-Context Protocol (MCP) para descobrir e usar ferramentas customizadas. O Qwen Code tenta se conectar a cada servidor MCP configurado para descobrir as ferramentas disponíveis. Se múltiplos servidores MCP expuserem uma ferramenta com o mesmo nome, os nomes das ferramentas serão prefixados com o alias do servidor definido na configuração (por exemplo, `serverAlias__actualToolName`) para evitar conflitos. Note que o sistema pode remover certas propriedades do schema das definições de ferramentas MCP para manter compatibilidade. Pelo menos um dos campos `command`, `url` ou `httpUrl` deve ser fornecido. Se mais de um for especificado, a ordem de precedência é: `httpUrl`, depois `url` e por último `command`.

- **`mcpServers.<SERVER_NAME>`** (object): Os parâmetros do servidor com o nome especificado.
  - `command` (string, opcional): O comando a ser executado para iniciar o servidor MCP via entrada/saída padrão (stdin/stdout).
  - `args` (array de strings, opcional): Argumentos a serem passados para o comando.
  - `env` (object, opcional): Variáveis de ambiente a serem definidas para o processo do servidor.
  - `cwd` (string, opcional): O diretório de trabalho no qual o servidor será iniciado.
  - `url` (string, opcional): A URL de um servidor MCP que usa Server-Sent Events (SSE) para comunicação.
  - `httpUrl` (string, opcional): A URL de um servidor MCP que usa HTTP streamable para comunicação.
  - `headers` (object, opcional): Um mapa de headers HTTP a serem enviados nas requisições para `url` ou `httpUrl`.
  - `timeout` (number, opcional): Timeout em milissegundos para requisições feitas a este servidor MCP.
  - `trust` (boolean, opcional): Confiar neste servidor e ignorar todas as confirmações de chamada de ferramentas.
  - `description` (string, opcional): Uma breve descrição do servidor, que pode ser usada para fins de exibição.
  - `includeTools` (array de strings, opcional): Lista de nomes de ferramentas a serem incluídas deste servidor MCP. Quando especificada, apenas as ferramentas listadas aqui estarão disponíveis a partir deste servidor (comportamento de allowlist). Se não for especificada, todas as ferramentas do servidor são habilitadas por padrão.
  - `excludeTools` (array de strings, opcional): Lista de nomes de ferramentas a serem excluídas deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor. **Nota:** `excludeTools` tem precedência sobre `includeTools` — se uma ferramenta estiver nas duas listas, ela será excluída.

#### `telemetry`

Configura o logging e a coleta de métricas para o Qwen Code. Para mais informações, consulte [Telemetry](../telemetry.md).

- **Propriedades:**
  - **`enabled`** (boolean): Se a telemetria está habilitada ou não.
  - **`target`** (string): O destino para os dados de telemetria coletados. Os valores suportados são `local` e `gcp`.
  - **`otlpEndpoint`** (string): O endpoint para o OTLP Exporter.
  - **`otlpProtocol`** (string): O protocolo para o OTLP Exporter (`grpc` ou `http`).
  - **`logPrompts`** (boolean): Se deve incluir ou não o conteúdo dos prompts do usuário nos logs.
  - **`outfile`** (string): O arquivo para onde escrever a telemetria quando `target` é `local`.
  - **`useCollector`** (boolean): Se deve usar ou não um coletor externo OTLP.

### Exemplo de `settings.json`

Aqui está um exemplo de arquivo `settings.json` com a estrutura aninhada, nova a partir da versão v0.3.0:

```json
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideBanner": true,
    "hideTips": false,
    "customWittyPhrases": [
      "You forget a thousand things every day. Make sure this is one of ’em",
      "Connecting to AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "discoveryCommand": "bin/get_tools",
    "callCommand": "bin/call_tool",
    "exclude": ["write_file"]
  },
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "qwen3-coder-plus",
    "maxSessionTurns": 10,
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 100
      }
    }
  },
  "context": {
    "fileName": ["CONTEXT.md", "QWEN.md"],
    "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
    "loadFromIncludeDirectories": true,
    "fileFiltering": {
      "respectGitIgnore": false
    }
  },
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```

## Histórico do Shell

O CLI mantém um histórico dos comandos shell que você executa. Para evitar conflitos entre diferentes projetos, esse histórico é armazenado em um diretório específico do projeto dentro da pasta home do seu usuário.

- **Localização:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` é um identificador único gerado a partir do caminho raiz do seu projeto.
  - O histórico é armazenado em um arquivo chamado `shell_history`.

## Variáveis de Ambiente e Arquivos `.env`

Variáveis de ambiente são uma forma comum de configurar aplicações, especialmente para informações sensíveis como chaves de API ou configurações que podem variar entre ambientes. Para configurar autenticação, consulte a [documentação de Autenticação](./authentication.md), que aborda todos os métodos disponíveis.

O CLI carrega automaticamente variáveis de ambiente de um arquivo `.env`. A ordem de carregamento é:

1. Arquivo `.env` no diretório de trabalho atual.
2. Se não for encontrado, ele procura nos diretórios pais até encontrar um arquivo `.env` ou alcançar a raiz do projeto (identificada por uma pasta `.git`) ou o diretório home.
3. Se ainda não for encontrado, ele procura por `~/.env` (no diretório home do usuário).

**Exclusão de Variáveis de Ambiente:** Algumas variáveis de ambiente (como `DEBUG` e `DEBUG_MODE`) são automaticamente excluídas dos arquivos `.env` do projeto por padrão, para evitar interferência no comportamento do CLI. Variáveis de arquivos `.qwen/.env` nunca são excluídas. Você pode personalizar esse comportamento usando a configuração `advanced.excludedEnvVars` no seu arquivo `settings.json`.

- **`OPENAI_API_KEY`**:
  - Um dos vários [métodos de autenticação](./authentication.md) disponíveis.
  - Defina isso no seu perfil do shell (ex.: `~/.bashrc`, `~/.zshrc`) ou em um arquivo `.env`.
- **`OPENAI_BASE_URL`**:
  - Um dos vários [métodos de autenticação](./authentication.md) disponíveis.
  - Defina isso no seu perfil do shell (ex.: `~/.bashrc`, `~/.zshrc`) ou em um arquivo `.env`.
- **`OPENAI_MODEL`**:
  - Especifica o modelo padrão da OPENAI a ser usado.
  - Substitui o valor hardcoded padrão.
  - Exemplo: `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_TELEMETRY_ENABLED`**:
  - Defina como `true` ou `1` para habilitar telemetria. Qualquer outro valor é tratado como desabilitado.
  - Substitui a configuração `telemetry.enabled`.
- **`GEMINI_TELEMETRY_TARGET`**:
  - Define o destino da telemetria (`local` ou `gcp`).
  - Substitui a configuração `telemetry.target`.
- **`GEMINI_TELEMETRY_OTLP_ENDPOINT`**:
  - Define o endpoint OTLP para telemetria.
  - Substitui a configuração `telemetry.otlpEndpoint`.
- **`GEMINI_TELEMETRY_OTLP_PROTOCOL`**:
  - Define o protocolo OTLP (`grpc` ou `http`).
  - Substitui a configuração `telemetry.otlpProtocol`.
- **`GEMINI_TELEMETRY_LOG_PROMPTS`**:
  - Defina como `true` ou `1` para habilitar ou desabilitar o log de prompts do usuário. Qualquer outro valor é tratado como desabilitado.
  - Substitui a configuração `telemetry.logPrompts`.
- **`GEMINI_TELEMETRY_OUTFILE`**:
  - Define o caminho do arquivo para onde a telemetria será escrita quando o destino for `local`.
  - Substitui a configuração `telemetry.outfile`.
- **`GEMINI_TELEMETRY_USE_COLLECTOR`**:
  - Defina como `true` ou `1` para habilitar ou desabilitar o uso de um coletor OTLP externo. Qualquer outro valor é tratado como desabilitado.
  - Substitui a configuração `telemetry.useCollector`.
- **`GEMINI_SANDBOX`**:
  - Alternativa à configuração `sandbox` no `settings.json`.
  - Aceita `true`, `false`, `docker`, `podman` ou uma string de comando personalizada.
- **`SEATBELT_PROFILE`** (específico para macOS):
  - Alterna o perfil do Seatbelt (`sandbox-exec`) no macOS.
  - `permissive-open`: (Padrão) Restringe escritas na pasta do projeto (e algumas outras pastas, veja `packages/cli/src/utils/sandbox-macos-permissive-open.sb`) mas permite outras operações.
  - `strict`: Usa um perfil restrito que nega operações por padrão.
  - `<profile_name>`: Usa um perfil personalizado. Para definir um perfil personalizado, crie um arquivo chamado `sandbox-macos-<profile_name>.sb` no diretório `.qwen/` do seu projeto (ex.: `my-project/.qwen/sandbox-macos-custom.sb`).
- **`DEBUG` ou `DEBUG_MODE`** (geralmente usadas por bibliotecas subjacentes ou pelo próprio CLI):
  - Defina como `true` ou `1` para habilitar logs detalhados de debug, o que pode ser útil para troubleshooting.
  - **Nota:** Essas variáveis são automaticamente excluídas dos arquivos `.env` do projeto por padrão, para evitar interferência no comportamento do CLI. Use arquivos `.qwen/.env` se precisar definir essas variáveis especificamente para o Qwen Code.
- **`NO_COLOR`**:
  - Defina com qualquer valor para desativar todas as saídas coloridas no CLI.
- **`CLI_TITLE`**:
  - Defina com uma string para personalizar o título do CLI.
- **`TAVILY_API_KEY`**:
  - Sua chave de API para o serviço de busca web Tavily.
  - Necessário para habilitar a funcionalidade da tool `web_search`.
  - Se não configurado, a tool de busca web será desabilitada e ignorada.
  - Exemplo: `export TAVILY_API_KEY="tvly-your-api-key-here"`

## Argumentos de Linha de Comando

Argumentos passados diretamente ao executar o CLI podem substituir outras configurações para aquela sessão específica.

- **`--model <model_name>`** (**`-m <model_name>`**):
  - Especifica o modelo Qwen a ser usado nesta sessão.
  - Exemplo: `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - Usado para passar um prompt diretamente para o comando. Isso invoca o Qwen Code em modo não interativo.
  - Para exemplos de scripts, use a flag `--output-format json` para obter uma saída estruturada.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - Inicia uma sessão interativa com o prompt fornecido como entrada inicial.
  - O prompt é processado dentro da sessão interativa, e não antes dela.
  - Não pode ser usado quando há entrada via pipe do stdin.
  - Exemplo: `qwen -i "explain this code"`
- **`--output-format <format>`**:
  - **Descrição:** Define o formato da saída do CLI no modo não interativo.
  - **Valores:**
    - `text`: (Padrão) Saída legível por humanos.
    - `json`: Saída em formato JSON legível por máquinas.
  - **Nota:** Para saídas estruturadas e scripts, utilize a flag `--output-format json`.
- **`--sandbox`** (**`-s`**):
  - Ativa o modo sandbox para esta sessão.
- **`--sandbox-image`**:
  - Define a URI da imagem sandbox.
- **`--debug`** (**`-d`**):
  - Ativa o modo debug para esta sessão, fornecendo uma saída mais detalhada.
- **`--all-files`** (**`-a`**):
  - Se definido, inclui recursivamente todos os arquivos no diretório atual como contexto para o prompt.
- **`--help`** (ou **`-h`**):
  - Exibe informações de ajuda sobre os argumentos da linha de comando.
- **`--show-memory-usage`**:
  - Exibe o uso atual de memória.
- **`--yolo`**:
  - Ativa o modo YOLO, que aprova automaticamente todas as chamadas de ferramentas.
- **`--approval-mode <mode>`**:
  - Define o modo de aprovação para chamadas de ferramentas. Modos suportados:
    - `plan`: Apenas análise — não modifica arquivos nem executa comandos.
    - `default`: Requer aprovação para edição de arquivos ou comandos shell (comportamento padrão).
    - `auto-edit`: Aprova automaticamente ferramentas de edição (edit, write_file), solicitando confirmação para as demais.
    - `yolo`: Aprova automaticamente todas as chamadas de ferramentas (equivalente a `--yolo`).
  - Não pode ser usado junto com `--yolo`. Use `--approval-mode=yolo` em vez de `--yolo` para a nova abordagem unificada.
  - Exemplo: `qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`**:
  - Lista separada por vírgulas dos nomes das ferramentas que ignoram a caixa de diálogo de confirmação.
  - Exemplo: `qwen --allowed-tools "ShellTool(git status)"`
- **`--telemetry`**:
  - Ativa a [telemetria](../telemetry.md).
- **`--telemetry-target`**:
  - Define o destino da telemetria. Veja [telemetria](../telemetry.md) para mais informações.
- **`--telemetry-otlp-endpoint`**:
  - Define o endpoint OTLP para telemetria. Veja [telemetria](../telemetry.md) para mais informações.
- **`--telemetry-otlp-protocol`**:
  - Define o protocolo OTLP para telemetria (`grpc` ou `http`). Padrão é `grpc`. Veja [telemetria](../telemetry.md) para mais informações.
- **`--telemetry-log-prompts`**:
  - Ativa o log de prompts para telemetria. Veja [telemetria](../telemetry.md) para mais informações.
- **`--checkpointing`**:
  - Ativa o [checkpointing](../checkpointing.md).
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - Especifica uma lista de extensões a serem usadas na sessão. Se não for fornecida, todas as extensões disponíveis serão usadas.
  - Use o termo especial `qwen -e none` para desativar todas as extensões.
  - Exemplo: `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - Lista todas as extensões disponíveis e encerra.
- **`--proxy`**:
  - Define o proxy para o CLI.
  - Exemplo: `--proxy http://localhost:7890`.
- **`--include-directories <dir1,dir2,...>`**:
  - Inclui diretórios adicionais no workspace para suporte a múltiplos diretórios.
  - Pode ser especificado várias vezes ou como valores separados por vírgula.
  - No máximo 5 diretórios podem ser adicionados.
  - Exemplo: `--include-directories /path/to/project1,/path/to/project2` ou `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`**:
  - Ativa o modo leitor de tela, ajustando a interface TUI para melhor compatibilidade com leitores de tela.
- **`--version`**:
  - Exibe a versão do CLI.
- **`--openai-logging`**:
  - Ativa o log das chamadas à API da OpenAI para depuração e análise. Esta flag sobrescreve a configuração `enableOpenAILogging` no arquivo `settings.json`.
- **`--tavily-api-key <api_key>`**:
  - Define a chave da API Tavily para funcionalidade de busca na web nesta sessão.
  - Exemplo: `qwen --tavily-api-key tvly-your-api-key-here`

## Arquivos de Contexto (Contexto Instrucional Hierárquico)

Embora não sejam estritamente uma configuração para o _comportamento_ da CLI, os arquivos de contexto (por padrão `QWEN.md`, mas configuráveis através da opção `context.fileName`) são essenciais para definir o _contexto instrucional_ (também chamado de "memória"). Este recurso poderoso permite que você forneça instruções específicas do projeto, guias de estilo de código ou qualquer informação relevante ao AI, tornando suas respostas mais adaptadas e precisas às suas necessidades. A CLI inclui elementos de interface, como um indicador no rodapé mostrando o número de arquivos de contexto carregados, mantendo você informado sobre o contexto ativo.

- **Propósito:** Esses arquivos Markdown contêm instruções, diretrizes ou contexto que você deseja que o modelo Qwen leve em consideração durante as interações. O sistema foi projetado para gerenciar esse contexto instrucional de forma hierárquica.

### Exemplo de Conteúdo do Arquivo de Contexto (ex: `QWEN.md`)

Aqui está um exemplo conceitual do que um arquivo de contexto na raiz de um projeto TypeScript pode conter:

```markdown

# Projeto: Minha Incrível Biblioteca TypeScript

## Instruções Gerais:

- Ao gerar novo código TypeScript, siga o estilo de codificação existente.
- Certifique-se de que todas as novas funções e classes tenham comentários JSDoc.
- Prefira paradigmas de programação funcional quando apropriado.
- Todo o código deve ser compatível com TypeScript 5.0 e Node.js 20+.

## Estilo de Codificação:

- Use 2 espaços para indentação.
- Nomes de interfaces devem ser prefixados com `I` (ex: `IUserService`).
- Membros privados de classes devem ser prefixados com um underscore (`_`).
- Sempre use igualdade estrita (`===` e `!==`).

## Componente Específico: `src/api/client.ts`

- Este arquivo lida com todas as requisições de API de saída.
- Ao adicionar novas funções de chamada de API, certifique-se de incluir tratamento de erros robusto e logging.
- Use o utilitário `fetchWithRetry` existente para todas as requisições GET.
```

## Sobre Dependências:

- Evite introduzir novas dependências externas, a menos que seja absolutamente necessário.
- Se uma nova dependência for necessária, por favor, informe o motivo.
```

Este exemplo demonstra como você pode fornecer contexto geral do projeto, convenções específicas de codificação e até mesmo observações sobre arquivos ou componentes particulares. Quanto mais relevantes e precisos forem seus arquivos de contexto, melhor a IA poderá te ajudar. Arquivos de contexto específicos do projeto são altamente recomendados para estabelecer convenções e contexto.

- **Carregamento Hierárquico e Precedência:** O CLI implementa um sistema hierárquico sofisticado de memória carregando os arquivos de contexto (por exemplo, `QWEN.md`) de diversos locais. Conteúdo dos arquivos mais abaixo nesta lista (mais específicos) normalmente substitui ou complementa o conteúdo dos arquivos mais acima (mais genéricos). A ordem exata da concatenação e o contexto final podem ser inspecionados usando o comando `/memory show`. A ordem típica de carregamento é:
  1.  **Arquivo de Contexto Global:**
      - Localização: `~/.qwen/<nome-do-arquivo-de-contexto-configurado>` (ex.: `~/.qwen/QWEN.md` no diretório home do usuário).
      - Escopo: Fornece instruções padrão para todos os seus projetos.
  2.  **Arquivos de Contexto na Raiz do Projeto e Diretórios Superiores:**
      - Localização: O CLI procura pelo arquivo de contexto configurado no diretório atual e depois em cada diretório pai até encontrar a raiz do projeto (identificada pela pasta `.git`) ou seu diretório home.
      - Escopo: Fornece contexto relevante para todo o projeto ou uma parte significativa dele.
  3.  **Arquivos de Contexto em Subdiretórios (Contextuais/Locais):**
      - Localização: O CLI também verifica se há o arquivo de contexto configurado nos subdiretórios _abaixo_ do diretório atual (respeitando padrões comuns de exclusão como `node_modules`, `.git`, etc.). Por padrão, a profundidade dessa busca é limitada a 200 diretórios, mas pode ser ajustada com a configuração `context.discoveryMaxDirs` no seu arquivo `settings.json`.
      - Escopo: Permite instruções altamente específicas relacionadas a um componente, módulo ou subseção específica do seu projeto.
- **Concatenação e Indicação na Interface:** O conteúdo de todos os arquivos de contexto encontrados é concatenado (com separadores indicando sua origem e caminho) e fornecido como parte do prompt do sistema. O rodapé do CLI mostra a quantidade de arquivos de contexto carregados, oferecendo uma indicação visual rápida sobre o contexto instrucional ativo.
- **Importação de Conteúdo:** Você pode modularizar seus arquivos de contexto importando outros arquivos Markdown usando a sintaxe `@caminho/para/o/arquivo.md`. Para mais detalhes, consulte a [documentação do Processador de Importação de Memória](../core/memport.md).
- **Comandos para Gerenciamento de Memória:**
  - Use `/memory refresh` para forçar uma nova varredura e recarregar todos os arquivos de contexto de todos os locais configurados. Isso atualiza o contexto instrucional da IA.
  - Use `/memory show` para exibir o contexto instrucional combinado atualmente carregado, permitindo verificar a hierarquia e o conteúdo usado pela IA.
  - Veja a [documentação dos Comandos](./commands.md#memory) para detalhes completos sobre o comando `/memory` e seus subcomandos (`show` e `refresh`).

Ao entender e utilizar essas camadas de configuração e a natureza hierárquica dos arquivos de contexto, você pode gerenciar efetivamente a memória da IA e personalizar as respostas do Qwen Code conforme suas necessidades e projetos específicos.

## Sandboxing

O Qwen Code pode executar operações potencialmente inseguras (como comandos shell e modificações de arquivos) dentro de um ambiente sandbox para proteger seu sistema.

O sandboxing vem desativado por padrão, mas você pode ativá-lo de algumas formas:

- Usando a flag `--sandbox` ou `-s`.
- Definindo a variável de ambiente `GEMFI_SANDBOX`.
- O sandbox é ativado automaticamente ao usar `--yolo` ou `--approval-mode=yolo`.

Por padrão, ele usa uma imagem Docker pré-construída chamada `qwen-code-sandbox`.

Para necessidades específicas de sandboxing no seu projeto, você pode criar um Dockerfile personalizado em `.qwen/sandbox.Dockerfile` na raiz do seu projeto. Esse Dockerfile pode ser baseado na imagem base do sandbox:

```dockerfile
FROM qwen-code-sandbox

# Adicione suas dependências ou configurações personalizadas aqui

# Por exemplo:

# RUN apt-get update && apt-get install -y algum-pacote
```

# COPY ./my-config /app/my-config
```

Quando o arquivo `.qwen/sandbox.Dockerfile` existir, você pode usar a variável de ambiente `BUILD_SANDBOX` ao executar o Qwen Code para construir automaticamente a imagem personalizada do sandbox:

```bash
BUILD_SANDBOX=1 qwen -s
```

## Estatísticas de Uso

Para nos ajudar a melhorar o Qwen Code, coletamos estatísticas de uso anonimizadas. Esses dados nos ajudam a entender como o CLI está sendo usado, identificar problemas comuns e priorizar novos recursos.

**O que coletamos:**

- **Chamadas de Ferramentas:** Registramos os nomes das ferramentas que são chamadas, se elas são bem-sucedidas ou falham, e quanto tempo levam para serem executadas. Não coletamos os argumentos passados para as ferramentas nem nenhum dado retornado por elas.
- **Requisições de API:** Registramos o modelo usado em cada requisição, a duração da requisição e se ela foi bem-sucedida. Não coletamos o conteúdo dos prompts ou das respostas.
- **Informações da Sessão:** Coletamos informações sobre a configuração do CLI, como as ferramentas habilitadas e o modo de aprovação.

**O que NÃO coletamos:**

- **Informações Pessoalmente Identificáveis (PII):** Não coletamos nenhuma informação pessoal, como seu nome, endereço de e-mail ou chaves de API.
- **Conteúdo de Prompts e Respostas:** Não registramos o conteúdo dos seus prompts ou das respostas do modelo.
- **Conteúdo de Arquivos:** Não registramos o conteúdo de nenhum arquivo lido ou escrito pelo CLI.

**Como desativar:**

Você pode desativar a coleta de estatísticas de uso a qualquer momento definindo a propriedade `usageStatisticsEnabled` como `false` na categoria `privacy` do seu arquivo `settings.json`:

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

Nota: Quando as estatísticas de uso estão ativadas, os eventos são enviados para um endpoint de coleta RUM da Alibaba Cloud.