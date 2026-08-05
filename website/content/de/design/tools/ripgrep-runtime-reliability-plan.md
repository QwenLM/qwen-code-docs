# Ripgrep-Laufzeit-Zuverlässigkeit — Umsetzungsplan

## 1. Hintergrund und Entscheidung

Wenn ripgrep fehlt, stellt Qwen Code bereits die wichtigsten
Fallback-Ketten bereit:

```text
integriertes ripgrep -> System-ripgrep -> GrepTool
                                           -> git grep
                                           -> System-grep
                                           -> JavaScript-Dateitraversierung
```

Die verbleibende Arbeit mit hohem ROI ist, die Integrität der
Laufzeitergebnisse sicherzustellen, statt eine weitere Binärabhängigkeit
oder eine weitere generische Fallback-Schicht einzuführen. Dieser Plan
setzt die folgenden vier zusammengehörigen Verbesserungen als eine klar
abgegrenzte Änderung um:

1. Wenn bestätigt ist, dass ripgrep wegen Thread-Erstellung einen
   `EAGAIN`-Fehler hat, einmal im Single-Thread-Modus erneut versuchen.
2. Exit-Code 1 nur dann als "keine Treffer" interpretieren, wenn sowohl
   stdout als auch stderr leer sind.
3. Zwischen einer nicht vollständig ausgeführten Suche und normaler
   Ausgabe-Trunkierung unterscheiden; eine nicht vollständig ausgeführte
   Suche niemals als "keine Treffer gefunden" melden.
4. Privatsphärefreie Laufzeit-Recovery-Telemetrie aufzeichnen, um den
   tatsächlichen Nutzen zu messen.

### Nicht im Scope

- `@vscode/ripgrep` wird nicht eingeführt; Qwen Code liefert bereits
  plattformspezifische Binärdateien mit dem Paket aus.
- Die aktuelle Auswahlreihenfolge "integrierte Version zuerst,
  System-Version danach" wird nicht geändert.
- Die Thread-Anzahl von ripgrep wird nicht dauerhaft reduziert.
- Es wird nicht nach jedem Laufzeitfehler automatisch zu `GrepTool`
  gewechselt. Berechtigungs-, Argument- und Dateisystemfehler müssen
  sichtbar bleiben und dürfen nicht hinter einer semantisch anderen und
  langsameren Suche versteckt werden.
- `EAGAIN` in der Startphase des Node.js-Subprozesses wird nicht retried.
  Ein Prozess, der noch nicht erfolgreich gestartet wurde, kann nicht vom
  `--threads 1`-Argument von ripgrep profitieren; solche Probleme werden
  weiterhin als explizite `spawn`-Fehler behandelt.

## 2. Zweck der Änderungen und Verhalten vorher/nachher

Diese Änderung soll Suchen nicht "unfehlbar" machen, sondern
sicherstellen, dass Qwen Code die folgenden drei Fakten korrekt
unterscheidet: Es gibt tatsächlich keine Treffer; die Suche ist
fehlgeschlagen und es gibt keine verwertbaren Ergebnisse; die Suche ist
fehlgeschlagen, aber es gibt Teilergebnisse. Nur wenn das Modell die
korrekten Fakten sieht, kann es entscheiden, ob es die Suche eingrenzt,
ein anderes Tool verwendet oder die vorhandenen Teilergebnisse
weiterverwendet.

### 2.1 Single-Thread-Retry bei EAGAIN

**Zweck der Änderung:** In ressourcenbeschränkten Container- oder
CI-Umgebungen kann der ripgrep-Prozess erfolgreich gestartet sein, aber
die benötigten Worker-Threads nicht erstellen können. Suchlogik und
Argumente sind in diesem Fall selbst in Ordnung; mit reduzierter
Parallelität besteht normalerweise weiterhin die Chance, die Suche
abzuschließen. Der Retry zielt nur auf bestätigt fehlgeschlagene
Thread-Erstellung und vermeidet, Argumentfehler, Berechtigungsfehler oder
Subprozess-Startfehler fälschlich als behebbares Problem zu behandeln.

