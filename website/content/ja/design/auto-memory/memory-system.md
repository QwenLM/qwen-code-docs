```markdown
# Memory 記憶管理システム

> 本稿では、Qwen Code の **Managed Auto-Memory**（管理自動記憶）における記憶管理メカニズム、トリガー条件、実装の詳細について説明します。

---

## 目次

1. [概要](#概要)
2. [保存構造](#保存構造)
3. [記憶タイプ](#記憶タイプ)
4. [記憶エントリのフォーマット](#記憶エントリのフォーマット)
5. [主要ライフサイクル](#主要ライフサイクル)
6. [Extract — 抽出](#extract--抽出)
7. [Dream — 統合](#dream--統合)
8. [Recall — 呼び出し](#recall--呼び出し)
9. [Forget — 忘却](#forget--忘却)
10. [インデックス再構築](#インデックス再構築)
11. [テレメトリ計測](#テレメトリ計測)

---

## 概要

Managed Auto-Memory は、AI とのセッション中にユーザーに関連する知識を**自動的に**蓄積、統合、検索する永続的な記憶システムです。4 つの主要な操作によって記憶のライフサイクルを管理します。

| 操作     | 英語       | トリガー方法               | 役割                                             |
| -------- | ---------- | -------------------------- | ------------------------------------------------ |
| 抽出     | Extract    | 自動（各ターン後）         | 会話ログから新たな知識を抽出し記憶ファイルに書き込む |
| 統合     | Dream      | 自動（定期的なバックグラウンドタスク） | 記憶ファイルの重複を除去・結合し、整理整頓する         |
| 呼び出し | Recall     | 自動（各ターン前）         | 現在のリクエストに関連する記憶を検索しシステムプロンプトに注入する |
| 忘却     | Forget     | 手動（ユーザーコマンド `/forget`） | 指定された記憶エントリを正確に削除する               |

---

## 保存構造

### ディレクトリレイアウト

```
~/.qwen/                                      ← グローバルベースディレクトリ（デフォルト）
└── projects/
    └── <sanitized-git-root>/                 ← プロジェクト識別子（Git ルートパスに基づく）
        ├── meta.json                         ← メタデータ（抽出/統合タイムスタンプ、ステータス）
        ├── extract-cursor.json               ← 抽出カーソル（処理済みの会話オフセット）
        ├── consolidation.lock                ← Dream プロセスの排他ロック
        └── memory/                           ← 記憶メインディレクトリ
            ├── MEMORY.md                     ← インデックスファイル（自動生成、全エントリを集約）
            ├── user.md                       ← ユーザー嗜好記憶（例）
            ├── feedback.md                   ← フィードバック規範記憶（例）
            ├── project/
            │   └── milestone.md              ← プロジェクト記憶（サブディレクトリ対応）
            └── reference/
                └── grafana.md                ← 外部リソース記憶
