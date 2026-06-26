# 自動検証結果

2026-05-20、AbortController リファクタリング中に取得。

## 1. リスナー蓄積再現スクリプト

長いセッション（単一の AbortSignal に 1500 以上のアボートリスナー）で観測されたリスナー蓄積パターンを直接シミュレート。スクリプトは `listener-accumulation-repro.mjs` にあります。

```text
$ node docs/verification/abort-controller-refactor/listener-accumulation-repro.mjs
Simulating 2000 rounds for each pattern.

OLD pattern listener count on long-lived parent: 2000
NEW pattern listener count on long-lived parent: 0
PASS: OLD pattern accumulated >1500 listeners (reproduces the bug).
PASS: NEW pattern kept listener count at 0 — the helper prevents accumulation.
```

これは自己完結型の証明です。OLD パターン（`{once:true}` や逆クリーンアップなしの生の `addEventListener`）は、2000 ラウンドで 2000 のリスナーを蓄積します。これはユーザーが観測した 1500 のしきい値をはるかに超えています。NEW パターン（`packages/core/src/utils/abortController.ts` の `createChildAbortController`）は、2000 ラウンドにわたって親のリスナーカウントを 0 に保ちます。これは、各子の逆クリーンアップリスナーが、子がアボートしたときに親リスナーを削除するためです。

## 2. 移行範囲（意図的）

長期間存続する親シグナルに実際にリスナーを蓄積する agent-runtime の親→子チェーンだけがヘルパーに移行されています。

- `packages/core/src/agents/runtime/agent-interactive.ts`（マスター + メッセージごとのラウンド）
- `packages/core/src/agents/runtime/agent-core.ts`（イテレーションごとのラウンド + waitForExternalInputs + processFunctionCalls の try/finally）
- `packages/core/src/agents/runtime/agent-headless.ts`（external → execution）
- `packages/core/src/hooks/promptHookRunner.ts`（実際のクリーンアップリークがあった：`{once:true}` なしで手動 addEventListener、削除もされていなかった）

さらに、3 つの `{once:true}` のみの修正（ヘルパー切り替えなし、防御的な正当性のため）：

- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/functionHookRunner.ts`
- `packages/core/src/confirmation-bus/message-bus.ts`

独立した短命なコントローラー（`tools/shell.ts` のシェルコマンドごと、`tools/monitor.ts` のモニターごと、`agents/arena/ArenaManager.ts` のアリーナセッションごと、`core/client.ts` のリコールごと、`utils/fetch.ts` のフェッチごと、dream / title / judge / resume ごとなど）は、生の `new AbortController()` のままです。これらは使用後に GC され、長期存続する親に蓄積しません。

実際の grep と根拠については `migration-completeness.txt` を参照してください。

## 3. 影響を受けるテストスイート

影響を受ける全 71 テストファイル / 2085 テストがパス（3 つスキップ — 1 つは `--expose-gc` が必要な GC テスト、2 つはヘッドレススイートの既存スキップ）。

```text
 Test Files  71 passed (71)
      Tests  2085 passed | 3 skipped (2088)
   Duration  16.71s
```

カバレッジ：

- `packages/core/src/utils/abortController.test.ts` — 26 テスト：ファクトリキャップ（デフォルト + カスタム）、子の伝播、逆クリーンアップ、fast path、未定義の親、カスタム maxListeners の受け渡し、`combineAbortSignals` のセマンティクス（クリーンアップによるタイムアウトキャンセル、タイムアウトによる入力リスナーのクリーンアップ、`timeoutMs <= 0` の境界、イテレーション中の防御的チェックを含む）、GC 安全性（ベストエフォート）。
- `packages/cli/src/utils/warningHandler.test.ts` — 13 テスト：冪等性、AbortSignal 抑制（`[AbortSignal{...}]` 形式を含む）、ジェネリックな EventTarget は抑制されない、デバッグモードの通過、既存リスナーへのファンアウト、生成された子のエンドツーエンドの stderr 統合。
- `packages/core/src/hooks/httpHookRunner.test.ts` — 移行された `combineAbortSignals` コンシューマーをカバー（非推奨の `createCombinedAbortSignal` シムとそのテストファイルは、唯一の呼び出し元が移行した時点で削除されました）。
- `packages/core/src/agents/runtime/{agent-core,agent-interactive,agent-headless,agent-context,agent-statistics}.test.ts` — 影響の大きい移行ファイルをカバーする 102 テスト。
- `packages/core/src/core/openaiContentGenerator/**` — `raiseAbortListenerCap` の応急処置を失ったパイプラインを含む 280 以上のテスト。
- `packages/core/src/followup/**` — 移行された speculation コントローラーを含む 100 以上のテスト。
- `packages/core/src/tools/agent/**`、`packages/core/src/tools/shell.test.ts`、`packages/core/src/services/**`、`packages/core/src/hooks/**`、`packages/core/src/confirmation-bus/**` — 移行されたすべてのツール/フック/サービスのファイル。

## 4. TypeScript strict-mode 型チェック

```sh
$ node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit
(出力なし、exit 0)

$ node_modules/.bin/tsc -p packages/cli/tsconfig.json --noEmit
(出力なし、exit 0)
```

## 5. Prettier フォーマット

```sh
$ node_modules/.bin/prettier --check packages/core/src/agents/runtime/agent-core.ts \
    packages/core/src/agents/runtime/agent-headless.ts \
    packages/cli/src/utils/warningHandler.ts \
    packages/cli/src/utils/warningHandler.test.ts \
    packages/core/src/utils/abortController.ts \
    packages/core/src/utils/abortController.test.ts
Checking formatting...
All matched files use Prettier code style!
```

## 6. ビルド + バイナリ スモークテスト

```sh
$ npm run build:packages
(5 つのワークスペースパッケージすべて成功)

$ NODE_OPTIONS=--trace-warnings node packages/cli/dist/index.js --version
0.15.11
EXIT=0

$ node packages/cli/dist/index.js --help
Usage: qwen [options] [command]
...
```

`--trace-warnings` での起動時に警告は出力されませんでした。

## 7. Codex による独立レビュー

`codex:codex-rescue` エージェントによる 2 回のフルパス（毎回独立したコンテキスト）。最初のパスで 3 つの問題が発見され、すべて後続のコミットで対処されました。

1. **コントローラー作成と明示的なアボートの間でスローされるとリスナーがリークする** — `agent-core.ts` のイテレーションごとの本体と `agent-headless.ts` の try ブロック前のセットアップ。それぞれを `try { ... } finally { abortController.abort(); }` でラップして修正。
2. **警告抑制の正規表現 `EventTarget` が広すぎる**。Node ≥20 が生成する任意の形状の `AbortSignal` のみに一致するように絞り込み。
3. **`process.removeAllListeners('warning')` がサードパーティのリスナーを削除する**。削除 — Node の「リスナーなし → デフォルトプリンターが発動」セマンティクスに依存することで、ハンドラを追加すると暗黙的にデフォルトの出力パスが無効になり、サードパーティのテレメトリーリスナーはそのまま維持される。

2 回目のパスですべての修正が正しいことを確認し、さらなるブロッカーはなし。

## インタラクティブ検証として残っているもの

`README.md` の番号 00–09 のシナリオは、モデル API に対する実際のインタラクティブセッション（長い混合ツール会話、Ctrl-C による中断、サブエージェントのキャンセル、ヒープスナップショット）が必要です。これらは人間が実行するために文書化されており、実行時のトランスクリプトを PR 本文に添付する必要があります。