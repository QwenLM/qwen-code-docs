# DaemonTransport 抽象化レイヤー

> 対象ブランチ: `main`。著者: arnoo.gao。日付: 2026-06-12。ステータス: **Design v4 — レビュー中**。
> リポジトリワークフローのデザインファースト原則: このドキュメントは実装PRより先にマージされます。

---

## 0. TL;DR

`DaemonClient` は REST+SSE をハードコードしています。ACP WebSocket を使いたいサードパーティはプロバイダースタック（約8ファイル）をフォークする必要があります。本提案では `fetch` + `subscribeEvents` メソッドを持つ **`DaemonTransport` インターフェース**を追加し、自動検出とランタイムフォールバックを実現することで、**破壊的変更ゼロ**でトランスポートをプラグイン可能にします。

**変更の総量: 約1300行**（単一の実装PR）。既存のコンシューマーは変更不要 — `new DaemonClient({ baseUrl, token })` は現在の動作と同じです。

---

## 1. 背景

### 1.1 現在のアーキテクチャ

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← ハードコード
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67のパブリックメソッドがあり、それぞれ REST の URL を構築して HTTP ステータスコードで分岐しています。`fetch` は `DaemonClientOptions.fetch` 経由で注入可能ですが、`subscribeEvents` にはインラインの SSE 固有ロジック（content-type チェック、SSE パース、接続フェーズのタイムアウト）があり、fetch の注入だけでは交換できません。

### 1.2 サードパーティにとっての問題

サードパーティ（例: `agent-web`）が REST+SSE の代わりに WebSocket を使う `AcpSessionProvider` を構築しようとする場合:

- **`DaemonSessionProvider` を置き換えた場合**: `DaemonStoreContext` を読むコンポーネント（例: TerminalView）がコンテキストを失いクラッシュする。
- **両プロバイダーを共存させた場合**: イベントソースが2つ、ストアが2つとなり、同期がずれる。
- **SDK ストアにイベントを注入した場合**: `DaemonSessionProvider` も内部で SSE を購読しているためイベントが重複する。

**根本原因**: `DaemonClient` の `subscribeEvents` が SSE にハードコードされているため、トランスポートを変えるにはプロバイダーの置き換えが必要。

### 1.3 目標

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → URL+verb を WS 上の JSON-RPC にマッピング
  └─ transport.subscribeEvents → WS 通知を demux → DaemonEvent
```

プロバイダーは1つ、ストアは1つ、トランスポートは内部実装の詳細。サードパーティは `DaemonClient` に `transport` を渡すだけで、他はすべて変わらず動作します。

---

## 2. 設計

### 2.1 インターフェース

```typescript
interface DaemonTransportFetchOptions {
  timeout?: number; // 0 = タイムアウトなし。undefined = トランスポートのデフォルト。
}

interface DaemonTransportSubscribeOptions {
  lastEventId?: number;
  maxQueued?: number;
  signal?: AbortSignal;
  connectTimeoutMs?: number;
}

interface DaemonTransport {
  /**
   * リクエストを送信して Response を返す。
   *
   * 契約:
   * - Response は .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel() をサポートしなければならない
   * - .status は正確な HTTP ステータスコードでなければならない
   *   (200, 201, 202, 204, 404 など)
   * - エラーボディはデーモンの構造化された形式を保持しなければならない
   * - 事前セットアップなしに呼び出し可能; トランスポートは内部で初期化を処理する
   *   (lazy-init / init-once 遅延パターン)
   * - 接続が切れた場合は DaemonTransportClosedError をスロー
   * - init.signal がアボートされた場合: プロンプトリクエストでは、トランスポートは
   *   進行中のプロンプトをワイヤー上でキャンセルしなければならない（WS: session/cancel
   *   RPC を送信; HTTP: fetch をアボート）。通常リクエストでは、アボートは
   *   副作用なしに保留中のリクエストのみをリジェクト/キャンセルする。
   *   保留中のレスポンスは AbortError でリジェクトされる。
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * セッションイベントを購読する。
   *
   * 契約:
   * - id を持つイベントは単調増加する整数 id を持たなければならない; 合成/終端
   *   フレーム（例: stream_error）は id を省略してもよい（DaemonEvent.id はオプション）
   * - すべてのイベントタイプ（セッション + ワークスペース）を1つのストリームで配信しなければならない
   * - signal のアボートはこのジェネレーターのみを停止し、接続は停止してはならない
   * - 接続が切れた場合、すべての保留中のジェネレーターは
   *   DaemonTransportClosedError をスローしなければならない（トランスポートはジェネレーター参照を保持）
   * - connectTimeoutMs は接続フェーズのみに適用しなければならない
   * - トランスポートは lastEventId リプレイをサポートするかどうかを宣言しなければならない;
   *   サポートしない場合、コンシューマーは再接続時に session/load でフル再同期しなければならない
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** 網羅的なスイッチングのためのトランスポート識別子。 */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** このトランスポートが再接続時の Last-Event-ID ベースのリプレイをサポートするか。
   *  false の場合、コンシューマーはフル再同期に session/load を使わなければならない。 */
  readonly supportsReplay: boolean;

