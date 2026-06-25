# Duale Ausgabe

Duale Ausgabe ist ein Sidecar-Modus für die interaktive TUI: Während Qwen Code
normal auf `stdout` rendert, sendet es gleichzeitig einen strukturierten
JSON-Ereignisstrom an einen separaten Kanal, sodass ein externes Programm –
eine IDE-Erweiterung, ein Web-Frontend, eine CI-Pipeline, ein
Automatisierungsskript – die Sitzung beobachten und steuern kann.

Es bietet auch einen Rückkanal: Ein externes Programm kann JSONL-Befehle in
eine Datei schreiben, die die TUI überwacht, sodass es Eingabeaufforderungen
senden und auf Tool-Berechtigungsanfragen antworten kann, als ob ein Mensch
an der Tastatur säße.

Duale Ausgabe ist vollständig optional. Fehlen die folgenden Flags, verhält
sich die TUI exakt wie zuvor ohne zusätzliche E/A und ohne Verhaltensänderungen.

## Anwendungsfälle

Duale Ausgabe ist ein grundlegendes Plumbing-Primitiv. Dies sind konkrete
Integrationen, die es ermöglicht:

### Terminal + Chat-Zweimodus-Echtzeitsynchronisation

Der Hauptanwendungsfall. Ein Web- oder Desktop-Chat-UI hostet die TUI innerhalb
einer PTY und rendert eine parallele Konversationsansicht, die vom
strukturierten Ereignisstrom gesteuert wird:

- Der Benutzer kann in beiden Oberflächen tippen – in der TUI (für Terminal-affine
  Power-User) oder im Web-UI (für ein reichhaltigeres UX, teilbare Links, mobil).
  Beide Ansichten bleiben synchron, da jede Nachricht durch dieselben
  JSON-Ereignisse fließt.
- Tool-Genehmigungsaufforderungen erscheinen an beiden Orten; wer zuerst
  zustimmt, gewinnt.
- Der Sitzungsverlauf wird unverändert aus `--json-file` erfasst, sodass die
  Serverseite eine kanonische maschinenlesbare Transkription hat, ohne ANSI
  parsen zu müssen.

### IDE-Erweiterungen (VS Code / JetBrains / Cursor / Neovim)

Betten Sie Qwen Code in die IDE ein. Die TUI läuft im integrierten
Terminal-Panel des Editors für Benutzer, die es wünschen, während die
Erweiterung die `--json-fd`/`--json-file`-Ereignisse konsumiert, um Folgendes
zu steuern:

- Inline-Diff-Overlays, wenn der Agent Dateien bearbeitet.
- Ein Webview-Seitenpanel mit formatiertem Markdown, syntax-highlighted
  Tool-Aufrufen und klickbaren Zitaten.
- Statusleisten-Indikatoren (Denken / Antworten / Warten auf Genehmigung).
- Programmgesteuerte `confirmation_response`-Schreibvorgänge, wenn der
  Benutzer eine native IDE-Genehmigungsschaltfläche anklickt.

### Browserbasierte Chat-Frontends

Ein Node/Bun-Server startet die TUI in einer PTY für ihre Rendering-Semantik,
stellt aber einen WebSocket-Kanal zum Browser bereit. Ereignisse auf
`--json-file` werden an den Client weitergeleitet; vom Benutzer im Browser
eingegebene Nachrichten werden über `--input-file` injiziert. Kein
ANSI-Parsing auf beiden Seiten.

### CI-/Automatisierungsbeobachter

Ein CI-Job führt Qwen Code mit einer Aufgabenaufforderung aus. Der Mensch
sieht die TUI im Job-Log; das CI-System verfolgt `--json-file`, um:

- Den Job fehlschlagen zu lassen, wenn ein `result`-Ereignis einen Fehler
  meldet.
- `token usage`-/`duration_ms`-/`tool_use`-Zahlen als Metriken zu pushen.
- Das vollständige Transkript als Build-Artefakt zu archivieren.

### Multi-Agent-Orchestrierung

Ein Supervisor-Agent startet mehrere TUI-Worker, jeder mit seinem eigenen
Paar von Ereignis-/Eingabedateien. Er überwacht den Fortschritt, injiziert
Folgeaufforderungen und setzt globale Budget-/Sicherheitsrichtlinien durch,
indem er Tool-Aufrufe über alle Worker hinweg genehmigt oder ablehnt.

