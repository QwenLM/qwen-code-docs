# Qwen Code Java SDK

Qwen Code Java SDK は、Qwen Code の機能にプログラムからアクセスするための最小限の実験的 SDK です。Qwen Code CLI と連携するための Java インターフェースを提供し、開発者が Java アプリケーションに Qwen Code の機能を統合できるようにします。

## 要件

- Java >= 1.8
- Maven >= 3.6.0（ソースからビルドする場合）
- qwen-code >= 0.5.0

### 依存関係

- **ロギング**: ch.qos.logback:logback-classic
- **ユーティリティ**: org.apache.commons:commons-lang3
- **JSON 処理**: com.alibaba.fastjson2:fastjson2
- **テスト**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## インストール

Maven の `pom.xml` に以下の依存関係を追加してください：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Gradle を使用する場合は、`build.gradle` に以下を追加してください：

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## ビルドと実行

### ビルドコマンド

```bash
# プロジェクトをコンパイル
mvn compile

# テストを実行
mvn test

# JAR をパッケージ化
mvn package

# ローカルリポジトリにインストール
mvn install
```

## クイックスタート

SDK を使う最もシンプルな方法は `QwenCodeCli.simpleQuery()` メソッドを使うことです：

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

カスタムトランスポートオプションを使った高度な使い方：

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

カスタムコンテンツコンシューマーを使ったストリーミングコンテンツの処理：

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

その他のサンプルは src/test/java/com/alibaba/qwen/code/cli/example を参照してください。

## アーキテクチャ

SDK は階層型アーキテクチャに従っています：

- **API レイヤー**: 基本的な使用のためのシンプルな静的メソッドを持つ `QwenCodeCli` クラスを通じてメインのエントリーポイントを提供
- **セッションレイヤー**: `Session` クラスを通じて Qwen Code CLI との通信セッションを管理
- **トランスポートレイヤー**: SDK と CLI プロセス間の通信メカニズムを処理（現在は `ProcessTransport` 経由のプロセストランスポートを使用）
- **プロトコルレイヤー**: CLI プロトコルに基づく通信のデータ構造を定義
- **ユーティリティ**: 並行実行、タイムアウト処理、エラー管理のための共通ユーティリティ

## 主な機能

### パーミッションモード

SDK はツールの実行を制御するための異なるパーミッションモードをサポートしています：

- **`default`**: `canUseTool` コールバックまたは `allowedTools` で承認されない限り、書き込みツールは拒否されます。読み取り専用ツールは確認なしで実行されます。
- **`plan`**: すべての書き込みツールをブロックし、AI に最初にプランを提示するよう指示します。
- **`auto-edit`**: 編集ツール（`edit`、`write_file`、`notebook_edit`）を自動承認し、他のツールは確認が必要です。
- **`yolo`**: すべてのツールが確認なしで自動実行されます。

### セッションイベントコンシューマーとアシスタントコンテンツコンシューマー

SDK はCLI からのイベントとコンテンツを処理するための 2 つの主要なインターフェースを提供しています：

#### SessionEventConsumers インターフェース

`SessionEventConsumers` インターフェースはセッション中の異なる種類のメッセージに対するコールバックを提供します：

- `onSystemMessage`: CLI からのシステムメッセージを処理（Session と SDKSystemMessage を受け取る）
- `onResultMessage`: CLI からの結果メッセージを処理（Session と SDKResultMessage を受け取る）
- `onAssistantMessage`: アシスタントメッセージ（AI レスポンス）を処理（Session と SDKAssistantMessage を受け取る）
- `onPartialAssistantMessage`: ストリーミング中の部分的なアシスタントメッセージを処理（Session と SDKPartialAssistantMessage を受け取る）
- `onUserMessage`: ユーザーメッセージを処理（Session と SDKUserMessage を受け取る）
- `onOtherMessage`: その他の種類のメッセージを処理（Session と String メッセージを受け取る）
- `onControlResponse`: コントロールレスポンスを処理（Session と CLIControlResponse を受け取る）
- `onControlRequest`: コントロールリクエストを処理（Session と CLIControlRequest を受け取り、CLIControlResponse を返す）
- `onPermissionRequest`: パーミッションリクエストを処理（Session と CLIControlRequest<CLIControlPermissionRequest> を受け取り、Behavior を返す）

#### AssistantContentConsumers インターフェース

`AssistantContentConsumers` インターフェースはアシスタントメッセージ内の異なる種類のコンテンツを処理します：

- `onText`: テキストコンテンツを処理（Session と TextAssistantContent を受け取る）
- `onThinking`: 思考コンテンツを処理（Session と ThinkingAssistantContent を受け取る）
- `onToolUse`: ツール使用コンテンツを処理（Session と ToolUseAssistantContent を受け取る）
- `onToolResult`: ツール結果コンテンツを処理（Session と ToolResultAssistantContent を受け取る）
- `onOtherContent`: その他のコンテンツタイプを処理（Session と AssistantContent を受け取る）
- `onUsage`: 使用量情報を処理（Session と AssistantUsage を受け取る）
- `onPermissionRequest`: パーミッションリクエストを処理（Session と CLIControlPermissionRequest を受け取り、Behavior を返す）
- `onOtherControlRequest`: その他のコントロールリクエストを処理（Session と ControlRequestPayload を受け取り、ControlResponsePayload を返す）

#### インターフェース間の関係

**イベント階層に関する重要な注意点：**

- `SessionEventConsumers` は異なるメッセージタイプ（システム、アシスタント、ユーザーなど）を処理する**高レベル**のイベントプロセッサーです
- `AssistantContentConsumers` はアシスタントメッセージ内の異なる種類のコンテンツ（テキスト、ツール、思考など）を処理する**低レベル**のコンテンツプロセッサーです

