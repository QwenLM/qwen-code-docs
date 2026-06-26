# DaemonTransport 抽象化レイヤー

> 対象ブランチ: `main`. 作成者: arnoo.gao. 日付: 2026-06-12. ステータス: **Design v4 — レビュー中**.
> リポジトリワークフローはDesign First: このドキュメントは実装PRより先にマージされます。

---

## 0. TL;DR

`DaemonClient` は REST+SSE をハードコードしています。ACP WebSocket を利用したいサードパーティは、プロバイダスタック（約8ファイル）をフォークする必要があります。本提案では、**`fetch` + `subscribeEvents` メソッド**を持つ **`DaemonTransport` インターフェース**を追加し、自動検出とランタイムフォールバックを備えることで、**破壊的変更ゼロ**でプラグ可能なトランスポートを実現します。

**変更総量: 約1300行**、単一の実装PR内。既存のコンシューマは影響を受けません。`new DaemonClient({ baseUrl, token })` は従来通りの動作です。

---

## 1. 背景

### 1.1 現在のアーキテクチャ

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← ハードコード
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67のパブリックメソッドがあり、それぞれがREST URLを構築し、HTTPステータスコードで分岐しています。`fetch` は `DaemonClientOptions.fetch` 経由で注入可能ですが、`subscribeEvents` はインラインでSSE固有のロジック（コンテンツタイプチェック、SSEパース、接続フェーズのタイムアウト）を持ち、fetch注入だけでは入れ替えられません。

### 1.2 サードパーティにとっての問題

サードパーティ（例: `agent-web`）が `AcpSessionProvider` を構築して REST+SSE の代わりに WebSocket を使いたい場合:

- **`DaemonSessionProvider` を置き換える**場合: `DaemonStoreContext` を読み取るコンポーネント（例: TerminalView）はコンテキストを失いクラッシュします。
- **両方のプロバイダを維持する**場合: 2つのイベントソース、2つのストア、同期が取れなくなります。
- **SDKストアにイベントを注入する**場合: `DaemonSessionProvider` も内部的にSSEを購読するため、重複イベントが発生します。

**根本原因**: トランスポートを変更するにはプロバイダを置き換える必要がある。なぜなら `DaemonClient` の `subscribeEvents` がSSEにハードコードされているからです。

### 1.3 目標

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → URL+動詞をJSON-RPC over WSにマッピング
  └─ transport.subscribeEvents → WS通知をデマルチプレクス → DaemonEvent
```

単一のプロバイダ、単一のストア、トランスポートは内部の詳細になります。サードパーティは `transport` を `DaemonClient` に渡すだけで、他のすべては変更なく動作します。

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
   * リクエストを送信し、Response を返します。
   *
   * 契約:
   * - Response は .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel() をサポートする必要があります
   * - .status は正確なHTTPステータスコード（200, 201, 202, 204, 404 など）でなければなりません
   * - エラーボディはデーモンの構造化された形状を保持する必要があります
   * - 事前設定なしで呼び出し可能; トランスポートが内部的に初期化を処理します
   *   （遅延初期化 / 一度だけ初期化の遅延パターン）
   * - 接続が切断された場合は DaemonTransportClosedError をスローします
   * - init.signal がアボートされた場合: プロンプトリクエストの場合、トランスポートは
   *   進行中のプロンプトをワイヤ上でキャンセルする必要があります（WS: session/cancel
   *   RPC を送信; HTTP: fetchをアボート）。通常のリクエストの場合は、保留中の
   *   リクエストを拒否/キャンセルするだけで、副作用はありません。
   *   保留中のレスポンスは AbortError で拒否されます。
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * セッションイベントを購読します。
   *
   * 契約:
   * - id を持つイベントは単調増加する整数IDである必要があります。合成/終端
   *   フレーム（例: stream_error）は id を省略しても構いません（DaemonEvent.id はオプション）
   * - すべてのイベントタイプ（session + workspace）を1つのストリームで配信する必要があります
   * - signal をアボートすると、このジェネレータだけを停止し、接続は停止しません
   * - 接続が切断されると、保留中のすべてのジェネレータは
   *   DaemonTransportClosedError をスローする必要があります（トランスポートはジェネレータ参照を管理）
   * - connectTimeoutMs は接続フェーズのみに適用する必要があります
   * - トランスポートは、lastEventId によるリプレイをサポートするかどうかを宣言する必要があります。
   *   サポートしない場合、コンシューマは再接続時の完全な再同期に session/load を使用する必要があります。
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** 排他的な切り替えのためのトランスポート識別子。 */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** 再接続時に Last-Event-ID ベースのリプレイをサポートするかどうか。
   *  false の場合、コンシューマは完全な再同期に session/load を使用する必要があります。 */
  readonly supportsReplay: boolean;

  /** 接続断または dispose() 後は false。 */
  readonly connected: boolean;

  /** 冪等な後片付け。 */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 なぜ2つのメソッド（fetch + subscribeEvents）なのか、fetchだけではないのか

`subscribeEvents` はトランスポートごとに根本的に異なるワイヤセマンティクスを持ちます:

| トランスポート | ワイヤ機構                                                             |
| -------------- | ---------------------------------------------------------------------- |
| REST           | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent`    |
| ACP HTTP       | `GET /acp`（セッションスコープのSSE）→ JSON-RPC通知アンラップ           |
| ACP WS         | 共有ソケットから sessionId で通知をデマルチプレクス                       |

