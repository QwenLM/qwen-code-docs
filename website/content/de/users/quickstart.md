# Schnellstart

> 👏 Willkommen bei Qwen Code!

Diese Kurzanleitung bringt Sie in wenigen Minuten dazu, KI-gestützte Programmierhilfe zu nutzen. Am Ende verstehen Sie, wie Sie Qwen Code für gängige Entwicklungsaufgaben verwenden können.

## Bevor Sie beginnen

Stellen Sie sicher, dass Sie Folgendes haben:

- Ein geöffnetes **Terminal** oder eine Befehlszeile
- Ein Codeprojekt, mit dem Sie arbeiten möchten
- Ein [Qwen Code](https://chat.qwen.ai/auth?mode=register)-Konto

## Schritt 1: Qwen Code installieren

Zur Installation von Qwen Code verwenden Sie eine der folgenden Methoden:

### NPM (empfohlen)

Erfordert [Node.js 20+](https://nodejs.org/download), Sie können `node -v` verwenden, um die Version zu überprüfen. Falls es nicht installiert ist, verwenden Sie den folgenden Befehl zur Installation.

Falls Sie [Node.js oder neuer installiert haben](https://nodejs.org/en/download/):

```sh
npm install -g @qwen-code/qwen-code@latest
```

### Homebrew (macOS, Linux)

```sh
brew install qwen-code
```

## Schritt 2: Melden Sie sich bei Ihrem Konto an

Qwen Code erfordert ein Konto zur Nutzung. Wenn Sie eine interaktive Sitzung mit dem Befehl `qwen` starten, müssen Sie sich anmelden:

```bash

# Sie werden bei der ersten Verwendung zur Anmeldung aufgefordert
qwen
```

```bash

# Folgen Sie den Anweisungen, um sich mit Ihrem Konto anzumelden
/auth
```

Wählen Sie `Qwen OAuth`, melden Sie sich bei Ihrem Konto an und folgen Sie den Anweisungen zur Bestätigung. Sobald Sie angemeldet sind, werden Ihre Zugangsdaten gespeichert und Sie müssen sich nicht erneut anmelden.

> [!note]
>
> Wenn Sie Qwen Code zum ersten Mal mit Ihrem Qwen-Konto authentifizieren, wird automatisch ein Arbeitsbereich namens ".qwen" für Sie erstellt. Dieser Arbeitsbereich bietet zentrale Kostenverfolgung und -verwaltung für alle Qwen Code-Nutzungen in Ihrer Organisation.

> [!tip]
>
> Wenn Sie sich erneut anmelden oder den Account wechseln müssen, verwenden Sie den Befehl `/auth` innerhalb von Qwen Code.

## Schritt 3: Starten Sie Ihre erste Sitzung

Öffnen Sie Ihr Terminal in einem beliebigen Projektverzeichnis und starten Sie Qwen Code:

```bash

# optional
cd /pfad/zu/ihrem/projekt

# start qwen
qwen
```

Sie sehen den Qwen Code-Begrüßungsbildschirm mit Ihren Sitzungsinformationen, aktuellen Gesprächen und neuesten Updates. Geben Sie `/help` ein, um verfügbare Befehle anzuzeigen.

## Chatten Sie mit Qwen Code

### Stellen Sie Ihre erste Frage

Qwen Code analysiert Ihre Dateien und liefert eine Zusammenfassung. Sie können auch gezieltere Fragen stellen:

```
erkläre die Ordnerstruktur
```

Sie können Qwen Code auch nach seinen eigenen Fähigkeiten fragen:

```
was kann Qwen Code tun?
```

> [!note]
>
> Qwen Code liest Ihre Dateien bei Bedarf ein - Sie müssen keinen Kontext manuell hinzufügen. Qwen Code hat auch Zugriff auf seine eigene Dokumentation und kann Fragen zu seinen Funktionen und Fähigkeiten beantworten.

### Führen Sie Ihre erste Codeänderung durch

Lassen Sie Qwen Code nun etwas echtes Programmieren tun. Probieren Sie eine einfache Aufgabe aus:

```
füge eine Hello-World-Funktion zur Hauptdatei hinzu
```

Qwen Code wird:

1. Die geeignete Datei finden
2. Ihnen die vorgeschlagenen Änderungen anzeigen
3. Um Ihre Genehmigung bitten
4. Die Bearbeitung vornehmen

> [!note]
>
> Qwen Code bittet immer um Erlaubnis, bevor Dateien geändert werden. Sie können einzelne Änderungen genehmigen oder den Modus „Alle akzeptieren“ für eine Sitzung aktivieren.

### Verwenden Sie Git mit Qwen Code

Qwen Code macht Git-Operationen unterhaltsam:

```
welche Dateien habe ich geändert?
```

```
commite meine Änderungen mit einer beschreibenden Nachricht
```

Sie können auch komplexere Git-Operationen anfordern:

```
erstelle einen neuen Branch namens feature/quickstart
```

```
zeige mir die letzten 5 Commits
```

```
hilf mir bei der Lösung von Merge-Konflikten
```

### Einen Fehler beheben oder eine Funktion hinzufügen

Qwen Code ist erfahren in der Fehlersuche und Implementierung von Funktionen.

Beschreiben Sie in natürlicher Sprache, was Sie möchten:

```
Eingabevalidierung zum Registrierungsformular für Benutzer hinzufügen
```

Oder bestehende Probleme beheben:

```
Es gibt einen Fehler, bei dem Benutzer leere Formulare absenden können - behebe das
```

Qwen Code wird:

- Den relevanten Code finden
- Den Kontext verstehen
- Eine Lösung implementieren
- Tests ausführen, falls verfügbar

### Andere gängige Workflows ausprobieren

Es gibt zahlreiche Möglichkeiten, mit Qwen Code zu arbeiten:

**Code refaktorisieren**

```
Refaktoriere das Authentifizierungsmodul, um async/await anstelle von Callbacks zu verwenden
```

**Tests schreiben**

```
Schreibe Unittests für die Rechenfunktionen
```

**Dokumentation aktualisieren**

```
Aktualisiere die README mit Installationsanweisungen
```

**Code-Review**

```
Überprüfe meine Änderungen und schlage Verbesserungen vor
```

> [!tip]
>
> **Merke**: Qwen Code ist dein KI-Paarprogrammierer. Spreche mit ihm wie mit einem hilfreichen Kollegen – beschreibe, was du erreichen möchtest, und er wird dir dabei helfen, dorthin zu gelangen.

## Wichtige Befehle

Hier sind die wichtigsten Befehle für den täglichen Gebrauch:

| Befehl                | Funktion                                         | Beispiel                      |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | Qwen Code starten                                | `qwen`                        |
| `/auth`               | Authentifizierungsmethode ändern                 | `/auth`                       |
| `/help`               | Hilfeinformationen zu verfügbaren Befehlen anzeigen | `/help` oder `/?`             |
| `/compress`           | Chatverlauf durch Zusammenfassung ersetzen, um Tokens zu sparen | `/compress`                   |
| `/clear`              | Terminalbildschirminhalt löschen                 | `/clear` (Abkürzung: `Strg+L`) |
| `/theme`              | Visuelles Theme von Qwen Code ändern             | `/theme`                      |
| `/language`           | Spracheinstellungen anzeigen oder ändern         | `/language`                   |
| → `ui [Sprache]`      | Sprache der Benutzeroberfläche festlegen         | `/language ui de-DE`          |
| → `output [Sprache]`  | Ausgabesprache des LLM festlegen                 | `/language output German`     |
| `/quit`               | Qwen Code sofort beenden                         | `/quit` oder `/exit`          |

Eine vollständige Liste aller Befehle finden Sie in der [CLI-Referenz](./features/commands).

## Tipps für Anfänger

**Sei spezifisch mit deinen Anfragen**

- Statt: "behebe den Fehler"
- Versuche: "behebe den Login-Fehler, bei dem Benutzer nach Eingabe falscher Anmeldedaten einen leeren Bildschirm sehen"

**Verwende schrittweise Anweisungen**

- Zerlege komplexe Aufgaben in Schritte:

```
1. erstelle eine neue Datenbanktabelle für Benutzerprofile
2. erstelle einen API-Endpunkt zum Abrufen und Aktualisieren von Benutzerprofilen
3. erstelle eine Webseite, die es Benutzern ermöglicht, ihre Informationen anzusehen und zu bearbeiten
```

**Lass Qwen Code zuerst erkunden**

- Bevor du Änderungen vornimmst, lass Qwen Code deinen Code verstehen:

```
analysiere das Datenbankschema
```

```
erstelle ein Dashboard, das Produkte anzeigt, die am häufigsten von unseren britischen Kunden zurückgegeben werden
```

**Spare Zeit mit Shortcuts**

- Drücke `?`, um alle verfügbaren Tastaturkürzel zu sehen
- Verwende Tab für Befehlsvervollständigung
- Drücke ↑ für Befehlshistorie
- Tippe `/`, um alle Slash-Befehle zu sehen

## Hilfe erhalten

- **In Qwen Code**: Geben Sie `/help` ein oder fragen Sie "wie mache ich..."
- **Dokumentation**: Sie sind hier! Durchsuchen Sie andere Anleitungen
- **Community**: Treten Sie unserer [GitHub-Diskussion](https://github.com/QwenLM/qwen-code/discussions) bei für Tipps und Support