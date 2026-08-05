# Host-Tool-Invocation-Guard

## Status

Draft-Design für Issue [#8102](https://github.com/QwenLM/qwen-code/issues/8102)
und PR [#8032](https://github.com/QwenLM/qwen-code/pull/8032).

## Problem

Ein In-Prozess-Embedding-Host kann einen vom Modell vorgeschlagenen Tool-Call
über bestehende Berechtigungen und Hooks bewerten, aber diese Checks können
laufen, bevor Qwen Code den kanonischen Tool-Namen aufgelöst oder die finalen
Aufrufparameter gebaut hat. Ein Host, der Organisations-Policy durchsetzt,
kann daher nicht beweisen, dass er denselben Aufruf bewertet hat, der
`invocation.execute()` erreicht hat.

Das fehlende Primitiv ist eine finale Ausführungsgrenzen-Entscheidung über den
effektiven Tool-Call. Produkt-spezifischer Task-Zustand, Genehmigungs-
Workflows, Policy-Speicherung und Audit-Transport gehören nicht in Qwen Code.

## Ziele

- Einen In-Prozess-Host eine Allow/Deny-Funktion über `ConfigParameters`
  bereitstellen lassen.
- Den kanonischen Tool-Namen und die geklonten finalen Aufrufparameter
  unmittelbar vor der Ausführung bewerten.
- Den Core-Scheduler, die ACP-Session-Runtime und die spekulativen
  Ausführungspfade abdecken.
- Fail-closed, wenn ein konfigurierter Guard ablehnt, wirft, eine fehlerhafte
  Entscheidung zurückgibt oder geklonte Argumente nicht empfangen kann.
- Den bestehenden Ausführungspfad bewahren, wenn kein Guard konfiguriert ist.
- Ausführung verhindern, wenn der Abbruch vor oder während des Wartens auf den
  Guard erfolgt.

## Non-Goals

- Kein CLI-Flag, kein Settings-Key, keine Umgebungsvariable, keine
  Daemon-Route, kein Netzwerk-Client und kein externer Policy-Transport.
- Kein Task-, Plan-, Grant-, Business-Autorisierungs- oder Audit-Schema.
- Keine Änderung der Berechtigungs-, Hook-, Sandbox- oder
  Genehmigungsmodus-Semantik.
- Keine Behauptung, dass Modell-Planung oder Tool-Implementierungen
  deterministisch werden.
- Kein Ergebnis-Callback und kein paralleles Tool-Ergebnis-Protokoll.
- Keine Abfangen eines SDK-Consumers, der manuell `ToolInvocation.execute()`
  oder `Tool.buildAndExecute()` außerhalb einer Config-eigenen Runtime aufruft.

## Vertrag

Der Host liefert einen `ToolInvocationGuard` in `ConfigParameters`. Der Guard
erhält:

- die von der Runtime akzeptierte Tool-Call-Korrelations-Id;
- den kanonischen Tool-Namen;
- einen Structured Clone der finalen Aufrufparameter; und
- das Abbruch-Signal des Aufrufs.

Die Entscheidung ist entweder `{ allowed: true }` oder
`{ allowed: false, reason? }`. Ein fehlender oder leerer Ablehnungsgrund
nutzt eine stabile generische Meldung. Exceptions, fehlerhafte Entscheidungen
und Clone-Fehler nutzen eine separate stabile Fehlermeldung und lehnen die
Ausführung ab. Ein angegebener Ablehnungsgrund ist für den Nutzer sichtbar und
kann in bestehende Tool-Ergebnis- und Telemetrie-Flächen gelangen, daher darf
er keine Secrets oder rohe Provider-Fehler enthalten.

Die geklonten Argumente verhindern, dass ein Guard den Aufruf mutiert, den
Qwen Code ausführen wird. Der Vertrag macht beliebige Tool-Argumente nicht
geheim; ein Embedding-Host muss sie als sensible Anwendungsdaten behandeln.

Die Tool-Call-Id kann aus einer Modell-Response stammen. Sie ist nützlich, um
die Guard-Entscheidung mit bestehenden Lifecycle-Events zu korrelieren, aber
sie ist kein authentifiziertes Subjekt und kein eigenständiger
Idempotenz-Key. Ein verwalteter Host, der starke Identität braucht, muss sie an
Host-eigene Session- und Prompt-Identität binden.

## Ausführungsplatzierung

Der Core-Scheduler bewertet den Guard nach Tool-Konstruktion,
Berechtigungsbehandlung, Pfad-Normalisierung und `PreToolUse`, aber bevor der
Aufruf zu `executing` wechselt und vor `invocation.execute()`.

Die ACP-Session bewertet denselben Vertrag nach Tool-Konstruktion,
Berechtigungsbehandlung und `PreToolUse`, aber vor ihrem direkten
`invocation.execute()`-Pfad.

Die experimentelle Speculation-Engine führt Aufrufe ebenfalls direkt aus,
statt den Core-Scheduler zu nutzen. Sie bewertet denselben Guard nach dem
Bauen des Aufrufs und wandelt eine Ablehnung oder einen Abbruch in eine
Spekulationsgrenze mit null Executor-Aufrufen um. Ein zukünftiger verwalteter
externer Provider-Mode muss das spekulative Apply deaktivieren, weil das
Kopieren eines Overlays in das echte Dateisystem eine separate
Effekt-Grenze außerhalb von `invocation.execute()` ist.

Alle drei Pfade nutzen die gebauten Aufrufparameter statt der vom Modell
gelieferten Draft-Argumente. Im Core- und ACP-Pfad erzeugt eine Ablehnung null
Executor-Aufrufe und ein strukturiertes `execution_denied`-Tool-Ergebnis.

Jede zukünftige Config-eigene Runtime, die eine `ToolInvocation` direkt
ausführt, muss denselben Guard bewerten oder über einen bereits geguardeten
Scheduler laufen. Das ist eine Code-Review-Invariante, keine Behauptung, dass
beliebige externe Aufrufer abgefangen werden können.

Zwei Agent-Dispatch-Aufrufstellen — der `/fork`-Slash-Befehl und der
ACP-Agent-Fork-Handler — bauen eine Agent-Tool-Aufruf direkt und führen sie
aus, ohne den Guard zu konsultieren. Der gespawnte Subagent teilt die `Config`
des Aufrufers, daher ist jedes Tool, das der Subagent selbst aufruft,
geguarded; nur der Dispatch-Aufruf selbst ist ungeguardet. Eine zukünftige
Änderung darf den Guard auf diese Stellen erweitern.

## Default-off-Kompatibilität

Qwen Code setzt `toolInvocationGuard` weder im CLI- noch im Daemon-Bootstrap.
Das Feld ist nur eine In-Prozess-Embedding-API.

Jeder Ausführungspfad liest den optionalen Callback und betritt den
asynchronen Evaluator nur, wenn der Callback existiert. Wenn er fehlt, führt
Qwen Code keine Guard-Promise-Allokation, keinen Argument-Clone, keinen
Provider-Aufruf, keine Capability-Bewerbung und keinen zusätzlichen
asynchronen Yield aus. Bestehende CLI- und Daemon-Deployments behalten daher
ihren vorherigen Ausführungspfad.

Der bewusst fehlende Produktions-Setter im Repository bedeutet, dass diese
Änderung vor dem Merge Maintainer-Zustimmung zur öffentlichen
Embedding-Nahtstelle erfordert. Eine zukünftige externer-Provider-Änderung
muss ein separater PR bleiben und kann nicht als Teil der Genehmigung dieses
PRs vorausgesetzt werden.

## Abbruch- und Fehlersemantik

Der Evaluator prüft den Abbruch sowohl vor dem Aufruf des Guards als auch nach
dem Settle seines Promises. Jeder Ausführungspfad prüft sein aktives Signal
ebenfalls unmittelbar nach dem Await und vor jedem Executor-Aufruf.

- Abbruch vor der Bewertung: Guard und Executor nicht aufrufen;
- Abbruch während des Wartens auf einen Guard: Abbruch aufzeichnen und den
  Executor nicht aufrufen;
- explizite Ablehnung: `execution_denied` aufzeichnen und den Executor nicht
  aufrufen;
- Guard-Exception, fehlerhafte Response oder Clone-Fehler: fail-closed und den
  Executor nicht aufrufen.

Es gibt keinen automatischen Retry. Der Guard-Callback besitzt eine
Provider-spezifische Retry-Policy, aber ein Embedding-Host darf über diese API
keinen mehrdeutigen Seiteneffekt erneut versuchen oder ausführen.

## Belege

Die Unit- und Integrationstests decken ab:

- konfigurierte Allow- und Deny-Entscheidungen;
- Default-Ablehnungsgrund;
- Guard-Exception, fehlerhafte Response und Clone-Fehler;
- Argument-Mutations-Isolation;
- Abbruch vor und während der Guard-Bewertung;
- finale normalisierte Argumente im Core- und ACP-Pfad;
- spekulative Ausführung stoppt an einer Grenze bei Ablehnung;
- null Executor-Aufrufe bei Ablehnung und Abbruch;
- `execution_denied`-Parität zwischen den Core- und
  ACP-Tool-Ergebnis-Datensätzen; und
- bestehende unkonfigurierte Ausführung über die umgebenden Scheduler- und
  ACP-Suiten.

Für diesen PR ist kein E2E-Plan erforderlich, weil er kein CLI-, Settings-,
Daemon-Routen- oder anderes vom Nutzer aktivierbares Verhalten hinzufügt.
Plattformübergreifende CI bleibt vor dem Merge erforderlich.

## Follow-up-Grenze

Ein zukünftiger externer Policy-Provider darf den Kontext um eine
vertrauenswürdige Runtime-eigene Session- und Prompt-Identität erweitern und
den In-Prozess-Callback über die `qwen serve`-zu-ACP-Kind-Grenze anpassen.
Dieses Follow-up muss Default-off sein, unabhängig reviewed werden und
beweisen, dass eine unkonfigurierte CLI und ein unkonfigurierter Daemon keinen
Provider initialisieren oder ihre Kindprozess-Umgebung ändern.

Die Ergebnisbeobachtung sollte bestehende strukturierte
Tool-Lifecycle-Events wiederverwenden, sofern nicht ein separates Issue eine
konkrete Korrelationslücke aufzeigt. Produkt-spezifische Orchestrierung und
Policy bleiben außerhalb von Qwen Code.
