# Qwen Code Daemon Session Artifacts V2 – Persistenzdesign

Dieses Dokument setzt die V1-Session-Artifact-API aus PR #5895 fort und entwirft die V2-Persistenzfähigkeiten. Das V1-Design findet sich im selben Verzeichnis unter [session-artifacts-daemon-api-implementation-design.md](./session-artifacts-daemon-api-implementation-design.md).

Das Ziel von V2 ist es, Artifact-Metadaten nach Daemon-Neustarts und nach Session-Load/Replay wiederherstellbar zu machen, ohne die V1-Live-Session-Semantik zu brechen. Der aktuelle PR kopiert, friert oder hostet keine Artifact-Inhalte; Workspace-Dateien speichern nur Pfad, size, mtimeMs und sha256 als Integritätsprüfung nach der Wiederherstellung.

## 1. Designentscheidungen

V2 ist eine Metadata-Persistenzphase. Der Implementierungsumfang von PR #6259 ist auf Metadata-Restore, Artifact-JSONL-Journal/Snapshot/Rebuild/Fork-Remap, die Wiederherstellung von Artifact-Metadaten nach Daemon-Restart/Load/Replay sowie die Metadata-Persistenz-Exposition über REST/ACP/SDK收敛 konvergiert. Content Retention (Workspace-Content-Pin, Session-scoped Managed Copy, Manifest, Quota, TTL, Session-scoped GC/fsck) liegt nicht im aktuellen Scope; falls es zukünftig einen echten Audit-/Archivierungsbedarf gibt, sollte dies als neues Content-Archive-Design neu geprüft werden. Clients sollten nicht aus dem Phasennamen „V2" auf Features schließen, sondern die Capability lesen.

Aktuelle Fähigkeiten:

1. Metadata-Restore: stellt standardmäßig die strukturierten Metadaten und Ressourcenreferenzen der Artifacts wieder her, ohne den tatsächlichen Inhalt zu kopieren.
2. Workspace-Integritätsprüfung: Workspace-Artifacts erfassen bei der Registrierung size + mtimeMs + sha256; bei Restore / GET wird anhand der Live-Datei `available` / `missing` / `changed` zurückgegeben.

Zugehörige Capabilities:

- `session_artifacts_persistence`: unterstützt Metadata-Persistenz und Session-Load/Replay-Wiederherstellung.
- `session_artifacts_content_retention`: wird aktuell nicht deklariert; falls das Content-Archive-Design später wieder aufgenommen wird, darf sie erst deklariert werden, wenn Inhaltskopie/-Hosting, Quota, Manifest und GC/fsck alle abgeschlossen sind.

Kernprinzipien:

- Der V1-`SessionArtifactStore` bleibt der autoritative In-Memory-Index der Live-Session.
- V2 fügt ein JSONL-Artifact-Journal/Snapshot hinzu, das zum Seeden des Anfangszustands dient, wenn Daemon-seitig der Live-Store erstellt wird; der JSONL-Append muss durch den Core-/ACP-Child-Pfad erfolgen, der aktuell das Chat-Recording besitzt; der Daemon-seitige Store darf nicht direkt ins Transkript schreiben.
- V2 ist standardmäßig JSONL-only. Ein Sidecar-Cache gehört nicht zu den V2-Veröffentlichungskriterien; nur wenn die gemessenen Session-Load-Kosten inakzeptabel sind, wird ein entfernbarer Cache separat entworfen.
- Inhalte entfernter URLs werden nicht lokal abgerufen.
- Workspace-Dateien werden standardmäßig nicht kopiert.
- Vom Client übergebene `source`, `clientId`, `trustedPublisher` werden nicht als Autorisierungsgrundlage behandelt.
- Bei der Wiederherstellung muss neu validiert werden; alten Metadaten auf der Platte wird nicht vertraut.

Wichtige Verengungen des aktuellen PRs:

- Die Content-Retention-Public-API, Managed Content Store, pin/unpin, deleteContent, quota/manifest/fsck/gc und die Capability `session_artifacts_content_retention` werden nicht in PR #6259 geliefert. Der aktuelle PR behält nur den Downgrade-/Strip-Kompatibilitätspfad für alte `pinned` / `contentRef` Journal-Payloads, damit alte Aufzeichnungen den Metadata-Restore nicht brechen.
- Die unten behaltenen pin/save-, Content-Quota-, Managed-Content-GC/fsck-Details sind der Future-Content-Archive-Blueprint, nicht der Wire-Contract oder die Abnahmekriterien von PR #6259; außer wenn ein Abschnitt ausdrücklich als PR-#6259-HTTP-Mapping / Metadata-Verhalten markiert ist, darf die Implementierung diese APIs oder Capabilities in #6259 nicht exponieren.
- Die aktuelle Live-Ansicht und die persistierten Metadaten verwenden dieselbe sichtbare 200-Einträge-Menge. Um Over-Restore nach Neustarts zu vermeiden, schreiben dauerhafte/wiederherstellbare Evictions beim Überschreiten des Limits ein Remove-Event mit `reason: "eviction"`; dies entspricht einem Metadata-Prune dieser Implementierung, nicht einem reinen V1-Live-only-Hiding.
- Explizites DELETE ist aktuell live-first: zuerst aus dem Live-Store entfernen; schlägt das Schreiben des Tombstones fehl, wird eine Warning zurückgegeben. So werden sensible Einträge优先 versteckt; innerhalb des Fehlerfensters kann ein Daemon-Restart das Artifact noch aus dem alten Journal wiederherstellen. Clients sollten die Warning als Signal dafür behandeln, dass „die Löschung nicht dauerhaft ist".
- Fork schreibt aktuell per einmaligem Exclusive-Create in die Ziel-JSONL-Datei; Fork-Artifact-Records werden nicht einzeln gestreamt, daher ist kein `session_artifact_fork_marker` nötig, um Partial Batches des aktuellen Schreibpfads zu erkennen. Falls Fork künftig gestreamt wird, werden begin/complete-Marker eingeführt.

## 2. Nutzervisible Semantik

### 2.1 Seiten-Refresh, Wechsel und Neustart

Das Verhalten nach V2 sollte sein:

- Seiten-Refresh: wie in V1; solange Daemon/Session noch leben, genügt ein erneutes `GET /session/:id/artifacts` des Frontends.
- Session-Wechsel: jede Live-Session hat weiterhin einen eigenen Artifact-Store.
- Frontend-Instanz-Neustart: solange der Daemon noch lebt, kann der aktuelle Live-Store per GET gelesen werden.
- Daemon-/Bridge-Neustart: wenn die Session neu geladen wird, stellt V2 die Artifact-Liste aus den persistierten Metadaten wieder her.
- Historischer Load/Replay: wenn die Session V2-Persistenz-Records hat, wird die Artifact-Liste wiederhergestellt; sonst wird eine leere Liste zurückgegeben.

Das Live-Upgrade von V1 auf V2 braucht eine Sonderbehandlung: V1-Live-Artifacts, die bereits im Speicher sind, haben kein JSONL-Journal. Wenn V2 diese Live-Sessions erstmals berührt, sollte über den vom Chat-Recording-Owner bereitgestellten Artifact-Persistenz-Writer ein initialer `session_artifact_snapshot` geschrieben werden, bevor neue wiederherstellbare Artifact-Mutationen akzeptiert werden. Das Backfill darf den Live-Store nicht unverändert serialisieren; für jedes Artifact müssen Ingest-Validierung, Privacy-Minimierung und `retention`-Materialisierung erneut ausgeführt werden. Ist ein einzelnes Artifact unzulänglich, wird dieser Eintrag übersprungen oder heruntergestuft, damit eine einzelne schlechte Aufzeichnung nicht das gesamte Backfill mitreißt. Ist der Writer nicht verfügbar oder schlägt das Backfill insgesamt fehl, behält die Session weiterhin das V1-Live-only-Verhalten und eine strukturierte Warning wird aufgezeichnet; der Nutzer darf nicht glauben, bestehende Live-Artifacts seien bereits wiederherstellbar.

Das Backfill darf Artifact-Events nicht einzeln in das JSONL streamen. Die Implementierung muss zuerst im Speicher Validierung, Minimierung und Downgrade abschließen, einen vollständigen Kandidaten-Snapshot bilden und dann `session_artifact_snapshot` einmalig anhängen. Schlägt der Kandidaten-Aufbau oder der Snapshot-Append fehl, darf kein teilweiser dauerhafter Artifact-Zustand zurückbleiben. Der aktuelle PR implementiert kein V1-Live-Store-Backfill; falls es später nachgeliefert wird, sollten Kandidaten-Eintragszahl, übersprungene Einträge und Validierungsfehlergründe in strukturierte Telemetrie oder Snapshot-Metadaten geschrieben werden, damit fsck und Restore-Warnings zwischen „vollständig, aber Einträge wurden per Validierung übersprungen" und „teilweise geschrieben/beschädigt" unterscheiden können.

### 2.2 Retention-Schichtung

Neues optionales Feld. Der Public-Mutationspfad von PR #6259 akzeptiert nur `ephemeral` und `restorable`; `pinned` in alten Journals wird bei Restore / Fork zu metadata-only `restorable` heruntergestuft:

```ts
type ArtifactRetention = 'ephemeral' | 'restorable';
```

Bedeutung:

- `ephemeral`: existiert nur im Live-Store. Wird nach dem Verschwinden von Daemon/Session nicht wiederhergestellt.
- `restorable`: Metadaten werden in das Persistenz-Journal geschrieben. Nach Session-Load/Replay als Artifact-Eintrag wiederhergestellt, aber ohne Garantie, dass die zugrunde liegende Ressource noch existiert.

Standardregeln:

- Tool Result, `record_artifact`, Hook-Artifact: standardmäßig `restorable`, aber nur Metadaten werden persistiert.
- Vom Nutzer im interaktiven Frontend manuell registrierte Client-POST-Artifacts: standardmäßig `restorable`; erscheinen nach Wiederherstellung weiterhin in der Artifact-Liste.
- Hintergrund-/Automatisierungs-Client-POST: falls es nur ein temporärer UI-Zustand ist, sollte explizit `retention: "ephemeral"` angefordert werden; das SDK sollte einen expliziten ephemeral-Helfer bereitstellen.
- `published`-Artifacts: standardmäßig `restorable`; aktuell wird nur der Published-Locator wiederhergestellt, Inhalte werden nicht gehostet.

Wenn das Chat-Recording deaktiviert ist, ist die Metadata-Persistenz standardmäßig deaktiviert und die Capability wird nicht deklariert.

### 2.3 Wiederherstellungssemantik nutzerregistrierter Artifacts

Vom Nutzer manuell registrierte Artifacts sollten nach der V2-Wiederherstellung weiter existieren, aber wiederhergestellt wird das „Artifact-Metadaten-Item", kein bedingungsloses Inhalts-Backup.

Das Ergebnis nach Wiederherstellung unterscheidet sich nach Ressourcenzustand:

- `external_url`: stellt title, description, url, metadata wieder her. Der Daemon greift nicht auf die entfernte URL zu; ob die URL noch geöffnet werden kann, entscheidet der Client beim Klicken.
- `workspace`: stellt workspacePath und metadata wieder her; wenn die Datei noch im Workspace liegt und size + mtimeMs unverändert sind, oder wenn sich die mtime geändert hat, der sha256 aber noch mit der Registrierung übereinstimmt, dann `status: "available"`; wenn die Datei gelöscht, verschoben oder per Symlink entkommen ist, dann `status: "missing"`; wenn die Datei noch existiert, aber size oder sha256 von der Registrierung abweichen, dann `status: "changed"`.
- `managed`: stellt managedId wieder her; nur `available`, wenn das Managed-Storage-Manifest noch auflöst.
- `published`: stellt den Published-Locator wieder her; der Published-Trust bleibt nur erhalten, wenn die Trusted-Publisher-Manifest-Validierung noch besteht.

