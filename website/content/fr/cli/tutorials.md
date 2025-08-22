# Tutoriels

Cette page contient des tutoriels pour interagir avec Qwen Code.

## Configuration d'un serveur Model Context Protocol (MCP)

> [!CAUTION]
> Avant d'utiliser un serveur MCP tiers, assurez-vous de faire confiance à sa source et de comprendre les outils qu'il fournit. Votre utilisation de serveurs tiers se fait à vos propres risques.

Ce tutoriel montre comment configurer un serveur MCP, en utilisant le [serveur MCP GitHub](https://github.com/github/github-mcp-server) comme exemple. Le serveur MCP GitHub fournit des outils pour interagir avec les repositories GitHub, comme créer des issues et commenter des pull requests.

### Prérequis

Avant de commencer, assurez-vous d'avoir installé et configuré les éléments suivants :

- **Docker :** Installez et exécutez [Docker].
- **GitHub Personal Access Token (PAT) :** Créez un nouveau PAT [classic] ou [fine-grained] avec les scopes nécessaires.

[Docker]: https://www.docker.com/
[classic]: https://github.com/settings/tokens/new
[fine-grained]: https://github.com/settings/personal-access-tokens/new

### Guide

#### Configurer le serveur MCP dans `settings.json`

Dans le répertoire racine de votre projet, créez ou ouvrez le fichier [`.qwen/settings.json`](./configuration.md). Dans ce fichier, ajoutez le bloc de configuration `mcpServers`, qui contient les instructions pour lancer le serveur MCP GitHub.

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

#### Définir votre token GitHub

> [!CAUTION]
> Utiliser un token d'accès personnel à portée large qui a accès aux dépôts personnels et privés peut entraîner une fuite d'informations du dépôt privé vers le dépôt public. Nous recommandons d'utiliser un token d'accès finement granulaire qui ne partage pas l'accès aux dépôts publics et privés.

Utilisez une variable d'environnement pour stocker votre PAT GitHub :

```bash
GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

Qwen Code utilise cette valeur dans la configuration `mcpServers` que vous avez définie dans le fichier `settings.json`.

#### Lancer Qwen Code et vérifier la connexion

Lorsque vous lancez Qwen Code, il lit automatiquement votre configuration et lance le serveur GitHub MCP en arrière-plan. Vous pouvez ensuite utiliser des prompts en langage naturel pour demander à Qwen Code d'effectuer des actions GitHub. Par exemple :

```bash
"récupère toutes les issues ouvertes qui me sont assignées dans le dépôt 'foo/bar' et priorise-les"
```