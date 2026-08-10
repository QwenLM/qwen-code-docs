# Qwen Code Java SDK

Qwen Code Java SDK는 `qwen serve`용 권장 daemon transport를 제공하며, 호환성을 위해 실험적 레거시 stdio API도 유지합니다. 두 API 모두 동일한 `com.alibaba:qwencode-sdk` 아티팩트에 포함됩니다.

## 요구 사항

- Java >= 11 (`0.1.0-alpha`용)
- Maven >= 3.9.2 (소스에서 SDK를 빌드하거나 배포할 때)
- daemon API용 호환 `qwen serve`, 또는 레거시 stdio API용 qwen-code >= 0.5.0

### 종속성

- **Logging API**: org.slf4j:slf4j-api (애플리케이션에서 SLF4J provider를 선택하세요)
- **Utilities**: org.apache.commons:commons-lang3
- **JSON Processing**: 인코딩에 Fastjson2, 엄격한 디코딩에 Jackson Core
- **Testing**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## 설치

Maven `pom.xml`에 다음 의존성을 추가하세요:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>0.1.0-alpha</version>
</dependency>
```

또는 Gradle을 사용하는 경우, `build.gradle`에 추가하세요:

```gradle
implementation 'com.alibaba:qwencode-sdk:0.1.0-alpha'
```

## 빌드 및 실행

### 빌드 명령어

```bash
# 프로젝트 컴파일
mvn compile

# 테스트 실행
mvn test

# JAR 패키징
mvn package

# 로컬 저장소에 설치
mvn install
```

### 소스에서 실제 daemon E2E 실행

워크스페이스와 루트 CLI 번들을 모두 빌드한 후 저장소 루트에서 실제 daemon Java 통합 테스트를 실행하세요:

```bash
npm run build
npm run bundle
npx tsx scripts/run-java-daemon-sdk-e2e.ts
```

`npm run build`만으로는 `dist/cli.js`가 갱신되지 않습니다. E2E 하네스는 해당 번들을 실행하며, 누락된 경우 명시적인 사전 요구사항 오류로 실패합니다.

## 권장 daemon API

`qwen serve`를 시작한 후 독립적인 thread-scoped 세션을 생성하세요. `promptText`는 일치하는 `turn_complete`가 올 때까지 반환하지 않으며, 불완전한 스트림은 부분 텍스트를 성공으로 반환하는 대신 `PromptOutcomeIndeterminateException`으로 실패합니다.

`0.1.0-alpha`가 가정하는 수명 주기 보장을 위해서는 SDK와 동일한 소스 리비전에서 릴리스된 qwen-code 빌드를 사용하세요. daemon은 [#7386](https://github.com/QwenLM/qwen-code/pull/7386)의 멱등 per-client detach ledger, [#7400](https://github.com/QwenLM/qwen-code/pull/7400)의 per-epoch 터미널 보증, 그리고 이 릴리스의 인정된 admission 취소 및 FIFO cancel-drain fence를 포함해야 합니다. #7400 커밋만으로는 충분하지 않습니다: 동일한 와이어 daemon은 에이전트 디스패치 전에 취소를 인정하면서도 인정된 프롬프트를 중단하지 않거나, 인정되지 않은 세션 범위 취소를 대기열의 후속 프롬프트에 전달할 수 있습니다. 번들 ACP 자식은 인정된 admission 인식 취소 핸드셰이크를 하나 사용하며, 해당 확장 없는 표준 준수 커스텀 ACP 자식은 표준 `session/cancel` 알림을 하나 받습니다. 기능 협상은 오래된 동일한 와이어 daemon 빌드를 구별할 수 없으므로, SDK는 부분 출력을 성공으로 보고하는 대신 실패를 닫습니다.

번들 취소 핸드셰이크는 daemon이 대기열의 후속 프롬프트를 디스패치하기 전에 대상 프롬프트 호출이 완료될 때까지 의도적으로 대기합니다. 단순히 취소를 인정하는 타임아웃은 없습니다. 그렇게 하면 늦은 세션 범위 취소가 다음 프롬프트에 도달할 수 있기 때문입니다. provider, 도구, 또는 커스텀 통합이 `AbortSignal`을 무기한으로 무시하는 경우, 취소 뮤테이션은 결과를 알 수 없는 상태로 남을 수 있으며 해당 세션을 재사용하면 안 됩니다. 호출자의 관찰 경계 내에서 수신된 정식 프롬프트 터미널을 권위 있는 것으로 간주하세요. 그렇지 않으면 관찰 실패 후 세션을 종료하거나 파괴하세요. 형제 세션을 방해하지 않으면서 끼인 공유 ACP 자식을 복구하려면 더 강력한 런타임 격리가 필요하며, 이는 이 alpha 계약의 범위를 벗어납니다.

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

생성 전 세션 ID를 할당해야 하는 호출자는 RFC UUID v1-v5를 전달할 수 있습니다. SDK는 뮤테이션 전에 `session_id_override`를 확인하고 다른 반환 ID를 `SessionCreationOutcomeUnknownException`으로 보고합니다:

```java
CreateSessionRequest request = CreateSessionRequest.builder()
        .sessionId("550E8400-E29B-41D4-A716-446655440000")
        .build();

