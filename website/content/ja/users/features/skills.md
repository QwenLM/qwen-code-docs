# Agent Skills

> Qwen Code の機能を拡張するために、Skill を作成、管理、共有します。

このガイドでは、**Qwen Code** で Agent Skills を作成、使用、管理する方法を説明します。Skill は、指示（およびオプションでスクリプトやリソース）を含む整理されたフォルダを通じて、モデルの効果を拡張するモジュール型の機能です。

## Prerequisites

- Qwen Code（最新バージョン）
- Qwen Code の基本的な操作知識（[クイックスタート](../quickstart.md)）

## What are Agent Skills?

Agent Skills は専門知識を検出可能な機能としてパッケージ化します。各 Skill は、モデルが関連する際に読み込める指示を含む `SKILL.md` ファイルと、スクリプトやテンプレートなどのオプションのサポートファイルで構成されます。

### How Skills are invoked

Skill は**モデルによって呼び出されます**。モデルは、ユーザーのリクエストと Skill の説明に基づいて、いつ使用するかを自律的に判断します。これは、ユーザーが明示的に `/command` と入力して呼び出すスラッシュコマンド（**ユーザー呼び出し**）とは異なります。

Skill を明示的に呼び出したい場合は、`/skills` スラッシュコマンドを使用します。

```bash
/skills <skill-name>
```

オートコンプリートを使用して、利用可能な Skill とその説明を参照できます。

### Benefits

- ワークフローに合わせて Qwen Code を拡張
- git を介してチーム全体で専門知識を共有
- 繰り返しプロンプトの入力を削減
- 複数の Skill を組み合わせて複雑なタスクに対応

## Create a Skill

Skill は `SKILL.md` ファイルを含むディレクトリとして保存されます。

### Personal Skills

個人用 Skill はすべてのプロジェクトで利用可能です。`~/.qwen/skills/` に保存します。

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

個人用 Skill は以下の用途に使用します。

- 個人のワークフローや設定
- 開発中の Skill
- 個人の生産性向上ツール

### Project Skills

プロジェクト用 Skill はチームで共有されます。プロジェクト内の `.qwen/skills/` に保存します。

```bash
mkdir -p .qwen/skills/my-skill-name
```

プロジェクト用 Skill は以下の用途に使用します。

- チームのワークフローや規約
- プロジェクト固有の専門知識
- 共有ユーティリティやスクリプト

プロジェクト用 Skill は git にコミットでき、チームメンバーが自動的に利用できるようになります。

## Write `SKILL.md`

YAML フロントマターと Markdown コンテンツを含む `SKILL.md` ファイルを作成します。

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### Field requirements

Qwen Code は現在、以下の項目を検証します。

- `name` が空でない文字列であること
- `description` が空でない文字列であること

推奨される命名規則（現時点では厳密には強制されません）。

- `name` には小文字、数字、ハイフンを使用
- `description` を具体的に記述：Skill が**何を行うか**と、**いつ使用するか**（ユーザーが自然に言及するキーワード）の両方を含める

## Add supporting files

`SKILL.md` と同じディレクトリに追加ファイルを作成します。

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

`SKILL.md` からこれらのファイルを参照します。

````markdown
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## View available Skills

Qwen Code は以下の場所から Skill を検出します。

- 個人用 Skill: `~/.qwen/skills/`
- プロジェクト用 Skill: `.qwen/skills/`
- 拡張機能用 Skill: インストール済みの拡張機能が提供する Skill

### Extension Skills

拡張機能は、有効化すると利用可能になるカスタム Skill を提供できます。これらの Skill は拡張機能の `skills/` ディレクトリに保存され、個人用およびプロジェクト用 Skill と同じ形式に従います。

拡張機能がインストールされ有効になると、拡張機能用 Skill は自動的に検出および読み込まれます。

どの拡張機能が Skill を提供しているかを確認するには、拡張機能の `qwen-extension.json` ファイル内の `skills` フィールドを確認します。

利用可能な Skill を確認するには、Qwen Code に直接質問します。

```text
What Skills are available?
```

または、ファイルシステムを直接確認します。

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Test a Skill

Skill を作成したら、説明に一致する質問をしてテストします。

例：説明に「PDF ファイル」が含まれている場合。

```text
Can you help me extract text from this PDF?
```

リクエストに一致する場合、モデルは自律的に Skill の使用を決定します。明示的に呼び出す必要はありません。

## Debug a Skill

Qwen Code が Skill を使用しない場合は、以下の一般的な問題を確認してください。

### Make the description specific

曖昧すぎる例：

```yaml
description: Helps with documents
```

具体的な例：

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### Verify file path

- 個人用 Skill: `~/.qwen/skills/<skill-name>/SKILL.md`
- プロジェクト用 Skill: `.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### Check YAML syntax

YAML が無効な場合、Skill のメタデータが正しく読み込まれません。

```bash
cat SKILL.md | head -n 15
```

以下の点を確認してください。

- 1 行目に開始の `---` があること
- Markdown コンテンツの前に終了の `---` があること
- 有効な YAML 構文であること（タブ不使用、正しいインデント）

### View errors

デバッグモードで Qwen Code を実行し、Skill の読み込みエラーを確認します。

```bash
qwen --debug
```

## Share Skills with your team

プロジェクトリポジトリを通じて Skill を共有できます。

1. `.qwen/skills/` 配下に Skill を追加
2. コミットしてプッシュ
3. チームメンバーが変更をプル

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Update a Skill

`SKILL.md` を直接編集します。

```bash
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

変更は次回 Qwen Code 起動時に反映されます。Qwen Code がすでに実行中の場合は、再起動して更新を読み込んでください。

## Remove a Skill

Skill のディレクトリを削除します。

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## Best practices

### Keep Skills focused

1 つの Skill は 1 つの機能に対応させるべきです。

- 焦点を絞った例：「PDF フォーム入力」「Excel 分析」「Git コミットメッセージ」
- 広すぎる例：「ドキュメント処理」（より小さな Skill に分割する）

### Write clear descriptions

具体的なトリガーを含めることで、モデルが Skill を使用するタイミングを適切に判断できるようにします。

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Test with your team

- 期待したタイミングで Skill が起動するか？
- 指示は明確か？
- 不足している例やエッジケースはないか？