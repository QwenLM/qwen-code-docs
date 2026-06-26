# Agent Skills

> Qwen Code の機能を拡張するために、スキルを作成、管理、共有できます。

このガイドでは、**Qwen Code** で Agent Skills を作成、使用、管理する方法を説明します。スキルはモジュール化された機能で、指示（およびオプションでスクリプト/リソース）を含む整理されたフォルダを通じてモデルの効果を拡張します。

## 前提条件

- Qwen Code（最新バージョン）
- Qwen Code の基本的な知識（[クイックスタート](../quickstart.md)）

## Agent Skills とは？

Agent Skills は専門知識を発見可能な機能にパッケージ化します。各スキルは、モデルが関連する場合に読み込める指示を含む `SKILL.md` ファイルと、オプションのサポートファイル（スクリプトやテンプレートなど）で構成されます。

### スキルの呼び出し方法

スキルは**モデル起動型**です。モデルが、あなたのリクエストとスキルの説明に基づいて自律的に使用するタイミングを決定します。これは、スラッシュコマンド（あなたが明示的に `/command` と入力する**ユーザー起動型**）とは異なります。

スキルを明示的に呼び出すには、`/skills` スラッシュコマンドを使用します。

```bash
/skills <skill-name>
```

オートコンプリートを使用して、利用可能なスキルとその説明を参照してください。

### 利点

- Qwen Code を自分のワークフローに拡張
- git を介してチームと専門知識を共有
- 繰り返しのプロンプトを削減
- 複数のスキルを組み合わせて複雑なタスクを実行

## スキルを作成する

スキルは `SKILL.md` ファイルを含むディレクトリとして保存されます。

### 個人スキル

個人スキルはすべてのプロジェクトで利用できます。`~/.qwen/skills/` に保存します。

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

個人スキルは以下に使用します。

- 個人のワークフローと設定
- 開発中のスキル
- 個人の生産性向上ツール

### プロジェクトスキル

プロジェクトスキルはチームと共有します。プロジェクト内の `.qwen/skills/` に保存します。

```bash
mkdir -p .qwen/skills/my-skill-name
```

プロジェクトスキルは以下に使用します。

- チームのワークフローと規約
- プロジェクト固有の専門知識
- 共有ユーティリティとスクリプト

プロジェクトスキルは git にチェックインでき、チームメンバーが自動的に利用できるようになります。

## `SKILL.md` を書く

YAML フロントマターと Markdown コンテンツを含む `SKILL.md` ファイルを作成します。

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

Qwen Code は現在、以下を検証します。

- `name` は空でない文字列で、`/^[\p{L}\p{N}_:.-]+$/u` に一致すること。Unicode の文字と数字（CJK、キリル文字、アクセント付きラテン文字も可）、さらに `_`、`:`、`.`、`-` を使用できます。空白、スラッシュ、括弧、その他構造的に安全でない文字はパース時に拒否されます。
- `description` は空でない文字列であること。
- `priority` はオプションです。指定する場合は有限の数値である必要があります。値が大きいほど `/skills` リストで先にソートされますが、これはスラッシュコマンドの補完（`/` と入力）と `/help` のカスタムコマンド表示には影響しません。これらはアルファベット順のままです。そのため、優先度の高いスキルが組み込みコマンドの順序を変更することはありません。省略された場合や無効な値は未設定として扱われ、`0` と同様に動作します。

推奨される慣例：

- 共有可能な名前には、小文字の ASCII とハイフンを使用する（例：`tsx-helper`）。
- `description` は具体的に記述する：スキルが**何を**行うか、および**いつ**使用するか（ユーザーが自然に言及するキーワード）を含める。
- `priority` は、`/skills` でデフォルトのアルファベット順より前に確実に表示させたいスキルにのみ使用する。負の優先度も許可され、未設定のスキルより後ろにソートされます。

### オプション：ファイルパスでスキルをゲートする（`paths:`）

コードベースの特定の部分にのみ関係するスキルの場合は、glob パターンのリスト `paths:` を追加します。スキルは、ツールコールが一致するファイルにアクセスするまで、モデルの利用可能スキル一覧に表示されません。

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

