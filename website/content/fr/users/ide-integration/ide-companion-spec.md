# Plugin Compagnon Qwen Code : Spécification de l’interface

> Dernière mise à jour : 15 septembre 2025

Ce document définit le contrat permettant de développer un plugin compagnon pour activer le mode IDE de Qwen Code. Dans VS Code, ces fonctionnalités (diff natif, prise en compte du contexte) sont fournies par l’extension officielle ([marché](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)). Cette spécification s’adresse aux contributeurs souhaitant intégrer des fonctionnalités similaires dans d’autres éditeurs, tels que les IDE JetBrains, Sublime Text, etc.

## I. Interface de communication

Qwen Code et le plugin IDE communiquent via un canal de communication local.

### 1. Couche de transport : MCP sur HTTP

Le plugin **DOIT** exécuter un serveur HTTP local implémentant le **Model Context Protocol (MCP)**.

- **Protocole :** Le serveur doit être un serveur MCP valide. Nous recommandons d’utiliser un SDK MCP existant pour votre langage de prédilection, si disponible.
- **Point de terminaison :** Le serveur doit exposer un seul point de terminaison (par exemple, `/mcp`) pour toutes les communications MCP.
- **Port :** Le serveur **DOIT** écouter sur un port attribué dynamiquement (c’est-à-dire écouter sur le port `0`).

### 2. Mécanisme de découverte : le fichier de verrouillage

Pour que Qwen Code puisse établir une connexion, il doit d’abord identifier le port utilisé par votre serveur. Le plugin **DOIT ABSOLUMENT** faciliter cette découverte en créant un « fichier de verrouillage » et en définissant la variable d’environnement du port.

- **Comment l’interface CLI localise le fichier :** L’interface CLI lit d’abord le port depuis la variable `QWEN_CODE_IDE_SERVER_PORT`, puis lit le fichier `~/.qwen/ide/<PORT>.lock`. (Des mécanismes de secours hérités existent pour les anciennes extensions ; voir la note ci-dessous.)
- **Emplacement du fichier :** Le fichier doit être créé dans un répertoire spécifique : `~/.qwen/ide/`. Votre plugin doit créer ce répertoire s’il n’existe pas.
- **Convention de nommage du fichier :** Le nom du fichier est critique et **DOIT ABSOLUMENT** suivre le modèle suivant :
  `<PORT>.lock`
  - `<PORT>` : le port sur lequel écoute votre serveur MCP.