### Sitzungsaufzeichnung, -prüfung und -wiedergabe

Leiten Sie jede TUI-Sitzung mit `--json-file` in eine reguläre Datei
um. Später:

- Compliance-Prüfungen können genau rekonstruieren, was ausgeführt wurde.
- Automatisierte Regressionstests können Ausführungen über
  Modellversionen hinweg vergleichen.
- Ein Wiedergabetool kann Ereignisse durch dasselbe Protokoll erneut
  senden, um Visualisierungs-Dashboards zu speisen.

### Observability-Dashboards

Streamen Sie `--json-file` in Loki / OTEL / jede Pipeline, die JSONL
akzeptiert. Extrahieren Sie `usage.input_tokens`, `tool_use.name`,
`result.duration_api_ms` als erstklassige Metriken in Grafana. Kein
Log-Parsing mit Regex erforderlich.

### Tests und Qualitätssicherung

Integrationstests starten Qwen Code headless, steuern es mit
`--input-file`-Skripten und prüfen auf `--json-file`-Ereignisse. Anders
als beim Parsen von stdout-ANSI sind die Prüfungen stabil über
UI-Umgestaltungen hinweg.

## Flags

| Flag                       | Typ               | Zweck                                                                                                                                      |
| -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-fd <n>`            | Zahl, `n >= 3`    | Strukturierte JSON-Ereignisse an Dateideskriptor `n` schreiben. Der Aufrufer muss diesen fd über die `stdio`-Konfiguration des Spawns oder Shell-Umleitung bereitstellen. |
| `--json-file <pfad>`       | Pfad              | Strukturierte JSON-Ereignisse in eine Datei schreiben. Der Pfad kann eine reguläre Datei, eine FIFO (Named Pipe) oder `/dev/fd/N` sein.    |
| `--input-file <pfad>`      | Pfad              | Diese Datei auf JSONL-Befehle überwachen, die von einem externen Programm geschrieben werden.                                              |

`--json-fd` und `--json-file` schließen sich gegenseitig aus. Die fds 0, 1
und 2 werden zurückgewiesen, um eine Korruption der eigenen Ausgabe der TUI
zu verhindern.

## Warum zwei Ausgabe-Flags? (`--json-fd` vs. `--json-file`)

Auf den ersten Blick erscheint `--json-fd` ausreichend – der Aufrufer startet
Qwen Code mit einem zusätzlichen Dateideskriptor, die TUI schreibt Ereignisse
dorthin, fertig. In der Praxis scheitert die fd-Übergabe jedoch im wichtigsten
Einbettungsszenario: dem Betrieb der TUI in einer Pseudoterminal (PTY). Deshalb
bietet diese Funktion auch eine pfadbasierte Alternative.
### Wann `--json-fd` funktioniert

Reines `child_process.spawn` mit einem `stdio`-Array:

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node's `spawn` unterstützt beliebige `stdio`-Einträge; fd 3 wird vom Kind-Prozess geerbt,
der direkt darauf schreiben kann. Zero-Copy, Zero-Buffer, Zero
Dateisystem – der schnellste Pfad.

### Warum `--json-fd` **nicht** unter PTY funktioniert

PTY-Wrapper wie [`node-pty`](https://github.com/microsoft/node-pty) und
[`bun-pty`](https://github.com/oven-sh/bun) sind, wie jeder ernsthafte Embedder
(IDE-Erweiterungen, Web-Terminals, tmux-ähnliche Multiplexer) eine interaktive
TUI hostet. Sie können keine zusätzlichen Dateideskriptoren an das Kind weiterleiten, aus drei
sich gegenseitig verstärkenden Gründen:

1. **API-Oberfläche.** `node-pty.spawn(file, args, options)` akzeptiert `cwd`,
   `env`, `cols`, `rows`, `encoding` usw. – aber **kein `stdio`-Array**. Es gibt
   schlicht keine Stelle in der API, an der man sagen könnte: „Hänge diesen fd auch als fd 3
   im Kind an“. `bun-pty` bietet dieselbe Struktur.
2. **`forkpty(3)`-Semantik.** Unter der Haube rufen PTY-Wrapper `forkpty(3)` auf (oder das
   Äquivalent `posix_openpt` + `login_tty`-Tanz). Dieser Systemaufruf allokiert ein
   Master/Slave-Pseudo-Terminal-Paar und leitet die fds 0/1/2 des Kindes auf die Slave-Seite um,
   damit das Kind denkt, es sei an ein echtes Terminal angeschlossen. Alle fds
   größer als 2 im Elternprozess werden von `login_tty` geschlossen, das `close(fd)` für
   `fd >= 3` vor `exec` aufruft. Zusätzliche fds werden aktiv gelöscht, nicht vererbt.
3. **Nebenwirkung des kontrollierenden Terminals.** Selbst wenn man einen zusätzlichen fd
   durchschleusen würde, wäre es kein Terminal, daher würde der TUI-Renderer des Kindes
   (der Escape-Sequenzen unter Annahme eines TTY auf fd 1 schreibt) dennoch
   den Slave für seine Ausgabe benötigen. Man hätte am Ende zwei unabhängige
   Transporte.

Kurz gesagt: Sobald ein Embedder ein echtes TTY für die TUI-Darstellung benötigt –
was jede IDE-Erweiterung, jedes Web-Terminal, jede Desktop-Chat-App tut – ist die
fd-Vererbung vom Tisch.

### `--json-file` schließt die Lücke

Ein Dateipfad wird als gewöhnliches CLI-Argument übergeben, überlebt daher jedes
Spawn-Modell:

```ts
import { spawn } from 'node-pty';

