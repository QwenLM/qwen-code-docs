# コマンド

本文書では、Qwen Code がサポートするすべてのコマンドについて詳しく説明し、セッションの効率的な管理、インターフェースのカスタマイズ、動作の制御を支援します。

Qwen Code のコマンドは特定のプレフィックスでトリガーされ、次の 3 つのカテゴリに分類されます。

| プレフィックス種別 | 機能説明 | 典型的なユースケース |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| スラッシュコマンド (`/`) | Qwen Code 自体のメタレベル制御 | セッションの管理、設定の変更、ヘルプの取得 |
| アットコマンド (`@`) | ローカルファイルの内容を会話に素早く挿入 | AI に指定されたファイルやディレクトリ配下のコードを分析させる |
| 感嘆符コマンド (`!`) | システムシェルとの直接対話 | `git status`、`ls` などのシステムコマンドの実行 |

## 1. スラッシュコマンド (`/`)

スラッシュコマンドは、Qwen Code のセッション、インターフェース、および基本的な動作を管理するために使用されます。

### 1.1 セッションとプロジェクトの管理

これらのコマンドは、作業の進捗を保存、復元、および要約するのに役立ちます。

| コマンド | 説明 | 使用例 |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `/init` | 現在のディレクトリを分析し、初期コンテキストファイルを作成する | `/init` |
| `/summary` | 会話履歴に基づいてプロジェクトの要約を生成する | `/summary` または `/summary docs/my-summary.md` |
| `/compress` | トークンを節約するためにチャット履歴を要約で置き換える | `/compress` または `/summarize` |
| `/compress-fast` | AI を使用しない高速圧縮 — 古いツール出力と考え部分を削除する | `/compress-fast` |
| `/resume` | 以前の会話セッションを再開する | `/resume` または `/continue` |
| `/recap` | 現在のセッションの一行要約を生成する | `/recap` |
| `/restore` | プロジェクトファイルをツール呼び出しが実行される前のチェックポイントに戻す | `/restore` (リスト) または `/restore <ID>` |
| `/delete` | 以前のセッションを削除する | `/delete` |
| `/branch` | 現在の会話を新しいセッションにフォークする | `/branch` |
| `/fork` | 完全な会話を継承するバックグラウンドエージェントを生成する | `/fork <directive>` |
| `/rewind` | 会話を前のターンに巻き戻す | `/rewind` または `/rollback` |
| `/export` | セッション履歴をファイルにエクスポートする | `/export html`、`/export md`、`/export json`、`/export jsonl` |
| `/rename` | 現在のセッションの名前を変更またはタグ付けする | `/rename My Feature` または `/tag` |
| `/commit` | AIが作成したメッセージでgitコミットを作成する | `/commit` または `/commit only stage the parser changes` |

> [!note]
>
> HTML エクスポートを開くと、`unpkg.com` からその Qwen Code バージョン専用のレンダラーとスタイルシートが読み込まれます。バージョンがまだ公開されていない場合やいずれのアセットにもアクセスできない場合は、ファイルに読み込みエラーが表示されます。Markdown、JSON、JSONL エクスポートは自己完結型です。

> [!note]
>
> `/summarize` は `/compress` のエイリアスです（チャット履歴を圧縮する破壊的な操作です）。代わりに非破壊的なプロジェクトの要約を生成するには、`/summary` を使用してください。

> [!note]
>
> `/summary` はオプションの `[path]` 引数を受け取り、プロジェクトルート内の任意の場所に要約を保存できます。引数がない場合は `.qwen/PROJECT_SUMMARY.md` に保存されます。カスタムパスの要約は、welcome-back フロー（`ui.enableWelcomeBack`）では検出されません。welcome-back フローはデフォルトの `.qwen/PROJECT_SUMMARY.md` の位置のみを読み取ります。

### 1.2 インターフェースとワークスペースの制御

インターフェースの外観と作業環境を調整するためのコマンド。

| コマンド | 説明 | 使用例 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear` | 会話履歴をクリアし、コンテキストを解放する | `/clear`, `/reset`, `/new` |
| `/context` | コンテキストウィンドウの使用状況の内訳を表示する | `/context` |
| → `detail` | 項目ごとのコンテキスト使用状況の内訳を表示する | `/context detail` |
| `/history` | 履歴の表示設定と可視性を制御する | `/history collapse-on-resume`、`/history expand-on-resume`、`/history expand-now` |
| `/diff` | コミットされていない変更とターンごとの差分を表示するインタラクティブな diff ビューアを開きます。←/→ で現在の git diff と個々の会話ターンを切り替え、↑/↓ でファイルを閲覧します | `/diff` |
| `/log` | ワークスペースのコミット履歴ビューアを開く (Web Shellのみ) | `/log` |
| `/theme` | Qwen Codeのビジュアルテーマを変更する | `/theme` |
| `/vim` | 入力エリアのVim編集モードをオン/オフにする | `/vim` |
| `/voice` | 音声入力（ディクテーション）を切り替える | `/voice`、`/voice hold`、`/voice tap`、`/voice off`、`/voice status` |
| `/directory` | マルチディレクトリサポートワークスペースを管理する | `/dir add ./src,./tests`、`/dir show` |
| `/cd` | このセッションを新しい作業ディレクトリに移動する | `/cd ../other-project` |
| `/editor` | サポートされているエディターを選択するためのダイアログを開く | `/editor` |
| `/statusline` | インタラクティブな[ステータスライン](./status-line.md)プリセットダイアログを開く | `/statusline` |
| `/statusline <text>` | エージェント経由でコマンドモードの[ステータスライン](./status-line.md)を生成する | `/statusline show model and git branch` |
| `/terminal-setup` | マルチライン入力のターミナルキーバインディングを設定する | `/terminal-setup` |

### 1.3 言語設定

インターフェースと出力言語を制御するための専用コマンド。

| コマンド | 説明 | 使用例 |
| --------------------- | -------------------------------- | -------------------------- |
| `/language` | 言語設定を表示または変更する | `/language` |
| → `ui [language]` | UI インターフェースの言語を設定する | `/language ui zh-CN` |
| → `output [language]` | LLM の出力言語を設定する | `/language output Chinese` |

- 利用可能な組み込み UI 言語: `zh-CN` (簡体字中国語)、`en-US` (英語)、`ru-RU` (ロシア語)、`de-DE` (ドイツ語)、`ja-JP` (日本語)、`pt-BR` (ポルトガル語 - ブラジル)、`fr-FR` (フランス語)、`ca-ES` (カタルーニャ語)
- 出力言語の例: `Chinese`, `English`, `Japanese` など。

### 1.4 ツールとモデルの管理

AI ツールとモデルを管理するためのコマンド。

| コマンド | 説明 | 使用例 |
| --------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `/mcp` | 設定済みのMCPサーバーとツールを一覧表示する | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema` |
| `/import-config` | Claudeの設定からMCPサーバーをインポートする | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools` | 現在利用可能なツールのリストを表示する | `/tools`, `/tools desc` |
| `/skills` | Skillsパネルを開き、スキルの閲覧、検索、切り替え、起動を行う | `/skills`, `/<skill-name>` |
| `/learn` | ファイル、ディレクトリ、URL、動画、またはテキストから再利用可能なプロジェクトスキルを作成する | `/learn https://docs.example.com/api`, `/learn ./tutorial.mp4 focus on deployment` |
| `/curator` | 非アクティブなプロジェクトの自動スキルを検査、ピン留め、アーカイブ、または復元する | `/curator`, `/curator run --dry-run`, `/curator pin <directory>`, `/curator restore <directory>` |
| `/plan` | プランモードに切り替えるか、プランモードを終了する | `/plan`, `/plan <task>`, `/plan exit` |
| `/approval-mode` | ツール承認モードを変更する (現在のセッションのみ) | `/approval-mode`, `/approval-mode auto-edit` |
| → `plan` | 分析のみ、実行なし (安全なレビュー) | `/approval-mode plan` |
| → `default` | 編集に対して承認を要求する (日常使用) | `/approval-mode default` |
| → `auto-edit` | 編集を自動承認する (信頼できる環境) | `/approval-mode auto-edit` |
| → `auto` | 分類器による評価に基づく承認 (自律的) | `/approval-mode auto` |
| → `yolo` | すべてを自動承認する (迅速なプロトタイピング) | `/approval-mode yolo` |
| `/peers` | 保留中のピアメッセージを確認する; 信頼できるコントローラーを管理する | `/peers`, `/peers accept <id>`, `/peers deny all`, `/peers controllers`, `/peers revoke <id>` |
| `/model` | 現在のセッションで使用されるモデルを切り替える | `/model`, `/model <model-id>` (即時切り替え) |
| `/model --fast` | プロンプトサジェスト用の軽量なモデルを設定する | `/model --fast qwen3-coder-flash` |
| `/model --voice` | 音声文字起こしに使用されるモデルを設定する | `/model --voice <model-id>` |
| `/model --vision` | テキスト専用メインモデル向けに画像を文字起こしするために使用されるビジョンブリッジモデルを設定する | `/model --vision <model-id>` |
| `/model --compaction` | チャット圧縮に使用されるモデルを設定する | `/model --compaction <model-id>`, `/model --compaction clear` |
| `/model --image` | 組み込み画像生成ツール用に画像生成対応モデルを設定する | `/model --image <model-id>` |
| `/effort` | 思考対応モデルの推論負荷を設定する | `/effort` (ピッカーを開く), `/effort high` (low/medium/high/xhigh/max; プロバイダーごとにマッピングおよびクランプ) |
| `/output-style` | 応答の書き方を形作る出力スタイルを選択する | `/output-style` (ピッカーを開く), `/output-style Concise`, `/output-style default` (スタイルなし) |
| `/extensions` | 拡張機能を管理する | `/extensions list`, `/extensions manage` |
| → `list` | インストール済み拡張機能を一覧表示する | `/extensions list` |
| → `manage` | インストール済み拡張機能を管理する (インタラクティブ) | `/extensions manage` |
| → `explore` | ブラウザで拡張機能ページを開く | `/extensions explore <Gemini\|ClaudeCode>` |
| → `install` | gitリポジトリまたはパスから拡張機能をインストールする | `/extensions install <repo-or-path>` |
| `/memory` | メモリーマネージャーダイアログを開く | `/memory` |
| `/remember` | 永続的なメモリーを保存する | `/remember Prefer terse responses` |
| `/forget` | 自動メモリーから一致するエントリを削除する | `/forget <query>` |
| `/dream` | 自動メモリーの統合を手動で実行する | `/dream` |
| `/hooks` | Qwen Codeフックを管理する | `/hooks`, `/hooks list` |
| `/reload-plugins` | ディスクから拡張機能の変更点 (コマンド、スキル、エージェント、ワークフロー、フック、MCP/LSPサーバー) を再読み込みする | `/reload-plugins` |
| `/permissions` | 権限ルールを管理する | `/permissions` |
| `/agents` | サブエージェントを管理する | `/agents manage`, `/agents create` |
| `/arena` | Arenaセッションを管理する | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (エイリアス `choose`) |
| `/goal` | Goalを設定 — バリデーターターが確認するまで作業を継続する ([Goals](./goals.md)を参照) | `/goal <objective>`, `/goal edit <objective>`, `/goal pause`, `/goal resume`, `/goal clear` |
| `/tasks` | バックグラウンドタスクを一覧表示する | `/tasks` |
| `/workflows` | ワークフローの実行を検査する; バックグラウンド実行を協調的に一時停止/再開する | `/workflows`, `/workflows <runId>`, `/workflows p <runId>` |
| `/lsp` | LSPサーバーの状態を表示する | `/lsp` |
| `/trust` | フォルダー信頼設定を管理する | `/trust` |

