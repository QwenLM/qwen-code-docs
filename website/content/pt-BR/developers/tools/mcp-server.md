# Servidores MCP com Qwen Code

Este documento fornece um guia para configurar e usar servidores Model Context Protocol (MCP) com o Qwen Code.

## O que é um servidor MCP?

Um servidor MCP é uma aplicação que expõe ferramentas e recursos para a CLI através do Model Context Protocol, permitindo que ela interaja com sistemas externos e fontes de dados. Os servidores MCP atuam como uma ponte entre o modelo e seu ambiente local ou outros serviços, como APIs.

Um servidor MCP permite que a CLI:

- **Descubra ferramentas:** Liste as ferramentas disponíveis, suas descrições e parâmetros através de definições de esquema padronizadas.
- **Execute ferramentas:** Chame ferramentas específicas com argumentos definidos e receba respostas estruturadas.
- **Acesse recursos:** Leia dados de recursos específicos (embora a CLI se concentre principalmente na execução de ferramentas).

Com um servidor MCP, você pode estender as capacidades da CLI para realizar ações além de seus recursos integrados, como interagir com bancos de dados, APIs, scripts personalizados ou fluxos de trabalho especializados.

## Arquitetura de Integração Principal

O Qwen Code se integra com servidores MCP através de um sistema sofisticado de descoberta e execução incorporado no pacote principal (`packages/core/src/tools/`):

### Camada de Descoberta (`mcp-client.ts`)

O processo de descoberta é orquestrado por `discoverMcpTools()`, que:

1. **Itera pelos servidores configurados** a partir da sua configuração `mcpServers` no `settings.json`
2. **Estabelece conexões** usando mecanismos de transporte apropriados (Stdio, SSE ou HTTP Streamable)
3. **Busca definições de ferramentas** de cada servidor usando o protocolo MCP
4. **Sanitiza e valida** os esquemas das ferramentas para compatibilidade com a API Qwen
5. **Registra ferramentas** no registro global de ferramentas com resolução de conflitos

### Camada de Execução (`mcp-tool.ts`)

Cada ferramenta MCP descoberta é encapsulada em uma instância `DiscoveredMCPTool` que:

- **Lida com a lógica de confirmação** baseada nas configurações de confiança e preferências do usuário
- **Gerencia a execução da ferramenta** chamando o servidor MCP com os parâmetros adequados
- **Processa respostas** tanto para o contexto do LLM quanto para exibição ao usuário
- **Mantém o estado da conexão** e lida com timeouts

### Mecanismos de Transporte

A CLI suporta três tipos de transporte MCP:

- **Transporte Stdio:** Inicia um subprocesso e se comunica via stdin/stdout
- **Transporte SSE:** Conecta a endpoints Server-Sent Events
- **Transporte HTTP Streamable:** Usa streaming HTTP para comunicação

## Como configurar seu servidor MCP

O Qwen Code usa a configuração `mcpServers` no seu arquivo `settings.json` para localizar e conectar-se a servidores MCP. Essa configuração suporta múltiplos servidores com diferentes mecanismos de transporte.

### Configure o servidor MCP no settings.json

Você pode configurar servidores MCP no seu arquivo `settings.json` de duas formas principais: através do objeto `mcpServers` de nível superior para definições específicas de servidor, e através do objeto `mcp` para configurações globais que controlam a descoberta e execução de servidores.

#### Configurações Globais MCP (`mcp`)

O objeto `mcp` no seu `settings.json` permite que você defina regras globais para todos os servidores MCP.

- **`mcp.serverCommand`** (string): Um comando global para iniciar um servidor MCP.
- **`mcp.allowed`** (array de strings): Uma lista de nomes de servidores MCP permitidos. Se definido, apenas os servidores desta lista (correspondentes às chaves no objeto `mcpServers`) serão conectados.
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

#### Configuração Específica de Servidor (`mcpServers`)

O objeto `mcpServers` é onde você define cada servidor MCP individual que deseja que a CLI se conecte.

### Estrutura de Configuração

Adicione um objeto `mcpServers` ao seu arquivo `settings.json`:

