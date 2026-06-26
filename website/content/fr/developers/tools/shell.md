# Outil Shell (`run_shell_command`)

Ce document décrit l'outil `run_shell_command` pour Qwen Code.

## Description

Utilisez `run_shell_command` pour interagir avec le système sous-jacent, exécuter des scripts ou effectuer des opérations en ligne de commande. `run_shell_command` exécute une commande shell donnée, y compris les commandes interactives nécessitant une saisie utilisateur (par exemple `vim`, `git rebase -i`) si le paramètre `tools.shell.enableInteractiveShell` est défini sur `true`.

Sous Windows, les commandes sont exécutées avec `cmd.exe /c`. Sur les autres plateformes, elles sont exécutées avec `bash -c`.

### Arguments

`run_shell_command` prend les arguments suivants :

- `command` (string, requis) : La commande shell exacte à exécuter.
- `description` (string, optionnel) : Une brève description de l'objectif de la commande, qui sera affichée à l'utilisateur.
- `directory` (string, optionnel) : Le répertoire (relatif à la racine du projet) dans lequel exécuter la commande. S'il n'est pas fourni, la commande s'exécute à la racine du projet.
- `is_background` (booléen, requis) : Indique si la commande doit être exécutée en arrière-plan. Ce paramètre est obligatoire pour garantir une prise de décision explicite sur le mode d'exécution. Définissez-le sur `true` pour les processus de longue durée comme les serveurs de développement, les observateurs (watchers) ou les démons qui doivent continuer à s'exécuter sans bloquer les commandes suivantes. Définissez-le sur `false` pour les commandes ponctuelles qui doivent se terminer avant de poursuivre.

## Comment utiliser `run_shell_command` avec Qwen Code

Lorsque vous utilisez `run_shell_command`, la commande est exécutée en tant que sous-processus. Vous pouvez contrôler si les commandes s'exécutent en arrière-plan ou au premier plan à l'aide du paramètre `is_background`, ou en ajoutant explicitement `&` aux commandes. L'outil renvoie des informations détaillées sur l'exécution, notamment :

### Paramètre d'arrière-plan requis

Le paramètre `is_background` est **obligatoire** pour toutes les exécutions de commandes. Cette conception garantit que le LLM (et les utilisateurs) doivent explicitement décider si chaque commande doit s'exécuter en arrière-plan ou au premier plan, favorisant ainsi un comportement d'exécution intentionnel et prévisible. En rendant ce paramètre obligatoire, nous évitons un repli involontaire vers l'exécution au premier plan, ce qui pourrait bloquer les opérations suivantes lors du traitement de processus de longue durée.

### Exécution en arrière-plan vs premier plan

L'outil gère intelligemment l'exécution en arrière-plan et au premier plan en fonction de votre choix explicite :

**Utilisez l'exécution en arrière-plan (`is_background : true`) pour :**

- Serveurs de développement de longue durée : `npm run start`, `npm run dev`, `yarn dev`
- Observateurs de compilation : `npm run watch`, `webpack --watch`
- Serveurs de bases de données : `mongod`, `mysql`, `redis-server`
- Serveurs web : `python -m http.server`, `php -S localhost:8000`
- Toute commande destinée à s'exécuter indéfiniment jusqu'à son arrêt manuel

**Utilisez l'exécution au premier plan (`is_background : false`) pour :**

- Commandes ponctuelles : `ls`, `cat`, `grep`
- Commandes de compilation : `npm run build`, `make`
- Commandes d'installation : `npm install`, `pip install`
- Opérations Git : `git commit`, `git push`
- Exécutions de tests : `npm test`, `pytest`

### Informations d'exécution

L'outil renvoie des informations détaillées sur l'exécution, notamment :

- `Command` : La commande qui a été exécutée.
- `Directory` : Le répertoire dans lequel la commande a été exécutée.
- `Stdout` : La sortie du flux de sortie standard.
- `Stderr` : La sortie du flux d'erreur standard.
- `Error` : Tout message d'erreur signalé par le sous-processus.
- `Exit Code` : Le code de sortie de la commande.
- `Signal` : Le numéro du signal si la commande a été terminée par un signal.
- `Background PIDs` : Une liste des PID des processus d'arrière-plan démarrés.

Utilisation :

```bash
run_shell_command(command="Vos commandes.", description="Votre description de la commande.", directory="Votre répertoire d'exécution.", is_background=false)
```

**Remarque :** Le paramètre `is_background` est obligatoire et doit être explicitement spécifié pour chaque exécution de commande.

## Exemples d'utilisation de `run_shell_command`

Lister les fichiers dans le répertoire courant :

```bash
run_shell_command(command="ls -la", is_background=false)
```

Exécuter un script dans un répertoire spécifique :

```bash
run_shell_command(command="./mon_script.sh", directory="scripts", description="Exécute mon script personnalisé", is_background=false)
```

Démarrer un serveur de développement en arrière-plan (approche recommandée) :

```bash
run_shell_command(command="npm run dev", description="Démarre le serveur de développement en arrière-plan", is_background=true)
```

Démarrer un serveur en arrière-plan (alternative avec `&` explicite) :

```bash
run_shell_command(command="npm run dev &", description="Démarre le serveur de développement en arrière-plan", is_background=false)
```

Exécuter une commande de compilation au premier plan :

```bash
run_shell_command(command="npm run build", description="Compile le projet", is_background=false)
```

Démarrer plusieurs services en arrière-plan :

```bash
run_shell_command(command="docker-compose up", description="Démarre tous les services", is_background=true)
```

## Configuration

Vous pouvez configurer le comportement de l'outil `run_shell_command` en modifiant votre fichier `settings.json` ou en utilisant la commande `/settings` dans Qwen Code.

