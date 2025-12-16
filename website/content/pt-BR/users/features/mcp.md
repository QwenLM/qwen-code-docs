# Conectar o Qwen Code a ferramentas via MCP

O Qwen Code pode se conectar a ferramentas e fontes de dados externas por meio do [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Servidores MCP fornecem ao Qwen Code acesso às suas ferramentas, bancos de dados e APIs.

## O que você pode fazer com o MCP

Com servidores MCP conectados, você pode pedir ao Qwen Code para:

- Trabalhar com arquivos e repositórios (ler/pesquisar/escrever, dependendo das ferramentas habilitadas)
- Consultar bancos de dados (inspeção de esquema, consultas, relatórios)
- Integrar serviços internos (envolver suas APIs como ferramentas MCP)
- Automatizar fluxos de trabalho (tarefas repetíveis expostas como ferramentas/prompts)

> [!tip]
> Se você estiver procurando o "comando único para começar", vá para [Início rápido](#início-rápido).

## Início rápido

O Qwen Code carrega os servidores MCP a partir da chave `mcpServers` no seu arquivo `settings.json`. Você pode configurar os servidores de duas maneiras:

- Editando diretamente o arquivo `settings.json`
- Usando comandos `qwen mcp` (veja [Referência da CLI](#referência-da-cli-qwen-mcp))

### Adicione seu primeiro servidor

1. Adicione um servidor (exemplo: servidor remoto HTTP MCP):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Verifique se ele aparece:

```bash
qwen mcp list
```

3. Reinicie o Qwen Code no mesmo projeto (ou inicie-o caso ainda não esteja em execução) e então peça ao modelo para usar ferramentas desse servidor.

## Onde a configuração é armazenada (escopos)

A maioria dos usuários precisa apenas desses dois escopos:

- **Escopo do projeto (padrão)**: `.qwen/settings.json` na raiz do seu projeto
- **Escopo do usuário**: `~/.qwen/settings.json` em todos os projetos da sua máquina

Escrever no escopo do usuário:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
> Para camadas avançadas de configuração (padrões do sistema/configurações do sistema e regras de precedência), consulte [Configurações](../users/configuration/settings).

## Configurar servidores

### Escolha um transporte

| Transporte | Quando usar                                                       | Campo(s) JSON                              |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `http`     | Recomendado para serviços remotos; funciona bem para servidores MCP na nuvem | `httpUrl` (+ `headers` opcional)            |
| `sse`      | Servidores legados/obsoletos que suportam apenas Server-Sent Events    | `url` (+ `headers` opcional)                |
| `stdio`    | Processo local (scripts, CLIs, Docker) na sua máquina              | `command`, `args` (+ `cwd`, `env` opcionais) |

> [!note]
> Se um servidor suportar ambos, prefira **HTTP** em vez de **SSE**.

### Configurar via `settings.json` vs `qwen mcp add`

Ambas as abordagens produzem as mesmas entradas `mcpServers` no seu `settings.json`—use a que você preferir.

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

CLI (grava no escopo do projeto por padrão):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### Servidor HTTP (HTTP streamable remoto)

JSON:

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token"
      },
      "timeout": 5000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer your-api-token" --timeout 5000
```

#### Servidor SSE (Server-Sent Events remoto)

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

### Confiança (ignorar confirmações)

- **Confiança no servidor** (`trust: true`): ignora os prompts de confirmação para aquele servidor (use com moderação).

### Filtragem de ferramentas (permitir/bloquear ferramentas por servidor)

Use `includeTools` / `excludeTools` para restringir as ferramentas expostas por um servidor (da perspectiva do Qwen Code).

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

### Listas globais de permissão/bloqueio

O objeto `mcp` no seu `settings.json` define regras globais para todos os servidores MCP:

- `mcp.allowed`: lista de permissões de nomes de servidores MCP (chaves em `mcpServers`)
- `mcp.excluded`: lista de bloqueios de nomes de servidores MCP

Exemplo:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## Solução de Problemas

- **Servidor mostra “Disconnected” em `qwen mcp list`**: verifique se a URL/comando está correta e, em seguida, aumente o `timeout`.
- **Servidor Stdio falha ao iniciar**: utilize um caminho absoluto para `command` e verifique novamente `cwd`/`env`.
- **Variáveis de ambiente no JSON não são resolvidas**: certifique-se de que elas existem no ambiente onde o Qwen Code é executado (ambientes de shell versus aplicativo GUI podem ser diferentes).

## Referência

### Estrutura do `settings.json`

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

Obrigatório (uma das seguintes):

| Propriedade | Descrição                                               |
| ----------- | ------------------------------------------------------- |
| `command`   | Caminho para o executável no transporte Stdio           |
| `url`       | URL do endpoint SSE (ex.: `"http://localhost:8080/sse"`)|
| `httpUrl`   | URL do endpoint de streaming HTTP                       |

Opcional:

| Propriedade            | Tipo/Padrão                  | Descrição                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Argumentos de linha de comando para o transporte Stdio                                                                                                                                                                                                                |
| `headers`              | object                       | Cabeçalhos HTTP personalizados ao usar `url` ou `httpUrl`                                                                                                                                                                                                             |
| `env`                  | object                       | Variáveis de ambiente para o processo do servidor. Valores podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                                                      |
| `cwd`                  | string                       | Diretório de trabalho para o transporte Stdio                                                                                                                                                                                                                         |
| `timeout`              | número<br>(padrão: 600.000)  | Tempo limite da requisição em milissegundos (padrão: 600.000 ms = 10 minutos)                                                                                                                                                                                         |
| `trust`                | booleano<br>(padrão: false)  | Quando `true`, ignora todas as confirmações de chamada de ferramenta para este servidor (padrão: `false`)                                                                                                                                                              |
| `includeTools`         | array                        | Lista de nomes de ferramentas a incluir deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis deste servidor (comportamento de lista de permissões). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão. |
| `excludeTools`         | array                        | Lista de nomes de ferramentas a excluir deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor.<br>Nota: `excludeTools` tem precedência sobre `includeTools` — se uma ferramenta estiver nas duas listas, ela será excluída. |
| `targetAudience`       | string                       | O ID do cliente OAuth permitido no aplicativo protegido por IAP ao qual você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                                   |
| `targetServiceAccount` | string                       | O endereço de e-mail da Conta de Serviço do Google Cloud a ser personificada. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                                                        |

<a id="qwen-mcp-cli"></a>

### Gerenciar servidores MCP com `qwen mcp`

Você sempre pode configurar servidores MCP editando manualmente o arquivo `settings.json`, mas a CLI geralmente é mais rápida.

#### Adicionando um servidor (`qwen mcp add`)

```bash
qwen mcp add [opções] <nome> <comandoOuUrl> [argumentos...]
```

| Argumento/Opção     | Descrição                                                           | Padrão             | Exemplo                                   |
| ------------------- | ------------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| `<nome>`            | Um nome único para o servidor.                                      | —                  | `example-server`                          |
| `<comandoOuUrl>`    | O comando a ser executado (para `stdio`) ou a URL (para `http`/`sse`). | —                  | `/usr/bin/python` ou `http://localhost:8` |
| `[argumentos...]`   | Argumentos opcionais para um comando `stdio`.                        | —                  | `--port 5000`                             |
| `-s`, `--scope`     | Escopo da configuração (usuário ou projeto).                         | `project`          | `-s user`                                 |
| `-t`, `--transport` | Tipo de transporte (`stdio`, `sse`, `http`).                         | `stdio`            | `-t sse`                                  |
| `-e`, `--env`       | Define variáveis de ambiente.                                       | —                  | `-e KEY=value`                            |
| `-H`, `--header`    | Define cabeçalhos HTTP para transportes SSE e HTTP.                  | —                  | `-H "X-Api-Key: abc123"`                  |
| `--timeout`         | Define o tempo limite de conexão em milissegundos.                   | —                  | `--timeout 30000`                         |
| `--trust`           | Confiar no servidor (ignora todos os prompts de confirmação de chamada de ferramenta). | — (`false`)        | `--trust`                                 |
| `--description`     | Define a descrição do servidor.                                     | —                  | `--description "Ferramentas locais"`       |
| `--include-tools`   | Uma lista separada por vírgulas das ferramentas a incluir.           | todas as ferramentas incluídas | `--include-tools mytool,othertool`        |
| `--exclude-tools`   | Uma lista separada por vírgulas das ferramentas a excluir.           | nenhuma            | `--exclude-tools mytool`                  |

#### Listando servidores (`qwen mcp list`)

```bash
qwen mcp list
```

#### Removendo um servidor (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```