const pty = spawn(
  'qwen',
  [
    '--json-file',
    '/tmp/qwen-events.jsonl',
    '--input-file',
    '/tmp/qwen-input.jsonl',
  ],
  { cols: 120, rows: 40 },
);
```

Das Kind öffnet die Datei selbst und schreibt Ereignisse hinein; der Embedder
verfolgt denselben Pfad mit `fs.watch` + inkrementellem Lesen. Drei Dinge zu
beachten:

- **Reguläre Datei**, FIFO (Named Pipe) oder `/dev/fd/N` – alles funktioniert. FIFO ist
  die Option mit der geringsten Latenz, wenn beide Seiten auf demselben Host sind.
- Die Brücke öffnet FIFOs mit `O_NONBLOCK` und fällt bei `ENXIO` (noch kein Leser)
  in den blockierenden Modus zurück, sodass der PTY-Start nie auf einen Verbraucher
  wartet und in eine Sackgasse gerät.
- Für die Isolierung mehrerer Sitzungen verwende sitzungsspezifische Pfade unter
  `$XDG_RUNTIME_DIR` oder einem mit `mkdtemp` erstellten Verzeichnis mit Modus `0700`.

### Welches Flag sollte ich verwenden?

| Einbettungsstil                                   | Verwende            |
| ------------------------------------------------- | ------------------- |
| `child_process.spawn` mit einfachem stdio         | `--json-fd`         |
| `node-pty` / `bun-pty` / jeder PTY-Host           | `--json-file`       |
| Shell-Umleitung / manuelles Pipeline-Testen       | beides              |
| CI-Logsammlung (reguläre Datei, nach Beenden lesen) | `--json-file`     |
| Niedrigste mögliche Latenz auf demselben Host     | `--json-file` + FIFO|

Die allgemeine Regel: **Wenn die TUI korrekt dargestellt werden muss, brauchst du ein
PTY, was bedeutet, dass du `--json-file` brauchst.** `--json-fd` ist für einfachere
Embedder, die sich nicht um die TUI-Treue kümmern – typischerweise programmatische
Wrapper, die stdout ohnehin verwerfen.

## Schnellstart

Führe Qwen Code mit beiden aktivierten Kanälen unter Verwendung regulärer Dateien aus:

```bash
touch /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

In einem zweiten Terminal verfolge den Ereignisstream:

```bash
tail -f /tmp/qwen-events.jsonl
```

In einem dritten Terminal schiebe einen Prompt in die laufende TUI:

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

Der Prompt erscheint in der TUI genau so, als hätte der Benutzer ihn getippt, und die
streaming-Antwort wird auf `/tmp/qwen-events.jsonl` gespiegelt.

### Verwenden von FIFOs (Named Pipes) für die Ereignisausgabe

