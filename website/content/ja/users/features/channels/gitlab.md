# GitLab

このガイドでは、GitLab の todo を監視し、issue や merge request へのメンションに応答する Qwen Code チャネルの設定方法を説明します。

## 前提条件

- GitLab アカウント（専用のボットアカウントでも可）
- `read_api` と `api` スコープを持つ GitLab Personal Access Token

## トークンの作成

1. **Preferences → Access Tokens** に移動する
2. 以下のスコープでトークンを作成する:
   - **read_api** — todo とプロジェクトデータの読み取り
   - **api** — issue/MR へのノート（コメント）の投稿
3. トークンを環境変数として安全に保存する

## 設定

チャネルを `~/.qwen/settings.json` に追加する:

```json
{
  "channels": {
    "my-gitlab": {
      "type": "gitlab",
      "token": "$GITLAB_TOKEN",
      "pollInterval": 60000,
      "senderPolicy": "open",
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "action_prompt_template": {
        "mentioned": "Project: %project% | URL: %project_url% | Author: %author% | Type: %target_type% | IID: %iid% | Title: %title% | Description: %description% | TodoID: %todo_id%"
      }
    }
  }
}
```

トークンを環境変数として設定する:

```bash
export GITLAB_TOKEN="glpat-your_token_here"
```

### セルフホスト GitLab

セルフホストインスタンスの場合は `baseUrl` を設定する:

```json
{
  "baseUrl": "https://gitlab.example.com"
}
```

## 設定オプション

| オプション               | デフォルト                | 説明                                                         |
| ------------------------ | ------------------------- | ------------------------------------------------------------ |
| `token`                  | (必須)                    | `read_api` + `api` スコープを持つ PAT                        |
| `pollInterval`           | `60000`                   | ポーリング間隔（ミリ秒）                                     |
| `baseUrl`                | `https://gitlab.com`      | GitLab インスタンスの URL                                    |
| `action_prompt_template` | (処理に必要)              | GitLab アクション名とメタデータテンプレートをマッピングする  |
| `groupPolicy`            | `"disabled"`              | `"open"` またはプロジェクトをリストした `"allowlist"` を指定 |
| `senderPolicy`           | `"allowlist"`             | ボットをトリガーできるユーザー                               |

## action_prompt_template

このフィールドは、どの todo アクションを処理するか、およびメタデータのレンダリング方法を制御します。テンプレートが設定されているアクションのみがディスパッチされ、それ以外はスキップされて完了マークが付けられます。

```json
{
  "action_prompt_template": {
    "mentioned": "Project: %project% | Author: %author% | Title: %title%"
  }
}
```

`directly_addressed` アクション（`@bot` で始まるコメント）は、明示的に設定されていない場合、自動的に `mentioned` テンプレートにフォールバックします。

### 利用可能なアクションキー

| キー                  | トリガー                                                                       |
| --------------------- | ------------------------------------------------------------------------------ |
| `mentioned`           | コメントまたは説明内でボットが @メンションされた場合（先頭以外）               |
| `directly_addressed`  | コメントが `@bot` で**始まる**場合（`mentioned` テンプレートにフォールバック） |
| `assigned`            | ボットが issue/MR にアサインされた場合                                         |
| `review_requested`    | MR でボットがレビュアーとしてリクエストされた場合                              |
| `approval_required`   | MR にボットの承認が必要な場合（承認ルール）                                    |
| `marked`              | ボットのコメント/issue/MR がマーク（スター）された場合                         |
| `build_failed`        | ボットのブランチ/MR で CI/CD パイプラインが失敗した場合                        |
| `unmergeable`         | ボットが関与する MR がマージ不可能になった場合（コンフリクト）                 |
| `merge_train_removed` | MR がマージトレインから削除された場合                                          |

`action_prompt_template` に存在するキーのみが処理されます。未設定のアクションはスキップされ、静かに完了マークが付けられます。

### テンプレート変数

| 変数            | 値                                |
| --------------- | --------------------------------- |
| `%project%`     | プロジェクトパス（例: `owner/repo`） |
| `%project_url%` | プロジェクトの完全な URL          |
| `%author%`      | Todo の作成者ユーザー名           |
| `%target_type%` | `Issue` または `MergeRequest`     |
| `%iid%`         | Issue/MR の内部 ID                |
| `%title%`       | Issue/MR のタイトル               |
| `%description%` | Issue/MR の説明本文               |
| `%todo_id%`     | GitLab todo ID                    |
| `%%`            | リテラル `%`（エスケープ）        |

不明な変数は出力内にそのまま保持されます。

### プロンプトの組み立て

テンプレートは `envelope.metadata`（構造化されたコンテキスト）にレンダリングされます。トリガーテキスト（`todo.body` または説明）は `envelope.text`（プライマリプロンプト）に格納されます。ベースクラスがエージェントに送信される最終プロンプトを組み立てます:

```
[alice] please fix this bug

Project: owner/repo | URL: https://gitlab.com/owner/repo | Author: alice | Type: Issue | IID: 42 | Title: Test Issue | Description: ... | TodoID: 100
```

