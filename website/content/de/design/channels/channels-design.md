# Channel-Design

> Externe Messaging-Integrationen für Qwen Code – Interaktion mit einem Agenten über Telegram, WeChat und mehr.
>
> Benutzerdokumentation: [Übersicht der Channels](../../users/features/channels/overview.md).

## Overview

Ein **Channel** verbindet eine externe Messaging-Plattform mit einem Qwen Code-Agenten. Konfiguriert in `settings.json`, verwaltet über `qwen channel`-Subcommands, unterstützt mehrere Benutzer (jeder Benutzer erhält eine isolierte ACP-Sitzung).

## Architecture

```
┌──────────┐                        ┌─────────────────────────────────────┐
│ Telegram │    Platform API        │        Channel Service              │
│ User A   │◄──────────────────────►│                                     │
├──────────┤  (WebSocket/polling)   │  ┌───────────┐    ┌──────────────┐  │
│ WeChat   │◄──────────────────────►│  │ Platform   │    │  ACP Bridge  │  │
│ User B   │                        │  │ Adapter    │    │  (shared)    │  │
└──────────┘                        │  │            │    │              │  │
                                    │  │ - connect  │    │  - spawns    │  │
                                    │  │ - receive  │    │    qwen-code │  │
                                    │  │ - send     │    │  - manages   │  │
                                    │  │            │    │    sessions  │  │
                                    │  └─────┬──────┘    └──────┬───────┘  │
                                    │        │                  │          │
                                    │        ▼                  ▼          │
                                    │  ┌─────────────────────────────────┐ │
                                    │  │  SenderGate · GroupGate         │ │
                                    │  │  SessionRouter · ChannelBase    │ │
                                    │  └─────────────────────────────────┘ │
                                    └─────────────────────────────────────┘
                                                     │
                                                     │ stdio (ACP ndjson)
                                                     ▼
                                    ┌─────────────────────────────────────┐
                                    │        qwen-code --acp              │
                                    │   Session A (user alice, id: "abc") │
                                    │   Session B (user bob,   id: "def") │
                                    └─────────────────────────────────────┘
```

**Platform Adapter** – stellt eine Verbindung zur externen API her und übersetzt Nachrichten in Envelopes und zurück. **ACP Bridge** – startet `qwen-code --acp`, verwaltet Sitzungen und emittiert `textChunk`/`toolCall`/`disconnected`-Events. **Session Router** – ordnet Absender über namespaced Keys (`<channel>:<sender>`) ACP-Sitzungen zu. **Sender Gate** / **Group Gate** – Zugriffskontrolle (Allowlist / Pairing / Open) und Mention-Gating. **Channel Base** – abstrakte Basisklasse mit Template-Method-Pattern: Plugins überschreiben `connect`, `sendMessage`, `disconnect`. **Channel Registry** – `Map<string, ChannelPlugin>` mit Kollisionserkennung.

### Envelope

Normalisiertes Nachrichtenformat, in das alle Plattformen konvertieren:

- **Identität**: `senderId`, `senderName`, `chatId`, `channelName`
- **Inhalt**: `text`, optional `imageBase64`/`imageMimeType`, optional `referencedText`
- **Kontext**: `isGroup`, `isMentioned`, `isReplyToBot`, optional `threadId`

Verantwortlichkeiten des Plugins: `senderId` muss stabil/eindeutig sein; `chatId` muss zwischen DMs und Gruppen unterscheiden; boolesche Flags müssen für die Gate-Logik korrekt sein; @Mentions werden aus `text` entfernt.

### Message Flow

```
Inbound:  User message → Adapter → GroupGate → SenderGate → Slash commands → SessionRouter → AcpBridge → Agent
Outbound: Agent response → AcpBridge → SessionRouter → Adapter → User
```

Slash-Commands (`/clear`, `/help`, `/status`) werden in ChannelBase verarbeitet, bevor sie den Agenten erreichen.

### Sessions

Ein `qwen-code --acp`-Prozess mit mehreren ACP-Sitzungen. Scope pro Channel: **`user`** (Standard), **`thread`** oder **`single`**. Routing-Keys sind namespaced als `<channelName>:<key>`.

### Error Handling

- **Verbindungsfehler** – werden protokolliert; der Dienst läuft weiter, wenn sich mindestens ein Channel verbindet
- **Bridge-Abstürze** – exponentielles Backoff (max. 3 Wiederholungsversuche), `setBridge()` auf allen Channels, Sitzungs-Wiederherstellung
- **Sitzungs-Serialisierung** – pro Sitzung gebildete Promise-Chains verhindern gleichzeitige Prompt-Kollisionen

## Plugin System

Die Architektur ist erweiterbar – neue Adapter (auch von Drittanbietern) können hinzugefügt werden, ohne den Core zu ändern. Eingebaute Channels verwenden dieselbe Plugin-Schnittstelle (Dogfooding).

### Plugin Contract

Ein `ChannelPlugin` deklariert `channelType`, `displayName`, `requiredConfigFields` und eine `createChannel()`-Factory. Plugins implementieren drei Methoden:

| Methode                     | Verantwortlichkeit                                |
| --------------------------- | ------------------------------------------------- |
| `connect()`                 | Verbindung zur Plattform herstellen und Message-Handler registrieren |
| `sendMessage(chatId, text)` | Antwort des Agenten formatieren und zustellen     |
| `disconnect()`              | Bereinigung beim Herunterfahren                   |

Bei eingehenden Nachrichten erstellen Plugins ein `Envelope` und rufen `this.handleInbound(envelope)` auf – die Basisklasse übernimmt den Rest: Zugriffskontrolle, Group-Gating, Pairing, Session-Routing, Prompt-Serialisierung, Slash-Commands, Instructions-Injection, Reply-Kontext und Crash-Recovery.

### Extension Points

- Benutzerdefinierte Slash-Commands über `registerCommand()`
- Arbeitsindikatoren durch Wrapping von `handleInbound()` mit Typing-/Reaktionsanzeige
- Tool-Call-Hooks über `onToolCall()`
- Medienverarbeitung durch Anhängen an das Envelope vor `handleInbound()`

### Discovery & Loading

Externe Plugins sind **Extensions**, die vom `ExtensionManager` verwaltet und in `qwen-extension.json` deklariert werden:

```json
{
  "name": "my-channel-extension",
  "version": "1.0.0",
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  }
}
```

Ladesequenz bei `qwen channel start`: Einstellungen laden → Built-ins registrieren → Extensions scannen → dynamischer Import + Validierung → registrieren (Kollisionen ablehnen) → Konfiguration validieren → `createChannel()` → `connect()`.

Plugins laufen im selben Prozess (keine Sandbox), mit demselben Vertrauensmodell wie npm-Abhängigkeiten.

## Configuration

```jsonc
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN", // env var reference
      "senderPolicy": "allowlist", // allowlist | pairing | open
      "allowedUsers": ["123456"],
      "sessionScope": "user", // user | thread | single
      "cwd": "/path/to/project",
      "model": "qwen3.5-plus",
      "instructions": "Keep responses short.",
      "groupPolicy": "disabled", // disabled | allowlist | open
      "groups": { "*": { "requireMention": true } },
    },
  },
}
```

Die Authentifizierung ist plugin-spezifisch: statisches Token (Telegram), App-Credentials (DingTalk), QR-Code-Login (WeChat), Proxy-Token (TMCP).

## CLI Commands

```bash
# Channels
qwen channel start [name]                     # startet alle oder einen Channel
qwen channel stop                             # stoppt den laufenden Dienst
qwen channel status                           # zeigt Channels, Sitzungen und Uptime an
qwen channel pairing list <ch>                # ausstehende Pairing-Anfragen
qwen channel pairing approve <ch> <code>      # genehmigt eine Anfrage

# Extensions
qwen extensions install <path-or-package>     # installiert
qwen extensions link <local-path>             # Symlink für die Entwicklung
qwen extensions list                          # zeigt installierte an
qwen extensions remove <name>                 # deinstalliert
```

## Package Structure

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ACP process lifecycle, session management
│       ├── SessionRouter.ts # sender ↔ session mapping, persistence
│       ├── SenderGate.ts    # allowlist / pairing / open
│       ├── GroupGate.ts     # group chat policy + mention gating
│       ├── PairingStore.ts  # pairing code generation + approval
│       ├── ChannelBase.ts   # abstract base: routing, slash commands
│       └── types.ts         # Envelope, ChannelConfig, etc.
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## Future Work

### Sicherheit & Gruppenchat

- **Tool-Einschränkungen pro Gruppe** – `tools`/`toolsBySender` Deny-/Allow-Listen pro Gruppe
- **Gruppenkontext-Verlauf** – Ringpuffer kürzlich übersprungener Nachrichten, wird bei @Mention vorangestellt
- **Regex-Mention-Muster** – Fallback-`mentionPatterns` für unzuverlässige @Mention-Metadaten
- **Anweisungen pro Gruppe** – `instructions`-Feld in `GroupConfig` für gruppenbezogene Personas
- **`/activation`-Command** – Runtime-Toggle für `requireMention`, wird auf der Festplatte persistiert

### Betriebliche Tools

- **`qwen channel doctor`** – Konfigurationsvalidierung, Umgebungsvariablen, Bot-Tokens, Netzwerkprüfungen
- **`qwen channel status --probe`** – echte Konnektivitätsprüfungen pro Channel

### Plattform-Erweiterung

- **Discord** – Bot-API + Gateway, Server/Channels/DMs/Threads
- **Slack** – Bolt SDK, Socket Mode, Workspaces/Channels/DMs/Threads

### Multi-Agent

- **Multi-Agent-Routing** – mehrere Agenten mit Bindings pro Channel/Gruppe/Benutzer
- **Broadcast-Gruppen** – mehrere Agenten antworten auf dieselbe Nachricht

### Plugin-Ökosystem

- **Community-Plugin-Template** – `create-qwen-channel`-Scaffolding-Tool
- **Plugin-Registry/Discovery** – `qwen extensions search`, Versionskompatibilität