FIFOs liefern eine geringere Latenz als reguläre Dateien (keine Festplatten-I/O) und funktionieren
gut, wenn beide Seiten auf demselben Host sind. Die Brücke öffnet FIFOs mit
`O_RDWR | O_NONBLOCK`, sodass sie **nicht blockiert**, selbst wenn noch kein Leser
verbunden ist – Ereignisse werden im Kernel-Pipe-Puffer zwischengespeichert, bis ein Leser
sich verbindet.

> **Hinweis:** `--input-file` erfordert eine reguläre Datei (kein FIFO), da
> der Beobachter auf `stat.size` angewiesen ist, um neue Daten zu erkennen, was bei FIFOs
> immer 0 ist.

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# TUI startet sofort – kein Leser muss zuerst gestartet werden.

# In einem zweiten Terminal verbinden, wann immer bereit:
cat /tmp/qwen-events.jsonl
```
Falls nie ein Leser verbindet, deaktiviert sich die Brücke automatisch, sobald der interne Puffer 1 MB überschreitet. Die TUI läuft normal weiter.

## Ausgabe-Ereignisschema

Ereignisse werden als JSON Lines (ein Objekt pro Zeile) ausgegeben. Das Schema ist dasselbe wie im nicht-interaktiven Modus `--output-format=stream-json`, wobei `includePartialMessages` immer aktiviert ist.

Das erste Ereignis auf dem Kanal ist immer `system` / `session_start`, das beim Aufbau der Brücke ausgegeben wird. Verwenden Sie es, um den Kanal mit einer Sitzungs-ID zu verknüpfen, bevor ein anderes Ereignis eintrifft.

```jsonc
// Session lifecycle
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// Streaming events for an in-progress assistant turn
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// Completed messages
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// Permission control plane (only when a tool needs approval)
{
  "type": "control_request",
  "request_id": "...",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "run_shell_command",
    "tool_use_id": "...",
    "input": { "command": "rm -rf /tmp/x" },
    "permission_suggestions": null,
    "blocked_path": null
  }
}
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "...",
    "response": { "allowed": true }
  }
}
```

`control_response` wird ausgegeben, unabhängig davon, ob die Entscheidung im TUI (native Genehmigungs-UI) oder durch eine externe `confirmation_response` (siehe unten) getroffen wurde. In beiden Fällen sehen alle Beobachter das Endergebnis.

## Eingabe-Befehlsschema

Es werden zwei Befehlstypen für `--input-file` akzeptiert:

```jsonc
// Submit a user message into the prompt queue
{ "type": "submit", "text": "What does this function do?" }

// Reply to a pending control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

Verhalten:

- `submit`-Befehle werden in eine Warteschlange gestellt. Wenn das TUI mit einer Antwort beschäftigt ist, werden sie automatisch wiederholt, sobald das TUI wieder in den Leerlaufzustand zurückkehrt.
- `confirmation_response`-Befehle werden sofort ausgeliefert und niemals in die Warteschlange gestellt, da ein Tool-Aufruf blockiert und die Antwort den zugrunde liegenden `onConfirm`-Handler erreichen muss, ohne auf vorherige `submit`-Befehle zu warten.
- Welche Seite ein Tool zuerst genehmigt, gewinnt; die späte Antwort der anderen Seite wird harmlos verworfen.
- Zeilen, die nicht als JSON geparst werden können, werden protokolliert und übersprungen – sie stoppen die Überwachung nicht.

## Hinweise zur Latenz

Die Eingabedatei wird mit `fs.watchFile` mit einem Abfrageintervall von 500 ms überwacht, sodass die Roundtrip-Latenz im ungünstigsten Fall für einen entfernten `submit`-Befehl etwa eine halbe Sekunde beträgt. Dies ist beabsichtigt: Abfragen ist plattform- und dateisystemübergreifend portabel (einschließlich macOS/Netzwerkmounts) und entspricht dem typischen menschlichen Tempo, das diese Funktion anspricht. Der Ausgabekanal hat keine Abfrage – Ereignisse werden synchron geschrieben, sobald das TUI sie ausgibt.

## Fehlermodi

