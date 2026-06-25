# Typescript SDK

## @qwen-code/sdk

Qwen Code へのプログラムアクセスを提供する最小限の実験的な TypeScript SDK です。

機能リクエスト・Issue・PR はお気軽にどうぞ。

## インストール

```bash
npm install @qwen-code/sdk
```

## 要件

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stable) がインストール済みで PATH から利用可能であること

> **nvm ユーザーへの注意**: nvm で Node.js バージョンを管理している場合、SDK が Qwen Code の実行ファイルを自動検出できないことがあります。その場合は `pathToQwenExecutable` オプションに `qwen` バイナリのフルパスを明示的に指定してください。

## クイックスタート

```typescript
import { query } from '@qwen-code/sdk';

// シングルターンクエリ
const result = query({
  prompt: 'What files are in the current directory?',
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

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - 送信するプロンプト。シングルターンクエリには文字列を、マルチターン会話には非同期イテラブルを使用します。
- `options`: `QueryOptions` - クエリセッションの設定オプション。

#### QueryOptions

| オプション               | 型                                             | デフォルト       | 説明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | クエリセッションの作業ディレクトリ。ファイル操作やコマンドが実行されるコンテキストを決定します。                                                                                                                                                                                                                                                                                                                                                                                       |
| `model`                  | `string`                                       | -                | 使用する AI モデル（例: `'qwen-max'`、`'qwen-plus'`、`'qwen-turbo'`）。`OPENAI_MODEL` および `QWEN_MODEL` 環境変数より優先されます。                                                                                                                                                                                                                                                                                                                                                    |
| `pathToQwenExecutable`   | `string`                                       | 自動検出         | Qwen Code 実行ファイルへのパス。複数の形式をサポート: `'qwen'`（PATH からのネイティブバイナリ）、`'/path/to/qwen'`（明示的なパス）、`'/path/to/cli.js'`（Node.js バンドル）、`'node:/path/to/cli.js'`（Node.js ランタイムを強制）、`'bun:/path/to/cli.js'`（Bun ランタイムを強制）。未指定の場合、次の順で自動検出: `QWEN_CODE_CLI_PATH` 環境変数、`~/.volta/bin/qwen`、`~/.npm-global/bin/qwen`、`/usr/local/bin/qwen`、`~/.local/bin/qwen`、`~/node_modules/.bin/qwen`、`~/.yarn/bin/qwen`。 |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | ツール実行承認を制御するパーミッションモード。詳細は [パーミッションモード](#permission-modes) を参照。                                                                                                                                                                                                                                                                                                                                                                                 |
| `canUseTool`             | `CanUseTool`                                   | -                | ツール実行承認のカスタムパーミッションハンドラ。ツールが確認を必要とする際に呼び出されます。60 秒以内に応答しない場合、リクエストは自動的に拒否されます。詳細は [カスタムパーミッションハンドラ](#custom-permission-handler) を参照。                                                                                                                                                                                                                                                   |
| `env`                    | `Record<string, string>`                       | -                | Qwen Code プロセスに渡す環境変数。現在のプロセス環境とマージされます。                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | メインセッションのシステムプロンプト設定。文字列を指定すると組み込みの Qwen Code システムプロンプトを完全に上書きし、プリセットオブジェクトを指定すると組み込みプロンプトを維持したうえで追加の指示を付加します。                                                                                                                                                                                                                                                                      |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | 接続する MCP (Model Context Protocol) サーバー。外部サーバー（stdio/SSE/HTTP）と SDK 組み込みサーバーをサポート。外部サーバーは `command`、`args`、`url`、`httpUrl` などのトランスポートオプションで設定します。SDK サーバーは `{ type: 'sdk', name: string, instance: Server }` を使用します。                                                                                                                                                                                       |
| `abortController`        | `AbortController`                              | -                | クエリセッションをキャンセルするコントローラ。`abortController.abort()` を呼び出してセッションを終了しリソースをクリーンアップします。                                                                                                                                                                                                                                                                                                                                                  |
| `debug`                  | `boolean`                                      | `false`          | CLI プロセスの詳細ログを出力するデバッグモードを有効にします。                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `maxSessionTurns`        | `number`                                       | `-1` (無制限)    | セッションが自動終了するまでの最大会話ターン数。1 ターンはユーザーメッセージとアシスタントの応答で構成されます。                                                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | レガシーの `coreTools` / CLI `--core-tools` 許可リストのセマンティクスを使用します。指定した場合、一致するコアツールのみがセッションに登録されます。これはツール呼び出しを自動承認するが登録を制限しない `permissions.allow` とは別の設定です。例: `['read_file', 'edit', 'run_shell_command']`。                                                                                                                                                                                      |
| `excludeTools`           | `string[]`                                     | -                | settings.json の `permissions.deny` に相当します。除外されたツールは即座にパーミッションエラーを返します。他のすべてのパーミッション設定より優先されます。ツール名エイリアスとパターンマッチングをサポート: ツール名（`'write_file'`）、シェルコマンドプレフィックス（`'Bash(rm *)'`）、パスパターン（`'Read(.env)'`、`'Edit(/src/**)'`）。                                                                                                                                           |
| `allowedTools`           | `string[]`                                     | -                | settings.json の `permissions.allow` に相当します。一致するツールは `canUseTool` コールバックをバイパスして自動実行されます。ツールが確認を必要とする場合にのみ適用されます。`excludeTools` と同じパターンマッチングをサポート。例: `['Bash(git status)', 'Bash(npm test)']`。                                                                                                                                                                                                         |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | AI サービスの認証タイプ。Qwen OAuth 無料プランは 2026-04-15 に廃止されました。新しい SDK セットアップでは OpenAI 互換認証または他のサポートされるプロバイダーを使用してください。                                                                                                                                                                                                                                                                                                        |
| `agents`                 | `SubagentConfig[]`                             | -                | セッション中に呼び出せるサブエージェントの設定。サブエージェントは特定のタスクやドメインに特化した AI エージェントです。                                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | `true` の場合、SDK は生成中の不完全なメッセージを送出し、AI の応答をリアルタイムでストリーミングできます。                                                                                                                                                                                                                                                                                                                                                                              |
| `resume`                 | `string`                                       | -                | セッション ID を指定して以前のセッションを再開します。CLI の `--resume` フラグに相当します。                                                                                                                                                                                                                                                                                                                                                                                             |
| `sessionId`              | `string`                                       | -                | 新しいセッションのセッション ID を指定します。履歴を再開せずに SDK と CLI が同じ ID を使用することを保証します。CLI の `--session-id` フラグに相当します。                                                                                                                                                                                                                                                                                                                               |

> [!note]
> `coreTools` では `Read`、`Edit`、`Bash` などのエイリアスも機能しますが、`Bash(git *)` のような呼び出し指定子は除去されます。`coreTools` はツールの登録を制限するものであり、呼び出しパターンを制限するものではありません。

### タイムアウト

SDK は以下のデフォルトタイムアウトを適用します:

| タイムアウト     | デフォルト | 説明                                                                                                                                              |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 分       | `canUseTool` コールバックが応答するまでの最大時間。超過した場合、ツールリクエストは自動的に拒否されます。                                         |
| `mcpRequest`     | 1 分       | SDK MCP ツール呼び出しが完了するまでの最大時間。                                                                                                  |
| `controlRequest` | 1 分       | `initialize()`、`setModel()`、`setPermissionMode()`、`getContextUsage()`、`interrupt()` などの制御操作が完了するまでの最大時間。                  |
| `streamClose`    | 1 分       | SDK MCP サーバーを使用するマルチターンモードで、CLI stdin を閉じる前に初期化完了を待つ最大時間。                                                  |

`timeout` オプションでこれらのタイムアウトをカスタマイズできます:

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 seconds for permission callback
    mcpRequest: 600000, // 10 minutes for MCP tool calls
    controlRequest: 60000, // 60 seconds for control requests
    streamClose: 15000, // 15 seconds for stream close wait
  },
});
```