```

> **環境変数による上書き**：
>
> - `QWEN_CODE_MEMORY_BASE_DIR`：グローバルベースディレクトリを置き換え
> - `QWEN_CODE_MEMORY_LOCAL=1`：プロジェクト内パス `.qwen/memory/` を使用

### 主要ファイルの説明

| ファイル                | 説明                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `meta.json`           | 最後の Extract / Dream の時刻、セッションID、対象となった記憶タイプ、実行ステータスを記録           |
| `extract-cursor.json` | 現在のセッションにおいて会話履歴のどのオフセットまで処理済みかを記録。重複抽出防止のため          |
| `consolidation.lock`  | Dream 実行中のファイルロック。内容は保持者の PID。1 時間超過で自動無効化                           |
| `MEMORY.md`           | 全トピックファイルのインデックス。Extract / Dream のたびに再構築される。Markdown リスト形式          |

---

## 記憶タイプ

システムは 4 つの組み込み記憶タイプをサポートし、それぞれ異なる情報の次元に対応します。

| タイプ        | 保存内容                                             | 書き込みタイミング                               | 読み取りタイミング                     |
| ------------- | ---------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| `user`        | ユーザーの役割、スキル背景、仕事の習慣               | ユーザーの役割/好み/知識背景を把握したとき       | 回答をユーザーの背景に合わせてカスタマイズする必要があるとき |
| `feedback`    | AI の行動に関するユーザーの指示：避けるべきこと、続けるべきこと | ユーザーが AI を修正したり、自明でない行動を確認したとき | AI の振る舞いに影響を与える必要があるとき |
| `project`     | プロジェクトの進捗、目標、決定、期限、バグ追跡       | 誰が何をなぜいつまでにやっているかを把握したとき   | AI が作業の背景やモチベーションを理解するのに役立つとき |
| `reference`   | 外部システムリソースへのポインタ（ダッシュボード、チケットシステム、Slack チャンネルなど） | 外部リソースとその用途を知ったとき               | ユーザーが外部システムや関連情報に言及したとき |

**記憶に保存すべきでない内容**：コードパターン/規約、Git 履歴、デバッグ手法、一時的なタスクステータス、既に QWEN.md/AGENTS.md に記録されている内容。

---

## 記憶エントリのフォーマット

各トピックファイルは **YAML frontmatter + Markdown body** 形式を使用します。

```markdown
---
name: 記憶名
description: 一行での説明（呼び出し時の関連性判断に使用。具体的に）
type: user|feedback|project|reference
---

記憶本文（summary 行）

Why: 背後にある理由（AI がルールを盲目的に守るのではなく、境界条件を理解できるようにするため）
How to apply: 適用すべきシナリオと使用方法
```

`feedback` と `project` タイプでは、`Why` と `How to apply` の記入を強く推奨します。これにより、境界条件でも記憶を正しく適用できるようになります。

---

## 主要ライフサイクル

```mermaid
flowchart TD
    A([ユーザーがリクエストを送信]) --> B

    subgraph "呼び出し Recall"
        B[全トピックファイルをスキャン] --> C{ドキュメント数と\nクエリ内容が有効か?}
        C -- いいえ --> D[空のプロンプトを返す\nstrategy: none]
        C -- はい --> E{Config が設定されているか?}
        E -- はい --> F[モデル駆動選択\nside query]
        F --> G{関連ドキュメントを選出?}
        G -- はい --> H[strategy: model]
        G -- いいえ --> I[strategy: none]
        E -- いいえ --> J[ヒューリスティックキーワードスコアリング]
        F -- 失敗 --> J
        J --> K{スコア > 0 のドキュメントがあるか?}
        K -- はい --> L[strategy: heuristic]
        K -- いいえ --> I
        H --> M[Relevant Memory プロンプトを構築\nシステムプロンプトに注入]
        L --> M
        I --> N[記憶を注入しない]
    end

    M --> O([AI がリクエストを処理])
    N --> O
    D --> O

    O --> P([AI がレスポンスを返す])

    subgraph "抽出 Extract (バックグラウンド)"
        P --> Q{今回の AI が\n直接記憶ファイルに書き込んだか?}
        Q -- はい --> R[スキップ\nmemory_tool]
        Q -- いいえ --> S{抽出タスクが\n実行中か?}
        S -- はい --> T[キューに入れるかスキップ\nalready_running / queued]
        S -- いいえ --> U[未処理の会話スライスをロード\nextract cursor に基づく]
        U --> V[抽出エージェントを呼び出し\nrunAutoMemoryExtractionByAgent]
        V --> W[パッチを重複排除・正規化]
        W --> X{touched topics があるか?}
        X -- はい --> Y[meta.json を更新\nMEMORY.md インデックスを再構築]
        X -- いいえ --> Z[extract cursor のみ更新]
        Y --> Z
    end

    subgraph "Dream 統合 (バックグラウンド、定期的)"
        P --> AA{Dream スケジューリングゲートチェック}
        AA --> AB{同一セッションか?}
        AB -- はい --> AC[スキップ\nsame_session]
        AB -- いいえ --> AD{前回の Dream から\n≧ 24 時間?}
        AD -- いいえ --> AE[スキップ\nmin_hours]
        AD -- はい --> AF{前回の Dream 以降の\n新規セッション数 ≧ 5?}
        AF -- いいえ --> AG[スキップ\nmin_sessions]
        AF -- はい --> AH{consolidation.lock\nが存在するか?}
        AH -- はい --> AI[スキップ\nlocked]
        AH -- いいえ --> AJ[ロックを取得\nPID を書き込み]
        AJ --> AK{Config が設定されているか?}
        AK -- はい --> AL[Agent パス\nplanManagedAutoMemoryDreamByAgent]
        AL --> AM{Agent がファイルに触れたか?}
        AM -- はい --> AN[触れた topics を記録]
        AM -- "いいえ/失敗" --> AO
        AK -- いいえ --> AO[機械的な重複排除パス\n解析+重複除去+アルファベット順ソート]
        AO --> AP[更新されたトピックファイルを書き戻し]
        AN --> AQ[MEMORY.md インデックスを再構築\nmeta.json を更新]
        AP --> AQ
        AQ --> AR[ロックを解放]
    end
