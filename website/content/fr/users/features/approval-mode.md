# Mode d'approbation

Qwen Code propose trois modes de permission distincts qui vous permettent de contrôler de manière flexible la façon dont l'IA interagit avec votre code et votre système, en fonction de la complexité des tâches et du niveau de risque.

## Comparaison des modes de permission

| Mode           | Modification de fichiers         | Commandes shell              | Idéal pour                                                                                                | Niveau de risque |
| -------------- | -------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| **Plan**​      | ❌ Analyse en lecture seule      | ❌ Non exécuté               | • Exploration de code <br>• Planification de changements complexes <br>• Revue de code sécurisée          | Le plus faible   |
| **Default**​   | ✅ Approbation manuelle requise  | ✅ Approbation manuelle requise | • Nouveaux codes sources/non familiers <br>• Systèmes critiques <br>• Collaboration en équipe <br>• Apprentissage et enseignement | Faible           |
| **Auto-Edit**​ | ✅ Approuvé automatiquement      | ❌ Approbation manuelle requise | • Tâches de développement quotidiennes <br>• Refactorisation et améliorations de code <br>• Automatisation sécurisée | Moyen            |
| **YOLO**​      | ✅ Approuvé automatiquement      | ✅ Approuvé automatiquement   | • Projets personnels fiables <br>• Scripts automatisés/CI/CD <br>• Tâches de traitement par lots         | Le plus élevé    |

### Guide de Référence Rapide

- **Commencer en Mode Plan** : Idéal pour comprendre avant d'apporter des modifications
- **Travailler en Mode Par Défaut** : Le choix équilibré pour la plupart des tâches de développement
- **Passer en Mode Auto-Édition** : Lorsque vous effectuez de nombreux changements de code sûrs
- **Utiliser YOLO avec parcimonie** : Uniquement pour une automatisation fiable dans des environnements contrôlés

> [!tip]
>
> Vous pouvez rapidement alterner entre les modes pendant une session en utilisant **Maj+Tab**. La barre d'état du terminal indique votre mode actuel, afin que vous sachiez toujours quelles autorisations Qwen Code possède.

## 1. Utiliser le Mode Plan pour une analyse sécurisée du code

Le Mode Plan demande à Qwen Code de créer un plan en analysant la base de code à l’aide d’opérations **en lecture seule**, parfait pour explorer des bases de code, planifier des modifications complexes ou examiner du code en toute sécurité.

### Quand utiliser le mode Plan

- **Implémentation en plusieurs étapes** : Lorsque votre fonctionnalité nécessite des modifications dans de nombreux fichiers
- **Exploration du code** : Lorsque vous souhaitez explorer la base de code en profondeur avant d'apporter des modifications
- **Développement interactif** : Lorsque vous souhaitez itérer sur la direction avec Qwen Code

### Comment utiliser le mode Plan

**Activer le mode Plan pendant une session**

Vous pouvez basculer en mode Plan pendant une session en utilisant **Maj+Tab** pour faire défiler les modes d'autorisation.

Si vous êtes en mode Normal, **Maj+Tab** active d'abord le mode `auto-edits`, indiqué par `⏵⏵ accept edits on` en bas du terminal. Un appui supplémentaire sur **Maj+Tab** permet de passer en mode Plan, indiqué par `⏸ plan mode`.

**Démarrer une nouvelle session en mode Plan**

Pour démarrer une nouvelle session en mode Plan, utilisez `/approval-mode`, puis sélectionnez `plan`

```bash
/approval-mode
```

**Exécuter des requêtes "headless" en mode Plan**

Vous pouvez également exécuter directement une requête en mode Plan avec `-p` ou `prompt` :

```bash
qwen --prompt "Qu'est-ce que l'apprentissage automatique ?"
```

### Exemple : Planifier un refactoring complexe

```bash
/approval-mode plan
```

```
Je dois restructurer notre système d'authentification pour utiliser OAuth2. Créez un plan de migration détaillé.
```

Qwen Code analyse l'implémentation actuelle et élabore un plan complet. Affinez-le avec des demandes complémentaires :

```
Qu'en est-il de la compatibilité ascendante ?
Comment devons-nous gérer la migration de la base de données ?
```

### Configurer le mode Plan comme mode par défaut

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. Utiliser le mode par défaut pour une interaction contrôlée

Le mode par défaut est la manière standard de travailler avec Qwen Code. Dans ce mode, vous conservez un contrôle total sur toutes les opérations potentiellement risquées : Qwen Code vous demandera votre approbation avant d'apporter des modifications aux fichiers ou d'exécuter des commandes shell.

### Quand utiliser le mode par défaut

- **Nouveau sur une base de code** : Lorsque vous explorez un projet peu familier et que vous souhaitez faire preuve de prudence accrue
- **Systèmes critiques** : Lorsque vous travaillez sur du code en production, de l'infrastructure ou des données sensibles
- **Apprentissage et enseignement** : Lorsque vous souhaitez comprendre chaque étape effectuée par Qwen Code
- **Collaboration en équipe** : Lorsque plusieurs personnes travaillent sur la même base de code
- **Opérations complexes** : Lorsque les modifications impliquent plusieurs fichiers ou une logique complexe

### Comment utiliser le mode par défaut

**Activer le mode par défaut pendant une session**

Vous pouvez basculer en mode par défaut pendant une session en utilisant **Maj+Tab** pour faire défiler les modes d'autorisation. Si vous êtes dans un autre mode, appuyer sur **Maj+Tab** finira par revenir au mode par défaut, indiqué par l'absence de tout indicateur de mode en bas du terminal.

**Démarrer une nouvelle session en mode par défaut**

Le mode par défaut est le mode initial lorsque vous démarrez Qwen Code. Si vous avez changé de mode et souhaitez revenir au mode par défaut, utilisez :

```
/approval-mode default
```

**Exécuter des requêtes "headless" en mode par défaut**

Lors de l'exécution de commandes headless, le mode par défaut est le comportement par défaut. Vous pouvez le spécifier explicitement avec :

```
qwen --prompt "Analyser ce code pour détecter d'éventuels bogues"
```

### Exemple : Implémentation sécurisée d'une fonctionnalité

```
/approval-mode default
```

```
J'ai besoin d'ajouter des photos de profil utilisateur à notre application. Les images doivent être stockées dans un bucket S3 et les URL enregistrées dans la base de données.
```

Qwen Code analysera votre base de code et proposera un plan. Il vous demandera ensuite une approbation avant :

1. Créer de nouveaux fichiers (contrôleurs, modèles, migrations)
2. Modifier des fichiers existants (ajout de nouvelles colonnes, mise à jour des API)
3. Exécuter des commandes shell (migrations de base de données, installation de dépendances)

Vous pouvez examiner chaque modification proposée et l'approuver ou la rejeter individuellement.

### Configurer le mode par défaut comme valeur par défaut

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "default"
  }
}
```

## 3. Mode Édition Automatique

Le mode Édition Automatique indique à Qwen Code d'approuver automatiquement les modifications de fichiers tout en nécessitant une approbation manuelle pour les commandes shell, idéal pour accélérer les flux de travail de développement tout en maintenant la sécurité du système.

### Quand utiliser le mode Auto-Accept Edits

- **Développement quotidien** : Idéal pour la plupart des tâches de codage
- **Automatisation sécurisée** : Permet à l'IA de modifier le code tout en empêchant l'exécution accidentelle de commandes dangereuses
- **Collaboration en équipe** : À utiliser dans des projets partagés pour éviter les impacts involontaires sur les autres

### Comment passer à ce mode

```

# Basculer via commande
/approval-mode auto-edit

# Ou utiliser un raccourci clavier
Shift+Tab  # Passer d'autres modes
```

### Exemple de flux de travail

1. Vous demandez à Qwen Code de refactoriser une fonction
2. L'IA analyse le code et propose des modifications
3. **Applique automatiquement**​ toutes les modifications de fichiers sans confirmation
4. Si des tests doivent être exécutés, il **demandera une approbation**​ pour exécuter `npm test`

## 4. Mode YOLO - Automatisation complète

Le mode YOLO accorde à Qwen Code les autorisations les plus élevées, approuvant automatiquement tous les appels d'outils, y compris l'édition de fichiers et les commandes shell.

### Quand utiliser le mode YOLO

- **Scripts automatisés** : Exécution de tâches automatisées prédéfinies
- **Pipelines CI/CD** : Exécution automatisée dans des environnements contrôlés
- **Projets personnels** : Itération rapide dans des environnements entièrement fiables
- **Traitement par lots** : Tâches nécessitant des chaînes de commandes multi-étapes

> [!warning]
>
> **Utilisez le mode YOLO avec prudence** : L'IA peut exécuter n'importe quelle commande avec les permissions de votre terminal. Assurez-vous que :
>
> 1. Vous faites confiance au code source actuel
> 2. Vous comprenez toutes les actions que l'IA va effectuer
> 3. Les fichiers importants sont sauvegardés ou commités dans le contrôle de version

### Comment activer le mode YOLO

```

# Activer temporairement (session en cours uniquement)
/approval-mode yolo

# Définir comme valeur par défaut du projet
/approval-mode yolo --project

# Définir comme valeur par défaut globale de l'utilisateur
/approval-mode yolo --user
```

### Exemple de configuration

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "yolo",
"confirmShellCommands": false,
"confirmFileEdits": false
  }
}
```

### Exemple de workflow automatisé

```bash

# Tâche de refactorisation entièrement automatisée
qwen --prompt "Exécuter la suite de tests, corriger tous les tests en échec, puis valider les modifications"

# Sans intervention humaine, l'IA va :

# 1. Exécuter les commandes de test (approuvé automatiquement)

# 2. Corriger les cas de test en échec (modifier les fichiers automatiquement)

# 3. Exécuter git commit (approuvé automatiquement)
```

## Changement de mode et configuration

### Changement via raccourci clavier

Durant une session Qwen Code, utilisez **Maj+Tab**​ pour passer rapidement d'un mode à l'autre parmi les trois modes suivants :

```
Mode par défaut → Mode auto-édition → Mode YOLO → Mode plan → Mode par défaut
```

### Configuration persistante

```
// Niveau projet : ./.qwen/settings.json
// Niveau utilisateur : ~/.qwen/settings.json
{
  "permissions": {
"defaultMode": "auto-edit",  // ou "plan" ou "yolo"
"confirmShellCommands": true,
"confirmFileEdits": true
  }
}
```

### Recommandations d'utilisation des modes

1. **Nouveau sur la base de code** : Commencez par le **Mode Plan** pour une exploration sécurisée  
2. **Tâches de développement quotidiennes** : Utilisez **Acceptation automatique des modifications** (mode par défaut), efficace et sécurisé  
3. **Scripts automatisés** : Utilisez le **Mode YOLO** dans des environnements contrôlés pour une automatisation complète  
4. **Refactorisation complexe** : Utilisez d'abord le **Mode Plan** pour une planification détaillée, puis passez au mode approprié pour l'exécution