# Support du Language Server Protocol (LSP)

Qwen Code offre une prise en charge native du Language Server Protocol (LSP), offrant des fonctionnalités avancées d'intelligence du code comme l'accès à la définition, la recherche des références, les diagnostics et les actions de code. Cette intégration permet à l'agent IA de comprendre votre code plus en profondeur et de fournir une assistance plus précise.

## Présentation

La prise en charge LSP dans Qwen Code fonctionne en se connectant à des serveurs de langage qui comprennent votre code. Une fois que vous configurez les serveurs via `.lsp.json` (ou des extensions), Qwen Code peut les lancer et les utiliser pour :

- Naviguer vers les définitions de symboles
- Trouver toutes les références d'un symbole
- Obtenir des informations au survol (documentation, type)
- Afficher les messages de diagnostic (erreurs, avertissements)
- Accéder aux actions de code (correctifs rapides, refactorisations)
- Analyser les hiérarchies d'appels

## Démarrage rapide

LSP est une fonctionnalité expérimentale dans Qwen Code. Pour l'activer, utilisez l'option de ligne de commande `--experimental-lsp` :

```bash
qwen --experimental-lsp
```

Les serveurs LSP sont pilotés par la configuration. Vous devez les définir dans `.lsp.json` (ou via des extensions) pour que Qwen Code les lance.

### Prérequis

Vous devez avoir installé le serveur de langage pour votre langage de programmation :

