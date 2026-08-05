# Qwen Code Daemon Session Artifacts V2 永続化設計

本文は PR #5895 の V1 session artifact API を引き継ぎ、V2 の永続化機能を設計する。V1 の設計は同ディレクトリの [session-artifacts-daemon-api-implementation-design.md](./session-artifacts-daemon-api-implementation-design.md) を参照。

V2 の目標は、V1 の live session セマンティクスを壊さない前提下で、artifact metadata が daemon の再起動、session load/replay 後に復元できるようにすることである。現在の PR は artifact コンテンツの複製、凍結、管理を行わない。workspace ファイルは、復元後の完全性検証としてパス、size、mtimeMs、sha256 のみを保存する。

## 1. 設計結論

V2 は metadata persistence フェーズである。PR #6259 の実装範囲は、metadata restore、artifact JSONL journal/snapshot/rebuild/fork remap、daemon restart/load/replay 後の artifact metadata 復元、および REST/ACP/SDK の metadata persistence 公開に収束する。content retention（workspace content pin、session-scoped managed copy、manifest、quota、TTL、session-scoped GC/fsck）は現在のスコープ外である。将来的に本物の監査/保管ニーズがある場合は、新しい content archive 設計として再レビューすべきである。client は「V2」というフェーズ名から機能を推測すべきではなく、capability を読み取るべきである。

現在の機能：

1. Metadata restore：デフォルトで artifact の構造化 metadata とリソース参照を復元し、実際のコンテンツは複製しない。
2. Workspace integrity check：workspace artifact の登録時に size + mtimeMs + sha256 を記録する。restore / GET 時はリアルタイムファイルに基づいて `available` / `missing` / `changed` を返す。

対応する capability：

- `session_artifacts_persistence`：metadata の永続化と session load/replay 復元をサポートする。
- `session_artifacts_content_retention`：現在は宣言しない。今後 content archive 設計を再起動する場合は、コンテンツの複製/管理、クォータ、manifest、GC/fsck がすべて完了した後にのみ宣言しなければならない。

核心的な原則：

- V1 の `SessionArtifactStore` は引き続き live session の権威あるインメモリインデックスである。
- V2 は JSONL artifact journal/snapshot を追加し、daemon 側で live store を作成する際の初期状態の seed に使用する。JSONL の append は、現在 chat recording を所有する core/ACP child パスが完了しなければならず、daemon-side store は直接 transcript を書き込んではならない。
- V2 はデフォルトで JSONL-only である。sidecar cache は V2 のリリース基準に入らない。実測で session load のコストが許容できない場合のみ、削除可能なキャッシュを別途設計する。
- リモート URL のコンテンツをローカルに取得しない。
- デフォルトで workspace ファイルを複製しない。
- client が渡す `source`、`clientId`、`trustedPublisher` を認可の根拠としない。
- 復元時は必ず再検証し、ディスク上の古い metadata を信頼しない。

現在の PR の重要な絞り込み：

- Content retention の public API、managed content store、pin/unpin、deleteContent、quota/manifest/fsck/gc、`session_artifacts_content_retention` capability は PR #6259 では提供しない。現在の PR は、古い `pinned` / `contentRef` journal payload に対する downgrade/strip の互換パスのみを保持し、古い記録が metadata restore を壊すのを防ぐ。
- 以下で保持する pin/save、content quota、managed content GC/fsck の詳細は future content archive の青写真であり、PR #6259 の wire contract や受け入れ項目ではない。セクションが明示的に PR #6259 の HTTP mapping / metadata behavior と記載されていない限り、実装は #6259 でこれらの API や capability を公開してはならない。
- 現在の live view と persisted metadata は同じ 200 件の可視集合を使用する。再起動後の over-restore を避けるため、上限超過時の durable/restorable eviction は `reason: "eviction"` の remove event を書き込む。これは本実装における metadata prune に等しく、純粋な V1 の live-only hiding ではない。
- 明示的な DELETE は現在 live-first を採用する：まず live store から削除し、tombstone の書き込みが失敗した場合は warning を返す。これにより機密項目を優先的に非表示にできる。失敗ウィンドウ内で daemon が再起動すると、依然として古い journal からその artifact が復元される可能性があり、client は warning を「削除が durable ではない」シグナルとして扱うべきである。
- Fork は現在、ターゲット JSONL ファイルへの一回限りの exclusive-create 書き込みで行う。fork artifact records を 1 件ずつ streaming しないため、現在の書き込みパスの partial batch を検出するのに `session_artifact_fork_marker` は不要である。将来的に streaming fork に変更する場合、begin/complete marker を導入する。

## 2. ユーザーから見えるセマンティクス

### 2.1 ページリフレッシュ、切り替え、再起動

V2 後の挙動は以下のようになるべきである：

- ページリフレッシュ：V1 と同じで、daemon/session が生きている限り、フロントエンドが `GET /session/:id/artifacts` を再実行すればよい。
- session の切り替え：各 live session は引き続き独立した artifact store を持つ。
- フロントエンドインスタンスの再起動：daemon が生きている間は、現在の live store を GET できる。
- daemon/bridge の再起動：session が再 load された場合、V2 は永続化 metadata から artifact list を復元する。
- 履歴の load/replay：その session に V2 persistence records があれば artifact list を復元し、なければ空の list を返す。

V1 から V2 への live upgrade は別途処理が必要である：すでにメモリ内にある V1 の live artifacts には JSONL journal がない。V2 がこれらの live sessions に初めて触れる際、chat recording owner が提供する artifact persistence writer を通じて初期の `session_artifact_snapshot` を 1 件書き込み、その後で新しい restorable artifact mutation を受け付けるべきである。backfill は live store をそのままシリアライズしてはならない。各 artifact に対して ingest validation、privacy minimization、`retention` の materialization を再実行しなければならない。単一の artifact が不合格の場合はその件をスキップまたはダウングレードし、1 件の不良記録が backfill 全体を道連れにしないようにする。writer が利用できない場合や backfill が全体として失敗した場合、その session は引き続き V1 の live-only 挙動を維持し、structured warning を記録する。既存の live artifacts がすでに復元可能だとユーザーに誤解させてはならない。

backfill は JSONL への artifact event の 1 件ずつの streaming 書き込みを行ってはならない。実装は必ずまずメモリ内で検証、最小化、ダウングレードを完了し、完全な candidate snapshot を形成した後、`session_artifact_snapshot` を一括 append しなければならない。candidate の構築や snapshot の append が失敗した場合、部分的な durable artifact state を残してはならない。現在の PR は V1 live-store backfill を実装しない。今後補完する場合、candidate エントリ数、スキップされたエントリ数、検証失敗の理由を structured telemetry または snapshot metadata に書き込み、fsck と restore warning が「完全だが検証によりスキップされたエントリがある」と「部分的な書き込み/破損」を区別できるようにすべきである。

### 2.2 retention の階層化

optional field の追加。PR #6259 の public mutation パスは `ephemeral` と `restorable` のみを受け付ける。古い journal 内の `pinned` は restore / fork 時に metadata-only の `restorable` にダウングレードされる：

```ts
type ArtifactRetention = 'ephemeral' | 'restorable';
```

意味：

- `ephemeral`：live store にのみ存在する。daemon/session が消滅した後は復元されない。
- `restorable`：metadata を永続化 journal に書き込む。session load/replay 後に artifact item として復元されるが、基盤となるリソースがまだ存在することは保証しない。

デフォルトルール：

- Tool result、`record_artifact`、hook artifact：デフォルト `restorable` だが、metadata のみ永続化する。
- ユーザーがインタラクティブなフロントエンドで手動登録した Client POST artifact：デフォルト `restorable`、復元後も artifact list に表示される。
- バックグラウンド/自動化された client POST：一時的な UI 状態のみの場合は明示的に `retention: "ephemeral"` を要求すべきである。SDK は明確な ephemeral helper を提供すべきである。
- `published` artifact：デフォルト `restorable`。現在は published locator のみ復元し、コンテンツは管理しない。

chat recording が無効化されている場合、metadata persistence はデフォルトで無効となり、capability は宣言されない。

### 2.3 ユーザー登録 artifact の復元セマンティクス

ユーザーが手動登録した artifact は V2 復元後も存在し続けるべきであるが、復元されるのは「artifact metadata item」であり、無条件のコンテンツバックアップではない。

復元後の結果はリソース状態によって区別される：

- `external_url`：title、description、url、metadata を復元する。daemon はリモート URL にアクセスしない。URL が開けるかどうかは client のクリック時に決定される。
- `workspace`：workspacePath と metadata を復元する。ファイルが workspace 内にあり size + mtimeMs が変わっていない場合、または mtime 変化後も sha256 が登録時と一致する場合は `status: "available"`。ファイルが削除、移動、または symlink エスケープしている場合は `status: "missing"`。ファイルが存在するが size または sha256 が登録時と異なる場合は `status: "changed"`。
- `managed`：managedId を復元する。managed storage manifest がまだ解決できる場合のみ `available`。
- `published`：published locator を復元する。trusted publisher manifest の検証を依然として満たす場合のみ published trust を保持する。