これらを fetch の形に押し込むには、SSEの再エンコード/デコード（WS → 偽のSSEテキスト → `parseSseStream` → DaemonEvent）が必要になり、非効率的で脆弱です。

他の66のメソッドは `fetch` を通じて動作します。なぜなら、トランスポートに関係なく、リクエスト→レスポンスのセマンティクスに従うからです。

### 2.3 なぜメソッドディスパッチではなくfetchレベルなのか

DaemonClient の67のメソッドには、メソッドごとのHTTP分岐が含まれています:

- `prompt()`: 202 vs 200 のステータスチェック
- `deleteWorkspaceAgent()`: 204 vs 404（ボディ検査あり）
- `respondToPermission()`: 200 vs 404（競合検出用）
- 6つのメソッドは `fetchWithTimeout` をバイパスし、`_fetch` を直接呼び出す

メソッドディスパッチインターフェース（`request<T>(method, params)`）では、このロジックすべてを各トランスポートで複製する必要があります。fetchレベルを維持することで、DaemonClient は変更されません。

### 2.4 DaemonClient の変更点（約40行）

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // 維持
  fetchTimeoutMs?: number; // 維持
  transport?: DaemonTransport; // 新規 — オプションのオーバーライド
}
```

内部の変更:

- コンストラクタ: `this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout`: `this.transport.fetch(url, init, { timeout })` に委譲
- 6つの直接の `this._fetch` サイト（prompt, promptNonBlocking, recapSession, btwSession, shellCommand, subscribeEvents）: `this.transport.fetch(url, init, { timeout: 0 })` に置き換え
- `subscribeEvents`: `this.transport.type` の排他的スイッチ:
  - `'rest'`: `this.transport.subscribeEvents(sessionId, opts)` に委譲
  - デフォルト: 同じ委譲（各トランスポートが独自のワイヤ形式を処理）
- `private _fetch` フィールドを削除（transport に置き換え）

### 2.5 プロバイダ注入ポイント

`DaemonWorkspaceProvider` と `DaemonSessionProvider` は両方とも内部で `DaemonClient` を構築します。サードパーティがプロバイダをバイパスせずにトランスポートを注入できるようにするには:

```typescript
// DaemonWorkspaceProvider — オプションの transport プロパティを追加
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // 新規 — DaemonClient に転送
  // ...既存のプロパティ
}

// DaemonSessionProvider — ワークスペースコンテキストから継承
// transport プロパティは不要; ワークスペースコンテキストから読み取る
```

`transport` が指定された場合、プロバイダはそれを `DaemonClient` に渡します:

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

省略時は現在の動作（REST+SSE）。プロバイダの変更は約5行。

### 2.6 RestSseTransport（約80行）

`globalThis.fetch` をラップし、現在の `DaemonClient.subscribeEvents` からSSEロジックを抽出:

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSEは Last-Event-ID をサポート
  readonly connected = true; // RESTはステートレス

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
    // - this.baseUrl + sessionId からURLを構築
    // - this.token から Authorization ヘッダーを設定
    // - opts.connectTimeoutMs から接続フェーズのタイムアウト
    // - fetch → content-type 検証 → parseSseStream → yield
  }

  dispose() {} // 何もしない
}
```