> [!warning]
>
> 信頼できるソースからのみ拡張機能 (`/extensions install`) をインストールしてください。拡張機能にはMCPサーバー、スキル、およびQwen Code自体と同じ権限で実行されるコマンドが含まれる場合があります。これらはファイル、APIキー、会話データにアクセスできます。また、ワークフロースクリプトも同梱されており、これはワークフローサンドボックス内で直接ファイルやシェルへのアクセスなしに実行され、開始するサブエージェントを通じて動作し、Workflowツールの承認を経由します。`/extensions install` は確認のプロンプトを表示しません。

> [!warning]
>
> `auto-edit`、`auto`、`yolo` 承認モードは、ツール実行の承認プロンプトをバイパスします。`yolo` モードでは、シェルコマンド、ファイル書き込み、ネットワークリクエストを含むすべてのアクションが確認なしに実行されます。これらのモードは、信頼された、サンドボックス化された、または使い捨ての環境でのみ使用してください。

> [!note]
>
> `/workflows`、`/lsp`、`/trust` は、それぞれの機能が有効な場合にのみ登録されます。具体的には、ユーザー/システムスコープの `tools.workflowsEnabled` 設定または `QWEN_CODE_ENABLE_WORKFLOWS=1` 環境変数、`--experimental-lsp` CLI フラグ、および `security.folderTrust.enabled` 設定でそれぞれ有効化されます。`tools.workflowsEnabled` のワークスペース値は無視されます。無効な場合、これらのコマンドは表示されず、不明なコマンドとして報告されます。同様に、`/dream` と `/forget` は管理された自動メモリが利用可能な場合にのみ登録されます。利用できない場合、これらは表示されません。

