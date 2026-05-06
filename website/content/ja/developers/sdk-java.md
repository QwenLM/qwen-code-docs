# Qwen Code Java SDK

Qwen Code Java SDK は、Qwen Code の機能にプログラムからアクセスするための最小限の実験的 SDK です。Qwen Code CLI と対話するための Java インターフェースを提供し、開発者が Java アプリケーションに Qwen Code の機能を統合できるようにします。

## Requirements

- Java >= 1.8
- Maven >= 3.6.0（ソースからのビルド用）
- qwen-code >= 0.5.0

### Dependencies

- **Logging**: ch.qos.logback:logback-classic
- **Utilities**: org.apache.commons:commons-lang3
- **JSON Processing**: com.alibaba.fastjson2:fastjson2
- **Testing**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Installation

Maven の `pom.xml` に以下の依存関係を追加してください：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Gradle を使用している場合は、`build.gradle` に以下を追加してください：

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Building and Running

### Build Commands

```bash
# Compile the project
mvn compile

# Run tests
mvn test

# Package the JAR
mvn package

# Install to local repository
mvn install
```

## Quick Start

SDK を使用する最も簡単な方法は、`QwenCodeCli.simpleQuery()` メソッドを利用することです：

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

カスタムトランスポートオプションを使用したより高度な使用方法：

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

カスタムコンテンツコンシューマーを使用したストリーミングコンテンツの処理：

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

その他の例は `src/test/java/com/alibaba/qwen/code/cli/example` を参照してください。

## Architecture

本 SDK は階層型アーキテクチャを採用しています：

- **API Layer**: `QwenCodeCli` クラスを通じて主要なエントリポイントを提供し、基本的な使用法向けの単純な静的メソッドを備えています
- **Session Layer**: `Session` クラスを通じて Qwen Code CLI との通信セッションを管理します
- **Transport Layer**: SDK と CLI プロセス間の通信メカニズムを処理します（現在は `ProcessTransport` を介したプロセストランスポートを使用）
- **Protocol Layer**: CLI プロトコルに基づいた通信用のデータ構造を定義します
- **Utils**: 並列実行、タイムアウト処理、エラー管理のための共通ユーティリティ

## Key Features

### Permission Modes

SDK はツール実行を制御するための複数の権限モードをサポートしています：

- **`default`**: `canUseTool` コールバックまたは `allowedTools` で承認されない限り、書き込みツールは拒否されます。読み取り専用ツールは確認なしで実行されます。
- **`plan`**: すべての書き込みツールをブロックし、AI にまず計画を提示するよう指示します。
- **`auto-edit`**: 編集ツール（edit, write_file）を自動承認し、他のツールは確認を必要とします。
- **`yolo`**: すべてのツールが確認なしで自動的に実行されます。

### Session Event Consumers and Assistant Content Consumers

SDK は CLI からのイベントとコンテンツを処理するための 2 つの主要なインターフェースを提供します：

#### SessionEventConsumers Interface

`SessionEventConsumers` インターフェースは、セッション中のさまざまな種類のメッセージに対するコールバックを提供します：

- `onSystemMessage`: CLI からのシステムメッセージを処理します（Session と SDKSystemMessage を受け取ります）
- `onResultMessage`: CLI からの結果メッセージを処理します（Session と SDKResultMessage を受け取ります）
- `onAssistantMessage`: アシスタントメッセージ（AI の応答）を処理します（Session と SDKAssistantMessage を受け取ります）
- `onPartialAssistantMessage`: ストリーミング中の部分的なアシスタントメッセージを処理します（Session と SDKPartialAssistantMessage を受け取ります）
- `onUserMessage`: ユーザーメッセージを処理します（Session と SDKUserMessage を受け取ります）
- `onOtherMessage`: その他の種類のメッセージを処理します（Session と String メッセージを受け取ります）
- `onControlResponse`: コントロールレスポンスを処理します（Session と CLIControlResponse を受け取ります）
- `onControlRequest`: コントロールリクエストを処理します（Session と CLIControlRequest を受け取り、CLIControlResponse を返します）
- `onPermissionRequest`: 権限リクエストを処理します（Session と CLIControlRequest<CLIControlPermissionRequest> を受け取り、Behavior を返します）

#### AssistantContentConsumers Interface

`AssistantContentConsumers` インターフェースは、アシスタントメッセージ内のさまざまな種類のコンテンツを処理します：

- `onText`: テキストコンテンツを処理します（Session と TextAssistantContent を受け取ります）
- `onThinking`: 思考コンテンツを処理します（Session と ThinkingAssistantContent を受け取ります）
- `onToolUse`: ツール使用コンテンツを処理します（Session と ToolUseAssistantContent を受け取ります）
- `onToolResult`: ツール結果コンテンツを処理します（Session と ToolResultAssistantContent を受け取ります）
- `onOtherContent`: その他のコンテンツタイプを処理します（Session と AssistantContent を受け取ります）
- `onUsage`: 使用量情報を処理します（Session と AssistantUsage を受け取ります）
- `onPermissionRequest`: 権限リクエストを処理します（Session と CLIControlPermissionRequest を受け取り、Behavior を返します）
- `onOtherControlRequest`: その他のコントロールリクエストを処理します（Session と ControlRequestPayload を受け取り、ControlResponsePayload を返します）

#### Relationship Between the Interfaces

**イベント階層に関する重要な注意点：**

