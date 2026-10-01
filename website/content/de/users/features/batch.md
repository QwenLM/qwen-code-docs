# Batch-Modus (DashScope)

Die DashScope-Batch-API führt Anfragen asynchron zum halben Echtzeitpreis aus, mit einem Abschlussfenster von mindestens 24 Stunden. Qwen Code nutzt sie über `/batch-api`: Sie beschreiben eine Sammelaufgabe, der Agent erstellt einen Plan, und `qwen batch` reicht ihn ein, verfolgt den Fortschritt und schreibt die Ergebnisse als Dateien.

## Ein Batch-Modell konfigurieren

Deklarieren Sie den Endpunkt und die Anmeldeinformationen einmalig in `settings.json` und wählen Sie ihn dann mit `batch.model` aus. Ihr normales Konversationsmodell und die Authentifizierung bleiben unverändert, auch wenn die Konversation Qwen OAuth oder einen anderen Provider verwendet.

```json
{
  "env": { "DASHSCOPE_API_KEY": "your-key" },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "batch": { "authType": "openai", "model": "qwen3.7-plus" }
}
```

Fügen Sie diese Felder in Ihre bestehenden Einstellungen ein und behalten Sie Ihre anderen Provider-Einträge bei. `envKey` benennt den Schlüssel in `settings.env` (oder eine Umgebungsvariable); ein separater Shell-Export ist nicht nötig. Die `generationConfig` des Providers steuert die Batch-Generierung. `wireApi` ist das Anfrageprotokoll, kein Batch-Schalter: lassen Sie ihn weg oder verwenden Sie `"chat-completions"`; `"responses"` wird von diesem Executor nicht unterstützt.

`batch.authType` ist standardmäßig `openai`. Das Modell muss genau mit einem OpenAI-kompatiblen Chat-Completions-Eintrag mit einer `baseUrl` und einem gefüllten `envKey` übereinstimmen. Wenn sich IDs wiederholen, setzen Sie `batch.baseUrl` auf die exakt konfigurierte URL. Ungültige explizite Auswahlen schlagen vor dem Hochladen fehl; sie fallen nie auf Konversations-Anmeldedaten zurück. Starten Sie die interaktive Session nach dem Ändern dieser Auswahl neu, damit ihr Hintergrund-Sammler dieselben Einstellungen wie untergeordnete Befehle verwendet.

Ohne eine Batch-Auswahl bleibt das bisherige Verhalten: Batch verwendet die Konfiguration des Hauptmodells und erfordert OpenAI-kompatible API-Schlüssel-Authentifizierung. Qwen-OAuth-Anmeldedaten selbst haben keinen Batch-Routing. Führen Sie `qwen batch check` aus, um die Bereitschaft zu überprüfen, ohne eine kostenpflichtige Anfrage einzureichen.

## Wann Batch das richtige Werkzeug ist

- **Halber Preis, kein Cache.** Batch berechnet erfolgreiche Anfragen mit 50% des Echtzeit-Listenpreises, aber der Prefix-Cache trifft innerhalb eines Batches nie zu (gemessen `cached_tokens: 0`). Echtzeit berechnet zwischengespeicherte Eingabe mit 20% des Listenpreises, daher gewinnt Batch nur, wenn wenig von jeder Anfrage geteilt wird: bei einer Cache-Trefferquote `h` kostet Echtzeit etwa `1 − 0.8h` des Listenpreises für die Eingabe, und Batch verliert, sobald `h` 0,625 überschreitet.
- **Gut geeignet:** viele unabhängige Single-Turn-Anfragen, die jeweils von ihrem eigenen Inhalt dominiert werden — Übersetzen oder Zusammenfassen einer Dokumentensammlung, Extrahieren von Daten pro Datei. Lange Ausgaben begünstigen Batch zusätzlich.
- **Nicht geeignet:** ein langer gemeinsamer Regelkatalog oder Few-Shot-Präfix mit kurzen Elementen, eine Handvoll Elemente, alles, was mehr als einen Turn benötigt. Das Routen der eigenen Turns eines Agents durch Batch wurde mit 1,03× Echtzeit und Stunden langsamer gemessen.
- **Latenz:** überall von Sekunden bis Stunden, hauptsächlich Warteschlange, und variiert je nach Modell. Rechnen Sie damit, dass es günstig ist, nicht schnell.

