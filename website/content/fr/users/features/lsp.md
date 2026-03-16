# Prise en charge du protocole Language Server (LSP)

Qwen Code fournit une prise en charge native du protocole Language Server Protocol (LSP), ce qui permet d’activer des fonctionnalités avancées d’intelligence code telles que « aller à la définition », « rechercher les références », les diagnostics et les actions sur le code. Cette intégration permet à l’agent IA de mieux comprendre votre code et de fournir une assistance plus précise.

## Aperçu

La prise en charge du LSP dans Qwen Code fonctionne en se connectant à des serveurs de langage capables de comprendre votre code. Lorsque vous travaillez avec TypeScript, Python, Go ou tout autre langage pris en charge, Qwen Code peut automatiquement démarrer le serveur de langage approprié et l’utiliser pour :

- Accéder aux définitions des symboles  
- Rechercher toutes les références d’un symbole  
- Afficher les informations contextuelles (documentation, informations de type)  
- Visualiser les messages de diagnostic (erreurs, avertissements)  
- Accéder aux actions sur le code (correctifs rapides, refactorisations)  
- Analyser les hiérarchies d’appels

## Démarrage rapide

Le protocole LSP est une fonctionnalité expérimentale dans Qwen Code. Pour l’activer, utilisez l’indicateur de ligne de commande `--experimental-lsp` :

```bash
qwen --experimental-lsp
```

Pour la plupart des langages courants, Qwen Code détectera automatiquement le serveur de langage approprié s’il est installé sur votre système et le lancera.

### Prérequis

Vous devez avoir installé le serveur de langage correspondant à votre langage de programmation :

| Langage               | Serveur de langage         | Commande d’installation                                                      |
| --------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                       |
| Python                | pylsp                      | `pip install python-lsp-server`                                              |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                 |
| Rust                  | rust-analyzer              | [Guide d’installation](https://rust-analyzer.github.io/manual.html#installation) |

## Configuration

### Fichier `.lsp.json`

Vous pouvez configurer les serveurs de langage à l’aide d’un fichier `.lsp.json` à la racine de votre projet. Ce fichier utilise le format indexé par langage décrit dans la [référence de configuration LSP du plugin Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers).

**Format de base :**

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact"
    }
  }
}
```

### Options de configuration

#### Champs obligatoires

| Option                | Type   | Description                                       |
| --------------------- | ------ | ------------------------------------------------- |
| `command`             | chaîne | Commande permettant de démarrer le serveur LSP (doit être dans le `PATH`) |
| `extensionToLanguage` | objet  | Associe les extensions de fichiers aux identifiants de langage      |

#### Champs facultatifs

| Option                  | Type     | Valeur par défaut | Description                                            |
| ----------------------- | -------- | ----------------- | ------------------------------------------------------ |
| `args`                  | string[] | `[]`              | Arguments de ligne de commande                         |
| `transport`             | string   | `"stdio"`         | Type de transport : `stdio` ou `socket`                |
| `env`                   | objet    | -                 | Variables d’environnement                              |
| `initializationOptions` | objet    | -                 | Options d’initialisation du protocole LSP            |
| `settings`              | objet    | -                 | Paramètres du serveur via `workspace/didChangeConfiguration` |
| `workspaceFolder`       | chaîne   | -                 | Remplace le dossier de l’espace de travail             |
| `startupTimeout`        | nombre   | `10000`           | Délai d’attente (en millisecondes) pour le démarrage   |
| `shutdownTimeout`       | nombre   | `5000`            | Délai d’attente (en millisecondes) pour l’arrêt        |
| `restartOnCrash`        | booléen  | `false`           | Redémarrage automatique en cas de plantage             |
| `maxRestarts`           | nombre   | `3`               | Nombre maximal de tentatives de redémarrage            |
| `trustRequired`         | booléen  | `true`            | Exige un espace de travail approuvé                    |

### Transport TCP/Socket

Pour les serveurs qui utilisent le transport TCP ou socket Unix :

```json
{
  "remote-lsp": {
    "transport": "tcp",
    "socket": {
      "host": "127.0.0.1",
      "port": 9999
    },
    "extensionToLanguage": {
      ".custom": "custom"
    }
  }
}
```

## Opérations LSP disponibles

Qwen Code expose les fonctionnalités LSP via l’outil unifié `lsp`. Voici les opérations disponibles :

### Navigation dans le code

#### Aller à la définition

Rechercher l’emplacement où un symbole est défini.

```
Opération : goToDefinition
Paramètres :
  - filePath : Chemin du fichier
  - line : Numéro de ligne (indexé à partir de 1)
  - character : Numéro de colonne (indexé à partir de 1)
