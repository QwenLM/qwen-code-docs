# Qwen-Code Daemon Session Artifacts API – Umsetzbares Design

> Eingabematerial: Erster Entwurf der Session-Artifacts-Daemon-API und Entwurf des Artifact-Designs v1.
>
> Quellcode-Baseline: Aktueller qwen-code-Quellcode.  
> Ziel: Basierend auf den bestehenden Daemon / ACP / SSE / SDK / Hooks / Extension-Fähigkeiten eine umsetzbare, überprüfbare und klar abgegrenzte Session-Artifacts-API zu entwerfen.

## 1. Designentscheidungen

Es wird empfohlen, ein Artifact wie folgt zu definieren:

> **Strukturierte Artefaktreferenzen, die in einer Session explizit registriert werden und vom Benutzer wiederverwendet, angeklickt, in der Vorschau angezeigt, heruntergeladen oder geteilt werden können. Normale Quellcodeänderungen sind keine Artifacts; Quellcodeänderungen gehören zur File-Change-/Diff-/Patch-History.**

Diese Definition umfasst sowohl Dateien als auch Nicht-Datei-URLs. Entscheidend ist nicht, ob es sich um eine physische Datei handelt, sondern ob sie vom System explizit als "Artefakt" deklariert wird. Das Artifacts-Panel sollte Session-Outputs anzeigen und nicht alles, was ein Agent berührt hat.

Die empfohlenen vollständigen Fähigkeiten für V1 umfassen:

- Capability: `session_artifacts`
- Artifact-Snapshot-API: `GET /session/:id/artifacts`
- Artifact-Changed-Event: `artifact_changed`
- Tool-Result-Metadaten: `ToolResult.artifacts?: ToolArtifact[]`
- Strukturierte Artifact-Metadaten für ArtifactTool
- Bridge-In-Memory-Index: `SessionArtifactStore`
- SDK-Methoden: `DaemonClient.listSessionArtifacts()`, `DaemonSessionClient.artifacts()`
- Leichtgewichtiges Tool, das von Modell/Skill/Agent aufgerufen werden kann: `record_artifact`
- Hook-Output-Artifacts: `hookSpecificOutput.artifacts`
- Client-Manual-Inject-API: `POST /session/:id/artifacts`
- Client-Explicit-Remove-API: `DELETE /session/:id/artifacts/:artifactId`
- SDK-Methode: `DaemonSessionClient.addArtifact()`
- SDK-Methode: `DaemonSessionClient.removeArtifact()`
- Referenzmodell für Managed/Published Storage

Um V1 kontrollierbar zu halten, wird für V1 Folgendes nicht empfohlen:

- Workspace-Scanning
- Automatisches Überführen von normalen `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` in Artifacts
- Automatische Extraktion von normalen Text-URLs
- Automatische Extraktion von Pfaden/URLs aus der Shell-Stdout
- Rückgabe von Artifact-Inhalten
- Artifact-Versionshistorie
- Persistente Wiederherstellung von Artifacts
- Datenbank/OSS/Dynamische Iframe-Sandbox

## 2. Zählen Links als Artifacts?

### 2.1 Fazit

**Ja, aber es müssen "deklarative Link-Artifacts" sein.**

Diese sollten beispielsweise als Artifact zählen:

- Vom Skill anhand der Ressourcen-ID zusammengesetzte URLs für interne Datenplattform-Tabellendetails.
- Vom Agent anhand der Ressourcen-ID zusammengesetzte URLs für Task-Detailseiten, Monitoring-Seiten, Trace-Seiten und Lineage-Seiten.
- Vom MCP-Tool zurückgegebene Dashboard-/Notebook-/Report-URLs.
- HTML-URLs, die nach der Veröffentlichung durch das ArtifactTool generiert werden.
- URLs, die vom Benutzer oder Client explizit zum Session-Artefaktbereich hinzugefügt werden.

Diese sollten standardmäßig nicht als Artifact zählen:

- Beliebige Markdown-Links in normalen Assistant-Antworten.
- Von `web_fetch` gelesene Webseiten-URLs.
- Zufällig in der grep/shell-Ausgabe erscheinende URLs.
- Zitate, Dokumentenlinks, Referenzlinks.

Kernkriterien:

| Typ | Wird zu Artifacts hinzugefügt | Grund |
| ------------------------------- | -----------------: | ---------------------------------------- |
| Normale Quellcodebearbeitung |                 Nein | Gehört zu File-Change/Diff, ist kein wiederverwendbares Artefakt |
| Explizit registrierte generierte Workspace-Dateien |                 Ja | Wiederverwendbare Outputs wie Report/HTML/PDF/Image |
| Vom ArtifactTool veröffentlichte HTML-URL |                 Ja | Explizit vom Tool veröffentlicht |
| Vom Skill nach Regeln zusammengesetzte Business-Detail-URL | Ja, muss aber explizit registriert werden | Benutzer benötigt dauerhaft klickbare Elemente auf der rechten Seite |
| Normale Referenzlinks in Assistant-Antworten |                 Nein | Hohes Rauschen, anfällig für Fehlalarme |
| In der Shell-Stdout erscheinende URLs |                 Nein | Unzuverlässige Semantik |
| Von `web_fetch` angeforderte URLs |                 Nein | Dies ist Input/Quelle, kein Artefakt |

### 2.2 Produktsemantik von Link-Artifacts

Ein Link-Artifact ist nicht "Webseiteninhalt", sondern ein "Ressourceneinstiegspunkt". Es sollte im Artefaktbereich auf der rechten Seite als anklickbarer Eintrag dargestellt werden:

- Titel: `用户画像资源详情`
- Untertitel: `internal data platform / prod`
- Typ: `link`
- URL-Host: `platform.example.com`
- Quelle: `ToolResult.artifacts` / `ArtifactTool` / `record_artifact` / hook / client

Der Client öffnet die URL beim Klicken; der Daemon liest, validiert oder prerendert die URL nicht.

## 3. Aktuelle Code-Baseline

### 3.1 Daemon-REST und Capability

Relevanter Quellcode:

- `packages/cli/src/serve/server.ts`
- `packages/cli/src/serve/capabilities.ts`
- `docs/developers/qwen-serve-protocol.md`

Aktueller Stand:

- `/capabilities` gibt `features` zurück, der Client muss die UI basierend auf dem Feature-Gate steuern.
- Schreibgeschützte Status-Schnittstellen auf Session-Ebene verwenden den REST-Stil:
  - `GET /session/:id/status`
  - `GET /session/:id/context`
  - `GET /session/:id/tasks`
  - `GET /session/:id/events`
- Capabilities werden in `SERVE_CAPABILITY_REGISTRY` registriert.

Design:

- Neues Feature: `session_artifacts`
- Neue Route: `GET /session/:id/artifacts`
- Neue Mutation-Route für manuelles Injizieren: `POST /session/:id/artifacts`

### 3.2 Session-EventBus

Relevanter Quellcode:

- `packages/acp-bridge/src/eventBus.ts`
- `packages/acp-bridge/src/bridge.ts`
- `packages/acp-bridge/src/bridgeClient.ts`
- `packages/sdk-typescript/src/daemon/events.ts`

Aktueller Stand:

- Jede Live-Session hat einen eigenen `EventBus`.
- Der EventBus unterstützt ID, bounded replay ring, `Last-Event-ID` und Backpressure.
- Das SDK verwaltet die Known-Event-Liste.

Design:

- Echtzeit-Updates für Artifacts nutzen das bestehende `/session/:id/events`.
- Neuer Event-Typ: `artifact_changed`
- Beim ersten Betreten verwendet der Client einen Snapshot, danach inkrementelle Events; nach einem Verbindungsabbruch wird der Snapshot erneut abgerufen.

### 3.3 Tool-Result und ArtifactTool

Relevanter Quellcode:

- `packages/core/src/tools/tools.ts`
- `packages/core/src/tools/tool-names.ts`
- `packages/core/src/tools/artifact/artifact-tool.ts`
- `packages/cli/src/acp-integration/session/Session.ts`
- `packages/cli/src/acp-integration/session/emitters/tool-call-emitter.ts`

Aktueller Stand:

- `ToolResult` enthält derzeit `llmContent`, `returnDisplay`, `resultFilePaths?`, `error?`.
- Das `ArtifactTool` kann bereits HTML veröffentlichen und URLs zurückgeben, verfügt aber nicht über strukturierte Artifact-Metadaten.
- Das `_meta` von `ToolCallEmitter.emitResult()` verfügt bereits über Erweiterungsslots.

Design:

- Hinzufügen von `ToolResult.artifacts?: ToolArtifact[]`.
- Bei Erfolg füllt das `ArtifactTool` `artifacts`.
- `ToolCallEmitter.emitResult()` platziert Artifacts in `_meta.artifacts`.
- Der BridgeClient konsumiert `_meta.artifacts` und schreibt in den Session-Artifact-Store.

### 3.4 Aktueller Stand von Hooks / Extensions / Plugins

Relevanter Quellcode:

- `packages/core/src/hooks/types.ts`
- `packages/core/src/core/toolHookTriggers.ts`
- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/sessionHooksManager.ts`
- `packages/core/src/hooks/registerSkillHooks.ts`
- `packages/core/src/extension/extensionManager.ts`
- `docs/developers/channel-plugins.md`

Derzeit vorhandene Fähigkeiten:

- Hook-Events umfassen `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SessionStart`, `Stop`, `SubagentStart`, `SubagentStop` usw.
- Hook-Typen umfassen Command, HTTP, Function und Prompt.
- Die Stdout von Command-Hooks unterstützt `HookOutput` im JSON-Format.
- Die Response von HTTP-Hooks unterstützt `HookOutput` im JSON-Format.
- Session-Hooks können zur Laufzeit über den `SessionHooksManager` registriert werden.
- Das Skill-Frontmatter kann session-scoped Command-/HTTP-Hooks registrieren.
- Extensions können Commands, Skills, Hooks, MCP-Server und Channels bereitstellen.
- Channel-Plugins dienen hauptsächlich der Anpassung an Messaging-Plattformen, können Tool-Calls/Response-Chunks beobachten, sind aber kein Kanal für die Daemon-Artifact-Injektion.

Derzeitige Lücken:

- Der Hook-Output enthält nur allgemeine Felder wie `additionalContext`, `decision`, `stopReason` usw.
- Derzeit gibt es kein standardisiertes `hookSpecificOutput.artifacts`.
- Der Daemon verfügt derzeit nur über die Status-Schnittstellen `GET /workspace/hooks` und `GET /session/:id/hooks`, aber über keine Route für die "aktive Artifact-Injektion durch Hooks".

Fazit:

- Hooks/Extensions sind hervorragende Einstiegspunkte für benutzerdefinierte Artifacts, erfordern jedoch eine Erweiterung des Hook-Output-Schemas.
- Channel-Plugins werden nicht als Hauptkanal für die Artifact-Injektion empfohlen; sie eignen sich für die Darstellung auf externen Chat-Plattformen, nicht für die Pflege des Daemon-Session-Artifact-Index.

## 4. API-Design

### 4.1 Capability

Neu hinzugefügt:

```json
"session_artifacts"
```

Der Client zeigt das Artifacts-Panel und ruft die entsprechenden APIs nur auf, wenn er dieses Feature sieht.

### 4.2 List Artifacts

```http
GET /session/:id/artifacts
```

Response:

```json
{
  "v": 1,
  "sessionId": "session-123",
  "artifacts": [
    {
      "id": "a1b2c3d4e5f6",
      "kind": "link",
      "storage": "external_url",
      "title": "用户画像资源详情",
      "description": "内部数据平台资源详情页",
      "url": "https://platform.example.com/resources/user-profile",
      "mimeType": "text/html",
      "status": "available",
      "source": "tool",
      "toolCallId": "call_abc",
      "toolName": "artifact",
      "createdAt": "2026-06-26T10:00:00.000Z",
      "updatedAt": "2026-06-26T10:00:00.000Z",
      "metadata": {
        "resourceType": "data_platform_resource",
        "env": "prod"
      }
    }
  ]
}
```

### 4.3 Artifact-Changed-Event

Über bestehendes:

```http
GET /session/:id/events
```

Neues Event:

```json
{
  "v": 1,
  "type": "artifact_changed",
  "data": {
    "sessionId": "session-123",
    "change": {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "用户画像资源详情",
        "description": "内部数据平台资源详情页",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "status": "available",
        "source": "tool",
        "toolCallId": "call_abc",
        "toolName": "artifact",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "data_platform_resource",
          "env": "prod"
        }
      }
    }
  }
}
```

`change.action`:

- `created`
- `updated`
- `removed`

V1 erzeugt hauptsächlich `created` / `updated`; `removed` wird bei Eviction oder explizitem Löschen erzeugt.

`artifact_changed.data.change.artifact` enthält bei `created` / `updated` / `removed` das vollständige `DaemonSessionArtifact`, dessen Shape mit einem einzelnen Element in `GET /session/:id/artifacts` übereinstimmt; das `removed`-Event enthält das letzte vollständige Artifact vor dem Löschen. `removed` muss einen `reason` enthalten, der in V1 die Werte `eviction` oder `explicit` annimmt. Auf diese Weise kann die Echtzeit-UI das Event direkt anwenden, ohne nach jedem Event ein GET ausführen zu müssen. Wenn der Client die Verbindung verliert, Events verliert oder einen unbekannten Event-Typ empfängt, wird `GET /session/:id/artifacts` für einen Snapshot-Sync verwendet.

### 4.4 Client-Manual-Insert

Als expliziter Registrierungseinstiegspunkt für den Client in V1:

```http
POST /session/:id/artifacts
```

Verwendungszweck:

- Manuelles Hinzufügen benutzerdefinierter Link-Artifacts durch WebUI/IDE/externe Clients.
- Erweiterungs- oder Integrationsebenen fügen Ressourcen in das Artefaktpanel auf der rechten Seite ein, ohne dass ein Modell-Tool-Aufruf erforderlich ist.

Request:

```json
{
  "kind": "link",
  "storage": "external_url",
  "title": "任务详情",
  "description": "调度任务 task_123 的详情页",
  "url": "https://ops.example.com/tasks/task_123",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "scheduler_task"
  }
}
```

Response:

```json
{
  "v": 1,
  "sessionId": "session-123",
  "changes": [
    {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "任务详情",
        "description": "调度任务 task_123 的详情页",
        "url": "https://ops.example.com/tasks/task_123",
        "mimeType": "text/html",
        "status": "available",
        "source": "client",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    }
  ]
}
```

Jedes Element in `changes` muss synchron als ein `artifact_changed`-SSE-Event veröffentlicht werden. Auf diese Weise erhält der Client auch dann das vollständige Inkrement für `created`/`updated` und `removed`, wenn ein einzelner POST ein Upsert und eine Eviction auslöst. Wenn innerhalb derselben Mutation mehrere Eingaben auf dieselbe Identität normalisiert werden, kann in `changes` nur eine einzige endgültige Änderung erzeugt werden. Die Reihenfolge der Event-Veröffentlichung ist eine Protokollvorgabe: Zuerst werden `created` / `updated` in der Reihenfolge von `changes[]` veröffentlicht, danach `removed`, um zu verhindern, dass das lokale Abbild des Client kurzzeitig in einen Zustand gerät, der auf dem Server nie existiert hat.

Fehler-Response:

```json
{
  "v": 1,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "url must use http or https",
    "field": "url"
  }
}
```

Statuscodes:

- `400 VALIDATION_FAILED`: Feldvalidierung fehlgeschlagen, z. B. mehrere Primary-Locators, nicht unterstütztes URL-Schema, Metadaten überschritten.
- `401 UNAUTHORIZED` / `403 FORBIDDEN`: Mutation-Gate oder Bearer-Token-Validierung fehlgeschlagen.
- `404 SESSION_NOT_FOUND`: Session existiert nicht.

### 4.5 Client-Delete

Als expliziter Entfernungseinstiegspunkt in V1:

```http
DELETE /session/:id/artifacts/:artifactId
```

Semantik:

- Entfernt das Artifact nur aus dem aktuellen Live-Session-Artifact-Store.
- Löscht keine Workspace-Dateien, Managed-Dateien oder Remote-URLs.
- Gibt bei Erfolg `DaemonSessionArtifactMutationResult` zurück, das eine Änderung mit `action: 'removed'` und `reason: 'explicit'` enthält.
- Wenn das Artifact nicht existiert, wird DELETE dennoch als idempotenter Erfolg behandelt, gibt `200` und leere `changes: []` zurück und veröffentlicht kein SSE-Event.
- Veröffentlicht synchron das entsprechende `artifact_changed`-SSE-Event.

Fehler-Responses verwenden das Envelope aus Abschnitt 4.4; wenn die Session nicht existiert, wird weiterhin `404 SESSION_NOT_FOUND` zurückgegeben.

Sicherheit:

- Dies ist eine Mutation-Route und sollte das bestehende Mutation-Gate verwenden.
- Remote-Client-Aufrufe sind nur erlaubt, wenn der Daemon ein Bearer-Token verwendet.
- Liest die URL nicht.
- Öffnet die URL nicht automatisch.

### 4.6 V1-Veröffentlichungsumfang und Kompatibilität

Nach dem Merge sollte V1 als vollständige Session-Artifact-Management-Funktion zur Testversion veröffentlicht werden und nicht nur als unvollständige Schnittstelle. Der minimale geschlossene Kreis für die vollständige Funktionalität ist:

- Der Client erkennt die Funktion über die `session_artifacts`-Capability.
- Der Daemon stellt den `GET /session/:id/artifacts`-Snapshot bereit.
- Der Daemon veröffentlicht `artifact_changed`-Inkremente über den bestehenden Events-Stream.
- Alle vier Einstiegspunkte – `ArtifactTool` / `ToolResult.artifacts`, `record_artifact`, Hook-Artifacts und Client-POST – fließen in denselben Store.
- Client-DELETE kann falsch registrierte Artifacts explizit aus dem Live-Store entfernen.
- Der Store führt einheitlich Validierung, Normalisierung, Identitäts-De-Duplizierung und Soft-Reservation-Eviction durch.
- Das SDK kann `list`/`add`/`remove` ausführen und das `artifact_changed`-Event erkennen.

Es wird empfohlen, dies zunächst als experimentelle, capability-gated Testversion zu veröffentlichen. Experimental bedeutet hier, dass Implementierung und UI weiter verfeinert werden können, nicht jedoch, dass das Protokoll beliebig gebrochen werden darf: Felder und Event-Semantiken, die bereits dem Client offengelegt wurden, müssen gemäß den folgenden Kompatibilitätsregeln weiterentwickelt werden.

Nicht-breaking Folgeerweiterungen:

- Hinzufügen optionaler Felder zum Response-Artifact.
- Hinzufügen neuer `kind` / `status` / `source` / `storage`-Literale, wobei das typisierte SDK diese Felder als Open Union deklarieren muss und der Client unbekannte Werte tolerieren muss: Unbekannte `kind` werden als `other` behandelt, unbekannter `status` wird als Unknown-Status angezeigt und blockiert die Listenanzeige nicht, unbekannte `source` werden als nicht gruppierte Quelle behandelt, unbekannter `storage` wird nur konservativ über verfügbare `url` / `workspacePath` angezeigt.
- Hinzufügen neuer Routen, z. B. `GET /session/:id/artifacts/:artifactId`, Preview-Route, Pin-Route.
- Hinzufügen neuer Event-Typen, wobei die bestehende `artifact_changed`-Semantik unverändert bleibt.
- Hinzufügen neuer Capabilities, z. B. `session_artifacts_preview`, `session_artifacts_persistence`.
- Anpassung der internen Standardwerte für Soft-Reservation, solange das Gesamtlimit und die Semantik des Eviction-Events bestehende Clients nicht beeinträchtigen.

Breaking-Änderungen, die eine neue Capability oder eine neue Version erfordern:

- Änderung der Identitätsregeln, die dazu führt, dass sich die Artifact-ID für dieselbe URL/denselben Pfad ändert.
- Änderung bestehender optionaler Felder in Pflichtfelder.
- Löschen oder Umbenennen bestehender Felder.
- Änderung der Semantik von `created` / `updated` / `removed` in `artifact_changed.data.change.action`.
- Änderung der Envelope-Shape von `GET /session/:id/artifacts`.
- Standardmäßiges Hinzufügen normaler Assistant-Textlinks oder normaler Dateibearbeitungen zur Artifact-Liste.

## 5. Datenmodell

### 5.1 Public SDK-Typen

```ts
type OpenStringUnion<T extends string> = T | (string & {});

export type DaemonSessionArtifactKind = OpenStringUnion<
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other'
>;

export type DaemonSessionArtifactStatus = OpenStringUnion<
  'available' | 'missing'
>;

export type DaemonSessionArtifactSource = OpenStringUnion<
  'tool' | 'hook' | 'client'
>;

export type DaemonSessionArtifactStorage = OpenStringUnion<
  'workspace' | 'managed' | 'external_url' | 'published'
>;

