# Channel P0 Identity と Task Lifecycle の設計

## Goal

channel 常駐型のマルチプレイヤーエージェントのための最初の P0 基盤を実装します。具体的には、channel スコープの identity と memory-boundary のメタデータ、および `@qwen-code/channel-base` における共有の task lifecycle hook を追加します。

この PR では意図的に、Slack アダプター、デーモンイベントストリーム、アダプター UI の変更、プロアクティブなスケジューリング、channel 間コンテキスト、または実際の core-memory パスの分離は追加しません。

## Background

`qwen channel` はすでに、メッセージングアダプター、共有セッション、送信者の attribution、ディスパッチモード、ストリーミングチャンク、ツール呼び出しコールバック、キャンセル、および Feishu カードなどのプラットフォーム固有の進捗表示をサポートしています。欠落している P0 プロダクトレイヤーは、「この channel には独自の常駐エージェント identity がある」および「このプロンプトターンにはアダプターが観察できる lifecycle がある」を安定して表現する方法です。

Issue #6103 はこの焦点を絞った範囲を追跡しています。これは #5887 のより広範な qwen tag ロードマップの上に構築されますが、この PR を独立してレビューおよびリリースできる十分な小ささに保っています。

## Scope

対象範囲:

- `ChannelConfig` にオプションの channel identity メタデータを追加する。
- `ChannelConfig` にオプションの memory-scope メタデータを追加する。
- 新しい設定が省略された場合に安全なデフォルト値を導出する。
- 既存の channel 指示とともに、各エージェントセッションの最初のプロンプトに簡潔な channel boundary ノートを挿入する。
- `ChannelBase` に保護された `onTaskLifecycle(event)` hook を追加する。
- 共有 channel フローから、プロンプト開始、テキストチャンク、ツール呼び出し、キャンセル、完了、およびエラーに対する lifecycle イベントを発行する。
- `packages/channels/base` に焦点を絞ったパッケージローカルのテストを追加する。

対象外:

- Core memory ストレージの変更またはファイルパス名前空間の分離。
- デーモン/SSE イベントの公開。
- Feishu、DingTalk、Telegram、WeChat、または QQ の UI 変更。
- 新しいプラットフォームアダプター。
- トークン予算、ツール ACL、または channel 間コンテキストの共有。

## Design

### Channel Identity

小さなオプションの設定オブジェクトを追加します:

```ts
export interface ChannelIdentityConfig {
  id?: string;
  displayName?: string;
  description?: string;
}
```

`ChannelConfig` に `identity?: ChannelIdentityConfig` が追加されます。

ランタイムでは、`ChannelBase` が以下を導出します:

- `id`: `config.identity.id` または `channel:<name>`
- `displayName`: `config.identity.displayName` または `<name>`
- `description`: 存在する場合は `config.identity.description`

ランタイム identity はメタデータのみです。セッションルーティング、アクセス制御、またはプラットフォームアダプターの動作を変更することはありません。

### Memory Scope Metadata

以下を追加します:

```ts
export type ChannelMemoryScopeMode = 'metadata-only';

export interface ChannelMemoryScopeConfig {
  namespace?: string;
  mode?: ChannelMemoryScopeMode;
}
```

`ChannelConfig` に `memoryScope?: ChannelMemoryScopeConfig` が追加されます。

ランタイムでは、`ChannelBase` が以下を導出します:

- `namespace`: `config.memoryScope.namespace` または `channel:<name>`
- `mode`: この PR では常に `'metadata-only'`

これは意図的に実際の core-memory 名前空間ではありません。これは明示的で検査可能な boundary マーカーおよびプロンプト指示であり、後の作業で channel 設定の形状を変更せずに同じ名前空間を core memory パスに接続できるようにするためのものです。

### Prompt Boundary Injection

`ChannelBase` はすでにセッションごとに 1 回 `config.instructions` を先頭に追加しています。この動作は変更されません。以下の生成される boundary ノートは、channel が `identity` または `memoryScope` を設定している場合にのみ、同じ最初のメッセージ挿入に追加されます（指示のみの channel は既存のプロンプト形状を維持します）。boundary の最新性が優先されるように、カスタム指示の後に追加されます:

```text
Channel identity:
- id: channel:ops
- display name: Ops Bot
- description: Helps the ops group coordinate repository maintenance.

Memory scope:
- namespace: qwen-tag:ops
- mode: metadata-only
- data from other channels must not be shared.
```

正確な文言は、テストに対して十分に簡潔で安定しているべきですが、分離について過度に約束することは避けてください。description が存在しない場合は、その行を省略します。

