# コードレビュー

> `/review` を使用して、コード変更の正確性、セキュリティ、パフォーマンス、コード品質をレビューします。

## クイックスタート

```bash
# ローカルの未コミット変更をレビュー
/review

# プルリクエストをレビュー（番号または URL で指定）
/review 123
/review https://github.com/org/repo/pull/123

# レビューして PR にインラインコメントを投稿
/review 123 --comment

# 特定のファイルをレビュー
/review src/utils/auth.ts
```

未コミットの変更がない場合、`/review` はその旨を通知して処理を停止します。エージェントは起動されません。

## 動作の仕組み

`/review` コマンドは、以下のマルチステージパイプラインを実行します：

```
Step 1:  Determine scope (local diff / PR worktree / file)
Step 2:  Load project review rules
Step 3:  Run deterministic analysis (linter, typecheck)    [zero LLM cost]
Step 4:  5 parallel review agents                          [5 LLM calls]
           |-- Agent 1: Correctness & Security
           |-- Agent 2: Code Quality
           |-- Agent 3: Performance & Efficiency
           |-- Agent 4: Undirected Audit
           '-- Agent 5: Build & Test (runs shell commands)
Step 5:  Deduplicate --> Batch verify --> Aggregate         [1 LLM call]
Step 6:  Reverse audit (find coverage gaps)                 [1 LLM call]
Step 7:  Present findings + verdict
Step 8:  Autofix (user-confirmed, optional)
Step 9:  Post PR inline comments (if requested)
Step 10: Save report + incremental cache
Step 11: Clean up (remove worktree + temp files)
```

### レビューエージェント

| Agent                             | Focus                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Agent 1: 正確性とセキュリティ     | 論理エラー、null 処理、競合状態、インジェクション、XSS、SSRF       |
| Agent 2: コード品質               | スタイルの一貫性、命名規則、重複コード、デッドコード               |
| Agent 3: パフォーマンスと効率     | N+1 クエリ、メモリリーク、不要な再レンダリング、バンドルサイズ     |
| Agent 4: 非特定監査               | ビジネスロジック、境界間の相互作用、隠れた結合                     |
| Agent 5: ビルドとテスト           | ビルドおよびテストコマンドを実行し、失敗を報告                     |

すべてのエージェントは並列で実行されます。Agent 1〜4 からの発見事項は、**単一のバッチ検証パス**で検証されます（1つのエージェントがすべての発見事項を一度にレビューし、LLM 呼び出し数を固定します）。検証後、**リバース監査エージェント**が確認済みのすべての発見事項を踏まえた上で差分全体を再読込し、他のエージェントが見逃した問題を捕捉します。リバース監査による発見事項は検証ステップをスキップし（エージェントが既に完全なコンテキストを把握しているため）、高信頼度の結果として直接含まれます。

## 決定論的分析

LLM エージェントの実行前に、`/review` はプロジェクトの既存のリンターと型チェッカーを自動的に実行します：

| Language              | Tools detected                                                   |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                         |
| Python                | `ruff`, `mypy`, `flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`, `golangci-lint`                                        |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                   |
| C/C++                 | `clang-tidy` (if `compile_commands.json` available)              |
| Other                 | Auto-discovered from CI config (`.github/workflows/*.yml`, etc.) |

標準的なパターンに一致しないプロジェクト（例：OpenJDK）の場合、`/review` は CI 設定ファイルを読み取り、プロジェクトが使用する lint/check コマンドを特定します。ユーザーによる設定は不要です。

決定論的分析の結果には `[linter]` または `[typecheck]` タグが付けられ、LLM 検証をスキップします。これらは確実な事実として扱われます。

- **Errors** → Critical（重大）
- **Warnings** → Nice to have（推奨事項）（ターミナルのみ表示、PR コメントには投稿されません）

ツールがインストールされていないかタイムアウトした場合、情報メッセージを出力してスキップされます。

## 重要度レベル

| Severity         | Meaning                                                             | Posted as PR comment?      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critical**     | マージ前に修正必須（バグ、セキュリティ、データ損失、ビルド失敗）    | はい（高信頼度のみ）       |
| **Suggestion**   | 改善推奨                                                            | はい（高信頼度のみ）       |
| **Nice to have** | オプションの最適化                                                    | いいえ（ターミナルのみ）   |

信頼度が低い発見事項は、ターミナル内の「Needs Human Review（人間のレビューが必要）」セクションに個別に表示され、PR コメントとして投稿されることはありません。

