# Mode d'approbation

Qwen Code propose cinq modes d'autorisation distincts qui vous permettent de contrôler de manière flexible la façon dont l'IA interagit avec votre code et votre système, en fonction de la complexité de la tâche et du niveau de risque.

## Comparaison des modes d'autorisation

| Mode                 | Modification de fichiers    | Commandes Shell             | Idéal pour                                                                                             | Niveau de risque |
| -------------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| **Plan**             | ❌ Analyse en lecture seule uniquement | ❌ Non exécutées            | • Exploration de code <br>• Planification de modifications complexes <br>• Revue de code sécurisée     | Le plus bas      |
| **Ask Permissions**  | ✅ Approbation manuelle requise | ✅ Approbation manuelle requise | • Codebases nouveaux/inconnus <br>• Systèmes critiques <br>• Collaboration en équipe <br>• Apprentissage et enseignement | Bas              |
| **Auto-Edit**        | ✅ Approuvé automatiquement | ❌ Approbation manuelle requise | • Tâches de développement quotidiennes <br>• Refactoring et améliorations de code <br>• Automatisation sécurisée | Moyen            |
| **Auto**             | ✅ Évalué par le classificateur | ✅ Évalué par le classificateur | • Longues sessions autonomes <br>• Lorsque Auto-Edit est trop prudent mais YOLO est trop risqué        | Moyen            |
| **YOLO**             | ✅ Approuvé automatiquement | ✅ Approuvé automatiquement | • Projets personnels de confiance <br>• Scripts automatisés/CI/CD <br>• Tâches de traitement par lots  | Le plus élevé    |

> [!NOTE]
>
> Le mode précédemment nommé **Default** a été renommé **Ask Permissions** pour mieux décrire son comportement. La valeur de configuration sous-jacente (`tools.approvalMode: "default"`) et la commande `/approval-mode default` restent inchangées pour des raisons de rétrocompatibilité.

### Guide de référence rapide

- **Commencer en mode Plan** : Idéal pour comprendre avant d'apporter des modifications
- **Travailler en mode Ask Permissions** : Le choix équilibré pour la plupart des travaux de développement
- **Passer en mode Auto-Edit** : Lorsque vous apportez de nombreuses modifications de code sûres
- **Essayer le mode Auto** : Lorsque vous souhaitez moins d'interruptions tout en conservant la sécurité sur les commandes shell et les appels réseau — un classificateur LLM évalue chaque appel
- **Utiliser YOLO avec parcimonie** : Uniquement pour l'automatisation de confiance dans des environnements contrôlés

> [!tip]
>
> Vous pouvez rapidement passer d'un mode à l'autre pendant une session en utilisant **Shift+Tab** (ou **Tab** sur Windows). La barre d'état du terminal affiche votre mode actuel, vous savez donc toujours de quelles autorisations Qwen Code dispose.

> L'ordre du cycle est : **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. Utiliser le mode Plan pour une analyse de code sécurisée

Le mode Plan demande à Qwen Code de créer un plan en analysant le code avec des opérations en **lecture seule**, ce qui est parfait pour explorer des codebases, planifier des modifications complexes ou réviser du code en toute sécurité.

### Quand utiliser le mode Plan

- **Implémentation en plusieurs étapes** : Lorsque votre fonctionnalité nécessite des modifications dans de nombreux fichiers
- **Exploration de code** : Lorsque vous souhaitez étudier le code en profondeur avant de modifier quoi que ce soit
- **Développement interactif** : Lorsque vous souhaitez itérer sur la direction avec Qwen Code

### Comment utiliser le mode Plan

**Activer le mode Plan pendant une session**

Vous pouvez passer en mode Plan pendant une session en utilisant **Shift+Tab** (ou **Tab** sur Windows) pour parcourir les modes d'autorisation.

Si vous êtes en mode normal, **Shift+Tab** (ou **Tab** sur Windows) passe d'abord en mode `auto-edits`, indiqué par `⏵⏵ accept edits on` en bas du terminal. Un second appui sur **Shift+Tab** (ou **Tab** sur Windows) passera en mode Plan, indiqué par `⏸ plan mode`.

