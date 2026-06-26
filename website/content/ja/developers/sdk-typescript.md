# TypeScript SDK

## @qwen-code/sdk

Qwen Code にプログラムからアクセスするための、最小限の実験的な TypeScript SDK です。

機能リクエストや issue / PR はお気軽に送ってください。

## インストール

```bash
npm install @qwen-code/sdk
```

## 必要条件

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0（安定版）がインストールされ、PATH が通っていること

> [!note]
> **nvm ユーザーへの注意**: nvm を使用して Node.js のバージョンを管理している場合、SDK が Qwen Code の実行ファイルを自動検出できない可能性があります。`pathToQwenExecutable` オプションに `qwen` バイナリのフルパスを明示的に設定してください。

## クイックスタート

```typescript
import { query } from '@qwen-code/sdk';

// シングルターンのクエリ
const result = query({
  prompt: '今いるディレクトリにはどんなファイルがありますか？',
  options: {
    cwd: '/path/to/project',
  },
});

// メッセージを反復処理
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Result:', message.result);
  }
}
```

## API リファレンス

### `query(config)`

Qwen Code との新しいクエリセッションを作成します。

#### パラメータ

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - 送信するプロンプト。シングルターンのクエリには文字列、マルチターンの会話には非同期イテラブルを使用します。
- `options`: `QueryOptions` - クエリセッションの設定オプション。

#### QueryOptions

