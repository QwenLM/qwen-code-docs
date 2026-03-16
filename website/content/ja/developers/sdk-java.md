# Qwen Code Java SDK

Qwen Code Java SDK は、Qwen Code 機能へのプログラムによるアクセスを可能にする最小限の実験的 SDK です。この SDK は、Qwen Code CLI と対話するための Java インターフェースを提供し、開発者が Qwen Code の機能を Java アプリケーションに統合できるようにします。

## 要件

- Java >= 1.8
- Maven >= 3.6.0（ソースからのビルド時）
- qwen-code >= 0.5.0

### 依存関係

- **ロギング**: ch.qos.logback:logback-classic
- **ユーティリティ**: org.apache.commons:commons-lang3
- **JSON 処理**: com.alibaba.fastjson2:fastjson2
- **テスト**: JUnit 5（org.junit.jupiter:junit-jupiter）

## インストール

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

## クイックスタート

SDK を使用する最も簡単な方法は、`QwenCodeCli.simpleQuery()` メソッドを利用する方法です。

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

カスタムトランスポートオプションを用いた高度な利用方法は以下の通りです。

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

    List<String> result = QwenCodeCli.simpleQuery("あなたは誰ですか？どのような機能がありますか？", options);
    result.forEach(logger::info);
}
```

カスタムコンテンツコンシューマーを用いたストリーミングコンテンツの処理方法は以下の通りです。

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("あなたは誰ですか？どのような機能がありますか？",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("テキストコンテンツを受信しました: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("思考コンテンツを受信しました: {}", thingkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("ツール使用コンテンツを受信しました: {}、引数: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("ツール結果コンテンツを受信しました: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("その他のコンテンツを受信しました: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("使用状況情報を受信しました: 入力トークン数: {}、出力トークン数: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("ストリーミング例の実行が完了しました。");
}
```

その他の例については、`src/test/java/com/alibaba/qwen/code/cli/example` を参照してください。

## アーキテクチャ

SDK はレイヤードアーキテクチャを採用しています。

- **API レイヤー**: `QwenCodeCli` クラスを通じて、基本的な使用に必要なシンプルな静的メソッドを提供するメインのエントリポイントを定義します
- **セッション レイヤー**: `Session` クラスを用いて、Qwen Code CLI との通信セッションを管理します
- **トランスポート レイヤー**: SDK と CLI プロセス間の通信メカニズム（現在は `ProcessTransport` を用いたプロセス経由のトランスポート）を処理します
- **プロトコル レイヤー**: CLI プロトコルに基づく通信のためのデータ構造を定義します
- **ユーティリティ**: 並行実行、タイムアウト処理、エラー管理などのために共通で使用されるユーティリティを提供します

## 主な機能

### 権限モード

SDK では、ツールの実行を制御するための異なる権限モードがサポートされています。

- **`default`**: 書き込み系ツールは、`canUseTool` コールバックまたは `allowedTools` で明示的に承認されない限り実行が拒否されます。読み取り専用ツールは確認なしで実行されます。
- **`plan`**: すべての書き込み系ツールをブロックし、AI に事前に実行計画を提示させるように指示します。
- **`auto-edit`**: 編集系ツール（`edit`、`write_file` など）は自動的に承認されますが、その他のツールはユーザーによる確認が必要です。
- **`yolo`**: すべてのツールが確認なしで自動的に実行されます。

### セッションイベントコンシューマとアシスタントコンテンツコンシューマ

SDK では、CLI から発生するイベントおよびコンテンツを処理するための 2 つの主要なインターフェースが提供されています。

#### SessionEventConsumers インターフェース

`SessionEventConsumers` インターフェースは、セッション中に発生するさまざまな種類のメッセージに対するコールバックを提供します。