**Utiliser la commande `/plan`**

La commande `/plan` fournit un raccourci rapide pour entrer et sortir du mode Plan :

Les requêtes de planification régulières ne changent pas de mode par elles-mêmes. Si vous souhaitez le workflow du mode Plan en lecture seule, utilisez `/plan`, le raccourci clavier, ou définissez explicitement le mode d'approbation sur `plan`.

```bash
/plan                          # Enter plan mode
/plan refactor the auth module # Enter plan mode and start planning
/plan exit                     # Exit plan mode, restore previous mode
```

Lorsque vous quittez le mode Plan avec `/plan exit`, votre mode d'approbation précédent est automatiquement restauré (par exemple, si vous étiez en mode Auto-Edit avant d'entrer en mode Plan, vous retournerez en mode Auto-Edit).

**Démarrer une nouvelle session en mode Plan**

Pour démarrer une nouvelle session en mode Plan, utilisez `/approval-mode` puis sélectionnez `plan`

```bash
/approval-mode
```

**Exécuter des requêtes "headless" en mode Plan**

Vous pouvez également exécuter une requête en mode Plan directement avec `-p` ou `prompt` :

```bash
qwen --prompt "What is machine learning?"
```

### Exemple : Planifier un refactoring complexe

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code entre en mode Plan et analyse l'implémentation actuelle pour créer un plan complet. Affinez avec des suivis :

```
What about backward compatibility?
How should we handle database migration?
```

### Configurer le mode Plan par défaut

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. Utiliser le mode Ask Permissions pour une interaction contrôlée

Le mode Ask Permissions est la méthode standard pour travailler avec Qwen Code. Dans ce mode, vous gardez le contrôle total sur toutes les opérations potentiellement risquées : Qwen Code vous demandera votre approbation avant d'apporter des modifications aux fichiers ou d'exécuter des commandes shell.

### Quand utiliser le mode Ask Permissions

- **Nouveau sur un code** : Lorsque vous explorez un projet inconnu et souhaitez être particulièrement prudent
- **Systèmes critiques** : Lorsque vous travaillez sur du code de production, de l'infrastructure ou des données sensibles
- **Apprentissage et enseignement** : Lorsque vous souhaitez comprendre chaque étape effectuée par Qwen Code
- **Collaboration en équipe** : Lorsque plusieurs personnes travaillent sur le même code
- **Opérations complexes** : Lorsque les modifications impliquent plusieurs fichiers ou une logique complexe

### Comment utiliser le mode Ask Permissions

**Activer le mode Ask Permissions pendant une session**

Vous pouvez passer en mode Ask Permissions pendant une session en utilisant **Shift+Tab** (ou **Tab** sur Windows) pour parcourir les modes d'autorisation. Si vous êtes dans n'importe quel autre mode, appuyer sur **Shift+Tab** (ou **Tab** sur Windows) finira par revenir au mode Ask Permissions, indiqué par l'absence d'indicateur de mode en bas du terminal.

**Démarrer une nouvelle session en mode Ask Permissions**

Le mode Ask Permissions est le mode initial lorsque vous démarrez Qwen Code. Si vous avez changé de mode et souhaitez revenir au mode Ask Permissions, utilisez :

```
/approval-mode default
```

**Exécuter des requêtes "headless" en mode Ask Permissions**

Lors de l'exécution de commandes headless, le mode Ask Permissions est le comportement par défaut. Vous pouvez le spécifier explicitement avec :

```
qwen --prompt "Analyze this code for potential bugs"
```

### Exemple : Implémenter une fonctionnalité en toute sécurité

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

Qwen Code analysera votre code et proposera un plan. Il demandera ensuite une approbation avant de :

1. Créer de nouveaux fichiers (contrôleurs, modèles, migrations)
2. Modifier des fichiers existants (ajout de nouvelles colonnes, mise à jour des API)
3. Exécuter des commandes shell (migrations de base de données, installation de dépendances)

Vous pouvez examiner chaque modification proposée et l'approuver ou la rejeter individuellement.

### Configurer le mode Ask Permissions par défaut

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Mode Auto-Edit