> [!note]
>
> インストール済み拡張機能のスキルもスラッシュコマンドであり、その名前に所有者が含まれます: `/rust:pdf` であり `/pdf` ではありません。裸の形式はエイリアスではありません — 他のスキルが `pdf` という名前である場合、`/pdf` はそのスキルを実行します。`slashCommands.disabled` はどちらの綴りでもそのようなコマンドをゲートするため、名前に所有者が含まれる以前に書かれたエントリでも有効です。[How extension Skills are named](./skills.md#how-extension-skills-are-named) を参照してください。

### 1.5 組み込みスキル

これらのコマンドは、特殊なワークフローを提供するバンドルされたスキルを呼び出します。

| コマンド | 説明 | 使用例 |
| ------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/review` | マルチエージェントコードレビュー (高負荷での12並列エージェント) | `/review`, `/review 123`, `/review 123 --comment`, `/review --effort low` |
| `/coordinate` | 読み取り専用ワーカーと任意のワークツリー書き込みを調整する | `/coordinate investigate and fix the authentication regression` |
| `/loop` | プロンプトを定期スケジュールで実行する | `/loop 5m check the build` |
| `/goal-draft` | あいまいな意図を検証可能な`/goal`目標に変換する | `/goal-draft make the auth tests pass` |
| `/autofix-pr` | PRを監視し、CI、レビューフィードバック、コンフリクトを修正する | `/autofix-pr 123`, `/autofix-pr 123 --once`, `/autofix-pr resume`, `/autofix-pr stop 123` |
| `/simplify` | 最近の変更を確認し、安全なクリーンアップ編集を直接適用する | `/simplify`, `/simplify focus on duplication` |
| `/qc-helper` | Qwen Codeの使用法と設定に関する質問に回答する | `/qc-helper how do I configure MCP?` |

完全な`/review`ドキュメントについては[Code Review](./code-review.md)を、`/autofix-pr`については[Autofix a Pull Request](./autofix-pr.md)を参照してください。

### 1.6 サイドクエスチョン (`/btw`)

`/btw` コマンドを使用すると、メインの会話フローを中断したり影響を与えたりすることなく、簡単なサイドクエスチョン（脇道に逸れた質問）を行うことができます。

| コマンド               | 説明                                  |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | 簡単なサイドクエスチョンを行う        |
| `?btw <your question>` | サイドクエスチョンの代替構文          |

**動作の仕組み:**

- サイドクエスチョンは、最近の会話コンテキスト（最大20メッセージまで）を含む別の API コールとして送信されます。
- 応答は Composer の上に表示されます。待機中も入力を続けることができます。
- メインの会話は**ブロックされません**。独立して継続されます。
- サイドクエスチョンの応答は、メインの会話履歴の一部には**なりません**。
- 回答は完全な Markdown サポート（コードブロック、リスト、テーブルなど）付きでレンダリングされます。

**キーボードショートカット（インタラクティブモード）:**

| ショートカット       | 動作                                                |
| -------------------- | --------------------------------------------------- |
| `Escape`             | キャンセル（ロード中）または閉じる（完了後）        |
| `Space` または `Enter` | 回答を閉じる（入力が空の場合）                    |
| `Ctrl+C` または `Ctrl+D` | 実行中のサイドクエスチョンをキャンセルする      |

**例:**

```
(While the main conversation is about refactoring code)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > (Composer remains active — keep typing)

(After the answer arrives)

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ `let` is block-scoped, while `var` is    │
  │ function-scoped. `let` was introduced    │
  │ in ES6 and doesn't hoist the same way.   │
  │                                          │
  │ Press Space, Enter, or Escape to dismiss │
  ╰──────────────────────────────────────────╯
  > (Composer still active)
```

**サポートされる実行モード:**

| モード | 動作 |
| -------------------- | -------------------------------------------- |
| インタラクティブ | Composerの上に表示され、Markdownレンダリングを行う |
| Non-interactive      | テキスト結果を返す: `btw> question\nanswer`  |
| ACP (Agent Protocol) | stream_messages非同期ジェネレーターを返す |

> [!tip]
>
> メインのタスクから逸れることなく簡単な回答が必要な場合は `/btw` を使用してください。概念の明確化、事実の確認、または主要なワークフローに集中したまま簡単な説明を得る場合に特に便利です。

### 1.7 セカンドオピニオン (`/advisor`) [#17-second-opinion-advisor]

`/advisor` コマンドは、これまでの会話の独立した読み取り専用のレビューを実行し、構造化されたセカンドオピニオンを返します。タスクを実行したり、メインの会話を中断したりすることはありません。

| コマンド | 説明 |
| ------------------ | -------------------------------------- |
| `/advisor` | 上記の会話をレビューする |
| `/advisor <focus>` | レビューを特定の懸念事項に集中させる |

**動作の仕組み:**

- レビューは、最近の会話コンテキスト（最大40メッセージ）を含む、独立した単一ターンのAPIコールとして送信されます
- レビュアーモデルは**ツールを実行できません** — ツールはリストレベルで削除されます（`/btw` と同じメカニズム）。そのため、レビューがコードを書いたりコマンドを実行したりすることはありません。すべての主張は表示されているトランスクリプトに根ざしている必要があります
- メインの会話は**中断されません**。レビューはあなたにのみ表示されます
- レビューは、`/advisor · <model>` ヘッダーの下に4つの固定セクション — **Verdict**、**Risks**、**Missing evidence**、**Recommendation** — を持つ枠付きMarkdownブロックとしてレンダリングされます。ヘッダーには解決されたレビュアーモデル名が表示されます
- `/btw` と異なり、fire-and-forgetでセッションを使用可能な状態に保つのではなく、`/advisor` はレビューが返るまで入力をブロックします。フルコンテキストウィンドウで強力なレビュアーを使用する場合、数十秒かかることがあります
- デフォルトではメインモデルが使用されます。[`advisorModel`](../configuration/settings.md#advisormodel) を設定すると、レビューを別の（通常はより強力な）モデルにルーティングできます。最近のトランスクリプトは、別のプロバイダーを使用する場合でもそのモデルに送信されます

**例:**

```
> /advisor is my fix for the null check actually correct?

  Consulting advisor...

  ╭──────────────────────────────────────────────────────╮
  │ /advisor · qwen3-max                                 │
  │                                                      │
  │ Verdict                                              │
  │ The approach is sound, but the edge case at line 42  │
  │ is unverified.                                       │
  │                                                      │
  │ Risks                                                │
  │  - The fix assumes the config is always loaded; a    │
  │    startup race could leave it null.                 │
  │                                                      │
  │ Missing evidence                                     │
  │  - No test exercises the null-config path in the     │
  │    visible transcript.                               │
  │                                                      │
  │ Recommendation                                       │
  │ Add a focused unit test for the null-config branch   │
  │ before merging.                                      │
  ╰──────────────────────────────────────────────────────╯
```

レビューは、解決されたレビュアーモデル名をヘッダーに持つ枠付きボックスでレンダリングされます。不明な `advisorModel` は事前には検証されません。プロバイダーが拒否した場合、`/advisor` は失敗を報告するため、モデル名を確認してください。解決できないエイリアスセレクター（例: fast モデルが設定されていない場合の `fast`）のみ、メインモデルにフォールバックします。アドバイザーリクエストは設定されたモデルフォールバックを使用しません。

**サポートされる実行モード:**

| モード | 動作 |
| -------------------- | --------------------------------------------------- |
| Interactive | 会話内に4セクションのレビューをレンダリング |
| ACP (Agent Protocol) | レビューをメッセージ結果として返す |

> [!tip]
>
> 方向を決定する前にセカンドオピニオンを得るには `/advisor` を使用してください。誤った仮定、未検証の主張、またはリスクのある次のステップを捕捉するのに特に便利です。`advisorModel` を設定すると、メインの会話を駆動するモデルとは異なるモデルからレビューを取得できます。

> [!note]
>
> `advisorModel` は設定でのみ設定されます。`fastModel` や `visionModel` と異なり、まだ `/model` フラグの対応物はありません。

### 1.8 セッションリキャップ (`/recap`)

`/recap`コマンドは、現在のセッションの「どこまで進んだか」を示す短い要約を生成します。これにより、履歴をスクロールせずに古い会話を再開できます。

| コマンド | 説明 |
| -------- | ------------------------------------------ |
| `/recap` | 1行のセッションリキャップを生成して表示する |

**動作の仕組み:**

- 設定済みの高速モデル（`fastModel`設定）が利用可能な場合はそれを使用し、そうでない場合はメインのセッションモデルにフォールバックします。振り返りには小さく安価なモデルで十分です。
- 直近の会話（最大30メッセージ、テキストのみ — ツール呼び出しとツール応答は除外されます）が、厳密なシステムプロンプトとともにモデルに送信されます。
- 要約は暗い色調で表示され、`❯`プレフィックスが付与されるため、実際のアシスタント返信と区別しやすくなります。
- モデルのターンが実行中または他のコマンドが処理中の場合、インラインエラーで拒否されます。使用可能な会話がない場合や、基盤となる生成が失敗した場合は、要約の代わりに`/recap`が短い情報メッセージを表示します — 手動コマンドは何らかの応答を必ず返します。

**離席からの復帰時の自動トリガー:**

ターミナルが**5分以上**フォーカスアウトされて再びフォーカスされると、要約が自動的に生成・表示されます（モデル応答が進行中でない場合のみ。進行中の場合は現在のターンが完了するのを待ってから実行されます）。手動コマンドとは異なり、自動トリガーは失敗時に完全にサイレントです：生成がエラーになったり要約すべき内容がない場合、履歴にメッセージは追加されません。`general.showSessionRecap`設定（デフォルト: `false`）で制御されます。手動`/recap`コマンドはこの設定に関係なく常に動作します。

**例:**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> `/model --fast <model>`（例: `qwen3-coder-flash`）で高速モデルを設定して、`/recap`を高速かつ低コストにします。`general.showSessionRecap`を`true`に設定して自動トリガーを有効にします。手動`/recap`コマンドはこの設定に関係なく常に動作します。

### 1.9 Diff ビューア (`/diff`)

`/diff` コマンドは、未コミットの変更とターンごとの diff を表示するインタラクティブな diff ビューアを開きます。←/→ で現在の git diff と個々の会話ターンの間を切り替え、↑/↓ でファイルを閲覧し、Enter でインライン diff を表示します。

**動作の仕組み:**

インタラクティブモードでは、`/diff` は上部に**ソースピッカー**を持つダイアログを開きます。

- **Current** — ワーキングツリーと HEAD の比較（`git diff HEAD`）。ステージング済み、ステージング解除済み、未追跡ファイルを含む、すべての未コミットの変更を表示します。
- **T1, T2, T3, …** — ターンごとの diff。ファイルを変更したモデルターンごとに1つのタブがあります。最新のターンが最初に表示されます。各タブには、コンテキストとして元のプロンプトのプレビューが表示されます。

ファイルリストには、ファイルごとの統計情報（追加/削除された行数）と、特別な状態（`new`、`deleted`、`untracked`、`binary`、`truncated`、`oversized`）のタグが表示されます。ファイル上で Enter を押すと、構文ハイライトされた hunk でインライン diff を表示します。

ターンごとの diff にはファイルチェックポイントが有効になっている必要があります（インタラクティブモードではデフォルトでオン）。ファイルチェックポイントがオフの場合、「Current」ソースのみが利用可能です。

**キーボードショートカット:**

| キー      | 動作                                        |
| --------- | ------------------------------------------- |
| `←` / `→` | ソース間を切り替える（Current / T1 / T2…）  |
| `↑` / `↓` | ファイルリストをナビゲートする              |
| `j` / `k` | ファイルリストをナビゲートする（vim スタイル） |
| Enter     | 選択したファイルのインライン diff を表示する  |
| `←` / Esc | インライン diff 表示からファイルリストに戻る |
| Esc | ダイアログを閉じる |

**例:**

```
┌ /diff · Turn 3 "refactor the auth middleware" ──── 3 files +45 -12 ┐
│                                                                     │
│ ◀ Current · T3 · T2 · T1 ▶                                         │
│                                                                     │
│ › src/utils/parser.ts                              +30 -8           │
│   src/utils/parser.test.ts                         +12 -2           │
│   README.md                                        +3 -2            │
│                                                                     │
│ ←/→ source · ↑/↓ file · Enter view · Esc close                     │
└─────────────────────────────────────────────────────────────────────┘
```

**非インタラクティブモード:**

ヘッドレス（`--prompt`）または非インタラクティブなコンテキストでは、`/diff` はワーキングツリーと HEAD の比較のプレーンテキストサマリーを出力します。ターンごとのナビゲーションは利用できません。

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

**Web Shell:** Web Shell UI（`qwen serve`）では、`/diff` はグラフィカルな diff ダイアログを開きます。上部のタブバーで**Changes** ビューと**History** ビュー（`/log`）を切り替えることができます。

#### History Viewer (`/log`) — Web Shell のみ

`/log` コマンドは、現在のワークスペースのコミット履歴ブラウザを開きます。Web Shell UI でのみ利用可能で、CLI/TUI にはこのコマンドはありません。

**動作の仕組み:**

`/log` はコミットを時系列の逆順（新しい順）で一覧表示するダイアログを開きます。各行には以下が表示されます。

- 短い SHA（モノスペース、フル SHA のコピーボタン付き）
- コミット件名（1行）
- 作成者名と相対時間（例: 「2h ago」）
- ブランチ/タグの参照ラベル（存在する場合）
- マージコミットのマージアイコン（⎇）

コミット行をクリックすると、詳細がオンデマンドで展開されます。

- 完全なコミットメッセージ本文
- ファイル変更統計（変更ファイル数、追加/削除行数、ファイルごとの内訳）

下部の**Load more**を使用して、次のページ（50件/ページ）のコミットを取得します。

**例:**

```
┌─ History ──────────────────────────── 50 commits ─ ✕ ┐
│                                                       │
│  a1b2c3d  feat(cli): add --json flag        2h ago   │
│           wenshao                                    │
│                                                       │
│  e4f5g6h  fix(core): handle null config     5h ago   │
│           dev · main  v1.2.0                         │
│                                                       │
│ ▼ 789abcd  refactor: simplify parser        1d ago   │
│   ┌─────────────────────────────────────────────┐    │
│   │  Broke the monolithic parse() into smaller  │    │
│   │  functions for readability.                 │    │
│   │                                             │    │
│   │  3 files · +45 −12                          │    │
│   │   +30 −8   src/parser.ts                    │    │
│   │   +10 −2   src/utils.ts                     │    │
│   │   +5  −2   test/parser.test.ts              │    │
│   └─────────────────────────────────────────────┘    │
│                                                       │
│              [ Load more ]                            │
└───────────────────────────────────────────────────────┘
```

> [!note]
>
> `/log` には git リポジトリのワークスペースが必要です。ワークスペースが git リポジトリでない場合、またはコミットが存在しない場合、ダイアログにはプレースホルダーメッセージが表示されます。

### 1.10 情報、設定、およびヘルプ

情報の取得およびシステム設定の実行を行うコマンドです。

| コマンド         | 説明                                                                                                                           | 使用例                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/help`          | 利用可能なコマンドのヘルプ情報を表示する                                                                                       | `/help` または `/?`                                                                 |
| `/status`        | バージョン情報を表示する                                                                                                       | `/status` または `/about`                                                           |
| `/status paths`  | 現在のセッションファイルとログのパスを表示する                                                                                 | `/status paths`                                                                     |
| `/stats`         | インタラクティブな使用統計ダッシュボードを開く（Session、Activity、Efficiency タブ）                                           | `/stats` または `/usage`                                                            |
| `/stats model`   | モデルごとのトークン内訳と推定コストを表示する                                                                                 | `/stats model`                                                                      |
| `/stats tools`   | ツールごとの呼び出し回数を表示する                                                                                             | `/stats tools`                                                                      |
| `/stats skills`  | 現在のライブセッションの skill ごとの呼び出し回数を表示する（ライブのみ。クロスセッションのデイリー/マンスリーアクティビティは除く） | `/stats skills`                                                                     |
| `/stats daily`   | 日次のトークン使用統計を表示する                                                                                               | `/stats daily`（エイリアス `day`）、`/stats day [YYYY-MM-DD]`                       |
| `/stats monthly` | 月次のトークン使用統計を表示する                                                                                               | `/stats monthly`（エイリアス `month`）、`/stats month [YYYY-MM]`                    |
| `/stats export`  | 使用統計を CSV または JSON にエクスポートする                                                                                  | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]` |
| `/settings`      | 設定エディタを開く                                                                                                             | `/settings`                                                                         |
| `/config`        | ドットパスキーで任意の設定を取得または設定する（ユーザー設定に書き込み）                                                       | `/config`（すべてリスト）、`/config <key>`、`/config <key>=<value>`                 |
| `/auth`          | 認証方法を変更する                                                                                                             | `/auth`、`/connect`、`/login`                                                       |
| `/logout` | アクティブなQwen Subscriptionアカウントからサインアウトする（Qwen Subscriptionログイン時に利用可能） | `/logout` |
| `/upgrade` | Qwenサブスクリプションプランを開く（Qwen Subscriptionログイン時に利用可能） | `/upgrade` |
| `/doctor`        | インストールと環境の診断を実行する                                                                                             | `/doctor`、`/doctor memory`                                                         |
| → `memory`       | 現在のプロセスのメモリ診断を表示する                                                                                           | `/doctor memory [--json] [--sample] [--snapshot]`                                   |
| → `cpu-profile`  | Chrome DevTools 分析用の CPU プロファイルを記録する                                                                            | `/doctor cpu-profile [--duration <seconds>]`                                        |
| → `rollback`     | スタンドアロン CLI バイナリを前のバージョンにロールバックする（スタンドアロンインストールのみ。会話履歴には `/rewind` を使用） | `/doctor rollback`                                                                  |
| `/docs`          | ブラウザで Qwen Code の完全なドキュメントを開く                                                                                | `/docs`                                                                             |
| `/ide`           | IDE 統合を管理する                                                                                                             | `/ide status`、`/ide install`、`/ide enable`、`/ide disable`                        |
| `/insight`       | チャット履歴からプログラミングのインサイトを生成する                                                                           | `/insight`                                                                          |
| `/setup-github`  | GitHub Actions をセットアップする                                                                                              | `/setup-github`                                                                     |
| `/bug`           | Qwen Code に関する問題を報告する                                                                                               | `/bug Button click unresponsive`                                                    |
| `/copy`          | クリップボードにコピー: 返信（N番目の最後）、コード（言語別）、LaTeX、または Mermaid                                           | `/copy`、`/copy 2`、`/copy python`、`/copy latex`、`/copy mermaid`                  |
| `/quit`          | Qwen Code を即座に終了する                                                                                                     | `/quit` または `/exit`                                                              |

> [!warning]
>
> `/doctor memory --snapshot` は V8 ヒープスナップショットを書き出します。これには現在のセッションのプロンプト、ファイルの内容、API キー、ツール結果が含まれている可能性があります。共有する前にファイルを必ず確認してください。

> [!note]
>
> `/config`はドットパスキー（例: `general.vimMode`）を使用して個々の設定を読み書きし、インタラクティブな`/settings`エディターを補完します。引数なしで`/config`を実行すると（または`--help`）、すべての設定可能なキーとその型および現在の値が一覧表示されます。`/config <key>`は現在の値を表示しますが、ブールキーの場合は値を切り替えます。`/config <key>=<value>`は値を設定します。変更はユーザー設定（`~/.qwen/settings.json`）に書き込まれます。この方法で変更できるのは`boolean`、`string`、`number`、および`enum`の設定のみです。`array`および`object`の設定は`settings.json`で直接編集する必要があります。機密性の高い値（APIキー、トークン、ベースURL）は出力でマスクされ、`tools.approvalMode`を`yolo`に設定することはブロックされます。

### 1.11 一般的なショートカット

| ショートカット       | 機能                    | 備考                                                                      |
| ------------------ | ----------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | 画面のクリア            | 表示されている画面のみをクリアします（`/clear` のようにセッションはリセットされません） |
| `Ctrl/cmd+T`       | ツール説明の切り替え    | MCP ツール管理                                                            |
| `Ctrl/cmd+C`×2     | 終了確認                | セキュアな終了機構                                                        |
| `Ctrl/cmd+Z`       | 入力の取り消し          | テキスト編集                                                              |
| `Ctrl/cmd+Shift+Z` | 入力のやり直し          | テキスト編集                                                              |

### 1.12 認証コマンド

Qwen Code セッション内で `/auth` を使用して認証を設定します。現在の認証と環境のステータスを確認するには `/doctor` を使用します。

| コマンド    | 説明                                                                 |
| --------- | ---------------------------------------------------------------------- |
| `/auth`   | 認証を対話形式で設定します（エイリアス: `/connect`, `/login`）         |
| `/doctor` | 認証と環境のチェックを表示します                                       |

> [!note]
>
> 単独の `qwen auth` CLI コマンドは削除されました。`qwen auth status` などのレガシーな呼び出しは、削除通知と移行ガイドとともに表示されます。詳細は [Authentication](../configuration/auth) ページを参照してください。

## 2. @ コマンド（ファイルの導入）

@ コマンドは、ローカルファイルやディレクトリの内容を会話に素早く追加するために使用します。

| コマンド形式        | 説明                                     | 例                                             |
| ------------------- | ---------------------------------------- | ---------------------------------------------- |
| `@<file path>`      | 指定されたファイルの内容を注入します     | `@src/main.py Please explain this code`        |
| `@<directory path>` | ディレクトリ内のすべてのテキストファイルを再帰的に読み込みます | `@docs/ Summarize content of this document`    |
| 単独の `@`          | `@` 記号自体について議論する際に使用します | `@ What is this symbol used for in programming?` |

注: パス内のスペースはバックスラッシュでエスケープする必要があります（例: `@My\ Documents/file.txt`）

インタラクティブプロンプトでは、`@`補完がUnicodeファイル名（絵文字を含む）をサポートしています。プロンプト内の他の場所にある絵文字は、補完に使用されるファイルパスを変更しません。

## 3. 感嘆符コマンド（`!`） - シェルコマンドの実行

感嘆符コマンドを使用すると、Qwen Code 内で直接システムコマンドを実行できます。

| コマンド形式       | 説明                                                         | 例                                   |
| ------------------ | ------------------------------------------------------------ | ------------------------------------ |
| `!<shell command>` | サブシェルでコマンドを実行します                             | `!ls -la`, `!git status`             |
| 単独の `!`         | シェルモードに切り替え、入力されたものはすべてシェルコマンドとして直接実行されます | `!`(Enter) → コマンド入力 → `!`(終了) |

環境変数: `!` を介して実行されるコマンドには、`QWEN_CODE=1` 環境変数が設定されます。

## 4. カスタムコマンド [#4-custom-commands]

頻繁に使用するプロンプトをショートカットコマンドとして保存し、作業効率と一貫性を向上させます。

> [!note]
>
> カスタムコマンドは現在、オプションの YAML フロントマターを持つ Markdown 形式を使用します。TOML 形式は非推奨ですが、後方互換性のために引き続きサポートされています。TOML ファイルが検出されると、自動移行プロンプトが表示されます。

### 概要

| 機能             | 説明                                     | 利点                               | 優先度 | 適用シナリオ                                 |
| ---------------- | ---------------------------------------- | ---------------------------------- | ------ | -------------------------------------------- |
| 名前空間         | サブディレクトリがコロン区切りのコマンドを作成します | コマンドの整理が容易               |        |                                              |
| グローバルコマンド | `~/.qwen/commands/`                    | すべてのプロジェクトで利用可能     | 低     | 個人で頻繁に使用するコマンド、プロジェクト横断での使用 |
| プロジェクトコマンド | `<project root directory>/.qwen/commands/` | プロジェクト固有でバージョン管理可能 | 高     | チームでの共有、プロジェクト固有のコマンド   |

優先順位ルール: プロジェクトコマンド > ユーザーコマンド（名前が同じ場合はプロジェクトコマンドが使用されます）

### コマンドの命名規則

#### ファイルパスからコマンド名へのマッピングテーブル

| ファイルの場所                         | 生成されるコマンド | 呼び出し例            |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Parameter`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Message` |

命名規則: パス区切り文字（`/` または `\`）はコロン（`:`）に変換されます。

### Markdownファイル形式仕様（推奨）

カスタムコマンドは、オプションのYAMLフロントマター付きのMarkdownファイルを使用します:

```markdown
---
description: Optional description (displayed in /help)
---