- `onSystemMessage`: CLI からのシステムメッセージを処理します（`Session` および `SDKSystemMessage` を受け取ります）
- `onResultMessage`: CLI からの結果メッセージを処理します（`Session` および `SDKResultMessage` を受け取ります）
- `onAssistantMessage`: アシスタントメッセージ（AI の応答）を処理します（`Session` および `SDKAssistantMessage` を受け取ります）
- `onPartialAssistantMessage`: ストリーミング中の部分的なアシスタントメッセージを処理します（`Session` および `SDKPartialAssistantMessage` を受け取ります）
- `onUserMessage`: ユーザーによるメッセージを処理します（`Session` および `SDKUserMessage` を受け取ります）
- `onOtherMessage`: その他の種類のメッセージを処理します（`Session` および文字列型のメッセージをを受け取ります）
- `onControlResponse`: コントロール応答を処理します（`Session` および `CLIControlResponse` を受け取ります）
- `onControlRequest`: コントロール要求を処理します（`Session` および `CLIControlRequest` を受け取り、`CLIControlResponse` を返します）
- `onPermissionRequest`: 権限要求を処理します（`Session` および `CLIControlRequest<CLIControlPermissionRequest>` を受け取り、`Behavior` を返します）

#### AssistantContentConsumers インターフェース

`AssistantContentConsumers` インターフェースは、アシスタントメッセージ内のさまざまな種類のコンテンツを処理します。

- `onText`: テキストコンテンツを処理（Session と TextAssistantContent を受け取ります）
- `onThinking`: 思考コンテンツを処理（Session と ThinkingAssistantContent を受け取ります）
- `onToolUse`: ツール使用コンテンツを処理（Session と ToolUseAssistantContent を受け取ります）
- `onToolResult`: ツール実行結果コンテンツを処理（Session と ToolResultAssistantContent を受け取ります）
- `onOtherContent`: その他のコンテンツタイプを処理（Session と AssistantContent を受け取ります）
- `onUsage`: 使用状況情報を処理（Session と AssistantUsage を受け取ります）
- `onPermissionRequest`: 権限要求を処理（Session と CLIControlPermissionRequest を受け取り、Behavior を返します）
- `onOtherControlRequest`: その他の制御要求を処理（Session と ControlRequestPayload を受け取り、ControlResponsePayload を返します）

#### インターフェース間の関係

**イベント階層に関する重要なお知らせ:**

- `SessionEventConsumers` は、**高レベル**のイベントプロセッサであり、さまざまなメッセージタイプ（システム、アシスタント、ユーザーなど）を処理します。
- `AssistantContentConsumers` は、**低レベル**のコンテンツプロセッサであり、アシスタントメッセージ内のさまざまなコンテンツタイプ（テキスト、ツール、思考プロセスなど）を処理します。

**プロセッサ間の関係:**

- `SessionEventConsumers` → `AssistantContentConsumers`（`SessionEventConsumers` は、アシスタントメッセージ内のコンテンツを処理するために `AssistantContentConsumers` を使用します）

**イベント派生関係:**

- `onAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`、`onUsage`
- `onPartialAssistantMessage` → `onText`、`onThinking`、`onToolUse`、`onToolResult`、`onOtherContent`
- `onControlRequest` → `onPermissionRequest`、`onOtherControlRequest`

**イベントタイムアウト関係:**

各イベントハンドラーメソッドには、対応するタイムアウトメソッドが存在し、その特定のイベントに対してタイムアウト動作をカスタマイズできます。

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

`AssistantContentConsumers` のタイムアウトメソッドについては以下のとおりです:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**デフォルトのタイムアウト値:**

- `SessionEventSimpleConsumers` のデフォルトタイムアウト：180 秒（`Timeout.TIMEOUT_180_SECONDS`）
- `AssistantContentSimpleConsumers` のデフォルトタイムアウト：60 秒（`Timeout.TIMEOUT_60_SECONDS`）

**タイムアウト階層の要件:**

正常に動作させるためには、以下のタイムアウト関係を維持する必要があります：

- `onAssistantMessageTimeout` の戻り値は、`onTextTimeout`、`onThinkingTimeout`、`onToolUseTimeout`、`onToolResultTimeout`、`onOtherContentTimeout` の各戻り値より大きい必要があります。
- `onControlRequestTimeout` の戻り値は、`onPermissionRequestTimeout` および `onOtherControlRequestTimeout` の戻り値より大きい必要があります。

### トランスポート オプション

`TransportOptions` クラスでは、SDK が Qwen Code CLI と通信する方法を設定できます。

