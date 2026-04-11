# Schnellstart

> 👏 Willkommen bei Qwen Code!

Dieser Schnellstart-Guide zeigt dir, wie du in wenigen Minuten mit KI-gestützter Code-Unterstützung arbeitest. Am Ende weißt du, wie du Qwen Code für gängige Entwicklungsaufgaben nutzt.

## Bevor du beginnst

Stelle sicher, dass du:

- ein geöffnetes **Terminal** oder eine Eingabeaufforderung hast
- ein Code-Projekt hast, mit dem du arbeiten kannst
- ein [Qwen Code](https://chat.qwen.ai/auth?mode=register) Konto besitzt

## Schritt 1: Qwen Code installieren

Um Qwen Code zu installieren, verwende eine der folgenden Methoden:

### Schnelle Installation (Empfohlen)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (Als Administrator in CMD ausführen)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> Es wird empfohlen, dein Terminal nach der Installation neu zu starten, damit die Umgebungsvariablen wirksam werden.

### Manuelle Installation

**Voraussetzungen**

Stelle sicher, dass Node.js 20 oder höher installiert ist. Lade es von [nodejs.org](https://nodejs.org/en/download) herunter.

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Schritt 2: Bei deinem Konto anmelden

Für die Nutzung von Qwen Code ist ein Konto erforderlich. Wenn du eine interaktive Session mit dem Befehl `qwen` startest, wirst du zur Anmeldung aufgefordert:

```bash
# You'll be prompted to log in on first use
qwen
```

```bash
# Follow the prompts to log in with your account
/auth
```

Wähle `Qwen OAuth`, melde dich bei deinem Konto an und folge den Anweisungen zur Bestätigung. Nach der Anmeldung werden deine Zugangsdaten gespeichert und du musst dich nicht erneut anmelden.

> [!note]
>
> Wenn du Qwen Code zum ersten Mal mit deinem Qwen Konto authentifizierst, wird automatisch ein Workspace namens `.qwen` für dich erstellt. Dieser Workspace bietet eine zentrale Kostenverfolgung und Verwaltung für die gesamte Qwen Code-Nutzung in deinem Unternehmen.

> [!tip]
>
> Du kannst die Authentifizierung auch direkt über das Terminal konfigurieren, ohne eine Session zu starten, indem du `qwen auth` ausführst. Verwende `qwen auth status`, um jederzeit deine aktuelle Konfiguration zu überprüfen. Weitere Details findest du auf der Seite [Authentifizierung](./configuration/auth).

## Schritt 3: Deine erste Session starten

Öffne dein Terminal in einem beliebigen Projektverzeichnis und starte Qwen Code:

```bash
# optiona
cd /path/to/your/project
# start qwen
qwen
```

Du siehst den Qwen Code Willkommensbildschirm mit deinen Session-Informationen, den letzten Gesprächen und den neuesten Updates. Gib `/help` ein, um verfügbare Befehle anzuzeigen.

## Chatte mit Qwen Code

### Stelle deine erste Frage

Qwen Code analysiert deine Dateien und erstellt eine Zusammenfassung. Du kannst auch spezifischere Fragen stellen:

```
explain the folder structure
```

Du kannst Qwen Code auch nach seinen eigenen Fähigkeiten fragen:

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code liest deine Dateien bei Bedarf – du musst den Kontext nicht manuell hinzufügen. Qwen Code hat außerdem Zugriff auf die eigene Dokumentation und kann Fragen zu seinen Funktionen und Fähigkeiten beantworten.

### Nimm deine erste Code-Änderung vor

Lass uns Qwen Code nun tatsächlich Code schreiben lassen. Probiere eine einfache Aufgabe aus:

```
add a hello world function to the main file
```

Qwen Code wird:

1. Die passende Datei finden
2. Dir die vorgeschlagenen Änderungen anzeigen
3. Dich um Bestätigung bitten
4. Die Änderung vornehmen

> [!note]
>
> Qwen Code fragt immer um Erlaubnis, bevor Dateien geändert werden. Du kannst einzelne Änderungen bestätigen oder für eine Session den Modus „Alle akzeptieren“ aktivieren.

### Git mit Qwen Code nutzen

Qwen Code macht Git-Operationen konversationell:

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

Du kannst auch komplexere Git-Operationen anfordern:

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### Behebe einen Bug oder füge ein Feature hinzu

Qwen Code ist versiert im Debugging und bei der Implementierung von Features.

Beschreibe dein Anliegen in natürlicher Sprache:

```
add input validation to the user registration form
```

Oder behebe bestehende Probleme:

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code wird:

- Den relevanten Code lokalisieren
- Den Kontext verstehen
- Eine Lösung implementieren
- Tests ausführen, falls vorhanden

### Teste weitere gängige Workflows

Es gibt verschiedene Möglichkeiten, mit Qwen Code zu arbeiten:

**Code refactoren**

```
refactor the authentication module to use async/await instead of callbacks
```

**Tests schreiben**

```
write unit tests for the calculator functions
```

**Dokumentation aktualisieren**

```
update the README with installation instructions
```

**Code Review**

```
review my changes and suggest improvements
```

> [!tip]
>
> **Denk daran**: Qwen Code ist dein KI-Pair-Programmierer. Sprich mit ihm wie mit einem hilfsbereiten Kollegen – beschreibe, was du erreichen möchtest, und er hilft dir dabei.

## Wichtige Befehle

Hier sind die wichtigsten Befehle für den täglichen Gebrauch:

| Befehl                | Funktion                                                 | Beispiel                      |
| --------------------- | -------------------------------------------------------- | ----------------------------- |
| `qwen`                | Qwen Code starten                                        | `qwen`                        |
| `/auth`               | Authentifizierungsmethode ändern (in Session)            | `/auth`                       |
| `qwen auth`           | Authentifizierung über das Terminal konfigurieren        | `qwen auth`                   |
| `qwen auth status`    | Aktuellen Authentifizierungsstatus prüfen                | `qwen auth status`            |
| `/help`               | Hilfeinformationen für verfügbare Befehle anzeigen       | `/help` oder `/?`             |
| `/compress`           | Chatverlauf durch Zusammenfassung ersetzen, um Tokens zu sparen | `/compress`                   |
| `/clear`              | Terminalbildschirm leeren                                | `/clear` (Tastenkürzel: `Ctrl+L`) |
| `/theme`              | Visuelles Theme von Qwen Code ändern                     | `/theme`                      |
| `/language`           | Spracheinstellungen anzeigen oder ändern                 | `/language`                   |
| → `ui [language]`     | UI-Sprache festlegen                                     | `/language ui zh-CN`          |
| → `output [language]` | Ausgabesprache des LLM festlegen                         | `/language output Chinese`    |
| `/quit`               | Qwen Code sofort beenden                                 | `/quit` oder `/exit`          |

Eine vollständige Liste der Befehle findest du in der [CLI-Referenz](./features/commands).

## Profi-Tipps für Einsteiger

**Sei präzise bei deinen Anfragen**

- Statt: „fix the bug“
- Besser: „fix the login bug where users see a blank screen after entering wrong credentials“

**Nutze Schritt-für-Schritt-Anweisungen**

- Teile komplexe Aufgaben in Schritte auf:

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Lass Qwen Code zuerst explorieren**

- Bevor du Änderungen vornimmst, lass Qwen Code deinen Code verstehen:

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Spare Zeit mit Tastenkürzeln**

- Drücke `?`, um alle verfügbaren Tastenkürzel anzuzeigen
- Nutze `Tab` für die Befehlsvervollständigung
- Drücke `↑` für den Befehlsverlauf
- Gib `/` ein, um alle Slash-Befehle anzuzeigen

## Hilfe erhalten

- **In Qwen Code**: Gib `/help` ein oder frage „how do I...“
- **Dokumentation**: Du bist hier! Stöbere in weiteren Guides
- **Community**: Tritt unserer [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions) bei, um Tipps und Support zu erhalten