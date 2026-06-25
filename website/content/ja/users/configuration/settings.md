# Qwen Code の設定

> [!tip]
>
> **認証 / API キー:** 認証（API キー、Alibaba Cloud Coding Plan）および認証関連の環境変数（`OPENAI_API_KEY` など）は **[認証](../configuration/auth)** に記載されています。

> [!note]
>
> **新しい設定フォーマットについて**: `settings.json` のフォーマットが、より整理された新しい構造に更新されました。古いフォーマットは自動的に移行されます。
> Qwen Code には、環境変数、コマンドライン引数、設定ファイルなど、動作を設定するためのいくつかの方法があります。このドキュメントでは、さまざまな設定方法と利用可能な設定項目を説明します。

## 設定の優先順位

設定は以下の優先順位で適用されます（番号が小さいほど高い番号に上書きされます）:

| レベル | 設定ソース | 説明 |
| ----- | ---------------------- | ------------------------------------------------------------------------------- |
| 1     | デフォルト値 | アプリケーション内のハードコードされたデフォルト |
| 2     | システムデフォルトファイル | 他の設定ファイルで上書き可能なシステム全体のデフォルト設定 |
| 3     | ユーザー設定ファイル | 現在のユーザーのグローバル設定 |
| 4     | プロジェクト設定ファイル | プロジェクト固有の設定 |
| 5     | システム設定ファイル | 他のすべての設定ファイルを上書きするシステム全体の設定 |
| 6     | 環境変数 | システム全体またはセッション固有の変数（`.env` ファイルから読み込む場合もあります） |
| 7     | コマンドライン引数 | CLI 起動時に渡された値 |

## 設定ファイル

Qwen Code は永続的な設定に JSON 設定ファイルを使用します。ファイルの場所は 4 つあります:

| ファイル種別 | 場所 | スコープ |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| システムデフォルトファイル | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>パスは `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 環境変数で上書きできます。 | システム全体のデフォルト設定のベースレイヤーを提供します。最も低い優先順位を持ち、ユーザー設定、プロジェクト設定、またはシステム上書き設定によって上書きされることを想定しています。 |
| ユーザー設定ファイル | `~/.qwen/settings.json`（`~` はホームディレクトリ）。 | 現在のユーザーのすべての Qwen Code セッションに適用されます。 |
| プロジェクト設定ファイル | プロジェクトのルートディレクトリ内の `.qwen/settings.json`。 | その特定のプロジェクトから Qwen Code を実行する場合にのみ適用されます。プロジェクト設定はユーザー設定を上書きします。 |
| システム設定ファイル | Linux: `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>パスは `QWEN_CODE_SYSTEM_SETTINGS_PATH` 環境変数で上書きできます。 | すべてのユーザーに対してシステム上のすべての Qwen Code セッションに適用されます。システム設定はユーザー設定とプロジェクト設定を上書きします。企業のシステム管理者がユーザーの Qwen Code 設定を制御する場合に便利です。 |

> [!note]
>
> **設定ファイル内の環境変数について:** `settings.json` ファイル内の文字列値では、`$VAR_NAME` または `${VAR_NAME}` の構文を使って環境変数を参照できます。これらの変数は設定の読み込み時に自動的に解決されます。例えば、環境変数 `MY_API_TOKEN` がある場合、`settings.json` で `"apiKey": "$MY_API_TOKEN"` のように使用できます。

### プロジェクト内の `.qwen` ディレクトリ

プロジェクト設定ファイルに加えて、プロジェクトの `.qwen` ディレクトリには、Qwen Code の動作に関連する以下のようなプロジェクト固有のファイルを配置できます:

- [カスタムサンドボックスプロファイル](../features/sandbox)（例: `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）
- `.qwen/skills/` 配下の [Agent Skills](../features/skills)（各 Skill は `SKILL.md` を含むディレクトリ）

### 設定の移行

Qwen Code はレガシーな設定を新しいフォーマットに自動移行します。移行前に古い設定ファイルはバックアップされます。以下の設定は否定形（`disable*`）から肯定形（`enable*`）に改名されました:

| 旧設定 | 新設定 | 備考 |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate` | 1 つの設定に統合 |
| `disableLoadingPhrases` | `ui.accessibility.enableLoadingPhrases` | |
| `disableFuzzySearch` | `context.fileFiltering.enableFuzzySearch` | |
| `disableCacheControl` | `model.generationConfig.enableCacheControl` | |

> [!note]
>
> **真偽値の反転:** 移行時に真偽値は反転されます（例: `disableAutoUpdate: true` は `enableAutoUpdate: false` になります）。

#### `disableAutoUpdate` と `disableUpdateNag` の統合ポリシー

両方のレガシー設定が異なる値で存在する場合、移行は以下のポリシーに従います: `disableAutoUpdate` **または** `disableUpdateNag` のどちらかが `true` の場合、`enableAutoUpdate` は `false` になります:

| `disableAutoUpdate` | `disableUpdateNag` | 移行後の `enableAutoUpdate` |
| ------------------- | ------------------ | --------------------------- |
| `false`             | `false`            | `true`                      |
| `false`             | `true`             | `false`                     |
| `true`              | `false`            | `false`                     |
| `true`              | `true`             | `false`                     |

### `settings.json` で利用可能な設定

設定はカテゴリごとに整理されています。ほとんどの設定は `settings.json` の対応するトップレベルカテゴリオブジェクト内に配置する必要があります。`proxy` や `plansDirectory` のような一部のトップレベル設定は、互換性のためにルートキーとして残っています。

#### general

| 設定 | 型 | 説明 | デフォルト |
| ------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `general.preferredEditor` | string | ファイルを開く際に使用するエディタ。 | `undefined` |
| `general.vimMode` | boolean | Vim キーバインドを有効にします。 | `false` |
| `general.enableAutoUpdate` | boolean | 起動時の自動更新チェックとインストールを有効にします。 | `true` |
| `general.showSessionRecap` | boolean | ターミナルから離れた後に戻ってきたとき、「どこまでやったか」を 1 行で自動表示します。デフォルトはオフ。この設定に関係なく `/recap` で手動トリガーできます。 | `false` |
| `general.sessionRecapAwayThresholdMinutes` | number | フォーカスが戻ったときに自動リキャップが発動するまでのターミナルのブラー時間（分）。`showSessionRecap` が有効な場合にのみ使用されます。 | `5` |
| `general.gitCoAuthor.commit` | boolean | Qwen Code 経由のコミットに `Co-authored-by` トレーラーを追加し、ファイルごとの AI 帰属 git ノート（`refs/notes/ai-attribution`）を付与します。無効にすると両方ともスキップされます。 | `true` |
| `general.gitCoAuthor.pr` | boolean | `gh pr create` 実行時にプルリクエストの説明に Qwen Code の帰属行を追加します。 | `true` |
| `general.defaultFileEncoding` | string | 新しいファイルのデフォルトエンコーディング。BOM なし UTF-8 の場合は `"utf-8"`（デフォルト）、BOM あり UTF-8 の場合は `"utf-8-bom"` を使用します。プロジェクトが BOM を必要とする場合にのみ変更してください。 | `"utf-8"` |
| `general.cleanupPeriodDays` | number | `/rewind` で使用される `~/.qwen/file-history/` セッションバックアップの保持日数。この日数より古いバックアップは、1 日最大 1 回実行されるバックグラウンド処理によって削除されます。`0` = 最小保持（約 1 時間）: 最後の 1 時間以内にアクセスされたセッションと現在アクティブなセッションのみ保持。再起動後に有効になります。 | `30` |
| `general.language` | enum | UI の言語。システム設定から自動検出する場合は `"auto"`、または言語コード（例: `"zh-CN"`、`"fr"`）を指定します。JS ロケールファイルを `~/.qwen/locales/` に配置してカスタムコードを追加できます。[i18n](../features/language) を参照。再起動が必要です。 | `"auto"` |
| `general.outputLanguage` | string | モデル出力の言語。システム設定から自動検出する場合は `"auto"`、または特定の言語を指定します。再起動が必要です。 | `"auto"` |
| `general.dynamicCommandTranslation` | boolean | 動的スラッシュコマンドの説明を AI で翻訳することを有効にします。無効にすると、動的コマンドは元の説明のままで翻訳モデルの呼び出しをスキップします。 | `false` |

#### output

| 設定 | 型 | 説明 | デフォルト | 指定可能な値 |
| ----------------------- | ------- | -------------------------------------------------------------- | -------- | ------------------ |
| `output.format` | string | CLI 出力のフォーマット。 | `"text"` | `"text"`、`"json"` |
| `output.showTimestamps` | boolean | 各アシスタントの応答の前に `[HH:MM:SS]` タイムスタンプを表示します。 | `false` | |

#### ui

