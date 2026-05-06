# Prise en charge du Language Server Protocol (LSP)

Qwen Code prend en charge nativement le Language Server Protocol (LSP), ce qui permet d'activer des fonctionnalités avancées d'intelligence du code telles que l'accès à la définition, la recherche de références, les diagnostics et les actions de code. Cette intégration permet à l'agent IA de mieux comprendre votre code et de fournir une assistance plus précise.

## Présentation

La prise en charge du LSP dans Qwen Code fonctionne en se connectant à des serveurs de langage qui comprennent votre code. Une fois les serveurs configurés via `.lsp.json` (ou des extensions), Qwen Code peut les démarrer et les utiliser pour :

- Accéder aux définitions des symboles
- Trouver toutes les références à un symbole
- Obtenir des informations au survol (documentation, informations de type)
- Afficher les messages de diagnostic (erreurs, avertissements)
- Accéder aux actions de code (correctifs rapides, refactorisations)
- Analyser les hiérarchies d'appels

## Démarrage rapide

Le LSP est une fonctionnalité expérimentale dans Qwen Code. Pour l'activer, utilisez l'indicateur de ligne de commande `--experimental-lsp` :

```bash
qwen --experimental-lsp
```

Les serveurs LSP sont pilotés par la configuration. Vous devez les définir dans `.lsp.json` (ou via des extensions) pour que Qwen Code puisse les démarrer.

### Prérequis

Vous devez avoir installé le serveur de langage correspondant à votre langage de programmation :

