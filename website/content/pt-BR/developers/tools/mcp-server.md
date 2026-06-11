# Servidores MCP com Qwen Code

Este documento fornece um guia para configurar e usar servidores do Model Context Protocol (MCP) com o Qwen Code.

## O que é um servidor MCP?

Um servidor MCP é um aplicativo que expõe ferramentas e recursos para a CLI por meio do Model Context Protocol, permitindo que ela interaja com sistemas externos e fontes de dados. Os servidores MCP atuam como uma ponte entre o modelo e seu ambiente local ou outros serviços, como APIs.

Um servidor MCP permite que a CLI:

- **Descobrir ferramentas:** Listar ferramentas disponíveis, suas descrições e parâmetros por meio de definições de schema padronizadas.
- **Executar ferramentas:** Chamar ferramentas específicas com argumentos definidos e receber respostas estruturadas.
- **Acessar recursos:** Ler dados de recursos específicos (embora a CLI foque principalmente na execução de ferramentas).

Com um servidor MCP, você pode estender os recursos da CLI para realizar ações além das funcionalidades nativas, como interagir com bancos de dados, APIs, scripts personalizados ou fluxos de trabalho especializados.

## Arquitetura de Integração Principal

O Qwen Code se integra a servidores MCP por meio de um sistema sofisticado de descoberta e execução integrado ao pacote principal (`packages/core/src/tools/`):

### Camada de Descoberta (`mcp-client.ts`)

O processo de descoberta é orquestrado por `discoverMcpTools()`, que:

1. **Itera sobre os servidores configurados** na configuração `mcpServers` do seu `settings.json`
2. **Estabelece conexões** usando os mecanismos de transporte apropriados (Stdio, SSE ou Streamable HTTP)
3. **Busca as definições de ferramentas** de cada servidor usando o protocolo MCP
4. **Limpa e valida** os schemas das ferramentas para compatibilidade com a API do Qwen
5. **Registra as ferramentas** no registro global de ferramentas com resolução de conflitos

### Camada de Execução (`mcp-tool.ts`)

Cada ferramenta MCP descoberta é encapsulada em uma instância `DiscoveredMCPTool` que:

- **Gerencia a lógica de confirmação** com base nas configurações de confiança do servidor e nas preferências do usuário
- **Gerencia a execução da ferramenta** chamando o servidor MCP com os parâmetros adequados
- **Processa as respostas** tanto para o contexto do LLM quanto para exibição ao usuário
- **Mantém o estado da conexão** e gerencia timeouts

### Mecanismos de Transporte

A CLI suporta três tipos de transporte MCP:

- **Transporte Stdio:** Inicia um subprocesso e se comunica via stdin/stdout
- **Transporte SSE:** Conecta-se a endpoints de Server-Sent Events
- **Transporte Streamable HTTP:** Usa streaming HTTP para comunicação

## Como configurar seu servidor MCP

O Qwen Code usa a configuração `mcpServers` no seu arquivo `settings.json` para localizar e conectar-se a servidores MCP. Essa configuração suporta múltiplos servidores com diferentes mecanismos de transporte.

### Configure o servidor MCP no settings.json

Você pode configurar servidores MCP no seu arquivo `settings.json` de duas formas principais: por meio do objeto `mcpServers` de nível superior para definições específicas de servidor, e por meio do objeto `mcp` para configurações globais que controlam a descoberta e execução de servidores.

#### Configurações Globais do MCP (`mcp`)

O objeto `mcp` no seu `settings.json` permite definir regras globais para todos os servidores MCP.

- **`mcp.serverCommand`** (string): Um comando global para iniciar um servidor MCP.
- **`mcp.allowed`** (array de strings): Uma lista de nomes de servidores MCP permitidos. Se definido, apenas os servidores desta lista (que correspondem às chaves no objeto `mcpServers`) serão conectados.
- **`mcp.excluded`** (array de strings): Uma lista de nomes de servidores MCP a serem excluídos. Servidores nesta lista não serão conectados.

**Exemplo:**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### Configuração Específica por Servidor (`mcpServers`)

O objeto `mcpServers` é onde você define cada servidor MCP individual ao qual deseja que a CLI se conecte.

### Estrutura de Configuração

