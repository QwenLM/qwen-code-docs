# Outil Shell (`run_shell_command`)

Ce document décrit l'outil `run_shell_command` pour Qwen Code.

## Description

Utilisez `run_shell_command` pour interagir avec le système sous-jacent, exécuter des scripts ou effectuer des opérations en ligne de commande. `run_shell_command` exécute une commande shell donnée, y compris les commandes interactives nécessitant une saisie utilisateur (par ex. `vim`, `git rebase -i`) si le paramètre `tools.shell.enableInteractiveShell` est défini sur `true`.

Sous Windows, les commandes sont exécutées avec `cmd.exe /c`. Sur les autres plateformes, elles le sont avec `bash -c`.

### Arguments

`run_shell_command` accepte les arguments suivants :

- `command` (string, requis) : La commande shell exacte à exécuter.
- `description` (string, optionnel) : Une brève description de l'objectif de la commande, qui sera affichée à l'utilisateur.
- `directory` (string, optionnel) : Le répertoire (relatif à la racine du projet) dans lequel exécuter la commande. S'il n'est pas fourni, la commande s'exécute dans la racine du projet.
- `is_background` (boolean, requis) : Indique si la commande doit s'exécuter en arrière-plan. Ce paramètre est obligatoire pour garantir une décision explicite concernant le mode d'exécution. Définissez-le sur `true` pour les processus de longue durée comme les serveurs de développement, les watchers ou les daemons qui doivent continuer à tourner sans bloquer les commandes suivantes. Définissez-le sur `false` pour les commandes ponctuelles qui doivent se terminer avant de poursuivre.

## How to use `run_shell_command` with Qwen Code

Lors de l'utilisation de `run_shell_command`, la commande est exécutée en tant que sous-processus. Vous pouvez contrôler si les commandes s'exécutent en arrière-plan ou au premier plan à l'aide du paramètre `is_background`, ou en ajoutant explicitement `&` aux commandes. L'outil renvoie des informations détaillées sur l'exécution, notamment :

### Required Background Parameter

Le paramètre `is_background` est **requis** pour toutes les exécutions de commandes. Cette conception garantit que le LLM (et les utilisateurs) doivent décider explicitement si chaque commande doit s'exécuter en arrière-plan ou au premier plan, favorisant ainsi un comportement d'exécution intentionnel et prévisible. En rendant ce paramètre obligatoire, nous évitons un basculement involontaire vers une exécution au premier plan, qui pourrait bloquer les opérations suivantes lors du traitement de processus de longue durée.

### Background vs Foreground Execution

L'outil gère intelligemment l'exécution en arrière-plan et au premier plan en fonction de votre choix explicite :

**Utilisez l'exécution en arrière-plan (`is_background: true`) pour :**

- Les serveurs de développement de longue durée : `npm run start`, `npm run dev`, `yarn dev`
- Les watchers de build : `npm run watch`, `webpack --watch`
- Les serveurs de base de données : `mongod`, `mysql`, `redis-server`
- Les serveurs web : `python -m http.server`, `php -S localhost:8000`
- Toute commande censée s'exécuter indéfiniment jusqu'à un arrêt manuel

**Utilisez l'exécution au premier plan (`is_background: false`) pour :**

- Les commandes ponctuelles : `ls`, `cat`, `grep`
- Les commandes de build : `npm run build`, `make`
- Les commandes d'installation : `npm install`, `pip install`
- Les opérations Git : `git commit`, `git push`
- Les exécutions de tests : `npm test`, `pytest`

### Execution Information

L'outil renvoie des informations détaillées sur l'exécution, notamment :

- `Command` : La commande qui a été exécutée.
- `Directory` : Le répertoire dans lequel la commande a été exécutée.
- `Stdout` : La sortie du flux de sortie standard.
- `Stderr` : La sortie du flux d'erreur standard.
- `Error` : Tout message d'erreur signalé par le sous-processus.
- `Exit Code` : Le code de sortie de la commande.
- `Signal` : Le numéro du signal si la commande a été interrompue par un signal.
- `Background PIDs` : Une liste des PID pour les processus en arrière-plan démarrés.