## 自動修正 (Autofix)

発見事項の提示後、`/review` は明確な解決策がある Critical および Suggestion の発見事項に対して、自動修正の適用を提案します：

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- 修正は `edit` ツールを使用して適用されます（ファイル全体の書き換えではなく、対象箇所のみ置換）
- 修正後、ファイルごとにリンターチェックを実行し、新たな問題が発生していないことを確認します
- PR レビューの場合、修正は worktree から自動的にコミットおよびプッシュされます。ローカルのワーキングツリーはクリーンな状態を保ちます
- Nice to have および低信頼度の発見事項は自動修正されません
- PR レビューの提出は常に**修正前の判定**（例：「Request changes」）を使用します。リモート PR は自動修正のプッシュが完了するまで更新されないためです

## Worktree 分離

PR をレビューする際、`/review` は現在のブランチを切り替える代わりに、一時的な git worktree（`.qwen/tmp/review-pr-<number>`）を作成します。これにより：

- ワーキングツリー、ステージング済み変更、現在のブランチは**一切変更されません**
- 依存関係は worktree 内にインストールされるため（`npm ci` など）、リンティングやビルド/テストが正常に動作します
- ビルドおよびテストコマンドは分離された環境で実行されるため、ローカルのビルドキャッシュを汚染しません
- 何か問題が発生しても環境には影響しません。worktree を削除するだけです
- レビュー完了後、worktree は自動的にクリーンアップされます
- レビューが中断された場合（Ctrl+C、クラッシュ）、同じ PR に対する次の `/review` 実行時に、古い worktree が自動的にクリーンアップされてから処理が開始されます
- レビューレポートとキャッシュはメインのプロジェクトディレクトリに保存されます（worktree 内ではありません）

## クロスリポジトリ PR レビュー

完全な URL を渡すことで、他のリポジトリの PR をレビューできます：

```bash
/review https://github.com/other-org/other-repo/pull/456
```

これは**軽量モード**で実行されます。worktree、リンター、ビルド/テスト、自動修正は使用されません。レビューは差分テキストのみ（GitHub API 経由で取得）に基づきます。書き込み権限がある場合、PR コメントの投稿は引き続き可能です。

| Capability                                       | Same-repo | Cross-repo                    |
| ------------------------------------------------ | --------- | ----------------------------- |
| LLM review (Agents 1-4 + verify + reverse audit) | ✅        | ✅                            |
| Agent 5: Build & test                            | ✅        | ❌ (no local codebase)        |
| Deterministic analysis (linter/typecheck)        | ✅        | ❌                            |
| Cross-file impact analysis                       | ✅        | ❌                            |
| Autofix                                          | ✅        | ❌                            |
| PR inline comments                               | ✅        | ✅ (if you have write access) |
| Incremental review cache                         | ✅        | ❌                            |

## PR インラインコメント

`--comment` を使用して、発見事項を PR に直接投稿します：

```bash
/review 123 --comment
```

または、`/review 123` 実行後に `post comments` と入力することで、レビューを再実行せずに発見事項を公開できます。

**投稿される内容：**

- 特定の行に対する高信頼度の Critical および Suggestion 発見事項のインラインコメント
- Approve/Request changes の判定の場合：判定を含むレビューサマリー
- Comment 判定でインラインコメントがすべて投稿されている場合：個別のサマリーはなし（インラインコメントで十分）
- 各コメントのモデル帰属フッター（例：_— qwen3-coder via Qwen Code /review_）

**ターミナルのみに留まる内容：**

- Nice to have 発見事項（リンターの警告を含む）
- 低信頼度の発見事項

## フォローアップアクション

レビュー後、コンテキストに応じたヒントがゴーストテキストとして表示されます。Tab キーを押して適用します：

| State after review                 | Tip                | What happens                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Local review with unfixed findings | `fix these issues` | LLM が各発見事項を対話的に修正          |
| PR review with findings            | `post comments`    | PR インラインコメントを投稿（再レビューなし） |
| PR review, zero findings           | `post comments`    | GitHub 上で PR を承認（LGTM）           |
| Local review, all clear            | `commit`           | 変更をコミット                          |

注：`fix these issues` はローカルレビューでのみ利用可能です。PR レビューの場合は Autofix（Step 8）を使用してください。レビュー後に worktree はクリーンアップされるため、レビュー後の対話的な修正はできません。

## プロジェクトレビュールール

