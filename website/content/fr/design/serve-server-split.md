# Découpage par étapes de serve server.ts

## Objectif

Découper `packages/cli/src/serve/server.ts` par étapes sans modifier le comportement du daemon. La première étape extrait les helpers partagés et les groupes de routes dont les limites sont déjà claires, tout en laissant `createServeApp()` responsable du câblage des middlewares, des dépendances avec état, des montages de transport et de la gestion finale des erreurs.

## Ordre des middlewares et des routes

L'ordre d'assemblage de l'application fait partie du comportement public et doit rester stable :

1. Suppression de l'en-tête `Origin` same-origin
2. CORS et liste d'autorisation des hôtes
3. `/health` et `/demo` pré-authentification sur les configurations loopback autorisées
4. Journalisation des accès
5. Assets statiques du Web Shell
6. Authentification bearer
7. Limitation de débit
8. Parseur de corps JSON et mappeur d'erreurs du parseur JSON
9. `/health` et `/demo` post-authentification lorsque requis
10. Télémétrie du daemon
11. Groupes de routes REST
12. Routes HTTP et WebSocket ACP
13. Fallback du Web Shell
14. Gestionnaire d'erreurs final

## Limites extraites

`server/request-helpers.ts` gère la sanitisation du corps des requêtes, le parsing des client-id, la détection de loopback, les validateurs de chemin/requête et le parsing du corps des votes de permissions. Les modules de routes dépendent de ce fichier au lieu d'importer depuis `server.ts`.

`server/error-response.ts` gère la taxonomie des erreurs du bridge et le mapping des réponses HTTP. Les wrappers exportés acceptent un logger de daemon optionnel afin que les modules de routes puissent conserver le comportement existant de stderr et du daemon-log.

`server/session-list.ts` gère la fusion de la liste des sessions persistées et en direct utilisée à la fois par les appelants REST et ACP HTTP.

`server/fs-factory.ts` gère la construction de la factory du système de fichiers de l'espace de travail par défaut et l'émission des avertissements d'audit fs.

`server/telemetry.ts` gère la classification des routes et le middleware de télémétrie HTTP du daemon.

`server/prompt-deadline.ts` gère la résolution des délais de prompt et sa classe sentinelle d'annulation.

Les modules de routes suivent le style existant `registerXRoutes(app, deps)`. Ils ne reçoivent que les dépendances dont ils ont besoin, et non un contexte global unique.

## Non-objectifs

Cette étape ne modifie pas les corps de réponse, les codes de statut, les en-têtes, le format des trames SSE, l'ordre d'authentification ou la taxonomie des erreurs. Elle ne supprime pas les shims de réexportation de compatibilité tels que `status.ts`, `event-bus.ts` ou `in-memory-channel.ts`. Elle ne renomme pas les documents historiques ni ne nettoie les chemins camelCase sans rapport.

`server.ts` peut rester sur plus de 200 lignes après cette étape. Le critère d'acceptation est la stabilité des limites, ce qui rendra l'extraction ultérieure des sessions et des SSE mécanique.

## Notes d'audit

Le tour 1 a vérifié les limites de l'architecture et rejeté une nouvelle abstraction Router car les modules de routes existants utilisent déjà des fonctions directes `registerXRoutes(app, deps)`.

Le tour 2 a vérifié les chemins d'échec et a conservé la taxonomie des erreurs dans un seul helper afin que l'extraction des routes ne puisse pas faire dériver silencieusement les codes de statut HTTP.

Le tour 3 a vérifié la compatibilité et conserve les exports publics consommés par `run-qwen-serve.ts`, le dispatch HTTP ACP et les tests.

Le tour 4 a vérifié la stratégie de test et s'appuie sur les tests ciblés `server.test.ts`, ACP HTTP et les tests de routes, car il s'agit d'un refactoring structurel sans changement de comportement visible par l'utilisateur.