# Qwen Code Core : API des Tools

Le cœur de Qwen Code (`packages/core`) dispose d'un système robuste pour définir, enregistrer et exécuter des tools. Ces tools étendent les capacités du modèle, lui permettant d'interagir avec l'environnement local, de récupérer du contenu web et d'effectuer diverses actions au-delà de la simple génération de texte.

## Concepts clés

- **Tool (`tools.ts`) :** Une interface et une classe de base (`BaseTool`) qui définissent le contrat pour tous les outils. Chaque outil doit avoir :
  - `name` : Un nom interne unique (utilisé dans les appels API au modèle).
  - `displayName` : Un nom convivial pour l'utilisateur.
  - `description` : Une explication claire de ce que fait l'outil, fournie au modèle.
  - `parameterSchema` : Un schéma JSON définissant les paramètres acceptés par l'outil. Cela permet au modèle de comprendre comment appeler l'outil correctement.
  - `validateToolParams()` : Une méthode pour valider les paramètres entrants.
  - `getDescription()` : Une méthode qui fournit une description lisible par un humain de ce que l'outil va faire avec des paramètres spécifiques avant son exécution.
  - `shouldConfirmExecute()` : Une méthode pour déterminer si une confirmation utilisateur est nécessaire avant l'exécution (par exemple, pour les opérations potentiellement destructrices).
  - `execute()` : La méthode principale qui effectue l'action de l'outil et retourne un `ToolResult`.

- **`ToolResult` (`tools.ts`) :** Une interface définissant la structure du résultat d'exécution d'un outil :
  - `llmContent` : Le contenu factuel à inclure dans l'historique envoyé au LLM pour le contexte. Cela peut être une simple chaîne de caractères ou un `PartListUnion` (un tableau d'objets `Part` et de chaînes) pour du contenu riche.
  - `returnDisplay` : Une chaîne conviviale (souvent en Markdown) ou un objet spécial (comme `FileDiff`) destiné à être affiché dans le CLI.

