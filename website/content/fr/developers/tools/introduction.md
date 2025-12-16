# Outils de code Qwen

Qwen Code inclut des outils intégrés que le modèle utilise pour interagir avec votre environnement local, accéder à des informations et effectuer des actions. Ces outils améliorent les capacités de l'interface en ligne de commande, lui permettant d'aller au-delà de la génération de texte et de vous aider dans un large éventail de tâches.

## Aperçu des outils Qwen Code

Dans le contexte de Qwen Code, les outils sont des fonctions ou modules spécifiques que le modèle peut demander d'exécuter. Par exemple, si vous demandez au modèle de « Résumer le contenu de `my_document.txt` », il identifiera probablement le besoin de lire ce fichier et demandera l'exécution de l'outil `read_file`.

Le composant principal (`packages/core`) gère ces outils, présente leurs définitions (schémas) au modèle, les exécute lorsqu'ils sont demandés et renvoie les résultats au modèle pour un traitement supplémentaire dans une réponse destinée à l'utilisateur.

Ces outils offrent les capacités suivantes :

- **Accès aux informations locales :** Les outils permettent au modèle d'accéder à votre système de fichiers local, de lire le contenu des fichiers, de lister les répertoires, etc.
- **Exécution de commandes :** Avec des outils comme `run_shell_command`, le modèle peut exécuter des commandes shell (avec des mesures de sécurité appropriées et la confirmation de l'utilisateur).
- **Interaction avec le web :** Les outils peuvent récupérer du contenu depuis des URL.
- **Réalisation d'actions :** Les outils peuvent modifier des fichiers, en créer de nouveaux ou effectuer d'autres actions sur votre système (là encore, généralement avec des protections).
- **Ancrage des réponses :** En utilisant des outils pour récupérer des données en temps réel ou des données locales spécifiques, les réponses peuvent être plus précises, pertinentes et ancrées dans votre contexte réel.

## Comment utiliser les outils de code Qwen

Pour utiliser les outils de code Qwen, fournissez une invite à la CLI. Le processus fonctionne comme suit :

1. Vous fournissez une invite à la CLI.
2. La CLI envoie l'invite au cœur.
3. Le cœur, avec votre invite et l'historique de la conversation, envoie une liste des outils disponibles ainsi que leurs descriptions/schémas à l'API du modèle configuré.
4. Le modèle analyse votre demande. S'il détermine qu'un outil est nécessaire, sa réponse inclura une requête pour exécuter un outil spécifique avec certains paramètres.
5. Le cœur reçoit cette requête d'outil, la valide et (souvent après confirmation de l'utilisateur pour les opérations sensibles) exécute l'outil.
6. La sortie de l'outil est renvoyée au modèle.
7. Le modèle utilise la sortie de l'outil pour formuler sa réponse finale, qui est ensuite renvoyée via le cœur à la CLI et affichée à vous.

Vous verrez généralement des messages dans la CLI indiquant quand un outil est appelé et s'il a réussi ou échoué.

## Sécurité et confirmation

De nombreux outils, en particulier ceux qui peuvent modifier votre système de fichiers ou exécuter des commandes (`write_file`, `edit`, `run_shell_command`), sont conçus avec la sécurité en tête. Qwen Code fera généralement :

- **Exiger une confirmation :** Vous demander avant d'exécuter des opérations potentiellement sensibles, en vous montrant quelle action est sur le point d'être entreprise.
- **Utiliser le bac à sable (sandboxing) :** Tous les outils sont soumis aux restrictions appliquées par le bac à sable (voir [Bac à sable dans Qwen Code](../sandbox.md)). Cela signifie que lorsqu'on opère dans un bac à sable, tous les outils (y compris les serveurs MCP) que vous souhaitez utiliser doivent être disponibles _à l'intérieur_ de l'environnement du bac à sable. Par exemple, pour exécuter un serveur MCP via `npx`, l'exécutable `npx` doit être installé dans l'image Docker du bac à sable ou être disponible dans l'environnement `sandbox-exec`.

Il est important de toujours examiner attentivement les invites de confirmation avant d'autoriser un outil à continuer.

## En savoir plus sur les outils de Qwen Code

Les outils intégrés de Qwen Code peuvent être regroupés comme suit :

- **[Outils du système de fichiers](./file-system.md) :** Pour interagir avec les fichiers et répertoires (lecture, écriture, listage, recherche, etc.).
- **[Outil Shell](./shell.md) (`run_shell_command`) :** Pour exécuter des commandes shell.
- **[Outil Web Fetch](./web-fetch.md) (`web_fetch`) :** Pour récupérer le contenu à partir d'URL.
- **[Outil Web Search](./web-search.md) (`web_search`) :** Pour effectuer des recherches sur le web.
- **[Outil Multi-File Read](./multi-file.md) (`read_many_files`) :** Un outil spécialisé pour lire le contenu de plusieurs fichiers ou répertoires, souvent utilisé par la commande `@`.
- **[Outil Mémoire](./memory.md) (`save_memory`) :** Pour enregistrer et rappeler des informations entre les sessions.
- **[Outil Todo Write](./todo-write.md) (`todo_write`) :** Pour créer et gérer des listes de tâches structurées pendant les sessions de codage.
- **[Outil Task](./task.md) (`task`) :** Pour déléguer des tâches complexes à des sous-agents spécialisés.
- **[Outil Exit Plan Mode](./exit-plan-mode.md) (`exit_plan_mode`) :** Pour quitter le mode planification et passer à l'implémentation.

En outre, ces outils intègrent :

- **[Serveurs MCP](./mcp-server.md)** : Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d'autres services tels que les API.
  - **[Guide de démarrage rapide MCP](../mcp-quick-start.md)** : Commencez avec MCP en 5 minutes grâce à des exemples pratiques
  - **[Exemples de configurations MCP](../mcp-example-configs.md)** : Configurations prêtes à l'emploi pour des scénarios courants
  - **[Tests et validation MCP](../mcp-testing-validation.md)** : Testez et validez vos configurations de serveur MCP
- **[Sandboxing](../sandbox.md)** : Le sandboxing isole le modèle et ses modifications de votre environnement afin de réduire les risques potentiels.