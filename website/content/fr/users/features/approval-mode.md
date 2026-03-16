# Mode d’approbation

Qwen Code propose trois modes d’autorisation distincts, vous permettant de contrôler de façon souple l’interaction de l’IA avec votre code et votre système, en fonction de la complexité des tâches et du niveau de risque.

## Comparaison des modes d’autorisation

| Mode         | Modification de fichiers      | Commandes shell             | Recommandé pour                                                                                          | Niveau de risque |
| ------------ | ----------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| **Plan**     | ❌ Analyse en lecture seule uniquement | ❌ Non exécutées              | • Exploration de code <br>• Planification de modifications complexes <br>• Revue de code sécurisée      | Le plus faible   |
| **Par défaut** | ✅ Approuvées manuellement     | ✅ Approuvées manuellement    | • Nouvelles bases de code ou peu familières <br>• Systèmes critiques <br>• Collaboration d’équipe <br>• Apprentissage et enseignement | Faible           |
| **Édition automatique** | ✅ Approuvées automatiquement | ❌ Approuvées manuellement    | • Tâches quotidiennes de développement <br>• Refactoring et améliorations de code <br>• Automatisation sécurisée | Moyen            |
| **YOLO**     | ✅ Approuvées automatiquement | ✅ Approuvées automatiquement | • Projets personnels fiables <br>• Scripts automatisés / CI/CD <br>• Traitements par lots               | Le plus élevé    |

### Guide de référence rapide

- **Démarrez en mode Plan** : Idéal pour comprendre le code avant d’apporter des modifications  
- **Travaillez en mode Par défaut** : Le choix équilibré pour la plupart des tâches de développement  
- **Passez en mode Édition automatique** : Lorsque vous effectuez de nombreuses modifications de code sûres  
- **Utilisez YOLO avec parcimonie** : Uniquement pour l’automatisation fiable dans des environnements contrôlés  

> [!tip]  
>  
> Vous pouvez basculer rapidement entre les modes pendant une session à l’aide de **Maj+Tab** (ou **Tab** sous Windows). La barre d’état du terminal affiche votre mode actuel, afin que vous sachiez toujours quelles autorisations Qwen Code possède.  

## 1. Utilisez le mode Plan pour une analyse sécurisée du code  

Le mode Plan indique à Qwen Code de générer un plan en analysant la base de code à l’aide d’opérations **en lecture seule**, ce qui est parfait pour explorer une base de code, planifier des modifications complexes ou examiner du code en toute sécurité.

### Quand utiliser le mode Plan

- **Implémentation en plusieurs étapes** : Lorsque votre fonctionnalité nécessite des modifications dans de nombreux fichiers.  
- **Exploration du code** : Lorsque vous souhaitez étudier en profondeur la base de code avant d’apporter des modifications.  
- **Développement interactif** : Lorsque vous souhaitez itérer sur la direction à suivre avec Qwen Code.

### Comment utiliser le mode Plan

**Activer le mode Plan pendant une session**

Vous pouvez basculer en mode Plan pendant une session à l’aide de la combinaison **Maj+Tab** (ou **Tab** sous Windows) pour parcourir les modes d’autorisation.

Si vous êtes en mode Normal, **Maj+Tab** (ou **Tab** sous Windows) bascule d’abord en mode `auto-edits`, indiqué par `⏵⏵ accepter les modifications sur` en bas du terminal. Une nouvelle pression sur **Maj+Tab** (ou **Tab** sous Windows) active le mode Plan, indiqué par `⏸ mode Plan`.

**Démarrer une nouvelle session en mode Plan**

Pour démarrer une nouvelle session en mode Plan, utilisez la commande `/approval-mode`, puis sélectionnez `plan` :

```bash
/approval-mode
```

**Exécuter des requêtes « sans interface » en mode Plan**

Vous pouvez également exécuter directement une requête en mode Plan à l’aide de l’option `-p` ou du mot-clé `prompt` :

```bash
qwen --prompt "Qu’est-ce que l’apprentissage automatique ?"
```

### Exemple : Planifier un refactoring complexe

```bash
/approval-mode plan
```

```
Je dois refactoriser notre système d’authentification pour utiliser OAuth2. Créez un plan de migration détaillé.
```

Qwen Code analyse l’implémentation actuelle et génère un plan complet. Affinez-le avec des questions complémentaires :