  /** 接続切断または dispose() の後は false。 */
  readonly connected: boolean;

  /** 冪等なティアダウン。 */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 なぜ fetch だけでなく2つのメソッド（fetch + subscribeEvents）なのか

`subscribeEvents` はトランスポートごとに根本的に異なるワイヤーセマンティクスを持ちます:

| トランスポート | ワイヤーメカニズム                                                         |
| -------------- | -------------------------------------------------------------------------- |
| REST           | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent`        |
| ACP HTTP       | `GET /acp`（セッションスコープの SSE）→ JSON-RPC 通知のアンラップ          |
| ACP WS         | sessionId によって共有ソケットから通知を demux                             |

これらを fetch 形式に無理やり押し込むには SSE の再エンコード/デコード（WS → 疑似 SSE テキスト → `parseSseStream` → DaemonEvent）が必要で、無駄が多く壊れやすいです。

他の66のメソッドはすべて `fetch` を通じて動作します。トランスポートに関わらずリクエスト→レスポンスのセマンティクスに従うためです。

### 2.3 なぜメソッドディスパッチではなく fetch レベルなのか

DaemonClient の67のメソッドにはメソッドごとの HTTP 分岐が含まれています:

- `prompt()`: 202 と 200 のステータスチェック
- `deleteWorkspaceAgent()`: 204 と 404（ボディ検査あり）
- `respondToPermission()`: 200 と 404（競合状態の検出）
- 6つのメソッドが `fetchWithTimeout` をバイパスして `_fetch` を直接呼び出す

メソッドディスパッチインターフェース（`request<T>(method, params)`）は、すべてのロジックを各トランスポートで重複させる必要があります。fetch レベルにすれば DaemonClient は変更不要です。

### 2.4 DaemonClient の変更（約40行）

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // 維持
  fetchTimeoutMs?: number; // 維持
  transport?: DaemonTransport; // 新規 — オプションのオーバーライド
}
```

内部変更:

- コンストラクター: `this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout`: `this.transport.fetch(url, init, { timeout })` に委譲
- 直接 `this._fetch` を使う6箇所（prompt, promptNonBlocking, recapSession,
  btwSession, shellCommand, subscribeEvents）: `this.transport.fetch(url, init, { timeout: 0 })` に置き換え
- `subscribeEvents`: `this.transport.type` の網羅的スイッチ:
  - `'rest'`: `this.transport.subscribeEvents(sessionId, opts)` に委譲
  - デフォルト: 同様に委譲（各トランスポートが自身のワイヤー形式を処理）
- `private _fetch` フィールドを削除（トランスポートに置き換え）

### 2.5 プロバイダーの注入ポイント

`DaemonWorkspaceProvider` と `DaemonSessionProvider` はどちらも内部で `DaemonClient` を構築します。サードパーティがプロバイダーをバイパスせずにトランスポートを注入できるようにするため:

```typescript
// DaemonWorkspaceProvider — オプションの transport プロップを追加
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // 新規 — DaemonClient に転送
  // ...既存のプロップ
}

// DaemonSessionProvider — ワークスペースコンテキストから継承
// transport プロップは不要; ワークスペースコンテキストから読み取る
```

`transport` が指定された場合、プロバイダーはそれを `DaemonClient` に渡します:

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

省略した場合: 現在の動作（REST+SSE）。プロバイダーの変更は約5行。

### 2.5 RestSseTransport（約80行）

`globalThis.fetch` をラップし、現在の SSE ロジックを `DaemonClient.subscribeEvents` から抽出:

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE は Last-Event-ID をサポート
  readonly connected = true; // REST はステートレス

  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly _fetch: typeof globalThis.fetch,
  ) {}

  fetch(url, init, opts?) {
    return this._fetch(url, init);
  }

  async *subscribeEvents(sessionId, opts) {
    // 現在の DaemonClient.subscribeEvents ロジックをここに移動:
    // - this.baseUrl + sessionId から URL を構築
    // - this.token から Authorization ヘッダーを設定
    // - opts.connectTimeoutMs から接続フェーズのタイムアウト
    // - fetch → content-type を検証 → parseSseStream → yield
  }

  dispose() {} // ノーオペレーション
}
```

### 2.6 ACP トランスポートの内部実装

**AcpWsTransport**（約400〜600行）:

- 遅延初期化: 最初の `fetch` 呼び出しで WS を開き `initialize` を送信
- URL→JSON-RPC マッピングテーブル: `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- リクエストマルチプレクサー: 保留中のリクエスト用 `Map<id, {resolve, reject}>`
- `subscribeEvents`: sessionId によって共有通知ストリームをフィルタリング
- `connected`: WS の readyState を追跡
- `supportsReplay`: false（WS に Last-Event-ID はない; コンシューマーは `session/load` を使用）
- 正しい `.status`/`.json()`/`.text()` を持つ合成 `Response` オブジェクトを生成