このノートは、既存の指示と同様に、エージェントセッションごとに 1 回挿入されます（一時的な channel-memory 読み取り失敗は、次のターンでコンテキストブロック全体を再試行するため、連続するターンで繰り返される可能性があります）。bridge がセッションの終了を報告すると、既存の `instructedSessions` クリーンアップにより、次のセッションへの再挿入が引き続き許可されます。

互換性のため、`instructions`、`identity`、または `memoryScope` の設定がない channel は、既存のままのプロンプト形状を維持します。ランタイム identity と memory メタデータは、lifecycle イベントとステータスコマンドのために引き続き導出されます。

### Status Visibility

identity と memory メタデータで `/who` と `/status` を拡張します:

- `/who` には identity の表示名と memory 名前空間を含める必要があります。
- `/status` には identity id と memory モードを含める必要があります。

出力は短く保ってください。絶対パスや隠し設定を公開しないでください。

### Task Lifecycle Hook

識別共用体を追加します:

```ts
export type ChannelTaskLifecycleEvent =
  | {
      type: 'started';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'text_chunk';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      chunk: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'tool_call';
      channelName: string;
      chatId: string;
      sessionId: string;
      toolCall: ToolCallEvent;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'cancelled';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      reason: 'cancel_command' | 'clear' | 'steer' | 'timeout';
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'completed';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'failed';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      error: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    };
```

`ChannelBase` に以下を追加します:

```ts
protected onTaskLifecycle(_event: ChannelTaskLifecycleEvent): void {}
```

デフォルトの動作は no-op です。アダプターは、プロンプト実行パスを変更せずに後でオプトインできます。

### Lifecycle Emission Points

共有 `ChannelBase` フローから発行します:

- `started`: `activePrompts.set()` の直後、かつ `onPromptStart()` の前。
- `text_chunk`: プロンプトの `textChunk` リスナーがキャンセルされていないチャンクを受け入れたとき。
- `tool_call`: セッションターゲットを解決した後、既存の bridge ツール呼び出しリスナー内。
- `cancelled`: `/cancel` が成功したとき、`/clear` がアクティブなプロンプトをキャンセルまたは削除したとき、および `steer` がアクティブなターンをキャンセル済みとしてマークしたとき。
- `completed`: `bridge.prompt()` が解決した後、かつターンがキャンセルされていない限り、`onResponseComplete()` の前または後。
- `failed`: `bridge.prompt()` またはレスポンス配信がスローしたとき。

lifecycle hook の失敗はキャッチされ、stderr にログ出力される必要があります。プラットフォームアダプターの lifecycle UI は、プロンプトの実行やクリーンアップを中断させてはなりません。

## Error Handling

- この PR では、無効な identity または memory フィールドは致命的ではありません。設定の解析は既存の柔軟な形状を維持し、明示的な解析がすでに存在する場所でのみ文字列フィールドを受け入れる必要があります。
- lifecycle hook の例外は、stderr への診断ログ出力後に無視されます。
- Memory scope モードは `'metadata-only'` に制限されています。省略された config または不明な config は、存在しない動作を有効にするのではなく、`'metadata-only'` に解決される必要があります。

## Tests

`packages/channels/base/src/ChannelBase.test.ts` における焦点を絞ったテストは、以下をカバーする必要があります:

- デフォルトの identity と memory メタデータが channel 名から導出されること。
- カスタム identity と memory 名前空間が最初のプロンプトに含まれること。
- Boundary メタデータがセッションごとに 1 回挿入され、`sessionDied` 後に再挿入されること。
- `/who` と `/status` が cwd を漏らすことなく新しいメタデータを含むこと。
- `onTaskLifecycle` が `started`、`text_chunk`、`tool_call`、`completed` を受け取ること。
- `onTaskLifecycle` が `/cancel`、`/clear`、および `steer` に対して `cancelled` を受け取ること。
- `onTaskLifecycle` が `bridge.prompt()` が reject したときに `failed` を受け取ること。
- 例外をスローする lifecycle hook が `handleInbound()` を reject しないこと。

パッケージローカルのコマンドを使用します:

```bash
cd packages/channels/base
npx vitest run src/ChannelBase.test.ts
```

PR 前の最終検証:

```bash
npm run build
npm run typecheck
```

## Open Decisions

この PR に対する未決定事項はありません。実際の core-memory 名前空間の強制、デーモンの公開、アダプター UI、ツール/データ ACL、予算、およびプロアクティブなフォローアップは、明示的に今後の作業とします。