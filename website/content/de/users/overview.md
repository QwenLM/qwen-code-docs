# Qwen Code Übersicht

[![@qwen-code/qwen-code Downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code Version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Erfahren Sie mehr über Qwen Code, das Agenten-Coding-Tool von Qwen, das in Ihrem Terminal lebt und Ihnen hilft, Ideen schneller denn je in Code umzusetzen.

## Starten Sie in 30 Sekunden

Voraussetzungen:

- Ein [Qwen Code](https://chat.qwen.ai/auth?mode=register) Konto
- Erfordert [Node.js 20+](https://nodejs.org/zh-cn/download), Sie können `node -v` verwenden, um die Version zu prüfen. Falls es nicht installiert ist, verwenden Sie den folgenden Befehl zur Installation.

### Installieren Sie Qwen Code:

**NPM**(empfohlen)

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew**(macOS, Linux)

```bash
brew install qwen-code
```

### Beginnen Sie mit Qwen Code:

```bash
cd your-project
qwen
```

Wählen Sie die Authentifizierung über **Qwen OAuth (kostenlos)** und folgen Sie den Anweisungen zum Einloggen. Als Nächstes beginnen wir mit dem Verständnis Ihres Code-Basis. Probieren Sie einen dieser Befehle aus:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Beim ersten Start werden Sie zur Anmeldung aufgefordert. Das war's schon! [Weiter mit Schnellstart (5 Min) →](./quickstart)

> [!tip]
>
> Siehe [Fehlerbehebung](./support/troubleshooting), falls Probleme auftreten.

> [!note]
>
> **Neue VS Code-Erweiterung (Beta)**: Bevorzugen Sie eine grafische Oberfläche? Unsere neue **VS Code-Erweiterung** bietet ein benutzerfreundliches natives IDE-Erlebnis, ohne dass Sie sich mit der Konsole beschäftigen müssen. Installieren Sie sie einfach über den Marketplace und beginnen Sie direkt im Seitenbereich mit der Programmierung mithilfe von Qwen Code. Laden und installieren Sie jetzt die [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## Was Qwen Code für Sie tut

- **Features aus Beschreibungen erstellen**: Sagen Sie Qwen Code in einfachem Deutsch, was Sie erstellen möchten. Es erstellt einen Plan, schreibt den Code und stellt sicher, dass alles funktioniert.
- **Fehler suchen und beheben**: Beschreiben Sie einen Fehler oder fügen Sie eine Fehlermeldung ein. Qwen Code analysiert Ihren Code, identifiziert das Problem und implementiert eine Lösung.
- **In jedem Code navigieren**: Stellen Sie Fragen zu dem Code Ihres Teams und erhalten Sie fundierte Antworten. Qwen Code behält die Übersicht über Ihre gesamte Projektstruktur, kann aktuelle Informationen aus dem Web abrufen und kann mit [MCP](./features/mcp) Daten aus externen Quellen wie Google Drive, Figma und Slack ziehen.
- **Langweilige Aufgaben automatisieren**: Beheben Sie lästige Lint-Probleme, lösen Sie Merge-Konflikte und verfassen Sie Release Notes. Tun Sie dies entweder mit einem einzigen Befehl auf Ihren Entwicklermaschinen oder automatisch in der CI.

## Warum Entwickler Qwen Code lieben

- **Funktioniert in deinem Terminal**: Kein weiteres Chat-Fenster. Keine weitere IDE. Qwen Code kommt dorthin, wo du bereits arbeitest, mit den Tools, die du bereits liebst.
- **Handelt direkt**: Qwen Code kann Dateien direkt bearbeiten, Befehle ausführen und Commits erstellen. Benötigst du mehr? [MCP](./features/mcp) ermöglicht es Qwen Code, deine Design-Dokumente in Google Drive zu lesen, deine Tickets in Jira zu aktualisieren oder _deine_ benutzerdefinierten Entwicklertools zu nutzen.
- **Unix-Philosophie**: Qwen Code ist kombinierbar und skriptfähig. `tail -f app.log | qwen -p "Benachrichtige mich per Slack, wenn Anomalien in diesem Log-Strom auftauchen"` _funktioniert_. Dein CI kann `qwen -p "Wenn neue Textstrings hinzukommen, übersetze sie ins Französische und erstelle einen PR zur Überprüfung für @lang-fr-team"` ausführen.