Adicione um objeto `mcpServers` ao seu arquivo `settings.json`:

```json
{ ...file contains other config objects
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

### Propriedades de Configuração

Cada configuração de servidor suporta as seguintes propriedades:

#### Obrigatório (uma das seguintes)

- **`command`** (string): Caminho para o executável para transporte Stdio
- **`url`** (string): URL do endpoint SSE (ex.: `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): URL do endpoint de streaming HTTP

#### Opcional

- **`args`** (string[]): Argumentos de linha de comando para transporte Stdio
- **`headers`** (object): Cabeçalhos HTTP personalizados ao usar `url` ou `httpUrl`
- **`env`** (object): Variáveis de ambiente para o processo do servidor. Os valores podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (string): Diretório de trabalho para transporte Stdio
- **`timeout`** (number): Timeout da requisição em milissegundos (padrão: 600.000ms = 10 minutos)
- **`trust`** (boolean): Quando `true`, ignora todas as confirmações de chamada de ferramenta para este servidor (padrão: `false`)
- **`includeTools`** (string[]): Lista de nomes de ferramentas a serem incluídas deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis neste servidor (comportamento de allowlist). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão.
- **`excludeTools`** (string[]): Lista de nomes de ferramentas a serem excluídas deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor. **Nota:** `excludeTools` tem precedência sobre `includeTools` - se uma ferramenta estiver em ambas as listas, ela será excluída.
- **`targetAudience`** (string): O Client ID do OAuth na allowlist do aplicativo protegido por IAP que você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud a ser personificada. Usado com `authProviderType: 'service_account_impersonation'`.

### Suporte a OAuth para Servidores MCP Remotos

O Qwen Code suporta autenticação OAuth 2.0 para servidores MCP remotos usando transportes SSE ou HTTP. Isso permite acesso seguro a servidores MCP que exigem autenticação.

#### Descoberta Automática de OAuth

Para servidores que suportam descoberta de OAuth, você pode omitir a configuração de OAuth e deixar a CLI descobri-la automaticamente:

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

A CLI irá automaticamente:

- Detectar quando um servidor exige autenticação OAuth (respostas 401)
- Descobrir endpoints OAuth a partir dos metadados do servidor
- Realizar registro dinâmico de cliente, se suportado
- Gerenciar o fluxo OAuth e os tokens

#### Fluxo de Autenticação

Ao conectar-se a um servidor com OAuth habilitado:

1. **A tentativa inicial de conexão** falha com 401 Unauthorized
2. **A descoberta do OAuth** encontra os endpoints de autorização e token
3. **O navegador é aberto** para autenticação do usuário (requer acesso a um navegador local)
4. **O código de autorização** é trocado por tokens de acesso
5. **Os tokens são armazenados** de forma segura para uso futuro
6. **A nova tentativa de conexão** é bem-sucedida com tokens válidos

#### Requisitos de Redirecionamento do Navegador

**Importante:** A autenticação OAuth exige que o URI de redirecionamento esteja acessível:

- **Comportamento padrão**: Redireciona para `http://localhost:7777/oauth/callback` (funciona para configurações locais)
- **URI de redirecionamento personalizado**: Use `--oauth-redirect-uri` ou configure `redirectUri` no settings.json para especificar uma URL diferente

Para **implantações em servidores remotos/nuvem** (ex.: terminais web, sessões SSH, IDEs em nuvem):

- O redirecionamento padrão `localhost` NÃO funcionará
- Você DEVE configurar um `redirectUri` personalizado apontando para uma URL publicamente acessível
- O navegador do usuário deve conseguir acessar essa URL e redirecionar de volta para o servidor

Exemplo para servidores remotos:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

O OAuth não funcionará em:

- Ambientes headless sem acesso a navegador
- Ambientes onde o `redirectUri` configurado é inacessível pelo navegador do usuário

#### Gerenciando Autenticação OAuth

Use o comando `/mcp auth` para gerenciar a autenticação OAuth:

```bash
# Listar servidores que exigem autenticação
/mcp auth

# Autenticar com um servidor específico
/mcp auth serverName

# Reautenticar se os tokens expirarem
/mcp auth serverName
```

#### Propriedades de Configuração do OAuth

- **`enabled`** (boolean): Habilita OAuth para este servidor
- **`clientId`** (string): Identificador do cliente OAuth (opcional com registro dinâmico)
- **`clientSecret`** (string): Segredo do cliente OAuth (opcional para clientes públicos)
- **`authorizationUrl`** (string): Endpoint de autorização OAuth (descoberto automaticamente se omitido)
- **`tokenUrl`** (string): Endpoint de token OAuth (descoberto automaticamente se omitido)
- **`scopes`** (string[]): Scopes OAuth obrigatórios
- **`redirectUri`** (string): URI de redirecionamento personalizado. **Crítico para implantações remotas**: Padrão é `http://localhost:7777/oauth/callback`. Ao executar o Qwen Code em servidores remotos/nuvem, defina isso para uma URL publicamente acessível (ex.: `https://your-server.com/oauth/callback`). Pode ser configurado via `qwen mcp add --oauth-redirect-uri` ou diretamente no settings.json.
- **`tokenParamName`** (string): Nome do parâmetro de query para tokens em URLs SSE
- **`audiences`** (string[]): Audiências para as quais o token é válido

#### Gerenciamento de Tokens

Os tokens OAuth são automaticamente:

- **Armazenados de forma segura** em `~/.qwen/mcp-oauth-tokens.json`
- **Atualizados** quando expiram (se refresh tokens estiverem disponíveis)
- **Validados** antes de cada tentativa de conexão
- **Removidos** quando inválidos ou expirados

#### Tipo de Provedor de Autenticação

Você pode especificar o tipo de provedor de autenticação usando a propriedade `authProviderType`:

- **`authProviderType`** (string): Especifica o provedor de autenticação. Pode ser um dos seguintes:
  - **`dynamic_discovery`** (padrão): A CLI descobrirá automaticamente a configuração OAuth a partir do servidor.
  - **`google_credentials`**: A CLI usará as Google Application Default Credentials (ADC) para autenticar com o servidor. Ao usar este provedor, você deve especificar os scopes obrigatórios.
  - **`service_account_impersonation`**: A CLI personificará uma Conta de Serviço do Google Cloud para autenticar com o servidor. Isso é útil para acessar serviços protegidos por IAP (foi projetado especificamente para serviços do Cloud Run).

#### Credenciais do Google

```json
{
  "mcpServers": {
    "googleCloudServer": {
      "httpUrl": "https://my-gcp-service.run.app/mcp",
      "authProviderType": "google_credentials",
      "oauth": {
        "scopes": ["https://www.googleapis.com/auth/userinfo.email"]
      }
    }
  }
}
```

#### Personificação de Conta de Serviço

Para autenticar com um servidor usando Personificação de Conta de Serviço, você deve definir `authProviderType` como `service_account_impersonation` e fornecer as seguintes propriedades:

- **`targetAudience`** (string): O Client ID do OAuth na allowlist do aplicativo protegido por IAP que você está tentando acessar.
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud a ser personificada.

A CLI usará suas Application Default Credentials (ADC) locais para gerar um token de ID OIDC para a conta de serviço e audiência especificadas. Esse token será então usado para autenticar com o servidor MCP.

#### Instruções de Configuração

1. **[Crie](https://cloud.google.com/iap/docs/oauth-client-creation) ou use um Client ID OAuth 2.0 existente.** Para usar um Client ID OAuth 2.0 existente, siga as etapas em [Como compartilhar Clientes OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Adicione o ID OAuth à allowlist para [acesso programático](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) do aplicativo.** Como o Cloud Run ainda não é um tipo de recurso suportado no `gcloud iap`, você deve adicionar o Client ID à allowlist no projeto.
3. **Crie uma conta de serviço.** [Documentação](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Link do Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Adicione a conta de serviço e os usuários à Política IAP** na aba "Security" do próprio serviço Cloud Run ou via gcloud.
5. **Conceda a todos os usuários e grupos** que acessarão o Servidor MCP as permissões necessárias para [personificar a conta de serviço](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (ou seja, `roles/iam.serviceAccountTokenCreator`).
6. **[Ative](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) a API IAM Credentials** para o seu projeto.

### Exemplos de Configuração

#### Servidor MCP Python (Stdio)

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

#### Servidor MCP Node.js (Stdio)

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["dist/server.js", "--verbose"],
      "cwd": "./mcp-servers/node",
      "trust": true
    }
  }
}
```

#### Servidor MCP Baseado em Docker

```json
{
  "mcpServers": {
    "dockerizedServer": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "API_KEY",
        "-v",
        "${PWD}:/workspace",
        "my-mcp-server:latest"
      ],
      "env": {
        "API_KEY": "$EXTERNAL_SERVICE_TOKEN"
      }
    }
  }
}
```

#### Servidor MCP Baseado em HTTP

```json
{
  "mcpServers": {
    "httpServer": {
      "httpUrl": "http://localhost:3000/mcp",
      "timeout": 5000
    }
  }
}
```

#### Servidor MCP Baseado em HTTP com Cabeçalhos Personalizados

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token",
        "X-Custom-Header": "custom-value",
        "Content-Type": "application/json"
      },
      "timeout": 5000
    }
  }
}
```

