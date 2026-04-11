# Plugins de canal personnalisés

Vous pouvez étendre le système de canaux avec des adaptateurs de plateforme personnalisés empaquetés sous forme d'[extensions](../../extension/introduction). Cela vous permet de connecter Qwen Code à n'importe quelle plateforme de messagerie, webhook ou transport personnalisé.

## Fonctionnement

Les plugins de canal sont chargés au démarrage à partir des extensions actives. Lorsque `qwen channel start` s'exécute, il :

1. Recherche les entrées `channels` dans le fichier `qwen-extension.json` de toutes les extensions activées
2. Importe dynamiquement le point d'entrée de chaque canal
3. Enregistre le type de canal afin qu'il puisse être référencé dans `settings.json`
4. Crée les instances de canal à l'aide de la fonction factory du plugin

Votre canal personnalisé bénéficie automatiquement du pipeline partagé complet : filtrage des expéditeurs, politiques de groupe, routage des sessions, commandes slash, récupération après plantage et pont ACP vers l'agent.

## Installation d'un canal personnalisé

Installez une extension qui fournit un plugin de canal :

```bash
# À partir d'un chemin local (pour le développement ou les plugins privés)
qwen extensions install /path/to/my-channel-extension

# Ou liez-le pour le développement (les modifications sont prises en compte immédiatement)
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

La valeur `type` doit correspondre à un type de canal enregistré par une extension installée. Consultez la documentation de l'extension pour connaître les champs spécifiques au plugin requis (par ex. `apiKey`, `webhookUrl`).

Toutes les options standard de canal fonctionnent avec les canaux personnalisés :

| Option         | Description                                    |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`, `pairing` ou `open`               |
| `allowedUsers` | Liste statique d'IDs d'expéditeurs autorisés   |
| `sessionScope` | `user`, `thread` ou `single`                   |
| `cwd`          | Répertoire de travail pour l'agent             |
| `instructions` | Ajouté au début du premier message de chaque session |
| `model`        | Remplacement du modèle pour le canal           |
| `groupPolicy`  | `disabled`, `allowlist` ou `open`              |
| `groups`       | Paramètres par groupe                          |

Consultez [Vue d'ensemble](./overview) pour plus de détails sur chaque option.

## Démarrage du canal

```bash
# Démarre tous les canaux, y compris les personnalisés
qwen channel start

# Démarre uniquement votre canal personnalisé
qwen channel start my-bot
```

## Fonctionnalités incluses par défaut

Les canaux personnalisés prennent automatiquement en charge toutes les fonctionnalités des canaux intégrés :

- **Politiques d'expéditeur** — Contrôle d'accès `allowlist`, `pairing` et `open`
- **Politiques de groupe** — Paramètres par groupe avec filtrage optionnel via @mention
- **Routage des sessions** — Sessions par utilisateur, par thread ou session unique partagée
- **Appairage en MP** — Flux complet de code d'appairage pour les utilisateurs inconnus
- **Commandes slash** — `/help`, `/clear`, `/status` fonctionnent nativement
- **Instructions personnalisées** — Ajoutées au début du premier message de chaque session
- **Récupération après plantage** — Redémarrage automatique avec préservation de la session
- **Sérialisation par session** — Les messages sont mis en file d'attente pour éviter les conditions de concurrence

## Création de votre propre plugin de canal

Vous souhaitez créer un plugin de canal pour une nouvelle plateforme ? Consultez le [Guide de développement de plugins de canal](/developers/channel-plugins) pour découvrir l'interface `ChannelPlugin`, le format `Envelope` et les points d'extension.