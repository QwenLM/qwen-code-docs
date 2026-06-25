# クイックスタート

> 👏 Qwen Code へようこそ！

このクイックスタートガイドでは、数分以内に AI を活用したコーディング支援を使い始めることができます。最後には、一般的な開発タスクで Qwen Code を活用する方法が身につきます。

## 始める前に

以下を準備してください：

- **ターミナル**またはコマンドプロンプトを開いていること
- 作業するコードプロジェクト
- Alibaba Cloud ModelStudio の API キー（[北京](https://bailian.console.aliyun.com/) / [国際版](https://modelstudio.console.alibabacloud.com/)）、または Alibaba Cloud Coding Plan（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国際版](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）のサブスクリプション

## ステップ 1: Qwen Code をインストールする

Qwen Code をインストールするには、以下のいずれかの方法を使用してください：

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
> インストール後はターミナルを再起動して、環境変数を有効にすることを推奨します。

### 手動インストール

**前提条件**

Node.js 22 以降がインストールされていることを確認してください。[nodejs.org](https://nodejs.org/en/download) からダウンロードできます。

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## ステップ 2: 認証を設定する

`qwen` コマンドでインタラクティブセッションを開始すると、認証の設定を求めるプロンプトが表示されます：

```bash
# You'll be prompted to set up authentication on first use
qwen
```

```bash
# Or run /auth anytime to change authentication method
/auth
```

初回起動メニューでモデルプロバイダーに接続します。以下のいずれかを選択してください：

- **Alibaba ModelStudio** — 推奨のセットアップ。サブメニューが開きます：
  - **Coding Plan**: 個人開発者向け。週次クォータと多様なモデルオプションが含まれます。セットアップ手順については [Coding Plan ガイド](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)（[国際版](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）を参照してください。
  - **Token Plan**: 専用エンドポイントを使用した従量課金制。チームや企業向けです。
  - **Standard API Key**: Alibaba Cloud ModelStudio（[北京](https://bailian.console.aliyun.com/) / [国際版](https://modelstudio.console.alibabacloud.com/)）の既存の API キーで接続します。詳細については API セットアップガイド（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国際版](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）を参照してください。
- **Third-party Providers** — 組み込みプロバイダー（DeepSeek、MiniMax、Z.AI、ModelScope、OpenRouter、Requesty など）を選択し、API キーで接続します。
- **Custom Provider** — ローカルサーバー、プロキシ、または未対応のプロバイダーに手動で接続します。

> ⚠️ **注意**: Qwen OAuth は 2026 年 4 月 15 日に廃止されました。以前に Qwen OAuth を使用していた場合は、上記のいずれかの方法に切り替えてください。

> [!note]
>
> Qwen アカウントで Qwen Code を初めて認証すると、".qwen" というワークスペースが自動的に作成されます。このワークスペースは、組織内のすべての Qwen Code 使用に関するコストの一元管理を提供します。

> [!tip]
>
> 認証を設定するには、Qwen Code を起動して `/auth` を実行してください。現在の設定を確認するには、いつでも `/doctor` を使用できます。詳細については [認証](./configuration/auth) ページを参照してください。

## ステップ 3: 最初のセッションを開始する

任意のプロジェクトディレクトリでターミナルを開き、Qwen Code を起動します：

```bash
# optional
cd /path/to/your/project
# start qwen
qwen
```

Qwen Code のウェルカム画面が表示され、セッション情報、最近の会話、最新のアップデートが確認できます。利用可能なコマンドを確認するには `/help` と入力してください。

## Qwen Code とチャットする

### 最初の質問をする

Qwen Code はファイルを分析してサマリーを提供します。より具体的な質問をすることもできます：

```
explain the folder structure
```

Qwen Code 自身の機能について質問することもできます：

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code は必要に応じてファイルを読み込みます。手動でコンテキストを追加する必要はありません。Qwen Code は自身のドキュメントにもアクセスでき、機能や能力に関する質問に回答できます。

### 最初のコード変更を行う

それでは、Qwen Code に実際のコーディングをさせてみましょう。シンプルなタスクを試してみてください：

```
add a hello world function to the main file
```

Qwen Code は以下を行います：

1. 適切なファイルを見つける
2. 提案された変更を表示する
3. 承認を求める
4. 編集を実行する

> [!note]
>
> Qwen Code はファイルを変更する前に必ず許可を求めます。個別の変更を承認するか、セッション中に「すべて承認」モードを有効にすることができます。

### Qwen Code で Git を使う

Qwen Code を使うと Git 操作を会話形式で行えます：

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

より複雑な Git 操作も依頼できます：

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### バグを修正する、または機能を追加する

Qwen Code はデバッグや機能実装が得意です。

自然言語でやりたいことを説明してください：

```
add input validation to the user registration form
```

既存の問題を修正することもできます：

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code は以下を行います：

- 関連するコードを見つける
- コンテキストを理解する
- 解決策を実装する
- テストがあれば実行する

### その他の一般的なワークフローを試す

Qwen Code にはさまざまな使い方があります：

**コードのリファクタリング**

```
refactor the authentication module to use async/await instead of callbacks
```

**テストを書く**

```
write unit tests for the calculator functions
```

**ドキュメントを更新する**

```
update the README with installation instructions
```

**コードレビュー**

```
review my changes and suggest improvements
```

> [!tip]
>
> **覚えておきましょう**: Qwen Code はあなたの AI ペアプログラマーです。頼りになる同僚に話しかけるように接してください。達成したいことを説明すれば、そこへ向かって一緒に取り組んでくれます。

## 重要なコマンド

日常使いで最も重要なコマンドを紹介します：

| コマンド              | 説明                                             | 例                            |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | Qwen Code を起動する                             | `qwen`                        |
| `/auth`               | 認証方法を変更する（セッション内）               | `/auth`                       |
| `/doctor`             | 現在の認証と環境を確認する                       | `/doctor`                     |
| `/help`               | 利用可能なコマンドのヘルプを表示する             | `/help` または `/?`           |
| `/compress`           | トークンを節約するためにチャット履歴をサマリーに置換する | `/compress`             |
| `/clear`              | ターミナル画面のコンテンツをクリアする           | `/clear`（ショートカット: `Ctrl+L`） |
| `/theme`              | Qwen Code のビジュアルテーマを変更する           | `/theme`                      |
| `/language`           | 言語設定を確認または変更する                     | `/language`                   |
| → `ui [language]`     | UI インターフェースの言語を設定する              | `/language ui zh-CN`          |
| → `output [language]` | LLM の出力言語を設定する                         | `/language output Chinese`    |
| `/quit`               | Qwen Code をすぐに終了する                       | `/quit` または `/exit`        |

コマンドの完全な一覧については [CLI リファレンス](./features/commands) を参照してください。

## 初心者向けのヒント

**リクエストは具体的に**

- 代わりに: "fix the bug"
- 試してみましょう: "fix the login bug where users see a blank screen after entering wrong credentials"

**ステップバイステップの指示を使う**

- 複雑なタスクはステップに分解しましょう：

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**まず Qwen Code に調査させる**

- 変更を加える前に、Qwen Code にコードを理解させましょう：

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**ショートカットで時間を節約する**

- `?` を押すと利用可能なすべてのキーボードショートカットが表示されます
- Tab でコマンド補完が使えます
- ↑ でコマンド履歴を遡れます
- `/` と入力するとすべてのスラッシュコマンドが表示されます

## ヘルプを得る

- **Qwen Code 内**: `/help` と入力するか「how do I...」と質問する
- **ドキュメント**: こちらをご覧ください！他のガイドも参照してください
- **コミュニティ**: [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions) に参加してヒントやサポートを得る