```json
{ ...arquivo contém outros objetos de configuração
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
- **`httpUrl`** (string): URL do endpoint HTTP para streaming

#### Opcional

- **`args`** (string[]): Argumentos de linha de comando para transporte Stdio
- **`headers`** (object): Cabeçalhos HTTP personalizados ao usar `url` ou `httpUrl`
- **`env`** (object): Variáveis de ambiente para o processo do servidor. Valores podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (string): Diretório de trabalho para transporte Stdio
- **`timeout`** (number): Tempo limite da requisição em milissegundos (padrão: 600.000ms = 10 minutos)
- **`trust`** (boolean): Quando `true`, ignora todas as confirmações de chamada de ferramenta para este servidor (padrão: `false`)
- **`includeTools`** (string[]): Lista de nomes de ferramentas a serem incluídas deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis a partir deste servidor (comportamento de lista de permissões). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão.
- **`excludeTools`** (string[]): Lista de nomes de ferramentas a serem excluídas deste servidor MCP. Ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor. **Nota:** `excludeTools` tem precedência sobre `includeTools` - se uma ferramenta estiver em ambas as listas, ela será excluída.
- **`targetAudience`** (string): O Client ID OAuth permitido na lista de permissões do aplicativo protegido por IAP que você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud a ser personificada. Usado com `authProviderType: 'service_account_impersonation'`.

### Suporte OAuth para Servidores MCP Remotos

O Qwen Code suporta autenticação OAuth 2.0 para servidores MCP remotos usando transportes SSE ou HTTP. Isso permite acesso seguro a servidores MCP que exigem autenticação.

#### Descoberta Automática de OAuth

Para servidores que suportam descoberta OAuth, você pode omitir a configuração OAuth e deixar a CLI descobri-la automaticamente:

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

A CLI automaticamente:

- Detecta quando um servidor exige autenticação OAuth (respostas 401)
- Descobre os endpoints OAuth a partir dos metadados do servidor
- Realiza o registro dinâmico do cliente se suportado
- Lida com o fluxo OAuth e o gerenciamento de tokens

#### Fluxo de Autenticação

Ao conectar-se a um servidor com OAuth habilitado:

1. **A tentativa de conexão inicial** falha com 401 Não Autorizado
2. **A descoberta OAuth** encontra endpoints de autorização e token
3. **O navegador abre** para autenticação do usuário (requer acesso ao navegador local)
4. **O código de autorização** é trocado por tokens de acesso
5. **Os tokens são armazenados** com segurança para uso futuro
6. **A reconexão** é bem-sucedida com tokens válidos

#### Requisitos de Redirecionamento do Navegador

**Importante:** A autenticação OAuth exige que a URI de redirecionamento seja acessível:

- **Comportamento padrão**: Redireciona para `http://localhost:7777/oauth/callback` (funciona para configurações locais)
- **URI de redirecionamento personalizada**: Use `--oauth-redirect-uri` ou configure `redirectUri` no settings.json para especificar uma URL diferente

Para **implantações de servidor remoto/nuvem** (ex.: terminais web, sessões SSH, IDEs na nuvem):

- O redirecionamento padrão `localhost` NÃO funcionará
- Você DEVE configurar um `redirectUri` personalizado apontando para uma URL publicamente acessível
- O navegador do usuário deve conseguir alcançar esta URL e redirecionar de volta para o servidor

Exemplo para servidores remotos:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

O OAuth não funcionará em:

- Ambientes sem acesso a navegador (headless)
- Ambientes onde o `redirectUri` configurado é inacessível a partir do navegador do usuário

#### Gerenciando a Autenticação OAuth

Use o diálogo `/mcp` dentro de uma sessão interativa do Qwen Code para inspecionar servidores MCP e gerenciar a autenticação OAuth.

#### Propriedades de Configuração OAuth

