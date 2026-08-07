# Qwen Code Java SDK

Qwen Code Java SDK は、`qwen serve` 向けの推奨デーモントランスポートを提供し、互換性のために実験的なレガシー stdio API を保持しています。両方の API が同じ `com.alibaba:qwencode-sdk` アーティファクトに出荷されます。

## 要件

- `0.1.0-alpha` は Java >= 11
- ソースからビルドまたは公開する場合は Maven >= 3.9.2
- デーモン API には互換性のある `qwen serve`、レガシー stdio API には qwen-code >= 0.5.0

### 依存関係

- **ロギング API**: org.slf4j:slf4j-api（アプリケーションで SLF4J プロバイダーを選択してください）
- **ユーティリティ**: org.apache.commons:commons-lang3
- **JSON 処理**: エンコーディングに Fastjson2、厳密なデコーディングに Jackson Core
- **テスト**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## インストール

Maven の `pom.xml` に以下の依存関係を追加します：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>0.1.0-alpha</version>
</dependency>
```

Gradle を使用する場合は、`build.gradle` に以下を追加します：

```gradle
implementation 'com.alibaba:qwencode-sdk:0.1.0-alpha'
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

### ソースからのリアルデーモン E2E

ワークスペースとルート CLI バンドルの両方をビルドした後、リポジトリルートからリアルデーモンの Java 統合テストを実行します：

```bash
npm run build
npm run bundle
npx tsx scripts/run-java-daemon-sdk-e2e.ts
```

`npm run build` だけでは `dist/cli.js` が更新されません。E2E ハーネスはそのバンドルを起動し、不足している場合は明示的な前提条件エラーで失敗します。

## 推奨デーモン API

`qwen serve` を起動してから、独立したスレッドスコープのセッションを作成します。`promptText` は一致する `turn_complete` が届いた後にのみ戻ります。不完全なストリームは部分テキストを成功として返すのではなく、`PromptOutcomeIndeterminateException` で失敗します。

