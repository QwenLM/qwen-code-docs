# CLI Commands

Qwen Code unterstützt mehrere integrierte Befehle, die dir helfen, deine Sitzung zu verwalten, die Oberfläche anzupassen und das Verhalten zu steuern. Diese Befehle beginnen mit einem Schrägstrich (`/`), einem @-Symbol (`@`) oder einem Ausrufezeichen (`!`).

## Slash-Befehle (`/`)

Slash-Befehle bieten Meta-Ebene-Kontrolle über die CLI selbst.

### Integrierte Befehle

- **`/bug`**
  - **Beschreibung:** Erstelle ein Issue zu Qwen Code. Standardmäßig wird das Issue im GitHub-Repository für Qwen Code erstellt. Der Text, den du nach `/bug` eingibst, wird zum Titel des erstellten Bugs. Das Standardverhalten von `/bug` kann über die Einstellung `advanced.bugCommand` in deiner `.qwen/settings.json` angepasst werden.

- **`/chat`**
  - **Beschreibung:** Speichere und setze den Gesprächsverlauf interaktiv fort, um verschiedene Gesprächszweige zu verwalten, oder setze einen früheren Zustand in einer späteren Sitzung fort.
  - **Unterbefehle:**
    - **`save`**
      - **Beschreibung:** Speichert den aktuellen Gesprächsverlauf. Du musst ein `<tag>` hinzufügen, um den Zustand des Gesprächs zu identifizieren.
      - **Verwendung:** `/chat save <tag>`
      - **Details zum Speicherort der Checkpoints:** Die Standardverzeichnisse für gespeicherte Chat-Checkpoints sind:
        - Linux/macOS: `~/.qwen/tmp/<project_hash>/`
        - Windows: `C:\Users\<DeinBenutzername>\.qwen\tmp\<project_hash>\`
        - Wenn du `/chat list` ausführst, scannt die CLI nur diese Verzeichnisse nach verfügbaren Checkpoints.
        - **Hinweis:** Diese Checkpoints dienen dem manuellen Speichern und Fortsetzen von Gesprächszuständen. Informationen zu automatisch erstellten Checkpoints vor Dateiänderungen findest du in der [Checkpointing-Dokumentation](../checkpointing.md).
    - **`resume`**
      - **Beschreibung:** Setzt ein Gespräch von einem früheren Speicherstand fort.
      - **Verwendung:** `/chat resume <tag>`
    - **`list`**
      - **Beschreibung:** Listet verfügbare Tags für das Fortsetzen von Gesprächszuständen auf.
    - **`delete`**
      - **Beschreibung:** Löscht einen gespeicherten Gesprächs-Checkpoint.
      - **Verwendung:** `/chat delete <tag>`
    - **`share`**
      - **Beschreibung:** Schreibt das aktuelle Gespräch in eine angegebene Markdown- oder JSON-Datei.
      - **Verwendung:** `/chat share file.md` oder `/chat share file.json`. Wenn kein Dateiname angegeben wird, generiert die CLI einen.

- **`/clear`**
  - **Beschreibung:** Löscht den Terminalbildschirm, einschließlich des sichtbaren Sitzungsverlaufs und des Scrollbacks innerhalb der CLI. Je nach Implementierung können die zugrunde liegenden Sitzungsdaten (für den Verlauf) erhalten bleiben, aber die Anzeige wird geleert.
  - **Tastenkürzel:** Drücke jederzeit **Strg+L**, um den Bildschirm zu leeren.

- **`/summary`**
  - **Beschreibung:** Generiert eine umfassende Projektzusammenfassung aus dem aktuellen Gesprächsverlauf und speichert sie in `.qwen/PROJECT_SUMMARY.md`. Diese Zusammenfassung enthält das Gesamtziel, wichtige Erkenntnisse, kürzliche Aktionen und den aktuellen Plan – ideal, um später weiterzuarbeiten.
  - **Verwendung:** `/summary`
  - **Funktionen:**
    - Analysiert den gesamten Gesprächsverlauf, um wichtigen Kontext zu extrahieren
    - Erstellt eine strukturierte Markdown-Zusammenfassung mit Abschnitten zu Zielen, Wissen, Aktionen und Plänen
    - Speichert automatisch in `.qwen/PROJECT_SUMMARY.md` im Projektstammverzeichnis
    - Zeigt Fortschrittsanzeige während der Generierung und Speicherung
    - Integriert sich mit der „Welcome Back“-Funktion für nahtloses Fortsetzen von Sitzungen
  - **Hinweis:** Dieser Befehl erfordert ein aktives Gespräch mit mindestens 2 Nachrichten, um eine sinnvolle Zusammenfassung zu erstellen.

- **`/compress`**
  - **Beschreibung:** Ersetzt den gesamten Chat-Kontext durch eine Zusammenfassung. Dadurch werden Tokens für zukünftige Aufgaben gespart, während eine grobe Übersicht über den bisherigen Verlauf erhalten bleibt.

- **`/copy`**
  - **Beschreibung:** Kopiert die letzte Ausgabe von Qwen Code in die Zwischenablage, um sie einfach zu teilen oder weiterzuverwenden.

- **`/directory`** (oder **`/dir`**)
  - **Beschreibung:** Verwalte Workspace-Verzeichnisse für Multi-Directory-Unterstützung.
  - **Unterbefehle:**
    - **`add`**:
      - **Beschreibung:** Fügt ein Verzeichnis zum Workspace hinzu. Der Pfad kann absolut oder relativ zum aktuellen Arbeitsverzeichnis sein. Außerdem wird die Referenzierung vom Home-Verzeichnis aus unterstützt.
      - **Verwendung:** `/directory add <pfad1>,<pfad2>`
      - **Hinweis:** In restriktiven Sandbox-Profilen deaktiviert. Wenn du diese verwendest, nutze stattdessen `--include-directories` beim Starten der Sitzung.
    - **`show`**:
      - **Beschreibung:** Zeigt alle Verzeichnisse an, die mit `/directory add` oder `--include-directories` hinzugefügt wurden.
      - **Verwendung:** `/directory show`

- **`/directory`** (oder **`/dir`**)
  - **Beschreibung:** Verwalte Workspace-Verzeichnisse für Multi-Directory-Unterstützung.
  - **Unterbefehle:**
    - **`add`**:
      - **Beschreibung:** Fügt ein Verzeichnis zum Workspace hinzu. Der Pfad kann absolut oder relativ zum aktuellen Arbeitsverzeichnis sein. Außerdem wird die Referenzierung vom Home-Verzeichnis aus unterstützt.
      - **Verwendung:** `/directory add <pfad1>,<pfad2>`
      - **Hinweis:** In restriktiven Sandbox-Profilen deaktiviert. Wenn du diese verwendest, nutze stattdessen `--include-directories` beim Starten der Sitzung.
    - **`show`**:
      - **Beschreibung:** Zeigt alle Verzeichnisse an, die mit `/directory add` oder `--include-directories` hinzugefügt wurden.
      - **Verwendung:** `/directory show`

- **`/editor`**
  - **Beschreibung:** Öffnet einen Dialog zur Auswahl unterstützter Editoren.

- **`/extensions`**
  - **Beschreibung:** Listet alle aktiven Erweiterungen in der aktuellen Qwen Code-Sitzung auf. Siehe [Qwen Code Extensions](../extension.md).

- **`/help`** (oder **`/?`**)
  - **Beschreibung:** Zeigt Hilfsinformationen zu Qwen Code an, einschließlich verfügbarer Befehle und deren Verwendung.

- **`/mcp`**
  - **Beschreibung:** Listet konfigurierte Model Context Protocol (MCP)-Server, deren Verbindungsstatus, Serverdetails und verfügbare Tools auf.
  - **Unterbefehle:**
    - **`desc`** oder **`descriptions`**:
      - **Beschreibung:** Zeigt detaillierte Beschreibungen der MCP-Server und Tools an.
    - **`nodesc`** oder **`nodescriptions`**:
      - **Beschreibung:** Versteckt Tool-Beschreibungen und zeigt nur die Tool-Namen an.
    - **`schema`**:
      - **Beschreibung:** Zeigt das vollständige JSON-Schema für die konfigurierten Parameter des Tools an.
  - **Tastenkürzel:** Drücke jederzeit **Strg+T**, um zwischen Anzeige und Ausblenden der Tool-Beschreibungen zu wechseln.

- **`/memory`**
  - **Beschreibung:** Verwalte den instruktiven Kontext der KI (standardmäßig aus `QWEN.md` geladene hierarchische Speicherstruktur; konfigurierbar über `contextFileName`).
  - **Unterbefehle:**
    - **`add`**:
      - **Beschreibung:** Fügt den folgenden Text dem Speicher der KI hinzu. Verwendung: `/memory add <zu merkender Text>`
    - **`show`**:
      - **Beschreibung:** Zeigt den vollständigen, zusammengeführten Inhalt des aktuellen hierarchischen Speichers an, der aus allen Kontextdateien (z. B. `QWEN.md`) geladen wurde. So kannst du den instruktiven Kontext einsehen, der dem Modell zur Verfügung steht.
    - **`refresh`**:
      - **Beschreibung:** Lädt den hierarchischen instruktiven Speicher aus allen Kontextdateien (Standard: `QWEN.md`) neu, die in den konfigurierten Orten (global, Projekt/Vorfahren und Unterverzeichnisse) gefunden wurden. Dadurch wird das Modell mit dem neuesten Kontext aktualisiert.
    - **Hinweis:** Weitere Details zur Funktionsweise von Kontextdateien bei der hierarchischen Speicherung findest du in der [CLI-Konfigurationsdokumentation](./configuration.md#context-files-hierarchical-instructional-context).

- **`/restore`**
  - **Beschreibung:** Stellt die Projektdateien in den Zustand vor der Ausführung eines Tools wieder her. Besonders nützlich, um Dateiänderungen eines Tools rückgängig zu machen. Ohne Angabe einer Tool-Aufruf-ID werden verfügbare Checkpoints zur Wiederherstellung aufgelistet.
  - **Verwendung:** `/restore [tool_call_id]`
  - **Hinweis:** Nur verfügbar, wenn die CLI mit der Option `--checkpointing` gestartet wurde oder über [Einstellungen](./configuration.md) konfiguriert ist. Siehe [Checkpointing-Dokumentation](../checkpointing.md) für weitere Details.

- **`/settings`**
  - **Beschreibung:** Öffnet den Einstellungseditor, um Qwen Code-Einstellungen anzuzeigen und zu ändern.
  - **Details:** Dieser Befehl bietet eine benutzerfreundliche Oberfläche zum Ändern von Einstellungen, die das Verhalten und Aussehen von Qwen Code steuern. Er entspricht dem manuellen Bearbeiten der Datei `.qwen/settings.json`, bietet aber Validierung und Anleitung, um Fehler zu vermeiden.
  - **Verwendung:** Führe einfach `/settings` aus, und der Editor öffnet sich. Du kannst dann nach bestimmten Einstellungen suchen, deren aktuelle Werte anzeigen und sie nach Belieben ändern. Einige Einstellungen werden sofort übernommen, andere erfordern einen Neustart.

- **`/stats`**
  - **Beschreibung:** Zeigt detaillierte Statistiken zur aktuellen Qwen Code-Sitzung an, darunter Token-Nutzung, eingesparte gecachte Tokens (falls verfügbar) und Sitzungsdauer. Hinweis: Informationen zu gecachten Tokens werden nur angezeigt, wenn diese tatsächlich verwendet werden – dies geschieht derzeit nur bei Authentifizierung per API-Schlüssel, nicht bei OAuth.

- [**`/theme`**](./themes.md)
  - **Beschreibung:** Öffnet einen Dialog, in dem du das visuelle Theme von Qwen Code ändern kannst.

- **`/auth`**
  - **Beschreibung:** Öffnet einen Dialog, in dem du die Authentifizierungsmethode ändern kannst.

- **`/approval-mode`**
  - **Beschreibung:** Ändert den Genehmigungsmodus für die Tool-Nutzung.
  - **Verwendung:** `/approval-mode [Modus] [--session|--project|--user]`
  - **Verfügbare Modi:**
    - **`plan`**: Nur Analyse; keine Dateiänderungen oder Befehle ausführen
    - **`default`**: Genehmigung für Dateiänderungen oder Shell-Befehle erforderlich
    - **`auto-edit`**: Automatische Genehmigung für Dateiänderungen
    - **`yolo`**: Automatische Genehmigung aller Tools
  - **Beispiele:**
    - `/approval-mode plan --project` (persistenter Plan-Modus für dieses Projekt)
    - `/approval-mode yolo --user` (persistenter YOLO-Modus für diesen Benutzer über alle Projekte hinweg)

- **`/about`**
  - **Beschreibung:** Zeigt Versionsinformationen an. Bitte teile diese Informationen mit, wenn du ein Issue erstellst.

- **`/agents`**
  - **Beschreibung:** Verwalte spezialisierte KI-Subagents für fokussierte Aufgaben. Subagents sind unabhängige KI-Assistenten mit spezifischer Expertise und Tool-Zugriff.
  - **Unterbefehle:**
    - **`create`**:
      - **Beschreibung:** Startet einen interaktiven Assistenten zum Erstellen eines neuen Subagents. Der Assistent führt dich durch die Auswahl des Speicherorts, KI-gestützte Prompt-Generierung, Tool-Auswahl und visuelle Anpassung.
      - **Verwendung:** `/agents create`
    - **`manage`**:
      - **Beschreibung:** Öffnet einen interaktiven Verwaltungsdialog zum Anzeigen, Bearbeiten und Löschen bestehender Subagents. Zeigt sowohl Projekt- als auch Benutzerebene an.
      - **Verwendung:** `/agents manage`
  - **Speicherorte:**
    - **Projektebene:** `.qwen/agents/` (mit Team geteilt, hat Vorrang)
    - **Benutzerebene:** `~/.qwen/agents/` (persönliche Agents, über alle Projekte verfügbar)
  - **Hinweis:** Weitere Informationen zum Erstellen und Verwalten von Subagents findest du in der [Subagents-Dokumentation](../subagents.md).

- [**`/tools`**](../tools/index.md)
  - **Beschreibung:** Zeigt eine Liste der aktuell in Qwen Code verfügbaren Tools an.
  - **Verwendung:** `/tools [desc]`
  - **Unterbefehle:**
    - **`desc`** oder **`descriptions`**:
      - **Beschreibung:** Zeigt detaillierte Beschreibungen jedes Tools an, einschließlich Name und vollständiger Beschreibung, wie sie dem Modell zur Verfügung gestellt wird.
    - **`nodesc`** oder **`nodescriptions`**:
      - **Beschreibung:** Versteckt Tool-Beschreibungen und zeigt nur die Tool-Namen an.

- **`/quit-confirm`**
  - **Beschreibung:** Zeigt einen Bestätigungsdialog vor dem Beenden von Qwen Code an, in dem du auswählen kannst, wie mit der aktuellen Sitzung umgegangen werden soll.
  - **Verwendung:** `/quit-confirm`
  - **Funktionen:**
    - **Sofort beenden:** Beenden ohne Speichern (entspricht `/quit`)
    - **Zusammenfassung generieren und beenden:** Erstelle eine Projektzusammenfassung mit `/summary` vor dem Beenden
    - **Gespräch speichern und beenden:** Speichere das aktuelle Gespräch mit einem automatisch generierten Tag vor dem Beenden
  - **Tastenkürzel:** Drücke **Strg+C** zweimal, um den Beendigungsdialog zu öffnen
  - **Hinweis:** Dieser Befehl wird automatisch ausgelöst, wenn du einmal Strg+C drückst, um versehentliches Beenden zu verhindern.

- **`/quit`** (oder **`/exit`**)
  - **Beschreibung:** Beendet Qwen Code sofort ohne Bestätigungsdialog.

- **`/vim`**
  - **Beschreibung:** Aktiviert oder deaktiviert den Vim-Modus. Im aktivierten Zustand unterstützt der Eingabebereich Vim-artige Navigations- und Bearbeitungsbefehle in den Modi NORMAL und INSERT.
  - **Funktionen:**
    - **NORMAL-Modus:** Navigation mit `h`, `j`, `k`, `l`; Wortwechsel mit `w`, `b`, `e`; Zeilenanfang/-ende mit `0`, `$`, `^`; gehe zu bestimmter Zeile mit `G` (oder `gg` für erste Zeile)
    - **INSERT-Modus:** Standard-Texteingabe mit Escape zum Wechsel in den NORMAL-Modus
    - **Bearbeitungsbefehle:** Löschen mit `x`, Ändern mit `c`, Einfügen mit `i`, `a`, `o`, `O`; komplexe Operationen wie `dd`, `cc`, `dw`, `cw`
    - **Zählerunterstützung:** Befehle mit Zahlen als Präfix (z. B. `3h`, `5w`, `10G`)
    - **Letzten Befehl wiederholen:** Mit `.` wird die letzte Bearbeitung wiederholt
    - **

### Custom Commands

Für einen schnellen Einstieg sieh dir das [Beispiel](#example-a-pure-function-refactoring-command) unten an.

Custom Commands ermöglichen es dir, deine favorisierten oder am häufigsten verwendeten Prompts als persönliche Shortcuts innerhalb von Qwen Code zu speichern und wiederzuverwenden. Du kannst Commands erstellen, die spezifisch für ein einzelnes Projekt sind, oder solche, die global in allen deinen Projekten verfügbar sind – so wird dein Workflow optimiert und die Konsistenz gewährleistet.

#### Dateispeicherorte & Priorität

Qwen Code erkennt Befehle aus zwei Speicherorten, die in einer bestimmten Reihenfolge geladen werden:

1.  **Benutzerbefehle (Global):** Diese befinden sich im Verzeichnis `~/.qwen/commands/`. Diese Befehle sind in jedem Projekt verfügbar, an dem du arbeitest.
2.  **Projektbefehle (Lokal):** Diese befinden sich im Verzeichnis `<your-project-root>/.qwen/commands/`. Diese Befehle sind spezifisch für das aktuelle Projekt und können in die Versionskontrolle eingecheckt werden, um sie mit deinem Team zu teilen.

Wenn ein Befehl im Projektverzeichnis denselben Namen wie ein Befehl im Benutzerverzeichnis hat, wird **immer der Projektbefehl verwendet.** Dadurch können Projekte globale Befehle mit projektspezifischen Versionen überschreiben.

#### Benennung und Namensräume

Der Name eines Befehls ergibt sich aus seinem Dateipfad relativ zum `commands`-Verzeichnis. Unterverzeichnisse dienen zur Erstellung von Befehlen mit Namensräumen, wobei der Pfadtrenner (`/` oder `\`) in einen Doppelpunkt (`:`) umgewandelt wird.

- Eine Datei unter `~/.qwen/commands/test.toml` wird zum Befehl `/test`.
- Eine Datei unter `<project>/.qwen/commands/git/commit.toml` wird zum Befehl mit Namensraum `/git:commit`.

#### TOML-Dateiformat (v1)

Deine Befehlsdefinitionsdateien müssen im TOML-Format geschrieben und die Dateierweiterung `.toml` verwenden.

##### Erforderliche Felder

- `prompt` (String): Die Eingabeaufforderung, die beim Ausführen des Befehls an das Modell gesendet wird. Dies kann einzeilig oder mehrzeilig sein.

##### Optionale Felder

- `description` (String): Eine kurze, einzeilige Beschreibung dessen, was der Befehl bewirkt. Dieser Text wird neben deinem Befehl im `/help`-Menü angezeigt. **Wenn du dieses Feld weglässt, wird automatisch eine allgemeine Beschreibung aus dem Dateinamen generiert.**

#### Umgang mit Argumenten

Benutzerdefinierte Befehle unterstützen zwei leistungsstarke Methoden zur Verarbeitung von Argumenten. Die CLI wählt automatisch die richtige Methode basierend auf dem Inhalt des `prompt` deines Befehls aus.

##### 1. Kontextabhängige Injektion mit `{{args}}`

Wenn dein `prompt` den speziellen Platzhalter `{{args}}` enthält, ersetzt die CLI diesen Platzhalter durch den Text, den der Benutzer nach dem Befehlsnamen eingegeben hat.

Das Verhalten dieser Injektion hängt davon ab, wo sie verwendet wird:

**A. Rohe Injektion (Außerhalb von Shell-Befehlen)**

Wenn sie im Hauptteil des Prompts verwendet wird, werden die Argumente exakt so injiziert, wie der Benutzer sie eingegeben hat.

**Beispiel (`git/fix.toml`):**

```toml

```markdown
# Aufgerufen über: /git:fix "Button is misaligned"

description = "Generiert einen Fix für ein gegebenes Problem."
prompt = "Bitte stelle einen Code-Fix für das hier beschriebene Problem bereit: {{args}}."
```

Das Modell erhält: `Bitte stelle einen Code-Fix für das hier beschriebene Problem bereit: "Button is misaligned".`

**B. Verwendung von Argumenten in Shell-Befehlen (Innerhalb von `!{...}` Blöcken)**

Wenn du `{{args}}` innerhalb eines Shell-Injection-Blocks (`!{...}`) verwendest, werden die Argumente automatisch **shell-escaped** vor der Ersetzung. Dadurch kannst du Argumente sicher an Shell-Befehle übergeben, wodurch sichergestellt ist, dass der resultierende Befehl syntaktisch korrekt und sicher ist und gleichzeitig Command-Injection-Schwachstellen verhindert werden.

**Beispiel (`/grep-code.toml`):**

```toml
prompt = """
Bitte fasse die Ergebnisse für das Muster `{{args}}` zusammen.

Suchergebnisse:
!{grep -r {{args}} .}
"""
```

Wenn du `/grep-code It's complicated` ausführst:

1. Die CLI erkennt, dass `{{args}}` sowohl außerhalb als auch innerhalb von `!{...}` verwendet wird.
2. Außerhalb: Das erste `{{args}}` wird roh durch `It's complicated` ersetzt.
3. Innerhalb: Das zweite `{{args}}` wird durch die escapte Version ersetzt (z. B. unter Linux: `"It's complicated"`).
4. Der ausgeführte Befehl lautet `grep -r "It's complicated" .`.
5. Die CLI fordert dich auf, diesen exakten, sicheren Befehl vor der Ausführung zu bestätigen.
6. Der finale Prompt wird gesendet.
```

##### 2. Standardargumentverarbeitung

Falls dein `prompt` den speziellen Platzhalter `{{args}}` **nicht** enthält, verwendet die CLI ein Standardverhalten zur Verarbeitung von Argumenten.

Wenn du der Kommandozeile Argumente übergibst (z. B. `/mycommand arg1`), wird die CLI den vollständigen Befehl, den du eingegeben hast, am Ende des Prompts mit zwei Zeilenumbrüchen getrennt anhängen. Dadurch kann das Modell sowohl die ursprünglichen Anweisungen als auch die gerade übergebenen Argumente sehen.

Falls du **keine** Argumente angibst (z. B. `/mycommand`), wird der Prompt exakt so, wie er ist, an das Modell gesendet – ohne etwas anzuhängen.

**Beispiel (`changelog.toml`):**

Dieses Beispiel zeigt, wie man einen robusten Befehl erstellt, indem eine Rolle für das Modell definiert wird, erklärt wird, wo die Benutzereingabe zu finden ist, und das erwartete Format sowie das Verhalten festgelegt werden.

```toml

# In: <project>/.qwen/commands/changelog.toml

# Aufgerufen über: /changelog 1.2.0 added "Support for default argument parsing."

description = "Fügt einen neuen Eintrag zur CHANGELOG.md-Datei des Projekts hinzu."
prompt = """

# Aufgabe: Changelog aktualisieren

Du bist ein erfahrener Maintainer dieses Softwareprojekts. Ein Benutzer hat einen Befehl ausgeführt, um einen neuen Eintrag zum Changelog hinzuzufügen.

**Der rohe Befehl des Benutzers steht unterhalb deiner Anweisungen.**

Deine Aufgabe ist es, `<version>`, `<change_type>` und `<message>` aus der Eingabe zu parsen und das `write_file`-Tool zu verwenden, um die `CHANGELOG.md`-Datei korrekt zu aktualisieren.

## Erwartetes Format
Der Befehl folgt diesem Format: `/changelog <version> <type> <message>`
- `<type>` muss einer der folgenden Werte sein: "added", "changed", "fixed", "removed"."

## Verhalten
1. Lies die Datei `CHANGELOG.md`.
2. Finde den Abschnitt für die angegebene `<version>`.
3. Füge die `<message>` unter der korrekten `<type>`-Überschrift hinzu.
4. Falls die Version oder der Typ-Abschnitt nicht existiert, lege ihn an.
5. Halte dich strikt an das "Keep a Changelog"-Format.
"""
```

Wenn du `/changelog 1.2.0 added "New feature"` ausführst, wird der finale Text, der an das Modell gesendet wird, der ursprüngliche Prompt gefolgt von zwei Zeilenumbrüchen und dem von dir eingegebenen Befehl sein.

##### 3. Shell-Befehle mit `!{...}` ausführen

Du kannst deine Befehle dynamisch gestalten, indem du direkt Shell-Befehle innerhalb deines `prompt` ausführst und deren Ausgabe einfügst. Das ist ideal, um Kontext aus deiner lokalen Umgebung zu sammeln, wie z. B. den Inhalt von Dateien zu lesen oder den Status von Git abzufragen.

Wenn ein benutzerdefinierter Befehl versucht, einen Shell-Befehl auszuführen, fordert Qwen Code dich nun zur Bestätigung auf, bevor er fortfährt. Dies ist eine Sicherheitsmaßnahme, um sicherzustellen, dass nur beabsichtigte Befehle ausgeführt werden können.

**So funktioniert es:**

1.  **Befehle einfügen:** Verwende die Syntax `!{...}`.
2.  **Argumentenersetzung:** Falls `{{args}}` innerhalb des Blocks vorhanden ist, wird es automatisch für die Shell maskiert (siehe oben [Kontextabhängige Einfügung](#1-context-aware-injection-with-args)).
3.  **Robuste Parsing-Funktion:** Der Parser verarbeitet korrekt komplexe Shell-Befehle mit verschachtelten Klammern, wie z. B. JSON-Payloads. **Hinweis:** Der Inhalt innerhalb von `!{...}` muss paarweise geschlossene Klammern enthalten (`{` und `}`). Wenn du einen Befehl mit unausgeglichenen Klammern ausführen musst, solltest du diesen in eine externe Skriptdatei auslagern und das Skript innerhalb des `!{...}`-Blocks aufrufen.
4.  **Sicherheitsprüfung und Bestätigung:** Die CLI führt eine Sicherheitsprüfung des endgültigen, aufgelösten Befehls durch (nachdem Argumente maskiert und ersetzt wurden). Ein Dialog zeigt dir genau die Befehle an, die ausgeführt werden sollen.
5.  **Ausführung und Fehlerberichterstattung:** Der Befehl wird ausgeführt. Falls der Befehl fehlschlägt, enthält die im Prompt eingefügte Ausgabe die Fehlermeldungen (stderr), gefolgt von einer Statuszeile, z. B. `[Shell command exited with code 1]`. Dadurch kann das Modell den Kontext des Fehlers besser verstehen.

**Beispiel (`git/commit.toml`):**

Dieser Befehl ruft den gestageten Git-Diff ab und verwendet ihn, um das Modell eine Commit-Nachricht schreiben zu lassen.

````toml

# In: <project>/.qwen/commands/git/commit.toml

# Aufgerufen via: /git:commit

description = "Generiert eine Git Commit-Nachricht basierend auf den gestageten Änderungen."

# Der Prompt verwendet !{...}, um den Befehl auszuführen und dessen Ausgabe einzufügen.
prompt = """
Bitte generiere eine Conventional Commit Nachricht basierend auf dem folgenden git diff:

```diff
!{git diff --staged}
```

"""

````

Wenn du `/git:commit` ausführst, führt die CLI zuerst `git diff --staged` aus, ersetzt dann `!{git diff --staged}` mit der Ausgabe dieses Befehls, bevor sie den finalen, vollständigen Prompt an das Modell sendet.

##### 4. Dateiinhalte mit `@{...}` einfügen

Du kannst den Inhalt einer Datei oder eine Verzeichnisliste direkt in deinen Prompt einbetten, indem du die `@{...}`-Syntax verwendest. Das ist besonders nützlich, um Befehle zu erstellen, die auf bestimmten Dateien arbeiten.

**So funktioniert's:**

- **Datei-Injection**: `@{path/to/file.txt}` wird durch den Inhalt von `file.txt` ersetzt.
- **Multimodale Unterstützung**: Wenn der Pfad auf ein unterstütztes Bild (z. B. PNG, JPEG), PDF, Audio- oder Videodatei zeigt, wird diese korrekt kodiert und als multimodaler Input injiziert. Andere Binärdateien werden übersprungen.
- **Verzeichnis-Auflistung**: `@{path/to/dir}` wird durchlaufen und jede Datei innerhalb des Verzeichnisses sowie aller Unterverzeichnisse wird in den Prompt eingefügt. Dabei werden `.gitignore` und `.qwenignore` berücksichtigt, sofern aktiviert.
- **Workspace-bezogen**: Der Befehl sucht den Pfad im aktuellen Verzeichnis sowie in anderen Workspace-Verzeichnissen. Absolute Pfade sind erlaubt, solange sie sich innerhalb des Workspaces befinden.
- **Reihenfolge der Verarbeitung**: Die Dateiinjektion mit `@{...}` erfolgt _vor_ Shell-Befehlen (`!{...}`) und Argument-Substitution (`{{args}}`).
- **Parsing**: Der Parser erwartet, dass der Inhalt innerhalb von `@{...}` (also der Pfad) geschlossene Klammern (`{` und `}`) verwendet.

**Beispiel (`review.toml`):**

Dieser Befehl injiziert den Inhalt einer _festgelegten_ Best Practices-Datei (`docs/best-practices.md`) und verwendet die vom Nutzer übergebenen Argumente, um Kontext für den Review bereitzustellen.

```toml

```markdown
# In: <project>/.qwen/commands/review.toml

# Aufgerufen via: /review FileCommandLoader.ts

description = "Überprüft den bereitgestellten Kontext anhand eines Best Practices Leitfadens."
prompt = """
Du bist ein erfahrener Code-Reviewer.

Deine Aufgabe ist es, {{args}} zu reviewen.

Verwende die folgenden Best Practices für dein Review:

@{docs/best-practices.md}
"""

Wenn du `/review FileCommandLoader.ts` ausführst, wird der Platzhalter `@{docs/best-practices.md}` durch den Inhalt dieser Datei ersetzt und `{{args}}` durch den von dir angegebenen Text, bevor der finale Prompt an das Modell gesendet wird.

---
```

#### Beispiel: Ein "Pure Function" Refactoring Command

Erstellen wir ein globales Command, das das Modell bittet, einen Code-Abschnitt zu refactoren.

**1. Erstelle die Datei und Verzeichnisse:**

Stelle zunächst sicher, dass das User Commands Verzeichnis existiert, erstelle dann ein `refactor` Unterverzeichnis zur Organisation und die finale TOML Datei.

```bash
mkdir -p ~/.qwen/commands/refactor
touch ~/.qwen/commands/refactor/pure.toml
```

**2. Füge den Inhalt zur Datei hinzu:**

Öffne `~/.qwen/commands/refactor/pure.toml` in deinem Editor und füge folgenden Inhalt hinzu. Wir fügen die optionale `description` aus Best Practices hinzu.

```toml

# In: ~/.qwen/commands/refactor/pure.toml

```markdown
# Dieser Befehl wird aufgerufen über: /refactor:pure

description = "Fordert das Modell auf, den aktuellen Kontext in eine reine Funktion umzustrukturieren."

prompt = """
Bitte analysiere den Code, den ich im aktuellen Kontext bereitgestellt habe.
Strukturiere ihn in eine reine Funktion um.

Deine Antwort sollte Folgendes enthalten:
1. Den umstrukturierten Codeblock der reinen Funktion.
2. Eine kurze Erklärung der wichtigsten Änderungen und warum diese zur Reinheit beitragen.
"""

**3. Führe den Befehl aus:**

Das ist alles! Du kannst jetzt deinen Befehl in der CLI ausführen. Zuerst fügst du vielleicht eine Datei zum Kontext hinzu und rufst dann deinen Befehl auf:

```
> @my-messy-function.js
> /refactor:pure
```

Qwen Code führt dann die mehrzeilige Eingabeaufforderung aus, die in deiner TOML-Datei definiert ist.
```

## Eingabeaufforderungs-Shortcuts

Diese Shortcuts gelten direkt für die Eingabeaufforderung zur Textbearbeitung.

- **Rückgängig:**
  - **Tastenkombination:** Drücke **Strg+z**, um die letzte Aktion in der Eingabeaufforderung rückgängig zu machen.

- **Wiederholen:**
  - **Tastenkombination:** Drücke **Strg+Umschalt+Z**, um die letzte rückgängig gemachte Aktion in der Eingabeaufforderung zu wiederholen.

## At-Befehle (`@`)

At-Befehle werden verwendet, um den Inhalt von Dateien oder Verzeichnissen als Teil deines Prompts an das Modell zu übergeben. Diese Befehle enthalten git-basierte Filterung.

- **`@<Pfad_zu_Datei_oder_Verzeichnis>`**
  - **Beschreibung:** Fügt den Inhalt der angegebenen Datei oder mehrerer Dateien in deinen aktuellen Prompt ein. Das ist nützlich, um Fragen zu spezifischem Code, Text oder ganzen Dateisammlungen zu stellen.
  - **Beispiele:**
    - `@path/to/your/file.txt Erkläre diesen Text.`
    - `@src/my_project/ Fasse den Code in diesem Verzeichnis zusammen.`
    - `Worum geht es in dieser Datei? @README.md`
  - **Details:**
    - Wenn ein Pfad zu einer einzelnen Datei angegeben wird, wird deren Inhalt gelesen.
    - Wenn ein Pfad zu einem Verzeichnis angegeben wird, versucht der Befehl, den Inhalt der Dateien innerhalb dieses Verzeichnisses und aller Unterverzeichnisse zu lesen.
    - Leerzeichen in Pfaden sollten mit einem Backslash maskiert werden (z. B. `@My\ Documents/file.txt`).
    - Intern verwendet der Befehl das `read_many_files`-Tool. Der Inhalt wird abgerufen und dann in deinen Prompt eingefügt, bevor er an das Modell gesendet wird.
    - **Git-basierte Filterung:** Standardmäßig werden git-ignorierte Dateien (wie `node_modules/`, `dist/`, `.env`, `.git/`) ausgeschlossen. Dieses Verhalten kann über die `context.fileFiltering`-Einstellungen angepasst werden.
    - **Dateitypen:** Der Befehl ist für textbasierte Dateien gedacht. Auch wenn versucht wird, beliebige Dateien zu lesen, könnten binäre oder sehr große Dateien vom zugrunde liegenden `read_many_files`-Tool übersprungen oder gekürzt werden, um Leistung und Relevanz zu gewährleisten. Das Tool zeigt an, wenn Dateien übersprungen wurden.
  - **Ausgabe:** Die CLI zeigt eine Tool-Aufruf-Nachricht an, die angibt, dass `read_many_files` verwendet wurde, sowie eine Nachricht mit Details zum Status und den verarbeiteten Pfaden.

- **`@` (Alleinstehendes @-Symbol)**
  - **Beschreibung:** Wenn du nur ein `@`-Symbol ohne Pfad eingibst, wird der Prompt unverändert an das Modell weitergeleitet. Das kann nützlich sein, wenn du im Prompt _über_ das `@`-Symbol selbst sprichst.

### Fehlerbehandlung für `@`-Befehle

- Wenn der nach `@` angegebene Pfad nicht gefunden wird oder ungültig ist, wird eine Fehlermeldung angezeigt, und die Abfrage wird möglicherweise nicht an das Modell gesendet oder ohne den Dateiinhalt versendet.
- Wenn das `read_many_files`-Tool auf einen Fehler stößt (z. B. Berechtigungsprobleme), wird dies ebenfalls gemeldet.

## Shell-Modus & Passthrough-Befehle (`!`)

Das Präfix `!` ermöglicht es dir, direkt mit der Shell deines Systems aus Qwen Code heraus zu interagieren.

- **`!<shell_command>`**
  - **Beschreibung:** Führt den angegebenen `<shell_command>` mit `bash` unter Linux/macOS oder `cmd.exe` unter Windows aus. Jegliche Ausgaben oder Fehler des Befehls werden im Terminal angezeigt.
  - **Beispiele:**
    - `!ls -la` (führt `ls -la` aus und kehrt zu Qwen Code zurück)
    - `!git status` (führt `git status` aus und kehrt zu Qwen Code zurück)

- **`!` (Shell-Modus umschalten)**
  - **Beschreibung:** Die Eingabe von `!` allein schaltet den Shell-Modus um.
    - **Shell-Modus aktivieren:**
      - Im aktiven Zustand verwendet der Shell-Modus eine andere Farbdarstellung und zeigt einen „Shell Mode Indicator“ an.
      - Während des Shell-Modus wird der eingegebene Text direkt als Shell-Befehl interpretiert.
    - **Shell-Modus verlassen:**
      - Beim Verlassen kehrt die Benutzeroberfläche zur Standarddarstellung zurück und das normale Verhalten von Qwen Code wird fortgesetzt.

- **Achtung bei allen `!`-Befehlen:** Die Befehle, die du im Shell-Modus ausführst, haben dieselben Berechtigungen und Auswirkungen wie bei direkter Ausführung in deinem Terminal.

- **Umgebungsvariable:** Wenn ein Befehl über `!` oder im Shell-Modus ausgeführt wird, wird die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Unterprozesses gesetzt. Dadurch können Skripte oder Tools erkennen, ob sie innerhalb der CLI ausgeführt werden.