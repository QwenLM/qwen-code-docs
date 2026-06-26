# Automatisierungs- und Triage-Prozesse

Dieses Dokument bietet eine detaillierte Übersicht über die automatisierten Prozesse, mit denen wir Issues und Pull Requests verwalten und triagieren. Unser Ziel ist es, zeitnahes Feedback zu geben und sicherzustellen, dass Beiträge effizient überprüft und integriert werden. Wenn du diese Automatisierung verstehst, weißt du als Beitragender, was dich erwartet und wie du am besten mit unseren Repository-Bots interagierst.

## Leitprinzip: Issues und Pull Requests

Zuallererst sollte fast jeder Pull Request (PR) mit einem entsprechenden Issue verknüpft sein. Das Issue beschreibt das „Was“ und „Warum“ (den Fehler oder die Funktion), während der PR das „Wie“ (die Implementierung) ist. Diese Trennung hilft uns, die Arbeit nachzuverfolgen, Funktionen zu priorisieren und einen klaren historischen Kontext zu bewahren. Unsere Automatisierung ist um dieses Prinzip herum aufgebaut.

---

## Detaillierte Automatisierungs-Workflows

Hier ist eine Aufschlüsselung der spezifischen Automatisierungs-Workflows, die in unserem Repository ausgeführt werden.

### 1. Wenn du ein Issue erstellst: `Automatisierte Issue-Triage`

Dies ist der erste Bot, mit dem du interagierst, wenn du ein Issue erstellst. Seine Aufgabe ist es, eine erste Analyse durchzuführen und die richtigen Labels zuzuweisen.

- **Workflow-Datei**: `.github/workflows/qwen-automated-issue-triage.yml`
- **Wann er läuft**: Unmittelbar nachdem ein Issue erstellt oder wiedereröffnet wurde.
- **Was er tut**:
  - Er verwendet ein Qwen-Modell, um den Titel und Text des Issues anhand eines detaillierten Regelwerks zu analysieren.
  - **Weist ein `area/*`-Label zu**: Kategorisiert das Issue in einen funktionalen Bereich des Projekts (z. B. `area/ux`, `area/models`, `area/platform`).
  - **Weist ein `kind/*`-Label zu**: Identifiziert die Art des Issues (z. B. `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Weist ein `priority/*`-Label zu**: Weist basierend auf der beschriebenen Auswirkung eine Priorität von P0 (kritisch) bis P3 (niedrig) zu.
  - **Kann `status/need-information` zuweisen**: Wenn dem Issue wichtige Details (wie Logs oder Reproduktionsschritte) fehlen, wird es mit diesem Label versehen, um weitere Informationen anzufordern.
  - **Kann `status/need-retesting` zuweisen**: Wenn das Issue auf eine CLI-Version verweist, die mehr als sechs Versionen alt ist, wird es mit diesem Label versehen, um ein erneutes Testen mit der aktuellen Version anzufordern.
- **Was du tun solltest**:
  - Fülle die Issue-Vorlage so vollständig wie möglich aus. Je mehr Details du angibst, desto genauer wird die Triage sein.
  - Wenn das Label `status/need-information` hinzugefügt wurde, ergänze die angeforderten Details in einem Kommentar.

### 2. Wenn du einen Pull Request erstellst: `Continuous Integration (CI)`

Dieser Workflow stellt sicher, dass alle Änderungen unsere Qualitätsstandards erfüllen, bevor sie gemergt werden können.

- **Workflow-Datei**: `.github/workflows/ci.yml`
- **Wann er läuft**: Bei jedem Push zu einem Pull Request.
- **Was er tut**:
  - **Lint**: Überprüft, ob dein Code den Formatierungs- und Stilregeln unseres Projekts entspricht.
  - **Test**: Führt unsere gesamte Suite automatisierter Tests auf macOS, Windows und Linux sowie mit mehreren Node.js-Versionen aus. Dies ist der zeitaufwändigste Teil des CI-Prozesses.
  - **Post Coverage Comment**: Nachdem alle Tests erfolgreich bestanden wurden, postet ein Bot einen Kommentar zu deinem PR. Dieser Kommentar enthält eine Zusammenfassung, wie gut deine Änderungen durch Tests abgedeckt sind.
- **Was du tun solltest**:
  - Stelle sicher, dass alle CI-Prüfungen bestanden werden. Ein grüner Haken ✅ erscheint neben deinem Commit, wenn alles erfolgreich ist.
  - Wenn eine Prüfung fehlschlägt (ein rotes „X“ ❌), klicke auf den „Details“-Link neben der fehlgeschlagenen Prüfung, um die Logs einzusehen, das Problem zu identifizieren und einen Fix zu pushen.

### 3. Laufende Triage für Pull Requests: `PR-Überprüfung und Label-Synchronisierung`

Dieser Workflow läuft regelmäßig, um sicherzustellen, dass alle offenen PRs korrekt mit Issues verknüpft sind und konsistente Labels haben.

- **Workflow-Datei**: `.github/workflows/qwen-scheduled-pr-triage.yml`
- **Wann er läuft**: Alle 15 Minuten für alle offenen Pull Requests.
- **Was er tut**:
  - **Überprüft auf ein verknüpftes Issue**: Der Bot scannt deine PR-Beschreibung nach einem Schlüsselwort, das ihn mit einem Issue verknüpft (z. B. `Fixes #123`, `Closes #456`).
  - **Fügt `status/need-issue` hinzu**: Wenn kein verknüpftes Issue gefunden wird, fügt der Bot das Label `status/need-issue` zu deinem PR hinzu. Dies ist ein klares Signal, dass ein Issue erstellt und verknüpft werden muss.
  - **Synchronisiert Labels**: Wenn ein Issue *verknüpft* ist, stellt der Bot sicher, dass die Labels des PR genau mit den Labels des Issues übereinstimmen. Er fügt fehlende Labels hinzu, entfernt nicht passende und entfernt das Label `status/need-issue`, falls es vorhanden war.
- **Was du tun solltest**:
  - **Verknüpfe deinen PR immer mit einem Issue.** Dies ist der wichtigste Schritt. Füge eine Zeile wie `Resolves #<Issue-Nummer>` in deine PR-Beschreibung ein.
  - Dadurch wird sichergestellt, dass dein PR korrekt kategorisiert wird und reibungslos durch den Überprüfungsprozess läuft.

### 4. Laufende Triage für Issues: `Geplante Issue-Triage`

Dies ist ein Fallback-Workflow, um sicherzustellen, dass kein Issue vom Triage-Prozess übersehen wird.

- **Workflow-Datei**: `.github/workflows/qwen-scheduled-issue-triage.yml`
- **Wann er läuft**: Jede Stunde für alle offenen Issues.
- **Was er tut**:
  - Er sucht aktiv nach Issues, die entweder gar keine Labels haben oder noch das Label `status/need-triage` tragen.
  - Anschließend löst er dieselbe leistungsstarke QwenCode-basierte Analyse wie der initiale Triage-Bot aus, um die richtigen Labels zuzuweisen.
- **Was du tun solltest**:
  - Normalerweise musst du nichts tun. Dieser Workflow ist ein Sicherheitsnetz, das sicherstellt, dass jedes Issue irgendwann kategorisiert wird, selbst wenn die initiale Triage fehlschlägt.

### 5. Release-Automatisierung

Dieser Workflow kümmert sich um das Paketieren und Veröffentlichen neuer Versionen von Qwen Code.

- **Workflow-Datei**: `.github/workflows/release.yml`
- **Wann er läuft**: Täglich für „Nightly“-Releases und manuell für offizielle Patch-/Minor-Releases.
- **Was er tut**:
  - Erstellt automatisch das Projekt, erhöht die Versionsnummern und veröffentlicht die Pakete auf npm.
  - Erstellt ein entsprechendes Release auf GitHub mit generierten Release-Notes.
- **Was du tun solltest**:
  - Als Beitragender musst du für diesen Prozess nichts tun. Du kannst darauf vertrauen, dass deine Änderungen im nächsten Nightly-Release enthalten sind, sobald dein PR in den `main`-Branch gemergt wurde.

Wir hoffen, diese detaillierte Übersicht hilft dir weiter. Wenn du Fragen zu unserer Automatisierung oder unseren Prozessen hast, zögere nicht, sie zu stellen!