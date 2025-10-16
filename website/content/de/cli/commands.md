# CLI Commands

Qwen Code unterstützt mehrere eingebaute Befehle, die dir helfen, deine Sitzung zu verwalten, die Oberfläche anzupassen und das Verhalten zu steuern. Diese Befehle beginnen mit einem Schrägstrich (`/`), einem @-Symbol (`@`) oder einem Ausrufezeichen (`!`).

## Slash-Befehle (`/`)

Slash-Befehle bieten Meta-Ebene-Kontrolle über die CLI selbst.

### Integrierte Befehle

- **`/bug`**
  - **Beschreibung:** Erstelle ein Issue zu Qwen Code. Standardmäßig wird das Issue im GitHub Repository für Qwen Code erstellt. Der Text, den du nach `/bug` eingibst, wird zum Titel des gemeldeten Bugs. Das Standardverhalten von `/bug` kann über die Einstellung `bugCommand` in deiner `.qwen/settings.json` Datei angepasst werden.

- **`/chat`**
  - **Beschreibung:** Speichere und setze Gesprächsverläufe interaktiv fort oder lade einen früheren Zustand aus einer späteren Sitzung wiederher.
  - **Unterbefehle:**
    - **`save`**
      - **Beschreibung:** Speichert den aktuellen Gesprächsverlauf. Du musst ein `<tag>` hinzufügen, um den Konversationszustand zu identifizieren.
      - **Verwendung:** `/chat save <tag>`
      - **Details zum Speicherort der Checkpoints:** Die Standardpfade für gespeicherte Chat-Checkpoints sind:
        - Linux/macOS: `~/.qwen/tmp/<project_hash>/`
        - Windows: `C:\Users\<DeinBenutzername>\.qwen\tmp\<project_hash>\`
        - Wenn du `/chat list` ausführst, scannt die CLI nur diese spezifischen Verzeichnisse, um verfügbare Checkpoints zu finden.
        - **Hinweis:** Diese Checkpoints dienen dem manuellen Speichern und Wiederherstellen von Gesprächszuständen. Für automatisch erstellte Checkpoints vor Dateiänderungen siehe [Checkpointing Dokumentation](../checkpointing.md).
    - **`resume`**
      - **Beschreibung:** Setzt eine Konversation von einem früheren Speicherstand fort.
      - **Verwendung:** `/chat resume <tag>`
    - **`list`**
      - **Beschreibung:** Zeigt verfügbare Tags zur Wiederherstellung von Chat-Zuständen an.
    - **`delete`**
      - **Beschreibung:** Löscht einen gespeicherten Konversations-Checkpoint.
      - **Verwendung:** `/chat delete <tag>`

- **`/clear`**
  - **Beschreibung:** Lösche den Terminalbildschirm inklusive sichtbarem Sitzungsverlauf und Scrollback innerhalb der CLI. Je nach Implementierung können die zugrunde liegenden Sitzungsdaten (für die Historie) erhalten bleiben, aber die visuelle Anzeige wird gelöscht.
  - **Tastenkürzel:** Drücke jederzeit **Strg+L**, um eine Bereinigung durchzuführen.

- **`/summary`**
  - **Beschreibung:** Generiere eine umfassende Projektübersicht basierend auf dem aktuellen Gesprächsverlauf und speichere sie in `.qwen/PROJECT_SUMMARY.md`. Diese Zusammenfassung enthält das Gesamtziel, wichtige Erkenntnisse, kürzliche Aktionen und den aktuellen Plan – ideal, um später weiterzuarbeiten.
  - **Verwendung:** `/summary`
  - **Funktionen:**
    - Analysiert den gesamten Gesprächsverlauf, um wichtigen Kontext zu extrahieren
    - Erstellt eine strukturierte Markdown-Zusammenfassung mit Abschnitten für Ziele, Wissen, Aktionen und Pläne
    - Speichert automatisch unter `.qwen/PROJECT_SUMMARY.md` im Projektstammverzeichnis
    - Zeigt Fortschrittsanzeiger während der Generierung und beim Speichern
    - Integriert sich mit der Willkommen-zurück-Funktion für nahtlose Sitzungswiederaufnahme
  - **Hinweis:** Dieser Befehl benötigt mindestens zwei Nachrichten in einer aktiven Konversation, um eine aussagekräftige Zusammenfassung zu generieren.

- **`/compress`**
  - **Beschreibung:** Ersetze den gesamten Chat-Kontext durch eine Zusammenfassung. Dadurch werden Tokens für zukünftige Aufgaben eingespart, während eine grobe Übersicht über bisherige Ereignisse erhalten bleibt.

- **`/copy`**
  - **Beschreibung:** Kopiert die letzte Ausgabe von Qwen Code in deine Zwischenablage, um einfaches Teilen oder Wiederverwenden zu ermöglichen.

- **`/directory`** (oder **`/dir`**)
  - **Beschreibung:** Verwalte Workspace-Verzeichnisse für Multi-Directory-Support.
  - **Unterbefehle:**
    - **`add`**:
      - **Beschreibung:** Füge ein Verzeichnis zum Workspace hinzu. Der Pfad kann absolut oder relativ zum aktuellen Arbeitsverzeichnis sein. Auch Referenzen vom Home-Verzeichnis aus werden unterstützt.
      - **Verwendung:** `/directory add <Pfad1>,<Pfad2>`
      - **Hinweis:** In restriktiven Sandbox-Profilen deaktiviert. Falls du eines verwendest, nutze stattdessen `--include-directories` beim Starten der Sitzung.
    - **`show`**:
      - **Beschreibung:** Zeige alle Verzeichnisse an, die per `/directory add` und `--include-directories` hinzugefügt wurden.
      - **Verwendung:** `/directory show`

- **`/directory`** (oder **`/dir`**)
  - **Beschreibung:** Verwalte Workspace-Verzeichnisse für Multi-Directory-Support.
  - **Unterbefehle:**
    - **`add`**:
      - **Beschreibung:** Füge ein Verzeichnis zum Workspace hinzu. Der Pfad kann absolut oder relativ zum aktuellen Arbeitsverzeichnis sein. Auch Referenzen vom Home-Verzeichnis aus werden unterstützt.
      - **Verwendung:** `/directory add <Pfad1>,<Pfad2>`
      - **Hinweis:** In restriktiven Sandbox-Profilen deaktiviert. Falls du eines verwendest, nutze stattdessen `--include-directories` beim Starten der Sitzung.
    - **`show`**:
      - **Beschreibung:** Zeige alle Verzeichnisse an, die per `/directory add` und `--include-directories` hinzugefügt wurden.
      - **Verwendung:** `/directory show`

- **`/editor`**
  - **Beschreibung:** Öffne einen Dialog zur Auswahl unterstützter Editoren.

- **`/extensions`**
  - **Beschreibung:** Liste alle aktiven Erweiterungen in der aktuellen Qwen Code-Sitzung auf. Siehe [Qwen Code Erweiterungen](../extension.md).

- **`/help`** (oder **`/?`**)
  - **Beschreibung:** Zeige Hilfsinformationen zu Qwen Code an, einschließlich verfügbarer Befehle und deren Nutzung.

- **`/mcp`**
  - **Beschreibung:** Liste konfigurierte Model Context Protocol (MCP)-Server, deren Verbindungsstatus, Serverdetails und verfügbare Tools auf.
  - **Unterbefehle:**
    - **`desc`** oder **`descriptions`**:
      - **Beschreibung:** Zeige detaillierte Beschreibungen für MCP-Server und Tools an.
    - **`nodesc`** oder **`nodescriptions`**:
      - **Beschreibung:** Blende Tool-Beschreibungen aus und zeige nur die Tool-Namen.
    - **`schema`**:
      - **Beschreibung:** Zeige das vollständige JSON-Schema für die konfigurierten Parameter des Tools an.
  - **Tastenkürzel:** Drücke jederzeit **Strg+T**, um zwischen Anzeigen mit und ohne Tool-Beschreibungen zu wechseln.

- **`/memory`**
  - **Beschreibung:** Verwalte den instruktiven Kontext der KI (standardmäßig hierarchisch aus `QWEN.md` geladen; konfigurierbar über `contextFileName`).
  - **Unterbefehle:**
    - **`add`**:
      - **Beschreibung:** Fügt den folgenden Text dem Gedächtnis der KI hinzu. Verwendung: `/memory add <zu merkender Text>`
    - **`show`**:
      - **Beschreibung:** Zeige den vollständigen, zusammengefügten Inhalt des aktuellen hierarchischen Gedächtnisses an, das aus allen Kontextdateien (z.B. `QWEN.md`) geladen wurde. So kannst du den instruktiven Kontext prüfen, der dem Modell bereitgestellt wird.
    - **`refresh`**:
      - **Beschreibung:** Lade das hierarchische instruktive Gedächtnis neu aus allen Kontextdateien (Standard: `QWEN.md`), die in den konfigurierten Orten gefunden wurden (global, Projekt/Vorfahren und Unterverzeichnisse). Dadurch wird das Modell mit dem neuesten Kontext aktualisiert.
    - **Hinweis:** Weitere Details dazu, wie Kontextdateien zum hierarchischen Gedächtnis beitragen, findest du in der [CLI-Konfigurationsdokumentation](./configuration.md#context-files-hierarchical-instructional-context).

- **`/restore`**
  - **Beschreibung:** Stellt Projektdateien auf den Zustand direkt vor der Ausführung eines Tools zurück. Besonders nützlich, um Dateiänderungen rückgängig zu machen. Ohne Angabe einer Tool-Aufruf-ID werden verfügbare Checkpoints zur Wiederherstellung aufgelistet.
  - **Verwendung:** `/restore [tool_call_id]`
  - **Hinweis:** Nur verfügbar, wenn die CLI mit der Option `--checkpointing` gestartet wurde oder entsprechend konfiguriert ist ([Einstellungen](./configuration.md)). Siehe [Checkpointing-Dokumentation](../checkpointing.md) für weitere Informationen.

- **`/settings`**
  - **Beschreibung:** Öffne den Einstellungseditor, um Qwen Code-Einstellungen anzusehen und zu ändern.
  - **Details:** Dieser Befehl bietet eine benutzerfreundliche Oberfläche zum Ändern von Einstellungen, die das Verhalten und Aussehen von Qwen Code steuern. Er entspricht dem manuellen Bearbeiten der `.qwen/settings.json`-Datei, jedoch mit Validierung und Unterstützung zur Fehlervermeidung.
  - **Verwendung:** Führe einfach `/settings` aus, dann öffnet sich der Editor. Du kannst dann nach bestimmten Einstellungen suchen, ihre aktuellen Werte anzeigen und sie nach Belieben ändern. Einige Änderungen werden sofort übernommen, andere erfordern einen Neustart.

- **`/stats`**
  - **Beschreibung:** Zeige detaillierte Statistiken zur aktuellen Qwen Code-Sitzung an, darunter Token-Nutzung, eingesparte gecachte Tokens (falls verfügbar) und Sitzungsdauer. Hinweis: Informationen zu gecachten Tokens werden nur angezeigt, wenn solche Tokens verwendet werden – dies geschieht momentan bei API-Key-Authentifizierung, nicht jedoch bei OAuth-Authentifizierung.

- [**`/theme`**](./themes.md)
  - **Beschreibung:** Öffne einen Dialog, mit dem du das visuelle Theme von Qwen Code ändern kannst.

- **`/auth`**
  - **Beschreibung:** Öffne einen Dialog, mit dem du die Authentifizierungsmethode ändern kannst.

- **`/approval-mode`**
  - **Beschreibung:** Ändere den Genehmigungsmodus für Tool-Nutzung.
  - **Verwendung:** `/approval-mode [Modus] [--session|--project|--user]`
  - **Verfügbare Modi:**
    - **`plan`**: Nur analysieren; keine Dateiänderungen oder Shell-Befehle ausführen
    - **`default`**: Genehmigung für Dateiänderungen oder Shell-Befehle erforderlich
    - **`auto-edit`**: Automatische Genehmigung für Dateiänderungen
    - **`yolo`**: Automatische Genehmigung aller Tools
  - **Beispiele:**
    - `/approval-mode plan --project` (Plan-Modus dauerhaft für dieses Projekt festlegen)
    - `/approval-mode yolo --user` (YOLO-Modus dauerhaft für diesen Benutzer projektübergreifend festlegen)

- **`/about`**
  - **Beschreibung:** Zeige Versionsinformationen an. Bitte teile diese Informationen mit, wenn du Issues meldest.

- **`/agents`**
  - **Beschreibung:** Verwalte spezialisierte KI-Subagenten für fokussierte Aufgaben. Subagenten sind unabhängige KI-Assistenten mit spezifischer Expertise und Zugriff auf bestimmte Tools.
  - **Unterbefehle:**
    - **`create`**:
      - **Beschreibung:** Starte einen interaktiven Assistenten zum Erstellen eines neuen Subagenten. Der Assistent führt dich durch Standortauswahl, KI-gesteuerte Promptgenerierung, Toolauswahl und visuelle Anpassung.
      - **Verwendung:** `/agents create`
    - **`manage`**:
      - **Beschreibung:** Öffne einen interaktiven Verwaltungsdialog zum Anzeigen, Bearbeiten und Löschen bestehender Subagenten. Zeigt sowohl Projekt- als auch Benutzerebene-Agenten an.
      - **Verwendung:** `/agents manage`
  - **Speicherorte:**
    - **Projektebene:** `.qwen/agents/` (mit Team geteilt, hat Vorrang)
    - **Benutzerebene:** `~/.qwen/agents/` (persönliche Agenten, projektübergreifend verfügbar)
  - **Hinweis:** Detaillierte Informationen zum Erstellen und Verwalten von Subagenten findest du in der [Subagenten-Dokumentation](../subagents.md).

- [**`/tools`**](../tools/index.md)
  - **Beschreibung:** Zeige eine Liste der aktuell in Qwen Code verfügbaren Tools an.
  - **Verwendung:** `/tools [desc]`
  - **Unterbefehle:**
    - **`desc`** oder **`descriptions`**:
      - **Beschreibung:** Zeige detaillierte Beschreibungen jedes Tools an, inklusive Name und vollständiger Beschreibung, wie sie dem Modell bereitgestellt wird.
    - **`nodesc`** oder **`nodescriptions`**:
      - **Beschreibung:** Blende Tool-Beschreibungen aus und zeige nur die Tool-Namen.

- **`/privacy`**
  - **Beschreibung:** Zeige den Datenschutzhinweis an und erlaube Nutzern, auszuwählen, ob sie der Erfassung ihrer Daten zur Verbesserung des Dienstes zustimmen.

- **`/quit-confirm`**
  - **Beschreibung:** Zeige einen Bestätigungsdialog vor dem Beenden von Qwen Code an, sodass du entscheiden kannst, wie mit deiner aktuellen Sitzung umgegangen werden soll.
  - **Verwendung:** `/quit-confirm`
  - **Funktionen:**
    - **Sofort beenden:** Beenden ohne etwas zu speichern (entspricht `/quit`)
    - **Zusammenfassung generieren und beenden:** Erstelle eine Projektzusammenfassung mittels `/summary` vor dem Beenden
    - **Konversation speichern und beenden:** Speichere die aktuelle Konversation mit einem automatisch generierten Tag vor dem Beenden
  - **Tastenkürzel:** Drücke zweimal **Strg+C**, um den Beendigungsbestätigungsdialog auszulösen
  - **Hinweis:** Dieser Befehl wird automatisch ausgelöst, wenn du einmal Strg+C drückst, um versehentliches Beenden zu verhindern.

- **`/quit`** (oder **`/exit`**)
  - **Beschreibung:** Beende Qwen Code sofort ohne Bestätigungsdialog.

- **`/vim`**
  - **Beschreibung:** Schalte den Vim-Modus ein oder aus. Im aktivierten Zustand unterstützt der Eingabebereich Vim-artige Navigations- und Bearbeitungsbefehle sowohl im NORMAL- als auch im INSERT-Modus.
  - **Funktionen:**
    - **NORMAL-Modus:** Navigation mit `h`, `j`, `k`, `l`; Wortweise Springen mit `w`, `b`, `e`; Zeilenanfang/-ende mit `0`, `$`, `^`; Gehe zu bestimmten Zeilen mit `G` (oder `gg` für erste Zeile)
    - **INSERT-Modus:** Standardtexteingabe mit Escape-Taste zum Zurückkehren in den NORMAL-Modus
    - **Bearbeitungsbefehle:** Löschen mit `x`, Ändern mit `c`, Einfügen mit `i`, `a`, `o`, `O`; komplexe Operationen wie `dd`, `cc`, `dw`, `cw`
    - **Anzahl-Support:** Präfixe mit Zahlen (z.B. `3h`, `5w`, `10G`)
    - **Letzten Befehl wiederholen:** Mit `.` den letzten Bearbeitungsvorgang wiederholen
    - **Persistente Einstellung:** Vim

### Benutzerdefinierte Befehle

Für einen schnellen Einstieg siehe das [Beispiel](#beispiel-ein-refactoring-befehl-als-reine-funktion) unten.

Benutzerdefinierte Befehle ermöglichen es dir, deine favorisierten oder am häufigsten verwendeten Prompts als persönliche Shortcuts innerhalb von Qwen Code zu speichern und wiederzuverwenden. Du kannst Befehle erstellen, die spezifisch für ein einzelnes Projekt sind, oder Befehle, die global in allen deinen Projekten verfügbar sind – so wird dein Workflow optimiert und Konsistenz gewährleistet.

#### Dateispeicherorte & Priorität

Qwen Code erkennt Befehle aus zwei Speicherorten, die in einer bestimmten Reihenfolge geladen werden:

1.  **Benutzerbefehle (Global):** Diese befinden sich in `~/.qwen/commands/`. Diese Befehle sind in jedem Projekt verfügbar, an dem Sie arbeiten.
2.  **Projektbefehle (Lokal):** Diese befinden sich in `<your-project-root>/.qwen/commands/`. Diese Befehle sind spezifisch für das aktuelle Projekt und können in die Versionskontrolle eingecheckt werden, um sie mit Ihrem Team zu teilen.

Wenn ein Befehl im Projektverzeichnis denselben Namen wie ein Befehl im Benutzerverzeichnis hat, wird **immer der Projektbefehl verwendet.** Dadurch können Projekte globale Befehle mit projektspezifischen Versionen überschreiben.

#### Benennung und Namensräume

Der Name eines Befehls ergibt sich aus seinem Dateipfad relativ zum `commands`-Verzeichnis. Unterverzeichnisse dienen zur Erstellung von Befehlen mit Namensräumen (Namespaces), wobei der Pfadtrenner (`/` oder `\`) in einen Doppelpunkt (`:`) umgewandelt wird.

- Eine Datei unter `~/.qwen/commands/test.toml` wird zum Befehl `/test`.
- Eine Datei unter `<project>/.qwen/commands/git/commit.toml` wird zum Befehl `/git:commit` mit Namensraum.

#### TOML-Dateiformat (v1)

Deine Befehlsdefinitionsdateien müssen im TOML-Format geschrieben und mit der Dateierweiterung `.toml` versehen werden.

##### Erforderliche Felder

- `prompt` (String): Die Eingabeaufforderung, die beim Ausführen des Befehls an das Modell gesendet wird. Dies kann ein einzeiliger oder mehrzeiliger String sein.

##### Optionale Felder

- `description` (String): Eine kurze, einzeilige Beschreibung dessen, was der Befehl bewirkt. Dieser Text wird neben deinem Befehl im `/help`-Menü angezeigt. **Falls du dieses Feld weglässt, wird automatisch eine generische Beschreibung aus dem Dateinamen erzeugt.**

#### Umgang mit Argumenten

Benutzerdefinierte Befehle unterstützen zwei leistungsstarke Methoden zur Verarbeitung von Argumenten. Die CLI wählt automatisch die richtige Methode basierend auf dem Inhalt des `prompt` deines Befehls aus.

##### 1. Kontextabhängige Injektion mit `{{args}}`

Wenn dein `prompt` den speziellen Platzhalter `{{args}}` enthält, ersetzt die CLI diesen Platzhalter durch den Text, den der Benutzer nach dem Befehlsnamen eingegeben hat.

Das Verhalten dieser Injektion hängt davon ab, wo sie verwendet wird:

**A. Raw Injection (Außerhalb von Shell-Befehlen)**

Wenn sie im Hauptteil des Prompts verwendet wird, werden die Argumente exakt so injiziert, wie der Benutzer sie eingegeben hat.

**Beispiel (`git/fix.toml`):**

```toml

