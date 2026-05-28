---
description: "Planen Sie Qwen Code Scheduled Tasks für Code Checks, Reports und wiederkehrende Automationen, damit Entwicklungsabläufe zuverlässig ohne manuelle Starts laufen."
---

# Prompts zeitgesteuert ausführen

> Verwende `/loop` und die Cron-Scheduling-Tools, um Prompts wiederholt auszuführen, den Status abzufragen oder einmalige Erinnerungen innerhalb einer Qwen Code-Sitzung festzulegen.

Geplante Tasks ermöglichen es Qwen Code, einen Prompt automatisch in einem festgelegten Intervall erneut auszuführen. Nutze sie, um ein Deployment zu pollen, einen PR zu überwachen, einen lang laufenden Build zu prüfen oder dich später in der Sitzung an eine Aufgabe zu erinnern.

Tasks sind sitzungsbezogen: Sie existieren im aktuellen Qwen Code-Prozess und werden beim Beenden gelöscht. Es wird nichts auf die Festplatte geschrieben.

> **Hinweis:** Geplante Tasks sind ein experimentelles Feature. Aktiviere sie mit `experimental.cron: true` in deinen [Einstellungen](../configuration/settings.md) oder setze `QWEN_CODE_ENABLE_CRON=1` in deiner Umgebung.

## Einen wiederkehrenden Prompt mit /loop planen

Die `/loop`-[Standard-Skill](skills.md) ist der schnellste Weg, einen wiederkehrenden Prompt zu planen. Übergib ein optionales Intervall und einen Prompt, und Qwen Code richtet einen Cron-Job ein, der im Hintergrund ausgeführt wird, während die Sitzung geöffnet bleibt.

```text
/loop 5m check if the deployment finished and tell me what happened
```

Qwen Code parst das Intervall, konvertiert es in einen Cron-Ausdruck, plant den Job und bestätigt den Ausführungsrhythmus sowie die Job-ID. Anschließend führt es den Prompt sofort einmal aus – du musst nicht auf den ersten Cron-Aufruf warten.

### Intervall-Syntax

Intervalle sind optional. Du kannst sie voranstellen, anhängen oder ganz weglassen.

| Form | Beispiel | Geparstes Intervall |
| :--- | :--- | :--- |
| Vorangestelltes Token | `/loop 30m check the build` | alle 30 Minuten |
| Nachgestellte `every`-Klausel | `/loop check the build every 2 hours` | alle 2 Stunden |
| Kein Intervall | `/loop check the build` | Standard: alle 10 Minuten |

Unterstützte Einheiten sind `s` für Sekunden, `m` für Minuten, `h` für Stunden und `d` für Tage. Sekunden werden auf die nächste volle Minute aufgerundet, da Cron eine Granularität von einer Minute hat. Intervalle, die sich nicht glatt in ihre Einheit teilen lassen (z. B. `7m` oder `90m`), werden auf das nächste saubere Intervall gerundet und Qwen Code teilt dir mit, was ausgewählt wurde.

### Einen anderen Befehl loopen

Der geplante Prompt kann selbst ein Befehl oder ein Skill-Aufruf sein. Das ist nützlich, um einen bereits verpackten Workflow erneut auszuführen.

```text
/loop 20m /review-pr 1234
```

Jedes Mal, wenn der Job ausgelöst wird, führt Qwen Code `/review-pr 1234` so aus, als hättest du ihn selbst eingegeben.

### Loops verwalten

`/loop` unterstützt außerdem zwei Subcommands zur Verwaltung bestehender Jobs:

```text
/loop list
```

Listet alle geplanten Jobs mit ihren IDs und Cron-Ausdrücken auf.

```text
/loop clear
```

Bricht alle geplanten Jobs auf einmal ab.

## Eine einmalige Erinnerung festlegen

Für einmalige Erinnerungen beschreibe einfach in natürlicher Sprache, was du möchtest, anstatt `/loop` zu verwenden. Qwen Code plant einen einmaligen Task, der sich nach der Ausführung selbst löscht.

```text
remind me at 3pm to push the release branch
```

```text
in 45 minutes, check whether the integration tests passed
```

Qwen Code fixiert den Ausführungszeitpunkt mithilfe eines Cron-Ausdrucks auf eine bestimmte Minute und Stunde und bestätigt, wann er ausgelöst wird.

## Geplante Tasks verwalten

Bitte Qwen Code in natürlicher Sprache, Tasks aufzulisten oder abzubrechen, oder greife direkt auf die zugrunde liegenden Tools zu.

```text
what scheduled tasks do I have?
```

```text
cancel the deploy check job
```

Unter der Haube verwendet Qwen Code folgende Tools:

| Tool | Zweck |
| :--- | :--- |
| `CronCreate` | Plant einen neuen Task. Akzeptiert einen 5-stelligen Cron-Ausdruck, den auszuführenden Prompt und ob er wiederkehrend oder einmalig ausgeführt wird. |
| `CronList` | Listet alle geplanten Tasks mit ihren IDs, Zeitplänen und Prompts auf. |
| `CronDelete` | Bricht einen Task anhand seiner ID ab. |

Jeder geplante Task hat eine 8-stellige ID, die du an `CronDelete` übergeben kannst. Eine Sitzung kann gleichzeitig bis zu 50 geplante Tasks enthalten.

## So werden geplante Tasks ausgeführt

Der Scheduler prüft jede Sekunde auf fällige Tasks und reiht sie in die Warteschlange ein, wenn die Sitzung im Leerlauf ist. Ein geplanter Prompt wird zwischen deinen Eingaben ausgelöst, nicht während Qwen Code gerade eine Antwort generiert. Wenn Qwen Code beschäftigt ist, wenn ein Task fällig wird, wartet der Prompt, bis der aktuelle Durchlauf beendet ist.

Alle Zeiten werden in deiner lokalen Zeitzone interpretiert. Ein Cron-Ausdruck wie `0 9 * * *` bedeutet 9 Uhr morgens an dem Ort, an dem du Qwen Code ausführst, nicht UTC.

### Jitter

Um zu vermeiden, dass jede Sitzung zur exakt gleichen Uhrzeit die API anfragt, fügt der Scheduler einen kleinen deterministischen Offset zu den Ausführungszeiten hinzu:

- **Wiederkehrende Tasks** werden bis zu 10 % ihrer Periode verzögert ausgelöst, maximal jedoch 15 Minuten. Ein stündlicher Job kann also zwischen `:00` und `:06` feuern.
- **Einmalige Tasks**, die auf den vollen oder halben Stunden (Minute `:00` oder `:30`) geplant sind, werden bis zu 90 Sekunden früher ausgelöst.

Der Offset wird aus der Task-ID abgeleitet, sodass derselbe Task immer denselben Offset erhält. Wenn es auf exaktes Timing ankommt, wähle eine Minute, die nicht `:00` oder `:30` ist, z. B. `3 9 * * *` statt `0 9 * * *`, dann wird der Jitter für einmalige Tasks nicht angewendet.

### Ablauf nach drei Tagen

Wiederkehrende Tasks laufen automatisch 3 Tage nach ihrer Erstellung ab. Der Task wird ein letztes Mal ausgeführt und löscht sich dann selbst. Dadurch wird begrenzt, wie lange ein vergessener Loop laufen kann. Wenn ein wiederkehrender Task länger bestehen soll, brich ihn vor dem Ablauf ab und erstelle ihn neu.

Einmalige Tasks laufen nicht zeitgesteuert ab – sie löschen sich einfach nach der einmaligen Ausführung selbst.

## Referenz für Cron-Ausdrücke

`CronCreate` akzeptiert standardmäßige 5-stellige Cron-Ausdrücke: `minute hour day-of-month month day-of-week`. Alle Felder unterstützen Wildcards (`*`), Einzelwerte (`5`), Schritte (`*/15`), Bereiche (`1-5`) und kommagetrennte Listen (`1,15,30`).

| Beispiel | Bedeutung |
| :--- | :--- |
| `*/5 * * * *` | Alle 5 Minuten |
| `0 * * * *` | Jede volle Stunde |
| `7 * * * *` | Jede Stunde bei 7 Minuten nach |
| `0 9 * * *` | Täglich um 9 Uhr (lokal) |
| `0 9 * * 1-5` | Werktags um 9 Uhr (lokal) |
| `30 14 15 3 *` | 15. März um 14:30 Uhr (lokal) |

Für den Wochentag steht `0` oder `7` für Sonntag bis `6` für Samstag. Wenn sowohl `day-of-month` als auch `day-of-week` eingeschränkt sind (keines ist `*`), trifft ein Datum zu, wenn eines der beiden Felder übereinstimmt – dies folgt der Standard-Semantik von vixie-cron.

Erweiterte Syntax wie `L`, `W`, `?` und Namensaliase wie `MON` oder `JAN` werden nicht unterstützt.

## Einschränkungen

Sitzungsbezogenes Scheduling unterliegt folgenden inhärenten Einschränkungen:

- Tasks werden nur ausgelöst, während Qwen Code läuft und im Leerlauf ist. Das Schließen des Terminals oder das Beenden der Sitzung bricht alles ab.
- Kein Nachholen verpasster Ausführungen. Wenn die geplante Zeit eines Tasks verstreicht, während Qwen Code mit einer lang laufenden Anfrage beschäftigt ist, wird er einmalig ausgelöst, sobald Qwen Code wieder im Leerlauf ist – nicht pro verpasstem Intervall.
- Keine Persistenz über Neustarts hinweg. Ein Neustart von Qwen Code löscht alle sitzungsbezogenen Tasks.