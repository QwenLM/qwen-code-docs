# Canaux

Les canaux vous permettent d'interagir avec un agent Qwen Code depuis des plateformes de messagerie comme Telegram, WeChat, QQ, DingTalk, WeCom ou Feishu, plutôt que depuis le terminal. Vous envoyez des messages depuis votre téléphone ou votre application de chat de bureau, et l'agent répond exactement comme il le ferait dans le CLI.

Les plateformes d'hébergement de code (à commencer par [GitHub](./github)) et les comptes de workspace authentifiés (à commencer par [DingTalk Workspace](./dws)) sont également supportés via les canaux.

## Fonctionnement

Lorsque vous exécutez `qwen channel start`, Qwen Code :

1. Lit les configurations des canaux depuis votre `settings.json`
2. Lance un processus d'agent unique en utilisant le [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Se connecte à chaque plateforme de messagerie et commence à écouter les messages
4. Route les messages entrants vers l'agent et renvoie les réponses au chat correspondant

Tous les canaux partagent un processus d'agent unique avec des sessions isolées par utilisateur. Chaque canal peut avoir son propre répertoire de travail, son modèle et ses instructions.

## Démarrage rapide

1. Configurez un bot ou un compte de workspace authentifié (voir les guides spécifiques aux canaux : [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk), [DingTalk Workspace](./dws), [WeCom](./wecom), [Feishu](./feishu), [GitHub](./github))
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
      "dmPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Options

| Option                   | Requis         | Description                                                                                                                                                            |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Oui              | Type de canal : `telegram`, `weixin`, `qq`, `dingtalk`, `dws`, `wecom`, `feishu`, `github`, `gitlab`, ou un type personnalisé provenant d'une extension (voir [Plugins](./plugins))                                                       |
| `token`                  | Telegram         | Token du bot. Prend en charge la syntaxe `$ENV_VAR` pour lire les variables d'environnement. Non nécessaire pour WeChat, DingTalk, WeCom ou Feishu                                            |
| `clientId`               | DingTalk, Feishu | AppKey DingTalk ou App ID Feishu. Prend en charge la syntaxe `$ENV_VAR`                                                                                                           |
| `clientSecret`           | DingTalk, Feishu | AppSecret DingTalk ou App Secret Feishu. Prend en charge la syntaxe `$ENV_VAR`                                                                                                    |
| `botId`                  | WeCom            | ID du robot intelligent WeCom. Prend en charge la syntaxe `$ENV_VAR`. Voir [WeCom](./wecom)                                                                                       |
| `secret`                 | WeCom            | Secret du robot intelligent WeCom. Prend en charge la syntaxe `$ENV_VAR`. Voir [WeCom](./wecom)                                                                                       |
| `model`                  | Non               | Modèle à utiliser pour ce canal (ex. : `qwen3.5-plus`). Remplace le modèle par défaut. Utile pour les modèles multimodaux qui prennent en charge l'entrée d'images                               |
| `senderPolicy`           | Non               | Qui peut parler au bot : `allowlist` (par défaut), `open` ou `pairing`                                                                                                   |
| `allowedUsers`           | Non               | Liste des ID d'utilisateurs autorisés à utiliser le bot (utilisé par les politiques `allowlist` et `pairing`)                                                                                   |
| `sessionScope`           | Non               | Comment les sessions sont délimitées : `user` (par défaut), `chat_thread` ou `single`. L'ancien `thread` reste compatible lorsqu'il est déjà configuré mais n'est pas proposé pour les nouvelles configurations Web Shell                                   |
| `multiSession`           | Non               | Conserver jusqu'à huit tâches nommées par propriétaire dans un même chat. Nécessite le mode géré par le démon, `sessionScope: "user"`, pas de webhooks ni de remplissage d'historique de groupe, et aucune boucle de canal activée |
| `cwd`                    | Non               | Répertoire de travail pour l'agent. Par défaut, le répertoire courant                                                                                                     |
| `approvalMode`           | Non               | Mode d'approbation des outils pour les sessions de canal. Les tâches webhook non surveillées nécessitent `yolo` ; le paramètre s'applique à chaque session du canal                                  |
| `instructions`           | Non               | Instructions personnalisées ajoutées au début du premier message de chaque session                                                                                                     |
| `webhooks`               | Non               | Sources webhook et cibles de livraison pour les canaux gérés par le démon. Voir [Tâches déclenchées par webhook](#tâches-déclenchées-par-webhook)                                              |
| `groupPolicy`            | Non               | Accès aux chats de groupe : `disabled` (par défaut), `allowlist`, `pairing` ou `open`. Voir [Chats de groupe](#chats-de-groupe)                                                                       |
| `dmPolicy`               | Non               | Accès MP/privé : `open` (par défaut) ou `disabled` (supprime silencieusement tous les MP). Utile pour les bots uniquement groupe                                                                  |
| `groupHistoryLimit`      | Non               | Remplissage opt-in de l'historique de groupe. `0` ou omis le désactive. Un nombre positif conserve ce nombre de messages de groupe non mentionnés provenant d'expéditeurs autorisés ou de membres de groupes approuvés par appairage pour la prochaine mention/réponse du bot. |
| `groups`                 | Non               | Paramètres par groupe. Les clés sont les ID des chats de groupe ou `"*"` pour les valeurs par défaut. Voir [Chats de groupe](#chats-de-groupe)                                                                     |
| `dispatchMode`           | Non               | Ce qui se passe lorsque vous envoyez un message alors que le bot est occupé : `steer` (par défaut), `collect` ou `followup`. Voir [Modes de dispatch](#modes-de-dispatch)                         |
| `blockStreaming`         | Non               | Livraison progressive des réponses : `on` ou `off` (par défaut). Voir [Streaming par blocs](#streaming-par-blocs)                                                                        |
| `blockStreamingChunk`    | Non               | Limites de taille des chunks : `{ "minChars": 400, "maxChars": 1000 }`. Voir [Streaming par blocs](#streaming-par-blocs)                                                                    |
| `blockStreamingCoalesce` | Non               | Flush en cas d'inactivité : `{ "idleMs": 1500 }`. Voir [Streaming par blocs](#streaming-par-blocs)                                                                                              |

### Politique d'expéditeur

Contrôle qui peut interagir avec le bot :

- **`allowlist`** (par défaut) — Seuls les utilisateurs listés dans `allowedUsers` peuvent envoyer des messages. Les autres sont ignorés silencieusement.
- **`pairing`** — Les expéditeurs inconnus reçoivent un code d'appairage. L'opérateur du bot les approuve via le CLI, et ils sont ajoutés à une liste d'autorisation persistante. Les utilisateurs dans `allowedUsers` sautent entièrement l'appairage. Voir [Appairage en MP](#appairage-en-mp) ci-dessous.
- **`open`** — N'importe qui peut envoyer des messages. À utiliser avec précaution.

### Portée de la session

Contrôle la gestion des sessions de conversation :

- **`user`** (par défaut) — Une session par utilisateur. Tous les messages d'un même utilisateur partagent une conversation.
- **`chat_thread`** — Une session par fil de discussion/sujet, partagée par les participants de ce fil.
- **`thread`** — Routage hérité par fil/sujet conservé pour les configurations existantes.
- **`single`** — Une session partagée pour tous les utilisateurs. Tout le monde partage la même conversation.

### Tâches nommées

Les canaux gérés par le démon peuvent conserver plusieurs conversations nommées pour le même utilisateur dans un chat :

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "sessionScope": "user",
      "multiSession": true
    }
  }
}
```

Le catalogue est privé au canal, au chat et à l'expéditeur exacts. Les noms de tâche utilisent 1 à 32 lettres ASCII, chiffres, tirets bas ou tirets, et sont uniques sans distinction de casse. Jusqu'à huit tâches peuvent être ouvertes ; fermer une tâche la détache sans supprimer sa transcription, donc la sélectionner plus tard rouvre exactement la même conversation. Les ID de session ne sont jamais acceptés ni affichés dans les commandes de chat.

Les résultats nommés identifient leur tâche d'origine : les chats directs utilisent `[task]`, tandis que les chats de groupe utilisent `[sender · task]`. Les invites de permission textuelles nommées affichent également l'ID de requête exact et les commandes `/approve <id>`, `/approve-always <id>` et `/deny <id>` correspondantes. L'étiquette est uniquement présentationnelle et n'est pas stockée dans la transcription du modèle.

Une tâche reste sélectionnée pour recevoir le prochain message normal, mais d'autres tâches nommées peuvent continuer à s'exécuter simultanément dans le répertoire de travail partagé. Créer ou sélectionner une autre tâche n'annule pas ni ne redirige le travail antérieur, et les résultats tardifs conservent leur étiquette de tâche d'origine. Une tâche occupée ne peut pas être fermée, mais son invite active peut être annulée avec `/session cancel [<name>]` via le comportement d'annulation de canal existant. Les tours mis en file d'attente indépendamment ne sont pas annulés, mais en mode de dispatch `collect`, les suivis mis en mémoire tampon derrière l'invite annulée sont supprimés par ce comportement d'annulation existant. La préparation des médias n'est pas ciblée. Les commandes de permission nues s'appliquent uniquement à la tâche sélectionnée, tandis qu'un ID de requête explicite peut répondre à une tâche inactive possédée. Les worktrees par tâche sont prévus pour la partie 4. La mémoire du canal reste limitée au chat plutôt qu'à une tâche nommée.

Ce mode n'est pas disponible avec `qwen channel start` autonome, avec des webhooks, avec un `groupHistoryLimit` de canal ou de groupe non nul, ou avec des boucles de canal. Si une boucle activée existe déjà pour ce canal, le worker du démon refuse de démarrer tant que la boucle n'est pas désactivée.

### Mémoire du canal

La mémoire du canal stocke un contexte durable pour un chat ou un fil de discussion. Les entrées ont des ID stables, donc une réponse de liste peut être utilisée pour des opérations de suivi déterministes.

- `记住：默认使用 staging 环境` est la forme déterministe et sauvegarde exactement une
  entrée scalaire pour le chat ou le fil de discussion en cours.
- Pour sauvegarder plusieurs faits distincts en une seule requête, utilisez une phrase naturelle
  routée via le classificateur. Par exemple :
  `请记住这三条约定：使用 staging；发布前测试；优先中文回复` crée des entrées
  que vous pouvez gérer indépendamment. Les faits exactement dupliqués sont ignorés et
  signalés sans créer d'entrée supplémentaire. Les requêtes contenant du texte
  ressemblant à des identifiants sont rejetées ; supprimez les secrets et sauvegardez
  les faits non sensibles séparément.
- `查看记忆` liste les entrées et leurs ID stables. Utilisez `查看第 2 页记忆` pour
  voir une page suivante, `查看记忆 <id>` pour voir une entrée, ou une requête
  naturelle filtrée comme `只看中文偏好` pour lister les entrées correspondantes.
- `查看刚才那条记忆`, `把关于 staging 的记忆改成默认使用 production`, et
  `忘掉刚才那条` fonctionnent lorsque la référence naturelle correspond à exactement
  une entrée. Les mises à jour et suppressions naturelles affichent d'abord le changement
  proposé. Confirmez une mise à jour avec `确认更新记忆` ou `confirm memory update`,
  ou une suppression avec `确认删除记忆` ou `confirm memory removal`, dans les
  60 secondes. Les mises à jour et suppressions par ID exact restent immédiates et
  ne nécessitent pas de confirmation.
- `清空记忆` démarre le flux de confirmation de suppression totale ; `确认清空记忆`
  le termine.

Lorsqu'une requête naturelle d'inspection, de mise à jour ou de suppression correspond à
plusieurs entrées, le bot renvoie les ID candidats et les aperçus sans modifier la
mémoire. Il n'y a pas de sélection en attente pour un résultat ambigu : réessayez la
requête avec un ID exact, comme `忘掉 m-a31f0d82c7e4`. Les opérations par ID exact
restent le chemin rapide déterministe. Une requête naturelle sans correspondance signale
qu'aucune entrée ne correspond.

Les confirmations en attente de mise à jour, de suppression et de suppression totale
s'appliquent uniquement à l'expéditeur et au chat ou fil de discussion qui les a créées.
Une nouvelle proposition de suppression, de mise à jour ou de suppression naturelle
remplace une ancienne en attente pour cet expéditeur et cette cible. Les confirmations
en attente sont supprimées lors du redémarrage du processus du canal.

Les alias slash hérités `/remember-channel`, `/channel-memory` et
`/forget-channel` ont été supprimés. Ce ne sont plus des commandes de
mémoire du canal.

La mémoire du canal suit les portes d'accès du canal. Tout message accepté par
`senderPolicy`, `dmPolicy`, `groupPolicy`, les paramètres de groupe, l'appairage et les
exigences de mention peut lire, écrire, mettre à jour ou supprimer la mémoire de ce chat
ou fil de discussion. Les membres acceptés d'un même groupe partagent le store cible de
ce groupe. Utilisez les politiques `allowlist` ou `pairing` lorsque la mémoire du groupe
doit être limitée aux expéditeurs fiables.

La mémoire héritée `CHANNEL.md` est migrée automatiquement vers le stockage structuré
`CHANNEL.json` lors de la première mutation. La mémoire structurée persiste à travers
les redémarrages des canaux autonomes et des canaux gérés par le démon, et est injectée
lorsqu'une nouvelle session de cible démarre, y compris après `/clear`.

Après cette injection initiale, chaque message accepté rappelle également jusqu'à trois
entrées pertinentes pour ce message. Cela garde les faits durables disponibles pendant
une session longue sans ajouter chaque entrée stockée à chaque tour. Le rappel est
basé sur le message en cours et ne modifie pas la mémoire stockée.

La mémoire reste indexée par le chat ou le fil de discussion en cours. Elle n'est pas
injectée ni rappelée dans une session `sessionScope: single`, car cette session est
partagée par l'ensemble du canal plutôt que limitée à une cible.

La mémoire du canal n'apprend pas automatiquement des faits à partir d'une conversation
normale et n'accepte pas `第一个` comme confirmation pour une référence naturelle
ambiguë. Utilisez une requête de mémorisation claire et un ID d'entrée exact
lorsqu'une référence naturelle est ambiguë.

### Sécurité des tokens

Les tokens des bots ne doivent pas être stockés directement dans `settings.json`. Utilisez plutôt des références aux variables d'environnement :

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Définissez le token réel dans votre environnement shell ou dans un fichier `.env` qui est chargé avant d'exécuter le canal.

## Appairage en MP

Lorsque `senderPolicy` est défini sur `"pairing"`, les expéditeurs inconnus passent par un processus d'approbation :

1. Un utilisateur inconnu envoie un message au bot
2. Le bot répond avec un code d'appairage de 8 caractères (ex. : `VEQDDWXJ`)
3. L'utilisateur partage le code avec vous (l'opérateur du bot)
4. Vous l'approuvez via le CLI :

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Une fois approuvé, l'ID de l'utilisateur est sauvegardé dans la liste d'autorisation du workspace du canal (`~/.qwen/channels/<workspace-scope>/<name>-allowlist.json`) et tous les futurs messages passent normalement. L'état d'appairage est limité par workspace, donc deux workspaces utilisant le même nom de canal conservent des approbations séparées.

### Commandes CLI d'appairage

```bash
# Lister les requêtes d'appairage en attente
qwen channel pairing list my-channel

# Approuver une requête par code
qwen channel pairing approve my-channel <CODE>
```

Exécutez ces commandes depuis le répertoire de workspace du canal (ou passez `--cwd <dir>`) — l'état d'appairage est stocké par workspace.

### Règles d'appairage

- Les codes font 8 caractères, en majuscules, en utilisant un alphabet sans ambiguïté (pas de `0`/`O`/`1`/`I`)
- Les codes expirent après 1 heure
- Maximum 3 requêtes en attente par canal à la fois, et au plus une par expéditeur — les requêtes supplémentaires sont refusées jusqu'à ce qu'une expire ou soit approuvée
- Les utilisateurs listés dans `allowedUsers` dans `settings.json` sautent l'appairage utilisateur ; sous `groupPolicy: "pairing"`, le groupe lui-même doit toujours être approuvé
- Les utilisateurs approuvés sont stockés par workspace dans `~/.qwen/channels/<workspace-scope>/<name>-allowlist.json` — traitez ce fichier comme sensible

## Chats de groupe

Par défaut, le bot fonctionne uniquement en messages privés. Pour activer le support des chats de groupe, définissez `groupPolicy` sur `"allowlist"`, `"pairing"` ou `"open"`.

### Politique de groupe

Contrôle si le bot participe ou non aux chats de groupe :

- **`disabled`** (par défaut) — Le bot ignore tous les messages de groupe. Option la plus sûre.
- **`allowlist`** — Le bot répond uniquement dans les groupes explicitement listés dans `groups` par ID de chat. La clé `"*"` fournit les paramètres par défaut mais n'agit **pas** comme une autorisation générique (wildcard).
- **`pairing`** — Une mention ou réponse délibérée provenant d'un groupe inconnu crée une demande d'appairage pour le groupe. Une fois approuvée, chaque membre peut utiliser le bot dans ce groupe ; `senderPolicy` continue de contrôler les messages directs.
- **`open`** — Le bot répond dans tous les groupes auxquels il est ajouté. À utiliser avec précaution.

Approuvez un groupe avec la même commande CLI que celle utilisée pour l'appairage utilisateur. La demande en attente identifie le groupe et le membre qui l'a initiée :

```bash
qwen channel pairing approve my-channel <CODE>
```

Les approbations de groupe sont stockées par l'ID de chat du groupe dans le workspace du canal. Sur GitHub et GitLab, l'ID de chat est le chemin du dépôt/projet, donc un renommage ou transfert détache l'approbation stockée — ré-approuvez le groupe après le renommage. Un dépôt ou projet recréé sous le même chemin hérite de toute approbation obsolète — révoquez les approbations de groupe après tout renommage, transfert ou suppression.
Un message non mentionné ne crée jamais de demande d'appairage de groupe, même lorsqu'un groupe
définit `requireMention` sur `false` ; après approbation, la politique de mention configurée
s'applique normalement.

Les demandes d'appairage de groupe partagent la même file d'attente en attente que les demandes
d'appairage en MP : un canal contient au maximum 3 demandes en attente au total, et un expéditeur
détient au plus une demande en attente entre les demandes utilisateur et groupe (voir
[Règles d'appairage](#règles-dappairage)).

### Filtrage par mention

Dans les groupes, le bot exige par défaut une `@mention` ou une réponse à l'un de ses messages. Cela évite que le bot réponde à chaque message dans un chat de groupe.

Configurez cela par groupe avec le paramètre `groups` :

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Paramètres par défaut pour tous les groupes. Définit uniquement les valeurs par défaut de la configuration, pas une entrée de liste d'autorisation.
- **ID du chat de groupe** — Remplace les paramètres pour un groupe spécifique. Remplace les valeurs par défaut de `"*"`.
- **`requireMention`** (par défaut : `true`) — Lorsque `true`, le bot répond uniquement aux messages qui le @mentionnent ou qui répondent à l'un de ses messages. Lorsque `false`, le bot répond à tous les messages (utile pour les groupes dédiés à des tâches spécifiques).

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
- Le `groupHistoryLimit` au niveau du groupe remplace la valeur au niveau du canal.
- Seuls les messages des expéditeurs autorisés ou des membres d'un groupe approuvé par appairage sont persistés.
- Les messages rejetés par `groupPolicy` ou la liste d'autorisation du groupe ne sont pas persistés.
- L'historique de groupe en attente est stocké au format JSONL local sous `~/.qwen/channels/<channel-name>-group-history.jsonl` ou `$QWEN_HOME/channels/<channel-name>-group-history.jsonl`.
- Les messages en cache sont injectés en tant que contexte non fiable lors du prochain déclencheur réel et ne sont pas écrits comme des tours de session autonomes.

### Évaluation des messages de groupe

```
1. groupPolicy — is this group disabled, listed, paired, or open? (no → ignore/pairing flow)
2. dmPolicy — is this DM allowed?                      (disabled → ignore)
3. requireMention — was the bot mentioned/replied to? (no → ignore)
4. senderPolicy — is this sender approved?             (skipped for a paired group; otherwise no → user pairing flow)
5. Route to session
```

### Configuration de Telegram pour les groupes

1. Ajoutez le bot à un groupe
2. **Désactivez le mode privé** dans BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — sinon le bot ne verra pas les messages autres que les commandes
3. **Retirez et rajoutez le bot** au groupe après avoir modifié le mode privé (Telegram met en cache ce paramètre)

### Trouver l'ID d'un chat de groupe

Pour trouver l'ID de chat d'un groupe pour la liste d'autorisation `groups` :

1. Arrêtez le bot s'il est en cours d'exécution
2. Envoyez un message mentionnant le bot dans le groupe
3. Utilisez l'API Telegram Bot pour vérifier les mises à jour en attente :

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Recherchez `message.chat.id` dans la réponse — les ID de groupe sont des nombres négatifs (par exemple, `-5170296765`).

## Prise en charge des médias

Les canaux prennent en charge l'envoi d'images et de fichiers à l'agent, et pas seulement du texte.

### Images

Envoyez une photo au bot et l'agent la verra — utile pour partager des captures d'écran, des messages d'erreur ou des diagrammes. L'image est envoyée directement au modèle en tant qu'entrée visuelle.

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

Envoyez un document (PDF, fichier de code, fichier texte, etc.) au bot. Le fichier est téléchargé et enregistré dans un répertoire temporaire, et l'agent reçoit le chemin du fichier afin qu'il puisse lire son contenu à l'aide de ses outils de lecture de fichiers.

Les fichiers fonctionnent avec n'importe quel modèle — aucune prise en charge multimodale n'est requise.

### Différences entre les plateformes

| Fonctionnalité | Telegram | WeChat | DingTalk | Feishu |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Images | Téléchargement direct via l'API Bot | Téléchargement CDN avec déchiffrement AES | API downloadCode (en deux étapes) | Point de terminaison des ressources Open API (GET authentifié, limite de 50 Mo) |
| Fichiers | Téléchargement direct via l'API Bot (limite de 20 Mo) | Téléchargement CDN avec déchiffrement AES | API downloadCode (en deux étapes) | Point de terminaison des ressources Open API (limite de 50 Mo) |
| Légendes | Légendes photo/fichier incluses comme texte du message | Non applicable | Texte enrichi : texte et images mélangés dans un seul message | Texte enrichi (`post`) : texte extrait ; images intégrées ignorées |

> Le QQ Bot ne traite pas les médias entrants — les messages d'images et d'autocollants sont ignorés, il n'a donc pas de ligne de gestion des médias ci-dessus.
>
> WeCom accepte le texte, les images, le texte mélangé avec des images, les fichiers, les vidéos et les messages vocaux (transcrits). Les images sont transmises à l'agent en tant que pièces jointes ; les fichiers et les vidéos sont téléchargés vers des chemins locaux temporaires. Voir [WeCom](./wecom#images-and-files) pour les détails.

## Modes de dispatch

Contrôle ce qui se passe lorsque vous envoyez un nouveau message alors que le bot traite encore le précédent.

- **`steer`** (par défaut) — Le bot annule la requête en cours et commence à traiter votre nouveau message. Idéal pour une conversation normale, où un suivi signifie généralement que vous voulez corriger ou rediriger le bot.
- **`collect`** — Vos nouveaux messages sont mis en mémoire tampon. Lorsque la requête en cours se termine, tous les messages en mémoire tampon sont combinés en un seul prompt de suivi. Pratique pour les workflows asynchrones où vous souhaitez accumuler vos idées.
- **`followup`** — Chaque message est mis en file d'attente et traité comme son propre tour distinct, dans l'ordre. Utile pour les workflows par lots où chaque message est indépendant.

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

Vous pouvez également définir le mode de dispatch par groupe, outrepassant ainsi la valeur par défaut du canal :

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Streaming par blocs

Par défaut, l'agent travaille pendant un moment puis envoie une seule grande réponse. Avec le streaming par blocs activé, la réponse arrive sous forme de plusieurs messages plus courts pendant que l'agent travaille encore — de la même manière que ChatGPT ou Claude affichent une sortie progressive.

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

- La réponse de l'agent est divisée en blocs au niveau des limites de paragraphes et envoyée sous forme de messages distincts
- `minChars` (par défaut 400) — n'envoie pas un bloc tant qu'il n'atteint pas au moins cette longueur, pour éviter de spammer avec de minuscules messages
- `maxChars` (par défaut 1000) — si un bloc atteint cette longueur sans coupure naturelle, il est envoyé quand même
- `idleMs` (par défaut 1500) — si l'agent fait une pause (par exemple, lors de l'exécution d'un outil), envoie ce qui est en mémoire tampon jusqu'à présent
- Lorsque l'agent a terminé, tout texte restant est envoyé immédiatement

Seul `blockStreaming` est requis. Les paramètres de chunk et de coalesce sont optionnels et ont des valeurs par défaut raisonnables.

## Boucles de canal planifiées

Les canaux disposent d'un planificateur persistant pour les prompts qui doivent s'exécuter plus tard et
renvoyer leur résultat au même chat. Vous pouvez demander à l'agent en langage naturel,
par exemple `Every 15 minutes, check the deployment and report any change`, ou utiliser
les commandes locales directement :

```text
/loop add "*/15 * * * *" check the deployment and report any change
/loop list
/loop inspect <id>
/loop cancel <id>
```

L'agent utilise les outils `channel_loop_create`, `channel_loop_list` et
`channel_loop_cancel` lorsqu'il gère ces tâches pour vous. Les plannings utilisent
des expressions cron standard à cinq champs dans l'heure locale de la machine. La tâche
s'exécute de manière non surveillée et sa réponse finale est livrée automatiquement
au chat qui l'a créée.

Les boucles de canal diffèrent des tâches limitées à la session décrites dans
[Exécuter des prompts de manière planifiée](../scheduled-tasks) :

- Elles sont stockées sous `$QWEN_HOME/channels/` — les canaux autonomes utilisent
  `cron.json` directement, tandis que les canaux gérés par le démon utilisent un fichier
  par workspace sous `daemon/`. Les deux survivent aux redémarrages du canal.
- Elles sont limitées au chat ou fil de discussion du canal en cours. Chaque cible peut
  avoir jusqu'à 10 boucles actives, et chaque prompt est limité à 4 000 caractères.
- Elles nécessitent un adaptateur et une cible qui supportent la livraison proactive.
  Telegram, DingTalk, Feishu et WeCom optent, sous réserve des restrictions de cible
  spécifiques à la plateforme.
- Elles ne sont pas disponibles avec `sessionScope: "single"` car cette portée n'est
  pas liée à une cible de chat unique.
- Une boucle sauvegardée est désactivée si sa cible n'est plus autorisée lorsqu'elle
  doit s'exécuter.

## Résultats d'agent en arrière-plan

Lorsque l'agent délègue du travail à un sous-agent ou un fork en arrière-plan, le
résultat de complétion est renvoyé au chat du canal qui possède la session. La
livraison peut avoir lieu après la fin du tour original, donc gardez le service de
canal ou le démon en cours d'exécution pendant que le travail en arrière-plan est actif.

## Commandes slash

Les canaux prennent en charge les commandes slash. Celles-ci sont gérées localement (sans aller-retour vers l'agent) :

- `/help` — Liste les commandes disponibles
- `/clear` — Efface votre session et repart de zéro (alias : `/reset`, `/new`)
- `/status` — Affiche les informations de session et la politique d'accès
- `/sessions [all]` — Lister les tâches nommées ouvertes, ou inclure les tâches fermées ; disponible uniquement avec `multiSession: true`
- `/session current` — Afficher la tâche nommée sélectionnée
- `/session new <name>` — Créer et sélectionner une tâche avec un workspace partagé
- `/session new <name> --worktree` — Reconnu mais reporté à la partie 4
- `/session use <name>` — Sélectionner une tâche ouverte ou rouvrir une tâche fermée
- `/session cancel [<name>]` — Annuler l'invite active de la tâche sélectionnée, ou nommer une autre tâche possédée ; les tours mis en file d'attente indépendamment ne sont pas annulés, mais les suivis en mode `collect` mis en mémoire tampon derrière l'invite annulée sont supprimés par le comportement d'annulation existant ; la préparation des médias n'est pas ciblée
- `/session close <name>` — Fermer une tâche sans supprimer sa transcription
- `/loop add "<cron>" <prompt>` — Créer une boucle de canal planifiée persistante
- `/loop list` — Lister les boucles du chat en cours
- `/loop inspect <id>` — Afficher le statut et les détails d'exécution d'une boucle
- `/loop cancel <id>` — Désactiver une boucle

Toutes les autres commandes slash (par exemple, `/compress`, `/summary`) sont transmises à l'agent. Les commandes de tâches nommées ne sont enregistrées que lorsque le mode est activé, donc `/sessions` reste visible par l'agent pour les configurations existantes.

Les commandes de tâches nommées fonctionnent sur tous les types de canaux (Telegram, WeChat, QQ, DingTalk, WeCom, Feishu, GitHub). `/cancel` n'est actuellement enregistré que par Telegram, et la création de boucles nécessite le support de la livraison proactive pour l'adaptateur et la cible en cours.

## Exécution

```bash
# Démarrer tous les canaux configurés (processus d'agent partagé)
qwen channel start

# Démarrer un seul canal
qwen channel start my-channel

# Vérifier si le service est en cours d'exécution
qwen channel status

# Arrêter le service en cours d'exécution
qwen channel stop
```

Le bot s'exécute au premier plan. Appuyez sur `Ctrl+C` pour l'arrêter, ou utilisez `qwen channel stop` depuis un autre terminal.

### Mode expérimental géré par le démon

Vous pouvez également exécuter les canaux configurés sous `qwen serve` :

```bash
# Démarrer un canal sous le cycle de vie du démon
qwen serve --channel my-channel

# Démarrer tous les canaux configurés
qwen serve --channel all

# Ou activer les canaux plus tard sur un démon protégé par token
QWEN_SERVER_TOKEN=secret qwen serve
qwen channel set my-channel --token secret

# Interroger ou arrêter la sélection gérée par le démon
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

Ce mode démarre des processus worker de canal groupés par workspace appartenant à `qwen serve`. Les workers se reconnectent au démon via le SDK et utilisent les mêmes adaptateurs de canal. Ils sont distincts du processus démon, ainsi le crash d'un adaptateur de canal ne fait pas planter le démon. Un démon démarré sans `--channel` ne charge pas les adaptateurs de canal ni ne réserve le bail PID du service de canal jusqu'au premier `qwen channel set`.

`qwen serve --channel` n'est pas le même service que `qwen channel start`. La commande autonome `qwen channel start` utilise toujours le service de canal supporté par ACP et peut exécuter des configurations de canal avec des valeurs `cwd` différentes. Les canaux gérés par le démon nécessitent que le `cwd` de chaque canal sélectionné pointe vers un workspace enregistré par le démon. En mode multi-workspace, un remplacement de sélection conserve les workers pour les workspaces dont la liste de canaux ordonnée n'a pas changé ; `all` reste limité au workspace principal.

Sans `--daemon-url`, `qwen channel status` et `qwen channel stop` conservent le comportement pidfile autonome. Leurs variantes avec `--daemon-url` interrogent ou arrêtent le gestionnaire de démon. Les sélections d'exécution ne sont pas écrites dans les paramètres et ne survivent pas aux redémarrages du démon. Si un worker prêt se termine de manière inattendue, le démon continue de s'exécuter et signale un avertissement de worker de canal dans `/daemon/status`.

## Tâches déclenchées par webhook

Les canaux gérés par le démon peuvent également accepter des événements webhook authentifiés. Qwen reçoit l'événement comme contexte, le résume et décide de ce qui est pertinent, puis livre la réponse finale à la cible de chat configurée. Ce n'est pas un relais de notifications brut.
Les tâches webhook nécessitent `approvalMode: "yolo"` car elles s'exécutent sans approbation interactive. Ce paramètre s'applique à l'ensemble du canal, pas seulement aux tours webhook, donc utilisez un canal webhook dédié ou restreignez fortement les expéditeurs de chat normaux pour ce canal.

Exemple de configuration de canal :

```json
{
  "channels": {
    "dingtalk-main": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "cwd": "/repo",
      "senderPolicy": "allowlist",
      "allowedUsers": ["12345"],
      "approvalMode": "yolo",
      "sessionScope": "user",
      "webhooks": {
        "sources": {
          "github-ci": {
            "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
            "targets": {
              "operator": {
                "chatId": "DINGTALK_USER_ID",
                "senderId": "webhook:github-ci",
                "isGroup": false
              },
              "team": {
                "chatId": "OPEN_CONVERSATION_ID",
                "senderId": "webhook:github-ci",
                "isGroup": true
              }
            }
          }
        }
      }
    }
  }
}
```

Pour DingTalk, définissez `isGroup` explicitement sur chaque cible. Une cible de message direct utilise l'ID utilisateur DingTalk comme `chatId` avec `isGroup: false` ; une cible de groupe utilise l'`openConversationId` du groupe avec `isGroup: true`. D'autres adaptateurs peuvent nécessiter leur propre forme de cible proactive.

Les canaux DingTalk, Feishu, Telegram et WeCom gérés par le démon observent dynamiquement les contacts à partir des messages entrants autorisés. Listez les contacts observés dans le workspace principal pendant la fenêtre de fraîcheur par défaut de sept jours :

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/workspace/channel/observed-contacts
```

Utilisez `GET /workspaces/:workspace/channel/observed-contacts` pour sélectionner un autre workspace enregistré et fiable. Ajoutez `?freshWithinSeconds=N` pour choisir une fenêtre d'une seconde à 365 jours. Le démon annonce cette API avec la capacité `workspace_channel_observed_contacts`.

La réponse renvoie des ID de plateforme complets et des labels. Les labels de groupe utilisent les noms déjà présents dans les messages entrants acceptés lorsque disponible : DingTalk fournit `conversationTitle`, et Telegram fournit `chat.title`. Les labels de groupe Feishu et WeCom reviennent actuellement à leurs ID complets ; aucun annuaire de plateforme ou API de détail de groupe n'est interrogé. Les labels de sujet reviennent également à leurs ID complets. Chaque `lastObservedAt` est un horodatage ISO 8601 UTC canonique avec une précision à la milliseconde ; les clients peuvent le convertir dans le fuseau horaire local de l'utilisateur pour l'affichage. Le `users` de premier niveau contient les utilisateurs observés dans les messages directs. `groups` contient les conversations de groupe observées, `groups[].users` contient les utilisateurs observés dans chaque groupe, et `groups[].topics[].users` contient les utilisateurs observés dans les sujets Feishu ou Telegram :

```json
{
  "users": [
    {
      "channelName": "feishu-main",
      "label": "Example User",
      "id": "ou_complete_user_id",
      "lastObservedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "groups": [
    {
      "channelName": "feishu-main",
      "label": "oc_complete_chat_id",
      "id": "oc_complete_chat_id",
      "lastObservedAt": "2026-07-17T08:05:00.000Z",
      "users": [
        {
          "label": "Example User",
          "id": "ou_complete_user_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z"
        }
      ],
      "topics": []
    }
  ]
}
```

Ces utilisateurs imbriqués sont des participants observés, pas une appartenance de groupe autoritaire. Seuls les messages qui passent les portes direct/groupe, mention, expéditeur et appairage sont enregistrés. Les observations répétées rafraîchissent les labels et les horodatages ; l'observation passive ne peut pas détecter un départ ou une suppression jusqu'à ce que la relation devienne obsolète. Le contenu des messages n'est jamais stocké. Le registre borné vit sous `$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json`, en dehors du checkout du workspace et partitionné par workspace. Sa limite de 500 observations est partagée par tous les canaux et conversations de ce workspace, et les observations de plus de 365 jours sont supprimées lors du prochain écriture acceptée. Si le registre devient malformé ou utilise une version non supportée, supprimez ce fichier pour le réinitialiser ; le trafic accepté le recréera. La configuration et la livraison webhook ne sont pas modifiées.

Démarrez `qwen serve` avec le worker de canal activé :

```bash
QWEN_SERVER_TOKEN="$QWEN_SERVER_TOKEN" qwen serve --require-auth --channel dingtalk-main
```

Exemple de requête :

```bash
curl -X POST "http://127.0.0.1:4170/channels/dingtalk-main/webhooks/github-ci" \
  -H "x-qwen-webhook-secret: $QWEN_CHANNEL_GITHUB_CI_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "push",
    "targetRef": "operator",
    "title": "CI pipeline finished",
    "payload": {
      "targetRef": "refs/heads/main",
      "repository": "qwen-code",
      "status": "success"
    }
  }'
```

Les routes webhook s'authentifient avec l'en-tête secret webhook, même lorsque `qwen serve` fonctionne avec l'authentification bearer activée. Ne partagez pas le token bearer du démon avec les fournisseurs webhook. La configuration webhook et les valeurs `secretEnv` sont chargées au démarrage du démon ; redémarrez `qwen serve` après avoir modifié les sources webhook ou effectué une rotation des secrets. Une réponse `202 {"accepted": true}` signifie que le worker de canal a accepté la propriété de la tâche, pas que la réponse finale a déjà été livrée au chat. Consultez les logs du démon et du worker de canal, ainsi que `/daemon/status`, lors du dépannage des échecs de livraison.

### Mode multi-canal

Lorsque vous exécutez `qwen channel start` sans nom, tous les canaux définis dans `settings.json` démarrent ensemble en partageant un seul processus d'agent. Chaque canal maintient ses propres sessions — un utilisateur Telegram et un utilisateur WeChat ont des conversations séparées, même s'ils partagent le même agent.

Chaque canal utilise son propre `cwd` issu de sa configuration, ce qui permet à différents canaux de travailler sur des projets différents simultanément.

### Gestion du service

Le service de canal utilise un fichier PID (`~/.qwen/channels/service.pid`) pour suivre l'instance en cours d'exécution :

- **Prévention des doublons** : Exécuter `qwen channel start` alors qu'un service est déjà en cours d'exécution affichera une erreur au lieu de démarrer une deuxième instance
- **`qwen channel stop`** : Arrête proprement le service en cours d'exécution depuis un autre terminal
- **`qwen channel status`** : Indique si le service est en cours d'exécution, son temps de fonctionnement (uptime) et le nombre de sessions par canal

### Récupération après crash

Si le processus de l'agent plante de manière inattendue, le service de canal le redémarre automatiquement et tente de restaurer toutes les sessions actives. Les utilisateurs peuvent poursuivre leurs conversations sans avoir à recommencer.

- Les sessions sont persistées dans `~/.qwen/channels/sessions.json` pendant que le service est en cours d'exécution
- En cas de crash : l'agent redémarre dans les 3 secondes et recharge les sessions sauvegardées
- Après 3 crashes consécutifs, le service se termine avec une erreur
- Lors d'un arrêt propre (Ctrl+C ou `qwen channel stop`) : les données de session sont effacées — le prochain démarrage est toujours vierge
