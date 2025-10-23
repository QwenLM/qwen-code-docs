# Commandes CLI

Qwen Code prend en charge plusieurs commandes intégrées pour vous aider à gérer votre session, personnaliser l'interface et contrôler son comportement. Ces commandes sont préfixées par une barre oblique (`/`), un symbole arobase (`@`) ou un point d'exclamation (`!`).

## Commandes slash (`/`)

Les commandes slash fournissent un contrôle au niveau méta sur le CLI lui-même.

### Commandes intégrées

- **`/bug`**
  - **Description :** Signaler un problème concernant Qwen Code. Par défaut, le ticket est créé dans le dépôt GitHub de Qwen Code. La chaîne saisie après `/bug` devient le titre du bug signalé. Le comportement par défaut de `/bug` peut être modifié à l’aide du paramètre `advanced.bugCommand` dans vos fichiers `.qwen/settings.json`.

- **`/chat`**
  - **Description :** Sauvegarder et reprendre l’historique des conversations pour gérer des états de discussion multiples, ou reprendre une session antérieure.
  - **Sous-commandes :**
    - **`save`**
      - **Description :** Sauvegarde l'historique actuel de la conversation. Vous devez ajouter une `<tag>` pour identifier cet état de conversation.
      - **Utilisation :** `/chat save <tag>`
      - **Emplacement des points de sauvegarde :** Les emplacements par défaut sont :
        - Linux/macOS : `~/.qwen/tmp/<project_hash>/`
        - Windows : `C:\Users\<VotreNomUtilisateur>\.qwen\tmp\<project_hash>\`
        - Lorsque vous exécutez `/chat list`, le CLI ne scanne que ces répertoires spécifiques pour trouver les points de sauvegarde disponibles.
        - **Remarque :** Ces points de sauvegarde servent à enregistrer et reprendre manuellement les états de conversation. Pour les points de sauvegarde automatiques créés avant les modifications de fichiers, voir la [documentation sur les points de sauvegarde](../checkpointing.md).
    - **`resume`**
      - **Description :** Reprend une conversation depuis une sauvegarde précédente.
      - **Utilisation :** `/chat resume <tag>`
    - **`list`**
      - **Description :** Liste les tags disponibles pour reprendre un état de conversation.
    - **`delete`**
      - **Description :** Supprime un point de sauvegarde de conversation.
      - **Utilisation :** `/chat delete <tag>`
    - **`share`**
      - **Description :** Exporte la conversation actuelle vers un fichier Markdown ou JSON.
      - **Utilisation :** `/chat share file.md` ou `/chat share file.json`. Si aucun nom de fichier n’est fourni, le CLI en génère un automatiquement.

- **`/clear`**
  - **Description :** Efface l’écran du terminal, y compris l’historique visible et le défilement dans le CLI. Selon l'implémentation, les données de session sous-jacentes (pour rappel d’historique) peuvent être conservées, mais l'affichage visuel est effacé.
  - **Raccourci clavier :** Appuyez sur **Ctrl+L** à tout moment pour effectuer cette action.

- **`/summary`**
  - **Description :** Génère un résumé complet du projet à partir de l’historique actuel de la conversation et le sauvegarde dans `.qwen/PROJECT_SUMMARY.md`. Ce résumé inclut l’objectif global, les connaissances clés, les actions récentes et le plan actuel, ce qui facilite la reprise du travail lors de sessions futures.
  - **Utilisation :** `/summary`
  - **Fonctionnalités :**
    - Analyse l’intégralité de l’historique de conversation pour extraire le contexte important
    - Crée un résumé structuré en Markdown avec des sections pour les objectifs, les connaissances, les actions et les plans
    - Sauvegarde automatiquement dans `.qwen/PROJECT_SUMMARY.md` à la racine du projet
    - Affiche des indicateurs de progression pendant la génération et la sauvegarde
    - S'intègre à la fonction « Bienvenue » pour une reprise fluide des sessions
  - **Remarque :** Cette commande nécessite une conversation active avec au moins 2 messages pour produire un résumé pertinent.

- **`/compress`**
  - **Description :** Remplace tout le contexte de la conversation par un résumé. Cela permet d’économiser des tokens pour les tâches futures tout en conservant un résumé global des événements passés.

- **`/copy`**
  - **Description :** Copie la dernière sortie générée par Qwen Code dans votre presse-papiers, facilitant ainsi son partage ou sa réutilisation.

- **`/directory`** (ou **`/dir`**)
  - **Description :** Gère les répertoires de l’espace de travail pour prendre en charge plusieurs dossiers.
  - **Sous-commandes :**
    - **`add`** :
      - **Description :** Ajoute un répertoire à l’espace de travail. Le chemin peut être absolu ou relatif au répertoire courant. De plus, les chemins relatifs au répertoire utilisateur (`~`) sont également pris en charge.
      - **Utilisation :** `/directory add <chemin1>,<chemin2>`
      - **Remarque :** Désactivé dans les profils sandbox restrictifs. Si vous utilisez un tel profil, utilisez plutôt l’option `--include-directories` au démarrage de la session.
    - **`show`** :
      - **Description :** Affiche tous les répertoires ajoutés via `/directory add` et `--include-directories`.
      - **Utilisation :** `/directory show`

- **`/editor`**
  - **Description :** Ouvre une boîte de dialogue permettant de sélectionner un éditeur pris en charge.

- **`/extensions`**
  - **Description :** Liste toutes les extensions actives dans la session Qwen Code en cours. Voir [Extensions Qwen Code](../extension.md).

- **`/help`** (ou **`/?`**)
  - **Description :** Affiche les informations d’aide concernant Qwen Code, notamment les commandes disponibles et leur utilisation.

- **`/mcp`**
  - **Description :** Liste les serveurs configurés utilisant le protocole Model Context Protocol (MCP), leur statut de connexion, leurs détails et les outils disponibles.
  - **Sous-commandes :**
    - **`desc`** ou **`descriptions`** :
      - **Description :** Affiche les descriptions détaillées des serveurs et outils MCP.
    - **`nodesc`** ou **`nodescriptions`** :
      - **Description :** Masque les descriptions des outils, affichant uniquement leurs noms.
    - **`schema`** :
      - **Description :** Affiche le schéma JSON complet des paramètres configurés pour l’outil.
  - **Raccourci clavier :** Appuyez sur **Ctrl+T** à tout moment pour basculer entre l’affichage et le masquage des descriptions des outils.

- **`/memory`**
  - **Description :** Gère le contexte instructif de l’IA (mémoire hiérarchique chargée depuis les fichiers `QWEN.md` par défaut ; configurable via `contextFileName`).
  - **Sous-commandes :**
    - **`add`** :
      - **Description :** Ajoute le texte suivant à la mémoire de l’IA. Utilisation : `/memory add <texte à mémoriser>`
    - **`show`** :
      - **Description :** Affiche le contenu complet et concaténé de la mémoire hiérarchique actuelle, chargée depuis tous les fichiers de contexte (ex. : `QWEN.md`). Cela permet d’inspecter le contexte instructif transmis au modèle.
    - **`refresh`** :
      - **Description :** Recharge la mémoire instructive hiérarchique depuis tous les fichiers de contexte (par défaut : `QWEN.md`) situés dans les emplacements configurés (global, projet/ancêtres, et sous-répertoires). Cela met à jour le modèle avec le dernier contenu du contexte.
    - **Remarque :** Pour plus de détails sur la contribution des fichiers de contexte à la mémoire hiérarchique, voir la [documentation de configuration du CLI](./configuration.md#context-files-hierarchical-instructional-context).

- **`/restore`**
  - **Description :** Restaure les fichiers du projet à l’état où ils se trouvaient juste avant l’exécution d’un outil. Très utile pour annuler les modifications apportées par un outil. Si aucune ID d’appel d’outil n’est spécifiée, la commande liste les points de sauvegarde disponibles.
  - **Utilisation :** `/restore [tool_call_id]`
  - **Remarque :** Disponible uniquement si le CLI est lancé avec l’option `--checkpointing` ou configuré via les [paramètres](./configuration.md). Voir la [documentation sur les points de sauvegarde](../checkpointing.md) pour plus de détails.

- **`/settings`**
  - **Description :** Ouvre l’éditeur de paramètres pour afficher et modifier les réglages de Qwen Code.
  - **Détails :** Cette commande fournit une interface conviviale pour modifier les paramètres contrôlant le comportement et l’apparence de Qwen Code. Elle équivaut à modifier manuellement le fichier `.qwen/settings.json`, mais avec validation et assistance pour éviter les erreurs.
  - **Utilisation :** Exécutez simplement `/settings` et l’éditeur s’ouvrira. Vous pouvez alors parcourir ou rechercher des paramètres spécifiques, consulter leurs valeurs actuelles et les modifier selon vos besoins. Certains changements prennent effet immédiatement, tandis que d’autres nécessitent un redémarrage.

- **`/stats`**
  - **Description :** Affiche des statistiques détaillées sur la session Qwen Code en cours, notamment l’utilisation des tokens, les économies grâce aux tokens mis en cache (si disponibles) et la durée de la session. Remarque : Les informations sur les tokens mis en cache ne sont affichées que lorsque ceux-ci sont effectivement utilisés, ce qui arrive avec l’authentification par clé API mais pas encore avec OAuth.

- [**`/theme`**](./themes.md)
  - **Description :** Ouvre une boîte de dialogue permettant de changer le thème visuel de Qwen Code.

- **`/auth`**
  - **Description :** Ouvre une boîte de dialogue permettant de modifier la méthode d’authentification.

- **`/approval-mode`**
  - **Description :** Modifie le mode d’approbation pour l’utilisation des outils.
  - **Utilisation :** `/approval-mode [mode] [--session|--project|--user]`
  - **Modes disponibles :**
    - **`plan`** : Analyse uniquement ; aucun fichier ni commande shell modifiés
    - **`default`** : Demande une approbation pour les modifications de fichiers ou les commandes shell
    - **`auto-edit`** : Approuve automatiquement les modifications de fichiers
    - **`yolo`** : Approuve automatiquement tous les outils
  - **Exemples :**
    - `/approval-mode plan --project` (active le mode plan pour ce projet)
    - `/approval-mode yolo --user` (active le mode YOLO pour cet utilisateur sur tous les projets)

- **`/about`**
  - **Description :** Affiche les informations de version. Merci de partager ces informations lors du signalement de bugs.

- **`/agents`**
  - **Description :** Gère les sous-agents IA spécialisés pour des tâches ciblées. Les sous-agents sont des assistants IA indépendants configurés avec une expertise spécifique et un accès à certains outils.
  - **Sous-commandes :**
    - **`create`** :
      - **Description :** Lance un assistant interactif pour créer un nouveau sous-agent. Il guide l'utilisateur dans la sélection de l'emplacement, la génération de prompts assistée par IA, la sélection des outils et la personnalisation visuelle.
      - **Utilisation :** `/agents create`
    - **`manage`** :
      - **Description :** Ouvre une interface interactive pour afficher, modifier et supprimer les sous-agents existants. Affiche à la fois les agents au niveau projet et utilisateur.
      - **Utilisation :** `/agents manage`
  - **Emplacements de stockage :**
    - **Niveau projet :** `.qwen/agents/` (partagé avec l’équipe, prioritaire)
    - **Niveau utilisateur :** `~/.qwen/agents/` (agents personnels, disponibles dans tous les projets)
  - **Remarque :** Pour plus d’informations sur la création et la gestion des sous-agents, voir la [documentation sur les sous-agents](../subagents.md).

- [**`/tools`**](../tools/index.md)
  - **Description :** Affiche la liste des outils actuellement disponibles dans Qwen Code.
  - **Utilisation :** `/tools [desc]`
  - **Sous-commandes :**
    - **`desc`** ou **`descriptions`** :
      - **Description :** Affiche les descriptions détaillées de chaque outil, incluant leur nom et leur description complète telle que fournie au modèle.
    - **`nodesc`** ou **`nodescriptions`** :
      - **Description :** Masque les descriptions des outils, affichant uniquement leurs noms.

- **`/quit-confirm`**
  - **Description :** Affiche une boîte de dialogue de confirmation avant de quitter Qwen Code, vous permettant de choisir comment gérer la session en cours.
  - **Utilisation :** `/quit-confirm`
  - **Options :**
    - **Quitter immédiatement :** Quitte sans rien sauvegarder (équivalent à `/quit`)
    - **Générer un résumé et quitter :** Crée un résumé du projet via `/summary` avant de quitter
    - **Sauvegarder la conversation et quitter :** Sauvegarde la conversation actuelle avec un tag généré automatiquement avant de quitter
  - **Raccourci clavier :** Appuyez deux fois sur **Ctrl+C** pour déclencher la boîte de dialogue de confirmation
  - **Remarque :** Cette commande est automatiquement déclenchée lorsque vous appuyez une seule fois sur Ctrl+C, afin d’éviter les fermetures accidentelles.

- **`/quit`** (ou **`/exit`**)
  - **Description :** Quitte immédiatement Qwen Code sans aucune confirmation.

- **`/vim`**
  - **Description :** Active ou désactive le mode vim. En mode vim activé, la zone de saisie prend en charge les commandes de navigation et d’édition style vim dans les modes NORMAL et INSERT.
  - **Fonctionnalités :**
    - **Mode NORMAL :** Navigation avec `h`, `j`, `k`, `l` ; déplacement par mots avec `w`, `b`, `e` ; aller au début/fin de ligne avec `0`, `$`, `^` ; aller à une ligne spécifique avec `G` (ou `gg` pour la première ligne)
    - **Mode INSERT :** Saisie standard avec touche Échap pour revenir au mode NORMAL
    - **Commandes d’édition :** Suppression avec `x`, modification avec `c`, insertion avec `i`, `a`, `o`, `O` ; opérations complexes comme `dd`, `cc`, `dw`, `cw`
    - **Support des compteurs :** Préfixez les commandes avec des nombres (ex. : `3h`, `5w`, `10G`)
    - **Répétition de la dernière commande :** Utilisez `.` pour répéter la dernière opération d’édition
    - **Paramètre persistant :** Le choix du mode vim est enregistré dans `~/.qwen/settings.json` et restauré entre les sessions
  - **Indicateur d’état :** Quand activé, affiche `[NORMAL]` ou `[INSERT]` dans le pied de page

- **`/init`**
  - **Description :** Analyse le répertoire courant et crée un fichier de contexte `QWEN.md` par défaut (ou le nom spécifié par `contextFileName`). Si un fichier non vide existe déjà, aucune modification n’est effectuée. La commande initialise un fichier vide et invite le modèle à le remplir avec des instructions spécifiques au projet.

### Commandes personnalisées

Pour un démarrage rapide, consultez l'[exemple](#example-a-pure-function-refactoring-command) ci-dessous.

Les commandes personnalisées vous permettent de sauvegarder et de réutiliser vos prompts favoris ou les plus fréquemment utilisés comme des raccourcis personnels au sein de Qwen Code. Vous pouvez créer des commandes spécifiques à un seul projet ou des commandes disponibles globalement sur tous vos projets, ce qui rationalise votre workflow et assure la cohérence.

#### Emplacement des fichiers et priorité

Qwen Code découvre les commandes à partir de deux emplacements, chargés dans un ordre spécifique :

1. **Commandes utilisateur (globales)** : situées dans `~/.qwen/commands/`. Ces commandes sont disponibles dans n'importe quel projet sur lequel vous travaillez.
2. **Commandes de projet (locales)** : situées dans `<votre-répertoire-projet>/.qwen/commands/`. Ces commandes sont spécifiques au projet en cours et peuvent être ajoutées au contrôle de version pour être partagées avec votre équipe.

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

Lorsque vous utilisez `{{args}}` à l'intérieur d'un bloc d'injection shell (`!{...}`), les arguments sont automatiquement **échappés pour le shell** avant le remplacement. Cela vous permet de transmettre en toute sécurité des arguments aux commandes shell, garantissant que la commande résultante est syntaxiquement correcte et sécurisée tout en évitant les vulnérabilités d'injection de commande.

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
5. Le CLI vous invite à confirmer cette commande exacte et sécurisée avant l'exécution.
6. Le prompt final est envoyé.

##### 2. Gestion des arguments par défaut

Si votre `prompt` ne contient **pas** le placeholder spécial `{{args}}`, la CLI utilise un comportement par défaut pour gérer les arguments.

Si vous fournissez des arguments à la commande (ex. : `/mycommand arg1`), la CLI ajoutera la commande complète que vous avez tapée à la fin du prompt, séparée par deux sauts de ligne. Cela permet au modèle de voir à la fois les instructions originales et les arguments spécifiques que vous venez de fournir.

Si vous ne fournissez **aucun** argument (ex. : `/mycommand`), le prompt est envoyé au modèle tel quel, sans rien ajouter.

**Exemple (`changelog.toml`) :**

Cet exemple montre comment créer une commande robuste en définissant un rôle pour le modèle, en expliquant où trouver l'entrée utilisateur, et en spécifiant le format et le comportement attendus.

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

Vous pouvez rendre vos commandes dynamiques en exécutant directement des commandes shell dans votre `prompt` et en injectant leur sortie. C'est idéal pour récupérer du contexte depuis votre environnement local, comme lire le contenu d'un fichier ou vérifier l'état de Git.

Lorsqu'une commande personnalisée tente d'exécuter une commande shell, Qwen Code vous demandera maintenant une confirmation avant de continuer. Il s'agit d'une mesure de sécurité pour s'assurer que seules les commandes voulues sont exécutées.

**Fonctionnement :**

1.  **Injection de commandes :** Utilisez la syntaxe `!{...}`.
2.  **Substitution d'arguments :** Si `{{args}}` est présent à l'intérieur du bloc, il est automatiquement échappé pour le shell (voir [Injection contextuelle](#1-context-aware-injection-with-args) ci-dessus).
3.  **Parsing robuste :** L'analyseur gère correctement les commandes shell complexes contenant des accolades imbriquées, comme des payloads JSON. **Note :** Le contenu à l'intérieur de `!{...}` doit avoir des accolades équilibrées (`{` et `}`). Si vous devez exécuter une commande contenant des accolades non équilibrées, envisagez de l'encapsuler dans un script externe et d'appeler ce script dans le bloc `!{...}`.
4.  **Vérification de sécurité et confirmation :** Le CLI effectue une vérification de sécurité sur la commande finale résolue (après échappement et substitution des arguments). Une boîte de dialogue s'affiche montrant la ou les commandes exactes à exécuter.
5.  **Exécution et rapport d'erreurs :** La commande est exécutée. Si la commande échoue, la sortie injectée dans le prompt inclura les messages d'erreur (stderr) suivis d'une ligne indiquant le statut, par exemple `[Shell command exited with code 1]`. Cela permet au modèle de comprendre le contexte de l'échec.

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

Vous pouvez directement intégrer le contenu d'un fichier ou une liste de répertoires dans votre prompt en utilisant la syntaxe `@{...}`. Cela est particulièrement utile pour créer des commandes qui agissent sur des fichiers spécifiques.

**Fonctionnement :**

- **Injection de fichier** : `@{chemin/vers/fichier.txt}` est remplacé par le contenu de `fichier.txt`.
- **Support multimodal** : Si le chemin pointe vers une image supportée (ex. : PNG, JPEG), un PDF, un fichier audio ou vidéo, celui-ci sera correctement encodé et injecté comme entrée multimodale. Les autres fichiers binaires sont gérés proprement et ignorés.
- **Liste de répertoires** : `@{chemin/vers/dossier}` est parcouru, et chaque fichier présent dans ce dossier ainsi que dans ses sous-dossiers est inséré dans le prompt. Cette opération respecte les fichiers `.gitignore` et `.qwenignore`, si activés.
- **Prise en compte de l'espace de travail** : La commande recherche le chemin dans le répertoire courant ainsi que dans tous les autres répertoires définis comme espaces de travail. Les chemins absolus sont autorisés s'ils se trouvent à l'intérieur de l'espace de travail.
- **Ordre de traitement** : L'injection du contenu via `@{...}` est effectuée _avant_ l'exécution des commandes shell (`!{...}`) et la substitution d'arguments (`{{args}}`).
- **Analyse syntaxique** : Le parseur exige que le contenu entre les accolades `@{...}` (le chemin) comporte des accolades équilibrées (`{` et `}`).

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

**1. Créer le fichier et les répertoires :**

Tout d'abord, assurez-vous que le répertoire des commandes utilisateur existe, puis créez un sous-répertoire `refactor` pour l'organisation et le fichier TOML final.

```bash
mkdir -p ~/.qwen/commands/refactor
touch ~/.qwen/commands/refactor/pure.toml
```

**2. Ajouter le contenu au fichier :**

Ouvrez `~/.qwen/commands/refactor/pure.toml` dans votre éditeur et ajoutez le contenu suivant. Nous incluons le `description` optionnel pour respecter les bonnes pratiques.

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
```

## Raccourcis du champ de saisie

Ces raccourcis s'appliquent directement au champ de saisie pour la manipulation de texte.

- **Annuler :**
  - **Raccourci clavier :** Appuyez sur **Ctrl+z** pour annuler la dernière action dans le champ de saisie.

- **Rétablir :**
  - **Raccourci clavier :** Appuyez sur **Ctrl+Shift+Z** pour rétablir la dernière action annulée dans le champ de saisie.

## Commandes At (`@`)

Les commandes At sont utilisées pour inclure le contenu de fichiers ou de répertoires dans votre prompt envoyé au modèle. Ces commandes prennent en compte le filtrage git-aware.

- **`@<chemin_du_fichier_ou_répertoire>`**
  - **Description :** Injecte le contenu du fichier ou des fichiers spécifiés dans votre prompt actuel. Cela est utile pour poser des questions sur un code spécifique, un texte ou une collection de fichiers.
  - **Exemples :**
    - `@path/to/your/file.txt Explique ce texte.`
    - `@src/my_project/ Résume le code dans ce répertoire.`
    - `De quoi parle ce fichier ? @README.md`
  - **Détails :**
    - Si un chemin vers un seul fichier est fourni, le contenu de ce fichier est lu.
    - Si un chemin vers un répertoire est fourni, la commande tente de lire le contenu des fichiers présents dans ce répertoire ainsi que dans ses sous-répertoires.
    - Les espaces dans les chemins doivent être échappés avec un antislash (ex. : `@My\ Documents/file.txt`).
    - La commande utilise l'outil `read_many_files` en interne. Le contenu est récupéré puis inséré dans votre requête avant d'être envoyé au modèle.
    - **Filtrage git-aware :** Par défaut, les fichiers ignorés par git (comme `node_modules/`, `dist/`, `.env`, `.git/`) sont exclus. Ce comportement peut être modifié via les paramètres `context.fileFiltering`.
    - **Types de fichiers :** La commande est destinée aux fichiers textuels. Bien qu'elle puisse tenter de lire n’importe quel fichier, les fichiers binaires ou très volumineux peuvent être ignorés ou tronqués par l’outil sous-jacent `read_many_files` afin de garantir performances et pertinence. L’outil indique si certains fichiers ont été ignorés.
  - **Sortie :** Le CLI affichera un message d’appel à l’outil indiquant que `read_many_files` a été utilisé, accompagné d’un message détaillant le statut et les chemins traités.

- **`@` (Symbole @ seul)**
  - **Description :** Si vous saisissez uniquement le symbole `@` sans préciser de chemin, la requête est transmise telle quelle au modèle. Cela peut être utile si vous discutez explicitement _du_ symbole `@` dans votre prompt.

### Gestion des erreurs pour les commandes `@`

- Si le chemin spécifié après `@` n'est pas trouvé ou est invalide, un message d'erreur sera affiché, et la requête pourrait ne pas être envoyée au modèle, ou elle sera envoyée sans le contenu du fichier.
- Si l'outil `read_many_files` rencontre une erreur (par exemple, des problèmes de permissions), cela sera également signalé.

## Mode shell & commandes de passe-through (`!`)

Le préfixe `!` vous permet d'interagir directement avec le shell de votre système depuis Qwen Code.

- **`!<shell_command>`**
  - **Description :** Exécute la commande `<shell_command>` donnée en utilisant `bash` sur Linux/macOS ou `cmd.exe` sur Windows. Toute sortie ou erreur de la commande est affichée dans le terminal.
  - **Exemples :**
    - `!ls -la` (exécute `ls -la` et retourne à Qwen Code)
    - `!git status` (exécute `git status` et retourne à Qwen Code)

- **`!` (Basculer en mode shell)**
  - **Description :** Saisir `!` seul permet de basculer en mode shell.
    - **Entrée en mode shell :**
      - Lorsqu'il est actif, le mode shell utilise une coloration différente et un "indicateur de mode shell".
      - En mode shell, le texte que vous saisissez est interprété directement comme une commande shell.
    - **Sortie du mode shell :**
      - Une fois sorti, l'interface retrouve son apparence standard et le comportement normal de Qwen Code reprend.

- **Attention pour toute utilisation de `!` :** Les commandes que vous exécutez en mode shell ont les mêmes permissions et le même impact que si vous les exécutiez directement dans votre terminal.

- **Variable d'environnement :** Lorsqu'une commande est exécutée via `!` ou en mode shell, la variable d'environnement `QWEN_CODE=1` est définie dans l'environnement du sous-processus. Cela permet aux scripts ou outils de détecter s'ils sont exécutés depuis l'interface CLI.