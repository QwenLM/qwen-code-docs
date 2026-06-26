# Channels-Design

> Externe Messaging-Integrationen für Qwen Code – Interagiere mit einem Agenten über Telegram, WeChat und mehr.
>
> Benutzerdokumentation: [Channels-Übersicht](../../users/features/channels/overview.md).

## Übersicht

Ein **Channel** verbindet eine externe Messaging-Plattform mit einem Qwen-Code-Agenten. Konfiguriert in `settings.json`, verwaltet über `qwen channel`-Subcommands, multi-user (jeder Benutzer erhält eine isolierte ACP-Session).

## Architektur

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

**Platform Adapter** – verbindet sich mit der externen API, übersetzt Nachrichten von/nach Envelopes. **ACP Bridge** – startet `qwen-code --acp`, verwaltet Sessions, emittiert `textChunk`/`toolCall`/`disconnected`-Events. **Session Router** – bildet Absender über namespaced Keys (`<channel>:<sender>`) auf ACP-Sessions ab. **Sender Gate** / **Group Gate** – Zugriffskontrolle (Allowlist / Pairing / Open) und Mention-Gating. **Channel Base** – abstrakte Basis mit Template-Method-Pattern: Plugins überschreiben `connect`, `sendMessage`, `disconnect`. **Channel Registry** – `Map<string, ChannelPlugin>` mit Kollisionserkennung.

### Envelope

Normalisiertes Nachrichtenformat, in das alle Plattformen konvertieren:

- **Identity**: `senderId`, `senderName`, `chatId`, `channelName`
- **Content**: `text`, optional `imageBase64`/`imageMimeType`, optional `referencedText`
- **Context**: `isGroup`, `isMentioned`, `isReplyToBot`, optional `threadId`

Plugin-Verantwortlichkeiten: `senderId` muss stabil/eindeutig sein; `chatId` muss DMs von Gruppen unterscheiden; boolesche Flags müssen für die Gate-Logik korrekt sein; @-Mentions werden aus `text` entfernt.

### Nachrichtenfluss

```
Inbound:  Benutzernachricht → Adapter → GroupGate → SenderGate → Slash-Befehle → SessionRouter → AcpBridge → Agent
Outbound: Agentenantwort → AcpBridge → SessionRouter → Adapter → Benutzer
```

Slash-Befehle (`/clear`, `/help`, `/status`) werden in ChannelBase behandelt, bevor sie den Agenten erreichen.

### Sessions

Ein `qwen-code --acp`-Prozess mit mehreren ACP-Sessions. Gültigkeitsbereich pro Channel: **`user`** (Standard), **`thread`** oder **`single`**. Routing-Keys sind als `<channelName>:<key>` namespaced.

### Fehlerbehandlung

- **Verbindungsfehler** – werden protokolliert; Dienst läuft weiter, wenn mindestens ein Channel verbunden ist
- **Bridge-Abstürze** – exponentielles Backoff (max. 3 Wiederholungen), `setBridge()` auf allen Channels, Session-Wiederherstellung
- **Session-Serialisierung** – pro Session verkettete Promise-Chains verhindern konkurrierende Prompt-Kollisionen

## Plugin-System

Die Architektur ist erweiterbar – neue Adapter (auch von Drittanbietern) können hinzugefügt werden, ohne den Kern zu ändern. Integrierte Channels verwenden dieselbe Plugin-Schnittstelle (Dogfooding).

### Plugin-Vertrag

Ein `ChannelPlugin` deklariert `channelType`, `displayName`, `requiredConfigFields` und eine `createChannel()`-Factory. Plugins implementieren drei Methoden:

| Methode                       | Verantwortung                                            |
| ----------------------------- | -------------------------------------------------------- |
| `connect()`                   | Mit Plattform verbinden und Nachrichten-Handler registrieren |
| `sendMessage(chatId, text)`   | Agentenantwort formatieren und ausliefern                |
| `disconnect()`                | Bei Herunterfahren aufräumen                             |

Bei eingehenden Nachrichten bauen Plugins ein `Envelope` und rufen `this.handleInbound(envelope)` auf – die Basisklasse übernimmt den Rest: Zugriffskontrolle, Gruppen-Gating, Pairing, Session-Routing, Prompt-Serialisierung, Slash-Befehle, Instructions-Injektion, Reply-Kontext und Crash-Recovery.

### Erweiterungspunkte

- Benutzerdefinierte Slash-Befehle über `registerCommand()`
- Arbeitsanzeigen durch Wrappern von `handleInbound()` mit Tipp-/Reaktionsanzeige
- Tool-Call-Hooks über `onToolCall()`
- Medienbehandlung durch Anhängen an Envelope vor `handleInbound()`

### Auffinden & Laden

Externe Plugins sind **Extensions**, verwaltet vom `ExtensionManager`, deklariert in `qwen-extension.json`:

```json
{
  "name": "my-channel-extension",
  "version": "1.0.0",
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "Mein Plattform-Channel"
    }
  }
}
```

Ladereihenfolge bei `qwen channel start`: Einstellungen laden → Built-ins registrieren → Extensions scannen → dynamischer Import + validieren → registrieren (Kollisionen ablehnen) → Konfiguration validieren → `createChannel()` → `connect()`.

Plugins laufen im selben Prozess (keine Sandbox), gleiches Vertrauensmodell wie npm-Abhängigkeiten.

## Konfiguration

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

Auth ist plugin-spezifisch: statischer Token (Telegram), App-Anmeldedaten (DingTalk), QR-Code-Login (WeChat), Proxy-Token (TMCP).

## CLI-Befehle

```bash
# Channels
qwen channel start [name]                     # starte alle oder einen Channel
qwen channel stop                             # stoppe laufenden Dienst
qwen channel status                           # zeige Channels, Sessions, Laufzeit
qwen channel pairing list <ch>                # ausstehende Pairing-Anfragen
qwen channel pairing approve <ch> <code>      # genehmige eine Anfrage

# Extensions
qwen extensions install <path-or-package>     # installieren
qwen extensions link <local-path>             # Symlink für Entwicklung
qwen extensions list                          # installierte anzeigen
qwen extensions remove <name>                 # deinstallieren
```

## Paketstruktur

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ACP-Prozess-Lebenszyklus, Session-Management
│       ├── SessionRouter.ts # Absender ↔ Session-Mapping, Persistenz
│       ├── SenderGate.ts    # Allowlist / Pairing / Open
│       ├── GroupGate.ts     # Gruppen-Chat-Richtlinie + Mention-Gating
│       ├── PairingStore.ts  # Pairing-Code-Generierung + -Genehmigung
│       ├── ChannelBase.ts   # Abstrakte Basis: Routing, Slash-Befehle
│       └── types.ts         # Envelope, ChannelConfig, etc.
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## Zukünftige Arbeiten

### Sicherheit & Gruppen-Chat

- **Pro-Gruppen-Tool-Einschränkungen** – `tools`/`toolsBySender`-Deny-/Allow-Listen pro Gruppe
- **Gruppenkontext-Verlauf** – Ringpuffer der letzten übersprungenen Nachrichten, bei @-Mention vorangestellt
- **Regex-Mention-Muster** – Fallback `mentionPatterns` für unzuverlässige @-Mention-Metadaten
- **Pro-Gruppen-Instructions** – `instructions`-Feld auf `GroupConfig` für gruppenspezifische Personas
- **`/activation`-Befehl** – Laufzeit-Umschaltung für `requireMention`, auf Festplatte gespeichert

### Betriebliche Werkzeuge

- **`qwen channel doctor`** – Konfigurationsvalidierung, Umgebungsvariablen, Bot-Tokens, Netzwerkprüfungen
- **`qwen channel status --probe`** – echte Konnektivitätsprüfungen pro Channel

### Plattformerweiterung

- **Discord** – Bot-API + Gateway, Server/Channels/DMs/Threads
- **Slack** – Bolt SDK, Socket Mode, Workspaces/Channels/DMs/Threads

### Multi-Agent

- **Multi-Agent-Routing** – mehrere Agenten mit Bindungen pro Channel/Gruppe/Benutzer
- **Broadcast-Gruppen** – mehrere Agenten antworten auf dieselbe Nachricht

### Plugin-Ökosystem

- **Community-Plugin-Vorlage** – `create-qwen-channel`-Scaffolding-Tool
- **Plugin-Registry/Discovery** – `qwen extensions search`, Versionskompatibilität