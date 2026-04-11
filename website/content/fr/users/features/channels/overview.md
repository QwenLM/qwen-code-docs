# Channels

Les channels vous permettent d'interagir avec un agent Qwen Code depuis des plateformes de messagerie comme Telegram, WeChat ou DingTalk, au lieu du terminal. Vous envoyez des messages depuis votre application de chat mobile ou desktop, et l'agent répond exactement comme il le ferait dans le CLI.

## Fonctionnement

Lorsque vous exécutez `qwen channel start`, Qwen Code :

1. Lit les configurations des channels depuis votre `settings.json`
2. Démarre un unique processus agent en utilisant le [Agent Client Protocol (ACP)](../../developers/architecture)
3. Se connecte à chaque plateforme de messagerie et commence à écouter les messages
4. Achemine les messages entrants vers l'agent et renvoie les réponses vers le bon chat

Tous les channels partagent un même processus agent avec des sessions isolées par utilisateur. Chaque channel peut avoir son propre répertoire de travail, son modèle et ses instructions.

## Démarrage rapide

1. Configurez un bot sur votre plateforme de messagerie (consultez les guides spécifiques : [Telegram](./telegram), [WeChat](./weixin), [DingTalk](./dingtalk))
2. Ajoutez la configuration du channel à `~/.qwen/settings.json`
3. Exécutez `qwen channel start` pour démarrer tous les channels, ou `qwen channel start <name>` pour un channel unique

Vous souhaitez connecter une plateforme non prise en charge nativement ? Consultez [Plugins](./plugins) pour ajouter un adaptateur personnalisé sous forme d'extension.

## Configuration

Les channels sont configurés sous la clé `channels` dans `settings.json`. Chaque channel possède un nom et un ensemble d'options :

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

| Option                   | Required | Description                                                                                                                                    |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Yes      | Type de channel : `telegram`, `weixin`, `dingtalk`, ou un type personnalisé provenant d'une extension (voir [Plugins](./plugins))                                  |
| `token`                  | Telegram | Token du bot. Prend en charge la syntaxe `$ENV_VAR` pour lire depuis les variables d'environnement. Non requis pour WeChat ou DingTalk                                    |
| `clientId`               | DingTalk | AppKey DingTalk. Prend en charge la syntaxe `$ENV_VAR` syntax                                                                                                    |
| `clientSecret`           | DingTalk | AppSecret DingTalk. Prend en charge la syntaxe `$ENV_VAR` syntax                                                                                                 |
| `model`                  | No       | Modèle à utiliser pour ce channel (ex. `qwen3.5-plus`). Remplace le modèle par défaut. Utile pour les modèles multimodaux prenant en charge les entrées image       |
| `senderPolicy`           | No       | Qui peut parler au bot : `allowlist` (par défaut), `open` ou `pairing`                                                                           |
| `allowedUsers`           | No       | Liste des ID utilisateur autorisés à utiliser le bot (utilisé par les politiques `allowlist` et `pairing`)                                                           |
| `sessionScope`           | No       | Portée des sessions : `user` (par défaut), `thread` ou `single`                                                                               |
| `cwd`                    | No       | Répertoire de travail pour l'agent. Par défaut, le répertoire courant                                                                             |
| `instructions`           | No       | Instructions personnalisées ajoutées au début du premier message de chaque session                                                                             |
| `groupPolicy`            | No       | Accès aux chats de groupe : `disabled` (par défaut), `allowlist` ou `open`. Voir [Chats de groupe](#group-chats)                                               |
| `groups`                 | No       | Paramètres par groupe. Les clés sont les ID de chat de groupe ou `"*"` pour les valeurs par défaut. Voir [Chats de groupe](#group-chats)                                             |
| `dispatchMode`           | No       | Comportement lors de l'envoi d'un message pendant que le bot est occupé : `steer` (par défaut), `collect` ou `followup`. Voir [Modes de dispatch](#dispatch-modes) |
| `blockStreaming`         | No       | Diffusion progressive des réponses : `on` ou `off` (par défaut). Voir [Block Streaming](#block-streaming)                                                |
| `blockStreamingChunk`    | No       | Limites de taille des blocs : `{ "minChars": 400, "maxChars": 1000 }`. Voir [Block Streaming](#block-streaming)                                            |
| `blockStreamingCoalesce` | No       | Vidage en cas d'inactivité : `{ "idleMs": 1500 }`. Voir [Block Streaming](#block-streaming)                                                                      |

### Sender Policy

Contrôle qui peut interagir avec le bot :

- **`allowlist`** (par défaut) — Seuls les utilisateurs listés dans `allowedUsers` peuvent envoyer des messages. Les autres sont ignorés silencieusement.
- **`pairing`** — Les expéditeurs inconnus reçoivent un code d'appairage. L'opérateur du bot les approuve via le CLI, et ils sont ajoutés à une allowlist persistante. Les utilisateurs dans `allowedUsers` contournent entièrement l'appairage. Voir [Appairage en DM](#dm-pairing) ci-dessous.
- **`open`** — Tout le monde peut envoyer des messages. À utiliser avec prudence.

### Session Scope

Contrôle la gestion des sessions de conversation :

- **`user`** (par défaut) — Une session par utilisateur. Tous les messages d'un même utilisateur partagent la même conversation.
- **`thread`** — Une session par fil/sujet. Utile pour les chats de groupe avec des fils de discussion.
- **`single`** — Une session partagée pour tous les utilisateurs. Tout le monde partage la même conversation.

### Sécurité des tokens

Les tokens de bot ne doivent pas être stockés directement dans `settings.json`. Utilisez plutôt des références aux variables d'environnement :

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Définissez le token réel dans votre environnement shell ou dans un fichier `.env` chargé avant le démarrage du channel.

## Appairage en DM

Lorsque `senderPolicy` est défini sur `"pairing"`, les expéditeurs inconnus passent par un flux d'approbation :

1. Un utilisateur inconnu envoie un message au bot
2. Le bot répond avec un code d'appairage de 8 caractères (ex. `VEQDDWXJ`)
3. L'utilisateur vous partage le code (vous, l'opérateur du bot)
4. Vous l'approuvez via le CLI :

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Une fois approuvé, l'ID de l'utilisateur est sauvegardé dans `~/.qwen/channels/<name>-allowlist.json` et tous les messages futurs passent normalement.

### Commandes CLI pour l'appairage

```bash
# Lister les demandes d'appairage en attente
qwen channel pairing list my-channel

# Approuver une demande par code
qwen channel pairing approve my-channel <CODE>
```

### Règles d'appairage

- Les codes font 8 caractères, en majuscules, utilisant un alphabet sans ambiguïté (pas de `0`/`O`/`1`/`I`)
- Les codes expirent après 1 heure
- Maximum 3 demandes en attente par channel à la fois — les demandes supplémentaires sont ignorées jusqu'à ce qu'une demande expire ou soit approuvée
- Les utilisateurs listés dans `allowedUsers` dans `settings.json` contournent toujours l'appairage
- Les utilisateurs approuvés sont stockés dans `~/.qwen/channels/<name>-allowlist.json` — traitez ce fichier comme sensible

## Chats de groupe

Par défaut, le bot fonctionne uniquement en messages directs. Pour activer le support des chats de groupe, définissez `groupPolicy` sur `"allowlist"` ou `"open"`.

### Group Policy

Contrôle si le bot participe ou non aux chats de groupe :

- **`disabled`** (par défaut) — Le bot ignore tous les messages de groupe. Option la plus sûre.
- **`allowlist`** — Le bot répond uniquement dans les groupes explicitement listés dans `groups` par ID de chat. La clé `"*"` fournit les paramètres par défaut mais ne fonctionne **pas** comme un joker d'autorisation.
- **`open`** — Le bot répond dans tous les groupes où il est ajouté. À utiliser avec prudence.

### Filtrage par mention

Dans les groupes, le bot nécessite par défaut une `@mention` ou une réponse à l'un de ses messages. Cela empêche le bot de répondre à chaque message dans un chat de groupe.

Configurez par groupe avec le paramètre `groups` :

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Paramètres par défaut pour tous les groupes. Définit uniquement les valeurs par défaut de la config, pas une entrée d'allowlist.
- **ID de chat de groupe** — Remplace les paramètres pour un groupe spécifique. Écrase les valeurs par défaut de `"*"`.
- **`requireMention`** (par défaut : `true`) — Lorsque `true`, le bot répond uniquement aux messages qui le @mentionnent ou répondent à l'un de ses messages. Lorsque `false`, le bot répond à tous les messages (utile pour les groupes dédiés à des tâches).

### Évaluation des messages de groupe

```
1. groupPolicy — ce groupe est-il autorisé ?           (non → ignorer)
2. requireMention — le bot a-t-il été mentionné/destinataire d'une réponse ? (non → ignorer)
3. senderPolicy — cet expéditeur est-il approuvé ?         (non → flux d'appairage)
4. Routage vers la session
```

### Configuration Telegram pour les groupes

1. Ajoutez le bot à un groupe
2. **Désactivez le mode de confidentialité** dans BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — sinon le bot ne verra pas les messages hors commandes
3. **Retirez et rajoutez le bot** au groupe après avoir modifié le mode de confidentialité (Telegram met en cache ce paramètre)

### Trouver l'ID d'un chat de groupe

Pour trouver l'ID de chat d'un groupe pour l'allowlist `groups` :

1. Arrêtez le bot s'il est en cours d'exécution
2. Envoyez un message mentionnant le bot dans le groupe
3. Utilisez l'API Telegram Bot pour vérifier les mises à jour en file d'attente :

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Recherchez `message.chat.id` dans la réponse — les ID de groupe sont des nombres négatifs (ex. `-5170296765`).

## Support des médias

Les channels prennent en charge l'envoi d'images et de fichiers à l'agent, pas seulement du texte.

### Images

Envoyez une photo au bot et l'agent la verra — utile pour partager des captures d'écran, des messages d'erreur ou des diagrammes. L'image est envoyée directement au modèle en tant qu'entrée vision.

Pour utiliser le support des images, configurez un modèle multimodal pour le channel :

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

Envoyez un document (PDF, fichier de code, fichier texte, etc.) au bot. Le fichier est téléchargé et sauvegardé dans un répertoire temporaire, et l'agent reçoit le chemin du fichier afin qu'il puisse lire le contenu avec ses outils de lecture de fichiers.

Les fichiers fonctionnent avec n'importe quel modèle — aucun support multimodal requis.

### Différences entre plateformes

| Feature  | Telegram                                     | WeChat                           | DingTalk                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Images   | Téléchargement direct via Bot API                  | Téléchargement CDN avec déchiffrement AES | API downloadCode (en deux étapes)                   |
| Files    | Téléchargement direct via Bot API (limite 20 Mo)     | Téléchargement CDN avec déchiffrement AES | API downloadCode (en deux étapes)                   |
| Captions | Légendes photo/fichier incluses comme texte du message | Non applicable                   | Texte enrichi : texte mixte + images dans un seul message |

## Modes de dispatch

Contrôle ce qui se passe lorsque vous envoyez un nouveau message pendant que le bot traite encore le précédent.

- **`steer`** (par défaut) — Le bot annule la requête en cours et commence à traiter votre nouveau message. Idéal pour le chat normal, où un suivi signifie généralement que vous souhaitez corriger ou rediriger le bot.
- **`collect`** — Vos nouveaux messages sont mis en mémoire tampon. Lorsque la requête en cours se termine, tous les messages tamponnés sont combinés en une seule invite de suivi. Adapté aux workflows asynchrones où vous souhaitez mettre en file d'attente des idées.
- **`followup`** — Chaque message est mis en file d'attente et traité comme un tour séparé, dans l'ordre. Utile pour les workflows par lots où chaque message est indépendant.

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

Vous pouvez également définir le mode de dispatch par groupe, en écrasant la valeur par défaut du channel :

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Block Streaming

Par défaut, l'agent travaille un moment puis envoie une seule réponse volumineuse. Avec le block streaming activé, la réponse arrive sous forme de plusieurs messages plus courts pendant que l'agent travaille encore — similaire à la façon dont ChatGPT ou Claude affichent une sortie progressive.

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

### Fonctionnement

- La réponse de l'agent est découpée en blocs aux limites des paragraphes et envoyée sous forme de messages séparés
- `minChars` (par défaut 400) — n'envoie pas un bloc tant qu'il n'a pas atteint cette longueur, pour éviter d'envoyer des messages minuscules en rafale
- `maxChars` (par défaut 1000) — si un bloc atteint cette longueur sans coupure naturelle, il est envoyé quand même
- `idleMs` (par défaut 1500) — si l'agent fait une pause (ex. exécution d'un outil), envoie ce qui est en mémoire tampon jusqu'à présent
- Lorsque l'agent termine, tout texte restant est envoyé immédiatement

Seul `blockStreaming` est requis. Les paramètres de chunk et de coalesce sont optionnels et disposent de valeurs par défaut pertinentes.

## Commandes slash

Les channels prennent en charge les commandes slash. Elles sont traitées localement (pas d'aller-retour avec l'agent) :

- `/help` — Liste les commandes disponibles
- `/clear` — Efface votre session et recommence à zéro (alias : `/reset`, `/new`)
- `/status` — Affiche les infos de session et la politique d'accès

Toutes les autres commandes slash (ex. `/compress`, `/summary`) sont transmises à l'agent.

Ces commandes fonctionnent sur tous les types de channels (Telegram, WeChat, DingTalk).

## Exécution

```bash
# Démarrer tous les channels configurés (processus agent partagé)
qwen channel start

# Démarrer un seul channel
qwen channel start my-channel

# Vérifier si le service est en cours d'exécution
qwen channel status

# Arrêter le service en cours d'exécution
qwen channel stop
```

Le bot s'exécute au premier plan. Appuyez sur `Ctrl+C` pour l'arrêter, ou utilisez `qwen channel stop` depuis un autre terminal.

### Mode multi-channel

Lorsque vous exécutez `qwen channel start` sans nom, tous les channels définis dans `settings.json` démarrent ensemble en partageant un unique processus agent. Chaque channel maintient ses propres sessions — un utilisateur Telegram et un utilisateur WeChat obtiennent des conversations séparées, même s'ils partagent le même agent.

Chaque channel utilise son propre `cwd` issu de sa configuration, permettant ainsi à différents channels de travailler sur des projets différents simultanément.

### Gestion du service

Le service de channel utilise un fichier PID (`~/.qwen/channels/service.pid`) pour suivre l'instance en cours d'exécution :

- **Prévention des doublons** : Exécuter `qwen channel start` alors qu'un service est déjà en cours affichera une erreur au lieu de démarrer une seconde instance
- **`qwen channel stop`** : Arrête proprement le service en cours depuis un autre terminal
- **`qwen channel status`** : Indique si le service est en cours d'exécution, son temps de fonctionnement et le nombre de sessions par channel

### Récupération après crash

Si le processus agent plante de manière inattendue, le service de channel le redémarre automatiquement et tente de restaurer toutes les sessions actives. Les utilisateurs peuvent poursuivre leurs conversations sans recommencer.

- Les sessions sont persistées dans `~/.qwen/channels/sessions.json` pendant l'exécution du service
- En cas de crash : l'agent redémarre sous 3 secondes et recharge les sessions sauvegardées
- Après 3 crashes consécutifs, le service se termine avec une erreur
- Lors d'un arrêt propre (Ctrl+C ou `qwen channel stop`) : les données de session sont effacées — le prochain démarrage est toujours vierge