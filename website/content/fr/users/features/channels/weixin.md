# WeChat (Weixin)

Ce guide explique comment configurer un canal Qwen Code sur WeChat via l'API officielle iLink Bot.

## Prérequis

- Un compte WeChat capable de scanner des codes QR (application mobile)
- Un accès à la plateforme iLink Bot (l'API bot officielle de WeChat)

## Configuration

### 1. Connexion via code QR

WeChat utilise l'authentification par code QR au lieu d'un jeton bot statique. Exécutez la commande de connexion :

```bash
qwen channel configure-weixin
```

Cela affichera une URL de code QR. Scannez-la avec votre application mobile WeChat pour vous authentifier. Vos identifiants sont sauvegardés dans `~/.qwen/channels/weixin/account.json`.

### 2. Configurer le canal

Ajoutez le canal à `~/.qwen/settings.json` :

```json
{
  "channels": {
    "my-weixin": {
      "type": "weixin",
      "senderPolicy": "pairing",
      "allowedUsers": [],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "model": "qwen3.5-plus",
      "instructions": "You are a concise coding assistant responding via WeChat. Keep responses under 500 characters. Use plain text only."
    }
  }
}
```

Remarque : les canaux WeChat n'utilisent pas de champ `token` — les identifiants proviennent de l'étape de connexion par QR code.

### 3. Démarrer le canal

```bash
# Start only the WeChat channel
qwen channel start my-weixin

# Or start all configured channels together
qwen channel start
```

Ouvrez WeChat et envoyez un message au bot. Vous devriez voir un indicateur de saisie ("...") pendant que l'agent traite la demande, suivi de la réponse.

## Images et fichiers

Vous pouvez envoyer des photos et des documents au bot, pas seulement du texte.

**Photos :** Envoyez une image (capture d'écran, photo, etc.) et l'agent l'analysera grâce à ses capacités de vision. Cela nécessite un modèle multimodal — ajoutez `"model": "qwen3.5-plus"` (ou un autre modèle compatible vision) à la configuration de votre canal. Un indicateur de saisie s'affiche pendant le téléchargement et le traitement de l'image.

**Fichiers :** Envoyez un PDF, un fichier de code ou tout autre document. Le bot le télécharge et le déchiffre depuis le CDN de WeChat, le sauvegarde localement, et l'agent le lit à l'aide de ses outils de gestion de fichiers. Cela fonctionne avec n'importe quel modèle.

## Options de configuration

Les canaux WeChat prennent en charge toutes les options standard des canaux (voir [Aperçu des canaux](./overview#options)), ainsi que :

| Option    | Description                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| `baseUrl` | Remplace l'URL de base de l'API iLink Bot (par défaut : `https://ilinkai.weixin.qq.com`) |

## Différences clés avec Telegram

- **Authentification :** Connexion par code QR au lieu d'un jeton bot statique. Les sessions peuvent expirer — le canal se mettra en pause et enregistrera un message si cela se produit.
- **Mise en forme :** WeChat ne prend en charge que le texte brut. Le Markdown dans les réponses de l'agent est automatiquement supprimé.
- **Indicateur de saisie :** WeChat dispose d'un indicateur de saisie natif "..." au lieu d'un message texte "Working...".
- **Groupes :** Le bot iLink WeChat fonctionne uniquement en messages privés — les discussions de groupe ne sont pas prises en charge.
- **Chiffrement des médias :** Les images et les fichiers sont chiffrés sur le CDN de WeChat avec AES-128-ECB. Le canal gère le déchiffrement de manière transparente.

## Conseils

- **Utilisez des instructions en texte brut** — Puisque WeChat supprime tout le Markdown, ajoutez des instructions comme "Use plain text only" pour éviter que l'agent ne génère des réponses formatées qui s'affichent mal.
- **Gardez les réponses courtes** — Les bulles de message WeChat fonctionnent mieux avec du texte concis. Ajouter une limite de caractères à vos instructions est utile (par ex. "Keep responses under 500 characters").
- **Expiration de session** — Si vous voyez "Session expired (errcode -14)" dans les logs, votre connexion WeChat a expiré. Arrêtez le canal et relancez `qwen channel configure-weixin` pour vous reconnecter.
- **Restreindre l'accès** — Utilisez `senderPolicy: "pairing"` ou `"allowlist"` pour contrôler qui peut discuter avec le bot. Consultez [Appairage en messages privés](./overview#dm-pairing) pour plus de détails.

## Dépannage

### "WeChat account not configured"

Exécutez `qwen channel configure-weixin` pour vous connecter via code QR au préalable.

### "Session expired (errcode -14)"

Votre session de connexion WeChat a expiré. Arrêtez le canal et exécutez à nouveau `qwen channel configure-weixin`.

### Le bot ne répond pas

- Vérifiez les erreurs dans la sortie du terminal
- Vérifiez que le canal est en cours d'exécution (`qwen channel start my-weixin`)
- Si vous utilisez `senderPolicy: "allowlist"`, assurez-vous que votre ID utilisateur WeChat figure dans `allowedUsers`

### Les images ne fonctionnent pas

- Assurez-vous que la configuration de votre canal spécifie un `model` compatible avec la vision (par ex. `qwen3.5-plus`)
- Vérifiez les erreurs de téléchargement CDN dans le terminal — elles peuvent indiquer un problème réseau