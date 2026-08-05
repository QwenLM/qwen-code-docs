# Workspace-qualifiziertes Voice

## Ziel

Die bestehenden Daemon-Voice-Settings-, Batch-Transkriptions- und
Streaming-Transkriptions-Oberflächen für jede vertrauenswürdige
Workspace-Runtime exponieren, ohne die Legacy-Primary-only-Routen zu ändern.

## Design

`GET`/`POST /workspaces/:workspace/voice`,
`POST /workspaces/:workspace/voice/transcribe` und
`WS /workspaces/:workspace/voice/stream` lösen eine registrierte
vertrauenswürdige Runtime per Id oder kodiertem cwd auf. Sie verwenden das
cwd, die effektive Umgebung, die Bridge und die Workspace-Settings dieser
Runtime. Voice-Setting-Writes über Plural-REST verwenden immer den
Workspace-Scope; sekundäre ACP-Voice-Writes verwenden denselben Scope, damit
sie geteilte User-Settings nicht mutieren können.

Ein prozess-scoped `WorkspaceVoiceCoordinator` besitzt das bestehende Limit
von acht aktiven Voice-Operationen. Er berücksichtigt sowohl WebSocket- als
auch REST-Batch-Arbeit über Legacy- und Workspace-qualifizierte Pfade. Ein
Entfernungs-Drain lehnt neue Admission ab, lässt aber bestehende Voice-Arbeit
im Nicht-erzwungen-Entfernungs-Aktivitäts-Snapshot sichtbar. Die
Runtime-Entsorgung bricht nur die Voice-Leases der gewählten Runtime ab,
bevor ihre Bridge heruntergefahren wird.

## Kompatibilität

Legacy `/workspace/voice`, `/workspace/voice/transcribe` und `/voice/stream`
bleiben an den primären Workspace gebunden. ACP-Methodennamen und
Voice-Settings-Schema sind unverändert. `workspace_qualified_voice` bewirbt
alle qualifizierten Voice-Modalitäten, wenn der geteilte ACP/Voice-WebSocket-Listener
aktiviert ist. Die bestehenden Voice-Modalitäts-Capability-Tags bleiben
Primär-Workspace-Signale und sind keine Voraussetzungen für eine sekundäre
Runtime, deren Konfiguration von der gewählten Route validiert wird.

Unbekannte Workspace-Selectors geben `400 workspace_mismatch` zurück;
registrierte, aber nicht vertrauenswürdige Runtimes geben
`403 untrusted_workspace` zurück, bevor Voice-Settings oder Audio gelesen
werden. Die geteilte Acht-Operationen-Admission-Obergrenze deckt Batch- und
Streaming-Arbeit für sowohl Legacy- als auch Plural-Routen ab.
Batch-Kapazitätsfehler geben `503 voice_capacity_exceeded` mit
`Retry-After: 5` zurück; Streaming-Kapazitätsfehler senden einen Error-Frame
und schließen mit Code `1013`.