Also lautet die Antwort auf „Existiert ein nutzerregistriertes Artifact nach der Wiederherstellung noch?": In V2 sollte es in der Liste sein, außer der Nutzer hat DELETE ausgeführt, die Metadaten wurden per GC/Tombstone entfernt, die Restore-Validierung hat festgestellt, dass die Aufzeichnung zu beschädigt für eine sichere Anzeige ist, oder Chat-Recording / Persistenz ist deaktiviert. Ob sich der zugrunde liegende Inhalt noch öffnen lässt, hängt vom Storage-Typ und dem Live-Ressourcenzustand ab; Workspace-Dateien werden vom Daemon nicht gesichert, und `changed` dient dazu, das stille Öffnen einer falschen Version zu vermeiden.

Der Daemon darf „manuell" vs. „Hintergrund" nicht allein anhand des Request-Payloads entscheiden. Implementierungstechnisch sollten Verbindungs-Principal, SDK-Helfer oder UI-Aktionspfad die interaktive Registrierungsquelle kennzeichnen; Clients, deren interaktive Absicht nicht bestätigt werden kann, sollten gemäß dem expliziten `retention` behandelt werden; ohne Angabe wird weiterhin `restorable` akzeptiert, jedoch gebunden durch Session-Metadaten-Quota und Audit-Aufzeichnungen.

## 3. Datenmodell

### 3.1 Public-Artifact-Erweiterung

V2 fügt optionale Felder auf dem V1-Response-Artifact hinzu:

```ts
interface DaemonSessionArtifact {
  // V1 fields...
  status: 'available' | 'missing' | 'changed';
  retention?: 'ephemeral' | 'restorable';
  persistedAt?: string;
  restoreState?: 'live' | 'restored' | 'unverified' | 'blocked';
  persistenceWarning?:
    | 'persistence_unavailable'
    | 'metadata_only_restore'
    | 'restore_validation_failed'
    | 'sticky_override_active';
  metadata?: {
    'qwen.workspace.sha256'?: string;
    'qwen.workspace.mtimeMs'?: number;
    [key: string]: string | number | boolean | null | undefined;
  };
}
```

Felderläuterungen:

- `retention`: die Persistenzstufe des Artifacts. Die Auflösungsreihenfolge ist: expliziter Wert im Request-Body zuerst; System-interne Artifacts gemäß der Daemon-Standardstrategie aus §2.2; Client-POST ohne Angabe verwendet das vom Nutzer konfigurierte `defaultRetention`; ohne Konfiguration wird auf `restorable` zurückgefallen. Nur wenn die Persistenz-Capability nicht deklariert ist oder V1-Ära-Aufzeichnungen gelesen werden, wird V1-kompatibel live-only behandelt. Wenn der V2-Writer ins Journal schreibt, muss er `retention` materialisieren; er darf sich nicht auf den optionalen Default verlassen.
- `persistedAt`: Zeitpunkt der zuletzt erfolgreichen Metadaten-Ablage auf Platte.
- `restoreState`: Hinweis auf die Wiederherstellungsquelle; ersetzt `status` nicht.
- `persistenceWarning`: nicht blockierende Persistenz-/Restore-Risiken; das Frontend kann damit Zustände wie „dieses Artifact bleibt über Neustarts nicht erhalten" anzeigen. Die aktuelle Wire-Form ist ein fester String, damit keine Host-Absolutpfade, Credentials, Token, internen Storage-Pfade oder Verbindungs-Ids in die Response geschrieben werden. Ein strukturierteres `{ code, message }` kann als spätere kompatible Erweiterung folgen.
- `status: "changed"`: nur für Workspace-Artifacts. Der Daemon schreibt bei der Registrierung `sizeBytes`, `metadata["qwen.workspace.sha256"]` und `metadata["qwen.workspace.mtimeMs"]`; der Refresh nach GET/list/restore statet zuerst die aktuelle Datei, bei geänderter Größe wird direkt `changed` zurückgegeben, sind size/mtime beide unverändert, wird die Datei nicht neu gelesen, und nur wenn sich die mtime geändert hat, aber die Größe gleich ist, wird als Absicherung der sha256 neu berechnet.

### 3.2 Verhältnis von Status und restoreState

V1-`status` zeigt weiterhin an, ob die aktuelle Ressource verfügbar ist:

- `available`
- `missing`
- `changed`

V2 fügt nur `changed` als diesen einen Workspace-Integritätszustand hinzu. Er bedeutet, dass der Pfad noch zugänglich ist, aber die Live-Datei ihre Größe geändert hat oder nach einer mtime-Änderung der sha256 nicht mit den Registrierungs-Metadaten übereinstimmt. `blocked` ist kein `status`, sondern gehört nur zu `restoreState`:

- `restored`: aus persistierten Metadaten wiederhergestellt.
- `unverified`: Metadaten wiederhergestellt, aber Workspace-/Managed-Validierung noch nicht abgeschlossen.
- `blocked`: beim Restore festgestellt, dass eine Sicherheitsgrenze nicht erfüllt ist, z. B. Workspace-Pfad-Escape.
- `live`: im aktuellen Prozess neu erzeugt oder per Refresh bestätigt.

## 4. Persistenz-Speicherdesign

### 4.1 JSONL-only Source of Truth

V2 verwendet standardmäßig nur Chat-JSONL-System-Records:

1. Das JSONL-Journal ist Audit-Quelle, Restore-Quelle und Quelle für versionsübergreifende Migration.
2. `session_artifact_snapshot` ist ein Restore-Beschleunigungspunkt innerhalb des JSONL, keine eigenständige Datei.
3. In V2 wird kein Sidecar-Cache eingeführt. Ein Sidecar würde Pfadsynchronisation, Stale-Validierung, Archive/Unarchive/Delete-Kopplung, Orphan-GC und Cache-Vertrauensprobleme hinzufügen; der aktuelle Session-Load liest bereits das JSONL, und Artifact-Records können im selben Parse-Durchlauf extrahiert werden.

Falls die Praxis zukünftig einen Sidecar erfordert, muss er als separates Design eingebracht werden und zwei Bedingungen erfüllen:

- Der Sidecar darf nur ein entfernbarer Cache sein und keine Protokollkorrektheit tragen.
- Selbst bei einem Sidecar-Treffer muss für jedes Artifact die Restore-Validierung ausgeführt werden; die JSONL-Restore-Validierung darf nicht umgangen werden.

Ein Sidecar ist für die V2-Persistenz keine Korrektheitsvoraussetzung. Das aktuelle `loadSession()` liest für die Wiederherstellung das vollständige Session-JSONL und baut den Konversationsbaum neu auf; wenn der Artifact-Restore im selben Lesevorgang Snapshot-/Event-Records extrahiert, entsteht kein zusätzliches Datei-I/O. Daher kann ein Sidecar unter der aktuellen Architektur nur einen kleinen Parse-/Replay-Anteil der Artifact-Records sparen, nicht die wesentlichen Lesekosten des Session-Loads.

Einen Sidecar in den aktuellen PR aufzunehmen würde die Implementierungsfläche deutlich vergrößern:

- Doppelschreib-Reihenfolge von JSONL und Sidecar, fsync und Crash-Recovery.
- Validierung, Invalidierung und Fallback bei stale/korruptem Sidecar.
- Sidecar-Lebenszyklus-Synchronisation bei archive/unarchive/delete/fork/remap.
- Ob der Sidecar vertrauenswürdig ist und ob er die Restore-Validierungs-Sicherheitsgrenze umgehen könnte.
- Orphan-Sidecar/-Cache-Cleanup und zusätzliche Testmatrix.

Daher bleiben die V2-Veröffentlichungskriterien JSONL-only. Ein Sidecar wird erst dann als eigenständiges Design aufgenommen, wenn eine der folgenden Bedingungen durch Profiling oder Produktanforderungen belegt ist:

- `loadSession()` muss nicht mehr das vollständige JSONL lesen, und der Sidecar kann einen Cold-Start-Vollscan vermeiden.
- Die Artifact-Liste muss in Szenarien ohne Session-History-Load per Cold-Start angezeigt werden.
- Gemessener Artifact-Restore, nicht der Konversationshistorie-Rebuild, wird zur Hauptzeit des Session-Loads.
- Workspace-/projektübergreifende Artifact-Suche oder ein globaler Index werden benötigt.

### 4.2 JSONL-Writer-Ownership und Branch-Modell

Artifact-Persistenz-Records sind Teil des Chat-Transkripts und müssen der bestehenden `ChatRecord`-Parent/Leaf-Semantik folgen:

- JSONL-Append kann nur durch den Prozess erfolgen, der `ChatRecordingService.appendRecord` besitzt, oder über einen von ihm explizit exponierten RPC. Der Daemon-seitige `SessionArtifactStore` kann über eine Operation-Queue die Reihenfolge von Live-State, SSE und Persistenz-Requests koordinieren, darf aber das Chat-JSONL nicht selbst öffnen und beschreiben.
- Jeder `session_artifact_event` / `session_artifact_snapshot` muss als gewöhnlicher System-`ChatRecord` an das aktuelle Conversation-Leaf gehängt werden und normale `uuid` / `parentUuid` erhalten.
- Chat-Tree-Builder und Renderer müssen `session_artifact_*`-System-Records als Side-Effect-Records behandeln: Sie nehmen an Parent/Leaf-Reihenfolge und Replay teil, werden aber nicht als nutzersichtbare Konversationsknoten gerendert. Minimal müssen alte Versionen beim Laden eines JSONL mit V2-Records den unbekannten System-Subtype als opaken/ignorierten Side-Effect behandeln, statt den Session-Load scheitern zu lassen.
- Session-Load/Replay wendet nur Artifact-Records der aktiven Leaf-Chain an. Artifact-Upserts/Removes, die durch `/rewind` in einen verlassenen Branch fielen, beeinflussen die aktuelle Artifact-Liste nicht mehr.
- Wenn `/rewind` oder ein Leaf-Wechsel geschieht, muss sich der Daemon-seitige Live-`SessionArtifactStore` neu am Artifact-Zustand der neuen aktiven Chain ausrichten: entweder per Reseed aus dem Active-Chain-Replay-Ergebnis oder per Snapshot-Top-up der aktuellen Artifacts, das während der Rewind-Operation in die überlebende Chain geschrieben wird. V2 nimmt standardmäßig Branch-scoped Semantik an; Off-Branch-Mutationen sollten nicht im flachen Live-Map verbleiben und erst beim nächsten Neustart verschwinden.
- Fork/Branch kopiert nur Artifact-Records der aktiven Chain; Off-Chain-Records nehmen an der Wiederherstellung der Ziel-Session nicht teil.
- Wenn eine Implementierungsphase die Artifact-System-Records noch nicht an die aktive Leaf-Chain anschließen kann, darf sie die Capability `session_artifacts_persistence` nicht deklarieren; andernfalls würden nach einem Rewind alte Upserts oder alte Tombstones wieder auferstehen.

Das bedeutet, dass V2 weder eine unabhängige Artifact-Log-Datei noch ein Side-Log entwirft, das den Chat-Tree umgeht. Die Korrektheit der Artifact-Persistenz stammt aus derselben aktiven Chat-History, nicht aus dem aktuellen Speicherzustand des Daemons.

### 4.3 JSONL-System-Record

`ChatRecord.subtype` wird ergänzt um:

```ts
'session_artifact_event' | 'session_artifact_snapshot';
```

