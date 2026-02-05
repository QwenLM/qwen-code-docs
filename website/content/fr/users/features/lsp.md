# Prise en charge du protocole de serveur de langage (LSP)

Qwen Code fournit une prise en charge native du protocole de serveur de langage (LSP), permettant des fonctionnalités avancées d'intelligence de code telles que l'accès à la définition, la recherche de références, les diagnostics et les actions de code. Cette intégration permet à l'agent IA de mieux comprendre votre code et de fournir une assistance plus précise.

## Aperçu

La prise en charge de LSP dans Qwen Code fonctionne en se connectant aux serveurs de langage qui comprennent votre code. Lorsque vous travaillez avec TypeScript, Python, Go ou d'autres langages pris en charge, Qwen Code peut automatiquement démarrer le serveur de langage approprié et l'utiliser pour :

- Naviguer vers les définitions de symboles
- Trouver toutes les références à un symbole
- Obtenir des informations au survol (documentation, informations sur les types)
- Afficher les messages de diagnostic (erreurs, avertissements)
- Accéder aux actions de code (corrections rapides, refactorisations)
- Analyser les hiérarchies d'appels

## Démarrage rapide

LSP est une fonctionnalité expérimentale dans Qwen Code. Pour l'activer, utilisez l'indicateur de ligne de commande `--experimental-lsp` :

```bash
qwen --experimental-lsp
```

Pour la plupart des langages courants, Qwen Code détectera automatiquement et lancera le serveur de langage approprié s'il est installé sur votre système.

### Prérequis

Vous devez avoir installé le serveur de langage correspondant à votre langage de programmation :

