# Phase 2 技術設計ドキュメント：機能拡張

## 1. 設計目標と制約

### 1.1 目標

- 13 個の組み込みコマンドの `supportedModes` を `non_interactive` および/または `acp` を含むように拡張する
- 各拡張コマンドが ACP/non-interactive パスで IDE が消費可能なテキストコンテンツを返すことを保証する
- prompt command のモデル呼び出しパスを確立する（`SkillTool` が `getModelInvocableCommands()` を消費）
- mid-input slash command の基本検出を実装する

### 1.2 必須制約

- **interactive パスの動作劣化なし**：拡張コマンドの既存の interactive 動作は厳密に維持し、`action` 内部にのみモード分岐を追加する。interactive パスのコードには手を付けない
- **実装戦略：モード分岐、二重登録なし**：13 コマンドすべて `action` 内部で `executionMode` の判定を追加する方式を採用。Phase 1 設計ドキュメント §10.2 の二重登録モードは使用しない（二重登録は interactive と non-interactive のロジック差が極めて大きい場合のみ必要であり、本フェーズのコマンド複雑度はその閾値に達していない）
- **ACP メッセージ形式**：ACP パスが返すテキストコンテンツに ANSI スタイルを含めない。IDE プラグインでの消費を想定し、Markdown またはプレーンテキストとする
- **環境依存の副作用のスキップ**：ブラウザ起動（`open()`）、クリップボード操作（`copyToClipboard()`）など GUI 環境に依存する操作は、non-interactive/ACP パスで必ずスキップする

---

## 2. Phase 1 完了後のベースライン状態

Phase 1 終了後のアーキテクチャ要点（Phase 2 はこれを基盤として直接拡張）：

- `commandType` フィールドは `SlashCommand` インターフェースから削除され、全コマンドで明示的な `supportedModes` を使用
- `getEffectiveSupportedModes()` は 2 段階の推論：明示的な `supportedModes` → `CommandKind` によるフォールバック
- `CommandService.getCommandsForMode(mode)` が従来の `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` ホワイトリストを置き換え
- `btw`、`bug`、`compress`、`context`、`init`、`summary` は Phase 1 ですでに全モードに拡張済みであり、本フェーズの対象外
- `createNonInteractiveUI()` の各メソッドはすべて no-op：`addItem`、`clear`、`setDebugMessage`、`setPendingItem`、`reloadCommands` は呼び出しをサイレントに無視

---

## 3. 変更範囲の概要

本フェーズでは計 13 コマンドを対象とし、実装の複雑度に応じて 4 カテゴリに分類する：

| カテゴリ       | コマンド                                         | 変更の要点                                                                             |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| **カテゴリ A**   | `export`                                     | `supportedModes` のみ変更。`action` の全パスはすでに有効な型を返す                                 |
| **interactive のみ** | `plan`、`statusline`                         | 設計判断：これらのコマンドは意味的に UI と強く結合しているため、`supportedModes: ['interactive']` を維持 |
| **カテゴリ A+**  | `language`                                   | `supportedModes` の変更 + 少量の non-interactive 分岐処理                                  |
| **interactive のみ** | `copy`、`restore`                            | 設計判断：クリップボード操作とスナップショット復元は本質的にインタラクティブな操作であるため、`supportedModes: ['interactive']` を維持   |
| **カテゴリ A'**  | `model`、`approval-mode`                     | 引数ありパスはすでに `message` を返す。引数なしパスに non-interactive 分岐を追加（現在は dialog をトリガー）   |
| **カテゴリ B**   | `about`、`stats`、`insight`、`docs`、`clear` | `action` の全パスが戻り値なし、または `addItem`/`clear` を呼び出す。完全な non-interactive 分岐を新規追加   |

---

## 4. カテゴリ A：`supportedModes` のみ変更

これらのコマンドの `action` パスはすべて `message` または `submit_prompt` を返しており、UI 依存が完全にないため、`handleCommandResult` で直接処理可能。

### 4.1 `/export`（およびサブコマンド）

**現状**：`supportedModes: ['interactive']`。すべてのサブコマンド action は `MessageActionReturn` を返す。