### 2.7 ACP トランスポート内部

**AcpWsTransport**（約400-600行）:

- 遅延初期化: 最初の `fetch` 呼び出しで WS を開き、`initialize` を送信
- URL→JSON-RPC マッピングテーブル: `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- リクエストマルチプレクサ: `Map<id, {resolve, reject}>` （保留中のリクエスト用）
- `subscribeEvents`: 共有通知ストリームを sessionId でフィルタリング
- `connected`: WS の readyState を追跡
- `supportsReplay`: false（WSには Last-Event-ID がない; コンシューマは `session/load` を使用）
- 正しい `.status` / `.json()` / `.text()` を持つ `Response` オブジェクトを合成

**AcpHttpTransport**（約800-1000行）:

- 遅延初期化: 最初の `fetch` 呼び出しで `POST /acp {initialize}` を送信
- 接続スコープ + セッションスコープのSSEストリームを内部的に管理
- 同じ URL→JSON-RPC マッピング + リクエスト相関
- `supportsReplay`: true（セッションSSEは Last-Event-ID をサポート）

### 2.8 トランスポート自動検出

サーバーは `GET /capabilities` でサポートするトランスポートを通知:

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...既存の機能フィールド...
}
```

SDKは一回限りの静的ファクトリを提供:

```typescript
// Reactレンダリングの前に一度プローブし、セッション中は切り替えない
const transport = await DaemonTransport.negotiate(baseUrl, token);
// 利用可能な最適なものを返す: acp-ws > acp-http > rest（フォールバック）
```

実装:

1. `GET /capabilities` → `transports` 配列を読み取る
2. リストに `acp-ws` が含まれる場合 → WSアップグレードを試行; 成功したら `AcpWsTransport` を返す
3. WSが失敗するかリストにない場合 → `acp-http` を試行; 成功したら `AcpHttpTransport` を返す
4. フォールバック → `RestSseTransport`

既存のAPIに影響なし: `GET /capabilities` に新しいフィールドが追加される（追加的）。
既存のコンシューマは未知のフィールドを無視する。

### 2.9 ランタイムフォールバック（切断時のWS → REST）

非RESTトランスポートがセッション中に切断された場合:

```
AcpWsTransport (connected=true)
  │
  ├── WS切断（ネットワーク、サーバー再起動、アイドルタイムアウト）
  │
  ├── connected = false
  ├── 保留中のすべての fetch() 呼び出し → DaemonTransportClosedError で拒否
  ├── すべての subscribeEvents ジェネレータ → DaemonTransportClosedError をスロー
  │
  └── コンシューマ（プロバイダ / サードパーティ）が切断を検出:
        1. 新しい RestSseTransport を作成（デーモンが起動していれば動作が保証される）
        2. 新しい DaemonClient({ transport: newTransport }) を作成
        3. アクティブなセッションごとに: session/load で再接続
        4. イベント購読を再開
```

**重要な制約**: ランタイムフォールバックは**コンシューマ主導であり、トランスポート内部ではありません**。
トランスポートは静かにプロトコルを切り替えず、大きなエラー（`DaemonTransportClosedError`）を送出し、コンシューマが再構築するかどうかを決定します。

根拠:

- WSのティアダウンはサーバー側で所有するすべてのセッションを破壊します（`registry.delete` → `conn.destroy`）。静かな切り替えはこのデータ損失を隠蔽します。
- `session/load` は既存のブリッジセッションに再接続します（トランスクリプトは保持されます）が、進行中のプロンプトは中断されます。コンシューマはこれを明示的に処理する必要があります（再試行またはユーザーに表示）。
- まだトランスポート間の `Last-Event-ID` 再開はありません（フェーズ4）。切断から再接続までの間のイベントは失われる可能性があります。コンシューマは `session/load`（履歴をリプレイ）を介して完全な状態再同期をリクエストする必要があります。

