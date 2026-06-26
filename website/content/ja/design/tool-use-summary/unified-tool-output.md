# 統一ツール出力レンダリング

## 背景

TUI では以前、ツール結果に対して 2 つのレンダリングモードがありました:

- **コンパクトモード** (Ctrl+O): 完了したツール結果を 1 行のサマリーに折りたたむ
- **ノーマルモード**: ツール結果全体をインラインで表示し、過剰な縦方向のノイズを発生させる

ユーザーは手動でモードを切り替える必要がありました。ほとんどの場合、完了したツール結果（ファイル内容、検索結果など）は会話の流れに価値を追加しませんでした。

## 設計

### コア原則

**統一モード**: ツールのレンダリングはユーザーが切り替えるモードではなく、ツールカテゴリによって決定されます。情報収集ツール（読み取り/検索/一覧表示）はサマリーに折りたたまれ、変更ツール（編集/書き込み/コマンド/エージェント）は常に個別に結果全体を表示します。

### 意味的サマリー (`buildToolSummary`)

生のツール名とカウント (`ReadFile x 3`) を表示する代わりに、カウントベースの形式で人間が読みやすいサマリーを生成します:

| シナリオ             | 出力                                           |
| -------------------- | ---------------------------------------------- |
| 単一ツール           | `Read 1 file` / `Ran 1 command`                |
| 同じ種類が複数       | `Read 3 files`                                 |
| 複数の種類が混在     | `Ran 1 command, read 3 files, edited 2 files`  |
| 実行中               | `Reading 1 file` (現在進行形)                  |
| 完了                 | `Read 1 file` (過去形)                         |

### ツールカテゴリ

| カテゴリ | 表示名                      | 過去形動詞 | 進行形動詞 | 折りたたみ可能 |
| -------- | --------------------------- | ---------- | ---------- | -------------- |
| read     | ReadFile, Read File(s)      | Read       | Reading    | はい           |
| edit     | Edit, NotebookEdit          | Edited     | Editing    | いいえ         |
| write    | WriteFile                   | Wrote      | Writing    | いいえ         |
| search   | Grep, Glob                  | Searched   | Searching  | はい           |
| list     | ListFiles, Read Directory   | Listed     | Listing    | はい           |
| command  | Shell                       | Ran        | Running    | いいえ         |
| agent    | Agent, Workflow, SendMessage | Ran       | Running    | いいえ         |
| other    | (その他)                     | Used       | Using      | いいえ         |

### レンダリングルール

1. **タイプベースの分割**: ツールは `isCollapsibleTool()` によって分割されます — 折りたたみ可能なツール（read/search/list）は `CompactToolGroupDisplay` サマリー行としてレンダリングされ、折りたたみ不可能なツール（edit/write/command/agent/other）は `ToolMessage` を介して個別にレンダリングされます
2. **メモリのみのグループ** には専用のレンダリングパス（読み取り/書き込みカウントバッジ）があり、優先されますが、すべての操作が成功した場合のみです（`!hasErrorTool && every status === Success`）
3. **結果の折りたたみ**: `Success` ステータスの折りたたみ可能なツールのみがテキスト/ANSI 出力を折りたたまれます。折りたたみ不可能なツール（MCP ツール、WebFetch など）は常に結果を表示します。キャンセルされたツールは部分的な出力をそのまま保持します
4. **ツール名** はステータスに関係なく太字でレンダリングされ、`CompactToolGroupDisplay` と個別の `ToolMessage` の両方のパスで一貫したスタイルを提供します
5. **強制展開条件**: グループ内のいずれかのツールが確認待ち、エラー、ユーザー起動、フォーカスされたシェル、またはターミナルサブエージェントの場合、すべてのツールが個別にレンダリングされ（分割なし）、結果はトリガーツール（エラー、確認待ち、ターミナルサブエージェント）に対してのみ強制的に表示されます — 成功した兄弟ツールは通常の折りたたみ動作を保持します
6. **`tool_use_summary`** アイテム（LLM 生成の意味的サマリー）は、`CompactToolGroupDisplay` の機械的なカウントとともに無条件にレンダリングされます — これらは異なる目的（意味的コンテキストとツールカウント）を提供します
7. **メモリバッジ**: メモリ操作が含まれるがメモリのみのグループではない場合、すべて折りたたみ可能なパスと混合パスの両方でレンダリングされます

### 主な変更点

| ファイル                         | 変更内容                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CompactToolGroupDisplay.tsx`    | `buildToolSummary()` をカウント形式で追加、`isCollapsibleTool()` を追加、ボーダースタイルを削除                                                          |
| `ToolMessage.tsx`                | `shouldCollapseResult` を `isCollapsibleTool()` かつ `Success` の場合のみに制限、`isDim` を削除                                                         |
| `ToolGroupMessage.tsx`           | タイプベースの分割が `showCompact` を置き換え、`forceShowResult` を `forceExpandAll` に簡略化、高さバジェットが折りたたみ可能なサマリー行を考慮する          |
| `MainContent.tsx`                | `mergedHistory` エイリアス、`absorbedCallIds`、`summaryByCallId`、グループ間マージを削除                                                                 |
| `HistoryItemDisplay.tsx`         | `tool_use_summary` を無条件にレンダリング（`summaryAbsorbed` ゲートを削除）                                                                               |
| `mergeCompactToolGroups.ts`      | `compactToggleHasVisualEffect` が `tool_group` でトリガーされなくなる（コンパクトモードがツールレンダリングに影響を与えない）                             |

## 検討した代替案

1. **改善されたサマリーを持つ 2 つのモードを維持**: 却下 — ユーザーに不要な認知負荷がかかる
2. **ツールごとのサマリー（Gemini CLI スタイル）**: 各ツールに独自のサマリー矢印。却下 — 多数のツールバッチには依然として冗長すぎる
3. **段階的ロールアウト**: 却下 — ユーザーは単一の実装パスを好む