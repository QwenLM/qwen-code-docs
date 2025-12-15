# Outil de Sortie du Mode Plan (`exit_plan_mode`)

Ce document décrit l'outil `exit_plan_mode` pour Qwen Code.

## Description

Utilisez `exit_plan_mode` lorsque vous êtes en mode plan et que vous avez terminé de présenter votre plan d'implémentation. Cet outil invite l'utilisateur à approuver ou rejeter le plan et permet de passer du mode planification au mode implémentation.

L'outil est spécifiquement conçu pour les tâches qui nécessitent de planifier les étapes d'implémentation avant d'écrire du code. Il NE doit PAS être utilisé pour des tâches de recherche ou de collecte d'informations.

### Arguments

`exit_plan_mode` prend un seul argument :

- `plan` (chaîne de caractères, requis) : Le plan d'implémentation que vous souhaitez présenter à l'utilisateur pour approbation. Il doit s'agir d'un plan concis au format markdown décrivant les étapes d'implémentation.

## Comment utiliser `exit_plan_mode` avec Qwen Code

L'outil Exit Plan Mode fait partie du workflow de planification de Qwen Code. Lorsque vous êtes en mode plan (généralement après avoir exploré une base de code et conçu une approche d'implémentation), vous utilisez cet outil pour :

1. Présenter votre plan d'implémentation à l'utilisateur
2. Demander l'autorisation de procéder à l'implémentation
3. Passer du mode plan au mode implémentation en fonction de la réponse de l'utilisateur

L'outil demandera à l'utilisateur s'il accepte votre plan et lui proposera les options suivantes :

- **Proceed Once** : Approuver le plan pour cette session uniquement
- **Proceed Always** : Approuver le plan et activer l'approbation automatique pour les futures opérations d'édition
- **Cancel** : Rejeter le plan et rester en mode planification

Utilisation :

```
exit_plan_mode(plan="Votre plan d'implémentation détaillé ici...")
```

## Quand utiliser cet outil

Utilisez `exit_plan_mode` lorsque :

1. **Tâches d'implémentation** : Vous planifiez les étapes d'implémentation pour une tâche de codage
2. **Plan terminé** : Vous avez fini d'explorer et de concevoir votre approche d'implémentation
3. **Approbation utilisateur nécessaire** : Vous avez besoin de la confirmation de l'utilisateur avant de procéder aux modifications de code
4. **Tâches d'écriture de code** : La tâche implique d'écrire, modifier ou refactoriser du code

### Exemples d'utilisation appropriée :

- « Aidez-moi à implémenter l'authentification utilisateur » → À utiliser après avoir planifié l'implémentation du système d'authentification
- « Ajouter un nouveau point de terminaison API pour la gestion des utilisateurs » → À utiliser après avoir conçu la structure du point de terminaison
- « Refactoriser la couche base de données pour utiliser TypeORM » → À utiliser après avoir planifié l'approche de refactoring

## Quand NE PAS utiliser cet outil

N'utilisez PAS `exit_plan_mode` pour :

1. **Tâches de recherche** : Tâches axées sur la compréhension ou l'exploration du code existant
2. **Collecte d'informations** : Lorsque vous recherchez, lisez ou analysez sans implémenter
3. **Tâches de documentation** : Lorsque vous créez de la documentation sans modifications de code
4. **Tâches d'analyse** : Lorsque vous fournissez des explications ou des revues sans implémentation

### Exemples d'utilisation inappropriée :

