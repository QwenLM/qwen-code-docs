# Qwen-Code Daemon Session Artifacts API 実装可能な設計

> 入力資料：session artifacts daemon API 初版ドラフトおよび artifact design v1 ドラフト。
>
> ソースコードベースライン：現在の qwen-code コード。  
> 目標：既存の Daemon / ACP / SSE / SDK / hooks / extension 機能に基づき、実装可能、検証可能、かつ境界が明確な session artifacts API を設計する。

## 1. 設計結論

artifact を以下のように定義することを推奨する：

> **Session 内で明示的に登録された、ユーザーが再利用/クリック/プレビュー/ダウンロード/共有できる構造化された成果物への参照。通常のソースコード変更は artifact ではない。ソースコード変更は file change / diff / patch history に属する。**

この定義はファイルだけでなく、非ファイルの URL もカバーする。重要なのは物理的なファイルかどうかではなく、システムによって明示的に「成果物」と宣言されているかどうかである。Artifacts パネルは、agent が操作したすべてのものではなく、session outputs を表示すべきである。

V1 の完全な機能には以下を含めることを推奨する：

- capability: `session_artifacts`
- artifact snapshot API: `GET /session/:id/artifacts`
- artifact changed event: `artifact_changed`
- tool result metadata: `ToolResult.artifacts?: ToolArtifact[]`
- `ArtifactTool` 構造化 artifact メタデータ
- bridge メモリインデックス: `SessionArtifactStore`
- SDK メソッド: `DaemonClient.listSessionArtifacts()`、`DaemonSessionClient.artifacts()`
- モデル/skill/agent が呼び出せる軽量ツール: `record_artifact`
- hook 出力 artifacts: `hookSpecificOutput.artifacts`
- client 手動注入 API: `POST /session/:id/artifacts`
- client 明示的削除 API: `DELETE /session/:id/artifacts/:artifactId`
- SDK メソッド: `DaemonSessionClient.addArtifact()`
- SDK メソッド: `DaemonSessionClient.removeArtifact()`
- managed / published storage 参照モデル

V1 を制御可能に保つため、V1 では以下を実装しないことを推奨する：

- workspace スキャン
- 通常の `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` の自動 artifacts 登録
- 通常のテキスト URL の自動抽出
- shell stdout のパス/URL の自動抽出
- artifact コンテンツの返却
- artifact の履歴バージョン
- artifact の永続化と復元
- データベース/OSS/動的 iframe サンドボックス

## 2. Link は Artifact として扱うか

### 2.1 結論

**扱う。ただし、「宣言的 link artifact」でなければならない。**

例えば、以下は artifact として扱うべきである：

- skill がリソース ID から生成する内部データプラットフォームのテーブル詳細 URL。
- agent がリソース ID から生成するタスク詳細ページ、モニタリングページ、トレースページ、リネージページ。
- MCP ツールが返却する dashboard / notebook / report URL。
- ArtifactTool によって公開された後の HTML URL。
- ユーザーまたは client が session 成果物エリアに明示的に追加した URL。

以下はデフォルトでは artifact として扱うべきではない：

- assistant の通常の回答に含まれる任意の markdown link。
- web_fetch で読み取った Web ページ URL。
- grep/shell の出力に偶然含まれる URL。
- 引用資料、ドキュメントリンク、参考リンク。

核心的な基準：

| 種類 | artifacts に入るか | 理由 |
| --- | ---: | --- |
| 通常のソースコード編集 | いいえ | file change / diff に属し、再利用可能な成果物ではない |
| 明示的に登録された生成系 workspace ファイル | はい | report / HTML / PDF / image などの再利用可能な出力 |
| ArtifactTool が公開した HTML URL | はい | ツールによって明示的に公開された |
| skill がルールに従って生成したビジネス詳細 URL | はい、ただし明示的な登録が必要 | ユーザーが右側で長期的にクリックできる必要がある |
| assistant の回答に含まれる通常の参考リンク | いいえ | ノイズが大きく、誤検出されやすい |
| shell stdout に含まれる URL | いいえ | 意味的に信頼できない |
| web_fetch がリクエストした URL | いいえ | これは入力/ソースであり、成果物ではない |

### 2.2 Link Artifact のプロダクトセマンティクス

Link artifact は「Web ページコンテンツ」ではなく「リソースへのエントリーポイント」である。右側の成果物エリアでは、クリック可能な項目として表示されるべきである：

- タイトル: `ユーザープロファイルリソース詳細`
- サブタイトル: `internal data platform / prod`
- タイプ: `link`
- URL ホスト: `platform.example.com`
- ソース: `ToolResult.artifacts` / `ArtifactTool` / `record_artifact` / hook / client

Client がクリックすると URL が開く。Daemon はその URL の読み取り、検証、事前レンダリングは行わない。

## 3. 現在のコードベースライン

### 3.1 Daemon REST と capability

関連ソースコード：

- `packages/cli/src/serve/server.ts`
- `packages/cli/src/serve/capabilities.ts`
- `docs/developers/qwen-serve-protocol.md`

現状：

- `/capabilities` は `features` を返却し、Client は feature gate に基づいて UI を制御する必要がある。
- session レベルの読み取り専用ステータスインターフェースは REST スタイルを採用している：
  - `GET /session/:id/status`
  - `GET /session/:id/context`
  - `GET /session/:id/tasks`
  - `GET /session/:id/events`
- capability は `SERVE_CAPABILITY_REGISTRY` に登録される。

設計：

- 新規 feature 追加: `session_artifacts`
- 新規 route 追加: `GET /session/:id/artifacts`
- 新規手動注入 mutation route 追加: `POST /session/:id/artifacts`

### 3.2 Session EventBus

関連ソースコード：

- `packages/acp-bridge/src/eventBus.ts`
- `packages/acp-bridge/src/bridge.ts`
- `packages/acp-bridge/src/bridgeClient.ts`
- `packages/sdk-typescript/src/daemon/events.ts`

現状：

- 各 live session は独立した `EventBus` を持つ。
- EventBus は id、bounded replay ring、`Last-Event-ID`、backpressure をサポートする。
- SDK は known event list を管理する。

設計：

- artifact のリアルタイム更新は既存の `/session/:id/events` を再利用する。
- 新規 event type 追加: `artifact_changed`
- Client の初回進入時は snapshot を使用し、その後は event の増分を使用する。切断後は snapshot を再取得する。

### 3.3 Tool Result と ArtifactTool

関連ソースコード：

- `packages/core/src/tools/tools.ts`
- `packages/core/src/tools/tool-names.ts`
- `packages/core/src/tools/artifact/artifact-tool.ts`
- `packages/cli/src/acp-integration/session/Session.ts`
- `packages/cli/src/acp-integration/session/emitters/tool-call-emitter.ts`

現状：

- `ToolResult` には現在 `llmContent`、`returnDisplay`、`resultFilePaths?`、`error?` が含まれている。
- `ArtifactTool` はすでに HTML を公開して URL を返却できるが、構造化された artifact メタデータはない。
- `ToolCallEmitter.emitResult()` の `_meta` にはすでに拡張領域がある。

設計：

- `ToolResult.artifacts?: ToolArtifact[]` を追加する。
- `ArtifactTool` 成功時に `artifacts` を設定する。
- `ToolCallEmitter.emitResult()` で artifacts を `_meta.artifacts` に格納する。
- BridgeClient が `_meta.artifacts` を消費し、session artifact store に書き込む。

### 3.4 Hooks / Extensions / Plugins の現状

関連ソースコード：

