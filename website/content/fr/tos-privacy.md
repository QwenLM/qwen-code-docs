# Qwen Code : Conditions d'utilisation et Politique de confidentialité

Qwen Code est un outil d'assistant de codage IA open-source maintenu par l'équipe Qwen Code. Ce document décrit les conditions d'utilisation et les politiques de confidentialité qui s'appliquent lors de l'utilisation des méthodes d'authentification et des services de modèle IA de Qwen Code.

## Comment déterminer votre méthode d'authentification

Qwen Code prend en charge deux méthodes d'authentification principales pour accéder aux modèles AI. Votre méthode d'authentification détermine quelles conditions d'utilisation et politiques de confidentialité s'appliquent à votre utilisation :

1. **Qwen OAuth** - Connectez-vous avec votre compte qwen.ai
2. **API compatible OpenAI** - Utilisez des clés API de divers fournisseurs de modèles AI

Pour chaque méthode d'authentification, différentes Conditions d'Utilisation et Notes de Confidentialité peuvent s'appliquer selon le fournisseur de service sous-jacent.

| Méthode d'Authentification | Fournisseur       | Conditions d'Utilisation                                                          | Note de Confidentialité                              |
| :------------------------- | :---------------- | :-------------------------------------------------------------------------------- | :--------------------------------------------------- |
| Qwen OAuth                 | Qwen AI           | [Conditions d'Utilisation Qwen](https://qwen.ai/termsservice)                     | [Politique de Confidentialité Qwen](https://qwen.ai/privacypolicy) |
| API compatible OpenAI      | Divers Fournisseurs | Dépend de votre fournisseur API choisi (OpenAI, Alibaba Cloud, ModelScope, etc.) | Dépend de votre fournisseur API choisi               |

## 1. Si vous utilisez l'authentification OAuth de Qwen

Lorsque vous vous authentifiez avec votre compte qwen.ai, ces documents de Conditions d'utilisation et de Politique de confidentialité s'appliquent :

- **Conditions d'utilisation :** Votre utilisation est régie par les [Conditions d'utilisation de Qwen](https://qwen.ai/termsservice).
- **Politique de confidentialité :** La collecte et l'utilisation de vos données sont décrites dans la [Politique de confidentialité de Qwen](https://qwen.ai/privacypolicy).

Pour plus de détails sur la configuration de l'authentification, les quotas et les fonctionnalités supportées, consultez [Configuration de l'authentification](./cli/authentication.md).

## 2. Si vous utilisez l'authentification API compatible OpenAI

Lorsque vous vous authentifiez à l'aide de clés API provenant de fournisseurs compatibles OpenAI, les Conditions d'utilisation et la Politique de confidentialité applicables dépendent de votre fournisseur choisi.

**Important :** Lors de l'utilisation de l'authentification API compatible OpenAI, vous êtes soumis aux conditions générales et aux politiques de confidentialité de votre fournisseur API choisi, et non aux conditions de Qwen Code. Veuillez consulter la documentation de votre fournisseur pour obtenir des détails spécifiques sur l'utilisation des données, leur conservation et les pratiques de confidentialité.

Qwen Code prend en charge divers fournisseurs compatibles OpenAI. Veuillez vous référer aux conditions d'utilisation et à la politique de confidentialité de votre fournisseur spécifique pour obtenir des informations détaillées.

## Statistiques d'utilisation et télémétrie

Qwen Code peut collecter des statistiques d'utilisation anonymes et des données de télémétrie afin d'améliorer l'expérience utilisateur et la qualité du produit. Cette collecte de données est facultative et peut être contrôlée via les paramètres de configuration.

### Quelles données sont collectées

Lorsque cette fonctionnalité est activée, Qwen Code peut collecter :

- Des statistiques d'utilisation anonymes (commandes exécutées, métriques de performance)
- Des rapports d'erreurs et données de crash
- Des schémas d'utilisation des fonctionnalés

### Collecte de données par méthode d'authentification

- **Qwen OAuth :** Les statistiques d'utilisation sont régies par la politique de confidentialité de Qwen. Vous pouvez désactiver cette collecte via les paramètres de configuration de Qwen Code.
- **API compatible OpenAI :** Qwen Code ne collecte aucune donnée supplémentaire au-delà de ce que votre fournisseur d'API choisi collecte.

### Instructions pour se désinscrire

Vous pouvez désactiver la collecte des statistiques d'utilisation en suivant les instructions dans la documentation [Configuration des statistiques d'utilisation](./cli/configuration.md#usage-statistics).

## Foire aux questions (FAQ)

### 1. Mon code, y compris les prompts et les réponses, est-il utilisé pour entraîner des modèles d'IA ?

L'utilisation de votre code, y compris les prompts et les réponses, pour entraîner des modèles d'IA dépend de votre méthode d'authentification et du fournisseur de service d'IA que vous utilisez :

- **Qwen OAuth** : L'utilisation des données est régie par la [Politique de confidentialité de Qwen](https://qwen.ai/privacy). Veuillez consulter leur politique pour obtenir des détails spécifiques sur la collecte de données et les pratiques d'entraînement des modèles.

- **API compatible OpenAI** : L'utilisation des données dépend entièrement du fournisseur d'API que vous avez choisi. Chaque fournisseur a ses propres politiques d'utilisation des données. Veuillez consulter la politique de confidentialité et les conditions d'utilisation de votre fournisseur spécifique.

**Important** : Qwen Code lui-même n'utilise pas vos prompts, votre code ou vos réponses pour l'entraînement des modèles. Toute utilisation de données à des fins d'entraînement serait régie par les politiques du fournisseur de service d'IA avec lequel vous vous authentifiez.

### 2. Que sont les statistiques d'utilisation et à quoi sert le contrôle d'opt-out ?

Le paramètre **Usage Statistics** contrôle la collecte de données optionnelle par Qwen Code afin d'améliorer l'expérience utilisateur et la qualité du produit.

Lorsqu'il est activé, Qwen Code peut collecter :

- Des données de télémétrie anonymes (commandes exécutées, métriques de performance, utilisation des fonctionnalités)
- Des rapports d'erreurs et des données de crash
- Des schémas d'utilisation généraux

**Ce qui N'EST PAS collecté par Qwen Code :**

- Le contenu de votre code
- Les prompts envoyés aux modèles AI
- Les réponses des modèles AI
- Les informations personnelles

Le paramètre Usage Statistics contrôle uniquement la collecte de données par Qwen Code lui-même. Il n'affecte pas les données que votre fournisseur de service AI choisi (Qwen, OpenAI, etc.) peut collecter selon ses propres politiques de confidentialité.

Vous pouvez désactiver la collecte des statistiques d'utilisation en suivant les instructions dans la documentation [Configuration des statistiques d'utilisation](./cli/configuration.md#usage-statistics).

### 3. Comment basculer entre les méthodes d'authentification ?

Vous pouvez passer de l'authentification Qwen OAuth à l'authentification compatible OpenAI API à tout moment :

1. **Au démarrage** : Choisissez votre méthode d'authentification préférée lorsque vous y êtes invité
2. **Dans le CLI** : Utilisez la commande `/auth` pour reconfigurer votre méthode d'authentification
3. **Variables d'environnement** : Configurez des fichiers `.env` pour une authentification automatique compatible OpenAI API

Pour des instructions détaillées, consultez la documentation [Configuration de l'authentification](./cli/authentication.md).