# Servidores MCP com Qwen Code

Este documento fornece um guia para configurar e usar servidores Model Context Protocol (MCP) com Qwen Code.

## O que é um servidor MCP?

Um servidor MCP é uma aplicação que expõe ferramentas e recursos para a CLI por meio do Model Context Protocol, permitindo que ela interaja com sistemas externos e fontes de dados. Os servidores MCP atuam como uma ponte entre o modelo e seu ambiente local ou outros serviços, como APIs.

Um servidor MCP permite que a CLI:

- **Descubra ferramentas:** Liste as ferramentas disponíveis, suas descrições e parâmetros por meio de definições de esquema padronizadas.
- **Execute ferramentas:** Chame ferramentas específicas com argumentos definidos e receba respostas estruturadas.
- **Acesse recursos:** Leia dados de recursos específicos (embora a CLI se concentre principalmente na execução de ferramentas).

Com um servidor MCP, você pode estender os recursos da CLI para realizar ações além de seus recursos integrados, como interagir com bancos de dados, APIs, scripts personalizados ou fluxos de trabalho especializados.

## Arquitetura de Integração Principal

O Qwen Code se integra com servidores MCP através de um sistema sofisticado de descoberta e execução embutido no pacote principal (`packages/core/src/tools/`):

### Camada de Descoberta (`mcp-client.ts`)

O processo de descoberta é orquestrado por `discoverMcpTools()`, que:

1. **Itera pelos servidores configurados** a partir da configuração `mcpServers` no seu `settings.json`
2. **Estabelece conexões** utilizando mecanismos de transporte apropriados (Stdio, SSE ou HTTP Streamable)
3. **Obtém definições de ferramentas** de cada servidor usando o protocolo MCP
4. **Sanitiza e valida** os esquemas das ferramentas para compatibilidade com a API do Qwen
5. **Registra as ferramentas** no registro global de ferramentas com resolução de conflitos

### Camada de Execução (`mcp-tool.ts`)

Cada ferramenta MCP descoberta é encapsulada em uma instância de `DiscoveredMCPTool` que:

- **Lida com a lógica de confirmação** com base nas configurações de confiança do servidor e nas preferências do usuário
- **Gerencia a execução da ferramenta** chamando o servidor MCP com os parâmetros adequados
- **Processa respostas** tanto para o contexto do LLM quanto para exibição ao usuário
- **Mantém o estado da conexão** e trata tempos limite (timeouts)

### Mecanismos de Transporte

A CLI suporta três tipos de transporte MCP:

- **Transporte Stdio:** Inicia um subprocesso e se comunica por meio de stdin/stdout
- **Transporte SSE:** Conecta-se a endpoints de Server-Sent Events
- **Transporte HTTP Streamável:** Utiliza streaming HTTP para comunicação

## Como configurar seu servidor MCP

O Qwen Code utiliza a configuração `mcpServers` no seu arquivo `settings.json` para localizar e conectar-se aos servidores MCP. Essa configuração suporta múltiplos servidores com diferentes mecanismos de transporte.

### Configure o servidor MCP em settings.json

Você pode configurar servidores MCP no seu arquivo `settings.json` de duas maneiras principais: através do objeto `mcpServers` no nível superior para definições específicas de servidores, e através do objeto `mcp` para configurações globais que controlam a descoberta e execução dos servidores.

#### Configurações Globais do MCP (`mcp`)

O objeto `mcp` no seu `settings.json` permite definir regras globais para todos os servidores MCP.

- **`mcp.serverCommand`** (string): Um comando global para iniciar um servidor MCP.
- **`mcp.allowed`** (array de strings): Uma lista de nomes de servidores MCP permitidos. Se definido, apenas servidores desta lista (correspondendo às chaves no objeto `mcpServers`) serão conectados.
- **`mcp.excluded`** (array de strings): Uma lista de nomes de servidores MCP excluídos. Servidores nesta lista não serão conectados.

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

### Estrutura da Configuração

Adicione um objeto `mcpServers` ao seu arquivo `settings.json`:

```json
{ ...file contém outros objetos de configuração
  "mcpServers": {
    "serverName": {
      "command": "caminho/para/o/servidor",
      "args": ["--arg1", "valor1"],
      "env": {
        "API_KEY": "$MEU_TOKEN_DA_API"
      },
      "cwd": "./diretório-do-servidor",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

### Propriedades da Configuração

Cada configuração de servidor suporta as seguintes propriedades:

#### Obrigatório (uma das seguintes)

- **`command`** (string): Caminho para o executável para transporte Stdio
- **`url`** (string): URL do endpoint SSE (ex.: `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): URL do endpoint de streaming HTTP

#### Opcional

- **`args`** (string[]): Argumentos de linha de comando para o transporte Stdio
- **`headers`** (object): Cabeçalhos HTTP personalizados ao usar `url` ou `httpUrl`
- **`env`** (object): Variáveis de ambiente para o processo do servidor. Valores podem referenciar variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`
- **`cwd`** (string): Diretório de trabalho para o transporte Stdio
- **`timeout`** (number): Tempo limite da requisição em milissegundos (padrão: 600.000ms = 10 minutos)
- **`trust`** (boolean): Quando `true`, ignora todas as confirmações de chamada de ferramenta para este servidor (padrão: `false`)
- **`includeTools`** (string[]): Lista de nomes de ferramentas a incluir deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis neste servidor (comportamento de lista de permissões). Se não especificado, todas as ferramentas do servidor são habilitadas por padrão.
- **`excludeTools`** (string[]): Lista de nomes de ferramentas a excluir deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor. **Nota:** `excludeTools` tem precedência sobre `includeTools` - se uma ferramenta estiver em ambas as listas, ela será excluída.
- **`targetAudience`** (string): O ID do Cliente OAuth permitido no aplicativo protegido por IAP ao qual você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud a ser personificada. Usado com `authProviderType: 'service_account_impersonation'`.

### Suporte a OAuth para Servidores Remotos MCP

O Qwen Code suporta autenticação OAuth 2.0 para servidores remotos MCP utilizando transportes SSE ou HTTP. Isso permite acesso seguro a servidores MCP que requerem autenticação.

#### Descoberta Automática de OAuth

Para servidores que suportam descoberta OAuth, você pode omitir a configuração do OAuth e deixar que a CLI a descubra automaticamente:

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
- Realizar registro dinâmico de cliente, se suportado
- Gerenciar o fluxo OAuth e os tokens

#### Fluxo de Autenticação

Ao conectar-se a um servidor com OAuth habilitado:

1. **Tentativa inicial de conexão** falha com 401 Unauthorized
2. **Descoberta do OAuth** encontra os endpoints de autorização e token
3. **O navegador abre** para autenticação do usuário (requer acesso ao navegador local)
4. **Código de autorização** é trocado por tokens de acesso
5. **Tokens são armazenados** com segurança para uso futuro
6. **Nova tentativa de conexão** é bem-sucedida com tokens válidos

#### Requisitos de Redirecionamento do Navegador

**Importante:** A autenticação OAuth requer que sua máquina local possa:

- Abrir um navegador web para autenticação
- Receber redirecionamentos em `http://localhost:7777/oauth/callback`

Este recurso não funcionará em:

- Ambientes headless sem acesso ao navegador
- Sessões SSH remotas sem encaminhamento X11
- Ambientes containerizados sem suporte a navegador

#### Gerenciando a Autenticação OAuth

Use o comando `/mcp auth` para gerenciar a autenticação OAuth:

```bash

# Listar servidores que requerem autenticação
/mcp auth```

```markdown
# Autenticar com um servidor específico
/mcp auth serverName

# Reautenticar se os tokens expirarem
/mcp auth serverName
```

#### Propriedades de Configuração do OAuth

