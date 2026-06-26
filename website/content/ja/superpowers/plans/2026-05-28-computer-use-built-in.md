# Computer Use 組み込み実装計画

> **エージェント型ワーカー向け:** 必須のサブスキル: `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使用して、タスクごとにこの計画を実装してください。各ステップはチェックボックス記法（`- [ ]`）で進捗を管理します。

**目標:** `open-computer-use` を qwen-code における設定不要の組み込み機能にする。9 つの computer-use ツールが遅延ツールリストに `computer_use__click`、`computer_use__type_text` などとして表示される。最初の呼び出し時に、アップストリームの npm バイナリが透過的にインストールされ、必要に応じて macOS のアクセシビリティ / 画面収録の許可設定をユーザーに案内し、アップストリームの MCP サーバーに呼び出しを転送する。

**アーキテクチャ:** アップストリームの `npx -y open-computer-use mcp` 上に構築された薄いシェル。バイナリはバンドルせず、アップストリームの `npx` キャッシュ + `.app` バンドルで配布と macOS TCC を処理する。9 つのツールは、パラメータ化された `ComputerUseTool` インスタンス（ツール名ごとに 1 つ）として登録され、シングルトンの `ComputerUseClient`（長時間実行される MCP stdio 子プロセスを保持）によってバックアップされる。ブートストラップステートマシンは、既存の qwen-code ツール許可（標準）→ 初回インストール確認 → オプションの macOS 許可ガイドの順にレイヤリングされる。

**技術スタック:** TypeScript, vitest, `@modelcontextprotocol/sdk`（すでに qwen-code の依存関係）、`node:child_process`、`node:fs/promises`。

---

## ファイル構造

**新規ファイル:**

```
packages/core/src/tools/computer-use/
  index.ts                          # registerComputerUseTools(registry, config); バレルエクスポート
  schemas.ts                        # ハードコードされた 9 つのスキーマ + 説明（アップストリームから同期）
  tool.ts                           # ComputerUseTool — パラメータ化された BaseDeclarativeTool
  client.ts                         # ComputerUseClient — シングルトン MCP stdio プロセスマネージャ
  bootstrap.ts                      # ステートマシン: probe → install confirm → install → perm guide
  install-state.ts                  # ~/.qwen/computer-use/installed.json 読み書き
  permission-detector.ts            # アップストリームのエラー文字列を解析して不足している権限を検出
  schemas.test.ts                   # 9 つのスキーマすべてがパースされ、名前が契約と一致することを確認
  tool.test.ts                      # パラメータ化されたツールの配線テスト
  client.test.ts                    # クライアントのライフサイクル（モックされた spawn）
  bootstrap.test.ts                 # ステートマシンの遷移テスト
  install-state.test.ts             # 状態ファイルのラウンドトリップテスト
  permission-detector.test.ts       # エラーパターンマッチングテスト
scripts/
  sync-computer-use-schemas.ts      # リリース時に実行されるスクリプト: アップストリームの tools/list をダンプ → schemas.ts
```

**変更ファイル:**

```
packages/core/src/tools/tool-names.ts                  # 9 つの COMPUTER_USE_* 定数を追加
packages/core/src/config/config.ts                     # computerUseEnabled フィールド + isComputerUseEnabled() + createToolRegistry() 内の登録呼び出しを追加
packages/cli/src/config/config.ts                      # settings.tools.computerUse.enabled → ConfigParameters.computerUseEnabled のマッピング
packages/cli/src/config/settingsSchema.ts              # tools.computerUse.enabled boolean 値を追加（デフォルト true）
```

**分割の根拠:** 各ファイルは単一責任を持つ。`client.ts` は MCP プロトコルを知っているが UX は知らない。`bootstrap.ts` は UX を知っているが MCP の詳細には触れない。`tool.ts` は `execute()` を介してそれらを配線する純粋な配管。テストはコードの隣に配置する。スキーマは分離されているため、同期スクリプトがロジックを変更せずにファイルを書き換えられる。

---

## フェーズ 1 — 基盤（ツール表面が見えるが、実行はしない）

### タスク 1: 9 つの computer-use ツールの ToolNames + ToolDisplayNames エントリを追加

**ファイル:**

- 変更: `packages/core/src/tools/tool-names.ts`

- [ ] **ステップ 1: 9 つの名前定数を追加**

`packages/core/src/tools/tool-names.ts` を編集 — `ToolNames` オブジェクト内、`EXIT_WORKTREE: 'exit_worktree',` の後に以下を追加:

```ts
  // Computer Use ツール — 組み込みだが、アップストリームの MCP サーバーによってバックアップされる。
  // すべて遅延; ユーザーが開始したリクエストが computer-use アクションをトリガーした場合にのみ表示される。
  // 詳細は packages/core/src/tools/computer-use/ を参照。
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

`ToolDisplayNames` にも同様にミラーリング:

```ts
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

（displayName は意図的に name と同じにしている。ツール名が `computer_use__click` であるのに、権限ダイアログに `Click` のような大文字の表示名が表示されるのを避けるため。）

- [ ] **ステップ 2: 既存の tool-names テストが引き続きパスすることを確認**

実行: `npm test -- packages/core/src/tools/tool-names`
期待結果: PASS（テストファイルがない場合は `npm run build -- --filter @qwen-code/qwen-code-core` を実行して型チェック）

- [ ] **ステップ 3: コミット**

```bash
git add packages/core/src/tools/tool-names.ts
git commit -m "feat(computer-use): add tool name constants"
```

---

### タスク 2: ハードコードされたスキーマモジュール

**ファイル:**

- 作成: `packages/core/src/tools/computer-use/schemas.ts`
- 作成: `packages/core/src/tools/computer-use/schemas.test.ts`

9 つのスキーマは、アップストリームの `open-computer-use mcp` `tools/list` 出力をミラーリングする。これらはアップストリームバージョン `^0.x.y` に固定される（実装時に `schemas.ts` の先頭に実際の固定値を記入する TODO — `npx -y open-computer-use@latest --version` を実行して現在の最新版を取得）。

- [ ] **ステップ 1: 失敗するテストを書く**

`packages/core/src/tools/computer-use/schemas.test.ts` を作成:

```ts
import { describe, it, expect } from 'vitest';
import { COMPUTER_USE_SCHEMAS, COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('computer-use schemas', () => {
  it('exports exactly 9 schemas', () => {
    expect(Object.keys(COMPUTER_USE_SCHEMAS)).toHaveLength(9);
  });

  it('each tool name matches the upstream convention (no computer_use__ prefix)', () => {
    // schemas.ts ではアップストリームの名前をそのまま使用する（"click", "type_text"）。
    // computer_use__ プレフィックスは qwen-code 側のラッパーにのみ存在する。
    for (const name of COMPUTER_USE_TOOL_NAMES) {
      expect(name).not.toContain('computer_use__');
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });

  it('every schema has the standard object structure', () => {
    for (const [name, schema] of Object.entries(COMPUTER_USE_SCHEMAS)) {
      expect(schema.description, `${name} missing description`).toBeTruthy();
      expect(
        schema.parameterSchema,
        `${name} missing parameterSchema`,
      ).toBeTruthy();
      expect((schema.parameterSchema as { type: string }).type).toBe('object');
    }
  });

  it('list_apps takes no parameters', () => {
    expect(COMPUTER_USE_SCHEMAS.list_apps.parameterSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('click requires app and either element_index or x/y', () => {
    const schema = COMPUTER_USE_SCHEMAS.click.parameterSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties).toHaveProperty('app');
    expect(schema.properties).toHaveProperty('element_index');
    expect(schema.properties).toHaveProperty('x');
    expect(schema.properties).toHaveProperty('y');
    expect(schema.required).toContain('app');
  });
});
```

- [ ] **ステップ 2: テストを実行して失敗を確認**

実行: `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
期待結果: FAIL（"Cannot find module './schemas.js'"）

- [ ] **ステップ 3: スキーマモジュールを書く**

`packages/core/src/tools/computer-use/schemas.ts` を作成。以下のスキーマは MVP — アップストリームのツールサーフェスとパラメータ命名を反映している。`sync-computer-use-schemas.ts` スクリプト（タスク 13）は、qwen-code の各リリース前に CI でライブのアップストリームスナップショットからこのファイルを再生成する。

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * アップストリーム open-computer-use の 9 つのツールのハードコードされたスキーマ。
 *
 * 固定されたアップストリームバージョン: <PIN_VERSION_DURING_IMPL>
 *
 * `scripts/sync-computer-use-schemas.ts` によって再生成される — 手動編集禁止。
 * アップストリームのツール名（"click", "type_text"）はそのままここに現れる;
 * `computer_use__` プレフィックスは `tool.ts` 内の qwen-code 側のラッパーによって追加され、
 * モデルが MCP の概念を漏らさずに `computer_use__click` を見ることができるようにする。
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = [
  'list_apps',
  'get_app_state',
  'click',
  'perform_secondary_action',
  'scroll',
  'drag',
  'type_text',
  'press_key',
  'set_value',
] as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<
  ComputerUseToolName,
  ComputerUseToolSchema
> = {
  list_apps: {
    description:
      '現在のマシンで実行中または最近使用したデスクトップアプリケーションの一覧を返します。各アプリはバンドル ID と表示名で返されます。get_app_state の前にこれを使用して、操作可能なアプリを特定します。',
    parameterSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  get_app_state: {
    description:
      '指定されたアプリケーションの現在のアクセシビリティツリーとスクリーンショットを取得します。後続のアクション（click, set_value など）がターゲットにできる element_index 値を返します。要素をターゲットにするアクションの前に必ずこれを呼び出してください。element_index の値は現在のスナップショット内でのみ有効です。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description:
            'アプリケーションのバンドル ID または表示名（例: "TextEdit", "com.apple.Safari"）。',
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  click: {
    description:
      'ターゲットを左クリックします。最近の get_app_state の結果から element_index を優先してください。AX 要素がターゲットに一致しない場合のみ、x/y スクリーンショットピクセル座標にフォールバックします。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'ターゲットアプリケーション。' },
        element_index: {
          type: 'integer',
          description: '最新の get_app_state の要素リストへのインデックス。',
        },
        x: {
          type: 'integer',
          description: 'スクリーンショットピクセルでの X 座標。',
        },
        y: {
          type: 'integer',
          description: 'スクリーンショットピクセルでの Y 座標。',
        },
        click_count: {
          type: 'integer',
          description: 'クリック回数（1 = シングルクリック, 2 = ダブルクリック）。',
          default: 1,
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  perform_secondary_action: {
    description:
      'ターゲットの AX 要素が公開しているクリック以外のセマンティックアクション（例: "Raise", "ShowMenu"）を実行します。アクションがその要素に対して有効でない場合はエラーを返します。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        action: {
          type: 'string',
          description: '実行する AX アクション名。',
        },
      },
      required: ['app', 'element_index', 'action'],
      additionalProperties: false,
    },
  },
  scroll: {
    description:
      'ターゲット要素内または指定された座標でスクロールします。`pages` はページ数の小数値（正の値 = 下スクロール、負の値 = 上スクロール）。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        x: { type: 'integer' },
        y: { type: 'integer' },
        pages: {
          type: 'number',
          description: 'スクロールするページ数の小数値（負の値 = 上スクロール）。',
        },
      },
      required: ['app', 'pages'],
      additionalProperties: false,
    },
  },
  drag: {
    description:
      'ターゲットアプリケーションウィンドウ内で、ある座標ペアから別の座標ペアへのドラッグを実行します。座標はスクリーンショットピクセル単位です。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        from_x: { type: 'integer' },
        from_y: { type: 'integer' },
        to_x: { type: 'integer' },
        to_y: { type: 'integer' },
      },
      required: ['app', 'from_x', 'from_y', 'to_x', 'to_y'],
      additionalProperties: false,
    },
  },
  type_text: {
    description:
      'ターゲットアプリケーションの現在フォーカスされているテキスト入力にテキストを入力します。入力エリアがフォーカスされていない場合は先にクリックしてください。フォーカスされていないテキストフィールドには、代わりに set_value を推奨します。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        text: {
          type: 'string',
          description: '入力するテキスト。Unicode 対応。',
        },
      },
      required: ['app', 'text'],
      additionalProperties: false,
    },
  },
  press_key: {
    description:
      'ターゲットアプリケーションに対してキーボードキーまたはコンボを押します。キー名は xdotool の規則に従います（例: "Return", "BackSpace", "cmd+c", "Page_Up"）。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        key: { type: 'string' },
      },
      required: ['app', 'key'],
      additionalProperties: false,
    },
  },
  set_value: {
    description:
      '設定可能な AX 要素（テキストフィールド、スライダーなど）の値を直接設定します。ターゲットが設定可能でない場合はエラーを返します。',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        value: { type: 'string' },
      },
      required: ['app', 'element_index', 'value'],
      additionalProperties: false,
    },
  },
};
```

- [ ] **ステップ 4: テストを実行して成功を確認**

実行: `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
期待結果: PASS, 5 tests

- [ ] **ステップ 5: コミット**

```bash
git add packages/core/src/tools/computer-use/schemas.ts packages/core/src/tools/computer-use/schemas.test.ts
git commit -m "feat(computer-use): hardcode upstream tool schemas"
```

---

### タスク 3: enableComputerUse のための設定スキーマ + Config の配線

**ファイル:**

- 変更: `packages/cli/src/config/settingsSchema.ts`
- 変更: `packages/cli/src/config/config.ts`
- 変更: `packages/core/src/config/config.ts`

- [ ] **ステップ 1: 設定エントリを追加**

`packages/cli/src/config/settingsSchema.ts` を編集。既存のスキーマはカテゴリごとにグループ化されている。Computer Use はツール機能であり、実験的ではない — 新しい `tools` サブグループが存在しない場合は作成し、既存のものがあればその中に追加する。grep を使用:

```bash
grep -n "tools:" packages/cli/src/config/settingsSchema.ts | head -5
```

`tools:` キーが存在する場合は、その下に新しいプロパティを追加する。存在しない場合は、トップレベルのグループを追加する。パターン（`experimental.cron` エントリの近く、約 2298 行目に追加）:

```ts
  tools: {
    type: 'object',
    label: 'ツール',
    category: 'ツール',
    requiresRestart: true,
    default: {},
    description: 'ツール機能の有効/無効切り替え。',
    showInDialog: false,
    properties: {
      computerUse: {
        type: 'object',
        label: 'Computer Use',
        category: 'ツール',
        requiresRestart: true,
        default: {},
        description: 'アップストリームの open-computer-use MCP サーバーを介したクロスプラットフォームデスクトップ自動化。ツール: list_apps, get_app_state, click, type_text, scroll, drag, press_key, perform_secondary_action, set_value。初回呼び出し時に、アップストリームのバイナリが npx 経由で取得され、必要に応じて macOS のアクセシビリティ / 画面収録の許可設定をユーザーに案内します。',
        showInDialog: false,
        properties: {
          enabled: {
            type: 'boolean',
            label: 'Computer Use を有効にする',
            category: 'ツール',
            requiresRestart: true,
            default: true,
            description: '有効な場合（デフォルト）、9 つの computer_use__* ツールが遅延組み込みツールとして登録されます。',
            showInDialog: true,
          },
        },
      },
    },
  },
```

`tools:` グループがすでに存在する場合は、その `properties` の下に `computerUse:` プロパティだけを追加する。

- [ ] **ステップ 2: 設定 → ConfigParameters の配線**

`packages/cli/src/config/config.ts` を編集。既存の行 `cronEnabled: settings.experimental?.cron ?? false,`（1833 行目付近）を見つけ、すぐ下に以下を追加:

```ts
    computerUseEnabled: settings.tools?.computerUse?.enabled ?? true,
```

- [ ] **ステップ 3: Config フィールド + ゲッターを追加**

`packages/core/src/config/config.ts` を編集:

