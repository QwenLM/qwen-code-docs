# Servidores MCP com Qwen Code

Este documento fornece um guia para configurar e usar servidores do Model Context Protocol (MCP) com o Qwen Code.

## O que é um servidor MCP?

Um servidor MCP é um aplicativo que expõe ferramentas e recursos à CLI por meio do *Model Context Protocol* (Protocolo de Contexto de Modelo), permitindo que ela interaja com sistemas externos e fontes de dados. Os servidores MCP atuam como uma ponte entre o modelo e seu ambiente local ou outros serviços, como APIs.

Um servidor MCP permite que a CLI:

- **Descubra ferramentas:** Liste as ferramentas disponíveis, suas descrições e parâmetros por meio de definições de esquema padronizadas.  
- **Execute ferramentas:** Chame ferramentas específicas com argumentos definidos e receba respostas estruturadas.  
- **Acesse recursos:** Leia dados de recursos específicos (embora a CLI se concentre principalmente na execução de ferramentas).

Com um servidor MCP, você pode estender as capacidades da CLI para executar ações além de seus recursos internos, como interagir com bancos de dados, APIs, scripts personalizados ou fluxos de trabalho especializados.

## Arquitetura de Integração Central

O Qwen Code integra-se a servidores MCP por meio de um sofisticado sistema de descoberta e execução incorporado ao pacote principal (`packages/core/src/tools/`):

### Camada de Descoberta (`mcp-client.ts`)

O processo de descoberta é orquestrado pela função `discoverMcpTools()`, que:

1. **Itera pelos servidores configurados** na configuração `mcpServers` do seu arquivo `settings.json`
2. **Estabelece conexões** usando os mecanismos de transporte apropriados (Stdio, SSE ou HTTP Streamable)
3. **Recupera definições de ferramentas** de cada servidor usando o protocolo MCP
4. **Sanitiza e valida** os esquemas das ferramentas para garantir compatibilidade com a API do Qwen
5. **Registra as ferramentas** no registro global de ferramentas, com resolução de conflitos

### Camada de Execução (`mcp-tool.ts`)

Cada ferramenta MCP descoberta é encapsulada em uma instância `DiscoveredMCPTool` que:

- **Lida com a lógica de confirmação**, com base nas configurações de confiança do servidor e nas preferências do usuário  
- **Gerencia a execução da ferramenta**, chamando o servidor MCP com os parâmetros adequados  
- **Processa as respostas**, tanto para o contexto do modelo de linguagem de grande porte (LLM) quanto para exibição ao usuário  
- **Mantém o estado da conexão** e trata tempos limite (timeouts)  

### Mecanismos de Transporte

A CLI suporta três tipos de transporte MCP:

- **Transporte Stdio:** Inicia um subprocesso e se comunica por meio de stdin/stdout  
- **Transporte SSE (Server-Sent Events):** Conecta-se a endpoints de eventos enviados pelo servidor  
- **Transporte HTTP Streamable:** Usa streaming HTTP para comunicação  

## Como configurar seu servidor MCP

O Qwen Code usa a configuração `mcpServers` no seu arquivo `settings.json` para localizar e conectar-se a servidores MCP. Essa configuração suporta múltiplos servidores com diferentes mecanismos de transporte.

### Configurar o servidor MCP no arquivo settings.json

Você pode configurar servidores MCP no seu arquivo `settings.json` de duas maneiras principais: por meio do objeto de nível superior `mcpServers`, para definições específicas de servidores, e por meio do objeto `mcp`, para configurações globais que controlam a descoberta e a execução dos servidores.

#### Configurações globais do MCP (`mcp`)

O objeto `mcp` no seu `settings.json` permite definir regras globais para todos os servidores MCP.

- **`mcp.serverCommand`** (string): Um comando global para iniciar um servidor MCP.
- **`mcp.allowed`** (array de strings): Uma lista de nomes de servidores MCP permitidos. Se essa configuração for definida, apenas os servidores dessa lista (correspondendo às chaves do objeto `mcpServers`) serão conectados.
- **`mcp.excluded`** (array de strings): Uma lista de nomes de servidores MCP a serem excluídos. Servidores nessa lista não serão conectados.

