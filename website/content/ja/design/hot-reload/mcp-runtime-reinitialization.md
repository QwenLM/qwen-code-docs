# MCP ランタイムホットリロード設計: 設定駆動のインクリメンタル再接続 (Issue #3696 サブタスク 3)

> [!note]
> サブタスク 3 の本来の範囲は「MCP/LSP」ランタイム再接続です。この MR では **MCP のみ**を実装します。LSP については、Part C にスケッチと TODO のみ残し、後の MR に延期します。

## コンテキスト

Issue #3696 はホットリロードシステム全体を追跡する issue です。サブタスク 1（`SettingsWatcher` のファイル変更検出）はマージ済みですが、**まだ購読者はいません**。`gemini.tsx:784` がウォッチャーを起動し、[サブタスク 1 の設計ドキュメント](./settings-change-detection.md)では、リスナーの配線を明示的にサブタスク 2～6 に委ねています。現在、`settings.json` で MCP サーバーを追加/削除/編集したり、拡張機能をインストールしたりするには、セッション全体を再起動する必要があり、会話コンテキストが失われます。

この MR は **MCP** に焦点を当て、以下の 2 つを提供します。(a) リロードされた設定を稼働中の `Config` にプッシュするランタイムエントリポイント、(b) `SettingsWatcher` によって駆動される MCP インクリメンタル再接続です。LSP ランタイム再接続はこのサブタスクに含まれますが、ここでは実装せず、Part C に TODO のみ残します。

**核となる観察**: 「差分による再接続」インクリメンタルリコンサイルは既にコード内に存在しています（シングルセッションの `discoverAllMcpToolsIncremental`、共有プールの `runDiscoverAllMcpToolsViaPool`、各サーバーを `connectionIdOf` フィンガープリントで識別して変更があったもののみに影響します）。唯一のギャップは、`Config` が起動後に設定スナップショットを更新できないことです（`addMcpServers()` がスローする、`config.ts:3200`）。そのランタイムエントリポイントを追加するのが **Part A** であり、ウォッチャーからそれをトリガーするのが **Part B** です。これがこの MR のすべてです。2 つの確固たるトレードオフがあります。既存のインクリメンタルリコンサイルを再利用し、完全なワイプを行う `restartMcpServers()`（「ツール 0 個」のギャップが発生する）は使いません。また、共有プールパスは、シングルセッションパスと一致させるために `isMcpServerPendingApproval` 承認ゲートを追加する必要があります（Part A の項目 4）。コンポーネントの概要については以下の「アーキテクチャ」を、ステップバイステップのフローと詳細については「設計」を参照してください。

---

## アーキテクチャ

一言で言うと、**既存のインクリメンタルリコンサイルを設定ファイルの変更に配線し、その過程で信頼境界と UI フィードバックを埋める**ことです。この変更は CLI / Core パッケージ間での責務によって分割され、`Config` メソッドと 1 つの UI イベントを介して疎結合されています。

```text
                    CLI パッケージ                              Core パッケージ
 ┌──────────────────────────────────────────┐       ┌────────────────────────────────────┐
 │ SettingsWatcher (サブタスク 1、マージ済み) │       │ Config                              │
 │   └─[Part B] hot-reload.ts                │ 呼び出し│   └─[Part A] reinitializeMcpServers │
 │       いつ発火するか・ゲーティング再計算・ゲート │ ────▶ │       setMcpServers + インクリメンタルリコンサイル│
 │                                             │       │         (McpClientManager プール/シングル)       │
 │   └─[Part D] useMcpApproval・承認モーダル   │ ◀──── │   └─[Part A④] プールパスの保留ゲート │
 │       セッション中の保留状態 → 再プロンプト    │ イベント│                                     │
 │   └─[Part E] /mcp ステータス表示            │       └────────────────────────────────────┘
 │       「承認によりスキップ」理由を表示         │
 └──────────────────────────────────────────┘
```

- **レイヤリングの原則**: Core は `settings.json` / ウォッチャーのセマンティクスを理解してはならない。「いつ発火するか」は CLI（Part B）に属し、「どのように更新 + リコンサイルするか」は Core（Part A）に属します。これはサブタスク 1 と一貫しており、Part B は Part A の唯一のコンシューマであり、`Config` メソッドを通じてのみ相互作用します。
- **メインパス**: 設定変更 → Part B が目的のリスト + ゲーティングリストを再構築、デバウンスされたゲート → Part A を呼び出す → Core がインクリメンタルリコンサイル（プールパスの承認ゲートを含む） → `mcp-client-update` を発行してステータスインジケータを更新。
- **承認ブランチ**: リコンサイルによりゲートされたサーバーが `pending` のままになった場合、Part D が `McpPendingApprovalChanged` イベントを介して承認モーダルをトリガーします。スキップ理由は Part E が `/mcp` ビューで表示します。
- **ハードな前提条件**: 3 つのスキーマキー `mcpServers` / `mcp.allowed` / `mcp.excluded` をホットリロード可能に切り替える必要があります。そうしないと、ウォッチャーの「再起動必須抑制ゲート」が MCP のみの編集を飲み込み、チェーン全体が機能しなくなります（「設計」冒頭の ⚠️ 注意を参照）。

| パート | 責務                                                                                                                                   | レイヤー | ステータス     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- |
| **A**  | `Config` ランタイム更新可能な MCP 設定 + インクリメンタルリコンサイル + プールパス承認ゲート                                                     | Core     | 本 MR          |
| **B**  | ウォッチャーの購読、ゲーティング再計算、デバウンスゲート、Part A の呼び出し                                                                 | CLI      | 本 MR          |
| **C**  | LSP 再初期化                                                                                                                             | Core     | TODO (後の MR) |
| **D**  | セッション中の保留状態が承認モーダルをトリガー（および #6 の見逃しプロンプトを修正）                                                              | CLI      | フォローアップ |
| **E**  | `/mcp` に「承認によりスキップ」理由を表示                                                                                                  | CLI      | フォローアップ |
| **F**  | 許可セマンティクス: CLI 許可リストは上限、`mcp.allowed: []` = すべて拒否、ツール未検出時にサーバーが利用不可である理由を説明                             | CLI+Core | フォローアップ |

以下の「設計」では、ディスクファイルから稼働中の接続までのステップバイステップのデータフローと、各パートの実装詳細を示します。

---

## 設計

下図は、1 つの設定変更が「ディスクファイル」から「接続が有効になる」までの完全なデータフローです（`[CLI]` = Part B、`[Core]` = Part A、`[サブタスク 1]` = マージ済みのウォッチャー）。

```text
① ユーザーが .qwen/settings.json を編集 (mcpServers の追加/削除/編集、または mcp.excluded / mcp.allowed の変更)
       │
       ▼
② [サブタスク 1] SettingsWatcher がファイル変更を検出
       │   · 300ms デバウンス: 連続保存を統合
       │   · ファイル全体の意味的差分: コンテンツが実際に変更された場合のみ通知 (自己書き込み/単なるフォーマット変更 → 通知なし)
       ▼
③ [CLI · Part B] registerMcpHotReload によって登録されたコールバックが発火 (任意の設定変更が到達)
       │
       ├─ a. assembleMcpServers(settings.merged.mcpServers, cwd, topTier)
       │        → 優先順位でマージして完全なサーバーリスト `next` を生成 (.mcp.json / --mcp-config / セッションを含む)
       ├─ b. 接続ゲーティングリスト nextGating = { excluded, allowed, pending } を再計算
       └─ c. ゲート: mcpServersEqual(old, next) AND mcpGatingEqual(old, nextGating) の両方が「変わっていない」
                → 早期リターン (テーマ / スキルなど MCP に関係ない編集は無視)
       │ (mcpServers または mcp ゲーティングリストが変更された場合のみ続行 ↓)
       ▼
④ [CLI→Core] 最初にゲーティングリストを config にプッシュ (リコンサイル中に discovery がそれらを読み取る):
       config.setExcludedMcpServers / setAllowedMcpServers / setPendingMcpServers
       │
       ▼
⑤ [Core · Part A] config.reinitializeMcpServers(next)
       │   (「リコンサイル中」ガードでラップし、/reload との競合を回避)
       ├─ a. setMcpServers(next): 設定レイヤーのスナップショットを置き換え (拡張機能/ランタイムレイヤーは変更なし)
       └─ b. discoverAllMcpToolsIncremental: 調整型インクリメンタルリコンサイル
                · 各サーバーの connectionIdOf フィンガープリントを計算し、「目的の状態」と「オンライン」を比較
                · 追加 → 接続; 削除 → 切断 + ツール/プロンプトを破棄;
                  フィンガープリント変更 → 切断 + 古いツール/プロンプトを破棄、その後新しい設定で再接続; 変更なし → 維持
                · 無効 / 保留中 / 信頼できないディレクトリはスキップ; mcp-client-update を発行
       │
       ▼
⑥ [CLI · Part B] UI ラップアップ: mcp-client-update が MCP ステータスインジケータを更新;
       (オプション) MCP プロンプトが変更された → reloadCommands(); needsRefresh を設定 (サブタスク 6)
```

> **トリガータイミング**: `registerMcpHotReload` は起動時に 1 回だけ実行されます（リスナーをアタッチし、ディスポーザを返します）。登録されたコールバックは、ウォッチャーを介して **設定が変更されるたびに** 発火します (つまり step ③ 以降)。リコンサイルが実際に実行されるのはその時です。

> ⚠️ **ハードな前提条件: step ② で 3 つの MCP スキーマキーをホットリロード可能に切り替える必要があります。** ウォッチャーには「再起動必須抑制ゲート」があります。変更が触れた **すべての** キーが `requiresRestart: true` の場合、**イベントを発行しません**。しかし `mcpServers` / `mcp.allowed` / `mcp.excluded` はすべて `true` でした。そのため、MCP のみの編集ではコールバックが発火せず、Part B は機能しません。この MR では、これら **3 つのリーフ** を `false` に **必ず** 切り替える必要があります。親ノード `mcp` と起動時のみの `mcp.serverCommand` は `true` のままにします（`isRestartRequiredKey` 最長プレフィックス一致 + `flattenSchema` を使用、リーフが優先）。3 つとも `showInDialog: false` であるため、この切り替えによって設定ダイアログの再起動プロンプトは変わりません。影響範囲はウォッチャーパスのみです。

以下、Part A（Core の機能）、Part B（CLI の配線）、Part C（LSP、本 MR では TODO のみ）を順に説明します。

### Part A — Core: 設定更新可能な Config の実現とインクリメンタルリコンサイルのトリガー

**ファイル: `packages/core/src/config/config.ts`**

1. リコンサイルが読み取る設定スナップショットを更新する、初期化後のセッターを追加します。

   ```ts
   /**
    * 設定レイヤーの MCP サーバーマップのランタイム (ホットリロード) による置き換え。
    * addMcpServers() とは異なり、`initialized` ガードをバイパスし、置き換え (マージではない) であるため、
    * 削除が有効になります。ランタイムオーバーレイ (addRuntimeMcpServer) や拡張機能のコントリビューションは
    * 影響を受けません。getMcpServers() は引き続きそれらの上にレイヤーされます。
    */
   setMcpServers(servers: Record<string, MCPServerConfig> | undefined): void {
     this.mcpServers = servers;
   }
   ```

   `getMcpServers()` (`:3128`) は既に拡張機能 + `runtimeMcpServers` を `this.mcpServers` の上にレイヤーしているため、設定レイヤーのみを置き換えることはランタイム/拡張機能のエントリに対して安全です。

2. **接続ゲーティングリスト**: 各 MCP サーバーが接続を許可されるかどうかを決定する 3 つの名前リスト — `excluded`（ブロック済み）、`allowed`（設定されている場合、これらのみ接続）、`pending`（ゲートされたソース、ユーザー承認が必要）。これらは `mcpServers`（サーバー設定）とは別物です。前者は「接続するか **どうか**」を管理し、後者は「どのサーバーをどのように」を管理します。`getMcpServers()` / discovery が参照するこれら 3 つのリストにセッターを追加します。`setExcludedMcpServers()` は既に存在します（`:3167`）。さらに `setAllowedMcpServers()`（フィールドは現在 `readonly` で `getMcpServers()` 内でフィルタとして使用）と、保留承認セット用のセッターを追加します。

