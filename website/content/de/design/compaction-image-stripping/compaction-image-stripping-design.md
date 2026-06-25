# Fehlerbehebung für Bildentfernung bei Komprimierung und Token-Schätzung

## Problemstellung

Wenn `ChatCompressionService` ausgelöst wird (automatisch oder manuell), wird
`historyToCompress` unverändert an das Zusammenfassungsmodell gesendet. Zwei
verwandte Probleme beeinträchtigen Qualität, Genauigkeit und Kosten:

1. **Inline-Bild-/Dokument-Bytes gelangen in den Zusammenfassungs-Prompt.**
   MCP-Tools, die Anhänge (Screenshots, Design-Mockups, PDFs) einbinden,
   platzieren `inlineData`-Teile direkt in der Konversation. Die
   Komprimierungspipeline entfernt sie nicht, sodass das Zusammenfassungsmodell
   rohe Base64-Daten erhält, die es normalerweise nicht interpretieren kann, und
   die Seitenabfrage-Nutzlast wird unnötig aufgebläht.

2. **`findCompressSplitPoint` Token-Schätzung ist für binäre Teile falsch.**
   Der Split-Point-Algorithmus verwendet
   `JSON.stringify(content).length`, um Zeichen über den Verlauf zu
   verteilen. Ein einzelnes 1 MB Base64-Bild (~1,4 M Zeichen) lässt einen
   Eintrag wie ~350 K Token aussehen, überlagert den tatsächlichen Text und
   verschiebt den Schnittpunkt an die falsche Stelle. Die tatsächlichen
   Token-Kosten für ein Qwen-VL-Bild betragen höchstens einige tausend Token.
   Der Schätzer sollte binäre Teile als kleine Konstante behandeln.

claude-code behandelt (1) mit `stripImagesFromMessages`. qwen-code hat
weder diesen Strip noch die entsprechende Zeichenzähl-Korrektur.

Diese Änderung fügt beides hinzu, begrenzt auf die **Komprimierungs-Seitenabfrage-Eingabe
nur**. Der aktuelle Konversationsverlauf, die Persistenz
(`chats/<sessionId>.jsonl`) und der Prompt, der beim nächsten Zug an das
Hauptmodell gesendet wird, bleiben unberührt. Die Verschlankung gilt nur für die
Seitenabfrage-Nutzlast, die innerhalb von `chatCompressionService` erstellt wird.

### Außerhalb des Rahmens (verschoben oder abgelehnt)

- **Auslagerung großer Texte in einen Paste-Cache.** Ein früherer Entwurf
  dieses Designs schlug vor, übergroßen Text zu hashen und in
  `~/.qwen/paste-cache/<sha>.txt` zu speichern und durch einen Platzhalter zu
  ersetzen. Wir haben dies nach einer Untersuchung der claude-code-Releases von
  2026-03 bis 2026-05 abgelehnt: Die Richtung upstream ist, Benutzereingaben für
  das Modell sichtbar zu halten und Kosten durch Prompt-Caching (1h-TTL-Knöpfe,
  Bildverkleinerung) zu amortisieren, anstatt sie auszulagern. Das Einfügen
  wörtlicher Benutzereingaben hinter einem Hash-Platzhalter birgt das Risiko von
  „Intent-Drift", sobald die Komprimierung den ursprünglichen Text beseitigt
  hat. Falls wir dies später erneut aufgreifen, ist das richtige Muster
  `read_paste(hash)` als echtes Werkzeug, das das Modell erreichen kann, nicht
  stilles Umschreiben.

## Aktueller Stand vs. Ziel

| Betreff                                          | qwen-code aktuell                                | claude-code Referenz                                                    | Ziel nach dieser Änderung                                           |
| ------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Bild/Dokument im Komprimierungsprompt            | Wird wörtlich gesendet                           | `stripImagesFromMessages` ersetzt mit `[image]` / `[document]`          | Wird als Platzhalter `[image: mime]` / `[document: mime]` gesendet |
| Token-Schätzung für binäre Teile                 | `JSON.stringify().length` (stark daneben)        | Wird als festes Budget behandelt                                        | Konfigurierbare Konstante (Standard 1.600 Token / ~6.400 Zeichen)   |
| Bildbereinigung bei Microcompact                 | Nicht berührt (nur Text-Tool-Ergebnisse werden im Leerlauf gelöscht) | Zeitbasiertes MC löscht alle            | Microcompact löscht auch veraltete Inline-Bilder zusammen mit Tool-Ergebnissen |

## Vorgeschlagene Änderungen

### Schicht 1: Komprimierungseingabe verschlanken (`services/compactionInputSlimming.ts`)

