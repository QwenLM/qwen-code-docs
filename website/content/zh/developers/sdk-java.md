# Qwen Code Java SDK

Qwen Code Java SDK 是一个最小化的实验性 SDK，用于以编程方式访问 Qwen Code 的功能。它提供了与 Qwen Code CLI 交互的 Java 接口，使开发者能够将 Qwen Code 的能力集成到其 Java 应用程序中。

## 要求

- Java >= 1.8  
- Maven >= 3.6.0（用于从源码构建）  
- qwen-code >= 0.5.0  

### 依赖项

- **日志**：ch.qos.logback:logback-classic  
- **工具类**：org.apache.commons:commons-lang3  
- **JSON 处理**：com.alibaba.fastjson2:fastjson2  
- **测试**：JUnit 5（org.junit.jupiter:junit-jupiter）  

## 安装

在 Maven 的 `pom.xml` 文件中添加以下依赖：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

若使用 Gradle，则在 `build.gradle` 中添加：

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

# 打包 JAR 文件
mvn package

# 安装到本地仓库
mvn install

## 快速开始

使用该 SDK 最简单的方式是调用 `QwenCodeCli.simpleQuery()` 方法：

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

如需更高级的用法（例如自定义传输选项）：

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

    List<String> result = QwenCodeCli.simpleQuery("你是谁？你有哪些能力？", options);
    result.forEach(logger::info);
}
```

如需处理流式内容并使用自定义内容消费者：

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("你是谁？你有哪些能力？",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("收到文本内容：{}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("收到思考内容：{}", thingkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("收到工具调用内容：{}，参数为：{}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("收到工具执行结果：{}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("收到其他类型内容：{}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("收到用量信息：输入 Token 数：{}，输出 Token 数：{}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("流式示例执行完成。");
}
```

更多示例请参见 `src/test/java/com/alibaba/qwen/code/cli/example`

## 架构

SDK 采用分层架构：

- **API 层**：通过 `QwenCodeCli` 类提供主要入口点，包含用于基础使用的简单静态方法
- **会话层**：通过 `Session` 类管理与 Qwen Code CLI 的通信会话
- **传输层**：处理 SDK 与 CLI 进程之间的通信机制（当前使用基于进程的传输方式，即 `ProcessTransport`）
- **协议层**：基于 CLI 协议定义通信所需的数据结构
- **工具类（Utils）**：提供并发执行、超时处理和错误管理等常用工具

## 主要特性

### 权限模式

SDK 支持多种权限模式，用于控制工具的执行：

- **`default`**：写入类工具默认被拒绝，除非通过 `canUseTool` 回调函数显式批准，或已列入 `allowedTools` 列表；只读类工具无需确认即可执行。
- **`plan`**：阻止所有写入类工具，要求 AI 首先输出执行计划。
- **`auto-edit`**：自动批准编辑类工具（如 `edit`、`write_file`），其余工具仍需用户确认。
- **`yolo`**：所有工具均自动执行，无需任何确认。

### 会话事件消费者与助手内容消费者

SDK 提供两个关键接口，用于处理来自 CLI 的事件和内容：

#### SessionEventConsumers 接口

`SessionEventConsumers` 接口为会话期间不同类型的事件消息提供回调函数：

- `onSystemMessage`：处理来自 CLI 的系统消息（接收 `Session` 和 `SDKSystemMessage`）
- `onResultMessage`：处理来自 CLI 的结果消息（接收 `Session` 和 `SDKResultMessage`）
- `onAssistantMessage`：处理助手消息（即 AI 的响应）（接收 `Session` 和 `SDKAssistantMessage`）
- `onPartialAssistantMessage`：处理流式传输过程中的部分助手消息（接收 `Session` 和 `SDKPartialAssistantMessage`）
- `onUserMessage`：处理用户消息（接收 `Session` 和 `SDKUserMessage`）
- `onOtherMessage`：处理其他类型的消息（接收 `Session` 和字符串格式的消息）
- `onControlResponse`：处理控制响应（接收 `Session` 和 `CLIControlResponse`）
- `onControlRequest`：处理控制请求（接收 `Session` 和 `CLIControlRequest`，返回 `CLIControlResponse`）
- `onPermissionRequest`：处理权限请求（接收 `Session` 和 `CLIControlRequest<CLIControlPermissionRequest>`，返回 `Behavior`）

#### AssistantContentConsumers 接口

`AssistantContentConsumers` 接口用于处理助手消息中的不同类型内容：

- `onText`：处理文本内容（接收 `Session` 和 `TextAssistantContent`）
- `onThinking`：处理思考内容（接收 `Session` 和 `ThingkingAssistantContent`）
- `onToolUse`：处理工具调用内容（接收 `Session` 和 `ToolUseAssistantContent`）
- `onToolResult`：处理工具执行结果内容（接收 `Session` 和 `ToolResultAssistantContent`）
- `onOtherContent`：处理其他类型内容（接收 `Session` 和 `AssistantContent`）
- `onUsage`：处理用量信息（接收 `Session` 和 `AssistantUsage`）
- `onPermissionRequest`：处理权限请求（接收 `Session` 和 `CLIControlPermissionRequest`，返回 `Behavior`）
- `onOtherControlRequest`：处理其他控制请求（接收 `Session` 和 `ControlRequestPayload`，返回 `ControlResponsePayload`）

#### 接口之间的关系