**変更**：親コマンドおよび 4 つのサブコマンド（`md`、`html`、`json`、`jsonl`）の `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。

**ACP メッセージ内容**：`action` の既存の戻り値には完全なファイルパス（例：`Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`）が含まれており、IDE での消費に適しているため、テキストの修正は不要。

> **注意**：`/export` 親コマンド自体には `action` がなく、サブコマンドのみが存在する。親コマンドの `supportedModes` を全モードに変更すると、`parseSlashCommand` はサブコマンドルーティングにマッチする。ただし、ユーザーが `/export` のみを入力しサブコマンドを指定しない場合、`commandToExecute.action` は undefined となり、`handleSlashCommand` は `no_command` を返す。呼び出し側は利用可能なサブコマンドのヒントを表示する。これは想定された動作である。

### 4.2 `/plan`

**現状**：`supportedModes: ['interactive']`。`action` の全パスは `MessageActionReturn` または `SubmitPromptActionReturn` を返す。

**設計判断**：`/plan` はユーザーに複数回のインタラクティブな計画を促すコマンドであり、意味的に UI と強く結合している。検討の結果、`supportedModes: ['interactive']` を維持し、non-interactive/acp モードには拡張しない。

### 4.3 `/statusline`

**現状**：`supportedModes: ['interactive']`。`action` は常に `SubmitPromptActionReturn` を返す（subagent 呼び出しの prompt をモデルに送信）。

**設計判断**：`/statusline` は subagent に現在の状態を要約させるコマンドであり、意味的に UI と強く結合している。検討の結果、`supportedModes: ['interactive']` を維持し、non-interactive/acp モードには拡張しない。

---

## 5. カテゴリ A+：少量の non-interactive 分岐処理

### 5.1 `/language`

**現状**：`action` の全パスは `MessageActionReturn` を返す（言語設定の読み取り/設定）。

**処理が必要な副作用**：`setUiLanguage()` 内で `context.ui.reloadCommands()` を呼び出すが、非対話 UI ではすでに no-op となっているため、追加処理は不要。

**変更**：

- 親コマンドおよびサブコマンド（`ui`、`output`、および `SUPPORTED_LANGUAGES` で動的に生成されるサブコマンド）の `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。
- `action` にモード分岐を追加する必要はなく、既存の戻りテキストはすでにマシン消費に適している。

**ACP セマンティクス説明**：non-interactive（単一呼び出し）で `/language ui zh-CN` を実行すると永続化設定が変更され（settings ファイルに書き込み）、その変更は以降の session に適用される。本 session 内の i18n も即時有効化される。これはユーザーの期待と一致する。

### 5.2 `/copy`

**現状**：`action` が `copyToClipboard()` を呼び出す。ACP/headless 環境では例外が発生するか、クリップボードが利用不可のためサイレントに失敗する可能性がある。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。
2. `action` 内にモード分岐を新規追加：

```typescript
// 最後の AI メッセージを取得（既存ロジック、再利用可能）
if (context.executionMode !== 'interactive') {
  // 非対話/ACP：クリップボードをスキップし、コンテンツ自体を返す
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
// interactive パス：既存のクリップボードロジックを維持
await copyToClipboard(lastAiOutput);
return {
  type: 'message',
  messageType: 'info',
  content: 'Last output copied to the clipboard',
};
```

**ACP セマンティクス**：IDE は最後のモデル出力の原文を受信し、クリップボードに書き込むかユーザーに表示するかを自行で決定できる。

### 5.3 `/restore`

**現状**：`supportedModes: ['interactive']`。

**設計判断**：スナップショット復元はツール呼び出しを再実行するため、意味的に UI と強く結合している。検討の結果、`supportedModes: ['interactive']` を維持し、non-interactive/acp モードには拡張しない。

**ACP セマンティクス**：チェックポイントの Git 状態復元と gemini client history 設定は副作用として実行される。IDE は確認メッセージを受信後、ユーザーに「状態が復元されました」と提示できる。ツールの再実行は IDE が自行で決定する。

---

## 6. カテゴリ A'：引数なし dialog パスの non-interactive 処理

### 6.1 `/model`

**現状**：

| 入力                             | 現在の動作                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `/model`（引数なし）               | → `{ type: 'dialog', dialog: 'model' }`（non-interactive では unsupported に変換）      |
| `/model <model-id>`              | 未実装（`--fast` 分岐のみ）                                                     |
| `/model --fast`（model name なし） | → `{ type: 'dialog', dialog: 'fast-model' }`（non-interactive では unsupported に変換） |
| `/model --fast <model-id>`       | → `MessageActionReturn` ✅                                                       |

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。
2. `action` 内の各 dialog パスの前に non-interactive 分岐を挿入：

```typescript
// 引数なしパス（元は dialog: 'model' を返す）
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentModel = config.getModel() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current model: ${currentModel}\nUse "/model <model-id>" to switch models.`,
    };
  }
  return { type: 'dialog', dialog: 'model' };
}

// --fast 引数なしパス（元は dialog: 'fast-model' を返す）
if (args.startsWith('--fast') && !modelName) {
  if (context.executionMode !== 'interactive') {
    const fastModel = context.services.settings?.merged?.fastModel ?? 'not set';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current fast model: ${fastModel}\nUse "/model --fast <model-id>" to set fast model.`,
    };
  }
  return { type: 'dialog', dialog: 'fast-model' };
}
```

**ACP セマンティクス**：IDE は現在のモデル名を表示し、ユーザーの参考とする。モデルの切り替えは引数付き呼び出し（`/model <model-id>`）で実現する。

> **注意**：`/model <model-id>`（`--fast` なし）には現在、現在の session モデルを設定するロジックが実装されておらず、`--fast <model-id>` のみ実装されている。Phase 2 で ACP 下でのメインモデル切り替えをサポートする場合、`/model <model-id>` の set ロジックを同期して実装する必要がある。本設計ではこのパスを予約するが、Phase 2 のオプションとしてマークし、まずは「現在のモデルを表示する」read-only パスの保証を優先する。

### 6.2 `/approval-mode`

**現状**：

| 入力                       | 現在の動作                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `/approval-mode`（引数なし） | → `{ type: 'dialog', dialog: 'approval-mode' }`（non-interactive では unsupported に変換） |
| `/approval-mode <mode>`    | → `MessageActionReturn` ✅                                                          |
| `/approval-mode <invalid>` | → `MessageActionReturn`（error）✅                                                  |

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。
2. 引数なしパス（`!args.trim()`）に non-interactive 分岐を挿入：

```typescript
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentMode = config?.getApprovalMode() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current approval mode: ${currentMode}\nAvailable modes: ${APPROVAL_MODES.join(', ')}\nUse "/approval-mode <mode>" to change.`,
    };
  }
  return { type: 'dialog', dialog: 'approval-mode' };
}
```

---

## 7. カテゴリ B：完全な non-interactive 分岐が必要

これら 5 つのコマンドの `action` は interactive モードで `context.ui.addItem()` を介して React コンポーネントをレンダリングするか `context.ui.clear()` を呼び出し、戻り値は `void` となる。non-interactive ではこれらの呼び出しはすべて no-op となり、`handleSlashCommand` が戻り値なしを `"Command executed successfully."` として処理するため、実際のコンテンツが出力されない。

**実装原則**：`action` の**先頭**で `executionMode` をチェックし、interactive 以外の場合は実際のコンテンツを含む `message` を**早期 return** する。interactive パスのコードには一切手を付けない。

### 7.1 `/about`（altName: `status`）

**データソース**：`getExtendedSystemInfo(context)` は `ExtendedSystemInfo` を返す。含まれるフィールド：`cliVersion`、`osPlatform`、`osArch`、`osRelease`、`nodeVersion`、`modelVersion`、`selectedAuthType`、`ideClient`、`sessionId`、`memoryUsage`、`baseUrl`、`apiKeyEnvKey`、`gitCommit`、`fastModel`。すべてのフィールドは non-interactive で取得可能（`context.services.config` および settings はすでに注入済み）。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。
2. `getExtendedSystemInfo` 呼び出し後、interactive パスの前にモード分岐を挿入：

```typescript
action: async (context) => {
  const systemInfo = await getExtendedSystemInfo(context);

  if (context.executionMode !== 'interactive') {
    const lines = [
      `Qwen Code v${systemInfo.cliVersion}`,
      `Model: ${systemInfo.modelVersion}`,
      `Fast Model: ${systemInfo.fastModel ?? 'not set'}`,
      `Auth: ${systemInfo.selectedAuthType}`,
      `Platform: ${systemInfo.osPlatform} ${systemInfo.osArch} (${systemInfo.osRelease})`,
      `Node.js: ${systemInfo.nodeVersion}`,
      `Session: ${systemInfo.sessionId}`,
      ...(systemInfo.gitCommit ? [`Git commit: ${systemInfo.gitCommit}`] : []),
      ...(systemInfo.ideClient ? [`IDE: ${systemInfo.ideClient}`] : []),
    ];
    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
    };
  }

  // interactive パス：既存の addItem ロジックを維持
  const aboutItem: Omit<HistoryItemAbout, 'id'> = { type: MessageType.ABOUT, systemInfo };
  context.ui.addItem(aboutItem, Date.now());
},
```

### 7.2 `/stats`（およびサブコマンド `model`、`tools`）

**データソース**：`context.session.stats`（`SessionStatsState`）には `sessionStartTime`、`metrics`（`SessionMetrics`：`models`、`tools`、`files`）、`promptCount` が含まれる。non-interactive では、`sessionStartTime` は現在の呼び出し時刻、`metrics` は `uiTelemetryService.getMetrics()` から取得（本呼び出しの累積値、通常はゼロ）、`promptCount` は 1 となる。

**変更**：

1. 親コマンド `stats` およびサブコマンド `model`、`tools` の `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。
2. 親コマンドおよび各サブコマンドの `action` にモード分岐を挿入し、テキスト形式の統計を早期 return する：

