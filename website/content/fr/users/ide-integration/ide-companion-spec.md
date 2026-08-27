# Spécification de l'interface du plugin compagnon Qwen Code

> Dernière mise à jour : 15 septembre 2025

Ce document définit le contrat pour construire un plugin compagnon afin d'activer le mode IDE de Qwen Code. Pour VS Code, ces fonctionnalités (diff natif, connaissance du contexte) sont fournies par l'extension officielle ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Cette spécification s'adresse aux contributeurs souhaitant apporter des fonctionnalités similaires à d'autres éditeurs comme les IDE JetBrains, Sublime Text, etc.

## I. L'interface de communication

Qwen Code et le plugin IDE communiquent via un canal de communication local.

### 1. Couche de transport : MCP sur HTTP

Le plugin **DOIT** exécuter un serveur HTTP local qui implémente le **Model Context Protocol (MCP)**.

- **Protocole :** Le serveur doit être un serveur MCP valide. Nous vous recommandons d'utiliser un SDK MCP existant pour votre langage de prédilection si disponible.
- **Point d'accès :** Le serveur doit exposer un seul point d'accès (par ex., `/mcp`) pour toute communication MCP.
- **Port :** Le serveur **DOIT** écouter sur un port attribué dynamiquement (c'est-à-dire écouter sur le port `0`).

### 2. Mécanisme de découverte : le fichier de verrou

Pour que Qwen Code se connecte, il doit découvrir le port utilisé par votre serveur. Le plugin **DOIT** faciliter cela en créant un « fichier de verrou » et en définissant la variable d'environnement du port.

- **Comment l'interface en ligne de commande trouve le fichier :** L'interface en ligne de commande lit le port depuis `QWEN_CODE_IDE_SERVER_PORT`, puis lit `~/.qwen/ide/<PORT>.lock`. (Des solutions de repli héritées existent pour les anciennes extensions ; voir la note ci-dessous.)
- **Emplacement du fichier :** Le fichier doit être créé dans un répertoire spécifique : `~/.qwen/ide/`. Votre plugin doit créer ce répertoire s'il n'existe pas.
- **Convention de nommage du fichier :** Le nom du fichier est critique et **DOIT** suivre le modèle :
  `<PORT>.lock`
  - `<PORT>` : Le port sur lequel votre serveur MCP écoute.
- **Contenu du fichier et validation de l'espace de travail :** Le fichier **DOIT** contenir un objet JSON avec la structure suivante :

  ```json
  {
    "port": 12345,
    "workspacePath": "/chemin/vers/projet1:/chemin/vers/projet2",
    "authToken": "un-token-tres-secret",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (number, requis) : Le port du serveur MCP.
  - `workspacePath` (string, requis) : Une liste de tous les chemins racines des espaces de travail ouverts, délimités par le séparateur de chemin spécifique au système d'exploitation (`:` pour Linux/macOS, `;` pour Windows). L'interface en ligne de commande utilise ce chemin pour s'assurer qu'elle s'exécute dans le même dossier de projet que celui ouvert dans l'IDE. Si le répertoire de travail actuel de l'interface en ligne de commande n'est pas un sous-répertoire de `workspacePath`, la connexion sera rejetée. Votre plugin **DOIT** fournir le(s) chemin(s) absolu(s) correct(s) vers la racine du/des espace(s) de travail ouvert(s).
  - `authToken` (string, requis) : Un token secret pour sécuriser la connexion. L'interface en ligne de commande inclura ce token dans un en-tête `Authorization: Bearer <token>` sur toutes les requêtes.
  - `ppid` (number, requis) : L'ID du processus parent du processus IDE.
  - `ideName` (string, requis) : Un nom convivial pour l'IDE (par ex., `VS Code`, `JetBrains IDE`).

- **Authentification :** Pour sécuriser la connexion, le plugin **DOIT** générer un token secret unique et l'inclure dans le fichier de découverte. L'interface en ligne de commande inclura ensuite ce token dans l'en-tête `Authorization` pour toutes les requêtes au serveur MCP (par ex., `Authorization: Bearer un-token-tres-secret`). Votre serveur **DOIT** valider ce token à chaque requête et rejeter toute requête non autorisée.
- **Variables d'environnement (requises) :** Votre plugin **DOIT** définir `QWEN_CODE_IDE_SERVER_PORT` dans le terminal intégré afin que l'interface en ligne de commande puisse localiser le fichier `<PORT>.lock` correct.

**Note héritée :** Pour les extensions antérieures à la v0.5.1, Qwen Code peut revenir à la lecture de fichiers JSON dans le répertoire temporaire système nommés `qwen-code-ide-server-<PID>.json` ou `qwen-code-ide-server-<PORT>.json`. Les nouvelles intégrations ne doivent pas compter sur ces fichiers hérités.

## II. L'interface de contexte

Pour permettre la connaissance du contexte, le plugin **PEUT** fournir à l'interface en ligne de commande des informations en temps réel sur l'activité de l'utilisateur dans l'IDE.

### Notification `ide/contextUpdate`

Le plugin **PEUT** envoyer une notification `ide/contextUpdate` [notification](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) à l'interface en ligne de commande à chaque changement du contexte utilisateur.

- **Événements déclencheurs :** Cette notification doit être envoyée (avec un délai d'anti-rebond recommandé de 50 ms) lorsque :
  - Un fichier est ouvert, fermé ou mis au point.
  - La position du curseur ou la sélection de texte de l'utilisateur change dans le fichier actif.
- **Charge utile (`IdeContext`) :** Les paramètres de la notification **DOIVENT** être un objet `IdeContext` :

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // Chemin absolu du fichier
    path: string;
    // Dernier horodatage Unix de mise au point (pour le classement)
    timestamp: number;
    // True si c'est le fichier actuellement mis au point
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

  **Remarque :** La liste `openFiles` ne doit inclure que les fichiers existant sur le disque. Les fichiers virtuels (par ex., fichiers non enregistrés sans chemin, pages de paramètres de l'éditeur) **DOIVENT** être exclus.

### Comment l'interface en ligne de commande utilise ce contexte

Après avoir reçu l'objet `IdeContext`, l'interface en ligne de commande effectue plusieurs étapes de normalisation et de troncature avant d'envoyer les informations au modèle.

- **Classement des fichiers :** L'interface en ligne de commande utilise le champ `timestamp` pour déterminer les fichiers les plus récemment utilisés. Elle trie la liste `openFiles` en fonction de cette valeur. Par conséquent, votre plugin **DOIT** fournir un horodatage Unix précis pour la dernière mise au point d'un fichier.
- **Fichier actif :** L'interface en ligne de commande ne considère que le fichier le plus récent (après tri) comme étant le fichier « actif ». Elle ignorera le drapeau `isActive` sur tous les autres fichiers et effacera leurs champs `cursor` et `selectedText`. Votre plugin doit se concentrer sur la définition de `isActive: true` et fournir les détails du curseur/de la sélection uniquement pour le fichier actuellement mis au point.
- **Troncature :** Pour gérer les limites de jetons, l'interface en ligne de commande tronque à la fois la liste des fichiers (à 10 fichiers) et le `selectedText` (à 16 Ko).

Bien que l'interface en ligne de commande gère la troncature finale, il est fortement recommandé que votre plugin limite également la quantité de contexte qu'il envoie.

## III. L'interface de diff

Pour permettre des modifications de code interactives, le plugin **PEUT** exposer une interface de diff. Cela permet à l'interface en ligne de commande de demander à l'IDE d'ouvrir une vue de différences, montrant les modifications proposées à un fichier. L'utilisateur peut ensuite examiner, modifier et finalement accepter ou rejeter ces modifications directement dans l'IDE.

### Outil `openDiff`

Le plugin **DOIT** enregistrer un outil `openDiff` sur son serveur MCP.

- **Description :** Cet outil demande à l'IDE d'ouvrir une vue de différences modifiable pour un fichier spécifique.
- **Requête (`OpenDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans les `params` de la requête **DOIT** être un objet `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // Le chemin absolu du fichier à différencier.
    filePath: string;
    // Le nouveau contenu proposé pour le fichier.
    newContent: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** retourner immédiatement un `CallToolResult` pour accuser réception de la requête et signaler si la vue de différences a été ouverte avec succès.
  - En cas de succès : Si la vue de différences a été ouverte avec succès, la réponse **DOIT** contenir un contenu vide (c'est-à-dire `content: []`).
  - En cas d'échec : Si une erreur a empêché l'ouverture de la vue de différences, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

  Le résultat réel du diff (acceptation ou rejet) est communiqué de manière asynchrone via des notifications.

### Outil `closeDiff`

Le plugin **DOIT** enregistrer un outil `closeDiff` sur son serveur MCP.

- **Description :** Cet outil demande à l'IDE de fermer une vue de différences ouverte pour un fichier spécifique.
- **Requête (`CloseDiffRequest`) :** L'outil est invoqué via une requête `tools/call`. Le champ `arguments` dans les `params` de la requête **DOIT** être un objet `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // Le chemin absolu du fichier dont la vue de différences doit être fermée.
    filePath: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L'outil **DOIT** retourner un `CallToolResult`.
  - En cas de succès : Si la vue de différences a été fermée avec succès, la réponse **DOIT** inclure un seul bloc **TextContent** dans le tableau `content` contenant le contenu final du fichier avant la fermeture.
  - En cas d'échec : Si une erreur a empêché la fermeture de la vue de différences, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content` décrivant l'erreur.

### Notification `ide/diffAccepted`

Lorsque l'utilisateur accepte les modifications dans une vue de différences (par ex., en cliquant sur un bouton « Appliquer » ou « Enregistrer »), le plugin **DOIT** envoyer une notification `ide/diffAccepted` à l'interface en ligne de commande.

- **Charge utile :** Les paramètres de la notification **DOIVENT** inclure le chemin du fichier et le contenu final du fichier. Le contenu peut différer du `newContent` original si l'utilisateur a effectué des modifications manuelles dans la vue de différences.

  ```typescript
  {
    // Le chemin absolu du fichier qui a été différencié.
    filePath: string;
    // Le contenu complet du fichier après acceptation.
    content: string;
  }
  ```

### Notification `ide/diffRejected`

Lorsque l'utilisateur rejette les modifications (par ex., en fermant la vue de différences sans accepter), le plugin **DOIT** envoyer une notification `ide/diffRejected` à l'interface en ligne de commande.

- **Charge utile :** Les paramètres de la notification **DOIVENT** inclure le chemin du fichier du diff rejeté.

  ```typescript
  {
    // Le chemin absolu du fichier qui a été différencié.
    filePath: string;
  }
  ```

## IV. L'interface de cycle de vie

Le plugin **DOIT** gérer correctement ses ressources et le fichier de découverte en fonction du cycle de vie de l'IDE.

- **Lors de l'activation (démarrage de l'IDE / activation du plugin) :**
  1.  Démarrer le serveur MCP.
  2.  Créer le fichier de découverte.
- **Lors de la désactivation (arrêt de l'IDE / désactivation du plugin) :**
  1.  Arrêter le serveur MCP.
  2.  Supprimer le fichier de découverte.