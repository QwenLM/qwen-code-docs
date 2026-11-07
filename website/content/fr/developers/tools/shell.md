# Outil Shell (`run_shell_command`)

Ce document décrit l'outil `run_shell_command` pour Qwen Code.

## Description

Utilisez `run_shell_command` pour interagir avec le système sous-jacent, exécuter des scripts ou effectuer des opérations en ligne de commande. `run_shell_command` exécute une commande shell donnée, y compris les commandes interactives nécessitant une saisie utilisateur (par exemple, `vim`, `git rebase -i`) si le paramètre `tools.shell.enableInteractiveShell` est défini sur `true`.

Sur Windows, les commandes sont exécutées avec `cmd.exe /c`. Sur les autres plateformes, elles sont exécutées avec `bash -c`.

### Arguments

`run_shell_command` prend les arguments suivants :

- `command` (string, requis) : La commande shell exacte à exécuter.
- `description` (string, optionnel) : Une brève description de l'objectif de la commande, qui sera affichée à l'utilisateur.
- `directory` (string, optionnel) : Le répertoire (relatif à la racine du projet) dans lequel exécuter la commande. Si non fourni, la commande s'exécute à la racine du projet.
- `is_background` (boolean, optionnel) : Indique si la commande doit s'exécuter en arrière-plan. Si non spécifié, la valeur par défaut est `false` (exécution au premier plan). Définissez-le sur true pour les processus de longue durée comme les serveurs de développement, les watchers ou les démons qui doivent continuer à s'exécuter sans bloquer les commandes suivantes.

## Comment utiliser `run_shell_command` avec Qwen Code

Lors de l'utilisation de `run_shell_command`, la commande est exécutée en tant que sous-processus. Son exécution en arrière-plan ou au premier plan est contrôlée par le paramètre `is_background`. N'ajoutez pas de `&` final lorsque `is_background: true` : le chemin géré en arrière-plan est lui-même le mécanisme de mise en arrière-plan, et l'outil rejette l'appel au lieu de l'exécuter. L'outil renvoie des informations détaillées sur l'exécution, notamment :

### Le paramètre `is_background`

`is_background` est optionnel — le schéma de l'outil ne requiert que `command` — et lorsqu'il est omis, la commande s'exécute au premier plan. La décision qui doit être explicite est donc l'autre : une commande qui ne s'arrêtera pas d'elle-même doit être marquée `is_background: true`, car la laisser au premier plan bloque le tour jusqu'à son expiration.

### Exécution en arrière-plan et au premier plan

L'outil gère l'exécution en arrière-plan et au premier plan en fonction de ce paramètre :

**Utilisez l'exécution en arrière-plan (`is_background: true`) pour :**

- Les serveurs de développement de longue durée : `npm run start`, `npm run dev`, `yarn dev`
- Les watchers de build : `npm run watch`, `webpack --watch`
- Les serveurs de base de données : `mongod`, `mysql`, `redis-server`
- Les serveurs web : `python -m http.server`, `php -S localhost:8000`
- Toute commande censée s'exécuter indéfiniment jusqu'à ce qu'elle soit arrêtée manuellement

**Utilisez l'exécution au premier plan (valeur par défaut) pour** les commandes qui se terminent d'elles-mêmes, telles que les builds, installations, opérations git et exécutions de tests.

La lecture et la recherche de fichiers ne sont pas du tout des candidats au premier plan pour cet outil : utilisez les outils dédiés (`read_file`, `grep_search`, `glob`) au lieu de `cat`, `grep`, ou `find`, ce que la description de l'outil exclut.

### Informations d'exécution

L'outil renvoie des informations détaillées sur l'exécution, notamment :

- `Command` : La commande qui a été exécutée.
- `Directory` : Le répertoire dans lequel la commande a été exécutée.
- `Stdout` : La sortie du flux de sortie standard.
- `Stderr` : La sortie du flux d'erreur standard.
- `Error` : Tout message d'erreur signalé par le sous-processus.
- `Exit Code` : Le code de retour de la commande.
- `Signal` : Le numéro du signal si la commande a été terminée par un signal.
- `Background PIDs` : Une liste des PID pour tout processus en arrière-plan démarré.

Utilisation :

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**Remarque :** `is_background` est optionnel. L'omettre exécute la commande au premier plan, donc le cas qui nécessite un `true` explicite est une commande qui ne s'arrêtera pas d'elle-même.

## Exemples de `run_shell_command`

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

Remarque : un `&` explicite n'est pas un mécanisme d'arrière-plan géré. Avec `is_background: true`, l'outil rejette un `&` final nu avant que la commande ne s'exécute ; avec `is_background=false`, le shell détache le processus, donc l'appel revient sans que le processus ne soit suivi — il n'a pas d'entrée de tâche en arrière-plan et `task_stop` ne peut pas l'atteindre. Utilisez toujours `is_background=true` pour une commande qui doit s'exécuter en arrière-plan.

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

### Activation des commandes interactives

Le paramètre `tools.shell.enableInteractiveShell` contrôle si les commandes shell sont exécutées via `node-pty` (PTY interactif) ou le backend standard `child_process`. Lorsqu'il est activé, les sessions interactives telles que `vim`, `git rebase -i` et les programmes TUI fonctionnent correctement.

Lorsque le paramètre est omis, les invites explicites ponctuelles utilisent `child_process` ; les sessions TUI interactives, ACP, stream-json, stdin uniquement et les sessions avec entrée fichier utilisent PTY. Sur les builds Windows **<= 19041** (avant Windows 10 version 2004), le mode PTY revient à `child_process` car les anciennes implémentations de ConPTY présentent des problèmes de fiabilité connus (sorties manquantes, blocages). Cela correspond au même seuil utilisé par VS Code ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Si `node-pty` n'est pas disponible au moment de l'exécution, l'outil revient également à `child_process`.

Pour remplacer explicitement la valeur par défaut, définissez la valeur dans `settings.json` :

**Exemple de `settings.json` :**

```json
{
  "tools": {
    "shell": {
      "enableInteractiveShell": true
    }
  }
}
```

### Affichage des couleurs dans la sortie

Pour afficher les couleurs dans la sortie du shell, vous devez définir le paramètre `tools.shell.showColor` sur `true`. **Remarque : Ce paramètre s'applique uniquement lorsque `tools.shell.enableInteractiveShell` est activé.**

**Exemple de `settings.json` :**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### Configuration du pager

Vous pouvez définir un pager personnalisé pour la sortie du shell en configurant le paramètre `tools.shell.pager`. Le pager par défaut est `cat` sur les plateformes non-Windows. Aucun pager par défaut n'est défini sur Windows. Définissez `tools.shell.pager` sur une chaîne vide pour désactiver les variables d'environnement du pager. **Remarque : Ce paramètre s'applique uniquement lorsque `tools.shell.enableInteractiveShell` est activé.**

**Exemple de `settings.json` :**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## Commandes interactives

L'outil `run_shell_command` prend désormais en charge les commandes interactives en intégrant un pseudo-terminal (pty). Cela vous permet d'exécuter des commandes nécessitant une saisie utilisateur en temps réel, telles que les éditeurs de texte (`vim`, `nano`), les interfaces utilisateur en mode terminal (`htop`) et les opérations de contrôle de version interactives (`git rebase -i`).

Lorsqu'une commande interactive est en cours d'exécution, vous pouvez lui envoyer des saisies depuis Qwen Code. Pour donner le focus au shell interactif, appuyez sur `ctrl+f`. La sortie du terminal, y compris les TUI complexes, sera rendue correctement.

## Notes importantes

- **Sécurité :** Soyez prudent lors de l'exécution de commandes, en particulier celles construites à partir de saisies utilisateur, afin de prévenir les vulnérabilités de sécurité.
- **Gestion des erreurs :** Vérifiez les champs `Stderr`, `Error` et `Exit Code` pour déterminer si une commande s'est exécutée avec succès.
- **Processus en arrière-plan :** Seul `is_background=true` démarre un processus en arrière-plan suivi : l'outil revient immédiatement avec l'identifiant shell et le PID, et le processus continue de s'exécuter. Un `&` au niveau shell n'en crée pas un — avec `is_background: true`, l'outil rejette un `&` final nu, et avec `is_background=false`, le shell détache la commande sans que l'outil ne la suive.
- **Choix d'exécution en arrière-plan :** Le paramètre `is_background` est optionnel (le schéma ne requiert que `command`) ; définissez `is_background: true` pour une commande qui ne s'arrêtera pas d'elle-même, car la laisser au premier plan bloque le tour jusqu'à son expiration. Utilisez `is_background` plutôt que `&` au niveau shell ; cela fournit une intention plus claire et l'outil gère la configuration de l'exécution en arrière-plan.
- **Descriptions des commandes :** Lors de l'utilisation de `is_background=true`, la description de la commande inclura un indicateur `[background]` pour indiquer clairement le mode d'exécution.

## Variables d'environnement

Lorsque `run_shell_command` exécute une commande, il définit la variable d'environnement `QWEN_CODE=1` dans l'environnement du sous-processus. Cela permet aux scripts ou aux outils de détecter s'ils sont exécutés depuis la CLI.

## Restrictions de commandes

Vous pouvez restreindre les commandes pouvant être exécutées par l'outil `run_shell_command` en utilisant les paramètres `tools.core` et `tools.exclude` dans votre fichier de configuration.

- `tools.core` : Pour restreindre `run_shell_command` à un ensemble spécifique de commandes, ajoutez des entrées à la liste `core` sous la catégorie `tools` au format `run_shell_command(<command>)`. Par exemple, `"tools": {"core": ["run_shell_command(git)"]}` n'autorisera que les commandes `git`. L'inclusion du `run_shell_command` générique agit comme un caractère générique, autorisant toute commande non explicitement bloquée.
- `tools.exclude` : Pour bloquer des commandes spécifiques, ajoutez des entrées à la liste `exclude` sous la catégorie `tools` au format `run_shell_command(<command>)`. Par exemple, `"tools": {"exclude": ["run_shell_command(rm)"]}` bloquera les commandes `rm`.

La logique de validation est conçue pour être sécurisée et flexible :

1.  **Chaînage de commandes désactivé** : L'outil divise automatiquement les commandes chaînées avec `&&`, `||` ou `;` et valide chaque partie séparément. Si une partie de la chaîne n'est pas autorisée, la commande entière est bloquée.
2.  **Correspondance de préfixe** : L'outil utilise la correspondance de préfixe. Par exemple, si vous autorisez `git`, vous pouvez exécuter `git status` ou `git log`.
3.  **Priorité de la liste de blocage** : La liste `tools.exclude` est toujours vérifiée en premier. Si une commande correspond à un préfixe bloqué, elle sera refusée, même si elle correspond également à un préfixe autorisé dans `tools.core`.

### Exemples de restriction de commandes

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

Pour bloquer toutes les commandes shell, ajoutez le caractère générique `run_shell_command` à `tools.exclude` :

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l` : Bloqué
- `toute autre commande` : Bloqué

## Note de sécurité pour `excludeTools`

Les restrictions spécifiques aux commandes dans `excludeTools` pour `run_shell_command` sont basées sur une simple correspondance de chaînes et peuvent être facilement contournées. Cette fonctionnalité **n'est pas un mécanisme de sécurité** et ne doit pas être utilisée pour exécuter du code non fiable en toute sécurité. Il est recommandé d'utiliser `coreTools` pour sélectionner explicitement les commandes pouvant être exécutées.