- **`enabled`** (boolean): Habilita OAuth para este servidor
- **`clientId`** (string): Identificador do cliente OAuth (opcional com registro dinâmico)
- **`clientSecret`** (string): Segredo do cliente OAuth (opcional para clientes públicos)
- **`authorizationUrl`** (string): Endpoint de autorização OAuth (descoberto automaticamente se omitido)
- **`tokenUrl`** (string): Endpoint de token OAuth (descoberto automaticamente se omitido)
- **`scopes`** (string[]): Escopos OAuth necessários
- **`redirectUri`** (string): URI de redirecionamento personalizada. **Crítico para implantações remotas**: O padrão é `http://localhost:7777/oauth/callback`. Ao executar o Qwen Code em servidores remotos/nuvem, defina como uma URL publicamente acessível (ex.: `https://your-server.com/oauth/callback`). Pode ser configurado via `qwen mcp add --oauth-redirect-uri` ou diretamente no settings.json.
- **`tokenParamName`** (string): Nome do parâmetro de consulta para tokens em URLs SSE
- **`audiences`** (string[]): Públicos-alvo para os quais o token é válido

#### Gerenciamento de Tokens

Os tokens OAuth são automaticamente:

- **Armazenados** em `~/.qwen/mcp-oauth-tokens.json` (texto simples, modo 0600) por padrão. Se `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` estiver definido, o Qwen Code usa armazenamento baseado em keychain quando disponível, ou `~/.qwen/mcp-oauth-tokens-v2.json` com criptografia AES-256-GCM.
- **Atualizados** quando expirados (se tokens de atualização estiverem disponíveis)
- **Validados** antes de cada tentativa de conexão
- **Limpados** quando inválidos ou expirados

> [!WARNING]
> Por padrão, os tokens OAuth são armazenados não criptografados no disco. Em máquinas compartilhadas ou multi-usuário, defina `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` para proteger as credenciais.

#### Tipo de Provedor de Autenticação

Você pode especificar o tipo de provedor de autenticação usando a propriedade `authProviderType`:

- **`authProviderType`** (string): Especifica o provedor de autenticação. Pode ser um dos seguintes:
  - **`dynamic_discovery`** (padrão): A CLI descobrirá automaticamente a configuração OAuth do servidor.
  - **`google_credentials`**: A CLI usará as Google Application Default Credentials (ADC) para autenticar com o servidor. Ao usar este provedor, você deve especificar os escopos necessários.
  - **`service_account_impersonation`**: A CLI personificará uma Conta de Serviço do Google Cloud para autenticar com o servidor. Isso é útil para acessar serviços protegidos por IAP (foi projetado especificamente para serviços Cloud Run).

#### Credenciais Google

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

- **`targetAudience`** (string): O Client ID OAuth permitido na lista de permissões do aplicativo protegido por IAP que você está tentando acessar.
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud a ser personificada.

A CLI usará suas Application Default Credentials (ADC) locais para gerar um token OIDC ID para a conta de serviço e público-alvo especificados. Este token será então usado para autenticar com o servidor MCP.

#### Instruções de Configuração

