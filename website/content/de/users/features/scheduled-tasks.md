# Prompts nach Zeitplan ausführen

> Verwende `/loop` und die Cron-Scheduling-Tools, um Prompts wiederholt auszuführen, den Status abzufragen oder einmalige Erinnerungen innerhalb einer Qwen Code-Sitzung einzurichten.

Geplante Tasks ermöglichen es Qwen Code, einen Prompt automatisch in einem bestimmten Intervall erneut auszuführen. Nutze sie, um ein Deployment zu pollen, einen PR zu überwachen, den Fortschritt eines lang laufenden Builds zu prüfen oder dich daran zu erinnern, später in der Sitzung etwas zu erledigen.

Tasks sind sitzungsgebunden: Sie existieren nur im aktuellen Qwen Code-Prozess und verschwinden beim Beenden. Es wird nichts auf die Festplatte geschrieben.

> **Tipp:** Geplante Tasks sind standardmäßig aktiviert. Um sie zu deaktivieren, setze `experimental.cron: false` in deinen [Einstellungen](../configuration/settings.md) oder setze `QWEN_CODE_DISABLE_CRON=1` in deiner Umgebung.

## Einen wiederkehrenden Prompt mit /loop planen

Der `/loop` [integrierte Skill](skills.md) ist der schnellste Weg, um einen wiederkehrenden Prompt zu planen. Übergib ein optionales Intervall und einen Prompt, und Qwen Code richtet einen Cron-Job ein, der im Hintergrund ausgeführt wird, während die Sitzung geöffnet bleibt.

```text
/loop 5m check if the deployment finished and tell me what happened
```

Qwen Code parst das Intervall, konvertiert es in einen Cron-Ausdruck, plant den Job und bestätigt den Rhythmus und die Job-ID. Anschließend führt es den Prompt sofort einmal aus – du musst nicht auf die erste Cron-Ausführung warten.

### Intervall-Syntax

Intervalle sind optional. Du kannst sie voranstellen, anhängen oder ganz weglassen.

| Form                    | Beispiel                              | Geparstes Intervall          |
| :---------------------- | :------------------------------------ | :--------------------------- |
| Führender Token         | `/loop 30m check the build`           | alle 30 Minuten              |
| Nachgestellte `every`-Klausel | `/loop check the build every 2 hours` | alle 2 Stunden             |
| Kein Intervall          | `/loop check the build`               | Standardmäßig alle 10 Minuten|

Unterstützte Einheiten sind `s` für Sekunden, `m` für Minuten, `h` für Stunden und `d` für Tage. Sekunden werden auf die nächste Minute aufgerundet, da Cron eine Granularität von einer Minute hat. Intervalle, die nicht gleichmäßig in ihre Einheit teilbar sind, wie `7m` oder `90m`, werden auf das nächste saubere Intervall gerundet und Qwen Code teilt dir mit, was es ausgewählt hat.

### Einen anderen Befehl in einer Schleife ausführen

Der geplante Prompt kann selbst ein Befehl oder ein Skill-Aufruf sein. Dies ist nützlich, um einen bereits verpackten Workflow erneut auszuführen.

```text
/loop 20m /review-pr 1234
```

Jedes Mal, wenn der Job ausgelöst wird, führt Qwen Code `/review-pr 1234` aus, als hättest du ihn selbst eingegeben.

### Autonomer Modus

Die Ausführung von `/loop` **ohne Prompt** startet eine autonome Schleife, anstatt einen festen Prompt zu wiederholen. Qwen Code fungiert als Verwalter der bereits im Gespräch etablierten Arbeit – es hält deine Arbeit am Laufen, während du abwesend bist:

```text
/loop
```

Ein bloßes `/loop` (kein Prompt, kein Intervall) führt eine autonome Schleife in eigenem Tempo aus; `/loop <Intervall>` ohne Prompt führt dieselbe autonome Schleife in einem festen Rhythmus aus (z. B. `/loop 10m`). Bei jeder Ausführung treibt es das voran, was das Gespräch bereits eingerichtet hat – es beendet angefangene Dinge, pflegt einen laufenden PR (beantwortet Review-Threads, behebt fehlgeschlagene CIs, löst Konflikte) und hält Folgeverpflichtungen ein. Es handelt nur auf Grundlage der Arbeit, die im Transkript bereits etabliert wurde: Es erfindet niemals neue Arbeit oder nimmt irreversible Änderungen (Push, Delete, Send) ohne klare Autorisierung vor, und es stoppt, sobald alles ruhig ist.

### Loops verwalten

`/loop` unterstützt auch zwei Subbefehle zum Verwalten vorhandener Jobs:

```text
/loop list
```

Listet alle geplanten Jobs mit ihren IDs und Cron-Ausdrücken auf.

```text
/loop clear
```

Bricht alle geplanten Jobs auf einmal ab.

## Eine einmalige Erinnerung einstellen

Verwende für einmalige Erinnerungen die natürliche Sprache, um zu beschreiben, was du möchtest, anstatt `/loop` zu benutzen. Qwen Code plant einen einmalig ausgeführten Task, der sich nach der Ausführung selbst löscht.

```text
remind me at 3pm to push the release branch
```

```text
in 45 minutes, check whether the integration tests passed
```

Qwen Code legt den Ausführungszeitpunkt mithilfe eines Cron-Ausdrucks auf eine bestimmte Minute und Stunde fest und bestätigt, wann er ausgeführt wird.

## Geplante Tasks verwalten

