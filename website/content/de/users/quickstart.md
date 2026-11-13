# Schnellstart

> 👏 Willkommen bei Qwen Code!

Diese Schnellstart-Anleitung bringt dich in nur wenigen Minuten dazu, KI-gestützte Code-Unterstützung zu nutzen. Am Ende wirst du verstehen, wie du Qwen Code für typische Entwicklungsaufgaben einsetzt.

## **Bevor du beginnst**

Stelle sicher, dass du Folgendes hast:

- Ein offenes Terminal oder eine Eingabeaufforderung
- Ein Code-Projekt, mit dem du arbeiten kannst
- **Eines der Folgenden**:
  - Ein Qwen-Konto mit einem **Plus- oder Pro-Abo** von [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli), das den Zugriff auf **Qwen Code und Agent** freischaltet
  - Ein API-Schlüssel oder ein Token Plan-Abo von Qianwen AI Platform / **QwenCloud** ([China](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) / [International](https://docs.qwencloud.com/developer-guides/administration/api-keys)) — die empfohlene Einrichtung
  - Ein API-Schlüssel von **Alibaba Cloud ModelStudio** ([Peking](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/))
  - Ein **Alibaba Cloud Token Plan**-Abo ([Peking](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model))

## Schritt 1: Qwen Code installieren

Verwende eine der folgenden Methoden, um Qwen Code zu installieren:

### Schnellinstallation (empfohlen)

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
> Es wird empfohlen, das Terminal nach der Installation neu zu starten, damit die Umgebungsvariablen übernommen werden.

### Manuelle Installation

**Voraussetzungen**

Stelle sicher, dass Node.js 22 oder neuer installiert ist. Lade es von [nodejs.org](https://nodejs.org/en/download) herunter.

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Schritt 2: Authentifizierung einrichten

Wenn du eine interaktive Sitzung mit dem Befehl `qwen` startest, wirst du aufgefordert, die Authentifizierung zu konfigurieren:

```bash
# You'll be prompted to set up authentication on first use
qwen
```

```bash
# Or run /auth anytime to change authentication method
/auth
```

Das Menü beim ersten Start ermöglicht es dir, einen Modellanbieter zu verbinden. Wähle eines der Folgenden:

- [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) — Melde dich mit deinem Qwen-Konto an, um über dein **Plus- oder Pro-Abo** auf **Qwen Code and Agent** zuzugreifen. Wenn du noch kein Abo hast, besuche [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli), um Plus oder Pro abzuschließen, kehre dann zu Qwen Code zurück und wähle [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).
- **QwenCloud** — die empfohlene Einrichtung. Öffnet ein Untermenü:
  - **Token Plan**: Abo mit monatlichem Kreditkontingent auf einem dedizierten Endpunkt (Personal- und Team-Editionen).
  - **Standard API Key**: Pay-as-you-go, Verbindung mit einem vorhandenen Plattform-API-Schlüssel.

  In beiden Fällen wählst du anschließend die Plattform explizit aus (China oder International), sodass die UI-Sprache nie deinen Endpunkt bestimmt. Details findest du unter [Authentication → Option 2: QwenCloud](./configuration/auth).

- **Alibaba ModelStudio** — öffnet ein Untermenü:
  - **Coding Plan**: Verbinde mit einem Alibaba Cloud Coding Plan API-Schlüssel. Siehe [Authentication](./configuration/auth.md#-option-3-alibaba-cloud-coding-plan) für die Einrichtung.
  - **Token Plan**: nutzungsbasierte Abrechnung mit einem dedizierten Endpunkt, gedacht für Teams und Unternehmen. Siehe den [Token Plan Guide](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) ([intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)) für Einrichtungsanweisungen.
  - **Standard API Key**: Verbinde mit einem vorhandenen API-Key von Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Siehe den API-Einrichtungsleitfaden ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) für Details.
- **Drittanbieter** – Wähle einen integrierten Anbieter (DeepSeek, Grok, MiniMax, Z.AI, Kimi, Idealab, ModelScope, OpenRouter, Requesty und weitere) und verbinde ihn mit einem API-Key.
- **Eigener Anbieter** – Verbinde manuell einen lokalen Server, Proxy oder nicht unterstützten Anbieter.

> [!note]
>
> Qwen Code speichert seine Konfiguration und Anpassungen in `.qwen`-Verzeichnissen: `~/.qwen/` für benutzerweite Einstellungen (z. B. `settings.json`) und globale Custom Commands, und `<project>/.qwen/` für projektspezifische Dateien wie Custom Commands und Summaries.

> [!tip]
>
> Um die Authentifizierung zu konfigurieren, starte Qwen Code und führe `/auth` aus. Mit `/doctor` kannst du jederzeit deine aktuelle Konfiguration überprüfen. Weitere Details findest du auf der Seite [Authentifizierung](./configuration/auth).

## Schritt 3: Starte deine erste Sitzung

Öffne dein Terminal in einem beliebigen Projektverzeichnis und starte Qwen Code:

```bash
# optional
cd /path/to/your/project
# start qwen
qwen
```

Du siehst den Qwen Code-Willkommensbildschirm mit deinen Sitzungsinformationen, letzten Unterhaltungen und aktuellen Updates. Gib `/help` ein, um verfügbare Befehle zu sehen.

## Chatten mit Qwen Code

### Stelle deine erste Frage

Qwen Code analysiert deine Dateien und stellt eine Zusammenfassung bereit. Du kannst auch spezifischere Fragen stellen:

```
explain the folder structure
```

Du kannst Qwen Code auch nach seinen eigenen Fähigkeiten fragen:

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code liest deine Dateien bei Bedarf – du musst den Kontext nicht manuell hinzufügen. Qwen Code hat auch Zugriff auf seine eigene Dokumentation und kann Fragen zu seinen Funktionen und Fähigkeiten beantworten.

### Nimm deine erste Codeänderung vor

Lass uns nun Qwen Code tatsächliche Codierungsaufgaben durchführen lassen. Versuche eine einfache Aufgabe:

```
add a hello world function to the main file
```

Qwen Code wird:

1. Die geeignete Datei finden
2. Dir die vorgeschlagenen Änderungen anzeigen
3. Um deine Genehmigung bitten
4. Die Änderung vornehmen

> [!note]
>
> Qwen Code bittet immer um Erlaubnis, bevor Dateien geändert werden. Du kannst einzelne Änderungen genehmigen oder den Modus "Alle akzeptieren" für eine Sitzung aktivieren.

### Git mit Qwen Code verwenden

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

### Einen Fehler beheben oder eine Funktion hinzufügen

Qwen Code ist im Debugging und bei der Funktionsimplementierung sehr kompetent.

Beschreibe, was du möchtest, in natürlicher Sprache:

```
add input validation to the user registration form
```

Oder behebe vorhandene Probleme:

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code wird:

- Den relevanten Code lokalisieren
- Den Kontext verstehen
- Eine Lösung implementieren
- Tests ausführen, falls verfügbar

### Andere gängige Workflows testen

Es gibt zahlreiche Möglichkeiten, mit Qwen Code zu arbeiten:

**Code refaktorisieren**

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
> **Merken**: Qwen Code ist dein KI-Pair-Programmierer. Sprich mit ihm wie mit einem hilfsbereiten Kollegen – beschreibe, was du erreichen möchtest, und es hilft dir dabei.

## Wichtige Befehle

Hier sind die wichtigsten Befehle für den täglichen Gebrauch:

| Befehl                | Funktion                                         | Beispiel                           |
| --------------------- | ------------------------------------------------ | ---------------------------------- |
| `qwen`               | Qwen Code starten                                   | `qwen`                        |
| `/auth`              | Authentifizierungsmethode ändern (in der Sitzung)   | `/auth`                       |
| `/doctor`            | Aktuelle Authentifizierung und Umgebung prüfen      | `/doctor`                     |
| `/help`              | Hilfeinformationen zu verfügbaren Befehlen anzeigen | `/help` oder `/?`             |
| `/compress`          | Chatverlauf durch Zusammenfassung ersetzen (Tokens sparen) | `/compress`           |
| `/clear`             | Gesprächsverlauf löschen und Kontext freigeben          | `/clear` (Aliase: `reset`, `new`) |
| `/theme`             | Visuelles Design von Qwen Code ändern               | `/theme`                      |
| `/language`          | Spracheinstellungen anzeigen oder ändern            | `/language`                   |
| → `ui [language]`     | UI-Sprache festlegen                             | `/language ui zh-CN`               |
| → `output [language]` | LLM-Ausgabesprache festlegen                     | `/language output Chinese`         |
| `/quit`              | Qwen Code sofort beenden                            | `/quit` oder `/exit`          |

Eine vollständige Liste der Befehle findest du in der [CLI-Referenz](./features/commands).

## Profi-Tipps für Anfänger

**Sei spezifisch bei deinen Anfragen**

- Statt: "den Fehler beheben"
- Versuche: "behebe den Login-Fehler, bei dem Benutzer nach Eingabe falscher Anmeldedaten einen leeren Bildschirm sehen"

**Verwende schrittweise Anweisungen**

- Teile komplexe Aufgaben in Schritte auf:

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Lass Qwen Code zuerst erkunden**

- Bevor du Änderungen vornimmst, lass Qwen Code deinen Code verstehen:

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Spare Zeit mit Shortcuts**

- Drücke `?`, um alle verfügbaren Tastenkombinationen zu sehen
- Verwende Tab für die Befehlsvervollständigung
- Drücke ↑ für die Befehlshistorie
- Gib `/` ein, um alle Slash-Befehle zu sehen

## Hilfe erhalten

- **In Qwen Code**: Gib `/help` ein oder frage „wie kann ich..."
- **Dokumentation**: Du bist schon hier! Durchstöbere weitere Anleitungen
- **Community**: Tritt unserer [GitHub-Diskussion](https://github.com/QwenLM/qwen-code/discussions) bei, um Tipps und Support zu erhalten