Payload:

```ts
interface SessionArtifactEventRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  changes: Array<{
    action: 'created' | 'updated' | 'removed';
    artifactId: string;
    artifact?: PersistedSessionArtifact;
    reason?: 'explicit' | 'eviction' | 'unpin_to_ephemeral';
  }>;
}

interface SessionArtifactSnapshotRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  artifacts: PersistedSessionArtifact[];
  tombstonedIds?: string[];
  stickyEphemeralIds: string[];
}

type PersistedSessionArtifact = Pick<
  DaemonSessionArtifact,
  | 'id'
  | 'kind'
  | 'storage'
  | 'source'
  | 'status'
  | 'title'
  | 'description'
  | 'workspacePath'
  | 'managedId'
  | 'url'
  | 'mimeType'
  | 'sizeBytes'
  | 'metadata'
  | 'createdAt'
  | 'updatedAt'
> & {
  retention: ArtifactRetention;
  persistedAt: string;
  clientRetained: boolean;
  toolCallId?: string;
  toolName?: string;
  hookEventName?: string;
};
```

`sequence` ist der dauerhafte Mutationszähler innerhalb jedes Session-Artifact-Stores und dient der Snapshot-/Event-Sortierung und der Anomaliediagnose. Beim Restore gilt weiterhin die Reihenfolge der aktiven JSONL-Chain; `sequence` dient nicht als Session-übergreifende Autorisierung oder globale Ordering-Quelle.

`PersistedSessionArtifact` muss eine positive Allowlist sein (explizites `Pick` oder eigenständiges Interface), keine negative `Omit<DaemonSessionArtifact, ...>`-Ausschlussliste. Falls `DaemonSessionArtifact` zukünftig neue Runtime-only-Felder erhält, sollte eine Compile-Zeit-Assertion den Maintainer zwingen, explizit zu entscheiden, ob sie in die persistierte Allowlist aufgenommen werden, um Schema-Verschmutzung zu vermeiden.

Es wird nur die minimalisierte Artifact-Form nach Store-Validierung/Normalisierung geschrieben. Außer `clientRetained` und Tool-/Hook-Anzeigehinweisen werden keine V1-internen Felder oder runtime-abgeleiteten Felder geschrieben:

- nicht `identityKey`
- nicht `trustedPublisher`
- nicht absolutes `workspaceCwd`
- nicht Transport-Token / Auth-Principal
- nicht `restoreState`
- nicht `persistenceWarning`
- nicht `clientId` oder Live-Prozess-Owner-Principal; `source` dient nur als Anzeige-/Audit-Hinweis und darf nicht zur Autorisierung verwendet werden

Das Löschen eines Artifacts muss ein Tombstone-Change schreiben, damit es nach einem Historien-Replay nicht durch einen alten Upsert wieder aufersteht. Ein Tombstone verbietet nicht dauerhaft das erneute Auftreten derselben Id: Er überdeckt nur seine eigenen früheren Upserts, bis danach ein expliziter Upsert mit höherer Sequence erscheint. `reason: "unpin_to_ephemeral"` in alten Journals bleibt weiterhin als Sticky-Override-Kompatibilität erhalten: nachfolgende implizite/Default-Upserts derselben Artifact-Id werden weiterhin live-only behandelt; nur Requests über authentifizierte REST-/ACP-Mutationsrouten, die explizit `retention: "restorable"` übergeben, können ihn superseden; Tool-/Hook-/Hintergrund-/Default-Retention, Restore-Backfill und impliziter Re-Ingest können den Sticky-Override nicht superseden.

Ein Sticky-Override darf nicht nur in historischen Tombstone-Events existieren. Der Snapshot-Writer muss noch nicht explizit supersedete `unpin_to_ephemeral`-Zustände in `stickyEphemeralIds` schreiben; der Restore-Reader stellt zuerst das Sticky-Set aus dem Snapshot wieder her und wendet dann die Upserts/Removes nach dem Snapshot an. Andernfalls ginge der Sticky-Override verloren, wenn nach einem Snapshot-Baseline-Advance die alten Tombstones nicht mehr abgespielt werden müssen.

### 4.4 Snapshot- und Tombstone-Invarianten

Ein Artifact-Snapshot reduziert nur die Menge der beim Replay anzuwendenden Artifact-Events; er reduziert nicht die Lesemenge der JSONL-Datei selbst.

Folgendes muss erfüllt sein:

- Die Snapshot-Generierung muss seriell in derselben Artifact-Operation-Queue ausgeführt werden und strikt nach allen vorangehenden Mutationen liegen.
- Der Snapshot ist der autoritative aktuelle Zustand: Er enthält nur Artifacts, die zum Zeitpunkt der Snapshot-Erzeugung noch gültig sind.
- `tombstonedIds` erfasst nur Tombstones, die auch nach dem Snapshot noch alte Upserts überdecken müssen; alte Tombstones, die vom Snapshot überdeckt werden, gehen nicht mehr in die neue Snapshot-Payload ein, damit das Array nicht mit der Historie unbegrenzt wächst.
- `stickyEphemeralIds` erfasst Artifact-Ids, die sich aktuell noch im Sticky-ephemeral-Override befinden; selbst wenn der zugehörige alte Tombstone nicht mehr abgespielt werden muss, muss dieser Override-Zustand erhalten bleiben.
- `stickyEphemeralIds` muss begrenzt sein, teilt standardmäßig dieselbe Größenordnung wie das `maxPersistedMetadata`-Limit der persistierten Metadaten und zählt in das Artifact-Journal-Working-Set-Budget. Wenn das Replay alter `unpin_to_ephemeral`-Journals das Sticky-Set-Limit überschreiten würde, müssen Restore/Prune eine Warning aufzeichnen und später erneut versuchen; sie dürfen nicht still wachsen, alte Sticky-Overrides zufällig beschneiden oder implizite Upserts wieder persistieren lassen.
- Der Snapshot darf Artifact-Ids enthalten, die einmal tombstoned waren, sofern der Tombstone durch einen expliziten Upsert mit höherer Sequence superseded wurde.
- Beim Load wird der neueste valide Snapshot von neu nach alt gewählt; danach werden nur die Artifact-Events nach diesem Snapshot angewendet.
- Wenn der neueste Snapshot nicht geparst werden kann, wird eine `snapshot_invalid`-Warning aufgezeichnet und der vorherige valide Snapshot versucht; ein korrupter Snapshot darf nicht die gesamten Artifact-Metadaten der Session kosten.
- Wenn es keinen validen Snapshot gibt, darf die aktive JSONL-Leaf-Chain einmal sequenziell per Artifact-Event-Replay abgespielt werden. Isolierte korrupte Artifact-Records werden übersprungen und mit Warning aufgezeichnet; nur wenn Branch-Reihenfolge, Record-Envelope oder Tombstone-Zustand keine vertrauenswürdige Reihenfolge mehr zulassen, werden die Artifact-Persistenz-Records der Session verworfen.

Der Snapshot-Baseline-Advance schreibt hier keine alten Records im JSONL um und löscht sie nicht. Alte `session_artifact_snapshot`, Events und Tombstones verbleiben im Append-only-Chat-Transkript; das Artifact-Subsystem schiebt nur innerhalb der neuesten Snapshot-Payload die Restore-Baseline vor und setzt die Working-Set-Zählung zurück.

### 4.5 Speicherverbrauch

V2 schreibt keinen Sidecar doppelt, daher gibt es keine doppelte Metadatenspeicherung aus JSONL + Sidecar. Der Speicherverbrauch teilt sich in Metadata-Journal und Content Retention:

- Metadata pro Eintrag meist ca. 0,5 KB – 2 KB, abhängig von title, description, url und metadata-Größe.
- Das Limit wirksam persistierter Metadaten pro Session ist standardmäßig auf 200 Einträge wie der Live-Store ausgerichtet; ein einzelner Snapshot ist ca. 100 KB – 400 KB.
- Das JSONL-Journal speichert Inkrement-Events, Snapshots und Tombstones; das Append-only-Chat-Transkript selbst wächst.
- Content Retention ist die Hauptquelle des Speicherbedarfs, z. B. 50 MB pro Artifact, 200 MB pro Session, 1 GB pro Projekt.

Steuerungsstrategien:

- Sobald das Artifact-Event-Journal einen festen Schwellenwert erreicht, wird ein `session_artifact_snapshot` geschrieben, z. B. alle 100 Artifact-Mutationen oder alle 256 KB Artifact-Journal.
- Artifact-Persistenz-Records folgen dem Lebenszyklus des Chat-Transkripts; es gibt kein GC eigenständiger Dateien.
- Pro Session kommt ein Artifact-Journal-Working-Set-Byte-Budget hinzu, z. B. 4 MB. Dieses Budget bemisst das Artifact-Working-Set, das beim Restore gelesen und angewendet werden muss, also der neueste valide Snapshot plus die danach folgenden Artifact-Events; alte Artifact-Records im Chat-Transkript, die bereits von einem Snapshot überdeckt sind, dürfen nicht in das Budget einfließen, sonst würde das Append-only-JSONL zu einem nicht wiederherstellbaren Einmallimit.
- Der Writer muss die Working-Set-Bytes explizit verfolgen: nach jedem Snapshot-Write die Artifact-Byte-Größe dieses Snapshots, die JSONL-Append-Position oder den Zeilenindex als `postSnapshotBase` notieren, danach erhöht jeder Artifact-Event-Append `postSnapshotEventBytes`. Die Budgetprüfung verwendet `snapshotBytes + postSnapshotEventBytes` und setzt die Zähler nach erfolgreichem Snapshot-Baseline-Advance zurück. Kann der Writer die Basisposition oder den Zählerzustand nicht bestätigen, muss er konservativ einen neuen Snapshot schreiben; kann er ihn weiterhin nicht bestätigen, muss er degradieren oder einen Fehler melden, statt unbegrenzt anzuhängen.
- Wenn sich das Budget dem Limit nähert, wird zuerst versucht, einen neuen Snapshot zu schreiben. Überschreiten der neueste Snapshot plus Post-Snapshot-Events weiterhin das Budget, werden keine neuen wiederherstellbaren Metadaten mehr geschrieben; normale Artifacts werden auf `ephemeral` heruntergestuft und mit `persistenceWarning.code = "journal_budget_exceeded"` versehen.
- Es werden keine Content-Bytes in das JSONL geschrieben; PR #6259 schreibt auch keinen Daemon-verwalteten Artifact-Content-Speicher.

## 5. Schreib- und Wiederherstellungsfluss

### 5.1 Ingest-Zeit-Validierung

Bevor ein Artifact in Live-Store und JSONL gelangt, muss Ingest-Zeit-Validierung erfolgen; eine Validierung nur beim Restore genügt nicht:

- `workspacePath`: muss ein relativer Pfad sein; nach resolve/realpath darf er nicht aus dem aktuellen Workspace entkommen.
- `url`: validiere Scheme, Userinfo, secret-artige Query/Fragment je nach Storage-Typ.
- `managedId`: lehne Pfadformen, `..`, absolute Pfade, Trennzeichen ab.
- `published`: darf nur von internen Trusted Publishern des Daemons oder manifest-validierten Pfaden stammen, nicht durch Selbstdeklaration im Client-Payload.
- Alte `contentRef` / `expiresAt`: nur als Legacy-Journal-Input-Kompatibilität; erscheinen sie im Client-Payload, müssen sie abgelehnt oder gestrippt werden; der aktuelle PR darf keine neuen Felder dieser Art erzeugen.
- `restoreState` / `persistenceWarning`: Runtime-only-Response-Felder; erscheinen sie im Client-Payload, müssen sie abgelehnt oder gestrippt werden und dürfen nicht in das persistierte Artifact geschrieben werden.
- `clientRetained`: darf nur boolean sein, drückt die Nutzerbehaltensabsicht und einen stabilen Sortierhinweis aus und ist kein Autorisierungssignal. Nur explizite REST-/SDK-/UI-Aktionen können es setzen; Hintergrund-Auto-Ingest darf keine Nutzerbehaltensabsicht vortäuschen.
- `metadata`: führe Primitive-only-, Größenlimit-, Secret-Key/Value- und Unsafe-Display-Payload-Prüfungen aus.

