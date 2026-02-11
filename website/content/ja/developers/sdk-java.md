# Qwen Code Java SDK

Qwen Code Java SDK は、Qwen Code 機能にプログラムでアクセスするための最小限の実験的 SDK です。Qwen Code CLI と対話するための Java インターフェースを提供し、開発者が Qwen Code の機能を Java アプリケーションに統合できるようにします。

## 動作条件

- Java >= 1.8
- Maven >= 3.6.0 (ソースからビルドする場合)
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

または Gradle を使用している場合は、`build.gradle` に以下を追加してください：

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## ビルドと実行

### ビルドコマンド

```bash

```bash
# プロジェクトをコンパイルする
mvn compile

# テストを実行する
mvn test

# JAR をパッケージングする
mvn package

# ローカルリポジトリにインストールする
mvn install
```

## クイックスタート

SDK を使用する最も簡単な方法は、`QwenCodeCli.simpleQuery()` メソッドを使用することです。

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

カスタムトランスポートオプションを使用した高度な利用方法：

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

カスタムコンテンツコンシューマーによるストリーミングコンテンツの処理：

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("who are you, what are your capabilities?",
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
                    logger.info("ツール使用コンテンツを受信しました: {} 引数: {}",
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
                    logger.info("使用情報を受け取りました: 入力トークン: {}, 出力トークン: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("ストリーミングの例が完了しました。");
}
```

その他の例については、src/test/java/com/alibaba/qwen/code/cli/example を参照してください。

## アーキテクチャ

SDK はレイヤードアーキテクチャに従っています：

- **API レイヤー**: `QwenCodeCli` クラスを通じて主要なエントリポイントを提供し、基本的な利用のためにシンプルな静的メソッドを備えています
- **セッション レイヤー**: `Session` クラスを通じて Qwen Code CLI との通信セッションを管理します
- **トランスポート レイヤー**: SDK と CLI プロセス間の通信メカニズムを処理します（現在は `ProcessTransport` を介したプロセストランスポートを使用しています）
- **プロトコル レイヤー**: CLI プロトコルに基づく通信のためのデータ構造を定義します
- **ユーティリティ**: 並行実行、タイムアウト処理、およびエラーマネジメントのための共通ユーティリティ

## 主要機能

### パーミッションモード

SDKは、ツール実行を制御するための異なるパーミッションモードをサポートしています。

- **`default`**: `canUseTool` コールバックまたは `allowedTools` で承認されない限り、書き込みツールは拒否されます。読み取り専用ツールは確認なしに実行されます。
- **`plan`**: すべての書き込みツールをブロックし、AIにまずプランを提示するよう指示します。
- **`auto-edit`**: 編集ツール（edit、write_file）は自動承認される一方、他のツールは確認が必要です。
- **`yolo`**: すべてのツールが確認なしに自動的に実行されます。

### セッションイベントコンシューマーとアシスタントコンテンツコンシューマー

SDKは、CLIからのイベントおよびコンテンツを処理するための2つの主要なインターフェースを提供します。

#### SessionEventConsumers インターフェース

`SessionEventConsumers` インターフェースは、セッション中に発生するさまざまな種類のメッセージに対するコールバックを提供します。

- `onSystemMessage`: CLI からのシステムメッセージを処理します（Session と SDKSystemMessage を受け取ります）
- `onResultMessage`: CLI からの結果メッセージを処理します（Session と SDKResultMessage を受け取ります）
- `onAssistantMessage`: アシスタントメッセージ（AI の応答）を処理します（Session と SDKAssistantMessage を受け取ります）
- `onPartialAssistantMessage`: ストリーミング中の部分的なアシスタントメッセージを処理します（Session と SDKPartialAssistantMessage を受け取ります）
- `onUserMessage`: ユーザーメッセージを処理します（Session と SDKUserMessage を受け取ります）
- `onOtherMessage`: その他の種類のメッセージを処理します（Session と String 型のメッセージを受け取ります）
- `onControlResponse`: 制御応答を処理します（Session と CLIControlResponse を受け取ります）
- `onControlRequest`: 制御要求を処理します（Session と CLIControlRequest を受け取り、CLIControlResponse を返します）
- `onPermissionRequest`: 権限要求を処理します（Session と CLIControlRequest<CLIControlPermissionRequest> を受け取り、Behavior を返します）

#### AssistantContentConsumers インターフェース

`AssistantContentConsumers` インターフェースは、アシスタントメッセージ内のさまざまな種類のコンテンツを処理します。

- `onText`: テキストコンテンツを処理します（Session と TextAssistantContent を受け取ります）
- `onThinking`: 思考コンテンツを処理します（Session と ThingkingAssistantContent を受け取ります）
- `onToolUse`: ツール使用コンテンツを処理します（Session と ToolUseAssistantContent を受け取ります）
- `onToolResult`: ツール結果コンテンツを処理します（Session と ToolResultAssistantContent を受け取ります）
- `onOtherContent`: その他のコンテンツタイプを処理します（Session と AssistantContent を受け取ります）
- `onUsage`: 使用量情報を処理します（Session と AssistantUsage を受け取ります）
- `onPermissionRequest`: アクセス許可リクエストを処理します（Session と CLIControlPermissionRequest を受け取り、Behavior を返します）
- `onOtherControlRequest`: その他の制御リクエストを処理します（Session と ControlRequestPayload を受け取り、ControlResponsePayload を返します）

#### インターフェース間の関係性

**イベント階層に関する重要な注意点:**

