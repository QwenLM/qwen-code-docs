# Banner カスタム領域設計案

> ユーザーは QWEN ASCII Logo の置き換え、ブランドタイトルの差し替え、Banner 全体の非表示が可能ですが、
> トラブルシューティングと信頼性に必要なランタイム情報（バージョン番号、認証方式、モデル、作業ディレクトリ）を
> 削除することはできません。

## 概要

Qwen Code CLI は起動時に端末上部に Banner を表示します。これには QWEN ASCII Logo と枠線付き情報パネルが含まれます。実際のシナリオでは、この領域を制御する必要があります。

- **ホワイトラベル / サードパーティブランド統合**：Qwen Code を企業やチームの製品に組み込む場合、デフォルトの "Qwen Code" ではなく、自社ブランドを表示する必要があります。
- **個人設定**：個人ユーザーが端末 Banner をチームの規約や自身の好みに合わせたい場合。
- **マルチテナント / 複数インスタンスの区別**：共有環境で、異なるチームが使用中のインスタンスをすばやく識別できるようにする必要があります。

設計方針は非常にシンプルです。**ブランドの外観は置き換え可能。ランタイム情報は置き換え不可。**
カスタマイズではユーザーが自分のブランドを上から重ねることのみ許可し、トラブルシューティングに必要な情報を隠すことは**許可しません**。本ドキュメントの「変更可能/変更不可」の判断はすべてこの方針に基づきます。

