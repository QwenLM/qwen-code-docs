# SDK Java do Qwen Code

O SDK Java do Qwen Code é um SDK experimental mínimo para acesso programático às funcionalidades do Qwen Code. Ele fornece uma interface Java para interagir com a CLI do Qwen Code, permitindo que desenvolvedores integrem as capacidades do Qwen Code em seus aplicativos Java.

## Requisitos

- Java >= 1.8
- Maven >= 3.6.0 (para compilação a partir do código-fonte)
- qwen-code >= 0.5.0

### Dependências

- **Registro de eventos (logging)**: ch.qos.logback:logback-classic
- **Utilitários**: org.apache.commons:commons-lang3
- **Processamento JSON**: com.alibaba.fastjson2:fastjson2
- **Testes**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Instalação

Adicione a seguinte dependência ao seu arquivo `pom.xml` do Maven:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Ou, se estiver usando Gradle, adicione ao seu `build.gradle`:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Compilação e Execução

### Comandos de compilação

```bash

# Compilar o projeto
mvn compile

# Executar os testes
mvn test

# Empacotar o JAR
mvn package

# Instalar no repositório local
mvn install

## Início Rápido

A maneira mais simples de usar o SDK é através do método `QwenCodeCli.simpleQuery()`:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Para uso avançado com opções personalizadas de transporte:

```java
public static void runTransportOptionsExample() {
    TransportOptions options = new TransportOptions()
            .setModel("qwen3-coder-flash")
            .setPermissionMode(PermissionMode.AUTO_EDIT)
            .setCwd("./")
            .setEnv(new HashMap<String, String>() {{put("CUSTOM_VAR", "value");}})
            .setIncludePartialMessages(true)
            .setTurnTimeout(new Timeout(120L, TimeUnit.SECONDS))
            .setMessageTimeout(new Timeout(90L, TimeUnit.SECONDS))
            .setAllowedTools(Arrays.asList("read_file", "write_file", "list_directory"));

    List<String> result = QwenCodeCli.simpleQuery("quem você é e quais são suas capacidades?", options);
    result.forEach(logger::info);
}
```

Para tratamento de conteúdo em modo de streaming com consumidores de conteúdo personalizados:

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("quem você é e quais são suas capacidades?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Conteúdo de texto recebido: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("Conteúdo de raciocínio recebido: {}", thingkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Conteúdo de uso de ferramenta recebido: {} com argumentos: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Resultado da ferramenta recebido: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Outro conteúdo recebido: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Informações de uso recebidas: Tokens de entrada: {}, Tokens de saída: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Exemplo de streaming concluído.");
}
```

Outros exemplos estão disponíveis em `src/test/java/com/alibaba/qwen/code/cli/example`

## Arquitetura

O SDK segue uma arquitetura em camadas:

- **Camada de API**: Fornece os principais pontos de entrada por meio da classe `QwenCodeCli`, com métodos estáticos simples para uso básico  
- **Camada de Sessão**: Gerencia as sessões de comunicação com a CLI do Qwen Code por meio da classe `Session`  
- **Camada de Transporte**: Lida com o mecanismo de comunicação entre o SDK e o processo da CLI (atualmente usando transporte por processo via `ProcessTransport`)  
- **Camada de Protocolo**: Define as estruturas de dados para comunicação com base no protocolo da CLI  
- **Utilitários**: Utilitários comuns para execução concorrente, tratamento de tempo limite e gerenciamento de erros  

## Principais Recursos

### Modos de Permissão

O SDK suporta diferentes modos de permissão para controlar a execução de ferramentas:

- **`default`**: Ferramentas de gravação são negadas, a menos que sejam aprovadas via callback `canUseTool` ou listadas em `allowedTools`. Ferramentas somente leitura são executadas sem confirmação.
- **`plan`**: Bloqueia todas as ferramentas de gravação, instruindo a IA a apresentar primeiro um plano.
- **`auto-edit`**: Aprova automaticamente ferramentas de edição (como `edit` e `write_file`), enquanto outras ferramentas exigem confirmação.
- **`yolo`**: Todas as ferramentas são executadas automaticamente, sem confirmação.

### Consumidores de Eventos de Sessão e Consumidores de Conteúdo do Assistente

O SDK fornece duas interfaces principais para lidar com eventos e conteúdo provenientes da CLI:

#### Interface SessionEventConsumers