### メッセージタイプ

SDK はさまざまなメッセージタイプを識別するための型ガードを提供します:

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

### Query インスタンスメソッド

`query()` が返す `Query` インスタンスにはいくつかのメソッドがあります:

```typescript
const q = query({ prompt: 'Hello', options: {} });

// セッション ID を取得
const sessionId = q.getSessionId();

// クローズ済みかどうかを確認
const closed = q.isClosed();

// 現在の操作を中断
await q.interrupt();

// セッション中にパーミッションモードを変更
await q.setPermissionMode('yolo');

// セッション中にモデルを変更
await q.setModel('qwen-max');

// コンテキストウィンドウの使用状況（カテゴリ別トークン数）を取得
const usage = await q.getContextUsage();
// true を渡すと項目ごとの詳細表示をヒント
const detail = await q.getContextUsage(true);

// セッションをクローズ
await q.close();
```

## パーミッションモード

SDK はツール実行を制御するためのさまざまなパーミッションモードをサポートします:

- **`default`**: 書き込みツールは `canUseTool` コールバックまたは `allowedTools` での承認がない限り拒否されます。読み取り専用ツールは確認なしで実行されます。
- **`plan`**: すべての書き込みツールをブロックし、AI にまず計画を提示するよう指示します。
- **`auto-edit`**: 編集ツール（`edit`、`write_file`、`notebook_edit`）を自動承認し、その他のツールは確認を必要とします。
- **`yolo`**: すべてのツールが確認なしで自動実行されます。