```

#### Rechercher les références

Rechercher toutes les références d’un symbole.

```
Opération : findReferences
Paramètres :
  - filePath : Chemin du fichier
  - line : Numéro de ligne (indexé à partir de 1)
  - character : Numéro de colonne (indexé à partir de 1)
  - includeDeclaration : Inclure la déclaration elle-même (facultatif)
```

#### Accéder à l’implémentation

Rechercher les implémentations d’une interface ou d’une méthode abstraite.

```
Opération : goToImplementation
Paramètres :
  - filePath : Chemin du fichier
  - line : Numéro de ligne (indexé à partir de 1)
  - character : Numéro de colonne (indexé à partir de 1)
```

### Informations sur les symboles

#### Affichage au survol

Obtenir la documentation et les informations de type associées à un symbole.

```
Opération : hover
Paramètres :
  - filePath : Chemin du fichier
  - line : Numéro de ligne (indexé à partir de 1)
  - character : Numéro de colonne (indexé à partir de 1)
```

#### Symboles du document

Récupérer tous les symboles présents dans un document.

```
Opération : documentSymbol
Paramètres :
  - filePath : Chemin du fichier
```

#### Recherche de symboles dans l’espace de travail

Rechercher des symboles dans l’ensemble de l’espace de travail.

```
Opération : workspaceSymbol
Paramètres :
  - query : Chaîne de recherche
  - limit : Nombre maximal de résultats (facultatif)
```

### Hiérarchie des appels

#### Préparer la hiérarchie des appels

Obtenir l’élément de hiérarchie des appels à une position donnée.

```
Opération : prepareCallHierarchy
Paramètres :
  - filePath : Chemin d’accès au fichier
  - line : Numéro de ligne (indexé à partir de 1)
  - character : Numéro de colonne (indexé à partir de 1)
```

#### Appels entrants

Rechercher toutes les fonctions qui appellent la fonction donnée.

```
Opération : incomingCalls
Paramètres :
  - callHierarchyItem : Élément issu de prepareCallHierarchy
```

#### Appels sortants

Rechercher toutes les fonctions appelées par la fonction donnée.

```
Opération : outgoingCalls
Paramètres :
  - callHierarchyItem : Élément issu de prepareCallHierarchy
```

### Diagnostics

#### Diagnostics du fichier

Récupérer les messages de diagnostic (erreurs, avertissements) pour un fichier.

```
Opération : diagnostics
Paramètres :
  - filePath : Chemin d’accès au fichier
```

#### Diagnostics de l’espace de travail

Récupérer tous les messages de diagnostic de l’ensemble de l’espace de travail.

```
Opération : workspaceDiagnostics
Paramètres :
  - limit : Nombre maximal de résultats (facultatif)
```

### Actions sur le code

#### Obtenir les actions sur le code

Obtenez les actions disponibles sur le code (corrections rapides, refactorisations) à un emplacement donné.

```
Opération : codeActions
Paramètres :
  - filePath : Chemin d’accès au fichier
  - line : Numéro de ligne de départ (indexé à partir de 1)
  - character : Numéro de colonne de départ (indexé à partir de 1)
  - endLine : Numéro de ligne de fin (facultatif, valeur par défaut : line)
  - endCharacter : Numéro de colonne de fin (facultatif, valeur par défaut : character)
  - diagnostics : Diagnostics pour lesquels récupérer les actions (facultatif)
  - codeActionKinds : Filtrer les actions par type (facultatif)