(a) `ConfigParameters` インターフェース内（`cronEnabled?: boolean;` を検索）、すぐ下に以下を追加:

```ts
  computerUseEnabled?: boolean;
```

(b) `Config` クラスのフィールド内（`private readonly cronEnabled: boolean = false;` を検索）、すぐ下に以下を追加:

```ts
  private readonly computerUseEnabled: boolean = true;
```

(c) `Config` コンストラクタ内（`this.cronEnabled = params.cronEnabled ?? false;` を検索）、すぐ下に以下を追加:

```ts
this.computerUseEnabled = params.computerUseEnabled ?? true;
```

(d) `isCronEnabled()` の近く（`isCronEnabled(): boolean {` を検索）、兄弟ゲッターを追加:

```ts
  isComputerUseEnabled(): boolean {
    return this.computerUseEnabled;
  }
```

- [ ] **ステップ 4: 型チェック**

実行: `npm run build -- --filter @qwen-code/qwen-code-core --filter @qwen-code/qwen-code`
期待結果: PASS

- [ ] **ステップ 5: コミット**

```bash
git add packages/cli/src/config/settingsSchema.ts packages/cli/src/config/config.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): add enableComputerUse setting (default true)"
```

---

## フェーズ 2 — トランスポート（npx stdio 上の MCP クライアント）

### タスク 4: ComputerUseClient — シングルトン MCP stdio プロセスマネージャ

**ファイル:**

- 作成: `packages/core/src/tools/computer-use/client.ts`
- 作成: `packages/core/src/tools/computer-use/client.test.ts`

注: クライアントは `@modelcontextprotocol/sdk`（すでに依存関係にあり、`packages/core/src/tools/mcp-client.ts` を参照）を使用する。`StdioClientTransport` を使用して `npx -y open-computer-use mcp` を起動する。

- [ ] **ステップ 1: 失敗するテストを書く**

`packages/core/src/tools/computer-use/client.test.ts` を作成:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputerUseClient } from './client.js';

describe('ComputerUseClient', () => {
  let client: ComputerUseClient;

  beforeEach(() => {
    client = new ComputerUseClient({
      packageSpec: 'open-computer-use@latest',
      onProgress: vi.fn(),
    });
  });

  it('is constructible', () => {
    expect(client).toBeDefined();
  });

  it('reports not-started before start() is called', () => {
    expect(client.isStarted()).toBe(false);
  });

  it('returns the same instance for repeated callers via singleton', () => {
    const a = ComputerUseClient.shared();
    const b = ComputerUseClient.shared();
    expect(a).toBe(b);
  });
});
```

- [ ] **ステップ 2: テストを実行して失敗を確認**

実行: `npm test -- packages/core/src/tools/computer-use/client.test.ts`
期待結果: FAIL — モジュールが見つからない
- [ ] **Step 3: クライアントを実装する**

`packages/core/src/tools/computer-use/client.ts` を作成します:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  CallToolResult,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * 上流のopen-computer-useバイナリに対するシングルトンstdio MCPクライアント。
 *
 * `npx -y <packageSpec> mcp` 経由で起動されます。初回起動時はnpxのダウンロードコスト（キャッシュがない場合最大約60秒）が発生します。
 * 2回目以降の起動はnpxキャッシュを再利用するため、サブ秒で完了します。
 *
 * ライフサイクル: 最初の `callTool` 呼び出しで遅延起動します。プロセスは `stop()` が呼ばれるか、qwen-codeが終了するまで生存します。
 * 状態（アプリごとの element_index マップ）はプロセス内に保持されます。プロセスが再起動された場合、モデルは要素をターゲットとしたアクションを実行する前に、再度 `get_app_state` を呼び出す必要があります。
 */
export interface ComputerUseClientOptions {
  /** npxに渡すnpmパッケージスペック。例: "open-computer-use@^0.3.0"。 */
  packageSpec: string;
  /** 低速処理中の進捗メッセージ用ストリーミングフック。 */
  onProgress?: (message: string) => void;
}

export class ComputerUseClient {
  private static singleton: ComputerUseClient | undefined;

  private readonly packageSpec: string;
  private readonly onProgress: (message: string) => void;
  private client: Client | undefined;
  private transport: StdioClientTransport | undefined;
  private startPromise: Promise<void> | undefined;

  constructor(options: ComputerUseClientOptions) {
    this.packageSpec = options.packageSpec;
    this.onProgress = options.onProgress ?? (() => {});
  }

  /**
   * 共有シングルトンインスタンス。初回アクセス時にデフォルトオプションで作成されます。
   * テストでは `setSharedForTest()` で置き換え可能です。
   */
  static shared(): ComputerUseClient {
    if (!ComputerUseClient.singleton) {
      ComputerUseClient.singleton = new ComputerUseClient({
        packageSpec:
          process.env['QWEN_COMPUTER_USE_PACKAGE'] ??
          'open-computer-use@latest',
      });
    }
    return ComputerUseClient.singleton;
  }

  /** テスト専用: シングルトンを置き換えます。 */
  static setSharedForTest(replacement: ComputerUseClient | undefined): void {
    ComputerUseClient.singleton = replacement;
  }

  isStarted(): boolean {
    return this.client !== undefined;
  }

  /**
   * 上流のMCPサーバーを起動します。冪等: 同時に呼び出された場合も同じ進行中のstart Promiseを共有します。
   *
   * 起動失敗時（ネットワークダウン、npx不在など）には例外をスローします。
   * 呼び出し元（ブートストラップ状態マシン）は、例外をユーザー向けのUXにマッピングする責任を負います。
   */
  async start(): Promise<void> {
    if (this.client) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.doStart().finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    this.onProgress('Computer Useを起動しています...');

    // 約3秒経過したら、低速パスがダウンロード中であることを示すヒントを表示
    const downloadHintTimer = setTimeout(() => {
      this.onProgress(
        'Computer Useバイナリをダウンロードしています（初回は約60秒かかることがあります）...',
      );
    }, 3000);

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', this.packageSpec, 'mcp'],
        // 環境変数を継承して、HTTPS_PROXY などがnpxに流れるようにする
        env: { ...process.env } as Record<string, string>,
      });
      const client = new Client(
        { name: 'qwen-code-computer-use', version: '1.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);
      this.transport = transport;
      this.client = client;
    } finally {
      clearTimeout(downloadHintTimer);
    }
  }

  /**
   * 上流サーバーが公開するツールを一覧表示します。スキーマ同期スクリプトやブートストラップ診断に使用されます。
   */
  async listTools(): Promise<ListToolsResult> {
    if (!this.client) throw new Error('ComputerUseClientが開始されていません');
    return this.client.listTools();
  }

  /**
   * 上流の名前（qwen-code側の `computer_use__` プレフィックス付き名前ではなく）でツールを呼び出します。
   * 生のMCP結果を返すため、呼び出し元は `isError` を検査し、テキストコンテンツを解析できます。
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    if (!this.client) throw new Error('ComputerUseClientが開始されていません');
    return this.client.callTool({
      name,
      arguments: args,
    }) as Promise<CallToolResult>;
  }

  /** 子プロセスを終了します。複数回呼び出しても安全です。 */
  async stop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;
    if (client) {
      try {
        await client.close();
      } catch {
        // ベストエフォートのクリーンアップ
      }
    }
  }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

実行: `npm test -- packages/core/src/tools/computer-use/client.test.ts`
期待: PASS、3テスト

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/tools/computer-use/client.ts packages/core/src/tools/computer-use/client.test.ts
git commit -m "feat(computer-use): 上流バイナリ用のMCP stdioクライアント"
```

---

### Task 5: ComputerUseTool — パラメータ化されたBaseDeclarativeToolラッパー

**ファイル:**

- 作成: `packages/core/src/tools/computer-use/tool.ts`
- 作成: `packages/core/src/tools/computer-use/tool.test.ts`