#### Servidor MCP com Filtragem de Ferramentas

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      // "excludeTools": ["dangerous_tool", "file_deleter"],
      "timeout": 30000
    }
  }
}
```

### Servidor MCP SSE com Personificação de Conta de Serviço

```json
{
  "mcpServers": {
    "myIapProtectedServer": {
      "url": "https://my-iap-service.run.app/sse",
      "authProviderType": "service_account_impersonation",
      "targetAudience": "YOUR_IAP_CLIENT_ID.apps.googleusercontent.com",
      "targetServiceAccount": "your-sa@your-project.iam.gserviceaccount.com"
    }
  }
}
```

## Aprofundamento no Processo de Descoberta

Quando o Qwen Code é iniciado, ele realiza a descoberta de servidores MCP por meio do seguinte processo detalhado:

### 1. Iteração e Conexão do Servidor

Para cada servidor configurado em `mcpServers`:

1. **O rastreamento de status começa:** O status do servidor é definido como `CONNECTING`
2. **Seleção de transporte:** Com base nas propriedades de configuração:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Estabelecimento da conexão:** O cliente MCP tenta conectar com o timeout configurado
4. **Tratamento de erros:** Falhas de conexão são registradas no log e o status do servidor é definido como `DISCONNECTED`

### 2. Descoberta de Ferramentas

Após uma conexão bem-sucedida:

1. **Listagem de ferramentas:** O cliente chama o endpoint de listagem de ferramentas do servidor MCP
2. **Validação de schema:** A declaração de função de cada ferramenta é validada
3. **Filtragem de ferramentas:** As ferramentas são filtradas com base na configuração `includeTools` e `excludeTools`
4. **Limpeza de nomes:** Os nomes das ferramentas são limpos para atender aos requisitos da API do Qwen:
   - Caracteres inválidos (não alfanuméricos, exceto underscore, ponto e hífen) são substituídos por underscores
   - Nomes com mais de 63 caracteres são truncados com substituição no meio (`___`)

### 3. Resolução de Conflitos

Quando múltiplos servidores expõem ferramentas com o mesmo nome:

1. **O primeiro registro vence:** O primeiro servidor a registrar um nome de ferramenta obtém o nome sem prefixo
2. **Prefixação automática:** Servidores subsequentes recebem nomes prefixados: `serverName__toolName`
3. **Rastreamento do registro:** O registro de ferramentas mantém mapeamentos entre nomes de servidores e suas ferramentas

### 4. Processamento de Schema

Os schemas de parâmetros das ferramentas passam por limpeza para compatibilidade com a API:

- **Propriedades `$schema`** são removidas
- **`additionalProperties`** são removidos
- **`anyOf` com `default`** têm seus valores padrão removidos (compatibilidade com Vertex AI)
- **Processamento recursivo** é aplicado a schemas aninhados

### 5. Gerenciamento de Conexão

Após a descoberta:

- **Conexões persistentes:** Servidores que registram ferramentas com sucesso mantêm suas conexões
- **Limpeza:** Servidores que não fornecem ferramentas utilizáveis têm suas conexões fechadas
- **Atualizações de status:** Os status finais dos servidores são definidos como `CONNECTED` ou `DISCONNECTED`

## Fluxo de Execução de Ferramentas

Quando o modelo decide usar uma ferramenta MCP, o seguinte fluxo de execução ocorre:

### 1. Invocação da Ferramenta

O modelo gera um `FunctionCall` com:

- **Nome da ferramenta:** O nome registrado (potencialmente prefixado)
- **Argumentos:** Objeto JSON correspondente ao schema de parâmetros da ferramenta

### 2. Processo de Confirmação

Cada `DiscoveredMCPTool` implementa uma lógica de confirmação sofisticada:

#### Ignorar com Base na Confiança

```typescript
if (this.trust) {
  return false; // No confirmation needed
}
```

#### Lista de Permissões Dinâmica

O sistema mantém listas de permissões internas para:

- **Nível do servidor:** `serverName` → Todas as ferramentas deste servidor são confiáveis
- **Nível da ferramenta:** `serverName.toolName` → Esta ferramenta específica é confiável

#### Tratamento de Escolha do Usuário

Quando a confirmação é necessária, os usuários podem escolher:

- **Prosseguir uma vez:** Executar apenas desta vez
- **Sempre permitir esta ferramenta:** Adicionar à lista de permissões no nível da ferramenta
- **Sempre permitir este servidor:** Adicionar à lista de permissões no nível do servidor
- **Cancelar:** Abortar a execução

### 3. Execução

Após a confirmação (ou ignorar por confiança):

1. **Preparação de parâmetros:** Os argumentos são validados em relação ao schema da ferramenta
2. **Chamada MCP:** O `CallableTool` subjacente invoca o servidor com:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Original server tool name
       args: params,
     },
   ];
   ```

