# テーマ

Qwen Code は、配色や外観をカスタマイズできるさまざまなテーマをサポートしています。`/theme` コマンドまたは `"theme":` 設定項目を使って、お好みのテーマに変更できます。

## 利用可能なテーマ

Qwen Code にはいくつかの事前定義されたテーマが含まれており、CLI 内で `/theme` コマンドを実行することで一覧を表示できます：

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

### テーマの変更方法

1. Qwen Code で `/theme` と入力します。
2. 利用可能なテーマの一覧を表示するダイアログまたは選択プロンプトが表示されます。
3. 矢印キーを使ってテーマを選択します。一部のインターフェースでは、選択中にライブプレビューやハイライト表示が行われる場合があります。
4. 選択内容を確定して、テーマを適用します。

### テーマの永続化

選択されたテーマは Qwen Code の[設定](./configuration.md)に保存されるため、セッションをまたいでユーザーの設定が保持されます。

---

## カスタムカラーテーマ

Qwen Code では、`settings.json` ファイルにテーマを指定することで、独自のカスタムカラーテーマを作成できます。これにより、CLI で使用されるカラーパレットを完全にコントロールすることが可能になります。

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
- `DiffAdded`（任意、diff の追加行用）
- `DiffRemoved`（任意、diff の削除行用）
- `DiffModified`（任意、diff の変更行用）

**必須プロパティ:**

- `name`（`customThemes` オブジェクト内のキーと一致し、文字列である必要があります）
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

色の値には、16進コード（例：`#FF0000`）**または**標準的な CSS カラー名（例：`coral`、`teal`、`blue`）を使用できます。サポートされている名前の完全なリストについては、[CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) を参照してください。

`customThemes` オブジェクトにエントリを追加することで、複数のカスタムテーマを定義できます。

### カスタムテーマの例

<img src="../assets/theme-custom.png" alt="Custom theme example" width="600" />

### カスタムテーマの使い方

- Qwen Code で `/theme` コマンドを使用して、カスタムテーマを選択します。作成したテーマはテーマ選択ダイアログに表示されます。
- または、`settings.json` に `"theme": "MyCustomTheme"` を追加してデフォルトとして設定します。
- カスタムテーマはユーザー、プロジェクト、システムのいずれかのレベルで設定でき、他の設定と同様の[設定の優先順位](./configuration.md)に従います。

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