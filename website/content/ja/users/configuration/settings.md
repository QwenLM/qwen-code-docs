# Qwen Code の設定

> [!tip]
>
> **認証 / API キー:** 認証（Qwen OAuth、Alibaba Cloud Coding Plan、または API キー）および認証関連の環境変数（`OPENAI_API_KEY` など）については、**[認証](../configuration/auth)** を参照してください。

> [!note]
>
> **新しい設定形式に関する注意:** `settings.json` ファイルの形式が、より整理された新しい構造に更新されました。旧形式は自動的に移行されます。
Qwen Code では、環境変数、コマンドライン引数、設定ファイルなど、動作を設定する複数の方法を提供しています。このドキュメントでは、異なる設定方法と利用可能な設定項目について説明します。

## 設定の階層

設定は以下の優先順位で適用されます（数字が小さいほど優先度が低く、大きいほど上書きされます）：

| レベル | 設定ソース | 説明 |
| ----- | ---------------------- | ------------------------------------------------------------------------------- |
| 1 | デフォルト値 | アプリケーション内にハードコードされたデフォルト値 |
| 2 | システムデフォルトファイル | 他の設定ファイルで上書き可能なシステム全体のデフォルト設定 |
| 3 | ユーザー設定ファイル | 現在のユーザーに適用されるグローバル設定 |
| 4 | プロジェクト設定ファイル | プロジェクト固有の設定 |
| 5 | システム設定ファイル | 他のすべての設定ファイルを上書きするシステム全体の設定 |
| 6 | 環境変数 | システム全体またはセッション固有の変数（`.env` ファイルから読み込まれる場合あり） |
| 7 | コマンドライン引数 | CLI 起動時に渡される値 |

## 設定ファイル

Qwen Code は永続的な設定に JSON 設定ファイルを使用します。これらのファイルには以下の 4 つの配置場所があります：

| ファイルタイプ | 場所 | 適用範囲 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| システムデフォルトファイル | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>パスは `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 環境変数で上書き可能です。 | システム全体のデフォルト設定のベースレイヤーを提供します。これらの設定は最も優先度が低く、ユーザー、プロジェクト、またはシステム上書き設定によって上書きされることを想定しています。 |
| ユーザー設定ファイル | `~/.qwen/settings.json`（`~` はホームディレクトリ）。 | 現在のユーザーのすべての Qwen Code セッションに適用されます。 |
| プロジェクト設定ファイル | プロジェクトのルートディレクトリ内の `.qwen/settings.json`。 | 特定のプロジェクトから Qwen Code を実行した場合にのみ適用されます。プロジェクト設定はユーザー設定を上書きします。 |
| システム設定ファイル | Linux： `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>パスは `QWEN_CODE_SYSTEM_SETTINGS_PATH` 環境変数で上書き可能です。 | システム上のすべてのユーザーのすべての Qwen Code セッションに適用されます。システム設定はユーザー設定とプロジェクト設定を上書きします。企業のシステム管理者がユーザーの Qwen Code 設定を管理する場合に役立ちます。 |

> [!note]
>
> **設定内の環境変数に関する注意:** `settings.json` ファイル内の文字列値は、`$VAR_NAME` または `${VAR_NAME}` 構文を使用して環境変数を参照できます。これらの変数は設定の読み込み時に自動的に解決されます。例えば、環境変数 `MY_API_TOKEN` がある場合、`settings.json` で `"apiKey": "$MY_API_TOKEN"` のように使用できます。

### プロジェクト内の `.qwen` ディレクトリ

プロジェクト設定ファイルに加えて、プロジェクトの `.qwen` ディレクトリには、Qwen Code の動作に関連するその他のプロジェクト固有のファイルを含めることができます。例：

- [カスタムサンドボックスプロファイル](../features/sandbox)（例：`.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。
- `.qwen/skills/` 配下の [エージェントスキル](../features/skills)（各スキルは `SKILL.md` を含むディレクトリです）。

### 設定の移行

Qwen Code は、レガシー設定を新しい形式に自動的に移行します。移行前に旧設定ファイルはバックアップされます。以下の設定は、否定形（`disable*`）から肯定形（`enable*`）の命名に変更されました：

| 旧設定 | 新設定 | 備考 |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate` | 単一設定に統合 |
| `disableLoadingPhrases` | `ui.accessibility.enableLoadingPhrases` | |
| `disableFuzzySearch` | `context.fileFiltering.enableFuzzySearch` | |
| `disableCacheControl` | `model.generationConfig.enableCacheControl` | |

> [!note]
>
> **ブール値の反転:** 移行時、ブール値は反転されます（例：`disableAutoUpdate: true` は `enableAutoUpdate: false` になります）。

#### `disableAutoUpdate` と `disableUpdateNag` の統合ポリシー

両方のレガシー設定が存在し、値が異なる場合、移行は以下のポリシーに従います：`disableAutoUpdate` **または** `disableUpdateNag` の**いずれか**が `true` の場合、`enableAutoUpdate` は `false` になります：

| `disableAutoUpdate` | `disableUpdateNag` | 移行後の `enableAutoUpdate` |
| ------------------- | ------------------ | --------------------------- |
| `false` | `false` | `true` |
| `false` | `true` | `false` |
| `true` | `false` | `false` |
| `true` | `true` | `false` |

### `settings.json` で利用可能な設定

設定はカテゴリごとに整理されています。すべての設定は、`settings.json` ファイル内の対応するトップレベルカテゴリオブジェクト内に配置してください。

#### general

