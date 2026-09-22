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

## Extension Chrome et Browser Use

L'extension Chrome de Qwen Code connecte Chrome à Qwen Code qui s'exécute sur votre ordinateur. Son panneau latéral affiche l'application web locale de Qwen Code, et Browser Use échange des commandes et des résultats du navigateur via un hôte Native Messaging local. Ce qui suit décrit les données traitées pour les tâches du navigateur, séparément des statistiques d'utilisation facultatives décrites ci-dessous.

### Données du navigateur utilisées pour vos tâches

Les outils du navigateur peuvent accéder aux titres et URL des onglets HTTP(S) ouverts, au texte et à la structure des pages, aux captures d'écran, aux résultats d'interaction avec le navigateur, et aux informations de débogage telles que les messages de la console, l'activité réseau et les cookies. Les recherches explicites dans l'historique du navigateur retournent les URL correspondantes, les titres de page et les heures de visite dans les limites de requête demandées. Selon les pages et les tâches que vous choisissez, ces résultats peuvent contenir des identifiants personnels, des informations de santé, des informations financières ou de paiement, des informations d'authentification, des communications personnelles et des informations de localisation. L'extension utilise également les informations de source de navigation pour associer les nouvelles pages ouvertes par une action récente de l'assistant à la même session de navigateur.

Ces fonctionnalités prennent en charge les tâches de navigateur et le travail de développement web que vous demandez à Qwen Code. Les outils du navigateur opèrent dans votre profil Chrome, y compris les pages auxquelles vous êtes connecté. Choisissez en conséquence les pages et les tâches que vous partagez avec l'assistant.

### Traitement local et fournisseurs IA

L'extension envoie les commandes et les résultats du navigateur à Qwen Code sur le même ordinateur. Qwen Code peut inclure ces résultats dans le contexte de la conversation et les transmettre au fournisseur IA configuré pour cette session. Les conditions de confidentialité, de conservation et d'entraînement des modèles du fournisseur s'appliquent comme décrit ailleurs dans cet avis. La connexion locale de l'extension est une partie de ce flux de données ; le traitement ultérieur peut avoir lieu chez le fournisseur IA que vous avez choisi.

### Données stockées et contrôles utilisateur

L'extension stocke les préférences de connexion, un jeton d'authentification local de démon facultatif, et un identifiant persistant d'instance de navigateur dans le stockage local de l'extension Chrome. Elle stocke également l'état de propriété des onglets et des sessions dans le stockage de session Chrome pour prendre en charge le nettoyage après le redémarrage de son service worker en arrière-plan.

Les résultats du navigateur inclus dans les conversations Qwen Code ou enregistrés par les outils du navigateur peuvent rester dans les enregistrements de conversations locaux, les captures d'écran, les téléchargements ou d'autres fichiers de sortie. Gérez ces enregistrements à l'aide des contrôles applicables de Qwen Code et du système de fichiers. La conservation par le fournisseur IA est régie séparément par le fournisseur sélectionné.

Vous pouvez désactiver ou désinstaller l'extension Chrome dans le gestionnaire d'extensions de Chrome pour arrêter son intégration au navigateur. L'effacement du stockage de l'extension supprime ses préférences enregistrées, son jeton et son identifiant d'instance. La suppression de l'extension laisse l'application Qwen Code installée séparément, son hôte Native Messaging, les conversations et fichiers locaux, ainsi que les copies déjà envoyées à un fournisseur IA, à gérer séparément.

### Utilisation limitée des données du navigateur

L'utilisation et le transfert des données reçues par Qwen Code via l'extension Chrome respectent la [Politique de données utilisateur du Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/user-data), y compris ses exigences d'utilisation limitée. Les données du navigateur sont utilisées pour fournir l'objectif unique de l'extension : connecter Chrome à Qwen Code pour l'assistance de navigateur demandée par l'utilisateur. Elles ne sont pas vendues, utilisées pour la publicité, ni utilisées pour déterminer la solvabilité ou l'éligibilité à un prêt. Les transferts sont limités à la fourniture de cette fonctionnalité, y compris le traitement par le fournisseur IA que vous configurez, et aux autres utilisations autorisées par cette politique.

Pour les questions concernant le traitement des données du navigateur, contactez l'équipe via le [suivi des problèmes de Qwen Code](https://github.com/QwenLM/qwen-code/issues). Partagez uniquement les détails nécessaires pour expliquer la question ; supprimez les identifiants et le contenu des pages privées des rapports publics.

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