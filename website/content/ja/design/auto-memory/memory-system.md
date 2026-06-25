# Memory 記憶管理システム

> 本記事では、Qwen Code における **Managed Auto-Memory**（管理型自動記憶）の記憶管理メカニズム、トリガータイミング、および実装の詳細について説明します。

---

## 目次

1. [概要](#概要)
2. [ストレージ構造](#ストレージ構造)
3. [記憶タイプ](#記憶タイプ)
4. [記憶エントリのフォーマット](#記憶エントリのフォーマット)
5. [コアライフサイクル](#コアライフサイクル)
6. [Extract — 抽出](#extract--抽出)
7. [Dream — 統合](#dream--統合)
8. [Recall — 想起](#recall--想起)
9. [Forget — 忘却](#forget--忘却)
10. [インデックス再構築](#インデックス再構築)
11. [テレメトリ](#テレメトリ)

---

## 概要

Managed Auto-Memory は、AI セッション中にユーザー関連の知識を**自動的に**蓄積・統合・検索する永続的な記憶システムです。4 つのコア操作によって記憶のライフサイクルを管理します。

| 操作 | 英語    | トリガー方式                   | 役割                                   |
| ---- | ------- | ------------------------------ | -------------------------------------- |
| 抽出 | Extract | 自動（各ターン後）             | 会話履歴から新しい知識を抽出して記憶ファイルに書き込む |
| 統合 | Dream   | 自動（定期バックグラウンドタスク） | 記憶ファイルの重複除去・マージを行い整理する |
| 想起 | Recall  | 自動（各ターン前）             | 現在のリクエストに関連する記憶を検索してシステムプロンプトに注入する |
| 忘却 | Forget  | 手動（ユーザーコマンド `/forget`） | 指定した記憶エントリを正確に削除する |

---

## ストレージ構造

### ディレクトリレイアウト

```
~/.qwen/                                      ← グローバルベースディレクトリ（デフォルト）
└── projects/
    └── <sanitized-git-root>/                 ← プロジェクト識別子（Git ルートパスに基づく）
        ├── meta.json                         ← メタデータ（抽出/統合タイムスタンプ、状態）
        ├── extract-cursor.json               ← 抽出カーソル（処理済み会話オフセット）
        ├── consolidation.lock                ← Dream プロセスの排他ロック
        └── memory/                           ← 記憶メインディレクトリ
            ├── MEMORY.md                     ← インデックスファイル（自動生成、全エントリ集約）
            ├── user.md                       ← ユーザー設定の記憶（例）
            ├── feedback.md                   ← フィードバック規約の記憶（例）
            ├── project/
            │   └── milestone.md              ← プロジェクト記憶（サブディレクトリ対応）
            └── reference/
                └── grafana.md                ← 外部リソース記憶
```

> **環境変数による上書き**：
>
> - `QWEN_CODE_MEMORY_BASE_DIR`：グローバルベースディレクトリを置き換える
> - `QWEN_CODE_MEMORY_LOCAL=1`：プロジェクト内パス `.qwen/memory/` を使用する

### 主要ファイルの説明

| ファイル              | 説明                                                                   |
| --------------------- | ---------------------------------------------------------------------- |
| `meta.json`           | 最後の Extract / Dream の日時、セッション ID、対象の記憶タイプ、実行状態を記録する |
| `extract-cursor.json` | 現在のセッションで処理済みの会話履歴オフセットを記録し、重複抽出を防ぐ |
| `consolidation.lock`  | Dream 実行中のファイルロック。内容は保持プロセスの PID。1 時間経過で自動失効 |
| `MEMORY.md`           | 全トピックファイルのインデックス。Extract/Dream 後に再構築される。形式は Markdown リスト |

---

## 記憶タイプ

システムは 4 種類の組み込み記憶タイプをサポートし、それぞれ異なる情報の次元に対応します。

| タイプ      | 保存内容                                              | 書き込みタイミング                         | 読み取りタイミング                   |
| ----------- | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| `user`      | ユーザーの役割、スキル背景、作業習慣                  | ユーザーの役割・好み・知識背景を把握したとき | 回答をユーザーの背景に合わせてカスタマイズする必要があるとき |
| `feedback`  | AI の挙動に対するユーザーの指示：避けること、続けること | AI を修正するか、明らかでない手法を確認するとき | AI の動作方式に影響を与えるとき |
| `project`   | プロジェクトの進捗、目標、決定事項、期限、バグ追跡    | 誰が何をなぜいつまでに行うかを把握したとき | AI が作業の背景と動機を理解する必要があるとき |
| `reference` | 外部システムリソースへのポインタ（ダッシュボード、チケットシステム、Slack チャンネルなど） | 外部リソースとその用途を知ったとき | ユーザーが外部システムや関連情報に言及するとき |

**記憶に保存すべきでない内容**：コードパターン/規約、Git 履歴、デバッグ方針、一時的なタスク状態、すでに QWEN.md/AGENTS.md に記録されている内容。

---

## 記憶エントリのフォーマット

各トピックファイルは **YAML frontmatter + Markdown body** の形式を使用します。

```markdown
---
name: 記憶名
description: 一文での説明（想起の関連性判定に使用。具体的に）
type: user|feedback|project|reference
---

記憶の本文（summary 行）

Why: 背景にある理由（AI がルールを盲目的に従うのではなくエッジケースを理解できるよう）
How to apply: 適用シナリオと使用方法
```

`feedback` および `project` タイプでは、エッジケースでも記憶が正しく適用されるよう `Why` と `How to apply` の記入を強く推奨します。

---

## コアライフサイクル

```mermaid
flowchart TD
    A([ユーザーがリクエストを送信]) --> B

    subgraph "召回 Recall"
        B[全トピックファイルをスキャン] --> C{ドキュメント数と\nクエリ内容は有効?}
        C -- いいえ --> D[空のプロンプトを返す\nstrategy: none]
        C -- はい --> E{Config が設定されている?}
        E -- はい --> F[モデル駆動による選択\nside query]
        F --> G{関連ドキュメントが選択された?}
        G -- はい --> H[strategy: model]
        G -- いいえ --> I[strategy: none]
        E -- いいえ --> J[ヒューリスティックキーワードスコアリング]
        F -- 失敗 --> J
        J --> K{スコア > 0 のドキュメントがある?}
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

    subgraph "提取 Extract（バックグラウンド）"
        P --> Q{今回のターンで AI が\n直接記憶ファイルを書いた?}
        Q -- はい --> R[スキップ\nmemory_tool]
        Q -- いいえ --> S{抽出タスクは\n実行中?}
        S -- はい --> T[キューに入れるかスキップ\nalready_running / queued]
        S -- いいえ --> U[未処理の会話スライスを読み込む\nextract cursor に基づく]
        U --> V[抽出 Agent を呼び出す\nrunAutoMemoryExtractionByAgent]
        V --> W[patches を重複除去・正規化]
        W --> X{touched topics がある?}
        X -- はい --> Y[meta.json を更新\nMEMORY.md インデックスを再構築]
        X -- いいえ --> Z[extract cursor のみ更新]
        Y --> Z
    end

    subgraph "Dream 整合（バックグラウンド、定期的）"
        P --> AA{Dream スケジュールゲートチェック}
        AA --> AB{同じセッション?}
        AB -- はい --> AC[スキップ\nsame_session]
        AB -- いいえ --> AD{前回の Dream から\n≥ 24 時間?}
        AD -- いいえ --> AE[スキップ\nmin_hours]
        AD -- はい --> AF{前回の Dream から\n新しいセッション数 ≥ 5?}
        AF -- いいえ --> AG[スキップ\nmin_sessions]
        AF -- はい --> AH{consolidation.lock\nが存在する?}
        AH -- はい --> AI[スキップ\nlocked]
        AH -- いいえ --> AJ[ロックを取得\nPID を書き込む]
        AJ --> AK{Config が設定されている?}
        AK -- はい --> AL[Agent パス\nplanManagedAutoMemoryDreamByAgent]
        AL --> AM{Agent がファイルを変更した?}
        AM -- はい --> AN[touched topics を記録]
        AM -- "いいえ/失敗" --> AO
        AK -- いいえ --> AO[機械的重複除去パス\n解析+重複除去+アルファベット順ソート]
        AO --> AP[更新されたトピックファイルを書き戻す]
        AN --> AQ[MEMORY.md インデックスを再構築\nmeta.json を更新]
        AP --> AQ
        AQ --> AR[ロックを解放]
    end
```

---

## Extract — 抽出

### トリガータイミング

AI が各ターンのレスポンスを完了するたびに、`scheduleAutoMemoryExtract` によって自動的にトリガーされます（バックグラウンド、ノンブロッキング）。

### スケジューリングロジック（`extractScheduler.ts`）

```mermaid
flowchart TD
    A[scheduleAutoMemoryExtract が呼ばれる] --> B{今回の履歴に\n記憶ファイルを書くツール呼び出しがある?}
    B -- はい --> C[skipped タスクを登録\n理由: memory_tool]
    B -- いいえ --> D{isExtractRunning?}
    D -- はい --> E{queued リクエストが既にある?}
    E -- はい --> F[queued リクエストの\nhistory パラメータを更新]
    E -- いいえ --> G[pending タスクを登録\nキューに追加]
    D -- いいえ --> H[running タスクを登録\nrunTask を呼び出す]
    H --> I[markExtractRunning\nsetCurrentTaskId]
    I --> J[runAutoMemoryExtract]
    J --> K[タスク完了]
    K --> L[clearExtractRunning\nqueue を確認 → startQueuedIfNeeded]
    F --> M[skipped: queued を返す]
    G --> M
    C --> N[skipped: memory_tool を返す]
```

**スキップ理由の説明**：

| 理由              | 意味                                            |
| ----------------- | ----------------------------------------------- |
| `memory_tool`     | 今回のメイン Agent が直接記憶ファイルを書いたため、競合を避けてスキップ |
| `already_running` | 抽出が進行中でキューに追加できない              |
| `queued`          | 抽出が実行中のため、このリクエストはキューに追加済み |

### コア抽出フロー（`extract.ts`）

```mermaid
flowchart TD
    A[runAutoMemoryExtract] --> B[ensureAutoMemoryScaffold\nディレクトリとファイルを初期化]
    B --> C[readExtractCursor\n前回処理位置を読み取る]
    C --> D[history.slice startOffset\n未処理のメッセージスライスのみ取得]
    D --> E{スライスに新しい user メッセージがある?}
    E -- いいえ --> F[カーソルを更新\npatches なしの結果を返す]
    E -- はい --> G[runAutoMemoryExtractionByAgent\nforked agent を呼び出して抽出]
    G --> H{touched topics がある?}
    H -- はい --> I[bumpMetadata\nmeta.json を更新]
    I --> J[rebuildManagedAutoMemoryIndex\nMEMORY.md を再構築]
    J --> K[writeExtractCursor\n最新 offset = history.length を記録]
    H -- いいえ --> K
    K --> L[AutoMemoryExtractResult を返す]
```

> **注意：** `isUnderMemoryPressure` のゲートは `MemoryManager.runExtract()` 内にあり、このフローには含まれません。monitor が hard/critical 圧力を報告した場合、`MemoryManager` は extract の呼び出しをスキップし、カーソルを進めません。

**抽出カーソル（Cursor）**：

- フィールド：`{ sessionId, processedOffset, updatedAt }`
- 抽出前に `readExtractCursor` で現在の進捗を読み取り、`history.slice(processedOffset)` で未読部分のみ処理する
- 各抽出後に `processedOffset` を現在の履歴長（`params.history.length`）に更新する
- セッションをまたぐ場合（`sessionId` が変化した場合）はオフセット 0 から再開する
- 注意：`buildTranscriptMessages` / `loadUnprocessedTranscriptSlice` によるトランスクリプトのビルドは廃止。`hasNewUserMessages` は `history.slice(startOffset).some(m => m.role === 'user' && partToString(m.parts).trim().length > 0)` で判定し、未読スライスに対して軽量な文字列化のみを行い、全履歴は処理しない

**Patch フィルタリングルール**：

- サマリーの長さ < 12 文字 → 破棄
- サマリーが `?` で終わる → 破棄（疑問文）
- 一時的なキーワードを含む（today/now/currently/temporary など） → 破棄
- 同じ `topic:summary` の組み合わせ → 重複除去

---

## Dream — 統合

### トリガータイミング

AI が各ターンのレスポンスを完了するたびに、`scheduleManagedAutoMemoryDream` によって自動的にトリガーされます（バックグラウンド、ノンブロッキング）。ただし複数のゲート条件によって保護されており、ほとんどの場合はスキップされます。

### スケジューリングゲート（`dreamScheduler.ts`）

```mermaid
flowchart TD
    A[scheduleManagedAutoMemoryDream が呼ばれる] --> B{Dream 機能が有効?}
    B -- いいえ --> C[スキップ: disabled]
    B -- はい --> D[ensureAutoMemoryScaffold\nlastDreamSessionId を読み取る]
    D --> E{現在の sessionId\n== lastDreamSessionId?}
    E -- はい --> F[スキップ: same_session]
    E -- いいえ --> G{elapsedHours ≥ 24h\nまたは dream が未実行?}
    G -- いいえ --> H[スキップ: min_hours]
    G -- はい --> I{前回のセッションスキャンから\n< 10 分?}
    I -- はい --> J[スキップ: min_sessions\n次のスキャンウィンドウを待つ]
    I -- いいえ --> K[chats/*.jsonl の mtime をスキャン\n前回 Dream 後の新しいセッション数を集計]
    K --> L{新しいセッション数 ≥ 5?}
    L -- いいえ --> M[スキップ: min_sessions]
    L -- はい --> N{lockExists?\nPID チェック + 期限切れチェック}
    N -- はい --> O[スキップ: locked]
    N -- いいえ --> P{dedupeKey に\n同プロジェクトの Dream タスクが既にある?}
    P -- はい --> Q[スキップ: running\n既存の taskId を返す]
    P -- いいえ --> R[バックグラウンドタスクをスケジュール\nBgTaskScheduler]
    R --> S[acquireDreamLock\nPID を consolidation.lock に書き込む]
    S --> T[runManagedAutoMemoryDream]
    T --> U[meta.json を更新\nロックを解放]
```

**ゲートパラメータ**：

| パラメータ                 | デフォルト値 | 説明                          |
| -------------------------- | ------------ | ----------------------------- |
| `minHoursBetweenDreams`    | 24 時間      | 2 回の Dream 間の最小時間間隔 |
| `minSessionsBetweenDreams` | 5 セッション | Dream をトリガーするのに必要な最小新規セッション数 |
| `SESSION_SCAN_INTERVAL_MS` | 10 分        | セッションファイルスキャンのスロットリング間隔 |
| `DREAM_LOCK_STALE_MS`      | 1 時間       | lock ファイルが期限切れとみなされる時間しきい値 |

**ロックメカニズム**：

- lock ファイルは `<project-state-dir>/consolidation.lock` に配置される
- 内容は保持プロセスの PID
- チェック時：PID プロセスが存在しない（`kill(pid, 0)` が失敗）か lock が 1 時間を超えた場合 → 期限切れとみなして自動削除

### 統合実行フロー（`dream.ts`）

```mermaid
flowchart TD
    A[runManagedAutoMemoryDream] --> B{Config が設定されている?}
    B -- はい --> C[Agent パス\nplanManagedAutoMemoryDreamByAgent]
    C --> D{Agent がファイルを変更した?}
    D -- はい --> E[ファイルパスから touched topics を推定]
    E --> F[bumpMetadata\nMEMORY.md インデックスを再構築]
    F --> G[updateDreamMetadataResult]
    G --> H[テレメトリイベントを記録]
    H --> I[結果を返す]
    B -- いいえ --> J[機械的重複除去パス]
    C -- 例外をスロー --> J
    D -- いいえ --> J

    J --> K[scanAutoMemoryTopicDocuments\n全トピックファイルを読み取る]
    K --> L[各ファイルに buildDreamedBody を実行]
    L --> M[エントリを解析 → summary で重複除去\nアルファベット昇順にソート → 再レンダリング]
    M --> N{body に変更がある?}
    N -- はい --> O[ファイルに書き戻す]
    O --> P[touched topic を記録]
    N --> Q[ファイルをまたいだ重複をチェック\ndedupeKey = type:summary]
    Q --> R{重複ファイルが見つかった?}
    R -- はい --> S[エントリを canonical ファイルにマージ\n重複ファイルを削除]
    S --> P
    R -- いいえ --> T{touched topics がある?}
    P --> T
    T -- はい --> U[bumpMetadata\nMEMORY.md インデックスを再構築]
    U --> V[updateDreamMetadataResult\nテレメトリを記録 → 結果を返す]
    T -- いいえ --> V
```

**機械的重複除去ロジック**：

1. 各トピックファイル内部：`summary.toLowerCase()` で重複除去し、`why`/`howToApply` フィールドをマージする
2. summary のアルファベット順に再ソートする
3. ファイルをまたいで：同じ `type:summary` のエントリを最初に見つかったファイルにマージし、重複ファイルを削除する

---

## Recall — 想起

### トリガータイミング

AI が各ターンでユーザーのリクエストを処理する前に、`resolveRelevantAutoMemoryPromptForQuery` によって自動的にトリガーされ、関連する記憶をシステムプロンプトに注入します。

### 想起フロー（`recall.ts`）

```mermaid
flowchart TD
    A[resolveRelevantAutoMemoryPromptForQuery] --> B[scanAutoMemoryTopicDocuments\n全トピックファイルをスキャン]
    B --> C[filterExcludedAutoMemoryDocuments\n今回のターンで書き込まれたファイルを除外]
    C --> D{query が空\nまたは docs が空\nまたは limit <= 0?}
    D -- はい --> E[空のプロンプトを返す\nstrategy: none]
    D -- いいえ --> F{Config が設定されている?}
    F -- はい --> G[selectRelevantAutoMemoryDocumentsByModel\nside query でモデルに選択させる]
    G --> H{モデルが結果を返した?}
    H -- ドキュメントあり --> I[strategy: model]
    H -- ドキュメントなし --> J[strategy: none\n空を返す]
    G -- "失敗/例外" --> K[ヒューリスティック選択にフォールバック]
    F -- いいえ --> K
    K --> L[クエリをトークン化\n≥3 文字のトークンを抽出]
    L --> M[scoreDocument でスコアリング\nキーワードマッチ +2 / タイプキーワード +1 / コンテンツあり +1]
    M --> N[score=0 のドキュメントを除外\nスコア降順で上位 5 件を取得]
    N --> O{スコアのあるドキュメントがある?}
    O -- はい --> P[strategy: heuristic]
    O -- いいえ --> J
    I --> Q[buildRelevantAutoMemoryPrompt\nRelevant Memory ブロックを構築]
    P --> Q
    Q --> R[メインシステムプロンプトに注入するプロンプト断片を返す]
```

**スコアリングルール（ヒューリスティック）**：

| 条件                             | 加点             |
| -------------------------------- | ---------------- |
| クエリトークンがドキュメント内容に含まれる | +2（トークンごと） |
| クエリトークンがそのタイプの特徴キーワード | +1（トークンごと） |
| ドキュメント body が非空           | +1               |

**各タイプの特徴キーワード**：

- `user`：user, preference, background, role, terse
- `feedback`：feedback, rule, avoid, style, summary
- `project`：project, goal, incident, deadline, release
- `reference`：reference, dashboard, ticket, docs, link

**プロンプト構築ルール**：

- 最大 5 件のドキュメントを注入（`MAX_RELEVANT_DOCS`）
- 各ドキュメントの body は 1200 文字に切り詰め（`MAX_DOC_BODY_CHARS`）
- 切り詰めが発生した場合は注記を追加："NOTE: Relevant memory truncated for prompt budget."
- ドキュメントの鮮度情報を含める（ファイルの mtime に基づく）

---

## Forget — 忘却

### トリガータイミング

ユーザーが手動で `/forget <query>` コマンドを実行することでトリガーされます。

### 忘却フロー（`forget.ts`）

```mermaid
flowchart TD
    A[forgetManagedAutoMemoryEntries\nquery + config] --> B[ensureAutoMemoryScaffold]
    B --> C[listIndexedForgetCandidates\n全ファイルの全エントリをスキャン]
    C --> D[各エントリに安定した ID を生成\n単一エントリファイル: relativePath\n複数エントリファイル: relativePath:index]
    D --> E{Config が設定されている?}
    E -- はい --> F[selectByModel\nselection prompt を構築\nside query temperature=0 で実行]
    F --> G{モデルの選択が成功?}
    G -- はい --> H[strategy: model]
    G -- 失敗 --> I[selectByHeuristic\nキーワードマッチ]
    E -- いいえ --> I
    I --> J[strategy: heuristic]
    H --> K[選択された candidates を走査]
    J --> K
    K --> L{entries.length == 1?}
    L -- はい --> M[ファイル全体を削除\nfs.unlink]
    L -- いいえ --> N[ファイル内の全エントリを解析\n対象エントリを削除\n再レンダリングして書き戻す]
    M --> O[removedEntries を記録]
    N --> O
    O --> P{touched topics がある?}
    P -- はい --> Q[bumpMetadata\nMEMORY.md インデックスを再構築]
    P --> R[AutoMemoryForgetResult を返す]
    Q --> R
```

**Entry ID の設計**：

- 単一エントリファイル（一般的なケース）：`relativePath`（例：`feedback/no-summary.md`）
- 複数エントリファイル：`relativePath:index`（例：`feedback/style.md:2`）
- 安定した ID を使用することで、モデルが同じファイル内の他のエントリに影響を与えずにエントリを正確に特定できる

---

## インデックス再構築

`MEMORY.md` は全トピックファイルのナビゲーションインデックスであり、Extract または Dream のたびに `rebuildManagedAutoMemoryIndex` を呼び出して再構築されます。

```
- [ユーザー設定](user/preferences.md) — ユーザーはシニア Go エンジニアで、React は初めて
- [フィードバック規約](feedback/style.md) — 回答は簡潔に。末尾のまとめは不要
- [プロジェクトマイルストーン](project/milestone.md) — モバイルリリースのブランチ作成前のマージフリーズウィンドウ
```

**インデックス制限**：

- 各行最大 150 文字（超過した場合は `…` で切り詰め）
- 最大 200 行
- 合計サイズは 25,000 バイト以内

---

## テレメトリ

システムには 3 種類のテレメトリイベントが組み込まれており、記憶操作のパフォーマンスと効果を監視します。

### Extract テレメトリ

| フィールド       | 型                          | 説明                    |
| ---------------- | --------------------------- | ----------------------- |
| `trigger`        | `'auto'`                    | トリガー方式（現在は自動のみ） |
| `status`         | `'completed'` \| `'failed'` | 実行結果                |
| `patches_count`  | number                      | 抽出された有効な patch 数 |
| `touched_topics` | string[]                    | 書き込まれた記憶タイプのリスト |
| `duration_ms`    | number                      | 合計処理時間（ミリ秒）   |

### Dream テレメトリ

| フィールド        | 型                                    | 説明                   |
| ----------------- | ------------------------------------- | ---------------------- |
| `trigger`         | `'auto'`                              | トリガー方式           |
| `status`          | `'updated'` \| `'noop'` \| `'failed'` | 実行結果               |
| `deduped_entries` | number                                | 機械的パスで重複除去されたエントリ数 |
| `touched_topics`  | string[]                              | 変更された記憶タイプのリスト |
| `duration_ms`     | number                                | 合計処理時間（ミリ秒） |

### Recall テレメトリ

| フィールド      | 型                                     | 説明             |
| --------------- | -------------------------------------- | ---------------- |
| `query_length`  | number                                 | クエリ文字列の長さ |
| `docs_scanned`  | number                                 | スキャンされたドキュメントの総数 |
| `docs_selected` | number                                 | 最終的に注入されたドキュメント数 |
| `strategy`      | `'none'` \| `'heuristic'` \| `'model'` | 選択戦略         |
| `duration_ms`   | number                                 | 合計処理時間（ミリ秒） |

---

## 関連ソースファイルインデックス

| ファイル                                                 | 責務                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/core/src/memory/types.ts`                  | 型定義：`AutoMemoryType`、`AutoMemoryMetadata`、`AutoMemoryExtractCursor`   |
| `packages/core/src/memory/paths.ts`                  | パス計算：`getAutoMemoryRoot`、`isAutoMemPath`、各種ファイルパスヘルパー     |
| `packages/core/src/memory/store.ts`                  | スキャフォールド初期化：`ensureAutoMemoryScaffold`、インデックス/メタデータの読み書き |
| `packages/core/src/memory/scan.ts`                   | トピックファイルのスキャン：`scanAutoMemoryTopicDocuments`、frontmatter の解析 |
| `packages/core/src/memory/entries.ts`                | エントリの解析とレンダリング：`parseAutoMemoryEntries`、`renderAutoMemoryBody` |
| `packages/core/src/memory/extract.ts`                | 抽出コアロジック：`runAutoMemoryExtract`、カーソル管理、patch 重複除去        |
| `packages/core/src/memory/extractScheduler.ts`       | 抽出スケジューラー：`ManagedAutoMemoryExtractRuntime`、キュー/実行状態機械   |
| `packages/core/src/memory/extractionAgentPlanner.ts` | 抽出 Agent：`runAutoMemoryExtractionByAgent`                                  |
| `packages/core/src/memory/dream.ts`                  | 統合コアロジック：`runManagedAutoMemoryDream`、Agent パス + 機械的重複除去   |
| `packages/core/src/memory/dreamScheduler.ts`         | 統合スケジューラー：`ManagedAutoMemoryDreamRuntime`、ゲートチェック、ロック管理 |
| `packages/core/src/memory/dreamAgentPlanner.ts`      | 統合 Agent：`planManagedAutoMemoryDreamByAgent`                               |
| `packages/core/src/memory/recall.ts`                 | 想起ロジック：`resolveRelevantAutoMemoryPromptForQuery`、ヒューリスティック+モデルの二経路 |
| `packages/core/src/memory/forget.ts`                 | 忘却ロジック：`forgetManagedAutoMemoryEntries`、候補生成+精確削除             |
| `packages/core/src/memory/indexer.ts`                | インデックス再構築：`rebuildManagedAutoMemoryIndex`、`buildManagedAutoMemoryIndex` |
| `packages/core/src/memory/prompt.ts`                 | システムプロンプトテンプレート：記憶タイプの説明、フォーマット例、使用規約   |
| `packages/core/src/memory/governance.ts`             | ガバナンス提案タイプ：`AutoMemoryGovernanceSuggestionType`                    |
| `packages/core/src/memory/state.ts`                  | 抽出実行状態：`isExtractRunning`、`markExtractRunning`、`clearExtractRunning` |
| `packages/core/src/memory/memoryAge.ts`              | 鮮度の説明：`memoryAge`、`memoryFreshnessText`                                |