```
Quelle est la stratégie de rétrocompatibilité ?
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

## 2. Utiliser le mode par défaut pour une interaction maîtrisée

Le mode par défaut est la méthode standard pour travailler avec Qwen Code. Dans ce mode, vous conservez un contrôle total sur toutes les opérations potentiellement risquées : Qwen Code vous demandera systématiquement votre approbation avant toute modification de fichier ou exécution de commande shell.

### Quand utiliser le mode par défaut

- **Nouveau dans une base de code** : Lorsque vous explorez un projet inconnu et que vous souhaitez faire preuve d’une prudence accrue  
- **Systèmes critiques** : Lorsque vous travaillez sur du code en production, sur l’infrastructure ou sur des données sensibles  
- **Apprentissage et enseignement** : Lorsque vous souhaitez comprendre chaque étape exécutée par Qwen Code  
- **Collaboration en équipe** : Lorsque plusieurs personnes travaillent sur la même base de code  
- **Opérations complexes** : Lorsque les modifications impliquent plusieurs fichiers ou une logique complexe

### Comment utiliser le mode par défaut

**Activer le mode par défaut pendant une session**

Vous pouvez basculer en mode par défaut pendant une session à l’aide de **Maj+Tab** (ou **Tab** sous Windows) pour parcourir les différents modes d’autorisation. Si vous êtes dans un autre mode, appuyer sur **Maj+Tab** (ou **Tab** sous Windows) permettra éventuellement de revenir au mode par défaut, indiqué par l’absence de tout indicateur de mode en bas du terminal.

**Démarrer une nouvelle session en mode par défaut**

Le mode par défaut est le mode initial au lancement de Qwen Code. Si vous avez changé de mode et souhaitez y revenir, utilisez la commande suivante :

```
/approval-mode default
```

**Exécuter des requêtes « sans interface » en mode par défaut**

Lors de l’exécution de commandes sans interface, le comportement par défaut correspond au mode par défaut. Vous pouvez également le spécifier explicitement avec :

```
qwen --prompt "Analyser ce code afin d’y détecter d’éventuels bogues"
```

### Exemple : Implémentation sécurisée d’une fonctionnalité

```
/approval-mode default
```

```
Je dois ajouter des photos de profil utilisateur à notre application. Ces photos doivent être stockées dans un bucket S3, et leurs URL doivent être enregistrées dans la base de données.
```

Qwen Code analysera votre base de code et proposera un plan. Il demandera ensuite votre approbation avant :

1. La création de nouveaux fichiers (contrôleurs, modèles, migrations) ;
2. La modification de fichiers existants (ajout de nouvelles colonnes, mise à jour des API) ;
3. L’exécution de commandes shell (migrations de base de données, installation de dépendances).

Vous pouvez examiner chaque modification proposée et l’approuver ou la rejeter individuellement.

### Configurer le mode par défaut comme mode par défaut

```bash
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "default"
  }
}
```

## 3. Mode édition automatique

Le mode édition automatique indique à Qwen Code d’approuver automatiquement les modifications de fichiers, tout en exigeant une approbation manuelle pour les commandes shell. Ce mode est idéal pour accélérer les flux de développement tout en préservant la sécurité du système.

### Quand utiliser le mode Éditions automatiquement acceptées

- **Développement quotidien** : Idéal pour la plupart des tâches de programmation  
- **Automatisation sécurisée** : Permet à l’IA de modifier le code tout en empêchant l’exécution accidentelle de commandes dangereuses  
- **Collaboration d’équipe** : À utiliser dans les projets partagés afin d’éviter tout impact involontaire sur les autres  

### Comment basculer dans ce mode

```

# Basculer via une commande
/approval-mode auto-edit

# Ou utiliser le raccourci clavier
Maj+Tab (ou Tab sous Windows) # Basculer depuis un autre mode
```

### Exemple de flux de travail

1. Vous demandez à Qwen Code de refactoriser une fonction  
2. L’IA analyse le code et propose des modifications  
3. Applique **automatiquement** toutes les modifications de fichiers, sans confirmation  
4. Si des tests doivent être exécutés, elle **demande une approbation** pour lancer `npm test`  

## 4. Mode YOLO – Automatisation complète

Le mode YOLO accorde à Qwen Code les permissions les plus élevées, approuvant automatiquement tous les appels d’outils, y compris les modifications de fichiers et les commandes shell.

### Quand utiliser le mode YOLO

- **Scripts automatisés** : Exécution de tâches automatisées prédéfinies  
- **Pipelines CI/CD** : Exécution automatisée dans des environnements contrôlés  
- **Projets personnels** : Itérations rapides dans des environnements entièrement fiables  
- **Traitement par lots** : Tâches nécessitant des chaînes de commandes multi-étapes  

> [!warning]  
>  
> **Utilisez le mode YOLO avec précaution** : L’IA peut exécuter n’importe quelle commande avec les autorisations de votre terminal. Assurez-vous que :  
>  
> 1. Vous faites confiance à la base de code actuelle  
> 2. Vous comprenez toutes les actions que l’IA va effectuer  
> 3. Les fichiers importants sont sauvegardés ou intégrés au contrôle de version  

### Comment activer le mode YOLO  

```  

# Activation temporaire (session en cours uniquement)  
/approval-mode yolo  

# Définition comme valeur par défaut du projet  
/approval-mode yolo --project  

# Définition comme valeur par défaut globale utilisateur  
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

```

# Tâche de refactorisation entièrement automatisée  
qwen --prompt « Exécuter la suite de tests, corriger tous les tests en échec, puis valider les modifications »

# Sans intervention humaine, l’IA effectuera :

# 1. L’exécution des commandes de test (approuvées automatiquement)

# 2. La correction des cas de test ayant échoué (modification automatique des fichiers)

# 3. L’exécution de la commande `git commit` (approuvée automatiquement)  
```

## Changement de mode et configuration

### Changement de mode via raccourci clavier

Pendant une session Qwen Code, utilisez **Maj+Tab** (ou **Tab** sous Windows) pour basculer rapidement entre les trois modes :

```
Mode par défaut → Mode édition automatique → Mode YOLO → Mode planification → Mode par défaut
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

### Recommandations concernant les modes d’utilisation

1. **Nouveau dans la base de code** : commencez par le **mode Plan** pour une exploration en toute sécurité  
2. **Tâches quotidiennes de développement** : utilisez le mode **Auto-accepter les modifications** (mode par défaut), efficace et sécurisé  
3. **Scripts automatisés** : utilisez le **mode YOLO** dans des environnements contrôlés pour une automatisation complète  
4. **Refactorisations complexes** : commencez par le **mode Plan** pour une planification détaillée, puis passez au mode approprié pour l’exécution