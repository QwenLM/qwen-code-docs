# Backpressure de la file d'attente des prompts

## Résumé

`qwen serve` applique désormais un backpressure d'admission des prompts par session. La limite par défaut est de `5` prompts en attente par session. Un prompt en attente est un prompt que le démon a accepté via `sendPrompt` et qui n'est pas encore résolu, incluant les prompts en attente dans la FIFO par session et le prompt en cours d'exécution.

`branchSession` reste sérialisé derrière la même FIFO par session, mais ce n'est pas un prompt et ne consomme pas cette limite de prompts.

## Sémantique

- Par défaut : `maxPendingPromptsPerSession = 5`.
- Désactivé : `0` ou `Infinity` signifie illimité.
- Invalide : les nombres négatifs, les fractions et `NaN` sont rejetés par la construction du bridge et `runQwenServe`. Le flag CLI accepte les entiers non négatifs ; `0` désactive la limite.
- Autorité : le bridge est la porte d'admission. Le comptage côté SDK agit comme un garde-fou d'échec précoce, et ne remplace pas l'application des règles côté serveur.
- Délai du prompt : `--prompt-deadline-ms` s'applique toujours uniquement aux prompts qui ont déjà été acceptés. Ce n'est pas une limite d'admission dans la file d'attente.

## Comportement du bridge

`SessionEntry` suit `pendingPromptCount`. `sendPrompt` n'est volontairement pas `async`, afin que la vérification d'admission puisse lever une exception de manière synchrone avant que les routes HTTP ne retournent `202 Accepted`.

Flux d'admission :

1. Rechercher la session.
2. Rejeter les signaux pré-abortés avant d'incrémenter le compteur.
3. Si `pendingPromptCount >= maxPendingPromptsPerSession`, lever `PromptQueueFullError`.
4. Incrémenter le compteur et mettre le prompt en file d'attente dans la FIFO.
5. Libérer l'emplacement exactement une fois lorsque la promesse du prompt visible par l'appelant est résolue.

Les échecs ne corrompent pas la FIFO car la file d'attente absorbe toujours chaque résultat de prompt. L'appelant d'origine reçoit toujours le rejet du prompt.

## Comportement HTTP

`POST /session/:id/prompt` intercepte l'erreur synchrone `PromptQueueFullError` avant d'émettre une réponse d'acceptation. La route retourne :

- Statut : `503`
- En-tête : `Retry-After: 5`
- Corps : `{ code: 'prompt_queue_full', error, sessionId, limit, pendingCount }`

Aucun `promptId` n'est retourné en cas d'échec d'admission.

`/capabilities` annonce :

```json
{
  "limits": {
    "maxPendingPromptsPerSession": 5
  }
}
```

Lorsque la limite est désactivée, la valeur annoncée est `null`.

## Comportement HTTP ACP

Le transport ACP JSON-RPC mappe `PromptQueueFullError` vers une structure d'erreur stable au lieu de laisser remonter une erreur interne non structurée :

```json
{
  "data": {
    "errorKind": "prompt_queue_full",
    "sessionId": "...",
    "limit": 5,
    "pendingCount": 5
  }
}
```

## Comportement du SDK

`DaemonClient` possède une réservation locale par session pour les appels à `prompt()`. Il réserve avant d'envoyer la requête HTTP et libère la réservation lors :

- de la complétion bloquante historique `200`,
- de la complétion non bloquante du tour `202`,
- de `turn_error`,
- de l'annulation par l'appelant,
- de la fin du SSE,
- ou d'un échec de fetch ou d'analyse de la réponse.

`DaemonPendingPromptLimitError` signifie que le SDK a rejeté la requête localement et n'a pas envoyé la requête du prompt.

L'option SDK accepte directement la valeur numérique de la capacité ; `null` désactive la limite locale pour correspondre à `/capabilities.limits.maxPendingPromptsPerSession`.

`DaemonSessionClient` applique la même limite locale pour le chemin d'abonnement de longue durée. Les méthodes statiques `createOrAttach`, `load` et `resume` conservent leurs positions de paramètres existantes ; la construction directe peut remplacer la limite locale.