| 設定 | 型 | 説明 | デフォルト |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `general.preferredEditor` | string | ファイルを開く際に優先するエディタ。 | `undefined` |
| `general.vimMode` | boolean | Vim キーバインドを有効にします。 | `false` |
| `general.enableAutoUpdate` | boolean | 起動時に自動更新チェックとインストールを有効にします。 | `true` |
| `general.gitCoAuthor` | boolean | Qwen Code を介してコミットを行う際、git コミットメッセージに自動的に Co-authored-by トレーラーを追加します。 | `true` |
| `general.checkpointing.enabled` | boolean | リカバリ用のセッションチェックポイントを有効にします。 | `false` |
| `general.defaultFileEncoding` | string | 新規ファイルのデフォルトエンコーディング。BOM なし UTF-8 の場合は `"utf-8"`（デフォルト）、BOM 付き UTF-8 の場合は `"utf-8-bom"` を使用します。プロジェクトで BOM が特に必要な場合のみ変更してください。 | `"utf-8"` |

#### output

| 設定 | 型 | 説明 | デフォルト | 可能な値 |
| --------------- | ------ | ----------------------------- | -------- | ------------------ |
| `output.format` | string | CLI 出力の形式。 | `"text"` | `"text"`, `"json"` |

#### ui

| 設定 | 型 | 説明 | デフォルト |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ui.theme` | string | UI のカラースキーマ。利用可能なオプションについては [テーマ](../configuration/themes) を参照してください。 | `undefined` |
| `ui.customThemes` | object | カスタムテーマ定義。 | `{}` |
| `ui.statusLine` | object | カスタムステータスライン設定。フッターの左セクションに表示されるシェルコマンドの出力。詳細は [ステータスライン](../features/status-line) を参照してください。 | `undefined` |
| `ui.hideWindowTitle` | boolean | ウィンドウのタイトルバーを非表示にします。 | `false` |
| `ui.hideTips` | boolean | UI 内のヘルプチップを非表示にします。 | `false` |
| `ui.hideBanner` | boolean | アプリケーションバナーを非表示にします。 | `false` |
| `ui.hideFooter` | boolean | UI からフッターを非表示にします。 | `false` |
| `ui.showMemoryUsage` | boolean | UI にメモリ使用量情報を表示します。 | `false` |
| `ui.showLineNumbers` | boolean | CLI 出力のコードブロックに行番号を表示します。 | `true` |
| `ui.showCitations` | boolean | チャット内の生成テキストの出典を表示します。 | `true` |
| `ui.compactMode` | boolean | ツール出力と思考プロセスを非表示にし、表示をクリーンにします。セッション中に `Ctrl+O` で切り替え可能です。有効にすると、フッターに `compact` インジケーターが表示されます。この設定はセッション間で保持されます。 | `false` |
| `enableWelcomeBack` | boolean | 会話履歴のあるプロジェクトに戻った際に、ウェルカムバックダイアログを表示します。有効にすると、Qwen Code は以前生成されたプロジェクトサマリー（`.qwen/PROJECT_SUMMARY.md`）があるプロジェクトに戻ったことを自動的に検出し、以前の会話を継続するか新規に開始するかを選択できるダイアログを表示します。この機能は `/summary` コマンドおよび終了確認ダイアログと連携します。 | `true` |
| `ui.accessibility.enableLoadingPhrases` | boolean | ローディングフレーズを有効にします（アクセシビリティ向上のために無効化可能）。 | `true` |
| `ui.accessibility.screenReader` | boolean | スクリーンリーダーモードを有効にします。TUI をスクリーンリーダーとの互換性を高めるように調整します。 | `false` |
| `ui.customWittyPhrases` | array of strings | ローディング状態に表示するカスタムフレーズのリスト。指定すると、CLI はデフォルトの代わりにこれらのフレーズを循環表示します。 | `[]` |
| `ui.enableFollowupSuggestions` | boolean | モデルが応答した後に次の入力を予測する [フォローアップ提案](../features/followup-suggestions) を有効にします。提案はゴーストテキストとして表示され、Tab、Enter、または右矢印キーで確定できます。 | `true` |
| `ui.enableCacheSharing` | boolean | 提案生成にキャッシュ対応のフォーククエリを使用します。プレフィックスキャッシュをサポートするプロバイダーでのコストを削減します（実験的機能）。 | `true` |
| `ui.enableSpeculation` | boolean | 確定した提案を提出前に推測実行します。確定時に結果が即座に表示されます（実験的機能）。 | `false` |

#### ide

| 設定 | 型 | 説明 | デフォルト |
| ------------------ | ------- | ---------------------------------------------------- | ------- |
| `ide.enabled` | boolean | IDE 統合モードを有効にします。 | `false` |
| `ide.hasSeenNudge` | boolean | ユーザーが IDE 統合の通知を確認済みかどうか。 | `false` |

#### privacy

| 設定 | 型 | 説明 | デフォルト |
| -------------------------------- | ------- | -------------------------------------- | ------- |
| `privacy.usageStatisticsEnabled` | boolean | 使用統計情報の収集を有効にします。 | `true` |

#### model

| 設定 | 型 | 説明 | デフォルト |
| -------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name` | string | 会話に使用する Qwen モデル。 | `undefined` |
| `model.maxSessionTurns` | number | セッションに保持するユーザー/モデル/ツールのターンの最大数。-1 は無制限を意味します。 | `-1` |
| `model.generationConfig` | object | 基盤となるコンテンツジェネレーターに渡される高度な上書き設定。`timeout`、`maxRetries`、`enableCacheControl`、`contextWindowSize`（モデルのコンテキストウィンドウサイズを上書き）、`modalities`（自動検出された入力モダリティを上書き）、`customHeaders`（API リクエスト用のカスタム HTTP ヘッダー）、`extra_body`（OpenAI 互換 API リクエスト専用の追加ボディパラメータ）などのリクエストコントロールと、`samplingParams`（例：`temperature`、`top_p`、`max_tokens`）の微調整パラメータをサポートします。プロバイダーのデフォルトに依存する場合は未設定のままにしてください。 | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number | チャット履歴圧縮のしきい値を、モデルの総トークン制限に対する割合として設定します。これは 0 から 1 の値で、自動圧縮と手動の `/compress` コマンドの両方に適用されます。例えば、値が `0.6` の場合、チャット履歴がトークン制限の 60% を超えると圧縮がトリガーされます。圧縮を完全に無効にするには `0` を使用します。 | `0.7` |
| `model.skipNextSpeakerCheck` | boolean | 次のスピーカーチェックをスキップします。 | `false` |
| `model.skipLoopDetection` | boolean | ループ検出チェックを無効にします。ループ検出は AI 応答の無限ループを防ぎますが、正当なワークフローを中断する誤検知を生成する場合があります。ループ検出の誤検知による中断が頻繁に発生する場合は、このオプションを有効にしてください。 | `false` |
| `model.skipStartupContext` | boolean | 各セッションの開始時に、スタートアップワークスペースコンテキスト（環境サマリーと確認応答）の送信をスキップします。コンテキストを手動で提供したい場合、または起動時のトークン消費を節約したい場合に有効にします。 | `false` |
| `model.enableOpenAILogging` | boolean | デバッグと分析のために OpenAI API 呼び出しのログ記録を有効にします。有効にすると、API リクエストとレスポンスが JSON ファイルに記録されます。 | `false` |
| `model.openAILoggingDir` | string | OpenAI API ログのカスタムディレクトリパス。指定しない場合、現在の作業ディレクトリの `logs/openai` にデフォルト設定されます。絶対パス、相対パス（現在の作業ディレクトリから解決）、および `~` 展開（ホームディレクトリ）をサポートします。 | `undefined` |

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

