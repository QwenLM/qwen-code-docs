# Dual Output

Dual Output ist ein Sidecar-Modus für die interaktive TUI: Während Qwen Code normal auf `stdout` rendert, sendet es gleichzeitig einen strukturierten JSON-Ereignisstrom an einen separaten Kanal, sodass ein externes Programm – eine IDE-Erweiterung, ein Web-Frontend, eine CI-Pipeline, ein Automatisierungsskript – die Sitzung beobachten und steuern kann.

Es bietet auch einen umgekehrten Kanal: Ein externes Programm kann JSONL-Befehle in eine Datei schreiben, die die TUI überwacht, sodass es Eingabeaufforderungen senden und auf Tool-Berechtigungsanfragen antworten kann, als ob ein Mensch an der Tastatur säße.

Dual Output ist vollständig optional. Wenn die folgenden Flags fehlen, verhält sich die TUI genau wie zuvor, ohne zusätzliche E/A und ohne Verhaltensänderungen.

## Anwendungsfälle

Dual Output ist ein primitives Low-Level-Plumbing. Dies sind konkrete Integrationen, die es ermöglicht:

### Terminal + Chat dual-mode Echtzeit-Synchronisation

Der Flaggschiff-Anwendungsfall. Eine Web- oder Desktop-ChatUI hostet die TUI in einer PTY und stellt eine parallele Konversationsansicht dar, die vom strukturierten Ereignisstrom gesteuert wird:

- Der Benutzer kann in beiden Oberflächen tippen – der TUI (für Terminal-natürliche Power-User) oder der Web-UI (für reichhaltigere UX, teilbare Links, Mobilgeräte). Beide Ansichten bleiben synchron, da jede Nachricht durch dieselben JSON-Ereignisse fließt.
- Tool-Genehmigungsaufforderungen erscheinen an beiden Stellen; wer zuerst zustimmt, gewinnt.
- Der Sitzungsverlauf wird wörtlich aus `--json-file` übernommen, sodass die Serverseite ein kanonisches maschinenlesbares Transkript ohne Parsen von ANSI hat.

### IDE-Erweiterungen (VS Code / JetBrains / Cursor / Neovim)

Betten Sie Qwen Code in die IDE ein. Die TUI läuft im integrierten Terminal-Panel des Editors für Benutzer, die dies wünschen, während die Erweiterung `--json-fd` / `--json-file`-Ereignisse konsumiert, um Folgendes zu steuern:

- Inline-Diff-Overlays, wenn der Agent Dateien bearbeitet.
- Ein Webview-Seitenpanel mit formatiertem Markdown, syntax-hervorgehobenen Tool-Aufrufen und klickbaren Zitaten.
- Statusleisten-Indikatoren (Denken / Antworten / Warten auf Genehmigung).
- Programmgesteuerte `confirmation_response`-Schreibvorgänge, wenn der Benutzer auf einen nativen IDE-Genehmigungsknopf klickt.

### Browser-basierte Chat-Frontends

Ein Node/Bun-Server erzeugt die TUI in einer PTY für ihre Rendering-Semantik, stellt aber einen WebSocket-Kanal für den Browser bereit. Ereignisse auf `--json-file` werden an den Client weitergeleitet; vom Benutzer im Browser eingegebene Nachrichten werden über `--input-file` injiziert. Kein ANSI-Parsing auf beiden Seiten.

### CI / Automatisierungs-Beobachter

Ein CI-Job führt Qwen Code mit einer Aufgabenaufforderung aus. Der Mensch sieht die TUI im Job-Log; das CI-System verfolgt `--json-file` (tail), um:

- Den Job fehlschlagen zu lassen, wenn ein `result`-Ereignis einen Fehler meldet.
- `token usage` / `duration_ms` / `tool_use`-Zahlen an Metriken zu senden.
- Das vollständige Transkript als Build-Artefakt zu archivieren.

### Multi-Agenten-Orchestrierung

