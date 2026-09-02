# Computer Use

Qwen Code verfügt über einen `computer-use`-Skill, der dem Modell beibringt,
wie man Desktop-Anwendungen bedient, über zwei separat installierte Pakete:

```text
bundled computer-use skill
  -> @qwen-code/node-repl-mcp
  -> @qwen-code/cua-sdk/computer-use
  -> native cua-driver accessibility backend
```

Qwen Code bündelt nicht den MCP-Server, das SDK oder den nativen Treiber. Der Skill
installiert die externen Pakete automatisch, wenn sie fehlen.

> [!warning]
>
> Computer Use kann Anwendungs-UIs lesen und Maus- und Tastatureingaben steuern.
> Verwende es nur in vertrauenswürdigen Umgebungen und prüfe MCP-Genehmigungen sorgfältig.

## Automatisches Setup

Node.js 22 oder später und npm werden benötigt.

Bei der ersten Verwendung führt der Skill diese Befehle selbst aus:

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.1.2
npm install --no-save --package-lock=false @qwen-code/cua-sdk@0.20.3
```

Starte Qwen Code neu, nachdem der MCP-Server erstmals hinzugefügt wurde. Der Skill setzt dann
die Desktop-Aufgabe über `node_repl` fort.

Die SDK-Installation lässt `package.json` und die Lockdatei unverändert, schreibt aber
in das `node_modules` des Workspace. Sein Postinstall lädt die native Payload für die aktuelle Plattform herunter und
verifiziert sie.

Das Entfernen der MCP-Konfiguration oder der Workspace-SDK-Installation deaktiviert den
Ausführungspfad; es gibt kein Legacy-Fallback.

## Verwendung

Bitte Qwen Code, `$computer-use` für die Desktop-Aufgabe zu verwenden. Nach dem Bootstrap folgt es
dem standardmäßigen Computer-Use-Workflow:

1. Ermittelt die genaue Anwendung und das Fenster;
2. Beobachtet den vollständigen Accessibility-Zustand;
3. Handelt über aktuelle semantische Element-Tokens, wenn möglich;
4. Holt nach jeder Mutation den frischen Zustand;
5. Verifiziert das angeforderte Ergebnis; und
6. Schließt den SDK-Client und setzt das REPL zurück.

Der Driver ist die einzige Komponente, die Beobachtungs-Diffs berechnet. Modell-Code
verwendet die typisierten SDK-Methoden und dispatcht keine beliebigen Driver-Tool-Namen.

## Berechtigungen

Das Node REPL ist ein MCP-Server, der vom Modell verfasstes JavaScript mit
normaler Node.js-Autorität ausführt. Seine Aufrufe folgen dem normalen
[MCP-Genehmigungsfluss](./approval-mode.md) von Qwen Code. Das SDK erzwingt zusätzlich native
Autorisierung.

Unter macOS erfordern Accessibility-Beobachtung und Eingabe eine Accessibility-Berechtigung.
Screenshots erfordern zusätzlich Screen Recording-Berechtigung. macOS kann
die Genehmigung dem Terminal oder der IDE zuordnen, das Qwen Code gestartet hat. Windows und
Linux verwenden ihre plattformeigenen Accessibility- und Eingabe-Mechanismen.

## Fehlerbehebung

- Wenn `node_repl` nach dem automatischen Setup weiterhin nicht verfügbar ist, starte Qwen Code neu
  und verifiziere den Server mit `qwen mcp list`.
- Wenn der SDK-Import nach dem automatischen Setup weiterhin fehlschlägt, stelle sicher, dass Qwen Code
  in dem Workspace läuft, in dem das Paket installiert wurde.
- Nach einem Timeout, Abbruch, Reset oder Kernel-Crash, bootstrape den SDK
  Client erneut und fordere frischen Zustand an.

## Siehe auch

- [Skills](./skills.md)
- [MCP servers](./mcp.md)
- [Approval Mode](./approval-mode.md)
- [Sandboxing](./sandbox.md)
