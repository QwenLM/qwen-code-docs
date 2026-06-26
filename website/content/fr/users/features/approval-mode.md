# Mode d'approbation

Qwen Code offre cinq modes de permission distincts qui vous permettent de contrôler flexiblement la façon dont l'IA interagit avec votre code et votre système, en fonction de la complexité et du niveau de risque de la tâche.

## Comparaison des modes de permission

| Mode                 | Édition de fichiers                | Commandes shell              | Meilleur pour                                                                                             | Niveau de risque |
| -------------------- | --------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| **Plan**             | ❌ Analyse en lecture seule       | ❌ Non exécutées             | • Exploration de code<br>• Planification de changements complexes<br>• Revue de code sécurisée            | Le plus bas      |
| **Ask Permissions**  | ✅ Approbation manuelle requise   | ✅ Approbation manuelle requise | • Nouvelles codebase non familières<br>• Systèmes critiques<br>• Collaboration d'équipe<br>• Apprentissage | Faible           |
| **Auto-Edit**        | ✅ Auto-approuvé                  | ❌ Approbation manuelle requise | • Tâches de développement quotidiennes<br>• Refactoring et améliorations de code<br>• Automatisation sécurisée | Moyen        |
| **Auto**             | ✅ Évalué par classifieur         | ✅ Évalué par classifieur     | • Sessions autonomes longues<br>• Quand Auto-Edit est trop prudent mais YOLO trop risqué                  | Moyen            |
| **YOLO**             | ✅ Auto-approuvé                  | ✅ Auto-approuvé              | • Projets personnels de confiance<br>• Scripts automatisés / CI/CD<br>• Traitements par lots              | Le plus élevé    |

> [!NOTE]
>
> Le mode précédemment nommé **Default** a été renommé **Ask Permissions** pour mieux décrire son comportement. La valeur de configuration sous-jacente (`tools.approvalMode: "default"`) et la commande `/approval-mode default` restent inchangées pour la rétrocompatibilité.

### Guide de référence rapide

- **Commencez par le mode Plan** : Idéal pour comprendre avant de modifier
- **Travaillez en mode Ask Permissions** : Le choix équilibré pour la plupart des développements
- **Passez en Auto-Edit** : Quand vous effectuez de nombreuses modifications de code sans risque
- **Essayez le mode Auto** : Quand vous voulez moins d'interruptions mais toujours de la sécurité sur les commandes shell et les appels réseau – un classifieur LLM évalue chaque appel
- **Utilisez YOLO avec parcimonie** : Uniquement pour l'automatisation de confiance dans des environnements contrôlés

> [!tip]
>
> Vous pouvez rapidement parcourir les modes pendant une session avec **Shift+Tab** (ou **Tab** sous Windows). La barre d'état du terminal affiche votre mode actuel, vous savez donc toujours quelles permissions possède Qwen Code.

> L'ordre de cycle est : **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. Utiliser le mode Plan pour une analyse sécurisée du code

Le mode Plan demande à Qwen Code de créer un plan en analysant la codebase avec des opérations **en lecture seule**, parfait pour explorer les codebase, planifier des changements complexes ou réviser du code en toute sécurité.

### Quand utiliser le mode Plan

- **Implémentation multi-étapes** : Quand votre fonctionnalité nécessite des modifications sur de nombreux fichiers
- **Exploration de code** : Quand vous voulez étudier la codebase en profondeur avant toute modification
- **Développement interactif** : Quand vous voulez itérer sur la direction avec Qwen Code

### Comment utiliser le mode Plan

**Activer le mode Plan pendant une session**

Vous pouvez passer en mode Plan pendant une session en utilisant **Shift+Tab** (ou **Tab** sous Windows) pour parcourir les modes de permission.

Si vous êtes en mode normal, **Shift+Tab** (ou **Tab** sous Windows) passe d'abord en mode `auto-edits`, indiqué par `⏵⏵ accept edits on` en bas du terminal. Un **Shift+Tab** (ou **Tab**) supplémentaire vous fera passer en mode Plan, indiqué par `⏸ plan mode`.

**Utiliser la commande `/plan`**