| Langage               | Serveur de langage         | Commande d'installation                                                          |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                           |
| Python                | pylsp                      | `pip install python-lsp-server`                                                  |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                     |
| Rust                  | rust-analyzer              | [Guide d'installation](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | Installez LLVM/clangd via votre gestionnaire de paquets                          |
| Java                  | jdtls                      | Installez JDTLS et un JDK                                                        |

## Configuration

### Fichier `.lsp.json`

Vous pouvez configurer les serveurs de langage à l'aide d'un fichier `.lsp.json` à la racine de votre projet. Chaque clé de premier niveau est un identifiant de langage, et sa valeur est l'objet de configuration du serveur.

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

### Configuration C/C++ (clangd)

Dépendances :

- clangd (LLVM) doit être installé et disponible dans le `PATH`.
- Une base de données de compilation (`compile_commands.json`) ou un fichier `compile_flags.txt` est requis pour obtenir des résultats précis.

Exemple :

```json
{
  "cpp": {
    "command": "clangd",
    "args": [
      "--background-index",
      "--clang-tidy",
      "--header-insertion=iwyu",
      "--completion-style=detailed"
    ]
  }
}
```

### Configuration Java (jdtls)

Dépendances :

- JDK installé et disponible dans le `PATH` (`java`).
- JDTLS installé et disponible dans le `PATH` (`jdtls`).

Exemple :

```json
{
  "java": {
    "command": "jdtls",
    "args": ["-configuration", ".jdtls-config", "-data", ".jdtls-workspace"]
  }
}
```

### Options de configuration

#### Champs obligatoires

| Option    | Type   | Description                                                                                                                                       |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Commande pour démarrer le serveur LSP. Prend en charge les noms de commande simples résolus via `PATH` (ex. `clangd`) et les chemins absolus (ex. `/opt/llvm/bin/clangd`) |

#### Champs facultatifs

| Option                  | Type     | Default   | Description                                             |
| ----------------------- | -------- | --------- | ------------------------------------------------------- |
| `args`                  | string[] | `[]`      | Arguments de ligne de commande                          |
| `transport`             | string   | `"stdio"` | Type de transport : `stdio`, `tcp` ou `socket`          |
| `env`                   | object   | -         | Variables d'environnement                               |
| `initializationOptions` | object   | -         | Options d'initialisation LSP                            |
| `settings`              | object   | -         | Paramètres du serveur via `workspace/didChangeConfiguration` |
| `extensionToLanguage`   | object   | -         | Associe les extensions de fichiers aux identifiants de langage |
| `workspaceFolder`       | string   | -         | Remplace le dossier de l'espace de travail (doit se trouver dans la racine du projet) |
| `startupTimeout`        | number   | `10000`   | Délai d'expiration au démarrage en millisecondes        |
| `shutdownTimeout`       | number   | `5000`    | Délai d'expiration à l'arrêt en millisecondes           |
| `restartOnCrash`        | boolean  | `false`   | Redémarrage automatique en cas de plantage              |
| `maxRestarts`           | number   | `3`       | Nombre maximal de tentatives de redémarrage             |
| `trustRequired`         | boolean  | `true`    | Exige un espace de travail approuvé                     |

### Transport TCP/Socket

Pour les serveurs utilisant un transport TCP ou socket Unix :

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

Qwen Code expose les fonctionnalités LSP via l'outil unifié `lsp`. Voici les opérations disponibles :

Les opérations basées sur l'emplacement (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` et `prepareCallHierarchy`) nécessitent une position exacte `filePath` + `line` + `character`. Si vous ne connaissez pas la position exacte, utilisez d'abord `workspaceSymbol` ou `documentSymbol` pour localiser le symbole.

### Navigation dans le code

#### Accéder à la définition

Trouve où un symbole est défini.

```
Operation: goToDefinition
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Rechercher les références

Trouve toutes les références à un symbole.

```
Operation: findReferences
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
  - includeDeclaration: Include the declaration itself (optional)
```

#### Accéder à l'implémentation

Trouve les implémentations d'une interface ou d'une méthode abstraite.

```
Operation: goToImplementation
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

### Informations sur les symboles

#### Survol

Obtient la documentation et les informations de type pour un symbole.

```
Operation: hover
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Symboles du document

Obtient tous les symboles d'un document.

```
Operation: documentSymbol
Parameters:
  - filePath: Path to the file
```

#### Recherche de symboles dans l'espace de travail

Recherche des symboles dans l'ensemble de l'espace de travail.

```
Operation: workspaceSymbol
Parameters:
  - query: Search query string
  - limit: Maximum results (optional)
```

### Hiérarchie d'appels

#### Préparer la hiérarchie d'appels

Obtient l'élément de hiérarchie d'appels à une position donnée.

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Appels entrants

Trouve toutes les fonctions qui appellent la fonction donnée.

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

#### Appels sortants

Trouve toutes les fonctions appelées par la fonction donnée.

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

### Diagnostics

#### Diagnostics de fichier

Obtient les messages de diagnostic (erreurs, avertissements) pour un fichier.

```
Operation: diagnostics
Parameters:
  - filePath: Path to the file
```

#### Diagnostics de l'espace de travail

Obtient tous les messages de diagnostic dans l'espace de travail.

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Maximum results (optional)
```

### Actions de code

#### Obtenir les actions de code

Obtient les actions de code disponibles (correctifs rapides, refactorisations) à un emplacement donné.

```
Operation: codeActions
Parameters:
  - filePath: Path to the file
  - line: Start line number (1-based)
  - character: Start column number (1-based)
  - endLine: End line number (optional, defaults to line)
  - endCharacter: End column (optional, defaults to character)
  - diagnostics: Diagnostics to get actions for (optional)
  - codeActionKinds: Filter by action kind (optional)
```

Types d'actions de code :

- `quickfix` - Correctifs rapides pour les erreurs/avertissements
- `refactor` - Opérations de refactoring
- `refactor.extract` - Extraire vers une fonction/variable
- `refactor.inline` - Intégrer (inline) une fonction/variable
- `source` - Actions sur le code source
- `source.organizeImports` - Organiser les imports
- `source.fixAll` - Corriger tous les problèmes corrigeables automatiquement

## Sécurité

Les serveurs LSP ne sont démarrés par défaut que dans les espaces de travail approuvés. En effet, les serveurs de langage s'exécutent avec vos permissions utilisateur et peuvent exécuter du code.

### Contrôles d'approbation

- **Espace de travail approuvé** : Les serveurs LSP démarrent s'ils sont configurés
- **Espace de travail non approuvé** : Les serveurs LSP ne démarrent pas sauf si `trustRequired: false` est défini dans la configuration du serveur

Pour marquer un espace de travail comme approuvé, utilisez la commande `/trust`.

### Remplacement de l'approbation par serveur

Vous pouvez remplacer les exigences d'approbation pour des serveurs spécifiques dans leur configuration :

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

1. **Vérifiez l'indicateur `--experimental-lsp`** : Assurez-vous d'utiliser cet indicateur lors du démarrage de Qwen Code
2. **Vérifiez si le serveur est installé** : Exécutez la commande manuellement (ex. `clangd --version`) pour vérifier
3. **Vérifiez la commande** : Le binaire du serveur doit se trouver dans le `PATH` de votre système, ou être spécifié comme un chemin absolu (ex. `/opt/llvm/bin/clangd`). Les chemins relatifs qui sortent de l'espace de travail sont bloqués
4. **Vérifiez l'approbation de l'espace de travail** : L'espace de travail doit être approuvé pour le LSP (utilisez `/trust`)
5. **Vérifiez les journaux** : Recherchez les entrées `[LSP]` dans le journal de débogage (voir la section Débogage ci-dessous)
6. **Vérifiez le processus** : Exécutez `ps aux | grep <server-name>` pour vérifier que le processus du serveur est en cours d'exécution

### Performances lentes

1. **Projets volumineux** : Pensez à exclure `node_modules` et les autres répertoires volumineux
2. **Délai d'expiration du serveur** : Augmentez `startupTimeout` dans la configuration du serveur pour les serveurs lents

### Aucun résultat

1. **Serveur non prêt** : Le serveur est peut-être encore en cours d'indexation. Pour les projets C/C++ avec clangd, assurez-vous que `--background-index` est présent dans les arguments et qu'un fichier `compile_commands.json` (ou `compile_flags.txt`) existe à la racine du projet ou dans un répertoire parent. Utilisez `--compile-commands-dir=<path>` s'il se trouve dans un sous-répertoire de build
2. **Fichier non enregistré** : Enregistrez votre fichier pour que le serveur prenne en compte les modifications
3. **Langage incorrect** : Vérifiez si le serveur correct est en cours d'exécution pour votre langage
4. **Vérifiez le processus** : Exécutez `ps aux | grep <server-name>` pour vérifier que le serveur est bien en cours d'exécution

### Débogage

Les journaux de débogage LSP sont automatiquement écrits dans les fichiers de journal de session dans `~/.qwen/debug/`. Pour vérifier les entrées liées au LSP :

```bash
# View the latest session log
grep '\[LSP\]' ~/.qwen/debug/latest

# Common error messages to look for:
#   "command path is unsafe"  → relative path escapes workspace, use absolute path or add to PATH
#   "command not found"       → server binary not installed or not in PATH
#   "requires trusted workspace" → run /trust first
```

Vous pouvez également vérifier que le processus du serveur est en cours d'exécution :

```bash
ps aux | grep clangd   # or typescript-language-server, jdtls, etc.
```

## Configuration LSP des extensions

Les extensions peuvent fournir des configurations de serveurs LSP via le champ `lspServers` dans leur `plugin.json`. Il peut s'agir d'un objet inline ou d'un chemin vers un fichier `.lsp.json`. Qwen Code charge ces configurations lorsque l'extension est activée. Le format reprend la même structure indexée par langage que celle utilisée dans les fichiers `.lsp.json` du projet.

## Bonnes pratiques

1. **Installez les serveurs de langage globalement** : Cela garantit qu'ils sont disponibles dans tous les projets
2. **Utilisez des paramètres spécifiques au projet** : Configurez les options du serveur par projet si nécessaire via `.lsp.json`
3. **Maintenez les serveurs à jour** : Mettez régulièrement à jour vos serveurs de langage pour de meilleurs résultats
4. **Approuvez avec prudence** : N'approuvez que les espaces de travail provenant de sources fiables

## FAQ

### Q : Comment activer le LSP ?

Utilisez l'indicateur `--experimental-lsp` lors du démarrage de Qwen Code :

```bash
qwen --experimental-lsp
```

### Q : Comment savoir quels serveurs de langage sont en cours d'exécution ?

Vérifiez les entrées `[LSP]` dans le journal de débogage (`grep '\[LSP\]' ~/.qwen/debug/latest`), ou vérifiez directement le processus avec `ps aux | grep <server-name>`.

### Q : Puis-je utiliser plusieurs serveurs de langage pour le même type de fichier ?

Oui, mais un seul sera utilisé pour chaque opération. Le premier serveur qui renvoie des résultats l'emporte.

### Q : Le LSP fonctionne-t-il en mode sandbox ?

Les serveurs LSP s'exécutent en dehors du sandbox pour accéder à votre code. Ils sont soumis aux contrôles d'approbation de l'espace de travail.