| 設定 | 型 | 説明 | デフォルト |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `ui.theme` | string | UI のカラーテーマ。利用可能なオプションは [テーマ](../configuration/themes) を参照してください。 | `"Qwen Dark"` |
| `ui.customThemes` | object | カスタムテーマの定義。 | `{}` |
| `ui.statusLine` | object | カスタムステータスラインの設定。`command`、`refreshInterval`、`respectUserColors`、`hideContextIndicator` オプションをサポートします。[ステータスライン](../features/status-line) を参照。 | `undefined` |
| `ui.hideWindowTitle` | boolean | ウィンドウタイトルバーを非表示にします。 | `false` |
| `ui.hideTips` | boolean | UI 内のすべてのヒント（起動時および応答後）を非表示にします。[コンテキストヒント](../features/tips) を参照。 | `false` |
| `ui.hideBanner` | boolean | 起動時の ASCII ロゴとインフォパネルを非表示にします。`ui.hideTips` も設定されていない限り、ヒントとチャット入力は引き続き表示されます。 | `false` |
| `ui.customBannerTitle` | string | バナーインフォパネルのデフォルトの `>_ Qwen Code` タイトルを置き換えます。`(vX.Y.Z)` バージョンサフィックスは常に追加され、認証、モデル、パスの行には影響しません。サニタイズ済み、最大 80 文字。 | `""` |
| `ui.customBannerSubtitle` | string | バナータイトルと認証/モデル行の間に表示されるオプションのサブタイトル行（空白スペーサー行の代わり）。サニタイズ済み、最大 160 文字。空（デフォルト）の場合は元の空白スペーサーを維持します。 | `""` |
| `ui.customAsciiArt` | string \| object | バナーの QWEN ASCII ロゴを置き換えます。インライン文字列（両方の幅ティアに使用）、`{ "path": "./brand.txt" }`（相対パスは所有する設定ファイルのディレクトリからの相対パスで解決；起動時に `O_NOFOLLOW` で読み取り、64 KB 上限）、または幅対応選択のための `{ "small": ..., "large": ... }` を受け付けます。サニタイズ済み、ティアあたり最大 200 行 × 200 列。 | `undefined` |
| `ui.showLineNumbers` | boolean | CLI 出力のコードブロックに行番号を表示します。 | `true` |
| `ui.renderMode` | string | デフォルトの Markdown 表示モード。リッチなビジュアルプレビューには `"render"`、デフォルトでソース指向の Markdown を表示するには `"raw"` を使用します。セッション中に `Alt/Option+M` で切り替え可能；macOS ではターミナルが Option を Meta として送信する必要があります。[Markdown レンダリング](../features/markdown-rendering) を参照。 | `"render"` |
| `ui.showCitations` | boolean | チャットで生成されたテキストの引用を表示します。 | `false` |
| `ui.history.collapseOnResume` | boolean | セッション再開時にデフォルトで履歴を折りたたむかどうか。`/history collapse-on-resume` および `/history expand-on-resume` で切り替え可能です。 | `false` |
| `ui.compactMode` | boolean | ツール出力とシンキングを非表示にしてクリーンなビューにします。セッション中は `Ctrl+O` で切り替えるか、設定ダイアログから変更できます。ツール承認プロンプトはコンパクトモードでも常に表示されます。設定はセッションをまたいで保持されます。 | `false` |
| `ui.shellOutputMaxLines` | number | インラインで表示されるシェル出力の最大行数。`0` でキャップを無効にし、全出力を表示します。隠れた行は `+N lines` インジケーターで示されます。エラー、`!` プレフィックスのユーザー起動コマンド、確認ツール、フォーカスされた埋め込みシェルは常に全出力を表示します。 | `5` |
| `ui.enableWelcomeBack` | boolean | 会話履歴があるプロジェクトに戻ったときにウェルカムバックダイアログを表示します。有効にすると、Qwen Code は以前に生成されたプロジェクトサマリー（`.qwen/PROJECT_SUMMARY.md`）があるプロジェクトに戻ったかどうかを自動検出し、前の会話を続けるか新しく始めるかを選択するダイアログを表示します。**新しいチャットセッションを開始**を選択した場合、プロジェクトサマリーが変わるまで現在のプロジェクトでその選択が記憶されます。この機能は `/summary` コマンドと終了確認ダイアログと連携します。 | `true` |
| `ui.accessibility.enableLoadingPhrases` | boolean | ローディングフレーズを有効にします（アクセシビリティのために無効化できます）。 | `true` |
| `ui.accessibility.screenReader` | boolean | スクリーンリーダーモードを有効にします。スクリーンリーダーとの互換性を高めるよう TUI を調整します。 | `false` |
| `ui.customWittyPhrases` | array of strings | ローディング状態で表示するカスタムフレーズのリスト。指定すると、CLI はデフォルトのフレーズの代わりにこれらのフレーズを順番に表示します。 | `[]` |
| `ui.showResponseTokensPerSecond` | boolean | モデルのストリーミング中に応答トークンカウンターの横にライブのトークン/秒推定値を表示します。これは生成速度のヒントであり、ETA や完了率ではありません。次のセッションから有効になります。 | `false` |
| `ui.enableFollowupSuggestions` | boolean | モデルの応答後に次に入力したい内容を予測する [フォローアップサジェスト](../features/followup-suggestions) を有効にします。サジェストはプレースホルダーテキストとして表示され、Tab、Enter、または右矢印で確定します（入力欄が埋まりますが自動送信はされません）。デフォルトはオン；オプトアウトするには `false` に設定します。 | `true` |
| `ui.enableCacheSharing` | boolean | サジェスト生成にキャッシュ対応のフォーク済みクエリを使用します。プレフィックスキャッシュをサポートするプロバイダーのコストを削減します（実験的）。 | `true` |
| `ui.enableSpeculation` | boolean | 確定したサジェストを送信前に投機的に実行します。確定時に結果が即座に表示されます（実験的）。 | `false` |

#### ide

| 設定 | 型 | 説明 | デフォルト |
| ------------------ | ------- | ---------------------------------------------------- | ------- |
| `ide.enabled` | boolean | IDE 統合モードを有効にします。 | `false` |
| `ide.hasSeenNudge` | boolean | ユーザーが IDE 統合の案内を見たかどうか。 | `false` |

#### privacy

| 設定 | 型 | 説明 | デフォルト |
| -------------------------------- | ------- | -------------------------------------- | ------- |
| `privacy.usageStatisticsEnabled` | boolean | 使用統計の収集を有効にします。 | `true` |

#### model

