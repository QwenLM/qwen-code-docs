# Phase 2 技術設計書：能力拡張

## 1. 設計目標と制約

### 1.1 目標

- 13 個の built-in コマンドの `supportedModes` を拡張して `non_interactive` および/または `acp` を含める
- 拡張された各コマンドが ACP/non-interactive パスで IDE が消費するのに適したテキスト内容を返すことを保証する
- prompt command のモデル呼び出し経路（`SkillTool` が `getModelInvocableCommands()` を消費する）を確立する
- mid-input slash command の基本検出を実装する

### 1.2 ハード制約

- **interactive パスのゼロ劣化**：すべての拡張コマンドの既存の interactive 動作は厳密に変更せず、action 内部でのみモード分岐を追加し、interactive パスのコードには一切触れない
- **実装戦略：モード分岐、二重登録ではない**：13 個のコマンドはすべて action 内部で `executionMode` の判定を追加する方式を採用し、Phase 1 設計書 §10.2 で説明されている二重登録方式は使用しない（二重登録は interactive と non-interactive のロジックが極端に異なる場合にのみ必要であり、本フェーズのコマンドの複雑さはその閾値に達しない）
- **ACP メッセージ形式**：ACP パスで返されるテキストには ANSI スタイルを含めず、Markdown またはプレーンテキストが適切であり、IDE プラグインでの消費を想定する
- **環境依存の副作用をスキップする**：ブラウザを開く（`open()`）、クリップボードを操作する（`copyToClipboard()`）など、グラフィカル環境に依存する操作は non-interactive/ACP パスではスキップする必要がある

---

## 2. Phase 1 完了後の基本状態

Phase 1 終了後のアーキテクチャの要点（Phase 2 はこれを直接基盤として拡張する）：

- `commandType` フィールドは `SlashCommand` インターフェースから削除され、すべてのコマンドは明示的な `supportedModes` を使用するようになった
- `getEffectiveSupportedModes()` は二段階推論：明示的な `supportedModes` → `CommandKind` のフォールバック
- `CommandService.getCommandsForMode(mode)` が従来の `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` ホワイトリストに取って代わる
- `btw`、`bug`、`compress`、`context`、`init`、`summary` は Phase 1 ですでに全モードに拡張されており、**本フェーズのリストには含まれない**
- `createNonInteractiveUI()` の各メソッドはすべて no-op：`addItem`、`clear`、`setDebugMessage`、`setPendingItem`、`reloadCommands` はすべて呼び出しを黙って無視する

---

## 3. 変更範囲の概要

本フェーズでは合計 13 個のコマンドを扱い、実装の複雑さに応じて 4 つのカテゴリに分類される：

| カテゴリ   | コマンド                                       | 変更のポイント                                                                           |
| ---------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **A 類**   | `export`                                       | `supportedModes` のみ変更。action の全パスですでに有効な型を返している                    |
| **対話のみ** | `plan`、`statusline`                         | 設計判断：これらのコマンドは意味的に対話インターフェースと強く結合しているため、`supportedModes: ['interactive']` を維持する |
| **A+ 類**  | `language`                                     | `supportedModes` 変更 + 軽微な non-interactive 分岐処理                                   |
| **対話のみ** | `copy`、`restore`                            | 設計判断：クリップボード操作とスナップショット復元は本質的に対話操作であるため、`supportedModes: ['interactive']` を維持する |
| **A' 類**  | `model`、`approval-mode`                     | 引数ありパスは既に `message` を返している。引数なしパスでは new non-interactive 分岐が必要（現在は dialog をトリガー） |
| **B 類**   | `about`、`stats`、`insight`、`docs`、`clear` | action の全パスが戻り値なし、または `addItem`/`clear` を呼び出すため、完全な non-interactive 分岐を追加する必要がある |

---

## 4. A 類：`supportedModes` のみ変更

これらの 3 つのコマンドの `action` の全パスはすでに `message` または `submit_prompt` を返しており、UI 依存はまったくなく、`handleCommandResult` が直接処理できる。

### 4.1 `/export`（およびサブコマンド）

**現在の状態**：`supportedModes: ['interactive']`、すべてのサブコマンド action は `MessageActionReturn` を返す。