- `packages/core/src/hooks/types.ts`
- `packages/core/src/core/toolHookTriggers.ts`
- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/sessionHooksManager.ts`
- `packages/core/src/hooks/registerSkillHooks.ts`
- `packages/core/src/extension/extensionManager.ts`
- `docs/developers/channel-plugins.md`

現在の既存機能：

- hook イベントには `PreToolUse`、`PostToolUse`、`PostToolBatch`、`SessionStart`、`Stop`、`SubagentStart`、`SubagentStop` などがある。
- hook のタイプには command、HTTP、function、prompt がある。
- command hook の stdout は JSON 形式の `HookOutput` をサポートする。
- HTTP hook の response は JSON 形式の `HookOutput` をサポートする。
- session hooks は `SessionHooksManager` を介して実行時に登録できる。
- skill frontmatter で session-scoped な command/HTTP hooks を登録できる。
- extension は commands、skills、hooks、MCP servers、channels を提供できる。
- channel plugin は主にメッセージプラットフォームの適応であり、tool call / response chunk を観察できるが、daemon artifact 注入チャネルではない。

現在の不足点：

- hook output には `additionalContext`、decision、stopReason などの一般的なフィールドしかない。
- 現在、標準の `hookSpecificOutput.artifacts` は存在しない。
- 現在の daemon には `GET /workspace/hooks` と `GET /session/:id/hooks` のステータスインターフェースしかなく、「hook が積極的に artifact を注入する」route は存在しない。

結論：

- hooks/extensions は優れたカスタム artifact 入口だが、hook output スキーマの拡張が必要である。
- channel plugin を artifact 注入のメインチャネルとして使用することは推奨しない。外部チャットプラットフォームでの表示には適しているが、daemon session artifact インデックスの管理には適していない。

## 4. API 設計

### 4.1 Capability

追加：

```json
"session_artifacts"
```

Client はこの feature を検出した場合にのみ、artifacts パネルを表示し、関連 API を呼び出す。

### 4.2 List Artifacts

```http
GET /session/:id/artifacts
```

レスポンス：

```json
{
  "v": 1,
  "sessionId": "session-123",
  "artifacts": [
    {
      "id": "a1b2c3d4e5f6",
      "kind": "link",
      "storage": "external_url",
      "title": "ユーザープロファイルリソース詳細",
      "description": "内部データプラットフォームリソース詳細ページ",
      "url": "https://platform.example.com/resources/user-profile",
      "mimeType": "text/html",
      "status": "available",
      "source": "tool",
      "toolCallId": "call_abc",
      "toolName": "artifact",
      "createdAt": "2026-06-26T10:00:00.000Z",
      "updatedAt": "2026-06-26T10:00:00.000Z",
      "metadata": {
        "resourceType": "data_platform_resource",
        "env": "prod"
      }
    }
  ]
}
```

### 4.3 Artifact Changed Event

既存の以下を経由：

```http
GET /session/:id/events
```

新規 event：

```json
{
  "v": 1,
  "type": "artifact_changed",
  "data": {
    "sessionId": "session-123",
    "change": {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "ユーザープロファイルリソース詳細",
        "description": "内部データプラットフォームリソース詳細ページ",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "status": "available",
        "source": "tool",
        "toolCallId": "call_abc",
        "toolName": "artifact",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "data_platform_resource",
          "env": "prod"
        }
      }
    }
  }
}
```

`change.action`：

- `created`
- `updated`
- `removed`

V1 では主に `created` / `updated` が生成される。eviction または明示的な削除シナリオでは `removed` が生成される。

`artifact_changed.data.change.artifact` は `created` / `updated` / `removed` 時に完全な `DaemonSessionArtifact` を保持し、その shape は `GET /session/:id/artifacts` の各項目と一致する。`removed` event は削除前の最後の完全な artifact を保持する。`removed` には `reason` を含める必要があり、V1 では `eviction` または `explicit` を取る。これにより、リアルタイム UI は event を直接適用でき、各 event の後に GET する必要がない。Client が切断された場合、event を取りこぼした場合、または未知の event type を受信した場合は、`GET /session/:id/artifacts` を使用して snapshot sync を行う。

### 4.4 Client 手動挿入

V1 の client による明示的な登録入口として：

```http
POST /session/:id/artifacts
```

用途：

- WebUI/IDE/外部 client によるカスタム link artifact の手動追加。
- 拡張または統合レイヤーが、モデルツールの呼び出しを経ずに右側の成果物パネルにリソースを挿入する。

リクエスト：

```json
{
  "kind": "link",
  "storage": "external_url",
  "title": "タスク詳細",
  "description": "スケジューラタスク task_123 の詳細ページ",
  "url": "https://ops.example.com/tasks/task_123",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "scheduler_task"
  }
}
```

レスポンス：

```json
{
  "v": 1,
  "sessionId": "session-123",
  "changes": [
    {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "タスク詳細",
        "description": "スケジューラタスク task_123 の詳細ページ",
        "url": "https://ops.example.com/tasks/task_123",
        "mimeType": "text/html",
        "status": "available",
        "source": "client",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    }
  ]
}
```

`changes` の各項目は、必ず 1 つの `artifact_changed` SSE event として同期発行されなければならない。これにより、1 回の POST で upsert と eviction がトリガーされた場合でも、client は created/updated および removed の完全な増分を受信できる。同じ mutation 内で複数の入力が同じ identity に正規化される場合、`changes` には最終的な change を 1 つだけ生成できる。event の発行順序はプロトコルの制約である：まず `changes[]` の順序に従って `created` / `updated` を発行し、次に `removed` を発行する。これにより、client のローカルミラーが一時的にサーバー側に存在しない状態になるのを防ぐ。

エラーレスポンス：

```json
{
  "v": 1,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "url must use http or https",
    "field": "url"
  }
}
```

ステータスコード：

- `400 VALIDATION_FAILED`：フィールドバリデーション失敗。例：複数の primary locator、サポートされていない URL scheme、metadata の上限超過。
- `401 UNAUTHORIZED` / `403 FORBIDDEN`：mutation gate または bearer token のバリデーション失敗。
- `404 SESSION_NOT_FOUND`：session が存在しない。

### 4.5 Client 削除

V1 の明示的な削除入口として：

```http
DELETE /session/:id/artifacts/:artifactId
```

セマンティクス：

- 現在の live session artifact store から該当 artifact を削除するのみ。
- workspace ファイル、managed ファイル、またはリモート URL は削除しない。
- 成功時は `DaemonSessionArtifactMutationResult` を返却し、`action: 'removed'`、`reason: 'explicit'` の change を 1 つ含む。
- artifact がすでに存在しない場合でも、DELETE は冪等な成功として処理され、`200` と空の `changes: []` を返却し、SSE event は発行されない。
- 対応する `artifact_changed` SSE event を同期発行する。

エラーレスポンスは Section 4.4 の envelope を再利用する。session が存在しない場合は `404 SESSION_NOT_FOUND` を返却する。

セキュリティ：

- これは mutation route であるため、既存の mutation gate を使用する必要がある。
- bearer token を持つ daemon のみが、リモート client からの呼び出しを許可する。
- URL を読み取らない。
- URL を自動的に開かない。

### 4.6 V1 リリース方針と互換性

V1 マージ後は、未完成のインターフェースのみをリリースするのではなく、完全な session artifact 管理機能として試用リリースすべきである。完全な機能の最小闭环は以下の通りである：

- Client は `session_artifacts` capability を介して機能を検出する。
- Daemon は `GET /session/:id/artifacts` snapshot を提供する。
- Daemon は既存の events stream を介して `artifact_changed` の増分を発行する。
- `ArtifactTool` / `ToolResult.artifacts`、`record_artifact`、hook artifacts、client POST の 4 種類の入口がすべて同じ store に入る。
- client DELETE により、live store から誤って登録された artifact を明示的に削除できる。
- store は validation、normalization、identity の重複排除、soft reservation eviction を統一的に実行する。
- SDK は list/add/remove が可能で、`artifact_changed` event を識別できる。

まずは experimental/capability-gated 形式で試用リリースすることを推奨する。ここでの experimental は、実装と UI を引き続き改善できることを意味し、プロトコルを自由に破壊できることを意味しない：client に公開されたフィールドと event のセマンティクスは、以下の互換性ルールに従って進化させる必要がある。

非 breaking な今後の拡張：

- レスポンスの artifact に optional field を追加する。
- 新しい `kind` / `status` / `source` / `storage` リテラルを追加する。ただし、型付き SDK はこれらのフィールドを open union として宣言する必要があり、client は未知の値を許容しなければならない：未知の `kind` は `other` として扱い、未知の `status` は unknown 状態として表示されリスト表示をブロックしない、未知の `source` は未分類ソースとして扱い、未知の `storage` は利用可能な `url` / `workspacePath` に基づいて保守的に表示する。
- 新しい route を追加する。例：`GET /session/:id/artifacts/:artifactId`、preview route、pin route。
- 新しい event type を追加するが、既存の `artifact_changed` のセマンティクスは変更しない。
- 新しい capability を追加する。例：`session_artifacts_preview`、`session_artifacts_persistence`。
- soft reservation の内部デフォルト値を調整する。ただし、総上限と eviction event のセマンティクスが既存の client を破壊しない限りにおいて。

新しい capability または新バージョンを必要とする breaking 変更：

- identity ルールの変更により、同じ URL/path の artifact id が変更される。
- 既存の optional field を required field に変更する。
- 既存のフィールドを削除または改名する。
- `artifact_changed.data.change.action` の `created` / `updated` / `removed` のセマンティクスを変更する。
- `GET /session/:id/artifacts` の envelope shape を変更する。
- 通常の assistant テキストリンクや通常のファイル編集がデフォルトで artifact list に入るようにする。
## 5. データモデル

### 5.1 Public SDK 型

```ts
type OpenStringUnion<T extends string> = T | (string & {});

export type DaemonSessionArtifactKind = OpenStringUnion<
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other'
>;

export type DaemonSessionArtifactStatus = OpenStringUnion<
  'available' | 'missing'
>;

export type DaemonSessionArtifactSource = OpenStringUnion<
  'tool' | 'hook' | 'client'
>;

export type DaemonSessionArtifactStorage = OpenStringUnion<
  'workspace' | 'managed' | 'external_url' | 'published'
>;

