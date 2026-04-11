# Architecture des canaux

> Intégrations de messagerie externe pour Qwen Code — interagissez avec un agent depuis Telegram, WeChat et plus encore.
>
> Documentation utilisateur : [Vue d'ensemble des canaux](../../users/features/channels/overview.md).

## Vue d'ensemble

Un **canal** connecte une plateforme de messagerie externe à un agent Qwen Code. Il est configuré dans `settings.json`, géré via les sous-commandes `qwen channel`, et prend en charge plusieurs utilisateurs (chaque utilisateur obtient une session ACP isolée).

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

**Adaptateur de plateforme** — se connecte à l'API externe et traduit les messages vers/depuis des `Envelope`. **Pont ACP** — lance `qwen-code --acp`, gère les sessions et émet les événements `textChunk`/`toolCall`/`disconnected`. **Routeur de session** — mappe les expéditeurs aux sessions ACP via des clés avec espace de noms (`<channel>:<sender>`). **Sender Gate** / **Group Gate** — contrôle d'accès (liste d'autorisation / appairage / ouvert) et filtrage des mentions. **Channel Base** — classe de base abstraite suivant le patron Template Method : les plugins surchargent `connect`, `sendMessage`, `disconnect`. **Registre de canaux** — `Map<string, ChannelPlugin>` avec détection de collisions.

### Envelope

Format de message normalisé vers lequel toutes les plateformes convertissent leurs données :

- **Identité** : `senderId`, `senderName`, `chatId`, `channelName`
- **Contenu** : `text`, `imageBase64`/`imageMimeType` (optionnel), `referencedText` (optionnel)
- **Contexte** : `isGroup`, `isMentioned`, `isReplyToBot`, `threadId` (optionnel)

Responsabilités du plugin : `senderId` doit être stable et unique ; `chatId` doit distinguer les messages privés des groupes ; les indicateurs booléens doivent être précis pour la logique des portails ; les @mentions sont supprimées de `text`.

### Flux de messages

```
Inbound:  User message → Adapter → GroupGate → SenderGate → Slash commands → SessionRouter → AcpBridge → Agent
Outbound: Agent response → AcpBridge → SessionRouter → Adapter → User
```

Les commandes slash (`/clear`, `/help`, `/status`) sont traitées dans `ChannelBase` avant d'atteindre l'agent.

### Sessions

Un seul processus `qwen-code --acp` avec plusieurs sessions ACP. Portée par canal : **`user`** (par défaut), **`thread`** ou **`single`**. Clés de routage préfixées sous la forme `<channelName>:<key>`.

### Gestion des erreurs

- **Échecs de connexion** — journalisés ; le service continue si au moins un canal se connecte
- **Plantages du pont** — backoff exponentiel (max. 3 tentatives), appel de `setBridge()` sur tous les canaux, restauration des sessions
- **Sérialisation des sessions** — les chaînes de promesses par session évitent les collisions de prompts concurrents

## Système de plugins

L'architecture est extensible : de nouveaux adaptateurs (y compris tiers) peuvent être ajoutés sans modifier le cœur. Les canaux intégrés utilisent la même interface de plugin (dogfooding).

### Contrat du plugin

Un `ChannelPlugin` déclare `channelType`, `displayName`, `requiredConfigFields` et une fabrique `createChannel()`. Les plugins implémentent trois méthodes :

| Méthode                     | Responsabilité                                    |
| --------------------------- | ------------------------------------------------- |
| `connect()`                 | Se connecter à la plateforme et enregistrer les gestionnaires de messages |
| `sendMessage(chatId, text)` | Formater et envoyer la réponse de l'agent           |
| `disconnect()`              | Effectuer le nettoyage à l'arrêt                    |

Pour les messages entrants, les plugins construisent une `Envelope` et appellent `this.handleInbound(envelope)` — la classe de base gère le reste : contrôle d'accès, filtrage de groupe, appairage, routage de session, sérialisation des prompts, commandes slash, injection d'instructions, contexte de réponse et récupération après plantage.

### Points d'extension

- Commandes slash personnalisées via `registerCommand()`
- Indicateurs d'activité en enveloppant `handleInbound()` avec l'affichage de la saisie/réaction
- Hooks d'appel d'outils via `onToolCall()`
- Gestion des médias en les attachant à l'`Envelope` avant `handleInbound()`

### Découverte et chargement

Les plugins externes sont des **extensions** gérées par `ExtensionManager`, déclarées dans `qwen-extension.json` :

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

Séquence de chargement lors de `qwen channel start` : chargement des paramètres → enregistrement des intégrés → analyse des extensions → import dynamique + validation → enregistrement (rejet des collisions) → validation de la config → `createChannel()` → `connect()`.

Les plugins s'exécutent dans le même processus (pas de sandbox), avec le même modèle de confiance que les dépendances npm.

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

L'authentification est spécifique au plugin : jeton statique (Telegram), identifiants d'application (DingTalk), connexion par QR code (WeChat), jeton proxy (TMCP).

## Commandes CLI

```bash
# Canaux
qwen channel start [name]                     # démarre tous les canaux ou un seul
qwen channel stop                             # arrête le service en cours
qwen channel status                           # affiche les canaux, sessions et temps de fonctionnement
qwen channel pairing list <ch>                # demandes d'appairage en attente
qwen channel pairing approve <ch> <code>      # approuve une demande

# Extensions
qwen extensions install <path-or-package>     # installe
qwen extensions link <local-path>             # lien symbolique pour le développement
qwen extensions list                          # affiche les extensions installées
qwen extensions remove <name>                 # désinstalle
```

## Structure du package

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # Cycle de vie du processus ACP, gestion des sessions
│       ├── SessionRouter.ts # Mappage expéditeur ↔ session, persistance
│       ├── SenderGate.ts    # Liste d'autorisation / appairage / ouvert
│       ├── GroupGate.ts     # Politique de chat de groupe + filtrage des mentions
│       ├── PairingStore.ts  # Génération et approbation des codes d'appairage
│       ├── ChannelBase.ts   # Base abstraite : routage, commandes slash
│       └── types.ts         # Envelope, ChannelConfig, etc.
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## Travaux futurs

### Sécurité et chat de groupe

- **Restrictions d'outils par groupe** — listes d'interdiction/autorisation `tools`/`toolsBySender` par groupe
- **Historique du contexte de groupe** — tampon circulaire des messages récents ignorés, préfixé lors d'une @mention
- **Motifs de mention Regex** — `mentionPatterns` de secours pour les métadonnées @mention peu fiables
- **Instructions par groupe** — champ `instructions` sur `GroupConfig` pour des personnalités par groupe
- **Commande `/activation`** — bascule à l'exécution pour `requireMention`, persistée sur le disque

### Outillage opérationnel

- **`qwen channel doctor`** — validation de la config, variables d'environnement, jetons de bot, vérifications réseau
- **`qwen channel status --probe`** — vérifications réelles de connectivité par canal

### Expansion des plateformes

- **Discord** — Bot API + Gateway, serveurs/canaux/MP/fils
- **Slack** — Bolt SDK, Socket Mode, espaces de travail/canaux/MP/fils

### Multi-agent

- **Routage multi-agent** — plusieurs agents avec des liaisons par canal/groupe/utilisateur
- **Groupes de diffusion** — plusieurs agents répondent au même message

### Écosystème de plugins

- **Modèle de plugin communautaire** — outil de génération de squelette `create-qwen-channel`
- **Registre/découverte de plugins** — `qwen extensions search`, compatibilité des versions