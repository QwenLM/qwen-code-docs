# Mode d'Approbation

Qwen Code propose cinq modes d'autorisation distincts qui vous permettent de contrôler de manière flexible la façon dont l'IA interagit avec votre code et votre système en fonction de la complexité des tâches et du niveau de risque.

## Comparaison des modes d'autorisation

| Mode                          | Édition de fichier            | Commandes Shell               | Meilleur pour                                                                                           | Niveau de risque |
| ----------------------------- | ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------- |
| **Plan**​                      | ❌ Analyse en lecture seule   | ❌ Non exécutées              | • Exploration du code <br>• Planification de changements complexes <br>• Revue de code sécurisée         | Le plus faible   |
| **Demander l'autorisation**​  | ✅ Approbation manuelle requise | ✅ Approbation manuelle requise | • Bases de code nouvelles/inconnues <br>• Systèmes critiques <br>• Collaboration en équipe <br>• Apprentissage et enseignement | Faible           |
| **Auto-édition**​             | ✅ Approuvée automatiquement  | ❌ Approbation manuelle requise | • Tâches de développement quotidiennes <br>• Refactorisation et améliorations de code <br>• Automatisation sécurisée | Moyen            |
| **Auto**​                     | ✅ Évaluée par classifieur    | ✅ Évaluée par classifieur    | • Longues sessions autonomes <br>• Quand Auto-édition est trop prudent mais YOLO trop risqué              | Moyen            |
| **YOLO**​                     | ✅ Approuvée automatiquement  | ✅ Approuvée automatiquement  | • Projets personnels de confiance <br>• Scripts automatisés/CI/CD <br>• Traitement par lots               | Le plus élevé    |

> [!NOTE]
>
> Le mode précédemment nommé **Default** a été renommé en **Demander l'autorisation** pour mieux décrire son comportement. La valeur de configuration sous-jacente (`tools.approvalMode: "default"`) et la commande `/approval-mode default` restent inchangées pour la rétrocompatibilité.

### Guide de référence rapide

- **Commencez en mode Plan** : Idéal pour comprendre avant d'apporter des modifications
- **Travaillez en mode Demander l'autorisation** : Le choix équilibré pour la plupart des travaux de développement
- **Passez en mode Auto-édition** : Lorsque vous effectuez de nombreuses modifications de code sécurisées
- **Essayez le mode Auto** : Quand vous voulez moins d'interruptions mais toujours de la sécurité sur les commandes shell et les appels réseau — un classifieur LLM évalue chaque appel
- **Utilisez YOLO avec parcimonie** : Uniquement pour l'automatisation de confiance dans des environnements contrôlés

> [!tip]
>
> Vous pouvez parcourir rapidement les modes pendant une session en utilisant **Shift+Tab** (ou **Tab** sur Windows). La barre d'état du terminal affiche votre mode actuel, vous savez donc toujours quelles autorisations Qwen Code possède.

> L'ordre de cycle est : **plan → default → auto-édition → auto → yolo → plan → ...**

## 1. Utilisez le mode Plan pour une analyse de code sécurisée

Le mode Plan demande à Qwen Code de créer un plan en analysant la base de code avec des opérations **en lecture seule**, parfait pour explorer les bases de code, planifier des changements complexes ou réviser le code en toute sécurité.

### Quand utiliser le mode Plan

- **Implémentation en plusieurs étapes** : Lorsque votre fonctionnalité nécessite des modifications dans plusieurs fichiers
- **Exploration du code** : Quand vous voulez étudier la base de code en profondeur avant de changer quoi que ce soit
- **Développement interactif** : Quand vous souhaitez itérer sur la direction avec Qwen Code

### Comment utiliser le mode Plan

**Activer le mode Plan pendant une session**

Vous pouvez passer en mode Plan pendant une session en utilisant **Shift+Tab** (ou **Tab** sur Windows) pour parcourir les modes d'autorisation.

Si vous êtes en mode Normal, **Shift+Tab** (ou **Tab** sur Windows) bascule d'abord en mode Auto-édition, indiqué par `⏵⏵ accept edits on` en bas du terminal. Un **Shift+Tab** (ou **Tab** sur Windows) supplémentaire bascule en mode Plan, indiqué par `⏸ plan mode`.

**Utiliser la commande `/plan`**

La commande `/plan` fournit un raccourci rapide pour entrer et sortir du mode Plan :

Les demandes de planification régulières ne changent pas de mode par elles-mêmes. Si vous souhaitez le flux de travail du mode Plan en lecture seule, utilisez `/plan`, le raccourci clavier, ou définissez explicitement le mode d'autorisation sur `plan`.

```bash
/plan                          # Entrer en mode Plan
/plan refactor the auth module # Entrer en mode Plan et commencer la planification
/plan exit                     # Quitter le mode Plan, restaurer le mode précédent
```

Lorsque vous quittez le mode Plan avec `/plan exit`, votre mode d'autorisation précédent est automatiquement restauré (par exemple, si vous étiez en Auto-édition avant d'entrer en mode Plan, vous revenez en Auto-édition).

