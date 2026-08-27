# エージェントスキル

> Qwen Code の機能を拡張するために、Skill を作成、管理、共有します。

本ガイドでは、**Qwen Code** で Agent Skill を作成、使用、管理する方法について説明します。Skill は、指示（およびオプションでスクリプトやリソース）を含む整理されたフォルダを通じて、モデルの効果を拡張するモジュール型の機能です。

## 前提条件

- Qwen Code（最新バージョン）
- Qwen Code の基本的な知識（[クイックスタート](../quickstart.md)）

## Agent Skill とは？

Agent Skill は専門知識を検出可能な機能としてパッケージ化します。各 Skill は、モデルが関連するときにロードできる指示を含む `SKILL.md` ファイルと、スクリプトやテンプレートなどのオプションのサポートファイルで構成されます。

### Skill の呼び出し方法

Skill は**モデルによって呼び出されます**。モデルは、あなたのリクエストと Skill の説明に基づいて、いつ使用するかを自律的に判断します。これは、スラッシュコマンド（ユーザーが明示的に `/command` と入力する**ユーザーによって呼び出される**もの）とは異なります。

Skill を明示的に呼び出したい場合は、Skill の名前を使用してスラッシュコマンドとして入力します。

```bash
/<skill-name>
```

`/` の入力を開始すると、オートコンプリートで利用可能な Skill とその説明を閲覧できます。`/skills` コマンドは Skill パネルを開き、そこで Skill をインタラクティブに閲覧、検索、切り替え、起動できます。

> **Note:** 以前 `/skills <skill-name>` で Skill を実行していた場合、その構文は現在 Skill パネルを開くだけで、末尾の引数は無視されます。Skill を直接実行するには `/<skill-name>` を使用してください。

### 利点

- ワークフローに合わせて Qwen Code を拡張
- git を通じてチーム間で専門知識を共有
- 繰り返しのプロンプト入力を削減
- 複雑なタスクのために複数の Skill を組み合わせ

## Skill の作成

Skill は、`SKILL.md` ファイルを含むディレクトリとして保存されます。

### `/learn` でプロジェクト Skill を生成する

`/learn` を使用して、既存の知識源を再利用可能なプロジェクト Skill に蒸留します。

```text
/learn https://docs.example.com/api
/learn ~/projects/acme-sdk
/learn Our deploy process: run migrate, deploy the service, then check health
```

このコマンドは通常のエージェントターンとして実行され、`.qwen/skills/learned-skill-<name>/SKILL.md` に結果を作成します。フロントマターには `source: learned` が含まれます。生成された指示を使用または共有する前にレビューしてください。

`/learn` はローカルまたは直接リンクの `.mp4`、`.webm`、`.mov`、`.m4v` ビデオも受け付けます。パスや URL の後にテキストを追加して、生成される Skill をチュートリアルの特定の部分にフォーカスできます。

```text
/learn ./tutorial.mp4 focus on the deployment workflow
```

ビデオ学習には、OpenAI 互換プロバイダー上のビデオ対応モデルが必要です。YouTube ページ URL は直接ビデオ入力ではありません。ビデオをワークスペースにダウンロードし、そのローカルパスを渡してください。

### パーソナル Skill

パーソナル Skill はすべてのプロジェクトで利用可能です。`~/.qwen/skills/` に保存します。

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

パーソナル Skill の用途:

- 個人のワークフローと設定
- 開発中の Skill
- 個人の生産性向上ツール

### プロジェクト Skill

プロジェクト Skill はチームと共有されます。プロジェクト内の `.qwen/skills/` に保存します。

```bash
mkdir -p .qwen/skills/my-skill-name
```

プロジェクト Skill の用途:

- チームのワークフローと規約
- プロジェクト固有の専門知識
- 共有ユーティリティとスクリプト

プロジェクト Skill は git にチェックインでき、チームメンバーが自動的に利用できるようになります。

### 自動生成されたプロジェクト Skill のメンテナンス

Qwen Code は、新しい Auto Skill 生成が無効になっている間も、生成されたプロジェクト Skill の正常な使用をローカルで追跡します。これにより、メンテナンスを再度有効にしたときに、最近使用された Skill を非アクティブなものと誤認することはありません。**Auto Skill** が有効な場合、非アクティブな生成 Skill を定期的にアクティブライブラリから移動します。`SKILL.md` のフロントマターに `source: auto-skill` を含む `.qwen/skills/auto-skill-*` という名前のディレクトリのみが管理対象です。パーソナル、拡張機能、バンドル、および手動で作成した Skill は選択されません。

