# Qwen Code Java SDK

Qwen Code Java SDK 是一个轻量级实验性 SDK，用于以编程方式访问 Qwen Code 功能。它提供了与 Qwen Code CLI 交互的 Java 接口，使开发者能够将 Qwen Code 的能力集成到 Java 应用程序中。

## 环境要求

- Java >= 1.8
- Maven >= 3.6.0（用于从源码构建）
- qwen-code >= 0.5.0

### 依赖项

- **日志**: ch.qos.logback:logback-classic
- **工具库**: org.apache.commons:commons-lang3
- **JSON 处理**: com.alibaba.fastjson2:fastjson2
- **测试**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## 安装

将以下依赖项添加到你的 Maven `pom.xml` 中：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

如果使用 Gradle，请将其添加到 `build.gradle` 中：

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
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

## 快速开始

使用该 SDK 最简单的方式是通过 `QwenCodeCli.simpleQuery()` 方法：

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

如需更高级的用法并自定义传输选项：

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

如需处理流式内容并使用自定义内容消费者：

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("who are you, what are your capabilities?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Text content received: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("Thinking content received: {}", thingkingAssistantContent.getThinking());
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

更多示例请参见 src/test/java/com/alibaba/qwen/code/cli/example

## 架构设计

该 SDK 采用分层架构：

- **API 层**：通过 `QwenCodeCli` 类提供主要入口点，包含用于基础用法的简单静态方法
- **会话层**：通过 `Session` 类管理与 Qwen Code CLI 的通信会话
- **传输层**：处理 SDK 与 CLI 进程之间的通信机制（当前通过 `ProcessTransport` 使用进程传输）
- **协议层**：基于 CLI 协议定义通信所需的数据结构
- **工具类 (Utils)**：用于并发执行、超时处理和错误管理的通用工具

## 核心特性

### 权限模式

SDK 支持多种权限模式以控制工具的执行：

- **`default`**：默认拒绝写入类工具，除非通过 `canUseTool` 回调批准或在 `allowedTools` 中配置。只读工具无需确认即可执行。
- **`plan`**：拦截所有写入类工具，指示 AI 先提供执行计划。
- **`auto-edit`**：自动批准编辑类工具（edit、write_file），其他工具仍需确认。
- **`yolo`**：所有工具自动执行，无需确认。

### 会话事件消费者与助手内容消费者

SDK 提供了两个关键接口，用于处理来自 CLI 的事件和内容：

#### SessionEventConsumers 接口

`SessionEventConsumers` 接口为会话期间的不同类型消息提供回调：

- `onSystemMessage`：处理来自 CLI 的系统消息（接收 Session 和 SDKSystemMessage）
- `onResultMessage`：处理来自 CLI 的结果消息（接收 Session 和 SDKResultMessage）
- `onAssistantMessage`：处理助手消息（AI 响应）（接收 Session 和 SDKAssistantMessage）
- `onPartialAssistantMessage`：处理流式响应中的部分助手消息（接收 Session 和 SDKPartialAssistantMessage）
- `onUserMessage`：处理用户消息（接收 Session 和 SDKUserMessage）
- `onOtherMessage`：处理其他类型的消息（接收 Session 和 String 消息）
- `onControlResponse`：处理控制响应（接收 Session 和 CLIControlResponse）
- `onControlRequest`：处理控制请求（接收 Session 和 CLIControlRequest，返回 CLIControlResponse）
- `onPermissionRequest`：处理权限请求（接收 Session 和 CLIControlRequest<CLIControlPermissionRequest>，返回 Behavior）

#### AssistantContentConsumers 接口

`AssistantContentConsumers` 接口用于处理助手消息中的不同类型内容：

- `onText`：处理文本内容（接收 Session 和 TextAssistantContent）
- `onThinking`：处理思考内容（接收 Session 和 ThingkingAssistantContent）
- `onToolUse`：处理工具调用内容（接收 Session 和 ToolUseAssistantContent）
- `onToolResult`：处理工具结果内容（接收 Session 和 ToolResultAssistantContent）
- `onOtherContent`：处理其他内容类型（接收 Session 和 AssistantContent）
- `onUsage`：处理用量信息（接收 Session 和 AssistantUsage）
- `onPermissionRequest`：处理权限请求（接收 Session 和 CLIControlPermissionRequest，返回 Behavior）
- `onOtherControlRequest`：处理其他控制请求（接收 Session 和 ControlRequestPayload，返回 ControlResponsePayload）

#### 接口之间的关系

**事件层级重要说明：**

- `SessionEventConsumers` 是**高层级**事件处理器，负责处理不同类型的消息（系统、助手、用户等）
- `AssistantContentConsumers` 是**低层级**内容处理器，负责处理助手消息内部的不同类型内容（文本、工具、思考等）

**处理器关系：**

- `SessionEventConsumers` → `AssistantContentConsumers`（SessionEventConsumers 使用 AssistantContentConsumers 来处理助手消息中的内容）

**事件派生关系：**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**事件超时关系：**

每个事件处理方法都有对应的超时方法，允许你自定义该特定事件的超时行为：

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

AssistantContentConsumers 的超时方法如下：

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

为确保正常运行，应维持以下超时关系：

- `onAssistantMessageTimeout` 的返回值应大于 `onTextTimeout`、`onThinkingTimeout`、`onToolUseTimeout`、`onToolResultTimeout` 和 `onOtherContentTimeout` 的返回值
- `onControlRequestTimeout` 的返回值应大于 `onPermissionRequestTimeout` 和 `onOtherControlRequestTimeout` 的返回值

### 传输选项

`TransportOptions` 类允许配置 SDK 与 Qwen Code CLI 的通信方式：

- `pathToQwenExecutable`：Qwen Code CLI 可执行文件的路径
- `cwd`：CLI 进程的工作目录
- `model`：会话使用的 AI 模型
- `permissionMode`：控制工具执行的权限模式
- `env`：传递给 CLI 进程的环境变量
- `maxSessionTurns`：限制会话中的对话轮数
- `coreTools`：应向 AI 开放的核心工具列表
- `excludeTools`：禁止 AI 使用的工具列表
- `allowedTools`：预批准无需额外确认即可使用的工具列表
- `authType`：会话使用的认证类型
- `includePartialMessages`：启用在流式响应期间接收部分消息
- `turnTimeout`：完整一轮对话的超时时间
- `messageTimeout`：单轮对话中单条消息的超时时间
- `resumeSessionId`：要恢复的先前会话 ID
- `otherOptions`：传递给 CLI 的额外命令行选项

### 会话控制功能

- **创建会话**：使用 `QwenCodeCli.newSession()` 创建带有自定义选项的新会话
- **会话管理**：`Session` 类提供发送提示词、处理响应和管理会话状态的方法
- **会话清理**：始终使用 `session.close()` 关闭会话，以正确终止 CLI 进程
- **恢复会话**：在 `TransportOptions` 中使用 `setResumeSessionId()` 恢复先前的会话
- **中断会话**：使用 `session.interrupt()` 中断当前正在运行的提示词
- **动态切换模型**：在会话期间使用 `session.setModel()` 切换模型
- **动态切换权限模式**：在会话期间使用 `session.setPermissionMode()` 切换权限模式

### 线程池配置

SDK 使用线程池管理并发操作，默认配置如下：

- **核心线程数**：30
- **最大线程数**：100
- **空闲存活时间**：60 秒
- **队列容量**：300 个任务（使用 LinkedBlockingQueue）
- **线程命名**："qwen_code_cli-pool-{number}"
- **守护线程**：false
- **拒绝策略**：CallerRunsPolicy

## 错误处理

SDK 为不同的错误场景提供了特定的异常类型：

- `SessionControlException`：会话控制（创建、初始化等）出现问题时抛出
- `SessionSendPromptException`：发送提示词或接收响应出现问题时抛出
- `SessionClosedException`：尝试使用已关闭的会话时抛出

## 常见问题 / 故障排查

### Q：我需要单独安装 Qwen CLI 吗？

A：是的，需要 Qwen CLI 0.5.5 或更高版本。

### Q：支持哪些 Java 版本？

A：SDK 需要 Java 1.8 或更高版本。

### Q：如何处理长时间运行的请求？

A：SDK 内置了超时工具类。你可以通过 `TransportOptions` 中的 `Timeout` 类配置超时时间。

### Q：为什么某些工具没有执行？

A：这通常是由于权限模式设置导致的。请检查你的权限模式配置，并考虑使用 `allowedTools` 预批准特定工具。

### Q：如何恢复之前的会话？

A：在 `TransportOptions` 中使用 `setResumeSessionId()` 方法即可恢复之前的会话。

### Q：我可以自定义 CLI 进程的运行环境吗？

A：可以，使用 `TransportOptions` 中的 `setEnv()` 方法向 CLI 进程传递环境变量。

## 许可证

Apache-2.0 - 详情请参阅 [LICENSE](./LICENSE)。