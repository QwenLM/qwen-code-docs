# WeCom (WeChat d'entreprise)

Ce guide explique comment configurer Qwen Code avec un robot intelligent WeCom (企业微信智能机器人).

## Prérequis

- Un compte d'organisation WeCom
- Un robot intelligent WeCom créé en mode API
- Le Bot ID et le Secret du robot

## Création du robot

1. Ouvrez la console d'administration WeCom et créez un robot intelligent.
2. Choisissez le mode API.
3. Copiez le Bot ID et le Secret.
4. Ajoutez le robot aux discussions directes ou aux groupes où il doit être disponible.

Le robot intelligent utilise une connexion WebSocket de Qwen Code vers WeCom. Vous n'avez pas besoin d'une URL de rappel publique, d'un Token, d'un EncodingAESKey, d'un Corp ID ou d'un Agent ID.

## Configuration

Ajoutez le canal à `~/.qwen/settings.json` :

```json
{
  "channels": {
    "my-wecom": {
      "type": "wecom",
      "botId": "$WECOM_BOT_ID",
      "secret": "$WECOM_SECRET",
      "senderPolicy": "allowlist",
      "allowedUsers": ["zhangsan"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via WeCom.",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Définissez les identifiants en tant que variables d'environnement :

```bash
export WECOM_BOT_ID=<your-bot-id>
export WECOM_SECRET=<your-secret>
```

Ou définissez-les dans la section `env` de `settings.json` :

```json
{
  "env": {
    "WECOM_BOT_ID": "your-bot-id",
    "WECOM_SECRET": "your-secret"
  }
}
```

## Lancement

```bash
qwen channel start my-wecom
```

Ouvrez WeCom et envoyez un message au robot intelligent.

## Contrôle d'accès

senderPolicy fonctionne de la même manière que pour les autres canaux de messagerie instantanée :

- allowlist : seuls les utilisateurs présents dans allowedUsers peuvent utiliser le bot. C'est le paramètre par défaut recommandé pour les entreprises.
- pairing : les utilisateurs doivent s'appairer avant d'utiliser le bot.
- open : toute personne pouvant envoyer un message au robot peut l'utiliser.

Pour les groupes, définissez groupPolicy sur `"allowlist"` ou `"open"`. Par défaut, les messages de groupe nécessitent une mention via `"requireMention": true`.

Lorsque le SDK WeCom inclut des métadonnées de mention explicites, Qwen Code les utilise pour ce filtre. Si aucune métadonnée de mention n'est présente, le canal traite les messages de groupe délivrés comme non mentionnés. Définissez `"requireMention": false` uniquement si vous préférez vous fier au filtrage de livraison côté WeCom.

## Images et fichiers

Les utilisateurs peuvent envoyer du texte, des messages vocaux avec transcription, des images, du texte mélangé à des images, des fichiers et des vidéos. Les images sont transmises à l'agent en tant que pièces jointes. Les fichiers et les vidéos sont téléchargés vers des chemins locaux temporaires afin que l'agent puisse les lire avec des outils de fichiers.

Les réponses de l'assistant sont envoyées en markdown WeCom. Pour envoyer une image locale générée par l'agent, incluez un marqueur en dehors des blocs de code :

```text
[IMAGE: /absolute/path/to/image.png]
```

Par mesure de sécurité, les chemins des images locales doivent se trouver dans le répertoire de fichiers du canal, sous le répertoire temporaire du système, comme `/tmp/channel-files/...` sur Linux. Les marqueurs de téléchargement génériques pour les fichiers, les vidéos et la voix sont ignorés, car les chemins de fichiers produits par le modèle pourraient autrement télécharger des fichiers arbitraires de l'espace de travail.

## Dépannage

### Le bot ne se connecte pas

- Vérifiez le Bot ID et le Secret.
- Assurez-vous que le robot est créé en mode API.
- Vérifiez que les variables d'environnement sont disponibles dans le shell exécutant `qwen channel start`.

### Le bot ne répond pas dans les groupes

- Vérifiez groupPolicy.
- Mentionnez le bot sauf si la configuration du groupe définit `"requireMention": false`.
- Confirmez que le robot a été ajouté au groupe.

### Les identifiants de l'application auto-créée ne fonctionnent pas

Ce canal est destiné aux robots intelligents WeCom. Les identifiants de rappel des applications auto-créées tels que Corp ID, Agent ID, Token et EncodingAESKey ne sont pas utilisés par ce canal.