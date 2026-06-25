# Banner カスタマイズエリア設計方針

> ユーザーは QWEN ASCII ロゴの置き換え、ブランドタイトルの置き換え、Banner の非表示を行えます——
> ただし、トラブルシューティングと信頼性のためのランタイム情報（バージョン番号、認証方式、モデル、
> 作業ディレクトリ）は隠せません。

## 概要

Qwen Code CLI 起動時、ターミナル上部に Banner が表示されます。QWEN ASCII
ロゴと枠付き情報パネルで構成されています。この領域を制御したい実際のユースケースは複数あります：

- **ホワイトラベル / サードパーティブランド統合**：Qwen Code を企業やチーム独自のプロダクトに組み込む場合、
  デフォルトの "Qwen Code" ではなく自社ブランドを表示する必要があります。
- **パーソナライゼーション**：個人ユーザーがターミナルの Banner をチームのルールや好みに合わせたい場合。
- **マルチテナント / マルチインスタンスの識別**：共有環境で、チームごとに自分が使っているインスタンスを
  素早く識別したい場合。

設計方針はシンプルです：**ブランドの見た目は変更可能、ランタイム情報は変更不可**。
カスタマイズはユーザーが自分のブランドを重ねることのみを許可し、トラブルシューティングに必要な
重要情報の隠蔽は**許可しません**。本ドキュメントの「変更可 / 変更不可」の判断はすべてこの方針に基づきます。