- « Rechercher et comprendre l'implémentation du mode vim dans la base de code » → Ne pas utiliser (tâche de recherche)
- « Expliquer comment fonctionne le système d'authentification » → Ne pas utiliser (tâche d'analyse)
- « Trouver tous les commentaires TODO dans le projet » → Ne pas utiliser (collecte d'informations)

## Exemples de `exit_plan_mode`

### Exemple de planification d'implémentation

```
exit_plan_mode(plan="## Plan d'implémentation pour le tableau de bord utilisateur

### 1. Créer les composants du tableau de bord
- Créer `UserDashboard.tsx` avec la disposition principale du tableau de bord
- Ajouter `DashboardStats.tsx` pour afficher les statistiques utilisateur
- Implémenter `ActivityFeed.tsx` pour les activités récentes des utilisateurs

### 2. Ajouter l'intégration de l'API
- Créer `dashboardApi.ts` pour la récupération des données du tableau de bord
- Ajouter des points de terminaison pour les statistiques utilisateur et les données d'activité
- Implémenter la gestion des erreurs et les états de chargement

### 3. Mettre à jour le routage
- Ajouter une route de tableau de bord dans `App.tsx`
- Mettre à jour le composant de navigation avec un lien vers le tableau de bord
- Ajouter une protection de route pour les utilisateurs authentifiés

### 4. Tests et documentation
- Écrire des tests unitaires pour les composants du tableau de bord
- Ajouter des tests d'intégration pour les appels API
- Mettre à jour la documentation utilisateur avec les fonctionnalités du tableau de bord

Cette implémentation prendra environ 4 à 6 heures et nécessite des modifications dans 8 à 10 fichiers.")
```

### Exemple de plan de refactoring

```
exit_plan_mode(plan="## Plan de refactoring de la couche base de données

### Phase 1 : Configuration et Installation
- Installer et configurer les dépendances TypeORM
- Créer la configuration de connexion à la base de données
- Mettre en place les définitions d'entités pour les modèles existants

### Phase 2 : Migration
- Créer des scripts de migration pour les données existantes
- Implémenter le nouveau modèle de dépôt (repository pattern) en utilisant TypeORM
- Remplacer les requêtes SQL brutes par le constructeur de requêtes (query builder) de TypeORM

### Phase 3 : Tests et Validation
- Mettre à jour tous les tests de base de données pour utiliser TypeORM
- Valider l'intégrité des données après la migration
- Effectuer des tests de performance pour s'assurer qu'il n'y a pas de régression

Cette refonte modernisera notre couche de base de données tout en maintenant la compatibilité ascendante.")```

## Gestion des réponses utilisateur

Après avoir appelé `exit_plan_mode`, l'utilisateur peut répondre de plusieurs façons :

- **Procéder une fois** : Le plan est approuvé pour une mise en œuvre immédiate avec les paramètres de confirmation par défaut
- **Toujours procéder** : Le plan est approuvé et l'approbation automatique est activée pour les opérations d'édition suivantes
- **Annuler** : Le plan est rejeté, et le système reste en mode planification pour une planification supplémentaire

L'outil ajuste automatiquement le mode d'approbation en fonction du choix de l'utilisateur, rationalisant ainsi le processus de mise en œuvre selon les préférences de l'utilisateur.

## Notes importantes

- **Mode plan uniquement** : Cet outil ne doit être utilisé que lorsque vous êtes actuellement en mode plan
- **Focus sur l'implémentation** : À n'utiliser que pour les tâches impliquant l'écriture ou la modification de code
- **Plans concis** : Gardez les plans concentrés et concis - privilégiez la clarté plutôt qu'un détail exhaustif
- **Support du Markdown** : Les plans prennent en charge le formatage Markdown pour une meilleure lisibilité
- **Usage unique** : L'outil doit être utilisé une seule fois par session de planification lorsque vous êtes prêt à continuer
- **Contrôle utilisateur** : La décision finale de procéder reste toujours à l'utilisateur

## Intégration avec le flux de travail de planification

L'outil Exit Plan Mode fait partie d'un flux de travail de planification plus large :

1. **Entrer en mode Plan** : L'utilisateur demande ou le système détermine qu'une planification est nécessaire
2. **Phase d'exploration** : Analyser la base de code, comprendre les exigences, explorer les options
3. **Conception du plan** : Créer une stratégie d'implémentation basée sur l'exploration
4. **Présentation du plan** : Utiliser `exit_plan_mode` pour présenter le plan à l'utilisateur
5. **Phase d'implémentation** : Sur approbation, procéder à l'implémentation prévue

Ce flux de travail garantit des approches d'implémentation réfléchies et donne aux utilisateurs le contrôle sur les modifications de code importantes.