A interface `SessionEventConsumers` fornece callbacks para diferentes tipos de mensagens durante uma sessão:

- `onSystemMessage`: Trata mensagens do sistema provenientes da CLI (recebe `Session` e `SDKSystemMessage`)
- `onResultMessage`: Trata mensagens de resultado provenientes da CLI (recebe `Session` e `SDKResultMessage`)
- `onAssistantMessage`: Trata mensagens do assistente (respostas de IA) (recebe `Session` e `SDKAssistantMessage`)
- `onPartialAssistantMessage`: Trata mensagens parciais do assistente durante o streaming (recebe `Session` e `SDKPartialAssistantMessage`)
- `onUserMessage`: Trata mensagens do usuário (recebe `Session` e `SDKUserMessage`)
- `onOtherMessage`: Trata outros tipos de mensagens (recebe `Session` e uma mensagem do tipo `String`)
- `onControlResponse`: Trata respostas de controle (recebe `Session` e `CLIControlResponse`)
- `onControlRequest`: Trata solicitações de controle (recebe `Session` e `CLIControlRequest`, retorna `CLIControlResponse`)
- `onPermissionRequest`: Trata solicitações de permissão (recebe `Session` e `CLIControlRequest<CLIControlPermissionRequest>`, retorna `Behavior`)

#### Interface `AssistantContentConsumers`

A interface `AssistantContentConsumers` lida com diferentes tipos de conteúdo nas mensagens do assistente:

- `onText`: lida com conteúdo de texto (recebe `Session` e `TextAssistantContent`)
- `onThinking`: lida com conteúdo de raciocínio (recebe `Session` e `ThingkingAssistantContent`)
- `onToolUse`: lida com conteúdo de uso de ferramenta (recebe `Session` e `ToolUseAssistantContent`)
- `onToolResult`: lida com conteúdo de resultado de ferramenta (recebe `Session` e `ToolResultAssistantContent`)
- `onOtherContent`: lida com outros tipos de conteúdo (recebe `Session` e `AssistantContent`)
- `onUsage`: lida com informações de uso (recebe `Session` e `AssistantUsage`)
- `onPermissionRequest`: lida com solicitações de permissão (recebe `Session` e `CLIControlPermissionRequest`, retorna `Behavior`)
- `onOtherControlRequest`: lida com outras solicitações de controle (recebe `Session` e `ControlRequestPayload`, retorna `ControlResponsePayload`)

#### Relação Entre as Interfaces

**Observação Importante sobre a Hierarquia de Eventos:**

- `SessionEventConsumers` é o processador de eventos de **alto nível**, responsável por lidar com diferentes tipos de mensagens (sistema, assistente, usuário, etc.)
- `AssistantContentConsumers` é o processador de conteúdo de **baixo nível**, responsável por lidar com diferentes tipos de conteúdo dentro das mensagens do assistente (texto, ferramentas, raciocínio, etc.)

**Relação entre Processadores:**

- `SessionEventConsumers` → `AssistantContentConsumers` (`SessionEventConsumers` usa `AssistantContentConsumers` para processar o conteúdo nas mensagens do assistente)

**Relações de Derivação de Eventos:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Relações de Tempo Limite (Timeout) dos Eventos:**

Cada método manipulador de evento possui um método correspondente de tempo limite que permite personalizar o comportamento de timeout para esse evento específico:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Para os métodos de timeout de `AssistantContentConsumers`:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Valores Padrão de Tempo Limite (Timeout):**

- Tempo limite padrão de `SessionEventSimpleConsumers`: 180 segundos (`Timeout.TIMEOUT_180_SECONDS`)
- Tempo limite padrão de `AssistantContentSimpleConsumers`: 60 segundos (`Timeout.TIMEOUT_60_SECONDS`)

**Requisitos da Hierarquia de Tempos Limite (Timeout):**

Para funcionamento adequado, as seguintes relações de tempo limite devem ser mantidas:

- O valor retornado por `onAssistantMessageTimeout` deve ser maior que os valores retornados por `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` e `onOtherContentTimeout`
- O valor retornado por `onControlRequestTimeout` deve ser maior que os valores retornados por `onPermissionRequestTimeout` e `onOtherControlRequestTimeout`

### Opções de Transporte

A classe `TransportOptions` permite configurar como o SDK se comunica com a CLI do Qwen Code:

- `pathToQwenExecutable`: Caminho para o executável da CLI do Qwen Code  
- `cwd`: Diretório de trabalho para o processo da CLI  
- `model`: Modelo de IA a ser usado na sessão  
- `permissionMode`: Modo de permissão que controla a execução de ferramentas  
- `env`: Variáveis de ambiente a serem passadas para o processo da CLI  
- `maxSessionTurns`: Limita o número de rodadas de conversa em uma sessão  
- `coreTools`: Lista de ferramentas principais que devem estar disponíveis para a IA  
- `excludeTools`: Lista de ferramentas a serem excluídas da disponibilidade para a IA  
- `allowedTools`: Lista de ferramentas pré-aprovadas para uso sem confirmação adicional  
- `authType`: Tipo de autenticação a ser usado na sessão  
- `includePartialMessages`: Habilita o recebimento de mensagens parciais durante respostas em streaming  
- `turnTimeout`: Tempo limite para uma rodada completa de conversa  
- `messageTimeout`: Tempo limite para mensagens individuais dentro de uma rodada  
- `resumeSessionId`: ID de uma sessão anterior a ser retomada  
- `otherOptions`: Opções adicionais de linha de comando a serem passadas para a CLI

### Recursos de Controle de Sessão

- **Criação de sessão**: Use `QwenCodeCli.newSession()` para criar uma nova sessão com opções personalizadas  
- **Gerenciamento de sessão**: A classe `Session` fornece métodos para enviar prompts, lidar com respostas e gerenciar o estado da sessão  
- **Encerramento de sessão**: Sempre feche as sessões usando `session.close()` para encerrar corretamente o processo da CLI  
- **Retomada de sessão**: Use `setResumeSessionId()` em `TransportOptions` para retomar uma sessão anterior  
- **Interrupção de sessão**: Use `session.interrupt()` para interromper um prompt atualmente em execução  
- **Alteração dinâmica de modelo**: Use `session.setModel()` para alterar o modelo durante uma sessão  
- **Alteração dinâmica do modo de permissão**: Use `session.setPermissionMode()` para alterar o modo de permissão durante uma sessão

### Configuração do Pool de Threads

O SDK usa um pool de threads para gerenciar operações concorrentes com a seguinte configuração padrão:

- **Tamanho do Pool Principal**: 30 threads  
- **Tamanho Máximo do Pool**: 100 threads  
- **Tempo de Espera (Keep-Alive)**: 60 segundos  
- **Capacidade da Fila**: 300 tarefas (usando `LinkedBlockingQueue`)  
- **Nomenclatura das Threads**: `"qwen_code_cli-pool-{número}"`  
- **Threads Daemon**: `false`  
- **Política para Execuções Rejeitadas**: `CallerRunsPolicy`

## Tratamento de Erros

O SDK fornece tipos específicos de exceção para diferentes cenários de erro:

- `SessionControlException`: Lançada quando há um problema com o controle da sessão (criação, inicialização etc.)  
- `SessionSendPromptException`: Lançada quando há um problema ao enviar um prompt ou receber uma resposta  
- `SessionClosedException`: Lançada ao tentar usar uma sessão já fechada  

## Perguntas Frequentes / Solução de Problemas

### P: Preciso instalar a CLI do Qwen separadamente?

R: Sim, é necessário ter a CLI do Qwen versão 0.5.5 ou superior.

### P: Quais versões do Java são compatíveis?

R: O SDK requer Java 1.8 ou superior.

### P: Como tratar requisições de longa duração?

R: O SDK inclui utilitários de tempo limite (*timeout*). Você pode configurar tempos limite usando a classe `Timeout` em `TransportOptions`.

### P: Por que algumas ferramentas não estão sendo executadas?

R: Isso provavelmente ocorre devido aos modos de permissão. Verifique suas configurações de modo de permissão e considere usar `allowedTools` para pré-aprovar determinadas ferramentas.

### P: Como retomar uma sessão anterior?

R: Use o método `setResumeSessionId()` em `TransportOptions` para retomar uma sessão anterior.

### P: Posso personalizar o ambiente para o processo da CLI?

R: Sim, use o método `setEnv()` em `TransportOptions` para passar variáveis de ambiente ao processo da CLI.

## Licença

Apache-2.0 — consulte [LICENSE](./LICENSE) para detalhes.