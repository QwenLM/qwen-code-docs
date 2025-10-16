# Commandes CLI

Qwen Code prend en charge plusieurs commandes intégrées pour vous aider à gérer votre session, personnaliser l'interface et contrôler son comportement. Ces commandes sont préfixées par une barre oblique (`/`), un symbole arobase (`@`) ou un point d'exclamation (`!`).

## Commandes slash (`/`)

Les commandes slash fournissent un contrôle au niveau méta sur le CLI lui-même.

### Built-in Commands

- **`/bug`**
  - **Description:** File an issue about Qwen Code. By default, the issue is filed within the GitHub repository for Qwen Code. The string you enter after `/bug` will become the headline for the bug being filed. The default `/bug` behavior can be modified using the `bugCommand` setting in your `.qwen/settings.json` files.

- **`/chat`**
  - **Description:** Save and resume conversation history for branching conversation state interactively, or resuming a previous state from a later session.
  - **Sub-commands:**
    - **`save`**
      - **Description:** Saves the current conversation history. You must add a `<tag>` for identifying the conversation state.
      - **Usage:** `/chat save <tag>`
      - **Details on Checkpoint Location:** The default locations for saved chat checkpoints are:
        - Linux/macOS: `~/.qwen/tmp/<project_hash>/`
        - Windows: `C:\Users\<YourUsername>\.qwen\tmp\<project_hash>\`
        - When you run `/chat list`, the CLI only scans these specific directories to find available checkpoints.
        - **Note:** These checkpoints are for manually saving and resuming conversation states. For automatic checkpoints created before file modifications, see the [Checkpointing documentation](../checkpointing.md).
    - **`resume`**
      - **Description:** Resumes a conversation from a previous save.
      - **Usage:** `/chat resume <tag>`
    - **`list`**
      - **Description:** Lists available tags for chat state resumption.
    - **`delete`**
      - **Description:** Deletes a saved conversation checkpoint.
      - **Usage:** `/chat delete <tag>`

- **`/clear`**
  - **Description:** Clear the terminal screen, including the visible session history and scrollback within the CLI. The underlying session data (for history recall) might be preserved depending on the exact implementation, but the visual display is cleared.
  - **Keyboard shortcut:** Press **Ctrl+L** at any time to perform a clear action.

- **`/summary`**
  - **Description:** Generate a comprehensive project summary from the current conversation history and save it to `.qwen/PROJECT_SUMMARY.md`. This summary includes the overall goal, key knowledge, recent actions, and current plan, making it perfect for resuming work in future sessions.
  - **Usage:** `/summary`
  - **Features:**
    - Analyzes the entire conversation history to extract important context
    - Creates a structured markdown summary with sections for goals, knowledge, actions, and plans
    - Automatically saves to `.qwen/PROJECT_SUMMARY.md` in your project root
    - Shows progress indicators during generation and saving
    - Integrates with the Welcome Back feature for seamless session resumption
  - **Note:** This command requires an active conversation with at least 2 messages to generate a meaningful summary.

- **`/compress`**
  - **Description:** Replace the entire chat context with a summary. This saves on tokens used for future tasks while retaining a high level summary of what has happened.

- **`/copy`**
  - **Description:** Copies the last output produced by Qwen Code to your clipboard, for easy sharing or reuse.

- **`/directory`** (or **`/dir`**)
  - **Description:** Manage workspace directories for multi-directory support.
  - **Sub-commands:**
    - **`add`**:
      - **Description:** Add a directory to the workspace. The path can be absolute or relative to the current working directory. Moreover, the reference from home directory is supported as well.
      - **Usage:** `/directory add <path1>,<path2>`
      - **Note:** Disabled in restrictive sandbox profiles. If you're using that, use `--include-directories` when starting the session instead.
    - **`show`**:
      - **Description:** Display all directories added by `/directory add` and `--include-directories`.
      - **Usage:** `/directory show`

- **`/directory`** (or **`/dir`**)
  - **Description:** Manage workspace directories for multi-directory support.
  - **Sub-commands:**
    - **`add`**:
      - **Description:** Add a directory to the workspace. The path can be absolute or relative to the current working directory. Moreover, the reference from home directory is supported as well.
      - **Usage:** `/directory add <path1>,<path2>`
      - **Note:** Disabled in restrictive sandbox profiles. If you're using that, use `--include-directories` when starting the session instead.
    - **`show`**:
      - **Description:** Display all directories added by `/directory add` and `--include-directories`.
      - **Usage:** `/directory show`

- **`/editor`**
  - **Description:** Open a dialog for selecting supported editors.

- **`/extensions`**
  - **Description:** Lists all active extensions in the current Qwen Code session. See [Qwen Code Extensions](../extension.md).

- **`/help`** (or **`/?`**)
  - **Description:** Display help information about the Qwen Code, including available commands and their usage.

- **`/mcp`**
  - **Description:** List configured Model Context Protocol (MCP) servers, their connection status, server details, and available tools.
  - **Sub-commands:**
    - **`desc`** or **`descriptions`**:
      - **Description:** Show detailed descriptions for MCP servers and tools.
    - **`nodesc`** or **`nodescriptions`**:
      - **Description:** Hide tool descriptions, showing only the tool names.
    - **`schema`**:
      - **Description:** Show the full JSON schema for the tool's configured parameters.
  - **Keyboard Shortcut:** Press **Ctrl+T** at any time to toggle between showing and hiding tool descriptions.

- **`/memory`**
  - **Description:** Manage the AI's instructional context (hierarchical memory loaded from `QWEN.md` files by default; configurable via `contextFileName`).
  - **Sub-commands:**
    - **`add`**:
      - **Description:** Adds the following text to the AI's memory. Usage: `/memory add <text to remember>`
    - **`show`**:
      - **Description:** Display the full, concatenated content of the current hierarchical memory that has been loaded from all context files (e.g., `QWEN.md`). This lets you inspect the instructional context being provided to the model.
    - **`refresh`**:
      - **Description:** Reload the hierarchical instructional memory from all context files (default: `QWEN.md`) found in the configured locations (global, project/ancestors, and sub-directories). This updates the model with the latest context content.
    - **Note:** For more details on how context files contribute to hierarchical memory, see the [CLI Configuration documentation](./configuration.md#context-files-hierarchical-instructional-context).

- **`/restore`**
  - **Description:** Restores the project files to the state they were in just before a tool was executed. This is particularly useful for undoing file edits made by a tool. If run without a tool call ID, it will list available checkpoints to restore from.
  - **Usage:** `/restore [tool_call_id]`
  - **Note:** Only available if the CLI is invoked with the `--checkpointing` option or configured via [settings](./configuration.md). See [Checkpointing documentation](../checkpointing.md) for more details.

- **`/settings`**
  - **Description:** Open the settings editor to view and modify Qwen Code settings.
  - **Details:** This command provides a user-friendly interface for changing settings that control the behavior and appearance of Qwen Code. It is equivalent to manually editing the `.qwen/settings.json` file, but with validation and guidance to prevent errors.
  - **Usage:** Simply run `/settings` and the editor will open. You can then browse or search for specific settings, view their current values, and modify them as desired. Changes to some settings are applied immediately, while others require a restart.

- **`/stats`**
  - **Description:** Display detailed statistics for the current Qwen Code session, including token usage, cached token savings (when available), and session duration. Note: Cached token information is only displayed when cached tokens are being used, which occurs with API key authentication but not with OAuth authentication at this time.

- [**`/theme`**](./themes.md)
  - **Description:** Open a dialog that lets you change the visual theme of Qwen Code.

- **`/auth`**
  - **Description:** Open a dialog that lets you change the authentication method.

- **`/approval-mode`**
  - **Description:** Change the approval mode for tool usage.
  - **Usage:** `/approval-mode [mode] [--session|--project|--user]`
  - **Available Modes:**
    - **`plan`**: Analyze only; do not modify files or execute commands
    - **`default`**: Require approval for file edits or shell commands
    - **`auto-edit`**: Automatically approve file edits
    - **`yolo`**: Automatically approve all tools
  - **Examples:**
    - `/approval-mode plan --project` (persist plan mode for this project)
    - `/approval-mode yolo --user` (persist YOLO mode for this user across projects)

- **`/about`**
  - **Description:** Show version info. Please share this information when filing issues.

- **`/agents`**
  - **Description:** Manage specialized AI subagents for focused tasks. Subagents are independent AI assistants configured with specific expertise and tool access.
  - **Sub-commands:**
    - **`create`**:
      - **Description:** Launch an interactive wizard to create a new subagent. The wizard guides you through location selection, AI-powered prompt generation, tool selection, and visual customization.
      - **Usage:** `/agents create`
    - **`manage`**:
      - **Description:** Open an interactive management dialog to view, edit, and delete existing subagents. Shows both project-level and user-level agents.
      - **Usage:** `/agents manage`
  - **Storage Locations:**
    - **Project-level:** `.qwen/agents/` (shared with team, takes precedence)
    - **User-level:** `~/.qwen/agents/` (personal agents, available across projects)
  - **Note:** For detailed information on creating and managing subagents, see the [Subagents documentation](../subagents.md).

- [**`/tools`**](../tools/index.md)
  - **Description:** Display a list of tools that are currently available within Qwen Code.
  - **Usage:** `/tools [desc]`
  - **Sub-commands:**
    - **`desc`** or **`descriptions`**:
      - **Description:** Show detailed descriptions of each tool, including each tool's name with its full description as provided to the model.
    - **`nodesc`** or **`nodescriptions`**:
      - **Description:** Hide tool descriptions, showing only the tool names.

- **`/privacy`**
  - **Description:** Display the Privacy Notice and allow users to select whether they consent to the collection of their data for service improvement purposes.

- **`/quit-confirm`**
  - **Description:** Show a confirmation dialog before exiting Qwen Code, allowing you to choose how to handle your current session.
  - **Usage:** `/quit-confirm`
  - **Features:**
    - **Quit immediately:** Exit without saving anything (equivalent to `/quit`)
    - **Generate summary and quit:** Create a project summary using `/summary` before exiting
    - **Save conversation and quit:** Save the current conversation with an auto-generated tag before exiting
  - **Keyboard shortcut:** Press **Ctrl+C** twice to trigger the quit confirmation dialog
  - **Note:** This command is automatically triggered when you press Ctrl+C once, providing a safety mechanism to prevent accidental exits.

- **`/quit`** (or **`/exit`**)
  - **Description:** Exit Qwen Code immediately without any confirmation dialog.

- **`/vim`**
  - **Description:** Toggle vim mode on or off. When vim mode is enabled, the input area supports vim-style navigation and editing commands in both NORMAL and INSERT modes.
  - **Features:**
    - **NORMAL mode:** Navigate with `h`, `j`, `k`, `l`; jump by words with `w`, `b`, `e`; go to line start/end with `0`, `$`, `^`; go to specific lines with `G` (or `gg` for first line)
    - **INSERT mode:** Standard text input with escape to return to NORMAL mode
    - **Editing commands:** Delete with `x`, change with `c`, insert with `i`, `a`, `o`, `O`; complex operations like `dd`, `cc`, `dw`, `cw`
    - **Count support:** Prefix commands with numbers (e.g., `3h`, `5w`, `10G`)
    - **Repeat last command:** Use `.` to repeat the last editing operation
    - **Persistent setting:** Vim mode preference is saved to `~/.qwen/settings.json` and restored between sessions
  - **Status indicator:** When enabled, shows `[NORMAL]` or `[INSERT]` in the footer

- **`/init`**
  - **Description:** Analyzes the current directory and creates a `QWEN.md` context file by default (or the filename specified by `contextFileName`). If a non-empty file already exists, no changes are made. The command seeds an empty file and prompts the model to populate it with project-specific instructions.

### Commandes personnalisées

Pour un démarrage rapide, consultez l'[exemple](#example-a-pure-function-refactoring-command) ci-dessous.

Les commandes personnalisées vous permettent de sauvegarder et de réutiliser vos prompts favoris ou les plus fréquemment utilisés comme des raccourcis personnels au sein de Qwen Code. Vous pouvez créer des commandes spécifiques à un seul projet ou des commandes disponibles globalement sur tous vos projets, ce qui rationalise votre workflow et garantit la cohérence.

#### Emplacement des fichiers & Priorité

Qwen Code découvre les commandes à partir de deux emplacements, chargés dans un ordre spécifique :

1.  **Commandes utilisateur (globales) :** Situées dans `~/.qwen/commands/`. Ces commandes sont disponibles dans n'importe quel projet sur lequel vous travaillez.
2.  **Commandes de projet (locales) :** Situées dans `<your-project-root>/.qwen/commands/`. Ces commandes sont spécifiques au projet en cours et peuvent être ajoutées au contrôle de version pour être partagées avec votre équipe.

Si une commande dans le répertoire du projet porte le même nom qu'une commande dans le répertoire utilisateur, **la commande du projet sera toujours utilisée.** Cela permet aux projets de remplacer les commandes globales par des versions spécifiques au projet.

#### Nommer et structurer les espaces de noms

Le nom d'une commande est déterminé par son chemin de fichier relatif au répertoire `commands`. Les sous-répertoires sont utilisés pour créer des commandes avec un espace de noms, le séparateur de chemin (`/` ou `\`) étant converti en deux-points (`:`).

- Un fichier situé à `~/.qwen/commands/test.toml` devient la commande `/test`.
- Un fichier situé à `<project>/.qwen/commands/git/commit.toml` devient la commande namespacée `/git:commit`.

#### Format de fichier TOML (v1)

Vos fichiers de définition de commande doivent être écrits au format TOML et utiliser l'extension `.toml`.

##### Champs obligatoires

- `prompt` (String) : Le prompt qui sera envoyé au modèle lorsque la commande est exécutée. Il peut s'agir d'une chaîne sur une seule ligne ou multi-lignes.

##### Champs optionnels

- `description` (String) : Une brève description, sur une seule ligne, expliquant ce que fait la commande. Ce texte sera affiché à côté de votre commande dans le menu `/help`. **Si vous omettez ce champ, une description générique sera générée à partir du nom du fichier.**

#### Gestion des Arguments

Les commandes personnalisées prennent en charge deux méthodes puissantes pour gérer les arguments. Le CLI choisit automatiquement la bonne méthode en fonction du contenu de votre `prompt`.

##### 1. Injection Contextuelle avec `{{args}}`

Si votre `prompt` contient le placeholder spécial `{{args}}`, le CLI remplacera ce placeholder par le texte que l'utilisateur a tapé après le nom de la commande.

Le comportement de cette injection dépend de l'endroit où elle est utilisée :

**A. Injection Brute (En dehors des Commandes Shell)**

Lorsqu'elle est utilisée dans le corps principal du prompt, les arguments sont injectés exactement comme l'utilisateur les a tapés.

**Exemple (`git/fix.toml`) :**

```toml

