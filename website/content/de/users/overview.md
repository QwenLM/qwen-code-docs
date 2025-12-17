# Qwen Code Übersicht

> Erfahren Sie mehr über Qwen Code, Qwens agentenbasiertes Coding-Tool, das in Ihrem Terminal läuft und Ihnen dabei hilft, Ideen schneller denn je in Code umzusetzen.

## In 30 Sekunden starten

Voraussetzungen:

- Ein [Qwen Code](https://chat.qwen.ai/auth?mode=register)-Konto
- Erfordert [Node.js 20+](https://nodejs.org/zh-cn/download). Sie können `node -v` verwenden, um die Version zu prüfen. Falls nicht installiert, nutzen Sie den folgenden Befehl zur Installation.

### Qwen Code installieren:

**NPM** (empfohlen)

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew** (macOS, Linux)

```bash
brew install qwen-code
```

### Fangen wir an, Qwen Code zu verwenden:

```bash
cd your-project
qwen
```

Wähle die Authentifizierungsmethode **Qwen OAuth (Free)** aus und folge den Anweisungen zum Einloggen. Danach lass uns mit dem Verständnis deiner Codebasis beginnen. Probiere einen der folgenden Befehle aus:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Beim ersten Gebrauch wirst du aufgefordert, dich anzumelden. Das war's schon! [Weiter zur Schnellstartanleitung (5 Minuten) →](./quickstart)

> [!tip]
>
> Im Falle von Problemen findest du hier Hilfe: [Fehlerbehebung](./support/troubleshooting)

> [!note]
>
> **Neue VS Code-Erweiterung (Beta)**: Du bevorzugst eine grafische Oberfläche? Unsere neue **VS Code-Erweiterung** bietet dir ein benutzerfreundliches, natives IDE-Erlebnis – ganz ohne Umgang mit dem Terminal. Installiere sie einfach über den Marketplace und beginne direkt in der Seitenleiste mit dem Coden mit Qwen Code. Suche im VS Code Marketplace nach **Qwen Code** und lade sie herunter.

## Was Qwen Code für dich tut

- **Features aus Beschreibungen erstellen**: Sage Qwen Code in einfachem Sprachstil, was du bauen möchtest. Es wird einen Plan erstellen, den Code schreiben und sicherstellen, dass er funktioniert.
- **Fehler beheben**: Beschreibe einen Fehler oder füge eine Fehlermeldung ein. Qwen Code analysiert deine Codebasis, identifiziert das Problem und implementiert eine Lösung.
- **Durch jede Codebasis navigieren**: Frage alles über die Codebasis deines Teams und erhalte eine durchdachte Antwort. Qwen Code behält den Überblick über die gesamte Projektstruktur, kann aktuelle Informationen aus dem Web abrufen und mit [MCP](./features/mcp) Daten aus externen Quellen wie Google Drive, Figma und Slack ziehen.
- **Routineaufgaben automatisieren**: Behebe lästige Lint-Probleme, löse Merge-Konflikte und verfasse Release Notes. All dies lässt sich mit einem einzigen Befehl von deinen Entwicklermaschinen aus erledigen oder automatisch in CI.

## Warum Entwickler Qwen Code lieben

- **Funktioniert in deinem Terminal**: Kein weiteres Chat-Fenster. Keine weitere IDE. Qwen Code trifft dich dort, wo du bereits arbeitest, mit den Tools, die du bereits liebst.
- **Handelt direkt**: Qwen Code kann Dateien direkt bearbeiten, Befehle ausführen und Commits erstellen. Brauchst du mehr? [MCP](./features/mcp) ermöglicht es Qwen Code, deine Design-Dokumente in Google Drive zu lesen, Tickets in Jira zu aktualisieren oder _deine_ individuellen Entwickler-Tools zu verwenden.
- **Unix-Philosophie**: Qwen Code ist kombinierbar und skriptbar. `tail -f app.log | qwen -p "Schicke mir eine Slack-Nachricht, wenn du Anomalien im Logstream entdeckst"` _funktioniert_. Dein CI kann `qwen -p "Wenn neue Textzeichenfolgen vorhanden sind, übersetze sie ins Französische und erstelle einen PR für das @lang-fr-team zur Überprüfung"` ausführen.