Bei Validierungsfehlern:

- Klar bösartige oder grenzüberschreitende Eingaben: Request ablehnen.
- Falls die Eingabe womöglich sensible Locators enthält, der Nutzer das Live-Artifact aber dennoch anzeigen möchte: kann auf `ephemeral` herabgestuft werden, mit `persistenceWarning.code = "validation_downgraded"`; darf nicht in das JSONL geschrieben werden.

### 5.2 Artifact-Schreibfluss

V1-Fluss:

```text
ingest input -> normalize/validate -> upsert live store -> publish artifact_changed
```

V2-Fluss:

```text
ingest input
  -> normalize/validate
  -> in SessionArtifactStore operationQueue: compute effective mutation
  -> for restorable changes: request chat-recording writer append
     artifact journal/snapshot on the active leaf chain
  -> apply live-store mutation
  -> publish artifact_changed with effective retention/warning fields
```

Die Operation-Queue des `SessionArtifactStore` serialisiert die Live-Mutationen, Persistenz-Requests und SSE-Reihenfolge derselben Session; der eigentliche JSONL-Append erfolgt weiterhin durch den Chat-Recording-Owner. Wenn der Persistenz-Writer nicht verfügbar ist, können normale Tool-/Hook-Artifacts auf live-only `ephemeral` herabgestuft werden und dann in den Live-Store gelangen.

Wenn ein Sticky-ephemeral-Override die Persistierung eines impliziten/Default-Upserts unterdrückt, muss das Live-Artifact `persistenceWarning.code = "sticky_override_active"` tragen und den strukturierten Log `action=sticky_override_suppressed` sowie eine Counter-Metric aufzeichnen. Andernfalls sieht man beim Troubleshooting legalen Upsert-Input, findet aber keinen zugehörigen dauerhaften Record.

Der aktuelle PR hat keine versteckte paged-persistierte-Metadaten-Ansicht; die Live-Liste ist exakt die Metadatenmenge, die dem Client nach dem Restore exponiert wird. Daher folgt die Limit-Behandlung einer verengten Strategie:

- `ephemeral`-Artifacts dürfen nur aus der Live-Ansicht entfernt werden, ohne Journal-Eintrag.
- Wird ein `restorable`-Artifact durch das Limit beschnitten, wird ein Remove-Event mit `reason: "eviction"` geschrieben, damit der nächste Load/Replay nicht alle beschnittenen Einträge wieder aufleben lässt.

### 5.3 Schreibfehlersemantik

Zwei Einstiege werden unterschieden:

- Normale Tool-/Hook-Artifacts: ein Persistenzfehler darf den Tool-Aufruf nicht scheitern lassen; das Artifact kann weiterhin in den Live-Store gelangen, aber zuerst muss das `retention` im Live-Store auf `ephemeral` herabgestuft, `persistenceWarning` gesetzt und dann `artifact_changed` publiziert werden.
  Bei löschenden Mutationen, die das Restore-Ergebnis beeinflussen, unterscheidet der aktuelle PR nach Grund:

- `eviction`: dauerhaftes Remove-Event, das garantiert, dass das 200-Einträge-Limit auch nach Neustarts eingehalten wird.
- Legacy-unpin-zu-`ephemeral`: beim Lesen alter Journals wird das dauerhafte Remove-Event weiterhin erkannt und die Id in das begrenzte `stickyEphemeralIds` geschrieben; nachfolgende implizite/Default-Upserts bleiben live-only, bis ein explizites `retention: "restorable"` supersedet.
- Explizites DELETE: live-first. Zuerst aus dem Live-Store entfernen und das Löschereignis publizieren, dann best-effort den expliziten Remove-Tombstone schreiben. Schlägt das Tombstone-Schreiben fehl, gibt die Response eine Warning zurück (aktuell als String-Warning), die anzeigt, dass die Löschung nicht dauerhaft ist; wenn der Daemon vor dem Nachschreiben neu startet, kann das alte Journal das Artifact noch wiederherstellen.
- `deleteContent: true` gehört nicht zur Public-API von PR #6259. Erst der Content-Retention-Follow-up definiert Content-GC und Warning-Vertrag; das explizite DELETE des aktuellen PRs behandelt nur Metadata-Tombstone und Live-Removal.

Empfohlene Warnings:

```text
[artifacts] session=<id> action=persist_failed artifact=<id> reason=<code>
[artifacts] session=<id> action=remove_not_persisted artifact=<id>
[artifacts] session=<id> action=sticky_override_suppressed artifact=<id> prior_reason=unpin_to_ephemeral
```

### 5.4 Wiederherstellungsfluss

Bei Session-Load/Replay:

1. `SessionService.loadSession()` liest das JSONL und extrahiert im selben Parse-Durchlauf die Artifact-Snapshot-/Event-Records.
2. Basierend auf der aktiven Leaf-Chain wird der neueste valide `session_artifact_snapshot` und die danach folgenden `session_artifact_event` extrahiert. Artifact-Records auf verlassenen Branches müssen ignoriert werden.
3. Den Artifact-Snapshot neu aufbauen und Tombstones anwenden.
4. Für jedes Artifact die V2-Restore-Validierung erneut ausführen.
5. Das Load-Ergebnis trägt `artifactSnapshot` zurück zur Daemon-seitigen Bridge.
6. Die Daemon-Bridge initialisiert bei `createSessionEntry` / Restore-Abschluss den Daemon-seitigen `SessionArtifactStore` mit dem Snapshot.
7. `GET /session/:id/artifacts` liest genau diesen Daemon-seitigen Store.

Der `SessionArtifactStore` darf nicht im Agent-/Session-Objekt des ACP-Child-Prozesses gesedet werden: Der über die Produktions-HTTP-API sichtbare Store wird in der Daemon-seitigen Bridge erstellt.

`loadSession()` muss read-only sein: Es darf beim Parsen keine Tombstones schreiben und auch kein Content-GC direkt auslösen. Wenn sich nach dem Restore herausstellt, dass das aktuelle Live-Limit oder die Policy strenger ist als die Historie, schreibt der Daemon-seitige Store über die normale Operation-Queue ein `eviction`-Remove-Event, nachdem er erstellt wurde und der Persistenz-Writer verfügbar ist; ist der Writer nicht verfügbar, werden überzählige Einträge nur in der Live-Ansicht versteckt und eine Warning aufgezeichnet; beim nächsten Load können diese noch zu beschneidenden Aufzeichnungen erneut sichtbar werden.

Die Live-Store-Behandlung bei Rewind/Replay muss mit Load übereinstimmen: Sobald sich das aktive Leaf ändert, darf der flache Live-Store keine Off-Branch-Artifact-Mutationen weiter behalten. Wenn die aktuelle Implementierung kein Active-Chain-Replay-Ergebnis hat, aus dem direkt geseedet werden kann, muss am Ende des Rewinds ein Artifact-Snapshot-Top-up geschrieben werden, sonst darf die Persistenz-Capability nicht aktiviert werden.

Der konkrete Integrationspunkt muss ein expliziter Hook sein, keine Lazy-Reparatur beim nächsten GET. Empfohlen wird, dass die Rewind-/Leaf-Switch-Implementierung `onActiveLeafChanged(sessionId, artifactSnapshot)` der Daemon-Bridge aufruft oder ein gleichwertiges Event im bestehenden Session-Load/Replay-Ergebnis trägt; der Artifact-Store führt nach Erhalt in derselben Session-Operation-Queue Reseed oder Top-up-Snapshot aus.

### 5.5 Validierung beim Restore

Beim Restore muss neu validiert werden:

- `workspacePath`: muss weiterhin ein relativer Pfad sein; wird beim Restore gegen den Workspace-Root erneut resolved/realpath/stat und darf nicht aus dem aktuellen Workspace entkommen. Nach einer Workspace-Verlagerung kann er als `available` wiederhergestellt werden, wenn derselbe relative Pfad noch existiert; wenn die Datei fehlt oder das neue Workspace-Layout inkonsistent ist, als `missing`. V2 nimmt kein automatisches Path-Remapping vor.
- `external_url`: nur `http:` / `https:` erlaubt; Username/Password-Credentials ablehnen; secret-artige Query/Fragments müssen redacted, zu nicht-öffnbaren Locators herabgestuft oder das gesamte Artifact herabgestuft/blockiert werden.
- `published`: `file:`-Locators dürfen wiederhergestellt werden, aber nur, wenn die Trusted-Publisher-Manifest-Neuvalidierung besteht und das Ziel zum Daemon-verwalteten Published-Storage gehört. Normale `external_url` dürfen niemals über `file:` laufen.
- `managedId`: lehne Pfadformen, `..`, absolute Pfade, Trennzeichen ab.
- Alte `contentRef`: nur als Legacy-Journal-Input validieren und strippen; PR #6259 löst Inhalte nicht über Daemon-verwaltete Manifeste auf und exponiert alte `contentRef` nicht als Versprechen auf öffenbare Inhalte.
- `metadata`: Primitive-only-, Größenlimit-, Secret-Key/Value- und Unsafe-Display-Payload-Prüfungen erneut ausführen.

Bei Restore-Fehlern:

- Sicherheitsfehler: Eintrag behalten, aber `restoreState: "blocked"`, `status: "missing"`, kein öffenbarer Locator.
- Ressource fehlt: `status: "missing"`.
- Nicht-sicherheitsrelevante Feldbeschädigung: dieses Artifact überspringen und eine Warning aufzeichnen.

### 5.6 Branch-/Fork-Semantik

Das bestehende `/branch` kopiert die aktive JSONL-Record-Chain und schreibt `sessionId` um. V2-Artifact-Records werden nur aus der aktiven Leaf-Chain kopiert; Artifact-Records, die nach einem Rewind auf einem verlassenen Branch liegen, gehen nicht in den Fork ein. Beim Kopieren müssen die Artifact-Ids explizit behandelt werden:

- Dieselbe Ressource sollte in der neuen Session eine neue Artifact-Id erhalten, da die V1-Identität `sessionId` enthält.
- Wenn der Fork in die Ziel-Session schreibt, sollte die Artifact-Id anhand von Ziel-`sessionId + locator` neu berechnet werden.
- Tombstones müssen ebenfalls auf die neuen Ids der Ziel-Session umgeschrieben werden. Solange die Artifact-Id eines Tombstones sicher remapped werden kann, sollte er in die Ziel-Session übernommen werden, auch wenn in der aktiven Ziel-Chain gerade kein zugehöriger Upsert zu finden ist; ein verwaister Tombstone ist ohne passenden Upsert harmlos, aber sein Verwerfen kann dazu führen, dass ein späterer Upsert derselben Id seine Unterdrückung verliert.
- `forkedFrom` kann die Ursprungs-Session-Id / Ursprungs-Artifact-Id als Audit-Information erfassen, darf aber nicht an den Berechtigungsentscheidungen der neuen Session teilnehmen.
- Wenn der Fork alte `pinned`-Artifact-Metadaten erbt, müssen diese auf `restorable` herabgestuft und alte `contentRef` entfernt werden.
- Die Fork-Kopie muss Ingest-/Restore-Validierung, Privacy-Minimierung und Redaction erneut ausführen. Locators in workspace / url / metadata, die in der Ziel-Session nicht sicher dargestellt werden können, müssen herabgestuft, gestrippt oder verworfen werden; sie dürfen nicht einfach kopiert werden, nur weil die Quell-Session einst die Validierung bestand.
- `managedId` darf nicht blind aus der Quell-Session kopiert werden. Wenn in der Ziel-Session eine neue `managedId` aus Ziel-Workspace / Daemon-verwalteten Manifesten abgeleitet werden kann, muss sie neu berechnet werden; kann sie nicht sicher abgeleitet werden, muss `managedId` entfernt oder diese Artifact-Metadaten verworfen werden.