| Langage               | Serveur de langage         | Commande d'installation                                                       |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Guide d'installation](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | Installez LLVM/clangd via votre gestionnaire de paquets                        |
| Java                  | jdtls                      | Installez JDTLS et un JDK                                                      |

## Configuration

### Fichier .lsp.json

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

- clangd (LLVM) doit être installé et disponible dans le PATH.
- Une base de données de compilation (`compile_commands.json`) ou `compile_flags.txt` est nécessaire pour des résultats précis.

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

- JDK installé et disponible dans le PATH (`java`).
- JDTLS installé et disponible dans le PATH (`jdtls`).

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

| Option    | Type   | Description                                                                                                                                  |
| --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Commande pour lancer le serveur LSP. Accepte les noms de commandes simples résolus via le `PATH` (ex. `clangd`) et les chemins absolus (ex. `/opt/llvm/bin/clangd`) |

#### Champs optionnels

| Option                  | Type     | Défaut    | Description                                                |
| ----------------------- | -------- | --------- | ---------------------------------------------------------- |
| `args`                  | string[] | `[]`      | Arguments de la ligne de commande                          |
| `transport`             | string   | `"stdio"` | Type de transport : `stdio`, `tcp` ou `socket`             |
| `env`                   | object   | -         | Variables d'environnement                                  |
| `initializationOptions` | object   | -         | Options d'initialisation LSP                               |
| `settings`              | object   | -         | Paramètres du serveur via `workspace/didChangeConfiguration` |
| `extensionToLanguage`   | object   | -         | Associe les extensions de fichier aux identifiants de langage |
| `workspaceFolder`       | string   | -         | Remplace le dossier de l'espace de travail (doit être dans la racine du projet) |
| `startupTimeout`        | number   | `10000`   | Délai d'attente au démarrage en millisecondes              |
| `shutdownTimeout`       | number   | `5000`    | Délai d'attente à l'arrêt en millisecondes                 |
| `restartOnCrash`        | boolean  | `false`   | Redémarrage automatique en cas de crash                    |
| `maxRestarts`           | number   | `3`       | Nombre maximum de tentatives de redémarrage                |
| `trustRequired`         | boolean  | `true`    | Nécessite un espace de travail de confiance                |
### Transport TCP/Socket

Pour les serveurs utilisant le transport TCP ou socket Unix :

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

Les opérations basées sur une position (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` et `prepareCallHierarchy`) nécessitent une position exacte (`filePath` + `line` + `character`). Si vous ne connaissez pas la position exacte, utilisez d'abord `workspaceSymbol` ou `documentSymbol` pour localiser le symbole.

### Navigation dans le code

#### Aller à la définition

Rechercher où un symbole est défini.

```
Opération : goToDefinition
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (1-indexé)
  - character : Numéro de colonne (1-indexé)
```

#### Rechercher les références

Rechercher toutes les références d'un symbole.

```
Opération : findReferences
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (1-indexé)
  - character : Numéro de colonne (1-indexé)
  - includeDeclaration : Inclure la déclaration elle-même (optionnel)
```

#### Aller à l'implémentation

Rechercher les implémentations d'une interface ou d'une méthode abstraite.

```
Opération : goToImplementation
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (1-indexé)
  - character : Numéro de colonne (1-indexé)
```

### Informations sur les symboles

#### Hover

Obtenir la documentation et les informations de type pour un symbole.

```
Opération : hover
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (1-indexé)
  - character : Numéro de colonne (1-indexé)
```

#### Symboles du document

Obtenir tous les symboles d'un document.

```
Opération : documentSymbol
Paramètres :
  - filePath : Chemin vers le fichier
```

#### Recherche de symboles dans l'espace de travail

Rechercher des symboles dans tout l'espace de travail.

```
Opération : workspaceSymbol
Paramètres :
  - query : Chaîne de recherche
  - limit : Résultats maximum (optionnel)
```

### Hiérarchie d'appels

#### Préparer la hiérarchie d'appels

Obtenir l'élément de hiérarchie d'appels à une position.

```
Opération : prepareCallHierarchy
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (1-indexé)
  - character : Numéro de colonne (1-indexé)
```

#### Appels entrants

Rechercher toutes les fonctions qui appellent la fonction donnée.

```
Opération : incomingCalls
Paramètres :
  - callHierarchyItem : Élément de prepareCallHierarchy
```

#### Appels sortants

Rechercher toutes les fonctions appelées par la fonction donnée.

```
Opération : outgoingCalls
Paramètres :
  - callHierarchyItem : Élément de prepareCallHierarchy
```

### Diagnostics

#### Diagnostics du fichier

Obtenir les messages de diagnostic (erreurs, avertissements) pour un fichier.

```
Opération : diagnostics
Paramètres :
  - filePath : Chemin vers le fichier
```

#### Diagnostics de l'espace de travail

Obtenir tous les messages de diagnostic dans l'espace de travail.

```
Opération : workspaceDiagnostics
Paramètres :
  - limit : Résultats maximum (optionnel)
```

### Actions de code

#### Obtenir les actions de code

Obtenir les actions de code disponibles (correctifs rapides, refactorisations) à un emplacement.

```
Opération : codeActions
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne de début (1-indexé)
  - character : Numéro de colonne de début (1-indexé)
  - endLine : Numéro de ligne de fin (optionnel, par défaut : line)
  - endCharacter : Numéro de colonne de fin (optionnel, par défaut : character)
  - diagnostics : Diagnostics pour lesquels obtenir des actions (optionnel)
  - codeActionKinds : Filtrer par type d'action (optionnel)
```

Types d'actions de code :

- `quickfix` - Correctifs rapides pour erreurs/avertissements
- `refactor` - Opérations de refactorisation
- `refactor.extract` - Extraction vers une fonction/variable
- `refactor.inline` - Inline d'une fonction/variable
- `source` - Actions de code source
- `source.organizeImports` - Organiser les imports
- `source.fixAll` - Corriger tous les problèmes auto-corrigeables

## Sécurité

Par défaut, les serveurs LSP sont uniquement démarrés dans les espaces de travail de confiance. En effet, les serveurs de langage s'exécutent avec vos permissions utilisateur et peuvent exécuter du code.

### Contrôles de confiance

- **Espace de travail de confiance** : les serveurs LSP démarrent s'ils sont configurés
- **Espace de travail non fiable** : les serveurs LSP ne démarrent pas sauf si `trustRequired: false` est défini dans la configuration du serveur

Pour marquer un espace de travail comme de confiance, utilisez la commande `/trust`.

### Surcharge de confiance par serveur

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

1. **Vérifiez le flag `--experimental-lsp`** : assurez-vous d'utiliser ce flag au démarrage de Qwen Code
2. **Vérifiez si le serveur est installé** : exécutez la commande manuellement (par ex. `clangd --version`) pour vérifier
3. **Vérifiez la commande** : le binaire du serveur doit se trouver dans votre `PATH` système, ou être spécifié sous forme de chemin absolu (par ex. `/opt/llvm/bin/clangd`). Les chemins relatifs qui sortent de l'espace de travail sont bloqués.
4. **Vérifiez la confiance de l'espace de travail** : l'espace de travail doit être de confiance pour LSP (utilisez `/trust`)
5. **Vérifiez les logs** : démarrez Qwen Code avec `--debug`, puis recherchez les entrées relatives à LSP dans le journal de débogage (voir la section Débogage ci-dessous)
6. **Vérifiez le processus** : exécutez `ps aux | grep <nom-du-serveur>` pour vérifier que le processus du serveur est en cours d'exécution
### Performances lentes

1. **Projets volumineux** : Pensez à exclure `node_modules` et autres gros répertoires.
2. **Délai d'attente du serveur** : Augmentez `startupTimeout` dans la configuration du serveur pour les serveurs lents.

### Aucun résultat

1. **Serveur pas prêt** : Le serveur est peut-être encore en indexation. Pour les projets C/C++ avec clangd, vérifiez que `--background-index` est dans les arguments et qu'un fichier `compile_commands.json` (ou `compile_flags.txt`) existe à la racine du projet ou dans un répertoire parent. Utilisez `--compile-commands-dir=<chemin>` s'il se trouve dans un sous-répertoire de build.
2. **Fichier non enregistré** : Enregistrez votre fichier pour que le serveur prenne en compte les modifications.
3. **Mauvais langage** : Vérifiez que le serveur correct est en cours d'exécution pour votre langage.
4. **Vérifiez le processus** : Exécutez `ps aux | grep <nom-serveur>` pour vérifier que le serveur tourne bien.

### Débogage

LSP n'a pas de drapeau de débogage séparé. Utilisez le mode débogage normal de Qwen Code avec le drapeau de fonctionnalité LSP :

```bash
qwen --experimental-lsp --debug
```

Les journaux de débogage sont écrits dans le répertoire des journaux de débogage de la session. Pour vérifier les entrées liées à LSP :

```bash
# Répertoire d'exécution par défaut
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# Ou, sans ripgrep :
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# Si QWEN_RUNTIME_DIR est configuré
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

Les entrées utiles incluent :

- `[LSP] ...` : Journaux émis par le service LSP natif et le gestionnaire de serveurs.
- `[CONFIG] Native LSP status after discovery: ...` : Configuration du serveur LSP découverte pour la session.
- `[CONFIG] Native LSP status after startup: ...` : Résultat du démarrage du serveur, y compris les compteurs de serveurs prêts/échoués.
- `[STATUS] LSP status snapshot for /status: ...` : Instantané d'état affiché lors de l'exécution de `/status` en mode débogage.

Vous pouvez aussi exécuter `/status` dans le CLI pour voir un bref résumé LSP :

```text
LSP: disabled
LSP: enabled, 1/1 ready
LSP: enabled, 0/1 ready (1 failed)
LSP: enabled, no servers configured
LSP: enabled, status unavailable
```

Pour les détails par serveur, exécutez `/lsp` :

```text
**LSP Server Status**

| Server | Command | Languages | Status |
|--------|---------|-----------|--------|
| clangd | `clangd` | c, cpp | READY |
| pyright | `pyright-langserver` | python | FAILED - startup failed |
```

Messages d'erreur courants à rechercher :

```text
command path is unsafe        -> relative path escapes workspace, use absolute path or add to PATH
command not found             -> server binary not installed or not in PATH
requires trusted workspace    -> run /trust first
LSP connection closed         -> server started but exited or closed stdio before replying to initialize
```

En cas d'échec de démarrage de clangd, vérifiez le serveur directement depuis la racine du projet :

```bash
clangd --version
clangd --check=/chemin/vers/fichier.cpp --log=verbose
```

Les projets C/C++ devraient généralement fournir un fichier `compile_commands.json` ou `compile_flags.txt`. Si la base de données de compilation se trouve dans un répertoire de build, transmettez-la à clangd :

```json
{
  "cpp": {
    "command": "clangd",
    "args": ["--background-index", "--compile-commands-dir=build"]
  }
}
```

```bash
ps aux | grep clangd   # ou typescript-language-server, jdtls, etc.
```

## Configuration LSP des extensions

Les extensions peuvent fournir des configurations de serveur LSP via le champ `lspServers` dans leur `plugin.json`. Cela peut être soit un objet en ligne, soit un chemin vers un fichier `.lsp.json`. Qwen Code charge ces configurations lorsque l'extension est activée. Le format est la même disposition par clé de langage utilisée dans les fichiers `.lsp.json` de projet.

## Bonnes pratiques

1. **Installez les serveurs de langage globalement** : Cela garantit leur disponibilité dans tous les projets.
2. **Utilisez des paramètres spécifiques au projet** : Configurez les options du serveur par projet si nécessaire via `.lsp.json`.
3. **Maintenez les serveurs à jour** : Mettez régulièrement à jour vos serveurs de langage pour de meilleurs résultats.
4. **Approuvez avec précaution** : N'approuvez que les espaces de travail provenant de sources fiables.

## FAQ

### Q : Comment activer LSP ?

Utilisez le drapeau `--experimental-lsp` au démarrage de Qwen Code :

```bash
qwen --experimental-lsp
```

### Q : Comment savoir quels serveurs de langage sont en cours d'exécution ?

Démarrez Qwen Code avec le mode LSP et débogage activés :

```bash
qwen --experimental-lsp --debug
```

Exécutez ensuite `/status` pour un bref résumé, `/lsp` pour l'état par serveur, ou inspectez le journal de débogage :

```bash
# Répertoire d'exécution par défaut
rg "LSP|Native LSP|<nom-serveur>" ~/.qwen/debug/latest
# Ou :
grep -E "LSP|Native LSP|<nom-serveur>" ~/.qwen/debug/latest

# Si QWEN_RUNTIME_DIR est configuré
rg "LSP|Native LSP|<nom-serveur>" "$QWEN_RUNTIME_DIR/debug/latest"
```

LSP utilise le mode `--debug` normal de Qwen Code ; il n'y a pas de drapeau de débogage LSP séparé.

### Q : Puis-je utiliser plusieurs serveurs de langage pour le même type de fichier ?

Oui, mais un seul sera utilisé pour chaque opération. Le premier serveur qui renvoie des résultats l'emporte.

### Q : LSP fonctionne-t-il en mode sandbox ?

Les serveurs LSP s'exécutent en dehors du sandbox pour accéder à votre code. Ils sont soumis aux contrôles de confiance de l'espace de travail.
