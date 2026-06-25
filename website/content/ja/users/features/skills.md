# Agent Skills

> Skills を作成・管理・共有して Qwen Code の機能を拡張しましょう。

このガイドでは、**Qwen Code** における Agent Skills の作成・使用・管理方法を説明します。Skills はモデルの効果を高めるモジュール型の機能で、指示（および任意でスクリプトやリソース）を含む整理されたフォルダーで構成されます。

## 前提条件

- Qwen Code（最新バージョン）
- Qwen Code の基本的な知識（[クイックスタート](../quickstart.md)）

## Agent Skills とは？

Agent Skills は専門知識を発見可能な機能としてパッケージ化します。各 Skill は、モデルが関連性があると判断したときに読み込める指示が書かれた `SKILL.md` ファイルと、スクリプトやテンプレートなどのオプションのサポートファイルで構成されます。

### Skills の呼び出し方

Skills は**モデル呼び出し型**です。モデルがあなたのリクエストと Skill の説明に基づいて、自律的に使用するタイミングを決定します。これは**ユーザー呼び出し型**のスラッシュコマンド（`/command` と明示的に入力するもの）とは異なります。

Skill を明示的に呼び出したい場合は、`/skills` スラッシュコマンドを使用してください：

```bash
/skills <skill-name>
```

オートコンプリートで利用可能な Skills と説明を参照できます。

### メリット

- ワークフローに合わせて Qwen Code を拡張できる
- git を通じてチーム内で専門知識を共有できる
- 繰り返しのプロンプト入力を削減できる
- 複数の Skills を組み合わせて複雑なタスクに対応できる

## Skill を作成する

Skills は `SKILL.md` ファイルを含むディレクトリとして保存されます。

### 個人用 Skills

個人用 Skills はすべてのプロジェクトで利用できます。`~/.qwen/skills/` に保存してください：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

個人用 Skills の用途：

- 個人のワークフローや好み
- 開発中の Skills
- 個人の生産性向上ツール

### プロジェクト Skills

プロジェクト Skills はチームと共有されます。プロジェクト内の `.qwen/skills/` に保存してください：

```bash
mkdir -p .qwen/skills/my-skill-name
```

プロジェクト Skills の用途：

- チームのワークフローと規約
- プロジェクト固有の専門知識
- 共有ユーティリティとスクリプト

プロジェクト Skills は git にコミットでき、チームメンバーが自動的に利用できるようになります。

## `SKILL.md` を書く

YAML フロントマターと Markdown コンテンツを含む `SKILL.md` ファイルを作成します：

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
priority: 10
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### フィールドの要件

Qwen Code は現在、以下を検証します：

- `name` は `/^[\p{L}\p{N}_:.-]+$/u` にマッチする空でない文字列 — Unicode の文字と数字（CJK・キリル文字・アクセント付きラテン文字すべて OK）、および `_`、`:`、`.`、`-`。空白、スラッシュ、括弧、その他の構造的に安全でない文字はパース時に拒否されます。
- `description` は空でない文字列
- `priority` はオプションです。指定する場合は有限の数値でなければなりません。値が大きいほど `/skills` リストの上位に表示されますが、スラッシュコマンドの補完（`/` と入力した場合）と `/help` のカスタムコマンドビューはアルファベット順のままです。そのため、高い優先度を設定しても組み込みコマンドの順序は変わりません。省略または無効な値は未設定として扱われ、`0` と同じ動作になります。

推奨される規約：

- 共有可能な名前にはハイフン区切りの小文字 ASCII を使用する（例：`tsx-helper`）
- `description` は具体的に書く：Skill が**何をするか**と**いつ使うか**（ユーザーが自然に使うキーワード）の両方を含める
- `priority` は `/skills` でデフォルトのアルファベット順よりも確実に前に表示したい Skills にのみ使用する。負の優先度も許可されており、未設定の Skills よりも後ろに表示されます。

### オプション：ファイルパスで Skill を制限する（`paths:`）

コードベースの特定の部分にのみ関係する Skills には、グロブパターンの `paths:` リストを追加します。ツール呼び出しがマッチするファイルに触れるまで、その Skill はモデルの利用可能 Skills リストに表示されません：

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

注意事項：

