# Statut d'exécution des outils

## Motivation

Le statut terminal d'appel d'outil décrit si l'appel global a réussi, échoué
ou a été annulé. Il ne dit pas si le dispatcher est réellement entré dans
`invocation.execute()`. Les échecs de validation, les rejets de permission,
les échecs d'exécution et les échecs post-exécution nécessitent donc un
résultat d'exécution séparé avant de pouvoir être mesurés précisément.

## Contrat

`ToolCallResponseInfo` porte un `executionStatus` optionnel pour la
compatibilité de source et d'enregistrement :

```ts
type ToolExecutionStatus = 'not_started' | 'success' | 'error' | 'cancelled';
```

L'ordonnanceur du cœur (`CoreToolScheduler`) et `Session.runTool` d'ACP
définissent toujours le champ. Les valeurs manquantes provenant
d'enregistrements plus anciens, de producteurs tiers et de projections de
résultats de sous-agents (le chemin `buildResponse` non interactif, qui
rejoue le résultat rapporté par un autre agent) deviennent `unknown`
uniquement à la frontière de télémétrie et ne sont jamais déduites du statut
d'appel terminal.

Les axes terminal et d'exécution sont intentionnellement indépendants :

| Statut terminal | Statut d'exécution | Exemple                                                                              |
| --------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `success`       | `success`        | Complétion d'outil normale                                                               |
| `success`       | `not_started`    | Réponse sœur synthétique au niveau du protocole                                            |
| `error`         | toute valeur        | Refus pré-exécution, erreur d'exécution, erreur de post-traitement ou override de hook de lot |
| `cancelled`     | toute valeur        | Annulation avant, pendant ou après l'exécution                                      |

En lisant chaque ligne comme une paire (terminal, exécution), les seules combinaisons invalides sont `success/error` et `success/cancelled` : un appel qui se termine en `success` ne peut porter que le statut d'exécution `success` ou `not_started`.
Le statut d'exécution est figé quand `invocation.execute()` se règle ; les
hooks, le bridage de résultats, la persistance et le traitement par lot ne
peuvent pas l'écraser. L'activation de PostToolBatch et son span d'outil
parent sont snapshotés quand un lot de l'ordonnanceur démarre, de sorte qu'une
reconfiguration des hooks au runtime affecte le lot suivant plutôt que de
modifier le comportement de complétion d'un lot en cours.

## Télémétrie

L'événement normalisé `tool_call` ajoute `call_id` et `execution_status`. La
normalisation intervient une fois avant tous les exutoires :

- les noms d'outil vides deviennent `unknown_tool` ;
- `success` est recalculé depuis le `status` terminal ;
- les erreurs terminales sans type d'erreur utilisent `unknown` ;
- les succès et annulations omettent les champs d'erreur au niveau de
  l'appel ;
- un statut d'exécution manquant devient `unknown`.

La dimension de `status` terminal sur `qwen-code.tool.call.count`, établie par
le contrat de télémétrie terminal, est inchangée par ce design. Un nouveau
compteur `qwen-code.tool.execution.count` utilise uniquement les dimensions
spécifiques à l'événement `execution_status` et `tool_type`. Les attributs de
métrique communs configurés globalement, comme l'opt-in `session.id`, peuvent
aussi être présents. Le taux d'échec d'exécution est :

```text
execution_status = error
────────────────────────────────────────
execution_status in {success, error}
```

L'annulation, `not_started` et `unknown` sont exclus. Le type d'erreur, le nom
de fonction, l'ID d'appel, les messages et les noms de serveurs MCP restent
dans les logs ou les spans plutôt que dans les labels de métrique. Le compteur
omet délibérément `function_name`, de sorte qu'un taux d'échec d'exécution ne
peut pas être attribué à un outil spécifique depuis la métrique seule ;
approfondissez via les logs `tool_call`, qui portent à la fois `call_id` et
`function_name`.

