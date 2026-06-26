# Canaux

Les canaux vous permettent d'interagir avec un agent Qwen Code depuis des plateformes de messagerie comme Telegram, WeChat, QQ ou DingTalk, au lieu du terminal. Vous envoyez des messages depuis l'application de chat de votre téléphone ou de votre bureau, et l'agent répond comme il le ferait dans la CLI.

## Comment ça marche

Quand vous exécutez `qwen channel start`, Qwen Code :

1. Lit les configurations des canaux depuis votre `settings.json`
2. Lance un seul processus agent en utilisant le [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Se connecte à chaque plateforme de messagerie et commence à écouter les messages
4. Achemine les messages entrants vers l'agent et renvoie les réponses dans le bon chat

Tous les canaux partagent un seul processus agent avec des sessions isolées par utilisateur. Chaque canal peut avoir son propre répertoire de travail, son propre modèle et ses propres instructions.

## Démarrage rapide

1. Configurez un bot sur votre plateforme de messagerie (consultez les guides spécifiques : [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk))
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

| Option                   | Requis  | Description                                                                                                                                                              |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                   | Oui     | Type de canal : `telegram`, `weixin`, `qq`, `dingtalk`, `feishu`, ou un type personnalisé provenant d'une extension (voir [Plugins](./plugins))                           |
| `token`                  | Telegram| Jeton du bot. Supporte la syntaxe `$ENV_VAR` pour lire depuis les variables d'environnement. Non nécessaire pour WeChat ou DingTalk                                       |
| `clientId`               | DingTalk| AppKey DingTalk. Supporte la syntaxe `$ENV_VAR`                                                                                                                          |
| `clientSecret`           | DingTalk| AppSecret DingTalk. Supporte la syntaxe `$ENV_VAR`                                                                                                                       |
| `model`                  | Non     | Modèle à utiliser pour ce canal (ex. `qwen3.5-plus`). Remplace le modèle par défaut. Utile pour les modèles multimodaux prenant en charge l'entrée d'images                |
| `senderPolicy`           | Non     | Qui peut parler au bot : `allowlist` (par défaut), `open` ou `pairing`                                                                                                   |
| `allowedUsers`           | Non     | Liste des IDs utilisateur autorisés à utiliser le bot (utilisé par les politiques `allowlist` et `pairing`)                                                               |
| `sessionScope`           | Non     | Comment les sessions sont délimitées : `user` (par défaut), `thread` ou `single`                                                                                         |
| `cwd`                    | Non     | Répertoire de travail pour l'agent. Par défaut, le répertoire courant                                                                                                    |
| `instructions`           | Non     | Instructions personnalisées ajoutées avant le premier message de chaque session                                                                                          |
| `groupPolicy`            | Non     | Accès aux discussions de groupe : `disabled` (par défaut), `allowlist` ou `open`. Voir [Discussions de groupe](#discussions-de-groupe)                                    |
| `groups`                 | Non     | Paramètres par groupe. Les clés sont les IDs des discussions de groupe ou `"*"` pour les valeurs par défaut. Voir [Discussions de groupe](#discussions-de-groupe)         |
| `dispatchMode`           | Non     | Ce qui se passe quand vous envoyez un message alors que le bot est occupé : `steer` (par défaut), `collect` ou `followup`. Voir [Modes de répartition](#modes-de-répartition) |
| `blockStreaming`         | Non     | Livraison progressive des réponses : `on` ou `off` (par défaut). Voir [Streaming par blocs](#streaming-par-blocs)                                                         |
| `blockStreamingChunk`    | Non     | Limites de taille des blocs : `{ "minChars": 400, "maxChars": 1000 }`. Voir [Streaming par blocs](#streaming-par-blocs)                                                  |
| `blockStreamingCoalesce` | Non     | Vidage en inactivité : `{ "idleMs": 1500 }`. Voir [Streaming par blocs](#streaming-par-blocs)                                                                            |

### Politique d'expéditeur

Contrôle qui peut interagir avec le bot :

- **`allowlist`** (par défaut) — Seuls les utilisateurs listés dans `allowedUsers` peuvent envoyer des messages. Les autres sont ignorés silencieusement.
- **`pairing`** — Les expéditeurs inconnus reçoivent un code d'appairage. L'opérateur du bot les approuve via la CLI, et ils sont ajoutés à une liste blanche persistante. Les utilisateurs dans `allowedUsers` n'ont pas besoin d'appairage. Voir [Appairage par message direct (DM)](#appairage-par-message-direct-dm) ci-dessous.
- **`open`** — N'importe qui peut envoyer des messages. À utiliser avec précaution.

### Portée de session

Contrôle la manière dont les sessions de conversation sont gérées :

- **`user`** (par défaut) — Une session par utilisateur. Tous les messages d'un même utilisateur partagent une conversation.
- **`thread`** — Une session par fil/sujet. Utile pour les discussions de groupe avec des fils.
- **`single`** — Une session partagée pour tous les utilisateurs. Tout le monde partage la même conversation.

### Sécurité du jeton

Les jetons de bot ne doivent pas être stockés directement dans `settings.json`. Utilisez plutôt des références à des variables d'environnement :

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Définissez le jeton réel dans votre environnement shell ou dans un fichier `.env` chargé avant d'exécuter le canal.

## Appairage par message direct (DM)

Lorsque `senderPolicy` est défini sur `"pairing"`, les expéditeurs inconnus passent par un flux d'approbation :

1. Un utilisateur inconnu envoie un message au bot
2. Le bot répond avec un code d'appairage de 8 caractères (ex. `VEQDDWXJ`)
3. L'utilisateur partage le code avec vous (l'opérateur du bot)
4. Vous l'approuvez via la CLI :

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Une fois approuvé, l'ID de l'utilisateur est sauvegardé dans `~/.qwen/channels/<name>-allowlist.json` et tous les messages futurs passent normalement.

### Commandes CLI d'appairage

```bash
# Lister les demandes d'appairage en attente
qwen channel pairing list my-channel

# Approuver une demande par code
qwen channel pairing approve my-channel <CODE>
```

### Règles d'appairage

- Les codes font 8 caractères, en majuscules, utilisant un alphabet sans ambiguïté (pas de `0`/`O`/`1`/`I`)
- Les codes expirent après 1 heure
- Maximum 3 demandes en attente par canal à la fois — les demandes supplémentaires sont ignorées jusqu'à ce qu'une expire ou soit approuvée
- Les utilisateurs listés dans `allowedUsers` dans `settings.json` sont toujours exemptés d'appairage
- Les utilisateurs approuvés sont stockés dans `~/.qwen/channels/<name>-allowlist.json` — traitez ce fichier comme sensible

## Discussions de groupe

Par défaut, le bot ne fonctionne qu'en messages directs. Pour activer le support des discussions de groupe, définissez `groupPolicy` sur `"allowlist"` ou `"open"`.

### Politique de groupe

Contrôle si le bot participe aux discussions de groupe :

- **`disabled`** (par défaut) — Le bot ignore tous les messages de groupe. Option la plus sûre.
- **`allowlist`** — Le bot ne répond que dans les groupes explicitement listés dans `groups` par ID de chat. La clé `"*"` fournit des paramètres par défaut mais n'agit **pas** comme une autorisation générique.
- **`open`** — Le bot répond dans tous les groupes où il est ajouté. À utiliser avec précaution.

### Filtre par mention

Dans les groupes, le bot exige une `@mention` ou une réponse à l'un de ses messages par défaut. Cela empêche le bot de répondre à chaque message dans un chat de groupe.

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
- **`requireMention`** (par défaut : `true`) — Quand c'est `true`, le bot ne répond qu'aux messages qui le mentionnent avec @ ou qui répondent à l'un de ses messages. Quand c'est `false`, le bot répond à tous les messages (utile pour des groupes de tâches dédiés).

### Comment les messages de groupe sont évalués

```
1. groupPolicy — ce groupe est-il autorisé ?           (non → ignorer)
2. requireMention — le bot a-t-il été mentionné/répondu ? (non → ignorer)
3. senderPolicy — cet expéditeur est-il approuvé ?      (non → flux d'appairage)
4. Acheminer vers la session
```

### Configuration Telegram pour les groupes

1. Ajoutez le bot à un groupe
2. **Désactivez le mode privé** dans BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — sinon le bot ne verra pas les messages qui ne sont pas des commandes
3. **Supprimez et réajoutez le bot** dans le groupe après avoir changé le mode privé (Telegram met en cache ce paramètre)

### Trouver l'ID d'un chat de groupe

Pour trouver l'ID de chat d'un groupe pour la liste blanche `groups` :

1. Arrêtez le bot s'il est en cours d'exécution
2. Envoyez un message mentionnant le bot dans le groupe
3. Utilisez l'API Bot Telegram pour vérifier les mises à jour en attente :

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Recherchez `message.chat.id` dans la réponse — les ID de groupe sont des nombres négatifs (ex. `-5170296765`).

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

Envoyez un document (PDF, fichier de code, fichier texte, etc.) au bot. Le fichier est téléchargé et sauvegardé dans un répertoire temporaire, et l'agent reçoit le chemin du fichier afin de pouvoir lire son contenu à l'aide de ses outils de lecture de fichiers.

Les fichiers fonctionnent avec n'importe quel modèle — aucun support multimodal requis.

### Différences entre plateformes

| Fonctionnalité | Telegram                                     | WeChat                           | DingTalk                                      |
| -------------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Images         | Téléchargement direct via l'API Bot          | Téléchargement CDN avec déchiffrement AES | API downloadCode (deux étapes)                |
| Fichiers       | Téléchargement direct via l'API Bot (limite 20 Mo) | Téléchargement CDN avec déchiffrement AES | API downloadCode (deux étapes)                |
| Légendes       | Légendes des photos/fichiers incluses comme texte du message | Non applicable                   | Texte enrichi : texte et images mélangés dans un même message |

## Modes de répartition

Contrôle ce qui se passe lorsque vous envoyez un nouveau message alors que le bot est encore en train d'en traiter un précédent.

- **`steer`** (par défaut) — Le bot annule la requête en cours et commence à travailler sur votre nouveau message. Idéal pour un chat normal, où une question de suivi signifie généralement que vous voulez corriger ou rediriger le bot.
- **`collect`** — Vos nouveaux messages sont mis en mémoire tampon. Une fois la requête en cours terminée, tous les messages mis en tampon sont combinés en une seule invite de suivi. Pratique pour les workflows asynchrones où vous souhaitez mettre en file d'attente vos idées.
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

Vous pouvez également définir le mode de répartition par groupe, en remplaçant la valeur par défaut du canal :

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Streaming par blocs

Par défaut, l'agent travaille pendant un moment puis envoie une seule réponse volumineuse. Avec le streaming par blocs activé, la réponse arrive sous forme de plusieurs messages plus courts pendant que l'agent travaille encore — similaire à la façon dont ChatGPT ou Claude affichent des résultats progressifs.

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
- `minChars` (400 par défaut) — n'envoie pas un bloc tant qu'il n'a pas au moins cette longueur, pour éviter de spamer avec de minuscules messages
- `maxChars` (1000 par défaut) — si un bloc atteint cette longueur sans coupure naturelle, envoyez-le quand même
- `idleMs` (1500 par défaut) — si l'agent fait une pause (par exemple, exécute un outil), envoyez ce qui a été mis en mémoire tampon jusqu'à présent
- Lorsque l'agent a terminé, tout texte restant est envoyé immédiatement

Seul `blockStreaming` est requis. Les paramètres de bloc et de coalescence sont facultatifs et ont des valeurs par défaut raisonnables.

## Commandes slash

Les canaux prennent en charge les commandes slash. Elles sont traitées localement (pas d'aller-retour avec l'agent) :

- `/help` — Liste des commandes disponibles
- `/clear` — Efface votre session et recommence (alias : `/reset`, `/new`)
- `/status` — Affiche les informations de session et la politique d'accès

Toutes les autres commandes slash (ex. `/compress`, `/summary`) sont transmises à l'agent.

Ces commandes fonctionnent sur tous les types de canaux (Telegram, WeChat, QQ, DingTalk).

## Exécution

```bash
# Démarrer tous les canaux configurés (processus agent partagé)
qwen channel start

# Démarrer un seul canal
qwen channel start my-channel

# Vérifier si le service est en cours d'exécution
qwen channel status

# Arrêter le service en cours
qwen channel stop
```

Le bot s'exécute au premier plan. Appuyez sur `Ctrl+C` pour arrêter, ou utilisez `qwen channel stop` depuis un autre terminal.

### Mode multi-canal

Lorsque vous exécutez `qwen channel start` sans nom, tous les canaux définis dans `settings.json` démarrent ensemble en partageant un seul processus agent. Chaque canal maintient ses propres sessions — un utilisateur Telegram et un utilisateur WeChat obtiennent des conversations séparées, même s'ils partagent le même agent.

Chaque canal utilise son propre `cwd` depuis sa configuration, donc différents canaux peuvent travailler sur différents projets simultanément.

### Gestion du service

Le service de canal utilise un fichier PID (`~/.qwen/channels/service.pid`) pour suivre l'instance en cours d'exécution :

- **Prévention des doublons** : Lancer `qwen channel start` alors qu'un service est déjà en cours affichera une erreur au lieu de démarrer une deuxième instance
- **`qwen channel stop`** : Arrête proprement le service en cours depuis un autre terminal
- **`qwen channel status`** : Indique si le service est en cours d'exécution, sa durée de fonctionnement et le nombre de sessions par canal

### Récupération après crash

Si le processus agent plante de manière inattendue, le service de canal le redémarre automatiquement et tente de restaurer toutes les sessions actives. Les utilisateurs peuvent poursuivre leurs conversations sans recommencer.

- Les sessions sont persistées dans `~/.qwen/channels/sessions.json` pendant que le service est en cours d'exécution
- En cas de crash : l'agent redémarre dans les 3 secondes et recharge les sessions sauvegardées
- Après 3 crashs consécutifs, le service s'arrête avec une erreur
- Sur arrêt propre (Ctrl+C ou `qwen channel stop`) : les données de session sont effacées — le prochain démarrage est toujours frais