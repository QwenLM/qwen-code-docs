# Automatisierungs- und Triage-Prozesse

Dieses Dokument bietet einen detaillierten Überblick über die automatisierten Prozesse, die wir zur Verwaltung und Triage von Issues und Pull Requests verwenden. Unser Ziel ist es, schnelles Feedback zu geben und sicherzustellen, dass Beiträge effizient geprüft und integriert werden. Das Verständnis dieser Automatisierung hilft dir als Contributor, zu wissen, was dich erwartet und wie du am besten mit unseren Repository-Bots interagierst.

## Grundprinzip: Issues und Pull Requests

Zunächst einmal sollte fast jeder Pull Request (PR) mit einem entsprechenden Issue verknüpft sein. Das Issue beschreibt das „Was“ und „Warum“ (der Bug oder das Feature), während der PR das „Wie“ (die Implementierung) darstellt. Diese Trennung hilft uns, den Arbeitsfortschritt zu verfolgen, Features zu priorisieren und einen klaren historischen Kontext zu bewahren. Unsere Automatisierung baut auf diesem Prinzip auf.

---

## Detaillierte Automatisierungs-Workflows

Im Folgenden findest du eine Aufschlüsselung der spezifischen Automatisierungs-Workflows, die in unserem Repository ausgeführt werden.

### 1. Wenn du ein Issue erstellst: `Automated Issue Triage`

Dies ist der erste Bot, mit dem du bei der Erstellung eines Issues interagierst. Seine Aufgabe ist es, eine erste Analyse durchzuführen und die korrekten Labels zuzuweisen.

- **Workflow-Datei**: `.github/workflows/qwen-automated-issue-triage.yml`
- **Ausführungszeitpunkt**: Unmittelbar nach der Erstellung oder Wiedereröffnung eines Issues.
- **Funktionsweise**:
  - Es verwendet ein Qwen-Modell, um Titel und Inhalt des Issues anhand eines detaillierten Regelwerks zu analysieren.
  - **Weist ein `area/*`-Label zu**: Kategorisiert das Issue in einen funktionalen Bereich des Projekts (z. B. `area/ux`, `area/models`, `area/platform`).
  - **Weist ein `kind/*`-Label zu**: Identifiziert die Art des Issues (z. B. `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Weist ein `priority/*`-Label zu**: Ordnet basierend auf der beschriebenen Auswirkung eine Priorität von P0 (kritisch) bis P3 (niedrig) zu.
  - **Kann `status/need-information` zuweisen**: Wenn dem Issue wichtige Details fehlen (z. B. Logs oder Reproduktionsschritte), wird es für weitere Informationen markiert.
  - **Kann `status/need-retesting` zuweisen**: Wenn das Issue auf eine CLI-Version verweist, die mehr als sechs Versionen alt ist, wird es zum erneuten Testen mit einer aktuellen Version markiert.
- **Was du tun solltest**:
  - Fülle die Issue-Vorlage so vollständig wie möglich aus. Je mehr Details du angibst, desto genauer fällt die Triage aus.
  - Wenn das Label `status/need-information` hinzugefügt wird, liefere die angeforderten Details bitte in einem Kommentar.

### 2. Wenn du einen Pull Request erstellst: `Continuous Integration (CI)`

Dieser Workflow stellt sicher, dass alle Änderungen unseren Qualitätsstandards entsprechen, bevor sie gemerged werden können.

- **Workflow-Datei**: `.github/workflows/ci.yml`
- **Ausführungszeitpunkt**: Bei jedem Push in einen Pull Request.
- **Funktionsweise**:
  - **Lint**: Prüft, ob dein Code den Formatierungs- und Stilregeln unseres Projekts entspricht.
  - **Test**: Führt unsere vollständige Suite automatisierter Tests unter macOS, Windows und Linux sowie auf mehreren Node.js-Versionen aus. Dies ist der zeitaufwendigste Teil des CI-Prozesses.
  - **Post Coverage Comment**: Nachdem alle Tests erfolgreich durchgelaufen sind, hinterlässt ein Bot einen Kommentar in deinem PR. Dieser Kommentar fasst zusammen, wie gut deine Änderungen durch Tests abgedeckt sind.
- **Was du tun solltest**:
  - Stelle sicher, dass alle CI-Checks erfolgreich sind. Ein grünes Häkchen ✅ erscheint neben deinem Commit, wenn alles erfolgreich war.
  - Wenn ein Check fehlschlägt (ein rotes „X“ ❌), klicke auf den Link „Details“ neben dem fehlgeschlagenen Check, um die Logs einzusehen, das Problem zu identifizieren und einen Fix zu pushen.

### 3. Laufende Triage für Pull Requests: `PR Auditing and Label Sync`

Dieser Workflow wird regelmäßig ausgeführt, um sicherzustellen, dass alle offenen PRs korrekt mit Issues verknüpft sind und konsistente Labels tragen.

- **Workflow-Datei**: `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Ausführungszeitpunkt**: Alle 15 Minuten für alle offenen Pull Requests.
- **Funktionsweise**:
  - **Prüft auf verknüpftes Issue**: Der Bot durchsucht deine PR-Beschreibung nach einem Schlüsselwort, das es mit einem Issue verknüpft (z. B. `Fixes #123`, `Closes #456`).
  - **Fügt `status/need-issue` hinzu**: Wenn kein verknüpftes Issue gefunden wird, fügt der Bot das Label `status/need-issue` zu deinem PR hinzu. Dies ist ein klares Signal, dass ein Issue erstellt und verknüpft werden muss.
  - **Synchronisiert Labels**: Wenn ein Issue _ist_ verknüpft, stellt der Bot sicher, dass die Labels des PRs exakt mit denen des Issues übereinstimmen. Fehlende Labels werden hinzugefügt, nicht zugehörige entfernt und das Label `status/need-issue` wird gegebenenfalls entfernt.
- **Was du tun solltest**:
  - **Verknüpfe deinen PR immer mit einem Issue.** Dies ist der wichtigste Schritt. Füge eine Zeile wie `Resolves #<issue-number>` zu deiner PR-Beschreibung hinzu.
  - Dadurch wird sichergestellt, dass dein PR korrekt kategorisiert wird und reibungslos durch den Review-Prozess läuft.

### 4. Laufende Triage für Issues: `Scheduled Issue Triage`

Dies ist ein Fallback-Workflow, um sicherzustellen, dass kein Issue im Triage-Prozess übersehen wird.

- **Workflow-Datei**: `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Ausführungszeitpunkt**: Stündlich für alle offenen Issues.
- **Funktionsweise**:
  - Es sucht aktiv nach Issues, die entweder gar keine Labels oder noch das Label `status/need-triage` tragen.
  - Anschließend löst es dieselbe leistungsstarke, auf Qwen Code basierende Analyse aus wie der initiale Triage-Bot, um die korrekten Labels zuzuweisen.
- **Was du tun solltest**:
  - Normalerweise musst du nichts tun. Dieser Workflow dient als Sicherheitsnetz, um sicherzustellen, dass jedes Issue letztendlich kategorisiert wird, selbst wenn die initiale Triage fehlschlägt.

### 5. Release-Automatisierung

Dieser Workflow übernimmt das Verpacken und Veröffentlichen neuer Versionen von Qwen Code.

- **Workflow-Datei**: `.github/workflows/release.yml`
- **Ausführungszeitpunkt**: Täglich nach Zeitplan für „Nightly“-Releases und manuell für offizielle Patch-/Minor-Releases.
- **Funktionsweise**:
  - Baut das Projekt automatisch, erhöht die Versionsnummern und veröffentlicht die Pakete auf npm.
  - Erstellt ein entsprechendes Release auf GitHub mit generierten Release Notes.
- **Was du tun solltest**:
  - Als Contributor musst du für diesen Prozess nichts tun. Du kannst dir sicher sein, dass deine Änderungen im nächsten Nightly-Release enthalten sind, sobald dein PR in den `main`-Branch gemerged wurde.

Wir hoffen, dieser detaillierte Überblick ist hilfreich. Wenn du Fragen zu unserer Automatisierung oder den Prozessen hast, zögere bitte nicht, sie zu stellen!