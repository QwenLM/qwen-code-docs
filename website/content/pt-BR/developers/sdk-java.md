# SDK Java do Qwen Code

O SDK Java do Qwen Code fornece um transporte de daemon recomendado para `qwen serve` e mantém a API stdio legada experimental para compatibilidade. Ambas as APIs são distribuídas no mesmo artefato `com.alibaba:qwencode-sdk`.

## Requisitos

- Java >= 11 para `0.1.0-alpha`
- Maven >= 3.9.2 ao compilar ou publicar este SDK a partir do código-fonte
- Um `qwen serve` compatível para a API do daemon, ou qwen-code >= 0.5.0 para a API stdio legada

### Dependências

- **Logging API**: org.slf4j:slf4j-api (escolha um provedor SLF4J na sua aplicação)
- **Utilitários**: org.apache.commons:commons-lang3
- **Processamento JSON**: Fastjson2 para codificação e Jackson Core para decodificação estrita
- **Testes**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Instalação

Adicione a seguinte dependência ao seu `pom.xml` do Maven:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>0.1.0-alpha</version>
</dependency>
```

Ou se estiver usando Gradle, adicione ao seu `build.gradle`:

```gradle
implementation 'com.alibaba:qwencode-sdk:0.1.0-alpha'
```

## Compilação e Execução

### Comandos de Compilação

```bash
# Compilar o projeto
mvn compile

# Executar testes
mvn test

# Empacotar o JAR
mvn package

# Instalar no repositório local
mvn install
```

### E2E com daemon real a partir do código-fonte

Execute os testes de integração Java com daemon real a partir da raiz do repositório após compilar ambos os workspaces e o bundle CLI raiz:

```bash
npm run build
npm run bundle
npx tsx scripts/run-java-daemon-sdk-e2e.ts
```

`npm run build` sozinho não atualiza `dist/cli.js`; o harness E2E lança esse bundle e falha com um erro de pré-requisito explícito quando ele está ausente.

## API de daemon recomendada

Inicie o `qwen serve`, depois crie uma sessão independente com escopo de thread. `promptText` retorna apenas após um `turn_complete` correspondente; streams incompletos falham com `PromptOutcomeIndeterminateException` em vez de retornar texto parcial como sucesso.

Para as garantias de ciclo de vida assumidas pela `0.1.0-alpha`, use o build do qwen-code lançado a partir da mesma revisão de código-fonte do SDK. O daemon deve conter o ledger idempotente de detach por cliente do [#7386](https://github.com/QwenLM/qwen-code/pull/7386), a garantia de terminal por epoch do [#7400](https://github.com/QwenLM/qwen-code/pull/7400), e o cancelamento de admissão reconhecido desta release mais a cerca de drenagem de cancelamento FIFO. O commit #7400 sozinho não é suficiente: um daemon com o mesmo wire pode reconhecer o cancelamento antes do dispatch do agente sem parar o prompt admitido, ou deixar um cancelamento não reconhecido com escopo de sessão alcançar um sucessor na fila. O filho ACP incluído usa um handshake de cancelamento consciente de admissão; um filho ACP conforme aos padrões sem essa extensão recebe uma notificação padrão `session/cancel`. A negociação de features não consegue distinguir builds de daemon mais antigos com o mesmo wire, então o SDK falha de forma fechada em vez de reportar saída parcial como sucesso.

O handshake de cancelamento incluído deliberadamente aguarda o prompt alvo liquidar antes do daemon despachar seu sucessor na fila. Ele não tem timeout que apenas reconhece o cancelamento: isso poderia deixar um cancelamento tardio com escopo de sessão alcançar o próximo prompt. Se um provedor, ferramenta ou integração personalizada ignora seu `AbortSignal` indefinidamente, a mutação de cancelamento pode portanto permanecer com resultado desconhecido e aquela sessão não deve ser reutilizada. Trate um terminal formal de prompt recebido dentro do boundary de observação do chamador como autorizado; caso contrário, feche ou destrua a sessão após a observação falhar. Recuperar um filho ACP compartilhado travado sem perturbar suas sessões irmãs exige isolamento de runtime mais forte e está fora deste contrato alpha.

```java
import com.alibaba.qwen.code.daemon.DaemonClient;
import com.alibaba.qwen.code.daemon.DaemonSessionClient;
import com.alibaba.qwen.code.daemon.PromptTextResult;
import java.net.URI;

