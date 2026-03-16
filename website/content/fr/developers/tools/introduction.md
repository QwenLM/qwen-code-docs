# Outils Qwen Code

Qwen Code intègre des outils intégrés que le modèle utilise pour interagir avec votre environnement local, accéder à des informations et exécuter des actions. Ces outils renforcent les capacités de l’interface en ligne de commande (CLI), lui permettant de dépasser la simple génération de texte et d’assister dans une grande variété de tâches.

## Aperçu des outils Qwen Code

Dans le contexte de Qwen Code, les outils sont des fonctions ou modules spécifiques que le modèle peut demander d’exécuter. Par exemple, si vous demandez au modèle de « résumer le contenu de `my_document.txt` », celui-ci identifiera probablement la nécessité de lire ce fichier et demandera l’exécution de l’outil `read_file`.

Le composant central (`packages/core`) gère ces outils : il en présente les définitions (schémas) au modèle, les exécute lorsqu’ils sont sollicités, puis renvoie leurs résultats au modèle afin qu’il les intègre dans une réponse destinée à l’utilisateur.

Ces outils offrent les fonctionnalités suivantes :

- **Accès aux informations locales** : Les outils permettent au modèle d’accéder à votre système de fichiers local, de lire le contenu des fichiers, de lister les répertoires, etc.
- **Exécution de commandes** : Grâce à des outils tels que `run_shell_command`, le modèle peut exécuter des commandes shell (avec les mesures de sécurité appropriées et la confirmation préalable de l’utilisateur).
- **Interaction avec le web** : Les outils peuvent récupérer du contenu depuis des URL.
- **Exécution d’actions** : Les outils peuvent modifier des fichiers, en créer de nouveaux ou effectuer d’autres opérations sur votre système (là encore, généralement sous la protection de mécanismes de sécurité).
- **Ancrage des réponses** : En utilisant des outils pour récupérer des données locales ou en temps réel, les réponses deviennent plus précises, pertinentes et ancrées dans votre contexte réel.

## Comment utiliser les outils Qwen Code

Pour utiliser les outils Qwen Code, fournissez une instruction à l’interface en ligne de commande (CLI). Le processus fonctionne comme suit :

1.  Vous fournissez une instruction à la CLI.
2.  La CLI transmet cette instruction au cœur du système.
3.  Le cœur, accompagné de votre instruction et de l’historique de la conversation, envoie à l’API du modèle configuré une liste des outils disponibles ainsi que leurs descriptions et schémas.
4.  Le modèle analyse votre demande. S’il détermine qu’un outil est nécessaire, sa réponse inclura une demande d’exécution d’un outil spécifique avec certains paramètres.
5.  Le cœur reçoit cette demande d’exécution d’outil, la valide, puis exécute l’outil (souvent après confirmation par l’utilisateur pour les opérations sensibles).
6.  La sortie produite par l’outil est renvoyée au modèle.
7.  Le modèle utilise cette sortie pour formuler sa réponse finale, qui est ensuite transmise via le cœur à la CLI et affichée à l’utilisateur.

Vous verrez généralement dans la CLI des messages indiquant quand un outil est appelé, ainsi que son succès ou son échec.

## Sécurité et confirmation

De nombreux outils, en particulier ceux capables de modifier votre système de fichiers ou d’exécuter des commandes (`write_file`, `edit`, `run_shell_command`), sont conçus avec la sécurité à l’esprit. Qwen Code procède généralement comme suit :

- **Demande une confirmation :** Il vous invite à confirmer avant d’exécuter des opérations potentiellement sensibles, en vous indiquant clairement l’action sur le point d’être effectuée.  
- **Utilise le bac à sable (sandboxing) :** Tous les outils sont soumis aux restrictions imposées par le bac à sable (voir [Bac à sable dans Qwen Code](../sandbox.md)). Cela signifie que, lors d’un fonctionnement dans un bac à sable, tous les outils que vous souhaitez utiliser (y compris les serveurs MCP) doivent être disponibles _à l’intérieur_ de cet environnement isolé. Par exemple, pour exécuter un serveur MCP via `npx`, l’exécutable `npx` doit être installé dans l’image Docker du bac à sable ou être disponible dans l’environnement `sandbox-exec`.

Il est essentiel d’examiner attentivement chaque demande de confirmation avant d’autoriser un outil à poursuivre son exécution.

## En savoir plus sur les outils de Qwen Code

Les outils intégrés de Qwen Code peuvent être classés globalement comme suit :

- **[Outils système de fichiers](./file-system.md)** : Pour interagir avec les fichiers et les répertoires (lecture, écriture, liste, recherche, etc.).
- **[Outil shell](./shell.md) (`run_shell_command`)** : Pour exécuter des commandes shell.
- **[Outil de récupération web](./web-fetch.md) (`web_fetch`)** : Pour récupérer du contenu depuis des URL.
- **[Outil de recherche web](./web-search.md) (`web_search`)** : Pour effectuer des recherches sur le web.
- **[Outil de lecture multi-fichiers](./multi-file.md) (`read_many_files`)** : Un outil spécialisé pour lire du contenu provenant de plusieurs fichiers ou répertoires, souvent utilisé par la commande `@`.
- **[Outil mémoire](./memory.md) (`save_memory`)** : Pour enregistrer et rappeler des informations entre les sessions.
- **[Outil d’écriture de tâches](./todo-write.md) (`todo_write`)** : Pour créer et gérer des listes de tâches structurées pendant les sessions de développement.
- **[Outil de tâche](./task.md) (`task`)** : Pour déléguer des tâches complexes à des sous-agents spécialisés.
- **[Outil de sortie du mode plan](./exit-plan-mode.md) (`exit_plan_mode`)** : Pour quitter le mode plan et passer à l’implémentation.

En outre, ces outils intègrent :

- **[Serveurs MCP](./mcp-server.md)** : Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d’autres services, tels que des API.
  - **[Guide de démarrage rapide MCP](../mcp-quick-start.md)** : Démarrer avec MCP en 5 minutes, avec des exemples pratiques
  - **[Exemples de configurations MCP](../mcp-example-configs.md)** : Des configurations prêtes à l’emploi pour des scénarios courants
  - **[Tests et validation MCP](../mcp-testing-validation.md)** : Tester et valider vos configurations de serveurs MCP
- **[Sandboxing](../sandbox.md)** : Le sandboxing isole le modèle et ses modifications de votre environnement afin de réduire les risques potentiels.