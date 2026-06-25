# QQ Bot

Ce guide explique comment configurer un canal Qwen Code sur QQ via l'API officielle de la plateforme QQ Bot.

## Prérequis

- Un compte QQ (application mobile pour scanner le QR code)

## Configuration

### Connexion par QR code

Démarrez le canal – la première fois, un QR code s'affiche. Scannez-le avec votre application QQ pour l'activer. Aucun compte développeur ni inscription manuelle n'est nécessaire. Les identifiants sont enregistrés et réutilisés automatiquement.

```json
{
  "channels": {
    "my-qq": {
      "type": "qq"
    }
  }
}
```

```bash
qwen channel start my-qq
# Scannez le QR code dans le terminal avec votre application QQ
```

### Configuration manuelle (Portail développeur)

Vous pouvez également utiliser les identifiants du [portail développeur QQ Bot](https://q.qq.com/) si vous avez déjà une application enregistrée :

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET"
    }
  }
}
```

Définissez le secret comme variable d'environnement :

```bash
export QQ_APP_SECRET=<votre-secret-d-application>
```

## Configuration

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET",
      "sandbox": false,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/chemin/vers/votre/projet",
      "instructions": "你是一个通过 QQ Bot 对话的 AI 助手。回复控制在 2000 字符以内。",
      "blockStreaming": "on",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Options spécifiques à QQ

| Option       | Défaut   | Description                                                                         |
| ------------ | -------- | ----------------------------------------------------------------------------------- |
| `appID`      | —        | AppID du QQ Bot depuis le portail développeur. Si omis, connexion par QR code.      |
| `appSecret`  | —        | AppSecret du QQ Bot. Supporte la syntaxe `$ENV_VAR`. Si omis, connexion par QR code.|
| `sandbox`    | `false`  | Mettez `true` pour utiliser l'environnement API sandbox de QQ (`sandbox.api.sgroup.qq.com`) |

Toutes les options standard des canaux (voir [Aperçu des canaux](./overview#options)) sont également prises en charge :
`senderPolicy`, `allowedUsers`, `sessionScope`, `cwd`, `instructions`, `groupPolicy`, `groups`, `dispatchMode`, `blockStreaming`, `blockStreamingChunk`, `blockStreamingCoalesce`.

## Exécution

```bash
# Démarrer uniquement le canal QQ
qwen channel start my-qq

