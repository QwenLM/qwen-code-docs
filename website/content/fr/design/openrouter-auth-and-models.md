# Conception de l'authentification OpenRouter et de la gestion des modèles

Ce document décrit les intentions de conception derrière le flux d'authentification OpenRouter et les
modifications apportées à la gestion des modèles. Il se concentre volontairement sur les choix produits et architecturaux, et non sur l'historique d'implémentation.

## Objectifs

- Permettre aux utilisateurs de s'authentifier avec OpenRouter depuis le CLI et `/auth`.
- Réutiliser le chemin de fournisseur compatible OpenAI existant au lieu d'ajouter un nouveau type d'authentification pour OpenRouter.
- Rendre l'expérience de première utilisation fonctionnelle sans demander aux utilisateurs de gérer des centaines de modèles immédiatement.
- Conserver une voie claire vers une gestion des modèles plus avancée via `/manage-models`.

## Authentification OpenRouter

OpenRouter est intégré en tant que fournisseur compatible OpenAI :

- type d'authentification : `AuthType.USE_OPENAI`
- paramètres du fournisseur : `modelProviders.openai`
- variable d'environnement de la clé API : `OPENROUTER_API_KEY`
- URL de base : `https://openrouter.ai/api/v1`

Cela évite d'introduire un `AuthType` spécifique à OpenRouter alors que le chemin du fournisseur de modèles au moment de l'exécution est déjà compatible OpenAI. Cela maintient l'alignement du statut d'authentification, de la résolution des modèles, de la sélection du fournisseur et du schéma de paramètres avec l'abstraction de fournisseur existante.

Les flux visibles par l'utilisateur sont les suivants :

- `qwen auth openrouter --key <key>` pour l'automatisation ou la configuration directe d'une clé API.
- `qwen auth openrouter` pour l'OAuth basé sur le navigateur.
- `/auth` → Clé API → OpenRouter pour le flux TUI.

L'OAuth navigateur utilise le flux PKCE d'OpenRouter et écrit la clé API échangée dans les paramètres avant d'actualiser l'authentification en tant que `AuthType.USE_OPENAI`.

## Gestion des modèles

OpenRouter expose un vaste catalogue de modèles dynamique. Écrire chaque modèle découvert dans `modelProviders.openai` polluerait `/model` et transformerait un champ de paramètres à long terme en un cache d'un catalogue distant.

La distinction conceptuelle clé est la suivante :

- **Catalogue** : l'ensemble complet des modèles découverts depuis une source telle qu'OpenRouter.
- **Ensemble activé** : le sous-ensemble de modèles qui doit apparaître dans `/model` et être persisté dans les paramètres utilisateur.

Pour le flux OpenRouter initial, l'authentification doit se terminer avec un ensemble activé par défaut utile, au lieu d'interrompre l'utilisateur avec un sélecteur volumineux. L'ensemble recommandé doit être petit, stable et privilégier les modèles permettant aux utilisateurs de tester le produit avec succès, y compris des modèles gratuits lorsqu'ils sont disponibles.

`/model` reste un sélecteur de modèles rapide. Il ne doit pas devenir le lieu où les utilisateurs parcourent et organisent un catalogue complet de fournisseurs.

## `/manage-models`

Une gestion des modèles plus avancée relève d'un point d'entrée distinct `/manage-models`. Ce flux doit permettre aux utilisateurs de :

- parcourir les modèles découverts ;
- rechercher par ID, nom d'affichage, préfixe de fournisseur et tags dérivés tels que `free` ou `vision` ;
- voir quels modèles sont actuellement activés ;
- activer ou désactiver des modèles par lots.

La dimension de la source doit rester intégrée à cette conception. OpenRouter n'est que la première source de catalogue dynamique ; les sources futures telles que ModelScope et ModelStudio devront s'inscrire dans la même structure. La complexité de l'interface peut être réduite, mais l'abstraction de source sous-jacente doit rester disponible comme point d'extension.

## Périmètre actuel

Cette modification doit faire le strict nécessaire pour rendre l'authentification OpenRouter et la configuration des modèles agréables :

- L'authentification OAuth ou par clé configure OpenRouter via le chemin de fournisseur compatible OpenAI existant.
- L'ensemble initial de modèles activés est sélectionné avec soin, au lieu d'importer l'intégralité du catalogue dans les paramètres.
- Le stockage, le parcours, le filtrage et la gestion par lots du catalogue complet sont reportés vers `/manage-models`.

Le principe de conception est simple : l'authentification doit amener rapidement les utilisateurs à un état fonctionnel, tandis que la curation des modèles doit résider dans un flux de gestion dédié.