| 設定 | 型 | 説明 | デフォルト |
| -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name` | string | 会話に使用する Qwen モデル。 | `undefined` |
| `model.maxSessionTurns` | number | セッションで保持するユーザー/モデル/ツールのターン数の最大値。-1 は無制限。 | `-1` |
| `model.maxWallTimeSeconds` | number | ヘッドレス/無人実行の実時間バジェット（秒）。`-1` は無制限。`--max-wall-time` で実行ごとに上書き可能（正の値 `90`、`30s`、`5m`、`1h`、`1.5h` が必要；最小は 1 秒 — `500ms`、`0.5` などはタイポとして拒否されます）。フラグを省略するとこの設定にフォールバックします。超過時は終了コード 55 で中断します。 | `-1` |
| `model.maxToolCalls` | number | 実行のツール呼び出し累計バジェット（成功・失敗を問わず実行されたすべてのツールをカウント；`--json-schema` 配下の `structured_output` は対象外）。`-1` は無制限；`0` はツール呼び出し不可。タイポ防止のため 1,000,000 でキャップ。`--max-tool-calls` で上書き可能。超過時は終了コード 55 で中断します。 | `-1` |
| `model.generationConfig` | object | 基盤となるコンテンツジェネレーターに渡す高度な上書き設定。`timeout`、`maxRetries`、`enableCacheControl`、`splitToolMedia`（デフォルト `true`；ツールから返されるメディア — 組み込みの read_file で読み取られる画像を含む — を仕様違反の `role: "tool"` メッセージではなく後続のユーザーメッセージに分割し、doubao / new-api / LM Studio などの厳密な OpenAI 互換サーバーから見えるようにします；`false` でレガシーのツール内埋め込み動作に戻ります）、`toolResultContentFormat`（デフォルト `"parts"`；旧 OpenAI 互換ランタイムのツールテンプレートがテキストコンテンツパーツを無視する場合にのみ `"string"` を設定）、`contextWindowSize`（モデルのコンテキストウィンドウサイズの上書き）、`modalities`（自動検出された入力モダリティの上書き）、`customHeaders`（API リクエストへのカスタム HTTP ヘッダー）、`extra_body`（OpenAI 互換 API リクエスト専用の追加ボディパラメーター）、および `samplingParams` 配下のチューニングパラメーター（例: `temperature`、`top_p`、`max_tokens`）などのリクエスト制御をサポートします。プロバイダーのデフォルトに依存する場合は未設定のままにしてください。 | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number | **削除済み。** 自動コンパクションは、`computeThresholds()` 関数を通じてモデルのコンテキストウィンドウから内部的に計算される 3 段階の閾値ラダー（警告 / 自動 / ハード）を使用するようになりました — ユーザーが設定することはできません。`settings.json` でこのフィールドを設定しても黙って無視されます（起動時の警告はありません）。現在「圧縮を完全に無効化する」置き換えはありません — 圧縮自体が失敗した場合の安全網として、API レイヤーでのリアクティブオーバーフロー回復が残ります。（再設計の根拠については PR #4345 / `docs/design/auto-compaction-threshold-redesign.md` を参照。） | `N/A` |
| `model.chatCompression.maxRecentFilesToRetain` | number | 自動コンパクション後に履歴に復元される（小さい場合は埋め込み、それ以外はパス参照）最近タッチされたファイルの数。`0` は復元しません。環境変数: `QWEN_COMPACT_MAX_RECENT_FILES`。 | `5` |
| `model.chatCompression.maxRecentImagesToRetain` | number | 自動コンパクション後に履歴に復元される最近の画像（ツールのスクリーンショット / ユーザーの貼り付け）の数。`0` は復元しません。環境変数: `QWEN_COMPACT_MAX_RECENT_IMAGES`。 | `3` |
| `model.chatCompression.enableScreenshotTrigger` | boolean | `true` の場合、トークン使用量とは独立して、ツールから返された画像が `screenshotTriggerThreshold` に達すると自動コンパクションも実行されます。スクリーンショットが多いコンピューター使用セッションで、頻繁なスクリーンショットがモデルの注意を希薄にするのを防ぎます。ツール結果内で返された画像のみをカウントし、ユーザーが貼り付けた画像は含みません。環境変数: `QWEN_COMPACT_SCREENSHOT_TRIGGER`（`1`/`true`/`0`/`false`）。 | `true` |
| `model.chatCompression.screenshotTriggerThreshold` | number | スクリーンショットトリガーが発動するツール返却画像数の閾値（`enableScreenshotTrigger` が有効な場合のみ）。コンパクションでカウントはリセットされます — 残存画像はトップレベルパーツとして再埋め込みされ、トリガーはカウントしません — そのため即座に再発動しません。環境変数: `QWEN_COMPACT_SCREENSHOT_THRESHOLD`。 | `50` |
| `model.skipNextSpeakerCheck` | boolean | 次の話者チェックをスキップします。 | `true` |
| `model.skipLoopDetection` | boolean | ストリーミングループ検出チェックを無効にします。誤検知による正当なワークフローの中断を避けるため、デフォルトは `true`（ループ検出をスキップ）です。`false` にするとストリーミングループ検出が再有効化されます — スタックした繰り返しがバジェットを無駄にしうるヘッドレス/非インタラクティブ実行でのガードレールとして有用です。 | `true` |
| `model.skipStartupContext` | boolean | 各セッション開始時の起動ワークスペースコンテキスト（環境サマリーと確認応答）の送信をスキップします。コンテキストを手動で提供したい場合や、起動時のトークンを節約したい場合に有効にしてください。 | `false` |
| `model.enableOpenAILogging` | boolean | デバッグと分析のための OpenAI API 呼び出しのロギングを有効にします。有効にすると、API リクエストとレスポンスが JSON ファイルに記録されます。 | `false` |
| `model.openAILoggingDir` | string | OpenAI API ログのカスタムディレクトリパス。指定しない場合、現在の作業ディレクトリの `logs/openai` がデフォルトになります。絶対パス、相対パス（現在の作業ディレクトリからの相対）、`~` 展開（ホームディレクトリ）をサポートします。 | `undefined` |

**model.generationConfig の例:**

```json
{
  "model": {
    "generationConfig": {
      "timeout": 60000,
      "contextWindowSize": 128000,
      "modalities": {
        "image": true
      },
      "enableCacheControl": true,
      "toolResultContentFormat": "parts",
      "customHeaders": {
        "X-Client-Request-ID": "req-123"
      },
      "extra_body": {
        "enable_thinking": true
      },
      "samplingParams": {
        "temperature": 0.2,
        "top_p": 0.8,
        "max_tokens": 1024
      }
    }
  }
}
```

**max_tokens（アダプティブ出力トークン）:**

`samplingParams.max_tokens` が設定されていない場合、Qwen Code は GPU リソースの使用を最適化するためにアダプティブ出力トークン戦略を使用します:

1. リクエストはデフォルトの **8K** 出力トークン制限から始まります
2. レスポンスが切り詰められた場合（モデルが制限に達した場合）、Qwen Code は自動的に **64K** トークンで再試行します
3. 部分的な出力は破棄され、再試行の完全なレスポンスに置き換えられます

これはユーザーには透過的です — エスカレーションが発生した場合、再試行インジケーターが一時的に表示されることがあります。レスポンスの 99% は 5K トークン未満であるため、再試行はほとんど発生しません（リクエストの 1% 未満）。

この動作を上書きするには、設定の `samplingParams.max_tokens` を設定するか、`QWEN_CODE_MAX_OUTPUT_TOKENS` 環境変数を使用してください。

**toolResultContentFormat:**

OpenAI 互換リクエストでテキストのみのツール結果をシリアライズする方法を制御します。デフォルトの `"parts"` は標準のコンテンツパーツ配列形式を維持します。`"string"` は、古い GLM-5.1 の vLLM/SGLang テンプレートなど、テキストコンテンツパーツを無視するレガシー OpenAI 互換ランタイム専用です。ツールから返されるメディアは引き続き `splitToolMedia` で制御されます。

**contextWindowSize:**

選択したモデルのデフォルトコンテキストウィンドウサイズを上書きします。Qwen Code はモデル名のマッチングに基づく組み込みデフォルトと定数フォールバック値を使用してコンテキストウィンドウを決定します。プロバイダーの実効コンテキスト制限が Qwen Code のデフォルトと異なる場合にこの設定を使用してください。この値はモデルが想定する最大コンテキスト容量を定義するものであり、リクエストごとのトークン制限ではありません。

選択したモデルが `modelProviders` で定義されている場合、トップレベルの `model.generationConfig` ではなく、そのプロバイダーエントリの `generationConfig` に `contextWindowSize` を設定してください。プロバイダーモデルエントリはシールされているため、トップレベルの生成設定はプロバイダーの不足フィールドを補完しません。

**modalities:**

選択したモデルの自動検出された入力モダリティを上書きします。Qwen Code はモデル名のパターンマッチングに基づいてサポートされるモダリティ（image、PDF、audio、video）を自動検出します。自動検出が誤っている場合 — 例えば、サポートしているのに認識されないモデルに対して `pdf` を有効にする場合 — にこの設定を使用してください。形式: `{ "image": true, "pdf": true, "audio": true, "video": true }`。サポートされていない種別はキーを省略するか `false` に設定します。

**customHeaders:**

すべての API リクエストにカスタム HTTP ヘッダーを追加できます。リクエストトレーシング、モニタリング、API ゲートウェイルーティング、または異なるモデルが異なるヘッダーを必要とする場合に有用です。プロバイダーモデルの場合は、`modelProviders[].generationConfig.customHeaders` に `customHeaders` を定義してください。マッチするプロバイダーエントリがないランタイムモデルの場合は、`model.generationConfig.customHeaders` に定義してください。2 つのレベル間でのマージは行われません。

`extra_body` フィールドを使用すると、API に送信されるリクエストボディにカスタムパラメーターを追加できます。標準の設定フィールドでカバーされていないプロバイダー固有のオプションに有用です。**注意: このフィールドは OpenAI 互換プロバイダー（`openai`、`qwen-oauth`）のみサポートされています。Anthropic および Gemini プロバイダーでは無視されます。** プロバイダーモデルの場合は `modelProviders[].generationConfig.extra_body` に、マッチするプロバイダーエントリがないランタイムモデルの場合は `model.generationConfig.extra_body` に定義してください。

**model.openAILoggingDir の例:**

- `"~/qwen-logs"` - `~/qwen-logs` ディレクトリにログを記録
- `"./custom-logs"` - 現在のディレクトリからの相対パス `./custom-logs` にログを記録
- `"/tmp/openai-logs"` - 絶対パス `/tmp/openai-logs` にログを記録

#### fastModel

| 設定 | 型 | 説明 | デフォルト |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `fastModel` | string | [プロンプトサジェスト](../features/followup-suggestions) と投機的実行に使用するモデル。空にするとメインモデルを使用します。小さく高速なモデル（例: `qwen3-coder-flash`）を使用するとレイテンシーとコストを削減できます。`/model --fast` でも設定できます。 | `""` |

#### context

| 設定 | 型 | 説明 | デフォルト |
| ----------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `context.fileName` | string または array of strings | コンテキストファイルの名前。 | `undefined` |
| `context.importFormat` | string | メモリをインポートする際のフォーマット。 | `undefined` |
| `context.includeDirectories` | array | ワークスペースコンテキストに追加するディレクトリ。ワークスペースコンテキストに含める追加の絶対パスまたは相対パスの配列を指定します。存在しないディレクトリはデフォルトで警告とともにスキップされます。パスには `~` を使用してユーザーのホームディレクトリを参照できます。この設定は `--include-directories` コマンドラインフラグと組み合わせて使用できます。 | `[]` |
| `context.loadFromIncludeDirectories` | boolean | `/memory refresh` コマンドの動作を制御します。`true` に設定すると、追加されたすべてのディレクトリから `QWEN.md` ファイルが読み込まれます。`false` に設定すると、`QWEN.md` は現在のディレクトリからのみ読み込まれます。 | `false` |
| `context.fileFiltering.respectGitIgnore` | boolean | 検索時に .gitignore ファイルを尊重します。 | `true` |
| `context.fileFiltering.respectQwenIgnore` | boolean | 検索時に .qwenignore および設定されたカスタム無視ファイルを尊重します。 | `true` |
| `context.fileFiltering.customIgnoreFiles` | array | `respectQwenIgnore` が有効な場合に、デフォルトの互換ファイル（`.agentignore`、`.aiignore`）の代わりに使用するプロジェクトルート相対の無視ファイル。`.qwenignore` は常に含まれます。 | `[".agentignore", ".aiignore"]` |
| `context.fileFiltering.enableRecursiveFileSearch` | boolean | プロンプトの `@` プレフィックス補完時に、現在のツリー配下のファイル名を再帰的に検索するかどうか。 | `true` |
| `context.fileFiltering.enableFuzzySearch` | boolean | `true` の場合、ファイル検索時にファジー検索機能を有効にします。ファイル数が多いプロジェクトではパフォーマンスを向上させるために `false` に設定してください。 | `true` |
| `context.clearContextOnIdle.toolResultsThresholdMinutes` | number | 古いツール結果のコンテンツをクリアするまでの非アクティブ時間（分）。アイドルトリガーを無効にするには `-1` を使用します。 | `60` |
| `context.clearContextOnIdle.toolResultsNumToKeep` | integer | クリア時に保持するコンパクト可能な最近のツール結果の数（整数）。1 未満の値は 1 に切り上げられます。 | `5` |
| `context.clearContextOnIdle.toolResultsTotalCharsThreshold` | number | 最古の結果をクリアする前に履歴で許可されるコンパクト可能なツール結果出力の合計文字数。サイズトリガーを無効にするには `-1` を使用します。これはソフト閾値です：保護された最近のツール結果によって合計がこの値を超える場合があります。 | `500000` |

#### ファイル検索パフォーマンスのトラブルシューティング

ファイル検索（例: `@` 補完）でパフォーマンスの問題が発生している場合、特にファイル数が非常に多いプロジェクトでは、以下を推奨順に試してみてください:

1. **無視ファイルを使用する:** プロジェクトルートに `.qwenignore` またはカスタム無視ファイルを作成して、参照する必要のない大量のファイルを含むディレクトリ（ビルド成果物、ログ、`node_modules` など）を除外します。クロールするファイル総数を減らすことが、パフォーマンス向上の最も効果的な方法です。
2. **ファジー検索を無効にする:** ファイルの無視だけでは不十分な場合は、`settings.json` で `enableFuzzySearch` を `false` に設定してファジー検索を無効にできます。これにより、よりシンプルで非ファジーなマッチングアルゴリズムが使用され、より高速になります。
3. **再帰ファイル検索を無効にする:** 最終手段として、`enableRecursiveFileSearch` を `false` に設定して再帰ファイル検索を完全に無効にできます。プロジェクトの再帰クロールを回避するため最も高速なオプションです。ただし、`@` 補完を使用する際にファイルのフルパスを入力する必要があります。

#### tools

| 設定 | 型 | 説明 | デフォルト | 備考 |
| ------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox` | boolean または string | サンドボックス実行環境（真偽値またはパス文字列）。 | `undefined` | |
| `tools.sandboxImage` | string | `--sandbox-image` と `QWEN_SANDBOX_IMAGE` が設定されていない場合に Docker/Podman が使用するサンドボックスイメージ URI。 | `undefined` | |
| `tools.shell.enableInteractiveShell` | boolean | インタラクティブなシェル体験のために `node-pty` を使用します。`child_process` へのフォールバックは引き続き適用されます。 | `true` | |
| `tools.core` | array of strings | **非推奨。** 次のバージョンで削除されます。代わりに `permissions.allow` + `permissions.deny` を使用してください。組み込みツールをアローリストに制限します。リストにないすべてのツールは無効になります。 | `undefined` | |
| `tools.exclude` | array of strings | **非推奨。** 代わりに `permissions.deny` を使用してください。検出から除外するツール名。初回読み込み時に `permissions` フォーマットに自動移行されます。 | `undefined` | |
| `tools.allowed` | array of strings | **非推奨。** 代わりに `permissions.allow` を使用してください。確認ダイアログをバイパスするツール名。初回読み込み時に `permissions` フォーマットに自動移行されます。 | `undefined` | |
| `tools.approvalMode` | string | ツール使用のデフォルト承認モードを設定します。 | `default` | 指定可能な値: `plan`（分析のみ、ファイルを変更したりコマンドを実行しない）、`default`（ファイル編集またはシェルコマンドの実行前に承認が必要）、`auto-edit`（ファイル編集を自動承認）、`auto`（LLM 分類器が安全なアクションを自動承認し、リスクのあるものをブロック）、`yolo`（すべてのツール呼び出しを自動承認） |
| `tools.discoveryCommand` | string | ツール検出のために実行するコマンド。 | `undefined` | |
| `tools.callCommand` | string | `tools.discoveryCommand` を使用して検出された特定のツールを呼び出すためのカスタムシェルコマンドを定義します。シェルコマンドは以下の条件を満たす必要があります: [関数宣言](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)と全く同じ関数 `name` を最初のコマンドライン引数として受け取る必要があります。[`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall) と同様に、`stdin` で JSON として関数引数を読み取る必要があります。[`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse) と同様に、`stdout` で JSON として関数出力を返す必要があります。 | `undefined` | |
| `tools.useRipgrep` | boolean | フォールバック実装の代わりにファイルコンテンツ検索に ripgrep を使用します。より高速な検索パフォーマンスを提供します。 | `true` | |
| `tools.useBuiltinRipgrep` | boolean | バンドルされた ripgrep バイナリを使用します。`false` に設定すると、システムレベルの `rg` コマンドが代わりに使用されます。この設定は `tools.useRipgrep` が `true` の場合にのみ有効です。 | `true` | |
| `tools.truncateToolOutputThreshold` | number | ツール出力がこの文字数より大きい場合に切り詰めます。Shell、Grep、Glob、ReadFile、ReadManyFiles ツールに適用されます。 | `25000` | 再起動が必要: はい |
| `tools.truncateToolOutputLines` | number | ツール出力を切り詰める際に保持する最大行数またはエントリ数。Shell、Grep、Glob、ReadFile、ReadManyFiles ツールに適用されます。 | `1000` | 再起動が必要: はい |
| `tools.computerUse.enabled` | boolean | 組み込みの Computer Use ツール（cua-driver ネイティブデスクトップ自動化）を有効にします。`true`（デフォルト）の場合、`computer_use__*` ツールが遅延組み込みとして登録されます；初回呼び出し時に固定済みの署名付き cua-driver バイナリを `~/.qwen/computer-use/` にダウンロードし、macOS のアクセシビリティ / 画面録画権限の設定をガイドします。 | `true` | 再起動が必要: はい |
| `tools.computerUse.maxImageDimension` | number | cua-driver のスクリーンショットに適用される最長辺ピクセルキャップ（`set_config` の `max_image_dimension` 経由）。`-1`（デフォルト）は cua-driver の組み込みデフォルト（1568）を維持します；`0` でリサイズを無効化（フル解像度）；正の値で最長辺をキャップします。キャップを下げるとビジョントークンコストが削減される代わりに細部が失われます。 | `-1` | 再起動が必要: はい。環境変数: `QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`（非負整数；この設定より優先） |

