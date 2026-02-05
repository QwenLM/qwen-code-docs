# Mode d'approbation

Qwen Code propose trois modes de permission distincts qui vous permettent de contrôler de manière flexible la façon dont l'IA interagit avec votre code et votre système, en fonction de la complexité des tâches et du niveau de risque.

## Comparaison des modes de permission

| Mode           | Édition de fichiers         | Commandes shell             | Meilleur pour                                                                                          | Niveau de risque |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| **Plan**       | ❌ Analyse en lecture seule | ❌ Non exécutées            | • Exploration du code <br>• Planification de modifications complexes <br>• Revue de code sûre          | Le plus faible   |
| **Default**    | ✅ Approbation manuelle requise | ✅ Approbation manuelle requise | • Nouveaux projets ou inconnus <br>• Systèmes critiques <br>• Collaboration d'équipe <br>• Apprentissage et enseignement | Faible         |
| **Auto-Edit**  | ✅ Approuvé automatiquement | ❌ Approbation manuelle requise | • Tâches quotidiennes de développement <br>• Remaniement et améliorations du code <br>• Automatisation sûre | Moyen          |
| **YOLO**       | ✅ Approuvé automatiquement | ✅ Approuvé automatiquement | • Projets personnels de confiance <br>• Scripts automatisés/CI/CD <br>• Tâches de traitement par lots | Le plus élevé    |

### Guide de référence rapide

- **Commencer en mode Plan** : Idéal pour comprendre avant d'apporter des modifications
- **Travailler en mode par défaut** : Le choix équilibré pour la plupart des travaux de développement
- **Passer en mode Auto-Edit** : Lorsque vous effectuez de nombreux changements de code sûrs
- **Utiliser YOLO avec parcimonie** : Uniquement pour l'automatisation fiable dans des environnements contrôlés

> [!tip]
>
> Vous pouvez rapidement naviguer entre les modes pendant une session en utilisant **Maj+Tabulation** (ou **Tabulation** sur Windows). La barre d'état du terminal affiche votre mode actuel, vous savez donc toujours quelles autorisations Qwen Code possède.

## 1. Utiliser le mode Plan pour une analyse de code sûre

Le mode Plan indique à Qwen Code de créer un plan en analysant la base de code avec des opérations **lecture seule**, parfait pour explorer des bases de code, planifier des modifications complexes ou examiner du code en toute sécurité.

### Quand utiliser le mode Plan

- **Implémentation en plusieurs étapes** : Lorsque votre fonctionnalité nécessite des modifications dans de nombreux fichiers
- **Exploration du code** : Lorsque vous souhaitez étudier en profondeur la base de code avant d'apporter des modifications
- **Développement interactif** : Lorsque vous souhaitez itérer sur la direction avec Qwen Code

### Comment utiliser le mode Plan

**Activer le mode Plan pendant une session**

Vous pouvez basculer en mode Plan pendant une session en utilisant **Maj+Tab** (ou **Tab** sur Windows) pour parcourir les modes d'autorisation.

Si vous êtes en mode Normal, **Maj+Tab** (ou **Tab** sur Windows) bascule d'abord en mode `auto-edits`, indiqué par `mpeg accept edits on` en bas du terminal. Un nouveau **Maj+Tab** (ou **Tab** sur Windows) basculera ensuite en mode Plan, indiqué par `⏸ plan mode`.

**Démarrer une nouvelle session en mode Plan**

Pour démarrer une nouvelle session en mode Plan, utilisez la commande `/approval-mode` puis sélectionnez `plan`

```bash
/approval-mode
```

**Exécuter des requêtes "headless" en mode Plan**

Vous pouvez également exécuter directement une requête en mode Plan avec `-p` ou `prompt` :

```bash
qwen --prompt "Qu'est-ce que l'apprentissage automatique ?"
```

### Exemple : Planification d'un refactoring complexe

```bash
/approval-mode plan
```

```
Je dois refactoriser notre système d'authentification pour utiliser OAuth2. Créer un plan de migration détaillé.
```

Qwen Code analyse l'implémentation actuelle et crée un plan complet. Affinez avec des suites :

