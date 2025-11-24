# Language コマンド

`/language` コマンドを使用すると、Qwen Code のユーザーインターフェース（UI）と言語モデルの出力の両方に対する言語設定をカスタマイズできます。このコマンドは以下の2つの機能をサポートしています：

1. Qwen Code インターフェースの UI 言語を設定する
2. 言語モデル（LLM）の出力言語を設定する

## UI 言語設定

Qwen Code の UI 言語を変更するには、`ui` サブコマンドを使用します：

```
/language ui [zh-CN|en-US]
```

### 利用可能な UI 言語

- **zh-CN**: 簡体字中国語（简体中文）
- **en-US**: 英語

### 例

```
/language ui zh-CN    # UI 言語を簡体字中国語に設定
/language ui en-US    # UI 言語を英語に設定
```

### UI 言語のサブコマンド

利便性のために、以下のような直接的なサブコマンドも使用できます：

- `/language ui zh-CN` または `/language ui zh` または `/language ui 中文`
- `/language ui en-US` または `/language ui en` または `/language ui english`

## LLMの出力言語設定

言語モデルのレスポンス言語を設定するには、`output`サブコマンドを使用します：

```
/language output <language>
```

このコマンドは、LLMに指定された言語で応答するように指示する言語ルールファイルを生成します。ルールファイルは`~/.qwen/output-language.md`に保存されます。

### 例

```
/language output 中文      # LLMの出力言語を中国語に設定
/language output English   # LLMの出力言語を英語に設定
/language output 日本語    # LLMの出力言語を日本語に設定
```

## 現在の設定を表示

引数なしで使用すると、`/language`コマンドは現在の言語設定を表示します：

```
/language
```

これにより以下が表示されます：

- 現在のUI言語
- 現在のLLM出力言語（設定されている場合）
- 利用可能なサブコマンド

## 注意事項

- UI言語の変更は即時に反映され、すべてのコマンド説明が再読み込みされます
- LLM出力言語の設定は、モデルのコンテキストに自動的に含まれるルールファイルに保存されます
- 追加のUI言語パックをリクエストするには、GitHubでissueを作成してください