**Vorher:** `RipGrepTool` übergibt fest `--threads 4`. `runRipgrep()`
versucht bei EAGAIN keinen Retry: Wenn der Fehler nicht zuerst vom
Exit-Code-1-Zweig als "keine Treffer" interpretiert wird und es kein
stdout gibt, gibt das Tool einen expliziten grep-Fehler an das Modell
zurück; wenn bereits stdout entstanden ist, kann die nachfolgende Logik
diese Teilergebnisse weiter konsumieren, aber es wird nicht angegeben,
dass diese Suche wegen EAGAIN vorzeitig beendet wurde.

```text
rg --threads 4
  -> Thread-Erstellung schlägt fehl
  -> kein Retry
  -> Exit-Code 1: wird als "keine Treffer" behandelt
  -> anderer Fehler und kein stdout: Fehler zurückgeben
  -> stdout vorhanden: wird möglicherweise als vollständiges Ergebnis verwendet
```

**Nachher:** Nur wenn stderr bestätigt, dass es sich um eine
ripgrep-interne Thread-Erstellung-EAGAIN handelt und der Request noch
nicht abgebrochen ist, wird `--threads 4` des aktuellen Aufrufs durch
`--threads 1` ersetzt und einmal retried. Nach erfolgreichem Retry wird
das vollständige Ergebnis zurückgegeben; schlägt der Retry weiterhin
fehl, wird ein Fehler oder ein explizit markiertes Teilergebnis
zurückgegeben. Nachfolgende Suchen verwenden weiterhin 4 Threads und
werden nicht wegen eines vorübergehenden Fehlers dauerhaft langsamer.

```text
rg --threads 4
  -> Thread-Erstellung-EAGAIN bestätigt
  -> rg --threads 1, nur ein Retry
     -> Erfolg: vollständiges Ergebnis zurückgeben
     -> Fehlschlag und kein stdout: expliziten Fehler zurückgeben
     -> Fehlschlag aber stdout vorhanden: explizit markiertes Teilergebnis zurückgeben
```

### 2.2 Striktere Keine-Treffer-Entscheidung bei Exit-Code 1

**Zweck der Änderung:** Verhindern, dass Qwen Code Exit-Code 1 mit
Fehlermeldungen oder anomaler Ausgabe pauschal als "dieser Inhalt
existiert nicht im Repository" interpretiert. "Keine Treffer" ist eine
starke Schlussfolgerung, die das weitere Reasoning des Modells
beeinflusst, und darf nur verwendet werden, wenn ripgrep tatsächlich
regulär ausdrückt, dass es keine Treffer gibt.

**Vorher:** Sobald `runRipgrep()` `error.code === 1` sieht, gibt es
sofort leeres stdout zurück und verwirft das stdout und stderr dieses
Aufrufs. Selbst wenn Exit-Code 1 gleichzeitig eine Fehlermeldung trägt,
sieht das Modell am Ende `No matches found`.

```text
Exit-Code 1 + leeres stdout + leeres stderr -> No matches found
Exit-Code 1 + nicht leeres stderr           -> No matches found
Exit-Code 1 + nicht leeres stdout           -> stdout wird verworfen, No matches found
```

**Nachher:** Nur wenn der Exit-Code 1 und stderr leer ist, wird das
reguläre Keine-Treffer-Ergebnis zurückgegeben. Exit-Code 1 mit nicht
leerem stderr wird als Ausführungsfehler behandelt. stdout nimmt nicht an
der Entscheidung teil: Exit-Code 1 von ripgrep kann keine Treffer tragen,
und im `--json`-Modus gibt ripgrep auch bei null Treffern ein
`summary`-Event am Ende von stdout aus.

```text
Exit-Code 1 + leeres stderr   -> No matches found
Exit-Code 1 + nicht leeres stderr -> expliziter Ausführungsfehler
```

### 2.3 Unterscheidung zwischen trunkierten und unvollständig ausgeführten Ergebnissen