Your prompt content here.
Use {{args}} for parameter injection.
```

| フィールド      | 必須 | 説明                               | 例                                       |
| ------------- | ---- | ---------------------------------- | ---------------------------------------- |
| `description` | 任意 | コマンドの説明（/help に表示されます） | `description: Code analysis tool`        |
| プロンプト本文 | 必須 | モデルに送信されるプロンプトの内容   | フロントマターの後の任意の Markdown 内容 |

### TOML ファイル形式（非推奨）

> [!warning]
>
> **非推奨:** TOML 形式は引き続きサポートされていますが、将来のバージョンで削除される予定です。Markdown 形式に移行してください。

| フィールド      | 必須 | 説明                               | 例                                       |
| ------------- | ---- | ---------------------------------- | ---------------------------------------- |
| `prompt`      | 必須 | モデルに送信されるプロンプトの内容   | `prompt = "Please analyze code: {{args}}"` |
| `description` | 任意 | コマンドの説明（/help に表示されます） | `description = "Code analysis tool"`     |

### パラメータ処理メカニズム

| 処理方法                   | 構文               | 適用シナリオ                   | セキュリティ機能                       |
| -------------------------- | ------------------ | ------------------------------ | -------------------------------------- |
| コンテキスト認識注入       | `{{args}}`         | 正確なパラメータ制御が必要な場合 | 自動シェルエスケープ                   |
| デフォルトパラメータ処理   | 特別なマークなし   | シンプルなコマンド、パラメータの追記 | そのまま追記                           |
| シェルコマンド注入         | `!{command}`       | 動的な内容が必要な場合         | 実行前に確認が必要                     |

#### 1. コンテキスト認識注入（`{{args}}`）

| シナリオ           | TOML 設定                             | 呼び出し方法          | 実際の効果             |
| ------------------ | ------------------------------------- | --------------------- | ---------------------- |
| 生注入             | `prompt = "Fix: {{args}}"`            | `/fix "Button issue"` | `Fix: "Button issue"`  |
| シェルコマンド内   | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | `grep "hello" .` を実行 |

#### 2. デフォルトパラメータ処理

| 入力状況       | 処理方法                                     | 例                                         |
| -------------- | -------------------------------------------- | ------------------------------------------ |
| パラメータあり | プロンプトの末尾に追記（2つの改行で区切り）  | `/cmd parameter` → 元のプロンプト + パラメータ |
| パラメータなし | プロンプトをそのまま送信                     | `/cmd` → 元のプロンプト                    |

🚀 動的コンテンツ注入

| 注入タイプ         | 構文           | 処理順序          | 目的                             |
| ------------------ | -------------- | ----------------- | -------------------------------- |
| ファイル内容       | `@{file path}` | 最初に処理        | 静的な参照ファイルを注入         |
| シェルコマンド     | `!{command}`   | 中間で処理        | 動的な実行結果を注入             |
| パラメータ置換     | `{{args}}`     | 最後に処理        | ユーザーパラメータを注入         |

#### 3. シェルコマンドの実行（`!{...}`）

| 操作 | ユーザーインタラクション |
| ------------------------------- | -------------------- |
| 1. コマンドとパラメータの解析 | - |
| 2. Shellのエスケープ自動処理 | - |
| 3. 確認ダイアログの表示 | ✅ ユーザーの確認 |
| 4. コマンドの実行 | - |
| 5. 出力のプロンプトへの注入 | - |

例: Gitコミットメッセージ生成

````markdown
---
description: Generate Commit message based on staged changes
---

Please generate a Commit message based on the following diff:

```diff
!{git diff --staged}
```
````

#### 4. ファイル内容の注入（`@{...}`）

| ファイルタイプ | サポート状況 | 処理方法 |
| ------------ | ---------------------- | --------------------------- |
| テキストファイル | ✅ 完全サポート | コンテンツを直接注入 |
| 画像/PDF | ✅ マルチモーダルサポート | エンコードして注入 |
| バイナリファイル | ⚠️ 限定的サポート | スキップまたは切り詰められる可能性があります |
| ディレクトリ | ✅ 再帰的注入 | .gitignoreルールに従う |

例: コードレビューコマンド

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### 実用的な作成例

#### 「純関数リファクタリング」コマンド作成手順表

| 操作 | コマンド/コード |
| ----------------------------- | ----------------------------------------- |
| 1. ディレクトリ構造の作成 | `mkdir -p ~/.qwen/commands/refactor`    |
| 2. コマンドファイルの作成 | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. コマンド内容の編集     | 以下の完全なコードを参照してください。  |
| 4. コマンドのテスト       | `@file.js` → `/refactor:pure`           |

```markdown
---
description: Refactor code to pure function
---

