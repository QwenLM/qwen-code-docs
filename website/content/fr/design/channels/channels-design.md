# Conception des canaux

> Intégrations de messagerie externes pour Qwen Code — interagissez avec un agent depuis Telegram, WeChat et plus.
>
> Documentation utilisateur : [Vue d'ensemble des canaux](../../users/features/channels/overview.md).

## Vue d'ensemble

Un **canal** connecte une plateforme de messagerie externe à un agent Qwen Code. Configuré dans `settings.json`, géré via les sous-commandes `qwen channel`, multi-utilisateur (chaque utilisateur reçoit une session ACP isolée).

## Architecture

```
┌──────────┐                        ┌─────────────────────────────────────┐
│ Telegram │    API de la plateforme│        Service Canal                │
│ UtilisateurA│◄──────────────────────►│                                     │
├──────────┤  (WebSocket/polling)   │  ┌───────────┐    ┌──────────────┐  │
│ WeChat   │◄──────────────────────►│  │ Adaptateur│    │ Pont ACP     │  │
│ UtilisateurB│                        │  Plateforme│    │  (partagé)   │  │
└──────────┘                        │  │            │    │              │  │
                                    │  │ - connecter│    │  - lance     │  │
                                    │  │ - recevoir │    │    qwen-code │  │
                                    │  │ - envoyer  │    │  - gère      │  │
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

**Adaptateur Plateforme** — se connecte à l'API externe, traduit les messages vers/depuis des Enveloppes. **Pont ACP** — lance `qwen-code --acp`, gère les sessions, émet des événements `textChunk`/`toolCall`/`disconnected`. **Routeur de Session** — associe les expéditeurs aux sessions ACP via des clés nommées (`<canal>:<expéditeur>`). **Porte d'Expéditeur** / **Porte de Groupe** — contrôle d'accès (liste d'autorisation / appariement / ouvert) et filtrage par mention. **Base Canal** — classe abstraite avec motif Template Method : les plugins surchargent `connect`, `sendMessage`, `disconnect`. **Registre des Canaux** — `Map<string, ChannelPlugin>` avec détection de collision.

### Enveloppe

Format de message normalisé vers lequel toutes les plateformes convertissent :

- **Identité** : `senderId`, `senderName`, `chatId`, `channelName`
- **Contenu** : `text`, optionnel `imageBase64`/`imageMimeType`, optionnel `referencedText`
- **Contexte** : `isGroup`, `isMentioned`, `isReplyToBot`, optionnel `threadId`

Responsabilités du plugin : `senderId` doit être stable/unique ; `chatId` doit distinguer les messages directs des groupes ; les indicateurs booléens doivent être précis pour la logique de porte ; les @mentions sont supprimées de `text`.

### Flux de messages

```
Entrant : Message utilisateur → Adaptateur → GroupGate → SenderGate → Commandes slash → SessionRouter → AcpBridge → Agent
Sortant : Réponse agent → AcpBridge → SessionRouter → Adaptateur → Utilisateur
```

Les commandes slash (`/clear`, `/help`, `/status`) sont traitées dans ChannelBase avant d'atteindre l'agent.

### Sessions

Un processus `qwen-code --acp` avec plusieurs sessions ACP. Portée par canal : **`user`** (par défaut), **`thread`**, ou **`single`**. Les clés de routage sont nommées `<channelName>:<key>`.

### Gestion des erreurs

- **Échecs de connexion** — consignés ; le service continue si au moins un canal se connecte
- **Plantages du pont** — backoff exponentiel (max 3 tentatives), `setBridge()` sur tous les canaux, restauration de session
- **Sérialisation des sessions** — chaînes de promesses par session empêchent les collisions de requêtes simultanées

## Système de plugins

L'architecture est extensible — de nouveaux adaptateurs (y compris tiers) peuvent être ajoutés sans modifier le cœur. Les canaux intégrés utilisent la même interface de plugin (dogfooding).

### Contrat du plugin

Un `ChannelPlugin` déclare `channelType`, `displayName`, `requiredConfigFields`, et une fabrique `createChannel()`. Les plugins implémentent trois méthodes :

| Méthode                      | Responsabilité                                    |
| --------------------------- | ------------------------------------------------- |
| `connect()`                 | Se connecter à la plateforme et enregistrer les gestionnaires de messages |
| `sendMessage(chatId, text)` | Formater et délivrer la réponse de l'agent        |
| `disconnect()`              | Nettoyer lors de l'arrêt                          |

Sur les messages entrants, les plugins construisent une `Envelope` et appellent `this.handleInbound(envelope)` — la classe de base gère le reste : contrôle d'accès, filtrage de groupe, appariement, routage de session, sérialisation des requêtes, commandes slash, injection d'instructions, contexte de réponse, et récupération après plantage.

### Points d'extension

- Commandes slash personnalisées via `registerCommand()`
- Indicateurs d'activité en enveloppant `handleInbound()` avec un affichage de frappe/réaction
- Hooks d'appel d'outils via `onToolCall()`
- Gestion des médias en les attachant à l'Enveloppe avant `handleInbound()`

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

Séquence de chargement au `qwen channel start` : charger les paramètres → enregistrer les plugins intégrés → scanner les extensions → import dynamique + validation → enregistrer (rejeter les collisions) → valider la config → `createChannel()` → `connect()`.

Les plugins s'exécutent dans le processus (pas de bac à sable), même modèle de confiance que les dépendances npm.

## Configuration

```jsonc
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN", // référence de variable d'environnement
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

L'authentification est spécifique au plugin : token statique (Telegram), identifiants d'application (DingTalk), connexion par QR code (WeChat), token proxy (TMCP).

## Commandes CLI

```bash
# Canaux
qwen channel start [name]                     # démarrer tous les canaux ou un seul
qwen channel stop                             # arrêter le service en cours
qwen channel status                           # afficher les canaux, sessions, temps d'activité
qwen channel pairing list <ch>                # demandes d'appariement en attente
qwen channel pairing approve <ch> <code>      # approuver une demande

# Extensions
qwen extensions install <path-or-package>     # installer
qwen extensions link <local-path>             # lien symbolique pour le développement
qwen extensions list                          # afficher les extensions installées
qwen extensions remove <name>                 # désinstaller
```

## Structure du paquet

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # Cycle de vie du processus ACP, gestion des sessions
│       ├── SessionRouter.ts # Association expéditeur ↔ session, persistance
│       ├── SenderGate.ts    # Liste d'autorisation / appariement / ouvert
│       ├── GroupGate.ts     # Politique de groupe + filtrage par mention
│       ├── PairingStore.ts  # Génération et approbation des codes d'appariement
│       ├── ChannelBase.ts   # Classe abstraite : routage, commandes slash
│       └── types.ts         # Enveloppe, ChannelConfig, etc.
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## Travaux futurs

### Sécurité et discussions de groupe

- **Restrictions d'outils par groupe** — listes d'interdiction/autorisation `tools`/`toolsBySender` par groupe
- **Historique du contexte de groupe** — tampon circulaire des messages ignorés récents, ajouté en préfixe lors d'une @mention
- **Motifs de mention regex** — `mentionPatterns` de secours pour les métadonnées de @mention peu fiables
- **Instructions par groupe** — champ `instructions` sur `GroupConfig` pour des personas par groupe
- **Commande `/activation`** — bascule à l'exécution pour `requireMention`, persistée sur le disque

### Outils opérationnels

- **`qwen channel doctor`** — validation de configuration, variables d'environnement, jetons de bot, vérifications réseau
- **`qwen channel status --probe`** — vérifications de connectivité réelles par canal

### Extension de plateforme

- **Discord** — API Bot + Gateway, serveurs/canaux/messages directs/fils
- **Slack** — SDK Bolt, mode Socket, espaces de travail/canaux/messages directs/fils

### Multi-agents

- **Routage multi-agents** — plusieurs agents avec des liaisons par canal/groupe/utilisateur
- **Groupes de diffusion** — plusieurs agents répondent au même message

### Écosystème de plugins

- **Modèle de plugin communautaire** — outil de génération `create-qwen-channel`
- **Registre/découverte de plugins** — `qwen extensions search`, compatibilité de version