# Handle-gebundene Text-Range-Reads

## Kontext

PR #7947 ließ das Serve-Workspace-Dateisystem begrenzte Zeilenfenster aus
Textdateien über `MAX_READ_BYTES` (256 KiB) zurückgeben. Damit diese Reads
über Validierung, Binary-Probing und Streaming hinweg an eine Inode gepinnt
bleiben, wurde ein vom Aufrufer besessenes `FileHandle` als optionales Feld
hinab in `readTextRange` gereicht und ein zweites optionales Feld
`forceStreaming` hinzugefügt, um den puffernden Fast Path zu unterdrücken,
der sonst die Speicherbegrenzung aushebeln würde.

Zwei optionale Felder an einem Einstiegspunkt erzeugten vier Kombinationen,
von denen eine sinnvoll, eine unerreichbar und eine unsicher ist:

| `fileHandle` | `forceStreaming` | Ergebnis                                                                  |
| ------------ | ---------------- | ------------------------------------------------------------------------- |
| nicht gesetzt | nicht gesetzt   | gewöhnlicher Pfad-Read                                                     |
| nicht gesetzt | gesetzt         | streamt eine kleine Datei — von einem Test genutzt                        |
| gesetzt      | gesetzt          | der Read der Serve-Grenze                                                  |
| gesetzt      | nicht gesetzt   | puffert die gesamte Datei durch das Handle — **kein Aufrufer kann ihn erreichen** |

Die unerreichbare Kombination brachte einen eigenen Helper
`readFileHandleBuffer` ohne Testabdeckung mit. Separat akzeptierte
`readFileWithLineAndLimit` dasselbe `fileHandle`, konnte es aber nur in seinem
Range-Zweig honorieren: ein unbegrenzter Read fiel auf ein pfadbasiertes
`readFileWithEncodingInfo` durch und lieferte still Bytes von dem, wozu der
Pfad in diesem Moment auflöste, statt von der gepinnten Inode. Ein
Folge-Commit von PR #7947 schützte das mit einem Runtime-`RangeError`, der
die Falle dokumentierte, ohne sie zu entfernen.

Die Encoding-Erkennung hatte sich aus demselben Grund aufgespalten.
`detectFileEncoding` nimmt einen Pfad und öffnet seinen eigenen Deskriptor,
sodass der Handle-Pfad ihn nicht nutzen konnte; ein privates
`detectFileHandleEncoding` wurde daneben gestellt, das den Encoding-Namen aus
`decodeBufferWithEncodingInfoAsync(...).encoding` ableitet statt direkt aus
chardet. Die beiden widersprechen sich, wenn chardet ein Encoding benennt, das
`iconv-lite` nicht laden kann: die Pfad-Variante liefert diesen Namen, die
Handle-Variante liefert `'utf-8'` und verlässt sich auf den
`fatal: true`-Fehler des Streaming-Decoders. Beide lehnen die Datei ab, mit
unterschiedlichen Meldungen.

## Ziele

- Ein Encoding-Detektor, nutzbar von einem Pfad oder einem geliehenen
  Deskriptor.
- Keine Mode-Flags auf dem Range-Reader; die unerreichbare Kombination
  unrepräsentierbar machen statt nur ungenutzt.
- Den Pfad-Durchfall strukturell unmöglich machen statt nur bewachen.
- Keine beobachtbare Änderung an der Serve-Grenze oder im `read_file`-Tool.

## Non-Goals

- `decodeBufferWithEncodingInfo` (synchron) in seinen asynchronen Zwilling
  zusammenführen. Die synchrone Variante ist ein bewusster
  Public-API-Kompatibilitäts-Shim
  ([`lazy-first-use-dependencies.md`](./lazy-first-use-dependencies.md)), der
  durch einen Parity-Test festgeschrieben ist.
- Jegliche Änderung daran, was die Serve-Grenze zurückgibt. Dies ist die
  Vorbereitung für Byte-Cursor-Paging, nicht dieses Feature.

## Design

### Ein Detektor

`detectFileEncoding(source: string | FileHandle)`. Ein übergebenes Handle wird
_geliehen_: Reads nutzen explizite Positionen, sodass die Dateiposition des
Aufrufers unberührt bleibt, und der `finally`-Block schließt nur einen
Deskriptor, den diese Funktion selbst geöffnet hat. `detectFileHandleEncoding`
wird gelöscht und der offen kodierte BOM-zu-Name-Switch durch das bestehende
`bomEncodingToName` ersetzt.

