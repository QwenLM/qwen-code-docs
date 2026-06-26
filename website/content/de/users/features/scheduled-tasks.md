# Prompts nach Zeitplan ausführen

> Verwenden Sie `/loop` und die Cron-Planungswerkzeuge, um Prompts wiederholt auszuführen, den Status abzufragen oder einmalige Erinnerungen innerhalb einer Qwen Code-Sitzung einzurichten.

Geplante Aufgaben ermöglichen es Qwen Code, einen Prompt automatisch in einem Intervall erneut auszuführen. Verwenden Sie sie, um eine Bereitstellung abzufragen, einen PR zu betreuen, den Fortschritt eines lang laufenden Builds zu überprüfen oder sich selbst daran zu erinnern, später in der Sitzung etwas zu erledigen.

Aufgaben sind sitzungsbezogen: Sie leben im aktuellen Qwen Code-Prozess und sind weg, wenn Sie die Sitzung beenden. Es wird nichts auf die Festplatte geschrieben.

> **Tipp:** Geplante Aufgaben sind standardmäßig aktiviert. Um sie zu deaktivieren, setzen Sie `experimental.cron: false` in Ihren [Einstellungen](../configuration/settings.md), oder setzen Sie `QWEN_CODE_DISABLE_CRON=1` in Ihrer Umgebung.

## Wiederkehrende Prompts mit /loop planen

Die `/loop` [gebündelte Fähigkeit](skills.md) ist der schnellste Weg, einen wiederkehrenden Prompt zu planen. Geben Sie ein optionales Intervall und einen Prompt an, und Qwen Code richtet einen Cron-Job ein, der im Hintergrund ausgeführt wird, solange die Sitzung geöffnet ist.

```text
/loop 5m check if the deployment finished and tell me what happened
```

Qwen Code analysiert das Intervall, wandelt es in einen Cron-Ausdruck um, plant den Job und bestätigt den Rhythmus und die Job-ID. Anschließend führt es den Prompt sofort einmal aus – Sie müssen nicht auf den ersten Cron-Durchlauf warten.

### Intervall-Syntax

Intervalle sind optional. Sie können sie voranstellen, anhängen oder ganz weglassen.

| Form                    | Beispiel                               | Analysiertes Intervall       |
| :---------------------- | :------------------------------------- | :--------------------------- |
| Vorangestelltes Token   | `/loop 30m check the build`            | alle 30 Minuten              |
| Nachgestellte `every`-Klausel | `/loop check the build every 2 hours` | alle 2 Stunden               |
| Kein Intervall          | `/loop check the build`                | Standard: alle 10 Minuten    |

Unterstützte Einheiten sind `s` für Sekunden, `m` für Minuten, `h` für Stunden und `d` für Tage. Sekunden werden auf die nächste Minute aufgerundet, da Cron eine Minuten-Granularität hat. Intervalle, die nicht gleichmäßig in ihre Einheit passen, wie `7m` oder `90m`, werden auf das nächste saubere Intervall gerundet, und Qwen Code teilt Ihnen mit, was es gewählt hat.

### Über einen anderen Befehl loopen

Der geplante Prompt kann selbst ein Befehl oder ein Fähigkeitsaufruf sein. Dies ist nützlich, um einen bereits verpackten Workflow erneut auszuführen.

```text
/loop 20m /review-pr 1234
```

Jedes Mal, wenn der Job ausgelöst wird, führt Qwen Code `/review-pr 1234` aus, als hätten Sie es eingegeben.

### Loops verwalten

`/loop` unterstützt auch zwei Unterbefehle zur Verwaltung vorhandener Jobs:

```text
/loop list
```

Listet alle geplanten Jobs mit ihren IDs und Cron-Ausdrücken auf.

```text
/loop clear
```

Hebt alle geplanten Jobs auf einmal auf.

## Einmalige Erinnerung festlegen

Für einmalige Erinnerungen beschreiben Sie, was Sie möchten, in natürlicher Sprache anstatt `/loop` zu verwenden. Qwen Code plant eine einmalige Aufgabe, die sich nach der Ausführung selbst löscht.

```text
remind me at 3pm to push the release branch
```

```text
in 45 minutes, check whether the integration tests passed
```

Qwen Code legt die Auslösezeit auf eine bestimmte Minute und Stunde mit einem Cron-Ausdruck fest und bestätigt, wann es ausgelöst wird.

## Geplante Aufgaben verwalten

Bitten Sie Qwen Code in natürlicher Sprache, Aufgaben aufzulisten oder abzubrechen, oder verweisen Sie direkt auf die zugrunde liegenden Werkzeuge.

```text
what scheduled tasks do I have?
```

```text
cancel the deploy check job
```

Im Hintergrund verwendet Qwen Code diese Werkzeuge:

| Tool         | Zweck                                                                                                           |
| :----------- | :-------------------------------------------------------------------------------------------------------------- |
| `CronCreate` | Plant eine neue Aufgabe. Akzeptiert einen 5-Feld-Cron-Ausdruck, den auszuführenden Prompt und ob sie wiederholt oder einmal ausgelöst wird. |
| `CronList`   | Listet alle geplanten Aufgaben mit ihren IDs, Zeitplänen und Prompts auf.                                       |
| `CronDelete` | Bricht eine Aufgabe anhand der ID ab.                                                                           |

