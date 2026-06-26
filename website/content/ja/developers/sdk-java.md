# Qwen Code Java SDK

Qwen Code Java SDK は、Qwen Code の機能にプログラムからアクセスするための最小限の実験的 SDK です。Qwen Code CLI とやり取りするための Java インターフェースを提供し、開発者が Java アプリケーションに Qwen Code の機能を統合できるようにします。

## 要件

- Java >= 1.8
- Maven >= 3.6.0（ソースからのビルド用）
- qwen-code >= 0.5.0

### 依存関係

- **ロギング**: ch.qos.logback:logback-classic
- **ユーティリティ**: org.apache.commons:commons-lang3
- **JSON 処理**: com.alibaba.fastjson2:fastjson2
- **テスト**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## インストール

Maven の `pom.xml` に以下の依存関係を追加します：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Gradle を使用する場合は、`build.gradle` に以下を追加します：

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## ビルドと実行

### ビルドコマンド

```bash
# プロジェクトのコンパイル
mvn compile

# テストの実行
mvn test

# JAR のパッケージ化
mvn package

# ローカルリポジトリへのインストール
mvn install
```

## クイックスタート

SDK を利用する最も簡単な方法は、`QwenCodeCli.simpleQuery()` メソッドを使用することです：

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

カスタムのトランスポートオプションを使用したより高度な使用例：

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

カスタムコンテンツコンシューマーを使用したストリーミングコンテンツ処理：

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

その他の例については、src/test/java/com/alibaba/qwen/code/cli/example を参照してください。

## アーキテクチャ

SDK は階層化アーキテクチャに従っています：

- **API 層**: `QwenCodeCli` クラスを通じて、基本的な使用法のためのシンプルな static メソッドを提供する主要なエントリポイントを提供します
- **セッション層**: `Session` クラスを通じて、Qwen Code CLI との通信セッションを管理します
- **トランスポート層**: SDK と CLI プロセス間の通信メカニズムを処理します（現在はプロセストランスポート `ProcessTransport` を使用）
- **プロトコル層**: CLI プロトコルに基づいて通信のためのデータ構造を定義します
- **ユーティリティ**: 並列実行、タイムアウト処理、エラー管理のための共通ユーティリティ

## 主な機能

### 権限モード

SDK はツール実行を制御するための異なる権限モードをサポートしています：

- **`default`**: `canUseTool` コールバックまたは `allowedTools` で承認されない限り、書き込みツールは拒否されます。読み取り専用ツールは確認なしで実行されます。
- **`plan`**: すべての書き込みツールをブロックし、AI に最初に計画を提示するよう指示します。
- **`auto-edit`**: 編集ツール（`edit`、`write_file`、`notebook_edit`）を自動承認し、その他のツールは確認が必要です。
- **`yolo`**: すべてのツールが確認なしで自動実行されます。

### セッションイベントコンシューマーとアシスタントコンテンツコンシューマー

SDK は、CLI からのイベントとコンテンツを処理するための 2 つの主要なインターフェースを提供します：

#### SessionEventConsumers インターフェース

`SessionEventConsumers` インターフェースは、セッション中の異なるタイプのメッセージに対するコールバックを提供します：

- `onSystemMessage`: CLI からのシステムメッセージを処理します（Session と SDKSystemMessage を受け取る）
- `onResultMessage`: CLI からの結果メッセージを処理します（Session と SDKResultMessage を受け取る）
- `onAssistantMessage`: アシスタントメッセージ（AI 応答）を処理します（Session と SDKAssistantMessage を受け取る）
- `onPartialAssistantMessage`: ストリーミング応答中の部分的なアシスタントメッセージを処理します（Session と SDKPartialAssistantMessage を受け取る）
- `onUserMessage`: ユーザーメッセージを処理します（Session と SDKUserMessage を受け取る）
- `onOtherMessage`: その他のタイプのメッセージを処理します（Session と String メッセージを受け取る）
- `onControlResponse`: 制御応答を処理します（Session と CLIControlResponse を受け取る）
- `onControlRequest`: 制御リクエストを処理します（Session と CLIControlRequest を受け取り、CLIControlResponse を返す）
- `onPermissionRequest`: 権限リクエストを処理します（Session と CLIControlRequest<CLIControlPermissionRequest> を受け取り、Behavior を返す）

#### AssistantContentConsumers インターフェース

`AssistantContentConsumers` インターフェースは、アシスタントメッセージ内の異なるタイプのコンテンツを処理します：

- `onText`: テキストコンテンツを処理します（Session と TextAssistantContent を受け取る）
- `onThinking`: 思考コンテンツを処理します（Session と ThinkingAssistantContent を受け取る）
- `onToolUse`: ツール使用コンテンツを処理します（Session と ToolUseAssistantContent を受け取る）
- `onToolResult`: ツール結果コンテンツを処理します（Session と ToolResultAssistantContent を受け取る）
- `onOtherContent`: その他のコンテンツタイプを処理します（Session と AssistantContent を受け取る）
- `onUsage`: 使用量情報を処理します（Session と AssistantUsage を受け取る）
- `onPermissionRequest`: 権限リクエストを処理します（Session と CLIControlPermissionRequest を受け取り、Behavior を返す）
- `onOtherControlRequest`: その他の制御リクエストを処理します（Session と ControlRequestPayload を受け取り、ControlResponsePayload を返す）

#### インターフェース間の関係

**イベント階層に関する重要な注意事項：**

- `SessionEventConsumers` は、異なるメッセージタイプ（システム、アシスタント、ユーザーなど）を処理する **高レベル** のイベントプロセッサです
- `AssistantContentConsumers` は、アシスタントメッセージ内の異なるタイプのコンテンツ（テキスト、ツール、思考など）を処理する **低レベル** のコンテンツプロセッサです

