# Nachfolgevorschläge

Qwen Code kann vorhersagen, was Sie als Nächstes eingeben möchten, und zeigt dies als Platzhaltertext im Eingabebereich an. Diese Funktion verwendet einen LLM-Aufruf, um den Gesprächskontext zu analysieren und einen natürlichen nächsten Schritt vorzuschlagen.

Diese Funktion funktioniert im CLI vollständig durchgängig. In der WebUI sind der Hook und die UI-Infrastruktur vorhanden, aber Host-Anwendungen müssen die Generierung von Vorschlägen auslösen und den Nachfolgezustand verbinden, damit Vorschläge erscheinen.

## Funktionsweise

Nachdem Qwen Code seine Antwort beendet hat, erscheint nach einer kurzen Verzögerung (~300 ms) ein Vorschlag als abgedunkelter Platzhaltertext im Eingabebereich. Nach der Behebung eines Fehlers könnte beispielsweise Folgendes erscheinen:

```
> die Tests ausführen
```

Der Vorschlag wird generiert, indem der Gesprächsverlauf an das Modell gesendet wird, das vorhersagt, was Sie als Nächstes natürlich eingeben würden. Enthält die Antwort einen expliziten Hinweis (z. B. `Tipp: Geben Sie „Kommentare posten“ ein, um Ergebnisse zu veröffentlichen`), wird die vorgeschlagene Aktion automatisch extrahiert.

## Vorschläge annehmen

| Taste          | Aktion                                          |
| -------------- | ----------------------------------------------- |
| `Tab`          | Vorschlag annehmen und in die Eingabe einfügen  |
| `Enter`        | Vorschlag annehmen und in die Eingabe einfügen  |
| `Rechtspfeil`  | Vorschlag annehmen und in die Eingabe einfügen  |
| Beliebiges Tippen | Vorschlag verwerfen und normal tippen         |

`Enter` füllt die Eingabe, anstatt sie abzuschicken. Wenn Sie also einen vorgeschlagenen Slash-Befehl (z. B. `/clear`) annehmen, wird er nie automatisch ausgeführt – Sie müssen ihn mit einem zweiten `Enter` selbst abschicken.

## Wann Vorschläge erscheinen

Vorschläge werden generiert, wenn alle folgenden Bedingungen erfüllt sind:

- Das Modell hat seine Antwort abgeschlossen (nicht während des Streamings)
- Es haben mindestens 2 Modell-Durchläufe im Gespräch stattgefunden
- Die letzte Antwort enthält keine Fehler
- Es sind keine Bestätigungsdialoge anhängig (z. B. Shell-Bestätigung, Berechtigungen)
- Der Genehmigungsmodus ist nicht auf `plan` gesetzt
- Die Funktion ist aktiviert (standardmäßig aktiviert – setzen Sie `ui.enableFollowupSuggestions` auf `false`, um sie zu deaktivieren)

Vorschläge erscheinen nicht im nicht-interaktiven Modus (z. B. headless/SDK-Modus).

Vorschläge werden automatisch verworfen, wenn:

- Sie mit der Eingabe beginnen
- Ein neuer Modell-Durchlauf beginnt
- Der Vorschlag angenommen wird

## Schnelles Modell

Standardmäßig verwenden Vorschläge dasselbe Modell wie Ihr Hauptgespräch. Für Vorschläge mit geringerer Latenz konfigurieren Sie ein dediziertes schnelles Modell:

### Per Befehl

```
/model --fast qwen3-coder-flash
```

Oder verwenden Sie `/model --fast` (ohne Modellnamen), um einen Auswahldialog zu öffnen.

### Via settings.json

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

Das schnelle Modell wird für Eingabevorschläge und spekulative Ausführung verwendet. Wenn nicht konfiguriert, wird das Hauptgesprächsmodell als Fallback verwendet.

> **Kostenhinweis:** Ein schnelles Modell senkt die Latenz, aber nicht unbedingt die Kosten. Die Vorschlagsgenerierung verwendet den Präfix-Cache Ihres Gesprächs erneut (über `ui.enableCacheSharing`, standardmäßig aktiviert) – aber ein Präfix-Cache ist pro Modell. Wenn Sie `fastModel` auf ein anderes Modell setzen, wird ein separater Cache erstellt, sodass der gesamte Gesprächsverlauf auf dem schnellen Modell erneut als ungecachte Eingabe abgerechnet wird. Bei langen Gesprächen kann die Standardeinstellung (Hauptmodell + gemeinsamer Cache) **günstiger** sein als ein schnelles Modell, da der Großteil des Verlaufs zum reduzierten Cache-Tarif abgerechnet wird. Setzen Sie `fastModel` nur, wenn die Latenz wichtiger ist als die Kosten pro Durchlauf.

Der Denk-/Überlegungsmodus wird automatisch für alle Hintergrundaufgaben (Vorschlagsgenerierung und Spekulation) deaktiviert, unabhängig von der Denkkonfiguration Ihres Hauptmodells. So wird vermieden, dass Token für interne Überlegungen verschwendet werden, die für diese Aufgaben nicht benötigt werden.

## Konfiguration

Diese Einstellungen können in `settings.json` konfiguriert werden:

| Einstellung                     | Typ     | Standard | Beschreibung                                                                 |
| ------------------------------- | ------- | -------- | ---------------------------------------------------------------------------- |
| `ui.enableFollowupSuggestions`  | boolean | `true`   | Aktiviert oder deaktiviert Nachfolgevorschläge                               |
| `ui.enableCacheSharing`         | boolean | `true`   | Verwendet cache-bewusste verzweigte Abfragen zur Kostensenkung (experimentell) |
| `ui.enableSpeculation`          | boolean | `false`  | Führt Vorschläge spekulativ vor dem Absenden aus (experimentell)             |
| `fastModel`                     | string  | `""`     | Modell für Eingabevorschläge und spekulative Ausführung                      |

### Beispiel

```json
{
  "fastModel": "qwen3-coder-flash",
  "ui": {
    "enableFollowupSuggestions": true,
    "enableCacheSharing": true
  }
}
```

## Überwachung

Die Nutzung des Vorschlagsmodells wird in der `/stats`-Ausgabe angezeigt und zeigt die vom schnellen Modell für die Vorschlagsgenerierung verbrauchten Token an.

Das schnelle Modell wird auch in der `/about`-Ausgabe unter „Fast Model“ angezeigt.

## Qualität der Vorschläge

Vorschläge durchlaufen Qualitätsfilter, um sicherzustellen, dass sie nützlich sind:

- Müssen 2–12 Wörter (CJK: 2–30 Zeichen) und insgesamt unter 100 Zeichen lang sein
- Dürfen nicht bewertend sein („sieht gut aus“, „danke“)
- Dürfen keine KI-Stimme verwenden („Lassen Sie mich…“, „Ich werde…“)
- Dürfen keine mehreren Sätze sein oder Formatierungen enthalten (Markdown, Zeilenumbrüche)
- Dürfen keine Metakommentare sein („nichts vorzuschlagen“, „Stille“)
- Dürfen keine Fehlermeldungen oder vorangestellten Bezeichnungen sein („Vorschlag: …“)
- Ein-Wort-Vorschläge sind nur für gängige Befehle erlaubt (yes, commit, push usw.)
- Slash-Befehle (z. B. `/commit`) sind als Ein-Wort-Vorschläge immer erlaubt