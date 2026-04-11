# Outil Exit Plan Mode (`exit_plan_mode`)

Ce document décrit l'outil `exit_plan_mode` pour Qwen Code.

## Description

Utilisez `exit_plan_mode` lorsque vous êtes en mode plan et que vous avez terminé de présenter votre plan d'implémentation. Cet outil invite l'utilisateur à approuver ou rejeter le plan et permet de passer du mode planification au mode implémentation.

Cet outil est spécifiquement conçu pour les tâches nécessitant de planifier les étapes d'implémentation avant d'écrire du code. Il ne doit PAS être utilisé pour des tâches de recherche ou de collecte d'informations.

### Arguments

`exit_plan_mode` prend un seul argument :

- `plan` (string, obligatoire) : Le plan d'implémentation que vous souhaitez présenter à l'utilisateur pour approbation. Il doit s'agir d'un plan concis, formaté en Markdown, décrivant les étapes d'implémentation.

## Comment utiliser `exit_plan_mode` avec Qwen Code

L'outil Exit Plan Mode fait partie du workflow de planification de Qwen Code. Lorsque vous êtes en mode plan (généralement après avoir exploré une base de code et conçu une approche d'implémentation), vous utilisez cet outil pour :

1. Présenter votre plan d'implémentation à l'utilisateur
2. Demander l'approbation pour passer à l'implémentation
3. Passer du mode plan au mode implémentation en fonction de la réponse de l'utilisateur

L'outil affichera votre plan à l'utilisateur et proposera les options suivantes :

- **Proceed Once** : Approuver le plan pour cette session uniquement
- **Proceed Always** : Approuver le plan et activer l'approbation automatique pour les futures opérations de modification
- **Cancel** : Rejeter le plan et rester en mode planification

Utilisation :

```
exit_plan_mode(plan="Your detailed implementation plan here...")
```

## Quand utiliser cet outil

Utilisez `exit_plan_mode` lorsque :

1. **Tâches d'implémentation** : Vous planifiez les étapes d'implémentation pour une tâche de développement
2. **Planification terminée** : Vous avez terminé l'exploration et la conception de votre approche d'implémentation
3. **Approbation utilisateur requise** : Vous avez besoin de la confirmation de l'utilisateur avant de procéder aux modifications de code
4. **Tâches d'écriture de code** : La tâche implique d'écrire, modifier ou refactoriser du code

### Exemples d'utilisation appropriée :

- "Help me implement user authentication" → À utiliser après avoir planifié l'implémentation du système d'authentification
- "Add a new API endpoint for user management" → À utiliser après avoir conçu la structure de l'endpoint
- "Refactor the database layer to use TypeORM" → À utiliser après avoir planifié l'approche de refactoring

## Quand NE PAS utiliser cet outil

N'utilisez PAS `exit_plan_mode` pour :

1. **Tâches de recherche** : Tâches axées sur la compréhension ou l'exploration du code existant
2. **Collecte d'informations** : Lorsque vous recherchez, lisez ou analysez sans implémenter
3. **Tâches de documentation** : Lors de la création de documentation sans modification de code
4. **Tâches d'analyse** : Lors de la fourniture d'explications ou de revues sans implémentation

### Exemples d'utilisation inappropriée :

- "Search for and understand the implementation of vim mode in the codebase" → Ne pas utiliser (tâche de recherche)
- "Explain how the authentication system works" → Ne pas utiliser (tâche d'analyse)
- "Find all TODO comments in the project" → Ne pas utiliser (collecte d'informations)

## Exemples d'utilisation de `exit_plan_mode`

### Exemple de planification d'implémentation

```
exit_plan_mode(plan="## Implementation Plan for User Dashboard

### 1. Create Dashboard Components
- Create `UserDashboard.tsx` with main dashboard layout
- Add `DashboardStats.tsx` for displaying user statistics
- Implement `ActivityFeed.tsx` for recent user activities

### 2. Add API Integration
- Create `dashboardApi.ts` for dashboard data fetching
- Add endpoints for user stats and activity data
- Implement error handling and loading states

### 3. Update Routing
- Add dashboard route in `App.tsx`
- Update navigation component with dashboard link
- Add route protection for authenticated users

### 4. Testing and Documentation
- Write unit tests for dashboard components
- Add integration tests for API calls
- Update user documentation with dashboard features

This implementation will take approximately 4-6 hours and requires changes to 8-10 files.")
```

### Exemple de plan de refactoring

```
exit_plan_mode(plan="## Database Layer Refactoring Plan

### Phase 1: Setup and Configuration
- Install and configure TypeORM dependencies
- Create database connection configuration
- Set up entity definitions for existing models

### Phase 2: Migration
- Create migration scripts for existing data
- Implement new repository pattern using TypeORM
- Replace raw SQL queries with TypeORM query builder

### Phase 3: Testing and Validation
- Update all database tests to use TypeORM
- Validate data integrity after migration
- Performance testing to ensure no regressions

This refactoring will modernize our database layer while maintaining backward compatibility.")
```

## Gestion des réponses de l'utilisateur

Après avoir appelé `exit_plan_mode`, l'utilisateur peut répondre de plusieurs manières :

- **Proceed Once** : Le plan est approuvé pour une implémentation immédiate avec les paramètres de confirmation par défaut
- **Proceed Always** : Le plan est approuvé et l'approbation automatique est activée pour les opérations de modification suivantes
- **Cancel** : Le plan est rejeté et le système reste en mode plan pour une planification supplémentaire

L'outil ajuste automatiquement le mode d'approbation en fonction du choix de l'utilisateur, ce qui simplifie le processus d'implémentation selon les préférences de l'utilisateur.

## Notes importantes

- **Mode plan uniquement** : Cet outil ne doit être utilisé que lorsque vous êtes actuellement en mode plan
- **Focus sur l'implémentation** : À utiliser uniquement pour les tâches impliquant l'écriture ou la modification de code
- **Plans concis** : Gardez les plans ciblés et concis - privilégiez la clarté aux détails exhaustifs
- **Support Markdown** : Les plans prennent en charge le formatage Markdown pour une meilleure lisibilité
- **Utilisation unique** : L'outil doit être utilisé une seule fois par session de planification, lorsque vous êtes prêt à passer à l'action
- **Contrôle utilisateur** : La décision finale de procéder revient toujours à l'utilisateur

## Intégration au workflow de planification

L'outil Exit Plan Mode s'inscrit dans un workflow de planification plus large :

1. **Entrée en mode plan** : L'utilisateur en fait la demande ou le système détermine qu'une planification est nécessaire
2. **Phase d'exploration** : Analyser la base de code, comprendre les exigences, explorer les options
3. **Conception du plan** : Créer une stratégie d'implémentation basée sur l'exploration
4. **Présentation du plan** : Utiliser `exit_plan_mode` pour présenter le plan à l'utilisateur
5. **Phase d'implémentation** : Après approbation, procéder à l'implémentation planifiée

Ce workflow garantit des approches d'implémentation réfléchies et donne aux utilisateurs le contrôle sur les modifications de code importantes.