Um einen Auftrag zu überprüfen, bevor Sie sich festlegen, senden Sie eine Anfrage in Echtzeit und vergleichen Sie `usage.prompt_tokens_details.cached_tokens` mit `usage.prompt_tokens`.

## `/batch-api`

```text
/batch-api translate the Markdown docs in docs/zh into English,
writing them to docs/en with the same file names
```

Der Agent führt `qwen batch check` aus, bestätigt, dass die Aufgabe passt, liest eine kleine Stichprobe, schreibt einen Plan nach `.qwen/batch/plans/` und zeigt eine Vorschau — nichts wird hochgeladen oder berechnet:

```bash
qwen batch run .qwen/batch/plans/<slug>.json --dry-run
# preview: 42 item(s), window 24h — nothing uploaded, nothing billed
# model qwen-plus, thinking off, max output 8192 tokens (frozen from your current settings; retries reuse them)
# writes new files to: docs/en/ (42)
# ~180,000 in / ~190,000 out tokens (rough estimate); ...
# snapshot 3f9c2a7e5d10b884; submit exactly this batch with: qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
```

Anschließend reicht es diesen Snapshot ein. Die Genehmigungsabfrage für diesen Befehl ist der Ort, an dem Sie über die Ausgabe entscheiden, mit der Vorschau darüber; wenn sich der Plan, eine Quelldatei oder Ihre Einstellungen in der Zwischenzeit geändert haben, wird die Einreichung abgelehnt.

```bash
qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
# task translate-docs-20260923103000: 42 item(s), window 24h
# ...
# batch job: batch_abc123
```

`run` kehrt sofort zurück und **Sie müssen nicht manuell einsammeln**. Der Agent startet `qwen batch collect <task-id> --wait` als Hintergrund-Task (sichtbar in `/tasks`) und beendet seinen Turn, sodass Sie weiterarbeiten können. Dieser Prozess fragt den Provider über HTTP ab — kein Modellaufruf während des Wartens — und wenn der Batch abgeschlossen ist, schreibt er die Ergebnisse und beendet sich. Der Agent wird dann einmal geweckt: Er teilt Ihnen mit, was ausgeliefert, zurückgehalten oder fehlgeschlagen ist, und führt beliebige Nachfolgeaktionen aus, die Sie in der ursprünglichen Anfrage angefordert haben. Fehlgeschlagene Elemente werden nie automatisch wiederholt, da ein Retry erneut berechnet wird.

Wenn die Session vorher geschlossen wird, geht nichts verloren: Eine interaktive Session sammelt die abgeschlossenen Tasks des Projekts beim Start und während sie geöffnet ist und zeigt eine einzige Benachrichtigung. Setzen Sie `general.batchAutoCollect` auf `false`, um dies zu deaktivieren. Headless-Runs (`qwen -p`), `qwen serve` und IDE/ACP-Clients sammeln nicht automatisch ein.

Die Befehle funktionieren aus jedem Verzeichnis und innerhalb einer Session mit dem `!`-Präfix (z.B. `!qwen batch collect <task-id>`), sodass kein Modell-Turn verbraucht wird:

```bash
qwen batch check                         # verify setup; nothing is billed
qwen batch collect <task-id> [--wait [--timeout <s>]]   # validate + write target files
qwen batch retry <task-id>               # resubmit only the failed items
qwen batch retry <task-id> --max-output-tokens 8192  # include truncated ones
qwen batch list                          # every recorded task, with its project
qwen batch cancel <task-id>              # partial results are still billed
qwen batch clean <task-id>               # delete the local record (cancels nothing)
```

`collect` meldet jedes Element als:

- **delivered** — geschrieben an sein Ziel;
- **held** — die Quelle hat sich nach der Einreichung geändert (`retry` reicht es gegen die neue Quelle erneut ein), oder das Ziel existiert bereits mit anderem Inhalt (lösen Sie es auf und führen Sie `collect` erneut aus; es wird keine neue Anfrage gestellt);
- **failed** — abgeschnitten, leer, ein Tool-Aufruf oder ein Provider-Fehler; `retry` reicht diese erneut ein, abgeschnittene Elemente nur mit einem größeren `--max-output-tokens`.

`collect` erneut auszuführen ist immer sicher: Ausgelieferte Elemente werden nie wiederholt und die Nutzung wird nie doppelt gezählt. Sobald die Ergebnisse auf der Festplatte sind, werden die Remote-Eingabe- und -Ausgabedateien gelöscht.

## Aufzeichnungen, Sicherheit und Kosten

- Task-Aufzeichnungen befinden sich in `~/.qwen/batch/tasks/<task-id>/` (`QWEN_BATCH_HOME` überschreibt dies) mit Owner-only-Berechtigungen, da sie vollständige Kopien Ihrer Quellen und Ausgaben enthalten. Plan-Dateien unter `.qwen/batch/` des Projekts erhalten ein `.gitignore`.
- Ein Task ist an den Endpunkt und API-Schlüssel gebunden, mit dem er eingereicht wurde (nur ein kurzer Hash des Schlüssels wird gespeichert); nach dem Wechsel des Kontos oder der Region verweigern die Befehle die Ausführung, bis Sie zurückwechseln.
- Wenn die Antwort des Create-Aufrufs verloren geht, schlägt `run` fehl, der Task wird als `submit-unknown` markiert, und `collect` gleicht stattdessen mit der Batch-Liste des Providers ab, statt erneut einzureichen — ein Duplikat würde doppelt berechnet.
- Nur ein `qwen batch`-Befehl arbeitet zu einem Zeitpunkt an einem Task.
- Ein Run friert Ihre aktuellen Sampling-Parameter, das Ausgabelimit und den Thinking-Modus ein; Retries verwenden sie wieder.
- Schätzungen basieren auf Token, es sei denn, Sie setzen `QWEN_BATCH_INPUT_PRICE_PER_1M_USD` und `QWEN_BATCH_OUTPUT_PRICE_PER_1M_USD`. Die grobe Schätzung lässt Thinking-Token weg, die ein Vielfaches der Ausgabe betragen können. Das `maxCostUsd` eines Plans wird gegen den Worst-Case bei den Anfrage-Caps durchgesetzt: Es benötigt diese Preise, ein `maxOutputTokens` und Thinking aus oder ein `thinking_budget`, sonst wird der Run abgelehnt. Keine der Zahlen beinhaltet, was Ihre Session für die Vorbereitung des Plans ausgegeben hat.
- Eine fehlgeschlagene Remote-Bereinigung blockiert nie `retry`, `cancel` oder `clean`; ein späteres `collect` wiederholt sie. Eine Ergebnisdatei, die der Provider nicht vollständig bereitstellen kann (nach einem erneuten Download) oder nicht mehr hat, lässt die betroffenen Elemente fehlschlagen, statt den Task hängen zu lassen.
- `clean` verweigert die Ausführung, während ein Batch noch laufen könnte oder nicht eingesammelte Ergebnisse hält, es sei denn, Sie übergeben `--force`.
- Ziele müssen innerhalb des Projekts und außerhalb jedes versteckten Pfads bleiben (`.git/`, `.github/`, `.qwen/`, … auf beliebiger Tiefe): Ergebnisse werden Stunden nach der Genehmigung des Plans geschrieben. Die Vorschau listet die Zielverzeichnisse auf.

Design: [`docs/design/2026-09-23-batch-api-design.md`](../../design/2026-09-23-batch-api-design.md).
Eine Offline-End-to-End-Überprüfung (gefälschte Batch-API, echte gebaute CLI) befindet sich in [`docs/verification/batch-api/`](../../verification/batch-api/README.md).