対応 issue：[#3005](https://github.com/QwenLM/qwen-code/issues/3005)。

## Banner エリアの構成

現在の Banner は `Header`（`AppHeader` にマウント）でレンダリングされ、全体は以下のように分割されます：

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo 列 ─────────┐  gap=2  ┌──── 情報パネル (枠付き) ──────────────┐  │
│   │                      │         │                                     │  │
│   │  ███ QWEN ASCII ███  │         │  ① タイトル：  >_ Qwen Code (vX.Y.Z)  │  │
│   │  ███   ART ART  ███  │         │  ② サブタイトル：«空白行 / カスタム»  │  │
│   │  ███ QWEN ASCII ███  │         │  ③ ステータス：Qwen OAuth | qwen-…    │  │
│   │                      │         │  ④ パス：      ~/projects/example     │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              エリア帰属：AppHeader
                          │ Tips コンポーネントは下部に描画（ui.hideTips で制御） │
```

2 つのトップレベルブロック：

- **A. Logo 列** —— グラデーションカラー付きの ASCII art 単体。
  現在のソース：`packages/cli/src/ui/components/AsciiArt.ts` の
  `shortAsciiLogo`。
- **B. 情報パネル** —— 枠付きの情報ボックス、全 4 行。2 行目はデフォルトで空白のビジュアル
  spacer であり、呼び出し元が提供するサブタイトルに任意で切り替えられます：
  - **B①** タイトル：`>_ Qwen Code (vX.Y.Z)` —— ブランドテキスト + バージョンサフィックス。
  - **B②** サブタイトル / spacer：デフォルトは半角スペース行。`ui.customBannerSubtitle`
    を設定するとサニタイズ済みの単行サブタイトル文字列が表示されます（例：あるフォークが
    `Built-in DataWorks Official Skills` を使用）。
  - **B③** ステータス：`<認証表示タイプ> | <モデル> ( /model で切替)`。
  - **B④** パス：tildeify と省略処理後の作業ディレクトリ。

外側の `<AppHeader>` はすでに `showBanner = !config.getScreenReader()` によって
スクリーンリーダーモード時に Banner を全体非表示にしています（スクリーンリーダーモードではプレーンテキスト出力にフォールバック）。

## カスタマイズルール —— 変更可能なものと固定されているもの

| エリア                                   | 現在のソース                             | カスタマイズ種別              | ロック/開放の理由                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Logo 列**                           | `shortAsciiLogo` (`AsciiArt.ts`)         | **置き換え可 + 自動非表示可** | 純粋なブランドエリア。ホワイトラベルシナリオでは視覚を完全制御する必要があります。狭いターミナルで「Logo を自動非表示」する既存の動作は維持されます。      |
| **B①. タイトルテキスト**（`>_ Qwen Code`） | `Header.tsx` にハードコード              | **置き換え可**                | ブランドエリア。先頭の `>_` 文字は既存ブランドの一部です。不要な場合は `customBannerTitle` で省略できます。                                               |
| **B①. バージョンサフィックス**（`(vX.Y.Z)`） | `version` prop                        | **固定**                      | トラブルシューティングとサポートに必須。隠すと「どのバージョンを使っているか？」という質問に `--version` でしか答えられなくなり、サポートコストが増します。|
| **B②. サブタイトル / spacer 行**         | デフォルトは空白                         | **置き換え可**                | 純粋なブランド / コンテキストエリア。ホワイトラベルフォークでビルドバージョンにタグ付けするために使用します（例：`Built-in DataWorks Official Skills`）。 |
| **B③. ステータス行**（認証 + モデル）    | `formattedAuthType`、`model` prop        | **固定**                      | 運用とセキュリティのシグナル。現在使用中のクレデンシャルと実際にトークンを消費しているモデルをユーザーは確認できなければなりません。                       |
| **B④. パス行**（作業ディレクトリ）       | `workingDirectory` prop                  | **固定**                      | 運用情報。「今どのディレクトリにいるか？」は頻出の疑問で、Banner がその唯一の権威ある答えです。                                                            |
| **Banner 全体** (A + B)                  | `AppHeader.tsx` の `<Header>` マウント点  | **非表示可**                  | `ui.hideBanner: true` で A・B 両ブロックを同時にスキップ —— 既存のスクリーンリーダーモード切り替えと同じ形態。`<Tips>` は独立した `ui.hideTips` で制御。   |

上記のマトリクスは 4 つの設定項目に対応します：

| 設定                      | デフォルト値 | 効果                                                                                                    | 影響エリア      |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- | --------------- |
| `ui.hideBanner`           | `false`      | Banner 全体を非表示（エリア A + B）。                                                                   | A + B           |
| `ui.customBannerTitle`    | 未設定       | B① のブランドテキストを置き換え。バージョンサフィックスは常に追加。trim 処理あり。空文字列 = デフォルト使用。 | B① ブランドテキスト |
| `ui.customBannerSubtitle` | 未設定       | B② の空白 spacer を 1 行のサブタイトルで置き換え。サニタイズあり。最大 160 文字。空文字列 = 空白 spacer を維持（後方互換）。 | B② spacer 行    |
| `ui.customAsciiArt`       | 未設定       | エリア A を置き換え。3 種類のデータ形態をサポート（後述）。エラー時はデフォルトにフォールバック。        | A               |

**意図的に提供しない**機能：

- 「バージョンサフィックスのみ非表示」スイッチは提供しません。
- 「認証 / モデル行のみ非表示」スイッチは提供しません。
- 「パス行のみ非表示」スイッチは提供しません。
- Logo のグラデーションカラーを変更するエントリポイントは提供しません（カラーは theme が担当）。
- 情報パネルの順序や構造を調整する機能は提供しません。

将来的にニーズが生じた場合は、上記 3 フィールドから派生させるのではなく、新しいフィールドとして個別に方針評価を行ってください。

## ユーザー設定ガイド —— 変更方法

### 制限の概要

Banner のカスタマイズはいくつかの上限制約を受けます。手書きで art を作る前に確認して、
パーサーによるサイレントな切り捨てや拒否を避けてください。

| 項目                         | 上限                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **タイトル文字数**           | **最大 80 文字**（サニタイズ後にカウント）。超過時は切り捨てて `[BANNER]` warn を出力。改行や制御文字はカウント前に除去。 |
| **サブタイトル文字数**       | **最大 160 文字**（サニタイズ後にカウント）。サニタイズパイプラインはタイトルと同じ。超過時も `[BANNER]` warn を出力。 |
| **ASCII art ブロックサイズ** | **各段最大 200 行 × 200 列**。超過時は切り捨てて `[BANNER]` warn を出力。                                         |
| **ASCII art ファイルサイズ** | **最大 64 KB**。ファイルがこの上限を超える場合は上限以内のバイトのみ読み取り、残りは無視。                        |
| **ASCII art の実際のレンダリング幅** | 起動時のターミナル列数によって決まり、**固定文字数ではありません**。具体的な計算式と各種ターミナル幅での利用可能値は後述の「Logo はどれくらい大きくできるか？—— 幅の予算」を参照。 |

ASCII art には**固定の文字数上限はありません** —— 上記の列 / 行のハード上限と、起動時のターミナル列数による幅の予算のみです。同じ 17 文字のブランド名でも、フォントを変えると単行でレンダリングできるかどうかは、文字数ではなく視覚的な幅によって変わります。

### 設定の保存場所

4 つの設定はすべて `settings.json` の `ui` ノードに配置します。ユーザーレベル
（`~/.qwen/settings.json`）とワークスペースレベル（プロジェクトルートの
`.qwen/settings.json`）の両方をサポートし、標準のマージ優先順位（workspace が
user を上書き、system が workspace を上書き）で適用されます。

`customAsciiArt` は特例です：パーサーはオブジェクト全体を 1 つの値として上位スコープで置き換えるのではなく、tier ごとにすべてのスコープをトラバースします。user 設定に `{ small }` が定義され、workspace 設定に `{ large }` が定義されている場合、両方が有効になります ——
`small` は user から、`large` は workspace から取得されます。これにより 2 つの目的が同時に達成できます：

1. 各 `{ path }` 項目は、それを宣言したファイルのスコープ（workspace `.qwen/`
   または user `~/.qwen/`）を基準に解決されます。マージされたビューだけを見ると、スコープ情報が失われます。
2. ユーザーはデフォルトの `large` tier を個人設定に残し、ワークスペースごとに
   `small` だけを上書きできます。オブジェクト全体を毎回書き直す必要はありません。

同じ tier が複数のスコープで定義されている場合は、通常の優先順位（system >
workspace > user）が適用されます。任意のスコープで `customAsciiArt` を単一の文字列または
`{ path }` として設定した場合、そのスコープの両方の tier が埋められます。

### Banner を全体非表示にする

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

起動時の出力で Logo 列と情報パネルがスキップされます。`ui.hideTips` も設定しない限り、Tips は引き続き表示されます。

### ブランドタイトルを置き換える

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

情報パネルは `Acme CLI (vX.Y.Z)` としてレンダリングされます。カスタムタイトルを設定すると、デフォルトの `>_` 文字は表示されません。必要な場合は自分で含めてください：
`"customBannerTitle": ">_ Acme CLI"`。

### ブランドサブタイトルを追加する

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

サブタイトルはセカンダリテキストカラーで独立した行として表示され、デフォルトの空白 spacer 行（タイトルと認証 / モデル行の間の行）を**置き換えます**：

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① タイトル
│ Built-in DataWorks Official Skills                      │  ← B② サブタイトル
│ Qwen OAuth | qwen-coder ( /model 切替)                  │  ← B③ ステータス
│ ~/projects/example                                      │  ← B④ パス
└─────────────────────────────────────────────────────────┘
```

制約：

- 単行のみ許可。改行やその他の制御バイトは除去 / スペースに折りたたまれ、
  貼り付け事故で情報パネルのレイアウトが壊れるのを防ぎます。
- サニタイズ後の上限は 160 文字（タイトルより緩め —— キャッチコピーや「powered by」
  のような文言はブランド名より長くなることが多いため）。
- 空（または空文字列 / 全スペース）= デフォルトの空白 spacer 行を維持 ——
  後方互換がデフォルトの動作です。
- サブタイトルはロックされた行の動作を変更しません。認証、モデル、作業ディレクトリは
  サブタイトルの状態に関わらず常に表示されます。

### ASCII art を置き換える —— インライン文字列

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

JSON 文字列内では `\n` で改行を表します。この ASCII art にはデフォルト Logo と同様に
現在のテーマのグラデーションカラーが適用されます。

> **ASCII art が手元にない場合**：任意の外部ジェネレーターを使って生成した結果を貼り付ければ OK です。最も簡単な方法は `figlet` です：
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` を実行してから
> `customAsciiArt: { "path": "./brand.txt" }` でそのファイルを指定します。CLI は**実行時に**テキストを ASCII art に変換しません —— 理由は後述の「本設計の対象外」を参照。

### ASCII art を置き換える —— 外部ファイル

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

JSON 内で長い複数行文字列をエスケープするのを避けられます。パス解決のルール：

- **ワークスペースレベル設定**：相対パスは workspace の `.qwen/` ディレクトリを基準にします。
- **ユーザーレベル設定**：相対パスは `~/.qwen/` を基準にします。
- 絶対パスはそのまま使用されます。
- ファイルは**起動時に 1 回だけ読み取られ**、サニタイズ後にキャッシュされます。セッション中にファイルを変更しても再レンダリングされません —— CLI を再起動してください。

### ASCII art を置き換える —— 幅アダプティブ

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

ターミナルが十分広い場合は `large` を優先し、そうでなければ `small` を使用し、それも表示できなければ Logo 列を非表示にします（現在の 2 列フォールバック戦略を踏襲）。`small` と `large` はそれぞれ文字列または `{ path }` のどちらでも指定できます。どちらの段も省略可能で、欠落時は次の段にフォールバックします。

### Logo はどれくらい大きくできるか？—— 幅の予算

タイトルと art に「文字数のハード上限」はなく、ターミナル列数によって決まる**幅の予算**と、
不正な入力でレイアウトが固まるのを防ぐ絶対ハード上限のみがあります：

| 項目                                 | 上限                                              |
| ------------------------------------ | ------------------------------------------------- |
| 起動時のターミナル列数               | ユーザーのターミナルが報告する値がそのまま使われます。 |
| コンテナのマージン                   | 4 列（左 2 + 右 2）。                              |
| Logo 列と情報パネルの間のギャップ    | 2 列。                                            |
| 情報パネルの最小幅                   | 44 列（パス 40 + 枠 + パディング）。               |
| **各段の art のレンダリング可能幅**  | `ターミナル列数 − 4 − 2 − 44 = ターミナル列数 − 50`。 |
| 各段の art のサニタイズ後のハード上限 | 200 列 × 200 行。超過時は切り捨てて `[BANNER]` warn。 |
| `customBannerTitle` のサニタイズ後のハード上限 | 80 文字。超過時は切り捨てて `[BANNER]` warn。 |

一般的なターミナル幅での logo 上限：

| ターミナル列数 | レンダリング可能な最大 logo 幅 | 実際の意味                                                       |
| -------------- | ------------------------------ | ---------------------------------------------------------------- |
| 80             | 30                             | ほとんどの figlet "ANSI Shadow" 文字は 7〜11 列、最大 3 文字程度。 |
| 100            | 50                             | ANSI Shadow で短い単語（約 6 文字）1 つ、または 2 つの短い単語を重ねて表示。 |
| 120            | 70                             | 複数行で単語を重ねた art が十分収まります。                      |
| 200            | 150                            | 単行の長い文字列（製品名全体の ANSI Shadow など）も収まります。   |

art を設計する際の 2 つの経験則：

1. **複数単語のブランド名は、ほとんどのターミナルで ANSI Shadow の 1 行では表示しきれません。**
   ANSI Shadow は 1 文字あたり約 7〜9 列を占めます。`Custom Agent` のような 12 文字のブランド名でも、
   単行で約 95 列の art が必要です —— 100 列のターミナルでは情報パネルを収めると既に不足します。
   単語を改行して重ねるか、より幅の狭い figlet フォントに変えるか、
   `▶ Custom Agent ◀` のようなコンパクトな装飾を使ってください。
2. **「広い画面では見栄え良く、狭い画面でも崩れない」を 1 つの段で実現したい場合は、`{ small, large }` の幅アダプティブ形態を使ってください**。下の例では `large` は 104 列以上のターミナル用の複数行 art、`small` は 16 列の単行装飾で、どちらも収まらなければ logo 列を非表示にします。

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

`banner-large.txt` には重ねた ANSI Shadow の出力（約 54 列 × 12 行）を配置します。
以下のコマンドで生成できます：

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### 3 項目の組み合わせ

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

### 検証方法

1. `settings.json` を保存して `qwen` を再起動 —— Banner の解析は起動時に
   1 回だけ実行されます。
2. ターミナルの幅を調整して、`small` / `large` の切り替えが期待通りに動作し、
   極端に狭い幅で Logo 列が正しく非表示になることを確認します。
3. 結果が期待と一致しない場合は
   `~/.qwen/debug/<sessionId>.txt`（`latest.txt` シンボリックリンクが現在のセッションを指す）を確認し、
   `[BANNER]` で grep してください —— ソフトな失敗が発生するたびに理由を示す warn が 1 行出力されます。

## 解析パイプライン

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
   │ 1. 正規化：              │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. 各段の解析：          │           │
   │    string → そのまま使用 │           │  availableTerminalWidth に基づいて
   │    {path} → fs.read     │           │  段を選択
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │         Logo 列をレンダリング
   │ 3. art のサニタイズ：    │         情報パネルをレンダリング：
   │    stripControlSeqs     │           Title    = customBannerTitle
   │    ≤ 200 行 × 200 列    │                   ?? '>_ Qwen Code'
   │ 4. title と              │           Subtitle = customBannerSubtitle
   │    subtitle のサニタイズ │                   ?? 空白 spacer 行
   │    （単行、              │           Status   = ロック
   │    ≤ 80 / 160 文字）     │           Path     = ロック
   │ 5. ソース別に memoize    │
   └─────────────────────────┘
```

5 ステップの解析アルゴリズムは設定読み込み時に 1 回実行され、設定のホットリロードイベント時にのみ再実行されます：

1. **正規化**。裸の `string` または `{ path }` を
   `{ small: x, large: x }` に変換。`{ small, large }` オブジェクトはそのまま通過。
2. **段ごとの解析**。各 `AsciiArtSource` に対して：
   - 文字列：そのまま使用。
   - `{ path }`：同期読み取り。`O_NOFOLLOW` でシンボリックリンクのハイジャックを防御
     （Windows では通常の読み取り専用にデグレード —— この定数は公開されません）、
     上限 64 KB。相対パスは*そのパスを宣言した設定ファイルのディレクトリ*を基準に解決：
     workspace 設定なら workspace `.qwen/`、user 設定なら `~/.qwen/`。
     読み取り失敗 → `[BANNER]` warn、その段はデフォルトにフォールバック。
3. **サニタイズ**。Banner 専用のストリッパー：OSC / CSI / SS2 / SS3 リーダー文字を除去し、
   その他の C0 / C1 制御バイト（DEL を含む）をスペースに置換。ただし `\n` は保持して
   複数行の ASCII art を維持。各行の末尾スペースをトリム後、200 行 × 200 列に切り捨て、
   超過した部分は切り捨てて `[BANNER]` warn を出力。
4. **レンダリング時の段選択**。`Header.tsx` で、解析済みの `small` と `large` を与えられ、
   既存の幅予算（`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`）に基づいて：
   - `large` が収まる場合は `large` を優先。
   - そうでなければ `small` が収まる場合は `small` にフォールバック。
   - それも収まらず、**ユーザーがカスタム art を提供している場合**は Logo 列を非表示
     （`showLogo = false` ブランチを踏襲） —— このとき内蔵の QWEN logo にフォールバックすると
     狭いターミナルでホワイトラベルデプロイが静かに壊れます。情報パネルは引き続きレンダリング。
   - それ以外（ユーザーがカスタム art を全く提供していない）は `shortAsciiLogo` にフォールバックし、
     デフォルト logo の幅ゲートで表示 / 非表示を決定。
5. **最終フォールバック**。両段がソフトな失敗（ファイル欠落、サニタイズ後に全空、設定不正）で
   空または無効になった場合、カスタムなしとして `shortAsciiLogo` をレンダリングし、
   デフォルト logo の幅ゲートで処理。CLI は **Banner の設定エラーでクラッシュしてはなりません**。

段選択の疑似コード：

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
  return undefined; // Logo 列を非表示
}
```

## Settings スキーマへの追加

`packages/cli/src/config/settingsSchema.ts` の `ui` オブジェクト内で、
`shellOutputMaxLines` の直後に 4 つのプロパティを追加します：

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
  // 実行時には SettingDefinition の `type` では表現できないユニオン形態を受け付けます。
  // override は JSON-schema ジェネレーターにそのまま出力され、VS Code がすべての
  // ドキュメント化された形態（string、{path}、{small,large}）を受け入れ、
  // 裸の文字列でエラーが出なくなります。
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` は既存の `hideTips` のパターン（`showInDialog: true`）を踏襲します。
その他の 3 つの自由テキストフィールド（タイトル、サブタイトル、art）はアプリ内の設定ダイアログには表示されません ——
TUI ダイアログ内で複数行の ASCII エディターを作るのは別のプロジェクトです。上級ユーザーは直接
`settings.json` を編集してください。

