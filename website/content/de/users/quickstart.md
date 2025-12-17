# Schnellstart

> 👏 Willkommen bei Qwen Code!

Diese Schnellstart-Anleitung zeigt Ihnen in nur wenigen Minuten, wie Sie KI-gestützte Programmierhilfe nutzen können. Am Ende werden Sie verstehen, wie Sie Qwen Code für gängige Entwicklungsaufgaben verwenden können.

## Bevor Sie beginnen

Stellen Sie sicher, dass Sie Folgendes haben:

- Ein **Terminal** oder eine Eingabeaufforderung geöffnet
- Ein Code-Projekt, mit dem Sie arbeiten können
- Ein [Qwen Code](https://chat.qwen.ai/auth?mode=register)-Konto

## Schritt 1: Qwen Code installieren

Um Qwen Code zu installieren, verwenden Sie eine der folgenden Methoden:

### NPM (empfohlen)

Erfordert [Node.js 20+](https://nodejs.org/download). Sie können mit `node -v` die Version prüfen. Falls nicht installiert, verwenden Sie den folgenden Befehl zur Installation.

Wenn Sie [Node.js oder neuer installiert haben](https://nodejs.org/en/download/):

```sh
npm install -g @qwen-code/qwen-code@latest
```

### Homebrew (macOS, Linux)

```sh
brew install qwen-code
```

## Schritt 2: Anmelden bei Ihrem Konto

Qwen Code benötigt ein Konto zur Nutzung. Wenn Sie eine interaktive Sitzung mit dem Befehl `qwen` starten, müssen Sie sich anmelden:

```bash

# Bei der ersten Verwendung werden Sie zur Anmeldung aufgefordert
qwen
```

```bash

# Folgen Sie den Aufforderungen, um sich mit Ihrem Konto anzumelden
/auth
```

Wählen Sie `Qwen OAuth`, melden Sie sich bei Ihrem Konto an und folgen Sie den Aufforderungen zur Bestätigung. Sobald Sie angemeldet sind, werden Ihre Anmeldeinformationen gespeichert und Sie müssen sich nicht erneut anmelden.

> [!note]
>
> Wenn Sie Qwen Code zum ersten Mal mit Ihrem Qwen-Konto authentifizieren, wird automatisch ein Arbeitsbereich namens „.qwen“ für Sie erstellt. Dieser Arbeitsbereich bietet eine zentrale Kostenverfolgung und -verwaltung für alle Qwen Code-Nutzungen in Ihrer Organisation.

> [!tip]
>
> Wenn Sie sich erneut anmelden oder das Konto wechseln müssen, verwenden Sie den Befehl `/auth` innerhalb von Qwen Code.

## Schritt 3: Starten Sie Ihre erste Sitzung

Öffnen Sie Ihr Terminal in einem beliebigen Projektverzeichnis und starten Sie Qwen Code:

```bash

# optional
cd /path/to/your/project```

# qwen starten
qwen
```

Du siehst den Qwen Code-Willkommensbildschirm mit deinen Sitzungsinformationen, aktuellen Unterhaltungen und neuesten Updates. Gib `/help` ein, um verfügbare Befehle zu sehen.

## Mit Qwen Code chatten

### Stelle deine erste Frage

Qwen Code analysiert deine Dateien und gibt eine Zusammenfassung aus. Du kannst auch spezifischere Fragen stellen:

```
erkläre die Ordnerstruktur
```

Du kannst Qwen Code auch nach seinen eigenen Fähigkeiten fragen:

```
was kann Qwen Code tun?
```

> [!note]
>
> Qwen Code liest deine Dateien bei Bedarf – du musst den Kontext nicht manuell hinzufügen. Qwen Code hat außerdem Zugriff auf seine eigene Dokumentation und kann Fragen zu seinen Funktionen und Möglichkeiten beantworten.

### Machen Sie Ihre erste Codeänderung

Lassen Sie uns nun Qwen Code einige tatsächliche Codierungen durchführen lassen. Versuchen Sie eine einfache Aufgabe:

```
füge eine Hello-World-Funktion zur Hauptdatei hinzu
```

Qwen Code wird:

1. Die geeignete Datei finden
2. Ihnen die vorgeschlagenen Änderungen anzeigen
3. Um Ihre Zustimmung bitten
4. Die Bearbeitung vornehmen

> [!note]
>
> Qwen Code bittet immer um Erlaubnis, bevor Dateien geändert werden. Sie können einzelne Änderungen genehmigen oder den Modus „Alle akzeptieren“ für eine Sitzung aktivieren.

### Verwenden Sie Git mit Qwen Code

Qwen Code macht Git-Operationen zu einem Gespräch:

```
welche Dateien habe ich geändert?
```

```
commite meine Änderungen mit einer beschreibenden Nachricht
```

Sie können auch Eingaben für komplexere Git-Operationen machen:

```
erstelle einen neuen Branch namens feature/quickstart
```

```
zeige mir die letzten 5 Commits
```

```
hilf mir bei der Lösung von Merge-Konflikten
```

### Einen Fehler beheben oder ein Feature hinzufügen

Qwen Code ist erfahren im Debugging und bei der Implementierung von Funktionen.

Beschreiben Sie, was Sie möchten, in natürlicher Sprache:

```
Füge eine Eingabevalidierung zum Registrierungsformular für Benutzer hinzu
```

Oder beheben Sie bestehende Probleme:

```
Es gibt einen Fehler, bei dem Benutzer leere Formulare absenden können – behebe das
```

Qwen Code wird:

- Den relevanten Code lokalisieren
- Den Kontext verstehen
- Eine Lösung implementieren
- Tests ausführen, falls verfügbar

### Teste andere gängige Workflows

Es gibt verschiedene Möglichkeiten, mit Claude zu arbeiten:

**Code refaktorisieren**

```
refaktorisiere das Authentifizierungsmodul, um async/await anstelle von Callbacks zu verwenden
```

**Tests schreiben**

```
schreibe Unit-Tests für die Taschenrechnerfunktionen
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
> **Denke daran**: Qwen Code ist dein KI-Pair-Programmierer. Sprich ihn so an, wie du es mit einem hilfsbereiten Kollegen tun würdest – beschreibe, was du erreichen möchtest, und er wird dir dabei helfen.

## Wichtige Befehle

Hier sind die wichtigsten Befehle für den täglichen Gebrauch:

| Befehl                | Was er bewirkt                                    | Beispiel                      |
| --------------------- | ------------------------------------------------- | ----------------------------- |
| `qwen`                | Qwen Code starten                                 | `qwen`                        |
| `/auth`               | Authentifizierungsmethode ändern                  | `/auth`                       |
| `/help`               | Hilfeinformationen zu verfügbaren Befehlen anzeigen | `/help` oder `/?`             |
| `/compress`           | Chatverlauf durch Zusammenfassung ersetzen, um Tokens zu sparen | `/compress`                   |
| `/clear`              | Inhalt des Terminalbildschirms löschen            | `/clear` (Tastenkürzel: `Strg+L`) |
| `/theme`              | Visuelles Theme von Qwen Code ändern              | `/theme`                      |
| `/language`           | Spracheinstellungen anzeigen oder ändern          | `/language`                   |
| → `ui [Sprache]`      | Sprache der Benutzeroberfläche festlegen          | `/language ui zh-CN`          |
| → `output [Sprache]`  | Ausgabesprache des LLM festlegen                  | `/language output Chinesisch` |
| `/quit`               | Qwen Code sofort beenden                          | `/quit` oder `/exit`          |

Eine vollständige Liste der Befehle findest du in der [CLI-Referenz](./features/commands).

## Profi-Tipps für Anfänger

**Sei spezifisch bei deinen Anfragen**

- Anstatt: „behebe den Fehler“
- Versuche: „behebe den Login-Fehler, bei dem Benutzer nach der Eingabe falscher Anmeldedaten einen leeren Bildschirm sehen“

**Verwende Schritt-für-Schritt-Anweisungen**

- Zerlege komplexe Aufgaben in einzelne Schritte:

```
1. eine neue Datenbanktabelle für Benutzerprofile erstellen
2. einen API-Endpunkt zum Abrufen und Aktualisieren von Benutzerprofilen erstellen
3. eine Webseite erstellen, auf der Benutzer ihre Informationen anzeigen und bearbeiten können
```

**Lass Qwen Code zuerst erkunden**

- Bevor du Änderungen vornimmst, lass Qwen Code deinen Code verstehen:

```
analysiere das Datenbankschema
```

```
erstelle ein Dashboard, das die Produkte anzeigt, die am häufigsten von unseren Kunden im Vereinigten Königreich zurückgegeben werden
```

**Spare Zeit mit Shortcuts**

- Drücke `?`, um alle verfügbaren Tastaturkürzel anzuzeigen
- Verwende Tab zur Befehlsvervollständigung
- Drücke ↑, um den Befehlsverlauf abzurufen
- Gib `/` ein, um alle Slash-Befehle anzuzeigen

## Hilfe erhalten

- **In Qwen Code**: Gib `/help` ein oder frage „wie mache ich...“
- **Dokumentation**: Du bist hier! Durchsuche andere Anleitungen
- **Community**: Tritt unserer [GitHub-Diskussion](https://github.com/QwenLM/qwen-code/discussions) für Tipps und Support bei