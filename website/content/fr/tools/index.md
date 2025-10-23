# Outils Qwen Code

Qwen Code inclut des outils intégrés que le modèle utilise pour interagir avec votre environnement local, accéder à des informations et effectuer des actions. Ces outils améliorent les capacités du CLI, lui permettant d'aller au-delà de la génération de texte et de vous aider dans un large éventail de tâches.

## Aperçu des outils Qwen Code

Dans le contexte de Qwen Code, les outils sont des fonctions ou modules spécifiques que le modèle peut demander d'exécuter. Par exemple, si vous demandez au modèle de « Résumer le contenu de `my_document.txt` », il identifiera probablement le besoin de lire ce fichier et demandera l'exécution de l'outil `read_file`.

Le composant principal (`packages/core`) gère ces outils, présente leurs définitions (schémas) au modèle, les exécute lorsqu'ils sont demandés et renvoie les résultats au modèle pour un traitement supplémentaire dans une réponse destinée à l'utilisateur.

Ces outils offrent les capacités suivantes :

- **Accès aux informations locales :** Les outils permettent au modèle d'accéder à votre système de fichiers local, de lire le contenu des fichiers, de lister les répertoires, etc.
- **Exécution de commandes :** Avec des outils comme `run_shell_command`, le modèle peut exécuter des commandes shell (avec des mesures de sécurité appropriées et la confirmation de l'utilisateur).
- **Interaction avec le web :** Les outils peuvent récupérer le contenu d'URLs.
- **Actions :** Les outils peuvent modifier des fichiers, en créer de nouveaux ou effectuer d'autres actions sur votre système (là encore, généralement avec des protections).
- **Ancrage des réponses :** En utilisant des outils pour récupérer des données en temps réel ou des données locales spécifiques, les réponses peuvent être plus précises, pertinentes et ancrées dans votre contexte actuel.

## Comment utiliser les outils Qwen Code

Pour utiliser les outils Qwen Code, il suffit de fournir un prompt au CLI. Le processus fonctionne comme suit :

1. Vous fournissez un prompt au CLI.
2. Le CLI envoie le prompt au core.
3. Le core, avec votre prompt et l'historique de la conversation, transmet la liste des outils disponibles ainsi que leurs descriptions/schémas à l'API du modèle configuré.
4. Le modèle analyse votre requête. S'il détermine qu'un outil est nécessaire, sa réponse inclura une demande d'exécution d'un outil spécifique avec certains paramètres.
5. Le core reçoit cette demande d'outil, la valide, puis (souvent après confirmation de l'utilisateur pour les opérations sensibles) exécute l'outil.
6. La sortie de l'outil est renvoyée au modèle.
7. Le modèle utilise la sortie de l'outil pour formuler sa réponse finale, qui est ensuite renvoyée via le core jusqu'au CLI et affichée à l'utilisateur.

Vous verrez généralement dans le CLI des messages indiquant quand un outil est appelé, ainsi que s'il a réussi ou échoué.

## Sécurité et confirmation

De nombreux outils, en particulier ceux qui peuvent modifier votre système de fichiers ou exécuter des commandes (`write_file`, `edit`, `run_shell_command`), sont conçus en gardant la sécurité à l'esprit. Qwen Code va généralement :

- **Demander une confirmation :** Vous demander avant d'exécuter des opérations potentiellement sensibles, en vous montrant quelle action va être effectuée.
- **Utiliser le sandboxing :** Tous les outils sont soumis aux restrictions imposées par le sandboxing (voir [Sandboxing dans Qwen Code](../sandbox.md)). Cela signifie que lorsqu'on opère dans un sandbox, tous les outils (y compris les serveurs MCP) que vous souhaitez utiliser doivent être disponibles _à l'intérieur_ de l'environnement du sandbox. Par exemple, pour exécuter un serveur MCP via `npx`, l'exécutable `npx` doit être installé dans l'image Docker du sandbox ou être disponible dans l'environnement `sandbox-exec`.

Il est important de toujours examiner attentivement les demandes de confirmation avant d'autoriser un outil à continuer.

## En savoir plus sur les outils de Qwen Code

Les outils intégrés de Qwen Code peuvent être classés approximativement comme suit :

- **[Outils du système de fichiers](./file-system.md) :** Pour interagir avec les fichiers et répertoires (lecture, écriture, listage, recherche, etc.).
- **[Outil Shell](./shell.md) (`run_shell_command`) :** Pour exécuter des commandes shell.
- **[Outil Web Fetch](./web-fetch.md) (`web_fetch`) :** Pour récupérer le contenu à partir d'URLs.
- **[Outil Web Search](./web-search.md) (`web_search`) :** Pour effectuer des recherches sur le web.
- **[Outil Multi-File Read](./multi-file.md) (`read_many_files`) :** Un outil spécialisé pour lire le contenu de plusieurs fichiers ou répertoires, souvent utilisé par la commande `@`.
- **[Outil Mémoire](./memory.md) (`save_memory`) :** Pour sauvegarder et rappeler des informations entre différentes sessions.
- **[Outil Todo Write](./todo-write.md) (`todo_write`) :** Pour créer et gérer des listes de tâches structurées pendant les sessions de codage.

En outre, ces outils intègrent :

- **[Serveurs MCP](./mcp-server.md)** : Les serveurs MCP agissent comme un pont entre le modèle et votre environnement local ou d'autres services tels que les APIs.