export interface DaemonSessionArtifact {
  id: string;
  kind: DaemonSessionArtifactKind;
  storage: DaemonSessionArtifactStorage;
  title: string;
  description?: string;
  status: DaemonSessionArtifactStatus;
  source: DaemonSessionArtifactSource;
  createdAt: string;
  updatedAt: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DaemonSessionArtifactsEnvelope {
  v: 1;
  sessionId: string;
  artifacts: DaemonSessionArtifact[];
}

export interface DaemonArtifactChangedData {
  sessionId: string;
  change: DaemonSessionArtifactChange;
}

export interface DaemonSessionArtifactChange {
  action: 'created' | 'updated' | 'removed';
  artifactId: string;
  artifact?: DaemonSessionArtifact;
  reason?: 'eviction' | 'explicit';
}

export interface DaemonSessionArtifactMutationResult {
  v: 1;
  sessionId: string;
  changes: DaemonSessionArtifactChange[];
}
```

### 5.2 Core ToolArtifact 型

```ts
export type ToolArtifactKind =
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other';

export type ToolArtifactStorage =
  | 'workspace'
  | 'managed'
  | 'external_url'
  | 'published';

export interface ToolArtifact {
  kind?: ToolArtifactKind;
  storage?: ToolArtifactStorage;
  title: string;
  description?: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

`ToolArtifactKind` / `ToolArtifactStorage` の既知のリテラル集合は、実装元を一つに限定し、core、acp-bridge、SDK の3箇所での手動による乖離（ドリフト）を防ぐ必要があります。推奨されるアプローチは以下の通りです。

- core で `TOOL_ARTIFACT_KINDS` / `TOOL_ARTIFACT_STORAGES` const タプルを定義し、`ToolArtifactKind` / `ToolArtifactStorage` をエクスポートする。
- acp-bridge は core の型を入力検証用の既知集合として再利用し、daemon public 型を同じ値のグループのプロトコル投影（protocol projection）として宣言する。
- SDK で既知の union を二重に手書きしない。acp-bridge がエクスポートするプロトコル型、またはビルド時に生成される `.d.ts` を通じて既知のリテラルを re-export し、response-facing 型に対して open union を1レイヤー被せることで、将来 daemon が返す新しい値を許容できるようにする。
- テストに kind/storage のラウンドトリップを追加し、既知のリテラルが core 入力、bridge store、SDK 出力の間で一貫して往復することを保証する。さらに、SDK の unknown value フォールバックテストを追加し、open union の実行時フォールトトレランスを保証する。

さらに、以下のように拡張します。

```ts
export interface ToolResult {
  llmContent: unknown;
  returnDisplay: unknown;
  resultFilePaths?: string[];
  artifacts?: ToolArtifact[];
  error?: unknown;
}
```

### 5.3 Input から Public Artifact への補完ルール

`ToolArtifact` はツールが返す入力形式であり、`SessionArtifactInput` はすべてのエントリーポイントが store に入る前の統一された内部入力形式、`DaemonSessionArtifact` は外部に返される形式です。すべてのエントリーポイントは、まず `SessionArtifactInput` に変換され、その後 `SessionArtifactStore` によって共通フィールドが補完されます。

```ts
export interface SessionArtifactInput extends ToolArtifact {
  source: 'tool' | 'hook' | 'client';
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  trustedPublisher?: true;
  receivedSeq?: number;
}
```

`trustedPublisher` は bridge/store 内部の入力フラグであり、public schema や client/hook が設定可能なフィールドではありません。V1 の daemon/ACP デプロイメントでは、`qwen --acp` サブプロセスは daemon によって起動され、同じユーザーで実行されます。したがって、現在の実装では、完了した `ArtifactTool` セッションアップデート（`tool_call_update`、`status: 'completed'`、`_meta.toolName: 'artifact'`）を唯一の trusted publisher シグナルとして扱います。このシグナルは artifact ペイロード自体からは読み取られず、client POST、hook notification、`record_artifact`、またはその他の tool result に対しては公開されません。

将来、リモートサンドボックス、複数の ACP パーティシパント、または異なる信頼域のエージェントをサポートする場合は、改ざん不可能な transport / in-process publisher identity を新たに追加し、その V1 信頼シグナルを置き換える必要があります。それまでは、ペイロード内の `trustedPublisher` / `source` / `storage` を認可の根拠として扱わないでください。

ソース変換ルール:

- `ArtifactTool` / daemon publisher: BridgeClient は、完了した `ArtifactTool` セッションアップデートに対してのみ `source: 'tool'`、`toolCallId`、`toolName` を補完し、内部オプションで `trustedPublisher: true` を設定する。
- その他の `ToolResult.artifacts`: `ToolArtifact` のフィールドをコピーし、`source: 'tool'`、`toolCallId`、`toolName` を補完するが、`trustedPublisher` は設定しない。
- `record_artifact`: tool source として入力され、同様に `source: 'tool'`、`toolCallId`、`toolName: 'record_artifact'` を補完するが、`storage: 'published'` は許可されず、`trustedPublisher` も設定できない。
- hook: hook output artifacts をコピーし、`source: 'hook'`、`hookName`、`extensionId` を補完する。hook がトリガーとなった tool コンテキストを取得できる場合は、`toolCallId` / `toolName` も補完できる。Bridge は transport コンテキストから `source: 'hook'` を派生させなければならず、ペイロード内の `source` フィールドを信頼してはならない。
- client POST: body をコピーし、`source: 'client'`、`clientId` を補完する。`storage: 'published'` は許可されず、`trustedPublisher` も設定できない。
- `receivedSeq`: bridge/store が入力を受け取った際に単調増加値を割り当て、同じバッチ内での決定的な順序付け（deterministic ordering）に使用する。外部入力ではこのフィールドを指定できない。
- BridgeClient は、artifact ペイロード内の `source`、`storage`、`managedId`、`url`、`trustedPublisher`、またはその他の `_meta.artifacts[*]` フィールドに基づいて `trustedPublisher` を推論してはならない。V1 における唯一の例外は、上記の完了した `ArtifactTool` セッションアップデートシグナルである。

補完ルール:

- `id`: セクション 7 の identity hash によって生成される。
- `source`: エントリーポイントのコンテキストによって決定され、tool result / ArtifactTool は `tool`、hook は `hook`、client POST は `client` となる。
- `toolCallId` / `toolName`: tool call コンテキストから補完される。hook/client エントリーポイントに存在しない場合は記入しない。
- `hookName` / `extensionId` / `clientId`: コンテキストが存在する場合は補完され、監査および UI でのグループ化に使用される。
- `createdAt`: 初回の upsert 時に書き込まれる。
- `updatedAt`: upsert のたびに更新される。
- `status`: workspace artifact upsert 時にベストエフォートで stat を実行し、存在し containment check に合格すれば `available`、存在しないか symlink escape の場合は `missing` となる。managed / URL artifact は V1 ではローカル stat を実行せず、常に `available` となる。
- `storage` のデフォルト値:
  - `workspacePath` がある場合は `workspace`。
  - `storage: 'published'` がある場合は `trustedPublisher` からの入力でなければならない。それ以外の場合は検証に失敗する。
  - `managedId` があり `url` がない場合は `managed`。
  - `url` がある場合は `external_url`。
  - `ArtifactTool` の公開結果は明示的に `published` を使用する。
- `kind` のデフォルト値:
  - `storage: 'published'` であり明示的な `kind` がない場合は `html`。
  - `url` があり `workspacePath` がない場合は `link`。
  - `workspacePath` がある場合は拡張子から推測する: `.html` -> `html`、画像拡張子 -> `image`、動画拡張子 -> `video`、音声拡張子 -> `audio`、`.pdf` -> `pdf`、`.ipynb` -> `notebook`、それ以外は `file`。
  - 推測できない場合は `other`。

### 5.4 フィールド制約

- `workspacePath` は workspace 内のファイルのみを外部に公開するためのものであり、workspace からの相対パスでなければならない。
- `managedId` は daemon/qwen-home が管理する成果物への参照であり、ローカルの絶対パスであってはならない。
- `url` は明示的に登録された URL または ArtifactTool が公開した URL のみを受け付ける。
- `workspacePath`、`managedId`、`url` のうち、primary locator は必ず1つだけ存在しなければならない。V1 では、同一の論理リソースに対して異なるフィールドで複数の identity が生成されるのを防ぐため、通常の入力で複数の primary locator を同時に持つことを拒否する。
- 唯一の例外は、信頼できる `storage: 'published'` である。`url` が primary locator となり、`managedId` は将来のダウンロード/プレビュー用にオプションの managed reference として一緒に返される。この場合、identity は `url` のみに基づいて計算され、`managedId` は identity に含まれない。この例外は、`trustedPublisher: true` の内部入力のみを受け付ける。
- 通常のツールは、`~/.qwen`、`/tmp`、またはその他のローカル絶対パスを `workspacePath` として返してはならない。
- `title` は必須であり、trim 後の長さは 1〜200 文字で、ASCII 制御文字は許可されない。これはプレーンテキストであり、HTML や markdown のセマンティクスは含まない。
- `description` は UI 補助用のプレーンテキストであり、モデルコンテキストには含まれない。
- `description` は trim 後最大 1000 文字で、ASCII 制御文字は許可されず、HTML や markdown のセマンティクスは含まない。
- `metadata` は小さなオブジェクトでなければならず、primitive value のみ許可される。
- `metadata` には secret、token、cookie、署名用秘密鍵を含めない。
- `sizeBytes` はベストエフォートである。
- `DaemonSessionArtifactsEnvelope` はホストマシンの絶対 `workspaceCwd` を返さない。client は `workspacePath` のような相対パスと `storage` フィールドにのみ依存して表示を行う。

## 6. Artifact 収集ソース

### 6.1 ファイル出力エントリーポイント

V1 では、通常のファイル編集ツールから artifact を自動派生しません。

自動派生しないもの:

- `ToolNames.WRITE_FILE`
- `ToolNames.EDIT`
- `ToolNames.NOTEBOOK_EDIT`
- `read_file`
- `grep_search`
- `glob`
- `list_directory`
- `web_fetch`
- `run_shell_command`

理由:

- 通常のソースコード編集、設定変更、テスト修正は file change / diff / patch history に属する。
- 毎回の source edit を自動的に artifacts パネルに入れると、大量のノイズが発生する。
- 右側の成果物エリアは、再利用可能、プレビュー可能、ダウンロード可能、または共有可能な session outputs 用に確保すべきである。

ファイルが artifact store に入るための条件:

- ツール結果が `ToolResult.artifacts` を明示的に返す。
- `ArtifactTool` が出力を公開する。
- V1 の `record_artifact` / hook / client POST が明示的に登録する。
- 将来、便利な派生が必要になった場合でも、生成的な出力ファイルのみを許可し、ツール結果または構造化された metadata で artifact としてマークすることを要求する。通常の `WRITE_FILE` / `EDIT` からデフォルトで推論しないこと。

生成的出力の例:

- report: `.html`、`.pdf`、`.md`
- media: `.png`、`.jpg`、`.mp4`、`.mp3`
- office/data: `.xlsx`、`.docx`、`.pptx`、`.csv`
- notebook: 成果物として生成された `.ipynb`

notebook であっても、「既存の notebook ソースファイルの編集」と「ユーザーが閲覧/ダウンロードするための notebook artifact の生成」を区別する必要があります。

### 6.2 ArtifactTool

`ArtifactTool` が正常に公開された後に返されるもの:

```ts
artifacts: [
  {
    kind: 'html',
    storage: 'published',
    title,
    url,
    managedId,
    mimeType: 'text/html',
  },
];
```

既存の `llmContent`、`returnDisplay`、`resultFilePaths` を保持し、互換性を確保します。

現在の `ArtifactTool` のローカル publisher は、qwen home 下の管理ディレクトリにコンテンツを書き込み、`file://` またはリモート URL を返す可能性があります。Daemon artifact API は、qwen home のローカル絶対パスを `workspacePath` として公開すべきではありません。代わりに以下を使用する必要があります。

- `storage: 'published'`
- `url`: 公開されたアクセス可能な URL であり、published artifact の primary locator でもある
- `managedId`: オプションの内部管理参照であり、identity には含まれない
- BridgeClient は、完了した `ArtifactTool` セッションアップデート上で内部オプションを通じて `trustedPublisher: true` を設定する。Bridge は、モデルパラメータ、hook ペイロード、client POST body、または通常の `_meta.artifacts[*]` フィールドからこのフラグを推論してはならない。

将来 daemon client に管理コンテンツのダウンロードやプレビューを許可する場合は、ローカルの絶対パスを public artifact に押し込むのではなく、専用の managed artifact ルートを新たに追加する必要があります。

### 6.3 record_artifact ツール

V1 のモデル/skill 用の明示的な登録エントリーポイントとして、軽量な組み込みツールを新規追加します。

```ts
ToolNames.RECORD_ARTIFACT = 'record_artifact';
```

用途:

- モデルが非ファイルタイプの成果物を明示的に登録する。
- skill / agent.md は、ビジネス URL を組み立てた後にこのツールを呼び出すようモデルに要求できる。
- 1回の呼び出しで登録する artifact は1つだけ。バッチ登録はモデルがツールを複数回呼び出すことで行い、1回の tool call で部分的な成功/失敗が発生した場合のフィードバックの曖昧さを避ける。
- ネットワークリクエストは行わない。
- workspace ファイルは書き込まない。
- session artifact インデックスのみを書き込む。

パラメータ:

```ts
interface RecordArtifactParams {
  title: string;
  description?: string;
  kind?: ToolArtifactKind;
  storage?: Exclude<ToolArtifactStorage, 'published'>;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

例:

```json
{
  "title": "ユーザープロファイルリソース詳細",
  "description": "内部データプラットフォーム本番環境リソース詳細ページ",
  "kind": "link",
  "storage": "external_url",
  "url": "https://platform.example.com/resources/user-profile?env=prod",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "data_platform_resource",
    "env": "prod"
  }
}
```

戻り値:

```ts
return {
  llmContent: {
    recorded: true,
    title: params.title,
    location: params.workspacePath ?? params.managedId ?? params.url,
    note: 'The daemon will expose the assigned artifact id through artifact_changed and list APIs.',
  },
  returnDisplay: 'Recorded artifact: ユーザープロファイルリソース詳細',
  artifacts: [params],
};
```

`record_artifact` は返却前にパラメータレベルの validation を行います。失敗した場合はツールエラーを返し、`ToolResult.artifacts` は生成されません。1回の呼び出しで登録される artifact は1つだけであるため、V1 ではバッチの partial success を定義する必要はありません。server-assigned `id` は daemon store によって生成され、`artifact_changed` / `GET /session/:id/artifacts` を通じて client に公開されます。

`record_artifact` は `storage: 'published'` を受け付けず、`url + managedId` の published 例外も受け付けません。モデル/skill が登録できるのは workspace、managed、または external URL artifact のみです。公開タイプの artifact は ArtifactTool / daemon publisher から提供される必要があります。

権限に関する推奨事項:

- すべての session にデフォルトで登録することは推奨されません。feature-gated とするか、skill/extension によって明示的に有効化する必要があります。
- 有効化する場合は、session UI metadata のみを変更するため、デフォルトで `allow` とすることができます。
- URL は自動的に開かれません。
- client はホストを表示し、ユーザーはクリック前にターゲットを識別できます。
- 将来 `file://` を許可する場合でも、workspace 内のファイルのみを許可する必要があります。V1 では `record_artifact` が `file://` URL を受け付けることは推奨されません。
- hook/client POST と同様に、統一された artifact validation を通過する必要があります。

### 6.4 Hook 出力 artifacts

V1 の hook/extension 用の明示的な登録エントリーポイントの拡張として機能します。現在の hooks は command/HTTP/function/prompt をサポートしており、command/HTTP hook は JSON `HookOutput` を返すことができます。`hookSpecificOutput` を以下のように拡張することを推奨します。

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "スケジュールタスク詳細",
        "url": "https://ops.example.com/task/task_123",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    ]
  }
}
```

適切なシナリオ:

- PostToolUse hook が特定の MCP/tool の出力を監視し、組織のルールに従ってビジネス URL を組み立てる。
- extension が hooks を提供し、企業内部リソースの URL を右側の成果物エリアに注入する。
- skill frontmatter で PostToolUse hook を登録し、skill が有効な期間中に自動的に artifacts を登録する。
- ツール失敗後に、PostToolUse hook が error trace、失敗した実行のダッシュボード、またはトラブルシューティングリンクを登録する。
- PostToolBatch artifacts は、具体的な実行時に実際の PostToolBatch 呼び出しポイントが存在し、その結果を daemon bridge に送信できる場合にのみ接続される。daemon ACP メインセッション V1 では、このチャネルの存在を前提としていない。

必要なコード変更:

- `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`。
- `packages/core/src/hooks/hookAggregator.ts` の `mergeWithOrLogic()` は、既存の `hookSpecificOutput` の last-writer-wins ルールに従わず、`artifacts` に対して concat ロジックを追加しなければならない。
- `packages/core/src/core/toolHookTriggers.ts` の `PostToolUseHookResult` / `PostToolBatchHookResult` に `artifacts?: ToolArtifact[]` を追加する。
- `firePostToolUseHook()` が `artifacts?: ToolArtifact[]` を返すようにする。
- `firePostToolBatchHook()` が `artifacts?: ToolArtifact[]` を返すようにする。
- `packages/core/src/core/coreToolScheduler.ts` を実装計画に含める必要がある。これは `firePostToolBatchHook()` の呼び出しポイントであり、独立した `firePostToolUseHook()` パスも存在するためである。
- 共有の `collectHookArtifacts()` または同等のヘルパーを抽出し、`coreToolScheduler.ts` と ACP `Session.ts` という2つの PostToolUse パスで同じ extraction / validation の前置ロジックを再利用できるようにし、2箇所での動作の乖離を防ぐ。
- `Session.runTool()` は tool result artifacts と hook artifacts を収集するが、両者は異なるトランスポートを使用する。tool result artifacts は正常に返された tool result のみから取得される。hook artifacts はツールの成功に依存せず、失敗パスからも store に入ることができる。
- ACP `Session.runTool()` において、成功したツール結果に付随する artifacts は引き続き `tool_call_update._meta.artifacts` に付着される。PostToolUse / PostToolUseFailure hook が返す artifacts は、`client.extNotification('qwen/notify/session/artifact-event', payload)` を通じて統一的に個別送信される。この notification は、hook artifacts の収集完了後に同期的に await しなければならない。送信失敗は warning を記録するのみで、元のツールの失敗/成功結果は変更しない。これらの hook artifacts は daemon store に入らず、V1 では永続的なリトライは行わない。
- hook artifacts は `record_artifact` / client POST と同じ validation セットを通る: URL scheme、workspace path containment、metadata size/type。
- batch-level artifacts に単一の tool call が存在しない場合、その実行時にすでに bridge へ ACP `extNotification` を送信できる状態にある場合にのみ、`qwen/notify/session/artifact-event` を使用できる。
`qwen/notify/session/artifact-event` ペイロード：

```json
{
  "artifacts": [
    {
      "kind": "link",
      "storage": "external_url",
      "title": "バッチタスクの詳細",
      "url": "https://ops.example.com/task/batch_123",
      "mimeType": "text/html"
    }
  ],
  "source": "hook",
  "hookEventName": "PostToolBatch",
  "hookName": "task-artifacts",
  "extensionId": "example-extension"
}
```

Transport の規約：

- `qwen/notify/session/artifact-event` は ACP の `extNotification` であり、SSE event でも client-facing HTTP route でもない。
- wire format は既存の `qwen/notify/session/*` 通知規約を再利用する。たとえば、bridge に既存の session notification demux パターンなど。
- 送信元は、すでに ACP session チャネル内に存在し、かつ `extNotification` を送信する能力を持つランタイムまたは extension bridge でなければならない。ACP `Session.ts` はこの通知を送信できるが、`coreToolScheduler.ts` 自体は daemon のメインセッションに直接この通知を送信できない。
- `BridgeClient` は既存の `extNotification` 処理分岐内で notification name ごとに demux する。`qwen/notify/session/artifact-event` にヒットしたら payload を読み取り、`SessionArtifactInput[]` に変換してから、統一 ingest pipeline に投入する。
- Bridge は notification transport context から `source: 'hook'` を導出しなければならない。payload 内の `source` は互換性のためのヒントとしてのみ機能する。payload の source と transport context が一致しない場合、bridge は `hook` に上書きし、debug/warning を記録する。Notification payload は `trustedPublisher` を設定できない。`storage: 'published'` が含まれている場合、通常の untrusted input としてバリデーション失敗扱いとする。

注意：`qwen/notify/session/artifact-event` は explicit artifacts の転送 envelope であり、2つ目の store/validation/dedupe パイプラインを形成すべきではない。BridgeClient は `_meta.artifacts`、hook artifacts、および `artifact-event.artifacts` をすべて同じ `SessionArtifactInput[]` に変換し、同じ `ingestArtifacts()` / `SessionArtifactStore.upsertMany()` を呼び出して、同じ validation、normalization、enrichment、eviction、および `artifact_changed` 公開ロジックを再利用しなければならない。ACP のメインセッションには現在 PostToolBatch callsite が存在しないため、`coreToolScheduler.ts` の batch hook を daemon artifacts パネルのデフォルトソースと見なすことはできない。今後 daemon のメインセッションで batch artifacts をサポートする場合は、まず実際の呼び出しサイトとテストを追加する必要がある。ACP 以外のランタイムは、artifact notification sink がなければ daemon hook artifacts のサポートを宣言できない。

### 6.5 Client / Extension からの直接挿入

モデルにツールを呼び出させたくないシナリオ向けに、以下を提供する：

```http
POST /session/:id/artifacts
```

適切なユースケース：

- IDE プラグインが現在開いているプレビュー URL を成果物エリアに追加する。
- WebUI ユーザーがリソースリンクを手動で追加する。
- Channel プラグインや外部統合がタスク実行中にプラットフォームリソースを登録する。

hook 出力との違い：

- hook 出力は agent の実行チェーン内部に適している。
- POST route は daemon client / UI / 外部統合に適している。
- POST body は統一された artifact validation を通過する必要があり、任意のローカル絶対パスやサポートされていない URL scheme は許可されない。

## 7. Store と重複排除

artifact identity：

- workspace ファイル：`sessionId + ':workspace:' + normalizedWorkspacePath`
- managed ファイル：`sessionId + ':managed:' + normalizedManagedId`
- external / published URL：`sessionId + ':url:' + identityUrl`

identity はリソースの位置のみを記述し、`source` は含まない。tool、hook、client による同一 URL またはパスの登録は 1 つの artifact にマージされ、右側パネルで同じリソースが重複して表示されるのを防ぐ。V1 では `provenance[]`、信頼レベル、または retention class を維持しない。最初に正常に登録したものが该 artifact の表示フィールドとソース監査フィールドを所有し、その後の同一 identity の登録は「同じリソースが再び観測された」ことのみを表す。

入力には、位置特定フィールドを 1 つだけ、かつ必ず 1 つ含める必要がある：

- `workspacePath`
- `managedId`
- `url`

入力に複数の primary locator が同時に含まれている場合、V1 は優先度に基づいて identity を推測しようとするのではなく、直接拒否する。これにより、ある artifact がまず `workspacePath` で重複排除され、後で `url` で重複排除されて重複が発生するのを防ぐ。

`storage: 'published'` は唯一の例外である：primary locator として `url` を含める必要があり、追加で managed reference として `managedId` を含めることができる。published identity は引き続き `url` に基づいて計算される。`managedId` は将来のダウンロード/プレビューにのみ使用され、重複排除には関与しない。この例外は、内部の `trustedPublisher: true` を含む入力のみを受け付ける。hook、client POST、`record_artifact`、または通常のツールが `storage: 'published'` を返した場合、バリデーション失敗として処理される。

外部向け id：

- identity の sha256 の先頭 12 桁を使用する。

### 7.1 Normalization

`normalizedWorkspacePath`：

- 入力は workspace-relative path でなければならない。エントリで絶対パスが渡された場合は、まず workspace-relative path への変換を試み、失敗した場合は拒否する。
- `path.resolve(workspaceCwd, input)` を使用して絶対パスを取得する。
- resolved path が workspace 内にあることをバリデーションする：`path.relative(workspaceCwd, resolved)` は `..` で始まってはならず、絶対パスでもあってはならない。
- ターゲットが既に存在する場合は、`fs.realpath` を使用して symlink の最終ターゲットが引き続き workspace 内にあることを確認する。symlink が workspace 外を指している場合は拒否する。
- ターゲットが存在しない場合、registration はその artifact を保持できるが、初期 `status` は `missing` でなければならない。`realpath` が失敗したからといって symlink containment をスキップしてはならない。後続の GET TTL refresh 時に、同じ containment + realpath チェックを再実行しなければならない。
- refresh 時にパスが workspace 外を指す symlink に変わっていた場合、artifact は保持されるが `status` は `missing` になり、best-effort の `sizeBytes` はクリアされる。V1 ではこのパスを `available` として報告することは決してない。
- 出力は統一して POSIX スラッシュを使用し、先頭の `./` を削除する。
- 大文字と小文字の折りたたみは行わない。macOS のデフォルトファイルシステムが大文字と小文字を区別しない場合でも、identity は文字列として区別され、クロスプラットフォームでの動作の不一致を回避する。

`normalizedManagedId`：

- 入力はまず ASCII whitespace を trim する。
- trim 後に空であってはならず、長さは 200 文字を超えてはならない。
- ASCII 制御文字は拒否する。
- `/`、`\`、`..` は拒否し、パス階層やローカル絶対パスのセマンティクスを表現することは許可されない。
- 大文字と小文字の折りたたみは行わず、identity は文字列として区別される。
- public な `managedId` は normalized 後の値を返す。

`identityUrl` と `url`：

- WHATWG の `new URL(input)` を使用して解析し、文字列の `startsWith('http')` のような緩い判定は禁止する。
- `ArtifactTool` の trusted published URL を除き、通常の link artifact では `http:` / `https:` のみが許可される。
- `url` フィールドは、client で開くためのクリーンアップされたクリック可能な URL を保存する。identity を URL として逆変換してクリック可能な URL にしてはならない。
- identity は別途内部の `identityUrl` を使用して計算され、public フィールドとして返されない。
- scheme と host は小文字にする。
- デフォルトポートの正規化：`https:443` / `http:80` は保持しない。
- fragment は保持する。hash-routed SPA では、fragment がリソース identity の一部である可能性がある。
- query パラメータの元の順序を保持する。一部のプラットフォームは query の順序に敏感であるため、V1 では query のソートを行わない。
- `username` / `password` は拒否またはクリアし、URL の userinfo を artifact store に保存しない。

重複排除の動作：

- 初回登録：`created`
- 同一 identity の再登録：`updated`
- `createdAt` は変更されない。
- `updatedAt` は更新されるが、eviction のソートには関与しない。
- 同一の `upsertMany()` 内では、まず identity ごとに入力をマージする。同一 identity の owner は `receivedSeq` が最小の入力によって決定され、`receivedSeq` がない場合は入力配列の順序が使用される。BridgeClient は、異なる transport event の artifacts を無秩序にマージすべきではない。マージする必要がある場合は、まず `receivedSeq` を割り当ててからソートする。各最終 identity は `changes[]` 内に 1 つの change のみを生成する。その identity がこのバッチの前に存在しなかった場合は `created`、それ以外の場合は `updated` となる。
- 表示フィールド `title`、`description`、`source`、`toolCallId`、`toolName`、`hookName`、`extensionId`、`clientId` は first-writer-wins が採用され、後続の同一 identity の入力によって上書きされない。
- リソース本体フィールドは安全なアップグレードを許可する：同一 URL identity が `external_url` から `published` にアップグレードされる場合、`storage` を更新し、`managedId` を補充し、`kind` / `mimeType` / `sizeBytes` を更新でき、publisher が `title` / `description` を上書きすることを許可して、プレースホルダーの link タイトルが実際の公開物を永久に隠してしまうのを防ぐ。このアップグレードは、内部の `trustedPublisher: true` を含む `storage: 'published'` の入力のみを受け付ける。
- `managedId` が空から published managed reference へ補充されることは許可される。既存の `managedId` は後続の通常の入力によって上書きされない。
- `status` と `sizeBytes` は daemon の best-effort 派生フィールドであり、workspace stat または published artifact enrichment に伴って更新される可能性がある。
- `metadata` は初回登録時にバリデーションを通過した小さなオブジェクトを保存する。後続の同一 identity では、`source: 'tool'` または `source: 'client'` の入力のみが制御されたエンリッチメントを実行できる：存在しない key のみを追加し、既存の key は上書きしない。マージ後に primitive-only と 4KB の合計サイズを再バリデーションする。hook による既存 artifact の metadata エンリッチメントはデフォルトで無視される。マージ後に制限を超えた場合、今回の metadata エンリッチメントのみを破棄して warning を記録し、artifact の他の安全なアップグレードは続行できる。
- client POST による同一 identity は表示フィールドを上書きせず、`retentionSource` も変更しない。内部の `clientRetained` を `true` に設定するのみで、ユーザーの手動保持意図を表現するために使用される。
- 実装は、単一の `SessionArtifactStore.upsertMany()` 内で同期的に処理し、非同期の read-modify-write 競合を回避しなければならない。

内部 store フィールド：

- `retentionSource`：最初に正常に登録したものの `source`。作成時に値が割り当てられ、その後は client POST や繰り返し upsert によって変更されない。
- `clientRetained`：ブール値。初期値は `source === 'client'`。mutation gate を通過した任意の client POST が同一 identity にヒットした際に `true` に設定される。`clientRetained` は表示フィールドを変更せず、`retentionSource` バケットを移行することもない。
- `insertSeq`：store 内の単調増加シーケンス番号。artifact 作成時に 1 回だけ値が割り当てられ、決して更新されない。
- `receivedSeq`：入力受信順序。同一バッチの deterministic coalescing にのみ使用され、public フィールドとして返されない。

クォータと保持ポリシー：

- 1 セッションあたり最大 200 個の artifacts。
- V1 は soft source reservation を使用する。reservation は内部の `retentionSource` の帰属に従う：
  - `tool`: 100
  - `client`: 50
  - `hook`: 50
- reservation は最低保持枠であり、ハード上限ではない。未使用の枠は、グローバルな 200 の上限に達するまで、他のソースによって借用される可能性がある。
- 新規作成された artifact によって総数が 200 を超える場合、以下の順序で eviction 候補が選択される。このバッチの `upsertMany()` で新規作成された artifact は、デフォルトでは候補プールに入らない。eviction は、まずこのバッチ開始前に既に存在していた artifacts の中からのみ候補を選択する。これにより、このバッチで新規登録された missing artifact が、満杯の store 内でまだ live な古い artifact を押し出す可能性がある。これは、現在の explicit な成果物の可視性を保証するための V1 の選択である。
  1. `status: 'missing'` かつ `clientRetained === false` の artifact を優先的に削除する。
  2. 次に、`retentionSource` の数が reservation を超えているソースから、`clientRetained === false` の artifact を削除する。
  3. さらに、`clientRetained === false` の最も古い artifact を削除する。
  4. すべての artifact が `clientRetained === true` の場合、最も古い client-retained artifact を削除する。
- eviction が cached `missing` 優先度を使用する前に、候補となろうとしている workspace artifacts に対して best-effort の status refresh / containment check を実行しなければならない。refresh 後に `available` である場合、それを missing として優先的に削除し続けることはできない。refresh に失敗した場合は、元の cached 状態を保持する。
- `clientRetained` は最後の削除優先設定であり、無制限の pin ではなく、200 のグローバル上限や soft reservation を破るものでもない。すべての artifact が client-retained である場合でも、最も古い client-retained artifact が削除される。
- 古い artifact を削除した後でも、このバッチで新規作成された artifact 自体が残りの容量を超えている場合、store は `changes[]` を生成する前に、`receivedSeq` / 入力順序に従って最初の N 個の新しい identity を保持し、超えた分のこのバッチの入力を破棄して warning/diagnostics を記録しなければならない。破棄された新しい入力は store に入らず、`created` または `removed` change を生成しないため、同一の mutation 内で同一 identity が `created` になった後に `removed` になることはない。
- 「最も古い」のソートには `(createdAt, insertSeq)` が使用される。`insertSeq` は store 内部の単調増加シーケンス番号であり、同一ミリ秒または同一バッチ入力の tiebreaker を安定させるために使用される。
- 同一 identity の重複登録は `updatedAt` を更新するが、eviction は `updatedAt` を見ない。したがって、他のソースが高頻度の重複登録によって古い artifact を保持セットに固定することはできない。
- `createdAt` の昇順で返す。
- 削除時は、削除された各 artifact に対して `artifact_changed` / `removed` を送信しなければならない。V1 は他の削除イベントを提供しない。
- reservation の値、`retentionSource`、`clientRetained`、および `insertSeq` は V1 の実装詳細であり、wire protocol フィールドではない。今後、API shape を変更せずにデフォルト値を調整したり、より細かい producer 単位のクォータを追加したりできる。

### 7.2 V1 のライフサイクル制限

V1 の store は live bridge session のインメモリインデックスである：

- bridge/session 再起動後、artifacts は復元されない。
- Client SSE が切断されて再接続された後は、`GET /session/:id/artifacts` を再実行して snapshot sync を行う必要がある。
- V1 では追加の `artifacts_reset` event を要求しない。今後、セッションは存続するが artifact store がクリアされる実行モードをサポートする場合は、`artifacts_reset` または同等の snapshot-invalidated event を追加する。
- 履歴の復元、プロセス間永続化、および session load replay は後続のフェーズに属する。

## 8. 内部実装チェーン

以下の Phase は、同一の V1 完全機能のエンジニアリング実装順序であり、外部に対して複数のバージョンに分割することを意味するものではない。実装 PR は Phase ごとに小さく分割できるが、マージ後の設計基準は完全な session artifacts 機能的一项となる。

### 8.1 Phase A: core types and ArtifactTool

変更点：

- `packages/core/src/tools/tools.ts`
  - `ToolArtifactKind`、`ToolArtifactStorage`、`ToolArtifact` を追加。
  - `ToolResult.artifacts?` を拡張。
- `packages/core/src/tools/artifact/artifact-tool.ts`
  - publish 成功後に `artifacts` を設定。
  - `storage: 'published'` を使用し、qwen home のローカルパスを `workspacePath` として公開しない。

Phase A ではまず `ToolResult.artifacts` と `ArtifactTool` を組み込む。`record_artifact` は Phase D で組み込まれるが、引き続き同じ V1 完全機能に属する。

### 8.2 Phase B: cli ACP session metadata

変更点：

- `packages/cli/src/acp-integration/session/types.ts`
  - `ToolCallResultParams.artifacts?`
- `packages/cli/src/acp-integration/session/emitters/tool-call-emitter.ts`
  - `_meta.artifacts = params.artifacts`
- `packages/cli/src/acp-integration/session/Session.ts`
  - ツール成功後に `toolResult.artifacts` を収集。
  - PostToolUse hook artifact はツールの成功/失敗とは独立して収集され、error trace / dashboard などの失敗診断成果物として使用される。
  - 失敗パスの hook artifacts は成功時の result metadata に依存してはならない。必要に応じて bridge artifact ingest を直接呼び出す。
  - 通常の `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` から artifacts を自動派生しない。
  - `emitResult()` に渡す。

### 8.3 Phase C-1: acp-bridge store and events

追加：

- `packages/acp-bridge/src/sessionArtifacts.ts`
  - 型
  - normalize
  - validation
  - id/hash
  - `SessionArtifactStore`

Bridge session entry に追加：

```ts
artifacts: SessionArtifactStore;
```

Bridge interface に追加：

```ts
getSessionArtifacts(sessionId: string): SessionArtifactsEnvelope;
addSessionArtifacts(
  sessionId: string,
  artifacts: SessionArtifactInput[],
): DaemonSessionArtifactMutationResult;
removeSessionArtifact(
  sessionId: string,
  artifactId: string,
): DaemonSessionArtifactMutationResult;
```

BridgeClient：

- `session_update/tool_call_update._meta.artifacts` から artifacts を抽出。
- `qwen/notify/session/artifact-event` から explicit notification artifacts を抽出。
- すべての入力は同じ `SessionArtifactInput[]` に変換される。
- transport context に基づいて `source` と `receivedSeq` を割り当てる。`trustedPublisher` は、完了した `ArtifactTool` session update の bridge-side ingest option によってのみ割り当てられる。BridgeClient は artifact payload フィールドや通常の `_meta.artifacts` の内容に基づいて推測してはならない。
- `ingestArtifacts()` / `SessionArtifactStore.upsertMany()` を統一的に呼び出し、notification artifacts 用に 2 つ目の validation や dedupe を作成しない。
- `upsertMany()` は `DaemonSessionArtifactMutationResult` を返し、created/updated および eviction によって生成された removed changes を含む。
- 各 change に対して `artifact_changed` を公開し、まず created/updated を公開し、次に removed を公開する。
- `removeSessionArtifact()` は store から artifact を削除し、`reason: 'explicit'` の removed change を返して `artifact_changed` を公開する。

### 8.4 Phase C-2: serve snapshot API

変更点：

- `packages/cli/src/serve/capabilities.ts`
  - `session_artifacts` を追加。
- `packages/cli/src/serve/server.ts`
  - `GET /session/:id/artifacts` を追加。
  - `DELETE /session/:id/artifacts/:artifactId` を追加。

GET の動作：

- session が存在しない場合：既存の 404。
- artifacts がない場合：空の配列を返す。
- workspace artifact は内部の status cache（例：`lastStatAt`、`lastKnownSizeBytes`、`lastKnownStatus`）を維持する。
- upsert 時に best-effort の stat を 1 回実行する。
- GET はデフォルトで cache を使用する。`lastStatAt` が期限切れの場合にのみ TTL に基づいて更新する（例：5〜30秒）。同時に実行される stat の数は制限される。更新時には、セクション 7.1 の workspace containment と realpath symlink check を再実行しなければならない。
- stat 失敗時：GET は `status: 'missing'` を返し、artifact は削除しない。
- stat 成功かつ containment / realpath check が引き続きパスする場合：それ以前の cache が `missing` であった場合、GET は `status: 'available'` を返す。
- refresh 時に symlink escape または workspace containment の失敗が発見された場合、GET は `status: 'missing'` を返し、新しい `sizeBytes` は返さない。
- GET は status cache をサイレントに更新できるが、読み取りリクエストによって `artifact_changed` を公開してはならない。V1 の status は SSE クライアントに対して eventually consistent である。
- 今後リアルタイムの status イベントが必要な場合は、バックグラウンド refresh または明示的な refresh mutation によって `artifact_changed` / `updated` を公開すべきであり、GET のホットパスに配置してはならない。
- managed / URL artifact はローカルパスをプローブせず、常に `status: 'available'` を返す。

### 8.5 Phase C-3: SDK list/event support
変更点：

- `packages/sdk-typescript/src/daemon/types.ts`
  - artifact 型を追加。
- `packages/sdk-typescript/src/daemon/events.ts`
  - known event に `artifact_changed` を追加。
- `packages/sdk-typescript/src/daemon/DaemonClient.ts`
  - `listSessionArtifacts(sessionId, opts?, clientId?)`
  - `addSessionArtifact(sessionId, artifact, clientId?)`
  - `removeSessionArtifact(sessionId, artifactId, clientId?)`
- `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`
  - `artifacts(opts?)`
  - `addArtifact(artifact)`
  - `removeArtifact(artifactId)`
- `packages/sdk-typescript/src/index.ts`
  - 型をエクスポート。

SDK の単数 add は bridge の複数 mutation にマッピングされる：`addSessionArtifact(a)` は `addSessionArtifacts(sessionId, [a])` としてラップされ、完全な `DaemonSessionArtifactMutationResult` を返し、eviction によって生成された removed changes を破棄しない。

### 8.6 Phase D: record_artifact explicit registration

変更点：

- `packages/core/src/tools/tool-names.ts`
  - `RECORD_ARTIFACT: 'record_artifact'` を追加。
- `packages/core/src/tools/record-artifact.ts` を新規追加
  - `RecordArtifactTool` を実装。
  - パラメータは `workspacePath` / `managedId` / `url` を使用し、任意のローカル絶対パスは受け付けない。
  - `storage: 'published'` または `url + managedId` の published 例外は受け付けない。
  - `ToolResult.artifacts` を出力し、V1 の store/event/list パスを再利用する。
- `Config.createToolRegistry`
  - feature-gated または skill/extension の opt-in で登録し、すべての session にモデルから参照可能な tool を追加しないようにする。

### 8.7 Phase E: hook artifacts explicit registration

変更点：

- `packages/core/src/hooks/types.ts`
  - `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`。
- `packages/core/src/hooks/hookAggregator.ts`
  - `mergeWithOrLogic()` は `artifacts` に対して複数 hook を concat し、last-writer-wins は使用しない。
- `packages/core/src/core/toolHookTriggers.ts`
  - `PostToolUseHookResult` / `PostToolBatchHookResult` に `artifacts?: ToolArtifact[]` を追加。
- `packages/core/src/core/coreToolScheduler.ts`
  - core scheduler の PostToolUse / PostToolBatch artifacts 伝播パスをオーバーライド。
- `packages/cli/src/acp-integration/session/Session.ts`
  - ACP session の PostToolUse artifacts 伝播パスをオーバーライド。
- 2つの PostToolUse パスは同じ hook artifact collection helper を再利用する。
- ACP session V1 は PostToolBatch artifacts のサポートを宣言しない。製品要件で daemon メインセッションの batch artifacts が必要な場合は、`coreToolScheduler.ts` の非 daemon メインセッションパスに依存するのではなく、ACP Session に実際の PostToolBatch callsite を追加しなければならない。
- 他のランタイムで既に batch-level artifact notification を持っている場合、`qwen/notify/session/artifact-event` を通じて bridge に送信できる。
- BridgeClient は `qwen/notify/session/artifact-event` から batch-level artifacts を抽出し、同じ validation と upsert を実行する。

### 8.8 Phase F: client POST / SDK add explicit registration

変更点：

- `packages/cli/src/serve/server.ts`
  - `POST /session/:id/artifacts` を追加し、`mutate({ strict: true })` を実行。
  - `DELETE /session/:id/artifacts/:artifactId` を追加し、`mutate({ strict: true })` を実行。
  - body を validate する。
  - source を `client` に設定する。
  - 単一要素の `SessionArtifactInput[]` に変換し、bridge の `addSessionArtifacts()` を呼び出す。
  - POST は `storage: 'published'` または `trustedPublisher` を受け付けない。
  - DELETE は bridge の `removeSessionArtifact()` を呼び出す。artifact が既に存在しない場合は空の `changes[]` を返し、SSE を発行しない。
  - `artifact_changed` を発行し、まず created/updated を発行し、次に removed を発行する。
- artifact add は単数の bridge mutation を新規追加しない。すべての新規エントリは `addSessionArtifacts()` / `upsertMany()` を通り、validation、coalescing、eviction の動作のぶれを避ける。artifact remove は個別の `removeSessionArtifact()` を使用する。これは server-assigned artifact id で削除され、input validation / identity coalescing に参加しないためである。

- SDK に以下を追加：
  - `DaemonClient.addSessionArtifact(sessionId, artifact, clientId?)`
  - `DaemonSessionClient.addArtifact(artifact)`
  - `DaemonClient.removeSessionArtifact(sessionId, artifactId, clientId?)`
  - `DaemonSessionClient.removeArtifact(artifactId)`

## 9. セキュリティ境界

### 9.1 URL

- 通常の link artifact は `http:` / `https:` のみ許可する。
- 必ず WHATWG の `new URL(input)` を使用して解析し、`parsed.protocol` をチェックする。文字列プレフィックスに基づく判断は禁止する。
- 保存前に `parsed.username` / `parsed.password` を拒否またはクリアし、URL 認証情報の漏洩を防ぐ。
- `record_artifact` / hook / client POST は `file://` を許可しない。
- `ArtifactTool` が返す `file://` published URL は例外として維持する。これは認可された publish に由来するためである。remote daemon シナリオでは、リモート publisher の `https:` URL を優先すべきである。
- Daemon は URL を fetch しない。
- Client は host を表示する。
- URL は自動で開かない。
- Client は `kind: 'image' | 'video' | 'audio' | 'html'` であっても、external URL を自動的に `<img>`、`<video>`、`<audio>`、`iframe`、または同様のネットワークリクエストを発行するプレビュー要素に埋め込んで서는ならない。V1 では external URL に対してアイコン、タイトル、host、クリック入口のみを表示する。リモートプレビューはユーザーが明示的にクリックするのを待つか、後続で個別の preview capability と sandbox ポリシーを通じて有効化する必要がある。
- Client は loopback、RFC 1918、link-local、metadata service などのプライベートネットワークアドレスに対して警告またはブロックを行うべきである。Daemon V1 は DNS を解決せず、SSRF 防御の最終判断は担わない。

### 9.2 Path

- 外部に対しては `workspacePath` のみを返し、それは workspace 相対パスでなければならない。
- workspace 外のパスは file artifact として公開しない。
- `record_artifact` / hook / client POST で `workspacePath` を渡す場合、workspace 内でなければならない。
- 検証アルゴリズムは Section 7.1 を参照：`path.resolve` + `path.relative` による包含チェック。ターゲットが存在する場合は `fs.realpath` による symlink エスケープチェックを行う。ターゲットが存在しない場合、artifact は store に入れることができるが、`missing` としてマークする必要があり、後続の GET/status refresh で同じ検証を再実行する。
- `..` エスケープ、絶対パスエスケープ、workspace 外を指す symlink、`~/.qwen`、`/tmp` などのローカル外部パスを拒否する。
- `managedId` は daemon-managed storage のみを参照できる。trim 後に空であってはならず、パス区切り文字、`..`、制御文字、およびローカル絶対パスのセマンティクスを拒否する。

### 9.3 Metadata

- サイズを制限する。例えば JSON stringify 後に 4KB を超えないようにする。
- primitive value のみ許可する。
- UI と永続化の複雑化を避けるため、nested object/array は許可しない。
- secret、token、cookie、signed URL、秘密鍵、アクセス認証情報を格納しない。
- metadata の string value が UI に表示される場合、信頼されない plain text としてレンダリングまたはエスケープしなければならない。metadata は HTML/markdown の拡張ポイントではない。
- V1 は `visibility`、`sensitivity`、`expiresAt`、`sourceId` などのコンシューマーが存在しないフィールドを提供しない。artifact の visibility は現在の session-local セマンティクスに固定される。
- 監査の次元は、最初の登録者の `source` / `toolCallId` / `toolName` / `hookName` / `extensionId` / `clientId`、`createdAt`、`updatedAt` によって担われる。
- 同じ identity の後続の登録は、デフォルトでは最初の登録者の表示フィールドを上書きしない。唯一の例外は Section 7 で定義された信頼された `external_url -> published` のアップグレードであり、この場合 publisher は `title` / `description` を上書きできる。metadata は Section 7 で定義された制御された拡張のみを許可し、異なるソース間での metadata 注入を避ける。

### 9.4 Text Fields

- `title` / `description` は plain text であり、HTML でも markdown でもない。
- Daemon の検証では、長さ、trim、ASCII 制御文字の拒否を行わなければならない。部分文字列のブラックリストを XSS セキュリティ境界として使用してはならない。
- UI に入る可能性のあるすべてのテキストフィールド（`title`、`description`、metadata string value、`toolName`、`hookName`、`extensionId`、`clientId` を含む）について、client は信頼されないテキストとしてレンダリングまたは HTML エスケープを行わなければならず、`innerHTML` を介した直接挿入は禁止する。

### 9.5 Anti-spam

- 1 session あたり最大 200 個の artifacts。
- soft reservation のデフォルトは `tool: 100`、`client: 50`、`hook: 50` であり、未使用の枠は他のソースによって借用できる。
- `record_artifact` は 1 回の tool call で 1 個の artifact のみを登録する。
- `POST /session/:id/artifacts` は既存の rate limit / mutation gate を通過する。
- eviction は `artifact_changed` / `removed` event を 1 件ずつ送信しなければならない。
- Client は `source`/`toolName` でグループ化または折りたたみを行うことができる。

### 9.6 Validation Diagnostics

- `record_artifact` のパラメータ検証に失敗した場合はツールエラーを返し、artifact を生成しない。
- `POST /session/:id/artifacts` の body 検証に失敗した場合は 400 を返す。
- `_meta.artifacts`、hook artifacts、または `artifact-event` 内の個別の malformed artifact は、元の tool/session event を破壊してはならない。bridge はその artifact をスキップし、warning レベルのログを記録するべきである。
- warning ログには少なくとも sessionId、source、`toolName` / `hookName` / `extensionId` / `clientId`、失敗したフィールドと理由を含めること。secret のような metadata value は記録しないこと。
- debug ログには、マスキングおよび長さ切り捨てを行った rejected artifact payload を記録できる。
- 既存の telemetry/metrics インフラが利用可能な場合は、validation rejection counter を追加し、source と reason でタグ付けする。一時的に metrics がない場合、ログは V1 の最低要件である。

## 10. 「通常のリンク」との境界

右側の artifacts パネルは宣言的 artifacts のみを表示する。チャット本文には引き続き通常のリンクを表示できる。

自動抽出を行わない理由：

- 通常の回答にあるドキュメントリンク、参照リンク、デバッグリンクが大量に誤って成果物エリアに入ってしまうため。
- URL は例、テンプレート、未完成物、エラー出力である可能性があるため。
- 自動抽出を行うと、モデルが「どのリンクがユーザーのその後の利用に値するか」を制御できなくなるため。
- セキュリティの観点から、明示的な登録の方がソースのマーキングと UI での警告を行いやすいため。

ビジネス要件でテキストから URL を抽出する必要がある場合は、Client のオプション UX とするべきである：

- チャット本文の近くでのみ表示する。
- daemon artifact store には入れない。
- `artifact_changed` をトリガーしない。

## 11. Skill / Agent の使用方法

V1 で `record_artifact` が提供された後、skill または agent.md には次のように記述できる：

```md
ツールの結果に基づいてユーザーが閲覧できるビジネスリソース URL を構築した場合は、record_artifact ツールを呼び出して登録する。

登録ルール：

- title にはリソースの人間が読める名前を使用する。
- kind には link を使用する。
- storage には external_url を使用する。
- url には最終的にクリック可能な URL を使用する。
- metadata.resourceType にはリソースタイプ（例：data_platform_resource、scheduler_task）を入力する。
- 通常の参照ドキュメントリンクを artifact として登録してはならない。
```

モデル実行後：

1. ビジネスツールを呼び出してリソース ID、タスク ID、ノード ID を取得する。
2. skill のルールに従って URL を組み立てる。
3. `record_artifact` を呼び出す。
4. Daemon の右側の成果物エリアにその link が表示される。

このスキームでは skill に hook の記述を要求せず、extension/plugin コードも要求しないため、ほとんどのビジネスルールに最適である。

## 12. Hook / Extension の使用方法

V1 で hook artifact が提供された後、extension は `qwen-extension.json` または `hooks/hooks.json` で PostToolUse hook を提供できる：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__data_platform__get_resource",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/table-artifact.js"
          }
        ]
      }
    ]
  }
}
```

現在の qwen-code extension/hook の変数置換は引き続き `${CLAUDE_PLUGIN_ROOT}` をサポートしている。後続で新しい qwen-specific root 変数が導入された場合、例は実装に合わせて同期的に移行できる。

スクリプトの stdout：

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "ユーザープロファイルリソースの詳細",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "data_platform_resource"
        }
      }
    ]
  }
}
```

これはエンタープライズプラグインに適している。「ツール結果からビジネス URL をどのように組み立てるか」というロジックを各 prompt に記述するのではなく、extension に固定化できるためである。

## 13. テスト計画

### 13.1 Phase A core

対象：

- `ToolResult.artifacts` 型のコンパイル。
- `ArtifactTool` が `storage: 'published'` の html artifact を正常に返すこと。
- `ArtifactTool` が qwen home のローカル絶対パスを `workspacePath` として公開しないこと。
- `ToolArtifact.kind` / `storage` のデフォルト推論ルールに対するユニットテストのカバレッジ。

コマンド：

```bash
cd packages/core && npx vitest run src/tools/artifact/artifact-tool.test.ts
```

### 13.2 Phase B cli session

対象：

- `ToolCallEmitter.emitResult()` が `_meta.artifacts` を出力すること。
- `toolResult.artifacts` が `emitResult()` に渡されること。
- 完了した `ArtifactTool` session update は、bridge 側の ingest option を通じて内部的に `trustedPublisher: true` を設定する。`record_artifact`、その他の tool result、hook payload、client POST は設定せず、BridgeClient も artifact payload フィールドから推論できないこと。
- `write_file`/`edit`/`notebook_edit` による通常のソースコード変更は自動的に artifact を派生させないこと。
- `read_file`/`grep`/`glob`/`shell` は artifact を派生させないこと。
- ツール失敗時に失敗した tool result の artifacts は収集しないこと。PostToolUse hook が明示的に返す診断 artifacts は引き続き store に入れること。
- 失敗パスの hook artifacts は成功時の result `_meta.artifacts` に依存しないこと。

コマンド：

```bash
cd packages/cli && npx vitest run src/acp-integration/session/emitters/tool-call-emitter.test.ts
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

### 13.3 Phase C-1 acp-bridge

対象：

- `SessionArtifactStore` の created/updated/removed。
- `ToolArtifact` から `DaemonSessionArtifact` への enrichment。
- `SessionArtifactInput` がすべてのエントリで統一された内部入力型であること。
- デフォルトの `kind` / `storage` 推論。published->html、html/image/video/audio/pdf/notebook/file をカバーすること。
- `workspacePath` / `managedId` / URL identity の重複排除。identity は source を含まず、異なるソース間で同じリソースを登録すると 1 つの artifact にマージされること。
- 複数の primary locator を同時に持つ通常の artifact は拒否されること。`trustedPublisher: true` かつ `storage: 'published'` のみが `url + managedId` を許可し、identity は `url` のみに基づくこと。
- hook、client POST、`record_artifact`、または通常の tool result が `storage: 'published'` を偽装した場合は拒否またはスキップされ、warning が記録されること。
- `managedId` の正規化：trim、空値の拒否、パス区切り文字の拒否、`..` の拒否、制御文字の拒否、大文字小文字の折りたたみなし。
- URL の検証：scheme/host の小文字化、デフォルトポートの正規化、fragment の保持、query の順序保持、userinfo の拒否/削除。
- `url` にはクリーンアップされたクリック可能な URL を保存し、identity には内部の `identityUrl` を使用し、両者を混在させないこと。
- Path の検証：`../../etc/passwd`、workspace 外の絶対パス、symlink エスケープはすべて拒否されること。存在しないパスが store に入る場合は `missing` となり、GET TTL refresh で包含チェック / realpath チェックを再実行すること。
- Title/description の検証：長さ制限、trim、制御文字の拒否、plain text であること、明らかな HTML/script payload の拒否。
- Metadata の検証：サイズ制限、primitive のみ、nested object/array の拒否。
- 同じ identity の upsert では、表示フィールドとソースフィールドに対して first-writer-wins を採用すること。
- 同じ URL identity で、信頼された `external_url -> published` リソース本体のアップグレードをサポートし、`managedId` / `kind` / `mimeType` を補完し、publisher がプレースホルダーの `title` / `description` を上書きできるようにすること。
- tool/client の後続の metadata は、欠落している key のみを追加でき、既存の key を上書きできないこと。マージ後に 4KB および primitive-only の制約を再び満たすこと。
- hook の後続の metadata 拡張はデフォルトで無視されること。
- 同じバッチ内の重複する identity は `receivedSeq` / 入力配列の順序に従って owner を決定し、`changes[]` には最終的な change を 1 つだけ生成すること。
- `retentionSource` は作成時に値が設定され、更新されないこと。`clientRetained` は `retentionSource` と分離されていること。`insertSeq` は作成時に値が設定され、更新されないこと。
- soft reservation eviction：未使用の枠は借用可能、`missing` を優先的に削除、`client-retained` を最後に削除、`createdAt + insertSeq` で安定ソート、かつ `reason: 'eviction'` の removed event を 1 件ずつ送信すること。
- eviction が `missing` 優先度を使用する前に、候補となる workspace artifact の状態を更新し、stale な missing cache によって復元されたファイルを優先的に削除しないようにすること。
- eviction はこのバッチで刚作成された `missing` artifact を優先的に削除しないこと。このバッチ自体が残り容量を超えた場合、超えたこのバッチの新規入力は changes を生成する前に破棄され、diagnostics が記録される。同じ identity の `created` + `removed` は生成されないこと。
- `clientRetained` はグローバルな 200 の上限を超えないこと。すべてが `client-retained` の場合でも、最も古い項目を削除すること。
- malformed artifact は warning log / diagnostics を生成し、元の event に影響を与えないこと。
- `_meta.artifacts` が store に書き込まれること。
- `artifact_changed` が発行されること。
- `upsertMany()` / `addSessionArtifacts()` が eviction changes を含む `DaemonSessionArtifactMutationResult` を返すこと。
- `removeSessionArtifact()` が `reason: 'explicit'` の removed change を返すこと。

コマンド：

```bash
cd packages/acp-bridge && npx vitest run src/sessionArtifacts.test.ts
cd packages/acp-bridge && npx vitest run src/bridgeClient.test.ts
```
### 13.4 Phase C-2 serve

対象範囲：

- `/capabilities` に `session_artifacts` が含まれる。
- `GET /session/:id/artifacts` は空のリストを返す。
- artifacts がある場合は envelope を返す。
- envelope はホストマシンの絶対 `workspaceCwd` を返さない。
- 不明な session の場合は既存のエラーを返す。
- workspace artifact の GET TTL refresh 時にベストエフォートで stat を実行し、欠落しているファイルは `status: 'missing'` を、ファイルが復旧した場合は `status: 'available'` を返す。
- GET TTL refresh では workspace containment / symlink realpath check を再実行する。symlink escape の場合は `missing` を返す。
- GET status refresh では `artifact_changed` を発行しない。managed / URL artifact に対してはローカル stat を実行しない。
- GET では status cache / TTL を使用し、ホットリードのたびにすべての artifacts に対して同期 stat を実行しないようにする。

コマンド：

```bash
cd packages/cli && npx vitest run src/serve/server.test.ts
```

### 13.5 Phase C-3 SDK

対象範囲：

- `listSessionArtifacts()` の route が正しい。
- `artifact_changed` の既知のイベントのナローイング。イベントの artifact は完全な `DaemonSessionArtifact` である。
- public index に新しい型をエクスポートする。
- public response の enum 型は open union であり、client は未知の kind/status/source/storage に対してフォールバックを持つ。
- SDK の singular add は bridge の plural add をラップし、完全な mutation result を返す。SDK の remove は DELETE route を呼び出す。

コマンド：

```bash
cd packages/sdk-typescript && npx vitest run src/daemon/DaemonClient.test.ts
cd packages/sdk-typescript && npx vitest run src/daemon/events.test.ts
```

### 13.6 Phase D/E/F explicit registration tests

`record_artifact`：

- title / workspacePath / managedId / url を検証する。
- `workspacePath + managedId + url` が空であることを許可しない。また、通常の入力時に複数の primary locator を同時に渡すことも許可しない。
- `storage: 'published'` を許可しない。
- サポートされていない URL scheme を許可しない。
- URL の userinfo は拒否またはクリアされる。
- `ToolResult.artifacts` を返す。
- `llmContent` は構造化された登録結果を返す。各 tool call では 1 つの artifact のみを登録する。

hook artifacts：

- `HookOutput.hookSpecificOutput.artifacts` は `createHookOutput()` および `toolHookTriggers.ts` を介して `PostToolUseHookResult` / `PostToolBatchHookResult` に渡される。
- `hookAggregator.ts` の `mergeWithOrLogic()` で複数の hook artifacts を結合する。
- `coreToolScheduler.ts` と ACP `Session.ts` の 2 つのパスの両方で PostToolUse artifacts を伝播できる。
- 2 つの PostToolUse パスは共有の hook artifact collection helper を再利用する。
- ACP main session は PostToolBatch artifacts を宣言しない。今後実際の callsite が追加される場合は、単体テストでカバーする必要がある。
- PostToolUse / PostToolUseFailure hook artifacts は、成功した tool result の `_meta.artifacts` に依存せず、`qwen/notify/session/artifact-event` extNotification を介して個別に bridge に渡される。
- batch notification を持つランタイムは、`qwen/notify/session/artifact-event` を介して store に書き込むことができる。
- hook artifacts は他のエントリーポイントと同じ validation を経る。
- hook payload の `source` は bridge によって transport context に基づいて派生され、tool source や trusted publisher を偽装することはできない。
- ツールが失敗した場合でも、hook が返す error/dashboard artifact は引き続き store に取り込まれる。

client POST / SDK add：

- `POST /session/:id/artifacts` で upsert が成功する。
- `POST` は `DaemonSessionArtifactMutationResult` を返す。これには created/updated および eviction による removed changes が含まれる。
- `POST` で upsert + eviction がトリガーされた場合、各 `changes[]` 項目が `artifact_changed` SSE event として同期的に発行され、created/updated が removed よりも先に発行されることを検証する。
- `POST` は未認証または mutation token がない場合に拒否される。
- `POST` は workspace 外の path、path traversal、symlink escape に対して 400 を返す。
- `POST` は `storage: 'published'`、複数の primary locator、metadata の上限超過に対して構造化されたエラー envelope を返す。
- `POST` は bridge の `addSessionArtifacts()` という単一のパスを介して書き込まれる。
- `DaemonClient.addSessionArtifact()` の body が正しい。
- `DELETE /session/:id/artifacts/:artifactId` がヒットした場合、`reason: 'explicit'` の removed change を返し、対応する SSE event を発行するが、基盤となるファイルや URL は削除しない。
- `DELETE /session/:id/artifacts/:artifactId` がヒットしなかった場合、冪等に空の `changes[]` を返し、SSE event は発行しない。

### 13.7 クロスパッケージ統合テスト

完全なエンドツーエンドのパスを対象範囲とする：

1. tool が `ToolResult.artifacts` を返す。
2. `ToolCallEmitter` が `_meta.artifacts` に書き込む。
3. `BridgeClient` が event から artifacts を抽出する。
4. `SessionArtifactStore` が validate / normalize / upsert を実行する。
5. SSE が `artifact_changed` を送信する。
6. `GET /session/:id/artifacts` が同じ artifact を返す。
7. Client が切断から再接続後に snapshot を再取得し、現在のメモリ状態を復元できる。
8. artifacts を上限近くまで埋めた後に新しい artifact を追加し、SSE に created と `reason: 'eviction'` の removed event が同時に含まれることをアサーションし、その後の GET ではトリミングされた状態のみが返される。

### 13.8 手動受け入れ

シナリオ A：ファイル成果物

1. ArtifactTool が `lineage.html` を公開する。
2. `GET /session/:id/artifacts` が `storage: 'published'` の html artifact を返す。
3. SSE で `artifact_changed` を受信する。

シナリオ B：通常のソースコード編集は成果物エリアに入らない

1. agent がソースコードファイルを変更する。
2. file change / diff が正常に表示される。
3. artifact list は変化しない。

シナリオ C：明示的なビジネスリンク成果物

1. skill がモデルに内部リソース詳細 URL の構築を要求する。
2. モデルが `record_artifact` を呼び出す。
3. 右側の成果物エリアに link artifact が表示される。

シナリオ D：hook 成果物

1. extension が PostToolUse hook を登録する。
2. hook が tool output に基づいて artifacts を返す。
3. 右側の成果物エリアに hook source artifact が表示される。

シナリオ E：通常のリンクは成果物エリアに入らない

1. assistant が markdown link を返信する。
2. artifact list は変化しない。

## 14. 受け入れ基準

V1 の完全な機能実装後、少なくとも以下を満たす必要がある：

- `session_artifacts` feature が存在する。
- `GET /session/:id/artifacts` が利用可能である。
- `artifact_changed` event が利用可能である。
- `ArtifactTool` が published html artifact を生成する。
- `ToolResult.artifacts` が daemon artifact store に取り込まれる。
- `record_artifact` が link / workspace artifact を登録でき、feature-gated または opt-in で登録される。
- hook が `hookSpecificOutput.artifacts` を介して artifact を注入でき、複数の hook artifacts が結合される。
- client が `POST /session/:id/artifacts` を介して artifact を注入できる。
- client が `DELETE /session/:id/artifacts/:artifactId` を介して誤って登録された artifact を明示的に削除できる。
- 通常の `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` は自動的に artifact list に入らない。
- 通常の assistant テキスト URL は artifact list に入らない。
- SDK が artifacts を list/add/remove でき、`artifact_changed` を識別できる。
- SDK remove が、すでに存在しない artifact に対する冪等な空の結果に正しくマッピングされる。
- workspacePath / URL / metadata のセキュリティ境界に対する単体テストが存在する。
- managedId normalization の単体テストが存在する。
- 同一 identity の first-writer-wins、published upgrade、metadata controlled enrichment、soft reservation eviction の単体テストが存在する。
- eviction は client に 1 件ずつ削除を通知する。
- validation failure には warning log / diagnostics が出力される。
- hook / client / record_artifact の 3 つのエントリーポイントが同じ validation を経る。
- `npm run build && npm run typecheck` がパスする。

## 15. 推奨される実装順序

V1 の内部では、以下の順序で実装することを推奨する。これはエンジニアリングのスケジュールであり、機能の分割ではない：

1. `ToolArtifact` + `ToolResult.artifacts?`
2. `ArtifactTool` structured artifacts
3. `ToolCallEmitter._meta.artifacts`
4. `Session.runTool()` は `toolResult.artifacts` のみを収集する
5. `SessionArtifactStore` validation / normalize / enrichment / upsert
6. BridgeClient が `_meta.artifacts` を消費する
7. `GET /session/:id/artifacts`
8. SDK list/event 型
9. `RecordArtifactTool`
10. hook output artifacts
11. `qwen/notify/session/artifact-event`
12. `POST /session/:id/artifacts`
13. SDK addArtifact
14. managed / published storage 参照の補完
15. プロトコルドキュメントと tests

## 16. 今後のロードマップ

Phase 2：履歴の復元

- artifacts を chat recording metadata に書き込む。
- HistoryReplayer が artifacts をリプレイする。
- `session/load` 後に artifact list を復元できる。

Phase 3：詳細とプレビュー

- `GET /session/:id/artifacts/:artifactId`
- プレビュー metadata。
- 画像/PDF/HTML のプレビュー戦略。

Phase 4：安全な動的プレビュー

- 独立した sandbox origin。
- iframe sandbox。
- HTML/React artifact shim。

Phase 5：長期ストレージ

- OSS/MinIO。
- retention policy。
- pin/delete/version history。

## 17. まとめ

Link は artifact になり得るが、明示的に登録する必要がある。右側の成果物エリアは、すべてのテキストリンクを自動的に収集すべきではない。

V1 は外部に対して完全な機能であり、内部的には統一された store と 4 種類のエントリーポイントで構成されている：

1. **ツールエントリーポイント**：`ToolResult.artifacts` / `ArtifactTool` が構造化された artifact metadata を生成する。
2. **モデル/skill エントリーポイント**：`record_artifact` ツール。
3. **hook/extension エントリーポイント**：`hookSpecificOutput.artifacts`。
4. **client エントリーポイント**：`POST /session/:id/artifacts`。

これらのエントリーポイントは最終的にすべて同じ `SessionArtifactStore` に取り込まれ、同じ `GET /session/:id/artifacts` を介してクエリされ、同じ `artifact_changed` SSE event を介して UI が更新される。これにより、ビジネスリンク、ファイル、HTML、画像、動画などの成果物をカバーしつつ、プロトコルをシンプルに保ち、出所を明確にし、境界を制御可能にする。最も重要な境界は、Artifacts は宣言された session outputs であり、すべての通常のファイル編集や通常のリンクの集合ではないということである。