# Qwen Code Java SDK

Qwen Code Java SDK 提供了推荐的 `qwen serve` daemon 传输方式，并保留了实验性的旧版 stdio API 以兼容。两个 API 都包含在同一个 `com.alibaba:qwencode-sdk` 构件中。

## 环境要求

- Java >= 11（`0.1.0-alpha`）
- Maven >= 3.9.2（从源码构建或发布此 SDK 时必需）
- daemon API 需要兼容的 `qwen serve`，或旧版 stdio API 需要 qwen-code >= 0.5.0

### 依赖项

- **日志 API**：org.slf4j:slf4j-api（在应用程序中选择 SLF4J provider）
- **工具库**：org.apache.commons:commons-lang3
- **JSON 处理**：Fastjson2 用于编码，Jackson Core 用于严格解码
- **测试**：JUnit 5 (org.junit.jupiter:junit-jupiter)

## 安装

在 Maven `pom.xml` 中添加以下依赖：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>0.1.0-alpha</version>
</dependency>
```

如果使用 Gradle，则在 `build.gradle` 中添加：

```gradle
implementation 'com.alibaba:qwencode-sdk:0.1.0-alpha'
```

## 构建与运行

### 构建命令

```bash
# 编译项目
mvn compile

# 运行测试
mvn test

# 打包 JAR
mvn package

# 安装到本地仓库
mvn install
```

### 从源码运行真实 daemon E2E

在构建 workspace 和根 CLI bundle 后，从仓库根目录运行真实 daemon Java 集成测试：

```bash
npm run build
npm run bundle
npx tsx scripts/run-java-daemon-sdk-e2e.ts
```

仅运行 `npm run build` 不会刷新 `dist/cli.js`；E2E 测试工具会启动该 bundle，如果缺少会报明确的前置条件错误。

## 推荐的 daemon API

启动 `qwen serve`，然后创建独立的线程作用域会话。`promptText` 仅在匹配的 `turn_complete` 到达后才返回；不完整的流会以 `PromptOutcomeIndeterminateException` 失败，而不是将部分文本作为成功返回。

对于 `0.1.0-alpha` 所假设的生命周期保证，请使用与 SDK 相同源码修订版发布的 qwen-code 构建。daemon 必须包含 [#7386](https://github.com/QwenLM/qwen-code/pull/7386) 中的幂等每客户端 detach 账本、[#7400](https://github.com/QwenLM/qwen-code/pull/7400) 中的每轮次终端保证，以及此版本的已确认准入取消加 FIFO 取消 drain 围栏。仅有 #7400 commit 是不够的：相同线路的 daemon 可能在 agent 分发前确认取消而未停止已准入的 prompt，或者让未确认的会话级取消到达排队的后续 prompt。捆绑的 ACP 子进程使用一个已确认的准入感知取消握手；没有该扩展的自定义标准兼容 ACP 子进程会收到一个标准的 `session/cancel` 通知。功能协商无法区分较旧的相同线路 daemon 构建，因此 SDK 采用 fail closed 策略，而不是将部分输出报告为成功。

捆绑的取消握手会故意等待目标 prompt 调用在 daemon 分发其排队后续之前完成。它没有仅确认取消的超时：这样做可能让迟到的会话级取消到达下一个 prompt。如果 provider、工具或自定义集成无限期忽略其 `AbortSignal`，取消变更可能仍然处于结果未知状态，该会话不得被重用。将调用者观察边界内收到的正式 prompt 终端视为权威；否则在观察失败后关闭或销毁会话。在不干扰兄弟会话的情况下恢复卡住的共享 ACP 子进程需要更强的运行时隔离，这超出了此 alpha 合约的范围。

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

需要在创建前分配会话身份的调用者可以传递 RFC UUID v1-v5。SDK 在变更前检查 `session_id_override`，并将不同的返回 ID 报告为 `SessionCreationOutcomeUnknownException`：

```java
CreateSessionRequest request = CreateSessionRequest.builder()
        .sessionId("550E8400-E29B-41D4-A716-446655440000")
        .build();