```typescript
// /stats 親コマンド
action: (context) => {
  if (context.executionMode !== 'interactive') {
    const now = new Date();
    const { sessionStartTime, promptCount, metrics } = context.session.stats;
    if (!sessionStartTime) {
      return { type: 'message', messageType: 'error', content: 'Session start time unavailable.' };
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
      `Session duration: ${formatDuration(wallDuration)}`,
      `Prompts: ${promptCount}`,
      `API requests: ${totalRequests}`,
      `Tokens — prompt: ${totalPromptTokens}, output: ${totalCandidateTokens}`,
      `Tool calls: ${metrics.tools.totalCalls} (${metrics.tools.totalSuccess} ok, ${metrics.tools.totalFail} fail)`,
      `Files: +${metrics.files.totalLinesAdded} / -${metrics.files.totalLinesRemoved} lines`,
    ];
    return { type: 'message', messageType: 'info', content: lines.join('\n') };
  }

  // interactive パス：既存の addItem ロジックを維持
  const statsItem: HistoryItemStats = { type: MessageType.STATS, duration: formatDuration(wallDuration) };
  context.ui.addItem(statsItem, Date.now());
},
```

サブコマンド `model` および `tools` もそれぞれモード分岐を挿入し、対応する次元のテキスト統計を返す（model 次元はモデル名ごとにトークン使用量をリスト化。tools 次元は各ツールの呼び出し回数をリスト化）。

**補足**：non-interactive 単一呼び出しでは metrics は通常ゼロ（新 session）となるが、構造は完全でありフォーマットに影響しない。ACP Session では累積値を持つ可能性があり、実際の意味を持つ。

### 7.3 `/insight`

**現状**：`action` は `void` を返し、`addItem` で進捗と結果を表示し、最後に `open(outputPath)` でブラウザを開く。コアロジックは `insightGenerator.generateStaticInsight()` による HTML ファイルの生成。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。
2. `executionMode` に応じて 3 方向に分岐：
   - `non_interactive`：同期生成、進捗コールバックを無視、ブラウザを開かず、直接 `message`（ファイルパス）を返す
   - `acp`：非同期で生成を開始、`stream_messages` を介して進捗（`encodeInsightProgressMessage`）と完了（`encodeInsightReadyMessage`）を IDE にプッシュ
   - `interactive`：既存の `addItem` + `setPendingItem` + `open()` ロジックを維持

```typescript
// non_interactive パス
if (context.executionMode === 'non_interactive') {
  const outputPath = await insightGenerator.generateStaticInsight(
    projectsDir,
    () => {}, // no-op 進捗
  );
  return {
    type: 'message',
    messageType: 'info',
    content: t('Insight report generated at: {{path}}', { path: outputPath }),
  };
}

// acp パス：stream_messages
if (context.executionMode === 'acp') {
  // ... streamMessages async generator を構築し、encodeInsightProgressMessage / encodeInsightReadyMessage を yield ...
  return { type: 'stream_messages', messages: streamMessages() };
}

// interactive パス：既存実装を維持
```

**設計理由**：`non_interactive` モード（CLI パイプライン）は `stream_messages` をサポートしないため、単一の `message` のみを返す必要がある。ACP モード（IDE プラグイン）は `stream_messages` を消費して進捗をリアルタイム表示できるため、streaming パスを維持する。

**ACP メッセージ形式**：`encodeInsightProgressMessage(stage, progress, detail?)` は IDE が解析可能な進捗バーメッセージを生成する。`encodeInsightReadyMessage(outputPath)` は IDE にファイルが準備完了であることを通知し、リンクの表示方法は IDE が決定する。

### 7.4 `/docs`

**現状**：`action` は `void` を返し、`addItem` でメッセージを表示し `open(docsUrl)` でブラウザを開く。`SANDBOX` 環境変数の分岐あり（サンドボックス下では `addItem` のみ実行し、ブラウザを開かない）。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。
2. `action` の戻り値型を `Promise<void | MessageActionReturn>` に変更。
3. `action` の先頭に non-interactive 分岐を挿入：

