# Problemstellung

Wenn `ChatCompressionService` (automatisch oder manuell) auslöst, übergibt es
`historyToCompress` unverändert an das Zusammenfassungsmodell. Zwei zusammenhängende Probleme
beeinträchtigen Qualität, Genauigkeit und Kosten:

1. **Inline-Bild- / Dokument-Bytes gelangen in den Zusammenfassungs-Prompt.**
   MCP-Tools, die Anhänge (Screenshots, Design-Mockups, PDFs) einbinden, platzieren
   `inlineData`-Teile direkt im Gesprächsverlauf. Die Komprimierungspipeline entfernt diese
   nicht, sodass das Zusammenfassungsmodell rohe Base64-Daten erhält, die es meist nicht
   interpretieren kann, und die Nutzlast der Seitenabfrage wird unnötig aufgebläht.

2. **Die Token-Schätzung von `findCompressSplitPoint` ist bei binären Teilen falsch.**
   Der Split-Point-Algorithmus verwendet `JSON.stringify(content).length`, um Zeichen
   auf den Verlauf zu verteilen. Ein einzelnes 1 MB Base64-Bild (~1,4 M Zeichen) lässt
   einen Eintrag wie ~350 K Token aussehen, überragt den eigentlichen Text und verschiebt
   den Schnitt an die falsche Stelle. Die tatsächlichen Token-Kosten für ein Qwen-VL-Bild
   betragen maximal ein paar tausend Token. Der Schätzer sollte binäre Teile als kleine
   Konstante behandeln.

claude-code adressiert (1) mit `stripImagesFromMessages`. qwen-code hat weder diesen
Stripping-Schritt noch die entsprechende Zeichenzählungs-Korrektur.

Diese Änderung fügt beides hinzu, begrenzt auf die **Eingabe der Komprimierungs-Seitenabfrage**.
Der Live-Gesprächsverlauf, die Persistenz (`chats/<sessionId>.jsonl`) und der Prompt, der
beim nächsten Turn an das Hauptmodell gesendet wird, bleiben unberührt. Die Schlankung
betrifft nur die Nutzlast der Seitenabfrage, die innerhalb von `chatCompressionService`
erstellt wird.

### Außerhalb des Gültigkeitsbereichs (verschoben oder abgelehnt)

- **Externalisierung großer Einfügungen in einen Einfüge-Cache.** Ein früherer Entwurf
  dieses Designs schlug vor, überlangen Text zu hashen und in
  `~/.qwen/paste-cache/<sha>.txt` zu speichern und durch einen Platzhalter zu ersetzen.
  Wir haben dies nach einer Untersuchung der claude-code-Versionen 2026-03 bis 2026-05
  abgelehnt: Die Entwicklungsrichtung ist, Benutzereingaben für das Modell sichtbar zu
  lassen und Kosten durch Prompt-Caching (1h TTL-Knöpfe, Bild-Downscaling) zu amortisieren,
  anstatt sie zu externalisieren. Das Platzieren von wörtlichen Benutzereingaben hinter
  einem Hash-Platzhalter riskiert „Intent-Drift", sobald die Komprimierung den
  ursprünglichen Text kollabiert hat. Falls wir dies später erneut aufgreifen, ist das
  richtige Muster `read_paste(hash)` als echtes Tool, das das Modell erreichen kann,
  nicht stilles Umschreiben.

## Aktueller Zustand vs. Ziel

| Aspekt                           | qwen-code heute                                      | claude-code Referenz                                            | Ziel nach dieser Änderung                                             |
| -------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Bild/Dokument im Komprimierungs-Prompt | Wird unverändert gesendet                                | `stripImagesFromMessages` ersetzt mit `[image]` / `[document]` | Wird als `[image: mime]` / `[document: mime]` Platzhalter gesendet      |
| Token-Schätzung für binäre Teile | `JSON.stringify().length` (weit daneben)               | Wird als festes Budget behandelt                                | Konfigurierbare Konstante (Standard 1.600 Token / ~6.400 Zeichen)      |
| Microcompact-Bildbereinigung     | Nicht berührt (nur Text-Tool-Ergebnisse werden bei Leerlauf gelöscht) | Zeitbasiertes MC löscht alles                                 | Microcompact löscht auch veraltete Inline-Bilder zusammen mit Tool-Ergebnissen |

## Vorgeschlagene Änderungen

### Ebene 1: Schlankung der Komprimierungseingabe (`services/compactionInputSlimming.ts`)

Ein neues reines Modul, das `Content[]` entgegennimmt und ein geschlanktes
`Content[]` zurückgibt. Eine Transformation: Entfernen von Inline-Medien.
Gehe jeden `Part` durch. Wenn der Teil `inlineData` oder `fileData` hat,
ersetze ihn durch einen `text`-Teil der Form `[image: image/png]` (oder
`[document: application/pdf]`).