**Exemplo:**

```json
{
  "mcp": {
    "allowed": ["meu-servidor-confiavel"],
    "excluded": ["servidor-experimental"]
  }
}
```

#### Configuração Específica do Servidor (`mcpServers`)

O objeto `mcpServers` é onde você define cada servidor MCP individual ao qual a CLI deve se conectar.

### Estrutura da Configuração

Adicione um objeto `mcpServers` ao seu arquivo `settings.json`:

```json
{ ...o arquivo contém outros objetos de configuração
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

### Propriedades da Configuração

Cada configuração de servidor suporta as seguintes propriedades:

#### Obrigatórias (uma das seguintes)

- **`command`** (string): Caminho para o executável usado pelo transporte Stdio  
- **`url`** (string): URL do endpoint SSE (por exemplo, `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): URL do endpoint HTTP com streaming

#### Opcional

- **`args`** (string[]): Argumentos de linha de comando para o transporte Stdio  
- **`headers`** (objeto): Cabeçalhos HTTP personalizados ao usar `url` ou `httpUrl`  
- **`env`** (objeto): Variáveis de ambiente para o processo do servidor. Os valores podem fazer referência a variáveis de ambiente usando a sintaxe `$VAR_NAME` ou `${VAR_NAME}`  
- **`cwd`** (string): Diretório de trabalho para o transporte Stdio  
- **`timeout`** (número): Tempo limite da requisição em milissegundos (padrão: 600.000 ms = 10 minutos)  
- **`trust`** (booleano): Quando `true`, ignora todas as confirmações de chamadas de ferramenta para este servidor (padrão: `false`)  
- **`includeTools`** (string[]): Lista de nomes de ferramentas a serem incluídas deste servidor MCP. Quando especificado, apenas as ferramentas listadas aqui estarão disponíveis a partir deste servidor (comportamento de lista de permissões). Se não for especificado, todas as ferramentas do servidor são habilitadas por padrão.  
- **`excludeTools`** (string[]): Lista de nomes de ferramentas a serem excluídas deste servidor MCP. As ferramentas listadas aqui não estarão disponíveis para o modelo, mesmo que sejam expostas pelo servidor. **Observação:** `excludeTools` tem precedência sobre `includeTools` — se uma ferramenta estiver em ambas as listas, ela será excluída.  
- **`targetAudience`** (string): O ID do Cliente OAuth autorizado na aplicação protegida pelo IAP à qual você está tentando acessar. Usado com `authProviderType: 'service_account_impersonation'`.  
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud a ser representada. Usado com `authProviderType: 'service_account_impersonation'`.

### Suporte a OAuth para Servidores Remotos MCP

O Qwen Code oferece suporte à autenticação OAuth 2.0 para servidores remotos MCP que utilizam os transportes SSE ou HTTP. Isso permite acesso seguro a servidores MCP que exigem autenticação.

#### Descoberta Automática de OAuth

Para servidores que suportam a descoberta de OAuth, é possível omitir a configuração OAuth e permitir que a CLI a descubra automaticamente:

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

A CLI fará automaticamente o seguinte:

- Detectará quando um servidor exigir autenticação OAuth (respostas 401)
- Descobrirá os endpoints OAuth a partir dos metadados do servidor
- Realizará o registro dinâmico do cliente, se suportado
- Gerenciará o fluxo OAuth e os tokens

#### Fluxo de Autenticação

Ao se conectar a um servidor com OAuth habilitado:

1. A **tentativa inicial de conexão** falha com o código 401 (Não Autorizado)  
2. A **descoberta OAuth** identifica os endpoints de autorização e de token  
3. Um **navegador é aberto** para autenticação do usuário (requer acesso a um navegador local)  
4. O **código de autorização** é trocado por tokens de acesso  
5. Os **tokens são armazenados com segurança** para uso futuro  
6. A **nova tentativa de conexão** tem sucesso com os tokens válidos  

