# Dual Output

Dual Output ist ein Sidecar-Modus für die interaktive TUI: Während Qwen Code weiterhin normal auf `stdout` rendert, gibt es gleichzeitig einen strukturierten JSON-Event-Stream über einen separaten Kanal aus, sodass ein externes Programm – eine IDE-Erweiterung, ein Web-Frontend, eine CI-Pipeline oder ein Automatisierungsskript – die Sitzung beobachten und steuern kann.

Es bietet außerdem einen Rückkanal: Ein externes Programm kann JSONL-Befehle in eine Datei schreiben, die von der TUI überwacht wird. Dadurch können Prompts gesendet und Tool-Berechtigungsanfragen beantwortet werden, als würde ein Mensch an der Tastatur sitzen.

Dual Output ist vollständig optional. Wenn die unten aufgeführten Flags fehlen, verhält sich die TUI exakt wie zuvor, ohne zusätzliche I/O-Operationen oder Verhaltensänderungen.

## Anwendungsfälle

Dual Output ist ein Low-Level-Plumbing-Primitive. Folgende konkrete Integrationen werden dadurch ermöglicht:

### Terminal + Chat: Dual-Mode-Echtzeitsynchronisation

Der Hauptanwendungsfall. Eine Web- oder Desktop-ChatUI hostet die TUI innerhalb eines PTY und rendert eine parallele Konversationsansicht, die vom strukturierten Event-Stream gesteuert wird:

- Benutzer können auf beiden Oberflächen tippen – der TUI (für terminal-native Power-User) oder der Web-UI (für eine reichhaltigere UX, teilbare Links, Mobile). Beide Ansichten bleiben synchron, da jede Nachricht durch dieselben JSON-Events fließt.
- Tool-Genehmigungsaufforderungen erscheinen an beiden Orten; wer zuerst genehmigt, gewinnt.
- Der Sitzungsverlauf wird wortgetreu aus `--json-file` erfasst, sodass die Serverseite ein kanonisches, maschinenlesbares Transkript erhält, ohne ANSI parsen zu müssen.

### IDE-Erweiterungen (VS Code / JetBrains / Cursor / Neovim)

Bette Qwen Code in die IDE ein. Die TUI läuft im integrierten Terminal-Panel des Editors für Benutzer, die dies wünschen, während die Erweiterung `--json-fd` / `--json-file`-Events konsumiert, um Folgendes zu steuern:

- Inline-Diff-Overlays, wenn der Agent Dateien bearbeitet.
- Ein Webview-Seitenpanel mit formatiertem Markdown, syntaxhervorgehobenen Tool-Aufrufen und klickbaren Zitaten.
- Statusleisten-Indikatoren (thinking / responding / awaiting approval).
- Programmatische `confirmation_response`-Schreibvorgänge, wenn der Benutzer auf eine native IDE-Genehmigungsschaltfläche klickt.

### Browserbasierte Chat-Frontends

Ein Node/Bun-Server startet die TUI in einem PTY für dessen Rendering-Semantik, stellt dem Browser jedoch einen WebSocket-Kanal bereit. Events aus `--json-file` werden an den Client weitergeleitet; im Browser eingegebene Benutzernachrichten werden über `--input-file` injiziert. Auf keiner Seite muss ANSI geparst werden.

### CI- / Automatisierungs-Observer

Ein CI-Job führt Qwen Code mit einem Task-Prompt aus. Der Mensch sieht die TUI im Job-Log; das CI-System verfolgt `--json-file` (tail), um:

- Den Job fehlschlagen zu lassen, wenn ein `result`-Event einen Fehler meldet.
- `token usage` / `duration_ms` / `tool_use`-Zähler an Metriken zu pushen.
- Das vollständige Transkript als Build-Artefakt zu archivieren.

### Multi-Agent-Orchestrierung

Ein Supervisor-Agent startet mehrere TUI-Worker, jeweils mit einem eigenen Paar aus Event-/Input-Dateien. Er überwacht den Fortschritt, injiziert Follow-up-Prompts und erzwingt globale Budget-/Sicherheitsrichtlinien, indem er Tool-Aufrufe über alle Worker hinweg genehmigt oder ablehnt.

### Sitzungsaufzeichnung, Audit und Replay

Leite jede TUI-Sitzung mit `--json-file` in eine reguläre Datei um (tee). Später:

- Compliance-Audits können exakt rekonstruieren, was ausgeführt wurde.
- Automatisierte Regressionstests können Durchläufe über Modellversionen hinweg vergleichen.
- Ein Replay-Tool kann Events über dasselbe Protokoll erneut ausgeben, um Visualisierungs-Dashboards zu speisen.

### Observability-Dashboards

Streame `--json-file` in Loki / OTEL / jede Pipeline, die JSONL akzeptiert. Extrahiere `usage.input_tokens`, `tool_use.name`, `result.duration_api_ms` als First-Class-Metriken in Grafana. Keine Log-Parsing-Regex erforderlich.

### Testing und QA

Integrationstests starten Qwen Code headless, steuern es mit `--input-file`-Skripten und prüfen Assertions auf `--json-file`-Events. Im Gegensatz zum Parsen von stdout-ANSI bleiben die Assertions über UI-Refactorings hinweg stabil.

## Flags

| Flag                  | Typ              | Zweck                                                                                                                                      |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-fd <n>`       | number, `n >= 3` | Schreibt strukturierte JSON-Events in den Dateideskriptor `n`. Der Aufrufer muss diesen fd über die `stdio`-Konfiguration beim Spawn oder Shell-Redirection bereitstellen. |
| `--json-file <path>`  | path             | Schreibt strukturierte JSON-Events in eine Datei. Der Pfad kann eine reguläre Datei, eine FIFO (Named Pipe) oder `/dev/fd/N` sein.         |
| `--input-file <path>` | path             | Überwacht diese Datei auf JSONL-Befehle, die von einem externen Programm geschrieben werden.                                               |

`--json-fd` und `--json-file` sind sich gegenseitig ausschließend. fds 0, 1 und 2 werden abgelehnt, um die eigene Ausgabe der TUI nicht zu beschädigen.

## Warum zwei Output-Flags? (`--json-fd` vs `--json-file`)

Auf den ersten Blick scheint `--json-fd` ausreichend zu sein – der Aufrufer startet Qwen Code mit einem zusätzlichen Dateideskriptor, die TUI schreibt Events darauf, fertig. In der Praxis scheitert die fd-Übergabe jedoch im wichtigsten Embedding-Szenario: dem Ausführen der TUI innerhalb eines Pseudo-Terminals (PTY). Aus diesem Grund bietet dieses Feature auch eine pfadbasierte Alternative.

### Wann `--json-fd` funktioniert

Reines `child_process.spawn` mit einem `stdio`-Array:

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node's spawn unterstützt beliebige `stdio`-Einträge; fd 3 wird vom Child-Prozess geerbt, der direkt darauf schreiben kann. Zero-Copy, Zero-Buffer, Zero-Filesystem – der schnellste Weg.

### Warum `--json-fd` unter PTY **nicht** funktioniert

PTY-Wrapper wie [`node-pty`](https://github.com/microsoft/node-pty) und [`bun-pty`](https://github.com/oven-sh/bun) sind die Methode, mit der jeder seriöse Embedder (IDE-Erweiterungen, Web-Terminals, tmux-ähnliche Multiplexer) eine interaktive TUI hostet. Sie können keine zusätzlichen fds an das Child weiterleiten, und zwar aus drei sich verstärkenden Gründen:

1. **API-Oberfläche.** `node-pty.spawn(file, args, options)` akzeptiert `cwd`, `env`, `cols`, `rows`, `encoding` usw. – aber **kein `stdio`-Array**. Es gibt schlicht keinen Platz in der API, um zu sagen „hänge diesen fd zusätzlich als fd 3 im Child an“. `bun-pty` bietet dieselbe Struktur.
2. **`forkpty(3)`-Semantik.** Unter der Haube rufen PTY-Wrapper `forkpty(3)` auf (oder den äquivalenten `posix_openpt` + `login_tty`-Ablauf). Dieser Syscall allokiert ein Master/Slave-Pseudo-Terminal-Paar und leitet die fds 0/1/2 des Childs auf die Slave-Seite um, sodass das Child denkt, es sei an ein echtes Terminal angeschlossen. Alle fds > 2 im Parent werden von `login_tty` geschlossen, das vor `exec` `close(fd)` für `fd >= 3` aufruft. Zusätzliche fds werden aktiv gelöscht, nicht vererbt.
3. **Controlling-Terminal-Nebeneffekt.** Selbst wenn du einen zusätzlichen fd durchschmuggeln würdest, wäre er kein Terminal. Der TUI-Renderer des Childs (der Escape-Sequenzen schreibt und ein TTY auf fd 1 annimmt) bräuchte dennoch den Slave für seine Ausgabe. Du hättest am Ende ohnehin zwei unabhängige Transportwege.

Kurz gesagt: Sobald ein Embedder ein echtes TTY für das TUI-Rendering benötigt – was auf jede IDE-Erweiterung, jedes Web-Terminal und jede Desktop-Chat-App zutrifft – ist fd-Vererbung vom Tisch.

### `--json-file` schließt die Lücke

Ein Dateipfad wird als normales CLI-Argument übergeben und überlebt somit jedes Spawn-Modell:

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

Das Child öffnet die Datei selbst und schreibt Events hinein; der Embedder verfolgt denselben Pfad mit `fs.watch` + inkrementellen Lesevorgängen. Drei Dinge sind zu beachten:

- **Reguläre Datei**, FIFO (Named Pipe) oder `/dev/fd/N` funktionieren alle. FIFO ist die Option mit der geringsten Latenz, wenn sich beide Seiten auf demselben Host befinden.
- Die Bridge öffnet FIFOs mit `O_NONBLOCK` und wechselt bei `ENXIO` (noch kein Reader) in den Blocking-Modus, sodass der PTY-Start niemals durch Warten auf einen Consumer blockiert wird.
- Für die Multi-Session-Isolation verwende pro Session Pfade unter `$XDG_RUNTIME_DIR` oder ein mit `mkdtemp` erstelltes Verzeichnis mit Modus `0700`.

### Welches Flag sollte ich verwenden?

| Embedding-Stil                                   | Verwendung             |
| ------------------------------------------------ | ---------------------- |
| `child_process.spawn` mit plain stdio            | `--json-fd`            |
| `node-pty` / `bun-pty` / beliebiger PTY-Host     | `--json-file`          |
| Shell-Redirection / manuelles Pipeline-Testing   | beides                 |
| CI-Log-Sammlung (reguläre Datei, Lesen nach Exit)| `--json-file`          |
| Geringstmögliche Latenz auf demselben Host       | `--json-file` + FIFO   |

Die Grundregel: **Wenn du benötigst, dass die TUI korrekt rendert, brauchst du ein PTY, was bedeutet, dass du `--json-file` benötigst.** `--json-fd` ist für einfachere Embedder gedacht, denen die TUI-Treue egal ist – typischerweise programmatische Wrapper, die stdout ohnehin verwerfen.

## Schnellstart

Starte Qwen Code mit allen drei aktivierten Kanälen:

```bash
mkfifo /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

In einem zweiten Terminal verfolge den Event-Stream:

```bash
cat /tmp/qwen-events.jsonl
```

In einem dritten Terminal pushe einen Prompt in die laufende TUI:

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

Der Prompt erscheint in der TUI exakt so, als hätte der Benutzer ihn getippt, und die Streaming-Antwort wird auf `/tmp/qwen-events.jsonl` gespiegelt.

## Output-Event-Schema

Events werden als JSON Lines ausgegeben (ein Objekt pro Zeile). Das Schema ist dasselbe wie im nicht-interaktiven `--output-format=stream-json`-Modus, wobei `includePartialMessages` immer aktiviert ist.

Das erste Event auf dem Kanal ist immer `system` / `session_start` und wird ausgegeben, wenn die Bridge konstruiert wird. Verwende es, um den Kanal vor dem Eintreffen anderer Events mit einer Session-ID zu korrelieren.

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

`control_response` wird ausgegeben, unabhängig davon, ob die Entscheidung in der TUI (native Genehmigungs-UI) oder durch eine externe `confirmation_response` (siehe unten) getroffen wurde. In jedem Fall sehen alle Observer das Endergebnis.

## Input-Befehlsschema

Auf `--input-file` werden zwei Befehlsformen akzeptiert:

```jsonc
// Submit a user message into the prompt queue
{ "type": "submit", "text": "What does this function do?" }

// Reply to a pending control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

Verhalten:

- `submit`-Befehle werden in die Warteschlange gestellt. Wenn die TUI mit einer Antwort beschäftigt ist, werden sie automatisch erneut versucht, sobald die TUI wieder in den Leerlaufzustand zurückkehrt.
- `confirmation_response`-Befehle werden sofort zugestellt und niemals in die Warteschlange gestellt, da ein Tool-Aufruf blockierend ist und die Antwort den zugrunde liegenden `onConfirm`-Handler erreichen muss, ohne auf ein früheres `submit` zu warten.
- Welche Seite auch immer ein Tool zuerst genehmigt, gewinnt; die verspätete Antwort der anderen Seite wird harmlos verworfen.
- Zeilen, die nicht als JSON geparst werden können, werden geloggt und übersprungen – sie stoppen den Watcher nicht.

## Hinweise zur Latenz

Die Input-Datei wird mit `fs.watchFile` in einem Polling-Intervall von 500 ms überwacht, sodass die Worst-Case-Roundtrip-Latenz für ein Remote-`submit` bei etwa einer halben Sekunde liegt. Dies ist beabsichtigt: Polling ist plattform- und dateisystemübergreifend portabel (einschließlich macOS / Netzwerk-Mounts) und entspricht dem typischen Human-in-the-Loop-Pacing, auf das dieses Feature abzielt. Der Output-Kanal hat kein Polling – Events werden synchron geschrieben, sobald die TUI sie ausgibt.

## Fehlermodi

- **Ungültiger fd.** Wenn der an `--json-fd` übergebene fd nicht geöffnet ist oder einer von 0/1/2 ist, gibt die TUI eine Warnung auf `stderr` aus und fährt fort, ohne dass Dual Output aktiviert ist.
- **Ungültiger Pfad.** Wenn die an `--json-file` übergebene Datei nicht geöffnet werden kann, gibt die TUI eine Warnung aus und fährt ohne Dual Output fort.
- **Consumer-Disconnect.** Wenn der Reader auf der anderen Seite des Kanals verschwindet (`EPIPE`), deaktiviert sich die Bridge stillschweigend selbst und die TUI läuft weiter. Kein Retry.
- **Adapter-Exception.** Jede Exception, die beim Ausgeben eines Events geworfen wird, wird abgefangen, geloggt und deaktiviert die Bridge. Die TUI stürzt niemals durch einen Dual-Output-Fehler ab.

## Spawn-Beispiel

Ein typischer Embedding-Parent-Prozess startet Qwen Code mit beiden Kanälen:

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

Die TUI behält weiterhin die Kontrolle über das Terminal des Benutzers auf stdio 0/1/2, während der Embedder strukturierte Events aus der Datei liest, die fd 3 unterliegt, und Befehle pusht, indem er JSONL-Zeilen an `/tmp/qwen-input.jsonl` anhängt.

## Konfiguration über Settings

Für langlebige Embedder ist es oft umständlich, CLI-Flags bei jedem Start durchzuschleifen. Dieselben Kanäle können in `settings.json` unter dem Top-Level-Key `dualOutput` konfiguriert werden:

```jsonc
// ~/.qwen/settings.json  (user-level)
// or <workspace>/.qwen/settings.json  (workspace-level)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

Prioritätsregeln:

- CLI-Flag **gewinnt** gegenüber Settings. Die Übergabe von `--json-file /foo` in der Kommandozeile überschreibt `dualOutput.jsonFile` in den Settings.
- `--json-fd` hat kein Settings-Äquivalent – fd-Übergabe ist ein Spawn-Zeitpunkt-Problem, das nicht statisch deklariert werden kann.
- Wenn weder Flag noch Setting vorhanden ist, bleibt Dual Output deaktiviert (identisch mit dem heutigen Standard).

Das Flag `requiresRestart: true` bedeutet, dass Änderungen erst beim nächsten Start von Qwen Code wirksam werden, da die Bridge einmalig während des Startvorgangs konstruiert wird.

## Ausführbare Demos

Jedes der folgenden Skripte ist copy-paste-fertig. Beginne mit POC&nbsp;1, um zu verifizieren, dass der Build Dual Output unterstützt; POC&nbsp;4 ist die engste Analogie zu einer echten IDE-Erweiterungs-Integration.

### POC 1 — Event-Stream beobachten

Beobachte jedes strukturierte Event, das die TUI ausgibt, während ein Mensch sie normal nutzt:

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...then chat normally; terminal A shows session_start,
# user/assistant/result/control_request lifecycle in real time.
```

Erwartete erste Zeile in Terminal A:

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — Prompts von außen injizieren

Steuere die TUI von einem zweiten Terminal aus, ohne die Tastatur des ersten zu berühren:

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — the TUI responds as if you typed it
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — Remote-Tool-Berechtigungs-Bridge

Genehmige oder lehne Tool-Aufrufe von einem separaten Prozess aus ab:

```bash
# Terminal A — observe control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Ask Qwen to do something that needs approval, e.g.
# "run `ls -la /tmp`". A control_request will appear in terminal A.
# Copy the request_id, then in a third terminal:
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# The TUI confirmation prompt dismisses and the tool executes.
```

Wenn du mit einer unbekannten `request_id` antwortest, gibt die Bridge ein `control_response` mit `subtype: "error"` auf dem Output-Kanal aus, sodass dein Consumer es loggen oder erneut versuchen kann:

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

### POC 4 — Node-Embedder (IDE-ähnlich)

Die realistischste Form: Ein Parent-Prozess startet Qwen Code, verfolgt Events und injiziert Prompts nach eigenem Zeitplan.

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
# Qwen Code TUI opens in the current terminal; the embedder logs
# handshake + turn-end + session_end events to the parent's stdout.
```

### POC 5 — Capability-Handshake-Feature-Detection

Ältere Qwen Code-Versionen geben `protocol_version` nicht aus. Behandle das Feld als optional und nutze Feature-Detection:

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'qwen-code dual output is present but protocol < 1; ' +
          'falling back to best-effort behavior',
      );
    } else {
      console.log('qwen-code dual output protocol v' + v);
    }
  }
});
```

### POC 6 — session_end als sauberes Beendigungssignal

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // Flush metrics, close WebSockets, etc.
  }
});
```

Wenn die TUI vor `session_end` abstürzt, schließt sich der Output-Stream (`EPIPE` beim nächsten Schreibvorgang); Embedder sollten beide Pfade behandeln.

### POC 7 — Failure-Drills (beweise, dass die Flags die TUI nie brechen)

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI still launches normally.

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI still launches normally.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs rejects: "--json-fd and --json-file are mutually exclusive."
# Process exits before TUI starts.

qwen --json-file /nonexistent/dir/x.jsonl
# stderr warning; TUI still launches.
```

## Bezug zu Claude Code

Claude Code bietet ein ähnliches stream-json-Event-Format unter `--print --output-format stream-json` an, jedoch nur im nicht-interaktiven Modus – es hat kein Äquivalent zum gleichzeitigen Ausführen der TUI und eines strukturierten Sidecar-Kanals. Dual Output schließt diese Lücke.