# AutoSkill：自動スキル抽出システム設計ドキュメント

## 概要

本ドキュメントでは、Qwen Code の既存 Memory-Dream アーキテクチャを基盤として **AutoSkill** 機能を追加する設計方針を説明します。

AutoSkill は**手続き記憶の自動抽出メカニズム**です。エージェントがツール呼び出しを多数含むタスクを完了した後、システムはバックグラウンドで今回の会話に再利用可能な操作フローが含まれているかを評価し、プロジェクトレベルの skill として自動保存します。

### Memory Extract との位置づけの違い

| 次元             | Memory Extract                       | AutoSkill                          |
| ---------------- | ------------------------------------ | ---------------------------------- |
| **記憶の種類**   | 宣言的記憶（ユーザー情報・プロジェクト背景） | 手続き記憶（特定タスクの実行方法）  |
| **トリガー**     | 会話終了ごと                         | 会話内のツール呼び出し数が閾値到達 |
| **書き込み先**   | `${projectRoot}/.qwen/memory/`       | `${projectRoot}/.qwen/skills/`     |
| **内容の性質**   | ユーザー設定・プロジェクトコンテキスト・フィードバックルール | 再利用可能な操作手順・ベストプラクティス |
| **ライフサイクル** | Dream が定期的に統合・整理          | 必要に応じて更新、review agent が維持 |

---

## コア設計原則

1. **専用書き込みツールなし**：skill review agent は汎用の `read_file`、`write_file`、`edit` ツールを使って `.qwen/skills/` を直接操作します。専用の `skill_manage` ツールは導入しません。主会話も同様で、ユーザーが手動で skill を管理する場合も同じ汎用ツールを使います。
2. **ツール呼び出し数リセットではなく skill 変更検出**：memory extract が `memory_tool` 呼び出しを検出するのと同じ方式で、システムは主会話で `.qwen/skills/` 配下への書き込み操作が発生したかを検出します。発生していた場合、ユーザーが今回のセッションで skill を手動操作したとみなし、セッション終了時の自動 skill review をスキップします。
3. **`auto-skill` フラグによるユーザー作成 skill の保護**：review agent が作成した skill の YAML frontmatter には `source: auto-skill` を必ず含めます。skill review agent はこのフラグを持つ skill のみ変更でき、ユーザーが手動で作成した skill には触れません。
4. **ツール呼び出し密度によるトリガー**：セッション内のツール呼び出しが累計 ≥ 20 回に達した場合のみトリガーし、本当に複雑なタスクの後にのみ抽出を行います。
5. **明確な書き込み保護境界**：review agent の権限マネージャーは `write_file`・`edit` を `${projectRoot}/.qwen/skills/` 内に制限し、user / extension / bundled レイヤーには触れられません。
6. **Hermes コアプロンプトの最大限保持**：review agent で使用するプロンプトは Hermes の `_SKILL_REVIEW_PROMPT` から直接移植し、最小限の適応のみ行います。

---

## アーキテクチャの変更

### 1. カウンター：`toolCallCount` と skill 変更検出

セッション状態で 2 つの並行追跡値を管理します。

**ツール呼び出しカウンター**（skill review トリガー判定用）：

```
セッション開始
  toolCallCount = 0

ツール呼び出し完了のたびに
  toolCallCount += 1

セッション終了
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // デフォルト 20
    skillsModifiedInSession を確認
    ├─ true  → skip（今回すでに手動で skill を操作済み、自動 review 不要）
    └─ false → scheduleSkillReview()
```

**skill 変更検出**（従来の `skill_manage` 呼び出しリセットの代替）：

```
ツール呼び出し完了のたびに
  if (ツール呼び出しの対象パスが ${projectRoot}/.qwen/skills/ 配下):
    skillsModifiedInSession = true
```

検出ロジック：ツール呼び出し結果に含まれるファイルパスをスキャンし、skills ディレクトリ配下かを判定します。具体的な実装は `historyCallsSkillManage()` のパターンを参照し、`history` 内の tool result を走査して `write_file`・`edit` などの書き込み操作の対象パスをプレフィックスマッチします。

> **なぜツール名検出ではなく skill 変更検出を使うのか？**
> 専用の `skill_manage` ツールはなくなり、主会話も review agent も汎用の `write_file`/`edit` を使います。そのため、検出の軸を「特定の専用ツールを呼び出したか」から「`.qwen/skills/` 配下への書き込み操作が発生したか」に変更しました。語義がより正確になり、ユーザーが今回のセッションで skill ファイルを手動操作した場合は自動 review をスキップします。