try (DaemonSessionClient session = daemon.createSession(request)) {
    System.out.println(session.getSession().getSessionId());
}
```

daemon 会将 ID 规范为小写并创建一个新的线程会话。这不是幂等的附加；在创建结果不明确时，使用已知的 ID 进行恢复，而不是重试创建。

如果 `qwen serve` 需要身份验证，请在 `DaemonClient` builder 中添加
`.bearerToken(System.getenv("QWEN_SERVER_TOKEN"))`。SDK 在 REST 和 SSE 请求上发送 bearer，
永远不会将其放在 URL 中。

使用 `startPrompt` 配合 `PromptObserver` 来获取有序的文本、思考、工具、用量、权限和原始事件回调。其 `acceptanceFuture()` 和 `completionFuture()` 视图分别暴露 daemon 准入和可靠的轮次终端。`respondToPermission()` 在请求已解决或不再待处理时返回 `false`。取消 future 视图不会取消 daemon prompt；使用 `cancelActivePrompt()` 执行会话级 daemon 取消操作，并仍然等待匹配的终端。协作取消会以 `turn_complete` 和 `stopReason=cancelled` 完成；`promptText()` 返回其 `PromptTextResult`，因此区分取消的调用者必须检查 `result.getTerminal().getStopReason()`。如果 agent 或 provider 在取消期间失败，daemon 可能改为发布 `turn_error`，使 `promptText()` 抛出 `PromptTurnException`。

当取消、截止时间、拆卸或 agent 结算发生竞争时，daemon 的恰好一次锁存器会发布第一个正式终端并抑制后续候选。始终根据收到的终端本身进行分支；客户端发送的最后一个控制变更不决定终端类型或错误代码。

SSE 传输发送 `Accept-Encoding: identity` 和 `Last-Event-ID`，验证帧和事件 ID，去重重放，并且仅重连 SSE GET。Prompt 和其他变更请求永远不会自动重试。HTTP 408 和 5xx 对 prompt 准入、会话创建、权限、取消、心跳、detach 或删除的响应会被报告为结果未知，因为它们不能证明 daemon 拒绝了该变更。有限响应体和 SSE 观察具有独立的截止时间。

在此 alpha 中，创建时模型选择故意不通过 Java daemon SDK API 暴露。daemon 仅在 create 响应之前发出的 SSE 事件中报告被拒绝的 `modelServiceId`，而此 SDK 从较晚的 prompt 准入水位线开始其流。在 daemon 返回确定的 create 结果或 SDK 拥有从 `Last-Event-ID: 0` 开始的独立会话事件订阅之前，请使用 daemon 配置的默认模型。

`PromptRequest.Builder.deadline(Duration)` 请求 daemon 强制执行的 prompt 截止时间，仅在 daemon 通告 `prompt_absolute_deadline` 时被接受；否则 SDK 在发送 prompt 之前就会失败。该值必须在 1 到 2,147,483,647 毫秒之间，匹配 daemon 的 Node 计时器范围。这与 `observationTimeout(Duration)` 不同，后者仅限制本地 SSE 观察，永远不会发送取消变更。

在创建会话之前，SDK 要求 daemon 通告 REST 传输和 `session_scope_override`；这可以防止旧版 daemon 静默忽略请求的 `thread` 作用域并将客户端附加到共享会话。当调用者提供会话 ID 时，SDK 还会在发送变更之前要求 `session_id_override`。当 `client_heartbeat` 被通告时，打开的会话每分钟发送一次新心跳，以防止 daemon 回收空闲客户端。在 `DaemonClient` builder 上设置 `heartbeatInterval(Duration.ZERO)` 可禁用此行为，或选择不同的正间隔。心跳永远不会重试；下一个计划的心跳是独立的 keepalive。Prompt 观察默认限制为每个客户端 32 个并发 prompt，可以通过 `maximumConcurrentPrompts` 调整。准入和终端 future 回调在传输 worker 之外运行；保持阻塞的回调会消耗有界的发布容量。SSE 流清理也是有界的，保持阻塞的关闭会保留其清理预留。任一条件都可能导致后续的 `startPrompt` 以 `DaemonClientCapacityException` 失败，而不是丢弃超时关闭或无限制地增长线程和排队工作。

不确定的完成是结果边界，而不是会话重用边界。在 `PromptAdmissionUnknownException` 或 `PromptOutcomeIndeterminateException` 之后，该 `DaemonSessionClient` 会永久拒绝进一步的 prompt，即使本地流清理后来成功；请关闭或销毁会话。观察超时的发布不会无限等待阻塞的流关闭，同时清理异步继续并保留有界的客户端容量直到完成。

## 旧版 stdio API

现有的 `com.alibaba.qwen.code.cli` API 仍然可用：

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

更高级的用法，可以自定义传输选项：

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
            .setAllowedTools(Arrays.asList("read_file", "write_file", "glob"));

    List<String> result = QwenCodeCli.simpleQuery("who are you, what are your capabilities?", options);
    result.forEach(logger::info);
}
```

流式内容处理，可自定义内容消费者：

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

更多示例请参考 src/test/java/com/alibaba/qwen/code/cli/example

