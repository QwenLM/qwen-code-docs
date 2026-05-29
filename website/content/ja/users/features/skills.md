---
description: "Qwen Code Agent Skills の作成、管理、共有を学び、よく使う手順を再利用可能な能力としてまとめ、AI コーディングの精度を高めます。"
---

# Agent Skills

> Qwen Code の機能を拡張するために、スキルを作成、管理、共有します。

このガイドでは、**Qwen Code** で Agent Skills を作成、使用、管理する方法を説明します。スキルは、指示（およびオプションのスクリプト/リソース）を含む整理されたフォルダーで構成され、モデルの有効性を高めるモジュール型の機能です。

## Prerequisites

- Qwen Code（最新バージョン）
- Qwen Code の基本的な操作知識（[クイックスタート](../quickstart.md)）

## What are Agent Skills?

Agent Skills は、専門知識を検出可能な機能としてパッケージ化します。各スキルは、モデルが関連する際に読み込める指示を含む `SKILL.md` ファイルと、スクリプトやテンプレートなどのオプションのサポートファイルで構成されます。

### How Skills are invoked

スキルは**モデルによって呼び出されます**。モデルは、ユーザーのリクエストとスキルの説明に基づいて、いつ使用するかを自律的に判断します。これは、ユーザーが明示的に `/command` と入力して呼び出すスラッシュコマンド（**ユーザー呼び出し**）とは異なります。

スキルを明示的に呼び出したい場合は、`/skills` スラッシュコマンドを使用します：

```bash
/skills <skill-name>
```

オートコンプリートを使用して、利用可能なスキルとその説明を参照できます。

### Benefits

- ワークフローに合わせて Qwen Code を拡張
- git を介してチーム間で専門知識を共有
- 繰り返しプロンプトの入力を削減
- 複雑なタスクのために複数のスキルを組み合わせ

## Create a Skill

スキルは `SKILL.md` ファイルを含むディレクトリとして保存されます。

### Personal Skills

パーソナルスキルは、すべてのプロジェクトで利用可能です。`~/.qwen/skills/` に保存します：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

パーソナルスキルは以下の用途に適しています：

- 個人のワークフローと設定
- 開発中のスキル
- 個人の生産性向上ツール

### Project Skills

プロジェクトスキルはチームで共有されます。プロジェクト内の `.qwen/skills/` に保存します：

```bash
mkdir -p .qwen/skills/my-skill-name
```

プロジェクトスキルは以下の用途に適しています：

- チームのワークフローと規約
- プロジェクト固有の専門知識
- 共有ユーティリティとスクリプト

プロジェクトスキルは git にコミットでき、チームメンバーが自動的に利用できるようになります。

## Write `SKILL.md`

YAML フロントマターと Markdown コンテンツを含む `SKILL.md` ファイルを作成します：

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

Qwen Code は現在、以下を検証します：

- `name` は `/^[\p{L}\p{N}_:.-]+$/u` に一致する空でない文字列です（Unicode の文字と数字（CJK / キリル文字 / アクセント付きラテン文字など OK）、および `_`、`:`、`.`、`-` が使用可能。空白、スラッシュ、角括弧、その他の構造的に安全でない文字は解析時に拒否されます）。
- `description` は空でない文字列です

推奨される命名規則：

- 共有可能な名前には、ハイフン区切りの小文字 ASCII を推奨します（例：`tsx-helper`）
- `description` は具体的に記述します。スキルが**何を行うか**と、**いつ使用するか**（ユーザーが自然に言及するキーワード）の両方を含めます

### Optional: gate a Skill on file paths (`paths:`)

コードベースの特定の部分にのみ関連するスキルの場合、glob パターンのリストとして `paths:` を追加します。ツール呼び出しが一致するファイルにアクセスするまで、スキルはモデルの利用可能なスキル一覧に表示されません：

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

注記：

