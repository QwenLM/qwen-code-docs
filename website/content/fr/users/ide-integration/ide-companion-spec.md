# Plugin Qwen Code Companion : Spécification de l'interface

> Dernière mise à jour : 15 septembre 2025

Ce document définit le contrat pour la création d'un plugin compagnon permettant d'activer le mode IDE de Qwen Code. Pour VS Code, ces fonctionnalités (diff natif, conscience du contexte) sont fournies par l'extension officielle ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Cette spécification s'adresse aux contributeurs souhaitant apporter des fonctionnalités similaires à d'autres éditeurs comme les IDE JetBrains, Sublime Text, etc.

## I. L'interface de communication

Qwen Code et le plugin IDE communiquent via un canal de communication local.

### 1. Couche de transport : MCP sur HTTP

Le plugin **DOIT** exécuter un serveur HTTP local qui implémente le **Model Context Protocol (MCP)**.

- **Protocole :** Le serveur doit être un serveur MCP valide. Nous recommandons d'utiliser un SDK MCP existant pour le langage de votre choix s'il est disponible.
- **Point de terminaison :** Le serveur devrait exposer un seul point de terminaison (par exemple, `/mcp`) pour toutes les communications MCP.
- **Port :** Le serveur **DOIT** écouter sur un port attribué dynamiquement (c'est-à-dire écouter sur le port `0`).

### 2. Mécanisme de découverte : Le fichier verrou

Pour que Qwen Code puisse se connecter, il doit découvrir le port utilisé par votre serveur. L'extension **DOIT** faciliter cela en créant un "fichier verrou" et en définissant la variable d'environnement du port.

- **Comment la CLI trouve le fichier :** La CLI lit le port depuis `QWEN_CODE_IDE_SERVER_PORT`, puis lit `~/.qwen/ide/<PORT>.lock`. (Des solutions de repli existent pour les anciennes extensions ; voir note ci-dessous.)
- **Emplacement du fichier :** Le fichier doit être créé dans un répertoire spécifique : `~/.qwen/ide/`. Votre extension doit créer ce répertoire s'il n'existe pas.
- **Convention de nommage des fichiers :** Le nom du fichier est critique et **DOIT** suivre le modèle :
  `<PORT>.lock`
  - `<PORT>` : Le port sur lequel votre serveur MCP écoute.
- **Contenu du fichier et validation de l'espace de travail :** Le fichier **DOIT** contenir un objet JSON avec la structure suivante :

  ```json
  {
    "port": 12345,
    "workspacePath": "/chemin/vers/projet1:/chemin/vers/projet2",
    "authToken": "un-jeton-très-secret",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (nombre, requis) : Le port du serveur MCP.
  - `workspacePath` (chaîne, requise) : Une liste de tous les chemins racine des espaces de travail ouverts, délimités par le séparateur de chemin spécifique au système d'exploitation (`:` pour Linux/macOS, `;` pour Windows). La CLI utilise ce chemin pour s'assurer qu'elle s'exécute dans le même dossier de projet que celui ouvert dans l'IDE. Si le répertoire de travail actuel de la CLI n'est pas un sous-répertoire de `workspacePath`, la connexion sera rejetée. Votre extension **DOIT** fournir le(s) chemin(s) absolu(s) correct(s) vers la(les) racine(s) de l(espace de travail ouvert(s).
  - `authToken` (chaîne, requise) : Un jeton secret pour sécuriser la connexion. La CLI inclura ce jeton dans un en-tête `Authorization: Bearer <token>` pour toutes les requêtes.
  - `ppid` (nombre, requis) : L'ID du processus parent du processus IDE.
  - `ideName` (chaîne, requise) : Un nom convivial pour l'IDE (par exemple, `VS Code`, `IDE JetBrains`).

- **Authentification :** Pour sécuriser la connexion, l'extension **DOIT** générer un jeton secret unique et l'inclure dans le fichier de découverte. La CLI inclura ensuite ce jeton dans l'en-tête `Authorization` pour toutes les requêtes vers le serveur MCP (par exemple, `Authorization: Bearer un-jeton-très-secret`). Votre serveur **DOIT** valider ce jeton à chaque requête et rejeter celles qui ne sont pas autorisées.
- **Variables d'environnement (requises) :** Votre extension **DOIT** définir `QWEN_CODE_IDE_SERVER_PORT` dans le terminal intégré pour que la CLI puisse localiser le fichier `<PORT>.lock` correct.

**Note sur l'héritage :** Pour les extensions antérieures à la version 0.5.1, Qwen Code peut revenir à la lecture de fichiers JSON dans le répertoire temporaire du système nommés `qwen-code-ide-server-<PID>.json` ou `qwen-code-ide-server-<PORT>.json`. Les nouvelles intégrations ne devraient pas s'appuyer sur ces anciens fichiers.

## II. L'interface de contexte

Pour permettre la prise en compte du contexte, le plugin **PEUT** fournir à l'interface en ligne de commande des informations en temps réel sur l'activité de l'utilisateur dans l'IDE.

### Notification `ide/contextUpdate`

Le plugin **PEUT** envoyer une [notification](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) `ide/contextUpdate` au CLI chaque fois que le contexte de l'utilisateur change.

- **Événements déclencheurs :** Cette notification doit être envoyée (avec un délai de débouncing recommandé de 50 ms) lorsque :
  - Un fichier est ouvert, fermé ou mis au premier plan.
  - La position du curseur de l'utilisateur ou la sélection de texte change dans le fichier actif.
- **Charge utile (`IdeContext`) :** Les paramètres de notification **DOIVENT** être un objet `IdeContext` :

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
    // Horodatage Unix du dernier focus (pour l'ordre)
    timestamp: number;
    // Vrai si c'est le fichier actuellement mis au premier plan
    isActive?: boolean;
    cursor?: {
      // Numéro de ligne basé sur 1
      line: number;
      // Numéro de caractère basé sur 1
      character: number;
    };
    // Le texte actuellement sélectionné par l'utilisateur
    selectedText?: string;
  }
  ```

  **Remarque :** La liste `openFiles` ne doit inclure que les fichiers existant sur le disque. Les fichiers virtuels (par exemple, les fichiers non sauvegardés sans chemin, les pages de paramètres de l'éditeur) **DOIVENT** être exclus.

### Comment la CLI utilise ce contexte

Après avoir reçu l'objet `IdeContext`, la CLI effectue plusieurs étapes de normalisation et de troncature avant d'envoyer les informations au modèle.

- **Ordre des fichiers :** La CLI utilise le champ `timestamp` pour déterminer les fichiers les plus récemment utilisés. Elle trie la liste `openFiles` selon cette valeur. Par conséquent, votre plugin **DOIT** fournir un horodatage Unix précis indiquant quand un fichier a été focalisé pour la dernière fois.
- **Fichier actif :** La CLI considère uniquement le fichier le plus récent (après tri) comme étant le fichier "actif". Elle ignorera le drapeau `isActive` sur tous les autres fichiers et effacera leurs champs `cursor` et `selectedText`. Votre plugin devrait se concentrer sur la définition de `isActive: true` et la fourniture des détails du curseur/sélection uniquement pour le fichier actuellement focalisé.
- **Troncature :** Pour gérer les limites de jetons, la CLI tronque à la fois la liste des fichiers (à 10 fichiers) et le `selectedText` (à 16 Ko).

Bien que la CLI gère la troncature finale, il est fortement recommandé que votre plugin limite également la quantité de contexte qu'il envoie.

## III. L'interface de comparaison

Pour permettre les modifications de code interactives, le plugin **PEUT** exposer une interface de comparaison. Cela permet au CLI de demander à l'IDE d'ouvrir une vue de comparaison, affichant les modifications proposées pour un fichier. L'utilisateur peut alors examiner, modifier et finalement accepter ou rejeter ces modifications directement dans l'IDE.

### Outil `openDiff`

Le plugin **DOIT** enregistrer un outil `openDiff` sur son serveur MCP.

- **Description :** Cet outil indique à l'IDE d'ouvrir une vue de différence modifiable pour un fichier spécifique.
- **Requête (`OpenDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans le `params` de la requête **DOIT** être un objet `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // Le chemin absolu vers le fichier à comparer.
    filePath: string;
    // Le nouveau contenu proposé pour le fichier.
    newContent: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** immédiatement retourner un `CallToolResult` pour confirmer la requête et indiquer si la vue de différence a été ouverte avec succès.
  - En cas de succès : Si la vue de différence a été ouverte avec succès, la réponse **DOIT** contenir un contenu vide (c'est-à-dire `content: []`).
  - En cas d'échec : Si une erreur a empêché l'ouverture de la vue de différence, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

  Le résultat final de la différence (acceptation ou rejet) est communiqué de manière asynchrone via des notifications.

### Outil `closeDiff`

Le plugin **DOIT** enregistrer un outil `closeDiff` sur son serveur MCP.

- **Description :** Cet outil indique à l'IDE de fermer une vue de différences ouverte pour un fichier spécifique.
- **Requête (`CloseDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans les `params` de la requête **DOIT** être un objet `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // Le chemin absolu vers le fichier dont la vue de différences doit être fermée.
    filePath: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** retourner un `CallToolResult`.
  - En cas de succès : Si la vue de différences a été fermée avec succès, la réponse **DOIT** inclure un seul bloc **TextContent** dans le tableau de contenu contenant le contenu final du fichier avant la fermeture.
  - En cas d'échec : Si une erreur a empêché la fermeture de la vue de différences, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

### Notification `ide/diffAccepted`

Lorsque l'utilisateur accepte les modifications dans une vue de différences (par exemple, en cliquant sur un bouton "Appliquer" ou "Enregistrer"), le plugin **DOIT** envoyer une notification `ide/diffAccepted` au CLI.

- **Charge utile :** Les paramètres de notification **DOIVENT** inclure le chemin du fichier et le contenu final du fichier. Le contenu peut différer du `newContent` original si l'utilisateur a effectué des modifications manuelles dans la vue de différences.

  ```typescript
  {
    // Le chemin absolu vers le fichier qui a été comparé.
    filePath: string;
    // Le contenu complet du fichier après l'acceptation.
    content: string;
  }
  ```

### Notification `ide/diffRejected`

Lorsque l'utilisateur rejette les modifications (par exemple, en fermant la vue de différences sans accepter), le plugin **DOIT** envoyer une notification `ide/diffRejected` au CLI.

- **Charge utile :** Les paramètres de notification **DOIVENT** inclure le chemin du fichier de la différence rejetée.

  ```typescript
  {
    // Le chemin absolu vers le fichier qui a été comparé.
    filePath: string;
  }
  ```

## IV. L'interface de cycle de vie

Le plugin **DOIT** gérer correctement ses ressources et le fichier de découverte en fonction du cycle de vie de l'IDE.

- **À l'activation (démarrage de l'IDE/activation du plugin) :**
  1.  Démarrer le serveur MCP.
  2.  Créer le fichier de découverte.
- **À la désactivation (arrêt de l'IDE/désactivation du plugin) :**
  1.  Arrêter le serveur MCP.
  2.  Supprimer le fichier de découverte.