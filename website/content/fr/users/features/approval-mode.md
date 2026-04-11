# Mode d'approbation

Qwen Code propose quatre modes d'autorisation distincts qui vous permettent de contrôler de manière flexible la façon dont l'IA interagit avec votre code et votre système, en fonction de la complexité de la tâche et du niveau de risque.

## Comparaison des modes d'autorisation

| Mode           | Modification de fichiers                | Commandes shell              | Idéal pour                                                                                               | Niveau de risque |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**       | ❌ Analyse en lecture seule uniquement  | ❌ Non exécutées             | • Exploration de code <br>• Planification de modifications complexes <br>• Revue de code sécurisée                               | Le plus bas     |
| **Default**    | ✅ Approbation manuelle requise | ✅ Approbation manuelle requise | • Codebases nouveaux/inconnus <br>• Systèmes critiques <br>• Collaboration en équipe <br>• Apprentissage et enseignement | Faible        |
| **Auto-Edit**  | ✅ Approuvé automatiquement            | ❌ Approbation manuelle requise | • Tâches de développement quotidiennes <br>• Refactoring et améliorations de code <br>• Automatisation sécurisée                | Moyen     |
| **YOLO**       | ✅ Approuvé automatiquement            | ✅ Approuvé automatiquement            | • Projets personnels de confiance <br>• Scripts automatisés/CI/CD <br>• Tâches de traitement par lots                 | Le plus élevé    |

### Guide de référence rapide

- **Commencez en mode Plan** : Idéal pour comprendre le code avant d'apporter des modifications
- **Travaillez en mode Default** : Le choix équilibré pour la plupart des tâches de développement
- **Passez en mode Auto-Edit** : Lorsque vous effectuez de nombreuses modifications de code sans risque
- **Utilisez YOLO avec parcimonie** : Uniquement pour l'automatisation de confiance dans des environnements contrôlés

> [!tip]
>
> Vous pouvez rapidement passer d'un mode à l'autre pendant une session en utilisant **Shift+Tab** (ou **Tab** sur Windows). La barre d'état du terminal affiche votre mode actuel, vous savez donc toujours quelles autorisations Qwen Code possède.

## 1. Utilisez le mode Plan pour une analyse de code sécurisée

Le mode Plan demande à Qwen Code de créer un plan en analysant le code avec des opérations en **lecture seule**, parfait pour explorer des codebases, planifier des modifications complexes ou réviser du code en toute sécurité.

### Quand utiliser le mode Plan

- **Implémentation en plusieurs étapes** : Lorsque votre fonctionnalité nécessite de modifier de nombreux fichiers
- **Exploration de code** : Lorsque vous souhaitez étudier le code en profondeur avant d'y apporter des modifications
- **Développement interactif** : Lorsque vous souhaitez affiner la direction avec Qwen Code

### Comment utiliser le mode Plan

**Activer le mode Plan pendant une session**

Vous pouvez passer en mode Plan pendant une session en utilisant **Shift+Tab** (ou **Tab** sur Windows) pour parcourir les modes d'autorisation.

Si vous êtes en mode Normal, **Shift+Tab** (ou **Tab** sur Windows) bascule d'abord vers le mode `auto-edits`, indiqué par `⏵⏵ accept edits on` en bas du terminal. Un nouveau **Shift+Tab** (ou **Tab** sur Windows) basculera vers le mode Plan, indiqué par `⏸ plan mode`.

**Utiliser la commande `/plan`**

La commande `/plan` offre un raccourci rapide pour entrer et sortir du mode Plan :

```bash
/plan                          # Entrer en mode plan
/plan refactor the auth module # Entrer en mode plan et commencer la planification
/plan exit                     # Quitter le mode plan, restaurer le mode précédent
```

Lorsque vous quittez le mode Plan avec `/plan exit`, votre mode d'approbation précédent est automatiquement restauré (par exemple, si vous étiez en mode Auto-Edit avant d'entrer en mode Plan, vous y reviendrez).

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

Qwen Code entre en mode Plan et analyse l'implémentation actuelle pour créer un plan complet. Affinez-le avec des questions de suivi :

```
What about backward compatibility?
How should we handle database migration?
```

### Configurer le mode Plan par défaut

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. Utilisez le mode Default pour une interaction contrôlée

Le mode Default est la méthode standard pour travailler avec Qwen Code. Dans ce mode, vous conservez un contrôle total sur toutes les opérations potentiellement risquées : Qwen Code vous demandera votre approbation avant d'apporter des modifications aux fichiers ou d'exécuter des commandes shell.

### Quand utiliser le mode Default

- **Nouveau sur un codebase** : Lorsque vous explorez un projet inconnu et souhaitez faire preuve d'une prudence accrue
- **Systèmes critiques** : Lorsque vous travaillez sur du code de production, de l'infrastructure ou des données sensibles
- **Apprentissage et enseignement** : Lorsque vous souhaitez comprendre chaque étape effectuée par Qwen Code
- **Collaboration en équipe** : Lorsque plusieurs personnes travaillent sur le même codebase
- **Opérations complexes** : Lorsque les modifications impliquent plusieurs fichiers ou une logique complexe

### Comment utiliser le mode Default

**Activer le mode Default pendant une session**

Vous pouvez passer en mode Default pendant une session en utilisant **Shift+Tab** (ou **Tab** sur Windows) pour parcourir les modes d'autorisation. Si vous êtes dans un autre mode, appuyer sur **Shift+Tab** (ou **Tab** sur Windows) finira par revenir au mode Default, indiqué par l'absence d'indicateur de mode en bas du terminal.

**Démarrer une nouvelle session en mode Default**

Le mode Default est le mode initial au démarrage de Qwen Code. Si vous avez changé de mode et souhaitez revenir au mode Default, utilisez :

```
/approval-mode default
```

**Exécuter des requêtes "headless" en mode Default**

Lors de l'exécution de commandes headless, le mode Default est le comportement par défaut. Vous pouvez le spécifier explicitement avec :

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

Qwen Code analysera votre codebase et proposera un plan. Il vous demandera ensuite une approbation avant de :

1. Créer de nouveaux fichiers (contrôleurs, modèles, migrations)
2. Modifier des fichiers existants (ajout de nouvelles colonnes, mise à jour d'APIs)
3. Exécuter des commandes shell (migrations de base de données, installation de dépendances)

Vous pouvez examiner chaque modification proposée et l'approuver ou la rejeter individuellement.

### Configurer le mode Default par défaut

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "default"
  }
}
```

## 3. Mode Auto-Edit

Le mode Auto-Edit demande à Qwen Code d'approuver automatiquement les modifications de fichiers tout en exigeant une approbation manuelle pour les commandes shell, idéal pour accélérer les workflows de développement tout en maintenant la sécurité du système.

### Quand utiliser le mode Auto-Accept Edits

- **Développement quotidien** : Idéal pour la plupart des tâches de codage
- **Automatisation sécurisée** : Permet à l'IA de modifier le code tout en empêchant l'exécution accidentelle de commandes dangereuses
- **Collaboration en équipe** : À utiliser dans les projets partagés pour éviter des impacts involontaires sur les autres

### Comment passer à ce mode

```
# Basculer via la commande
/approval-mode auto-edit

# Ou utiliser le raccourci clavier
Shift+Tab (or Tab on Windows) # Basculer depuis d'autres modes
```

### Exemple de workflow

1. Vous demandez à Qwen Code de refactoriser une fonction
2. L'IA analyse le code et propose des modifications
3. Applique **automatiquement** toutes les modifications de fichiers sans confirmation
4. Si des tests doivent être exécutés, il **demandera une approbation** pour exécuter `npm test`

## 4. Mode YOLO - Automatisation complète

Le mode YOLO accorde à Qwen Code les autorisations les plus élevées, en approuvant automatiquement tous les appels d'outils, y compris la modification de fichiers et les commandes shell.

### Quand utiliser le mode YOLO

- **Scripts automatisés** : Exécution de tâches automatisées prédéfinies
- **Pipelines CI/CD** : Exécution automatisée dans des environnements contrôlés
- **Projets personnels** : Itération rapide dans des environnements entièrement fiables
- **Traitement par lots** : Tâches nécessitant des chaînes de commandes en plusieurs étapes

> [!warning]
>
> **Utilisez le mode YOLO avec prudence** : L'IA peut exécuter n'importe quelle commande avec les autorisations de votre terminal. Assurez-vous que :
>
> 1. Vous faites confiance au codebase actuel
> 2. Vous comprenez toutes les actions que l'IA va effectuer
> 3. Les fichiers importants sont sauvegardés ou commités dans le contrôle de version

### Comment activer le mode YOLO

```
# Activer temporairement (session actuelle uniquement)
/approval-mode yolo

# Définir comme défaut du projet
/approval-mode yolo --project

# Définir comme défaut global utilisateur
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
# Tâche de refactoring entièrement automatisée
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# Sans intervention humaine, l'IA va :
# 1. Exécuter les commandes de test (approuvées automatiquement)
# 2. Corriger les cas de test échoués (modification automatique des fichiers)
# 3. Exécuter git commit (approuvé automatiquement)
```

## Changement de mode et configuration

### Changement via raccourci clavier

Pendant une session Qwen Code, utilisez **Shift+Tab** (ou **Tab** sur Windows) pour parcourir rapidement les quatre modes :

```
Default Mode → Auto-Edit Mode → YOLO Mode → Plan Mode → Default Mode
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

1. **Nouveau sur un codebase** : Commencez par le **mode Plan** pour une exploration sécurisée
2. **Tâches de développement quotidiennes** : Utilisez **Auto-Edit** (mode par défaut), efficace et sûr
3. **Scripts automatisés** : Utilisez le **mode YOLO** dans des environnements contrôlés pour une automatisation complète
4. **Refactoring complexe** : Utilisez d'abord le **mode Plan** pour une planification détaillée, puis passez au mode approprié pour l'exécution