## コード変更箇所

実装の変更は小規模です。各箇所のファイルと現在の `main` ブランチの行番号範囲を以下に示します。

`packages/cli/src/ui/components/AppHeader.tsx:53` —— `showBanner` の拡張：

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` —— 解析済みの Banner データを `<Header>` に渡す：

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

`packages/cli/src/ui/components/Header.tsx` —— `HeaderProps` の拡張：

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

`packages/cli/src/ui/components/Header.tsx:45-46` —— `logoWidth` を計算する前に段を選択し、
既存のデフォルトをフォールバックとして使用：

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

`packages/cli/src/ui/components/Header.tsx` —— タイトルを prop からレンダリングし、
prop が truthy な場合にサブタイトルが元の空白 spacer 行を置き換える：

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

**新規追加ファイル**：`packages/cli/src/ui/utils/customBanner.ts` —— パーサー。
外部インターフェース：

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

パーサーは上述の「解析パイプライン」で説明した正規化、ファイル読み取り、サニタイズ、キャッシュを担当します。
CLI 起動時に 1 回呼び出され、設定のホットリロードイベント時に再度呼び出されます。各スコープのファイルパスは
`settings.system.path` / `settings.workspace.path` / `settings.user.path` から直接取得するため、
各 `{ path }` はそれを宣言したファイルを基準に解決されます。`settings.isTrusted` が false の場合、
パーサーは workspace スコープ全体をスキップします。

## 代替案の比較

以下に評価した 5 つの形態を示します。後続のメンテナーが設計空間を理解し、必要に応じて再評価できるようにするためです。

### 案 1 —— フラットな 3 フィールド（推奨、issue と完全に一致）

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **効果**：ユーザー側の表面が最小で、issue の記述と 1 対 1 に対応。
- **長所**：学習コストがゼロ。ドキュメント化が非常に簡単。既存の `ui.*` フラットフィールド
  （`hideTips`、`customWittyPhrases` など）と一貫性がある。
- **短所**：意味的に関連する 3 つのキーが `ui` トップレベルに散在する。将来 banner 専用の
  スイッチ（グラデーション、サブタイトルなど）を追加する場合、`ui` に兄弟フィールドを追加し続けるしかなく、自然なグループ化ができない。

### 案 2 —— `ui.banner` のネスト名前空間

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

- **効果**：案 1 と同等の機能を機能別にまとめて提供。
- **長所**：将来の banner 専用スイッチ用のクリーンな名前空間がある。`/settings` での発見性が向上。
- **短所**：issue の原文の書き方と完全には一致しない。既存の UI 設定はフラットが主流
  （`ui.accessibility` と `ui.statusLine` のみネスト）で一貫性が下がる。ユーザーが覚えるべき階層が 1 つ増える。

### 案 3 —— Banner プロファイルプリセット + スロットオーバーライド

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* 'branded' の場合のスロットオーバーライド */ }
  }
}
```

