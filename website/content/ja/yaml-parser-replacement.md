# YAMLパーサー置き換え — 調査結果

`packages/core/src/utils/yaml-parser.ts` にある手書きの192行のYAMLパーサーを本格的なライブラリに置き換えるための内部設計ドキュメント。これにより、Claude Codeのdeclarative-agentスキーマからdeferredされた `mcpServers` と `hooks` フィールドが、subagent / skill / converter のコードパスを安全にラウンドトリップできるようになります。

関連文書: [`docs/declarative-agents-port.md`](./declarative-agents-port.md)
Issue: [#4821](https://github.com/QwenLM/qwen-code/issues/4821)
[PR #4842](https://github.com/QwenLM/qwen-code/pull/4842) のフォローアップに必要な前提条件。

## Phase 0 — 検証済みソース一覧

| ソース                                                 | バージョン / 日付                    | 信頼性の理由                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `~/code/claude-code/src/utils/yaml.ts`                 | 古いCCスナップショット（2.1.168以前） | 直接ソース — ライブラリを指定する15行のラッパー                                                                                 |
| `~/code/claude-code/src/utils/frontmatterParser.ts`    | 同スナップショット                    | 直接ソース — 370行のfrontmatter分割 + 2パスリカバリ                                                                             |
| `/private/tmp/cc-2.1.168/claude.strings`               | CC 2.1.168 から抽出                  | 現在の動作の信頼できる情報源 — 文字列には難読化されたシンボル名が含まれるが、JSONスキーマとエラーメッセージテキストが含まれている    |
| `packages/core/src/utils/yaml-parser.ts`（本リポジトリ） | `lazzy/gifted-hamilton-684741` のHEAD | 置き換え対象のパーサー                                                                                                          |
| このツリー内の `yaml@2.8.1` に対する `node -e` の実機確認 | 2026-06-08                          | セキュリティ動作の経験的確認 — アンカー、マージキー、`!!js/function`、billion-laughs、`maxAliasCount`（結果はPhase 4にインライン） |

信頼性ラベル: **C** 直接証拠で確認済み; **I** 複数の確認済み事実から推測; **O** 未確定の質問。

## Phase 1 — CCはどのYAMLライブラリを使っているか？

**答え: [`yaml`](https://www.npmjs.com/package/yaml) (eemeli/yaml) であり、`js-yaml` ではない。** `~/code/claude-code/src/utils/yaml.ts` をそのまま読んで確認:

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
- **API**: トップレベルの `.parse(input)`。パッケージのデフォルトスキーマ（YAML 1.2 `core` — JSONスーパーセット、JS拡張なし）を使用。 **C**
- **Bunショートカット**: Bun上で動作する場合、CCは `Bun.YAML.parse()` を使用して約270KBのYAMLパーサーをバンドルしないようにしている。 **C** qwen-codeでは関係なし（Bunランタイムをターゲットにしていない）。
- **スキーマモード**: CC内で明示的に設定されている場所はない。`yaml` パッケージのデフォルト動作と、利用者層でのzodバリデーション（`docs/declarative-agents-port.md` のPhase 1に記載された `DL7`、`gS8`、`TKO`/`_u`）に依存。 **C**

### なぜ `yaml` で `js-yaml` ではないのか

| 観点                     | `js-yaml` 4.x                                                                                     | `yaml` (eemeli) 2.x                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| デフォルトスキーマ       | `DEFAULT_SAFE_SCHEMA`（4.x以降）— 安全; 旧バージョンではJSを含む `DEFAULT_FULL_SCHEMA` だった        | `core` (YAML 1.2仕様) — JSON型のみ                      |
| `!!js/function` タグ     | 4.xでは非対応（3.xでは対応していた）                                                               | 一度も対応していない                                    |
| Billion-laughsガード     | なし（手動で責任を持つ必要あり）                                                                    | デフォルトで `maxAliasCount: 100` を内蔵                 |
| マージキー (`<<`)        | 対応（`MERGE_SCHEMA` またはフィルタリングでオプトアウト可能）                                      | デフォルトで無効、`{ merge: true }` でオプトイン         |
| すでにqwen-codeの依存?   | `js-yaml@4.1.1` ✓                                                                                 | `yaml@2.8.1` ✓（既に `skill-manager` がインポート）     |

どちらも2026年において合理的な選択肢ですが、**元のタスクブリーフでは `js-yaml` の `FAILSAFE_SCHEMA` / `CORE_SCHEMA` を推奨していました**。以下の3つの具体的な理由から、そのガイダンスから逸脱します。

1. **CCとのパリティ**。CCのfrontmatterスキーマを移植する目的は、ユーザーがCCのエージェントファイルを `.qwen/agents/` にドロップして、全く同じように解析できるようにするためです。CCと同じパーサーを使用することで、エッジケースのYAML構造（マルチドキュメントストリーム、フロー vs ブロックスカラー、タグ処理）におけるズレを最小限に抑えられます。
2. **`yaml` はすでに `skill-manager.ts` 内で直接使用されている** — `packages/core/src/skills/skill-manager.ts:13` を参照（`import * as yaml from 'yaml'`）。同じパッケージ内の重複したYAMLスタックを1つに統一できます。 **C**（grep結果はPhase 6に記載）。
3. **`js-yaml` よりも安全なデフォルト**。`yaml` の組み込み `maxAliasCount` は手動設定なしでbillion-laughsをブロックします。マージキーはデフォルトで無効。任意のタグは、呼び出し可能なリゾルバーを起動する代わりに `YAMLWarning` を伴うリテラル文字列になります。経験的証拠はPhase 4にあります。

将来のメンテナーが `yaml` 依存を削除して `js-yaml` に統一したい場合、移行は機械的です: `yaml.parse` / `yaml.stringify` を `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump` に置き換えるだけです。両ライブラリは、CCとqwen-codeが実際に使用する100%のサブセット（キーと値のペア、リスト、ネストされたマップ、スカラーのブール値/数値）について出力が一致します。その判断は必要に応じて別途追跡してください。

## Phase 2 — Frontmatter解析パイプライン（CC）

`~/code/claude-code/src/utils/frontmatterParser.ts` は370行。主な発見:

| ステップ           | ロジック                                                                                                                    | ソース                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 区切り文字マッチ   | 正規表現 `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — 0列目から開始、ボディは非貪欲、閉じ `---` はそれ自体の行に存在する必要あり        | `frontmatterParser.ts:~123`（古いスナップショットの行番号。おおよその値として扱う） **C**                       |
| パス1 パース      | `parseYaml(body)` を呼び出し。成功 → パース済みオブジェクト + コンテンツの残りを返す                                          | 同じファイル、tryブロックの先頭 **C**                                                                          |
| パス2 リカバリ    | `YAMLException` 発生時、行を走査し、日付/コロン/特殊文字のように見える値を自動引用符で囲み、`parseYaml` をもう一度試す        | 古いスナップショットの行 ~85–121 **C**（`タブ → スペース2つ` 正規化、ISO日付ヒューリスティック、コロントラップ） |
| 失敗時のフォールスルー | 両方のパスが失敗 → `logForDebugging` 経由でログ出力、`{ data: {}, content: text }` を返す。エージェントは空のfrontmatterで読み込まれる | 関数の末尾 **C**                                                                                              |
| テレメトリー       | さらに上流でラップ — `tengu_frontmatter_shadow_unknown_key` / `_mismatch` イベントが `ug5.agent`（Ig5スキーマ）から発火       | `claude.strings:308120`、`309074`、`309076`（`docs/declarative-agents-port.md` Phase 1で相互参照）             |

**qwen-codeへの影響**: 2パスリカバリをクローンする必要はありません。qwen-codeの `subagent-manager.ts` はすでに、ローダーに対して「不正なfrontmatterはトップレベルでエラーを投げる」というより厳格なセマンティクスを適用しています（`parseSubagentContent` を参照）。2パスリカバリは、特に手作業で編集された古いCCエージェントファイルを許容するためのものです。より厳格な姿勢を移植するのは問題ありませんが、**ネストされたフィールドが不正な場合にローダー全体がクラッシュしないようにする**必要があります。警告＆スキップの姿勢についてはPhase 5を参照。

## Phase 3 — zodによるネストバリデーション（CC）

`docs/declarative-agents-port.md` Phase 1 + バイナリ文字列の相互参照による関連CCバリデーター:

### `mcpServers`（CCシンボル `gS8` / JSONシャドウ `jL7`）

```
mcpServers: z.union([
  z.string(),                                            // サーバー名の参照
  z.record(z.string(), McpServerConfigSchema()),         // インライン { name: spec }
])
```

`McpServerConfigSchema()`（`claude.strings:124–135` 参照）は、`type` による**判別ユニオン**:

| `type`             | 必須フィールド                      | 備考                                                 |
| ------------------ | ----------------------------------- | ----------------------------------------------------- |
| `"stdio"`          | `command: string`, `args?: string[]` | 加えて `env?: Record<string,string>`, `cwd?: string`  |
| `"sse"`            | `url: string`                       | 加えて `headers?: Record<string,string>`              |
| `"http"`           | `url: string`                       | 加えて `headers?`, `method?`                         |
| `"websocket"`      | `url: string`                       | qwen-codeのパリティは未確認 — 必要になるまで延期      |
| `"sdk"`            | 異なる                               | CC内部使用; サポート不要                               |
| `"claudeai-proxy"` | 異なる                               | CC内部使用; サポート不要                               |

**qwen-code v1の場合**: `Record<string, unknown>` として検証（緩いDL7スタイル）、その後下流の `Config.getMcpServers()` へのマージで型の強制を行う。`qwen-code` にはすでに `type` 判別を持つ `MCPServerConfig` クラスがあるため、zodスキーマを複製する代わりにそのコンバーターを再利用する。`docs/declarative-agents-port.md` のランタイム配線計画のPhase 4を参照。

### `hooks`（CCシンボル `TKO` / `_u`）

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig（`type` による判別ユニオン）:
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

文字列相互参照によるフックイベントキーは、qwen-codeがすでにサポートしているものと同じセット: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `Notification` — さらにCCにはないいくつかのqwen専用イベント（`TodoCreated`, `TodoCompleted`）。

**qwen-code v1の場合**: `Record<string, unknown>` として検証（緩い）、その後qwen-codeの既存の `SessionHooksManager` バリデーターに引き渡す。これらはすでにイベントごとの `HookDefinition[]` 形状を実装している（Phase 1のランタイムマッピングによる `packages/core/src/hooks/types.ts:207–211` 参照）。

### なぜ両方のバリデーターが `Ig5` シャドウレベルで `z.unknown()` なのか

`Ig5` は**テレメトリーシャドウスキーマ**です。YAMLキーが既知のセットにない場合に `tengu_frontmatter_shadow_unknown_key` イベントを発火し、既知のキーが誤った型を持つ場合に `_mismatch` イベントを発火します。`mcpServers` と `hooks` に対して意図的に `z.unknown()` を使用しているのは、**`Ig5` はPARSE時に実行される**ため、インラインのmcpServers仕様ごとに誤ったミスマッチイベントが発火するのを防ぐためです。実際のバリデーションは以下に委譲されます:

- `gS8`（`mcpServers` 用）— **エージェント登録時**に `DL7` のアイテムごとの `safeParse` から呼び出される
- `TKO`（`hooks` 用）— **フック発火時**に `_u().safeParse` から呼び出される

この**遅延バリデーション**は、qwen-codeが模倣すべきモデルです。frontmatterパーサーは寛容に保ち（TSの `z.unknown()` 相当）、使用時に検証します。完全なzodツリーを `SubagentConfig` に前方に持ってくると、qwenの `MCPServerConfig` クラスと `HookDefinition` 型を現在存在しないレイヤーにインポートする必要があり、実際にはサポートしていない `type: 'sdk'` / `type: 'claudeai-proxy'` のための偽のバリデーターを発明する必要があります。

## Phase 4 — セキュリティ態勢

このqwen-codeツリー内の `yaml@2.8.1` のデフォルトの実証確認:

### プローブ結果

```
$ node -e "const y=require('yaml'); console.log(y.parse('a: 1').constructor.name, y.parseDocument('a: 1').schema?.name)"
Object core
```

→ デフォルトスキーマは `'core'`（YAML 1.2 JSONスーパーセット）。 **C**

```
$ node -e "const y=require('yaml'); console.log(y.parse('!!js/function \"function(){}\"'))"
function(){}
(node:18525) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: tag:yaml.org,2002:js/function
```

→ `!!js/function` タグは**実行されません**。値は**リテラル文字列** `"function(){}"` に解決され（呼び出し可能な関数オブジェクトではない）、致命的でない `YAMLWarning` を発行します。攻撃者はこのベクターでRCEを達成できません。 **C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJECTED:', e.message) }"
REJECTED: Excessive alias count indicates a resource exhaustion attack
```

→ エイリアス展開 / billion-laughs は**デフォルトで拒否**されます。ライブラリには `maxAliasCount: 100` が組み込まれています（失敗したパースは1+10+100 = 111エイリアスをカウント）。 **C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ マージキー（`<<`）はデフォルトでは**リテラルキー文字列**として解析され、展開されません。`<<` パーサーは `{ merge: true }` でオプトインです。有効化しません。 **C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ CC形式のネストされたmcpServersが、深くネストされたオブジェクト/配列として正しく解析されます。 **C**

### 安全性のまとめ

| ベクター                       | `yaml@2.8.1` デフォルト             | qwen-codeで必要なアクション                       |
| ------------------------------ | ------------------------------------ | ------------------------------------------------- |
| 任意のJS実行                   | 不可能 — evalなし                    | なし                                              |
| `!!js/function` タグ           | リテラル文字列 + 警告になる          | なし                                              |
| Billion laughs                 | 拒否される（`maxAliasCount: 100`）   | なし — デフォルトのままにする                     |
| マージキー (`<<`)              | リテラルキーとして扱われる          | なし — デフォルトのままにする（`merge: true` を渡さない） |
| アンカー / エイリアス（通常使用） | 許可、CC形式データに有用            | なし                                              |
| 任意の未知タグ                 | 文字列 + `YAMLWarning`              | 必要に応じて警告をロガーにリダイレクト（Phase 6参照） |

**結論**: `yaml` パッケージの標準動作は、元のタスクブリーフが `js-yaml` の `FAILSAFE_SCHEMA` で要求していたものよりもすでに安全です。スキーマのロックダウンは必要ありません。

## Phase 5 — リカバリセマンティクス

CCはすべてのレイヤーで**グレースフルな警告＆スキップ**を選択しています:

1. YAMLパーサーがスロー → frontmatterパーサーがログ出力し、`{}`（空データ）を返す
2. フィールドの形状が間違っている（例: `mcpServers: "this is a string"`）→ `safeParse` が失敗 → フィールドは出力されるconfigから削除される
3. フィールドが_ほぼ_間違った形状（例: 個々の `mcpServers` アイテムが文字列でスキーマはオブジェクトを期待）→ アイテムごとの `safeParse` がそのアイテムだけを削除し、残りは保持

qwen-codeはすでに `permissionMode`、`maxTurns`、`color`、`effort` に対してフィールドごとの警告＆スキップ姿勢を実装しています（`packages/core/src/subagents/agent-frontmatter-schema.ts` 参照）。同じパターンを `mcpServers` と `hooks` に拡張します。

CCからクローンしないもの:

- **自動引用符付きの2パスYAMLリカバリ**。これはqwen-codeにとっては死重です — 新しいプロジェクトであり、許容すべき手作業で編集されたレガシーfrontmatterファイルはありません。クリーンなエラーの方が、推測に基づく再解釈よりも有用です。
- **`tengu_*` テレメトリーイベント**。qwen-code独自のロガー / ローダーの他の部分で使用されているテレメトリー層に置き換えられます。

## Phase 6 — qwen-codeへの推奨

### ライブラリの選択

- **`yaml@^2.8.1` を使用**（すでに推移的依存 — `packages/core/package.json` の直接依存に昇格させ、より厳格な解決モードで破損しないようにする。またメジャーバージョンをピン留めできる）.
- **デフォルトスキーマ** (`core`) を使用し、スキーマフラグは付けない。
- `{ merge: true }` は**渡さない**。非デフォルトオプションは有効化しない。
- 決定的なstringify出力（テストスナップショット用）の場合は、`yaml.stringify` に `{ lineWidth: 0, defaultStringType: 'PLAIN' }` を渡して、ライブラリが長い行を折り返したり、コンテンツ長に基づいてブロックスカラー引用に任意に切り替えたりしないようにする。

### 維持するAPIサーフェス

現在の `packages/core/src/utils/yaml-parser.ts` のエクスポート:

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

置き換え後も両方のシグネチャを**同一**に保つため、5つの呼び出し元（`subagent-manager.ts`、`claude-converter.ts`、`rulesDiscovery.ts`、`skill-manager.ts`、`skill-load.ts`）および `index.ts` の再エクスポートで呼び出しサイトの変更が不要。

実装スケッチ:

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

**なぜ非オブジェクトのトップレベルを `{}` に強制するのか**: 既存のすべての呼び出し元はレコードを想定しています。`null`（空ファイル）、`["foo"]`（リスト）、`"hello"`（ベアスカラー）にパースされるYAMLファイルは、現在下流の分割代入でクラッシュします。`{}` を返すことで、同じ入力に対する古い手書きパーサーの動作を維持します。これを意図的なガードレールとして1行のコメントに記載してください。

### 変更不要な呼び出し元

| ファイル                                              | 使用法                                                                   | 互換性?                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `packages/core/src/index.ts:360`                      | yaml-parser からの `*` を再エクスポート                                   | はい — 同じ名前                                                        |
| `packages/core/src/subagents/subagent-manager.ts:15`  | `parse`、`stringify`                                                     | はい                                                                   |
| `packages/core/src/extension/claude-converter.ts:26`  | `parse`、`stringify`                                                     | はい — ラウンドトリップが `mcpServers` + `hooks` で安全になる（Phase 3参照） |
| `packages/core/src/utils/rulesDiscovery.ts:20`        | `parse as parseYaml`                                                     | はい                                                                   |
| `packages/core/src/skills/skill-manager.ts:13`        | `parse as parseYaml`（さらに個別に `import * as yaml from 'yaml'` もある） | はい — 重複した `import * as yaml` はフォローアップで削除可能          |
| `packages/core/src/skills/skill-load.ts:11`           | `parse as parseYaml`                                                     | はい                                                                   |
### 必要なテストフィクスチャー

現在の手書きパーサーが失敗し、置き換え先が対応しなければならない3つの具体的なYAMLスニペット（ネストされた形状ごとに1つ）:

```yaml
# フィクスチャー 1 — mcpServers (レコードのレコード)
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
# フィクスチャー 2 — hooks (レコードの配列のレコード、イベント名の下に2レベルのネスト)
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
# フィクスチャー 3 — 浅い構造と深い構造の混合、加えてPR #4842がすでにサポートしているすべての項目
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

`packages/core/src/utils/yaml-parser.test.ts` の下部（200–227行）に、`known limitations — nested YAML (pin until js-yaml lands)` と題された2つの「ピンテスト」があります。置き換えでは、これらを正の形式のネスト解析アサーションに**変更する**必要があります:

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

これら2つのアサーションと上記3つのフィクスチャーが、実装計画のフェーズ2の**受け入れ基準**となります。その他（エスケープのエッジケース、引用符付き/なしの真偽値、数値文字列など）は、既存のテストスイートによるリグレッションカバレッジであり、変更なしでパスする必要があります。

### ラウンドトリップ整合性チェック

既存のテスト `should maintain round-trip integrity for escaped strings` (111-129行) は、`stringify → parse` を通して7つの文字列を実行します。`yaml` のデフォルトの `stringify` は、手書きフォーマッタとはわずかに異なる出力を生成します（場合によってはより積極的な引用、異なるエスケープシーケンス）。2つの許容可能な結果:

1. **テストフィクスチャーを調整**して新しいパーサーの下での動作をアサートする — 重要なのはラウンドトリッププロパティ（`parse(stringify(x)) === x`）であり、バイト単位で同一のYAML出力ではありません。
2. **バイト単位で同一のアサーションをそのまま残し**、可視化された失敗を許容し、その後 `yaml` の出力をそのまま反映するように更新する。差分レビューが容易になります。

推奨: **オプション1** — アサーションをプロパティベース（`expect(parse(stringify(obj))).toEqual(obj)`）に変更します。バイト単位で同一のYAML出力は、モジュールの文書化された契約ではありません。

### 呼び出し元への破壊的変更 — 予想なし、ただし確認が必要

- `subagent-manager.ts` は、`saveSubagent` パスのために、解析されたオブジェクトをYAMLに再シリアライズします。新しいパーサーでは、`mcpServers` と `hooks` はクリーンにラウンドトリップします。`claude-converter.ts` の `NESTED_FIELDS_NOT_ROUND_TRIPPABLE` を更新し（実装のフェーズ3）、これらの2つのフィールド名を削除します。
- `skill-manager.ts` はすでに `yaml` を直接インポートしています（手書きパーサーとは別です）。`yaml-parser.ts` も `yaml` を使用するようになったら、重複したインポートは小さなフォローアップとして削除可能です — ここでは範囲外です。

### 移行リスク

低い。5つの呼び出し元はすべて `Record<string, unknown>` を分割代入します — 同じ戻り値の型です。2つの意図的な「破壊」ピンテストのみが失敗すると予想されます。これらは既知のものであり、意図的に変更します。より広範なリグレッションカバレッジは、`packages/core/src/subagents/`、`packages/core/src/skills/`、および `packages/core/src/extension/` の既存のテストスイートから得られます。

## 未解決の質問

| #   | 質問                                                                                                                                              | ブロック中？                                                               | 解決方法                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `yaml.parse` は、`YAMLWarning`（例: `Unresolved tag`）を `process.emitWarning` の代わりに qwen-code のロガーにリダイレクトするために、明示的なロガーを必要としますか？  | いいえ — 延期                                                              | CIでログがノイズになる場合は、`{ logLevel: 'silent' }` またはカスタムの `onWarning` コールバックを実装します。v1にとってクリティカルではありません。                                                      |
| Q2  | `parse()` は、空文字列 / 空ドキュメントのYAMLに対して、引き続き `{}` を返すべきですか、それともスローすべきですか？                                                             | いいえ — 現在の動作を維持                                          | 現在の手書きパーサーは `{}` を返します。その動作を維持します。この選択を固定するリグレッションテストを追加します。                                                                               |
| Q3  | `mcpServers` がトップレベルで不正な形式（例: `mcpServers: "string"`）の場合、エージェント全体のロードを失敗させるべきか、そのフィールドを削除してロードすべきですか？ | はい — 実装のフェーズ3での警告-and-ドロップの姿勢を決定づける | **解決方法**: フィールドを削除し、コンソール警告を出力します（`docs/declarative-agents-port.md`のフェーズ3に従い、CCの `DL7` と同等）。                                         |
| Q4  | Q3と同じですが、`hooks` の場合: フィールド、イベント、または個々のマッチャーだけを削除しますか？                                                                | はい — 警告-and-ドロップの姿勢を決定づける                                  | **解決方法**: トップレベルの形状が失敗した場合は、`hooks` フィールド全体を削除します。イベントごと/マッチャーごとの細かい処理は、実際のユーザーから需要が発生した場合、将来のPRに延期します。 |
| Q5  | CCのヘルパーからの `Bun.YAML.parse` ショートカットはqwen-codeに適用されますか？                                                                               | いいえ                                                                      | qwen-code は Bun ランタイムをターゲットにしていません。スキップ。                                                                                                                            |

---

**ステータス**: 調査完了、フェーズ2（`yaml-parser.ts` の置き換え）とフェーズ3（`SubagentConfig` での `mcpServers` + `hooks` の再公開）の実装準備完了。詳細は `docs/declarative-agents-port.md` を参照。