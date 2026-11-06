# Mode Workflow de session


Le mode Workflow enregistre une préférence pour prendre en compte l'outil Workflow lors
des nouvelles soumissions ordinaires dans la session en cours. Il est désactivé par
défaut. Le modèle décide toujours si un workflow est utile, et toutes les restrictions
de permission, de confiance, de budget et d'outil continuent de s'appliquer. Activer le
mode ne démarre pas une exécution, ne modifie pas l'effort de raisonnement, ni vos
paramètres par défaut.

Les outils Workflow sont opt-in. Activez `tools.workflowsEnabled` dans les paramètres ou
définissez `QWEN_CODE_ENABLE_WORKFLOWS=1` avant d'activer le mode :

```sh
QWEN_CODE_ENABLE_WORKFLOWS=1 qwen --workflow-mode on
qwen --resume <session-id> --workflow-mode off
```

Démarrer avec `--workflow-mode on` alors que les outils sont indisponibles échoue à
l'initialisation. `QWEN_CODE_DISABLE_WORKFLOWS=1` prend le pas sur leur activation.

Dans n'importe quel renderer de terminal, utilisez `/workflows mode` ou
`/workflows mode status` pour lire l'état, et `/workflows mode on` ou
`/workflows mode off` pour le modifier. Ces contrôles de mode peuvent s'exécuter pendant
qu'une réponse est en cours de streaming ; ils affectent les soumissions éligibles
suivantes. Le pied de page affiche `Workflow mode: on`, ou `Workflow mode: on (unavailable)` si la préférence enregistrée ne peut pas être appliquée actuellement. La liste
d'exécution `/workflows` et les contrôles de pause existants conservent leur comportement
original.

L'état sépare `requested` (la préférence enregistrée), `available` (les outils requis
sont actuellement utilisables), et `effective` (les deux sont vrais). Activer nécessite
que les outils Workflow soient disponibles. Désactiver reste possible quand ils sont
indisponibles. Perdre un outil n'efface pas une préférence activée enregistrée ;
restaurer l'outil rend cette préférence effective à nouveau.

Le mode est pris en charge par les sessions locales ordinaires et les sessions démon
normales, y compris les propriétaires de workspace secondaires. Les sessions managées,
SSH, dérivées/sous-agent et session-agent, et les sessions avec l'enregistrement de chat
désactivé, ne prennent pas en charge les modifications de mode. Les sessions de protocole
non pris en charge n'annoncent pas la capacité ni l'option. Une écriture échouée laisse
le mode publié inchangé.

## Web Shell et VS Code

Le composer dans Web Shell, les panneaux divisés, et le chat moderne VS Code listent
**Workflow** dans son menu **+** pour les sessions prises en charge. La coche montre la
préférence enregistrée, pas si le mode peut actuellement prendre effet ; sur des écrans
plus larges, une deuxième ligne résume ce que fait le mode ou son état actuel. Pendant
que la préférence est activée, la barre d'outils affiche un **Workflow** chip ; son
info-bulle porte les détails de statut, et cliquer dessus désactive le mode. Si la
préférence est activée mais les outils sont indisponibles, l'entrée reste cochée, le
chip est affiché dans la couleur d'avertissement, et les deux peuvent toujours désactiver
le mode.

Avant qu'une session soit créée ou restaurée, le contrôle affiche un placeholder de
disponibilité. Il ne crée pas de session ni n'enregistre de préférence future. Les hôtes
qui n'annoncent pas la prise en charge, y compris les anciens serveurs, masquent
l'entrée. Les hôtes qui masquent le menu **+** n'affichent ni l'entrée ni le chip.

Les modifications d'un autre client mettent à jour automatiquement le contrôle de la même
session. Pendant une écriture ou une reconnexion, la dernière valeur confirmée reste
visible et l'entrée et le chip sont désactivés jusqu'à ce que l'état soit confirmé. Un
timeout est un résultat non confirmé, pas un changement réussi ; le client lit l'état
actuel au lieu de répéter automatiquement l'écriture. Une réponse active ne désactive pas
l'entrée ni le chip : le changement s'applique au prochain tour frais et laisse l'effort
inchangé.

