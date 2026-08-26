# Workspace-Dateisystem-Grenze

## Übersicht

Daemon-HTTP-Dateirouten und delegierte ACP-`readTextFile`-/`writeTextFile`-Aufrufe durchlaufen die `WorkspaceFileSystem`-Grenze (`packages/cli/src/serve/fs/`), die Folgendes bereitstellt:

- **Pfadauflösung** – Pfade kanonisieren und alles ablehnen, was den gebundenen Arbeitsbereich verlässt, auch über Symlinks.
- **Vertrauensprüfung** – Schreibvorgänge verweigern, wenn der Arbeitsbereich nicht vertrauenswürdig ist (`untrusted_workspace`).
- **Größen- & Inhaltsrichtlinie** – Full-Snapshot-/Output-Cap (`MAX_READ_BYTES = 256 KiB`), Large-Text-Fenster begrenzt sowohl in Output als auch Scan-Kosten (`MAX_TEXT_SCAN_BYTES = 8 MiB`), Schreib-Limit (`MAX_WRITE_BYTES = 5 MiB`), Binärerkennung.
- **Atomizität** – Schreiben-dann-Umbenennen mit Ziel-Modus-Erhaltung und Standard `0o600` für neue Dateien.
- **Prüfung** – Jeder Zugriff / jede Ablehnung erzeugt ein strukturiertes Ereignis für `PermissionAuditRing` / Monitoring.
- **Typisierte Fehler** – Geschlossene `FsErrorKind`-Union, die auf HTTP-Status abgebildet wird.

Die HTTP-Dateirouten (`GET /file`, `GET /file/bytes`, `POST /file/write`, `POST /file/edit`, `GET /list`, `GET /glob`, `GET /stat`) verwenden diese Grenze und erhalten niemals die Same-Host-Ausnahme. Im Produktions-Daemon erreichen ACP-Aufrufe, die delegiert bleiben, den injizierten Bridge-Adapter; generische Bridge-Aufrufer verwenden WFS nur, wenn sie einen solchen Adapter injizieren. Produktions-Same-Host-`qwen serve`-Runtimes bewerben `readTextFile: false`, sodass alle kindlichen `FileSystemService.readTextFile`-Consumer den regulären CLI-Dateisystemdienst verwenden. Finale ACP-`writeTextFile`-Inhaltsschreibvorgänge bleiben delegiert: Workspace-Ziele verwenden WFS, während ein strikter Built-in-Tool-Marker einen äquivalenten Host-Writer für einen externen Pfad nur bei Daemon-erzeugten Same-Host-Adaptern auswählen darf. Siehe [das External-Write-Design](../../design/daemon-external-tool-text-writes.md).

Dieser Text-Read-Capability-Slice deckt direkte `read_file`-Aufrufe ab sowie die gemeinsamen Pre-Reads, die von Write-, Edit-, Notebook-, Sed- und Artifact-Operationen verwendet werden:

- Er akzeptiert absichtlich das reguläre CLI-Leseverhalten und nicht die WFS-Leseseite-Garantien. [Das Design-Dokument](../../design/daemon-local-text-reads.md) enthält die genaue Liste dessen, was aufgegeben wird.
- Dasselbe Dokument beschreibt den begrenzten Sinn, in dem der beibehaltene Adapter-Lesepfad „fail-closed" ist; das separate External-Write-Design beschreibt, wie der genehmigte Final-Write-Fehler geschlossen wird.
- Direktes externes `read_file` behält die normalen CLI-Permission-Regeln und die Core-Dateioperations-Telemetrie.
- HTTP-Dateisystemrouten bleiben Workspace-scoped, und das Verhalten von Agent-Discovery-Tools wird durch diese Capability nicht geändert.
- Hilfsaktionen wie Elternverzeichnis-Erstellung und Shell-Befehle sind separate bestehende Pfade, die nicht von dieser Grenze abgedeckt werden.
- `qwen serve` nimmt einen Same-Machine-Same-UID-Sicherheitsprinzipal an und ist keine OS-Sandbox.

## Verantwortlichkeiten

- Benutzerbereitgestellte Pfade in gebrandete `ResolvedPath`-Werte auflösen, die der Rest der Grenze sicher verwenden kann.
- Pfade außerhalb des gebundenen Arbeitsbereichs ablehnen (`path_outside_workspace`) und Pfade, deren Ziel ein Symlink ist (`symlink_escape`).
- Full-Snapshot-Lesevorgänge über `MAX_READ_BYTES` ablehnen, aber explizite Fenster mit Output begrenzt auf `MAX_READ_BYTES` und Scan-Kosten begrenzt auf `MAX_TEXT_SCAN_BYTES` erlauben; Schreibvorgänge über `MAX_WRITE_BYTES` und Binärdateien ablehnen (`binary_file`).
- Schreib-/Bearbeitungsvorgänge verweigern, wenn der Arbeitsbereich nicht vertrauenswürdig ist (`untrusted_workspace`) – geschützt durch `assertTrustedForIntent(trusted, intent)`.
- `.gitignore`/`.qwenignore`-Muster über `shouldIgnore` beachten.
- Atomares Schreiben-dann-Umbenennen mit Ziel-Modus-Erhaltung durchführen; Standard-Dateimodus für neue Dateien ist `0o600`.
- `fs.access`-/`fs.denied`-Prüfungsereignisse bei jeder Operation ausgeben.
- Jeden Fehler auf einen `FsError` mit Art und HTTP-Status abbilden; Routen-Handler serialisieren sie einheitlich.

## Architektur

### Modulaufteilung

| Datei                       | Zweck                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paths.ts`                  | `canonicalizeWorkspace`, `resolveWithinWorkspace`, `hasSuspiciousPathPattern`, gebrandetes `ResolvedPath`, `Intent`-Union (`read \| write \| list \| stat \| glob`).                                                                                      |
| `policy.ts`                 | `MAX_READ_BYTES`, `MAX_TEXT_SCAN_BYTES`, `MAX_WRITE_BYTES`, `MAX_UPLOAD_BYTES`, `BINARY_PROBE_BYTES`, `assertTrustedForIntent`, `detectBinary`, `enforceReadBytesSize`, `enforceReadSize`, `enforceWriteSize`, `shouldIgnore`.                                            |
| `audit.ts`                  | `FS_ACCESS_EVENT_TYPE`, `FS_DENIED_EVENT_TYPE`, `createAuditPublisher`, Audit-Payload-Typen.                                                                                                                                                              |
| `errors.ts`                 | `FsError`-Klasse, `isFsError`, `FsErrorKind`-Union (14 Arten), `FsErrorStatus`-Union (`400 / 403 / 404 / 409 / 413 / 422 / 500 / 503`).                                                                                                                   |
| `workspace-file-system.ts`  | `createWorkspaceFileSystemFactory`, `WorkspaceFileSystem` (der Orchestrator, der liest/schreibt/auflistet), `WriteMode`, `ContentHash`, `FsEntry`, `FsStat`, `ListOptions`, `GlobOptions`, `ReadTextOptions`, `ReadBytesOptions`, `WriteTextAtomicOptions`. |

### `FsErrorKind`-Taxonomie

| Art                        | Standard-HTTP | Bedeutung                                                                                                                                                                                         |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path_outside_workspace`   | 400           | Aufgelöster Pfad liegt außerhalb des gebundenen Arbeitsbereichs.                                                                                                                                  |
| `symlink_escape`           | 400           | Ziel ist ein Symlink (abgelehnt gemäß der konservativen Haltung aus PR 18 + PR 20).                                                                                                               |
| `path_not_found`           | 404           | `ENOENT`.                                                                                                                                                                                         |
| `binary_file`              | 422           | Inhalt auf einer Text-Route als Binär erkannt, oder großer Text in einer Kodierung, die die Text-Route nicht dekodieren kann.                                                                    |
| `file_too_large`           | 413           | Fensterloser/Full-Snapshot-Text über `MAX_READ_BYTES`, ein Zeilen-Offset über `MAX_TEXT_SCAN_BYTES` oder ein Schreibvorgang über `MAX_WRITE_BYTES`.                                                |
| `hash_mismatch`            | 409           | Optimistische Nebenläufigkeit `expectedSha256` fehlgeschlagen, oder die Datei hat sich während eines Stable-Reads geändert.                                                                        |
| `file_already_exists`      | 409           | `mode: 'create'` gegen eine vorhandene Datei.                                                                                                                                                     |
| `text_not_found`           | 422           | Der Suchstring von `POST /file/edit` war nicht in der Datei.                                                                                                                                      |
| `ambiguous_text_match`     | 422           | Mehrere Treffer, obwohl genau einer erforderlich war.                                                                                                                                             |
| `untrusted_workspace`      | 403           | Schreibversuch in einem nicht vertrauenswürdigen Arbeitsbereich.                                                                                                                                  |
| `permission_denied`        | 403           | OS-Level `EACCES`/`EPERM`.                                                                                                                                                                        |
| `io_error`                 | 503           | `ENOSPC`/`EIO`/`EBUSY`/`ETXTBSY`/`ENAMETOOLONG`/`EMFILE`/`ENFILE`. **Abgegrenzt von `permission_denied`**, damit Überwachungspipelines Sicherheitsverantwortliche nicht wegen "Festplatte voll" alarmieren. |
| `internal_error`           | 500           | Nicht-Errno-Fehler, der die Grenze erreicht (`TypeError`, Programmierfehler).                                                                                                                     |
| `parse_error`              | 400 / 422     | Request-Body-Parse-Fehler (400) oder Invariante auf Service-Ebene verletzt (422).                                                                                                                |

### `BridgeFileSystem` (der ACP-seitige Adapter)

`packages/acp-bridge/src/bridgeFileSystem.ts` definiert:

```ts
interface BridgeFileSystem {
  readText(params: ReadTextFileRequest): Promise<ReadTextFileResponse>;
  writeText(params: WriteTextFileRequest): Promise<WriteTextFileResponse>;
}
```

Dies ist der Injektionspunkt für ACP `readTextFile`/`writeTextFile`. Bridge-Tests und eingebettete Mode-A-Aufrufer können ihn in `BridgeOptions` weglassen; `BridgeClient` greift auf seinen Inline-`fs.readFile`-/`fs.writeFile`-Proxy zurück (bewahrt das Pre-F1-Verhalten). Die Produktion `qwen serve` verdrahtet `BridgeFileSystem` über `createBridgeFileSystemAdapter(fsFactory)` (`packages/cli/src/serve/bridge-file-system-adapter.ts`) und setzt `delegateReadTextFileToClient: false`. Capability-konforme Children lesen daher Text lokal und delegieren finale ACP-Textschreibvorgänge. Der Adapter behält seine Leseimplementierung bei, sodass unerwartete oder Capability-verletzende delegierte Lesevorgänge weiterhin auf die Workspace-Grenze von WFS treffen. Sein externer Host-Writer-Pfad ist standardmäßig deaktiviert und wird nur über exakte versionierte Provenienz bei Daemon-eigenen Same-Host-Adaptern ausgewählt; injizierte Bridges, Workspace-Registries und -Factories, generisches ACP und HTTP behalten die gewöhnliche Grenze.

Zwei defensive Eigenschaften, die der Adapter bewahren MUSS (da der Inline-Proxy vollständig umgangen wird, wenn der Adapter injiziert ist):

1. **Nicht-reguläre Dateien ablehnen** – Sockets/Pipes/Character-Devices/procfs/sysfs-Einträge können unbegrenzte Daten streamen, obwohl `stats.size === 0`. Der Inline-Pfad wirft einen Fehler mit `describeStatKind(stats)` in der Nachricht.
2. **Unbegrenztes Full-File-Buffering vermeiden.** Der Inline-Fallback begrenzt einen gepufferten Read auf `READ_FILE_SIZE_CAP = 100 MiB`. Der injizierte Adapter wendet stattdessen den strikteren WorkspaceFileSystem-Vertrag an: Full-Snapshots stoppen bei 256 KiB, während größere UTF-8-Dateien ein endliches `limit` erfordern und von einem inode-gebundenen Handle gestreamt werden, wobei maximal 256 KiB zurückgegeben werden. Er darf nicht eine gesamte 500-MB-Logdatei lesen, nur um `{ line: 1, limit: 10 }` zurückzugeben.

Der Adapter geht noch weiter: Er verwendet `WorkspaceFileSystem.writeTextOverwrite` (PR-18-Primitive) für Workspace-Schreibvorgänge und ein Factory-eigenes Äquivalent für strikt markierte externe Built-in-Tool-Schreibvorgänge. Beide verwenden atomare temporäre Datei-Umbenennung-Schreibvorgänge mit Moduserhaltung, `0o600`-Standard und Symlink-Ablehnung innerhalb der gemeinsamen Canonical-Path-Sperre. Dies ist eine **Abweichung vom Pre-F1-Inline-Proxy**, der Symlinks aufgelöst und durch diese hindurch geschrieben hat – Agenten, die sich auf das Schreiben durch Symlink-Punktdateien verlassen haben, müssen nun direkt den aufgelösten Pfad adressieren.

### FsError-Erhaltung über die ACP-Verbindung

Wenn der `BridgeFileSystem`-Adapter einen `FsError` wirft (`kind: 'untrusted_workspace'`/`'symlink_escape'`/`'file_too_large'`/usw.), serialisiert der Standard-ACP-SDK-RPC-Fehlerpfad nur `error.message` als generischen `-32603 "Internal error"` – `kind`/`status`/`hint` werden entfernt. Der nachgelagerte Agent-RPC-Client müsste dann mit Regex auf die menschenlesbare Nachricht matchen, um getyptes UI (Auth-Wiederholung vs. Dateiauswahl vs. Proxy-Hinweis) zu dispatchen.

`BridgeClient.writeTextFile` und `BridgeClient.readTextFile` installieren einen dünnen Guard (`packages/acp-bridge/src/bridgeClient.ts`), der FsError-artige Würfe fängt und als ACP `RequestError` erneut wirft:

```ts
function isFsErrorShape(err: unknown): err is FsErrorShape {
  return (
    err instanceof Error &&
    err.name === 'FsError' &&
    typeof (err as { kind?: unknown }).kind === 'string'
  );
}

function preserveFsErrorOverAcp(err: unknown): never {
  if (isFsErrorShape(err)) {
    throw new RequestError(-32603, err.message, {
      errorKind: err.kind,
      ...(err.hint !== undefined ? { hint: err.hint } : {}),
      ...(err.status !== undefined ? { status: err.status } : {}),
    });
  }
  throw err;
}
```

Der RPC-Client des Agenten empfängt nun `data.errorKind` (den geschlossenen `FsErrorKind`-Wert) plus die optionalen `data.hint` und `data.status`, sodass SDK-Konsumenten auf das typisierte Enum verzweigen können, anstatt mit Regex auf die Nachricht zu matchen.

Zwei Design-Notizen:

- **Duck-Typing statt Import** – `FsError` lebt in `packages/cli/src/serve/fs/errors.ts`, während `BridgeClient` in `packages/acp-bridge` lebt. Ein direkter `import { FsError }` würde die Abhängigkeit umkehren. Der Duck-Check (`name === 'FsError'` + `kind: string`) spiegelt wider, was `mapDomainErrorToErrorKind` (`status.ts`) bereits für `TrustGateError`/`SkillError` aus demselben Cross-Package-Bundling-Grund tut.
- **JSON-RPC-Code bleibt bei -32603** – die Bridge kann `FsError.kind` nicht zuverlässig auf eine JSON-RPC-Fehlercode-Form abbilden, daher trägt das strukturierte `data`-Feld die semantischen Informationen für SDK-Konsumenten. Der Wire-Statuscode (`-32603` "internal error") bleibt unverändert; Clients routen auf `data.errorKind`.

### Vertrauensprüfung

`assertTrustedForIntent(trusted, intent)` verwendet das vom Aufrufer injizierte Vertrauens-Boolean; die Richtlinienebene liest `Config.isTrustedFolder()` nicht direkt. Lese-/Listen-/Stat-/Glob-Vorgänge sind immer erlaubt (Vertrauen ist nur für Schreibvorgänge erforderlich). Schreibabsichten in nicht vertrauenswürdigen Arbeitsbereichen werfen `FsError('untrusted_workspace', ..., status: 403)`. Das Vertrauenssignal fließt über `WorkspaceFileSystemFactoryDeps.trusted: boolean` ein – `runQwenServe` übergibt `true`, da der Betreiber den Daemon gegen einen Arbeitsbereich gestartet hat, dem er implizit vertraut; `createServeApp` (direkte Einbettung ohne `runQwenServe`) standardmäßig `false` und warnt einmal pro Prozess (siehe [`02-serve-runtime.md`](./02-serve-runtime.md)).

## Workflow

### Lesen

```mermaid
sequenceDiagram
    autonumber
    participant R as HTTP-Route ODER BridgeFileSystem.readText
    participant FS as WorkspaceFileSystem
    participant POL as policy.ts
    participant FSP as node:fs

    R->>FS: readText(ctx, path, opts)
    FS->>FS: resolveWithinWorkspace(path) → ResolvedPath ODER throw
    FS->>FSP: stat(path)
    FSP-->>FS: stats
    FS->>FS: Ablehnen, wenn keine reguläre Datei (describeStatKind)
    alt Cursor übergeben
        FS->>FSP: stabiles FileHandle öffnen
        FS->>FS: Cursor validieren {dev,ino,size}; zum Byte-Offset seeken
        FS->>FS: ganze Zeilen zurückgeben; nächsten Cursor ausgeben
    else Datei <= 256 KiB
        FS->>FSP: stabiles Full-Snapshot öffnen + lesen
        FSP-->>FS: buffer
        FS->>FS: Full-Snapshot hashen; Zeilen-/Output-Limits anwenden
    else Datei > 256 KiB UND ein explizites Fenster-Argument
        FS->>FSP: stabiles FileHandle öffnen
        FS->>FS: angeforderte Zeilen von derselben Inode streamen
        FS->>FS: Output auf 256 KiB begrenzen und Scan auf 8 MiB; Full-File-Hash weglassen
    else fensterloser Lesevorgang bei großer Datei
        FS-->>R: file_too_large
    end
    FS->>POL: detectBinary(sample)
    POL-->>FS: isBinary?
    FS->>FS: Ablehnen, wenn binär
    FS->>FS: shouldIgnore? → annotiere meta.matchedIgnore
    FS->>FS: audit fs.access
    FS-->>R: { content, optional sha256, truncated?, meta }
```

`readText` überspringt oder lehnt Lesevorgänge aufgrund von Ignorier-Regeln nicht ab. Es liest die Datei normal und zeichnet die passende Ignorier-Klassifizierung in `meta.matchedIgnore` auf. `list` und `glob` filtern ignorierte Ergebnisse nur dann, wenn `includeIgnored` nicht aktiviert ist.

### Schreiben

```mermaid
sequenceDiagram
    autonumber
    participant R as POST /file/write ODER ACP writeText
    participant FS as WorkspaceFileSystem
    participant POL as policy.ts
    participant FSP as node:fs

    R->>FS: writeTextAtomic(ctx, path, content, opts)
    FS->>FS: assertTrustedForIntent(trusted, 'write') → throw untrusted_workspace ODER ok
    FS->>FS: resolveWithinWorkspace(path)
    FS->>POL: enforceWriteSize(content) → throw file_too_large ODER ok
    FS->>FSP: lstat(path) → Symlink ablehnen
    FS->>FS: pro-Pfad-Sperre erwerben
    FS->>FSP: stat(existing?) → Ziel-Modus erfassen (Standard 0o600)
    FS->>FSP: writeFile(tmpPath, content, {mode})
    FS->>FSP: rename(tmpPath, path) (atomar)
    FS->>FS: audit fs.access (write)
    FS-->>R: { sha256, mode, bytesWritten }
```

Das atomare Schreiben-dann-Umbenennen stellt sicher, dass ein SIGKILL/OOM während des Schreibens das Ziel NICHT abgeschnitten hinterlässt. `mode: 'create'` bricht mit `file_already_exists` bei lstat ab; `mode: 'overwrite'` fährt fort; `expectedSha256` aktiviert optimistische Nebenläufigkeit (`hash_mismatch` bei Nichtübereinstimmung).

### `POST /file/edit` (einzelne Textersetzung)

Fügt zwei Fehlermodi zusätzlich zum Schreiben hinzu:

- `text_not_found` (422) – Suchstring nicht in der Datei.
- `ambiguous_text_match` (422) – Mehrere Treffer, wenn genau einer erforderlich war (Vertrag der Route).

### Audit-Fan-Out

```mermaid
flowchart LR
    A["WorkspaceFileSystem-Operation erfolgreich ODER fehlgeschlagen"] --> P["createAuditPublisher → emit FS_ACCESS_EVENT_TYPE / FS_DENIED_EVENT_TYPE"]
    P --> AR["PermissionAuditRing (512 Einträge, FIFO)"]
    P --> MON["Zukunft: externer Monitoring-Senke"]
```

`FS_ACCESS_EVENT_TYPE`/`FS_DENIED_EVENT_TYPE` transportieren Kontext (`ctx`), Pfad, Absicht, Ergebnis, errorKind?, gelesene/geschriebene Bytes, sha256?.

## Zustand & Lebenszyklus

- Die Factory wird einmal beim Daemon-Start erstellt (`runQwenServe` → `resolveBridgeFsFactory` → Adapter).
- Jede Anfrage erstellt einen `RequestContext` und ruft den Orchestrator der Factory nur für diesen Aufruf auf – kein langlebiger Zustand pro Datei.
- Pro-Pfad-Sperren leben nur für die Dauer der Schreiboperation (keine aufrufübergreifende Sperre; gleichzeitige Schreibvorgänge auf denselben Pfad konkurrieren um die Sperre und werden serialisiert).
- Der Audit-Ring gehört `runQwenServe` und wird mit dem Berechtigungs-Audit-Publisher geteilt.

## Abhängigkeiten

- `@qwen-code/qwen-code-core` – `Ignore`, `isBinaryFile`, `Config.isTrustedFolder()`.
- `node:fs`, `node:path`, `node:crypto`.
- `@qwen-code/acp-bridge` – `BridgeFileSystem`-Vertrag auf der ACP-Seite.
- HTTP-Routen: `packages/cli/src/serve/routes/workspace-file-read.ts`, `workspace-file-write.ts`.

## Konfiguration

| Quelle                                             | Stellhebel                                                           | Wirkung                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `WorkspaceFileSystemFactoryDeps.trusted: boolean`  | Konstruktor-Eingabe                                                  | Ob Schreibvorgänge erlaubt sind; Standard `true` von `runQwenServe`, `false` von `createServeApp` (mit Warnung).      |
| Konstante                                          | `MAX_READ_BYTES = 256 KiB`                                           | Full-Snapshot- und zurückgegebener-Text-Cap; größerer Text erfordert ein explizites Fenster-Argument.                  |
| Konstante                                          | `MAX_TEXT_SCAN_BYTES = 8 MiB`                                        | Bytes, die ein Large-Text-Read durchsuchen darf, um ein Zeilen-Offset zu finden; darüber `file_too_large`.              |
| Konstante                                          | `MAX_WRITE_BYTES = 5 MiB`                                            | Schreib-Limit; unterhalb von `express.json({ limit: '10mb' })` dimensioniert.                                         |
| Konstante                                          | `MAX_UPLOAD_BYTES = 50 MiB`                                          | Binär-Upload-Limit für `POST /file/upload`; Uploads überschreiben niemals und nummerieren belegte Namen automatisch durch. |
| Konstante                                          | `BINARY_PROBE_BYTES = 4096`                                          | Stichprobengröße für inhaltsbasierte Binärerkennung.                                                                  |
| Capability-Tags                                    | `workspace_file_read`, `workspace_file_bytes`, `workspace_file_write`, `workspace_file_upload` | Siehe [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).                                             |
| Arbeitsbereichsdateien                             | `.gitignore`, `.qwenignore`                                          | Ignorierte Pfade werden von `shouldIgnore` als `ignored: true` gemeldet.                                              |

## Hinweise & bekannte Grenzen

- **Symlinks werden abgelehnt, nicht verfolgt.** Dies ist eine Abweichung vom Inline-`BridgeClient.writeTextFile`-Proxy vor F1, der Symlinks aufgelöst hat. Agenten, die durch Symlink-Punktdateien schreiben, müssen den aufgelösten Pfad direkt adressieren.
- **`io_error` und `permission_denied` sind verschieden.** Nicht vermischen. Überwachungspipelines nutzen `errorKind` zur Alarmierung – das Einordnen von ENOSPC in permission_denied würde Sicherheitsverantwortliche wegen `df -h`-Problemen alarmieren.
- **Neuer Dateimodus standardmäßig `0o600`, nicht umask-Standard.** Das `mode`-Argument des write-Syscalls umgeht die umask. Agenten können keine pro-Schreibvorgang-Modus-Überschreibung übergeben. Betreiber, die möchten, dass vom Agenten erstellte Dateien der umask des Daemons folgen, können dies pro Daemon mit `QWEN_SERVE_NEW_FILE_MODE=system` aktivieren (bestehende Dateien behalten weiterhin ihren Modus); siehe [`17-configuration.md`](./17-configuration.md).
- **`createServeApp` Standard `trusted: false`** lehnt ACP-Schreibvorgänge stillschweigend mit `untrusted_workspace` für Einbettende ab, die keine benutzerdefinierte `fsFactory` oder `bridge` injizieren. Eine einmalige stderr-Warnung wird beim ersten Mal ausgegeben; weitere Aufrufer erhalten keine Erinnerung. Siehe [`02-serve-runtime.md`](./02-serve-runtime.md).
- **Großer Text erfordert ein explizites Fenster-Argument**, eines von `line` / `limit` / `maxBytes`. Ein Read ohne eines davon bleibt `file_too_large`, weil ein Caller, der glaubt, er halte die gesamte Datei, sie abgeschnitten zurückschreiben könnte. Fenster streamen von einem inode-gebundenen Handle und geben niemals mehr als `MAX_READ_BYTES` zurück.
- **`MAX_READ_BYTES` begrenzt, was ein Read zurückgibt; `MAX_TEXT_SCAN_BYTES` begrenzt, was er kostet.** Zeilen-Offsets werden durch Scannen ab Byte 0 aufgelöst, daher gibt `{ line: 900_000_000, limit: 20 }` fast nichts zurück und durchläuft dennoch die Datei. Nach 8 MiB Scan wird der Read mit `file_too_large` unter Verweis auf `readBytes` abgelehnt, das jedes Offset in O(1) erreicht.
- **Gestreamte Fenster tolerieren Appends, keine Truncation.** Der Full-Snapshot-Pfad kann byte-für-byte-Stabilität verlangen, da er die gesamte Datei zurückgibt; ein Präfix-Fenster kann das nicht, sonst schlägt jeder Read eines Live-Logs fehl. Der gestreamte Pfad prüft Inode-Identität plus „nicht geschrumpft", daher bestehen Appends und Truncation / Ersetzung werden weiterhin abgelehnt. `sizeBytes` meldet die Größe bei `open` und beschreibt den Snapshot, aus dem das Fenster geschnitten wurde.
- **Große Partial-Reads lassen den Full-File-Hash weg.** `originalLineCount` wird weggelassen, wenn das Streaming vor EOF stoppt.
- **Paging erfolgt per Byte-Cursor, nicht per Zeile.** Ein Read, der Inhalt zurücklässt, gibt `hasMore` und, wo ein Byte-Offset ableitbar ist, einen opaque `nextCursor` zurück. Die Wiederaufnahme davon ist O(1); die Wiederaufnahme per `line` scannt ab Byte 0 neu und wird jenseits von `MAX_TEXT_SCAN_BYTES` abgelehnt. Der Cursor trägt `{dev, ino, size}`, daher liefert eine ersetzte oder trunkierte Datei `hash_mismatch` statt Bytes von der falschen Stelle, während ein Append ihn gültig lässt. Non-UTF-8-Snapshot-Reads melden `hasMore`, aber keinen Cursor – ihr dekodierter Text ist eine UTF-8-Rekodierung, deren Längen sich nicht auf Datei-Offsets zurückabbilden lassen.
- **Der `BridgeFileSystem`-Adapter MUSS beide Inline-Proxy-Gates replizieren** (Ablehnung nicht-regulärer Dateien + begrenztes Buffering/Streaming). Der Inline-Pfad wird vollständig umgangen, wenn der Adapter injiziert ist.

## Referenzen

- `packages/cli/src/serve/fs/index.ts` (Barrel)
- `packages/cli/src/serve/fs/paths.ts`
- `packages/cli/src/serve/fs/policy.ts`
- `packages/cli/src/serve/fs/errors.ts`
- `packages/cli/src/serve/fs/audit.ts`
- `packages/cli/src/serve/fs/workspace-file-system.ts`
- `packages/cli/src/serve/bridge-file-system-adapter.ts`
- `packages/acp-bridge/src/bridgeFileSystem.ts`
- HTTP-Route-Referenz: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).