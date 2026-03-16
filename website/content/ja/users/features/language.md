# 国際化（i18n）と言語

Qwen Code は多言語ワークフロー向けに設計されています。CLI における UI のローカライズ（i18n/l10n）、アシスタントの出力言語の選択、およびカスタム UI 言語パックの利用が可能です。

## 概要

ユーザーの視点から見ると、Qwen Code の「国際化」は複数のレイヤーにまたがります。

| 機能／設定             | 制御対象                                                               | 保存場所                     |
| ---------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| `/language ui`         | ターミナル UI のテキスト（メニュー、システムメッセージ、プロンプトなど） | `~/.qwen/settings.json`      |
| `/language output`     | AI の応答言語（UI の翻訳ではなく、出力に関するユーザーの好み）           | `~/.qwen/output-language.md` |
| カスタム UI 言語パック | 組み込み UI 翻訳を上書きまたは拡張                                     | `~/.qwen/locales/*.js`       |

## UI 言語

これは CLI の UI ローカライゼーション層（i18n/l10n）です。メニュー、プロンプト、システムメッセージの言語を制御します。

### UI 言語の設定

`/language ui` コマンドを使用します：

```bash
/language ui zh-CN    # 中国語
/language ui en-US    # 英語
/language ui ru-RU    # ロシア語
/language ui de-DE    # ドイツ語
/language ui ja-JP    # 日本語
```

エイリアスもサポートされています：

```bash
/language ui zh       # 中国語
/language ui en       # 英語
/language ui ru       # ロシア語
/language ui de       # ドイツ語
/language ui ja       # 日本語
```

### 自動検出

初回起動時、Qwen Code はシステムのロケールを検出し、UI 言語を自動的に設定します。

検出の優先順位：

1. `QWEN_CODE_LANG` 環境変数
2. `LANG` 環境変数
3. JavaScript Intl API を介したシステムロケール
4. デフォルト：英語

## LLM 出力言語

LLM 出力言語は、ユーザーが質問を入力する言語に関係なく、AI アシスタントが応答する言語を制御します。

### 動作の仕組み

LLM の出力言語は、`~/.qwen/output-language.md` にあるルールファイルで制御されます。このファイルは起動時に自動的に LLM のコンテキストに含められ、指定された言語で応答するよう指示します。

### 自動検出

初回起動時に `output-language.md` ファイルが存在しない場合、Qwen Code はシステムのロケールに基づいて自動的にファイルを作成します。たとえば：

- システムロケールが `zh` の場合：中国語での応答を指定するルールを作成
- システムロケールが `en` の場合：英語での応答を指定するルールを作成
- システムロケールが `ru` の場合：ロシア語での応答を指定するルールを作成
- システムロケールが `de` の場合：ドイツ語での応答を指定するルールを作成
- システムロケールが `ja` の場合：日本語での応答を指定するルールを作成

### 手動設定

`/language output <言語>` を使用して出力言語を変更します。

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

任意の言語名を指定できます。LLM はその言語で応答するよう指示されます。

> [!note]
>
> 出力言語を変更した後は、変更を有効にするために Qwen Code を再起動してください。

### ファイルの場所

```
~/.qwen/output-language.md
```

## 設定

### 設定ダイアログ経由での設定

1. `/settings` を実行します。
2. 「一般」セクション内の「言語」を見つけます。
3. 希望する UI 言語を選択します。

### 環境変数経由での設定

```bash
export QWEN_CODE_LANG=zh
```

これは初回起動時の自動検出に影響を与えます（UI 言語が未設定で、かつ `output-language.md` ファイルがまだ存在しない場合）。

## カスタム言語パック

UI の翻訳には、`~/.qwen/locales/` ディレクトリ内にカスタム言語パックを作成できます。

- 例：スペイン語用 `~/.qwen/locales/es.js`
- 例：フランス語用 `~/.qwen/locales/fr.js`

ユーザーのディレクトリ内の翻訳は、組み込みの翻訳よりも優先されます。

> [!tip]
>
> 翻訳への貢献を歓迎します！ 組み込み翻訳の改善や新規言語の追加をご希望の場合。
> 具体的な例については、[PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238) をご参照ください。

### 言語パックのフォーマット

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... その他の翻訳
};
```

## 関連コマンド

- `/language` — 現在の言語設定を表示
- `/language ui [lang]` — UI の言語を設定
- `/language output <language>` — LLM の出力言語を設定
- `/settings` — 設定ダイアログを開く