qwen-code hängt von Tools zurückgegebene Medien an `functionResponse.parts` an
(eine Erweiterung des standardmäßigen `@google/genai`-Schemas `FunctionResponse`;
siehe `coreToolScheduler.createFunctionResponsePart`). Der Schlankungsmechanismus
durchläuft rekursiv dieses verschachtelte Array, sodass auch ein von `read_file`
oder einem beliebigen MCP-Anhang-Tool zurückgegebenes Base64-Bild ersetzt wird.

Die Transformation gibt ein neues `Content[]`-Array zurück; das Original wird
niemals mutiert. Wenn die Transformation keine Änderungen erzeugt, wird die
ursprüngliche Array-Referenz zurückgegeben (identitätsgleich). Der Orchestrator
ruft `slimCompactionInput` als letzten Schritt vor `runSideQuery` in
`chatCompressionService.ts` auf.

### Ebene 2: Token-Schätzungskorrektur (`chatCompressionService.ts`)

`findCompressSplitPoint` verwendet derzeit `JSON.stringify(content).length`
für die Zeichenzählungs-Verteilung. Ersetze dies durch einen
`estimateContentChars`-Helfer, der:

- Für `text`-Teile: `text.length`
- Für `inlineData` / `fileData`-Teile: `imageTokenEstimate * 4` (Standard
  1.600 × 4 = 6.400 Zeichen).
- Für `functionCall` / `functionResponse`-Teile:
  `JSON.stringify(part).length` (unverändertes Verhalten).

Dies ist dieselbe Konstante, die das Schlankungsmodul verwendet, sodass das
Budget, das der Split-Point-Algorithmus sieht, mit dem übereinstimmt, was
der geschlankte Prompt tatsächlich nachgelagert verbraucht. Um doppelte
Durchläufe zu vermeiden, berechnet `compress()` `charCounts` einmal vor
und übergibt sie an `findCompressSplitPoint` (neues optionales 4. Argument);
dasselbe Array wird für die `MIN_COMPRESSION_FRACTION`-Schranke wiederverwendet.

### Ebene 3: Microcompact-Bildbereinigung (`microcompaction/microcompact.ts`)

`collectCompactablePartRefs` gibt nun drei Gruppen zurück:

- `tool` — `functionResponse`-Teile von komprimierbaren Built-in-Tools.
  Wird als Einheit gelöscht: Antwortausgabe wird durch den Sentinel ersetzt,
  `functionResponse.parts` wird damit verworfen.
- `media` — Top-Level-`inlineData` / `fileData`-Teile unter Nachrichten mit
  Benutzerrolle (z. B. über `@reference` eingefügte Bilder). Ersetzt mit
  `[Old inline media cleared: <mime>]`.
- `nested-media` — `functionResponse`-Teile von **nicht komprimierbaren**
  Tools (z. B. MCP-Screenshot-Tools, deren Namen nicht in
  `COMPACTABLE_TOOLS` sind), die Bilder / Dokumente im
  `functionResponse.parts`-Erweiterungsfeld tragen. Nur die verschachtelten
  Medien werden gelöscht; die Textausgabe des Tools bleibt erhalten.

Jede Kategorie hat ihr eigenes `keepRecent`-Budget. Die Einstellung
`toolResultsNumToKeep: 1` behält den aktuellsten jeder Kategorie
(1 Tool + 1 Medium + 1 verschachteltes Medium), nicht 1 Eintrag insgesamt
aus der kombinierten Liste.

MimeType-Werte, die von MCP-Tool-Servern stammen, werden mit
`sanitizeMimeForPlaceholder` verarbeitet, bevor sie in einen Platzhalterstring
eingebettet werden. Der Schlankungsmechanismus und Microcompact teilen sich
diesen Helfer.

### Ebene 4: Konfiguration (`config/config.ts`)

Ein neues Feld unter den `chatCompression`-Einstellungen:

```json
{
  "chatCompression": {
    "contextPercentageThreshold": 0.7,
    "imageTokenEstimate": 1600
  }
}
```

Plus eine Umgebungsüberschreibung für Betrieb/Debug: `QWEN_IMAGE_TOKEN_ESTIMATE`.

## Wichtige Designentscheidungen

**Entscheidung 1: `imageTokenEstimate = 1600`.**
Die Qwen-VL-Familie begrenzt auf 1.280 visuelle Token pro Bild ohne
`vl_high_resolution_images`; mit diesem Flag bis zu 16.384. 1.600 ist ein
konservativer Mittelwert, der leicht nach oben tendiert – Überschätzung führt
zu früherer Komprimierung (sicher), Unterschätzung zu später Komprimierung
(unsicher). Für Nicht-VL-Modelle (Qwen3-Coder, der qwen-code-Standard) ist
die Konstante nur für die Korrektheit der Token-Schätzung relevant, da Bilder
ohnehin nicht zum Modell gelangen.