## Java 11 迁移与 alpha 限制

`0.1.0-alpha` 将整个构件的最低 Java 版本从 8 提升到 11。Java 8 应用程序必须继续使用 `0.0.3-alpha`。Logback 不再是运行时依赖项；请添加应用程序使用的 SLF4J provider。

此 alpha 在无法证明 prompt 终端时故意采用 fail closed 策略。它不保证跨 daemon 重启的恰好一次执行、自动轮次恢复、快照/重同步、持久化游标或真正的 prompt-ID 定向取消。`prompt_cancelled` 和队列事件是建议性的；只有匹配的 `turn_complete` 和 `turn_error` 是终端性的。

如果会话创建的传输结果不明确，daemon 可能保留一个其 ID 从未到达调用者的会话。SDK 不会重试创建，也无法 detach 该未知会话；daemon 端生命周期回收是恢复边界。

## 架构

构件包含两个隔离的实现：

- **Daemon API**：`DaemonClient` 和 `DaemonSessionClient` 使用 REST 变更加可恢复 SSE，并拥有有界的 HTTP、prompt、维护和计时器资源。
- **旧版 stdio API**：`QwenCodeCli`、`Session` 和 `ProcessTransport` 使用现有的 CLI 协议 DTO 和工具类管理子 CLI 进程。

daemon 实现不复用旧版进程传输、会话模型、DTO 或全局执行器。

## 旧版 stdio 功能

### 权限模式

SDK 支持多种权限模式来控制工具执行：

- **`default`**：写入工具默认被拒绝，除非通过 `canUseTool` 回调或在 `allowedTools` 中批准。只读工具无需确认即可执行。
- **`plan`**：阻止所有写入工具，指示 AI 先提出计划。
- **`auto-edit`**：自动批准编辑工具（`edit`、`write_file`、`notebook_edit`），其他工具需要确认。
- **`yolo`**：所有工具自动执行，无需确认。

### 会话事件消费者与助手内容消费者

SDK 提供了两个关键接口来处理来自 CLI 的事件和内容：

#### SessionEventConsumers 接口

`SessionEventConsumers` 接口提供了在会话期间处理不同类型消息的回调：

- `onSystemMessage`：处理来自 CLI 的系统消息（接收 Session 和 SDKSystemMessage）
- `onResultMessage`：处理来自 CLI 的结果消息（接收 Session 和 SDKResultMessage）
- `onAssistantMessage`：处理助手消息（AI 响应）（接收 Session 和 SDKAssistantMessage）
- `onPartialAssistantMessage`：处理流式响应期间的局部助手消息（接收 Session 和 SDKPartialAssistantMessage）
- `onUserMessage`：处理用户消息（接收 Session 和 SDKUserMessage）
- `onOtherMessage`：处理其他类型的消息（接收 Session 和 String 消息）
- `onControlResponse`：处理控制响应（接收 Session 和 CLIControlResponse）
- `onControlRequest`：处理控制请求（接收 Session 和 CLIControlRequest，返回 CLIControlResponse）
- `onPermissionRequest`：处理权限请求（接收 Session 和 CLIControlRequest<CLIControlPermissionRequest>，返回 Behavior）

#### AssistantContentConsumers 接口

`AssistantContentConsumers` 接口处理助手消息中不同类型的内容：

- `onText`：处理文本内容（接收 Session 和 TextAssistantContent）
- `onThinking`：处理思考内容（接收 Session 和 ThinkingAssistantContent）
- `onToolUse`：处理工具使用内容（接收 Session 和 ToolUseAssistantContent）
- `onToolResult`：处理工具结果内容（接收 Session 和 ToolResultAssistantContent）
- `onOtherContent`：处理其他内容类型（接收 Session 和 AssistantContent）
- `onUsage`：处理用量信息（接收 Session 和 AssistantUsage）
- `onPermissionRequest`：处理权限请求（接收 Session 和 CLIControlPermissionRequest，返回 Behavior）
- `onOtherControlRequest`：处理其他控制请求（接收 Session 和 ControlRequestPayload，返回 ControlResponsePayload）

#### 接口之间的关系

**事件层级的重要说明：**

- `SessionEventConsumers` 是**高层**事件处理器，处理不同的消息类型（系统、助手、用户等）
- `AssistantContentConsumers` 是**底层**内容处理器，处理助手消息中不同类型的内容（文本、工具、思考等）

**处理器关系：**

- `SessionEventConsumers` → `AssistantContentConsumers`（SessionEventConsumers 使用 AssistantContentConsumers 来处理助手消息中的内容）

**事件派生关系：**