Please analyze code in current context, refactor to pure function.
Requirements:

1. Provide refactored code
2. Explain key changes and pure function characteristic implementation
3. Maintain function unchanged
```

### カスタムコマンドベストプラクティスまとめ

#### コマンド設計推奨事項表

| 実践ポイント | 推奨アプローチ | 避けるべきこと |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| コマンド命名 | 整理のために名前空間を使用する | 過度に汎用的な名前は避ける |
| パラメータ処理     | `{{args}}` を明確に使用する         | デフォルトの追記に依存する（混乱しやすい） |
| エラーハンドリング | Shellのエラー出力を活用する | 実行失敗を無視しない |
| ファイル構成 | 機能別にディレクトリで整理する | すべてのコマンドをルートディレクトリに置かない |
| 説明フィールド | 明確な説明を常に提供する | 自動生成の説明に依存しない |

#### セキュリティ機能リマインダー表

| セキュリティメカニズム | 保護効果 | ユーザー操作 |
| ---------------------- | -------------------------- | ---------------------- |
| シェルエスケープ | コマンドインジェクションの防止 | 自動処理 |
| 実行確認 | 誤った実行の回避 | ダイアログでの確認 |
| エラーレポート | 問題の診断支援 | エラー情報の表示 |

## 5. CLI サブコマンド

これらのコマンドは、インタラクティブセッションを開始する前に、シェルから `qwen <subcommand>` として実行されます。

### セッション管理

| コマンド | 説明 | 使用例 |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `qwen sessions list` | 最近の会話セッションの一覧表示 | `qwen sessions list`, `qwen sessions list --json --limit 50` |
| `qwen sessions ps` | 現在実行中のインタラクティブセッションの一覧表示 | `qwen sessions ps`, `qwen sessions ps --json` |
| `qwen sessions controllers` | 信頼されたコントローラートークンを管理する | `qwen sessions controllers add --label <name>`, `qwen sessions controllers list` |

#### `qwen sessions list`

メタデータを含む最近の Qwen Code セッションを一覧表示します。

**フラグ:**

| フラグ | 型 | デフォルト | 説明 |
| --------- | ------- | ------- | ----------------------------------------------- |
| `--json` | boolean | `false` | JSON Lines として出力（1行に1つのJSONオブジェクト） |
| `--limit` | number | `20` | 表示するセッションの最大数 |

**人間が読みやすい出力（デフォルト）:**

以下の列を持つテーブル: SESSION ID, STARTED (UTC タイムスタンプ), TITLE, BRANCH, PROMPT.

**JSON 出力 (`--json`):**

stdout に JSON Lines を出力します。各行は以下のフィールドを持つ JSON オブジェクトです。

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

「これ以降にセッションがある」ことを示すヒントは stderr に出力されるため、`jq` にパイプしても安全です。

**例:**

```bash
# Show last 20 sessions (default)
qwen sessions list

