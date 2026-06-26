# Conception de l'authentification OpenRouter et de la gestion des modèles

Ce document capture les intentions de conception derrière le flux d'authentification OpenRouter et les
changements de gestion des modèles qui l'accompagnent. Il se concentre délibérément sur les
choix produits et architecturaux, et non sur l'historique de l'implémentation.

## Objectifs

- Permettre aux utilisateurs de s'authentifier avec OpenRouter depuis la CLI et `/auth`.
- Réutiliser le chemin existant du fournisseur compatible OpenAI au lieu d'ajouter un nouveau type d'authentification
  pour OpenRouter.
- Rendre l'expérience de première utilisation fonctionnelle sans demander aux utilisateurs de gérer des centaines de
  modèles immédiatement.
- Garder une voie claire vers une gestion plus riche des modèles via `/manage-models`.

## Authentification OpenRouter

OpenRouter est intégré en tant que fournisseur compatible OpenAI :

- type d'authentification : `AuthType.USE_OPENAI`
- paramètres du fournisseur : `modelProviders.openai`
- variable d'environnement pour la clé API : `OPENROUTER_API_KEY`
- URL de base : `https://openrouter.ai/api/v1`

Cela évite d'introduire un `AuthType` spécifique à OpenRouter alors que le chemin
du fournisseur de modèles runtime est déjà compatible OpenAI. Cela maintient le statut d'authentification, la résolution
des modèles, la sélection du fournisseur et le schéma des paramètres alignés avec l'abstraction
existante du fournisseur.

Les flux visibles par l'utilisateur sont :

- `/auth` → OpenRouter pour le flux TUI interactif.
- Variables d'environnement pour l'automatisation ou la configuration directe de la clé API :
  `OPENROUTER_API_KEY` plus `OPENAI_BASE_URL=https://openrouter.ai/api/v1`.
- `~/.qwen/settings.json` pour une configuration scriptée nécessitant des entrées explicites pour les fournisseurs de modèles.

Le OAuth navigateur utilise le flux PKCE d'OpenRouter et écrit la clé API échangée dans
les paramètres avant de rafraîchir l'authentification en tant que `AuthType.USE_OPENAI`.

## Gestion des modèles

OpenRouter expose un vaste catalogue dynamique de modèles. Écrire chaque modèle découvert
dans `modelProviders.openai` rendrait `/model` bruyant et transformerait un champ de paramètres
à long terme en cache d'un catalogue distant.

La distinction clé dans la conception est :

- **Catalogue** : l'ensemble complet des modèles découverts depuis une source telle qu'OpenRouter.
- **Ensemble activé** : l'ensemble plus restreint de modèles qui doivent apparaître dans `/model` et
  être persistés dans les paramètres utilisateur.

Pour le flux initial OpenRouter, l'authentification doit aboutir à un ensemble activé par défaut utile
plutôt que d'interrompre l'utilisateur avec un sélecteur volumineux. L'ensemble recommandé
doit être petit, stable et orienté vers des modèles qui permettent aux utilisateurs d'essayer le produit
avec succès, y compris les modèles gratuits lorsqu'ils sont disponibles.

`/model` reste un sélecteur de modèle rapide. Il ne doit pas devenir l'endroit où les
utilisateurs parcourent et organisent un catalogue complet de fournisseur.

## `/manage-models`

Une gestion plus riche des modèles appartient à un point d'entrée `/manage-models` séparé. Ce
flux doit permettre aux utilisateurs de :

- parcourir les modèles découverts ;
- rechercher par identifiant, nom d'affichage, préfixe du fournisseur et balises dérivées telles que `free` ou
  `vision` ;
- voir quels modèles sont actuellement activés ;
- activer ou désactiver des modèles par lots.

La dimension source doit rester partie intégrante de cette conception. OpenRouter n'est que la
première source de catalogue dynamique ; les sources futures telles que ModelScope et ModelStudio
doivent s'adapter à la même forme. La complexité de l'interface utilisateur peut être réduite, mais l'abstraction
sous-jacente de la source doit rester disponible comme point d'extension.

## Périmètre actuel

Ce changement doit faire le minimum nécessaire pour rendre l'authentification OpenRouter et la configuration
des modèles agréables :

- L'authentification OAuth ou par clé configure OpenRouter via le chemin existant du
  fournisseur compatible OpenAI.
- L'ensemble de modèles activés initial est organisé plutôt que de déverser l'intégralité du catalogue
  dans les paramètres.
- Le stockage complet du catalogue, la navigation, le filtrage et la gestion par lots sont reportés à
  `/manage-models`.

Le principe de conception est simple : l'authentification doit amener les utilisateurs à un état
fonctionnel rapidement, tandis que la curation des modèles doit résider dans un flux de gestion dédié.