対応 issue：[#3005](https://github.com/QwenLM/qwen-code/issues/3005)。

## Banner 領域の分割

現在の Banner は `Header`（`AppHeader` によってマウント）によってレンダリングされ、全体は次のように分割できます。

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo 列 ─────────┐  gap=2  ┌──── 情報パネル (枠線付き) ──────────┐  │
│   │                      │         │                                     │  │
│   │  ███ QWEN ASCII ███  │         │  ① タイトル：  >_ Qwen Code (vX.Y.Z)│  │
│   │  ███   ART ART  ███  │         │  ② サブタイトル：«空白行 / カスタム上書き»│  │
│   │  ███ QWEN ASCII ███  │         │  ③ ステータス：Qwen OAuth | qwen-…   │  │
│   │                      │         │  ④ パス：      ~/projects/example    │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              領域所有：AppHeader
                          │ Tips コンポーネントは下にレンダリング（ui.hideTips で制御） │
```

2 つのトップレベルブロック

- **A. Logo 列** — グラデーション付きの 1 つの ASCII アートブロック。
  現在のソース：`packages/cli/src/ui/components/AsciiArt.ts` の `shortAsciiLogo`。
- **B. 情報パネル** — 枠線付き情報ボックス、合計 4 行。2 行目はデフォルトで空の視覚的スペーサーで、オプションで呼び出し元が提供するサブタイトルに切り替え可能。
  - **B①** タイトル：`>_ Qwen Code (vX.Y.Z)` — ブランドテキスト + バージョン番号のサフィックス。
  - **B②** サブタイトル / スペーサー：デフォルトは空白 1 行。`ui.customBannerSubtitle` を設定すると、サニタイズされた 1 行のサブタイトル文字列がレンダリングされます（例：fork で `Built-in DataWorks Official Skills` を使用する場合）。
  - **B③** ステータス：`<認証表示タイプ> | <モデル> ( /model 切り替え)`。
  - **B④** パス：tildeify と短縮された作業ディレクトリ。

外側の `<AppHeader>` はすでに `showBanner = !config.getScreenReader()` に基づいて、スクリーンリーダーモードでの Banner 全体の非表示処理を行っています（スクリーンリーダーモードではプレーンテキスト出力にフォールバック）。

## カスタマイズルール — 変更可能なものとロックされるもの

| 領域                               | 現在のソース                           | カスタマイズカテゴリ              | ロック/開放の理由                                                                                                                                                  |
| ---------------------------------- | -------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Logo 列**                     | `shortAsciiLogo` (`AsciiArt.ts`)       | **置き換え可能 + 自動非表示可能**  | 純粋なブランド領域。ホワイトラベルシナリオでは完全に制御する必要があります。狭い端末で「自動的に Logo を非表示にする」既存の動作は維持されます。                      |
| **B①. タイトルテキスト**（`>_ Qwen Code`） | `Header.tsx` ハードコード             | **置き換え可能**                  | ブランド領域。先頭の `>_` 文字は既存のブランドの一部です。不要な場合、ユーザーは `customBannerTitle` で省略できます。                                                |
| **B①. バージョン番号サフィックス**（`(vX.Y.Z)`） | `version` prop                        | **ロック**                        | トラブルシューティングとサポートに必須。非表示にすると、`--version` でしか「どのバージョンを使っていますか？」に答えられず、サポートフローに実質的なコストが発生します。ホワイトラベルの体験をわずかに犠牲にして、サポートのアクセシビリティを確保します。 |
| **B②. サブタイトル / スペーサー行**       | デフォルト空白                         | **置き換え可能**                  | 純粋なブランド/コンテキスト領域。ホワイトラベル fork はビルドバージョンにタグを付けるために使用します（例： "Built-in DataWorks Official Skills"）。サニタイズルールはタイトルと同様。1 行のみ許可、改行はレイアウトを壊すため受け付けません。 |
| **B③. ステータス行**（認証 + モデル）    | `formattedAuthType`、`model` prop     | **ロック**                        | 運用とセキュリティのシグナル。ユーザーは現在使用している認証情報と実際にトークンを消費するモデルを確認する必要があります。非表示/置き換えは危険であり、ホワイトラベルシナリオでも許可すべきではありません。 |
| **B④. パス行**（作業ディレクトリ）      | `workingDirectory` prop               | **ロック**                        | 運用情報。「今どのディレクトリにいるか？」は頻出質問であり、Banner が唯一の信頼できる情報源です。                                                               |
| **Banner 全体** (A + B)           | `AppHeader.tsx` の `<Header>` マウントポイント | **非表示可能**                    | `ui.hideBanner: true` で A、B 両方のブロックをスキップ — 既存のスクリーンリーダーモードスイッチと同様の動作。`<Tips>` は独立した `ui.hideTips` で制御されます。    |

上記のマトリックスに対応する設定項目は 4 つだけです。

| 設定                      | デフォルト値 | 効果                                                                                                 | 影響領域     |
| ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- | ------------ |
| `ui.hideBanner`           | `false`      | Banner 全体を非表示（領域 A + B）。                                                                  | A + B        |
| `ui.customBannerTitle`    | 未設定       | B① のブランドテキストを置き換え。バージョン番号サフィックスは常に追加されます。トリムされます；空文字列 = デフォルトを使用。 | B① ブランドテキスト |
| `ui.customBannerSubtitle` | 未設定       | B② の空白スペーサーを 1 行のサブタイトルに置き換え。サニタイズされます；上限 160 文字；空文字列 = 空白スペーサーを維持（後方互換）。 | B② スペーサー行 |
| `ui.customAsciiArt`       | 未設定       | 領域 A を置き換え。3 つのデータ形式をサポート（後述）。エラーはすべてデフォルトにフォールバック。    | A            |

**意図的に提供しない**機能

- 「バージョン番号サフィックスのみを非表示」スイッチは提供しません。
- 「認証/モデル行のみを非表示」スイッチは提供しません。
- 「パス行のみを非表示」スイッチは提供しません。
- Logo のグラデーションカラーを変更するエントリは提供しません（色は theme が担当）。
- 情報パネルの順序や構造を調整する機能は提供しません。

将来、どうしても必要になった場合は、上記 3 つのフィールドから派生させるのではなく、新しいフィールドとして個別に評価を行ってください。

## ユーザー設定ガイド — 変更方法

### 制限概要

Banner のカスタマイズは、以下の上限の対象となります。アートを手書きする前に確認し、パーサーによって静かに切り詰められたり拒否されたりしないようにしてください。

| 項目                         | 上限                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **タイトル文字数**           | **80 文字上限**（サニタイズ後カウント）。超過時は切り詰め、`[BANNER]` warn を出力。改行と制御文字はカウント前に除去。 |
| **サブタイトル文字数**       | **160 文字上限**（サニタイズ後カウント）。サニタイズパイプラインはタイトルと同様。超過時は同様に `[BANNER]` warn を出力。 |
| **ASCII アートブロックサイズ** | **各段 200 行 × 200 列上限**。超過時は切り詰め、`[BANNER]` warn を出力。                                           |
| **ASCII アートファイルサイズ** | **64 KB 上限**。ファイルが上限を超える場合は上限までのバイトのみ読み取り、残りは無視。                             |
| **ASCII アートの実際のレンダリング可能幅** | 起動時の端末の列数に依存し、**固定文字数ではありません**。具体的な計算式と各種端末幅での利用可能値は後述の「Logo の最大サイズ — 幅の予算」を参照。 |

ASCII アートに**固定の文字数上限はありません** — 上記の列/行のハード上限と、起動時に端末の列数で計算される幅の予算のみが存在します。同じ 17 文字のブランド名でも、フォントが変われば 1 行でレンダリングできるかどうかは、文字数ではなく視覚的な幅に依存します。

### 設定の保存場所

4 つの設定はすべて `settings.json` の `ui` ノード以下にあります。ユーザーレベル（`~/.qwen/settings.json`）とワークスペースレベル（プロジェクトルートの `.qwen/settings.json`）の両方をサポートし、標準のマージ優先順位で生效します（workspace が user を上書き、system が workspace を上書き）。

`customAsciiArt` は例外的です：パーサーはオブジェクト全体をより優先度の高いスコープの値で直接置き換えるのではなく、tier ごとにすべてのスコープをトラバースします。user 設定が `{ small }` を定義し、workspace 設定が `{ large }` を定義している場合、両方が有効になります — `small` は user から、`large` は workspace から取得されます。これにより、次の 2 つの要件を同時に満たせます。

1. 各 `{ path }` 項目は、宣言されたファイルを基準に解決されます（workspace `.qwen/` vs. user `~/.qwen/`）；マージされたビューのみを見るとスコープ情報が失われます。
2. ユーザーはデフォルトの `large` tier を個人設定に残し、ワークスペースごとに `small` だけを上書きでき、毎回オブジェクト全体を書き換える必要がありません。

同じ tier が複数のスコープで定義されている場合、通常の優先順位に従って生效します（system > workspace > user）。任意のスコープで `customAsciiArt` を単一の文字列または `{ path }` に設定した場合、そのスコープの両方の tier にも同様に設定されます。

### Banner 全体の非表示

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

起動出力は Logo 列と情報パネルをスキップします。`ui.hideTips` が設定されていない限り、Tips は引き続き表示されます。

### ブランドタイトルの置き換え

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

情報パネルは `Acme CLI (vX.Y.Z)` とレンダリングされます。カスタムタイトルを設定するとデフォルトでは `>_` 文字は付かなくなります。必要に応じて自分で含めてください：
`"customBannerTitle": ">_ Acme CLI"`。

### ブランドサブタイトルの追加

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

サブタイトルは二次テキスト色で独立した行として表示され、デフォルトの空白スペーサー行（タイトルと認証/モデル行の間の行）を**置き換えます**：

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① タイトル
│ Built-in DataWorks Official Skills                      │  ← B② サブタイトル
│ Qwen OAuth | qwen-coder ( /model 切り替え)                  │  ← B③ ステータス
│ ~/projects/example                                      │  ← B④ パス
└─────────────────────────────────────────────────────────┘
```

制約

- 1 行のみ許可。改行やその他の制御バイトは除去/スペースに折りたたまれ、貼り付け事故で情報パネルのレイアウトが壊れるのを防ぎます。
- サニタイズ後 160 文字上限（タイトルよりやや緩め — サブスローガンや "powered by" などはブランド名より長くなることが多いため）。
- 空文字列（または空文字列/すべて空白に設定）= デフォルトの空白スペーサー行を維持 — 後方互換がデフォルトの動作です。
- サブタイトルはロックされた行の動作を変更しません。認証、モデル、作業ディレクトリはサブタイトルの状態に関係なく常に表示されます。

### ASCII アートの置き換え — インライン文字列

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

JSON 文字列内では `\n` で改行を表します。この ASCII アートはデフォルトの Logo と同じように現在のテーマのグラデーションカラーが適用されます。

> **ASCII アートをお持ちでない場合？** 任意の外部ジェネレーターを使用し、生成結果を貼り付けるだけで構いません。最も簡単な方法は `figlet` です：
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` として、`customAsciiArt: { "path": "./brand.txt" }` でそのファイルを指定してください。CLI は**実行時に**テキストを ASCII アートにレンダリングしません — 理由は後述の「本設計の対象外」を参照。

### ASCII アートの置き換え — 外部ファイル

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

JSON 内で長い複数行文字列をエスケープする手間を避けます。パスの解決ルール

- **ワークスペースレベルの設定**：相対パスはワークスペースの `.qwen/` ディレクトリを基準に解決されます。
- **ユーザーレベルの設定**：相対パスは `~/.qwen/` を基準に解決されます。
- 絶対パスはそのまま使用されます。
- ファイルは**起動時に一度だけ読み取られ**、サニタイズ後にキャッシュに書き込まれます。セッション中にファイルを変更しても再レンダリングされません — CLI を再起動してください。

### ASCII アートの置き換え — 幅適応型

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

端末が十分に広い場合は `large` を優先、それ以外の場合は `small`、さらに狭い場合は Logo 列を非表示（現在の二列フォールバック戦略を継承）。`small` と `large` はそれぞれ文字列でも `{ path }` でも構いません。いずれかの段を省略可能：省略した場合は次の段にフォールバックします。

### Logo の最大サイズ — 幅の予算

タイトルやアートに「文字数のハード上限」はありません。端末の列数によって決定される**幅の予算**と、不正な入力によるレイアウトフリーズを防ぐための絶対的なハード上限のみが存在します。

| 項                                 | 上限                                            |
| ---------------------------------- | ----------------------------------------------- |
| 起動時の端末列数                   | ユーザーの端末が報告する通り。                  |
| コンテナの外側マージン             | 4 列（左 2 + 右 2）。                          |
| Logo 列と情報パネルの間のギャップ  | 2 列。                                          |
| 情報パネルの最小幅                 | 44 列（40 パス + 枠線 + パディング）。         |
| **各段アートのレンダリング時利用可能幅** | `端末列数 − 4 − 2 − 44 = 端末列数 − 50`。      |
| 単一段アートのサニタイズ後ハード上限 | 200 列 × 200 行。超過時は切り詰め、`[BANNER]` warn 出力。 |
| `customBannerTitle` サニタイズ後ハード上限 | 80 文字。超過時は切り詰め、`[BANNER]` warn 出力。 |

一般的な端末幅に対応する Logo の上限

| 端末列数 | レンダリング可能な最大 Logo 幅 | 実際の意味                                          |
| -------- | ----------------------------- | --------------------------------------------------- |
| 80       | 30                            | ほとんどの figlet "ANSI Shadow" 文字は 7–11 列。最大 3 文字。 |
| 100      | 50                            | ANSI Shadow で短い単語（約 6 文字）または 2 つの短い単語を重ねる。 |
| 120      | 70                            | 複数行の単語を重ねたアートに十分。                |
| 200      | 150                           | 1 行の長い文字列（例：完全な製品名の ANSI Shadow）も収まる。 |

アートをデザインする際の 2 つの経験則

1. **複数単語のブランド名は、ほとんどの端末で 1 行の ANSI Shadow でレンダリングできません。**
   ANSI Shadow の各文字は約 7–9 列。たとえ `Custom Agent` のような 12 文字のブランド名でも、1 行で約 95 列のアートが必要です。100 列の端末では情報パネルを収めた後には足りなくなります。単語を複数行に重ねるか、より狭い figlet フォントを使用するか、あるいは `▶ Custom Agent ◀` のようなコンパクトな 1 行の装飾を直接使用してください。
2. **1 つの段で「ワイド画面で見栄えが良く、狭い画面でも壊れない」ようにするには、`{ small, large }` 幅適応型を使用します。** 次の例では、`large` は端末が 104 列以上の場合に使用する重ねられた複数行アート、`small` は 16 列の 1 行装飾で、両方とも収まらない場合は Logo 列を非表示にします。

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

`banner-large.txt` には重ねられた ANSI Shadow の出力（約 54 列 × 12 行）を入れます。以下のコマンドで生成できます。

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### 3 つの組み合わせ

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

### 確認方法

1. `settings.json` を保存し、`qwen` を再起動します — Banner の解析は起動時に一度だけ実行されます。
2. 端末の幅を調整し、`small` / `large` の切り替えが期待通りに動作し、極端に狭い場合に Logo 列が正しく非表示になることを確認します。
3. 結果が期待と異なる場合は、`~/.qwen/debug/<sessionId>.txt`（`latest.txt` シンボリックリンクが現在のセッションを指す）を確認し、`[BANNER]` を grep してください — ソフト障害が発生するたびに原因を示す warn 行が出力されます。

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
   │    { small, large }      │         Header.tsx
   │ 2. 各段を解析：          │           │
   │    string → 直接使用      │           │  利用可能端末幅に応じて段を選択
   │    {path} → fs.read      │           │
   │      O_NOFOLLOW          │           ▼
   │      ≤ 64 KB             │          Logo 列をレンダリング
   │ 3. アートをサニタイズ：   │         情報パネルをレンダリング：
   │    stripControlSeqs      │           Title    = customBannerTitle
   │    ≤ 200 行 × 200 列     │                   ?? '>_ Qwen Code'
   │ 4. タイトル + サブタイトル│           Subtitle = customBannerSubtitle
   │    をサニタイズ（1 行、   │                   ?? 空白スペーサー行
   │    ≤ 80 / 160 文字）     │           Status   = ロック
   │ 5. ソースごとに memoize   │           Path     = ロック
   └─────────────────────────┘
```

5 ステップの解析アルゴリズムは、設定読み込み時に一度実行され、設定のホットリロードイベントが発生した場合にのみ再度実行されます。

1. **正規化**。裸の `string` または `{ path }` は `{ small: x, large: x }` に変換されます。`{ small, large }` オブジェクトはそのまま通過します。
2. **段ごとの解析**。各 `AsciiArtSource` について
   - 文字列：そのまま使用。
   - `{ path }`：同期的に読み取り、`O_NOFOLLOW` を使用してシンボリックリンクハイジャックを防御（Windows では通常の読み取り専用にフォールバック — この定数は公開されていません）、上限 64 KB。相対パスは*所属する設定ファイルのディレクトリ*を基準に解決されます：ワークスペース設定はワークスペース `.qwen/` を基準、ユーザー設定は `~/.qwen/` を基準。読み取り失敗 → `[BANNER]` warn、その段はデフォルトにフォールバック。
3. **サニタイズ**。Banner 専用のストリッパー：OSC / CSI / SS2 / SS3 のリード文字を除去し、残りの C0 / C1 制御バイト（DEL を含む）をスペースに置き換え、同時に `\n` は保持して複数行の ASCII アートを生かします。各行の末尾の空白をトリムした後、200 行 × 200 列に切り詰め、超過分は切り詰めて `[BANNER]` warn を出力します。
4. **レンダリング時の段選択**。`Header.tsx` 内で、解析された `small` と `large` が与えられ、現在の幅予算（`利用可能端末幅 ≥ logo幅 + logoGap + minInfoPanel幅`）に基づいて：
   - `large` が収まる場合は `large` を優先。
   - そうでなく `small` が収まる場合は `small` にフォールバック。
   - それ以外の場合、**ユーザーがカスタムアートを提供していれば**、Logo 列を直接非表示（`showLogo = false` 分岐を継承）— この場合、組み込みの QWEN Logo にフォールバックすると狭い端末でホワイトラベルデプロイが壊れる可能性があります。情報パネルは引き続きレンダリング。
   - そうでない場合（ユーザーがカスタムアートを全く提供していない場合）は `shortAsciiLogo` にフォールバックし、デフォルト Logo の幅ゲートによって表示が決定されます。
5. **最終フォールバック**。両方の段がソフト障害（ファイル欠落、サニタイズ後空、設定異常）のために最終的に空または不正になった場合は、カスタマイズ未適用として `shortAsciiLogo` をレンダリングし、デフォルト Logo の幅ゲートに従って処理します。CLI は Banner 設定のエラーによってクラッシュしては**なりません**。

段選択の疑似コード

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

## Settings schema の追加

`packages/cli/src/config/settingsSchema.ts` の `ui` オブジェクト内で、`shellOutputMaxLines` の直後に 4 つのプロパティを追加します。

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
  // 実行時には SettingDefinition `type` だけでは表現できないユニオン型を受け付ける。
  // override は JSON-schema ジェネレーターによってそのまま出力され、VS Code
  // が文書化されたすべての形式（string、{path}、{small,large}）を受け入れ、
  // 裸の文字列を赤くしないようにする。
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` は既存の `hideTips` のパターン（`showInDialog: true`）を継承します。残りの 3 つの自由テキストフィールド（タイトル、サブタイトル、アート）はアプリ内設定ダイアログには表示されません — TUI ダイアログで複数行 ASCII エディタを作るのは別のプロジェクトであり、上級ユーザーは直接 `settings.json` を編集します。

## コード変更箇所

変更は小さく、以下の各ファイルと現在の `main` ブランチ上の行番号範囲を示します。

`packages/cli/src/ui/components/AppHeader.tsx:53` — `showBanner` を拡張

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — 解析された Banner データを `<Header>` に渡す

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

`packages/cli/src/ui/components/Header.tsx` — `HeaderProps` を拡張

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

`packages/cli/src/ui/components/Header.tsx:45-46` — `logoWidth` を計算する前に段を選択し、既存のデフォルトを最終フォールバックとする

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

`packages/cli/src/ui/components/Header.tsx` — タイトルは prop からレンダリング、サブタイトルは prop が真値の場合に元の空白スペーサー行を置き換える

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

**新規ファイル**：`packages/cli/src/ui/utils/customBanner.ts` — パーサー。
外部インターフェース

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

パーサーは前述の「解析パイプライン」で説明された正規化、ファイル読み取り、サニタイズ、キャッシュを担当します。CLI 起動時に一度呼び出され、設定のホットリロードイベントでも再度呼び出されます。各スコープのファイルパスは `settings.system.path` / `settings.workspace.path` / `settings.user.path` から直接取得されるため、各 `{ path }` はそれを宣言したファイルを基準に解決されます。`settings.isTrusted` が false の場合、ワークスペーススコープは完全にスキップされます。

## 代替案の比較

以下は評価された 5 つの形式です。将来のメンテナーが設計空間を理解し、必要に応じて再評価できるように記載します。

### 案 1 — 3 つのフラットフィールド（推奨、issue と完全一致）

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **効果**：ユーザー側の負荷が最小、issue の記述と 1 対 1 対応。
- **利点**：学習コストゼロ、ドキュメントが非常に簡単。既存の `ui.*` フラットフィールド（`hideTips`、`customWittyPhrases` など）と一貫性がある。
- **欠点**：3 つの意味的に関連するキーが `ui` トップレベルに分散。将来 Banner 専用のスイッチ（グラデーション、サブタイトルなど）を追加する場合、`ui` に兄弟フィールドを追加し続けるしかなく、自然なグルーピングができない。

### 案 2 — ネストされた `ui.banner` 名前空間

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

- **効果**：能力は案 1 と同じ、機能ごとに集約。
- **利点**：将来の Banner 専用スイッチにクリーンな名前空間を提供。`/settings` での発見性が向上。
- **欠点**：issue の原文の書き方と完全には一致しない。既存の UI 設定はほとんどがフラット（`ui.accessibility` と `ui.statusLine` のみネスト）であり、一貫性が損なわれる。ユーザーが覚える階層が 1 つ増える。
### 方案 3 —— Banner profile 预设 + slot override

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* 'branded' 下的 slot 覆盖 */ }
  }
}
```

- **効果**: ユーザーは名前付きプリセットから選択可能。上級ユーザーは選択したプリセットの特定のスロットを上書きできる。
- **利点**: onboarding 体験の向上。プリセットは CLI 側で同梱可能。
- **欠点**: 複雑さが著しく増加。プリセットは長期的なメンテナンスのコミットメントとなる。Issue が求めているのはオープンなカスタマイズであり、コンテンツのキュレーションではない。

### 方案 4 —— 全体 Banner テンプレート文字列

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **効果**: 単一の自由形式テンプレート。ロックされたフィールドは補間される。
- **利点**: 標準外のレイアウトに対して最高の柔軟性。
- **欠点**: レイアウトの責任をユーザー側に委ねる。Ink の二段組みが端末の幅に対して堅牢でなくなる。狭い端末で崩壊するテンプレートを容易に作成可能。この利益に対して大きな攻撃面を開く。

### 方案 5 —— プラグイン / フック API

拡張システムを介して banner-renderer フックを公開する。

- **効果**: コードレベルのカスタマイズ。拡張機能は任意のコンテンツをレンダリング可能。
- **利点**: 能力の上限が最も高い。企業はブランド化されたプラグインのパッケージ全体を提供可能。
- **欠点**: API 表面が巨大。任意の端末レンダリングにはセキュリティレビューが必要。この Issue に対して完全に過剰設計。

### 推奨結論

**方案 1 を採用**。これは Issue を直接満たし、既存の `ui.*` スタイルに適合し、まだどのようなバナー固有のスイッチがあるか明確でないうちに名前空間でロックされることもない。将来的に兄弟フィールドが蓄積され始めた場合、方案 2 への移行は追加的である —— `ui.banner.title` と `ui.customBannerTitle` は非推奨期間中に共存可能。

## セキュリティとエラー処理

カスタムバナーコンテンツは**そのまま端末にレンダリング**され、path 形式の場合は**ディスクから読み込まれる**。どちらのパスも、悪意のあるまたは改ざんされた設定が読み込まれた場合に到達可能である。Session-title 機能が対処しているのと同じ脅威モデルがここにも適用される。

| 懸念事項                                               | 対策                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASCII art / タイトル / サブタイトル内の ANSI / OSC-8 / CSI インジェクション | バナー専用のストリッパー（`sanitizeArt` / `sanitizeSingleLine`）：OSC / CSI / SS2 / SS3 エスケープを除去し、残りの C0 / C1 制御文字（DEL 含む）をスペースに置換。レンダリング前とキャッシュ書き込み前の両方で適用。 |
| 巨大ファイルによる起動フリーズ                         | ファイル読み取りのハード上限は 64 KB。                                                                                                                                                            |
| 病的な ASCII art によるレイアウトフリーズ              | パース結果の上限は 200 行 × 200 列。超過分は切り捨て + `[BANNER]` warn。                                                                                                                          |
| パス形式へのシンボリックリンクハイジャック             | ファイル読み取りに `O_NOFOLLOW` を使用（Windows では読み取り専用にフォールバック。定数は公開しない）。                                                                                             |
| ファイルの欠落または読み取り不可                       | キャッチ → `[BANNER]` warn → デフォルトにフォールバック。絶対に UI に例外を投げない。                                                                                                             |
| タイトル / サブタイトルに改行や長すぎる文字列          | 改行はスペースに折りたたみ、80（タイトル）/ 160（サブタイトル）文字で切り捨て。                                                                                                                    |
| 信頼できないワークスペースがレンダリングやファイル読み取りに影響 | `settings.isTrusted` が false の場合、パーサーは `settings.workspace` 全体をスキップ（`settings.merged` ビューの信頼ゲートと一貫）。                                                               |
| 設定のホットリロードの競合                             | パース結果は呼び出しごとにソース（パスまたは文字列）でメモ化。reload はパーサーを再実行し、影響を受けるファイルを再読み込み。                                                                     |

障害モードのまとめ：すべてのソフト障害は最終的に `shortAsciiLogo`（またはロックされたデフォルトタイトル）+ 1行のデバッグログ warn に落ち着く。どのブランチでもハード障害（上位への例外スロー）を発生させてはならない。

## 本設計の対象外

以下の項目は意図的に除外されている。それぞれ、ユーザーフィードバックに基づいて別途提案される可能性がある。

| 項目                                                                                   | 除外の理由                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| テキストから ASCII art への変換（`{ text: "xxxCode" }` 形式）                          | v1 評価で**却下**。`figlet` 実行時依存を導入する（使用可能なフォントセットを含めると約 2–3 MB unpacked）か、単一フォントレンダラーを vendor する（~200 行のコード + メンテナンスが必要な `.flf` フォント）。どちらのルートも長期的なメンテナンス面をもたらす：フォント選定、フォントライセンス監査、「私のフォントが X 端末で正しくレンダリングされない」系の Issue、CJK / 全角文字の処理。この機能のドライブユースケース（ホワイトラベル / マルチテナント）では、ほぼ確実にデザイナーが完成品の ASCII art を納品し、figlet のデフォルトフォントに依存しない。一行で生成したいユーザーは今日でも `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` で実現可能 —— 同等の効果、依存関係ゼロ、Qwen Code 内部のサポート負荷ゼロ。将来的に需要が増えれば、この形式は純粋に追加的：`AsciiArtSource` を `string \| {path} \| {text, font?}` に拡張するだけで、既存の設定を壊さない。 |
| `/banner` スラッシュコマンドによるオンライン編集                                       | 設定 UI が正規の編集エントリポイント。複数行の ASCII オンラインエディタは別プロジェクト。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| カスタムグラデーション / 単色                                                           | 色は theme が所有。拡張が必要な場合は別途提案すべきであり、バナーのカスタマイズでその領域を再発明しない。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| URL からの ASCII art 読み込み                                                           | 起動時のネットワークリクエストは失敗モード、キャッシュ、セキュリティレビューなど多くの問題を伴う。`{path}` ファイル読み込みは低リスクの代替手段。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| アニメーション（回転ロゴ、スクロールタイトル）                                         | レンダリング負荷とアクセシビリティの問題を増加させる。この機能のユースケースでは不要。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VSCode / Web UI へのバナー同期                                                         | これらのエンドポイントは現在 Ink バナーをレンダリングしていない。将来導入される場合、本設計を参考とする。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ファイル変更の動的リロード                                                             | パーサーは起動時と設定リロード時のみ実行。セッション中に art を変更するニーズは稀であり、「再起動で反映」は許容可能な妥協点。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ロック領域（version / auth / model / path）の個別非表示                                  | これらは実行時のシグナルであり、それらを隠蔽することは、ホワイトラベルシナリオの利益よりも、サポートとセキュリティポスチャへの害が大きい。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## 検証計画

実装 PR では以下のエンドツーエンドチェックを通過すること：

1. `~/.qwen/settings.json` に `customBannerTitle: "Acme CLI"` とインラインの `customAsciiArt` を設定 → `qwen` 起動後、新しいタイトルと新しい ASCII art が表示される。バージョン番号のサフィックスはそのまま。
2. `customBannerSubtitle: "Built-in Acme Skills"` を設定 → サブタイトル行が、タイトルと認証 / モデル行の間にセカンダリテキスト色で表示される。認証、モデル、パスは引き続き表示される。設定解除後は空のスペーサー行に戻る（後方互換性）。
3. `hideBanner: true` を設定 → `qwen` 起動時にバナーなし。Tips とメインコンテンツは通常通りレンダリング。
4. workspace `settings.json` に `customAsciiArt: { "path": "./brand.txt" }` を設定し、`brand.txt` を `.qwen/` ディレクトリ内に配置 → ワークスペースを開くとディスクから読み込まれる。
5. `customAsciiArt: { "small": "...", "large": "..." }` → 端末サイズをワイド / ミディアム / ナローに変更。ワイド時は large、ミディアム時は small、ナロー時はロゴ列を非表示。情報パネルは常に表示される。
6. `customBannerTitle` と `customBannerSubtitle` にそれぞれ `\x1b[31mhostile` をインジェクション → 両方ともリテラルテキストとしてレンダリングされ、赤色として解釈されない。
7. `path` が存在しないファイルを指している → CLI は正常に起動。`~/.qwen/debug/<sessionId>.txt` に `[BANNER]` warn が出力。デフォルトの art をレンダリング。
8. ワークスペースの信頼がオフの状態で worktree を開く → ワークスペースが提供する `customAsciiArt`（`{ path }` 項目を含む）は静かに無視される。user スコープの設定は引き続き有効。