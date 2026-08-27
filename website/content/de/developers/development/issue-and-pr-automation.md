# Automatisierungs- und Triage-Prozesse

Dieses Dokument bietet eine detaillierte Übersicht über die automatisierten Prozesse, mit denen wir Issues und Pull Requests verwalten und triagieren. Unser Ziel ist es, zeitnahes Feedback zu geben und sicherzustellen, dass Beiträge effizient überprüft und integriert werden. Wenn du diese Automatisierung verstehst, weißt du als Beitragender, was dich erwartet und wie du am besten mit unseren Repository-Bots interagierst.

## Leitprinzip: Issues und Pull Requests

Zuallererst sollte fast jeder Pull Request (PR) mit einem entsprechenden Issue verknüpft sein. Das Issue beschreibt das „Was" und „Warum" (den Fehler oder die Funktion), während der PR das „Wie" (die Implementierung) ist. Diese Trennung hilft uns, die Arbeit nachzuverfolgen, Funktionen zu priorisieren und einen klaren historischen Kontext zu bewahren. Unsere Automatisierung ist um dieses Prinzip herum aufgebaut.

---

## Detaillierte Automatisierungs-Workflows

Hier ist eine Aufschlüsselung der spezifischen Automatisierungs-Workflows, die in unserem Repository ausgeführt werden.

### 1. Wenn du ein Issue erstellst: `Qwen Triage`

Dies ist der erste Bot, mit dem du interagierst, wenn du ein Issue erstellst. Seine Aufgabe ist es, eine erste Analyse durchzuführen und die richtigen Labels zuzuweisen.

- **Workflow-Datei**: `.github/workflows/qwen-triage.yml`
- **Wann er läuft**: Unmittelbar nachdem ein Issue erstellt, bearbeitet oder wiedereröffnet wurde, oder wenn ein Maintainer manuell die Triage anfordert.
- **Was er tut**:
  - Er verwendet ein Qwen-Modell, um den Titel und Text des Issues anhand eines detaillierten Regelwerks zu analysieren.
  - **Weist ein `area/*`-Label zu**: Kategorisiert das Issue in einen funktionalen Bereich des Projekts (z. B. `area/ux`, `area/models`, `area/platform`).
  - **Weist ein `kind/*`-Label zu**: Identifiziert die Art des Issues (z. B. `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Weist ein `priority/*`-Label zu**: Weist basierend auf der beschriebenen Auswirkung eine Priorität von P0 (kritisch) bis P3 (niedrig) zu.
  - **Kann `status/need-information` zuweisen**: Wenn dem Issue wichtige Details (wie Logs oder Reproduktionsschritte) fehlen, wird es mit diesem Label versehen, um weitere Informationen anzufordern.
  - **Kann `status/need-retesting` zuweisen**: Wenn das Issue auf eine CLI-Version verweist, die mehr als sechs Versionen alt ist, wird es mit diesem Label versehen, um ein erneutes Testen mit der aktuellen Version anzufordern.
- **Was du tun solltest**:
  - Fülle die Issue-Vorlage so vollständig wie möglich aus. Je mehr Details du angibst, desto genauer wird die Triage sein.
  - Wenn das Label `status/need-information` hinzugefügt wurde, ergänze die angeforderten Details in einem Kommentar.
  - Maintainer können `@qwen-code /triage` kommentieren, um die Triage erneut auszuführen.

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
  - Wenn eine Prüfung fehlschlägt (ein rotes „X" ❌), klicke auf den „Details"-Link neben der fehlgeschlagenen Prüfung, um die Logs einzusehen, das Problem zu identifizieren und einen Fix zu pushen.

### 3. Release-Automatisierung

Dieser Workflow kümmert sich um das Paketieren und Veröffentlichen neuer Versionen von Qwen Code.

- **Workflow-Datei**: `.github/workflows/release.yml`
- **Wann er läuft**: Täglich für „Nightly"-Releases und manuell für offizielle Patch-/Minor-Releases.
- **Was er tut**:
  - Erstellt automatisch das Projekt, erhöht die Versionsnummern und veröffentlicht die Pakete auf npm.
  - Erstellt ein entsprechendes Release auf GitHub mit generierten Release-Notes.
- **Was du tun solltest**:
  - Als Beitragender musst du für diesen Prozess nichts tun. Du kannst darauf vertrauen, dass deine Änderungen im nächsten Nightly-Release enthalten sind, sobald dein PR in den `main`-Branch gemergt wurde.

Wir hoffen, diese detaillierte Übersicht hilft dir weiter. Wenn du Fragen zu unserer Automatisierung oder unseren Prozessen hast, zögere nicht, sie zu stellen!