try (DaemonSessionClient session = daemon.createSession(request)) {
    System.out.println(session.getSession().getSessionId());
}
```

Daemon은 ID를 소문자로 정규화하고 새 스레드 세션을 생성합니다. 이것은 멱등 attach가 아닙니다. 모호한 create 결과 이후에는 생성을 재시도하지 말고 알려진 ID로 복구하세요.

`qwen serve`에 인증이 필요한 경우, `DaemonClient` 빌더에
`.bearerToken(System.getenv("QWEN_SERVER_TOKEN"))`을 추가하세요.
SDK는 REST 및 SSE 요청에 bearer를 전송하며 URL에 포함하지 않습니다.

정렬된 텍스트, 사고, 도구, 사용량, 권한 및 원시 이벤트 콜백이 필요한 경우 `PromptObserver`와 함께 `startPrompt`를 사용하세요. `acceptanceFuture()`와 `completionFuture()` 뷰는 daemon admission과 신뢰할 수 있는 turn 터미널을 각각 노출합니다. `respondToPermission()`은 요청이 이미 해결되었거나 더 이상 대기 중이 아닌 경우 `false`를 반환합니다. future 뷰를 취소해도 daemon 프롬프트는 취소되지 않습니다. 세션 수준 daemon 취소 작업에는 `cancelActivePrompt()`를 사용하고 일치하는 터미널을 계속 대기하세요. 협력적 취소는 `turn_complete`와 `stopReason=cancelled`로 완료됩니다. `promptText()`는 `PromptTextResult`를 반환하므로, 취소를 구별해야 하는 호출자는 `result.getTerminal().getStopReason()`를 검사해야 합니다. 취소 중에 에이전트나 provider가 실패하면 daemon이 대신 `turn_error`를 게시할 수 있으며, 이 경우 `promptText()`가 `PromptTurnException`을 throw합니다.

취소, 마감, 분해 또는 에이전트 정리가 경합할 때, daemon의 exactly-once latch는 첫 번째 정식 터미널을 게시하고 이후 후보를 억제합니다. 항상 수신된 터미널 자체에서 분기하세요. 클라이언트가 전송한 마지막 제어 뮤테이션이 터미널 종류나 오류 코드를 결정하지 않습니다.

SSE transport는 `Accept-Encoding: identity`와 `Last-Event-ID`를 전송하고, 프레이밍과 이벤트 ID를 검증하고, 리플레이를 중복 제거하며, SSE GET만 재연결합니다. 프롬프트 및 기타 뮤테이션 요청은 자동으로 재시도되지 않습니다. HTTP 408 및 5xx 프롬프트 admission, 세션 생성, 권한, 취소, 하트비트, detach 또는 delete 응답은 결과가 알려지지 않은 것으로 보고됩니다. daemon이 뮤테이션을 거부했다는 것을 증명하지 않기 때문입니다. 유한한 응답 본문과 SSE 관찰은 독립적인 마감 시간을 가집니다.

생성 시 모델 선택은 이 alpha의 Java daemon SDK API에서 의도적으로 노출되지 않습니다. daemon은 거부된 `modelServiceId`를 create 응답 이전에 방출되는 SSE 이벤트로만 보고하는 반면, 이 SDK는 더 나중의 프롬프트 admission 워터마크에서 스트림을 엽니다. daemon이 결정적인 create 결과를 반환하거나 SDK가 `Last-Event-ID: 0`부터 별도의 세션 이벤트 구독을 소유할 때까지, daemon의 구성된 기본 모델을 사용하세요.

`PromptRequest.Builder.deadline(Duration)`은 daemon이 강제하는 프롬프트 마감 시간을 요청하며, daemon이 `prompt_absolute_deadline`을 광고하는 경우에만 허용됩니다. 그렇지 않으면 SDK가 프롬프트를 전송하기 전에 실패합니다. 값은 1에서 2,147,483,647밀리초 사이여야 하며, daemon의 Node 타이머 범위와 일치합니다. 이는 `observationTimeout(Duration)`과 별개이며, 후자는 로컬 SSE 관찰만 제한하고 취소 뮤테이션을 전송하지 않습니다.

세션을 생성하기 전에, SDK는 daemon이 REST transport와 `session_scope_override`를 광고할 것을 요구합니다. 이는 오래된 daemon이 요청된 `thread` 범위를 묵묵히 무시하고 클라이언트를 공유 세션에 연결하는 것을 방지합니다. `client_heartbeat`가 광고될 때, 열린 세션은 매 분마다 새 하트비트를 전송하여 daemon이 유휴 상태의 클라이언트를 회수하지 않도록 합니다. 이 동작을 비활성화하려면 `DaemonClient` 빌더에서 `heartbeatInterval(Duration.ZERO)`를 설정하거나, 다른 양의 간격을 선택하세요. 하트비트는 재시도되지 않습니다. 다음 예약된 하트비트는 별도의 킵얼라이브입니다. 프롬프트 관찰은 기본적으로 클라이언트당 32개의 동시 프롬프트로 제한되며 `maximumConcurrentPrompts`로 조정할 수 있습니다. Admission 및 터미널 future 콜백은 transport 워커와 분리되어 실행됩니다. 차단된 콜백은 제한된 게시 용량을 소비합니다. SSE 스트림 정리도 제한되며, 차단된 close는 해당 정리 예약을 유지합니다. 두 조건 모두 이후 `startPrompt`가 타임아웃 close를 삭제하거나 스레드와 대기 작업을 무한정 증가시키는 대신 `DaemonClientCapacityException`으로 실패할 수 있습니다.

불확정 완료는 결과 경계이며 세션 재사용 경계가 아닙니다. `PromptAdmissionUnknownException` 또는 `PromptOutcomeIndeterminateException` 이후, 해당 `DaemonSessionClient`는 로컬 스트림 정리가 나중에 성공하더라도 추가 프롬프트를 영구적으로 거부합니다. 세션을 종료하거나 파괴하세요. 관찰 타임아웃은 차단된 스트림 close를 무한정 대기하지 않고 게시되며, 정리는 비동기적으로 계속되고 완료될 때까지 제한된 클라이언트 용량을 유지합니다.

## 레거시 stdio API

기존 `com.alibaba.qwen.code.cli` API도 계속 사용할 수 있습니다:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

커스텀 transport 옵션을 사용한 고급 사용법:

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

커스텀 content consumer를 사용한 스트리밍 콘텐츠 처리:

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

기타 예제는 src/test/java/com/alibaba/qwen/code/cli/example을 참조하세요.

## Java 11 마이그레이션 및 alpha 제한

`0.1.0-alpha`는 전체 아티팩트의 최소 Java 버전을 8에서 11로 올립니다. Java 8 애플리케이션은 `0.0.3-alpha`를 계속 사용해야 합니다. Logback은 더 이상 런타임 종속성이 아닙니다. 애플리케이션에서 사용하는 SLF4J provider를 추가하세요.

이 alpha는 프롬프트 터미널을 증명할 수 없을 때 의도적으로 실패를 닫습니다. daemon 재시작에 걸친 exactly-once 실행, 자동 epoch 복구, 스냅샷/재동기화, 영속화된 커서, 또는 실제 프롬프트 ID 대상 취소를 보장하지 않습니다. `prompt_cancelled` 및 큐 이벤트는 참고용이며, 일치하는 `turn_complete`과 `turn_error`만 터미널입니다.

세션 생성에 모호한 transport 결과가 있는 경우, daemon은 호출자에게 ID가 전달되지 않은 세션을 유지할 수 있습니다. SDK는 생성을 재시도하지 않으며 해당 알 수 없는 세션을 detach할 수 없습니다. daemon 측 수명 주기 회수가 복구 경계입니다.

## 아키텍처

아티팩트는 두 개의 격리된 구현을 포함합니다:

- **Daemon API**: `DaemonClient`와 `DaemonSessionClient`는 REST 뮤테이션과 재개 가능한 SSE를 사용하며, 제한된 HTTP, 프롬프트, 유지보수 및 타이머 리소스를 소유합니다.
- **레거시 stdio API**: `QwenCodeCli`, `Session`, `ProcessTransport`는 기존 CLI 프로토콜 DTO와 유틸리티를 사용하여 자식 CLI 프로세스를 관리합니다.

daemon 구현은 레거시 프로세스 transport, 세션 모델, DTO 또는 전역 executor를 재사용하지 않습니다.

## 레거시 stdio 기능

### 승인 모드

SDK는 도구 실행을 제어하기 위해 다양한 승인 모드를 지원합니다:

- **`default`**: 쓰기 도구는 `canUseTool` 콜백이나 `allowedTools`에서 승인되지 않는 한 거부됩니다. 읽기 전용 도구는 확인 없이 실행됩니다.
- **`plan`**: 모든 쓰기 도구를 차단하고 AI에게 먼저 계획을 제시하도록 지시합니다.
- **`auto-edit`**: 편집 도구(`edit`, `write_file`, `notebook_edit`)를 자동 승인하고 다른 도구는 확인을 요구합니다.
- **`yolo`**: 모든 도구가 확인 없이 자동으로 실행됩니다.

### Session Event Consumers와 Assistant Content Consumers

SDK는 CLI의 이벤트와 콘텐츠를 처리하기 위한 두 가지 주요 인터페이스를 제공합니다:

#### SessionEventConsumers 인터페이스

`SessionEventConsumers` 인터페이스는 세션 중 다양한 유형의 메시지에 대한 콜백을 제공합니다:

- `onSystemMessage`: CLI의 시스템 메시지를 처리합니다 (Session과 SDKSystemMessage를 받음)
- `onResultMessage`: CLI의 결과 메시지를 처리합니다 (Session과 SDKResultMessage를 받음)
- `onAssistantMessage`: 어시스턴트 메시지(AI 응답)를 처리합니다 (Session과 SDKAssistantMessage를 받음)
- `onPartialAssistantMessage`: 스트리밍 중 부분 어시스턴트 메시지를 처리합니다 (Session과 SDKPartialAssistantMessage를 받음)
- `onUserMessage`: 사용자 메시지를 처리합니다 (Session과 SDKUserMessage를 받음)
- `onOtherMessage`: 다른 유형의 메시지를 처리합니다 (Session과 String 메시지를 받음)
- `onControlResponse`: 제어 응답을 처리합니다 (Session과 CLIControlResponse를 받음)
- `onControlRequest`: 제어 요청을 처리합니다 (Session과 CLIControlRequest를 받고 CLIControlResponse를 반환)
- `onPermissionRequest`: 권한 요청을 처리합니다 (Session과 CLIControlRequest<CLIControlPermissionRequest>를 받고 Behavior를 반환)

#### AssistantContentConsumers 인터페이스

`AssistantContentConsumers` 인터페이스는 어시스턴트 메시지 내의 다양한 유형의 콘텐츠를 처리합니다:

- `onText`: 텍스트 콘텐츠를 처리합니다 (Session과 TextAssistantContent를 받음)
- `onThinking`: 사고 콘텐츠를 처리합니다 (Session과 ThinkingAssistantContent를 받음)
- `onToolUse`: 도구 사용 콘텐츠를 처리합니다 (Session과 ToolUseAssistantContent를 받음)
- `onToolResult`: 도구 결과 콘텐츠를 처리합니다 (Session과 ToolResultAssistantContent를 받음)
- `onOtherContent`: 다른 콘텐츠 유형을 처리합니다 (Session과 AssistantContent를 받음)
- `onUsage`: 사용량 정보를 처리합니다 (Session과 AssistantUsage를 받음)
- `onPermissionRequest`: 권한 요청을 처리합니다 (Session과 CLIControlPermissionRequest를 받고 Behavior를 반환)
- `onOtherControlRequest`: 다른 제어 요청을 처리합니다 (Session과 ControlRequestPayload를 받고 ControlResponsePayload를 반환)

#### 인터페이스 간 관계

**이벤트 계층에 대한 중요 참고:**

- `SessionEventConsumers`는 다양한 메시지 유형(시스템, 어시스턴트, 사용자 등)을 처리하는 **고수준** 이벤트 프로세서입니다
- `AssistantContentConsumers`는 어시스턴트 메시지 내의 다양한 콘텐츠 유형(텍스트, 도구, 사고 등)을 처리하는 **저수준** 콘텐츠 프로세서입니다

**프로세서 관계:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers는 AssistantContentConsumers를 사용하여 어시스턴트 메시지 내의 콘텐츠를 처리합니다)

**이벤트 파생 관계:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**이벤트 타임아웃 관계:**

각 이벤트 핸들러 메서드에는 해당 이벤트의 타임아웃 동작을 커스터마이즈할 수 있는 대응 타임아웃 메서드가 있습니다:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

AssistantContentConsumers 타임아웃 메서드:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**기본 타임아웃 값:**

- `SessionEventSimpleConsumers` 기본 타임아웃: 180초 (Timeout.TIMEOUT_180_SECONDS)
- `AssistantContentSimpleConsumers` 기본 타임아웃: 60초 (Timeout.TIMEOUT_60_SECONDS)

**타임아웃 계층 요구 사항:**

정상적인 작동을 위해 다음 타임아웃 관계를 유지해야 합니다:

- `onAssistantMessageTimeout` 반환 값은 `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` 및 `onOtherContentTimeout` 반환 값보다 커야 합니다
- `onControlRequestTimeout` 반환 값은 `onPermissionRequestTimeout` 및 `onOtherControlRequestTimeout` 반환 값보다 커야 합니다

### Transport 옵션

`TransportOptions` 클래스는 SDK가 Qwen Code CLI와 통신하는 방식을 구성합니다:

- `pathToQwenExecutable`: Qwen Code CLI 실행 파일의 경로
- `cwd`: CLI 프로세스의 작업 디렉토리
- `model`: 세션에 사용할 AI 모델
- `permissionMode`: 도구 실행을 제어하는 승인 모드
- `env`: CLI 프로세스에 전달할 환경 변수
- `maxSessionTurns`: 세션의 대화 턴 수를 제한
- `coreTools`: AI가 사용할 수 있어야 하는 핵심 도구 목록
- `excludeTools`: AI가 사용하지 못하도록 제외할 도구 목록
- `allowedTools`: 추가 확인 없이 사용이 사전 승인된 도구 목록
- `authType`: 세션에 사용할 인증 유형
- `includePartialMessages`: 스트리밍 응답 중 부분 메시지 수신을 활성화
- `turnTimeout`: 완전한 대화 턴의 타임아웃
- `messageTimeout`: 턴 내 개별 메시지의 타임아웃
- `resumeSessionId`: 재개할 이전 세션의 ID
- `otherOptions`: CLI에 전달할 추가 커맨드라인 옵션

### 세션 제어 기능

- **세션 생성**: `QwenCodeCli.newSession()`을 사용하여 커스텀 옵션으로 새 세션을 생성하세요
- **세션 관리**: `Session` 클래스는 프롬프트 전송, 응답 처리 및 세션 상태 관리를 위한 메서드를 제공합니다
- **세션 정리**: CLI 프로세스를 올바르게 종료하려면 항상 `session.close()`를 사용하여 세션을 닫으세요
- **세션 재개**: `TransportOptions`에서 `setResumeSessionId()`를 사용하여 이전 세션을 재개하세요
- **세션 중단**: `session.interrupt()`를 사용하여 현재 실행 중인 프롬프트를 중단하세요
- **동적 모델 전환**: `session.setModel()`을 사용하여 세션 중 모델을 변경하세요
- **동적 승인 모드 전환**: `session.setPermissionMode()`를 사용하여 세션 중 승인 모드를 변경하세요

### 스레드 풀 구성

SDK는 다음 기본 구성으로 동시 작업을 관리하기 위해 스레드 풀을 사용합니다:

- **Core Pool Size**: 30 스레드
- **Maximum Pool Size**: 100 스레드
- **Keep-Alive Time**: 60초
- **Queue Capacity**: 300 작업 (LinkedBlockingQueue 사용)
- **Thread Naming**: "qwen_code_cli-pool-{number}"
- **Daemon Threads**: false
- **Rejected Execution Handler**: CallerRunsPolicy

## 오류 처리

SDK는 다양한 오류 시나리오에 대한 특정 예외 유형을 제공합니다:

- `SessionControlException`: 세션 제어(생성, 초기화 등)에 문제가 있을 때 throw됩니다
- `SessionSendPromptException`: 프롬프트를 전송하거나 응답을 받는 데 문제가 있을 때 throw됩니다
- `SessionClosedException`: 닫힌 세션을 사용하려고 할 때 throw됩니다

## FAQ / 문제 해결

### Q: Qwen CLI를 별도로 설치해야 하나요?

A: 네. daemon API는 호환 `qwen serve`가 필요하며, 레거시 stdio
API는 qwen-code 0.5.0 이상이 필요합니다.

### Q: 어떤 Java 버전이 지원되나요?

A: `0.1.0-alpha`는 Java 11 이상이 필요합니다. Java 8 사용자는 `0.0.3-alpha`를 계속 사용해야 합니다.

### Q: 장시간 실행되는 요청은 어떻게 처리하나요?

A: SDK에 타임아웃 유틸리티가 포함되어 있습니다. `TransportOptions`에서 `Timeout` 클래스를 사용하여 타임아웃을 구성할 수 있습니다.

### Q: 일부 도구가 실행되지 않는 이유는 무엇인가요?

A: 승인 모드 때문일 가능성이 높습니다. 승인 모드 설정을 확인하고 `allowedTools`를 사용하여 특정 도구를 사전 승인하는 것을 고려하세요.

### Q: 이전 세션을 재개하려면 어떻게 하나요?

A: `TransportOptions`에서 `setResumeSessionId()` 메서드를 사용하여 이전 세션을 재개하세요.

### Q: CLI 프로세스의 환경을 커스터마이즈할 수 있나요?

A: 네, `TransportOptions`에서 `setEnv()` 메서드를 사용하여 CLI 프로세스에 환경 변수를 전달하세요.

## 라이선스

Apache-2.0 - 자세한 내용은 [LICENSE](../../LICENSE)를 참조하세요.
