# Fonctionnalité Welcome Back

La fonctionnalité Welcome Back vous aide à reprendre votre travail en toute transparence en détectant automatiquement lorsque vous revenez à un projet contenant un historique de conversation existant, et en vous proposant de continuer là où vous vous étiez arrêté.

## Aperçu

Lorsque vous démarrez Qwen Code dans un répertoire de projet contenant un résumé de projet généré précédemment (`.qwen/PROJECT_SUMMARY.md`), la boîte de dialogue Welcome Back s'affiche automatiquement, vous donnant la possibilité de repartir de zéro ou de continuer votre conversation précédente.

## Fonctionnement

### Détection automatique

La fonctionnalité Welcome Back détecte automatiquement :

- **Fichier de résumé du projet :** Recherche `.qwen/PROJECT_SUMMARY.md` dans le répertoire courant de votre projet
- **Historique de conversation :** Vérifie s'il existe un historique de conversation pertinent à reprendre
- **Paramètres :** Respecte votre paramètre `enableWelcomeBack` (activé par défaut)

### Boîte de dialogue de bienvenue

Lorsqu'un résumé de projet est trouvé, une boîte de dialogue s'affiche avec :

- **Dernière mise à jour :** Indique quand le résumé a été généré pour la dernière fois
- **Objectif global :** Affiche l'objectif principal de votre session précédente
- **Plan actuel :** Montre l'avancement des tâches avec des indicateurs d'état :
  - `[DONE]` - Tâches terminées
  - `[IN PROGRESS]` - En cours de traitement
  - `[TODO]` - Tâches planifiées
- **Statistiques des tâches :** Résumé du nombre total de tâches, terminées, en cours et en attente

### Options

Deux choix s'offrent à vous lorsque la boîte de dialogue de bienvenue apparaît :

1. **Démarrer une nouvelle session de chat**
   - Ferme la boîte de dialogue et commence une nouvelle conversation
   - Aucun contexte précédent n'est chargé

2. **Continuer la conversation précédente**
   - Remplit automatiquement l'entrée avec : `@.qwen/PROJECT_SUMMARY.md, Based on our previous conversation, Let's continue?`
   - Charge le résumé du projet comme contexte pour l'IA
   - Vous permet de reprendre là où vous vous étiez arrêté sans interruption

## Configuration

### Activer/Désactiver Welcome Back

Vous pouvez contrôler la fonction Welcome Back via les paramètres :

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

**Emplacements des fichiers de paramètres :**

- **Paramètres utilisateur :** `~/.qwen/settings.json` (affecte tous les projets)
- **Paramètres projet :** `.qwen/settings.json` (spécifique au projet)

### Raccourcis clavier

- **Échap :** Ferme la fenêtre Welcome Back (par défaut, démarre une nouvelle session de chat)

## Intégration avec d'autres fonctionnalités

### Génération du résumé de projet

La fonctionnalité Welcome Back fonctionne de manière transparente avec la commande `/chat summary` :

1. **Générer un résumé :** Utilisez `/chat summary` pour créer un résumé du projet
2. **Détection automatique :** La prochaine fois que vous démarrerez Qwen Code dans ce projet, Welcome Back détectera le résumé
3. **Reprendre le travail :** Choisissez de continuer et le résumé sera chargé comme contexte

### Confirmation de sortie

Lors de la sortie avec `/quit-confirm` et en choisissant "Generate summary and quit" :

1. Un résumé de projet est automatiquement créé
2. La session suivante déclenchera la boîte de dialogue Welcome Back
3. Vous pouvez reprendre votre travail de manière fluide

## Structure des fichiers

La fonctionnalité Welcome Back crée et utilise :

```
your-project/
├── .qwen/
│   └── PROJECT_SUMMARY.md    # Résumé de projet généré
```

### Format de PROJECT_SUMMARY.md

Le résumé généré suit cette structure :

```markdown

# Project Summary

## Overall Goal

<!-- Phrase concise décrivant l'objectif de haut niveau -->
```

## Connaissances clés

<!-- Faits essentiels, conventions et contraintes -->
<!-- Inclut : choix technologiques, décisions d'architecture, préférences utilisateur -->

## Actions récentes

<!-- Résumé des travaux significatifs récents et des résultats obtenus -->
<!-- Inclut : réalisations, découvertes, changements récents -->

## Plan actuel

<!-- La feuille de route actuelle et les prochaines étapes -->
<!-- Utilise des marqueurs de statut : [DONE], [IN PROGRESS], [TODO] -->

---

## Métadonnées du résumé

**Date de mise à jour** : 2025-01-10T15:30:00.000Z