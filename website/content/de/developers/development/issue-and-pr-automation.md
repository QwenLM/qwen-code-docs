# Automatisierungs- und Triage-Prozesse

Dieses Dokument bietet eine detaillierte Übersicht über die automatisierten Prozesse, die wir zur Verwaltung und Priorisierung von Issues und Pull Requests verwenden. Unser Ziel ist es, zeitnahe Rückmeldungen zu geben und sicherzustellen, dass Beiträge effizient geprüft und integriert werden. Ein Verständnis dieser Automatisierung hilft Ihnen als Beitragender dabei, zu wissen, was Sie erwarten können, und wie Sie am besten mit unseren Repository-Bots interagieren.

## Leitprinzip: Issues und Pull Requests

Vor allem sollte nahezu jeder Pull Request (PR) mit einem entsprechenden Issue verknüpft sein. Das Issue beschreibt das „Was“ und das „Warum“ (den Fehler oder das neue Feature), während der PR das „Wie“ (die Implementierung) darstellt. Diese Trennung hilft uns dabei, die Arbeit nachzuverfolgen, Features zu priorisieren und einen klaren historischen Kontext zu bewahren. Unsere Automatisierung basiert auf diesem Prinzip.

---

## Detaillierte Automatisierungs-Workflows

Im Folgenden finden Sie eine Aufschlüsselung der spezifischen Automatisierungs-Workflows, die in unserem Repository ausgeführt werden.

### 1. Wenn Sie ein Issue öffnen: „Automatisierte Issue-Triage“

Dies ist der erste Bot, mit dem Sie interagieren, sobald Sie ein Issue erstellen. Seine Aufgabe besteht darin, eine erste Analyse durchzuführen und die richtigen Labels zuzuweisen.

