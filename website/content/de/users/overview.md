# Qwen Code Übersicht

[![@qwen-code/qwen-code Downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code) [![@qwen-code/qwen-code Version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Erfahren Sie mehr über Qwen Code, Qwens agentisches Coding-Tool, das in Ihrem Terminal läuft und Ihnen hilft, Ideen schneller als je zuvor in Code umzusetzen.

## In 30 Sekunden starten

### Qwen Code installieren:

Der empfohlene Installer verwendet ein eigenständiges Archiv, wenn eines für Ihre Plattform verfügbar ist. Falls er auf npm zurückgreift, muss Node.js 22 oder höher mit npm im PATH verfügbar sein.

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
> Es wird empfohlen, das Terminal nach der Installation neu zu starten, wenn `qwen` nicht sofort im PATH verfügbar ist. Wenn die Installation fehlschlägt, lesen Sie bitte unter [Manuelle Installation](./quickstart#manual-installation) im Schnellstart-Handbuch nach. Für eine Offline-Installation laden Sie ein Release-Archiv herunter und führen den Installer mit `--archive PATH` aus; legen Sie `SHA256SUMS` neben dem Archiv ab.

### Beginnen Sie mit Qwen Code:

```bash
cd your-project
qwen
```

Beim ersten Start werden Sie aufgefordert, einen Modell-Anbieter zu verbinden. Das Menü bietet [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) (nutzen Sie ein Qwen Plus oder Pro Abonnement von [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)), **QwenCloud** (die offiziell empfohlene Einrichtung), **Alibaba ModelStudio**, **Third-party Providers** (integrierte Anbieter wie DeepSeek, MiniMax, Z.AI, Kimi und OpenRouter, verbunden mit einem API-Schlüssel) und **Custom Provider** (ein lokaler Server, Proxy oder nicht unterstützter Anbieter).

Um Ihr Qwen-Abonnement zu nutzen, wählen Sie [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) und melden Sie sich mit Ihrem Qwen-Konto an. Ein **Plus- oder Pro-Abonnement** schaltet den Zugriff auf **Qwen Code and Agent** frei. Wenn Sie noch kein Abonnement haben, besuchen Sie [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli), um Plus oder Pro abzuschließen, kehren Sie dann zu Qwen Code zurück und wählen Sie [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).

Für einen QwenCloud-Schlüssel wählen Sie **QwenCloud → Token Plan** oder **QwenCloud → Standard API Key** und dann die Plattform (China oder International) — siehe [Authentication](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/).

Für den [Alibaba Cloud Token Plan](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) ([intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)) wählen Sie **Alibaba ModelStudio → Token Plan**; um einen ModelStudio-API-Schlüssel zu verwenden, wählen Sie **Alibaba ModelStudio → Standard API Key** und folgen Sie dem API-Einrichtungsleitfaden ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).

Dann beginnen wir damit, Ihre Codebasis zu verstehen. Versuchen Sie einen dieser Befehle:

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

- **Funktionen aus Beschreibungen erstellen**: Sagen Sie Qwen Code in natürlicher Sprache, was Sie bauen möchten. Es erstellt einen Plan, schreibt den Code und stellt sicher, dass er funktioniert.
- **Debuggen und Probleme beheben**: Beschreiben Sie einen Bug oder fügen Sie eine Fehlermeldung ein. Qwen Code analysiert Ihre Codebasis, identifiziert das Problem und implementiert eine Lösung.
- **Jede Codebasis navigieren**: Stellen Sie Fragen zu Ihrer Team-Codebasis und erhalten Sie eine durchdachte Antwort. Qwen Code behält das Bewusstsein für Ihre gesamte Projektstruktur, kann aktuelle Informationen aus dem Web abrufen und kann mit [MCP](./features/mcp) Daten aus externen Quellen wie Google Drive, Figma und Slack beziehen.
- **Mühsame Aufgaben automatisieren**: Beheben Sie knifflige Lint-Probleme, lösen Sie Merge-Konflikte und schreiben Sie Release Notes. Erledigen Sie all dies mit einem einzelnen Befehl von Ihren Entwicklermaschinen oder automatisch in CI.
- **[Folgevorschläge](./features/followup-suggestions)**: Qwen Code sagt voraus, was Sie als Nächstes eingeben möchten, und zeigt es als Geistertext an. Drücken Sie Tab, um zu akzeptieren, oder tippen Sie einfach weiter, um zu verwerfen.

## Warum Entwickler Qwen Code lieben

- **Funktioniert in Ihrem Terminal**: Kein weiteres Chat-Fenster. Keine weitere IDE. Qwen Code trifft Sie dort, wo Sie bereits arbeiten, mit den Werkzeugen, die Sie bereits lieben.
- **Ergreift Maßnahmen**: Qwen Code kann direkt Dateien bearbeiten, Befehle ausführen und Commits erstellen. Brauchen Sie mehr? [MCP](./features/mcp) ermöglicht es Qwen Code, Ihre Designdokumente in Google Drive zu lesen, Ihre Tickets in Jira zu aktualisieren oder _Ihre_ benutzerdefinierten Entwicklertools zu verwenden.
- **Unix-Philosophie**: Qwen Code ist zusammensetzbar und skriptbar. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _funktioniert_. Ihre CI kann `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"` ausführen.