したがって、「ユーザーが登録した artifact は復元後も存在するか？」への答えは：V2 では、ユーザーが DELETE しない限り、metadata が GC/tombstone されない限り、復元検証で記録が安全に表示できないほど破損していない限り、chat recording / persistence が無効化されていない限り、リストに存在すべきである、というものである。基盤コンテンツをまだ開けるかどうかは、storage タイプとリアルタイムのリソース状態に依存する。workspace ファイルは daemon がバックアップせず、`changed` は誤ったバージョンを暗黙的に開くことを避けるために使われる。

daemon はリクエスト payload だけでは「手動」か「バックグラウンド」かを判断できない。実装上は、接続 principal、SDK helper、または UI action path によってインタラクティブな登録ソースを識別すべきである。インタラクティブな意図を確認できない client は、明示的な `retention` で処理すべきであり、デフォルトでは `restorable` を受け付けるが、session metadata quota と監査記録の制約を受ける。

## 3. データモデル

### 3.1 Public artifact の拡張

V2 は V1 の response artifact に optional fields を追加する：

```ts
interface DaemonSessionArtifact {
  // V1 fields...
  status: 'available' | 'missing' | 'changed';
  retention?: 'ephemeral' | 'restorable';
  persistedAt?: string;
  restoreState?: 'live' | 'restored' | 'unverified' | 'blocked';
  persistenceWarning?:
    | 'persistence_unavailable'
    | 'metadata_only_restore'
    | 'restore_validation_failed'
    | 'sticky_override_active';
  metadata?: {
    'qwen.workspace.sha256'?: string;
    'qwen.workspace.mtimeMs'?: number;
    [key: string]: string | number | boolean | null | undefined;
  };
}
```

フィールドの説明：

- `retention`：artifact の永続化レベル。解決順序は：リクエストボディの明示値が最優先。システム内部 artifact は §2.2 の daemon デフォルトポリシーに従う。client POST が未指定の場合はユーザー設定の `defaultRetention` を使用する。設定がない場合は `restorable` にフォールバックする。persistence capability が宣言されていない場合や V1 時代の記録を読む場合のみ、V1 互換の live-only として処理する。V2 writer が journal に書き込む際は `retention` を materialize しなければならず、optional のデフォルトに依存してはならない。
- `persistedAt`：metadata が直近で正常にディスクへ書き込まれた時刻。
- `restoreState`：復元ソースのヒント。`status` を置き換えるものではない。
- `persistenceWarning`：非ブロッキングな永続化/復元リスク。フロントエンドはこれを使って「この artifact は再起動をまたいで保持されない」などの状態を提示できる。現在の wire shape は固定文字列であり、host の絶対パス、credential、token、内部 storage path、connection id を response に書き込むことを避ける。より構造化された `{ code, message }` は後続の互換拡張とできる。
- `status: "changed"`：workspace artifact 専用。daemon は登録時に `sizeBytes`、`metadata["qwen.workspace.sha256"]`、`metadata["qwen.workspace.mtimeMs"]` を書き込む。GET/list/restore 後の refresh はまず現在のファイルを stat し、size が変化していれば直接 `changed` を返し、size/mtime がどちらも変わっていなければファイルを再読み取りせず、mtime が変化したが size が同じ場合のみ sha256 を再計算して兜底する。

### 3.2 Status と restoreState の関係

V1 の `status` は引き続き現在のリソースが利用可能かを表す：

- `available`
- `missing`
- `changed`

V2 は workspace integrity 状態として `changed` の 1 種類のみを追加する。これはパスが依然アクセス可能だが、リアルタイムファイルの size が変化したか、mtime 変化後の sha256 が登録時の metadata と一致しないことを示す。`blocked` は `status` ではなく、`restoreState` のみに属する：

- `restored`：永続化 metadata から復元された。
- `unverified`：metadata は復元されたが、workspace/managed の検証がまだ完了していない。
- `blocked`：復元時にセキュリティ境界が満たされていないことが判明した。workspace path のエスケープなど。
- `live`：現在のプロセス内で新たに生成されたか、リフレッシュ確認済み。

## 4. 永続化ストレージ設計

### 4.1 JSONL-only source of truth

V2 はデフォルトで Chat JSONL system records のみを使用する：

1. JSONL journal は監査ソース、復元ソース、クロスバージョンの移行ソースである。
2. `session_artifact_snapshot` は JSONL 内の復元高速化ポイントであり、独立したファイルではない。
3. V2 では sidecar cache を導入しない。sidecar はパスの同期、陳腐化検証、archive/unarchive/delete との連動、orphan GC、キャッシュの信頼問題を増やす。現在の session load はすでに JSONL を読み取っており、artifact records は同じ parse ラウンドで抽出できる。

将来の実測で sidecar が必要な場合、個別の設計として導入し、2 つの制約を満たさなければならない：

- sidecar は削除可能なキャッシュのみであり、プロトコルの正当性を担ってはならない。
- sidecar にヒットした場合でも、各 artifact に対して復元検証を実行しなければならず、JSONL restore validation をバイパスしてはならない。

sidecar は V2 永続化の correctness requirement ではない。現在 `loadSession()` は復元のために session JSONL 全体を読み取り、会話ツリーを再構築する。artifact restore が同じ読み取りラウンドで snapshot/event records を抽出する際、追加のファイル I/O は発生しない。したがって、sidecar は現在のアーキテクチャでは artifact records のわずかな parse/replay コストを節約できるだけであり、session load の主要な読み取りコストを除去できない。

sidecar を現在の PR に組み込むと、実装面が明らかに拡大する：

- JSONL と sidecar のデュアルライト順序、fsync、crash recovery。
- stale/corrupt sidecar の検証、無効化、fallback。
- archive/unarchive/delete/fork/remap 時の sidecar ライフサイクル同期。
- sidecar が信頼できるか、restore validation のセキュリティ境界をバイパスする可能性がないか。
- orphan sidecar/cache のクリーンアップと追加のテストマトリクス。

したがって V2 のリリース基準は JSONL-only を維持する。sidecar は、以下のいずれかの条件がプロファイリングまたは製品要件で証明された後でのみ、個別設計として入る：

- `loadSession()` が JSONL 全体の読み取りを不要になり、sidecar が 1 回の cold-start フルスキャンを避けられる場合。
- session history を load しないシナリオで artifact list のコールドスタート表示が必要な場合。
- 実測で artifact restore（会話履歴の再構築ではなく）が session load の主要な所要時間となる場合。
- session/project をまたぐ artifact 検索やグローバルインデックスが必要な場合。

### 4.2 JSONL writer の所有権とブランチモデル

Artifact persistence records は chat transcript の一部であり、既存の `ChatRecord` の parent/leaf セマンティクスに従わなければならない：

- JSONL の append は、`ChatRecordingService.appendRecord` を所有するプロセス、またはそれが公開する明確な RPC を通じてのみ完了できる。daemon-side の `SessionArtifactStore` は operation queue で live state、SSE、persistence request の順序を調整できるが、自分で chat JSONL を開いて書き込むことはできない。
- 各 `session_artifact_event` / `session_artifact_snapshot` は、通常の system `ChatRecord` として現在の conversation leaf にアタッチされ、通常の `uuid` / `parentUuid` を取得しなければならない。
- chat tree builder と renderer は `session_artifact_*` system records を side-effect records として扱わなければならない：parent/leaf の順序と replay に参与するが、ユーザーに見える conversation node としてはレンダリングしない。少なくとも、旧バージョンが V2 record を含む JSONL を読み込む際は、未知の system subtype を opaque/ignored side effect として扱わなければならず、session load を失敗させてはならない。
- session load/replay は active leaf chain 内の artifact records のみを適用する。`/rewind` によって abandoned branch に落とされた artifact upsert/remove は、現在の artifact list に影響を与えない。
- `/rewind` または何らかの leaf switch が発生した場合、daemon-side の live `SessionArtifactStore` は新しい active-chain の artifact state に再整列しなければならない：active-chain の replay result から reseed するか、rewind 操作時に surviving chain へ現在の artifact snapshot の top-up を書き込むかのいずれかである。V2 はデフォルトで branch-scoped セマンティクスを採用する。off-branch の mutation は、次回再起動まで消えないまま live の flat map に残り続けてはならない。
- fork/branch は active chain 内の artifact records のみを複製する。off-chain records はターゲット session の復元に参加しない。
- ある実装段階で artifact system records を active leaf chain に接続できない場合、`session_artifacts_persistence` capability を宣言できない。さもなくば rewind 後に古い upsert や古い tombstone が復活する問題が発生する。

これは、V2 が独立した artifact log ファイルを設計せず、chat tree をバイパスする side log も設計しないことを意味する。artifact persistence の正当性は、daemon の現在のメモリ状態ではなく、同じ active chat history に由来する。

### 4.3 JSONL system record

`ChatRecord.subtype` に追加する：