Ein Supervisor-Agent erzeugt mehrere TUI-Worker, jeder mit einem eigenen Paar von Ereignis-/Eingabedateien. Er überwacht den Fortschritt, injiziert Nachfolgeaufforderungen und erzwingt globale Budget-/Sicherheitsrichtlinien, indem er Tool-Aufrufe über alle Worker hinweg genehmigt oder ablehnt.

### Sitzungsaufzeichnung, Audit und Wiedergabe

Leiten Sie jede TUI-Sitzung mit `--json-file` in eine normale Datei. Später:

- Compliance-Audits können genau rekonstruieren, was ausgeführt wurde.
- Automatisierte Regressionstests können Läufe über Modellversionen hinweg vergleichen.
- Ein Wiedergabe-Tool kann Ereignisse über dasselbe Protokoll erneut ausgeben, um Visualisierungs-Dashboards zu füttern.

### Observability-Dashboards

Streamen Sie `--json-file` in Loki / OTEL / jede Pipeline, die JSONL akzeptiert. Extrahieren Sie `usage.input_tokens`, `tool_use.name`, `result.duration_api_ms` als erstklassige Metriken in Grafana. Kein Bedarf an Log-Parsing-Regex.

### Tests und QA

Integrationstests starten Qwen Code headless, steuern es mit `--input-file`-Skripten und überprüfen `--json-file`-Ereignisse. Im Gegensatz zum Parsen von stdout-ANSI sind Assertions stabil über UI-Refactorings hinweg.

## Flags

