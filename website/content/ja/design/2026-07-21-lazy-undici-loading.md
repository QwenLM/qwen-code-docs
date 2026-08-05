# undici の遅延読み込み（lazy startup フェーズ 3）

- Status: 実装済み
- Issue: QwenLM/qwen-code#7264（候補 4）、#4748 のフォローアップ
- 先行: `2026-07-19-lazy-telemetry-sdk-loading.md`、`2026-07-19-telemetry-protocol-split.md`

## 問題

テレメトリーの各フェーズの後、undici は ACP の eager な起動クロージャに残る最大の単一のサードパーティ寄与者です: 2 つのバンドルコピーにまたがり 2057 KiB（cli は自身の `undici` を解決し、core は別物を解決します）。クロージャ内のどこかにあるすべての静的な `import { … } from 'undici'` が、コールドスタートの parse/compile に完全なコピー 1 つ分を引き込みます — undici が実際に必要になるのはリクエストが実際に出て行くとき（プロキシディスパッチャー、preconnect、IDE クライアントの fetch オプション、GitHub セットアップ、セルフアップデート）にもかかわらず。

metafile は 8 つの値インポート箇所を示していました（型のみのインポートはコストなし）:

| パッケージ | 箇所                           | 使用                                       |
| ------- | ------------------------------ | ------------------------------------------ |
| core    | `utils/runtimeFetchOptions.ts` | `Agent`、`ProxyAgent`、`EnvHttpProxyAgent` |
| core    | `config/config.ts`             | `EnvHttpProxyAgent`、`setGlobalDispatcher` |
| core    | `ide/ide-client.ts`            | `Agent`（IDE HTTP keep-alive）              |
| cli     | `utils/apiPreconnect.ts`       | `fetch`                                    |
| cli     | `commands/channel/proxy.ts`    | `EnvHttpProxyAgent`、`setGlobalDispatcher` |
| cli     | `utils/gitUtils.ts`            | `ProxyAgent`                               |
| cli     | `services/setup-github.ts`     | `ProxyAgent`                               |
| cli     | `utils/standalone-update.ts`   | `fetch`                                    |

## 設計

8 つの箇所すべてが動的な `import('undici')` に移行し、パッケージごとの 2 つのシングルフライトヘルパーに集約されます:

- `packages/core/src/utils/runtimeFetchOptions.ts` — `loadUndici()`。さらに既存の `preloadRuntimeFetchModule()` も今後はこれに委譲します。同期の利用側（`getOrCreateSharedDispatcher`、`buildFetchOptionsWithDispatcher`）は fail-loud な `requireUndici()` を保持; await できる非同期エントリポイント（`createContentGenerator`、`Config.initialize`、IDE クライアント接続）は、同期構築が実行される前に事前読み込みします。
- `packages/cli/src/utils/load-undici.ts` — 同じヘルパー。意図的に複製されています（「なぜ 2 つのヘルパーか」参照）。

呼び出し箇所の注記:

- `Config`: グローバルプロキシディスパッチャーは非同期にインストールされます; promise は保存され、`initialize()` の先頭で await されるため、ディスパッチャーはあらゆるネットワーク活動の前に配置され、以前の同期順序保証と一致します。
- `createContentGenerator` は、プロバイダーのコンストラクタが undici ベースの fetch オプションを同期的に構築する前に、`preloadRuntimeFetchModule()` を await します。

## esbuild の CJS interop（難しい部分）

esbuild は CJS の undici パッケージを **default のみの**動的チャンクにコンパイルします: `export default require_undici()` で、named export はありません。そのため `const { Agent } = await import('undici')` は Node と vitest（CJS に対して named export を合成する）では動作しますが、バンドル内では `undefined` を分解代入します。ローカルのテスト実行ではこれを捕捉できません — バンドルされたスモーク実行のみが捕捉します。

したがって `loadUndici()` は正規化します: `Object.keys(mod)` が正確に `['default']` の場合は `mod.default` をアンラップし、それ以外の場合は名前空間をそのまま返します。単一キーのチェック（`mod.default ?? mod` や `'default' in mod` ではなく）は意図的です:

- vitest のモックプロキシは未定義の `default` エクスポートへのアクセスで**スローする**ため、`mod.default` のプローブはすべての `vi.mock('undici')` テストを壊します;
- `{ ...actual }` として構築されたモックは、named export と並んで `default` キーを持つ可能性があり、アンラップしてはいけません。

## なぜ 2 つのヘルパーか（core からエクスポートする 1 つではなく）

cli と core は**異なる** undici コピーを解決します。cli のコードが core に置かれた `loadUndici()` を呼び出すと、`import('undici')` は core のパッケージスコープ内で解決され、cli テストの `vi.mock('undici')` を逃れます — モックは暗黙のうちにインターセプトを停止します（観測例: `setup-github.test.ts` で `ProxyAgent` モックが一度も呼ばれない）。パッケージごとに 1 つのヘルパーを保つことで、各パッケージのテストが自身の undici をモックできるままになります。

## ガード

`scripts/check-serve-fast-path-bundle.js` は `FORBIDDEN_ACP_PACKAGES` に undici を追加します: ACP の eager クロージャ内のどこかでの静的な再インポートは CI を失敗させます。変更後、eager クロージャは 15.42 MiB / 132 チャンクから 13.39 MiB / 130 チャンクに減少し、undici のバイト数は 2057 KiB → 0; バンドルは正確に 2 つの動的 undici エントリチャンク（パッケージコピーごとに 1 つ）を保持し、どちらも正規化ヘルパーの後ろにあります。

## 受け入れ（2C4G、#4748 の規律）

30 回のペアシリアルコールドスタート、コントロール = フェーズ 2 ビルド、候補 = この変更: process→最初のセッションのペア P50 −89.5 ms（1336.8 → 1255.2）、候補は 30/30 ペアで高速; プリヒート済みパスは変更なし（P50 80.7 → 78.0）; 最初のセッション後の RSS −8.1 MB。機能ゲート（並行性、テレメトリー無効、レガシー単一セッション）はすべてパス。完全な数値は `.qwen/e2e-tests/phase3-lazy-undici-bench-results.md` にあります。

## 却下された代替案

- **core からエクスポートされる単一の共有ヘルパー**: cli のテストモックを壊し、cli の undici コピーを core のものに結合します（2 つのコピーはすでに HEAD で異なるバージョンにあります: 7.27.2 対 7.28.0）。
- **起動時に開始される eager なトップレベルの事前読み込み**: 何も await しなければ parse コストをクリティカルパスから外せますが、要点は、ほとんどのコールドスタートは最初のセッションの前に undici をまったく必要としないということです; 事前読み込みは、フェーズ 2 が計測した 2 コアでの CPU 競合を再追加します。
- **undici の使用をグローバルな `fetch` に置き換える**: Node のグローバル fetch は undici ですが、コードにはグローバルサーフェスが公開しない `Agent`/`ProxyAgent`/`EnvHttpProxyAgent` のディスパッチャーオプションが必要です。