3. **Processamento de resposta:** Os resultados são formatados tanto para o contexto do LLM quanto para exibição ao usuário

### 4. Tratamento de Resposta

O resultado da execução contém:

- **`llmContent`:** Partes da resposta bruta para o contexto do modelo de linguagem
- **`returnDisplay`:** Saída formatada para exibição ao usuário (geralmente JSON em blocos de código markdown)

## Como interagir com seu servidor MCP

### Usando o Comando `/mcp`

O comando `/mcp` fornece informações abrangentes sobre a configuração do seu servidor MCP:

```bash
/mcp
```

Isso exibe:

- **Lista de servidores:** Todos os servidores MCP configurados
- **Status da conexão:** `CONNECTED`, `CONNECTING` ou `DISCONNECTED`
- **Detalhes do servidor:** Resumo da configuração (excluindo dados sensíveis)
- **Ferramentas disponíveis:** Lista de ferramentas de cada servidor com descrições
- **Estado da descoberta:** Status geral do processo de descoberta

### Exemplo de Saída do `/mcp`

```
MCP Servers Status:

📡 pythonTools (CONNECTED)
  Command: python -m my_mcp_server --port 8080
  Working Directory: ./mcp-servers/python
  Timeout: 15000ms
  Tools: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Command: node dist/server.js --verbose
  Error: Connection refused

🐳 dockerizedServer (CONNECTED)
  Command: docker run -i --rm -e API_KEY my-mcp-server:latest
  Tools: docker__deploy, docker__status

Discovery State: COMPLETED
```

### Uso de Ferramentas

Uma vez descobertas, as ferramentas MCP ficam disponíveis para o modelo Qwen como ferramentas nativas. O modelo irá automaticamente:

1. **Selecionar as ferramentas apropriadas** com base nas suas solicitações
2. **Apresentar diálogos de confirmação** (a menos que o servidor seja confiável)
3. **Executar as ferramentas** com os parâmetros adequados
4. **Exibir os resultados** em um formato amigável ao usuário

## Monitoramento de Status e Solução de Problemas

### Estados de Conexão

A integração MCP rastreia vários estados:

#### Status do Servidor (`MCPServerStatus`)

- **`DISCONNECTED`:** O servidor não está conectado ou possui erros
- **`CONNECTING`:** Tentativa de conexão em andamento
- **`CONNECTED`:** O servidor está conectado e pronto

#### Estado da Descoberta (`MCPDiscoveryState`)

- **`NOT_STARTED`:** A descoberta não começou
- **`IN_PROGRESS`:** Descobrindo servidores no momento
- **`COMPLETED`:** Descoberta finalizada (com ou sem erros)

