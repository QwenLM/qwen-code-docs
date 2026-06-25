# Outils de Qwen Code

Qwen Code inclut des outils intégrés que le modèle utilise pour interagir avec votre environnement local, accéder à des informations et effectuer des actions. Ces outils améliorent les capacités du CLI, lui permettant d'aller au-delà de la génération de texte et d'assister dans une large gamme de tâches.

## Aperçu des outils de Qwen Code

Dans le contexte de Qwen Code, les outils sont des fonctions ou modules spécifiques que le modèle peut demander d'exécuter. Par exemple, si vous demandez au modèle de « Résumer le contenu de `my_document.txt` », il identifiera probablement le besoin de lire ce fichier et demandera l'exécution de l'outil `read_file`.

Le composant central (`packages/core`) gère ces outils, présente leurs définitions (schémas) au modèle, les exécute sur demande, et retourne les résultats au modèle pour un traitement ultérieur en une réponse destinée à l'utilisateur.

Ces outils offrent les capacités suivantes :

- **Accéder aux informations locales :** Les outils permettent au modèle d'accéder à votre système de fichiers local, de lire le contenu des fichiers, de lister les répertoires, etc.
- **Exécuter des commandes :** Avec des outils comme `run_shell_command`, le modèle peut exécuter des commandes shell (avec les mesures de sécurité appropriées et la confirmation de l'utilisateur).
- **Interagir avec le web :** Les outils peuvent récupérer du contenu depuis des URL.
- **Effectuer des actions :** Les outils peuvent modifier des fichiers, écrire de nouveaux fichiers ou effectuer d'autres actions sur votre système (là encore, généralement avec des garde-fous).
- **Ancrer les réponses :** En utilisant des outils pour récupérer des données en temps réel ou spécifiques au contexte local, les réponses peuvent être plus précises, pertinentes et ancrées dans votre contexte réel.

## Comment utiliser les outils de Qwen Code

Pour utiliser les outils de Qwen Code, fournissez une invite (prompt) au CLI. Le processus se déroule comme suit :

1.  Vous fournissez une invite au CLI.
2.  Le CLI envoie l'invite au composant central.
3.  Le composant central, avec votre invite et l'historique de la conversation, envoie une liste des outils disponibles ainsi que leurs descriptions/schémas à l'API du modèle configuré.
4.  Le modèle analyse votre demande. S'il détermine qu'un outil est nécessaire, sa réponse inclura une demande d'exécution d'un outil spécifique avec certains paramètres.
5.  Le composant central reçoit cette demande d'outil, la valide, et (souvent après confirmation de l'utilisateur pour les opérations sensibles) exécute l'outil.
6.  Le résultat de l'outil est renvoyé au modèle.
7.  Le modèle utilise le résultat de l'outil pour formuler sa réponse finale, qui est ensuite renvoyée via le composant central au CLI et affichée.

Vous verrez généralement des messages dans le CLI indiquant quand un outil est appelé et s'il a réussi ou échoué.

## Sécurité et confirmation

De nombreux outils, en particulier ceux qui peuvent modifier votre système de fichiers ou exécuter des commandes (`write_file`, `edit`, `run_shell_command`), sont conçus avec la sécurité à l'esprit. Qwen Code va généralement :

- **Exiger une confirmation :** Vous demander avant d'exécuter des opérations potentiellement sensibles, en vous montrant quelle action est sur le point d'être effectuée.
- **Utiliser le sandboxing :** Tous les outils sont soumis à des restrictions appliquées par le sandboxing (voir [Sandboxing dans Qwen Code](./sandbox.md)). Cela signifie que lorsque vous travaillez dans un sandbox, tous les outils (y compris les serveurs MCP) que vous souhaitez utiliser doivent être disponibles _à l'intérieur_ de l'environnement du sandbox. Par exemple, pour exécuter un serveur MCP via `npx`, l'exécutable `npx` doit être installé dans l'image Docker du sandbox ou être disponible dans l'environnement `sandbox-exec`.

Il est important de toujours examiner attentivement les invites de confirmation avant d'autoriser l'exécution d'un outil.

## En savoir plus sur les outils de Qwen Code

Les outils intégrés de Qwen Code peuvent être largement classés comme suit :

- **[Outils système de fichiers](./file-system.md) :** Pour interagir avec les fichiers et répertoires (lecture, écriture, listage, recherche, etc.).
- **[Outil Shell](./shell.md) (`run_shell_command`) :** Pour exécuter des commandes shell.
- **[Outil Moniteur](./monitor.md) (`monitor`) :** Pour exécuter des commandes shell de longue durée qui diffusent la sortie en continu sous forme de notifications de tâches en arrière-plan.
- **[Outil de récupération web](./web-fetch.md) (`web_fetch`) :** Pour récupérer du contenu depuis des URL.
- **[Outil Todo Write](./todo-write.md) (`todo_write`) :** Pour créer et gérer des listes de tâches structurées pendant les sessions de codage.
- **[Outil Agent](./task.md) (`agent`) :** Pour déléguer des tâches complexes à des sous-agents spécialisés.
- **[Outil de sortie du mode plan](./exit-plan-mode.md) (`exit_plan_mode`) :** Pour quitter le mode plan et passer à l'implémentation.

De plus, ces outils intègrent :

- **[Serveurs MCP](./mcp-server.md)** : Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d'autres services comme les API.
  - **[Guide utilisateur MCP](../../users/features/mcp.md)** : Configurez les serveurs MCP et gérez-les depuis Qwen Code.
  - **[Recherche Web via MCP](./web-search.md)** : Connectez-vous à des services de recherche web (Bailian, Tavily, GLM) via MCP.
- **[Sandboxing](./sandbox.md)** : Le sandboxing isole le modèle et ses modifications de votre environnement pour réduire les risques potentiels.
