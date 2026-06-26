# クイックスタート

> 👏 Qwen Code へようこそ！

このクイックスタートガイドでは、数分でAIを活用したコーディング支援を使い始めることができます。最後まで読めば、一般的な開発タスクで Qwen Code を使用する方法を理解できるでしょう。

## 始める前に

以下が必要です：

- **ターミナル** またはコマンドプロンプトが開いていること
- 作業するコードプロジェクト
- Alibaba Cloud ModelStudio の API キー（[Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)）、または Alibaba Cloud Coding Plan（[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）のサブスクリプション

## ステップ1: Qwen Code のインストール

Qwen Code をインストールするには、以下のいずれかの方法を使用します：

### クイックインストール（推奨）

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> [!note]
>
> インストール後、環境変数を有効にするためにターミナルを再起動することをおすすめします。

### 手動インストール

**前提条件**

Node.js 22 以降がインストールされていることを確認してください。[nodejs.org](https://nodejs.org/en/download) からダウンロードできます。

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew（macOS、Linux）**

```bash
brew install qwen-code
```

## ステップ2: 認証の設定

`qwen` コマンドでインタラクティブセッションを開始すると、認証の設定を求められます：

```bash
# 初回使用時に認証の設定を求められます
qwen
```

```bash
# または、いつでも /auth を実行して認証方法を変更できます
/auth
```

初回起動時のメニューでは、モデルプロバイダーを選択できます。以下から選択してください：

- **Alibaba ModelStudio** — 推奨される設定です。サブメニューが開きます：
  - **Coding Plan**: 個人開発者向けで、週ごとの利用枠と多様なモデルオプションが含まれています。設定手順については [Coding Plan ガイド](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)（[intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）を参照してください。
  - **Token Plan**: 専用エンドポイントを使用した従量課金制で、チームや企業向けです。
  - **Standard API Key**: 既存の Alibaba Cloud ModelStudio（[Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)）の API キーを接続します。詳細は API 設定ガイド（[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）を参照してください。
- **Third-party Providers** — 内蔵プロバイダー（DeepSeek、MiniMax、Z.AI、ModelScope、OpenRouter、Requesty など）を選択し、API キーで接続します。
- **Custom Provider** — ローカルサーバー、プロキシ、またはサポートされていないプロバイダーを手動で接続します。

> ⚠️ **注意**: Qwen OAuth は2026年4月15日に廃止されました。以前 Qwen OAuth を使用していた場合は、上記のいずれかの方法に切り替えてください。

> [!note]
>
> Qwen Code を Qwen アカウントで初めて認証すると、".qwen" というワークスペースが自動的に作成されます。このワークスペースは、組織内のすべての Qwen Code 使用に関する集中コスト追跡と管理を提供します。

> [!tip]
>
> 認証を設定するには、Qwen Code を起動して `/auth` を実行します。現在の設定はいつでも `/doctor` で確認できます。詳細は [認証](./configuration/auth) ページを参照してください。

## ステップ3: 最初のセッションを開始

任意のプロジェクトディレクトリでターミナルを開き、Qwen Code を起動します：

```bash
# オプション
cd /path/to/your/project
# qwen を起動
qwen
```

Qwen Code のウェルカム画面が表示され、セッション情報、最近の会話、最新の更新情報が表示されます。利用可能なコマンドは `/help` と入力してください。

## Qwen Code とチャット

### 最初の質問をする

Qwen Code はファイルを分析し、サマリーを提供します。より具体的な質問もできます：

```
explain the folder structure
```

Qwen Code 自身の機能について質問することもできます：

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code は必要に応じてファイルを読み取ります。手動でコンテキストを追加する必要はありません。また、Qwen Code は自身のドキュメントにアクセスでき、その機能や能力についての質問に答えることができます。

### 初めてのコード変更

では、Qwen Code に実際のコーディングをさせてみましょう。簡単なタスクを試してください：

```
add a hello world function to the main file
```

Qwen Code は以下の処理を行います：

1. 適切なファイルを見つける
2. 提案された変更を表示する
3. 承認を求める
4. 編集を実行する

> [!note]
>
> Qwen Code はファイルを変更する前に必ず許可を求めます。個々の変更を承認するか、セッションで「すべて接受」モードを有効にできます。

### Qwen Code で Git を使用する

Qwen Code を使うと、Git 操作を会話形式で行えます：

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

より複雑な Git 操作も指示できます：

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### バグの修正や機能の追加

Qwen Code はデバッグと機能実装に長けています。

自然言語でやりたいことを説明してください：

```
add input validation to the user registration form
```

既存の問題を修正する場合：

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code は以下の処理を行います：

- 該当するコードを見つける
- コンテキストを理解する
- 解決策を実装する
- 利用可能なテストを実行する

### その他の一般的なワークフローを試す

Qwen Code を使用するにはさまざまな方法があります：

**コードのリファクタリング**

```
refactor the authentication module to use async/await instead of callbacks
```

**テストの作成**

```
write unit tests for the calculator functions
```

**ドキュメントの更新**

```
update the README with installation instructions
```

**コードレビュー**

```
review my changes and suggest improvements
```

> [!tip]
>
> **覚えておいてください**: Qwen Code はあなたの AI ペアプログラマーです。親切な同僚に話しかけるように、実現したいことを説明すれば、目標に到達する手助けをしてくれます。

## 必須コマンド

日常的に使用する最も重要なコマンドは次のとおりです：

| コマンド                | 機能                                                    | 例                             |
| ----------------------- | ------------------------------------------------------- | ------------------------------ |
| `qwen`                  | Qwen Code を起動                                        | `qwen`                         |
| `/auth`                 | 認証方法を変更（セッション内）                          | `/auth`                        |
| `/doctor`               | 現在の認証と環境を確認                                   | `/doctor`                      |
| `/help`                 | 利用可能なコマンドのヘルプを表示                         | `/help` または `/?`            |
| `/compress`             | チャット履歴を要約して Token を節約                     | `/compress`                    |
| `/clear`                | ターミナル画面の内容をクリア                             | `/clear`（ショートカット: `Ctrl+L`） |
| `/theme`                | Qwen Code のビジュアルテーマを変更                       | `/theme`                       |
| `/language`             | 言語設定の表示または変更                                 | `/language`                    |
| → `ui [language]`       | UIインターフェースの言語を設定                           | `/language ui zh-CN`           |
| → `output [language]`   | LLMの出力言語を設定                                     | `/language output Chinese`     |
| `/quit`                 | Qwen Code をすぐに終了                                   | `/quit` または `/exit`         |

コマンドの完全なリストは [CLI リファレンス](./features/commands) を参照してください。

## 初心者向けのプロのヒント

**リクエストは具体的に**

- 例：「バグを修正して」の代わりに：
- 試す：「ログイン時に誤った認証情報を入力すると空白画面が表示されるバグを修正して」

**ステップバイステップの指示を使用する**

- 複雑なタスクはステップに分割します：

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**まずは Qwen Code に探索させる**

- 変更を加える前に、Qwen Code にコードを理解させましょう：

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**ショートカットで時間を節約**

- `?` を押すと利用可能なキーボードショートカットが表示されます
- Tab キーでコマンドの補完が可能
- ↑ キーでコマンド履歴を表示
- `/` を入力するとすべてのスラッシュコマンドが表示されます

## ヘルプの入手

- **Qwen Code 内**: `/help` と入力するか、「how do I...」と質問してください
- **ドキュメント**: 今ここです！他のガイドも参照してください
- **コミュニティ**: [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions) に参加してヒントやサポートを得る