# Prise en charge du Language Server Protocol (LSP)

Qwen Code offre une prise en charge native du Language Server Protocol (LSP), permettant des fonctionnalités avancées d'intelligence de code comme l'accès à la définition, la recherche de références, les diagnostics et les actions de code. Cette intégration permet à l'agent IA de comprendre votre code plus en profondeur et de fournir une assistance plus précise.

## Aperçu

Le support LSP dans Qwen Code fonctionne en se connectant à des serveurs de langage qui comprennent votre code. Une fois que vous avez configuré les serveurs via `.lsp.json` (ou des extensions), Qwen Code peut les démarrer et les utiliser pour :

- Naviguer vers les définitions de symboles
- Trouver toutes les références d'un symbole
- Obtenir des informations au survol (documentation, type)
- Voir les messages de diagnostic (erreurs, avertissements)
- Accéder aux actions de code (correctifs rapides, refactorisations)
- Analyser les hiérarchies d'appel

## Démarrage rapide

LSP est une fonctionnalité expérimentale dans Qwen Code. Pour l'activer, définissez `tools.lspEnabled` dans votre `settings.json` utilisateur :

```json
{
  "tools": {
    "lspEnabled": true
  }
}
```

Les hôtes qui acceptent les drapeaux de ligne de commande peuvent utiliser `--experimental-lsp` à la place — les deux sont équivalents, et `QWEN_CODE_ENABLE_LSP=1` / `QWEN_CODE_DISABLE_LSP=1` outrepassent les deux (désactive gagne). Seuls l'environnement de l'opérateur ou un `.env` dans le répertoire personnel peuvent définir ces deux variables ; un `.env` de projet ou une valeur `settings.env` est ignorée silencieusement. Le paramètre est lu uniquement au démarrage, donc le modifier nécessite un redémarrage ; il est honoré depuis les scopes utilisateur, système et système-par-défaut, jamais depuis un `.qwen/settings.json` de workspace, car l'activer permet à une session de lancer des serveurs de langage avec vos propres permissions. LSP est refusé catégoriquement en mode sans échec (`--safe-mode` / `QWEN_CODE_SAFE_MODE=1`), en mode nu, sur un hôte d'agent en lecture seule, dans un workspace SSH et dans un workspace provisoire, car ces modes ne font pas confiance au contenu du workspace qui déclare les serveurs. Déclarer des serveurs reste une décision de workspace/extension.

Les serveurs LSP sont pilotés par configuration. Vous devez les définir dans `.lsp.json` (ou via des extensions) pour que Qwen Code les démarre.

### Prérequis

Vous devez avoir installé le serveur de langage pour votre langage de programmation :