> [!note]
>
> **`tools.core` / `tools.exclude` / `tools.allowed` からの移行:** これらのレガシー設定は**非推奨**であり、初回読み込み時に新しい `permissions` フォーマットに自動移行されます。直接 `permissions.allow` / `permissions.deny` を設定することを推奨します。`/permissions` を使用してルールをインタラクティブに管理できます。

#### memory

| 設定 | 型 | 説明 | デフォルト |
| -------------------------------- | ------- | -------------------------------------------------------------- | ------- |
| `memory.enableManagedAutoMemory` | boolean | 会話からメモリをバックグラウンドで抽出することを有効にします。 | `true` |
| `memory.enableManagedAutoDream` | boolean | 収集されたメモリの自動統合（重複排除とクリーンアップ）を有効にします。 | `true` |
| `memory.enableAutoSkill` | boolean | ツールを多用するセッションの後に再利用可能なプロジェクトスキルをバックグラウンドでレビューすることを有効にします。 | `true` |
| `memory.autoSkillConfirm` | boolean | 自動生成されたスキルがスキルライブラリに追加される前に確認を求めます。オフにすると、自動スキルはすぐに保存されます。 | `true` |

自動メモリの仕組みと `/memory`、`/remember`、`/dream` コマンドの使用方法については、[メモリ](../features/memory) を参照してください。

#### permissions

パーミッションシステムは、どのツールが実行できるか、どのツールが確認を必要とするか、どのツールがブロックされるかを細かく制御します。

**決定の優先順位（高い順）: `deny` > `ask` > `allow` > _(デフォルト/インタラクティブモード)_**

最初にマッチしたルールが適用されます。ルールは `"ToolName"` または `"ToolName(specifier)"` の形式を使用します。

| 設定 | 型 | 説明 | デフォルト |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | 自動承認されるツール呼び出しのルール（確認不要）。すべてのスコープ（ユーザー + プロジェクト + システム）でマージされます。 | `undefined` |
| `permissions.ask` | array of strings | 常にユーザーの確認が必要なツール呼び出しのルール。`allow` より優先されます。 | `undefined` |
| `permissions.deny` | array of strings | ブロックされるツール呼び出しのルール。最高優先度 — `allow` と `ask` の両方を上書きします。 | `undefined` |

**ツール名エイリアス（いずれもルールで使用できます）:**

| エイリアス | 正規ツール名 | 備考 |
| --------------------- | ------------------- | ------------------------- |
| `Bash`、`Shell` | `run_shell_command` | |
| `Read`、`ReadFile` | `read_file` | メタカテゴリ — 下記参照 |
| `Edit`、`EditFile` | `edit` | メタカテゴリ — 下記参照 |
| `Write`、`WriteFile` | `write_file` | |
| `NotebookEdit` | `notebook_edit` | |
| `NotebookEditTool` | `notebook_edit` | |
| `Grep`、`SearchFiles` | `grep_search` | |
| `Glob`、`FindFiles` | `glob` | |
| `ListFiles` | `list_directory` | |
| `WebFetch` | `web_fetch` | |
| `Agent` | `task` | |
| `Skill` | `skill` | |

**メタカテゴリ:**

一部のルール名は複数のツールを自動的にカバーします:

| ルール名 | カバーするツール |
| --------- | ---------------------------------------------------- |
| `Read` | `read_file`、`grep_search`、`glob`、`list_directory` |
| `Edit` | `edit`、`write_file`、`notebook_edit` |

> [!important]
> `Read(/path/**)` は**4 つすべて**の読み取りツール（ファイル読み取り、grep、glob、ディレクトリリスト）にマッチします。
> ファイル読み取りのみを制限するには、`ReadFile(/path/**)` または `read_file(/path/**)` を使用してください。

**ルール構文の例:**

| ルール | 意味 |
| ----------------------------- | -------------------------------------------------------------- |
| `"Bash"` | すべてのシェルコマンド |
| `"Bash(git *)"` | `git` で始まるシェルコマンド（単語境界：`gitk` は NOT） |
| `"Bash(git push *)"` | `git push origin main` のようなシェルコマンド |
| `"Bash(npm run *)"` | 任意の `npm run` スクリプト |
| `"Read"` | すべてのファイル読み取り操作（read、grep、glob、list） |
| `"Read(./secrets/**)"` | `./secrets/` 配下のすべてのファイルを再帰的に読み取る |
| `"Edit(/src/**/*.ts)"` | プロジェクトルート `/src/` 配下の TypeScript ファイルを編集 |
| `"WebFetch(api.example.com)"` | `api.example.com` とそのすべてのサブドメインからフェッチ |
| `"mcp__puppeteer"` | puppeteer MCP サーバーのすべてのツール |

**パスパターンのプレフィックス:**

| プレフィックス | 意味 | 例 |
| ------ | ------------------------------------- | ------------------- |
| `//` | ファイルシステムルートからの絶対パス | `//etc/passwd` |
| `~/` | ホームディレクトリからの相対パス | `~/Documents/*.pdf` |
| `/` | プロジェクトルートからの相対パス | `/src/**/*.ts` |
| `./` | 現在の作業ディレクトリからの相対パス | `./secrets/**` |
| （なし） | `./` と同じ | `secrets/**` |

**シェルコマンドによるバイパス防止:**