Utilisation :

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**Remarque :** Le paramètre `is_background` est requis et doit être explicitement spécifié pour chaque exécution de commande.

## `run_shell_command` examples

Lister les fichiers dans le répertoire courant :

```bash
run_shell_command(command="ls -la", is_background=false)
```

Exécuter un script dans un répertoire spécifique :

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

Démarrer un serveur de développement en arrière-plan (approche recommandée) :

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

Démarrer un serveur en arrière-plan (alternative avec `&` explicite) :

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

Exécuter une commande de build au premier plan :

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

Démarrer plusieurs services en arrière-plan :

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## Configuration

Vous pouvez configurer le comportement de l'outil `run_shell_command` en modifiant votre fichier `settings.json` ou en utilisant la commande `/settings` dans Qwen Code.

### Enabling Interactive Commands

Le paramètre `tools.shell.enableInteractiveShell` contrôle si les commandes shell sont exécutées via `node-pty` (PTY interactif) ou le backend standard `child_process`. Lorsqu'il est activé, les sessions interactives telles que `vim`, `git rebase -i` et les programmes TUI fonctionnent correctement.

Ce paramètre est défini sur `true` par défaut sur la plupart des plateformes. Sur les versions Windows **<= 19041** (avant Windows 10 version 2004), il est défini sur `false` car les anciennes implémentations ConPTY présentent des problèmes de fiabilité connus (sortie manquante, blocages). Cela correspond au même seuil utilisé par VS Code ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Si `node-pty` n'est pas disponible à l'exécution, l'outil utilise `child_process` en repli, indépendamment de ce paramètre.

Pour remplacer explicitement la valeur par défaut, définissez la valeur dans `settings.json` :

**Exemple `settings.json` :**

```json
{
  "tools": {
    "shell": {
      "enableInteractiveShell": true
    }
  }
}
```

### Showing Color in Output

Pour afficher les couleurs dans la sortie shell, vous devez définir le paramètre `tools.shell.showColor` sur `true`. **Remarque : Ce paramètre s'applique uniquement lorsque `tools.shell.enableInteractiveShell` est activé.**

**Exemple `settings.json` :**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### Setting the Pager

Vous pouvez définir un pager personnalisé pour la sortie shell en configurant le paramètre `tools.shell.pager`. Le pager par défaut est `cat`. **Remarque : Ce paramètre s'applique uniquement lorsque `tools.shell.enableInteractiveShell` est activé.**

**Exemple `settings.json` :**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## Interactive Commands

L'outil `run_shell_command` prend désormais en charge les commandes interactives en intégrant un pseudo-terminal (pty). Cela vous permet d'exécuter des commandes nécessitant une saisie utilisateur en temps réel, comme les éditeurs de texte (`vim`, `nano`), les interfaces en terminal (`htop`) et les opérations de contrôle de version interactives (`git rebase -i`).

Lorsqu'une commande interactive est en cours d'exécution, vous pouvez lui envoyer des entrées depuis Qwen Code. Pour vous concentrer sur le shell interactif, appuyez sur `ctrl+f`. La sortie du terminal, y compris les TUI complexes, sera rendue correctement.

## Important notes

- **Sécurité :** Soyez prudent lors de l'exécution de commandes, en particulier celles construites à partir de saisies utilisateur, afin d'éviter les vulnérabilités de sécurité.
- **Gestion des erreurs :** Vérifiez les champs `Stderr`, `Error` et `Exit Code` pour déterminer si une commande s'est exécutée avec succès.
- **Processus en arrière-plan :** Lorsque `is_background=true` ou lorsqu'une commande contient `&`, l'outil retourne immédiatement et le processus continue de s'exécuter en arrière-plan. Le champ `Background PIDs` contiendra l'ID du processus en arrière-plan.
- **Choix d'exécution en arrière-plan :** Le paramètre `is_background` est requis et offre un contrôle explicite sur le mode d'exécution. Vous pouvez également ajouter `&` à la commande pour une exécution manuelle en arrière-plan, mais le paramètre `is_background` doit tout de même être spécifié. Ce paramètre clarifie l'intention et gère automatiquement la configuration de l'exécution en arrière-plan.
- **Descriptions de commandes :** Lors de l'utilisation de `is_background=true`, la description de la commande inclura un indicateur `[background]` pour afficher clairement le mode d'exécution.

