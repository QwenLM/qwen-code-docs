# Sémantique des erreurs de timeout du shell

## Problème

Les commandes Shell au premier plan décrivent actuellement un timeout en texte mais renvoient un `ToolResult` réussi. Le code en aval enregistre donc l'appel comme réussi, envoie une réponse de fonction avec un champ `output`, et peut rendre un indicateur de succès alors même que la commande ne s'est pas terminée. Une annulation qui arrive après le timeout peut aussi écraser la raison d'origine. Durant la découverte PTY, un appel déjà interrompu peut encore lancer un processus car le service d'exécution n'observe le signal qu'après le démarrage.

## Contrat de résultat

Un timeout au premier plan possédé par Shell renvoie `ToolErrorType.EXECUTION_TIMEOUT`. Le résultat utilise trois canaux intentionnellement distincts :

| Canal           | Public                                  | Contenu du timeout                                                                             |
| --------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `error.message` | Hooks, télémétrie, spans, logs, alerting | Uniquement un court résumé du timeout                                                          |
| `llmContent`    | Réponse de fonction du modèle           | Résumé du timeout, sortie partielle ou déclaration explicite de non-sortie, et tout pointeur de troncature |
| `returnDisplay` | Historique interactif et clients ACP    | Résumé du timeout, sortie partielle ou déclaration de non-sortie, et tout pointeur de troncature |

Le planificateur convertit le `llmContent` de timeout en une réponse de fonction dont la `response` a un champ `error` et pas de champ `output`. Le contexte additionnel du hook d'échec est ajouté une seule fois à cette erreur destinée au modèle. Le `ToolCallResponseInfo.error` de premier niveau reste le court résumé opérationnel afin que la sortie de commande ne soit pas copiée dans la télémétrie ou les arguments d'erreur des hooks.

Les autres erreurs d'outil douces conservent leur comportement existant du planificateur Core. ACP et l'exécution spéculative encodent systématiquement toutes les erreurs douces avec une enveloppe d'erreur, car ces chemins invoquent les outils directement et n'ont sinon aucune étape de classification par le planificateur.

## Règles de cause première

`AbortSignal.any()` préserve la raison du premier signal qui interrompt. La classification Shell lit uniquement la raison du signal combiné après l'exécution :

- Un `TimeoutError` plus une exécution interrompue est un timeout.
- Une raison de promotion en arrière-plan plus une exécution interrompue et non promue est la course existante de promotion refusée.
- Toute autre exécution interrompue est une annulation.
- Un timeout qui survient en premier n'est pas modifié par une annulation utilisateur ou une demande de promotion ultérieure.
- Une annulation ou une demande de promotion qui survient en premier n'est pas modifiée par un timeout ultérieur.

Le planificateur Core a un second timer d'exécution global, optionnel. Un timeout structuré renvoyé par un outil reste un timeout même si le signal parent est interrompu avant que le planificateur ne consomme le résultat. Lorsque le propre timer du planificateur fournit le résultat de timeout, il ne gagne que si le signal parent n'était pas déjà interrompu au moment où le timer s'est déclenché. Une annulation parente suivie du déclenchement du timer contre un outil non coopératif reste une annulation.

ACP applique la même règle pour les timeouts d'outil structurés : le timeout est une erreur plutôt qu'une interruption même si son signal parent est observé comme interrompu par la suite. Les exceptions levées continuent d'utiliser l'état d'interruption live.

## Comportement au démarrage

`ShellExecutionService.execute()` renvoie immédiatement un handle interrompu, sans processus, lorsque son signal est déjà interrompu. La découverte PTY fait la course avec le signal via `getPty()` et retire son listener temporaire après la course. Si l'interruption gagne, une résolution ou un rejet PTY ultérieur est consommé sans lancer de PTY ni retomber sur `child_process`. Le résultat renvoyé utilise `executionMethod: 'none'` et n'a pas de pid.

