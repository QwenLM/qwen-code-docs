# Envoi via webhook WeCom

Utilisez le webhook Message Push d'un groupe WeCom interne (anciennement appelé
robot de groupe) pour envoyer des notifications et des résultats de tâches. Cela
nécessite uniquement l'URL du webhook du groupe, sans Bot ID/Secret, identifiants
d'application, connexion longue ou serveur entrant public. Pour les conversations
avec un agent, utilisez le [robot intelligent WeCom](./wecom) ; pour une
application auto-construite, consultez [WeCom Callback](./wecom-callback).

## Créer une destination de groupe

1. Ouvrez les paramètres d'un groupe WeCom interne et trouvez Message Push.
2. Créez un Message Push personnalisé et copiez son URL de webhook, commençant par
   `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=`.
3. Vérifiez les permissions de création de votre organisation si l'entrée n'est pas
   disponible. Les administrateurs peuvent restreindre les membres autorisés à créer
   des Message Push, et les groupes gérés par le propriétaire peuvent restreindre
   l'entrée au propriétaire du groupe.

Les groupes externes ne sont pas pris en charge par cette configuration. Les
conditions officielles de création décrivent les permissions de groupe interne et
d'administrateur ; elles n'établissent pas une exigence ou exemption universelle de
certification d'entreprise.

L'URL contient le credential d'envoi. Conservez-la dans la configuration du Channel
ou dans une variable d'environnement, jamais dans un prompt de tâche ou une cible de
livraison. Utilisez l'URL telle qu'émise par WeCom. La validation locale autorise
exactement un paramètre `key` contenant des lettres, chiffres, `-`, `.`, `_` ou `~` ;
le percent encoding, les fragments et les paramètres supplémentaires ne sont pas
acceptés. Il n'y a pas de secret de signature séparé.

## Configurer un Channel

Configurez cette intégration dans [Web Shell](#use-web-shell) ou `settings.json`
comme indiqué ci-dessous.

Ajoutez une instance nommée aux paramètres Channel du workspace :

```json
{
  "channels": {
    "team-notices": {
      "type": "wecom-webhook",
      "webhookUrl": "$WECOM_WEBHOOK_URL"
    }
  }
}
```

Définissez `WECOM_WEBHOOK_URL` dans l'environnement utilisé pour démarrer Qwen Code,
puis lancez le démon dans ce workspace :

```bash
qwen serve --channel team-notices
```

Une instance nommée représente un groupe. Créez des instances supplémentaires pour
d'autres groupes. Changer l'URL d'une instance modifie les livraisons futures qui la
traversent.

Le démarrage rend le Channel localement prêt à envoyer. Cela n'envoie pas de message
de test ni ne vérifie le credential distant. L'arrêt annule les envois en cours ; le
redémarrage ou le rechargement applique les modifications de configuration
sauvegardées.

## Utiliser Web Shell

Si votre build contient le support backend mais précède l'intégration Web, Channels
ne liste pas cette méthode ni les instances `wecom-webhook` existantes. Utilisez les
étapes `settings.json` et `qwen serve --channel` ci-dessus jusqu'à ce que vous
mettiez à jour vers un build contenant l'intégration Web.

Dans Channels, choisissez WeCom puis Webhook (envoi uniquement). Sélectionnez le
workspace, sauvegardez l'URL du webhook et démarrez le Channel. Aucun secret de
signature n'est nécessaire. Les paramètres de réception, de pairing et de session
agent ne s'appliquent pas à cette méthode. La méthode du robot intelligent reste sous
WeCom ; WeCom Callback conserve son entrée séparée.

Dans Scheduled Tasks, choisissez une session de tâche persistante et sélectionnez ce
Channel comme destination de livraison. Web Shell remplit automatiquement son groupe
configuré ; aucun contact observé ou ID de chat saisi manuellement n'est nécessaire.
Les restrictions de livraison par exécution et par déclenchement manuel existantes
restent en vigueur.

Les mêmes contrôles sont disponibles via `WebShellWithProviders` lorsque l'hôte
active Channels et Scheduled Tasks et fournit un workspace démon.

## Livraison API explicite

Notify et la livraison explicite par prompt/planifiée utilisent la cible Channel
existante. Cet adaptateur possède une seule destination logique, `chat/default` :

```json
{
  "text": "# Rapport quotidien\n\nLes vérifications ont réussi.",
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

Ceci est un corps de requête Notify de workspace. `default` nomme le groupe configuré
; ce n'est pas un ID de chat WeCom. Les autres ID, cibles utilisateur et fils sont
rejetés. Les tâches stockent la destination logique ; le credential reste dans les
paramètres du Channel.

Les tâches planifiées persistantes utilisent la même destination. La livraison
conserve le comportement best-effort de résultat final réussi existant, y compris les
restrictions actuelles par exécution et par déclenchement manuel.

## Formatage et limites des messages

- Envoie du `markdown_v2` avec le texte original. Son sous-ensemble supporté inclut
  les titres, listes, liens, blocs de code délimités et tableaux ; le texte ordinaire,
  le chinois et les emojis sont des entrées valides. La compatibilité complète avec
  Markdown flavor GitHub n'est pas garantie.
- Ce format ne supporte ni les mentions ni le balisage de couleur de police.
  L'adaptateur n'envoie aucun tableau de mentions et ne transforme pas le texte des
  tâches en mentions. Les chaînes ressemblant à des mentions telles que `< @all>`
  restent dans le corps.
- Les clients antérieurs à 4.1.36 (Android antérieur à 4.1.38) affichent le message
  en texte brut. Utilisez un client récent pour le rendu Markdown.
- Le **contenu** final est limité à **4096 octets UTF-8**, avant échappement JSON.
  Le chinois et les emojis prennent plus d'octets que l'ASCII. Ce n'est pas une limite
  de 4096 caractères ni une limite sur la requête JSON complète.
- Le contenu surdimensionné échoue explicitement avant l'envoi. Il n'y a pas de
  troncature silencieuse, de division automatique ni de retry par l'adaptateur. La
  limite de livraison partagée s'applique toujours avant la vérification spécifique à
  la plateforme.
- WeCom autorise **20 messages par minute par webhook**. Gardez les rapports planifiés
  concis et évitez les rafales ; les livraisons throttled signalent un échec sans mise
  en file d'attente.

## Échecs et transport

Le statut HTTP et le `errcode` numérique WeCom sont tous deux vérifiés. Les
identifiants invalides ou désactivés, les destinations de groupe rejetées et les
limites de débit produisent des échecs observables. Les diagnostics omettent l'URL, la
clé, le contenu du message et le texte d'erreur brut du fournisseur.

Chaque tentative effectue au plus une requête avec un timeout de 15 secondes.
L'acceptation par l'API n'est pas un accusé de lecture ; un timeout ou une
annulation peut laisser l'acceptation distante inconnue. Le transport honore le proxy
de workspace résolu et le comportement `NO_PROXY` existant.

Ce mode ne reçoit pas de messages, n'exécute pas de tâches webhook entrantes ni ne
démarre de boucles Channel. Il n'ajoute pas de pièces jointes, cartes interactives,
alertes automatiques d'échec/annulation, retries durables ni de protocole webhook
générique.

Consultez le [protocole Message Push](https://developer.work.weixin.qq.com/document/path/91770)
et le [guide de configuration](https://open.work.weixin.qq.com/help2/pc/14931)
officiels pour les exigences actuelles de la plateforme.