| Langue                | Serveur de langage         | Commande d'installation                                                      |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Guide d'installation](https://rust-analyzer.github.io/manual.html#installation) |

## Configuration

### Fichier .lsp.json

Vous pouvez configurer les serveurs de langage à l'aide d'un fichier `.lsp.json` dans la racine de votre projet. Cela utilise le format basé sur les clés de langage décrit dans la [référence de configuration LSP du plugin Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers).

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

#### Champs requis

| Option                | Type   | Description                                                                 |
| --------------------- | ------ | --------------------------------------------------------------------------- |
| `command`             | string | Commande pour démarrer le serveur LSP (doit être dans le PATH)              |
| `extensionToLanguage` | object | Associe les extensions de fichiers aux identifiants de langage              |

#### Champs facultatifs

| Option                  | Type     | Valeur par défaut | Description                                            |
| ----------------------- | -------- | ----------------- | ------------------------------------------------------ |
| `args`                  | string[] | `[]`              | Arguments de la ligne de commande                      |
| `transport`             | string   | `"stdio"`         | Type de transport : `stdio` ou `socket`                |
| `env`                   | object   | -                 | Variables d'environnement                              |
| `initializationOptions` | object   | -                 | Options d'initialisation LSP                           |
| `settings`              | object   | -                 | Paramètres du serveur via `workspace/didChangeConfiguration` |
| `workspaceFolder`       | string   | -                 | Remplacer le dossier de l'espace de travail            |
| `startupTimeout`        | number   | `10000`           | Délai d'attente au démarrage en millisecondes          |
| `shutdownTimeout`       | number   | `5000`            | Délai d'attente à l'arrêt en millisecondes             |
| `restartOnCrash`        | boolean  | `false`           | Redémarrage automatique en cas de crash                |
| `maxRestarts`           | number   | `3`               | Nombre maximal de tentatives de redémarrage            |
| `trustRequired`         | boolean  | `true`            | Nécessite un espace de travail approuvé                |

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

Qwen Code expose les fonctionnalités LSP via l'outil unifié `lsp`. Voici les opérations disponibles :

### Navigation dans le code

#### Accéder à la définition

Trouver où un symbole est défini.

```
Opération : goToDefinition
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (basé sur 1)
  - character : Numéro de colonne (basé sur 1)
```

#### Rechercher les références

Trouver toutes les références d'un symbole.

```
Opération : findReferences
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (basé sur 1)
  - character : Numéro de colonne (basé sur 1)
  - includeDeclaration : Inclure la déclaration elle-même (facultatif)
```

#### Accéder à l'implémentation

Trouver les implémentations d'une interface ou d'une méthode abstraite.

```
Opération : goToImplementation
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (basé sur 1)
  - character : Numéro de colonne (basé sur 1)
```

### Informations sur les symboles

#### Survol

Obtenir la documentation et les informations de type pour un symbole.

```
Opération : hover
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (basé sur 1)
  - character : Numéro de colonne (basé sur 1)
```

#### Symboles du document

Obtenir tous les symboles dans un document.

```
Opération : documentSymbol
Paramètres :
  - filePath : Chemin vers le fichier
```

#### Recherche de symboles dans l'espace de travail

Rechercher des symboles dans l'ensemble de l'espace de travail.

```
Opération : workspaceSymbol
Paramètres :
  - query : Chaîne de recherche
  - limit : Nombre maximum de résultats (facultatif)
```

### Hiérarchie des appels

#### Préparer la hiérarchie des appels

Obtenir l'élément de hiérarchie des appels à une position donnée.

```
Opération : prepareCallHierarchy
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de ligne (basé sur 1)
  - character : Numéro de colonne (basé sur 1)
```

#### Appels entrants

Trouver toutes les fonctions qui appellent la fonction spécifiée.

```
Opération : incomingCalls
Paramètres :
  - callHierarchyItem : Élément provenant de prepareCallHierarchy
```

#### Appels sortants

Trouver toutes les fonctions appelées par la fonction spécifiée.

```
Opération : outgoingCalls
Paramètres :
  - callHierarchyItem : Élément provenant de prepareCallHierarchy
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
  - limit : Résultats maximum (facultatif)
```

### Actions de code

#### Obtenir les actions de code

Obtenir les actions de code disponibles (corrections rapides, refactorisations) à un emplacement donné.

```
Opération : codeActions
Paramètres :
  - filePath : Chemin vers le fichier
  - line : Numéro de la ligne de début (basé sur 1)
  - character : Numéro de la colonne de début (basé sur 1)
  - endLine : Numéro de la ligne de fin (facultatif, par défaut la même que line)
  - endCharacter : Colonne de fin (facultatif, par défaut la même que character)
  - diagnostics : Diagnostics pour lesquels obtenir des actions (facultatif)
  - codeActionKinds : Filtrer par type d'action (facultatif)
```

Types d'actions de code :

- `quickfix` - Corrections rapides pour les erreurs/avertissements
- `refactor` - Opérations de refactorisation
- `refactor.extract` - Extraire en fonction/variable
- `refactor.inline` - Intégrer la fonction/variable
- `source` - Actions sur le code source
- `source.organizeImports` - Organiser les importations
- `source.fixAll` - Corriger tous les problèmes pouvant être corrigés automatiquement

## Sécurité

Les serveurs LSP ne sont démarrés par défaut que dans les espaces de travail de confiance. En effet, les serveurs de langage s'exécutent avec les autorisations de votre utilisateur et peuvent exécuter du code.

### Contrôles de confiance

- **Espace de travail approuvé** : Les serveurs LSP démarrent automatiquement
- **Espace de travail non approuvé** : Les serveurs LSP ne démarreront pas à moins que `trustRequired: false` soit défini dans la configuration du serveur

Pour marquer un espace de travail comme approuvé, utilisez la commande `/trust` ou configurez les dossiers approuvés dans les paramètres.

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

### Serveur ne démarre pas

1. **Vérifiez si le serveur est installé** : Exécutez la commande manuellement pour vérifier
2. **Vérifiez le PATH** : Assurez-vous que le binaire du serveur se trouve dans votre PATH système
3. **Vérifiez la confiance de l'espace de travail** : L'espace de travail doit être approuvé pour LSP
4. **Consultez les journaux** : Recherchez des messages d'erreur dans la sortie de la console
5. **Vérifiez l'indicateur --experimental-lsp** : Assurez-vous d'utiliser cet indicateur lors du démarrage de Qwen Code

### Performances lentes

1. **Projets volumineux** : Envisagez d'exclure `node_modules` et autres répertoires volumineux
2. **Délai d'attente du serveur** : Augmentez `startupTimeout` dans la configuration du serveur pour les serveurs lents

### Aucun résultat

1. **Serveur non prêt** : Le serveur peut encore être en cours d'indexation
2. **Fichier non sauvegardé** : Sauvegardez votre fichier pour que le serveur prenne en compte les modifications
3. **Langue incorrecte** : Vérifiez si le serveur correct est en cours d'exécution pour votre langage

### Débogage

Activez la journalisation de débogage pour voir les communications LSP :

```bash
DEBUG=lsp* qwen --experimental-lsp
```

Ou consultez le guide de débogage LSP à l'emplacement `packages/cli/LSP_DEBUGGING_GUIDE.md`.

## Compatibilité avec Claude Code

Qwen Code prend en charge les fichiers de configuration `.lsp.json` au format Claude Code dans le format indexé par langage défini dans la [référence des plugins Claude Code](https://code.claude.com/docs/en/plugins-reference#lsp-servers). Si vous migrez depuis Claude Code, utilisez la disposition avec le langage comme clé dans votre configuration.

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

Les plugins LSP Claude Code peuvent également fournir `lspServers` dans `plugin.json` (ou dans un fichier `.lsp.json` référencé). Qwen Code charge ces configurations lorsque l'extension est activée, et elles doivent utiliser le même format indexé par langage.

## Meilleures pratiques

1. **Installer les serveurs de langage globalement** : Cela garantit qu'ils sont disponibles dans tous les projets
2. **Utiliser des paramètres spécifiques au projet** : Configurer les options du serveur par projet selon les besoins via `.lsp.json`
3. **Maintenir les serveurs à jour** : Mettez régulièrement à jour vos serveurs de langage pour de meilleurs résultats
4. **Faire confiance avec discernement** : Ne faire confiance qu'aux espaces de travail provenant de sources fiables

## FAQ

### Q : Comment activer LSP ?

Utilisez l'indicateur `--experimental-lsp` lors du démarrage de Qwen Code :

```bash
qwen --experimental-lsp
```

### Q : Comment savoir quels serveurs de langage sont en cours d'exécution ?

Utilisez la commande `/lsp status` pour voir tous les serveurs de langage configurés et en cours d'exécution.

### Q : Puis-je utiliser plusieurs serveurs de langage pour le même type de fichier ?

Oui, mais un seul sera utilisé pour chaque opération. Le premier serveur qui renvoie des résultats gagne.

### Q : LSP fonctionne-t-il en mode sandbox ?

Les serveurs LSP s'exécutent en dehors du sandbox pour accéder à votre code. Ils sont soumis aux contrôles de confiance de l'espace de travail.