Le mode Auto-Edit demande à Qwen Code d'approuver automatiquement les modifications de fichiers tout en exigeant une approbation manuelle pour les commandes shell, ce qui est idéal pour accélérer les workflows de développement tout en maintenant la sécurité du système.

Les outils d'édition approuvés automatiquement incluent `edit`, `write_file`, et `notebook_edit`.

### Quand utiliser le mode Auto-Accept Edits

- **Développement quotidien** : Idéal pour la plupart des tâches de codage
- **Automatisation sécurisée** : Permet à l'IA de modifier le code tout en empêchant l'exécution accidentelle de commandes dangereuses
- **Collaboration en équipe** : À utiliser dans les projets partagés pour éviter les impacts involontaires sur les autres

### Comment passer à ce mode

```
# Switch via command
/approval-mode auto-edit

# Or use keyboard shortcut
Shift+Tab (or Tab on Windows) # Switch from other modes
```

### Exemple de workflow

1. Vous demandez à Qwen Code de refactoriser une fonction
2. L'IA analyse le code et propose des modifications
3. Applique **automatiquement** toutes les modifications de fichiers sans confirmation
4. Si des tests doivent être exécutés, il **demandera l'approbation** pour exécuter `npm test`

## 4. Mode Auto - Approbation pilotée par classificateur

Le mode Auto se situe entre Auto-Edit et YOLO. Un classificateur LLM évalue chaque commande shell, appel réseau et modification hors de l'espace de travail, et approuve automatiquement ceux qu'il juge sûrs tout en bloquant les autres. La plupart des opérations en lecture seule et des modifications dans l'espace de travail contournent le classificateur pour plus de rapidité.

Consultez [auto-mode.md](./auto-mode.md) pour la référence complète (configuration des hints, dépannage, FAQ).

### Quand utiliser le mode Auto