`Read`、`Edit`、`WebFetch` のパーミッションルールは、エージェントが同等のシェルコマンドを実行する場合にも適用されます。例えば、`Read(./.env)` が `deny` にある場合、エージェントはシェルコマンドで `cat .env` を実行してバイパスすることはできません。サポートされているシェルコマンドには `cat`、`grep`、`curl`、`wget`、`cp`、`mv`、`rm`、`chmod` などがあります。不明/安全なコマンド（例: `git`）はファイル/ネットワークルールの影響を受けません。

**レガシー設定からの移行:**

| レガシー設定 | 同等の `permissions` ルール | 備考 |
| --------------- | ------------------------------- | ------------------------------------------------------------ |
| `tools.allowed` | `permissions.allow` | 初回読み込み時に自動移行 |
| `tools.exclude` | `permissions.deny` | 初回読み込み時に自動移行 |
| `tools.core` | `permissions.allow`（アローリスト） | 自動移行；リストにないツールはレジストリレベルで無効化 |

**設定例:**

```json
{
  "permissions": {
    "allow": ["Bash(git *)", "Bash(npm run *)", "Read(//Users/alice/code/**)"],
    "ask": ["Bash(git push *)", "Edit"],
    "deny": ["Bash(rm -rf *)", "Read(.env)", "WebFetch(malicious.com)"]
  }
}
```

> [!tip]
> インタラクティブ CLI で `/permissions` を使用すると、`settings.json` を直接編集せずにルールを表示、追加、削除できます。

#### slashCommands

CLI で使用できるスラッシュコマンドを制御します。マルチテナントまたはエンタープライズ展開でコマンドの対象を制限するのに便利です。

| 設定 | 型 | 説明 | デフォルト |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `slashCommands.disabled` | array of strings | 非表示にして実行を拒否するスラッシュコマンド名。最終コマンド名（拡張コマンドの場合は `myext.deploy` のような明示的な形式）に対して大文字小文字を区別せずにマッチします。**スコープ間で和集合としてマージされます**。そのため、ワークスペース設定はユーザー設定またはシステム設定で定義されたエントリを追加できますが、削除することはできません。 | `undefined` |

同じ拒否リストは `--disabled-slash-commands` CLI フラグ（カンマ区切りまたは繰り返し）および `QWEN_DISABLED_SLASH_COMMANDS` 環境変数でも指定できます；3 つのソースからの値は和集合として結合されます。

**例 — サンドボックス展開の組み込みコマンドを制限する:**

```json
{
  "slashCommands": {
    "disabled": ["auth", "mcp", "extensions", "ide", "quit"]
  }
}
```

これらの値をシステムレベルの `settings.json`（`/etc/qwen-code/settings.json` または `QWEN_CODE_SYSTEM_SETTINGS_PATH`）に設定すると、ユーザーは自分のスコープから拒否リストを縮小することができず、無効化されたコマンドはオートコンプリートに表示されず、入力しても実行されません。

> [!note]
> この設定はスラッシュコマンド（例: `/auth`、`/mcp`）のみを制限します。ツールのパーミッションには影響しません — そちらは `permissions.deny` を参照してください。`Ctrl+C` や `Esc` などのキーボードショートカットも制限されません。

#### mcp

| 設定 | 型 | 説明 | デフォルト |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string | MCP サーバーを起動するためのコマンド。 | `undefined` |
| `mcp.allowed` | array of strings | 許可する MCP サーバーのアローリスト。モデルに提供する MCP サーバー名のリストを指定できます。接続する MCP サーバーのセットを制限するために使用できます。`--allowed-mcp-server-names` が設定されている場合は無視されます。 | `undefined` |
| `mcp.excluded` | array of strings | 除外する MCP サーバーの拒否リスト。`mcp.excluded` と `mcp.allowed` の両方にリストされているサーバーは除外されます。`--allowed-mcp-server-names` が設定されている場合は無視されます。 | `undefined` |

> [!note]
>
> **MCP サーバーのセキュリティに関する注意:** これらの設定は変更可能な MCP サーバー名に対して単純な文字列マッチングを使用します。システム管理者がユーザーによるバイパスを防止したい場合は、システム設定レベルで `mcpServers` を設定して、ユーザーが独自の MCP サーバーを設定できないようにすることを検討してください。これは完全なセキュリティメカニズムとして使用すべきではありません。

#### lsp

> [!warning]
> **実験的機能**: LSP サポートは現在実験的であり、デフォルトでは無効になっています。`--experimental-lsp` コマンドラインフラグを使用して有効にしてください。

Language Server Protocol（LSP）は、定義への移動、参照の検索、診断などのコードインテリジェンス機能を提供します。

LSP サーバーの設定は `settings.json` ではなく、プロジェクトルートディレクトリ内の `.lsp.json` ファイルで行います。設定の詳細と例については、[LSP ドキュメント](../features/lsp) を参照してください。

#### security

| 設定 | 型 | 説明 | デフォルト |
| ------------------------------ | ------- | ------------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | フォルダーの信頼が有効かどうかを追跡する設定。 | `false` |
| `security.auth.selectedType` | string | 現在選択されている認証タイプ。 | `undefined` |
| `security.auth.enforcedType` | string | 必須の認証タイプ（エンタープライズ向け）。 | `undefined` |
| `security.auth.useExternal` | boolean | 外部認証フローを使用するかどうか。 | `undefined` |

#### advanced

| 設定 | 型 | 説明 | デフォルト |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean | Node.js のメモリ制限を自動的に設定します。 | `false` |
| `advanced.dnsResolutionOrder` | string | DNS 解決の順序。 | `undefined` |
| `advanced.excludedEnvVars` | array of strings | プロジェクトコンテキストから除外する環境変数。プロジェクトの `.env` ファイルから読み込まれないようにする環境変数を指定します。これにより、プロジェクト固有の環境変数（`DEBUG=true` など）が CLI の動作を妨げることを防ぎます。`.qwen/.env` ファイルの変数は除外されません。 | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand` | object | バグレポートコマンドの設定。`/bug` コマンドのデフォルト URL を上書きします。プロパティ: `urlTemplate`（string）: `{title}` と `{info}` プレースホルダーを含めることができる URL。例: `"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }` | `undefined` |
| `plansDirectory` | string | 承認済みのプランモードファイルのカスタムディレクトリ。相対パスはプロジェクトルートから解決され、解決されたパスはプロジェクトルート内に留まる必要があります。未設定の場合、プランファイルは `~/.qwen/plans` に保存されます。**再起動が必要。** ディレクトリがプロジェクトルート内にある場合は、プランファイルがコミットされないように `.gitignore` に追加してください。 | `undefined` |

#### experimental

> [!warning]
>
> **実験的機能。** これらのトグルは開発中の機能をゲートし、将来のリリースで変更または削除される場合があります。

| 設定 | 型 | 説明 | デフォルト |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `experimental.cron` | boolean | セッション内の cron/ループツール（`cron_create`、`cron_list`、`cron_delete`）を有効にし、モデルが定期的なプロンプトを作成できるようにします。`QWEN_CODE_DISABLE_CRON=1` 環境変数で無効にできます。再起動が必要。 | `true` |
| `experimental.agentTeam` | boolean | マルチエージェント調整のためのエージェントチームコラボレーションツール（`team_create`、`task_create`、`task_update`、`send_message` など）を有効にします。`QWEN_CODE_ENABLE_AGENT_TEAM=1` でも有効にできます。再起動が必要。 | `false` |
| `experimental.artifact` | boolean | Artifact ツールを有効にし、モデルが自己完結型の HTML ページを公開してブラウザで開けるようにします。インタラクティブな非 SDK セッションのみ。`QWEN_CODE_ENABLE_ARTIFACT=1` / `QWEN_CODE_DISABLE_ARTIFACT=1` で切り替え。再起動が必要。 | `false` |
| `experimental.emitToolUseSummaries` | boolean | 各ツール呼び出しバッチの完了後に LLM ベースの短いラベルを生成します。[ツール使用サマリー](../features/tool-use-summaries) を参照。高速モデルの設定（`fastModel`）が必要；それ以外の場合は黙ってスキップされます。`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` または `=1` でセッションごとに上書き可能。 | `true` |

#### mcpServers

カスタムツールの検出と使用のために 1 つ以上の Model-Context Protocol（MCP）サーバーへの接続を設定します。Qwen Code は設定された各 MCP サーバーに接続して利用可能なツールを検出しようとします。複数の MCP サーバーが同じ名前のツールを公開している場合、競合を避けるためにツール名は設定で定義したサーバーエイリアスでプレフィックスされます（例: `serverAlias__actualToolName`）。システムが互換性のために MCP ツール定義から特定のスキーマプロパティを削除する場合があります。`command`、`url`、`httpUrl` のうち少なくとも 1 つを指定する必要があります。複数指定した場合の優先順位は `httpUrl`、次に `url`、次に `command` の順です。