- **Contenu du fichier et validation de l’espace de travail :** Le fichier **DOIT ABSOLUMENT** contenir un objet JSON respectant la structure suivante :

  ```json
  {
    "port": 12345,
    "workspacePath": "/chemin/vers/projet1:/chemin/vers/projet2",
    "authToken": "un-jeton-très-secret",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (nombre, requis) : le port du serveur MCP.
  - `workspacePath` (chaîne de caractères, requise) : liste de tous les chemins racines des espaces de travail ouverts, séparés par le séparateur de chemin propre au système d’exploitation (`:` sous Linux/macOS, `;` sous Windows). L’interface CLI utilise ce chemin pour vérifier qu’elle s’exécute dans le même dossier projet que celui ouvert dans l’IDE. Si le répertoire de travail actuel de l’interface CLI n’est pas un sous-répertoire de `workspacePath`, la connexion sera rejetée. Votre plugin **DOIT ABSOLUMENT** fournir les bons chemins absolus vers la racine des espaces de travail ouverts.
  - `authToken` (chaîne de caractères, requise) : un jeton secret permettant de sécuriser la connexion. L’interface CLI inclura ce jeton dans l’en-tête `Authorization: Bearer <token>` de toutes ses requêtes.
  - `ppid` (nombre, requis) : l’identifiant du processus parent du processus IDE.
  - `ideName` (chaîne de caractères, requise) : un nom convivial pour l’IDE (ex. : `VS Code`, `IDE JetBrains`).

- **Authentification :** Pour sécuriser la connexion, le plugin **DOIT ABSOLUMENT** générer un jeton secret unique et l’inclure dans le fichier de découverte. L’interface CLI inclura ensuite ce jeton dans l’en-tête `Authorization` de toutes ses requêtes vers le serveur MCP (ex. : `Authorization: Bearer un-jeton-très-secret`). Votre serveur **DOIT ABSOLUMENT** valider ce jeton à chaque requête et rejeter toute requête non autorisée.
- **Variables d’environnement (obligatoires) :** Votre plugin **DOIT ABSOLUMENT** définir la variable `QWEN_CODE_IDE_SERVER_PORT` dans le terminal intégré afin que l’interface CLI puisse localiser le bon fichier `<PORT>.lock`.

**Note concernant les versions héritées :** Pour les extensions antérieures à la version v0.5.1, Qwen Code peut revenir à la lecture de fichiers JSON situés dans le répertoire temporaire système, nommés `qwen-code-ide-server-<PID>.json` ou `qwen-code-ide-server-<PORT>.json`. Les nouvelles intégrations ne doivent pas compter sur ces fichiers hérités.

## II. Interface de contexte

Pour permettre la prise en compte du contexte, le plugin **PEUT** fournir à l’interface en ligne de commande (CLI) des informations en temps réel sur l’activité de l’utilisateur dans l’IDE.

### Notification `ide/contextUpdate`

La plug-in **PEUT** envoyer une notification `ide/contextUpdate` à l’interface en ligne de commande (CLI) chaque fois que le contexte de l’utilisateur change.

- **Événements déclencheurs :** Cette notification doit être envoyée (avec un délai de rebond recommandé de 50 ms) lorsqu’un des événements suivants se produit :
  - Un fichier est ouvert, fermé ou mis au premier plan.
  - La position du curseur ou la sélection de texte de l’utilisateur change dans le fichier actif.
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
    // Horodatage Unix de la dernière mise au premier plan (utilisé pour le tri)
    timestamp: number;
    // Valeur vraie si ce fichier est actuellement mis au premier plan
    isActive?: boolean;
    cursor?: {
      // Numéro de ligne (indexé à partir de 1)
      line: number;
      // Numéro de caractère (indexé à partir de 1)
      character: number;
    };
    // Texte actuellement sélectionné par l’utilisateur
    selectedText?: string;
  }
  ```

  **Remarque :** La liste `openFiles` ne doit inclure que les fichiers présents sur le disque. Les fichiers virtuels (par exemple, les fichiers non enregistrés sans chemin défini, ou les pages de paramètres de l’éditeur) **DOIVENT** être exclus.

### Comment l’interface CLI utilise ce contexte

Une fois l’objet `IdeContext` reçu, l’interface CLI effectue plusieurs étapes de normalisation et de troncature avant d’envoyer les informations au modèle.

- **Ordre des fichiers** : L’interface CLI utilise le champ `timestamp` pour déterminer les fichiers les plus récemment utilisés. Elle trie la liste `openFiles` selon cette valeur. Votre extension **DOIT ABSOLUMENT** fournir un horodatage Unix précis correspondant au moment où un fichier a été mis au premier plan pour la dernière fois.
- **Fichier actif** : L’interface CLI considère uniquement le fichier le plus récent (après tri) comme étant le « fichier actif ». Elle ignore le drapeau `isActive` sur tous les autres fichiers et efface leurs champs `cursor` et `selectedText`. Votre extension doit donc se concentrer sur la définition de `isActive: true`, ainsi que sur la fourniture des détails relatifs au curseur et à la sélection, uniquement pour le fichier actuellement mis au premier plan.
- **Troncature** : Afin de respecter les limites de jetons, l’interface CLI tronque à la fois la liste des fichiers (à 10 fichiers) et le champ `selectedText` (à 16 Ko).

Bien que l’interface CLI prenne en charge la troncature finale, il est fortement recommandé que votre extension limite également la quantité de contexte qu’elle transmet.

## III. Interface de comparaison des différences

Pour permettre des modifications interactives du code, le plugin **PEUT** exposer une interface de comparaison des différences (« diff »). Cela permet à l’interface en ligne de commande (CLI) de demander à l’IDE d’ouvrir une vue de comparaison, affichant les modifications proposées sur un fichier. L’utilisateur peut alors examiner, modifier et, en définitive, accepter ou rejeter ces modifications directement depuis l’IDE.

### Outil `openDiff`

Le plugin **DOIT** enregistrer un outil `openDiff` sur son serveur MCP.