### Problemas Comuns e Soluções

#### O Servidor Não Conecta

**Sintomas:** O servidor mostra o status `DISCONNECTED`

**Solução de problemas:**

1. **Verifique a configuração:** Confirme se `command`, `args` e `cwd` estão corretos
2. **Teste manualmente:** Execute o comando do servidor diretamente para garantir que funciona
3. **Verifique as dependências:** Garanta que todos os pacotes necessários estão instalados
4. **Revise os logs:** Procure mensagens de erro na saída da CLI
5. **Verifique as permissões:** Garanta que a CLI pode executar o comando do servidor

#### Nenhuma Ferramenta Descoberta

**Sintomas:** O servidor conecta, mas nenhuma ferramenta está disponível

**Solução de problemas:**

1. **Verifique o registro de ferramentas:** Garanta que seu servidor realmente registra ferramentas
2. **Verifique o protocolo MCP:** Confirme se seu servidor implementa a listagem de ferramentas MCP corretamente
3. **Revise os logs do servidor:** Verifique a saída stderr para erros do lado do servidor
4. **Teste a listagem de ferramentas:** Teste manualmente o endpoint de descoberta de ferramentas do seu servidor

#### Ferramentas Não Executam

**Sintomas:** As ferramentas são descobertas, mas falham durante a execução

**Solução de problemas:**

1. **Validação de parâmetros:** Garanta que sua ferramenta aceita os parâmetros esperados
2. **Compatibilidade de schema:** Verifique se seus schemas de entrada são JSON Schema válidos
3. **Tratamento de erros:** Verifique se sua ferramenta está lançando exceções não tratadas
4. **Problemas de timeout:** Considere aumentar a configuração `timeout`

#### Compatibilidade com Sandbox

**Sintomas:** Os servidores MCP falham quando o sandbox está habilitado

**Soluções:**

1. **Servidores baseados em Docker:** Use contêineres Docker que incluam todas as dependências
2. **Acessibilidade de caminho:** Garanta que os executáveis do servidor estejam disponíveis no sandbox
3. **Acesso à rede:** Configure o sandbox para permitir as conexões de rede necessárias
4. **Variáveis de ambiente:** Verifique se as variáveis de ambiente necessárias são repassadas

### Dicas de Depuração

1. **Habilite o modo debug:** Execute a CLI com `--debug` para saída detalhada
2. **Verifique o stderr:** O stderr do servidor MCP é capturado e registrado no log (mensagens INFO são filtradas)
3. **Teste isolado:** Teste seu servidor MCP independentemente antes de integrar
4. **Configuração incremental:** Comece com ferramentas simples antes de adicionar funcionalidades complexas
5. **Use `/mcp` frequentemente:** Monitore o status do servidor durante o desenvolvimento

## Notas Importantes

### Considerações de Segurança

- **Configurações de confiança:** A opção `trust` ignora todos os diálogos de confirmação. Use com cautela e apenas para servidores que você controla completamente
- **Tokens de acesso:** Tenha cuidado com a segurança ao configurar variáveis de ambiente que contêm chaves de API ou tokens
- **Compatibilidade com sandbox:** Ao usar sandbox, garanta que os servidores MCP estejam disponíveis dentro do ambiente de sandbox
- **Dados privados:** Usar tokens de acesso pessoal com escopo amplo pode levar ao vazamento de informações entre repositórios

### Gerenciamento de Performance e Recursos

- **Persistência de conexão:** A CLI mantém conexões persistentes com servidores que registram ferramentas com sucesso
- **Limpeza automática:** Conexões com servidores que não fornecem ferramentas são fechadas automaticamente
- **Gerenciamento de timeout:** Configure timeouts apropriados com base nas características de resposta do seu servidor
- **Monitoramento de recursos:** Os servidores MCP são executados como processos separados e consomem recursos do sistema

### Compatibilidade de Schema