**max_tokens（適応型出力トークン）:**

`samplingParams.max_tokens` が設定されていない場合、Qwen Code は GPU リソース使用量を最適化するために適応型出力トークン戦略を使用します：

1. リクエストはデフォルトで **8K** 出力トークンの制限から開始されます
2. 応答が切り捨てられた場合（モデルが制限に達した場合）、Qwen Code は自動的に **64K** トークンで再試行します
3. 部分的な出力は破棄され、再試行からの完全な応答に置き換えられます

これはユーザーに対して透過的です — エスカレーションが発生した場合、再試行インジケーターが一時的に表示されることがあります。応答の 99% が 5K トークン未満であるため、再試行はまれにしか発生しません（リクエストの 1% 未満）。

この動作を上書きするには、設定で `samplingParams.max_tokens` を設定するか、`QWEN_CODE_MAX_OUTPUT_TOKENS` 環境変数を使用してください。

**contextWindowSize:**

選択したモデルのデフォルトのコンテキストウィンドウサイズを上書きします。Qwen Code はモデル名のマッチングに基づいて組み込みのデフォルトと定数のフォールバック値を使用してコンテキストウィンドウを決定します。プロバイダーの実効コンテキスト制限が Qwen Code のデフォルトと異なる場合に、この設定を使用してください。この値はモデルの想定される最大コンテキスト容量を定義するものであり、リクエストごとのトークン制限ではありません。

**modalities:**

選択したモデルの自動検出された入力モダリティを上書きします。Qwen Code はモデル名のパターンマッチングに基づいて、サポートされているモダリティ（画像、PDF、音声、動画）を自動的に検出します。自動検出が正しくない場合（例：サポートしているが認識されていないモデルで `pdf` を有効にする場合）に、この設定を使用してください。形式：`{ "image": true, "pdf": true, "audio": true, "video": true }`。サポートされていないタイプはキーを省略するか `false` に設定してください。

**customHeaders:**

すべての API リクエストにカスタム HTTP ヘッダーを追加できます。リクエストのトレース、モニタリング、API ゲートウェイルーティング、またはモデルごとに異なるヘッダーが必要な場合に役立ちます。`modelProviders[].generationConfig.customHeaders` で `customHeaders` が定義されている場合はそれが直接使用され、それ以外の場合は `model.generationConfig.customHeaders` のヘッダーが使用されます。両レベル間でマージは行われません。

`extra_body` フィールドを使用すると、API に送信されるリクエストボディにカスタムパラメータを追加できます。標準の設定フィールドでカバーされていないプロバイダー固有のオプションに役立ちます。**注意：このフィールドは OpenAI 互換プロバイダー（`openai`、`qwen-oauth`）でのみサポートされています。Anthropic および Gemini プロバイダーでは無視されます。** `modelProviders[].generationConfig.extra_body` で `extra_body` が定義されている場合はそれが直接使用され、それ以外の場合は `model.generationConfig.extra_body` の値が使用されます。

**model.openAILoggingDir の例:**

- `"~/qwen-logs"` - `~/qwen-logs` ディレクトリにログを出力
- `"./custom-logs"` - 現在のディレクトリからの相対パス `./custom-logs` にログを出力
- `"/tmp/openai-logs"` - 絶対パス `/tmp/openai-logs` にログを出力

#### fastModel

| 設定 | 型 | 説明 | デフォルト |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `fastModel` | string | [プロンプト提案](../features/followup-suggestions) の生成と推測実行に使用されるモデル。メインモデルを使用する場合は空のままにします。小さく高速なモデル（例：`qwen3-coder-flash`）を使用すると、レイテンシとコストを削減できます。`/model --fast` でも設定可能です。 | `""` |

#### context

