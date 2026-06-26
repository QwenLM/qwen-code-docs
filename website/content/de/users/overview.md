# Qwen Code Übersicht

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Erfahren Sie mehr über Qwen Code, das agentische Codierungs-Tool von Qwen, das in Ihrem Terminal lebt und Ihnen hilft, Ideen schneller als je zuvor in Code umzusetzen.

## In 30 Sekunden starten

### Qwen Code installieren:

Das empfohlene Installationsprogramm verwendet ein eigenständiges Archiv, sofern für Ihre Plattform eines verfügbar ist. Falls auf npm zurückgegriffen wird, muss Node.js 22 oder höher mit npm im PATH verfügbar sein.

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
> Es wird empfohlen, Ihr Terminal nach der Installation neu zu starten, falls `qwen` nicht sofort im PATH verfügbar ist. Wenn die Installation fehlschlägt, lesen Sie bitte [Manuelle Installation](./quickstart#manual-installation) im Quickstart-Leitfaden. Für eine Offline-Installation laden Sie ein Release-Archiv herunter und führen Sie das Installationsprogramm mit `--archive PFAD` aus; behalten Sie `SHA256SUMS` neben dem Archiv.

### Qwen Code starten:

```bash
cd your-project
qwen
```

Beim ersten Start werden Sie aufgefordert, einen Modellanbieter zu verbinden. Das Menü bietet **Alibaba ModelStudio** (Coding Plan, Token Plan oder Standard API Key), **Drittanbieter** (integrierte Anbieter wie DeepSeek, MiniMax, Z.AI und OpenRouter, verbunden mit einem API-Key) und **Benutzerdefinierter Anbieter** (einen lokalen Server, Proxy oder nicht unterstützten Anbieter). Für den [Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) wählen Sie **Alibaba ModelStudio → Coding Plan**; um einen ModelStudio-API-Key zu verwenden, wählen Sie **Alibaba ModelStudio → Standard API Key** und folgen Sie der API-Einrichtungsanleitung ([Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)). Dann beginnen wir mit dem Verständnis Ihrer Codebasis. Versuchen Sie einen dieser Befehle:

```
was macht dieses Projekt?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Sie werden beim ersten Mal aufgefordert, sich anzumelden. Das war's! [Weiter mit Quickstart (5 Min.) →](./quickstart)

> [!tip]
>
> Siehe [Fehlerbehebung](./support/troubleshooting), falls Probleme auftreten.

> [!note]
>
> **Neue VS Code-Erweiterung (Beta)**: Bevorzugen Sie eine grafische Oberfläche? Unsere neue **VS Code-Erweiterung** bietet ein benutzerfreundliches natives IDE-Erlebnis, ohne dass Sie sich mit dem Terminal auskennen müssen. Installieren Sie sie einfach aus dem Marketplace und beginnen Sie direkt in Ihrer Seitenleiste mit Qwen Code zu coden. Laden Sie jetzt [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) herunter und installieren Sie sie.

## Was Qwen Code für Sie tut

- **Funktionen aus Beschreibungen erstellen**: Teilen Sie Qwen Code in einfacher Sprache mit, was Sie bauen möchten. Es erstellt einen Plan, schreibt den Code und stellt sicher, dass er funktioniert.
- **Fehler beheben und Probleme lösen**: Beschreiben Sie einen Fehler oder fügen Sie eine Fehlermeldung ein. Qwen Code analysiert Ihre Codebasis, identifiziert das Problem und implementiert eine Lösung.
- **Jede Codebasis navigieren**: Fragen Sie alles über die Codebasis Ihres Teams und erhalten Sie eine durchdachte Antwort. Qwen Code behält den Überblick über Ihre gesamte Projektstruktur, kann aktuelle Informationen aus dem Web finden und mit [MCP](./features/mcp) Daten aus externen Quellen wie Google Drive, Figma und Slack abrufen.
- **Mühsame Aufgaben automatisieren**: Beheben Sie knifflige Lint-Probleme, lösen Sie Merge-Konflikte und schreiben Sie Release-Notizen. Erledigen Sie all dies mit einem einzigen Befehl auf Ihren Entwicklermaschinen oder automatisch in CI.
- **[Folgevorschläge](./features/followup-suggestions)**: Qwen Code sagt voraus, was Sie als Nächstes eingeben möchten, und zeigt es als Geistertext an. Drücken Sie Tab, um zu akzeptieren, oder tippen Sie einfach weiter, um zu verwerfen.

## Warum Entwickler Qwen Code lieben

- **Funktioniert in Ihrem Terminal**: Kein weiteres Chat-Fenster. Keine weitere IDE. Qwen Code trifft Sie dort, wo Sie bereits arbeiten, mit den Werkzeugen, die Sie bereits lieben.
- **Ergreift Maßnahmen**: Qwen Code kann direkt Dateien bearbeiten, Befehle ausführen und Commits erstellen. Benötigen Sie mehr? [MCP](./features/mcp) ermöglicht es Qwen Code, Ihre Designdokumente in Google Drive zu lesen, Ihre Tickets in Jira zu aktualisieren oder _Ihre_ benutzerdefinierten Entwicklerwerkzeuge zu verwenden.
- **Unix-Philosophie**: Qwen Code ist kombinierbar und scriptbar. `tail -f app.log | qwen -p "Slack mir, wenn du Anomalien in diesem Logstream siehst"` _funktioniert_. Ihre CI kann `qwen -p "Wenn es neue Textstrings gibt, übersetze sie ins Französische und erstelle einen PR zur Überprüfung durch @lang-fr-team"` ausführen.