> **なぜ会話ターン数ではなくツール呼び出し数を使うのか？**
> ツール呼び出し数はタスクの複雑度を反映します。1 つのユーザーメッセージが 1 回のツール呼び出しを引き起こすこともあれば、30 回引き起こすこともあります。ツール密度が高いほど試行錯誤や戦略変更が多く、再利用可能な知見が生まれる確率も高くなります。閾値を Hermes の 10 より保守的な 20 にしているのは、Qwen Code のツール呼び出し粒度が通常より細かい（行単位の edit など）ためです。

### 2. スケジューリングポイント

既存の `MemoryManager` 呼び出しポイント（セッション終了時）を統一スケジューリングエントリとして使い、skill review も同時にスケジュールできるよう拡張します。

```
セッション終了
  ├─ scheduleExtract(params)           // 既存ロジックは変更なし
  └─ scheduleSkillReview(params)       // 新規追加
       条件：toolCallCount >= AUTO_SKILL_THRESHOLD
             && !skillsModifiedInSession
```

extract と skill review はそれぞれ独立してスケジュールされ、`MemoryManager.track()` を通じて並列実行され、互いをブロックしません。

### 3. Skill Review Agent のツールアクセス権限

skill review agent は専用の `skill_manage` ツールを**使用せず**、汎用ファイルツールを直接使用します。

| ツール       | 用途                                          | スコープ制限                                                                          |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `read_file`  | 既存 skill の内容を読み込み frontmatter を確認 | 制限なし                                                                              |
| `ls`         | `.qwen/skills/` ディレクトリ構造をスキャン    | 制限なし                                                                              |
| `write_file` | 新規 skill ファイルを作成                     | `${projectRoot}/.qwen/skills/` 内のみ                                                 |
| `edit`       | 既存 skill の内容を更新                       | `${projectRoot}/.qwen/skills/` 内のみ、かつ対象ファイルに `source: auto-skill` が必要 |
| `shell`      | 読み取り専用コマンド（`cat`、`find` など）    | 読み取り専用コマンドのみ（Shell AST 静的解析）                                        |

**`edit` への追加制約（`auto-skill` 保護）**：

skill review agent の権限マネージャーは、`edit` または `write_file`（既存ファイルへの上書き）を実行する前に、対象ファイルの YAML frontmatter を読み込んで `source: auto-skill` フィールドを確認します。フィールドが存在しない場合は書き込みを拒否し、次のエラーを返します。

```
skill_review_agent: edit is only allowed on skills with 'source: auto-skill' in frontmatter.
This skill appears to be user-created. Modify it manually or ask the user.
```

このチェックは `createSkillScopedAgentConfig` の権限レイヤーで実装されており、system prompt だけに頼りません。モデルが誤動作してもユーザーが手動で書いた skill が上書きされることはありません。

**主会話でのツールアクセス**：主エージェントは `.qwen/skills/` への読み書きを制限されません。ユーザーは通常の `write_file`/`edit` 命令で skill を管理できます。このような操作は `skillsModifiedInSession = true` をセットし、セッション終了時の自動 skill review をスキップさせます。

### 4. 権限サンドボックス：`SkillScopedPermissionManager`

`extractionAgentPlanner.ts` の `createMemoryScopedAgentConfig` を参考に、skill review agent 専用の権限スコープを作成します。

```typescript
// skill review agent に許可された操作
read_file:    パス制限なし（プロジェクトコンテキスト把握のため任意ファイルの読み取りが必要）
ls:           パス制限なし
shell:        読み取り専用コマンド（Shell AST 静的解析、既存の isShellCommandReadOnlyAST を再利用）
write_file:   ${projectRoot}/.qwen/skills/ 配下のファイルのみ（新規 skill 作成）
edit:         ${projectRoot}/.qwen/skills/ 内のみ、かつ対象ファイルに source: auto-skill が必要
```

**`auto-skill` 保護の実装レイヤー**：

1. **権限マネージャーレイヤー**（ハード制約）：`edit` 前に frontmatter を読み込み、`source: auto-skill` がなければ拒否
2. **System prompt レイヤー**（ソフト制約）：`source: auto-skill` フラグを持つ skill のみ変更可能とエージェントに明示
3. **二重保護**：system prompt の制約が回避されても、権限マネージャーがインターセプト

---

## Skill Review Agent の設計