#### Requisitos de Redirecionamento no Navegador

**Importante:** A autenticação OAuth exige que sua máquina local possa:

- Abrir um navegador web para autenticação  
- Receber redirecionamentos em `http://localhost:7777/oauth/callback`  

Esse recurso **não funcionará** em:

- Ambientes sem interface gráfica (headless) sem acesso a navegador  
- Sessões remotas SSH sem redirecionamento X11  
- Ambientes containerizados sem suporte a navegador  

#### Gerenciando a Autenticação OAuth

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

- **`enabled`** (booleano): Habilita o OAuth para este servidor  
- **`clientId`** (string): Identificador do cliente OAuth (opcional com registro dinâmico)  
- **`clientSecret`** (string): Segredo do cliente OAuth (opcional para clientes públicos)  
- **`authorizationUrl`** (string): Endpoint de autorização OAuth (descoberto automaticamente se omitido)  
- **`tokenUrl`** (string): Endpoint de token OAuth (descoberto automaticamente se omitido)  
- **`scopes`** (array de strings): Escopos OAuth obrigatórios  
- **`redirectUri`** (string): URI de redirecionamento personalizada (valor padrão: `http://localhost:7777/oauth/callback`)  
- **`tokenParamName`** (string): Nome do parâmetro de consulta para tokens em URLs SSE  
- **`audiences`** (array de strings): Públicos-alvo para os quais o token é válido

#### Gerenciamento de Tokens

Os tokens OAuth são gerenciados automaticamente:

- **Armazenados com segurança** em `~/.qwen/mcp-oauth-tokens.json`
- **Atualizados** quando expirarem (se tokens de atualização estiverem disponíveis)
- **Validados** antes de cada tentativa de conexão
- **Removidos** quando inválidos ou expirados

#### Tipo do Provedor de Autenticação

Você pode especificar o tipo do provedor de autenticação usando a propriedade `authProviderType`:

- **`authProviderType`** (string): Especifica o provedor de autenticação. Pode ser um dos seguintes valores:
  - **`dynamic_discovery`** (padrão): A CLI descobrirá automaticamente a configuração OAuth do servidor.
  - **`google_credentials`**: A CLI usará as Credenciais Padrão do Aplicativo do Google (ADC) para autenticar-se no servidor. Ao usar esse provedor, você deve especificar os escopos necessários.
  - **`service_account_impersonation`**: A CLI assumirá a identidade de uma Conta de Serviço do Google Cloud para autenticar-se no servidor. Isso é útil para acessar serviços protegidos pelo IAP (foi projetado especificamente para serviços do Cloud Run).

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

Para autenticar-se com um servidor usando a Impersonação de Conta de Serviço, você deve definir `authProviderType` como `service_account_impersonation` e fornecer as seguintes propriedades:

- **`targetAudience`** (string): O ID do Cliente OAuth autorizado na aplicação protegida pelo IAP à qual você está tentando acessar.
- **`targetServiceAccount`** (string): O endereço de e-mail da Conta de Serviço do Google Cloud que será impersonada.

A CLI usará suas Credenciais Padrão de Aplicativo (ADC) locais para gerar um token OIDC ID para a conta de serviço e o público especificados. Esse token será então usado para autenticar-se no servidor MCP.

#### Instruções de Configuração

