# 追記専用の ChatRecord から DaemonTranscriptBlock への共用射影カーネル

## ドキュメントのステータス

- ステータス: 実装済み
- 日付: 2026-07-14
- 実装日: 2026-07-15
- スコープ: core, acp-bridge, cli, sdk-typescript, web-shell
- 入力: 呼び出し元によって JSONL からすでにパースされた追記専用の unknown レコード
- 出力: 診断情報と完全性情報を持つ `DaemonTranscriptBlock` の射影

## 結論

実装結果: レコード準備、ACP リプレイマシン、純粋なライブ/リプレイビルダー、CLI アダプター、出所を認識するコンパクション、SDK のノーマライザー/リデューサー、オプトインの SDK ファサードはすべて着地しました。デフォルトのデーモンブラウザバンドルは 151 KiB のバジェット内に収まっています。minify された transcript ブラウザバンドルは 67,730 バイトです。分離された daemon と daemon/transcript の成果物の合計は 222,335 バイトで、その両方を import する成果物は 222,722 バイトです。追加の 387 バイトはモジュール結合時のラッパーオーバーヘッドであるため、呼び出し元は transcript のサブパスを明示的なオプトインコストとして扱うべきです。同期パフォーマンスのベースラインと Web Worker のガイダンスは SDK の README に記載されています。

Web の呼び出し元は、別のオプトイン SDK サブパスを使用します:

    import {
      projectChatRecordsToDaemonTranscript,
      type ChatRecordTranscriptProjection,
    } from "@qwen-code/sdk/daemon/transcript";

    const projection = projectChatRecordsToDaemonTranscript(records);
    const { blocks, diagnostics, complete, truncated } = projection;

この同期関数は、デーモン、Express、ACP 子プロセスを開始せず、ファイルシステム、ネットワーク、DOM、ブラウザストレージへのアクセスも行わず、JSONL テキストのパースもしません。`JSON.parse` 後の raw な追記専用レコードを受け取り、内部的に以下を実行します:

    runtime validation
      -> active leaf selection
      -> parentUuid chain reconstruction
      -> same-UUID fragment aggregation
      -> persisted transcript replay
      -> SessionUpdate normalization
      -> DaemonTranscriptBlock projection

共用実装は、明確な所有権を持つ 3 つの深いモジュールに分割されています:

    packages/core/src/utils/transcript-records.ts
      -> package export @qwen-code/qwen-code-core/transcriptRecords
      -> browser-safe record preparation
      -> active chain, aggregation, gaps, diagnostics

    packages/acp-bridge/src/transcript-replay.ts
      -> browser-safe replay machine
      -> shared pure SessionUpdate builders

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
      -> SDK adapter
      -> normalizer/reducer/finalize
      -> public projection interface

CLI の `HistoryReplayer` とライブの `MessageEmitter`、`ToolCallEmitter`、`PlanEmitter` はすべて、acp-bridge の純粋な update ビルダーを再利用します。これにより、「CLI 対 Web」から「ライブ対リプレイ」への単なる移動によるドリフトを防ぎます: レコードの解釈と update の構築はそれぞれ単一の実装を持ちます。

SDK アダプターは同じ `SessionUpdate` の値を ID なしの `DaemonEvent` の値としてラップし、既存の `normalizeDaemonEvent` と transcript リデューサーを再利用して、最終的に `blocks`、`diagnostics`、`complete`、`truncated` を返します。

## 背景

対象シナリオは、`qwen -p` が生成した永続化 JSONL の WebShell での読み取り専用レンダリングです。例:

    /root/.qwen/projects/-root--qwen-workspace/chats/<session-id>.jsonl

ブラウザはホスト、ファイルピッカー、または別の信頼された読み取りパスを通じてファイル内容をすでに取得しており、JSONL テキストを unknown レコードにパースする責任を負います。その後の完全なパスは以下のとおりです:

    parsed append-only records
      -> shared record preparation
      -> shared transcript replay
      -> DaemonTranscriptBlock projection
      -> WebShellTranscript

呼び出し元は、`parentUuid` ツリー、rewind 後のアクティブブランチ、同じ UUID の追記フラグメント、セッションアーティファクトレコード、履歴のギャップを理解する必要がありません。これらの永続化セマンティクスを呼び出し元に委ねると浅いモジュールが生まれます: インターフェースは単一の関数に見えますが、正しく使用するには呼び出し元が `SessionService` の知識を再実装する必要があります。

本設計は `compactedReplay` を使用しません。それはデーモンがライブセッションのために維持する、制限付きのインメモリ復旧ウィンドウです。このユーティリティは、呼び出し元が明示的に提供した永続化レコードを処理します。オフライン射影にはデフォルトでブロック数の制限はありませんが、個別のテキストブロックに対する安全制限は保持し、すべての非可逆処理を `diagnostics` と `truncated` で明示的に報告します。

## 既存のベースライン: デーモンの `/load` が JSONL をリプレイする方法

現在のレスポンスモードの `/load` は、JSONL を SDK に直接渡しません。完全なパスは以下のとおりです:

    SessionService.loadSession
      -> JSONL parse
      -> last non-artifact leaf
      -> buildOrderedUuidChain
      -> same-UUID aggregateRecords
      -> ResumedSessionData.conversation.messages

    QwenAgent.loadSession
      -> collectHistoryReplayUpdates
      -> HistoryReplayer
      -> MessageEmitter / ToolCallEmitter / PlanEmitter
      -> SessionUpdate[] in LOAD_REPLAY_META_KEY

    acp-bridge restoreSession
      -> extractLoadReplayResponse
      -> BridgeClient.seedSessionUpdates
      -> prepareSessionUpdateFrames
      -> EventBus.seedReplayEvents
      -> compactedReplay + liveJournal

    DaemonSessionClient.load
      -> replaySnapshot
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> DaemonTranscriptState.blocks