La commande `/plan` fournit un raccourci rapide pour entrer et sortir du mode Plan :

Les demandes de planification normales ne changent pas de mode par elles-mêmes. Si vous voulez le workflow en lecture seule du mode Plan, utilisez `/plan`, le raccourci clavier ou définissez le mode d'approbation sur `plan` explicitement.

```bash
/plan                          # Entrer en mode plan
/plan refactor the auth module # Entrer en mode plan et commencer la planification
/plan exit                     # Quitter le mode plan, restaurer le mode précédent
```

Quand vous quittez le mode Plan avec `/plan exit`, votre mode d'approbation précédent est automatiquement restauré (par exemple, si vous étiez en Auto-Edit avant d'entrer en mode Plan, vous reviendrez en Auto-Edit).

**Démarrer une nouvelle session en mode Plan**

Pour démarrer une nouvelle session en mode Plan, utilisez `/approval-mode` puis sélectionnez `plan`

```bash
/approval-mode
```

**Exécuter des requêtes « headless » en mode Plan**

Vous pouvez aussi exécuter une requête directement en mode Plan avec `-p` ou `prompt` :

```bash
qwen --prompt "What is machine learning?"
```

### Exemple : Planifier un refactoring complexe

```bash
/plan J'ai besoin de refactorer notre système d'authentification pour utiliser OAuth2. Créez un plan de migration détaillé.
```

Qwen Code entre en mode Plan et analyse l'implémentation actuelle pour créer un plan complet. Affinez avec des suivis :

```
Qu'en est-il de la rétrocompatibilité ?
Comment devrions-nous gérer la migration de la base de données ?
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

Le mode Ask Permissions est le mode standard pour travailler avec Qwen Code. Dans ce mode, vous conservez un contrôle total sur toutes les opérations potentiellement risquées – Qwen Code vous demandera votre approbation avant d'effectuer toute modification de fichier ou d'exécuter des commandes shell.

### Quand utiliser le mode Ask Permissions

- **Nouveau dans une codebase** : Quand vous explorez un projet inconnu et que vous voulez être particulièrement prudent
- **Systèmes critiques** : Quand vous travaillez sur du code de production, de l'infrastructure ou des données sensibles
- **Apprentissage et enseignement** : Quand vous voulez comprendre chaque étape que Qwen Code effectue
- **Collaboration d'équipe** : Quand plusieurs personnes travaillent sur la même codebase
- **Opérations complexes** : Quand les modifications impliquent plusieurs fichiers ou une logique complexe

### Comment utiliser le mode Ask Permissions

**Activer le mode Ask Permissions pendant une session**

Vous pouvez passer en mode Ask Permissions pendant une session en utilisant **Shift+Tab** (ou **Tab** sous Windows) pour parcourir les modes de permission. Si vous êtes dans un autre mode, appuyer sur **Shift+Tab** (ou **Tab**) finira par revenir au mode Ask Permissions, indiqué par l'absence d'indicateur de mode en bas du terminal.

**Démarrer une nouvelle session en mode Ask Permissions**

Le mode Ask Permissions est le mode initial lorsque vous démarrez Qwen Code. Si vous avez changé de mode et souhaitez revenir en mode Ask Permissions, utilisez :

```
/approval-mode default
```

**Exécuter des requêtes « headless » en mode Ask Permissions**

Lors de l'exécution de commandes headless, le mode Ask Permissions est le comportement par défaut. Vous pouvez le spécifier explicitement avec :

```
qwen --prompt "Analysez ce code pour détecter d'éventuels bugs"
```

### Exemple : Implémenter une fonctionnalité en toute sécurité

```
/approval-mode default
```

```
J'ai besoin d'ajouter des photos de profil utilisateur à notre application. Les photos doivent être stockées dans un bucket S3 et les URL enregistrées dans la base de données.
```

Qwen Code analysera votre codebase et proposera un plan. Il demandera ensuite votre approbation avant :

1. De créer de nouveaux fichiers (contrôleurs, modèles, migrations)
2. De modifier des fichiers existants (ajout de nouvelles colonnes, mise à jour des API)
3. D'exécuter des commandes shell (migrations de base de données, installation de dépendances)

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

Le mode Auto-Edit demande à Qwen Code d'approuver automatiquement les modifications de fichiers tout en nécessitant une approbation manuelle pour les commandes shell, idéal pour accélérer les flux de développement tout en maintenant la sécurité du système.

Les outils d'édition auto-approuvés incluent `edit`, `write_file` et `notebook_edit`.

### Quand utiliser le mode Auto-Edit

- **Développement quotidien** : Idéal pour la plupart des tâches de codage
- **Automatisation sécurisée** : Permet à l'IA de modifier le code tout en empêchant l'exécution accidentelle de commandes dangereuses
- **Collaboration d'équipe** : Utilisation dans des projets partagés pour éviter des impacts non intentionnels sur les autres

### Comment passer à ce mode

```
# Passer via la commande
/approval-mode auto-edit

