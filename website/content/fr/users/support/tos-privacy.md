# Qwen Code : Conditions d'utilisation et Politique de confidentialité

Qwen Code est un outil d'assistance IA open-source pour le codage, maintenu par l'équipe Qwen Code. Ce document décrit les conditions d'utilisation et les politiques de confidentialité applicables lors de l'utilisation des méthodes d'authentification et des services de modèle IA de Qwen Code.

## Comment déterminer votre méthode d'authentification

Qwen Code prend en charge deux principales méthodes d'authentification pour accéder aux modèles IA. Votre méthode d'authentification détermine quelles conditions d'utilisation et politiques de confidentialité s'appliquent à votre utilisation :

1. **Qwen OAuth** - Connectez-vous avec votre compte qwen.ai
2. **API compatible OpenAI** - Utilisez des clés API de divers fournisseurs de modèles IA

Pour chaque méthode d'authentification, différentes Conditions d'Utilisation et Mentions de Confidentialité peuvent s'appliquer selon le fournisseur de service sous-jacent.

| Méthode d'Authentification | Fournisseur       | Conditions d'Utilisation                                                         | Mentions de Confidentialité                          |
| :------------------------- | :---------------- | :------------------------------------------------------------------------------- | :--------------------------------------------------- |
| Qwen OAuth                 | Qwen AI           | [Conditions d'Utilisation de Qwen](https://qwen.ai/termsservice)                 | [Politique de Confidentialité de Qwen](https://qwen.ai/privacypolicy) |
| API compatible OpenAI      | Divers Fournisseurs | Dépend de votre fournisseur API choisi (OpenAI, Alibaba Cloud, ModelScope, etc.) | Dépend de votre fournisseur API choisi               |

## 1. Si vous utilisez l'authentification OAuth de Qwen

Lorsque vous vous authentifiez à l'aide de votre compte qwen.ai, ces documents de Conditions d'utilisation et de Politique de confidentialité s'appliquent :

- **Conditions d'utilisation :** Votre utilisation est régie par les [Conditions d'utilisation de Qwen](https://qwen.ai/termsservice).
- **Politique de confidentialité :** La collecte et l'utilisation de vos données sont décrites dans la [Politique de confidentialité de Qwen](https://qwen.ai/privacypolicy).

Pour plus de détails sur la configuration de l'authentification, les quotas et les fonctionnalités prises en charge, consultez [Configuration de l'authentification](../users/configuration/settings).

## 2. Si vous utilisez l'authentification compatible avec l'API OpenAI

Lorsque vous vous authentifiez à l'aide de clés API provenant de fournisseurs compatibles avec OpenAI, les Conditions d'utilisation et la Politique de confidentialité applicables dépendent du fournisseur que vous avez choisi.

> [!important]
>
> Lors de l'utilisation de l'authentification API compatible avec OpenAI, vous êtes soumis aux conditions générales et aux politiques de confidentialité de votre fournisseur API choisi, et non aux conditions de Qwen Code. Veuillez consulter la documentation de votre fournisseur pour obtenir des détails spécifiques sur l'utilisation des données, leur conservation et les pratiques en matière de confidentialité.

Qwen Code prend en charge divers fournisseurs compatibles avec OpenAI. Veuillez vous référer aux conditions d'utilisation et à la politique de confidentialité de votre fournisseur spécifique pour obtenir des informations détaillées.

## Statistiques d'utilisation et télémétrie

Qwen Code peut collecter des statistiques d'utilisation anonymes et des données de [télémétrie](/developers/development/telemetry) afin d'améliorer l'expérience utilisateur et la qualité du produit. Cette collecte de données est facultative et peut être contrôlée via les paramètres de configuration.

### Quelles données sont collectées

Lorsqu'elle est activée, Qwen Code peut collecter :

- Des statistiques d'utilisation anonymes (commandes exécutées, métriques de performance)
- Des rapports d'erreurs et données de plantage
- Des modèles d'utilisation des fonctionnalités

### Collecte de données par méthode d'authentification

- **Qwen OAuth :** Les statistiques d'utilisation sont régies par la politique de confidentialité de Qwen. Vous pouvez vous désinscrire via les paramètres de configuration de Qwen Code.
- **API compatible OpenAI :** Qwen Code ne collecte aucune donnée supplémentaire au-delà de ce que collecte votre fournisseur d'API choisi.

### 1. Mon code, y compris les invites et les réponses, est-il utilisé pour entraîner des modèles d'IA ?

L'utilisation de votre code, y compris des invites et des réponses, pour l'entraînement des modèles d'IA dépend de votre méthode d'authentification ainsi que du fournisseur spécifique de services d'IA que vous utilisez :

- **Qwen OAuth** : L'utilisation des données est régie par la [Politique de confidentialité de Qwen](https://qwen.ai/privacy). Veuillez consulter leur politique pour obtenir des précisions sur les pratiques en matière de collecte de données et d'entraînement des modèles.

- **API compatible OpenAI** : L'utilisation des données dépend entièrement du fournisseur d'API choisi. Chaque fournisseur possède ses propres politiques concernant l'utilisation des données. Veuillez examiner la politique de confidentialité et les conditions d'utilisation spécifiques à votre fournisseur.

**Important** : Qwen Code n'utilise pas vos invites, votre code ou vos réponses pour l'entraînement des modèles. Toute utilisation des données à des fins d'entraînement serait soumise aux politiques du fournisseur de services d'IA avec lequel vous vous authentifiez.

### 2. Que sont les statistiques d'utilisation et à quoi sert le contrôle de désactivation ?

Le paramètre **Statistiques d'utilisation** contrôle la collecte de données facultative par Qwen Code afin d'améliorer l'expérience utilisateur et la qualité du produit.

Lorsqu'il est activé, Qwen Code peut collecter :

- Des données de télémétrie anonymes (commandes exécutées, métriques de performance, utilisation des fonctionnalités)
- Des rapports d'erreurs et des données de plantage
- Des modèles d'utilisation générale

**Ce qui N'EST PAS collecté par Qwen Code :**

- Le contenu de votre code
- Les invites envoyées aux modèles d'IA
- Les réponses des modèles d'IA
- Les informations personnelles

Le paramètre Statistiques d'utilisation contrôle uniquement la collecte de données par Qwen Code lui-même. Il n'affecte pas les données que votre fournisseur de services d'IA choisi (Qwen, OpenAI, etc.) peut collecter conformément à ses propres politiques de confidentialité.

### 3. Comment basculer entre les méthodes d'authentification ?

Vous pouvez passer de l'authentification Qwen OAuth à l'authentification compatible avec l'API OpenAI à tout moment :

1. **Au démarrage** : Choisissez votre méthode d'authentification préférée lorsque vous y êtes invité
2. **Dans la CLI** : Utilisez la commande `/auth` pour reconfigurer votre méthode d'authentification
3. **Variables d'environnement** : Configurez des fichiers `.env` pour une authentification automatique avec l'API compatible OpenAI

Pour des instructions détaillées, consultez la documentation sur [Configuration de l'authentification](../users/configuration/settings#environment-variables-for-api-access).