- `SessionEventConsumers` は、さまざまなメッセージタイプ（システム、アシスタント、ユーザーなど）を処理する**高レベル**のイベントプロセッサーです
- `AssistantContentConsumers` は、アシスタントメッセージ内のさまざまなコンテンツタイプ（テキスト、ツール、思考など）を処理する**低レベル**のコンテンツプロセッサーです

**プロセッサーの関係：**

- `SessionEventConsumers` → `AssistantContentConsumers`（SessionEventConsumers は AssistantContentConsumers を使用して、アシスタントメッセージ内のコンテンツを処理します）

**イベント派生関係：**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**イベントタイムアウトの関係：**

各イベントハンドラーメソッドには、その特定のイベントのタイムアウト動作をカスタマイズできる対応するタイムアウトメソッドがあります：

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

AssistantContentConsumers のタイムアウトメソッドの場合：

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**デフォルトのタイムアウト値：**

- `SessionEventSimpleConsumers` のデフォルトタイムアウト：180 秒（Timeout.TIMEOUT_180_SECONDS）
- `AssistantContentSimpleConsumers` のデフォルトタイムアウト：60 秒（Timeout.TIMEOUT_60_SECONDS）

**タイムアウト階層の要件：**

正しく動作させるには、以下のタイムアウト関係を維持する必要があります：

- `onAssistantMessageTimeout` の戻り値は、`onTextTimeout`、`onThinkingTimeout`、`onToolUseTimeout`、`onToolResultTimeout`、および `onOtherContentTimeout` の戻り値より大きくする必要があります
- `onControlRequestTimeout` の戻り値は、`onPermissionRequestTimeout` および `onOtherControlRequestTimeout` の戻り値より大きくする必要があります

### Transport Options

`TransportOptions` クラスを使用すると、SDK が Qwen Code CLI と通信する方法を設定できます：

- `pathToQwenExecutable`: Qwen Code CLI 実行ファイルへのパス
- `cwd`: CLI プロセスの作業ディレクトリ
- `model`: セッションで使用する AI モデル
- `permissionMode`: ツール実行を制御する権限モード
- `env`: CLI プロセスに渡す環境変数
- `maxSessionTurns`: セッション内の会話ターン数の上限
- `coreTools`: AI が利用可能にするべきコアツールのリスト
- `excludeTools`: AI が利用できないように除外するツールのリスト
- `allowedTools`: 追加の確認なしに使用が事前承認されているツールのリスト
- `authType`: セッションで使用する認証タイプ
- `includePartialMessages`: ストリーミング応答中に部分的なメッセージの受信を有効にします
- `turnTimeout`: 会話の 1 ターン全体のタイムアウト
- `messageTimeout`: ターン内の個別メッセージのタイムアウト
- `resumeSessionId`: 再開する以前のセッションの ID
- `otherOptions`: CLI に渡す追加のコマンドラインオプション

### Session Control Features

- **セッション作成**: `QwenCodeCli.newSession()` を使用して、カスタムオプションで新しいセッションを作成します
- **セッション管理**: `Session` クラスは、プロンプトの送信、応答の処理、セッション状態の管理を行うメソッドを提供します
- **セッションのクリーンアップ**: CLI プロセスを適切に終了するには、必ず `session.close()` を使用してセッションを閉じてください
- **セッションの再開**: `TransportOptions` の `setResumeSessionId()` を使用して、以前のセッションを再開します
- **セッションの中断**: `session.interrupt()` を使用して、現在実行中のプロンプトを中断します
- **動的モデル切り替え**: `session.setModel()` を使用して、セッション中にモデルを変更します
- **動的権限モード切り替え**: `session.setPermissionMode()` を使用して、セッション中に権限モードを変更します

### Thread Pool Configuration

SDK は並列操作を管理するためにスレッドプールを使用しており、デフォルト設定は以下の通りです：

- **Core Pool Size**: 30 スレッド
- **Maximum Pool Size**: 100 スレッド
- **Keep-Alive Time**: 60 秒
- **Queue Capacity**: 300 タスク（LinkedBlockingQueue を使用）
- **Thread Naming**: "qwen_code_cli-pool-{number}"
- **Daemon Threads**: false
- **Rejected Execution Handler**: CallerRunsPolicy

## Error Handling

SDK は、さまざまなエラーシナリオに対応する特定の例外タイプを提供します：

- `SessionControlException`: セッション制御（作成、初期化など）に問題がある場合にスローされます
- `SessionSendPromptException`: プロンプトの送信または応答の受信に問題がある場合にスローされます
- `SessionClosedException`: 閉じられたセッションを使用しようとした場合にスローされます

## FAQ / Troubleshooting

### Q: Qwen CLI を個別にインストールする必要がありますか？

A: はい、Qwen CLI 0.5.5 以上が必要です。

### Q: サポートされている Java のバージョンは？

A: SDK には Java 1.8 以上が必要です。

### Q: 長時間実行されるリクエストを処理するには？

A: SDK にはタイムアウトユーティリティが含まれています。`TransportOptions` の `Timeout` クラスを使用してタイムアウトを設定できます。

### Q: 一部のツールが実行されないのはなぜですか？

A: 権限モードが原因である可能性が高いです。権限モードの設定を確認し、`allowedTools` を使用して特定のツールを事前承認することを検討してください。

### Q: 以前のセッションを再開するには？

A: `TransportOptions` の `setResumeSessionId()` メソッドを使用して、以前のセッションを再開します。

### Q: CLI プロセスの環境をカスタマイズできますか？

A: はい、`TransportOptions` の `setEnv()` メソッドを使用して、CLI プロセスに環境変数を渡すことができます。

## License

Apache-2.0 - 詳細は [LICENSE](./LICENSE) を参照してください。