```

---

## Extract — 抽出

### トリガー条件

AI が各ターンのレスポンスを完了した後、`scheduleAutoMemoryExtract` によって自動的にトリガーされます（バックグラウンドで非ブロッキング）。

### スケジューリングロジック（`extractScheduler.ts`）

```mermaid
flowchart TD
    A[scheduleAutoMemoryExtract が呼び出される] --> B{今回の会話履歴に\n記憶ファイルへのツール呼び出しがあるか?}
    B -- はい --> C[skipped タスクを記録\n理由: memory_tool]
    B -- いいえ --> D{isExtractRunning?}
    D -- はい --> E{既に queued リクエストがあるか?}
    E -- はい --> F[queued リクエストの\nhistory パラメータを更新]
    E -- いいえ --> G[pending タスクを登録\nqueue に入れる]
    D -- いいえ --> H[running タスクを登録\nrunTask を呼び出し]
    H --> I[markExtractRunning\nsetCurrentTaskId]
    I --> J[runAutoMemoryExtract]
    J --> K[タスク完了]
    K --> L[clearExtractRunning\nqueue を確認 → startQueuedIfNeeded]
    F --> M[skipped: queued を返す]
    G --> M
    C --> N[skipped: memory_tool を返す]
```

**スキップ理由の説明**：

| 理由              | 意味                                                       |
| ----------------- | ---------------------------------------------------------- |
| `memory_tool`     | 今回のメイン Agent が既に直接記憶ファイルに書き込んだため、競合を避けてスキップ |
| `already_running` | 抽出が既に実行中で、キューイング不可                       |
| `queued`          | 既に抽出が実行中、今回のリクエストはキューイングされた     |

### コア抽出フロー（`extract.ts`）

```mermaid
flowchart TD
    A[runAutoMemoryExtract] --> B[ensureAutoMemoryScaffold\nディレクトリとファイルを初期化]
    B --> C[readExtractCursor\n前回処理位置を読み込み]
    C --> D[history.slice startOffset\n未処理のメッセージスライスのみ取得]
    D --> E{スライスに新しい user メッセージがあるか?}
    E -- いいえ --> F[cursor を更新\nパッチなしの結果を返す]
    E -- はい --> G[runAutoMemoryExtractionByAgent\nforked agent を呼び出して抽出]
    G --> H{touched topics があるか?}
    H -- はい --> I[bumpMetadata\nmeta.json を更新]
    I --> J[rebuildManagedAutoMemoryIndex\nMEMORY.md を再構築]
    J --> K[writeExtractCursor\n最新の offset = history.length を記録]
    H -- いいえ --> K
    K --> L[AutoMemoryExtractResult を返す]
