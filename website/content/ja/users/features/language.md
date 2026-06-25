# 国際化（i18n）と言語設定

Qwen Code は多言語ワークフローに対応しています。CLI の UI ローカライズ（i18n/l10n）、アシスタントの出力言語の選択、カスタム UI 言語パックの追加が可能です。

## 概要

ユーザー視点から見ると、Qwen Code の「国際化」は複数のレイヤーにわたります。

| 機能 / 設定              | 制御対象                                                               | 保存場所                     |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------- |
| `/language ui`           | ターミナル UI のテキスト（メニュー、システムメッセージ、プロンプト）   | `~/.qwen/settings.json`      |
| `/language output`       | AI の応答言語（UI 翻訳ではなく出力設定）                               | `~/.qwen/output-language.md` |
| カスタム UI 言語パック   | 組み込み UI 翻訳のオーバーライド／拡張                                 | `~/.qwen/locales/*.js`       |

## UI 言語

CLI の UI ローカライズレイヤー（i18n/l10n）です。メニュー、プロンプト、システムメッセージの言語を制御します。

### UI 言語の設定

`/language ui` コマンドを使用します。

```bash
/language ui zh-CN    # Chinese
/language ui en-US    # English
/language ui ru-RU    # Russian
/language ui de-DE    # German
/language ui ja-JP    # Japanese
/language ui pt-BR    # Portuguese (Brazil)
/language ui fr-FR    # French
/language ui ca-ES    # Catalan
```

エイリアスも使用できます。

```bash
/language ui zh       # Chinese
/language ui en       # English
/language ui ru       # Russian
/language ui de       # German
/language ui ja       # Japanese
/language ui pt       # Portuguese
/language ui fr       # French
/language ui ca       # Catalan
```

### 自動検出

初回起動時に、Qwen Code はシステムロケールを検出し、UI 言語を自動的に設定します。

検出の優先順位：

1. `QWEN_CODE_LANG` 環境変数
2. `LANG` 環境変数
3. JavaScript Intl API によるシステムロケール
4. デフォルト：英語

## LLM 出力言語

LLM の出力言語は、入力した質問の言語に関わらず、AI アシスタントが応答する言語を制御します。

### 仕組み

LLM の出力言語は `~/.qwen/output-language.md` にあるルールファイルで制御されます。このファイルは起動時に LLM のコンテキストへ自動的に組み込まれ、指定した言語で応答するよう指示します。

### 自動検出

初回起動時に `output-language.md` ファイルが存在しない場合、Qwen Code はシステムロケールに基づいて自動的に作成します。例：

- システムロケール `zh` → 中国語で応答するルールを作成
- システムロケール `en` → 英語で応答するルールを作成
- システムロケール `ru` → ロシア語で応答するルールを作成
- システムロケール `de` → ドイツ語で応答するルールを作成
- システムロケール `ja` → 日本語で応答するルールを作成
- システムロケール `pt` → ポルトガル語で応答するルールを作成
- システムロケール `fr` → フランス語で応答するルールを作成
- システムロケール `ca` → カタルーニャ語で応答するルールを作成

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

## 設定方法

### 設定ダイアログから

1. `/settings` を実行する
2. 「General」の下にある「Language」を探す
3. 希望する UI 言語を選択する

### 環境変数から

```bash
export QWEN_CODE_LANG=zh
```

これは初回起動時の自動検出に影響します（UI 言語を設定しておらず、`output-language.md` ファイルがまだ存在しない場合）。

## カスタム言語パック

UI 翻訳のカスタム言語パックを `~/.qwen/locales/` に作成できます。

- 例：`~/.qwen/locales/es.js`（スペイン語用）
- 例：`~/.qwen/locales/fr.js`（フランス語用）

ユーザーディレクトリは組み込みの翻訳より優先されます。

> [!tip]
>
> コントリビューション歓迎！組み込み翻訳の改善や新しい言語の追加にご協力ください。
> 具体的な例として、[PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238) を参照してください。

### `zh-TW`（台湾の繁体字中国語）のメンテナンス

`zh-TW` は `zh.js` の OpenCC s2t 変換を自動適用したものでは**ありません**。台湾の語彙に基づいて手動でメンテナンスされた翻訳です。キーを追加・更新する際は、以下の規則に従ってください。

「CI enforced?」列は、違反があった場合に `npm run check-i18n` がビルドを失敗させるかどうかを示します。**No** と記載された行はレビューのみで強制されるスタイルガイダンスです。これは問題のある表現が UI 以外で正当な意味を持つ場合があるためです（`文件` は「ドキュメント」を意味することがあり、`打開` は台湾でも口語的に一般的です）。

| Avoid                 | Use instead           | CI enforced? | Reason                                                                                                                                                                           |
| --------------------- | --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件 (file)           | 檔案                  | No           | Taiwan term for filesystem files (but `文件` can legitimately mean "document")                                                                                                   |
| 服務器 / 服务器       | 伺服器                | Yes          | Taiwan term for "server"                                                                                                                                                         |
| 菜單 / 菜单           | 選單                  | Yes          | Taiwan term for "menu"                                                                                                                                                           |
| 鏈接 / 链接           | 連結                  | Yes          | Taiwan term for "link" (bare `鏈` is fine — e.g. 區塊鏈)                                                                                                                         |
| 打開                  | 開啟                  | No           | Taiwan-preferred verb for "open" (UI); `打開` is colloquially common                                                                                                             |
| 爲 / 啓 / 曆史 / 鏈接 | 為 / 啟 / 歷史 / 連結 | Yes          | Variant Traditional forms from raw OpenCC s2t. Note: `曆` is context-dependent and correct in calendar terms (日曆, 農曆, 西曆); CI only flags the bigram `曆史`, not bare `曆`. |

繁体字中国語のネイティブスピーカーでなく、値を一から作成する必要がある場合は、**未加工の OpenCC `s2t` 出力をそのまま使用しないでください**。デフォルトの s2t プロファイルは台湾では使用されない異体繁体字（爲、啓など）を出力し、中国本土の語彙（服務器、菜單）を書き換えません。`s2twp.json`（簡体字 → 台湾語彙マッピング付き）を出発点として使用し、台湾の中国語話者にレビューを依頼することを推奨します。

`check-i18n` スクリプト（CI では `npm run check-i18n` で実行）は、CI で強制されているいずれかの文字列が `zh-TW` の値に含まれていた場合にビルドを失敗させます。詳細なパターンリストは `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS` を参照してください。翻訳上の理由で CI 禁止文字列を含める必要がある場合は、そのキーを同ファイルの `ZH_TW_ALLOWED_EXCEPTIONS` に簡単な説明とともに追加してください。

> [!note]
>
> このチェックは単純な部分文字列マッチングを使用しており、中国語の単語境界を認識しません。そのため、二文字パターンが複合語の境界をまたいで誤検知する可能性があります。例えば、`區塊鏈接口`（= `區塊鏈` + `接口`）には部分文字列 `鏈接` が含まれますが、どちらの単語も誤りではありません。このような予期しない CI の失敗が発生した場合は、パターンを削除するのではなく、その翻訳キーを `ZH_TW_ALLOWED_EXCEPTIONS` に追加してください。

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
- `/language output <language>` - LLM の出力言語を設定
- `/settings` - 設定ダイアログを開く