- **Retour de contenu riche :** Les outils ne sont pas limités au retour de texte simple. Le `llmContent` peut être un `PartListUnion`, c'est-à-dire un tableau pouvant contenir un mélange d'objets `Part` (pour les images, l'audio, etc.) et de `string`. Cela permet à une seule exécution d'outil de renvoyer plusieurs éléments de contenu riche.

- **Registre des outils (`tool-registry.ts`) :** Une classe (`ToolRegistry`) responsable de :
  - **L'enregistrement des outils :** Maintenir une collection de tous les outils intégrés disponibles (par exemple, `ReadFileTool`, `ShellTool`).
  - **La découverte dynamique des outils :**
    - **Découverte via commande :** Si `toolDiscoveryCommand` est configurée dans les paramètres, cette commande est exécutée. Elle doit retourner un JSON décrivant des outils personnalisés, qui sont ensuite enregistrés comme des instances de `DiscoveredTool`.
    - **Découverte via MCP :** Si `mcpServerCommand` est configurée, le registre peut se connecter à un serveur utilisant le Model Context Protocol (MCP) pour lister et enregistrer des outils (`DiscoveredMCPTool`).
  - **Fournir les schémas :** Exposer les schémas `FunctionDeclaration` de tous les outils enregistrés au modèle, afin qu'il sache quels outils sont disponibles et comment les utiliser.
  - **Récupérer les outils :** Permettre au cœur de l'application d'obtenir un outil spécifique par son nom pour l'exécuter.

## Outils intégrés

Le cœur inclut une suite d'outils prédéfinis, généralement situés dans `packages/core/src/tools/`. Elle comprend :

- **Outils du système de fichiers :**
  - `LSTool` (`ls.ts`) : Liste le contenu d'un répertoire.
  - `ReadFileTool` (`read-file.ts`) : Lit le contenu d'un seul fichier. Il prend un paramètre `absolute_path`, qui doit être un chemin absolu.
  - `WriteFileTool` (`write-file.ts`) : Écrit du contenu dans un fichier.
  - `GrepTool` (`grep.ts`) : Recherche des motifs dans des fichiers.
  - `GlobTool` (`glob.ts`) : Trouve des fichiers correspondant à des motifs glob.
  - `EditTool` (`edit.ts`) : Effectue des modifications sur place dans des fichiers (souvent avec demande de confirmation).
  - `ReadManyFilesTool` (`read-many-files.ts`) : Lit et concatène le contenu de plusieurs fichiers ou motifs glob (utilisé par la commande `@` dans le CLI).
- **Outils d'exécution :**
  - `ShellTool` (`shell.ts`) : Exécute des commandes shell arbitraires (nécessite un sandboxing rigoureux et la confirmation de l'utilisateur).
- **Outils web :**
  - `WebFetchTool` (`web-fetch.ts`) : Récupère le contenu d'une URL.
  - `WebSearchTool` (`web-search.ts`) : Effectue une recherche web.
- **Outils de mémoire :**
  - `MemoryTool` (`memoryTool.ts`) : Interagit avec la mémoire de l'IA.

Chacun de ces outils étend `BaseTool` et implémente les méthodes requises pour sa fonctionnalité spécifique.

## Flux d'exécution des outils

1.  **Requête du modèle :** Le modèle, en se basant sur le prompt de l'utilisateur et les schémas d'outils fournis, décide d'utiliser un outil et renvoie une partie `FunctionCall` dans sa réponse, en spécifiant le nom de l'outil et les arguments.
2.  **Réception par le Core :** Le core analyse cette `FunctionCall`.
3.  **Récupération de l'outil :** Il recherche l'outil demandé dans le `ToolRegistry`.
4.  **Validation des paramètres :** La méthode `validateToolParams()` de l'outil est appelée.
5.  **Confirmation (si nécessaire) :**
    - La méthode `shouldConfirmExecute()` de l'outil est appelée.
    - Si elle renvoie des détails nécessitant une confirmation, le core les transmet au CLI, qui invite alors l'utilisateur à confirmer.
    - La décision de l'utilisateur (ex. : continuer, annuler) est renvoyée au core.
6.  **Exécution :** Si les paramètres sont validés et confirmés (ou si aucune confirmation n'est requise), le core appelle la méthode `execute()` de l'outil avec les arguments fournis ainsi qu'un `AbortSignal` (pour permettre une éventuelle annulation).
7.  **Traitement du résultat :** Le `ToolResult` provenant de la méthode `execute()` est reçu par le core.
8.  **Réponse au modèle :** Le `llmContent` issu du `ToolResult` est encapsulé dans un `FunctionResponse` et renvoyé au modèle afin qu'il puisse continuer à générer une réponse destinée à l'utilisateur.
9.  **Affichage à l'utilisateur :** Le `returnDisplay` du `ToolResult` est envoyé au CLI pour montrer à l'utilisateur ce que l'outil a effectué.

## Extension avec des outils personnalisés

Même si l'enregistrement programmatique direct de nouveaux outils par les utilisateurs n'est pas explicitement décrit comme un flux de travail principal dans les fichiers fournis pour les utilisateurs finaux typiques, l'architecture prend en charge l'extension via :

- **Découverte basée sur des commandes :** Les utilisateurs avancés ou les administrateurs de projet peuvent définir une `toolDiscoveryCommand` dans le fichier `settings.json`. Cette commande, lorsqu'elle est exécutée par le noyau, doit renvoyer un tableau JSON d'objets `FunctionDeclaration`. Le noyau les rendra alors disponibles en tant qu'instances de `DiscoveredTool`. La `toolCallCommand` correspondante sera ensuite chargée d'exécuter effectivement ces outils personnalisés.
- **Serveur(s) MCP :** Pour des scénarios plus complexes, un ou plusieurs serveurs MCP peuvent être configurés via le paramètre `mcpServers` dans le fichier `settings.json`. Le noyau peut alors découvrir et utiliser les outils exposés par ces serveurs. Comme mentionné précédemment, si vous avez plusieurs serveurs MCP, les noms des outils seront préfixés avec le nom du serveur défini dans votre configuration (par exemple, `serverAlias__actualToolName`).

Ce système d'outils offre un moyen flexible et puissant d'augmenter les capacités du modèle, faisant de Qwen Code un assistant polyvalent pour une large gamme de tâches.