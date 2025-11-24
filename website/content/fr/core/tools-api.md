# Qwen Code Core : Tools API

Le cœur de Qwen Code (`packages/core`) dispose d'un système robuste pour définir, enregistrer et exécuter des tools. Ces tools étendent les capacités du modèle, lui permettant d'interagir avec l'environnement local, de récupérer du contenu web et d'effectuer diverses actions au-delà de la simple génération de texte.

## Concepts clés

- **Tool (`tools.ts`) :** Une interface et une classe de base (`BaseTool`) qui définissent le contrat pour tous les outils. Chaque outil doit avoir :
  - `name` : Un nom interne unique (utilisé dans les appels API au modèle).
  - `displayName` : Un nom convivial pour l'utilisateur.
  - `description` : Une explication claire de ce que fait l'outil, fournie au modèle.
  - `parameterSchema` : Un schéma JSON définissant les paramètres acceptés par l'outil. Cela permet au modèle de comprendre comment appeler correctement l’outil.
  - `validateToolParams()` : Une méthode pour valider les paramètres entrants.
  - `getDescription()` : Une méthode qui fournit une description compréhensible par un humain de ce que va faire l’outil avec des paramètres spécifiques avant son exécution.
  - `shouldConfirmExecute()` : Une méthode pour déterminer si une confirmation utilisateur est nécessaire avant l’exécution (par exemple, pour les opérations potentiellement destructrices).
  - `execute()` : La méthode principale qui effectue l'action de l'outil et retourne un `ToolResult`.

- **`ToolResult` (`tools.ts`) :** Une interface définissant la structure du résultat d'exécution d’un outil :
  - `llmContent` : Le contenu factuel à inclure dans l'historique renvoyé au LLM comme contexte. Il peut s'agir d'une simple chaîne de caractères ou d'un `PartListUnion` (un tableau d’objets `Part` et de chaînes) pour du contenu riche.
  - `returnDisplay` : Une chaîne conviviale (souvent en Markdown) ou un objet spécial (comme `FileDiff`) destiné à être affiché dans le CLI.

- **Renvoyer du contenu riche :** Les outils ne sont pas limités aux simples textes. Le champ `llmContent` peut être un `PartListUnion`, c’est-à-dire un tableau pouvant contenir un mélange d’objets `Part` (pour les images, l’audio, etc.) et de `string`. Cela permet à une seule exécution d’outil de renvoyer plusieurs éléments de contenu riche.

- **Registre des outils (`tool-registry.ts`) :** Une classe (`ToolRegistry`) responsable de :
  - **L’enregistrement des outils :** Maintenir une collection de tous les outils intégrés disponibles (ex. : `ListFiles`, `ReadFile`).
  - **La découverte dynamique des outils :**
    - **Découverte via commande :** Si `tools.toolDiscoveryCommand` est configurée dans les paramètres, cette commande est exécutée. Elle doit produire en sortie un JSON décrivant des outils personnalisés, qui sont ensuite enregistrés sous forme d’instances `DiscoveredTool`.
    - **Découverte via MCP :** Si `mcp.mcpServerCommand` est configurée, le registre peut se connecter à un serveur utilisant le Model Context Protocol (MCP), afin de lister et enregistrer des outils (`DiscoveredMCPTool`).
  - **Fourniture des schémas :** Exposer les schémas `FunctionDeclaration` de tous les outils enregistrés au modèle, afin qu’il sache quels outils sont disponibles et comment les utiliser.
  - **Récupération des outils :** Permettre au cœur de l’application d’obtenir un outil spécifique par son nom pour l’exécuter.

## Outils intégrés

Le cœur inclut une suite d'outils prédéfinis, généralement situés dans `packages/core/src/tools/`. Elle comprend :

- **Outils du système de fichiers :**
  - `ListFiles` (`ls.ts`) : Liste le contenu d'un répertoire.
  - `ReadFile` (`read-file.ts`) : Lit le contenu d'un seul fichier. Il prend un paramètre `absolute_path`, qui doit être un chemin absolu.
  - `WriteFile` (`write-file.ts`) : Écrit du contenu dans un fichier.
  - `ReadManyFiles` (`read-many-files.ts`) : Lit et concatène le contenu de plusieurs fichiers ou motifs glob (utilisé par la commande `@` dans le CLI).
  - `Grep` (`grep.ts`) : Recherche des motifs dans des fichiers.
  - `Glob` (`glob.ts`) : Trouve les fichiers correspondant à des motifs glob.
  - `Edit` (`edit.ts`) : Effectue des modifications en place sur des fichiers (nécessite souvent une confirmation).
- **Outils d'exécution :**
  - `Shell` (`shell.ts`) : Exécute des commandes shell arbitraires (nécessite un sandboxing rigoureux et la confirmation de l'utilisateur).
- **Outils Web :**
  - `WebFetch` (`web-fetch.ts`) : Récupère le contenu depuis une URL.
  - `WebSearch` (`web-search.ts`) : Effectue une recherche sur le web.
- **Outils de mémoire :**
  - `SaveMemory` (`memoryTool.ts`) : Interagit avec la mémoire de l'IA.
- **Outils de planification :**
  - `Task` (`task.ts`) : Délègue des tâches à des sous-agents spécialisés.
  - `TodoWrite` (`todoWrite.ts`) : Crée et gère une liste de tâches structurée.
  - `ExitPlanMode` (`exitPlanMode.ts`) : Quitte le mode plan et retourne au fonctionnement normal.

Chacun de ces outils étend `BaseTool` et implémente les méthodes requises pour sa fonctionnalité spécifique.

## Workflow d'exécution des Tools

1.  **Requête du modèle :** Le modèle, en se basant sur le prompt de l'utilisateur et les schémas de tools fournis, décide d'utiliser un tool et renvoie une partie `FunctionCall` dans sa réponse, spécifiant le nom du tool et ses arguments.
2.  **Réception par le Core :** Le core parse cette `FunctionCall`.
3.  **Récupération du Tool :** Il recherche le tool demandé dans le `ToolRegistry`.
4.  **Validation des paramètres :** La méthode `validateToolParams()` du tool est appelée.
5.  **Confirmation (si nécessaire) :**
    - La méthode `shouldConfirmExecute()` du tool est appelée.
    - Si elle retourne des détails nécessitant une confirmation, le core communique cela au CLI, qui invite alors l'utilisateur à confirmer.
    - La décision de l'utilisateur (ex. : continuer, annuler) est renvoyée au core.
6.  **Exécution :** Si les paramètres sont validés et confirmés (ou si aucune confirmation n'est requise), le core appelle la méthode `execute()` du tool avec les arguments fournis ainsi qu'un `AbortSignal` (pour permettre une éventuelle annulation).
7.  **Traitement du résultat :** Le `ToolResult` retourné par `execute()` est reçu par le core.
8.  **Réponse au Modèle :** Le `llmContent` issu du `ToolResult` est encapsulé dans un `FunctionResponse` et envoyé au modèle afin qu'il puisse poursuivre la génération d'une réponse destinée à l'utilisateur.
9.  **Affichage à l'Utilisateur :** Le `returnDisplay` contenu dans le `ToolResult` est transmis au CLI pour afficher à l'utilisateur ce que le tool a effectué.

## Extension avec des outils personnalisés

Bien que l'enregistrement programmatique direct de nouveaux outils par les utilisateurs ne soit pas explicitement décrit comme un flux de travail principal dans les fichiers fournis pour les utilisateurs finaux typiques, l'architecture prend en charge l'extension via :

- **Découverte basée sur des commandes :** Les utilisateurs avancés ou les administrateurs de projet peuvent définir une commande `tools.toolDiscoveryCommand` dans le fichier `settings.json`. Cette commande, lorsqu'elle est exécutée par le noyau, doit renvoyer un tableau JSON d'objets `FunctionDeclaration`. Le noyau mettra alors ces objets à disposition sous forme d'instances `DiscoveredTool`. La commande correspondante `tools.toolCallCommand` sera ensuite chargée d'exécuter effectivement ces outils personnalisés.
- **Serveur(s) MCP :** Pour des scénarios plus complexes, un ou plusieurs serveurs MCP peuvent être configurés via le paramètre `mcpServers` dans le fichier `settings.json`. Le noyau peut alors découvrir et utiliser les outils exposés par ces serveurs. Comme mentionné précédemment, si vous avez plusieurs serveurs MCP, les noms des outils seront préfixés avec le nom du serveur défini dans votre configuration (par exemple, `serverAlias__actualToolName`).

Ce système d'outils offre une manière flexible et puissante d'étendre les capacités du modèle, faisant de Qwen Code un assistant polyvalent adapté à un large éventail de tâches.