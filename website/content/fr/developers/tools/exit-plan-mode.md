# Outil de sortie du mode plan (`exit_plan_mode`)

Ce document décrit l’outil `exit_plan_mode` pour Qwen Code.

## Description

Utilisez `exit_plan_mode` lorsque vous êtes en mode plan et que vous avez terminé la présentation de votre plan d’implémentation. Cet outil demande à l’utilisateur d’approuver ou de rejeter le plan, puis passe du mode plan au mode implémentation.

Cet outil est spécifiquement conçu pour les tâches nécessitant une planification préalable des étapes d’implémentation avant l’écriture du code. Il NE DOIT PAS être utilisé pour des tâches de recherche ou de collecte d’informations.

### Arguments

`exit_plan_mode` prend un seul argument :

- `plan` (chaîne de caractères, requis) : Le plan d’implémentation que vous souhaitez présenter à l’utilisateur pour approbation. Ce plan doit être concis et formaté en Markdown, et décrire les étapes d’implémentation.

## Comment utiliser `exit_plan_mode` avec Qwen Code

L’outil « Exit Plan Mode » fait partie du flux de travail de planification de Qwen Code. Lorsque vous êtes en mode plan (généralement après avoir exploré une base de code et conçu une approche d’implémentation), vous utilisez cet outil pour :

1. Présenter votre plan d’implémentation à l’utilisateur ;
2. Demander son accord pour passer à l’implémentation ;
3. Passer du mode plan au mode implémentation, en fonction de la réponse de l’utilisateur.

Cet outil affiche le plan à l’utilisateur et lui propose les options suivantes :

- **Procéder une fois** : valider le plan uniquement pour cette session ;
- **Procéder systématiquement** : valider le plan et activer l’approbation automatique pour les futures opérations de modification ;
- **Annuler** : rejeter le plan et rester en mode planification.

Utilisation :

```
exit_plan_mode(plan="Votre plan d’implémentation détaillé ici...")
```

## Quand utiliser cet outil

Utilisez `exit_plan_mode` dans les cas suivants :

1. **Tâches d’implémentation** : vous planifiez les étapes d’implémentation d’une tâche de développement
2. **Terminaison du plan** : vous avez terminé l’exploration et la conception de votre approche d’implémentation
3. **Validation utilisateur requise** : vous devez obtenir une confirmation de l’utilisateur avant de procéder aux modifications du code
4. **Tâches d’écriture de code** : la tâche implique l’écriture, la modification ou la refactorisation de code

### Exemples d’utilisation appropriée :

- « Aidez-moi à implémenter l’authentification des utilisateurs » → Utilisez cet outil après avoir planifié l’implémentation du système d’authentification  
- « Ajoutez un nouvel endpoint API pour la gestion des utilisateurs » → Utilisez cet outil après avoir conçu la structure de l’endpoint  
- « Refactorisez la couche base de données pour utiliser TypeORM » → Utilisez cet outil après avoir planifié l’approche de refactorisation

## Quand NE PAS utiliser cet outil

N’utilisez PAS `exit_plan_mode` dans les cas suivants :

1. **Tâches de recherche** : Tâches axées sur la compréhension ou l’exploration d’un code existant  
2. **Collecte d’informations** : Lorsque vous effectuez une recherche, une lecture ou une analyse sans implémentation  
3. **Tâches de documentation** : Lors de la rédaction de documentation sans modification de code  
4. **Tâches d’analyse** : Lorsque vous fournissez des explications ou des revues sans implémentation  

### Exemples d’utilisations inappropriées :

- « Rechercher et comprendre l’implémentation du mode vim dans la base de code » → À ne pas utiliser (tâche de recherche)  
- « Expliquer le fonctionnement du système d’authentification » → À ne pas utiliser (tâche d’analyse)  
- « Trouver tous les commentaires TODO dans le projet » → À ne pas utiliser (collecte d’informations)  

## Exemples de `exit_plan_mode`

### Exemple de planification d’implémentation

