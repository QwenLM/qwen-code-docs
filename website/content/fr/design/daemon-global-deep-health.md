# Deep health global du démon

## Problème

`GET /health?deep=1` a été introduit lorsque le démon possédait un seul
runtime de workspace. La route était toujours câblée au bridge primaire après
l'arrivée du support multi-workspaces, de sorte que ses compteurs pouvaient
signaler le démon comme inactif alors qu'un workspace secondaire avait des
sessions, des prompts ou des permissions en attente.

L'endpoint shallow est intentionnellement différent : `GET /health` prouve
uniquement que le listener peut répondre. Il doit rester léger et ne doit pas
accéder à l'état du runtime.

## Décision

Le deep health est un snapshot informationnel à l'échelle du démon. Il agrège
tous les runtimes renvoyés par `WorkspaceRegistry.listManaged()`, y compris
les workspaces en cours de drain dont le nettoyage du bridge n'est pas
terminé.

| Champ                | Agrégation                                                  |
| -------------------- | ----------------------------------------------------------- |
| `workspaceCount`     | Nombre de runtimes gérés dans le snapshot                   |
| `sessions`           | Somme                                                       |
| `pendingPermissions` | Somme                                                       |
| `activePrompts`      | Somme                                                       |
| `connectedClients`   | Comptage SSE REST existant à l'échelle du démon             |
| `channelAlive`       | Vrai lorsque n'importe quel canal d'un runtime géré est live |
| `lastActivityAt`     | Heure d'activité de bridge non nulle la plus récente        |
| `idleSinceMs`        | Un snapshot `Date.now()` moins l'heure d'activité la plus récente |
| `rateLimitHits`      | Comptages optionnels existants du rate-limit à l'échelle du démon |

La route lit les getters requis de chaque runtime avant de combiner les
valeurs. Elle ne court-circuite pas les lectures de canaux. Si le registre ou
un getter lève une exception, la sonde deep entière échoue avec
`503 {"status":"degraded","reason":"aggregation_failed"}` plutôt que de
renvoyer un snapshot partiel. Les échecs de getter identifient le runtime de
workspace dans le log stderr du démon sans exposer cet identifiant dans la
réponse HTTP.

Tant que le listener de bootstrap est actif mais que le registre de runtimes
n'est pas prêt, une requête deep renvoie un corps dégradé avec
`reason: "bootstrap"` et `Retry-After: 1`. Dans le mode de démarrage
health-first, compléter cette réponse déclenche tout de même le démarrage du
runtime. La réponse shallow de bootstrap reste
`200 {"status":"ok"}`.

## Compatibilité et limites

- `deep=1`, `deep=true` et `deep` nu activent le snapshot ; toutes les autres
  valeurs utilisent le health shallow.
- Les réponses deep à un seul workspace conservent leurs valeurs existantes et
  ajoutent `workspaceCount: 1`.
- L'authentification, l'allowlist d'hôtes, CORS et le comportement du
  rate-limit ne changent pas.
- La réponse n'expose aucun ID de workspace, chemin, état de confiance, ni
  détail par workspace.
- Aucun changement de capacité ou de SDK n'est requis. `workspaceCount` permet
  aux consommateurs d'identifier le contrat global du démon.

Le deep health n'est pas une vérification de disponibilité de tous les
workspaces et n'est pas un bail atomique de récupération. Les accesseurs des
compteurs ne pinguent pas les processus enfants, et `connectedClients` ne
représente que le SSE REST. Un récupérateur devrait exiger des échantillons
d'inactivité répétés et un arrêt gracieux ; les opérateurs ayant besoin de
diagnostics du transport ou par workspace devraient utiliser l'endpoint
authentifié `/daemon/status`.

## Alternatives rejetées

- Agréger uniquement `WorkspaceRegistry.list()` masquerait les runtimes en
  cours de drain avant la fin du nettoyage de leur bridge et pourrait signaler
  l'inactivité trop tôt.
- Réutiliser `/daemon/status` ferait dépendre le health d'un snapshot plus
  lourd avec un périmètre de workspaces actifs et un contrat d'échec
  différents.
- Ajouter un sélecteur de workspace préserverait un problème de fan-out côté
  appelant et ne satisferait pas la détection d'inactivité au niveau du démon.
- Définir `channelAlive` comme « tous les canaux live » changerait
  silencieusement sa signification existante compatible avec daemon-status.
  Les échecs par workspace relèvent de `/daemon/status`.