- **Ungültiger fd.** Wenn der an `--json-fd` übergebene Dateideskriptor nicht geöffnet ist oder einer von 0/1/2 ist, gibt das TUI eine Warnung auf `stderr` aus und fährt ohne Dualausgabe fort.
- **Ungültiger Pfad.** Wenn die an `--json-file` übergebene Datei nicht geöffnet werden kann, gibt das TUI eine Warnung aus und fährt ohne Dualausgabe fort.
- **Verbrauchertrennung.** Wenn der Leser auf der anderen Seite des Kanals verschwindet (`EPIPE`), deaktiviert sich die Brücke stillschweigend und das TUI läuft weiter. Kein erneuter Versuch.
- **FIFO-Pufferüberlauf.** Beim Schreiben in eine FIFO ohne angeschlossenen Leser werden Ereignisse im Kernel-Pipe (~64 KB unter Linux) und im Node.js WriteStream gepuffert. Sobald die Pipe voll ist oder der interne Puffer 1 MB überschreitet, deaktiviert sich die Brücke und schließt den Dateideskriptor. In diesem Fall wird kein `session_end` ausgegeben – Verbraucher sollten einen geschlossenen Stream ohne `session_end` als abnormalen Abbruch behandeln. Das TUI läuft normal weiter.
- **Adapterausnahme.** Jede Ausnahme, die beim Ausgeben eines Ereignisses ausgelöst wird, wird abgefangen, protokolliert und deaktiviert die Brücke. Das TUI stürzt niemals aufgrund eines Dualausgabefehlers ab.

## Spawn-Beispiel

Ein typischer einbettender Elternprozess startet Qwen Code mit beiden Kanälen:

```ts
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const eventsFd = openSync('/tmp/qwen-events.jsonl', 'w');
const child = spawn(
  'qwen',
  ['--json-fd', '3', '--input-file', '/tmp/qwen-input.jsonl'],
  { stdio: ['inherit', 'inherit', 'inherit', eventsFd] },
);
```
Die TUI besitzt weiterhin das Terminal des Benutzers auf stdio 0/1/2, während der Embedder strukturierte Ereignisse auf der Datei liest, die fd 3 hinterlegt, und Befehle durch Anhängen von JSONL-Zeilen an `/tmp/qwen-input.jsonl` sendet.

## Konfiguration über Einstellungen

Für langlebige Embedder ist es oft umständlich, CLI-Flags bei jedem Start durchzureichen. Dieselben Kanäle können in der `settings.json` unter dem Top-Level-Schlüssel `dualOutput` konfiguriert werden:

```jsonc
// ~/.qwen/settings.json  (Benutzerebene)
// oder <workspace>/.qwen/settings.json  (Arbeitsbereichsebene)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

Vorrangregeln:

- Das CLI-Flag hat **Vorrang** vor den Einstellungen. Die Übergabe von `--json-file /foo` in der Befehlszeile überschreibt `dualOutput.jsonFile` in den Einstellungen.
- `--json-fd` hat kein Äquivalent in den Einstellungen – die fd-Übergabe ist ein Spawn-Zeit-Aspekt, der nicht statisch deklariert werden kann.
- Wenn weder Flag noch Einstellung vorhanden sind, bleibt der duale Ausgang deaktiviert (identisch mit dem aktuellen Standard).

Das Flag `requiresRestart: true` bedeutet, dass Änderungen erst beim nächsten Start von Qwen Code wirksam werden, da die Brücke nur einmal während des Starts aufgebaut wird.

## Ausführbare Demos

Jedes Skript unten ist kopierfertig. Beginnen Sie mit POC&nbsp;1, um zu überprüfen, ob der Build den dualen Ausgang hat; POC&nbsp;4 ist die engste Analogie zu einer echten IDE-Erweiterungsintegration.

### POC 1 — Ereignisstrom beobachten

Beobachten Sie jedes strukturierte Ereignis, das die TUI ausgibt, während ein Mensch sie normal verwendet:

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...dann normal chatten; Terminal A zeigt session_start,
# user/assistant/result/control_request Lebenszyklus in Echtzeit.
```

Erwartete erste Zeile in Terminal A:

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — Prompts von außen injizieren

Steuern Sie die TUI von einem zweiten Terminal aus, ohne die Tastatur des ersten zu berühren:

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — Die TUI reagiert, als hätten Sie es getippt
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — Remote-Werkzeugberechtigungsbrücke

