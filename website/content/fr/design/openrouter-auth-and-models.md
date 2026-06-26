# Conception de l'authentification OpenRouter et de la gestion des modèles

Ce document décrit l'intention de conception derrière le flux d'authentification OpenRouter et les changements de gestion des modèles qui l'accompagnent. Il se concentre délibérément sur les choix produits et architecturaux, et non sur l'historique de mise en œuvre.

## Objectifs

- Permettre aux utilisateurs de s'authentifier avec OpenRouter à la fois depuis la CLI et `/auth`.
- Réutiliser le chemin existant du fournisseur compatible OpenAI au lieu d'ajouter un nouveau type d'authentification pour OpenRouter.
- Rendre l'expérience de première utilisation utilisable sans demander aux utilisateurs de gérer des centaines de modèles immédiatement.
- Garder une voie claire vers une gestion plus riche des modèles via `/manage-models`.

## Authentification OpenRouter

OpenRouter est intégré en tant que fournisseur compatible OpenAI :

- type d'authentification : `AuthType.USE_OPENAI`
- paramètres du fournisseur : `modelProviders.openai`
- variable d'environnement de clé API : `OPENROUTER_API_KEY`
- URL de base : `https://openrouter.ai/api/v1`

Cela évite d'introduire un `AuthType` spécifique à OpenRouter alors que le chemin du fournisseur de modèle d'exécution est déjà compatible OpenAI. Cela maintient l'état d'authentification, la résolution des modèles, la sélection du fournisseur et le schéma des paramètres alignés avec l'abstraction existante du fournisseur.

Les flux destinés à l'utilisateur sont :

- `/auth` → OpenRouter pour le flux TUI interactif.
- Variables d'environnement pour l'automatisation ou la configuration directe de la clé API : `OPENROUTER_API_KEY` plus `OPENAI_BASE_URL=https://openrouter.ai/api/v1`.
- `~/.qwen/settings.json` pour une configuration scriptée qui nécessite des entrées explicites de fournisseur de modèle.

L'OAuth navigateur utilise le flux PKCE d'OpenRouter et écrit la clé API échangée dans les paramètres avant de rafraîchir l'authentification en tant que `AuthType.USE_OPENAI`.

## Gestion des modèles

OpenRouter expose un grand catalogue de modèles dynamique. Écrire chaque modèle découvert dans `modelProviders.openai` rendrait `/model` bruyant et transformerait un champ de paramètres à long terme en cache d'un catalogue distant.

La répartition clé de la conception est :

- **Catalogue** : l'ensemble complet des modèles découverts à partir d'une source telle qu'OpenRouter.
- **Ensemble activé** : l'ensemble plus restreint de modèles qui doivent apparaître dans `/model` et être persistés dans les paramètres utilisateur.

Pour le flux initial d'OpenRouter, l'authentification devrait se terminer avec un ensemble activé par défaut utile, plutôt que d'interrompre l'utilisateur avec un grand sélecteur. L'ensemble recommandé doit être petit, stable et orienté vers les modèles qui permettent aux utilisateurs d'essayer le produit avec succès, y compris les modèles gratuits lorsqu'ils sont disponibles.

`/model` reste un sélecteur de modèles rapide. Il ne doit pas devenir l'endroit où les utilisateurs parcourent et organisent un catalogue complet de fournisseurs.

## `/manage-models`

Une gestion plus riche des modèles relève d'un point d'entrée séparé `/manage-models`. Ce flux devrait permettre aux utilisateurs :

- parcourir les modèles découverts ;
- rechercher par identifiant, nom d'affichage, préfixe du fournisseur et balises dérivées telles que `free` ou `vision` ;
- voir quels modèles sont actuellement activés ;
- activer ou désactiver des modèles par lots.

La dimension source doit rester partie intégrante de cette conception. OpenRouter n'est que la première source de catalogue dynamique ; les sources futures telles que ModelScope et ModelStudio devraient s'inscrire dans le même schéma. La complexité de l'interface utilisateur peut être réduite, mais l'abstraction sous-jacente de la source doit rester disponible comme point d'extension.

## Limite actuelle

Ce changement devrait faire le minimum nécessaire pour rendre l'authentification OpenRouter et la configuration des modèles agréables :

- L'authentification OAuth ou par clé configure OpenRouter via le chemin existant du fournisseur compatible OpenAI.
- L'ensemble initial de modèles activés est organisé plutôt que de déverser le catalogue complet dans les paramètres.
- Le stockage complet du catalogue, la navigation, le filtrage et la gestion par lots sont reportés à `/manage-models`.

Le principe de conception est simple : l'authentification doit amener les utilisateurs à un état de fonctionnement rapidement, tandis que l'organisation des modèles doit vivre dans un flux de gestion dédié.