Das macht den Handle-Pfad etwas strenger, was die beabsichtigte Richtung ist:
ein Encoding, das `iconv-lite` nicht laden kann, löst nun
`LargeNonUtf8TextError(detected)` mit Benennung dieses Encodings aus, statt
den Decoder zu erreichen und die generische `'invalid-utf8'`-Variante
auszulösen. Die Ablehnung bleibt unverändert; die Meldung wird besser. Die
Serve-Grenze bildet beide auf `binary_file` ab, sodass sich nachgelagert nichts
bewegt.

Eine zweite, kleinere Differenz kommt mit der Zusammenführung:
`detectFileEncoding` fängt alle Fehler ab und fällt auf `'utf-8'` zurück,
während `detectFileHandleEncoding` keinen Handler hatte und einen I/O-Fehler
durchlaufen ließ. Der Fehler geht nicht verloren — ein Handle, das schlecht
genug ist, um beim 8-KiB-Probe zu scheitern, scheitert unmittelbar danach auch
beim Streaming-Read, und eine Datei, die nicht wirklich UTF-8 ist, wird immer
noch vom `fatal: true`-Decoder abgelehnt — sodass der Fehler von einem anderen
Aufruf gemeldet wird, statt zu verschwinden. Akzeptiert für die einzelne
Fallback-Policy; angemerkt, weil es eine echte Änderung ist, welcher Aufruf
das Problem meldet.

### Zwei Einstiegspunkte

```ts
readTextRange(request: ReadTextRangeRequest)                    // Pfad
readTextRangeFromHandle(fh, request: ReadTextRangeFromHandleRequest)
```

Die Handle-Variante streamt immer — es gibt kein Flag, denn ein Aufrufer
greift genau dann zum Handle, wenn der Read begrenzt sein muss, und der
puffernde Fast Path würde die gesamte Datei lesen. Ihr Request-Typ hat keinen
`path` (nichts zu disambiguieren), behält das numerische `fileSize`, das vom
öffnenden `fstat` erfasst wurde, und macht beide Byte-Grenzen erforderlich
statt optional. `maxOutputBytes` begrenzt, was der Read zurückgibt,
`maxScanBytes` begrenzt, was er kostet, und `fileSize` verhindert, dass ein
Append den Deskriptor-Snapshot verbreitert, während der Read in Flight ist.
Ein Handle-gebundener Read existiert, weil eine Sicherheitsgrenze alle drei
Grenzen braucht.

`maxScanBytes` bleibt in der Pfad-Variante optional und defaultet dort auf
`Infinity`, sodass das `read_file`-Tool unverändert bleibt.

Beide delegieren an dieselbe Streaming-Implementierung, die nun
`source: string | FileHandle` nimmt und entsprechend `createReadStream` oder
`chunksFromHandle` auswählt. `readFileHandleBuffer` und der Zweig, der ihn
aufrief, werden gelöscht.

### Der Durchfall verschwindet

`readFileWithLineAndLimit` verliert `fileHandle`, `forceStreaming` und
`maxScanBytes` — sein einziger Produktionsaufrufer übergibt keines davon.
`StandardFileSystemService.readTextFileFromHandle` ruft nun
`readTextRangeFromHandle` direkt auf, und die beiden Read-Pfade teilen einen
`toReadTextFileResponse`-Helper, damit ihr Metadata-Shaping nicht auseinander-
driften kann. Ohne einen übrig gebliebenen `fileHandle`-Parameter, der
ignoriert werden könnte, wird der `RangeError`-Guard entfernt: die Falle, die
er beschrieb, kann nicht mehr ausgedrückt werden.

`readTextFileFromHandle` bleibt außerhalb des `FileSystemService`-Interface,
sodass `AcpFileSystemService` und der typisierte Fallback-Mock in
`filesystem.test.ts` unberührt bleiben.

## Auswirkungsradius

- `readTextRange` wird nicht aus `packages/core/src/index.ts` exportiert; die
  drei grenzseitigen Fehlerklassen schon. Die umgeformte Reader-Oberfläche ist
  Core-intern.
- `readTextRange` und `readFileWithLineAndLimit` haben jeweils genau einen
  Produktionsaufrufer (`fileUtils.ts`, `fileSystemService.ts`).
- `detectFileEncoding` ist öffentlich über
  `export * from './utils/fileUtils.js'`. Einen Parameter zu verbreitern ist
  quellkompatibel.
