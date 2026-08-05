# Lazy `@google/genai` loading

- **Issue**: #7264 Kandidat 3
- **Scope**: ACP-Kaltstart-Import-Closure
- **Status**: implementiert und validiert

## Problem

Die gebündelte ACP-Runtime erreicht den `@google/genai`-Node-Einstieg derzeit
über neun eager Runtime-Import-Stellen. Das SDK steuert 755.788 Bytes zu einem
geteilten 1.196.331-Byte-Chunk mit 77 Inputs bei, einschließlich
`google-auth-library` und `gaxios`. Weil der ACP-Bootstrap den vollständigen
CLI-Einstieg importiert, bevor er `initialize` beantwortet, wird dieser Chunk
geparst und evaluiert, obwohl der Bootstrap die Gemini-Client-Initialisierung
und die MCP-Entdeckung bewusst überspringt.

Die eager Imports zu `import()` zu ändern, reicht nicht aus. Die
ACP-Session-Erstellung ruft `ensureAuthenticated()` und
`createContentGenerator()` auf, bevor sie die Session-Antwort zurückgibt. Die
bestehenden Provider-Imports und die `LoggingContentGenerator`-Konstruktion
würden das SDK daher während `newSession` laden und Arbeit aus
`channel.initialize` verschieben, ohne Prozess-zu-erster-Session zu
verbessern.

## Design

### Leichtgewichtige synchrone Kompatibilitätswerte

Die Core-Orchestrierung verwendet außerhalb von Provider-Implementierungen nur
eine kleine synchrone Teilmenge des SDK: `FinishReason`,
`FunctionCallingConfigMode`, `createUserContent` und `createModelContent`. Ein
paketlokales Kompatibilitätsmodul stellt diese Werte bereit, während SDK-Typen
als Type-only-Imports erhalten bleiben. Seine Inhaltskonvertierung spiegelt
die Validierung und Ausgabeform des SDK, sodass bestehende Aufrufer dasselbe
Verhalten behalten, ohne das SDK zu evaluieren.

Provider-Implementierungen verwenden weiterhin die offiziellen SDK-Klassen.
Insbesondere kopiert oder ersetzt diese Änderung `GenerateContentResponse`
nicht.

### Single-Flight-Lazy-Content-Generator

`createContentGenerator()` validiert weiterhin die Konfiguration, preladet die
Runtime-Fetch-Implementierung und führt die
Qwen-OAuth-Credential-Beschaffung an seinem aktuellen Punkt im
Session-Lebenszyklus durch. Es liefert einen privaten Lazy-`ContentGenerator`
zurück, dessen memoisierter Loader den ausgewählten Provider bei der ersten
asynchronen Content-Generator-Operation konstruiert und in
`LoggingContentGenerator` verpackt.

Alle vier asynchronen Operationen teilen sich dasselbe Loader-Promise:

- `generateContent`
- `generateContentStream`
- `countTokens`
- `embedContent`

Parallele erste Aufrufe importieren und konstruieren den Provider daher
einmal. `useSummarizedThinking()` bleibt synchron und wird aus dem bekannten
Verhalten des ausgewählten Providers gespeist: true für Gemini/Vertex und
false für OpenAI, Qwen OAuth und Anthropic.

Die Qwen-OAuth-Credential-Beschaffung bleibt eager innerhalb von
`createContentGenerator()`. Ein abgelaufenes oder fehlendes gecachtes
Credential lehnt daher weiterhin die ACP-Session-Erstellung ab, statt eine
scheinbar nutzbare Session zu erzeugen, die erst bei ihrem ersten Prompt
fehlschlägt.

Dynamische Importfehler behalten die bestehende
Hintergrund-Update-Neustart-Meldung, obwohl Provider-Chunk-Fehler nun bei der
ersten Generator-Verwendung sichtbar werden. Eine Auth-Aktualisierung ersetzt
den Lazy-Generator, was auch die Retry-Grenze nach einem fehlgeschlagenen
Loader bereitstellt.

### MCP-Erstverwendung

`mcpToTool` wird dynamisch innerhalb von `discoverTools()` geladen. Dies
bewahrt die Paginierung, Doppelte-Namen-Behandlung, Callable-Tool-Fallback und
den MCP-Usage-Header-Seiteneffekt des SDK. Konfigurationen mit MCP-Servern
können `@google/genai` daher während der Hintergrund-MCP-Entdeckung vor dem
ersten Modell-Prompt evaluieren. Dies ist eine absichtliche
Erstverwendungs-Ausnahme: `mcpToTool` zu ersetzen würde experimentelles
SDK-Verhalten duplizieren und die Regressionsfläche erheblich erweitern.

