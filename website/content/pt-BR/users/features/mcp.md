# Conecte o Qwen Code a ferramentas através do MCP

O Qwen Code pode se conectar a ferramentas externas e fontes de dados através do [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Os servidores MCP fornecem ao Qwen Code acesso às suas ferramentas, bancos de dados e APIs.

## O que você pode fazer com o MCP

Com servidores MCP conectados, você pode pedir ao Qwen Code para:

- Trabalhar com arquivos e repositórios (ler/pesquisar/escrever, dependendo das ferramentas que você habilitar)
- Consultar bancos de dados (inspeção de esquema, consultas, relatórios)
- Integrar serviços internos (encapsular suas APIs como ferramentas MCP)
- Automatizar fluxos de trabalho (tarefas repetíveis expostas como ferramentas/prompts)

> [!tip]
>
> Se você está procurando o “comando único para começar”, vá para [Início rápido](#quick-start).

## Início rápido

O Qwen Code carrega servidores MCP a partir de `mcpServers` no seu `settings.json`. Você pode configurar servidores de duas formas:

- Editando o `settings.json` diretamente
- Usando comandos `qwen mcp` (veja [referência da CLI](#manage-mcp-servers-with-qwen-mcp))

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

3. Se o Qwen Code já estava em execução antes de você adicionar o servidor, reinicie-o no mesmo projeto. Em seguida, peça ao modelo para usar ferramentas desse servidor.

## Onde a configuração é armazenada (escopos)

A maioria dos usuários precisa apenas destes dois escopos:

- **Escopo do usuário (padrão)**: `~/.qwen/settings.json` em todos os projetos na sua máquina
- **Escopo do projeto**: `.qwen/settings.json` na raiz do seu projeto

Escrever no escopo do usuário:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Para camadas de configuração avançadas (padrões do sistema/configurações do sistema e regras de precedência), veja [Configurações](../configuration/settings).

## Configurar servidores

### Escolha um transporte

| Transport | Quando usar                                                       | Campos JSON                               |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | Recomendado para serviços remotos; funciona bem para servidores MCP em nuvem | `httpUrl` (+ opcional `headers`)            |
| `sse`     | Servidores legados/descontinuados que suportam apenas Server-Sent Events    | `url` (+ opcional `headers`)                |
| `stdio`   | Processo local (scripts, CLIs, Docker) na sua máquina             | `command`, `args` (+ opcional `cwd`, `env`) |

> [!note]
>
> Se um servidor suportar ambos, prefira **HTTP** em vez de **SSE**.

### Configurar via `settings.json` vs `qwen mcp add`

Ambas as abordagens produzem as mesmas entradas `mcpServers` no seu `settings.json`—use a que preferir.

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

CLI (escreve no escopo do usuário por padrão):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### Servidor HTTP (HTTP remoto com streaming)

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

Além de ferramentas, o Qwen Code descobre e expõe duas outras primitivas do MCP.

### Prompts (comandos de barra)

Qualquer prompt que um servidor anuncie via `prompts/list` se torna um **comando de barra** executável. Após a descoberta, digite `/` e você verá o prompt listado (rotulado como `MCP: <server>`); execute-o como qualquer outro comando:

```text
/my_prompt --arg1="value" --arg2="value"
# positional form also works:
/my_prompt "value" "value"
# show the prompt's arguments:
/my_prompt help
```

As mensagens do prompt são enviadas ao modelo, que então age com base nelas.

> A descoberta é tolerante quanto à capacidade `prompts` declarada: alguns servidores implementam `prompts/list` mas omitem `prompts` em suas capacidades `initialize`. O Qwen Code tenta `prompts/list` de qualquer forma, então esses prompts ainda aparecem. Um servidor que genuinamente não tem prompts simplesmente responde `Method not found`, que é ignorado.
### Resources

Recursos que um servidor anuncia via `resources/list` são descobertos por servidor.
Abra o diálogo de gerenciamento com `/mcp` e selecione um servidor para ver sua contagem de **Recursos** junto com suas ferramentas e prompts. Escolha **Ver recursos** para navegar pelos URIs de recursos do servidor; selecionar um mostra sua descrição e tipo MIME junto com a referência exata `@server:uri` para colar em uma mensagem. Assim como os prompts, a capacidade `resources` não precisa ser declarada.

Insira o conteúdo de um recurso em sua mensagem com a sintaxe `@server:uri` — digite `@`, depois o nome do servidor, dois pontos e o URI do recurso:

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

Digitar `@myserver:` mostra uma lista de autocomplete dos recursos daquele servidor; continue digitando para filtrar, combinando (sem distinção de maiúsculas/minúsculas) o URI do recurso ou seu nome/título amigável. Você não precisa saber um URI de cor — antes de chegar aos dois pontos, digitar parte de um nome de servidor também sugere servidores correspondentes que expõem recursos, assim você pode escolher um e ir direto para sua lista de recursos. Ao enviar, o recurso referenciado é lido e seu conteúdo é anexado à sua mensagem (texto inline, blobs binários como anexos); a referência `@server:uri` é preservada no prompt para que o modelo saiba o que está vendo. O prefixo `server` deve corresponder a um servidor MCP configurado — caso contrário, o token é tratado como um caminho de arquivo normal, então as referências existentes `@path/to/file` não são afetadas. Leituras de recursos são desabilitadas em pastas não confiáveis.

## Disponibilidade progressiva e timeouts de descoberta

O Qwen Code descobre servidores MCP em segundo plano após a UI já estar interativa. Você vê o primeiro prompt da CLI em alguns centésimos de segundo mesmo quando um de seus servidores MCP leva vários segundos (ou nunca responde), e a lista de ferramentas do modelo é atualizada em aproximadamente um quadro (~16 ms) após cada servidor completar seu handshake de descoberta.

- **Modo interativo**: a UI aparece imediatamente; uma pílula de status MCP no canto inferior direito mostra `N/M servidores MCP prontos` enquanto a descoberta está em andamento. Enviar um prompt antes do MCP terminar significa que o modelo vê as ferramentas que estão prontas _naquele momento_; prompts subsequentes veem mais ferramentas conforme os servidores ficam online.
- **Modo não interativo** (`--prompt`, stream-json, ACP): a CLI ainda espera a descoberta MCP se estabilizar antes de enviar o primeiro prompt, então invocações scriptadas/pipeadas veem o mesmo conjunto completo de ferramentas que o comportamento síncrono legado produzia.

### `discoveryTimeoutMs` por servidor

Cada servidor MCP recebe um timeout exclusivo de descoberta que limita quanto tempo o handshake inicial (`connect` + `tools/list` + `prompts/list` + `resources/list`) pode levar. Padrões:

- **servidores stdio**: 30 s
- **servidores HTTP / SSE remotos**: 5 s (risco de rede é maior)

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

O campo `timeout` existente é o timeout de **chamada de ferramenta** (usado para cada requisição `tools/call`, padrão 10 minutos) e não é afetado por `discoveryTimeoutMs` — uma invocação de ferramenta de longa duração não é uma patologia de inicialização.

### Revertendo MCP progressivo

Se você precisar do comportamento síncrono antigo (CLI espera por todos os servidores MCP antes de mostrar qualquer UI), defina `QWEN_CODE_LEGACY_MCP_BLOCKING=1` em seu ambiente. Isso é mantido como uma escotilha de escape por pelo menos um lançamento.

## Segurança e controle

### Confiança (pular confirmações)

- **Confiança no servidor** (`trust: true`): ignora prompts de confirmação para aquele servidor (use com moderação).

### Autenticação OAuth

O Qwen Code suporta autenticação OAuth 2.0 para servidores MCP. Isso é útil ao acessar servidores remotos que exigem autenticação.

#### Uso básico

Quando você adiciona um servidor MCP com credenciais OAuth, o Qwen Code lidará automaticamente com o fluxo de autenticação:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Importante: Configuração do URI de redirecionamento

O fluxo OAuth requer um URI de redirecionamento onde o provedor de autorização envia o código de autenticação.

- **Desenvolvimento local**: Por padrão, o Qwen Code usa `http://localhost:7777/oauth/callback`. Isso funciona ao executar o Qwen Code em sua máquina local com um navegador local.

- **Implantações remotas/nuvem**: Ao executar o Qwen Code em servidores remotos, IDEs na nuvem ou terminais web, o redirecionamento padrão `localhost` NÃO funcionará. Você DEVE configurar `--oauth-redirect-uri` para apontar para uma URL publicamente acessível que possa receber o callback OAuth.

Exemplo para servidores remotos:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```
#### Configuração manual via settings.json

Você também pode configurar OAuth editando `settings.json` diretamente:

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

| Propriedade       | Descrição                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`         | Habilita OAuth para este servidor (booleano)                                                                                   |
| `clientId`        | Identificador do cliente OAuth (string, opcional com registro dinâmico)                                                        |
| `clientSecret`    | Segredo do cliente OAuth (string, opcional para clientes públicos)                                                             |
| `authorizationUrl`| Endpoint de autorização OAuth (string, descoberta automática se omitido)                                                       |
| `tokenUrl`        | Endpoint de token OAuth (string, descoberta automática se omitido)                                                             |
| `scopes`          | Escopos OAuth necessários (array de strings)                                                                                   |
| `redirectUri`     | URI de redirecionamento personalizado (string). **Crítico para implantações remotas**. Padrão: `http://localhost:7777/oauth/callback` |
| `tokenParamName`  | Nome do parâmetro de consulta para tokens em URLs SSE (string)                                                                |
| `audiences`       | Públicos para os quais o token é válido (array de strings)                                                                     |

#### Gerenciamento de tokens

Os tokens OAuth são automaticamente:

- **Armazenados** em `~/.qwen/mcp-oauth-tokens.json` (texto simples, modo 0600) por padrão. Se `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` estiver definido, o Qwen Code usa armazenamento baseado em keychain quando disponível, ou `~/.qwen/mcp-oauth-tokens-v2.json` com criptografia AES-256-GCM.
- **Atualizados** quando expirados (se tokens de atualização estiverem disponíveis)
- **Validados** antes de cada tentativa de conexão

> [!WARNING]
> Por padrão, os tokens OAuth são armazenados sem criptografia no disco. Em máquinas compartilhadas ou multiusuário, defina `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` para proteger as credenciais.

Use o diálogo `/mcp` no Qwen Code para inspecionar servidores MCP e gerenciar autenticação de forma interativa.

### Filtragem de ferramentas (permitir/negar ferramentas por servidor)

Use `includeTools` / `excludeTools` para restringir ferramentas expostas por um servidor (da perspectiva do Qwen Code).

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

- **Servidor mostra “Disconnected” em `qwen mcp list`**: verifique se a URL/comando está correto e aumente `timeout`.
- **Servidor Stdio não inicia**: use um caminho absoluto em `command` e verifique novamente `cwd`/`env`.
- **Variáveis de ambiente no JSON não são resolvidas**: certifique-se de que elas existam no ambiente onde o Qwen Code é executado (ambientes de shell vs aplicativo GUI podem ser diferentes).

## Referência

### Estrutura do `settings.json`

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

| Propriedade | Descrição                                                         |
| ----------- | ----------------------------------------------------------------- |
| `command`   | Caminho para o executável do transporte Stdio                     |
| `url`       | URL do endpoint SSE (ex.: `"http://localhost:8080/sse"`)          |
| `httpUrl`   | URL do endpoint de streaming HTTP                                 |

Opcional:

| Propriedade          | Tipo/Padrão                  | Descrição                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`               | array                        | Argumentos de linha de comando para transporte Stdio                                                                                                                                                                                                                       |
| `headers`            | object                       | Cabeçalhos HTTP personalizados ao usar `url` ou `httpUrl`                                                                                                                                                                                                                  |
| `env`                | object                       | Variáveis de ambiente para o processo do servidor. Os valores podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                                                          |
| `cwd`                | string                       | Diretório de trabalho para transporte Stdio                                                                                                                                                                                                                                |
| `timeout`            | number<br>(padrão: 600.000)  | Tempo limite da requisição em milissegundos (padrão: 600.000ms = 10 minutos)                                                                                                                                                                                               |
| `trust`              | boolean<br>(padrão: false)   | Quando `true`, ignora todas as confirmações de chamadas de ferramentas para este servidor (padrão: `false`)                                                                                                                                                                |
| `includeTools`       | array                        | Lista de nomes de ferramentas a serem incluídas deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis neste servidor (comportamento de lista de permissão). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão. |
| `excludeTools`       | array                        | Lista de nomes de ferramentas a serem excluídas deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor.<br>Nota: `excludeTools` tem precedência sobre `includeTools` - se uma ferramenta estiver em ambas as listas, ela será excluída. |
| `targetAudience`     | string                       | O ID do Cliente OAuth na lista de permissões do aplicativo protegido por IAP que você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                                |
| `targetServiceAccount` | string                     | O endereço de e-mail da Conta de Serviço do Google Cloud a ser personificada. Usado com `authProviderType: 'service_account_impersonation'`.                                                                                                                               |
<a id="qwen-mcp-cli"></a>

### Gerencie servidores MCP com `qwen mcp`

Você sempre pode configurar servidores MCP editando manualmente o `settings.json`, mas a CLI geralmente é mais rápida.

#### Adicionando um servidor (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argumento/Opção             | Descrição                                                                  | Padrão                                 | Exemplo                                                            |
| --------------------------- | -------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | Um nome único para o servidor.                                             | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | O comando a ser executado (para `stdio`) ou a URL (para `http`/`sse`).     | —                                      | `/usr/bin/python` ou `http://localhost:8`                          |
| `[args...]`                 | Argumentos opcionais para um comando `stdio`.                              | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | Escopo de configuração (usuário ou projeto).                               | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | Tipo de transporte (`stdio`, `sse`, `http`).                               | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | Define variáveis de ambiente.                                              | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | Define cabeçalhos HTTP para transportes SSE e HTTP.                        | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | Define o tempo limite de conexão em milissegundos.                         | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | Confiar no servidor (ignorar todas as solicitações de confirmação de chamada de ferramenta). | — (`false`)                            | `--trust`                                                          |
| `--description`             | Define a descrição para o servidor.                                        | —                                      | `--description "Ferramentas locais"`                               |
| `--include-tools`           | Uma lista separada por vírgulas de ferramentas a incluir.                  | todas as ferramentas incluídas          | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | Uma lista separada por vírgulas de ferramentas a excluir.                  | nenhuma                                | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | ID do cliente OAuth para autenticação do servidor MCP.                     | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | Segredo do cliente OAuth para autenticação do servidor MCP.                | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | URI de redirecionamento OAuth para callback de autenticação.               | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | URL de autorização OAuth.                                                  | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | URL de token OAuth.                                                        | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | Escopos OAuth (separados por vírgulas).                                    | —                                      | `--oauth-scopes escopo1,escopo2`                                   |

> As flags `--oauth-*` se aplicam apenas a `--transport sse` e `--transport http`. A combinação delas com `--transport stdio` é rejeitada.

#### Removendo um servidor (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```
