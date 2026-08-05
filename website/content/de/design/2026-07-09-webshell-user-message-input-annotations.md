# WebShell user message input annotations

## Hintergrund

Die `@`-Fähigkeit der WebShell unterstützt bereits das Rendern ausgewählter Dateien, Extensions, MCP-Ressourcen und host-definierter Provider-Einträge als Chips im Eingabefeld. Die Chips im Eingabefeld stammen von CodeMirror-Inline-Widgets; die Widgets halten das vollständige `WebShellComposerTag`, sodass `id`, `kind`, `label`, `value`, `serialized`, `removable` sowie das vom Host über `composerTagIcons` injizierte Icon stabil verfügbar sind.

Die erste Implementierung des aktuellen PR1 hat die Sendekette nicht verändert, sondern nur in der Rendering-Phase der Benutzernachricht `@...`-Referenzen aus dem `content`-Text neu geparst und die erkennbaren Built-in-Referenzen als Chips gerendert. Das löste einen Teil der umkehrbaren Szenarien, z. B. `@.qwen/`, `@ext:name`, `@mcp:name`, aber es verlässt sich auf Text-Raterei und kann nicht alle realen Eingaben abdecken.

Das Review-Feedback hat das grundlegende Problem dieser Richtung offengelegt:

- `@Makefile`, `@LICENSE`, `@src/Makefile` sind gültige Dateireferenzen, aber allein anhand des Textes lassen sie sich nicht stabil von normalen Mentions oder Package-artigen Tokens unterscheiden.
- Custom-Provider-Referenzen wie `@dataset:users` haben nach dem Senden nur noch Text; das Standard-Rendering bekommt das ursprüngliche `kind`, `label`, `value` und Icon nicht.
- Die Grenzen zwischen escaped MCP-Ressourcen und nachgestellter Zeichensetzung lassen sich nur heuristisch behandeln; weitere Regeln würden den Parser immer komplexer machen und könnten dennoch keine vollständige Korrektheit beweisen.

Daher muss PR1 den Umfang erweitern: Ohne den Prompt-Text zu ändern, den das Modell erhält, werden die strukturierten Eingabe-Metadaten, die der Composer bereits besitzt, entlang der Submit-, Transkript-, lokalen Nachrichten- und Replay-Kette gespeichert. Das Rendern der Benutzernachricht verwendet nur die Metadaten, um Chips zu rendern; alte Nachrichten oder Nachrichten ohne Metadaten bleiben als Rohtext angezeigt, und es wird nicht mehr versucht, Referenzen aus reinem Text zu raten.

Das neue Feld darf hier nicht `composerTags` genannt werden. `composerTag` ist ein Implementierungsdetail der aktuellen `@`-Chips, aber die Benutzereingabe der WebShell enthält auch `/`-Slash-Commands, Skill-Commands, Custom-Commands, System-Commands, Local-Commands und andere strukturierte Eingaben. Die neuen Sende-Metadaten sollten „strukturierte Annotationen in der Benutzereingabe" ausdrücken; in dieser Phase werden nur `@`-Referenz-Annotationen geschrieben, später können im selben Feld `/`-Command-Annotationen hinzukommen.

## Ziele

- Die `@`-Referenz-Chips, die der Benutzer im Eingabefeld sieht, werden nach dem Senden in der Benutzernachricht-Sprechblase konsistent als Chips gerendert.
- Unterstützung von Built-in-Datei-, Extension- und MCP-Tags, einschließlich Dateien ohne Erweiterung und escaped MCP-Ressourcen.
- Unterstützung des Standard-Chip-Renderings für Host-Custom-Provider, sofern der Provider im accepted item ein `composerTag` liefert.
- Der Prompt-Inhalt auf Modellseite bleibt unverändert; Daemon/Modell erhalten weiterhin den String, den das aktuelle `buildComposerPrompt(text, tags)` erzeugt.
- Die Override-Fähigkeit von `renderUserMessageContent` bleibt erhalten; wenn der Host den Inhalt der Benutzernachricht angepasst hat, kann er das Rendering weiterhin vollständig übernehmen.
- Kompatibilität mit alten Transkripten, alten Daemons und Nachrichten ohne Metadaten: Der Inhalt wird weiterhin unverändert angezeigt, nur ohne zusätzliche Chips.
- Einheitliche Erweiterungspunkte für nachfolgende strukturierte Eingaben wie `/`-Commands, Skill-Commands und Custom-Commands vorbehalten.

