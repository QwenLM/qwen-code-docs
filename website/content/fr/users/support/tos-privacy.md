# Qwen Code : Conditions d'utilisation et politique de confidentialité

Qwen Code est un assistant de codage IA open source maintenu par l'équipe Qwen Code. Ce document présente les conditions d'utilisation et les politiques de confidentialité applicables lors de l'utilisation des méthodes d'authentification et des services de modèles IA de Qwen Code.

## Comment déterminer votre méthode d'authentification

Qwen Code prend en charge trois méthodes d'authentification pour accéder aux modèles IA. Votre méthode d'authentification détermine les conditions d'utilisation et les politiques de confidentialité applicables à votre utilisation :

1. **Qwen OAuth** — Connectez-vous avec votre compte qwen.ai (l'offre gratuite sera interrompue le 2026-04-15)
2. **Alibaba Cloud Coding Plan** — Utilisez une clé API d'Alibaba Cloud
3. **API Key** — Utilisez votre propre clé API

Pour chaque méthode d'authentification, des conditions d'utilisation et des politiques de confidentialité différentes peuvent s'appliquer en fonction du fournisseur de services sous-jacent.

| Méthode d'authentification     | Fournisseur          | Conditions d'utilisation                                                   | Politique de confidentialité                                                     |
| :------------------------ | :---------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Conditions d'utilisation de Qwen](https://qwen.ai/termsservice)              | [Politique de confidentialité de Qwen](https://qwen.ai/privacypolicy)               |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | Voir les [détails ci-dessous](#2-if-you-are-using-alibaba-cloud-coding-plan) | Voir les [détails ci-dessous](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                   | Divers fournisseurs | Dépend du fournisseur d'API choisi (OpenAI, Anthropic, etc.)      | Dépend du fournisseur d'API choisi                                |

## 1. Si vous utilisez l'authentification Qwen OAuth

Lorsque vous vous authentifiez avec votre compte qwen.ai, les documents suivants s'appliquent :

- **Conditions d'utilisation :** Votre utilisation est régie par les [Conditions d'utilisation de Qwen](https://qwen.ai/termsservice).
- **Politique de confidentialité :** La collecte et l'utilisation de vos données sont décrites dans la [Politique de confidentialité de Qwen](https://qwen.ai/privacypolicy).

Pour plus de détails sur la configuration de l'authentification, les quotas et les fonctionnalités prises en charge, consultez la section [Configuration de l'authentification](../configuration/settings).

## 2. Si vous utilisez Alibaba Cloud Coding Plan

Lorsque vous vous authentifiez avec une clé API d'Alibaba Cloud, les conditions d'utilisation et la politique de confidentialité applicables d'Alibaba Cloud s'appliquent.

Alibaba Cloud Coding Plan est disponible dans deux régions :

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Lorsque vous utilisez Alibaba Cloud Coding Plan, vous êtes soumis aux conditions et aux politiques de confidentialité d'Alibaba Cloud. Veuillez consulter leur documentation pour obtenir des détails spécifiques sur l'utilisation des données, leur conservation et leurs pratiques en matière de confidentialité.

## 3. Si vous utilisez votre propre clé API

Lorsque vous vous authentifiez avec des clés API d'autres fournisseurs, les conditions d'utilisation et la politique de confidentialité applicables dépendent du fournisseur que vous avez choisi.

> [!important]
>
> Lorsque vous utilisez votre propre clé API, vous êtes soumis aux conditions et aux politiques de confidentialité de votre fournisseur d'API, et non aux conditions de Qwen Code. Veuillez consulter la documentation de votre fournisseur pour obtenir des détails spécifiques sur l'utilisation des données, leur conservation et leurs pratiques en matière de confidentialité.

Qwen Code prend en charge divers fournisseurs compatibles OpenAI. Veuillez vous référer aux conditions d'utilisation et à la politique de confidentialité de votre fournisseur spécifique pour plus d'informations.

## Statistiques d'utilisation et télémétrie

