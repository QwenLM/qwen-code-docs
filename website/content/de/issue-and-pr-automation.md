# Automatisierung und Triage-Prozesse

Dieses Dokument bietet einen detaillierten Überblick über die automatisierten Prozesse, die wir zur Verwaltung und zum Triage von Issues und Pull Requests verwenden. Unser Ziel ist es, schnelles Feedback zu geben und sicherzustellen, dass Beiträge effizient überprüft und integriert werden. Das Verständnis dieser Automatisierung hilft Ihnen als Contributor zu wissen, was Sie erwarten können und wie Sie am besten mit unseren Repository-Bots interagieren.

## Leitprinzip: Issues und Pull Requests

Vor allem sollte fast jeder Pull Request (PR) mit einem entsprechenden Issue verknüpft sein. Das Issue beschreibt das "Was" und das "Warum" (der Bug oder das Feature), während der PR das "Wie" (die Implementierung) darstellt. Diese Trennung hilft uns, die Arbeit zu verfolgen, Features zu priorisieren und einen klaren historischen Kontext zu bewahren. Unsere Automatisierung basiert auf diesem Prinzip.

---

## Detaillierte Automatisierungs-Workflows

Hier ist eine Aufschlüsselung der spezifischen Automatisierungs-Workflows, die in unserem Repository ausgeführt werden.

### 1. Wenn du ein Issue öffnest: `Automated Issue Triage`

Dies ist der erste Bot, mit dem du interagierst, wenn du ein Issue erstellst. Seine Aufgabe ist es, eine erste Analyse durchzuführen und die korrekten Labels zu setzen.

- **Workflow File**: `.github/workflows/gemini-automated-issue-triage.yml`
- **Wann er ausgeführt wird**: Sofort nachdem ein Issue erstellt oder wieder geöffnet wurde.
- **Was er tut**:
  - Er verwendet ein Gemini-Modell, um Titel und Beschreibung des Issues anhand eines detaillierten Regelwerks zu analysieren.
  - **Setzt ein `area/*` Label**: Kategorisiert das Issue in einen funktionalen Bereich des Projekts (z. B. `area/ux`, `area/models`, `area/platform`).
  - **Setzt ein `kind/*` Label**: Identifiziert die Art des Issues (z. B. `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Setzt ein `priority/*` Label**: Weist eine Priorität von P0 (kritisch) bis P3 (niedrig) basierend auf dem beschriebenen Impact zu.
  - **Kann `status/need-information` hinzufügen**: Falls wichtige Details fehlen (wie Logs oder Reproduktionsschritte), wird das Issue markiert, um weitere Informationen anzufordern.
  - **Kann `status/need-retesting` hinzufügen**: Wenn das Issue eine CLI-Version erwähnt, die mehr als sechs Versionen alt ist, wird das Issue markiert, um es mit einer aktuellen Version erneut zu testen.
- **Was du tun solltest**:
  - Fülle das Issue-Template so vollständig wie möglich aus. Je mehr Details du lieferst, desto genauer wird das Triage sein.
  - Wenn das Label `status/need-information` hinzugefügt wird, füge bitte die angefragten Details in einem Kommentar hinzu.

### 2. Wenn du einen Pull Request öffnest: `Continuous Integration (CI)`

Dieser Workflow stellt sicher, dass alle Änderungen unseren Qualitätsstandards entsprechen, bevor sie gemerged werden können.

- **Workflow-Datei**: `.github/workflows/ci.yml`
- **Wann er ausgeführt wird**: Bei jedem Push zu einem Pull Request.
- **Was er macht**:
  - **Lint**: Prüft, ob dein Code unseren Formatierungs- und Style-Regeln entspricht.
  - **Test**: Führt unseren vollständigen Satz automatisierter Tests auf macOS, Windows und Linux sowie mit mehreren Node.js-Versionen aus. Dies ist der zeitaufwändigste Teil des CI-Prozesses.
  - **Post Coverage Comment**: Nach erfolgreichem Abschluss aller Tests postet ein Bot einen Kommentar zu deinem PR. Dieser Kommentar fasst zusammen, wie gut deine Änderungen durch Tests abgedeckt sind.
- **Was du tun solltest**:
  - Stelle sicher, dass alle CI-Checks erfolgreich sind. Ein grünes Häkchen ✅ wird neben deinem Commit angezeigt, wenn alles erfolgreich verlaufen ist.
  - Falls ein Check fehlschlägt (rotes "X" ❌), klicke auf den Link "Details" neben dem fehlgeschlagenen Check, um die Logs einzusehen, das Problem zu identifizieren und einen Fix zu pushen.

### 3. Laufende Priorisierung für Pull Requests: `PR Auditing and Label Sync`

Dieser Workflow läuft periodisch, um sicherzustellen, dass alle offenen PRs korrekt mit Issues verknüpft sind und konsistente Labels verwenden.

- **Workflow-Datei**: `.github/workflows/gemini-scheduled-pr-triage.yml`
- **Wann er ausgeführt wird**: Alle 15 Minuten auf allen offenen Pull Requests.
- **Was er tut**:
  - **Prüft auf ein verknüpftes Issue**: Der Bot scannt die Beschreibung deines PRs nach einem Schlüsselwort, das es mit einem Issue verknüpft (z. B. `Fixes #123`, `Closes #456`).
  - **Fügt `status/need-issue` hinzu**: Wenn kein verknüpftes Issue gefunden wird, fügt der Bot deinem PR das Label `status/need-issue` hinzu. Dies ist ein klares Signal, dass ein Issue erstellt und verknüpft werden muss.
  - **Synchronisiert Labels**: Falls ein Issue verknüpft _ist_, stellt der Bot sicher, dass die Labels des PRs exakt mit den Labels des Issues übereinstimmen. Er fügt fehlende Labels hinzu, entfernt unpassende und entfernt auch das `status/need-issue`-Label, falls es vorhanden war.
- **Was du tun solltest**:
  - **Verknüpfe deinen PR immer mit einem Issue.** Das ist der wichtigste Schritt. Füge eine Zeile wie `Resolves #<issue-number>` in die Beschreibung deines PRs ein.
  - Dadurch wird sichergestellt, dass dein PR korrekt kategorisiert wird und reibungslos durch den Review-Prozess läuft.

### 4. Laufende Priorisierung für Issues: `Scheduled Issue Triage`

Dies ist ein Fallback-Workflow, um sicherzustellen, dass kein Issue dem Triage-Prozess entgeht.

- **Workflow File**: `.github/workflows/gemini-scheduled-issue-triage.yml`
- **Wann er ausgeführt wird**: Stündlich für alle offenen Issues.
- **Was er tut**:
  - Er sucht aktiv nach Issues, die entweder überhaupt keine Labels haben oder noch das Label `status/need-triage` tragen.
  - Anschließend wird dieselbe leistungsstarke Gemini-basierte Analyse wie beim initialen Triage-Bot ausgelöst, um die korrekten Labels zu setzen.
- **Was du tun solltest**:
  - Normalerweise musst du nichts tun. Dieser Workflow dient als Sicherheitsnetz, um sicherzustellen, dass jedes Issue letztendlich kategorisiert wird, selbst wenn der initiale Triage fehlschlägt.

### 5. Release Automation

Dieser Workflow übernimmt den Prozess des Packens und Veröffentlichen neuer Versionen von Qwen Code.

- **Workflow-Datei**: `.github/workflows/release.yml`
- **Wann er ausgeführt wird**: Täglich für "nightly" Releases und manuell für offizielle Patch-/Minor-Releases.
- **Was er tut**:
  - Baut das Projekt automatisch, erhöht die Versionsnummern und veröffentlicht die Packages auf npm.
  - Erstellt ein entsprechendes Release auf GitHub mit generierten Release Notes.
- **Was du tun solltest**:
  - Als Contributor musst du nichts weiter tun. Du kannst dich darauf verlassen, dass deine Änderungen in den nächsten nightly Release aufgenommen werden, sobald dein PR in den `main` Branch gemerged wurde.

Wir hoffen, diese detaillierte Übersicht hilft dir weiter. Falls du Fragen zu unserer Automation oder Prozessen hast, zögere bitte nicht zu fragen!