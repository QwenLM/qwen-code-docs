# Outils de Qwen Code

Qwen Code inclut des outils intégrés que le modèle utilise pour interagir avec votre environnement local, accéder à des informations et effectuer des actions. Ces outils renforcent les capacités de la CLI, lui permettant d'aller au-delà de la génération de texte et d'assister dans une large gamme de tâches.

## Présentation des outils de Qwen Code

Dans le contexte de Qwen Code, les outils sont des fonctions ou modules spécifiques que le modèle peut demander d'exécuter. Par exemple, si vous demandez au modèle de « Résumer le contenu de `my_document.txt` », il identifiera probablement le besoin de lire ce fichier et demandera l'exécution de l'outil `read_file`.

Le composant central (`packages/core`) gère ces outils, présente leurs définitions (schémas) au modèle, les exécute sur demande et renvoie les résultats au modèle pour qu'il les traite et les transforme en réponse destinée à l'utilisateur.

Ces outils offrent les capacités suivantes :

- **Accéder aux informations locales :** Les outils permettent au modèle d'accéder à votre système de fichiers local, de lire le contenu des fichiers, de lister les répertoires, etc.
- **Exécuter des commandes :** Avec des outils comme `run_shell_command`, le modèle peut exécuter des commandes shell (avec des mesures de sécurité appropriées et la confirmation de l'utilisateur).
- **Interagir avec le web :** Les outils peuvent récupérer du contenu depuis des URLs.
- **Effectuer des actions :** Les outils peuvent modifier des fichiers, en écrire de nouveaux ou effectuer d'autres actions sur votre système (là encore, généralement avec des garde-fous).
- **Ancrer les réponses :** En utilisant des outils pour récupérer des données en temps réel ou des données locales spécifiques, les réponses peuvent être plus précises, pertinentes et ancrées dans votre contexte réel.

## Comment utiliser les outils de Qwen Code

Pour utiliser les outils de Qwen Code, fournissez une invite à la CLI. Le processus fonctionne comme suit :

1.  Vous fournissez une invite à la CLI.
2.  La CLI envoie l'invite au cœur.
3.  Le cœur, avec votre invite et l'historique de la conversation, envoie une liste des outils disponibles et leurs descriptions/schémas à l'API du modèle configuré.
4.  Le modèle analyse votre demande. S'il détermine qu'un outil est nécessaire, sa réponse inclura une demande d'exécution d'un outil spécifique avec certains paramètres.
5.  Le cœur reçoit cette demande d'outil, la valide et (souvent après confirmation de l'utilisateur pour les opérations sensibles) exécute l'outil.
6.  La sortie de l'outil est renvoyée au modèle.
7.  Le modèle utilise la sortie de l'outil pour formuler sa réponse finale, qui est ensuite renvoyée via le cœur à la CLI et affichée pour vous.

Vous verrez généralement des messages dans la CLI indiquant quand un outil est appelé et s'il a réussi ou échoué.

## Sécurité et confirmation

De nombreux outils, en particulier ceux qui peuvent modifier votre système de fichiers ou exécuter des commandes (`write_file`, `edit`, `run_shell_command`), sont conçus dans un souci de sécurité. Qwen Code va généralement :

- **Exiger une confirmation :** Vous demander confirmation avant d'exécuter des opérations potentiellement sensibles, en vous montrant l'action qui va être effectuée.
- **Utiliser le sandboxing :** Tous les outils sont soumis à des restrictions imposées par le sandboxing (voir [Sandboxing dans Qwen Code](./sandbox.md)). Cela signifie que lorsque vous travaillez dans un sandbox, tous les outils (y compris les serveurs MCP) que vous souhaitez utiliser doivent être disponibles _à l'intérieur_ de l'environnement du sandbox. Par exemple, pour exécuter un serveur MCP via `npx`, l'exécutable `npx` doit être installé dans l'image Docker du sandbox ou être disponible dans l'environnement `sandbox-exec`.

Il est important de toujours examiner attentivement les invites de confirmation avant d'autoriser un outil à procéder.

## En savoir plus sur les outils de Qwen Code

Les outils intégrés de Qwen Code peuvent être globalement catégorisés comme suit :

- **[Outils du système de fichiers](./file-system.md) :** Pour interagir avec les fichiers et répertoires (lecture, écriture, listage, recherche, etc.).
- **[Outil Shell](./shell.md) (`run_shell_command`) :** Pour exécuter des commandes shell.
- **[Outil Moniteur](./monitor.md) (`monitor`) :** Pour exécuter des commandes shell de longue durée qui renvoient la sortie en continu sous forme de notifications de tâches en arrière-plan.
- **[Outil de récupération web](./web-fetch.md) (`web_fetch`) :** Pour récupérer du contenu depuis des URLs.
- **[Outil d'écriture de tâches](./todo-write.md) (`todo_write`) :** Pour créer et gérer des listes de tâches structurées lors de sessions de codage.
- **[Outil Agent](./task.md) (`agent`) :** Pour déléguer des tâches complexes à des sous-agents spécialisés.
- **[Outil de sortie du mode planification](./exit-plan-mode.md) (`exit_plan_mode`) :** Pour quitter le mode planification et passer à l'implémentation.

De plus, ces outils intègrent :

- **[Serveurs MCP](./mcp-server.md)** : Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d'autres services comme les API.
  - **[Guide utilisateur MCP](../../users/features/mcp.md)** : Configurez les serveurs MCP et gérez-les depuis Qwen Code
  - **[Recherche web via MCP](./web-search.md)** : Connectez-vous à des services de recherche web (Bailian, Tavily, GLM) via MCP
- **[Sandboxing](./sandbox.md)** : Le sandboxing isole le modèle et ses modifications de votre environnement pour réduire les risques potentiels.