Ein neues reines Modul, das `Content[]` entgegennimmt und ein verschlanktes
`Content[]` zurückgibt. Eine Transformation: Entfernen von Inline-Medien.
Durchlaufe jeden `Part`. Wenn der Teil `inlineData` oder `fileData` enthält,
ersetze ihn durch einen `text`-Teil der Form `[image: image/png]` (oder
`[document: application/pdf]`).

qwen-code hängt von Werkzeugen zurückgegebene Medien an
`functionResponse.parts` an (eine Erweiterung über das standardmäßige
`@google/genai` `FunctionResponse`-Schema; siehe
`coreToolScheduler.createFunctionResponsePart`). Der Verschlanker
durchläuft dieses verschachtelte Array rekursiv, sodass auch ein Base64-Bild,
das von `read_file` oder einem MCP-Anhänge ausgebenden Werkzeug zurückgegeben
wurde, ersetzt wird.

Die Transformation gibt ein neues `Content[]`-Array zurück; das Original wird
niemals mutiert. Wenn die Transformation keine Änderungen erzeugt, wird die
ursprüngliche Array-Referenz zurückgegeben (identitätsgleich). Der Orchestrator
ruft `slimCompactionInput` als letzten Schritt vor `runSideQuery` in
`chatCompressionService.ts` auf.

### Schicht 2: Korrektur der Token-Schätzung (`chatCompressionService.ts`)

`findCompressSplitPoint` verwendet derzeit `JSON.stringify(content).length`
für die Zeichenzähl-Verteilung. Ersetze dies durch einen
`estimateContentChars`-Helfer, der:

- Für `text`-Teile: `text.length`
- Für `inlineData`- / `fileData`-Teile: `imageTokenEstimate * 4` (Standard
  1.600 × 4 = 6.400 Zeichen).
- Für `functionCall`- / `functionResponse`-Teile:
  `JSON.stringify(part).length` (unverändertes Verhalten).

Dies ist dieselbe Konstante, die das Verschlankungsmodul verwendet, sodass das
Budget, das der Split-Point-Algorithmus sieht, mit dem übereinstimmt, was der
verschlankte Prompt downstream tatsächlich verbraucht. Um doppelte Durchläufe
zu vermeiden, berechnet `compress()` die `charCounts` einmal vor und übergibt
sie an `findCompressSplitPoint` (neues optionales 4. Argument); dasselbe Array
wird für die `MIN_COMPRESSION_FRACTION`-Absicherung wiederverwendet.
### Layer 3: Microcompact-Bildbereinigung (`microcompaction/microcompact.ts`)

`collectCompactablePartRefs` gibt nun drei Gruppen zurück:

- `tool` — `functionResponse`-Teile von komprimierbaren integrierten Tools.
  Als Einheit gelöscht: Antwortausgabe durch den Sentinel ersetzt,
  `functionResponse.parts` zusammen mit ihr entfernt.
- `media` — oberste `inlineData` / `fileData`-Teile unter Benutzerrollen-
  Nachrichten (z. B. über `@reference` eingefügte Bilder). Ersetzt durch
  `[Old inline media cleared: <mime>]`.
- `nested-media` — `functionResponse`-Teile von **nicht komprimierbaren**
  Tools (z. B. MCP-Screenshot-Tools, deren Namen nicht in
  `COMPACTABLE_TOOLS` enthalten sind), die Bilder/Dokumente im
  Erweiterungsfeld `functionResponse.parts` enthalten. Nur die
  verschachtelten Medien werden entfernt; die Textausgabe des Tools bleibt
  erhalten.

Jede Art hat ihr eigenes `keepRecent`-Budget. Die Einstellung
`toolResultsNumToKeep: 1` behält die neueste jeder Kategorie
(1 Tool + 1 Medium + 1 nested-media), nicht 1 Eintrag insgesamt über die
kombinierte Liste.

mimeType-Werte, die von MCP-Tool-Servern bereitgestellt werden, werden durch
`sanitizeMimeForPlaceholder` geleitet, bevor sie in eine Platzhalterzeichenfolge
eingebettet werden. Der Slimmer und Microcompact teilen sich diese Hilfsfunktion.

### Layer 4: Konfiguration (`config/config.ts`)

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
Die Qwen-VL-Familie begrenzt auf 1.280 visuelle Tokens pro Bild ohne
`vl_high_resolution_images`; mit diesem Flag bis zu 16.384. 1.600 ist ein
konservativer Mittelwert, der leicht nach oben tendiert — eine Überschätzung
führt zu früherer Kompression (sicher), eine Unterschätzung führt zu später
Kompression (unsicher). Für Nicht-VL-Modelle (Qwen3-Coder, der qwen-code-
Standard) ist die Konstante nur für die Korrektheit der Tokenschätzung relevant,
da Bilder das Modell ohnehin nicht erreichen.

