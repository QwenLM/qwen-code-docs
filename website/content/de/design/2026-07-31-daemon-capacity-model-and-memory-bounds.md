# Daemon-Kapazitätsmodell und Speichergrenzen

## Kontext

Issue [#8051](https://github.com/QwenLM/qwen-code/issues/8051) stellt fest,
dass der Daemon registrierte Workspaces und Sessions nach Anzahl begrenzt und
dass Anzahl-Limits keine Speicher-Limits sind.
[#8091](https://github.com/QwenLM/qwen-code/issues/8091) schlägt vor, den Fix
als sieben PRs zu liefern, von denen
[#8093](https://github.com/QwenLM/qwen-code/pull/8093) der erste ist: ein
prozessweites `ResourceBudget` über den JavaScript-Heap der Daemon-Root, mit
fünfzehn Byte-Kategorien, zusammengesetzter atomarer Admission, splittbaren
und übertragbaren Leases, drei `AsyncLocalStorage`-scoped fairen Schedulern
und einem Heap-Proxy-Charging-Modell, das einen JavaScript-Wert mit zwei Byte
pro String-Code-Unit, 96 Byte pro Objekt-Node und 16 Byte pro Property
bepreist.

Dieses Dokument schlägt eine andere Zerlegung desselben Problems vor. Es
stimmt der Prämisse von #8051 und dem Instinkt von #8091 zu, inkrementell zu
liefern. Es widerspricht darin, welcher Prozess den Speicher hält, welcher
Mechanismus ihn begrenzen kann und welche Änderung zuerst landen sollte.

Die drei folgenden Befunde stammen aus der Lektüre des Daemons, wie er heute
existiert.

### Der Daemon ist nicht ein Prozess

`ServeMode` ist `http-bridge` (`packages/cli/src/serve/types.ts:18-35`): Der
Daemon heizt pro Workspace-Runtime ein `qwen --acp`-Kind vor, und mehrere
Sessions in einer Runtime multiplexen über `connection.newSession()` auf
dieses Kind. Die Daemon-Root leitet ACP-NDJSON über HTTP und SSE. Der
Pro-Session-RSS von grob 30–50 MB — der Wert, gegen den `maxSessions` in
`types.ts:58-68` dokumentiert ist — wird im Kind verbraucht, nicht in der
Root.

Der aggregierte Kind-RSS ist daher der Ort, an den der
Multi-Workspace-Steady-State-Speicher geht, und ein Byte-Budget über den
Heap der Root beobachtet ihn weder, begrenzt ihn noch lehnt es ihn ab.

Das ist ein Argument gegen ein _universelles Root-Heap-Ledger als
Daemon-weite Grenze_, nicht gegen Root-lokalen Schutz. Die Root besitzt
weiterhin ACP-NDJSON-Assembly, EventBus-Replay-Ringe,
Virtual-Subagent-Snapshots, Settings-Laden, Active-Session-Export, HTTP- und
WebSocket-Queues sowie Generation-scoped Caches, und jeder davon kann sie
unabhängig von jedem Kind erschöpfen. Teil 3 unten ist genau aus diesem Grund
vollständig Root-seitige Arbeit.

### Das Kapazitätsmodell ist vom Host-Speicher entkoppelt

Drei Regler entscheiden, wie viel Speicher der Daemon verbrauchen darf. Jeder
wird unabhängig abgeleitet, und kein Code gleicht sie ab:

| Regler                  | Ableitung                                                   | Ort                                                     |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Registrierte Workspaces | feste Konstante `25`                                        | `packages/acp-bridge/src/channel-control-timeouts.ts:7` |
| Sessions gesamt         | `maxSessionsPerWorkspace × workspaceCount`                  | `packages/cli/src/serve/run-qwen-serve.ts:391`          |
| Pro-Kind-V8-Heap        | `max(min(50% von cgroup-oder-Host-Speicher, 16 GB), V8-Default)` | `packages/acp-bridge/src/spawnChannel.ts:18-36`    |

Der dritte ist der bedeutende. `getAcpMemoryArgs()` berechnet einen Wert,
cached ihn in einer Modul-Level-Variablen und wendet ihn auf **jedes**
gespawnte Kind an. Es ist ein Bruchteil des Hosts, kein Anteil von irgendetwas.

Der Term `max(…, V8 default)` ist aus dem Code nicht offensichtlich und zählt
doppelt. Das Flag wird nur emittiert, wenn das berechnete Ziel das
**eigene** `heap_size_limit` des spawnenden Daemons übersteigt
(`spawnChannel.ts:27-34`), sodass auf Hosts, auf denen das Ziel kleiner ist,
das Flag wegfällt und das Kind still den V8-Default erbt — der selbst vom
Host-Speicher abgeleitet ist. Gemessen auf einem 3,4-GB-Host: Ziel 1747 MB,
Daemon-Limit 1795 MB, Flag weggelassen, Kind-Obergrenze 1795 MB. Auf einem
32-GB-Host ist der Default grob 4 GB, das Ziel ist 16384 MB und das Flag wird
emittiert.

Die erlaubte Gesamtsumme ist also 25 × 16 GB auf einem 32-GB-Host und
25 × ~1,8 GB auf einem 3,4-GB-Host — so oder so ein Overcommit von grob dem
Zwölffachen, und der einzige Effekt des Guards ist heute, eine Obergrenze zu
erhöhen, nie eine zu senken. Genau diese letzte Eigenschaft ist der Grund,
warum die Änderung unten ihn explizit umgehen muss.

Keine Byte-Buchführung im Root-Prozess ändert irgendeine dieser Zahlen, weil
die Root nicht der Prozess ist, der sie alloziert.

### Der Daemon misst Speicher, hat aber keinen Nenner

`DaemonMetricsRing` sampled bereits alle fünf Sekunden `rssBytes`,
`heapUsedBytes`, `cpuPercent` und `eventLoopLagP99Ms` in einen Ring aus 180
Buckets, was fünfzehn Minuten Historie ergibt, und er pollt bereits den RSS
des primären ACP-Kinds mit einem Single-Flight-Guard und einer
30-Sekunden-Staleness-Klippe (`packages/cli/src/serve/daemon-metrics-ring.ts`,
verdrahtet in `run-qwen-serve.ts:4231-4377`). `GET /daemon/status` liefert all
das zurück.

Was dem Daemon fehlt, ist eine Zahl, durch die er teilen kann. Es gibt kein
cgroup-Read, kein `heap_size_limit`, kein Verhältnis, kein Pressure-Level,
keinen speicherabgeleiteten Issue-Code, kein `limits.*`-Memory-Feld und kein
CLI-Flag irgendwo im Daemon-Prozess. Cores `MemoryPressureMonitor` berechnet
das alles, aber `computeEffectiveMemoryLimit()` ist eine private Methode
(`packages/core/src/services/memoryPressureMonitor.ts:766`) einer Klasse, die
nur von `Config.initialize()` konstruiert wird, was der Daemon nie aufruft.
Secondary-Workspace-Kinder und jeder Channel-Worker melden überhaupt keinen
RSS.

Der Daemon kann sagen, wie viele Bytes er nutzt, und kann nicht sagen, ob das
viel ist.

## Problem

Präzise formuliert: **Das Kapazitätsmodell des Daemons hat keine Beziehung
zum Speicher des Hosts, und der Daemon kann nicht beobachten, wie nah er der
Erschöpfung ist.** Separat und unabhängig davon ist eine kleine aufzählbare
Menge von Root-Prozess-Containern wirklich unbegrenzt — jeder einzelne davon
kann die Root aus eigener Kraft erschöpfen, ohne dass ein einziges Kind
beteiligt ist. Beides ist real; beides ist kein Grund, eine generelle
Buchführungsschicht über jede Allokation zu bauen.

## Ziele

- Die Kapazitätsregler aus einer einzigen Speicherzahl ableiten, damit die
  Heap-Obergrenze eines Kindes ein Anteil von etwas ist statt ein pro Kind
  wiederholter Bruchteil des Hosts.
- Dem Daemon einen Nenner geben, damit Pressure beobachtbar ist, bevor er
  tödlich ist.
- Die Container begrenzen, die wirklich unbegrenzt sind, und zwar am
  Container.
- Die _Summe_ vieler individuell begrenzter Container begrenzen, wenn die
  Multiplizität die Summe zum eigentlichen Risiko macht.
- Jede Änderung unabhängig reviewbar und unabhängig nützlich halten — und jede
  ehrlich darüber bleiben lassen, welche Pfade sie abdeckt.

## Non-Goals

- Kein prozessweites Byte-Ledger über den Root-Heap und kein
  Heap-Proxy-Charging-Modell. Siehe „Verworfene Alternativen".
- Keine Remediation in der Beobachtungsarbeit: kein erzwungener GC, keine
  LRU-Eviction, kein Session-Schließen, keine Prozessbeendigung.
- Keine Änderung des Speicherverhaltens der interaktiven CLI oder des
  IDE-Companions.
- Keine RSS- oder Prozessbaum-Speicher-_Garantie_. Teil 1 begrenzt den
  V8-Old-Space in ACP-Kindern; Buffer, native Allokationen, Channel-Worker
  und MCP-Nachfolger liegen außerhalb.
- Jetzt keine generelle Scheduling-Schicht. Spawn-Zeit-Admission liegt auf dem
  Pfad — sie ist das, was jedes durchsetzbare Live-Kinder-Budget erfordert —
  aber sie wartet auf die Daten von Teil 2, und die Heavy-I/O- und
  Prozess-Lanes warten auf Belege für Parallelitätsverstärkung. Siehe
  „Verworfene Alternativen".

## Designprinzip

**Mache die Grenze zu einer Eigenschaft des Containers, nicht zu einem
Versprechen des Aufrufers.**

Eine vom Aufrufer deklarierte Reservierung ist nur so gut wie der Aufrufer.
`runBufferedProcessOperation(scheduler, budget, cwd, operation, maximumBufferedBytes, task)`
von #8093 akzeptiert eine Byte-Zahl, die der Aufrufer behauptet, und nichts
gleicht gegen die tatsächliche Ausgabe des Prozesses ab; ein Aufrufer, der 1 MB
deklariert und 500 MB emittiert, lässt das Ledger Gesundheit melden, während
der Heap wächst. Dieses Muster zu verallgemeinern heißt, dass jede von mehreren
hundert Allokationsstellen sich auf jedem Pfad für immer daran erinnern muss,
auf jedem Pfad zu schätzen, zu reservieren und freizugeben, ohne
Compiler-Unterstützung. Die Abdeckung wird partiell sein. Partielle Abdeckung
ist nicht nutzlos — sie ist in Ordnung und normal, wenn Status und
Capabilities exakt benennen, welche Pfade geschützt sind; das ist eine
Disziplin, die der eigene Lieferplan von #8093 bereits auferlegt. Der
Fehlermodus ist enger als „partiell": Es ist das Bewerben einer Daemon-weiten
Garantie auf Basis einer unvollständigen Buchführung, sodass die
verbuchten Pfade mit 503 anfangen, Arbeit abzulehnen, während die nicht
verbuchten Pfade diejenigen sind, die den Heap erschöpfen.

Dieses Prinzip ist bereits Hausstil, und die beste Arbeit dieses Repositories
folgt ihm:

- `readTextRangeFromHandle` nimmt zwei **erforderliche** Byte-Budgets —
  `maxOutputBytes` für das, was ein Read zurückgibt, und `maxScanBytes` für
  das, was er kostet — denn „ein Aufrufer greift genau dann zum Handle, wenn
  der Read begrenzt sein muss"
  ([`2026-07-29-handle-bound-text-range-reads.md`](./2026-07-29-handle-bound-text-range-reads.md)).
  Er prüft den Akkumulator auf jedem Chunk, nicht auf jedem Frame, denn „eine
  Region ohne Zeilenumbruch würde ihn sonst wachsen lassen, bis die gesamte
  Datei resident ist" (`packages/core/src/utils/read-text-range.ts:350-353`).
- `packages/cli/src/serve/fs/policy.ts:33-62` trennt weiche Trunkierung
  (`enforceReadSize`) von harter Ablehnung (`enforceWriteSize`,
  `enforceReadBytesSize`) und dimensioniert `MAX_WRITE_BYTES` bewusst unter
  dem Express-Body-Limit, damit ein Body, der den Parser überlebt, auch das
  Policy-Gate überlebt.
- Das begrenzte Replay-Fenster
  ([`2026-07-07-bounded-replay-snapshot-window.md`](./2026-07-07-bounded-replay-snapshot-window.md))
  begrenzt das behaltene Replay über serialisierte Bytes, behält mindestens
  eine Einheit, wenn eine einzelne Einheit das Limit übersteigt, und zeigt den
  Verlust als expliziten `history_truncated`-Marker statt still zu
  truncieren. Seine Audit-Note Runde 3 hält die Lektion direkt fest: „Ein
  Turn-Count-Limit begrenzt keinen Speicher, wenn ein Turn große Tool-Ausgabe
  enthält."

Die Arbeit unten verallgemeinert diese. Sie fügt kein zweites Paradigma neben
ihnen hinzu.

## Design

### Teil 1 — Ein Budget, ein Nenner, gemeldet bevor es angewendet wird

Die Speicherzahlen des Daemons einmal auflösen und melden. Noch nichts
konsumiert sie, um ein Kind zu dimensionieren, und diese Zurückhaltung ist das
Design, keine Staging-Bequemlichkeit.

```
availableMemoryMb        = cgroup limit, else os.totalmem()          (capped at the host total)
configuredBudgetMb  = --memory-budget-mb ?? floor(availableMemoryMb * 0.5)
effectiveBudgetMb   = min(configuredBudgetMb, availableMemoryMb)
rootReserveMb       = min(clamp(floor(effectiveBudgetMb * 0.1), 256, 1024), effectiveBudgetMb)
childPoolMb         = effectiveBudgetMb - rootReserveMb
legacyChildCeilingMb     = min(floor(availableMemoryMb * 0.5), 16384)     // what a child gets today
insufficientMemory  = effectiveBudgetMb < 1024
```

Konfiguriert und effektiv sind getrennt, weil sie in beide Richtungen
auseinanderlaufen und ihre Zusammenlegung einen Nenner erzeugt, den die
Maschine nicht tragen kann. Ein explizites Budget größer als der Host wird
nach unten gekappt. Ein abgeleitetes Budget unter dem dokumentierten Minimum
wird **nicht** nach oben geklemmt — ein früherer Draft tat genau das, und ein
768-MB-Host meldete folglich ein 1024-MB-Budget, was jedes Verhältnis
vergiftet hätte, das die Beobachtungsarbeit berechnen soll. Ein zu kleiner
Host ist eine Beobachtung (`insufficientMemory`), keine Lizenz, Kapazität zu
erfinden.

`recommendedChildShareMb(budget, children)` wird exportiert und sowohl bei der
registrierten als auch bei der Live-Kinder-Zahl gemeldet. Es wird nie
angewendet. Die Lücke zwischen diesen beiden Zahlen ist der Grund, sie zu
melden.

#### Warum der Anteil nicht angewendet wird

Den Pool durch die Anzahl der Workspaces zu teilen scheitert an seinen eigenen
Ansprüchen, und dieses Dokument schlug es zuvor vor:

- **Registrierung ist keine Allokation.** Eine Workspace-Runtime spawnt ihr
  Kind lazy und `channelIdleTimeoutMs` defaultet auf `0` — „kills the channel
  immediately" (`packages/acp-bridge/src/bridgeOptions.ts:415-422`) — sodass
  eine ruhende Secondary kein Kind hat. Die vorgeheizte Primary ist die
  Ausnahme.
- **Ein Divisor aus der registrierten Anzahl hat echte Kosten und kauft
  nichts.** Auf einem 32-GB-Host mit 25 registrierten Workspaces und nur der
  vorgeheizten Primary live fiele dieses Kind von einer 16384-MB-Obergrenze
  auf 614 MB — eine 26,7-fache Kürzung, getrieben von 24 Registrierungen, die
  keinen Speicher halten. Derweil bedeutet der Pro-Kind-Floor, dass geteilte
  Anteile in Summe immer noch über den Pool hinausgehen: Auf einem 8-GB-Host
  autorisieren 25 Kinder mit einem Floor von 512 MB 12800 MB gegenüber einem
  Pool von 3687 MB.
- **Dynamische Registrierung lässt keine tragfähige Anzahl.** Eine
  Boot-Zeit-Anzahl verfehlt spätere Workspaces; Neuberechnen kann den
  V8-Heap eines laufenden Kindes nicht schrumpfen; die aktuelle registrierte
  Anzahl bestraft ruhende Workspaces. Stattdessen durch die _Live_-Kinder zu
  teilen ergibt weiterhin Obergrenzen, die von der Spawn-Reihenfolge abhängen,
  und weiterhin keine Gesamtgrenze.

Die echte Steuerung ist Admission zur Spawn-Zeit, keyed auf gleichzeitig
live Kindern, mit einer erklärten Policy für den Fall, dass das nächste Kind
den Pool überschreiten würde. Das braucht die Daten, die Teil 2 erzeugt, daher
wird es verschoben statt geraten.

#### Was eine Kinder-Kapazitäts-Policy respektieren muss, wenn sie kommt

- **`--max-old-space-size` begrenzt den V8-Old-Space, nicht den RSS.** Es
  deckt keine Buffer, externe und native Allokationen, die Young Generation,
  Channel-Worker, MCP-Nachfolger oder irgendeinen anderen Kindprozess ab.
  Jede Policy hier ist eine _Kind-Heap-Policy_, nie eine
  Prozessbaum-Speicher-Garantie, und die Root-Reserve ist eine Absicherung,
  keine Buchführung über diese Konsumenten.
- **Einen Anteil anzuwenden ist eine Kompatibilitätsänderung selbst ohne
  Ablehnungen**, weil es das GC- und OOM-Verhalten der Kinder ändert. Es kann
  nicht als „nur Meldungen" ausgeliefert werden.
- **Sie darf nie eine Obergrenze erhöhen.** Das Klemmen auf
  `legacyChildCeilingMb` ist es, was die Policy sicher macht, um sie
  bedingungslos anzuwenden; ohne es blasen sowohl die Minimum-Budget-Konstante
  als auch ein zu großes explizites Flag den Anteil auf.
- **Der Spawn-Pfad hat eine Falle.** `getAcpMemoryArgs()` emittiert
  `--max-old-space-size` nur, wenn sein berechnetes Ziel das _eigene_
  `heap_size_limit` des spawnenden Daemons übersteigt
  (`spawnChannel.ts:27-34`). Ein budgetabgeleiteter Anteil liegt normalerweise
  darunter, sodass eine naive Änderung still wegfällt und der Overcommit
  zurückkehrt. Der Regressionstest muss asserten, dass das Flag einen Wert
  unter dem eigenen Limit des Testprozesses überlebt.

### Teil 2 — Beobachten, mit einem Nenner, vor dem Durchsetzen

Der bestehende Fünf-Sekunden-Sampler erhält das effektive Speicher-Limit,
`v8.getHeapStatistics().heap_size_limit`, und den aggregierten Kind-RSS über
**alle** Workspace-Kinder und Channel-Worker statt nur der Primary. Der Status
erhält `runtime.memory { level, ratio, source }` und zwei Codes auf der
abgeschlossenen Issue-Union in `daemon-status.ts:70-85`.

Das Mode-Flag folgt dem etablierten `--mcp-client-budget` /
`--mcp-budget-mode`-Idiom: `off | warn | enforce`, defaultet auf `warn`, wenn
ein Budget gesetzt ist, wobei `enforce` beim Boot abgelehnt wird, bis eine
spätere Änderung es verdient. Nichts in diesem Teil remediiert.

Dies wird bewusst vor der Byte-Cap-Arbeit vorgezogen. Es ist das einzige
Stück, dessen Wert nicht davon abhängt, dass der Rest des Designs korrekt ist,
und jedes später gewählte Limit sollte gegen seine Daten kalibriert statt
geraten werden. Die Limit-Tabelle von #8093 ist ein schwächeres Argument für
diese Reihenfolge, als sie zunächst erscheint, und die schwächere Form ist die
ehrliche: `prompt: 384 MiB` ist exakt `normalAdmissionBytes` und daher
redundant, aber die 256-MiB-Kategorien sind _nicht_ tot — eine einzelne
Kategorie, die 256 MiB erreicht, bindet deutlich bevor die gesamte normale
Nutzung die 384-MiB-Obergrenze erreicht. Das Problem mit der Tabelle ist
einfach, dass die Konstanten unkalibriert sind, und genau das behebt die
Beobachtung.

### Teil 3 — Die Container begrenzen, die wirklich unbegrenzt sind

Nach gemessenem Risiko geordnet, jedes unabhängig auslieferbar.

**Der NDJSON-Frame-Reader hat keinerlei Grenze.**
`packages/acp-bridge/src/ndJsonStream.ts:35` deklariert
`pending: Uint8Array[]`, schiebt bei `:92` unterminierte Tail-Bytes hinein und
prüft nie eine Anzahl oder eine Byte-Summe. `takeLineBytes` (`:96-111`)
alloziert dann eine zusammenhängende Kopie der akkumulierten Summe,
`TextDecoder.decode` erzeugt einen UTF-16-String von grob dem Doppelten davon,
und `JSON.parse` baut erneut Objekte — etwa fünffache Verstärkung über einen
Frame, der keine Obergrenze hat. Dies ist die Leseseite des Stdout jedes
gespawnten ACP-Kinds, und
`packages/cli/src/serve/large-pipe-frame-observer.ts:10` protokolliert nur
Frames über 256 KiB. Der Fix ist ein Frame-Byte-Cap, das auf jedem Chunk
geprüft wird, ein typisierter Fatal-Error auf Daemon-verwalteten Streams und
eine Queuing-Strategie auf dem dekodierten Nachrichten-`ReadableStream` bei
`:33`, der nie `desiredSize` konsultiert und ein zweiter unbegrenzter Puffer
hinter einem langsamen Konsumenten ist. `createStderrForwarder`
(`spawnChannel.ts:58-72`, 64 KiB mit einem `[truncated]`-Marker) und der
Log-Puffer des Channel-Workers (`channel-worker-supervisor.ts:67-69`) sind die
Vorlagen im Repo.

**Der EventBus-Replay-Ring begrenzt nur nach Frame-Anzahl.**
`packages/acp-bridge/src/eventBus.ts:473` evicted bei
`ring.length > ringSize`, Default 8000 Frames, pro Session, auf eine Million
tunable. Das fällt auf, weil alles um den Ring bereits Byte-begrenzt ist:
Pro-Subscriber-Queues bei 2 MiB, Replay-Burst bei 8 MiB, Journal bei 8 MiB,
kompaktes Replay bei 4 MiB. Der Ring ist die Lücke, und er multipliziert die
oben unbegrenzten Frames mit 8000. Die serialisierte Größe ist **bereits
berechnet und im Scope** bei `:459`, wo sie der Compaction-Engine übergeben
wird; sie auf den Ring anzuwenden ist eine laufende Summe, eine
Eviction-Schleife über beide Grenzen und die Behalte-mindestens-eins-Garantie,
die die Compaction-Engine bereits implementiert.

**Virtuelle-Subagent-Transkripte werden vollständig gelesen.**
`packages/cli/src/serve/virtual-subagent-sessions.ts:331,385` rufen
`Buffer.alloc(size - this.offset)` mit `this.offset === 0` beim ersten Lesen
auf, materialisieren das gesamte `.jsonl`-Transkript und separat das gesamte
`.stream`-Sidecar, dann `.toString('utf8')`, dann `.split('\n')`, dann ein
Parse pro Zeile. `createSnapshotOnce` (`:593-620`) konstruiert ein zweites
Ziel und liest das gesamte Transkript erneut, sodass zwei bis drei Live-Kopien
übrig bleiben. Der Paging-Reader und das Byte-Cursor-Muster, das bereits in
Arbeit ist, sind der Ersatz.

**Session-Load und -Export sind asymmetrisch gekappt.**
`packages/cli/src/serve/server/session-export.ts:83-108` übergibt ein
Byte-Cap im archivierten Zweig und ruft `loadSession()` ohne eines im aktiven
Zweig auf — derselbe ungekappte Pfad, den Daemon-Load und -Resume nutzen. Das
archivierte Cap ist 256 MB JSONL, die zu ein bis zwei Gigabyte Objekte geparst
werden, sodass keiner der Zweige eine echte Grenze ist.
`session-transcript-reader.ts` ist das korrekte Modell und existiert bereits.

**Vom Workspace bereitgestellte Konfigurationsdateien werden ohne
Größen-Gate gelesen.** `fs.readFileSync(path, 'utf-8')` auf
Workspace-`.qwen/settings.json` (`packages/cli/src/config/settings.ts:557,733`),
Trusted Folders, dem Serve-Fast-Path (synchron, also blockiert er auch den
Event-Loop) und jedem entdeckten `QWEN.md`, zwanzig gleichzeitig
(`packages/core/src/utils/memoryDiscovery.ts:225,245`). Die Registrierung
eines Workspaces, der ein zwei Gigabyte großes `settings.json` enthält,
erschöpft den Daemon ohne Session, ohne Prompt und ohne Agent — der billigste
Angriff in der Menge und derjenige, der am weitesten von allem entfernt ist,
was ein Heap-Ledger bemerken würde.

Mit Belegen erfasst und verschoben: SSE- und WebSocket-Schreibketten
respektieren Backpressure, begrenzen aber keine gequeueten Bytes
(`acp-http/sse-stream.ts:110-128`, `ws-stream.ts:58-82`);
ACP-Pre-Attach-Frame-Puffer spiegeln das `maxQueued` des EventBus, aber nicht
sein `maxQueuedBytes` (`connection-registry.ts:18,30`); die organisierte
Session-Liste materialisiert 50.000 Zusammenfassungen; mehrere
Pro-Workspace-Caches überleben ihren Workspace.

### Teil 4 — Kleine aggregierte Quoten, wo Multiplizität zählt

Einen Container zu begrenzen begrenzt einen Container. Es begrenzt nicht _N_
davon, und die Form des Daemons sind viele kleine begrenzte Dinge: 32 Sessions
pro Workspace, 25 Workspaces, je ein 8-MiB-Journal und ein 4-MiB-kompaktes
Replay. Jedes davon kann innerhalb seines dokumentierten Limits sitzen,
während die Summe mehrere Gigabyte erreicht. Teil 3 allein erzeugt daher keine
aggregierte Grenze, und anderes zu behaupten würde den Fehler wiederholen, für
den dieses Dokument #8093 kritisiert.

Was gebraucht wird, ist eng: Pro-Workspace- und prozessweite Zähler über
behaltene Ringe, Queues, Caches und parallele große Operationen, aktualisiert
an den tatsächlichen Einfüge- und Entnahmestellen. Zwei Eigenschaften
verhindern, dass dies wieder zum Ledger von #8093 wird — er zählt die Bytes,
die ein Container **tatsächlich behält**, statt geschätzter V8-Objektkosten,
und er wird dort gepflegt, wo die Datenstruktur bereits mutiert, statt bei
einem separaten Reservierungsaufruf, an den sich jeder Aufrufer erinnern muss.
Das bestehende Pro-Subscriber-`maxQueuedBytes` des `EventBus` ist die zu
kopierende Form; es ist bereits korrekt, nur nicht aggregiert.

Scope und Konstanten dafür gehören hinter Teil 2, aus demselben Grund wie
dessen Konstanten.

### Gemeinsame Helper, beim zweiten Konsumenten extrahiert

`truncateUtf8` existiert in zwei privaten Kopien. Ein Container, der nach
Anzahl, Bytes und TTL begrenzt ist, ist einmal korrekt implementiert
(`session-transcript-reader.ts:148-150`) und andernorts approximiert. REST und
ACP pflegen zwei handgeschriebene Mappings über einer gemeinsamen
Fehlerklassen-Menge, von denen `FsError` (`fs/errors.ts:101`) das einzige
Mitglied mit eigenem HTTP-Status ist. Jedes davon lohnt sich zu vereinheit-
lichen, wenn in dieser Arbeit ein zweiter Konsument erscheint, und nicht
davor.

## Verworfene Alternativen

**Ein prozessweites Byte-Ledger über den Root-Heap (`ResourceBudget` von
#8093).** Es budgetiert die Root, wo der Speicher nicht ist; seine
Heap-Proxy-Konstanten haben keine stabile Beziehung zu V8, das Strings als
Ropes, Slices oder externe Daten repräsentiert und Objekte nach
Hidden-Class-Sharing bepreist, sodass der Fehler ein Faktor von zwei bis fünf
in beide Richtungen ist; und seine Kategorien sind global statt
Pro-Workspace, sodass sie die Tenancy-Isolation nicht liefern, die #8051
verlangt. Seine eigenen Defaults zeigen die Schwierigkeit, Zahlen ohne
Messung zu wählen, wie oben angemerkt.

Zwei Implementierungseigenschaften, die beim Ausführen des Branches bestätigt
wurden, sind es wert, festgehalten zu werden, damit sie später nicht neu
hergeleitet werden. `ResourceBudget.release()` und
`ResourceBudgetLease.commitGrow()` sind öffentlich und unvalidiert, sodass ein
einzelner verirrter Aufruf `usedBytes` negativ treibt und jedes nachfolgende
Cap still aufhört zu binden; und `grow()` akzeptiert einen Lease, der zu einem
anderen Budget gehört, was beide korrumpiert. Separat wird
`emergencyPoolBytes` zu `0`, wann immer `capBytes` übergeben wird
(`resource-budget.ts:199-201`), sodass die Reserve, die existiert, um Shutdown
und Overload-Reaktionen möglich zu halten, genau dann verschwindet, wenn ein
Operator ein Budget konfiguriert — was `--memory-budget-mb` tun würde.

**Eine neue faire Scheduling-Schicht, wie geschrieben
(`FairDaemonBulkScheduler` und seine Spawn- und Prozess-Lanes).** Jeder oben
aufgezählte Hot Spot ist ein Größenproblem; keiner wird behoben, indem weniger
parallele Operationen zugelassen werden. Die Parallelitätsprimitive existieren
bereits und sind im Einsatz: `createFifoTaskQueue(limit)`
(`extension-operation-scheduler.ts:31`) mit FIFO-Admission,
`AbortSignal`-De-Queueing und `runUntilReleased` für frühe Slot-Freigabe;
`PathMutexRegistry` für keyed Locks; und
`createTotalSessionAdmissionController`
(`total-session-admission.ts:40-121`) für Anzahl-Admission mit idempotenter
Freigabe und typisierten Fehlern, was heute die Pro-Workspace-Isolation
liefert.

Die vorgeschlagenen Lanes tragen zudem Defekte, die gegen ihre Übernahme als
Fundament sprechen: Das `AbortSignal` wird akzeptiert, aber nie an den Task
weitergeleitet, sodass das Abbrechen eines Requests ihn nur de-queued, während
er gequeued ist, und einen laufenden Kindprozess mit seinem Slot übrig lässt;
Nested- und Cross-Lane-Acquisition sind harte 503er, die über
`AsyncLocalStorage` an alle geerbte asynchrone Arbeit propagiert werden, was
beim ersten Mal fehlschlägt, wenn eine Bulk-Operation legitimerweise spawnen
muss; und die Spawn- und Prozess-Lanes setzen das Pro-Workspace-Aktiv-Limit
gleich dem globalen Limit, sodass ein einzelner Workspace jeden Slot belegen
kann. Das ist ein Fall dafür, den Scheduler zu verschieben und zu
verkleinern, nicht ihn auszuschließen, und der frühere Draft dieses Dokuments
hat ihn überbewertet. Die bestehenden Primitive sind keine vollständigen
Ersatzstücke: `createFifoTaskQueue` hat kein Waiting-Bound und keinen Timeout,
`PathMutexRegistry` kann eine unbegrenzte Promise-Kette akkumulieren, und
`createTotalSessionAdmissionController` begrenzt Session-Anzahlen, aber nicht
Kind-Spawns, Dateisystem-Dekodierung oder externe Prozesse. Entscheidender:
**Jedes durchsetzbare Live-Kinder-Budget erfordert Admission zur Spawn-Zeit**
— was genau eine Scheduling-Lane ist. Also liegt Spawn-Admission auf dem Pfad;
die Heavy-I/O- und Prozess-Lanes sollten auf Messungen warten, die
Parallelitätsverstärkung oder Cross-Workspace-Verhungern zeigen, und wenn
Pro-Workspace-Fairness nötig ist, ist keyed Round-Robin auf der bestehenden
Queue grob vierzig Zeilen gegenüber einem getesteten Primitiv.

**`AsyncLocalStorage` auf dem Daemon-Request-Pfad.** Es gibt heute keines in
`packages/cli/src/serve` oder `packages/acp-bridge`. Die
Workspace-Zuordnung fließt bereits explizit als
`WorkspaceRequestContext.workspaceCwd` (`workspace-service/types.ts:68-77`)
und als `AuditContext` über die Dateisystem-Grenze. Implizite Propagierung
hinzuzufügen, um Daten zu tragen, die bereits explizit getragen werden, fügt
einen Mechanismus hinzu, ohne Information hinzuzufügen.

## Kompatibilität

Die interaktive CLI, der IDE-Companion und die Direct-Embed-Bridge-Pfade
bleiben unverändert: Sie spawnen ein Kind und behalten die Host-abgeleitete
Obergrenze.

Teil 1 ändert keine Kind-Spawn-Argumente, daher ändert sich nichts daran, wie
ein Kind dimensioniert wird, auf keinem Host. Das einzige neue
Boot-Zeit-Verhalten ist das Ablehnen eines außerhalb des Bereichs liegenden
`--memory-budget-mb` und eine Stderr-Brotkrume, wenn ein Budget explizit
gesetzt ist oder der Host unter dem dokumentierten Minimum liegt.

Die Kompatibilitätsdiskussion, die hierher gehört, ist für die
Kinder-Kapazitäts-Policy, die folgt, und wird mit ihr verschoben. Was jetzt
gesagt werden kann: Diese Policy wird Obergrenzen senken und darf sie nie
erhöhen, sie wird auch ohne Ablehnungen eine Kompatibilitätsänderung sein,
und sie braucht eine Admissionsregel für den Fall, dass ein bereits laufendes
Kind nicht geschrumpft werden kann.

Es werden keine neuen Ablehnungen eingeführt. Der einzige neue Boot-Fehler ist
die bestehende Validierungsform für ein außerhalb des Bereichs liegendes
`--memory-budget-mb`. Workspace-Registrierung, persistierte Wiederherstellung
und `POST /workspaces` bleiben unverändert.

`maxSessions` und `maxTotalSessions` behalten ihre aktuellen Defaults und
Ableitungen, und diese Änderung gibt ihnen keine neue Grenze. Ein früherer
Draft behauptete, `maxTotalSessions` sei transitiv begrenzt, weil
`workspaceCount` durch das Budget gekappt würde; das ist gegenüber diesem PR
falsch, wo das Workspace-Cap die feste `MAX_REGISTERED_WORKSPACES = 25` bleibt
und nichts ein Limit aus dem Budget ableitet. Sessions multiplexen weiterhin
auf ein Kind pro Workspace, sodass der Pro-Session-Speicher in einem
Kind-Heap sitzt, den derzeit nichts außer der V8-eigenen Obergrenze begrenzt.
Die Dokumentation von `maxSessions` sollte als Fairness- und
Dateideskriptor-Hebel gelesen werden, nicht als Speicher-Hebel.

`limits.memory` und `runtime.memory` auf `GET /daemon/status` sind additiv und
optional im SDK-Spiegel, sodass ältere Daemons gegen neuere Clients parsen.

Channel-Worker spawnen `process.execPath` pro Workspace ohne
Speicherargumente (`channel-worker-supervisor.ts:823`). Sie sind echte
Konsumenten des Speichers des Daemon-Baums und sind nicht durch die
Pro-Kind-Obergrenze abgedeckt; die Root-Reserve deckt sie nominell ab, und
Teil 2 misst sie.

## Verifizierungsplan

- Die Budget-Arithmetik über eingeschränkte und nicht eingeschränkte Hosts
  Unit-testen, mit injizierter Host-Zahl, einschließlich des Pro-Kind-Floors,
  der 16-GB-Obergrenze, der cgroup-Sentinel-Klemme und der Monotonie des
  Pro-Kind-Anteils in der Kinder-Anzahl.
- Regressionstesten, dass eine budgetabgeleitete Obergrenze emittiert wird,
  selbst wenn sie unter das eigene Heap-Limit des spawnenden Daemons fällt.
  `getAcpMemoryArgs()` emittiert `--max-old-space-size` derzeit nur, wenn das
  berechnete Ziel das aktuelle Limit übersteigt; ein budgetabgeleiteter Wert
  ist normalerweise kleiner, sodass eine naive Änderung das Flag still
  weglassen und den Overcommit wiederherstellen würde. Das ist der einzelne
  wichtigste Test in der ersten Änderung.
- Asserten, dass das effektive Budget den aufgelösten Host-Speicher nie
  übersteigt, in beide Richtungen: ein explizites Budget über dem Host wird
  nach unten gekappt, und ein Host unter dem dokumentierten Minimum meldet
  `insufficientMemory`, statt nach oben geklemmt zu werden. Asserten, dass der
  empfohlene Anteil `legacyChildCeilingMb` nie übersteigt, über Host-Größen
  von 768 MB bis 32 GB.
- Asserten, dass sich kein Kind-Spawn-Argument ändert: die bestehenden
  Spawn-Suiten laufen unverändert durch, und `getAcpMemoryArgs` bleibt in
  diesem Stadium unberührt.
- End-to-End: mit mehreren `--workspace`-Werten booten und
  `GET /daemon/status` lesen; `limits.memory` sollte den Host ehrlich
  beschreiben und `runtime.memory` sollte `activeAcpChildren` unter
  `registeredWorkspaces` zeigen, sobald ein Workspace idle wird — die
  Beobachtung, die es rechtfertigt, die spätere Policy auf Live-Kinder zu
  keyen.
- Für Teil 2 einen endlichen Wert unter cgroup v2, cgroup v1 und weder noch
  asserten; die Level-Klassifikation asserten; asserten, dass kein
  Remediationspfad existiert; bestätigen, dass der aggregierte Kind-RSS
  Secondary-Workspaces und Channel-Worker einschließt. Dann den Daemon unter
  echter Nutzung laufen und das Ergebnis lesen — diese Daten kalibrieren
  Teil 3.
- Für jede Teil-3-Änderung ist der Abnahmetest ein Vorher/Nachher gegen eine
  echte übergroße Eingabe: ein mehrfacher Gigabyte einzelner NDJSON-Frame, ein
  8000-Frame-Ring großer Events, ein zwei Gigabyte großes `settings.json`. Der
  Daemon muss mit einem typisierten Fehler ablehnen, während der RSS flach
  bleibt, wo er heute wächst, bis der Prozess stirbt. Dieser Beleg ist der
  Punkt: Ein Test, dass ein Ledger intern konsistent ist, ist kein Test, dass
  Speicher begrenzt ist.
- `npm run build`, `npm run typecheck` und `npm run lint` auf jeder Änderung,
  plus die ko-lokalisierten Suiten für berührte Dateien.