Jede geplante Aufgabe hat eine 8-stellige ID, die Sie an `CronDelete` übergeben können. Eine Sitzung kann gleichzeitig bis zu 50 geplante Aufgaben enthalten.

## Wie geplante Aufgaben ausgeführt werden

Der Scheduler überprüft jede Sekunde auf fällige Aufgaben und stellt sie in die Warteschlange, wenn die Sitzung im Leerlauf ist. Ein geplanter Prompt wird zwischen Ihren Zügen ausgelöst, nicht während Qwen Code mitten in einer Antwort ist. Wenn Qwen Code beschäftigt ist, wenn eine Aufgabe fällig wird, wartet der Prompt, bis die aktuelle Runde beendet ist.

Alle Zeiten werden in Ihrer lokalen Zeitzone interpretiert. Ein Cron-Ausdruck wie `0 9 * * *` bedeutet 9 Uhr morgens, wo immer Sie Qwen Code ausführen, nicht UTC.

### Jitter

Um zu vermeiden, dass jede Sitzung zur gleichen Wanduhrzeit auf die API zugreift, fügt der Scheduler einen kleinen deterministischen Versatz zu den Auslösezeiten hinzu:

- **Wiederkehrende Aufgaben** werden bis zu 10 % ihrer Periode später ausgelöst, begrenzt auf 15 Minuten. Ein stündlicher Job könnte irgendwann zwischen `:00` und `:06` ausgelöst werden.
- **Einmalige Aufgaben**, die für die volle oder halbe Stunde (Minute `:00` oder `:30`) geplant sind, werden bis zu 90 Sekunden früher ausgelöst.
Der Offset wird aus der Aufgaben-ID abgeleitet, sodass dieselbe Aufgabe immer denselben Offset erhält. Wenn die genaue Zeitsteuerung wichtig ist, wähle eine Minute, die nicht `:00` oder `:30` ist, z. B. `3 9 * * *` statt `0 9 * * *`, dann wird der einmalige Jitter nicht angewendet.

### Drei-Tage-Ablauf

Wiederkehrende Aufgaben laufen automatisch 3 Tage nach ihrer Erstellung ab. Die Aufgabe feuert ein letztes Mal und löscht sich dann selbst. Dadurch wird begrenzt, wie lange eine vergessene Schleife laufen kann. Wenn eine wiederkehrende Aufgabe länger bestehen soll, breche sie ab und erstelle sie vor ihrem Ablauf neu.

Einmalige Aufgaben laufen nicht mit einem Timer ab – sie löschen sich einfach selbst, nachdem sie einmal gefeuert haben.

## Referenz für Cron-Ausdrücke

`CronCreate` akzeptiert die standardmäßigen 5-Feld-Cron-Ausdrücke: `Minute Stunde Tag-des-Monats Monat Tag-der-Woche`. Alle Felder unterstützen Wildcards (`*`), einzelne Werte (`5`), Schritte (`*/15`), Bereiche (`1-5`) und kommagetrennte Listen (`1,15,30`).

| Beispiel       | Bedeutung                         |
| :------------- | :-------------------------------- |
| `*/5 * * * *`  | Alle 5 Minuten                    |
| `0 * * * *`    | Jede Stunde zur vollen Stunde     |
| `7 * * * *`    | Jede Stunde um 7 Minuten nach     |
| `0 9 * * *`    | Jeden Tag um 9 Uhr Ortszeit       |
| `0 9 * * 1-5`  | Werktags um 9 Uhr Ortszeit        |
| `30 14 15 3 *` | Am 15. März um 14:30 Uhr Ortszeit |

Der Tag-der-Woche verwendet `0` oder `7` für Sonntag bis `6` für Samstag. Wenn sowohl Tag-des-Monats als auch Tag-der-Woche eingeschränkt sind (keines davon ist `*`), dann trifft ein Datum zu, wenn eines der Felder übereinstimmt – dies folgt der Standard-vixie-cron-Semantik.

Erweiterte Syntax wie `L`, `W`, `?` und Namensaliase wie `MON` oder `JAN` werden nicht unterstützt.

## Einschränkungen

Das sitzungsbezogene Planen hat inhärente Grenzen:

- Aufgaben feuern nur, während Qwen Code läuft und im Leerlauf ist. Das Schließen des Terminals oder das Beenden der Sitzung bricht alles ab.
- Kein Nachholen versäumter Ausführungen. Wenn der geplante Zeitpunkt einer Aufgabe verstreicht, während Qwen Code mit einer langlaufenden Anfrage beschäftigt ist, feuert sie einmal, wenn Qwen Code wieder in den Leerlauf geht, nicht einmal pro verpasstem Intervall.
- Keine Persistenz über Neustarts hinweg. Ein Neustart von Qwen Code löscht alle sitzungsbezogenen Aufgaben.