```markdown
# Aufgerufen über: /git:fix "Button ist falsch ausgerichtet"

description = "Erzeugt einen Fix für ein gegebenes Problem."
prompt = "Bitte stelle einen Code-Fix für das hier beschriebene Problem bereit: {{args}}."
```

Das Modell erhält: `Bitte stelle einen Code-Fix für das hier beschriebene Problem bereit: "Button ist falsch ausgerichtet".`

**B. Verwendung von Argumenten in Shell-Befehlen (Innerhalb von `!{...}`-Blöcken)**

Wenn du `{{args}}` innerhalb eines Shell-Injection-Blocks (`!{...}`) verwendest, werden die Argumente automatisch **shell-escaped** vor der Ersetzung. Dadurch kannst du Argumente sicher an Shell-Befehle übergeben, wodurch sichergestellt wird, dass der resultierende Befehl syntaktisch korrekt und sicher ist und gleichzeitig Command-Injection-Schwachstellen verhindert werden.

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

##### 2. Standardargument-Verarbeitung

Falls dein `prompt` den speziellen Platzhalter `{{args}}` **nicht** enthält, verwendet die CLI ein Standardverhalten zur Verarbeitung von Argumenten.

Wenn du der Kommandozeile Argumente übergibst (z. B. `/mycommand arg1`), wird die CLI den vollständigen Befehl, den du eingegeben hast, am Ende des Prompts mit zwei Zeilenumbrüchen getrennt anhängen. Dadurch kann das Modell sowohl die ursprünglichen Anweisungen als auch die spezifischen Argumente sehen, die du gerade übergeben hast.

Falls du **keine** Argumente übergibst (z. B. `/mycommand`), wird der Prompt exakt so, wie er ist, an das Modell gesendet – ohne etwas anzuhängen.

**Beispiel (`changelog.toml`):**

Dieses Beispiel zeigt, wie du einen robusten Befehl erstellst, indem du eine Rolle für das Modell definierst, erklärst, wo es die Benutzereingabe findet, und das erwartete Format sowie das Verhalten festlegst.

```toml

# In: <project>/.qwen/commands/changelog.toml

```markdown
# Aufgerufen via: /changelog 1.2.0 added "Support for default argument parsing."

description = "Fügt einen neuen Eintrag zur CHANGELOG.md-Datei des Projekts hinzu."
prompt = """

# Aufgabe: Changelog aktualisieren

Du bist ein erfahrener Maintainer dieses Softwareprojekts. Ein Benutzer hat einen Befehl aufgerufen, um einen neuen Eintrag zum Changelog hinzuzufügen.

**Der rohe Befehl des Benutzers steht unterhalb deiner Anweisungen.**

Deine Aufgabe ist es, `<version>`, `<change_type>` und `<message>` aus der Eingabe zu parsen und das `write_file`-Tool zu verwenden, um die `CHANGELOG.md`-Datei korrekt zu aktualisieren.

## Erwartetes Format
Der Befehl folgt diesem Format: `/changelog <version> <type> <message>`
- `<type>` muss einer der folgenden Werte sein: "added", "changed", "fixed", "removed".
```

```markdown
## Verhalten
1. Lies die Datei `CHANGELOG.md`.
2. Finde den Abschnitt für die angegebene `<version>`.
3. Füge die `<message>` unter der korrekten `<type>`-Überschrift hinzu.
4. Falls die Version oder der Typ-Abschnitt nicht existiert, lege ihn an.
5. Halte dich strikt an das "Keep a Changelog"-Format.
"""

Wenn du `/changelog 1.2.0 added "New feature"` ausführst, wird der endgültige Text, der an das Modell gesendet wird, der ursprüngliche Prompt gefolgt von zwei Zeilenumbrüchen und dem von dir eingegebenen Befehl sein.
```

##### 3. Shell-Befehle mit `!{...}` ausführen

Du kannst deine Befehle dynamisch gestalten, indem du Shell-Befehle direkt innerhalb deines `prompt` ausführst und deren Ausgabe einfügst. Das ist ideal, um Kontext aus deiner lokalen Umgebung zu sammeln, wie z. B. den Inhalt von Dateien zu lesen oder den Status von Git zu prüfen.

Wenn ein benutzerdefinierter Befehl versucht, einen Shell-Befehl auszuführen, fordert Qwen Code dich nun zur Bestätigung auf, bevor er fortfährt. Dies ist eine Sicherheitsmaßnahme, um sicherzustellen, dass nur beabsichtigte Befehle ausgeführt werden können.

**So funktioniert es:**

1.  **Befehle einfügen:** Verwende die `!{...}`-Syntax.
2.  **Argument-Substitution:** Falls `{{args}}` innerhalb des Blocks vorhanden ist, wird es automatisch für die Shell escaped (siehe [Kontextabhängige Injection](#1-context-aware-injection-with-args) oben).
3.  **Robuste Parsing-Funktion:** Der Parser verarbeitet korrekt komplexe Shell-Befehle mit verschachtelten Klammern, wie z. B. JSON-Payloads. **Hinweis:** Der Inhalt innerhalb von `!{...}` muss ausgeglichene Klammern (`{` und `}`) enthalten. Wenn du einen Befehl mit unausgeglichenen Klammern ausführen musst, solltest du ihn in eine externe Skriptdatei auslagern und das Skript innerhalb des `!{...}`-Blocks aufrufen.
4.  **Sicherheitsprüfung und Bestätigung:** Die CLI führt eine Sicherheitsprüfung des finalen, aufgelösten Befehls durch (nachdem die Argumente escaped und ersetzt wurden). Ein Dialog zeigt die exakten Befehle an, die ausgeführt werden sollen.
5.  **Ausführung und Fehlerberichterstattung:** Der Befehl wird ausgeführt. Falls der Befehl fehlschlägt, enthält die in das Prompt eingefügte Ausgabe die Fehlermeldungen (stderr), gefolgt von einer Statuszeile, z. B. `[Shell command exited with code 1]`. Dies hilft dem Modell, den Kontext des Fehlers zu verstehen.

**Beispiel (`git/commit.toml`):**

Dieser Befehl ruft den gestageten Git-Diff ab und verwendet ihn, um das Modell zu bitten, eine Commit-Nachricht zu schreiben.

````toml

# In: <project>/.qwen/commands/git/commit.toml

# Aufgerufen via: /git:commit

description = "Generiert eine Git Commit-Nachricht basierend auf den gestagten Änderungen."

# Der Prompt verwendet !{...}, um den Befehl auszuführen und dessen Ausgabe einzufügen.
prompt = """
Bitte generiere eine Conventional Commit-Nachricht basierend auf dem folgenden git diff:

```diff
!{git diff --staged}
```

"""

````

Wenn du `/git:commit` ausführst, führt die CLI zuerst `git diff --staged` aus, ersetzt dann `!{git diff --staged}` mit der Ausgabe dieses Befehls, bevor sie den finalen, vollständigen Prompt an das Modell sendet.

##### 4. Dateiinhalte mit `@{...}` einfügen

Du kannst den Inhalt einer Datei oder eine Verzeichnisliste direkt in deinen Prompt einbetten, indem du die `@{...}`-Syntax verwendest. Das ist besonders nützlich, um Befehle zu erstellen, die auf bestimmten Dateien arbeiten.

**So funktioniert's:**

- **Datei-Injektion**: `@{path/to/file.txt}` wird durch den Inhalt von `file.txt` ersetzt.
- **Multimodale Unterstützung**: Wenn der Pfad auf ein unterstütztes Bild (z. B. PNG, JPEG), PDF, Audio- oder Videodatei zeigt, wird diese korrekt kodiert und als multimodaler Input injiziert. Andere Binärdateien werden übersprungen.
- **Verzeichnis-Auflistung**: `@{path/to/dir}` wird durchlaufen und jede Datei innerhalb des Verzeichnisses sowie aller Unterverzeichnisse wird in den Prompt eingefügt. Dabei werden `.gitignore` und `.qwenignore` berücksichtigt, sofern aktiviert.
- **Workspace-bezogen**: Der Befehl sucht den Pfad im aktuellen Verzeichnis sowie in anderen Workspace-Verzeichnissen. Absolute Pfade sind erlaubt, solange sie sich innerhalb des Workspaces befinden.
- **Reihenfolge der Verarbeitung**: Die Injektion von Dateiinhalten mit `@{...}` erfolgt _vor_ Shell-Befehlen (`!{...}`) und Argument-Substitution (`{{args}}`).
- **Parsing**: Der Parser erwartet, dass der Inhalt innerhalb von `@{...}` (also der Pfad) geschlossene geschweifte Klammern (`{` und `}`) verwendet.

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

Stelle zunächst sicher, dass das Verzeichnis für User Commands existiert, erstelle dann ein `refactor` Unterverzeichnis zur Organisation und die finale TOML-Datei.

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
Strukturiere ihn in eine reine Funktion (pure function) um.

Deine Antwort sollte Folgendes enthalten:
1. Den umstrukturierten Codeblock der reinen Funktion.
2. Eine kurze Erklärung der wichtigsten Änderungen und warum diese zur Reinheit (Purity) beitragen.
"""
```

**3. Befehl ausführen:**

Das war's! Du kannst deinen Befehl jetzt in der CLI ausführen. Zuerst fügst du vielleicht eine Datei zum Kontext hinzu und rufst dann deinen Befehl auf:

```
> @my-messy-function.js
> /refactor:pure
```

Qwen Code führt dann die mehrzeilige Eingabeaufforderung aus, die in deiner TOML-Datei definiert ist.
```

## At-Befehle (`@`)

At-Befehle werden verwendet, um den Inhalt von Dateien oder Verzeichnissen als Teil deines Prompts an das Modell zu übergeben. Diese Befehle enthalten git-basierte Filterung.

- **`@<Pfad_zu_Datei_oder_Verzeichnis>`**
  - **Beschreibung:** Fügt den Inhalt der angegebenen Datei oder mehrerer Dateien in deinen aktuellen Prompt ein. Das ist nützlich, wenn du Fragen zu bestimmtem Code, Text oder Sammlungen von Dateien stellen willst.
  - **Beispiele:**
    - `@path/to/your/file.txt Erkläre diesen Text.`
    - `@src/my_project/ Fasse den Code in diesem Verzeichnis zusammen.`
    - `Worum geht es in dieser Datei? @README.md`
  - **Details:**
    - Wenn ein Pfad zu einer einzelnen Datei angegeben wird, wird deren Inhalt eingelesen.
    - Wenn ein Pfad zu einem Verzeichnis angegeben wird, versucht der Befehl, den Inhalt aller Dateien innerhalb dieses Verzeichnisses und seiner Unterverzeichnisse einzulesen.
    - Leerzeichen in Pfaden sollten mit einem Backslash maskiert werden (z. B. `@Meine\ Dokumente/datei.txt`).
    - Intern nutzt der Befehl das `read_many_files`-Tool. Der Inhalt wird abgerufen und dann vor dem Senden an das Modell in deinen Query eingefügt.
    - **Git-basierte Filterung:** Standardmäßig werden git-ignorierte Dateien (wie `node_modules/`, `dist/`, `.env`, `.git/`) ausgeschlossen. Dieses Verhalten kann über die `fileFiltering`-Einstellungen geändert werden.
    - **Dateitypen:** Der Befehl ist für textbasierte Dateien gedacht. Auch wenn versucht wird, beliebige Dateien einzulesen, könnten binäre oder sehr große Dateien vom zugrunde liegenden `read_many_files`-Tool übersprungen oder gekürzt werden, um Performance und Relevanz sicherzustellen. Das Tool zeigt an, wenn Dateien übersprungen wurden.
  - **Ausgabe:** Die CLI zeigt eine Tool-Aufruf-Nachricht an, die angibt, dass `read_many_files` verwendet wurde, sowie eine Meldung mit Statusinformationen und den verarbeiteten Pfaden.

- **`@` (Allein stehendes @-Symbol)**
  - **Beschreibung:** Wenn du nur ein einzelnes `@` ohne Pfad eingibst, wird der Query unverändert an das Modell weitergeleitet. Das kann nützlich sein, wenn du im Prompt explizit _über_ das `@`-Symbol sprichst.

### Fehlerbehandlung für `@`-Befehle

- Wenn der nach `@` angegebene Pfad nicht gefunden wird oder ungültig ist, wird eine Fehlermeldung angezeigt, und die Abfrage wird möglicherweise nicht an das Modell gesendet oder ohne den Dateiinhalt versandt.
- Wenn das `read_many_files`-Tool auf einen Fehler stößt (z. B. Berechtigungsprobleme), wird dies ebenfalls gemeldet.

## Shell-Modus & Passthrough-Befehle (`!`)

Das Präfix `!` ermöglicht es dir, direkt mit der Shell deines Systems aus Qwen Code heraus zu interagieren.

- **`!<shell_command>`**
  - **Beschreibung:** Führt den angegebenen `<shell_command>` mit `bash` auf Linux/macOS oder `cmd.exe` auf Windows aus. Jegliche Ausgaben oder Fehler des Befehls werden im Terminal angezeigt.
  - **Beispiele:**
    - `!ls -la` (führt `ls -la` aus und kehrt zu Qwen Code zurück)
    - `!git status` (führt `git status` aus und kehrt zu Qwen Code zurück)

- **`!` (Shell-Modus umschalten)**
  - **Beschreibung:** Die Eingabe von `!` allein schaltet den Shell-Modus um.
    - **Shell-Modus aktivieren:**
      - Wenn aktiviert, verwendet der Shell-Modus eine andere Farbdarstellung und einen „Shell Mode Indicator“.
      - Im Shell-Modus wird der eingegebene Text direkt als Shell-Befehl interpretiert.
    - **Shell-Modus verlassen:**
      - Beim Verlassen kehrt die Benutzeroberfläche zur Standarddarstellung zurück und das normale Verhalten von Qwen Code wird fortgesetzt.

- **Achtung bei der Nutzung von `!`:** Befehle, die du im Shell-Modus ausführst, haben dieselben Berechtigungen und Auswirkungen, als würdest du sie direkt in deinem Terminal ausführen.

- **Umgebungsvariable:** Wenn ein Befehl über `!` oder im Shell-Modus ausgeführt wird, ist die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Unterprozesses gesetzt. Dies erlaubt Skripten oder Tools zu erkennen, ob sie innerhalb der CLI ausgeführt werden.