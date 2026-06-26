# AutoSkill：自動スキル抽出システム設計ドキュメント

## 概要

本ドキュメントでは、QwenCode の既存 Memory-Dream アーキテクチャ上に、**AutoSkill** 機能を追加する設計案について説明する。

AutoSkill は **手続き記憶の自動抽出メカニズム** である。エージェントがツール呼び出しを多用するタスクを完了した後、システムがバックグラウンドで今回の会話に再利用価値のある操作手順が含まれているかどうかを静かに評価し、自動的にプロジェクトレベルのスキルとして保存する。

### Memory Extract との位置づけの違い

| 観点           | Memory Extract                               | AutoSkill                                  |
| -------------- | -------------------------------------------- | ------------------------------------------ |
| **記憶タイプ** | 宣言的記憶（ユーザーが誰か、プロジェクト背景） | 手続き記憶（特定タスクの実行方法）         |
| **トリガー**   | セッション終了後毎回                         | セッション内ツール呼び出し数が閾値に到達   |
| **書き込み先** | `${projectRoot}/.qwen/memory/`               | `${projectRoot}/.qwen/skills/`             |
| **内容の性質** | ユーザー嗜好、プロジェクトコンテキスト、フィードバックルール | 再利用可能な操作手順、ベストプラクティス |
| **ライフサイクル** | Dream が定期的に統合・トリミング          | 必要に応じて更新、review agent が管理      |

---

## コア設計原則

1. **専用書き込みツールなし**: skill review agent は汎用の `read_file`、`write_file`、`edit` ツールを使って `.qwen/skills/` を操作し、`skill_manage` 専用ツールを導入しない。メインセッションも同様に、ユーザーが手動でスキルを管理する場合も同じ汎用ツールを使用する。
2. **スキル変更検出によるツールカウントリセット代替**: memory extract が `memory_tool` 呼び出しを検出するのと同様に、システムはメインセッション内で `.qwen/skills/` ディレクトリへの書き込み操作があったかどうかを検出する。あれば、そのセッションでユーザーが既にスキルを手動操作したとみなし、セッション終了時の自動 skill review をスキップする。
3. **`auto-skill` フラグによるユーザー作成スキルの保護**: review agent が作成するスキルは YAML frontmatter に `source: auto-skill` を含める必要がある。skill review agent はこのフラグを持つスキルのみ修正でき、ユーザーが手動で作成したスキルには触れてはならない。
4. **ツール呼び出し密度によるトリガー**: セッション内のツール呼び出し累計が ≥ 20 回の場合のみトリガーし、真に複雑なタスクの後でのみ抽出する。
5. **書き込み保護境界の明確化**: review agent の権限マネージャーは `write_file`、`edit` を `${projectRoot}/.qwen/skills/` 内に制限し、user / extension / bundled レイヤーには触れさせない。
6. **Hermes コアプロンプトの最大限維持**: review agent が使用するプロンプトは Hermes の `_SKILL_REVIEW_PROMPT` から直接移植し、最小限の適応のみ行う。

---

## アーキテクチャ変更

### 1. カウンター: `toolCallCount` とスキル変更検出

セッション状態で2つの並行追跡量を維持する:

**ツール呼び出しカウンター**（skill review をトリガーするかどうかを決定）:

```
セッション開始
  toolCallCount = 0

ツール呼び出し完了毎
  toolCallCount += 1

セッション終了
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // デフォルト 20
    skillsModifiedInSession を確認
    ├─ true  → skip（今回のセッションで既に手動でスキルを操作したため自動 review 不要）
    └─ false → scheduleSkillReview()
```

**スキル変更検出**（以前の `skill_manage` 呼び出しリセットに代わる）:

```
ツール呼び出し完了毎
  if (ツール呼び出しの対象パスが ${projectRoot}/.qwen/skills/ 以下):
    skillsModifiedInSession = true
```