このタスクでは、ツールは `ComputerUseClient` が既に開始されていることを前提に転送するだけです。ブートストラップ状態マシンはPhase 3でこれをラップします。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/src/tools/computer-use/tool.test.ts` を作成:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComputerUseTool } from './tool.js';
import { ComputerUseClient } from './client.js';
import { COMPUTER_USE_SCHEMAS } from './schemas.js';

function makeFakeClient(
  callToolImpl: (name: string, args: unknown) => Promise<unknown>,
) {
  const fake = {
    isStarted: () => true,
    start: vi.fn(async () => {}),
    callTool: vi.fn(callToolImpl),
    stop: vi.fn(async () => {}),
  };
  return fake as unknown as ComputerUseClient;
}

describe('ComputerUseTool', () => {
  beforeEach(() => {
    ComputerUseClient.setSharedForTest(undefined);
  });

  it('qwen側の名前が computer_use__ プレフィックスで公開される', () => {
    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    expect(tool.name).toBe('computer_use__click');
    expect(tool.displayName).toBe('computer_use__click');
  });

  it('自身を deferred としてマークする', () => {
    const tool = new ComputerUseTool(
      'list_apps',
      COMPUTER_USE_SCHEMAS.list_apps,
    );
    expect(tool.shouldDefer).toBe(true);
    expect(tool.alwaysLoad).toBe(false);
  });

  it('execute() を共有クライアントに上流名で転送する', async () => {
    const fake = makeFakeClient(async () => ({
      content: [{ type: 'text', text: '[]' }],
      isError: false,
    }));
    ComputerUseClient.setSharedForTest(fake);

    const tool = new ComputerUseTool(
      'list_apps',
      COMPUTER_USE_SCHEMAS.list_apps,
    );
    const invocation = tool.build({});
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(fake.callTool).toHaveBeenCalledWith('list_apps', {});
  });

  it('クライアントがisError=trueを返した場合、エラー結果を返す', async () => {
    const fake = makeFakeClient(async () => ({
      content: [{ type: 'text', text: 'something went wrong' }],
      isError: true,
    }));
    ComputerUseClient.setSharedForTest(fake);

    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    const invocation = tool.build({ app: 'TextEdit' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(String(result.llmContent)).toContain('something went wrong');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

実行: `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
期待: FAIL — モジュールが見つからない

- [ ] **Step 3: ツールを実装する**

`packages/core/src/tools/computer-use/tool.ts` を作成:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from '../tools.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ComputerUseClient } from './client.js';
import type { ComputerUseToolName, ComputerUseToolSchema } from './schemas.js';
import { safeJsonStringify } from '../../utils/safeJsonStringify.js';
import { runBootstrap } from './bootstrap.js';

type ComputerUseParams = Record<string, unknown>;

class ComputerUseInvocation extends BaseToolInvocation<
  ComputerUseParams,
  ToolResult