- **効果**：ユーザーが名前付きプリセットを選択し、上級ユーザーが選択したプリセット上で特定のスロットを上書き。
- **長所**：オンボーディング体験が向上。プリセットは CLI に同梱できる。
- **短所**：複雑さが大幅に増す。プリセットは長期的なメンテナンスの約束。issue が求めているのはコンテンツのキュレーションではなくオープンなカスタマイズ。

### 案 4 —— Banner 全体のテンプレート文字列

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **効果**：ロックされたフィールドを補間する単一の freeform テンプレート。
- **長所**：非標準のレイアウトに対する柔軟性が最も高い。
- **短所**：レイアウトの責任をユーザーに押し付ける。Ink の 2 列レイアウトのターミナル幅に対する堅牢性が失われる。狭いターミナルで崩れるテンプレートを書きやすい。この利点のために破壊面が大きすぎる。

### 案 5 —— プラグイン / フックAPI

拡張システムを通じて banner-renderer フックを公開。

- **効果**：コードレベルのカスタマイズ。拡張が任意のコンテンツをレンダリングできる。
- **長所**：能力の上限が最も高い。企業は完全にパッケージ化されたブランドプラグインを作れる。
- **短所**：API サーフェスが巨大。任意のターミナルレンダリングにはセキュリティレビューが必要。この issue に対して完全にオーバーエンジニアリング。