ストリームモードの `/load` の前半も `HistoryReplayer` が生成します。update は load レスポンスに含まれるのではなく、ACP の通知として pending restore の `EventBus` に入ります。どちらのモードも、最終的には同じブリッジのフレーム準備、ノーマライザー、リデューサーを通過します。

現在の実装には、収束させなければならない 3 つの分岐があります:

- `SessionService` と `SessionTranscriptReader` はそれぞれ独自の `aggregateRecords` 実装を持っている。
- `SessionService` は最後の非 artifact レコードをリーフとして選択する一方、`SessionTranscriptReader` は現在、最後に構造的に有効なレコードを選択している。artifact がたまたまファイル末尾にある場合、それらのセマンティクスは異なる。
- JSONL リプレイは CLI の emitter クラスに依存しているため、ブラウザは `Config` と Node ランタイムを取り込まないと再利用できない。

本設計は、別の JSONL から blocks へのショートカットを作りません。代わりに、上記のパスからブラウザセーフなレコード準備と `SessionUpdate` の構築を抽出し、その後、デーモンの既存の normalize/reduce の末尾を引き続き使用します。

## ゴール

- raw なパース済みレコードを transcript に射影する、同期的、インメモリ、ブラウザセーフな関数を提供する。
- アクティブチェーンの選択、同じ UUID の集約、履歴のギャップを 1 つのレコード準備モジュールに統合する。
- CLI のリプレイ、デーモンの load、Web のオフライン射影が、レコード解釈と `SessionUpdate` の構築ルールを共有するようにする。
- ライブの emitter とリプレイマシンが純粋な update ビルダーを共有し、ライブ/リプレイの局所性を維持する。
- タイムスタンプ、ソースレコードの identity、part の順序、ツールの開始/結果の対応付け、ページング状態、EOF のダングリングクリーンアップを保持する。
- 同じ入力に対して決定論的な射影を生成し、現在の `Config` に依存しないフィールドには決定論的なフォールバックを使用する。
- 永続化された JSON を信頼できない入力として扱い、呼び出し元のエラー、回復可能な破損、前方互換の unknown な値を区別する。
- すべてのスキップ、曖昧さ、切り詰めに対して構造化された診断を発行し、部分的な射影を完全なものとして提示しない。

## ノンゴール

- ファイルの読み取りや JSONL テキストのパース。
- `EventBus`、SSE カーソル、`Last-Event-ID`、`compactedReplay` のシミュレーション。
- permission、shell、user_shell、キャンセルなど、永続化されていないライブ専用のブロックをレコードから推測すること。
- core の Node 専用のリーダー、プロバイダー型、完全なランタイムをブラウザバンドルに持ち込むこと。
- 永続化された呼び出し ID が存在しない場合の、同名の並行ツール呼び出しの曖昧さのない復元を保証すること。
- セッションアーティファクトストアを返すこと。artifact は独立したサイドチャネルのまま。
- CLI の emitter クラス階層全体を共用の末端に移動すること。共有されるのは純粋な update ビルダーのみ。

## アーキテクチャ

### 1. レコード準備モジュール

レコード準備は core の永続化セッションモデルが所有します。ブラウザセーフな末端を追加します:

    packages/core/src/utils/transcript-records.ts
      -> @qwen-code/qwen-code-core/transcriptRecords

このモジュールは:

- unknown レコードに対してランタイム検証を行う;
- 明示的な `leafUuid` を選択するか、デフォルトで最後の有効な非 artifact 会話レコードを使用する;
- リーフから `parentUuid` をたどってルートまで歩く;
- 親が欠落している場合は、より早い島には結合せずに停止し、`HistoryGap` を生成する;
- アクティブチェーンの順序で同じ UUID のフラグメントを集約する;
- 現在 `SessionService` が使用しているフィールドマージングルールを使用する;
- サイクル、競合する `parentUuid` 値、破損レコード、スキップされた artifact レコードを識別する;
- 入力を変更せずに、新しいトップレベルのレコードと part の配列を返す。検証済みのネストされたペイロードは、無益なディープクローンではなく readonly な値として再利用される。

完全な配列とストリーミングインデックスでは読み取り方が異なるため、`SessionTranscriptReader` にファイル全体をメモリに読み込ませるのではなく、同じセマンティックプリミティブを共有します:

    validateTranscriptRecord
    isTranscriptConversationRecord
    selectTranscriptLeaf
    walkTranscriptUuidChain(lookup)
    aggregateTranscriptRecordFragments

`prepareTranscriptRecords` は raw な配列に対してこれらのプリミティブを構成します。`SessionService` は構成された関数を直接使用します。`SessionTranscriptReader` はバイトオフセットのインデックスとページング読み取りを保持しますが、同じ分類器、ルックアップベースのチェーンウォーカー、アグリゲーターを使用します。既存の `buildOrderedUuidChain` はこの実装に畳み込まれ、2 つ目の walk として残してはなりません。

これにより、2 つの `aggregateRecords` 実装を削除しつつ、artifact が最後のレコードである場合のリーダーのセマンティクスの相違を、ストリーミングインデックスやページング読み取りを犠牲にせずに修正します。

