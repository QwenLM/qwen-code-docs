# Qwen Code Übersicht

[![@qwen-code/qwen-code Version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Erfahren Sie mehr über Qwen Code, Qwens Agenten-Codierungstool, das in Ihrem Terminal lebt und Ihnen hilft, Ideen schneller denn je in Code umzuwandeln.

## Starten Sie in 30 Sekunden

Voraussetzungen:

- Ein [Qwen Code](https://chat.qwen.ai/auth?mode=register) Konto
- Erfordert [Node.js 20+](https://nodejs.org/zh-cn/download), Sie können `node -v` verwenden, um die Version zu überprüfen. Falls es nicht installiert ist, verwenden Sie den folgenden Befehl, um es zu installieren.

### Qwen Code installieren:

**NPM** (empfohlen)

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew** (macOS, Linux)

```bash
brew install qwen-code
```

### Beginnen Sie mit Qwen Code:

```bash
cd your-project
qwen
```

Wählen Sie die Authentifizierung **Qwen OAuth (Kostenlos)** und folgen Sie den Anweisungen zum Einloggen. Dann beginnen wir mit dem Verständnis Ihres Code-Basis. Probieren Sie einen dieser Befehle aus:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Beim ersten Gebrauch werden Sie zur Anmeldung aufgefordert. Das war's schon! [Weiter mit Schnellstart (5 Minuten) →](./quickstart)

> [!tip]
>
> Siehe [Fehlerbehebung](./support/troubleshooting), falls Probleme auftreten.

> [!note]
>
> **Neue VS Code Erweiterung (Beta)**: Bevorzugen Sie eine grafische Oberfläche? Unsere neue **VS Code Erweiterung** bietet eine einfach zu bedienende native IDE-Erfahrung, ohne dass Sie mit der Konsole vertraut sein müssen. Installieren Sie sie einfach aus dem Marketplace und beginnen Sie direkt in Ihrer Seitenleiste mit Qwen Code zu programmieren. Laden Sie jetzt die [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) herunter und installieren Sie sie.

## Was Qwen Code für Sie tut

- **Features aus Beschreibungen erstellen**: Sagen Sie Qwen Code in einfachem Deutsch, was Sie erstellen möchten. Es erstellt einen Plan, schreibt den Code und stellt sicher, dass alles funktioniert.
- **Fehler debuggen und beheben**: Beschreiben Sie einen Bug oder fügen Sie eine Fehlermeldung ein. Qwen Code analysiert Ihren Code, identifiziert das Problem und implementiert eine Lösung.
- **Jede Codebasis navigieren**: Fragen Sie alles über die Codebasis Ihres Teams und erhalten Sie eine fundierte Antwort. Qwen Code behält die Übersicht über die gesamte Projektstruktur, kann aktuelle Informationen aus dem Web abrufen und kann mit [MCP](./features/mcp) Daten aus externen Quellen wie Google Drive, Figma und Slack ziehen.
- **Langweilige Aufgaben automatisieren**: Beheben Sie lästige Lint-Probleme, lösen Sie Merge-Konflikte und schreiben Sie Release Notes. Tun Sie dies alles mit einem einzigen Befehl von Ihren Entwicklermaschinen aus oder automatisch in CI.

## Warum Entwickler Qwen Code lieben

- **Funktioniert in deinem Terminal**: Kein weiteres Chat-Fenster. Keine weitere IDE. Qwen Code kommt dorthin, wo du bereits arbeitest, mit den Tools, die du bereits liebst.
- **Führt Aktionen aus**: Qwen Code kann Dateien direkt bearbeiten, Befehle ausführen und Commits erstellen. Benötigst du mehr? [MCP](./features/mcp) ermöglicht es Qwen Code, deine Design-Dokumente in Google Drive zu lesen, deine Tickets in Jira zu aktualisieren oder _deine_ benutzerdefinierten Entwicklertools zu nutzen.
- **Unix-Philosophie**: Qwen Code ist kombinierbar und skriptfähig. `tail -f app.log | qwen -p "Benachrichtige mich per Slack, wenn du Anomalien in diesem Log-Stream entdeckst"` _funktioniert_. Dein CI kann `qwen -p "Wenn neue Textstrings hinzukommen, übersetze sie ins Französische und erstelle einen PR zur Überprüfung für @lang-fr-team"` ausführen.