Un span d'exécution n'existe qu'après que le dispatcher a tenté `execute()`.
Il enregistre l'identité de l'outil, le statut d'exécution figé et le type
d'erreur d'exécution. Les spans d'outil parent continuent de représenter le
statut d'appel terminal, et les spans annulés restent unset plutôt que error.
Le cœur ouvre le span parent après la résolution de l'outil et la validation
de l'invocation ; les chemins terminaux plus précoces sont couverts par
l'événement normalisé et le compteur d'exécution et ne synthétisent pas un
span depuis un nom de requête non résolu.

QwenLogger reçoit le statut terminal normalisé, le statut d'exécution, l'ID
d'appel et le type d'outil, mais pas les noms de serveurs MCP ni les arguments
de fonction. Les noms de serveurs MCP restent en dehors de QwenLogger et sont
disponibles pour les exportateurs de logs et de spans de télémétrie
configurés.

## Compatibilité et périmètre

Les champs publics de réponse et d'événement restent optionnels. Les
producteurs intégrés utilisent une forme interne requise, tandis que les
anciens enregistrements JSONL ne sont ni migrés ni rétro-remplis. Les nouveaux
enregistrements JSONL incluent `executionStatus` sur les résultats d'outil
enregistrés ; le champ est additif, donc les lecteurs de relecture qui
ignorent les champs inconnus ne sont pas affectés. Les projections
d'enregistrement manuelles dans le cœur, ACP, la TUI et les modes non
interactifs copient le nouveau scalaire sans l'exposer dans la sortie JSON
destinée à l'utilisateur. Un appel annulé avant la résolution de l'outil peut
omettre `tool` et `invocation` de la variante publique `CancelledToolCall`,
de sorte que les consommateurs de cette variante doivent vérifier ces champs
avant utilisation. Quand une telle annulation pré-résolution est émise par la
télémétrie, `tool_type` vaut par défaut `"native"` car l'identité de l'outil
n'est pas encore résolue ; c'est un biais connu de la dimension `tool_type`
pour les annulations pré-validation.

Les erreurs d'exécution par appel ne rejettent plus
`CoreToolScheduler.schedule()` ; le résultat est livré via les callbacks
existants de mise à jour et de complétion comme un appel terminal `error`, de
sorte que l'échec d'un outil n'aborte pas ses frères. La méthode retourne
toujours `Promise<void>` et peut rejeter pour des échecs de mise en place ou
de file au niveau de l'ordonnanceur. `handleConfirmationResponse()` terminalise
les erreurs du flux de confirmation avant de les relancer, préservant son
signal d'échec existant sans laisser un appel en `awaiting_approval`. Les
intégrateurs doivent lire le `status` terminal et `executionStatus` depuis
les appels livrés par callback, et non attendre de l'un des deux points
d'entrée publics qu'il retourne des appels terminés.

La première release couvre `CoreToolScheduler` et `Session.runTool` d'ACP. La
spéculation, l'exécution directe de `/fork`, les retries internes à MCP, la
réconciliation provisoire des résultats de sous-agents, les métadonnées de
sortie du shell, la possibilité de retry, la propriété et les phases
d'échec génériques restent hors du périmètre.

Le cœur et ACP doivent être livrés ensemble. Les tableaux de bord doivent
basculer par heure de déploiement ou `service.version`, surveiller `unknown`
séparément et ne jamais utiliser la métrique legacy `success` comme SLI
d'échec d'exécution.

## Risques de maintenance connus

L'invariant d'annulation pré-exécution (« chaque `await` dans le chemin
pré-exécution est suivi d'une vérification d'abandon ») est appliqué par des
vérifications placées à la main à chaque point d'appel dans
`CoreToolScheduler` et `Session.runTool` plutôt que par un mécanisme
structurel. Ajouter un nouvel `await` à l'un des deux chemins sans
vérification suivante réintroduit silencieusement le bug d'exécution obsolète
que ce design corrige. Un futur refactor devrait envelopper les awaits dans un
helper gardé ; d'ici là, les relecteurs de ces chemins doivent vérifier
l'invariant manuellement.