```
Qu'en est-il de la rétrocompatibilité ?
Comment devrions-nous gérer la migration de la base de données ?
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

Le mode par défaut est la manière standard de travailler avec Qwen Code. Dans ce mode, vous conservez un contrôle total sur toutes les opérations potentiellement risquées - Qwen Code demandera votre approbation avant d'apporter des modifications aux fichiers ou d'exécuter des commandes shell.

### Quand utiliser le mode par défaut

- **Nouveau dans une base de code** : Lorsque vous explorez un projet inconnu et que vous souhaitez faire preuve de prudence
- **Systèmes critiques** : Lorsque vous travaillez sur du code en production, des infrastructures ou des données sensibles
- **Apprentissage et enseignement** : Lorsque vous souhaitez comprendre chaque étape effectuée par Qwen Code
- **Collaboration en équipe** : Lorsque plusieurs personnes travaillent sur la même base de code
- **Opérations complexes** : Lorsque les modifications impliquent plusieurs fichiers ou une logique complexe

### Comment utiliser le mode par défaut

**Activer le mode par défaut pendant une session**

Vous pouvez basculer en mode par défaut pendant une session en utilisant **Maj+Tab**​ (ou **Tab** sur Windows) pour parcourir les modes d'autorisation. Si vous êtes dans n'importe quel autre mode, appuyer sur **Maj+Tab** (ou **Tab** sur Windows) finira par revenir au mode par défaut, indiqué par l'absence de tout indicateur de mode en bas du terminal.

**Démarrer une nouvelle session en mode par défaut**

Le mode par défaut est le mode initial lorsque vous démarrez Qwen Code. Si vous avez changé de mode et souhaitez revenir au mode par défaut, utilisez :

```
/approval-mode default
```

**Exécuter des requêtes "headless" en mode par défaut**

Lorsque vous exécutez des commandes headless, le mode par défaut est le comportement par défaut. Vous pouvez le spécifier explicitement avec :

```
qwen --prompt "Analyser ce code à la recherche de bogues potentiels"
```

### Exemple : Implémentation sécurisée d'une fonctionnalité

```
/approval-mode default
```

```
J'ai besoin d'ajouter des images de profil utilisateur à notre application. Les images doivent être stockées dans un bucket S3 et les URL sauvegardées dans la base de données.
```

Qwen Code analysera votre base de code et proposera un plan. Il demandera ensuite votre approbation avant :

1. La création de nouveaux fichiers (contrôleurs, modèles, migrations)
2. La modification des fichiers existants (ajout de nouvelles colonnes, mise à jour des API)
3. L'exécution de commandes shell (migrations de base de données, installation de dépendances)

Vous pouvez examiner chaque modification proposée et l'approuver ou la rejeter individuellement.

### Configurer le mode par défaut comme mode par défaut

```bash
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "default"
  }
}
```

## 3. Mode d'édition automatique

Le mode d'édition automatique indique à Qwen Code d'approuver automatiquement les modifications de fichiers tout en nécessitant une approbation manuelle pour les commandes shell, idéal pour accélérer les flux de développement tout en maintenant la sécurité du système.

### Quand utiliser le mode d'acceptation automatique des modifications

- **Développement quotidien** : Idéal pour la plupart des tâches de codage
- **Automatisation sécurisée** : Permet à l'IA de modifier le code tout en empêchant l'exécution accidentelle de commandes dangereuses
- **Collaboration en équipe** : À utiliser dans les projets partagés pour éviter des impacts non souhaités sur les autres membres

### Comment basculer vers ce mode

```

# Basculer via commande
/approval-mode auto-edit

# Ou utiliser le raccourci clavier
Maj+Tab (ou Tab sur Windows) # Bascule depuis les autres modes
```

### Exemple de flux de travail

1. Vous demandez à Qwen Code de refactoriser une fonction
2. L'IA analyse le code et propose des modifications
3. Applique **automatiquement** toutes les modifications de fichiers sans confirmation
4. Si des tests doivent être exécutés, elle **demandera l'autorisation** pour lancer `npm test`

## 4. Mode YOLO - Automatisation complète

Le mode YOLO accorde à Qwen Code les autorisations les plus élevées, approuvant automatiquement tous les appels d'outils, y compris la modification de fichiers et les commandes shell.

### Quand utiliser le mode YOLO

- **Scripts automatisés** : Exécution de tâches automatisées prédéfinies
- **Pipelines CI/CD** : Exécution automatisée dans des environnements contrôlés
- **Projets personnels** : Itération rapide dans des environnements entièrement fiables
- **Traitement par lots** : Tâches nécessitant des chaînes de commandes multip étapes

> [!warning]
>
> **Utilisez le mode YOLO avec précaution** : L'IA peut exécuter n'importe quelle commande avec les autorisations de votre terminal. Assurez-vous :
>
> 1. De faire confiance à la base de code actuelle
> 2. De comprendre toutes les actions que l'IA effectuera
> 3. Que les fichiers importants sont sauvegardés ou enregistrés dans le contrôle de version

### Comment activer le mode YOLO

```

# Activer temporairement (session actuelle uniquement)
/approval-mode yolo

# Définir comme valeur par défaut du projet
/approval-mode yolo --project

# Définir comme valeur par défaut globale pour l'utilisateur
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

### Exemple de flux de travail automatisé

```bash

```

# Tâche de refactorisation entièrement automatisée
qwen --prompt "Exécuter la suite de tests, corriger tous les tests en échec, puis valider les modifications"

# Sans intervention humaine, l'IA va :

# 1. Exécuter les commandes de test (approuvées automatiquement)

# 2. Corriger les cas de test ayant échoué (modification automatique des fichiers)

# 3. Exécuter git commit (approuvé automatiquement)
```

## Changement de mode et configuration

### Changement via raccourci clavier

Durant une session Qwen Code, utilisez **Maj+Tab**​ (ou **Tab** sur Windows) pour basculer rapidement entre les trois modes :

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

1. **Nouveau dans la base de code** : Commencez par le **Mode Plan** pour une exploration sûre
2. **Tâches de développement quotidiennes** : Utilisez **Auto-Accept Edits** (mode par défaut), efficace et sûr
3. **Scripts automatisés** : Utilisez le **Mode YOLO** dans des environnements contrôlés pour une automatisation complète
4. **Refactorisation complexe** : Utilisez d'abord le **Mode Plan** pour une planification détaillée, puis basculez vers le mode approprié pour l'exécution