**Zweck der Änderung:** Das Modell soll wissen, dass "um die Ausgabelänge
zu kontrollieren, wird nur ein Teil gezeigt" und "die zugrunde liegende
Suche wurde nicht vollständig ausgeführt" zwei völlig verschiedene Dinge
sind. Ersteres kann weiterhin beweisen, dass diese Treffer in der
vollständigen Suche existieren; Letzteres kann nicht beweisen, dass es in
anderen Dateien keine Treffer gibt.

**Vorher:** `runRipgrep()` verwendet `truncated` gleichzeitig für
Timeout, Überschreiten des maximalen Puffers und andere vorzeitige
Beendigungen auf niedriger Ebene; `RipGrepTool` vermischt es zusätzlich
mit Zeilen- und Zeichenlimits in der Anzeige. Wenn ein Fehler auftritt,
aber bereits stdout entstanden ist, wirft das Tool nur einen Fehler, wenn
stdout leer ist; nicht leeres stdout wird weiter geparst. Es kann als
normales Ergebnis erscheinen, als `(truncated)` oder — wenn stdout leer
ist oder keine gültigen Treffer geparst werden — sogar in einen der
beiden `No matches found`-Zweige gelangen. Das Modell kann nicht
zuverlässig entscheiden, ob die Suche wirklich abgeschlossen wurde.

**Nachher:** Die Darstellungsschicht verwendet für aktives Kürzen nur
`truncated`; vorzeitige Beendigung durch Timeout, Überschreiten des
maximalen Puffers oder andere Ausführungsfehler verwendet `incomplete`.
Die Verarbeitungsreihenfolge prüft zuerst die Vollständigkeit der
Ausführung und dann, ob gültige Treffer existieren:

| Ausführungsergebnis nach der Änderung | Ergebnis, das das Modell sieht | Schlussfolgerung, die das Modell ziehen kann |
| ------------------------------------- | ------------------------------ | -------------------------------------------- |
| Vollständig ausgeführt, keine Treffer | `No matches found`             | Kann davon ausgehen, dass es im Suchbereich dieser Suche keine Treffer gibt |
| Vollständig ausgeführt, Anzeigeinhalt über Limit | Ergebnis plus `(truncated)` | Suche ist abgeschlossen, es werden nur nicht alle Trefferzeilen angezeigt |
| Unvollständig ausgeführt, keine gültigen Treffer | Expliziter Suche-nicht-abgeschlossen-Fehler | Kann nicht davon ausgehen, dass es im Repository keine Treffer gibt; Suche anpassen oder andere Methode verwenden |
| Unvollständig ausgeführt, aber gültige Treffer vorhanden | Teil-Ergebnis plus `(incomplete)` und feste Warnung | Kann die zurückgegebenen Treffer verwenden, aber darauf basierend keine anderen Orte ausschließen |
| Anzeige-Kürzung und unvollständige Ausführung gleichzeitig | Zeigt sowohl `(truncated)` als auch `(incomplete)` | Weder werden alle erhaltenen Ergebnisse angezeigt, noch ist die zugrunde liegende Suche abgeschlossen |

### 2.4 Laufzeit-Recovery-Telemetrie

**Zweck der Änderung:** Messen, wie häufig EAGAIN-Retry und
Ergebnisintegritätsschutz in realen Umgebungen auftreten, wie die
Erfolgsrate ist und welche Fehlertypen vorkommen, um datenbasiert zu
entscheiden, ob sich weitere Investition in komplexere
Laufzeit-Fallback-Fähigkeiten lohnt — ohne die Suchinhalte der Nutzer
oder Repository-Informationen zu erfassen.

**Vorher:** Das bestehende `RipgrepFallbackEvent` wird nur gesendet, wenn
die Start-Erkennung fehlschlägt und Qwen Code von `RipGrepTool` zu
`GrepTool` wechselt. EAGAIN, Timeouts, Überschreiten des maximalen
Puffers, anormale Beendigung oder Spawn-Fehler nach dem Start haben keine
dedizierten strukturierten Metriken, daher kann die Frage "ist
Laufzeit-Recovery wirklich nützlich" nicht beantwortet werden.