- `pathToQwenExecutable`: Qwen Code CLI 実行可能ファイルへのパス  
- `cwd`: CLI プロセスの作業ディレクトリ  
- `model`: セッションで使用する AI モデル  
- `permissionMode`: ツール実行を制御する権限モード  
- `env`: CLI プロセスに渡す環境変数  
- `maxSessionTurns`: セッション内の会話ターン数の上限  
- `coreTools`: AI が利用可能なコア ツールのリスト  
- `excludeTools`: AI が利用できないように除外するツールのリスト  
- `allowedTools`: 追加の確認なしで使用が事前に承認されたツールのリスト  
- `authType`: セッションで使用する認証タイプ  
- `includePartialMessages`: ストリーミング応答中に部分的なメッセージを受信できるようにします  
- `turnTimeout`: 1 回の会話ターン全体のタイムアウト  
- `messageTimeout`: ターン内の個々のメッセージのタイムアウト  
- `resumeSessionId`: 再開する前のセッションの ID  
- `otherOptions`: CLI に渡すその他のコマンドライン オプション

### セッション制御機能

- **セッションの作成**: `QwenCodeCli.newSession()` を使用して、カスタムオプションで新しいセッションを作成します
- **セッション管理**: `Session` クラスは、プロンプトの送信、レスポンスの処理、およびセッション状態の管理を行うためのメソッドを提供します
- **セッションのクリーンアップ**: CLI プロセスを適切に終了するために、必ず `session.close()` を使用してセッションを閉じます
- **セッションの再開**: `TransportOptions` 内の `setResumeSessionId()` を使用して、以前のセッションを再開します
- **セッションの中断**: `session.interrupt()` を使用して、現在実行中のプロンプトを中断します
- **動的なモデル切り替え**: `session.setModel()` を使用して、セッション中にモデルを変更します
- **動的なパーミッションモード切り替え**: `session.setPermissionMode()` を使用して、セッション中にパーミッションモードを変更します

### スレッドプールの設定

SDK は、以下のデフォルト設定で並列処理を管理するためのスレッドプールを使用します。

- **コアプールサイズ**: 30 スレッド  
- **最大プールサイズ**: 100 スレッド  
- **キープアライブ時間**: 60 秒  
- **キュー容量**: 300 タスク（`LinkedBlockingQueue` 使用）  
- **スレッド名付け**: `"qwen_code_cli-pool-{number}"`  
- **デーモンスレッド**: `false`  
- **拒否された実行ハンドラー**: `CallerRunsPolicy`

## エラー処理

SDK は、さまざまなエラー状況に対応するための特定の例外型を提供します。

- `SessionControlException`: セッション制御（作成、初期化など）に問題がある場合にスローされます。  
- `SessionSendPromptException`: プロンプト送信またはレスポンス受信に問題がある場合にスローされます。  
- `SessionClosedException`: 閉じられたセッションを使用しようとした場合にスローされます。

## よくある質問（FAQ）／トラブルシューティング

### Q: Qwen CLI を別途インストールする必要がありますか？

A: はい。Qwen CLI バージョン 0.5.5 以降が必要です。

### Q: どの Java バージョンがサポートされていますか？

A: SDK は Java 1.8 以降を必要とします。

### Q: 長時間実行されるリクエストをどう処理すればよいですか？

A: SDK にはタイムアウト機能が含まれています。`TransportOptions` 内の `Timeout` クラスを使用して、タイムアウトを設定できます。

### Q: 一部のツールが実行されないのはなぜですか？

A: これは、おそらく権限モードによるものです。ご使用の権限モード設定を確認し、特定のツールを事前に承認するには `allowedTools` を使用することを検討してください。

### Q: 以前のセッションを再開するにはどうすればよいですか？

A: 以前のセッションを再開するには、`TransportOptions` 内の `setResumeSessionId()` メソッドを使用します。

### Q: CLI プロセスの実行環境をカスタマイズできますか？

A: はい。CLI プロセスに環境変数を渡すには、`TransportOptions` 内の `setEnv()` メソッドを使用します。

## ライセンス

Apache-2.0 — 詳細については [LICENSE](./LICENSE) を参照してください。