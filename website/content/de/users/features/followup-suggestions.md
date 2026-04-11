# Follow-up-Vorschläge

Qwen Code kann vorhersagen, was du als Nächstes eingeben möchtest, und zeigt dies als Ghost-Text im Eingabebereich an. Diese Funktion nutzt einen LLM-Aufruf, um den Konversationskontext zu analysieren und einen natürlichen Vorschlag für den nächsten Schritt zu generieren.

Diese Funktion funktioniert im CLI end-to-end. In der WebUI sind der Hook und die UI-Infrastruktur vorhanden, Host-Anwendungen müssen jedoch die Vorschlagsgenerierung auslösen und den Follow-up-Status verknüpfen, damit Vorschläge angezeigt werden.

## Funktionsweise

Nachdem Qwen Code die Antwort abgeschlossen hat, erscheint nach einer kurzen Verzögerung (~300 ms) ein Vorschlag als abgedunkelter Text im Eingabebereich. Nach dem Beheben eines Bugs könntest du beispielsweise Folgendes sehen:

```
> run the tests
```

Der Vorschlag wird generiert, indem der Konversationsverlauf an das Modell gesendet wird, das vorhersagt, was du als Nächstes natürlich eingeben würdest. Enthält die Antwort einen expliziten Hinweis (z. B. `Tip: type post comments to publish findings`), wird die vorgeschlagene Aktion automatisch extrahiert.

## Vorschläge annehmen

| Taste           | Aktion                                           |
| ------------- | ------------------------------------------------ |
| `Tab`         | Vorschlag annehmen und in die Eingabe übernehmen |
| `Enter`       | Vorschlag annehmen und sofort absenden           |
| `Right Arrow` | Vorschlag annehmen und in die Eingabe übernehmen |
| Beliebige Eingabe | Vorschlag verwerfen und normal tippen        |

## Wann Vorschläge angezeigt werden

Vorschläge werden generiert, wenn alle folgenden Bedingungen erfüllt sind:

- Das Modell hat seine Antwort abgeschlossen (nicht während des Streamings)
- Es fanden mindestens 2 Modell-Turns in der Konversation statt
- Die letzte Antwort enthält keine Fehler
- Es stehen keine Bestätigungsdialoge aus (z. B. Shell-Bestätigung, Berechtigungen)
- Der Genehmigungsmodus ist nicht auf `plan` gesetzt
- Die Funktion ist in den Einstellungen aktiviert (standardmäßig aktiviert)

Vorschläge werden im nicht-interaktiven Modus (z. B. Headless-/SDK-Modus) nicht angezeigt.

Vorschläge werden automatisch verworfen, wenn:

- du mit dem Tippen beginnst
- ein neuer Modell-Turn startet
- der Vorschlag angenommen wird

## Schnelles Modell

Standardmäßig verwenden Vorschläge dasselbe Modell wie deine Hauptkonversation. Für schnellere und kostengünstigere Vorschläge kannst du ein dediziertes schnelles Modell konfigurieren:

### Über Befehl

```
/model --fast qwen3-coder-flash
```

Oder verwende `/model --fast` (ohne Modellnamen), um ein Auswahldialogfeld zu öffnen.

### Über settings.json

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

Das schnelle Modell wird für Prompt-Vorschläge und spekulative Ausführung verwendet. Wenn es nicht konfiguriert ist, wird das Modell der Hauptkonversation als Fallback genutzt.

Der Thinking-/Reasoning-Modus wird für alle Hintergrundaufgaben (Vorschlagsgenerierung und Spekulation) automatisch deaktiviert, unabhängig von der Thinking-Konfiguration deines Hauptmodells. So wird vermieden, Tokens für internes Reasoning zu verbrauchen, das für diese Aufgaben nicht benötigt wird.

## Konfiguration

Diese Einstellungen können in `settings.json` konfiguriert werden:

| Einstellung                    | Typ     | Standardwert | Beschreibung                                                        |
| ------------------------------ | ------- | ------------ | ------------------------------------------------------------------ |
| `ui.enableFollowupSuggestions` | boolean | `true`       | Follow-up-Vorschläge aktivieren oder deaktivieren                  |
| `ui.enableCacheSharing`        | boolean | `true`       | Cache-aware forked Queries zur Kostenreduzierung verwenden (experimentell) |
| `ui.enableSpeculation`         | boolean | `false`      | Vorschläge vor dem Absenden spekulativ ausführen (experimentell)   |
| `fastModel`                    | string  | `""`         | Modell für Prompt-Vorschläge und spekulative Ausführung            |

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

## Monitoring

Die Nutzung des Vorschlagsmodells wird in der Ausgabe von `/stats` angezeigt und zeigt die vom schnellen Modell für die Vorschlagsgenerierung verbrauchten Tokens.

Das schnelle Modell wird außerdem in der Ausgabe von `/about` unter „Fast Model" angezeigt.

## Vorschlagsqualität

Vorschläge durchlaufen Qualitätsfilter, um sicherzustellen, dass sie nützlich sind:

- Muss 2–12 Wörter (CJK: 2–30 Zeichen) umfassen, insgesamt unter 100 Zeichen
- Darf keine Bewertungen enthalten („looks good", „thanks")
- Darf keine KI-Stimme verwenden („Let me...", „I'll...")
- Darf keine mehreren Sätze oder Formatierungen enthalten (Markdown, Zeilenumbrüche)
- Darf keine Meta-Kommentare sein („nothing to suggest", „silence")
- Darf keine Fehlermeldungen oder Präfix-Labels sein („Suggestion: ...")
- Ein-Wort-Vorschläge sind nur für gängige Befehle erlaubt (yes, commit, push usw.)
- Slash-Befehle (z. B. `/commit`) sind immer als Ein-Wort-Vorschläge erlaubt