**変更**：親コマンドおよび 4 つのサブコマンド（`md`、`html`、`json`、`jsonl`）の `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。

**ACP メッセージ内容**：action の現在の戻り値には完全なファイルパスが含まれており（例：`Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`）、IDE での消費に適しているため、テキストを変更する必要はない。

> **注意**：`/export` 親コマンド自体には `action` がなく、サブコマンドのみを持っている。親コマンドの `supportedModes` を全モードに変更した後、`parseSlashCommand` はサブコマンドのルーティングにマッチできるようになるが、ユーザーが `/export` のみを入力しサブコマンドを指定しない場合、`commandToExecute.action` は undefined となり、`handleSlashCommand` は `no_command` を返し、呼び出し元は利用可能なサブコマンドのヒントを表示する。これは期待される動作である。

### 4.2 `/plan`

**現在の状態**：`supportedModes: ['interactive']`、action の全パスは `MessageActionReturn` または `SubmitPromptActionReturn` を返す。

**設計判断**：`/plan` はユーザーを複数回の対話計画へ導くコマンドであり、意味的に対話インターフェースと強く結合している。議論の結果、`supportedModes: ['interactive']` を維持し、non-interactive/acp モードには拡張しない。

### 4.3 `/statusline`

**現在の状態**：`supportedModes: ['interactive']`、action は常に `SubmitPromptActionReturn` を返す（subagent 呼び出しの prompt をモデルに送信する）。

**設計判断**：`/statusline` は subagent が現在の状態を要約するためのコマンドであり、意味的に対話インターフェースと強く結合している。議論の結果、`supportedModes: ['interactive']` を維持し、non-interactive/acp モードには拡張しない。

---

## 5. A+ 類：軽微な non-interactive 分岐処理

### 5.1 `/language`

**現在の状態**：action の全パスは `MessageActionReturn` を返す（言語設定の読み取り/設定）。

**処理すべき副作用**：`setUiLanguage()` 内で `context.ui.reloadCommands()` を呼び出すが、非対話 UI ではすでに no-op であるため、追加の処理は不要。

**変更**：

- 親コマンドおよびサブコマンド（`ui`、`output`、および `SUPPORTED_LANGUAGES` から動的に生成されるサブコマンド）の `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。
- action にモード分岐を追加する必要はない。既存の戻りテキストは機械消費に適している。

**ACP セマンティクスの説明**：non-interactive（単一呼び出し）で `/language ui zh-CN` を実行すると、永続的な設定が変更され（settings ファイルに書き込まれる）、その変更は以降のセッションに影響し、現在のセッション内の i18n も即座に反映される。これはユーザーの期待と一致する。

### 5.2 `/copy`

**現在の状態**：action は `copyToClipboard()` を呼び出す。ACP/headless 環境では例外をスローするか、無音で失敗する可能性がある（クリップボードが利用不可）。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。
2. action 内に新しいモード分岐を追加する：

```typescript
// 最後の AI メッセージを取得（既存のロジック、再利用可）
if (context.executionMode !== 'interactive') {
  // 非対話/ACP：クリップボードをスキップし、内容自体を返す
  if (!lastAiOutput) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No output in history.',
    };
  }
  return {
    type: 'message',
    messageType: 'info',
    content: lastAiOutput,
  };
}
// interactive パス：既存のクリップボードロジックを変更せず
await copyToClipboard(lastAiOutput);
return {
  type: 'message',
  messageType: 'info',
  content: 'Last output copied to the clipboard',
};
```

**ACP セマンティクス**：IDE は最後のモデル出力の原文を受け取り、クリップボードに書き込むかユーザーに表示するかを自身で判断できる。

### 5.3 `/restore`

**現在の状態**：`supportedModes: ['interactive']`。

**設計判断**：スナップショット復元はさらにツール呼び出しを再実行するため、意味的に対話インターフェースと強く結合している。議論の結果、`supportedModes: ['interactive']` を維持し、non-interactive/acp モードには拡張しない。

**ACP セマンティクス**：checkpoint の git 状態復元と gemini client history 設定は副作用として実行される。IDE は確認メッセージを受け取った後、ユーザーに「状態が復元されました」と通知できる。ツールの再実行は IDE が自身で判断してトリガーする。

---

## 6. A' 類：引数なし dialog パスの non-interactive 処理

### 6.1 `/model`

**現在の状態**：

| 入力                             | 現在の動作                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `/model`（引数なし）               | → `{ type: 'dialog', dialog: 'model' }`（non-interactive では unsupported になる）|
| `/model <model-id>`               | 未実装（`--fast` 分岐のみ）                                                      |
| `/model --fast`（model name なし） | → `{ type: 'dialog', dialog: 'fast-model' }`（non-interactive では unsupported になる） |
| `/model --fast <model-id>`       | → `MessageActionReturn` ✅                                                       |

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。
2. action 内の各 dialog パスの前に non-interactive 分岐を挿入する：

```typescript
// 引数なしパス（元は dialog: 'model' を返す）
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentModel = config.getModel() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `現在のモデル: ${currentModel}\nモデルを切り替えるには "/model <model-id>" を使用してください。`,
    };
  }
  return { type: 'dialog', dialog: 'model' };
}

// --fast 引数なしパス（元は dialog: 'fast-model' を返す）
if (args.startsWith('--fast') && !modelName) {
  if (context.executionMode !== 'interactive') {
    const fastModel = context.services.settings?.merged?.fastModel ?? '未設定';
    return {
      type: 'message',
      messageType: 'info',
      content: `現在の fast model: ${fastModel}\nfast model を設定するには "/model --fast <model-id>" を使用してください。`,
    };
  }
  return { type: 'dialog', dialog: 'fast-model' };
}
```