# Show last 50 sessions
qwen sessions list --limit 50

# Output as JSON for scripting
qwen sessions list --json | jq .
```

#### `qwen sessions ps`

このマシンで可視化されているQwen Codeセッションレコードを一覧表示します。`sessions list`は保存されたトランスクリプト（「自分が何に取り組んできたか」）を走査します。このコマンドは、ライブプロセスレジストリと`managed`としてマークされたAgent Viewレコードの両方を表示します。強制終了されたセッションが残したレコードは、検出時にレジストリから削除されます。管理対象レコードは永続的な記録であり、そのワーカーが生きていることの証拠ではありません。ワンショットの`qwen -p`実行は登録されず、表示もされません。

**フラグ:**

| フラグ | 型 | デフォルト | 説明 |
| -------- | ------- | ------- | ----------------------------------------------- |
| `--json` | boolean | `false` | JSON Lines 形式で出力（1行に1つのJSONオブジェクト） |

**人間が読みやすい出力（デフォルト）:**

NAME, KIND, PID, AGE, DIRECTORY の列を持つテーブルです。

KINDはセッションを登録したものを示します — ターミナルでの操作なら`tui`、Qwen Codeセッションではないプログラム（音声フロントエンド、リレーなど）なら`external`、別のプログラムが駆動するセッションなら`headless`または`serve`です。複数の`serve`または`headless`行が同じPIDを共有することがあります。`qwen --acp`の子プロセスはすべてのセッションを1つのプロセス内でホストしており、デーモンが起動した場合`serve`、クライアントが直接駆動している場合`headless`となり、ピアメッセージングがアクティブな場合はそれぞれ個別に登録されます。ホストされたセッションは、自身の環境がベアモードまたはセーフモードにある場合、ここでは登録されません。デーモンの`--bare`は、それがホストするセッションには届きません（`QWEN_CODE_SIMPLE`は子環境から除去されます）。継承された`QWEN_CODE_SAFE_MODE`は届き、これらのホストされたセッションがこの一覧に表示されないようにします。これはNAMEやDIRECTORYと同様の自己申告です。ここにあるすべてのフィールドは、記述対象のプロセスによって書き込まれたものであり、セッションが許可されていることに関する情報は含まれていません。`managed`としてマークされたAgent Viewレコードは、KINDに`managed`、PIDとAGEに`-`を使用します。同じセッションにライブレジストリレコードがある場合でも、それは別の行として残ります。レコード形式や独自プログラムの登録方法については、[Cross-Session Protocol](./cross-session-protocol.md)を参照してください。

**JSON 出力 (`--json`):**

stdoutにJSON Linesを出力し、管理対象レコードを最初に配置します。レジストリレコードは既存の形状を維持します。

```
schemaVersion, pid, procStart, pidNs, sessionId, cwd, name, startedAt,
qwenVersion, kind, ipcPath (when peer messaging is available)
```

管理されたレコードには、ソースに基づくデータのみが含まれます：

```
sessionId, cwd, managed: true
```

stdoutには何も書き込まれません — 空の一覧は何も出力しません — そのため、`qwen sessions ps --json | jq .`はスクリプトから安全に使用できます。スーパーバイザーストアを読み取れない場合でも、レジストリレコードは出力され、理由はstderrに書き込まれます。

JSON出力は生データです。フィールド値は記録されたままの状態で出力され、ターミナル用のサニタイズは行われません。これらをデータとして扱い、ターミナルでレンダリングする前にサニタイズしてください。

**例:**

```bash
# Show the other live sessions
qwen sessions ps

