# Schnellstart

> 👏 Willkommen bei Qwen Code!

Diese Schnellstart-Anleitung bringt dich in nur wenigen Minuten dazu, KI-gestützte Code-Unterstützung zu nutzen. Am Ende wirst du verstehen, wie du Qwen Code für typische Entwicklungsaufgaben einsetzt.

## Bevor du beginnst

Stelle sicher, dass du Folgendes hast:

- Ein **Terminal** oder eine Eingabeaufforderung geöffnet
- Ein Code-Projekt, mit dem du arbeiten kannst
- Einen API-Key von Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)) oder ein Alibaba Cloud Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) Abonnement

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
# Du wirst bei der ersten Nutzung zur Authentifizierung aufgefordert
qwen
```

```bash
# Oder führe jederzeit /auth aus, um die Authentifizierungsmethode zu ändern
/auth
```

Das Menü beim ersten Start ermöglicht dir die Verbindung mit einem Modellanbieter. Wähle eine der folgenden Optionen:

- **Alibaba ModelStudio** – die empfohlene Einrichtung. Öffnet ein Untermenü:
  - **Coding Plan**: Für einzelne Entwickler mit einem inkludierten wöchentlichen Kontingent und verschiedenen Modelloptionen. Siehe die [Coding Plan Anleitung](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) für die Einrichtung.
  - **Token Plan**: Nutzungsbasierte Abrechnung mit einem dedizierten Endpunkt, gedacht für Teams und Unternehmen.
  - **Standard API Key**: Verbinde einen vorhandenen API-Key von Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Siehe die API-Einrichtungsanleitung ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) für Details.
- **Drittanbieter** – Wähle einen integrierten Anbieter (DeepSeek, MiniMax, Z.AI, ModelScope, OpenRouter, Requesty und weitere) und verbinde ihn mit einem API-Key.
- **Eigener Anbieter** – Verbinde manuell einen lokalen Server, Proxy oder nicht unterstützten Anbieter.

> ⚠️ **Hinweis**: Qwen OAuth wurde am 15. April 2026 eingestellt. Wenn du zuvor Qwen OAuth verwendet hast, wechsle bitte zu einer der oben genannten Methoden.

> [!note]
>
> Wenn du Qwen Code zum ersten Mal mit deinem Qwen-Konto authentifizierst, wird automatisch ein Arbeitsbereich namens ".qwen" für dich erstellt. Dieser Arbeitsbereich bietet eine zentrale Kostenverfolgung und -verwaltung für die gesamte Qwen Code-Nutzung in deiner Organisation.

> [!tip]
>
> Um die Authentifizierung zu konfigurieren, starte Qwen Code und führe `/auth` aus. Mit `/doctor` kannst du jederzeit deine aktuelle Konfiguration überprüfen. Weitere Details findest du auf der Seite [Authentifizierung](./configuration/auth).

## Schritt 3: Deine erste Sitzung starten

Öffne dein Terminal in einem beliebigen Projektverzeichnis und starte Qwen Code:

```bash
# optional
cd /pfad/zu/deinem/projekt
# qwen starten
qwen
```

Du siehst den Qwen Code-Willkommensbildschirm mit deinen Sitzungsinformationen, letzten Unterhaltungen und aktuellen Updates. Gib `/help` ein, um verfügbare Befehle zu sehen.

## Mit Qwen Code chatten

### Stelle deine erste Frage

Qwen Code analysiert deine Dateien und gibt eine Zusammenfassung. Du kannst auch spezifischere Fragen stellen:

```
erkläre die Ordnerstruktur
```

Du kannst Qwen Code auch nach seinen eigenen Fähigkeiten fragen:

```
was kann Qwen Code?
```

> [!note]
>
> Qwen Code liest deine Dateien bei Bedarf – du musst keinen Kontext manuell hinzufügen. Qwen Code hat außerdem Zugriff auf seine eigene Dokumentation und kann Fragen zu seinen Funktionen und Fähigkeiten beantworten.

### Deine erste Code-Änderung vornehmen

Jetzt lassen wir Qwen Code echte Programmierarbeit erledigen. Versuche eine einfache Aufgabe:

```
füge eine Hallo-Welt-Funktion zur Hauptdatei hinzu
```

Qwen Code wird:

1. Die entsprechende Datei finden
2. Dir die vorgeschlagenen Änderungen anzeigen
3. Dich um Zustimmung bitten
4. Die Bearbeitung durchführen

> [!note]
>
> Qwen Code fragt immer um Erlaubnis, bevor Dateien geändert werden. Du kannst einzelne Änderungen genehmigen oder für eine Sitzung den Modus „Alle akzeptieren" aktivieren.

### Git mit Qwen Code verwenden

Qwen Code macht Git-Operationen gesprächig:

```
welche Dateien habe ich geändert?
```

```
committe meine Änderungen mit einer aussagekräftigen Nachricht
```

Du kannst auch komplexere Git-Operationen anfordern:

```
erzeuge einen neuen Branch namens feature/quickstart
```

```
zeige mir die letzten 5 Commits
```

```
hilf mir, Merge-Konflikte zu lösen
```

### Einen Fehler beheben oder eine Funktion hinzufügen

Qwen Code ist versiert im Debugging und der Implementierung neuer Funktionen.

Beschreibe in natürlicher Sprache, was du möchtest:

```
füge dem Benutzerregistrierungsformular eine Eingabevalidierung hinzu
```

Oder behebe vorhandene Probleme:

```
es gibt einen Fehler, bei dem Benutzer leere Formulare abschicken können – behebe ihn
```

Qwen Code wird:

- Den relevanten Code finden
- Den Kontext verstehen
- Eine Lösung implementieren
- Tests ausführen, falls vorhanden

### Andere typische Arbeitsabläufe testen

Es gibt viele Möglichkeiten, mit Qwen Code zu arbeiten:

**Code umstrukturieren**

```
strukturiere das Authentifizierungsmodul um, sodass es async/await statt Callbacks verwendet
```

**Tests schreiben**

```
schreibe Komponententests für die Rechnerfunktionen
```

**Dokumentation aktualisieren**

```
aktualisiere die README mit Installationsanweisungen
```

**Code-Review**

```
überprüfe meine Änderungen und schlage Verbesserungen vor
```

> [!tip]
>
> **Denk daran**: Qwen Code ist dein KI-basierter Programmierpartner. Sprich mit ihm wie mit einem hilfreichen Kollegen – beschreibe, was du erreichen möchtest, und er wird dir helfen, dorthin zu gelangen.

## Wichtige Befehle

Hier sind die wichtigsten Befehle für die tägliche Nutzung:

| Befehl               | Funktion                                            | Beispiel                      |
| -------------------- | --------------------------------------------------- | ----------------------------- |
| `qwen`               | Qwen Code starten                                   | `qwen`                        |
| `/auth`              | Authentifizierungsmethode ändern (in der Sitzung)   | `/auth`                       |
| `/doctor`            | Aktuelle Authentifizierung und Umgebung prüfen      | `/doctor`                     |
| `/help`              | Hilfeinformationen zu verfügbaren Befehlen anzeigen | `/help` oder `/?`             |
| `/compress`          | Chatverlauf durch Zusammenfassung ersetzen (Tokens sparen) | `/compress`           |
| `/clear`             | Terminal-Bildschirm leeren                          | `/clear` (Shortcut: `Strg+L`) |
| `/theme`             | Visuelles Design von Qwen Code ändern               | `/theme`                      |
| `/language`          | Spracheinstellungen anzeigen oder ändern            | `/language`                   |
| → `ui [Sprache]`     | Sprache der Benutzeroberfläche festlegen            | `/language ui de-DE`          |
| → `output [Sprache]` | Ausgabesprache des LLM festlegen                    | `/language output German`     |
| `/quit`              | Qwen Code sofort beenden                            | `/quit` oder `/exit`          |

Eine vollständige Liste der Befehle findest du in der [CLI-Referenz](./features/commands).

## Tipps für Einsteiger

**Sei präzise in deinen Anfragen**

- Statt: „behebe den Fehler"
- Besser: „behebe den Login-Fehler, bei dem Benutzer nach Eingabe falscher Anmeldedaten einen leeren Bildschirm sehen"

**Verwende Schritt-für-Schritt-Anleitungen**

- Zerlege komplexe Aufgaben in Schritte:

```
1. erstelle eine neue Datenbanktabelle für Benutzerprofile
2. erstelle einen API-Endpunkt, um Benutzerprofile abzurufen und zu aktualisieren
3. erstelle eine Webseite, auf der Benutzer ihre Informationen sehen und bearbeiten können
```

**Lass Qwen Code zuerst erkunden**

- Bevor du Änderungen vornimmst, lass Qwen Code deinen Code verstehen:

```
analysiere das Datenbankschema
```

```
erzeuge ein Dashboard, das die Produkte anzeigt, die am häufigsten von unseren UK-Kunden zurückgegeben werden
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