**AcpHttpTransport**（約800〜1000行）:

- 遅延初期化: 最初の `fetch` 呼び出しで `POST /acp {initialize}` を送信
- 接続スコープとセッションスコープの SSE ストリームを内部で管理
- 同じ URL→JSON-RPC マッピング + リクエスト相関
- `supportsReplay`: true（セッション SSE は Last-Event-ID をサポート）

### 2.7 トランスポート自動検出

サーバーは `GET /capabilities` でサポートされているトランスポートをアドバタイズします:

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...既存の capabilities フィールド...
}
```

SDK は一度だけ実行するスタティックファクトリーを提供します:

```typescript
// React レンダリング前に一度だけプローブし、セッション中は切り替えない
const transport = await DaemonTransport.negotiate(baseUrl, token);
// 最適なものを返す: acp-ws > acp-http > rest（フォールバック）
```

実装:

1. `GET /capabilities` → `transports` 配列を読み取る
2. リストに `acp-ws` があれば → WS アップグレードを試行; 成功すれば `AcpWsTransport` を返す
3. WS が失敗またはリストにない場合 → `acp-http` を試行; 成功すれば `AcpHttpTransport` を返す
4. フォールバック → `RestSseTransport`

既存の API への影響はありません: `GET /capabilities` は新しいフィールドを追加するだけ（追加的変更）で、既存のコンシューマーは未知のフィールドを無視します。

### 2.8 ランタイムフォールバック（WS → 切断時の REST）

非 REST トランスポートがセッション中に切断された場合:

```
AcpWsTransport (connected=true)
  │
  ├── WS が切断（ネットワーク、サーバー再起動、アイドルタイムアウト）
  │
  ├── connected = false
  ├── 保留中のすべての fetch() 呼び出し → DaemonTransportClosedError でリジェクト
  ├── すべての subscribeEvents ジェネレーター → DaemonTransportClosedError をスロー
  │
  └── コンシューマー（Provider / サードパーティ）が切断を検出:
        1. 新しい RestSseTransport を作成（デーモンが起動していれば必ず動作）
        2. 新しい DaemonClient({ transport: newTransport }) を作成
        3. アクティブな各セッションに対して: session/load で再アタッチ
        4. イベント購読を再開
```

**重要な制約**: ランタイムフォールバックは**コンシューマー主導であり、トランスポート内部ではありません**。トランスポートはプロトコルをサイレントに切り替えるのではなく、明示的に失敗し（`DaemonTransportClosedError`）、コンシューマーが再構築するかどうかを決定します。

理由:

- WS のティアダウンはサーバー側で所有するすべてのセッションを破棄します（`registry.delete` → `conn.destroy`）。サイレントな切り替えはこのデータ損失を隠蔽します。
- `session/load` は既存のブリッジセッションに再アタッチします（トランスクリプトは保持されます）が、進行中のプロンプトはアボートされます。コンシューマーはこれを明示的に処理する必要があります（リトライするか、ユーザーに通知する）。
- トランスポート間の `Last-Event-ID` レジュームはまだありません（フェーズ4）。切断から再接続の間のイベントは失われる可能性があります。コンシューマーは `session/load` でフル状態再同期をリクエストする必要があります（履歴をリプレイします）。

**AutoReconnectTransport**（約150行、オプションのラッパー）:

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // 内部トランスポートからの DaemonTransportClosedError 発生時:
  // 1. 優先トランスポートの再作成を試みる
  // 2. 優先が失敗した場合、REST にフォールバック
  // 3. 接続を再初期化
  // 呼び出し元は依然として session/load が必要 — このラッパーは
  // トランスポートレベルの再接続のみを処理し、セッションレベルは処理しない。
}
```

