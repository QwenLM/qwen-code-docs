# Channel Delivery V1

## Ziel

Geplanten Tasks, Daemon-Prompts und einer direkten Notify-API erlauben, Text über den Channel-Worker, der den gewählten Workspace besitzt, an ein explizites IM-Ziel zu senden. Delivery ist sofortig und Best-Effort: Es gibt keine durable Outbox, kein Replay, keinen Retry und keinen globalen Final-Answer-Hook.

## Öffentlicher Vertrag

```ts
interface ChannelDelivery {
  kind: 'channel';
  target: {
    channelName: string;
    type: 'user' | 'chat';
    id: string;
  };
}
```

Die Erstellung geplanter Tasks und `POST /session/:id/prompt` akzeptieren ein optionales Top-Level-`delivery`. Direkte Benachrichtigung nutzt:

```http
POST /workspace/notify
POST /workspaces/:workspace/notify

{
  "text": "alert text",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

Der Daemon normalisiert das öffentliche Ziel an seiner Trust-Grenze zum internen Worker-Request `{ deliveryId, channelName, target: { type, id }, text }`. Text, der an einen Worker gesendet wird, muss nicht leer sein und wird vor dem IPC auf 100.000 UTF-16-Code-Units begrenzt. Prompt- und Scheduled-Reverse-Control dürfen einen leeren String nur tragen, um einen erfolgreichen Turn ohne zustellbare finale Antwort als `skipped` zu melden; dieser Pfad erreicht nie den Worker-IPC.

## Ausführungsgrenzen

Geplante Tasks und Prompt besitzen ihre Final-Answer-Semantik selbst. Eine Session erfasst Text nur, wenn der aktuelle Aufruf Delivery-Metadaten trägt. Jeder Modell-Send besitzt einen Response-Block: Non-Thought-Stream-Chunks werden innerhalb dieses Blocks verbunden, Nicht-Fortsetzungs-Retry oder Modell-Fallback verwirft ersetzte Chunks, und jeder Block, der ein Tool anfordert, ist intermediär und kann nicht zum Delivery-Payload werden. Eine spätere automatische Fortsetzung ersetzt den früheren terminalen Kandidaten. Nachdem der vollständige Turn einen erfolgreichen `end_turn` erreicht, reicht die Session exakt einen Reverse-Control-Request ein, der nur den letzten tool-freien Assistant-Response-Block enthält. Inter-Tool-Narration und alle früheren Response-Blöcke sind ausgeschlossen.

Ein erfolgreicher `end_turn` reicht den Reverse-Control-Request immer ein, auch wenn der finale Block leer ist oder nur Whitespace enthält. Der Daemon konsumiert zuerst die gepinnte Autorisierung, gibt `skipped` zurück, ohne einen Worker aufzulösen, und publiziert ein `channel_delivery_result`-Event. Abbruch, Agent-Fehler und Token-Limit-Terminierung reichen nichts ein. Leere Ausgabe ist daher von einem Turn unterscheidbar, der nie für Delivery berechtigt war.

Die Prompt-Admission bleibt `202`; der Agent-Abschluss bleibt `turn_complete` oder `turn_error`. Der Channel-Abschluss ist ein späteres `channel_delivery_result`-Event und wandelt nie einen Agent-Erfolg in `turn_error` um.

Notify umgeht Session und Agent. Es wartet auf einen Worker-Zustellversuch und mappt ungültige Eingabe auf 400, nicht verfügbare oder volle Worker auf 503, Timeout auf 504 und Adapter-Fehler auf 502. Ein Timeout hat einen unbekanntes Zustellergebnis und wird nicht erneut versucht.

Webhook bleibt ein unabhängiger asynchroner Pfad mit eigenem Secret und `202`-Worker-Admissions-Vertrag. Es darf die Sende-Primitive und Fehlerklassifizierung von `ChannelBase` wiederverwenden, aber nicht den Prompt/Notify-Kontrollfluss. Hintergrund-Benachrichtigungs-Prompts bleiben lokale Agent-Arbeit und senden nicht automatisch an IM.

## Workspace-Ownership

Der Daemon bindet den Workspace beim Konstruieren jeder ACP-Bridge. Die Prompt-Admission zeichnet die vom Daemon ausgestellte Delivery-ID und das gepinnte Ziel auf, während Scheduled-Delivery aus dem persistierten Task autorisiert wird. Der Kind-Callback muss zu dieser Autorisierung passen und kann `workspaceCwd` nicht wählen oder das Ziel ersetzen. Der Host-Callback konsumiert die Autorisierung, bevor er zwischen `skipped` und Worker-Zustellung entscheidet, sodass leere Finals keine Events fälschen oder einen One-Shot-/Monoton-Autorisierungszustand unverändert lassen können. Nicht-leerer Text wird nur zur Worker-Gruppe des kanonischen Workspaces geroutet. Fehlende, bootstrappende, drainende, gestoppte oder entfernte Owner liefern `channel_worker_unavailable` zurück; es gibt keinen Fallback auf die primäre Runtime und keinen Lazy-Worker-Start.

## Zuverlässigkeit und Privatsphäre

Die Autorisierung wird konsumiert, bevor die Worker-Verfügbarkeit geprüft wird, sodass ein transienter Worker-Aussetzer nach der Konsumption diese einzelne Zustellung dauerhaft verwirft; das ist konsistent mit dem sofortigen Best-Effort-Vertrag ohne Retry.

Dieses V1 hat keine Persistenz, kein Start-Replay, keinen historischen Scan, keinen Retry und keine Idempotenzgarantie. Bestehende Tasks ohne Delivery senden nie. Das bestehende Scheduler-Catch-up-Verhalten ist unverändert. Normale Ausführungen tragen Delivery nur, wenn der Task sie bereits enthält; der synthetische historische Missed-One-Shot-Batch löscht Delivery explizit, damit eine spätere Aktivierung von Channel keinen Burst alter Alerts erzeugen kann.

V1 beobachtet nur das Channel-Sende-Promise. Eine Ablehnung wird sanitisiert und auf `channel_delivery_failed` gemappt, außer Adaptern, die bereits eine typisierte permanente Disposition bereitstellen, die auf `channel_delivery_rejected` gemappt wird. Provider-spezifisches Response-Parsing und konsistente Fehlergrund-Semantik über IM-Adapter hinweg sind Folge-Arbeit; Daemon und Worker enthalten kein plattformspezifisches Fehler-Handling.

Delivery-Ergebnis-Events und -Logs enthalten Korrelations-IDs, Quelle, Status und sanitisierte Fehlerdaten. Sie enthalten nie Nachrichtentext, Ziel-IDs, Credentials oder Webhook-Secrets. `delivered` bedeutet, dass das Adapter-Sende-Promise resolved wurde; es behauptet nicht, dass der Provider die Nachricht akzeptiert hat oder dass ein Nutzer sie erhalten oder gelesen hat.

## Capability

Der Daemon kündigt `channel_delivery` an, wenn er die Verträge und Routen unterstützt. Das ist Protokollunterstützung, keine Live-Health-Behauptung für irgendeinen Worker oder Adapter.