- 正常な使用または `SKILL.md` の編集から 30 日経過すると、auto-skill は古いものとしてマークされます。
- 90 日経過すると、完全なディレクトリが `.qwen/archived-skills/` に移動されます。完全に削除されることはありません。
- 自動メンテナンスは、信頼されたワークスペースで最大 7 日に 1 回実行されます。新しく観測された auto-skill は、メンテナンスが開始される前に十分な猶予期間を受け取ります。
- ピン留めされた auto-skill は、ピン留めが解除されるまで、自動的な古いものとしてのマークおよびアーカイブ遷移から除外されます。
- アーカイブされたディレクトリ名は予約されたままです。既存のアーカイブ宛先は、その衝突のみをスキップし、他の Skill のメンテナンスを停止することはありません。

`/curator` を使用して、アクティブ、古い、アーカイブ済み、およびピン留めされた auto-skill を確認できます。`/curator run --dry-run` でメンテナンスパスをプレビューし、`/curator run` で即座に適用し、`/curator pin <directory>` または `/curator unpin <directory>` で Skill ごとのメンテナンスを制御し、`/curator restore <directory>` でアーカイブされた auto-skill をアクティブライブラリに戻します。

ステータスとドライランプレビューは、セーフモードおよび信頼されていないワークスペースで利用可能です。メンテナンスの適用、ピンの変更、およびアーカイブされた auto-skill の復元には、セーフモード外の信頼されたワークスペースが必要です。

## SKILL.md の作成

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

- `name` は `/^[\p{L}\p{N}_:.-]+$/u` に一致する空でない文字列です。Unicode の文字と数字（CJK / キリル文字 / アクセント付きラテン文字などすべて可）に加え、`_`、`:`、`.`、`-` が使用できます。空白、スラッシュ、括弧、その他の構造的に安全でない文字は解析時に拒否されます。
- `description` は空でない文字列です。
- `priority` は省略可能です。指定する場合、有限数である必要があります。高い値は `/skills` のリストでのみ先にソートされます。スラッシュコマンドの補完（`/` の入力）や `/help` のカスタムコマンドビューはアルファベット順のままなので、優先度の高い Skill が組み込みコマンドの順序を変更することはありません。省略された値や無効な値は未設定として扱われ、`0` と同じように動作します。

推奨される規約:

- 共有可能な名前には、ハイフン区切りの小文字 ASCII を推奨します（例: `tsx-helper`）。
- `description` は具体的に記述します。Skill が行うことと、いつ使用するか（ユーザーが自然に言及するキーワード）の両方を含めます。
- `/skills` でデフォルトのアルファベット順よりも前に確実に表示させたい Skill にのみ `priority` を使用します。負の優先度も許可されており、未設定の Skill より下にソートされます。

### オプション: ファイルパスによる Skill のゲート（`paths:`）

コードベースの特定の部分にのみ関連する Skill の場合は、glob パターンの `paths:` リストを追加します。この Skill は、ツール呼び出しが一致するファイルに触れるまで、モデルの利用可能な Skill リストに表示されません。

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

注意事項:

- glob は [picomatch](https://github.com/micromatch/picomatch) を使用してプロジェクトルートからの相対パスでマッチングされます。プロジェクトルート外のファイルはアクティベーションをトリガーしません。
- パスでゲートされた Skill は、一度一致するファイルに触れると、セッションの残りの間アクティブ化されたままになります。新しいセッション、または任意の Skill ファイルの編集によってトリガーされる `refreshCache` は、アクティベーションをリセットします。
- `paths:` はモデルの検出のみをゲートし、かつ SkillTool のリストレベルでのみ機能します。`user-invocable: false` が設定されていない限り、`/<skill-name>` または `/skills` ピッカーを通じてパスでゲートされた Skill を常に自分で呼び出すことができます。このユーザーパスは、アクティベーション状態に関係なく Skill の本体を実行します。しかし、モデル側は一致するファイルに触れるまでゲートされたままです。スラッシュでの呼び出しはモデル側のアクティベーションのロックを解除しないため、モデルにあなたの呼び出しからチェーンさせたい場合（モデル自身に `Skill { skill: ... }` を呼び出させたい場合）は、まずその Skill の `paths:` に一致するファイルにアクセスしてください。
- `paths:` と `disable-model-invocation: true` を組み合わせることは可能ですが、ゲートは効果がありません。Skill はとにかくモデルから隠されているため、パスのアクティベーションがそれを通知することはないからです。

### オプション: ユーザーとモデルの呼び出しを制御する

Skill はデフォルトでユーザーが呼び出し可能です。直接のスラッシュコマンドでの使用から Skill を隠しつつ、モデルからの呼び出しを可能にしておくには、`user-invocable: false` を設定します。

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

これにより、`/<skill-name>` での呼び出しと `/skills` ピッカーの結果から Skill が削除されます。モデルから Skill が隠されるわけではありません。

直接のユーザー呼び出しを可能にしたまま、モデルからの呼び出しから Skill を隠すには、`disable-model-invocation: true` を設定します。

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

両方のフィールドを組み合わせることもできますが、その場合 Skill は通常のユーザーまたはモデルの呼び出しパスからは到達できません。

## サポートファイルの追加

`SKILL.md` と同じディレクトリに追加のファイルを作成します。

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

## 利用可能な Skill の表示

Qwen Code は以下の場所から Skill を検出します。

- パーソナル Skill: `~/.qwen/skills/`
- プロジェクト Skill: `.qwen/skills/`
- 拡張機能 Skill: インストールされた拡張機能によって提供される Skill
- バンドル Skill: Qwen Code に同梱される Skill

### 拡張機能 Skill

拡張機能は、拡張機能が有効になったときに利用可能になるカスタム Skill を提供できます。これらの Skill は拡張機能の `skills/` ディレクトリに保存され、パーソナル Skill やプロジェクト Skill と同じ形式に従います。

拡張機能 Skill は、拡張機能がインストールされ有効化されると自動的に検出およびロードされます。

どの拡張機能が Skill を提供しているかを確認するには、拡張機能の `qwen-extension.json` ファイル内の `skills` フィールドを確認します。

利用可能な Skill を表示するには、Qwen Code に直接問いかけます。

```text
What Skills are available?
```

> **Heads up — モデルとユーザーのビュー。** モデルに問いかけても、モデルが現在見ることができる Skill しか表示されません。Skill が `paths:` を使用している場合（上記の「オプション: ファイルパスによる Skill のゲート」を参照）、一致するファイルに触れるまでそのリストに表示されません。`/skills` スラッシュコマンドは、直接呼び出せる Skill を表示します。`user-invocable: false` を持つ Skill はディスク上に可視なままであり、モデルからも引き続き可視である可能性があります。

または、スラッシュコマンドでユーザーが呼び出し可能なリストを閲覧します（まだアクティブ化されていないパスでゲートされた Skill を含みます）。

```text
/skills
```

または、ファイルシステムを調査します。

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Skill のテスト

Skill を作成したら、説明に一致する質問をしてテストします。

例: 説明に「PDF ファイル」と記載されている場合:

```text
Can you help me extract text from this PDF?
```

モデルは、リクエストに一致する場合に自律的にあなたの Skill を使用することを決定します。明示的に呼び出す必要はありません。

## Skill のデバッグ

Qwen Code があなたの Skill を使用しない場合は、以下の一般的な問題を確認してください。

### 説明を具体的にする

曖昧すぎる例:

```yaml
description: Helps with documents
```

具体的な例:

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### ファイルパスの確認

- パーソナル Skill: `~/.qwen/skills/<skill-name>/SKILL.md`
- プロジェクト Skill: `.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### YAML 構文の確認

無効な YAML は、Skill のメタデータが正しくロードされるのを妨げます。

```bash
cat SKILL.md | head -n 15
```

以下を確認してください。

- 1行目に開始の `---` があること
- Markdown コンテンツの前に終了の `---` があること
- 有効な YAML 構文であること（タブなし、正しいインデント）

### エラーの確認

Skill のロードエラーを確認するには、デバッグモードで Qwen Code を実行します。

```bash
qwen --debug
```

## チームと Skill を共有する

プロジェクトリポジトリを通じて Skill を共有できます。

1. `.qwen/skills/` 配下に Skill を追加する
2. コミットしてプッシュする
3. チームメンバーが変更をプルする

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Skill の更新

`SKILL.md` を直接編集します。

```bash
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

通常のセッション中、Qwen Code はパーソナルおよびプロジェクトの Skill ディレクトリを監視しています。Skill の追加、編集、削除を行うと、短い遅延の後に Skill リストと呼出し状態が自動的に更新されます。ベアモードではこれらのウォッチャーが起動しないため、そのモードで Skill の変更をロードするには Qwen Code を再起動してください。

## Skill の削除

Skill のディレクトリを削除します。

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## ベストプラクティス

### Skill のスコープを絞る

1つの Skill は 1つの機能に対応すべきです。

- 適切なスコープ: 「PDF フォームへの入力」、「Excel 分析」、「Git コミットメッセージ」
- スコープが広すぎる: 「ドキュメント処理」（より小さな Skill に分割する）

### 明確な説明を記述する

特定のトリガーを含めることで、モデルが Skill をいつ使用すべきかを検出しやすくします。

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### チームとテストする

- Skill は期待通りにアクティブ化されるか？
- 指示は明確か？
- 欠落している例やエッジケースはないか？