> {
  constructor(
    private readonly upstreamName: ComputerUseToolName,
    params: ComputerUseParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return safeJsonStringify(this.params);
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const client = ComputerUseClient.shared();

    // Phase 3 でブートストラップ状態マシンがここに配線されます。
    // それまでは、この直接的な呼び出しで問題ありません。バイナリが既にインストールされており、パーミッションが付与されている場合に機能します。
    await runBootstrap(client, { signal, updateOutput });

    let mcpResult: CallToolResult;
    try {
      mcpResult = await client.callTool(this.upstreamName, this.params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Computer Use ツール '${this.upstreamName}' が失敗しました: ${message}`,
        returnDisplay: `エラー: ${message}`,
        error: { message },
      };
    }

    const text = mcpResult.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n');

    if (mcpResult.isError) {
      return {
        llmContent: text || `ツール '${this.upstreamName}' がisError=trueを返しました`,
        returnDisplay: text || 'エラー',
        error: { message: text || 'ツールがエラーを返しました' },
      };
    }

    return {
      llmContent: text,
      returnDisplay: text,
    };
  }
}

export class ComputerUseTool extends BaseDeclarativeTool<
  ComputerUseParams,
  ToolResult
> {
  constructor(
    private readonly upstreamName: ComputerUseToolName,
    schema: ComputerUseToolSchema,
  ) {
    const qwenName = `computer_use__${upstreamName}`;
    super(
      qwenName,
      qwenName, // displayName == name; UIでMCPブランディングはしない
      schema.description,
      Kind.Other,
      schema.parameterSchema,
      true, // isOutputMarkdown — 多くの結果はJSON形式のテキストまたはスクリーンショット
      true, // canUpdateOutput — ブートストラップが進捗をストリーミング
      true, // shouldDefer — ToolSearchでのみ表示
      false, // alwaysLoad
      `computer use desktop click type screenshot mouse keyboard scroll drag automation gui app native`,
    );
  }

  protected createInvocation(
    params: ComputerUseParams,
  ): ToolInvocation<ComputerUseParams, ToolResult> {
    return new ComputerUseInvocation(this.upstreamName, params);
  }
}
```

注: テストは `runBootstrap` を参照していますが、これはPhase 3で実装されます。今のところ、テストが通るようにスタブの `bootstrap.ts` を作成します:

`packages/core/src/tools/computer-use/bootstrap.ts` を作成:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComputerUseClient } from './client.js';

export interface BootstrapContext {
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

/**
 * スタブ: Phase 3で完全な状態マシンに置き換えられます
 * （インストール確認 → インストール → パーミッションプローブ → ガイド → ポーリング）。
 * 現時点では: バイナリがインストールされ、パーミッションが付与されていることを前提とし、
 * 必要に応じてクライアントを開始するだけです。
 */
export async function runBootstrap(
  client: ComputerUseClient,
  _ctx: BootstrapContext,
): Promise<void> {
  if (!client.isStarted()) {
    await client.start();
  }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

実行: `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
期待: PASS、4テスト

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/tools/computer-use/tool.ts packages/core/src/tools/computer-use/tool.test.ts packages/core/src/tools/computer-use/bootstrap.ts
git commit -m "feat(computer-use): ComputerUseTool ラッパー + ブートストラップスタブ"
```

---

### Task 6: ToolRegistryにツールを登録する

**ファイル:**

- 作成: `packages/core/src/tools/computer-use/index.ts`
- 変更: `packages/core/src/config/config.ts`

- [ ] **Step 1: 登録ヘルパーを作成する**

`packages/core/src/tools/computer-use/index.ts` を作成:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

export { ComputerUseTool } from './tool.js';
export { ComputerUseClient } from './client.js';
export type { ComputerUseToolName, ComputerUseToolSchema } from './schemas.js';
export { COMPUTER_USE_TOOL_NAMES, COMPUTER_USE_SCHEMAS } from './schemas.js';

import { ComputerUseTool } from './tool.js';
import { COMPUTER_USE_SCHEMAS, COMPUTER_USE_TOOL_NAMES } from './schemas.js';
import type { ToolRegistry } from '../tool-registry.js';

/**
 * 9つすべてのcomputer-useツールをレジストリに遅延ファクトリとして登録します。
 * 各ツールは deferred (`shouldDefer=true`) であるため、ToolSearchのキーワード一致でのみ表示されます。
 * 最初の呼び出し時にブートストラップ状態マシン（インストール確認 → インストール → パーミッションフロー）がトリガーされ、
 * その後上流のMCPサーバーに転送されます。
 *
 * `Config.isComputerUseEnabled()` がtrueの場合にのみ呼び出す必要があります。
 */
export function registerComputerUseTools(registry: ToolRegistry): void {
  for (const upstreamName of COMPUTER_USE_TOOL_NAMES) {
    const schema = COMPUTER_USE_SCHEMAS[upstreamName];
    const qwenName = `computer_use__${upstreamName}`;
    registry.registerFactory(
      qwenName,
      async () => new ComputerUseTool(upstreamName, schema),
    );
  }
}
```

- [ ] **Step 2: Config.createToolRegistry に組み込む**

`packages/core/src/config/config.ts` を編集します。条件付きでcronツールを登録している既存のブロック（約3952行目）を見つけます:

```ts
    if (this.isCronEnabled()) {
      await registerLazy(ToolNames.CRON_CREATE, async () => { ... });
      ...
    }
```

cronブロックの直下（monitorブロックの前）に、以下を追加します:

```ts
// 無効でなければcomputer-useツールを登録する。
// 9つすべてが deferred です — ToolSearchのキーワード一致でのみ表示されます
// （packages/core/src/tools/computer-use/ を参照）。
if (this.isComputerUseEnabled()) {
  const { registerComputerUseTools } = await import(
    '../tools/computer-use/index.js'
  );
  registerComputerUseTools(registry);
}
```

- [ ] **Step 3: 登録テストを追加する**

既存のツールレジストリテストに追加するか、`packages/core/src/tools/computer-use/registration.test.ts` を作成:

```ts
import { describe, it, expect, vi } from 'vitest';
import { registerComputerUseTools } from './index.js';
import { COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('registerComputerUseTools', () => {
  it('9つの上流ツールそれぞれに computer_use__ プレフィックスを付けてファクトリを登録する', () => {
    const registered = new Set<string>();
    const fakeRegistry = {
      registerFactory: vi.fn((name: string) => {
        registered.add(name);
      }),
    } as never;

    registerComputerUseTools(fakeRegistry);

    expect(registered.size).toBe(9);
    for (const name of COMPUTER_USE_TOOL_NAMES) {
      expect(registered.has(`computer_use__${name}`)).toBe(true);
    }
  });
});
```

- [ ] **Step 4: テスト + 型チェックを実行する**

実行:

```bash
npm test -- packages/core/src/tools/computer-use/
npm run build -- --filter @qwen-code/qwen-code-core
```

期待: すべてPASS。

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/tools/computer-use/index.ts packages/core/src/tools/computer-use/registration.test.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): 有効時に9つのdeferredツールを登録"
```

---

### Task 7: 手動スモークテスト — ツールが表示され、正常系の呼び出しが動作する

これはコーディング不要のゲートです。ブートストラップUXを積み上げる前に、基盤が機能することを確認します。

- [ ] **Step 1: 上流バイナリを事前インストールする（1回限り、手動）**

ターミナルで実行:

```bash
npx -y open-computer-use@latest --version
```

macOSの場合: さらに `npx -y open-computer-use@latest doctor` を実行し、促されたパーミッションをすべて許可します。これにより、ブートストラップをバイパスしてトランスポート層を単独で検証できます。

- [ ] **Step 2: qwen-code をビルドする**

実行: `npm run build`
期待: PASS。

- [ ] **Step 3: qwen-code を起動してツールの検出をテストする**

qwen-codeを起動し、モデルに次のように依頼します: _"ToolSearch ツールを使って、クエリ 'click computer use' でデスクトップ自動化ツールを検索してください。"_

期待: ToolSearch が 9 つの `computer_use__*` スキーマを返す。

- [ ] **Step 4: パーミッション不要のツールをテストする**

次のように依頼: _"computer_use__list_apps ツールを使って、現在実行中のデスクトップアプリの一覧を表示してください。"_

期待: 最初の呼び出しでは "Computer Useを起動しています..." が数秒表示され（npxキャッシュがコールドの場合はさらに長い）、その後実行中のアプリの一覧が返される。同じセッション内のそれ以降の呼び出しは高速。

- [ ] **Step 5: コミットは不要; これはスモークゲートです**

ここで何かが失敗した場合、Phase 3に進む前に停止してデバッグしてください。

---

## Phase 3 — ブートストラップUX（インストール確認 + パーミッションガイド）

このフェーズでは、Task 5の `runBootstrap` スタブを完全な状態マシンに置き換えます。

### Task 8: インストール状態の永続化

**ファイル:**

- 作成: `packages/core/src/tools/computer-use/install-state.ts`
- 作成: `packages/core/src/tools/computer-use/install-state.test.ts`

`~/.qwen/computer-use/installed.json` に永続化:

```json
{
  "approvedPackageSpec": "open-computer-use@^0.3.0",
  "approvedAtIso": "2026-05-28T10:00:00Z"
}
```

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/src/tools/computer-use/install-state.test.ts` を作成:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadInstallState,
  saveInstallState,
  isPackageSpecApproved,
  installStatePathFor,
} from './install-state.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('install-state', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-test-'));
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('状態ファイルが存在しない場合 undefined を返す', async () => {
    expect(await loadInstallState(tmpHome)).toBeUndefined();
  });

  it('状態のラウンドトリップ', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    const loaded = await loadInstallState(tmpHome);
    expect(loaded).toEqual({
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
  });

  it('isPackageSpecApproved は状態がない場合 false を返す', async () => {
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(false);
  });

  it('isPackageSpecApproved は完全一致の場合 true を返す', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(true);
  });

  it('isPackageSpecApproved はバージョンが異なる場合 false を返す', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.4.0'),
    ).toBe(false);
  });
});
```
- [ ] **ステップ 2: テストを実行して失敗することを確認**

実行: `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
期待結果: FAIL — モジュールが見つかりません

- [ ] **ステップ 3: モジュールを実装**

`packages/core/src/tools/computer-use/install-state.ts` を作成:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export interface InstallState {
  /** ユーザーが承認したパッケージスペック (例: "open-computer-use@^0.3.0")。 */
  approvedPackageSpec: string;
  /** 承認日時のISO 8601 UTCタイムスタンプ。 */
  approvedAtIso: string;
}

/**
 * インストール状態ファイルへのパス。テストが一時ディレクトリを指せるようにエクスポート。
 */
export function installStatePathFor(home: string = homedir()): string {
  return join(home, '.qwen', 'computer-use', 'installed.json');
}

export async function loadInstallState(
  home: string = homedir(),
): Promise<InstallState | undefined> {
  try {
    const text = await readFile(installStatePathFor(home), 'utf8');
    const parsed = JSON.parse(text) as InstallState;
    // 最小限の形状チェック — 古いファイルや不正なファイルは「未承認」として扱う。
    if (typeof parsed?.approvedPackageSpec !== 'string') return undefined;
    if (typeof parsed?.approvedAtIso !== 'string') return undefined;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
    // 読み取り不能/不正な状態は「未承認」として扱う — 再プロンプトは安全。
    // 不正なファイルを承認済みとして扱うと、サイレントインストールを引き起こすため。
    return undefined;
  }
}

export async function saveInstallState(
  home: string = homedir(),
  state: InstallState,
): Promise<void> {
  const path = installStatePathFor(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * 永続化された状態のパッケージスペックが、これからインストールしようとしているものと正確に一致するかどうかを判定。
 * スペックが異なる場合（バージョン固定の変更など）は再承認が必要。
 * ユーザーが以前承認したのは古い/小さい/ライセンスの異なるバージョンである可能性があるため。
 */
export async function isPackageSpecApproved(
  home: string = homedir(),
  packageSpec: string,
): Promise<boolean> {
  const state = await loadInstallState(home);
  return state?.approvedPackageSpec === packageSpec;
}
```

- [ ] **ステップ 4: テストを実行して成功することを確認**

実行: `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
期待結果: PASS, 5 tests

- [ ] **ステップ 5: コミット**

```bash
git add packages/core/src/tools/computer-use/install-state.ts packages/core/src/tools/computer-use/install-state.test.ts
git commit -m "feat(computer-use): persist install approval state under ~/.qwen"
```

---

### Task 9: パーミッションエラー検出器

**ファイル:**

- 作成: `packages/core/src/tools/computer-use/permission-detector.ts`
- 作成: `packages/core/src/tools/computer-use/permission-detector.test.ts`

- [ ] **ステップ 1: 失敗するテストを書く**

`packages/core/src/tools/computer-use/permission-detector.test.ts` を作成:

```ts
import { describe, it, expect } from 'vitest';
import { detectPermissionError } from './permission-detector.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

function textErrorResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

describe('detectPermissionError', () => {
  it('isError が false の場合は "none" を返す', () => {
    expect(
      detectPermissionError({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      }),
    ).toBe('none');
  });

  it('アクセシビリティパーミッション不足を検出（上流の表現）', () => {
    // AccessibilitySnapshot.swift:104 より
    const result = textErrorResult(
      'Accessibility permission is required. Run `open-computer-use doctor` and grant access to Open Computer Use.',
    );
    expect(detectPermissionError(result)).toBe('accessibility');
  });

  it('スクリーンレコーディングパーミッション不足を検出', () => {
    const result = textErrorResult(
      'Screen Recording permission is required to capture this window.',
    );
    expect(detectPermissionError(result)).toBe('screenRecording');
  });

  it('フォールバックとして generic doctor マーカーを介して検出', () => {
    const result = textErrorResult(
      'Some unfamiliar error. Run `open-computer-use doctor` for help.',
    );
    expect(detectPermissionError(result)).toBe('unknown_permission');
  });

  it('無関係なエラーには "other" を返す', () => {
    expect(
      detectPermissionError(textErrorResult('appNotFound("ImaginaryApp")')),
    ).toBe('other');
  });
});
```

- [ ] **ステップ 2: テストを実行して失敗することを確認**

実行: `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
期待結果: FAIL — モジュールが見つかりません

- [ ] **ステップ 3: 検出器を実装**

`packages/core/src/tools/computer-use/permission-detector.ts` を作成:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * 上流MCP結果が示すパーミッション問題の種類（ある場合）。
 * 上流はMCP経由で型付きエラーコードを公開していないため（詳細は
 * `packages/OpenComputerUseKit/Sources/OpenComputerUseKit/Errors.swift`
 * を参照）、メッセージ文字列に基づいて分類する。
 *
 * 長期的な修正としては上流に typed errorKind をPRすること。
 * 現時点ではこの文字列検出が契約である。
 */
export type PermissionErrorKind =
  | 'none' // 成功、またはエラーでない結果
  | 'other' // エラーだがパーミッション問題ではない
  | 'accessibility' // AX不足
  | 'screenRecording' // スクリーンレコーディング不足
  | 'unknown_permission'; // doctor マーカーに一致するが、どの種類か特定できない

/**
 * 上流で既知のエラーパターン。順序は重要 — より具体的なパターンを先に。
 */
const PATTERNS: Array<{ kind: PermissionErrorKind; regex: RegExp }> = [
  { kind: 'accessibility', regex: /accessibility permission is required/i },
  { kind: 'screenRecording', regex: /screen recording permission/i },
  // フォールバック: doctor コマンドに言及するエラーはおそらくパーミッション関連。
  // 最後にリストすることで、より具体的なパターンを妨げないようにする。
  { kind: 'unknown_permission', regex: /open-computer-use\s+doctor/i },
];

export function detectPermissionError(
  result: CallToolResult,
): PermissionErrorKind {
  if (!result.isError) return 'none';
  const text = result.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
  for (const { kind, regex } of PATTERNS) {
    if (regex.test(text)) return kind;
  }
  return 'other';
}
```

- [ ] **ステップ 4: テストを実行して成功することを確認**

実行: `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
期待結果: PASS, 5 tests

- [ ] **ステップ 5: コミット**

```bash
git add packages/core/src/tools/computer-use/permission-detector.ts packages/core/src/tools/computer-use/permission-detector.test.ts
git commit -m "feat(computer-use): detect upstream permission errors"
```

---

### Task 10: ブートストラップステートマシン — 完全なUXフロー

**ファイル:**

- 修正: `packages/core/src/tools/computer-use/bootstrap.ts`（Task 5のスタブを置き換え）
- 作成: `packages/core/src/tools/computer-use/bootstrap.test.ts`

ステートマシンには3つのサブフローがあります:

1. **初回インストール**: `isPackageSpecApproved` が false の場合、ユーザーにプロンプトを表示し、インストールし、承認を永続化する。
2. **起動**: クライアントが起動していることを確認する。
3. **パーミッションプローブ + ガイド**（macOSのみ）: パーミッションエラーが発生した場合、`open-computer-use doctor` を起動し、最大10分間許可をポーリングし、再試行する。

注: qwen-codeにおける「実行途中でユーザーに質問する」メカニズムは、既存のツール確認フレームワークを使用します。**実装者**: このタスクの実装を書く前に、`packages/core/src/tools/` で `shouldConfirmExecute` をgrepして、`shell.ts` などがどのように確認を行っているかを確認してください。このタスクではそのメカニズムが利用可能であることを前提としています。もし利用できない場合は、`process.stderr.write` + `process.stdin` からの読み取りをインストール確認に使用してください（許容可能なv0 UX）。

- [ ] **ステップ 1: 確認パターンを調査**

実行:

```bash
grep -rn "shouldConfirmExecute\|ToolConfirmation" packages/core/src/tools --include="*.ts" | grep -v ".test." | head -20
```

確認パターンを使用しているツール（おそらく`shell.ts`）を少なくとも1つ読んでください。`ToolInvocation` に `shouldConfirmExecute()` メソッドまたは類似のものがありますか？

YESの場合: インストール確認にそれを使用してください。
NOの場合: v0フォールバック（stderr + `ask_user_question` ツール（公開されている場合）、そうでなければ特定のエラーコードをスローしてモデルがユーザー許可後に再発行できるようにする）を使用してください。

`bootstrap.ts` の先頭にコードコメントとして選択内容を文書化してください。

- [ ] **ステップ 2: 失敗するテストを書く**

`packages/core/src/tools/computer-use/bootstrap.test.ts` を作成:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootstrap, type BootstrapDeps } from './bootstrap.js';

function makeFakeClient(opts: { startThrows?: Error } = {}) {
  const start = vi.fn(async () => {
    if (opts.startThrows) throw opts.startThrows;
  });
  return {
    isStarted: vi.fn(() => start.mock.calls.length > 0),
    start,
    callTool: vi.fn(),
    stop: vi.fn(),
  };
}

describe('runBootstrap', () => {
  let tmpHome: string;
  let deps: BootstrapDeps;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-bs-'));
    deps = {
      homeDir: tmpHome,
      packageSpec: 'open-computer-use@^0.3.0',
      platform: 'darwin',
      promptInstallApproval: vi.fn(async () => true),
      spawnDoctor: vi.fn(),
      probePermissions: vi.fn(async () => 'ok' as const),
    };
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('バイナリが承認済みかつパーミッションOKの場合にクライアントを開始する', async () => {
    // インストール状態を事前にシードしてプロンプトをスキップ
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(client.start).toHaveBeenCalledOnce();
    expect(deps.promptInstallApproval).not.toHaveBeenCalled();
  });

  it('初回呼び出し時にインストール承認のプロンプトを表示する', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.promptInstallApproval).toHaveBeenCalledOnce();
    expect(client.start).toHaveBeenCalledOnce();
  });

  it('ユーザーがインストールを拒否した場合にエラーをスローする', async () => {
    deps.promptInstallApproval = vi.fn(async () => false);
    const client = makeFakeClient();

    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/declined/i);
    expect(client.start).not.toHaveBeenCalled();
  });

  it('成功時に承認を永続化する', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    const { loadInstallState } = await import('./install-state.js');
    const state = await loadInstallState(tmpHome);
    expect(state?.approvedPackageSpec).toBe('open-computer-use@^0.3.0');
  });

  it('パーミッション不足時にdoctorを起動してポーリングする', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    let probeCount = 0;
    deps.probePermissions = vi.fn(async () => {
      probeCount++;
      return probeCount < 3 ? 'accessibility' : 'ok';
    });
    deps.pollIntervalMs = 1; // テストを高速化
    deps.pollTimeoutMs = 1000;

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).toHaveBeenCalledOnce();
    expect(probeCount).toBeGreaterThanOrEqual(3);
  });

  it('pollTimeoutMs を超えてもパーミッションが付与されない場合にエラーをスローする', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    deps.probePermissions = vi.fn(async () => 'accessibility' as const);
    deps.pollIntervalMs = 1;
    deps.pollTimeoutMs = 50;

    const client = makeFakeClient();
    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/timed out/i);
  });

  it('非darwinプラットフォームではパーミッションフローをスキップする', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    deps.platform = 'linux';

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).not.toHaveBeenCalled();
  });
});
```

- [ ] **ステップ 3: テストを実行して失敗することを確認**

実行: `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
期待結果: FAIL — 多数のエラー