**ACP セマンティクス**：IDE は現在のモデル名を表示し、ユーザーが参照できるようにする。モデルの切り替えは引数付き呼び出し（`/model <model-id>`）で行う。

> **注意**：`/model <model-id>`（`--fast` なし）は現在のセッションモデルを設定するロジックが実装されておらず、`--fast <model-id>` のみ実装されている。Phase 2 で ACP 下でメインモデルを切り替える機能をサポートする場合は、`/model <model-id>` の set ロジックを同時に実装する必要がある。本設計ではこのパスを予約するが Phase 2 のオプションとし、「現在のモデルを表示する」読み取り専用パスを優先する。

### 6.2 `/approval-mode`

**現在の状態**：

| 入力                       | 現在の動作                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `/approval-mode`（引数なし） | → `{ type: 'dialog', dialog: 'approval-mode' }`（non-interactive では unsupported になる） |
| `/approval-mode <mode>`    | → `MessageActionReturn` ✅                                                          |
| `/approval-mode <invalid>` | → `MessageActionReturn`（error）✅                                                  |

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。
2. 引数なしパス（`!args.trim()`）に non-interactive 分岐を挿入する：

```typescript
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentMode = config?.getApprovalMode() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `現在の承認モード: ${currentMode}\n利用可能なモード: ${APPROVAL_MODES.join(', ')}\n変更するには "/approval-mode <mode>" を使用してください。`,
    };
  }
  return { type: 'dialog', dialog: 'approval-mode' };
}
```

---

## 7. B 類：完全な non-interactive 分岐が必要

これら 5 つのコマンドの action は interactive モードで `context.ui.addItem()` を使用して React コンポーネントをレンダリングするか、`context.ui.clear()` を呼び出し、戻り値は `void` です。non-interactive ではこれらの呼び出しはすべて no-op となるため、`handleSlashCommand` は戻り値なしを `"Command executed successfully."` として処理し、実際のコンテンツは出力されません。

**実装原則**：action の**先頭**で `executionMode` をチェックし、非 interactive の場合は**早期に return** して実際の内容を含む `message` を返し、interactive パスのコードには一切触れません。

### 7.1 `/about`（別名: `status`）

**データソース**：`getExtendedSystemInfo(context)` は `ExtendedSystemInfo` を返し、以下を含む：`cliVersion`、`osPlatform`、`osArch`、`osRelease`、`nodeVersion`、`modelVersion`、`selectedAuthType`、`ideClient`、`sessionId`、`memoryUsage`、`baseUrl`、`apiKeyEnvKey`、`gitCommit`、`fastModel`。すべてのフィールドは non-interactive で取得可能（`context.services.config` と settings はすでに注入されている）。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。
2. `getExtendedSystemInfo` 呼び出し後、interactive パスの前にモード分岐を挿入する：

```typescript
action: async (context) => {
  const systemInfo = await getExtendedSystemInfo(context);

  if (context.executionMode !== 'interactive') {
    const lines = [
      `Qwen Code v${systemInfo.cliVersion}`,
      `モデル: ${systemInfo.modelVersion}`,
      `Fast Model: ${systemInfo.fastModel ?? '未設定'}`,
      `認証: ${systemInfo.selectedAuthType}`,
      `プラットフォーム: ${systemInfo.osPlatform} ${systemInfo.osArch} (${systemInfo.osRelease})`,
      `Node.js: ${systemInfo.nodeVersion}`,
      `セッション: ${systemInfo.sessionId}`,
      ...(systemInfo.gitCommit ? [`Git コミット: ${systemInfo.gitCommit}`] : []),
      ...(systemInfo.ideClient ? [`IDE: ${systemInfo.ideClient}`] : []),
    ];
    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
    };
  }

  // interactive パス：既存の addItem ロジックを変更せず
  const aboutItem: Omit<HistoryItemAbout, 'id'> = { type: MessageType.ABOUT, systemInfo };
  context.ui.addItem(aboutItem, Date.now());
},
```

### 7.2 `/stats`（およびサブコマンド `model`、`tools`）

**データソース**：`context.session.stats`（`SessionStatsState`）には `sessionStartTime`、`metrics`（`SessionMetrics`：`models`、`tools`、`files`）、`promptCount` が含まれる。non-interactive では、`sessionStartTime` は現在の呼び出し時刻、`metrics` は `uiTelemetryService.getMetrics()` からの値（今回の呼び出しの累積値、通常はゼロ）、`promptCount` は 1 となる。

**変更**：

