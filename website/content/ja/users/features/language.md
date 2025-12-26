# 国際化 (i18n) と言語

Qwen Code は多言語ワークフロー向けに構築されています。CLI での UI ローカライズ (i18n/l10n) をサポートし、アシスタントの出力言語を選択でき、カスタム UI 言語パックも使用できます。

## 概要

ユーザーの視点から見ると、Qwen Code の「国際化」は複数のレイヤーにまたがります。

| 機能 / 設定 | 制御対象 | 保存場所 |
| --- | --- | --- |
| `/language ui` | ターミナル UI テキスト (メニュー、システムメッセージ、プロンプト) | `~/.qwen/settings.json` |
| `/language output` | AI が応答する言語 (UI 翻訳ではなく出力の設定) | `~/.qwen/output-language.md` |
| カスタム UI 言語パック | 組み込み UI 翻訳の上書き/拡張 | `~/.qwen/locales/*.js` |

## UI言語

これはCLIのUIローカライゼーション層（i18n/l10n）です。メニュー、プロンプト、システムメッセージの言語を制御します。

### UI言語の設定

`/language ui` コマンドを使用してください：

```bash
/language ui zh-CN    # 中国語
/language ui en-US    # 英語
/language ui ru-RU    # ロシア語
/language ui de-DE    # ドイツ語
```

エイリアスもサポートされています：

```bash
/language ui zh       # 中国語
/language ui en       # 英語
/language ui ru       # ロシア語
/language ui de       # ドイツ語
```

### 自動検出

初回起動時に、Qwen Codeはシステムロケールを検出し、UI言語を自動的に設定します。

検出優先順位：

1. `QWEN_CODE_LANG` 環境変数
2. `LANG` 環境変数
3. JavaScript Intl APIによるシステムロケール
4. デフォルト：英語

## LLM出力言語

LLM出力言語は、質問を入力した言語に関係なく、AIアシスタントがどの言語で応答するかを制御します。

### 動作原理

LLM の出力言語は、`~/.qwen/output-language.md` にあるルールファイルによって制御されます。このファイルは、起動時に LLM のコンテキストに自動的に含まれ、指定された言語で応答するように指示します。

### 自動検出

初回起動時に `output-language.md` ファイルが存在しない場合、Qwen Code はシステムのロケールに基づいて自動的にファイルを作成します。例：

- システムロケール `zh` の場合、中国語での応答用のルールが作成されます
- システムロケール `en` の場合、英語での応答用のルールが作成されます
- システムロケール `ru` の場合、ロシア語での応答用のルールが作成されます
- システムロケール `de` の場合、ドイツ語での応答用のルールが作成されます

### 手動設定

`/language output <language>` を使用して変更します：

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

任意の言語名を使用できます。LLM はその言語で応答するように指示されます。

> [!note]
>
> 出力言語を変更した後、変更を有効にするために Qwen Code を再起動してください。

### ファイルの場所

```
~/.qwen/output-language.md
```

## 設定

### 設定ダイアログ経由

1. `/settings` を実行する
2. 一般設定の「言語」を見つける
3. 好きな UI 言語を選択する

### 環境変数経由

```bash
export QWEN_CODE_LANG=zh
```

これは初回起動時の自動検出に影響します（UI 言語が設定されておらず、`output-language.md` ファイルがまだ存在しない場合）。

## カスタム言語パック

UI の翻訳については、`~/.qwen/locales/` にカスタム言語パックを作成できます。

- 例: スペイン語用 `~/.qwen/locales/es.js`
- 例: フランス語用 `~/.qwen/locales/fr.js`

ユーザーディレクトリは、組み込みの翻訳より優先されます。

> [!tip]
>
> ご協力をお待ちしています！組み込みの翻訳を改善したり、新しい言語を追加したい場合。
> 具体的な例については、[PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238) を参照してください。

### 言語パックの形式

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... その他の翻訳
};
```

## 関連コマンド

- `/language` - 現在の言語設定を表示
- `/language ui [lang]` - UI言語を設定
- `/language output <language>` - LLM出力言語を設定
- `/settings` - 設定ダイアログを開く