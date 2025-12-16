# Qwen Code Übersicht

> Erfahren Sie mehr über Qwen Code, Qwens agentenbasiertes Coding-Tool, das in Ihrem Terminal lebt und Ihnen dabei hilft, Ideen schneller denn je in Code umzusetzen.

## In 30 Sekunden starten

Voraussetzungen:

- Ein [Qwen Code](https://chat.qwen.ai/auth?mode=register) Konto
- Erfordert [Node.js 20+](https://nodejs.org/zh-cn/download), Sie können `node -v` verwenden, um die Version zu prüfen. Falls nicht installiert, nutzen Sie den folgenden Befehl zur Installation.

### Qwen Code installieren:

**NPM** (empfohlen)

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew** (macOS, Linux)

```bash
brew install qwen-code
```

### Fangen Sie an, Qwen Code zu verwenden:

```bash
cd your-project
qwen
```

Wählen Sie die Authentifizierungsmethode **Qwen OAuth (Free)** aus und folgen Sie den Anweisungen zum Einloggen. Danach können wir damit beginnen, Ihren Code zu verstehen. Probieren Sie einen der folgenden Befehle aus:

```
what does this project do?
```

![](https://gw.alicdn.com/imgextra/i2/O1CN01XoPbZm1CrsZzvMQ6m_!!6000000000135-1-tps-772-646.gif)

Bei der ersten Nutzung werden Sie aufgefordert, sich anzumelden. Das war's schon! [Weiter mit dem Schnellstart (5 Minuten) →](/users/quickstart)

> [!tip]
>
> Im Falle von Problemen finden Sie hier Hilfe unter [Fehlerbehebung](/users/support/troubleshooting).

> [!note]
>
> **Neue VS Code-Erweiterung (Beta)**: Bevorzugen Sie eine grafische Oberfläche? Unsere neue **VS Code-Erweiterung** bietet Ihnen eine benutzerfreundliche, native IDE-Umgebung ohne Kenntnisse im Umgang mit dem Terminal. Installieren Sie sie einfach über den Marketplace und beginnen Sie direkt in Ihrer Seitenleiste mit dem Coden mittels Qwen Code. Suchen Sie im VS Code Marketplace nach **Qwen Code** und laden Sie es herunter.

## Was Qwen Code für dich tut

- **Features aus Beschreibungen erstellen**: Sage Qwen Code in einfachem Sprachstil, was du bauen möchtest. Es wird einen Plan erstellen, den Code schreiben und sicherstellen, dass er funktioniert.
- **Fehler beheben**: Beschreibe einen Fehler oder füge eine Fehlermeldung ein. Qwen Code analysiert deine Codebasis, identifiziert das Problem und implementiert eine Lösung.
- **Durch jede Codebasis navigieren**: Frage alles über die Codebasis deines Teams und erhalte eine durchdachte Antwort. Qwen Code behält den Überblick über die gesamte Projektstruktur, kann aktuelle Informationen aus dem Web abrufen und mit [MCP](/users/features/mcp) Daten aus externen Quellen wie Google Drive, Figma und Slack ziehen.
- **Routineaufgaben automatisieren**: Behebe lästige Lint-Probleme, löse Merge-Konflikte und verfasse Release Notes. All dies lässt sich mit einem einzigen Befehl von deinen Entwicklermaschinen aus erledigen oder automatisch in CI.

## Warum Entwickler Qwen Code lieben

- **Funktioniert in deinem Terminal**: Kein weiteres Chat-Fenster. Keine weitere IDE. Qwen Code trifft dich dort, wo du bereits arbeitest, mit den Tools, die du bereits liebst.
- **Handelt direkt**: Qwen Code kann Dateien direkt bearbeiten, Befehle ausführen und Commits erstellen. Brauchst du mehr? [MCP](/users/features/mcp) ermöglicht es Qwen Code, deine Design-Dokumente in Google Drive zu lesen, deine Tickets in Jira zu aktualisieren oder _deine_ individuellen Entwickler-Tools zu nutzen.
- **Unix-Philosophie**: Qwen Code ist kombinierbar und per Skript steuerbar. `tail -f app.log | qwen -p "Schicke mir eine Slack-Nachricht, wenn du Anomalien im Logstream entdeckst"` _funktioniert_. Dein CI kann `qwen -p "Wenn neue Textzeichenfolgen vorhanden sind, übersetze sie ins Französische und erstelle einen PR zur Überprüfung für @lang-fr-team"` ausführen.