1. 親コマンド `stats` およびサブコマンド `model`、`tools` の `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。
2. 親コマンドと各サブコマンドの action にモード分岐を挿入し、テキスト形式の統計情報を早期に返す：

```typescript
// /stats メインコマンド
action: (context) => {
  if (context.executionMode !== 'interactive') {
    const now = new Date();
    const { sessionStartTime, promptCount, metrics } = context.session.stats;
    if (!sessionStartTime) {
      return { type: 'message', messageType: 'error', content: 'セッション開始時刻が利用できません。' };
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    // 全モデルのトークン数を集計
    let totalPromptTokens = 0, totalCandidateTokens = 0, totalRequests = 0;
    for (const modelMetrics of Object.values(metrics.models)) {
      totalPromptTokens += modelMetrics.tokens.prompt;
      totalCandidateTokens += modelMetrics.tokens.candidates;
      totalRequests += modelMetrics.api.totalRequests;
    }

    const lines = [
      `セッション経過時間: ${formatDuration(wallDuration)}`,
      `プロンプト数: ${promptCount}`,
      `API リクエスト数: ${totalRequests}`,
      `トークン — 入力: ${totalPromptTokens}、出力: ${totalCandidateTokens}`,
      `ツール呼び出し: ${metrics.tools.totalCalls} (成功: ${metrics.tools.totalSuccess}、失敗: ${metrics.tools.totalFail})`,
      `ファイル: +${metrics.files.totalLinesAdded} / -${metrics.files.totalLinesRemoved} 行`,
    ];
    return { type: 'message', messageType: 'info', content: lines.join('\n') };
  }

  // interactive パス：既存の addItem ロジックを変更せず
  const statsItem: HistoryItemStats = { type: MessageType.STATS, duration: formatDuration(wallDuration) };
  context.ui.addItem(statsItem, Date.now());
},
```

サブコマンド `model` および `tools` もそれぞれモード分岐を挿入し、対応する次元のテキスト統計情報を返す（model 次元ではモデル名ごとにトークン使用量を表示、tools 次元では各ツールの呼び出し回数を表示）。

**説明**：non-interactive の単一呼び出しでは、metrics は通常ゼロ（新しいセッション）であるが、構造は完全であり、フォーマットに影響はない。ACP セッションでは累積値が存在する可能性があり、意味がある。

### 7.3 `/insight`

**現在の状態**：action は `void` を返し、`addItem` で進捗と結果を表示し、最後に `open(outputPath)` でブラウザを開く。コアロジックは `insightGenerator.generateStaticInsight()` で HTML ファイルを生成すること。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。
2. `executionMode` に応じて 3 つの分岐にする：
   - `non_interactive`：同期的に生成し、進捗コールバックを無視し、ブラウザを開かず、直接 `message`（ファイルパス）を返す
   - `acp`：非同期的に生成を開始し、`stream_messages` を使用して進捗（`encodeInsightProgressMessage`）と完了（`encodeInsightReadyMessage`）を IDE にプッシュする
   - `interactive`：既存の `addItem` + `setPendingItem` + `open()` ロジックを変更せず

```typescript
// non_interactive パス
if (context.executionMode === 'non_interactive') {
  const outputPath = await insightGenerator.generateStaticInsight(
    projectsDir,
    () => {}, // no-op progress
  );
  return {
    type: 'message',
    messageType: 'info',
    content: t('インサイトレポートを生成しました: {{path}}', { path: outputPath }),
  };
}

// acp パス：stream_messages
if (context.executionMode === 'acp') {
  // ... streamMessages の async generator を構築し、encodeInsightProgressMessage / encodeInsightReadyMessage を yield ...
  return { type: 'stream_messages', messages: streamMessages() };
}

// interactive パス：既存の実装を変更せず
```

**設計理由**：`non_interactive` モード（CLI パイプライン）は `stream_messages` をサポートしておらず、単一の `message` のみ返せる。ACP モード（IDE プラグイン）は `stream_messages` を消費してリアルタイムで進捗を表示できるため、streaming パスを維持する。

**ACP メッセージ形式**：`encodeInsightProgressMessage(stage, progress, detail?)` は IDE が解析可能なプログレスバーメッセージを生成する。`encodeInsightReadyMessage(outputPath)` は IDE にファイルの準備ができたことを通知し、IDE がリンクの表示方法を決定する。

### 7.4 `/docs`

**現在の状態**：action は `void` を返し、`addItem` でメッセージを表示し、`open(docsUrl)` でブラウザを開く。`SANDBOX` 環境変数分岐があり（サンドボックス下では addItem のみでブラウザを開かない）。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。
2. action の戻り値の型を `Promise<void | MessageActionReturn>` に変更する。
3. action の先頭に non-interactive 分岐を挿入する：

```typescript
action: async (context) => {
  const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
  const docsUrl = `https://qwenlm.github.io/qwen-code-docs/${langPath}`;

  if (context.executionMode !== 'interactive') {
    // 非対話/ACP：URL を直接返し、ブラウザを開かず、addItem も呼び出さない
    return {
      type: 'message',
      messageType: 'info',
      content: `Qwen Code ドキュメント: ${docsUrl}`,
    };
  }

  // interactive パス：既存の SANDBOX 判定 + addItem + open() を変更せず
  if (process.env['SANDBOX'] && ...) {
    context.ui.addItem(...);
  } else {
    context.ui.addItem(...);
    await open(docsUrl);
  }
},
```

### 7.5 `/clear`（別名: `reset`、`new`）

**現在の状態**：action は以下の操作を実行し、`void` を返す：

1. `config.getHookSystem()?.fireSessionEndEvent()` — hook をトリガー（副作用あり）
2. `config.startNewSession()` — 新しいセッション ID を開始（副作用あり）
3. `uiTelemetryService.reset()` — テレメトリカウンターをリセット（副作用あり）
4. `skillTool.clearLoadedSkills()` — skill キャッシュをクリア（副作用あり）
5. `context.ui.clear()` — ターミナル UI をクリア（**UI 副作用、non-interactive では no-op**）
6. `geminiClient.resetChat()` — チャット履歴をリセット（副作用あり）
7. `config.getHookSystem()?.fireSessionStartEvent()` — hook をトリガー（副作用あり）

**non-interactive/ACP セマンティクス分析**：

- `ui.clear()` は non-interactive ですでに no-op であるため、処理は不要
- `geminiClient.resetChat()`：ACP セッションでは意味のある副作用（チャット履歴のクリア）であり、維持する必要がある。non-interactive 単一呼び出しでは、毎回新しいセッションであるため `resetChat` のセマンティクスは重複するが無害
- `config.startNewSession()`：ACP では意味がある（新しいセッション ID の開始）。non-interactive 単一呼び出しでも同様にセマンティクスが重複するが無害
- `fireSessionEndEvent` / `fireSessionStartEvent`：ACP では意味がある（hook のトリガー）

**判断**：non-interactive/ACP パスでは、意味のある副作用（resetChat、startNewSession、hook events）はすべて維持し、`ui.clear()` のみスキップする（すでに no-op）。そして、コンテキスト境界マーカーとなるメッセージを返す。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更する。
2. action の戻り値の型を `Promise<void | MessageActionReturn>` に変更する。
3. action 内で、`context.ui.clear()` 呼び出し後（またはその代わりに）モードに基づいて分岐する：

```typescript
action: async (context, _args) => {
  const { config } = context.services;

  if (config) {
    config.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Clear).catch(...);

    const newSessionId = config.startNewSession();
    uiTelemetryService.reset();

    const skillTool = config.getToolRegistry()?.getAllTools().find(...);
    if (skillTool instanceof SkillTool) skillTool.clearLoadedSkills();

    if (newSessionId && context.session.startNewSession) {
      context.session.startNewSession(newSessionId);
    }

    // ui.clear() は非対話下ですでに no-op だが、依然として呼び出す（条件分岐は不要）
    context.ui.clear();

    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.resetChat();
    }

    config.getHookSystem()?.fireSessionStartEvent(...).catch(...);
  } else {
    context.ui.clear();
  }

  // モードに基づいて戻り値を決定
  if (context.executionMode !== 'interactive') {
    return {
      type: 'message',
      messageType: 'info',
      content: 'コンテキストをクリアしました。以前のメッセージはコンテキストに含まれなくなりました。',
    };
  }
  // interactive パス：void（戻さない。React UI は ui.clear() によって更新が駆動される）
},
```

**ACP セマンティクス**：IDE はコンテキスト境界マーカーを受け取った後、セッションの区切りとして表示し（例：「新しい会話を開始しました」というヒント）、ローカルのチャット履歴キャッシュをクリアすることができる。

---

## 8. `handleCommandResult` の変更

**結論：変更不要。**

Phase 2 のすべてのコマンド変更後、non-interactive/ACP パスの戻り値の型は `message` または `submit_prompt` となり、いずれも `handleCommandResult` の switch で正しく処理される。

---

## 9. `createNonInteractiveUI()` の変更

**結論：変更不要。**

現在の no-op 実装で十分である。`addItem`、`clear`、`setPendingItem` などの no-op は B 類コマンドの non-interactive パスでは呼び出されない（早期 return のため）。interactive パスでは影響がない。

---

## 10. Phase 2.2：prompt command のモデル呼び出しの確立

Phase 1 では `CommandService.getModelInvocableCommands()` がすでに実装されており、`BundledSkillLoader`、`FileCommandLoader`（ユーザー/プロジェクトコマンド）、`McpPromptLoader` は `modelInvocable: true` に設定されている。

Phase 2.2 の作業は、`SkillTool` が `SkillManager.listSkills()` のみを消費するのではなく、同時に `CommandService.getModelInvocableCommands()` も消費するように変更し、モデルが呼び出し可能なコマンドの統一エントリポイントを提供することである。

**変更ファイル**：`packages/core/src/tools/SkillTool.ts`（または該当パス）

**具体的な変更**：

1. `SkillTool` は初期化時に `CommandService`（またはその `getModelInvocableCommands()` の結果）を依存性注入として受け取る
2. tool description を構築する際に、`listSkills()` と `getModelInvocableCommands()` の結果をマージする
3. built-in コマンド（`modelInvocable: false`）が tool description に含まれないようにする

> **注**：`SkillTool` の具体的な実装は `packages/core` 内部のアーキテクチャに依存する。本ドキュメントではインターフェースの変更のみを説明し、実装の詳細は core パッケージの既存構造に基づいて決定する必要がある。

---

## 11. Phase 2.3：mid-input slash command 検出（基本版）

`InputPrompt` コンポーネントで、カーソル近くの slash token（行頭に限らない）を検出し、補完メニューをトリガーする。

**検出ルール**：

- カーソル前に `/` で始まり、スペースを含まない token が存在する場合、コマンド補完をトリガーする
- 補完候補は `getCommandsForMode('interactive')` の可視コマンドリストから取得する
- 補完メニューにはコマンド名 + description を表示する（argumentHint などは含まない。Phase 3 で補充する）

> 本機能は UI 層の変更であり、Phase 2.3 の独立したサブタスクとして、他の Phase 2.1/2.2 の実装に影響を与えない。

---

## 12. ファイル変更概要

### 12.1 コマンドファイルの変更（Phase 2.1）

| ファイル                 | 変更タイプ | 具体的な内容                                                                                                                         |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `exportCommand.ts`       | A 類       | 親コマンド + 4 サブコマンド：`supportedModes` → 全モード                                                                             |
| `planCommand.ts`         | 対話のみ   | 設計判断：`supportedModes: ['interactive']` を維持、変更なし                                                                         |
| `statuslineCommand.ts`   | 対話のみ   | 設計判断：`supportedModes: ['interactive']` を維持、変更なし                                                                          |
| `languageCommand.ts`     | A+ 類      | 親コマンド + `ui`/`output` サブコマンド + 動的 language サブコマンド：`supportedModes` → 全モード                                    |
| `copyCommand.ts`         | 対話のみ   | 設計判断：`supportedModes: ['interactive']` を維持、変更なし                                                                         |
| `restoreCommand.ts`      | 対話のみ   | 設計判断：`supportedModes: ['interactive']` を維持、変更なし                                                                         |
| `modelCommand.ts`        | A' 類      | `supportedModes` → 全モード + 引数なし/--fast なしパスに非対話分岐を追加                                                               |
| `approvalModeCommand.ts`  | A' 類      | `supportedModes` → 全モード + 引数なしパスに非対話分岐を追加                                                                          |
| `aboutCommand.ts`        | B 類       | `supportedModes` → 全モード + 非対話パスで `message` を返す（バージョン/モデル/環境の要約）                                        |
| `statsCommand.ts`        | B 類       | `supportedModes` → 全モード + 非対話パスで `message` を返す（stats テキスト）；サブコマンドも同様に処理                              |
| `insightCommand.ts`      | B 類       | `supportedModes` → 全モード + `non_interactive` パスで同期的に生成し `message`（ファイルパス）を返す；`acp` パスでは `stream_messages` で進捗をプッシュ |
| `docsCommand.ts`         | B 類       | `supportedModes` → 全モード + 非対話パスで `message`（ドキュメント URL）を返し、ブラウザを開かない                                |
| `clearCommand.ts`        | B 類       | `supportedModes` → 全モード + action 末尾でモードに応じて `message` または `void` を返す                                           |
### 12.2 その他のファイル変更

| ファイル                                              | 変更内容                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts`              | Phase 2.2：`getModelInvocableCommands()` への接続（詳細設計は別途決定） |
| `packages/cli/src/ui/InputPrompt.tsx`（または同等のコンポーネント） | Phase 2.3：mid-input slash 検出ロジック                               |