## Nicht-Ziele

- Das `@`-Provider-Registrierungsprotokoll wird nicht geändert.
- Keine neue `@skill:`-Unterstützung für Skills; die WebShell referenziert Skills aktuell über `/`.
- Icon-URLs werden nicht in das persistierte Transkript geschrieben. Icons werden weiterhin über `composerTagIcons` nach `kind` zur Renderzeit aufgelöst.
- Metadaten werden nicht an das Modell übergeben, und die Daemon-Prompt-Parsing-Semantik wird nicht geändert.
- Es wird nicht versucht, alle Custom-Provider-Referenzen oder Dateireferenzen ohne Erweiterung zu 100 % aus reinem Text wiederherzustellen.
- Das Rendering von `/`-Commands wird in dieser Phase nicht geändert; das Metadatenfeld wird nur so gestaltet, dass es `/`-Command-Annotationen tragen kann.
- Der Annotation-Wiederaufbau für Ctrl+Y-Retry wird in dieser Phase nicht nachgerüstet; der Retry verwendet die ursprüngliche Benutzernachricht wieder und erzeugt kein doppeltes User-Echo.
- Der Annotation-Rollback nach einem Fehlschlagen von `onSubmitBefore` wird in dieser Phase nicht nachgerüstet; bei einem Fehler tritt der Prompt nicht in die Sendekette ein, das aktuelle Abbruchverhalten bleibt bestehen.

## Umfangsentscheidungen

- In dieser Phase werden `packages/web-shell`, `packages/webui`, `packages/sdk-typescript` und `packages/acp-bridge` gleichzeitig geändert. Die ersten drei sind für Submit, lokales Echo, Transkript-/Nachrichtentypen und Rendering zuständig; `packages/acp-bridge` ist dafür zuständig, das Daemon-User-Echo in das replaybare `user_message_chunk.update._meta` zu schreiben, andernfalls können die Annotationen nach dem Aktualisieren/erneuten Öffnen der Session nicht wiederhergestellt werden.
- Normales Senden und Queued-Prompts müssen beide Annotationen unterstützen. Queued-Prompts zeigen die aktuelle Eingabe ebenfalls im Benutzernachricht-Bereich an; ohne Metadaten ergäbe sich eine Inkonsistenz zum normalen Senden.
- `renderUserMessageContent` muss um Eingabeparameter erweitert werden, damit der Host-Custom-Renderer `inputAnnotations` lesen kann. Der Standard-Renderer rendert Chips anhand der Metadaten; der Host-Renderer behält weiterhin das letzte Override-Recht.
- Der Fallback, der `@`-Chips aus reinem Text ableitet, wird entfernt, um nicht weiter einen Parser mit Heuristiken zu pflegen, der nicht vollständig korrekt sein kann.
- In dieser Phase werden nur `@`-Referenz-Annotationen erzeugt und gerendert; für `/`-Commands, Skill-Commands und Custom-Commands wird nur in der Datenstruktur etwas vorbehalten, ohne Chip-Rendering nach dem Senden zu implementieren.

## Recherchierte strukturierte Eingabefähigkeiten

Die Eingabeseite der WebShell hat aktuell mindestens folgende strukturierte Fähigkeiten:

- `@`-Referenzen: bereitgestellt von `useAtMentionMenu`, umfassen Built-in-Dateien, Extensions, MCP-Server/-Ressourcen sowie Custom-Provider, die der Host über `atProviders` injiziert. Nach Annahme wird ein `WebShellComposerTag` erzeugt und der Chip über ein CodeMirror-Inline-Widget gerendert.
- `/`-Slash-Commands: die Vervollständigung wird von `slashCompletion.ts` bereitgestellt. Top-Level-Commands kommen aus `session.available_commands` des Daemons, aus WebShell-Local-Commands, Custom-Commands, Skill-Commands und System-Commands.
- `/`-Subcommands: `slashCompletion.ts` unterstützt explizite `subcommands`, eingebaute Subcommand-Trees und implizite Subcommand-Trees. Beispiele: `/mcp desc`, `/stats model`, `/memory show`, `/skills <skill-name>`.
- Command-Kategorien: `commandDisplay.ts` teilt Commands in `custom`, `skill`, `system` ein. `App.tsx` markiert anhand von `connection.skills` die entsprechenden Commands als Skill-Kategorie.
- Lokale Slash-Commands: in `localCommands.ts` sind `help`, `theme`, `language`, `model`, `mcp`, `skills`, `memory`, `context`, `agents`, `goal`, `tasks`, `extensions` und andere lokale Befehle definiert.
- Shell-Mode / `!`: der Composer kann im Shell-Mode `!${prompt}` senden; das ist eine weitere Semantik der Benutzereingabe, gehört aber nicht zum Rendering-Umfang dieser Phase.