- **Modo de conformidade de schema:** Por padrão (`schemaCompliance: "auto"`), os schemas das ferramentas são repassados como estão. Defina `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` no seu `settings.json` para converter modelos para o formato Strict OpenAPI 3.0.
- **Transformações OpenAPI 3.0:** Quando o modo `openapi_30` está habilitado, o sistema lida com:
  - Tipos anuláveis: `["string", "null"]` -> `type: "string", nullable: true`
  - Valores constantes: `const: "foo"` -> `enum: ["foo"]`
  - Limites exclusivos: `exclusiveMinimum` numérico -> forma booleana com `minimum`
  - Remoção de palavras-chave: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Limpeza de nomes:** Os nomes das ferramentas são automaticamente limpos para atender aos requisitos da API
- **Resolução de conflitos:** Conflitos de nomes de ferramentas entre servidores são resolvidos por meio de prefixação automática

Essa integração abrangente torna os servidores MCP uma maneira poderosa de estender os recursos da CLI, mantendo segurança, confiabilidade e facilidade de uso.

## Retornando Conteúdo Rico de Ferramentas

As ferramentas MCP não se limitam a retornar texto simples. Você pode retornar conteúdo rico e multiparte, incluindo texto, imagens, áudio e outros dados binários em uma única resposta de ferramenta. Isso permite criar ferramentas poderosas que podem fornecer informações diversificadas ao modelo em uma única interação.

Todos os dados retornados pela ferramenta são processados e enviados ao modelo como contexto para sua próxima geração, permitindo que ele raciocine ou resuma as informações fornecidas.

### Como Funciona

Para retornar conteúdo rico, a resposta da sua ferramenta deve aderir à especificação MCP para um [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). O campo `content` do resultado deve ser um array de objetos `ContentBlock`. A CLI processará corretamente esse array, separando texto de dados binários e empacotando-o para o modelo.

Você pode combinar diferentes tipos de blocos de conteúdo no array `content`. Os tipos de blocos suportados incluem:

- `text`
- `image`
- `audio`
- `resource` (embedded content)
- `resource_link`

### Exemplo: Retornando Texto e uma Imagem

Aqui está um exemplo de uma resposta JSON válida de uma ferramenta MCP que retorna tanto uma descrição em texto quanto uma imagem:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Here is the logo you requested."
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "The logo was created in 2025."
    }
  ]
}
```

Quando o Qwen Code recebe essa resposta, ele irá:

1.  Extrair todo o texto e combiná-lo em uma única parte `functionResponse` para o modelo.
2.  Apresentar os dados da imagem como uma parte `inlineData` separada.
3.  Fornecer um resumo limpo e amigável na CLI, indicando que tanto texto quanto uma imagem foram recebidos.

Isso permite que você crie ferramentas sofisticadas que podem fornecer contexto rico e multimodal ao modelo Qwen.

## Prompts MCP como Comandos de Barra

Além de ferramentas, os servidores MCP podem expor prompts predefinidos que podem ser executados como comandos de barra dentro do Qwen Code. Isso permite criar atalhos para consultas comuns ou complexas que podem ser facilmente invocadas pelo nome.

### Definindo Prompts no Servidor

Aqui está um pequeno exemplo de um servidor MCP stdio que define prompts:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

server.registerPrompt(
  'poem-writer',
  {
    title: 'Poem Writer',
    description: 'Write a nice haiku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Write a haiku${mood ? ` with the mood ${mood}` : ''} called ${title}. Note that a haiku is 5 syllables followed by 7 syllables followed by 5 syllables `,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Isso pode ser incluído no `settings.json` sob `mcpServers` com:

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["filename.ts"]
    }
  }
}
```

### Invocando Prompts

Uma vez que um prompt é descoberto, você pode invocá-lo usando seu nome como um comando de barra. A CLI lidará automaticamente com a análise dos argumentos.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, usando argumentos posicionais:

```bash
/poem-writer "Qwen Code" reverent
```

Ao executar este comando, a CLI executa o método `prompts/get` no servidor MCP com os argumentos fornecidos. O servidor é responsável por substituir os argumentos no modelo de prompt e retornar o texto final do prompt. A CLI então envia esse prompt ao modelo para execução. Isso fornece uma maneira conveniente de automatizar e compartilhar fluxos de trabalho comuns.

## Gerenciando Servidores MCP com `qwen mcp`

Embora você sempre possa configurar servidores MCP editando manualmente seu arquivo `settings.json`, a CLI fornece um conjunto conveniente de comandos para gerenciar suas configurações de servidor programaticamente. Esses comandos simplificam o processo de adicionar, listar e remover servidores MCP sem a necessidade de editar arquivos JSON diretamente.

### Adicionando um Servidor (`qwen mcp add`)

O comando `add` configura um novo servidor MCP no seu `settings.json`. Com base no escopo (`-s, --scope`), ele será adicionado à configuração do usuário `~/.qwen/settings.json` ou à configuração do projeto `.qwen/settings.json`.

**Comando:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: Um nome exclusivo para o servidor.
- `<commandOrUrl>`: O comando a ser executado (para `stdio`) ou a URL (para `http`/`sse`).
- `[args...]`: Argumentos opcionais para um comando `stdio`.

**Opções (Flags):**

- `-s, --scope`: Escopo da configuração (usuário ou projeto). [padrão: "project"]
- `-t, --transport`: Tipo de transporte (stdio, sse, http). [padrão: "stdio"]
- `-e, --env`: Define variáveis de ambiente (ex.: -e KEY=value).
- `-H, --header`: Define cabeçalhos HTTP para transportes SSE e HTTP (ex.: -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: Define o timeout de conexão em milissegundos.
- `--trust`: Confia no servidor (ignora todos os prompts de confirmação de chamada de ferramenta).
- `--description`: Define a descrição do servidor.
- `--include-tools`: Uma lista separada por vírgulas de ferramentas a incluir.
- `--exclude-tools`: Uma lista separada por vírgulas de ferramentas a excluir.
- `--oauth-client-id`: Client ID OAuth para autenticação do servidor MCP.
- `--oauth-client-secret`: Client secret OAuth para autenticação do servidor MCP.
- `--oauth-redirect-uri`: URI de redirecionamento OAuth (ex.: `https://your-server.com/oauth/callback`). Padrão é `http://localhost:7777/oauth/callback` para configurações locais. **Importante para implantações remotas**: Ao executar o Qwen Code em servidores remotos/nuvem, defina isso para uma URL publicamente acessível.
- `--oauth-authorization-url`: URL de autorização OAuth.
- `--oauth-token-url`: URL de token OAuth.
- `--oauth-scopes`: Scopes OAuth (separados por vírgula).