**Nachher:** Neues, semantisch eigenständiges
`RipgrepRuntimeRecoveryEvent`, das nur bei einem Retry oder einer
endgültig anomalen Ausführung gesendet wird. Das Event zeichnet die
Auswahl zwischen integrierter/System-Binärdatei, ob ein Retry ausgelöst
wurde, ob der Retry erfolgreich war und eine feste Fehlerklassifikation
auf, aber nicht Suchausdruck, Pfade, stdout, stderr, Dateinamen oder rohe
Fehlermeldungen. Normale erfolgreiche Suchen senden kein Event, um
sinnloses Log-Volumen zu vermeiden.

### 2.5 Single-Settlement-Schutz

**Zweck der Änderung:** Sicherstellen, dass die neue Retry-Logik
höchstens einmal ausgeführt wird. Der `execFile`-Callback und das
`error`-Event des Subprozesses können für denselben fehlgeschlagenen
Start nacheinander eintreffen; wenn beide Kanäle jeweils einen Retry
beschließen, könnten zwei Single-Thread-Suchen gestartet werden.

**Vorher:** Beide Kanäle können versuchen, dieselbe Promise zu resolven.
Da eine Promise nur das erste Settlement akzeptiert und es aktuell keine
Retry-Logik gibt, entsteht normalerweise keine für Nutzer sichtbare
doppelte Ausführung, aber die Struktur ist nicht geeignet, direkt einen
Recovery-Zweig hinzuzufügen.

**Nachher:** Der Single-Execution-Helper verwendet einen geteilten
Settlement-Guard und erzeugt genau ein strukturiertes
Ausführungsergebnis. Die äußere Logik muss dieses Ergebnis abwarten,
bevor sie über einen Retry entscheidet, daher startet eine Suche
höchstens einen Recovery-Aufruf.

### 2.6 Gesamte Verhaltensänderung

```text
Vorher
rg ausführen
  -> Code 0: Ergebnis verarbeiten
  -> Code 1: pauschal als "keine Treffer" behandeln
  -> anderer Fehler und kein stdout: Fehler zurückgeben
  -> anderer Fehler aber stdout vorhanden: möglicherweise als vollständiges oder trunkiertes Ergebnis weiterverarbeiten

Nachher
rg ausführen
  -> Code 0: vollständiges Ergebnis verarbeiten
  -> Code 1 + stdout/stderr beide leer: keine Treffer bestätigt
  -> Thread-EAGAIN bestätigt: ein Single-Thread-Retry
  -> endgültiger Fehlschlag und kein stdout: expliziten Fehler zurückgeben
  -> endgültiger Fehlschlag aber stdout vorhanden: verwertbare Treffer behalten und als incomplete markieren
  -> endgültige Anomalie oder Recovery außer Abbruch: strukturierte Telemetrie ohne Suchinhalte senden
```

## 3. Erforderliche Laufzeitsemantik

### 3.1 Single-Execution-Ergebnis

Refaktorisiere `runRipgrep()` in
`packages/core/src/utils/ripgrepUtils.ts` und extrahiere einen internen
Single-Execution-Helper. Dieser Helper muss das bestehende 20-MB-Puffer,
die plattformabhängigen Timeouts, das `AbortSignal`, partielles stdout
sowie das Entfernen der möglicherweise unvollständigen letzten Zeile
beibehalten.

Der Helper muss sicherstellen, dass genau einmal settled wird. `execFile`
kann einen fehlgeschlagenen Start sowohl über den Callback als auch über
das `error`-Event des Subprozesses melden, daher müssen Callback und
Event-Handling denselben Settlement-Guard teilen. Ein Retry darf erst
beschlossen werden, nachdem der erste Helper-Aufruf zurückgekehrt ist;
keiner der Completion-Kanäle darf direkt einen Retry auslösen.

Klassifiziere Fehler mit festen Werten, die keine sensiblen Informationen
enthalten:

```typescript
type RipgrepFailureKind =
  | 'eagain'
  | 'timeout'
  | 'max_buffer'
  | 'exit'
  | 'spawn';
```

Abbruch gehört nicht zur Laufzeitfehler-Telemetrie und darf keinen Retry
auslösen.

### 3.2 Entscheidung für keine Treffer

