# Referenz-Deployment für Managed Agents


Die Managed-Agent-Referenzdistribution ist experimentell. Die akzeptierte Initialtopologie besteht aus einer Java-Control-Plane und ihrem eingebetteten Runtime-Broker auf einem vertrauenswürdigen Linux-Host, einer MySQL-Datenbank und einem kompatiblen Qwen Hosted Harness. Das Kompatibilitätsmanifest jedes Releases ist für dieses Release maßgeblich.

## Überprüfen und entpacken

Laden Sie das Archiv, das abgetrennte Manifest und `SHA256SUMS.txt` aus demselben GitHub-Prerelease herunter. Überprüfen Sie diese vor dem Entpacken:

```bash
sha256sum --check SHA256SUMS.txt
tar -xzf qwen-managed-agent-reference-<version>.tar.gz
cd qwen-managed-agent-reference-<version>
sha256sum --check SHA256SUMS
```

Prüfen Sie `manifest.json`. Stellen Sie sicher, dass `source.revision` der überprüften Revision entspricht, `compatibility.qwenCodeVersion` mit der CLI/Harness-Installation übereinstimmt und `compatibility.databaseSchema.latestMigrationVersion` für die Zieldatenbank akzeptabel ist. Das Release ist ungültig, wenn eine Checksummen- oder Kompatibilitätsprüfung fehlschlägt.

## Voraussetzungen

- Linux auf dem vertrauenswürdigen Anwendungs-Host.
- JDK 21 oder höher.
- Node.js passend zu `compatibility.node` und Qwen Code passend zu `compatibility.qwenCodeVersion`.
- MySQL 8 mit einer leeren Datenbank oder einer Datenbank, die zuvor von einer älteren kompatiblen Referenzdistribution verwaltet wurde.
- Private, persistente Verzeichnisse für den Runtime-Zustand und den autorisierten Workspace.
- Stabile Datenbank-Zugangsdaten, Runtime-Credential-Key und Harness-Token, außerhalb des Archivs gespeichert.

Das Java-Archiv enthält nicht die npm-CLI. Installieren oder bauen Sie die exakte kompatible Qwen-Code-Revision separat und ermitteln Sie den Pfad zu `dist/cli.js` für die Runtime-Worker.

## Hosted Harness starten

Wählen Sie einen Token und einen Capability-Digest und übergeben Sie dieselben Werte an Harness und Java-Service:

```bash
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

QWEN_SERVER_TOKEN="$QWEN_MANAGED_AGENT_HARNESS_TOKEN" \
QWEN_HOSTED_HARNESS_CAPABILITY_DIGEST="$QWEN_MANAGED_AGENT_CAPABILITY_DIGEST" \
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

Betreiben Sie den Harness auf Loopback. Notieren Sie den gemeldeten Port; `--port` kann aufrücken, wenn der angeforderte Port bereits belegt ist.

## Java-Control-Plane starten

Konfigurieren Sie in einem anderen Terminal denselben Harness und die Datenbank:

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/qwen_managed_agent'
export SPRING_DATASOURCE_USERNAME='qwen'
export SPRING_DATASOURCE_PASSWORD='<private-password>'
export QWEN_MANAGED_AGENT_HARNESS_ENABLED='true'
export QWEN_MANAGED_AGENT_HARNESS_BASE_URL='http://127.0.0.1:4170'
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

bin/qwen-managed-agent-server
```

Der Launcher verwendet das Server-JAR in diesem Archiv. Spring Flyway führt die Vorwärts-Datenbankmigrationen aus, bevor der Service bereit ist. Warten Sie auf:

```bash
curl --fail http://127.0.0.1:8080/actuator/health
```

Diese Basiskonfiguration unterstützt textbasierte Hosted Sessions. Betreiben Sie den Listener auf Loopback, sofern kein signierter oder authentifizierter Ingress konfiguriert ist. Die vollständige Authentifizierungs-, API- und Capability-Konfiguration ist in `docs/server-reference.md` gebündelt.