# Ou démarrer tous les canaux configurés ensemble
qwen channel start
```

Ouvrez QQ et envoyez un message à votre bot. La réponse devrait arriver dans votre conversation.

## Discussions de groupe

Pour utiliser le bot dans des groupes QQ :

1. Définissez `groupPolicy` sur `"allowlist"` ou `"open"` dans la configuration de votre canal
2. Ajoutez le bot à un groupe QQ via le tableau de bord du portail développeur QQ Bot ou en demandant à un administrateur du groupe de l'inviter
3. Les membres du groupe doivent **mentionner** le bot avec @ pour déclencher une réponse

L'API QQ Bot V2 ne transmet que les messages de groupe qui mentionnent le bot avec @ – le bot ne voit pas tous les messages du groupe. Par défaut, `requireMention` est `true` et doit rester ainsi pour QQ.

Consultez [Discussions de groupe](./overview#group-chats) pour tous les détails sur les politiques de groupe et le filtrage par mention.

## Support Markdown

Le canal QQ Bot prend en charge le formatage Markdown (`msg_type=2`). Les réponses Markdown de l'agent sont envoyées telles quelles, et QQ les affiche avec un formatage riche (gras, italique, blocs de code, liens, listes).

Si le serveur QQ rejette un message Markdown pour une raison quelconque, le canal le renvoie automatiquement en texte brut – ainsi vos messages passent toujours, même si la capacité Markdown du bot est restreinte côté serveur.

C'est l'inverse du canal WeChat, qui supprime tout le Markdown. Vous pouvez laisser l'agent utiliser pleinement le Markdown avec le canal QQ.

## Gestion des jetons

Les jetons d'accès expirent après environ 2 heures. Le canal les actualise automatiquement à 80 % de leur durée de vie (généralement ~1,6 heure). Si une actualisation échoue, elle est réessayée après 60 secondes.

L'actualisation des jetons continue après les reconnexions WebSocket – le canal ne tombe jamais hors ligne à cause d'un jeton expiré tant que l'AppID et l'AppSecret restent valides.

## Résilience de connexion

- **Reconnexion automatique :** En cas de déconnexion WebSocket, le canal réessaie avec un backoff exponentiel (jusqu'à 20 tentatives, max 30 secondes entre les tentatives)
- **Reprise de session :** Si le WebSocket se déconnecte brièvement, le canal utilise le code `RESUME` de QQ pour restaurer la session sans perdre les messages en transit
- **Continuation du contexte entre serveurs :** Les sessions de discussion et l'état de routage sont persistés sur le disque. Si le démon redémarre, les conversations reprennent là où elles se sont arrêtées
- **Surveillance des battements de cœur :** Les timeouts HEARTBEAT_ACK sont détectés et forcent une reconnexion pour éviter les connexions zombies
- **Déduplication des messages :** Les messages rejoués après une reconnexion sont détectés et ignorés

## Conseils

- **Utilisez librement le Markdown** – Contrairement à WeChat, QQ rend le Markdown nativement. Le gras, les blocs de code, les listes et les liens fonctionnent tous.
- **Gardez les réponses sous 2000 caractères** – Les réponses plus longues sont automatiquement découpées en morceaux. Ajouter une indication de longueur dans vos instructions aide l'agent à rester concis.
- **Sandbox pour les tests** – Définissez `"sandbox": true` pour utiliser l'API sandbox pendant le développement. Aucun message de production ne sera affecté.
- **Restreignez l'accès** – Utilisez `senderPolicy: "allowlist"` pour un ensemble fixe d'utilisateurs QQ, ou `"pairing"` pour approuver de nouveaux utilisateurs depuis la ligne de commande. Voir [Appairage en MP](./overview#dm-pairing) pour plus de détails.
## Principales différences avec Telegram

| Domaine             | QQ Bot                                      | Telegram                                      |
| ------------------- | ------------------------------------------- | --------------------------------------------- |
| Authentification    | Connexion par QR code ou AppID/AppSecret    | Jeton statique du bot depuis BotFather        |
| Markdown            | Markdown natif QQ avec repli en texte brut  | Formaté en HTML à partir du Markdown de l'agent|
| Cycle de vie du jeton| 2h de TTL, actualisation automatique à 80%  | Jeton permanent du bot                        |
| Messages de groupe  | Seuls les messages @mention sont livrés au bot | Le bot voit tous les messages (mode privé désactivé) |
| Indicateur de saisie| Non disponible (limitation de l'API QQ)     | Message « En cours... »                      |
| Mode bac à sable    | Pris en charge pour les tests               | Non disponible                                |

## Dépannage

### Le bot ne répond pas

- Vérifiez la sortie du terminal pour les erreurs
- Vérifiez que le canal est en cours d'exécution (`qwen channel status`)
- Si vous utilisez `senderPolicy: "allowlist"`, assurez-vous que votre ID utilisateur QQ figure dans `allowedUsers`
- Au premier démarrage, un QR code apparaîtra dans le terminal — scannez-le avec votre application QQ

### Le bot ne répond pas dans les groupes

- Vérifiez que `groupPolicy` est défini sur `"allowlist"` ou `"open"` (la valeur par défaut est `"disabled"`)
- **Vous devez @mentionner le bot** — QQ ne livre que les messages qui taguent le bot
- Vérifiez que le bot a été ajouté au groupe

### La connexion par QR code est bloquée

- Le QR code est affiché dans le terminal. Scannez-le avec votre application QQ mobile (Moi → Scanner)
- Si le QR code expire (généralement après quelques minutes), redémarrez le canal pour en obtenir un nouveau

### Les messages Markdown apparaissent en texte brut

- Le serveur QQ a peut-être rejeté le message Markdown et le canal est silencieusement revenu au texte brut. Vérifiez le terminal pour les messages de journal `"Markdown rejected"`
- Cela est inhabituel sur la plateforme QQ Bot Open Platform, mais peut se produire si la capacité Markdown du bot est restreinte côté serveur

### Jeton expiré après une longue indisponibilité

- Si le canal est hors ligne pendant plus de 2 heures, le jeton d'accès aura expiré. Le canal récupère un nouveau jeton lors de la reconnexion — aucune action requise
- Si l'AppSecret lui-même est invalide (par exemple, rotation dans le portail développeur), mettez à jour le champ `appSecret` ou supprimez `~/.qwen/channels/<name>-credentials.json` pour relancer la connexion par QR code
