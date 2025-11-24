# Configuração do Qwen Code

O Qwen Code oferece várias formas de configurar seu comportamento, incluindo variáveis de ambiente, argumentos de linha de comando e arquivos de configuração. Este documento descreve os diferentes métodos de configuração e as opções disponíveis.

## Camadas de configuração

A configuração é aplicada na seguinte ordem de precedência (números mais baixos são substituídos por números mais altos):

1.  **Valores padrão:** Valores hardcoded dentro da aplicação.
2.  **Arquivo de padrões do sistema:** Configurações padrão em todo o sistema que podem ser substituídas por outros arquivos de configuração.
3.  **Arquivo de configurações do usuário:** Configurações globais para o usuário atual.
4.  **Arquivo de configurações do projeto:** Configurações específicas do projeto.
5.  **Arquivo de configurações do sistema:** Configurações em todo o sistema que substituem todos os outros arquivos de configuração.
6.  **Variáveis de ambiente:** Variáveis em todo o sistema ou específicas da sessão, potencialmente carregadas de arquivos `.env`.
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
  - **Escopo:** Aplica-se apenas quando o Qwen Code é executado a partir desse projeto específico. As configurações do projeto sobrepõem as configurações do usuário.

- **Arquivo de configurações do sistema:**
  - **Localização:** `/etc/qwen-code/settings.json` (Linux), `C:\ProgramData\qwen-code\settings.json` (Windows) ou `/Library/Application Support/QwenCode/settings.json` (macOS). O caminho pode ser substituído utilizando a variável de ambiente `QWEN_CODE_SYSTEM_SETTINGS_PATH`.
  - **Escopo:** Aplica-se a todas as sessões do Qwen Code no sistema, para todos os usuários. As configurações do sistema sobrepõem as configurações do usuário e do projeto. Pode ser útil para administradores de sistemas corporativos que precisam controlar as configurações do Qwen Code dos usuários.

**Nota sobre variáveis de ambiente nas configurações:** Valores do tipo string nos seus arquivos `settings.json` podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`. Essas variáveis serão automaticamente resolvidas quando as configurações forem carregadas. Por exemplo, se você tiver uma variável de ambiente chamada `MY_API_TOKEN`, poderá utilizá-la no `settings.json` da seguinte forma: `"apiKey": "$MY_API_TOKEN"`.

### O diretório `.qwen` no seu projeto

Além de um arquivo de configurações do projeto, o diretório `.qwen` pode conter outros arquivos específicos do projeto relacionados à operação do Qwen Code, como:

- [Perfis de sandbox personalizados](#sandboxing) (ex.: `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).

### Configurações disponíveis em `settings.json`:

- **`contextFileName`** (string ou array de strings):
  - **Descrição:** Especifica o nome do arquivo para arquivos de contexto (ex.: `QWEN.md`, `AGENTS.md`). Pode ser um único nome de arquivo ou uma lista de nomes aceitos.
  - **Padrão:** `QWEN.md`
  - **Exemplo:** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (objeto):
  - **Descrição:** Substitui a URL padrão para o comando `/bug`.
  - **Padrão:** `"urlTemplate": "https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **Propriedades:**
    - **`urlTemplate`** (string): Uma URL que pode conter os placeholders `{title}` e `{info}`.
  - **Exemplo:**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (objeto):
  - **Descrição:** Controla o comportamento de filtragem de arquivos com base no git para comandos @ e ferramentas de descoberta de arquivos.
  - **Padrão:** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **Propriedades:**
    - **`respectGitIgnore`** (boolean): Define se os padrões do `.gitignore` devem ser respeitados ao descobrir arquivos. Quando definido como `true`, arquivos ignorados pelo git (como `node_modules/`, `dist/`, `.env`) são automaticamente excluídos dos comandos @ e operações de listagem de arquivos.
    - **`enableRecursiveFileSearch`** (boolean): Define se a busca recursiva por nomes de arquivos no diretório atual deve ser habilitada ao completar prefixos @ no prompt.
    - **`disableFuzzySearch`** (boolean): Quando definido como `true`, desativa a pesquisa difusa (fuzzy search) ao procurar arquivos, o que pode melhorar o desempenho em projetos com muitos arquivos.
  - **Exemplo:**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false,
      "disableFuzzySearch": true
    }
    ```