### 推奨結論

**案 1 を採用**。issue を直接満たし、既存の `ui.*` スタイルと一致し、
どの banner 専用スイッチが他にあるかが明確になる前に名前空間に縛られることもありません。
将来的に兄弟フィールドが増えてきた場合、案 2 への移行は追加的なものです ——
`ui.banner.title` と `ui.customBannerTitle` は廃止期間中に共存できます。

## セキュリティと失敗処理

カスタム Banner コンテンツは**そのままターミナルにレンダリングされ**、path 形態では
**ディスクから読み取られます**。どちらのパスも、悪意のある、または改ざんされた settings が
読み込まれた場合に到達可能です。セッションタイトル機能が対処しているのと同じ脅威モデルがここでも適用されます。

| 懸念点                                                           | 対策                                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASCII art / タイトル / サブタイトル内の ANSI / OSC-8 / CSI インジェクション | Banner 専用のストリッパー（`sanitizeArt` / `sanitizeSingleLine`）：OSC / CSI / SS2 / SS3 リーダー文字を除去し、その他の C0 / C1 制御バイト（DEL を含む）をスペースに置換。レンダリングとキャッシュ書き込みの前に処理。 |
| 巨大なファイルによる起動のフリーズ                               | ファイル読み取りのハード上限 64 KB。                                                                                                                                        |
| 病的な ASCII art によるレイアウトのフリーズ                      | 各解析結果の上限は 200 行 × 200 列。超過時は切り捨て + `[BANNER]` warn。                                                                                                    |
| シンボリックリンクハイジャックによる path 形態の悪用             | ファイル読み取りに `O_NOFOLLOW` を使用（Windows ではデグレード。定数は公開されない）。                                                                                       |
| ファイルが存在しないか読み取り不能                               | キャッチ → `[BANNER]` warn → デフォルトにフォールバック。UI には例外をスローしない。                                                                                         |
| タイトル / サブタイトルに改行または過大な文字が含まれる          | 改行はスペースに折りたたまれ、80 文字（タイトル） / 160 文字（サブタイトル）に切り捨て。                                                                                    |
| 信頼できない workspace がレンダリングまたはファイル読み取りに影響  | `settings.isTrusted` が false の場合、パーサーは `settings.workspace` 全体をスキップ（`settings.merged` ビューの信頼ゲートと一致）。                                         |
| 設定ホットリロードの競合状態                                     | 解析結果は各呼び出し内でソース（path または文字列）別に memoize され、reload 時はパーサーを再実行して影響を受けたファイルを再読み込み。                                        |