1. **[Crie](https://cloud.google.com/iap/docs/oauth-client-creation) ou use um Client ID OAuth 2.0 existente.** Para usar um Client ID OAuth 2.0 existente, siga as etapas em [Como compartilhar clientes OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Adicione o OAuth ID à lista de permissões para [acesso programático](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) do aplicativo.** Como Cloud Run ainda não é um tipo de recurso suportado no gcloud iap, você deve permitir o Client ID no projeto.
3. **Crie uma conta de serviço.** [Documentação](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Link do Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Adicione tanto a conta de serviço quanto os usuários à Política IAP** na aba "Segurança" do próprio serviço Cloud Run ou via gcloud.
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

#### Servidor MCP baseado em Docker

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

#### Servidor MCP baseado em HTTP

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

#### Servidor MCP baseado em HTTP com Cabeçalhos Personalizados

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

### Servidor MCP SSE com Personificação de SA

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

Quando o Qwen Code é iniciado, ele executa a descoberta de servidores MCP através do seguinte processo detalhado:

### 1. Iteração e Conexão de Servidores

Para cada servidor configurado em `mcpServers`:

1. **O rastreamento de status começa:** O status do servidor é definido como `CONNECTING`
2. **Seleção de transporte:** Com base nas propriedades de configuração:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Estabelecimento da conexão:** O cliente MCP tenta conectar com o timeout configurado
4. **Tratamento de erros:** Falhas de conexão são registradas e o status do servidor é definido como `DISCONNECTED`

### 2. Descoberta de Ferramentas

Após a conexão bem-sucedida:

1. **Listagem de ferramentas:** O cliente chama o endpoint de listagem de ferramentas do servidor MCP
2. **Validação de esquema:** A declaração de função de cada ferramenta é validada
3. **Filtragem de ferramentas:** As ferramentas são filtradas com base nas configurações `includeTools` e `excludeTools`
4. **Sanitização de nomes:** Os nomes das ferramentas são limpos para atender aos requisitos da API Qwen:
   - Caracteres inválidos (não alfanuméricos, sublinhado, ponto, hífen) são substituídos por sublinhados
   - Nomes com mais de 63 caracteres são truncados com substituição intermediária (`___`)

### 3. Resolução de Conflitos

Quando vários servidores expõem ferramentas com o mesmo nome:

1. **Primeiro registro vence:** O primeiro servidor a registrar um nome de ferramenta obtém o nome sem prefixo
2. **Prefixação automática:** Servidores subsequentes recebem nomes com prefixo: `serverName__toolName`
3. **Rastreamento no registro:** O registro de ferramentas mantém mapeamentos entre nomes de servidores e suas ferramentas

### 4. Processamento de Esquemas

Os esquemas de parâmetros das ferramentas passam por sanitização para compatibilidade com a API:

- **Propriedades `$schema`** são removidas
- **`additionalProperties`** são eliminadas
- **`anyOf` com `default`** têm seus valores padrão removidos (compatibilidade com Vertex AI)
- **Processamento recursivo** é aplicado a esquemas aninhados

### 5. Gerenciamento de Conexão

Após a descoberta:

- **Conexões persistentes:** Servidores que registram ferramentas com sucesso mantêm suas conexões
- **Limpeza:** Servidores que não fornecem ferramentas utilizáveis têm suas conexões fechadas
- **Atualizações de status:** Os status finais dos servidores são definidos como `CONNECTED` ou `DISCONNECTED`

## Fluxo de Execução de Ferramentas

Quando o modelo decide usar uma ferramenta MCP, o seguinte fluxo de execução ocorre:

### 1. Invocação da Ferramenta

O modelo gera um `FunctionCall` com:

- **Nome da ferramenta:** O nome registrado (potencialmente com prefixo)
- **Argumentos:** Objeto JSON correspondente ao esquema de parâmetros da ferramenta

### 2. Processo de Confirmação

Cada `DiscoveredMCPTool` implementa uma lógica de confirmação sofisticada:

#### Bypass baseado em Confiança

```typescript
if (this.trust) {
  return false; // Nenhuma confirmação necessária
}
```

#### Lista de Permissões Dinâmica

O sistema mantém listas de permissões internas para:

- **Nível de servidor:** `serverName` → Todas as ferramentas deste servidor são confiáveis
- **Nível de ferramenta:** `serverName.toolName` → Esta ferramenta específica é confiável

#### Tratamento da Escolha do Usuário

Quando a confirmação é necessária, os usuários podem escolher:

- **Prosseguir uma vez:** Executar apenas desta vez
- **Sempre permitir esta ferramenta:** Adicionar à lista de permissões de nível de ferramenta
- **Sempre permitir este servidor:** Adicionar à lista de permissões de nível de servidor
- **Cancelar:** Abortar a execução

### 3. Execução

Após a confirmação (ou bypass por confiança):

1. **Preparação dos parâmetros:** Os argumentos são validados em relação ao esquema da ferramenta
2. **Chamada MCP:** O `CallableTool` subjacente invoca o servidor com:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Nome original da ferramenta no servidor
       args: params,
     },
   ];
   ```

3. **Processamento da resposta:** Os resultados são formatados tanto para o contexto do LLM quanto para exibição ao usuário

### 4. Tratamento da Resposta

O resultado da execução contém:

- **`llmContent`:** Partes da resposta bruta para o contexto do modelo de linguagem
- **`returnDisplay`:** Saída formatada para exibição ao usuário (geralmente JSON em blocos de código Markdown)

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

Uma vez descobertas, as ferramentas MCP ficam disponíveis para o modelo Qwen como ferramentas integradas. O modelo automaticamente:

1. **Seleciona ferramentas adequadas** com base em suas solicitações
2. **Apresenta diálogos de confirmação** (a menos que o servidor seja confiável)
3. **Executa ferramentas** com os parâmetros corretos
4. **Exibe resultados** em um formato amigável

## Monitoramento de Status e Solução de Problemas

### Estados de Conexão

A integração MCP rastreia vários estados:

#### Status do Servidor (`MCPServerStatus`)

- **`DISCONNECTED`:** Servidor não está conectado ou tem erros
- **`CONNECTING`:** Tentativa de conexão em andamento
- **`CONNECTED`:** Servidor está conectado e pronto

#### Estado de Descoberta (`MCPDiscoveryState`)

- **`NOT_STARTED`:** A descoberta não começou
- **`IN_PROGRESS`:** Atualmente descobrindo servidores
- **`COMPLETED`:** Descoberta concluída (com ou sem erros)

### Problemas Comuns e Soluções

#### Servidor não Conecta

**Sintomas:** Servidor mostra status `DISCONNECTED`

**Solução de problemas:**

1. **Verifique a configuração:** Confirme se `command`, `args` e `cwd` estão corretos
2. **Teste manualmente:** Execute o comando do servidor diretamente para garantir que funciona
3. **Verifique dependências:** Certifique-se de que todos os pacotes necessários estão instalados
4. **Revise os logs:** Procure por mensagens de erro na saída da CLI
5. **Verifique permissões:** Garanta que a CLI pode executar o comando do servidor

#### Nenhuma Ferramenta Descoberta

**Sintomas:** Servidor conecta, mas nenhuma ferramenta está disponível

**Solução de problemas:**

1. **Verifique o registro de ferramentas:** Certifique-se de que seu servidor realmente registra ferramentas
2. **Verifique o protocolo MCP:** Confirme que seu servidor implementa corretamente a listagem de ferramentas MCP
3. **Revise os logs do servidor:** Verifique a saída stderr para erros do lado do servidor
4. **Teste a listagem de ferramentas:** Teste manualmente o endpoint de descoberta de ferramentas do seu servidor

#### Ferramentas não Executam

**Sintomas:** Ferramentas são descobertas, mas falham durante a execução

**Solução de problemas:**

1. **Validação de parâmetros:** Certifique-se de que sua ferramenta aceita os parâmetros esperados
2. **Compatibilidade de schema:** Verifique se seus schemas de entrada são JSON Schema válidos
3. **Tratamento de erros:** Verifique se sua ferramenta está lançando exceções não tratadas
4. **Problemas de timeout:** Considere aumentar a configuração de `timeout`

#### Compatibilidade com Sandbox

**Sintomas:** Servidores MCP falham quando o sandbox está ativado

**Soluções:**

1. **Servidores baseados em Docker:** Use contêineres Docker que incluam todas as dependências
2. **Acessibilidade de caminho:** Garanta que os executáveis do servidor estejam disponíveis no sandbox
3. **Acesso à rede:** Configure o sandbox para permitir conexões de rede necessárias
4. **Variáveis de ambiente:** Verifique se as variáveis de ambiente necessárias são passadas

### Dicas de Depuração

1. **Ative o modo de depuração:** Execute a CLI com `--debug` para saída detalhada
2. **Verifique o stderr:** O stderr do servidor MCP é capturado e registrado (mensagens INFO são filtradas)
3. **Teste isoladamente:** Teste seu servidor MCP independentemente antes de integrar
4. **Configuração incremental:** Comece com ferramentas simples antes de adicionar funcionalidades complexas
5. **Use `/mcp` com frequência:** Monitore o status do servidor durante o desenvolvimento

## Notas Importantes

### Considerações de Segurança

- **Configurações de confiança:** A opção `trust` ignora todos os diálogos de confirmação. Use com cautela e apenas para servidores que você controla completamente
- **Tokens de acesso:** Tenha consciência de segurança ao configurar variáveis de ambiente contendo chaves de API ou tokens
- **Compatibilidade com sandbox:** Ao usar sandbox, certifique-se de que os servidores MCP estejam disponíveis dentro do ambiente sandbox
- **Dados privados:** Usar tokens de acesso pessoal com escopo amplo pode levar a vazamento de informações entre repositórios

### Performance e Gerenciamento de Recursos

- **Persistência de conexão:** A CLI mantém conexões persistentes com servidores que registram ferramentas com sucesso
- **Limpeza automática:** Conexões com servidores que não fornecem ferramentas são fechadas automaticamente
- **Gerenciamento de timeout:** Configure timeouts adequados com base nas características de resposta do seu servidor
- **Monitoramento de recursos:** Servidores MCP executam como processos separados e consomem recursos do sistema

### Compatibilidade de Schema

- **Modo de conformidade de schema:** Por padrão (`schemaCompliance: "auto"`), os schemas das ferramentas são passados como estão. Defina `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` no seu `settings.json` para converter modelos para o formato Strict OpenAPI 3.0.
- **Transformações OpenAPI 3.0:** Quando o modo `openapi_30` está ativado, o sistema lida com:
  - Tipos anuláveis: `["string", "null"]` -> `type: "string", nullable: true`
  - Valores const: `const: "foo"` -> `enum: ["foo"]`
  - Limites exclusivos: `exclusiveMinimum` numérico -> forma booleana com `minimum`
  - Remoção de palavras-chave: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Sanitização de nomes:** Nomes de ferramentas são automaticamente sanitizados para atender aos requisitos da API
- **Resolução de conflitos:** Conflitos de nomes de ferramentas entre servidores são resolvidos através de prefixação automática

Esta integração abrangente torna os servidores MCP uma forma poderosa de estender as capacidades da CLI, mantendo segurança, confiabilidade e facilidade de uso.

## Retornando Conteúdo Rico de Ferramentas

As ferramentas MCP não se limitam a retornar texto simples. Você pode retornar conteúdo rico e de múltiplas partes, incluindo texto, imagens, áudio e outros dados binários em uma única resposta da ferramenta. Isso permite construir ferramentas poderosas que podem fornecer informações diversas ao modelo em uma única interação.

Todos os dados retornados pela ferramenta são processados e enviados ao modelo como contexto para sua próxima geração, permitindo que ele raciocine ou resuma as informações fornecidas.

### Como Funciona

Para retornar conteúdo rico, a resposta da sua ferramenta deve aderir à especificação MCP para um [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). O campo `content` do resultado deve ser um array de objetos `ContentBlock`. A CLI processará corretamente este array, separando texto de dados binários e empacotando para o modelo.

Você pode misturar diferentes tipos de blocos de conteúdo no array `content`. Os tipos de bloco suportados incluem:

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

Quando o Qwen Code recebe esta resposta, ele irá:

1. Extrair todo o texto e combiná-lo em uma única parte `functionResponse` para o modelo.
2. Apresentar os dados da imagem como uma parte `inlineData` separada.
3. Fornecer um resumo limpo e amigável na CLI, indicando que tanto texto quanto uma imagem foram recebidos.

Isso permite construir ferramentas sofisticadas que podem fornecer contexto multimodal rico ao modelo Qwen.

## Prompts MCP como Comandos de Barra

Além das ferramentas, os servidores MCP podem expor prompts predefinidos que podem ser executados como comandos de barra no Qwen Code. Isso permite criar atalhos para consultas comuns ou complexas que podem ser facilmente invocadas pelo nome.

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

Assim que um prompt é descoberto, você pode invocá-lo usando seu nome como um comando de barra. A CLI lidará automaticamente com a análise dos argumentos.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, usando argumentos posicionais:

```bash
/poem-writer "Qwen Code" reverent
```

Quando você executa este comando, a CLI executa o método `prompts/get` no servidor MCP com os argumentos fornecidos. O servidor é responsável por substituir os argumentos no modelo do prompt e retornar o texto final do prompt. A CLI então envia este prompt para o modelo executar. Isso fornece uma maneira conveniente de automatizar e compartilhar fluxos de trabalho comuns.

## Gerenciando Servidores MCP com `qwen mcp`

Embora você sempre possa configurar servidores MCP editando manualmente seu arquivo `settings.json`, a CLI fornece um conjunto conveniente de comandos para gerenciar suas configurações de servidor programaticamente. Esses comandos simplificam o processo de adicionar, listar e remover servidores MCP sem precisar editar arquivos JSON diretamente.

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
- `--timeout`: Definir timeout de conexão em milissegundos.
- `--trust`: Confiar no servidor (ignorar todos os prompts de confirmação de chamada de ferramenta).
- `--description`: Definir a descrição para o servidor.
- `--include-tools`: Uma lista separada por vírgulas de ferramentas a incluir.
- `--exclude-tools`: Uma lista separada por vírgulas de ferramentas a excluir.
- `--oauth-client-id`: ID do cliente OAuth para autenticação do servidor MCP.
- `--oauth-client-secret`: Segredo do cliente OAuth para autenticação do servidor MCP.
- `--oauth-redirect-uri`: URI de redirecionamento OAuth (ex.: `https://your-server.com/oauth/callback`). O padrão é `http://localhost:7777/oauth/callback` para configurações locais. **Importante para implantações remotas**: Ao executar o Qwen Code em servidores remotos/nuvem, defina para uma URL publicamente acessível.
- `--oauth-authorization-url`: URL de autorização OAuth.
- `--oauth-token-url`: URL do token OAuth.
- `--oauth-scopes`: Escopos OAuth (separados por vírgula).