# Appelé via : /git:fix "Button is misaligned"

description = "Génère un correctif pour un problème donné."
prompt = "Veuillez fournir un correctif de code pour le problème décrit ici : {{args}}."
```

Le modèle reçoit : `Veuillez fournir un correctif de code pour le problème décrit ici : "Button is misaligned".`

**B. Utilisation des Arguments dans les Commandes Shell (À l'intérieur des Blocs `!{...}`)**

Lorsque vous utilisez `{{args}}` à l'intérieur d'un bloc d'injection shell (`!{...}`), les arguments sont automatiquement **échappés pour le shell** avant remplacement. Cela vous permet de passer en toute sécurité des arguments aux commandes shell, garantissant que la commande résultante est syntaxiquement correcte et sécurisée tout en évitant les vulnérabilités d'injection de commande.

**Exemple (`/grep-code.toml`) :**

```toml
prompt = """
Veuillez résumer les résultats pour le motif `{{args}}`.

Résultats de la recherche :
!{grep -r {{args}} .}
"""
```

Lorsque vous exécutez `/grep-code It's complicated` :

1. Le CLI détecte que `{{args}}` est utilisé à la fois en dehors et à l'intérieur de `!{...}`.
2. En dehors : Le premier `{{args}}` est remplacé tel quel par `It's complicated`.
3. À l'intérieur : Le second `{{args}}` est remplacé par la version échappée (par exemple, sur Linux : `"It's complicated"`).
4. La commande exécutée est `grep -r "It's complicated" .`.
5. Le CLI vous demande de confirmer cette commande exacte et sécurisée avant exécution.
6. Le prompt final est envoyé.

