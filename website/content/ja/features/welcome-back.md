# Welcome Back 機能

Welcome Back 機能は、既存の会話履歴があるプロジェクトに戻ってきた際に自動的に検知し、中断した場所から作業を再開できるようにすることで、シームレスな作業再開をサポートします。

## 概要

プロジェクトディレクトリで Qwen Code を起動する際に、以前に生成されたプロジェクトサマリー（`.qwen/PROJECT_SUMMARY.md`）が存在する場合、Welcome Back ダイアログが自動的に表示され、新規に開始するか、または前回の会話を継続するかを選択できます。

## 動作について

### 自動検知

Welcome Back 機能は以下のものを自動的に検知します：

- **Project Summary ファイル：** 現在のプロジェクトディレクトリに `.qwen/PROJECT_SUMMARY.md` が存在するかを確認
- **会話履歴：** 再開可能な意味のある会話履歴があるかどうかをチェック
- **設定：** `enableWelcomeBack` 設定を尊重（デフォルトでは有効）

### Welcome Back ダイアログ

プロジェクトサマリーが見つかると、以下を含むダイアログが表示されます：

- **最終更新日時:** サマリーが最後に生成された日時を表示
- **全体の目標:** 前回セッションからの主要な目的を表示
- **現在の計画:** ステータスインジケーター付きでタスク進行状況を表示：
  - `[DONE]` - 完了したタスク
  - `[IN PROGRESS]` - 現在進行中のタスク
  - `[TODO]` - 予定されているタスク
- **タスク統計:** 総タスク数、完了数、進行中、保留中のタスクのサマリー

### オプション

Welcome Back ダイアログが表示された際には、2つの選択肢があります：

1. **新しいチャットセッションを開始**
   - ダイアログを閉じ、新しい会話を開始します
   - 以前のコンテキストは読み込まれません

2. **前回の会話を続ける**
   - 以下の内容が自動的に入力欄に挿入されます：  
     `@.qwen/PROJECT_SUMMARY.md, Based on our previous conversation, Let's continue?`
   - AI に対してコンテキストとしてプロジェクトサマリーを読み込みます
   - 前回中断した場所からシームレスに作業を再開できます

## Configuration

### Welcome Back の有効化/無効化

Welcome Back 機能は、設定から制御できます：

**設定ダイアログから：**

1. Qwen Code で `/settings` を実行
2. UI カテゴリから「Enable Welcome Back」を探す
3. 設定をオン/オフに切り替える

**設定ファイルから：**  
`.qwen/settings.json` に以下を追加：

```json
{
  "enableWelcomeBack": true
}
```

**設定の場所：**

- **ユーザー設定：** `~/.qwen/settings.json`（すべてのプロジェクトに影響）
- **プロジェクト設定：** `.qwen/settings.json`（プロジェクト固有）

### キーボードショートカット

- **Escape:** Welcome Back ダイアログを閉じる（デフォルトでは「新しいチャットセッションを開始」）

## 他の機能との連携

### プロジェクトサマリーの生成

Welcome Back機能は、`/chat summary`コマンドとシームレスに連携します：

1. **サマリーを生成：** `/chat summary`を使ってプロジェクトサマリーを作成
2. **自動検出：** 次回このプロジェクトでQwen Codeを起動すると、Welcome Backがサマリーを検出
3. **作業を再開：** 続行を選択すると、サマリーがコンテキストとして読み込まれる

### 終了確認

`/quit-confirm`で終了し、「サマリーを生成して終了」を選択した場合：

1. プロジェクトサマリーが自動的に作成される
2. 次回セッションでWelcome Backダイアログが表示される
3. 作業をシームレスに継続可能

## ファイル構造

Welcome Back機能は以下のファイルを作成・使用します：

```
your-project/
├── .qwen/
│   └── PROJECT_SUMMARY.md    # 生成されたプロジェクトサマリー
```

### PROJECT_SUMMARY.mdのフォーマット

生成されるサマリーは以下の構造に従います：

```markdown

# Project Summary

## Overall Goal

<!-- High-level objectiveを説明する、簡潔な1文 -->

## Key Knowledge

<!-- Crucial facts, conventions, and constraints -->
<!-- Includes: technology choices, architecture decisions, user preferences -->

## Recent Actions

<!-- Summary of significant recent work and outcomes -->
<!-- Includes: accomplishments, discoveries, recent changes -->

## Current Plan

<!-- The current development roadmap and next steps -->
<!-- Uses status markers: [DONE], [IN PROGRESS], [TODO] -->

---

## Summary Metadata

**Update time**: 2025-01-10T15:30:00.000Z