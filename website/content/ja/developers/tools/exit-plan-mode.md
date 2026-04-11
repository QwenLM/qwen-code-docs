# Exit Plan Mode ツール (`exit_plan_mode`)

このドキュメントでは、Qwen Code の `exit_plan_mode` ツールについて説明します。

## 概要

プランモードで実装計画の提示が完了した際に `exit_plan_mode` を使用します。このツールはユーザーに計画の承認または拒否を促し、プランモードから実装モードへ移行します。

このツールは、コードを記述する前に実装手順の計画が必要なタスク向けに設計されています。リサーチや情報収集タスクでは使用しないでください。

### 引数

`exit_plan_mode` は 1 つの引数を受け取ります：

- `plan` (string, 必須): ユーザーに承認を求める実装計画。実装手順を説明する簡潔な Markdown 形式の計画を指定します。

## Qwen Code での `exit_plan_mode` の使用方法

Exit Plan Mode ツールは Qwen Code のプランニングワークフローの一部です。プランモード（通常はコードベースの調査と実装アプローチの設計後）にいる場合、このツールを使用して以下の操作を行います：

1. ユーザーに実装計画を提示する
2. 実装の承認をリクエストする
3. ユーザーの応答に応じてプランモードから実装モードへ移行する

このツールはユーザーに計画を提示し、以下のオプションを提供します：

- **Proceed Once**: 現在のセッションのみ計画を承認する
- **Proceed Always**: 計画を承認し、今後の編集操作で自動承認を有効にする
- **Cancel**: 計画を拒否し、プランモードを維持する

使用例：

```
exit_plan_mode(plan="Your detailed implementation plan here...")
```

## このツールの使用タイミング

以下の状況で `exit_plan_mode` を使用します：

1. **実装タスク**: コーディングタスクの実装手順を計画している場合
2. **計画の完了**: 調査と実装アプローチの設計が完了した場合
3. **ユーザーの承認が必要**: コード変更を進める前にユーザーの確認が必要な場合
4. **コード記述タスク**: コードの記述、修正、リファクタリングを含むタスクの場合

### 適切な使用例：

- 「ユーザー認証を実装するのを手伝って」 → 認証システムの実装計画を立てた後に使用
- 「ユーザー管理用の新しい API エンドポイントを追加する」 → エンドポイントの構造を設計した後に使用
- 「データベース層を TypeORM を使用するようにリファクタリングする」 → リファクタリングのアプローチを計画した後に使用

## このツールを使用しないタイミング

以下の状況では `exit_plan_mode` を使用しないでください：

1. **リサーチタスク**: 既存のコードの理解や調査に焦点を当てたタスク
2. **情報収集**: 実装を行わずに検索、読み取り、分析を行っている場合
3. **ドキュメント作成タスク**: コード変更を伴わずにドキュメントを作成している場合
4. **分析タスク**: 実装を伴わずに説明やレビューを提供している場合

### 不適切な使用例：

- 「コードベース内の vim モードの実装を検索して理解する」 → 使用しない（リサーチタスク）
- 「認証システムの動作を説明する」 → 使用しない（分析タスク）
- 「プロジェクト内のすべての TODO コメントを見つける」 → 使用しない（情報収集）

## `exit_plan_mode` の使用例

### 実装計画の例

```
exit_plan_mode(plan="## Implementation Plan for User Dashboard

### 1. Create Dashboard Components
- Create `UserDashboard.tsx` with main dashboard layout
- Add `DashboardStats.tsx` for displaying user statistics
- Implement `ActivityFeed.tsx` for recent user activities

### 2. Add API Integration
- Create `dashboardApi.ts` for dashboard data fetching
- Add endpoints for user stats and activity data
- Implement error handling and loading states

### 3. Update Routing
- Add dashboard route in `App.tsx`
- Update navigation component with dashboard link
- Add route protection for authenticated users

### 4. Testing and Documentation
- Write unit tests for dashboard components
- Add integration tests for API calls
- Update user documentation with dashboard features

This implementation will take approximately 4-6 hours and requires changes to 8-10 files.")
```

### リファクタリング計画の例

```
exit_plan_mode(plan="## Database Layer Refactoring Plan

### Phase 1: Setup and Configuration
- Install and configure TypeORM dependencies
- Create database connection configuration
- Set up entity definitions for existing models

### Phase 2: Migration
- Create migration scripts for existing data
- Implement new repository pattern using TypeORM
- Replace raw SQL queries with TypeORM query builder

### Phase 3: Testing and Validation
- Update all database tests to use TypeORM
- Validate data integrity after migration
- Performance testing to ensure no regressions

This refactoring will modernize our database layer while maintaining backward compatibility.")
```

## ユーザーの応答処理

`exit_plan_mode` を呼び出した後、ユーザーは以下のいずれかで応答できます：

- **Proceed Once**: デフォルトの確認設定で、即時実装のために計画が承認される
- **Proceed Always**: 計画が承認され、以降の編集操作で自動承認が有効になる
- **Cancel**: 計画が拒否され、システムはプランモードのまま追加の計画が可能になる

このツールはユーザーの選択に基づいて承認モードを自動的に調整し、ユーザーの好みに合わせて実装プロセスを効率化します。

## 重要な注意事項

- **プランモードのみ**: このツールは現在プランモードにいる場合のみ使用してください
- **実装に焦点**: コードの記述や修正を含むタスクのみで使用してください
- **簡潔な計画**: 計画は焦点を絞り簡潔に保ち、詳細な網羅性よりも明確さを重視してください
- **Markdown サポート**: 計画は Markdown 形式での記述に対応しており、可読性が向上します
- **単回使用**: 計画セッションごとに、進める準備ができた時点で 1 回のみ使用してください
- **ユーザーの制御**: 進めるかどうかの最終決定権は常にユーザーにあります

## プランニングワークフローとの統合

Exit Plan Mode ツールは、より広範なプランニングワークフローの一部です：

1. **プランモードに入る**: ユーザーがリクエストするか、システムが計画が必要と判断する
2. **調査フェーズ**: コードベースを分析し、要件を理解し、オプションを検討する
3. **計画の設計**: 調査に基づいて実装戦略を作成する
4. **計画の提示**: `exit_plan_mode` を使用してユーザーに計画を提示する
5. **実装フェーズ**: 承認後、計画された実装を進める

このワークフローにより、慎重な実装アプローチが保証され、ユーザーは重要なコード変更に対して制御権を維持できます。