try (DaemonClient daemon = DaemonClient.builder()
        .baseUri(URI.create("http://127.0.0.1:4170"))
        .build();
     DaemonSessionClient session = daemon.createSession()) {
    PromptTextResult result = session.promptText("Explain this repository");
    System.out.println(result.getText());
}
```

Chamadores que precisam alocar a identidade da sessão antes da criação podem passar um RFC UUID v1-v5. O SDK verifica `session_id_override` antes da mutação e reporta um ID retornado diferente como `SessionCreationOutcomeUnknownException`:

```java
CreateSessionRequest request = CreateSessionRequest.builder()
        .sessionId("550E8400-E29B-41D4-A716-446655440000")
        .build();

try (DaemonSessionClient session = daemon.createSession(request)) {
    System.out.println(session.getSession().getSessionId());
}
```

O daemon normaliza o ID para minúsculas e cria uma nova sessão com thread. Este não é um attach idempotente; após um resultado ambíguo de criação, recupere com o ID conhecido em vez de repetir a criação.

Se o `qwen serve` requer autenticação, adicione
`.bearerToken(System.getenv("QWEN_SERVER_TOKEN"))` ao builder do `DaemonClient`.
O SDK envia o bearer em requisições REST e SSE e nunca o coloca na URL.

Use `startPrompt` com um `PromptObserver` quando precisar de callbacks ordenados de texto, pensamento, ferramenta, uso, permissão e evento bruto. Suas visões `acceptanceFuture()` e `completionFuture()` expõem separadamente a admissão pelo daemon e o terminal confiável do turno. `respondToPermission()` retorna `false` quando a requisição já foi resolvida ou não está mais pendente. Cancelar as visões future não cancela o prompt do daemon; use `cancelActivePrompt()` para a operação de cancelamento de sessão no daemon e ainda aguarde o terminal correspondente. Um cancelamento cooperativo completa com `turn_complete` e `stopReason=cancelled`; `promptText()` retorna seu `PromptTextResult`, então chamadores que distinguem cancelamento devem inspecionar `result.getTerminal().getStopReason()`. Se o agente ou provedor falhar durante o cancelamento, o daemon pode em vez disso publicar `turn_error`, que faz `promptText()` lançar `PromptTurnException`.

Quando cancelamento, deadline, teardown ou liquidação do agente competem, o latch exactly-once do daemon publica o primeiro terminal formal e suprime candidatos posteriores. Sempre faça branch no terminal recebido em si; a última mutação de controle enviada pelo cliente não determina o tipo de terminal ou código de erro.

O transporte SSE envia `Accept-Encoding: identity` e `Last-Event-ID`, valida enquadramento e IDs de evento, deduplica replay e reconecta apenas o SSE GET. Prompts e outras requisições de mutação nunca são repetidas automaticamente. Respostas HTTP 408 e 5xx para admissão de prompt, criação de sessão, permissão, cancelamento, heartbeat, detach ou delete são reportadas como resultado desconhecido porque não provam que o daemon rejeitou a mutação. Corpos de resposta finitos e observação SSE têm deadlines independentes.

A seleção de modelo no momento da criação intencionalmente não é exposta pela API do daemon Java do SDK nesta alpha. O daemon reporta um `modelServiceId` rejeitado apenas como um evento SSE emitido antes da resposta de criação, enquanto este SDK abre seu stream a partir da marca d'água posterior de admissão de prompt. Até o daemon retornar um resultado definitivo de criação ou o SDK possuir uma assinatura separada de eventos de sessão a partir de `Last-Event-ID: 0`, use o modelo padrão configurado do daemon.

`PromptRequest.Builder.deadline(Duration)` solicita um deadline de prompt aplicado pelo daemon e é aceito apenas quando o daemon anuncia `prompt_absolute_deadline`; caso contrário, o SDK falha antes de enviar o prompt. O valor deve estar entre 1 e 2.147.483.647 milissegundos, correspondendo à faixa de timer Node do daemon. Isso é separado de `observationTimeout(Duration)`, que limita apenas a observação SSE local e nunca envia uma mutação de cancelamento.

Antes de criar uma sessão, o SDK exige que o daemon anuncie o transporte REST e `session_scope_override`; isso impede que um daemon mais antigo ignore silenciosamente o escopo `thread` solicitado e anexe o cliente a uma sessão compartilhada. Quando `client_heartbeat` é anunciado, uma sessão aberta envia um heartbeat fresco a cada minuto para que o daemon não recolha um cliente ocioso. Defina `heartbeatInterval(Duration.ZERO)` no builder do `DaemonClient` para desabilitar esse comportamento, ou escolha um intervalo positivo diferente. Um heartbeat nunca é repetido; o próximo heartbeat agendado é um keepalive separado. A observação de prompt é limitada a 32 prompts concorrentes por cliente por padrão e pode ser ajustada com `maximumConcurrentPrompts`. Callbacks de admissão e terminal future executam fora dos workers de transporte; callbacks que permanecem bloqueados consomem capacidade de publicação limitada. A limpeza do stream SSE também é limitada, e um close que permanece bloqueado retém sua reserva de limpeza. Qualquer condição pode causar um `startPrompt` posterior a falhar com `DaemonClientCapacityException` em vez de descartar um timeout close ou crescer threads e trabalho na fila sem limite.

Uma conclusão indeterminada é um boundary de resultado, não um boundary de reutilização de sessão. Após `PromptAdmissionUnknownException` ou `PromptOutcomeIndeterminateException`, aquele `DaemonSessionClient` rejeita permanentemente prompts adicionais mesmo que a limpeza local do stream depois seja bem-sucedida; feche ou destrua a sessão em vez disso. Um timeout de observação é publicado sem aguardar indefinidamente por um close de stream bloqueado, enquanto a limpeza continua assincronamente e retém capacidade limitada do cliente até terminar.

## API stdio legada

A API existente `com.alibaba.qwen.code.cli` permanece disponível:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Para uso mais avançado com opções de transporte personalizadas:

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

Para manipulação de conteúdo em streaming com consumidores de conteúdo personalizados:

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

outros exemplos veja src/test/java/com/alibaba/qwen/code/cli/example

## Migração Java 11 e limites alpha

`0.1.0-alpha` eleva a versão mínima do Java para todo o artefato de 8 para 11. Aplicações Java 8 devem permanecer na `0.0.3-alpha`. Logback não é mais uma dependência de runtime; adicione o provedor SLF4J que sua aplicação usa.

Esta alpha deliberadamente falha de forma fechada quando não pode provar um terminal de prompt. Ela não garante execução exactly-once através de reinícios do daemon, recuperação automática de epoch, snapshot/resync, cursores persistidos, ou cancelamento verdadeiramente direcionado por prompt-ID. Eventos `prompt_cancelled` e de fila são consultivos; apenas `turn_complete` e `turn_error` correspondentes são terminais.

Se a criação de sessão tem um resultado de transporte ambíguo, o daemon pode reter uma sessão cujo ID nunca chegou ao chamador. O SDK não repete a criação e não pode fazer detach dessa sessão desconhecida; o ciclo de vida de coleta do lado do daemon é o boundary de recuperação.

## Arquitetura

O artefato contém duas implementações isoladas:

- **API do Daemon**: `DaemonClient` e `DaemonSessionClient` usam mutações REST mais SSE resumível e possuem recursos limitados de HTTP, prompt, manutenção e timer.
- **API stdio legada**: `QwenCodeCli`, `Session` e `ProcessTransport` gerenciam um processo filho da CLI usando os DTOs e utilitários existentes do protocolo CLI.

A implementação do daemon não reutiliza o transporte de processo legado, modelo de sessão, DTOs ou executor global.

## Funcionalidades da API stdio legada

### Modos de Permissão

O SDK suporta diferentes modos de permissão para controlar a execução de ferramentas:

- **`default`**: Ferramentas de escrita são negadas a menos que aprovadas via callback `canUseTool` ou em `allowedTools`. Ferramentas somente leitura executam sem confirmação.
- **`plan`**: Bloqueia todas as ferramentas de escrita, instruindo a IA a apresentar um plano primeiro.
- **`auto-edit`**: Auto-aprova ferramentas de edição (`edit`, `write_file`, `notebook_edit`) enquanto outras ferramentas requerem confirmação.
- **`yolo`**: Todas as ferramentas executam automaticamente sem confirmação.

### Consumidores de Eventos de Sessão e Consumidores de Conteúdo de Assistente

O SDK fornece duas interfaces principais para lidar com eventos e conteúdo do CLI:

#### Interface SessionEventConsumers

A interface `SessionEventConsumers` fornece callbacks para diferentes tipos de mensagens durante uma sessão:

- `onSystemMessage`: Lida com mensagens do sistema do CLI (recebe Session e SDKSystemMessage)
- `onResultMessage`: Lida com mensagens de resultado do CLI (recebe Session e SDKResultMessage)
- `onAssistantMessage`: Lida com mensagens do assistente (respostas da IA) (recebe Session e SDKAssistantMessage)
- `onPartialAssistantMessage`: Lida com mensagens parciais do assistente durante streaming (recebe Session e SDKPartialAssistantMessage)
- `onUserMessage`: Lida com mensagens do usuário (recebe Session e SDKUserMessage)
- `onOtherMessage`: Lida com outros tipos de mensagens (recebe Session e String message)
- `onControlResponse`: Lida com respostas de controle (recebe Session e CLIControlResponse)
- `onControlRequest`: Lida com requisições de controle (recebe Session e CLIControlRequest, retorna CLIControlResponse)
- `onPermissionRequest`: Lida com requisições de permissão (recebe Session e CLIControlRequest<CLIControlPermissionRequest>, retorna Behavior)

#### Interface AssistantContentConsumers

A interface `AssistantContentConsumers` lida com diferentes tipos de conteúdo dentro de mensagens do assistente:

- `onText`: Lida com conteúdo de texto (recebe Session e TextAssistantContent)
- `onThinking`: Lida com conteúdo de pensamento (recebe Session e ThinkingAssistantContent)
- `onToolUse`: Lida com conteúdo de uso de ferramenta (recebe Session e ToolUseAssistantContent)
- `onToolResult`: Lida com conteúdo de resultado de ferramenta (recebe Session e ToolResultAssistantContent)
- `onOtherContent`: Lida com outros tipos de conteúdo (recebe Session e AssistantContent)
- `onUsage`: Lida com informações de uso (recebe Session e AssistantUsage)
- `onPermissionRequest`: Lida com requisições de permissão (recebe Session e CLIControlPermissionRequest, retorna Behavior)
- `onOtherControlRequest`: Lida com outras requisições de controle (recebe Session e ControlRequestPayload, retorna ControlResponsePayload)

#### Relação entre as Interfaces

**Nota Importante sobre Hierarquia de Eventos:**

- `SessionEventConsumers` é o processador de eventos de **alto nível** que lida com diferentes tipos de mensagens (sistema, assistente, usuário, etc.)
- `AssistantContentConsumers` é o processador de conteúdo de **baixo nível** que lida com diferentes tipos de conteúdo dentro de mensagens do assistente (texto, ferramentas, pensamento, etc.)

**Relação de Processamento:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers usa AssistantContentConsumers para processar conteúdo dentro de mensagens do assistente)

**Relações de Derivação de Eventos:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Relações de Timeout de Eventos:**

Cada método de tratamento de evento possui um método de timeout correspondente que permite personalizar o comportamento de timeout para aquele evento específico:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Para métodos de timeout do AssistantContentConsumers:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Valores Padrão de Timeout:**

- `SessionEventSimpleConsumers` timeout padrão: 180 segundos (Timeout.TIMEOUT_180_SECONDS)
- `AssistantContentSimpleConsumers` timeout padrão: 60 segundos (Timeout.TIMEOUT_60_SECONDS)

**Requisitos de Hierarquia de Timeout:**

Para operação adequada, as seguintes relações de timeout devem ser mantidas:

- O valor de retorno de `onAssistantMessageTimeout` deve ser maior que os valores de retorno de `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` e `onOtherContentTimeout`
- O valor de retorno de `onControlRequestTimeout` deve ser maior que os valores de retorno de `onPermissionRequestTimeout` e `onOtherControlRequestTimeout`

### Opções de Transporte

A classe `TransportOptions` permite configurar como o SDK se comunica com o CLI do Qwen Code:

- `pathToQwenExecutable`: Caminho para o executável do CLI do Qwen Code
- `cwd`: Diretório de trabalho para o processo do CLI
- `model`: Modelo de IA a ser usado na sessão
- `permissionMode`: Modo de permissão que controla a execução de ferramentas
- `env`: Variáveis de ambiente a serem passadas para o processo do CLI
- `maxSessionTurns`: Limita o número de turnos de conversação em uma sessão
- `coreTools`: Lista de ferramentas principais que devem estar disponíveis para a IA
- `excludeTools`: Lista de ferramentas a serem excluídas da disponibilidade para a IA
- `allowedTools`: Lista de ferramentas pré-aprovadas para uso sem confirmação adicional
- `authType`: Tipo de autenticação a ser usado na sessão
- `includePartialMessages`: Habilita o recebimento de mensagens parciais durante respostas em streaming
- `turnTimeout`: Timeout para um turno completo de conversação
- `messageTimeout`: Timeout para mensagens individuais dentro de um turno
- `resumeSessionId`: ID de uma sessão anterior para retomar
- `otherOptions`: Opções adicionais de linha de comando a serem passadas para o CLI

### Recursos de Controle de Sessão

- **Criação de sessão**: Use `QwenCodeCli.newSession()` para criar uma nova sessão com opções personalizadas
- **Gerenciamento de sessão**: A classe `Session` fornece métodos para enviar prompts, lidar com respostas e gerenciar o estado da sessão
- **Limpeza de sessão**: Sempre feche as sessões usando `session.close()` para encerrar corretamente o processo do CLI
- **Retomada de sessão**: Use `setResumeSessionId()` em `TransportOptions` para retomar uma sessão anterior
- **Interrupção de sessão**: Use `session.interrupt()` para interromper um prompt em execução
- **Troca dinâmica de modelo**: Use `session.setModel()` para alterar o modelo durante uma sessão
- **Troca dinâmica de modo de permissão**: Use `session.setPermissionMode()` para alterar o modo de permissão durante uma sessão

### Configuração do Pool de Threads

O SDK usa um pool de threads para gerenciar operações concorrentes com a seguinte configuração padrão:

- **Tamanho do Núcleo**: 30 threads
- **Tamanho Máximo do Pool**: 100 threads
- **Tempo de Keep-Alive**: 60 segundos
- **Capacidade da Fila**: 300 tarefas (usando LinkedBlockingQueue)
- **Nomeação de Threads**: "qwen_code_cli-pool-{number}"
- **Threads Daemon**: false
- **Manipulador de Execução Rejeitada**: CallerRunsPolicy

## Tratamento de Erros

O SDK fornece tipos de exceção específicos para diferentes cenários de erro:

- `SessionControlException`: Lançada quando há um problema com o controle da sessão (criação, inicialização, etc.)
- `SessionSendPromptException`: Lançada quando há um problema ao enviar um prompt ou receber uma resposta
- `SessionClosedException`: Lançada ao tentar usar uma sessão fechada

## FAQ / Solução de Problemas

### P: Preciso instalar o CLI do Qwen separadamente?

R: Sim. A API do daemon requer um `qwen serve` compatível; a API stdio legada requer qwen-code 0.5.0 ou superior.

### P: Quais versões do Java são suportadas?

R: `0.1.0-alpha` requer Java 11 ou superior. Usuários Java 8 devem permanecer na `0.0.3-alpha`.

### P: Como lidar com requisições de longa duração?

R: O SDK inclui utilitários de timeout. Você pode configurar timeouts usando a classe `Timeout` em `TransportOptions`.

### P: Por que algumas ferramentas não estão executando?

R: Isso provavelmente se deve aos modos de permissão. Verifique suas configurações de modo de permissão e considere usar `allowedTools` para pré-aprovar certas ferramentas.

### P: Como retomar uma sessão anterior?

R: Use o método `setResumeSessionId()` em `TransportOptions` para retomar uma sessão anterior.

### P: Posso personalizar o ambiente para o processo do CLI?

R: Sim, use o método `setEnv()` em `TransportOptions` para passar variáveis de ambiente para o processo do CLI.

## Licença

Apache-2.0 - veja [LICENSE](../../LICENSE) para detalhes.