3. 軽量なオーケストレーションメソッドを追加します: 最初に config を更新し、次に既存のインクリメンタルリコンサイルを駆動します。これを共有の「リコンサイル中」ガードでラップすることで、`/reload`（サブタスク 5）とウォッチャーが競合しないようにします。

   ```ts
   /**
    * 新しい設定レイヤーの MCP マップを適用し、稼働中の接続をインクリメンタルにリコンサイルします
    * (追加されたものは接続、削除されたものは切断、変更されたものは再起動、変更なしのものはそのまま維持)。
    * initialize() の前に呼び出しても安全に何もしません。
    */
   async reinitializeMcpServers(servers: Record<string, MCPServerConfig> | undefined): Promise<void> {
     this.setMcpServers(servers);
     const registry = this.getToolRegistry();
     await registry.getMcpClientManager().discoverAllMcpToolsIncremental(this);
   }
   ```

   `discoverAllMcpToolsIncremental` は既に `isTrustedFolder()` をチェックし、無効/SDK サーバーを処理し、`mcp-client-update` を発行して UI ステータスインジケータを更新します。削除されたサーバー → 解放 + ツール/プロンプトを破棄; フィンガープリント変更 → 解放 + 再取得; 変更なし → 維持。

4. **共有プールパスに保留承認チェックを追加** (信頼境界、本 MR で必須): シングルセッションパスは保留承認のサーバーをスキップしますが、共有プールが存在する場合、`discoverAllMcpToolsIncremental` は `runDiscoverAllMcpToolsViaPool` に委譲し、**プールパスは無効/SDK のみをスキップし、`isMcpServerPendingApproval` はスキップしません** (`mcp-client-manager.ts:1461` 付近)。この修正がないと、デーモン/共有プールモードで、ゲートされた `.mcp.json` / ワークスペースサーバーを追加/編集するホットリロードが、ユーザー承認の **前に** プール接続を取得してプロセスを起動し、#4615 承認ゲートをバイパスしてしまいます。修正: `desiredIds` を構築する前、および acquire の前に、プールパスに `isMcpServerPendingApproval` チェックを追加し、その許可セマンティクスをシングルセッションパスと一致させます。

### Part B — CLI: SettingsWatcher を購読 → MCP リコンサイル

**新規ファイル: `packages/cli/src/config/hot-reload.ts`**、`settingsWatcher.startWatching()` (`:785`) の後 (`gemini.tsx`) で配線します。

```ts
export function registerMcpHotReload(
  watcher: SettingsWatcher,
  settings: LoadedSettings,
  config: Config,
  topTierMcpServers: Record<string, MCPServerConfig> | undefined,
): () => void {
  return watcher.addChangeListener(async (events) => {
    // Config の起動時とまったく同じ方法で再構築 — トップティア (CLI/セッション) ソースを含む。
    const next = assembleMcpServers(
      settings.merged.mcpServers,
      config.getTargetDir(),
      topTierMcpServers,
    );
    // ゲーティングリスト (excluded/allowed/pending) を再計算 — [ホットリロード時の設定が優先]、
    // 以下の「許可スタンスの決定」を参照。pending は常に #4615 ゲートに従って再計算される。
    const nextGating = {
      excluded: recomputeExcluded(settings, next),
      allowed: recomputeAllowed(settings, next),
      pending: recomputePending(settings, next),
    };
    // ゲート: mcpServers または mcp ゲーティングリストが変更された場合のみリコンサイル;
    // 両方とも変更なしなら早期リターン (テーマ/スキルなど MCP に関係ない編集は無視)。
    const serversChanged = !mcpServersEqual(
      config.getSettingsMcpServers(),
      next,
    );
    const gatingChanged = !mcpGatingEqual(config.getMcpGating(), nextGating);
    if (!serversChanged && !gatingChanged) return;
    // リコンサイルの前にゲーティングリストを config にプッシュ (reinitializeMcpServers 内の discovery がそれらを読み取る)。
    config.setExcludedMcpServers(nextGating.excluded);
    config.setAllowedMcpServers(nextGating.allowed);
    config.setPendingMcpServers(nextGating.pending);
    await config.reinitializeMcpServers(next);
    // UI に通知: MCP プロンプトが変更された → reloadCommands(); needsRefresh を設定 (サブタスク 6)。
  });
}
```

