# Managed Sessions lokal ausführen


Managed local verwendet eine persistente eingebettete H2-Datenbank. Bei installiertem lokalem Java 21
lädt der erste Managed-Start automatisch das passende Java-Server-JAR herunter.
Er verwendet die Node-Executable, die Qwen ausführt,
sowie das Hosted Harness, den nativen Worker-Entry und die produktive WebShell. Benutzer müssen
MySQL, Docker, Maven oder systemd nicht installieren. Eine optionale vorinstallierte gebündelte Runtime enthält
Java; der Standard-Download und die Lightweight-Edition erfordern lokales Java 21.

Dieser Modus ist experimentell. Die Implementierung unterstützt nativ macOS und Linux
auf arm64 und x64. Plattform-Akzeptanzergebnisse werden separat aufgezeichnet; die Bereitstellung
eines Packaging-Targets bedeutet nicht, dass diese Plattform die E2E-Validierung bestanden hat.
Managed-Runtime-Archive werden explizit wie unten beschrieben gebaut; gewöhnliche CLI-Pakete
enthalten nicht die Java-Nutzlast. Ein optionales vollständiges Managed-Standalone-Archiv
bündelt alle Komponenten.

## Starten und Stoppen

Verwenden Sie eine Qwen-Version, die Managed-local-Unterstützung enthält. Ältere Releases benötigen ein
CLI-Upgrade; die Installation der Runtime allein kann den Launcher nicht hinzufügen. Installieren Sie Java 21
und setzen Sie `JAVA_HOME` auf dessen Home-Verzeichnis, oder legen Sie dessen Executable auf PATH, dann führen Sie aus:

```sh
qwen serve --managed --open
```

Vor dem Anlegen von Anwendungsdaten oder dem Starten von Diensten prüft Qwen Java 21 und
lädt `qwen-managed-agent-server-<cli-version>.jar` samt Checksumme vom
offiziellen Aliyun-OSS-Release-Mirror herunter, mit dem gleichen GitHub Release als Fallback.
Es verifiziert die Checksumme und installiert atomar eine vollständige Runtime unter
`<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/`. Spätere Starts
verwenden diesen Cache ohne Netzwerkzugriff. Gewöhnliche Qwen-Befehle laden ihn nicht herunter.
Nur das Service-JAR wird heruntergeladen; Qwen installiert kein Java und führt kein Maven aus.
Wenn das passende Release nicht verfügbar ist oder ein Download fehlschlägt, werden keine Anwendungsdaten
oder Service-Child-Prozesse erstellt. Versuchen Sie es später erneut oder installieren Sie vorab eine passende Runtime.

Für Offline-Nutzung oder gebündeltes Java beziehen Sie eine passende
`qwen-code-managed-runtime-<platform>-<arch>.tar.gz` und deren `.sha256`-Datei von
Ihrem Distributions-Builder. Verifizieren und entpacken Sie sie vor dem Start:

```sh
shasum -a 256 -c qwen-code-managed-runtime-darwin-arm64.tar.gz.sha256
mkdir -p "${QWEN_HOME:-$HOME/.qwen}"
tar -xzf qwen-code-managed-runtime-darwin-arm64.tar.gz -C "${QWEN_HOME:-$HOME/.qwen}"
qwen serve --managed --open
```

Das Archiv wird installiert unter
`<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/`. Qwen erkennt
das Verzeichnis für seine exakte Version und Plattform automatisch. Die Runtime
enthält keine weitere Node-, CLI-, Harness-, Worker- oder WebShell-Installation.

Für eine kleinere Offline-Nutzlast wählen Sie `qwen-code-managed-runtime-lite-<platform>-<arch>.tar.gz`
und verifizieren/entpacken Sie es auf die gleiche Weise. Es enthält nur das Server-JAR und
das Manifest. Installieren Sie eine Edition in einem frischen Version/Target-Verzeichnis; überlagern Sie nicht
Lightweight- und gebündelte Archive. Der Lightweight-Launcher verwendet
`JAVA_HOME/bin/java`, wenn JAVA_HOME nicht leer ist, andernfalls das erste ausführbare
`java` auf PATH. Er benötigt speziell Java 21 und prüft die Executable
vor dem Anlegen des Anwendungszustands. Ein falsches JAVA_HOME ist ein Fehler, selbst wenn
PATH ein anderes funktionierendes Java enthält. Zum Beispiel:

```sh
JAVA_HOME=/absolute/java-21-home qwen serve --managed --open
```

