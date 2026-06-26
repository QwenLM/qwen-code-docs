# QQ Bot (Robot QQ)

Ce guide explique comment configurer un canal Qwen Code sur QQ via l'API officielle de la plateforme ouverte QQ Bot.

## Prérequis

- Un compte QQ (application mobile pour scanner le code QR)

## Configuration

### Connexion par code QR

Démarrez le canal — la première fois, un code QR s'affiche. Scannez-le avec votre application QQ pour activer le canal. Aucun compte développeur ni inscription manuelle n'est nécessaire. Les identifiants sont sauvegardés et réutilisés automatiquement.

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
# Scannez le code QR dans le terminal avec votre application QQ
```

### Configuration manuelle (portail développeur)

Vous pouvez également utiliser les identifiants du [portail développeur QQ Bot](https://q.qq.com/) si vous avez déjà une application enregistrée :

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

Définissez le secret comme variable d'environnement :

```bash
export QQ_APP_SECRET=<votre-secret-d'application>
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
      "cwd": "/path/to/your/project",
      "instructions": "Vous êtes un assistant IA qui dialogue via QQ Bot. Limitez vos réponses à 2000 caractères.",
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

| Option      | Par défaut | Description                                                                       |
| ----------- | ---------- | --------------------------------------------------------------------------------- |
| `appID`     | —          | AppID QQ Bot du portail développeur. Si omis, la connexion par code QR est utilisée. |
| `appSecret` | —          | AppSecret QQ Bot. Supporte la syntaxe `$ENV_VAR`. Si omis, la connexion par code QR est utilisée. |
| `sandbox`   | `false`    | Définir sur `true` pour utiliser l'environnement API sandbox QQ (`sandbox.api.sgroup.qq.com`) |