`0.1.0-alpha` のライフサイクル保証については、SDK と同じソースリビジョンからリリースされた qwen-code ビルドを使用してください。デーモンには、[#7386](https://github.com/QwenLM/qwen-code/pull/7386) の冪等なクライアントごとのデタッチレジャー、[#7400](https://github.com/QwenLM/qwen-code/pull/7400) のエポックごとのターミナル保証、およびこのリリースの承認済み admission キャンセルと FIFO cancel-drain フェンスが含まれている必要があります。#7400 コミット単独では不十分です。同じワイヤー上のデーモンは、エージェントディスパッチ前にキャンセルを承認しても承認されたプロンプトを停止しない場合があり、または未承認のセッションスコープのキャンセルがキューイングされた後続に到達させる場合があります。バンドルされた ACP 子は 1 つの承認済みの admission 対応キャンセルハンドシェイクを使用します。その拡張を持たないカスタム標準準拠の ACP 子は、標準の `session/cancel` 通知を 1 つ受け取ります。機能ネゴシエーションは古い同じワイヤーのデーモンビルドを区別できないため、SDK は fail closed となり、部分出力を成功として報告しません。

バンドルされたキャンセルハンドシェイクは、デーモンがキューイングされた後続をディスパッチする前に、対象のプロンプト呼び出しが確定するまで意図的に待機します。キャンセルを承認するだけのタイムアウトはありません。それにより、遅れてきたセッションスコープのキャンセルが次のプロンプトに到達する可能性があります。プロバイダー、ツール、またはカスタム統合が `AbortSignal` を無限に無視する場合、キャンセル変更は outcome-unknown のままになる可能性があり、そのセッションは再利用しないでください。呼び出し元の観測境界内で受信した正式なプロンプトターミナルを権威あるものとして扱ってください。そうでない場合は、観測失敗後にセッションを閉じるか破棄してください。兄弟セッションを乱さずに wedged された共有 ACP 子を回復するには、より強力なランタイム分離が必要であり、これはこの alpha 契約の範囲外です。

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

`qwen serve` が認証を必要とする場合は、`DaemonClient` ビルダーに `.bearerToken(System.getenv("QWEN_SERVER_TOKEN"))` を追加します。SDK は REST と SSE リクエストに Bearer を送信し、URL に入れることはありません。

順序付けされたテキスト、思考、ツール、使用量、権限、および raw イベントコールバックが必要な場合は、`PromptObserver` とともに `startPrompt` を使用します。`acceptanceFuture()` と `completionFuture()` ビューは、デーモンの admission と信頼できるターンの終了を個別に公開します。`respondToPermission()` は、リクエストがすでに解決済みまたは保留中でない場合、`false` を返します。Future ビューをキャンセルしてもデーモンのプロンプトはキャンセルされません。セッションレベルのデーモンキャンセル操作には `cancelActivePrompt()` を使用し、引き続き一致するターミナルを待機します。協調的キャンセルは `turn_complete` と `stopReason=cancelled` で完了します。`promptText()` はその `PromptTextResult` を返すため、キャンセルを区別する呼び出し元は `result.getTerminal().getStopReason()` を検査する必要があります。エージェントまたはプロバイダーがキャンセル中に失敗した場合、デーモンは代わりに `turn_error` を公開する可能性があり、`promptText()` は `PromptTurnException` をスローします。

キャンセル、デッドライン、ティアダウン、またはエージェントの確定が競合する場合、デーモンの exactly-once ラッチが最初の正式なターミナルを公開し、後続の候補を抑制します。常に受信したターミナル自体で分岐してください。クライアントが送信した最後の制御変更がターミナルの種類やエラーコードを決定するわけではありません。

SSE トランスポートは `Accept-Encoding: identity` と `Last-Event-ID` を送信し、フレーミングとイベント ID を検証し、リプレイを重複排除し、SSE GET のみを再接続します。プロンプトおよびその他の変更リクエストは自動的にリトライされません。プロンプト admission、セッション作成、権限、キャンセル、heartbeat、デタッチ、または削除に対する HTTP 408 と 5xx レスポンスは、outcome-unknown として報告されます。これらはデーモンが変更を拒否したことを証明しないためです。有限のレスポンスボディと SSE 観測は独立したデッドラインを持ちます。

作成時のモデル選択は、この alpha では Java デーモン SDK API によって意図的に公開されていません。デーモンは拒否された `modelServiceId` を、作成レスポンスより前に発行された SSE イベントとしてのみ報告しますが、この SDK は後のプロンプト admission watermark からストリームを開きます。デーモンが決定的な作成結果を返すか、SDK が `Last-Event-ID: 0` から別のセッションイベントサブスクリプションを所有するまで、デーモンの設定されたデフォルトモデルを使用してください。

`PromptRequest.Builder.deadline(Duration)` はデーモン強制のプロンプトデッドラインをリクエストし、デーモンが `prompt_absolute_deadline` を公開している場合にのみ受け入れられます。そうでない場合、SDK はプロンプトを送信する前に失敗します。値は 1 から 2,147,483,647 ミリ秒の間である必要があり、デーモンの Node タイマー範囲と一致します。これは `observationTimeout(Duration)` とは別物で、こちらはローカルの SSE 観測のみを制限し、キャンセル変更を送信することはありません。

セッションを作成する前に、SDK はデーモンが REST トランスポートと `session_scope_override` を公開することを要求します。これにより、古いデーモンがリクエストされた `thread` スコープをサイレントに無視してクライアントを共有セッションにアタッチするのを防ぎます。`client_heartbeat` が公開されている場合、開いているセッションは毎分新しい heartbeat を送信し、デーモンが他の方法でアイドルのクライアントを回収しないようにします。この動作を無効にするには、`DaemonClient` ビルダーで `heartbeatInterval(Duration.ZERO)` を設定するか、別の正の間隔を選択します。heartbeat がリトライされることはありません。次のスケジュールされた heartbeat は別のキープアライブです。プロンプト観測はデフォルトでクライアントあたり 32 の同時プロンプトに制限され、`maximumConcurrentPrompts` で調整できます。admission とターミナルの future コールバックはトランスポートワーカーから離れて実行されます。ブロックされ続けるコールバックは制限された公開容量を消費します。SSE ストリームのクリーンアップも制限されており、ブロックされ続けるクローズはクリーンアップの予約を保持します。どちらの条件も、後の `startPrompt` がタイムアウトクローズをドロップする代わりに `DaemonClientCapacityException` で失敗したり、スレッドとキューイングされた作業を無制限に増やしたりする原因となる可能性があります。

不定の完了は、結果の境界であり、セッション再利用の境界ではありません。`PromptAdmissionUnknownException` または `PromptOutcomeIndeterminateException` の後、その `DaemonSessionClient` はローカルストリームのクリーンアップが後で成功した場合でも、それ以降のプロンプトを永久に拒否します。代わりにセッションを閉じるか破棄してください。観測タイムアウトは、ブロックされたストリームクローズを永遠に待機せずに公開されます。一方、クリーンアップは非同期に続き、完了するまで制限されたクライアント容量を保持します。

## レガシー stdio API

既存の `com.alibaba.qwen.code.cli` API も引き続き利用可能です：

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

## Java 11 移行と alpha の制限

`0.1.0-alpha` は、アーティファクト全体の最小 Java バージョンを 8 から 11 に引き上げます。Java 8 アプリケーションは `0.0.3-alpha` に留まる必要があります。Logback はランタイム依存関係ではなくなりました。アプリケーションが使用する SLF4J プロバイダーを追加してください。

この alpha は、プロンプトターミナルを証明できない場合に意図的に fail closed となります。デーモン再起動をまたいだ exactly-once の実行、自動エポック回復、スナップショット/再同期、永続化されたカーソル、または真のプロンプト ID 対象のキャンセルは保証しません。`prompt_cancelled` とキューイベントは助言的です。一致する `turn_complete` と `turn_error` のみがターミナルです。

セッション作成に曖昧なトランスポート結果がある場合、デーモンは ID が呼び出し元に届かなかったセッションを保持する可能性があります。SDK は作成をリトライせず、その不明なセッションをデタッチすることもできません。デーモン側のライフサイクル回収が回復の境界です。

## アーキテクチャ

アーティファクトには 2 つの分離された実装が含まれています：

- **デーモン API**: `DaemonClient` と `DaemonSessionClient` は REST 変更と再開可能な SSE を使用し、制限された HTTP、プロンプト、メンテナンス、およびタイマーリソースを所有します。
- **レガシー stdio API**: `QwenCodeCli`、`Session`、および `ProcessTransport` は、既存の CLI プロトコル DTO とユーティリティを使用して子 CLI プロセスを管理します。

デーモン実装は、レガシーのプロセストランスポート、セッションモデル、DTO、またはグローバルエグゼキュータを再利用しません。

## レガシー stdio 機能

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

A: はい。デーモン API には互換性のある `qwen serve` が必要です。レガシー stdio API には qwen-code 0.5.0 以上が必要です。

### Q: サポートされている Java バージョンは？

A: `0.1.0-alpha` は Java 11 以上が必要です。Java 8 ユーザーは `0.0.3-alpha` に留まる必要があります。

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