Nur wenn die folgenden beiden Bedingungen gleichzeitig erfüllt sind, wird
ein Aufruf als erfolgreich abgeschlossen ohne Treffer interpretiert:

```text
Exit-Code === 1
stderr.trim() === ''
```

Die Exit-Code-Konvention von ripgrep: 0 = Treffer gefunden, 1 = keine
Treffer und kein Fehler, 2 = Fehler aufgetreten. Exit-Code 1 kann keine
Treffer tragen, daher muss stdout nicht geprüft werden. Im `--json`-Modus
gibt ripgrep auch bei null Treffern am Ende von stdout ein
`summary`-Event aus, daher kann ein leeres stdout kein Kriterium sein.

Wenn der Exit-Code 1 ist, aber stderr nicht leer ist, handelt es sich um
einen Ausführungsfehler.

### 3.3 EAGAIN-Recovery

Nur wenn alle folgenden Bedingungen gleichzeitig erfüllt sind, wird
genau einmal retried:

- Es ist die erste Ausführung, nicht ein Retry.
- Der Request wurde noch nicht abgebrochen.
- stderr bestätigt ein ripgrep-internes Thread-Erstellungsversagen: Match
  auf den kurzen Marker `os error 11`, oder es müssen
  Thread-Erstellungs-Kontext und die vollständige
  Ressource-nicht-verfügbar-Fehlermeldung gleichzeitig vorhanden sein. Es
  darf nicht nur auf den generischen Ressource-nicht-verfügbar-Text
  gematcht werden.
- Die bestehende Argumentliste enthält das aktuelle
  `--threads 4`-Argumentpaar.

Ersetze beim Retry den Thread-Anzahl-Wert durch `1`. Füge kein Delay
hinzu, unterstütze keine anderen Argument-Schreibweisen ohne realen
Bedarf und persistiere den Single-Thread-Modus nicht für nachfolgende
Suchen. Nach einem erfolgreichen Retry wird das vollständige
Erfolgsergebnis zurückgegeben, ohne den Fehler- oder
Unvollständigkeitszustand des ersten Versuchs zu behalten.

### 3.4 Vollständig, trunkiert und unvollständig ausgeführt

Unterscheide klar die folgenden drei Zustände:

- **Vollständig (Complete):** ripgrep wurde regulär ausgeführt und
  abgeschlossen.
- **Trunkiert (Truncated):** Qwen Code hat eine ursprünglich vollständige
  Ausgabe für die Anzeige aktiv nach Zeilen- oder Zeichenanzahl begrenzt.
- **Unvollständig ausgeführt (Incomplete):** ripgrep wurde nach der
  Erzeugung von stdout wegen eines Ausführungsfehlers beendet,
  einschließlich Beendigung durch Timeout oder Überschreiten des maximalen
  Puffers; die vorhandenen Treffer sind nur ein Teil der
  Repository-Suchergebnisse.

Erweitere `RipgrepRunResult` um strukturierte Metadaten statt rohem
stderr oder Fehlertext:

```typescript
interface RipgrepRecoveryMetadata {
  selectionMode: 'builtin' | 'system';
  retryTriggered: boolean;
  retrySucceeded?: boolean;
  failureKind?: RipgrepFailureKind;
}

interface RipgrepRunResult {
  stdout: string;
  incomplete: boolean;
  error?: Error;
  recovery: RipgrepRecoveryMetadata;
}
```

Die konkrete Struktur kann bei der Implementierung weiter vereinfacht
werden, aber das Ergebnis des Utility darf das aktuelle `truncated`-Feld
nicht weiter für Timeout- oder Max-Puffer-Fehler verwenden. Die
Trunkierung der Darstellungsschicht berechnet `RipGrepTool`; das Utility
meldet den Zustand der unvollständigen Ausführung und das
Retry-Ergebnis. Die Recovery-Metadaten dürfen keinen Suchausdruck, keine
Suchpfade, kein stdout, kein stderr und keine rohen Fehlermeldungen
enthalten.

In `packages/core/src/tools/ripGrep.ts` muss zuerst geprüft werden, ob
die Ausführung vollständig ist, bevor die beiden bestehenden
`No matches found`-Zweige betreten werden dürfen:

| Ausführungsergebnis | Tool-Verhalten |
| ------------------- | -------------- |
| Fehler und kein stdout | Expliziten grep-Ausführungsfehler zurückgeben |
| Fehler und stdout vorhanden, aber keine gültigen Treffer geparst | Expliziten Fehler für unvollständige Ausführung zurückgeben; niemals keine Treffer zurückgeben |
| Fehler und mindestens ein gültiger Treffer geparst | Teil-Treffer zurückgeben und mit einem festen Hinweis erklären, dass die Suche nicht abgeschlossen ist |
| Vollständige Ausführung, aber keine gültigen Treffer | Bestehendes Keine-Treffer-Ergebnis zurückgeben |

Teil-Ergebnisse verwenden in `returnDisplay` `(incomplete)` und geben
einen festen Hinweis an das LLM aus, zum Beispiel:
`Die Suche wurde nicht vollständig ausgeführt: Die obigen Ergebnisse enthalten möglicherweise nicht alle Treffer.`
Das normale Limit für die Ergebnisanzahl verwendet weiterhin
`(truncated)`. Beide Labels können gleichzeitig existieren, dürfen
einander aber nicht ersetzen. Bei einem Ausführungsfehler darf der
aktuelle irreführende `[0 lines truncated]`-Hinweis nicht weiter erzeugt
werden.

## 4. Laufzeit-Telemetrie

Neues eigenständiges `RipgrepRuntimeRecoveryEvent`;
`RipgrepFallbackEvent` nicht wiederverwenden — Letzteres bezeichnet
speziell, dass das in der Startphase registrierte Tool von `RipGrepTool`
zu `GrepTool` gewechselt hat.

Sende das neue Event nur, wenn ein Retry auftritt oder die endgültige
Ausführung anomal ist. Erforderliche Felder:

```typescript
selection_mode: 'builtin' | 'system';
retry_triggered: boolean;
retry_succeeded?: boolean;
failure_kind: 'eagain' | 'timeout' | 'max_buffer' | 'exit' | 'spawn';
```

Es dürfen kein Suchausdruck, keine Pfade, kein stdout, kein stderr, keine
rohen Fehlermeldungen und keine Dateinamen aufgezeichnet werden. Normale
erfolgreiche Suchen ohne Recovery senden das neue Event nicht.

`ripgrepUtils.ts` bleibt weiter frei von Abhängigkeiten zu `Config` und
Telemetrie. Es gibt nur die Recovery-Metadaten zurück; das `Config`
haltende `RipGrepTool.performRipgrepSearch()` sendet das Event, bevor es
Teil-Ergebnisse zurückgibt oder den endgültigen Fehler wirft.

Binde das Event über die bestehende Telemetrie-Schicht ein:

- `packages/core/src/telemetry/types.ts`
- `packages/core/src/telemetry/constants.ts`
- `packages/core/src/telemetry/loggers.ts`
- `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`
- die öffentlichen Telemetrie-Exporte in
  `packages/core/src/telemetry/index.ts`

Decke die bestehenden Qwen-Logger- und OpenTelemetry-Log-Pfade ab. Eine
zusätzliche eigenständige Clearcut-Integration ist nicht nötig.

## 5. Umsetzungsreihenfolge

1. Füge den Single-Execution-Helper hinzu sowie ein fokussiertes
   Unit-Test-Gerüst, das `execFile` mockt, einschließlich
   Subprozess-`EventEmitter` und Single-Settlement-Verhalten.
2. Straffe die Exit-Code-1-Entscheidung und füge Fehlerklassifikation
   hinzu; das Retry-Verhalten wird hier noch nicht geändert.
3. Füge den einzelnen Retry für bestätigtes Thread-EAGAIN hinzu, der
   `--threads 4` durch `--threads 1` ersetzt.
4. Gib das strukturierte `incomplete` und die Recovery-Metadaten von
   `runRipgrep()` an `RipGrepTool` weiter.
5. Aktualisiere die beiden Keine-Treffer-Entscheidungsstellen, um die
   Hinweise für unvollständige Ausführung und Trunkierung jeweils zu
   rendern.