#### Adicionando um servidor stdio

Este é o transporte padrão para executar servidores locais.

```bash
# Sintaxe básica
qwen mcp add <name> <command> [args...]

# Exemplo: Adicionando um servidor local
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Exemplo: Adicionando um servidor python local
qwen mcp add python-server python server.py --port 8080
```

#### Adicionando um servidor HTTP

Este transporte é para servidores que usam o transporte HTTP streamable.

```bash
# Sintaxe básica
qwen mcp add --transport http <name> <url>

# Exemplo: Adicionando um servidor HTTP
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Exemplo: Adicionando um servidor HTTP com cabeçalho de autenticação
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Adicionando um servidor SSE

Este transporte é para servidores que usam Server-Sent Events (SSE).

```bash
# Sintaxe básica
qwen mcp add --transport sse <name> <url>

# Exemplo: Adicionando um servidor SSE
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Exemplo: Adicionando um servidor SSE com cabeçalho de autenticação
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Exemplo: Adicionando um servidor SSE habilitado para OAuth
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### Gerenciando Servidores (`/mcp`)

Para visualizar e gerenciar todos os servidores MCP atualmente configurados, abra o diálogo `/mcp`
dentro de uma sessão interativa do Qwen Code. Este diálogo permite:

- Visualizar todos os servidores MCP com seu status de conexão
- Ativar/desativar servidores
- Reconectar a servidores desconectados
- Visualizar ferramentas e prompts fornecidos por cada servidor
- Visualizar logs do servidor

**Comando:**

```bash
qwen
```

Em seguida, digite:

```text
/mcp
```

O diálogo de gerenciamento fornece uma interface visual mostrando o nome de cada servidor, detalhes de configuração, status de conexão e ferramentas/prompts disponíveis.

### Removendo um Servidor (`qwen mcp remove`)

Para deletar um servidor da sua configuração, use o comando `remove` com o nome do servidor.

**Comando:**

```bash
qwen mcp remove <name>
```

**Exemplo:**

```bash
qwen mcp remove my-server
```

Isso encontrará e deletará a entrada "my-server" do objeto `mcpServers` no arquivo `settings.json` apropriado, com base no escopo (`-s, --scope`).