# Plugin Compagnon Qwen Code : Spécification de l'Interface

> Dernière mise à jour : 15 septembre 2025

Ce document définit le contrat pour créer un plugin compagnon permettant d'activer le mode IDE de Qwen Code. Pour VS Code, ces fonctionnalités (comparaison native, conscience du contexte) sont fournies par l'extension officielle ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Cette spécification s'adresse aux contributeurs souhaitant apporter des fonctionnalités similaires à d'autres éditeurs comme les IDE JetBrains, Sublime Text, etc.

## I. L'Interface de Communication

Qwen Code et le plugin IDE communiquent via un canal de communication local.

### 1. Couche de transport : MCP sur HTTP

Le plugin **DOIT** exécuter un serveur HTTP local qui implémente le **Model Context Protocol (MCP)**.

- **Protocole :** Le serveur doit être un serveur MCP valide. Nous recommandons d'utiliser un SDK MCP existant pour le langage de votre choix, si disponible.
- **Point de terminaison :** Le serveur devrait exposer un seul point de terminaison (par exemple, `/mcp`) pour toutes les communications MCP.
- **Port :** Le serveur **DOIT** écouter sur un port attribué dynamiquement (c'est-à-dire écouter sur le port `0`).

### 2. Mécanisme de découverte : le fichier port

Pour que Qwen Code puisse se connecter, il doit découvrir l'instance d'IDE dans laquelle il s'exécute ainsi que le port utilisé par votre serveur. Le plugin **DOIT** faciliter cela en créant un « fichier de découverte ».

- **Comment le CLI trouve le fichier :** Le CLI détermine l'ID du processus (PID) de l'IDE dans lequel il s'exécute en parcourant l'arbre des processus. Il recherche ensuite un fichier de découverte dont le nom contient ce PID.
- **Emplacement du fichier :** Le fichier doit être créé dans un répertoire spécifique : `os.tmpdir()/qwen/ide/`. Votre plugin doit créer ce répertoire s'il n'existe pas.
- **Convention de nommage du fichier :** Le nom du fichier est essentiel et **DOIT** suivre le modèle :
  `qwen-code-ide-server-${PID}-${PORT}.json`
  - `${PID}` : L'identifiant du processus parent de l'IDE. Votre plugin doit déterminer ce PID et l'inclure dans le nom du fichier.
  - `${PORT}` : Le port sur lequel votre serveur MCP écoute.
- **Contenu du fichier et validation de l'espace de travail :** Le fichier **DOIT** contenir un objet JSON avec la structure suivante :

  ```json
  {
    "port": 12345,
    "workspacePath": "/chemin/vers/projet1:/chemin/vers/projet2",
    "authToken": "un-token-très-secret",
    "ideInfo": {
      "name": "vscode",
      "displayName": "VS Code"
    }
  }
  ```
  - `port` (nombre, requis) : Le port du serveur MCP.
  - `workspacePath` (chaîne, requise) : Une liste de tous les chemins racines des espaces de travail ouverts, séparés par le séparateur de chemins spécifique au système d'exploitation (`:` pour Linux/macOS, `;` pour Windows). Le CLI utilise ce chemin pour s'assurer qu'il s'exécute dans le même dossier de projet que celui ouvert dans l'IDE. Si le répertoire de travail actuel du CLI n'est pas un sous-répertoire de `workspacePath`, la connexion sera rejetée. Votre plugin **DOIT** fournir les chemins absolus corrects vers la(les) racine(s) de l'(es) espace(s) de travail ouvert(s).
  - `authToken` (chaîne, requis) : Un jeton secret pour sécuriser la connexion. Le CLI inclura ce jeton dans un en-tête `Authorization: Bearer <token>` pour toutes les requêtes.
  - `ideInfo` (objet, requis) : Informations sur l'IDE.
    - `name` (chaîne, requis) : Un identifiant court en minuscules pour l'IDE (ex. : `vscode`, `jetbrains`).
    - `displayName` (chaîne, requis) : Un nom convivial pour l'utilisateur de l'IDE (ex. : `VS Code`, `JetBrains IDE`).

- **Authentification :** Pour sécuriser la connexion, le plugin **DOIT** générer un jeton secret unique et l'inclure dans le fichier de découverte. Le CLI inclura ensuite ce jeton dans l'en-tête `Authorization` pour toutes les requêtes vers le serveur MCP (ex. : `Authorization: Bearer un-token-très-secret`). Votre serveur **DOIT** valider ce jeton à chaque requête et rejeter celles non autorisées.
- **Résolution des conflits avec les variables d’environnement (recommandé) :** Pour une expérience fiable, votre plugin **DEVRAIT** à la fois créer le fichier de découverte et définir la variable d’environnement `QWEN_CODE_IDE_SERVER_PORT` dans le terminal intégré. Le fichier sert de mécanisme principal de découverte, mais la variable d’environnement est cruciale pour trancher en cas d’égalité. Si un utilisateur a plusieurs fenêtres d’IDE ouvertes pour le même espace de travail, le CLI utilise la variable `QWEN_CODE_IDE_SERVER_PORT` pour identifier et se connecter au serveur de la bonne fenêtre.

## II. L'Interface de Contexte

Pour permettre la prise en compte du contexte, le plugin **PEUT** fournir au CLI des informations en temps réel sur l'activité de l'utilisateur dans l'IDE.

### Notification `ide/contextUpdate`

Le plugin **PEUT** envoyer une notification `ide/contextUpdate` [notification](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) à la CLI chaque fois que le contexte de l'utilisateur change.

- **Événements déclencheurs :** Cette notification doit être envoyée (avec un délai de rebond recommandé de 50 ms) lorsque :
  - Un fichier est ouvert, fermé ou mis en avant.
  - La position du curseur de l'utilisateur ou la sélection de texte change dans le fichier actif.
- **Charge utile (`IdeContext`) :** Les paramètres de la notification **DOIVENT** être un objet `IdeContext` :

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // Chemin absolu vers le fichier
    path: string;
    // Horodatage Unix de la dernière mise en avant (pour ordonner)
    timestamp: number;
    // Vrai si ce fichier est actuellement mis en avant
    isActive?: boolean;
    cursor?: {
      // Numéro de ligne (commence à 1)
      line: number;
      // Numéro de caractère (commence à 1)
      character: number;
    };
    // Le texte actuellement sélectionné par l'utilisateur
    selectedText?: string;
  }
  ```

  **Remarque :** La liste `openFiles` ne doit inclure que les fichiers existant sur le disque. Les fichiers virtuels (par exemple, les fichiers non sauvegardés sans chemin, les pages de paramètres de l'éditeur) **DOIVENT** être exclus.

### Comment l'interface CLI utilise ce contexte

Après avoir reçu l'objet `IdeContext`, l'interface CLI effectue plusieurs étapes de normalisation et de troncature avant d'envoyer les informations au modèle.

- **Ordre des fichiers :** L'interface CLI utilise le champ `timestamp` pour déterminer les fichiers les plus récemment utilisés. Elle trie la liste `openFiles` en fonction de cette valeur. Par conséquent, votre plugin **DOIT** fournir un horodatage Unix précis indiquant quand un fichier a été dernièrement mis en avant.
- **Fichier actif :** L'interface CLI considère uniquement le fichier le plus récent (après tri) comme le fichier « actif ». Elle ignorera l'indicateur `isActive` sur tous les autres fichiers et effacera leurs champs `cursor` et `selectedText`. Votre plugin devrait se concentrer sur le paramétrage de `isActive: true` et fournir les détails du curseur/sélection uniquement pour le fichier actuellement mis en avant.
- **Troncature :** Pour gérer les limites de jetons, l'interface CLI tronque à la fois la liste des fichiers (à 10 fichiers) et le `selectedText` (à 16 Ko).

Bien que l'interface CLI gère la troncature finale, il est fortement recommandé que votre plugin limite également la quantité de contexte qu'il envoie.

## III. L'interface de comparaison

Pour permettre des modifications de code interactives, le plugin **PEUT** exposer une interface de comparaison. Cela permet à la CLI de demander à l'IDE d'ouvrir une vue de comparaison, montrant les modifications proposées pour un fichier. L'utilisateur peut ensuite examiner, modifier et finalement accepter ou rejeter ces modifications directement dans l'IDE.

### Outil `openDiff`

Le plugin **DOIT** enregistrer un outil `openDiff` sur son serveur MCP.

- **Description :** Cet outil indique à l'IDE d'ouvrir une vue de différences modifiable pour un fichier spécifique.
- **Requête (`OpenDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans les `params` de la requête **DOIT** être un objet `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // Le chemin absolu du fichier à comparer.
    filePath: string;
    // Le nouveau contenu proposé pour le fichier.
    newContent: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** immédiatement retourner un `CallToolResult` pour accuser réception de la requête et indiquer si la vue de différences a été ouverte avec succès.
  - En cas de succès : Si la vue de différences a été ouverte avec succès, la réponse **DOIT** contenir un contenu vide (c'est-à-dire `content: []`).
  - En cas d'échec : Si une erreur a empêché l'ouverture de la vue de différences, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

  Le résultat effectif de la comparaison (acceptation ou rejet) est communiqué de manière asynchrone via des notifications.

### Outil `closeDiff`

Le plugin **DOIT** enregistrer un outil `closeDiff` sur son serveur MCP.

- **Description :** Cet outil indique à l'IDE de fermer une vue de diff ouverte pour un fichier spécifique.
- **Requête (`CloseDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans les `params` de la requête **DOIT** être un objet `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // Le chemin absolu vers le fichier dont la vue de diff doit être fermée.
    filePath: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** retourner un `CallToolResult`.
  - En cas de succès : Si la vue de diff a été fermée avec succès, la réponse **DOIT** inclure un seul bloc **TextContent** dans le tableau de contenu contenant le contenu final du fichier avant sa fermeture.
  - En cas d'échec : Si une erreur a empêché la fermeture de la vue de diff, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

### Notification `ide/diffAccepted`

Lorsque l'utilisateur accepte les modifications dans une vue de différences (par exemple, en cliquant sur un bouton « Appliquer » ou « Enregistrer »), le plugin **DOIT** envoyer une notification `ide/diffAccepted` à la CLI.

- **Charge utile :** Les paramètres de la notification **DOIVENT** inclure le chemin du fichier et le contenu final du fichier. Le contenu peut différer de `newContent` d'origine si l'utilisateur a effectué des modifications manuelles dans la vue de différences.

  ```typescript
  {
    // Le chemin absolu vers le fichier qui a été comparé.
    filePath: string;
    // Le contenu complet du fichier après acceptation.
    content: string;
  }
  ```

### Notification `ide/diffRejected`

Lorsque l'utilisateur rejette les modifications (par exemple, en fermant la vue de différences sans les accepter), le plugin **DOIT** envoyer une notification `ide/diffRejected` à la CLI.

- **Charge utile :** Les paramètres de la notification **DOIVENT** inclure le chemin du fichier de la différence rejetée.

  ```typescript
  {
    // Le chemin absolu vers le fichier qui a été comparé.
    filePath: string;
  }
  ```

## IV. L'Interface du Cycle de Vie

Le plugin **DOIT** gérer correctement ses ressources et le fichier de découverte en fonction du cycle de vie de l'IDE.

- **À l'activation (démarrage de l'IDE/plugin activé) :**
  1.  Démarrer le serveur MCP.
  2.  Créer le fichier de découverte.
- **À la désactivation (arrêt de l'IDE/plugin désactivé) :**
  1.  Arrêter le serveur MCP.
  2.  Supprimer le fichier de découverte.