プロジェクトごとにレビュー基準をカスタマイズできます。`/review` は以下のファイルからルールを読み込みます（優先順位順）：

1. `.qwen/review-rules.md`（Qwen Code ネイティブ）
2. `.github/copilot-instructions.md`（優先）または `copilot-instructions.md`（フォールバック — 両方ではなく片方のみ読み込まれます）
3. `AGENTS.md` — `## Code Review` セクション
4. `QWEN.md` — `## Code Review` セクション

ルールは追加の基準として LLM レビューエージェント（1-4）に注入されます。PR レビューの場合、悪意のある PR がバイパスルールを注入するのを防ぐため、ルールは**ベースブランチ**から読み込まれます。

`.qwen/review-rules.md` の例：

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## 増分レビュー

以前にレビュー済みの PR をレビューする場合、`/review` は前回のレビュー以降の変更のみを検査します：

```bash
# 初回レビュー — フルレビュー、キャッシュ作成
/review 123

# PR が新しいコミットで更新 — 新規変更のみレビュー
/review 123
```

### クロスモデルレビュー

モデルを切り替え（`/model` 経由）、同じ PR を再レビューする場合、`/review` はモデルの変更を検出し、スキップせずにフルレビューを実行します：

```bash
# モデル A でレビュー
/review 123

# モデルを切り替え
/model

# 再レビュー — モデル B でフルレビュー（スキップされない）
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

キャッシュは `.qwen/review-cache/` に保存され、コミット SHA とモデル ID の両方を追跡します。このディレクトリが `.gitignore` に含まれていることを確認してください（`.qwen/*` のような広範なルールでも問題ありません）。キャッシュされたコミットが rebase で削除された場合、フルレビューにフォールバックします。

## レビューレポート

同一リポジトリのレビューの場合、結果はプロジェクトの `.qwen/reviews/` ディレクトリに Markdown ファイルとして保存されます（クロスリポジトリの軽量レビューはレポートの永続化をスキップします）：

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

レポートには、タイムスタンプ、差分統計、決定論的分析の結果、検証ステータス付きのすべての発見事項、および判定が含まれます。

## クロスファイル影響分析

コード変更によってエクスポートされた関数、クラス、またはインターフェースが変更された場合、レビューエージェントは自動的にすべての呼び出し元を検索し、互換性をチェックします：

- パラメータ数/型の変更
- 戻り値の型の変更
- 削除または名前変更されたパブリックメソッド
- 破壊的 API 変更

差分が大きい場合（変更されたシンボルが 10 個超）、分析はシグネチャが変更された関数を優先します。

## トークン効率

レビューパイプラインは、生成される発見事項の数に関係なく、固定数の LLM 呼び出しを使用します：

| Stage                           | LLM calls  | Notes                                               |
| ------------------------------- | ---------- | --------------------------------------------------- |
| Deterministic analysis (Step 3) | 0          | シェルコマンドのみ                                  |
| Review agents (Step 4)          | 5 (or 4)   | 並列実行。クロスリポジトリモードでは Agent 5 をスキップ |
| Batch verification (Step 5)     | 1          | 1つのエージェントがすべての発見事項を一度に検証     |
| Reverse audit (Step 6)          | 1          | カバレッジのギャップを発見。発見事項は検証をスキップ |
| **Total**                       | **7 or 6** | 同一リポジトリ: 7。クロスリポジトリ: 6（Agent 5 なし） |

## フラグ付けされない項目

レビューでは意図的に以下を除外します：

- 変更されていないコード内の既存の問題（差分のみに焦点を当てます）
- コードベースの規約に一致するスタイル/フォーマット/命名
- リンターや型チェッカーが捕捉できる問題（決定論的分析で処理）
- 実際の問題がない主観的な「X を検討してください」といった提案
- バグやリスクを修正しない軽微なリファクタリング
- ロジックが実際に分かりにくい場合を除く、ドキュメントの欠落
- 既存の PR コメントですでに議論されている問題（人間のフィードバックの重複を回避）

## デザイン哲学

> **沈黙は雑音に勝る。** すべてのコメントは、読者の時間に見合う価値があるべきです。

- 問題かどうか不明確な場合 → 報告しない
- リンター/型チェックの問題はツールで処理し、LLM の推測には頼らない
- N 個のファイルにわたる同じパターン → 1つの発見事項に集約
- PR コメントは高信頼度のみ
- コードベースの規約に一致するスタイル/フォーマットの問題は除外