**Entscheidung 2: Die geschlankte Kopie entfernen, nicht den Live-Verlauf.**
`slimCompactionInput` gibt ein neues Array zurück; der in `GeminiChat`
gespeicherte Gesprächsverlauf bleibt unberührt. Die lokale Persistenz
(`.chats/<sessionId>.jsonl`) behält die vollständige Unterhaltung bei,
wie sie der Benutzer erlebt hat, sodass `--resume` ohne Verlust funktioniert.

**Entscheidung 3: Microcompact behandelt Bilder einheitlich mit alten
Tool-Ergebnissen.** Der zeitbasierte Leerlauf-Trigger löscht bereits veraltete
Tool-Ausgaben; die Ausweitung auf Inline-Bilder hält die Richtlinie konsistent
und nutzt das bestehende `keepRecent`-Fenster wieder.

**Entscheidung 4: Kein Paste-Store / keine Textexternalisierung.**
Siehe Abschnitt „Außerhalb des Gültigkeitsbereichs". Der Upstream-Konsens
(claude-code 2026-03 → 2026-05) ist, wörtliche Benutzereingaben sichtbar zu
lassen und Kosten durch Prompt-Caching zu amortisieren, nicht zu externalisieren.

## Betroffene Dateien

**Neue Dateien**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**Geänderte Dateien**

- `packages/core/src/config/config.ts` — `ChatCompressionSettings` erweitern
- `packages/core/src/services/chatCompressionService.ts` — Schlankung vor
  `runSideQuery` aufrufen; Zeichenzählungs-Helfer ersetzen; `charCounts` einmal
  für Splitter + Schranke vorberechnen
- `packages/core/src/services/chatCompressionService.test.ts` — einen
  Integrationstest hinzufügen, der bestätigt, dass Base64 nie das Zusammenfassungsmodell erreicht
- `packages/core/src/services/microcompaction/microcompact.ts` — Sammlung auf
  Inline-Bilder erweitern
- `packages/core/src/services/microcompaction/microcompact.test.ts` —
  Bildbereinigung testen

## Gültigkeitsbereichsgrenzen

**Im Gültigkeitsbereich**

- Inline-Medien aus der Komprimierungseingabe entfernen
- `findCompressSplitPoint`-Zeichenschätzung korrigieren
- Microcompact-Bildteilbereinigung beim Leerlauf-Trigger
- Eine Einstellung + Umgebungsüberschreibung

**Verschoben**

- Externalisierung großer Einfügungen (siehe „Außerhalb des Gültigkeitsbereichs" oben)
- Wiederherstellungs-Tool (`read_paste(hash)` usw.)
- Persistenzschicht-Deduplizierung
- `/context`-Einfügungsaufschlüsselung
- Telemetrie-Ereignisse für Schlankungsstatistiken

## Offene Fragen

1. **Sollte der Platzhaltertext einen Hash enthalten, um eine zukünftige
   Wiederherstellung zu ermöglichen?** Derzeit geben wir nur `[image: image/png]` aus.
   Falls/wenn ein `read_paste`-ähnliches Tool eingeführt wird, könnte eine ID
   nützlich sein. Vorerst ist der Platzhalter informativ; das Originalbild
   existiert weiterhin im Live-Verlauf und in der Persistenz.
2. **Ist `imageTokenEstimate = 1600` korrekt für Nicht-Qwen-VL-Modelle, die
   über Anthropic / OpenAI-Proxys bedient werden?** Wahrscheinlich eine leichte
   Unterschätzung für Claude (wo Bilder bis zu ~5K Token haben können), aber
   harmlos: Es betrifft nur die Split-Point-Heuristik, niemals den tatsächlichen
   Prompt, den das benutzersichtige Modell sieht.
3. **Die `MIN_COMPRESSION_FRACTION`-Schranke wird auf Basis der Zeichenzahlen
   vor der Schlankung berechnet.** Ein bildlastiger Ausschnitt kann die 5%-Schwelle
   überschreiten (weil Bilder im Schätzer mit ~6.400 Zeichen zählen) und dann
   nach der Schlankung auf `[image: …]`-Platzhalter schrumpfen. Das
   Zusammenfassungsmodell erhält dann fast keinen textuellen Kontext. Dies ist
   fürs Erste beabsichtigt: Die Aufgabe der Zusammenfassung ist es, „Benutzer hat
   ein Bild von X geteilt" festzuhalten, selbst wenn der Großteil des Ausschnitts
   visuell war, und der Zweck der Schranke ist „gibt es genug, um eine
   Zusammenfassung zu lohnen" – was Bilder vernünftigerweise erfüllen. Falls die
   Qualität nachlässt, können wir dies erneut aufgreifen, entweder durch erneute
   Prüfung nach der Schlankung oder durch Gewichtung der Schranke basierend auf
   dem `imagesStripped`-Anteil.