この末端は、ブラウザセーフな型と純粋関数のみを import できます。`fs`、`path`、`Buffer`、`ChatRecordingService` クラス、プロバイダーのランタイムコードを import してはなりません。

core には現在 exports マップがありません。実装は、ルート、`transcriptRecords`、`package.json`、および既存の `./dist/*` のディープインポートの exports を明示的に保持する必要があります。ブラウザの末端を追加する際に、リポジトリが互換として記録している `@qwen-code/qwen-code-core/dist/...` のパスを誤って閉じてはなりません。

### 2. Transcript リプレイモジュール

`SessionUpdate` のセマンティクスは ACP に属するため、リプレイマシンと純粋な update ビルダーは以下に置きます:

    packages/acp-bridge/src/transcript-replay.ts
      -> @qwen-code/acp-bridge/transcriptReplay

このモジュールは以下を隠蔽します:

- レコードの type/subtype のディスパッチ;
- メッセージの part の順序付け;
- テキスト、思考、画像、function-call の変換;
- ツールの開始/結果/ダングリングの状態;
- Todo/plan、diff/content、usage、出所;
- 通知、cron、ターン中のメッセージ、slash-command の結果;
- ソースレコードの metadata;
- ページングされたリプレイの状態。

このモジュールを削除すると、複雑さが CLI のリプレイ、ライブの emitter、SDK の射影に再分散されるため、削除テストに合格し、十分な深さがあります。

### 3. 共用 Update ビルダー

リプレイマシンは、`MessageEmitter`、`ToolCallEmitter`、`PlanEmitter` の既存の update 構築ルールを複製しません。acp-bridge の末端は、アダプターのみが使用する純粋なビルダーを提供します:

    createUserMessageUpdate
    createAgentMessageUpdate
    createAgentThoughtUpdate
    createUsageUpdate
    createToolCallStartUpdate
    createToolCallResultUpdate
    createPlanUpdate

ビルダーは構造化されたパラメータのみを受け取り、`SessionUpdate` を返します。`Config`、レジストリ、i18n、ネットワークにはアクセスしません。

CLI のライブ emitter:

    runtime input
      -> CLI metadata adapter
      -> shared builder
      -> sendUpdate

`HistoryReplayer`:

    prepared ChatRecord
      -> replay machine
      -> shared builder
      -> sendUpdate

SDK のオフライン射影:

    prepared ChatRecord
      -> replay machine
      -> shared builder
      -> id-less DaemonEvent
      -> normalizer/reducer

diff プレビュー、Todo 抽出、ツール内容の変換、usage-to-plan の順序、出所のフォールバックは、共用ビルダーまたはそのプライベートヘルパーに置かなければなりません。ライブの emitter は非同期送信とランタイムの付加情報のみを保持します。

### 4. SDK 射影アダプター

SDK ファサードは独立したオプトインエントリに置かれます:

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
    packages/sdk-typescript/src/daemon/transcript.ts
    @qwen-code/sdk/daemon/transcript

これはデーモン UI のノーマライザーとリデューサーを再利用しますが、デフォルトの `@qwen-code/sdk/daemon` ブラウザバンドルには入りません。呼び出し元は SDK をインストールするだけでよく、core や acp-bridge のサブパスに直接依存しません。

## ブラウザセーフなパッケージの継ぎ目

2 つの内部末端エクスポートを追加します:

    @qwen-code/qwen-code-core/transcriptRecords
    @qwen-code/acp-bridge/transcriptReplay

制約:

- ランタイムに Node の組み込み import をしない。
- `process`、`Buffer`、DOM、ストレージにアクセスしない。
- プロバイダーと ACP パッケージには型専用の import を優先する。
- SDK の transcript エントリは、公開されるバンドルに実装をインライン化する。
- SDK の公開 `.d.ts` はパブリックな入力/射影の型をインライン化する必要があり、dev 依存としてのみ存在する acp-bridge のサブパスを参照してはならない。
- core、acp-bridge、SDK の transcript バンドルに Node 組み込みのガードを追加する。

## レコード準備インターフェース

