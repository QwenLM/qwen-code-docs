# テーマ

Qwen Code は、カラースキームや外観をカスタマイズするためのさまざまなテーマをサポートしています。`/theme` コマンド、または `"ui.theme"` 設定オプションを使用して、好みに合わせてテーマを変更できます。

## 利用可能なテーマ

Qwen Code には、あらかじめ定義されたテーマが用意されています。CLI 内で `/theme` コマンドを使用すると、その一覧を表示できます。

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
2.  利用可能なテーマをリスト表示するダイアログまたは選択プロンプトが表示されます。
3.  矢印キーを使用してテーマを選択します。インターフェースによっては、選択中にライブプレビューやハイライトが表示される場合があります。
4.  選択を確定すると、テーマが適用されます。

**注:** `settings.json` ファイルにテーマが定義されている場合（名前またはファイルパスで）、`/theme` コマンドを使用してテーマを変更する前に、ファイルから `"ui.theme"` 設定を削除する必要があります。

### テーマの永続性

選択したテーマは Qwen Code の[設定](../configuration/settings)に保存されるため、セッションをまたいでも設定が保持されます。

---

## 自動テーマ検出

テーマが `"auto"` に設定されている場合（または未設定の場合）、Qwen Code は自動的にターミナルの背景がダークかライトかを検出し、一致する Qwen テーマ（`Qwen Dark` または `Qwen Light`）を選択します。

### 有効化方法

`settings.json` でテーマを `"auto"` に設定します。

```json
{
  "ui": {
    "theme": "auto"
  }
}
```

または、`/theme` ダイアログで **Auto** を選択します。テーマが明示的に設定されていない場合のデフォルトの動作です。

### 検出方法

Qwen Code はフォールバックチェーンで複数の検出方法を使用します。起動時（非同期パス）の優先順位は次のとおりです。

| 優先度 | 方法                    | プラットフォーム | 動作                                                                                  |
| ------ | ----------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| 1      | `COLORFGBG`             | すべて           | `COLORFGBG` 環境変数（iTerm2、rxvt、Konsole などのターミナルで設定）を読み取ります      |
| 2      | OSC 11                  | すべて（TTY）    | `ESC]11;?` クエリをターミナルに送信し、応答から背景色を解析します（約200ms）            |
| 3      | macOS システムの外観設定 | macOS のみ       | `defaults read -g AppleInterfaceStyle` を実行し、macOS のダークモードが有効か確認します |
| 4      | デフォルト              | すべて           | どの方法も成功しなかった場合、ダークテーマにフォールバックします                        |

結果を返した最初の方法が採用されます。検出された値はセッション中キャッシュされるため、後続のテーマ解決（例：`/theme` ダイアログで Auto を再選択）は一貫性を保ちます。

### Auto を使用するタイミング

- **ほとんどのユーザー** — ターミナルの背景が OS の外観と一致している場合や、ターミナルが `COLORFGBG` を設定している / OSC 11 をサポートしている場合、Auto は適切に動作します。
- **tmux / screen ユーザー** — OSC 11 はマルチプレクサを通過しない場合があります。検出は `COLORFGBG` または macOS システムの外観設定にフォールバックします。どちらも利用できない場合は、デフォルトのダークテーマが使用されます。自動検出で誤った結果が得られる場合は、特定のテーマを設定してください。
- **SSH セッション** — 検出はリモート環境に依存します。`COLORFGBG` が転送されておらず、リモートターミナルが OSC 11 に応答しない場合、デフォルトのダークテーマが使用されます。

---

## カスタムカラーテーマ

Qwen Code では、`settings.json` ファイルでカスタムカラーテーマを定義して、独自のテーマを作成できます。これにより、CLI で使用するカラーパレットを完全に制御できます。

### カスタムテーマの定義方法

ユーザー、プロジェクト、またはシステムの `settings.json` ファイルに `customThemes` ブロックを追加します。各カスタムテーマは、一意の名前と一連のカラーキーを持つオブジェクトとして定義します。例：

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

- `name`（`customThemes` オブジェクトのキーと一致している必要があり、文字列である必要があります）
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

色の値には、16 進コード（例：`#FF0000`）**または**標準の CSS 色名（例：`coral`、`teal`、`blue`）のいずれかを使用できます。サポートされている名前の完全なリストについては、[CSS 色名](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) を参照してください。

`customThemes` オブジェクトにエントリを追加することで、複数のカスタムテーマを定義できます。

### ファイルからのテーマの読み込み

`settings.json` でカスタムテーマを定義するだけでなく、`settings.json` にファイルパスを指定して、JSON ファイルから直接テーマを読み込むこともできます。これは、テーマを共有したり、メインの設定から分離して管理する場合に便利です。

ファイルからテーマを読み込むには、`settings.json` の `ui.theme` プロパティをテーマファイルのパスに設定します。

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

テーマファイルは、`settings.json` で定義されたカスタムテーマと同じ構造に従った、有効な JSON ファイルである必要があります。

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

**セキュリティに関する注意:** 安全性のため、Qwen Code はホームディレクトリ内にあるテーマファイルのみを読み込みます。ホームディレクトリ外からテーマを読み込もうとすると、警告が表示され、テーマは読み込まれません。これは、信頼できないソースから悪意のあるテーマファイルが読み込まれるのを防ぐためです。

### カスタムテーマの例

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### カスタムテーマの使用

- Qwen Code で `/theme` コマンドを使用して、カスタムテーマを選択します。カスタムテーマはテーマ選択ダイアログに表示されます。
- または、`settings.json` の `ui` オブジェクトに `"theme": "MyCustomTheme"` を追加して、デフォルトとして設定します。
- カスタムテーマは、ユーザー、プロジェクト、システムレベルで設定でき、他の設定と同様の[設定の優先順位](../configuration/settings)に従います。

## テーマプレビュー

| ダークテーマ   |                                                                                                       プレビュー                                                                                                       | ライトテーマ    |                                                                                                       プレビュー                                                                                                       |
| :------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| ANSI           |           <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />           | ANSI Light      |           <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />           |
| Atom OneDark   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />      | Ayu Light       | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Ayu            | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light   | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Default        |       <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />       | GitHub Light    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Dracula        |       <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />       | Google Code     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| GitHub         | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Xcode           | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |