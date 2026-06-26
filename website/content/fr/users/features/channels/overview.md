# Canaux

Les canaux vous permettent d'interagir avec un agent Qwen Code depuis des plateformes de messagerie comme Telegram, WeChat, QQ ou DingTalk, plutôt que depuis le terminal. Vous envoyez des messages depuis votre téléphone ou votre application de chat sur ordinateur, et l'agent répond comme il le ferait dans la CLI.

## Comment ça fonctionne

Lorsque vous exécutez `qwen channel start`, Qwen Code :

1. Lit les configurations des canaux depuis votre `settings.json`
2. Lance un seul processus d'agent en utilisant le [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Se connecte à chaque plateforme de messagerie et commence à écouter les messages
4. Achemine les messages entrants vers l'agent et renvoie les réponses au bon chat

Tous les canaux partagent un même processus d'agent avec des sessions isolées par utilisateur. Chaque canal peut avoir son propre répertoire de travail, son modèle et ses instructions.

## Démarrage rapide

1. Configurez un bot sur votre plateforme de messagerie (voir les guides spécifiques aux canaux : [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk))
2. Ajoutez la configuration du canal dans `~/.qwen/settings.json`
3. Exécutez `qwen channel start` pour démarrer tous les canaux, ou `qwen channel start <nom>` pour un seul canal

Vous souhaitez connecter une plateforme qui n'est pas intégrée ? Consultez [Plugins](./plugins) pour ajouter un adaptateur personnalisé en tant qu'extension.

## Configuration

Les canaux sont configurés sous la clé `channels` dans `settings.json`. Chaque canal a un nom et un ensemble d'options :

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "token": "$MY_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["123456789"],
      "sessionScope": "user",
      "cwd": "/path/to/working/directory",
      "instructions": "Optional system instructions for the agent.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Options

| Option                   | Requis | Description                                                                                                                                        |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Oui    | Type de canal : `telegram`, `weixin`, `qq`, `dingtalk`, `feishu`, ou un type personnalisé provenant d'une extension (voir [Plugins](./plugins))    |
| `token`                  | Telegram | Jeton du bot. Prend en charge la syntaxe `$ENV_VAR` pour lire depuis les variables d'environnement. Non nécessaire pour WeChat ou DingTalk        |
| `clientId`               | DingTalk | AppKey DingTalk. Prend en charge la syntaxe `$ENV_VAR`                                                                                            |
| `clientSecret`           | DingTalk | AppSecret DingTalk. Prend en charge la syntaxe `$ENV_VAR`                                                                                         |
| `model`                  | Non     | Modèle à utiliser pour ce canal (par ex., `qwen3.5-plus`). Remplace le modèle par défaut. Utile pour les modèles multimodaux qui prennent en charge l'entrée d'images |
| `senderPolicy`           | Non     | Qui peut parler au bot : `allowlist` (par défaut), `open` ou `pairing`                                                                             |
| `allowedUsers`           | Non     | Liste des ID d'utilisateurs autorisés à utiliser le bot (utilisé par les politiques `allowlist` et `pairing`)                                      |
| `sessionScope`           | Non     | Comment les sessions sont délimitées : `user` (par défaut), `thread` ou `single`                                                                   |
| `cwd`                    | Non     | Répertoire de travail de l'agent. Par défaut, le répertoire courant                                                                                |
| `instructions`           | Non     | Instructions personnalisées ajoutées au premier message de chaque session                                                                          |
| `groupPolicy`            | Non     | Accès aux discussions de groupe : `disabled` (par défaut), `allowlist` ou `open`. Voir [Discussions de groupe](#group-chats)                        |
| `groups`                 | Non     | Paramètres par groupe. Les clés sont des ID de groupe ou `"*"` pour les valeurs par défaut. Voir [Discussions de groupe](#group-chats)              |
| `dispatchMode`           | Non     | Que se passe-t-il lorsque vous envoyez un message pendant que le bot est occupé : `steer` (par défaut), `collect` ou `followup`. Voir [Modes d'envoi](#dispatch-modes) |
| `blockStreaming`         | Non     | Livraison progressive des réponses : `on` ou `off` (par défaut). Voir [Diffusion par blocs](#block-streaming)                                       |
| `blockStreamingChunk`    | Non     | Limites de taille des blocs : `{ "minChars": 400, "maxChars": 1000 }`. Voir [Diffusion par blocs](#block-streaming)                                 |
| `blockStreamingCoalesce` | Non     | Vidage en cas d'inactivité : `{ "idleMs": 1500 }`. Voir [Diffusion par blocs](#block-streaming)                                                    |
### Sender Policy

Controls who can interact with the bot:

- **`allowlist`** (par défaut) — Seuls les utilisateurs listés dans `allowedUsers` peuvent envoyer des messages. Les autres sont silencieusement ignorés.
- **`pairing`** — Les expéditeurs inconnus reçoivent un code d'appairage. L'opérateur du bot les approuve via la CLI, et ils sont ajoutés à une liste blanche persistante. Les utilisateurs dans `allowedUsers` sautent entièrement l'appairage. Voir [DM Pairing](#dm-pairing) ci-dessous.
- **`open`** — N'importe qui peut envoyer des messages. À utiliser avec prudence.

### Session Scope

Contrôle la gestion des sessions de conversation :

- **`user`** (par défaut) — Une session par utilisateur. Tous les messages d'un même utilisateur partagent une conversation.
- **`thread`** — Une session par fil/sujet. Utile pour les discussions de groupe avec des fils.
- **`single`** — Une session partagée pour tous les utilisateurs. Tout le monde partage la même conversation.

### Token Security

Les jetons du bot ne doivent pas être stockés directement dans `settings.json`. Utilisez plutôt des références de variables d'environnement :

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Définissez le jeton réel dans votre environnement shell ou dans un fichier `.env` chargé avant d'exécuter le canal.

## DM Pairing

Lorsque `senderPolicy` est défini sur `"pairing"`, les expéditeurs inconnus passent par un processus d'approbation :

1. Un utilisateur inconnu envoie un message au bot
2. Le bot répond avec un code d'appairage de 8 caractères (ex. : `VEQDDWXJ`)
3. L'utilisateur partage le code avec vous (l'opérateur du bot)
4. Vous l'approuvez via la CLI :

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Une fois approuvé, l'ID de l'utilisateur est enregistré dans `~/.qwen/channels/<name>-allowlist.json` et tous les futurs messages passent normalement.

### Pairing CLI Commands

```bash
# Liste des demandes d'appairage en attente
qwen channel pairing list my-channel

# Approuve une demande par code
qwen channel pairing approve my-channel <CODE>
```

### Pairing Rules

- Les codes comportent 8 caractères, en majuscules, utilisant un alphabet non ambigu (pas de `0`/`O`/`1`/`I`)
- Les codes expirent après 1 heure
- Maximum de 3 demandes en attente par canal à la fois — les demandes supplémentaires sont ignorées jusqu'à expiration ou approbation
- Les utilisateurs listés dans `allowedUsers` dans `settings.json` sautent toujours l'appairage
- Les utilisateurs approuvés sont stockés dans `~/.qwen/channels/<name>-allowlist.json` — traitez ce fichier comme sensible

## Group Chats

Par défaut, le bot fonctionne uniquement dans les messages directs. Pour activer la prise en charge des discussions de groupe, définissez `groupPolicy` sur `"allowlist"` ou `"open"`.

### Group Policy

Contrôle si le bot participe aux discussions de groupe :

- **`disabled`** (par défaut) — Le bot ignore tous les messages de groupe. Option la plus sûre.
- **`allowlist`** — Le bot répond uniquement dans les groupes explicitement listés dans `groups` par ID de chat. La clé `"*"` fournit des paramètres par défaut mais n'agit **pas** comme une autorisation générique.
- **`open`** — Le bot répond dans tous les groupes auxquels il est ajouté. À utiliser avec prudence.

### Mention Gating

Dans les groupes, le bot exige par défaut une `@mention` ou une réponse à l'un de ses messages. Cela évite que le bot réponde à chaque message dans un chat de groupe.

Configurez par groupe avec le paramètre `groups` :

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Paramètres par défaut pour tous les groupes. Définit uniquement les valeurs par défaut, pas une entrée de liste blanche.
- **ID du chat de groupe** — Remplace les paramètres pour un groupe spécifique. Écrase les valeurs par défaut de `"*"`.
- **`requireMention`** (par défaut : `true`) — Quand `true`, le bot répond uniquement aux messages qui le mentionnent @ ou répondent à l'un de ses messages. Quand `false`, le bot répond à tous les messages (utile pour les groupes de tâches dédiés).

### How group messages are evaluated

```
1. groupPolicy — ce groupe est-il autorisé ?                (non → ignorer)
2. requireMention — le bot a-t-il été mentionné/répondu ?  (non → ignorer)
3. senderPolicy — cet expéditeur est-il approuvé ?         (non → processus d'appairage)
4. Acheminer vers la session
```

### Telegram Setup for Groups

1. Ajoutez le bot à un groupe
2. **Désactivez le mode confidentialité** dans BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — sinon le bot ne verra pas les messages non-commandes
3. **Supprimez et réajoutez le bot** au groupe après avoir changé le mode confidentialité (Telegram met en cache ce paramètre)

### Finding a Group Chat ID

Pour trouver l'ID d'un chat de groupe pour la liste blanche `groups` :

1. Arrêtez le bot s'il est en cours d'exécution
2. Envoyez un message mentionnant le bot dans le groupe
3. Utilisez l'API Telegram Bot pour vérifier les mises à jour en file d'attente :

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Cherchez `message.chat.id` dans la réponse — les IDs de groupe sont des nombres négatifs (ex. : `-5170296765`).

## Media Support

Les canaux prennent en charge l'envoi d'images et de fichiers à l'agent, pas seulement du texte.

### Images

Envoyez une photo au bot et l'agent la verra — utile pour partager des captures d'écran, des messages d'erreur ou des diagrammes. L'image est envoyée directement au modèle comme entrée visuelle.

Pour utiliser la prise en charge des images, configurez un modèle multimodal pour le canal :

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "model": "qwen3.5-plus",
      ...
    }
  }
}
```
### Fichiers

Envoyez un document (PDF, fichier de code, fichier texte, etc.) au bot. Le fichier est téléchargé et enregistré dans un répertoire temporaire, et le chemin du fichier est communiqué à l'agent afin qu'il puisse en lire le contenu à l'aide de ses outils de lecture de fichiers.

Les fichiers fonctionnent avec n'importe quel modèle — aucune prise en charge multimodale requise.

### Différences entre plateformes

| Fonctionnalité | Telegram                                     | WeChat                           | DingTalk                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Images   | Téléchargement direct via l'API Bot          | Téléchargement CDN avec déchiffrement AES | API downloadCode (en deux étapes)                   |
| Fichiers    | Téléchargement direct via l'API Bot (limite de 20 Mo)     | Téléchargement CDN avec déchiffrement AES | API downloadCode (en deux étapes)                   |
| Légendes | Légendes des photos/fichiers incluses comme texte du message | Non applicable                   | Texte enrichi : texte et images mélangés dans un seul message |

## Modes de dispatch

Contrôle ce qui se produit lorsque vous envoyez un nouveau message alors que le bot est encore en train de traiter un précédent.

- **`steer`** (par défaut) — Le bot annule la requête en cours et commence à travailler sur votre nouveau message. Idéal pour une conversation normale, où un suivi signifie généralement que vous souhaitez corriger ou rediriger le bot.
- **`collect`** — Vos nouveaux messages sont mis en mémoire tampon. Lorsque la requête en cours se termine, tous les messages mis en mémoire tampon sont combinés en une seule requête de suivi. Utile pour les workflows asynchrones où vous souhaitez mettre en file d'attente des réflexions.
- **`followup`** — Chaque message est mis en file d'attente et traité comme son propre tour séparé, dans l'ordre. Utile pour les workflows par lots où chaque message est indépendant.

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "dispatchMode": "steer",
      ...
    }
  }
}
```

Vous pouvez également définir le mode de dispatch par groupe, en remplaçant la valeur par défaut du canal :

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Diffusion par blocs

Par défaut, l'agent travaille pendant un certain temps puis envoie une seule réponse volumineuse. Avec la diffusion par blocs activée, la réponse arrive sous forme de plusieurs messages plus courts pendant que l'agent travaille encore — similaire à la façon dont ChatGPT ou Claude affichent une sortie progressive.

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "blockStreaming": "on",
      "blockStreamingChunk": { "minChars": 400, "maxChars": 1000 },
      "blockStreamingCoalesce": { "idleMs": 1500 },
      ...
    }
  }
}
```

### Comment ça fonctionne

- La réponse de l'agent est divisée en blocs aux limites des paragraphes et envoyée sous forme de messages séparés
- `minChars` (valeur par défaut 400) — n'envoie pas un bloc tant qu'il n'a pas au moins cette longueur, pour éviter d'envoyer des messages minuscules en abondance
- `maxChars` (valeur par défaut 1000) — si un bloc atteint cette longueur sans pause naturelle, envoyez-le quand même
- `idleMs` (valeur par défaut 1500) — si l'agent fait une pause (par exemple, exécution d'un outil), envoyez ce qui a été mis en mémoire tampon jusqu'à présent
- Lorsque l'agent termine, tout texte restant est envoyé immédiatement

Seul `blockStreaming` est requis. Les paramètres de chunk et de coalesce sont facultatifs et ont des valeurs par défaut sensées.

## Commandes Slash

Les canaux prennent en charge les commandes slash. Elles sont traitées localement (sans aller-retour avec l'agent) :

- `/help` — Liste les commandes disponibles
- `/clear` — Efface votre session et recommence à zéro (alias : `/reset`, `/new`)
- `/status` — Affiche les informations de session et la politique d'accès

Toutes les autres commandes slash (par exemple, `/compress`, `/summary`) sont transmises à l'agent.

Ces commandes fonctionnent sur tous les types de canaux (Telegram, WeChat, QQ, DingTalk).

## Exécution

```bash
# Start all configured channels (shared agent process)
qwen channel start

# Start a single channel
qwen channel start my-channel

# Check if the service is running
qwen channel status

# Stop the running service
qwen channel stop
```

Le bot s'exécute au premier plan. Appuyez sur `Ctrl+C` pour l'arrêter, ou utilisez `qwen channel stop` depuis un autre terminal.

### Mode Multi-canal

Lorsque vous exécutez `qwen channel start` sans nom, tous les canaux définis dans `settings.json` démarrent ensemble en partageant un seul processus d'agent. Chaque canal maintient ses propres sessions — un utilisateur Telegram et un utilisateur WeChat obtiennent des conversations séparées, même s'ils partagent le même agent.

Chaque canal utilise son propre `cwd` depuis sa configuration, de sorte que différents canaux peuvent travailler sur différents projets simultanément.

### Gestion du service

Le service de canaux utilise un fichier PID (`~/.qwen/channels/service.pid`) pour suivre l'instance en cours d'exécution :

- **Prévention des doublons** : Exécuter `qwen channel start` alors qu'un service est déjà en cours d'exécution affichera une erreur au lieu de démarrer une seconde instance
- **`qwen channel stop`** : Arrête gracieusement le service en cours d'exécution depuis un autre terminal
- **`qwen channel status`** : Affiche si le service est en cours d'exécution, sa durée de fonctionnement, et le nombre de sessions par canal

### Récupération après crash

Si le processus de l'agent plante de manière inattendue, le service de canaux le redémarre automatiquement et tente de restaurer toutes les sessions actives. Les utilisateurs peuvent continuer leurs conversations sans recommencer.
- Les sessions sont persistées dans `~/.qwen/channels/sessions.json` pendant que le service est en cours d'exécution
- En cas de crash : l'agent redémarre dans les 3 secondes et recharge les sessions sauvegardées
- Après 3 crashs consécutifs, le service se termine avec une erreur
- Lors d'un arrêt propre (Ctrl+C ou `qwen channel stop`) : les données de session sont effacées — le prochain démarrage est toujours vierge