| プロパティ | 型 | 説明 | 省略可能 |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command` | string | 標準 I/O 経由で MCP サーバーを起動するために実行するコマンド。 | はい |
| `mcpServers.<SERVER_NAME>.args` | array of strings | コマンドに渡す引数。 | はい |
| `mcpServers.<SERVER_NAME>.env` | object | サーバープロセスに設定する環境変数。 | はい |
| `mcpServers.<SERVER_NAME>.cwd` | string | サーバーを起動する作業ディレクトリ。 | はい |
| `mcpServers.<SERVER_NAME>.url` | string | Server-Sent Events（SSE）を通信に使用する MCP サーバーの URL。 | はい |
| `mcpServers.<SERVER_NAME>.httpUrl` | string | ストリーミング HTTP を通信に使用する MCP サーバーの URL。 | はい |
| `mcpServers.<SERVER_NAME>.headers` | object | `url` または `httpUrl` へのリクエストと共に送信する HTTP ヘッダーのマップ。 | はい |
| `mcpServers.<SERVER_NAME>.timeout` | number | この MCP サーバーへのリクエストのタイムアウト（ミリ秒）。 | はい |
| `mcpServers.<SERVER_NAME>.trust` | boolean | このサーバーを信頼し、すべてのツール呼び出し確認をバイパスします。 | はい |
| `mcpServers.<SERVER_NAME>.description` | string | サーバーの簡単な説明（表示目的で使用される場合があります）。 | はい |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | この MCP サーバーから含めるツール名のリスト。指定した場合、ここにリストされたツールのみがこのサーバーから利用可能になります（アローリスト動作）。指定しない場合、サーバーのすべてのツールがデフォルトで有効になります。 | はい |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーが公開している場合でもモデルから利用できません。**注意:** `excludeTools` は `includeTools` より優先されます — ツールが両方のリストにある場合、除外されます。 | はい |

#### telemetry

Qwen Code のロギングとメトリクス収集を設定します。詳細については、[テレメトリ](../../developers/development/telemetry.md) を参照してください。

| 設定 | 型 | 説明 | デフォルト |
| ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `telemetry.enabled` | boolean | テレメトリを有効にするかどうか。 | |
| `telemetry.target` | string | テレメトリの送信先の情報ラベル（`local` または `gcp`）。エクスポーターのルーティングを制御しません；データの送信先を設定するには `telemetry.otlpEndpoint` または `telemetry.outfile` を使用してください。 | |
| `telemetry.otlpEndpoint` | string | OTLP エクスポーターのエンドポイント。 | |
| `telemetry.otlpProtocol` | string | OTLP エクスポーターのプロトコル（`grpc` または `http`）。 | |
| `telemetry.logPrompts` | boolean | ユーザープロンプトの内容をログに含めるかどうか。 | |
| `telemetry.includeSensitiveSpanAttributes` | boolean | 有効にすると、ネイティブ OTel スパン属性に逐語的なユーザープロンプト、システムプロンプト、ツールの入出力、モデルレスポンスを添付します（ログからスパンへのブリッジスパンに加えて）。⚠️ ファイルの内容、シェルコマンド、会話履歴などの機密データが OTLP バックエンドにストリーミングされます。 | `false` |
| `telemetry.outfile` | string | テレメトリをファイルに書き込むパス。設定すると、OTLP エクスポートを上書きします。 | |

### `settings.json` の例

v0.3.0 以降の新しいネスト構造を持つ `settings.json` ファイルの例を以下に示します:

```
{
  "proxy": "http://localhost:7890",
  "plansDirectory": "./.qwen/plans",
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideTips": false,
    "customWittyPhrases": [
      "You forget a thousand things every day. Make sure this is one of 'em",
      "Connecting to AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1",
    "discoveryCommand": "bin/get_tools",
    "callCommand": "bin/call_tool",
    "exclude": ["write_file"]
  },
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true,
    "includeSensitiveSpanAttributes": false
  },
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "qwen3-coder-plus",
    "maxSessionTurns": 10,
    "enableOpenAILogging": false,
    "openAILoggingDir": "~/qwen-logs",
  },
  "context": {
    "fileName": ["CONTEXT.md", "QWEN.md"],
    "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
    "loadFromIncludeDirectories": true,
    "fileFiltering": {
      "respectGitIgnore": false
    }
  },
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```

## シェル履歴

CLI は実行したシェルコマンドの履歴を保持します。プロジェクト間の競合を避けるため、この履歴はユーザーのホームフォルダー内のプロジェクト固有のディレクトリに保存されます。

- **場所:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` はプロジェクトのルートパスから生成された一意の識別子です。
  - 履歴は `shell_history` という名前のファイルに保存されます。

## 環境変数と `.env` ファイル

環境変数はアプリケーションを設定する一般的な方法であり、特に機密情報（トークンなど）や環境によって変わる可能性のある設定に使用されます。

Qwen Code は `.env` ファイルから環境変数を自動的に読み込むことができます。
認証関連の変数（`OPENAI_*` など）と推奨される `.qwen/.env` アプローチについては、**[認証](../configuration/auth)** を参照してください。

> [!tip]
>
> **環境変数の除外:** 一部の環境変数（`DEBUG` や `DEBUG_MODE` など）は、CLI の動作への干渉を防ぐため、デフォルトでプロジェクトの `.env` ファイルから自動的に除外されます。`.qwen/.env` ファイルの変数は除外されません。`settings.json` の `advanced.excludedEnvVars` 設定を使用してこの動作をカスタマイズできます。

### 環境変数一覧