Die garantierte Grenze ist, dass `@google/genai` im statischen
ACP-Bootstrap-Closure nicht vorhanden ist. Ohne konfigurierten MCP-Server
bleibt es bis zur Session-Erstellung ungeladen und lädt bei der ersten
`ContentGenerator`-Operation.

### Bundle-Guard

Der Serve-Fast-Path-Metafile-Guard fügt `@google/genai` zur
ACP-Verbotene-Pakete-Liste hinzu. Dynamische Chunks bleiben erlaubt. Dadurch
lässt ein zukünftiger statischer Re-Import CI mit seinem Ausgabe-Importpfad
fehlschlagen.

## Audit der nachgelagerten Consumer

Es gibt drei direkte Produktions-Erstellungspfade. `Config.refreshAuth()`
besitzt den Haupt-Session-Generator. `BaseLlmClient` besitzt gecachte
Pro-Modell-Generatoren für geroutete Side-Requests.
`createRuntimeContentGeneratorView()` besitzt dedizierte Generatoren, die vom
In-Prozess-Agent-Backend, dem Subagent-Manager und geforkten Agenten verwendet
werden. Jeder Pfad speichert und konsumiert nur das
`ContentGenerator`-Interface, sodass der private Lazy-Wrapper seine Ownership-
und Routing-Grenze bewahrt.

Die Interface-Consumer rufen nur `generateContent`, `generateContentStream`,
`countTokens`, `embedContent` und `useSummarizedThinking` auf. Der
Haupt-Chat-Pfad, Prompt-Hooks, Memory-/Goal-/Side-Queries, Vision-Routing,
Subagents und Session-Resume inspizieren nicht den konkreten Provider oder
entpacken `LoggingContentGenerator`; eine Repository-weite Suche fand keinen
Produktions-`instanceof`- oder `getWrapped()`-Aufrufer. Die
MCP-Tool-Entdeckung ist von der Generator-Ownership getrennt und behält den
SDK-bereitgestellten `mcpToTool`-Adapter hinter seinem eigenen
Erstverwendungs-Import.

## Abgelehnte Alternativen

- **Nur die aktuellen Imports dynamisch machen**: Verbessert
  `channel.initialize`, lädt aber dasselbe SDK während `newSession`,
  adressiert also nicht Prozess-zu-erster-Session.
- **`GeminiClient.initialize()` selbst verzögern**: Ändert Chat-Konstruktion,
  Resume, Tool-Registrierung, Session-Bereitschaft und Timing von
  Authentifizierungsfehlern.
- **`GenerateContentResponse` kopieren**: Riskiert Prototyp- und Getter-Drift
  über SDK-Upgrades und ändert die Runtime-Objekte, die von OpenAI- und
  Anthropic-Adaptern zurückgegeben werden.
- **`mcpToTool` lokal ersetzen**: Dupliziert einen experimentellen SDK-Adapter
  und lässt dessen prozessglobales MCP-Telemetrie-Verhalten weg oder muss es
  reproduzieren.
- **Undokumentierte SDK-Interna importieren**: `@google/genai` stellt keinen
  unterstützten leichtgewichtigen Subpfad für diese Helfer und Klassen bereit.

## Kompatibilität und Fehlerpfade

- Die Provider-Validierung bleibt in `createContentGenerator()`.
- Qwen-OAuth-Credential-Checks bleiben vor der ACP-Session-Registrierung.
- Der erste Loader ist Single-Flight über parallele Prompts und Side-Queries
  hinweg.
- Ein bereits abgebrochener erster Request kann die Modul-Evaluierung dennoch
  abschließen, da ESM-Imports nicht abbrechbar sind; der Provider erhält
  danach das ursprüngliche abgebrochene Signal.
- Die Modell-Konfiguration wird wie heute per Referenz erfasst, sodass
  Modelländerungen desselben Providers, die vor der Erstverwendung vorgenommen
  werden, vom Provider-Konstruktor beobachtet werden.
- Auth-/Provider-Änderungen bauen den Lazy-Generator über den bestehenden
  `refreshAuth()`-Pfad neu.
- Ein fehlender dynamischer Chunk nach einem Hintergrund-CLI-Update erzeugt
  die bestehende Neustart-Anleitung.

## Verifikation

