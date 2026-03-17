# Qwen Code : Conditions d’utilisation et avis de confidentialité

Qwen Code est un outil open source d’assistant à la programmation basé sur l’intelligence artificielle, maintenu par l’équipe Qwen Code. Ce document décrit les conditions d’utilisation et les politiques de confidentialité applicables lors de l’utilisation des méthodes d’authentification de Qwen Code et de ses services de modèles d’IA.

## Comment déterminer votre méthode d’authentification

Qwen Code prend en charge trois méthodes d’authentification pour accéder aux modèles d’intelligence artificielle. Votre méthode d’authentification détermine les conditions d’utilisation et les politiques de confidentialité applicables à votre usage :

1. **OAuth Qwen** — Connectez-vous avec votre compte qwen.ai (quota quotidien gratuit)  
2. **Plan Coding d’Alibaba Cloud** — Utilisez une clé API fournie par Alibaba Cloud  
3. **Clé API** — Fournissez votre propre clé API  

Pour chaque méthode d’authentification, des conditions d’utilisation et des avis de confidentialité différents peuvent s’appliquer, selon le fournisseur de service sous-jacent.

| Méthode d’authentification     | Fournisseur          | Conditions d’utilisation                                                   | Avis de confidentialité                                                     |
| :----------------------------- | :------------------- | :------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| OAuth Qwen                     | Qwen AI              | [Conditions d’utilisation de Qwen](https://qwen.ai/termsservice)           | [Politique de confidentialité de Qwen](https://qwen.ai/privacypolicy)       |
| Plan Coding d’Alibaba Cloud     | Alibaba Cloud        | Voir les [détails ci-dessous](#2-si-vous-utilisez-le-plan-coding-dalibaba-cloud) | Voir les [détails ci-dessous](#2-si-vous-utilisez-le-plan-coding-dalibaba-cloud) |
| Clé API                        | Divers fournisseurs  | Dépend du fournisseur de clé API choisi (OpenAI, Anthropic, etc.)         | Dépend du fournisseur de clé API choisi                                    |

## 1. Si vous utilisez l’authentification OAuth Qwen

Lorsque vous vous authentifiez à l’aide de votre compte qwen.ai, les documents suivants s’appliquent :

- **Conditions d’utilisation** : Votre utilisation est régie par les [Conditions d’utilisation de Qwen](https://qwen.ai/termsservice).
- **Avis de confidentialité** : La collecte et l’utilisation de vos données sont décrites dans la [Politique de confidentialité de Qwen](https://qwen.ai/privacypolicy).

Pour plus de détails sur la configuration de l’authentification, les quotas et les fonctionnalités prises en charge, consultez la section [Configuration de l’authentification](../configuration/settings).

## 2. Si vous utilisez le plan de codage Alibaba Cloud

Lorsque vous vous authentifiez à l’aide d’une clé API fournie par Alibaba Cloud, les Conditions d’utilisation et la Politique de confidentialité applicables d’Alibaba Cloud s’appliquent.

Le plan de codage Alibaba Cloud est disponible dans deux régions :

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)  
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Lorsque vous utilisez le plan de codage Alibaba Cloud, vous êtes soumis aux conditions d’utilisation et aux politiques de confidentialité d’Alibaba Cloud. Veuillez consulter leur documentation pour obtenir des détails spécifiques concernant l’utilisation des données, leur conservation et leurs pratiques en matière de confidentialité.

## 3. Si vous utilisez votre propre clé API

Lorsque vous vous authentifiez à l’aide de clés API provenant d’autres fournisseurs, les conditions d’utilisation et la politique de confidentialité applicables dépendent du fournisseur que vous avez choisi.

> [!important]
>
> Lorsque vous utilisez votre propre clé API, vous êtes soumis aux conditions d’utilisation et aux politiques de confidentialité de votre fournisseur API, et non aux conditions de Qwen Code. Veuillez consulter la documentation de votre fournisseur pour obtenir des informations détaillées sur l’utilisation des données, leur conservation et leurs pratiques en matière de confidentialité.

Qwen Code prend en charge plusieurs fournisseurs compatibles avec l’API OpenAI. Pour plus d’informations, veuillez consulter les conditions d’utilisation et la politique de confidentialité spécifiques à votre fournisseur.

## Statistiques d’utilisation et télémétrie

Qwen Code peut collecter des statistiques d’utilisation anonymes et des [données de télémétrie](../../developers/development/telemetry) afin d’améliorer l’expérience utilisateur et la qualité du produit. Cette collecte de données est facultative et peut être contrôlée via les paramètres de configuration.

### Quelles données sont collectées ?

Lorsqu’elle est activée, Qwen Code peut collecter les informations suivantes :

- Des statistiques d’utilisation anonymes (commandes exécutées, métriques de performance)  
- Des rapports d’erreurs et des données relatives aux plantages  
- Les modèles d’utilisation des fonctionnalités  

### Collecte de données selon la méthode d’authentification  

- **OAuth Qwen :** Les statistiques d’utilisation sont régies par la politique de confidentialité de Qwen. Vous pouvez vous désabonner via les paramètres de configuration de Qwen Code.  
- **Plan Alibaba Cloud Coding :** Les statistiques d’utilisation sont régies par la politique de confidentialité d’Alibaba Cloud. Vous pouvez vous désabonner via les paramètres de configuration de Qwen Code.  
- **Clé API :** Qwen Code ne collecte aucune donnée supplémentaire au-delà de celles collectées par le fournisseur d’API que vous avez choisi.  

## Questions fréquemment posées (FAQ)

### 1. Mon code, y compris les invites et les réponses, est-il utilisé pour entraîner des modèles d’IA ?

Le fait que votre code, y compris les invites et les réponses, soit utilisé pour entraîner des modèles d’IA dépend de votre méthode d’authentification et du fournisseur de service d’IA que vous utilisez :

- **Authentification OAuth Qwen** : L’utilisation des données est régie par la [Politique de confidentialité de Qwen](https://qwen.ai/privacy). Consultez cette politique pour obtenir des détails spécifiques sur la collecte de données et les pratiques d’entraînement des modèles.

- **Plan Coding d’Alibaba Cloud** : L’utilisation des données est régie par la politique de confidentialité d’Alibaba Cloud. Consultez cette politique pour obtenir des détails spécifiques sur la collecte de données et les pratiques d’entraînement des modèles.

- **Clé API** : L’utilisation des données dépend entièrement du fournisseur d’API que vous avez choisi. Chaque fournisseur applique sa propre politique d’utilisation des données. Veuillez consulter la politique de confidentialité et les conditions générales de votre fournisseur spécifique.

**Important** : Qwen Code n’utilise pas vos invites, votre code ni vos réponses à des fins d’entraînement de modèles. Toute utilisation de données à des fins d’entraînement relève exclusivement des politiques du fournisseur de service d’IA avec lequel vous vous authentifiez.

### 2. Quelles sont les statistiques d’utilisation et que contrôle l’option de désactivation ?

Le paramètre **Statistiques d’utilisation** active ou désactive la collecte facultative de données par Qwen Code afin d’améliorer l’expérience utilisateur et la qualité du produit.

Lorsqu’il est activé, Qwen Code peut collecter :

- Des données télémétriques anonymes (commandes exécutées, métriques de performance, utilisation des fonctionnalités) ;
- Des rapports d’erreurs et des données de plantage ;
- Des tendances générales d’utilisation.

**Ce que Qwen Code ne collecte PAS :**

- Le contenu de votre code ;
- Les invites envoyées aux modèles d’IA ;
- Les réponses fournies par les modèles d’IA ;
- Toute information personnelle.

Le paramètre Statistiques d’utilisation ne contrôle que la collecte de données effectuée directement par Qwen Code. Il n’a aucune incidence sur les données que votre fournisseur de service IA choisi (Qwen, OpenAI, etc.) peut éventuellement collecter, conformément à sa propre politique de confidentialité.

### 3. Comment basculer entre les méthodes d’authentification ?

Vous pouvez basculer à tout moment entre l’authentification OAuth Qwen, le plan Alibaba Cloud Coding et votre propre clé API :

1. **Au démarrage** : Sélectionnez la méthode d’authentification de votre choix lorsque vous y êtes invité.
2. **Dans l’interface CLI** : Utilisez la commande `/auth` pour reconfigurer votre méthode d’authentification.
3. **Variables d’environnement** : Configurez des fichiers `.env` pour une authentification automatique via la clé API.

Pour des instructions détaillées, consultez la documentation relative à la [configuration de l’authentification](../configuration/settings#environment-variables-for-api-access).