Diese Fähigkeiten zeigen, dass das neue Metadatenfeld eine allgemeine Annotationsliste sein sollte und nicht nur eine Tag-Liste für `@`.

## Aktuelle Ketten

### Im Eingabefeld

`useComposerCore` verwaltet Inline-Tags im Eingabefeld. Beim Submit sind die vollständigen `WebShellComposerTag[]` bereits über `tagsOverride ?? composerTagsRef.current` verfügbar. Diese Tags werden für `buildComposerPrompt(text, tags)` verwendet und letztlich in den an den Daemon gesendeten Prompt-Text zusammengeführt.

### Senden und lokales Echo

`sendPrompt` in `App.tsx` nimmt nur `text` und `images` entgegen, und `sessionActions.sendPrompt(text, options)` sendet ebenfalls nur den Prompt-Text. Für optimistische Anzeige oder Local-Command-Echos ruft die WebShell `store.appendLocalUserMessage(text, images)` auf.

`appendLocalUserMessage` schreibt aktuell nur `text/images` in den `DaemonTextTranscriptBlock` und trägt keine strukturierten Eingabe-Metadaten.

### Replay in die Nachrichtenkomponente

`transcriptBlocksToDaemonMessages` wandelt Transkript-User-Blöcke in `DaemonUserMessage` um und behält aktuell nur `content`, `images`, `timestamp` und `source`. `UserMessage` bekommt nur `content/images`, daher konnte die erste Implementierung Tags nur über einen Text-Parser neu raten.

## Lösung im Überblick

Es wird eine neue reine UI-Metadaten-Kette hinzugefügt. Sie teilt sich in zwei benachbarte Pfade mit unterschiedlichen Verantwortlichkeiten: das optimistische Echo der aktuellen Seite und das persistierte Echo des Daemon-Transkripts.

```text
CodeMirror inline tags
  -> submitText / submitPromptFromEditor
  -> sendPrompt options
  -> sessionActions.sendPrompt / sessionActions.submitPrompt options
  -> A. store.appendLocalUserMessage(text, images, { inputAnnotations })
     -> 当前 tab 立即显示用户消息 chip
  -> B. PromptRequest._meta.inputAnnotations
     -> bridge echoPromptToSessionBus 合并到 user_message_chunk.update._meta
     -> replay/load 得到同一批 session_update 事件
     -> normalizeDaemonEvent 生成 user.text.delta.meta.inputAnnotations
     -> reduceDaemonTranscriptEvents 写入 DaemonTextTranscriptBlock.meta.inputAnnotations
     -> transcriptBlocksToDaemonMessages
     -> DaemonUserMessage.inputAnnotations
     -> UserMessage default renderer
```

`content` bleibt der Prompt-Text, den Modell und Daemon verarbeiten müssen. `inputAnnotations` beschreibt nur die strukturierten Eingaben, die das UI-Rendering benötigt, und nimmt nicht am Modell-Input teil.

## Datenstrukturen

Es wird eine neue allgemeine Eingabe-Annotationsstruktur hinzugefügt; das Top-Level-Feld heißt `inputAnnotations`:

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

`DaemonInputAnnotation` drückt „die strukturierte Semantik eines Textabschnitts in `content`" aus. Das Designprinzip lautet, nur einen äußeren Annotation-Wrapper hinzuzufügen und für die innere Payload möglichst die bestehenden Objektformate von `@` und `/` wiederzuverwenden, um ein neues Parallelprotokoll zu `WebShellComposerTag` und `CommandInfo` zu vermeiden. In dieser Phase wird nur `type: 'reference'` umgesetzt; spätere `/`-Commands können dasselbe Array weiterverwenden:

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

`start/end` sind UTF-16-Offsets relativ zum endgültigen `content`, konsistent mit der aktuellen String-Verarbeitung in React/CodeMirror. Das vermeidet, dass späteres Rendering die Position über `serialized` aus `content` zurückgesucht werden muss, und lässt Raum für mehrere identische Referenzen, identische Commands und Inline-Text-Mischungen.

