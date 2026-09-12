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

`<skill-name>` は常に Skill の登録名です。インストールされた拡張機能の Skill の場合、その名前はオーナーを含みます（`pdf` ではなく `rust:pdf`）ので、`/rust:pdf` と入力します。[拡張機能 Skill の命名方法](#how-extension-skills-are-named)を参照してください。

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

- `name` は `/^[\p{L}\p{N}_:.-]+$/u` に一致する空でない文字列です。Unicode の文字と数字（CJK / キリル文字 / アクセント付きラテン文字などすべて可）に加え、`_`、`:`、`.`、`-` が使用できます。空白、スラッシュ、括弧、その他の構造的に安全でない文字は解析時に拒否されます。許可された `:` により、拡張機能によって登録された Skill（`rust:pdf`）と作者自身がコロンを選択した場合（`rust` 拡張機能内に記述された `rust:chat`）が 1つのパターンを共有できます。つまり、登録名のコロンがオーナーの証明ではないということです。[拡張機能 Skill の命名方法](#how-extension-skills-are-named)を参照してください。
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

### オプション: ルールを決定論的に適用する（`hooks:`）

`SKILL.md` の本文にあるすべてはモデルへの指示です。これはプロンプトテキストであり、それに従うかどうかはモデルに依存します。モデルが何を決定してもルールを維持する必要がある場合（必要な値が注入されていなければ実行を拒否する、保護されたパスには絶対に触れないなど）、フロントマターで [hook](./hooks.md) を宣言してください。フックはコードとして実行されるため、モデルの協調に依存しません。

```yaml
---
name: gated-skill
description: Calls the downstream CLI using a runtime-injected session ID
hooks:
  PreToolUse:
    - matcher: run_shell_command
      hooks:
        - type: command
          command: '"$QWEN_SKILL_ROOT/scripts/gate-session-id.sh"'
---
```

`$QWEN_SKILL_ROOT` は Skill 自身のディレクトリに設定されるため、フックコマンドは `SKILL.md` と一緒に提供されるファイルを参照できます。コマンド文字列はシェルに渡されるため、**内側の引用符を保持してください**。引用符がない場合、スペースを含むプロジェクトパスは 2 つの単語に分割され、ゲートは決して実行されません。**スクリプトを実行可能にする**（`chmod +x`）ことも必要です。どちらのミスも同じ方法で fail open します。つまり、ツール呼び出しは続行され、ゲートが実行されなかったことを示すものはトランスクリプトにもログにも表示されません。`PreToolUse` フックは、コード `2` で終了するか（stderr は理由としてモデルにフィードバックされます）、`hookSpecificOutput.permissionDecision: "deny"` を出力するとツール呼び出しをブロックします。

```bash
#!/usr/bin/env bash
if [ -z "${DOWNSTREAM_SESSION_ID:-}" ]; then
  echo "Required input DOWNSTREAM_SESSION_ID is not available. Cannot proceed." >&2
  exit 2
fi
exit 0
```

注意事項:

- フックは Skill が呼び出されたときに登録され、セッションの残りの間持続します。これは両方の呼び出しパスで真です。モデルが Skill を呼び出す場合でも、`/<skill-name>` と入力する場合でも同様です。
- セッションフックはメモリ内にのみ存在するため、`--continue` / `--resume` でセッションを再開しても、どちらの呼び出しパスでもフックは復元**されません**。Skill の指示はリプレイされた会話と一緒に戻ってきますが、それを適用するためのフックは消えています。再開後に Skill を再実行してゲートを再設定してください。
- 登録は冪等です。Skill を再呼び出ししても、重複するフックがスタックされることはありません。
- ツールイベントには常に明示的な `matcher:` を指定してください。省略されたものは空のパターンとして保存され、`^$` にコンパイルされてどのツール名にもマッチしません。フックは登録されますが、決して発火せず、何も報告しません。すべてのツールを意味する場合は `*` を使用してください。
- `command:` はプラットフォームのシェルを通じて実行されます。macOS と Linux では `bash`、Windows では Git Bash が検出された場合（`MSYSTEM`/`TERM`）はそれを使用し、それ以外の場合は `cmd.exe` または PowerShell を使用します。上記の例は POSIX シェルです。`cmd.exe` では `$QWEN_SKILL_ROOT` は展開されず、`.sh` スクリプトは実行可能ではないため、ゲートは fail open します。フックは `shell: bash` を設定して bash を強制できますが、それは `PATH` 上にある `bash` に解決されるため、Git Bash 以外の Windows では、実際に使用しているシェル用にゲートを記述してください。
- フックを無効にするセッションでは、フックはまったく登録されません。`disableAllHooks`、セーフモード、および ACP クライアントの `skipHooks` です。これらのセッションでも Skill の本体とその `allowedTools` は引き続き適用されますが、ゲートは適用されないため、フックに適用を依存しているルールはそこで適用されません。ベアモードはさらに進みます。Skill はまったく検出されないため、本体も `allowedTools` もありません。
- **プロジェクト** Skill のフックはリポジトリが提供するコマンドを実行するため、信頼されたフォルダでのみ登録され、信頼はフックが発火するたび、および権限が決定されるたびに再読み込みされます。IDE コンパニオンが接続されている場合、その値はライブです。信頼を取り消すと、次にツール呼び出しがあったときに、すでに登録されたゲートがサイレントになり、Skill の `allowedTools` も一時停止されます。再起動は不要です。IDE 接続がない場合、値は CLI が開始されたときに固定されるため、CLI 自身の信頼ダイアログを通じて行われた変更は再起動時に有効になります。信頼を付与しても遡及登録は行われません。Skill を再呼び出ししてください。
- `hooks:` はプロジェクト、ユーザー、およびバンドル Skill で読み取られます。拡張機能提供の Skill はサポートしていません。代わりに拡張機能独自のマニフェストレベルのフックを使用してください。
- 完全なイベントリスト、マッチャー構文、および出力形式については [Hooks](./hooks.md) を参照してください。

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

#### 拡張機能 Skill の命名方法

Qwen Code は、インストールされた拡張機能の Skill を `<extensionName>:<name>` として登録します。`<extensionName>` はその拡張機能の `qwen-extension.json` の `name` フィールド、`<name>` は Skill 自身のフロントマターの `name` です。`rust` 拡張機能内の `pdf` という名前の Skill は `rust:pdf` として登録されます。

プレフィックスは Skill のロード時に追加されるもので、ファイルに書き込まれるものではありません。`SKILL.md` はあなたが記述した名前のまま保持され、Qwen Code は登録名を分割して記述名を復元することはありません（作者が `rust` 拡張機能内で `rust:chat` と記述することも正当に可能です）。プレフィックスが追加されるのは拡張機能 Skill のみです。パーソナル、プロジェクト、およびバンドル Skill はあなたが記述した単一の綴りのままです。

Skill を参照する場所ではすべて登録名を使用してください。

- `/rust:pdf` として呼び出します。単なる `/pdf` はエイリアスではありません。拡張機能の Skill は登録名でのみ到達可能です。
- モデルは `Skill { skill: "rust:pdf" }` として呼び出します。これは `<available_skills>` で読むのと同じ名前です。
- 両方の拡張機能が `pdf` という名前の Skill を提供する場合、1つが勝ってもう1つが消えるのではなく、2つの Skill（`rust:pdf` と `docs-suite:pdf`）が得られます。

Skill を読み取り選択する画面でもオーナーが命名されます。Skill パネル（設定によってロックされた行を含む）、インタラクティブ UI 外で単なる `/skills` が出力する読み取り専用のリスト（ACP およびその他の非インタラクティブモード — インタラクティブに実行するとコマンドはパネルを開きます）、および `/` コマンドパレットのバッジ（単なる `[Extension]` ではなく `[Extension: Rust]` と表示されます）です。これらのラベルは拡張機能の `displayName` を優先し、それが宣言されていない場合は `name` にフォールバックします。

#### 拡張機能 Skill と `skills.*` 設定

`skills.disabled`、`skills.defaultDisabled`、および `slashCommands.disabled` は拡張機能 Skill を**どちらの**綴りでもマッチさせます。そのため、プレフィックスが存在する前に記述した `skills.disabled: ["pdf"]` も `rust:pdf` を隠します。制限は機能を削除することしかできないため、Skill の名前変更で制限を解除することはできません。

`skills.enabled` は例外であり、既存の設定ファイルに対する唯一の目に見える変更です。これは機能を付与するため、登録名のみをマッチさせます。`skills.enabled: ["pdf"]` だけでは拡張機能の `pdf` を有効化できなくなりました。`skills.enabled: ["rust:pdf"]` と記述してください。引き続き機能する唯一の素のペアは、プレフィックス以前に `skills.defaultDisabled` に同じ綴りで書かれたオプトインです。キャンセルはエントリ自体を比較するため、`defaultDisabled: ["pdf"]` + `enabled: ["pdf"]` はエントリをキャンセルします。その後 Skill はこのワークスペースに保存された有効化状態に従って有効になります。それがなければ拡張機能独自のデフォルトになります。デフォルトでオフの Skill の場合は、`skills.enabled` に `rust:pdf` と記述してください。

Skill パネルで Skill を切り替えると登録名が書き込まれ、そのエントリのみが削除されます。そのため `rust:pdf` を有効にしても、レガシーな `disabled: ["pdf"]` はそのまま残ります。そのレガシーエントリがより高いスコープ（システムデフォルト、ユーザー、またはシステム設定）にある場合、パネルはそれを示し、行をロックして、切り替えオファーではなく編集すべきスコープを命名します。このワークスペース自身の設定内のレガシーエントリも同様に行をロックし、エントリとそのスコープ（`skills.disabled 'pdf' (Workspace)` または `skills.defaultDisabled 'pdf' (Workspace)`）を命名して、どのファイルのどのリストを編集すべきか分かるようにします。

知っておくべき 2 つの制限:

- クロスレベルの優先順位は変更されておらず、登録名を完全に比較します（`project` > `user` > `extension` > `bundled`）。そのため `rust:pdf` として記述したパーソナルまたはプロジェクト Skill は拡張機能の `pdf` より優先されます。パーソナルまたはプロジェクト Skill とバンドル Skill の間の素の名前の衝突も同様に、プレフィックスではなくその優先順位で解決されます。カスタムコマンドと衝突する Skill はそうではありません。スラッシュの表面では最後のローダーが勝ち、カスタムコマンドは Skill の後にロードされるため、`/pdf` はカスタムコマンドを実行し、Skill はモデルから引き続き利用可能です。
- Skill 名はファイル名としても使用されます。Skill が呼び出し引数を読み取るファイルは `[A-Za-z0-9._-]` 以外のすべての文字を `_` に置換します。そのため `rust:pdf` として登録された拡張機能 Skill と `rust_pdf` として記述されたパーソナルまたはプロジェクト Skill は両方とも `qwen-skill-args-rust_pdf.txt` に解決され、1つの引数ファイルを共有します。（プレフィックスが自身と衝突することは稀です。`rust:rust_pdf` は `rust_rust_pdf` になります。しかし拡張機能名には `_` が含まれる可能性があるため、`rust_pdf:x` と `rust:pdf_x` は同じファイル名に畳まれます。）非 ASCII 文字も同じ方法で畳まれるため、`café` と `caf_` はどちらも `caf_` になります。これはプレフィックス以前からの制限で、プレフィックスはそれを当てやすくするだけです。`:` を `_` に置き換えたものが別の名前になるような Skill 名は避けてください。

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