1. **[Crie](https://cloud.google.com/iap/docs/oauth-client-creation) ou use uma ID de cliente OAuth 2.0 existente.** Para usar uma ID de cliente OAuth 2.0 existente, siga as etapas em [Como compartilhar clientes OAuth](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Adicione a ID OAuth à lista de permissões para [acesso programático](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) do aplicativo.** Como o Cloud Run ainda não é um tipo de recurso compatível com o comando `gcloud iap`, você deve adicionar a ID do cliente à lista de permissões no projeto.
3. **Crie uma conta de serviço.** [Documentação](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Link do Console Cloud](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Adicione tanto a conta de serviço quanto os usuários à política do IAP**, na guia "Segurança" do serviço Cloud Run ou via `gcloud`.
5. **Conceda a todos os usuários e grupos** que acessarão o Servidor MCP as permissões necessárias para [impersonar a conta de serviço](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (ou seja, a função `roles/iam.serviceAccountTokenCreator`).
6. **[Ative](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) a API de Credenciais do IAM** para seu projeto.

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

#### Servidor MCP baseado em HTTP com cabeçalhos personalizados

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer seu-token-de-api",
        "X-Custom-Header": "valor-personalizado",
        "Content-Type": "application/json"
      },
      "timeout": 5000
    }
  }
}
```

#### Servidor MCP com filtragem de ferramentas

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

### Servidor MCP SSE com Impersonação de Conta de Serviço

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

## Análise Detalhada do Processo de Descoberta

Quando o Qwen Code é iniciado, ele executa a descoberta de servidores MCP por meio do seguinte processo detalhado:

### 1. Iteração e conexão do servidor

Para cada servidor configurado em `mcpServers`:

1. **Início do acompanhamento de status:** O status do servidor é definido como `CONNECTING`.
2. **Seleção de transporte:** Com base nas propriedades de configuração:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Estabelecimento da conexão:** O cliente MCP tenta se conectar com o tempo limite configurado.
4. **Tratamento de erros:** Falhas na conexão são registradas em log e o status do servidor é definido como `DISCONNECTED`.

### 2. Descoberta de Ferramentas

Após uma conexão bem-sucedida:

1. **Listagem de ferramentas:** O cliente chama o endpoint de listagem de ferramentas do servidor MCP.
2. **Validação de esquema:** A declaração de função de cada ferramenta é validada.
3. **Filtragem de ferramentas:** As ferramentas são filtradas com base na configuração `includeTools` e `excludeTools`.
4. **Sanitização de nomes:** Os nomes das ferramentas são normalizados para atender aos requisitos da API do Qwen:
   - Caracteres inválidos (não alfanuméricos, sublinhados, pontos ou hífens) são substituídos por sublinhados.
   - Nomes com mais de 63 caracteres são truncados com substituição no meio (`___`).

### 3. Resolução de Conflitos

Quando vários servidores expõem ferramentas com o mesmo nome:

1. **Primeiro registro prevalece:** O primeiro servidor a registrar um nome de ferramenta obtém o nome sem prefixo.
2. **Prefixação automática:** Servidores subsequentes recebem nomes com prefixo: `nomeDoServidor__nomeDaFerramenta`.
3. **Rastreamento no registro:** O registro de ferramentas mantém mapeamentos entre os nomes dos servidores e suas respectivas ferramentas.

### 4. Processamento de Esquemas

Os esquemas de parâmetros das ferramentas passam por uma sanitização para garantir compatibilidade com a API:

- Propriedades `$schema` são removidas  
- `additionalProperties` são descartadas  
- Valores padrão em `anyOf` são removidos (para compatibilidade com o Vertex AI)  
- O processamento recursivo é aplicado a esquemas aninhados  

### 5. Gerenciamento de Conexões

Após a descoberta:

- **Conexões persistentes:** Servidores que registrarem ferramentas com sucesso mantêm suas conexões  
- **Limpeza:** Servidores que não fornecerem ferramentas utilizáveis têm suas conexões encerradas  
- **Atualizações de status:** Os status finais dos servidores são definidos como `CONNECTED` ou `DISCONNECTED`  

## Fluxo de Execução de Ferramentas

Quando o modelo decide utilizar uma ferramenta MCP, ocorre o seguinte fluxo de execução:

### 1. Chamada da Ferramenta

O modelo gera um `FunctionCall` contendo:

- **Nome da ferramenta:** O nome registrado (possivelmente com prefixo)  
- **Argumentos:** Objeto JSON compatível com o esquema de parâmetros da ferramenta

### 2. Processo de Confirmação

Cada `DiscoveredMCPTool` implementa uma lógica sofisticada de confirmação:

#### Ignorar com Base na Confiabilidade

```typescript
if (this.trust) {
  return false; // Nenhuma confirmação necessária
}
```

#### Lista de Permissões Dinâmica

O sistema mantém listas internas de permissões para:

- **Nível de servidor:** `serverName` → Todas as ferramentas desse servidor são confiáveis  
- **Nível de ferramenta:** `serverName.toolName` → Essa ferramenta específica é confiável

#### Tratamento da Escolha do Usuário

Quando a confirmação for necessária, o usuário poderá escolher entre:

- **Prosseguir uma vez:** Executar apenas desta vez  
- **Sempre permitir esta ferramenta:** Adicionar à lista de permissões no nível de ferramenta  
- **Sempre permitir este servidor:** Adicionar à lista de permissões no nível de servidor  
- **Cancelar:** Interromper a execução

### 3. Execução

Após a confirmação (ou ignoração da verificação de confiança):

1. **Preparação dos parâmetros:** Os argumentos são validados conforme o esquema da ferramenta.
2. **Chamada MCP:** A `CallableTool` subjacente invoca o servidor com:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Nome original da ferramenta do servidor
       args: params,
     },
   ];
   ```