> **許可スタンスの決定 (意図的)**: ホットリロードでは、**起動時の `--allowed-mcp-server-names` バウンド内で、現在の設定が優先されます**。`settings.json` 内の `mcp.allowed` / `mcp.excluded` へのランタイム編集は即座に有効になりますが、**許可を狭める方向のみで、起動フラグを超えて広げることはありません** (上限ルールと `mcp.allowed: []` のセマンティクスについては Part F を参照)。`--allowed-mcp-server-names` フラグが渡されなかった場合、設定が完全に許可を制御します。**保留承認ゲート (#4615) は決して緩められません**: ゲートされたサーバーは常に最初に承認される必要があります (Part A 項目 4)。
>
> > _履歴_: 以前のリビジョンでは、ランタイム設定の編集が起動フラグを超えて許可を広げることを許していました (フラグを単なる名前フィルターの便利機能として扱っていました)。敵対的レビューにより、これは起動時バウンドの無言の緩和であると指摘されました。Part F (項目 K) でこれを逆転します — フラグは不変の上限となります。

既存のヘルパーを再利用します — **マージロジックを再実装しないでください**:

- `assembleMcpServers(settings.mcpServers, cwd, topTierMcpServers)` —
  `packages/cli/src/config/mcpServers.ts:27` (Config 起動時の呼び出し `packages/cli/src/config/config.ts:1812` と一致)。
- `SettingsWatcher.addChangeListener` は購読解除関数を返します (`settingsWatcher.ts:253`)。
- `config.getSettingsMcpServers()` (`:3124`) を `mcpServers` の差分の事前イメージとして使用; `config.getMcpGating()` をゲーティングリスト差分の事前イメージとして使用 (新しい小さなゲッターで `{ excluded, allowed, pending }` を返し、Part A のセッターと対になる)。

ゲートは 2 つの小さな純粋関数を使用してトリガー表面を狭めます (テーマ/スキルやその他の無関係な編集が冗長なリコンサイルをトリガーするのを防ぎ、ウォッチャー自身の意味的差分と一貫性を保ちます)。どちらも **`fast-deep-equal` を再利用** します (cli パッケージはそれを推移的依存から直接依存に昇格させる必要があります)。

- `mcpServersEqual(a, b)`: オブジェクトキーの順序は無関係 (サーバー/フィールドの順序による誤検出を排除)、配列の順序は考慮 (`args` やその他のコマンド引数の順序には意味がある); `undefined` ≡ `{}`。
- `mcpGatingEqual(a, b)`: `excluded` / `allowed` / `pending` を **セット** として比較 (コピーをソートしてから); `undefined` ≡ `[]`。これにより、「`mcp.excluded` / `mcp.allowed` のみ編集し、`mcpServers` はそのまま」という場合でもリコンサイルがトリガーされるようになります — `mcpServers` のみを差分比較していた場合に見逃すゲーティング変更を捕捉します。

UI ラップアップは、既存の `mcp-client-update` イベントを介してステータスインジケータを更新し、必要に応じて `needsRefresh` を設定します (サブタスク 6)。このサブタスクの最低限のライン: config レベルのリコンサイルが完了し、既存のイベント発行によりステータスが更新されます。

### Part C — LSP 再初期化 (本 MR では未実装、TODO)

LSP 設定は `.lsp.json` + 拡張機能設定 (**`settings.json` ではない**) から取得されるため、**SettingsWatcher によって自動的にトリガーされることはありません**。そのランタイム再接続は、後続の `/reload` コマンド (サブタスク 5) によって手動で駆動されるべきです。`NativeLspService` (`--experimental-lsp` でゲート) は既にライフサイクルメソッド `discoverAndPrepare` / `start` / `stop` を持っており、大きな変更なしに `/reload` に `LspClient.reinitialize?()` + `Config.reinitializeLsp()` を介して公開される `reinitialize()` プリミティブを実装するのに十分です。

> **TODO (次の MR)**: `NativeLspService.reinitialize()` と、それを `Config.reinitializeLsp()` を介して公開する実装。詳細な設計はその MR のドキュメントで行います (ただし、`discoverAndPrepare()` は最初に `clearServerHandles()` を呼び出し、インクリメンタル差分を防ぐため、v1 ではすべて停止 → すべて開始を使用するなど)。**本 MR には LSP のコード変更は含まれません。**

### Part D — フォローアップ: ホットリロードがゲートされたサーバーに対してランタイム承認モーダルをトリガー (#4615 に関連)

> このセクションは、Parts A/B が着地した後、ゲートされたサーバーの URL を変更しても再接続されないというデバッグ中に追加されました。これは「ホットリロードがゲートされたサーバーを保留としてマークするが、UI に承認モーダルが表示されない」という問題を修正し、ついでに決定ロジックによって引き起こされた見逃しプロンプトを修正します (以下の issue #6)。

#### 背景: 承認モーダルは起動時に一度だけ計算されていた

ゲートされたソースのサーバー (`project` の `.mcp.json` と `workspace` の `.qwen/settings.json`、`isGatedMcpScope` を参照) は、ユーザー承認が **設定ハッシュにバインド** されています (`mcpApprovals.ts` の `getState`: レコードがない、または現在の設定とハッシュが異なるレコード → `pending`)。そのため、ホットリロードがゲートされたサーバーの設定を変更すると (たとえ `httpUrl` だけでも)、そのハッシュ変更により古い承認が無効になり、再度 `pending` になります。

Part A/B のチェーンはこれを **正しく** 処理します: `recomputeMcpGating` がそれを `pending` に入れ、`setPendingMcpServers` が discovery にプッシュし、リコンサイルはそれをスキップします (接続なし、状態 `disconnected`)。しかし **UI に承認モーダルが表示されません** — 根本原因は、`useMcpApproval` (承認モーダルを駆動するフック) が `useEffect(…, [config])` を介して **マウント時のみ** キューを計算するためであり、`config` 参照はセッション中安定している → エフェクトが再実行されないためです。つまり:

- core はサーバーを保留とマーク (discovery がスキップ) ✓
- UI の承認キューは再計算されない → **モーダルなし** ✗ (ユーザーには `disconnected` と表示されるだけで、承認する方法がない)
2 つのパスは実行時に**切断**されています。

#### 修正: コア→UI 間をイベントで接続し、判定を UI に委ねる

1. **イベント `AppEvent.McpPendingApprovalChanged` を追加**（`packages/cli/src/utils/events.ts`）。  
   `appEvents` は CLI レイヤーにあり、`hot-reload.ts` も同レイヤーなので、リスナーは直接 emit でき、**コアの変更は不要**です。

2. **`hot-reload.ts` で reconcile 後に emit**（`await reinitializeMcpServers` の後に配置。これにより `config.getMcpServers()` は新しいマップを反映済み。reconcile の成否にかかわらず emit — 保留中のサーバーは依然としてユーザーの判断が必要）。

3. **`useMcpApproval` から `computePending()` を抽出**: マウント時に一度だけ計算（既存の動作）**に加え**、`McpPendingApprovalChanged` を購読した後でキューを再計算 → 空でないキューがあればモーダルを表示。`computePending` は信頼できるソース（ライブサーバーマップ + 永続化された承認ファイル）から再計算するため、既に承認済み/拒否済みのサーバーが再プロンプトされることはありません。

#### 主要な設計: 「厳格な pending」に基づいて emit し、名前の集合差は使わない（issue #6 / A1 判断）

以下の 2 つの述語は**意図的に異なっており**、このセクションの核心です:

| 関数                               | 述語                                                 | 用途                                               |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `getPendingGatedMcpServers`        | `state !== 'approved'`（**rejected を含む**）        | discovery を駆動: rejected は**スキップし続ける**  |
| `getPromptableMcpServers`（新規）  | `state === 'pending'`（**rejected を除外**）         | モーダルを駆動: rejected は**プロンプトしない**    |

初期の emit 判断では「`nextGating.pending` と前回の名前の集合差」を使ってモーダル表示の有無を決めていましたが、これによりプロンプト漏れが発生していました（issue #6 参照）:

- **rejected** なサーバーは `!== 'approved'` により `pending` リストに残り続ける；
- ユーザーがその**同じサーバーの設定を再編集**すると（ハッシュが変わり、本当に `pending` になり、再度問い合わせる必要が生じる）、名前は既にリストに「含まれている」ため、集合差が空 → **イベントなし → プロンプト漏れ**。

A1 修正: emit の判断に `getPromptableMcpServers(next, cwd)`（厳格な `=== 'pending'`）を使用し、判断の実態を `computePending` に委ねます。その効果:

- reject 後、**同じサーバーの設定を編集**（ハッシュ変更）→ `pending` に戻る → **再プロンプト** ✓（#6 を修正）
- reject 後、**無関係な編集**（ハッシュ不変）→ 依然 `rejected` → プロンプト対象外 → **プロンプトなし** ✓
- 既に `approved` → プロンプトなし；新しく未判定の gated サーバー → プロンプト ✓

#### reject の意味（レビュー後に確定）

`handleMcpApprovalSelect(REJECT)`: `rejected` を永続化（現在のハッシュに紐付け）、`reconnect` は**呼ばず**、`config.pendingMcpServers` には**触れない** → discovery はスキップし続ける → サーバーは `disconnected` のまま。古い接続を能動的に破棄する必要はありません: emit は `reinitializeMcpServers` の await 後に発生するため、モーダルが表示される時点で reconcile は既に接続を解除しています。セッション再起動後も `computePending` は `rejected` を読み取る → キューに入れず、切断状態が維持され、一貫した動作になります。

#### データフローの補足（章の概要図の ⑥ に続く）

```text
⑥' [CLI · Part D] reconcile 後、厳格に pending の gated サーバーが存在する場合:
        hot-reload → appEvents.emit(McpPendingApprovalChanged)
        → useMcpApproval.computePending() がキューを再計算 → 承認モーダルを表示
        → ユーザーが承認: approveMcpServerForSession + discoverToolsForServer（新しい設定で接続）
          ユーザーが拒否: rejected を永続化、切断状態を維持
```

#### 主要ファイル（Part D）

| ファイル                                          | 変更内容                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/utils/events.ts`                | `AppEvent.McpPendingApprovalChanged` を追加                                                                                    |
| `packages/cli/src/config/mcpApprovals.ts`         | `getPromptableMcpServers()` を追加（厳格な `=== 'pending'`、rejected を含む `getPendingGatedMcpServers` とは区別）              |
| `packages/cli/src/config/hot-reload.ts`           | reconcile 後、`getPromptableMcpServers` で判断；空でなければ `appEvents.emit(McpPendingApprovalChanged)` を呼び出す             |
| `packages/cli/src/ui/hooks/useMcpApproval.ts`     | `computePending()` を抽出；マウント時に一度計算 + イベント時に再計算                                                           |

#### テスト（Part D）

- `hot-reload.test.ts`: gated サーバーが新たに pending → emit；gated でない変更 → emit なし；**reject→設定編集 → 再度 emit**（従来の名前集合差では 0 回となり #6 のリグレッションを固定）；reject→無関係な編集 → emit なし。
- `mcpApprovals.test.ts`: `getPromptableMcpServers` のテストスイート — 判断なしはプロンプト、rejected はプロンプトしない（`getPendingGatedMcpServers` は依然としてスキップ）、ハッシュ変更後に再プロンプト、approved はプロンプトしない。
- `useMcpApproval.test.ts`: セッション途中のイベントにより新しい gated サーバーがモーダルを表示；既承認のサーバーは再プロンプトされない。

#### 既知の問題 / 事後 TODO（ここでは対処しない）

1. **`getTargetDir()` と `getWorkingDir()` のキーの不一致（リスク B）**: gating の再計算（`recomputeMcpGating` → `getPendingGatedMcpServers`）は `config.getTargetDir()` をプロジェクトルートとして使用するのに対し、`useMcpApproval` は `config.getWorkingDir()` を使用して承認の読み書きを行う。通常は等しいが、いったん乖離すると（カスタム cwd、シンボリックリンクの realpath の違いなど）、承認は cwd キーで書き込まれる一方、gating は targetDir キーでクエリされる → **承認後も gating がスキップし続け、接続されない**。Part D で導入したものではない既存の問題。ルートを統一する（`getWorkingDir()`、すなわち承認書き込み側に寄せる）か、まず実行時に両者が等しいことを表明するアサーションを追加することを推奨。

### Part E — フォローアップ: `/mcp` で gated サーバーが承認のためにスキップされた理由を表示

> このセクションは Part D がランドした後、デバッグ中に追加されました。「gated サーバーを拒否した後、同じものを削除して再追加すると、`/mcp` に Disconnected とだけ表示され、ヒントが何もない」という問題への対応です。結論から言うと: **これはレコードのライフサイクルバグではなく、唯一の欠陥はスキップ理由が不可視であること**です。そのため、可視性のみを追加し、承認ストレージや reconcile ロジックには一切触れません。

#### 「プロンプトが表示されなくなる」は仕様通り

承認レコードは **(projectRoot, serverName, hash)** に紐付けられ、**サーバーが現在設定に存在するかどうかには依存しません** — 設定からサーバーが消えてもレコードは削除されません。したがって:

- **approved は削除/再追加をまたいで永続化**: 承認（hash H）→ 削除 → 同一の再追加（still hash H）→ `getState` が `approved` を返す → サイレント再接続。意図的な利便性です。
- **rejected も同様に、同じ「同一再追加」に対して拒否を固定**: 設定ハッシュが変わらない限り、確定した拒否は有効；再プロンプトさせる唯一の方法は**設定を編集してハッシュを変えること**（つまり Part D の `getPromptableMcpServers` の厳格 pending 再プロンプト経路）。

> したがって、**削除時にレコードを忘れる処理は意図的に導入しません**。そうすると、存在の遷移が永続的な判断を変更できてしまい、「判断はハッシュの変更か明示的な操作でのみ変わる」という原則に反し、approved / rejected の非対称性を生みます。

#### 実際の欠陥と修正（可視性のみ）

`/mcp`（`ServerListStep` / `ServerDetailStep`）は単に `Disconnected` と表示していたため、「拒否した / 承認待ち」と「本当の接続失敗」が区別できず、ユーザーは復旧方法（設定を編集してハッシュを変更し、再プロンプト）を知ることができませんでした。修正: `MCPServerDisplayInfo` に `approvalState?: 'pending' | 'rejected'` を追加。`MCPManagementDialog.fetchServerData` 内で `loadMcpApprovals` + `isGatedMcpScope` を使用して計算し、キーは **`config.getWorkingDir()`**（非 gated / approved の場合は空）。リスト/詳細ビューでは、既存の `needsAuth` オーバーライドパターンを利用して、最初に理由を表示し（`rejected → "拒否されました — 承認し直すには設定を編集してください"`、`pending → "承認が必要です"`、黄色の警告）、これらの非エラーの承認スキップはフッターの「エラーログを確認」ヒントから除外します。

> ここで書き込み側の `getWorkingDir()` にキーイングすることは、Part D の「既知の問題 1（リスク B）」で推奨された方向性と正確に一致します — 承認の読み取りと書き込みを同じルートで行う。`hot-reload.ts` の既存の gating クエリは引き続き `getTargetDir()` を使用します（現在は等しい）；このセクションではその動作を変更しません。`mcpApprovals.ts` のストレージ、`hot-reload.ts` の削除/再接続パスには**触れず**、承認アクションも追加しません。

#### 主要ファイル（Part E）

| ファイル                                                        | 変更内容                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/mcp/types.ts`                   | `MCPServerDisplayInfo` に `approvalState?: 'pending' \| 'rejected'` を追加               |
| `packages/cli/src/ui/components/mcp/MCPManagementDialog.tsx`    | `fetchServerData` で `approvalState` を計算、キーは `getWorkingDir()`                     |
| `packages/cli/src/ui/components/mcp/steps/ServerListStep.tsx`   | 承認理由を表示；承認スキップをフッターの「エラーログを確認」ヒントから除外               |
| `packages/cli/src/ui/components/mcp/steps/ServerDetailStep.tsx` | 承認理由を表示（リストと一貫性）                                                        |

#### テスト（Part E）

- `ServerListStep.test.tsx`: gated `rejected` → 再承認ヒントテキストを表示；`pending` → 「承認が必要です」；承認スキップでは「エラーログを確認」ヒントは**表示されない**が、本当の接続失敗では**依然として表示される**。
- 手動テスト: ワークスペースサーバーを拒否 → `/mcp` に理由が表示される（単なる Disconnected ではない）→ 設定を編集してハッシュを変更 → Part D のモーダルが再表示される（既存の復旧パス、ここでは変更なし）。

### Part F — フォローアップ: アドミッションセマンティクス（CLI 上限、deny-all、利用不可理由）

> Parts A/B に対する 3 回目の敵対的レビューパスの後に追加されました。3 つの関連するアドミッション改善をグループ化しています（「どのサーバーが接続を許可され、接続できない場合にどのように説明するか」という表面を共有するため）。アイテムはレビュースレッドに従って K / H / B とラベル付けされています。

#### K — 起動時の `--allowed-mcp-server-names` フラグは不変の上限とする

以前の「設定が常に優先」という姿勢（Part B の注釈参照）を逆転します。起動時、`loadCliConfig` はフラグに `settings.mcp.allowed` より優先順位を与えます。しかし、ホットリロードの再計算は `allowed` を設定からのみ読み取っていたため、設定変更によって起動時の名前制限が暗黙のうちに失われていました — つまり、オペレーターがローカル MCP コマンドの実行範囲を制限するために設定した境界が、セッション中に緩められてしまうのです。

修正: **フラグの値のみ**を `Config` 上の不変の上限としてキャプチャします（`cliAllowedMcpServerNames` パラメータ → `getCliAllowedMcpServerNames()`；ホットリロードで上書きされる可変の `allowedMcpServers` とは区別）。`recomputeMcpGating` は、設定由来の許可リストをこれに制限します:

- フラグあり + 設定に `mcp.allowed` がある場合 → **積集合**（設定は上限内で狭めることができる）；
- フラグあり + 設定に `mcp.allowed` がない場合 → **フラグ全体**；
- フラグなし → 設定が完全にアドミッションを制御（変更なし）。

したがって、実行時の編集は起動フラグよりも MCP アドミッションを狭めることしかできず、広げることはできません。`mcp.excluded` はディスカバリー時にさらに絞り込みますが、「厳しくするだけで緩めない」という原則に一貫しています。

#### H — `mcp.allowed: []` は deny-all として、起動時とホットリロードで一貫させる

起動時は空の許可リストを deny-all として扱います（`getMcpServers()` は `allowedMcpServers` が truthy の場合のみフィルタリングし、`[]` は truthy）。ホットリロードの再計算は以前、`[]` を `undefined`（「すべて許可」）に潰していたため、`mcp.allowed` を `[]` に編集して deny-all を期待しても、すべてのサーバーが接続可能なままでした。修正: `recomputeMcpGating` は `[]` を維持します（**キーが存在しない**場合のみ `undefined` となる）。また、`mcpGatingEqual` は `allowed` について、存在しない（すべて許可）と `[]`（deny-all）を区別します — そうしないと変更が等しいと評価され、reconcile が行われなくなります。`excluded` / `pending` は `undefined ≡ []` のまま（どちらも「エントリなし」）。

#### B — ツールが見つからない場合、サーバーが利用できない理由を説明する

`getMcpToolUnavailableMessage` は以前は「このセッションで削除された」と「設定されていない」の 2 つしか区別していませんでした。アドミッションゲーティングにより、単一のコア API `Config.getMcpServerUnavailableReason(name)` を介して所有サーバーを分類し、すべてのゲートを網羅します:

| reason             | 意味                                         | メッセージが示す復旧方法                           |
| ------------------ | -------------------------------------------- | ------------------------------------------------- |
| `removed`          | このセッションでマージ設定から削除された       | 設定に再追加する                                  |
| `not_allowed`      | `mcp.allowed` / CLI バインドによりフィルタリングされた | `mcp.allowed` に追加する                         |
| `excluded`         | `mcp.excluded` にリストされている            | `mcp.excluded` から削除する                       |
| `pending_approval` | gated サーバーが承認待ち（#4615）             | 承認する（`/mcp` を実行）                          |
| _(なし)_           | 設定されていてアドミットされている            | 本当の「ツールが見つからない」（切断/名前変更）     |

2 つの補助的変更: プライベートな `getMergedMcpServers()`（許可リストフィルタリング**なし**のマージ）を追加し、「設定されている」と「フィルタリングで除外された」を区別できるようにする。また、削除トラッキングは**ゲーティングに依存しないマージマップ**を比較するようになり、狭められた許可リストでフィルタリングされたサーバーが `removed` と誤報告されることはなくなります（代わりに `not_allowed`）。これにより、以前の許可リスト絞り込み修正で追加された `prevEffectiveServerNames` スナップショットパラメータを削除できます — マージマップの差分は、呼び出し側が reconcile 直前に適用するゲーティングセッターの影響を受けません。

#### 主要ファイル（Part F）

| ファイル                                              | 変更内容                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts`（`loadCliConfig`） | `--allowed-mcp-server-names` フラグの値のみを `cliAllowedMcpServerNames` として渡す                                                                                                                                                                                                                                                                              |
| `packages/core/src/config/config.ts`                  | `cliAllowedMcpServerNames` フィールド + `getCliAllowedMcpServerNames()`（K）；`getMergedMcpServers()`（フィルタリングなし）+ `getMcpServerNames()`；`McpServerUnavailableReason` + `getMcpServerUnavailableReason()`（B）；削除トラッキングはマージマップを比較、`reinitializeMcpServers` は `prevEffectiveServerNames` パラメータを削除 |
| `packages/cli/src/config/hot-reload.ts`               | `recomputeMcpGating` は `allowed` を起動時バインドに制限（K）、`[]` を維持（H）；`mcpGatingEqual` で `allowed` の非存在と `[]` を区別（H）                                                                                                                                                                                                                     |
| `packages/core/src/core/coreToolScheduler.ts`         | `getMcpToolUnavailableMessage` は `getMcpServerUnavailableReason` に従ってルーティング（B）                                                                                                                                                                                                                                                                      |

#### テスト（Part F）

- `hot-reload.test.ts`: **K** — 起動フラグがあり設定の許可リストがない場合、フラグ全体が適用される；設定の許可リストはフラグに制限される（拡大不可）、フラグ内で狭めることは可能；フラグがない場合、設定が無制限に優先される。**H** — `mcp.allowed: []` は deny-all として渡される；`mcpGatingEqual` は `allowed` が存在しない場合と `[]` を異なるものとして扱う（ただし `excluded` では `undefined ≡ []`）。
- `config.test.ts`: `getMcpServerUnavailableReason` は各ゲートに対して `not_allowed` / `excluded` / `pending_approval` / `removed` を返し、設定済みかつアドミットされたサーバー、または一度も設定されていないサーバーに対しては `undefined` を返す。
- `coreToolScheduler.test.ts`: ツールが見つからないメッセージは、理由に応じて正しいサーバー名と復旧アクションを示す。

---

## スコープ外（その他のサブタスク）

- **LSP 実行時再接続全体**（`NativeLspService.reinitialize()` + `Config.reinitializeLsp()` + 配線）— 後続の MR に延期、Part C の TODO 参照。
- `/reload` スラッシュコマンド（#5）— `config.reinitializeMcpServers(currentSettings)` を呼び出す（LSP 部分は後続の MR でプリミティブがランドしたら配線）+ スキル/コマンドのリロード。
- `clearAllCaches()`（#4）と `needsRefresh` UI 通知（#6）。

## 主要ファイル

| ファイル                                          | 変更内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/config/config.ts`              | `setMcpServers()`, `setAllowedMcpServers()` + pending セッター, `getMcpGating()` （`{ excluded, allowed, pending }` を返す）, `reinitializeMcpServers()` （reconcile 進行中ガード付き）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `packages/core/src/tools/mcp-client-manager.ts`   | ① `removeServer()` と `removeRuntimeMcpServer()` に `removePromptsByServer()` を追加；② 共有プールパスの `runDiscoverAllMcpToolsViaPool`（`:1461`）で、`desiredIds` 構築前 / acquire 前に `isMcpServerPendingApproval` チェックを追加（シングルセッションアドミッションと一致）；③ **シングルセッションパスにフィンガープリント差分を追加**: 新しい `connectionFingerprints` マップ；`discoverAllMcpToolsIncremental` も、接続済みだが `connectionIdOf` のフィンガープリントが変更されたサーバーに対して切断+再接続をトリガー（プールパスの `desiredIds` と整合）、すべてのティアダウンパスでマップをクリア；④ **再接続前に古いツール/プロンプトをクリア**: `discoverMcpToolsForServerInternal` が既存のクライアントを置き換える場合、`removeMcpToolsByServer` + `removePromptsByServer` を再ディスカバリー前に実行 — `disconnect()` はレジストリに影響せず、`discover()` は名前で追加/上書きするだけなので、そうしないと設定変更で削除/名前変更されたツールが閉じられたクライアントに紐付いたまま残り、ディスカバリー失敗時も残存するため。`removeServer` / `addRuntimeMcpServer` の既存のクリーンアップと一致 |
| `packages/cli/src/config/settingsSchema.ts`       | **前提条件**: 3 つのキー `mcpServers`（`:274`）、`mcp.allowed`、`mcp.excluded` を `requiresRestart: true` から `false` に変更し、ウォッチャーが MCP のみの編集を抑制しないようにする；親キー `mcp` と `mcp.serverCommand` は `true` のまま（上記「ハードな前提条件」の注釈参照）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/cli/src/config/hot-reload.ts` _(新規)_  | `registerMcpHotReload()`: `assembleMcpServers(..., topTierMcpServers)` で再構築；現在の設定からゲーティングリストを再計算（「アドミッションスタンス判断」参照）；`mcpServersEqual` + `mcpGatingEqual` でゲーティング（`fast-deep-equal` 上に構築）；デバウンス + 統合と再チェック                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/cli/package.json`                       | `fast-deep-equal` を推移的依存から**直接依存**に昇格                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/cli/src/gemini.tsx`                     | `:785` の後に `registerMcpHotReload` を呼び出す；ディスポーザーを登録                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| テスト（スキーマフリップと同時）                    | `settingsSchema.test.ts` は 3 つの MCP キーの `requiresRestart` 値を固定（`mcp` / `mcp.serverCommand` が `true` のままであることを含む）；`settingsWatcher.test.ts` は 2 つの回帰テストを追加（「`mcpServers` のみの編集 / `mcp.excluded` のみの編集 → 依然として通知される」）；`settingsUtils.test.ts` は**独自のモックスキーマ**を使用し、実際のフリップとは無関係。変更不要                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
> LSP関連ファイル（`NativeLspService.ts` / `NativeLspClient.ts` / `lsp/types.ts`）はこのMRでは変更されていません。Part C TODOを参照してください。

## 検証

### A. コア機能のユニットテスト（core、`config.test.ts` / `mcp-client-manager.test.ts`）

1. `setMcpServers`は**置換（マージではない）**であり、初期化後に有効になります（`initialized`ガードによるスローはなくなりました）。
2. `reinitializeMcpServers`は、最初に`setMcpServers`を呼び出し、次に`discoverAllMcpToolsIncremental`を呼び出します。`initialize()`より前に呼び出しても**安全なno-op**です（スローなし、接続なし）。
3. `removeServer()` / `removeRuntimeMcpServer()`が`removePromptsByServer()`を呼び出すようになったことをアサートします（プロンプトリーク回帰ガード）。`mcp-client-manager.test.ts`のフィクスチャ（既に`connectionIdOf`をインポートしている）を再利用します。
   3b. **シングルセッションのフィンガープリント差分**: `getStatus()`が常に`CONNECTED`を返すモッククライアントを使用し、`discoverAllMcpToolsIncremental`を3回実行します。最初の接続でフィンガープリントを記録します。同じ設定で再実行しても**churnは発生しません**（`connect`は依然として1回）。その場で`args`を変更する（フィンガープリントが変わる）と、切断＋再接続が発生します（`disconnect` 1回、`connect` 2回）。これにより、シングルセッションパスで「接続済みだが設定が変更された」というケースがno-opとして見逃されなくなりました（共有プールの`desiredIds`と整合）。また、この実行では、再検出の前にそのサーバに対して`removeMcpToolsByServer` + `removePromptsByServer`が呼び出されることをアサートします。これにより、設定変更で削除/リネームされたツールやプロンプトが残存するのを防ぐ「再接続前に古いツール/プロンプトをクリア」を保証します。

### A'. ウォッチャー↔スキーマ統合ガード（cli、`settingsSchema.test.ts` / `settingsWatcher.test.ts`）

> この2つは**高**重要度の統合破損です。MCPのみの編集がウォッチャーの再起動要求抑制ゲートによって飲み込まれ、Part Bのコールバックが決して発火しなくなります。ウォッチャーレイヤーでの実際のカバレッジが**必須**です。`hot-reload.test.ts`でコールバックを直接呼び出しても、この障害はキャッチできません。

3c. **スキーマ固定**（`settingsSchema.test.ts`）: `mcpServers` / `mcp.allowed` / `mcp.excluded` は`requiresRestart`が`false`、親の`mcp`と`mcp.serverCommand`は`true`です。これにより、誰かがMCPキーを再起動必須に戻してホットリロード全体を静かに殺すことを防ぎます。
3d. **実際のウォッチャーが抑制しなくなる**（`settingsWatcher.test.ts`、実際の`SettingsWatcher`を使用し、fsはモック）: `mcpServers`のみ、または`mcp.excluded`のみを編集すると、それぞれ**1つの**`SettingsChangeEvent`がトリガーされます（フリップ前は抑制されていたはず）。これはサブタスク3のリスナーが実際に発火できることを保証するエンドツーエンドの回帰ガードです。

### B. サブスクライバーゲート分岐ユニットテスト（cli、`hot-reload.test.ts`）

`SettingsWatcher`を偽装し、すべてのゲート分岐をカバーします:

4. **`mcpServers`の変更** → 組み立てられたマップ（トップ階層を含む）で`reinitializeMcpServers`を呼び出す。
5. **`mcp.excluded`のみ（または`mcp.allowed`/保留中）を編集し、`mcpServers`は変更しない** → **それでも** reconcile をトリガーし、reconcile の前に`setExcludedMcpServers` / `setAllowedMcpServers` / `setPendingMcpServers`がすでに呼び出されている。これは`mcpGatingEqual`分岐、つまり修正されたギャップを検証します。`mcpServers`のみの差分ではこの変更を見逃していたでしょう。
6. **`mcpServers`も`mcp`ゲーティングリストも変更されていない**（例: テーマやスキルの編集） → `reinitializeMcpServers`を呼び出さない（両方のゲートが「未変更」の場合の早期returnを検証）。
7. **reconcile 実行中に2つの変更が発生した** → 結合して再チェックがもう一度実行される（再入可能性）。
8. **debounce**: 連続した複数回の保存（< 300ms）は、reconcile を**1回**だけトリガーする（ウォッチャーの300ms debounceと整合）。

### C. ゲートヘルパー純粋関数のユニットテスト（cli、`hot-reload.test.ts`）

9. `mcpServersEqual`: キーの順序が異なるが同じ値 → `true`; ネストされた設定フィールド（`args` / `env` / `headers`）の変更 → `false`; `undefined` vs `{}` → `true`; サーバの追加/削除 → `false`; `args`配列の順序変更 → `false`（コマンド引数の順序には意味がある）。
10. `mcpGatingEqual`: 3つのリストは「順序に依存しない」比較（`['a','b']` vs `['b','a']` → `true`）; いずれかのリストでアイテムの追加/削除 → `false`; `undefined` vs `[]` → `true`。

### D. 信頼境界エッジケース（cli + core）

> どちらも**高**重要度の信頼境界ポイントです。項目11は許可境界（Part F項目K — 設定はスタートアップフラグ内に狭まり、それを超えて広がることはない）を検証します。項目12はPart A項目4（プールパスの保留中チェック）に対応します。

11. **ホットリロードによる許可は、スタートアップフラグ内に狭まるが、それを超えて広がることはない**（Part F項目Kの境界。以前の「設定は広げられる」という立場を上書き）。`--allowed-mcp-server-names=a,b`で起動。その後設定変更で`mcp.allowed`が`[a, b, c]`に設定される。**アサート**: reconcile後、`c`は**依然として除外**（起動時の境界に制限される）され、`a`は許可される。設定編集で`[a]`に狭めると効果が現れる。スタートアップフラグがない場合、設定の許可リストは無制限に有効となる。（完全なマトリックスについてはPart F→検証を参照）
_ガード_: `recomputeMcpGating`は設定の許可リストと`getCliAllowedMcpServerNames()`をインターセクションし、それを超えて広がることはない。

12. **保留承認ゲートが共有プールモードでバイパスされない**（高リスク: 承認前にゲート対象サーバに接続してしまう）。デーモン/共有プールモード（`runDiscoverAllMcpToolsViaPool`）で、設定のホットリロードにより保留承認（`.mcp.json` / ワークスペース）のサーバが追加/編集される。**アサート**: ユーザーが承認する前は、プール接続を取得したりプロセスを起動したりしない。拒否されたゲート対象サーバは切断されたまま。すでに保留をスキップするシングルセッションパスと比較して、このテストはプールパスをガードする。
_ガード_: Part A項目4 — プールパスで`desiredIds`を構築する前/取得する前に`isMcpServerPendingApproval`チェックを行う。

### E. reconcile エッジケース（推奨カバレッジ。「incremental、全消去ではない」を検証）

13. **空 ↔ 非空**: サーバが0から1（最初）、1から0（最後）の両方で正しく reconcile され、残留するコネクション/ツール/プロンプトが残らない。
14. **フィンガープリントの変更がその1つのサーバにのみ影響**: サーバの`command` / `url` / `env` / `headers`を変更 → そのサーバのみ切断＋再接続、**他のすべてのコネクションは維持**（全消去や「ツール0」のギャップがないことを検証）。
15. **信頼されていないディレクトリ**: `isTrustedFolder()`がfalseの場合、ホットリロードはno-op（接続を確立しない）。
16. **`mcp.excluded`のトグル**: オンラインのサーバをexcludedに追加 → 切断され、ツール/プロンプトがクリアされる。excludedから削除 → 再接続される。