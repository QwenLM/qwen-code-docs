# Conecte o Qwen Code a ferramentas via MCP

O Qwen Code pode se conectar a ferramentas externas e fontes de dados por meio do [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Servidores MCP concedem ao Qwen Code acesso às suas ferramentas, bancos de dados e APIs.

## O que você pode fazer com o MCP

Com servidores MCP conectados, você pode solicitar ao Qwen Code que:

- Trabalhe com arquivos e repositórios (leitura/pesquisa/gravação, dependendo das ferramentas habilitadas)
- Consulte bancos de dados (inspeção de esquema, consultas, relatórios)
- Integre serviços internos (envolva suas APIs como ferramentas MCP)
- Automatize fluxos de trabalho (tarefas repetíveis expostas como ferramentas/prompt)

> [!tip]
>
> Se você está procurando o “comando único para começar”, vá direto para [Início rápido](#início-rápido).

## Início rápido

O Qwen Code carrega servidores MCP a partir da configuração `mcpServers` no seu arquivo `settings.json`. Você pode configurar os servidores de duas maneiras:

- Editando diretamente o arquivo `settings.json`
- Usando os comandos `qwen mcp` (consulte a [referência da CLI](#referência-da-cli-qwen-mcp))

### Adicione seu primeiro servidor

1. Adicione um servidor (exemplo: servidor remoto MCP HTTP):

```bash
qwen mcp add --transport http meu-servidor http://localhost:3000/mcp
```

2. Abra o diálogo de gerenciamento do MCP para visualizar e gerenciar servidores:

```bash
qwen mcp
```

3. Reinicie o Qwen Code no mesmo projeto (ou inicie-o, caso ainda não esteja em execução), depois peça ao modelo para usar ferramentas desse servidor.

## Onde a configuração é armazenada (escopos)

A maioria dos usuários precisa apenas desses dois escopos:

- **Escopo do projeto (padrão)**: `.qwen/settings.json` na raiz do seu projeto  
- **Escopo do usuário**: `~/.qwen/settings.json` em todos os projetos da sua máquina

Gravar no escopo do usuário:

```bash
qwen mcp add --scope user --transport http meu-servidor http://localhost:3000/mcp
```

> [!tip]
>
> Para camadas avançadas de configuração (valores padrão do sistema/configurações do sistema e regras de precedência), consulte [Configurações](../configuration/settings).

## Configurar servidores

### Escolha um transporte

| Transporte | Quando usar                                                                 | Campo(s) JSON                                   |
| ------------ | --------------------------------------------------------------------------- | ----------------------------------------------- |
| `http`       | Recomendado para serviços remotos; funciona bem com servidores MCP em nuvem | `httpUrl` (+ opcional `headers`)                |
| `sse`        | Servidores legados/depreciados que suportam apenas Server-Sent Events       | `url` (+ opcional `headers`)                    |
| `stdio`      | Processo local (scripts, CLIs, Docker) na sua máquina                       | `command`, `args` (+ opcional `cwd`, `env`)     |

> [!note]
>
> Se um servidor suportar ambos, prefira **HTTP** em vez de **SSE**.

### Configurar via `settings.json` ou `qwen mcp add`

Ambas as abordagens geram as mesmas entradas `mcpServers` no seu arquivo `settings.json` — use a que preferir.

#### Servidor Stdio (processo local)

JSON (`.qwen/settings.json`):

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server", "--port", "8080"],
      "cwd": "./mcp-servers/python",
      "env": {
        "DATABASE_URL": "$DB_CONNECTION_STRING",
        "API_KEY": "${EXTERNAL_API_KEY}"
      },
      "timeout": 15000
    }
  }
}
```

CLI (escreve no escopo do projeto por padrão):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### Servidor HTTP (HTTP transmitido remotamente)

JSON:

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer seu-token-de-api"
      },
      "timeout": 5000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer seu-token-de-api" --timeout 5000
```

#### Servidor SSE (Eventos enviados pelo servidor remoto)

JSON:

```json
{
  "mcpServers": {
    "sseServer": {
      "url": "http://localhost:8080/sse",
      "timeout": 30000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## Segurança e controle

### Confiança (pular confirmações)

- **Confiança no servidor** (`trust: true`): ignora os prompts de confirmação para esse servidor (use com moderação).

### Filtragem de ferramentas (permitir/negar ferramentas por servidor)

Use `includeTools` / `excludeTools` para restringir as ferramentas expostas por um servidor (do ponto de vista do Qwen Code).

Exemplo: incluir apenas algumas ferramentas:

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      "timeout": 30000
    }
  }
}
```

### Listas globais de permissão/negação

O objeto `mcp` no seu arquivo `settings.json` define regras globais para todos os servidores MCP:

- `mcp.allowed`: lista de permissões com os nomes dos servidores MCP (chaves em `mcpServers`)
- `mcp.excluded`: lista de negações com os nomes dos servidores MCP

Exemplo:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## Solução de problemas

- **O servidor aparece como “Desconectado” em `qwen mcp list`**: verifique se a URL ou o comando estão corretos e, em seguida, aumente o valor de `timeout`.
- **O servidor stdio não inicia**: use um caminho absoluto para `command` e verifique novamente `cwd` e `env`.
- **Variáveis de ambiente em JSON não são resolvidas**: certifique-se de que elas existam no ambiente onde o Qwen Code está sendo executado (ambientes de shell e de aplicativos gráficos podem diferir).

## Referência

### Estrutura de `settings.json`

#### Configuração específica do servidor (`mcpServers`)

Adicione um objeto `mcpServers` ao seu arquivo `settings.json`:

```json
// ... o arquivo contém outros objetos de configuração
{
  "mcpServers": {
    "serverName": {
      "command": "caminho/para/o/servidor",
      "args": ["--arg1", "valor1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./diretorio-do-servidor",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Propriedades de configuração:

Obrigatórias (uma das seguintes):

| Propriedade | Descrição                                                                 |
| ----------- | ------------------------------------------------------------------------- |
| `command`   | Caminho para o executável usado na comunicação via Stdio                  |
| `url`       | URL do endpoint SSE (ex.: `"http://localhost:8080/sse"`)                 |
| `httpUrl`   | URL do endpoint HTTP com suporte a streaming                              |

Opcionais:

| Propriedade               | Tipo/Padrão                   | Descrição                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                    | array                         | Argumentos de linha de comando para a comunicação via Stdio                                                                                                                                                                                                     |
| `headers`                 | objeto                        | Cabeçalhos HTTP personalizados ao usar `url` ou `httpUrl`                                                                                                                                                                                                       |
| `env`                     | objeto                        | Variáveis de ambiente para o processo do servidor. Os valores podem fazer referência a variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                                        |
| `cwd`                     | string                        | Diretório de trabalho para a comunicação via Stdio                                                                                                                                                                                                                |
| `timeout`                 | número<br>(padrão: 600.000)   | Tempo limite da requisição em milissegundos (padrão: 600.000 ms = 10 minutos)                                                                                                                                                                                  |
| `trust`                   | booleano<br>(padrão: falso)   | Quando `true`, ignora todas as confirmações de chamadas de ferramentas para este servidor (padrão: `false`)                                                                                                                                                      |
| `includeTools`            | array                         | Lista de nomes de ferramentas a serem incluídas deste servidor MCP. Quando especificada, apenas as ferramentas listadas aqui estarão disponíveis a partir deste servidor (comportamento de lista de permissões). Se não for especificada, todas as ferramentas do servidor são habilitadas por padrão. |
| `excludeTools`            | array                         | Lista de nomes de ferramentas a serem excluídas deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor.<br>Observação: `excludeTools` tem precedência sobre `includeTools` — se uma ferramenta estiver em ambas as listas, ela será excluída. |
| `targetAudience`          | string                        | O Client ID do OAuth autorizado na aplicação protegida pelo IAP à qual você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                             |
| `targetServiceAccount`    | string                        | O endereço de e-mail da Conta de Serviço do Google Cloud a ser representada. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                                                    |

<a id="qwen-mcp-cli"></a>

### Gerenciar servidores MCP com `qwen mcp`

Você sempre pode configurar servidores MCP editando manualmente o arquivo `settings.json`, mas a CLI geralmente é mais rápida.

#### Adicionando um servidor (`qwen mcp add`)

```bash
qwen mcp add [opções] <nome> <comandoOuUrl> [argumentos...]
```

| Argumento/Opção     | Descrição                                                                 | Padrão             | Exemplo                                   |
| ------------------- | ------------------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| `<nome>`            | Um nome exclusivo para o servidor.                                       | —                  | `exemplo-servidor`                        |
| `<comandoOuUrl>`    | O comando a ser executado (para `stdio`) ou a URL (para `http`/`sse`).    | —                  | `/usr/bin/python` ou `http://localhost:8` |
| `[argumentos...]`   | Argumentos opcionais para um comando `stdio`.                             | —                  | `--porta 5000`                            |
| `-s`, `--scope`     | Escopo de configuração (usuário ou projeto).                              | `projeto`          | `-s usuario`                              |
| `-t`, `--transport` | Tipo de transporte (`stdio`, `sse`, `http`).                             | `stdio`            | `-t sse`                                  |
| `-e`, `--env`       | Define variáveis de ambiente.                                             | —                  | `-e CHAVE=valor`                          |
| `-H`, `--header`    | Define cabeçalhos HTTP para os transportes SSE e HTTP.                    | —                  | `-H "X-Api-Key: abc123"`                  |
| `--timeout`         | Define o tempo limite de conexão em milissegundos.                        | —                  | `--timeout 30000`                         |
| `--trust`           | Confia no servidor (ignora todos os avisos de confirmação de chamadas de ferramentas). | — (`falso`)        | `--trust`                                 |
| `--description`     | Define a descrição para o servidor.                                       | —                  | `--description "Ferramentas locais"`      |
| `--include-tools`   | Uma lista separada por vírgulas de ferramentas a incluir.                | todas as ferramentas incluídas | `--include-tools minhaferramenta,outraferramenta` |
| `--exclude-tools`   | Uma lista separada por vírgulas de ferramentas a excluir.                 | nenhuma            | `--exclude-tools minhaferramenta`         |

#### Removendo um servidor (`qwen mcp remove`)

```bash
qwen mcp remove <nome>
```