- **`enabled`** (boolean): Habilita o OAuth para este servidor
- **`clientId`** (string): Identificador do cliente OAuth (opcional com registro dinâmico)
- **`clientSecret`** (string): Segredo do cliente OAuth (opcional para clientes públicos)
- **`authorizationUrl`** (string): Endpoint de autorização OAuth (descoberto automaticamente se omitido)
- **`tokenUrl`** (string): Endpoint de token OAuth (descoberto automaticamente se omitido)
- **`scopes`** (string[]): Escopos OAuth obrigatórios
- **`redirectUri`** (string): URI de redirecionamento personalizada (o padrão é `http://localhost:7777/oauth/callback`)
- **`tokenParamName`** (string): Nome do parâmetro de consulta para tokens em URLs SSE
- **`audiences`** (string[]): Audiências para as quais o token é válido
```

#### Gerenciamento de Tokens

Os tokens OAuth são automaticamente:

- **Armazenados com segurança** em `~/.qwen/mcp-oauth-tokens.json`
- **Atualizados** quando expirados (se os tokens de atualização estiverem disponíveis)
- **Validados** antes de cada tentativa de conexão
- **Removidos** quando inválidos ou expirados

#### Tipo de Provedor de Autenticação

Você pode especificar o tipo de provedor de autenticação usando a propriedade `authProviderType`:

- **`authProviderType`** (string): Especifica o provedor de autenticação. Pode ser um dos seguintes:
  - **`dynamic_discovery`** (padrão): A CLI descobrirá automaticamente a configuração do OAuth a partir do servidor.
  - **`google_credentials`**: A CLI usará as Credenciais Padrão do Aplicativo Google (ADC) para autenticar com o servidor. Ao usar este provedor, você deve especificar os escopos necessários.
  - **`service_account_impersonation`**: A CLI representará uma Conta de Serviço do Google Cloud para autenticar com o servidor. Isso é útil para acessar serviços protegidos pelo IAP (foi especificamente projetado para serviços do Cloud Run).

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

#### Representação de Conta de Serviço

Para autenticar com um servidor usando Representação de Conta de Serviço, você deve definir o `authProviderType` como `service_account_impersonation` e fornecer as seguintes propriedades:

- **`targetAudience`** (string): O ID do Cliente OAuth permitido na aplicação protegida pelo IAP que você está tentando acessar.
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud que será representada.

A CLI usará suas Credenciais Padrão de Aplicativo (ADC) locais para gerar um token OIDC ID para a conta de serviço e audiência especificadas. Este token será então usado para autenticar com o servidor MCP.

#### Instruções de Configuração

1. **[Crie](https://cloud.google.com/iap/docs/oauth-client-creation) ou utilize um ID de cliente OAuth 2.0 existente.** Para usar um ID de cliente OAuth 2.0 existente, siga os passos em [Como compartilhar clientes OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Adicione o ID OAuth à lista de permissões para [acesso programático](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) da aplicação.** Como o Cloud Run ainda não é um tipo de recurso suportado no gcloud iap, você deve colocar o ID do Cliente na lista de permissões no projeto.
3. **Crie uma conta de serviço.** [Documentação](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Link do Console do Cloud](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Adicione tanto a conta de serviço quanto os usuários à Política do IAP** na aba "Segurança" do próprio serviço Cloud Run ou via gcloud.
5. **Conceda a todos os usuários e grupos** que acessarão o Servidor MCP as permissões necessárias para [personificar a conta de serviço](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (ou seja, `roles/iam.serviceAccountTokenCreator`).
6. **[Habilite](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) a API de Credenciais do IAM** para seu projeto.

### Exemplos de Configurações

#### Servidor MCP em Python (Stdio)

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

#### Servidor MCP em Node.js (Stdio)

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

### Servidor SSE MCP com Representação de Conta de Serviço

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

## Mergulho Profundo no Processo de Descoberta

Quando o Qwen Code é iniciado, ele realiza a descoberta do servidor MCP através do seguinte processo detalhado:

### 1. Iteração e Conexão do Servidor

Para cada servidor configurado em `mcpServers`:

1. **Início do rastreamento de status:** O status do servidor é definido como `CONNECTING`
2. **Seleção do transporte:** Com base nas propriedades de configuração:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Estabelecimento da conexão:** O cliente MCP tenta se conectar com o tempo limite configurado
4. **Tratamento de erros:** Falhas na conexão são registradas e o status do servidor é definido como `DISCONNECTED`

### 2. Descoberta de Ferramentas

Após uma conexão bem-sucedida:

1. **Listagem de ferramentas:** O cliente chama o endpoint de listagem de ferramentas do servidor MCP
2. **Validação de esquema:** A declaração de função de cada ferramenta é validada
3. **Filtragem de ferramentas:** As ferramentas são filtradas com base nas configurações `includeTools` e `excludeTools`
4. **Sanitização de nomes:** Os nomes das ferramentas são limpos para atender aos requisitos da API Qwen:
   - Caracteres inválidos (não alfanuméricos, sublinhado, ponto, hífen) são substituídos por sublinhados
   - Nomes com mais de 63 caracteres são truncados com substituição no meio (`___`)

### 3. Resolução de Conflitos

Quando vários servidores expõem ferramentas com o mesmo nome:

1. **Primeiro registro vence:** O primeiro servidor a registrar um nome de ferramenta obtém o nome sem prefixo
2. **Prefixação automática:** Servidores subsequentes recebem nomes com prefixo: `serverName__toolName`
3. **Rastreamento de registro:** O registro de ferramentas mantém mapeamentos entre nomes de servidores e suas ferramentas

### 4. Processamento de Esquema

Os esquemas de parâmetros das ferramentas passam por uma sanitização para compatibilidade com a API:

- **Propriedades `$schema`** são removidas
- **`additionalProperties`** são eliminadas
- **`anyOf` com `default`** têm seus valores padrão removidos (compatibilidade com Vertex AI)
- **Processamento recursivo** é aplicado a esquemas aninhados

### 5. Gerenciamento de Conexões

Após a descoberta:

- **Conexões persistentes:** Servidores que registram ferramentas com sucesso mantêm suas conexões
- **Limpeza:** Servidores que não fornecem ferramentas utilizáveis têm suas conexões encerradas
- **Atualizações de status:** Os status finais dos servidores são definidos como `CONNECTED` ou `DISCONNECTED`

## Fluxo de Execução da Ferramenta

Quando o modelo decide usar uma ferramenta MCP, ocorre o seguinte fluxo de execução:

### 1. Invocação da Ferramenta

O modelo gera um `FunctionCall` com:

- **Nome da ferramenta:** O nome registrado (possivelmente prefixado)
- **Argumentos:** Objeto JSON correspondente ao esquema de parâmetros da ferramenta

### 2. Processo de Confirmação

Cada `DiscoveredMCPTool` implementa uma lógica de confirmação sofisticada:

#### Ignorar com Base em Confiança

```typescript
if (this.trust) {
  return false; // Nenhuma confirmação necessária
}
```

#### Lista de Permissões Dinâmica

O sistema mantém listas de permissões internas para:

- **Nível do servidor:** `serverName` → Todas as ferramentas deste servidor são confiáveis
- **Nível da ferramenta:** `serverName.toolName` → Esta ferramenta específica é confiável

#### Tratamento da Escolha do Usuário

Quando a confirmação é necessária, os usuários podem escolher:

- **Prosseguir uma vez:** Executar apenas desta vez
- **Sempre permitir esta ferramenta:** Adicionar à lista de permissões no nível da ferramenta
- **Sempre permitir este servidor:** Adicionar à lista de permissões no nível do servidor
- **Cancelar:** Interromper a execução

### 3. Execução

Após a confirmação (ou ignorar a verificação de confiança):

1. **Preparação dos parâmetros:** Os argumentos são validados de acordo com o schema da ferramenta
2. **Chamada ao MCP:** A `CallableTool` subjacente invoca o servidor com:

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

### Uso da Ferramenta

Uma vez descobertas, as ferramentas MCP ficam disponíveis para o modelo Qwen como ferramentas integradas. O modelo irá automaticamente:

1. **Selecionar ferramentas apropriadas** com base nas suas solicitações
2. **Apresentar diálogos de confirmação** (exceto quando o servidor é confiável)
3. **Executar ferramentas** com os parâmetros adequados
4. **Exibir resultados** em um formato amigável ao usuário

## Monitoramento de Status e Solução de Problemas

### Estados de Conexão

A integração MCP monitora diversos estados:

#### Status do Servidor (`MCPServerStatus`)

- **`DISCONNECTED`:** O servidor não está conectado ou apresenta erros
- **`CONNECTING`:** Tentativa de conexão em andamento
- **`CONNECTED`:** O servidor está conectado e pronto

#### Estado de Descoberta (`MCPDiscoveryState`)

- **`NOT_STARTED`:** A descoberta ainda não começou
- **`IN_PROGRESS`:** Descoberta de servidores em andamento
- **`COMPLETED`:** Descoberta finalizada (com ou sem erros)

### Problemas Comuns e Soluções

#### Servidor Não Conecta

**Sintomas:** O servidor mostra o status `DISCONNECTED`

**Solução de problemas:**

1. **Verifique a configuração:** Confirme se `command`, `args` e `cwd` estão corretos
2. **Teste manualmente:** Execute o comando do servidor diretamente para garantir que funciona
3. **Verifique dependências:** Certifique-se de que todos os pacotes necessários estão instalados
4. **Revise os logs:** Procure por mensagens de erro na saída do CLI
5. **Verifique permissões:** Garanta que o CLI possa executar o comando do servidor

#### Nenhuma Ferramenta Descoberta

**Sintomas:** O servidor conecta mas nenhuma ferramenta está disponível

**Solução de problemas:**

1. **Verifique o registro de ferramentas:** Certifique-se de que seu servidor realmente registra ferramentas
2. **Verifique o protocolo MCP:** Confirme se seu servidor implementa corretamente a listagem de ferramentas do MCP
3. **Revise os logs do servidor:** Verifique a saída stderr em busca de erros no lado do servidor
4. **Teste a listagem de ferramentas:** Teste manualmente o endpoint de descoberta de ferramentas do seu servidor

#### Ferramentas Não Executando

**Sintomas:** As ferramentas são descobertas mas falham durante a execução

**Solução de problemas:**

1. **Validação de parâmetros:** Certifique-se de que sua ferramenta aceita os parâmetros esperados
2. **Compatibilidade de schema:** Verifique se seus schemas de entrada são JSON Schema válidos
3. **Tratamento de erros:** Verifique se sua ferramenta está lançando exceções não tratadas
4. **Problemas de timeout:** Considere aumentar a configuração de `timeout`

#### Compatibilidade com Sandbox

**Sintomas:** Servidores MCP falham quando o sandboxing está habilitado

**Soluções:**

1. **Servidores baseados em Docker:** Use contêineres Docker que incluam todas as dependências
2. **Acessibilidade de caminhos:** Certifique-se de que os executáveis do servidor estão disponíveis no sandbox
3. **Acesso à rede:** Configure o sandbox para permitir conexões de rede necessárias
4. **Variáveis de ambiente:** Verifique se as variáveis de ambiente necessárias estão sendo passadas

### Dicas de Depuração

1. **Ativar modo de depuração:** Execute o CLI com `--debug` para obter saída detalhada
2. **Verificar stderr:** O stderr do servidor MCP é capturado e registrado (mensagens INFO filtradas)
3. **Isolamento de testes:** Teste seu servidor MCP independentemente antes da integração
4. **Configuração incremental:** Comece com ferramentas simples antes de adicionar funcionalidades complexas
5. **Use `/mcp` frequentemente:** Monitore o status do servidor durante o desenvolvimento

## Notas Importantes

### Considerações de Segurança

- **Configurações de confiança:** A opção `trust` ignora todas as caixas de diálogo de confirmação. Use com cautela e apenas para servidores que você controle completamente
- **Tokens de acesso:** Tenha consciência de segurança ao configurar variáveis de ambiente contendo chaves de API ou tokens
- **Compatibilidade com sandbox:** Ao usar sandboxing, certifique-se de que os servidores MCP estejam disponíveis dentro do ambiente sandbox
- **Dados privados:** Usar tokens de acesso pessoal com escopo amplo pode levar ao vazamento de informações entre repositórios

### Desempenho e Gerenciamento de Recursos

- **Persistência de conexão:** A CLI mantém conexões persistentes com servidores que registram ferramentas com sucesso
- **Limpeza automática:** Conexões com servidores que não fornecem ferramentas são fechadas automaticamente
- **Gerenciamento de timeout:** Configure timeouts apropriados com base nas características de resposta do seu servidor
- **Monitoramento de recursos:** Servidores MCP executam como processos separados e consomem recursos do sistema

### Compatibilidade de Esquema

- **Remoção de propriedades:** O sistema remove automaticamente certas propriedades do esquema (`$schema`, `additionalProperties`) para compatibilidade com a API Qwen
- **Sanitização de nomes:** Nomes de ferramentas são automaticamente sanitizados para atender aos requisitos da API
- **Resolução de conflitos:** Conflitos de nomes de ferramentas entre servidores são resolvidos por meio de prefixação automática

Essa integração abrangente torna os servidores MCP uma maneira poderosa de estender as capacidades da CLI, mantendo segurança, confiabilidade e facilidade de uso.

## Retornando Conteúdo Rico de Ferramentas

As ferramentas MCP não se limitam a retornar texto simples. Você pode retornar conteúdo rico e multipartes, incluindo texto, imagens, áudio e outros dados binários em uma única resposta da ferramenta. Isso permite que você construa ferramentas poderosas que podem fornecer informações diversas ao modelo em uma única interação.

Todos os dados retornados pela ferramenta são processados e enviados ao modelo como contexto para sua próxima geração, permitindo que ele raciocine ou resuma as informações fornecidas.

### Como Funciona

Para retornar conteúdo rico, a resposta da sua ferramenta deve seguir a especificação MCP para um [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). O campo `content` do resultado deve ser um array de objetos `ContentBlock`. A CLI processará corretamente esse array, separando texto de dados binários e empacotando-o para o modelo.

Você pode combinar diferentes tipos de blocos de conteúdo no array `content`. Os tipos de bloco suportados incluem:

- `text`
- `image`
- `audio`
- `resource` (conteúdo embutido)
- `resource_link`

### Exemplo: Retornando Texto e uma Imagem

Aqui está um exemplo de uma resposta JSON válida de uma ferramenta MCP que retorna tanto uma descrição em texto quanto uma imagem:

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

Quando o Qwen Code recebe essa resposta, ele irá:

1.  Extrair todo o texto e combiná-lo em uma única parte `functionResponse` para o modelo.
2.  Apresentar os dados da imagem como uma parte separada `inlineData`.
3.  Fornecer um resumo limpo e amigável ao usuário na CLI, indicando que tanto texto quanto uma imagem foram recebidos.

Isso permite que você crie ferramentas sofisticadas capazes de fornecer contexto rico e multimodal ao modelo Qwen.

## Prompts do MCP como Comandos Slash

Além das ferramentas, os servidores MCP podem expor prompts predefinidos que podem ser executados como comandos slash dentro do Qwen Code. Isso permite que você crie atalhos para consultas comuns ou complexas que podem ser facilmente invocadas por nome.

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

Isso pode ser incluído em `settings.json` sob `mcpServers` com:

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

Uma vez que um prompt é descoberto, você pode invocá-lo usando seu nome como um comando de barra. A CLI irá automaticamente lidar com a análise dos argumentos.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, usando argumentos posicionais:

```bash
/poem-writer "Qwen Code" reverent
```

Quando você executa este comando, a CLI executa o método `prompts/get` no servidor MCP com os argumentos fornecidos. O servidor é responsável por substituir os argumentos no modelo de prompt e retornar o texto final do prompt. A CLI então envia este prompt para o modelo para execução. Isso fornece uma maneira conveniente de automatizar e compartilhar fluxos de trabalho comuns.

## Gerenciando Servidores MCP com `qwen mcp`

Embora você sempre possa configurar servidores MCP editando manualmente seu arquivo `settings.json`, a CLI fornece um conjunto conveniente de comandos para gerenciar suas configurações de servidor programaticamente. Esses comandos simplificam o processo de adicionar, listar e remover servidores MCP sem a necessidade de editar diretamente arquivos JSON.

### Adicionando um Servidor (`qwen mcp add`)

O comando `add` configura um novo servidor MCP no seu `settings.json`. Com base no escopo (`-s, --scope`), ele será adicionado ao arquivo de configuração do usuário `~/.qwen/settings.json` ou ao arquivo de configuração do projeto `.qwen/settings.json`.

**Comando:**

```bash
qwen mcp add [opções] <nome> <comandoOuUrl> [args...]
```

- `<nome>`: Um nome único para o servidor.
- `<comandoOuUrl>`: O comando a ser executado (para `stdio`) ou a URL (para `http`/`sse`).
- `[args...]`: Argumentos opcionais para um comando `stdio`.

**Opções (Flags):**

- `-s, --scope`: Escopo da configuração (usuário ou projeto). [padrão: "project"]
- `-t, --transport`: Tipo de transporte (stdio, sse, http). [padrão: "stdio"]
- `-e, --env`: Define variáveis de ambiente (ex.: -e CHAVE=valor).
- `-H, --header`: Define cabeçalhos HTTP para transportes SSE e HTTP (ex.: -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: Define o tempo limite de conexão em milissegundos.
- `--trust`: Confiar no servidor (ignora todos os prompts de confirmação de chamada de ferramenta).
- `--description`: Define a descrição do servidor.
- `--include-tools`: Uma lista separada por vírgulas das ferramentas a serem incluídas.
- `--exclude-tools`: Uma lista separada por vírgulas das ferramentas a serem excluídas.

#### Adicionando um servidor stdio

Este é o transporte padrão para executar servidores locais.

```bash