```ts
'session_artifact_event' | 'session_artifact_snapshot';
```

Payload：

```ts
interface SessionArtifactEventRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  changes: Array<{
    action: 'created' | 'updated' | 'removed';
    artifactId: string;
    artifact?: PersistedSessionArtifact;
    reason?: 'explicit' | 'eviction' | 'unpin_to_ephemeral';
  }>;
}

interface SessionArtifactSnapshotRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  artifacts: PersistedSessionArtifact[];
  tombstonedIds?: string[];
  stickyEphemeralIds: string[];
}

type PersistedSessionArtifact = Pick<
  DaemonSessionArtifact,
  | 'id'
  | 'kind'
  | 'storage'
  | 'source'
  | 'status'
  | 'title'
  | 'description'
  | 'workspacePath'
  | 'managedId'
  | 'url'
  | 'mimeType'
  | 'sizeBytes'
  | 'metadata'
  | 'createdAt'
  | 'updatedAt'
> & {
  retention: ArtifactRetention;
  persistedAt: string;
  clientRetained: boolean;
  toolCallId?: string;
  toolName?: string;
  hookEventName?: string;
};
```

`sequence` は各 session artifact store 内の durable mutation counter であり、snapshot/event の順序付けと異常診断に使用する。復元時は依然として active JSONL chain の順序を基準とする。`sequence` は session をまたぐ認可やグローバルな ordering source としては使用しない。

`PersistedSessionArtifact` は正方向の allowlist（明示的な `Pick` または独立 interface）でなければならず、`Omit<DaemonSessionArtifact, ...>` による負方向の排除を使ってはならない。将来 `DaemonSessionArtifact` に新しい runtime-only フィールドが追加された場合、コンパイル時アサーションがメンテナに persisted allowlist に入れるかを明示的に決定することを要求し、schema の汚染を避けるべきである。

store の validation/normalization を経た最小化された artifact shape のみを書き込む。`clientRetained` と tool/hook の display hints を除き、V1 の内部フィールドやランタイム派生フィールドは書き込まない：

- `identityKey` は書き込まない
- `trustedPublisher` は書き込まない
- 絶対 `workspaceCwd` は書き込まない
- transport token / auth principal は書き込まない
- `restoreState` は書き込まない
- `persistenceWarning` は書き込まない
- `clientId` や live-process の owner principal は書き込まない。`source` は表示/監査 hint としてのみ機能し、認可には使用できない

artifact の削除は必ず tombstone change を書き込み、履歴 replay 後に古い upsert で復活しないようにしなければならない。tombstone は同じ id の再出現を永久に禁止するものではない：それは自身の以前の upsert のみをカバーし、その後により高い sequence の明示的な upsert が出現するまで有効である。古い journal の `reason: "unpin_to_ephemeral"` は引き続き sticky override の互換性として扱う：同一 artifact id の後続の暗黙/default upsert は依然として live-only で処理され、認証された REST/ACP mutate route で明示的に `retention: "restorable"` を渡したリクエストのみが supersede できる。tool/hook/background/default retention、restore backfill、暗黙の re-ingest はいずれも sticky override を supersede できない。

sticky override は履歴の tombstone event 内だけに存在してはならない。snapshot writer は、まだ明示的に supersede されていない `unpin_to_ephemeral` 状態を `stickyEphemeralIds` に書き込まなければならない。restore reader はまず snapshot 内の sticky set を復元し、その後 snapshot 以降の upsert/remove を適用する。さもなくば snapshot baseline advance 後、古い tombstone の replay が不要になり、sticky override が失われる。

### 4.4 Snapshot と tombstone の不変条件

artifact snapshot は replay 時の artifact event 適用量を減らすためだけのものである。JSONL ファイル自体の読み取り量は減らさない。

以下を満たさなければならない：

- snapshot の生成は同じ artifact operation queue 内で直列に実行され、すべての先行 mutation の後に厳密に位置しなければならない。
- snapshot は authoritative current state である：snapshot 生成時にまだ有効な artifacts のみを含む。
- `tombstonedIds` は、snapshot 以降も古い upsert をカバーする必要がある tombstones のみを記録する。snapshot でカバーされた古い tombstones は新しい snapshot payload に入らず、配列が履歴とともに無限に増えないようにする。
- `stickyEphemeralIds` は、現在も sticky ephemeral override の状態にある artifact id を記録する。対応する古い tombstone がすでに replay 不要であっても、その override 状態は保持しなければならない。
- `stickyEphemeralIds` は有界でなければならず、デフォルトでは persisted metadata 上限と同じ `maxPersistedMetadata` のオーダーを共有し、artifact journal の working-set budget に計上する。古い `unpin_to_ephemeral` journal の replay が sticky set の上限を超える場合、restore/prune は warning を記録して後でリトライしなければならず、暗黙的な増大、古い sticky override のランダムな裁剪、暗黙の upsert による永続化の復活をさせてはならない。
- snapshot は、かつて tombstone された artifact id を含んでもよい。ただし、その tombstone がより高い sequence の明示的な upsert で supersede されていることが前提である。
- load 時は新しいものから古いものへ最新の valid snapshot を選択し、その後その snapshot 以降の artifact events のみを適用する。
- 最新の snapshot の解析に失敗した場合、`snapshot_invalid` warning を記録し、一つ前の valid snapshot を試み続ける。1 つの破損 snapshot のために session 全体の artifact metadata を失ってはならない。
- valid snapshot がひとつもない場合、active JSONL leaf chain に対して 1 回の順次 artifact event replay を許可する。孤立した破損 artifact record はスキップして warning を記録すべきである。branch の順序、record envelope、または tombstone 状態から信頼できる順序を確立できない場合のみ、その session の artifact persistence records を破棄する。

ここでの snapshot baseline advance は、JSONL 内の古い record を書き換えたり削除したりしない。古い `session_artifact_snapshot`、event、tombstone は依然として append-only の chat transcript に残る。artifact サブシステムは、最新の snapshot payload 内で復元ベースラインを前倒しし、working-set のカウントをリセットするだけである。

### 4.5 ストレージ消費

V2 は sidecar とのデュアルライトを行わないため、JSONL + sidecar の metadata 重複ストレージはない。ストレージ消費は metadata journal と content retention に分かれる：

- Metadata は 1 件あたり通常約 0.5 KB - 2 KB で、title、description、url、metadata のサイズに依存する。
- session ごとの有効な persisted metadata の上限は、デフォルトで live store と合わせて 200 件。単一 snapshot は約 100 KB - 400 KB。
- JSONL journal は増分イベント、snapshot、tombstone を保存する。append-only の chat transcript 自体が増加する。
- content retention が主なスペース源となる。例：単一 artifact 50 MB、単一 session 200 MB、単一 project 1 GB。

制御戦略：

- artifact event journal が固定閾値に達したら `session_artifact_snapshot` を書き込む。例：artifact mutation 100 回ごと、または artifact journal 256 KB ごとの書き込み。
- artifact persistence records は chat transcript のライフサイクルに従う。独立したファイル GC は行わない。
- session ごとの artifact journal working-set byte budget を追加する。例：4 MB。この budget は復元時に読み取り適用が必要な artifact の working set、すなわち最新の valid snapshot とその後の artifact events を測定する。chat transcript 内で snapshot にカバーされた古い artifact records を budget に計上してはならない。さもなくば append-only の JSONL が復元不可能な一回限りの上限になってしまう。
- writer は working-set bytes を明示的に追跡しなければならない：snapshot を書き込むたびに、その snapshot の artifact byte size、JSONL append position または line index を `postSnapshotBase` として記録し、その後の artifact event append ごとに `postSnapshotEventBytes` を加算する。budget チェックは `snapshotBytes + postSnapshotEventBytes` を使用し、snapshot baseline advance が成功したら counter をリセットする。writer が base position や counter の状態を確認できない場合、保守的に新しい snapshot を書かなければならない。それでも確認できない場合はダウングレードまたはエラーとし、無制限の追加をしてはならない。
- budget が上限に近づいたら、まず新しい snapshot の書き込みを試みる。最新の snapshot と post-snapshot events を足しても budget を超える場合、新しい restorable metadata の書き込みをやめ、通常の artifact は `ephemeral` にダウングレードされ、`persistenceWarning.code = "journal_budget_exceeded"` が付く。
- content bytes を JSONL に書き込まない。PR #6259 は daemon-managed の artifact content storage も書き込まない。

## 5. 書き込みと復元フロー

### 5.1 Ingest 時の検証

artifact が live store と JSONL に入る前には、必ず ingest 時の検証を行わなければならず、restore 時のみ検証するのでは不十分である：

