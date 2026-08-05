# Remise des notifications de sortie manuelle du mode Plan

## Problème

Le mode Plan est renforcé par un rappel récurrent sur les tours utilisateur à
destination du modèle. Quand le mode d'approbation change en dehors du flux
approuvé `exit_plan_mode`, le simple arrêt de ce rappel n'est pas un signal
fiable que le mode Plan est terminé.

La notification one-shot existante est assemblée dans `GeminiClient` pour les
tours UserQuery et Cron. Cette frontière manque les requêtes de modèle
envoyées par d'autres chemins, y compris les continuations de résultats
d'outil, le steering, les hooks, les envois directs ACP/démon et les agents
interactifs. Un booléen en attente unique sur `Config` permet aussi à une
conversation de consommer une notification destinée à toutes les conversations
live partageant le mode.

## Périmètre

La garantie s'applique aux conversations live du processus actuel. Elle ne
persiste pas les notifications au-delà des redémarrages de processus et ne
modifie ni les vérifications d'approbation, ni l'approbation de plan, ni
l'exécution des outils.

Les notifications sont activées pour :

- le chat principal créé par `GeminiClient.startChat`, y compris TUI,
  non-interactif, ACP, démon/Web UI, et les chats de remplacement après
  compression ;
- les chats créés par `AgentCore.createChat` avec `interactive: true`.

Elles restent désactivées pour fork/spéculation, les agents headless, les
workflows, les requêtes annexes de mémoire et de compactage, et tout autre
`GeminiChat` sauf activation explicite.

## État et propriété

`Config` conserve deux morceaux d'état en mémoire indépendants :

- un événement de mode `{ version, kind }`, où `kind` est `clear` ou
  `manual-exit` ;
- un curseur de conversation `{ seenVersion }`.

L'événement est possédé avec le mode d'approbation. Un `Config` créé avec
`Object.create(parent)` hérite à la fois du mode d'approbation du parent et de
l'événement actuel. À la première écriture qui crée son propre mode
d'approbation, il copie l'événement actuel puis devient isolé des événements
ultérieurs du parent.

Le curseur est toujours possédé paresseusement par le `Config` receveur. La
conversation principale et chaque agent interactif peuvent donc revendiquer le
même événement hérité indépendamment. Recréer un chat avec le même `Config`
conserve son curseur et ne remet pas l'événement.

Les transitions de mode mettent à jour l'événement comme suit :

- de non-Plan vers Plan incrémente la version et écrit `clear` ;
- de Plan vers non-Plan incrémente la version et écrit `manual-exit`, sauf un
  `exit_plan_mode` approuvé qui écrit `clear` ;
- de non-Plan vers non-Plan ne crée pas d'événement.

Entrer en Plan efface une sortie plus ancienne non remise. Une remise lit le
dernier mode d'approbation, de sorte qu'un changement non-Plan-vers-non-Plan
ultérieur modifie le mode nommé dans la notification en attente sans créer une
autre notification.

## Sémantique de remise et d'échec

`GeminiChat` expose un opt-in idempotent. À chaque envoi, il termine la
compression asynchrone et les vérifications de sauvetage forcé, puis
revendique synchrone un événement en attente immédiatement avant de commit
le contenu utilisateur dans l'historique. La notification est ajoutée comme
dernière part de texte, préservant les parts de réponse de fonction qui la
précèdent.

Le point de linéarisation est le commit d'historique réussi contenant la
notification. Les retries et fallbacks du provider réutilisent cette requête
committée et n'ajoutent pas de seconde notification à l'historique. Si la mise
en place synchrone de l'envoi lève une exception et annule le push dans
l'historique, la revendication est restaurée uniquement quand le même
événement manual-exit est toujours actuel, que le mode est toujours non-Plan et
que le curseur pointe toujours vers cette version. Un événement de mode
ultérieur rend une restauration ancienne obsolète et inoffensive.

L'implémentation ne peut pas déterminer si un provider a reçu une requête de
transport échouée. Un retry de transport peut envoyer la même requête plus
d'une fois, mais l'historique de chat live contient la notification au plus
une fois.

La récupération de débordement de contexte est l'exception à la réutilisation
de la requête d'origine : la compression réactive remplace l'historique live
avant de reconstruire le payload de retry. Si son historique compressé ne
contient plus la notification committée, le chat rajoute ce texte exact avant
de retenter. Quand la compression se termine déjà sur un tour utilisateur, la
notification est ajoutée comme sa dernière part plutôt que de créer des tours
utilisateur adjacents.

## Notification

```text
<system-reminder>
The approval mode changed outside the approved exit_plan_mode flow.
The current approval mode is: ${currentMode}.
Plan mode is no longer active. This notice supersedes any earlier reminder that Plan mode is active. Do not call exit_plan_mode; no plan approval is pending. Continue under the current mode's permissions and confirmation requirements.
</system-reminder>
```

## Vérification

Les tests unitaires couvrent la sémantique de transition, la propriété des
événements hérités, les curseurs de conversation indépendants, le comportement
de restauration obsolète, la remise opt-in, l'ordre des parts, l'annulation de
la mise en place, les retries, la recréation de chat et la propriété du chat.
Le plan E2E couvre PTY, ACP, les agents interactifs et les sorties de plan
approuvées.