# Sintaxe básica
qwen mcp add <nome> <comando> [argumentos...]

# Exemplo: Adicionando um servidor local
qwen mcp add meu-servidor-stdio -e API_KEY=123 /caminho/para/o/servidor arg1 arg2 arg3

# Exemplo: Adicionando um servidor Python local
qwen mcp add servidor-python python server.py --port 8080
```

#### Adicionando um servidor HTTP

Este transporte é para servidores que utilizam o transporte HTTP com streaming.

```bash

# Sintaxe básica
qwen mcp add --transport http <nome> <url>

# Exemplo: Adicionando um servidor HTTP
qwen mcp add --transport http servidor-http https://api.exemplo.com/mcp/

# Exemplo: Adicionando um servidor HTTP com cabeçalho de autenticação
qwen mcp add --transport http servidor-http-seguro https://api.exemplo.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Adicionando um servidor SSE

Este transporte é para servidores que utilizam Server-Sent Events (SSE).

```bash

# Sintaxe básica
qwen mcp add --transport sse <nome> <url>
```

# Exemplo: Adicionando um servidor SSE
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Exemplo: Adicionando um servidor SSE com um cabeçalho de autenticação
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### Listando Servidores (`qwen mcp list`)

Para visualizar todos os servidores MCP atualmente configurados, utilize o comando `list`. Ele exibe o nome de cada servidor, detalhes da configuração e o status da conexão.

**Comando:**

```bash
qwen mcp list
```

**Exemplo de Saída:**

```sh
✓ stdio-server: command: python3 server.py (stdio) - Conectado
✓ http-server: https://api.example.com/mcp (http) - Conectado
✗ sse-server: https://api.example.com/sse (sse) - Desconectado
```

### Removendo um Servidor (`qwen mcp remove`)

Para excluir um servidor da sua configuração, utilize o comando `remove` com o nome do servidor.

**Comando:**

```bash
qwen mcp remove <nome>
```

**Exemplo:**

```bash
qwen mcp remove meu-servidor
```

Isso irá localizar e excluir a entrada "meu-servidor" do objeto `mcpServers` no arquivo `settings.json` apropriado, com base no escopo (`-s, --scope`).