- glob は [picomatch](https://github.com/micromatch/picomatch) を使用してプロジェクトルートからの相対パスで照合されます。プロジェクトルート外のファイルはアクティブ化をトリガーしません。
- パスゲートされたスキルは、一致するファイルにアクセスされると、**セッションの残りの間アクティブ化されたまま**になります。新しいセッション、またはスキルファイルの編集によってトリガーされる `refreshCache` は、アクティブ化をリセットします。
- `paths:` は**モデルによる**発見のみをゲートし、SkillTool の一覧レベルでのみ影響します。`user-invocable: false` が設定されていない限り、パスゲートされたスキルを `/<skill-name>` または `/skills` ピッカーで自分で呼び出すことは常に可能です。そのユーザーパスはアクティブ化状態に関係なくスキル本体を実行します。ただし、モデル側は一致するファイルにアクセスされるまでゲートされたままです。スラッシュ呼び出しはモデル側のアクティブ化を解除**しません**。そのため、モデルに呼び出しを連鎖させたい場合（`Skill { skill: ... }` を自分で呼び出すなど）は、最初にスキルの `paths:` に一致するファイルにアクセスしてください。
- `paths:` と `disable-model-invocation: true` の組み合わせは許可されますが、ゲートは効果がありません。スキルはモデルから隠されるため、パスアクティベーションがスキルを宣伝することはありません。

### オプション：ユーザー呼び出しとモデル呼び出しを制御する

スキルはデフォルトでユーザー呼び出し可能です。スキルをスラッシュコマンドから隠し、モデル呼び出しには利用できるようにするには、`user-invocable: false` を設定します。

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

これにより、`/<skill-name>` による呼び出しと `/skills` ピッカーの結果からスキルが削除されます。モデルからは隠されません。

モデル呼び出しからスキルを隠し、ユーザーによる直接呼び出しは可能にするには、`disable-model-invocation: true` を設定します。

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

両方のフィールドを組み合わせることもできますが、その場合、スキルは通常のユーザーまたはモデル呼び出しパスから到達できなくなります。

## サポートファイルを追加する

`SKILL.md` と一緒に追加ファイルを作成します。

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

## 利用可能なスキルを表示する

Qwen Code は以下の場所からスキルを検出します。

- 個人スキル: `~/.qwen/skills/`
- プロジェクトスキル: `.qwen/skills/`
- 拡張機能スキル: インストールされた拡張機能が提供するスキル

### 拡張機能スキル

拡張機能はカスタムスキルを提供でき、拡張機能が有効になると利用可能になります。これらのスキルは拡張機能の `skills/` ディレクトリに保存され、個人スキルやプロジェクトスキルと同じ形式に従います。

拡張機能スキルは、拡張機能がインストールされて有効になると自動的に検出され、読み込まれます。

どの拡張機能がスキルを提供するかを確認するには、拡張機能の `qwen-extension.json` ファイルの `skills` フィールドを確認してください。

利用可能なスキルを表示するには、Qwen Code に直接質問します。

```text
What Skills are available?
```

> **注意 — モデルビューとユーザービューの違い。** モデルに質問すると、モデルが現在見えるスキルだけが表示されます。スキルが `paths:`（上記「オプション：ファイルパスでスキルをゲートする」を参照）を使用している場合、一致するファイルにアクセスされるまでその一覧には表示されません。`/skills` スラッシュコマンドは、直接呼び出し可能なスキルを表示します。`user-invocable: false` のスキルはディスク上には存在しますが、モデルには表示されない場合があります。

または、スラッシュコマンドを使用してユーザー呼び出し可能なリストを参照します（まだアクティブ化されていないパスゲートされたスキルも含む）。

```text
/skills
```

または、ファイルシステムを確認します。

```bash
# 個人スキルの一覧
ls ~/.qwen/skills/

# プロジェクトスキルの一覧（プロジェクトディレクトリ内の場合）
ls .qwen/skills/

# 特定のスキルの内容を表示
cat ~/.qwen/skills/my-skill/SKILL.md
```

## スキルをテストする

スキルを作成したら、説明に一致する質問をしてテストします。

例：説明に「PDF ファイル」とある場合：

```text
Can you help me extract text from this PDF?
```

リクエストに一致する場合、モデルが自律的にスキルを使用することを決定します。明示的に呼び出す必要はありません。

## スキルをデバッグする

Qwen Code がスキルを使用しない場合は、以下の一般的な問題を確認してください。

### 説明を具体的にする

曖昧すぎる場合：

```yaml
description: Helps with documents
```

具体的な場合：

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### ファイルパスを確認する

- 個人スキル: `~/.qwen/skills/<skill-name>/SKILL.md`
- プロジェクトスキル: `.qwen/skills/<skill-name>/SKILL.md`

```bash
# 個人
ls ~/.qwen/skills/my-skill/SKILL.md

# プロジェクト
ls .qwen/skills/my-skill/SKILL.md
```

### YAML 構文を確認する

YAML が無効だと、スキルのメタデータが正しく読み込まれません。

```bash
cat SKILL.md | head -n 15
```

以下を確認してください。

- 1行目が `---` で開始していること
- Markdown コンテンツの前に `---` で閉じていること
- YAML 構文が有効であること（タブなし、正しいインデント）

### エラーを表示する

デバッグモードで Qwen Code を実行すると、スキルの読み込みエラーが表示されます。

```bash
qwen --debug
```

## スキルをチームと共有する

プロジェクトリポジトリを通じてスキルを共有できます。

1. `.qwen/skills/` にスキルを追加する
2. コミットしてプッシュする
3. チームメイトが変更をプルする

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## スキルを更新する

`SKILL.md` を直接編集します。

```bash
# 個人スキル
code ~/.qwen/skills/my-skill/SKILL.md

# プロジェクトスキル
code .qwen/skills/my-skill/SKILL.md
```

変更は次回 Qwen Code を起動したときに反映されます。Qwen Code が既に実行中の場合は、再起動して更新を読み込んでください。

## スキルを削除する

スキルディレクトリを削除します。

```bash
# 個人
rm -rf ~/.qwen/skills/my-skill

# プロジェクト
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## ベストプラクティス

### スキルを集中させる

1 つのスキルは 1 つの機能に対応するようにします。

- 集中型: 「PDF フォーム入力」、「Excel 分析」、「Git コミットメッセージ」
- 広すぎる: 「ドキュメント処理」（小さなスキルに分割する）

### 明確な説明を書く

モデルがスキルを使用するタイミングを発見できるよう、具体的なトリガーを含めます。

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### チームでテストする

- スキルは期待通りにアクティブ化されますか？
- 指示は明確ですか？
- 不足している例やエッジケースはありませんか？