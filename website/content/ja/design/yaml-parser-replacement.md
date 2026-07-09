# YAMLパーサーの置き換え — 調査結果

`packages/core/src/utils/yaml-parser.ts` にある自作の192行のYAMLパーサーを本物のライブラリに置き換えるための内部設計ドキュメント。これにより、Claude Codeのdeclarative-agentスキーマから遅延評価される `mcpServers` と `hooks` フィールドを、サブエージェント / スキル / コンバーターのコードパスを通じて安全にラウンドトリップできるようにする。

[`docs/design/declarative-agents-port.md`](./declarative-agents-port.md) の関連ドキュメント。
Issue: [#4821](https://github.com/QwenLM/qwen-code/issues/4821)。[PR #4842](https://github.com/QwenLM/qwen-code/pull/4842) のフォローアップの前提条件。

## Phase 0 — 検証済みソース

| ソース                                                  | バージョン / 日付                        | 信頼できる理由                                                                                                               |
| ------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `~/code/claude-code/src/utils/yaml.ts`                  | 古いCCのスナップショット (2.1.168以前)        | 直接のソース — ライブラリ名を指定する15行のラッパー                                                                          |
| `~/code/claude-code/src/utils/frontmatterParser.ts`     | 同じスナップショット                          | 直接のソース — 370行のfrontmatter分割処理 + 2パスリカバリ                                                                 |
| `/private/tmp/cc-2.1.168/claude.strings`                | CC 2.1.168から抽出              | 現在の動作に対する権威あるソース — 文字列には難読化されたシンボル名が含まれるが、JSONスキーマとエラーメッセージのテキストも含まれている   |
| `packages/core/src/utils/yaml-parser.ts` (このリポジトリ)    | `lazzy/gifted-hamilton-684741` のHEAD | 置き換え対象のパーサー                                                                                                       |
| このツリー内の `yaml@2.8.1` に対するライブ `node -e` 検証 | 2026-06-08                             | 経験的なセキュリティ動作 — アンカー、マージキー、`!!js/function`、billion-laughs、`maxAliasCount` （結果はPhase 4にインラインで記載） |

信頼度のラベル: **C** 直接の証拠により確認済み; **I** 複数の確認された事実から推測; **O** 未解決の疑問。

## Phase 1 — CCはどのYAMLライブラリを使用しているか？

**答え: [`yaml`](https://www.npmjs.com/package/yaml) (eemeli/yaml) であり、`js-yaml` ではない。** `~/code/claude-code/src/utils/yaml.ts` をそのまま読むことで確認:

```ts
export function parseYaml(input: string): unknown {
  if (typeof Bun !== 'undefined') {
    return Bun.YAML.parse(input);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('yaml') as typeof import('yaml')).parse(input);
}
```

- **ライブラリ**: `yaml` npmパッケージ。 **C**
- **API**: トップレベルの `.parse(input)`。パッケージのデフォルトスキーマ（YAML 1.2の `core` — JSONのスーパーセット、JS拡張なし）を使用。 **C**
- **Bunのショートカット**: Bun環境で実行時、CCは `Bun.YAML.parse()` を使用して、約270KBのYAMLパーサーをバンドルしないようにしている。 **C** qwen-codeには関係なし（Bunランタイムをターゲットにしていないため）。
- **スキーマモード**: CC内のどこでも明示的に設定されていない。 `yaml` パッケージのデフォルトの動作に依存し、コンシューマー層でzodによるバリデーションを行う（`docs/design/declarative-agents-port.md` 内の `DL7`、`gS8`、`TKO`/`_u` を参照）。 **C**

### `js-yaml` ではなく `yaml` を選ぶ理由

| 観点                | `js-yaml` 4.x                                                                              | `yaml` (eemeli) 2.x                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| デフォルトスキーマ           | `DEFAULT_SAFE_SCHEMA` (4.x以降) — 安全。古いバージョンはJS拡張を含む `DEFAULT_FULL_SCHEMA` だった | `core` (YAML 1.2仕様) — JSONの型のみ             |
| `!!js/function` タグ      | 4.xではサポートされていない (3.xではサポートされていた)                                                          | 元々サポートされていない                                      |
| billion-laughsのガード     | なし（手動での対応が必要）                                                               | 組み込みの `maxAliasCount: 100` がデフォルト                |
| マージキー (`<<`)        | サポートされている（`MERGE_SCHEMA` またはフィルタリングでオプトアウトする必要がある）                                   | デフォルトで無効。`{ merge: true }` でオプトイン    |
| すでにqwen-codeの依存関係にあるか？ | `js-yaml@4.1.1` ✓                                                                          | `yaml@2.8.1` ✓（すでに `skill-manager` によってインポートされている） |

2026年現在、どちらとも合理的な選択だが、**元のタスクブリーフでは `js-yaml` の `FAILSAFE_SCHEMA` / `CORE_SCHEMA` を推奨していた**。以下の3つの具体的な理由により、そのガイダンスから逸脱する:

1. **CCとの同等性**。CCのfrontmatterスキーマを移植する目的は、ユーザーがCCのエージェントファイルを `.qwen/agents/` にドロップして、完全に同じようにパースできるようにすることである。CCと同じパーサーを使用することで、エッジケースのYAML構成（マルチドキュメントストリーム、フロー/ブロックスカラー、タグ処理）における差異を最小限に抑えられる。
2. **`yaml` はすでに `skill-manager.ts` 内で直接使用されている** — `packages/core/src/skills/skill-manager.ts:13` (`import * as yaml from 'yaml'`) を参照。 `yaml` に統一することで、同じパッケージ内にある2つの重複するYAMLスタックのうちの1つを排除できる。 **C** （grepの結果はPhase 6に記録）。
3. **`js-yaml` よりも安全なデフォルト**。 `yaml` の組み込み `maxAliasCount` は、手動設定なしでbillion-laughsをブロックする。マージキーはデフォルトで無効であり、任意のタグは呼び出し可能なリゾルバーをトリガーするのではなく、`YAMLWarning` を伴うリテラル文字列となる。Phase 4に経験的な証拠を記載。

将来のメンテナーが `yaml` 依存関係を削除して `js-yaml` に統一したい場合、移行は機械的に行える。 `yaml.parse` / `yaml.stringify` を `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump` に置き換えるだけである。両ライブラリは、CCとqwen-codeが実際に使用する100%のサブセット（キーと値のペア、リスト、ネストされたマップ、スカラーの真偽値/数値）について出力が一致する。この判断が必要になった場合は、別途追跡すること。

## Phase 2 — Frontmatterパーシングパイプライン (CC)

`~/code/claude-code/src/utils/frontmatterParser.ts` は370行である。主な発見:

| ステップ                | ロジック                                                                                                                     | ソース                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 区切り文字のマッチ     | 正規表現 `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — 0列目で開始、ボディは非貪欲マッチ、閉じ `---` は単独行にある必要がある   | `frontmatterParser.ts:~123` （古いスナップショットからの行番号。近似値として扱う） **C**                      |
| パス1のパース        | `parseYaml(body)` を呼び出す。成功した場合 → パースされたオブジェクトとコンテンツの残りを返す。                                            | 同じファイルのtryブロックの先頭 **C**                                                                             |
| パス2のリカバリ     | `YAMLException` 発生時、行を走査し、日付/コロン/特殊文字のように見える値を自動的にクォートで囲み、`parseYaml` を1回再試行する。           | 古いスナップショットの ~85–121行目 **C** （`タブ → 2スペース` への正規化、ISO日付のヒューリスティック、コロン対策）          |
| 失敗時のフォールスルー | 両方のパスが失敗した場合 → `logForDebugging` を介してログを出力し、`{ data: {}, content: text }` を返す。エージェントは空のfrontmatterで読み込まれる。 | 関数の末尾 **C**                                                                                         |
| テレメトリ           | さらに上流でラップされている — `tengu_frontmatter_shadow_unknown_key` / `_mismatch` イベントは `ug5.agent` (Ig5スキーマ) から発行される | `claude.strings:308120`、`309074`、`309076` （`docs/design/declarative-agents-port.md` のPhase 1で相互参照） |

**qwen-codeへの示唆**: 2パスリカバリをクローンする必要はない。 qwen-codeの `subagent-manager.ts` は、そのローダーですでに「トップレベルで不正なfrontmatterがある場合はスローする」というより厳格なセマンティクスを強制している（`parseSubagentContent` を参照）。2パスリカバリは、昔の手動で編集されたCCのエージェントファイルを許容するために特別に存在している。より厳格な姿勢を移植しても問題ない。重要なのは、ネストされたフィールドが不正な形式であっても**ローダー全体をクラッシュさせない**ことである。warn-and-drop（警告して破棄）の姿勢についてはPhase 5を参照。

## Phase 3 — zodによるネストされたバリデーション (CC)

`docs/design/declarative-agents-port.md` のPhase 1およびバイナリ文字列のクロスチェックに基づく、関連するCCのバリデーター:

### `mcpServers` (CCシンボル `gS8` / JSON-shadow `jL7`)

```
mcpServers: z.union([
  z.string(),                                            // サーバー名参照
  z.record(z.string(), McpServerConfigSchema()),         // インライン { name: spec }
])
```

`McpServerConfigSchema()` （`claude.strings:124–135` の参照より）は、`type` に関する**discriminated union** である:

| `type`             | 必須フィールド                      | 備考                                              |
| ------------------ | ------------------------------------ | -------------------------------------------------- |
| `"stdio"`          | `command: string`, `args?: string[]` | `env?: Record<string,string>`, `cwd?: string` も含む |
| `"sse"`            | `url: string`                        | `headers?: Record<string,string>` も含む             |
| `"http"`           | `url: string`                        | `headers?`, `method?` も含む                         |
| `"websocket"`      | `url: string`                        | qwen-codeでの同等性は不明 — 必要になるまで延期      |
| `"sdk"`            | 様々                               | CCの内部使用。サポートする必要はない         |
| `"claudeai-proxy"` | 様々                               | CCの内部使用。サポートする必要はない         |

**qwen-code v1の場合**: `Record<string, unknown>` としてバリデーションし（寛容なDL7スタイル）、下流の `Config.getMcpServers()` へのマージにシェイプの強制変換を任せる。 `qwen-code` にはすでに `type` によるdiscriminationを持つ `MCPServerConfig` クラスがある — zodスキーマを複製する代わりに、そのコンバーターを再利用する。 `docs/design/declarative-agents-port.md` のランタイム配線計画のPhase 4を参照。

### `hooks` (CCシンボル `TKO` / `_u`)

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig (`type` に関するdiscriminated union):
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

文字列のクロスチェックによるhookイベントキーは、qwen-codeがすでにサポートしているものと同じセットである: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `Notification` — さらに、CCにはないqwen独自のいくつかのイベント（`TodoCreated`, `TodoCompleted`）も含まれる。

**qwen-code v1の場合**: `Record<string, unknown>` としてバリデーションし（寛容）、その後、qwen-codeの既存の `SessionHooksManager` バリデーターに渡す。これらはすでにイベントごとの `HookDefinition[]` シェイプを実装している（Phase-1のランタイムマッピングに基づく `packages/core/src/hooks/types.ts:207–211` を参照）。

### なぜ両方のバリデーターが `Ig5` シャドウレベルで `z.unknown()` なのか

`Ig5` は**テレメトリシャドウスキーマ** である — YAMLキーが既知のセットにない場合に `tengu_frontmatter_shadow_unknown_key` イベントを発行し、既知のキーの型が間違っている場合に `_mismatch` イベントを発行する。 `mcpServers` と `hooks` に意図的に `z.unknown()` を使用している。なぜなら、**`Ig5` はパース時に実行され**、インラインのmcpServers仕様ごとに偽のmismatchイベントを発行してしまうからである。実際のバリデーションは以下に委任される:

- `gS8` （`mcpServers` 用） — `DL7` のアイテムごとの `safeParse` から**エージェント登録時**に呼び出される
- `TKO` （`hooks` 用） — `_u().safeParse` から**フック発火時**に呼び出される
この**遅延検証（lazy validation）**は、qwen-code が模倣すべきモデルです。frontmatter パーサーを寛容にし（TS での `z.unknown()` に相当）、使用時点で検証を行います。完全な zod ツリーを `SubagentConfig` に持ち込もうとすると、現在存在しないレイヤーに qwen の `MCPServerConfig` クラスと `HookDefinition` 型もインポートする必要が生じ、実際にサポートしていない `type: 'sdk'` / `type: 'claudeai-proxy'` に対するダミーのバリデーターを考案しなければならなくなります。

## Phase 4 — セキュリティ姿勢

この qwen-code ツリーにおける `yaml@2.8.1` のデフォルト動作の実証的検証:

### プローブ結果

```
$ node -e "const y=require('yaml'); console.log(y.parse('a: 1').constructor.name, y.parseDocument('a: 1').schema?.name)"
Object core
```

→ デフォルトスキーマは `'core'`（YAML 1.2 JSON スーパーセット）です。**C**

```
$ node -e "const y=require('yaml'); console.log(y.parse('!!js/function \"function(){}\"'))"
function(){}
(node:18525) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: tag:yaml.org,2002:js/function
```

→ `!!js/function` タグは実行され**ません**。値は**リテラル文字列** `"function(){}"`（呼び出し可能な関数オブジェクトではない）に解決され、致命的ではない `YAMLWarning` を出力します。攻撃者はこのベクトルを経由して RCE を達成できません。**C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJECTED:', e.message) }"
REJECTED: Excessive alias count indicates a resource exhaustion attack
```

→ エイリアス展開 / billion-laughs は**デフォルトで**拒否**されます**。ライブラリには `maxAliasCount: 100` が同梱されています（失敗した解析では 1+10+100 = 111 個のエイリアスがカウントされます）。**C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ マージキー（`<<`）はデフォルトで**リテラルなキー文字列**として解析され、展開され**ません**。`<<` パーサーは `{ merge: true }` によってオプトインされます。これを有効にすることは**ありません**。**C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ CC 形状のネストされた mcpServers は、深くネストされたオブジェクト/配列に正しく解析されます。**C**

### 安全性の要約

| ベクトル | `yaml@2.8.1` のデフォルト | qwen-code で必要なアクション |
| --- | --- | --- |
| 任意の JS 実行 | 不可能 — eval なし | なし |
| `!!js/function` タグ | リテラル文字列 + 警告になる | なし |
| billion-laughs | 拒否される（`maxAliasCount: 100`） | なし — デフォルトを維持 |
| マージキー（`<<`） | リテラルキーとして扱われる | なし — デフォルトを維持（`merge: true` を渡さ**ない**） |
| アンカー / エイリアス（通常の使用） | 許可される、CC 形状データに有用 | なし |
| 任意の不明なタグ | 文字列 + `YAMLWarning` | オプションで警告をロガーにリダイレクト（Phase 6 を参照） |

**結論**: `yaml` パッケージの標準の動作は、元のタスクブリーフで `js-yaml` の `FAILSAFE_SCHEMA` を通じて求められていたものよりもすでに安全です。スキーマをロックダウンするための呼び出しは必要ありません。

## Phase 5 — リカバリーセマンティクス

CC はすべてのレイヤーで**グレースフルな warn-and-drop**を選択します。

1. YAML パーサーがスロー → frontmatter パーサーがログを出力し `{}`（空のデータ）を返す
2. フィールドの形状が間違っている（例: `mcpServers: "this is a string"`） → `safeParse` が失敗 → フィールドは出力される設定からドロップされる
3. フィールドの形状が「ほぼ」間違っている（例: スキーマがオブジェクトを求めているところで、個々の `mcpServers` アイテムが文字列である） → アイテムごとの `safeParse` がそのアイテムだけをドロップし、残りを保持する

qwen-code はすでに `permissionMode`、`maxTurns`、`color`、`effort` に対してフィールドごとの warn-and-drop 姿勢を実装しています（`packages/core/src/subagents/agent-frontmatter-schema.ts` を参照）。同じパターンを `mcpServers` と `hooks` にも拡張します。

CC からクローンしないもの:

- **自動クォーティングを伴う 2 パス YAML リカバリー**。これは qwen-code にとっては不要な重荷です。私たちは新しいプロジェクトであり、許容すべきレガシーな手動編集 frontmatter ファイルはありません。推測による再解釈よりも、クリーンなエラーの方が有用です。
- **`tengu_*` テレメトリエベント**。qwen-code 独自のロガー / ローダーの残りの部分が使用するテレメトリーレイヤーに置き換えられます。

## Phase 6 — qwen-code への推奨事項

### ライブラリの選択

- **`yaml@^2.8.1` を使用する**（すでに推移的依存関係にあるため、直接 `packages/core/package.json` の依存関係に昇格させ、より厳格な解決モード下での破壊を防ぎます。また、メジャーバージョンをピン留めできます）。
- **デフォルトスキーマ**（`core`）を使用し、スキーマフラグは指定しません。
- `{ merge: true }` を渡さ**ない**でください。デフォルト以外のオプションは有効にしないでください。
- 決定論的な stringify 出力（テストスナップショット）のために、`yaml.stringify` に `{ lineWidth: 0, defaultStringType: 'PLAIN' }` を渡し、ライブラリが長い行を折り返したり、コンテンツの長さに応じてブロックスカラークォーティングに任意に切り替えたりしないようにします。

### 維持する API 表面

現在の `packages/core/src/utils/yaml-parser.ts` は以下をエクスポートしています:

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

置き換え後の実装も両方のシグネチャを**同一**に保つため、5 つの呼び出し元（`subagent-manager.ts`、`claude-converter.ts`、`rulesDiscovery.ts`、`skill-manager.ts`、`skill-load.ts`）と `index.ts` の再エクスポートにおいて、呼び出しサイトの変更はゼロで済みます。

実装のスケッチ:

```ts
import * as yaml from 'yaml';

export function parse(yamlString: string): Record<string, unknown> {
  const parsed = yaml.parse(yamlString);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string {
  return yaml.stringify(obj, {
    lineWidth: options?.lineWidth ?? 0,
    minContentWidth: options?.minContentWidth ?? 20,
  });
}
```

**なぜ非オブジェクトのトップレベルを `{}` に強制変換するのか**: 既存のすべての呼び出し元はレコードを想定しています。`null`（空のファイル）、`["foo"]`（リスト）、または `"hello"`（ベアスカラー）に解析される YAML ファイルは、現在ダウンストリームの分割代入でクラッシュを引き起こします。`{}` を返すことで、同じ入力に対する古い手書きパーサーの動作が維持されます。これを意図的なガードレールとして 1 行のコメントで文書化してください。

### 変更が不要な呼び出し元

| ファイル | 使用方法 | 互換性 |
| --- | --- | --- |
| `packages/core/src/index.ts:360` | yaml-parser から `*` を再エクスポート | はい — 同名 |
| `packages/core/src/subagents/subagent-manager.ts:15` | `parse`, `stringify` | はい |
| `packages/core/src/extension/claude-converter.ts:26` | `parse`, `stringify` | はい — `mcpServers` + `hooks` のラウンドトリップが安全になりました（Phase 3 を参照） |
| `packages/core/src/utils/rulesDiscovery.ts:20` | `parse as parseYaml` | はい |
| `packages/core/src/skills/skill-manager.ts:13` | `parse as parseYaml`（および別途 `import * as yaml from 'yaml'`） | はい — また、重複する `import * as yaml` は後続のフォローアップで削除可能です |
| `packages/core/src/skills/skill-load.ts:11` | `parse as parseYaml` | はい |

### 必要なテストフィクスチャ

現在の手書きパーサーが失敗し、置き換え後の実装が処理できなければならない 3 つの具体的な YAML スニペット（ネストされた形状ごとに 1 つ）:

```yaml
# Fixture 1 — mcpServers (record of records)
mcpServers:
  filesystem:
    type: stdio
    command: node
    args:
      - /path/to/server.js
    env:
      DEBUG: '1'
  github:
    type: http
    url: https://mcp.example.com/github
    headers:
      Authorization: 'Bearer xxx'
```

```yaml
# Fixture 2 — hooks (record of arrays of records, two levels of nesting under the event name)
hooks:
  PreToolUse:
    - matcher: 'Read|Write'
      hooks:
        - type: command
          command: echo before
          timeout: 5000
  PostToolUse:
    - matcher: '*'
      hooks:
        - type: command
          command: echo after
```

```yaml
# Fixture 3 — mixed shallow + deep, plus everything PR #4842 already supports
name: agent-x
description: test
permissionMode: acceptEdits
maxTurns: 5
color: cyan
tools:
  - Read
  - Write
mcpServers:
  filesystem:
    type: stdio
    command: node
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: log
```

### 変更が必要なテスト

`packages/core/src/utils/yaml-parser.test.ts` の末尾（200〜227 行目）には、`known limitations — nested YAML (pin until js-yaml lands)` というタイトルの 2 つの「ピン留めテスト」があります。置き換え後の実装では、これらを肯定的な形式のネストされた解析アサーションに**必ず**反転させる必要があります。

```ts
it('parses array-of-records', () => {
  const yaml =
    'mcpServers:\n  - filesystem:\n      type: stdio\n      command: node';
  expect(parse(yaml)).toEqual({
    mcpServers: [{ filesystem: { type: 'stdio', command: 'node' } }],
  });
});

it('parses record-of-records', () => {
  const yaml = 'hooks:\n  PreToolUse:\n    - matcher: Read';
  expect(parse(yaml)).toEqual({
    hooks: { PreToolUse: [{ matcher: 'Read' }] },
  });
});
```

これら 2 つのアサーションと上記の 3 つのフィクスチャは、実装計画の Phase 2 の**受け入れゲート**です。それ以外（エスケープのエッジケース、クォート付き/クォートなしのブール値、数値文字列）は既存のテストスイートからの回帰カバレッジであり、変更なしでパスするはずです。

### ラウンドトリップ同等性チェック

既存のテスト `should maintain round-trip integrity for escaped strings`（111〜129 行目）は、`stringify → parse` を介して 7 つの文字列をテストしています。`yaml` のデフォルトの `stringify` は、手書きのフォーマッターとはわずかに異なる出力を生成します（場合によってはより積極的なクォーティング、異なるエスケープシーケンス）。許容される結果は 2 つあります。

1. **テストフィクスチャを調整する** — 新しいパーサーでの動作をアサートします。重要なのはラウンドトリップのプロパティ（`parse(stringify(x)) === x`）であり、バイト単位で同一の YAML 出力であることではありません。
2. **バイト単位で同一のアサーションをそのままにする** — 目に見える形で失敗させ、その後 `yaml` の出力をそのまま反映するように更新します。差分のレビューが容易になります。

推奨事項: **オプション 1** — アサーションをプロパティベース（`expect(parse(stringify(obj))).toEqual(obj)`）に変更します。バイト単位で同一の YAML 出力は、モジュールの文書化された契約ではないためです。

### 呼び出し元に対する破壊的変更 — 想定されるものはないが、検証が必要

- `subagent-manager.ts` は、`saveSubagent` パスのために解析されたオブジェクトを YAML に再シリアライズします。新しいパーサーでは、`mcpServers` と `hooks` はクリーンにラウンドトリップされます。実装計画の Phase 3 で `claude-converter.ts` の `NESTED_FIELDS_NOT_ROUND_TRIPPABLE` を更新し、これら 2 つのフィールド名を削除します。
- `skill-manager.ts` はすでに（手書きパーサーとは別に）`yaml` を直接インポートしています。`yaml-parser.ts` も `yaml` を使用するようになれば、重複するインポートは小さなフォローアップとして削除可能です — これは本スコープ外です。
### 移行リスク

低。5つの呼び出し元はすべて `Record<string, unknown>` を分割代入しており、戻り値の型は同じです。意図的に設定した2つの「garbles」ピンテストのみが予想される失敗であり、これらは既知のもので意図的に切り替えています。より広範なリグレッションカバレッジは、`packages/core/src/subagents/`、`packages/core/src/skills/`、および `packages/core/src/extension/` の既存のテストスイートから提供されます。

## 未解決の質問

| #   | 質問                                                                                                                                              | ブロッキング?                                                               | 解決方針                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `yaml.parse` は `process.emitWarning` の代わりに `YAMLWarning`（例: `Unresolved tag`）を qwen-code のロガーにリダイレクトするために、明示的なロガーを必要としますか？  | いいえ — 延期                                                              | CIでログが煩雑になる場合は、`{ logLevel: 'silent' }` またはカスタムの `onWarning` コールバックを渡します。v1では必須ではありません。                                                      |
| Q2  | `parse()` は空文字列またはnullドキュメントのYAMLに対して `{}` を返し続けるべきですか、それとも例外をスローすべきですか？                                                             | いいえ — 現在の動作を維持                                          | 現在の手書き実装は `{}` を返します。これを維持します。この選択を固定するリグレッションテストを追加します。                                                                               |
| Q3  | トップレベルで `mcpServers` が不正な形式（例: `mcpServers: "string"`）の場合、エージェント全体の読み込みを失敗させるべきですか、それともそのフィールドを破棄して読み込むべきですか？ | はい — 実装のフェーズ3における警告して破棄する方針を決定づけるため | **解決策**: フィールドを破棄し、コンソール警告を出力します（`docs/design/declarative-agents-port.md` のフェーズ3に従い、CC `DL7` と同等の動作にします）。                                  |
| Q4  | Q3と同じですが、`hooks` の場合: フィールド全体、イベント、それとも個々のマッチャーのどれを破棄すべきですか？                                                                | はい — 警告して破棄する方針を決定づけるため                                  | **解決策**: トップレベルの形状が不正な場合は、`hooks` フィールド全体を破棄します。イベントごと / マッチャーごとの粒度での処理は、実際のユーザーからニーズが出た場合に将来のPRに延期します。 |
| Q5  | CCのヘルパーからの `Bun.YAML.parse` ショートカットは qwen-code に適用されますか？                                                                               | いいえ                                                                      | qwen-code はBunランタイムを対象としていません。スキップします。                                                                                                                            |

---

**ステータス**: リサーチ完了。`docs/design/declarative-agents-port.md` に従い、フェーズ2（`yaml-parser.ts` の置換）とフェーズ3（`SubagentConfig` での `mcpServers` + `hooks` の再追加）の実装準備が整いました。