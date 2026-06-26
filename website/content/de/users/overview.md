# Qwen Code Übersicht

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Erfahren Sie mehr über Qwen Code, Qwen's agentisches Coding-Tool, das in Ihrem Terminal lebt und Ihnen hilft, Ideen schneller als je zuvor in Code umzusetzen.

## Erste Schritte in 30 Sekunden

### Qwen Code installieren:

Der empfohlene Installer verwendet ein eigenständiges Archiv, sofern eines für Ihre Plattform verfügbar ist. Falls auf npm zurückgegriffen wird, muss Node.js 22 oder höher mit npm im PATH verfügbar sein.

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
> Es wird empfohlen, das Terminal nach der Installation neu zu starten, falls `qwen` nicht sofort im PATH verfügbar ist. Falls die Installation fehlschlägt, lesen Sie bitte [Manuelle Installation](./quickstart#manual-installation) im Schnellstart-Leitfaden. Für eine Offline-Installation laden Sie ein Release-Archiv herunter und führen Sie den Installer mit `--archive PATH` aus; lassen Sie `SHA256SUMS` neben dem Archiv.

### Qwen Code verwenden:

```bash
cd your-project
qwen
```

Beim ersten Start werden Sie aufgefordert, einen Modellanbieter zu verbinden. Das Menü bietet **Alibaba ModelStudio** (Coding Plan, Token Plan oder Standard API Key), **Drittanbieter** (integrierte Anbieter wie DeepSeek, MiniMax, Z.AI und OpenRouter, verbunden mit einem API-Key) und **Benutzerdefinierter Anbieter** (ein lokaler Server, Proxy oder nicht unterstützter Anbieter). Für den [Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) wählen Sie **Alibaba ModelStudio → Coding Plan**; um einen ModelStudio API-Key zu verwenden, wählen Sie **Alibaba ModelStudio → Standard API Key** und folgen Sie der API-Einrichtungsanleitung ([Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)). Dann beginnen wir mit dem Verständnis Ihrer Codebasis. Versuchen Sie einen dieser Befehle:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Sie werden aufgefordert, sich bei der ersten Verwendung anzumelden. Das war's! [Weiter mit dem Schnellstart (5 Min.) →](./quickstart)

> [!tip]
>
> Siehe [Fehlerbehebung](./support/troubleshooting), falls Probleme auftreten.

> [!note]
>
> **Neue VS Code-Erweiterung (Beta)**: Bevorzugen Sie eine grafische Oberfläche? Unsere neue **VS Code-Erweiterung** bietet eine benutzerfreundliche native IDE-Erfahrung, ohne dass Sie sich mit dem Terminal auskennen müssen. Installieren Sie sie einfach aus dem Marketplace und beginnen Sie direkt in Ihrer Seitenleiste mit Qwen Code zu codieren. Laden Sie jetzt den [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) herunter und installieren Sie ihn.

## Was Qwen Code für Sie tut

- **Funktionen aus Beschreibungen erstellen**: Teilen Sie Qwen Code in einfacher Sprache mit, was Sie bauen möchten. Es erstellt einen Plan, schreibt den Code und stellt sicher, dass er funktioniert.
- **Fehler beheben und Probleme debuggen**: Beschreiben Sie einen Fehler oder fügen Sie eine Fehlermeldung ein. Qwen Code analysiert Ihre Codebasis, identifiziert das Problem und implementiert eine Lösung.
- **Jede Codebasis navigieren**: Stellen Sie Fragen zu Ihrer Team-Codebasis und erhalten Sie eine durchdachte Antwort. Qwen Code behält den gesamten Projektstruktur im Blick, kann aktuelle Informationen aus dem Web abrufen und mit [MCP](./features/mcp) aus externen Datenquellen wie Google Drive, Figma und Slack ziehen.
- **Mühsame Aufgaben automatisieren**: Beheben Sie knifflige Lint-Probleme, lösen Sie Merge-Konflikte und schreiben Sie Versionshinweise. Erledigen Sie dies alles mit einem einzigen Befehl auf Ihren Entwicklungsmaschinen oder automatisch in CI.
- **[Folgevorschläge](./features/followup-suggestions)**: Qwen Code sagt voraus, was Sie als Nächstes eingeben möchten, und zeigt es als Geistertext an. Drücken Sie Tab, um zu akzeptieren, oder tippen Sie einfach weiter, um zu verwerfen.

## Warum Entwickler Qwen Code lieben

- **Funktioniert in Ihrem Terminal**: Kein weiteres Chat-Fenster. Keine weitere IDE. Qwen Code trifft Sie dort, wo Sie bereits arbeiten, mit den Werkzeugen, die Sie bereits lieben.
- **Ergreift Maßnahmen**: Qwen Code kann direkt Dateien bearbeiten, Befehle ausführen und Commits erstellen. Brauchen Sie mehr? [MCP](./features/mcp) ermöglicht es Qwen Code, Ihre Designdokumente in Google Drive zu lesen, Ihre Tickets in Jira zu aktualisieren oder _Ihre_ benutzerdefinierten Entwicklertools zu verwenden.
- **Unix-Philosophie**: Qwen Code ist zusammensetzbar und skriptbar. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _funktioniert_. Ihre CI kann `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"` ausführen.