**Entscheidung 2: Die geschlankte Kopie entfernen, nicht den Live-Verlauf.**
`slimCompactionInput` gibt ein neues Array zurück; der in `GeminiChat`
gespeicherte Chat-Verlauf bleibt unberührt. Lokale Persistenz
(`.chats/<sessionId>.jsonl`) behält die vollständige Unterhaltung so, wie der
Benutzer sie erlebt hat, sodass `--resume` ohne Verlust funktioniert.

**Entscheidung 3: Microcompact behandelt Bilder einheitlich mit alten
Tool-Ergebnissen.** Der zeitbasierte Leerlauf-Trigger löscht bereits veraltete
Tool-Ausgaben; die Erweiterung auf Inline-Bilder hält die Richtlinie konsistent
und verwendet das vorhandene keepRecent-Fenster wieder.

**Entscheidung 4: Kein Paste-Store / keine Textexternalisierung.**
Siehe Abschnitt „Außerhalb des Rahmens“. Upstream-Konsens (claude-code 2026-03 →
2026-05) ist, die wörtliche Benutzereingabe sichtbar zu halten und über
Prompt-Caching zu amortisieren, nicht zu externalisieren.

## Betroffene Dateien

**Neue Dateien**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**Geänderte Dateien**

- `packages/core/src/config/config.ts` — erweitere `ChatCompressionSettings`
- `packages/core/src/services/chatCompressionService.ts` — rufe Slimming vor
  `runSideQuery` auf; ersetze Char-Count-Helfer; berechne charCounts einmal
  für Splitter + Guard
- `packages/core/src/services/chatCompressionService.test.ts` — füge einen
  Wire-Up-Test hinzu, der bestätigt, dass Base64 das Zusammenfassungsmodell
  nie erreicht
- `packages/core/src/services/microcompaction/microcompact.ts` — erweitere
  Sammlung auf Inline-Bilder
- `packages/core/src/services/microcompaction/microcompact.test.ts` —
  teste Bildbereinigung

## Rahmenbedingungen

**Im Rahmen**

- Entfernen von Inline-Medien aus dem Komprimierungseingang
- Korrektur der Zeichenschätzung von `findCompressSplitPoint`
- Microcompact-Bildteilbereinigung beim Leerlauf-Trigger
- Eine Einstellung + Umgebungsüberschreibung

**Zurückgestellt**

- Externalisierung großer Einfügungen (siehe Außerhalb des Rahmens oben)
- Wiederherstellungstool (`read_paste(hash)` usw.)
- Deduplizierung auf Persistenzebene
- `/context` Einfügungsaufschlüsselung
- Telemetrieereignisse für Schlankheitsstatistiken

## Offene Fragen

1. **Sollte der Platzhaltertext einen Hash enthalten, um eine zukünftige
   Wiederherstellung zu ermöglichen?** Heute geben wir nur
   `[image: image/png]` aus. Falls/sobald ein Tool im `read_paste`-Stil
   eingeführt wird, möchten wir möglicherweise eine ID. Vorerst ist der
   Platzhalter informativ; das ursprüngliche Bild existiert weiterhin im
   Live-Verlauf und in der Persistenz.
2. **Ist `imageTokenEstimate = 1600` für Nicht-Qwen-VL-Modelle korrekt, die
   über Anthropic / OpenAI-Proxys bereitgestellt werden?** Wahrscheinlich eine
   leichte Unterschätzung für Claude (wo Bilder bis zu ~5K Tokens sein können),
   aber harmlos: Es betrifft nur die Split-Point-Heuristik, niemals den
   tatsächlichen Prompt, den das benutzerseitige Modell sieht.
3. **Das `MIN_COMPRESSION_FRACTION`-Gate wird auf Basis der Zeichenanzahl vor
   dem Schlanken berechnet.** Ein bildlastiger Abschnitt kann die 5%-Schwelle
   überschreiten (da Bilder im Schätzer mit ~6.400 Zeichen zählen) und nach dem
   Schlanken auf `[image: …]`-Platzhalter schrumpfen. Das Zusammenfassungsmodell
   erhält dann fast keinen Textkontext. Dies ist vorerst beabsichtigt: Die
   Aufgabe der Zusammenfassung ist es, „Benutzer hat ein Bild von X geteilt“
   aufzuzeichnen, selbst wenn der Großteil des Abschnitts visuell war, und der
   Zweck des Gates ist „gibt es genug, um eine Zusammenfassung zu
   rechtfertigen“ — was Bilder vernünftigerweise erfüllen. Sollte die Qualität
   nachlassen, können wir nachbessern, indem wir entweder nach dem Schlanken
   erneut prüfen oder das Gate proportional zu `imagesStripped` gewichten.