- **Description :** Cet outil demande à l’IDE d’ouvrir une vue de comparaison (diff) modifiable pour un fichier spécifique.
- **Requête (`OpenDiffRequest`) :** L’outil est invoqué via une requête `tools/call`. Le champ `arguments` dans le champ `params` de la requête **DOIT** être un objet `OpenDiffRequest`.

  ```typescript
  interface OpenDiffRequest {
    // Le chemin absolu vers le fichier à comparer.
    filePath: string;
    // Le contenu proposé comme nouvelle version du fichier.
    newContent: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L’outil **DOIT** immédiatement renvoyer un `CallToolResult` pour confirmer la réception de la requête et indiquer si la vue de comparaison a bien été ouverte.
  - En cas de succès : Si la vue de comparaison a été ouverte avec succès, la réponse **DOIT** contenir un contenu vide (c’est-à-dire `content: []`).
  - En cas d’échec : Si une erreur a empêché l’ouverture de la vue de comparaison, la réponse **DOIT** avoir `isError: true` et inclure un bloc `TextContent` dans le tableau `content`, décrivant l’erreur.

  Le résultat final de la comparaison (acceptation ou rejet) est communiqué de façon asynchrone via des notifications.

### Outil `closeDiff`

Le plugin **DOIT ABSOLUMENT** enregistrer un outil `closeDiff` sur son serveur MCP.

- **Description :** Cet outil demande à l’IDE de fermer la vue de comparaison (diff) ouverte pour un fichier spécifique.
- **Requête (`CloseDiffRequest`) :** L’outil est invoqué via une requête `tools/call`. Le champ `arguments` dans le champ `params` de la requête **DOIT ABSOLUMENT** être un objet `CloseDiffRequest`.

  ```typescript
  interface CloseDiffRequest {
    // Le chemin absolu du fichier dont la vue de comparaison (diff) doit être fermée.
    filePath: string;
  }
  ```

- **Réponse (`CallToolResult`) :** L’outil **DOIT ABSOLUMENT** renvoyer un objet `CallToolResult`.
  - En cas de succès : Si la vue de comparaison (diff) a été fermée avec succès, la réponse **DOIT ABSOLUMENT** inclure un seul bloc **TextContent** dans le tableau `content`, contenant le contenu final du fichier avant sa fermeture.
  - En cas d’échec : Si une erreur a empêché la fermeture de la vue de comparaison (diff), la réponse **DOIT ABSOLUMENT** comporter `isError: true` et inclure un bloc `TextContent` dans le tableau `content`, décrivant l’erreur.

### Notification `ide/diffAccepted`

Lorsque l’utilisateur accepte les modifications dans une vue de différence (par exemple en cliquant sur un bouton « Appliquer » ou « Enregistrer »), le plugin **DOIT** envoyer une notification `ide/diffAccepted` à l’interface CLI.

- **Charge utile :** Les paramètres de la notification **DOIVENT** inclure le chemin d’accès au fichier et le contenu final de ce fichier. Ce contenu peut différer du `newContent` d’origine si l’utilisateur a effectué des modifications manuelles dans la vue de différence.

  ```typescript
  {
    // Le chemin absolu vers le fichier comparé.
    filePath: string;
    // Le contenu complet du fichier après acceptation.
    content: string;
  }
  ```

### Notification `ide/diffRejected`

Lorsque l’utilisateur rejette les modifications (par exemple en fermant la vue de différence sans les accepter), le plugin **DOIT** envoyer une notification `ide/diffRejected` à l’interface CLI.

- **Charge utile :** Les paramètres de la notification **DOIVENT** inclure le chemin d’accès au fichier concerné par la différence rejetée.

  ```typescript
  {
    // Le chemin absolu vers le fichier comparé.
    filePath: string;
  }
  ```

## IV. Interface du cycle de vie

Le plugin **DOIT** gérer correctement ses ressources et le fichier de découverte en fonction du cycle de vie de l’IDE.

- **À l’activation (démarrage de l’IDE ou activation du plugin) :**
  1.  Démarrer le serveur MCP.
  2.  Créer le fichier de découverte.
- **À la désactivation (arrêt de l’IDE ou désactivation du plugin) :**
  1.  Arrêter le serveur MCP.
  2.  Supprimer le fichier de découverte.