このラッパーはオプトインです。自動再接続を必要としない既存のコンシューマーは `DaemonTransportClosedError` をキャッチして自分で処理できます。

**既存機能への影響**: ゼロ。すべての自動検出とフォールバックのコードは追加的でオプトインです。`transport` なしの `new DaemonClient({ baseUrl, token })` = 現在の REST 動作、自動検出なし、フォールバックロジックなし。

---

## 3. 破壊的変更の監査

### 結論: 破壊的変更ゼロ

| パブリック API                         | 変更内容                                 | 破壊的? |
| -------------------------------------- | ---------------------------------------- | :-----: |
| `new DaemonClient({ baseUrl, token })` | 変更なし                                 |   ❌    |
| `DaemonClientOptions.*`                | すべて維持、`transport` を追加           |   ❌    |
| `DaemonHttpError`                      | 変更なし                                 |   ❌    |
| `DaemonSessionClient`                  | 変更ゼロ（DaemonClient に委譲）          |   ❌    |
| すべての型エクスポート（100以上）       | 変更なし                                 |   ❌    |

### コンシューマーごとの影響

| コンシューマー                | 影響                                            |
| ----------------------------- | ----------------------------------------------- |
| webui（25ファイル）            | コード変更ゼロ                                   |
| web-shell（4ファイル）         | コード変更ゼロ                                   |
| vscode-ide-companion（1ファイル） | コード変更ゼロ                               |
| サードパーティ                | REST はゼロ; ACP は `transport` を渡すだけ      |

---

## 4. 設計上の決定