| オプション                 | 型                                             | デフォルト         | 説明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ---------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                      | `string`                                       | `process.cwd()`    | クエリセッションの作業ディレクトリ。ファイル操作やコマンドが実行されるコンテキストを決定します。                                                                                                                                                                                                                                                                                                                                                                                    |
| `model`                    | `string`                                       | -                  | 使用する AI モデル（例: `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`）。`OPENAI_MODEL` および `QWEN_MODEL` 環境変数より優先されます。                                                                                                                                                                                                                                                                                                                                                       |
| `pathToQwenExecutable`     | `string`                                       | 自動検出           | Qwen Code 実行ファイルへのパス。複数の形式に対応: `'qwen'`（PATH からのネイティブバイナリ）、`'/path/to/qwen'`（明示的なパス）、`'/path/to/cli.js'`（Node.js バンドル）、`'node:/path/to/cli.js'`（Node.js ランタイムを強制）、`'bun:/path/to/cli.js'`（Bun ランタイムを強制）。未指定の場合、以下から自動検出: `QWEN_CODE_CLI_PATH` 環境変数、`~/.volta/bin/qwen`、`~/.npm-global/bin/qwen`、`/usr/local/bin/qwen`、`~/.local/bin/qwen`、`~/node_modules/.bin/qwen`、`~/.yarn/bin/qwen`。 |
| `permissionMode`           | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`        | ツール実行の承認を制御するパーミッションモード。詳細は [パーミッションモード](#permission-modes) を参照。                                                                                                                                                                                                                                                                                                                                                                               |
| `canUseTool`               | `CanUseTool`                                   | -                  | ツール実行承認のためのカスタムパーミッションハンドラ。ツールが確認を必要とするときに呼び出されます。60 秒以内に応答しないと自動拒否されます。[カスタムパーミッションハンドラ](#custom-permission-handler) を参照。                                                                                                                                                                                                                                                                |
| `env`                      | `Record<string, string>`                       | -                  | Qwen Code プロセスに渡す環境変数。現在のプロセス環境とマージされます。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `systemPrompt`             | `string \| QuerySystemPromptPreset`            | -                  | メインセッションのシステムプロンプト設定。文字列を使用すると組み込みの Qwen Code システムプロンプトを完全に上書きし、プリセットオブジェクトを使用すると組み込みプロンプトを維持しつつ追加の指示を付け加えます。                                                                                                                                                                                                                                   |
| `mcpServers`               | `Record<string, McpServerConfig>`              | -                  | 接続する MCP（Model Context Protocol）サーバー。外部サーバー（stdio/SSE/HTTP）と SDK 組み込みサーバーをサポート。外部サーバーは `command`、`args`、`url`、`httpUrl` などのトランスポートオプションで設定します。SDK サーバーは `{ type: 'sdk', name: string, instance: Server }` を使用します。                                                                                                                                                                    |
| `abortController`          | `AbortController`                              | -                  | クエリセッションをキャンセルするコントローラ。`abortController.abort()` を呼び出すとセッションを終了しリソースをクリーンアップします。                                                                                                                                                                                                                                                                                                                                                    |
| `debug`                    | `boolean`                                      | `false`            | デバッグモードを有効にし、CLI プロセスからの詳細ログを出力します。                                                                                                                                                                                                                                                                                                                                                                                                    |
| `maxSessionTurns`          | `number`                                       | `-1`（無制限）     | セッションが自動終了するまでの最大会話ターン数。1 ターンはユーザーメッセージとアシスタント応答で構成されます。                                                                                                                                                                                                                                                                                                                                                           |
| `coreTools`                | `string[]`                                     | -                  | レガシーな `coreTools` / CLI `--core-tools` 許可リストのセマンティクスを使用します。指定された場合、一致するコアツールのみがセッションに登録されます。これは `permissions.allow`（ツール呼び出しを自動承認するが、ツール登録は制限しない）とは別です。例: `['read_file', 'edit', 'run_shell_command']`。                                                                                                                            |
| `excludeTools`             | `string[]`                                     | -                  | settings.json の `permissions.deny` に相当します。除外されたツールは即座にパーミッションエラーを返します。他のすべてのパーミッション設定より優先されます。ツール名のエイリアスやパターンマッチングをサポート: ツール名（`'write_file'`）、シェルコマンドのプレフィックス（`'Bash(rm *)'`）、パスパターン（`'Read(.env)'`, `'Edit(/src/**)'`）。                                                                                                                        |
| `allowedTools`             | `string[]`                                     | -                  | settings.json の `permissions.allow` に相当します。一致するツールは `canUseTool` コールバックをバイパスし自動実行されます。ツールが確認を必要とする場合にのみ適用されます。`excludeTools` と同じパターンマッチングをサポート。例: `['Bash(git status)', 'Bash(npm test)']`。                                                                                                                                                                                                             |
| `authType`                 | `'openai' \| 'qwen-oauth'`                     | `'openai'`         | AI サービスの認証タイプ。Qwen OAuth の無料枠は 2026-04-15 に廃止されました。新しい SDK セットアップでは OpenAI 互換の認証または他のサポートされているプロバイダを使用してください。                                                                                                                                                                                                                                                    |
| `agents`                   | `SubagentConfig[]`                             | -                  | セッション中に呼び出し可能なサブエージェントの設定。サブエージェントは特定のタスクやドメインに特化した AI エージェントです。                                                                                                                                                                                                                                                                                                                                             |
| `includePartialMessages`   | `boolean`                                      | `false`            | `true` に設定すると、SDK は生成中の不完全なメッセージを出力し、AI の応答をリアルタイムでストリーミングできるようにします。                                                                                                                                                                                                                                                                                                                                                             |
| `resume`                   | `string`                                       | -                  | セッション ID を指定して以前のセッションを再開します。CLI の `--resume` フラグと同等です。                                                                                                                                                                                                                                                                                                                                                                                         |
| `sessionId`               | `string`                                       | -                  | 新しいセッションにセッション ID を指定します。履歴を再開せずに SDK と CLI が同じ ID を使用することを保証します。CLI の `--session-id` フラグと同等です。                                                                                                                                                                                                                                                                                                                             |

> [!note]
> `coreTools` では `Read`、`Edit`、`Bash` のようなエイリアスも使用できますが、`Bash(git *)` のような呼び出し指定子は削除されます。`coreTools` はツールの登録を制限するものであり、呼び出しパターンを制限するものではありません。

### タイムアウト

SDK は以下のデフォルトタイムアウトを適用します。

| タイムアウト       | デフォルト | 説明                                                                                                                                          |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`      | 1 分       | `canUseTool` コールバックの最大応答時間。超過するとツールリクエストは自動拒否されます。                                                       |
| `mcpRequest`      | 1 分       | SDK MCP ツール呼び出しの完了までの最大時間。                                                                                                  |
| `controlRequest`  | 1 分       | `initialize()`、`setModel()`、`setPermissionMode()`、`getContextUsage()`、`interrupt()` などの制御操作の完了までの最大時間。                   |
| `streamClose`     | 1 分       | マルチターンモードで SDK MCP サーバーを使用する際、CLI の stdin を閉じる前に初期化が完了するのを待つ最大時間。                                |