Qwen Code peut collecter des statistiques d'utilisation anonymes et des données de [télémétrie](../../developers/development/telemetry) afin d'améliorer l'expérience utilisateur et la qualité du produit. Cette collecte de données est facultative et peut être contrôlée via les paramètres de configuration.

### Quelles données sont collectées

Lorsqu'elle est activée, Qwen Code peut collecter :

- Des statistiques d'utilisation anonymes (commandes exécutées, métriques de performance)
- Des rapports d'erreurs et des données de plantage
- Des modèles d'utilisation des fonctionnalités

### Collecte de données par méthode d'authentification

- **Qwen OAuth :** Les statistiques d'utilisation sont régies par la politique de confidentialité de Qwen. Vous pouvez les désactiver via les paramètres de configuration de Qwen Code.
- **Alibaba Cloud Coding Plan :** Les statistiques d'utilisation sont régies par la politique de confidentialité d'Alibaba Cloud. Vous pouvez les désactiver via les paramètres de configuration de Qwen Code.
- **API Key :** Aucune donnée supplémentaire n'est collectée par Qwen Code au-delà de ce que votre fournisseur d'API choisi collecte.

## Questions fréquentes (FAQ)

### 1. Mon code, y compris les prompts et les réponses, est-il utilisé pour entraîner des modèles IA ?

L'utilisation de votre code, y compris les prompts et les réponses, pour l'entraînement de modèles IA dépend de votre méthode d'authentification et du fournisseur de services IA spécifique que vous utilisez :

- **Qwen OAuth** : L'utilisation des données est régie par la [Politique de confidentialité de Qwen](https://qwen.ai/privacy). Veuillez consulter leur politique pour obtenir des détails spécifiques sur les pratiques de collecte de données et d'entraînement des modèles.

- **Alibaba Cloud Coding Plan** : L'utilisation des données est régie par la politique de confidentialité d'Alibaba Cloud. Veuillez consulter leur politique pour obtenir des détails spécifiques sur les pratiques de collecte de données et d'entraînement des modèles.

- **API Key** : L'utilisation des données dépend entièrement du fournisseur d'API que vous avez choisi. Chaque fournisseur dispose de ses propres politiques d'utilisation des données. Veuillez consulter la politique de confidentialité et les conditions d'utilisation de votre fournisseur spécifique.

**Important** : Qwen Code lui-même n'utilise pas vos prompts, votre code ou vos réponses pour l'entraînement des modèles. Toute utilisation de données à des fins d'entraînement serait régie par les politiques du fournisseur de services IA avec lequel vous vous authentifiez.

### 2. Que sont les statistiques d'utilisation et que contrôle la désactivation ?

Le paramètre **Usage Statistics** contrôle la collecte facultative de données par Qwen Code afin d'améliorer l'expérience utilisateur et la qualité du produit.

Lorsqu'il est activé, Qwen Code peut collecter :

- De la télémétrie anonyme (commandes exécutées, métriques de performance, utilisation des fonctionnalités)
- Des rapports d'erreurs et des données de plantage
- Des modèles d'utilisation généraux

**Ce qui n'est PAS collecté par Qwen Code :**

- Le contenu de votre code
- Les prompts envoyés aux modèles IA
- Les réponses des modèles IA
- Les informations personnelles

Le paramètre Usage Statistics contrôle uniquement la collecte de données par Qwen Code lui-même. Il n'affecte pas les données que votre fournisseur de services IA choisi (Qwen, OpenAI, etc.) peut collecter conformément à ses propres politiques de confidentialité.

### 3. Comment passer d'une méthode d'authentification à une autre ?

Vous pouvez basculer à tout moment entre Qwen OAuth, Alibaba Cloud Coding Plan et votre propre clé API :

1. **Au démarrage** : Choisissez votre méthode d'authentification préférée lorsque vous y êtes invité
2. **Dans le CLI** : Utilisez la commande `/auth` pour reconfigurer votre méthode d'authentification
3. **Variables d'environnement** : Configurez des fichiers `.env` pour une authentification automatique par clé API

Pour des instructions détaillées, consultez la documentation sur la [Configuration de l'authentification](../configuration/settings#environment-variables-for-api-access).