### トリガープロンプト（Hermes から移植、最小限の適応）

```
Review the conversation above and consider saving or updating a skill if appropriate.

Focus on: was a non-trivial approach used to complete a task that required trial
and error, or changing course due to experiential findings along the way, or did
the user expect or desire a different method or outcome? If a relevant skill
already exists and has 'source: auto-skill' in its frontmatter, update it with
what you learned. Otherwise, create a new skill if the approach is reusable.

IMPORTANT constraints:
- You may ONLY modify skill files that contain 'source: auto-skill' in their
  YAML frontmatter. Always read a skill file before editing it.
- Do NOT touch skills that lack this marker — they were created by the user.
- When creating a new skill, you MUST include 'source: auto-skill' in the
  frontmatter so future review agents can safely update it.
- Do NOT delete any skill. Only create or update.

If nothing is worth saving, just say 'Nothing to save.' and stop.

Skills are saved to the current project (.qwen/skills/).
Use write_file to create a new skill, edit to update an existing auto-skill.
Each skill lives at .qwen/skills/<name>/SKILL.md with YAML frontmatter:

---
name: <skill-name>
description: <one-line description>
metadata:
  source: auto-skill
  extracted_at: '<ISO-8601 timestamp>'
---

<markdown body with the procedure/approach>
```

### エージェント設定

```typescript
{
  name: "managed-skill-extractor",
  tools: [
    "read_file",   // 既存 skill の内容を読み込み source: auto-skill を確認
    "ls",          // .qwen/skills/ ディレクトリをスキャン
    "write_file",  // 新規 skill ファイルを作成（権限マネージャーがパスを制限）
    "edit",        // 既存の auto-skill を更新（権限マネージャーが frontmatter を検証）
    "shell",       // 読み取り専用コマンド（find、cat など）
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // 完全な会話履歴スナップショットを渡す
}
```

---

## 既存 MemoryManager との統合

### `ScheduleSkillReviewParams`（新規型）

```typescript
export interface ScheduleSkillReviewParams {
  projectRoot: string;
  sessionId: string;
  history: Content[]; // 完全な会話履歴スナップショット
  toolCallCount: number; // 今回のセッションのツール呼び出し回数
  skillsModified: boolean; // 今回のセッションで .qwen/skills/ への書き込み操作があったか
  config?: Config;
  enabled?: boolean;
  threshold?: number;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface SkillReviewScheduleResult {
  status: 'scheduled' | 'skipped';
  taskId?: string;
  skippedReason?: 'below_threshold' | 'skills_modified_in_session' | 'disabled';
}
```

### `MemoryManager.scheduleSkillReview()`（新規メソッド）

```typescript
scheduleSkillReview(params: ScheduleSkillReviewParams): SkillReviewScheduleResult {
  // 1. 設定ゲート
  if (params.enabled === false) {
    return { status: 'skipped', skippedReason: 'disabled' };
  }

  // 2. 閾値チェック
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. 今回のセッションで skill を手動操作済みの場合はスキップ
  if (params.skillsModified) {
    return { status: 'skipped', skippedReason: 'skills_modified_in_session' };
  }

  // 4. 独立スケジュール
  const record = makeTaskRecord('skill-review', params.projectRoot, params.sessionId);
  const promise = this.track(record.id, this.runSkillReview(record, params));
  return { status: 'scheduled', taskId: record.id, promise };
}
```

### タスク型の拡張

```typescript
// 既存の MemoryTaskRecord.taskType を拡張
export type MemoryTaskType = 'extract' | 'dream' | 'skill-review';

// 定数
export const AUTO_SKILL_THRESHOLD = 20; // ツール呼び出し回数の閾値
```

---

## データフロー

```
セッション進行中
  エージェントのメインループ
    ├─ ツール呼び出しのたびに → toolCallCount += 1
    └─ 書き込み操作の対象パスが ${projectRoot}/.qwen/skills/ 配下の場合
         → skillsModifiedInSession = true

セッション終了（sessionEnd イベント）
  ├─ scheduleExtract(params)
  │     └─ [既存ロジック：extraction agent をフォーク → .qwen/memory/ に書き込み]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ いいえ → skip（密度不足 または 今回のセッションで skill を手動操作済み）
       └─ はい → scheduleSkillReview(params)
                 └─ 独立した skill review agent をフォーク
                        ↓
                 skill review agent（最大 8 ターン、2 分、サンドボックス権限）
                 ツール：read_file, ls, write_file, edit, shell
                 完全な sessionHistory を渡す
                        ↓
                 モデルが再利用可能なアプローチがあるか判断
                 ├─ あり → 既存 skill を読み込む（source: auto-skill を確認）
                 │         → write_file で新規 skill を作成（source: auto-skill を含む）
                 │         → edit で既存の auto-skill を更新
                 │         → SkillManager キャッシュを無効化（notifyChangeListeners）
                 └─ なし → "Nothing to save." で終了

次回のセッション
  SkillManager.listSkills({ level: 'project' })
  → .qwen/skills/ をスキャンして新規作成された skill を発見
  → system prompt の <available_skills> ブロックに注入（Tier 1）
```