```
exit_plan_mode(plan="## Plan d’implémentation pour le tableau de bord utilisateur

### 1. Créer les composants du tableau de bord
- Créez `UserDashboard.tsx` avec la disposition principale du tableau de bord.
- Ajoutez `DashboardStats.tsx` pour afficher les statistiques utilisateur.
- Implémentez `ActivityFeed.tsx` pour afficher les activités récentes de l’utilisateur.

### 2. Intégrer l’API
- Créez `dashboardApi.ts` pour récupérer les données du tableau de bord.
- Ajoutez des points de terminaison pour les statistiques utilisateur et les données d’activité.
- Implémentez la gestion des erreurs et les états de chargement.

### 3. Mettre à jour le routage
- Ajoutez la route du tableau de bord dans `App.tsx`.
- Mettez à jour le composant de navigation avec un lien vers le tableau de bord.
- Ajoutez une protection de route pour les utilisateurs authentifiés.

### 4. Tests et documentation
- Écrivez des tests unitaires pour les composants du tableau de bord.
- Ajoutez des tests d’intégration pour les appels API.
- Mettez à jour la documentation utilisateur avec les fonctionnalités du tableau de bord.

Cette implémentation prendra environ 4 à 6 heures et nécessitera des modifications dans 8 à 10 fichiers.

```

### Exemple de plan de refactorisation

```
exit_plan_mode(plan="## Plan de refactorisation de la couche base de données

### Phase 1 : Installation et configuration
- Installer et configurer les dépendances de TypeORM  
- Créer la configuration de connexion à la base de données  
- Définir les entités correspondant aux modèles existants  

### Phase 2 : Migration  
- Créer des scripts de migration pour les données existantes  
- Implémenter le nouveau modèle de référentiel (repository) avec TypeORM  
- Remplacer les requêtes SQL brutes par le query builder de TypeORM  

### Phase 3 : Tests et validation  
- Mettre à jour l’ensemble des tests de base de données pour utiliser TypeORM  
- Valider l’intégrité des données après la migration  
- Effectuer des tests de performance afin de garantir l’absence de régressions  

Cette refonte modernisera notre couche d’accès aux données tout en préservant la compatibilité ascendante.

## Gestion des réponses de l’utilisateur

Après avoir appelé `exit_plan_mode`, l’utilisateur peut répondre de plusieurs façons :

- **Exécuter une fois** : Le plan est approuvé pour une mise en œuvre immédiate avec les paramètres de confirmation par défaut.  
- **Toujours exécuter** : Le plan est approuvé et l’approbation automatique est activée pour les opérations de modification ultérieures.  
- **Annuler** : Le plan est rejeté, et le système reste en mode planification pour une nouvelle élaboration.

L’outil ajuste automatiquement le mode d’approbation en fonction du choix de l’utilisateur, ce qui simplifie le processus de mise en œuvre selon ses préférences.

## Remarques importantes

- **Mode plan uniquement** : Cet outil ne doit être utilisé que lorsque vous êtes actuellement en mode plan.
- **Orientation implémentation** : N’utilisez-le que pour les tâches impliquant l’écriture ou la modification de code.
- **Plans concis** : Gardez les plans ciblés et concis — privilégiez la clarté plutôt qu’un détail exhaustif.
- **Prise en charge de Markdown** : Les plans prennent en charge la mise en forme Markdown pour une meilleure lisibilité.
- **Utilisation unique** : Cet outil doit être utilisé une seule fois par session de planification, lorsqu’il est temps de passer à l’action.
- **Contrôle utilisateur** : La décision finale de passer à l’étape suivante appartient toujours à l’utilisateur.

## Intégration au flux de travail de planification

L’outil Exit Plan Mode fait partie d’un flux de travail de planification plus vaste :

1. **Entrée en mode planification** : la demande émane de l’utilisateur ou le système détermine qu’une planification est nécessaire  
2. **Phase d’exploration** : analyse de la base de code, compréhension des exigences, étude des différentes options  
3. **Conception du plan** : élaboration d’une stratégie de mise en œuvre fondée sur l’exploration  
4. **Présentation du plan** : utilisation de `exit_plan_mode` pour présenter le plan à l’utilisateur  
5. **Phase de mise en œuvre** : après validation, exécution de la mise en œuvre prévue  

Ce flux de travail garantit une approche réfléchie de la mise en œuvre et donne aux utilisateurs le contrôle sur les modifications importantes apportées au code.