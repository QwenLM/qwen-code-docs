# Plugin compagnon Qwen Code : Spécification de l'interface

> Dernière mise à jour : 15 septembre 2025

Ce document définit le contrat pour développer un plugin compagnon permettant d'activer le mode IDE de Qwen Code. Pour VS Code, ces fonctionnalités (diff natif, conscience du contexte) sont fournies par l'extension officielle ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Cette spécification s'adresse aux contributeurs souhaitant apporter des fonctionnalités similaires à d'autres éditeurs comme les IDE JetBrains, Sublime Text, etc.

## I. L'interface de communication

Qwen Code et le plugin IDE communiquent via un canal de communication local.

### 1. Couche de transport : MCP sur HTTP

Le plugin **DOIT** exécuter un serveur HTTP local implémentant le **Model Context Protocol (MCP)**.

- **Protocole :** Le serveur doit être un serveur MCP valide. Nous recommandons d'utiliser un SDK MCP existant pour votre langage de prédilection, si disponible.
- **Endpoint :** Le serveur doit exposer un unique endpoint (par ex. `/mcp`) pour toute la communication MCP.
- **Port :** Le serveur **DOIT** écouter sur un port attribué dynamiquement (c'est-à-dire écouter sur le port `0`).

### 2. Mécanisme de découverte : Le fichier lock

Pour que Qwen Code puisse se connecter, il doit découvrir le port utilisé par votre serveur. Le plugin **DOIT** faciliter cette étape en créant un « fichier lock » et en définissant la variable d'environnement du port.

- **Comment le CLI trouve le fichier :** Le CLI lit le port depuis `QWEN_CODE_IDE_SERVER_PORT`, puis lit `~/.qwen/ide/<PORT>.lock`. (Des mécanismes de repli legacy existent pour les extensions plus anciennes ; voir la note ci-dessous.)
- **Emplacement du fichier :** Le fichier doit être créé dans un répertoire spécifique : `~/.qwen/ide/`. Votre plugin doit créer ce répertoire s'il n'existe pas.
- **Convention de nommage :** Le nom du fichier est critique et **DOIT** suivre le modèle :
  `<PORT>.lock`
  - `<PORT>` : Le port sur lequel votre serveur MCP écoute.
- **Contenu du fichier et validation du workspace :** Le fichier **DOIT** contenir un objet JSON avec la structure suivante :

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (number, required) : Le port du serveur MCP.
  - `workspacePath` (string, required) : Une liste de tous les chemins racines des workspaces ouverts, délimités par le séparateur de chemin spécifique à l'OS (`:` pour Linux/macOS, `;` pour Windows). Le CLI utilise ce chemin pour s'assurer qu'il s'exécute dans le même dossier de projet que celui ouvert dans l'IDE. Si le répertoire de travail actuel du CLI n'est pas un sous-répertoire de `workspacePath`, la connexion sera rejetée. Votre plugin **DOIT** fournir le(s) chemin(s) absolu(s) correct(s) vers la racine du(des) workspace(s) ouvert(s).
  - `authToken` (string, required) : Un token secret pour sécuriser la connexion. Le CLI inclura ce token dans un en-tête `Authorization: Bearer <token>` pour toutes les requêtes.
  - `ppid` (number, required) : L'ID du processus parent du processus IDE.
  - `ideName` (string, required) : Un nom convivial pour l'IDE (par ex. `VS Code`, `JetBrains IDE`).

- **Authentification :** Pour sécuriser la connexion, le plugin **DOIT** générer un token secret unique et l'inclure dans le fichier de découverte. Le CLI inclura ensuite ce token dans l'en-tête `Authorization` pour toutes les requêtes vers le serveur MCP (par ex. `Authorization: Bearer a-very-secret-token`). Votre serveur **DOIT** valider ce token à chaque requête et rejeter celles qui ne sont pas autorisées.
- **Variables d'environnement (obligatoires) :** Votre plugin **DOIT** définir `QWEN_CODE_IDE_SERVER_PORT` dans le terminal intégré afin que le CLI puisse localiser le fichier `<PORT>.lock` correct.

**Note legacy :** Pour les extensions antérieures à la v0.5.1, Qwen Code peut se rabattre sur la lecture de fichiers JSON dans le répertoire temporaire du système nommés `qwen-code-ide-server-<PID>.json` ou `qwen-code-ide-server-<PORT>.json`. Les nouvelles intégrations ne doivent pas dépendre de ces fichiers legacy.

## II. L'interface de contexte

Pour activer la conscience du contexte, le plugin **PEUT** fournir au CLI des informations en temps réel sur l'activité de l'utilisateur dans l'IDE.

### Notification `ide/contextUpdate`

Le plugin **PEUT** envoyer une [notification](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) `ide/contextUpdate` au CLI chaque fois que le contexte de l'utilisateur change.

- **Événements déclencheurs :** Cette notification doit être envoyée (avec un debounce recommandé de 50 ms) lorsque :
  - Un fichier est ouvert, fermé ou reçoit le focus.
  - La position du curseur ou la sélection de texte de l'utilisateur change dans le fichier actif.
- **Payload (`IdeContext`) :** Les paramètres de la notification **DOIVENT** être un objet `IdeContext` :

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // Absolute path to the file
    path: string;
    // Last focused Unix timestamp (for ordering)
    timestamp: number;
    // True if this is the currently focused file
    isActive?: boolean;
    cursor?: {
      // 1-based line number
      line: number;
      // 1-based character number
      character: number;
    };
    // The text currently selected by the user
    selectedText?: string;
  }
  ```

  **Note :** La liste `openFiles` ne doit inclure que les fichiers existant sur le disque. Les fichiers virtuels (par ex. fichiers non enregistrés sans chemin, pages de paramètres de l'éditeur) **DOIVENT** être exclus.

### Comment le CLI utilise ce contexte

Après avoir reçu l'objet `IdeContext`, le CLI effectue plusieurs étapes de normalisation et de troncature avant d'envoyer les informations au modèle.

- **Ordre des fichiers :** Le CLI utilise le champ `timestamp` pour déterminer les fichiers utilisés le plus récemment. Il trie la liste `openFiles` en fonction de cette valeur. Par conséquent, votre plugin **DOIT** fournir un timestamp Unix précis indiquant la dernière fois qu'un fichier a reçu le focus.
- **Fichier actif :** Le CLI considère uniquement le fichier le plus récent (après tri) comme le fichier « actif ». Il ignorera le flag `isActive` sur tous les autres fichiers et effacera leurs champs `cursor` et `selectedText`. Votre plugin doit se concentrer sur la définition de `isActive: true` et fournir les détails du curseur/sélection uniquement pour le fichier ayant actuellement le focus.
- **Troncature :** Pour gérer les limites de tokens, le CLI tronque à la fois la liste des fichiers (à 10 fichiers) et le `selectedText` (à 16 Ko).

Bien que le CLI gère la troncature finale, il est fortement recommandé que votre plugin limite également la quantité de contexte qu'il envoie.

## III. L'interface de diff

Pour activer les modifications de code interactives, le plugin **PEUT** exposer une interface de diff. Cela permet au CLI de demander à l'IDE d'ouvrir une vue diff, affichant les modifications proposées pour un fichier. L'utilisateur peut ensuite les examiner, les modifier et finalement les accepter ou les rejeter directement dans l'IDE.

### Outil `openDiff`

Le plugin **DOIT** enregistrer un outil `openDiff` sur son serveur MCP.

- **Description :** Cet outil demande à l'IDE d'ouvrir une vue diff modifiable pour un fichier spécifique.
- **Requête (`OpenDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans les `params` de la requête **DOIT** être un objet `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // The absolute path to the file to be diffed.
    filePath: string;
    // The proposed new content for the file.
    newContent: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** retourner immédiatement un `CallToolResult` pour accuser réception de la requête et indiquer si la vue diff a été ouverte avec succès.
  - En cas de succès : Si la vue diff a été ouverte avec succès, la réponse **DOIT** contenir un contenu vide (c'est-à-dire `content: []`).
  - En cas d'échec : Si une erreur a empêché l'ouverture de la vue diff, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

  Le résultat réel du diff (acceptation ou rejet) est communiqué de manière asynchrone via des notifications.

### Outil `closeDiff`

Le plugin **DOIT** enregistrer un outil `closeDiff` sur son serveur MCP.

- **Description :** Cet outil demande à l'IDE de fermer une vue diff ouverte pour un fichier spécifique.
- **Requête (`CloseDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans les `params` de la requête **DOIT** être un objet `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // The absolute path to the file whose diff view should be closed.
    filePath: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** retourner un `CallToolResult`.
  - En cas de succès : Si la vue diff a été fermée avec succès, la réponse **DOIT** inclure un unique bloc **TextContent** dans le tableau content contenant le contenu final du fichier avant la fermeture.
  - En cas d'échec : Si une erreur a empêché la fermeture de la vue diff, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

### Notification `ide/diffAccepted`

Lorsque l'utilisateur accepte les modifications dans une vue diff (par ex. en cliquant sur un bouton « Appliquer » ou « Enregistrer »), le plugin **DOIT** envoyer une notification `ide/diffAccepted` au CLI.

- **Payload :** Les paramètres de la notification **DOIVENT** inclure le chemin du fichier et le contenu final du fichier. Le contenu peut différer du `newContent` original si l'utilisateur a effectué des modifications manuelles dans la vue diff.

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
    // The full content of the file after acceptance.
    content: string;
  }
  ```

### Notification `ide/diffRejected`

Lorsque l'utilisateur rejette les modifications (par ex. en fermant la vue diff sans les accepter), le plugin **DOIT** envoyer une notification `ide/diffRejected` au CLI.

- **Payload :** Les paramètres de la notification **DOIVENT** inclure le chemin du fichier du diff rejeté.

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
  }
  ```

## IV. L'interface de cycle de vie

Le plugin **DOIT** gérer correctement ses ressources et le fichier de découverte en fonction du cycle de vie de l'IDE.

- **À l'activation (démarrage de l'IDE/plugin activé) :**
  1.  Démarrer le serveur MCP.
  2.  Créer le fichier de découverte.
- **À la désactivation (arrêt de l'IDE/plugin désactivé) :**
  1.  Arrêter le serveur MCP.
  2.  Supprimer le fichier de découverte.