---

## SKILL.md フォーマット規約（project-level）

自動抽出された skill は `${projectRoot}/.qwen/skills/<name>/SKILL.md` に書き込まれ、フォーマットは既存の SkillManager と完全に互換します。

```yaml
---
name: <skill-name> # 必須、小文字アルファベット + ハイフン
description: <description> # 必須、≤ 1024 文字
version: 1.0.0
metadata:
  source: auto-skill # 必須（review agent 作成時に強制的に書き込む）
  extracted_at: '2026-04-24T12:00:00Z'
---
# <スキルタイトル>

<操作手順 / ベストプラクティス / 注意事項>
```

**`source: auto-skill` の制約セマンティクス**：

| フラグ値     | 作成者         | skill review agent が変更可能？ | ユーザーが変更可能？ |
| ------------ | -------------- | ------------------------------- | -------------------- |
| `auto-skill` | review agent   | ✅ 可                           | ✅ 可                |
| フィールドなし | ユーザーが手動作成 | ❌ 不可（権限マネージャーが拒否） | ✅ 可             |

ユーザーが自分で作成した skill に `source: auto-skill` を追加した場合、review agent による自動更新を許可するという意思表示になります。

---

## セキュリティ考慮事項

| リスク                                     | 緩和策                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 自動抽出がユーザーの精巧な skill を上書き  | 権限マネージャーが frontmatter を読み込み、`source: auto-skill` がなければ `edit` を拒否。system prompt でも auto-skill のみ変更可と明示 |
| skill の無制限な増加                        | review プロンプトで「既存 skill の更新を優先」と明示。新規作成より更新を優先                                                   |
| プロジェクト外パスへの書き込み              | `write_file`/`edit` の権限を `${projectRoot}/.qwen/skills/` 内に制限。`assertRealProjectSkillPath` が symlink トラバーサルを拒否 |
| インジェクションリスクのある内容の抽出      | 既存のコンテンツセキュリティスキャンロジックを再利用                                                                          |
| review agent が skill を削除               | review agent のツールセットに削除操作なし（`rm` なし、`shell` 書き込みなし）。system prompt でも削除を明示的に禁止           |
| 主会話で skill を手動操作後も review がトリガー | `skillsModifiedInSession` 検出：主会話で `.qwen/skills/` への書き込みがあれば review をスキップ                          |
| symlink トラバーサルで skills ディレクトリ外への書き込み | `assertRealProjectSkillPath`（async）：`fs.realpath()` で実際のパスを解決し、実際の skills root 内であることを確認してから書き込みを許可 |

---

## 設定項目

Qwen Code の config に以下の設定項目を追加します（任意、デフォルト値あり）。

```typescript
// config schema に追加（memory 配下）
memory?: {
  enableAutoSkill?: boolean;   // デフォルト true
}
```

QWEN.md / `~/.qwen/config.json` の設定例：

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## E2E テストチェックリスト

機能実装完了後、`.qwen/skills/e2e-testing/SKILL.md` の手順に従い、`npm run build && npm run bundle` を実行してから、ローカルビルド成果物 `node dist/cli.js` でエンドツーエンド検証を行います。

### 1. ツール呼び出し密度が低い場合はトリガーしない

- 一時プロジェクトディレクトリを使って headless モードで実行。
- `memory.enableAutoSkill: true` を設定。
- ツール呼び出しが少ない簡単なタスクを実行してセッションを正常終了。
- `.qwen/skills/` に `source: auto-skill` の skill が追加されていないことをアサート。JSON ストリームに `.qwen/skills/` への書き込み操作が含まれないことを確認。

### 2. 閾値到達後に skill review がトリガーされる