**Démarrer une nouvelle session en mode Plan**

Pour démarrer une nouvelle session en mode Plan, utilisez `/approval-mode` puis sélectionnez `plan`

```bash
/approval-mode
```

**Exécuter des requêtes "headless" en mode Plan**

Vous pouvez également exécuter une requête directement en mode Plan avec `-p` ou `prompt` :

```bash
qwen --prompt "What is machine learning?"
```

### Exemple : Planification d'une refactorisation complexe

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code entre en mode Plan et analyse l'implémentation actuelle pour créer un plan complet. Affinez avec des demandes de suivi :

```
What about backward compatibility?
How should we handle database migration?
```
### Configurer le mode Plan comme mode par défaut

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. Utiliser le mode Ask Permissions pour une interaction contrôlée

Le mode Ask Permissions est la méthode standard pour travailler avec Qwen Code. Dans ce mode, vous conservez un contrôle total sur toutes les opérations potentiellement risquées – Qwen Code vous demandera votre approbation avant d'effectuer toute modification de fichier ou d'exécuter des commandes shell.

### Quand utiliser le mode Ask Permissions

- **Nouveau dans un codebase** : lorsque vous explorez un projet inconnu et souhaitez être particulièrement prudent
- **Systèmes critiques** : lorsque vous travaillez sur du code de production, de l'infrastructure ou des données sensibles
- **Apprentissage et enseignement** : lorsque vous souhaitez comprendre chaque étape franchie par Qwen Code
- **Collaboration en équipe** : lorsque plusieurs personnes travaillent sur le même codebase
- **Opérations complexes** : lorsque les modifications impliquent plusieurs fichiers ou une logique complexe

### Comment utiliser le mode Ask Permissions

**Activer le mode Ask Permissions pendant une session**

Vous pouvez passer en mode Ask Permissions pendant une session en utilisant **Shift+Tab**​ (ou **Tab** sur Windows) pour parcourir les modes d'autorisation. Si vous êtes dans un autre mode, appuyer sur **Shift+Tab** (ou **Tab** sur Windows) finira par revenir au mode Ask Permissions, indiqué par l'absence d'indicateur de mode en bas du terminal.

**Démarrer une nouvelle session en mode Ask Permissions**

Le mode Ask Permissions est le mode initial lorsque vous démarrez Qwen Code. Si vous avez changé de mode et souhaitez revenir au mode Ask Permissions, utilisez :

```
/approval-mode default
```

**Exécuter des requêtes « headless » en mode Ask Permissions**

Lors de l'exécution de commandes headless, le mode Ask Permissions est le comportement par défaut. Vous pouvez le spécifier explicitement avec :

```
qwen --prompt "Analyze this code for potential bugs"
```

### Exemple : Implémenter une fonctionnalité en toute sécurité

```
/approval-mode default
```

```
Je dois ajouter des photos de profil utilisateur à notre application. Les photos doivent être stockées dans un compartiment S3 et les URL enregistrées dans la base de données.
```

Qwen Code analysera votre codebase et proposera un plan. Il demandera ensuite votre approbation avant :

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

## 3. Mode Auto Edits

Le mode Auto-Edit demande à Qwen Code d'approuver automatiquement les modifications de fichiers tout en nécessitant une approbation manuelle pour les commandes shell, idéal pour accélérer les workflows de développement tout en maintenant la sécurité du système.

Les outils d'édition auto-approuvés incluent `edit`, `write_file` et `notebook_edit`.

### Quand utiliser le mode Auto-Accept Edits

- **Développement quotidien** : Idéal pour la plupart des tâches de codage
- **Automatisation sécurisée** : Permet à l'IA de modifier du code tout en empêchant l'exécution accidentelle de commandes dangereuses
- **Collaboration en équipe** : Utiliser dans des projets partagés pour éviter des impacts involontaires sur les autres

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
3. **Applique automatiquement**​ toutes les modifications de fichiers sans confirmation
4. Si des tests doivent être exécutés, il **demandera l'approbation**​ pour exécuter `npm test`

## 4. Mode Auto - Approbation pilotée par classificateur

Le mode Auto se situe entre Auto-Edit et YOLO. Un classificateur LLM évalue chaque commande shell, appel réseau et modification hors espace de travail et approuve automatiquement ceux qu'il juge sûrs tout en bloquant les risques. La plupart des opérations en lecture seule et des modifications dans l'espace de travail contournent le classificateur pour des raisons de rapidité.

Voir [auto-mode.md](./auto-mode.md) pour la référence complète (configuration des hints, dépannage, FAQ).

### Quand utiliser le mode Auto