Ce comportement affecte tous les consommateurs du service dans le dépôt : la plomberie Shell au premier plan et en arrière-plan, le Shell `!` utilisateur, l'injection de commande du prompt, la gestion du shell du bridge ACP et les sondes d'attribution git. Le seul changement de comportement est qu'une requête déjà interrompue ne démarre plus de processus.

## Comportement des consommateurs

| Consommateur                        | Comportement au timeout                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Planificateur Core                  | `status: error`, courte erreur de premier niveau, `response.error` détaillé, type d'échec timeout                  |
| Session ACP                         | Mise à jour d'outil échoué, enveloppe d'erreur détaillée dans l'historique modèle et l'enregistrement, métadonnées opérationnelles courtes |
| Exécution spéculative               | Enveloppe d'erreur détaillée ; l'historique spéculatif accepté rend Error                                          |
| Adaptateur Anthropic                | `tool_result.is_error: true`                                                                                       |
| Adaptateurs compatibles OpenAI      | Texte d'erreur détaillé explicite ; il n'existe pas de bit d'erreur au niveau du protocole                         |
| JSON et stream-json                 | `is_error: true` avec le contenu d'erreur imbriqué détaillé préféré au court résumé                                |
| Estimation de contexte et budget de lot | Les textes de `response.output` et de `response.error` sont tous deux comptés ; les erreurs trop volumineuses conservent la clé error lors du déchargement |

La microcompaction continue de laisser intacts les résultats d'outil échoués. La compression complète du chat voit désormais la taille de l'erreur détaillée et peut se déclencher au bon budget.

## Comparaison avec Claude Code

Claude Code traite un timeout de commande comme un résultat d'outil échoué, conserve la sortie produite avant la fin pour le modèle et l'utilisateur, et marque le résultat d'outil comme une erreur dans le protocole Anthropic. Ce design adopte ces propriétés observables tout en conservant la forme `ToolResult` existante de qwen-code et ses conventions de télémétrie. Il ne copie pas la sortie de commande dans le court canal d'erreur opérationnelle.

## Compatibilité et observabilité

Il s'agit d'une correction intentionnelle au niveau du fil. Les échecs doux ACP et spéculatifs passent de `{ output }` à `{ error }` ; Core ne change cette forme que pour `EXECUTION_TIMEOUT`. Les comptages de timeout passent des métriques de succès aux métriques d'erreur/timeout et les hooks d'échec remplacent les hooks de succès. Aucun changement de schéma, d'enum d'erreur, de timeout par défaut, de migration ou de flag de déploiement.

La sortie de commande partielle peut contenir des données sensibles. Elle reste disponible pour le modèle, le résultat interactif, l'enregistrement du chat et la sortie JSON explicite, comme avant la correction de classification. Elle n'est pas ajoutée aux arguments d'erreur des hooks, aux erreurs de premier niveau, aux attributs de résultat des spans, ni aux résumés des logs opérationnels. Les limites existantes de troncature et de déversement sur disque s'appliquent au canal modèle détaillé.

## Hors périmètre

- Les heartbeats ou rapports de progression périodiques
- Les gardes d'arrêt de todo ou changements de prompt
- La sémantique des codes de sortie non nuls
- La sémantique de terminaison par signal externe
- Les timeouts du Shell en arrière-plan
- L'attente de sortie partielle après que le timer global du planificateur a gagné
- Les nouveaux paramètres de timeout ou champs de protocole

## Vérification

La couverture unitaire exerce les courses pré-interrompues et de découverte PTY, l'ordre timeout/annulation/promotion de Shell, la simulation sed, les canaux court et détaillé du planificateur, l'ordre du timeout global Core, l'invocation directe ACP et spéculative, la conversion Anthropic, la sélection de contenu JSON, l'estimation de taille d'erreur et le déchargement de lot. Le plan E2E est consigné dans `.qwen/e2e-tests/shell-timeout-semantics.md`.