| Langage            | Serveur de langage        | Commande d'installation                                                         |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                          |
| Python             | pylsp                     | `pip install python-lsp-server`                                                 |
| Go                 | gopls                     | `go install golang.org/x/tools/gopls@latest`                                    |
| Rust               | rust-analyzer             | [Guide d'installation](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++              | clangd                    | Installez LLVM/clangd via votre gestionnaire de paquets                         |
| Java               | jdtls                     | Installez JDTLS et un JDK                                                       |
| C#                 | roslyn-language-server    | `dotnet tool install --global roslyn-language-server --prerelease` (.NET 10+)   |

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
- Une base de données de compilation (`compile_commands.json`) ou `compile_flags.txt` est requise pour des résultats précis.

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

### Configuration C# (Roslyn)

Dépendances :

- Runtime .NET 10 ou ultérieur (`dotnet --version`).
- L'outil global `roslyn-language-server` :
  `dotnet tool install --global roslyn-language-server --prerelease`. Consultez le
  [README du serveur de langage Roslyn](https://github.com/dotnet/roslyn/blob/main/src/LanguageServer/roslyn-language-server/README.md)
  pour les prérequis et options actuels.

Exemple :

```json
{
  "csharp": {
    "command": "roslyn-language-server",
    "args": ["--stdio", "--autoLoadProjects"],
    "extensionToLanguage": {
      ".cs": "csharp"
    }
  }
}
```

Sous Windows, l'outil global est installé sous forme de shim `cmd` dans
`%USERPROFILE%\.dotnet\tools`. Qwen Code démarre les serveurs sans shell, donc un
`roslyn-language-server` nu est trouvé par `where` mais échoue à se lancer. Utilisez
la forme shell ici :

```json
{
  "csharp": {
    "command": "cmd",
    "args": ["/c", "roslyn-language-server", "--stdio", "--autoLoadProjects"],
    "extensionToLanguage": {
      ".cs": "csharp"
    }
  }
}
```

Un chemin absolu vers l'exécutable réel sous
`%USERPROFILE%\.dotnet\tools\.store\roslyn-language-server\<version>\...`
fonctionne également.

### Options de configuration

#### Champs obligatoires

| Option    | Type   | Description                                                                                                                                       |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Commande pour démarrer le serveur LSP. Supporte les noms de commande simples résolus via `PATH` (ex: `clangd`) et les chemins absolus (ex: `/opt/llvm/bin/clangd`) |

#### Champs optionnels

| Option                  | Type     | Défaut     | Description                                                         |
| ----------------------- | -------- | ---------- | ------------------------------------------------------------------- |
| `args`                  | string[] | `[]`       | Arguments de ligne de commande                                      |
| `transport`             | string   | `"stdio"`  | Type de transport : `stdio`, `tcp` ou `socket`                      |
| `env`                   | object   | -          | Variables d'environnement                                           |
| `initializationOptions` | object   | -          | Options d'initialisation LSP                                        |
| `settings`              | object   | -          | Paramètres du serveur via `workspace/didChangeConfiguration`        |
| `extensionToLanguage`   | object   | -          | Mappe les extensions de fichier aux identifiants de langage         |
| `workspaceFolder`       | string   | -          | Remplace le dossier de l'espace de travail (doit se situer dans la racine du projet) |
| `startupTimeout`        | number   | `10000`    | Délai d'expiration au démarrage en millisecondes                    |
| `shutdownTimeout`       | number   | `5000`     | Délai d'expiration à l'arrêt en millisecondes                       |
| `restartOnCrash`        | boolean  | `false`    | Redémarrage automatique en cas de plantage                          |
| `maxRestarts`           | number   | `3`        | Nombre maximum de tentatives de redémarrage                         |
| `trustRequired`         | boolean  | `true`     | Exiger un espace de travail de confiance                            |

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

Les opérations basées sur la localisation (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` et `prepareCallHierarchy`) nécessitent une position exacte `filePath` + `line` + `character`. Si vous ne connaissez pas la position exacte, utilisez d'abord `workspaceSymbol` ou `documentSymbol` pour localiser le symbole.

### Navigation dans le code

#### Aller à la définition

Trouver où un symbole est défini.

```
Opération : goToDefinition
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (base 1)
  - character : Numéro de colonne (base 1)
```

#### Trouver les références

Trouver toutes les références à un symbole.

```
Opération : findReferences
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (base 1)
  - character : Numéro de colonne (base 1)
  - includeDeclaration : Inclure la déclaration elle-même (optionnel)
```

#### Aller à l'implémentation

Trouver les implémentations d'une interface ou d'une méthode abstraite.

```
Opération : goToImplementation
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (base 1)
  - character : Numéro de colonne (base 1)
```

### Information sur les symboles

#### Hover

Obtenir la documentation et les informations de type pour un symbole.

```
Opération : hover
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (base 1)
  - character : Numéro de colonne (base 1)
```

#### Symboles du document

Obtenir tous les symboles dans un document.

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
  - query : Chaîne de requête de recherche
  - limit : Nombre maximum de résultats (optionnel)
```

### Hiérarchie d'appel

#### Préparer la hiérarchie d'appel

Obtenir l'élément de hiérarchie d'appel à une position.

```
Opération : prepareCallHierarchy
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (base 1)
  - character : Numéro de colonne (base 1)
```

#### Appels entrants

Trouver toutes les fonctions qui appellent la fonction donnée.

```
Opération : incomingCalls
Paramètres :
  - callHierarchyItem : Élément de prepareCallHierarchy
```

#### Appels sortants

Trouver toutes les fonctions appelées par la fonction donnée.

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
  - limit : Nombre maximum de résultats (optionnel)
```

### Actions de code

#### Obtenir les actions de code

Obtenir les actions de code disponibles (correctifs rapides, refactorisations) à un emplacement.

```
Opération : codeActions
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne de début (base 1)
  - character : Numéro de colonne de début (base 1)
  - endLine : Numéro de ligne de fin (optionnel, par défaut la même ligne)
  - endCharacter : Numéro de colonne de fin (optionnel, par défaut la même colonne)
  - diagnostics : Diagnostics pour lesquels obtenir des actions (optionnel)
  - codeActionKinds : Filtrer par type d'action (optionnel)
```

Types d'actions de code :

- `quickfix` - Correctifs rapides pour erreurs/avertissements
- `refactor` - Opérations de refactorisation
- `refactor.extract` - Extraire vers une fonction/variable
- `refactor.inline` - Fonction/variable en ligne
- `source` - Actions de code source
- `source.organizeImports` - Organiser les imports
- `source.fixAll` - Corriger tous les problèmes auto-corrigeables

## Sécurité

Les serveurs de langage s'exécutent avec vos permissions utilisateur et peuvent exécuter du code. Les serveurs configurés par le `.lsp.json` d'un workspace nécessitent une **confiance explicite du dossier**, y compris leurs sondes de disponibilité d'exécutable et rechargements à chaud. Activez `security.folderTrust.enabled` dans les paramètres utilisateur et faites confiance au répertoire, ou accordez la confiance au workspace via votre IDE. Désactiver la confiance de dossier n'autorise pas les configurations LSP du workspace, y compris en mode YOLO.

### Contrôles de confiance

- **Workspace explicitement fiable** : Les serveurs LSP du workspace démarrent s'ils sont configurés.
- **Pas de confiance explicite** : Les serveurs du `.lsp.json` du workspace sont ignorés. Le dépôt ne peut pas outrepasser cela en définissant `trustRequired: false` ou en déclarant une source d'extension.

Après avoir activé la confiance de dossier dans les paramètres utilisateur, utilisez la boîte de dialogue de confiance au démarrage ou `/trust` pour faire confiance au répertoire. Redémarrez après avoir modifié la décision de confiance du CLI.

### Remplacement de confiance par serveur

Les extensions installées conservent leur politique de confiance existante. Une extension peut déclarer `trustRequired: false` lorsque l'hôte permet la découverte LSP dans des workspaces non fiables. Ce remplacement est ignoré dans le `.lsp.json` du workspace :

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

1. **Vérifiez que LSP est activé** : Utilisez le paramètre `tools.lspEnabled` (scope utilisateur, système ou système-par-défaut) ou le drapeau `--experimental-lsp` ; `QWEN_CODE_ENABLE_LSP=1` / `QWEN_CODE_DISABLE_LSP=1` outrepassent les deux (désactive gagne). Le mode sans échec (`--safe-mode`, `QWEN_CODE_SAFE_MODE=1`) et `--bare` refusent LSP, et `/lsp` n'y est pas enregistré
2. **Vérifiez si le serveur est installé** : Exécutez la commande manuellement (ex: `clangd --version`) pour vérifier
3. **Vérifiez la commande** : Le binaire du serveur doit être dans votre `PATH` système, ou spécifié comme chemin absolu (ex: `/opt/llvm/bin/clangd`). Les chemins relatifs qui sortent du workspace sont bloqués
4. **Vérifiez la confiance du workspace** : Un serveur déclaré par le workspace démarre uniquement dans un dossier explicitement fiable — activez `security.folderTrust.enabled` et faites confiance au dossier avec `/trust`, ou connectez un IDE qui signale le workspace comme fiable. Un signalement IDE d'un workspace non fiable (mode restreint VS Code) le saute aussi, et avec la confiance de dossier désactivée et sans confiance IDE le serveur est sauté plutôt qu'admis. La vérification IDE est réévaluée quand `.lsp.json` change, et le saut apparaît uniquement dans le log `--debug` comme `requires trusted workspace, skipping`
5. **Vérifiez les journaux** : Démarrez Qwen Code avec `--debug`, puis recherchez les entrées liées à LSP dans le journal de débogage (voir la section Débogage ci-dessous)
6. **Vérifiez le processus** : Exécutez `ps aux | grep <nom-du-serveur>` pour vérifier que le processus du serveur est en cours

### Performances lentes

1. **Grands projets** : Envisagez d'exclure `node_modules` et autres grands répertoires
2. **Délai d'expiration du serveur** : Augmentez `startupTimeout` dans la configuration du serveur pour les serveurs lents

### Aucun résultat

1. **Serveur pas prêt** : Le serveur peut encore être en train d'indexer. Pour les projets C/C++ avec clangd, assurez-vous que `--background-index` est dans les arguments et qu'un fichier `compile_commands.json` (ou `compile_flags.txt`) existe à la racine du projet ou dans un répertoire parent. Utilisez `--compile-commands-dir=<chemin>` s'il se trouve dans un sous-répertoire de compilation
2. **Fichier non sauvegardé** : Sauvegardez votre fichier pour que le serveur prenne en compte les modifications
3. **Mauvais langage** : Vérifiez que le bon serveur est en cours pour votre langage
4. **Vérifiez le processus** : Exécutez `ps aux | grep <nom-du-serveur>` pour vérifier que le serveur est bien en cours

### Débogage

LSP n'a pas de drapeau de débogage séparé. Activez LSP via le paramètre (ou le drapeau), puis activez le mode débogage normal de Qwen Code :

```bash
qwen --debug
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
- `[CONFIG] Native LSP status after startup: ...` : Résultat du démarrage du serveur, incluant les compteurs prêts/échoués.
- `[STATUS] LSP status snapshot for /status: ...` : Instantané de l'état affiché lors de l'exécution de `/status` en mode débogage.

Vous pouvez également exécuter `/status` dans le CLI pour voir un résumé LSP court :

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
command path is unsafe        -> le chemin de commande n'est pas sûr : utilisez un chemin absolu ou ajoutez au PATH
command not found             -> le binaire du serveur n'est pas installé ou n'est pas dans le PATH
requires trusted workspace    -> exécutez /trust d'abord
LSP connection closed         -> le serveur a démarré mais s'est arrêté ou a fermé stdin/stdout avant de répondre à l'initialisation
```

Pour les échecs de démarrage de clangd, vérifiez le serveur directement depuis la racine du projet :

```bash
clangd --version
clangd --check=/path/to/file.cpp --log=verbose
```

Les projets C/C++ devraient généralement fournir un fichier `compile_commands.json` ou `compile_flags.txt`. Si la base de données de compilation se trouve dans un répertoire de compilation, transmettez-la à clangd :

```json
{
  "cpp": {
    "command": "clangd",
    "args": ["--background-index", "--compile-commands-dir=build"]
  }
}
```

```bash
ps aux | grep clangd   # or typescript-language-server, jdtls, etc.
```

## Configuration LSP des extensions

Les extensions peuvent fournir des configurations de serveur LSP via le champ `lspServers` dans leur `plugin.json`. Cela peut être soit un objet en ligne, soit un chemin vers un fichier `.lsp.json`. Qwen Code charge ces configurations lorsque l'extension est activée. Le format est la même structure indexée par langage utilisée dans les fichiers `.lsp.json` du projet.

## Meilleures pratiques

1. **Installez les serveurs de langage globalement** : Cela garantit qu'ils sont disponibles dans tous les projets
2. **Utilisez des paramètres spécifiques au projet** : Configurez les options du serveur par projet si nécessaire via `.lsp.json`
3. **Gardez les serveurs à jour** : Mettez à jour vos serveurs de langage régulièrement pour de meilleurs résultats
4. **Faites confiance avec discernement** : Ne faites confiance qu'aux espaces de travail provenant de sources fiables

## FAQ

### Q : Comment activer LSP ?

Utilisez le paramètre `tools.lspEnabled` (scope utilisateur, système ou système-par-défaut) ou le drapeau `--experimental-lsp`. `QWEN_CODE_ENABLE_LSP=1` et `QWEN_CODE_DISABLE_LSP=1` outrepassent les deux (désactive gagne) ; les valeurs au scope workspace sont ignorées.

```jsonc
// ~/.qwen/settings.json (scope utilisateur)
{ "tools": { "lspEnabled": true } }
```

### Q : Comment savoir quels serveurs de langage sont en cours d'exécution ?

Démarrez Qwen Code avec LSP activé (paramètre ou drapeau) et le mode débogage activé :

```bash
qwen --debug
```

Exécutez ensuite `/status` pour un résumé court, `/lsp` pour l'état par serveur, ou inspectez le journal de débogage :

```bash
# Répertoire d'exécution par défaut
rg "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest
# Ou :
grep -E "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest

# Si QWEN_RUNTIME_DIR est configuré
rg "LSP|Native LSP|<server-name>" "$QWEN_RUNTIME_DIR/debug/latest"
```

LSP utilise le mode `--debug` normal de Qwen Code ; il n'y a pas de drapeau de débogage LSP séparé.

### Q : Puis-je utiliser plusieurs serveurs de langage pour le même type de fichier ?

Oui, mais un seul sera utilisé pour chaque opération. Le premier serveur qui retourne des résultats l'emporte.

### Q : LSP fonctionne-t-il en mode sandbox ?

Les serveurs LSP s'exécutent en dehors du sandbox pour accéder à votre code. Ils sont soumis aux contrôles de confiance du workspace.