- `workspacePath`：相対パスでなければならない。resolve/realpath 後に現在の workspace をエスケープしてはならない。
- `url`：storage type に従って scheme、userinfo、secret-like な query/fragment を検証する。
- `managedId`：パス形態、`..`、絶対パス、区切り文字を拒否する。
- `published`：daemon 内部の trusted publisher または manifest-validated path からのみ生成可能であり、client payload が自称することはできない。
- 古い `contentRef` / `expiresAt`：legacy journal 入力の互換性としてのみ扱う。client payload に出現した場合は拒否または strip し、現在の PR は新しいフィールドを生成できない。
- `restoreState` / `persistenceWarning`：runtime-only の response フィールド。client payload に出現した場合は拒否または strip し、persisted artifact に書き込んではならない。
- `clientRetained`：boolean のみであり、ユーザーの保持意図と安定ソートのヒントを表し、認可シグナルではない。明示的な REST/SDK/UI action のみ設定可能。バックグラウンドの自動 ingest はユーザー保持を偽装できない。
- `metadata`：primitive-only、size limit、secret key/value、unsafe display payload のチェックを実行する。

検証に失敗した場合：

- 明確に悪意のある、または越権的な入力：リクエストを拒否する。
- 機密な locator を含む可能性があるが、ユーザーが live artifact の表示を望む場合：`ephemeral` にダウングレードし、`persistenceWarning.code = "validation_downgraded"` を書き込むことができる。JSONL に書き込んではならない。

### 5.2 Artifact の書き込みフロー

V1 フロー：

```text
ingest input -> normalize/validate -> upsert live store -> publish artifact_changed
```

V2 フロー：

```text
ingest input
  -> normalize/validate
  -> in SessionArtifactStore operationQueue: compute effective mutation
  -> for restorable changes: request chat-recording writer append
     artifact journal/snapshot on the active leaf chain
  -> apply live-store mutation
  -> publish artifact_changed with effective retention/warning fields
```

`SessionArtifactStore` の operation queue は、同じ session の live mutation、persistence request、SSE の順序の直列化を担当する。実際の JSONL append は引き続き chat recording owner が完了する。通常の tool/hook artifact は persistence writer が利用できない場合、live-only の `ephemeral` にダウングレードしてから live store に入ることができる。

sticky ephemeral override が暗黙/default upsert の永続化を抑制した場合、live artifact は必ず `persistenceWarning.code = "sticky_override_active"` を持ち、structured log `action=sticky_override_suppressed` と counter metric を記録しなければならない。さもなくば排障時に、正当な upsert 入力があるのに、対応する durable record が見つからないことになる。

現在の PR には非表示の paged persisted metadata ビューはない。live list が復元後に client に公開される metadata 集合そのものである。そのため上限処理は絞り込まれた戦略を採用する：

- `ephemeral` artifact は live view からのみ破棄でき、journal に書き込まない。
- `restorable` artifact が上限で裁剪される場合、`reason: "eviction"` の remove event を書き込み、次の load/replay で裁剪済みエントリがすべて復活するのを防ぐ。

### 5.3 書き込み失敗セマンティクス

2 つの入口を区別する：

- 通常の tool/hook artifact：永続化の失敗によってツール呼び出しを失敗させてはならない。artifact は引き続き live store に入れるが、まず live store 内の `retention` を `ephemeral` にダウングレードし、`persistenceWarning` を設定してから `artifact_changed` を公開しなければならない。
  復元結果に影響する削除系 mutation について、現在の PR は原因によって区別する：

- `eviction`：durable な remove event で、再起動後も 200 件上限が遵守されることを保証する。
- legacy の unpin-to-`ephemeral`：古い journal を読む際、引き続き durable な remove event を認識し、id を有界の `stickyEphemeralIds` に書き込む。後続の暗黙/default upsert は、明示的な `retention: "restorable"` が supersede するまで live-only を維持する。
- 明示的な DELETE：live-first。まず live store から削除して削除イベントを公開し、その後ベストエフォートで explicit remove tombstone を書き込む。tombstone の書き込みに失敗した場合、response は warning（現在は文字列 warning）を返し、削除が durable ではないことを示す。補完書き込みが成功する前に daemon が再起動した場合、古い journal がその artifact を復元する可能性がある。
- `deleteContent: true` は PR #6259 の public API に属さない。content-retention のフォローアップが content GC と warning contract を定義する。現在の PR の明示的な DELETE は metadata tombstone と live removal のみ処理する。

推奨 warning：

```text
[artifacts] session=<id> action=persist_failed artifact=<id> reason=<code>
[artifacts] session=<id> action=remove_not_persisted artifact=<id>
[artifacts] session=<id> action=sticky_override_suppressed artifact=<id> prior_reason=unpin_to_ephemeral
```

### 5.4 復元フロー

session load/replay 時：

1. `SessionService.loadSession()` が JSONL を読み取り、同じ parse ラウンドで artifact snapshot/event records を抽出する。
2. active leaf chain に基づいて最新の valid な `session_artifact_snapshot` と、その後の `session_artifact_event` を抽出する。abandoned branch 上の artifact records は必ず無視する。
3. artifact snapshot を再構築し、tombstone を適用する。
4. 各 artifact に対して V2 の restore validation を再実行する。
5. load result は `artifactSnapshot` を携えて daemon-side bridge に戻る。
6. daemon bridge は `createSessionEntry` / restore 完了時に snapshot で daemon 側の `SessionArtifactStore` を初期化する。
7. `GET /session/:id/artifacts` が読むのはこの daemon-side store である。

ACP child process の agent/session オブジェクト内で `SessionArtifactStore` を seed してはならない。本番 HTTP API から見える store は daemon-side bridge 内で作成される。

`loadSession()` は read-only でなければならない：parse 過程で tombstone を書き込んではならず、content GC を直接トリガーしてもならない。restore 後に現在の live cap やポリシーが履歴より厳格であることが判明した場合、daemon-side store は作成完了後、persistence writer が利用可能になってから、通常の operation queue を通じて `eviction` remove event を書き込む。writer が利用できない場合は live view でのみ上限超過 item を非表示にし、warning を記録する。次の load でこれらの裁剪待ち記録が再び見える可能性がある。

rewind/replay 時の live store 処理は load と一致しなければならない：active leaf が変わると、flat な live store は off-branch の artifact mutation を保持し続けてはならない。現在の実装に直接 reseed できる active-chain の replay result がない場合、rewind 完了時に artifact snapshot の top-up を書き込まなければならず、さもなくば persistence capability を有効化できない。

具体的な統合ポイントは明示的な hook でなければならず、次の GET 時の遅延修復に頼ってはならない。rewind/leaf-switch 実装が daemon bridge の `onActiveLeafChanged(sessionId, artifactSnapshot)` を呼び出すか、既存の session load/replay result に同等のイベントを載せることを推奨する。artifact store は受信後、同じ session operation queue 内で reseed または top-up snapshot の書き込みを行う。

### 5.5 復元時の検証

復元時は必ず再検証する：

- `workspacePath`：依然として相対パスでなければならず、restore 時の workspace root で再度 resolve/realpath/stat し、現在の workspace をエスケープしてはならない。workspace の再配置後、同じ相対パスがまだ存在すれば `available` として復元できる。ファイルが欠落しているか新しい workspace layout と一致しない場合は `missing` として復元する。V2 は自動 path remapping を行わない。
- `external_url`：`http:` / `https:` のみ許可。username/password credential は拒否。secret-like な query/fragment は必ず redact、non-openable locator へのダウングレード、または artifact 全体のダウングレード/ブロックを行う。
- `published`：`file:` locator を復元できるが、trusted publisher manifest の再検証が通過し、ターゲットが daemon-managed の published storage に属する場合のみ許可する。通常の `external_url` は決して `file:` を通過できない。
- `managedId`：パス形態、`..`、絶対パス、区切り文字を拒否する。
- 古い `contentRef`：legacy journal 入力としてのみ検証し strip する。PR #6259 は daemon-managed manifest でコンテンツを解決せず、古い `contentRef` を開けるコンテンツの約束として公開しない。
- `metadata`：primitive-only、size limit、secret key/value、unsafe display payload のチェックを再実行する。

復元に失敗した場合：

- セキュリティ上の失敗：エントリを保持するが `restoreState: "blocked"`、`status: "missing"` とし、開ける locator を提供しない。
- リソースの欠落：`status: "missing"`。
- セキュリティ型でないフィールドの破損：その artifact をスキップし、warning を記録する。

### 5.6 Branch / fork セマンティクス

既存の `/branch` は active JSONL record chain を複製し、`sessionId` を書き換える。V2 の artifact records は active leaf chain からのみ複製される。rewind 後に abandoned branch に落ちた artifact records は fork に入らない。複製時は artifact id を明示的に処理しなければならない：