```

> **注意：** `isUnderMemoryPressure` ゲートは `MemoryManager.runExtract()` 内にあり、本フローには含まれません。monitor が hard/critical の圧力を報告した場合、`MemoryManager` は extract 呼び出しをスキップし、cursor を進めません。

**抽出カーソル（Cursor）**：

- フィールド：`{ sessionId, processedOffset, updatedAt }`
- 抽出前に `readExtractCursor` で現在の進捗を読み込み、`history.slice(processedOffset)` で未読部分のみを処理
- 抽出後、`processedOffset` を現在の履歴長（`params.history.length`）に更新
- セッションが変わると（`sessionId` が異なる）オフセット 0 から再開
- 注意：`buildTranscriptMessages` / `loadUnprocessedTranscriptSlice` によるトランスクリプトテキストの構築は行われません。`hasNewUserMessages` は `history.slice(startOffset).some(m => m.role === 'user' && partToString(m.parts).trim().length > 0)` で判断し、未読スライスのみを軽量に文字列化します。全量の履歴は処理しません。

**パッチフィルタリングルール**：

- 要約の長さが 12 文字未満 → 破棄
- 要約が `?` で終わる → 破棄（疑問文）
- 一時的なキーワード（today/now/currently/temporary など）を含む → 破棄
- 同一の `topic:summary` の組み合わせ → 重複排除

---

## Dream — 統合

### トリガー条件

AI が各ターンのレスポンスを完了した後、`scheduleManagedAutoMemoryDream` によって自動的にトリガーされます（バックグラウンドで非ブロッキング）。ただし、複数のゲート条件で保護されており、ほとんどの場合スキップされます。

### スケジューリングゲート（`dreamScheduler.ts`）

```mermaid
flowchart TD
    A[scheduleManagedAutoMemoryDream が呼び出される] --> B{Dream 機能が有効か?}
    B -- いいえ --> C[スキップ: disabled]
    B -- はい --> D[ensureAutoMemoryScaffold\nlastDreamSessionId を読み込み]
    D --> E{現在の sessionId\n== lastDreamSessionId?}
    E -- はい --> F[スキップ: same_session]
    E -- いいえ --> G{elapsedHours ≧ 24h\nまたは Dream 未実行?}
    G -- いいえ --> H[スキップ: min_hours]
    G -- はい --> I{前回の session スキャンから\n< 10 分?}
    I -- はい --> J[スキップ: min_sessions\n次のスキャンウィンドウを待つ]
    I -- いいえ --> K[chats/*.jsonl の mtime をスキャン\n前回 Dream 以降の新規セッション数をカウント]
    K --> L{新規セッション数 ≧ 5?}
    L -- いいえ --> M[スキップ: min_sessions]
    L -- はい --> N{lockExists?\nPID チェック + 期限切れチェック}
    N -- はい --> O[スキップ: locked]
    N -- いいえ --> P{dedupeKey に既に\n同一プロジェクトの Dream タスクがあるか?}
    P -- はい --> Q[スキップ: running\n既存の taskId を返す]
    P -- いいえ --> R[バックグラウンドタスクをスケジュール\nBgTaskScheduler]
    R --> S[acquireDreamLock\nconsolidation.lock に PID を書き込み]
    S --> T[runManagedAutoMemoryDream]
    T --> U[meta.json を更新\nロックを解放]
```

**ゲートパラメータ**：

| パラメータ                    | デフォルト値 | 説明                                |
| --------------------------- | ------------ | ----------------------------------- |
| `minHoursBetweenDreams`    | 24 時間      | 2 回の Dream 間の最小時間間隔      |
| `minSessionsBetweenDreams` | 5 セッション | Dream をトリガーするのに必要な最小新規セッション数 |
| `SESSION_SCAN_INTERVAL_MS` | 10 分        | セッションファイルスキャンのスロットル間隔       |
| `DREAM_LOCK_STALE_MS`      | 1 時間       | lock ファイルが期限切れと見なされる時間しきい値       |

**ロックメカニズム**：

- lock ファイルは `<project-state-dir>/consolidation.lock`
- 内容は保持プロセスの PID
- チェック時：PID プロセスが既に存在しない（`kill(pid, 0)` が失敗）か、lock が 1 時間を超えている場合 → 期限切れと見なし、自動的にクリア

### 統合実行フロー（`dream.ts`）

```mermaid
flowchart TD
    A[runManagedAutoMemoryDream] --> B{Config が設定されているか?}
    B -- はい --> C[Agent パス\nplanManagedAutoMemoryDreamByAgent]
    C --> D{Agent がファイルを変更したか?}
    D -- はい --> E[ファイルパスから touched topics を推測]
    E --> F[bumpMetadata\nMEMORY.md インデックスを再構築]
    F --> G[updateDreamMetadataResult]
    G --> H[テレメトリイベントを記録]
    H --> I[結果を返す]
    B -- いいえ --> J[機械的な重複排除パス]
    C -- 例外をスロー --> J
    D -- いいえ --> J

    J --> K[scanAutoMemoryTopicDocuments\n全てのトピックファイルを読み込み]
    K --> L[各ファイルに対して buildDreamedBody を実行]
    L --> M[entries を解析 → summary で重複排除\nアルファベット昇順でソート → 再レンダリング]
    M --> N{body に変更があるか?}
    N -- はい --> O[ファイルに書き戻し]
    O --> P[touched topic を記録]
    N --> Q[ファイル間の重複をチェック\ndedupeKey = type:summary]
    Q --> R{重複ファイルが見つかったか?}
    R -- はい --> S[canonical ファイルに entries を統合\n重複ファイルを削除]
    S --> P
    R -- いいえ --> T{touched topics があるか?}
    P --> T
    T -- はい --> U[bumpMetadata\nMEMORY.md インデックスを再構築]
    U --> V[updateDreamMetadataResult\nテレメトリを記録 → 結果を返す]
    T -- いいえ --> V
```

**機械的重複排除ロジック**：

1. 各トピックファイル内：`summary.toLowerCase()` で重複排除し、`why`/`howToApply` フィールドを統合
2. summary のアルファベット順に再ソート
3. ファイル間：同じ `type:summary` のエントリは最初に見つかったファイルに統合し、重複ファイルを削除

---

## Recall — 呼び出し

### トリガー条件

AI がユーザーリクエストを処理する前の各ターンで、`resolveRelevantAutoMemoryPromptForQuery` によって自動的にトリガーされ、関連する記憶をシステムプロンプトに注入します。

### 呼び出しフロー（`recall.ts`）

```mermaid
flowchart TD
    A[resolveRelevantAutoMemoryPromptForQuery] --> B[scanAutoMemoryTopicDocuments\n全てのトピックファイルをスキャン]
    B --> C[filterExcludedAutoMemoryDocuments\n今回書き込んだファイルをフィルタリング]
    C --> D{query が空\nまたは docs が空\nまたは limit <= 0?}
    D -- はい --> E[空のプロンプトを返す\nstrategy: none]
    D -- いいえ --> F{Config が設定されているか?}
    F -- はい --> G[selectRelevantAutoMemoryDocumentsByModel\nside query を発行してモデルに選択させる]
    G --> H{モデルが結果を返したか?}
    H -- ドキュメントあり --> I[strategy: model]
    H -- ドキュメントなし --> J[strategy: none\n空のまま返す]
    G -- "失敗/例外" --> K[ヒューリスティック選択にフォールバック]
    F -- いいえ --> K
    K --> L[query をトークナイズ\n3 文字以上のトークンを抽出]
    L --> M[scoreDocument でスコアリング\nキーワード一致 +2 / タイプキーワード +1 / 内容あり +1]
    M --> N[score=0 のドキュメントを除外\nスコア降順に並べ、Top 5 を取得]
    N --> O{スコアのあるドキュメントがあるか?}
    O -- はい --> P[strategy: heuristic]
    O -- いいえ --> J
    I --> Q[buildRelevantAutoMemoryPrompt\nRelevant Memory ブロックを構築]
    P --> Q
    Q --> R[メインシステムプロンプトに注入するプロンプトフラグメントを返す]
```

**スコアリングルール（ヒューリスティック）**：

| 条件                                     | 加算             |
| -------------------------------------- | -------------- |
| query token がドキュメント内容に出現  | +2（トークンごと）|
| query token がそのタイプの特徴キーワード | +1（トークンごと）|
| ドキュメント body が空でない         | +1               |

**各タイプの特徴キーワード**：

- `user`：user, preference, background, role, terse
- `feedback`：feedback, rule, avoid, style, summary
- `project`：project, goal, incident, deadline, release
- `reference`：reference, dashboard, ticket, docs, link

**プロンプト構築ルール**：

- 最大 5 つのドキュメントを注入（`MAX_RELEVANT_DOCS`）
- 各ドキュメント body を 1200 文字に切り詰め（`MAX_DOC_BODY_CHARS`）
- 切り詰めた場合、「NOTE: Relevant memory truncated for prompt budget.」というヒントを追加
- ドキュメントの新鮮度情報を含める（ファイルの mtime に基づく）

---

## Forget — 忘却

### トリガー条件

ユーザーが手動で `/forget <query>` コマンドを実行することでトリガーされます。

### 忘却フロー（`forget.ts`）

```mermaid
flowchart TD
    A[forgetManagedAutoMemoryEntries\nquery + config] --> B[ensureAutoMemoryScaffold]
    B --> C[listIndexedForgetCandidates\n全ファイルの全エントリをスキャン]
    C --> D[各エントリに安定した ID を生成\nシングルエントリファイル: relativePath\nマルチエントリファイル: relativePath:index]
    D --> E{Config が設定されているか?}
    E -- はい --> F[selectByModel\nselection prompt を構築\nside query temperature=0 を発行]
    F --> G{モデル選択が成功?}
    G -- はい --> H[strategy: model]
    G -- 失敗 --> I[selectByHeuristic\nキーワードマッチング]
    E -- いいえ --> I
    I --> J[strategy: heuristic]
    H --> K[選択された candidates を反復処理]
    J --> K
    K --> L{entries.length == 1?}
    L -- はい --> M[ファイル全体を削除\nfs.unlink]
    L -- いいえ --> N[ファイル内の全 entries を解析\n対象エントリを削除\n再レンダリングして書き戻し]
    M --> O[removedEntries を記録]
    N --> O
    O --> P{touched topics があるか?}
    P -- はい --> Q[bumpMetadata\nMEMORY.md インデックスを再構築]
    P --> R[AutoMemoryForgetResult を返す]
    Q --> R
```

**エントリ ID の設計**：

- 単一エントリファイル（一般的）：`relativePath`（例：`feedback/no-summary.md`）
- 複数エントリファイル：`relativePath:index`（例：`feedback/style.md:2`）
- 安定した ID を使用することで、モデルが同一ファイル内の他のエントリに影響を与えずにエントリを正確に特定できる

---

## インデックス再構築

`MEMORY.md` は全トピックファイルのナビゲーションインデックスであり、Extract または Dream のたびに `rebuildManagedAutoMemoryIndex` を呼び出して再構築されます。

```
- [ユーザーの嗜好](user/preferences.md) — ユーザーはベテランの Go エンジニアで、React は初めて
- [フィードバック規範](feedback/style.md) — 返信は簡潔に、末尾の要約は不要
- [プロジェクトマイルストーン](project/milestone.md) — モバイルリリースのブランチカット前のマージフリーズ期間
```

**インデックスの制限**：

- 1 行あたり最大 150 文字（超過時は `…` で切り詰め）
- 最大 200 行
- 合計サイズは 25,000 バイト以下

---

## テレメトリ計測

システムには 3 種類のテレメトリイベントが組み込まれており、記憶操作のパフォーマンスと効果を監視します。

### Extract テレメトリ

| フィールド          | タイプ                         | 説明                     |
| ----------------- | ---------------------------- | ------------------------ |
| `trigger`        | `'auto'`                     | トリガー方法（現在は自動のみ）  |
| `status`         | `'completed'` \| `'failed'`  | 実行結果                 |
| `patches_count`  | number                       | 抽出された有効なパッチ数   |
| `touched_topics` | string[]                     | 書き込まれた記憶タイプのリスト |
| `duration_ms`    | number                       | 総所要時間（ミリ秒）       |

### Dream テレメトリ

| フィールド           | タイプ                                   | 説明                      |
| ------------------ | -------------------------------------- | ------------------------- |
| `trigger`         | `'auto'`                               | トリガー方法               |
| `status`          | `'updated'` \| `'noop'` \| `'failed'`  | 実行結果                  |
| `deduped_entries` | number                                 | 機械的な重複排除で削除されたエントリ数 |
| `touched_topics`  | string[]                               | 変更された記憶タイプのリスト    |
| `duration_ms`     | number                                 | 総所要時間（ミリ秒）        |

### Recall テレメトリ

| フィールド           | タイプ                                    | 説明                |
| ------------------ | --------------------------------------- | ------------------- |
| `query_length`    | number                                  | クエリ文字列の長さ      |
| `docs_scanned`    | number                                  | スキャンされたドキュメント総数 |
| `docs_selected`   | number                                  | 最終的に注入されたドキュメント数 |
| `strategy`        | `'none'` \| `'heuristic'` \| `'model'`  | 選択戦略              |
| `duration_ms`     | number                                  | 総所要時間（ミリ秒）     |

---

## 関連ソースファイルインデックス

| ファイル                                                 | 責務                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `packages/core/src/memory/types.ts`                   | 型定義：`AutoMemoryType`、`AutoMemoryMetadata`、`AutoMemoryExtractCursor` |
| `packages/core/src/memory/paths.ts`                   | パス計算：`getAutoMemoryRoot`、`isAutoMemPath`、各種ファイルパス helper    |
| `packages/core/src/memory/store.ts`                   | スキャフォールド初期化：`ensureAutoMemoryScaffold`、インデックス/メタデータ読み書き |
| `packages/core/src/memory/scan.ts`                    | トピックファイルのスキャン：`scanAutoMemoryTopicDocuments`、frontmatter のパース |
| `packages/core/src/memory/entries.ts`                 | エントリの解析とレンダリング：`parseAutoMemoryEntries`、`renderAutoMemoryBody` |
| `packages/core/src/memory/extract.ts`                 | 抽出コアロジック：`runAutoMemoryExtract`、カーソル管理、パッチ重複排除            |
| `packages/core/src/memory/extractScheduler.ts`        | 抽出スケジューラ：`ManagedAutoMemoryExtractRuntime`、キュー/実行状態マシン       |
| `packages/core/src/memory/extractionAgentPlanner.ts`  | 抽出エージェント：`runAutoMemoryExtractionByAgent`                            |
| `packages/core/src/memory/dream.ts`                   | 統合コアロジック：`runManagedAutoMemoryDream`、Agent パス + 機械的重複排除       |
| `packages/core/src/memory/dreamScheduler.ts`          | 統合スケジューラ：`ManagedAutoMemoryDreamRuntime`、ゲートチェック、ロック管理     |
| `packages/core/src/memory/dreamAgentPlanner.ts`       | 統合エージェント：`planManagedAutoMemoryDreamByAgent`                         |
| `packages/core/src/memory/recall.ts`                  | 呼び出しロジック：`resolveRelevantAutoMemoryPromptForQuery`、ヒューリスティック+モデル二重パス |
| `packages/core/src/memory/forget.ts`                  | 忘却ロジック：`forgetManagedAutoMemoryEntries`、候補生成+正確な削除              |
| `packages/core/src/memory/indexer.ts`                 | インデックス再構築：`rebuildManagedAutoMemoryIndex`、`buildManagedAutoMemoryIndex` |
| `packages/core/src/memory/prompt.ts`                  | システムプロンプトテンプレート：記憶タイプ説明、フォーマット例、使用規範           |
| `packages/core/src/memory/governance.ts`              | ガバナンス提案タイプ：`AutoMemoryGovernanceSuggestionType`                       |
| `packages/core/src/memory/state.ts`                   | 抽出実行状態：`isExtractRunning`、`markExtractRunning`、`clearExtractRunning`    |
| `packages/core/src/memory/memoryAge.ts`               | 新鮮度記述：`memoryAge`、`memoryFreshnessText`                                 |
```