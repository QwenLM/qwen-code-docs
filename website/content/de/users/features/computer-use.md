# Computer Use

Computer Use läuft über den eigenständigen Node-REPL-MCP-Server. Sein erster `js`-Aufruf lädt das globale `cua` und zeigt die Dokumentation für die aktuelle Plattform an. Computer Use und Browser Use benötigen keine gebündelten Skills mehr.

```text
Qwen Code / beliebiger MCP-Client
  -> @qwen-code/node-repl-mcp (js, js_reset)
  -> @qwen-code/cua-sdk/runtime
     -> nativer Qwen CUA Driver (Desktop-Anwendungen)
     -> @qwen-code/browser-use (Qwen-Browser-Erweiterung)
```

## Setup

Node.js 22 oder höher und npm werden benötigt. Registriere den MCP-Server und starte dann Qwen Code neu:

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.26.0
```

Der Server installiert das passende SDK und das Browser-SDK als Dependencies. Die native SDK-Payload wird für die aktuelle Plattform heruntergeladen und gegen die SHA-256-Checksummen des zugehörigen Releases verifiziert. Sie wird außerhalb des npm-Pakets zwischengespeichert; es wird kein SDK-Bootstrap-Befehl im Workspace benötigt. Version 0.26.0 ist ein lokales Entwicklungsziel, bis deren Release veröffentlicht wird.

## Anwendungsaufgaben

```js
var app = await cua.getApp('Microsoft Excel');
// Verwende eine kurze ID aus dem automatisch angezeigten AX-Zustand.
await app.click(37);
await app.typeText('hello');
await app.getAXState();
```

`getApp` zeigt den vollständigen AX-Text ohne Bild an. `getAXState` zeigt nachfolgende Diffs an. `getScreenshot` erfasst nur das aktuelle Fenster; `getAXStateAndScreenshot` erfasst beides. Beobachtungen geben Strings zurück und zeigen sich selbst an; `{emit:false}` unterdrückt die Ausgabe. Fordere einen Screenshot an, bevor du `{x,y}`-Koordinaten verwendest – das sind Pixel im aktuellen Screenshot dieses Fensters.

Der Driver löst Anwendungen/Fenster auf, verwaltet die aktuellen kurzen IDs und Koordinaten und wählt die Eingabezustellung. macOS verwendet Accessibility und gezielte Events. Windows und Linux versuchen zuerst die Hintergrund-Zustellung und verwenden Foreground-Eingabe erst nach einer Verweigerung, die beweist, dass nichts gesendet wurde. Foreground-Eingabe stoppt, wenn physische Benutzeraktivität erkannt wird; sie stellt die vorherige Anwendung nur wieder her, wenn der Benutzer nicht woanders hin gewechselt hat. Eine Dispatch-Bestätigung beweist nicht, dass sich die UI geändert hat: beobachte vor einem erneuten Versuch.

Linux unterstützt X11, einschließlich X11-Anwendungen unter XWayland. Native Wayland-Anwendungen werden nicht unterstützt. Übergib DISPLAY, XAUTHORITY und den Accessibility-Session-Bus des Desktops an den Server.

## Desktop- und Browser-Aufgaben

Verwende die explizite Desktop-Schnittstelle für Vollbild-Aufgaben:

```js
await cua.desktop.getScreenshot();
await cua.desktop.click({ x: 300, y: 200 }, { key: 'shift' });
```

Desktop-Koordinaten sind Pixel im neuesten Screenshot des Haupt-Displays. Desktop-Eingabe steuert den sichtbaren Foreground-Desktop und kann den echten Zeiger bewegen. Verwende für gehaltene Tasten immer `try/finally` mit `cua.desktop.keyDown(key)` und `keyUp(key)`. Gehaltene Tasten gehören zur aufrufenden Session und werden bei sauberem Reset/Ende freigegeben. Verwende beim Halten von Tasten `keyDown/keyUp` für Akkorde und Desktop-Zeigeraktionen ohne explizite Modifier; gib sie frei vor Text, normalen Shortcuts oder Anwendungseingabe. Abrupte OS-Prozessbeendigung kann keine Aufräumarantie garantieren.

```js
var browser = await cua.getBrowser('Chrome');
// Browser-Dokumentation und Tabs werden bei der ersten Auswahl angezeigt.
var tab = await cua.getTab('TAB_ID', { browser: 'Chrome' });
await tab.playwright.domSnapshot();
```

`getBrowser`, `getTab` und `createBrowserTab` geben die vorhandenen Browser-use-SDK-Handles des Repositorys zurück. Folge der Runtime-Dokumentation des gewählten Browsers und verbinde die Qwen-Browser-Erweiterung wie zuvor. Die Integration fügt keine Browser-Windows-API, kein DOM-Diff und keine neue Windows-Unterstützung hinzu.

## Berechtigungen und Lebenszyklus

Der Server führt JavaScript mit den normalen Node.js-Berechtigungen aus und folgt dem MCP-Genehmigungsfluss des Clients. Unter macOS wird Accessibility für Eingabe/AX-Beobachtung benötigt und Screen Recording für Screenshots; Automation kann für Dokumentenspeicherung/Finder-Umbenennung angefragt werden. Genehmigungen gehören zur OS-Verantwortungskette des Host-Prozesses. Unter Windows verwendet der normale installierte Daemon den bestehenden UAC/Logon-Task-Pfad; Anwendungen, die er startet, verwenden ein von seinem eigenen Token abgeleitetes Token mit Normal-User-Integrität. UIAccess ist optional: `CUA_DRIVER_USE_UIACCESS=1` explizit zu setzen erfordert einen vertrauenswürdigen, signierten Worker unter Program Files und schlägt fehl, wenn nicht verfügbar. Die Standard-npm-Installation installiert diesen Worker nicht und verlangt dessen Signatur nicht.

`js` completes in einem Aufruf und hat standardmäßig ein 30-Sekunden-Timeout. Ein Timeout kann externe Effekte hinterlassen; beobachte vor einem erneuten Versuch. `js_reset` verwirft Bindungen und schließt die besitzende native/Browser-Session sauber. Nach Compaction des Kontexts, rufe `cua.rewriteDocumentation()` auf, bevor du fortfährst.

## Remote-Desktop-Relay

Für ein bestehendes macOS-Desktop-Relay-Setup installiere den zugehörigen Server:

```bash
npx -y @qwen-code/node-repl-mcp@0.26.0 desktop-relay install
```

Dies verwendet den bestehenden lokalen launchd-Socket unter `127.0.0.1:47821`. Wähle in einer sicheren Web Shell **Use this computer** und dann **Connect this computer**. Der Desktop fragt bei jeder Verbindung nach. Der Remote-Daemon muss `QWEN_SERVE_CLIENT_MCP_OVER_WS=1` aktiviert haben.

## Direktes MCP und Fehlerbehebung

`qwen-cua-driver mcp` legt dieselben 19 nativen Computer-Use-Operationen direkt offen. App-Aufrufe verwenden `app`; desktop-fähige Aufrufe verwenden stattdessen `scope:"desktop"`. `key_down/key_up` sind nur für den Desktop. Erweiterte native Tools bleiben über das Host-Opt-in `CUA_DRIVER_EXTRA_TOOLS=1` verfügbar.

Wenn der Server nicht verfügbar ist, prüfe `qwen mcp list` und starte den Client nach dem Hinzufügen neu. Wenn die Erfassung fehlschlägt, prüfe die aktuelle Desktop-Session und OS-Berechtigungen. Wenn der native Download fehlschlägt, prüfe das genaue Release-Version/Checksum-Asset oder liefere eine lokal gebaute passende Payload über `QWEN_CUA_SDK_NATIVE_DIR`. Ein gesperrter Desktop kann keine GUI-Akzeptanz-Beweise liefern.

Siehe [MCP servers](./mcp.md), [Approval Mode](./approval-mode.md) und [Sandboxing](./sandbox.md).
