# テーマ

Qwen Code は、カラースキームや外観をカスタマイズするためのさまざまなテーマをサポートしています。`/theme` コマンドまたは `"ui.theme"` 設定を使用して、好みに合わせてテーマを変更できます。

## 利用可能なテーマ

Qwen Code には事前定義されたテーマが用意されており、CLI 内で `/theme` コマンドを使用して一覧表示できます:

- **ダークテーマ:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
  - `Qwen Dark`
  - `Shades Of Purple`
- **ライトテーマ:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Qwen Light`
  - `Xcode`

### テーマの変更

1.  Qwen Code に `/theme` と入力します。
2.  利用可能なテーマの一覧が表示されたダイアログまたは選択プロンプトが表示されます。
3.  矢印キーを使用してテーマを選択します。インターフェースによってはライブプレビューや選択時のハイライトが表示される場合があります。
4.  選択を確定してテーマを適用します。

**注意:** `settings.json` ファイルにテーマが定義されている場合（名前またはファイルパスで指定）、`/theme` コマンドを使用してテーマを変更する前に、`"ui.theme"` 設定をファイルから削除する必要があります。

### テーマの永続化

選択したテーマは Qwen Code の[設定](../configuration/settings)に保存されるため、セッションをまたいで設定が維持されます。

---

## テーマの自動検出

テーマが `"auto"` に設定されている場合（または未設定の場合）、Qwen Code はターミナルのダーク・ライトの背景を自動的に検出し、対応する Qwen テーマ（`Qwen Dark` または `Qwen Light`）を選択します。

### 有効化する方法

`settings.json` でテーマを `"auto"` に設定します:

```json
{
  "ui": {
    "theme": "auto"
  }
}
```

または `/theme` ダイアログで **Auto** を選択します。これはテーマが明示的に設定されていない場合のデフォルトの動作です。

### 検出方法

Qwen Code はフォールバックチェーンで複数の検出方法を使用します。起動時（非同期パス）の優先順位は次のとおりです:

| 優先度 | 方法                    | プラットフォーム | 動作内容                                                                                             |
| ------ | ----------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| 1      | `COLORFGBG`             | すべて           | `COLORFGBG` 環境変数を読み取ります（iTerm2、rxvt、Konsole などのターミナルが設定）                  |
| 2      | OSC 11                  | すべて（TTY）    | ターミナルに `ESC]11;?` クエリを送信し、レスポンスから背景色を解析します（約200ms）                  |
| 3      | macOS システム外観      | macOS のみ       | `defaults read -g AppleInterfaceStyle` を実行して macOS ダークモードが有効かどうかを確認します       |
| 4      | デフォルト              | すべて           | どの方法も成功しない場合はダークテーマにフォールバックします                                         |

最初に結果を返した方法が採用されます。検出された値はセッション中にキャッシュされるため、以降のテーマ解決（`/theme` ダイアログで Auto を再選択するなど）で一貫した結果が得られます。

### Auto を使うべき場合

- **ほとんどのユーザー** — ターミナルの背景が OS の外観と一致している場合、またはターミナルが `COLORFGBG` を設定しているか OSC 11 をサポートしている場合、Auto は適切に動作します。
- **tmux / screen ユーザー** — OSC 11 がマルチプレクサを通過しない場合があります。検出は `COLORFGBG` または macOS システム外観にフォールバックします。どちらも利用できない場合はデフォルトのダークテーマが使用されます。自動検出で誤った結果が得られる場合は、特定のテーマを設定してください。
- **SSH セッション** — 検出はリモート環境に依存します。`COLORFGBG` が転送されておらず、リモートターミナルが OSC 11 に応答しない場合は、デフォルトのダークテーマが使用されます。

---

## カスタムカラーテーマ

Qwen Code では、`settings.json` ファイルで指定することで独自のカスタムカラーテーマを作成できます。これにより CLI で使用するカラーパレットを完全にコントロールできます。

### カスタムテーマの定義方法

ユーザー、プロジェクト、またはシステムの `settings.json` ファイルに `customThemes` ブロックを追加します。各カスタムテーマは、一意の名前とカラーキーのセットを持つオブジェクトとして定義されます。例:

```json
{
  "ui": {
    "customThemes": {
      "MyCustomTheme": {
        "name": "MyCustomTheme",
        "type": "custom",
        "Background": "#181818",
        ...
      }
    }
  }
}
```

**カラーキー:**

- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`
- `DiffAdded`（オプション、diff の追加行用）
- `DiffRemoved`（オプション、diff の削除行用）
- `DiffModified`（オプション、diff の変更行用）

**必須プロパティ:**

- `name`（`customThemes` オブジェクトのキーと一致する文字列である必要があります）
- `type`（文字列 `"custom"` である必要があります）
- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`

カラー値には、16進数コード（例: `#FF0000`）**または**標準 CSS カラー名（例: `coral`、`teal`、`blue`）を使用できます。サポートされている名前の完全なリストは [CSS カラー名](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) を参照してください。

`customThemes` オブジェクトにエントリを追加することで、複数のカスタムテーマを定義できます。

### ファイルからテーマを読み込む

`settings.json` でカスタムテーマを定義することに加えて、`settings.json` にファイルパスを指定することで JSON ファイルから直接テーマを読み込むこともできます。これはテーマを共有したり、メイン設定とは別に管理したりする場合に便利です。

ファイルからテーマを読み込むには、`settings.json` の `ui.theme` プロパティにテーマファイルのパスを設定します:

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

テーマファイルは、`settings.json` で定義されるカスタムテーマと同じ構造に従う有効な JSON ファイルである必要があります。

**`my-theme.json` の例:**

```json
{
  "name": "My File Theme",
  "type": "custom",
  "Background": "#282A36",
  "Foreground": "#F8F8F2",
  "LightBlue": "#82AAFF",
  "AccentBlue": "#61AFEF",
  "AccentPurple": "#BD93F9",
  "AccentCyan": "#8BE9FD",
  "AccentGreen": "#50FA7B",
  "AccentYellow": "#F1FA8C",
  "AccentRed": "#FF5555",
  "Comment": "#6272A4",
  "Gray": "#ABB2BF",
  "DiffAdded": "#A6E3A1",
  "DiffRemoved": "#F38BA8",
  "DiffModified": "#89B4FA",
  "GradientColors": ["#4796E4", "#847ACE", "#C3677F"]
}
```

**セキュリティに関する注意:** 安全のため、Qwen Code はホームディレクトリ内に配置されたテーマファイルのみを読み込みます。ホームディレクトリ外からテーマを読み込もうとした場合、警告が表示されてテーマは読み込まれません。これは信頼できないソースから悪意のある可能性があるテーマファイルが読み込まれるのを防ぐためです。

### カスタムテーマの例

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### カスタムテーマを使用する

- Qwen Code の `/theme` コマンドを使用してカスタムテーマを選択します。カスタムテーマはテーマ選択ダイアログに表示されます。
- または、`settings.json` の `ui` オブジェクトに `"theme": "MyCustomTheme"` を追加してデフォルトとして設定します。
- カスタムテーマはユーザー、プロジェクト、またはシステムレベルで設定でき、他の設定と同じ[設定の優先順位](../configuration/settings)に従います。

## テーマのプレビュー

|  ダークテーマ  |                                                                                プレビュー                                                                                |  ライトテーマ  |                                                                                プレビュー                                                                                |
| :----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI     |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