### Solução de Problemas de Desempenho na Busca de Arquivos

Se você estiver enfrentando problemas de desempenho na busca por arquivos (por exemplo, com os recursos de autocompletar usando `@`), especialmente em projetos com um número muito grande de arquivos, aqui estão algumas coisas que você pode tentar, em ordem de recomendação:

1. **Use o `.qwenignore`:** Crie um arquivo `.qwenignore` na raiz do seu projeto para excluir diretórios que contenham um grande número de arquivos que você não precisa referenciar (por exemplo, artefatos de build, logs, `node_modules`). Reduzir o número total de arquivos indexados é a forma mais eficaz de melhorar o desempenho.

2. **Desative a Busca Fuzzy:** Se ignorar arquivos não for suficiente, você pode desativar a busca fuzzy definindo `disableFuzzySearch` como `true` no seu arquivo `settings.json`. Isso usará um algoritmo de correspondência mais simples e não fuzzy, o que pode ser mais rápido.

3. **Desative a Busca Recursiva de Arquivos:** Como último recurso, você pode desativar completamente a busca recursiva de arquivos definindo `enableRecursiveFileSearch` como `false`. Essa será a opção mais rápida, pois evita uma varredura recursiva do seu projeto. No entanto, isso significa que você precisará digitar o caminho completo dos arquivos ao usar o autocompletar com `@`.