3. **Processamento da resposta:** Os resultados são formatados tanto para o contexto do modelo de linguagem quanto para exibição ao usuário.

### 4. Tratamento da resposta

O resultado da execução contém:

- **`llmContent`:** Partes brutas da resposta para o contexto do modelo de linguagem.
- **`returnDisplay`:** Saída formatada para exibição ao usuário (geralmente em JSON, dentro de blocos de código Markdown).

## Como interagir com seu servidor MCP

### Usando o comando `/mcp`

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

### Exemplo de saída do `/mcp`

```
Status dos Servidores MCP:

📡 pythonTools (CONNECTED)
  Comando: python -m my_mcp_server --port 8080
  Diretório de trabalho: ./mcp-servers/python
  Tempo limite: 15000ms
  Ferramentas: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Comando: node dist/server.js --verbose
  Erro: Conexão recusada

🐳 dockerizedServer (CONNECTED)
  Comando: docker run -i --rm -e API_KEY my-mcp-server:latest
  Ferramentas: docker__deploy, docker__status

Estado da descoberta: COMPLETED
```

### Uso de Ferramentas

Após serem descobertas, as ferramentas MCP ficam disponíveis para o modelo Qwen como se fossem ferramentas internas. O modelo executará automaticamente as seguintes ações:

1. **Selecionar as ferramentas adequadas**, com base nas suas solicitações  
2. **Exibir caixas de diálogo de confirmação** (a menos que o servidor seja considerado confiável)  
3. **Executar as ferramentas** com os parâmetros corretos  
4. **Exibir os resultados** em um formato amigável ao usuário  

## Monitoramento de Status e Solução de Problemas  

### Estados de Conexão  

A integração MCP acompanha diversos estados:  

#### Status do Servidor (`MCPServerStatus`)  

- **`DISCONNECTED`:** O servidor não está conectado ou apresenta erros  
- **`CONNECTING`:** Tentativa de conexão em andamento  
- **`CONNECTED`:** O servidor está conectado e pronto para uso  

#### Estado da Descoberta (`MCPDiscoveryState`)  

- **`NOT_STARTED`:** A descoberta ainda não foi iniciada  
- **`IN_PROGRESS`:** A descoberta de servidores está em andamento  
- **`COMPLETED`:** A descoberta foi concluída (com ou sem erros)  

### Problemas Comuns e Soluções

#### Servidor Não Consegue se Conectar

**Sintomas:** O servidor exibe o status `DESCONECTADO`

**Solução de problemas:**

1. **Verifique a configuração:** Confirme se `command`, `args` e `cwd` estão corretos  
2. **Teste manualmente:** Execute diretamente o comando do servidor para garantir que ele funcione  
3. **Verifique as dependências:** Certifique-se de que todos os pacotes necessários estejam instalados  
4. **Revise os logs:** Procure mensagens de erro na saída da CLI  
5. **Verifique as permissões:** Certifique-se de que a CLI possa executar o comando do servidor  