## Environment Variables

Lorsque `run_shell_command` exécute une commande, il définit la variable d'environnement `QWEN_CODE=1` dans l'environnement du sous-processus. Cela permet aux scripts ou outils de détecter s'ils sont exécutés depuis le CLI.

## Command Restrictions

Vous pouvez restreindre les commandes exécutables par l'outil `run_shell_command` en utilisant les paramètres `tools.core` et `tools.exclude` dans votre fichier de configuration.

- `tools.core` : Pour restreindre `run_shell_command` à un ensemble spécifique de commandes, ajoutez des entrées à la liste `core` sous la catégorie `tools` au format `run_shell_command(<command>)`. Par exemple, `"tools": {"core": ["run_shell_command(git)"]}` n'autorisera que les commandes `git`. Inclure `run_shell_command` générique agit comme un joker, autorisant toute commande non explicitement bloquée.
- `tools.exclude` : Pour bloquer des commandes spécifiques, ajoutez des entrées à la liste `exclude` sous la catégorie `tools` au format `run_shell_command(<command>)`. Par exemple, `"tools": {"exclude": ["run_shell_command(rm)"]}` bloquera les commandes `rm`.

La logique de validation est conçue pour être sécurisée et flexible :

1.  **Enchaînement de commandes désactivé** : L'outil divise automatiquement les commandes enchaînées avec `&&`, `||` ou `;` et valide chaque partie séparément. Si une partie de la chaîne n'est pas autorisée, la commande entière est bloquée.
2.  **Correspondance par préfixe** : L'outil utilise la correspondance par préfixe. Par exemple, si vous autorisez `git`, vous pouvez exécuter `git status` ou `git log`.
3.  **Priorité à la liste de blocage** : La liste `tools.exclude` est toujours vérifiée en premier. Si une commande correspond à un préfixe bloqué, elle sera refusée, même si elle correspond également à un préfixe autorisé dans `tools.core`.

### Command Restriction Examples

**Autoriser uniquement des préfixes de commandes spécifiques**

Pour autoriser uniquement les commandes `git` et `npm`, et bloquer toutes les autres :

```json
{
  "tools": {
    "core": ["run_shell_command(git)", "run_shell_command(npm)"]
  }
}
```

- `git status` : Autorisé
- `npm install` : Autorisé
- `ls -l` : Bloqué

**Bloquer des préfixes de commandes spécifiques**

Pour bloquer `rm` et autoriser toutes les autres commandes :

```json
{
  "tools": {
    "core": ["run_shell_command"],
    "exclude": ["run_shell_command(rm)"]
  }
}
```

- `rm -rf /` : Bloqué
- `git status` : Autorisé
- `npm install` : Autorisé

**La liste de blocage est prioritaire**

Si un préfixe de commande se trouve à la fois dans `tools.core` et `tools.exclude`, il sera bloqué.

```json
{
  "tools": {
    "core": ["run_shell_command(git)"],
    "exclude": ["run_shell_command(git push)"]
  }
}
```

- `git push origin main` : Bloqué
- `git status` : Autorisé

**Bloquer toutes les commandes shell**

Pour bloquer toutes les commandes shell, ajoutez le joker `run_shell_command` à `tools.exclude` :

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l` : Bloqué
- `any other command` : Bloqué

## Security Note for `excludeTools`

Les restrictions spécifiques aux commandes dans `excludeTools` pour `run_shell_command` reposent sur une simple correspondance de chaînes et peuvent être facilement contournées. Cette fonctionnalité n'est **pas un mécanisme de sécurité** et ne doit pas être utilisée pour exécuter du code non fiable en toute sécurité. Il est recommandé d'utiliser `coreTools` pour sélectionner explicitement les commandes autorisées à l'exécution.