Genehmigen oder verweigern Sie Tool-Aufrufe von einem separaten Prozess:

```bash
# Terminal A — control_requests beobachten
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Bitten Sie Qwen, etwas zu tun, das Genehmigung erfordert, z. B.
# "run `ls -la /tmp`". Ein control_request erscheint in Terminal A.
# Kopieren Sie die request_id, dann in einem dritten Terminal:
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# Der TUI-Bestätigungsdialog wird geschlossen und das Tool ausgeführt.
```

Wenn Sie mit einer unbekannten `request_id` antworten, sendet die Brücke eine `control_response` mit `subtype: "error"` auf dem Ausgangskanal, damit Ihr Consumer sie protokollieren oder wiederholen kann:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "unbekannte request_id (bereits aufgelöst, abgebrochen oder nie ausgegeben)"
  }
}
```

### POC 4 — Node-Embedder (IDE-ähnlich)

Die realistischste Form: Ein Elternprozess startet Qwen Code, verfolgt Ereignisse und injiziert Prompts nach eigenem Zeitplan.

```ts
// demo-embedder.ts
import { spawn } from 'node:child_process';
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const events = join(tmpdir(), `qwen-events-${process.pid}.jsonl`);
const input = join(tmpdir(), `qwen-input-${process.pid}.jsonl`);
writeFileSync(events, '');
writeFileSync(input, '');

const child = spawn('qwen', ['--json-file', events, '--input-file', input], {
  stdio: 'inherit',
});

// Tail the output channel. In production you'd use a proper
// byte-offset tail; this one re-streams from 0 for brevity.
const rl = createInterface({
  input: createReadStream(events, { encoding: 'utf8' }),
});
rl.on('line', (line) => {
  if (!line.trim()) return;
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    console.log('[embedder] handshake:', {
      protocol_version: ev.data.protocol_version,
      version: ev.data.version,
      supported_events: ev.data.supported_events,
    });
    // Feature-detect before using a capability
    if (ev.data.supported_events.includes('control_request')) {
      console.log('[embedder] permission control-plane available');
    }
  }
  if (ev.type === 'assistant') {
    console.log(
      '[embedder] assistant turn ended, tokens =',
      ev.message.usage?.output_tokens,
    );
  }
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] session ended cleanly');
  }
});

// After 2s, inject a prompt as if the user typed it
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'hello from embedder' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```
Ausführen mit:

```bash
npx tsx demo-embedder.ts
# Qwen Code TUI öffnet sich im aktuellen Terminal; der Embedder protokolliert
# handshake- + turn-end- + session_end-Ereignisse auf der Standardausgabe des übergeordneten Prozesses.
```

### POC 5 — Capability-Handshake Feature Detection

Ältere Qwen-Code-Versionen senden `protocol_version` nicht. Behandele das Feld
als optional und erkenne das Feature:

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'qwen-code dual output ist vorhanden, aber Protokoll < 1; ' +
          'Rückfall auf Best-Effort-Verhalten',
      );
    } else {
      console.log('qwen-code dual output Protokoll v' + v);
    }
  }
});
```

### POC 6 — session_end als sauberes Terminierungssignal

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] sauberes Herunterfahren, Sitzung', ev.data.session_id);
    // Metriken leeren, WebSockets schließen, etc.
  }
});
```

Falls die TUI vor `session_end` abstürzt, schließt sich der Ausgabestrom
(beim nächsten Schreibvorgang `EPIPE`); Embedder sollten beide Pfade behandeln.

### POC 7 — Fehlertests (beweisen, dass die Flags die TUI nie stören)

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — …"
# TUI startet normal.

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI startet normal.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs lehnt ab: "--json-fd and --json-file are mutually exclusive."
# Prozess beendet, bevor die TUI startet.

qwen --json-file /nonexistent/dir/x.jsonl
# stderr-Warnung; TUI startet trotzdem.
```

## Beziehung zu Claude Code

Claude Code stellt ein ähnliches Stream-JSON-Ereignisformat über
`--print --output-format stream-json` bereit, allerdings nur im nicht-interaktiven Modus
– es hat kein Äquivalent zum gleichzeitigen Ausführen der TUI und einem strukturierten
Sidecar-Kanal. Dual Output schließt diese Lücke.
