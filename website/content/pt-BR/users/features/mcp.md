# Conecte o Qwen Code a ferramentas via MCP

O Qwen Code pode se conectar a ferramentas e fontes de dados externas através do [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Os servidores MCP dão ao Qwen Code acesso às suas ferramentas, bancos de dados e APIs.

## O que você pode fazer com o MCP

Com os servidores MCP conectados, você pode pedir ao Qwen Code para:

- Trabalhar com arquivos e repositórios (ler/pesquisar/escrever, dependendo das ferramentas que você habilitar)
- Consultar bancos de dados (inspeção de schema, queries, relatórios)
- Integrar serviços internos (encapsular suas APIs como ferramentas MCP)
- Automatizar fluxos de trabalho (tarefas repetitivas expostas como ferramentas/prompts)

> [!tip]
>
> Se você está procurando o "comando único para começar", pule para [Início rápido](#quick-start).

## Início rápido

O Qwen Code carrega os servidores MCP a partir de `mcpServers` no seu `settings.json`. Você pode configurar os servidores de duas formas:

- Editando o `settings.json` diretamente
- Usando os comandos `qwen mcp` (veja a [referência da CLI](#manage-mcp-servers-with-qwen-mcp))

### Adicione seu primeiro servidor

1. Adicione um servidor (exemplo: servidor MCP HTTP remoto):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Inicie o Qwen Code e abra a caixa de diálogo de gerenciamento do MCP para visualizar e gerenciar
   os servidores:

```bash
qwen
```

Em seguida, digite:

```text
/mcp
```

3. Se o Qwen Code já estava em execução antes de você adicionar o servidor, reinicie-o no
   mesmo projeto. Em seguida, peça ao modelo para usar as ferramentas desse servidor.

## Onde a configuração é armazenada (escopos)

A maioria dos usuários precisa apenas destes dois escopos:

- **Escopo de usuário (padrão)**: `~/.qwen/settings.json` em todos os projetos na sua máquina
- **Escopo de projeto**: `.qwen/settings.json` na raiz do seu projeto

Gravar no escopo de usuário:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Para camadas de configuração avançadas (padrões do sistema/configurações do sistema e regras de precedência), veja [Settings](../configuration/settings).

## Configurar servidores

### Escolha um transporte

| Transporte | Quando usar                                                       | Campo(s) JSON                               |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | Recomendado para serviços remotos; funciona bem para servidores MCP em nuvem | `httpUrl` (+ `headers` opcional)            |
| `sse`     | Servidores legados/depreciados que suportam apenas Server-Sent Events    | `url` (+ `headers` opcional)                |
| `stdio`   | Processo local (scripts, CLIs, Docker) na sua máquina             | `command`, `args` (+ `cwd`, `env` opcionais) |

> [!note]
>
> Se um servidor suportar ambos, prefira **HTTP** em vez de **SSE**.

### Configurar via `settings.json` vs `qwen mcp add`

Ambas as abordagens produzem as mesmas entradas `mcpServers` no seu `settings.json` — use a que preferir.

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

CLI (grava no escopo de usuário por padrão):

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

## Usando prompts e recursos do MCP

Além de ferramentas, o Qwen Code descobre e expõe outras duas primitivas do MCP.

### Prompts (comandos de barra)

Qualquer prompt que um servidor anuncie via `prompts/list` se torna um **comando de barra** executável. Após a descoberta, digite `/` e você verá o prompt
listado (rotulado como `MCP: <server>`); execute-o como qualquer outro comando:

```text
/my_prompt --arg1="value" --arg2="value"
# positional form also works:
/my_prompt "value" "value"
# show the prompt's arguments:
/my_prompt help
```

As mensagens do prompt são enviadas ao modelo, que então age sobre elas.

> A descoberta é flexível em relação à capacidade `prompts` declarada: alguns
> servidores implementam `prompts/list` mas omitem `prompts` de suas
> capacidades de `initialize`. O Qwen Code tenta `prompts/list` mesmo assim, então
> esses prompts ainda aparecem. Um servidor que genuinamente não tem prompts simplesmente
> responde `Method not found`, o que é ignorado.

### Recursos

Os recursos que um servidor anuncia via `resources/list` são descobertos por
servidor. Abra a caixa de diálogo de gerenciamento com `/mcp` e selecione um servidor para ver
sua contagem de **Resources** ao lado de suas ferramentas e prompts. Escolha **View
resources** para navegar pelos URIs de recursos do servidor; selecionar um mostra sua
descrição e tipo MIME junto com a referência exata `@server:uri` para
colar em uma mensagem. Assim como nos prompts, a capacidade `resources` não
precisa ser declarada.

Injete o conteúdo de um recurso na sua mensagem com a sintaxe `@server:uri`
— digite `@`, depois o nome do servidor, dois pontos e o URI do recurso:

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

Digitar `@myserver:` mostra uma lista de autocompletar com os recursos desse servidor;
continue digitando para filtrar, correspondendo (sem diferenciar maiúsculas de minúsculas) ao URI do recurso
ou ao seu nome/título amigável. Você não precisa saber um URI de cor — antes
de chegar aos dois pontos, digitar parte do nome de um servidor também sugere
servidores correspondentes que expõem recursos, para que você possa escolher um e ir direto para
sua lista de recursos. Ao enviar, o recurso referenciado é lido e seu conteúdo é
anexado à sua mensagem (texto inline, blobs binários como anexos); a
referência `@server:uri` é preservada no prompt para que o modelo saiba o que
está olhando. O prefixo `server` deve corresponder a um servidor MCP configurado —
caso contrário, o token é tratado como um caminho de arquivo normal, então as
referências `@path/to/file` existentes não são afetadas. A leitura de recursos é desativada em
pastas não confiáveis.

## Disponibilidade progressiva e timeouts de descoberta

O Qwen Code descobre os servidores MCP em segundo plano depois que a UI já está
interativa. Você vê o primeiro prompt da CLI em algumas centenas de
milissegundos, mesmo que um dos seus servidores MCP leve vários segundos
(ou nunca responda), e a lista de ferramentas do modelo é atualizada em cerca de
um frame (~16 ms) após cada servidor completar seu handshake de descoberta.

- **Modo interativo**: a UI aparece imediatamente; um indicador de status do MCP no
  canto inferior direito mostra `N/M MCP servers ready` enquanto a descoberta está
  em andamento. Enviar um prompt antes do MCP terminar significa simplesmente que o modelo
  vê as ferramentas que estão prontas _naquele momento_; prompts subsequentes veem
  mais ferramentas à medida que os servidores ficam online.
- **Modo não interativo** (`--prompt`, stream-json, ACP): a CLI ainda
  aguarda a descoberta do MCP estabilizar antes de enviar o primeiro prompt, então
  invocações via script / pipe veem o mesmo conjunto completo de ferramentas que
  o comportamento síncrono legado produzia.

### `discoveryTimeoutMs` por servidor

Cada servidor MCP recebe um timeout apenas para descoberta que limita o tempo que o
handshake inicial (`connect` + `tools/list` + `prompts/list` +
`resources/list`) pode levar. Padrões:

- **servidores stdio**: 30 s
- **servidores HTTP / SSE remotos**: 5 s (o risco de rede é maior)

Substitua por servidor quando necessário:

```jsonc
{
  "mcpServers": {
    "slow-stdio": {
      "command": "node",
      "args": ["./slow-server.js"],
      "discoveryTimeoutMs": 60000,
    },
    "flaky-remote": {
      "httpUrl": "https://example.com/mcp",
      "discoveryTimeoutMs": 10000,
    },
  },
}
```

O campo `timeout` existente é o timeout de **chamada de ferramenta** (usado para cada
requisição `tools/call`, padrão de 10 minutos) e não é afetado por
`discoveryTimeoutMs` — uma invocação de ferramenta de longa duração não é uma
patologia de inicialização.

### Revertendo o MCP progressivo

Se você precisar do comportamento síncrono antigo (a CLI espera por todos os servidores MCP
antes de mostrar qualquer UI), defina `QWEN_CODE_LEGACY_MCP_BLOCKING=1` no seu
ambiente. Isso é mantido como uma saída de emergência por pelo menos um release.

## Segurança e controle

### Confiança (pular confirmações)

- **Confiança do servidor** (`trust: true`): ignora os prompts de confirmação para esse servidor (use com moderação).

### Autenticação OAuth

O Qwen Code suporta autenticação OAuth 2.0 para servidores MCP. Isso é útil ao acessar servidores remotos que requerem autenticação.

#### Uso básico

Quando você adiciona um servidor MCP com credenciais OAuth, o Qwen Code lidará automaticamente com o fluxo de autenticação:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Importante: Configuração do Redirect URI

O fluxo OAuth requer um redirect URI para onde o provedor de autorização envia o código de autenticação.

- **Desenvolvimento local**: Por padrão, o Qwen Code usa `http://localhost:7777/oauth/callback`. Isso funciona ao executar o Qwen Code na sua máquina local com um navegador local.

- **Deployments remotos/em nuvem**: Ao executar o Qwen Code em servidores remotos, IDEs em nuvem ou terminais web, o redirect `localhost` padrão NÃO funcionará. Você DEVE configurar `--oauth-redirect-uri` para apontar para uma URL publicamente acessível que possa receber o callback do OAuth.

Exemplo para servidores remotos:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### Configuração manual via settings.json

Você também pode configurar o OAuth editando o `settings.json` diretamente:

```json
{
  "mcpServers": {
    "oauthServer": {
      "url": "https://api.example.com/sse/",
      "oauth": {
        "enabled": true,
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authorizationUrl": "https://provider.example.com/authorize",
        "tokenUrl": "https://provider.example.com/token",
        "redirectUri": "https://your-server.com/oauth/callback",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

Propriedades de configuração do OAuth:

| Propriedade           | Descrição                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | Habilita o OAuth para este servidor (booleano)                                                                                |
| `clientId`         | Identificador do cliente OAuth (string, opcional com registro dinâmico)                                                  |
| `clientSecret`     | Segredo do cliente OAuth (string, opcional para clientes públicos)                                                             |
| `authorizationUrl` | Endpoint de autorização OAuth (string, auto-descoberto se omitido)                                                     |
| `tokenUrl`         | Endpoint de token OAuth (string, auto-descoberto se omitido)                                                             |
| `scopes`           | Escopos OAuth obrigatórios (array de strings)                                                                              |
| `redirectUri`      | Redirect URI personalizado (string). **Crítico para deployments remotos**. O padrão é `http://localhost:7777/oauth/callback` |
| `tokenParamName`   | Nome do parâmetro de query para tokens em URLs SSE (string)                                                                  |
| `audiences`        | Audiências para as quais o token é válido (array de strings)                                                                   |

#### Gerenciamento de tokens

Os tokens OAuth são automaticamente:

- **Armazenados** em `~/.qwen/mcp-oauth-tokens.json` (texto simples, modo 0600) por padrão. Se `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` estiver definido, o Qwen Code usa armazenamento com suporte de keychain quando disponível, ou `~/.qwen/mcp-oauth-tokens-v2.json` com criptografia AES-256-GCM.
- **Atualizados** quando expirados (se tokens de atualização estiverem disponíveis)
- **Validados** antes de cada tentativa de conexão

> [!WARNING]
> Por padrão, os tokens OAuth são armazenados sem criptografia no disco. Em máquinas compartilhadas ou multiusuário, defina `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` para proteger as credenciais.

Use a caixa de diálogo `/mcp` no Qwen Code para inspecionar os servidores MCP e gerenciar
a autenticação de forma interativa.

### Filtragem de ferramentas (permitir/negar ferramentas por servidor)

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

### Listas globais de permissão/negação

O objeto `mcp` no seu `settings.json` define regras globais para todos os servidores MCP:

- `mcp.allowed`: lista de permissão de nomes de servidores MCP (chaves em `mcpServers`)
- `mcp.excluded`: lista de negação de nomes de servidores MCP

Ambas as listas suportam padrões glob: `*` corresponde a qualquer sequência de caracteres e `?` corresponde a um único caractere (por exemplo, `"*puppeteer*"` corresponde a qualquer servidor cujo nome contenha `puppeteer`). Entradas sem caracteres glob são correspondidas exatamente. Quando um servidor corresponde a ambas as listas, `mcp.excluded` tem precedência.

Exemplo:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server", "*-internal"],
    "excluded": ["experimental-server"]
  }
}
```

## Solução de problemas

- **Servidor mostra "Disconnected" no `qwen mcp list`**: verifique se a URL/comando está correto e aumente o `timeout`.
- **Servidor Stdio falha ao iniciar**: use um caminho `command` absoluto e verifique novamente o `cwd`/`env`.
- **Variáveis de ambiente no JSON não são resolvidas**: certifique-se de que elas existam no ambiente onde o Qwen Code é executado (os ambientes de shell vs aplicativo GUI podem diferir).

## Referência

### Estrutura do settings.json

#### Configuração específica do servidor (`mcpServers`)

Adicione um objeto `mcpServers` ao seu arquivo `settings.json`:

```json
// ... file contains other config objects
{
  "mcpServers": {
    "serverName": {
      "command": "path/to/server",
      "args": ["--arg1", "value1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-directory",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Propriedades de configuração:

Obrigatório (um dos seguintes):

| Propriedade  | Descrição                                            |
| --------- | ------------------------------------------------------ |
| `command` | Caminho para o executável para o transporte Stdio             |
| `url`     | URL do endpoint SSE (ex.: `"http://localhost:8080/sse"`) |
| `httpUrl` | URL do endpoint de streaming HTTP                            |

Opcional:

| Propriedade               | Tipo/Padrão                 | Descrição                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Argumentos de linha de comando para o transporte Stdio                                                                                                                                                                                                                        |
| `headers`              | object                       | Cabeçalhos HTTP personalizados ao usar `url` ou `httpUrl`                                                                                                                                                                                                                 |
| `env`                  | object                       | Variáveis de ambiente para o processo do servidor. Os valores podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                                                                |
| `cwd`                  | string                       | Diretório de trabalho para o transporte Stdio                                                                                                                                                                                                                             |
| `timeout`              | number<br>(default: 600,000) | Timeout da requisição em milissegundos (padrão: 600.000ms = 10 minutos)                                                                                                                                                                                                 |
| `trust`                | boolean<br>(default: false)  | Quando `true`, ignora todas as confirmações de chamada de ferramenta para este servidor (padrão: `false`)                                                                                                                                                                              |
| `includeTools`         | array                        | Lista de nomes de ferramentas a serem incluídas deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis neste servidor (comportamento de lista de permissão). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão.                                       |
| `excludeTools`         | array                        | Lista de nomes de ferramentas a serem excluídas deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor.<br>Nota: `excludeTools` tem precedência sobre `includeTools` - se uma ferramenta estiver em ambas as listas, ela será excluída. |
| `targetAudience`       | string                       | O Client ID do OAuth na lista de permissões do aplicativo protegido por IAP que você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                                         |
| `targetServiceAccount` | string                       | O endereço de e-mail da Conta de Serviço do Google Cloud a ser personificada. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### Gerenciar servidores MCP com `qwen mcp`

Você sempre pode configurar servidores MCP editando manualmente o `settings.json`, mas a CLI geralmente é mais rápida.

#### Adicionando um servidor (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argumento/Opção             | Descrição                                                         | Padrão                                | Exemplo                                                            |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | Um nome exclusivo para o servidor.                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | O comando a ser executado (para `stdio`) ou a URL (para `http`/`sse`). | —                                      | `/usr/bin/python` ou `http://localhost:8`                          |
| `[args...]`                 | Argumentos opcionais para um comando `stdio`.                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | Escopo de configuração (user ou project).                              | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | Tipo de transporte (`stdio`, `sse`, `http`).                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | Define variáveis de ambiente.                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | Define cabeçalhos HTTP para transportes SSE e HTTP.                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | Define o timeout de conexão em milissegundos.                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | Confiar no servidor (ignora todos os prompts de confirmação de chamada de ferramenta).       | — (`false`)                            | `--trust`                                                          |
| `--description`             | Define a descrição para o servidor.                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | Uma lista separada por vírgulas de ferramentas a serem incluídas.                         | all tools included                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | Uma lista separada por vírgulas de ferramentas a serem excluídas.                         | none                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | Client ID do OAuth para autenticação do servidor MCP.                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | Client secret do OAuth para autenticação do servidor MCP.                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | Redirect URI do OAuth para callback de autenticação.                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | URL de autorização do OAuth.                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | URL de token do OAuth.                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | Escopos do OAuth (separados por vírgula).                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |
> As flags `--oauth-*` se aplicam apenas a `--transport sse` e `--transport http`. A combinação delas com `--transport stdio` é rejeitada.

#### Removendo um servidor (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```