##### 2. Gestion des arguments par défaut

Si votre `prompt` ne contient **pas** le placeholder spécial `{{args}}`, la CLI utilise un comportement par défaut pour gérer les arguments.

Si vous fournissez des arguments à la commande (par exemple, `/mycommand arg1`), la CLI ajoutera la commande complète que vous avez tapée à la fin du prompt, séparée par deux sauts de ligne. Cela permet au modèle de voir à la fois les instructions originales et les arguments spécifiques que vous venez de fournir.

Si vous ne fournissez **aucun** argument (par exemple, `/mycommand`), le prompt est envoyé au modèle tel quel, sans rien ajouter.

**Exemple (`changelog.toml`) :**

Cet exemple montre comment créer une commande robuste en définissant un rôle pour le modèle, en expliquant où trouver l'entrée de l'utilisateur, et en spécifiant le format et le comportement attendus.

```toml

# In: <project>/.qwen/commands/changelog.toml

# Invoqué via : /changelog 1.2.0 added "Support for default argument parsing."

description = "Ajoute une nouvelle entrée au fichier CHANGELOG.md du projet."
prompt = """

# Tâche : Mettre à jour le Changelog

Vous êtes un mainteneur expert de ce projet logiciel. Un utilisateur a invoqué une commande pour ajouter une nouvelle entrée au changelog.

**La commande brute de l'utilisateur est ajoutée ci-dessous vos instructions.**

Votre tâche consiste à parser `<version>`, `<change_type>`, et `<message>` depuis leur input et utiliser l'outil `write_file` pour mettre à jour correctement le fichier `CHANGELOG.md`.

## Format attendu
La commande suit ce format : `/changelog <version> <type> <message>`
- `<type>` doit être parmi : "added", "changed", "fixed", "removed"."""

## Comportement
1. Lire le fichier `CHANGELOG.md`.
2. Trouver la section correspondant à la `<version>` spécifiée.
3. Ajouter le `<message>` sous l'en-tête `<type>` approprié.
4. Si la section version ou type n'existe pas, la créer.
5. Suivre strictement le format "Keep a Changelog".
"""
```

