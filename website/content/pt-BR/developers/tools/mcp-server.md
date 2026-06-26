# Servidores MCP com Qwen Code

Este documento fornece um guia para configurar e usar servidores Model Context Protocol (MCP) com Qwen Code.

## O que é um servidor MCP?

Um servidor MCP é uma aplicação que expõe ferramentas e recursos para a CLI através do Model Context Protocol, permitindo que ela interaja com sistemas externos e fontes de dados. Os servidores MCP atuam como uma ponte entre o modelo e seu ambiente local ou outros serviços como APIs.

Um servidor MCP permite que a CLI:

- **Descobrir ferramentas:** Listar ferramentas disponíveis, suas descrições e parâmetros através de definições de esquema padronizadas.
- **Executar ferramentas:** Chamar ferramentas específicas com argumentos definidos e receber respostas estruturadas.
- **Acessar recursos:** Ler dados de recursos específicos (embora a CLI foque principalmente na execução de ferramentas).

Com um servidor MCP, você pode estender as capacidades da CLI para realizar ações além de seus recursos integrados, como interagir com bancos de dados, APIs, scripts personalizados ou fluxos de trabalho especializados.

## Arquitetura de Integração Central

Qwen Code integra-se com servidores MCP através de um sistema sofisticado de descoberta e execução incorporado ao pacote principal (`packages/core/src/tools/`):

### Camada de Descoberta (`mcp-client.ts`)

O processo de descoberta é orquestrado por `discoverMcpTools()`, que:

1. **Itera pelos servidores configurados** a partir da sua configuração `mcpServers` no `settings.json`
2. **Estabelece conexões** usando mecanismos de transporte apropriados (Stdio, SSE ou Streamable HTTP)
3. **Obtém definições de ferramentas** de cada servidor usando o protocolo MCP
4. **Sanitiza e valida** esquemas de ferramentas para compatibilidade com a API Qwen
5. **Registra ferramentas** no registro global de ferramentas com resolução de conflitos

### Camada de Execução (`mcp-tool.ts`)

Cada ferramenta MCP descoberta é encapsulada em uma instância de `DiscoveredMCPTool` que:

- **Gerencia a lógica de confirmação** com base nas configurações de confiança do servidor e preferências do usuário
- **Gerencia a execução da ferramenta** chamando o servidor MCP com os parâmetros adequados
- **Processa respostas** tanto para o contexto do LLM quanto para exibição ao usuário
- **Mantém o estado da conexão** e lida com timeouts

### Mecanismos de Transporte

A CLI suporta três tipos de transporte MCP:

- **Transporte Stdio:** Gera um subprocesso e se comunica via stdin/stdout
- **Transporte SSE:** Conecta-se a endpoints Server-Sent Events
- **Transporte HTTP Streamable:** Usa streaming HTTP para comunicação

## Como configurar seu servidor MCP

Qwen Code usa a configuração `mcpServers` no seu arquivo `settings.json` para localizar e conectar-se a servidores MCP. Essa configuração suporta múltiplos servidores com diferentes mecanismos de transporte.

### Configure o servidor MCP no settings.json

Você pode configurar servidores MCP no seu arquivo `settings.json` de duas maneiras principais: através do objeto `mcpServers` de nível superior para definições específicas de servidor, e através do objeto `mcp` para configurações globais que controlam a descoberta e execução de servidores.

#### Configurações Globais MCP (`mcp`)

O objeto `mcp` no seu `settings.json` permite definir regras globais para todos os servidores MCP.

- **`mcp.serverCommand`** (string): Um comando global para iniciar um servidor MCP.
- **`mcp.allowed`** (array de strings): Uma lista de nomes de servidores MCP permitidos. Se definido, apenas servidores desta lista (correspondentes às chaves no objeto `mcpServers`) serão conectados.
- **`mcp.excluded`** (array de strings): Uma lista de nomes de servidores MCP a excluir. Servidores nesta lista não serão conectados.

**Exemplo:**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### Configuração Específica do Servidor (`mcpServers`)

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

#### Obrigatório (um dos seguintes)