#### Nenhuma Ferramenta Descoberta

**Sintomas:** O servidor se conecta, mas nenhuma ferramenta está disponível  

**Solução de problemas:**

1. **Verifique o registro das ferramentas:** Confirme se seu servidor realmente registra ferramentas  
2. **Verifique o protocolo MCP:** Confirme se seu servidor implementa corretamente a listagem de ferramentas do MCP  
3. **Revise os logs do servidor:** Verifique a saída de `stderr` em busca de erros no lado do servidor  
4. **Teste a listagem de ferramentas:** Teste manualmente o endpoint de descoberta de ferramentas do seu servidor

#### Ferramentas Não Executando

**Sintomas:** As ferramentas são descobertas, mas falham durante a execução.

**Solução de problemas:**

1. **Validação de parâmetros:** Certifique-se de que sua ferramenta aceita os parâmetros esperados.
2. **Compatibilidade de esquema:** Verifique se seus esquemas de entrada são JSON Schema válidos.
3. **Tratamento de erros:** Verifique se sua ferramenta está lançando exceções não tratadas.
4. **Problemas de tempo limite:** Considere aumentar a configuração `timeout`.

#### Compatibilidade com Sandbox

**Sintomas:** Servidores MCP falham quando o sandboxing está habilitado.

**Soluções:**

1. **Servidores baseados em Docker:** Use contêineres Docker que incluam todas as dependências.
2. **Acessibilidade de caminhos:** Certifique-se de que os executáveis do servidor estejam disponíveis no sandbox.
3. **Acesso à rede:** Configure o sandbox para permitir as conexões de rede necessárias.
4. **Variáveis de ambiente:** Verifique se as variáveis de ambiente necessárias estão sendo repassadas.

### Dicas de Depuração

1. **Habilite o modo de depuração:** Execute a CLI com `--debug` para obter saída detalhada  
2. **Verifique stderr:** A saída de erro padrão (stderr) do servidor MCP é capturada e registrada (mensagens INFO são filtradas)  
3. **Isolamento de testes:** Teste seu servidor MCP de forma independente antes de integrá-lo  
4. **Configuração incremental:** Comece com ferramentas simples antes de adicionar funcionalidades complexas  
5. **Use `/mcp` com frequência:** Monitore o status do servidor durante o desenvolvimento  

## Observações Importantes  

### Considerações de Segurança  

- **Configurações de confiança:** A opção `trust` ignora todos os diálogos de confirmação. Use-a com cautela e somente em servidores sob seu controle total  
- **Tokens de acesso:** Tenha atenção à segurança ao configurar variáveis de ambiente que contenham chaves de API ou tokens  
- **Compatibilidade com sandbox:** Ao usar sandboxing, certifique-se de que os servidores MCP estejam disponíveis dentro do ambiente de sandbox  
- **Dados privados:** O uso de tokens de acesso pessoal com escopo amplo pode levar à vazão de informações entre repositórios

### Desempenho e Gerenciamento de Recursos

- **Persistência de conexão:** A CLI mantém conexões persistentes com servidores que registraram ferramentas com sucesso  
- **Limpeza automática:** Conexões com servidores que não fornecem nenhuma ferramenta são fechadas automaticamente  
- **Gerenciamento de tempo limite:** Configure tempos limite apropriados com base nas características de resposta do seu servidor  
- **Monitoramento de recursos:** Servidores MCP são executados como processos separados e consomem recursos do sistema

### Compatibilidade de Esquema

- **Modo de conformidade com esquema:** Por padrão (`schemaCompliance: "auto"`), os esquemas das ferramentas são repassados sem alterações. Defina `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` no seu arquivo `settings.json` para converter modelos ao formato estrito OpenAPI 3.0.
- **Transformações OpenAPI 3.0:** Quando o modo `openapi_30` está habilitado, o sistema trata:
  - Tipos anuláveis: `["string", "null"]` → `type: "string", nullable: true`
  - Valores constantes: `const: "foo"` → `enum: ["foo"]`
  - Limites exclusivos: `exclusiveMinimum` numérico → forma booleana com `minimum`
  - Remoção de palavras-chave: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Sanitização de nomes:** Os nomes das ferramentas são automaticamente sanitizados para atender aos requisitos da API.