これらのタイムアウトは `timeout` オプションでカスタマイズできます。

```typescript
const query = qwen.query('プロンプト', {
  timeout: {
    canUseTool: 60000, // パーミッションコールバック 60 秒
    mcpRequest: 600000, // MCP ツール呼び出し 10 分
    controlRequest: 60000, // 制御リクエスト 60 秒
    streamClose: 15000, // ストリームクローズ待機 15 秒
  },
});
```

### メッセージタイプ

SDK は異なるメッセージタイプを識別するための型ガードを提供します。

```typescript
import {
  isSDKUserMessage,
  isSDKAssistantMessage,
  isSDKSystemMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage,
} from '@qwen-code/sdk';

for await (const message of result) {
  if (isSDKAssistantMessage(message)) {
    // アシスタントメッセージを処理
  } else if (isSDKResultMessage(message)) {
    // 結果メッセージを処理
  }
}
```

### Query インスタンスのメソッド

`query()` が返す `Query` インスタンスにはいくつかのメソッドがあります。

```typescript
const q = query({ prompt: 'こんにちは', options: {} });

// セッション ID を取得
const sessionId = q.getSessionId();

// クローズ状態の確認
const closed = q.isClosed();

// 現在の操作を中断
await q.interrupt();

// セッション中にパーミッションモードを変更
await q.setPermissionMode('yolo');

// セッション中にモデルを変更
await q.setModel('qwen-max');

// コンテキストウィンドウの使用状況内訳を取得（カテゴリ別トークン数）
const usage = await q.getContextUsage();
// true を渡すと、アイテムごとの詳細を表示するヒントを与える
const detail = await q.getContextUsage(true);

// セッションを閉じる
await q.close();
```

## パーミッションモード

SDK はツール実行を制御するための異なるパーミッションモードをサポートしています。

- **`default`**: 書き込みツールは `canUseTool` コールバックまたは `allowedTools` で承認されない限り拒否されます。読み取り専用ツールは確認なしで実行されます。
- **`plan`**: すべての書き込みツールをブロックし、AI にまず計画を提示するよう指示します。
- **`auto-edit`**: 編集ツール（`edit`、`write_file`、`notebook_edit`）を自動承認し、その他のツールは確認が必要です。
- **`yolo`**: すべてのツールが確認なしで自動実行されます。

### パーミッションの優先順位チェーン

決定の優先順位（高い順）: `deny` > `ask` > `allow` > _（デフォルト/インタラクティブモード）_

最初に一致したルールが適用されます。

1. `excludeTools` / `permissions.deny` - ツールを完全にブロック（パーミッションエラーを返す）
2. `permissions.ask` - 常にユーザーの確認を要求
3. `permissionMode: 'plan'` - 読み取り専用以外のすべてのツールをブロック
4. `permissionMode: 'yolo'` - すべてのツールを自動承認
5. `allowedTools` / `permissions.allow` - 一致するツールを自動承認
6. `canUseTool` コールバック - カスタム承認ロジック（指定された場合、許可されたツールでは呼び出されない）
7. デフォルト動作 - SDK モードでは自動拒否（書き込みツールは明示的な承認が必要）

## 使用例

### マルチターン会話

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'hello.txt ファイルを作成してください' },
    parent_tool_use_id: null,
  };

  // 何らかの条件やユーザー入力を待つ
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: '今度はそのファイルを読み込んでください' },
    parent_tool_use_id: null,
  };
}