### Activer les commandes interactives

Le paramètre `tools.shell.enableInteractiveShell` détermine si les commandes shell sont exécutées via `node-pty` (PTY interactif) ou le backend `child_process` standard. Lorsqu'il est activé, les sessions interactives comme `vim`, `git rebase -i`, et les programmes TUI fonctionnent correctement.

Ce paramètre est défini par défaut sur `true` sur la plupart des plateformes. Sur les versions de Windows **<= 19041** (avant Windows 10 version 2004), il est par défaut sur `false` car les anciennes implémentations de ConPTY présentent des problèmes de fiabilité connus (sortie manquante, blocages). Cela correspond au même seuil utilisé par VS Code ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Si `node-pty` n'est pas disponible au moment de l'exécution, l'outil revient à `child_process` indépendamment de ce paramètre.

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

### Afficher les couleurs dans la sortie

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

### Définir le pager

Vous pouvez définir un pager personnalisé pour la sortie du shell en configurant le paramètre `tools.shell.pager`. Le pager par défaut est `cat`. **Remarque : Ce paramètre s'applique uniquement lorsque `tools.shell.enableInteractiveShell` est activé.**

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

L'outil `run_shell_command` prend désormais en charge les commandes interactives en intégrant un pseudo-terminal (pty). Cela vous permet d'exécuter des commandes qui nécessitent une saisie utilisateur en temps réel, comme les éditeurs de texte (`vim`, `nano`), les interfaces utilisateur terminales (`htop`), et les opérations de contrôle de version interactives (`git rebase -i`).

Lorsqu'une commande interactive est en cours d'exécution, vous pouvez envoyer des entrées depuis Qwen Code. Pour vous concentrer sur le shell interactif, appuyez sur `ctrl+f`. La sortie du terminal, y compris les TUI complexes, sera rendue correctement.

## Notes importantes

- **Sécurité :** Soyez prudent lors de l'exécution de commandes, en particulier celles construites à partir d'entrées utilisateur, pour éviter les vulnérabilités de sécurité.
- **Gestion des erreurs :** Vérifiez les champs `Stderr`, `Error` et `Exit Code` pour déterminer si une commande s'est exécutée avec succès.
- **Processus en arrière-plan :** Lorsque `is_background=true` ou que la commande contient `&`, l'outil retourne immédiatement et le processus continue de s'exécuter en arrière-plan. Le champ `Background PIDs` contient l'ID du processus d'arrière-plan.
- **Choix d'exécution en arrière-plan :** Le paramètre `is_background` est obligatoire et offre un contrôle explicite sur le mode d'exécution. Vous pouvez également ajouter `&` à la commande pour une exécution manuelle en arrière-plan, mais le paramètre `is_background` doit toujours être spécifié. Ce paramètre clarifie l'intention et gère automatiquement la configuration de l'exécution en arrière-plan.
- **Descriptions de commande :** Lorsque vous utilisez `is_background=true`, la description de la commande inclura un indicateur `[background]` pour afficher clairement le mode d'exécution.

## Variables d'environnement

Lorsque `run_shell_command` exécute une commande, il définit la variable d'environnement `QWEN_CODE=1` dans l'environnement du sous-processus. Cela permet aux scripts ou outils de détecter s'ils sont exécutés depuis l'interface en ligne de commande.

## Restrictions de commande

Vous pouvez restreindre les commandes qui peuvent être exécutées par l'outil `run_shell_command` en utilisant les paramètres `tools.core` et `tools.exclude` dans votre fichier de configuration.

- `tools.core` : Pour restreindre `run_shell_command` à un ensemble spécifique de commandes, ajoutez des entrées à la liste `core` sous la catégorie `tools` au format `run_shell_command(<commande>)`. Par exemple, `"tools": {"core": ["run_shell_command(git)"]}` n'autorisera que les commandes `git`. Inclure la mention générique `run_shell_command` agit comme un joker, autorisant toute commande non explicitement bloquée.
- `tools.exclude` : Pour bloquer des commandes spécifiques, ajoutez des entrées à la liste `exclude` sous la catégorie `tools` au format `run_shell_command(<commande>)`. Par exemple, `"tools": {"exclude": ["run_shell_command(rm)"]}` bloquera les commandes `rm`.

La logique de validation est conçue pour être sécurisée et flexible :

1.  **Enchaînement de commandes désactivé** : L'outil divise automatiquement les commandes enchaînées avec `&&`, `||` ou `;` et valide chaque partie séparément. Si une partie de la chaîne est interdite, la commande entière est bloquée.
2.  **Correspondance par préfixe** : L'outil utilise une correspondance par préfixe. Par exemple, si vous autorisez `git`, vous pouvez exécuter `git status` ou `git log`.
3.  **Priorité de la liste de blocage** : La liste `tools.exclude` est toujours vérifiée en premier. Si une commande correspond à un préfixe bloqué, elle sera refusée, même si elle correspond également à un préfixe autorisé dans `tools.core`.

### Exemples de restrictions de commande

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

**La liste de blocage a priorité**

Si un préfixe de commande figure à la fois dans `tools.core` et `tools.exclude`, il sera bloqué.

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
- `toute autre commande` : Bloqué

## Note de sécurité concernant `excludeTools`

Les restrictions de commandes spécifiques dans `excludeTools` pour `run_shell_command` sont basées sur une simple correspondance de chaîne et peuvent être facilement contournées. Cette fonctionnalité n'est **pas un mécanisme de sécurité** et ne doit pas être utilisée pour exécuter en toute sécurité du code non fiable. Il est recommandé d'utiliser `coreTools` pour sélectionner explicitement les commandes qui peuvent être exécutées.