- **Resolução de conflitos:** Conflitos de nomes entre servidores são resolvidos por meio de prefixação automática.

Essa integração abrangente torna os servidores MCP uma maneira poderosa de estender as capacidades da CLI, mantendo segurança, confiabilidade e facilidade de uso.

## Retornando conteúdo rico das ferramentas

As ferramentas MCP não se limitam a retornar apenas texto simples. É possível retornar conteúdo rico e de várias partes, incluindo texto, imagens, áudio e outros dados binários em uma única resposta da ferramenta. Isso permite criar ferramentas poderosas capazes de fornecer informações diversas ao modelo em uma única interação.

Todos os dados retornados pela ferramenta são processados e enviados ao modelo como contexto para sua próxima geração, permitindo que ele raciocine sobre ou resuma as informações fornecidas.

### Como Funciona

Para retornar conteúdo rico, a resposta da sua ferramenta deve seguir a especificação MCP para um [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result). O campo `content` do resultado deve ser um array de objetos `ContentBlock`. A CLI processará corretamente esse array, separando texto de dados binários e empacotando-os para o modelo.

Você pode combinar livremente diferentes tipos de blocos de conteúdo no array `content`. Os tipos de blocos suportados incluem:

- `text`
- `image`
- `audio`
- `resource` (conteúdo embutido)
- `resource_link`

### Exemplo: Retornando Texto e uma Imagem

