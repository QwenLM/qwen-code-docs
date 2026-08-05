# WebShell ユーザーメッセージ入力アノテーション

## 背景

WebShell の `@` 機能は、入力ボックス内で選択したファイル、拡張機能、MCP リソース、および host カスタム provider の項目を chip としてレンダリングすることをすでにサポートしています。入力ボックス内の chip は CodeMirror の inline widget に由来し、widget は完全な `WebShellComposerTag` を保持しているため、`id`、`kind`、`label`、`value`、`serialized`、`removable`、および host が `composerTagIcons` 経由で注入した icon を安定的に取得できます。

現在の PR1 の第一版の実装は送信チェーンを変更せず、ユーザーメッセージのレンダリング段階で `content` テキストから `@...` 参照を再パースし、認識できた built-in 参照のみを chip としてレンダリングするものでした。これは `@.qwen/`、`@ext:name`、`@mcp:name` といった一部の可逆なケースを解決しますが、テキストによる推測に依存しているため、実際のすべての入力をカバーすることはできません。

レビューのフィードバックにより、この方向性の根本的な問題が明らかになりました:

- `@Makefile`、`@LICENSE`、`@src/Makefile` は正当なファイル参照ですが、テキストだけでは通常のメンションや package 風トークンと安定的に区別できません。
- `@dataset:users` のような custom provider 参照は、送信後にはテキストしか残らず、デフォルトのレンダリングでは元の `kind`、`label`、`value`、icon を取得できません。
- エスケープされた MCP リソースと末尾の句読点との境界はヒューリスティックでしか処理できず、ルールを継ぎ足し続けても parser は複雑化する一方で、完全な正しさを証明することはできません。

そのため PR1 は範囲を拡大する必要があります。モデルが受け取る prompt テキストを変更しないことを前提に、composer がすでに保持している構造化された入力の metadata を、送信、transcript、ローカルメッセージ、リプレイのチェーンに沿って保存します。ユーザーメッセージのレンダリングは metadata のみを使用して chip をレンダリングし、古いメッセージや metadata が欠落したメッセージは元のテキスト表示のままとして、プレーンテキストからの参照推測は行いません。

ここで、新しいフィールドを `composerTags` と命名することはできません。`composerTag` は現在の `@` chip の実装詳細ですが、WebShell のユーザー入力には他にも `/` slash command、skill command、custom command、system command、local command といった構造化入力があります。新しい送信 metadata は「ユーザー入力中の構造化アノテーション」を表現すべきであり、今期は `@` reference のアノテーションのみを書き込み、将来的には同じフィールドに `/` command のアノテーションを追加できるようにします。

## ゴール

- ユーザーが入力ボックスで確認した `@` reference chip が、送信後のユーザーメッセージバブルでも一貫した chip レンダリングとして維持されること。
- built-in file、extension、MCP tag をサポートすること。拡張子なしのファイルやエスケープされた MCP リソースも含む。
- provider が accepted item 内で `composerTag` を提供している場合、host カスタム provider のデフォルト chip レンダリングをサポートすること。
- モデル側の prompt 内容を変更しないこと。daemon/model は引き続き現在の `buildComposerPrompt(text, tags)` が生成する文字列を受け取る。
- `renderUserMessageContent` による上書き機能を維持すること。host がユーザーメッセージの内容をカスタマイズしている場合、引き続きレンダリングを完全に引き継ぐことができる。
- 古い transcript、古い daemon、metadata なしののメッセージとの互換性を維持すること。内容は引き続きそのまま表示され、chip の追加レンダリングが行われないだけである。
- `/` command、skill command、custom command などの後続の構造化入力のために統一された拡張ポイントを確保すること。

## ノンゴール

- `@` provider の登録プロトコルは変更しない。
- skill の `@skill:` サポートは新規追加しない。WebShell は現在 `/` 経由で skill を参照している。
- icon URL は永続化される transcript に書き込まない。icon は引き続き `composerTagIcons` によって `kind` ごとにレンダリング時に解決される。
- metadata をモデルに渡さず、daemon の prompt パースのセマンティクスも変更しない。
- プレーンテキストから custom provider や拡張子なしファイルの参照を 100% 復元することは試みない。
- 今期は `/` command のレンダリングを変更しない。metadata フィールドが `/` command のアノテーションを保持できる設計にするのみとする。
- 今期は Ctrl+Y retry のアノテーション再構築は補わない。retry は元のユーザーメッセージを再利用し、重複する user echo は新規追加しない。
- 今期は `onSubmitBefore` 失敗後のアノテーションロールバックは補わない。失敗時は prompt は送信チェーンに入らず、現在のキャンセル動作を維持する。

## 範囲の決定

- 今期は `packages/web-shell`、`packages/webui`、`packages/sdk-typescript`、`packages/acp-bridge` の同時修正を受け入れる。最初の 3 つは送信、ローカル echo、transcript/message の型とレンダリングを担当し、`packages/acp-bridge` は daemon の user echo をリプレイ可能な `user_message_chunk.update._meta` に書き込むことを担当する。さもなければ、session のリフレッシュ／再開後にアノテーションを復元できない。
- 通常の送信と queued prompt の両方がアノテーションをサポートする必要がある。queued prompt もユーザーメッセージエリアに今回の入力を表示するため、metadata を保持しないと通常の送信と不一致が生じる。
- `renderUserMessageContent` は引数を拡張し、host のカスタム renderer が `inputAnnotations` を読み取れるようにする必要がある。デフォルト renderer は metadata を使用して chip をレンダリングし、host renderer が引き続き最終的な上書き権を持つ。
- プレーンテキストから `@` chip を推測する fallback は削除し、完全な正しさを保証できないヒューリスティック parser のメンテナンス継続を回避する。
- 今期は `@` reference のアノテーションの生成とレンダリングのみを行う。`/` command、skill command、custom command はデータ構造上のみ予約し、送信後の chip レンダリングは実装しない。

## すでに把握している構造化入力機能

現在の WebShell の入力側には少なくとも以下の構造化機能があります:

- `@` references: `useAtMentionMenu` が提供し、built-in file、extension、MCP server/resource、および host が `atProviders` 経由で注入したカスタム provider を含む。受け入れられると `WebShellComposerTag` が生成され、CodeMirror の inline widget によって chip がレンダリングされる。
- `/` slash commands: `slashCompletion.ts` が補完を提供する。トップレベルの command は daemon の `session.available_commands`、WebShell の local commands、custom commands、skill commands、system commands に由来する。
- `/` subcommands: `slashCompletion.ts` は明示的な `subcommands`、組み込みの subcommand tree、暗黙の subcommand tree をサポートする。例: `/mcp desc`、`/stats model`、`/memory show`、`/skills <skill-name>`。
- command category: `commandDisplay.ts` は command を `custom`、`skill`、`system` に分類する。`App.tsx` は `connection.skills` に基づき、対応する command を skill category としてマークする。
- local slash commands: `localCommands.ts` では `help`、`theme`、`language`、`model`、`mcp`、`skills`、`memory`、`context`、`agents`、`goal`、`tasks`、`extensions` などのローカルコマンドが定義されている。
- shell mode / `!`: composer は shell mode で `!${prompt}` を送信でき、これは別のユーザー入力セマンティクスだが、今期のレンダリング範囲には含めない。

これらの機能から、新しい metadata フィールドは汎用的なアノテーションのリストであり、`@` 専用の tag リストにすべきではないことがわかります。

## 現状のチェーン

### 入力ボックス内

`useComposerCore` は入力ボックス内で inline tags を管理しています。送信時にはすでに `tagsOverride ?? composerTagsRef.current` で完全な `WebShellComposerTag[]` を取得できます。これらの tag は `buildComposerPrompt(text, tags)` に使用され、最終的に daemon に送信される prompt テキストにマージされます。

### 送信とローカル echo

`App.tsx` の `sendPrompt` は `text` と `images` のみを受け取り、`sessionActions.sendPrompt(text, options)` も prompt テキストのみを送信します。WebShell は楽観表示やローカルコマンドの echo のために `store.appendLocalUserMessage(text, images)` を呼び出します。

`appendLocalUserMessage` は現在 `text/images` を `DaemonTextTranscriptBlock` に書き込むだけで、構造化された入力の metadata は保持していません。

### メッセージコンポーネントへのリプレイ

`transcriptBlocksToDaemonMessages` は transcript の user block を `DaemonUserMessage` に変換しますが、現在は `content`、`images`、`timestamp`、`source` のみを保持します。`UserMessage` は `content/images` しか取得できないため、第一版の実装ではテキスト parser によって tag を再推測するしかありませんでした。

## 方案の概要

UI 専用の metadata チェーンを新たに追加します。これは隣接するが役割の異なる 2 つのパスに分かれます。現在のページの楽観 echo と、daemon transcript の永続化 echo です。

```text
CodeMirror inline tags
  -> submitText / submitPromptFromEditor
  -> sendPrompt options
  -> sessionActions.sendPrompt / sessionActions.submitPrompt options
  -> A. store.appendLocalUserMessage(text, images, { inputAnnotations })
     -> 現在の tab にユーザーメッセージの chip を即座に表示
  -> B. PromptRequest._meta.inputAnnotations
     -> bridge echoPromptToSessionBus が user_message_chunk.update._meta にマージ
     -> replay/load が同一バッチの session_update イベントを取得
     -> normalizeDaemonEvent が user.text.delta.meta.inputAnnotations を生成
     -> reduceDaemonTranscriptEvents が DaemonTextTranscriptBlock.meta.inputAnnotations に書き込み
     -> transcriptBlocksToDaemonMessages
     -> DaemonUserMessage.inputAnnotations
     -> UserMessage のデフォルト renderer
```

`content` は引き続き、モデルと daemon が処理すべき prompt テキストです。`inputAnnotations` は UI レンダリングに必要な構造化入力のみを記述し、モデル入力には関与しません。

## データ構造

汎用的な入力アノテーション構造を新規追加し、トップレベルのフィールド名は `inputAnnotations` とします:

```ts
interface DaemonUserMessage {
  id: string;
  role: 'user';
  content: string;
  images?: Array<{ data: string; mimeType: string }>;
  source?: string;
  inputAnnotations?: DaemonInputAnnotation[];
}
```

`DaemonInputAnnotation` は「content 内の特定のテキスト区間に対応する構造化セマンティクス」を表現します。設計原則として、外側の annotation wrapper のみを新規追加し、内部の payload は可能な限り既存の `@` と `/` のオブジェクト形式を再利用し、`WebShellComposerTag`、`CommandInfo` と並行する新たなプロトコルの出現を回避します。今期は `type: 'reference'` のみを導入し、将来的な `/` command は同じ配列を再利用して拡張できます:

```ts
interface DaemonInputReferenceAnnotation {
  type: 'reference';
  start: number;
  end: number;
  text: string;
  reference: DaemonInputReference;
}

interface DaemonInputReference {
  id: string;
  kind?: string;
  label?: string;
  value?: string;
  serialized?: string;
  removable?: boolean;
}

type DaemonInputAnnotation = DaemonInputReferenceAnnotation;
```

`start/end` は最終的な `content` に対する UTF-16 オフセットであり、React/CodeMirror の現在の文字列処理と一致します。これにより、後続のレンダリングで `serialized` に頼って `content` から位置を逆引きする必要がなくなり、同一参照の複数出現、同一 command、inline テキストの混在にも対応する余地が残されます。

今期の `@` reference の payload は既存の `WebShellComposerTag` を直接再利用します:

```ts
interface WebShellComposerTag {
  id: string;
  kind?: string;
  label?: string;
  value?: string;
  serialized?: string;
  removable?: boolean;
}
```

将来の `/` command の payload は既存の `CommandInfo` を直接再利用し、annotation 層に `subcommandPath` を補うだけです:

```ts
interface CommandInfo {
  name: string;
  description: string;
  argumentHint?: string;
  subcommands?: string[];
  source?: string;
  displayCategory?: 'custom' | 'skill' | 'system';
}
```

SDK の transcript block の `meta` にも同じ `inputAnnotations` を保存します:

```ts
interface DaemonTextDeltaMeta {
  inputAnnotations?: DaemonInputAnnotation[];
}
```

実装時、SDK パッケージは WebShell の client 型を import すべきではありません。SDK には `WebShellComposerTag`、`CommandInfo` とフィールド互換の最小限の meta 構造を定義し、WebShell adapter がその構造を client のレンダリングに必要な型に変換します。これにより SDK が WebShell に逆依存することを避けつつ、フィールドの形状を既存の `@` / `/` の形式と一致させられます。

## 主要な修正ポイント

### 1. 送信チェーンに inputAnnotations を持たせる

editor の submit のパラメータ形式を調整し、`sendPrompt` が送信時の `DaemonInputAnnotation[]` を取得できるようにします。

軽量な options フィールドの新規追加を提案します:

```ts
interface SendPromptInputMetadata {
  inputAnnotations?: DaemonInputAnnotation[];
}
```

`useComposerCore.submitText()` は prompt テキストを生成する時点で、すでに `tags` と最終的な `prompt` を把握しています。今期の `@` tags を `reference` annotations に変換し、上位の `onSubmit` を呼び出す必要があります:

- `promptText`: 現在 daemon に送信されるテキスト。変更しない。
- `images`: 現在の画像。
- `inputAnnotations`: 送信時点の構造化入力アノテーションのスナップショット。

現在の `onSubmit` のシグネチャが直接の拡張に適さない場合、既存の呼び出しを壊さないよう、4 番目の metadata パラメータを新規追加できます:

```ts
onSubmit(promptText, images, commitAccepted, { inputAnnotations });
```

今期の annotation 生成ルール:

- `buildComposerPrompt(text, tags)` が生成する tag のプレフィックスに対して `start/end` を計算する。
- 各 tag は 1 つの `type: 'reference'` annotation に対応する。
- `annotation.text` には最終的な prompt 内の実際の serialized テキストを使用する。
- `annotation.reference` には元の `WebShellComposerTag` の最小限の安全なフィールドを保存する: `id/kind/label/value/serialized/removable`。
- icon URL は保存しない。icon は引き続きレンダリング時に `kind + composerTagIcons` で解決される。

将来的に `/` command も構造化レンダリングが必要になった場合、slash completion の accept 時に `type: 'command'` annotation を生成するか、submit 段階でヒットした `CommandInfo` に基づいて command annotation を生成できます。command の payload は既存の `CommandInfo` のフィールドをそのまま保存し、subcommand 情報は annotation wrapper の `subcommandPath` に格納します。

### 2. ローカル transcript の echo に metadata を保存する

SDK の transcript store を拡張します:

```ts
appendLocalUserMessage(
  text: string,
  images?: Array<{ data: string; mimeType: string }>,
  meta?: { inputAnnotations?: DaemonInputAnnotation[] },
): void;
```

`appendLocalUserTranscriptMessage` も同様に `meta` を受け取ります:

```ts
appendLocalUserTranscriptMessage(state, text, { images, meta });
```

user text block の作成後に書き込みます:

```ts
if (opts.meta) {
  block.meta = { ...block.meta, ...opts.meta };
}
```

このチェーンは、現在のフロントエンド store 内の楽観的なユーザーメッセージに即座に chip を持たせることのみを保証します。リフレッシュや session 再開後も metadata を取得できることは単独では保証しません。リフレッシュ後の transcript は daemon の replay に由来し、現在の tab のメモリ内の local append ではないためです。

input annotations のないローカル slash command は引き続き空の metadata を渡し、既存の動作は変更しません。

### 3. daemon の prompt echo に metadata を永続化する

`PromptRequest` はすでに `_meta?: Record<string, unknown> | null` をサポートしています。送信時に同一の `inputAnnotations` を `PromptRequest._meta.inputAnnotations` に書き込みます:

```ts
const promptRequest = {
  prompt: toDaemonPromptContent(text, normalizedImages),
  _meta: inputAnnotations.length > 0 ? { inputAnnotations } : undefined,
};
```

bridge は `sendPrompt` 内で request を agent prompt に渡すと同時に、`echoPromptToSessionBus` によって `user_message_chunk` を公開します。ここで request の `_meta.inputAnnotations` を echo の `update._meta` にマージする必要があります:

```ts
_meta: {
  ...pickUserInputEchoMeta(req._meta),
  serverTimestamp,
  source: 'bridge-echo',
}
```

`pickUserInputEchoMeta` は `inputAnnotations` のみを保持し、未知の request meta をそのままユーザーメッセージの transcript に書き込みません。これにより、telemetry、requestId、retry などの非 UI データが `UserMessage` に公開されることを回避します。

replay 時、`DaemonSessionProvider` は `compactedReplay/liveJournal` を UI events に再 normalize します。`normalizeDaemonEvent` はすでに `user_message_chunk.update._meta` を `user.text.delta.meta` に配置しており、transcript reducer はすでに text event の `meta` を `DaemonTextTranscriptBlock.meta` に書き込んでいます。そのため、daemon の echo イベントに `inputAnnotations` が含まれていれば、リフレッシュや同一 session の再開後も chip のレンダリングを復元できます。

### 4. transcript adapter が metadata を転送する

`transcriptBlocksToDaemonMessages` はすでに user block の `meta.source` を読み取っています。同じ箇所で `meta.inputAnnotations` を読み取り、配列であることを検証した上で `DaemonUserMessage.inputAnnotations` に書き込みます。

ここでは最小限の構造検証を行い、transcript 内の未知の meta がレンダリングに影響しないようにする必要があります:

- 配列でなければならない。
- 各 annotation は非空の string である `id/type/text` を持たなければならない。
- `start` と `end` は有限の数値であり、`0 <= start < end <= content.length` を満たさなければならない。
- 今期は `type: 'reference'` の annotation のみ生成・レンダリングする。後続の command annotation は同じフィールド配下で拡張できる。
- reference の payload は `WebShellComposerTag` のフィールドに基づき最小限のサニタイズを行い、`id/kind/label/value/serialized` の string 値と `removable` の boolean 値のみを受け付ける。
- command の payload は `CommandInfo` のフィールドに基づき最小限のサニタイズを行い、`name/description/argumentHint/source/displayCategory` の string 値と `subcommands` の string 配列のみを受け付ける。
- 未知のフィールドは保持しない。

### 5. UserMessage は inputAnnotations を優先的に使用する

`UserMessage` の props に追加します:

```ts
inputAnnotations?: DaemonInputAnnotation[];
```

`renderUserMessageContent` の引数にも同名のフィールドを同期して追加します:

```ts
renderUserMessageContent?.({ content, images, inputAnnotations });
```

デフォルトのレンダリングロジックは以下のように変更します:

1. `inputAnnotations` に正当な `type: 'reference'` アノテーションが存在する場合、`start/end` で `content` を分割して chip をレンダリングする。
2. metadata が欠落しているか、正当な annotation がない場合、元のテキストをそのままレンダリングする。
3. host が `renderUserMessageContent` を提供している場合、引き続き host renderer を優先する。

metadata レンダリングは `content` から tag の種類を推測せず、serialized テキストによる位置検索も不要です。range が不正または相互に重複する場合、該当する annotation は無視し、ユーザーの内容を一切隠さないことを保証します。

### 6. テキスト parser の fallback を削除する

`splitComposerTagContent` は保持しません。理由は、古い parser は文字列の形状からの参照種別の推測しかできないためです:

- `@Makefile` と `@alice` はどちらも正当なテキストになり得る。
- `@dataset:users` は provider の metadata がなければ label/value/icon を把握できない。
- エスケープされた MCP リソースの末尾句読点は、汎用ルールでの正しさの証明が困難である。

そのため、デフォルトのユーザーメッセージは annotation が存在する場合のみ chip をレンダリングし、annotation が欠落している場合は元のテキストを表示します。これにより、レビューで指摘された `@Makefile` の問題はヒューリスティックに依存しなくなります。新しいメッセージは metadata から明確な file tag を取得するためです。

## Custom provider の動作

provider が accepted item 内で以下を提供している場合:

```ts
composerTag: {
  id: 'dataset:users',
  kind: 'dataset',
  label: 'Dataset',
  value: 'users',
  serialized: '@dataset:users',
}
```

送信後のデフォルトのユーザーメッセージは以下をレンダリングできます:

- label: `Dataset`
- value: `users`
- icon: `composerTagIcons.dataset` 経由で解決

provider が `composerTag` を提供していない場合、送信後もプレーンテキストのみとなり、デフォルト renderer は custom provider の自動認識を保証しません。host は引き続き `renderUserMessageContent` で独自に処理できます。

## 互換性

- 古い transcript には `meta.inputAnnotations` がなく、引き続き元のテキストで表示される。
- 新しい client が古い daemon のイベントを読み取る際の動作に変更はない。
- 古い client が `meta.inputAnnotations` を含む transcript を読み取る際、未知の meta は無視される。
- `content` は不変のため、daemon の prompt パース、モデル入力、slash command のテキスト、過去の prompt 内容には影響しない。
- `renderUserMessageContent` の優先度は不変であり、host のカスタムレンダリングがデフォルトの chip に上書きされることはない。

## テスト計画

### Unit tests

- `appendLocalUserTranscriptMessage` が `meta.inputAnnotations` を保存する。
- `createDaemonTranscriptStore().appendLocalUserMessage` が metadata を受け取り保持できる。
- `sessionActions.sendPrompt` と `sessionActions.submitPrompt` が `inputAnnotations` を `PromptRequest._meta` に書き込める。
- bridge の `echoPromptToSessionBus` は `inputAnnotations` のみを `user_message_chunk.update._meta` にマージし、未知の request meta を transcript の echo に書き込まない。
- replay の `user_message_chunk.update._meta.inputAnnotations` が `normalizeDaemonEvent` と reducer を経て `DaemonTextTranscriptBlock.meta.inputAnnotations` に書き込まれる。
- `transcriptBlocksToDaemonMessages` が user block の `meta.inputAnnotations` を `DaemonUserMessage.inputAnnotations` に変換する。
- `transcriptBlocksToDaemonMessages` が不正な annotation meta をフィルタリングする。
- `UserMessage` が reference annotation を使用して `@Makefile`、`@LICENSE`、`@src/Makefile` をレンダリングする。
- `UserMessage` が reference annotation を使用して custom provider の tag をレンダリングし、`composerTagIcons` を解決する。
- `UserMessage` は metadata が欠落している場合、元のテキスト表示を維持する。
- `UserMessage` は annotation の range が不正または重複している場合、その annotation を無視し、原文を失わない。
- 予約された command annotation の型は schema 検証で保持され得るが、今期のデフォルトレンダリングはそれを無視し、reference のレンダリングに影響しない。

### Integration / ブラウザでの検証

- ローカルの WebShell で `.qwen/`、`Makefile`、`LICENSE` を選択し、送信後もユーザーメッセージに file chip が表示される。
- MCP リソースを選択し、送信後のユーザーメッセージに MCP chip が表示され、resource 内のエスケープ文字が誤って trim されない。
- custom provider を注入して選択・送信し、ユーザーメッセージに custom の label/value/icon が表示される。
- ページをリフレッシュするか同一 session を再開しても、ユーザーメッセージの chip が維持される。

## リスクと対策

- リスク: パッケージ間の型の増加により PR の面積が拡大する。対策は SDK に最小限の `DaemonInputAnnotation` を定義し、SDK が WebShell の client 型を import することを避けること。
- リスク: metadata と `content` の不一致がレンダリングのずれを引き起こす。対策は UserMessage が正当かつ重複しない range のみを使用し、不正な annotation は直接無視して、ユーザーの内容を一切隠さないこと。
- リスク: custom provider 情報の永続化に host のカスタムフィールドが含まれ得る。対策は `id/kind/label/value/serialized/removable` のみを保存し、未知のフィールドと icon URL は保存しないこと。
- リスク: PR1 の範囲拡大によりレビューコストが上昇する。対策はコミット説明で motivation を明確にすること。これはプレーンテキスト parser が file/custom/MCP の identity を正しく復元できない根本原因を解決するためであり、同時にモデル向けの prompt は不変であることを示す。
- リスク: トップレベルの metadata の命名が狭すぎると、将来の `/` 機能を制限する。対策は `inputAnnotations` を統一された入口とし、今期は `type: 'reference'` のみを書き込むこと。

## 実装順序

1. SDK の transcript 型に input annotation meta の最小構造を追加する。
2. `appendLocalUserTranscriptMessage` と `DaemonTranscriptStore.appendLocalUserMessage` を拡張する。
3. WebShell の submit options を拡張し、`useComposerCore` から `App.sendPrompt`、queued prompt の submit まで `inputAnnotations` を伝達する。
4. 楽観 echo の `store.appendLocalUserMessage` 書き込み時に `inputAnnotations` を付与する。
5. daemon の `PromptRequest._meta` に `inputAnnotations` を書き込み、bridge の user echo がそれを `user_message_chunk.update._meta` にマージするようにする。
6. `transcriptBlocksToDaemonMessages` で `meta.inputAnnotations` を転送しサニタイズする。
7. `DaemonUserMessage`、`MessageList` から `UserMessage` までの props チェーンを拡張する。
8. `renderUserMessageContent` の引数を拡張し、host renderer に `inputAnnotations` を公開する。
9. `UserMessage` のデフォルトレンダリングは metadata のみを使用する。metadata がない場合はテキストをそのまま表示する。
10. unit tests とブラウザでの受け入れ検証のスクリーンショットを補完する。

## PR 説明のポイント

PR の説明には以下を明記する必要があります:

- これはモデルの prompt を変更するものではなく、WebShell がすでに保持している UI input annotation の metadata を保存するものであること。
- プレーンテキスト parser は `@Makefile`、`@alice`、`@dataset:users` などの形式を信頼性高く区別できないため、metadata が必要であること。
- 古いメッセージは引き続き元のテキスト表示で互換性を保ち、custom provider は `composerTag` を提供した場合のみデフォルトの chip レンダリングの恩恵を受けること。
- 新しいフィールド名は `inputAnnotations` で、今期は `@` reference のみを保持し、将来的には `/` command、skill command、custom command などの構造化入力を保持できること。
- `renderUserMessageContent` は引き続き host の最終的な上書きの出口であること。