- [ ] **ステップ 4: ステートマシンを実装**

`packages/core/src/tools/computer-use/bootstrap.ts` を以下で置き換え:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Computer Use ブートストラップステートマシン。
 *
 * 最初の computer_use__* ツール呼び出し時:
 *   1. まだ承認されていない場合: ユーザーにインストールを促す（1回限り）。
 *   2. クライアントを開始する（遅延npx起動、初回は約60秒かかる場合あり）。
 *   3. macOSのみ: Finderに対して get_app_state を呼び出してパーミッションをプローブ。
 *      パーミッションエラーが発生した場合、上流の doctor を起動し（システム設定＋オンボーディングウィンドウが開く）、
 *      パーミッションが付与されるか10分のタイムアウトになるまでポーリングする。
 *
 * 実装者: pre-step 1 (Task 10 step 1) — qwen-code の BaseDeclarativeTool が
 * `execute()` 内から `shouldConfirmExecute()` パスを公開しているか確認すること。
 * そうでない場合、`promptInstallApproval` は `process.stderr.write` + readline フォールバックにデフォルト設定される。
 * ここでの依存性注入設計により、ステートマシンロジックに触れることなくその決定を交換可能に保つ。
 */

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import type { ComputerUseClient } from './client.js';
import { isPackageSpecApproved, saveInstallState } from './install-state.js';
import {
  detectPermissionError,
  type PermissionErrorKind,
} from './permission-detector.js';