- 1行目: `[sender]` プレフィックス + `envelope.text`（`@bot` を除去済み）
- 3行目: `envelope.metadata`（レンダリングされたテンプレート、サニタイズ済み）

`%body%` 変数は**不要**です。コメント/説明のテキストは常にプライマリプロンプトコンテンツであり、テンプレートはその下に補足コンテキストを提供します。

## ⚠️ セキュリティ

**パブリックプロジェクト**で `senderPolicy: "open"` を設定すると、ボットを @メンションした**任意の GitLab ユーザー**が `cwd` のエージェントを駆動するプロンプトを送信できます。

パブリックプロジェクトでは、常に `senderPolicy: "allowlist"` を明示的な `allowedUsers` とともに使用してください。

## メンションの検出

アダプターは、ディスパッチされるエンベロープに対して常に `isMentioned = true` を設定します。これは、GitLab が todo の作成時にメンションをすでに判定しているためです。`action_prompt_template` の設定が実際のイベントフィルターであり、テンプレートが設定されているアクションのみが処理されます。`@bot` メンションは、ディスパッチ前に `stripBotMention` によってメッセージテキストから除去されます。

### ⚠️ groupPolicy は "open" または "allowlist" を設定すること

todo を処理するには、`groupPolicy` を `"open"` またはプロジェクトを明示的にリストした `"allowlist"` に設定する必要があります。デフォルト値の `"disabled"` はすべてのメンションを破棄します。todo は完了マークが付けられ、カーソルが進みますが、ディスパッチは行われません。拒否はログに記録されます（`preflight rejected reason=group_disabled`）が、todo は引き続き消費されます。ボットがメンションに応答しない場合は、`groupPolicy` が `"disabled"` でないことを確認してください。

## 動作の仕組み

アダプターは GitLab の Todos API をメッセージソースとして使用します:

1. **ポーリング**: `GET /todos?state=pending` で新しい todo を取得する
2. **初回ポーリング時の drain**: カーソルが未初期化（`initialized: false`）の場合、すべての保留中の todo はディスパッチせずに完了マークが付けられ、カーソルは最大 todo ID まで進みます。これにより、初回起動時のバックログフラッディングを防止します。
3. **古い todo のクリーンアップ**: `id <= cursor` の todo は完了マークが付けられ（ベストエフォート）、毎回のポーリングで再取得されるのを防ぎます
4. **フィルタリング**: `id > cursor` と設定された `action_prompt_template` でフィルタリングする
5. **メンションタイプの検出**: `target_url` のアンカーで判定:
   - `#note_123` が存在 → コメントメンション → テキストは `todo.body`（コメント）
   - アンカーなし → 説明メンション → テキストは issue/MR の説明
6. **ディスパッチ**: `handleInbound` を通じてエンベロープをディスパッチする（`groupPolicy: "open"` またはプロジェクトをリストした `"allowlist"` が必要）
7. **カーソルの前進** と **todo の完了マーク**（ベストエフォート）

カーソル（`lastProcessedId`）は、ディスパッチの成功・失敗にかかわらず前進します。失敗したディスパッチは issue/MR に ⚠️ エラーコメントを投稿し、リトライは行われません。ユーザーはボットを再メンションして新しい todo をトリガーできます。

## レスポンスフィードバック

受け付けられたコメントメンション（`#note_` アンカー付きノート）の場合、チャネルはエージェントが作業中にノートに 👀 award emoji を追加し、実行が完了・失敗・キャンセルされたときに削除します。どちらの操作もベストエフォートです。award emoji API や権限の失敗はログに記録され、最終レスポンスを妨げることはありません。

説明メンション（`#note_` アンカーなし）には、リアクション先の特定のノートがないため、award emoji は付与されません。

## 既知の制限

- **初回起動時に既存の保留中 todo をスキップします。** カーソルは初回起動時に `{ lastProcessedId: 0, initialized: false }` に初期化されます。最初のポーリングサイクルで、既存の保留中 todo はすべてディスパッチせずに完了マークが付けられます（`initialized` フラグがこの一度限りの drain を制御します）。これによりバックログフラッディングを防止します。
- ボットは過去の会話履歴を読み取りません。トリガーされたコンテンツのみが処理されます。
- **機密（内部）ノート:** 機密ノート内でボットを @メンションした場合、todo の本文にその内部テキストが含まれ、エージェントが処理します。ボットの返信は常に**パブリック**ノートとして投稿されるため、内部の議論が公開される可能性があります。GitLab の todo API はノートの可視性を公開しないため、アダプターはこれをフィルタリングできません。機密ノート内でボットを @メンションしないでください。
- `read_api` + `api` PAT スコープが必要です。これらのスコープを持つグループレベルまたはプロジェクトレベルのトークンも使用できます。
- Epic、Design、Alert の todo はスキップされます（Issue と MR のみが処理されます）。

## チャネルの起動

```bash
qwen channel start my-gitlab
```