パブリックな SDK ファサードは `readonly unknown[]` を受け取ります。内部検証の後、core の末端は以下を生成します:

    export interface TranscriptRecordInput {
      readonly uuid: string;
      readonly parentUuid: string | null;
      readonly sessionId: string;
      readonly timestamp?: string;
      readonly type: "user" | "assistant" | "tool_result" | "system";
      readonly subtype?: string;
      readonly message?: {
        readonly role?: string;
        readonly parts?: readonly unknown[];
      };
      readonly usageMetadata?: unknown;
      readonly toolCallResult?: unknown;
      readonly systemPayload?: unknown;
    }

    export interface TranscriptReplayGapInput {
      readonly childUuid: string;
      readonly missingParentUuid: string;
    }

    export interface PreparedTranscriptRecords {
      readonly sessionId?: string;
      readonly records: readonly TranscriptRecordInput[];
      readonly gaps: readonly TranscriptReplayGapInput[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
    }

### 検証ポリシー

致命的な呼び出し元エラーは `TranscriptProjectionInputError` を直接スローし、部分的な結果は返しません:

    export type TranscriptProjectionInputErrorCode =
      | "invalid_records"
      | "invalid_max_blocks"
      | "leaf_not_found"
      | "mixed_session_ids";

    export class TranscriptProjectionInputError extends TypeError {
      readonly code: TranscriptProjectionInputErrorCode;
    }

- `records` が配列でない。
- `options.maxBlocks` が正の安全な整数でない。
- 明示的な `leafUuid` が存在しない。
- 1 つの射影内に、構造的に有効で異なる 2 つ以上の `sessionId` 値が混在している。

SDK エントリはこのエラーを一貫してエクスポートします。core の内部検証エラーはファサードの境界でマップされるため、内部パッケージのクラスがパブリックな `.d.ts` に漏れることはありません。これらのケース以外では、個別の不正な形式のレコードが射影全体をスローさせてはなりません。

個別のレコードやネストされたペイロードが不正な形式の場合、可能な限り回復可能な履歴を保持し、診断を発行します:

- オブジェクトでないもの、UUID のないレコード、無効な `parentUuid` 値、unknown なレコード型はスキップする。
- 無効なタイムスタンプのレコードは保持するが、それらのレコードの `serverTimestamp` は省略する。
- 重複 UUID のフラグメント間で競合する `parentUuid` 値がある場合、最初のフラグメントを保持して競合を報告する。
- `parentUuid` が欠落している場合はチェーンを停止し、ギャップを報告する。
- `parentUuid` 値がサイクルを形成する場合はチェーンを停止し、サイクルを報告する。
- 認識された種類の不正な形式の part はスキップし、射影を不完全とマークする。
- unknown な前方互換の subtype/part はスキップし、スローせずに警告を発行する。
- `chat_compression`、`ui_telemetry`、`file_history_snapshot`、artifact レコードなど、transcript の内容を生成しない認識済みの system subtype は、`complete` に影響させずに既存のセマンティクスに従ってスキップする。

空の入力は、`complete` を `true` に設定した空の `blocks` を返します。artifact のみの入力も同様に、情報レベルの診断付きで空の transcript を返します。

明示的な `leafUuid` は会話レコードを指す必要があります。artifact レコードのみにマッチすることは、リーフが存在しないことと同等です。artifact レコードは UUID チェーンに入らず、重複する親の競合検出にも参加しません。

### 診断

    export interface TranscriptProjectionDiagnostic {
      readonly code: string;
      readonly severity: "info" | "warning" | "error";
      readonly message: string;
      readonly affectsCompleteness: boolean;
      readonly recordIndex?: number;
      readonly recordId?: string;
      readonly path?: string;
    }

診断メッセージには、マスクされていない引数、結果、トークン、認証情報を含めてはなりません。呼び出し元は `code` で分岐すべきです。`message` はログとデフォルト表示のためだけのものです。

`projection.complete` が意味すること:

- `affectsCompleteness` が `true` に設定された診断がない;
- ブロックやテキストの切り詰めが発生していない;
- リプレイの最終処理が完了している;
- 曖昧なツールの対応付けが発生していない。

最初のバージョンは、少なくとも以下の診断コードを安定化させます。コードは互換性契約であり、メッセージはそうではありません。

| コード                            | affectsCompleteness | 意味                                       |
| ------------------------------- | ------------------- | --------------------------------------------- |
| invalid_record                  | true                | レコード全体がスキップされた                  |
| invalid_timestamp               | false               | 履歴時刻なしで内容が保持された  |
| conflicting_parent_uuid         | true                | 同じ UUID のフラグメントの親が競合している  |
| history_gap                     | true                | アクティブチェーンの親が欠落している          |
| parent_cycle                    | true                | アクティブチェーンにサイクルが含まれている             |
| malformed_part                  | true                | 認識された不正な形式の part がスキップされた       |
| unknown_record_or_part          | true                | unknown な拡張が表示データを含み得る |
| ambiguous_tool_call_correlation | true                | ツール結果を一意に対応付けできない   |
| missing_tool_result             | true                | ツール呼び出しに永続化された結果がない           |
| presentation_fallback           | false               | プレゼンテーションアダプターが失敗し、フォールバックを使用した    |
| transcript_blocks_truncated     | true                | `maxBlocks` が古いブロックを削除した              |
| transcript_text_truncated       | true                | テキストブロックが文字数制限を超えた     |

artifact のみの入力は、`complete` に影響させずに情報レベルの診断を使用できます。後でコードを追加する場合、既存のコードの `affectsCompleteness` のセマンティクスを変更してはなりません。

## リプレイ発行インターフェース

共用層は完全な `SessionUpdate` の値を発行し、射影の出所を保持します:

    import type { SessionUpdate } from "@agentclientprotocol/sdk";

    export interface TranscriptReplayEmission {
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
      readonly emissionOrdinal: number;
      readonly update: SessionUpdate;
    }

1 つの発行は 1 つのレコード射影に対応するため、外側の形状は単数形の `sourceRecordId` を保持します。`SessionUpdate` に書き込まれる際は、後続のコンパクション/upsert 操作による安全なマージのために、単一要素の `sourceRecordIds` 配列になります。

    export interface TranscriptReplayUsageState {
      readonly promptTokens: number;
      readonly cachedTokens: number;
      readonly candidateTokens: number;
      readonly apiTimeMs: number;
    }

    export interface PendingTranscriptToolCall {
      readonly callId: string;
      readonly toolName: string;
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
    }

    export interface TranscriptReplayStateV1 {
      readonly v: 1;
      readonly pendingToolCalls: readonly PendingTranscriptToolCall[];
      readonly cumulativeUsage: TranscriptReplayUsageState;
    }

    export interface TranscriptReplayMachineOptions {
      readonly initialState?: TranscriptReplayStateV1;
      readonly gaps?: readonly TranscriptReplayGapInput[];
      readonly presentation?: TranscriptReplayPresentationAdapter;
      readonly onDiagnostic?: (
        diagnostic: TranscriptProjectionDiagnostic,
      ) => void;
    }

リプレイの状態はバージョン管理されなければならず、`snapshot` はデタッチされたコピーを返します。`initialState` 内の不正な形式の pending エントリは診断付きでフィルタリングされます。無効または有限でない usage は診断付きでゼロにリセットされます。unknown なステータスバージョンは、誤った状態でページングを継続することを避けるため、直接拒否されます。

デプロイ前に発行された transcript カーソルとの互換性のため、`v` のないレガシー状態は、現在の `{ pendingToolCalls, cumulativeUsage }` の形状と厳密に一致する場合に直接 v1 に昇格されます。明示的な unknown な `v` は引き続き拒否されます。レガシー分岐はこの 1 つの公開形状のみをパースし、2 つ目の状態スキーマには進化しません。

## 増分リプレイマシン

    export interface TranscriptReplayMachine {
      project(
        record: TranscriptRecordInput,
      ): Iterable<TranscriptReplayEmission>;
      finalize(): Iterable<TranscriptReplayEmission>;
      snapshot(): TranscriptReplayStateV1;
    }

    export function createTranscriptReplayMachine(
      options?: TranscriptReplayMachineOptions,
    ): TranscriptReplayMachine;

`project` は遅延イテレーターを返します。CLI は各発行を取得した後すぐに `sendUpdate` を await し、送信が成功した後にのみ次の発行を要求します。したがって、ジェネレーターの `yield` 後の状態変更は、前の送信が成功した後にのみコミットされます。

インターフェースはこれらのイテレーション制約を明示的に文書化する必要があります:

- アダプターは `project` が返した各値を完全にイテレートしなければならない。
- 通常の発行の送信に失敗した後、現在のレコードとそれ以降のすべてのレコードを停止する。
- pending のツール結果を削除する現在のタイミングを保持する。
- ツールの開始は、送信が成功した後にのみ pending に追加する。
- 関連する plan ビルダーが累積値を読み取る前に usage をコミットする。
- `finalize` はべき等であり、2 回目の呼び出しは空のイテレーターを返す。
- `finalize` の CLI アダプターは送信エラーを個別にキャッチし、残りのダングリングクリーンアップの試行を継続し、最初のクリーンアップエラーを保持しなければならない。
- リプレイエラーとクリーンアップエラーの両方が存在する場合、引き続き `AggregateError` を使用する。

SDK アダプターには外部の非同期送信の失敗がなく、各イテレーターを完全に消費できます。

## ツール呼び出しの対応付け

呼び出し ID は以下の優先順位に従います:

1. `functionCall.id`、`toolCallResult.callId`、`functionResponse.id` に明示的に永続化された ID。
2. 開始に明示的な ID がない場合、ソースレコードの UUID と part のインデックスを含む予約済みプレフィックスで、安定した合成 ID を生成する。
3. 結果に明示的な ID がない場合、同じ名前の pending 呼び出しがちょうど 1 つである場合にのみ対応付ける。
4. pending の呼び出しがない、またはその名前の pending 呼び出しが複数ある場合、推測しない。独立した合成結果 ID を生成し、`ambiguous_tool_call_correlation` の診断を発行する。
5. 対応付けられなかった開始は、`finalize` 中にダングリングツールとして扱う。

合成 ID は `qwen-replay-tool:` プレフィックスを使用します。マシンは、明示的な ID や以前の合成 ID との衝突をチェックし、衝突時には安定した出現順のサフィックスを追加します。

安定したフォールバックが保証するのは決定論的な identity のみです。情報が欠落している場合の正しい対応付けは保証できません。

## ソースレコードの出所

レコードの identity は、外側の発行のみに存在するのではなく、CLI、デーモン、SDK を通じて伝播する必要があります。テキストブロックは通常 1 つのレコードに由来しますが、ツールブロックは開始と結果の両方のレコードを取り込むため、ワイヤイベントとブロックは順序付きで重複排除された配列を使用します。リプレイビルダーはこれを `SessionUpdate._meta` に追加します:

    {
      qwenTranscript: {
        sourceRecordIds: ["..."]
      },
      timestamp: 1783958400000
    }

制約:

- `sourceRecordIds` は `EventBus` の ID ではなく、`event.id` に書き込んだり `Last-Event-ID` に参加させたりしてはならない。
- `sourceTimestamp` はアダプターの継ぎ目で有限のエポックミリ秒値に変換し、引き続き既存の `timestamp` フィールドを再利用する。
- 履歴ギャップの発行は `[gap.childUuid]` と子レコードのタイムスタンプを使用する。
- 永続化レコードのコンテキストを持たないライブの emitter は `qwenTranscript` を書き込まない。
- ノーマライザーは `qwenTranscript` から `sourceRecordIds` を昇格させ、その後、プレゼンテーション metadata から内部トランスポートオブジェクトを削除する。
- オプションの readonly な `sourceRecordIds` を `DaemonUiEventBase` と `DaemonTranscriptBlockBase` に追加する。
- リデューサーは、`sourceRecordIds` が等しく、他のすべてのマージ条件が満たされている場合にのみ、text/thought/image をマージする。
- ツールブロックは引き続き `toolCallId` で upsert し、イベント順に `sourceRecordIds` を合併する。Plan やその他の upsert ブロックも同じ安定合併ルールを使用する。
- コンパクションエンジンのテキストスロットキーにも `sourceRecordIds` を含め、レコード境界をまたぐマージを防ぐ。
- コンパクションエンジンが同じ `toolCallId` をマージする場合、`qwenTranscript.sourceRecordIds` を安定的に合併しなければならない。結果の metadata が開始の出所を上書きしてはならない。
- `sourceRecordIds` の比較とインデックスには、構造的同値性と `Map` を使用し、悪意ある UUID がキーの衝突を引き起こせるエスケープなしの区切り文字結合は使用しない。
- `qwenTranscript` のないライブイベントは、現在のコンパクション動作を維持する。

これにより、デーモンの両方の `/load` モードとオフライン射影で同じレコード分割が保持されるため、適合テストにテスト専用の `activeRecordId` コンテキストは不要です。

## 可変プレゼンテーションデータのアダプター継ぎ目

    export interface TranscriptReplayPresentationAdapter {
      resolveToolMetadata(
        toolName: string,
        args: Readonly<Record<string, unknown>>,
      ): TranscriptReplayToolMetadata;

      formatHistoryGap(gap: TranscriptReplayGapInput): string;
    }

- CLI アダプターは現在の `Config`/ツールレジストリを使用してタイトル、種類、location を解決し、CLI の i18n を使用して履歴ギャップをフォーマットする。
- ブラウザアダプターは決定論的なフォールバックを使用する: タイトルはツール名に永続化された description 引数を加えたもの、種類は `other`、location は空、履歴ギャップは固定の SDK コピーを使用。

アダプターがスローした場合、リプレイマシンは決定論的なフォールバックを使用し、プレゼンテーションの付加情報が transcript 全体を終了させないように、診断を発行します。

出所、Todo/diff/content、usage、呼び出しの対応付けはこの継ぎ目に属さず、共用実装が決定しなければなりません。

## CLI アダプター

`HistoryReplayer` は既存の呼び出しインターフェースを保持しますが、非同期アダプターに縮小されます:

    prepared records
      -> seed replay state
      -> machine.project(record)
      -> await sendUpdate(emission.update) in order
      -> machine.finalize() when requested
      -> copy machine.snapshot()
      -> clear active replay context

以下の動作は CLI に残ります:

- `Config`/ツールレジストリによる付加情報;
- ローカライズされた CLI の履歴ギャップテキスト;
- `messageRewriter.interceptUpdate`;
- 非同期 `sendUpdate` の失敗処理;
- リプレイエラーとダングリングクリーンアップエラーの `AggregateError` での結合;
- ライブ専用の goal、stop フック、その他の永続化されないイベント。

load、ページングされた transcript、エクスポートのパスは、同じレコード準備とリプレイマシンを使用しなければなりません。同じ JSONL が異なるエントリポイントを通じて異なる `SessionUpdate` の値を生成しないようにするためです。

## SDK Transcript インターフェース

    export interface ChatRecordTranscriptOptions {
      readonly leafUuid?: string;
      readonly maxBlocks?: number;
    }

    export interface ChatRecordTranscriptProjection {
      readonly blocks: readonly DaemonTranscriptBlock[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
      readonly complete: boolean;
      readonly truncated: boolean;
    }

    export function projectChatRecordsToDaemonTranscript(
      records: readonly unknown[],
      options?: ChatRecordTranscriptOptions,
    ): ChatRecordTranscriptProjection;

`options.maxBlocks` が省略された場合、オフライン射影はブロック数を切り詰めません。明示的な値は正の安全な整数でなければなりません。切り詰めが発生する場合:

- `truncated` は `true`;
- `complete` は `false`;
- `diagnostics` に `transcript_blocks_truncated` が含まれる;
- ツール、permission、親のインデックスは、引き続きリデューサーの安全なクリーンアップルールに従う。

オフラインアダプターはデフォルトとして明示的に `Number.MAX_SAFE_INTEGER` を渡します。オンラインの `createDaemonTranscriptState` の `DEFAULT_MAX_BLOCKS` を変更したり、リデューサーの状態に `Infinity` を入れたりしません。

SDK アダプターのイベントパスは以下のとおりです:

    TranscriptReplayEmission
      -> id-less DaemonEvent(type = session_update)
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> finalizeOfflineDaemonTranscriptState
      -> ChatRecordTranscriptProjection

イベントが ID を持たないのは、`EventBus` に由来しないためです。`sourceTimestamp` は `serverTimestamp` になり、`sourceRecordIds` は分離された射影の出所のままです。

オフラインアダプターは固定のリデューサー時刻 `0` を使用し、`Date.now` が観測可能なフィールドに入ることを防ぎます。同じ入力、オプション、プレゼンテーションアダプターは、深い等価性を持つ射影を生成しなければなりません。`serverTimestamp` は実際の履歴時刻を表します。

新しいプライベートな `finalizeOfflineDaemonTranscriptState` はオフライン射影のクリーンアップのみを実行し、デフォルトの daemon エントリからはエクスポートされません:

- アクティブな assistant/thought ブロックの `streaming` を `false` に設定する;
- アクティブなテキストポインターをクリアする;
- ワイヤイベントや可視ブロックを作り出さない;
- 確定したツールのステータスを変更しない。

個別のテキストブロックは引き続き SDK の安全文字数制限を使用します。文字の切り詰めが発生した場合、リデューサーの診断フックは `transcript_text_truncated` を報告し、`truncated=true` と `complete=false` を設定しなければなりません。可視の `[truncated]` サフィックスのみに頼ってはなりません。

ブロック/テキストの切り詰めを観測可能にするため、`DaemonTranscriptReducerOptions` にオプションの `onTruncation(detail)` を追加します。detail には少なくとも種類、ブロック ID、存在する場合は `sourceRecordIds` が含まれます。通常のストアはこのコールバックを渡しません。オフラインアダプターは detail を収集して重複排除し、射影の診断にします。ユーザーテキストが同じサフィックスを含む可能性があるため、`[truncated]` のスキャンによって切り詰めを推測しないでください。

## 信頼できない識別子の安全性

オフライン入力内の UUID、呼び出し ID、親 ID は信頼できない文字列です。統合前に、これらの transcript リデューサーのインデックスを `Map` または null プロトタイプのオブジェクトに変更します:

- `blockIndexById`;
- `toolBlockByCallId`;
- `permissionBlockByRequestId`;
- `activeAssistantBlockByParent`;
- `activeThoughtBlockByParent`;
- 切り詰められた通知のマップ。

テストは `__proto__`、`constructor`、`prototype`、`toString`、長すぎる ID をカバーし、それらがルックアップ、親子関係、切り詰めのクリーンアップを破壊できないことを確認しなければなりません。

## アーティファクト

ツール結果ビルダーは、デーモンブリッジの artifact サイドチャネルでの使用のために、永続化された artifact を引き続き `SessionUpdate` の metadata に入れてもよいです。ただし、`DaemonTranscriptBlock` に artifact フィールドはなく、SDK のオフライン射影は artifact ストアを返しません。

したがって、適合は 2 つの層に分かれます:

- `SessionUpdate` の適合は artifact を含む。
- `DaemonTranscriptBlock` の適合は artifact サイドチャネルを明示的に無視する。

将来 `WebShellTranscript` に artifact カードが必要になった場合は、artifact を transcript ブロックに持ち込むのではなく、別の artifact 射影を追加してください。

## 一貫性契約

### 強一貫な動作

CLI のリプレイと SDK のオフライン射影はマシンを共有するため、以下は一致しなければなりません:

- アクティブチェーンと同じ UUID の集約;
- レコード/subtype のフィルタリングと update の順序;
- サポートされるメッセージの text/thought/image の形状と part の順序;
- ツール呼び出しの ID と開始/結果/ダングリングの状態;
- Todo/plan、diff/content、raw な入出力;
- usage、タスク実行の usage、plan-stat の順序;
- 通知、cron、ターン中のメッセージ、slash-command、ギャップの挿入位置;
- タイムスタンプ、`sourceRecordIds`、リプレイの診断。

ライブの emitter とリプレイマシンは update ビルダーを共有するため、同じセマンティックなイベントに対して生成された `SessionUpdate` のフィールドは一致しなければなりません。

### 明示的に許可されるアダプターの差異

- CLI の現在の `Config`/ツールレジストリから計算されたツールのタイトル、種類、location。
- CLI の現在のロケールでの履歴ギャップテキスト。
- CLI のメッセージ書き換えによって追加された派生メッセージ。
- artifact サイドチャネル。
- ライブ専用の permission、shell、キャンセル、セッションイベント。

製品がフィールド単位で同一のツール metadata を必要とする場合、リプレイの metadata はツール呼び出しの記録時に永続化し、「永続化された値を優先し、決定論的なフォールバック」に従わなければなりません。履歴の真実を現在のレジストリから再計算してはなりません。

## 適合テスト

テストには 6 つの層があります:

1. core のレコード準備のゴールデンテスト: raw な追記専用のフィクスチャからアクティブチェーン、集約、ギャップ、診断へ。
2. acp-bridge のビルダーテスト: ライブ/リプレイの入力が完全な `SessionUpdate` の値をアサートする。
3. リプレイマシン/コンパクションのテスト: 順序、バージョン管理された状態、ページング、合成 ID、曖昧な対応付け、最終処理、テキスト/ツールのコンパクション中の `sourceRecordIds` の保持。
4. CLI アダプターのリグレッションテスト: 非同期送信、メッセージ書き換え、部分的な失敗、ダングリングクリーンアップ、`AggregateError`。
5. SDK 射影のテスト: ID なしイベント、`sourceRecordIds`、正規化、レコード分割、切り詰め、悪意ある識別子、決定論的なブロック。
6. パッケージ横断の適合: 同じ raw フィクスチャが実際の CLI リプレイと SDK オフライン射影を通過する。

パッケージ横断のパス:

    raw records
      -> SDK projectChatRecordsToDaemonTranscript
      -> sdkProjection

    raw records
      -> shared record preparation
      -> CLI HistoryReplayer
      -> captured SessionUpdate with qwenTranscript metadata
      -> SDK normalizer/reducer/finalize
      -> cliProjection

正規化された射影に対して深い等価性を実行します。正規化器は明示的に許可されたアダプターの差異のみを無視でき、`sourceRecordIds`、タイムスタンプ、ツールのステータス、診断、切り詰めを除去してはなりません。

また、レスポンスモードとストリームモードの `/load` の保持されたリプレイが、ウィンドウの切り詰めが発生しない場合にオフライン射影と一致することを検証する、デーモン統合フィクスチャも追加します。テストは後続のターン境界をまたぎ、`qwenTranscript` の metadata とタイムスタンプのブリッジ/コンパクションによる保持をカバーしなければなりません。

## WebShellTranscript との統合

    import { useMemo } from "react";
    import {
      projectChatRecordsToDaemonTranscript,
    } from "@qwen-code/sdk/daemon/transcript";
    import { WebShellTranscript } from "@qwen-code/web-shell";

    function ReadonlyHistory({ records }: { records: readonly unknown[] }) {
      const projection = useMemo(
        () => projectChatRecordsToDaemonTranscript(records),
        [records],
      );

      return (
        <>
          {projection.complete ? null : (
            <TranscriptDiagnostics diagnostics={projection.diagnostics} />
          )}
          <WebShellTranscript blocks={projection.blocks} />
        </>
      );
    }

SDK はデータ準備と射影を所有し、WebShell は読み取り専用のレンダリングのみを所有します。`WebShellTranscript` は `records` prop を追加せず、プロバイダー、セッション、ネットワーク接続を開始しません。

## 同期パフォーマンス契約

パブリックなファサードは同期的な O(records + parts) の射影であり、明示的な `maxBlocks` が最終的に末尾のブロックのみを保持する場合でも、すべての入力をスキャンします。`maxBlocks` が制限するのは出力メモリであり、計算量ではありません。

実装前に、小、中、大の実フィクスチャを使用して時間とピークメモリのベースラインを確立し、推奨されるメインスレッドの制限を SDK ドキュメントに記載します。その制限を超えるホストは、同じブラウザセーフなインターフェースを Web Worker 内で呼び出し、射影をメインスレッドに渡すべきです。

最初のバージョンは、別の async/worker ラッパーを追加しません。2 番目の実際の呼び出し元が現れた後にそのアダプターを再検討し、アダプターが 1 つしかない偽の継ぎ目を回避します。

## バンドルと公開の制約

コンバーターはデフォルトの `@qwen-code/sdk/daemon` バンドルに入りません。このパッケージエクスポートを追加します:

    "./daemon/transcript": {
      "types": "./dist/daemon/transcript.d.ts",
      "import": "./dist/daemon/transcript.js",
      "require": "./dist/daemon/transcript.cjs"
    }

ビルド要件:

- ブラウザ ESM と Node CJS のバンドルを分離する。
- Node 組み込みのガードを分離する。
- ベースラインのコミットと計測コマンドを記録した、分離されたサイズバジェット。
- パブリックな `.d.ts` ファイルが core/acp-bridge の dev 依存を漏らさない。
- `daemon` と `daemon/transcript` の両方を import するサンプルビルドで重複コードを計測する。
- ブラウザの安全性を、パッケージルートの import や偶発的な tree shaking に依存しない。

この機能によって、151 KiB のデフォルトの daemon バジェットは増加しません。

## マイグレーションの順序

1. ブラウザセーフな transcript レコード準備の末端を core に追加し、`SessionService` と `SessionTranscriptReader` が分類、リーフ選択、チェーンウォーク、集約を共有するようにする。
2. 純粋な `SessionUpdate` ビルダーを acp-bridge に追加し、ライブの emitter を段階的に移行する。
3. リプレイマシンとゴールデンテストを追加する。
4. `HistoryReplayer` を CLI アダプターに変換し、既存の呼び出しインターフェースとエラーのセマンティクスを保持する。
5. `qwenTranscript` の metadata を追加し、`sourceRecordIds` のブリッジ、コンパクション、ノーマライザー、リデューサーの処理を拡張する。
6. リデューサーの信頼できない識別子のインデックスと切り詰めの診断を強化する。
7. オプトインの `daemon/transcript` ファサードと分離された公開成果物を SDK に追加する。
8. パッケージ横断の適合とデーモン統合フィクスチャを追加する。
9. WebShell の読み取り専用ページを `projection.blocks` に接続し、診断を表示する。

各ステップで、古い実装を削除する前に既存のコンシューマーを移行し、いずれの段階でも 2 つのアクティブチェーン、集約、update ビルダーのルールセットが同時に存在しないようにします。

## 推定コードサイズ

- core のレコード準備と 2 つの既存コンシューマーの移行: 本番コード約 180〜280 行。
- acp-bridge のビルダーとリプレイマシン: 約 400〜550 行。
- CLI の `HistoryReplayer` アダプター: 約 60〜100 行。
- SDK の射影ファサード、identity、診断の接着部分: 約 140〜220 行。
- リデューサーの安全性/切り詰めのサポート: 約 60〜120 行。
- 残りは主にフィクスチャ、リグレッションテスト、適合テスト。

これはパッケージ横断の core 変更です。実装前に、メンテナーがリポジトリの core トリアージゲートに基づいてスコープを確認する必要があります。行数を減らすためだけに、重複した集約や update ビルダーを保持すべきではありません。

## 非可逆なスコープ

射影は、レコードに存在する情報しか回復できません。以下は明示的に回復不能、または潜在的に非可逆です:

- permission、shell、user_shell、prompt_cancelled などのライブ専用のブロック;
- セッションアーティファクトストア;
- 現在の `Config`/レジストリ/ロケールの履歴の真実;
- 非対応の binary/audio/fileData;
- `parentToolCallId` のない古いサイドチェーンのサブエージェントのネスト;
- 明示的な呼び出し ID がなく、同名のツールが複数 pending の場合の正確な対応付け;
- 個別のテキストブロックの安全文字数制限を超えた内容;
- 呼び出し元が明示的に指定した `maxBlocks` によって削除された古いブロック;
- 破損した入力、unknown な拡張、壊れたチェーンによってスキップされた内容。

完全性に影響するすべてのケースは診断を発行し、`complete=false` を設定しなければなりません。すべての実際の切り詰めは、`truncated=true` も設定しなければなりません。