失敗モードのまとめ：すべてのソフトな失敗は最終的に `shortAsciiLogo`（またはロックされたデフォルトタイトル）+ デバッグログの warn 1 行に落ち着きます。いかなるブランチもハードな失敗（例外の上位への伝播）を引き起こしてはなりません。

## 本設計の対象外

以下の項目は意図的に除外しています。それぞれユーザーからのフィードバックに基づいて、後続の個別提案として検討できます。

| 項目                                                   | 対象外の理由                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| テキストから ASCII art への変換（`{ text: "xxxCode" }` 形態） | v1 評価後**却下**。`figlet` のランタイム依存（利用可能なフォント込みで約 2〜3 MB unpacked）を導入するか、単一フォントのレンダラーを自前で vendor（〜200 行のコード + 自分たちでメンテナンスする `.flf` フォント 1 本）するかのどちらかが必要。どちらも長期的なメンテナンスコストを伴います：フォントの選定、フォントのライセンス監査、「X ターミナルでフォントが正しくレンダリングされない」系 issue、CJK / 全角文字の処理。このフィーチャーの主要ユースケース（ホワイトラベル / マルチテナント）では、ほぼ確実にデザイナーが完成品の ASCII art を用意するので figlet のデフォルトフォントに依存しません。コマンド 1 本で生成したいユーザーは今日から `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` で同等の結果が得られます —— 新たな依存なし、Qwen Code 内部のサポート負担なし。将来的に需要が増えれば、`AsciiArtSource` を `string \| {path} \| {text, font?}` に拡張するだけで純粋な追加になり、既存の設定は壊れません。 |
| `/banner` スラッシュコマンドによるオンライン編集        | 設定 UI が規範的な編集エントリポイントです。複数行の ASCII art オンラインエディターは別のプロジェクトです。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| カスタムグラデーションカラー / 単色                    | カラーは theme が所有しています。拡張が必要な場合は別途提案してください。Banner カスタマイズはその領域を重複して作成しません。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| URL からの ASCII art 読み込み                          | 起動時のネットワークリクエストには失敗モード、キャッシュ、セキュリティレビューの問題が伴います。`{path}` によるファイル読み込みが低リスクな同等手段です。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| アニメーション（回転する Logo、スクロールタイトルなど） | レンダリング負荷とアクセシビリティの問題が増加します。このフィーチャーのユースケースには不要です。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| VSCode / Web UI の Banner との整合                     | この 2 つのクライアントは現在 Ink Banner をレンダリングしていません。将来導入される場合、本設計が参考になります。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ファイル変更の動的リロード                             | パーサーは起動時と設定 reload 時にのみ実行されます。セッション途中で art を変更するニーズは少なく、「再起動で反映」は許容できるトレードオフです。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ロックされたエリアの個別非表示（version / auth / model / path） | これらはランタイムシグナルです。隠すことによるサポートとセキュリティへの損害は、ホワイトラベルシナリオでの利益をはるかに上回ります。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 検証計画

