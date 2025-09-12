# Fonction Welcome Back

La fonction Welcome Back vous aide à reprendre votre travail de manière transparente en détectant automatiquement lorsque vous revenez à un projet avec un historique de conversation existant et en vous proposant de continuer là où vous vous étiez arrêté.

## Aperçu

Lorsque vous démarrez Qwen Code dans un répertoire de projet contenant un résumé de projet généré précédemment (`.qwen/PROJECT_SUMMARY.md`), la boîte de dialogue Welcome Back apparaîtra automatiquement, vous donnant la possibilité de recommencer depuis zéro ou de continuer votre conversation précédente.

## Fonctionnement

### Détection automatique

La fonction Welcome Back détecte automatiquement :

- **Fichier de résumé de projet :** Recherche `.qwen/PROJECT_SUMMARY.md` dans votre répertoire de projet actuel
- **Historique de conversation :** Vérifie s'il existe un historique de conversation significatif à reprendre
- **Paramètres :** Respecte votre paramètre `enableWelcomeBack` (activé par défaut)

### Welcome Back Dialog

Lorsqu'un résumé de projet est trouvé, vous verrez une boîte de dialogue avec :

- **Last Updated Time :** Indique quand le résumé a été généré pour la dernière fois
- **Overall Goal :** Affiche l'objectif principal de votre session précédente
- **Current Plan :** Montre l'avancement des tâches avec des indicateurs de statut :
  - `[DONE]` - Tâches terminées
  - `[IN PROGRESS]` - En cours de traitement
  - `[TODO]` - Tâches planifiées
- **Task Statistics :** Résumé du nombre total de tâches, terminées, en cours et en attente

### Options

Vous avez deux choix lorsque la boîte de dialogue Welcome Back s'affiche :

1. **Start new chat session**
   - Ferme la boîte de dialogue et commence une nouvelle conversation
   - Aucun contexte précédent n'est chargé

2. **Continue previous conversation**
   - Remplit automatiquement l'entrée avec : `@.qwen/PROJECT_SUMMARY.md, Based on our previous conversation, Let's continue?`
   - Charge le résumé du projet comme contexte pour l'IA
   - Vous permet de reprendre là où vous vous étiez arrêté de manière transparente

## Configuration

### Activer/Désactiver Welcome Back

Vous pouvez contrôler la fonctionnalité Welcome Back via les paramètres :

**Via la fenêtre de paramètres :**

1. Exécutez `/settings` dans Qwen Code
2. Recherchez "Enable Welcome Back" dans la catégorie UI
3. Activez/désactivez le paramètre

**Via le fichier de paramètres :**  
Ajoutez ceci à votre `.qwen/settings.json` :

```json
{
  "enableWelcomeBack": true
}
```

**Emplacements des paramètres :**

- **Paramètres utilisateur :** `~/.qwen/settings.json` (affecte tous les projets)
- **Paramètres projet :** `.qwen/settings.json` (spécifique au projet)

### Raccourcis clavier

- **Échap :** Fermer la fenêtre Welcome Back (revient par défaut à "Start new chat session")

## Intégration avec d'autres fonctionnalités

### Génération du résumé de projet

La fonctionnalité Welcome Back fonctionne de manière transparente avec la commande `/chat summary` :

1. **Générer un résumé :** Utilisez `/chat summary` pour créer un résumé du projet
2. **Détection automatique :** La prochaine fois que vous démarrerez Qwen Code dans ce projet, Welcome Back détectera le résumé
3. **Reprendre le travail :** Choisissez de continuer et le résumé sera chargé comme contexte

### Confirmation de sortie

Lorsque vous quittez avec `/quit-confirm` et que vous choisissez "Generate summary and quit" :

1. Un résumé du projet est automatiquement créé
2. La session suivante déclenchera la boîte de dialogue Welcome Back
3. Vous pouvez reprendre votre travail de manière fluide

## Structure des fichiers

La fonctionnalité Welcome Back crée et utilise :

```
your-project/
├── .qwen/
│   └── PROJECT_SUMMARY.md    # Résumé du projet généré
```

### Format de PROJECT_SUMMARY.md

Le résumé généré suit cette structure :

```markdown

# Project Summary

## Overall Goal

<!-- Phrase concise décrivant l'objectif de haut niveau -->

## Connaissances clés

<!-- Faits essentiels, conventions et contraintes -->
<!-- Inclut : choix technologiques, décisions d'architecture, préférences utilisateur -->

## Actions récentes

<!-- Résumé des travaux significatifs récents et des résultats obtenus -->
<!-- Inclut : réalisations, découvertes, changements récents -->

## Plan actuel

<!-- La feuille de route de développement actuelle et les prochaines étapes -->
<!-- Utilise des marqueurs de statut : [DONE], [IN PROGRESS], [TODO] -->

---

## Métadonnées du résumé

**Date de mise à jour** : 2025-01-10T15:30:00.000Z