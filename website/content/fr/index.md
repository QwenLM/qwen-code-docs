# Bienvenue dans la documentation de Qwen Code

Cette documentation fournit un guide complet pour installer, utiliser et développer Qwen Code. Cet outil vous permet d'interagir avec des modèles d'IA via une interface en ligne de commande.

## Aperçu

Qwen Code apporte les capacités de modèles de code avancés directement dans votre terminal, au sein d'un environnement interactif Read-Eval-Print Loop (REPL). Qwen Code se compose d'une application côté client (`packages/cli`) qui communique avec un serveur local (`packages/core`). Qwen Code inclut également divers outils pour effectuer des opérations sur le système de fichiers, exécuter des commandes shell, et récupérer des données sur le web, tous gérés par `packages/core`.

## Navigation dans la documentation

Cette documentation est organisée en plusieurs sections :

- **[Exécution et déploiement](./deployment.md) :** Informations pour exécuter Qwen Code.
- **[Aperçu de l'architecture](./architecture.md) :** Comprenez la conception de haut niveau de Qwen Code, y compris ses composants et leurs interactions.
- **Utilisation du CLI :** Documentation pour `packages/cli`.
  - **[Introduction au CLI](./cli/index.md) :** Vue d'ensemble de l'interface en ligne de commande.
  - **[Commandes](./cli/commands.md) :** Description des commandes CLI disponibles.
  - **[Configuration](./cli/configuration.md) :** Informations sur la configuration du CLI.
  - **[Checkpointing](./checkpointing.md) :** Documentation de la fonctionnalité de checkpointing.
  - **[Extensions](./extension.md) :** Comment étendre le CLI avec de nouvelles fonctionnalités.
  - **[Télémétrie](./telemetry.md) :** Aperçu de la télémétrie dans le CLI.
- **Détails du Core :** Documentation pour `packages/core`.
  - **[Introduction au Core](./core/index.md) :** Vue d'ensemble du composant principal.
  - **[API des outils](./core/tools-api.md) :** Informations sur la façon dont le core gère et expose les outils.
- **Outils :**
  - **[Aperçu des outils](./tools/index.md) :** Vue d'ensemble des outils disponibles.
  - **[Outils du système de fichiers](./tools/file-system.md) :** Documentation des outils `read_file` et `write_file`.
  - **[Outil de lecture multi-fichiers](./tools/multi-file.md) :** Documentation de l'outil `read_many_files`.
  - **[Outil Shell](./tools/shell.md) :** Documentation de l'outil `run_shell_command`.
  - **[Outil de récupération web](./tools/web-fetch.md) :** Documentation de l'outil `web_fetch`.
  - **[Outil de recherche web](./tools/web-search.md) :** Documentation de l'outil `web_search`.
  - **[Outil de mémoire](./tools/memory.md) :** Documentation de l'outil `save_memory`.
- **[Guide de contribution et de développement](../CONTRIBUTING.md) :** Informations pour les contributeurs et développeurs, incluant l'installation, la construction, les tests et les conventions de codage.
- **[Workspaces NPM et publication](./npm.md) :** Détails sur la gestion et la publication des packages du projet.
- **[Guide de dépannage](./troubleshooting.md) :** Trouvez des solutions aux problèmes courants et aux questions fréquentes.
- **[Conditions d'utilisation et politique de confidentialité](./tos-privacy.md) :** Informations sur les conditions d'utilisation et les mentions de confidentialité applicables à votre utilisation de Qwen Code.

Nous espérons que cette documentation vous aidera à tirer le meilleur parti de Qwen Code !