Das Fork-Remap ist ein Veröffentlichungskriterium: Wenn ein Pfad Artifact-Ids und Tombstones nicht sicher umschreiben kann, müssen die Artifact-Persistenz-Records beim Fork verworfen werden; die Artifact-Ids der Quell-Session dürfen nicht unverändert in die neue Session übernommen werden. Falls die bestehende Fork-Implementierung einen Top-up-Mechanismus wie `file_history_snapshot` hat, dürfen Artifacts ebenfalls nur aus dem Active-Chain-Replay-Ergebnis als Top-up erzeugt werden, nicht unverändert aus dem aktuellen Live-Store des Daemons nachgeschrieben werden, da sonst Artifacts, die nach einem Rewind nicht mehr zur Historie gehören, in die neue Session gelangen.

Die aktuelle Fork-Implementierung hängt nicht einzeln an, sondern erzeugt zuerst die vollständige Ziel-Record-Liste aus der aktiven Quell-Chain und schreibt sie dann per Exclusive-Create in die Ziel-JSONL-Datei; schlägt das Schreiben fehl, wird die Ziel-Session-Datei nicht als erfolgreicher Fork verwendet. Daher schreibt der aktuelle PR kein `session_artifact_fork_marker`. Falls Fork künftig auf Streaming-Append oder prozessübergreifende Batch-Kopie umgestellt wird, werden begin/complete-Marker, Zählprüfungen und `fork_incomplete`-Wiederherstellungsregeln eingeführt.

Die Rewind-Semantik des Forks ist Branch-scoped: Die Ziel-Session kopiert nur das Ergebnis der aktuellen aktiven Chain. Wenn der Nutzer vor einen expliziten DELETE rewindet und dann forkt, war dieser DELETE-Tombstone ohnehin nicht in der aktiven Chain; dass das Artifact im neuen Branch wieder erscheint, ist das erwartete historische Branch-Verhalten. Falls das Produkt ein „global nicht per Rewind löschbares" oder Privacy-Löschungs-Semantik benötigt, sollte dies als separate Policy entworfen werden und darf nicht in das V2-Standard-Branch-Modell gemischt werden.

Die Fork-Amplifikation von Metadaten wird in V2 als begrenzter Trade-off akzeptiert: Ein Fork erfordert Session-Mutationsrechte, jeder Fork unterliegt weiterhin dem 200-Einträge-Limit persistierter Metadaten, einzelne Metadateneinträge sind klein und Content-Bytes werden nicht geerbt. V2 führt keine Projekt-Level-Metadaten-Quota ein; die Implementierung muss die Anzahl geforkter Artifacts als Metric/Log aufzeichnen; bei tatsächlichem Missbrauch wird eine Projekt-Level-Obergrenze eingeführt.

## 6. API-Design

### 6.1 Capability

`GET /capabilities` wird ergänzt um:

```json
"session_artifacts_persistence"
```

Erst wenn die Implementierung der per separatem PR gelieferten Content-Retention verfügbar ist, wird zusätzlich deklariert:

```json
"session_artifacts_content_retention"
```

Aktuell ist `/capabilities` eine String-Feature-Liste, daher kann „Implementierung existiert, aber aktuell ausgeschaltet" nicht über `enabled: false` ausgedrückt werden. Die Regeln sind:

- Der zugehörige Feature-String wird nur deklariert, wenn das Verhalten verfügbar und aktuell konfiguriert aktiviert ist.
- Wenn Chat-Recording deaktiviert, Metadata-Persistenz deaktiviert oder der Writer nicht verfügbar ist, wird `session_artifacts_persistence` nicht deklariert.
- `session_artifacts_content_retention` wird erst deklariert, wenn das explizite Workspace-Content-Speichern, Quota, Manifest und Session-scoped GC/fsck des Future-Content-Archives alle verfügbar sind. PR #6259 deklariert diese Capability nicht.
- Wenn Clients Limits/Default-Retention lesen müssen, sollte ein eigener Config-Endpoint oder SDK-Config-Query entworfen werden; strukturierte Details dürfen nicht in den bestehenden String-only-Capability-Vertrag gemischt werden.

### 6.2 Artifact hinzufügen

`POST /session/:id/artifacts` erlaubt optional:

```json
{
  "title": "Report",
  "kind": "html",
  "storage": "workspace",
  "workspacePath": "reports/run.html",
  "retention": "restorable",
  "clientRetained": true
}
```

Einschränkungen:

- Der Client darf `ephemeral` oder `restorable` anfragen.
- Der Client darf nicht `pinned` anfragen.
- `clientRetained` ist optional und drückt nur die Nutzerbehaltensabsicht und einen Sortierhinweis aus; der Server muss die Quelle gemäß §5.1 validieren und darf es nicht als Autorisierung behandeln.

### 6.3 Pin/Save-Artifact

PR #6259 exponiert keinen Pin/Save-Endpoint. Explizite Inhaltsarchivierung, Content-Archive, Pin/Save gehören zum Future-Content-Archive-PR.

### 6.4 Unpin

PR #6259 exponiert keinen Unpin-Endpoint und erzeugt auch keine neuen Unpin-Tombstones. `reason: "unpin_to_ephemeral"` in alten Journals wird nur als kompatibler Input weiter abgespielt, damit sich die Wiederherstellungssemantik der Historie nicht ändert. Um aus der Liste zu entfernen, wird weiterhin das V1-DELETE verwendet.

### 6.5 Artifact löschen

Das V2-DELETE bleibt V1-idempotent und übernimmt die Live-first-Semantik des aktuellen PRs:

- Zuerst das Artifact aus dem Live-Store entfernen, damit die nutzervisible Löschung sofort wirkt.
- Danach best-effort das `session_artifact_event`-Remove-Tombstone anhängen; nach erfolgreichem Tombstone wird es beim Metadata-Restore nicht wieder auferstehen.
- Schlägt das Tombstone fehl, wird ein erfolgreiches Mutationsresult mit Warning zurückgegeben; innerhalb des aktuellen Daemon-Lebenszyklus ist das Artifact gelöscht, aber wenn der Daemon vor der Tombstone-Persistierung neu startet, kann das alte dauerhafte Artifact noch wiederhergestellt werden. Nutzer oder übergeordnete UI können das DELETE nach Wiederherstellung des Speichers erneut versuchen.
- DELETE bleibt idempotent erfolgreich für nicht existierende Artifacts; existiert bereits ein dauerhaftes Tombstone, muss ein wiederholtes DELETE nicht dasselbe Tombstone erneut schreiben.
- Das DELETE in PR #6259 akzeptiert kein `deleteContent` und löst kein Daemon-verwaltetes Content-GC aus; alte `contentRef`-Metadaten werden nur bei Restore/Serialisierung herabgestuft oder entfernt.

### 6.6 Mutations-Responses

PR #6259 liefert nur die DELETE-Mutations-Response.

Erfolg:

- DELETE: `200 OK` gibt `{ "deleted": true, "artifactId": string, "warnings"?: [...] }` zurück.
- Schlägt die DELETE-Tombstone-Persistierung fehl, wird weiterhin ein `200 OK`-Mutationsresult zurückgegeben und `warnings` enthält den Persistenzfehlergrund; die aktuelle Implementierung verwendet String-Warnings wie `remove_not_persisted`. Das bedeutet, dass der Live-Delete wirkt, aber nicht über Neustarts garantiert ist, und darf nicht als erfolgreicher dauerhafter Delete angezeigt werden.

Fehler:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "retention must be ephemeral or restorable"
  }
}
```

HTTP-Mapping von PR #6259:

- `400 VALIDATION_FAILED`: unzulässiger Body, Client fragt `pinned` an, Artifact existiert nicht, Metadaten-Quota ist voll und es gibt keinen beschneidbaren Kandidaten, oder der Writer ist nicht verfügbar, aber die Mutation muss strikt dauerhaft abgeschlossen werden.
- `403 FORBIDDEN`: fehlende Session-Mutationsrechte.
- DELETE bleibt idempotent; nicht existierende Artifacts geben ein leeres Mutationsresult statt eines Fehlers zurück.
- Scheitert die DELETE-Tombstone-Persistierung, wird `200 OK` + Warning zurückgegeben, weil der aktuelle Live-Delete wirkt, aber nicht über Neustarts garantiert ist.

Feinere `INVALID_ARGUMENT`-, `NOT_FOUND`-, `CONFLICT`-, `METADATA_QUOTA_EXCEEDED`-, `QUOTA_EXCEEDED`- oder `PERSISTENCE_UNAVAILABLE`-HTTP-Fehlercodes sind späteres API-Polishing und gehören nicht zum Wire-Contract des aktuellen PRs.

## 7. Sicherheitsdesign

### 7.1 Autorisierungsprinzipien

Das öffentliche `clientId` darf nicht als Autorisierungsgrenze behandelt werden. Die tatsächliche HTTP-Vertrauensgrenze von V2 bleibt Daemon-Bearer-Token + Routen-Level-Lese-/Mutationsrechte; im bestehenden Auth-Modell kann `session_owner` nicht sicher gemintet oder über Daemon-Restarts hinweg persistiert werden. Daher führt V2 keine Owner-Stufe ein, die stärker ist als der Token-Inhaber.

Interne Principals dienen nur Audit, Standardstrategie und der Verhinderung von Payload-Spoofing; sie sind keine dauerhafte Autorisierungsquelle:

```ts
type ArtifactPrincipal =
  | { kind: 'token_holder' }
  | { kind: 'client_connection'; id: string }
  | { kind: 'trusted_publisher'; id: string }
  | { kind: 'hook'; extensionId: string };