- glob は [picomatch](https://github.com/micromatch/picomatch) を使用してプロジェクトルートからの相対パスでマッチングされます。プロジェクトルート外のファイルがアクティベーションをトリガーすることはありません。
- パス制限付きのスキルは、一致するファイルに一度アクセスすると、**セッション終了までアクティブな状態を維持します**。新しいセッションを開始するか、スキルファイルの編集によって `refreshCache` がトリガーされると、アクティベーションはリセットされます。
- `paths:` は**モデル**による検出のみを制限し、SkillTool の一覧表示レベルでのみ機能します。ユーザーは `/<skill-name>` または `/skills` ピッカーを通じて、パス制限付きスキルを常に明示的に呼び出せます。このユーザーパスは、アクティベーション状態に関係なくスキルの本体を実行します。ただし、モデル側は一致するファイルにアクセスするまで制限されたままです。スラッシュコマンドによる呼び出しは、モデル側のアクティベーションを解除**しません**。モデルに呼び出しを連鎖させたい場合（モデル自身が `Skill { skill: ... }` を呼び出す場合）は、まずスキルの `paths:` に一致するファイルにアクセスしてください。
- `paths:` と `disable-model-invocation: true` の組み合わせは可能ですが、制限機能は無効になります。スキルはモデルから非表示になるため、パスによるアクティベーションがモデルに通知されることはありません。

## Add supporting files

`SKILL.md` と同じディレクトリに追加ファイルを作成します：

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

## View available Skills

Qwen Code は以下の場所からスキルを検出します：

- パーソナルスキル：`~/.qwen/skills/`
- プロジェクトスキル：`.qwen/skills/`
- 拡張機能スキル：インストール済みの拡張機能が提供するスキル

### Extension Skills

拡張機能は、有効化時に利用可能になるカスタムスキルを提供できます。これらのスキルは拡張機能の `skills/` ディレクトリに保存され、パーソナルスキルやプロジェクトスキルと同じ形式に従います。

拡張機能がインストールされ有効化されると、拡張機能スキルは自動的に検出および読み込まれます。

どの拡張機能がスキルを提供しているかを確認するには、拡張機能の `qwen-extension.json` ファイル内の `skills` フィールドを確認してください。

利用可能なスキルを確認するには、Qwen Code に直接質問します：

```text
What Skills are available?
```

> **注意 — モデル表示とユーザー表示の違い。** モデルに質問すると、モデルが現在認識できるスキルのみが表示されます。スキルが `paths:` を使用している場合（上記の「オプション：ファイルパスでスキルを制限する」を参照）、一致するファイルにアクセスするまで一覧に表示されません。完全なセットは、`/skills` スラッシュコマンドまたはディスク上のファイルを通じて常に確認できます。

または、スラッシュコマンドで完全な一覧を参照します（アクティベーションされていないパス制限付きスキルを含む、すべてのスキルが常に表示されます）：

```text
/skills
```

または、ファイルシステムを確認します：

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Test a Skill

スキルを作成したら、説明に一致する質問をしてテストします。

例：説明に「PDF ファイル」が含まれている場合：

```text
Can you help me extract text from this PDF?
```

リクエストに一致する場合、モデルは自律的にスキルを使用することを決定します。明示的に呼び出す必要はありません。

## Debug a Skill

Qwen Code がスキルを使用しない場合は、以下の一般的な問題を確認してください：

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

- パーソナルスキル：`~/.qwen/skills/<skill-name>/SKILL.md`
- プロジェクトスキル：`.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### Check YAML syntax

無効な YAML は、スキルメタデータの正しい読み込みを妨げます。

```bash
cat SKILL.md | head -n 15
```

以下を確認してください：

- 1行目に開始の `---` を配置
- Markdown コンテンツの前に終了の `---` を配置
- 有効な YAML 構文（タブ不使用、正しいインデント）

### View errors

デバッグモードで Qwen Code を実行し、スキル読み込みエラーを確認します：

```bash
qwen --debug
```

## Share Skills with your team

プロジェクトリポジトリを通じてスキルを共有できます：

1. `.qwen/skills/` 配下にスキルを追加
2. コミットしてプッシュ
3. チームメンバーが変更をプル

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Update a Skill

`SKILL.md` を直接編集します：

```bash
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

変更は次回 Qwen Code 起動時に反映されます。Qwen Code がすでに実行中の場合は、更新を読み込むために再起動してください。

## Remove a Skill

スキルのディレクトリを削除します：

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## Best practices

### Keep Skills focused

1つのスキルは1つの機能に対応させるべきです：

- 焦点化された例：「PDF フォーム入力」、「Excel 分析」、「Git コミットメッセージ」
- 広すぎる例：「ドキュメント処理」（より小さなスキルに分割する）

### Write clear descriptions

特定のトリガーを含めることで、モデルがスキルをいつ使用すべきかを検出しやすくします：

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Test with your team

- 期待ど<think>
</think>

# Agent Skills

> Qwen Code の機能を拡張するために、スキルを作成、管理、共有します。

このガイドでは、**Qwen Code** で Agent Skills を作成、使用、管理する方法を説明します。スキルは、指示（およびオプションのスクリプト/リソース）を含む整理されたフォルダーで構成され、モデルの有効性を高めるモジュール型の機能です。

## Prerequisites

- Qwen Code（最新バージョン）
- Qwen Code の基本的な操作知識（[クイックスタート](../quickstart.md)）

## What are Agent Skills?

Agent Skills は、専門知識を検出可能な機能としてパッケージ化します。各スキルは、モデルが関連する際に読み込める指示を含む `SKILL.md` ファイルと、スクリプトやテンプレートなどのオプションのサポートファイルで構成されます。

### How Skills are invoked

スキルは**モデルによって呼び出されます**。モデルは、ユーザーのリクエストとスキルの説明に基づいて、いつ使用するかを自律的に判断します。これは、ユーザーが明示的に `/command` と入力して呼び出すスラッシュコマンド（**ユーザー呼び出し**）とは異なります。

スキルを明示的に呼び出したい場合は、`/skills` スラッシュコマンドを使用します：

```bash
/skills <skill-name>
```

オートコンプリートを使用して、利用可能なスキルとその説明を参照できます。

### Benefits

- ワークフローに合わせて Qwen Code を拡張
- git を介してチーム間で専門知識を共有
- 繰り返しプロンプトの入力を削減
- 複雑なタスクのために複数のスキルを組み合わせ

## Create a Skill

スキルは `SKILL.md` ファイルを含むディレクトリとして保存されます。

### Personal Skills

パーソナルスキルは、すべてのプロジェクトで利用可能です。`~/.qwen/skills/` に保存します：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

パーソナルスキルは以下の用途に適しています：

- 個人のワークフローと設定
- 開発中のスキル
- 個人の生産性向上ツール

### Project Skills

プロジェクトスキルはチームで共有されます。プロジェクト内の `.qwen/skills/` に保存します：

```bash
mkdir -p .qwen/skills/my-skill-name
```

プロジェクトスキルは以下の用途に適しています：

- チームのワークフローと規約
- プロジェクト固有の専門知識
- 共有ユーティリティとスクリプト

プロジェクトスキルは git にコミットでき、チームメンバーが自動的に利用できるようになります。

## Write `SKILL.md`

YAML フロントマターと Markdown コンテンツを含む `SKILL.md` ファイルを作成します：

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

Qwen Code は現在、以下を検証します：

- `name` は `/^[\p{L}\p{N}_:.-]+$/u` に一致する空でない文字列です（Unicode の文字と数字（CJK / キリル文字 / アクセント付きラテン文字など OK）、および `_`、`:`、`.`、`-` が使用可能。空白、スラッシュ、角括弧、その他の構造的に安全でない文字は解析時に拒否されます）。
- `description` は空でない文字列です

推奨される命名規則：

- 共有可能な名前には、ハイフン区切りの小文字 ASCII を推奨します（例：`tsx-helper`）
- `description` は具体的に記述します。スキルが**何を行うか**と、**いつ使用するか**（ユーザーが自然に言及するキーワード）の両方を含めます

### Optional: gate a Skill on file paths (`paths:`)

コードベースの特定の部分にのみ関連するスキルの場合、glob パターンのリストとして `paths:` を追加します。ツール呼び出しが一致するファイルにアクセスするまで、スキルはモデルの利用可能なスキル一覧に表示されません：

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

注記：

- glob は [picomatch](https://github.com/micromatch/picomatch) を使用してプロジェクトルートからの相対パスでマッチングされます。プロジェクトルート外のファイルがアクティベーションをトリガーすることはありません。
- パス制限付きのスキルは、一致するファイルに一度アクセスすると、**セッション終了までアクティブな状態を維持します**。新しいセッションを開始するか、スキルファイルの編集によって `refreshCache` がトリガーされると、アクティベーションはリセットされます。
- `paths:` は**モデル**による検出のみを制限し、SkillTool の一覧表示レベルでのみ機能します。ユーザーは `/<skill-name>` または `/skills` ピッカーを通じて、パス制限付きスキルを常に明示的に呼び出せます。このユーザーパスは、アクティベーション状態に関係なくスキルの本体を実行します。ただし、モデル側は一致するファイルにアクセスするまで制限されたままです。スラッシュコマンドによる呼び出しは、モデル側のアクティベーションを解除**しません**。モデルに呼び出しを連鎖させたい場合（モデル自身が `Skill { skill: ... }` を呼び出す場合）は、まずスキルの `paths:` に一致するファイルにアクセスしてください。
- `paths:` と `disable-model-invocation: true` の組み合わせは可能ですが、制限機能は無効になります。スキルはモデルから非表示になるため、パスによるアクティベーションがモデルに通知されることはありません。

## Add supporting files

`SKILL.md` と同じディレクトリに追加ファイルを作成します：

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

## View available Skills

Qwen Code は以下の場所からスキルを検出します：

- パーソナルスキル：`~/.qwen/skills/`
- プロジェクトスキル：`.qwen/skills/`
- 拡張機能スキル：インストール済みの拡張機能が提供するスキル

### Extension Skills

拡張機能は、有効化時に利用可能になるカスタムスキルを提供できます。これらのスキルは拡張機能の `skills/` ディレクトリに保存され、パーソナルスキルやプロジェクトスキルと同じ形式に従います。

拡張機能がインストールされ有効化されると、拡張機能スキルは自動的に検出および読み込まれます。

どの拡張機能がスキルを提供しているかを確認するには、拡張機能の `qwen-extension.json` ファイル内の `skills` フィールドを確認してください。

利用可能なスキルを確認するには、Qwen Code に直接質問します：

```text
What Skills are available?
```

> **注意 — モデル表示とユーザー表示の違い。** モデルに質問すると、モデルが現在認識できるスキルのみが表示されます。スキルが `paths:` を使用している場合（上記の「オプション：ファイルパスでスキルを制限する」を参照）、一致するファイルにアクセスするまで一覧に表示されません。完全なセットは、`/skills` スラッシュコマンドまたはディスク上のファイルを通じて常に確認できます。

または、スラッシュコマンドで完全な一覧を参照します（アクティベーションされていないパス制限付きスキルを含む、すべてのスキルが常に表示されます）：

```text
/skills
```

または、ファイルシステムを確認します：

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Test a Skill

スキルを作成したら、説明に一致する質問をしてテストします。

例：説明に「PDF ファイル」が含まれている場合：

```text
Can you help me extract text from this PDF?
```

リクエストに一致する場合、モデルは自律的にスキルを使用することを決定します。明示的に呼び出す必要はありません。

## Debug a Skill

Qwen Code がスキルを使用しない場合は、以下の一般的な問題を確認してください：

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

- パーソナルスキル：`~/.qwen/skills/<skill-name>/SKILL.md`
- プロジェクトスキル：`.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### Check YAML syntax

無効な YAML は、スキルメタデータの正しい読み込みを妨げます。

```bash
cat SKILL.md | head -n 15
```

以下を確認してください：

- 1行目に開始の `---` を配置
- Markdown コンテンツの前に終了の `---` を配置
- 有効な YAML 構文（タブ不使用、正しいインデント）

### View errors

デバッグモードで Qwen Code を実行し、スキル読み込みエラーを確認します：

```bash
qwen --debug
```

## Share Skills with your team

プロジェクトリポジトリを通じてスキルを共有できます：

1. `.qwen/skills/` 配下にスキルを追加
2. コミットしてプッシュ
3. チームメンバーが変更をプル

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Update a Skill

`SKILL.md` を直接編集します：

```bash
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

変更は次回 Qwen Code 起動時に反映されます。Qwen Code がすでに実行中の場合は、更新を読み込むために再起動してください。

## Remove a Skill

スキルのディレクトリを削除します：

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## Best practices

### Keep Skills focused

1つのスキルは1つの機能に対応させるべきです：

- 焦点化された例：「PDF フォーム入力」、「Excel 分析」、「Git コミットメッセージ」
- 広すぎる例：「ドキュメント処理」（より小さなスキルに分割する）

### Write clear descriptions

特定のトリガーを含めることで、モデルがスキルをいつ使用すべきかを検出しやすくします：

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### Test with your team

- 期待どおりにスキルがアクティベートされるか？
- 指示は明確か？
- 不足している例やエッジケースはないか？