- `SessionEventConsumers` は**高レベル**のイベントプロセッサであり、異なるメッセージタイプ（システム、アシスタント、ユーザーなど）を処理します。
- `AssistantContentConsumers` は**低レベル**のコンテンツプロセッサであり、アシスタントメッセージ内の異なるコンテンツタイプ（テキスト、ツール、思考など）を処理します。

**プロセッサの関係性:**

- `SessionEventConsumers` → `AssistantContentConsumers` （SessionEventConsumers はアシスタントメッセージ内のコンテンツを処理するために AssistantContentConsumers を使用します）

**イベント派生関係:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**イベントタイムアウト関係:**

各イベントハンドラメソッドには、対応するタイムアウトメソッドが存在し、その特定のイベントに対するタイムアウト動作をカスタマイズできます。

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

AssistantContentConsumers のタイムアウトメソッド:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**デフォルトタイムアウト値:**

- `SessionEventSimpleConsumers` デフォルトタイムアウト: 180秒 (Timeout.TIMEOUT_180_SECONDS)
- `AssistantContentSimpleConsumers` デフォルトタイムアウト: 60秒 (Timeout.TIMEOUT_60_SECONDS)

**タイムアウト階層要件:**

適切に動作させるためには、以下のタイムアウト関係を維持する必要があります。

- `onAssistantMessageTimeout` の戻り値は、`onTextTimeout`、`onThinkingTimeout`、`onToolUseTimeout`、`onToolResultTimeout`、および `onOtherContentTimeout` の戻り値よりも大きくする必要があります。
- `onControlRequestTimeout` の戻り値は、`onPermissionRequestTimeout` および `onOtherControlRequestTimeout` の戻り値よりも大きくする必要があります。

### トランスポートオプション

`TransportOptions` クラスを使用すると、SDK が Qwen Code CLI と通信する方法を設定できます。

- `pathToQwenExecutable`: Qwen Code CLI 実行可能ファイルへのパス
- `cwd`: CLI プロセスの作業ディレクトリ
- `model`: セッションで使用する AI モデル
- `permissionMode`: ツール実行を制御するパーミッションモード
- `env`: CLI プロセスに渡す環境変数
- `maxSessionTurns`: セッション内の会話ターン数を制限します
- `coreTools`: AI が利用可能なコアツールのリスト
- `excludeTools`: AI が利用できないように除外するツールのリスト
- `allowedTools`: 追加の確認なしに使用が事前承認されたツールのリスト
- `authType`: セッションで使用する認証タイプ
- `includePartialMessages`: ストリーミング応答中に部分的なメッセージを受信できるようにします
- `turnTimeout`: 会話の 1 ターン全体のタイムアウト
- `messageTimeout`: 1 ターン内の個々のメッセージのタイムアウト
- `resumeSessionId`: 再開する以前のセッションの ID
- `otherOptions`: CLI に渡す追加のコマンドラインオプション

### セッション制御機能

- **セッション作成**: `QwenCodeCli.newSession()` を使用して、カスタムオプションで新しいセッションを作成します
- **セッション管理**: `Session` クラスは、プロンプトの送信、レスポンスの処理、セッション状態の管理を行うメソッドを提供します
- **セッションクリーンアップ**: CLIプロセスを適切に終了するために、常に `session.close()` を使用してセッションを閉じてください
- **セッション再開**: `TransportOptions` 内の `setResumeSessionId()` を使用して、以前のセッションを再開します
- **セッション中断**: `session.interrupt()` を使用して、現在実行中のプロンプトを中断します
- **動的モデル切り替え**: `session.setModel()` を使用して、セッション中にモデルを変更します
- **動的パーミッションモード切り替え**: `session.setPermissionMode()` を使用して、セッション中にパーミッションモードを変更します

### スレッドプール設定

SDKは以下のデフォルト構成で並行操作を管理するためにスレッドプールを使用します：

- **コアプールサイズ**: 30スレッド
- **最大プールサイズ**: 100スレッド
- **キープアライブ時間**: 60秒
- **キュー容量**: 300タスク（LinkedBlockingQueue使用）
- **スレッド命名規則**: "qwen_code_cli-pool-{番号}"
- **デーモンスレッド**: false
- **実行拒否ハンドラ**: CallerRunsPolicy

## エラー処理

SDKは異なるエラー状況に対して特定の例外型を提供します：

- `SessionControlException`: セッション制御（作成、初期化など）に問題がある場合にスローされます
- `SessionSendPromptException`: プロンプトの送信または応答の受信に問題がある場合にスローされます
- `SessionClosedException`: 閉じたセッションを使用しようとした場合にスローされます

## FAQ / トラブルシューティング

### Q: Qwen CLIを別途インストールする必要がありますか？

A: はい、Qwen CLI 0.5.5以上が必要です。

### Q: サポートされているJavaのバージョンはどれですか？

A: SDKはJava 1.8以上を必要とします。

### Q: 長時間実行されるリクエストをどのように処理すればよいですか？

A: SDKにはタイムアウトユーティリティが含まれています。`TransportOptions`内の`Timeout`クラスを使用してタイムアウトを設定できます。

### Q: 一部のツールが実行されないのはなぜですか？

A: これはパーミッションモードによる可能性が高いです。パーミッションモードの設定を確認し、特定のツールを事前に承認するために`allowedTools`の使用を検討してください。

### Q: 前回のセッションを再開するにはどうすればよいですか？

A: `TransportOptions`内の`setResumeSessionId()`メソッドを使用して、前回のセッションを再開します。

### Q: CLIプロセスの環境をカスタマイズできますか？

A: はい、`TransportOptions`内の`setEnv()`メソッドを使用して、環境変数をCLIプロセスに渡すことができます。

## ライセンス

Apache-2.0 - 詳細については[LICENSE](./LICENSE)を参照してください。