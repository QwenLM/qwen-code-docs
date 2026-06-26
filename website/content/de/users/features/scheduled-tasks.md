# Ausführungen nach Zeitplan ausführen

> Verwenden Sie `/loop` und die Cron-Planungswerkzeuge, um Ausführungen wiederholt auszuführen, den Status abzufragen oder einmalige Erinnerungen innerhalb einer Qwen Code-Sitzung einzurichten.

Geplante Aufgaben erlauben es Qwen Code, eine Aufforderung automatisch in einem bestimmten Intervall erneut auszuführen. Nutzen Sie sie, um einen Deployment-Status abzufragen, einen PR zu beaufsichtigen, den Fortschritt eines langlaufenden Builds zu überprüfen oder sich später in der Sitzung an etwas zu erinnern.

Aufgaben sind sitzungsgebunden: Sie existieren nur im aktuellen Qwen Code-Prozess und verschwinden, wenn Sie diesen beenden. Es wird nichts auf die Festplatte geschrieben.

> **Tipp:** Geplante Aufgaben sind standardmäßig aktiviert. Um sie zu deaktivieren, setzen Sie `experimental.cron: false` in Ihren [Einstellungen](../configuration/settings.md) oder setzen Sie `QWEN_CODE_DISABLE_CRON=1` in Ihrer Umgebungsvariable.

## Eine wiederkehrende Aufforderung mit /loop planen

Das `/loop` [mitgelieferte Skill](skills.md) ist der schnellste Weg, um eine wiederkehrende Aufforderung zu planen. Übergeben Sie ein optionales Intervall und eine Aufforderung, und Qwen Code richtet einen Cron-Job ein, der im Hintergrund ausgeführt wird, solange die Sitzung geöffnet bleibt.

```text
/loop 5m prüfe, ob das Deployment abgeschlossen ist, und sag mir, was passiert ist
```

Qwen Code parst das Intervall, wandelt es in einen Cron-Ausdruck um, plant den Job und bestätigt die Kadenz und die Job-ID. Anschließend wird die Aufforderung sofort einmal ausgeführt – Sie müssen nicht auf den ersten Cron-Durchlauf warten.

### Intervall-Syntax

Intervalle sind optional. Sie können sie voranstellen, anhängen oder ganz weglassen.

| Form                      | Beispiel                                 | Geparstes Intervall      |
| :------------------------ | :--------------------------------------- | :----------------------- |
| Vorangestelltes Token     | `/loop 30m prüfe den Build`              | alle 30 Minuten          |
| Nachgestellte `every`-Klausel | `/loop prüfe den Build every 2 hours` | alle 2 Stunden           |
| Kein Intervall            | `/loop prüfe den Build`                  | Standard: alle 10 Minuten |

Unterstützte Einheiten sind `s` für Sekunden, `m` für Minuten, `h` für Stunden und `d` für Tage. Sekunden werden auf die nächste Minute aufgerundet, da Cron eine Granularität von einer Minute hat. Intervalle, die nicht gleichmäßig in ihre Einheit passen, wie z. B. `7m` oder `90m`, werden auf das nächste saubere Intervall gerundet, und Qwen Code teilt Ihnen mit, was gewählt wurde.

### Schleife über einen anderen Befehl

Die geplante Aufforderung kann selbst ein Befehl oder ein Skill-Aufruf sein. Dies ist nützlich, um einen bereits verpackten Workflow erneut auszuführen.

```text
/loop 20m /review-pr 1234
```

Jedes Mal, wenn der Job ausgelöst wird, führt Qwen Code `/review-pr 1234` aus, als hätten Sie es selbst eingegeben.

### Schleifen verwalten

`/loop` unterstützt auch zwei Unterbefehle zur Verwaltung vorhandener Jobs:

```text
/loop list
```

Listet alle geplanten Jobs mit ihren IDs und Cron-Ausdrücken auf.

```text
/loop clear
```

Bricht alle geplanten Jobs auf einmal ab.

## Einmalige Erinnerung einrichten

Für einmalige Erinnerungen beschreiben Sie in natürlicher Sprache, was Sie möchten, anstatt `/loop` zu verwenden. Qwen Code plant eine einmalige Aufgabe, die sich nach der Ausführung selbst löscht.

```text
erinnere mich um 15 Uhr daran, den Release-Branch zu pushen
```

```text
in 45 Minuten prüfen, ob die Integrationstests bestanden sind
```

Qwen Code legt die Auslösezeit auf eine bestimmte Minute und Stunde fest, indem ein Cron-Ausdruck verwendet wird, und bestätigt, wann die Aufgabe ausgelöst wird.

## Geplante Aufgaben verwalten

Fragen Sie Qwen Code in natürlicher Sprache, um Aufgaben aufzulisten oder zu stornieren, oder greifen Sie direkt auf die zugrunde liegenden Werkzeuge zu.

```text
welche geplanten Aufgaben habe ich?
```

```text
storniere den Deploy-Check-Job
```

Im Hintergrund verwendet Qwen Code diese Werkzeuge:

| Werkzeug     | Zweck                                                                                                      |
| :----------- | :--------------------------------------------------------------------------------------------------------- |
| `CronCreate` | Eine neue Aufgabe planen. Akzeptiert einen 5-Feld-Cron-Ausdruck, die auszuführende Aufforderung und ob sie wiederholt oder einmal ausgeführt wird. |
| `CronList`   | Alle geplanten Aufgaben mit ihren IDs, Zeitplänen und Aufforderungen auflisten.                            |
| `CronDelete` | Eine Aufgabe anhand ihrer ID stornieren.                                                                   |

Jede geplante Aufgabe hat eine 8-stellige ID, die Sie an `CronDelete` übergeben können. Eine Sitzung kann bis zu 50 geplante Aufgaben gleichzeitig halten.

## Wie geplante Aufgaben ausgeführt werden

Der Planer prüft jede Sekunde auf fällige Aufgaben und stellt sie in die Warteschlange, wenn die Sitzung im Leerlauf ist. Eine geplante Aufforderung wird zwischen Ihren Eingaben ausgelöst, nicht während Qwen Code eine Antwort erstellt. Wenn Qwen Code beschäftigt ist, wenn eine Aufgabe fällig wird, wartet die Aufforderung, bis die aktuelle Runde beendet ist.

Alle Zeiten beziehen sich auf Ihre lokale Zeitzone. Ein Cron-Ausdruck wie `0 9 * * *` bedeutet 9 Uhr morgens, wo immer Sie Qwen Code ausführen, nicht UTC.

### Jitter

Um zu vermeiden, dass jede Sitzung zur gleichen absoluten Zeit die API erreicht, fügt der Planer einen kleinen deterministischen Offset zu den Auslösezeiten hinzu:

- **Wiederkehrende Aufgaben** werden bis zu 10 % ihrer Periode später ausgelöst, maximal 15 Minuten. Ein stündlicher Job könnte irgendwann zwischen `:00` und `:06` feuern.
- **Einmalige Aufgaben**, die zur vollen oder halben Stunde (Minute `:00` oder `:30`) geplant sind, feuern bis zu 90 Sekunden früher.

Der Offset wird von der Aufgaben-ID abgeleitet, sodass dieselbe Aufgabe immer denselben Offset erhält. Wenn es auf die genaue Zeit ankommt, wählen Sie eine Minute, die nicht `:00` oder `:30` ist, z. B. `3 9 * * *` anstelle von `0 9 * * *`, dann wird der Jitter für einmalige Aufgaben nicht angewendet.

### Drei-Tage-Ablauf

Wiederkehrende Aufgaben laufen automatisch 3 Tage nach ihrer Erstellung ab. Die Aufgabe feuert ein letztes Mal und löscht sich dann selbst. Dadurch wird begrenzt, wie lange eine vergessene Schleife laufen kann. Wenn eine wiederkehrende Aufgabe länger bestehen soll, stornieren Sie sie und erstellen Sie sie vor dem Ablauf neu.

Einmalige Aufgaben laufen nicht zeitlich ab – sie löschen sich nach einmaligem Ausführen selbst.

## Referenz für Cron-Ausdrücke

`CronCreate` akzeptiert standardmäßige 5-Feld-Cron-Ausdrücke: `Minute Stunde Tag-des-Monats Monat Tag-der-Woche`. Alle Felder unterstützen Wildcards (`*`), einzelne Werte (`5`), Schrittweiten (`*/15`), Bereiche (`1-5`) und Komma-getrennte Listen (`1,15,30`).

| Beispiel        | Bedeutung                          |
| :-------------- | :--------------------------------- |
| `*/5 * * * *`   | Alle 5 Minuten                     |
| `0 * * * *`     | Jede Stunde zur vollen Stunde      |
| `7 * * * *`     | Jede Stunde um 7 Minuten nach      |
| `0 9 * * *`     | Täglich um 9 Uhr lokaler Zeit      |
| `0 9 * * 1-5`   | Wochentags um 9 Uhr lokaler Zeit   |
| `30 14 15 3 *`  | 15. März um 14:30 lokaler Zeit     |

Tag-der-Woche verwendet `0` oder `7` für Sonntag bis `6` für Samstag. Wenn sowohl Tag-des-Monats als auch Tag-der-Woche eingeschränkt sind (keines ist `*`), trifft ein Datum zu, wenn eines der Felder zutrifft – dies folgt der standardmäßigen Vixie-Cron-Semantik.

Erweiterte Syntax wie `L`, `W`, `?` und Namensaliase wie `MON` oder `JAN` werden nicht unterstützt.

## Einschränkungen

Sitzungsgebundene Planung hat inhärente Grenzen:

- Aufgaben feuern nur, während Qwen Code läuft und im Leerlauf ist. Das Schließen des Terminals oder das Beenden der Sitzung bricht alles ab.
- Kein Nachholen für verpasste Auslösungen. Wenn die geplante Zeit einer Aufgabe verstreicht, während Qwen Code mit einer langlaufenden Anfrage beschäftigt ist, feuert die Aufgabe einmal, wenn Qwen Code wieder im Leerlauf ist, nicht einmal pro verpasstem Intervall.
- Keine Persistenz über Neustarts hinweg. Ein Neustart von Qwen Code löscht alle sitzungsgebundenen Aufgaben.