Unter macOS endet JAVA_HOME typischerweise auf `Contents/Home`. Fehlendes oder inkompatibles
Java erzeugt einen Installations-/Konfigurationsfehler vor dem Herunterladen des JAR; Qwen lädt kein Java herunter.
Die gebündelte Edition verwendet immer ihr eigenes Java und fällt nicht auf das
Java des Rechners zurück, wenn ihre Nutzlast beschädigt ist.

Das optionale vollständige `qwen-code-managed-local-<platform>-<arch>.tar.gz` funktioniert
ebenfalls: entpacken Sie es und führen Sie `./qwen-code/bin/qwen serve --managed --open` aus.

Die Anwendung bindet an `127.0.0.1:4170`. Verwenden Sie `--port 0` für einen verfügbaren
Port, oder wählen Sie einen festen Port. Halten Sie das Terminal offen; Strg+C fährt den
gewöhnlichen Daemon, den Java-Service und das Harness herunter. systemd ist optional für operator-verwaltete
Deployments und wird von diesem Befehl nicht verwendet.
Ein belegter öffentlicher Port folgt der begrenzten Nearby-Port-Retry-Logik des gewöhnlichen Daemons;
verwenden Sie die vom Launcher ausgegebene Browser-Adresse.

Dieser eine Befehl startet sowohl den gewöhnlichen Daemon als auch den Managed Agent. Dieselbe
WebShell listet gewöhnliche und Managed-Workspaces und -Sessions gemeinsam unter Projects auf, mit einem Managed-Label auf Managed-Workspaces und ohne Ausführungsmodus-Tabs. Neue Tasks folgen dem ausgewählten Workspace oder der Konversation. Lokale Sessions verwenden
das Verzeichnis, in dem Sie den Befehl ausgeführt haben, während Managed-Sessions ihre
anwendungsseitig erstellten Workspaces oder explizit importierte lokale Projekte verwenden. Beide verwenden
dieselbe authentifizierte Browser-Origin;
Sie benötigen keinen zweiten Daemon-Befehl oder eine zweite Browser-Seite.

Wählen Sie in **Add workspace** vor dem Absenden **Local (daemon)** oder **Managed (Managed Agent)**.
Die Auswahl standardisiert auf den Service der aktuellen Konversation.
Workspace-Zeilen und **New task** zeigen diesen Service, und neue Tasks erben den
ausgewählten Workspace. Die bestehende SSH-Workspace-Unterstützung des Daemons bleibt
verfügbar; die Managed-SSH-Registrierung ist nicht in diesen gemeinsamen Dialog integriert.

Das Terminal gibt eine Browser-URL mit einem Token-Fragment aus. Behandeln Sie es wie ein lokales
Passwort. Der Browser verwendet das Token zur Authentifizierung jeder API-Anfrage; Java-Signierschlüssel
und interne Credentials gelangen nie in den Browser. Der Listener ist
nur auf Loopback beschränkt. Für einen Headless-Rechner lassen Sie `--open` weg und öffnen die ausgegebene URL
auf diesem Rechner, oder verwenden Sie einen von Ihnen verwalteten authentifizierten Tunnel.

Die vereinheitlichte Anwendung unterstützt derzeit die lokale Loopback-Seite. Der bestehende
Mobile Access / Local Control-Eintrag der vollständigen Shell ist nicht in den
Managed-Boot integriert: ein gekoppelter LAN-Listener kann diese vereinheitlichte Seite nicht öffnen. Mobile-Freigabe
benötigt eine separate Integration; der gewöhnliche Daemon behält sein bestehendes
Local-Control-Verhalten.

Das Harness verwendet die normale Qwen-Modellkonfiguration und Provider-Credentials.
Konfigurieren Sie ein Modell über das übliche Qwen-CLI-Setup vor dem Absenden Ihres ersten
Prompts. Files und Shell verwenden den `default`-Genehmigungsmodus; die Managed-UI fragt
vor einer Aktion, die eine Genehmigung erfordert, nach dieser.

Nach einem Neustart kann das Fortsetzen einer bestehenden Session warten, bis deren vorheriger SQL-Writer-Lease
abgelaufen ist (standardmäßig 60 Sekunden). Behalten Sie das ursprüngliche Datenverzeichnis
und versuchen Sie es nach diesem Intervall erneut; das Neustarten von Prozessen bereinigt keine Eigentümerschaft.

## Workspaces und persistente Daten

Das standardmäßige private Datenverzeichnis ist `<Qwen home>/managed-local`, normalerweise
`~/.qwen/managed-local`. Überschreiben Sie es mit:

```sh
qwen serve --managed --managed-data-dir /absolute/private/data --open
```