| Flag                  | Typ              | Zweck                                                                                                                                    |
| --------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-fd <n>`       | Zahl, `n >= 3`   | Schreibt strukturierte JSON-Ereignisse in den Dateideskriptor `n`. Der Aufrufer muss diesen fd über die `stdio`-Konfiguration des Spawns oder eine Shell-Umleitung bereitstellen. |
| `--json-file <path>`  | Pfad             | Schreibt strukturierte JSON-Ereignisse in eine Datei. Der Pfad kann eine normale Datei, ein FIFO (Named Pipe) oder `/dev/fd/N` sein.     |
| `--input-file <path>` | Pfad             | Überwacht diese Datei auf JSONL-Befehle, die von einem externen Programm geschrieben wurden.                                            |

`--json-fd` und `--json-file` schließen sich gegenseitig aus. Die fds 0, 1 und 2 werden abgelehnt, um eine Beschädigung der eigenen Ausgabe der TUI zu verhindern.

## Warum zwei Ausgabe-Flags? (`--json-fd` vs. `--json-file`)

Auf den ersten Blick scheint `--json-fd` ausreichend – der Aufrufer startet Qwen Code mit einem zusätzlichen Dateideskriptor, die TUI schreibt Ereignisse darauf, fertig. In der Praxis bricht die fd-Übergabe jedoch beim wichtigsten Einbettungsszenario zusammen: dem Ausführen der TUI in einer Pseudoterminal (PTY). Aus diesem Grund bietet diese Funktion auch eine pfadbasierte Alternative.

### Wann `--json-fd` funktioniert

Reines `child_process.spawn` mit einem `stdio`-Array:

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node's spawn unterstützt beliebige `stdio`-Einträge; fd 3 wird vom Kind geerbt, das direkt darauf schreiben kann. Zero-Copy, Zero-Buffer, Zero-Dateisystem – der schnellste Pfad.

### Warum `--json-fd` unter PTY **nicht** funktioniert

PTY-Wrapper wie [`node-pty`](https://github.com/microsoft/node-pty) und [`bun-pty`](https://github.com/oven-sh/bun) sind die Art und Weise, wie jeder ernsthafte Einbetter (IDE-Erweiterungen, Web-Terminals, tmux-ähnliche Multiplexer) eine interaktive TUI hostet. Sie können keine zusätzlichen fds an das Kind weiterleiten, und das aus drei sich gegenseitig verstärkenden Gründen:

1. **API-Oberfläche.** `node-pty.spawn(file, args, options)` akzeptiert `cwd`, `env`, `cols`, `rows`, `encoding` usw. – aber **kein `stdio`-Array**. Es gibt einfach keine Stelle in der API, um zu sagen: "hänge diesen fd auch als fd 3 im Kind an". `bun-pty` hat die gleiche Form.
2. **`forkpty(3)`-Semantik.** Intern rufen PTY-Wrapper `forkpty(3)` auf (oder die äquivalente `posix_openpt` + `login_tty`-Sequenz). Dieser Syscall allokiert ein Master/Slave-Pseudoterminal-Paar und leitet die fds 0/1/2 des Kindes auf die Slave-Seite um, sodass das Kind denkt, es sei an ein echtes Terminal angeschlossen. Alle fds über 2 im Elternprozess werden von `login_tty` geschlossen, das `close(fd)` für `fd >= 3` vor `exec` aufruft. Zusätzliche fds werden aktiv gelöscht, nicht vererbt.
3. **Controlling-Terminal-Nebeneffekt.** Selbst wenn man einen zusätzlichen fd durchschleusen würde, wäre es kein Terminal, sodass der TUI-Renderer des Kindes (der Escape-Sequenzen schreibt, die ein TTY auf fd 1 voraussetzen) dennoch den Slave für seine Ausgabe benötigen würde. Man hätte letztendlich zwei unabhängige Transporte.

Kurz gesagt: Sobald ein Einbetter ein echtes TTY für die TUI-Renderung benötigt – was bei jeder IDE-Erweiterung, jedem Web-Terminal, jeder Desktop-Chat-App der Fall ist – ist die fd-Vererbung vom Tisch.

### `--json-file` schließt die Lücke

Ein Dateipfad wird als gewöhnliches CLI-Argument übergeben, sodass er jedes Spawn-Modell überlebt:

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

Das Kind öffnet die Datei selbst und schreibt Ereignisse hinein; der Einbetter verfolgt denselben Pfad mit `fs.watch` + inkrementellem Lesen. Drei Dinge zu beachten:

- **Normale Datei**, FIFO (Named Pipe) oder `/dev/fd/N` funktionieren alle. FIFO ist die Option mit der geringsten Latenz, wenn sich beide Seiten auf demselben Host befinden.
- Die Brücke öffnet FIFOs mit `O_NONBLOCK` und fällt bei `ENXIO` (noch kein Leser) in den blockierenden Modus zurück, sodass der PTY-Start nie auf einen Verbraucher wartet und dadurch blockiert wird.
- Für die Multi-Session-Isolation verwenden Sie Session-spezifische Pfade unter `$XDG_RUNTIME_DIR` oder ein mit `mkdtemp` erstelltes Verzeichnis mit Modus `0700`.

### Welches Flag sollte ich verwenden?

| Einbettungsstil                                | Verwendung          |
| ---------------------------------------------- | ------------------- |
| `child_process.spawn` mit einfachem stdio      | `--json-fd`         |
| `node-pty` / `bun-pty` / jeder PTY-Host        | `--json-file`       |
| Shell-Umleitung / manuelles Pipeline-Testen     | beides              |
| CI-Log-Sammlung (normale Datei, Lesen nach Beenden) | `--json-file`   |
| Niedrigste Latenz auf demselben Host           | `--json-file` + FIFO |

Die allgemeine Regel: **Wenn die TUI korrekt rendern soll, benötigen Sie eine PTY, was bedeutet, dass Sie `--json-file` benötigen.** `--json-fd` ist für einfachere Einbetter gedacht, die sich nicht um die TUI-Treue kümmern – typischerweise programmgesteuerte Wrapper, die stdout ohnehin verwerfen.

## Schnellstart

Führen Sie Qwen Code mit beiden Kanälen unter Verwendung normaler Dateien aus:

```bash
touch /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