# Ou utiliser le raccourci clavier
Shift+Tab (ou Tab sous Windows) # Passer depuis d'autres modes
```

### Exemple de flux de travail

1. Vous demandez à Qwen Code de refactorer une fonction
2. L'IA analyse le code et propose des modifications
3. **Applique automatiquement** toutes les modifications de fichiers sans confirmation
4. Si des tests doivent être exécutés, elle **demandera l'approbation** pour exécuter `npm test`

## 4. Mode Auto – Approbation pilotée par classifieur

Le mode Auto se situe entre Auto-Edit et YOLO. Un classifieur LLM évalue chaque
commande shell, appel réseau et modification hors de l'espace de travail, et
approuve automatiquement ceux qu'il juge sûrs tout en bloquant les risqués.
La plupart des opérations en lecture seule et des modifications dans l'espace de travail
contournent le classifieur pour plus de rapidité.

Consultez [auto-mode.md](./auto-mode.md) pour la référence complète (configuration
des indications, dépannage, FAQ).

### Quand utiliser le mode Auto

- **Sessions autonomes longues** : Quand le mode Ask Permissions interrompt trop souvent mais
  YOLO est trop risqué.
- **Projets de confiance** : Codebase internes où l'agent doit continuer
  à avancer mais où vous voulez toujours une barrière de protection sur les commandes shell
  destructrices et les appels réseau sortants.
- **Exécutions headless / planifiées** : Là où Auto-Edit ne suffit pas (l'agent
  a aussi besoin d'exécuter des commandes shell) mais où vous voulez de la sécurité sur
  `rm -rf /`, `curl ... | sh`, l'exfiltration d'identifiants, etc.

### Comment utiliser le mode Auto

**Activer le mode Auto pendant une session**

Appuyez sur **Shift+Tab** (ou **Tab** sous Windows) pour passer en mode Auto. La
barre d'état affiche le mode actif.

**Utiliser la commande `/approval-mode`**

```
/approval-mode auto
```

La première fois que vous entrez en mode Auto, un message d'information explique son
fonctionnement. L'avis ne réapparaît pas.

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

Le classifieur est biaisé vers le blocage en cas d'incertitude. Valeurs par défaut :

- **Approuvé automatiquement** : commandes en lecture seule (ls, cat, git status, grep, find),
  installation de paquets dans le répertoire courant, commandes de construction/test,
  modifications de fichiers dans l'espace de travail, opérations locales uniquement.
- **Bloqué** : destruction irréversible (rm -rf /, fdisk, mkfs),
  exécution de code depuis l'extérieur (curl | sh, eval de contenu distant),
  exfiltration d'identifiants, persistance non autorisée (modifications .bashrc,
  crontab), affaiblissement de la sécurité, force-push vers main/master.

Vous pouvez personnaliser le jugement du classifieur via des indications en langage
naturel dans settings.json. Voir [auto-mode.md](./auto-mode.md#configuration-des-indications).

### Garde-fous de sécurité

- **Les règles strictes restent en vigueur** : Les règles `permissions.deny` bloquent
  les actions avant même que le classifieur ne s'exécute.
- **Les règles d'autorisation trop larges sont désactivées en mode Auto** : par exemple
  `permissions.allow: ["Bash"]` (autoriser toutes les commandes shell) contourne
  le classifieur ; l'entrée en mode Auto désactive temporairement ces règles pour que le
  classifieur puisse faire son travail. Les règles sont restaurées à la sortie du mode
  Auto. Les paramètres sur le disque ne sont jamais modifiés.
- **Fermeture en cas d'échec** : lorsque l'API du classifieur est inaccessible, l'action
  est bloquée plutôt qu'autorisée. Après deux appels indisponibles consécutifs,
  l'appel d'outil suivant revient à une approbation manuelle.
- **Protection contre les boucles** : après trois blocages de politique consécutifs,
  l'appel suivant revient également à une approbation manuelle pour que l'agent ne reste
  pas bloqué sur une approche sans issue.

### Exemple

```
/approval-mode auto
Refactorisez le module d'authentification pour utiliser OAuth2. Exécutez l'ensemble des tests après.
```

Qwen Code effectue les modifications de fichiers (les modifications dans l'espace de travail
contournent le classifieur), exécute `npm test` (le classifieur juge sûr), et signale
un blocage s'il tente quelque chose de risqué comme `rm -rf /Users/me/.aws`. Vous pouvez
examiner la raison en ligne et décider de passer en mode Ask Permissions pour cette étape.

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
        "allow": ["Exécution de pytest, mypy et ruff sur ce dépôt Python"],
        "deny": ["Tout appel réseau vers intranet.example.com"],
      },
      "environment": ["Monorepo open-source ; les commits sont signés"],
    },
  },
}
```

## 5. Mode YOLO – Automatisation complète

Le mode YOLO accorde à Qwen Code les permissions les plus élevées, approuvant automatiquement tous les appels d'outils, y compris l'édition de fichiers et les commandes shell.

### Quand utiliser le mode YOLO

- **Scripts automatisés** : Exécution de tâches automatisées prédéfinies
- **Pipelines CI/CD** : Exécution automatisée dans des environnements contrôlés
- **Projets personnels** : Itération rapide dans des environnements entièrement fiables
- **Traitement par lots** : Tâches nécessitant des chaînes de commandes multi-étapes

> [!warning]
>
> **Utilisez le mode YOLO avec prudence** : L'IA peut exécuter n'importe quelle commande avec vos permissions de terminal. Assurez-vous que :
>
> 1. Vous faites confiance à la codebase actuelle
> 2. Vous comprenez toutes les actions que l'IA effectuera
> 3. Les fichiers importants sont sauvegardés ou versionnés

### Comment activer le mode YOLO

```
# Activation temporaire (session actuelle uniquement)
/approval-mode yolo

# Définir comme valeur par défaut du projet
/approval-mode yolo --project

# Définir comme valeur globale par défaut de l'utilisateur
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

### Exemple de flux automatisé

```bash
# Tâche de refactoring entièrement automatisée
qwen --prompt "Exécute la suite de tests, corrige tous les tests échoués, puis commit les modifications"

# Sans intervention humaine, l'IA effectuera :
# 1. Exécuter les commandes de test (auto-approuvées)
# 2. Corriger les cas de test échoués (édition automatique des fichiers)
# 3. Exécuter git commit (auto-approuvé)
```

## Changement de mode et configuration

### Changement par raccourci clavier

Pendant une session Qwen Code, utilisez **Shift+Tab** (ou **Tab** sous Windows) pour parcourir rapidement les cinq modes :

```
Mode Plan → Mode Ask Permissions → Mode Auto-Edit → Mode Auto → Mode YOLO → Mode Plan
```

### Configuration persistante

```
// Niveau projet : ./.qwen/settings.json
// Niveau utilisateur : ~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // ou "plan", "default", "auto", "yolo"
  }
}
```

### Recommandations d'utilisation des modes

1. **Nouveau dans une codebase** : Commencez par le **mode Plan** pour une exploration sécurisée
2. **Tâches de développement quotidiennes** : Utilisez **Auto-Edit** (mode par défaut), efficace et sûr
3. **Scripts automatisés** : Utilisez le **mode YOLO** dans des environnements contrôlés pour une automatisation complète
4. **Refactoring complexe** : Utilisez d'abord le **mode Plan** pour une planification détaillée, puis passez au mode approprié pour l'exécution