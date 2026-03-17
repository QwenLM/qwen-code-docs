# Schnellstart

> 👏 Willkommen bei Qwen Code!

Diese Schnellstart-Anleitung führt Sie in wenigen Minuten in die Nutzung der KI-gestützten Codierungsunterstützung ein. Am Ende verstehen Sie, wie Sie Qwen Code für gängige Entwicklungs­aufgaben einsetzen.

## Vorbereitung

Stellen Sie sicher, dass Sie Folgendes bereit haben:

- Ein geöffnetes **Terminal** oder eine Eingabeaufforderung
- Ein Codeprojekt, mit dem Sie arbeiten können
- Ein [Qwen Code](https://chat.qwen.ai/auth?mode=register)-Konto

## Schritt 1: Qwen Code installieren

Um Qwen Code zu installieren, verwenden Sie eine der folgenden Methoden:

### Schnellinstallation (empfohlen)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (als Administrator in der Eingabeaufforderung ausführen)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> Nach der Installation wird empfohlen, Ihr Terminal neu zu starten, um sicherzustellen, dass die Umgebungsvariablen wirksam werden.

### Manuelles Installieren

**Voraussetzungen**

Stellen Sie sicher, dass Node.js 20 oder eine neuere Version installiert ist. Laden Sie es von [nodejs.org](https://nodejs.org/de/download) herunter.

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Schritt 2: Melden Sie sich bei Ihrem Konto an

Qwen Code erfordert ein Konto zur Nutzung. Wenn Sie eine interaktive Sitzung mit dem Befehl `qwen` starten, müssen Sie sich anmelden:

```bash
# Bei der ersten Verwendung werden Sie zur Anmeldung aufgefordert
qwen
```

Befolgen Sie die Anweisungen, um sich mit Ihrem Konto anzumelden. Führen Sie `/auth` aus, wählen Sie `Qwen OAuth`, melden Sie sich mit Ihrem Konto an und folgen Sie den Anweisungen zur Bestätigung. Nach der Anmeldung werden Ihre Anmeldedaten gespeichert, sodass Sie sich nicht erneut anmelden müssen.

> [!note]  
>  
> Wenn Sie Qwen Code zum ersten Mal mit Ihrem Qwen-Konto authentifizieren, wird automatisch ein Arbeitsbereich namens „.qwen“ für Sie erstellt. Dieser Arbeitsbereich bietet eine zentrale Kostenverfolgung und -verwaltung für die gesamte Nutzung von Qwen Code in Ihrer Organisation.

> [!tip]  
>  
> Falls Sie sich erneut anmelden oder zu einem anderen Konto wechseln müssen, verwenden Sie den Befehl `/auth` innerhalb von Qwen Code.

## Schritt 3: Starten Sie Ihre erste Sitzung  

Öffnen Sie Ihr Terminal in einem beliebigen Projektverzeichnis und starten Sie Qwen Code:  

```bash  
# Optional  
cd /pfad/zu/ihrem/projekt  

# Qwen starten  
qwen  
```  

Sie sehen den Willkommensbildschirm von Qwen Code mit Ihren Sitzungsinformationen, den letzten Unterhaltungen und den neuesten Updates. Geben Sie `/help` ein, um eine Liste der verfügbaren Befehle anzuzeigen.  

## Chatten Sie mit Qwen Code

### Stellen Sie Ihre erste Frage

Qwen Code analysiert Ihre Dateien und liefert eine Zusammenfassung. Sie können auch gezieltere Fragen stellen:

```
erklären Sie die Ordnerstruktur
```

Sie können Qwen Code zudem nach dessen eigenen Fähigkeiten fragen:

```
was kann Qwen Code tun?
```

> [!note]
>
> Qwen Code liest Ihre Dateien bei Bedarf – Sie müssen keinen Kontext manuell hinzufügen. Qwen Code hat außerdem Zugriff auf eigene Dokumentation und kann Fragen zu seinen Funktionen und Fähigkeiten beantworten.

### Nehmen Sie Ihre erste Codeänderung vor

Lassen Sie Qwen Code nun tatsächlich programmieren. Probieren Sie eine einfache Aufgabe aus:

```
fügen Sie eine „Hello World“-Funktion in die Hauptdatei ein
```

Qwen Code führt folgende Schritte aus:

1. Findet die passende Datei  
2. Zeigt Ihnen die vorgeschlagenen Änderungen  
3. Fragt Ihre Zustimmung ab  
4. Nimmt die Änderung vor  

> [!note]
>
> Qwen Code fragt stets vor einer Dateiänderung um Ihre Erlaubnis. Sie können einzelne Änderungen genehmigen oder für eine Sitzung den Modus „Alle akzeptieren“ aktivieren.

### Git mit Qwen Code verwenden

Qwen Code macht Git-Operationen gesprächsbasiert:

```
Welche Dateien habe ich geändert?
```

```
Commite meine Änderungen mit einer aussagekräftigen Nachricht.
```

Sie können auch komplexere Git-Operationen anfordern:

```
Erstelle einen neuen Branch namens feature/quickstart.
```

```
Zeige mir die letzten 5 Commits.
```

```
Hilf mir dabei, Merge-Konflikte zu lösen.
```

### Einen Fehler beheben oder eine Funktion hinzufügen

Qwen Code ist erfahren im Debuggen und bei der Implementierung neuer Funktionen.

Beschreiben Sie in natürlicher Sprache, was Sie möchten:

```
Füge eine Eingabevalidierung zum Benutzeranmeldeformular hinzu.
```

Oder beheben Sie bestehende Probleme:

```
Es gibt einen Fehler, bei dem Benutzer leere Formulare absenden können – behebe ihn.
```

Qwen Code führt folgende Schritte aus:

- Lokalisiert den relevanten Code
- Versteht den Kontext
- Implementiert eine Lösung
- Führt Tests aus, falls verfügbar

### Testen Sie andere gängige Workflows

Es gibt verschiedene Möglichkeiten, mit Qwen Code zu arbeiten:

**Code refaktorieren**

```
Refaktoriere das Authentifizierungsmodul so, dass es `async`/`await` statt Callbacks verwendet.
```

**Tests schreiben**

```
Schreibe Unit-Tests für die Rechenfunktionen.
```

**Dokumentation aktualisieren**

```
Aktualisiere die README-Datei mit Installationsanweisungen.
```

**Code-Review**

```
Überprüfe meine Änderungen und schlage Verbesserungsvorschläge vor.
```

> [!tip]
>
> **Denken Sie daran**: Qwen Code ist Ihr KI-Pair-Programmierer. Sprechen Sie mit ihm wie mit einem hilfreichen Kollegen – beschreiben Sie, was Sie erreichen möchten, und Qwen Code unterstützt Sie dabei.

## Wichtige Befehle

Hier sind die wichtigsten Befehle für den täglichen Gebrauch:

| Befehl                | Funktion                                         | Beispiel                      |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | Startet Qwen Code                                | `qwen`                        |
| `/auth`               | Ändert die Authentifizierungsmethode             | `/auth`                       |
| `/help`               | Zeigt Hilfetexte zu verfügbaren Befehlen an      | `/help` oder `/?`             |
| `/compress`           | Ersetzt den Chatverlauf durch eine Zusammenfassung, um Tokens zu sparen | `/compress`                   |
| `/clear`              | Löscht den Inhalt des Terminalbildschirms        | `/clear` (Tastenkürzel: `Strg+L`) |
| `/theme`              | Ändert das visuelle Design von Qwen Code         | `/theme`                      |
| `/language`           | Zeigt die Spracheinstellungen an oder ändert sie | `/language`                   |
| → `ui [Sprache]`      | Legt die Sprache der Benutzeroberfläche fest     | `/language ui zh-CN`          |
| → `output [Sprache]`  | Legt die Ausgabesprache des LLM fest             | `/language output Chinesisch` |
| `/quit`               | Beendet Qwen Code sofort                         | `/quit` oder `/exit`          |

Eine vollständige Liste aller Befehle finden Sie in der [CLI-Referenz](./features/commands).

## Tipps für Einsteiger

**Seien Sie bei Ihren Anfragen präzise**

- Statt: „Beheben Sie den Fehler“  
- Versuchen Sie: „Beheben Sie den Anmeldefehler, bei dem Benutzer nach der Eingabe falscher Zugangsdaten einen leeren Bildschirm sehen“

**Verwenden Sie schrittweise Anweisungen**

- Zerlegen Sie komplexe Aufgaben in einzelne Schritte:

```
1. Erstellen Sie eine neue Datenbanktabelle für Benutzerprofile.
2. Erstellen Sie einen API-Endpunkt zum Abrufen und Aktualisieren von Benutzerprofilen.
3. Entwickeln Sie eine Webseite, über die Benutzer ihre Informationen einsehen und bearbeiten können.
```

**Lassen Sie Qwen Code zunächst erkunden**

- Bevor Sie Änderungen vornehmen, lassen Sie Qwen Code Ihren Code verstehen:

```
analysieren Sie das Datenbankschema
```

```
erstellen Sie ein Dashboard, das Produkte anzeigt, die von unseren britischen Kunden am häufigsten zurückgesendet werden
```

**Sparen Sie Zeit mit Tastenkürzeln**

- Drücken Sie `?`, um alle verfügbaren Tastenkürzel anzuzeigen.  
- Verwenden Sie die Tab-Taste für die automatische Vervollständigung von Befehlen.  
- Drücken Sie die Pfeil-nach-oben-Taste (`↑`), um den Befehlsverlauf durchzusehen.  
- Geben Sie `/` ein, um alle Slash-Befehle anzuzeigen.

## Hilfe erhalten

- **In Qwen Code**: Geben Sie `/help` ein oder fragen Sie „Wie mache ich…?“
- **Dokumentation**: Sie sind hier! Durchsuchen Sie andere Anleitungen.
- **Community**: Treten Sie unserer [GitHub-Diskussion](https://github.com/QwenLM/qwen-code/discussions) bei, um Tipps und Unterstützung zu erhalten.