In dieser Phase wird für die `@`-Referenz-Payload direkt das bestehende `WebShellComposerTag` wiederverwendet:

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

Die zukünftige `/`-Command-Payload verwendet direkt das bestehende `CommandInfo` und ergänzt auf Annotation-Ebene nur `subcommandPath`:

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

Im `meta` des SDK-Transkript-Blocks werden dieselben `inputAnnotations` gespeichert:

```ts
interface DaemonTextDeltaMeta {
  inputAnnotations?: DaemonInputAnnotation[];
}
```

Bei der Implementierung sollte das SDK-Package keine WebShell-Client-Typen importieren. Im SDK wird eine minimale Meta-Struktur definiert, die zu den Feldern von `WebShellComposerTag` und `CommandInfo` kompatibel ist; der WebShell-Adapter wandelt diese Struktur dann in die für das Client-Rendering benötigten Typen um. So wird eine umgekehrte Abhängigkeit des SDK von der WebShell vermieden und gleichzeitig die Feldform konsistent zu den bestehenden `@`- / `/`-Formaten gehalten.

## Wichtige Änderungspunkte

### 1. Die Submit-Kette trägt inputAnnotations

Die Parameterform des Editor-Submits wird angepasst, damit `sendPrompt` die `DaemonInputAnnotation[]` zum Submit-Zeitpunkt erhält.

Vorgeschlagen wird ein leichtes Options-Feld:

```ts
interface SendPromptInputMetadata {
  inputAnnotations?: DaemonInputAnnotation[];
}
```

`useComposerCore.submitText()` kennt beim Erzeugen des Prompt-Textes bereits `tags` und den endgültigen `prompt`. Es muss die `@`-Tags dieser Phase in `reference`-Annotationen umwandeln und dann das übergeordnete `onSubmit` aufrufen:

- `promptText`: der aktuell an den Daemon gesendete Text, unverändert.
- `images`: die aktuellen Bilder.
- `inputAnnotations`: der Snapshot der strukturierten Eingabe-Annotationen zum Submit-Zeitpunkt.

Wenn die aktuelle `onSubmit`-Signatur nicht direkt erweiterbar ist, kann ein vierter Metadata-Parameter hinzugefügt werden, um bestehende Aufrufe nicht zu brechen:

```ts
onSubmit(promptText, images, commitAccepted, { inputAnnotations });
```

Annotations-Erzeugungsregeln dieser Phase:

- Für die Tag-Präfixe, die `buildComposerPrompt(text, tags)` erzeugt, werden `start/end` berechnet.
- Jeder Tag entspricht einer Annotation mit `type: 'reference'`.
- `annotation.text` verwendet den tatsächlichen serialisierten Text im endgültigen Prompt.
- `annotation.reference` speichert die minimalen sicheren Felder des ursprünglichen `WebShellComposerTag`: `id/kind/label/value/serialized/removable`.
- Icon-URLs werden nicht gespeichert; Icons werden weiterhin über `kind + composerTagIcons` zur Renderzeit aufgelöst.

Falls später auch `/`-Commands strukturiertes Rendering benötigen, kann beim Accept der Slash-Vervollständigung eine Annotation mit `type: 'command'` erzeugt werden, oder in der Submit-Phase anhand des getroffenen `CommandInfo` eine Command-Annotation. Die Command-Payload speichert direkt die bestehenden `CommandInfo`-Felder, Subcommand-Informationen liegen im `subcommandPath` des Annotation-Wrappers.

### 2. Der lokale Transkript-Echo speichert Metadaten

Erweiterung des SDK-Transkript-Stores:

```ts
appendLocalUserMessage(
  text: string,
  images?: Array<{ data: string; mimeType: string }>,
  meta?: { inputAnnotations?: DaemonInputAnnotation[] },
): void;
```

`appendLocalUserTranscriptMessage` nimmt `meta` entsprechend entgegen:

```ts
appendLocalUserTranscriptMessage(state, text, { images, meta });
```

Nach dem Erzeugen des User-Text-Blocks wird geschrieben:

```ts
if (opts.meta) {
  block.meta = { ...block.meta, ...opts.meta };
}
```

