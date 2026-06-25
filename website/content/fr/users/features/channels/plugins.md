# Plugins de canal personnalisés

Vous pouvez étendre le système de canaux avec des adaptateurs de plateforme personnalisés packagés en tant qu'[extensions](../../extension/introduction). Cela vous permet de connecter Qwen Code à n'importe quelle plateforme de messagerie, webhook ou transport personnalisé.

## Comment ça fonctionne

Les plugins de canal sont chargés au démarrage à partir des extensions actives. Lorsque `qwen channel start` s'exécute, il :

1. Scanne toutes les extensions activées pour les entrées `channels` dans leur `qwen-extension.json`
2. Importe dynamiquement le point d'entrée de chaque canal
3. Enregistre le type de canal afin qu'il puisse être référencé dans `settings.json`
4. Crée des instances de canal à l'aide de la fonction d'usine du plugin

Votre canal personnalisé bénéficie gratuitement de l'ensemble du pipeline partagé : contrôle d'accès par expéditeur, politiques de groupe, routage de session, commandes slash, récupération après panne et le pont ACP vers l'agent.

## Installation d'un canal personnalisé

Installez une extension qui fournit un plugin de canal :

```bash
# From a local path (for development or private plugins)
qwen extensions install /path/to/my-channel-extension

# Or link it for development (changes are reflected immediately)
qwen extensions link /path/to/my-channel-extension
```

## Configuration d'un canal personnalisé

Ajoutez une entrée de canal dans `~/.qwen/settings.json` en utilisant le type personnalisé fourni par l'extension :

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
| `allowedUsers` | Liste blanche statique des ID d'expéditeurs    |
| `sessionScope` | `user`, `thread` ou `single`                   |
| `cwd`          | Répertoire de travail pour l'agent             |
| `instructions` | Préfixé au premier message de chaque session   |
| `model`        | Surcharge de modèle pour le canal              |
| `groupPolicy`  | `disabled`, `allowlist` ou `open`              |
| `groups`       | Paramètres par groupe                          |

Voir [Aperçu](./overview) pour les détails de chaque option.

## Démarrage du canal

```bash
# Start all channels including custom ones
qwen channel start

# Start just your custom channel
qwen channel start my-bot
```

## Ce que vous obtenez gratuitement

Les canaux personnalisés prennent automatiquement en charge tout ce que les canaux intégrés font :

- **Politiques d'expéditeur** — contrôle d'accès `allowlist`, `pairing` et `open`
- **Politiques de groupe** — paramètres par groupe avec filtrage optionnel par @mention
- **Routage de session** — sessions partagées par utilisateur, par fil ou unique
- **Appairage DM** — flux complet de code d'appairage pour les utilisateurs inconnus
- **Commandes slash** — `/help`, `/clear`, `/status` fonctionnent dès l'installation
- **Instructions personnalisées** — préfixées au premier message de chaque session
- **Récupération après panne** — redémarrage automatique avec préservation de la session
- **Sérialisation par session** — les messages sont mis en file d'attente pour éviter les conditions de concurrence

## Créer votre propre plugin de canal

Vous voulez créer un plugin de canal pour une nouvelle plateforme ? Consultez le [Guide du développeur de plugins de canal](../../../developers/channel-plugins.md) pour l'interface `ChannelPlugin`, le format `Envelope` et les points d'extension.