- **Longues sessions autonomes** : Lorsque le mode Ask Permissions interrompt trop souvent mais que YOLO est trop risqué.
- **Projets de confiance** : Codebases internes où l'agent doit continuer à avancer, mais où vous souhaitez toujours un garde-fou sur les commandes shell destructrices et les appels réseau sortants.
- **Exécutions headless / planifiées** : Lorsque Auto-Edit ne suffit pas (l'agent doit également exécuter des commandes shell) mais que vous voulez de la sécurité sur `rm -rf /`, `curl ... | sh`, l'exfiltration d'identifiants, etc.

### Comment utiliser le mode Auto

**Activer le mode Auto pendant une session**

Appuyez sur **Shift+Tab** (ou **Tab** sur Windows) pour passer en mode Auto. La barre d'état affiche le mode actif.

**Utiliser la commande `/approval-mode`**

```
/approval-mode auto
```

La première fois que vous entrez en mode Auto, un message d'information explique son fonctionnement. Cette notification n'apparaît plus ensuite.

**Démarrer une nouvelle session en mode Auto**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### Ce que le mode Auto approuve automatiquement par rapport à ce qu'il bloque

Le classificateur a tendance à bloquer en cas d'incertitude. Valeurs par défaut :

- **Approuvé automatiquement** : commandes en lecture seule (ls, cat, git status, grep, find), installation de paquets dans le cwd, commandes de build/test, modifications de fichiers dans l'espace de travail, opérations locales uniquement.
- **Bloqué** : destruction irréversible (rm -rf /, fdisk, mkfs), exécution de code externe (curl | sh, eval de contenu distant), exfiltration d'identifiants, persistance non autorisée (modifications de .bashrc, crontab), affaiblissement de la sécurité, force-push vers main/master.

Vous pouvez personnaliser le jugement du classificateur via des hints en langage naturel dans settings.json. Consultez [auto-mode.md](./auto-mode.md#configuring-hints).

### Garde-fous de sécurité

- **Les règles strictes restent en vigueur** : les règles `permissions.deny` bloquent les actions avant même que le classificateur ne s'exécute.
- **Les règles allow trop larges sont désactivées en mode Auto** : par exemple, `permissions.allow: ["Bash"]` (autoriser toutes les commandes shell) contourne le classificateur ; l'entrée en mode Auto désactive temporairement ces règles pour que le classificateur puisse faire son travail. Les règles sont restaurées lorsque vous quittez le mode Auto. Les paramètres sur le disque ne sont jamais modifiés.
- **Échec fermé (Fail-closed)** : lorsque l'API du classificateur est inaccessible, l'action est bloquée plutôt qu'autorisée. Après deux appels consécutifs indisponibles, l'appel d'outil suivant revient à une approbation manuelle.
- **Garde de boucle (Loop guard)** : après trois blocages consécutifs par la politique, l'appel suivant revient également à une approbation manuelle afin que l'agent ne reste pas bloqué dans une approche sans issue.

### Exemple

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

Qwen Code effectue les modifications de fichiers (les modifications dans l'espace de travail contournent le classificateur), exécute `npm test` (le classificateur juge cela sûr), et affiche un blocage s'il tente quelque chose de risqué comme `rm -rf /Users/me/.aws`. Vous pouvez examiner la raison en ligne et décider si vous devez passer en mode Ask Permissions pour cette étape.

### Configurer le mode Auto par défaut

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": ["Running pytest, mypy, and ruff on this Python repo"],
        "deny": ["Any network call to intranet.example.com"],
      },
      "environment": ["Open-source monorepo; commits are signed"],
      // Optional: route ALL shell commands (including read-only ones like
      // ls, cat) through the classifier for defense-in-depth.
      // "classifyAllShell": true,
    },
  },
}
```

## 5. Mode YOLO - Automatisation complète

Le mode YOLO accorde à Qwen Code les autorisations les plus élevées, approuvant automatiquement tous les appels d'outils, y compris la modification de fichiers et les commandes shell.

### Quand utiliser le mode YOLO

- **Scripts automatisés** : Exécution de tâches automatisées prédéfinies
- **Pipelines CI/CD** : Exécution automatisée dans des environnements contrôlés
- **Projets personnels** : Itération rapide dans des environnements entièrement de confiance
- **Traitement par lots** : Tâches nécessitant des chaînes de commandes en plusieurs étapes

> [!warning]
>
> **Utilisez le mode YOLO avec prudence** : l'IA peut exécuter n'importe quelle commande avec les autorisations de votre terminal. Assurez-vous :
>
> 1. Que vous faites confiance au code actuel
> 2. Que vous comprenez toutes les actions que l'IA va effectuer
> 3. Que les fichiers importants sont sauvegardés ou commités dans le contrôle de version

### Comment activer le mode YOLO

```
# Temporarily enable (current session only)
/approval-mode yolo

# Set as project default
/approval-mode yolo --project

# Set as user global default
/approval-mode yolo --user
```

### Exemple de configuration

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "yolo"
  }
}
```

### Exemple de workflow automatisé

```bash
# Fully automated refactoring task
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# Without human intervention, AI will:
# 1. Run test commands (auto-approved)
# 2. Fix failed test cases (auto-edit files)
# 3. Execute git commit (auto-approved)
```

## Changement de mode et configuration

### Changement de mode par raccourci clavier

Pendant une session Qwen Code, utilisez **Shift+Tab** (ou **Tab** sur Windows) pour passer rapidement en revue les cinq modes :

```
Plan Mode → Ask Permissions Mode → Auto-Edit Mode → Auto Mode → YOLO Mode → Plan Mode
```

### Configuration persistante

```
// Project-level: ./.qwen/settings.json
// User-level: ~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // or "plan", "default", "auto", "yolo"
  }
}
```

### Recommandations d'utilisation des modes

1. **Nouveau sur un code** : Commencez par le **mode Plan** pour une exploration sécurisée
2. **Tâches de développement quotidiennes** : Utilisez **Auto-Accept Edits** (mode par défaut), efficace et sûr
3. **Scripts automatisés** : Utilisez le **mode YOLO** dans des environnements contrôlés pour une automatisation complète
4. **Refactoring complexe** : Utilisez d'abord le **mode Plan** pour une planification détaillée, puis passez au mode approprié pour l'exécution