- 一時プロジェクトディレクトリを使って headless モードで実行（`AUTO_SKILL_THRESHOLD` はハードコードで 20、テストフィクスチャで下げることも可能）。
- 複数のツール呼び出しが必要で再利用可能なフローを含むタスクを送信。
- セッション終了後に skill review がスケジュールされていることをアサート。モデルが保存価値ありと判断した場合、`.qwen/skills/<name>/SKILL.md` が作成され、frontmatter に `source: auto-skill` が含まれることを確認。
- モデルが `Nothing to save.` と判断した場合、プロセスが正常終了し権限エラーがないことをアサート。

### 3. 主会話で skill を操作した後は review をスキップ

- ツール呼び出しが閾値に達しながら、同時に `write_file` または `edit` で `.qwen/skills/` 配下のファイルに書き込む会話を構成（ユーザーが手動で skill を管理する状況をシミュレート）。
- セッション終了時に `skillsModifiedInSession = true` となり、`scheduleSkillReview` が `skippedReason: 'skills_modified_in_session'` を返すことをアサート。
- review agent が起動しないことをアサートし、二重書き込みを防ぐ。

### 4. 書き込み保護で project-level skills のみ許可

- skill review agent を通じてプロジェクト外パス、user-level skill パス、bundled skill パスへの書き込みを試みる。
- 書き込みが拒否され、エラーメッセージが `${projectRoot}/.qwen/skills/` のみ書き込み可能であることを示すことをアサート。
- `${projectRoot}/.qwen/skills/<name>/SKILL.md` への書き込みは許可されることをアサート。

### 5. `auto-skill` フラグがユーザー作成の skill を保護する

- `.qwen/skills/` に `source: auto-skill` のないユーザー作成 skill を事前配置。
- skill review agent をトリガーし、モデルがその skill を変更しようとするよう誘導。
- 書き込みが権限マネージャーに拒否され、エラーメッセージがその skill は auto-skill ではないと説明することをアサート。
- 同ディレクトリ内の `source: auto-skill` を持つ skill は正常に更新できることをアサート。

### 6. symlink トラバーサルが拒否される

- `.qwen/skills/` 配下にプロジェクト外ディレクトリを指す symlink を作成。
- skill review agent がその symlink パスへの書き込みを試みるようトリガー。
- `assertRealProjectSkillPath` が書き込みを拒否し、`symlink traversal detected` エラーを返すことをアサート。

### 7. 設定スイッチが有効に機能する

- `memory.enableAutoSkill: false` を設定し、ツール呼び出し数が閾値を超えてもトリガーしないことを確認。
- デフォルト有効時（`enableAutoSkill` が未設定または `true`）、ツール呼び出しが閾値に達した後に正常にトリガーされることを確認。

### 8. ローカルビルド成果物での検証

- e2e-testing skill に従い headless JSON 出力を使用：
  `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`。
- 必要に応じて `--openai-logging --openai-logging-dir <tmp-dir>` を追加し、リクエストボディ内のツール schema・プロンプト・権限設定を確認。
- TUI または sessionEnd の可視状態が関わるシナリオでは、tmux インタラクティブフローで最終出力をキャプチャ。

## 既存システムとの関係

```
既存の MemoryManager
  ├─ scheduleExtract()       ← 変更なし
  ├─ scheduleDream()         ← 変更なし
  ├─ recall()                ← 変更なし
  ├─ forget()                ← 変更なし
  └─ scheduleSkillReview()   ← 新規追加（本ドキュメント）

既存の SkillManager
  ├─ listSkills()            ← 変更なし（.qwen/skills/ 配下の新規ファイルを自動検出）
  └─ loadSkill()             ← 変更なし

既存のファイルツール（read_file / write_file / edit）
  ├─ 主会話内：ユーザーがこれらのツールで skill を手動管理できる
  │   └─ .qwen/skills/ への書き込み操作 → skillsModifiedInSession = true
  └─ skill review agent 内：auto-skill の作成・更新に直接使用
      └─ 権限マネージャーがパスを制限 + source: auto-skill を検証

トリガーポイント（既存の sessionEnd フック）
  └─ scheduleExtract + scheduleSkillReview を同時に呼び出す（条件を満たす場合）
```

SkillManager の読み取り側（`listSkills`、`loadSkill`）は一切変更不要です。review agent が `${projectRoot}/.qwen/skills/` に書き込んだ後、`SkillManager` は既存の `chokidar` ファイル監視で変更を自動検出し、`notifyChangeListeners()` を呼び出してキャッシュを更新します。次回の会話では system prompt に新しい skill が自然に表示されます。