- Der einzige paketübergreifende Importeur der berührten Module ist
  `packages/cli/src/serve/fs/workspace-file-system.ts`. Seine einzige Änderung
  ist das Weglassen zweier Argumente, die der Handle-Pfad nicht mehr
  akzeptiert — siehe unten; der ebenfalls mitgeführte Import von
  `decodeBufferWithEncodingInfoAsync` bleibt unberührt.

### `CoreReadTextFileHandleRequest` wird eigenständig

Es war `Omit<CoreReadTextFileRequest, 'limit' | 'stats' | 'maxOutputBytes'> &
{...}`, was zwei Felder übrig ließ, die der Handle-Pfad nie liest:

- **`stats`** war als erforderlich dokumentiert — „muss die von diesem Handle
  erfassten Stats übergeben" — und nichts Nachgelagertes las das Objekt. Die
  finale API behält nur sein numerisches `fileSize`: der Handle-Pfad braucht
  keine Metadaten, um eine Strategie zu wählen, aber er braucht die
  Öffnungsgröße, um Reads begrenzt zu halten, wenn die Datei gleichzeitig
  erweitert wird.
- **`path`** wurde tot, sobald `readTextRangeFromHandle` den
  Pfad-plus-Handle-Aufruf ersetzte: der Read ist an den Deskriptor gebunden,
  und Fehler werden von der Serve-Grenze, die ihn besitzt, mit dem Pfad
  gelabelt.

Keines von beiden wurde vom Compiler gefangen. Das ACP-`ReadTextFileRequest`,
von dem dieser Typ abgeleitet war, erlaubt zusätzliche Properties, sodass die
Übergabe eines Feldes, das der Typ entfernt hatte, nichts auslöste. Das ist
das Argument dafür, den Typ eigenständig zu deklarieren statt ihn abzuleiten:
die `Omit`-Kette strippte vier von sechs geerbten Feldern und ließ die übrigen
still wieder zu.

Beim Refactor-Commit änderten sich 282 Produktionslogikzeilen in
`packages/core`; der spätere Cursor-Follow-up fügt Verhalten und Tests auf
dieser Baseline hinzu.

## Testen

Beim Refactor-Commit waren die bestehenden Suiten die Spezifikation: der ganze
Punkt war, dass die Serve-Grenze nichts merken darf. Der spätere
Cursor-Follow-up fügt Grenzverhalten und eigene Tests hinzu.

Drei Tests in `read-text-range.test.ts` zogen zu `readTextRangeFromHandle`.
Zwei nutzten `fileHandle` direkt. Der dritte nutzte einen _Pfad_ mit
`forceStreaming: true`, um Streaming auf einer Datei zu erzwingen, die zu
klein war, um den Fast Path zu verlassen, damit die Budget-Grenze bei EOF
getestet werden konnte; mit dem Wegfall des Flags ist die Handle-Variante das
Einzige, das immer streamt.

Einer der verschobenen Tests änderte seine Bedeutung. Er übergab zuvor ein
Handle für eine Datei und einen Pfad, der eine andere Datei benannte, und
assertete, dass das Handle gewann — ein Test für die Verwechslung, die die
alte Signatur erlaubte. Die Handle-Variante hat keinen `path`, sodass diese
Verwechslung nun unrepräsentierbar ist und der Test nichts mehr asserten
würde. Er wurde umgeschrieben, um die Eigenschaft abzudecken, die die API
tatsächlich motivierte: ein Handle öffnen, eine andere Datei über den Pfad
umbenennen und bestätigen, dass der Read weiterhin der Inode folgt.

Zwei Tests in `fileSystemService.test.ts` wurden gelöscht statt repariert. Sie
mockten `readFileWithLineAndLimit` und asserteten das Argumentobjekt, das es
erhielt; da `readTextFileFromHandle` es nicht mehr aufruft, hätten sie nur
erhalten werden können, indem man sie auf einen neuen Mock umpointet, was
erneut nur asserten würde, dass eine Funktion Argumente an eine andere
übergibt. Das Verhalten, das sie nominell abdeckten, wird gegen echte Dateien
in `read-text-range.test.ts` und an der echten Grenze in
`workspace-file-system.test.ts` getestet. Die danebenstehenden
Argument-Validierungs-Tests bleiben erhalten — sie brauchen keinen Mock.

## Follow-up

`chunksFromHandle` erhielt einen `from`-Parameter als die einzige Nahtstelle,
die das Byte-Cursor-Text-Paging brauchte. Der Follow-up nutzt ihn nun, um von
einem Nicht-Null-Byte-Offset fortzusetzen.
