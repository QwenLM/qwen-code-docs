# Outil Shell (`run_shell_command`)

Ce document décrit l’outil `run_shell_command` pour Qwen Code.

## Description

Utilisez `run_shell_command` pour interagir avec le système sous-jacent, exécuter des scripts ou effectuer des opérations en ligne de commande. `run_shell_command` exécute une commande shell donnée, y compris les commandes interactives nécessitant une saisie utilisateur (par exemple `vim`, `git rebase -i`) si le paramètre `tools.shell.enableInteractiveShell` est défini sur `true`.

Sur Windows, les commandes sont exécutées avec `cmd.exe /c`. Sur les autres plateformes, elles sont exécutées avec `bash -c`.

### Arguments

`run_shell_command` prend les arguments suivants :

- `command` (chaîne de caractères, requis) : La commande shell exacte à exécuter.
- `description` (chaîne de caractères, facultatif) : Une brève description de l’objectif de la commande, qui sera affichée à l’utilisateur.
- `directory` (chaîne de caractères, facultatif) : Le répertoire (relatif à la racine du projet) dans lequel exécuter la commande. Si aucun répertoire n’est fourni, la commande s’exécute à la racine du projet.
- `is_background` (booléen, requis) : Indique si la commande doit s’exécuter en arrière-plan. Ce paramètre est obligatoire afin de garantir une prise de décision explicite quant au mode d’exécution de la commande. Définissez sa valeur sur `true` pour les processus longs (par exemple, des serveurs de développement, des observateurs ou des démons) qui doivent continuer à s’exécuter sans bloquer l’exécution des commandes suivantes. Définissez-la sur `false` pour les commandes ponctuelles devant se terminer avant de passer à l’étape suivante.

## Comment utiliser `run_shell_command` avec Qwen Code

Lors de l’utilisation de `run_shell_command`, la commande est exécutée sous forme de sous-processus. Vous pouvez contrôler si les commandes s’exécutent en arrière-plan ou en premier plan à l’aide du paramètre `is_background`, ou en ajoutant explicitement `&` aux commandes. Cet outil renvoie des informations détaillées sur l’exécution, notamment :

### Paramètre d’arrière-plan obligatoire

Le paramètre `is_background` est **obligatoire** pour toutes les exécutions de commande. Cette conception garantit que le modèle de langage (LLM) — et les utilisateurs — doivent explicitement décider si chaque commande doit s’exécuter en arrière-plan ou en premier plan, ce qui favorise un comportement d’exécution intentionnel et prévisible. En rendant ce paramètre obligatoire, nous évitons tout recours involontaire à l’exécution en premier plan, qui pourrait bloquer les opérations suivantes lorsqu’il s’agit de processus longs.

### Exécution en arrière-plan vs en premier plan

L’outil gère intelligemment l’exécution en arrière-plan et en premier plan, selon votre choix explicite :

**Utilisez l’exécution en arrière-plan (`is_background: true`) pour :**

- Les serveurs de développement longue durée : `npm run start`, `npm run dev`, `yarn dev`
- Les observateurs de compilation (« watchers ») : `npm run watch`, `webpack --watch`
- Les serveurs de base de données : `mongod`, `mysql`, `redis-server`
- Les serveurs web : `python -m http.server`, `php -S localhost:8000`
- Toute commande destinée à s’exécuter indéfiniment jusqu’à son arrêt manuel

**Utilisez l’exécution en premier plan (`is_background: false`) pour :**

- Les commandes ponctuelles : `ls`, `cat`, `grep`
- Les commandes de compilation : `npm run build`, `make`
- Les commandes d’installation : `npm install`, `pip install`
- Les opérations Git : `git commit`, `git push`
- L’exécution des tests : `npm test`, `pytest`

### Informations sur l’exécution

L’outil renvoie des informations détaillées sur l’exécution, notamment :

- `Commande` : La commande qui a été exécutée.
- `Répertoire` : Le répertoire dans lequel la commande a été exécutée.
- `Stdout` : La sortie du flux de sortie standard.
- `Stderr` : La sortie du flux d’erreur standard.
- `Erreur` : Tout message d’erreur renvoyé par le sous-processus.
- `Code de sortie` : Le code de sortie de la commande.
- `Signal` : Le numéro du signal si la commande a été interrompue par un signal.
- `PID en arrière-plan` : Une liste des PID des processus démarrés en arrière-plan.

Utilisation :

```bash
run_shell_command(command="Vos commandes.", description="Votre description de la commande.", directory="Votre répertoire d’exécution.", is_background=false)
```

**Remarque :** Le paramètre `is_background` est obligatoire et doit être explicitement spécifié pour chaque exécution de commande.

## Exemples de `run_shell_command`

Lister les fichiers du répertoire courant :

```bash
run_shell_command(command="ls -la", is_background=false)
```

Exécuter un script dans un répertoire spécifique :

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Exécuter mon script personnalisé", is_background=false)
```

Démarrer un serveur de développement en arrière-plan (approche recommandée) :

```bash
run_shell_command(command="npm run dev", description="Démarrer le serveur de développement en arrière-plan", is_background=true)
```

Démarrer un serveur en arrière-plan (alternative avec `&` explicite) :

```bash
run_shell_command(command="npm run dev &", description="Démarrer le serveur de développement en arrière-plan", is_background=false)
```

Exécuter une commande de compilation en premier plan :

```bash
run_shell_command(command="npm run build", description="Compiler le projet", is_background=false)
```

Démarrer plusieurs services en arrière-plan :

```bash
run_shell_command(command="docker-compose up", description="Démarrer tous les services", is_background=true)
```

## Configuration

Vous pouvez configurer le comportement de l’outil `run_shell_command` en modifiant votre fichier `settings.json` ou en utilisant la commande `/settings` dans Qwen Code.

### Activation des commandes interactives

Le paramètre `tools.shell.enableInteractiveShell` détermine si les commandes shell sont exécutées via `node-pty` (PTY interactif) ou via le backend standard `child_process`. Lorsqu’il est activé, les sessions interactives telles que `vim`, `git rebase -i` et les programmes à interface utilisateur textuelle (TUI) fonctionnent correctement.

Ce paramètre est activé par défaut (`true`) sur la plupart des plateformes. Sur les versions de Windows **≤ 19041** (avant la version 2004 de Windows 10), il est désactivé par défaut (`false`) car les anciennes implémentations de ConPTY présentent des problèmes connus de fiabilité (sortie manquante, blocages). Ce seuil correspond à celui utilisé par VS Code ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Si `node-pty` n’est pas disponible lors de l’exécution, l’outil revient automatiquement à `child_process`, quelle que soit la valeur de ce paramètre.

Pour remplacer explicitement la valeur par défaut, définissez-la dans le fichier `settings.json` :

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

Pour afficher des couleurs dans la sortie du shell, vous devez définir l’option `tools.shell.showColor` sur `true`. **Remarque : Cette option n’a d’effet que si `tools.shell.enableInteractiveShell` est activé.**

**Exemple de fichier `settings.json` :**

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

Vous pouvez définir un pager personnalisé pour la sortie du shell en configurant l’option `tools.shell.pager`. Le pager par défaut est `cat`. **Remarque : Cette option n’a d’effet que si `tools.shell.enableInteractiveShell` est activé.**

**Exemple de fichier `settings.json` :**

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

L’outil `run_shell_command` prend désormais en charge les commandes interactives grâce à l’intégration d’un pseudo-terminal (pty). Cela vous permet d’exécuter des commandes nécessitant une saisie utilisateur en temps réel, comme les éditeurs de texte (`vim`, `nano`), les interfaces utilisateur basées sur le terminal (`htop`) ou encore les opérations interactives de contrôle de version (`git rebase -i`).

Lorsqu’une commande interactive est en cours d’exécution, vous pouvez lui envoyer des entrées depuis Qwen Code. Pour recentrer le focus sur le shell interactif, appuyez sur `ctrl+f`. La sortie du terminal, y compris les interfaces utilisateur complexes (TUI), est correctement rendue.

## Remarques importantes

- **Sécurité :** Soyez prudent lors de l’exécution de commandes, en particulier celles construites à partir d’entrées utilisateur, afin d’éviter les vulnérabilités de sécurité.
- **Gestion des erreurs :** Vérifiez les champs `Stderr`, `Error` et `Code de sortie` pour déterminer si une commande s’est exécutée avec succès.
- **Processus en arrière-plan :** Lorsque `is_background=true` ou lorsqu’une commande contient `&`, l’outil renvoie immédiatement un résultat et le processus continue de s’exécuter en arrière-plan. Le champ `PID en arrière-plan` contient l’identifiant du processus en arrière-plan.
- **Choix de l’exécution en arrière-plan :** Le paramètre `is_background` est obligatoire et permet un contrôle explicite du mode d’exécution. Vous pouvez également ajouter `&` à la commande pour une exécution manuelle en arrière-plan, mais le paramètre `is_background` doit tout de même être spécifié. Ce paramètre exprime plus clairement l’intention et configure automatiquement l’exécution en arrière-plan.
- **Descriptions de commandes :** Lorsque `is_background=true`, la description de la commande inclut un indicateur `[arrière-plan]` afin de préciser clairement le mode d’exécution.

## Variables d’environnement

Lorsque `run_shell_command` exécute une commande, elle définit la variable d’environnement `QWEN_CODE=1` dans l’environnement du sous-processus. Cela permet aux scripts ou outils de détecter s’ils sont exécutés depuis l’interface en ligne de commande (CLI).

## Restrictions relatives aux commandes

Vous pouvez restreindre les commandes pouvant être exécutées par l’outil `run_shell_command` en utilisant les paramètres `tools.core` et `tools.exclude` dans votre fichier de configuration.

- `tools.core` : Pour limiter `run_shell_command` à un ensemble spécifique de commandes, ajoutez des entrées à la liste `core` sous la catégorie `tools`, au format `run_shell_command(<commande>)`. Par exemple, `"tools": {"core": ["run_shell_command(git)"]}` n’autorisera que les commandes `git`. L’inclusion de l’entrée générique `run_shell_command` agit comme un joker, autorisant toute commande non explicitement bloquée.
- `tools.exclude` : Pour bloquer des commandes spécifiques, ajoutez des entrées à la liste `exclude` sous la catégorie `tools`, au format `run_shell_command(<commande>)`. Par exemple, `"tools": {"exclude": ["run_shell_command(rm)"]}` bloquera les commandes `rm`.

La logique de validation est conçue pour être à la fois sécurisée et souple :

1.  **Chaînage de commandes désactivé** : L’outil divise automatiquement les commandes chaînées avec `&&`, `||` ou `;` et valide chaque partie séparément. Si l’une quelconque des parties de la chaîne est interdite, la commande entière est bloquée.
2.  **Correspondance par préfixe** : L’outil utilise une correspondance par préfixe. Par exemple, si vous autorisez `git`, vous pouvez exécuter `git status` ou `git log`.
3.  **Précédence de la liste de blocage** : La liste `tools.exclude` est toujours vérifiée en premier. Si une commande correspond à un préfixe bloqué, elle sera refusée, même si elle correspond également à un préfixe autorisé dans `tools.core`.

### Exemples de restrictions de commandes

**Autoriser uniquement certains préfixes de commande**

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

**Bloquer certains préfixes de commande**

Pour bloquer la commande `rm` tout en autorisant toutes les autres commandes :

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

Si un préfixe de commande figure à la fois dans `tools.core` et dans `tools.exclude`, il sera bloqué.

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

Pour bloquer toutes les commandes shell, ajoutez la forme générique `run_shell_command` à `tools.exclude` :

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

Les restrictions spécifiques à une commande dans `excludeTools` pour `run_shell_command` reposent sur une simple correspondance de chaînes de caractères et peuvent être facilement contournées. Cette fonctionnalité **n’est pas un mécanisme de sécurité** et ne doit pas être utilisée pour exécuter en toute sécurité du code non fiable. Il est recommandé d’utiliser `coreTools` afin de sélectionner explicitement les commandes pouvant être exécutées.