| 変数 | 説明 | 備考 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_HOME` | グローバル設定ディレクトリをカスタマイズします（デフォルト: `~/.qwen`）。絶対パスまたは相対パスを受け付けます（相対パスは現在の作業ディレクトリから解決）。先頭の `~` はユーザーのホームディレクトリに展開されます。 | 認証情報、設定、メモリ、スキル、その他のグローバル状態を保存します。設定した場合、プロジェクトレベルの `.qwen/` ディレクトリには影響しません。空文字列は未設定として扱われます。 |
| `QWEN_RUNTIME_DIR` | ランタイム出力ディレクトリ（会話、ログ、TODO）を上書きします。未設定の場合、`QWEN_HOME` ディレクトリがデフォルトになります。 | 一時的なランタイムデータと永続的な設定を分離するために使用します。`QWEN_HOME` が共有/低速なファイルシステム上にある場合に便利です。 |
| `QWEN_TELEMETRY_ENABLED` | テレメトリを有効にするには `true` または `1` に設定します。それ以外の値は無効として扱われます。 | `telemetry.enabled` 設定を上書きします。 |
| `QWEN_TELEMETRY_TARGET` | テレメトリの送信先の情報ラベルを設定します（`local` または `gcp`）。ルーティングを制御しません；データの送信先を設定するには `QWEN_TELEMETRY_OTLP_ENDPOINT` または `QWEN_TELEMETRY_OUTFILE` を使用してください。 | `telemetry.target` 設定を上書きします。 |
| `QWEN_TELEMETRY_OTLP_ENDPOINT` | テレメトリの OTLP エンドポイントを設定します。 | `telemetry.otlpEndpoint` 設定を上書きします。 |
| `QWEN_TELEMETRY_OTLP_PROTOCOL` | OTLP プロトコルを設定します（`grpc` または `http`）。 | `telemetry.otlpProtocol` 設定を上書きします。 |
| `QWEN_TELEMETRY_LOG_PROMPTS` | ユーザープロンプトのロギングを有効または無効にするには `true` または `1` に設定します。それ以外の値は無効として扱われます。 | `telemetry.logPrompts` 設定を上書きします。 |
| `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES` | ネイティブ OTel スパン属性に逐語的なユーザープロンプト、システムプロンプト、ツールの I/O、モデルレスポンスを添付するには `true` または `1` に設定します（ログからスパンへのブリッジスパンの `prompt` / `function_args` / `response_text` も保持）。それ以外の値は無効にします。 | `telemetry.includeSensitiveSpanAttributes` 設定を上書きします。⚠️ OTLP バックエンドに機密データをストリーミングします。 |
| `QWEN_TELEMETRY_OUTFILE` | テレメトリを書き込むファイルパスを設定します。設定すると、OTLP エクスポートを上書きします。 | `telemetry.outfile` 設定を上書きします。 |
| `QWEN_SANDBOX` | `settings.json` の `sandbox` 設定の代替。 | `true`、`false`、`docker`、`podman`、またはカスタムコマンド文字列を受け付けます。 |
| `QWEN_SANDBOX_IMAGE` | Docker/Podman のサンドボックスイメージ選択を上書きします。 | `tools.sandboxImage` より優先されます。 |
| `SEATBELT_PROFILE` | （macOS 固有）macOS の Seatbelt（`sandbox-exec`）プロファイルを切り替えます。 | `permissive-open`: （デフォルト）プロジェクトフォルダー（およびいくつかの他のフォルダー、`packages/cli/src/utils/sandbox-macos-permissive-open.sb` を参照）への書き込みを制限しますが、その他の操作は許可します。`strict`: デフォルトで操作を拒否する厳格なプロファイルを使用します。`<profile_name>`: カスタムプロファイルを使用します。カスタムプロファイルを定義するには、プロジェクトの `.qwen/` ディレクトリに `sandbox-macos-<profile_name>.sb` という名前のファイルを作成します（例: `my-project/.qwen/sandbox-macos-custom.sb`）。 |
| `DEBUG` または `DEBUG_MODE` | （基盤となるライブラリまたは CLI 自体でよく使用される）詳細なデバッグロギングを有効にするには `true` または `1` に設定します。トラブルシューティングに役立ちます。 | **注意:** これらの変数は、CLI の動作への干渉を防ぐため、デフォルトでプロジェクトの `.env` ファイルから自動的に除外されます。Qwen Code 専用に設定する必要がある場合は `.qwen/.env` ファイルを使用してください。 |
| `NO_COLOR` | 任意の値に設定すると、CLI のすべてのカラー出力が無効になります。 | |
| `FORCE_HYPERLINK` | Markdown レンダラーの OSC 8 クリッカブルリンク検出を上書きします。強制有効にするには `1`（または任意の非ゼロ整数、または空文字列）を設定；強制無効にするには `0` または `false` / `off` などの数値以外の値を設定します。上位の `NO_COLOR` / `QWEN_DISABLE_HYPERLINKS` のオプトアウトを尊重します。 | `tmux` / GNU `screen` 内で OSC 8 をオプトインする場合に使用します（マルチプレクサーの背後にホスト端末の機能が隠れているため、自動検出はデフォルトで拒否します）。tmux 3.3 以降では `set -g allow-passthrough on` が必要です。自動検出されない Hyper も有効になります。 |
| `QWEN_DISABLE_HYPERLINKS` | `1` に設定すると、自動検出で対応と判断された端末でも Markdown レンダラーの OSC 8 クリッカブルハイパーリンクをハード無効化します。 | 端末がサポートをアドバタイズしても長い URL で壊れる場合や、エスケープシーケンスを変形する中間プロセスを通じて出力をパイプする場合に有用です。レンダラーはプレーンな `label (url)` レンダリングにフォールバックします。 |
| `CLI_TITLE` | 文字列に設定すると、CLI のタイトルをカスタマイズします。 | |
| `CODE_ASSIST_ENDPOINT` | コードアシストサーバーのエンドポイントを指定します。 | 開発とテストに便利です。 |
| `QWEN_CODE_MAX_OUTPUT_TOKENS` | レスポンスごとのデフォルト最大出力トークン数を上書きします。未設定の場合、Qwen Code はアダプティブ戦略を使用します：8K トークンから始まり、レスポンスが切り詰められた場合は自動的に 64K で再試行します。特定の値（例: `16000`）を設定すると固定制限を使用します。 | キャップされたデフォルト（8K）より優先されますが、設定の `samplingParams.max_tokens` で上書きされます。設定すると自動エスカレーションが無効になります。例: `export QWEN_CODE_MAX_OUTPUT_TOKENS=16000` |
| `QWEN_CODE_UNATTENDED_RETRY` | 永続的な再試行モードを有効にするには `true` または `1` に設定します。有効にすると、一時的な API 容量エラー（HTTP 429 レート制限および 529 過負荷）は指数バックオフ（再試行ごとに最大 5 分）で無期限に再試行され、stderr に 30 秒ごとのハートビートキープアライブが出力されます。 | CI/CD パイプラインと一時的な API 障害を乗り越えるべき長時間実行タスクのバックグラウンド自動化向けです。明示的に設定する必要があります — `CI=true` 単独ではこのモードは有効になりません。詳細は [ヘッドレスモード](../features/headless#persistent-retry-mode) を参照。例: `export QWEN_CODE_UNATTENDED_RETRY=1` |
| `QWEN_CODE_PROFILE_STARTUP` | `1` に設定すると起動パフォーマンスプロファイリングを有効にします。フェーズごとの所要時間を含む JSON タイミングレポートを `~/.qwen/startup-perf/` に書き込みます。 | サンドボックスの子プロセス内（または `QWEN_CODE_PROFILE_STARTUP_OUTER=1` と共に）でのみ有効です。未設定時はゼロオーバーヘッド。例: `export QWEN_CODE_PROFILE_STARTUP=1` |
| `QWEN_CODE_PROFILE_STARTUP_OUTER` | `QWEN_CODE_PROFILE_STARTUP=1` と共に `1` に設定すると、外部（プレサンドボックス）プロセスでも起動プロファイルを収集します。外部プロセスのレポートは、サンドボックス子のレポートと区別するために `outer-` ファイル名プレフィックスが付きます。 | デフォルトはオフ — 重複レポートを避けるためサンドボックスの子のみが収集します。CLI がサンドボックスに再起動されないローカル開発で便利です。 |
| `QWEN_CODE_PROFILE_STARTUP_NO_HEAP` | `QWEN_CODE_PROFILE_STARTUP=1` と共に `1` に設定すると、チェックポイントごとの `process.memoryUsage()` スナップショットをスキップします。プロファイラー自体のハイゼンベルグオーバーヘッドを測定する場合に有用です。 | デフォルトはオフ。ヒープスナップショットはそれぞれ約 50 µs のコストです（起動合計の 1% 未満）のでほとんどのユーザーはそのままにしてください。 |
| `QWEN_CODE_LEGACY_MCP_BLOCKING` | `1` に設定すると、`Config.initialize()` が返る前にすべての設定済み MCP サーバーの検出ハンドシェイクを同期的に待機するプログレッシブ MCP 以前の動作に戻します。 | デフォルトはオフ。最新の qwen-code では UI がすでにインタラクティブな状態で MCP サーバーがバックグラウンドでオンラインになります；モデルはサーバーが安定してから約 16 ms 以内に各バッチの新しいツールを認識します。このフラグは 1 リリース以上のロールバック非常口として残されています。例: `export QWEN_CODE_LEGACY_MCP_BLOCKING=1` |

ユーザーレベルの `.env` ファイルが同じ変数を定義している場合、Qwen 固有のファイルが優先されます: `<QWEN_HOME>/.env`（`QWEN_HOME` が未設定の場合は `~/.qwen/.env`）は `~/.env` より前に読み込まれ、既存の環境値は上書きされません。

## コマンドライン引数

CLI 実行時に直接渡される引数は、その特定のセッションの他の設定を上書きできます。

サンドボックスイメージ選択の優先順位は以下のとおりです:
`--sandbox-image` > `QWEN_SANDBOX_IMAGE` > `tools.sandboxImage` > 組み込みデフォルトイメージ

### コマンドライン引数一覧

| 引数 | エイリアス | 説明 | 指定可能な値 | 備考 |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model` | `-m` | このセッションで使用する Qwen モデルを指定します。 | モデル名 | 例: `npm start -- --model qwen3-coder-plus` |
| `--prompt` | `-p` | プロンプトを直接コマンドに渡します。Qwen Code を非インタラクティブモードで起動します。 | プロンプトテキスト | スクリプト例には、構造化された出力を得るために `--output-format json` フラグを使用してください。 |
| `--prompt-interactive` | `-i` | 提供されたプロンプトを初期入力としてインタラクティブセッションを開始します。 | プロンプトテキスト | プロンプトはインタラクティブセッション内で処理されます（セッション前ではありません）。stdin からの入力パイプと同時には使用できません。例: `qwen -i "explain this code"` |
| `--system-prompt` | | この実行のメインセッションシステムプロンプトを組み込みのものに替わって上書きします。 | プロンプトテキスト | `QWEN.md` などの読み込まれたコンテキストファイルはこの上書きの後に追加されます。`--append-system-prompt` と組み合わせて使用できます。 |
| `--append-system-prompt` | | この実行のメインセッションシステムプロンプトに追加の指示を追加します。 | プロンプトテキスト | 組み込みプロンプトと読み込まれたコンテキストファイルの後に適用されます。`--system-prompt` と組み合わせて使用できます。例は [ヘッドレスモード](../features/headless) を参照。 |
| `--output-format` | `-o` | 非インタラクティブモードの CLI 出力フォーマットを指定します。 | `text`、`json`、`stream-json` | `text`: （デフォルト）標準の人間が読める出力。`json`: 実行終了時に出力されるマシン可読 JSON。`stream-json`: 実行中に発生するときにストリーミングされる JSON メッセージ。構造化出力とスクリプティングには `--output-format json` または `--output-format stream-json` フラグを使用してください。詳細は [ヘッドレスモード](../features/headless) を参照。 |
| `--input-format` | | 標準入力から消費するフォーマットを指定します。 | `text`、`stream-json` | `text`: （デフォルト）stdin またはコマンドライン引数からの標準テキスト入力。`stream-json`: 双方向通信のための stdin 経由の JSON メッセージプロトコル。要件: `--input-format stream-json` には `--output-format stream-json` の設定が必要です。`stream-json` 使用時、stdin はプロトコルメッセージ用に予約されます。詳細は [ヘッドレスモード](../features/headless) を参照。 |
| `--include-partial-messages` | | `stream-json` 出力フォーマット使用時に部分的なアシスタントメッセージを含めます。有効にすると、ストリーミング中に発生するストリームイベント（message_start、content_block_delta など）を出力します。 | | デフォルト: `false`。要件: `--output-format stream-json` の設定が必要です。ストリームイベントの詳細は [ヘッドレスモード](../features/headless) を参照。 |
| `--sandbox` | `-s` | このセッションのサンドボックスモードを有効にします。 | | |
| `--sandbox-image` | | サンドボックスイメージ URI を設定します。 | | |
| `--debug` | `-d` | このセッションのデバッグモードを有効にし、より詳細な出力を提供します。 | | |
| `--all-files` | `-a` | 設定すると、現在のディレクトリ内のすべてのファイルをプロンプトのコンテキストとして再帰的に含めます。 | | |
| `--help` | `-h` | コマンドライン引数に関するヘルプ情報を表示します。 | | |
| `--show-memory-usage` | | 現在のメモリ使用量を表示します。 | | |
| `--yolo` | | YOLO モードを有効にし、すべてのツール呼び出しを自動承認します。 | | |
| `--approval-mode` | | ツール呼び出しの承認モードを設定します。 | `plan`、`default`、`auto-edit`、`auto`、`yolo` | サポートされるモード: `plan`: 分析のみ — ファイルを変更したりコマンドを実行しない。`default`: ファイル編集またはシェルコマンドに承認が必要（デフォルト動作）。`auto-edit`: 編集ツール（`edit`、`write_file`、`notebook_edit`）を自動承認し、その他はプロンプト表示。`auto`: LLM 分類器が安全なアクションを自動承認し、リスクのあるものをブロック。`yolo`: すべてのツール呼び出しを自動承認（`--yolo` と同等）。`--yolo` と同時には使用できません。新しい統一アプローチでは `--yolo` の代わりに `--approval-mode=yolo` を使用してください。例: `qwen --approval-mode auto-edit`<br>[承認モード](../features/approval-mode) の詳細を参照。 |
| `--allowed-tools` | | 確認ダイアログをバイパスするツール名のカンマ区切りリスト。 | ツール名 | 例: `qwen --allowed-tools "Shell(git status)"` |
| `--disabled-slash-commands` | | 非表示/無効にするスラッシュコマンド名（カンマ区切りまたは繰り返し）。`slashCommands.disabled` 設定と `QWEN_DISABLED_SLASH_COMMANDS` 環境変数と和集合されます。最終コマンド名に対して大文字小文字を区別せずにマッチします。 | コマンド名 | 例: `qwen --disabled-slash-commands "auth,mcp,extensions"` |
| `--telemetry` | | [テレメトリ](../../developers/development/telemetry.md) を有効にします。 | | |
| `--telemetry-target` | | テレメトリターゲットを設定します。 | | 詳細は [テレメトリ](../../developers/development/telemetry.md) を参照。 |
| `--telemetry-otlp-endpoint` | | テレメトリの OTLP エンドポイントを設定します。 | | 詳細は [テレメトリ](../../developers/development/telemetry.md) を参照。 |
| `--telemetry-otlp-protocol` | | テレメトリの OTLP プロトコルを設定します（`grpc` または `http`）。 | | デフォルトは `grpc`。詳細は [テレメトリ](../../developers/development/telemetry.md) を参照。 |
| `--telemetry-log-prompts` | | テレメトリのプロンプトロギングを有効にします。 | | 詳細は [テレメトリ](../../developers/development/telemetry.md) を参照。 |
| `--acp` | | ACP モード（Agent Client Protocol）を有効にします。[Zed](../integration-zed) などの IDE/エディタ統合に便利です。 | | 安定版。非推奨の `--experimental-acp` フラグの代替。 |
| `--experimental-lsp` | | コードインテリジェンス（定義への移動、参照の検索、診断など）のための実験的な [LSP（Language Server Protocol）](../features/lsp) 機能を有効にします。 | | 実験的。言語サーバーのインストールが必要です。 |
| `--extensions` | `-e` | セッションで使用する拡張機能のリストを指定します。 | 拡張機能名 | 指定しない場合、利用可能なすべての拡張機能が使用されます。すべての拡張機能を無効にするには `qwen -e none` という特別な用語を使用します。例: `qwen -e my-extension -e my-other-extension` |
| `--list-extensions` | `-l` | 利用可能なすべての拡張機能を一覧表示して終了します。 | | |
| `--proxy` | | CLI のプロキシを設定します。 | プロキシ URL | 例: `--proxy http://localhost:7890` |
| `--include-directories` | | マルチディレクトリサポートのためにワークスペースに追加のディレクトリを含めます。 | ディレクトリパス | 複数回指定するかカンマ区切りの値として指定できます。最大 5 つのディレクトリを追加できます。例: `--include-directories /path/to/project1,/path/to/project2` または `--include-directories /path/to/project1 --include-directories /path/to/project2` |
| `--screen-reader` | | スクリーンリーダーモードを有効にします。スクリーンリーダーとの互換性を高めるよう TUI を調整します。 | | |
| `--version` | | CLI のバージョンを表示します。 | | |
| `--openai-logging` | | デバッグと分析のために OpenAI API 呼び出しのロギングを有効にします。 | | このフラグは `settings.json` の `enableOpenAILogging` 設定を上書きします。 |
| `--openai-logging-dir` | | OpenAI API ログのカスタムディレクトリパスを設定します。 | ディレクトリパス | このフラグは `settings.json` の `openAILoggingDir` 設定を上書きします。絶対パス、相対パス、`~` 展開をサポートします。例: `qwen --openai-logging-dir "~/qwen-logs" --openai-logging` |