# Which directories have a visible session record?
# Note: `jq -r` renders the raw recorded value in your terminal (see the
# raw-data note above); pipe through a sanitizer if the path is untrusted.
qwen sessions ps --json | jq -r .cwd
```

## 6. 他の実行中セッションへのメッセージ送信 [#6-messaging-another-running-session]

同じマシン上の2つのインタラクティブセッションは互いにメッセージを送受信できます。この機能は**デフォルトで有効**ですが、`--bare`と`--safe-mode`は設定に関係なく無効化します。受信用インボックスがあれば、セッションは同じユーザーの他のセッションから検出可能になり、それらが送る内容はモデルが見る前に以下のレビュールールを経由します。ピア検出とメッセージングを無効にするには、`settings.json`でオフにして再起動してください。

```json
{ "agents": { "crossSessionMessaging": false } }
```

ピアメッセージングが無効なインタラクティブセッションは`qwen sessions ps`に表示される場合がありますが、`ipcPath`を持たず、`list_agents`では到達可能なピアではありません。OpenTUIインターフェースもピアインボックスをバインドしません。設定を有効にするだけでは、メッセージング可能にはなりません。

メッセージングが有効な場合、あるセッション内のモデルは `list_agents` を使用して他のセッションを検出できます。各セッションは `sessions` の下に `name` とともに表示され、これは `qwen sessions ps --json` が記録するものです（テーブルビューでは長い名前が省略される場合があります）。その名前を `to` として `send_message` を使用して特定のセッションに宛先指定します。2つのセッションが同じ名前を共有する場合、`list_agents` はそれぞれに短い `[ref]` を付けて表示し、送信時にはこれを含める必要があります（`name [ref]`）。どちらの意味にもなり得る裸の名前は推測されるのではなく拒否されます。`list_agents` はまた、`self` の下でセッション自身の名前も報告し、`to: "*"` は依然として「自分の Agent Team のチームメイト」を意味し、他のセッションには届きません。

メッセージは、ユーザーからのものではなく、別のセッションからのものであるとマークされて他のセッションに到着し、そこでのあなたの権限は一切持ちません。受信セッションは、独自の許可設定の範囲内でのみそれに対応します。そのユーザーは `agents.crossSessionInbound` （`accept`、`hold`、または `refuse`）を使用して、受信メッセージに対する処理を選択できます。未設定の場合、両方のセッションが同じレビュークラスにある場合にのみメッセージが配信されます。つまり、両方とも各アクションをレビューしている場合（デフォルトまたはプランモード）、または両方ともアクションごとのレビューなしで一部のアクションを適用するモード（auto-edit、auto、または yolo）にある場合です。別のクラスのセッションからのメッセージ、または自分がどのクラスにいるかを示さない送信者からのメッセージは、双方向でレビューのために保留されます。各アクションをレビューするセッションは、レビューしないセッションからのメッセージを保留します。なぜなら、そのメッセージは誰も監視していないモデルによって作成されたものであり、アクションごとのプロンプトはアクションを保護するためのものであって、セッションが何に説得されているかを保護するものではないからです。保留されたメッセージは、受信セッションで `/peers` を使用して一覧表示および解放され、モードの違いのみで保留されたメッセージは、モードが一致すると自動的に解放されます。

リポジトリは、その中で開かれたセッションをより慎重にすることはできますが、より寛容にすることはできません。ワークスペースの `.qwen/settings.json` は、`agents.crossSessionInbound` を `hold` または `refuse` に設定したり、`agents.crossSessionMessaging` を `false` に設定したりでき、その値はユーザー設定内のより緩い値よりも優先されます。オペレーターが設定した値を緩和しようとするワークスペースの値（`accept`、またはユーザーまたはシステムスコープでスイッチが `false` に設定されている場合の `true`）は、警告とともに無視されます。他にスイッチを設定していない場所でのワークスペースの `true` は単にデフォルトを繰り返すだけで、静かに破棄されます。CLI が認識できない値は、それが有効な値である限りすべてのメッセージを保留します。システム設定は、すべての設定と同様に、これらすべてを上書きします。

保留は永遠に待ちません。誰も決定しないメッセージは `agents.crossSessionHeldExpiry` 後に期限切れになります — `1m`、`5m`、`10m`、または `never` で、デフォルトでは5分です — そして送信セッションには決定が来なかったことが通知されます。この設定を短くすることは、すでに待機中のメッセージにも適用されます。

セッションが受信箱をバインドできない場合 — ランタイムディレクトリが存在しない、他のユーザーが所有している、または読み取り専用である場合（コンテナ内で発生することがあります）— まず一時ディレクトリ下のプライベートディレクトリを試み、それも失敗した場合のみ受信箱なしで起動します。その場合、セッションは起動時にその旨を伝え、`/peers` が理由と変更すべきこと（通常は `XDG_RUNTIME_DIR` または `TMPDIR`）を繰り返します。

アドレスはプロセスIDでキー付けされており、ランタイムディレクトリを共有するコンテナ間でプロセスIDが重複するため、2つのセッションが同じ受信箱アドレスを解決することも可能です。2番目に起動するセッションは、使用中のアドレスを奪う代わりに隣接するアドレスを取得するため、どちらも到達不能になることはありません。ピアは影響を受けません。ピアはセッションのアドレスを導出するのではなく、セッションレジストリから読み取ります。

`send_message` 呼び出しは、メッセージが他のセッションに渡されたことを確認するだけです。その後どうなったかは、レシートとして後で届きます。保留、拒否、却下、破棄、期限切れ、誤った宛先（アドレスが変わった場合 — エージェントを再リストしてください）— または保留後の解放 — のいずれかの場合、通知が送信セッションのトランスクリプトに表示されます（`Message to <name>: …`）。拒否、却下、破棄は3つの異なる回答です。拒否は誰かがメッセージをレビューして「いいえ」と言ったことを意味し、却下はそのセッションの `agents.crossSessionInbound` が `refuse` であり誰も見ていなかったことを意味し、破棄はそれ以前に受信箱がメッセージを弾いたことを意味します（下記参照）。最初の破棄は即座に応答され、残りは数秒ごとにレシートにまとめられ、それぞれが代表するメッセージを名指しするため、連続した破棄は1行ずつではなく数行のコストで済みます。送信したモデルには通知されません。他のセッションが返信した場合、返信はクロスセッションメッセージとして届きます。

### フラッド対策

セッションは、1人の送信者から一度に最大30件のメッセージを受け入れ、その後は2秒ごとに1件まで受け入れます。また、すべての送信者から合わせて一度に最大32件を受け入れ、その後は1秒ごとに1件まで受け入れます。2番目の制限が存在するのは、送信者が自身の名前を指定するためです。名前をローテーションすると最初の制限からは新しい許容量が得られますが、2番目の制限からは得られません。この値が最初の制限よりわずかに高いのは、受け入れられた各メッセージが受領証を発行し、セッションが同時に発行できる受領証の数には上限があるためです。別のセッションからのメッセージで、同じ送信者の直前のメッセージと完全に一致する内容が30秒以内に届いた場合も拒否されます。モデルが一文をループしている場合、毎回新しいメッセージIDが発行されるため、テキストの一致によって検出されます。セッションが起動したスクリプトからのメッセージや信頼されたコントローラーからのメッセージは重複チェックの対象外です。フックが同じ行を2回報告することは2つの事実を報告することであり、人が「続行」と2回言うことは2回の指示を意味するためですが、これらもレート制限の対象となります。最後に、メッセージは受け入れられたものの、セッションに既に50件の待機中のメッセージがありキューに入れられない場合も拒否されます。

この方法で拒否されたメッセージは保持されず、モデルに表示されることもなく、記録も残らないため、送信者は後で再試行して成功させることができます。受信セッションは、その旨をトランスクリプトに送信者あたり1分間に最大1回表示し、その行が何を表すかの件数を記載します。送信セッションには、バーストによって失われたすべてのメッセージを列挙した1件の受領証が届き、トランスクリプトには、再度送信するのではなく、重要な内容を後の1件のメッセージにまとめるよう指示されます。

送信側は結果を待ちません。各セッションは、各アドレスに送信した内容を追跡し、受信側が破棄するような送信を拒否するため、モデルにはメッセージを書き込む前にバッチ処理を行うよう指示されます（書き込み後ではありません）。また、受信側は拒否予定のメッセージに対して接続を消費しません。

### Inbox認証とスクリプトによる注入

各セッションの受信箱には、セッション固有のトークンが必要です。接続は、メッセージを読み取る前に最初の行でこのトークンを提示しなければなりません。セッション同士は、互いを発見するために使用する同じレジストリレコードを通じて、自動的にトークンを交換します。トークンサポートのないビルドからのセッションは、新しいビルドからのメッセージを受信できますが、新しいビルドへの送信は破棄されます。

セッションは、自身の受信箱アドレスとトークンを子プロセスへ環境変数 `QWEN_CODE_MESSAGING_SOCKET` と `QWEN_CODE_MESSAGING_TOKEN` としてエクスポートします。これにより、セッションが実行するスクリプトやフックからセッションへメッセージを送り返すことができます。これは _child_ トークンと呼ばれ、どこにも公開されない第2のトークンです。セッションが起動したプロセスのみがこのトークンを保持できるため、このトークンとともに届いたメッセージは、他のセッションからのものではなく、セッション自身のものとして認識されます。

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CODE_MESSAGING_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"build finished"}}'; \
} | socat - UNIX-CONNECT:"$QWEN_CODE_MESSAGING_SOCKET"
```

