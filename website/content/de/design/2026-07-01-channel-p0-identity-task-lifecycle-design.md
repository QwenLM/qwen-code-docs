# Channel P0 Identity- und Task-Lifecycle-Design

## Goal

Implementierung der ersten P0-Grundlage für channelresidente Multiplayer-Agenten:
channelbezogene Identity- und Memory-Boundary-Metadaten sowie ein gemeinsamer Task-
Lifecycle-Hook in `@qwen-code/channel-base`.

Dies fügt absichtlich keinen Slack-Adapter, Daemon-Event-Stream, Adapter-UI-Änderungen,
proaktives Scheduling, kanalübergreifenden Kontext oder echte Core-Memory-Pfadisolierung
hinzu.

## Background

`qwen channel` unterstützt bereits Messaging-Adapter, gemeinsame Sessions, Sender-
Attribution, Dispatch-Modi, Streaming-Chunks, Tool-Call-Callbacks, Abbruch und
plattformspezifische Progress-Surfaces wie Feishu-Karten. Die fehlende P0-Produktschicht
ist eine stabile Möglichkeit, festzulegen: "Dieser Channel hat seine eigene resident
Agent Identity" und "Dieser Prompt-Turn hat einen Lifecycle, den Adapter beobachten
können."

Issue #6103 verfolgt diesen fokussierten Ausschnitt. Er baut auf der umfassenderen
qwen-tag-Roadmap in #5887 auf, hält diesen PR aber klein genug, um ihn unabhängig zu
reviewen und auszuliefern.

## Scope

Im Scope:

- Optionale Channel-Identity-Metadaten zu `ChannelConfig` hinzufügen.
- Optionale Memory-Scope-Metadaten zu `ChannelConfig` hinzufügen.
- Sichere Defaults ableiten, wenn die neue Config weggelassen wird.
- Eine prägnante Channel-Boundary-Notiz in den ersten Prompt für jede Agent-Session
  injizieren, zusammen mit den bestehenden Channel-Instructions.
- Einen geschützten `onTaskLifecycle(event)`-Hook zu `ChannelBase` hinzufügen.
- Lifecycle-Events aus dem gemeinsamen Channel-Flow für Prompt-Start, Text-Chunks,
  Tool-Calls, Abbruch, Abschluss und Fehler emittieren.
- Fokussierte, paketlokale Tests in `packages/channels/base` hinzufügen.

Außerhalb des Scopes:

- Core-Memory-Storage-Änderungen oder File-Path-Namespace-Isolierung.
- Daemon/SSE-Event-Publikation.
- UI-Änderungen für Feishu, DingTalk, Telegram, WeChat oder QQ.
- Neue Plattform-Adapter.
- Token-Budgets, Tool-ACLs oder kanalübergreifendes Context-Sharing.

## Design

### Channel Identity

Ein kleines, optionales Config-Objekt hinzufügen:

```ts
export interface ChannelIdentityConfig {
  id?: string;
  displayName?: string;
  description?: string;
}
```

`ChannelConfig` erhält `identity?: ChannelIdentityConfig`.

Zur Laufzeit leitet `ChannelBase` ab:

- `id`: `config.identity.id` oder `channel:<name>`
- `displayName`: `config.identity.displayName` oder `<name>`
- `description`: `config.identity.description`, falls vorhanden

Die Runtime-Identity sind reine Metadaten. Sie ändert nichts am Session-Routing,
der Zugriffskontrolle oder dem Verhalten des Plattform-Adapters.

### Memory Scope Metadata

Hinzufügen:

```ts
export type ChannelMemoryScopeMode = 'metadata-only';

export interface ChannelMemoryScopeConfig {
  namespace?: string;
  mode?: ChannelMemoryScopeMode;
}
```

`ChannelConfig` erhält `memoryScope?: ChannelMemoryScopeConfig`.

Zur Laufzeit leitet `ChannelBase` ab:

- `namespace`: `config.memoryScope.namespace` oder `channel:<name>`
- `mode`: für diesen PR immer `'metadata-only'`

Dies ist absichtlich kein echter Core-Memory-Namespace. Es ist ein expliziter,
inspizierbarer Boundary-Marker und eine Prompt-Instruction, damit spätere Arbeiten
denselben Namespace in Core-Memory-Pfade einklinken können, ohne die Form der
Channel-Config zu ändern.

### Prompt Boundary Injection

`ChannelBase` stellt `config.instructions` bereits einmal pro Session voran; dieses
Verhalten bleibt unverändert. Die unten generierte Boundary-Notiz wird nur dann in
dieselbe First-Message-Injection eingefügt, wenn ein Channel `identity` oder
`memoryScope` konfiguriert (Channels nur mit Instructions behalten die bestehende
Prompt-Form). Sie wird nach den Custom Instructions angehängt, damit die Boundary
Recency-Vorrang hat:

```text
Channel-Identity:
- id: channel:ops
- display name: Ops Bot
- description: Hilft der Ops-Gruppe bei der Koordination der Repository-Wartung.

Memory-Scope:
- namespace: qwen-tag:ops
- mode: metadata-only
- Daten aus anderen Channels dürfen nicht geteilt werden.
```