export interface BootstrapContext {
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

/** パーミッションプローブの結果。 */
export type PermissionProbeResult = 'ok' | PermissionErrorKind;

export interface BootstrapDeps {
  homeDir: string;
  packageSpec: string;
  platform: NodeJS.Platform;
  /**
   * 上流のバイナリをインストールする承認をユーザーに促す。
   * 承認された場合は true を返す。
   * 実装は qwen-code の確認ツールパスまたは stdin フォールバックを使用可能。
   */
  promptInstallApproval: (packageSpec: string) => Promise<boolean>;
  /**
   * `open-computer-use doctor` を起動する（デタッチ）。バイナリ自体が
   * システム設定ウィンドウを開く処理を行う。
   */
  spawnDoctor: () => void;
  /**
   * 軽量なツール呼び出しを発行して、上流MCPサーバーのパーミッション状態をプローブする。
   * 成功時は 'ok'、失敗時はパーミッションエラーの種類を返す。
   */
  probePermissions: (
    client: ComputerUseClient,
  ) => Promise<PermissionProbeResult>;
  /** パーミッションウォッチャーのポーリング間隔。デフォルト2000ms。 */
  pollIntervalMs?: number;
  /** ポーリング全体のタイムアウト。デフォルト10分。 */
  pollTimeoutMs?: number;
}

/** プロダクションのデフォルト — テストが呼び出しごとにオーバーライドできるように遅延インスタンス化。 */
function defaultDeps(): BootstrapDeps {
  return {
    homeDir: homedir(),
    packageSpec:
      process.env['QWEN_COMPUTER_USE_PACKAGE'] ?? 'open-computer-use@latest',
    platform: process.platform,
    promptInstallApproval: async (spec) => {
      // v0 フォールバック: stderr プロンプト + stdin 読み取り。
      // 組み込む際は qwen-code の標準確認パスに置き換えること。
      process.stderr.write(
        `\n[Computer Use] 初回インストール\n` +
          `  パッケージ: ${spec}\n` +
          `  初回は npm レジストリから約50MBをダウンロードします。\n` +
          `  Computer Use は、デスクトップアプリのクリック、タイプ、読み取りが可能です。\n` +
          `  macOS では、次にアクセシビリティとスクリーンレコーディングのパーミッションを許可するよう案内されます。\n` +
          `続行しますか？ [y/N] `,
      );
      // 実装者: 実際のインタラクティブセッションでは、qwen-code 確認システムに置き換えること。
      // ヘッドレス/SDKコンテキストでは、明示的なユーザーオプトインが必要なためデフォルトは拒否。
      return process.env['QWEN_COMPUTER_USE_AUTO_APPROVE'] === '1';
    },
    spawnDoctor: () => {
      const child = spawn('npx', ['-y', defaultDeps().packageSpec, 'doctor'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    },
    probePermissions: async (client) => {
      // Finder は動作が保証され常にインストールされているmacOSアプリとして使用。
      // get_app_state は AccessibilitySnapshot にアクセスし、最初に permissionDenied がスローされるパス。
      const result = await client.callTool('get_app_state', { app: 'Finder' });
      return detectPermissionError(result) === 'none'
        ? 'ok'
        : detectPermissionError(result);
    },
  };
}

export async function runBootstrap(
  client: ComputerUseClient,
  ctx: BootstrapContext,
  depsOverride?: Partial<BootstrapDeps>,
): Promise<void> {
  const deps: BootstrapDeps = { ...defaultDeps(), ...depsOverride };
  const pollIntervalMs = deps.pollIntervalMs ?? 2000;
  const pollTimeoutMs = deps.pollTimeoutMs ?? 10 * 60_000;

  // ステップ 1: インストール承認ゲート。
  const approved = await isPackageSpecApproved(deps.homeDir, deps.packageSpec);
  if (!approved) {
    ctx.updateOutput?.('Computer Use をインストールする必要があります（初回使用時）。');
    const ok = await deps.promptInstallApproval(deps.packageSpec);
    if (!ok) {
      throw new Error(
        'Computer Use のインストールがユーザーにより拒否されました。ツールを再度呼び出すと再びプロンプトが表示されます。',
      );
    }
    await saveInstallState(deps.homeDir, {
      approvedPackageSpec: deps.packageSpec,
      approvedAtIso: new Date().toISOString(),
    });
  }

  // ステップ 2: 起動（冪等）。
  if (!client.isStarted()) {
    ctx.updateOutput?.('Computer Use を起動しています...');
    await client.start();
  }

  // ステップ 3: macOS パーミッションプローブ + ガイド。
  if (deps.platform !== 'darwin') return;

  const probe = await deps.probePermissions(client);
  if (probe === 'ok' || probe === 'other') {
    // 'other' はパーミッション関連でないエラーが発生したことを意味する。
    // ブートストラップはブロックせず、実際のツール呼び出しでエラーを表面化させる。
    return;
  }

  ctx.updateOutput?.(
    `Computer Use には macOS のパーミッション（${probe}）が必要です。` +
      `オンボーディングウィンドウが開きます — アクセシビリティとスクリーンレコーディングを許可してください。許可されると自動的に続行します。`,
  );
  deps.spawnDoctor();

  const startedAt = Date.now();
  for (;;) {
    if (ctx.signal.aborted) {
      throw new Error('Computer Use ブートストラップが中断されました。');
    }
    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new Error(
        `Computer Use のパーミッション付与がタイムアウトしました（${Math.round(pollTimeoutMs / 1000)}秒）。ツールを再度呼び出して再試行してください。`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const next = await deps.probePermissions(client);
    if (next === 'ok' || next === 'other') return;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    ctx.updateOutput?.(`パーミッションを待機中...（${elapsedSec}秒）`);
  }
}
```
- [ ] **ステップ5: テストを実行してパスすることを確認**

実行: `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
期待結果: PASS, 7 tests

- [ ] **ステップ6: コミット**

```bash
git add packages/core/src/tools/computer-use/bootstrap.ts packages/core/src/tools/computer-use/bootstrap.test.ts
git commit -m "feat(computer-use): bootstrap state machine (install + permissions)"
```

---

### Task 11: 実際の `promptInstallApproval` を qwen-code の確認システムに配線する

**ファイル:**

- 変更: `packages/core/src/tools/computer-use/bootstrap.ts`
- 変更の可能性あり: `packages/core/src/tools/computer-use/tool.ts`

このタスクはスコープの変動が最も大きいタスクです。**実装者**: Task 10 のステップ1の調査結果を読み、それに応じて配線してください。2つのシナリオがあります:

**シナリオ A** — `BaseToolInvocation` が `shouldConfirmExecute()` をサポートしている場合:

- `ComputerUseInvocation` で `shouldConfirmExecute()` をオーバーライドし、パッケージがまだ承認されていない場合にインストール確認ペイロードを返す。
- フレームワークが確認UIを表示し、承認されると `execute()` が実行される。
- `bootstrap.ts` は確認後のパス（状態の書き込み、起動、権限プローブ）のみを処理する。

**シナリオ B** — 実行中の確認パスがない場合:

- Task 10 のv0のstderr+stdin方式を維持する。READMEとSKILL.mdに大きく注釈を記載する。
- 適切な確認パスを追加するためのフォローアップタスクを起票する（別PR）。

- [ ] **ステップ1: 選択したシナリオを実装**

（具体的なコードは調査に依存します。詳細は実装者に委ねます。）

- [ ] **ステップ2: 手動スモークテスト**

インストール状態を削除:

```bash
rm -rf ~/.qwen/computer-use
```

qwen-codeを起動し、computer-useに関する質問をする。選択したUX（確認ダイアログまたはstderr）にインストールプロンプトが表示され、承認すると状態が正しく永続化されることを確認。

- [ ] **ステップ3: コミット**

```bash
git add -A
git commit -m "feat(computer-use): wire install approval to qwen-code confirm UX"
```

---

### Task 12: 手動スモークテスト — 初回エンドツーエンドフロー

これはコーディングを伴わないゲート（品質チェック）です。

- [ ] **ステップ1: キャッシュをクリア**

```bash
rm -rf ~/.qwen/computer-use
rm -rf ~/.npm/_npx
# macOS: 権限をリセット
# システム設定 → プライバシーとセキュリティ → アクセシビリティ / 画面収録
# "Open Computer Use.app" を削除
```

- [ ] **ステップ2: ビルド + 実行**

```bash
npm run build
# qwen-codeを起動し、computer-useに関する質問をする
```

- [ ] **ステップ3: フルフローを検証**

期待されるシーケンス:

1. インストールプロンプトが表示される。
2. 承認後、ダウンロードの進捗が `updateOutput` を通じてストリーミングされる。
3. 権限警告が表示され、Doctorウィンドウが開く。
4. システム設定で権限を付与すると、ツールコールが自動的に再開される。
5. 結果が返る。

いずれかのステップで失敗した場合、エラーをキャプチャして停止し、修正を繰り返す。

- [ ] **ステップ4: コミットなし。これはゲートです。**

---

## フェーズ4 — ツール / メンテナンス

### Task 13: スキーマ同期スクリプト

**ファイル:**

- 作成: `scripts/sync-computer-use-schemas.ts`

qwen-codeのリリース準備の一部として実行されます。`npx -y open-computer-use@<pin> mcp` を起動し、`tools/list` を送信して `schemas.ts` を再生成します。

- [ ] **ステップ1: スクリプトを作成**

`scripts/sync-computer-use-schemas.ts` を作成:

```ts
#!/usr/bin/env tsx
/**
 * Regenerate packages/core/src/tools/computer-use/schemas.ts from a
 * live upstream open-computer-use MCP server.
 *
 * Usage:
 *   npx tsx scripts/sync-computer-use-schemas.ts [packageSpec]
 *
 * Defaults packageSpec to `open-computer-use@latest`. The pin written
 * into the generated file is whatever spec was used — pass an explicit
 * pin (e.g. `open-computer-use@0.3.5`) for release builds.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const packageSpec = process.argv[2] ?? 'open-computer-use@latest';

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', packageSpec, 'mcp'],
  });
  const client = new Client(
    { name: 'qwen-code-schema-sync', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);

  const result = await client.listTools();
  await client.close();

  if (result.tools.length !== 9) {
    process.stderr.write(
      `WARNING: upstream returned ${result.tools.length} tools, expected 9. Continuing anyway.\n`,
    );
  }

  const schemas: Record<
    string,
    { description: string; parameterSchema: unknown }
  > = {};
  for (const tool of result.tools) {
    schemas[tool.name] = {
      description: tool.description ?? '',
      parameterSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    };
  }

  const out = `/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hardcoded schemas for the upstream open-computer-use tools.
 *
 * Pinned to upstream: ${packageSpec}
 * Regenerated by scripts/sync-computer-use-schemas.ts — do not hand-edit.
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = ${JSON.stringify(
    result.tools.map((t) => t.name),
    null,
    2,
  )} as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<ComputerUseToolName, ComputerUseToolSchema> = ${JSON.stringify(
    schemas,
    null,
    2,
  )};
`;

  const target = resolve('packages/core/src/tools/computer-use/schemas.ts');
  await writeFile(target, out, 'utf8');
  process.stdout.write(`Wrote ${result.tools.length} schemas to ${target}\n`);
}

main().catch((err) => {
  process.stderr.write(`Schema sync failed: ${err}\n`);
  process.exit(1);
});
```

- [ ] **ステップ2: 手動で一度実行して検証**

```bash
npx tsx scripts/sync-computer-use-schemas.ts open-computer-use@latest
```

期待結果: schemas.ts が書き換えられる。`npm test -- packages/core/src/tools/computer-use/schemas.test.ts` が引き続きパスする（または、特定の手書き内容をアサートしていたテストのみ失敗し、その場合はアップストリームの説明文が変わっていればテストを調整する）。

- [ ] **ステップ3: コミット**

```bash
git add scripts/sync-computer-use-schemas.ts packages/core/src/tools/computer-use/schemas.ts
git commit -m "chore(computer-use): script to sync schemas from upstream"
```

---

## 自己レビューチェックリスト（全タスク記述後）

- [ ] すべてのステップに、コードブロック、正確なコマンド、または明確に委譲可能な IMPLEMENTER ノート（根拠付き）のいずれかがある。
- [ ] 9つのツール名すべてが、スキーマ、ツールラッパー、登録の全体にわたって一貫して `computer_use__` プレフィックスを使用している。
- [ ] ユーザー向け文字列に MCP / mcp__ / DiscoveredMCPTool への言及が漏れていない。
- [ ] ブートストラップステートマシンに明示的なタイムアウトがある（無限ポーリングなし）。
- [ ] `enableComputerUse` はユーザーの判断に従ってデフォルトで `true` になっている。
- [ ] テストでカバーしているもの: スキーマの整合性、名前のプレフィックス付与、延期（deferral）、クライアントライフサイクル、インストール状態の永続化、権限検出、すべてのブートストラップ状態遷移。
- [ ] 手動スモークゲート（Task 7、Task 12）が明示的である — 「動作する」という暗黙の主張がない。

---

## 対象外（フォローアップPRに延期）

- MCPサーバープロセスのアイドルタイムアウト（リソース節約。v0ではqwen-codeが終了するまで生存）。
- ブートストラップ失敗のテレメトリ（ネットワーク障害 vs Gatekeeper vs 権限タイムアウトの分類）。
- オフラインインストールパス / キャッシュされたtarballのサポート。
- 公開前の機能プローブ（現在は初回呼び出し時に失敗が表面化）。
- permissionDeniedに対する型付けされたerrorKindのアップストリームPR（ユーザー延期）。
- 権限付与後のMCPサーバー再起動（ユーザーはまず実際のテストで必要かどうかを判断したい）。
- ツール単位の詳細な権限ゲート（例：`list_apps` / `get_app_state` の読み取り専用を毎回確認なしで許可）。

---

## 実行ハンドオフ

計画は `docs/superpowers/plans/2026-05-28-computer-use-built-in.md` に保存されました。

2つの実行オプション:

1. **サブエージェント駆動（推奨）** — タスクごとに新しいサブエージェントを投入し、タスク間で2段階レビューを実施、高速なイテレーション。
2. **インライン実行** — このセッション内でタスクを実行し、チェックポイントでレビュー。

どちらのアプローチを選びますか？