**AutoReconnectTransport**（約150行、オプションのラッパー）:

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // 内部トランスポートからの DaemonTransportClosedError 時:
  // 1. 優先トランスポートの再作成を試みる
  // 2. 優先が失敗した場合は REST にフォールバック
  // 3. 接続を再初期化
  // 呼び出し元は引き続き session/load が必要 — このラッパーは
  // トランスポートレベルの再接続のみを処理し、セッションレベルは処理しない
}
```

このラッパーはオプトインです。自動再接続を望まない既存のコンシューマは、単に `DaemonTransportClosedError` をキャッチして自分で処理します。

**既存機能への影響**: ゼロ。自動検出とフォールバックコードはすべて追加的でオプトインです。`transport` なしの `new DaemonClient({ baseUrl, token })` = 現在のREST動作、自動検出なし、フォールバックロジックなし。

---

## 3. 破壊的変更の監査

### 判定: 破壊的変更ゼロ

| パブリックAPI                          | 変更                                      | 破壊的? |
| -------------------------------------- | ----------------------------------------- | :-----: |
| `new DaemonClient({ baseUrl, token })` | 変更なし                                  |   ❌    |
| `DaemonClientOptions.*`                | すべて維持、`transport` を追加             |   ❌    |
| `DaemonHttpError`                      | 変更なし                                  |   ❌    |
| `DaemonSessionClient`                  | 変更ゼロ（DaemonClient に委譲）           |   ❌    |
| すべての型エクスポート（100以上）      | 変更なし                                  |   ❌    |

### コンシューマごとの影響

| コンシューマ                | 影響                                  |
| --------------------------- | ------------------------------------- |
| webui（25ファイル）         | コード変更ゼロ                        |
| web-shell（4ファイル）      | コード変更ゼロ                        |
| vscode-ide-companion（1ファイル） | コード変更ゼロ                        |
| サードパーティ              | RESTの場合はゼロ; ACPの場合は `transport` を渡す |

---

## 4. 設計判断

| 判断                                                 | 根拠                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` をトランスポートに（fetch だけではない） | fetch を通じたSSE再エンコードは非効率的で脆弱                                                                                                                              |
| `connected: boolean` をトランスポートに                   | プロバイダの再接続ループが「トランスポート死亡」と「一時的な500」を区別する必要がある                                                                                        |
| 遅延初期化（明示的な `connect()` ではなく）                  | DaemonClient の構築を同期的に保つ; デフォルトの `new RestSseTransport()` は初期化不要                                                                                     |
| 自動検出は一回限り、セッション中はしない                     | `negotiate()` は起動時に一度プローブ; ランタイムフォールバックは `DaemonTransportClosedError` によるコンシューマ主導であり、静かな内部切り替えではない                          |
| エラータクソノミーの事前要件なし                           | ACPトランスポートはエラーをHTTP相当のステータスコードに内部的にマッピング; `DaemonHttpError` はそのまま動作                                                                    |
| プロバイダに `transport` プロパティ                     | `DaemonWorkspaceProvider` はオプションの `transport` プロパティ（約5行）を取得、`DaemonClient` コンストラクタに転送。サードパーティはこのプロパティを設定; 省略 = 現在のREST動作 |

---

## 5. 検討した代替案

### 5.1 カスタムfetch注入（新しいインターフェースなし）

既存の `DaemonClientOptions.fetch` 経由でWSベースの `fetch` を渡す。

**却下**: `subscribeEvents` は `content-type: text/event-stream` を検証し、`parseSseStream` を使用します。カスタムfetchはWSフレームをSSEテキストに再エンコードし、その後SDKが再びデコードする必要があります — 無駄なエンコード-デコードの往復。また、`capabilities()` と `initialize` は異なるレスポンス形状を持ち、フォーマットマッピングレイヤーが必要です。

### 5.2 完全な正式インターフェース（4つのPR、約2750行）

エラータクソノミー → インターフェース → AcpHttp → AcpWs を別々のPRとして。

**却下**: 過剰設計。エラータクソノミーは不要（ACPトランスポートはHTTP相当のステータスコードにマッピング可能）。別々のPRは、単一の凝集性のある抽象化に対するレビューコンテキストスイッチのコストを増加させます。

### 5.3 デュアルプロバイダとBridgeContext

並列の `AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext`。

**却下**: ストアの非同期を引き起こし、約8ファイルが必要で、SDKの変更なしでは機能しません。

