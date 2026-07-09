# Messung der Verarbeitung großer Pipe-Frames

## Zusammenfassung

Dieser PR ist ein Mess- und Designschritt für große `qwen serve` ACP-Pipe-Frames. Er ändert nichts an Pipe-Payloads, Frame-Limits, dem EventBus-Verhalten, dem SDK-Verhalten, öffentlichen Protokollfeldern, CLI-Flags, HTTP-Query-Parametern oder beworbenen Capabilities.

Das unmittelbare Ziel ist es, eine Low-Cardinality-Attribution für übergroße NDJSON-Pipe-Nachrichten zu sammeln, damit das nächste Sidecar-Design reale `pipe.message_bytes`-Verteilungen anstelle von geschätzten Schwellenwerten verwenden kann.

## Aktuelle Limits

Die ACP-Child-Pipe hat derzeit keine Byte-Begrenzung für einzelne Frames. Bestehende Daemon-Metriken erfassen `pipe.message_bytes` nur mit dem `direction`-Attribut, was absichtlich eine niedrige Kardinalität hat, aber nicht erklären kann, welche Payload-Familien große Frames verursachen.

SDK-SSE-Reader haben bereits eine separate 16-MiB-Pufferbegrenzung für die Auslieferung an Browser/Event-Streams. Diese Begrenzung begrenzt nicht die Frame-Größe der Daemon-to-Child-Pipe und erklärt auch nicht die Quellen der Pipe-Frames.

Das Bulk-Session-Replay hat derzeit ein Count-Limit von 10.000 Updates. Es gibt kein Byte-Limit, sodass eine begrenzte Anzahl großer Updates dennoch einen großen Response-Frame erzeugen kann.

## Aufbau der Messung

Der neue interne NDJSON-Observer empfängt `{ direction, bytes, message }`, nachdem eine Nachricht erfolgreich aus der Pipe gelesen oder in sie geschrieben wurde. Bestehende Byte-Hooks empfangen weiterhin nur `bytes`, wodurch der aktuelle Metrikpfad beibehalten wird.

Der Daemon erfasst für jeden Frame die bestehenden Pipe-Counts, Summen, Maxima, Histogramm-Metriken und Statusfelder. Die Attribution für große Frames läuft nur, wenn `bytes >= 256 * 1024`.

Large-Frame-Logs werden mit einem pro-Daemon-Prozess-Fenster von 50 Datensätzen pro 60 Sekunden gesampelt. Unterdrückte Sample-Counts werden dem nächsten aufgezeichneten Large-Frame-Log angehängt.

Die protokollierten Felder sind auf eine Attribution mit geringer Sensitivität beschränkt: direction, Byte-Größe, threshold, JSON-RPC message kind, method, source class, update count, summarized update count und strategy bei Erreichen des Limits, session update type, mixed-session-update marker, tool name, tool provenance, raw output kind, flache Text-Byte-Maxima für content und raw output, begrenzte approximative Nicht-String-raw-output-Bytes zuzüglich eines capped marker sowie rate-limit suppression counter. Payloads, session IDs, client IDs, Dateipfade, Prompts und rohe Tool-Outputs werden nicht protokolliert.

Das Histogramm bleibt low-cardinality und behält nur `direction`; Felder wie method, tool name, session update und source class werden nicht als Metrik-Attribute hinzugefügt.

## Quellklassen

Der Observer verwendet nur Quellklassen, die aus der Frame-Form abgeleitet werden können:

- `session_update_notification`: eine `session/update`-Notification mit `params.update`.
- `load_session_bulk_replay_response`: eine JSON-RPC-Response, die `_meta["qwen.session.loadReplay"]` enthält.
- `load_updates_response`: eine JSON-RPC-Response, die `result.updates` sowie Load-Update-Response-Marker enthält.
- `jsonrpc_request`: jede andere JSON-RPC-Request oder Notification mit einer method.
- `jsonrpc_response`: jede andere JSON-RPC-Response.
- `unknown`: alles andere.

Die Pipe-Ebene kann nicht zuverlässig zwischen Live- und replayed `session/update`-Frames unterscheiden, daher gibt diese Messung kein `live`- oder `replay`-Attributionsfeld aus.

## Sidecar-Kandidaten für die nächste Phase

Das wahrscheinliche Sidecar-Ziel sind große Tool-Outputs, die von `tool_call_update` transportiert werden, insbesondere Text in `content[]` und `rawOutput`. Eine spätere Implementierung sollte eine kleine Wire-Preview oder einen Stub im Update belassen, während der vollständige Body in einem vom Daemon verwalteten Sidecar abgelegt wird.

Metadaten sollten über `_meta` übertragen werden, damit ältere Clients sie ignorieren und neuere Clients sich für das Auflösen von Sidecar-Inhalten entscheiden können. Der Sidecar-Vertrag sollte vor der Implementierung den Lifecycle, die Zugriffskontrolle, das Cleanup, Byte-Schwellenwerte, das Fallback-Verhalten und die Client-UX definieren.

Bulk-Replay und `qwen/session/loadUpdates` benötigen eine separate Behandlung, da eine Response durch viele mittlere Updates oder wenige große Updates groß sein kann. Die Messfelder umfassen `updateCount`, `summarizedUpdateCount`, `summarizedUpdateStrategy`, `maxContentTextBytes`, `maxRawOutputTextBytes`, `maxRawOutputApproxBytes` und `maxRawOutputApproxBytesCapped`, um diese Fälle zu trennen, ohne unbegrenzte Update-Arrays zu durchlaufen oder große Nicht-String-Raw-Outputs zu materialisieren. Wenn Update-Arrays das Summary-Budget überschreiten, werden die Max-Felder aus einer deterministischen Prefix-plus-Suffix-Stichprobe berechnet und nicht aus einem vollständigen Scan.

## Nicht-Ziele

Dieser PR implementiert keine Sidecar-Speicherung, Temp-File-Übertragung, Frame-Caps, Replay-Ring-Byte-Caps, Compaction-Trimming, EventBus-Byte-Caps oder ACP-HTTP-Binding-Puffer-Byte-Caps.

Dieser PR fügt keinen `?maxFrameBytes`- oder `?maxQueuedBytes`-Query-Parameter, kein CLI-Flag, keine SDK-Option und keine Capability hinzu. Das Daemon-Speicher- und Transport-Budget sollte nicht von beliebigen Clients erhöht werden können.

Dieser PR ändert keine öffentlichen Event-Schemas. Jedes zukünftige Sidecar-Protokoll muss additiv sein und separat geprüft werden.