```

Types d’actions sur le code :

- `quickfix` — Corrections rapides pour les erreurs et avertissements  
- `refactor` — Opérations de refactorisation  
- `refactor.extract` — Extraction vers une fonction ou une variable  
- `refactor.inline` — Intégration en ligne d’une fonction ou d’une variable  
- `source` — Actions sur le code source  
- `source.organizeImports` — Organisation des instructions d’import  
- `source.fixAll` — Correction de tous les problèmes pouvant être corrigés automatiquement  

## Sécurité

Les serveurs LSP ne sont lancés que dans les espaces de travail approuvés, par défaut. En effet, les serveurs de langage s’exécutent avec vos droits utilisateur et peuvent exécuter du code.

### Contrôles de confiance

- **Espace de travail approuvé** : les serveurs LSP démarrent automatiquement.  
- **Espace de travail non approuvé** : les serveurs LSP ne démarrent pas, sauf si `trustRequired: false` est défini dans la configuration du serveur.

Pour marquer un espace de travail comme approuvé, utilisez la commande `/trust` ou configurez des dossiers approuvés dans les paramètres.

### Remplacement de la confiance par serveur

Vous pouvez remplacer les exigences de confiance pour des serveurs spécifiques dans leur configuration :

```json
{
  "safe-server": {
    "command": "safe-language-server",
    "args": ["--stdio"],
    "trustRequired": false,
    "extensionToLanguage": {
      ".safe": "safe"
    }
  }
}
```

## Dépannage

### Le serveur ne démarre pas

1. **Vérifiez si le serveur est installé** : exécutez la commande manuellement pour vérifier  
2. **Vérifiez le PATH** : assurez-vous que l’exécutable du serveur est présent dans le `PATH` de votre système  
3. **Vérifiez la confiance de l’espace de travail** : l’espace de travail doit être approuvé pour le protocole LSP  
4. **Consultez les journaux** : recherchez des messages d’erreur dans la sortie de la console  
5. **Vérifiez le drapeau `--experimental-lsp`** : assurez-vous d’utiliser ce drapeau lors du démarrage de Qwen Code  

### Performances lentes

1. **Projets volumineux** : envisagez d’exclure les répertoires `node_modules` et autres dossiers volumineux  
2. **Délai d’attente du serveur** : augmentez la valeur de `startupTimeout` dans la configuration du serveur pour les serveurs lents  

### Aucun résultat

1. **Serveur pas encore prêt** : le serveur peut encore être en cours d’indexation  
2. **Fichier non enregistré** : enregistrez votre fichier afin que le serveur détecte les modifications  
3. **Langage incorrect** : vérifiez que le serveur approprié est bien lancé pour votre langage

### Débogage

Activez la journalisation de débogage pour voir les échanges avec le protocole LSP :

```bash
DEBUG=lsp* qwen --experimental-lsp
```

Ou consultez le guide de débogage LSP dans `packages/cli/LSP_DEBUGGING_GUIDE.md`.

## Compatibilité avec Claude Code

Qwen Code prend en charge les fichiers de configuration `.lsp.json` au format « clé-langage », tel que défini dans la [référence des plugins Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers). Si vous migrez depuis Claude Code, utilisez la disposition « langage comme clé » dans votre configuration.

### Format de configuration

Le format recommandé suit la spécification de Claude Code :

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

Les extensions LSP de Claude Code peuvent également fournir la propriété `lspServers` dans `plugin.json` (ou dans un fichier `.lsp.json` référencé). Qwen Code charge ces configurations dès qu’une extension est activée ; celles-ci doivent obligatoirement utiliser le même format « clé-langage ».

## Bonnes pratiques

1. **Installez les serveurs de langage globalement** : cela garantit qu’ils sont disponibles dans tous les projets.
2. **Utilisez des paramètres spécifiques au projet** : configurez les options du serveur pour chaque projet, si nécessaire, via le fichier `.lsp.json`.
3. **Gardez les serveurs à jour** : mettez régulièrement à jour vos serveurs de langage pour obtenir les meilleurs résultats.
4. **Accordez votre confiance avec discernement** : ne faites confiance qu’aux espaces de travail provenant de sources fiables.

## FAQ

### Q : Comment activer le protocole LSP ?

Utilisez l’indicateur `--experimental-lsp` lors du démarrage de Qwen Code :

```bash
qwen --experimental-lsp
```

### Q : Comment savoir quels serveurs de langage sont en cours d’exécution ?

Utilisez la commande `/lsp status` pour afficher la liste de tous les serveurs de langage configurés et en cours d’exécution.

### Q : Puis-je utiliser plusieurs serveurs de langage pour le même type de fichier ?

Oui, mais un seul sera utilisé pour chaque opération. Le premier serveur à renvoyer un résultat l’emporte.

### Q : Le protocole LSP fonctionne-t-il en mode bac à sable ?

Les serveurs LSP s’exécutent en dehors du bac à sable afin d’accéder à votre code. Ils sont soumis aux contrôles de confiance liés à l’espace de travail.