```

Autorisierungsregeln:

- list: erfordert Session-Leserechte.
- add ephemeral/restorable: erfordert Session-Mutationsrechte.
- Metadaten löschen: erfordert Session-Mutationsrechte. Der V1-Same-Principal-Delete-Guard darf nur als Live-Prozess-UX-Guard und Audit-Hinweis dienen; er hängt vom aktuellen Verbindungskontext ab und kann den Artifact-Owner nicht über einen Daemon-Restart hinweg beweisen. Nach dem Restore darf Ownership nicht aus dem öffentlichen `clientId` gefälscht werden; die Löschautorisierung fällt auf Session-Level-Mutationsrechte zurück und zeichnet einen `ownership_unverified`-Audit auf.
- Content-Archive / Content löschen: im aktuellen PR nicht aktiviert. Falls Content-Archive später wieder aufgenommen wird, sind Session-Mutationsrechte, eine eigenständige Capability, ein expliziter REST-/SDK-Aufruf sowie ein im aktuellen Prozess verifizierbarer Creator-Principal-Match oder eine explizite Override-/Admin-Policy erforderlich; Hintergrund-Sessions/Hooks dürfen keine Inhaltslöschung direkt anstoßen.

Falls zukünftig ein echter `session_owner` benötigt wird, muss zuerst eine dauerhafte Pro-Session-Capability oder ACL entworfen werden; dies darf nicht stillschweigend in diesem V2-Dokument angenommen werden.

### 7.2 Future-Content-Archive-Grenzen

Dieser Abschnitt ist der Future-Content-Archive-Blueprint und gehört nicht zur Implementierung oder Abnahme von PR #6259.

Standardmäßig wird nicht kopiert:

- Inhalt entfernter URLs
- beliebige Workspace-Dateien
- normale Assistant-Links

Falls Content-Archive zukünftig aktiviert wird, können folgende Quellen erwogen werden:

- `published`-Artifacts, die von vertrauenswürdigen `ArtifactTool` / Publishern erzeugt wurden.
- Vom Nutzer explizit gepinnte Workspace-Artifacts, sofern die Datei im Workspace liegt und Typ/Größe kontrollierbar sind.
- Vom Client hochgeladene oder registrierte Managed-Artifacts, sofern sie über die Daemon-API empfangen und validiert wurden.

Der Daemon-verwaltete Artifact-Speicher muss einen klaren Root haben:

- Der `managed_copy`-Content-Root liegt im Artifact-Content-Bereich des Daemon-Datenverzeichnisses, z. B. `<daemonDataDir>/artifacts/content/`.
- Der `published`-Datei-Root liegt im Published-Artifact-Bereich des Daemon-Datenverzeichnisses, z. B. `<daemonDataDir>/artifacts/published/`, oder in einem von der Konfiguration deklarierten gleichwertigen Daemon-eigenen Root; die Root-Id muss im Publisher-Manifest erfasst sein.
- Im JSONL dürfen keine direkt vertrauenswürdigen Host-Absolutpfade gespeichert werden. Beim Restore werden nur die Root-Id und relative Locators aus dem Manifest gelesen; nach resolve/realpath müssen sie weiterhin innerhalb des zugehörigen Roots liegen, und Symlink-/Path-Escape wird abgelehnt.
- Das Trusted-Publisher-Manifest erfasst mindestens Publisher-Id, Artifact-Id, Storage-Root-Id, relativen Pfad oder Content-Id, sha256, sizeBytes und createdAt. `file:`-Locators dürfen nur aus diesem Manifest neu erzeugt werden, nicht aus Client-Payload oder alten JSONL-Feldern.

Die Inhaltskopie muss Race-sicher sein:

- Workspace-Containment-Prüfung bestanden.
- Nur reguläre Dateien erlaubt; Verzeichnisse, FIFOs, Devices, Sockets und andere Spezialdateien werden abgelehnt.
- Beim Öffnen wird No-Follow-Semantik verwendet; Linux kann `openat2(RESOLVE_NO_SYMLINKS)` nutzen, andere Plattformen eine verfügbare Kombination aus No-Follow/Open-Handle-Revalidierung.
- Nach dem Öffnen wird fstat/Revalidierung auf dem File-Handle ausgeführt, um zu bestätigen, dass es weiterhin eine reguläre Datei ist und weiterhin innerhalb der Workspace-Containment liegt.
- Hardlinks mit auffälligem Link-Count werden abgelehnt, sofern es keine spätere explizite Allowlist gibt.
- Beim Lesen wird der Stream auf max bytes erzwungen; der stat-Größe darf nicht vorab vertraut werden.
- Es werden exakt die kopierten Bytes gehasht und sha256, Größe, mimeType gespeichert.
- Vor dem Öffnen/Herunterladen von Retained-Content wird Manifest/Hash erneut validiert.

### 7.3 Privatsphäre und sensible Informationen

Vor der Persistierung muss minimiert werden:

- Keine Host-Absolutpfade speichern.
- Keine URL-Username/Passwords speichern.
- Secret-artige Query/Fragments entfernter URLs müssen abgelehnt, redacted oder das Artifact auf `ephemeral` / nicht-öffnbare Locators herabgestuft werden; sie dürfen nicht unverändert in das JSONL geschrieben werden.
- Metadaten verwenden eine Allowlist oder eine Secret-Key-Denylist; Key/Values wie `token`, `password`, `secret`, `cookie`, `authorization` müssen abgelehnt, redacted oder auf `ephemeral` herabgestuft werden.
- Metadaten bleiben auf 4 KB begrenzt.
- title/description/metadata unterliegen weiterhin den Unsafe-Display-Payload-Prüfungen.
- `persistenceWarning.message` muss, selbst wenn es nur als Live-Response-Feld dient, pfadfreie Templates oder entschärften Text verwenden; Host-Pfade, Credentials, Token, Content-Roots und Verbindungs-Ids dürfen nicht in die Warning geschrieben werden.

Später kann eine neue Einstellung hinzukommen:

```json
{
  "sessionArtifacts": {
    "persistence": {
      "enabled": true,
      "defaultRetention": "restorable",
      "maxLiveArtifacts": 200,
      "maxPersistedMetadata": 200,
      "snapshotThresholdMutations": 100,
      "snapshotThresholdBytes": 262144,
      "contentRetention": {
        "enabled": false,
        "maxArtifactBytes": 52428800,
        "maxTotalBytes": 268435456,
        "maxTtlDays": 365,
        "ttlScanIntervalSeconds": 900
      }
    }
  }
}
```

Der aktuelle PR führt kein neues Betreiber-Konfigurationsschema ein; die obigen Werte werden als Code-Konstanten ausgeliefert und die Verfügbarkeit des Verhaltens über die Capability ausgedrückt. Diese Werte als Betreiber-Tunables zu exponieren ist eine spätere Verbesserung; Clients dürfen aus dem Capability-String keine Konfigurationsdetails ableiten.

## 8. Quota, GC und Stabilität

### 8.1 Metadaten-Quota

Empfohlene Defaults:

- Das Live-Store-Limit bleibt 200.
- Das Limit persistierter Metadaten beträgt 200 pro Session, ausgerichtet am Live-Store.
- Ein Snapshot-Record behält höchstens 200 aktuell gültige Artifacts.

Das Live-Store-Limit ist in der aktuellen Implementierung auch das Limit der Restore-sichtbaren Menge:

- Die V2-Live-Eviction muss zuerst `ephemeral`-Artifacts aussortieren.
- Wenn unter den dauerhaften Artifacts für die Live-Ansicht gewählt werden muss, wählt die aktuelle Implementierung deterministisch nach Source-Reservation, Source, Status, Retention, clientRetained und Einfügereihenfolge.
- Wenn ein dauerhaftes Artifact durch das Live-Limit aussortiert wird, schreibt die aktuelle Implementierung ein Remove-Event mit `reason: "eviction"`, damit der nächste Restore nicht wiederholt vom Daemon aussortierte Einträge aufleben lässt.
- `clientRetained` ist die Nutzerbehaltensabsicht, geht in `PersistedSessionArtifact` ein und dient der stabilen Sortierung und Live-Limit-Auswahl nach dem Restore; es ist ein Sortierschutz, kein absoluter Schutz.

Beim Überschreiten des Limits persistierter Metadaten:

- `ephemeral` wird ohnehin nicht ins Journal geschrieben, zählt nicht in die Persistenz-Metadaten-Quota und unterliegt nur dem Live-Store-Limit.
- `restorable` muss in deterministischer Reihenfolge beschnitten werden und ein `eviction`-Remove-Event schreiben: zuerst werden `restorable`-Artifacts ohne `clientRetained` beschnitten; reicht der Raum immer noch nicht, werden `restorable`-Artifacts mit `clientRetained` beschnitten. `clientRetained` ist ein Sortierschutz, kein absoluter Schutz.

Der Restore-Seed darf das Live-Store-Limit nicht überschreiten; enthält die Historie mehr gültige persistierte Artifacts als das aktuelle Live-Limit, seedet der Daemon-seitige Store dieselbe deterministische Regel für die sichtbare Teilmenge und schreibt über die Operation-Queue `eviction`-Remove-Events für die beschnittenen dauerhaften Einträge. Der Parse-Vorgang von `loadSession()` selbst bleibt read-only und darf kein dauerhaftes Prune direkt schreiben.

### 8.2 Content-Quota

Dieser Abschnitt ist der Implementierungsumfang des späteren Content-Retention-PRs; PR #6259 führt keine Content-Store-Quota ein.

Empfohlene Defaults für den späteren separaten PR:

- Pro Artifact: 50 MB.
- Content-Store-Gesamt: 256 MB.

Beim Erreichen des Limits:

- Neues Pin/Save gibt `QUOTA_EXCEEDED` zurück.
- Gepinnter Content, auf den sich Live-Artifacts der aktuellen Session noch beziehen, wird nicht automatisch gelöscht.
- Ein Fork erbt keine gepinnten contentRefs, damit der Fork die Quota nicht umgeht.

### 8.3 GC

Dieser Abschnitt ist der Implementierungsumfang des späteren Content-Retention-PRs. GC behandelt nur Daemon-verwaltete Session-scoped Managed Copies:

- Das Content-Manifest speichert `sessionId` und `artifactId`; GC löscht nur Content, dessen Manifest zur aktuellen Session gehört und nicht in der aktuellen Live-`contentRefs()`-Referenzmenge enthalten ist.
- `pinWorkspaceFile()`, GC und Tmp-Cleanup werden über dieselbe Write-Queue serialisiert und verwenden einen In-Flight-Lease, um zu verhindern, dass paralleles Pin/GC gerade kopierten, aber noch nicht journaled Content löscht.
- `expiresAt`-Ablauf wird durch ein leichtgewichtiges Prune vor `GET /artifacts` behandelt, das gepinnte Artifacts auf `restorable` herabstuft und nach Entfernen des `contentRef` das GC auslöst.
- Close / explizites Delete / Unpin / expliziter GC-Endpoint führen alle einen Best-effort-Sweep aus; GC-Fehler blockieren den Prompt-/Tool-Flow nicht.

GC-Auslöser:

- Artifact-Delete, Unpin, TTL-Ablaufprüfung, Session-Close oder explizites `POST /session/:id/artifacts/gc`.
- Verwaiste `.tmp`-Einträge werden während des GC bereinigt.

Projekt-scoped Referenz-Rebuild, Incomplete-Scan-Tracking, Orphan-Karenzzeit und eine globale Artifact-Library sind spätere Verbesserungen. Die Sicherheitsgrenzen des Future-Content-Archives sollten aus „contentRefs werden nicht über Sessions hinweg geerbt" und „nur Content löschen, dessen Manifest zur aktuellen Session gehört und nicht von aktuellen Live-Refs referenziert wird" bestehen.

### 8.4 Crash-Konsistenz

Anforderungen:

- Artifact-Store-Mutationen seriell.
- Ein fehlgeschlagener JSONL-Journal-Append darf den Live-Store nicht beschädigen.
- Explizites DELETE live-first: das Entfernen aus dem Live-Store darf nicht durch Journal-Fehler blockiert werden; die Response-Warning teilt Clients mit, wann das Tombstone nicht dauerhaft war.
- Explizites DELETE mit `deleteContent: true` ist nur im Content-Retention-Follow-up verfügbar; jener PR muss nach dem Live-Removal ein Best-effort-Session-scoped-Content-GC ausführen und Content-Delete-Warnings sichtbar machen.
- Die Live-Limit-Eviction für dauerhafte Artifacts schreibt ein `eviction`-Remove-Event, damit der Restore das Limit respektiert.
- Der Reader toleriert halbe JSONL-Zeilen und korrupte Artifact-Records.
- Bei anomaler Tombstone-/Snapshot-Reihenfolge wird nicht wiederhergestellt, statt zu raten.

Schreibreihenfolge des Future-Content-Archives:

1. Inhalt in einen Staging-Pfad kopieren, exakt die kopierten Bytes hashen und die Bytes fsyncen.
2. Atomar in den Daemon-verwalteten Content-Root verschieben, das Content-Manifest schreiben und fsyncen.
3. Das Artifact-Journal-Event anhängen, das diesen contentRef referenziert, und das JSONL fsyncen.
4. Den Live-Store aktualisieren und `artifact_changed` publizieren.

Erfolgt Schritt 2, aber ein Crash vor Schritt 3, bleibt verwaister Content ohne Journal-Referenz zurück; dies ist zulässig, und das zukünftige Session-scoped GC löscht ihn best-effort, nachdem bestätigt wurde, dass das Manifest nicht von aktuellen Live-Refs referenziert wird. Erfolgt Schritt 3, muss der Restore den Inhalt über das Manifest finden können. Die explizite API darf erst nach erfolgreichem Schritt 3 Erfolg melden.

### 8.5 Dateilese-, CPU- und I/O-Kosten

V2 muss vermeiden, dass die Artifact-Wiederherstellung zum neuen Flaschenhals des Session-Loads wird.

Empfohlener Lesepfad:

1. Wenn `SessionService.loadSession()` ohnehin das JSONL liest, werden die Artifact-Records im selben Parse-Durchlauf extrahiert.
2. Den neuesten validen `session_artifact_snapshot` finden und nur die danach folgenden Artifact-Events abspielen.
3. Ohne validen Snapshot ist ein einzelner sequenzieller Scan der Artifact-Records zulässig, aber nicht ein wiederholtes Scannen derselben Datei innerhalb des Load-Flusses.

CPU-Kostengrenzen:

- Metadata-Restore parst nur JSON und führt Feldvalidierung aus; Komplexität O(Artifact-Anzahl + Events nach dem neuesten Snapshot).
- Die `external_url`-Wiederherstellung sendet keine Netzwerkanfragen.
- `workspace`-Load/Replay stellt nur Metadaten wieder her; GET/list-Refresh statet unter TTL/Batch-Limits einzelne oder eine Gruppe von Workspace-Dateien neu und hasht nur bei Bedarf, um zwischen `available` / `missing` / `changed` zu unterscheiden.
- Die `managed` / `published`-Wiederherstellung fragt nur das Manifest ab und liest keine großen Dateiinhalte.
- Das Hashen von Workspace-Inhalten wird nicht vollständig während der JSONL-Parse-Phase von `loadSession()` ausgeführt. GET/list-Refresh verwendet zuerst size + mtimeMs als günstiges Stat-Gate; nur wenn das Stat eine mögliche Größen-erhaltende Änderung anzeigt, wird der Dateistrom gelesen, um sha256 zu berechnen.

I/O-Kostengrenzen:

- V2 liest keine zusätzlichen Sidecar-Dateien.
- Die Workspace-Zustandsprüfung verwendet die V1-TTL/Batch-Strategie weiter und statet nicht alle Artifacts unbegrenzt im GET-Hotpath.
- Für große Workspace-Dateien werden in der Restore-Phase keine Inhalte gelesen; bei der Registrierung wird der Live-Dateistrom gelesen, um sha256 zu berechnen; beim späteren Refresh wird der Dateistrom nur neu gelesen, wenn size/mtimeMs eine mögliche Änderung anzeigen; es wird nicht in Daemon-verwalteten Storage kopiert.

Empfohlene Defaults:

- Artifact-Snapshot-Limit 200 Einträge.
- Workspace-Status-Restore-Batch-Größe 20, konsistent mit V1.
- Artifact-Journal-Snapshot-Schwelle 100 Mutationen oder 256 KB.
- Workspace-sha256 wird bei der Registrierung synchron abgeschlossen; die Zustandsprüfung nach dem Restore erfolgt lazy per TTL/Batch-Refresh und vermeidet über size + mtimeMs wiederholtes Voll-Hashen unveränderter Dateien.

### 8.6 Observability

Die neuen Fehlerpfade von V2 müssen strukturierte Logs haben, im Format:

```text
[artifacts] session=<id> action=<action> key=value
```

Empfohlene Actions:

- `persist_failed`
- `retention_downgraded`
- `restore_skipped`
- `restore_blocked`
- `remove_not_persisted`
- `eviction`
- `fork_artifact_discarded`
- `fork_incomplete`
- `snapshot_invalid`
- `sticky_override_suppressed`
- `tombstone_conflict`
- `v2_writer_version_gate_failed`

Zukünftige Checker / Content-Archive können weitere fsck-, Content-Kopie-, TTL- und GC-bezogene Actions hinzufügen; PR #6259 erzeugt diese Logs nicht.

Diese Logs ersetzen nicht die `persistenceWarning` in API/SSE, sondern dienen dem Produktions-Troubleshooting.

Empfohlene Metrics:

- Counter: `artifact_journal_append_total{result,reason}`
- Counter: `artifact_restore_total{result,restore_state}`
- Gauge: `artifact_pending_tombstone_count`
- Gauge: `artifact_metadata_quota_used{session}`
- Counter: `artifact_sticky_override_suppressed_total`

Der Export verwendet die bestehende Daemon-Telemetrie/Metrics-Mechanik; gibt es aktuell keinen Prometheus-Endpoint, sollten sie zumindest in einen strukturierten Telemetrie-Sink fließen und pro Session/Projekt aggregierbar sein.

Diagnosewerkzeuge sind spätere Verbesserungen und gehören nicht zum Wire-Contract von PR #6259. Ein Metadata-only-Checker kann Artifact-Journal/Snapshot/Tombstones und Restore-Validierungsfehler scannen; ein Full-Content-Checker wartet bis zum Neu-Design des Future-Content-Archives und scannt dann Content-Manifeste und Daemon-verwalteten Storage. Zukünftige CLI- oder Daemon-interne APIs (z. B. `qwen artifact fsck`) sollten einen Dry-Run unterstützen:

- Der Metadata-only-Modus meldet Snapshot-/Tombstone-Inkonsistenzen und Restore-Validierungsfehler.
- Der Full-Content-Modus meldet verwaiste `contentRef`, fehlende Manifeste und verwaisten Content.
- Standardmäßig nur lesend; der Reparaturmodus darf nur verifizierbare sichere Aktionen ausführen, z. B. das Neu-Erzeugen eines Snapshots oder das Markieren von verwaistem Content für das GC.

## 9. Implementierungsplan

Im Folgenden sind die Implementierungsmeilensteine innerhalb derselben V2-Designphase. Engineering-seitig können sie in PRs aufgeteilt werden; nach außen werden die tatsächlich verfügbaren Fähigkeiten über Capabilities deklariert.

### Meilenstein A: Typen und Persistenz-Service

- Neue Artifact-Persistenz-Reader/Writer:
  - Der Writer liegt auf der Seite des Chat-Recording-Owners oder wird von dieser Seite als expliziter RPC exponiert; er hängt Event-/Snapshot-Records an die aktive Leaf-Chain an.
  - Der Reader liegt im Parse-/Replay-Pfad von `SessionService.loadSession()` und baut den Artifact-Snapshot aus der aktiven Leaf-Chain neu auf.
  - Gemeinsame Restore-Validierung, Snapshot-/Tombstone-Konsistenzprüfungen und Persistenz-Form-Normalisierung.
- `ChatRecord.subtype` und `systemPayload`-Union erweitern.
- `artifactSnapshot?` im Load-Ergebnis ergänzen.
- Der Metadata-only-Checker ist eine spätere Verbesserung und kann per Dry-Run korrupte Artifact-Records, Snapshot-/Tombstone-Inkonsistenzen und Restore-Validierungsfehler erkennen.

### Meilenstein B: Daemon-seitige Store-Integration

- `createSessionEntry` der Daemon-Bridge unterstützt das Seeden von Artifacts.
- `SessionArtifactStore` unterstützt das Seeden von Artifacts.
- `upsertMany()` berechnet in der Operation-Queue das effektive `retention`, Quota-Prune und Live-Ansicht und hängt dann über den Writer dauerhafte Records an.
- `remove()` unterscheidet explizites DELETE und Eviction; explizites DELETE ist live-first und schreibt best-effort das Tombstone, dauerhafte Eviction schreibt das Journal. Alte `unpin_to_ephemeral` bleiben nur in der Journal-Replay-/Snapshot-Sticky-State-Kompatibilität erhalten.
- Das Backfill-Snapshot beim ersten Aktivieren von V2 für V1-Live-Sessions gehört nicht zum Implementierungsumfang des aktuellen PRs; die aktuelle Implementierung stellt aus neu geschriebenen V2-Journals/Snapshots wieder her.
- Die V1-`artifact_changed`-Event-Form bleibt unverändert; nur optionale Felder werden ergänzt.

### Meilenstein C: Load/Replay-Integration

- `SessionService.loadSession()` extrahiert Artifact-Snapshot-/Event-Records aus der aktiven Leaf-Chain und ignoriert verlassene Branches.
- Das Load-Ergebnis übergibt den Snapshot an die Daemon-Bridge, statt den Store im ACP-Child-Prozess zu seeden.
- Das Restore-Over-Cap-Prune darf erst geschrieben werden, nachdem der Daemon-seitige Store erstellt und der Writer verfügbar ist; der Load-Parse-Vorgang bleibt read-only.
- Nach Rewind/Leaf-Wechsel richtet sich der Daemon-seitige Live-Store neu am Active-Chain-Replay-Ergebnis aus oder fixiert den aktuellen Zustand der überlebenden Chain über ein Artifact-Snapshot-Top-up.
- Rewind/Leaf-Wechsel muss einen expliziten Hook aufrufen, z. B. `onActiveLeafChanged(sessionId, artifactSnapshot)`, damit der Daemon-seitige Store Reseed/Top-up in der Operation-Queue abschließt.
- Beim Replay der Historie werden Artifacts derselben Identität nicht doppelt erzeugt.
- `/branch` kopiert Artifact-Records aus der aktiven Chain und remapped Session-Id/Artifact-Id; der aktuelle Full-File-Exclusive-Create-Schreibpfad benötigt keinen Fork-Marker.

### Meilenstein D: REST/SDK

- SDK-Typen um optionale Felder ergänzen.
- `POST /session/:id/artifacts` unterstützt `retention: "ephemeral" | "restorable"`.
- `POST /session/:id/artifacts` unterstützt den `clientRetained`-Boolean-Hinweis und lehnt vom Client übergebene Daemon-only-Runtime-Felder ab.
- Capability-gated UI.

### Meilenstein E: Future-Content-Archive

Gehört nicht zu PR #6259. Falls zukünftig Audit-/Archivierungsbedarf besteht, müssen Daemon-verwaltete Workspace-Content-Manifeste, Quota, Race-sichere Kopie, Hash-Verifikation, Write-Queue-/Lease-geschütztes GC/fsck und Published-Artifact-Content-Bindung separat entworfen werden.

## 10. Testplan

PR #6259 muss aktuell abdecken:

- Wiederherstellung der Artifact-Liste nach Daemon-Restart/Load nach Metadata-Journal-Append.
- Artifact-Journal-Append erfolgt über den Chat-Recording-Owner in die aktive Leaf-Chain; der Daemon-seitige Store darf nicht direkt in das JSONL schreiben.
- Nach `/rewind` nehmen Artifact-Upserts/Removes auf verlassenen Branches nicht am Restore teil und werden auch nicht im Fork kopiert.
- Nach `/rewind` richtet sich der Live-Store sofort am Artifact-Zustand der aktiven Chain aus; die Artifact-Liste ändert sich nicht erst beim Daemon-Neustart.
- Das Backfill-Snapshot beim Upgrade einer V1-Live-Session auf V2 ist eine spätere Verbesserung; die Tests des aktuellen PRs sollten bestätigen, dass alte Live-Artifacts, die nicht in das V2-Journal geschrieben wurden, nicht fälschlich als wiederherstellbar gemeldet werden.
- Nach einem DELETE-Tombstone lässt der Load das Artifact nicht wieder auferstehen.
- Nach dem Replay eines Legacy-`unpin_to_ephemeral`-Tombstones lässt der Load das Artifact nicht wieder auferstehen.
- Nach einem Legacy-`unpin_to_ephemeral` bleibt ein impliziter/Default-Re-Upsert derselben Artifact-Id live-only; ein explizites `restorable` kann den Sticky-Override superseden.
- Nach einem Snapshot-Baseline-Advance sorgt `stickyEphemeralIds` weiterhin dafür, dass implizite/Default-Re-Upserts live-only bleiben, und erzeugt Log/Metric/Warning `sticky_override_suppressed`.
- Wenn `stickyEphemeralIds` das Limit erreicht, gibt ein Legacy-unpin-zu-ephemeral einen Fehler zurück oder versucht später erneut, ohne alte Sticky-Overrides still zu verlieren.
- Explizites DELETE live-first: Live-Ansicht entfernt sofort; schlägt das Tombstone-Schreiben fehl, trägt die Response eine Warning; Tests decken ab, dass der Live-Removal nicht durch Persistenzfehler blockiert wird.
- Dauerhafte Artifact-Eviction schreibt ein `eviction`-Remove-Event; nach dem Restore wird das Live-Limit nicht überschritten.
- Snapshot-Baseline-Advance: der periodische Snapshot komprimiert die aktuelle Artifact-Liste, explizite Tombstones wachsen nach erfolgreichem Snapshot nicht mehr unbegrenzt, `stickyEphemeralIds` behält den Sticky-Zustand.
- Datei-existiert/fehlt/Symlink-Escape als drei Zustände bei Workspace-Artifact-Ingest und -Restore.
- Workspace-Root-Verlagerung: existiert derselbe relative Pfad, wird als available wiederhergestellt; bei Fehlen oder Layout-Inkonsistenz als missing; kein Path-Remap.
- Externe URLs stellen nur Metadaten wieder her und senden keine Netzwerkanfragen.
- Secret-tragende URL-Query/Fragments und Metadata-Key/Values werden nicht in das JSONL geschrieben.
- Published-lokale `file:` werden nur wiederhergestellt, wenn die Trusted-Manifest-Revalidierung besteht.
- `managedId` lehnt bei Ingest, Restore und Fork-Remap Trennzeichen, `..`, absolute Pfade und Pfadformen ab; der Fork darf die `managedId` der Quell-Session nicht blind kopieren.
- Korrupte JSONL-Records werden übersprungen und beeinflussen andere Artifacts nicht.
- Wenn Chat-Recording / Persistenz deaktiviert ist, wird der Metadata-Restore nicht deklariert oder nicht aktiviert.
- Bei Persistenzfehlern eines Tool-Artifacts wird auf live-only herabgestuft und der Client sieht dies über `persistenceWarning`.
- Behandlung von sessionId/Id der Artifact-Records bei Branch/Fork, wobei nur das Active-Chain-Replay-Ergebnis verwendet wird.
- Fork-Full-File-Write: nach Active-Chain-Remap wird das Ziel-JSONL per Exclusive-Create geschrieben; ein Fehlschlag erzeugt keinen erfolgreichen Fork; falls Fork künftig gestreamt wird, werden begin/complete-Marker-Tests ergänzt.
- Wenn Fork / Restore alte `pinned`-Artifacts liest, werden sie auf restorable herabgestuft und contentRef wird nicht geerbt.
- Verwaiste Tombstones bleiben beim Fork-Remap erhalten und werden sicher remapped; nur Tombstones, die nicht sicher remapped werden können, werden verworfen.
- Das Fork-Remap führt Validierung, Privacy-Minimierung und Redaction erneut aus; unsichere Locators werden gestrippt, herabgestuft oder verworfen.
- Der Restore-Seed ist mit parallelem POST serialisiert, ohne verlorene Writes oder Duplikate.
- Quota-Grenzen: 200 Einträge, Prune bei 201, zweistufige Sortierung clientRetained/nicht-clientRetained, selbst alle clientRetained restorable können nach deterministischen Regeln beschnitten werden.
- clientRetained-Setter: Der Add-Artifact-Request kann den Boolean-Hinweis setzen; Hintergrund-Auto-Ingest kann kein Nutzerbehalten vortäuschen.
- Workspace-Dreizustand: bei der Registrierung werden size + `metadata["qwen.workspace.sha256"]` + `metadata["qwen.workspace.mtimeMs"]` geschrieben; GET/list-Refresh kann `available`, `missing` und `changed` unterscheiden, und unveränderte Dateien gehen nur den Stat-Schnellpfad.
- Autorisierung: Erlaubte und abgelehnte Fälle des Token-Inhaber-/Principal-Audit-Pfads; der V1-Live-Same-Principal-Guard dient nur als Live-UX-/Audit-Hinweis, nicht als dauerhafte Sicherheitsgrenze.
- JSONL-Snapshot-Baseline-Advance: Schwellenwert-Auslösung, Post-Snapshot-Replay ist begrenzt, die Snapshot-Payload trägt keine bereits überdeckten expliziten Tombstones mehr, ein superseded Sticky-Tombstone erlaubt das explizite Wiederauftauchen derselben Id, `stickyEphemeralIds` behält den Sticky-Zustand; die JSONL-Datei selbst wird vom Artifact-Subsystem nicht umgeschrieben.
- Fallback bei korruptem neuestem Snapshot: Rückgriff auf einen älteren validen Snapshot oder ein einzelner sequenzieller Artifact-Replay.
- Retention-Defaults: Tool-Artifact ohne explizites Retention, Client-POST `pinned` wird abgelehnt.
- Capability: die String-Liste wird nur deklariert, wenn das Verhalten aktuell verfügbar ist; verlässt sich nicht auf `enabled:false`-Details.
- Replay-Idempotenz: zweimaliges Replay derselben Session-Historie dupliziert keine Artifacts.
- Alte SDK-Clients können V1-Artifacts weiterhin anzeigen, nachdem sie die optionalen Felder ignoriert haben.
- V2 -> V1-Rollback-Kompatibilität: alte Daemons müssen unbekannte `system`-Subtypes parsen oder ignorieren können und dürfen den Session-Load nicht zum Absturz bringen; dass die Artifact-Persistenz nach dem Rollback nicht wiederhergestellt wird, ist eine akzeptable Degradation. Wenn die aktuell niedrigste unterstützte Version dies nicht garantieren kann, muss der V2-Writer per Capability-Gate auf eine Version nach der Unterstützung unbekannter System-Records beschränkt werden.
- Rollback-Preflight: die niedrigste unterstützte alte Daemon-Version lädt ein JSONL mit V2-Events/Snapshots; falls zukünftig Fork-Marker hinzukommen, wird die Rollback-Fixture entsprechend erweitert.
- PR #6259 deckt den Metadata-API-Response-Vertrag ab: Delete-Erfolgs-Body, Metadata-Quota-Validierungsfehler, `remove_not_persisted` / `persistence_unavailable`-Warnings, aktuelles 400/403/200+Warning-Mapping.

Future-Content-Archive / Checker decken separat ab:

- `deleteContent: true` exponiert eine `content_delete_preserved`-Warning, wenn Tombstone/Content-GC riskant sind.
- Beim Pin/Save von Content werden Symlinks, Spezialdateien, übergroße Streams, Hardlink-Anomalien und TOCTOU-Swaps abgelehnt.
- Metadata-only-Checker-Dry-Run: korrupte Records, Snapshot-Fallback, verwaiste Tombstones, Restore-Validierungsfehler.
- Full-Content-Checker-Dry-Run: verwaiste `contentRef`, fehlende Manifeste, verwaister Content und GC-Reparaturstrategien.

## 11. Was in V2 nicht empfohlen wird

- Normale Markdown-Links automatisch abrufen.
- Workspace-Dateiänderungen automatisch scannen.
- Standardmäßig die Inhalte aller Workspace-Artifacts kopieren.
- Erreichbarkeits-Polling für externe URLs.
- `clientId` als Löschautorisierungsnachweis verwenden.
- Automatisches Path-Remapping für verlagerte Workspaces.
- Umfangreiche fs/Netzwerk-Validierungen im GET-Hotpath.
- Persistenzfehler zu normalen Tool-Turn-Fehlern machen.
- Einen Sidecar-Cache einführen, ohne dass Messungen die Notwendigkeit belegen.

## 12. Empfohlener Veröffentlichungsumfang

V2 sollte als vollständige Designphase veröffentlicht werden, aber die Fähigkeiten werden über Capabilities exponiert:

- `session_artifacts_persistence` kann zuerst den Metadata-Restore veröffentlichen.
- `session_artifacts_content_retention` wird aktuell nicht veröffentlicht; das Future-Content-Archive muss neu entworfen werden und die Capability separat deklarieren.
- Explizit registrierte Artifact-Metadaten werden standardmäßig wiederhergestellt.
- Vom Nutzer manuell registrierte Artifacts sind standardmäßig `restorable` und erscheinen nach Session-Load/Replay weiterhin in der Liste.
- Die Nutzerdokumentation stellt klar: Der Metadata-Restore stellt den „Produktindex" wieder her, nicht ein „Inhalts-Backup der Produkte"; der `changed`-Zustand eines Workspaces besagt nur, dass die Live-Datei ihre Größe gegenüber der Registrierung geändert hat oder dass sich der Hash nach einer mtime-Änderung unterscheidet.

Rollback-Prozedur:

- V2-Records verbleiben im Chat-JSONL und werden beim Rollback nicht gelöscht; wenn alte Daemons unbekannte `system`-Subtypes ignorieren können, sollte der Session-Load weiter funktionieren, aber die Artifact-Persistenz nicht wiederherstellen.
- Daemon-verwalteter Content-Speicher gehört nicht zu PR #6259; ein späterer Content-Retention-PR muss den Bereinigungsprozess für Retained-Bytes nach dem Rollback separat definieren.
- Wenn die aktuell niedrigste unterstützte alte Version V2-System-Records nicht sicher ignorieren kann, muss der Writer per Capability-Gate auf eine sichere Version beschränkt werden oder vor dem Upgrade ein Migrations-Guard bereitgestellt werden, der das Schreiben von V2-Records verhindert.
- Vor der Veröffentlichung muss die CI mit der niedrigsten unterstützten alten Daemon-Version ein JSONL laden, das `session_artifact_event` und `session_artifact_snapshot` enthält, und asserten, dass der Session-Load erfolgreich ist und unbekannte Subtypes ignoriert werden. Auch vor der ersten Initialisierung des V2-Writers muss ein Versions-/Feature-Gate geprüft werden; bei Fehlschlag verweigert er das Schreiben von V2-Records, zeichnet `v2_writer_version_gate_failed` auf und behält das V1-Verhalten. Falls zukünftig Fork-Marker hinzukommen, wird dieser Subtype in die Rollback-Fixture aufgenommen.
- Nach dem Rollback dürfen Clients sich nicht auf `session_artifacts_persistence` / `session_artifacts_content_retention` verlassen, weil alte Daemons diese Capabilities nicht deklarieren.

So lässt sich die vollständige Semantik des aktuellen V2 klar beschreiben: standardmäßig die Liste wiederherstellen, Inhalte nicht speichern, über Workspace-size/mtime/hash vermeiden, dass still eine falsche Version geöffnet wird, und gleichzeitig vermeiden, unveränderte Dateien wiederholt vollständig zu hashen.