| 設定 | 型 | 説明 | デフォルト |
| ------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `context.fileName` | string or array of strings | コンテキストファイルの名前。 | `undefined` |
| `context.importFormat` | string | メモリをインポートする際に使用する形式。 | `undefined` |
| `context.includeDirectories` | array | ワークスペースコンテキストに含める追加のディレクトリ。ワークスペースコンテキストに含める追加の絶対パスまたは相対パスの配列を指定します。デフォルトでは、存在しないディレクトリは警告とともにスキップされます。パスには `~` を使用してユーザーのホームディレクトリを参照できます。この設定は `--include-directories` コマンドラインフラグと組み合わせることができます。 | `[]` |
| `context.loadFromIncludeDirectories` | boolean | `/memory refresh` コマンドの動作を制御します。`true` に設定すると、追加されたすべてのディレクトリから `QWEN.md` ファイルが読み込まれます。`false` に設定すると、`QWEN.md` は現在のディレクトリからのみ読み込まれます。 | `false` |
| `context.fileFiltering.respectGitIgnore` | boolean | 検索時に .gitignore ファイルを尊重します。 | `true` |
| `context.fileFiltering.respectQwenIgnore` | boolean | 検索時に .qwenignore ファイルを尊重します。 | `true` |
| `context.fileFiltering.enableRecursiveFileSearch` | boolean | プロンプトで `@` プレフィックスを補完する際、現在のツリー下でファイル名を再帰的に検索するかどうか。 | `true` |
| `context.fileFiltering.enableFuzzySearch` | boolean | `true` の場合、ファイル検索時にファジー検索機能を有効にします。ファイル数が非常に多いプロジェクトでパフォーマンスを向上させるには `false` に設定します。 | `true` |
| `context.gapThresholdMinutes` | number | コンテキストトークンを解放するために、保持されている思考ブロックがクリアされるまでの非アクティブ時間（分）。一般的なプロバイダーのプロンプトキャッシュ TTL と一致します。プロバイダーのキャッシュ TTL が長い場合は、より高い値に設定してください。 | `5` |

#### ファイル検索のパフォーマンスに関するトラブルシューティング

ファイル検索（例：`@` 補完）でパフォーマンスの問題が発生している場合、特にファイル数が非常に多いプロジェクトでは、推奨順に以下の方法を試してください：

1. **`.qwenignore` を使用する:** プロジェクトルートに `.qwenignore` ファイルを作成し、参照する必要のない大量のファイルを含むディレクトリ（例：ビルド成果物、ログ、`node_modules`）を除外します。クロールされるファイルの総数を減らすことが、パフォーマンス向上に最も効果的です。
2. **ファジー検索を無効にする:** ファイルの除外だけでは不十分な場合、`settings.json` で `enableFuzzySearch` を `false` に設定してファジー検索を無効にできます。これにより、より単純で非ファジーなマッチングアルゴリズムが使用され、高速化される場合があります。
3. **再帰的ファイル検索を無効にする:** 最後の手段として、`enableRecursiveFileSearch` を `false` に設定して再帰的ファイル検索を完全に無効にできます。プロジェクトの再帰的クロールを回避するため、これが最速のオプションになります。ただし、`@` 補完を使用する際にファイルのフルパスを入力する必要があります。

#### tools

