# Qwen Code Java SDK

O Qwen Code Java SDK é um SDK experimental mínimo para acesso programático às funcionalidades do Qwen Code. Ele fornece uma interface Java para interagir com a CLI do Qwen Code, permitindo que desenvolvedores integrem os recursos do Qwen Code em suas aplicações Java.

## Requisitos

- Java >= 1.8
- Maven >= 3.6.0 (para build a partir do código-fonte)
- qwen-code >= 0.5.0

### Dependências

- **Logging**: ch.qos.logback:logback-classic
- **Utilitários**: org.apache.commons:commons-lang3
- **Processamento de JSON**: com.alibaba.fastjson2:fastjson2
- **Testes**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Instalação

Adicione a seguinte dependência ao seu `pom.xml` do Maven:

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

## Build e Execução

### Comandos de Build

```bash
# Compila o projeto
mvn compile

# Executa os testes
mvn test

# Empacota o JAR
mvn package

# Instala no repositório local
mvn install
```

## Início Rápido

A maneira mais simples de usar o SDK é através do método `QwenCodeCli.simpleQuery()`:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Para um uso mais avançado com opções de transporte personalizadas:

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

    List<String> result = QwenCodeCli.simpleQuery("who are you, what are your capabilities?", options);
    result.forEach(logger::info);
}
```

Para o tratamento de conteúdo em streaming com consumidores de conteúdo personalizados:

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("who are you, what are your capabilities?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Text content received: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThinkingAssistantContent thinkingAssistantContent) {
                    logger.info("Thinking content received: {}", thinkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Tool use content received: {} with arguments: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Tool result content received: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Other content received: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Usage information received: Input tokens: {}, Output tokens: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Streaming example completed.");
}
```

Para outros exemplos, consulte `src/test/java/com/alibaba/qwen/code/cli/example`

## Arquitetura

O SDK segue uma arquitetura em camadas:

- **Camada de API**: Fornece os principais pontos de entrada através da classe `QwenCodeCli` com métodos estáticos simples para uso básico
- **Camada de Sessão**: Gerencia sessões de comunicação com a CLI do Qwen Code através da classe `Session`
- **Camada de Transporte**: Lida com o mecanismo de comunicação entre o SDK e o processo da CLI (atualmente usando transporte de processo via `ProcessTransport`)
- **Camada de Protocolo**: Define estruturas de dados para comunicação com base no protocolo da CLI
- **Utils**: Utilitários comuns para execução concorrente, tratamento de timeout e gerenciamento de erros

## Principais Recursos

### Modos de Permissão

O SDK suporta diferentes modos de permissão para controlar a execução de ferramentas:

- **`default`**: Ferramentas de escrita são negadas, a menos que aprovadas via callback `canUseTool` ou em `allowedTools`. Ferramentas somente leitura são executadas sem confirmação.
- **`plan`**: Bloqueia todas as ferramentas de escrita, instruindo a IA a apresentar um plano primeiro.
- **`auto-edit`**: Aprova automaticamente ferramentas de edição (`edit`, `write_file`), enquanto outras ferramentas exigem confirmação.
- **`yolo`**: Todas as ferramentas são executadas automaticamente sem confirmação.

### Session Event Consumers e Assistant Content Consumers

O SDK fornece duas interfaces principais para lidar com eventos e conteúdo da CLI:

#### Interface SessionEventConsumers

A interface `SessionEventConsumers` fornece callbacks para diferentes tipos de mensagens durante uma sessão:

- `onSystemMessage`: Lida com mensagens do sistema da CLI (recebe `Session` e `SDKSystemMessage`)
- `onResultMessage`: Lida com mensagens de resultado da CLI (recebe `Session` e `SDKResultMessage`)
- `onAssistantMessage`: Lida com mensagens do assistente (respostas da IA) (recebe `Session` e `SDKAssistantMessage`)
- `onPartialAssistantMessage`: Lida com mensagens parciais do assistente durante streaming (recebe `Session` e `SDKPartialAssistantMessage`)
- `onUserMessage`: Lida com mensagens do usuário (recebe `Session` e `SDKUserMessage`)
- `onOtherMessage`: Lida com outros tipos de mensagens (recebe `Session` e mensagem `String`)
- `onControlResponse`: Lida com respostas de controle (recebe `Session` e `CLIControlResponse`)
- `onControlRequest`: Lida com solicitações de controle (recebe `Session` e `CLIControlRequest`, retorna `CLIControlResponse`)
- `onPermissionRequest`: Lida com solicitações de permissão (recebe `Session` e `CLIControlRequest<CLIControlPermissionRequest>`, retorna `Behavior`)

#### Interface AssistantContentConsumers

A interface `AssistantContentConsumers` lida com diferentes tipos de conteúdo dentro das mensagens do assistente:

- `onText`: Lida com conteúdo de texto (recebe `Session` e `TextAssistantContent`)
- `onThinking`: Lida com conteúdo de thinking (recebe `Session` e `ThinkingAssistantContent`)
- `onToolUse`: Lida com conteúdo de uso de ferramenta (recebe `Session` e `ToolUseAssistantContent`)
- `onToolResult`: Lida com conteúdo de resultado de ferramenta (recebe `Session` e `ToolResultAssistantContent`)
- `onOtherContent`: Lida com outros tipos de conteúdo (recebe `Session` e `AssistantContent`)
- `onUsage`: Lida com informações de uso (recebe `Session` e `AssistantUsage`)
- `onPermissionRequest`: Lida com solicitações de permissão (recebe `Session` e `CLIControlPermissionRequest`, retorna `Behavior`)
- `onOtherControlRequest`: Lida com outras solicitações de controle (recebe `Session` e `ControlRequestPayload`, retorna `ControlResponsePayload`)

#### Relação Entre as Interfaces

**Nota Importante sobre a Hierarquia de Eventos:**

- `SessionEventConsumers` é o processador de eventos de **alto nível** que lida com diferentes tipos de mensagens (sistema, assistente, usuário, etc.)
- `AssistantContentConsumers` é o processador de conteúdo de **baixo nível** que lida com diferentes tipos de conteúdo dentro das mensagens do assistente (texto, ferramentas, thinking, etc.)

**Relação de Processamento:**

- `SessionEventConsumers` → `AssistantContentConsumers` (`SessionEventConsumers` usa `AssistantContentConsumers` para processar conteúdo dentro das mensagens do assistente)

**Relações de Derivação de Eventos:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Relações de Timeout de Eventos:**

Cada método de manipulador de eventos possui um método de timeout correspondente que permite personalizar o comportamento de timeout para aquele evento específico:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Para os métodos de timeout do `AssistantContentConsumers`:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Valores Padrão de Timeout:**

- Timeout padrão do `SessionEventSimpleConsumers`: 180 segundos (`Timeout.TIMEOUT_180_SECONDS`)
- Timeout padrão do `AssistantContentSimpleConsumers`: 60 segundos (`Timeout.TIMEOUT_60_SECONDS`)

**Requisitos de Hierarquia de Timeout:**

Para o funcionamento adequado, as seguintes relações de timeout devem ser mantidas:

- O valor de retorno de `onAssistantMessageTimeout` deve ser maior que os valores de retorno de `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` e `onOtherContentTimeout`
- O valor de retorno de `onControlRequestTimeout` deve ser maior que os valores de retorno de `onPermissionRequestTimeout` e `onOtherControlRequestTimeout`

### Opções de Transporte

A classe `TransportOptions` permite configurar como o SDK se comunica com a CLI do Qwen Code:

- `pathToQwenExecutable`: Caminho para o executável da CLI do Qwen Code
- `cwd`: Diretório de trabalho para o processo da CLI
- `model`: Modelo de IA a ser usado na sessão
- `permissionMode`: Modo de permissão que controla a execução de ferramentas
- `env`: Variáveis de ambiente a serem passadas para o processo da CLI
- `maxSessionTurns`: Limita o número de turnos de conversa em uma sessão
- `coreTools`: Lista de ferramentas principais que devem estar disponíveis para a IA
- `excludeTools`: Lista de ferramentas a serem excluídas da disponibilidade para a IA
- `allowedTools`: Lista de ferramentas pré-aprovadas para uso sem confirmação adicional
- `authType`: Tipo de autenticação a ser usado na sessão
- `includePartialMessages`: Habilita o recebimento de mensagens parciais durante respostas em streaming
- `turnTimeout`: Timeout para um turno completo de conversa
- `messageTimeout`: Timeout para mensagens individuais dentro de um turno
- `resumeSessionId`: ID de uma sessão anterior para retomar
- `otherOptions`: Opções adicionais de linha de comando a serem passadas para a CLI

### Recursos de Controle de Sessão

- **Criação de sessão**: Use `QwenCodeCli.newSession()` para criar uma nova sessão com opções personalizadas
- **Gerenciamento de sessão**: A classe `Session` fornece métodos para enviar prompts, lidar com respostas e gerenciar o estado da sessão
- **Limpeza de sessão**: Sempre feche as sessões usando `session.close()` para encerrar corretamente o processo da CLI
- **Retomada de sessão**: Use `setResumeSessionId()` em `TransportOptions` para retomar uma sessão anterior
- **Interrupção de sessão**: Use `session.interrupt()` para interromper um prompt em execução
- **Troca dinâmica de modelo**: Use `session.setModel()` para alterar o modelo durante uma sessão
- **Troca dinâmica de modo de permissão**: Use `session.setPermissionMode()` para alterar o modo de permissão durante uma sessão

### Configuração do Thread Pool

O SDK usa um thread pool para gerenciar operações concorrentes com a seguinte configuração padrão:

- **Core Pool Size**: 30 threads
- **Maximum Pool Size**: 100 threads
- **Keep-Alive Time**: 60 segundos
- **Queue Capacity**: 300 tarefas (usando `LinkedBlockingQueue`)
- **Thread Naming**: "qwen_code_cli-pool-{number}"
- **Daemon Threads**: false
- **Rejected Execution Handler**: `CallerRunsPolicy`

## Tratamento de Erros

O SDK fornece tipos de exceção específicos para diferentes cenários de erro:

- `SessionControlException`: Lançada quando há um problema com o controle de sessão (criação, inicialização, etc.)
- `SessionSendPromptException`: Lançada quando há um problema ao enviar um prompt ou receber uma resposta
- `SessionClosedException`: Lançada ao tentar usar uma sessão fechada

## FAQ / Solução de Problemas

### P: Preciso instalar a CLI do Qwen separadamente?

R: Sim, é necessário o Qwen CLI 0.5.5 ou superior.

### P: Quais versões do Java são suportadas?

R: O SDK requer Java 1.8 ou superior.

### P: Como lidar com solicitações de longa duração?

R: O SDK inclui utilitários de timeout. Você pode configurar os timeouts usando a classe `Timeout` em `TransportOptions`.

### P: Por que algumas ferramentas não estão sendo executadas?

R: Isso provavelmente se deve aos modos de permissão. Verifique suas configurações de modo de permissão e considere usar `allowedTools` para pré-aprovar determinadas ferramentas.

### P: Como retomar uma sessão anterior?

R: Use o método `setResumeSessionId()` em `TransportOptions` para retomar uma sessão anterior.

### P: Posso personalizar o ambiente para o processo da CLI?

R: Sim, use o método `setEnv()` em `TransportOptions` para passar variáveis de ambiente para o processo da CLI.

## Licença

Apache-2.0 - consulte [LICENSE](./LICENSE) para mais detalhes.