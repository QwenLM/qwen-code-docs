# Outil Shell (`run_shell_command`)

Ce document décrit l'outil `run_shell_command` pour Qwen Code.

## Description

Utilisez `run_shell_command` pour interagir avec le système sous-jacent, exécuter des scripts ou effectuer des opérations en ligne de commande. `run_shell_command` exécute une commande shell donnée. Sur Windows, la commande sera exécutée avec `cmd.exe /c`. Sur les autres plateformes, la commande sera exécutée avec `bash -c`.

### Arguments

`run_shell_command` prend les arguments suivants :

- `command` (string, requis) : La commande shell exacte à exécuter.
- `description` (string, optionnel) : Une brève description de l'objectif de la commande, qui sera affichée à l'utilisateur.
- `directory` (string, optionnel) : Le répertoire (relatif à la racine du projet) dans lequel exécuter la commande. Si non spécifié, la commande s'exécute dans la racine du projet.
- `is_background` (boolean, requis) : Indique s'il faut exécuter la commande en arrière-plan. Ce paramètre est obligatoire pour s'assurer que le mode d'exécution est choisi explicitement. Définir à `true` pour les processus longs comme les serveurs de développement, les watchers ou les daemons qui doivent continuer à fonctionner sans bloquer les commandes suivantes. Définir à `false` pour les commandes ponctuelles qui doivent se terminer avant de continuer.

## Comment utiliser `run_shell_command` avec Qwen Code

Lorsque vous utilisez `run_shell_command`, la commande est exécutée en tant que sous-processus. Vous pouvez contrôler si les commandes s'exécutent en arrière-plan ou en avant-plan en utilisant le paramètre `is_background`, ou en ajoutant explicitement `&` aux commandes. L'outil renvoie des informations détaillées sur l'exécution, notamment :

### Paramètre obligatoire `is_background`

Le paramètre `is_background` est **obligatoire** pour toutes les exécutions de commandes. Cette conception garantit que le LLM (et les utilisateurs) doit explicitement décider si chaque commande doit s'exécuter en arrière-plan ou en avant-plan, favorisant ainsi un comportement d'exécution intentionnel et prévisible. En rendant ce paramètre obligatoire, nous évitons les retours involontaires à l'exécution en avant-plan, ce qui pourrait bloquer les opérations suivantes lors du traitement de processus longs.

### Exécution en arrière-plan vs premier plan

L'outil gère intelligemment l'exécution en arrière-plan et en premier plan selon votre choix explicite :

**Utilisez l'exécution en arrière-plan (`is_background: true`) pour :**

- Les serveurs de développement longue durée : `npm run start`, `npm run dev`, `yarn dev`
- Les watchers de build : `npm run watch`, `webpack --watch`
- Les serveurs de base de données : `mongod`, `mysql`, `redis-server`
- Les serveurs web : `python -m http.server`, `php -S localhost:8000`
- Toute commande prévue pour s'exécuter indéfiniment jusqu'à un arrêt manuel

**Utilisez l'exécution en premier plan (`is_background: false`) pour :**

- Les commandes ponctuelles : `ls`, `cat`, `grep`
- Les commandes de build : `npm run build`, `make`
- Les commandes d'installation : `npm install`, `pip install`
- Les opérations Git : `git commit`, `git push`
- Les exécutions de tests : `npm test`, `pytest`

### Informations d'exécution

L'outil retourne des informations détaillées sur l'exécution, incluant :

- `Command` : La commande qui a été exécutée.
- `Directory` : Le répertoire dans lequel la commande a été lancée.
- `Stdout` : La sortie du flux standard.
- `Stderr` : La sortie du flux d'erreur standard.
- `Error` : Tout message d'erreur rapporté par le sous-processus.
- `Exit Code` : Le code de sortie de la commande.
- `Signal` : Le numéro du signal si la commande a été terminée par un signal.
- `Background PIDs` : Une liste des PIDs des processus lancés en arrière-plan.

Utilisation :

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**Note :** Le paramètre `is_background` est obligatoire et doit être explicitement spécifié pour chaque exécution de commande.

## Exemples `run_shell_command`

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

Démarrer un serveur en arrière-plan (alternative avec & explicite) :

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

Exécuter une commande de build en premier plan :

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

Démarrer plusieurs services en arrière-plan :

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## Notes importantes

- **Sécurité :** Soyez prudent lors de l'exécution de commandes, en particulier celles construites à partir d'entrées utilisateur, afin d'éviter les vulnérabilités de sécurité.
- **Commandes interactives :** Évitez les commandes qui nécessitent une entrée utilisateur interactive, car cela peut bloquer l'outil. Utilisez des options non interactives si disponibles (par exemple, `npm init -y`).
- **Gestion des erreurs :** Vérifiez les champs `Stderr`, `Error` et `Exit Code` pour déterminer si une commande s'est exécutée avec succès.
- **Processus en arrière-plan :** Lorsque `is_background=true` ou quand une commande contient `&`, l'outil retourne immédiatement la main et le processus continue de s'exécuter en arrière-plan. Le champ `Background PIDs` contiendra l'identifiant du processus en arrière-plan.
- **Choix d'exécution en arrière-plan :** Le paramètre `is_background` est obligatoire et permet un contrôle explicite sur le mode d'exécution. Vous pouvez également ajouter `&` à la commande pour une exécution manuelle en arrière-plan, mais le paramètre `is_background` doit tout de même être spécifié. Ce paramètre rend l'intention plus claire et gère automatiquement la configuration de l'exécution en arrière-plan.
- **Descriptions des commandes :** Lors de l'utilisation de `is_background=true`, la description de la commande inclura un indicateur `[background]` pour montrer clairement le mode d'exécution.

## Variables d'environnement

Lorsque `run_shell_command` exécute une commande, elle définit la variable d'environnement `QWEN_CODE=1` dans l'environnement du sous-processus. Cela permet aux scripts ou aux outils de détecter s'ils sont exécutés depuis l'CLI.

## Restrictions des commandes

Vous pouvez restreindre les commandes exécutables par l'outil `run_shell_command` en utilisant les paramètres `coreTools` et `excludeTools` dans votre fichier de configuration.

- `coreTools` : Pour limiter `run_shell_command` à un ensemble spécifique de commandes, ajoutez des entrées à la liste `coreTools` au format `run_shell_command(<command>)`. Par exemple, `"coreTools": ["run_shell_command(git)"]` n'autorisera que les commandes `git`. Inclure le `run_shell_command` générique agit comme un joker, autorisant toute commande non explicitement bloquée.
- `excludeTools` : Pour bloquer des commandes spécifiques, ajoutez des entrées à la liste `excludeTools` au format `run_shell_command(<command>)`. Par exemple, `"excludeTools": ["run_shell_command(rm)"]` bloquera les commandes `rm`.

La logique de validation est conçue pour être sécurisée et flexible :

1. **Chaînage des commandes désactivé** : L'outil divise automatiquement les commandes chaînées avec `&&`, `||`, ou `;` et valide chaque partie séparément. Si une partie de la chaîne est interdite, la commande entière est bloquée.
2. **Correspondance par préfixe** : L'outil utilise la correspondance par préfixe. Par exemple, si vous autorisez `git`, vous pouvez exécuter `git status` ou `git log`.
3. **Priorité de la liste de blocage** : La liste `excludeTools` est toujours vérifiée en premier. Si une commande correspond à un préfixe bloqué, elle sera refusée, même si elle correspond également à un préfixe autorisé dans `coreTools`.

### Exemples de restriction de commandes

**Autoriser uniquement des préfixes de commandes spécifiques**

Pour autoriser uniquement les commandes `git` et `npm`, et bloquer toutes les autres :

```json
{
  "coreTools": ["run_shell_command(git)", "run_shell_command(npm)"]
}
```

- `git status` : Autorisé
- `npm install` : Autorisé
- `ls -l` : Bloqué

**Bloquer des préfixes de commandes spécifiques**

Pour bloquer `rm` et autoriser toutes les autres commandes :

```json
{
  "coreTools": ["run_shell_command"],
  "excludeTools": ["run_shell_command(rm)"]
}
```

- `rm -rf /` : Bloqué
- `git status` : Autorisé
- `npm install` : Autorisé

**La liste noire (blocklist) est prioritaire**

Si un préfixe de commande est présent à la fois dans `coreTools` et `excludeTools`, il sera bloqué.

```json
{
  "coreTools": ["run_shell_command(git)"],
  "excludeTools": ["run_shell_command(git push)"]
}
```

- `git push origin main` : Bloqué
- `git status` : Autorisé

**Bloquer toutes les commandes shell**

Pour bloquer toutes les commandes shell, ajoutez le wildcard `run_shell_command` à `excludeTools` :

```json
{
  "excludeTools": ["run_shell_command"]
}
```

- `ls -l` : Bloqué
- `n'importe quelle autre commande` : Bloquée

## Note de sécurité pour `excludeTools`

Les restrictions spécifiques aux commandes dans `excludeTools` pour `run_shell_command` sont basées sur une simple correspondance de chaînes de caractères et peuvent être facilement contournées. Cette fonctionnalité **n'est pas un mécanisme de sécurité** et ne doit pas être utilisée pour exécuter du code non fiable en toute sécurité. Il est recommandé d'utiliser `coreTools` pour sélectionner explicitement les commandes qui peuvent être exécutées.