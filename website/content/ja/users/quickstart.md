# クイックスタート

> 👏 Qwen Code へようこそ！

このクイックスタートガイドでは、わずか数分で AI によるコーディング支援を使い始められます。最後まで読むと、一般的な開発タスクで Qwen Code を活用する方法が理解できます。

## 始める前に

以下の準備が整っていることを確認してください：

- **ターミナル**またはコマンドプロンプトが開いていること
- 作業対象のコードプロジェクト
- Alibaba Cloud Model Studio の API キー（[北京リージョン](https://bailian.console.aliyun.com/) / [国際版](https://modelstudio.console.alibabacloud.com/)）、または Alibaba Cloud Coding Plan のサブスクリプション（[北京リージョン](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国際版](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）

## ステップ 1: Qwen Code のインストール

Qwen Code をインストールするには、以下のいずれかの方法を使用してください：

### クイックインストール（推奨）

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows（管理者として実行）**

```cmd
powershell -Command "Invoke-WebRequest 'https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat' -OutFile (Join-Path $env:TEMP 'install-qwen.bat'); & (Join-Path $env:TEMP 'install-qwen.bat')"
```

> [!note]
>
> インストール後は環境変数を確実に反映させるため、ターミナルを再起動することを推奨します。

### 手動インストール

**前提条件**

Node.js 20 以降がインストールされていることを確認してください。[nodejs.org](https://nodejs.org/en/download) からダウンロードできます。

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew（macOS, Linux）**

```bash
brew install qwen-code
```

## ステップ 2: 認証の設定

`` `qwen` `` コマンドでインタラクティブセッションを開始すると、認証の設定を促すプロンプトが表示されます：

```bash
# You'll be prompted to set up authentication on first use
qwen
```

```bash
# Or run /auth anytime to change authentication method
/auth
```

希望する認証方法を選択してください：

- **Alibaba Cloud Coding Plan**: `Alibaba Cloud Coding Plan` を選択すると、月額固定料金で多様なモデルオプションを利用できます。設定手順は [Coding Plan ガイド](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)（[国際版](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）を参照してください。
- **API Key**: `API Key` を選択し、Alibaba Cloud Model Studio（[北京リージョン](https://bailian.console.aliyun.com/) / [国際版](https://modelstudio.console.alibabacloud.com/)）で発行した API キーを入力してください。詳細は API 設定ガイド（[北京リージョン](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国際版](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）を参照してください。

> ⚠️ **注意**: Qwen OAuth は 2026 年 4 月 15 日に廃止されました。以前 Qwen OAuth を使用していた場合は、上記のいずれかの方法に切り替えてください。

> [!note]
>
> Qwen アカウントで初めて Qwen Code を認証すると、自動的に `.qwen` というワークスペースが作成されます。このワークスペースは、組織内のすべての Qwen Code 利用状況に対するコスト追跡と管理を一元化します。

> [!tip]
>
> セッションを開始せずにターミナルから直接 `qwen auth` を実行して認証を設定することもできます。現在の設定はいつでも `qwen auth status` で確認できます。詳細は [認証](./configuration/auth) ページを参照してください。

## ステップ 3: 最初のセッションを開始する

任意のプロジェクトディレクトリでターミナルを開き、Qwen Code を起動します：

```bash
# optiona
cd /path/to/your/project
# start qwen
qwen
```

セッション情報、最近の会話、最新アップデートを含む Qwen Code のウェルカム画面が表示されます。利用可能なコマンドを確認するには `/help` と入力してください。

## Qwen Code とチャットする

### 最初の質問をしてみる

Qwen Code がファイルを分析し、要約を提供します。より具体的な質問をすることもできます：

```
explain the folder structure
```

Qwen Code の機能について質問することもできます：

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code は必要に応じてファイルを読み取るため、コンテキストを手動で追加する必要はありません。また、Qwen Code は自身のドキュメントにもアクセスできるため、機能や能力に関する質問にも回答できます。

### 最初のコード変更を行う

実際に Qwen Code にコーディングを行わせてみましょう。簡単なタスクを試してください：

```
add a hello world function to the main file
```

Qwen Code は以下の手順で処理します：

1. 適切なファイルを検索する
2. 提案された変更を表示する
3. 承認を求める
4. 編集を適用する

> [!note]
>
> Qwen Code はファイルを修正する前に必ず許可を求めます。変更を個別に承認するか、セッション中に「すべて承認」モードを有効にできます。

### Qwen Code で Git を操作する

Qwen Code を使えば、Git 操作を会話形式で実行できます：

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

より複雑な Git 操作を指示することもできます：

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### バグ修正や機能追加

Qwen Code はデバッグや機能実装に優れています。

自然言語で実現したいことを記述してください：

```
add input validation to the user registration form
```

または既存の問題を修正します：

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code は以下の処理を行います：

- 関連するコードを特定する
- コンテキストを理解する
- 解決策を実装する
- テストが利用可能な場合は実行する

### その他の一般的なワークフローを試す

Qwen Code を活用する方法は多岐にわたります：

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
> **覚えておくべきこと**: Qwen Code はあなたの AI ペアプログラマーです。役立つ同僚に話すように、実現したい目標を説明すれば、達成までのサポートを行います。

## 必須コマンド

日常開発で最も重要なコマンドは以下の通りです：

| コマンド               | 説明                                     | 例                       |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | Qwen Code を起動する                                  | `qwen`                        |
| `/auth`               | 認証方法を変更する（セッション内）        | `/auth`                       |
| `qwen auth`           | ターミナルから認証を設定する       | `qwen auth`                   |
| `qwen auth api-key`   | API キー認証を設定する                 | `qwen auth api-key`           |
| `qwen auth status`    | 現在の認証ステータスを確認する              | `qwen auth status`            |
| `/help`               | 利用可能なコマンドのヘルプ情報を表示する  | `/help` または `/?`               |
| `/compress`           | チャット履歴を要約に置き換えて Token を節約する | `/compress`                   |
| `/clear`              | ターミナル画面のコンテンツをクリアする                    | `/clear`（ショートカット: `Ctrl+L`） |
| `/theme`              | Qwen Code のビジュアルテーマを変更する                    | `/theme`                      |
| `/language`           | 言語設定の表示または変更                 | `/language`                   |
| → `ui [language]`     | UI のインターフェース言語を設定する                        | `/language ui zh-CN`          |
| → `output [language]` | LLM の出力言語を設定する                          | `/language output Chinese`    |
| `/quit`               | Qwen Code をすぐに終了する                       | `/quit` または `/exit`            |

コマンドの完全なリストは [CLI リファレンス](./features/commands) を参照してください。

## 初心者向けプロのヒント

**リクエストは具体的に**

- 例: 「バグを直して」
- 改善例: 「認証情報を入力した後に画面が真っ白になるログインバグを修正して」

**ステップバイステップで指示する**

- 複雑なタスクはステップに分割します：

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**まずは Qwen Code にコードを探索させる**

- 変更を加える前に、Qwen Code にコードを理解させます：

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**ショートカットで時間を節約する**

- `?` キーを押して利用可能なキーボードショートカットを表示する
- `Tab` キーでコマンド補完を行う
- `↑` キーでコマンド履歴を表示する
- `/` を入力してすべてのスラッシュコマンドを表示する

## ヘルプの入手方法

- **Qwen Code 内**: `/help` と入力するか、「〜するにはどうすればいいですか？」と質問する
- **ドキュメント**: 今いる場所です！他のガイドも参照してください
- **コミュニティ**: ヒントやサポートについては [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions) に参加してください