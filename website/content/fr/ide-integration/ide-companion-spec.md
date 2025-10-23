# Plugin compagnon Qwen Code : Spécification de l'interface

> Dernière mise à jour : 15 septembre 2025

Ce document définit le contrat pour créer un plugin compagnon permettant d'activer le mode IDE de Qwen Code. Pour VS Code, ces fonctionnalités (diff natif, gestion du contexte) sont fournies par l'extension officielle ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Cette spécification s'adresse aux contributeurs souhaitant apporter des fonctionnalités similaires à d'autres éditeurs comme les IDE JetBrains, Sublime Text, etc.

## I. L'interface de communication

Qwen Code et le plugin IDE communiquent via un canal de communication local.

### 1. Couche de transport : MCP sur HTTP

Le plugin **DOIT** exécuter un serveur HTTP local qui implémente le **Model Context Protocol (MCP)**.

- **Protocole :** Le serveur doit être un serveur MCP valide. Nous recommandons d'utiliser un SDK MCP existant pour votre langage de choix si disponible.
- **Endpoint :** Le serveur devrait exposer un seul endpoint (par exemple, `/mcp`) pour toute la communication MCP.
- **Port :** Le serveur **DOIT** écouter sur un port attribué dynamiquement (c'est-à-dire, écouter sur le port `0`).

### 2. Mécanisme de découverte : le fichier port

Pour que Qwen Code puisse se connecter, il doit découvrir dans quelle instance d'IDE il s'exécute et sur quel port votre serveur écoute. Le plugin **DOIT** faciliter cette découverte en créant un « fichier de découverte ».

- **Comment le CLI trouve le fichier :** Le CLI détermine le PID (Process ID) de l'IDE dans lequel il s'exécute en parcourant l'arbre des processus. Il recherche ensuite un fichier de découverte dont le nom contient ce PID.
- **Emplacement du fichier :** Le fichier doit être créé dans un répertoire spécifique : `os.tmpdir()/qwen/ide/`. Votre plugin doit créer ce répertoire s'il n'existe pas encore.
- **Convention de nommage :** Le nom du fichier est critique et **DOIT** respecter le format suivant :
  `qwen-code-ide-server-${PID}-${PORT}.json`
  - `${PID}` : Le PID du processus parent de l'IDE. Votre plugin doit déterminer ce PID et l'inclure dans le nom du fichier.
  - `${PORT}` : Le port sur lequel votre serveur MCP écoute.
- **Contenu du fichier & validation de l'espace de travail :** Le fichier **DOIT** contenir un objet JSON avec la structure suivante :

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ideInfo": {
      "name": "vscode",
      "displayName": "VS Code"
    }
  }
  ```
  - `port` (nombre, requis) : Le port du serveur MCP.
  - `workspacePath` (chaîne, requis) : Une liste de tous les chemins racine des espaces de travail ouverts, séparés par le séparateur de chemins spécifique à l'OS (`:` pour Linux/macOS, `;` pour Windows). Le CLI utilise ce chemin pour vérifier qu'il s'exécute bien dans le même dossier projet que celui ouvert dans l'IDE. Si le répertoire courant du CLI n'est pas un sous-répertoire de `workspacePath`, la connexion sera rejetée. Votre plugin **DOIT** fournir les chemins absolus corrects vers la racine des espaces de travail ouverts.
  - `authToken` (chaîne, requis) : Un jeton secret utilisé pour sécuriser la connexion. Le CLI inclura ce jeton dans un header `Authorization: Bearer <token>` pour toutes les requêtes.
  - `ideInfo` (objet, requis) : Informations sur l'IDE.
    - `name` (chaîne, requis) : Un identifiant court en minuscules pour l'IDE (ex. : `vscode`, `jetbrains`).
    - `displayName` (chaîne, requis) : Un nom convivial pour l'utilisateur (ex. : `VS Code`, `JetBrains IDE`).

- **Authentification :** Pour sécuriser la connexion, le plugin **DOIT** générer un jeton secret unique et l'inclure dans le fichier de découverte. Le CLI inclura ensuite ce jeton dans le header `Authorization` pour toutes les requêtes vers le serveur MCP (ex. : `Authorization: Bearer a-very-secret-token`). Votre serveur **DOIT** valider ce jeton à chaque requête et rejeter celles non autorisées.
- **Gestion des conflits via variables d’environnement (recommandé) :** Pour une expérience fiable, votre plugin **DEVRAIT** à la fois créer le fichier de découverte et définir la variable d’environnement `QWEN_CODE_IDE_SERVER_PORT` dans le terminal intégré. Le fichier sert de mécanisme principal de découverte, mais la variable d’environnement est cruciale pour trancher en cas d’ambiguïté. Si un utilisateur a plusieurs fenêtres d’IDE ouvertes pour le même espace de travail, le CLI utilisera la variable `QWEN_CODE_IDE_SERVER_PORT` pour identifier et se connecter au bon serveur correspondant à la fenêtre active.

## II. L'Interface Context

Pour permettre la prise en compte du contexte, le plugin **PEUT** fournir au CLI des informations en temps réel sur l'activité de l'utilisateur dans l'IDE.

### Notification `ide/contextUpdate`

Le plugin **PEUT** envoyer une notification `ide/contextUpdate` vers le CLI chaque fois que le contexte de l'utilisateur change.

- **Événements déclencheurs :** Cette notification doit être envoyée (avec un délai de debounce recommandé de 50 ms) lorsque :
  - Un fichier est ouvert, fermé ou sélectionné.
  - La position du curseur ou la sélection de texte de l'utilisateur change dans le fichier actif.
- **Contenu (`IdeContext`) :** Les paramètres de la notification **DOIVENT** être un objet de type `IdeContext` :

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
    // Horodatage Unix de la dernière activation (pour ordonner les fichiers)
    timestamp: number;
    // Vrai si ce fichier est actuellement sélectionné
    isActive?: boolean;
    cursor?: {
      // Numéro de ligne (commence à 1)
      line: number;
      // Numéro de caractère (commence à 1)
      character: number;
    };
    // Texte actuellement sélectionné par l'utilisateur
    selectedText?: string;
  }
  ```

  **Remarque :** La liste `openFiles` ne doit inclure que des fichiers existant sur le disque. Les fichiers virtuels (par exemple, les fichiers non sauvegardés sans chemin, les pages de réglages de l'éditeur) **DOIVENT** être exclus.

### Comment le CLI utilise ce contexte

Après avoir reçu l'objet `IdeContext`, le CLI effectue plusieurs étapes de normalisation et de troncature avant d’envoyer les informations au modèle.

- **Ordre des fichiers :** Le CLI utilise le champ `timestamp` pour déterminer quels fichiers ont été utilisés le plus récemment. Il trie la liste `openFiles` en fonction de cette valeur. Par conséquent, votre plugin **DOIT** fournir un timestamp Unix précis indiquant quand le fichier a été sélectionné pour la dernière fois.
- **Fichier actif :** Le CLI considère uniquement le fichier le plus récent (après tri) comme le fichier « actif ». Il ignorera le flag `isActive` sur tous les autres fichiers et effacera leurs champs `cursor` et `selectedText`. Votre plugin doit donc se concentrer sur le paramétrage de `isActive: true` et fournir les détails du curseur/sélection uniquement pour le fichier actuellement focalisé.
- **Troncature :** Pour gérer les limites de tokens, le CLI tronque à la fois la liste des fichiers (jusqu'à 10 fichiers) et le `selectedText` (jusqu'à 16 Ko).

Bien que le CLI gère la troncature finale, il est fortement recommandé que votre plugin limite également la quantité de contexte envoyée.

## III. L'Interface de Diff

Pour permettre des modifications de code interactives, le plugin **PEUT** exposer une interface de diff. Cela permet au CLI de demander à l'IDE d'ouvrir une vue de diff, montrant les changements proposés pour un fichier. L'utilisateur peut ensuite examiner, éditer, et finalement accepter ou rejeter ces changements directement dans l'IDE.

### Outil `openDiff`

Le plugin **DOIT** enregistrer un outil `openDiff` sur son serveur MCP.

- **Description :** Cet outil indique à l'IDE d'ouvrir une vue de diff modifiable pour un fichier spécifique.
- **Requête (`OpenDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans les `params` de la requête **DOIT** être un objet `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // Le chemin absolu du fichier à comparer.
    filePath: string;
    // Le nouveau contenu proposé pour le fichier.
    newContent: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** immédiatement retourner un `CallToolResult` pour confirmer la réception de la requête et indiquer si la vue de diff a été ouverte avec succès.
  - En cas de succès : Si la vue de diff a été ouverte avec succès, la réponse **DOIT** contenir un contenu vide (c'est-à-dire `content: []`).
  - En cas d'erreur : Si une erreur a empêché l'ouverture de la vue de diff, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

  Le résultat effectif du diff (acceptation ou rejet) est communiqué de manière asynchrone via des notifications.

### Outil `closeDiff`

Le plugin **DOIT** enregistrer un outil `closeDiff` sur son serveur MCP.

- **Description :** Cet outil indique à l'IDE de fermer une vue diff ouverte pour un fichier spécifique.
- **Requête (`CloseDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans les `params` de la requête **DOIT** être un objet `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // Le chemin absolu du fichier dont la vue diff doit être fermée.
    filePath: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** retourner un `CallToolResult`.
  - En cas de succès : Si la vue diff a été fermée avec succès, la réponse **DOIT** inclure un seul bloc **TextContent** dans le tableau `content` contenant le contenu final du fichier avant sa fermeture.
  - En cas d'erreur : Si une erreur a empêché la fermeture de la vue diff, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

### Notification `ide/diffAccepted`

Lorsque l'utilisateur accepte les modifications dans une vue de diff (par exemple, en cliquant sur un bouton "Apply" ou "Save"), le plugin **DOIT** envoyer une notification `ide/diffAccepted` au CLI.

- **Payload :** Les paramètres de la notification **DOIVENT** inclure le chemin du fichier et le contenu final du fichier. Le contenu peut différer du `newContent` original si l'utilisateur a effectué des modifications manuelles dans la vue de diff.

  ```typescript
  {
    // Le chemin absolu vers le fichier qui a été comparé.
    filePath: string;
    // Le contenu complet du fichier après acceptation.
    content: string;
  }
  ```

### Notification `ide/diffRejected`

Lorsque l'utilisateur rejette les modifications (par exemple, en fermant la vue de diff sans accepter), le plugin **DOIT** envoyer une notification `ide/diffRejected` au CLI.

- **Payload :** Les paramètres de la notification **DOIVENT** inclure le chemin du fichier du diff rejeté.

  ```typescript
  {
    // Le chemin absolu vers le fichier qui a été comparé.
    filePath: string;
  }
  ```

## IV. L'Interface du Cycle de Vie

Le plugin **DOIT** gérer correctement ses ressources et le fichier de découverte en fonction du cycle de vie de l'IDE.

- **À l'activation (démarrage de l'IDE / activation du plugin) :**
  1. Démarrer le serveur MCP.
  2. Créer le fichier de découverte.
- **À la désactivation (arrêt de l'IDE / désactivation du plugin) :**
  1. Arrêter le serveur MCP.
  2. Supprimer le fichier de découverte.