# Conecte o Qwen Code a ferramentas via MCP

O Qwen Code pode se conectar a ferramentas externas e fontes de dados através do [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Servidores MCP dão ao Qwen Code acesso às suas ferramentas, bancos de dados e APIs.

## O que você pode fazer com MCP

Com servidores MCP conectados, você pode pedir ao Qwen Code para:

- Trabalhar com arquivos e repositórios (ler/buscar/escrever, dependendo das ferramentas que você habilitar)
- Consultar bancos de dados (inspeção de esquemas, consultas, relatórios)
- Integrar serviços internos (envolva suas APIs como ferramentas MCP)
- Automatizar workflows (tarefas repetíveis expostas como ferramentas/prompts)

> [!tip]
>
> Se você está procurando o "comando único para começar", vá para [Quick start](#quick-start).

## Quick start

O Qwen Code carrega servidores MCP a partir de `mcpServers` no seu `settings.json`. Você pode configurar os servidores:

- Editando o `settings.json` diretamente
- Usando comandos `qwen mcp` (veja [Referência da CLI](#gerenciar-servidores-mcp-com-qwen-mcp))

### Adicione seu primeiro servidor

1. Adicione um servidor (exemplo: servidor MCP HTTP remoto):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Inicie o Qwen Code e abra o diálogo de gerenciamento MCP para visualizar e gerenciar servidores:

```bash
qwen
```

Em seguida, digite:

```text
/mcp
```

3. Se o Qwen Code já estava em execução antes de você adicionar o servidor, reinicie-o no mesmo projeto. Depois, peça ao modelo para usar ferramentas desse servidor.

## Onde a configuração é armazenada (escopos)

A maioria dos usuários precisa apenas destes dois escopos:

- **Escopo de usuário (padrão)**: `~/.qwen/settings.json` em todos os projetos na sua máquina
- **Escopo de projeto**: `.qwen/settings.json` na raiz do seu projeto

Escreva no escopo de usuário:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Para camadas avançadas de configuração (padrões de sistema/configurações de sistema e regras de precedência), veja [Configurações](../configuration/settings).

## Configurar servidores

### Escolha um transporte

| Transporte | Quando usar                                                           | Campo(s) JSON                               |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------- |
| `http`     | Recomendado para serviços remotos; funciona bem para servidores MCP na nuvem | `httpUrl` (+ `headers` opcional)            |
| `sse`      | Servidores legados/depreciados que só suportam Server-Sent Events     | `url` (+ `headers` opcional)                |
| `stdio`    | Processo local (scripts, CLIs, Docker) na sua máquina                 | `command`, `args` (+ `cwd`, `env` opcionais) |

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

CLI (escreve no escopo de usuário por padrão):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### Servidor HTTP (HTTP remoto streamable)

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

## Usando prompts e recursos MCP

Além de ferramentas, o Qwen Code descobre e expõe outras duas primitivas MCP.

### Prompts (comandos de barra)

Qualquer prompt que um servidor anuncie via `prompts/list` se torna um **comando de barra** executável. Após a descoberta, digite `/` e você verá o prompt listado (rotulado `MCP: <server>`); execute-o como qualquer outro comando:

```text
/my_prompt --arg1="value" --arg2="value"
# a forma posicional também funciona:
/my_prompt "value" "value"
# mostra os argumentos do prompt:
/my_prompt help
```

As mensagens do prompt são enviadas ao modelo, que então age de acordo com elas.

> A descoberta é tolerante em relação à capacidade `prompts` declarada: alguns servidores implementam `prompts/list` mas omitem `prompts` das suas capacidades de `initialize`. O Qwen Code tenta `prompts/list` de qualquer forma, então esses prompts ainda aparecem. Um servidor que genuinamente não tem prompts simplesmente responde com `Method not found`, o que é ignorado.

### Recursos

Os recursos que um servidor anuncia via `resources/list` são descobertos por servidor. Abra o diálogo de gerenciamento com `/mcp` e selecione um servidor para ver a contagem de **Resources** ao lado de suas ferramentas e prompts. Escolha **View resources** para navegar pelos URIs de recurso do servidor; selecionar um mostra sua descrição e tipo MIME junto com a referência exata `@server:uri` para colar em uma mensagem. Assim como nos prompts, a capacidade `resources` não precisa ser declarada.

Injete o conteúdo de um recurso na sua mensagem com a sintaxe `@server:uri` — digite `@`, depois o nome do servidor, dois pontos e o URI do recurso:

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

Digitar `@myserver:` mostra uma lista de autocomplete com os recursos daquele servidor; continue digitando para filtrar, correspondendo (sem diferenciar maiúsculas/minúsculas) ao URI do recurso ou ao seu nome/título amigável. Você não precisa saber um URI de cor — antes de chegar aos dois pontos, digitar parte do nome do servidor também sugere servidores correspondentes que expõem recursos, então você pode escolher um e ir direto para a lista de recursos. Ao enviar, o recurso referenciado é lido e seu conteúdo é anexado à sua mensagem (texto inline, blobs binários como anexos); a referência `@server:uri` é preservada no prompt para que o modelo saiba o que está vendo. O prefixo `server` deve corresponder a um servidor MCP configurado — caso contrário, o token é tratado como um caminho de arquivo normal, então referências existentes `@caminho/para/arquivo` não são afetadas. Leituras de recursos são desabilitadas em pastas não confiáveis.

## Disponibilidade progressiva e timeouts de descoberta

O Qwen Code descobre servidores MCP em segundo plano após a UI já estar interativa. Você vê o primeiro prompt da CLI em algumas centenas de milissegundos, mesmo quando um dos seus servidores MCP leva vários segundos (ou nunca responde), e a lista de ferramentas do modelo é atualizada dentro de aproximadamente um frame (~16 ms) após cada servidor completar seu handshake de descoberta.

- **Modo interativo**: a UI aparece imediatamente; um indicador de status MCP no canto inferior direito mostra `N/M MCP servers ready` enquanto a descoberta está em andamento. Enviar um prompt antes do MCP terminar significa simplesmente que o modelo vê as ferramentas que estão prontas _naquele momento_; prompts subsequentes veem mais ferramentas à medida que os servidores ficam online.
- **Modo não interativo** (`--prompt`, stream-json, ACP): a CLI ainda espera a descoberta MCP se estabilizar antes de enviar o primeiro prompt, então invocações scriptadas/por pipe veem o mesmo conjunto completo de ferramentas que o comportamento síncrono legado produzia.

### `discoveryTimeoutMs` por servidor

Cada servidor MCP recebe um timeout apenas de descoberta que limita o tempo permitido para o handshake inicial (`connect` + `tools/list` + `prompts/list` + `resources/list`). Padrões:

- **Servidores stdio**: 30 s
- **Servidores HTTP / SSE remotos**: 5 s (risco de rede é maior)

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

O campo `timeout` existente é o timeout **de chamada de ferramenta** (usado para cada requisição `tools/call`, padrão 10 minutos) e não é afetado por `discoveryTimeoutMs` — uma invocação de ferramenta de longa duração não é uma patologia de inicialização.

### Revertendo o MCP progressivo

Se você precisar do comportamento síncrono antigo (a CLI espera por todos os servidores MCP antes de mostrar qualquer UI), defina `QWEN_CODE_LEGACY_MCP_BLOCKING=1` no seu ambiente. Isso é mantido como uma saída de emergência por pelo menos uma versão.

## Segurança e controle

### Confiança (pular confirmações)

- **Confiança no servidor** (`trust: true`): ignora prompts de confirmação para aquele servidor (use com moderação).

### Autenticação OAuth

O Qwen Code suporta autenticação OAuth 2.0 para servidores MCP. Isso é útil ao acessar servidores remotos que exigem autenticação.

#### Uso básico

Quando você adiciona um servidor MCP com credenciais OAuth, o Qwen Code lida automaticamente com o fluxo de autenticação:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Importante: Configuração da URI de redirecionamento

O fluxo OAuth requer uma URI de redirecionamento para onde o provedor de autorização envia o código de autenticação.

- **Desenvolvimento local**: Por padrão, o Qwen Code usa `http://localhost:7777/oauth/callback`. Isso funciona quando o Qwen Code é executado na sua máquina local com um navegador local.

- **Implantações remotas/em nuvem**: Ao executar o Qwen Code em servidores remotos, IDEs em nuvem ou terminais web, o redirecionamento `localhost` padrão **não** funcionará. Você DEVE configurar `--oauth-redirect-uri` para apontar para uma URL publicamente acessível que possa receber o callback OAuth.

Exemplo para servidores remotos:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### Configuração manual via settings.json

Você também pode configurar OAuth editando o `settings.json` diretamente:

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

Propriedades de configuração OAuth:

| Propriedade       | Descrição                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `enabled`         | Habilita OAuth para este servidor (booleano)                                                                        |
| `clientId`        | Identificador do cliente OAuth (string, opcional com registro dinâmico)                                            |
| `clientSecret`    | Segredo do cliente OAuth (string, opcional para clientes públicos)                                                  |
| `authorizationUrl`| Endpoint de autorização OAuth (string, descoberto automaticamente se omitido)                                       |
| `tokenUrl`        | Endpoint de token OAuth (string, descoberto automaticamente se omitido)                                             |
| `scopes`          | Escopos OAuth necessários (array de strings)                                                                        |
| `redirectUri`     | URI de redirecionamento customizada (string). **Crítica para implantações remotas**. Padrão: `http://localhost:7777/oauth/callback` |
| `tokenParamName`  | Nome do parâmetro de consulta para tokens em URLs SSE (string)                                                      |
| `audiences`       | Públicos para os quais o token é válido (array de strings)                                                          |

#### Gerenciamento de tokens

Os tokens OAuth são automaticamente:

- **Armazenados** em `~/.qwen/mcp-oauth-tokens.json` (texto puro, modo 0600) por padrão. Se `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` estiver definido, o Qwen Code usa armazenamento baseado em keychain quando disponível, ou `~/.qwen/mcp-oauth-tokens-v2.json` com criptografia AES-256-GCM.
- **Atualizados** quando expiram (se tokens de atualização estiverem disponíveis)
- **Validados** antes de cada tentativa de conexão

> [!WARNING]
> Por padrão, tokens OAuth são armazenados sem criptografia no disco. Em máquinas compartilhadas ou multiusuário, defina `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` para proteger as credenciais.

Use o diálogo `/mcp` dentro do Qwen Code para inspecionar servidores MCP e gerenciar autenticação interativamente.

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

- **Servidor mostra “Disconnected” no `qwen mcp list`**: verifique se a URL/comando está correto e aumente o `timeout`.
- **Servidor Stdio não inicia**: use um caminho `command` absoluto e verifique `cwd`/`env`.
- **Variáveis de ambiente no JSON não são resolvidas**: garanta que elas existam no ambiente onde o Qwen Code é executado (ambientes de shell vs GUI podem diferir).

## Referência

### Estrutura do `settings.json`

#### Configuração específica do servidor (`mcpServers`)

Adicione um objeto `mcpServers` ao seu arquivo `settings.json`:

```json
// ... o arquivo contém outros objetos de configuração
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

| Propriedade | Descrição                                            |
| ----------- | ---------------------------------------------------- |
| `command`   | Caminho para o executável para transporte Stdio      |
| `url`       | URL do endpoint SSE (ex.: `"http://localhost:8080/sse"`) |
| `httpUrl`   | URL do endpoint HTTP streaming                       |

Opcional:

| Propriedade           | Tipo/Padrão                    | Descrição                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                | array                          | Argumentos de linha de comando para transporte Stdio                                                                                                                                                                                                            |
| `headers`             | object                         | Cabeçalhos HTTP customizados ao usar `url` ou `httpUrl`                                                                                                                                                                                                         |
| `env`                 | object                         | Variáveis de ambiente para o processo do servidor. Valores podem referenciar variáveis de ambiente usando sintaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                                                   |
| `cwd`                 | string                         | Diretório de trabalho para transporte Stdio                                                                                                                                                                                                                     |
| `timeout`             | number<br>(padrão: 600.000)    | Timeout de requisição em milissegundos (padrão: 600.000ms = 10 minutos)                                                                                                                                                                                         |
| `trust`               | boolean<br>(padrão: false)     | Quando `true`, ignora todas as confirmações de chamada de ferramenta para este servidor (padrão: `false`)                                                                                                                                                       |
| `includeTools`        | array                          | Lista de nomes de ferramentas para incluir deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis a partir deste servidor (comportamento de lista de permissão). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão. |
| `excludeTools`        | array                          | Lista de nomes de ferramentas para excluir deste servidor MCP. Ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor.<br>Nota: `excludeTools` tem precedência sobre `includeTools` – se uma ferramenta estiver em ambas as listas, ela será excluída. |
| `targetAudience`       | string                        | O ID do Cliente OAuth na lista de permissões do aplicativo protegido por IAP que você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                     |
| `targetServiceAccount` | string                        | O endereço de e-mail da Conta de Serviço do Google Cloud para personificar. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                                                       |

<a id="qwen-mcp-cli"></a>

### Gerenciar servidores MCP com `qwen mcp`

Você pode sempre configurar servidores MCP editando manualmente o `settings.json`, mas a CLI geralmente é mais rápida.

#### Adicionando um servidor (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argumento/Opção             | Descrição                                                         | Padrão                                 | Exemplo                                                            |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | Um nome único para o servidor.                                    | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | O comando a executar (para `stdio`) ou a URL (para `http`/`sse`). | —                                      | `/usr/bin/python` ou `http://localhost:8`                          |
| `[args...]`                 | Argumentos opcionais para um comando `stdio`.                     | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | Escopo da configuração (user ou project).                         | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | Tipo de transporte (`stdio`, `sse`, `http`).                      | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | Definir variáveis de ambiente.                                    | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | Definir cabeçalhos HTTP para transportes SSE e HTTP.              | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | Definir timeout de conexão em milissegundos.                      | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | Confiar no servidor (ignorar todos os prompts de confirmação de chamada de ferramenta). | — (`false`)                            | `--trust`                                                          |
| `--description`             | Definir a descrição do servidor.                                  | —                                      | `--description "Ferramentas locais"`                               |
| `--include-tools`           | Uma lista separada por vírgulas de ferramentas a incluir.         | todas as ferramentas incluídas         | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | Uma lista separada por vírgulas de ferramentas a excluir.         | nenhuma                                | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | ID do cliente OAuth para autenticação do servidor MCP.            | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | Segredo do cliente OAuth para autenticação do servidor MCP.       | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | URI de redirecionamento OAuth para callback de autenticação.      | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | URL de autorização OAuth.                                         | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | URL de token OAuth.                                               | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | Escopos OAuth (separados por vírgula).                            | —                                      | `--oauth-scopes scope1,scope2`                                     |
> As flags `--oauth-*` aplicam-se apenas aos transportes `--transport sse` e `--transport http`. Combiná-las com `--transport stdio` é rejeitado.

#### Removendo um servidor (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```