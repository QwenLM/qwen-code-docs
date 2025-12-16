# Automatisierung und Triage-Prozesse

Dieses Dokument bietet einen detaillierten Überblick über die automatisierten Prozesse, die wir zur Verwaltung und zum Triage von Issues und Pull Requests verwenden. Unser Ziel ist es, schnelles Feedback zu geben und sicherzustellen, dass Beiträge effizient überprüft und integriert werden. Das Verständnis dieser Automatisierung hilft Ihnen als Mitwirkender zu wissen, was Sie erwarten können und wie Sie am besten mit unseren Repository-Bots interagieren.

## Leitprinzip: Issues und Pull Requests

Vor allem sollte fast jeder Pull Request (PR) mit einem entsprechenden Issue verknüpft sein. Das Issue beschreibt das „Was“ und das „Warum“ (der Fehler oder das Feature), während der PR das „Wie“ (die Implementierung) darstellt. Diese Trennung hilft uns bei der Nachverfolgung der Arbeit, der Priorisierung von Features und der Aufrechterhaltung eines klaren historischen Kontexts. Unsere Automatisierung basiert auf diesem Prinzip.

---

## Detaillierte Automatisierungs-Workflows

Hier ist eine Aufschlüsselung der spezifischen Automatisierungs-Workflows, die in unserem Repository ausgeführt werden.

### 1. Wenn du ein Issue öffnest: `Automated Issue Triage`

Dies ist der erste Bot, mit dem du interagierst, wenn du ein Issue erstellst. Seine Aufgabe ist es, eine erste Analyse durchzuführen und die richtigen Labels zu setzen.