- **`coreTools`** (array de strings):
  - **Descrição:** Permite especificar uma lista de nomes de ferramentas principais que devem estar disponíveis para o modelo. Isso pode ser usado para restringir o conjunto de ferramentas integradas. Veja [Built-in Tools](../core/tools-api.md#built-in-tools) para obter uma lista das ferramentas principais. Você também pode especificar restrições específicas por comando para ferramentas que suportam isso, como o `ShellTool`. Por exemplo, `"coreTools": ["ShellTool(ls -l)"]` permitirá apenas a execução do comando `ls -l`.
  - **Padrão:** Todas as ferramentas disponíveis para uso pelo modelo.
  - **Exemplo:** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`.

- **`allowedTools`** (array de strings):
  - **Padrão:** `undefined`
  - **Descrição:** Uma lista de nomes de ferramentas que irão ignorar o diálogo de confirmação. Isso é útil para ferramentas em que você confia e usa com frequência. A semântica de correspondência é a mesma que em `coreTools`.
  - **Exemplo:** `"allowedTools": ["ShellTool(git status)"]`.

- **`excludeTools`** (array de strings):
  - **Descrição:** Permite especificar uma lista de nomes de ferramentas principais que devem ser excluídas do modelo. Uma ferramenta listada tanto em `excludeTools` quanto em `coreTools` será excluída. Você também pode especificar restrições específicas por comando para ferramentas que suportam isso, como o `ShellTool`. Por exemplo, `"excludeTools": ["ShellTool(rm -rf)"]` bloqueará o comando `rm -rf`.
  - **Padrão:** Nenhuma ferramenta excluída.
  - **Exemplo:** `"excludeTools": ["run_shell_command", "findFiles"]`.
  - **Nota de Segurança:** Restrições específicas por comando em `excludeTools` para `run_shell_command` são baseadas em correspondência simples de strings e podem ser facilmente contornadas. Este recurso **não é um mecanismo de segurança** e não deve ser usado para executar código não confiável com segurança. É recomendado usar `coreTools` para selecionar explicitamente os comandos que podem ser executados.

- **`allowMCPServers`** (array de strings):
  - **Descrição:** Permite especificar uma lista de nomes de servidores MCP que devem estar disponíveis para o modelo. Isso pode ser usado para restringir o conjunto de servidores MCP aos quais se conectar. Observe que isso será ignorado se `--allowed-mcp-server-names` estiver definido.
  - **Padrão:** Todos os servidores MCP estão disponíveis para uso pelo modelo.
  - **Exemplo:** `"allowMCPServers": ["myPythonServer"]`.
  - **Nota de Segurança:** Isso usa correspondência simples de strings nos nomes dos servidores MCP, que podem ser modificados. Se você for um administrador de sistema e quiser evitar que os usuários contornem essa configuração, considere configurar os `mcpServers` no nível das configurações do sistema de modo que o usuário não possa configurar nenhum servidor MCP próprio. Isso não deve ser usado como um mecanismo de segurança infalível.

- **`excludeMCPServers`** (array de strings):
  - **Descrição:** Permite especificar uma lista de nomes de servidores MCP que devem ser excluídos do modelo. Um servidor listado tanto em `excludeMCPServers` quanto em `allowMCPServers` será excluído. Observe que isso será ignorado se `--allowed-mcp-server-names` estiver definido.
  - **Padrão:** Nenhum servidor MCP excluído.
  - **Exemplo:** `"excludeMCPServers": ["myNodeServer"]`.
  - **Nota de Segurança:** Isso usa correspondência simples de strings nos nomes dos servidores MCP, que podem ser modificados. Se você for um administrador de sistema e quiser evitar que os usuários contornem essa configuração, considere configurar os `mcpServers` no nível das configurações do sistema de modo que o usuário não possa configurar nenhum servidor MCP próprio. Isso não deve ser usado como um mecanismo de segurança infalível.

- **`autoAccept`** (booleano):
  - **Descrição:** Controla se a CLI aceita e executa automaticamente chamadas de ferramentas consideradas seguras (por exemplo, operações somente leitura) sem confirmação explícita do usuário. Se definido como `true`, a CLI ignorará o prompt de confirmação para ferramentas consideradas seguras.
  - **Padrão:** `false`
  - **Exemplo:** `"autoAccept": true`

- **`theme`** (string):
  - **Descrição:** Define o [tema](./themes.md) visual para o Qwen Code.
  - **Padrão:** `"Default"`
  - **Exemplo:** `"theme": "GitHub"`

- **`vimMode`** (booleano):
  - **Descrição:** Habilita ou desabilita o modo vim para edição de entrada. Quando ativado, a área de entrada suporta comandos de navegação e edição no estilo vim com modos NORMAL e INSERT. O status do modo vim é exibido no rodapé e persiste entre sessões.
  - **Padrão:** `false`
  - **Exemplo:** `"vimMode": true`

- **`sandbox`** (booleano ou string):
  - **Descrição:** Controla se e como usar sandboxing para a execução de ferramentas. Se definido como `true`, o Qwen Code usa uma imagem Docker pré-construída `qwen-code-sandbox`. Para mais informações, veja [Sandboxing](#sandboxing).
  - **Padrão:** `false`
  - **Exemplo:** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (string):
  - **Descrição:** **Alinhado com o CLI do Gemini.** Define um comando shell personalizado para descobrir ferramentas do seu projeto. O comando shell deve retornar em `stdout` um array JSON de [declarações de função](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations). Os wrappers de ferramentas são opcionais.
  - **Padrão:** Vazio
  - **Exemplo:** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (string):
  - **Descrição:** **Alinhado com o CLI do Gemini.** Define um comando shell personalizado para chamar uma ferramenta específica descoberta usando `toolDiscoveryCommand`. O comando shell deve atender aos seguintes critérios:
    - Deve receber o `nome` da função (exatamente como na [declaração de função](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) como primeiro argumento da linha de comando.
    - Deve ler os argumentos da função como JSON em `stdin`, de forma análoga a [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - Deve retornar a saída da função como JSON em `stdout`, de forma análoga a [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Padrão:** Vazio
  - **Exemplo:** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (objeto):
  - **Descrição:** Configura conexões com um ou mais servidores Model-Context Protocol (MCP) para descobrir e usar ferramentas personalizadas. O Qwen Code tenta se conectar a cada servidor MCP configurado para descobrir as ferramentas disponíveis. Se vários servidores MCP expuserem uma ferramenta com o mesmo nome, os nomes das ferramentas serão prefixados com o alias do servidor definido na configuração (por exemplo, `serverAlias__actualToolName`) para evitar conflitos. Observe que o sistema pode remover certas propriedades de esquema das definições de ferramentas MCP para compatibilidade. Pelo menos um dos campos `command`, `url` ou `httpUrl` deve ser fornecido. Se mais de um for especificado, a ordem de precedência é `httpUrl`, depois `url`, depois `command`.
  - **Padrão:** Vazio
  - **Propriedades:**
    - **`<SERVER_NAME>`** (objeto): Os parâmetros do servidor nomeado.
      - `command` (string, opcional): O comando a ser executado para iniciar o servidor MCP via E/S padrão.
      - `args` (array de strings, opcional): Argumentos a serem passados ao comando.
      - `env` (objeto, opcional): Variáveis de ambiente a serem definidas para o processo do servidor.
      - `cwd` (string, opcional): O diretório de trabalho onde o servidor será iniciado.
      - `url` (string, opcional): A URL de um servidor MCP que usa Server-Sent Events (SSE) para comunicação.
      - `httpUrl` (string, opcional): A URL de um servidor MCP que usa HTTP streamable para comunicação.
      - `headers` (objeto, opcional): Um mapa de cabeçalhos HTTP a serem enviados com solicitações para `url` ou `httpUrl`.
      - `timeout` (número, opcional): Tempo limite em milissegundos para solicitações a este servidor MCP.
      - `trust` (booleano, opcional): Confiar neste servidor e ignorar todas as confirmações de chamadas de ferramentas.
      - `description` (string, opcional): Uma breve descrição do servidor, que pode ser usada para fins de exibição.
      - `includeTools` (array de strings, opcional): Lista de nomes de ferramentas a incluir deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis a partir deste servidor (comportamento de whitelist). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão.
      - `excludeTools` (array de strings, opcional): Lista de nomes de ferramentas a excluir deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor. **Nota:** `excludeTools` tem precedência sobre `includeTools` – se uma ferramenta estiver nas duas listas, ela será excluída.
  - **Exemplo:**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000,
        "includeTools": ["safe_tool", "file_reader"],
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node",
        "excludeTools": ["dangerous_tool", "file_deleter"]
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      },
      "mySseServer": {
        "url": "http://localhost:8081/events",
        "headers": {
          "Authorization": "Bearer $MY_SSE_TOKEN"
        },
        "description": "Um exemplo de servidor MCP baseado em SSE."
      },
      "myStreamableHttpServer": {
        "httpUrl": "http://localhost:8082/stream",
        "headers": {
          "X-API-Key": "$MY_HTTP_API_KEY"
        },
        "description": "Um exemplo de servidor MCP baseado em HTTP streamable."
      }
    }
    ```

- **`checkpointing`** (objeto):
  - **Descrição:** Configura o recurso de checkpointing, que permite salvar e restaurar estados de conversação e arquivos. Veja a [documentação de Checkpointing](../checkpointing.md) para mais detalhes.
  - **Padrão:** `{"enabled": false}`
  - **Propriedades:**
    - **`enabled`** (booleano): Quando `true`, o comando `/restore` fica disponível.

- **`preferredEditor`** (string):
  - **Descrição:** Especifica o editor preferido para visualizar diffs.
  - **Padrão:** `vscode`
  - **Exemplo:** `"preferredEditor": "vscode"`

- **`telemetry`** (objeto)
  - **Descrição:** Configura o registro e a coleta de métricas para o Qwen Code. Para mais informações, veja [Telemetry](../telemetry.md).
  - **Padrão:** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **Propriedades:**
    - **`enabled`** (booleano): Se a telemetria está habilitada ou não.
    - **`target`** (string): O destino para os dados de telemetria coletados. Valores suportados são `local` e `gcp`.
    - **`otlpEndpoint`** (string): O endpoint para o Exportador OTLP.
    - **`logPrompts`** (booleano): Se o conteúdo dos prompts do usuário deve ser incluído nos logs.
  - **Exemplo:**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```
- **`usageStatisticsEnabled`** (booleano):
  - **Descrição:** Habilita ou desabilita a coleta de estatísticas de uso. Veja [Estatísticas de Uso](#usage-statistics) para mais informações.
  - **Padrão:** `true`
  - **Exemplo:**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`** (booleano):
  - **Descrição:** Habilita ou desabilita dicas úteis na interface da CLI.
  - **Padrão:** `false`
  - **Exemplo:**

    ```json
    "hideTips": true
    ```

- **`hideBanner`** (booleano):
  - **Descrição:** Habilita ou desabilita o banner de inicialização (arte ASCII) na interface da CLI.
  - **Padrão:** `false`
  - **Exemplo:**

    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`** (número):
  - **Descrição:** Define o número máximo de turnos para uma sessão. Se a sessão ultrapassar esse limite, a CLI deixará de processar e iniciará um novo chat.
  - **Padrão:** `-1` (ilimitado)
  - **Exemplo:**
    ```json
    "maxSessionTurns": 10
    ```

- **`summarizeToolOutput`** (objeto):
  - **Descrição:** Habilita ou desabilita o resumo da saída de ferramentas. Você pode especificar o orçamento de tokens para o resumo usando a configuração `tokenBudget`.
  - Nota: Atualmente, apenas a ferramenta `run_shell_command` é suportada.
  - **Padrão:** `{}` (Desabilitado por padrão)
  - **Exemplo:**
    ```json
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 2000
      }
    }
    ```

- **`excludedProjectEnvVars`** (array de strings):
  - **Descrição:** Especifica variáveis de ambiente que

### Exemplo de `settings.json`:

```json
{
  "theme": "GitHub",
  "sandbox": "docker",
  "toolDiscoveryCommand": "bin/get_tools",
  "toolCallCommand": "bin/call_tool",
  "tavilyApiKey": "$TAVILY_API_KEY",
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
  "usageStatisticsEnabled": true,
  "hideTips": false,
  "hideBanner": false,
  "skipNextSpeakerCheck": false,
  "skipLoopDetection": false,
  "maxSessionTurns": 10,
  "summarizeToolOutput": {
    "run_shell_command": {
      "tokenBudget": 100
    }
  },
  "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"],
  "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
  "loadMemoryFromIncludeDirectories": true
}
```

## Histórico do Shell

O CLI mantém um histórico dos comandos shell que você executa. Para evitar conflitos entre projetos diferentes, esse histórico é armazenado em um diretório específico do projeto dentro da pasta home do seu usuário.

- **Localização:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` é um identificador único gerado a partir do caminho raiz do seu projeto.
  - O histórico é armazenado em um arquivo chamado `shell_history`.