Lorsque vous exécutez `/changelog 1.2.0 added "New feature"`, le texte final envoyé au modèle sera le prompt original suivi de deux sauts de ligne et de la commande que vous avez tapée.

##### 3. Exécution de commandes Shell avec `!{...}`

Vous pouvez rendre vos commandes dynamiques en exécutant directement des commandes shell au sein de votre `prompt` et en injectant leur sortie. C'est idéal pour récupérer du contexte depuis votre environnement local, comme lire le contenu d'un fichier ou vérifier l'état d'un dépôt Git.

Lorsqu'une commande personnalisée tente d'exécuter une commande shell, Qwen Code vous demandera maintenant une confirmation avant de procéder. Il s'agit d'une mesure de sécurité pour s'assurer que seules les commandes intentionnelles sont exécutées.

**Fonctionnement :**

1. **Injection de commandes :** Utilisez la syntaxe `!{...}`.
2. **Substitution d'arguments :** Si `{{args}}` est présent à l'intérieur du bloc, il est automatiquement échappé pour le shell (voir [Injection contextuelle](#1-context-aware-injection-with-args) ci-dessus).
3. **Parsing robuste :** L'analyseur gère correctement les commandes shell complexes contenant des accolades imbriquées, comme des payloads JSON. **Note :** Le contenu à l'intérieur de `!{...}` doit avoir des accolades équilibrées (`{` et `}`). Si vous devez exécuter une commande contenant des accolades non équilibrées, envisagez de l'encapsuler dans un script externe et d'appeler ce script à l'intérieur du bloc `!{...}`.
4. **Vérification de sécurité et confirmation :** Le CLI effectue une vérification de sécurité sur la commande finale résolue (après échappement et substitution des arguments). Une boîte de dialogue apparaîtra montrant la ou les commandes exactes à exécuter.
5. **Exécution et rapport d'erreurs :** La commande est exécutée. Si la commande échoue, la sortie injectée dans le prompt inclura les messages d'erreur (stderr) suivis d'une ligne indiquant le statut, par exemple `[Shell command exited with code 1]`. Cela permet au modèle de comprendre le contexte de l'échec.

**Exemple (`git/commit.toml`) :**

Cette commande récupère le diff git staged et l'utilise pour demander au modèle d'écrire un message de commit.

````toml

# Dans : <project>/.qwen/commands/git/commit.toml

# Invoqué via : /git:commit

description = "Génère un message de commit Git basé sur les modifications stagées."

# Le prompt utilise !{...} pour exécuter la commande et injecter sa sortie.
prompt = """
Veuillez générer un message de commit Conventional Commit basé sur le git diff suivant :

```diff
!{git diff --staged}
```

"""

````

Lorsque vous exécutez `/git:commit`, le CLI exécute d'abord `git diff --staged`, puis remplace `!{git diff --staged}` par la sortie de cette commande avant d'envoyer le prompt final et complet au modèle.

##### 4. Injection du contenu d'un fichier avec `@{...}`

Vous pouvez directement intégrer le contenu d'un fichier ou une liste de répertoires dans votre prompt en utilisant la syntaxe `@{...}`. Cela est utile pour créer des commandes qui agissent sur des fichiers spécifiques.

**Fonctionnement :**

- **Injection de fichier** : `@{chemin/vers/fichier.txt}` est remplacé par le contenu de `fichier.txt`.
- **Support multimodal** : Si le chemin pointe vers une image supportée (ex. : PNG, JPEG), un PDF, un fichier audio ou vidéo, il sera correctement encodé et injecté comme entrée multimodale. Les autres fichiers binaires sont gérés proprement et ignorés.
- **Liste de répertoires** : `@{chemin/vers/dossier}` est parcouru et chaque fichier présent dans ce dossier ainsi que dans tous ses sous-dossiers est inséré dans le prompt. Cette opération respecte les fichiers `.gitignore` et `.qwenignore`, si activés.
- **Prise en compte de l'espace de travail** : La commande recherche le chemin dans le répertoire courant ainsi que dans les autres répertoires définis dans l’espace de travail. Les chemins absolus sont autorisés s'ils se trouvent à l'intérieur de cet espace.
- **Ordre de traitement** : L'injection du contenu via `@{...}` est effectuée _avant_ l’exécution des commandes shell (`!{...}`) et la substitution d’arguments (`{{args}}`).
- **Analyse syntaxique** : Le parseur exige que le contenu entre accolades dans `@{...}` (le chemin) soit bien équilibré en termes d'accolades (`{` et `}`).

**Exemple (`review.toml`) :**

Cette commande injecte le contenu d’un fichier de bonnes pratiques _fixe_ (`docs/best-practices.md`) et utilise les arguments fournis par l'utilisateur pour fournir un contexte à la revue.

```toml

```toml
# Dans : <project>/.qwen/commands/review.toml

# Invoqué via : /review FileCommandLoader.ts

description = "Examine le contexte fourni en utilisant un guide de bonnes pratiques."
prompt = """
Vous êtes un expert en revue de code.

Votre tâche consiste à examiner {{args}}.

Utilisez les bonnes pratiques suivantes lors de votre revue :

@{docs/best-practices.md}
```

Lorsque vous exécutez `/review FileCommandLoader.ts`, le placeholder `@{docs/best-practices.md}` est remplacé par le contenu de ce fichier, et `{{args}}` est remplacé par le texte que vous avez fourni, avant que le prompt final soit envoyé au modèle.

---

#### Exemple : Commande de refactoring "Fonction Pure"

Créons une commande globale qui demande au modèle de refactorer un morceau de code.

**1. Créez le fichier et les répertoires :**

Tout d'abord, assurez-vous que le répertoire des commandes utilisateur existe, puis créez un sous-répertoire `refactor` pour l'organisation et le fichier TOML final.

```bash
mkdir -p ~/.qwen/commands/refactor
touch ~/.qwen/commands/refactor/pure.toml
```

**2. Ajoutez le contenu au fichier :**

Ouvrez `~/.qwen/commands/refactor/pure.toml` dans votre éditeur et ajoutez le contenu suivant. Nous incluons le `description` optionnel par souci de bonne pratique.

```toml

# In: ~/.qwen/commands/refactor/pure.toml

```markdown
# Cette commande sera invoquée via : /refactor:pure

description = "Demande au modèle de refactorer le contexte actuel en une fonction pure."

prompt = """
Veuillez analyser le code que j'ai fourni dans le contexte actuel.
Refactorez-le en une fonction pure.

Votre réponse doit inclure :
1. Le bloc de code de la fonction pure refactorée.
2. Une brève explication des changements clés que vous avez apportés et pourquoi ils contribuent à la pureté.
"""
```

**3. Exécutez la commande :**

C'est tout ! Vous pouvez maintenant exécuter votre commande dans le CLI. Tout d'abord, vous pouvez ajouter un fichier au contexte, puis invoquer votre commande :

```
> @my-messy-function.js
> /refactor:pure
```

Qwen Code exécutera alors le prompt multiligne défini dans votre fichier TOML.

## Commandes At (`@`)

Les commandes At sont utilisées pour inclure le contenu de fichiers ou de répertoires dans votre prompt envoyé au modèle. Ces commandes prennent en compte le filtrage git-aware.

- **`@<chemin_du_fichier_ou_répertoire>`**
  - **Description :** Injecte le contenu du fichier ou des fichiers spécifiés dans votre prompt actuel. Cela est utile pour poser des questions sur un code spécifique, un texte ou une collection de fichiers.
  - **Exemples :**
    - `@chemin/vers/votre/fichier.txt Explique ce texte.`
    - `@src/mon_projet/ Résume le code dans ce répertoire.`
    - `De quoi parle ce fichier ? @README.md`
  - **Détails :**
    - Si un chemin vers un seul fichier est fourni, le contenu de ce fichier est lu.
    - Si un chemin vers un répertoire est fourni, la commande tente de lire le contenu des fichiers présents dans ce répertoire et ses sous-répertoires.
    - Les espaces dans les chemins doivent être échappés avec un antislash (ex. : `@Mes\ Documents/fichier.txt`).
    - La commande utilise l'outil `read_many_files` en interne. Le contenu est récupéré puis inséré dans votre requête avant d'être envoyé au modèle.
    - **Filtrage git-aware :** Par défaut, les fichiers ignorés par git (comme `node_modules/`, `dist/`, `.env`, `.git/`) sont exclus. Ce comportement peut être modifié via les paramètres `fileFiltering`.
    - **Types de fichiers :** La commande est destinée aux fichiers textuels. Bien qu'elle puisse tenter de lire n’importe quel fichier, les fichiers binaires ou très volumineux peuvent être ignorés ou tronqués par l’outil `read_many_files` afin de garantir performances et pertinence. L’outil indique si certains fichiers ont été ignorés.
  - **Sortie :** Le CLI affichera un message d'appel à l'outil indiquant que `read_many_files` a été utilisé, accompagné d’un message détaillant le statut ainsi que les chemins traités.

- **`@` (Symbole @ seul)**
  - **Description :** Si vous saisissez uniquement le symbole `@` sans préciser de chemin, la requête est transmise telle quelle au modèle. Cela peut être utile si vous discutez explicitement _du_ symbole `@` dans votre prompt.

### Gestion des erreurs pour les commandes `@`

- Si le chemin spécifié après `@` n'est pas trouvé ou est invalide, un message d'erreur sera affiché, et la requête pourrait ne pas être envoyée au modèle, ou elle sera envoyée sans le contenu du fichier.
- Si l'outil `read_many_files` rencontre une erreur (par exemple, des problèmes de permissions), cela sera également signalé.

## Mode shell & commandes de relais (`!`)

Le préfixe `!` vous permet d'interagir directement avec le shell de votre système depuis Qwen Code.

- **`!<shell_command>`**
  - **Description :** Exécute la `<shell_command>` donnée en utilisant `bash` sur Linux/macOS ou `cmd.exe` sur Windows. Toute sortie ou erreur de la commande est affichée dans le terminal.
  - **Exemples :**
    - `!ls -la` (exécute `ls -la` et retourne à Qwen Code)
    - `!git status` (exécute `git status` et retourne à Qwen Code)

- **`!` (Basculer en mode shell)**
  - **Description :** Saisir `!` seul permet de basculer en mode shell.
    - **Entrée en mode shell :**
      - Lorsqu'il est actif, le mode shell utilise une coloration différente et un "Shell Mode Indicator".
      - En mode shell, le texte que vous saisissez est interprété directement comme une commande shell.
    - **Sortie du mode shell :**
      - Une fois sorti, l'interface retrouve son apparence standard et le comportement normal de Qwen Code reprend.

- **Attention pour toute utilisation de `!` :** Les commandes que vous exécutez en mode shell ont les mêmes permissions et le même impact que si vous les exécutiez directement dans votre terminal.

- **Variable d'environnement :** Lorsqu'une commande est exécutée via `!` ou en mode shell, la variable d'environnement `QWEN_CODE=1` est définie dans l'environnement du sous-processus. Cela permet aux scripts ou outils de détecter s'ils sont exécutés depuis l'interface CLI.