Abaixo está um exemplo de uma resposta JSON válida de uma ferramenta MCP que retorna tanto uma descrição textual quanto uma imagem:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Aqui está o logotipo solicitado."
    },
    {
      "type": "image",
      "data": "DADOS_DA_IMAGEM_EM_BASE64_AQUI",
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

1.  Extrai todo o texto e o combina em uma única parte `functionResponse` para o modelo.
2.  Apresenta os dados da imagem como uma parte separada `inlineData`.
3.  Fornece um resumo limpo e amigável ao usuário na CLI, indicando que tanto texto quanto uma imagem foram recebidos.

Isso permite que você crie ferramentas sofisticadas capazes de fornecer contexto rico e multimodal ao modelo Qwen.

## Comandos de barra como prompts do MCP

Além das ferramentas, servidores MCP podem expor prompts predefinidos que podem ser executados como comandos de barra no Qwen Code. Isso permite criar atalhos para consultas comuns ou complexas que podem ser facilmente invocadas pelo nome.

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
    title: 'Escritor de Poemas',
    description: 'Escreva um haicai agradável',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Escreva um haicai${mood ? ` com o humor ${mood}` : ''} chamado ${title}. Observe que um haicai tem 5 sílabas, seguidas por 7 sílabas, seguidas por 5 sílabas.`,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Isso pode ser incluído em `settings.json` sob `mcpServers` da seguinte forma:

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

Depois que um prompt é descoberto, você pode invocá-lo usando seu nome como um comando com barra. A CLI cuida automaticamente da análise dos argumentos.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

ou, usando argumentos posicionais:

```bash
/poem-writer "Qwen Code" reverent
```

Ao executar esse comando, a CLI chama o método `prompts/get` no servidor MCP com os argumentos fornecidos. O servidor é responsável por substituir os argumentos no modelo de prompt e retornar o texto final do prompt. Em seguida, a CLI envia esse prompt ao modelo para execução. Isso fornece uma maneira conveniente de automatizar e compartilhar fluxos de trabalho comuns.

## Gerenciando servidores MCP com `qwen mcp`

Embora você sempre possa configurar servidores MCP editando manualmente seu arquivo `settings.json`, a CLI fornece um conjunto conveniente de comandos para gerenciar suas configurações de servidor de forma programática. Esses comandos simplificam o processo de adicionar, listar e remover servidores MCP sem a necessidade de editar diretamente arquivos JSON.

### Adicionando um Servidor (`qwen mcp add`)

O comando `add` configura um novo servidor MCP no seu arquivo `settings.json`. Com base no escopo (`-s, --scope`), ele será adicionado ao arquivo de configuração do usuário `~/.qwen/settings.json` ou ao arquivo de configuração do projeto `.qwen/settings.json`.

**Comando:**

```bash
qwen mcp add [opções] <nome> <comandoOuUrl> [argumentos...]
```

- `<nome>`: Um nome exclusivo para o servidor.
- `<comandoOuUrl>`: O comando a ser executado (para `stdio`) ou a URL (para `http`/`sse`).
- `[argumentos...]`: Argumentos opcionais para um comando `stdio`.

**Opções (flags):**

- `-s, --scope`: Escopo da configuração (usuário ou projeto). [padrão: "projeto"]
- `-t, --transport`: Tipo de transporte (stdio, sse, http). [padrão: "stdio"]
- `-e, --env`: Define variáveis de ambiente (ex.: `-e CHAVE=valor`).
- `-H, --header`: Define cabeçalhos HTTP para transportes SSE e HTTP (ex.: `-H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"`).
- `--timeout`: Define o tempo limite de conexão em milissegundos.
- `--trust`: Confia no servidor (ignora todos os prompts de confirmação de chamadas de ferramentas).
- `--description`: Define a descrição do servidor.
- `--include-tools`: Lista separada por vírgulas de ferramentas a incluir.
- `--exclude-tools`: Lista separada por vírgulas de ferramentas a excluir.

#### Adicionando um servidor stdio

Esse é o transporte padrão para executar servidores locais.

```bash

# Sintaxe básica
qwen mcp add <nome> <comando> [argumentos...]

# Exemplo: adicionando um servidor local
qwen mcp add meu-servidor-stdio -e API_KEY=123 /caminho/para/o/servidor arg1 arg2 arg3

# Exemplo: adicionando um servidor Python local
qwen mcp add servidor-python python server.py --port 8080
```

#### Adicionando um servidor HTTP

Esse transporte é destinado a servidores que usam o transporte HTTP com suporte a streaming.

```bash

# Sintaxe básica
qwen mcp add --transport http <nome> <url>

# Exemplo: adicionando um servidor HTTP
qwen mcp add --transport http servidor-http https://api.exemplo.com/mcp/

# Exemplo: adicionando um servidor HTTP com um cabeçalho de autenticação
qwen mcp add --transport http http-seguro https://api.exemplo.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Adicionando um servidor SSE

Esse transporte é destinado a servidores que usam Server-Sent Events (SSE).

```bash

# Sintaxe básica
qwen mcp add --transport sse <nome> <url>

# Exemplo: Adicionando um servidor SSE
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Exemplo: Adicionando um servidor SSE com um cabeçalho de autenticação
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### Gerenciando servidores (`qwen mcp`)

Para visualizar e gerenciar todos os servidores MCP atualmente configurados, use o comando `manage` ou simplesmente `qwen mcp`. Isso abre um diálogo interativo TUI no qual você pode:

- Visualizar todos os servidores MCP com seu status de conexão
- Habilitar/desabilitar servidores
- Reconectar-se a servidores desconectados
- Visualizar as ferramentas e prompts fornecidos por cada servidor
- Visualizar os logs do servidor

**Comando:**

```bash
qwen mcp

# ou
qwen mcp manage
```

O diálogo de gerenciamento fornece uma interface visual que mostra o nome de cada servidor, detalhes da configuração, status da conexão e ferramentas/prompts disponíveis.

### Removendo um Servidor (`qwen mcp remove`)

Para excluir um servidor da sua configuração, use o comando `remove` com o nome do servidor.

**Comando:**

```bash
qwen mcp remove <nome>
```

**Exemplo:**

```bash
qwen mcp remove meu-servidor
```

Isso localizará e excluirá a entrada "meu-servidor" do objeto `mcpServers` no arquivo `settings.json` apropriado, com base no escopo (`-s, --scope`).