- **`command`** (string): Caminho para o executável para transporte Stdio
- **`url`** (string): URL do endpoint SSE (ex.: `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): URL do endpoint HTTP streaming

#### Opcional

- **`args`** (string[]): Argumentos de linha de comando para transporte Stdio
- **`headers`** (object): Cabeçalhos HTTP personalizados ao usar `url` ou `httpUrl`
- **`env`** (object): Variáveis de ambiente para o processo do servidor. Valores podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (string): Diretório de trabalho para transporte Stdio
- **`timeout`** (number): Timeout de requisição em milissegundos (padrão: 600.000ms = 10 minutos)
- **`trust`** (boolean): Quando `true`, ignora todas as confirmações de chamada de ferramenta para este servidor (padrão: `false`)
- **`includeTools`** (string[]): Lista de nomes de ferramentas a incluir deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis deste servidor (comportamento de lista de permissões). Se não for especificado, todas as ferramentas do servidor são habilitadas por padrão.
- **`excludeTools`** (string[]): Lista de nomes de ferramentas a excluir deste servidor MCP. Ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor. **Nota:** `excludeTools` tem precedência sobre `includeTools` - se uma ferramenta estiver em ambas as listas, ela será excluída.
- **`targetAudience`** (string): O ID do Cliente OAuth na lista de permissões do aplicativo protegido por IAP que você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud a ser personificada. Usado com `authProviderType: 'service_account_impersonation'`.
### Suporte OAuth para Servidores MCP Remotos

O Qwen Code oferece suporte à autenticação OAuth 2.0 para servidores MCP remotos usando transportes SSE ou HTTP. Isso permite acesso seguro a servidores MCP que exigem autenticação.

#### Descoberta Automática de OAuth

Para servidores que suportam descoberta de OAuth, você pode omitir a configuração de OAuth e deixar que a CLI descubra automaticamente:

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

- Detectar quando um servidor requer autenticação OAuth (respostas 401)
- Descobrir endpoints OAuth a partir dos metadados do servidor
- Realizar registro dinâmico de cliente, se compatível
- Gerenciar o fluxo OAuth e o gerenciamento de tokens

#### Fluxo de Autenticação

Ao conectar a um servidor com OAuth habilitado:

1. **Tentativa de conexão inicial** falha com 401 Não Autorizado
2. **Descoberta OAuth** encontra endpoints de autorização e token
3. **Navegador abre** para autenticação do usuário (requer acesso ao navegador local)
4. **Código de autorização** é trocado por tokens de acesso
5. **Tokens são armazenados** com segurança para uso futuro
6. **Nova tentativa de conexão** é bem-sucedida com tokens válidos

#### Requisitos de Redirecionamento do Navegador

**Importante:** A autenticação OAuth exige que o URI de redirecionamento seja acessível:

- **Comportamento padrão**: Redireciona para `http://localhost:7777/oauth/callback` (funciona para configurações locais)
- **URI de redirecionamento personalizado**: Use `--oauth-redirect-uri` ou configure `redirectUri` no settings.json para especificar uma URL diferente

Para **implantações de servidor remoto/nuvem** (por exemplo, terminais web, sessões SSH, IDEs em nuvem):

- O redirecionamento padrão `localhost` NÃO funcionará
- Você DEVE configurar um `redirectUri` personalizado apontando para uma URL publicamente acessível
- O navegador do usuário deve ser capaz de acessar esta URL e redirecionar de volta ao servidor

Exemplo para servidores remotos:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth não funcionará em:

- Ambientes headless sem acesso ao navegador
- Ambientes onde o `redirectUri` configurado está inacessível a partir do navegador do usuário

#### Gerenciando a Autenticação OAuth

Use o diálogo `/mcp` dentro de uma sessão interativa do Qwen Code para inspecionar servidores MCP e gerenciar a autenticação OAuth.

#### Propriedades de Configuração OAuth

- **`enabled`** (booleano): Habilita OAuth para este servidor
- **`clientId`** (string): Identificador do cliente OAuth (opcional com registro dinâmico)
- **`clientSecret`** (string): Segredo do cliente OAuth (opcional para clientes públicos)
- **`authorizationUrl`** (string): Endpoint de autorização OAuth (descoberto automaticamente se omitido)
- **`tokenUrl`** (string): Endpoint de token OAuth (descoberto automaticamente se omitido)
- **`scopes`** (string[]): Escopos OAuth necessários
- **`redirectUri`** (string): URI de redirecionamento personalizado. **Crítico para implantações remotas**: O padrão é `http://localhost:7777/oauth/callback`. Ao executar o Qwen Code em servidores remotos/nuvem, defina isso como uma URL publicamente acessível (ex.: `https://seu-servidor.com/oauth/callback`). Pode ser configurado via `qwen mcp add --oauth-redirect-uri` ou diretamente no settings.json.
- **`tokenParamName`** (string): Nome do parâmetro de consulta para tokens em URLs SSE
- **`audiences`** (string[]): Audiências para as quais o token é válido

#### Gerenciamento de Tokens

Os tokens OAuth são automaticamente:

- **Armazenados** em `~/.qwen/mcp-oauth-tokens.json` (texto simples, permissão 0600) por padrão. Se `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` estiver definido, o Qwen Code usa armazenamento com suporte a keychain quando disponível, ou `~/.qwen/mcp-oauth-tokens-v2.json` com criptografia AES-256-GCM.
- **Atualizados** quando expirados (se tokens de atualização estiverem disponíveis)
- **Validados** antes de cada tentativa de conexão
- **Limpados** quando inválidos ou expirados

> [!WARNING]
> Por padrão, os tokens OAuth são armazenados sem criptografia no disco. Em máquinas compartilhadas ou multiusuário, defina `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` para proteger as credenciais.

#### Tipo de Provedor de Autenticação

Você pode especificar o tipo de provedor de autenticação usando a propriedade `authProviderType`:

- **`authProviderType`** (string): Especifica o provedor de autenticação. Pode ser um dos seguintes:
  - **`dynamic_discovery`** (padrão): A CLI descobrirá automaticamente a configuração OAuth do servidor.
  - **`google_credentials`**: A CLI usará as Credenciais Padrão do Google (ADC) para autenticar no servidor. Ao usar este provedor, você deve especificar os escopos necessários.
  - **`service_account_impersonation`**: A CLI assumirá a identidade de uma Conta de Serviço do Google Cloud para autenticar no servidor. Isso é útil para acessar serviços protegidos por IAP (foi projetado especificamente para serviços Cloud Run).

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
#### Impersonação de Conta de Serviço

Para autenticar com um servidor usando Impersonação de Conta de Serviço, você deve definir `authProviderType` como `service_account_impersonation` e fornecer as seguintes propriedades:

- **`targetAudience`** (string): O ID do Cliente OAuth autorizado na lista de permissões do aplicativo protegido por IAP que você está tentando acessar.
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud a ser impersonada.

A CLI usará suas Credenciais Padrão de Aplicativo (ADC) locais para gerar um token de ID OIDC para a conta de serviço e público-alvo especificados. Esse token será então usado para autenticar com o servidor MCP.

#### Instruções de Configuração

1. **[Crie](https://cloud.google.com/iap/docs/oauth-client-creation) ou use um ID de cliente OAuth 2.0 existente.** Para usar um ID de cliente OAuth 2.0 existente, siga as etapas em [Como compartilhar Clientes OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Adicione o ID OAuth à lista de permissões para [acesso programático](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) do aplicativo.** Como o Cloud Run ainda não é um tipo de recurso compatível no gcloud iap, você deve adicionar o ID do Cliente à lista de permissões no projeto.
3. **Crie uma conta de serviço.** [Documentação](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Link do Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Adicione tanto a conta de serviço quanto os usuários à Política IAP** na guia "Segurança" do próprio serviço Cloud Run ou via gcloud.
5. **Conceda a todos os usuários e grupos** que acessarão o Servidor MCP as permissões necessárias para [impersonar a conta de serviço](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (ou seja, `roles/iam.serviceAccountTokenCreator`).
6. **[Ative](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) a API IAM Credentials** para seu projeto.

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

### Servidor MCP SSE com Impersonação de SA

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

Quando o Qwen Code inicia, ele realiza a descoberta do servidor MCP através do seguinte processo detalhado:

### 1. Iteração e Conexão do Servidor

Para cada servidor configurado em `mcpServers`:

1. **O monitoramento de status começa:** O status do servidor é definido como `CONNECTING`
2. **Seleção de transporte:** Com base nas propriedades de configuração:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Estabelecimento de conexão:** O cliente MCP tenta conectar com o timeout configurado
4. **Tratamento de erros:** Falhas de conexão são registradas e o status do servidor é definido como `DISCONNECTED`

### 2. Descoberta de Ferramentas

Após conexão bem-sucedida:

1. **Listagem de ferramentas:** O cliente chama o endpoint de listagem de ferramentas do servidor MCP
2. **Validação de esquema:** A declaração de função de cada ferramenta é validada
3. **Filtragem de ferramentas:** As ferramentas são filtradas com base na configuração `includeTools` e `excludeTools`
4. **Sanitização de nomes:** Os nomes das ferramentas são limpos para atender aos requisitos da API Qwen:
   - Caracteres inválidos (não alfanuméricos, sublinhado, ponto, hífen) são substituídos por sublinhados
   - Nomes com mais de 63 caracteres são truncados com substituição no meio (`___`)
### 3. Resolução de Conflitos

Quando vários servidores expõem ferramentas com o mesmo nome:

1. **Primeiro registro vence:** O primeiro servidor a registrar um nome de ferramenta fica com o nome sem prefixo
2. **Prefixo automático:** Servidores subsequentes recebem nomes prefixados: `serverName__toolName`
3. **Registro de rastreamento:** O registro de ferramentas mantém mapeamentos entre nomes de servidores e suas ferramentas

### 4. Processamento de Esquemas

Os esquemas de parâmetros das ferramentas passam por sanitização para compatibilidade com a API:

- **Propriedades `$schema`** são removidas
- **`additionalProperties`** são removidos
- **`anyOf` com `default`** têm seus valores padrão removidos (compatibilidade com Vertex AI)
- **Processamento recursivo** se aplica a esquemas aninhados

### 5. Gerenciamento de Conexões

Após a descoberta:

- **Conexões persistentes:** Servidores que registram ferramentas com sucesso mantêm suas conexões
- **Limpeza:** Servidores que não fornecem ferramentas utilizáveis têm suas conexões fechadas
- **Atualizações de status:** Os status finais dos servidores são definidos como `CONNECTED` ou `DISCONNECTED`

## Fluxo de Execução de Ferramentas

Quando o modelo decide usar uma ferramenta MCP, o seguinte fluxo de execução ocorre:

### 1. Invocação de Ferramenta

O modelo gera um `FunctionCall` com:

- **Nome da ferramenta:** O nome registrado (potencialmente prefixado)
- **Argumentos:** Objeto JSON correspondente ao esquema de parâmetros da ferramenta

### 2. Processo de Confirmação

Cada `DiscoveredMCPTool` implementa lógica de confirmação sofisticada:

#### Ignorar por Confiança

```typescript
if (this.trust) {
  return false; // Nenhuma confirmação necessária
}
```

#### Lista de Permissão Dinâmica

O sistema mantém listas de permissão internas para:

- **Nível do servidor:** `serverName` → Todas as ferramentas deste servidor são confiáveis
- **Nível da ferramenta:** `serverName.toolName` → Esta ferramenta específica é confiável

#### Manipulação de Escolha do Usuário

Quando a confirmação é necessária, os usuários podem escolher:

- **Prosseguir uma vez:** Executar apenas esta vez
- **Sempre permitir esta ferramenta:** Adicionar à lista de permissão no nível da ferramenta
- **Sempre permitir este servidor:** Adicionar à lista de permissão no nível do servidor
- **Cancelar:** Abortar a execução

### 3. Execução

Após a confirmação (ou ignorar por confiança):

1. **Preparação dos parâmetros:** Os argumentos são validados contra o esquema da ferramenta
2. **Chamada MCP:** O `CallableTool` subjacente invoca o servidor com:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Nome original da ferramenta do servidor
       args: params,
     },
   ];
   ```

3. **Processamento da resposta:** Os resultados são formatados tanto para o contexto do LLM quanto para exibição ao usuário

### 4. Tratamento de Resposta

O resultado da execução contém:

- **`llmContent`:** Partes brutas da resposta para o contexto do modelo de linguagem
- **`returnDisplay`:** Saída formatada para exibição ao usuário (geralmente JSON em blocos de código markdown)

## Como interagir com seu servidor MCP

### Usando o Comando `/mcp`

O comando `/mcp` fornece informações abrangentes sobre sua configuração de servidor MCP:

```bash
/mcp
```

Isso exibe:

- **Lista de servidores:** Todos os servidores MCP configurados
- **Status da conexão:** `CONNECTED`, `CONNECTING` ou `DISCONNECTED`
- **Detalhes do servidor:** Resumo da configuração (excluindo dados sensíveis)
- **Ferramentas disponíveis:** Lista de ferramentas de cada servidor com descrições
- **Estado da descoberta:** Status geral do processo de descoberta

### Exemplo de Saída `/mcp`

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

Uma vez descobertas, as ferramentas MCP ficam disponíveis para o modelo Qwen como ferramentas integradas. O modelo automaticamente irá:

1. **Selecionar ferramentas apropriadas** com base em suas solicitações
2. **Apresentar diálogos de confirmação** (a menos que o servidor seja confiável)
3. **Executar ferramentas** com os parâmetros adequados
4. **Exibir resultados** em um formato amigável ao usuário

## Monitoramento de Status e Solução de Problemas

### Estados de Conexão

A integração MCP rastreia vários estados:

#### Status do Servidor (`MCPServerStatus`)

- **`DISCONNECTED`:** O servidor não está conectado ou possui erros
- **`CONNECTING`:** Tentativa de conexão em andamento
- **`CONNECTED`:** O servidor está conectado e pronto

#### Estado de Descoberta (`MCPDiscoveryState`)

- **`NOT_STARTED`:** A descoberta não foi iniciada
- **`IN_PROGRESS`:** Atualmente descobrindo servidores
- **`COMPLETED`:** Descoberta finalizada (com ou sem erros)

### Problemas Comuns e Soluções

#### Servidor Não Conecta

**Sintomas:** O servidor mostra status `DISCONNECTED`

**Solução de problemas:**

1. **Verifique a configuração:** Confirme se `command`, `args` e `cwd` estão corretos
2. **Teste manualmente:** Execute o comando do servidor diretamente para garantir que funciona
3. **Verifique as dependências:** Certifique-se de que todos os pacotes necessários estão instalados
4. **Revise os logs:** Procure mensagens de erro na saída do CLI
5. **Verifique as permissões:** Garanta que o CLI pode executar o comando do servidor
#### Nenhuma Ferramenta Descoberta

**Sintomas:** O servidor conecta, mas nenhuma ferramenta está disponível

**Solução de problemas:**

1. **Verifique o registro de ferramentas:** Certifique-se de que seu servidor realmente registra ferramentas
2. **Verifique o protocolo MCP:** Confirme que seu servidor implementa corretamente a listagem de ferramentas do MCP
3. **Revise os logs do servidor:** Verifique a saída de stderr para erros no lado do servidor
4. **Teste a listagem de ferramentas:** Teste manualmente o endpoint de descoberta de ferramentas do seu servidor

#### Ferramentas Não Executando

**Sintomas:** As ferramentas são descobertas, mas falham durante a execução

**Solução de problemas:**

1. **Validação de parâmetros:** Certifique-se de que sua ferramenta aceita os parâmetros esperados
2. **Compatibilidade de esquema:** Verifique se seus esquemas de entrada são JSON Schema válidos
3. **Tratamento de erros:** Verifique se sua ferramenta está lançando exceções não tratadas
4. **Problemas de timeout:** Considere aumentar a configuração de `timeout`

#### Compatibilidade com Sandbox

**Sintomas:** Servidores MCP falham quando o sandbox está ativado

**Soluções:**

1. **Servidores baseados em Docker:** Use contêineres Docker que incluam todas as dependências
2. **Acessibilidade de caminho:** Certifique-se de que os executáveis do servidor estejam disponíveis no sandbox
3. **Acesso à rede:** Configure o sandbox para permitir conexões de rede necessárias
4. **Variáveis de ambiente:** Verifique se as variáveis de ambiente necessárias são transmitidas

### Dicas de Depuração

1. **Ative o modo de depuração:** Execute a CLI com `--debug` para saída detalhada
2. **Verifique o stderr:** O stderr do servidor MCP é capturado e registrado (mensagens INFO filtradas)
3. **Teste isoladamente:** Teste seu servidor MCP de forma independente antes de integrar
4. **Configuração incremental:** Comece com ferramentas simples antes de adicionar funcionalidades complexas
5. **Use `/mcp` com frequência:** Monitore o status do servidor durante o desenvolvimento

## Notas Importantes

### Considerações de Segurança

- **Configurações de confiança:** A opção `trust` ignora todas as caixas de diálogo de confirmação. Use com cautela e apenas para servidores que você controla completamente
- **Tokens de acesso:** Tenha consciência de segurança ao configurar variáveis de ambiente contendo chaves de API ou tokens
- **Compatibilidade com sandbox:** Ao usar sandbox, certifique-se de que os servidores MCP estejam disponíveis dentro do ambiente do sandbox
- **Dados privados:** Usar tokens de acesso pessoal com escopo amplo pode levar ao vazamento de informações entre repositórios

### Gerenciamento de Desempenho e Recursos

- **Persistência de conexão:** A CLI mantém conexões persistentes com servidores que registram ferramentas com sucesso
- **Limpeza automática:** Conexões com servidores que não fornecem ferramentas são fechadas automaticamente
- **Gerenciamento de timeout:** Configure timeouts apropriados com base nas características de resposta do seu servidor
- **Monitoramento de recursos:** Servidores MCP são executados como processos separados e consomem recursos do sistema

### Compatibilidade de Esquema

- **Modo de conformidade de esquema:** Por padrão (`schemaCompliance: "auto"`), os esquemas das ferramentas são passados como estão. Defina `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` no seu `settings.json` para converter modelos para o formato Strict OpenAPI 3.0.
- **Transformações OpenAPI 3.0:** Quando o modo `openapi_30` está ativado, o sistema lida com:
  - Tipos anuláveis: `["string", "null"]` -> `type: "string", nullable: true`
  - Valores const: `const: "foo"` -> `enum: ["foo"]`
  - Limites exclusivos: `exclusiveMinimum` numérico -> forma booleana com `minimum`
  - Remoção de palavras-chave: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Sanitização de nomes:** Nomes de ferramentas são automaticamente sanitizados para atender aos requisitos da API
- **Resolução de conflitos:** Conflitos de nomes de ferramentas entre servidores são resolvidos através de prefixação automática

Esta integração abrangente torna os servidores MCP uma forma poderosa de estender as capacidades da CLI, mantendo segurança, confiabilidade e facilidade de uso.

## Retornando Conteúdo Rico de Ferramentas

As ferramentas MCP não se limitam a retornar texto simples. Você pode retornar conteúdo rico de múltiplas partes, incluindo texto, imagens, áudio e outros dados binários em uma única resposta da ferramenta. Isso permite construir ferramentas poderosas que podem fornecer informações diversas ao modelo em uma única iteração.

Todos os dados retornados pela ferramenta são processados e enviados ao modelo como contexto para sua próxima geração, permitindo que ele raciocine ou resuma as informações fornecidas.

### Como Funciona

Para retornar conteúdo rico, a resposta da sua ferramenta deve aderir à especificação MCP para um [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). O campo `content` do resultado deve ser um array de objetos `ContentBlock`. A CLI processará corretamente esse array, separando texto de dados binários e empacotando para o modelo.

Você pode misturar e combinar diferentes tipos de blocos de conteúdo no array `content`. Os tipos de blocos suportados incluem:

- `text`
- `image`
- `audio`
- `resource` (conteúdo incorporado)
- `resource_link`

### Exemplo: Retornando Texto e uma Imagem

Aqui está um exemplo de uma resposta JSON válida de uma ferramenta MCP que retorna tanto uma descrição textual quanto uma imagem:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Aqui está o logotipo que você solicitou."
    },
    {
      "type": "image",
      "data": "DADOS_DA_IMAGEM_CODIFICADOS_EM_BASE64_AQUI",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "O logotipo foi criado em 2025."
    }
  ]
}
```
Quando o Qwen Code recebe essa resposta, ele:

1.  Extrai todo o texto e combina em uma única parte `functionResponse` para o modelo.
2.  Apresenta os dados da imagem como uma parte separada `inlineData`.
3.  Fornece um resumo limpo e amigável no CLI, indicando que tanto texto quanto imagem foram recebidos.

Isso permite que você construa ferramentas sofisticadas que podem fornecer contexto multimodal rico ao modelo Qwen.

## Comandos Slash de Prompts MCP

Além de ferramentas, servidores MCP podem expor prompts predefinidos que podem ser executados como comandos slash no Qwen Code. Isso permite criar atalhos para consultas comuns ou complexas que podem ser facilmente invocadas pelo nome.

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

Isso pode ser incluído no `settings.json` em `mcpServers` com:

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

Uma vez que um prompt é descoberto, você pode invocá-lo usando seu nome como um comando slash. O CLI lidará automaticamente com a análise dos argumentos.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, usando argumentos posicionais:

```bash
/poem-writer "Qwen Code" reverent
```

Quando você executa este comando, o CLI executa o método `prompts/get` no servidor MCP com os argumentos fornecidos. O servidor é responsável por substituir os argumentos no template do prompt e retornar o texto final do prompt. O CLI então envia esse prompt para o modelo para execução. Isso fornece uma maneira conveniente de automatizar e compartilhar fluxos de trabalho comuns.

## Gerenciando Servidores MCP com `qwen mcp`

Embora você possa sempre configurar servidores MCP editando manualmente o arquivo `settings.json`, o CLI fornece um conjunto conveniente de comandos para gerenciar suas configurações de servidor de forma programática. Esses comandos simplificam o processo de adicionar, listar e remover servidores MCP sem a necessidade de editar diretamente arquivos JSON.

### Adicionando um Servidor (`qwen mcp add`)

O comando `add` configura um novo servidor MCP no seu `settings.json`. Com base no escopo (`-s, --scope`), ele será adicionado ao config do usuário `~/.qwen/settings.json` ou ao config do projeto `.qwen/settings.json`.

**Comando:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: Um nome único para o servidor.
- `<commandOrUrl>`: O comando a ser executado (para `stdio`) ou a URL (para `http`/`sse`).
- `[args...]`: Argumentos opcionais para um comando `stdio`.

**Opções (Flags):**

- `-s, --scope`: Escopo da configuração (user ou project). [padrão: "project"]
- `-t, --transport`: Tipo de transporte (stdio, sse, http). [padrão: "stdio"]
- `-e, --env`: Definir variáveis de ambiente (ex.: -e KEY=value).
- `-H, --header`: Definir cabeçalhos HTTP para transportes SSE e HTTP (ex.: -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: Definir tempo limite de conexão em milissegundos.
- `--trust`: Confiar no servidor (dispensa todas as confirmações de chamada de ferramenta).
- `--description`: Definir a descrição do servidor.
- `--include-tools`: Uma lista separada por vírgulas de ferramentas a serem incluídas.
- `--exclude-tools`: Uma lista separada por vírgulas de ferramentas a serem excluídas.
- `--oauth-client-id`: ID do cliente OAuth para autenticação do servidor MCP.
- `--oauth-client-secret`: Segredo do cliente OAuth para autenticação do servidor MCP.
- `--oauth-redirect-uri`: URI de redirecionamento OAuth (ex.: `https://your-server.com/oauth/callback`). O padrão é `http://localhost:7777/oauth/callback` para configurações locais. **Importante para implantações remotas**: Ao executar o Qwen Code em servidores remotos/cloud, defina isso para uma URL publicamente acessível.
- `--oauth-authorization-url`: URL de autorização OAuth.
- `--oauth-token-url`: URL de token OAuth.
- `--oauth-scopes`: Escopos OAuth (separados por vírgula).

#### Adicionando um servidor stdio

Este é o transporte padrão para executar servidores locais.

```bash
# Syntax básica
qwen mcp add <name> <command> [args...]

# Exemplo: Adicionando um servidor local
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Exemplo: Adicionando um servidor python local
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

### Gerenciando servidores (`/mcp`)

Para visualizar e gerenciar todos os servidores MCP configurados atualmente, abra o diálogo `/mcp` dentro de uma sessão interativa do Qwen Code. Este diálogo permite que você:

- Visualize todos os servidores MCP com seu status de conexão
- Ative/desative servidores
- Reconecte-se a servidores desconectados
- Visualize ferramentas e prompts fornecidos por cada servidor
- Visualize logs do servidor

**Comando:**

```bash
qwen
```

Em seguida, digite:

```text
/mcp
```

O diálogo de gerenciamento fornece uma interface visual mostrando o nome de cada servidor, detalhes de configuração, status de conexão e ferramentas/prompts disponíveis.

### Removendo um servidor (`qwen mcp remove`)

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