---

## 6. 実装計画（単一PR）

すべての変更は1つのPRに含まれます。推定行数は約1300行。

| ファイル                                                           | 変更                                                                   | 行数    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | ------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`           | インターフェース + 型 + `DaemonTransportClosedError` + `negotiate()` ファクトリ | ~110    |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`          | `globalThis.fetch` ラッパー + DaemonClient から抽出したSSEロジック       | ~80     |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`            | WSマルチプレクサ + URL→JSON-RPCマッピング + リクエスト相関                | ~400    |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`          | POST /acp + 接続/セッションSSE管理                                     | ~300    |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`      | JSON-RPC通知 → DaemonEvent マッピング                                   | ~150    |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`    | オプトインラッパー: 再接続 + フォールバック                               | ~150    |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`              | コンストラクタ + 6つの `_fetch` サイト + subscribeEvents 書き換え         | ~40 net |
| `packages/sdk-typescript/src/daemon/index.ts`                     | 新しい型をエクスポート                                                 | ~10     |
| `packages/cli/src/serve/server.ts`                                | `GET /capabilities` に `transports` フィールドを追加                    | ~5      |
| `packages/sdk-typescript/src/daemon/types.ts`                     | `DaemonCapabilities` 型に `transports` を追加                           | ~3      |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx` | オプションの `transport` プロパティを追加、`DaemonClient` に転送          | ~5      |
| テスト                                                           | トランスポートのユニット + 結合テスト                                    | ~200    |

**後方互換性**: `transport` なしの `new DaemonClient({ baseUrl, token })` = 同一のREST+SSE動作。既存のすべてのテストはそのまま合格します。

---

## 7. 検証

1. **後方互換性**: sdk-typescript と webui で `npm run test` — テストの変更は不要。`new DaemonClient({ baseUrl, token })` = 同一動作。
2. **RestSseTransport 抽出**: 既存のテストスイートにより、ビット単位で同等のSSE動作が確認済み。
3. **AcpWsTransport**: 実際のデーモンにWS経由で接続する統合テスト。検証:
   - `subscribeEvents` がREST SSEと同じ `DaemonEvent` 形状を生成すること
   - 合成Responseでpromptの202/200分岐が機能すること
   - permission投票のラウンドトリップが正しく動作すること
   - WS切断時に `connected` が `false` に遷移すること
   - promptのアボートシグナル → WSが session/cancel RPC を送信すること
4. **AcpHttpTransport**: WSと同じ検証をHTTP+SSEで行う。
5. **自動検出**: `negotiate()` が最適なトランスポートを返すこと; WS障害時にRESTにフォールバックすること。
6. **ランタイムフォールバック**: `AutoReconnectTransport` が `DaemonTransportClosedError` をキャッチし、トランスポートを再構築、コンシューマが `session/load` で再同期すること。
7. **プロバイダ**: `transport` プロパティを持つ `DaemonWorkspaceProvider` — ChatView + TerminalView が両方とも単一のストアから読み取ること。
8. **エンドツーエンド**: サードパーティが `transport={new AcpWsTransport(url, token)}` を `DaemonWorkspaceProvider` に渡す。すべてのSDKフックとトランスクリプトストアが変更なく動作すること。
---

## 8. リスク

| リスク                                   | 軽減策                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| URL→JSON-RPC マッピングテーブルのメンテナンス | テーブルはトランスポートと同じ場所に配置。デーモンのルート変更にはトランスポートの更新が必要                                           |
| ACP WS 合成レスポンスの忠実性   | `syntheticResponse(status, json)` ヘルパーを提供し、契約（`.json()`, `.text()`, `.status`, `.body?.cancel()`）を文書化                                       |
| WS における `DaemonEvent.id` の単調性   | ACPサーバーのJSON-RPC通知はイベントIDを保持。トランスポートがそれを直接公開                                       |
| WS での Prompt 202 と 200 の扱い               | トランスポートはJSON-RPCレスポンスを200（結果ボディあり）にマッピング（ブロッキングパス）。イベントは引き続き `subscribeEvents` 経由で流れる         |
| WS 接続切断の検出           | `connected: boolean` と、`fetch` からスローされる `DaemonTransportClosedError` |