- `onAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`、`onUsage`
- `onPartialAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`
- `onControlRequest` → `onPermissionRequest`、`onOtherControlRequest`

**事件超时关系：**

每个事件处理方法都有一个对应的超时方法，允许自定义该事件的超时行为：

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

对于 AssistantContentConsumers 的超时方法：

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**默认超时值：**

- `SessionEventSimpleConsumers` 默认超时：180 秒（Timeout.TIMEOUT_180_SECONDS）
- `AssistantContentSimpleConsumers` 默认超时：60 秒（Timeout.TIMEOUT_60_SECONDS）

**超时层级要求：**

为了正常运行，应保持以下超时关系：

- `onAssistantMessageTimeout` 返回值应大于 `onTextTimeout`、`onThinkingTimeout`、`onToolUseTimeout`、`onToolResultTimeout` 和 `onOtherContentTimeout` 的返回值
- `onControlRequestTimeout` 返回值应大于 `onPermissionRequestTimeout` 和 `onOtherControlRequestTimeout` 的返回值

### 传输选项

`TransportOptions` 类允许配置 SDK 与 Qwen Code CLI 的通信方式：

- `pathToQwenExecutable`：Qwen Code CLI 可执行文件的路径
- `cwd`：CLI 进程的工作目录
- `model`：会话使用的 AI 模型
- `permissionMode`：控制工具执行的权限模式
- `env`：传递给 CLI 进程的环境变量
- `maxSessionTurns`：限制会话中的对话轮次
- `coreTools`：AI 可用的核心工具列表
- `excludeTools`：要从可用工具中排除的工具列表
- `allowedTools`：预先批准无需额外确认即可使用的工具列表
- `authType`：会话使用的认证类型
- `includePartialMessages`：启用流式响应期间接收局部消息
- `turnTimeout`：完整对话轮次的超时时间
- `messageTimeout`：单条消息在轮次内的超时时间
- `resumeSessionId`：要恢复的先前会话的 ID
- `otherOptions`：传递给 CLI 的其他命令行选项

### 会话控制功能

- **创建会话**：使用 `QwenCodeCli.newSession()` 创建带有自定义选项的新会话
- **会话管理**：`Session` 类提供发送提示、处理响应和管理会话状态的方法
- **会话清理**：始终使用 `session.close()` 关闭会话以正确终止 CLI 进程
- **会话恢复**：在 `TransportOptions` 中使用 `setResumeSessionId()` 恢复之前的会话
- **会话中断**：使用 `session.interrupt()` 中断当前正在运行的提示
- **动态模型切换**：使用 `session.setModel()` 在会话期间切换模型
- **动态权限模式切换**：使用 `session.setPermissionMode()` 在会话期间切换权限模式

### 线程池配置

SDK 使用线程池来管理并发操作，默认配置如下：

- **核心线程数**：30
- **最大线程数**：100
- **线程存活时间**：60 秒
- **队列容量**：300 个任务（使用 LinkedBlockingQueue）
- **线程命名前缀**："qwen_code_cli-pool-{number}"
- **守护线程**：false
- **拒绝执行处理器**：CallerRunsPolicy

## 错误处理

SDK 针对不同错误场景提供了特定的异常类型：

- `SessionControlException`：会话控制（创建、初始化等）出现问题时抛出
- `SessionSendPromptException`：发送提示或接收响应出现问题时抛出
- `SessionClosedException`：尝试使用已关闭的会话时抛出

## 常见问题 / 故障排除

### Q: 是否需要单独安装 Qwen CLI？

A: 是的。daemon API 需要兼容的 `qwen serve`；旧版 stdio
API 需要 qwen-code 0.5.0 或更高版本。

### Q: 支持哪些 Java 版本？

A: `0.1.0-alpha` 需要 Java 11 或更高版本。Java 8 用户必须继续使用 `0.0.3-alpha`。

### Q: 如何处理长时间运行的请求？

A: SDK 包含超时工具。可以通过 `TransportOptions` 中的 `Timeout` 类配置超时。

### Q: 为什么某些工具没有执行？

A: 这很可能是由于权限模式所致。请检查权限模式设置，并考虑使用 `allowedTools` 预先批准某些工具。

### Q: 如何恢复之前的会话？

A: 使用 `TransportOptions` 中的 `setResumeSessionId()` 方法恢复之前的会话。

### Q: 能否自定义 CLI 进程的环境？

A: 可以，使用 `TransportOptions` 中的 `setEnv()` 方法将环境变量传递给 CLI 进程。

## 许可证

Apache-2.0 - 详情请参见 [LICENSE](../../LICENSE)。