export interface DaemonSessionArtifact {
  id: string;
  kind: DaemonSessionArtifactKind;
  storage: DaemonSessionArtifactStorage;
  title: string;
  description?: string;
  status: DaemonSessionArtifactStatus;
  source: DaemonSessionArtifactSource;
  createdAt: string;
  updatedAt: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DaemonSessionArtifactsEnvelope {
  v: 1;
  sessionId: string;
  artifacts: DaemonSessionArtifact[];
}

export interface DaemonArtifactChangedData {
  sessionId: string;
  change: DaemonSessionArtifactChange;
}

export interface DaemonSessionArtifactChange {
  action: 'created' | 'updated' | 'removed';
  artifactId: string;
  artifact?: DaemonSessionArtifact;
  reason?: 'eviction' | 'explicit';
}

export interface DaemonSessionArtifactMutationResult {
  v: 1;
  sessionId: string;
  changes: DaemonSessionArtifactChange[];
}
```

### 5.2 Core ToolArtifact-Typen

```ts
export type ToolArtifactKind =
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other';

export type ToolArtifactStorage =
  | 'workspace'
  | 'managed'
  | 'external_url'
  | 'published';

export interface ToolArtifact {
  kind?: ToolArtifactKind;
  storage?: ToolArtifactStorage;
  title: string;
  description?: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

Die Menge der bekannten Literale für `ToolArtifactKind` / `ToolArtifactStorage` muss eine einzige Implementierungsquelle haben, um manuelle Abweichungen (Drift) in core, acp-bridge und SDK zu vermeiden. Empfohlene Vorgehensweise:

- Definiere in core die Const-Tupel `TOOL_ARTIFACT_KINDS` / `TOOL_ARTIFACT_STORAGES` und exportiere `ToolArtifactKind` / `ToolArtifactStorage`.
- acp-bridge verwendet die core-Typen als bekannte Menge für die Eingabevalidierung und deklariert die öffentlichen Daemon-Typen als Protokollprojektion derselben Wertemenge.
- Das SDK schreibt keine zweite Kopie der bekannten Union. Stattdessen werden die bekannten Literale über die von acp-bridge exportierten Protokolltypen oder zur Build-Zeit generierte `.d.ts`-Re-Exports bereitgestellt. Anschließend wird eine offene Union um die Response-Typen gelegt, um zukünftige neue Werte des Daemons zu tolerieren.
- Füge einen Round-trip-Test für kind/storage hinzu, um sicherzustellen, dass die bekannten Literale konsistent zwischen Core-Eingabe, Bridge-Store und SDK-Ausgabe hin- und hergereicht werden. Füge zusätzlich einen SDK-Fallback-Test für unbekannte Werte hinzu, um die Laufzeittoleranz der offenen Union zu gewährleisten.

Erweitert um:

```ts
export interface ToolResult {
  llmContent: unknown;
  returnDisplay: unknown;
  resultFilePaths?: string[];
  artifacts?: ToolArtifact[];
  error?: unknown;
}
```

### 5.3 Vervollständigungsregeln: Input zu Public Artifact

`ToolArtifact` ist die Eingabeform, die von Tools zurückgegeben wird. `SessionArtifactInput` ist die einheitliche interne Eingabeform für alle Eingänge, bevor sie den Store erreichen. `DaemonSessionArtifact` ist die Form für die externe Rückgabe. Alle Eingänge müssen zuerst in `SessionArtifactInput` umgewandelt werden, bevor `SessionArtifactStore` die öffentlichen Felder vervollständigt.

```ts
export interface SessionArtifactInput extends ToolArtifact {
  source: 'tool' | 'hook' | 'client';
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  trustedPublisher?: true;
  receivedSeq?: number;
}
```

`trustedPublisher` ist ein internes Eingabe-Flag für Bridge/Store und kein Feld, das im öffentlichen Schema oder von Client/Hook gesetzt werden kann. In V1 Daemon/ACP-Deployments wird der `qwen --acp`-Subprozess vom Daemon gestartet und läuft unter demselben Benutzer. Daher betrachtet die aktuelle Implementierung das abgeschlossene `ArtifactTool`-Session-Update (`tool_call_update`, `status: 'completed'`, `_meta.toolName: 'artifact'`) als das einzige `trustedPublisher`-Signal. Dieses Signal wird nicht aus dem Artifact-Payload selbst gelesen und ist auch nicht für Client-POSTs, Hook-Benachrichtigungen, `record_artifact` oder andere Tool-Ergebnisse verfügbar.

Wenn in Zukunft Remote-Sandboxes, mehrere ACP-Teilnehmer oder Agents außerhalb der Vertrauensdomäne unterstützt werden, sollte eine nicht fälschbare Transport-/In-Process-Publisher-Identität hinzugefügt werden, um dieses V1-Vertrauenssignal zu ersetzen. Bis dahin dürfen `trustedPublisher` / `source` / `storage` im Payload nicht als Autorisierungsgrundlage verwendet werden.

Regeln für die Quellenumwandlung:

- `ArtifactTool` / Daemon-Publisher: Der BridgeClient ergänzt nur beim abgeschlossenen `ArtifactTool`-Session-Update `source: 'tool'`, `toolCallId` und `toolName` und setzt `trustedPublisher: true` über eine interne Option.
- Andere `ToolResult.artifacts`: Kopiere die `ToolArtifact`-Felder und ergänze `source: 'tool'`, `toolCallId` und `toolName`, setze aber nicht `trustedPublisher`.
- `record_artifact`: Geht als Tool-Quelle ein, ergänzt ebenfalls `source: 'tool'`, `toolCallId` und `toolName: 'record_artifact'`, erlaubt aber kein `storage: 'published'` und kann `trustedPublisher` nicht setzen.
- Hook: Kopiere die Hook-Output-Artefakte und ergänze `source: 'hook'`, `hookName` und `extensionId`. Wenn der Hook den auslösenden Tool-Kontext abrufen kann, können auch `toolCallId` / `toolName` ergänzt werden. Die Bridge muss `source: 'hook'` aus dem Transportkontext ableiten und darf dem `source`-Feld im Payload nicht vertrauen.
- Client-POST: Kopiere den Body und ergänze `source: 'client'` und `clientId`. Erlaube kein `storage: 'published'` und setze nicht `trustedPublisher`.
- `receivedSeq`: Wird von Bridge/Store beim Empfang der Eingabe als monoton steigender Wert zugewiesen, um eine deterministische Reihenfolge innerhalb desselben Batches zu gewährleisten. Externe Eingaben können dieses Feld nicht angeben.
- Der BridgeClient darf `trustedPublisher` nicht aus `source`, `storage`, `managedId`, `url`, `trustedPublisher` oder anderen `_meta.artifacts[*]`-Feldern im Artifact-Payload ableiten. Die einzige V1-Ausnahme ist das oben genannte Signal für das abgeschlossene `ArtifactTool`-Session-Update.

Vervollständigungsregeln:

- `id`: Wird durch den Identity-Hash aus Abschnitt 7 generiert.
- `source`: Wird durch den Eingangskontext bestimmt. Tool-Result / ArtifactTool ist `tool`, Hook ist `hook`, Client-POST ist `client`.
- `toolCallId` / `toolName`: Wird aus dem Tool-Call-Kontext ergänzt. Fehlt dieser bei Hook-/Client-Eingängen, bleibt das Feld leer.
- `hookName` / `extensionId` / `clientId`: Wird bei vorhandenem Kontext ergänzt und dient der Auditierung und UI-Gruppierung.
- `createdAt`: Wird beim ersten Upsert geschrieben.
- `updatedAt`: Wird bei jedem Upsert aktualisiert.
- `status`: Führt beim Upsert von Workspace-Artefakten einen Best-Effort-Stat durch. Ist die Datei vorhanden und der Containment-Check erfolgreich, ist der Status `available`. Ist sie nicht vorhanden oder liegt ein Symlink-Escape vor, ist er `missing`. Bei Managed-/URL-Artefakten wird in V1 kein lokaler Stat durchgeführt, der Status ist immer `available`.
- `storage`-Standardwerte:
  - Ist `workspacePath` vorhanden, ist es `workspace`.
  - Bei `storage: 'published'` muss es von einem `trustedPublisher` stammen, andernfalls schlägt die Validierung fehl.
  - Ist `managedId` vorhanden und keine `url`, ist es `managed`.
  - Ist `url` vorhanden, ist es `external_url`.
  - `ArtifactTool`-Veröffentlichungsergebnisse verwenden explizit `published`.
- `kind`-Standardwerte:
  - Bei `storage: 'published'` und ohne explizites `kind` ist es `html`.
  - Ist `url` vorhanden und kein `workspacePath`, ist es `link`.
  - Ist `workspacePath` vorhanden, wird anhand der Erweiterung abgeleitet: `.html` -> `html`, Bild-Erweiterungen -> `image`, Video-Erweiterungen -> `video`, Audio-Erweiterungen -> `audio`, `.pdf` -> `pdf`, `.ipynb` -> `notebook`, andernfalls `file`.
  - Wenn keine Ableitung möglich ist, ist es `other`.

### 5.4 Feld-Constraints

- `workspacePath` wird nur für Dateien innerhalb des Workspaces nach außen angezeigt und muss ein Workspace-relativer Pfad sein.
- `managedId` ist eine Referenz auf ein von Daemon/qwen-home verwaltetes Artefakt und darf kein lokaler absoluter Pfad sein.
- `url` akzeptiert nur explizit registrierte URLs oder ArtifactTool-Veröffentlichungs-URLs.
- `workspacePath`, `managedId` und `url`: Es muss genau ein Primary Locator vorhanden sein. V1 lehnt normale Eingaben ab, die mehrere Primary Locators gleichzeitig enthalten, um zu verhindern, dass für dieselbe logische Ressource mehrere Identitäten basierend auf verschiedenen Feldern generiert werden.
- Die einzige Ausnahme ist vertrauenswürdiges `storage: 'published'`: `url` ist der Primary Locator, `managedId` kann als optionale Managed-Referenz für zukünftige Downloads/Previews mit zurückgegeben werden. In diesem Fall wird die Identität nur anhand der `url` berechnet, `managedId` nimmt nicht an der Identität teil. Diese Ausnahme akzeptiert nur interne Eingaben mit `trustedPublisher: true`.
- Normale Tools dürfen `~/.qwen`, `/tmp` oder andere lokale absolute Pfade nicht als `workspacePath` zurückgeben.
- `title` ist erforderlich, hat nach dem Trimming eine Länge von 1-200 Zeichen und darf keine ASCII-Steuerzeichen enthalten. Es ist Plain Text und trägt keine HTML- oder Markdown-Semantik.
- `description` ist ein UI-Hilfs-Plain-Text und gelangt nicht in den Modellkontext.
- `description` hat nach dem Trimming maximal 1000 Zeichen, darf keine ASCII-Steuerzeichen enthalten und trägt keine HTML- oder Markdown-Semantik.
- `metadata` muss ein kleines Objekt sein und nur Primitive Values erlauben.
- `metadata` enthält keine Secrets, Tokens, Cookies oder Signier-Private-Keys.
- `sizeBytes` ist Best-Effort.
- `DaemonSessionArtifactsEnvelope` gibt kein absolutes `workspaceCwd` des Hosts zurück. Clients verlassen sich für die Anzeige nur auf relative Pfade wie `workspacePath` und das `storage`-Feld.

## 6. Artifact-Erfassungsquellen

### 6.1 Eingänge für Datei-Outputs

V1 leitet keine Artefakte automatisch von normalen Datei-Bearbeitungstools ab.

Keine automatische Ableitung für:

- `ToolNames.WRITE_FILE`
- `ToolNames.EDIT`
- `ToolNames.NOTEBOOK_EDIT`
- `read_file`
- `grep_search`
- `glob`
- `list_directory`
- `web_fetch`
- `run_shell_command`

Gründe:

- Normale Quellcode-Bearbeitungen, Konfigurationsänderungen und Testkorrekturen gehören zur File-Change-/Diff-/Patch-History.
- Das automatische Ablegen jeder Quellcode-Bearbeitung im Artefakte-Panel würde viel Rauschen erzeugen.
- Der Bereich für Artefakte auf der rechten Seite sollte für wiederverwendbare, previewbare, herunterladbare oder teilbare Session-Outputs reserviert bleiben.

Bedingungen, unter denen Dateien in den Artifact-Store gelangen können:

- Das Tool-Ergebnis gibt explizit `ToolResult.artifacts` zurück.
- `ArtifactTool`-Veröffentlichungs-Output.
- Explizite Registrierung durch V1 `record_artifact` / Hook / Client-POST.
- Wenn in Zukunft eine komfortable Ableitung benötigt wird, sind nur generierte Output-Dateien erlaubt, und das Tool-Ergebnis oder strukturierte Metadaten müssen als Artefakt markiert werden. Leite nicht standardmäßig von normalen `WRITE_FILE` / `EDIT` ab.

Beispiele für generierte Outputs:

- Reports: `.html`, `.pdf`, `.md`
- Medien: `.png`, `.jpg`, `.mp4`, `.mp3`
- Office/Daten: `.xlsx`, `.docx`, `.pptx`, `.csv`
- Notebooks: Als Deliverable generierte `.ipynb`

Auch bei Notebooks muss zwischen dem "Bearbeiten einer bestehenden Notebook-Quelldatei" und dem "Generieren eines Notebook-Artefakts zur Ansicht/zum Download für den Benutzer" unterschieden werden.

### 6.2 ArtifactTool

Nach erfolgreicher Veröffentlichung gibt `ArtifactTool` Folgendes zurück:

```ts
artifacts: [
  {
    kind: 'html',
    storage: 'published',
    title,
    url,
    managedId,
    mimeType: 'text/html',
  },
];
```

Behalte die bestehenden `llmContent`, `returnDisplay` und `resultFilePaths` bei, um Kompatibilität zu gewährleisten.

Der aktuelle lokale Publisher von `ArtifactTool` könnte Inhalte in ein verwaltetes Verzeichnis unter qwen home schreiben und eine `file://`- oder Remote-URL zurückgeben. Die Daemon-Artefakt-API sollte den lokalen absoluten Pfad von qwen home nicht als `workspacePath` offenlegen; stattdessen sollte Folgendes verwendet werden:

- `storage: 'published'`
- `url`: Die veröffentlichte, zugängliche URL, die auch der Primary Locator für veröffentlichte Artefakte ist.
- `managedId`: Optionale interne verwaltete Referenz, die nicht an der Identität teilnimmt.
- Der BridgeClient setzt `trustedPublisher: true` über eine interne Option beim abgeschlossenen `ArtifactTool`-Session-Update. Die Bridge darf dieses Flag nicht aus Modellparametern, Hook-Payloads, Client-POST-Bodys oder normalen `_meta.artifacts[*]`-Feldern ableiten.

Wenn Daemon-Clients in Zukunft verwaltete Inhalte herunterladen oder als Preview anzeigen sollen, sollte eine dedizierte Managed-Artefakt-Route hinzugefügt werden, anstatt lokale absolute Pfade in öffentliche Artefakte zu stopfen.

### 6.3 record_artifact-Tool

Als expliziter Registrierungseingang für Modell/Skill in V1 wird ein leichtgewichtiges integriertes Tool hinzugefügt:

```ts
ToolNames.RECORD_ARTIFACT = 'record_artifact';
```

Verwendungszweck:

- Das Modell registriert explizit nicht-dateibasierte Artefakte.
- Skill / agent.md kann das Modell anweisen, dieses Tool aufzurufen, nachdem die Business-URL zusammengesetzt wurde.
- Jeder Aufruf registriert nur ein Artefakt. Die Batch-Registrierung erfolgt durch mehrfaches Aufrufen des Tools durch das Modell, um Mehrdeutigkeiten bei Teil-Erfolgen/-Fehlern in einem einzigen Tool-Call zu vermeiden.
- Führt keine Netzwerkanfragen durch.
- Schreibt keine Workspace-Dateien.
- Schreibt nur den Session-Artefakt-Index.

Parameter:

```ts
interface RecordArtifactParams {
  title: string;
  description?: string;
  kind?: ToolArtifactKind;
  storage?: Exclude<ToolArtifactStorage, 'published'>;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

Beispiel:

```json
{
  "title": "用户画像资源详情",
  "description": "内部数据平台生产环境资源详情页",
  "kind": "link",
  "storage": "external_url",
  "url": "https://platform.example.com/resources/user-profile?env=prod",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "data_platform_resource",
    "env": "prod"
  }
}
```

Rückgabe:

```ts
return {
  llmContent: {
    recorded: true,
    title: params.title,
    location: params.workspacePath ?? params.managedId ?? params.url,
    note: 'The daemon will expose the assigned artifact id through artifact_changed and list APIs.',
  },
  returnDisplay: 'Recorded artifact: 用户画像资源详情',
  artifacts: [params],
};
```

`record_artifact` führt vor der Rückgabe eine Validierung auf Parameterebene durch. Bei einem Fehlschlag wird ein Tool-Fehler zurückgegeben und es werden keine `ToolResult.artifacts` erzeugt. Da ein einzelner Aufruf nur ein Artefakt enthält, muss V1 keinen partiellen Batch-Erfolg definieren. Die vom Server zugewiesene `id` wird vom Daemon-Store generiert und über `artifact_changed` / `GET /session/:id/artifacts` dem Client offengelegt.

`record_artifact` akzeptiert kein `storage: 'published'` und auch nicht die `published`-Ausnahme für `url + managedId`. Modell/Skill können nur Workspace-, Managed- oder External-URL-Artefakte registrieren. Veröffentlichungs-Artefakte müssen von ArtifactTool / Daemon-Publisher stammen.

Berechtigungsempfehlungen:

- Es wird nicht empfohlen, es standardmäßig für alle Sessions zu registrieren. Es sollte feature-gated sein oder explizit durch Skill/Extension aktiviert werden.
- Wenn aktiviert, kann es standardmäßig `allow` sein, da es nur die Session-UI-Metadaten ändert.
- URLs werden nicht automatisch geöffnet.
- Der Client zeigt den Host an, sodass der Benutzer das Ziel vor dem Klicken erkennen kann.
- Wenn in Zukunft `file://` erlaubt wird, dürfen nur Dateien innerhalb des Workspaces erlaubt sein. V1 empfiehlt nicht, dass `record_artifact` `file://`-URLs akzeptiert.
- Wie bei Hook/Client-POST muss eine einheitliche Artefakt-Validierung durchlaufen werden.

### 6.4 Hook-Output-Artefakte

Als Erweiterung des expliziten Registrierungseingangs für Hook/Extension in V1. Aktuelle Hooks unterstützen bereits Command/HTTP/Function/Prompt, und Command/HTTP-Hooks können JSON-`HookOutput` zurückgeben. Es wird empfohlen, `hookSpecificOutput` zu erweitern:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "调度任务详情",
        "url": "https://ops.example.com/task/task_123",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    ]
  }
}
```

Geeignete Szenarien:

- PostToolUse-Hook beobachtet eine MCP/Tool-Ausgabe und setzt die Business-URL nach Organisationsregeln zusammen.
- Extensions stellen Hooks bereit, um interne Unternehmensressourcen-URLs in den rechten Artefakte-Bereich einzuspeisen.
- Skill-Frontmatter registriert einen PostToolUse-Hook, der während der Laufzeit des Skills automatisch Artefakte registriert.
- Nach einem Tool-Fehler registriert der PostToolUse-Hook Error-Traces, Dashboards für fehlgeschlagene Läufe oder Troubleshooting-Links.
- PostToolBatch-Artefakte werden nur eingebunden, wenn zur Laufzeit ein echter PostToolBatch-Aufrufpunkt existiert und die Ergebnisse an die Daemon-Bridge gesendet werden können. Die V1-Hauptsitzung des Daemon-ACP geht nicht davon aus, dass dieser Kanal existiert.

Erforderliche Code-Änderungen:

- `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`.
- `mergeWithOrLogic()` in `packages/core/src/hooks/hookAggregator.ts` muss eine Concat-Logik für `artifacts` hinzufügen und darf nicht das bestehende Last-Writer-Wins-Verhalten von `hookSpecificOutput` verwenden.
- `PostToolUseHookResult` / `PostToolBatchHookResult` in `packages/core/src/core/toolHookTriggers.ts` fügen `artifacts?: ToolArtifact[]` hinzu.
- `firePostToolUseHook()` gibt `artifacts?: ToolArtifact[]` zurück.
- `firePostToolBatchHook()` gibt `artifacts?: ToolArtifact[]` zurück.
- `packages/core/src/core/coreToolScheduler.ts` muss in den Implementierungsplan aufgenommen werden, da es der Aufrufpunkt für `firePostToolBatchHook()` ist und auch einen unabhängigen `firePostToolUseHook()`-Pfad hat.
- Extrahiere einen gemeinsamen `collectHookArtifacts()`- oder äquivalenten Helper, damit `coreToolScheduler.ts` und die beiden PostToolUse-Pfade in ACP `Session.ts` dieselbe Extraktions-/Validierungs-Prälogik wiederverwenden können, um Verhaltensabweichungen an den beiden Stellen zu vermeiden.
- `Session.runTool()` sammelt Tool-Result-Artefakte und Hook-Artefakte, aber beide verwenden unterschiedliche Übertragungen: Tool-Result-Artefakte stammen nur aus erfolgreich zurückgegebenen Tool-Ergebnissen. Hook-Artefakte hängen nicht vom Tool-Erfolg ab, auch der Fehlerpfad kann in den Store gelangen.
- In ACP `Session.runTool()` werden Artefakte aus erfolgreichen Tool-Ergebnissen weiterhin an `tool_call_update._meta.artifacts` angehängt. Artefakte, die von PostToolUse-/PostToolUseFailure-Hooks zurückgegeben werden, werden einheitlich und separat über `client.extNotification('qwen/notify/session/artifact-event', payload)` gesendet. Diese Benachrichtigung muss synchron geawaitet werden, nachdem die Hook-Artefakte gesammelt wurden. Ein Sendefehler wird nur als Warning protokolliert und ändert nicht das ursprüngliche Tool-Fehler-/Erfolgsergebnis. Diese Hook-Artefakte gelangen nicht in den Daemon-Store, V1 führt keine persistente Wiederholung durch.
- Hook-Artefakte durchlaufen dieselbe Validierung wie `record_artifact` / Client-POST: URL-Schema, Workspace-Pfad-Containment, Metadaten-Größe/-Typ.
- Wenn Batch-Level-Artefakte keinen einzelnen Tool-Call haben, kann `qwen/notify/session/artifact-event` nur verwendet werden, wenn zur Laufzeit bereits ACP-`extNotification` an die Bridge gesendet werden kann.

`qwen/notify/session/artifact-event` Payload:

```json
{
  "artifacts": [
    {
      "kind": "link",
      "storage": "external_url",
      "title": "批处理任务详情",
      "url": "https://ops.example.com/task/batch_123",
      "mimeType": "text/html"
    }
  ],
  "source": "hook",
  "hookEventName": "PostToolBatch",
  "hookName": "task-artifacts",
  "extensionId": "example-extension"
}
```

Transport-Konventionen:

- `qwen/notify/session/artifact-event` ist eine ACP `extNotification`, kein SSE-Event und keine clientseitige HTTP-Route.
- Das Wire-Format nutzt die bestehenden `qwen/notify/session/*`-Benachrichtigungskonventionen; z. B. das bereits vorhandene Session-Notification-Demux-Muster der Bridge.
- Absender können nur Laufzeiten oder Extension-Bridges sein, die sich bereits innerhalb eines ACP-Session-Kanals befinden und `extNotification` senden können. ACP `Session.ts` kann diese Benachrichtigung senden; `coreToolScheduler.ts` selbst kann sie nicht direkt an die Daemon-Hauptsitzung senden.
- `BridgeClient` demultiplext im bestehenden `extNotification`-Verarbeitungszweig nach Benachrichtigungsnamen: Beim Treffer auf `qwen/notify/session/artifact-event` wird das Payload gelesen, in `SessionArtifactInput[]` umgewandelt und in die einheitliche Ingest-Pipeline eingespeist.
- Die Bridge muss `source: 'hook'` aus dem Notification-Transport-Kontext ableiten; `source` im Payload dient nur als Kompatibilitätshinweis. Wenn die Payload-Source vom Transport-Kontext abweicht, überschreibt die Bridge diese mit `hook` und protokolliert einen Debug-/Warning-Eintrag. Das Notification-Payload darf `trustedPublisher` nicht setzen; wenn `storage: 'published'` mitgeführt wird, wird dies wie eine fehlgeschlagene Validierung für normale, nicht vertrauenswürdige Inputs behandelt.

Hinweis: `qwen/notify/session/artifact-event` ist nur der Transport-Envelope für explizite Artifacts und sollte keine zweite Store/Validation/Dedupe-Pipeline bilden. Der BridgeClient muss `_meta.artifacts`, Hook-Artifacts und `artifact-event.artifacts` alle in dasselbe `SessionArtifactInput[]` umwandeln, dieselbe `ingestArtifacts()` / `SessionArtifactStore.upsertMany()`-Methode aufrufen und dieselbe Logik für Validation, Normalization, Enrichment, Eviction und die `artifact_changed`-Veröffentlichung wiederverwenden. Die ACP-Hauptsitzung hat derzeit keinen PostToolBatch-Callsite, daher darf der Batch-Hook von `coreToolScheduler.ts` nicht als Standardquelle für das Daemon-Artifacts-Panel betrachtet werden. Wenn später Batch-Artifacts für die Daemon-Hauptsitzung unterstützt werden sollen, müssen zuerst echte Callsites und Tests hinzugefügt werden. Nicht-ACP-Laufzeiten ohne Artifact-Notification-Sink dürfen keine Unterstützung für Daemon-Hook-Artifacts deklarieren.

### 6.5 Direktes Einfügen durch Client / Extension

Für Szenarien, in denen das Modell keine Tools aufrufen soll, wird Folgendes bereitgestellt:

```http
POST /session/:id/artifacts
```

Geeignet für:

- IDE-Plugins, die die aktuell geöffnete Vorschau-URL zum Artifact-Bereich hinzufügen.
- WebUI-Benutzer, die manuell einen Ressourcen-Link hinzufügen.
- Channel-Plugins oder externe Integrationen, die während einer Aufgabe Plattformressourcen registrieren.

Unterschiede zur Hook-Ausgabe:

- Hook-Ausgaben eignen sich für die interne Agent-Ausführungskette.
- POST-Routen eignen sich für Daemon-Clients / UI / externe Integrationen.
- Der POST-Body muss eine einheitliche Artifact-Validierung durchlaufen; beliebige lokale absolute Pfade oder nicht unterstützte URL-Schemes sind nicht erlaubt.

## 7. Store und Deduplizierung

Artifact-Identität:

- Workspace-Dateien: `sessionId + ':workspace:' + normalizedWorkspacePath`
- Managed-Dateien: `sessionId + ':managed:' + normalizedManagedId`
- External-/Published-URLs: `sessionId + ':url:' + identityUrl`

Die Identität beschreibt nur den Ressourcenstandort und enthält keine `source`. Registrierungen für dieselbe URL oder denselben Pfad durch Tool, Hook oder Client werden zu einem einzigen Artifact zusammengeführt, um eine doppelte Anzeige derselben Ressource im rechten Panel zu vermeiden. V1 verwaltet keine `provenance[]`, Vertrauensstufen oder Retention-Klassen; der erste erfolgreiche Eintrag besitzt die Anzeigefelder und Quell-Audit-Felder dieses Artifacts, spätere Registrierungen mit derselben Identität drücken nur aus, dass "dieselbe Ressource erneut beobachtet wurde".

Inputs müssen genau ein Locator-Feld enthalten:

- `workspacePath`
- `managedId`
- `url`

Wenn ein Input mehrere Primary-Locatoren enthält, lehnt V1 diesen direkt ab, anstatt zu versuchen, die Identität nach Priorität zu erraten. Dies verhindert, dass ein Artifact zunächst nach `workspacePath` und später nach `url` dedupliziert wird, was zu Duplikaten führen würde.

`storage: 'published'` ist die einzige Ausnahme: Es muss `url` als Primary-Locator enthalten und kann zusätzlich `managedId` als Managed-Reference mitführen. Die Published-Identität wird weiterhin nach `url` berechnet; `managedId` dient nur für zukünftige Downloads/Previews und nimmt nicht an der Deduplizierung teil. Diese Ausnahme akzeptiert nur Inputs mit dem internen `trustedPublisher: true`; wenn Hook, Client-POST, `record_artifact` oder normale Tools `storage: 'published'` zurückgeben, wird dies als Validierungsfehler behandelt.

Externe ID:

- Verwendet die ersten 12 Zeichen des SHA256-Hashs der Identität.

### 7.1 Normalisierung

`normalizedWorkspacePath`:

- Der Input muss ein Workspace-relativer Pfad sein; wenn am Eingang ein absoluter Pfad übergeben wird, wird zuerst versucht, ihn in einen Workspace-relativen Pfad umzuwandeln, andernfalls wird er abgelehnt.
- Verwende `path.resolve(workspaceCwd, input)`, um den absoluten Pfad zu ermitteln.
- Validierung, dass der aufgelöste Pfad innerhalb des Workspaces liegt: `path.relative(workspaceCwd, resolved)` darf nicht mit `..` beginnen und kein absoluter Pfad sein.
- Wenn das Ziel bereits existiert, verwende `fs.realpath`, um zu prüfen, ob das endgültige Symlink-Ziel noch innerhalb des Workspaces liegt; Symlinks, die aus dem Workspace herauszeigen, werden abgelehnt.
- Wenn das Ziel nicht existiert, kann die Registrierung das Artifact behalten, aber der initiale `status` muss `missing` sein; die Symlink-Containment-Prüfung darf nicht übersprungen werden, nur weil `realpath` fehlschlägt. Bei späteren GET-TTL-Refreshes muss dieselbe Containment- und Realpath-Prüfung erneut durchgeführt werden.
- Wenn beim Refresh festgestellt wird, dass der Pfad nun ein Symlink ist, der aus dem Workspace herauszeigt, bleibt das Artifact erhalten, aber der `status` wird auf `missing` gesetzt und die Best-Effort-`sizeBytes` werden gelöscht; V1 meldet diesen Pfad niemals als `available`.
- Die Ausgabe verwendet einheitlich POSIX-Slashes und entfernt führende `./`.
- Es wird keine Case-Folding durchgeführt; selbst wenn das Standard-Dateisystem von macOS case-insensitive ist, wird die Identität weiterhin als String unterschieden, um inkonsistentes plattformübergreifendes Verhalten zu vermeiden.

`normalizedManagedId`:

- Der Input wird zunächst um ASCII-Whitespaces bereinigt (getrimmt).
- Nach dem Trimmen darf er nicht leer sein und eine Länge von 200 Zeichen nicht überschreiten.
- ASCII-Steuerzeichen werden abgelehnt.
- `/`, `\` und `..` werden abgelehnt; die Angabe von Pfad-Ebenen oder lokalen absoluten Pfad-Semantiken ist nicht erlaubt.
- Es wird kein Case-Folding durchgeführt, die Identität wird als String unterschieden.
- Die öffentliche `managedId` gibt den normalisierten Wert zurück.

`identityUrl` und `url`:

- Parsing erfolgt über WHATWG `new URL(input)`; lockere Prüfungen wie `startsWith('http')` für Strings sind verboten.
- Neben vertrauenswürdigen Published-URLs des `ArtifactTool` sind für normale Link-Artifacts nur `http:` / `https:` erlaubt.
- Das `url`-Feld speichert die bereinigte, anklickbare URL zum Öffnen durch den Client; die Identität darf nicht als anklickbare URL zurückgeschrieben werden.
- Die Identität wird zusätzlich über eine interne `identityUrl` berechnet und nicht als öffentliches Feld zurückgegeben.
- Scheme und Host werden in Kleinbuchstaben umgewandelt.
- Normalisierung von Standardports: `https:443` / `http:80` werden nicht beibehalten.
- Fragmente werden beibehalten; in hash-gerouteten SPAs kann das Fragment Teil der Ressourcenidentität sein.
- Die ursprüngliche Reihenfolge der Query-Parameter wird beibehalten; einige Plattformen reagieren empfindlich auf die Query-Reihenfolge, V1 führt kein Query-Sorting durch.
- `username` / `password` werden abgelehnt oder entfernt; URL-Userinfos werden nicht im Artifact-Store gespeichert.

Deduplizierungsverhalten:

- Erste Registrierung: `created`
- Erneute Registrierung derselben Identität: `updated`
- `createdAt` bleibt unverändert.
- `updatedAt` wird aktualisiert, nimmt aber nicht an der Eviction-Sortierung teil.
- Innerhalb desselben `upsertMany()`-Aufrufs werden Inputs zunächst nach Identität zusammengeführt; der Owner derselben Identität wird durch den Input mit der kleinsten `receivedSeq` bestimmt, falls keine `receivedSeq` vorhanden ist, wird die Reihenfolge des Input-Arrays verwendet. Der BridgeClient sollte Artifacts aus verschiedenen Transport-Events nicht ungeordnet zusammenführen; wenn dies notwendig ist, muss zuerst eine `receivedSeq` zugewiesen und dann sortiert werden. Jede finale Identität erzeugt nur eine einzige Änderung in `changes[]`. Wenn diese Identität vor diesem Batch nicht existierte, ist sie `created`, andernfalls `updated`.
- Für die Anzeigefelder `title`, `description`, `source`, `toolCallId`, `toolName`, `hookName`, `extensionId`, `clientId` gilt First-Writer-Wins; sie werden durch nachfolgende Inputs derselben Identität nicht überschrieben.
- Ressourcen-Body-Felder erlauben ein sicheres Upgrade: Wenn dieselbe URL-Identität von `external_url` auf `published` aktualisiert wird, können `storage` aktualisiert, `managedId` ergänzt sowie `kind` / `mimeType` / `sizeBytes` aktualisiert werden, und der Publisher darf `title` / `description` überschreiben, um zu verhindern, dass Platzhalter-Link-Titel echte Veröffentlichungen dauerhaft verdecken. Dieses Upgrade akzeptiert nur `storage: 'published'`-Inputs mit dem internen `trustedPublisher: true`.
- Das Auffüllen einer leeren `managedId` zu einer Published-Managed-Reference ist erlaubt; eine vorhandene `managedId` wird durch nachfolgende normale Inputs nicht überschrieben.
- `status` und `sizeBytes` sind vom Daemon abgeleitete Best-Effort-Felder, die mit Workspace-Stats oder Published-Artifact-Enrichments aktualisiert werden können.
- `metadata` speichert kleine Objekte, die bei der ersten Registrierung die Validierung bestanden haben; nachfolgende Inputs derselben Identität können nur bei `source: 'tool'` oder `source: 'client'` eine kontrollierte Anreicherung vornehmen: Es werden nur nicht vorhandene Keys hinzugefügt, vorhandene Keys nicht überschrieben, und nach dem Zusammenführen wird erneut auf "nur Primitive" und eine Gesamtgröße von 4 KB validiert. Hooks ignorieren standardmäßig die Metadata-Anreicherung für bereits vorhandene Artifacts. Wenn das Limit nach dem Zusammenführen überschritten wird, wird nur die aktuelle Metadata-Anreicherung verworfen und ein Warning protokolliert; andere sichere Upgrades des Artifacts können fortgesetzt werden.
- Client-POSTs derselben Identität überschreiben keine Anzeigefelder und ändern auch nicht die `retentionSource`; sie setzen lediglich das interne `clientRetained` auf `true`, um die manuelle Aufbewahrungsabsicht des Benutzers auszudrücken.
- Die Implementierung sollte innerhalb eines einzigen `SessionArtifactStore.upsertMany()` synchron verarbeitet werden, um Race Conditions bei asynchronem Lesen und Schreiben zu vermeiden.

Interne Store-Felder:

- `retentionSource`: Die `source` des ersten erfolgreichen Eintrags, wird bei der Erstellung zugewiesen und ändert sich danach nicht durch Client-POSTs oder wiederholte Upserts.
- `clientRetained`: Boolescher Wert, initial `source === 'client'`; wird auf `true` gesetzt, wenn ein beliebiger Client-POST, der das Mutation-Gate passiert, dieselbe Identität trifft. `clientRetained` ändert keine Anzeigefelder und migriert auch nicht den `retentionSource`-Bucket.
- `insertSeq`: Monoton steigende Sequenznummer im Store, wird einmalig bei der Artifact-Erstellung zugewiesen und nie aktualisiert.
- `receivedSeq`: Reihenfolge des Input-Empfangs, dient nur dem deterministischen Coalescing innerhalb desselben Batches und wird nicht als öffentliches Feld zurückgegeben.

Quotas und Aufbewahrungsrichtlinien:

- Maximal 200 Artifacts pro Session.
- V1 verwendet Soft-Source-Reservierungen, die Reservierung erfolgt nach interner `retentionSource`-Zugehörigkeit:
  - `tool`: 100
  - `client`: 50
  - `hook`: 50
- Die Reservierung ist eine Mindestaufbewahrungsmenge, keine harte Obergrenze; ungenutzte Kapazitäten können von anderen Quellen geliehen werden, bis das globale Limit von 200 erreicht ist.
- Wenn neue Artifacts das Gesamtvolumen auf über 200 erhöhen, werden Eviction-Kandidaten in der folgenden Reihenfolge ausgewählt. Neu erstellte Artifacts im aktuellen `upsertMany()`-Batch gelangen standardmäßig nicht in den Kandidatenpool; die Eviction wählt Kandidaten zunächst nur aus Artifacts aus, die bereits vor diesem Batch existierten. Auf diese Weise kann ein in diesem Batch neu registriertes Missing-Artifact ein noch live altes Artifact aus einem vollen Store verdrängen. Dies ist die Wahl von V1, um die Sichtbarkeit aktueller expliziter Artefakte zu gewährleisten.
  1. Bevorzugtes Bereinigen von Artifacts mit `status: 'missing'` und `clientRetained === false`.
  2. Als Nächstes Bereinigen von Artifacts mit `clientRetained === false` aus Quellen, deren `retentionSource`-Anzahl die Reservierung überschreitet.
  3. Danach Bereinigen der ältesten Artifacts mit `clientRetained === false`.
  4. Wenn alle Artifacts `clientRetained === true` sind, Bereinigen des ältesten Client-retained Artifacts.
- Bevor die Eviction die Priorität für gecachtes `missing` verwendet, muss für Workspace-Artifacts, die als Kandidaten in Frage kommen, ein Best-Effort-Status-Refresh / Containment-Check durchgeführt werden; wenn das Refresh-Ergebnis `available` ist, darf es nicht weiterhin als `missing` mit Priorität bereinigt werden. Bei einem Refresh-Fehler wird der ursprüngliche gecachte Status beibehalten.
- `clientRetained` ist die letzte Bereinigungspräferenz, kein unbegrenzter Pin und durchbricht weder das globale Limit von 200 noch die Soft-Reservierung. Wenn alle Artifacts Client-retained sind, wird weiterhin das älteste Client-retained Artifact bereinigt.
- Wenn nach dem Bereinigen alter Artifacts die neu erstellten Artifacts des aktuellen Batches selbst die verbleibende Kapazität immer noch überschreiten, muss der Store vor der Generierung von `changes[]` die ersten N neuen Identitäten gemäß `receivedSeq` / Input-Reihenfolge behalten, die überschüssigen Inputs des aktuellen Batches verwerfen und Warning/Diagnostics protokollieren. Verworfene neue Inputs gelangen nicht in den Store und erzeugen keine `created`- oder `removed`-Änderung, sodass dieselbe Identität innerhalb derselben Mutation nicht erst `created` und dann `removed` wird.
- Die "älteste"-Sortierung verwendet `(createdAt, insertSeq)`, wobei `insertSeq` eine monoton steigende Sequenznummer im Store ist, die als Tiebreaker für Inputs in derselben Millisekunde oder im selben Batch dient.
- Wiederholte Registrierungen derselben Identität aktualisieren `updatedAt`, aber die Eviction berücksichtigt `updatedAt` nicht; daher können andere Quellen ein altes Artifact nicht durch häufige wiederholte Registrierungen in der Aufbewahrungsmenge fixieren.
- Rückgabe in aufsteigender `createdAt`-Reihenfolge.
- Die Bereinigung muss für jedes entfernte Artifact `artifact_changed` / `removed` senden. V1 stellt keine anderen Bereinigungsereignisse bereit.
- Reservierungswerte, `retentionSource`, `clientRetained` und `insertSeq` sind V1-Implementierungsdetails, keine Wire-Protocol-Felder; später können Standardwerte angepasst oder feinere Pro-Producer-Quotas hinzugefügt werden, ohne die API-Form zu ändern.

### 7.2 V1-Lebenszyklus-Einschränkungen

Der V1-Store ist ein In-Memory-Index der Live-Bridge-Session:

- Artifacts werden nach einem Neustart der Bridge/Session nicht wiederhergestellt.
- Nach einer Trennung und erneuten Verbindung des Client-SSE sollte `GET /session/:id/artifacts` erneut aufgerufen werden, um einen Snapshot-Sync durchzuführen.
- V1 erfordert kein zusätzliches `artifacts_reset`-Event; wenn später Betriebsmodi unterstützt werden, bei denen die Session weiterläuft, aber der Artifact-Store geleert wird, wird `artifacts_reset` oder ein gleichwertiges Snapshot-invalidated-Event hinzugefügt.
- Wiederherstellung des Verlaufs, prozessübergreifende Persistenz und Session-Load-Replay gehören zu späteren Phasen.

## 8. Interne Implementierungspipeline

Die folgenden Phasen stellen die technische Implementierungsreihenfolge für dieselbe vollständige V1-Funktionalität dar und bedeuten keine Aufteilung in mehrere externe Versionen. Implementierungs-PRs können in Phasen aufgeteilt werden, aber die zusammengeführte Designbasis ist eine vollständige Session-Artifacts-Funktionalität.

### 8.1 Phase A: Core Types und ArtifactTool

Änderungen:

- `packages/core/src/tools/tools.ts`
  - Hinzufügen von `ToolArtifactKind`, `ToolArtifactStorage`, `ToolArtifact`.
  - Erweitern von `ToolResult.artifacts?`.
- `packages/core/src/tools/artifact/artifact-tool.ts`
  - Befüllen von `artifacts` nach erfolgreichem Publish.
  - Verwenden von `storage: 'published'`, lokale Pfade des Qwen-Home-Verzeichnisses werden nicht als `workspacePath` offengelegt.

Phase A integriert zunächst `ToolResult.artifacts` und `ArtifactTool`; `record_artifact` wird in Phase D integriert, gehört aber weiterhin zur selben vollständigen V1-Funktionalität.

### 8.2 Phase B: CLI-ACP-Session-Metadaten

Änderungen:

- `packages/cli/src/acp-integration/session/types.ts`
  - `ToolCallResultParams.artifacts?`
- `packages/cli/src/acp-integration/session/emitters/tool-call-emitter.ts`
  - `_meta.artifacts = params.artifacts`
- `packages/cli/src/acp-integration/session/Session.ts`
  - Sammeln von `toolResult.artifacts` nach Tool-Erfolg.
  - PostToolUse-Hook-Artifacts werden unabhängig von Tool-Erfolg/-Fehler gesammelt und für Fehlerdiagnose-Artifacts wie Error-Trace / Dashboard verwendet.
  - Hook-Artifacts im Fehlerpfad dürfen nicht von erfolgreichen Result-Metadaten abhängen; rufen Sie bei Bedarf direkt den Bridge-Artifact-Ingest auf.
  - Keine automatische Ableitung von Artifacts aus normalen `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT`-Aufrufen.
  - Übergeben an `emitResult()`.

### 8.3 Phase C-1: ACP-Bridge-Store und Events

Neu hinzugefügt:

- `packages/acp-bridge/src/sessionArtifacts.ts`
  - Typen
  - Normalisierung
  - Validierung
  - ID/Hash
  - `SessionArtifactStore`

Bridge-Session-Entry wird erweitert um:

```ts
artifacts: SessionArtifactStore;
```

Bridge-Interface wird erweitert um:

```ts
getSessionArtifacts(sessionId: string): SessionArtifactsEnvelope;
addSessionArtifacts(
  sessionId: string,
  artifacts: SessionArtifactInput[],
): DaemonSessionArtifactMutationResult;
removeSessionArtifact(
  sessionId: string,
  artifactId: string,
): DaemonSessionArtifactMutationResult;
```

BridgeClient:

- Extrahieren von Artifacts aus `session_update/tool_call_update._meta.artifacts`.
- Extrahieren von expliziten Notification-Artifacts aus `qwen/notify/session/artifact-event`.
- Alle Inputs werden in dasselbe `SessionArtifactInput[]` umgewandelt.
- Zuweisung von `source` und `receivedSeq` basierend auf dem Transport-Kontext. `trustedPublisher` wird nur durch die Bridge-seitige Ingest-Option eines abgeschlossenen `ArtifactTool`-Session-Updates zugewiesen; der BridgeClient darf nicht aus Artifact-Payload-Feldern oder normalen `_meta.artifacts`-Inhalten darauf schließen.
- Einheitlicher Aufruf von `ingestArtifacts()` / `SessionArtifactStore.upsertMany()`; keine zweite Validierung oder Deduplizierung für Notification-Artifacts erstellen.
- `upsertMany()` gibt `DaemonSessionArtifactMutationResult` zurück, das created/updated sowie durch Eviction erzeugte removed-Änderungen enthält.
- Für jede Änderung wird `artifact_changed` veröffentlicht, zuerst created/updated, dann removed.
- `removeSessionArtifact()` löscht das Artifact aus dem Store, gibt eine removed-Änderung mit `reason: 'explicit'` zurück und veröffentlicht `artifact_changed`.

### 8.4 Phase C-2: Snapshot-API bereitstellen

Änderungen:

- `packages/cli/src/serve/capabilities.ts`
  - Hinzufügen von `session_artifacts`.
- `packages/cli/src/serve/server.ts`
  - Hinzufügen von `GET /session/:id/artifacts`.
  - Hinzufügen von `DELETE /session/:id/artifacts/:artifactId`.

GET-Verhalten:

- Session existiert nicht: vorhandener 404-Fehler.
- Keine Artifacts: gibt ein leeres Array zurück.
- Workspace-Artifacts pflegen einen internen Status-Cache, z. B. `lastStatAt`, `lastKnownSizeBytes`, `lastKnownStatus`.
- Ein Best-Effort-Stat wird beim Upsert durchgeführt.
- GET verwendet standardmäßig den Cache; wird nur bei Ablauf von `lastStatAt` gemäß TTL aktualisiert, z. B. 5-30 Sekunden, und begrenzt die Anzahl gleichzeitiger Stats. Beim Refresh muss die Workspace-Containment- und Realpath-Symlink-Prüfung aus Abschnitt 7.1 erneut durchgeführt werden.
- Stat-Fehler: GET gibt `status: 'missing'` zurück, das Artifact wird nicht gelöscht.
- Stat-Erfolg und Containment/Realpath-Prüfung weiterhin bestanden: Wenn der Cache zuvor `missing` war, gibt GET `status: 'available'` zurück.
- Wenn der Refresh einen Symlink-Escape oder ein Fehlschlagen der Workspace-Containment-Prüfung feststellt, gibt GET `status: 'missing'` zurück und keine neuen `sizeBytes`.
- GET kann den Status-Cache im Hintergrund aktualisieren, darf jedoch aufgrund von Leseanfragen kein `artifact_changed` veröffentlichen; der V1-Status ist für SSE-Clients eventual consistent.
- Wenn später Echtzeit-Statusereignisse benötigt werden, sollten diese durch einen Hintergrund-Refresh oder eine explizite Refresh-Mutation `artifact_changed` / `updated` veröffentlichen, nicht im GET-Heißlesepfad.
- Managed-/URL-Artifacts prüfen keine lokalen Pfade und geben immer `status: 'available'` zurück.

### 8.5 Phase C-3: SDK-List/Event-Support

Änderungen:

- `packages/sdk-typescript/src/daemon/types.ts`
  - Fügt Artifact-Typen hinzu.
- `packages/sdk-typescript/src/daemon/events.ts`
  - Fügt `artifact_changed` zu den bekannten Events hinzu.
- `packages/sdk-typescript/src/daemon/DaemonClient.ts`
  - `listSessionArtifacts(sessionId, opts?, clientId?)`
  - `addSessionArtifact(sessionId, artifact, clientId?)`
  - `removeSessionArtifact(sessionId, artifactId, clientId?)`
- `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`
  - `artifacts(opts?)`
  - `addArtifact(artifact)`
  - `removeArtifact(artifactId)`
- `packages/sdk-typescript/src/index.ts`
  - Exportiert Typen.

SDK singular add wird auf die bridge plural mutation gemappt: `addSessionArtifact(a)` wird als `addSessionArtifacts(sessionId, [a])` verpackt, gibt das vollständige `DaemonSessionArtifactMutationResult` zurück und verwirft keine `removed` changes durch Eviction.

### 8.6 Phase D: Explizite Registrierung von `record_artifact`

Änderungen:

- `packages/core/src/tools/tool-names.ts`
  - Fügt `RECORD_ARTIFACT: 'record_artifact'` hinzu.
- Neue Datei `packages/core/src/tools/record-artifact.ts`
  - Implementiert `RecordArtifactTool`.
  - Parameter verwenden `workspacePath` / `managedId` / `url`, beliebige lokale absolute Pfade werden nicht akzeptiert.
  - Akzeptiert kein `storage: 'published'` und keine `url + managedId` published-Ausnahmen.
  - Gibt `ToolResult.artifacts` aus und nutzt die V1 store/event/list-Pipeline.
- `Config.createToolRegistry`
  - Feature-gated oder Skill/Extension-Opt-in-Registrierung, um zu vermeiden, dass allen Sessions für das Modell sichtbare Tools hinzugefügt werden.

### 8.7 Phase E: Explizite Registrierung von Hook-Artifacts

Änderungen:

- `packages/core/src/hooks/types.ts`
  - `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`.
- `packages/core/src/hooks/hookAggregator.ts`
  - `mergeWithOrLogic()` verkettet `artifacts` mehrerer Hooks, kein Last-Writer-Wins.
- `packages/core/src/core/toolHookTriggers.ts`
  - Fügt `artifacts?: ToolArtifact[]` zu `PostToolUseHookResult` / `PostToolBatchHookResult` hinzu.
- `packages/core/src/core/coreToolScheduler.ts`
  - Passt die PostToolUse / PostToolBatch Artifact-Propagationspfade des Core-Schedulers an.
- `packages/cli/src/acp-integration/session/Session.ts`
  - Passt die PostToolUse-Artifact-Propagationspfade der ACP-Session an.
- Beide PostToolUse-Pfade nutzen denselben Hook-Artifact-Collection-Helper.
- ACP-Session V1 deklariert keine PostToolBatch-Artifact-Unterstützung; wenn das Produkt Batch-Artifacts für die Daemon-Hauptsitzung erfordert, muss ein echter PostToolBatch-Callsite in der ACP-Session hinzugefügt werden, anstatt sich auf den Nicht-Daemon-Hauptsitzungspfad von `coreToolScheduler.ts` zu verlassen.
- Andere Runtimes, die bereits Batch-Level-Artifact-Benachrichtigungen haben, können diese über `qwen/notify/session/artifact-event` an die Bridge senden.
- Der BridgeClient extrahiert Batch-Level-Artifacts aus `qwen/notify/session/artifact-event` und durchläuft dieselbe Validierung und Upsert-Logik.

### 8.8 Phase F: Explizite Registrierung von Client-POST / SDK-Add

Änderungen:

- `packages/cli/src/serve/server.ts`
  - Fügt `POST /session/:id/artifacts` hinzu, nutzt `mutate({ strict: true })`.
  - Fügt `DELETE /session/:id/artifacts/:artifactId` hinzu, nutzt `mutate({ strict: true })`.
  - Validiert den Body.
  - Setzt `source` auf `client`.
  - Konvertiert in ein ein-elementiges `SessionArtifactInput[]` und ruft `addSessionArtifacts()` der Bridge auf.
  - POST akzeptiert kein `storage: 'published'` oder `trustedPublisher`.
  - DELETE ruft `removeSessionArtifact()` der Bridge auf; gibt leere `changes[]` zurück und veröffentlicht keine SSE, wenn das Artifact nicht mehr existiert.
  - Veröffentlicht `artifact_changed`, zuerst created/updated, dann removed.
- Artifact-Add fügt keine neue singuläre Bridge-Mutation hinzu; alle neuen Einstiegspunkte nutzen `addSessionArtifacts()` / `upsertMany()`, um Drift bei Validierung, Coalescing und Eviction zu vermeiden. Artifact-Remove nutzt das separate `removeSessionArtifact()`, da es nach der vom Server zugewiesenen Artifact-ID löscht und nicht an der Input-Validierung / Identity-Coalescing teilnimmt.

- SDK-Ergänzungen:
  - `DaemonClient.addSessionArtifact(sessionId, artifact, clientId?)`
  - `DaemonSessionClient.addArtifact(artifact)`
  - `DaemonClient.removeSessionArtifact(sessionId, artifactId, clientId?)`
  - `DaemonSessionClient.removeArtifact(artifactId)`

## 9. Sicherheitsgrenzen

### 9.1 URL

- Normale Link-Artifacts erlauben nur `http:` / `https:`.
- Muss mit WHATWG `new URL(input)` geparst und `parsed.protocol` geprüft werden, String-Präfix-Prüfungen sind verboten.
- Vor dem Speichern `parsed.username` / `parsed.password` ablehnen oder entfernen, um URL-Credential-Leaks zu vermeiden.
- `record_artifact` / Hook / Client-POST erlauben kein `file://`.
- Die von `ArtifactTool` zurückgegebene `file://` published URL bleibt eine Ausnahme, da sie von einem autorisierten Publish stammt; in Remote-Daemon-Szenarien sollte die `https:` URL des Remote-Publishers bevorzugt werden.
- Der Daemon fetcht keine URLs.
- Der Client zeigt den Host an.
- URLs werden nicht automatisch geöffnet.
- Der Client darf externe URLs nicht automatisch in `<img>`, `<video>`, `<audio>`, `iframe` oder ähnliche Vorschau-Elemente einfügen, die Netzwerkanfragen auslösen, nur weil `kind: 'image' | 'video' | 'audio' | 'html'` ist. V1 zeigt für externe URLs nur Icon, Titel, Host und einen Klick-Entry an; Remote-Vorschau erfordert ein explizites Klicken des Benutzers oder wird später über eine separate Preview-Capability und Sandbox-Strategie aktiviert.
- Der Client sollte bei privaten Netzwerkadressen wie Loopback, RFC 1918, Link-Local, Metadata-Service usw. warnen oder blockieren; Daemon V1 löst kein DNS auf und übernimmt nicht die endgültige Entscheidung für den SSRF-Schutz.

### 9.2 Path

- Gibt nach außen nur `workspacePath` zurück, was ein Workspace-relativer Pfad sein muss.
- Pfade außerhalb des Workspaces werden nicht als File-Artifact offengelegt.
- Wenn `record_artifact` / Hook / Client-POST `workspacePath` übergeben, muss dieser innerhalb des Workspaces liegen.
- Validierungsalgorithmus siehe Abschnitt 7.1: `path.resolve` + `path.relative` Containment-Check, bei existierendem Ziel zusätzlich `fs.realpath` Symlink-Escape-Check; wenn das Ziel nicht existiert, kann das Artifact in den Store aufgenommen werden, muss aber als `missing` markiert werden, nachfolgende GET/Status-Refreshs führen dieselbe Validierung erneut aus.
- Lehnt `..`-Escapes, absolute Pfad-Escapes, Symlinks außerhalb des Workspaces, `~/.qwen`, `/tmp` und andere lokale externe Pfade ab.
- `managedId` darf nur auf Daemon-verwalteten Storage verweisen; darf nach dem Trimmen nicht leer sein, lehnt Pfadtrennzeichen, `..`, Steuerzeichen und lokale absolute Pfad-Semantik ab.

### 9.3 Metadata

- Größenbeschränkung, z. B. maximal 4 KB nach JSON-Stringify.
- Erlaubt nur Primitive Values.
- Keine verschachtelten Objekte/Arrays, um UI und Persistenz nicht zu komplex zu machen.
- Keine Secrets, Token, Cookies, signierten URLs, Private Keys oder Zugriffszugangsdaten.
- Wenn Metadata-String-Werte in der UI angezeigt werden, müssen sie als nicht vertrauenswürdiger Plain-Text gerendert oder escaped werden; Metadata ist kein HTML/Markdown-Erweiterungspunkt.
- V1 bietet keine Felder ohne Konsumenten wie `visibility`, `sensitivity`, `expiresAt`, `sourceId` usw.; die Artifact-Visibility ist fest auf die aktuelle Session-lokale Semantik beschränkt.
- Audit-Dimensionen werden durch `source` / `toolCallId` / `toolName` / `hookName` / `extensionId` / `clientId`, `createdAt`, `updatedAt` des ersten Registrierers abgedeckt.
- Nachfolgende Registrierungen derselben Identity überschreiben standardmäßig die Anzeigefelder des ersten Registrierers nicht; die einzige Ausnahme ist das in Abschnitt 7 definierte vertrauenswürdige `external_url -> published`-Upgrade, bei dem der Publisher `title` / `description` überschreiben kann. Metadata erlaubt nur die in Abschnitt 7 definierte kontrollierte Anreicherung, um Metadata-Injektion über Quellen hinweg zu vermeiden.

### 9.4 Text Fields

- `title` / `description` sind Plain-Text, kein HTML und kein Markdown.
- Die Daemon-Validierung muss Länge, Trimmen und Ablehnung von ASCII-Steuerzeichen prüfen; Substring-Blacklists dürfen nicht als XSS-Sicherheitsgrenze betrachtet werden.
- Alle Textfelder, die in die UI gelangen könnten, einschließlich `title`, `description`, `metadata` String-Wert, `toolName`, `hookName`, `extensionId`, `clientId`, müssen vom Client als nicht vertrauenswürdiger Text gerendert oder HTML-escaped werden, direktes Einfügen über `innerHTML` ist verboten.

### 9.5 Anti-spam

- Maximal 200 Artifacts pro Session.
- Soft-Reservation standardmäßig `tool: 100`, `client: 50`, `hook: 50`, ungenutztes Kontingent kann von anderen Quellen ausgeliehen werden.
- `record_artifact` registriert nur 1 Artifact pro Tool-Call.
- `POST /session/:id/artifacts` durchläuft das bestehende Rate-Limit / Mutation-Gate.
- Eviction muss `artifact_changed` / `removed` Events einzeln senden.
- Der Client kann nach `source`/`toolName` gruppieren oder einklappen.

### 9.6 Validation Diagnostics

- Bei fehlgeschlagener Parametervalidierung von `record_artifact` wird ein Tool-Fehler zurückgegeben, kein Artifact erzeugt.
- Bei fehlgeschlagener Body-Validierung von `POST /session/:id/artifacts` wird 400 zurückgegeben.
- Ein einzelnes fehlerhaftes Artifact in `_meta.artifacts`, Hook-Artifacts oder `artifact-event` sollte das ursprüngliche Tool/Session-Event nicht zerstören; die Bridge sollte dieses Artifact überspringen und einen Warning-Level-Log protokollieren.
- Der Warning-Log muss mindestens `sessionId`, `source`, `toolName` / `hookName` / `extensionId` / `clientId`, das fehlgeschlagene Feld und den Grund enthalten; keine secret-ähnlichen Metadata-Werte protokollieren.
- Der Debug-Log kann den bereinigten und in der Länge gekürzten Payload des abgelehnten Artifacts protokollieren.
- Wenn bestehende Telemetrie/Metrics-Infrastruktur verfügbar ist, füge einen Validation-Rejection-Counter hinzu, getaggt nach `source` und `reason`; wenn vorübergehend keine Metrics verfügbar sind, sind Logs die Mindestanforderung für V1.

## 10. Abgrenzung zu "normalen Links"

Das Artifact-Panel auf der rechten Seite zeigt nur deklarative Artifacts an; normale Links können weiterhin im Chat-Text angezeigt werden.

Gründe für keine automatische Extraktion:

- Dokumentationslinks, Referenzlinks und Debug-Links in normalen Antworten würden massenhaft fälschlicherweise im Artifact-Bereich landen.
- URLs könnten Beispiele, Templates, unvollständige Entwürfe oder Fehlerausgaben sein.
- Automatische Extraktion würde dem Modell die Kontrolle entziehen, "welche Links für die spätere Nutzung durch den Benutzer wertvoll sind".
- Aus Sicherheitsgründen ist eine explizite Registrierung einfacher mit Quellenkennzeichnung und UI-Warnungen umsetzbar.

Wenn das Geschäftsumfeld eine starke Notwendigkeit zur URL-Extraktion aus Text hat, sollte dies als optionale Client-UX umgesetzt werden:

- Nur in der Nähe des Chat-Textes anzeigen.
- Nicht in den Daemon-Artifact-Store aufnehmen.
- Kein `artifact_changed` auslösen.

## 11. Nutzung durch Skill / Agent

Nachdem V1 `record_artifact` bereitstellt, kann ein Skill oder eine `agent.md` Folgendes enthalten:

```md
当你根据工具结果构造出可供用户查看的业务资源 URL 时，调用 record_artifact 工具登记它。

登记规则：

- title 使用资源的人类可读名称。
- kind 使用 link。
- storage 使用 external_url。
- url 使用最终可点击 URL。
- metadata.resourceType 填资源类型，例如 data_platform_resource、scheduler_task。
- 不要把普通参考文档链接登记为 artifact。
```

Nach der Modellausführung:

1. Business-Tool aufrufen, um Ressourcen-ID, Task-ID, Node-ID zu erhalten.
2. URL gemäß Skill-Regeln zusammenstellen.
3. `record_artifact` aufrufen.
4. Der Link erscheint im Artifact-Bereich auf der rechten Seite des Daemons.

Dieser Ansatz erfordert keine Hook-Programmierung im Skill und keinen Extension/Plugin-Code, was ihn für die meisten Business-Regeln am besten geeignet macht.

## 12. Nutzung durch Hook / Extension

Nachdem V1 Hook-Artifacts bereitstellt, kann eine Extension in `qwen-extension.json` oder `hooks/hooks.json` einen PostToolUse-Hook bereitstellen:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__data_platform__get_resource",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/table-artifact.js"
          }
        ]
      }
    ]
  }
}
```

Die aktuelle Variablenersetzung für qwen-code Extension/Hook unterstützt weiterhin `${CLAUDE_PLUGIN_ROOT}`; wenn später neue Qwen-spezifische Root-Variablen eingeführt werden, kann das Beispiel synchron mit der Implementierung migriert werden.

Skript-Stdout:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "用户画像资源详情",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "data_platform_resource"
        }
      }
    ]
  }
}
```

Dies eignet sich für Enterprise-Plugins: Die Logik "Wie man aus Tool-Ergebnissen eine Business-URL zusammenstellt" wird in der Extension festgeschrieben, anstatt in jeden Prompt geschrieben zu werden.

## 13. Testplan

### 13.1 Phase A core

Abdeckung:

- `ToolResult.artifacts` Typ-Kompilierung.
- `ArtifactTool` gibt erfolgreich ein HTML-Artifact mit `storage: 'published'` zurück.
- `ArtifactTool` legt den lokalen absoluten Pfad von Qwen Home nicht als `workspacePath` offen.
- Standardinferenzregeln für `ToolArtifact.kind` / `storage` sind durch Unit-Tests abgedeckt.

Befehl:

```bash
cd packages/core && npx vitest run src/tools/artifact/artifact-tool.test.ts
```

### 13.2 Phase B cli session

Abdeckung:

- `ToolCallEmitter.emitResult()` gibt `_meta.artifacts` aus.
- `toolResult.artifacts` wird an `emitResult()` übergeben.
- Das abgeschlossene `ArtifactTool`-Session-Update setzt intern `trustedPublisher: true` über die Bridge-seitige Ingest-Option; `record_artifact`, andere Tool-Results, Hook-Payloads und Client-POST setzen dies nicht, und der BridgeClient darf es auch nicht aus Artifact-Payload-Feldern ableiten.
- Normale Quellcodeänderungen durch `write_file`/`edit`/`notebook_edit` leiten nicht automatisch ein Artifact ab.
- `read_file`/`grep`/`glob`/`shell` leiten keine Artifacts ab.
- Bei Tool-Fehlern werden keine Artifacts des fehlgeschlagenen Tool-Results gesammelt; diagnostische Artifacts, die explizit vom PostToolUse-Hook zurückgegeben werden, können weiterhin in den Store aufgenommen werden.
- Hook-Artifacts im Fehlerpfad hängen nicht von `_meta.artifacts` des erfolgreichen Results ab.

Befehle:

```bash
cd packages/cli && npx vitest run src/acp-integration/session/emitters/tool-call-emitter.test.ts
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

### 13.3 Phase C-1 acp-bridge

Abdeckung:

- `SessionArtifactStore` created/updated/removed.
- Anreicherung von `ToolArtifact` zu `DaemonSessionArtifact`.
- `SessionArtifactInput` ist der einheitliche interne Input-Typ für alle Einstiegspunkte.
- Standardinferenz für `kind` / `storage`, deckt published->html, html/image/video/audio/pdf/notebook/file ab.
- Deduplizierung der `workspacePath` / `managedId` / URL-Identity, und die Identity enthält keine `source`; die Registrierung derselben Ressource über verschiedene Quellen hinweg wird zu einem einzigen Artifact zusammengeführt.
- Normale Artifacts, die mehrere Primary-Locators gleichzeitig tragen, werden abgelehnt; nur `trustedPublisher: true` und `storage: 'published'` erlauben `url + managedId`, die Identity basiert nur auf der `url`.
- Wenn Hook, Client-POST, `record_artifact` oder normale Tool-Results `storage: 'published'` fälschen, wird dies abgelehnt oder übersprungen und mit einer Warnung protokolliert.
- `managedId`-Normalisierung: Trimmen, Ablehnung von Leerwerten, Pfadtrennzeichen, `..`, Steuerzeichen, keine Case-Faltung.
- URL-Validierung: Scheme/Host lowercase, Default-Port-Normalisierung, Fragment beibehalten, Query-Reihenfolge beibehalten, Userinfo-Ablehnung/Entfernung.
- `url` speichert die bereinigte klickbare URL, die Identity verwendet die interne `identityUrl`, beides wird nicht vermischt.
- Pfadvalidierung: `../../etc/passwd`, absolute Pfade außerhalb des Workspaces, Symlink-Escapes werden abgelehnt; nicht existierende Pfade werden beim Eintritt in den Store als `missing` markiert, GET-TTL-Refreshs führen Containment/Realpath-Checks erneut durch.
- Title/Description-Validierung: Längenbeschränkung, Trimmen, Ablehnung von Steuerzeichen, Plain-Text, Ablehnung von offensichtlichen HTML/Script-Payloads.
- Metadata-Validierung: Größenbeschränkung, nur Primitives, Ablehnung von verschachtelten Objekten/Arrays.
- Upsert derselben Identity verwendet First-Writer-Wins für Anzeige- und Quellenfelder.
- Dieselbe URL-Identity unterstützt das vertrauenswürdige `external_url -> published` Ressourcen-Upgrade, ergänzt `managedId` / `kind` / `mimeType` und erlaubt dem Publisher, Platzhalter-`title` / `description` zu überschreiben.
- Nachfolgende Tool/Client-Metadata können nur fehlende Keys hinzufügen, nicht vorhandene Keys überschreiben, nach dem Zusammenführen müssen die 4KB- und Nur-Primitive-Einschränkungen erneut erfüllt sein.
- Nachfolgende Metadata-Anreicherung durch Hooks wird standardmäßig ignoriert.
- Doppelte Identitäten innerhalb desselben Batches bestimmen den Owner nach `receivedSeq` / Eingabe-Array-Reihenfolge und erzeugen in `changes[]` nur eine einzige endgültige Änderung.
- `retentionSource` wird bei der Erstellung zugewiesen und nicht aktualisiert; `clientRetained` ist von `retentionSource` getrennt; `insertSeq` wird bei der Erstellung zugewiesen und nicht aktualisiert.
- Soft-Reservation-Eviction: ungenutztes Kontingent kann ausgeliehen werden, `missing` wird bevorzugt gekürzt, `client-retained` zuletzt gekürzt, stabile Sortierung nach `createdAt + insertSeq`, und einzeln gesendete `removed` Events mit `reason: 'eviction'`.
- Vor der Verwendung der `missing`-Priorität bei der Eviction wird der Status der Kandidaten-Workspace-Artifacts aktualisiert, um zu vermeiden, dass ein veralteter `missing`-Cache bereits wiederhergestellte Dateien bevorzugt kürzt.
- Die Eviction kürzt nicht bevorzugt `missing` Artifacts, die gerade in diesem Batch erstellt wurden; wenn der Batch selbst die verbleibende Kapazität überschreitet, werden die überschüssigen neuen Inputs dieses Batches verworfen und protokolliert, bevor Änderungen erzeugt werden, es entsteht kein `created` + `removed` für dieselbe Identity.
- `clientRetained` durchbricht nicht das globale Limit von 200; bei vollständigem `client-retained` werden weiterhin die ältesten Elemente gekürzt.
- Fehlerhafte Artifacts erzeugen Warning-Logs / Diagnostics, beeinflussen das ursprüngliche Event nicht.
- `_meta.artifacts` wird in den Store geschrieben.
- `artifact_changed` wird veröffentlicht.
- `upsertMany()` / `addSessionArtifacts()` gibt `DaemonSessionArtifactMutationResult` zurück, das Eviction-Änderungen enthält.
- `removeSessionArtifact()` gibt eine `removed`-Änderung mit `reason: 'explicit'` zurück.

Befehle:

```bash
cd packages/acp-bridge && npx vitest run src/sessionArtifacts.test.ts
cd packages/acp-bridge && npx vitest run src/bridgeClient.test.ts
```

### 13.4 Phase C-2 serve

Abdeckung:

- `/capabilities` enthält `session_artifacts`.
- `GET /session/:id/artifacts` gibt eine leere Liste zurück.
- Gibt ein Envelope zurück, wenn Artifacts vorhanden sind.
- Das Envelope gibt nicht das absolute `workspaceCwd` des Hosts zurück.
- Unbekannte Sessions geben den bestehenden Fehler zurück.
- Beim TTL-Refresh für workspace artifact GET wird ein Best-Effort-Stat durchgeführt; bei fehlenden Dateien wird `status: 'missing'` zurückgegeben, nach Wiederherstellung der Datei `status: 'available'`.
- Der GET-TTL-Refresh führt erneut eine Workspace-Containment- und Symlink-Realpath-Prüfung durch; bei einem Symlink-Escape wird `missing` zurückgegeben.
- Der GET-Status-Refresh veröffentlicht kein `artifact_changed`; für managed/URL-Artifacts wird kein lokaler Stat durchgeführt.
- GET verwendet den Status-Cache/TTL, um bei jedem Hot-Read synchrone Stats für alle Artifacts zu vermeiden.

Befehl:

```bash
cd packages/cli && npx vitest run src/serve/server.test.ts
```

### 13.5 Phase C-3 SDK

Abdeckung:

- Die Route `listSessionArtifacts()` ist korrekt.
- `artifact_changed` Known-Event-Narrowing; das Event-Artifact ist ein vollständiges `DaemonSessionArtifact`.
- Der öffentliche Index exportiert die neuen Typen.
- Der Typ des öffentlichen Response-Enum ist eine Open Union; der Client hat ein Fallback für unbekannte kind/status/source/storage.
- Das SDK Singular-Add umschließt das Bridge-Plural-Add und gibt das vollständige Mutation-Result zurück; das SDK-Remove ruft die DELETE-Route auf.

Befehle:

```bash
cd packages/sdk-typescript && npx vitest run src/daemon/DaemonClient.test.ts
cd packages/sdk-typescript && npx vitest run src/daemon/events.test.ts
```

### 13.6 Phase D/E/F Tests für explizite Registrierung

`record_artifact`:

- Validiert title / workspacePath / managedId / url.
- Leere `workspacePath + managedId + url` sind nicht erlaubt, ebenso wenig wie die gleichzeitige Übergabe mehrerer Primary Locators bei normalen Eingaben.
- `storage: 'published'` ist nicht erlaubt.
- Nicht unterstützte URL-Schemes sind nicht erlaubt.
- URL-Userinfo wird abgelehnt oder bereinigt.
- Gibt `ToolResult.artifacts` zurück.
- `llmContent` gibt ein strukturiertes Registrierungsergebnis zurück; pro Tool-Call wird nur ein Artifact registriert.

Hook-Artifacts:

- `HookOutput.hookSpecificOutput.artifacts` gelangt über `createHookOutput()` und `toolHookTriggers.ts` in `PostToolUseHookResult` / `PostToolBatchHookResult`.
- `mergeWithOrLogic()` in `hookAggregator.ts` verkettet mehrere Hook-Artifacts.
- Sowohl der Pfad in `coreToolScheduler.ts` als auch der in ACP `Session.ts` können PostToolUse-Artifacts propagieren.
- Beide PostToolUse-Pfade verwenden denselben gemeinsamen Helper für die Hook-Artifact-Sammlung.
- Die ACP-Main-Session deklariert keine PostToolBatch-Artifacts; sollten später echte Callsites hinzugefügt werden, müssen diese durch Unit-Tests abgedeckt werden.
- PostToolUse-/PostToolUseFailure-Hook-Artifacts gelangen über die `qwen/notify/session/artifact-event` extNotification separat in die Bridge, unabhängig von `_meta.artifacts` eines erfolgreichen Tool-Results.
- Laufzeiten mit bestehenden Batch-Notifications können über `qwen/notify/session/artifact-event` in den Store geschrieben werden.
- Hook-Artifacts durchlaufen dieselbe Validierung wie andere Eingänge.
- Die `source` im Hook-Payload wird von der Bridge basierend auf dem Transport-Kontext abgeleitet; eine Tool-Source oder ein Trusted Publisher kann nicht gefälscht werden.
- Bei Tool-Fehlern können vom Hook zurückgegebene Error-/Dashboard-Artifacts weiterhin in den Store gelangen.

Client-POST / SDK-Add:

- `POST /session/:id/artifacts` führt einen erfolgreichen Upsert durch.
- `POST` gibt `DaemonSessionArtifactMutationResult` zurück, welches created/updated sowie eviction-removed-Änderungen enthält.
- Wenn `POST` Upsert + Eviction auslöst, wird validiert, dass jedes `changes[]`-Element synchron als `artifact_changed` SSE-Event veröffentlicht wird, wobei created/updated vor removed erfolgt.
- `POST` wird bei fehlender Autorisierung oder fehlendem Mutation-Token abgelehnt.
- `POST` gibt 400 zurück bei Pfaden außerhalb des Workspace, Path Traversal oder Symlink-Escape.
- `POST` gibt bei `storage: 'published'`, mehreren Primary Locators oder überschrittenen Metadata-Grenzen ein strukturiertes Fehler-Envelope zurück.
- `POST` schreibt über einen einzigen Pfad in der Bridge `addSessionArtifacts()`.
- Der Body von `DaemonClient.addSessionArtifact()` ist korrekt.
- Wenn `DELETE /session/:id/artifacts/:artifactId` zutrifft, wird eine removed-Änderung mit `reason: 'explicit'` zurückgegeben und das entsprechende SSE-Event veröffentlicht, ohne die zugrunde liegende Datei oder URL zu löschen.
- Wenn `DELETE /session/:id/artifacts/:artifactId` nicht zutrifft, wird idempotent ein leeres `changes[]` zurückgegeben und kein SSE-Event veröffentlicht.

### 13.7 Paketübergreifende Integrationstests

Abdeckung der vollständigen Pipeline:

1. Das Tool gibt `ToolResult.artifacts` zurück.
2. `ToolCallEmitter` schreibt in `_meta.artifacts`.
3. `BridgeClient` extrahiert Artifacts aus dem Event.
4. `SessionArtifactStore` validiert / normalisiert / führt Upsert durch.
5. SSE sendet `artifact_changed`.
6. `GET /session/:id/artifacts` gibt dasselbe Artifact zurück.
7. Nach einem Disconnect und Reconnect kann der Client durch erneutes Abrufen des Snapshots den aktuellen In-Memory-Zustand wiederherstellen.
8. Nach dem Auffüllen der Artifacts bis nahe an das Limit wird ein neues Artifact hinzugefügt; es wird assertiert, dass das SSE sowohl ein created- als auch ein removed-Event mit `reason: 'eviction'` enthält, und anschließend gibt GET nur den bereinigten Zustand zurück.

### 13.8 Manuelle Abnahme

Szenario A: Datei-Artefakte

1. ArtifactTool veröffentlicht `lineage.html`.
2. `GET /session/:id/artifacts` gibt das HTML-Artifact mit `storage: 'published'` zurück.
3. SSE empfängt `artifact_changed`.

Szenario B: Normale Quellcode-Bearbeitung gelangt nicht in den Artefakt-Bereich

1. Der Agent ändert Quellcodedateien.
2. Dateiänderungen / Diffs werden normal angezeigt.
3. Die Artifact-Liste ändert sich nicht.

Szenario C: Explizite Business-Link-Artefakte

1. Der Skill fordert das Modell auf, eine interne Ressourcen-Detail-URL zusammenzustellen.
2. Das Modell ruft `record_artifact` auf.
3. Im Artefakt-Bereich auf der rechten Seite erscheint ein Link-Artifact.

Szenario D: Hook-Artefakte

1. Die Extension registriert einen PostToolUse-Hook.
2. Der Hook gibt basierend auf dem Tool-Output Artifacts zurück.
3. Im Artefakt-Bereich auf der rechten Seite erscheint ein Hook-Source-Artifact.

Szenario E: Normale Links gelangen nicht in den Artefakt-Bereich

1. Der Assistent antwortet mit einem Markdown-Link.
2. Die Artifact-Liste ändert sich nicht.

## 14. Abnahmekriterien

Nach der vollständigen Implementierung der V1-Funktionen muss mindestens Folgendes erfüllt sein:

- Das `session_artifacts`-Feature ist vorhanden.
- `GET /session/:id/artifacts` ist verfügbar.
- Das `artifact_changed`-Event ist verfügbar.
- `ArtifactTool` generiert ein veröffentlichtes HTML-Artifact.
- `ToolResult.artifacts` kann in den Daemon-Artifact-Store gelangen.
- `record_artifact` kann Link-/Workspace-Artifacts registrieren und ist feature-gated oder opt-in registriert.
- Hooks können über `hookSpecificOutput.artifacts` Artifacts injizieren, wobei mehrere Hook-Artifacts verkettet werden.
- Clients können über `POST /session/:id/artifacts` Artifacts injizieren.
- Clients können über `DELETE /session/:id/artifacts/:artifactId` fehlerhaft registrierte Artifacts explizit entfernen.
- Normale `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` gelangen nicht automatisch in die Artifact-Liste.
- Normale Text-URLs des Assistenten gelangen nicht in die Artifact-Liste.
- Das SDK kann Artifacts listen/hinzufügen/entfernen und `artifact_changed` erkennen.
- Das SDK-Remove bildet für nicht mehr vorhandene Artifacts korrekt ein idempotentes leeres Ergebnis ab.
- Es gibt Unit-Tests für die Sicherheitsgrenzen von workspacePath / URL / Metadata.
- Es gibt Unit-Tests für die managedId-Normalisierung.
- Es gibt Unit-Tests für First-Writer-Wins bei gleicher Identität, Published-Upgrade, kontrollierte Metadata-Anreicherung und Soft-Reservation-Eviction.
- Die Eviction benachrichtigt den Client einzeln über die Entfernung.
- Bei Validierungsfehlern gibt es Warning-Logs / Diagnosen.
- Die drei Eingänge hook/client/record_artifact durchlaufen dieselbe Validierung.
- `npm run build && npm run typecheck` ist erfolgreich.

## 15. Empfohlene Implementierungsreihenfolge

Für V1 wird intern folgende Implementierungsreihenfolge empfohlen; dies ist ein Engineering-Zeitplan, keine Funktionsaufteilung:

1. `ToolArtifact` + `ToolResult.artifacts?`
2. `ArtifactTool` strukturierte Artifacts
3. `ToolCallEmitter._meta.artifacts`
4. `Session.runTool()` sammelt nur `toolResult.artifacts`
5. `SessionArtifactStore` Validierung / Normalisierung / Anreicherung / Upsert
6. BridgeClient konsumiert `_meta.artifacts`
7. `GET /session/:id/artifacts`
8. SDK list/event Typen
9. `RecordArtifactTool`
10. Hook-Output-Artifacts
11. `qwen/notify/session/artifact-event`
12. `POST /session/:id/artifacts`
13. SDK addArtifact
14. managed / published Storage-Referenzen vervollständigen
15. Protokoll-Dokumentation und Tests

## 16. Weitere Roadmap

Phase 2: Verlaufswiederherstellung

- Artifacts werden in die Chat-Recording-Metadaten geschrieben.
- HistoryReplayer spielt Artifacts ab.
- Nach `session/load` kann die Artifact-Liste wiederhergestellt werden.

Phase 3: Details und Vorschau

- `GET /session/:id/artifacts/:artifactId`
- Vorschau-Metadaten.
- Vorschaustrategien für Bilder/PDF/HTML.

Phase 4: Sichere dynamische Vorschau

- Unabhängige Sandbox-Origin.
- iframe-Sandbox.
- HTML/React-Artifact-Shim.

Phase 5: Langzeitspeicherung

- OSS/MinIO.
- Retention Policy.
- Pin/Lösch-/Versionshistorie.

## 17. Zusammenfassung

Links können Artifacts sein, müssen aber explizit registriert werden. Der Artefakt-Bereich auf der rechten Seite sollte nicht automatisch alle Textlinks sammeln.

V1 ist nach außen hin eine vollständige Funktion und besteht intern aus einem einheitlichen Store und vier Arten von Eingängen:

1. **Tool-Eingang**: `ToolResult.artifacts` / `ArtifactTool` erzeugen strukturierte Artifact-Metadaten.
2. **Modell/Skill-Eingang**: Das `record_artifact`-Tool.
3. **Hook/Extension-Eingang**: `hookSpecificOutput.artifacts`.
4. **Client-Eingang**: `POST /session/:id/artifacts`.

Alle diese Eingänge münden schließlich in denselben `SessionArtifactStore`, werden über dasselbe `GET /session/:id/artifacts` abgefragt und aktualisieren die UI über dasselbe `artifact_changed` SSE-Event. Dies deckt Business-Links, Dateien, HTML, Bilder, Videos und andere Artefakte ab, während das Protokoll einfach, die Herkunft klar und die Grenzen kontrollierbar bleiben. Die wichtigste Grenze ist: Artifacts sind deklarierte Session-Outputs, keine Ansammlung aller normalen Dateiänderungen oder normalen Links.