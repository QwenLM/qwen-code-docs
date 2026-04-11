# 国際化 (i18n) と言語

Qwen Code は多言語ワークフローに対応しています。CLI での UI ローカライゼーション (i18n/l10n) のサポート、アシスタントの出力言語の選択、カスタム UI 言語パックの追加が可能です。

## 概要

ユーザー視点では、Qwen Code の「国際化」は複数のレイヤーにまたがります。

| 機能 / 設定 | 制御対象 | 保存場所 |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------- |
| `/language ui` | ターミナル UI のテキスト（メニュー、システムメッセージ、プロンプト） | `~/.qwen/settings.json` |
| `/language output` | AI の応答言語（UI 翻訳ではなく出力設定） | `~/.qwen/output-language.md` |
| カスタム UI 言語パック | 組み込み UI 翻訳の上書き・拡張 | `~/.qwen/locales/*.js` |

## UI 言語

これは CLI の UI ローカライゼーションレイヤー (i18n/l10n) です。メニュー、プロンプト、システムメッセージの言語を制御します。

### UI 言語の設定

`/language ui` コマンドを使用します。

```bash
/language ui zh-CN    # Chinese
/language ui en-US    # English
/language ui ru-RU    # Russian
/language ui de-DE    # German
/language ui ja-JP    # Japanese
```

エイリアスもサポートされています。

```bash
/language ui zh       # Chinese
/language ui en       # English
/language ui ru       # Russian
/language ui de       # German
/language ui ja       # Japanese
```

### 自動検出

初回起動時、Qwen Code はシステムのロケールを検出し、UI 言語を自動的に設定します。

検出の優先順位:

1. `QWEN_CODE_LANG` 環境変数
2. `LANG` 環境変数
3. JavaScript Intl API によるシステムロケール
4. デフォルト: 英語

## LLM 出力言語

LLM 出力言語は、質問を入力した言語に関係なく、AI アシスタントが応答する言語を制御します。

### 動作の仕組み

LLM 出力言語は `~/.qwen/output-language.md` のルールファイルで制御されます。このファイルは起動時に LLM のコンテキストに自動的に組み込まれ、指定された言語で応答するよう指示します。

### 自動検出

初回起動時、`output-language.md` ファイルが存在しない場合、Qwen Code はシステムのロケールに基づいて自動的にファイルを作成します。例:

- システムロケール `zh` の場合、中国語で応答するルールを作成
- システムロケール `en` の場合、英語で応答するルールを作成
- システムロケール `ru` の場合、ロシア語で応答するルールを作成
- システムロケール `de` の場合、ドイツ語で応答するルールを作成
- システムロケール `ja` の場合、日本語で応答するルールを作成

### 手動設定

`/language output <language>` を使用して変更します。

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

任意の言語名を指定できます。LLM はその言語で応答するよう指示されます。

> [!note]
>
> 出力言語を変更した後は、変更を反映させるために Qwen Code を再起動してください。

### ファイルの場所

```
~/.qwen/output-language.md
```

## 設定

### 設定ダイアログから

1. `/settings` を実行
2. 「General」配下の「Language」を検索
3. 希望する UI 言語を選択

### 環境変数から

```bash
export QWEN_CODE_LANG=zh
```

これは初回起動時の自動検出に影響します（UI 言語が未設定で、かつ `output-language.md` ファイルがまだ存在しない場合）。

## カスタム言語パック

UI 翻訳用に、`~/.qwen/locales/` にカスタム言語パックを作成できます。

- 例: スペイン語用の `~/.qwen/locales/es.js`
- 例: フランス語用の `~/.qwen/locales/fr.js`

ユーザーディレクトリの設定は、組み込みの翻訳よりも優先されます。

> [!tip]
>
> コントリビューションを歓迎します！組み込み翻訳の改善や新言語の追加にご協力ください。
> 具体的な例については、[PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238) を参照してください。

### 言語パックの形式

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... more translations
};
```

## 関連コマンド

- `/language` - 現在の言語設定を表示
- `/language ui [lang]` - UI 言語を設定
- `/language output <language>` - LLM 出力言語を設定
- `/settings` - 設定ダイアログを開く