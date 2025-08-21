# Outil Shell (`run_shell_command`)

Ce document décrit l'outil `run_shell_command` pour Qwen Code.

## Description

Utilisez `run_shell_command` pour interagir avec le système sous-jacent, exécuter des scripts ou effectuer des opérations en ligne de commande. `run_shell_command` exécute une commande shell donnée. Sur Windows, la commande sera exécutée avec `cmd.exe /c`. Sur les autres plateformes, la commande sera exécutée avec `bash -c`.

### Arguments

`run_shell_command` prend les arguments suivants :

- `command` (string, requis) : La commande shell exacte à exécuter.
- `description` (string, optionnel) : Une brève description de l'objectif de la commande, qui sera affichée à l'utilisateur.
- `directory` (string, optionnel) : Le répertoire (relatif à la racine du projet) dans lequel exécuter la commande. Si non fourni, la commande s'exécute dans la racine du projet.

## Comment utiliser `run_shell_command` avec Qwen Code

Lors de l'utilisation de `run_shell_command`, la commande est exécutée en tant que sous-processus. `run_shell_command` peut démarrer des processus en arrière-plan en utilisant `&`. L'outil renvoie des informations détaillées sur l'exécution, notamment :

- `Command` : La commande qui a été exécutée.
- `Directory` : Le répertoire dans lequel la commande a été exécutée.
- `Stdout` : La sortie du flux standard.
- `Stderr` : La sortie du flux d'erreur standard.
- `Error` : Tout message d'erreur rapporté par le sous-processus.
- `Exit Code` : Le code de sortie de la commande.
- `Signal` : Le numéro du signal si la commande a été terminée par un signal.
- `Background PIDs` : Une liste des PIDs des processus en arrière-plan démarrés.

Utilisation :

```
run_shell_command(command="Vos commandes.", description="Votre description de la commande.", directory="Votre répertoire d'exécution.")
```

## Exemples de `run_shell_command`

Lister les fichiers dans le répertoire courant :

```
run_shell_command(command="ls -la")
```

Exécuter un script dans un répertoire spécifique :

```
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script")
```

Démarrer un serveur en arrière-plan :

```
run_shell_command(command="npm run dev &", description="Start development server in background")
```

## Notes importantes

- **Sécurité :** Soyez prudent lors de l'exécution de commandes, en particulier celles construites à partir d'entrées utilisateur, afin d'éviter les vulnérabilités de sécurité.
- **Commandes interactives :** Évitez les commandes qui nécessitent une entrée utilisateur interactive, car cela peut bloquer l'outil. Utilisez des options non interactives si disponibles (par exemple, `npm init -y`).
- **Gestion des erreurs :** Vérifiez les champs `Stderr`, `Error` et `Exit Code` pour déterminer si une commande s'est exécutée avec succès.
- **Processus en arrière-plan :** Lorsqu'une commande est lancée en arrière-plan avec `&`, l'outil retourne immédiatement la main et le processus continue de s'exécuter en arrière-plan. Le champ `Background PIDs` contiendra l'identifiant du processus exécuté en arrière-plan.

## Variables d'environnement

Lorsque `run_shell_command` exécute une commande, il définit la variable d'environnement `QWEN_CODE=1` dans l'environnement du sous-processus. Cela permet aux scripts ou outils de détecter s'ils sont exécutés depuis le CLI.

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

**La liste de blocage a priorité**

Si un préfixe de commande est à la fois dans `coreTools` et `excludeTools`, il sera bloqué.

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
- `n'importe quelle autre commande` : Bloqué

## Note de sécurité pour `excludeTools`

Les restrictions spécifiques aux commandes dans `excludeTools` pour `run_shell_command` sont basées sur une simple correspondance de chaînes de caractères et peuvent être facilement contournées. Cette fonctionnalité **n'est pas un mécanisme de sécurité** et ne doit pas être utilisée pour exécuter du code non fiable en toute sécurité. Il est recommandé d'utiliser `coreTools` pour sélectionner explicitement les commandes qui peuvent être exécutées.