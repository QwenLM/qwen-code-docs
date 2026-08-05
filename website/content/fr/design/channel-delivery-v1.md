# Channel Delivery V1

## Objectif

Permettre aux tâches planifiées, aux prompts du démon et à une API Notify directe d'envoyer du texte à une cible IM explicite via le Channel Worker qui possède le workspace sélectionné. La livraison est immédiate et best-effort : il n'y a ni outbox durable, ni relecture, ni retry, ni hook global de réponse finale.

## Contrat public

```ts
interface ChannelDelivery {
  kind: 'channel';
  target: {
    channelName: string;
    type: 'user' | 'chat';
    id: string;
  };
}
```

La création de tâches planifiées et `POST /session/:id/prompt` acceptent un `delivery` optionnel de premier niveau. La notification directe utilise :

```http
POST /workspace/notify
POST /workspaces/:workspace/notify

{
  "text": "alert text",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

Le démon normalise la cible publique à sa frontière de confiance vers la requête worker interne `{ deliveryId, channelName, target: { type, id }, text }`. Le texte envoyé à un worker doit être non vide et est limité à 100 000 unités de code UTF-16 avant l'IPC. Le contrôle inverse de Prompt et de tâche planifiée peut porter une chaîne vide uniquement pour signaler un tour réussi sans réponse finale livrable en tant que `skipped` ; ce chemin n'atteint jamais l'IPC du worker.

## Frontières d'exécution

Les tâches planifiées et Prompt possèdent leur propre sémantique de réponse finale. Une Session capture le texte uniquement lorsque l'invocation courante porte des métadonnées de livraison. Chaque envoi au modèle possède un bloc de réponse : les chunks de flux hors pensée sont joints au sein de ce bloc, un retry sans continuation ou un fallback de modèle écarte les chunks remplacés, et tout bloc qui demande un outil est intermédiaire et ne peut pas devenir le payload de livraison. Une continuation automatique ultérieure remplace le candidat terminal précédent. Une fois que le tour complet atteint un `end_turn` réussi, la Session soumet exactement une requête de contrôle inverse contenant uniquement le dernier bloc de réponse assistant sans outil. La narration entre outils et tous les blocs de réponse antérieurs sont exclus.

Un `end_turn` réussi soumet toujours la requête de contrôle inverse, y compris lorsque le bloc final est vide ou ne contient que des espaces. Le démon consomme d'abord l'autorisation épinglée, renvoie `skipped` sans résoudre de worker et publie un événement `channel_delivery_result`. L'annulation, l'échec de l'Agent et la terminaison par limite de tokens ne soumettent rien. Une sortie vide est donc distinguable d'un tour qui n'a jamais été éligible à la livraison.

L'admission de Prompt reste `202` ; la complétion d'Agent reste `turn_complete` ou `turn_error`. La complétion de canal est un événement `channel_delivery_result` ultérieur et ne convertit jamais un succès d'Agent en `turn_error`.

Notify contourne Session et Agent. Il attend une tentative de livraison par un worker et mappe une entrée invalide vers 400, des workers indisponibles ou saturés vers 503, un timeout vers 504 et un échec d'adaptateur vers 502. Un timeout a un résultat de livraison inconnu et n'est pas retenté.

Le webhook reste un chemin asynchrone indépendant avec son propre secret et son contrat d'admission worker `202`. Il peut réutiliser les primitives d'envoi et la classification d'erreurs de `ChannelBase`, mais pas le flux de contrôle de Prompt/Notify. Les prompts de notification en arrière-plan restent du travail d'Agent local et n'envoient pas automatiquement vers IM.

## Propriété du workspace

Le démon lie le workspace lors de la construction de chaque bridge ACP. L'admission de Prompt enregistre l'ID de livraison émis par le démon et la cible épinglée, tandis que la livraison planifiée est autorisée depuis la tâche persistée. Le callback de l'enfant doit correspondre à cette autorisation et ne peut pas choisir `workspaceCwd` ni remplacer la cible. Le callback hôte consomme l'autorisation avant de décider entre `skipped` et la livraison par le worker, de sorte que les réponses finales vides ne peuvent pas forger d'événements ni laisser un état d'autorisation one-shot/monotone inchangé. Le texte non vide est routé uniquement vers le groupe de workers du workspace canonique. Les propriétaires manquants, en cours de bootstrap, en drain, arrêtés ou supprimés renvoient `channel_worker_unavailable` ; il n'y a pas de fallback vers le runtime primaire ni de démarrage paresseux de worker.

## Fiabilité et confidentialité

L'autorisation est consommée avant que la disponibilité du worker ne soit vérifiée, de sorte qu'un blip transitoire de worker après la consommation abandonne définitivement cette livraison unique ; cela est cohérent avec le contrat immédiat, best-effort et sans retry.

Cette V1 n'a ni persistance, ni relecture au démarrage, ni scan historique, ni retry, ni garantie d'idempotence. Les tâches existantes sans delivery n'envoient jamais. Le comportement de rattrapage existant du planificateur est inchangé. Les exécutions normales ne portent la livraison que lorsque la tâche la contient déjà ; le lot synthétique historique de one-shot manqués efface explicitement la livraison afin qu'activer Channel plus tard ne puisse pas créer une rafale d'anciennes alertes.

La V1 observe uniquement la Promise d'envoi du canal. Un rejet est assaini et mappé vers `channel_delivery_failed`, sauf pour les adaptateurs qui fournissent déjà une disposition permanente typée, mappée vers `channel_delivery_rejected`. L'analyse des réponses spécifiques au fournisseur et une sémantique cohérente des raisons d'erreur entre les adaptateurs IM sont un travail de suivi ; le démon et le worker ne contiennent aucune gestion d'erreur spécifique à la plateforme.

Les événements et journaux de résultat de livraison incluent les identifiants de corrélation, la source, le statut et les données d'erreur assainies. Ils n'incluent jamais le texte du message, les ID de cible, les identifiants ni les secrets de webhook. `delivered` signifie que la Promise d'envoi de l'adaptateur s'est résolue ; cela n'affirme pas que le fournisseur a accepté le message ni qu'un utilisateur l'a reçu ou lu.

## Capacité

Le démon annonce `channel_delivery` lorsqu'il prend en charge les contrats et les routes. Il s'agit d'une prise en charge du protocole, pas d'une assertion de santé en direct pour un worker ou un adaptateur.