6. Füge auf Tool-Ebene das eigenständige
   Laufzeit-Recovery-Telemetrie-Event hinzu und binde es ein.
7. Führe die fokussierte Verifikation aus, danach den vom Repository
   verlangten Build, Typecheck und Selbst-Review-Prozess.

Diese Schritte unabhängig voneinander zu halten hilft, Regressionen
schnell zu lokalisieren, und vermeidet, dass die Telemetrie-Arbeit die
zentralen Ergebnissemantik-Änderungen überdeckt.

## 6. Testplan

### `packages/core/src/utils/ripgrepUtils.test.ts`

Mocke `node:child_process` mit Vitest-Hoisted-Mocks und decke Folgendes
ab:

- Exit-Code 1 mit sowohl leerem stdout als auch stderr ergibt das
  vollständige Keine-Treffer-Ergebnis.
- Exit-Code 1 mit nicht leerem stderr ergibt einen `exit`-Fehler.
- Exit-Code 1 mit nicht leerem stdout behält das stdout und markiert es
  als unvollständig ausgeführt.
- Nach bestätigtem Thread-EAGAIN genau ein Retry, der mit `--threads 1`
  erfolgreich abschließt.
- Nach bestätigtem Thread-EAGAIN genau ein Retry, aber der Retry schlägt
  weiterhin fehl.
- Der Retry ersetzt nur die bestehende Thread-Anzahl und ändert das vom
  Caller übergebene Argument-Array nicht.
- `AbortError`/`ABORT_ERR` löst keinen Retry aus.
- `EAGAIN` in der Subprozess-Startphase löst keinen Retry aus und wird
  als `spawn` klassifiziert.
- Bei Timeout und Überschreiten des maximalen Puffers wird die
  möglicherweise unvollständige letzte Zeile aus der partiellen Ausgabe
  entfernt.
- Callback und `error`-Event des Subprozesses dürfen kein doppeltes
  Settlement oder zwei Retries auslösen.

### `packages/core/src/tools/ripGrep.test.ts`

Decke die Semantik für Tool-Caller ab:

- Vollständige Ausführung mit leerer Ausgabe gibt weiterhin
  `No matches found` zurück.
- Unvollständig ausgeführt, aber gültige Treffer enthalten: Gibt diese
  Treffer und einen expliziten Nicht-abgeschlossen-Hinweis zurück.
- Unvollständig ausgeführtes stdout, aus dem kein gültiger Treffer geparst
  wurde: Gibt einen Unvollständig-ausgeführt-Fehler zurück, nicht
  `No matches found`.
- Fehler ohne stdout: Gibt weiterhin einen expliziten
  grep-Ausführungsfehler zurück.
- Trunkierungs- und Unvollständig-ausgeführt-Labels bleiben unabhängig
  und können gleichzeitig existieren.

### Telemetrie-Tests

Erweitere die Logger- und Qwen-Logger-Tests und verifiziere:

- Das Retry-Erfolgs-Event enthält Auswahlmodus, Auslösestatus,
  Erfolgsstatus und EAGAIN-Klassifikation.
- Das endgültige Anomalie-Ergebnis enthält die feste Fehlerklassifikation.
- Normale erfolgreiche Suchen erzeugen kein
  Laufzeit-Recovery-Event.
- OpenTelemetry-Event-Name, Body und Qwen-Logger-Attribute sind korrekt.
- Das Event enthält keine Felder für Suchausdruck, Pfade, stdout, stderr
  oder rohe Fehler.

## 7. Verifikation und Akzeptanzkriterien

Führe gemäß den Anforderungen in `AGENTS.md` vom entsprechenden Paket-
oder Repository-Speicherort aus:

```bash
cd packages/core && npx vitest run src/utils/ripgrepUtils.test.ts
cd packages/core && npx vitest run src/tools/ripGrep.test.ts
cd packages/core && npx vitest run src/telemetry/loggers.test.ts
npm run typecheck
npm run build
```

Wenn die Implementierung andere Qwen-Logger-spezifische Tests als
`loggers.test.ts` ändert, müssen zusätzlich die entsprechenden
fokussierten Testdateien ausgeführt werden.