**プロセッサの関係：**

- `SessionEventConsumers` → `AssistantContentConsumers`（SessionEventConsumers は AssistantContentConsumers を使用してアシスタントメッセージ内のコンテンツを処理します）

**イベント派生関係：**

- `onAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`、`onUsage`
- `onPartialAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`
- `onControlRequest` → `onPermissionRequest`、`onOtherControlRequest`

**イベントタイムアウト関係：**

各イベントハンドラメソッドには、その特定のイベントのタイムアウト動作をカスタマイズできる対応するタイムアウトメソッドがあります：

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

AssistantContentConsumers のタイムアウトメソッド：

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**デフォルトのタイムアウト値：**

- `SessionEventSimpleConsumers` のデフォルトタイムアウト：180 秒 (Timeout.TIMEOUT_180_SECONDS)
- `AssistantContentSimpleConsumers` のデフォルトタイムアウト：60 秒 (Timeout.TIMEOUT_60_SECONDS)

**タイムアウト階層の要件：**

適切に動作させるには、以下のタイムアウト関係を維持する必要があります：

- `onAssistantMessageTimeout` の戻り値は、`onTextTimeout`、`onThinkingTimeout`、`onToolUseTimeout`、`onToolResultTimeout`、`onOtherContentTimeout` の戻り値よりも大きくなければなりません
- `onControlRequestTimeout` の戻り値は、`onPermissionRequestTimeout` と `onOtherControlRequestTimeout` の戻り値よりも大きくなければなりません

### トランスポートオプション

`TransportOptions` クラスは、SDK が Qwen Code CLI と通信する方法を設定できます：

- `pathToQwenExecutable`: Qwen Code CLI 実行ファイルへのパス
- `cwd`: CLI プロセスの作業ディレクトリ
- `model`: セッションで使用する AI モデル
- `permissionMode`: ツール実行を制御する権限モード
- `env`: CLI プロセスに渡す環境変数
- `maxSessionTurns`: セッション内の会話ターン数を制限します
- `coreTools`: AI が利用できるようにするコアツールのリスト
- `excludeTools`: AI が利用できないように除外するツールのリスト
- `allowedTools`: 追加確認なしで使用が事前承認されたツールのリスト
- `authType`: セッションで使用する認証タイプ
- `includePartialMessages`: ストリーミング応答中に部分メッセージを受信できるようにします
- `turnTimeout`: 会話の完全な 1 ターンに対するタイムアウト
- `messageTimeout`: ターン内の個々のメッセージに対するタイムアウト
- `resumeSessionId`: 再開する以前のセッションの ID
- `otherOptions`: CLI に渡す追加のコマンドラインオプション

### セッション制御機能

- **セッション作成**: `QwenCodeCli.newSession()` を使用して、カスタムオプションで新しいセッションを作成します
- **セッション管理**: `Session` クラスは、プロンプトの送信、応答の処理、セッション状態の管理のためのメソッドを提供します
- **セッションクリーンアップ**: `session.close()` を使用してセッションを必ず閉じ、CLI プロセスを適切に終了します
- **セッション再開**: `TransportOptions` の `setResumeSessionId()` を使用して、以前のセッションを再開します
- **セッション割り込み**: `session.interrupt()` を使用して、実行中のプロンプトを中断します
- **動的モデル切り替え**: `session.setModel()` を使用して、セッション中にモデルを変更します
- **動的権限モード切り替え**: `session.setPermissionMode()` を使用して、セッション中に権限モードを変更します

### スレッドプール設定

SDK は、以下のデフォルト設定で並行操作を管理するためのスレッドプールを使用します：

- **コアプールサイズ**: 30 スレッド
- **最大プールサイズ**: 100 スレッド
- **キープアライブ時間**: 60 秒
- **キュー容量**: 300 タスク（LinkedBlockingQueue を使用）
- **スレッド命名**: "qwen_code_cli-pool-{number}"
- **デーモンスレッド**: false
- **拒否実行ハンドラ**: CallerRunsPolicy

## エラーハンドリング

SDK は、さまざまなエラーシナリオに対して特定の例外タイプを提供します：

- `SessionControlException`: セッション制御（作成、初期化など）に問題がある場合にスローされます
- `SessionSendPromptException`: プロンプトの送信または応答の受信に問題がある場合にスローされます
- `SessionClosedException`: 閉じられたセッションを使用しようとした場合にスローされます

## FAQ / トラブルシューティング

### Q: Qwen CLI を別途インストールする必要がありますか？

A: はい、Qwen CLI 0.5.5 以上が必要です。

### Q: サポートされている Java バージョンは？

A: SDK には Java 1.8 以上が必要です。

### Q: 長時間実行されるリクエストを処理するにはどうすればよいですか？

A: SDK にはタイムアウトユーティリティが含まれています。`TransportOptions` の `Timeout` クラスを使用してタイムアウトを設定できます。

### Q: 一部のツールが実行されないのはなぜですか？

A: 権限モードが原因である可能性があります。権限モードの設定を確認し、`allowedTools` を使用して特定のツールを事前承認することを検討してください。

### Q: 以前のセッションを再開するにはどうすればよいですか？

A: `TransportOptions` の `setResumeSessionId()` メソッドを使用して、以前のセッションを再開します。

### Q: CLI プロセスの環境をカスタマイズできますか？

A: はい、`TransportOptions` の `setEnv()` メソッドを使用して、環境変数を CLI プロセスに渡すことができます。

## ライセンス

Apache-2.0 - 詳細は [LICENSE](../../LICENSE) を参照してください。