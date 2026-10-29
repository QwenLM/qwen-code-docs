# Mode Workflow de session


Le mode Workflow enregistre une préférence pour prendre en compte l'outil Workflow
pour les nouvelles soumissions ordinaires dans la session en cours. Il est
désactivé par défaut. Le modèle décide toujours si un workflow est utile, et
toutes les restrictions de permission, de confiance, de budget et d'outil
continuent de s'appliquer. Activer le mode ne démarre pas d'exécution, ne
modifie pas l'effort de raisonnement, ni vos paramètres par défaut.

Les outils Workflow sont opt-in. Activez `tools.workflowsEnabled` dans les
paramètres ou définissez `QWEN_CODE_ENABLE_WORKFLOWS=1` avant d'activer le mode :

```sh
QWEN_CODE_ENABLE_WORKFLOWS=1 qwen --workflow-mode on
qwen --resume <session-id> --workflow-mode off
```

Démarrer avec `--workflow-mode on` lorsque les outils sont indisponibles échoue
à l'initialisation. `QWEN_CODE_DISABLE_WORKFLOWS=1` est prioritaire sur leur
activation.

Dans les deux rendus de terminal, utilisez `/workflows mode` ou
`/workflows mode status` pour lire l'état, et `/workflows mode on` ou
`/workflows mode off` pour le modifier. Ces contrôles de mode peuvent
s'exécuter pendant la diffusion d'une réponse ; ils affectent les soumissions
éligibles suivantes. Le pied de page affiche `Workflow mode: on`, ou
`Workflow mode: on (unavailable)` si la préférence enregistrée ne peut pas
être appliquée actuellement. La liste d'exécution `/workflows` et les contrôles
de pause existants conservent leur comportement d'origine.

L'état distingue `requested` (la préférence enregistrée), `available` (les
outils requis sont actuellement utilisables) et `effective` (les deux sont
vrais). L'activation nécessite que les outils Workflow soient disponibles. La
désactivation reste possible lorsqu'ils sont indisponibles. Perdre un outil
n'efface pas une préférence activée enregistrée ; restaurer l'outil rend à
nouveau cette préférence effective.

Le mode est pris en charge par les sessions locales ordinaires et les sessions
démon normales, y compris les propriétaires de workspace secondaires. Les
sessions managées, SSH, dérivées/sous-agent et session-agent, ainsi que les
sessions avec l'enregistrement du chat désactivé, ne prennent pas en charge
les modifications de mode. Les sessions utilisant un protocole non pris en
charge n'annoncent pas cette capacité ou option. Une écriture échouée laisse
le mode publié inchangé.

## Comportement des rappels et des entrées

La première soumission éligible reçoit un rappel destiné uniquement au modèle.
Sans autre modification, des rappels espacés suivent aux soumissions 11 et 21,
puis toutes les dix soumissions éligibles. La désactivation ou la perte de
capacité envoie une notification de sortie lors de la prochaine soumission
éligible. Seul un envoi effectif au modèle consomme un rappel ou fait avancer
le compteur ; l'annulation ou le rejet avant l'envoi ne le fait pas. Les
tentatives de retry et les fallback partagent le même token de livraison. Si
l'annulation supprime un rappel de mode envoyé de l'historique du modèle, la
prochaine soumission éligible annonce à nouveau l'état actuel.

Les soumissions CLI, SDK et ACP ordinaires peuvent utiliser ce mode explicite
sans déclaration d'origine humaine. Les continuations d'outil, les retries,
les hooks, les prompts générés par slash command, le mode shell, les requêtes
latérales, les tours automatiques Goal/Cron/notification/channel, et les
sous-agents n'ajoutent pas de nouveau rappel de mode ni n'avancent son
compteur. La spéculation de prompt est mise en pause lorsque le mode ou une
transition non livrée a besoin de contexte.

Le [one-turn keyword hint](./workflow-intent.md) reste séparé. Son exigence de
provenance humaine et son paramètre opt-out restent inchangés. Un mot-clé
valide et un rappel de mode partagent une même enveloppe ; désactiver le mode
persistant ne désactive pas un mot-clé one-turn valide. Un rappel de mode seul
n'active pas l'indicateur de mot-clé transitoire ni la télémétrie de
mots-clés.

## Cycle de vie de la session

La reprise restaure le dernier enregistrement booléen valide sur la branche de
transcription sélectionnée et annonce une fois un état activé ou désactivé
enregistré. Une valeur initiale CLI ou SDK explicite remplace cette valeur
restaurée une seule fois, après que la session est prête. Des valeurs
initiales conflictuelles ou une valeur initiale activée lorsque les outils
Workflow sont indisponibles échouent à l'initialisation. Une session nouvelle
ou réinitialisée démarre désactivée. Un fork hérite de son checkpoint
sélectionné de manière indépendante ; le rewind préserve la préférence
actuelle et l'ancre dans la branche restaurée. Une compression réussie
réannonce l'état lors de la prochaine nouvelle soumission éligible. Après une
reprise échouée ou un changement de branche qui reconstruit l'historique de la
session précédente, la prochaine soumission éligible réannonce son état
enregistré. Une session sans préférence enregistrée reste silencieuse.

## TypeScript SDK et ACP

```ts
const session = query({
  prompt: messages(),
  options: { workflowMode: true },
});
const state = await session.getWorkflowMode();
await session.setWorkflowMode(false);
```

`workflowMode` est optionnel : son omission préserve une valeur reprise, tandis
que `false` enregistre explicitement désactivé. L'initialisation négocie et
prépare la valeur initiale ; `Query.initialized` est le handshake de contrôle.
Les opérations get/set attendent que la session soit prête. Les demandes
d'initialisation répétées sont rejetées pendant l'initialisation de la session.
Un CLI plus ancien rejette une demande de mode explicite avant le premier
prompt au lieu de l'ignorer silencieusement. Les transports personnalisés
utilisent le même protocole de contrôle.

ACP annonce une option de configuration standard `workflow_mode` avec les
valeurs `on` et `off`. Sa `currentValue` reflète l'état demandé, tandis que
`_meta['qwen.workflowMode']` contient `available`, `effective`, et une
`reason` optionnelle. Les modifications validées et les actualisations de
capacité publient les options complètes via `config_option_update`.

Les clients démon utilisent le point de terminaison session config-option
existant ou `setSessionConfigOption(sessionId, 'workflow_mode', 'on',
clientId)`. L'option n'accepte pas de surcharge `persist` : elle est toujours
persistante pour la session. La relecture de contexte et les mises à jour
appartiennent au propriétaire live de cette session, y compris ses
vérifications de bail et de génération. Les contrôles spécifiques Web/IDE ne
sont pas inclus dans cette implémentation.