Unit-Tests decken Helfer-Parität, verzögerte Konstruktion,
Qwen-Credential-Timing, Single-Flight-Verhalten, Provider-spezifische
Summarized-Thinking-Werte, verzögerte Modulfehler und
MCP-Entdeckungsverhalten ab. Das gebündelte Metafile muss zeigen, dass
`@google/genai` im statischen ACP-Closure fehlt, während es in dynamischen
Provider-/MCP-Chunks erhalten bleibt.

Der 2C4G-Akzeptanzlauf folgt #7264: 30 gepaarte serielle Kaltstarts,
`channel.initialize` P50/P95, Prozess-zu-erster-Session, vorgeheiztes/warmes
Verhalten, parallele erste Sessions, Telemetrie an/aus und Peak-RSS. Weil
diese Änderung Arbeit nach hinten verschiebt, zeichnet sie zusätzlich
Session-Antwort-zu-erstem-Token und Prozess-zu-erstem-Token für einen
sofortigen ersten Prompt auf. Ein Start-Gewinn, der vollständig als
First-Token-Regression zurückgezahlt wird, wird gemeldet, statt als
erfolgreiche Optimierung behandelt zu werden.

## Ergebnisse

Die Kontrolle war das damalige `origin/main` bei
`dd2552018a72a2b5795977211f06435711e5f99a`, das bereits die
Lazy-Telemetrie-/Protokoll-Arbeit und die Lazy-undici-Änderung enthält. Der
Kandidat war das exakte finale Arbeitsverzeichnis-Bundle. Beide wurden aus
demselben Lockfile gebaut und auf dem bereitgestellten Alibaba-Cloud-Host mit
2 vCPUs, ungefähr 3,5 GiB RAM, ohne Swap und mit gebündeltem Node.js 22.23.1
getestet.

Der statische ACP-Closure sank von 14.279.497 Bytes auf 13.280.177 Bytes
(999.320 Bytes). Der Kontroll-Closure enthielt 755.788 Bytes, die direkt
`@google/genai` zugerechnet werden; der Kandidat enthielt null. Das SDK bleibt
in dynamischen Chunks für die Provider- und MCP-Erstverwendung vorhanden.

Mit aktivierter Telemetrie zu einem Outfile erzeugten 30 alternierende
gepaarte Kaltstarts:

| Metrik                   | Kontrolle P50 / P95  | Kandidat P50 / P95  | P50-Delta |
| ------------------------ | -------------------- | ------------------- | --------- |
| `channel.initialize`     | 984,9 / 1010,6 ms    | 954,8 / 972,5 ms    | -30,1 ms  |
| kaltes `POST /session`   | 1293,1 / 1316,0 ms   | 1252,4 / 1291,3 ms  | -40,7 ms  |
| Prozess zu erster Session | 1924,6 / 1951,1 ms  | 1858,7 / 1901,0 ms  | -65,9 ms  |
| `phase.gemini_import`    | 536,3 / 550,2 ms     | 517,2 / 526,5 ms    | -19,1 ms  |
| Peak-RSS                 | 414,6 / 427,1 MiB    | 406,5 / 420,5 MiB   | -8,0 MiB  |

Nach drei Sekunden Vorheizen blieb `channel.initialize` bei P50 32,7 ms
schneller, während `POST /session` sich um 4,8 ms verbesserte. Parallele erste
Sessions, deaktivierte Telemetrie und Legacy-Einzel-Session-Modus waren alle
erfolgreich; jeder Prozessbaum wurde bereinigt und der Modus mit deaktivierter
Telemetrie emittierte null Datensätze.

Ein zusätzlicher Lauf mit Telemetrie aus gab einen sofortigen echten
OpenAI-kompatiblen Prompt in 30 alternierenden Paaren ab. Alle 60 Prompts
schlossen ab. Prozess-zu-Session verbesserte sich bei P50 um 53,4 ms und der
Kandidat war in 28 von 30 Paaren schneller. Prompt-zu-erstem-Token war unter
Modell-Netzwerk-Varianz effektiv neutral: Der Kandidat-P50 war 24,2 ms
schneller und der Kandidat war in 16 von 30 Paaren schneller; der P95 war
297,6 ms langsamer, weil beide Varianten unzusammenhängende mehrsekündige
Netzwerk-Ausreißer hatten. Der Ende-zu-Ende-P50 von Prozess-zu-erstem-Token
verbesserte sich um 57,6 ms, wobei der Kandidat in 19 von 30 Paaren schneller
war. Dies schließt eine nachgewiesene Median-Kostenverschiebung aus, aber der
First-Token-Tail ist nicht ausreichend attributierbar, um einen zusätzlichen
Modellaufruf-Performance-Gewinn zu behaupten.