**关于事件层级的重要说明：**

- `SessionEventConsumers` 是**高层级**事件处理器，负责处理不同类型的消息（系统消息、助手消息、用户消息等）。
- `AssistantContentConsumers` 是**低层级**内容处理器，负责处理助手消息中不同类型的内容（文本、工具调用、思考过程等）。

**处理器之间的关系：**

- `SessionEventConsumers` → `AssistantContentConsumers`（`SessionEventConsumers` 通过调用 `AssistantContentConsumers` 来处理助手消息中的内容）

**事件派生关系：**

- `onAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`、`onUsage`
- `onPartialAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`
- `onControlRequest` → `onPermissionRequest`、`onOtherControlRequest`

**事件超时关系：**

每个事件处理器方法都对应一个超时方法，用于自定义该事件的超时行为：

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

对于 `AssistantContentConsumers` 的超时方法：

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**默认超时值：**

- `SessionEventSimpleConsumers` 默认超时：180 秒（`Timeout.TIMEOUT_180_SECONDS`）
- `AssistantContentSimpleConsumers` 默认超时：60 秒（`Timeout.TIMEOUT_60_SECONDS`）

**超时层级要求：**

为确保正常运行，应维持以下超时关系：

- `onAssistantMessageTimeout` 的返回值应大于 `onTextTimeout`、`onThinkingTimeout`、`onToolUseTimeout`、`onToolResultTimeout` 和 `onOtherContentTimeout` 的返回值
- `onControlRequestTimeout` 的返回值应大于 `onPermissionRequestTimeout` 和 `onOtherControlRequestTimeout` 的返回值

### 传输选项

`TransportOptions` 类用于配置 SDK 与 Qwen Code CLI 的通信方式：

- `pathToQwenExecutable`：Qwen Code CLI 可执行文件的路径  
- `cwd`：CLI 进程的工作目录  
- `model`：会话中使用的 AI 模型  
- `permissionMode`：控制工具执行的权限模式  
- `env`：传递给 CLI 进程的环境变量  
- `maxSessionTurns`：限制单个会话中的对话轮次数量  
- `coreTools`：AI 可用的核心工具列表  
- `excludeTools`：从 AI 可用工具中排除的工具列表  
- `allowedTools`：已预先批准、无需额外确认即可使用的工具列表  
- `authType`：会话所使用的认证类型  
- `includePartialMessages`：启用在流式响应过程中接收部分消息  
- `turnTimeout`：单轮完整对话的超时时间  
- `messageTimeout`：单轮内单条消息的超时时间  
- `resumeSessionId`：用于恢复的上一个会话 ID  
- `otherOptions`：传递给 CLI 的其他命令行选项

### 会话控制功能

- **创建会话**：使用 `QwenCodeCli.newSession()` 创建带有自定义选项的新会话  
- **会话管理**：`Session` 类提供用于发送提示、处理响应以及管理会话状态的方法  
- **会话清理**：始终调用 `session.close()` 关闭会话，以正确终止 CLI 进程  
- **会话恢复**：在 `TransportOptions` 中使用 `setResumeSessionId()` 恢复之前的会话  
- **会话中断**：使用 `session.interrupt()` 中断当前正在运行的提示  
- **动态模型切换**：使用 `session.setModel()` 在会话期间切换模型  
- **动态权限模式切换**：使用 `session.setPermissionMode()` 在会话期间切换权限模式

### 线程池配置

SDK 使用线程池管理并发操作，其默认配置如下：

- **核心线程数（Core Pool Size）**：30 个线程  
- **最大线程数（Maximum Pool Size）**：100 个线程  
- **空闲线程存活时间（Keep-Alive Time）**：60 秒  
- **任务队列容量（Queue Capacity）**：300 个任务（使用 `LinkedBlockingQueue`）  
- **线程命名规则（Thread Naming）**：`qwen_code_cli-pool-{number}`  
- **是否为守护线程（Daemon Threads）**：`false`  
- **拒绝策略（Rejected Execution Handler）**：`CallerRunsPolicy`

## 错误处理

SDK 针对不同错误场景提供了特定的异常类型：

- `SessionControlException`：在会话控制（如创建、初始化等）出现问题时抛出  
- `SessionSendPromptException`：在发送提示词或接收响应失败时抛出  
- `SessionClosedException`：在尝试使用已关闭的会话时抛出  

## 常见问题解答（FAQ）/ 故障排除

### 问：我需要单独安装 Qwen CLI 吗？

答：是的，需安装 Qwen CLI 0.5.5 或更高版本。

### 问：支持哪些 Java 版本？

答：SDK 要求 Java 1.8 或更高版本。

### 问：如何处理长时间运行的请求？

答：SDK 提供了超时工具。你可以使用 `TransportOptions` 中的 `Timeout` 类来配置超时。

### 问：为什么某些工具未执行？

答：这很可能是由于权限模式导致的。请检查你的权限模式设置，并考虑使用 `allowedTools` 预先批准特定工具。

### 问：如何恢复之前的会话？

答：在 `TransportOptions` 中使用 `setResumeSessionId()` 方法来恢复之前的会话。

### 问：我可以自定义 CLI 进程的运行环境吗？

答：可以，使用 `TransportOptions` 中的 `setEnv()` 方法向 CLI 进程传递环境变量。

## 许可证

Apache-2.0 — 详情请参阅 [LICENSE](./LICENSE)。