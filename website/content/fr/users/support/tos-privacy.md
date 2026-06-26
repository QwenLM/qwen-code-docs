# Qwen Code : Conditions d'utilisation et avis de confidentialité

Qwen Code est un outil open-source d'assistant de codage IA maintenu par l'équipe Qwen Code. Ce document décrit les conditions d'utilisation et les politiques de confidentialité qui s'appliquent lorsque vous utilisez les méthodes d'authentification et les services de modèles IA de Qwen Code.

## Comment déterminer votre méthode d'authentification

Qwen Code prend en charge quatre méthodes d'authentification pour accéder aux modèles IA. Votre méthode d'authentification détermine quelles conditions d'utilisation et politiques de confidentialité s'appliquent à votre utilisation :

1. **Qwen OAuth** — Connectez-vous avec votre compte qwen.ai (offre gratuite interrompue le 15/04/2026)
2. **Alibaba Cloud Coding Plan** — Utilisez une clé API d'Alibaba Cloud
3. **Clé API** — Apportez votre propre clé API
4. **Vertex AI** — Utilisez Google Cloud Vertex AI

Pour chaque méthode d'authentification, différentes conditions d'utilisation et avis de confidentialité peuvent s'appliquer selon le fournisseur de service sous-jacent.

| Méthode d'authentification | Fournisseur      | Conditions d'utilisation                                           | Avis de confidentialité                                            |
| :-------------------------- | :--------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| Qwen OAuth                  | Qwen AI          | [Conditions d'utilisation Qwen](https://qwen.ai/termsservice)      | [Politique de confidentialité Qwen](https://qwen.ai/privacypolicy)  |
| Alibaba Cloud Coding Plan   | Alibaba Cloud    | Voir [détails ci-dessous](#2-si-vous-utilisez-alibaba-cloud-coding-plan) | Voir [détails ci-dessous](#2-si-vous-utilisez-alibaba-cloud-coding-plan) |
| Clé API                     | Divers fournisseurs | Dépend du fournisseur API choisi (OpenAI, Anthropic, etc.)         | Dépend du fournisseur API choisi                                   |
| Vertex AI                   | Google Cloud     | [Conditions Google Cloud](https://cloud.google.com/terms)          | [Confidentialité Google Cloud](https://cloud.google.com/privacy)   |

## 1. Si vous utilisez l'authentification Qwen OAuth

Lorsque vous vous authentifiez avec votre compte qwen.ai, ces conditions d'utilisation et cet avis de confidentialité s'appliquent :

- **Conditions d'utilisation :** Votre utilisation est régie par les [Conditions d'utilisation Qwen](https://qwen.ai/termsservice).
- **Avis de confidentialité :** La collecte et l'utilisation de vos données sont décrites dans la [Politique de confidentialité Qwen](https://qwen.ai/privacypolicy).

Pour plus de détails sur la configuration de l'authentification, les quotas et les fonctionnalités prises en charge, consultez [Configuration de l'authentification](../configuration/settings).

## 2. Si vous utilisez Alibaba Cloud Coding Plan

Lorsque vous vous authentifiez avec une clé API d'Alibaba Cloud, les conditions d'utilisation et l'avis de confidentialité applicables d'Alibaba Cloud s'appliquent.

Alibaba Cloud Coding Plan est disponible dans deux régions :

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Lorsque vous utilisez Alibaba Cloud Coding Plan, vous êtes soumis aux conditions et politiques de confidentialité d'Alibaba Cloud. Veuillez consulter leur documentation pour obtenir des détails spécifiques sur l'utilisation des données, la conservation et les pratiques de confidentialité.

## 3. Si vous utilisez votre propre clé API

Lorsque vous vous authentifiez avec des clés API provenant d'autres fournisseurs, les conditions d'utilisation et l'avis de confidentialité applicables dépendent du fournisseur que vous avez choisi.

> [!important]
>
> Lorsque vous utilisez votre propre clé API, vous êtes soumis aux conditions et politiques de confidentialité du fournisseur API que vous avez choisi, et non à celles de Qwen Code. Veuillez consulter la documentation de votre fournisseur pour obtenir des détails spécifiques sur l'utilisation des données, la conservation et les pratiques de confidentialité.

Qwen Code prend en charge divers fournisseurs compatibles OpenAI. Veuillez vous référer aux conditions d'utilisation et à la politique de confidentialité de votre fournisseur spécifique pour des informations détaillées.

## 4. Si vous utilisez Vertex AI

Lorsque vous vous authentifiez avec Google Cloud Vertex AI, les conditions d'utilisation et l'avis de confidentialité applicables sont ceux de Google Cloud.

> [!important]
>
> Lorsque vous utilisez Vertex AI, vous êtes soumis aux [Conditions d'utilisation de Google Cloud](https://cloud.google.com/terms) et à l'[Avis de confidentialité de Google Cloud](https://cloud.google.com/privacy), et non aux conditions de Qwen Code. Veuillez consulter la documentation de Google Cloud pour obtenir des détails spécifiques sur l'utilisation des données, la conservation et les pratiques de confidentialité.

## Statistiques d'utilisation et télémétrie

Qwen Code peut collecter des statistiques d'utilisation anonymes et des données de [télémétrie](../../developers/development/telemetry) pour améliorer l'expérience utilisateur et la qualité du produit. Cette collecte de données est facultative et peut être contrôlée via les paramètres de configuration.

### Quelles données sont collectées

Lorsqu'elle est activée, Qwen Code peut collecter :

- Statistiques d'utilisation anonymes (commandes exécutées, métriques de performance)
- Rapports d'erreurs et données de plantage
- Modèles d'utilisation des fonctionnalités

### Collecte de données par méthode d'authentification

- **Qwen OAuth :** Les statistiques d'utilisation sont régies par la politique de confidentialité de Qwen. Vous pouvez vous désinscrire via les paramètres de configuration de Qwen Code.
- **Alibaba Cloud Coding Plan :** Les statistiques d'utilisation sont régies par la politique de confidentialité d'Alibaba Cloud. Vous pouvez vous désinscrire via les paramètres de configuration de Qwen Code.
- **Clé API :** Aucune donnée supplémentaire n'est collectée par Qwen Code en dehors de celles collectées par le fournisseur API que vous avez choisi.
- **Vertex AI :** Les statistiques d'utilisation sont régies par la politique de confidentialité de Google Cloud. Aucune donnée supplémentaire n'est collectée par Qwen Code en dehors de celles collectées par Google Cloud.

## Foire aux questions (FAQ)

### 1. Mon code, y compris les invites et les réponses, est-il utilisé pour entraîner des modèles IA ?

Que votre code, y compris les invites et les réponses, soit utilisé pour entraîner des modèles IA dépend de votre méthode d'authentification et du fournisseur de services IA spécifique que vous utilisez :

- **Qwen OAuth :** L'utilisation des données est régie par la [Politique de confidentialité de Qwen](https://qwen.ai/privacypolicy). Veuillez vous référer à leur politique pour des détails spécifiques sur la collecte des données et les pratiques d'entraînement des modèles.

- **Alibaba Cloud Coding Plan :** L'utilisation des données est régie par la politique de confidentialité d'Alibaba Cloud. Veuillez vous référer à leur politique pour des détails spécifiques sur la collecte des données et les pratiques d'entraînement des modèles.

- **Clé API :** L'utilisation des données dépend entièrement du fournisseur API que vous avez choisi. Chaque fournisseur a ses propres politiques d'utilisation des données. Veuillez consulter la politique de confidentialité et les conditions d'utilisation de votre fournisseur spécifique.

- **Vertex AI :** L'utilisation des données est régie par les [Conditions d'utilisation de Google Cloud](https://cloud.google.com/terms) et l'[Avis de confidentialité](https://cloud.google.com/privacy). Veuillez consulter les politiques de Google Cloud pour des détails spécifiques sur la collecte des données et les pratiques d'entraînement des modèles.

**Important :** Qwen Code lui-même n'utilise pas vos invites, votre code ou vos réponses pour l'entraînement des modèles. Toute utilisation des données à des fins d'entraînement serait régie par les politiques du fournisseur de services IA avec lequel vous vous authentifiez.

### 2. Que sont les statistiques d'utilisation et que contrôle le paramètre de désinscription ?

Le paramètre **Statistiques d'utilisation** contrôle la collecte facultative de données par Qwen Code pour améliorer l'expérience utilisateur et la qualité du produit.

Lorsqu'il est activé, Qwen Code peut collecter :

- Télémétrie anonyme (commandes exécutées, métriques de performance, utilisation des fonctionnalités)
- Rapports d'erreurs et données de plantage
- Modèles d'utilisation généraux

**Ce qui n'est PAS collecté par Qwen Code :**

- Le contenu de votre code
- Les invites envoyées aux modèles IA
- Les réponses des modèles IA
- Les informations personnelles

Le paramètre Statistiques d'utilisation contrôle uniquement la collecte de données par Qwen Code lui-même. Il n'affecte pas les données que le fournisseur de services IA que vous avez choisi (Qwen, OpenAI, etc.) peut collecter conformément à ses propres politiques de confidentialité.

### 3. Comment basculer entre les méthodes d'authentification ?

Vous pouvez basculer entre Qwen OAuth, Alibaba Cloud Coding Plan, votre propre clé API et Vertex AI à tout moment :

1. **Au démarrage :** Choisissez votre méthode d'authentification préférée lorsque vous y êtes invité
2. **Dans la CLI :** Utilisez la commande `/auth` pour reconfigurer votre méthode d'authentification
3. **Variables d'environnement :** Configurez des fichiers `.env` pour une authentification automatique par clé API

Pour des instructions détaillées, consultez la documentation [Configuration de l'authentification](../configuration/auth.md).