- V1 の identity は `sessionId` を含むため、同じリソースは新しい session で新しい artifact id を得るべきである。
- fork がターゲット session に書き込む際は、ターゲットの `sessionId + locator` に基づいて artifact id を再計算すべきである。
- tombstone もターゲット session の新しい id に書き換えなければならない。tombstone の artifact id を安全に remap できる限り、たとえターゲットの active chain に対応する upsert が一時的に見つからなくても、ターゲット session に保持すべきである。orphan tombstone は一致する upsert がなければ無害だが、それを破棄すると後続の同 id upsert が suppression を失う可能性がある。
- `forkedFrom` は元の session id / 元の artifact id を監査情報として記録できるが、新しい session の権限判断に参加してはならない。
- fork が古い `pinned` artifact metadata を継承する場合、必ず `restorable` にダウングレードし、古い `contentRef` を削除しなければならない。
- fork のコピーは必ず ingest/restore validation、privacy minimization、redaction を再実行しなければならない。ターゲット session で安全に表現できない workspace / url / metadata の locator は、必ずダウングレード、strip、または破棄しなければならず、ソース session がかつて検証を通過したことを理由に直接コピーしてはならない。
- `managedId` はソース session から盲目的にコピーしてはならない。ターゲット session 内でターゲットの workspace / daemon-managed manifest から新しい `managedId` を導出できる場合は必ず再計算する。安全に導出できない場合は `managedId` を削除するか、その artifact metadata を破棄しなければならない。

fork remap はリリース基準である：あるパスで artifact id と tombstone を安全に書き換えられない場合、fork 時に artifact persistence records を破棄しなければならず、ソース session の artifact id をそのまま新しい session に持ち込んではならない。既存の fork 実装に `file_history_snapshot` のような top-up 機構がある場合でも、artifact は active-chain の replay result からのみ top-up を生成でき、daemon の現在の live store からそのまま補完書き込みしてはならない。さもなくば rewind 後にすでに履歴に属さない artifact が新しい session に持ち込まれる。

現在の fork 実装は 1 件ずつの append ではなく、まずソースの active chain から完全なターゲット record リストを生成し、その後 exclusive-create でターゲット JSONL ファイルに書き込む。書き込み失敗時、ターゲット session のファイルは成功した fork として扱われない。そのため現在の PR は `session_artifact_fork_marker` を書き込まない。将来 fork が streaming append やプロセス間のバッチ複製に変更された場合、begin/complete marker、count 検証、`fork_incomplete` の復旧ルールを導入する。

fork の rewind セマンティクスは branch-scoped である：ターゲット session は現在の active chain の結果のみを複製する。ユーザーが明示的な DELETE 以前に rewind してから fork した場合、その DELETE tombstone はそもそも active chain に存在しないため、artifact が新しい branch に再出現するのは期待される履歴ブランチの挙動である。製品が「グローバルに rewind 不能な削除」やプライバシー消去セマンティクスを必要とする場合、個別のポリシー設計とすべきであり、V2 のデフォルト branch model に混ぜてはならない。

metadata の fork amplification は V2 では有界のトレードオフとして受け入れる：fork には session mutate 権限が必要であり、各 fork は依然として persisted metadata 200 件の上限の制約を受け、metadata は 1 件が小さく、content bytes は継承しない。V2 は project-level の metadata quota を導入しない。実装は fork された artifact count の metric/log を記録しなければならず、実際の濫用があれば project-level cap を導入する。

## 6. API 設計

### 6.1 Capability

`GET /capabilities` に追加：

```json
"session_artifacts_persistence"
```

コンテンツ保持の分割 PR の実装が利用可能になったときのみ、同時に宣言する：

```json
"session_artifacts_content_retention"
```

現在 `/capabilities` は string feature list であるため、`enabled: false` で「実装は存在するが現在はオフ」を表現できない。ルールは：

- 挙動が利用可能で、現在の設定で有効な場合のみ対応する feature string を宣言する。
- chat recording が無効、metadata persistence が無効、または writer が利用不可の場合、`session_artifacts_persistence` を宣言しない。
- future content archive の明示的な workspace content 保存、quota、manifest、session-scoped GC/fsck がすべて利用可能になった場合のみ、`session_artifacts_content_retention` を宣言する。PR #6259 はこの capability を宣言しない。
- client が limits/default retention を読む必要がある場合、config endpoint や SDK config query を別途設計すべきである。構造化された details を既存の string-only capability contract に混ぜてはならない。

### 6.2 Add artifact

`POST /session/:id/artifacts` は optional を許可する：

```json
{
  "title": "Report",
  "kind": "html",
  "storage": "workspace",
  "workspacePath": "reports/run.html",
  "retention": "restorable",
  "clientRetained": true
}
```

制限：

- client は `ephemeral` または `restorable` を要求できる。
- client は `pinned` を要求できない。
- `clientRetained` は任意で、ユーザーの保持意図とソート hint のみを表す。サーバー側は必ず §5.1 に従ってソースを検証し、認可として扱ってはならない。

### 6.3 Pin/save artifact

PR #6259 は pin/save endpoint を公開しない。明示的なコンテンツ保管、content archive、pin/save セマンティクスは、将来的に必要になった場合、新しい製品要件に基づいて再設計すべきであり、本文の現在の metadata persistence contract から推導してはならない。

### 6.4 Unpin

PR #6259 は unpin endpoint を公開せず、新しい unpin tombstone も生成しない。古い journal の `reason: "unpin_to_ephemeral"` は互換入力として replay を継続するのみであり、履歴記録の復元セマンティクスの変化を避ける。リストから削除するには、引き続き V1 の DELETE を使用する。

### 6.5 Delete artifact

V2 の DELETE は依然として V1 の冪等性を保持し、現在の PR の live-first セマンティクスを採用する：

- まず live store から artifact を削除し、ユーザーに見える削除が即時に効くようにする。
- 続いてベストエフォートで `session_artifact_event` の remove tombstone を append する。tombstone が成功すれば、metadata restore 時に復活しない。
- tombstone が失敗した場合、成功の mutation result を返すが warning を添える。現在の daemon ライフサイクル内ではその artifact は削除済みだが、tombstone の永続化前に daemon が再起動した場合、古い durable artifact が復元される可能性がある。ユーザーまたは上位 UI は storage の復旧後に DELETE をリトライできる。
- DELETE は存在しない artifact に対して冪等な成功を維持する。すでに durable tombstone が存在する場合、繰り返し DELETE で同じ tombstone を再度書き込む必要はない。
- PR #6259 の DELETE は `deleteContent` を受け付けず、daemon-managed の content GC をトリガーしない。古い `contentRef` metadata は restore/serialize時のみダウングレードまたは削除される。

### 6.6 Mutation responses

PR #6259 は DELETE の mutation response のみ提供する。

成功：

- DELETE：`200 OK` で `{ "deleted": true, "artifactId": string, "warnings"?: [...] }` を返す。
- DELETE の tombstone 永続化が失敗しても、依然として `200 OK` の mutation result を返し、`warnings` に永続化失敗の理由を含める。現在の実装は文字列 warning を使用し、例：`remove_not_persisted`。これは live delete が効力を持ったが再起動をまたぐ保証がないことを意味し、durable delete の成功として表示してはならない。

失敗：

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "retention must be ephemeral or restorable"
  }
}
```

PR #6259 の HTTP mapping：

- `400 VALIDATION_FAILED`：不正な body、client が `pinned` を要求、artifact が存在しない、metadata quota が満杯で裁剪可能な candidate がない、または writer が利用できないが mutation が必ず厳密に durable 完了しなければならない場合。
- `403 FORBIDDEN`：session mutate 権限の欠如。
- DELETE は冪等性を維持する。存在しない artifact にはエラーではなく空の mutation result を返す。
- DELETE の tombstone 永続化失敗は、現在の live delete が効力を持ったが再起動をまたぐ保証がないため、`200 OK` + warning を返す。

より細粒度の `INVALID_ARGUMENT`、`NOT_FOUND`、`CONFLICT`、`METADATA_QUOTA_EXCEEDED`、`QUOTA_EXCEEDED`、`PERSISTENCE_UNAVAILABLE` の HTTP error code は後続の API 仕上げであり、現在の PR の wire contract に属さない。

## 7. セキュリティ設計

### 7.1 認可の原則

public な `clientId` を認可境界として扱ってはならない。V2 の実際の HTTP 信頼境界は依然として daemon の bearer token + route-level の read/mutate permission である。既存の auth モデルでは、`session_owner` を安全に mint することも、daemon の再起動をまたいで永続化することもできない。したがって V2 は token-holder より強い owner tier を導入しない。

内部 principal は監査、デフォルトポリシー、payload の spoofing 防止にのみ使用する。durable な認可ソースではない：

```ts
type ArtifactPrincipal =
  | { kind: 'token_holder' }
  | { kind: 'client_connection'; id: string }
  | { kind: 'trusted_publisher'; id: string }
  | { kind: 'hook'; extensionId: string };
