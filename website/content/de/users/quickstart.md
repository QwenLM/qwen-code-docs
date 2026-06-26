# Schnellstart

> 👏 Willkommen bei Qwen Code!

Diese Schnellstartanleitung führt Sie in wenigen Minuten zur Nutzung der KI-gestützten Programmierunterstützung. Am Ende wissen Sie, wie Sie Qwen Code für alltägliche Entwicklungsaufgaben einsetzen.

## Vorbereitung

Stellen Sie sicher, dass Sie Folgendes haben:

- Ein geöffnetes **Terminal** oder eine Eingabeaufforderung
- Ein Code-Projekt, mit dem Sie arbeiten können
- Einen API-Schlüssel von Alibaba Cloud ModelStudio ([Peking](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)) oder ein Abonnement des Alibaba Cloud Coding Plans ([Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index))

## Schritt 1: Qwen Code installieren

Um Qwen Code zu installieren, verwenden Sie eine der folgenden Methoden:

### Schnellinstallation (Empfohlen)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> [!note]
>
> Es wird empfohlen, Ihr Terminal nach der Installation neu zu starten, damit die Umgebungsvariablen wirksam werden.

### Manuelle Installation

**Voraussetzungen**

Stellen Sie sicher, dass Node.js 22 oder höher installiert ist. Laden Sie es von [nodejs.org](https://nodejs.org/en/download) herunter.

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Schritt 2: Authentifizierung einrichten

Wenn Sie eine interaktive Sitzung mit dem Befehl `qwen` starten, werden Sie aufgefordert, die Authentifizierung zu konfigurieren:

```bash
# You'll be prompted to set up authentication on first use
qwen
```

```bash
# Or run /auth anytime to change authentication method
/auth
```

Das Menü beim ersten Start ermöglicht es Ihnen, einen Modellanbieter zu verbinden. Wählen Sie eine der folgenden Optionen:

- **Alibaba ModelStudio** — die empfohlene Einrichtung. Öffnet ein Untermenü:
  - **Coding Plan**: für einzelne Entwickler, mit einem inkludierten wöchentlichen Kontingent und verschiedenen Modelloptionen. Siehe die [Coding Plan-Anleitung](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) für Einrichtungsanweisungen.
  - **Token Plan**: nutzungsbasierte Abrechnung mit einem dedizierten Endpunkt, ausgerichtet auf Teams und Unternehmen.
  - **Standard API Key**: mit einem vorhandenen API-Schlüssel von Alibaba Cloud ModelStudio ([Peking](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)) verbinden. Siehe die API-Einrichtungsanleitung ([Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) für Details.
- **Drittanbieter** — wählen Sie einen integrierten Anbieter (DeepSeek, MiniMax, Z.AI, ModelScope, OpenRouter, Requesty und weitere) und verbinden Sie sich mit einem API-Schlüssel.
- **Eigener Anbieter** — verbinden Sie manuell einen lokalen Server, Proxy oder einen nicht unterstützten Anbieter.

> ⚠️ **Hinweis**: Qwen OAuth wurde am 15. April 2026 eingestellt. Falls Sie zuvor Qwen OAuth verwendet haben, wechseln Sie bitte zu einer der oben genannten Methoden.

> [!note]
>
> Wenn Sie Qwen Code zum ersten Mal mit Ihrem Qwen-Konto authentifizieren, wird automatisch ein Arbeitsbereich namens ".qwen" für Sie erstellt. Dieser Arbeitsbereich bietet eine zentrale Kostenverfolgung und Verwaltung für die gesamte Qwen Code-Nutzung in Ihrer Organisation.

> [!tip]
>
> Um die Authentifizierung zu konfigurieren, starten Sie Qwen Code und führen Sie `/auth` aus. Verwenden Sie `/doctor`, um jederzeit Ihre aktuelle Konfiguration zu überprüfen. Siehe die Seite [Authentifizierung](./configuration/auth) für Details.

## Schritt 3: Starten Sie Ihre erste Sitzung

Öffnen Sie Ihr Terminal in einem beliebigen Projektverzeichnis und starten Sie Qwen Code:

```bash
# optional
cd /path/to/your/project
# start qwen
qwen
```

Sie sehen den Qwen Code-Begrüßungsbildschirm mit Ihren Sitzungsinformationen, letzten Unterhaltungen und neuesten Updates. Geben Sie `/help` für verfügbare Befehle ein.

## Chat mit Qwen Code

### Stellen Sie Ihre erste Frage

Qwen Code analysiert Ihre Dateien und gibt eine Zusammenfassung. Sie können auch spezifischere Fragen stellen:

```
explain the folder structure
```

Sie können Qwen Code auch nach seinen eigenen Fähigkeiten fragen:

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code liest Ihre Dateien nach Bedarf – Sie müssen nicht manuell Kontext hinzufügen. Qwen Code hat auch Zugriff auf seine eigene Dokumentation und kann Fragen zu seinen Funktionen und Fähigkeiten beantworten.

### Machen Sie Ihre erste Code-Änderung

Lassen Sie uns Qwen Code nun echte Programmierarbeit erledigen lassen. Versuchen Sie eine einfache Aufgabe:

```
add a hello world function to the main file
```

Qwen Code wird:

1. Die passende Datei finden
2. Ihnen die vorgeschlagenen Änderungen anzeigen
3. Um Ihre Zustimmung bitten
4. Die Bearbeitung durchführen

> [!note]
>
> Qwen Code bittet immer um Erlaubnis, bevor Dateien geändert werden. Sie können einzelne Änderungen genehmigen oder für eine Sitzung den Modus „Alle akzeptieren“ aktivieren.

### Git mit Qwen Code verwenden

Qwen Code macht Git-Operationen gesprächsbasiert:

```
what files have I changed?
```
```
commit my changes with a descriptive message
```

Sie können auch nach komplexeren Git-Operationen fragen:

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### Einen Fehler beheben oder ein Feature hinzufügen

Qwen Code ist versiert im Debugging und in der Implementierung von Funktionen.

Beschreiben Sie, was Sie möchten, in natürlicher Sprache:

```
add input validation to the user registration form
```

Oder beheben Sie bestehende Probleme:

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code wird:

- Den relevanten Code lokalisieren
- Den Kontext verstehen
- Eine Lösung implementieren
- Tests ausführen, falls verfügbar

### Weitere typische Arbeitsabläufe ausprobieren

Es gibt verschiedene Möglichkeiten, mit Qwen Code zu arbeiten:

**Code umstrukturieren**

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

**Code-Review**

```
review my changes and suggest improvements
```

> [!tip]
>
> **Denken Sie daran**: Qwen Code ist Ihr KI-Pair-Programmierer. Sprechen Sie mit ihm wie mit einem hilfsbereiten Kollegen – beschreiben Sie, was Sie erreichen möchten, und er hilft Ihnen, dorthin zu gelangen.

## Wichtige Befehle

Hier sind die wichtigsten Befehle für den täglichen Gebrauch:

| Befehl              | Funktion                                                                    | Beispiel                      |
| ------------------- | --------------------------------------------------------------------------- | ----------------------------- |
| `qwen`              | Qwen Code starten                                                           | `qwen`                        |
| `/auth`             | Authentifizierungsmethode ändern (in der Sitzung)                           | `/auth`                       |
| `/doctor`           | Aktuelle Authentifizierung und Umgebung prüfen                              | `/doctor`                     |
| `/help`             | Hilfeinformationen zu verfügbaren Befehlen anzeigen                         | `/help` oder `/?`             |
| `/compress`         | Chatverlauf durch Zusammenfassung ersetzen, um Tokens zu sparen             | `/compress`                   |
| `/clear`            | Terminalbildschirminhalt löschen                                            | `/clear` (Tastenkürzel: Strg+L) |
| `/theme`            | Visuelles Thema von Qwen Code ändern                                        | `/theme`                      |
| `/language`         | Spracheinstellungen anzeigen oder ändern                                    | `/language`                   |
| → `ui [language]`   | UI-Sprache festlegen                                                        | `/language ui zh-CN`          |
| → `output [language]` | LLM-Ausgabesprache festlegen                                                | `/language output Chinese`    |
| `/quit`             | Qwen Code sofort beenden                                                    | `/quit` oder `/exit`          |

Lesen Sie die [CLI-Referenz](./features/commands) für eine vollständige Liste der Befehle.

## Profi-Tipps für Einsteiger

**Seien Sie spezifisch in Ihren Anfragen**

- Statt: `fix the bug`
- Versuchen Sie: `fix the login bug where users see a blank screen after entering wrong credentials`

**Verwenden Sie Schritt-für-Schritt-Anleitungen**

- Teilen Sie komplexe Aufgaben in Schritte auf:

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Lassen Sie Qwen Code zuerst erkunden**

- Bevor Sie Änderungen vornehmen, lassen Sie Qwen Code Ihren Code verstehen:

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Sparen Sie Zeit mit Tastenkürzeln**

- Drücken Sie `?`, um alle verfügbaren Tastenkürzel zu sehen.
- Verwenden Sie die Tabulatortaste für die Befehlsvervollständigung.
- Drücken Sie ↑ für den Befehlsverlauf.
- Geben Sie `/` ein, um alle Slash-Befehle anzuzeigen.

## Hilfe bekommen

- **In Qwen Code**: Geben Sie `/help` ein oder fragen Sie „Wie mache ich...“
- **Dokumentation**: Sie sind hier! Stöbern Sie in anderen Anleitungen.
- **Community**: Treten Sie unserer [GitHub-Diskussion](https://github.com/QwenLM/qwen-code/discussions) bei, um Tipps und Unterstützung zu erhalten.