Die Änderung gilt erst als abgeschlossen, wenn die folgenden Bedingungen
erfüllt sind:

- Ein bestätigtes ripgrep-Thread-EAGAIN löst höchstens einen
  Single-Thread-Retry aus.
- Abbruch und Subprozess-Startfehler lösen diesen Retry niemals aus.
- Nur Exit-Code 1 mit leerem stderr bedeutet keine Treffer (stdout wird
  nicht geprüft).
- Kein Pfad einer unvollständigen Ausführung darf in die beiden
  `No matches found`-Rückgabezweige gelangen.
- Teil-Treffer bleiben für das Modell nützlich, müssen aber explizit als
  unvollständige Ausführung markiert sein.
- Die Telemetrie kann die Recovery messen, ohne Suchinhalte oder
  Repository-Inhalte zu erfassen.
- Fokussierte Tests, Typecheck und Build bestehen vollständig.
- Selbst-Review des vollständigen Diffs gemäß Repository-Anforderung, mit
  zwei aufeinanderfolgenden fehlerfreien Prüfungen nach dem letzten Fix.

## 8. Kosten, Nutzen und Rollback

Die geschätzten Implementierungskosten liegen bei etwa 1,5–3
Ingenieurarbeitstagen, einschließlich Tests und Telemetrie-Integration.
Der Scope ist bewusst kleiner gehalten als bei einer generischen
Laufzeit-Fallback-Refaktorierung.

Der direkte Nutzen umfasst:

- Wenn ripgrep die normale Anzahl von Worker-Threads nicht erstellen
  kann, kann die Suche in ressourcenbeschränkten CI- oder
  Container-Umgebungen wiederhergestellt werden.
- Beseitigt False Negatives, wenn Exit-Code 1 mit einem Fehler einhergeht.
- Beseitigt das Problem, dass sich Teil-Suchergebnisse als vollständige
  Repository-Evidenz ausgeben.
- Liefert Produktionsdaten für die Entscheidung, ob sich weitere
  Investitionen in andere Recovery-Fähigkeiten lohnen.

Der Rollback-Scope ist lokal: Der Retry-Zweig und das Laufzeit-Event
können entfernt werden, ohne die Binärdatei-Auswahl oder die bestehende
Start-Fallback-Logik zu ändern. Selbst wenn der Retry selbst
zurückgerollt wird, sollten die striktere Keine-Treffer-Entscheidung und
die Semantik für unvollständige Ausführung behalten werden, weil ihr
Schutz der Korrektheit unabhängig von der tatsächlichen
Eintrittshäufigkeit von EAGAIN ist.

## 9. Eingearbeitete Review-Kommentare

Ein Subagent hat diesen Plan bereits auf Basis des aktuellen
Repository-Quellcodes reviewed. Sein Review nahm die folgenden
substanziellen Anpassungen am initialen Entwurf vor:

- keine Wiederverwendung der Start-Fallback-Telemetrie, stattdessen ein
  eigenständiges Laufzeit-Event;
- Verschieben des Telemetrie-Sendeorts von der Utility-Schicht in
  `RipGrepTool`;
- Entfernen des spekulativen Delay-Retries für `EAGAIN` in der
  Subprozess-Startphase;
- Einengen der EAGAIN-Erkennung auf bestätigte Thread-Erstellungsfehler;
- Entfernen der Unterstützung für aktuell unmögliche fehlende
  Thread-Argumente und andere Argument-Schreibweisen;
- Unterscheidung zwischen `incomplete` und `truncated`;
- Anforderung, die Ausführungsvollständigkeit vor den beiden
  Keine-Treffer-Zweigen zu prüfen;
- Anforderung, dass die Keine-Treffer-Entscheidung bei Exit-Code 1 auf
  leerem stderr basiert (stdout wird nicht geprüft);
- Hinzufügen von Regressions-Tests für Single-Settlement und null gültige
  Treffer;
- Wiederherstellen des Repository-Build-Schritts, der für die zukünftige
  Implementierungsverifikation nötig ist.