Diese Kette stellt nur sicher, dass die optimistische Benutzernachricht im aktuellen Frontend-Store sofort Chips trägt. Sie garantiert nicht eigenständig, dass die Metadaten nach dem Aktualisieren oder erneuten Öffnen der Session verfügbar sind, denn das Transkript nach dem Aktualisieren stammt vom Daemon-Replay und nicht aus dem lokalen Append im Speicher des aktuellen Tabs.

Lokale Slash-Commands ohne Input-Annotations übergeben weiterhin leere Metadaten; das bestehende Verhalten bleibt unverändert.

### 3. Der Daemon-Prompt-Echo persistiert Metadaten

`PromptRequest` unterstützt bereits `_meta?: Record<string, unknown> | null`. Beim Senden werden dieselben `inputAnnotations` in `PromptRequest._meta.inputAnnotations` geschrieben:

```ts
const promptRequest = {
  prompt: toDaemonPromptContent(text, normalizedImages),
  _meta: inputAnnotations.length > 0 ? { inputAnnotations } : undefined,
};
```

Die Bridge übergibt den Request innerhalb von `sendPrompt` an den Agent-Prompt und publiziert gleichzeitig über `echoPromptToSessionBus` den `user_message_chunk`. Hier muss `request._meta.inputAnnotations` in das `update._meta` des Echos zusammengeführt werden:

```ts
_meta: {
  ...pickUserInputEchoMeta(req._meta),
  serverTimestamp,
  source: 'bridge-echo',
}
```

`pickUserInputEchoMeta` behält nur `inputAnnotations` und schreibt unbekannte Request-Metas nicht unverändert in das Benutzernachricht-Transkript. So wird vermieden, dass Telemetrie, requestId, retry und andere Nicht-UI-Daten an `UserMessage` gelangen.

Beim Replay normalisiert `DaemonSessionProvider` `compactedReplay/liveJournal` wieder zu UI-Events; `normalizeDaemonEvent` legt `user_message_chunk.update._meta` bereits in `user.text.delta.meta` ab; der Transkript-Reducer schreibt die `meta` von Text-Events bereits in `DaemonTextTranscriptBlock.meta`. Sobald also das Daemon-Echo-Event `inputAnnotations` trägt, kann das Chip-Rendering nach dem Aktualisieren und erneuten Öffnen derselben Session wiederhergestellt werden.

### 4. Der Transkript-Adapter leitet Metadaten weiter

`transcriptBlocksToDaemonMessages` liest bereits `meta.source` des User-Blocks. An derselben Stelle wird `meta.inputAnnotations` gelesen, als Array validiert und in `DaemonUserMessage.inputAnnotations` geschrieben.

Hier ist eine minimale Strukturvalidierung nötig, damit unbekannte Metas im Transkript das Rendering nicht beeinflussen:

- Es muss ein Array sein.
- Jede Annotation muss nicht-leere Strings für `id/type/text` haben.
- `start` und `end` müssen endliche Zahlen sein und `0 <= start < end <= content.length` erfüllen.
- In dieser Phase werden nur Annotationen mit `type: 'reference'` erzeugt und gerendert; spätere Command-Annotationen können unter demselben Feld erweitert werden.
- Die Referenz-Payload wird minimal nach den Feldern von `WebShellComposerTag` bereinigt: Es werden nur String-Werte für `id/kind/label/value/serialized` und ein Boolean-Wert für `removable` akzeptiert.
- Die Command-Payload wird minimal nach den Feldern von `CommandInfo` bereinigt: Es werden nur String-Werte für `name/description/argumentHint/source/displayCategory` und ein String-Array für `subcommands` akzeptiert.
- Unbekannte Felder werden nicht beibehalten.

### 5. UserMessage verwendet inputAnnotations bevorzugt

Die Props von `UserMessage` werden ergänzt:

```ts
inputAnnotations?: DaemonInputAnnotation[];
```

Die Eingabeparameter von `renderUserMessageContent` werden um das gleichnamige Feld erweitert:

```ts
renderUserMessageContent?.({ content, images, inputAnnotations });
```

Die Standard-Rendering-Logik wird wie folgt geändert:

1. Wenn `inputAnnotations` gültige Annotationen mit `type: 'reference'` enthält, wird `content` anhand von `start/end` aufgeteilt und Chips werden gerendert.
2. Wenn Metadaten fehlen oder keine gültigen Annotationen vorhanden sind, wird der Rohtext gerendert.
3. Wenn der Host `renderUserMessageContent` bereitstellt, wird weiterhin der Host-Renderer bevorzugt.