## Akzeptierten lokalen Prozess-Tool-Pfad aktivieren

Die Tool-Ausführung erfordert das bestehende fail-closed Runtime- und Workspace-Setup. Konfigurieren Sie mindestens:

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_WORKSPACE_ID='reference-workspace'
export QWEN_MANAGED_AGENT_WORKSPACE_CWD='/srv/qwen-workspace'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

Bevor Sie Datei-, Shell- oder untergeordnete Git-Arbeit zulassen, schließen Sie die native Storage-Registrierung und Mount-Identity-Verifizierung ab, wie unter „Verified physical Workspace recovery" in `docs/server-reference.md` beschrieben. Ein nicht registrierter oder mehrdeutiger Mount muss nicht verfügbar bleiben. Öffentliche Shell- und v2-Capability-Anzeige bleiben deaktiviert, bis ihre separate Qualifizierung abgeschlossen ist.

## Upgrade

1. Laden Sie das neue Archiv herunter, überprüfen Sie es und lesen Sie beide Manifeste. Bestätigen Sie die neuen Qwen-Code/Harness-, Java-, Protokoll- und Datenbankanforderungen, bevor Sie das laufende Deployment antasten.
2. Stoppen Sie neuen Ingress. Warten Sie, bis zugelassene Arbeit gemäß dem bestehenden Drain-Verfahren des Deployments abgeschlossen ist.
3. Sichern Sie MySQL, `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`, den Runtime-Credential-Key und die exakte alte Distribution. Rotieren Sie den Credential-Key nicht während des Upgrades.
4. Stoppen Sie den Java-Service und den Hosted Harness. Bewahren Sie den Workspace und den persistenten Runtime-Zustand auf.
5. Installieren Sie die manifestkompatible Qwen-Code/Harness-Version und starten Sie sie mit dem bestehenden Token und Capability-Digest.
6. Starten Sie den neuen `bin/qwen-managed-agent-server` mit denselben Datenbank- und persistenten Einstellungen. Flyway migriert das Schema vorwärts.
7. Fordern Sie eine gesunde Actuator-Antwort an, lesen Sie eine bestehende Session und Historie, und schließen Sie einen neuen No-Tool-Turn ab, bevor Sie den Ingress wieder öffnen. Qualifizieren Sie jede optionale Tool-Capability erneut, bevor Sie sie aktivieren.

Ein Datenbank-Downgrade wird nicht unterstützt. Wenn der Start oder die Validierung vor der Wiederaufnahme des Traffics fehlschlägt, korrigieren Sie die Konfiguration und wiederholen Sie dasselbe Artefakt. Um zu einer Version zurückzukehren, deren Manifest einen älteren Schema-Bereich aufweist, stellen Sie das Pre-Upgrade-Datenbank- und Runtime-Zustands-Backup gemeinsam wieder her, bevor Sie neue Writes akzeptieren; führen Sie niemals einen älteren Server gegen eine migrierte Datenbank aus, nur aufgrund einer Annahme.

## Operator-Recovery

`bin/qwen-managed-agent-operator-recovery` startet den separat verpackten Recovery-Entry-Point. Er ist deaktiviert, sofern nicht die Recovery-spezifische Umgebung gesetzt ist, und startet weder den HTTP-Service noch den Worker. Folgen Sie `docs/hosted-workspace-recovery.md`; leiten Sie niemals physische Stopps ab oder löschen Sie persistente Zeilen, um eine Sicherheitsbarriere zu umgehen.

## Scope-Grenze

Diese Distribution zertifiziert keine mehreren Java-Control-Planes, Cross-Host-Übernahme, öffentliche CSI, Kubernetes-Retirement, öffentliche Shell, v2-Advertisement oder stabilen Produktions-Support. Diese Fähigkeiten erfordern separate Release-Nachweise.