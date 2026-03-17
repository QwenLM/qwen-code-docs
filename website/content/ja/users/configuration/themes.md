# テーマ

Qwen Code では、色合いや外観をカスタマイズするためのさまざまなテーマがサポートされています。`/theme` コマンドまたは `"theme":` 設定でテーマを変更し、お好みに合わせることができます。

## 利用可能なテーマ

Qwen Code には事前に定義されたテーマがいくつか付属しており、CLI 内で `/theme` コマンドを実行することで一覧表示できます。

- **ダークテーマ:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
- **ライトテーマ:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Xcode`

### テーマの変更

1.  Qwen Code で `/theme` を入力します。
2.  利用可能なテーマの一覧を表示するダイアログまたは選択プロンプトが表示されます。
3.  矢印キーを使ってテーマを選択します。一部のインターフェースでは、選択中にライブプレビューが表示されたり、選択中のテーマがハイライト表示されたりします。
4.  選択を確定して、テーマを適用します。

**注意:** `settings.json` ファイル内でテーマ（名前またはファイルパスのいずれか）が定義されている場合、`/theme` コマンドでテーマを変更するには、まずそのファイルから `"theme"` 設定を削除する必要があります。

### テーマの永続化

選択したテーマは、Qwen Code の [設定](../configuration/settings) に保存されるため、セッション間で設定が保持されます。

---

## カスタムカラーテーマ

Qwen Code では、`settings.json` ファイルにカスタムカラーテーマを指定することで、独自のカラーテーマを作成できます。これにより、CLI で使用されるカラーパレットを完全に制御できます。

### カスタムテーマの定義方法

ユーザー、プロジェクト、またはシステムの `settings.json` ファイルに `customThemes` ブロックを追加します。各カスタムテーマは、一意の名前と一連のカラーキーを持つオブジェクトとして定義されます。例：

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
- `DiffAdded`（差分表示における追加行用、任意）
- `DiffRemoved`（差分表示における削除行用、任意）
- `DiffModified`（差分表示における変更行用、任意）

**必須プロパティ:**

- `name`（`customThemes` オブジェクト内のキーと一致し、文字列である必要があります）
- `type`（文字列 `"custom"` でなければなりません）
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

色の値には、16進数表記（例：`#FF0000`）または標準の CSS カラー名（例：`coral`、`teal`、`blue`）のいずれかを使用できます。サポートされるカラー名の完全な一覧については、[CSS カラー名](https://developer.mozilla.org/ja-JP/docs/Web/CSS/color_value#color_keywords) を参照してください。

`customThemes` オブジェクトにさらにエントリを追加することで、複数のカスタムテーマを定義できます。

### ファイルからテーマを読み込む

`settings.json` でカスタムテーマを定義するほか、`settings.json` 内でファイルパスを指定することで、JSON ファイルから直接テーマを読み込むこともできます。これは、テーマを共有したり、メインの設定から分離して管理したりする場合に便利です。

ファイルからテーマを読み込むには、`settings.json` の `theme` プロパティをテーマファイルのパスに設定します。

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

テーマファイルは、`settings.json` 内で定義されるカスタムテーマと同じ構造を持つ有効な JSON ファイルである必要があります。

**例: `my-theme.json`**

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

**セキュリティに関する注意:** セキュリティのため、Gemini CLI はホームディレクトリ内に配置されたテーマファイルのみを読み込みます。ホームディレクトリ外の場所からテーマを読み込もうとした場合、警告が表示され、そのテーマは読み込まれません。これは、信頼できないソースからの悪意のあるテーマファイルの読み込みを防ぐための措置です。

### カスタムテーマの例

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### カスタムテーマの使用方法

- Qwen Code 内で `/theme` コマンドを使用し、カスタムテーマを選択します。カスタムテーマはテーマ選択ダイアログに表示されます。
- または、`settings.json` の `ui` オブジェクトに `"theme": "MyCustomTheme"` を追加して、デフォルトテーマとして設定できます。
- カスタムテーマは、ユーザー単位、プロジェクト単位、システム単位のいずれかで設定でき、他の設定と同様に[設定の優先順位](../configuration/settings)に従います。

## テーマのプレビュー

|  ダークテーマ  |                                                                                プレビュー                                                                                |  ライトテーマ  |                                                                                プレビュー                                                                                |
| :------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|      ANSI      |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   ANSI Light    |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |    Ayu Light    | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|       Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    Dracula     |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     GitHub     | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |