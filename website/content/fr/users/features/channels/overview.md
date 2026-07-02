# Canaux

Les canaux vous permettent d'interagir avec un agent Qwen Code depuis des plateformes de messagerie comme Telegram, WeChat, QQ ou DingTalk, au lieu du terminal. Vous envoyez des messages depuis votre téléphone ou votre application de chat de bureau, et l'agent répond exactement comme il le ferait dans le CLI.

## Fonctionnement

Lorsque vous exécutez `qwen channel start`, Qwen Code :

1. Lit les configurations des canaux depuis votre `settings.json`
2. Lance un processus d'agent unique en utilisant le [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Se connecte à chaque plateforme de messagerie et commence à écouter les messages
4. Route les messages entrants vers l'agent et renvoie les réponses au chat correspondant

Tous les canaux partagent un seul processus d'agent avec des sessions isolées par utilisateur. Chaque canal peut avoir son propre répertoire de travail, son modèle et ses instructions.

## Démarrage rapide

1. Configurez un bot sur votre plateforme de messagerie (voir les guides spécifiques aux canaux : [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk))
2. Ajoutez la configuration du canal à `~/.qwen/settings.json`
3. Exécutez `qwen channel start` pour démarrer tous les canaux, ou `qwen channel start <name>` pour un seul canal

Vous souhaitez connecter une plateforme qui n'est pas intégrée nativement ? Consultez [Plugins](./plugins) pour ajouter un adaptateur personnalisé en tant qu'extension.

## Configuration

Les canaux sont configurés sous la clé `channels` dans `settings.json`. Chaque canal possède un nom et un ensemble d'options :

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

| Option                   | Obligatoire | Description                                                                                                                                                            |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Oui         | Type de canal : `telegram`, `weixin`, `qq`, `dingtalk`, `feishu`, ou un type personnalisé provenant d'une extension (voir [Plugins](./plugins))                                          |
| `token`                  | Telegram    | Token du bot. Prend en charge la syntaxe `$ENV_VAR` pour lire les variables d'environnement. Non nécessaire pour WeChat ou DingTalk                                                            |
| `clientId`               | DingTalk    | AppKey DingTalk. Prend en charge la syntaxe `$ENV_VAR`                                                                                                                            |
| `clientSecret`           | DingTalk    | AppSecret DingTalk. Prend en charge la syntaxe `$ENV_VAR`                                                                                                                         |
| `model`                  | Non         | Modèle à utiliser pour ce canal (ex. : `qwen3.5-plus`). Remplace le modèle par défaut. Utile pour les modèles multimodaux qui prennent en charge l'entrée d'images                               |
| `senderPolicy`           | Non         | Qui peut parler au bot : `allowlist` (par défaut), `open` ou `pairing`                                                                                                   |
| `allowedUsers`           | Non         | Liste des ID d'utilisateurs autorisés à utiliser le bot (utilisé par les politiques `allowlist` et `pairing`)                                                                                   |
| `sessionScope`           | Non         | Comment les sessions sont délimitées : `user` (par défaut), `thread` ou `single`                                                                                                       |
| `cwd`                    | Non         | Répertoire de travail pour l'agent. Par défaut, le répertoire courant                                                                                                     |
| `instructions`           | Non         | Instructions personnalisées ajoutées au début du premier message de chaque session                                                                                                     |
| `groupPolicy`            | Non         | Accès aux discussions de groupe : `disabled` (par défaut), `allowlist` ou `open`. Voir [Discussions de groupe](#group-chats)                                                                       |
| `groupHistoryLimit`      | Non         | Remplissage optionnel de l'historique de groupe. `0` ou omis le désactive. Un nombre positif persiste ce nombre de messages de groupe autorisés et non mentionnés pour la prochaine mention/réponse du bot. |
| `groups`                 | Non         | Paramètres par groupe. Les clés sont les ID de chat de groupe ou `"*"` pour les valeurs par défaut. Voir [Discussions de groupe](#group-chats)                                                                     |
| `dispatchMode`           | Non         | Ce qui se passe lorsque vous envoyez un message pendant que le bot est occupé : `steer` (par défaut), `collect` ou `followup`. Voir [Modes de répartition](#dispatch-modes)                         |
| `blockStreaming`         | Non         | Livraison progressive des réponses : `on` ou `off` (par défaut). Voir [Streaming par blocs](#block-streaming)                                                                        |
| `blockStreamingChunk`    | Non         | Limites de taille des blocs : `{ "minChars": 400, "maxChars": 1000 }`. Voir [Streaming par blocs](#block-streaming)                                                                    |
| `blockStreamingCoalesce` | Non         | Vidage en cas d'inactivité : `{ "idleMs": 1500 }`. Voir [Streaming par blocs](#block-streaming)                                                                                              |

### Politique d'expéditeur

Contrôle qui peut interagir avec le bot :

- **`allowlist`** (par défaut) — Seuls les utilisateurs listés dans `allowedUsers` peuvent envoyer des messages. Les autres sont ignorés silencieusement.
- **`pairing`** — Les expéditeurs inconnus reçoivent un code d'appairage. L'opérateur du bot les approuve via le CLI, et ils sont ajoutés à une liste d'autorisation persistante. Les utilisateurs dans `allowedUsers` ignorent entièrement l'appairage. Voir [Appairage en MP](#dm-pairing) ci-dessous.
- **`open`** — N'importe qui peut envoyer des messages. À utiliser avec précaution.

### Portée de la session

Contrôle comment les sessions de conversation sont gérées :

- **`user`** (par défaut) — Une session par utilisateur. Tous les messages du même utilisateur partagent une conversation.
- **`thread`** — Une session par fil de discussion/sujet. Utile pour les chats de groupe avec des fils.
- **`single`** — Une session partagée pour tous les utilisateurs. Tout le monde partage la même conversation.

### Mémoire du canal

La mémoire du canal permet à un membre autorisé du canal de sauvegarder un contexte stable pour un chat ou un fil de discussion. Qwen Code injecte cette mémoire lorsqu'une nouvelle session de canal démarre, y compris après `/clear`.

Commandes :

- `/remember-channel <text>` sauvegarde une ligne de mémoire pour le chat ou le fil actuel.
- `/channel-memory` affiche la mémoire sauvegardée pour le chat ou le fil actuel.
- `/forget-channel confirm` efface la mémoire sauvegardée pour le chat ou le fil actuel.

Seuls les utilisateurs listés dans `allowedUsers` peuvent lire, écrire ou effacer la mémoire du canal. Si `allowedUsers` est vide, les commandes de mémoire du canal sont désactivées pour tout le monde.

### Sécurité des tokens

Les tokens de bot ne doivent pas être stockés directement dans `settings.json`. Utilisez plutôt des références aux variables d'environnement :

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Définissez le token réel dans votre environnement shell ou dans un fichier `.env` qui est chargé avant d'exécuter le canal.

## Appairage en MP

Lorsque `senderPolicy` est défini sur `"pairing"`, les expéditeurs inconnus passent par un flux d'approbation :

1. Un utilisateur inconnu envoie un message au bot
2. Le bot répond avec un code d'appairage de 8 caractères (ex. : `VEQDDWXJ`)
3. L'utilisateur partage le code avec vous (l'opérateur du bot)
4. Vous l'approuvez via le CLI :

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Une fois approuvé, l'ID de l'utilisateur est sauvegardé dans `~/.qwen/channels/<name>-allowlist.json` et tous les futurs messages passent normalement.

### Commandes CLI d'appairage

```bash
# List pending pairing requests
qwen channel pairing list my-channel

# Approve a request by code
qwen channel pairing approve my-channel <CODE>
```

### Règles d'appairage

- Les codes font 8 caractères, en majuscules, en utilisant un alphabet sans ambiguïté (pas de `0`/`O`/`1`/`I`)
- Les codes expirent après 1 heure
- Maximum 3 demandes en attente par canal à la fois — les demandes supplémentaires sont ignorées jusqu'à ce qu'une expire ou soit approuvée
- Les utilisateurs listés dans `allowedUsers` dans `settings.json` ignorent toujours l'appairage
- Les utilisateurs approuvés sont stockés dans `~/.qwen/channels/<name>-allowlist.json` — traitez ce fichier comme sensible

## Discussions de groupe

Par défaut, le bot fonctionne uniquement en messages privés. Pour activer le support des discussions de groupe, définissez `groupPolicy` sur `"allowlist"` ou `"open"`.

### Politique de groupe

Contrôle si le bot participe ou non aux discussions de groupe :

- **`disabled`** (par défaut) — Le bot ignore tous les messages de groupe. Option la plus sûre.
- **`allowlist`** — Le bot répond uniquement dans les groupes explicitement listés dans `groups` par ID de chat. La clé `"*"` fournit les paramètres par défaut mais n'agit **pas** comme un joker d'autorisation.
- **`open`** — Le bot répond dans tous les groupes auxquels il est ajouté. À utiliser avec précaution.

### Filtrage par mention

Dans les groupes, le bot exige par défaut une `@mention` ou une réponse à l'un de ses messages. Cela évite que le bot réponde à chaque message dans une discussion de groupe.

Configurez par groupe avec le paramètre `groups` :

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Paramètres par défaut pour tous les groupes. Définit uniquement les valeurs par défaut de la config, pas une entrée de liste d'autorisation.
- **ID de discussion de groupe** — Remplace les paramètres pour un groupe spécifique. Écrase les valeurs par défaut de `"*"`.
- **`requireMention`** (par défaut : `true`) — Lorsque `true`, le bot répond uniquement aux messages qui le @mentionnent ou qui répondent à l'un de ses messages. Lorsque `false`, le bot répond à tous les messages (utile pour les groupes dédiés à une tâche).

### Remplissage de l'historique de groupe

Par défaut, Qwen ignore les messages de groupe non mentionnés et ne les stocke pas comme tours de session. Pour permettre à la prochaine `@mention` d'inclure le contexte récent du groupe, définissez `groupHistoryLimit` sur un nombre positif.

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "groupPolicy": "open",
      "groupHistoryLimit": 50,
      "groups": {
        "*": { "requireMention": true },
        "sensitive-group-id": {
          "requireMention": true,
          "groupHistoryLimit": 0
        }
      }
    }
  }
}
```

- Omis ou `0` désactive le remplissage.
- Le `groupHistoryLimit` au niveau du groupe écrase la valeur au niveau du canal.
- Seuls les messages des expéditeurs autorisés sont persistés.
- Les messages rejetés par `groupPolicy` ou la liste d'autorisation du groupe ne sont pas persistés.
- L'historique de groupe en attente est stocké au format JSONL local sous `~/.qwen/channels/<channel-name>-group-history.jsonl` ou `$QWEN_HOME/channels/<channel-name>-group-history.jsonl`.
- Les messages en cache sont injectés comme contexte non fiable lors du prochain déclencheur réel et ne sont pas écrits comme des tours de session autonomes.

### Évaluation des messages de groupe

```
1. groupPolicy — is this group allowed?           (no → ignore)
2. requireMention — was the bot mentioned/replied to? (no → ignore)
3. senderPolicy — is this sender approved?         (no → pairing flow)
4. Route to session
```

### Configuration de Telegram pour les groupes

1. Ajoutez le bot à un groupe
2. **Désactivez le mode privé** dans BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — sinon le bot ne verra pas les messages autres que les commandes
3. **Retirez et rajoutez le bot** au groupe après avoir changé le mode privé (Telegram met en cache ce paramètre)

### Trouver l'ID d'une discussion de groupe

Pour trouver l'ID de chat d'un groupe pour la liste d'autorisation `groups` :

1. Arrêtez le bot s'il est en cours d'exécution
2. Envoyez un message mentionnant le bot dans le groupe
3. Utilisez l'API Telegram Bot pour vérifier les mises à jour en attente :

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Cherchez `message.chat.id` dans la réponse — les ID de groupe sont des nombres négatifs (ex. : `-5170296765`).

## Support des médias

Les canaux prennent en charge l'envoi d'images et de fichiers à l'agent, pas seulement du texte.

### Images

Envoyez une photo au bot et l'agent la verra — utile pour partager des captures d'écran, des messages d'erreur ou des diagrammes. L'image est envoyée directement au modèle en tant qu'entrée visuelle.

Pour utiliser le support des images, configurez un modèle multimodal pour le canal :

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

Envoyez un document (PDF, fichier de code, fichier texte, etc.) au bot. Le fichier est téléchargé et sauvegardé dans un répertoire temporaire, et l'agent reçoit le chemin du fichier afin qu'il puisse lire le contenu en utilisant ses outils de lecture de fichiers.

Les fichiers fonctionnent avec n'importe quel modèle — aucun support multimodal n'est requis.

### Différences entre les plateformes

| Fonctionnalité  | Telegram                                     | WeChat                           | DingTalk                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Images   | Téléchargement direct via l'API Bot                  | Téléchargement CDN avec déchiffrement AES | API downloadCode (en deux étapes)                   |
| Fichiers    | Téléchargement direct via l'API Bot (limite de 20 Mo)     | Téléchargement CDN avec déchiffrement AES | API downloadCode (en deux étapes)                   |
| Légendes | Les légendes des photos/fichiers sont incluses comme texte du message | Non applicable                   | Texte enrichi : texte mixte + images dans un seul message |

## Modes de répartition

Contrôle ce qui se passe lorsque vous envoyez un nouveau message pendant que le bot traite encore le précédent.

- **`steer`** (par défaut) — Le bot annule la requête en cours et commence à travailler sur votre nouveau message. Idéal pour le chat normal, où un suivi signifie généralement que vous voulez corriger ou rediriger le bot.
- **`collect`** — Vos nouveaux messages sont mis en tampon. Lorsque la requête en cours se termine, tous les messages en tampon sont combinés en un seul prompt de suivi. Utile pour les flux de travail asynchrones où vous souhaitez accumuler vos pensées.
- **`followup`** — Chaque message est mis en file d'attente et traité comme son propre tour séparé, dans l'ordre. Utile pour les flux de travail par lots où chaque message est indépendant.

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

Vous pouvez également définir le mode de répartition par groupe, en écrasant la valeur par défaut du canal :

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Streaming par blocs

Par défaut, l'agent travaille pendant un moment puis envoie une seule grande réponse. Avec le streaming par blocs activé, la réponse arrive sous forme de plusieurs messages plus courts pendant que l'agent travaille encore — similaire à la façon dont ChatGPT ou Claude affichent une sortie progressive.

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

- La réponse de l'agent est divisée en blocs aux limites des paragraphes et envoyée sous forme de messages séparés
- `minChars` (par défaut 400) — n'envoie pas un bloc tant qu'il n'atteint pas cette longueur, pour éviter de spammer avec de minuscules messages
- `maxChars` (par défaut 1000) — si un bloc atteint cette longueur sans pause naturelle, il est envoyé quand même
- `idleMs` (par défaut 1500) — si l'agent fait une pause (ex. : exécution d'un outil), envoie ce qui est en tampon jusqu'à présent
- Lorsque l'agent a terminé, tout texte restant est envoyé immédiatement

Seul `blockStreaming` est requis. Les paramètres de chunk et de coalesce sont optionnels et ont des valeurs par défaut raisonnables.

## Commandes slash

Les canaux prennent en charge les commandes slash. Celles-ci sont gérées localement (pas d'aller-retour avec l'agent) :

- `/help` — Liste les commandes disponibles
- `/clear` — Efface votre session et repart de zéro (alias : `/reset`, `/new`)
- `/status` — Affiche les informations de la session et la politique d'accès

Toutes les autres commandes slash (ex. : `/compress`, `/summary`) sont transmises à l'agent.

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

### Mode expérimental géré par le démon

Vous pouvez également exécuter les canaux configurés sous `qwen serve` :

```bash
# Start one channel under the daemon lifecycle
qwen serve --channel my-channel

# Start all configured channels
qwen serve --channel all
```

Ce mode démarre un processus worker de canal possédé par `qwen serve`. Le worker se reconnecte au démon via le SDK et utilise les mêmes adaptateurs de canal. Il est séparé du processus démon, ainsi le crash d'un adaptateur de canal ne fait pas planter le démon.

`qwen serve --channel` n'est pas le même service que `qwen channel start`. `qwen channel start` autonome utilise toujours le service de canal supporté par ACP et peut exécuter des configurations de canal avec des valeurs `cwd` différentes. Les canaux gérés par le démon exigent que le `cwd` de chaque canal sélectionné pointe vers l'espace de travail du démon.

Lorsque les canaux sont gérés par serve, `qwen channel status` affiche le propriétaire comme `qwen serve`, et `qwen channel stop` vous indique d'arrêter le démon au lieu de signaler directement le worker. Si un worker prêt se termine de manière inattendue, le démon continue de s'exécuter et signale un avertissement de worker de canal dans `/daemon/status`.

### Mode multi-canal

Lorsque vous exécutez `qwen channel start` sans nom, tous les canaux définis dans `settings.json` démarrent ensemble en partageant un seul processus d'agent. Chaque canal maintient ses propres sessions — un utilisateur Telegram et un utilisateur WeChat obtiennent des conversations séparées, même s'ils partagent le même agent.

Chaque canal utilise son propre `cwd` depuis sa configuration, ainsi différents canaux peuvent travailler sur différents projets simultanément.

### Gestion du service

Le service de canal utilise un fichier PID (`~/.qwen/channels/service.pid`) pour suivre l'instance en cours d'exécution :

- **Prévention des doublons** : Exécuter `qwen channel start` alors qu'un service est déjà en cours d'exécution affichera une erreur au lieu de démarrer une deuxième instance
- **`qwen channel stop`** : Arrête proprement le service en cours d'exécution depuis un autre terminal
- **`qwen channel status`** : Indique si le service est en cours d'exécution, son temps de fonctionnement et le nombre de sessions par canal

### Récupération après crash

Si le processus de l'agent plante de manière inattendue, le service de canal le redémarre automatiquement et tente de restaurer toutes les sessions actives. Les utilisateurs peuvent poursuivre leurs conversations sans recommencer.

- Les sessions sont persistées dans `~/.qwen/channels/sessions.json` pendant que le service est en cours d'exécution
- En cas de crash : l'agent redémarre dans les 3 secondes et recharge les sessions sauvegardées
- Après 3 crashes consécutifs, le service se termine avec une erreur
- Lors d'un arrêt propre (Ctrl+C ou `qwen channel stop`) : les données de session sont effacées — le prochain démarrage est toujours vierge