```

認可ルール：

- list：session read 権限が必要。
- ephemeral/restorable の追加：session mutate 権限が必要。
- metadata の削除：session mutate 権限が必要。V1 の same-principal delete guard は、live-process の UX guard と監査 hint としてのみ使用できる。これは現在の接続コンテキストに依存し、daemon の再起動をまたいで artifact owner を証明できない。restore 後は public な `clientId` から ownership を偽装できず、削除認可は session-level の mutate 権限に退化し、`ownership_unverified` の監査を記録する。
- content archive / delete content：現在の PR では無効。将来 content archive を再起動する場合、session mutate 権限、独立した capability、明示的な REST/SDK call、および現在のプロセスで検証可能な creator-principal match または明示的な override/admin ポリシーが必要である。background session/hook はコンテンツ削除を直接発起できない。

将来本当の `session_owner` が必要な場合、まず durable な per-session capability または ACL を設計しなければならず、本 V2 ドキュメントで暗黙に仮定してはならない。

### 7.2 Future content archive の境界

本セクションは future content archive の青写真であり、PR #6259 の実装や受け入れ範囲に属さない。

デフォルトで複製しないもの：

- external URL のコンテンツ
- 任意の workspace ファイル
- 通常の assistant link

将来 content archive を有効化する場合、許可を検討できるソース：

- trusted な `ArtifactTool` / publisher が生成した `published` artifact。
- ユーザーが明示的に pin した workspace artifact。ファイルが workspace 内にあり、タイプ/サイズが制御可能なもの。
- client がアップロードまたは登録した managed artifact。daemon API を通じて受信し検証されることが前提。

daemon-managed の artifact storage には明確な root がなければならない：

- `managed_copy` の content root は daemon データディレクトリ内の artifact content エリアに置く。例：`<daemonDataDir>/artifacts/content/`。
- `published` の file root は daemon データディレクトリ内の published artifact エリアに置く。例：`<daemonDataDir>/artifacts/published/`。または設定で宣言された等価の daemon-owned root。root id は必ず publisher manifest に書き込まなければならない。
- JSONL には直接信頼できるホストの絶対パスを保存できない。restore 時は manifest 内の root id と相対 locator のみを読み取り、resolve/realpath 後も対応する root 内になければならず、symlink/path エスケープを拒否する。
- trusted publisher manifest には、少なくとも publisher id、artifact id、storage root id、relative path または content id、sha256、sizeBytes、createdAt を記録する。`file:` locator はその manifest からのみ再生成可能であり、client payload や古い JSONL フィールドから来てはならない。

コンテンツの複製は race-safe でなければならない：

- workspace containment の検証が通過する。
- regular file のみ許可。ディレクトリ、FIFO、device、socket、その他の特殊ファイルは拒否する。
- ファイルを開く際は no-follow セマンティクスを使用する。Linux では `openat2(RESOLVE_NO_SYMLINKS)` が利用可能であり、その他のプラットフォームでは利用可能な no-follow/open-handle revalidation の組み合わせを使う。
- 開いた後、file handle に対して fstat/revalidate を実行し、依然として regular file であり、依然として workspace containment 内にあることを確認する。
- link count が異常な hardlink は、後続の明確な allowlist がなければ拒否する。
- 読み取り時は stream ごとに max bytes を強制し、stat size を先に信頼してはならない。
- コピーした bytes を正確に hash し、sha256、size、mimeType を保存する。
- retained content のオープン/ダウンロード前に manifest/hash を再検証する。

### 7.3 プライバシーと機密情報

永続化前に必ず最小化する：

- host の絶対パスを保存しない。
- URL の username/password を保存しない。
- external URL の secret-like な query/fragment は必ず拒否、redact、または artifact を `ephemeral` / non-openable locator にダウングレードする。そのまま JSONL に書き込んではならない。
- metadata は allowlist または secret-key denylist を使用する。`token`、`password`、`secret`、`cookie`、`authorization` などの key/value は必ず拒否、redact、または `ephemeral` にダウングレードする。
- metadata は引き続き 4 KB に制限する。
- title/description/metadata は引き続き unsafe display payload のチェックを実行する。
- `persistenceWarning.message` は live response フィールドとしてのみ使う場合でも、path-free なテンプレートまたはマスクしたテキストを使わなければならない。host path、credential、token、content root、connection id を warning に書き込んではならない。

後続で設定を追加できる：

```json
{
  "sessionArtifacts": {
    "persistence": {
      "enabled": true,
      "defaultRetention": "restorable",
      "maxLiveArtifacts": 200,
      "maxPersistedMetadata": 200,
      "snapshotThresholdMutations": 100,
      "snapshotThresholdBytes": 262144,
      "contentRetention": {
        "enabled": false,
        "maxArtifactBytes": 52428800,
        "maxTotalBytes": 268435456,
        "maxTtlDays": 365,
        "ttlScanIntervalSeconds": 900
      }
    }
  }
}
```

現在の PR は新しい operator 設定 schema を追加しない。上記の値はコード定数としてリリースされ、capability を通じて挙動が利用可能かを表現する。これらの値を operator の調整可能項目として公開するのは後続の強化であり、client が capability string から設定の詳細を推測できるようにしてはならない。

## 8. クォータ、GC、安定性

### 8.1 Metadata quota

推奨デフォルト：

- live store の上限は引き続き 200。
- persisted metadata の上限は session ごと 200 で、live store と合わせる。
- snapshot record は最大 200 件の現在有効な artifacts を保持する。

live store の上限は、現在の実装では restore の可視集合の上限でもある：

- V2 の live eviction は必ず `ephemeral` artifact を優先的に淘汰する。
- durable artifacts の中から live view を選ぶ必要がある場合、現在の実装は source reservation、source、status、retention、clientRetained、挿入順による決定論的な選択を行う。
- durable artifact が live cap で淘汰される場合、現在の実装は `reason: "eviction"` の remove event を書き込み、次回の restore で daemon が淘汰した item が繰り返し復活しないようにする。
- `clientRetained` はユーザーの保持意図であり、`PersistedSessionArtifact` に入り、restore 後の安定ソートと live cap の選択に使用する。これはソートの保護であり、絶対的な保護ではない。

persisted metadata の上限を超えた場合：

- `ephemeral` はそもそも journal に書き込まず、persisted metadata quota に計上せず、live store の上限の制約のみを受ける。
- `restorable` は必ず決定論的な順序で裁剪し、`eviction` の remove event を書き込む：まず `clientRetained` でない `restorable` artifact を裁剪し、それでもスペースがなければ、`clientRetained` の `restorable` artifact を裁剪する。`clientRetained` はソートの保護であり、絶対的な保護ではない。

restore の seed は live store の上限を超えてはならない。履歴内の有効な persisted artifact が現在の live cap を超える場合、daemon-side store は同じ決定論的ルールで可視 subset を seed し、operation queue を通じて裁剪された durable item の `eviction` remove event を書き込む。`loadSession()` の parse 過程自体は read-only を維持し、直接 durable prune を書き込んではならない。

### 8.2 Content quota

本セクションは後続の content-retention PR の実装範囲である。PR #6259 は content store quota を導入しない。

後続の分割 PR の推奨デフォルト：

- 単一 artifact：50 MB。
- content store 全体：256 MB。

上限到達時：

- 新しい pin/save は `QUOTA_EXCEEDED` を返す。
- 現在の session の live artifact が参照している pinned content は自動削除しない。
- fork は pinned contentRef を継承せず、fork が quota をバイパスするのを防ぐ。

### 8.3 GC

本セクションは後続の content-retention PR の実装範囲である。GC は daemon が管理する session-scoped の managed copy のみを処理する：

- content manifest は `sessionId` と `artifactId` を保存する。GC は manifest が現在の session に属し、かつ現在の live `contentRefs()` の参照セットにない content のみを削除する。
- `pinWorkspaceFile()`、GC、tmp cleanup は同じ write queue で直列化し、in-flight lease で並行な pin/GC が複製済みだがまだ journal されていない content を削除するのを防ぐ。
- `expiresAt` の期限切れは、`GET /artifacts` 前の lightweight prune によって pinned artifact を `restorable` にダウングレードし、`contentRef` を削除してから GC をトリガーする。
- close / explicit delete / unpin / explicit GC endpoint はいずれもベストエフォートで sweep する。GC の失敗は prompt/tool flow をブロックしない。

GC のトリガー：

- artifact の削除、unpin、TTL 期限切れチェック、session close、または明示的な `POST /session/:id/artifacts/gc`。
- 古い `.tmp` エントリは GC 中にクリーンアップされる。

Project-scoped の参照再構築、incomplete-scan の追跡、orphan の猶予期間、global artifact library はすべて後続の強化である。future content archive の safety 境界は「contentRef を session をまたいで継承しない」と「現在の session の manifest であり、現在の live refs が参照していない content のみを削除する」から来るべきである。

### 8.4 Crash consistency

要件：

- artifact store の mutation は直列。
- JSONL journal の append 失敗は live store を壊さない。
- 明示的な DELETE の live-first：live store の削除は journal の失敗でブロックされてはならない。response の warning が tombstone が durable でなかったことを client に伝える。
- `deleteContent: true` を伴う明示的な DELETE は content-retention のフォローアップでのみ利用可能。その PR は live removal 後にベストエフォートの session-scoped content GC を実行し、content 削除の warning を表面化しなければならない。
- durable artifact の live cap eviction は `eviction` の remove event を書き込み、restore が cap を尊重するようにする。
- reader は中途半端な JSONL と破損した artifact record を許容する。
- tombstone / snapshot の順序異常時は、推測するのではなく、復元しないことを選ぶ。

Future content archive の書き込み順序：

1. コンテンツを staging path に複製し、コピーした bytes を正確に hash し、bytes を fsync する。
2. daemon-managed の content root に atomically move し、content manifest を書き込み fsync する。
3. その contentRef を参照する artifact journal event を append し、JSONL を fsync する。
4. live store を更新し、`artifact_changed` を公開する。

ステップ 2 が成功したがステップ 3 の前に crash した場合、journal の参照がない orphan content が残る。これは許容され、future の session-scoped GC が manifest が現在の live refs に参照されていないことを確認した後、ベストエフォートで削除する。ステップ 3 が成功した場合、restore は必ず manifest を通じてコンテンツを見つけられなければならない。明示的な API はステップ 3 が成功した後のみ成功を返せる。

### 8.5 ファイル読み取り、CPU、I/O コスト

V2 は artifact の復元が session load の新しいボトルネックになるのを避けなければならない。

読み取りパスの推奨：

1. `SessionService.loadSession()` がすでに JSONL を読み取っている場合、同じ parse ラウンドで artifact records を抽出する。
2. 最新の valid な `session_artifact_snapshot` を見つけ、その後の artifact events のみ replay する。
3. valid snapshot がない場合、artifact records の 1 回の順次スキャンを許可するが、load フロー内で同じファイルを繰り返しスキャンしてはならない。

CPU コストの境界：

- Metadata restore は JSON の parse とフィールド検証のみで、計算量は O(artifact 数 + 最新 snapshot 後のイベント数)。
- `external_url` の復元はネットワークリクエストを発行しない。
- `workspace` の load/replay は metadata のみ復元する。GET/list refresh は TTL/batch の制限下で単一または一括の workspace ファイルを再 stat し、必要な場合のみ hash して、`available` / `missing` / `changed` を区別する。
- `managed` / `published` の復元は manifest のみを参照し、大きなファイルのコンテンツを読み取らない。
- workspace content の hash は `loadSession()` の JSONL parse 段階で全量実行しない。GET/list refresh はまず size + mtimeMs で安価な stat gate を行い、stat が同サイズの上書きの可能性を示した場合のみファイルストリームを読み取って sha256 を計算する。

I/O コストの境界：

- V2 は sidecar ファイルを追加で読み取らない。
- workspace 状態の検証は V1 の TTL/batch 戦略を再利用し、GET のホットパスですべての artifact に無制限の stat を行わない。
- 大きな workspace ファイルは、復元段階でコンテンツを読み取らない。登録時にリアルタイムのファイルストリームを読み取って sha256 を計算し、後続の refresh は size/mtimeMs が変更の可能性を示した場合のみファイルストリームを再読み取りし、daemon-managed storage には複製しない。

推奨デフォルト：

- artifact snapshot の上限 200 件。
- workspace status restore の batch size 20 で、V1 と一致させる。
- artifact journal snapshot の閾値は 100 mutations または 256 KB。
- workspace の sha256 は登録時に同期完了する。復元後の状態検証は TTL/batch の lazy refresh で行い、size + mtimeMs で未変更ファイルへの繰り返しフル hash を避ける。

### 8.6 Observability

V2 が追加する失敗パスには必ず structured logs がなければならず、フォーマットは踏襲する：

```text
[artifacts] session=<id> action=<action> key=value
```

推奨 action：

- `persist_failed`
- `retention_downgraded`
- `restore_skipped`
- `restore_blocked`
- `remove_not_persisted`
- `eviction`
- `fork_artifact_discarded`
- `fork_incomplete`
- `snapshot_invalid`
- `sticky_override_suppressed`
- `tombstone_conflict`
- `v2_writer_version_gate_failed`

Future の checker / content archive は fsck、content copy、TTL、GC 関連の action を追加できる。PR #6259 はこれらのログを生成しない。

これらのログは API/SSE 内の `persistenceWarning` を置き換えるものではなく、本番の排障のために使う。

推奨 metrics：

- counter: `artifact_journal_append_total{result,reason}`
- counter: `artifact_restore_total{result,restore_state}`
- gauge: `artifact_pending_tombstone_count`
- gauge: `artifact_metadata_quota_used{session}`
- counter: `artifact_sticky_override_suppressed_total`

エクスポート方法は daemon 既存の telemetry/metrics 機構を踏襲する。現在 Prometheus endpoint がなければ、少なくとも structured telemetry sink に入り、session/project ごとの集約ができなければならない。

診断ツールは後続の強化であり、PR #6259 の wire contract に属さない。metadata-only checker は artifact journal/snapshot/tombstone と restore validation failure をスキャンできる。full content checker は future の content archive の再設計後に、content manifest と daemon-managed storage をスキャンする。将来の CLI または daemon-internal API（例：`qwen artifact fsck`）は dry-run をサポートすべきである：

- metadata-only モードは snapshot/tombstone の不一致と restore validation failure を報告する。
- full content モードは dangling な `contentRef`、manifest の欠落、orphan content を報告する。
- デフォルトは読み取り専用。修復モードは検証可能な安全なアクションのみを実行できる。snapshot の再生成や orphan content の GC 待ちマークなど。

## 9. 実装方案

以下は同じ V2 design phase 内の実装マイルストーンである。エンジニアリング上は PR に分割できる。対外的には capability によって実際に利用可能な能力を宣言する。

### Milestone A: 型と persistence service

- artifact persistence reader/writer の追加：
  - writer は chat recording owner 側に置くか、その側が明確な RPC を公開する。active leaf chain への event/snapshot record の append を担当する。
  - reader は `SessionService.loadSession()` の parse/replay パスに置き、active leaf chain からの artifact snapshot の再構築を担当する。
  - restore validation、snapshot/tombstone の consistency checks、persisted shape の normalization を共有する。
- `ChatRecord.subtype` と `systemPayload` union の拡張。
- load result 内の `artifactSnapshot?` の追加。
- metadata-only checker は後続の強化であり、dry-run で破損した artifact records、snapshot/tombstone の不一致、restore validation failure を検出できる。

### Milestone B: daemon-side store の統合

- daemon bridge の `createSessionEntry` が artifacts の seed をサポート。
- `SessionArtifactStore` が artifacts の seed をサポート。
- `upsertMany()` は operation queue 内で effective な `retention`、quota prune、live view を計算し、その後 writer が durable records を append する。
- `remove()` は明示的な DELETE と eviction を区別する。明示的な DELETE は live-first でベストエフォートに tombstone を書き込み、durable eviction は journal に書き込む。古い `unpin_to_ephemeral` は journal replay / snapshot の sticky state 内でのみ互換性を保持する。
- V1 live session の V2 初回有効化時の backfill snapshot は現在の PR の実装範囲外である。現在の実装は新しく書き込まれた V2 journal/snapshot から復元する。
- V1 の `artifact_changed` event shape を変更せず、optional fields のみ追加する。

### Milestone C: load/replay の統合

- `SessionService.loadSession()` は active leaf chain から artifact snapshot/event records を抽出し、abandoned branches を無視する。
- load result は snapshot を daemon bridge に渡し、ACP child process 内で store を seed しない。
- restore の上限超過 prune の書き込みは、daemon-side store が作成され writer が利用可能になった後のみ実行する。load の parse 過程は read-only を維持する。
- rewind/leaf switch 後、daemon-side の live store は active-chain の replay result に再整列するか、artifact snapshot の top-up で surviving chain の現在状態を確定する。
- rewind/leaf-switch は必ず `onActiveLeafChanged(sessionId, artifactSnapshot)` のような明示的な hook を呼び出し、daemon-side store が operation queue 内で reseed/top-up を完了できるようにする。
- 履歴の replay 時、同じ identity の artifact は重複作成しない。
- `/branch` は active chain から artifact records を複製し、session id/artifact id を remap する。現在の full-file exclusive-create 書き込みパスには fork marker が不要である。

### Milestone D: REST/SDK

- SDK の型に optional fields を追加。
- `POST /session/:id/artifacts` が `retention: "ephemeral" | "restorable"` をサポート。
- `POST /session/:id/artifacts` が `clientRetained` の boolean hint をサポートし、client が daemon-only の runtime fields を渡すのを拒否する。
- capability で UI をゲートする。

### Milestone E: Future content archive

PR #6259 に属さない。将来的に監査/保管のニーズがある場合、daemon-managed の workspace content manifest、quota、race-safe copy、hash 検証、write-queue/lease-protected GC/fsck、published artifact content binding を個別に設計する必要がある。

## 10. テスト計画

PR #6259 が現在必ずカバーすべきもの：

- metadata journal append 後の daemon restart/load での artifact list の復元。
- artifact journal の append は chat recording owner を通じて active leaf chain に書き込まれる。daemon-side store は直接 JSONL を書き込めない。
- `/rewind` 後、abandoned branch 上の artifact upsert/remove は復元に参加せず、fork でも複製されない。
- `/rewind` 後、live store は直ちに active-chain の artifact state と整列する。daemon の再起動まで artifact list の変更を待たない。
- V1 live session の V2 へのアップグレード時の backfill snapshot は後続の強化である。現在の PR のテストでは、V2 journal に書き込まれていない古い live artifacts が復元可能と誤報されないことを確認すべきである。
- DELETE tombstone 後の load で artifact が復活しない。
- legacy の `unpin_to_ephemeral` tombstone の replay 後の load で artifact が復活しない。
- legacy の `unpin_to_ephemeral` 後、同じ artifact id の暗黙/default re-upsert は依然として live-only を維持する。明示的な `restorable` は sticky override を supersede できる。
- snapshot baseline advance 後も `stickyEphemeralIds` が暗黙/default re-upsert を live-only に保ち、`sticky_override_suppressed` の log/metric/warning を生成する。
- `stickyEphemeralIds` が上限に達した場合、legacy の unpin-to-ephemeral はエラーを返すか後でリトライし、古い sticky override を暗黙的に失わない。
- 明示的な DELETE の live-first：live view は即時削除。tombstone の書き込み失敗時、response に warning が付く。テストは live removal が persistence の失敗でブロックされないことをカバーする。
- durable artifact の eviction は `eviction` の remove event を書き込む。restore 後に live cap を超えない。
- snapshot baseline advance：定期 snapshot が現在の artifact list を圧縮し、explicit tombstone は snapshot 成功後に無制限に増えず、`stickyEphemeralIds` は sticky state を保持する。
- workspace artifact の ingest と restore 時の、ファイル存在/欠落/symlink escape の 3 状態。
- workspace root の再配置：同じ相対パスが存在する場合は available に復元。欠落または layout が一致しない場合は missing に復元。path remap は行わない。
- external URL は metadata のみ復元し、ネットワークリクエストを発行しない。
- secret を含む URL query/fragment と metadata key/value は JSONL に書き込まない。
- published のローカル `file:` は trusted manifest の再検証が通過した場合のみ復元する。
- `managedId` は ingest、restore、fork remap 時に区切り文字、`..`、絶対パス、パス形態を拒否する。fork はソース session の `managedId` を盲目的にコピーできない。
- 破損した JSONL record はスキップされ、他の artifacts に影響しない。
- chat recording / persistence が無効な場合、metadata restore を宣言しないか有効化しない。
- tool artifact の永続化失敗時は live-only にダウングレードし、`persistenceWarning` で client から見えるようにする。
- branch/fork 時の artifact records の sessionId/id の処理、かつ active-chain の replay result のみを使用する。
- fork の full-file write：active-chain の remap 後、exclusive-create でターゲット JSONL に書き込み、失敗時は成功した fork にならない。将来 streaming fork に変更した場合、begin/complete marker のテストを追加する。
- fork / restore が古い `pinned` artifact を読む場合、restorable にダウングレードし、contentRef を継承しない。
- orphan tombstone は fork remap 時に保持され、安全に remap される。安全に remap できない tombstone のみ破棄する。
- fork remap は validation、privacy minimization、redaction を再実行する。unsafe locator は strip、ダウングレード、または破棄される。
- restore の seed は concurrent POST と直列化され、書き込みの喪失も重複もない。
- quota の境界：200 件、201 件の prune、clientRetained/non-clientRetained の 2 段階ソート、すべて clientRetained の restorable でも決定論的ルールで裁剪できる。
- clientRetained の setter：Add artifact リクエストが boolean hint を設定できる。バックグラウンドの自動 ingest はユーザーの保持を偽装できない。
- workspace の 3 状態：登録時に size + `metadata["qwen.workspace.sha256"]` + `metadata["qwen.workspace.mtimeMs"]` を書き込む。GET/list refresh が `available`、`missing`、`changed` を区別でき、未変更ファイルは stat の快路径のみを通る。
- authorization：token-holder/principal の監査パスの許可と拒否の場合。V1 の live same-principal guard は live の UX/監査 hint としてのみであり、durable なセキュリティ境界ではない。
- JSONL snapshot baseline advance：threshold のトリガー、post-snapshot replay の有界性、snapshot payload がカバーされた explicit tombstones を運ばないこと、supersede された sticky tombstone が明示的な同 id の再出現を許可すること、`stickyEphemeralIds` が sticky state を保持すること。JSONL ファイル自体は artifact サブシステムに書き換えられない。
- 破損した最新 snapshot の fallback：古い valid snapshot または 1 回の順次 artifact replay へのフォールバック。
- retention のデフォルト：tool artifact に明示的な retention がない場合、client POST の `pinned` は拒否される。
- capability：string list は挙動が現在利用可能な場合のみ宣言する。`enabled:false` の details に依存しない。
- replay の冪等性：同じ session history を 2 回 replay しても artifact は重複しない。
- SDK の古い client が optional fields を無視しても V1 の artifacts を表示できる。
- V2 -> V1 のロールバック互換性：古い daemon は unknown な `system` subtype を解析または無視できなければならず、session load をクラッシュさせてはならない。ロールバック後に artifact persistence が復元されないのは許容されるダウングレードである。現在の最低サポートバージョンがこれを保証できない場合、V2 writer は unknown な system record をサポートするバージョン以降まで capability-gate しなければならない。
- ロールバックの preflight：最低サポートの古い daemon バージョンで、V2 の event/snapshot を含む JSONL を load する。将来 fork marker を追加した場合、ロールバック fixture を拡張する。
- PR #6259 は metadata API response contract をカバーする：delete 成功の body、metadata quota の検証失敗、`remove_not_persisted` / `persistence_unavailable` の warning、現在の 400/403/200+warning の mapping。

Future の content archive / checker は別途カバーする：

- `deleteContent: true` は tombstone/content GC にリスクがある場合、`content_delete_preserved` の warning を公開する。
- pin/save content 時に symlink、special file、oversized stream、hardlink 異常、TOCTOU swap を拒否する。
- metadata-only checker の dry-run：破損 record、snapshot fallback、orphan tombstone、restore validation failure。
- full content checker の dry-run：dangling な `contentRef`、manifest の欠落、orphan content、GC 修復戦略。

## 11. V2 でやるべきでないこと

- 通常の markdown link の自動取得。
- workspace ファイル変更の自動スキャン。
- すべての workspace artifact コンテンツのデフォルト複製。
- external URL への reachability polling。
- `clientId` の削除認可凭证としての使用。
- 再配置された workspace への自動 path remapping。
- GET のホットパスでの大量の fs/network 検証。
- 永続化の失敗を通常の tool turn の失敗に変えること。
- 測定で必要性が証明されていない段階での sidecar cache の導入。

## 12. 推奨リリース方針

V2 は完全な design phase としてのリリースを推奨するが、能力は capability で公開する：

- `session_artifacts_persistence` はまず metadata restore をリリースできる。
- `session_artifacts_content_retention` は現在リリースしない。future の content archive は再設計と独立した capability の宣言が必要である。
- 明示的に登録された artifact metadata はデフォルトで復元する。
- ユーザーが手動登録した artifact はデフォルト `restorable` で、session load/replay 後もリストに表示され続ける。
- ユーザードキュメントで明確にする：metadata restore が復元するのは「成果物インデックス」であり「成果物コンテンツのバックアップ」ではない。workspace の `changed` 状態は、リアルタイムファイルが登録時と size が一致しないか、mtime 変化後に hash が一致しないことのみを示す。

ロールバック手順：

- V2 records は chat JSONL に保持され、ロールバック時に削除しない。古い daemon が unknown な `system` subtype を無視できる場合、session load は引き続き動作すべきだが、artifact persistence は復元しない。
- daemon-managed の content storage は PR #6259 に属さない。後続の content-retention PR は、ロールバック後の retained bytes のクリーンアップフローを別途定義する必要がある。
- 現在の最低サポートの旧バージョンが V2 の system records を安全に無視できない場合、writer は必ず安全なバージョン以降まで capability-gate するか、アップグレード前に migration guard を提供し、V2 records の書き込みをブロックしなければならない。
- リリース前の CI は、最低サポートの旧 daemon バージョンで `session_artifact_event` と `session_artifact_snapshot` を含む JSONL を load し、session load が成功し unknown subtype が無視されることをアサートしなければならない。V2 writer の初回初期化前にもバージョン/feature gate をチェックする。失敗時は V2 records の書き込みを拒否し、`v2_writer_version_gate_failed` を記録し、V1 の挙動を維持する。将来 fork marker を追加した場合、その subtype をロールバック fixture に組み込む。
- ロールバック後、client は `session_artifacts_persistence` / `session_artifacts_content_retention` に依存できない。古い daemon はこれらの capability を宣言しないためである。

これで現在の V2 の完全なセマンティクスを明確に語ることができる：デフォルトでリストを復元し、コンテンツは保存せず、workspace の size/mtime/hash で誤ったバージョンを暗黙的に開くのを避け、同時に未変更ファイルへの繰り返しフル hash も避ける。
