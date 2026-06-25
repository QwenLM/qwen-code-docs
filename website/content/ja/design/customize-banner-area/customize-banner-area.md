# バナーエリアのカスタマイズ設計

> ユーザーが QWEN ASCII アートを差し替え、ブランドタイトルを変更し、
> バナーを完全に非表示にできるようにしながら、Qwen Code を
> デバッグしやすく信頼性の高い状態に保つ運用データ（バージョン、認証情報、モデル、作業ディレクトリ）の
> 非表示は許可しない。

## 概要

Qwen Code CLI は起動時に QWEN ASCII ロゴとボーダー付き情報パネルを含むバナーを表示します。いくつかの実用的なユースケースでは、この表示エリアの制御が求められます。

- **ホワイトラベル / サードパーティブランド統合**: 自社製品に Qwen Code を組み込む企業やチームは、デフォルトの「Qwen Code」ではなく自社のブランドアイデンティティを表示したい。
- **パーソナライズ**: 個人がターミナルのバナーをチームの標準や自分の好みに合わせたい。
- **マルチテナント / マルチインスタンスの識別**: 共有環境で、異なるチームがどのインスタンスにいるかを視覚的に素早く判断したい。

設計方針はシンプルです。**ブランドの装飾は差し替え可能、運用データは差し替え不可**。カスタマイズはユーザーが自社ブランドを前面に出せるようにするものであり、セッションをデバッグしやすくするための情報を隠せるものではありません。この方針が「何を変更可能にし、何をロックするか」という本ドキュメント全体の決定を導いています。