検出ロジック: ツール呼び出し結果に含まれるファイルパスをスキャンし、skills ディレクトリ以下かどうかを判定する。具体的な実装は `historyCallsSkillManage()` のパターンを踏襲——`history` 内の tool result を走査し、`write_file`、`edit` などの書き込み操作の対象パスを抽出してプレフィックスマッチを行う。

> **なぜツール名検出ではなくスキル変更検出なのか？**
> 専用の `skill_manage` ツールは存在せず、メインセッションと review agent はどちらも汎用の `write_file`/`edit` を使用する。したがって検出の次元が「専用ツールが呼ばれたか」から「`.qwen/skills/` ディレクトリへの書き込み操作があったか」に変わり、意味的により正確になる。つまり、ユーザーが今回のセッションですでにスキルファイルを手動操作していれば、自動 review をスキップする。

> **なぜ会話ターン数ではなくツール呼び出し回数なのか？**
> ツール呼び出し回数はタスクの複雑さを反映する——1ユーザーメッセージが1回のツール呼び出しで済むこともあれば、30回のツール呼び出しを引き起こすこともある。ツール密度が高いほど、試行錯誤や戦略調整などの行動が多く含まれ、再利用可能な経験が得られる確率が高まる。閾値を20に設定したのは、QwenCode のツール呼び出し粒度が通常より細かい（例えば一行ずつの edit）ことを考慮し、Hermes の10より保守的にしている。

### 2. スケジュールポイント

既存の `MemoryManager` 呼び出しポイント（セッション終了時）を統一エントリポイントとして拡張し、skill review も同時にスケジュールできるようにする。

```
セッション終了
  ├─ scheduleExtract(params)           // 既存ロジックは変更なし
  └─ scheduleSkillReview(params)       // 新規追加
       条件: toolCallCount >= AUTO_SKILL_THRESHOLD
             && !skillsModifiedInSession
```

extract と skill review はそれぞれ独立してスケジュールされ、`MemoryManager.track()` を通じて並行実行され、互いにブロックしない。

### 3. Skill Review Agent のツールアクセス権限

skill review agent は `skill_manage` 専用ツールを**使用せず**、代わりに汎用ファイルツールを直接使用する:

| ツール       | 用途                                    | 範囲制限                                                                  |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------- |
| `read_file`  | 既存スキルの内容を読み取り、frontmatter を確認 | 無制限                                                                    |
| `ls`         | `.qwen/skills/` のディレクトリ構造をスキャン | 無制限                                                                    |
| `write_file` | 新しいスキルファイルを作成              | `${projectRoot}/.qwen/skills/` 内のみ                                    |
| `edit`       | 既存スキルの内容を変更                  | `${projectRoot}/.qwen/skills/` 内かつ、対象ファイルに `source: auto-skill` が必要 |
| `shell`      | 読み取り専用コマンド（`cat`、`find` など）| 読み取り専用コマンドのみ（Shell AST 静的解析）                             |

**`edit` に対する追加制約（`auto-skill` 保護）**:

skill review agent の権限マネージャーは `edit` または `write_file`（既存ファイルへの上書き）を実行する前に、対象ファイルの YAML frontmatter を読み取り、`source: auto-skill` フィールドを確認する。フィールドが存在しない場合は書き込みを拒否し、エラーを返す:

```
skill_review_agent: edit is only allowed on skills with 'source: auto-skill' in frontmatter.
This skill appears to be user-created. Modify it manually or ask the user.
```

このチェックは `createSkillScopedAgentConfig` の権限レイヤーで実装され、system prompt のみに依存しないため、モデルが誤ってもユーザー作成のスキルを上書きしない。

**メインセッション内のツールアクセス**: メインエージェントは `.qwen/skills/` への読み書きを制限しない。ユーザーは通常の `write_file`/`edit` 命令でスキルを管理できる。そのような操作は `skillsModifiedInSession = true` をトリガーし、セッション終了時の自動 skill review をスキップさせる。

### 4. 権限サンドボックス: `SkillScopedPermissionManager`

`extractionAgentPlanner.ts` の `createMemoryScopedAgentConfig` を参考に、skill review agent 専用の権限スコープを作成する:

```typescript
// skill review agent で許可される操作
read_file:    パス制限なし（プロジェクトコンテキストを理解するために任意のファイル読み取りが必要）
ls:           パス制限なし
shell:        読み取り専用コマンド（Shell AST 静的解析、既存の isShellCommandReadOnlyAST を再利用）
write_file:   ${projectRoot}/.qwen/skills/ 以下のファイルのみ（新規スキル作成）
edit:         ${projectRoot}/.qwen/skills/ 内かつ、対象ファイルに source: auto-skill が含まれている場合のみ
```

**`auto-skill` 保護の実装レイヤー**:

1. **権限マネージャーレイヤー**（ハード制約）: `edit` 前に frontmatter を読み取り、`source: auto-skill` がなければ拒否
2. **System prompt レイヤー**（ソフト制約）: エージェントに `source: auto-skill` を持つスキルのみ変更可能であることを明示的に伝える
3. **二重保証**: system prompt の制約がバイパスされても、権限マネージャーがインターセプトする

---

## Skill Review Agent 設計

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

### Agent 設定

```typescript
{
  name: "managed-skill-extractor",
  tools: [
    "read_file",   // 既存のスキル内容を読み取り、source: auto-skill を確認
    "ls",          // .qwen/skills/ ディレクトリをスキャン
    "write_file",  // 新しいスキルファイルを作成（権限マネージャーがパス制限）
    "edit",        // 既存の auto-skill を更新（権限マネージャーが frontmatter 検証）
    "shell",       // 読み取り専用コマンド（find、cat など）
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // 完全な会話履歴スナップショットを渡す
}
```

---

## 既存の MemoryManager との統合

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
  // 1. 設定によるゲート
  if (params.enabled === false) {
    return { status: 'skipped', skippedReason: 'disabled' };
  }

  // 2. 閾値チェック
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. 今回のセッションで既に手動操作した場合は自動 review をスキップ
  if (params.skillsModified) {
    return { status: 'skipped', skippedReason: 'skills_modified_in_session' };
  }

  // 4. 独立スケジュール
  const record = makeTaskRecord('skill-review', params.projectRoot, params.sessionId);
  const promise = this.track(record.id, this.runSkillReview(record, params));
  return { status: 'scheduled', taskId: record.id, promise };
}
```

### タスクタイプの拡張

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
  agent メインループ
    ├─ ツール呼び出し毎 → toolCallCount += 1
    └─ 書き込み操作の対象パスが ${projectRoot}/.qwen/skills/ 以下であれば
         → skillsModifiedInSession = true

セッション終了（sessionEnd イベント）
  ├─ scheduleExtract(params)
  │     └─ [既存ロジック: extraction agent を fork → .qwen/memory/ に書き込み]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ いいえ → skip（密度不足 または 今回のセッションで既に手動操作）
       └─ はい → scheduleSkillReview(params)
                   └─ skill review agent を独立 fork
                          ↓
                 skill review agent（最大8ターン、2分、サンドボックス権限）
                 ツール: read_file, ls, write_file, edit, shell
                 完全な sessionHistory を渡す
                          ↓
                 モデルが再利用可能な方法があるか判断
                 ├─ あり → 既存スキルを読み取り（source: auto-skill を確認）
                 │         → write_file で新規スキルを作成（source: auto-skill を含む）
                 │         → edit で既存の auto-skill を更新
                 │         → SkillManager のキャッシュを無効化（notifyChangeListeners）
                 └─ なし → "Nothing to save." で終了

次回セッション
  SkillManager.listSkills({ level: 'project' })
  → .qwen/skills/ をスキャンして新しく作成されたスキルを検出
  → system prompt の <available_skills> ブロックに注入（Tier 1）
```

---

## SKILL.md フォーマット規約（project-level）

自動抽出されたスキルは `${projectRoot}/.qwen/skills/<name>/SKILL.md` に書き込まれ、既存の SkillManager と完全互換のフォーマット:

```yaml
---
name: <skill-name> # 必須、小文字とハイフン
description: <description> # 必須、1024文字以内
version: 1.0.0
metadata:
  source: auto-skill # 必須（review agent 作成時に強制書き込み）
  extracted_at: '2026-04-24T12:00:00Z'
---
# <スキルタイトル>

<操作手順 / ベストプラクティス / 注意事項>
```

**`source: auto-skill` の制約セマンティクス**:

| フラグ値      | 作成元       | skill review agent が変更可能？ | ユーザーが変更可能？ |
| ------------- | ------------ | ------------------------------- | -------------------- |
| `auto-skill`  | review agent | ✅ 可能                         | ✅ 可能              |
| フィールドなし | ユーザー手動作成 | ❌ 不可（権限マネージャーが拒否） | ✅ 可能              |

ユーザーが自分で作成したスキルに `source: auto-skill` を追加すれば、review agent が後で自動更新することを許可したことになる。

---

## セキュリティ考慮

| リスク                                       | 緩和策                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 自動抽出がユーザーが丹念に書いたスキルを上書き | 権限マネージャーが frontmatter を読み取り、`source: auto-skill` がない場合は `edit` を拒否。system prompt でも auto-skill のみ変更可能と明示 |
| スキルが無限に増加                           | review prompt で「既存スキルを優先的に更新する」と明示。新規作成よりも既存スキル更新を優先                                   |
| プロジェクト外のパスへの書き込み             | `write_file`/`edit` の権限を `${projectRoot}/.qwen/skills/` 内に制限。`assertRealProjectSkillPath` が symlink 越えを拒否  |
| インジェクションリスクのある内容を抽出       | 既存のコンテンツセキュリティスキャンロジックを再利用                                                                       |
| review agent がスキルを削除                  | review agent のツールセットに削除操作（`rm`、`shell` 書き込み）を含めない。system prompt で削除禁止を明示                  |
| メインセッションで手動操作後も review がトリガー | `skillsModifiedInSession` 検出: メインセッションでの `.qwen/skills/` への書き込み操作があれば review をスキップ           |
| symlink 越えで skills ディレクトリ以外に書き込み | `assertRealProjectSkillPath`（非同期）: `fs.realpath()` で実際のパスを解決し、真の skills root 内であることを確認してから書き込み許可 |

---

## 設定項目

QwenCode config に以下のオプション設定を追加（任意、デフォルト値あり）:

```typescript
// config schema に追加（memory の下）
memory?: {
  enableAutoSkill?: boolean;   // デフォルト true
}
```

対応する QWEN.md / `~/.qwen/config.json` の設定例:

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## E2E テスト項目

機能実装完了後、`.qwen/skills/e2e-testing/SKILL.md` のフローに従い、まず `npm run build && npm run bundle` を実行し、ローカルビルド成果物 `node dist/cli.js` を使用してエンドツーエンド検証を行う。

### 1. 低ツール呼び出し密度ではトリガーしない

- 一時的なプロジェクトディレクトリで headless モードを実行。
- `memory.enableAutoSkill: true` に設定。
- ツール呼び出しが少ない単純なタスクを実行し、セッションを正常終了。
- `.qwen/skills/` に `source: auto-skill` を持つスキルが追加されていないことをアサート。JSON ストリームに `.qwen/skills/` への書き込み操作が現れないこと。

### 2. 閾値到達後に skill review がトリガーされる

- 一時的なプロジェクトディレクトリで headless モードを実行（`AUTO_SKILL_THRESHOLD` はハードコードで20、テストフィクスチャで下げても可）。
- ツール呼び出しを複数回必要とし、かつ再利用可能な手順を含むタスクを送信。
- セッション終了後、skill review がスケジュールされたことをアサート。モデルが保存価値ありと判断した場合、`.qwen/skills/<name>/SKILL.md` が作成され、frontmatter に `source: auto-skill` が含まれていること。
- モデルが `Nothing to save.` と判断した場合、プロセスが正常終了し、権限エラーが発生しないことをアサート。