- **Workflow-Datei**: `.github/workflows/qwen-automated-issue-triage.yml`
- **Wann es ausgeführt wird**: Unmittelbar nachdem ein Issue erstellt oder erneut geöffnet wurde.
- **Was es tut**:
  - Es nutzt ein Qwen-Modell, um Titel und Beschreibung des Issues anhand eines detaillierten Regelwerks zu analysieren.
  - **Weist ein `area/*`-Label zu**: Kategorisiert das Issue einem funktionalen Bereich des Projekts zu (z. B. `area/ux`, `area/models`, `area/platform`).
  - **Weist ein `kind/*`-Label zu**: Identifiziert die Art des Issues (z. B. `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Weist ein `priority/*`-Label zu**: Weist eine Priorität von P0 (kritisch) bis P3 (niedrig) basierend auf der beschriebenen Auswirkung zu.
  - **Kann ggf. `status/need-information` zuweisen**: Falls dem Issue kritische Details fehlen (z. B. Logs oder Schritte zur Reproduktion), wird es als „Information erforderlich“ markiert.
  - **Kann ggf. `status/need-retesting` zuweisen**: Falls im Issue auf eine CLI-Version verwiesen wird, die älter als sechs Versionen ist, wird das Issue zur erneuten Prüfung mit einer aktuellen Version markiert.
- **Was Sie tun sollten**:
  - Füllen Sie die Issue-Vorlage so vollständig wie möglich aus. Je mehr Details Sie bereitstellen, desto genauer wird die Triage sein.
  - Falls das Label `status/need-information` hinzugefügt wird, geben Sie bitte die angeforderten Informationen in einem Kommentar an.

### 2. Wenn Sie einen Pull Request öffnen: „Continuous Integration (CI)“

Dieser Workflow stellt sicher, dass alle Änderungen unsere Qualitätsstandards erfüllen, bevor sie zusammengeführt werden können.

- **Workflow-Datei**: `.github/workflows/ci.yml`
- **Ausführungszeitpunkt**: Bei jedem Push in einen Pull Request.
- **Funktionen**:
  - **Linting**: Überprüft, ob Ihr Code unseren Projekt-Richtlinien für Formatierung und Stil entspricht.
  - **Tests**: Führt unsere vollständige Suite automatisierter Tests unter macOS, Windows und Linux sowie mit mehreren Node.js-Versionen aus. Dies ist der zeitaufwändigste Teil des CI-Prozesses.
  - **Kommentar zur Testabdeckung**: Sobald alle Tests erfolgreich durchgelaufen sind, postet ein Bot einen Kommentar zu Ihrem Pull Request. Darin wird zusammengefasst, wie gut Ihre Änderungen durch Tests abgedeckt sind.
- **Was Sie tun sollten**:
  - Stellen Sie sicher, dass alle CI-Prüfungen bestanden werden. Ein grünes Häkchen ✅ erscheint neben Ihrem Commit, sobald alle Prüfungen erfolgreich abgeschlossen sind.
  - Falls eine Prüfung fehlschlägt (rotes „X“ ❌), klicken Sie auf den Link „Details“ neben der fehlgeschlagenen Prüfung, um die Protokolle einzusehen, das Problem zu identifizieren und eine Korrektur per Push bereitzustellen.

### 3. Fortlaufende Prüfung von Pull Requests: „PR-Prüfung und Label-Synchronisierung“

Dieser Workflow wird regelmäßig ausgeführt, um sicherzustellen, dass alle offenen Pull Requests korrekt mit Issues verknüpft sind und konsistente Labels tragen.

- **Workflow-Datei**: `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Ausführungszeitpunkt**: Alle 15 Minuten für alle offenen Pull Requests.
- **Funktionen**:
  - **Überprüfung auf verknüpftes Issue**: Der Bot durchsucht die Beschreibung Ihres Pull Requests nach einem Schlüsselwort, das ihn mit einem Issue verknüpft (z. B. `Fixes #123`, `Closes #456`).
  - **Hinzufügen des Labels `status/need-issue`**: Falls kein verknüpftes Issue gefunden wird, fügt der Bot das Label `status/need-issue` zu Ihrem Pull Request hinzu. Dies ist ein deutliches Signal dafür, dass ein Issue erstellt und verknüpft werden muss.
  - **Synchronisierung der Labels**: Falls ein Issue _verknüpft_ ist, stellt der Bot sicher, dass die Labels des Pull Requests exakt mit den Labels des Issues übereinstimmen. Er fügt fehlende Labels hinzu, entfernt nicht passende Labels und löscht das Label `status/need-issue`, falls es vorhanden war.
- **Was Sie tun sollten**:
  - **Verknüpfen Sie Ihren Pull Request stets mit einem Issue.** Dies ist der wichtigste Schritt. Fügen Sie Ihrer Pull-Request-Beschreibung eine Zeile wie `Resolves #<Issue-Nummer>` hinzu.
  - Dadurch wird sichergestellt, dass Ihr Pull Request korrekt kategorisiert wird und reibungslos durch den Review-Prozess läuft.

### 4. Fortlaufende Problembearbeitung: „Geplante Problembearbeitung“

Dies ist ein alternativer Workflow, der sicherstellt, dass kein Problem bei der Bearbeitung übersehen wird.

- **Workflow-Datei**: `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Ausführungszeitpunkt**: Stündlich für alle offenen Probleme.
- **Funktion**:
  - Der Workflow sucht aktiv nach Problemen, die entweder gar keine Labels besitzen oder weiterhin das Label `status/need-triage` tragen.
  - Anschließend löst er dieselbe leistungsstarke, auf QwenCode basierende Analyse aus wie der ursprüngliche Bearbeitungsbot, um die korrekten Labels zuzuweisen.
- **Ihre Aufgabe**:
  - In der Regel müssen Sie nichts tun. Dieser Workflow dient als Sicherheitsnetz, um sicherzustellen, dass jedes Problem letztendlich kategorisiert wird – selbst wenn die erste Bearbeitung fehlschlägt.

### 5. Automatisierung der Veröffentlichung

Dieser Workflow verwaltet den Prozess des Paketierens und Veröffentlichen neuer Versionen von Qwen Code.

- **Workflow-Datei**: `.github/workflows/release.yml`
- **Ausführungszeitpunkt**: Nach einem täglichen Zeitplan für „Nightly“-Veröffentlichungen sowie manuell für offizielle Patch- oder Minor-Veröffentlichungen.
- **Funktionen**:
  - Erstellt automatisch das Projekt, erhöht die Versionsnummern und veröffentlicht die Pakete auf npm.
  - Erstellt eine entsprechende GitHub-Veröffentlichung mit generierten Versionshinweisen.
- **Ihre Aufgabe als Contributor**:
  - Als Contributor müssen Sie für diesen Prozess nichts tun. Sobald Ihr Pull Request in den `main`-Branch integriert wurde, können Sie sicher sein, dass Ihre Änderungen in der nächsten Nightly-Veröffentlichung enthalten sein werden.

Wir hoffen, dass dieser detaillierte Überblick hilfreich war. Falls Sie Fragen zu unserer Automatisierung oder unseren Prozessen haben, zögern Sie bitte nicht, diese zu stellen!