- **Workflow-Datei**: `.github/workflows/qwen-automated-issue-triage.yml`
- **Wann er ausgeführt wird**: Sofort nachdem ein Issue erstellt oder wieder geöffnet wurde.
- **Was er tut**:
  - Er verwendet ein Qwen-Modell, um den Titel und den Text des Issues anhand eines detaillierten Leitfadens zu analysieren.
  - **Setzt ein `area/*`-Label**: Kategorisiert das Issue in einen funktionalen Bereich des Projekts (z. B. `area/ux`, `area/models`, `area/platform`).
  - **Setzt ein `kind/*`-Label**: Identifiziert die Art des Issues (z. B. `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Setzt ein `priority/*`-Label**: Weist eine Priorität von P0 (kritisch) bis P3 (niedrig) basierend auf der beschriebenen Auswirkung zu.
  - **Kann `status/need-information` hinzufügen**: Falls wichtige Details fehlen (wie Logs oder Schritte zur Reproduktion), wird das Issue als benötigt Informationen markiert.
  - **Kann `status/need-retesting` hinzufügen**: Wenn das Issue sich auf eine CLI-Version bezieht, die mehr als sechs Versionen alt ist, wird es für einen Test auf einer aktuellen Version markiert.
- **Was du tun solltest**:
  - Fülle das Issue-Template so vollständig wie möglich aus. Je mehr Details du angibst, desto genauer wird die Klassifizierung sein.
  - Wenn das Label `status/need-information` hinzugefügt wird, gib bitte die angeforderten Details in einem Kommentar an.

### 2. Wenn du einen Pull Request öffnest: `Continuous Integration (CI)`

Dieser Workflow stellt sicher, dass alle Änderungen unseren Qualitätsstandards entsprechen, bevor sie gemerged werden können.

- **Workflow-Datei**: `.github/workflows/ci.yml`
- **Wann er ausgeführt wird**: Bei jedem Push zu einem Pull Request.
- **Was er tut**:
  - **Lint**: Prüft, ob dein Code den Formatierungs- und Stilregeln unseres Projekts entspricht.
  - **Test**: Führt unsere vollständige Suite automatisierter Tests auf macOS, Windows und Linux sowie mit mehreren Node.js-Versionen aus. Dies ist der zeitaufwändigste Teil des CI-Prozesses.
  - **Post Coverage Comment**: Nachdem alle Tests erfolgreich abgeschlossen wurden, postet ein Bot einen Kommentar zu deinem PR. Dieser Kommentar fasst zusammen, wie gut deine Änderungen durch Tests abgedeckt sind.
- **Was du tun solltest**:
  - Stelle sicher, dass alle CI-Checks erfolgreich sind. Ein grünes Häkchen ✅ wird neben deinem Commit angezeigt, wenn alles erfolgreich war.
  - Falls ein Check fehlschlägt (rotes „X“ ❌), klicke auf den Link „Details“ neben dem fehlgeschlagenen Check, um die Logs einzusehen, das Problem zu identifizieren und eine Korrektur zu pushen.

### 3. Kontinuierliche Priorisierung für Pull Requests: `PR-Auditing und Label-Synchronisation`

Dieser Workflow wird regelmäßig ausgeführt, um sicherzustellen, dass alle offenen PRs korrekt mit Issues verknüpft sind und konsistente Labels aufweisen.

- **Workflow-Datei**: `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Wann er ausgeführt wird**: Alle 15 Minuten auf allen offenen Pull Requests.
- **Was er tut**:
  - **Prüft auf ein verknüpftes Issue**: Der Bot scannt die Beschreibung deines PRs nach einem Schlüsselwort, das es mit einem Issue verknüpft (z. B. `Fixes #123`, `Closes #456`).
  - **Fügt `status/need-issue` hinzu**: Wenn kein verknüpftes Issue gefunden wird, fügt der Bot dem PR das Label `status/need-issue` hinzu. Dies ist ein klares Signal dafür, dass ein Issue erstellt und verknüpft werden muss.
  - **Synchronisiert Labels**: Falls ein Issue verknüpft _ist_, stellt der Bot sicher, dass die Labels des PRs exakt mit den Labels des Issues übereinstimmen. Er fügt fehlende Labels hinzu, entfernt solche, die nicht dazugehören, und entfernt das Label `status/need-issue`, falls es vorhanden war.
- **Was du tun solltest**:
  - **Verknüpfe deinen PR immer mit einem Issue.** Das ist der wichtigste Schritt. Füge eine Zeile wie `Resolves #<issue-number>` in die Beschreibung deines PRs ein.
  - Dadurch wird sichergestellt, dass dein PR korrekt kategorisiert wird und reibungslos durch den Review-Prozess läuft.

### 4. Laufende Priorisierung für Issues: `Geplante Issue-Priorisierung`

Dies ist ein Ausweichworkflow, um sicherzustellen, dass kein Issue vom Priorisierungsprozess übersehen wird.

- **Workflow-Datei**: `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Wann er ausgeführt wird**: Stündlich für alle offenen Issues.
- **Was er tut**:
  - Er sucht aktiv nach Issues, die entweder überhaupt keine Labels haben oder noch das Label `status/need-triage` tragen.
  - Anschließend löst er dieselbe leistungsstarke QwenCode-basierte Analyse wie der ursprüngliche Priorisierungsbot aus, um die korrekten Labels anzuwenden.
- **Was du tun solltest**:
  - Normalerweise musst du nichts tun. Dieser Workflow dient als Sicherheitsnetz, um sicherzustellen, dass jedes Issue letztendlich kategorisiert wird, selbst wenn die erste Priorisierung fehlschlägt.

### 5. Release-Automatisierung

Dieser Workflow übernimmt den Prozess des Packens und Veröffentlichens neuer Versionen von Qwen Code.

- **Workflow-Datei**: `.github/workflows/release.yml`
- **Wann er ausgeführt wird**: Täglich für „Nightly“-Releases und manuell für offizielle Patch-/Minor-Releases.
- **Was er tut**:
  - Erstellt automatisch das Projekt, erhöht die Versionsnummern und veröffentlicht die Pakete auf npm.
  - Erstellt ein entsprechendes Release auf GitHub mit generierten Release Notes.
- **Was du tun solltest**:
  - Als Mitwirkender musst du nichts weiter tun. Du kannst sicher sein, dass deine Änderungen in das nächste Nightly-Release einfließen, sobald dein PR in den `main`-Branch gemerged wurde.

Wir hoffen, diese detaillierte Übersicht ist hilfreich. Falls du Fragen zu unserer Automatisierung oder unseren Prozessen hast, zögere bitte nicht zu fragen!