```typescript
action: async (context) => {
  const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
  const docsUrl = `https://qwenlm.github.io/qwen-code-docs/${langPath}`;

  if (context.executionMode !== 'interactive') {
    // 非対話/ACP：URL を直接返し、ブラウザを開かず、addItem も呼び出さない
    return {
      type: 'message',
      messageType: 'info',
      content: `Qwen Code documentation: ${docsUrl}`,
    };
  }

  // interactive パス：既存の SANDBOX 判定 + addItem + open() を維持
  if (process.env['SANDBOX'] && ...) {
    context.ui.addItem(...);
  } else {
    context.ui.addItem(...);
    await open(docsUrl);
  }
},
```

### 7.5 `/clear`（altNames: `reset`、`new`）

**現状**：`action` は以下の操作を実行し `void` を返す：

1. `config.getHookSystem()?.fireSessionEndEvent()` — フックをトリガー（副作用あり）
2. `config.startNewSession()` — 新 session ID を開始（副作用あり）
3. `uiTelemetryService.reset()` — テレメトリカウンターをリセット（副作用あり）
4. `skillTool.clearLoadedSkills()` — skill キャッシュをクリア（副作用あり）
5. `context.ui.clear()` — ターミナル UI をクリア（**UI 副作用、non-interactive 下では no-op**）
6. `geminiClient.resetChat()` — チャット履歴をリセット（副作用あり）
7. `config.getHookSystem()?.fireSessionStartEvent()` — フックをトリガー（副作用あり）

**non-interactive/ACP セマンティクス分析**：

- `ui.clear()` は non-interactive ですでに no-op となっており、処理不要
- `geminiClient.resetChat()`：ACP Session では意味のある副作用（チャット履歴のクリア）であるため維持すべき。non-interactive 単一呼び出しでは、各呼び出しが完全に新しい session であるため、`resetChat` のセマンティクスは重複するが無害
- `config.startNewSession()`：ACP では意味がある（新 session ID の開始）。non-interactive 単一呼び出しでも同様に重複するが無害
- `fireSessionEndEvent` / `fireSessionStartEvent`：ACP では意味がある（フックのトリガー）

**判断**：non-interactive/ACP パスでは意味のある副作用（resetChat、startNewSession、hook events）をすべて維持し、`ui.clear()`（すでに no-op）のみスキップしてコンテキスト境界マークの message を返す。

**変更**：

1. `supportedModes` を `['interactive', 'non_interactive', 'acp']` に変更。
2. `action` の戻り値型を `Promise<void | MessageActionReturn>` に変更。
3. `action` 内、`context.ui.clear()` 呼び出し後（または代替として）モード分岐を追加：

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

    // ui.clear() は非対話下ではすでに no-op だが、引き続き呼び出す（条件分岐は不要）
    context.ui.clear();

    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.resetChat();
    }

    config.getHookSystem()?.fireSessionStartEvent(...).catch(...);
  } else {
    context.ui.clear();
  }

  // モードに応じて戻り値を決定
  if (context.executionMode !== 'interactive') {
    return {
      type: 'message',
      messageType: 'info',
      content: 'Context cleared. Previous messages are no longer in context.',
    };
  }
  // interactive パス：void（戻り値なし、React UI は ui.clear() で更新を駆動）
},
```

**ACP セマンティクス**：IDE はコンテキスト境界マークを受信後、セッション区切り文字（例：「新しいセッションが開始されました」の提示）として表示し、ローカルのチャット履歴キャッシュをクリアできる。

---

## 8. `handleCommandResult` 変更

**結論：変更不要。**

Phase 2 の全コマンド変更後、non-interactive/ACP パスの戻り値型は `message` または `submit_prompt` となり、いずれも `handleCommandResult` の switch 内で正しく処理済み。

---

## 9. `createNonInteractiveUI()` 変更

**結論：変更不要。**

現在の no-op 実装で十分。`addItem`、`clear`、`setPendingItem` などの no-op は B 類コマンドの non-interactive パスでは呼び出されない（早期 return するため）。interactive パスには影響しない。

---

## 10. Phase 2.2：prompt command のモデル呼び出しパス確立

Phase 1 で `CommandService.getModelInvocableCommands()` は実装済みであり、`BundledSkillLoader`、`FileCommandLoader`（ユーザー/プロジェクトコマンド）、`McpPromptLoader` は `modelInvocable: true` を設定済み。

Phase 2.2 の作業は、`SkillTool` が `SkillManager.listSkills()` のみを消費する状態から、`CommandService.getModelInvocableCommands()` も同時に消費するように変更し、モデル呼び出し可能コマンドのエントリポイントを統一することである。

**変更ファイル**：`packages/core/src/tools/SkillTool.ts`（または同等パス）

**具体的な変更**：

1. `SkillTool` の初期化時に `CommandService`（またはその `getModelInvocableCommands()` の結果）を依存性注入として受け取る
2. ツール説明の構築時に、`listSkills()` と `getModelInvocableCommands()` の結果をマージする
3. 組み込みコマンド（`modelInvocable: false`）がツール説明に表示されないことを保証する

> **注**：`SkillTool` の具体的な実装は `packages/core` の内部アーキテクチャに依存するため、本ドキュメントではインターフェース変更のみを記述する。実装詳細は core パッケージの既存構造と合わせて確定する必要がある。

---

## 11. Phase 2.3：mid-input slash command 検出（基本版）

`InputPrompt` コンポーネントでカーソル付近の slash token（行頭に限定しない）を検出し、補完メニューをトリガーする。

**検出ルール**：

- カーソル直前に `/` で始まりスペースを含まない token が存在する場合、コマンド補完をトリガーする
- 補完候補は `getCommandsForMode('interactive')` の表示可能コマンドリストから取得する
- 補完メニューはコマンド名 + description を表示（argumentHint などは Phase 3 で追加）

