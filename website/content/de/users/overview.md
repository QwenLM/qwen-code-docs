# Qwen Code – Übersicht

[![@qwen-code/qwen-code Downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)  
[![@qwen-code/qwen-code Version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Erfahren Sie mehr über Qwen Code – das agentenbasierte Codierungstool von Qwen, das direkt in Ihrem Terminal läuft und Ihnen hilft, Ideen schneller als je zuvor in funktionierenden Code umzusetzen.

## Loslegen in 30 Sekunden

### Qwen Code installieren:

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (CMD als Administrator ausführen)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> Nach der Installation wird empfohlen, Ihr Terminal neu zu starten, damit die Umgebungsvariablen wirksam werden. Falls die Installation fehlschlägt, lesen Sie bitte den Abschnitt [Manuelle Installation](./quickstart#manual-installation) im Schnellstart-Leitfaden.

### Beginnen Sie mit der Nutzung von Qwen Code:

```bash
cd your-project
qwen
```

Wählen Sie die Authentifizierungsmethode **Qwen OAuth (kostenlos)** und folgen Sie den Anweisungen, um sich anzumelden. Als Nächstes beginnen wir damit, Ihren Codebasen zu verstehen. Probieren Sie einen dieser Befehle aus:

```
Was macht dieses Projekt?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Beim ersten Aufruf werden Sie zur Anmeldung aufgefordert. Das war’s schon! [Fahren Sie mit der Schnellstart-Anleitung (5 Minuten) fort →](./quickstart)

> [!tip]
>
> Falls Probleme auftreten, sehen Sie sich die [Problembehandlung](./support/troubleshooting) an.

> [!note]
>
> **Neue VS Code-Erweiterung (Beta)**: Möchten Sie lieber eine grafische Benutzeroberfläche verwenden? Unsere neue **VS Code-Erweiterung** bietet eine benutzerfreundliche, native IDE-Erfahrung – ohne dass Sie mit der Kommandozeile vertraut sein müssen. Installieren Sie sie einfach über den Marketplace und beginnen Sie direkt in Ihrer Seitenleiste mit der Programmierung mithilfe von Qwen Code. Laden Sie die [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)-Erweiterung jetzt herunter und installieren Sie sie.

## Was Qwen Code für Sie tut

- **Funktionen anhand von Beschreibungen erstellen**: Beschreiben Sie Qwen Code in einfachen Worten, was Sie erstellen möchten. Es erstellt einen Plan, schreibt den Code und stellt sicher, dass er funktioniert.
- **Fehler analysieren und beheben**: Beschreiben Sie einen Fehler oder fügen Sie eine Fehlermeldung ein. Qwen Code analysiert Ihren Codebas, identifiziert das Problem und implementiert eine Lösung.
- **Jeden Codebas navigieren**: Stellen Sie beliebige Fragen zu dem Codebas Ihres Teams und erhalten Sie fundierte Antworten. Qwen Code behält stets die gesamte Projektstruktur im Blick, kann aktuelle Informationen aus dem Web abrufen und – über [MCP](./features/mcp) – auch externe Datenquellen wie Google Drive, Figma und Slack einbinden.
- **Langwierige Aufgaben automatisieren**: Beheben Sie lästige Lint-Probleme, lösen Sie Merge-Konflikte und erstellen Sie Release-Notes. All dies können Sie mit einem einzigen Befehl direkt auf Ihren Entwicklermaschinen oder automatisch in Ihrer CI-Umgebung durchführen.

## Warum Entwickler Qwen Code lieben

- **Funktioniert in Ihrem Terminal**: Kein weiteres Chat-Fenster. Keine weitere IDE. Qwen Code begleitet Sie dort, wo Sie bereits arbeiten – mit den Tools, die Sie bereits lieben.
- **Handelt eigenständig**: Qwen Code kann Dateien direkt bearbeiten, Befehle ausführen und Commits erstellen. Brauchen Sie mehr? Mit [MCP](./features/mcp) kann Qwen Code Ihre Entwurfsdokumente in Google Drive lesen, Ihre Tickets in Jira aktualisieren oder _Ihre_ benutzerdefinierten Entwicklungstools nutzen.
- **Unix-Philosophie**: Qwen Code ist komponierbar und skriptfähig. `tail -f app.log | qwen -p "Sende mir eine Slack-Nachricht, falls im Log-Stream Anomalien auftreten"` _funktioniert_. Ihre CI-Pipeline kann beispielsweise `qwen -p "Falls neue Textzeichenfolgen hinzugekommen sind, übersetze sie ins Französische und erstelle einen Pull Request zur Überprüfung durch @lang-fr-team"` ausführen.