Das Verzeichnis muss außerhalb jedes Git-Worktree liegen. Ein Launcher darf es jeweils
gleichzeitig verwenden; Java hält zudem einen exklusiven Datenbank-Datei-Lock. Private Service-Ports
und Credentials bleiben über Neustarts stabil. Ein privater Port, der von
einer anderen Anwendung belegt ist, verursacht einen Startfehler; wählen Sie ein anderes frisches Datenverzeichnis
oder stoppen Sie den konfliktverursachenden Service, statt persistierte Fakten zu bearbeiten.

Der Start erstellt einen anwendungseigenen Standard-Workspace und dessen OWNER-Grant
über die bestehende idempotente Workspace-API. Um ein bestehendes lokales Projekt zu verwenden,
öffnen Sie **Workspace → Choose existing directory**, durchsuchen oder geben Sie dessen absoluten
Pfad ein, und fügen Sie dann den Ordner hinzu. Der Service registriert dessen Elternverzeichnis und gewährt automatisch OWNER-Zugriff,
wobei bestehende Dateien erhalten bleiben. Neue Tasks starten im
ausgewählten Projekt. Sie können auch einen leeren Workspace erstellen.

Das Startverzeichnis bleibt für lokale Sessions verfügbar und wird nicht automatisch importiert.
`--workspace` bleibt im Managed-local-Modus nicht unterstützt; wählen Sie
das Projekt in der UI. Der `.qwen-managed-storage.json`-Wartungsmarker wird
außerhalb von Git-Worktrees gehalten; bearbeiten, löschen, stashen oder committen Sie ihn nicht. Importierte
Projektdateien bleiben außerhalb des privaten Managed-Datenverzeichnisses und benötigen
ein eigenes Backup.

Die lokale Session-History verwendet weiterhin den gewöhnlichen Qwen-Speicher. Sie ist getrennt
vom Managed-Datenverzeichnis und ist in einem rein Managed-Backup nicht enthalten.

Bewahren Sie das vollständige Datenverzeichnis zusammen auf, einschließlich `state.json`,
`database/`, `runtime/`, `worker-home/` und `workspaces/`. Setzeln oder stornieren Sie
aktive Arbeit, schließen Sie deren Sessions, und stoppen Sie dann die Anwendung vor einem
Dateisystem-Backup. Langlebige Original-Worker können einen Control-Plane-Exit überdauern;
bestätigen Sie, dass alle Workspace-Writer gestoppt haben. Ein unbekannter Ausführungszustand benötigt
die bestehende Original-Owner-Recovery-Prozedur vor einem Offline-Backup.
Credentials, Datenbank, Worker-History und Workspace-Identität gehören zur gleichen
Installation. Das Wiederherstellen nur einer Teilmenge
kann die Recovery-Admission verschließen. Der Start erstellt keinen fehlenden Marker neu oder
ersetzt beschädigte Credentials. Service-Diagnosen befinden sich in `logs/`.

macOS unterstützt native Worker und Same-Boot-Durable-Adoption. Trusted-Whole-Host-Reboot-Recovery
bleibt im lokalen Launcher deaktiviert. Unbekannte Tool-Outcomes
behalten die bestehenden Original-Owner-Recovery-Regeln und werden nie blind replayed.
Dieser Modus fügt keinen automatischen Login-Time-Start hinzu und verhindert keinen Laptop-Schlaf.

## Eine Distribution bauen

Diese Befehle sind für Release-Builder, nicht für Endbenutzer. Bauen Sie die CLI und den Java-Server
aus dem gleichen Checkout mit Node 22+, Java 21 und Maven 3.8.9+:

```sh
corepack pnpm install --frozen-lockfile
npm run build
npm run typecheck
npm run bundle
npm run prepare:package
mvn -f packages/sdk-java/qwencode/pom.xml -DskipTests -Dgpg.skip=true install
mvn -f packages/managed-agent-server/pom.xml verify
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --jre-home /verified/java-21-home \
  --out-dir /output/managed-runtime
```

Der Runtime-Builder benötigt nur das passende Server-JAR, die Java-Runtime und die CLI-Version
aus diesem Checkout. Er benötigt keine gebauten CLI-Assets oder ein Node-Archiv. Standardmäßig schreibt er nach
`packages/managed-agent-server/target/managed-runtime`, außerhalb der CLI-
`dist/`-Assets. Er gibt das Runtime-Archiv und eine `.sha256`-Datei pro Archiv aus. Die
normale CLI wird separat gebaut/veröffentlicht.

Bauen Sie die Lightweight-Runtime mit dem gleichen Server-JAR und `--without-jre`
statt `--jre-home`:

```sh
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --without-jre \
  --out-dir /output/managed-runtime
```

Dies gibt `qwen-code-managed-runtime-lite-darwin-arm64.tar.gz` und dessen Checksumme aus.
Der Lightweight-Builder benötigt keine Java-Eingabe. Für eine optionale vollständige Distribution:

```sh
npm run package:standalone -- \
  --target darwin-arm64 \
  --node-archive /verified/node-v22-darwin-arm64.tar.gz \
  --managed-server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --managed-jre-home /verified/java-21-home \
  --out-dir /output/managed-local
```

Verwenden Sie das vollständige extrahierte Runtime-Home, das `bin/java`, `lib/modules`,
`release` und `legal/` enthält. Ein macOS-JRE kann dies unter `Contents/Home` ablegen.
Der Builder prüft Java-Major-Version, Betriebssystem und Architektur, schließt dessen
Lizenzen ein und zeichnet das Server-SHA-256 und die passende CLI-Version im
Payload-Manifest auf. Das vollständige Standalone verwendet `lib/managed-runtime/` und
gibt `SHA256SUMS` aus. Verifizieren Sie Publisher-Checksummen der Runtime-Inputs vor dem Bauen.
Windows- und Bun-Managed-Ausführung wird abgelehnt; der Launcher benötigt Node 22+.

Für einen expliziten Runtime-Speicherort weist
`QWEN_MANAGED_LOCAL_RUNTIME_DIR=/absolute/managed-runtime` die lokale CLI direkt
auf ein Verzeichnis, das `manifest.json` und `server.jar` enthält
(sowie `jre/` für die gebündelte Edition).
Es hat Vorrang vor dem colocalisierten Payload und der versionierten Qwen-Home-Installation.
Ein bestehender colocalisierter Payload hat Vorrang vor der Qwen-Home-Installation.
Ein ausgewählter ungültiger oder unvollständiger Payload wird nie durch einen anderen ersetzt.
Ein fehlender explizit ausgewählter Payload, eine falsche CLI-Version, ein falsches Target,
eine falsche Java-Major-Version oder eine falsche Server-Checksumme schlägt vor dem Start der Child-Prozesse fehl. Nur ein fehlender
Standard-Cache löst die JAR-Installation aus; bestehende beschädigte Payloads werden nicht ersetzt.
Maven wird während des Anwendungsstarts niemals ausgeführt.

## Das Erstnutzungs-JAR veröffentlichen

Der `Release Managed server runtime`-Workflow baut aus einem bereits veröffentlichten
CLI-Release-Tag unter Verwendung des SDK und Servers aus genau dieser Quellrevision. Ein
manueller Lauf muss von `main` aus dispatched werden und ist standardmäßig ein Dry-Run. Er verifiziert
die CLI und das Java-Modul, baut das `central-release`-Profil und behält das
JAR und die Checksumme als Workflow-Artefakte, ohne öffentliche Repositories zu verändern.

Nach der Verifizierung des Dry-Runs können Release-Operatoren den gleichen Tag mit
`dry_run=false` über die geschützte `production-release`-Umgebung ausführen. Der
Workflow setzt die Server-Artefaktversion auf die CLI-Version, veröffentlicht
`com.alibaba:qwen-managed-agent-server:<cli-version>` auf Maven Central mit
Sources, Javadoc und Signaturen, und verteilt das gleiche primäre JAR samt seiner
`.sha256` über dieses GitHub Release und den bestehenden versionierten OSS-Mirror.
Auxiliary-Operator-JARs werden nicht an die Central-Veröffentlichung angehängt. Bestehende
Assets werden Byte für Byte verglichen und nie durch unterschiedliche Inhalte ersetzt.
Veröffentlichte CLI-Release-Events führen diesen Workflow ebenfalls automatisch aus.

Die CLI lädt von OSS/GitHub herunter, nicht von Maven Central. Sie löst das
SDK nicht als separate Benutzerabhängigkeit auf: das ausführbare Server-JAR enthält seine Java-Abhängigkeiten.
Runtime-Assets müssen für das exakte CLI-Release existieren, bevor der
Erstnutzungs-Download erfolgreich ist. Die lokale Validierung dieses PRs veröffentlicht diese
Assets nicht oder umgeht die Produktions-Release-Umgebung nicht.

Siehe das zweisprachige [Design](../design/2026-10-20-managed-local-serve.md) für
Ownership-Grenzen und Validierungskriterien, und die
[Java-Server-Referenz](../../packages/managed-agent-server/README.md) für
Operator-orientierte MySQL-Deployments.