> 本機能は UI 層の変更に該当し、Phase 2.3 の独立したサブタスクであるため、他の Phase 2.1/2.2 の実装には影響しない。

---

## 12. ファイル変更の概要

### 12.1 コマンドファイルの変更（Phase 2.1）

| ファイル                     | 変更タイプ | 具体的な内容                                                                                                                             |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `exportCommand.ts`       | カテゴリ A     | 親コマンド + 4 サブコマンド：`supportedModes` → 全モード                                                                                    |
| `planCommand.ts`         | interactive のみ   | 設計判断：`supportedModes: ['interactive']` を維持、変更なし                                                                             |
| `statuslineCommand.ts`   | interactive のみ   | 設計判断：`supportedModes: ['interactive']` を維持、変更なし                                                                             |
| `languageCommand.ts`     | カテゴリ A+    | 親コマンド + `ui`/`output` サブコマンド + 動的 language サブコマンド：`supportedModes` → 全モード                                                   |
| `copyCommand.ts`         | interactive のみ   | 設計判断：`supportedModes: ['interactive']` を維持、変更なし                                                                             |
| `restoreCommand.ts`      | interactive のみ   | 設計判断：`supportedModes: ['interactive']` を維持、変更なし                                                                             |
| `modelCommand.ts`        | カテゴリ A'    | `supportedModes` → 全モード + 引数なし/fast model なしパスに非対話分岐を新規追加                                                               |
| `approvalModeCommand.ts` | カテゴリ A'    | `supportedModes` → 全モード + 引数なしパスに非対話分岐を新規追加                                                                              |
| `aboutCommand.ts`        | カテゴリ B     | `supportedModes` → 全モード + 非対話パスで `message` を返す（バージョン/モデル/環境要約）                                                        |
| `statsCommand.ts`        | カテゴリ B     | `supportedModes` → 全モード + 非対話パスで `message` を返す（stats テキスト）。サブコマンドも同期処理                                                |
| `insightCommand.ts`      | カテゴリ B     | `supportedModes` → 全モード + `non_interactive` パスで同期生成し `message`（ファイルパス）を返す。`acp` パスで `stream_messages` を返し進捗をプッシュ |
| `docsCommand.ts`         | カテゴリ B     | `supportedModes` → 全モード + 非対話パスで `message`（ドキュメント URL）を返し、ブラウザを開かない                                                    |
| `clearCommand.ts`        | カテゴリ B     | `supportedModes` → 全モード + `action` 末尾でモードに応じて `message` または `void` を返す                                                           |

### 12.2 その他のファイル変更

| ファイル                                                | 変更内容                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts`              | Phase 2.2：`getModelInvocableCommands()` を接続（詳細設計は別途確定） |
| `packages/cli/src/ui/InputPrompt.tsx`（または同等コンポーネント） | Phase 2.3：mid-input slash 検出ロジック                               |

### 12.3 変更なしのファイル

- `packages/cli/src/nonInteractiveCliCommands.ts`（`handleCommandResult`、`handleSlashCommand` は変更不要）
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts`（スタブ UI は変更不要）
- `packages/cli/src/services/commandUtils.ts`（`filterCommandsForMode`、`getEffectiveSupportedModes` は変更不要）
- `packages/cli/src/services/CommandService.ts`（`getCommandsForMode`、`getModelInvocableCommands` は Phase 1 で実装済み）

---

## 13. テスト戦略

### 13.1 コマンドのユニットテスト

変更対象の各コマンドについて、同一ディレクトリにテストファイル（`*.test.ts`）を新規作成または更新し、以下のケースをカバーする：

**カテゴリ A/A+ コマンド**（`export`、`language`）：

- `supportedModes` が `non_interactive` および `acp` を正しく含む
- `executionMode: 'non_interactive'` 下で、`action` が `MessageActionReturn` または `SubmitPromptActionReturn` を返し、`ui.addItem` または `ui.clear` を呼び出さない
- interactive パスの動作はリファクタ前と完全に一致（スナップショットテスト）

**interactive のみコマンド**（`plan`、`statusline`、`copy`、`restore`）：

- `supportedModes` が `['interactive']` であること（設計判断）
- non-interactive で実行時に正しく `unsupported` を返すことを検証

**カテゴリ A' コマンド**（`model`、`approval-mode`）：

- 引数なし + `executionMode: 'non_interactive'` → 現在の状態の `message` を返し、`dialog` を返さない
- 引数あり + `executionMode: 'non_interactive'` → 既存の `message` ロジックが正常に実行される
- interactive パス：引数なし → `dialog`、引数あり → `message`（変更なし）

**カテゴリ B コマンド**（`about`、`stats`、`insight`、`docs`、`clear`）：