Öffnen Sie ein zweites Terminal und verfolgen Sie den Ereignisstrom:

```bash
tail -f /tmp/qwen-events.jsonl
```

Öffnen Sie ein drittes Terminal und senden Sie eine Eingabeaufforderung an die laufende TUI:

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

Die Eingabeaufforderung erscheint in der TUI genau so, als hätte der Benutzer sie getippt, und die Streaming-Antwort wird auf `/tmp/qwen-events.jsonl` gespiegelt.

### Verwenden von FIFOs (Named Pipes) für die Ereignisausgabe

FIFOs liefern eine geringere Latenz als normale Dateien (keine Festplatten-E/A) und funktionieren gut, wenn sich beide Seiten auf demselben Host befinden. Die Brücke öffnet FIFOs mit `O_RDWR | O_NONBLOCK`, sodass sie **nicht blockiert**, selbst wenn noch kein Leser verbunden ist – Ereignisse werden im Kernel-Pipe-Puffer gepuffert, bis ein Leser sie abholt.

> **Hinweis:** `--input-file` erfordert eine normale Datei (kein FIFO), da der Watcher auf `stat.size` angewiesen ist, um neue Daten zu erkennen, was bei FIFOs immer 0 ist.

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# TUI startet sofort – kein vorheriges Starten eines Lesers erforderlich.

# In einem zweiten Terminal verbinden, wann immer bereit:
cat /tmp/qwen-events.jsonl
```

Wenn nie ein Leser verbunden wird, deaktiviert sich die Brücke automatisch, sobald der interne Puffer 1 MB überschreitet. Die TUI läuft normal weiter.

## Ausgabe-Ereignisschema

Ereignisse werden als JSON Lines (ein Objekt pro Zeile) ausgegeben. Das Schema ist dasselbe wie im nicht-interaktiven Modus `--output-format=stream-json`, wobei `includePartialMessages` immer aktiviert ist.

Das erste Ereignis auf dem Kanal ist immer `system` / `session_start`, das beim Aufbau der Brücke ausgegeben wird. Verwenden Sie es, um den Kanal mit einer Sitzungs-ID zu korrelieren, bevor andere Ereignisse eintreffen.

```jsonc
// Sitzungslebenszyklus
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// Streaming-Ereignisse für einen laufenden Assistenten-Zug
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// Abgeschlossene Nachrichten
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// Berechtigungs-Kontrollebene (nur wenn ein Tool eine Genehmigung benötigt)
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

`control_response` wird ausgegeben, unabhängig davon, ob die Entscheidung in der TUI (native Genehmigungs-UI) oder durch ein externes `confirmation_response` (siehe unten) getroffen wurde. In beiden Fällen sehen alle Beobachter das endgültige Ergebnis.

## Eingabe-Befehlsschema

Zwei Befehlsformen werden auf `--input-file` akzeptiert:

```jsonc
// Eine Benutzernachricht in die Warteschlange einreihen
{ "type": "submit", "text": "What does this function do?" }

// Auf eine ausstehende control_request antworten
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

Verhalten:

- `submit`-Befehle werden in die Warteschlange gestellt. Wenn die TUI gerade antwortet, werden sie automatisch wiederholt, sobald die TUI in den Leerlauf zurückkehrt.
- `confirmation_response`-Befehle werden sofort ausgeliefert und nie in die Warteschlange gestellt, da ein Tool-Aufruf blockiert und die Antwort den zugrunde liegenden `onConfirm`-Handler erreichen muss, ohne auf einen früheren `submit` zu warten.
- Welche Seite auch immer zuerst ein Tool genehmigt, gewinnt; die verspätete Antwort der anderen Seite wird harmlos verworfen.
- Zeilen, die nicht als JSON geparst werden können, werden protokolliert und übersprungen – sie stoppen den Watcher nicht.

## Latenzhinweise

Die Eingabedatei wird mit `fs.watchFile` in einem Abfrageintervall von 500 ms beobachtet, sodass die Roundtrip-Latenz im schlimmsten Fall für ein entferntes `submit` etwa eine halbe Sekunde beträgt. Dies ist beabsichtigt: Polling ist plattform- und dateisystemübergreifend portierbar (einschließlich macOS / Netzwerk-Mounts) und entspricht dem typischen menschlichen Tempo, auf das die Funktion abzielt. Der Ausgabekanal hat kein Polling – Ereignisse werden synchron geschrieben, sobald die TUI sie ausgibt.

## Fehlermodi

- **Ungültiger fd.** Wenn der an `--json-fd` übergebene fd nicht geöffnet ist oder einer von 0/1/2 ist, gibt die TUI eine Warnung auf `stderr` aus und fährt ohne Dual Output fort.
- **Ungültiger Pfad.** Wenn die an `--json-file` übergebene Datei nicht geöffnet werden kann, gibt die TUI eine Warnung aus und fährt ohne Dual Output fort.
- **Verbraucher trennt Verbindung.** Wenn der Leser auf der anderen Seite des Kanals verschwindet (`EPIPE`), deaktiviert sich die Brücke stillschweigend und die TUI läuft weiter. Kein erneuter Versuch.
- **FIFO-Pufferüberlauf.** Beim Schreiben in ein FIFO ohne angeschlossenen Leser werden Ereignisse im Kernel-Pipe-Puffer (~64 KB unter Linux) und im Node.js WriteStream gepuffert. Sobald die Pipe voll ist oder der interne Puffer 1 MB überschreitet, deaktiviert sich die Brücke und schließt den fd. In diesem Fall wird kein `session_end` ausgegeben – Verbraucher sollten einen geschlossenen Stream ohne `session_end` als abnormale Beendigung behandeln. Die TUI läuft normal weiter.
- **Adapter-Ausnahme.** Jede Ausnahme, die beim Ausgeben eines Ereignisses ausgelöst wird, wird abgefangen, protokolliert und deaktiviert die Brücke. Die TUI wird niemals durch einen Dual-Output-Fehler zum Absturz gebracht.

## Spawn-Beispiel

Ein typischer übergeordneter Einbettungsprozess startet Qwen Code mit beiden Kanälen:

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

Die TUI besitzt weiterhin das Benutzerterminal auf stdio 0/1/2, während der Einbetter strukturierte Ereignisse auf der Datei liest, die fd 3 zugrunde liegt, und Befehle sendet, indem er JSONL-Zeilen an `/tmp/qwen-input.jsonl` anhängt.

## Einstellungsbasierte Konfiguration

Für langlebige Einbetter ist es oft umständlich, CLI-Flags durch jeden Start zu reichen. Dieselben Kanäle können in `settings.json` unter dem Schlüssel `dualOutput` auf oberster Ebene konfiguriert werden:

```jsonc
// ~/.qwen/settings.json  (Benutzerebene)
// oder <workspace>/.qwen/settings.json  (Workspace-Ebene)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

Vorrangregeln:

- CLI-Flag **gewinnt** gegenüber den Einstellungen. Die Übergabe von `--json-file /foo` in der Befehlszeile überschreibt `dualOutput.jsonFile` in den Einstellungen.
- `--json-fd` hat kein Einstellungsäquivalent – fd-Übergabe ist ein Spawn-Zeit-Problem, das nicht statisch deklariert werden kann.
- Wenn weder Flag noch Einstellung vorhanden ist, bleibt Dual Output deaktiviert (identisch mit der heutigen Voreinstellung).

Das Flag `requiresRestart: true` bedeutet, dass Änderungen erst beim nächsten Start von Qwen Code wirksam werden, da die Brücke einmalig während des Startvorgangs erstellt wird.

## Ausführbare Demos

Jedes Skript unten kann kopiert und eingefügt werden. Beginnen Sie mit POC&nbsp;1, um zu überprüfen, ob der Build Dual Output enthält; POC&nbsp;4 ist das nächste Analogon zu einer echten IDE-Erweiterungsintegration.

### POC 1 – Beobachten des Ereignisstroms

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

### POC 2 – Eingabeaufforderungen von außen injizieren

Steuern Sie die TUI von einem zweiten Terminal aus, ohne die Tastatur des ersten zu berühren:

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B – die TUI antwortet, als hätten Sie es getippt
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 – Remote-Tool-Berechtigungs-Brücke

Genehmigen oder verweigern Sie Tool-Aufrufe von einem separaten Prozess aus:

```bash
# Terminal A – control_requests beobachten
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Bitten Sie Qwen, etwas zu tun, das eine Genehmigung erfordert, z.B.
# "run `ls -la /tmp`". Eine control_request erscheint in Terminal A.
# Kopieren Sie die request_id, dann in einem dritten Terminal:
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# Die TUI-Genehmigungsaufforderung wird geschlossen und das Tool ausgeführt.
```

Wenn Sie mit einer unbekannten `request_id` antworten, gibt die Brücke ein `control_response` mit `subtype: "error"` auf dem Ausgabekanal aus, damit Ihr Verbraucher es protokollieren oder erneut versuchen kann:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "unknown request_id (already resolved, cancelled, or never issued)"
  }
}
```

### POC 4 – Node-Einbetter (IDE-ähnlich)

Die realistischste Form: Ein übergeordneter Prozess startet Qwen Code, verfolgt Ereignisse und injiziert Eingabeaufforderungen nach eigenem Zeitplan.

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

// Verfolgen des Ausgabekanals. In der Produktion würden Sie einen
// ordentlichen Byte-Offset-Tail verwenden; dieser hier streamt der
// Kürze halber ab 0 neu.
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
    // Feature-Detection vor der Nutzung einer Fähigkeit
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

// Nach 2s eine Eingabeaufforderung injizieren, als ob der Benutzer sie getippt hätte
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
# Qwen Code TUI wird im aktuellen Terminal geöffnet; der Embedder protokolliert
# Handshake-, Turn-Ende- und Session_End-Ereignisse an die Standardausgabe des Elternprozesses.
```

### POC 5 — capability handshake feature detection

Ältere Qwen Code Versionen senden kein `protocol_version`. Behandle das Feld
als optional und verwende Feature-Detection:

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

### POC 6 — session_end als sauberes Beendigungssignal

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] sauberes Herunterfahren, Session', ev.data.session_id);
    // Metriken leeren, WebSockets schließen usw.
  }
});
```

Falls die TUI vor `session_end` abstürzt, wird der Ausgabestrom geschlossen
(`EPIPE` beim nächsten Schreiben); Embedder sollten beide Pfade behandeln.

### POC 7 — Fehlertests (nachweisen, dass die Flags die TUI nie beeinträchtigen)

```bash
qwen --json-fd 1
# stderr: "Warnung: Dual Output deaktiviert — …"
# TUI wird trotzdem normal gestartet.

qwen --json-fd 9999
# stderr: "Warnung: Dual Output deaktiviert — fd 9999 nicht geöffnet"
# TUI wird trotzdem normal gestartet.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs lehnt ab: "--json-fd und --json-file schließen sich gegenseitig aus."
# Prozess wird beendet, bevor die TUI startet.

qwen --json-file /nonexistent/dir/x.jsonl
# Warnung auf stderr; TUI wird trotzdem gestartet.
```

## Beziehung zu Claude Code

Claude Code bietet ein ähnliches Stream-JSON-Ereignisformat unter
`--print --output-format stream-json`, jedoch nur im nicht-interaktiven Modus
— es hat keine Entsprechung, um die TUI und einen strukturierten Sidecar-Kanal
gleichzeitig auszuführen. Dual Output schließt diese Lücke.