| 決定事項                                         | 理由                                                                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` をトランスポートに、fetch だけでなく | fetch 経由の SSE 再エンコードは無駄が多く壊れやすい                                                                                                                           |
| トランスポートに `connected: boolean`             | プロバイダーの再接続ループが「トランスポートが死んでいる」と「一時的な 500」を区別する必要がある                                                                                 |
| 遅延初期化（明示的な `connect()` なし）           | DaemonClient の構築を同期的に保つ; デフォルトの `new RestSseTransport()` は初期化不要                                                                                           |
| 自動検出は一度だけ、セッション中は行わない        | `negotiate()` は起動時に一度だけプローブ; ランタイムフォールバックはサイレントな内部切り替えではなく `DaemonTransportClosedError` 経由のコンシューマー主導                       |
| エラー分類の前提条件なし                          | ACP トランスポートはエラーを内部で HTTP 相当のステータスコードにマッピングする; `DaemonHttpError` はそのまま動作                                                                |
| プロバイダーに `transport` プロップ               | `DaemonWorkspaceProvider` にオプションの `transport` プロップを追加（約5行）し、`DaemonClient` コンストラクターに転送。サードパーティはこのプロップを設定; 省略 = 現在の REST 動作 |

---

## 5. 検討した代替案

### 5.1 カスタム fetch インジェクション（新しいインターフェースなし）

既存の `DaemonClientOptions.fetch` 経由で WS ベースの `fetch` を渡す。

**却下**: `subscribeEvents` は `content-type: text/event-stream` を検証し `parseSseStream` を使用します。カスタム fetch は WS フレームを SSE テキストとして再エンコードする必要があり、その後 SDK がデコードし直す — 無駄なエンコード/デコードのラウンドトリップ。また、`capabilities()` と `initialize` のレスポンス形式が異なり、形式マッピングレイヤーが必要になります。

### 5.2 完全な正式インターフェース（4つの PR、約2750行）

エラー分類 → インターフェース → AcpHttp → AcpWs を別々の PR として。

**却下**: 過剰設計。エラー分類は不要（ACP トランスポートは HTTP 相当のステータスコードにマッピングできる）。別々の PR は、単一の凝集した抽象化に対するレビューのコンテキストスイッチコストを増加させます。

### 5.3 BridgeContext を使ったデュアルプロバイダー

並列 `AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext`。

**却下**: ストアの同期ずれを引き起こし、約8ファイルが必要で、SDK の変更なしには動作できません。

---

## 6. 実装計画（単一 PR）

すべての変更を1つの PR でリリース。推定合計約1300行。

| ファイル                                                              | 変更内容                                                                 | 行数    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`           | インターフェース + 型 + `DaemonTransportClosedError` + `negotiate()` ファクトリー | ~110    |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`          | `globalThis.fetch` のラップ + DaemonClient から抽出した SSE ロジック     | ~80     |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`            | WS マルチプレクサー + URL→JSON-RPC マッピング + リクエスト相関          | ~400    |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`          | POST /acp + 接続/セッション SSE 管理                                     | ~300    |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`      | JSON-RPC 通知 → DaemonEvent マッピング                                   | ~150    |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`    | オプトインラッパー: 再接続 + フォールバック                               | ~150    |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`              | コンストラクター + 6箇所の `_fetch` + subscribeEvents の書き直し         | 正味約40 |
| `packages/sdk-typescript/src/daemon/index.ts`                     | 新しい型のエクスポート                                                   | ~10     |
| `packages/cli/src/serve/server.ts`                                | `GET /capabilities` に `transports` フィールドを追加                    | ~5      |
| `packages/sdk-typescript/src/daemon/types.ts`                     | `DaemonCapabilities` 型に `transports` を追加                           | ~3      |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx` | オプションの `transport` プロップを追加し `DaemonClient` に転送          | ~5      |
| テスト                                                             | トランスポートのユニットテスト + 統合テスト                              | ~200    |

**後方互換性**: `transport` なしの `new DaemonClient({ baseUrl, token })` = 同一の REST+SSE 動作。既存のすべてのテストは変更なしで通過します。

---

## 7. 検証

1. **後方互換**: sdk-typescript と webui で `npm run test` を実行 — テスト変更は不要。`new DaemonClient({ baseUrl, token })` = 同一の動作。
2. **RestSseTransport の抽出**: 既存のテストスイートでビット単位で同等の SSE 動作を確認。
3. **AcpWsTransport**: 実際のデーモンに WS で接続する統合テスト。確認事項:
   - `subscribeEvents` が REST SSE と同じ `DaemonEvent` の形式を yield する
   - prompt の 202/200 分岐が合成 Response で動作する
   - permission の投票が正しくラウンドトリップする
   - WS 切断時に `connected` が `false` に遷移する
   - prompt の abort シグナル → WS が session/cancel RPC を送信する
4. **AcpHttpTransport**: WS と同じ検証を HTTP+SSE で実施。
5. **自動検出**: `negotiate()` が最適なトランスポートを返し、WS 失敗時に REST にフォールバックする。
6. **ランタイムフォールバック**: `AutoReconnectTransport` が `DaemonTransportClosedError` をキャッチし、トランスポートを再構築し、コンシューマーが再同期のために `session/load` を呼び出す。
7. **プロバイダー**: `transport` プロップを持つ `DaemonWorkspaceProvider` — ChatView と TerminalView の両方が単一のストアから読み取る。
8. **エンドツーエンド**: サードパーティが `transport={new AcpWsTransport(url, token)}` を `DaemonWorkspaceProvider` に渡す。すべての SDK フックとトランスクリプトストアは変更なしで動作する。

---

## 8. リスク

| リスク                                     | 軽減策                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| URL→JSON-RPC マッピングテーブルのメンテナンス | テーブルはトランスポートと同じ場所に置く; デーモンのルート変更にはトランスポートの更新が必要                           |
| ACP WS の合成 Response の忠実度             | `syntheticResponse(status, json)` ヘルパーを提供; 契約を文書化（`.json()`, `.text()`, `.status`, `.body?.cancel()`） |
| WS の `DaemonEvent.id` の単調性             | ACP サーバーの JSON-RPC 通知はイベント id を持ち、トランスポートが直接公開する                                          |
| WS の Prompt 202 と 200                     | トランスポートは JSON-RPC レスポンス → 200 とレスポンスボディにマッピング（ブロッキングパス）; イベントは `subscribeEvents` 経由で流れ続ける |
| WS 接続切断の検出                           | `connected: boolean` + `fetch` からスローされる `DaemonTransportClosedError`                                            |