- `executionMode: 'non_interactive'` 下で、`action` が `MessageActionReturn` を返し、`ui.*` メソッドを一切呼び出さない
- 返される `content` 文字列に期待されるキーフィールド（バージョン番号、モデル名、URL など）が含まれる
- interactive パス：`ui.addItem` が呼び出され、`action` は `void` を返す（変更なし）

**`clear` の特殊ケース**：

- `executionMode: 'non_interactive'` 下で、`geminiClient.resetChat()` が引き続き呼び出される（副作用を維持）
- コンテキスト境界 `message` を返し、内容は `'Context cleared. Previous messages are no longer in context.'` である

### 13.2 統合テスト（`handleSlashCommand`）

`nonInteractiveCli.test.ts` または新規作成した統合テストファイルにて：

- `handleSlashCommand('/about', ...)` が non-interactive モードで `{ type: 'message', content: バージョン番号を含む }` を返す
- `handleSlashCommand('/stats', ...)` が non-interactive モードで `{ type: 'message', content: 'Session duration' を含む }` を返す
- `handleSlashCommand('/docs', ...)` が non-interactive モードで `{ type: 'message', content: 'qwenlm.github.io' を含む }` を返す
- `handleSlashCommand('/clear', ...)` が non-interactive モードで `{ type: 'message', content: 'Context cleared.' }` を返す
- `handleSlashCommand('/plan', ...)` が non-interactive モードで `unsupported` を返す（interactive のみコマンド）
- 既存の non-interactive コマンド（`btw`、`bug` など）の動作に劣化がない

### 13.3 `commandUtils` テスト

`commandUtils.test.ts` に追加（または既存テストで継続してカバー）：

- 拡張後のコマンド（`export`、`language` など）が `filterCommandsForMode(commands, 'non_interactive')` および `filterCommandsForMode(commands, 'acp')` のフィルタを正しく通過する
- interactive のみコマンド（`plan`、`statusline`、`copy`、`restore`）が `filterCommandsForMode(commands, 'non_interactive')` で正しくフィルタ除外される

---

## 14. 動作影響分析

| シナリオ                                         | Phase 2 前の動作                                            | Phase 2 後の動作                     | 性質               |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------- | ------------------ |
| non-interactive 下で `/export md` を実行          | ❌ unsupported（フィルタ除外）                                  | ✅ ファイルパス message を返す            | 機能拡張           |
| non-interactive 下で `/plan <task>` を実行        | ❌ unsupported                                            | ❌ unsupported（設計判断：interactive のみ） | 変更なし               |
| non-interactive 下で `/statusline` を実行         | ❌ unsupported                                            | ❌ unsupported（設計判断：interactive のみ） | 変更なし               |
| non-interactive 下で `/language ui zh-CN` を実行  | ❌ unsupported                                            | ✅ 言語を設定し、確認 message を返す      | 機能拡張           |
| non-interactive 下で `/copy` を実行               | ❌ unsupported                                            | ❌ unsupported（設計判断：interactive のみ） | 変更なし               |
| non-interactive 下で `/restore`（引数なし）を実行  | ❌ unsupported                                            | ❌ unsupported（設計判断：interactive のみ） | 変更なし               |
| non-interactive 下で `/restore <id>` を実行       | ❌ unsupported                                            | ❌ unsupported（設計判断：interactive のみ） | 変更なし               |
| non-interactive 下で `/model` を実行              | ❌ unsupported（dialog）                                  | ✅ 現在のモデル名を返す                | 機能拡張           |
| non-interactive 下で `/model <id>` を実行         | ❌ unsupported                                            | 🔄 Phase 2 オプション：切り替えロジックを実装      | 機能拡張（オプション）   |
| non-interactive 下で `/approval-mode` を実行      | ❌ unsupported（dialog）                                  | ✅ 現在の承認モードを返す                | 機能拡張           |
| non-interactive 下で `/approval-mode yolo` を実行 | ❌ unsupported                                            | ✅ モードを設定し、確認を返す              | 機能拡張           |
| non-interactive 下で `/about` を実行              | ❌ "Command executed successfully." を返す（addItem no-op） | ✅ バージョン/モデル/環境要約を返す          | バグ修正 + 機能拡張 |
| non-interactive 下で `/stats` を実行              | ❌ "Command executed successfully." を返す                  | ✅ session 統計テキストを返す           | バグ修正 + 機能拡張 |
| non-interactive 下で `/insight` を実行            | ❌ "Command executed successfully." を返す（生成されるが出力なし）  | ✅ 生成し、ファイルパスを返す              | バグ修正 + 機能拡張 |
| non-interactive 下で `/docs` を実行               | ❌ "Command executed successfully." を返す                  | ✅ ドキュメント URL を返す                    | バグ修正 + 機能拡張 |
| non-interactive 下で `/clear` を実行              | ❌ "Command executed successfully." を返す                  | ✅ コンテキスト境界 message を返す          | バグ修正 + 機能拡張 |
| interactive 下で上記いずれかのコマンドを実行               | ✅ 既存の動作                                               | ✅ 既存の動作（動作劣化なし）              | 変更なし               |

---

## 15. 実装順序

以下の順序での実装を推奨する。各グループは独立して commit および review 可能：

**Batch 1**（約 30 分）：カテゴリ A — `supportedModes` のみ変更

`exportCommand.ts`（およびそのサブコマンド）を修正し、テストの通過を検証。

**Batch 2**（約 45 分）：カテゴリ A+ — 少量の分岐

`languageCommand.ts` を修正し、副作用のあるパスに非対話分岐を追加、対応テストを更新。（`copyCommand.ts` および `restoreCommand.ts` は検討の結果 interactive のみを維持。）

**Batch 3**（約 45 分）：カテゴリ A' — dialog パス

`modelCommand.ts`、`approvalModeCommand.ts` を修正し、引数なしパスに非対話分岐を追加、対応テストを更新。

**Batch 4**（約 1.5 時間）：カテゴリ B — 完全な分岐

`aboutCommand.ts`、`statsCommand.ts`（サブコマンド含む）、`docsCommand.ts` を修正。

**Batch 5**（約 1 時間）：カテゴリ B 特殊 — `insightCommand.ts`、`clearCommand.ts`

これら 2 つのコマンドは副作用が多いため、独立した commit とし、対応テストおよび統合テストを更新。

**Batch 6**（約 2 時間）：Phase 2.2 — prompt command のモデル呼び出しパス確立

`SkillTool` を修正し、`getModelInvocableCommands()` を接続、SkillTool テストを更新。

**Batch 7**（約 2 時間）：Phase 2.3 — mid-input slash 検出

`InputPrompt` コンポーネントを修正し、補完トリガーロジックおよび UI テストを新規追加。

**Batch 8**（約 30 分）：全量テスト + 型チェック

`npm run typecheck`、`cd packages/cli && npx vitest run` を実行し、残りの問題を修正。

---

## 16. 受け入れチェックリスト

**Phase 2.1 コマンド拡張**

- [ ] カテゴリ A：`/export`（およびサブコマンド）、`/plan`、`/statusline` が non-interactive および acp モードで正常に実行され、意味のある出力を返す
- [ ] カテゴリ A+：`/language`（およびサブコマンド）が non-interactive で正常に実行され、永続化設定を行う
- [ ] カテゴリ A+：`/copy` が non-interactive/acp で最後の AI 出力テキストを返す（クリップボード操作なし）
- [ ] カテゴリ A+：`/restore` が引数なしで non-interactive 実行時にチェックポイントリストを返す。引数ありで状態を復元し確認 message を返す（`type: 'tool'` は返さない）
- [ ] カテゴリ A'：`/model` が引数なしで non-interactive/acp 実行時に現在のモデル名を返す（dialog をトリガーしない）。`/model --fast <id>` が正常に設定される
- [ ] カテゴリ A'：`/approval-mode` が引数なしで non-interactive/acp 実行時に現在のモードを返す（dialog をトリガーしない）。引数ありで正常に設定される
- [ ] カテゴリ B：`/about` が non-interactive/acp でバージョン番号、モデル名を含むプレーンテキスト要約を返す
- [ ] カテゴリ B：`/stats`（サブコマンド含む）が non-interactive/acp でプレーンテキスト統計データを返す
- [ ] カテゴリ B：`/insight` が non-interactive/acp で insight ファイルを生成しファイルパスを返す（ブラウザを開かない）
- [ ] カテゴリ B：`/docs` が non-interactive/acp でドキュメント URL を返す（ブラウザを開かない）
- [ ] カテゴリ B：`/clear` が non-interactive/acp でコンテキスト境界マーク message を返し、`geminiClient.resetChat()` が正常に実行される
- [ ] 全 13 コマンドが interactive モードでリファクタ前と完全に一致する動作を示す（動作劣化なし）
- [ ] TypeScript コンパイルでエラーなし（`npm run typecheck`）
- [ ] `npm run lint` で新規エラーなし
- [ ] 既存の全テストが通過（`cd packages/cli && npx vitest run`）

**Phase 2.2 モデル呼び出し**

- [ ] モデルが対話中に `SkillTool` を介して bundled skill、file command（ユーザー/プロジェクト）、MCP prompt を呼び出せる
- [ ] モデルが built-in commands を呼び出せない
- [ ] `SkillTool` のツール説明に `modelInvocable: true` の全コマンドの名前と description が含まれる

**Phase 2.3 mid-input slash**

- [ ] 入力ボックスの本文で `/` を入力するとコマンド補完メニューがトリガーされる（行頭に限定しない）
- [ ] 補完メニューにコマンド名 + description が表示される
- [ ] 補完選択後、正しく入力ボックスに反映される