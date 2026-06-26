# Folge-Vorschläge

Qwen Code kann vorhersagen, was Sie als Nächstes eingeben möchten, und zeigt es als Platzhaltertext im Eingabebereich an. Diese Funktion verwendet einen LLM-Aufruf, um den Gesprächskontext zu analysieren und einen natürlichen nächsten Schritt vorzuschlagen.

In der CLI funktioniert diese Funktion vollständig. In der WebUI sind der Hook und die UI-Infrastruktur vorhanden, aber Host-Anwendungen müssen die Vorschlagsgenerierung auslösen und den Folgezustand verdrahten, damit Vorschläge erscheinen.

## Funktionsweise

Nachdem Qwen Code eine Antwort beendet hat, erscheint nach einer kurzen Verzögerung (~300 ms) ein Vorschlag als abgedunkelter Platzhaltertext im Eingabebereich. Nach der Behebung eines Fehlers könnten Sie beispielsweise Folgendes sehen:

```
> die Tests ausführen
```

Der Vorschlag wird generiert, indem der Gesprächsverlauf an das Modell gesendet wird, das vorhersagt, was Sie natürlicherweise als Nächstes eingeben würden. Wenn die Antwort einen expliziten Tipp enthält (z. B. `Tipp: geben Sie "post comments" ein, um Ergebnisse zu veröffentlichen`), wird die vorgeschlagene Aktion automatisch extrahiert.

## Vorschläge annehmen

| Taste          | Aktion                                          |
| -------------- | ----------------------------------------------- |
| `Tab`          | Vorschlag annehmen und in das Eingabefeld einfügen |
| `Enter`        | Vorschlag annehmen und in das Eingabefeld einfügen |
| `Rechte Pfeiltaste` | Vorschlag annehmen und in das Eingabefeld einfügen |
| Beliebiges Tippen | Vorschlag verwerfen und normal tippen          |

`Enter` füllt das Eingabefeld, sendet aber nicht ab. Wenn Sie also einen vorgeschlagenen Slash-Befehl (z. B. `/clear`) annehmen, wird dieser nie automatisch ausgeführt – Sie senden ihn selbst mit einem zweiten `Enter` ab.

## Wann Vorschläge erscheinen

Vorschläge werden generiert, wenn alle folgenden Bedingungen erfüllt sind:

- Das Modell hat seine Antwort abgeschlossen (nicht während des Streamings)
- Es haben mindestens 2 Modell-Durchläufe im Gespräch stattgefunden
- Die letzte Antwort enthält keine Fehler
- Es sind keine Bestätigungsdialoge anhängig (z. B. Shell-Bestätigung, Berechtigungen)
- Der Genehmigungsmodus ist nicht auf `plan` gesetzt
- Die Funktion ist aktiviert (standardmäßig eingeschaltet – setzen Sie `ui.enableFollowupSuggestions` auf `false`, um sie zu deaktivieren)

Vorschläge werden im nicht-interaktiven Modus (z. B. Headless/SDK-Modus) nicht angezeigt.

Vorschläge werden automatisch verworfen, wenn:

- Sie mit dem Tippen beginnen
- Ein neuer Modell-Durchlauf beginnt
- Der Vorschlag angenommen wird

## Schnelles Modell

Standardmäßig verwenden Vorschläge dasselbe Modell wie Ihr Hauptgespräch. Für Vorschläge mit geringerer Latenz konfigurieren Sie ein dediziertes schnelles Modell:

### Über die Befehlszeile

```
/model --fast qwen3-coder-flash
```

Oder verwenden Sie `/model --fast` (ohne Modellnamen), um einen Auswahldialog zu öffnen.

### Über settings.json

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

Das schnelle Modell wird für Eingabeaufforderungsvorschläge und spekulative Ausführung verwendet. Wenn nicht konfiguriert, wird das Hauptgesprächsmodell als Fallback verwendet.

> **Kostenhinweis:** Ein schnelles Modell senkt die Latenz, aber nicht immer die Kosten. Die Vorschlagsgenerierung verwendet den Präfix-Cache Ihres Gesprächs (über `ui.enableCacheSharing`, standardmäßig aktiviert) – ein Präfix-Cache ist jedoch pro Modell. Wenn Sie `fastModel` auf ein anderes Modell setzen, wird ein separater Cache verwendet, sodass der gesamte Gesprächsverlauf im schnellen Modell als ungecachte Eingabe abgerechnet wird. Bei langen Gesprächen kann die Standardeinstellung (Hauptmodell + gemeinsamer Cache) **günstiger** sein als ein schnelles Modell, da der Großteil des Verlaufs zum vergünstigten Cache-Tarif abgerechnet wird. Setzen Sie `fastModel` nur dann, wenn die Latenz wichtiger ist als die Kosten pro Durchlauf.

Der Denk-/Überlegungsmodus wird automatisch für alle Hintergrundaufgaben (Vorschlagsgenerierung und Spekulation) deaktiviert, unabhängig von der Denkkonfiguration Ihres Hauptmodells. Dies vermeidet die Verschwendung von Tokens für interne Überlegungen, die für diese Aufgaben nicht benötigt werden.

## Konfiguration

Diese Einstellungen können in `settings.json` konfiguriert werden:

| Einstellung                     | Typ     | Standard | Beschreibung                                                       |
| ------------------------------- | ------- | -------- | ------------------------------------------------------------------ |
| `ui.enableFollowupSuggestions`  | boolean | `true`   | Folge-Vorschläge aktivieren oder deaktivieren                      |
| `ui.enableCacheSharing`         | boolean | `true`   | Cache-bewusste verzweigte Abfragen verwenden, um Kosten zu senken (experimentell) |
| `ui.enableSpeculation`          | boolean | `false`  | Vorschläge vor dem Absenden spekulativ ausführen (experimentell)   |
| `fastModel`                     | string  | `""`     | Modell für Eingabeaufforderungsvorschläge und spekulative Ausführung |

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

Die Nutzung des Vorschlagsmodells erscheint in der Ausgabe von `/stats` und zeigt die Tokens an, die vom schnellen Modell für die Vorschlagsgenerierung verbraucht wurden.

Das schnelle Modell wird auch in der Ausgabe von `/about` unter "Fast Model" angezeigt.

## Qualität der Vorschläge

Vorschläge durchlaufen Qualitätsfilter, um sicherzustellen, dass sie nützlich sind:

- Muss 2–12 Wörter (CJK: 2–30 Zeichen) und insgesamt unter 100 Zeichen sein
- Darf nicht bewertend sein ("sieht gut aus", "danke")
- Darf keine KI-Stimme verwenden ("Lassen Sie mich...", "Ich werde...")
- Darf nicht aus mehreren Sätzen bestehen oder Formatierungen enthalten (Markdown, Zeilenumbrüche)
- Darf kein Meta-Kommentar sein ("nichts vorzuschlagen", "Stille")
- Darf keine Fehlermeldungen oder präfixierte Bezeichnungen sein ("Vorschlag: ...")
- Einzelwortvorschläge sind nur für gängige Befehle erlaubt (ja, commit, push usw.)
- Slash-Befehle (z. B. `/commit`) sind als Einzelwortvorschläge immer erlaubt