## Variáveis de Ambiente e Arquivos `.env`

Variáveis de ambiente são uma forma comum de configurar aplicações, especialmente para informações sensíveis como chaves de API ou configurações que podem variar entre ambientes. Para configurar autenticação, consulte a [documentação de Autenticação](./authentication.md), que aborda todos os métodos disponíveis.

O CLI carrega automaticamente variáveis de ambiente de um arquivo `.env`. A ordem de carregamento é:

1. Arquivo `.env` no diretório atual.
2. Se não encontrado, ele procura nos diretórios pais até encontrar um arquivo `.env` ou alcançar a raiz do projeto (identificada por uma pasta `.git`) ou o diretório home.
3. Se ainda não encontrado, ele procura por `~/.env` (no diretório home do usuário).

**Exclusão de Variáveis de Ambiente:** Algumas variáveis de ambiente (como `DEBUG` e `DEBUG_MODE`) são excluídas automaticamente dos arquivos `.env` do projeto por padrão, para evitar interferência no comportamento do CLI. Variáveis de arquivos `.qwen/.env` nunca são excluídas. Você pode personalizar esse comportamento usando a configuração `excludedProjectEnvVars` no seu arquivo `settings.json`.

- **`OPENAI_API_KEY`**:
  - Um dos vários [métodos de autenticação](./authentication.md) disponíveis.
  - Defina isso no seu perfil do shell (por exemplo, `~/.bashrc`, `~/.zshrc`) ou em um arquivo `.env`.
