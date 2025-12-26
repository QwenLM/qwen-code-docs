# テーマ

Qwen Code は、カラースキームや外観をカスタマイズするためのさまざまなテーマをサポートしています。`/theme` コマンドまたは `"theme":` 設定オプションを使用して、好みに合ったテーマに変更できます。

## 利用可能なテーマ

Qwen Code には事前定義されたテーマがいくつか用意されており、CLI 内で `/theme` コマンドを使用して一覧表示できます。

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

1.  Qwen Code で `/theme` と入力します。
2.  利用可能なテーマが一覧表示されたダイアログまたは選択プロンプトが表示されます。
3.  矢印キーを使用してテーマを選択します。一部のインターフェースでは、選択時にライブプレビューが表示されたり、ハイライト表示されたりします。
4.  選択を確定してテーマを適用します。

**注意:** `settings.json` ファイルでテーマが定義されている場合（名前またはファイルパスのいずれか）、`/theme` コマンドでテーマを変更する前に、ファイルから `"theme"` 設定を削除する必要があります。

### テーマの永続性

選択したテーマは Qwen Code の[設定](../configuration/settings)に保存されるため、セッションをまたいで設定が保持されます。

---

## カスタムカラーテーマ

Qwen Code では、`settings.json` ファイルで独自のカスタムカラーテーマを指定して作成できます。これにより、CLI で使用されるカラーパレットを完全に制御できます。

### カスタムテーマの定義方法

ユーザー、プロジェクト、またはシステムの `settings.json` ファイルに `customThemes` ブロックを追加します。各カスタムテーマは、一意の名前と色キーのセットを持つオブジェクトとして定義されます。例：

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

**色キー:**

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
- `DiffAdded` (オプション、差分の追加行用)
- `DiffRemoved` (オプション、差分の削除行用)
- `DiffModified` (オプション、差分の変更行用)

**必須プロパティ:**

- `name` (`customThemes` オブジェクト内のキーと一致する必要があり、文字列である必要があります)
- `type` (`"custom"` という文字列である必要があります)
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

色の値には、16進コード (例: `#FF0000`) **または** 標準のCSS色名 (例: `coral`, `teal`, `blue`) のいずれかを使用できます。サポートされている色名の完全なリストは [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) を参照してください。

`customThemes` オブジェクトに複数のエントリを追加することで、複数のカスタムテーマを定義できます。

### ファイルからのテーマの読み込み

`settings.json` でカスタムテーマを定義するだけでなく、`settings.json` でファイルパスを指定することで、JSON ファイルから直接テーマを読み込むこともできます。これは、テーマを共有したり、メインの設定から分離して管理したりする場合に便利です。

ファイルからテーマを読み込むには、`settings.json` の `theme` プロパティをテーマファイルのパスに設定します。

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

テーマファイルは、`settings.json` で定義されるカスタムテーマと同じ構造を持つ、有効な JSON ファイルである必要があります。

**例 `my-theme.json`:**

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

**セキュリティに関する注意:** 安全のため、Gemini CLI はホームディレクトリ内にあるテーマファイルのみを読み込みます。ホームディレクトリ外のテーマを読み込もうとした場合、警告が表示され、テーマは読み込まれません。これは、信頼できないソースからの悪意のあるテーマファイルの読み込みを防ぐためです。

### カスタムテーマの例

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### カスタムテーマの使用

- Qwen Code の `/theme` コマンドを使用して、カスタムテーマを選択します。テーマ選択ダイアログにカスタムテーマが表示されます。
- または、`settings.json` の `ui` オブジェクトに `"theme": "MyCustomTheme"` を追加して、デフォルトとして設定することもできます。
- カスタムテーマは、ユーザー、プロジェクト、またはシステムレベルで設定でき、他の設定と同様に[設定の優先順位](../configuration/settings)に従います。

## テーマプレビュー

|  ダークテーマ  |                                                                                プレビュー                                                                                |  ライトテーマ  |                                                                                プレビュー                                                                                |
| :----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI     |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |