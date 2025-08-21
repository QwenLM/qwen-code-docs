# CLI Commands

Qwen Code unterstützt mehrere integrierte Befehle, mit denen du deine Sitzung verwalten, die Oberfläche anpassen und das Verhalten steuern kannst. Diese Befehle beginnen mit einem Schrägstrich (`/`), einem @-Symbol (`@`) oder einem Ausrufezeichen (`!`).

## Slash commands (`/`)

Slash commands bieten Meta-Ebene-Kontrolle über die CLI selbst.

### Built-in Commands

- **`/bug`**
  - **Beschreibung:** Erstelle ein Issue zu Qwen Code. Standardmäßig wird das Issue im GitHub-Repository für Qwen Code erstellt. Der Text, den du nach `/bug` eingibst, wird zum Titel des gemeldeten Bugs. Das Standardverhalten von `/bug` kann über die Einstellung `bugCommand` in deiner `.qwen/settings.json`-Datei angepasst werden.

- **`/chat`**
  - **Beschreibung:** Speichere und setze den Gesprächsverlauf interaktiv fort, um verschiedene Gesprächszweige zu verwalten oder einen früheren Zustand in einer späteren Sitzung wiederherzustellen.
  - **Unterbefehle:**
    - **`save`**
      - **Beschreibung:** Speichert den aktuellen Gesprächsverlauf. Du musst ein `<tag>` hinzufügen, um den Zustand des Gesprächs zu identifizieren.
      - **Verwendung:** `/chat save <tag>`
      - **Details zum Speicherort der Checkpoints:** Die Standardverzeichnisse für gespeicherte Chat-Checkpoints sind:
        - Linux/macOS: `~/.config/google-generative-ai/checkpoints/`
        - Windows: `C:\Users\<YourUsername>\AppData\Roaming\google-generative-ai\checkpoints\`
        - Wenn du `/chat list` ausführst, durchsucht die CLI nur diese Verzeichnisse nach verfügbaren Checkpoints.
        - **Hinweis:** Diese Checkpoints dienen dem manuellen Speichern und Wiederherstellen von Gesprächszuständen. Informationen zu automatisch erstellten Checkpoints vor Dateiänderungen findest du in der [Checkpointing-Dokumentation](../checkpointing.md).
    - **`resume`**
      - **Beschreibung:** Setzt ein Gespräch von einem früheren Speicherstand fort.
      - **Verwendung:** `/chat resume <tag>`
    - **`list`**
      - **Beschreibung:** Zeigt verfügbare Tags für die Wiederherstellung von Gesprächszuständen an.
    - **`delete`**
      - **Beschreibung:** Löscht einen gespeicherten Gesprächs-Checkpoint.
      - **Verwendung:** `/chat delete <tag>`

- **`/clear`**
  - **Beschreibung:** Löscht den Terminalbildschirm, einschließlich des sichtbaren Sitzungsverlaufs und des Scrollbacks innerhalb der CLI. Je nach Implementierung können die zugrunde liegenden Sitzungsdaten (für den Verlauf) erhalten bleiben, aber die visuelle Anzeige wird gelöscht.
  - **Tastenkürzel:** Drücke jederzeit **Strg+L**, um den Bildschirm zu löschen.

- **`/compress`**
  - **Beschreibung:** Ersetzt den gesamten Chat-Kontext durch eine Zusammenfassung. Dadurch werden Tokens für zukünftige Aufgaben gespart, während eine allgemeine Übersicht über den bisherigen Verlauf erhalten bleibt.

- **`/copy`**
  - **Beschreibung:** Kopiert die letzte Ausgabe von Qwen Code in die Zwischenablage, um sie einfach zu teilen oder weiterzuverwenden.

- **`/directory`** (oder **`/dir`**)
  - **Beschreibung:** Verwalte Workspace-Verzeichnisse für die Unterstützung mehrerer Verzeichnisse.
  - **Unterbefehle:**
    - **`add`**:
      - **Beschreibung:** Fügt ein Verzeichnis zum Workspace hinzu. Der Pfad kann absolut oder relativ zum aktuellen Arbeitsverzeichnis sein. Außerdem wird die Referenzierung vom Home-Verzeichnis aus unterstützt.
      - **Verwendung:** `/directory add <path1>,<path2>`
      - **Hinweis:** In eingeschränkten Sandbox-Profilen deaktiviert. Falls du ein solches Profil verwendest, nutze stattdessen `--include-directories` beim Starten der Sitzung.
    - **`show`**:
      - **Beschreibung:** Zeigt alle Verzeichnisse an, die mit `/directory add` oder `--include-directories` hinzugefügt wurden.
      - **Verwendung:** `/directory show`

- **`/directory`** (oder **`/dir`**)
  - **Beschreibung:** Verwalte Workspace-Verzeichnisse für die Unterstützung mehrerer Verzeichnisse.
  - **Unterbefehle:**
    - **`add`**:
      - **Beschreibung:** Fügt ein Verzeichnis zum Workspace hinzu. Der Pfad kann absolut oder relativ zum aktuellen Arbeitsverzeichnis sein. Außerdem wird die Referenzierung vom Home-Verzeichnis aus unterstützt.
      - **Verwendung:** `/directory add <path1>,<path2>`
      - **Hinweis:** In eingeschränkten Sandbox-Profilen deaktiviert. Falls du ein solches Profil verwendest, nutze stattdessen `--include-directories` beim Starten der Sitzung.
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
      - **Beschreibung:** Blendet Tool-Beschreibungen aus und zeigt nur die Tool-Namen an.
    - **`schema`**:
      - **Beschreibung:** Zeigt das vollständige JSON-Schema für die konfigurierten Parameter des Tools an.
  - **Tastenkürzel:** Drücke jederzeit **Strg+T**, um zwischen dem Anzeigen und Ausblenden von Tool-Beschreibungen zu wechseln.

- **`/memory`**
  - **Beschreibung:** Verwalte den instruktiven Kontext der KI (standardmäßig aus `QWEN.md`-Dateien geladener hierarchischer Speicher; konfigurierbar über `contextFileName`).
  - **Unterbefehle:**
    - **`add`**:
      - **Beschreibung:** Fügt den folgenden Text dem Speicher der KI hinzu. Verwendung: `/memory add <zu merkender Text>`
    - **`show`**:
      - **Beschreibung:** Zeigt den vollständigen, zusammengeführten Inhalt des aktuellen hierarchischen Speichers an, der aus allen Kontextdateien (z. B. `QWEN.md`) geladen wurde. So kannst du den instruktiven Kontext überprüfen, der dem Modell zur Verfügung steht.
    - **`refresh`**:
      - **Beschreibung:** Lädt den hierarchischen instruktiven Speicher aus allen Kontextdateien (Standard: `QWEN.md`) neu, die in den konfigurierten Orten (global, Projekt-/Vorgängerordner und Unterverzeichnisse) gefunden wurden. Dadurch wird das Modell mit dem neuesten Kontext aktualisiert.
    - **Hinweis:** Weitere Informationen dazu, wie Kontextdateien zum hierarchischen Speicher beitragen, findest du in der [CLI-Konfigurationsdokumentation](./configuration.md#context-files-hierarchical-instructional-context).

- **`/restore`**
  - **Beschreibung:** Stellt die Projektdateien auf den Zustand vor der Ausführung eines Tools wieder her. Dies ist besonders nützlich, um Dateiänderungen rückgängig zu machen, die von einem Tool vorgenommen wurden. Wird der Befehl ohne eine Tool-Aufruf-ID ausgeführt, werden verfügbare Checkpoints zur Wiederherstellung aufgelistet.
  - **Verwendung:** `/restore [tool_call_id]`
  - **Hinweis:** Nur verfügbar, wenn die CLI mit der Option `--checkpointing` aufgerufen wurde oder über [Einstellungen](./configuration.md) konfiguriert ist. Weitere Informationen findest du in der [Checkpointing-Dokumentation](../checkpointing.md).

- **`/settings`**
  - **Beschreibung:** Öffnet den Einstellungseditor, um Qwen Code-Einstellungen anzuzeigen und zu ändern.
  - **Details:** Dieser Befehl bietet eine benutzerfreundliche Oberfläche zum Ändern von Einstellungen, die das Verhalten und Aussehen von Qwen Code steuern. Er entspricht dem manuellen Bearbeiten der `.qwen/settings.json`-Datei, bietet aber Validierung und Anleitung, um Fehler zu vermeiden.
  - **Verwendung:** Führe einfach `/settings` aus, und der Editor öffnet sich. Du kannst dann nach bestimmten Einstellungen suchen, ihre aktuellen Werte anzeigen und sie nach Belieben ändern. Änderungen an einigen Einstellungen werden sofort übernommen, andere erfordern einen Neustart.

- **`/stats`**
  - **Beschreibung:** Zeigt detaillierte Statistiken zur aktuellen Qwen Code-Sitzung an, darunter Token-Nutzung, eingesparte gecachte Tokens (falls verfügbar) und Sitzungsdauer. Hinweis: Informationen zu gecachten Tokens werden nur angezeigt, wenn diese tatsächlich verwendet werden – dies geschieht derzeit nur bei Authentifizierung mit API-Schlüssel, nicht jedoch bei OAuth.

- [**`/theme`**](./themes.md)
  - **Beschreibung:** Öffnet einen Dialog, in dem du das visuelle Theme von Qwen Code ändern kannst.

- **`/auth`**
  - **Beschreibung:** Öffnet einen Dialog, in dem du die Authentifizierungsmethode ändern kannst.

- **`/about`**
  - **Beschreibung:** Zeigt Versionsinformationen an. Bitte teile diese Informationen mit, wenn du ein Issue meldest.

- [**`/tools`**](../tools/index.md)
  - **Beschreibung:** Zeigt eine Liste der aktuell in Qwen Code verfügbaren Tools an.
  - **Unterbefehle:**
    - **`desc`** oder **`descriptions`**:
      - **Beschreibung:** Zeigt detaillierte Beschreibungen jedes Tools an, einschließlich des Namens und der vollständigen Beschreibung, wie sie dem Modell bereitgestellt wird.
    - **`nodesc`** oder **`nodescriptions`**:
      - **Beschreibung:** Blendet Tool-Beschreibungen aus und zeigt nur die Tool-Namen an.

- **`/privacy`**
  - **Beschreibung:** Zeigt den Datenschutzhinweis an und ermöglicht es Benutzern, auszuwählen, ob sie der Erfassung ihrer Daten zur Verbesserung des Dienstes zustimmen.

- **`/quit`** (oder **`/exit`**)
  - **Beschreibung:** Beendet Qwen Code.

- **`/vim`**
  - **Beschreibung:** Schaltet den Vim-Modus ein oder aus. Wenn der Vim-Modus aktiviert ist, unterstützt der Eingabebereich vim-ähnliche Navigations- und Bearbeitungsbefehle sowohl im NORMAL- als auch im INSERT-Modus.
  - **Funktionen:**
    - **NORMAL-Modus:** Navigation mit `h`, `j`, `k`, `l`; Wortweise Springen mit `w`, `b`, `e`; zum Zeilenanfang/-ende mit `0`, `$`, `^`; zu bestimmten Zeilen mit `G` (oder `gg` für die erste Zeile)
    - **INSERT-Modus:** Standard-Texteingabe mit Escape zum Zurückkehren in den NORMAL-Modus
    - **Bearbeitungsbefehle:** Löschen mit `x`, Ändern mit `c`, Einfügen mit `i`, `a`, `o`, `O`; komplexe Operationen wie `dd`, `cc`, `dw`, `cw`
    - **Zählerunterstützung:** Befehle mit Zahlen als Präfix (z. B. `3h`, `5w`, `10G`)
    - **Letzten Befehl wiederholen:** Mit `.` wird die letzte Bearbeitungsoperation wiederholt
    - **Persistente Einstellung:** Die Vim-Modus-Einstellung wird in `~/.qwen/settings.json` gespeichert und zwischen Sitzungen wiederhergestellt
  - **Statusanzeige:** Wenn aktiviert, wird `[NORMAL]` oder `[INSERT]` in der Fußzeile angezeigt

- **`/init`**
  - **Beschreibung:** Analysiert das aktuelle Verzeichnis und erstellt standardmäßig eine `QWEN.md`-Kontextdatei (oder den durch `contextFileName` festgelegten Dateinamen). Falls bereits eine nicht-leere Datei existiert, werden keine Änderungen vorgenommen. Der Befehl erstellt eine leere Datei und fordert das Modell auf, sie mit projektspezifischen Anweisungen zu füllen.

### Benutzerdefinierte Befehle

Für einen schnellen Einstieg siehe das [Beispiel](#example-a-pure-function-refactoring-command) unten.

Benutzerdefinierte Befehle ermöglichen es dir, deine favorisierten oder am häufigsten verwendeten Prompts als persönliche Shortcuts innerhalb von Qwen Code zu speichern und wiederzuverwenden. Du kannst Befehle erstellen, die spezifisch für ein einzelnes Projekt sind, oder Befehle, die global in allen deinen Projekten verfügbar sind – so wird dein Workflow optimiert und die Konsistenz gewährleistet.

#### Dateispeicherorte & Priorität

Qwen Code erkennt Befehle aus zwei Speicherorten, die in einer bestimmten Reihenfolge geladen werden:

1. **Benutzerbefehle (Global):** Befinden sich in `~/.qwen/commands/`. Diese Befehle sind in jedem Projekt verfügbar, an dem du arbeitest.
2. **Projektbefehle (Lokal):** Befinden sich in `<your-project-root>/.qwen/commands/`. Diese Befehle sind spezifisch für das aktuelle Projekt und können in die Versionskontrolle eingecheckt werden, um sie mit deinem Team zu teilen.

Wenn ein Befehl im Projektverzeichnis denselben Namen wie ein Befehl im Benutzerverzeichnis hat, wird **immer der Projektbefehl verwendet**. Dadurch können Projekte globale Befehle mit projektspezifischen Versionen überschreiben.

#### Benennung und Namespacing

Der Name eines Befehls ergibt sich aus seinem Dateipfad relativ zum `commands`-Verzeichnis. Unterverzeichnisse dienen zur Erstellung von namespaced Befehlen, wobei der Pfadtrenner (`/` oder `\`) in einen Doppelpunkt (`:`) umgewandelt wird.

- Eine Datei unter `~/.qwen/commands/test.toml` wird zum Befehl `/test`.
- Eine Datei unter `<project>/.qwen/commands/git/commit.toml` wird zum namespaced Befehl `/git:commit`.

#### TOML-Dateiformat (v1)

Deine Befehlsdefinitionsdateien müssen im TOML-Format geschrieben und mit der Dateiendung `.toml` versehen werden.

##### Erforderliche Felder

- `prompt` (String): Der Prompt, der beim Ausführen des Befehls an das Modell gesendet wird. Dies kann ein einzeiliger oder mehrzeiliger String sein.

##### Optionale Felder

- `description` (String): Eine kurze, einzeilige Beschreibung dessen, was der Befehl bewirkt. Dieser Text wird neben deinem Befehl im `/help`-Menü angezeigt. **Falls du dieses Feld auslässt, wird automatisch eine generische Beschreibung aus dem Dateinamen erzeugt.**

#### Umgang mit Argumenten

Benutzerdefinierte Befehle unterstützen zwei leistungsstarke und einfach zu verwendende Methoden für den Umgang mit Argumenten. Die CLI wählt automatisch die richtige Methode basierend auf dem Inhalt des `prompt` deines Befehls aus.

##### 1. Kurzform-Injektion mit `{{args}}`

Wenn dein `prompt` den speziellen Platzhalter `{{args}}` enthält, ersetzt die CLI diesen genauen Platzhalter durch den gesamten Text, den der Benutzer nach dem Befehlsnamen eingegeben hat. Dies ist ideal für einfache, deterministische Befehle, bei denen du die Benutzereingabe an einer bestimmten Stelle in eine größere Prompt-Vorlage einfügen musst.

**Beispiel (`git/fix.toml`):**

```toml

# In: ~/.qwen/commands/git/fix.toml

```markdown
# Aufgerufen via: /git:fix "Button ist auf Mobilgeräten falsch ausgerichtet"

description = "Erzeugt einen Fix für ein gegebenes GitHub-Issue."
prompt = "Bitte analysiere die gestageten Git-Änderungen und stelle einen Code-Fix für das hier beschriebene Problem bereit: {{args}}."
```

Das Modell erhält den finalen Prompt: `Bitte analysiere die gestageten Git-Änderungen und stelle einen Code-Fix für das hier beschriebene Problem bereit: "Button ist auf Mobilgeräten falsch ausgerichtet".`
```

##### 2. Standardargument-Verarbeitung

Falls dein `prompt` den speziellen Platzhalter `{{args}}` **nicht** enthält, verwendet die CLI ein Standardverhalten zur Verarbeitung von Argumenten.

Wenn du der Kommandozeile Argumente übergibst (z. B. `/mycommand arg1`), wird die CLI den vollständigen Befehl, den du eingegeben hast, am Ende des Prompts anfügen, getrennt durch zwei Zeilenumbrüche. Dadurch kann das Modell sowohl die ursprünglichen Anweisungen als auch die spezifischen Argumente sehen, die du gerade übergeben hast.

Falls du **keine** Argumente übergibst (z. B. `/mycommand`), wird der Prompt exakt so, wie er ist, an das Modell gesendet – ohne etwas anzuhängen.

**Beispiel (`changelog.toml`):**

Dieses Beispiel zeigt, wie du einen robusten Befehl erstellst, indem du eine Rolle für das Modell definierst, erklärst, wo es die Benutzereingabe findet, und das erwartete Format sowie das Verhalten festlegst.

```toml

# In: <project>/.qwen/commands/changelog.toml

# Aufgerufen via: /changelog 1.2.0 added "Support for default argument parsing."

description = "Fügt einen neuen Eintrag zur CHANGELOG.md-Datei des Projekts hinzu."
prompt = """

# Aufgabe: Changelog aktualisieren

Du bist ein erfahrener Maintainer dieses Softwareprojekts. Ein Benutzer hat einen Befehl aufgerufen, um einen neuen Eintrag zum Changelog hinzuzufügen.

**Der rohe Befehl des Benutzers wird unterhalb deiner Anweisungen angehängt.**

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

Du kannst deine Befehle dynamisch gestalten, indem du Shell-Befehle direkt innerhalb deines `prompt` ausführst und deren Ausgabe einfügst. Das ist ideal, um Kontext aus deiner lokalen Umgebung zu sammeln, wie z. B. den Inhalt einer Datei zu lesen oder den Status eines Git-Repositories abzufragen.

Wenn ein benutzerdefinierter Befehl versucht, einen Shell-Befehl auszuführen, fordert Qwen Code dich nun zur Bestätigung auf, bevor der Befehl ausgeführt wird. Dies ist eine Sicherheitsmaßnahme, um sicherzustellen, dass nur beabsichtigte Befehle ausgeführt werden können.

**So funktioniert's:**

1.  **Befehle einfügen:** Verwende die `!{...}`-Syntax in deinem `prompt`, um anzugeben, wo der Befehl ausgeführt werden soll und wohin die Ausgabe eingefügt werden soll.
2.  **Ausführung bestätigen:** Beim Ausführen des Befehls erscheint ein Dialog, der die Shell-Befehle auflistet, die der Prompt ausführen möchte.
3.  **Berechtigung erteilen:** Du kannst wählen zwischen:
    - **Einmal erlauben:** Der Befehl bzw. die Befehle werden nur dieses eine Mal ausgeführt.
    - **Immer erlauben (für diese Session):** Der Befehl bzw. die Befehle werden für die aktuelle CLI-Session temporär auf eine Allowlist gesetzt und benötigen keine weitere Bestätigung.
    - **Nein:** Die Ausführung der Shell-Befehle wird abgebrochen.

Die CLI berücksichtigt weiterhin die globalen Einstellungen `excludeTools` und `coreTools`. Ein Befehl wird ohne Rückfrage blockiert, wenn er in der Konfiguration explizit deaktiviert wurde.

**Beispiel (`git/commit.toml`):**

Dieser Befehl ruft den gestagten Git-Diff ab und verwendet ihn, um das Modell eine Commit-Nachricht schreiben zu lassen.

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

```

Wenn du `/git:commit` ausführst, führt die CLI zuerst `git diff --staged` aus, ersetzt dann `!{git diff --staged}` mit der Ausgabe dieses Befehls, bevor sie den finalen, vollständigen Prompt an das Modell sendet.

---

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
2. Eine kurze Erklärung der wichtigsten Änderungen, die du vorgenommen hast, und warum diese zur Reinheit beitragen.
"""

**3. Führe den Befehl aus:**

Das war's! Du kannst jetzt deinen Befehl in der CLI ausführen. Zuerst fügst du möglicherweise eine Datei zum Kontext hinzu und rufst dann deinen Befehl auf:

```
> @my-messy-function.js
> /refactor:pure
```

Qwen Code führt dann die mehrzeilige Eingabeaufforderung aus, die in deiner TOML-Datei definiert ist.
```

## At-Befehle (`@`)

At-Befehle werden verwendet, um den Inhalt von Dateien oder Verzeichnissen als Teil deines Prompts an das Modell zu übergeben. Diese Befehle beinhalten git-aware Filtering.

- **`@<Pfad_zu_Datei_oder_Verzeichnis>`**
  - **Beschreibung:** Fügt den Inhalt der angegebenen Datei oder mehrerer Dateien in deinen aktuellen Prompt ein. Das ist nützlich, um Fragen zu spezifischem Code, Text oder ganzen Dateisammlungen zu stellen.
  - **Beispiele:**
    - `@path/to/your/file.txt Erkläre diesen Text.`
    - `@src/my_project/ Fasse den Code in diesem Verzeichnis zusammen.`
    - `Worum geht es in dieser Datei? @README.md`
  - **Details:**
    - Wenn ein Pfad zu einer einzelnen Datei angegeben wird, wird deren Inhalt eingelesen.
    - Wird ein Verzeichnispfad angegeben, versucht der Befehl, den Inhalt aller Dateien innerhalb dieses Verzeichnisses und seiner Unterverzeichnisse einzulesen.
    - Leerzeichen in Pfaden müssen mit einem Backslash maskiert werden (z. B. `@Meine\ Dokumente/datei.txt`).
    - Intern verwendet der Befehl das `read_many_files`-Tool. Der Inhalt wird abgerufen und dann in deinen Prompt eingefügt, bevor er an das Modell gesendet wird.
    - **Git-aware Filtering:** Standardmäßig werden git-ignorierte Dateien (wie `node_modules/`, `dist/`, `.env`, `.git/`) ausgeschlossen. Dieses Verhalten kann über die `fileFiltering`-Einstellungen angepasst werden.
    - **Dateitypen:** Der Befehl ist für textbasierte Dateien gedacht. Auch wenn versucht wird, beliebige Dateien einzulesen, könnten binäre oder sehr große Dateien vom zugrunde liegenden `read_many_files`-Tool übersprungen oder gekürzt werden, um Performance und Relevanz sicherzustellen. Das Tool zeigt an, wenn Dateien übersprungen wurden.
  - **Ausgabe:** Die CLI zeigt eine Tool-Aufruf-Nachricht an, die angibt, dass `read_many_files` verwendet wurde, sowie eine Meldung mit Statusinformationen und den verarbeiteten Pfaden.

- **`@` (Alleinstehendes @-Symbol)**
  - **Beschreibung:** Wird nur ein `@`-Symbol ohne Pfad eingegeben, wird der Prompt unverändert an das Modell weitergeleitet. Das kann nützlich sein, wenn du im Prompt explizit über das `@`-Symbol selbst sprichst.

### Fehlerbehandlung für `@`-Befehle

- Wenn der nach `@` angegebene Pfad nicht gefunden wird oder ungültig ist, wird eine Fehlermeldung angezeigt, und die Abfrage wird möglicherweise nicht an das Modell gesendet oder ohne den Dateiinhalt gesendet.
- Wenn das `read_many_files`-Tool auf einen Fehler stößt (z. B. Berechtigungsprobleme), wird dies ebenfalls gemeldet.

## Shell-Modus & Passthrough-Befehle (`!`)

Das Präfix `!` ermöglicht es dir, direkt von Qwen Code aus mit der Shell deines Systems zu interagieren.

- **`!<shell_command>`**
  - **Beschreibung:** Führt den angegebenen `<shell_command>` mit `bash` unter Linux/macOS oder `cmd.exe` unter Windows aus. Jegliche Ausgaben oder Fehler des Befehls werden im Terminal angezeigt.
  - **Beispiele:**
    - `!ls -la` (führt `ls -la` aus und kehrt zu Qwen Code zurück)
    - `!git status` (führt `git status` aus und kehrt zu Qwen Code zurück)

- **`!` (Shell-Modus umschalten)**
  - **Beschreibung:** Die Eingabe von `!` allein schaltet den Shell-Modus um.
    - **Shell-Modus aktivieren:**
      - Im aktiven Zustand verwendet der Shell-Modus eine andere Farbgebung und zeigt einen "Shell Mode Indicator" an.
      - Während des Shell-Modus wird der eingegebene Text direkt als Shell-Befehl interpretiert.
    - **Shell-Modus verlassen:**
      - Beim Verlassen kehrt die Benutzeroberfläche zu ihrem Standard-Aussehen zurück und das normale Verhalten von Qwen Code wird fortgesetzt.

- **Vorsicht bei der Verwendung von `!`:** Befehle, die du im Shell-Modus ausführst, haben dieselben Berechtigungen und Auswirkungen, als würdest du sie direkt in deinem Terminal ausführen.

- **Umgebungsvariable:** Wenn ein Befehl über `!` oder im Shell-Modus ausgeführt wird, wird die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Unterprozesses gesetzt. Dies erlaubt Skripten oder Tools zu erkennen, ob sie aus der CLI heraus gestartet wurden.