Die genaue Formulierung sollte prägnant und stabil genug für Tests sein, aber keine
Isolierung versprechen, die nicht gehalten werden kann. Wenn keine Description
vorhanden ist, wird diese Zeile weggelassen.

Diese Notiz wird einmal pro Agent-Session injiziert, genau wie die bestehenden
Instructions (ein vorübergehender Fehler beim Lesen des Channel-Memories wiederholt
den gesamten Context-Block im nächsten Turn, sodass aufeinanderfolgende Turns sie
wiederholen können). Wenn die Bridge einen Session-Death meldet, erlaubt die
bestehende `instructedSessions`-Bereinigung weiterhin die erneute Injektion für die
nächste Session.

Aus Kompatibilitätsgründen behalten Channels ohne `instructions`-, `identity`- oder
`memoryScope`-Konfiguration die bestehende Raw-Prompt-Form. Runtime-Identity und
Memory-Metadaten werden weiterhin für Lifecycle-Events und Status-Befehle abgeleitet.

### Status Visibility

`/who` und `/status` um Identity- und Memory-Metadaten erweitern:

- `/who` sollte den Identity-Display-Namen und den Memory-Namespace enthalten.
- `/status` sollte die Identity-ID und den Memory-Mode enthalten.

Die Ausgabe kurz halten. Keine absoluten Pfade oder versteckte Konfiguration
offenlegen.

### Task Lifecycle Hook

Eine Discriminated Union hinzufügen:

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

`ChannelBase` fügt hinzu:

```ts
protected onTaskLifecycle(_event: ChannelTaskLifecycleEvent): void {}
```

Das Standardverhalten ist No-Op. Adapter können sich später einklinken, ohne den
Prompt-Execution-Pfad zu ändern.

### Lifecycle Emission Points

Aus dem gemeinsamen `ChannelBase`-Flow emittieren:

- `started`: unmittelbar nach `activePrompts.set()` und vor
  `onPromptStart()`.
- `text_chunk`: wenn der `textChunk`-Listener des Prompts einen nicht abgebrochenen
  Chunk akzeptiert.
- `tool_call`: im bestehenden Bridge-Tool-Call-Listener nach der Auflösung des
  Session-Targets.
- `cancelled`: wenn `/cancel` erfolgreich ist, wenn `/clear` einen aktiven Prompt
  abbricht oder entfernt, und wenn `steer` den aktiven Turn als abgebrochen markiert.
- `completed`: nachdem `bridge.prompt()` auflöst und vor oder nach
  `onResponseComplete()`, solange der Turn nicht abgebrochen wurde.
- `failed`: wenn `bridge.prompt()` oder die Zustellung der Antwort einen Fehler wirft.

Fehler im Lifecycle-Hook sollten abgefangen und auf stderr geloggt werden. Die
Lifecycle-UI eines Plattform-Adapters darf die Prompt-Ausführung oder -Bereinigung
nicht unterbrechen.

## Error Handling

- Ungültige Identity- oder Memory-Felder sind in diesem PR nicht fatal; das
  Config-Parsing sollte die bestehende tolerante Form beibehalten und String-Felder
  nur dort akzeptieren, wo bereits explizites Parsing vorhanden ist.
- Lifecycle-Hook-Exceptions werden nach einer stderr-Diagnose unterdrückt.
- Der Memory-Scope-Mode ist auf `'metadata-only'` beschränkt; weggelassene oder
  unbekannte Configs sollten auf `'metadata-only'` aufgelöst werden, anstatt
  Verhalten zu aktivieren, das nicht existiert.

## Tests

Fokussierte Tests in `packages/channels/base/src/ChannelBase.test.ts` sollten
Folgendes abdecken:

- Default-Identity- und Memory-Metadaten werden aus dem Channel-Namen abgeleitet.
- Custom-Identity und Memory-Namespace sind im ersten Prompt enthalten.
- Boundary-Metadaten werden einmal pro Session injiziert und nach `sessionDied`
  erneut injiziert.
- `/who` und `/status` enthalten die neuen Metadaten, ohne das cwd preiszugeben.
- `onTaskLifecycle` sieht `started`, `text_chunk`, `tool_call`, `completed`.
- `onTaskLifecycle` sieht `cancelled` für `/cancel`, `/clear` und `steer`.
- `onTaskLifecycle` sieht `failed`, wenn `bridge.prompt()` rejectt.
- Ein Exception werfender Lifecycle-Hook rejectt `handleInbound()` nicht.

Paketlokale Befehle verwenden:

```bash
cd packages/channels/base
npx vitest run src/ChannelBase.test.ts
```

Finale Verifizierung vor dem PR:

```bash
npm run build
npm run typecheck
```

## Open Decisions

Keine für diesen PR. Echte Core-Memory-Namespace-Erzwingung, Daemon-Publikation,
Adapter-UI, Tool/Data-ACLs, Budgets und proaktives Follow-up sind ausdrücklich
Future Work.