### 12.3 変更なしのファイル

- `packages/cli/src/nonInteractiveCliCommands.ts`（`handleCommandResult`、`handleSlashCommand` は修正不要）
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts`（スタブUIは修正不要）
- `packages/cli/src/services/commandUtils.ts`（`filterCommandsForMode`、`getEffectiveSupportedModes` は修正不要）
- `packages/cli/src/services/CommandService.ts`（`getCommandsForMode`、`getModelInvocableCommands` はPhase 1で実装済み）

---

## 13. テスト戦略

### 13.1 コマンドのユニットテスト

変更対象の各コマンドについて、同じディレクトリにテストファイル（`*.test.ts`）を新規追加または更新し、以下のケースをカバーします。

**A/A+ クラスコマンド**（`export`、`language`）：

- `supportedModes` に `non_interactive` と `acp` が正しく含まれていること
- `executionMode: 'non_interactive'` において、action が `MessageActionReturn` または `SubmitPromptActionReturn` を返し、`ui.addItem` や `ui.clear` を呼び出さないこと
- インタラクティブパスの動作がリファクタリング前と完全に一致すること（スナップショットテスト）

**インタラクション専用コマンド**（`plan`、`statusline`、`copy`、`restore`）：

- `supportedModes` が `['interactive']` であること（設計上の判断）
- non-interactive 実行時に `unsupported` が正しく返されることを検証

**A' クラスコマンド**（`model`、`approval-mode`）：

- 引数なし + `executionMode: 'non_interactive'` → 現在の状態を示す `message` を返し、`dialog` は返さない
- 引数あり + `executionMode: 'non_interactive'` → 既存の `message` ロジックが正常に実行される
- インタラクティブパス：引数なし → `dialog`、引数あり → `message`（変更なし）

**B クラスコマンド**（`about`、`stats`、`insight`、`docs`、`clear`）：

- `executionMode: 'non_interactive'` において、action が `MessageActionReturn` を返し、`ui.*` メソッドを一切呼び出さないこと
- 返される `content` 文字列に期待されるキーフィールド（バージョン番号、モデル名、URL など）が含まれていること
- インタラクティブパス：`ui.addItem` が呼び出され、`action` が `void` を返すこと（変更なし）

**`clear` の特殊ケース**：

- `executionMode: 'non_interactive'` においても `geminiClient.resetChat()` が呼び出されること（副作用は保持）
- コンテキスト境界を示す `message` を返し、内容は `'Context cleared. Previous messages are no longer in context.'` であること

### 13.2 統合テスト（`handleSlashCommand`）

`nonInteractiveCli.test.ts` または新規の統合テストファイルで：

- `handleSlashCommand('/about', ...)` が non-interactive モードで `{ type: 'message', content: バージョン番号を含む }` を返すこと
- `handleSlashCommand('/stats', ...)` が non-interactive モードで `{ type: 'message', content: 'Session duration' を含む }` を返すこと
- `handleSlashCommand('/docs', ...)` が non-interactive モードで `{ type: 'message', content: 'qwenlm.github.io' を含む }` を返すこと
- `handleSlashCommand('/clear', ...)` が non-interactive モードで `{ type: 'message', content: 'Context cleared.' }` を返すこと
- `handleSlashCommand('/plan', ...)` が non-interactive モードで `unsupported` を返すこと（インタラクション専用）
- 既存の non-interactive コマンド（`btw`、`bug` など）の動作に退化がないこと

### 13.3 `commandUtils` テスト

`commandUtils.test.ts` に新規追加（または既存テストで引き続きカバー）：

- 拡張後のコマンド（`export`、`language` など）が `filterCommandsForMode(commands, 'non_interactive')` および `filterCommandsForMode(commands, 'acp')` でフィルタリングされること
- インタラクション専用コマンド（`plan`、`statusline`、`copy`、`restore`）が `filterCommandsForMode(commands, 'non_interactive')` で正しくフィルタリングされること

---

## 14. 動作影響分析

| シナリオ                                         | Phase 2 前の動作                                            | Phase 2 後の動作                     | 性質               |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------- | ------------------ |
| non-interactive で `/export md` を実行        | ❌ unsupported（フィルタリングされる）                                  | ✅ ファイルパス付きメッセージを返す            | 機能拡張           |
| non-interactive で `/plan <task>` を実行        | ❌ unsupported                                            | ❌ unsupported（設計判断：インタラクション専用） | 変更なし               |
| non-interactive で `/statusline` を実行         | ❌ unsupported                                            | ❌ unsupported（設計判断：インタラクション専用） | 変更なし               |
| non-interactive で `/language ui zh-CN` を実行  | ❌ unsupported                                            | ✅ 言語を設定し、確認メッセージを返す      | 機能拡張           |
| non-interactive で `/copy` を実行               | ❌ unsupported                                            | ❌ unsupported（設計判断：インタラクション専用） | 変更なし               |
| non-interactive で `/restore`（引数なし） を実行  | ❌ unsupported                                            | ❌ unsupported（設計判断：インタラクション専用） | 変更なし               |
| non-interactive で `/restore <id>` を実行       | ❌ unsupported                                            | ❌ unsupported（設計判断：インタラクション専用） | 変更なし               |
| non-interactive で `/model` を実行              | ❌ unsupported（dialog）                                  | ✅ 現在のモデル名を返す                | 機能拡張           |
| non-interactive で `/model <id>` を実行         | ❌ unsupported                                            | 🔄 Phase 2 オプション：切り替えロジックを実装      | 機能拡張（オプション）   |
| non-interactive で `/approval-mode` を実行      | ❌ unsupported（dialog）                                  | ✅ 現在の承認モードを返す                | 機能拡張           |
| non-interactive で `/approval-mode yolo` を実行 | ❌ unsupported                                            | ✅ モードを設定し、確認を返す              | 機能拡張           |
| non-interactive で `/about` を実行              | ❌ "Command executed successfully." を返す（addItem no-op） | ✅ バージョン/モデル/環境サマリを返す          | Bug fix + 機能拡張 |
| non-interactive で `/stats` を実行              | ❌ "Command executed successfully." を返す                  | ✅ セッション統計テキストを返す           | Bug fix + 機能拡張 |
| non-interactive で `/insight` を実行            | ❌ "Command executed successfully." を返す（生成されるが出力なし）  | ✅ 生成してファイルパスを返す              | Bug fix + 機能拡張 |
| non-interactive で `/docs` を実行               | ❌ "Command executed successfully." を返す                  | ✅ ドキュメントURLを返す                    | Bug fix + 機能拡張 |
| non-interactive で `/clear` を実行              | ❌ "Command executed successfully." を返す                  | ✅ コンテキスト境界メッセージを返す          | Bug fix + 機能拡張 |
| interactive で上記いずれかのコマンドを実行               | ✅ 既存動作                                               | ✅ 既存動作（ゼロ退化）              | 変更なし               |

---

## 15. 実装順序

以下の順序で実装することを推奨します。各グループは独立してコミットおよびレビュー可能です。

**Batch 1**（約30分）：A クラス — `supportedModes` のみ変更

`exportCommand.ts`（およびそのサブコマンド）を修正し、テストが通ることを確認。

**Batch 2**（約45分）：A+ クラス — 少数の分岐

`languageCommand.ts` を修正し、副作用のあるパスに非インタラクティブ分岐を追加。対応するテストを更新する。（`copyCommand.ts` と `restoreCommand.ts` は議論の結果、インタラクション専用のままとする。）

**Batch 3**（約45分）：A' クラス — dialog パス

`modelCommand.ts`、`approvalModeCommand.ts` を修正し、引数なしのパスに非インタラクティブ分岐を追加。対応するテストを更新。

**Batch 4**（約1.5時間）：B クラス — 完全な分岐

`aboutCommand.ts`、`statsCommand.ts`（サブコマンド含む）、`docsCommand.ts` を修正。

**Batch 5**（約1時間）：B クラス特殊 — `insightCommand.ts`、`clearCommand.ts`

これら2つのコマンドは副作用が多いため、独立したコミットとし、対応するテストと統合テストを更新。

**Batch 6**（約2時間）：Phase 2.2 — prompt command のモデル呼び出し連携

`SkillTool` を修正し、`getModelInvocableCommands()` に接続。SkillTool のテストを更新。

**Batch 7**（約2時間）：Phase 2.3 — mid-input slash 検出

`InputPrompt` コンポーネントを修正し、新しい補完トリガーロジックとUIテストを追加。

**Batch 8**（約30分）：全量テスト + 型チェック

`npm run typecheck`、`cd packages/cli && npx vitest run` を実行し、残った問題を修正。

---

## 16. 受け入れチェックリスト

**Phase 2.1 コマンド拡張**

- [ ] A クラス：`/export`（およびサブコマンド）、`/plan`、`/statusline` が non-interactive および acp モードで正常に実行され、意味のある出力を返すこと
- [ ] A+ クラス：`/language`（およびサブコマンド）が non-interactive で正常に実行され、設定が永続化されること
- [ ] A+ クラス：`/copy` が non-interactive/acp で最後のAI出力テキストを返すこと（クリップボードは操作しない）
- [ ] A+ クラス：`/restore` が引数なしの場合、non-interactive でチェックポイントリストを返すこと；引数ありの場合、状態を復元し確認メッセージを返すこと（`type: 'tool'` は返さない）
- [ ] A' クラス：`/model` が引数なしの場合、non-interactive/acp で現在のモデル名を返すこと（dialog はトリガーしない）；`/model --fast <id>` で正常に設定されること
- [ ] A' クラス：`/approval-mode` が引数なしの場合、non-interactive/acp で現在のモードを返すこと（dialog はトリガーしない）；引数ありの場合、正常に設定されること
- [ ] B クラス：`/about` が non-interactive/acp でバージョン番号とモデル名を含むプレーンテキストサマリを返すこと
- [ ] B クラス：`/stats`（サブコマンド含む）が non-interactive/acp でプレーンテキスト統計データを返すこと
- [ ] B クラス：`/insight` が non-interactive/acp で insight ファイルを生成し、ファイルパスを返すこと（ブラウザは開かない）
- [ ] B クラス：`/docs` が non-interactive/acp でドキュメントURLを返すこと（ブラウザは開かない）
- [ ] B クラス：`/clear` が non-interactive/acp でコンテキスト境界マーカーメッセージを返し、`geminiClient.resetChat()` が正常に実行されること
- [ ] 13個すべてのコマンドがインタラクティブモードでリファクタリング前と完全に同一の動作をすること（退化なし）
- [ ] TypeScript コンパイルエラーなし（`npm run typecheck`）
- [ ] `npm run lint` で新たなエラーがないこと
- [ ] 既存の全テストが通過すること（`cd packages/cli && npx vitest run`）

**Phase 2.2 モデル呼び出し**

- [ ] モデルが会話中に `SkillTool` を介して bundled skill、file command（ユーザー/プロジェクト）、MCP prompt を呼び出せること
- [ ] モデルが built-in commands を呼び出せないこと
- [ ] `SkillTool` のツール説明に、`modelInvocable: true` の全コマンドの名称と description が含まれていること

**Phase 2.3 mid-input slash**

- [ ] 入力ボックス本文で `/` を入力すると、コマンド補完メニューが表示されること（行頭に限らない）
- [ ] 補完メニューにコマンド名 + description が表示されること
- [ ] 補完を選択すると、正しく入力ボックスに反映されること