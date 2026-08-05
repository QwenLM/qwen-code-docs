# Adaptateurs de canal pour l'hébergement de code — Conception

## Vue d'ensemble

L'adaptateur de polling GitHub permet aux agents IA de surveiller GitHub à la recherche de tâches en interrogeant l'API de notifications et en publiant les réponses de l'agent sous forme de commentaires d'issue/PR. Contrairement aux adaptateurs IM (webhooks temps réel/long-poll), cet adaptateur effectue un polling à intervalle régulier.

## Architecture : la notification comme signal de réveil

L'idée centrale : les notifications de plateforme sont **au niveau du thread** et **mutables** — toute activité (commentaire, push, changement de label) incrémente `updated_at`. Les notifications ne peuvent pas être utilisées comme un flux d'événements fiable par commentaire.

À la place, les notifications servent uniquement de **signal de réveil** (« quelque chose s'est passé sur ce thread »). L'adaptateur énumère ensuite les commentaires réels via l'API de commentaires de la plateforme, en utilisant un watermark par thread pour déterminer quels commentaires sont nouveaux.

## GitHub : fenêtre de commentaires basée sur un curseur

### Découplage des horodatages de notification/commentaire

Un problème de timing critique : **`updated_at` de la notification et `updated_at` du commentaire sont découplés**.

- `notification.updated_at` est incrémenté par _toute_ activité du thread (commentaire, push, changement de label) et est sujet à un délai de livraison
- `comment.updated_at` reflète le moment où le commentaire a réellement été créé/modifié

Ces horodatages n'ont aucune relation causale. Une notification peut arriver 16 secondes après le commentaire qui l'a déclenchée, et peut être incrémentée à nouveau par une activité sans rapport. Utiliser les horodatages de notification pour contrôler l'énumération des commentaires produit donc deux modes d'échec :

1. **Réponses en double** — `PUT /notifications` est asynchrone (202 Accepted) avec une coupure `last_read_at`. La réponse du bot incrémente `updated_at` au-delà de la coupure avant que le serveur ne traite le marquage, de sorte que la notification n'est jamais marquée comme lue. Le prochain polling la récupère à nouveau et retraite les mêmes commentaires.
2. **Réponses manquées** — le curseur avance jusqu'à `max(notification.updated_at)`, ce qui peut sauter au-delà de commentaires portés par des notifications arrivées en retard. Quand ces notifications arrivent enfin, leurs commentaires tombent sous la fenêtre du curseur et sont silencieusement exclus.

### Conception

La correction provient d'une **fenêtre de commentaires basée sur un curseur**, pas du statut de lecture de la notification :

Cycle de polling :

1. `GET /notifications?since={cursor-1s}` — découvrir les threads non lus
2. Enregistrer `windowSince = cursor.lastProcessedAt` (le curseur **avant** que ce polling ne l'avance)
3. `markNotificationsAsRead(maxUpdatedAt)` — marquage global best-effort (nettoie les notifications hors issue)
4. Avancer le curseur global jusqu'à `max(notification.updated_at)`
5. Par thread : `listComments(since=windowSince)` — énumérer les commentaires
6. Exclure : les commentaires du bot lui-même ; les commentaires avec `created_at > maxUpdatedAt` (au-dessus de la fenêtre) ; les commentaires avec `created_at <= windowSince` (sous la fenêtre)
7. Traiter : détection de mention → enveloppe → `handleInbound`

La fenêtre effective de commentaires est `(windowSince, maxUpdatedAt]`. Les commentaires traités lors d'un polling précédent ont `created_at <= windowSince` (le `maxUpdatedAt` du polling précédent) et sont exclus. Cela évite les doublons, que `PUT /notifications` ait réussi ou non. Les modifications de commentaires ne redéclenchent pas le traitement — seul `created_at` est utilisé pour l'appartenance à la fenêtre.

Le marquage global est quand même appelé (étape 3) pour nettoyer les notifications hors issue/PR et réduire la liste des non-lus, mais il n'est pas fondamental pour la déduplication.

### Limitation connue : livraison tardive des notifications

Comme le curseur est global (pas par thread), une notification qui arrive lors d'un polling ultérieur au `created_at` de ses commentaires peut voir ces commentaires exclus par la fenêtre du curseur. Cela nécessite que la livraison de la notification soit retardée au-delà d'une frontière de polling ET que les commentaires d'un autre thread aient entre-temps fait avancer le curseur au-delà d'eux. En pratique, cette fenêtre est étroite (la livraison des notifications se termine généralement en moins d'un intervalle de polling) ; l'utilisateur peut re-mentionner pour retenter.

### Limitation connue : commentaires de review de PR

`issues.listComments` ne renvoie que les commentaires de conversation générale, pas les commentaires de review de PR (commentaires de diff par ligne). Une @-mention dans un commentaire de review de PR est silencieusement ignorée. Utilisez plutôt un commentaire de conversation générale sur la PR.

### Comportement par scénario

| Scénario                          | Comportement                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Nouveau thread (@bot dans un commentaire) | Apparaît (non lu) → énumération depuis le curseur → traitement                                                          |
| Thread existant, nouveau commentaire      | Réapparaît (non lu) → énumération depuis le curseur → les anciens commentaires sont exclus par `<= windowSince` → uniquement les nouveaux |
| Activité hors commentaire (push/label)    | Apparaît → zéro nouveau commentaire dans la fenêtre → ignoré                                                            |
| L'utilisateur marque comme lu sur github.com | Disparaît de l'API → non traité                                                                                        |
| Échec de markNotificationsAsRead  | La fenêtre de curseur évite quand même les doublons → aucun impact sur la correction                                          |
| Crash après markRead, avant la fin | Le curseur n'est pas enregistré → le prochain démarrage récupère les mêmes notifications → le lot en crash est retraité, pas perdu |
| Le bot répond à un thread         | `updated_at` incrémenté → la notification peut rester non lue → le prochain polling la récupère → les commentaires sont exclus par la fenêtre de curseur → pas de doublon |
| Nouvelle issue avec @bot dans le corps | Pas de commentaires → le corps contient une mention → le corps sert de déclencheur (dédupliqué via `dispatchedBodies`)  |

## PollingChannelBase

`PollingChannelBase<Cursor>` (dans `packages/channels/base/`) étend `ChannelBase` et fournit l'infrastructure de boucle de polling :

- **Boucle de polling** : démarrage/arrêt via `startPollLoop()`/`stopPollLoop()`, appelés depuis `connect()`/`disconnect()`
- **Intervalle de polling** : lu depuis la configuration du canal `pollInterval` (ms), validé comme nombre fini positif, par défaut 60000
- **Persistance du curseur** : le curseur JSON est enregistré atomiquement après chaque `pollOnce()` réussi ; chargé à la construction (date corrompue ou non analysable → fallback vers `createInitialCursor()`)
- **Validation du curseur** : hook virtuel `validateCursor()` — la base rejette les non-objets et les tableaux ; les sous-classes ajoutent des vérifications de forme (par exemple GitHub rejette une date `lastProcessedAt` manquante/invalide)
- **Backoff** : exponentiel de 2s → 30s en cas d'erreurs de polling, réinitialisé en cas de succès
- **Sommeil interruptible** : `abortableSleep(ms)` exposé comme méthode protégée — l'intervalle de polling et le backoff d'erreur sont interruptibles via `disconnect()`

Les sous-classes implémentent uniquement :

- `pollOnce()` — effectuer le travail, modifier `this.cursor`
- `createInitialCursor()` — valeur par défaut de la première exécution

Le générique `Cursor` est n'importe quel objet sérialisable en JSON. GitHub utilise `{ lastProcessedAt: string; dispatchedBodies?: string[] }` (ce dernier limite la déduplication des corps de premier contact aux 500 entrées les plus récentes).

## Détection de mention

Regex insensible à la casse, basée sur le corps. Fonctions séparées pour la détection (`testBotMention`) et la suppression (`stripBotMention`) :

- Détection : correspondance regex explicite renvoyant un booléen — jamais déduite d'une comparaison avant/après suppression (les différences d'espaces causent des faux positifs)
- Suppression : retire uniquement `@bot`, préserve tout le reste du formatage (pas de compression d'espaces)

## Portée de session

Les adaptateurs de polling utilisent la portée `chat_thread` : clé de routage = `channel:chatId:threadId`. Cela évite les collisions de session entre dépôts (`repo-a/issue:42` vs `repo-b/issue:42`).

## Gestion des erreurs

La livraison est **best-effort**. En cas d'échec de `handleInbound`, un seul commentaire d'erreur est publié par thread et par cycle de polling (puis `break` sort de la boucle de commentaires — évite N commentaires d'erreur identiques) ; l'utilisateur re-mentionne pour retenter. Les erreurs d'API par notification utilisent `continue` — une notification en échec ne bloque pas le reste du lot. Les notifications sans `subject.url` (types Discussion, SecurityAlert) sont silencieusement ignorées.

Si le processus crashe en cours de traitement, le curseur n'est pas enregistré (il n'est persisté qu'après la fin de `pollOnce()`), donc le prochain démarrage récupère les mêmes notifications — mais la fenêtre de commentaires basée sur le curseur exclut les commentaires déjà traités, évitant les doublons.

La prévention des doublons ne dépend **pas** du succès de `PUT /notifications`. Le marquage global est un nettoyage best-effort ; la fenêtre de curseur est le mécanisme fondamental de déduplication.