### パーミッション優先チェーン

判断の優先順位（高い順）: `deny` > `ask` > `allow` > _（デフォルト/インタラクティブモード）_

最初に一致したルールが適用されます。

1. `excludeTools` / `permissions.deny` - ツールを完全にブロック（パーミッションエラーを返す）
2. `permissions.ask` - 常にユーザーの確認を要求
3. `permissionMode: 'plan'` - 読み取り専用でないすべてのツールをブロック
4. `permissionMode: 'yolo'` - すべてのツールを自動承認
5. `allowedTools` / `permissions.allow` - 一致するツールを自動承認
6. `canUseTool` コールバック - カスタム承認ロジック（指定した場合、許可済みツールには呼び出されない）
7. デフォルト動作 - SDK モードでは自動拒否（書き込みツールは明示的な承認が必要）

## 使用例

### マルチターン会話

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Create a hello.txt file' },
    parent_tool_use_id: null,
  };

  // 何らかの条件またはユーザー入力を待機
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Now read the file back' },
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
  // すべての読み取り操作を許可
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 書き込み操作はユーザーに確認（実際のアプリでは）
  const userApproved = await promptUser(`Allow ${toolName}?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'User denied the operation' };
};

const result = query({
  prompt: 'Create a new file',
  options: {
    canUseTool,
  },
});
```

### 外部 MCP サーバーを使用する場合

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Use the custom tool from my MCP server',
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

### システムプロンプトを上書きする

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Say hello in one sentence.',
  options: {
    systemPrompt: 'You are a terse assistant. Answer in exactly one sentence.',
  },
});
```

### 組み込みシステムプロンプトに追記する

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Review the current directory.',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: 'Be terse and focus on concrete findings.',
    },
  },
});
```

### SDK 組み込み MCP サーバーを使用する場合

SDK は `tool` と `createSdkMcpServer` を提供しており、SDK アプリケーションと同じプロセスで動作する MCP サーバーを作成できます。これは別途サーバープロセスを起動せずに AI にカスタムツールを公開したい場合に便利です。

#### `tool(name, description, inputSchema, handler)`

Zod スキーマの型推論を使用してツール定義を作成します。

| パラメータ    | 型                                 | 説明                                                                         |
| ------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `name`        | `string`                           | ツール名（1〜64 文字、英字始まり、英数字とアンダースコアのみ）               |
| `description` | `string`                           | ツールの動作を説明する人間が読める説明文                                     |
| `inputSchema` | `ZodRawShape`                      | ツールの入力パラメータを定義する Zod スキーマオブジェクト                    |
| `handler`     | `(args, extra) => Promise<Result>` | ツールを実行して MCP コンテンツブロックを返す非同期関数                      |

ハンドラは以下の構造を持つ `CallToolResult` オブジェクトを返す必要があります:

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

SDK 組み込み MCP サーバーインスタンスを作成します。

| オプション | 型                       | デフォルト | 説明                                         |
| --------- | ------------------------ | ---------- | -------------------------------------------- |
| `name`    | `string`                 | 必須       | MCP サーバーの一意な名前                     |
| `version` | `string`                 | `'1.0.0'`  | サーバーバージョン                           |
| `tools`   | `SdkMcpToolDefinition[]` | -          | `tool()` で作成したツールの配列              |

`mcpServers` オプションに直接渡せる `McpSdkServerConfigWithInstance` オブジェクトを返します。

#### 例

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Zod スキーマでツールを定義
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// MCP サーバーを作成
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

### クエリを中断する

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: 'Long running task...',
  options: {
    abortController,
  },
});

// 5 秒後に中断
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Query was aborted');
  } else {
    throw error;
  }
}
```

## エラーハンドリング

SDK は中断されたクエリを処理するための `AbortError` クラスを提供します:

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... クエリ操作
} catch (error) {
  if (isAbortError(error)) {
    // 中断を処理
  } else {
    // その他のエラーを処理
  }
}
```
