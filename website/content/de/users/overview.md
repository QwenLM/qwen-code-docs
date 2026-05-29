---
description: "Lernen Sie Qwen Code kennen: Kernfunktionen, 30-Sekunden-Start und typische Workflows, um Code im Terminal schneller zu verstehen, zu ändern und zu automatisieren."
---

# Qwen Code – Übersicht

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Erfahre mehr über Qwen Code, das agentenbasierte Coding-Tool von Qwen, das direkt in deinem Terminal läuft und dir hilft, Ideen schneller als je zuvor in Code umzusetzen.

## In 30 Sekunden loslegen

### Qwen Code installieren:

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (Als Administrator ausführen)**

```cmd
powershell -Command "Invoke-WebRequest 'https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat' -OutFile (Join-Path $env:TEMP 'install-qwen.bat'); & (Join-Path $env:TEMP 'install-qwen.bat')"
```

> [!note]
>
> Es wird empfohlen, das Terminal nach der Installation neu zu starten, um sicherzustellen, dass die Umgebungsvariablen übernommen werden. Falls die Installation fehlschlägt, siehe [Manuelle Installation](./quickstart#manual-installation) im Quickstart-Guide.

### Qwen Code verwenden:

```bash
cd your-project
qwen
```

Wähle deine Authentifizierungsmethode – **API Key** oder **[Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)** ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) – und folge den Anweisungen zur Konfiguration. Eine Schritt-für-Schritt-Anleitung findest du im API-Einrichtungs-Guide ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)). Anschließend kannst du direkt damit beginnen, deine Codebase zu erkunden. Probiere einen dieser Befehle aus:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Bei der ersten Nutzung wirst du aufgefordert, dich anzumelden. Das war's! [Weiter zum Quickstart (5 Min.) →](./quickstart)

> [!tip]
>
> Siehe [Troubleshooting](./support/troubleshooting), falls Probleme auftreten.

> [!note]
>
> **Neue VS Code Extension (Beta)**: Du bevorzugst eine grafische Oberfläche? Unsere neue **VS Code Extension** bietet eine benutzerfreundliche, native IDE-Erfahrung, ohne dass du dich mit dem Terminal auskennen musst. Installiere sie einfach aus dem Marketplace und beginne direkt in deiner Sidebar mit Qwen Code zu programmieren. Lade jetzt die [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) herunter und installiere sie.

## Was Qwen Code für dich tut

- **Features aus Beschreibungen erstellen**: Sage Qwen Code in natürlicher Sprache, was du bauen möchtest. Es erstellt einen Plan, schreibt den Code und stellt sicher, dass er funktioniert.
- **Debuggen und Probleme beheben**: Beschreibe einen Bug oder füge eine Fehlermeldung ein. Qwen Code analysiert deine Codebase, identifiziert das Problem und implementiert eine Lösung.
- **Jede Codebase navigieren**: Stelle beliebige Fragen zur Codebase deines Teams und erhalte eine fundierte Antwort. Qwen Code kennt die gesamte Projektstruktur, kann aktuelle Informationen aus dem Web abrufen und mit [MCP](./features/mcp) auf externe Datenquellen wie Google Drive, Figma und Slack zugreifen.
- **Lästige Aufgaben automatisieren**: Behebe knifflige Lint-Probleme, löse Merge-Konflikte und schreibe Release Notes. All das mit einem einzigen Befehl von deinem Entwickler-PC aus oder automatisch in der CI.
- **[Follow-up-Vorschläge](./features/followup-suggestions)**: Qwen Code antizipiert, was du als Nächstes eingeben möchtest, und zeigt es als Ghost-Text an. Drücke Tab, um ihn zu übernehmen, oder tippe einfach weiter, um ihn zu verwerfen.

## Warum Entwickler Qwen Code lieben

- **Läuft in deinem Terminal**: Kein weiteres Chat-Fenster. Keine weitere IDE. Qwen Code trifft dich dort, wo du bereits arbeitest, mit den Tools, die du bereits liebst.
- **Handelt aktiv**: Qwen Code kann Dateien direkt bearbeiten, Befehle ausführen und Commits erstellen. Du brauchst mehr? [MCP](./features/mcp) ermöglicht es Qwen Code, deine Design-Dokumente in Google Drive zu lesen, deine Tickets in Jira zu aktualisieren oder _deine_ eigenen Developer-Tools zu nutzen.
- **Unix-Philosophie**: Qwen Code ist komponierbar und skriptfähig. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _funktioniert_. Deine CI kann `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"` ausführen.