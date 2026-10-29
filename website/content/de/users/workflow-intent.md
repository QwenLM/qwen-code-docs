# Workflow für einen Turn anfordern


Für eine gespeicherte Präferenz über normale Eingaben hinweg, siehe
[session Workflow mode](./workflow-mode.md).

Wenn `tools.workflowsEnabled` aktiviert ist, füge `ultracode` oder das vorhandene
`workflow`-Keyword in eine menschliche Eingabe ein, um die Verwendung des
Workflow-Tools für diesen Turn vorzuschlagen. Beispiel: `ultracode: audit these three modules`.
Das Modell entscheidet, ob ein Workflow zur Anfrage passt. Das Keyword startet
keinen Workflow, ändert keine Berechtigungen, wählt kein Modell aus und
verändert nicht den Aufwand.

Terminal-Eingabe in Ink und OpenTUI, IDE-Composer-Eingabe und WebShell-Composer-
Eingabe unterstützen diesen Reminder. Er wird separat von deiner angezeigten
Nachricht zur Modell-Anfrage hinzugefügt. Die nächste normale Eingabe übernimmt
ihn nicht. Tool-Fortsetzungen und automatische Wiederholungen fügen ihn nicht
erneut hinzu. In den Composer eingefügter Text zählt als menschliche Eingabe;
Anhang-Erweiterungen und durch Hooks hinzugefügter Kontext nicht.

Abgerufene Historie und Ink-Vim-Register-Pasten bleiben unbekannte Eingaben,
auch nach dem Löschen des Buffers oder dem Deaktivieren von Vim. Frische
Vim-Eingabe im Insert-Modus kann den Reminder weiterhin aktivieren.

`ultracode` ignoriert vollständige zitierte/Code-Spans und pfadähnliche Tokens
wie `ultracode.js`, `x-ultracode` oder `ultracode/file`. Die vorhandene
`workflow`-Kompatibilitätsregel akzeptiert alleinstehende, durch Whitespace
getrennte Wörter mit Rand-Zeichen wie `(workflow)`, aber nicht `workflows`
oder `my-workflow-runner`. Wenn beide Keywords vorkommen, wird nur ein
Reminder hinzugefügt.

Normales `qwen -p`, normales stdin, geplante Eingaben und SDK-String-Prompts
melden sich nicht automatisch an. TypeScript-SDK-Streaming-Eingabe kann jede
ursprüngliche menschliche Nachricht explizit identifizieren:

```ts
import { query, type SDKUserMessage } from ' @qwen-code/sdk';

async function* messages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: crypto.randomUUID(),
    parent_tool_use_id: null,
    origin: { kind: 'human' },
    message: { role: 'user', content: 'ultracode: inspect the modules' },
  };
}

for await (const event of query({ prompt: messages() })) {
  console.log(event);
}
```

Lasse `origin` weg für anwendungsgenerierten Kontext, Automatisierung,
Tool-Ergebnisse und Historie-Replay. Eine fehlende oder ungültige Origin
lässt den normalen Chat ohne den Keyword-Reminder funktionieren. Die
Deklaration gewährt keine Tool-Berechtigungen. ACP-Clients können die
vorhandene `_meta['qwen.submittedPrompt']`-Deklaration pro Anfrage für
ursprünglichen menschlichen Text verwenden; Daemon-private Metadaten
bleiben reserviert.

Setze `ui.disableWorkflowKeywordTrigger` auf `true`, um beide Keywords
über diese Einstiegspunkte hinweg zu deaktivieren. Im Terminal-Einstellungs-
dialog heißt dies **Disable Workflow Keyword Trigger** und wirkt sich auf
neue Eingaben aus. Der Reminder wird auch weggelassen, wenn Workflows oder
die erforderliche Tool-Oberfläche nicht verfügbar sind. Eine Name-only-
Workflow-Session schlägt nur gespeicherte Workflows mit `{ name, args }`
vor; sie schlägt nicht das Schreiben eines Skripts vor.
