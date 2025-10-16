# Bienvenue dans la documentation de Qwen Code

Cette documentation fournit un guide complet pour installer, utiliser et développer Qwen Code. Cet outil vous permet d'interagir avec des modèles d'IA via une interface en ligne de commande.

## Aperçu

Qwen Code apporte les capacités de modèles de code avancés directement dans votre terminal, au sein d'un environnement REPL (Read-Eval-Print Loop) interactif. Qwen Code se compose d'une application côté client (`packages/cli`) qui communique avec un serveur local (`packages/core`). Qwen Code inclut également divers outils pour effectuer des opérations sur le système de fichiers, exécuter des commandes shell, ou encore récupérer des données depuis le web — ces fonctionnalités sont gérées par `packages/core`.

## Navigation dans la documentation

Cette documentation est organisée en plusieurs sections :

- **[Exécution et déploiement](./deployment.md) :** Informations pour exécuter Qwen Code.
- **[Aperçu de l'architecture](./architecture.md) :** Comprenez la conception globale de Qwen Code, y compris ses composants et leurs interactions.
- **Utilisation du CLI :** Documentation pour `packages/cli`.
  - **[Introduction au CLI](./cli/index.md) :** Aperçu de l'interface en ligne de commande.
  - **[Commandes](./cli/commands.md) :** Description des commandes CLI disponibles.
  - **[Configuration](./cli/configuration.md) :** Informations sur la configuration du CLI.
  - **[Checkpointing](./checkpointing.md) :** Documentation de la fonctionnalité de checkpointing.
  - **[Extensions](./extension.md) :** Comment étendre le CLI avec de nouvelles fonctionnalités.
  - **[Intégration IDE](./ide-integration.md) :** Connectez le CLI à votre éditeur.
  - **[Télémétrie](./telemetry.md) :** Aperçu de la télémétrie dans le CLI.
- **Détails du Core :** Documentation pour `packages/core`.
  - **[Introduction au Core](./core/index.md) :** Aperçu du composant principal.
  - **[API des outils](./core/tools-api.md) :** Informations sur la façon dont le core gère et expose les outils.
- **Outils :**
  - **[Vue d'ensemble des outils](./tools/index.md) :** Présentation des outils disponibles.
  - **[Outils du système de fichiers](./tools/file-system.md) :** Documentation des outils `read_file` et `write_file`.
  - **[Outil de lecture multi-fichiers](./tools/multi-file.md) :** Documentation de l'outil `read_many_files`.
  - **[Outil Shell](./tools/shell.md) :** Documentation de l'outil `run_shell_command`.
  - **[Outil Web Fetch](./tools/web-fetch.md) :** Documentation de l'outil `web_fetch`.
  - **[Outil Web Search](./tools/web-search.md) :** Documentation de l'outil `web_search`.
  - **[Outil Mémoire](./tools/memory.md) :** Documentation de l'outil `save_memory`.
- **[Sous-agents](./subagents.md) :** Assistants IA spécialisés pour des tâches ciblées, avec un guide complet de gestion, configuration et utilisation.
- **[Guide de contribution et développement](../CONTRIBUTING.md) :** Informations destinées aux contributeurs et développeurs, incluant l'installation, la compilation, les tests et les conventions de codage.
- **[NPM](./npm.md) :** Détails sur la structure des packages du projet.
- **[Guide de dépannage](./troubleshooting.md) :** Trouvez des solutions aux problèmes courants et FAQ.
- **[Conditions d'utilisation et politique de confidentialité](./tos-privacy.md) :** Informations sur les conditions d'utilisation et les mentions de confidentialité applicables à votre utilisation de Qwen Code.

Nous espérons que cette documentation vous aidera à tirer le meilleur parti de Qwen Code !