Das Metadaten-Rendering rät den Tag-Typ nicht mehr aus `content` und muss die Position auch nicht anhand des serialisierten Textes suchen. Bei ungültigen oder sich überlappenden Ranges wird die jeweilige Annotation ignoriert, damit keine Benutzerinhalte verborgen werden.

### 6. Den Text-Parser-Fallback entfernen

`splitComposerTagContent` wird nicht beibehalten. Der Grund ist, dass der alte Parser den Referenztyp nur anhand der String-Form raten konnte:

- `@Makefile` und `@alice` können beide gültiger Text sein.
- `@dataset:users` benötigt Provider-Metadaten, um label/value/icon zu kennen.
- Die abschließende Zeichensetzung von escaped MCP-Ressourcen ist mit allgemeinen Regeln kaum beweisbar korrekt zu behandeln.

Daher rendert die Standard-Benutzernachricht Chips nur, wenn Annotationen vorhanden sind; ohne Annotationen wird der Rohtext angezeigt. Das `@Makefile`-Problem aus dem Review hängt damit nicht mehr an Heuristiken, denn neue Nachrichten erhalten einen eindeutigen File-Tag aus den Metadaten.

## Verhalten von Custom-Providern

Wenn der Provider im accepted item Folgendes liefert:

```ts
composerTag: {
  id: 'dataset:users',
  kind: 'dataset',
  label: 'Dataset',
  value: 'users',
  serialized: '@dataset:users',
}
```

kann die Standard-Benutzernachricht nach dem Senden rendern:

- label: `Dataset`
- value: `users`
- icon: aufgelöst über `composerTagIcons.dataset`

Liefert der Provider kein `composerTag`, bleibt es nach dem Senden bei reinem Text; der Standard-Renderer verspricht keine automatische Erkennung von Custom-Providern. Der Host kann weiterhin über `renderUserMessageContent` selbst verarbeiten.

## Kompatibilität

- Alte Transkripte haben kein `meta.inputAnnotations` und werden weiterhin als Rohtext angezeigt.
- Neue Clients, die alte Daemon-Events lesen, zeigen keine Verhaltensänderung.
- Alte Clients, die ein Transkript mit `meta.inputAnnotations` lesen, ignorieren die unbekannten Metas.
- `content` bleibt unverändert, daher sind Daemon-Prompt-Parsing, Modell-Input, Slash-Command-Text und historische Prompt-Inhalte nicht betroffen.
- Die Priorität von `renderUserMessageContent` bleibt unverändert; das Host-Custom-Rendering wird nicht von den Standard-Chips überschrieben.

## Testplan

### Unit tests

- `appendLocalUserTranscriptMessage` speichert `meta.inputAnnotations`.
- `createDaemonTranscriptStore().appendLocalUserMessage` kann Metadaten entgegennehmen und beibehalten.
- `sessionActions.sendPrompt` und `sessionActions.submitPrompt` können `inputAnnotations` in `PromptRequest._meta` schreiben.
- Der Bridge-`echoPromptToSessionBus` führt nur `inputAnnotations` in `user_message_chunk.update._meta` zusammen und schreibt keine unbekannten Request-Metas in den Transkript-Echo.
- `user_message_chunk.update._meta.inputAnnotations` aus dem Replay kann über `normalizeDaemonEvent` und den Reducer in `DaemonTextTranscriptBlock.meta.inputAnnotations` geschrieben werden.
- `transcriptBlocksToDaemonMessages` wandelt `meta.inputAnnotations` des User-Blocks in `DaemonUserMessage.inputAnnotations` um.
- `transcriptBlocksToDaemonMessages` filtert ungültige Annotations-Metas.
- `UserMessage` rendert `@Makefile`, `@LICENSE`, `@src/Makefile` über Reference-Annotationen.
- `UserMessage` rendert Custom-Provider-Tags über Reference-Annotationen und löst `composerTagIcons` auf.
- `UserMessage` behält bei fehlenden Metadaten die Rohtext-Anzeige.
- `UserMessage` ignoriert Annotationen mit ungültigen oder überlappenden Ranges, ohne den Originaltext zu verlieren.
- Der vorbehaltene Command-Annotationstyp kann von der Schema-Validierung beibehalten werden, aber das Standard-Rendering dieser Phase ignoriert ihn und beeinflusst das Reference-Rendering nicht.

### Integration / browser verification