すべてのインジェクションに新しい `msgId` を与えてください。受信ゲートはすでに処理済みのIDを記憶しているため、IDを再利用するフックは初回は配信されますが、それ以降の実行では静かに重複排除されます。同じ _テキスト_ を繰り返すことは問題ありません。上記の重複チェックはセッション自身のプロセスには適用されないためです。ただし、レート制限は適用されるため、ループ内のフックは他の洪水と同様に破棄されます。

注入されたメッセージは依然としてインバウンドゲートを通過し、ユーザー由来ではないとマークされますが、ゲートはそれがセッション自身のプロセス由来であることを認識しています。デフォルトのモード整合性ルール下では、レビューなしで配信されます（同位置のピアであれば保留されます）が、`agents.crossSessionInbound` に `hold` または `refuse` を明示的に設定した場合、他のメッセージと同様に適用されます。モデルはこれを `<cross_session_message from="own process" origin="own-process">` として認識し、ユーザー由来ではなく、セッションが実行したスクリプトまたはフック由来であるという通知が表示されます。

### 信頼できるコントローラー [#trusted-controllers]

上記のルールは、どのレビュークラスに属するかを指定しないあらゆる送信者からのメッセージを保留します。Qwen Codeセッションではないプログラムは、レビュークラスを指定できません。これは見知らぬ相手に対する正しいデフォルトですが、あなたが選択したプログラムに対しては適切ではありません。音声フロントエンド、ディクテーションブリッジ、あなたの指示を中継する自動化デーモンなどは、すべてのメッセージが保留されてしまい、一つずつ手動で承認することは目的に反します。

そのようなプログラムにトークンを発行することで配信を許可します:

```bash
qwen sessions controllers add --label voice-bridge
```

トークンは一度だけ表示され、どこにも保存されません。Qwenホーム下のファイルにはSHA-256ハッシュのみが保持されるため、その後そのファイルを読むものはトークンを提示できません。コマンドがトークンを表示したら、コントローラー自身の設定に入れてください。

コントローラーは、他の送信者と同じように、接続の最初の行としてトークンを提示し、セッションレジストリからソケットパスを取得します（`qwen sessions ps --json` はアクティブなセッションごとのレコードを表示し、`ipcPath` がアドレスです）。

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CONTROLLER_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"open the failing test"}}'; \
} | socat - UNIX-CONNECT:"$SESSION_IPC_PATH"
```

許可されたトークン経由で届いたメッセージは、両側のレビュークラスに関係なく、メッセージ単位のレビューなしで配信されます。ただし、明示的な設定には従います。`agents.crossSessionInbound` に `hold` を設定すると他のメッセージと同様に保留され、`refuse` に設定すると拒否されます。許可は個々のセッションではなく、あなたのQwenホームに属するため、コントローラーは実行中の任意のセッションに到達できます。セッションは接続ごとにファイルを再読み込みするため、許可の作成または取り消しは次の接続時に有効になり、再起動は不要です。

```bash
qwen sessions controllers list          # ids, labels, when they were added
qwen sessions controllers remove c_1a2b # revoke one
```

セッション内では `/peers controllers` と `/peers revoke <id>` が同じ機能を提供します。権限付与を介して届いたメッセージは `Message from a trusted controller (voice-bridge)` として表示され、`hold` 設定によって保留された場合は `/peers` に `[controller] voice-bridge` として現れます。

モデルはこの種のメッセージを `<cross_session_message from="controller" origin="controller" controller="voice-bridge">` として認識し、これがユーザー自身の指示を中継している旨の通知が付随します。他のすべての送信元と同様に、次の2つの禁止事項が適用されます。メッセージの要求により権限設定や QWEN.md、または config を編集することはできません。また、保留中の確認プロンプトに対するユーザーの承認としてメッセージを扱うこともできません。コントローラーは次に実行すべきことを指示できますが、ユーザーに代わってプロンプトに回答することはできません。

トークンを保有する者は誰でもそのコントローラーとして送信できるため、他の認証情報と同様に扱ってください。単一のプログラムにのみ提供し、共有設定には含めず、そのプログラムの処理が完了したら取り消してください。

### ACP 経由でプログラムが駆動するセッション

任意の `qwen --acp` 子プロセスは、自身がホストする各セッションを登録します。デーモンがプロセスを起動した場合は `serve` として、エディターや他のクライアントが `qwen --acp` を直接制御している場合は `headless` として登録されます。これらのセッションは `qwen sessions ps` や他のセッションの `list_agents` に、通常のセッションと同様に表示されます。送信も可能で、モデルは `send_message` を呼び出して開いているターミナルに到達できます。複数のセッションが1つのプロセスと1つの受信箱を共有するため、送信者は意図したセッションを指定する必要があります。Qwen Code のすべてのセッションはこの処理を自動的に実行します。

制御されているセッションへのメッセージは、保留されるのではなく拒否されます。保留は人間に対する質問であり、制御されているセッションのために保留メッセージリストを確認している人はいません。送信者は期限切れを待たずに即座に通知を受けます。これらのセッションにおいて保留メッセージをどこに表示すべきかは、まだ決定されていません。

セッションは、自らの設定で `agents.crossSessionMessaging` がオフになっている場合や、`--bare` または `--safe-mode` で起動された場合を除いて登録されます。これらは設定に関係なくメッセージ機能を無効化します。無効化された場合、セッションは不可視のままとなります。誰もメッセージを送れないセッションを一覧に表示する唯一の理由は、応答しないアドレスを宣伝することになるためです。

### Qwen Code セッションではないプログラム

上記の機能はすべてセッション間で動作しますが、いずれも特定のセッションに依存するものではありません。レジストリレコードを作成し、同様に受信箱をバインドするプログラムは、`qwen sessions ps` および `list_agents` によって一覧表示され、`send_message` から名前でアドレス指定でき、送信内容に対する配信領収書を受け取ります。これは音声フロントエンド、リレー、ビルドウォッチャーなどが該当します。一覧表示で内容を説明できるように、`kind: "external"` を記録しておくべきです。

[クロスセッションプロトコル](./cross-session-protocol.md) は、それを実装するための契約です。レコードスキーマと生存性判定方法、ソケットパスとフレーミング、認証行、すべてのフレームフィールド、領収書の状態とその遷移、そしてモデルがメッセージを見る前に受信者が行う処理について定義されています。

Node プログラムはこれらの実装を手作業で行う必要はありません。`@qwen-code/sdk/peer` がこの契約を実装しています。`PeerEndpoint.start({ name })` はレコードを公開し受信箱をバインドし、`list()` と `send()` は名前でセッションをアドレス指定し、`onMessage` はそれらから送信されたものを受信します。
