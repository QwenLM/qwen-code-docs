# Envoi de webhooks Feishu

Utilisez un bot personnalisé Feishu pour envoyer des notifications et des résultats de tâches à son groupe.
Cette méthode nécessite une URL de webhook et, lorsque c'est activé sur le bot, un secret de signature.
Elle ne nécessite ni application, ni connexion longue, ni serveur entrant.
Pour les conversations avec un agent, utilisez le [bot d'application Feishu](./feishu).

## Créer le bot

1. Ajoutez un bot personnalisé dans le groupe Feishu de destination.
2. Copiez son URL de webhook, commençant par
   `https://open.feishu.cn/open-apis/bot/v2/hook/`.
3. Configurez les paramètres de sécurité du bot. Si la vérification par signature est activée,
   copiez également son secret de signature. Les restrictions par mot-clé et IP s'appliquent toujours.

L'URL contient un identifiant. Conservez-la dans la configuration du Channel ou dans une variable
 d'environnement, pas dans un prompt de tâche ou une cible de livraison. Cette intégration prend en
charge `open.feishu.cn` ; les points de terminaison Lark ne sont pas inclus.

Utilisez l'URL exactement telle que fournie par Feishu. La validation locale nécessite un segment
de chemin de token contenant des lettres, des chiffres, `-`, `.`, `_` ou `~`, sans encodage en
pourcentage, paramètres de requête ni fragment.

## Configurer un Channel

Configurez cette intégration dans [Web Shell](#use-web-shell) ou `settings.json` comme
indiqué ci-dessous.

Ajoutez une instance nommée aux paramètres Channel du workspace :

```json
{
  "channels": {
    "team-notices": {
      "type": "feishu-webhook",
      "webhookUrl": "$FEISHU_WEBHOOK_URL",
      "signingSecret": "$FEISHU_WEBHOOK_SECRET"
    }
  }
}
```

Définissez ces variables dans l'environnement utilisé pour démarrer Qwen Code. Omettez
`signingSecret` si le bot ne nécessite pas de signature. Utilisez le secret de signature
du bot personnalisé, pas le App Secret d'une application.

Démarrez le démon dans ce workspace :

```bash
qwen serve --channel team-notices
```

Une instance nommée représente un groupe. Créez des instances supplémentaires pour d'autres
groupes. Modifier l'URL d'une instance change la destination pour les livraisons futures
qui la référencent.

Démarrer le Channel le rend localement prêt à envoyer ; il n'envoie pas de message de test
ni ne vérifie les identifiants distants. L'arrêter annule les envois en cours. Le redémarrage
ou le rechargement applique les modifications de configuration enregistrées.

## Utiliser Web Shell

Dans Channels, choisissez Feishu puis Webhook (envoi uniquement). Sélectionnez le workspace,
enregistrez l'URL du webhook et le secret de signature optionnel, et démarrez le Channel.
Les paramètres de réception, de pairing et de session d'agent ne s'appliquent pas à cette méthode.
La méthode du bot d'application reste disponible sous la même plateforme Feishu.

Dans Scheduled Tasks, choisissez une session de tâche persistante et sélectionnez ce Channel
comme destination de livraison. Web Shell remplit automatiquement son groupe configuré ;
aucun contact observé ni ID de chat saisi manuellement ne sont nécessaires. Les restrictions
de livraison par exécution et par déclenchement manuel existantes restent en vigueur.

Les mêmes contrôles sont disponibles via `WebShellWithProviders` lorsque l'hôte
active les Channels et les Scheduled Tasks et fournit un workspace de démon.

## Livraison explicite via l'API

Les notifications et les livraisons explicites de prompts ou planifiées utilisent le format
de cible Channel existant. Cet adaptateur possède une seule destination logique, `chat/default` :

```json
{
  "text": "# Daily report\n\nThe checks passed.",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "team-notices",
      "type": "chat",
      "id": "default"
    }
  }
}
```

Ceci est un corps de requête Notify de workspace. `default` est un alias pour le groupe
configuré, pas un ID de chat Feishu. Les autres ID et cibles utilisateur sont rejetés. Le point
de terminaison et le secret de signature restent dans la configuration du Channel.

Les tâches planifiées persistantes utilisent le même tuple de destination. La livraison conserve
le comportement existant de résultat final réussi best-effort, y compris les restrictions
par exécution et par déclenchement manuel actuelles.

## Formatage et limites des messages

- Envoie du texte brut et du Markdown dans une carte schema 2.0 statique. Les titres, listes,
  liens, blocs de code, tableaux, caractères chinois et emoji restent des entrées valides. La carte n'a
  pas de boutons, de mises à jour en streaming ni de résumé d'aperçu dupliqué.
- Utilise le sous-ensemble Markdown de Feishu ; la compatibilité complète avec
  Markdown GitHub-flavored n'est pas garantie. Les tableaux utilisent des éléments séparés dans la même carte. Feishu
  documente la pagination après cinq lignes de données par tableau.
- Échappe les balises `<at ...>` et `</at>` complètes avec des entités HTML numériques afin que
  le markup de mention fourni par la tâche soit envoyé comme texte littéral. Cela s'applique également à l'intérieur
  des exemples de code. Les mentions configurables et la recherche de destinataire ne sont pas prises en charge.
  Le comportement de rendu client et de notification doit être vérifié dans votre groupe.
- Vérifie la **requête JSON UTF-8 sérialisée complète**, y compris l'échappement,
  la structure de la carte et la signature optionnelle, par rapport à un **budget local de 20 000 octets**.
  Le guide du bot personnalisé de Feishu indique 20 Ko sans préciser le nombre d'octets exact ;
  cette limite locale conservative n'est pas un maximum mesuré de la plateforme.
- Rejette les requêtes trop volumineuses avant l'envoi, avec un échec de livraison explicite.
  L'adaptateur ne tronque pas silencieusement, ne divise pas en plusieurs requêtes ni ne réessaie.
  La protection partagée de taille de livraison s'applique toujours avant cette vérification plateforme.
  Gardez les rapports suffisamment concis pour que la requête complète tienne.

## Échecs et transport

Le statut HTTP et le `code` numérique de Feishu sont tous deux vérifiés. Les rejets par mot-clé, IP,
signature et limite de taux sont des échecs observables. Les erreurs omettent l'URL
du webhook, les secrets, le contenu du message et les réponses brutes du fournisseur.

Chaque tentative envoie au plus une requête, avec un délai d'attente de 15 secondes. Un délai dépassé ou
une annulation peut laisser l'acceptation distante inconnue. Le Channel utilise le proxy
du workspace résolu et le comportement de contournement `NO_PROXY` existant.

Ce mode ne reçoit pas de messages, n'exécute pas de tâches webhook entrantes ni ne démarre de boucles
Channel. Il n'ajoute pas de pièces jointes, d'alertes d'échec/annulation, de file d'attente de réessai durable
ni de protocole webhook générique.

Consultez le [guide du bot personnalisé](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) officiel
et la [documentation des composants Markdown](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/rich-text?lang=zh-CN)
pour la configuration plateforme et les exigences de rendu.