- **`OPENAI_BASE_URL`**:
  - Um dos vários [métodos de autenticação](./authentication.md) disponíveis.
  - Defina isso no seu perfil do shell (por exemplo, `~/.bashrc`, `~/.zshrc`) ou em um arquivo `.env`.
- **`OPENAI_MODEL`**:
  - Especifica o modelo OPENAI padrão a ser usado.
  - Substitui o valor padrão hardcoded.
  - Exemplo: `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_SANDBOX`**:
  - Alternativa à configuração `sandbox` no `settings.json`.
  - Aceita `true`, `false`, `docker`, `podman` ou uma string de comando personalizada.
- **`SEATBELT_PROFILE`** (específico para macOS):
  - Alterna o perfil do Seatbelt (`sandbox-exec`) no macOS.
  - `permissive-open`: (Padrão) Restringe escritas na pasta do projeto (e algumas outras pastas, veja `packages/cli/src/utils/sandbox-macos-permissive-open.sb`), mas permite outras operações.
  - `strict`: Usa um perfil restrito que nega operações por padrão.
  - `<profile_name>`: Usa um perfil personalizado. Para definir um perfil personalizado, crie um arquivo chamado `sandbox-macos-<profile_name>.sb` no diretório `.qwen/` do seu projeto (ex.: `my-project/.qwen/sandbox-macos-custom.sb`).
