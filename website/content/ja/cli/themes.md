# テーマ

Qwen Code は、配色や外観をカスタマイズできるさまざまなテーマをサポートしています。`/theme` コマンドまたは `"theme":` 設定項目を使って、お好みのテーマに変更できます。

## 利用可能なテーマ

Qwen Code にはいくつかの事前定義されたテーマが含まれており、CLI 内で `/theme` コマンドを使用して一覧を表示できます：

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
2.  利用可能なテーマの一覧が表示されたダイアログまたは選択プロンプトが表示されます。
3.  矢印キーを使ってテーマを選択します。一部のインターフェースでは、選択中にライブプレビューまたはハイライト表示が提供される場合があります。
4.  選択内容を確定してテーマを適用します。

**注意:** `settings.json` ファイル内でテーマが定義されている場合（名前またはファイルパスによる）、`/theme` コマンドを使ってテーマを変更する前に、ファイルから `"theme"` 設定を削除する必要があります。

### テーマの永続化

選択されたテーマは Qwen Code の [configuration](./configuration.md) に保存されるため、セッションをまたいで設定が記憶されます。

---

## カスタムカラーテーマ

Qwen Code では、`settings.json` ファイルでテーマを指定することで、独自のカスタムカラーテーマを作成できます。これにより、CLI で使用されるカラーパレットを完全にコントロールできます。

### カスタムテーマの定義方法

ユーザー、プロジェクト、またはシステムの `settings.json` ファイルに `customThemes` ブロックを追加してください。各カスタムテーマは、一意の名前と一連のカラーキーを持つオブジェクトとして定義されます。例：

```json
{
  "customThemes": {
    "MyCustomTheme": {
      "name": "MyCustomTheme",
      "type": "custom",
      "Background": "#181818",
      "Foreground": "#F8F8F2",
      "LightBlue": "#82AAFF",
      "AccentBlue": "#61AFEF",
      "AccentPurple": "#C678DD",
      "AccentCyan": "#56B6C2",
      "AccentGreen": "#98C379",
      "AccentYellow": "#E5C07B",
      "AccentRed": "#E06C75",
      "Comment": "#5C6370",
      "Gray": "#ABB2BF",
      "DiffAdded": "#A6E3A1",
      "DiffRemoved": "#F38BA8",
      "DiffModified": "#89B4FA",
      "GradientColors": ["#4796E4", "#847ACE", "#C3677F"]
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
- `DiffAdded` (オプション、diff の追加行用)
- `DiffRemoved` (オプション、diff の削除行用)
- `DiffModified` (オプション、diff の変更行用)

**必須プロパティ:**

- `name` (`customThemes` オブジェクト内のキーと一致する必要があり、文字列であること)
- `type` (文字列 `"custom"` であること)
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

色の値には、16進コード（例: `#FF0000`）**または** 標準的な CSS カラー名（例: `coral`, `teal`, `blue`）のいずれかを使用できます。サポートされている名前の完全なリストについては [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) を参照してください。

`customThemes` オブジェクトにエントリを追加することで、複数のカスタムテーマを定義できます。

### ファイルからテーマを読み込む

`settings.json` でカスタムテーマを定義するだけでなく、`settings.json` にファイルパスを指定することで、JSON ファイルから直接テーマを読み込むこともできます。これはテーマを共有したり、メインの設定ファイルとは別に管理したりするのに便利です。

ファイルからテーマを読み込むには、`settings.json` の `theme` プロパティにテーマファイルのパスを設定します：

```json
{
  "theme": "/path/to/your/theme.json"
}
```

テーマファイルは、`settings.json` で定義されたカスタムテーマと同じ構造に従った有効な JSON ファイルである必要があります。

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

**セキュリティに関する注意:** 安全性を考慮して、Gemini CLI はホームディレクトリ内にあるテーマファイルのみを読み込みます。ホームディレクトリ外からテーマを読み込もうとすると警告が表示され、テーマは読み込まれません。これは信頼できないソースからの悪意のあるテーマファイルの読み込みを防ぐためです。

### カスタムテーマの例

<img src="../assets/theme-custom.png" alt="Custom theme example" width="600" />

### カスタムテーマの使い方

- Qwen Code で `/theme` コマンドを使用して、カスタムテーマを選択できます。テーマ選択ダイアログにあなたのカスタムテーマが表示されます。
- または、`settings.json` に `"theme": "MyCustomTheme"` を追加することでデフォルトとして設定できます。
- カスタムテーマはユーザー、プロジェクト、システムのいずれかのレベルで設定可能で、他の設定と同様の[設定優先順位](./configuration.md)に従います。

---

## ダークテーマ

### ANSI

<img src="../assets/theme-ansi.png" alt="ANSI theme" width="600" />

### Atom OneDark

<img src="../assets/theme-atom-one.png" alt="Atom One theme" width="600">

### Ayu

<img src="../assets/theme-ayu.png" alt="Ayu theme" width="600">

### Default

<img src="../assets/theme-default.png" alt="Default theme" width="600">

### Dracula

<img src="../assets/theme-dracula.png" alt="Dracula theme" width="600">

### GitHub

<img src="../assets/theme-github.png" alt="GitHub theme" width="600">

## Light Themes

### ANSI Light

<img src="../assets/theme-ansi-light.png" alt="ANSI Light theme" width="600">

### Ayu Light

<img src="../assets/theme-ayu-light.png" alt="Ayu Light theme" width="600">

### Default Light

<img src="../assets/theme-default-light.png" alt="Default Light theme" width="600">

### GitHub Light

<img src="../assets/theme-github-light.png" alt="GitHub Light theme" width="600">

### Google Code

<img src="../assets/theme-google-light.png" alt="Google Code theme" width="600">

### Xcode

<img src="../assets/theme-xcode-light.png" alt="Xcode Light theme" width="600">