- In der lokalen WebShell `.qwen/`, `Makefile` oder `LICENSE` auswählen; nach dem Senden zeigt die Benutzernachricht weiterhin den File-Chip.
- Eine MCP-Ressource auswählen; nach dem Senden zeigt die Benutzernachricht den MCP-Chip, und Escape-Zeichen in der Ressource werden nicht fälschlich getrimmt.
- Einen Custom-Provider injizieren, auswählen und senden; die Benutzernachricht zeigt Custom-label/value/icon.
- Die Seite aktualisieren oder dieselbe Session erneut öffnen; die Chips der Benutzernachricht sind weiterhin vorhanden.

## Risiken und Gegenmaßnahmen

- Risiko: Die Zunahme paketübergreifender Typen vergrößert die PR-Fläche. Gegenmaßnahme: Im SDK wird ein minimales `DaemonInputAnnotation` definiert, damit das SDK keine WebShell-Client-Typen importiert.
- Risiko: Inkonsistenz zwischen Metadaten und `content` führt zu Rendering-Versatz. Gegenmaßnahme: UserMessage verwendet nur gültige, nicht überlappende Ranges; ungültige Annotationen werden direkt ignoriert, ohne Benutzerinhalte zu verbergen.
- Risiko: Persistierte Custom-Provider-Informationen könnten Host-Custom-Felder enthalten. Gegenmaßnahme: Es werden nur `id/kind/label/value/serialized/removable` gespeichert, keine unbekannten Felder und keine Icon-URLs.
- Risiko: Nach der Umfangserweiterung von PR1 steigen die Review-Kosten. Gegenmaßnahme: Die Commit-Beschreibung macht die Motivation deutlich: Dies löst die Grundursache, dass ein reiner Text-Parser die Identität von File/Custom/MCP nicht korrekt wiederherstellen kann, und hält zugleich den Modell-Prompt unverändert.
- Risiko: Ein zu eng benanntes Top-Level-Metadatenfeld schränkt spätere `/`-Fähigkeiten ein. Gegenmaßnahme: `inputAnnotations` dient als einheitlicher Einstieg; in dieser Phase wird nur `type: 'reference'` geschrieben.

## Umsetzungsreihenfolge

1. In den SDK-Transkript-Typen die minimale Struktur für Input-Annotation-Metas ergänzen.
2. `appendLocalUserTranscriptMessage` und `DaemonTranscriptStore.appendLocalUserMessage` erweitern.
3. Die WebShell-Submit-Options erweitern und `inputAnnotations` von `useComposerCore` bis `App.sendPrompt` und zum Queued-Prompt-Submit durchreichen.
4. Beim optimistischen Echo in `store.appendLocalUserMessage` die `inputAnnotations` mitschreiben.
5. `inputAnnotations` in den Daemon-`PromptRequest._meta` schreiben und den Bridge-User-Echo so anpassen, dass er sie in `user_message_chunk.update._meta` zusammenführt.
6. In `transcriptBlocksToDaemonMessages` `meta.inputAnnotations` weiterleiten und bereinigen.
7. Die Props-Kette von `DaemonUserMessage` über `MessageList` bis `UserMessage` erweitern.
8. Die Eingabeparameter von `renderUserMessageContent` erweitern und `inputAnnotations` dem Host-Renderer offenlegen.
9. Das Standard-Rendering von `UserMessage` verwendet nur Metadaten; ohne Metadaten wird der Text unverändert angezeigt.
10. Unit-Tests und Browser-Abnahme-Screenshots vervollständigen.

## Kernpunkte der PR-Beschreibung

Die PR-Beschreibung muss erklären:

- Dies ändert nicht den Modell-Prompt, sondern speichert die UI-Eingabe-Annotations-Metadaten, die die WebShell bereits besitzt.
- Ein reiner Text-Parser kann `@Makefile`, `@alice`, `@dataset:users` und ähnliche Formen nicht zuverlässig unterscheiden, daher sind Metadaten notwendig.
- Alte Nachrichten bleiben kompatibel als Rohtext angezeigt; Custom-Provider genießen das Standard-Chip-Rendering nur, wenn sie ein `composerTag` liefern.
- Das neue Feld heißt `inputAnnotations`; in dieser Phase trägt es nur `@`-Referenzen, später kann es `/`-Commands, Skill-Commands, Custom-Commands und andere strukturierte Eingaben tragen.
- `renderUserMessageContent` bleibt der letzte Override-Punkt des Hosts.
