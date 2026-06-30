# Plugins de canaux personnalisés

Vous pouvez étendre le système de canaux avec des adaptateurs de plateforme personnalisés empaquetés sous forme d'[extensions](../../extension/introduction). Cela vous permet de connecter Qwen Code à n'importe quelle plateforme de messagerie, webhook ou transport personnalisé.

## Fonctionnement

Les plugins de canaux sont chargés au démarrage à partir des extensions actives. Lorsque `qwen channel start` s'exécute, il :

1. Analyse toutes les extensions activées pour y trouver les entrées `channels` dans leur `qwen-extension.json`
2. Importe dynamiquement le point d'entrée de chaque canal
3. Enregistre le type de canal afin qu'il puisse être référencé dans `settings.json`
4. Crée les instances de canal en utilisant la fonction factory du plugin

Votre canal personnalisé bénéficie gratuitement du pipeline partagé complet : contrôle des expéditeurs, politiques de groupe, routage de session, commandes slash, récupération après crash et un bridge d'agent. Le `qwen channel start` autonome fournit actuellement `AcpBridge` ; le code de l'adaptateur du plugin doit dépendre du contrat `ChannelAgentBridge` destiné aux adaptateurs. Les plugins TypeScript existants avec un paramètre de bridge explicite `AcpBridge` doivent migrer cette annotation vers `ChannelAgentBridge` ; les plugins JavaScript ne sont pas affectés à l'exécution.

## Installation d'un canal personnalisé

Installez une extension qui fournit un plugin de canal :

```bash
# Depuis un chemin local (pour le développement ou les plugins privés)
qwen extensions install /path/to/my-channel-extension

# Ou liez-le pour le développement (les modifications sont prises en compte immédiatement)
qwen extensions link /path/to/my-channel-extension
```

## Configuration d'un canal personnalisé

Ajoutez une entrée de canal à `~/.qwen/settings.json` en utilisant le type personnalisé fourni par l'extension :

```json
{
  "channels": {
    "my-bot": {
      "type": "my-platform",
      "apiKey": "$MY_PLATFORM_API_KEY",
      "senderPolicy": "open",
      "cwd": "/path/to/project"
    }
  }
}
```

Le `type` doit correspondre à un type de canal enregistré par une extension installée. Consultez la documentation de l'extension pour savoir quels champs spécifiques au plugin sont requis (par exemple, `apiKey`, `webhookUrl`).

Toutes les options de canal standard fonctionnent avec les canaux personnalisés :

| Option         | Description                                    |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`, `pairing` ou `open`               |
| `allowedUsers` | Liste statique d'identifiants d'expéditeurs autorisés |
| `sessionScope` | `user`, `thread` ou `single`                   |
| `cwd`          | Répertoire de travail pour l'agent             |
| `instructions` | Ajoutées au début du premier message de chaque session |
| `model`        | Remplacement de modèle pour le canal           |
| `groupPolicy`  | `disabled`, `allowlist` ou `open`              |
| `groups`       | Paramètres par groupe                          |

Voir la [vue d'ensemble](./overview) pour les détails sur chaque option.

## Démarrage du canal

```bash
# Démarre tous les canaux, y compris les canaux personnalisés
qwen channel start

# Démarre uniquement votre canal personnalisé
qwen channel start my-bot
```

## Fonctionnalités incluses d'office

Les canaux personnalisés prennent automatiquement en charge tout ce que les canaux intégrés supportent :

- **Politiques d'expéditeur** — Contrôle d'accès `allowlist`, `pairing` et `open`
- **Politiques de groupe** — Paramètres par groupe avec filtrage optionnel par @mention
- **Routage de session** — Sessions par utilisateur, par fil de discussion ou session unique partagée
- **Appairage en MP** — Flux complet de code d'appairage pour les utilisateurs inconnus
- **Commandes slash** — `/help`, `/clear`, `/status` fonctionnent d'emblée
- **Instructions personnalisées** — Ajoutées au début du premier message de chaque session
- **Récupération après crash** — Redémarrage automatique avec préservation de la session
- **Sérialisation par session** — Les messages sont mis en file d'attente pour éviter les conditions de course

## Créer votre propre plugin de canal

Vous souhaitez créer un plugin de canal pour une nouvelle plateforme ? Consultez le [Guide du développeur de plugins de canal](../../../developers/channel-plugins.md) pour l'interface `ChannelPlugin`, le format `Envelope` et les points d'extension.