後続の実装 PR は以下のエンドツーエンドチェックをパスすること：

1. `~/.qwen/settings.json` に `customBannerTitle: "Acme CLI"` とインライン `customAsciiArt` を設定
   → `qwen` 起動後に新しいタイトルと新しい ASCII art が表示され、バージョンサフィックスが残ること。
2. `customBannerSubtitle: "Built-in Acme Skills"` を設定 → サブタイトル行がセカンダリテキストカラーで
   タイトルと認証 / モデル行の間に表示され、認証、モデル、パスが引き続き表示されること。
   設定を解除すると空白 spacer 行に戻ること（後方互換）。
3. `hideBanner: true` を設定 → `qwen` 起動時に Banner が表示されず、Tips と本文が通常通りレンダリングされること。
4. workspace の `settings.json` に `customAsciiArt: { "path": "./brand.txt" }` を設定し、
   `brand.txt` を同じ `.qwen/` ディレクトリに配置 → ワークスペースを開いたときにディスクから読み込まれること。
5. `customAsciiArt: { "small": "...", "large": "..." }` を設定 →
   広 / 中 / 狭の 3 段階でターミナルサイズを調整し、広いときは large、中のときは small、
   狭いときは Logo 列が非表示になること。情報パネルは常に表示されること。
6. `customBannerTitle` と `customBannerSubtitle` の両方に `\x1b[31mhostile` を注入
   → 両箇所でリテラルテキストとしてレンダリングされ、赤色として解釈されないこと。
7. `path` が存在しないファイルを指す → CLI が正常に起動し、
   `~/.qwen/debug/<sessionId>.txt` に `[BANNER]` warn が現れ、デフォルト art がレンダリングされること。
8. ワークスペース信頼が無効の状態で worktree を開く → workspace が提供する `customAsciiArt`
   （`{ path }` 項を含む）が静かに無視され、user スコープの設定は引き続き有効であること。