- グロブはプロジェクトルートからの相対パスで [picomatch](https://github.com/micromatch/picomatch) を使ってマッチングされます。プロジェクトルート外のファイルはアクティベーションをトリガーしません。
- パスで制限された Skill は、マッチするファイルに一度触れると**セッションの残りの間ずっとアクティブ状態を保ちます**。新しいセッションを開始するか、Skill ファイルを編集してトリガーされた `refreshCache` によってアクティベーションがリセットされます。
- `paths:` は**モデル**による検出のみを制限し、SkillTool のリストレベルでのみ機能します。`user-invocable: false` が設定されていない限り、`/<skill-name>` または `/skills` ピッカーから直接パス制限 Skill を呼び出すことができます。このユーザーパスはアクティベーション状態に関わらず Skill 本体を実行します。ただし、モデル側はマッチするファイルに触れるまで制限されたままです。スラッシュによる呼び出しはモデル側のアクティベーションを解除しないため、モデルに呼び出しからチェーンさせたい場合（モデル自身が `Skill { skill: ... }` を呼び出す場合）は、先に Skill の `paths:` にマッチするファイルにアクセスする必要があります。
- `paths:` と `disable-model-invocation: true` を組み合わせることは可能ですが、ゲートは無効になります。Skill はモデルからは常に非表示になるため、パスアクティベーションが広告されることはありません。

### オプション：ユーザーとモデルの呼び出しを制御する

Skills はデフォルトでユーザーが呼び出せます。Skill をスラッシュコマンドの直接呼び出しから隠しつつ、モデル呼び出しは維持するには、`user-invocable: false` を設定します：

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

これにより、Skill が `/<skill-name>` による呼び出しと `/skills` ピッカーの結果から除外されます。モデルからは非表示になりません。

モデル呼び出しから Skill を隠しつつ、ユーザーによる直接呼び出しを維持するには、`disable-model-invocation: true` を設定します：

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

両方のフィールドを組み合わせることもできますが、その場合は通常のユーザーまたはモデルの呼び出しパスからは Skill にアクセスできなくなります。

## サポートファイルを追加する

`SKILL.md` と並べて追加のファイルを作成します：

```text
my-skill/
├── SKILL.md (required)
├── reference.md (optional documentation)
├── examples.md (optional examples)
├── scripts/
│   └── helper.py (optional utility)
└── templates/
    └── template.txt (optional template)
```

`SKILL.md` からこれらのファイルを参照します：

````markdown
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## 利用可能な Skills を確認する

Qwen Code は以下の場所から Skills を検出します：

- 個人用 Skills：`~/.qwen/skills/`
- プロジェクト Skills：`.qwen/skills/`
- 拡張機能 Skills：インストールされた拡張機能が提供する Skills

### 拡張機能 Skills

拡張機能はカスタム Skills を提供でき、拡張機能が有効になると利用できるようになります。これらの Skills は拡張機能の `skills/` ディレクトリに保存され、個人用およびプロジェクト Skills と同じ形式に従います。

拡張機能 Skills はインストールして有効化すると自動的に検出・ロードされます。

どの拡張機能が Skills を提供するかを確認するには、拡張機能の `qwen-extension.json` ファイルの `skills` フィールドを確認してください。

利用可能な Skills を確認するには、Qwen Code に直接聞いてください：

```text
What Skills are available?
```

> **注意 — モデルのビューとユーザーのビューの違い。** モデルに聞いた場合、モデルが現在見える Skills のみが表示されます。Skill が `paths:` を使用している場合（上記の「オプション：ファイルパスで Skill を制限する」を参照）、マッチするファイルに触れるまでそのリストには表示されません。`/skills` スラッシュコマンドは直接呼び出せる Skills を表示します。`user-invocable: false` の Skills はディスク上には存在し、モデルには見える場合があります。

または、スラッシュコマンドでユーザー呼び出し可能なリストを参照します（まだアクティベートされていないパス制限 Skills も含む）：

```text
/skills
```

またはファイルシステムを直接確認します：

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Skill をテストする

Skill を作成したら、説明に合った質問をしてテストします。

例：説明に「PDF files」と記載されている場合：

```text
Can you help me extract text from this PDF?
```

モデルはリクエストにマッチすれば自律的に Skill を使用します。明示的に呼び出す必要はありません。

## Skill をデバッグする

Qwen Code が Skill を使用しない場合は、以下の一般的な問題を確認してください：

### 説明を具体的にする

曖昧な例：

```yaml
description: Helps with documents
```

具体的な例：

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### ファイルパスを確認する

- 個人用 Skills：`~/.qwen/skills/<skill-name>/SKILL.md`
- プロジェクト Skills：`.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### YAML 構文を確認する

YAML が無効だと Skill のメタデータが正しく読み込まれません。

```bash
cat SKILL.md | head -n 15
```

確認事項：

- 1 行目に `---` がある
- Markdown コンテンツの前に `---` がある
- YAML 構文が有効（タブなし、正しいインデント）

### エラーを確認する

デバッグモードで Qwen Code を実行して Skill の読み込みエラーを確認します：

```bash
qwen --debug
```

## チームと Skills を共有する

プロジェクトリポジトリを通じて Skills を共有できます：

1. `.qwen/skills/` 以下に Skill を追加する
2. コミットしてプッシュする
3. チームメンバーが変更をプルする

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Skill を更新する

`SKILL.md` を直接編集します：

```bash
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

変更は次回 Qwen Code を起動したときに有効になります。Qwen Code がすでに起動している場合は再起動して更新を読み込んでください。

## Skill を削除する

Skill のディレクトリを削除します：

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## ベストプラクティス

### Skills は一点集中で

1 つの Skill は 1 つの機能に対応させます：

- 良い例：「PDF form filling」「Excel analysis」「Git commit messages」
- 悪い例：「Document processing」（より小さな Skills に分割する）

### 明確な説明を書く

特定のトリガーを含めることで、モデルが Skills をいつ使うべきか判断しやすくなります：

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### チームでテストする

- 期待通りに Skill がアクティベートされるか？
- 指示は明確か？
- 不足しているサンプルやエッジケースはないか？