const result = query({
  prompt: generateMessages(),
  options: {
    permissionMode: 'auto-edit',
  },
});

for await (const message of result) {
  console.log(message);
}
```

### カスタムパーミッションハンドラ

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // 読み取り操作はすべて許可
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 書き込み操作はユーザーに確認（実際のアプリでは）
  const userApproved = await promptUser(`${toolName} を許可しますか？`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'ユーザーが操作を拒否しました' };
};

const result = query({
  prompt: '新しいファイルを作成してください',
  options: {
    canUseTool,
  },
});
```

### 外部 MCP サーバーとの連携

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'MCP サーバーのカスタムツールを使ってください',
  options: {
    mcpServers: {
      'my-server': {
        command: 'node',
        args: ['path/to/mcp-server.js'],
        env: { PORT: '3000' },
      },
    },
  },
});
```

### システムプロンプトの上書き

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: '1文で挨拶してください。',
  options: {
    systemPrompt: 'あなたは簡潔なアシスタントです。ちょうど1文で答えてください。',
  },
});
```

### 組み込みシステムプロンプトへの追記

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: '現在のディレクトリをレビューしてください。',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: '簡潔にし、具体的な発見に焦点を当ててください。',
    },
  },
});
```
### SDK組み込みMCPサーバー

SDKは、`tool`と`createSdkMcpServer`を提供し、SDKアプリケーションと同じプロセス内で動作するMCPサーバーを作成します。これは、別のサーバープロセスを実行せずに、AIにカスタムツールを公開したい場合に便利です。

#### `tool(name, description, inputSchema, handler)`

Zodスキーマの型推論を使用してツール定義を作成します。

| パラメータ      | 型                                 | 説明                                                               |
| -------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `name`        | `string`                           | ツール名（1〜64文字、英字で始まり、英数字とアンダースコア）         |
| `description` | `string`                           | ツールの動作を説明する人間が読める形式の説明                         |
| `inputSchema` | `ZodRawShape`                      | ツールの入力パラメータを定義するZodスキーマオブジェクト              |
| `handler`     | `(args, extra) => Promise<Result>` | ツールを実行し、MCPコンテンツブロックを返す非同期関数                |

ハンドラーは以下の構造を持つ`CallToolResult`オブジェクトを返す必要があります：

```typescript
{
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; uri: string; mimeType?: string; text?: string }
  >;
  isError?: boolean;
}
```

#### `createSdkMcpServer(options)`

SDK組み込みのMCPサーバーインスタンスを作成します。

| オプション | 型                       | デフォルト   | 説明                                |
| ---------- | ------------------------ | ------------ | ----------------------------------- |
| `name`    | `string`                 | 必須        | MCPサーバーの一意の名前              |
| `version` | `string`                 | `'1.0.0'`   | サーバーバージョン                    |
| `tools`   | `SdkMcpToolDefinition[]` | -            | `tool()`で作成されたツールの配列      |

`mcpServers`オプションに直接渡すことができる`McpSdkServerConfigWithInstance`オブジェクトを返します。

#### 例

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Zodスキーマでツールを定義
const calculatorTool = tool(
  'calculate_sum',
  '2つの数値を加算',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// MCPサーバーを作成
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// クエリでサーバーを使用
const result = query({
  prompt: 'What is 42 + 17?',
  options: {
    permissionMode: 'yolo',
    mcpServers: {
      calculator: server,
    },
  },
});

for await (const message of result) {
  console.log(message);
}
```

### クエリの中断

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: '長時間実行タスク...',
  options: {
    abortController,
  },
});

// 5秒後に中断
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('クエリが中断されました');
  } else {
    throw error;
  }
}
```

## エラーハンドリング

SDKは、中断されたクエリを処理するための`AbortError`クラスを提供します：

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... クエリ操作
} catch (error) {
  if (isAbortError(error)) {
    // 中断の処理
  } else {
    // その他のエラーの処理
  }
}
```