Bitte Qwen Code in natürlicher Sprache, Tasks aufzulisten oder abzubrechen, oder referenziere die zugrunde liegenden Tools direkt.

```text
what scheduled tasks do I have?
```

```text
cancel the deploy check job
```

Unter der Haube verwendet Qwen Code diese Tools:

| Tool         | Zweck                                                                                                           |
| :----------- | :-------------------------------------------------------------------------------------------------------------- |
| `CronCreate` | Plant einen neuen Task. Akzeptiert einen 5-feldrigen Cron-Ausdruck, den auszuführenden Prompt und ob er wiederkehrend oder einmalig ausgeführt wird. |
| `CronList`   | Listet alle geplanten Tasks mit ihren IDs, Zeitplänen und Prompts auf.                                          |
| `CronDelete` | Bricht einen Task anhand der ID ab.                                                                             |

Jeder geplante Task hat eine 8-stellige ID, die du an `CronDelete` übergeben kannst. Eine Sitzung kann bis zu 50 geplante Tasks gleichzeitig enthalten.

## Wie geplante Tasks ausgeführt werden

Der Scheduler prüft jede Sekunde auf fällige Tasks und reiht sie in die Warteschlange ein, wenn die Sitzung im Leerlauf ist. Ein geplanter Prompt wird zwischen deinen Zügen ausgelöst, nicht während Qwen Code mitten in einer Antwort ist. Wenn Qwen Code beschäftigt ist, wenn ein Task fällig wird, wartet der Prompt, bis der aktuelle Zug beendet ist.

Alle Zeiten werden in deiner lokalen Zeitzone interpretiert. Ein Cron-Ausdruck wie `0 9 * * *` bedeutet 9 Uhr morgens dort, wo du Qwen Code ausführst, nicht UTC.

### Jitter

Um zu vermeiden, dass jede Sitzung die API zur exakt gleichen Uhrzeit trifft, fügt der Scheduler einen kleinen deterministischen Offset zu den Ausführungszeiten hinzu:

- **Wiederkehrende Tasks** werden bis zu 10 % ihrer Periode verzögert ausgelöst, maximal 15 Minuten. Ein stündlicher Job kann jederzeit zwischen `:00` und `:06` ausgelöst werden.
- **Einmalige Tasks**, die für den Anfang oder das Ende einer Stunde geplant sind (Minute `:00` oder `:30`), werden bis zu 90 Sekunden früher ausgelöst.

Der Offset wird aus der Task-ID abgeleitet, sodass derselbe Task immer denselben Offset erhält. Wenn das exakte Timing wichtig ist, wähle eine Minute, die nicht `:00` oder `:30` ist, zum Beispiel `3 9 * * *` anstelle von `0 9 * * *`, und der Jitter für einmalige Tasks wird nicht angewendet.

### Ablauf nach drei Tagen

Wiederkehrende Tasks laufen automatisch 3 Tage nach ihrer Erstellung ab. Der Task wird ein letztes Mal ausgelöst und löscht sich dann selbst. Dies begrenzt, wie lange ein vergessener Loop laufen kann. Wenn ein wiederkehrender Task länger laufen soll, brich ihn ab und erstelle ihn neu, bevor er abläuft.

Einmalige Tasks laufen nicht zeitgesteuert ab – sie löschen sich einfach selbst, nachdem sie einmal ausgeführt wurden.

## Referenz für Cron-Ausdrücke

`CronCreate` akzeptiert Standard-5-Feld-Cron-Ausdrücke: `Minute Stunde Tag-des-Monats Monat Tag-der-Woche`. Alle Felder unterstützen Wildcards (`*`), einzelne Werte (`5`), Schritte (`*/15`), Bereiche (`1-5`) und kommagetrennte Listen (`1,15,30`).

| Beispiel       | Bedeutung                    |
| :------------- | :--------------------------- |
| `*/5 * * * *`  | Alle 5 Minuten               |
| `0 * * * *`    | Jede Stunde zur vollen Stunde|
| `7 * * * *`    | Jede Stunde bei Minute 7     |
| `0 9 * * *`    | Jeden Tag um 9 Uhr lokal     |
| `0 9 * * 1-5`  | Wochentags um 9 Uhr lokal    |
| `30 14 15 3 *` | 15. März um 14:30 Uhr lokal  |

Tag-der-Woche verwendet `0` oder `7` für Sonntag bis `6` für Samstag. Wenn sowohl Tag-des-Monats als auch Tag-der-Woche eingeschränkt sind (keines ist `*`), stimmt ein Datum überein, wenn eines der beiden Felder übereinstimmt – dies folgt der Standard-Semantik von vixie-cron.

Erweiterte Syntax wie `L`, `W`, `?` und Namensaliase wie `MON` oder `JAN` werden nicht unterstützt.

## Einschränkungen

Die sitzungsgebundene Planung hat folgende inhärente Einschränkungen:

- Tasks werden nur ausgelöst, während Qwen Code läuft und im Leerlauf ist. Das Schließen des Terminals oder das Beenden der Sitzung bricht alles ab.
- Kein Nachholen für verpasste Ausführungen. Wenn die geplante Zeit eines Tasks verstreicht, während Qwen Code mit einer lang laufenden Anfrage beschäftigt ist, wird er einmalig ausgelöst, wenn Qwen Code wieder im Leerlauf ist, und nicht einmal pro verpasstem Intervall.
- Keine Persistenz über Neustarts hinweg. Ein Neustart von Qwen Code löscht alle sitzungsgebundenen Tasks.