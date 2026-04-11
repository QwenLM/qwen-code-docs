# Outils Qwen Code

Qwen Code inclut des outils intégrés que le modèle utilise pour interagir avec votre environnement local, accéder à des informations et effectuer des actions. Ces outils étendent les fonctionnalités de la CLI, lui permettant d'aller au-delà de la génération de texte et de vous assister dans une large gamme de tâches.

## Présentation des outils Qwen Code

Dans le contexte de Qwen Code, les outils sont des fonctions ou des modules spécifiques que le modèle peut demander à exécuter. Par exemple, si vous demandez au modèle de « Résumer le contenu de `my_document.txt` », il identifiera probablement la nécessité de lire ce fichier et demandera l'exécution de l'outil `read_file`.

Le composant `core` (`packages/core`) gère ces outils, présente leurs définitions (schémas) au modèle, les exécute sur demande et renvoie les résultats au modèle pour qu'il les traite et génère une réponse destinée à l'utilisateur.

Ces outils offrent les fonctionnalités suivantes :

- **Accéder aux informations locales :** Les outils permettent au modèle d'accéder à votre système de fichiers local, de lire le contenu des fichiers, de lister les répertoires, etc.
- **Exécuter des commandes :** Grâce à des outils comme `run_shell_command`, le modèle peut exécuter des commandes shell (avec les mesures de sécurité appropriées et la confirmation de l'utilisateur).
- **Interagir avec le web :** Les outils peuvent récupérer du contenu à partir d'URL.
- **Effectuer des actions :** Les outils peuvent modifier des fichiers, en créer de nouveaux ou effectuer d'autres actions sur votre système (généralement avec des garde-fous).
- **Ancrer les réponses :** En utilisant des outils pour récupérer des données locales ou en temps réel, les réponses peuvent être plus précises, pertinentes et ancrées dans votre contexte réel.

## Comment utiliser les outils Qwen Code

Pour utiliser les outils Qwen Code, fournissez un prompt à la CLI. Le processus fonctionne comme suit :

1.  Vous fournissez un prompt à la CLI.
2.  La CLI envoie le prompt au `core`.
3.  Le `core`, accompagné de votre prompt et de l'historique de conversation, envoie une liste des outils disponibles ainsi que leurs descriptions/schémas à l'API du modèle configurée.
4.  Le modèle analyse votre demande. S'il détermine qu'un outil est nécessaire, sa réponse inclura une demande d'exécution d'un outil spécifique avec certains paramètres.
5.  Le `core` reçoit cette demande, la valide et (souvent après confirmation de l'utilisateur pour les opérations sensibles) exécute l'outil.
6.  La sortie de l'outil est renvoyée au modèle.
7.  Le modèle utilise la sortie de l'outil pour formuler sa réponse finale, qui est ensuite renvoyée via le `core` à la CLI et affichée à l'écran.

Vous verrez généralement des messages dans la CLI indiquant quand un outil est appelé et s'il a réussi ou échoué.

## Sécurité et confirmation

De nombreux outils, en particulier ceux capables de modifier votre système de fichiers ou d'exécuter des commandes (`write_file`, `edit`, `run_shell_command`), sont conçus avec la sécurité à l'esprit. Qwen Code va généralement :

- **Demander une confirmation :** Vous inviter à valider avant d'exécuter des opérations potentiellement sensibles, en vous montrant l'action sur le point d'être effectuée.
- **Utiliser le sandboxing :** Tous les outils sont soumis à des restrictions imposées par le sandboxing (voir [Sandboxing in Qwen Code](../sandbox.md)). Cela signifie que lors de l'exécution dans un sandbox, tous les outils (y compris les serveurs MCP) que vous souhaitez utiliser doivent être disponibles _à l'intérieur_ de l'environnement sandbox. Par exemple, pour exécuter un serveur MCP via `npx`, l'exécutable `npx` doit être installé dans l'image Docker du sandbox ou être disponible dans l'environnement `sandbox-exec`.

Il est important de toujours examiner attentivement les invites de confirmation avant d'autoriser un outil à s'exécuter.

## En savoir plus sur les outils de Qwen Code

Les outils intégrés de Qwen Code peuvent être globalement classés comme suit :

- **[Outils système de fichiers](./file-system.md) :** Pour interagir avec les fichiers et les répertoires (lecture, écriture, listage, recherche, etc.).
- **[Outil Shell](./shell.md) (`run_shell_command`) :** Pour exécuter des commandes shell.
- **[Outil de récupération Web](./web-fetch.md) (`web_fetch`) :** Pour récupérer du contenu à partir d'URL.
- **[Outil de recherche Web](./web-search.md) (`web_search`) :** Pour effectuer des recherches sur le web.
- **[Outil de lecture multi-fichiers](./multi-file.md) (`read_many_files`) :** Un outil spécialisé pour lire le contenu de plusieurs fichiers ou répertoires, souvent utilisé par la commande `@`.
- **[Outil Mémoire](./memory.md) (`save_memory`) :** Pour enregistrer et rappeler des informations entre les sessions.
- **[Outil Todo Write](./todo-write.md) (`todo_write`) :** Pour créer et gérer des listes de tâches structurées pendant les sessions de codage.
- **[Outil Task](./task.md) (`task`) :** Pour déléguer des tâches complexes à des sous-agents spécialisés.
- **[Outil Exit Plan Mode](./exit-plan-mode.md) (`exit_plan_mode`) :** Pour quitter le mode planification et passer à l'implémentation.

De plus, ces outils intègrent :

- **[Serveurs MCP](./mcp-server.md)** : Les serveurs MCP font office de pont entre le modèle et votre environnement local ou d'autres services comme les API.
  - **[Guide de démarrage rapide MCP](../mcp-quick-start.md)** : Démarrez avec MCP en 5 minutes grâce à des exemples pratiques
  - **[Exemples de configurations MCP](../mcp-example-configs.md)** : Configurations prêtes à l'emploi pour des scénarios courants
  - **[Tests et validation MCP](../mcp-testing-validation.md)** : Testez et validez vos configurations de serveurs MCP
- **[Sandboxing](../sandbox.md)** : Le sandboxing isole le modèle et ses modifications de votre environnement afin de réduire les risques potentiels.