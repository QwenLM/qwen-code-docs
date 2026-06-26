# WeChat (Weixin)

Ce guide explique comment configurer un canal Qwen Code sur WeChat via l'API officielle iLink Bot.

## Prérequis

- Un compte WeChat capable de scanner des codes QR (application mobile)
- Un accès à la plateforme iLink Bot (API bot officielle de WeChat)

## Configuration

### 1. Connexion via code QR

WeChat utilise une authentification par code QR au lieu d'un token statique. Exécutez la commande de connexion :

```bash
qwen channel configure-weixin
```

Cela affichera une URL de code QR. Scannez-la avec votre application mobile WeChat pour vous authentifier. Vos identifiants sont sauvegardés dans `~/.qwen/channels/weixin/account.json`.

### 2. Configurer le canal

Ajoutez le canal dans `~/.qwen/settings.json` :

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
      "instructions": "Vous êtes un assistant de codage concis qui répond via WeChat. Limitez vos réponses à 500 caractères. Utilisez uniquement du texte brut."
    }
  }
}
```

Remarque : les canaux WeChat n'utilisent pas de champ `token` — les identifiants proviennent de l'étape de connexion par QR.

### 3. Démarrer le canal

```bash
# Démarrer uniquement le canal WeChat
qwen channel start my-weixin

# Ou démarrer tous les canaux configurés ensemble
qwen channel start
```

Ouvrez WeChat et envoyez un message au bot. Vous devriez voir un indicateur de saisie ("...") pendant que l'agent traite, suivi de la réponse.

## Images et fichiers

Vous pouvez envoyer des photos et des documents au bot, pas seulement du texte.

**Photos :** Envoyez une image (capture d'écran, photo, etc.) et l'agent l'analysera grâce à ses capacités de vision. Cela nécessite un modèle multimodal — ajoutez `"model": "qwen3.5-plus"` (ou un autre modèle compatible vision) à la configuration de votre canal. Un indicateur de saisie s'affiche pendant le téléchargement et le traitement de l'image.

**Fichiers :** Envoyez un PDF, un fichier de code ou tout autre document. Le bot télécharge et déchiffre le fichier depuis le CDN de WeChat, le sauvegarde localement, et l'agent le lit avec ses outils de fichiers. Cela fonctionne avec n'importe quel modèle.

## Options de configuration

Les canaux WeChat prennent en charge toutes les options standard des canaux (voir [Vue d'ensemble des canaux](./overview#options)), auxquelles s'ajoutent :

| Option    | Description                                                                               |
| --------- | ----------------------------------------------------------------------------------------- |
| `baseUrl` | Remplacer l'URL de base de l'API iLink Bot (par défaut : `https://ilinkai.weixin.qq.com`) |

## Différences clés avec Telegram

- **Authentification :** Connexion par code QR au lieu d'un token bot statique. Les sessions peuvent expirer — le canal se mettra en pause et enregistrera un message si cela se produit.
- **Formatage :** WeChat ne prend en charge que le texte brut. Le Markdown dans les réponses de l'agent est automatiquement supprimé.
- **Indicateur de saisie :** WeChat affiche un indicateur natif "..." au lieu d'un message "Working...".
- **Groupes :** Le bot iLink WeChat est réservé aux messages privés — les discussions de groupe ne sont pas prises en charge.
- **Chiffrement des médias :** Les images et fichiers sont chiffrés sur le CDN de WeChat avec AES-128-ECB. Le canal gère le déchiffrement de manière transparente.

## Astuces

- **Utilisez des instructions en texte brut** — Étant donné que WeChat supprime tout Markdown, ajoutez des instructions comme "Utilisez uniquement du texte brut" pour éviter que l'agent produise des réponses formatées qui semblent brouillonnes.
- **Gardez les réponses courtes** — Les bulles de messages WeChat fonctionnent mieux avec un texte concis. Ajouter une limite de caractères à vos instructions aide (par exemple, "Limitez vos réponses à 500 caractères").
- **Expiration de session** — Si vous voyez "Session expired (errcode -14)" dans les logs, votre session WeChat a expiré. Arrêtez le canal et exécutez à nouveau `qwen channel configure-weixin` pour vous reconnecter.
- **Restreindre l'accès** — Utilisez `senderPolicy: "pairing"` ou `"allowlist"` pour contrôler qui peut parler au bot. Voir [Appariement DM](./overview#dm-pairing) pour plus de détails.

## Dépannage

### "Compte WeChat non configuré"

Exécutez d'abord `qwen channel configure-weixin` pour vous connecter via code QR.

### "Session expirée (errcode -14)"

Votre session de connexion WeChat a expiré. Arrêtez le canal et exécutez à nouveau `qwen channel configure-weixin`.

### Le bot ne répond pas

- Vérifiez la sortie du terminal pour des erreurs
- Assurez-vous que le canal est en cours d'exécution (`qwen channel start my-weixin`)
- Si vous utilisez `senderPolicy: "allowlist"`, vérifiez que votre ID utilisateur WeChat est dans `allowedUsers`

### Les images ne fonctionnent pas

- Assurez-vous que la configuration de votre canal contient un `model` prenant en charge la vision (ex. `qwen3.5-plus`)
- Vérifiez le terminal pour des erreurs de téléchargement CDN — celles-ci peuvent indiquer un problème réseau