- **`DEBUG` ou `DEBUG_MODE`** (geralmente usadas por bibliotecas subjacentes ou pelo próprio CLI):
  - Defina como `true` ou `1` para habilitar logs detalhados de depuração, o que pode ajudar na resolução de problemas.
  - **Nota:** Essas variáveis são excluídas automaticamente dos arquivos `.env` do projeto por padrão, para evitar interferência no comportamento do CLI. Use arquivos `.qwen/.env` se precisar defini-las especificamente para o Qwen Code.
- **`NO_COLOR`**:
  - Defina com qualquer valor para desativar todas as saídas coloridas no CLI.
- **`CLI_TITLE`**:
  - Defina com uma string para personalizar o título do CLI.
- **`CODE_ASSIST_ENDPOINT`**:
  - Especifica o endpoint do servidor de assistência de código.
  - Útil para desenvolvimento e testes.
- **`TAVILY_API_KEY`**:
  - Sua chave de API para o serviço de busca web Tavily.
  - Usada para habilitar a funcionalidade da ferramenta `web_search`.
  - **Nota:** Para usuários Qwen OAuth, o provedor DashScope está disponível automaticamente sem nenhuma configuração. Para outros tipos de autenticação, configure os provedores Tavily ou Google para habilitar a busca web.
  - Exemplo: `export TAVILY_API_KEY="tvly-your-api-key-here"`

## Argumentos de Linha de Comando

Argumentos passados diretamente ao executar o CLI podem substituir outras configurações para aquela sessão específica.

- **`--model <model_name>`** (**`-m <model_name>`**):
  - Especifica o modelo Qwen a ser usado nesta sessão.
  - Exemplo: `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - Usado para passar um prompt diretamente para o comando. Isso invoca o Qwen Code em modo não interativo.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - Inicia uma sessão interativa com o prompt fornecido como entrada inicial.
  - O prompt é processado dentro da sessão interativa, e não antes dela.
  - Não pode ser usado quando há redirecionamento de entrada via stdin.
  - Exemplo: `qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**):
  - Ativa o modo sandbox para esta sessão.
- **`--sandbox-image`**:
  - Define a URI da imagem do sandbox.
- **`--debug`** (**`-d`**):
  - Ativa o modo debug para esta sessão, fornecendo saída mais detalhada.
- **`--all-files`** (**`-a`**):
  - Se definido, inclui recursivamente todos os arquivos no diretório atual como contexto para o prompt.
- **`--help`** (ou **`-h`**):
  - Exibe informações de ajuda sobre os argumentos de linha de comando.
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
  - Uma lista separada por vírgulas com nomes de ferramentas que ignoram o diálogo de confirmação.
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
  - Ativa o log dos prompts para telemetria. Veja [telemetria](../telemetry.md) para mais informações.
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
  - Ativa o modo leitor de tela para acessibilidade.
- **`--version`**:
  - Exibe a versão do CLI.
- **`--openai-logging`**:
  - Ativa o log das chamadas à API da OpenAI para depuração e análise. Esta flag sobrescreve a configuração `enableOpenAILogging` no arquivo `settings.json`.
- **`--openai-logging-dir <directory>`**:
  - Define um caminho personalizado para os logs da API da OpenAI. Esta flag sobrescreve a configuração `openAILoggingDir` no arquivo `settings.json`. Suporta caminhos absolutos, relativos e expansão do `~`.
  - **Exemplo:** `qwen --openai-logging-dir "~/qwen-logs" --openai-logging`
