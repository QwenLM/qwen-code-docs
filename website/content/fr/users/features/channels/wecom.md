# WeCom (WeChat d'entreprise)

Ce guide explique comment configurer Qwen Code avec un robot intelligent WeCom (企业微信智能机器人).

## Prérequis

- Un compte d'organisation WeCom
- Un robot intelligent WeCom créé en mode API
- Le Bot ID et le Secret du robot

## Création du robot

1. Ouvrez la console d'administration WeCom et créez un robot intelligent.

![](https://gw.alicdn.com/imgextra/i2/O1CN017w1jWj1TTvNBcfya8_!!6000000002384-2-tps-2212-887.png)

2. Choisissez le mode API.

![](https://gw.alicdn.com/imgextra/i3/O1CN01buuik0207paQUuLQW_!!6000000006803-1-tps-1276-720.gif)

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
      "groupPolicy": "open"
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

`senderPolicy` fonctionne de la même manière que pour les autres canaux de messagerie instantanée :

- `allowlist` : seuls les utilisateurs présents dans `allowedUsers` peuvent utiliser le bot. C'est le paramètre par défaut recommandé pour les entreprises.
- `pairing` : les utilisateurs doivent s'appairer avant d'utiliser le bot.
- `open` : toute personne pouvant envoyer un message au robot peut l'utiliser.

Pour les groupes, définissez `groupPolicy` sur `"allowlist"` ou `"open"`. WeCom ne délivre que les messages de groupe qui mentionnent le robot intelligent, donc chaque callback de groupe délivré est traité comme mentionné. Le paramètre `requireMention` ne peut pas activer les réponses aux messages de groupe non mentionnés car ces messages ne sont pas délivrés au bot.

### Compatibilité des mentions de groupe

Les versions précédentes de Qwen Code appliquaient également le filtre générique `requireMention` après que WeCom ait délivré un callback de groupe. Comme le callback n'inclut pas de métadonnées de mention séparées, `requireMention: true` — y compris la valeur par défaut — pouvait rejeter chaque message de groupe délivré et faire paraître le chat de groupe non fonctionnel.

Qwen Code s'appuie désormais sur la livraison limitée aux mentions de WeCom et n'applique pas de seconde décision de mention. Les configurations WeCom existantes contenant soit `requireMention: true` soit `requireMention: false` restent valides et ne produisent pas d'erreurs de configuration. Les deux valeurs ont le même comportement pour WeCom, donc le champ peut être supprimé. Les autres paramètres dans la même entrée de groupe, comme `dispatchMode`, continuent de s'appliquer. `groupHistoryLimit` reste accepté mais ne peut pas collecter de nouvel historique WeCom car les messages de groupe non mentionnés ne sont pas délivrés.

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

- Vérifiez `groupPolicy`.
- Mentionnez le bot dans le groupe.
- Confirmez que le robot a été ajouté au groupe.

### Les identifiants de l'application auto-créée ne fonctionnent pas

Ce canal est destiné aux robots intelligents WeCom. Les identifiants de rappel des applications auto-créées tels que Corp ID, Agent ID, Token et EncodingAESKey ne sont pas utilisés par ce canal.