**プロセッサーの関係：**

- `SessionEventConsumers` → `AssistantContentConsumers`（SessionEventConsumers はアシスタントメッセージ内のコンテンツを処理するために AssistantContentConsumers を使用）

**イベントの派生関係：**

- `onAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`、`onUsage`
- `onPartialAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`
- `onControlRequest` → `onPermissionRequest`、`onOtherControlRequest`

**イベントのタイムアウト関係：**

各イベントハンドラーメソッドには、そのイベントのタイムアウト動作をカスタマイズするための対応するタイムアウトメソッドがあります：

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

- `SessionEventSimpleConsumers` のデフォルトタイムアウト：180 秒（Timeout.TIMEOUT_180_SECONDS）
- `AssistantContentSimpleConsumers` のデフォルトタイムアウト：60 秒（Timeout.TIMEOUT_60_SECONDS）

**タイムアウト階層の要件：**

正常な動作のために、以下のタイムアウト関係を維持する必要があります：

- `onAssistantMessageTimeout` の戻り値は、`onTextTimeout`、`onThinkingTimeout`、`onToolUseTimeout`、`onToolResultTimeout`、`onOtherContentTimeout` の戻り値より大きくなければなりません
- `onControlRequestTimeout` の戻り値は、`onPermissionRequestTimeout` および `onOtherControlRequestTimeout` の戻り値より大きくなければなりません

### トランスポートオプション

`TransportOptions` クラスは SDK が Qwen Code CLI と通信する方法を設定できます：

- `pathToQwenExecutable`: Qwen Code CLI 実行ファイルへのパス
- `cwd`: CLI プロセスの作業ディレクトリ
- `model`: セッションで使用する AI モデル
- `permissionMode`: ツールの実行を制御するパーミッションモード
- `env`: CLI プロセスに渡す環境変数
- `maxSessionTurns`: セッション内の会話ターン数の上限
- `coreTools`: AI が利用できるコアツールのリスト
- `excludeTools`: AI が利用できないよう除外するツールのリスト
- `allowedTools`: 追加の確認なしで事前承認されたツールのリスト
- `authType`: セッションで使用する認証タイプ
- `includePartialMessages`: ストリーミングレスポンス中に部分的なメッセージの受信を有効化
- `turnTimeout`: 会話の完全な 1 ターンのタイムアウト
- `messageTimeout`: ターン内の個々のメッセージのタイムアウト
- `resumeSessionId`: 再開する以前のセッションの ID
- `otherOptions`: CLI に渡す追加のコマンドラインオプション

### セッション制御機能

- **セッション作成**: `QwenCodeCli.newSession()` を使用してカスタムオプションで新しいセッションを作成
- **セッション管理**: `Session` クラスはプロンプトの送信、レスポンスの処理、セッション状態の管理メソッドを提供
- **セッションのクリーンアップ**: CLI プロセスを適切に終了させるため、必ず `session.close()` を使用してセッションをクローズ
- **セッションの再開**: `TransportOptions` の `setResumeSessionId()` を使用して以前のセッションを再開
- **セッションの中断**: `session.interrupt()` を使用して現在実行中のプロンプトを中断
- **動的なモデル切り替え**: `session.setModel()` を使用してセッション中にモデルを変更
- **動的なパーミッションモード切り替え**: `session.setPermissionMode()` を使用してセッション中にパーミッションモードを変更

### スレッドプール設定

SDK は以下のデフォルト設定で並行処理を管理するスレッドプールを使用しています：

- **コアプールサイズ**: 30 スレッド
- **最大プールサイズ**: 100 スレッド
- **キープアライブ時間**: 60 秒
- **キューキャパシティ**: 300 タスク（LinkedBlockingQueue を使用）
- **スレッド名**: "qwen_code_cli-pool-{number}"
- **デーモンスレッド**: false
- **拒否された実行ハンドラー**: CallerRunsPolicy

## エラー処理

SDK はさまざまなエラーシナリオに対応した固有の例外タイプを提供しています：

- `SessionControlException`: セッション制御（作成、初期化など）で問題が発生した場合にスロー
- `SessionSendPromptException`: プロンプトの送信またはレスポンスの受信で問題が発生した場合にスロー
- `SessionClosedException`: クローズされたセッションを使用しようとした場合にスロー

## FAQ / トラブルシューティング

### Q: Qwen CLI を別途インストールする必要がありますか？

A: はい、Qwen CLI 0.5.5 以降が必要です。

### Q: サポートされている Java バージョンは何ですか？

A: SDK は Java 1.8 以降が必要です。

### Q: 長時間かかるリクエストはどのように処理すればよいですか？

A: SDK にはタイムアウトユーティリティが含まれています。`TransportOptions` の `Timeout` クラスを使用してタイムアウトを設定できます。

### Q: 一部のツールが実行されないのはなぜですか？

A: パーミッションモードが原因である可能性が高いです。パーミッションモードの設定を確認し、`allowedTools` を使用して特定のツールを事前承認することを検討してください。

### Q: 以前のセッションを再開するにはどうすればよいですか？

A: `TransportOptions` の `setResumeSessionId()` メソッドを使用して以前のセッションを再開してください。

### Q: CLI プロセスの環境をカスタマイズできますか？

A: はい、`TransportOptions` の `setEnv()` メソッドを使用して CLI プロセスに環境変数を渡せます。

## ライセンス

Apache-2.0 - 詳細は [LICENSE](../../LICENSE) を参照してください。