| 設定 | 型 | 説明 | デフォルト | 備考 |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox` | boolean or string | サンドボックス実行環境（ブール値またはパス文字列）。 | `undefined` | |
| `tools.shell.enableInteractiveShell` | boolean | インタラクティブシェル体験に `node-pty` を使用します。`child_process` へのフォールバックは引き続き適用されます。 | `false` | |
| `tools.core` | array of strings | **非推奨。** 次期バージョンで削除されます。代わりに `permissions.allow` + `permissions.deny` を使用してください。組み込みツールを許可リストに制限します。リストにないすべてのツールは無効になります。 | `undefined` | |
| `tools.exclude` | array of strings | **非推奨。** 代わりに `permissions.deny` を使用してください。検出から除外するツール名。初回読み込み時に自動的に `permissions` 形式に移行されます。 | `undefined` | |
| `tools.allowed` | array of strings | **非推奨。** 代わりに `permissions.allow` を使用してください。確認ダイアログをバイパスするツール名。初回読み込み時に自動的に `permissions` 形式に移行されます。 | `undefined` | |
| `tools.approvalMode` | string | ツール使用のデフォルト承認モードを設定します。 | `default` | 可能な値: `plan`（分析のみ、ファイル変更やコマンド実行は行わない）、`default`（ファイル編集やシェルコマンド実行前に承認を要求）、`auto-edit`（ファイル編集を自動承認）、`yolo`（すべてのツール呼び出しを自動承認） |
| `tools.discoveryCommand` | string | ツール検出のために実行するコマンド。 | `undefined` | |
| `tools.callCommand` | string | `tools.discoveryCommand` を使用して検出された特定のツールを呼び出すためのカスタムシェルコマンドを定義します。シェルコマンドは以下の条件を満たす必要があります：最初の引数として関数 `name`（[関数宣言](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) と完全に一致）を受け取る必要があります。`stdin` 上で JSON として関数引数を読み取る必要があります（[`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall) に類似）。`stdout` 上で JSON として関数出力を返す必要があります（[`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse) に類似）。 | `undefined` | |
| `tools.useRipgrep` | boolean | フォールバック実装の代わりにファイルコンテンツ検索に ripgrep を使用します。検索パフォーマンスが向上します。 | `true` | |
| `tools.useBuiltinRipgrep` | boolean | バンドルされた ripgrep バイナリを使用します。`false` に設定すると、代わりにシステムレベルの `rg` コマンドが使用されます。この設定は `tools.useRipgrep` が `true` の場合にのみ有効です。 | `true` | |
| `tools.truncateToolOutputThreshold` | number | この文字数を超える場合、ツール出力を切り捨てます。Shell、Grep、Glob、ReadFile、ReadManyFiles ツールに適用されます。 | `25000` | 再起動が必要: はい |
| `tools.truncateToolOutputLines` | number | ツール出力を切り捨てる際に保持する最大行数またはエントリ数。Shell、Grep、Glob、ReadFile、ReadManyFiles ツールに適用されます。 | `1000` | 再起動が必要: はい |

> [!note]
>
> **`tools.core` / `tools.exclude` / `tools.allowed` からの移行:** これらのレガシー設定は**非推奨**であり、初回読み込み時に新しい `permissions` 形式に自動的に移行されます。`permissions.allow` / `permissions.deny` を直接設定することを推奨します。ルールを対話的に管理するには `/permissions` を使用してください。

#### permissions

権限システムは、どのツールを実行可能か、確認が必要か、ブロックされるかを細かく制御します。

**決定の優先順位（高い順）: `deny` > `ask` > `allow` > _(デフォルト/インタラクティブモード)_**

最初に一致したルールが適用されます。ルールは `"ToolName"` または `"ToolName(specifier)"` の形式を使用します。

| 設定 | 型 | 説明 | デフォルト |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | 自動承認されるツール呼び出しのルール（確認不要）。すべてのスコープ（ユーザー + プロジェクト + システム）でマージされます。 | `undefined` |
| `permissions.ask` | array of strings | 常にユーザー確認が必要なツール呼び出しのルール。`allow` より優先されます。 | `undefined` |
| `permissions.deny` | array of strings | ブロックされるツール呼び出しのルール。最高優先度 — `allow` と `ask` の両方を上書きします。 | `undefined` |

**ツール名のエイリアス（ルール内でいずれも使用可能）:**

| エイリアス | 正規のツール名 | 備考 |
| --------------------- | ------------------- | ------------------------- |
| `Bash`, `Shell` | `run_shell_command` | |
| `Read`, `ReadFile` | `read_file` | メタカテゴリ — 下記参照 |
| `Edit`, `EditFile` | `edit` | メタカテゴリ — 下記参照 |
| `Write`, `WriteFile` | `write_file` | |
| `Grep`, `SearchFiles` | `grep_search` | |
| `Glob`, `FindFiles` | `glob` | |
| `ListFiles` | `list_directory` | |
| `WebFetch` | `web_fetch` | |
| `Agent` | `task` | |
| `Skill` | `skill` | |

**メタカテゴリ:**

一部のルール名は自動的に複数のツールをカバーします：

| ルール名 | カバーされるツール |
| --------- | ---------------------------------------------------- |
| `Read` | `read_file`, `grep_search`, `glob`, `list_directory` |
| `Edit` | `edit`, `write_file` |

> [!important]
> `Read(/path/**)` は **4 つすべて**の読み取りツール（ファイル読み取り、grep、glob、ディレクトリ一覧）に一致します。
> ファイル読み取りのみを制限するには、`ReadFile(/path/**)` または `read_file(/path/**)` を使用してください。

**ルール構文の例:**

| ルール | 意味 |
| ----------------------------- | -------------------------------------------------------------- |
| `"Bash"` | すべてのシェルコマンド |
| `"Bash(git *)"` | `git` で始まるシェルコマンド（単語境界：`gitk` は含まない） |
| `"Bash(git push *)"` | `git push origin main` のようなシェルコマンド |
| `"Bash(npm run *)"` | すべての `npm run` スクリプト |
| `"Read"` | すべてのファイル読み取り操作（read、grep、glob、list） |
| `"Read(./secrets/**)"` | `./secrets/` 配下のすべてのファイルを再帰的に読み取り |
| `"Edit(/src/**/*.ts)"` | プロジェクトルート `/src/` 配下の TypeScript ファイルを編集 |
| `"WebFetch(api.example.com)"` | `api.example.com` およびそのすべてのサブドメインからフェッチ |
| `"mcp__puppeteer"` | puppeteer MCP サーバーからのすべてのツール |

**パスパターンのプレフィックス:**

| プレフィックス | 意味 | 例 |
| ------ | ------------------------------------- | ------------------- |
| `//` | ファイルシステムルートからの絶対パス | `//etc/passwd` |
| `~/` | ホームディレクトリからの相対パス | `~/Documents/*.pdf` |
| `/` | プロジェクトルートからの相対パス | `/src/**/*.ts` |
| `./` | 現在の作業ディレクトリからの相対パス | `./secrets/**` |
| (なし) | `./` と同じ | `secrets/**` |

**シェルコマンドのバイパス防止:**

`Read`、`Edit`、`WebFetch` の権限ルールは、エージェントが同等のシェルコマンドを実行する場合にも適用されます。例えば、`deny` に `Read(./.env)` が含まれている場合、エージェントはシェルコマンドで `cat .env` を実行してこれをバイパスできません。サポートされるシェルコマンドには `cat`、`grep`、`curl`、`wget`、`cp`、`mv`、`rm`、`chmod` など多数が含まれます。不明または安全なコマンド（例：`git`）はファイル/ネットワークルールの影響を受けません。

**レガシー設定からの移行:**

| レガシー設定 | 同等の `permissions` ルール | 備考 |
| --------------- | ------------------------------- | ------------------------------------------------------------ |
| `tools.allowed` | `permissions.allow` | 初回読み込み時に自動移行 |
| `tools.exclude` | `permissions.deny` | 初回読み込み時に自動移行 |
| `tools.core` | `permissions.allow`（許可リスト） | 自動移行。リストにないツールはレジストリレベルで無効化されます |

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

#### mcp

| 設定 | 型 | 説明 | デフォルト |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string | MCP サーバーを起動するコマンド。 | `undefined` |
| `mcp.allowed` | array of strings | 許可する MCP サーバーの許可リスト。モデルに利用可能にする MCP サーバー名のリストを指定できます。接続する MCP サーバーのセットを制限するために使用できます。`--allowed-mcp-server-names` が設定されている場合、これは無視されることに注意してください。 | `undefined` |
| `mcp.excluded` | array of strings | 除外する MCP サーバーの拒否リスト。`mcp.excluded` と `mcp.allowed` の両方にリストされているサーバーは除外されます。`--allowed-mcp-server-names` が設定されている場合、これは無視されることに注意してください。 | `undefined` |

> [!note]
>
> **MCP サーバーに関するセキュリティ上の注意:** これらの設定は MCP サーバー名に対する単純な文字列マッチングを使用しており、変更可能です。ユーザーがこれをバイパスするのを防ぎたいシステム管理者の場合は、システム設定レベルで `mcpServers` を構成し、ユーザーが独自の MCP サーバーを構成できないようにすることを検討してください。これは完全なセキュリティメカニズムとして使用すべきではありません。

#### lsp

> [!warning]
> **実験的機能**: LSP サポートは現在実験的であり、デフォルトで無効です。`--experimental-lsp` コマンドラインフラグを使用して有効にしてください。

Language Server Protocol (LSP) は、定義へ移動、参照の検索、診断などのコードインテリジェンス機能を提供します。

LSP サーバーの設定は `settings.json` ではなく、プロジェクトルートディレクトリの `.lsp.json` ファイルを通じて行います。設定の詳細と例については、[LSP ドキュメント](../features/lsp) を参照してください。

#### security

| 設定 | 型 | 説明 | デフォルト |
| ------------------------------ | ------- | ------------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | フォルダ信頼が有効かどうかを追跡する設定。 | `false` |
| `security.auth.selectedType` | string | 現在選択されている認証タイプ。 | `undefined` |
| `security.auth.enforcedType` | string | 必須の認証タイプ（企業向けに有用）。 | `undefined` |
| `security.auth.useExternal` | boolean | 外部認証フローを使用するかどうか。 | `undefined` |

#### advanced

| 設定 | 型 | 説明 | デフォルト |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean | Node.js のメモリ制限を自動的に構成します。 | `false` |
| `advanced.dnsResolutionOrder` | string | DNS 解決の順序。 | `undefined` |
| `advanced.excludedEnvVars` | array of strings | プロジェクトコンテキストから除外する環境変数。プロジェクトの `.env` ファイルから読み込まれるべきではない環境変数を指定します。これにより、プロジェクト固有の環境変数（`DEBUG=true` など）が CLI の動作に干渉するのを防ぎます。`.qwen/.env` ファイルからの環境変数は除外されません。 | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand` | object | バグレポートコマンドの設定。`/bug` コマンドのデフォルト URL を上書きします。プロパティ：`urlTemplate`（文字列）：`{title}` と `{info}` プレースホルダーを含むことができる URL。例：`"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }` | `undefined` |
| `advanced.tavilyApiKey` | string | Tavily ウェブ検索サービスの API キー。`web_search` ツール機能を有効にするために使用されます。 | `undefined` |

> [!note]
>
> **advanced.tavilyApiKey に関する注意:** これはレガシーな設定形式です。Qwen OAuth ユーザーの場合、DashScope プロバイダーは設定なしで自動的に利用可能です。他の認証タイプの場合は、新しい `webSearch` 設定形式を使用して Tavily または Google プロバイダーを構成してください。

#### mcpServers

カスタムツールの検出と使用のために、1 つ以上の Model-Context Protocol (MCP) サーバーへの接続を構成します。Qwen Code は、構成された各 MCP サーバーへの接続を試み、利用可能なツールを検出します。複数の MCP サーバーが同じ名前のツールを公開している場合、競合を避けるためにツール名に構成で定義したサーバーエイリアスがプレフィックスとして付与されます（例：`serverAlias__actualToolName`）。互換性のため、システムが MCP ツール定義から特定のスキーマプロパティを削除する場合があることに注意してください。`command`、`url`、`httpUrl` の少なくとも 1 つを提供する必要があります。複数が指定されている場合、優先順位は `httpUrl`、次に `url`、最後に `command` の順です。

| プロパティ | 型 | 説明 | オプション |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command` | string | 標準入出力経由で MCP サーバーを起動するために実行するコマンド。 | はい |
| `mcpServers.<SERVER_NAME>.args` | array of strings | コマンドに渡す引数。 | はい |
| `mcpServers.<SERVER_NAME>.env` | object | サーバープロセスに設定する環境変数。 | はい |
| `mcpServers.<SERVER_NAME>.cwd` | string | サーバーを起動する作業ディレクトリ。 | はい |
| `mcpServers.<SERVER_NAME>.url` | string | 通信に Server-Sent Events (SSE) を使用する MCP サーバーの URL。 | はい |
| `mcpServers.<SERVER_NAME>.httpUrl` | string | 通信にストリーミング HTTP を使用する MCP サーバーの URL。 | はい |
| `mcpServers.<SERVER_NAME>.headers` | object | `url` または `httpUrl` へのリクエストに送信する HTTP ヘッダーのマップ。 | はい |
| `mcpServers.<SERVER_NAME>.timeout` | number | この MCP サーバーへのリクエストのタイムアウト（ミリ秒）。 | はい |
| `mcpServers.<SERVER_NAME>.trust` | boolean | このサーバーを信頼し、すべてのツール呼び出し確認をバイパスします。 | はい |
| `mcpServers.<SERVER_NAME>.description` | string | サーバーの簡単な説明。表示目的で使用される場合があります。 | はい |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | この MCP サーバーから含めるツール名のリスト。指定すると、このサーバーからリストされたツールのみが利用可能になります（許可リスト動作）。指定しない場合、デフォルトでサーバーのすべてのツールが有効になります。 | はい |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーによって公開されていてもモデルでは利用できません。**注意:** `excludeTools` は `includeTools` より優先されます — ツールが両方のリストにある場合、除外されます。 | はい |

#### telemetry

Qwen Code のログ記録とメトリクス収集を構成します。詳細については、[テレメトリ](/developers/development/telemetry) を参照してください。

| 設定 | 型 | 説明 | デフォルト |
| ------------------------ | ------- | -------------------------------------------------------------------------------- | ------- |
| `telemetry.enabled` | boolean | テレメトリが有効かどうか。 | |
| `telemetry.target` | string | 収集されたテレメトリの送信先。サポートされる値は `local` と `gcp` です。 | |
| `telemetry.otlpEndpoint` | string | OTLP エクスポーターのエンドポイント。 | |
| `telemetry.otlpProtocol` | string | OTLP エクスポーターのプロトコル（`grpc` または `http`）。 | |
| `telemetry.logPrompts` | boolean | ユーザープロンプトの内容をログに含めるかどうか。 | |
| `telemetry.outfile` | string | `target` が `local` の場合、テレメトリを書き込むファイル。 | |
| `telemetry.useCollector` | boolean | 外部 OTLP コレクターを使用するかどうか。 | |

### `settings.json` の例

以下は、v0.3.0 で導入されたネスト構造を持つ `settings.json` ファイルの例です：

```
{
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
    "logPrompts": true
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

CLI は実行したシェルコマンドの履歴を保持します。異なるプロジェクト間の競合を避けるため、この履歴はユーザーのホームフォルダ内のプロジェクト固有のディレクトリに保存されます。

- **場所:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` はプロジェクトのルートパスから生成される一意の識別子です。
  - 履歴は `shell_history` という名前のファイルに保存されます。

## 環境変数と `.env` ファイル

環境変数は、特に機密情報（トークンなど）や環境間で変更される可能性のある設定に対して、アプリケーションを構成する一般的な方法です。

Qwen Code は `.env` ファイルから環境変数を自動的に読み込むことができます。
認証関連の変数（`OPENAI_*` など）と推奨される `.qwen/.env` アプローチについては、**[認証](../configuration/auth)** を参照してください。

> [!tip]
>
> **環境変数の除外:** `DEBUG` や `DEBUG_MODE` などの一部の環境変数は、CLI の動作への干渉を防ぐため、デフォルトでプロジェクトの `.env` ファイルから自動的に除外されます。`.qwen/.env` ファイルからの環境変数は除外されません。この動作は `settings.json` の `advanced.excludedEnvVars` 設定でカスタマイズできます。

### 環境変数テーブル

| 変数 | 説明 | 備考 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_TELEMETRY_ENABLED` | テレメトリを有効にするには `true` または `1` に設定します。他の値は無効として扱われます。 | `telemetry.enabled` 設定を上書きします。 |
| `QWEN_TELEMETRY_TARGET` | テレメトリのターゲットを設定します（`local` または `gcp`）。 | `telemetry.target` 設定を上書きします。 |
| `QWEN_TELEMETRY_OTLP_ENDPOINT` | テレメトリの OTLP エンドポイントを設定します。 | `telemetry.otlpEndpoint` 設定を上書きします。 |
| `QWEN_TELEMETRY_OTLP_PROTOCOL` | テレメトリの OTLP プロトコルを設定します（`grpc` または `http`）。 | `telemetry.otlpProtocol` 設定を上書きします。 |
| `QWEN_TELEMETRY_LOG_PROMPTS` | ユーザープロンプトのログ記録を有効または無効にするには `true` または `1` に設定します。他の値は無効として扱われます。 | `telemetry.logPrompts` 設定を上書きします。 |
| `QWEN_TELEMETRY_OUTFILE` | ターゲットが `local` の場合、テレメトリを書き込むファイルパスを設定します。 | `telemetry.outfile` 設定を上書きします。 |
| `QWEN_TELEMETRY_USE_COLLECTOR` | 外部 OTLP コレクターの使用を有効または無効にするには `true` または `1` に設定します。他の値は無効として扱われます。 | `telemetry.useCollector` 設定を上書きします。 |
| `QWEN_SANDBOX` | `settings.json` の `sandbox` 設定の代替。 | `true`、`false`、`docker`、`podman`、またはカスタムコマンド文字列を受け入れます。 |
| `SEATBELT_PROFILE` | (macOS 固有) macOS 上の Seatbelt (`sandbox-exec`) プロファイルを切り替えます。 | `permissive-open`: (デフォルト) プロジェクトフォルダ（およびその他のいくつかのフォルダ、`packages/cli/src/utils/sandbox-macos-permissive-open.sb` を参照）への書き込みを制限しますが、他の操作は許可します。`strict`: デフォルトで操作を拒否する厳格なプロファイルを使用します。`<profile_name>`: カスタムプロファイルを使用します。カスタムプロファイルを定義するには、プロジェクトの `.qwen/` ディレクトリに `sandbox-macos-<profile_name>.sb` という名前のファイルを作成します（例：`my-project/.qwen/sandbox-macos-custom.sb`）。 |
| `DEBUG` または `DEBUG_MODE` | (基盤となるライブラリや CLI 自体でよく使用されます) 詳細なデバッグログを有効にするには `true` または `1` に設定します。トラブルシューティングに役立ちます。 | **注意:** これらの変数は、CLI の動作への干渉を防ぐため、デフォルトでプロジェクトの `.env` ファイルから自動的に除外されます。Qwen Code 専用に設定する必要がある場合は `.qwen/.env` ファイルを使用してください。 |
| `NO_COLOR` | 任意の値に設定すると、CLI のすべてのカラー出力が無効になります。 | |
| `CLI_TITLE` | CLI のタイトルをカスタマイズするには文字列に設定します。 | |
| `CODE_ASSIST_ENDPOINT` | コードアシストサーバーのエンドポイントを指定します。 | 開発およびテストに役立ちます。 |
| `QWEN_CODE_MAX_OUTPUT_TOKENS` | レスポンスごとのデフォルトの最大出力トークンを上書きします。設定しない場合、Qwen Code は適応型戦略を使用します：8K トークンから開始し、応答が切り捨てられた場合は自動的に 64K で再試行します。固定制限を使用するには、特定の値（例：`16000`）に設定します。 | 設定されたデフォルト（8K）より優先されますが、設定の `samplingParams.max_tokens` によって上書きされます。設定すると自動エスカレーションが無効になります。例：`export QWEN_CODE_MAX_OUTPUT_TOKENS=16000` |
| `TAVILY_API_KEY` | Tavily ウェブ検索サービスの API キー。 | `web_search` ツール機能を有効にするために使用されます。例：`export TAVILY_API_KEY="tvly-your-api-key-here"` |

## コマンドライン引数

CLI 実行時に直接渡される引数は、その特定のセッションに対して他の設定を上書きできます。

### コマンドライン引数テーブル

| 引数 | エイリアス | 説明 | 可能な値 | 備考 |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model` | `-m` | このセッションに使用する Qwen モデルを指定します。 | モデル名 | 例：`npm start -- --model qwen3-coder-plus` |
| `--prompt` | `-p` | コマンドに直接プロンプトを渡すために使用されます。Qwen Code を非インタラクティブモードで起動します。 | プロンプトテキスト | スクリプトの例については、構造化出力を取得するために `--output-format json` フラグを使用してください。 |
| `--prompt-interactive` | `-i` | 提供されたプロンプトを初期入力として使用してインタラクティブセッションを開始します。 | プロンプトテキスト | プロンプトはセッション開始前ではなく、インタラクティブセッション内で処理されます。stdin からパイプ入力する場合は使用できません。例：`qwen -i "explain this code"` |
| `--system-prompt` | | この実行に対して、組み込みのメインセッションシステムプロンプトを上書きします。 | プロンプトテキスト | `QWEN.md` などの読み込まれたコンテキストファイルは、この上書きの後に引き続き追加されます。`--append-system-prompt` と組み合わせることができます。 |
| `--append-system-prompt` | | この実行に対して、メインセッションシステムプロンプトに追加の指示を付加します。 | プロンプトテキスト | 組み込みプロンプトと読み込まれたコンテキストファイルの後に適用されます。`--system-prompt` と組み合わせることができます。例については [ヘッドレスモード](../features/headless) を参照してください。 |
| `--output-format` | `-o` | 非インタラクティブモードの CLI 出力形式を指定します。 | `text`, `json`, `stream-json` | `text`: (デフォルト) 標準の人間が読める出力。`json`: 実行終了時に出力される機械可読な JSON 出力。`stream-json`: 実行中に発生するストリーミング JSON メッセージ。構造化出力とスクリプトには、`--output-format json` または `--output-format stream-json` フラグを使用してください。詳細については [ヘッドレスモード](../features/headless) を参照してください。 |
| `--input-format` | | 標準入力から消費される形式を指定します。 | `text`, `stream-json` | `text`: (デフォルト) stdin またはコマンドライン引数からの標準テキスト入力。`stream-json`: 双方向通信のための stdin 経由の JSON メッセージプロトコル。要件：`--input-format stream-json` には `--output-format stream-json` の設定が必要です。`stream-json` を使用する場合、stdin はプロトコルメッセージ用に予約されます。詳細については [ヘッドレスモード](../features/headless) を参照してください。 |
| `--include-partial-messages` | | `stream-json` 出力形式を使用する際に、部分的なアシスタントメッセージを含めます。有効にすると、ストリーミング中に発生するストリームイベント（message_start、content_block_delta など）を出力します。 | | デフォルト：`false`。要件：`--output-format stream-json` の設定が必要です。ストリームイベントの詳細については [ヘッドレスモード](../features/headless) を参照してください。 |
| `--sandbox` | `-s` | このセッションのサンドボックスモードを有効にします。 | | |
| `--sandbox-image` | | サンドボックスイメージの URI を設定します。 | | |
| `--debug` | `-d` | このセッションのデバッグモードを有効にし、より詳細な出力を提供します。 | | |
| `--all-files` | `-a` | 設定されている場合、現在のディレクトリ内のすべてのファイルを再帰的にプロンプトのコンテキストとして含めます。 | | |
| `--help` | `-h` | コマンドライン引数に関するヘルプ情報を表示します。 | | |
| `--show-memory-usage` | | 現在のメモリ使用量を表示します。 | | |
| `--yolo` | | すべてのツール呼び出しを自動的に承認する YOLO モードを有効にします。 | | |
| `--approval-mode` | | ツール呼び出しの承認モードを設定します。 | `plan`, `default`, `auto-edit`, `yolo` | サポートされるモード：`plan`: 分析のみ—ファイルの変更やコマンドの実行