#### Adicionando um servidor stdio

Este é o transporte padrão para executar servidores locais.

```bash
# Basic syntax
qwen mcp add <name> <command> [args...]

# Example: Adding a local server
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Example: Adding a local python server
qwen mcp add python-server python server.py --port 8080
```

#### Adicionando um servidor HTTP

Este transporte é para servidores que usam o transporte HTTP streamable.

```bash
# Basic syntax
qwen mcp add --transport http <name> <url>

# Example: Adding an HTTP server
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Example: Adding an HTTP server with an authentication header
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Adicionando um servidor SSE

Este transporte é para servidores que usam Server-Sent Events (SSE).

```bash
# Basic syntax
qwen mcp add --transport sse <name> <url>

# Example: Adding an SSE server
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Example: Adding an SSE server with an authentication header
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Example: Adding an OAuth-enabled SSE server
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### Gerenciando Servidores (`qwen mcp`)

Para visualizar e gerenciar todos os servidores MCP atualmente configurados, use o comando `manage` ou simplesmente `qwen mcp`. Isso abre um diálogo TUI interativo onde você pode:

- Visualizar todos os servidores MCP com seu status de conexão
- Habilitar/desabilitar servidores
- Reconectar a servidores desconectados
- Visualizar ferramentas e prompts fornecidos por cada servidor
- Visualizar logs do servidor

**Comando:**

```bash
qwen mcp
# or
qwen mcp manage
```

O diálogo de gerenciamento fornece uma interface visual mostrando o nome de cada servidor, detalhes de configuração, status de conexão e ferramentas/prompts disponíveis.

### Removendo um Servidor (`qwen mcp remove`)

Para excluir um servidor da sua configuração, use o comando `remove` com o nome do servidor.

**Comando:**

```bash
qwen mcp remove <name>
```

**Exemplo:**

```bash
qwen mcp remove my-server
```

Isso encontrará e excluirá a entrada "my-server" do objeto `mcpServers` no arquivo `settings.json` apropriado, com base no escopo (`-s, --scope`).