## コンテキストファイル（階層的な指示コンテキスト）

CLI の動作設定とは厳密に異なりますが、コンテキストファイル（デフォルトは `QWEN.md`、`context.fileName` 設定で変更可能）は指示コンテキスト（「メモリ」とも呼ばれます）を設定するために重要です。この強力な機能を使うと、プロジェクト固有の指示、コーディングスタイルガイド、または関連する背景情報を AI に伝えることができ、ニーズに合ったより的確な応答が得られます。CLI には、フッターに読み込まれたコンテキストファイルの数を示すインジケーターなどの UI 要素があり、アクティブなコンテキストを常に確認できます。

- **目的:** これらの Markdown ファイルには、インタラクション中に Qwen モデルに認識させたい指示、ガイドライン、またはコンテキストが含まれています。このシステムは指示コンテキストを階層的に管理するよう設計されています。

### コンテキストファイルの内容例（例: `QWEN.md`）

TypeScript プロジェクトのルートにあるコンテキストファイルの概念的な例を以下に示します:

```
# Project: My Awesome TypeScript Library

## General Instructions:
- When generating new TypeScript code, please follow the existing coding style.
- Ensure all new functions and classes have JSDoc comments.
- Prefer functional programming paradigms where appropriate.
- All code should be compatible with TypeScript 5.0 and Node.js 22+.

## Coding Style:
- Use 2 spaces for indentation.
- Interface names should be prefixed with `I` (e.g., `IUserService`).
- Private class members should be prefixed with an underscore (`_`).
- Always use strict equality (`===` and `!==`).

## Specific Component: `src/api/client.ts`
- This file handles all outbound API requests.
- When adding new API call functions, ensure they include robust error handling and logging.
- Use the existing `fetchWithRetry` utility for all GET requests.

## Regarding Dependencies:
- Avoid introducing new external dependencies unless absolutely necessary.
- If a new dependency is required, please state the reason.
```

この例は、一般的なプロジェクトコンテキスト、具体的なコーディング規約、特定のファイルやコンポーネントに関するメモをどのように提供できるかを示しています。コンテキストファイルが関連性が高く精度が高いほど、AI のサポートが向上します。プロジェクト固有のコンテキストファイルは、規約とコンテキストを確立するために強く推奨されます。

- **階層的な読み込みと優先順位:** CLI はいくつかの場所からコンテキストファイル（例: `QWEN.md`）を読み込むことで階層的なメモリシステムを実装しています。このリストの下位にあるファイル（より具体的）のコンテンツは、通常、上位にあるファイル（より一般的）のコンテンツを上書きまたは補完します。正確な連結順序と最終的なコンテキストは `/memory` ダイアログで確認できます。一般的な読み込み順序は以下のとおりです:
  1. **グローバルコンテキストファイル:**
     - 場所: `~/.qwen/<設定されたコンテキストファイル名>`（例: `~/.qwen/QWEN.md`、ユーザーのホームディレクトリ）。
     - スコープ: すべてのプロジェクトのデフォルト指示を提供します。
  2. **プロジェクトルートおよび祖先のコンテキストファイル:**
     - 場所: CLI は現在の作業ディレクトリから始まり、プロジェクトルート（`.git` フォルダーで識別）またはホームディレクトリのいずれか早い方まで各親ディレクトリで設定されたコンテキストファイルを検索します。
     - スコープ: プロジェクト全体または重要な部分に関連するコンテキストを提供します。
- **連結と UI 表示:** 見つかったすべてのコンテキストファイルの内容は（出所とパスを示すセパレーターと共に）連結され、システムプロンプトの一部として提供されます。CLI フッターには読み込まれたコンテキストファイルの数が表示され、アクティブな指示コンテキストの視覚的なヒントが得られます。
- **コンテンツのインポート:** `@path/to/file.md` の構文を使用して他の Markdown ファイルをインポートすることで、コンテキストファイルをモジュール化できます。詳細は [メモリドキュメント](../features/memory.md) を参照してください。
- **メモリ管理コマンド:**
  - `/memory` を使用してメモリ管理ダイアログを開きます。
  - ダイアログからメモリを更新して、設定されたすべての場所からコンテキストファイルを再スキャンして再読み込みします。
  - `/memory` コマンドの完全な詳細は [コマンドドキュメント](../features/commands.md) を参照してください。

これらの設定レイヤーとコンテキストファイルの階層的な性質を理解して活用することで、AI のメモリを効果的に管理し、Qwen Code の応答を特定のニーズとプロジェクトに合わせてカスタマイズできます。

## サンドボックス

Qwen Code は、システムを保護するためにサンドボックス環境内で潜在的に安全でない操作（シェルコマンドやファイル変更など）を実行できます。

[サンドボックス](../features/sandbox) はデフォルトで無効ですが、いくつかの方法で有効にできます:

- `--sandbox` または `-s` フラグを使用する。
- `QWEN_SANDBOX` 環境変数を設定する。
- 設定の `tools.sandbox` を設定する。

> ⚠️ **`--yolo` はサンドボックスを自動的に有効にしません。** YOLO モードはツール呼び出しを自動承認するだけです；サンドボックスは `--sandbox`、`QWEN_SANDBOX`、または `tools.sandbox` でオプトインする必要があります。`--yolo`（または `--approval-mode=yolo`）でサンドボックスなしのヘッドレス/非インタラクティブ実行では、モデルは現在のプロセスの権限レベルでシェル、書き込み、編集ツールを実行できます — Qwen Code はその場合 stderr に警告を出力します。トレードオフを確認したら `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` で抑制できます。

デフォルトでは、事前ビルドされた `qwen-code-sandbox` Docker イメージを使用します。

プロジェクト固有のサンドボックスニーズに対して、プロジェクトのルートディレクトリの `.qwen/sandbox.Dockerfile` にカスタム Dockerfile を作成できます。この Dockerfile はベースサンドボックスイメージをベースにできます:

```
FROM qwen-code-sandbox
# Add your custom dependencies or configurations here
# For example:
# RUN apt-get update && apt-get install -y some-package
# COPY ./my-config /app/my-config
```

`.qwen/sandbox.Dockerfile` が存在する場合、Qwen Code の実行時に `BUILD_SANDBOX` 環境変数を使用してカスタムサンドボックスイメージを自動的にビルドできます:

```
BUILD_SANDBOX=1 qwen -s
```

## 使用統計

Qwen Code の改善に役立てるため、匿名化された使用統計を収集しています。このデータは CLI の使用方法の理解、一般的な問題の特定、新機能の優先順位付けに役立ちます。

**収集するもの:**

- **ツール呼び出し:** 呼び出されたツールの名前、成功または失敗、実行にかかった時間を記録します。ツールに渡された引数やツールから返されたデータは収集しません。
- **API リクエスト:** 各リクエストで使用されたモデル、リクエストの所要時間、成功したかどうかを記録します。プロンプトやレスポンスの内容は収集しません。
- **セッション情報:** 有効なツールや承認モードなど、CLI の設定に関する情報を収集します。

**収集しないもの:**

- **個人を特定できる情報（PII）:** 名前、メールアドレス、API キーなどの個人情報は収集しません。
- **プロンプトとレスポンスの内容:** プロンプトの内容やモデルからのレスポンスは記録しません。
- **ファイルの内容:** CLI によって読み取りまたは書き込まれるファイルの内容は記録しません。

**オプトアウトする方法:**

`settings.json` ファイルの `privacy` カテゴリ配下の `usageStatisticsEnabled` プロパティを `false` に設定することで、いつでも使用統計の収集をオプトアウトできます:

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> 使用統計が有効な場合、イベントは Alibaba Cloud RUM 収集エンドポイントに送信されます。