- **`--tavily-api-key <api_key>`**:
  - Define a chave da API Tavily para funcionalidade de busca na web nesta sessão.
  - Exemplo: `qwen --tavily-api-key tvly-your-api-key-here`

## Arquivos de Contexto (Contexto Instrucional Hierárquico)

Embora não sejam estritamente uma configuração para o _comportamento_ da CLI, os arquivos de contexto (por padrão `QWEN.md`, mas configuráveis via a opção `contextFileName`) são essenciais para definir o _contexto instrucional_ (também chamado de "memória"). Este recurso poderoso permite que você forneça instruções específicas do projeto, guias de estilo de código ou qualquer informação relevante ao AI, tornando suas respostas mais adaptadas e precisas às suas necessidades. A CLI inclui elementos de interface, como um indicador no rodapé mostrando o número de arquivos de contexto carregados, para manter você informado sobre o contexto ativo.

- **Propósito:** Esses arquivos Markdown contêm instruções, diretrizes ou contexto que você deseja que o modelo Qwen leve em consideração durante as interações. O sistema é projetado para gerenciar esse contexto instrucional de forma hierárquica.

### Exemplo de Conteúdo do Arquivo de Contexto (ex.: `QWEN.md`)

Aqui está um exemplo conceitual do que um arquivo de contexto na raiz de um projeto TypeScript pode conter:

```markdown

# Projeto: Minha Incrível Biblioteca em TypeScript

## Instruções Gerais:

- Ao gerar novo código em TypeScript, siga o estilo de codificação já existente.
- Certifique-se de que todas as novas funções e classes tenham comentários em JSDoc.
- Prefira paradigmas de programação funcional quando apropriado.
- Todo o código deve ser compatível com TypeScript 5.0 e Node.js 20+.

## Estilo de Codificação:

- Use 2 espaços para indentação.
- Nomes de interfaces devem ser prefixados com `I` (ex.: `IUserService`).
- Membros privados de classes devem ser prefixados com um underscore (`_`).
- Sempre use igualdade estrita (`===` e `!==`).

## Componente Específico: `src/api/client.ts`

- Este arquivo lida com todas as requisições de API de saída.
- Ao adicionar novas funções de chamada à API, certifique-se de incluir tratamento robusto de erros e logging.
- Use o utilitário `fetchWithRetry` existente para todas as requisições GET.
```

## Sobre Dependências:

- Evite introduzir novas dependências externas, a menos que seja absolutamente necessário.
- Se uma nova dependência for necessária, por favor, informe o motivo.
```

Este exemplo demonstra como você pode fornecer contexto geral do projeto, convenções específicas de codificação e até mesmo observações sobre arquivos ou componentes particulares. Quanto mais relevantes e precisos forem seus arquivos de contexto, melhor a IA poderá te ajudar. Arquivos de contexto específicos do projeto são altamente recomendados para estabelecer convenções e contexto.

- **Carregamento Hierárquico e Precedência:** O CLI implementa um sistema hierárquico sofisticado de memória carregando arquivos de contexto (por exemplo, `QWEN.md`) de diversos locais. Conteúdo de arquivos mais abaixo nesta lista (mais específicos) normalmente substitui ou complementa conteúdo de arquivos mais acima (mais gerais). A ordem exata de concatenação e o contexto final podem ser inspecionados usando o comando `/memory show`. A ordem típica de carregamento é:
  1.  **Arquivo de Contexto Global:**
      - Localização: `~/.qwen/<contextFileName>` (ex.: `~/.qwen/QWEN.md` no diretório home do usuário).
      - Escopo: Fornece instruções padrão para todos os seus projetos.
  2.  **Arquivos de Contexto na Raiz do Projeto e Diretórios Superiores:**
      - Localização: O CLI procura pelo arquivo de contexto configurado no diretório atual e depois em cada diretório pai até encontrar a raiz do projeto (identificada pela pasta `.git`) ou seu diretório home.
      - Escopo: Fornece contexto relevante para todo o projeto ou uma parte significativa dele.
  3.  **Arquivos de Contexto em Subdiretórios (Contextual/Local):**
      - Localização: O CLI também verifica a presença do arquivo de contexto configurado em subdiretórios _abaixo_ do diretório atual de trabalho (respeitando padrões comuns de exclusão como `node_modules`, `.git`, etc.). Por padrão, a profundidade dessa busca é limitada a 200 diretórios, mas pode ser ajustada com o campo `memoryDiscoveryMaxDirs` no seu arquivo `settings.json`.
      - Escopo: Permite instruções altamente específicas relevantes para um componente, módulo ou seção específica do seu projeto.
- **Concatenação & Indicação na Interface:** O conteúdo de todos os arquivos de contexto encontrados é concatenado (com separadores indicando sua origem e caminho) e fornecido como parte do prompt do sistema. O rodapé do CLI mostra a quantidade de arquivos de contexto carregados, oferecendo uma indicação visual rápida sobre o contexto instrucional ativo.
- **Importação de Conteúdo:** Você pode modularizar seus arquivos de contexto importando outros arquivos Markdown usando a sintaxe `@path/to/file.md`. Para mais detalhes, consulte a [documentação do Processador de Importação de Memória](../core/memport.md).
- **Comandos para Gerenciamento de Memória:**
  - Use `/memory refresh` para forçar uma nova varredura e recarregar todos os arquivos de contexto de todos os locais configurados. Isso atualiza o contexto instrucional da IA.
  - Use `/memory show` para exibir o contexto instrucional combinado atualmente carregado, permitindo verificar a hierarquia e o conteúdo usado pela IA.
  - Veja a [documentação dos Comandos](./commands.md#memory) para detalhes completos sobre o comando `/memory` e seus subcomandos (`show` e `refresh`).

Ao entender e utilizar essas camadas de configuração e a natureza hierárquica dos arquivos de contexto, você pode gerenciar efetivamente a memória da IA e adaptar as respostas do Qwen Code às suas necessidades e projetos específicos.

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

- **Chamadas de Ferramentas:** Registramos os nomes das ferramentas chamadas, se elas tiveram sucesso ou falharam e quanto tempo levaram para serem executadas. Não coletamos os argumentos passados para as ferramentas nem nenhum dado retornado por elas.
- **Requisições à API:** Registramos o modelo utilizado em cada requisição, a duração da requisição e se ela foi bem-sucedida. Não coletamos o conteúdo dos prompts ou das respostas.
- **Informações da Sessão:** Coletamos informações sobre a configuração do CLI, como as ferramentas habilitadas e o modo de aprovação.

**O que NÃO coletamos:**

- **Informações Pessoalmente Identificáveis (PII):** Não coletamos nenhuma informação pessoal, como seu nome, endereço de e-mail ou chaves de API.
- **Conteúdo de Prompts e Respostas:** Não registramos o conteúdo dos seus prompts ou das respostas do modelo.
- **Conteúdo de Arquivos:** Não registramos o conteúdo de nenhum arquivo lido ou escrito pelo CLI.

**Como desativar:**

Você pode desativar a coleta de estatísticas de uso a qualquer momento definindo a propriedade `usageStatisticsEnabled` como `false` no seu arquivo `settings.json`:

```json
{
  "usageStatisticsEnabled": false
}
```

Nota: Quando as estatísticas de uso estão ativadas, eventos são enviados para um endpoint de coleta RUM da Alibaba Cloud.

- **`enableWelcomeBack`** (booleano):
  - **Descrição:** Mostra uma caixa de diálogo de boas-vindas ao retornar a um projeto com histórico de conversa.
  - **Padrão:** `true`
  - **Categoria:** Interface do usuário
  - **Requer reinicialização:** Não
  - **Exemplo:** `"enableWelcomeBack": false`
  - **Detalhes:** Quando ativado, o Qwen Code detectará automaticamente se você está retornando a um projeto com um resumo gerado anteriormente (`/.qwen/PROJECT_SUMMARY.md`) e mostrará uma caixa de diálogo permitindo que você continue sua conversa anterior ou comece do zero. Este recurso se integra ao comando `/chat summary` e à caixa de confirmação de saída. Veja a [documentação do Welcome Back](./welcome-back.md) para mais detalhes.