このトピックは [issue #3005](https://github.com/QwenLM/qwen-code/issues/3005) でトラッキングされています。

## バナー領域の分類

現在バナーは `Header`（`AppHeader` からマウント）によってレンダリングされ、以下の領域に分かれています。

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo Column ─────┐  gap=2  ┌──── Info Panel (bordered) ──────────┐  │
│   │                      │         │                                     │  │
│   │  ███ QWEN ASCII ███  │         │  ① Title:    >_ Qwen Code (vX.Y.Z)  │  │
│   │  ███   ART ART  ███  │         │  ② Subtitle: «blank, or override»   │  │
│   │  ███ QWEN ASCII ███  │         │  ③ Status:   Qwen OAuth | qwen-…    │  │
│   │                      │         │  ④ Path:     ~/projects/example     │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              region: AppHeader
                          │ Tips component renders below (governed by ui.hideTips) │
```

最上位の 2 つのボックスは以下のとおりです。

- **A. ロゴ列** — グラデーション付きの 1 つの ASCII アートブロック。現在は
  `packages/cli/src/ui/components/AsciiArt.ts` 内の `shortAsciiLogo` から取得。
- **B. 情報パネル** — ボーダー付きボックスで 4 行を含む。2 行目はデフォルトでは空白のビジュアルスペーサーで、呼び出し元が指定したサブタイトルに差し替え可能:
  - **B①** タイトル: `>_ Qwen Code (vX.Y.Z)` — ブランドテキスト + バージョンサフィックス。
  - **B②** サブタイトル / スペーサー: デフォルトは 1 文字分の空白行。`ui.customBannerSubtitle` が設定されている場合、その文字列がこの行に表示される（例: フォーク版では `Built-in DataWorks Official Skills` のように使用）。
  - **B③** ステータス: `<認証表示タイプ> | <モデル> ( /model to change)`。
  - **B④** パス: チルダ化・短縮された作業ディレクトリ。

全体は `<AppHeader>` でラップされており、既に `showBanner = !config.getScreenReader()`（スクリーンリーダーモードではプレーン出力にフォールバック）でバナー表示を制御しています。

## カスタマイズルール — 変更可能なものとロックされているもの

| 領域                                            | 現在のソース                           | カスタマイズカテゴリ                    | 理由                                                                                                                                                                                                           |
| ----------------------------------------------- | -------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. ロゴ列**                                   | `shortAsciiLogo`（`AsciiArt.ts`）      | **差し替え可能 + 自動非表示可能**       | 純粋なブランド表示。ホワイトラベルにはビジュアルの完全制御が必要。既存の「狭いターミナルでは自動非表示」フォールバックは維持される。                                                                           |
| **B①. タイトル — ブランドテキスト**（`>_ Qwen Code`）| `Header.tsx` にハードコード           | **差し替え可能**                        | ブランド表示。先頭の `>_` グリフは既存ブランドの一部。削除したい場合は `customBannerTitle` から省略するだけでよい。                                                                                             |
| **B①. タイトル — バージョンサフィックス**（`(vX.Y.Z)`）| `version` プロパティ                 | **ロック**                              | バグ報告に不可欠。非表示にすると「どのバージョンですか？」という質問に `--version` でしか答えられなくなり、サポートワークフローのコストが増大する。ホワイトラベルの柔軟性より、サポートの追跡可能性を優先する。 |
| **B②. サブタイトル / スペーサー行**            | デフォルトは空白                       | **差し替え可能**                        | 純粋なブランド / コンテキスト表示。ホワイトラベルフォークがビルドにラベルを付けるために使用（例: 「Built-in DataWorks Official Skills」）。タイトルと同様にサニタイズ。1 行のみ — レイアウトを崩す改行は不可。  |
| **B③. ステータスライン**（認証 + モデル）        | `formattedAuthType`、`model` プロパティ | **ロック**                              | 運用・セキュリティ上のシグナル。ユーザーは常にどの認証情報とどのモデルが使用されているかを確認できなければならない。ホワイトラベルシナリオでも非表示は危険。                                                    |
| **B④. パスライン**（作業ディレクトリ）          | `workingDirectory` プロパティ           | **ロック**                              | 運用上の情報。「どのディレクトリにいるか？」という質問はバナーが正式な回答場所。                                                                                                                               |
| **バナー全体**（A + B）                         | `AppHeader.tsx` での `<Header>` マウント | **非表示可能**                          | `ui.hideBanner: true` で両領域をスキップ — 既存のスクリーンリーダーゲートと同じ形。`<Tips>` は引き続き `ui.hideTips` で独立して制御される。                                                                    |

この表から 4 つの設定が導かれます（それ以上はありません）。

| 設定                        | デフォルト | 効果                                                                                                              | 対象領域        |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- | --------------- |
| `ui.hideBanner`             | `false`    | バナー全体（領域 A + B）を非表示にする。                                                                           | A + B           |
| `ui.customBannerTitle`      | 未設定     | B① のブランドテキストを置き換える。バージョンサフィックスは引き続き付加される。トリムされ、空文字列はデフォルトを使用。 | B① ブランドテキスト |
| `ui.customBannerSubtitle`   | 未設定     | B② の空白スペーサー行を 1 行のサブタイトルに置き換える。サニタイズされ、最大 160 文字。空文字列は空白スペーサーを維持。 | B② スペーサー   |
| `ui.customAsciiArt`         | 未設定     | 領域 A を置き換える。3 つの形式を受け付ける（後述）。エラー時はデフォルトにフォールバック。                          | A               |

設計上、**提供しない**もの:

- バージョンサフィックスのみを非表示にする設定はない。
- 認証 / モデル行のみを非表示にする設定はない。
- パス行のみを非表示にする設定はない。
- ロゴのグラデーションカラーを変更する設定はない（テーマが担当）。
- 情報パネルの順序や構造を変更する設定はない。

後から上記のいずれかを公開する必要が生じた場合は、上記 3 つのフィールドから派生させるのではなく、独自の根拠を持つ新しいフィールドとして追加すること。

## ユーザー設定ガイド — 変更方法

### 制限の早見表

バナーカスタマイズにはいくつかの上限があります。アートを手作りする前に確認しておくと、リゾルバーによる切り捨てや拒否を防げます。

| 項目                              | 制限                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **タイトルの文字数**              | **最大 80 文字**（サニタイズ後）。超過分は切り捨てられ、`[BANNER]` 警告がログに記録される。改行と制御文字はこの長さのカウント前に除去される。                                 |
| **サブタイトルの文字数**          | **最大 160 文字**（サニタイズ後）。タイトルと同じ処理パイプライン。切り捨て時は同様に `[BANNER]` 警告を記録。                                                                 |
| **ASCII アートのブロックサイズ**   | **1 ティアあたり最大 200 行 × 200 列**。超過分は切り捨てられ、`[BANNER]` 警告がログに記録される。                                                                             |
| **ASCII アートのファイルサイズ**   | **最大 64 KB**。上限まで読み込まれ、残りは無視される。                                                                                                                        |
| **レンダリングされる ASCII アート幅** | 起動時のターミナル列数によって決まり、**固定文字数ではない**。計算式と各ターミナルの目安については後述の「ロゴはどれくらいの幅にできるか？」を参照。                             |

ASCII アートには**文字数の固定制限はなく**、上記の列 / 行の上限と起動時の幅バジェットのみが制限です。あるフォントで快適にレンダリングされる 17 文字のブランド名でも、別のフォントではスタックやより詰まったフォントが必要な場合があります。制限要因は視覚的な幅であり、文字数ではありません。

### 設定の場所

4 つの設定はすべて `settings.json` の `ui` 以下にあります。ユーザーレベル（`~/.qwen/settings.json`）とワークスペースレベル（プロジェクトルートの `.qwen/settings.json`）の両方がサポートされており、標準のマージ優先順位（ワークスペースがユーザーを上書き、システムがワークスペースを上書き）が適用されます。

`customAsciiArt` は特別な扱いがあります。オブジェクト全体を高優先度スコープが置き換える 1 つの値として扱うのではなく、リゾルバーがスコープごとにティアを解決します。ユーザー設定に `{ small }` が、ワークスペース設定に `{ large }` が定義されている場合、両方が有効になります — ユーザーから `small`、ワークスペースから `large`。これにより次の 2 つが同時に機能します。

1. 各 `{ path }` エントリはそれを宣言したファイルに対して解決される（ワークスペースの `.qwen/` vs. ユーザーの `~/.qwen/`）。マージされたビューだけではそのスコープ情報が失われる。
2. ユーザーが個人設定にデフォルトの `large` ティアを定義しておき、ワークスペースごとに `small` のみを上書きでき、オブジェクト全体を再定義する必要がない。

同じティアが複数のスコープで定義されている場合は、通常の優先順位が適用される（system > workspace > user）。任意のスコープで `customAsciiArt` を裸の文字列または `{ path }` に設定すると、そのスコープの両ティアが埋まる。

### バナーを完全に非表示にする

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

起動時の出力でロゴ列と情報パネルの両方がスキップされます。`ui.hideTips` が `true` でない限り、ヒントは引き続き表示されます。

### ブランドタイトルを変更する

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

情報パネルに `Acme CLI (vX.Y.Z)` として表示されます。カスタムタイトルを設定すると `>_` グリフは削除されます。残したい場合は自分で含めてください: `"customBannerTitle": ">_ Acme CLI"`。

### ブランドサブタイトルを追加する

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

タイトルと認証 / モデル行の間に通常ある空白スペーサーの代わりに、セカンダリテキストカラーでサブタイトルが独立した行にレンダリングされます。

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① タイトル
│ Built-in DataWorks Official Skills                      │  ← B② サブタイトル
│ Qwen OAuth | qwen-coder ( /model to change)             │  ← B③ ステータス
│ ~/projects/example                                      │  ← B④ パス
└─────────────────────────────────────────────────────────┘
```

制約事項:

- 1 行のみ。改行やその他の制御バイトはスペースに変換されるため、貼り付けミスで情報パネルのレイアウトが崩れることはない。
- サニタイズ後、最大 160 文字（タグラインや「powered by」行は長くなりがちなため、タイトルより緩い上限）。
- 既存の空白スペーサー行を維持するには、フィールドを未設定のままにする（または空文字列 / 空白に設定する）— 後方互換性がデフォルト。
- サブタイトルはロックされている行に影響しない。認証、モデル、作業ディレクトリはサブタイトルの状態に関わらず常に表示される。

### ASCII アートを差し替える — インライン文字列

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

JSON 文字列内に改行を埋め込むには `\n` を使用します。アートはデフォルトロゴと同様に、アクティブなグラデーションテーマでレンダリングされます。

> **ASCII アートが手元にない場合** は外部ジェネレーターを使って貼り付けてください。最も簡単な方法は `figlet` を使うことです:
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` で生成し、
> `customAsciiArt: { "path": "./brand.txt" }` で指定します。CLI は実行時にテキストからアートを生成しません — 理由については「スコープ外」セクションを参照してください。

### ASCII アートを差し替える — 外部ファイル

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

複数行の文字列を JSON エスケープする必要がなくなります。パス解決のルール:

- **ワークスペース設定**: 相対パスはワークスペースの `.qwen/` ディレクトリを基準に解決される。
- **ユーザー設定**: 相対パスは `~/.qwen/` を基準に解決される。
- 絶対パスはそのまま使用される。
- ファイルは**起動時に 1 回だけ**読み込まれ、サニタイズされてキャッシュされる。セッション中にファイルを編集してもバナーは再レンダリングされない — CLI を再起動すること。

### ASCII アートを差し替える — 幅対応

```jsonc
{
  "ui": {
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

ターミナルが十分な幅の場合は `large` が優先され、そうでなければ `small` が使用され、それも表示できない場合はロゴ列が非表示になります（既存の 2 列フォールバック）。どちらのティアも文字列または `{ path }` を指定できます。どちらのティアも省略可能で、省略されたティアは次のステップにフォールスルーします。

### ロゴはどれくらいの幅にできるか？ — サイズバジェット

タイトルやアートに固定の文字数制限はありません。ターミナルの列数に基づく**幅バジェット**と、不正なファイルでレイアウトが凍結しないための絶対ハードキャップがあります。

| 項目                                               | 制限                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| 起動時のターミナル列数                             | ユーザーのターミナルが報告する値。                                       |
| コンテナの外側マージン                             | 4 列（左 2 + 右 2）。                                                    |
| ロゴと情報パネルのギャップ                         | 2 列。                                                                  |
| 情報パネルの最小幅                                 | 44 列（パス 40 + ボーダー + パディング）。                               |
| **使用可能なロゴ幅**（ティアごと、レンダリング時） | `terminalCols − 4 − 2 − 44 = terminalCols − 50`。                       |
| 各アートティアのハードキャップ（サニタイズ後）      | 200 列 × 200 行。超過分は切り捨てられ、`[BANNER]` 警告がログに記録される。 |
| `customBannerTitle` のハードキャップ（サニタイズ後）| 80 文字。超過分は切り捨てられ、`[BANNER]` 警告がログに記録される。       |

一般的なターミナル幅でのバジェット:

| ターミナル列数 | レンダリングされる最大ロゴ幅 | 実用的な意味                                                              |
| -------------- | ---------------------------- | ------------------------------------------------------------------------- |
| 80             | 30                           | figlet の「ANSI Shadow」フォントの多くは 1 文字あたり 7〜11 列 — 最大 3 文字。 |
| 100            | 50                           | ANSI Shadow の短い単語（約 6 文字）、または短い単語 2 つをスタック。       |
| 120            | 70                           | 複数行のワードアートが快適に収まる。                                       |
| 200            | 150                          | ANSI Shadow でフルプロダクト名のような長いインライン文字列が収まる。       |

アートを設計する際の 2 つの実用的な注意点:

1. **複数単語のブランドは、ほとんどのターミナルで 1 行の ANSI Shadow としてレンダリングできないことが多い。** ANSI Shadow の 1 文字が約 7〜9 列とすると、`Custom Agent` のような 12 文字のブランドでも 1 行で約 95 列になり、情報パネルと並べて 100 列のターミナルに収まらない。単語を複数行にスタックするか、より詰まった figlet フォントを選ぶか、`▶ Custom Agent ◀` のようなコンパクトな 1 行テキスト装飾を使うこと。
2. **幅対応の `{ small, large }` 形式を使う**と、「幅広では美しく見えるが狭いと崩れる」と「狭いと問題ないが幅広では余白を無駄にする」という二択を避けられる。以下の例では、`large` では 104 列以上のターミナル向けに単語をスタックし、`small` では 16 列の 1 行装飾にフォールスルーする。

```jsonc
{
  "ui": {
    "customBannerTitle": "Custom Agent",
    "customAsciiArt": {
      "small": "▶ Custom Agent ◀",
      "large": { "path": "./banner-large.txt" },
    },
  },
}
```

`banner-large.txt` にはスタックされた ANSI Shadow 出力（約 54 列 × 12 行）を含めます。例えば以下のコマンドで生成できます:

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### 3 つすべてを組み合わせる

```jsonc
{
  "ui": {
    "hideBanner": false,
    "customBannerTitle": "Acme CLI",
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

### 変更を確認する方法

1. `settings.json` を保存して新しい `qwen` セッションを開始する — バナーの解決は起動時に 1 回実行される。
2. ターミナルをリサイズして `small` / `large` ティアが期待通りに切り替わること、非常に狭い幅でロゴ列が消えることを確認する。
3. 期待通りに表示されない場合は、`~/.qwen/debug/<sessionId>.txt`（シンボリックリンク `latest.txt` が現在のセッションを指す）を確認し、`[BANNER]` を grep する — ソフト失敗のたびに原因を示す警告行がログに記録される。

## 解決パイプライン

```
   settings.json                              packages/cli/src/ui/components/
   ─────────────                              ──────────────────────────────
   {                                          AppHeader.tsx
     "ui": {                                    │
       "hideBanner": false,                     │  showBanner =
       "customBannerTitle": "Acme",             │      !screenReader
       "customBannerSubtitle": "Built-in …",    │   && !ui.hideBanner
       "customAsciiArt": …                      │
     }                                          │
   }                                            ▼
        │                              <Header
        ▼                                customAsciiArt={resolved.asciiArt}
   loadSettings()                        customBannerTitle={resolved.title}
   merge user / workspace                customBannerSubtitle={resolved.subtitle}
        │                                version=… model=… authType=…
        ▼                                workingDirectory=… />
   resolveCustomBanner(settings)                  │
   ┌─────────────────────────┐                    ▼
   │ 1. normalize to         │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. resolve each tier:   │           │
   │    string → as-is       │           │  pick tier by
   │    {path} → fs.read     │           │    availableTerminalWidth
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │         render Logo Column
   │ 3. sanitize art:        │         render Info Panel:
   │    stripControlSeqs     │           Title    = customBannerTitle
   │    ≤ 200 lines × 200    │                   ?? '>_ Qwen Code'
   │    cols                 │           Subtitle = customBannerSubtitle
   │ 4. sanitize title +     │                   ?? blank spacer row
   │    subtitle (single-    │           Status   = locked
   │    line, ≤ 80 / 160     │           Path     = locked
   │    chars)               │
   │ 5. memoize by source    │
   └─────────────────────────┘
```

5 ステップの解決アルゴリズムは設定が読み込まれる際に 1 回実行され、設定のリロードイベントが発生した場合にのみ再実行されます。

1. **正規化**。裸の `string` または `{ path }` は `{ small: x, large: x }` になる。`{ small, large }` オブジェクトはそのまま通過する。
2. **各ティアの解決**。各 `AsciiArtSource` について:
   - 文字列の場合はそのまま使用する。
   - `{ path }` の場合は `O_NOFOLLOW` 防御（Windows: プレーン読み取り専用 — 定数は公開されていない）で最大 64 KB までファイルを同期的に読み込む。相対パスは_そのティアを宣言した設定ファイルのディレクトリ_を基準に解決される — ワークスペース設定はワークスペースの `.qwen/`、ユーザー設定は `~/.qwen/`。読み取り失敗時は `[BANNER]` 警告をログに記録し、そのティアのデフォルトにフォールバックする。
3. **サニタイズ**。バナー専用のストリッパーが OSC / CSI / SS2 / SS3 リーダーを削除し、その他すべての C0 / C1 制御バイト（および DEL）をスペースに置き換える。ただし複数行のアートが維持されるよう `\n` は保持される。行末の空白をトリムした後、200 行 × 200 列で切り捨てる。上限を超えた分は切り捨てられ、`[BANNER]` 警告がログに記録される。
4. **レンダリング時のティア選択**。`Header.tsx` で、解決された `small` と `large` を使い、既存の幅バジェット（`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`）を評価する:
   - `large` が収まる場合は `large` を優先する。
   - 収まらない場合、`small` が収まれば `small` にフォールバックする。
   - それも収まらない場合、**ユーザーがカスタムアートを指定していれば**ロゴ列を完全に非表示にする（既存の `showLogo = false` ブランチ）— 狭いターミナルでバンドルされた QWEN ロゴにフォールバックするとホワイトラベルデプロイメントが静かに元に戻ってしまうため。情報パネルは引き続きレンダリングされる。
   - それ以外（カスタムアートが指定されていない場合）は `shortAsciiLogo` にフォールスルーし、既存の幅ゲートでデフォルトロゴを表示するか非表示にするかを決定する。
5. **フォールバック**。ソフト失敗（ファイルが見つからない、サニタイズで全て拒否された、設定が不正）により両ティアが空または無効になった場合は、カスタマイズが設定されていないものとして動作する: `shortAsciiLogo` をレンダリングし、デフォルトロゴの幅ゲートに従う。CLI はバナー設定エラーでクラッシュしてはならない。

ティア選択の疑似コード:

```ts
function pickTier(
  small: string | undefined,
  large: string | undefined,
  availableWidth: number,
  logoGap: number,
  minInfoPanelWidth: number,
): string | undefined {
  for (const candidate of [large, small]) {
    if (!candidate) continue;
    const w = getAsciiArtWidth(candidate);
    if (availableWidth >= w + logoGap + minInfoPanelWidth) {
      return candidate;
    }
  }
  return undefined; // ロゴ列を非表示
}
```

## 設定スキーマの追加

`packages/cli/src/config/settingsSchema.ts` の `ui` オブジェクトに、`shellOutputMaxLines` の直後に 4 つの新しいプロパティが追加されます。

```ts
hideBanner: {
  type: 'boolean',
  label: 'Hide Banner',
  category: 'UI',
  requiresRestart: false,
  default: false,
  description: 'Hide the startup ASCII banner and info panel.',
  showInDialog: true,
},
customBannerTitle: {
  type: 'string',
  label: 'Custom Banner Title',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Replace the default ">_ Qwen Code" title shown in the banner info panel. The version suffix is always appended.',
  showInDialog: false,
},
customBannerSubtitle: {
  type: 'string',
  label: 'Custom Banner Subtitle',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Optional subtitle line rendered between the banner title and the auth/model line. When unset, the info panel keeps its blank spacer row.',
  showInDialog: false,
},
customAsciiArt: {
  type: 'object',
  label: 'Custom ASCII Art',
  category: 'UI',
  requiresRestart: false,
  default: undefined,
  description:
    'Replace the default QWEN ASCII art. Accepts an inline string, {"path": "..."}, or {"small": ..., "large": ...} for width-aware selection.',
  showInDialog: false,
  // The runtime accepts a union the SettingDefinition `type` field can't
  // express. The override is emitted verbatim by the JSON-schema generator
  // so VS Code accepts every documented shape (string, {path}, or
  // {small,large}) without flagging the bare-string form.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` は既存の `hideTips` パターン（`showInDialog: true`）を踏襲します。自由記述の 3 つのフィールド（タイトル、サブタイトル、アート）は、TUI ダイアログ内で複数行の ASCII エディタを実装すること自体が別プロジェクト規模の作業になるため、アプリ内設定ダイアログには表示しません。パワーユーザーは `settings.json` を直接編集します。

## 配線の変更

実装の変更箇所は小さいです。以下に現在の `main` のファイルと行の範囲を示します。

`packages/cli/src/ui/components/AppHeader.tsx:53` — `showBanner` を拡張:

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — 解決済みバナーを `<Header>` に渡す:

```tsx
<Header
  version={version}
  authDisplayType={authDisplayType}
  model={model}
  workingDirectory={targetDir}
  customAsciiArt={resolvedBanner?.asciiArt /* { small?, large? } */}
  customBannerTitle={resolvedBanner?.title /* string | undefined */}
  customBannerSubtitle={resolvedBanner?.subtitle /* string | undefined */}
/>
```

`packages/cli/src/ui/components/Header.tsx` — `HeaderProps` を拡張:

```ts
interface HeaderProps {
  customAsciiArt?: { small?: string; large?: string };
  customBannerTitle?: string;
  customBannerSubtitle?: string;
  version: string;
  authDisplayType?: AuthDisplayType;
  model: string;
  workingDirectory: string;
}
```

`packages/cli/src/ui/components/Header.tsx:45-46` — 既存のデフォルトをフロアとして、`logoWidth` 計算前にティアを選択:

```ts
const tier = pickTier(
  customAsciiArt?.small,
  customAsciiArt?.large,
  availableTerminalWidth,
  logoGap,
  minInfoPanelWidth,
);
const displayLogo = tier ?? shortAsciiLogo;
```

`packages/cli/src/ui/components/Header.tsx` — プロパティからタイトルをレンダリングし、設定されている場合は空白スペーサー行の代わりにサブタイトルプロパティを使用:

```tsx
<Text bold color={theme.text.accent}>
  {customBannerTitle ? customBannerTitle : '>_ Qwen Code'}
</Text>
…
{customBannerSubtitle ? (
  <Text color={theme.text.secondary}>{customBannerSubtitle}</Text>
) : (
  <Text> </Text>
)}
```

**新規ファイル**: `packages/cli/src/ui/utils/customBanner.ts` — リゾルバー。
エクスポート:

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

リゾルバーは解決パイプラインに記述された正規化、ファイル読み込み、サニタイズ、キャッシュを行います。CLI 起動時に 1 回呼び出され、設定のホットリロードイベント時に再実行されます。スコープごとのファイルパスは `settings.system.path` / `settings.workspace.path` / `settings.user.path` から直接取得されるため、各 `{ path }` はそれを宣言したファイルを基準に解決されます。`settings.isTrusted` が false の場合、ワークスペース設定は完全にスキップされます。

## 検討した代替案

この機能について 5 つの形式が検討されました。制約が変化した場合に将来のコントリビューターが設計空間を理解し再検討できるよう、ここに記録します。

### オプション 1 — 3 つのフラット設定（推奨、issue の要求に合致）

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **効果**: ユーザー向けの表面を最小化。issue が求めるものそのもの。
- **長所**: 学習コストゼロ。ドキュメント化が容易。既存のフラットな `ui.*` プロパティ（`hideTips`、`customWittyPhrases` など）と一貫性がある。
- **短所**: 概念的に関連する 3 つのトップレベルキーがグループ化されない。将来のバナー専用の設定（グラデーション、サブタイトル）が `ui` のキーをさらに増やす形になり、ネストにならない。

### オプション 2 — ネストされた `ui.banner` 名前空間

```jsonc
{
  "ui": {
    "banner": {
      "hide": false,
      "title": "Acme CLI",
      "asciiArt": { "path": "./brand.txt" },
    },
  },
}
```

- **効果**: オプション 1 と同じ機能を機能ごとに整理。
- **長所**: 将来のバナー専用設定のための明確な名前空間。`/settings` での発見性向上。
- **短所**: issue の正確な記述から逸脱する。既存の UI 設定はほとんどフラット（`ui.accessibility` と `ui.statusLine` のみネスト）なため、一貫性は微妙。ユーザーが覚えるネストレベルが 1 つ増える。

### オプション 3 — バナープロファイルプリセット + スロット上書き

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* 'branded' のスロット上書き */ }
  }
}
```

- **効果**: 名前付きプリセットから選択し、上級ユーザーは選んだプロファイル内のスロットを上書きする。
- **長所**: 優れたオンボーディング UX。プリセットが CLI に同梱される。
- **短所**: 複雑さが大きい。プリセットはメンテナンスのコミットメントを伴う。issue は管理されたものではなく生のカスタマイズを求めている。

### オプション 4 — バナー全体の上書き（単一文字列テンプレート）

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **効果**: ロックされた変数が埋め込まれた単一の自由形式テンプレート。
- **長所**: 非標準レイアウトへの最大限の柔軟性。
- **短所**: レイアウトをユーザー側で再実装することになる。ターミナル幅への Ink の 2 列適応機能が失われる。狭いターミナルで崩れるテンプレートを書くのが非常に簡単。小さな機能に対して影響範囲が大きすぎる。

### オプション 5 — プラグイン / フック API

エクステンションシステムを通じてバナーレンダラーフックを公開する。

- **効果**: コードレベルのカスタマイズ。エクステンションが任意のものをレンダリングできる。
- **長所**: 最大のパワー。企業がシールドされたブランディングプラグインを提供できる。
- **短所**: 大きな API 表面。任意のターミナルレンダリングのセキュリティレビューが必要。issue に対して大幅にスコープオーバー。

### 推奨

**オプション 1** を推奨します。issue の要求をそのまま満たし、既存の `ui.*` スタイルに収まり、他にどのようなバナー専用設定が実際に必要になるかが分かる前にネスト名前空間の決定を強いることを避けます。将来的に兄弟設定が増えてきた場合は、オプション 2 への移行は追加的な作業です — `ui.banner.title` と `ui.customBannerTitle` は非推奨期間中に共存できます。

## セキュリティと障害処理

カスタムバナーのコンテンツはターミナルにそのままレンダリングされ、パス形式の場合はディスクから読み込まれます。両方の表面は、悪意のある、または侵害された設定ファイルが読み込まれた場合に攻撃対象になり得ます。セッションタイトル機能を駆動するのと同じ脅威モデルがここにも適用されます。

| 懸念事項                                                    | 対策                                                                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| アート、タイトル、サブタイトルへの ANSI / OSC-8 / CSI インジェクション | バナー専用ストリッパー（`sanitizeArt` / `sanitizeSingleLine`）: OSC / CSI / SS2 / SS3 リーダーを削除し、その他すべての C0 / C1 制御バイト（および DEL）をスペースに置き換える。レンダリングとキャッシュ書き込みの前に適用。 |
| 大きすぎるファイルで起動が凍結する                           | ファイル読み込みに 64 KB のハードキャップ。                                                                                                                                                                        |
| 病的なアートでレイアウトが凍結する                           | 解決された各文字列に 200 行 × 200 列のキャップ。超過分は切り捨てられ、`[BANNER]` 警告がログに記録される。                                                                                                           |
| パス形式でのシンボリックリンクリダイレクト                   | ファイル読み込みに `O_NOFOLLOW`（Windows: プレーン読み取り専用。定数は公開されていない）。                                                                                                                           |
| ファイルが見つからないか読み取れない                         | キャッチし、`[BANNER]` 警告をログに記録し、デフォルトにフォールバック。UI にスローしない。                                                                                                                           |
| 改行または長すぎるタイトル / サブタイトル                    | 改行はスペースに変換。タイトルは最大 80 文字、サブタイトルは最大 160 文字で切り捨て。                                                                                                                               |
| 信頼されていないワークスペースがレンダリングやファイル読み込みに影響する | `settings.isTrusted` が false の場合、リゾルバーは `settings.workspace` を完全にスキップ（`settings.merged` が適用する信頼ゲートを踏襲）。                                                                         |
| 設定リロード時の競合                                         | 解決はソース（パスまたは文字列ハッシュ）ごとに呼び出し単位でメモ化される。リロード時はリゾルバーを再実行し、影響を受けるファイルを再読み込みする。                                                                   |

障害モードのまとめ: すべてのソフト失敗は `shortAsciiLogo`（またはロックされたデフォルトタイトル）とデバッグログの警告に終わる。リゾルバーのいかなるブランチでもハード失敗（スローされるエラー）は許可されない。

## スコープ外

これらは検討の上、意図的に後回しにされました。ユーザーの需要が顕在化した場合は、別の後続タスクとして対応できます。

| 項目                                                                | 採用しない理由                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| テキストから ASCII への変換（`{ text: "xxxCode" }` 形式）           | v1 では検討の上、却下した。これを追加するには `figlet` の実行時依存関係（使えるフォントセットを含むと約 2〜3 MB 展開後）か、ベンダー提供の単一フォントレンダラー（約 200 行 + 管理する `.flf` フォントファイル）が必要になる。どちらも継続的な作業が発生する: フォント選択、フォントライセンスの追跡、「ターミナル X でフォントが正しくレンダリングされない」問題、CJK / 全角文字の処理。この機能の主なユースケース（ホワイトラベル / マルチテナント）は、デザイナーが意図的な ASCII アートを作成する場合がほとんどで、デフォルトの figlet フォントに頼らない。1 行生成を望むユーザーは既に `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` で同じ結果を得られる — 追加の依存関係なし、Qwen Code 内のサポート負担なし。後から需要が出た場合は、既存の設定を壊さずに `AsciiArtSource` を `string \| {path} \| {text, font?}` に拡張するだけで純粋に追加的な変更になる。 |
| ライブ編集のための `/banner` スラッシュコマンド                      | 設定 UI が正式な編集インターフェース。複数行の ASCII アートのライブエディタはそれ自体が別プロジェクト。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| カスタムグラデーションカラー / 行ごとのカラー上書き                   | カラーはテーマが担当。別の提案でテーマコントラクトを拡張できる。バナーカスタマイズでその表面を重複させるべきではない。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| URL で読み込む ASCII アート                                          | 起動時のネットワーク取得は独自の問題がある — 失敗モード、キャッシュ、セキュリティレビュー。ファイルパス形式がより低リスクな同等手段。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| アニメーション（スピニングロゴ、マーキータイトル）                    | レンダリング負荷とアクセシビリティの懸念が増す。どのユースケースも必要としていない。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| VSCode / Web UI のバナーパリティ                                     | これらの表面は現在 Ink バナーをレンダリングしていない。バナーが追加される場合、この設計が参照となる。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ファイル変更時の動的リロード                                          | リゾルバーは起動時と設定リロード時にのみ実行される。セッション中のアート変更はまれで、「変更を反映させるには再起動」は許容できるトレードオフ。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ロックされた個別領域の非表示（バージョン、認証、モデル、パス）         | これらは運用上のシグナル。非表示にすることはホワイトラベルシナリオへのメリット以上に、サポートとセキュリティ体制を損なう。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## 検証計画

最終的な実装 PR では、以下のエンドツーエンドチェックがパスする必要があります。

1. `~/.qwen/settings.json` に `customBannerTitle: "Acme CLI"` とインラインの `customAsciiArt` 文字列を設定 → `qwen` が新しいタイトルとアートを表示し、バージョンサフィックスが引き続き存在する。
2. `customBannerSubtitle: "Built-in Acme Skills"` → サブタイトル行がタイトルと認証 / モデル行の間にセカンダリテキストカラーでレンダリングされる。認証、モデル、パスが引き続き表示される。未設定に戻すと空白スペーサー行が復元される（後方互換性）。
3. `hideBanner: true` → `qwen` がバナーなしで起動し、ヒントとチャットが正常にレンダリングされる。
4. ワークスペースの `settings.json` に `customAsciiArt: { "path": "./brand.txt" }` を設定し、`brand.txt` を `.qwen/` の隣に置く → ワークスペースを開いた時にディスクから読み込まれる。
5. `customAsciiArt: { "small": "...", "large": "..." }` → 広い / 中程度 / 狭い間でターミナルをリサイズする。広い幅では `large`、中程度では `small`、狭い幅ではロゴ列が非表示になり、情報パネルは常に表示される。
6. `\x1b[31mhostile` を `customBannerTitle` と `customBannerSubtitle` に注入 → 両方がリテラルテキストとしてレンダリングされ、赤色として解釈されない。
7. `path` に存在しないファイルを指定 → CLI が起動し、`[BANNER]` 警告が `~/.qwen/debug/<sessionId>.txt` に表示され、デフォルトアートがレンダリングされる。
8. ワークスペース信頼がオフの状態でワークツリーを開く → ワークスペースで定義された `customAsciiArt`（`{ path }` エントリを含む）が静かに無視され、ユーザースコープの設定は引き続き適用される。
9. CLI パッケージで `npm test` と `npm run typecheck` がパスし、`customBanner.test.ts` の単体テストが受け付けられる各形式と各失敗パス（ファイルが見つからない、ファイルが大きすぎる、ANSI インジェクション、不正なオブジェクト）をカバーする。