### 3. メインセッションでスキルを操作した後は review がスキップされる

- ツール呼び出しが閾値に達するセッションを構成し、同時に `write_file` または `edit` で `.qwen/skills/` 下のファイルに書き込みを行う（ユーザーが手動でスキルを管理するシミュレーション）。
- セッション終了時に `skillsModifiedInSession = true` となり、`scheduleSkillReview` が `skippedReason: 'skills_modified_in_session'` を返すことをアサート。
- review agent が起動されず、重複書き込みが行われないことをアサート。

### 4. 書き込み保護により project-level のスキルのみ許可される

- skill review agent にプロジェクト外のパス、user-level スキルパス、bundled スキルパスへの書き込みを試行させる。
- 書き込みが拒否され、エラーメッセージが `${projectRoot}/.qwen/skills/` のみ書き込み可能であることを示すことをアサート。
- `${projectRoot}/.qwen/skills/<name>/SKILL.md` への書き込みは許可されることをアサート。

### 5. `auto-skill` フラグがユーザー作成スキルを保護する

- `.qwen/skills/` に `source: auto-skill` を持たないユーザー作成スキルを事前配置。
- skill review agent をトリガーし、モデルにそのスキルを変更させようと誘導。
- 権限マネージャーによって書き込みが拒否され、エラーメッセージがそのスキルが auto-skill ではないことを示すことをアサート。
- 同じディレクトリ内で `source: auto-skill` を持つスキルは正常に更新できることをアサート。

### 6. symlink 越えが拒否される

- `.qwen/skills/` 下にプロジェクト外のディレクトリを指す symlink を作成。
- skill review agent にその symlink パスへの書き込みを試行させる。
- `assertRealProjectSkillPath` が書き込みを拒否し、`symlink traversal detected` エラーを返すことをアサート。

### 7. 設定スイッチが有効に機能する

- `memory.enableAutoSkill: false` に設定し、ツール呼び出し回数が閾値を超えてもトリガーされないことを確認。
- デフォルトで有効（`enableAutoSkill` 未設定または true）の場合、ツール呼び出しが閾値に達すると正常にトリガーされることを確認。

### 8. ローカルビルド成果物の検証

- e2e-testing skill に従い、headless JSON 出力を使用:
  `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`
- 必要に応じて `--openai-logging --openai-logging-dir <tmp-dir>` を追加し、リクエストボディ内のツールスキーマ、プロンプト、権限設定を確認。
- TUI や sessionEnd の可視状態に関わるシナリオでは、tmux interactive フローを使用して最終出力をキャプチャする。

## 既存システムとの関係

```
既存の MemoryManager
  ├─ scheduleExtract()       ← 変更なし
  ├─ scheduleDream()         ← 変更なし
  ├─ recall()                ← 変更なし
  ├─ forget()                ← 変更なし
  └─ scheduleSkillReview()   ← 新規追加（本ドキュメント）

既存の SkillManager
  ├─ listSkills()            ← 変更なし（.qwen/skills/ 下の新規ファイルを自動検出）
  └─ loadSkill()             ← 変更なし

既存のファイルツール（read_file / write_file / edit）
  ├─ メインセッション: ユーザーはこれらのツールを使って手動でスキル管理可能
  │   └─ .qwen/skills/ への書き込み操作 → skillsModifiedInSession = true
  └─ skill review agent: 直接使用して auto-skill を作成・更新
      └─ 権限マネージャーがパス制限 + source: auto-skill を検証

トリガーポイント（既存の sessionEnd hook）
  └─ scheduleExtract と scheduleSkillReview を同時に呼び出し（条件を満たす場合）
```

SkillManager の読み取り側（`listSkills`、`loadSkill`）は全く修正不要。review agent が `${projectRoot}/.qwen/skills/` に書き込んだ後、`SkillManager` は既存の `chokidar` ファイル監視を通じて変更を自動検出し、`notifyChangeListeners()` を呼び出してキャッシュをリフレッシュする。次回の会話では自然に system prompt 内で新しいスキルが利用可能になる。