Toutes les options standard des canaux (voir [Présentation des canaux](./overview#options)) sont également prises en charge :
`senderPolicy`, `allowedUsers`, `sessionScope`, `cwd`, `instructions`, `groupPolicy`, `groups`, `dispatchMode`, `blockStreaming`, `blockStreamingChunk`, `blockStreamingCoalesce`.

## Exécution

```bash
# Démarrer uniquement le canal QQ
qwen channel start my-qq

# Ou démarrer tous les canaux configurés ensemble
qwen channel start
```

Ouvrez QQ et envoyez un message à votre bot. La réponse devrait arriver dans votre chat.

## Discussions de groupe

Pour utiliser le bot dans des groupes QQ :

1. Définissez `groupPolicy` sur `"allowlist"` ou `"open"` dans la configuration de votre canal
2. Ajoutez le bot à un groupe QQ via le tableau de bord de la plateforme ouverte QQ Bot, ou demandez à un administrateur du groupe de l'inviter
3. Les membres du groupe doivent **mentionner** le bot avec @ pour déclencher une réponse

L'API QQ Bot V2 ne délivre que les messages de groupe qui mentionnent le bot — le bot ne voit pas tous les messages du groupe. Par défaut, `requireMention` est `true` et doit rester ainsi pour QQ.

Voir [Discussions de groupe](./overview#group-chats) pour tous les détails sur les politiques de groupe et le filtrage par mention.

## Prise en charge de Markdown

Le canal QQ Bot prend en charge le formatage Markdown (`msg_type=2`). Les réponses Markdown de l'agent sont envoyées telles quelles, et QQ les affiche avec un formatage riche (gras, italique, blocs de code, liens, listes).

Si le serveur QQ rejette un message Markdown pour une raison quelconque, le canal le retente automatiquement en texte brut — vos messages passent donc toujours, même si la capacité Markdown du bot est restreinte côté serveur.

C'est l'inverse du canal WeChat, qui supprime tout le Markdown. Vous pouvez laisser l'agent utiliser pleinement le Markdown avec le canal QQ.

## Gestion des jetons

Les jetons d'accès expirent après environ 2 heures. Le canal les rafraîchit automatiquement à 80 % de leur durée de vie (généralement ~1,6 heure). Si un rafraîchissement échoue, il réessaie après 60 secondes.

Le rafraîchissement des jetons se poursuit même après une reconnexion WebSocket — le canal ne se déconnecte jamais à cause d'un jeton expiré tant que l'AppID et l'AppSecret restent valides.

## Résilience de la connexion

- **Reconnexion automatique :** En cas de déconnexion WebSocket, le canal réessaie avec un backoff exponentiel (jusqu'à 20 tentatives, 30 secondes max entre les tentatives)
- **Reprise de session :** Si la WebSocket se coupe brièvement, le canal utilise l'opcode `RESUME` de QQ pour restaurer la session sans perdre les messages en cours
- **Continuité du contexte entre serveurs :** Les sessions de chat et l'état de routage sont persistés sur le disque. Si le démon redémarre, les conversations reprennent là où elles se sont arrêtées
- **Surveillance des battements de cœur :** Les délais d'attente HEARTBEAT_ACK sont détectés et forcent une reconnexion pour éviter les connexions zombies
- **Déduplication des messages :** Les messages rejoués après une reconnexion sont détectés et ignorés

## Conseils

- **Utilisez Markdown librement** — Contrairement à WeChat, QQ rend le Markdown nativement. Le gras, les blocs de code, les listes et les liens fonctionnent tous.
- **Limitez les réponses à 2000 caractères** — Les réponses plus longues sont automatiquement fractionnées. Ajouter une indication de longueur dans vos instructions aide l'agent à rester concis.
- **Sandbox pour les tests** — Définissez `"sandbox": true` pour utiliser l'API sandbox pendant le développement. Aucun message de production ne sera affecté.
- **Restreindre l'accès** — Utilisez `senderPolicy: "allowlist"` pour un ensemble fixe d'utilisateurs QQ, ou `"pairing"` pour approuver de nouveaux utilisateurs depuis la CLI. Voir [Appairage MP](./overview#dm-pairing) pour plus de détails.

## Différences clés avec Telegram

| Domaine           | QQ Bot                                      | Telegram                                      |
| ----------------- | ------------------------------------------- | --------------------------------------------- |
| Authentification  | Connexion par code QR ou AppID/AppSecret    | Jeton de bot statique depuis BotFather        |
| Markdown          | Markdown QQ natif avec repli texte brut     | Formaté en HTML à partir du Markdown de l'agent|
| Cycle de vie du jeton | Durée de vie 2h, rafraîchissement auto à 80% | Jeton de bot permanent                        |
| Messages de groupe| Seuls les messages avec @mention sont délivrés au bot | Le bot voit tous les messages (mode privé désactivé) |
| Indicateur de saisie | Non disponible (limitation API QQ)       | Message "En cours..."                         |
| Mode sandbox      | Pris en charge pour les tests               | Non disponible                                |

## Dépannage

### Le bot ne répond pas

- Vérifiez la sortie du terminal pour les erreurs
- Vérifiez que le canal est en cours d'exécution (`qwen channel status`)
- Si vous utilisez `senderPolicy: "allowlist"`, assurez-vous que votre ID utilisateur QQ se trouve dans `allowedUsers`
- Au premier démarrage, un code QR apparaît dans le terminal — scannez-le avec votre application QQ

### Le bot ne répond pas dans les groupes

- Vérifiez que `groupPolicy` est défini sur `"allowlist"` ou `"open"` (la valeur par défaut est `"disabled"`)
- **Vous devez mentionner le bot avec @** — QQ ne délivre que les messages qui taguent le bot
- Vérifiez que le bot a été ajouté au groupe

### La connexion par code QR est bloquée

- Le code QR s'affiche dans le terminal. Scannez-le avec votre application QQ mobile (Moi → Scanner)
- Si le code QR expire (généralement après quelques minutes), redémarrez le canal pour en obtenir un nouveau

### Les messages Markdown apparaissent en texte brut

- Le serveur QQ a peut-être rejeté le message Markdown et le canal est silencieusement revenu au texte brut. Vérifiez dans le terminal les messages `"Markdown rejected"`
- C'est inhabituel sur la plateforme ouverte QQ Bot, mais peut arriver si la capacité Markdown du bot est restreinte côté serveur

### Jeton expiré après une longue indisponibilité

- Si le canal est hors ligne pendant plus de 2 heures, le jeton d'accès aura expiré. Le canal récupère un nouveau jeton à la reconnexion — aucune action nécessaire
- Si l'AppSecret lui-même n'est pas valide (par exemple, il a été changé dans le portail développeur), mettez à jour le champ `appSecret` ou supprimez `~/.qwen/channels/<name>-credentials.json` pour relancer la connexion par code QR