## Comportement de rappel et d'entrée

La première soumission éligible reçoit un rappel uniquement pour le modèle. Sans d'autres
changements, les rappels clairsemés suivent sur les soumissions 11 et 21, puis toutes les
dix soumissions éligibles. Désactiver ou perdre la capacité envoie une notification de
sortie sur la prochaine soumission éligible. Seul un dispatch de modèle effectif consomme
un rappel ou avance le compteur ; l'annulation ou le rejet avant le dispatch ne le fait
pas. Les tentatives de retry et de fallback partagent le même token de livraison. Si
l'annulation supprime un rappel de mode dispatché de l'historique du modèle, la prochaine
soumission éligible annonce à nouveau l'état actuel.

Les soumissions CLI, SDK et ACP ordinaires peuvent utiliser ce mode explicite sans
déclaration d'origine humaine. Les continuations d'outil, les retries, les hooks, les
prompts générés par slash command, le mode shell, les requêtes latérales, les tours
automatiques Goal/Cron/notification/channel, et les sous-agents n'ajoutent pas de nouveau
rappel de mode ni n'avancent son compteur. La spéculation de prompt est mise en pause
pendant que le mode ou une transition non livrée nécessite du contexte.

L'[indice de mot-clé à un tour](./workflow-intent.md) reste séparé. Son exigence de
provenance humaine et son paramètre opt-out sont inchangés. Un mot-clé valide et un
rappel de mode partagent une même enveloppe ; désactiver le mode persistant ne désactive
pas un mot-clé à un tour valide. Un rappel de mode uniquement n'active pas l'indicateur
de mot-clé transitoire ni la télémétrie de mot-clé.

## Cycle de vie de la session

La reprise restaure le dernier enregistrement booléen valide sur la branche de
transcription sélectionnée et annonce un état activé ou désactivé enregistré une fois.
Une valeur initiale CLI ou SDK explicite remplace cette valeur restaurée une fois, après
que la session est prête. Des valeurs initiales conflictuelles ou une valeur initiale
activée alors que les outils Workflow sont indisponibles échouent à l'initialisation.
Une session nouvelle ou effacée démarre désactivée. Un fork hérite de son checkpoint
sélectionné indépendamment ; le rewind préserve la préférence actuelle et l'ancre dans la
branche restaurée. Une compression réussie réannonce l'état sur la prochaine soumission
fraîche éligible. Après une reprise échouée ou un changement de branche qui reconstruit
l'historique de la session précédente, la prochaine soumission éligible réannonce son
état enregistré. Une session sans préférence enregistrée reste silencieuse.

## SDK TypeScript et ACP

```ts
const session = query({
  prompt: messages(),
  options: { workflowMode: true },
});
const state = await session.getWorkflowMode();
await session.setWorkflowMode(false);
```

`workflowMode` est optionnel : l'omission préserve une valeur reprise, tandis que `false`
enregistre explicitement désactivé. L'initialisation négocie et prépare la valeur
initiale ; `Query.initialized` est le handshake de contrôle. Les opérations get/set
attendent la disponibilité de la session. Les demandes d'initialisation répétées sont
rejetées pendant que l'initialisation de session est en cours. Un ancien CLI rejette une
demande de mode explicite avant le premier prompt au lieu de l'ignorer silencieusement.
Les transports personnalisés utilisent le même protocole de contrôle.

ACP annonce une option de configuration standard `workflow_mode` avec les valeurs `on` et
`off`. Son `currentValue` reflète l'état demandé, tandis que
`_meta['qwen.workflowMode']` contient `available`, `effective`, et une `reason`
optionnelle. Les changements commités et les actualisations de capacité publient les
options complètes via `config_option_update`.

Les clients démon utilisent le point de terminaison existant de session config-option ou
`setSessionConfigOption(sessionId, 'workflow_mode', 'on', clientId)`. L'option n'accepte
pas un override `persist` : elle est toujours persistante par session. La relecture de
contexte et les mises à jour appartiennent au propriétaire live de cette session, y
compris ses vérifications de bail et de génération. Web Shell et l'hôte moderne VS Code
consomment ces mêmes contrôles et mises à jour de session.