- **Sessions autonomes longues** : lorsque le mode Ask Permissions interrompt trop souvent mais que YOLO est trop risqué.
- **Projets de confiance** : codebases internes où l'agent doit continuer à avancer mais où vous voulez toujours une barrière de sécurité sur les commandes shell destructrices et les appels réseau sortants.
- **Exécutions headless / planifiées** : lorsque Auto-Edit ne suffit pas (l'agent doit aussi exécuter des commandes shell) mais que vous voulez une sécurité sur `rm -rf /`, `curl ... | sh`, l'exfiltration d'identifiants, etc.

### Comment utiliser le mode Auto

**Activer le mode Auto pendant une session**

Appuyez sur **Shift+Tab** (ou **Tab** sur Windows) pour passer en mode Auto. La barre d'état affiche le mode actif.

**Utiliser la commande `/approval-mode`**

```
/approval-mode auto
```

La première fois que vous entrez dans le mode Auto, un message d'information explique son fonctionnement. Ce message ne réapparaît pas.

**Démarrer une nouvelle session en mode Auto**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### Ce que le mode Auto approuve automatiquement vs bloque

Le classificateur est biaisé vers le blocage en cas d'incertitude. Valeurs par défaut :
- **Approbation automatique** : commandes en lecture seule (ls, cat, git status, grep, find),
  installation de paquets dans le répertoire de travail, commandes de construction/test, modifications de fichiers dans l'espace de travail,
  opérations locales uniquement.
- **Bloqué** : destruction irréversible (rm -rf /, fdisk, mkfs),
  exécution de code externe (curl | sh, évaluation de contenu distant),
  exfiltration d'identifiants, persistance non autorisée (modifications de .bashrc,
  crontab), affaiblissement de la sécurité, force-push sur main/master.

Vous pouvez personnaliser le jugement du classificateur via des indications en langage naturel dans
settings.json. Voir [auto-mode.md](./auto-mode.md#configuring-hints).

### Garde-fous de sécurité

- **Les règles strictes restent en vigueur** : les règles `permissions.deny` bloquent les actions
  avant même que le classificateur ne s'exécute.
- **Les règles d'autorisation trop larges sont supprimées en Mode Auto** : par exemple,
  `permissions.allow: ["Bash"]` (autoriser toute commande shell) contourne le
  classificateur ; entrer en Mode Auto désactive temporairement ces règles pour que le
  classificateur puisse faire son travail. Les règles sont restaurées lorsque vous quittez le Mode
  Auto. Les paramètres sur le disque ne sont jamais modifiés.
- **Fermé par défaut** : lorsque l'API du classificateur est inaccessible, l'action est
  bloquée plutôt qu'autorisée. Après deux appels consécutifs indisponibles,
  le prochain appel d'outil revient à une approbation manuelle.
- **Protection contre les boucles** : après trois blocages consécutifs par la politique, le prochain appel
  revient également à une approbation manuelle pour que l'agent ne reste pas bloqué dans une boucle
  sur une approche sans issue.

### Exemple

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

Qwen Code effectue les modifications de fichiers (les modifications dans l'espace de travail contournent le classificateur),
exécute `npm test` (le classificateur juge sûr), et affiche un blocage s'il essaie jamais
quelque chose de risqué comme `rm -rf /Users/me/.aws`. Vous pouvez examiner le
motif en ligne et décider de passer en Mode Demande d'Autorisation pour cette étape.

### Configurer le Mode Auto par défaut

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
    },
  },
}
```

## 5. Mode YOLO - Automatisation complète

Le Mode YOLO accorde à Qwen Code les plus hautes permissions, approuvant automatiquement tous les appels d'outils, y compris l'édition de fichiers et les commandes shell.

### Quand utiliser le Mode YOLO

- **Scripts automatisés** : Exécution de tâches automatisées prédéfinies
- **Pipelines CI/CD** : Exécution automatisée dans des environnements contrôlés
- **Projets personnels** : Itération rapide dans des environnements entièrement fiables
- **Traitement par lots** : Tâches nécessitant des chaînes de commandes en plusieurs étapes

> [!warning]
>
> **Utilisez le Mode YOLO avec prudence** : L'IA peut exécuter n'importe quelle commande avec vos permissions de terminal. Assurez-vous :
>
> 1. Vous faites confiance à la base de code actuelle
> 2. Vous comprenez toutes les actions que l'IA effectuera
> 3. Les fichiers importants sont sauvegardés ou engagés dans le contrôle de version

### Comment activer le Mode YOLO

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

### Changement par raccourci clavier

Pendant une session Qwen Code, utilisez **Shift+Tab** (ou **Tab** sous Windows) pour parcourir rapidement les cinq modes :

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

1. **Nouveau dans la base de code** : Commencez par le **Mode Plan** pour une exploration sûre
2. **Tâches de développement quotidiennes** : Utilisez le **Mode Auto-Acceptation des modifications** (mode par défaut), efficace et sûr
3. **Scripts automatisés** : Utilisez le **Mode YOLO** dans des environnements contrôlés pour une automatisation complète
4. **Remaniement complexe** : Utilisez d'abord le **Mode Plan** pour une planification détaillée, puis passez au mode approprié pour l'exécution
