# Envoi via webhook DingTalk

Utilisez un robot personnalisé DingTalk pour publier des notifications et des résultats de tâches dans son groupe.
Ce mode d'envoi ne nécessite pas de bot d'application, de connexion longue, de
serveur de callback public ni d'ID de conversation. Pour les conversations avec un agent,
utilisez plutôt le [bot d'application DingTalk](./dingtalk).

## Créer le robot

1. Ajoutez un robot personnalisé dans le groupe DingTalk de destination.
2. Copiez son URL de webhook, commençant par
   `https://oapi.dingtalk.com/robot/send?access_token=...`.
3. Configurez les paramètres de sécurité du robot. Si la signature est activée, copiez également son
   secret de signature. Les restrictions par mot-clé et IP s'appliquent toujours à chaque message.

L'URL du webhook contient un identifiant. Stockez-la comme un secret ou une référence
d'environnement, pas dans le prompt d'une tâche planifiée ou sa cible de livraison.

## Configurer un canal

Ajoutez une instance nommée aux paramètres de canal du workspace :

```json
{
  "channels": {
    "team-notices": {
      "type": "dingtalk-webhook",
      "webhookUrl": "$DINGTALK_WEBHOOK_URL",
      "signingSecret": "$DINGTALK_WEBHOOK_SECRET"
    }
  }
}
```

Définissez les variables référencées dans l'environnement utilisé pour démarrer Qwen Code. Omettez
`signingSecret` lorsque le robot ne nécessite pas de signature. Ce secret est le
secret de signature du robot personnalisé, pas le Client Secret d'une application.

Lancez le démon dans ce workspace :

```bash
qwen serve --channel team-notices
```

Une instance nommée représente un groupe configuré. Créez des instances supplémentaires
pour d'autres groupes. La mise à jour de l'URL d'une instance change la destination pour les livraisons
futures qui la référencent.

## Utiliser Web Shell

Dans Channels, choisissez DingTalk et sa méthode d'envoi par webhook. Enregistrez l'URL du webhook et le secret de signature optionnel, puis démarrez le canal. Les paramètres de réception, de pairing et de session agent ne s'appliquent pas à cette méthode.

Un statut prêt/connecté signifie que les ressources d'envoi locales sont prêtes ; cela ne vérifie pas les identifiants distants.

Dans Scheduled Tasks, choisissez une tâche persistante et sélectionnez ce canal comme destination de livraison. Web Shell remplit automatiquement la destination configurée ; aucun contact observé ni ID utilisateur/chat manuel n'est nécessaire. Les restrictions de livraison par exécution existantes restent en vigueur.

Les mêmes contrôles sont disponibles dans le Web Shell partagé utilisé par `WebShellWithProviders`, lorsque l'hôte active Channels et Scheduled Tasks et fournit un workspace de démon ordinaire.

## Livraison API explicite

Les livraisons Notify et les livraisons explicites de prompt/planifiées utilisent le format de cible
de canal existant. Cet adaptateur définit `chat/default` comme seule destination logique :

```json
{
  "text": "The daily report is ready.",
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

Ceci est un corps de requête Notify du workspace. `default` est un alias appartenant à l'adaptateur,
pas un ID de conversation DingTalk. Les autres ID et cibles utilisateur sont rejetés ; l'adaptateur
n'ignore jamais une destination demandée arbitraire. L'URL du webhook et le secret de signature
restent dans la configuration du canal.

## Comportement de livraison

- Envoie les messages en Markdown, avec un titre court dérivé de la première ligne.
  Le texte ordinaire est également accepté. L'adaptateur préserve le Markdown fourni,
  y compris la syntaxe de tableau ; le rendu est géré par le client DingTalk.
- Il ne reçoit pas de messages, n'exécute pas de tâches webhook entrantes et n'active pas les boucles de canal.
- Vérifie à la fois le statut HTTP et la réponse métier de DingTalk. Les signatures rejetées,
  les identifiants, les règles de sécurité et les limites de débit sont des échecs avec des erreurs nettoyées.
- Ne réessaie pas automatiquement. Un timeout peut laisser l'acceptation distante inconnue.
- Utilise la configuration de proxy du workspace, y compris les contournements `NO_PROXY`.
- Annule les envois en cours lorsque le canal s'arrête. Le rechargement utilise la configuration
  sauvegardée mise à jour.
- Conserve la protection de taille de livraison partagée, qui marque les résultats tronqués.
  La première version envoie ce résultat en un seul message et laisse DingTalk rejeter
  le contenu trop volumineux. Le rejet est signalé comme un échec de livraison ; l'adaptateur
  n'envoie pas de copie raccourcie, ne divise pas les messages et ne réessaie pas. La limite exacte
  de taille Markdown de DingTalk et son unité n'ont pas été vérifiées, donc passer la vérification
  de taille partagée ne garantit pas la livraison. Gardez les rapports planifiés concis.
- La livraison planifiée conserve son comportement existant de meilleur résultat final réussi
  en best-effort. Cela n'introduit pas d'alertes d'échec/annulation, de file de retry
  durable, de pièces jointes ou de contrat de payload webhook générique.

Consultez l'[API d'envoi](https://open.dingtalk.com/document/orgapp/custom-robots-send-group-messages) de DingTalk,
les [types de messages](https://open.dingtalk.com/document/orgapp/custom-bot-send-message-type),
et les [paramètres de sécurité](https://open.dingtalk.com/document/orgapp/customize-robot-security-settings)
pour les exigences de la plateforme.
