# Découpage final de serve server.ts

## Objectif

Poursuivre le découpage par étapes de `packages/cli/src/serve/server.ts` sans modifier le comportement du daemon. Cette passe déplace les gestionnaires REST inline restants, les petits helpers de middleware, la construction des capacités, la configuration du registre device-flow et la configuration du rate-limiter vers des modules internes dédiés. `createServeApp()` reste le point de composition pour l'état du daemon, l'ordre des middlewares, l'enregistrement des routes, le montage du transport ACP, le fallback du Web Shell et la gestion finale des erreurs.

## Ordre des middlewares et des routes

L'ordre d'assemblage fait partie du contrat du daemon et doit rester vérifiable visuellement dans `createServeApp()` :

1. suppression de l'`Origin` same-origin
2. CORS et liste d'autorisation des hôtes
3. `/health` et `/demo` pré-authentification sur les configurations loopback autorisées
4. journalisation des accès
5. assets statiques du Web Shell
6. authentification bearer
7. rate limit
8. parseur de corps JSON et mappeur d'erreurs du parseur JSON
9. `/health` et `/demo` post-authentification lorsque requis
10. télémétrie du daemon
11. groupes de routes REST
12. routes HTTP et WebSocket ACP
13. fallback du Web Shell
14. gestionnaire d'erreurs final

## Limites extraites

`server/self-origin.ts`, `server/access-log.ts`, `server/rate-limiter-setup.ts` et `server/error-handlers.ts` possèdent de petits blocs de middleware/configuration qui résidaient précédemment en ligne dans `createServeApp()`. Ils sont volontairement légers et conservent le même ordre d'enregistrement dans `server.ts`.

`server/serve-features.ts` possède la liste des codes de langue, le cache de capacité de transcription vocale et la construction de l'entrée de l'enveloppe de fonctionnalités annoncées. Sa fonction d'invalidation de cache est toujours appelée par les chemins de rechargement/modification des paramètres du workspace.

`server/device-flow-registry.ts` possède l'enregistrement du fournisseur OAuth Qwen par défaut, le câblage du event sink, les breadcrumbs d'audit stderr et l'installation du registre `app.locals`.

`routes/capabilities.ts` possède `GET /capabilities`.

`routes/workspace-mcp-control.ts` possède les mutations de redémarrage/gestion/ajout/suppression au runtime MCP.

`routes/workspace-lifecycle.ts` possède `/workspace/init` et `/workspace/reload`.

`routes/workspace-tools.ts` possède `/workspace/tools/:name/enable`.

Chaque module de route ne reçoit que les dépendances dont il a besoin. Aucun des nouveaux modules n'importe `server.ts`, ce qui maintient la direction des dépendances à sens unique et évite les cycles.

## Ce qui reste dans `server.ts`

`server.ts` conserve la création de l'application, la canonicalisation du bound-workspace, la construction du bridge/filesystem/workspace, la création des portes de mutation, l'ordre des routes, le montage HTTP/WebSocket ACP, le placement des statiques/fallback du Web Shell, et les exports de compatibilité consommés par les appelants existants.

Il n'est pas demandé que ce fichier passe sous la barre des 200 lignes dans cette PR. Le critère d'acceptation est qu'il ne contient plus de gestionnaires de points de terminaison REST inline et qu'il se lit comme un fichier d'assemblage dont l'ordre comportemental peut être vérifié en un seul endroit.

## Non-objectifs

Cette passe ne modifie pas les corps de réponse, les codes de statut, les en-têtes, les trames SSE, le comportement ACP, les portes d'authentification, les niveaux de rate-limit, la sémantique du device-flow ou la taxonomie des erreurs. Elle ne supprime pas les shims de compatibilité de `status.ts`, `event-bus.ts` ou `in-memory-channel.ts`. Elle ne renomme pas les documents historiques et n'introduit pas de framework Router ni de contexte global pour les routes.

## Notes d'audit

Le tour 1 a vérifié les limites de l'architecture et a conservé le modèle existant `registerXRoutes(app, deps)` au lieu d'ajouter une abstraction Router.

Le tour 2 a vérifié la direction des dépendances et a déplacé la configuration du device-flow/runtime derrière des helpers sans laisser aucun module de route importer `server.ts`.

Le tour 3 a vérifié les chemins d'échec et a conservé le mappage des erreurs du bridge, les erreurs du parseur de corps JSON, les portes de mutation strictes et les sites d'appel de validation du client-id en préservant le comportement.

Le tour 4 a vérifié la compatibilité et a conservé les exports publics de `server.ts` pour `run-qwen-serve.ts`, les appelants HTTP ACP et les tests.

Le tour 5 a vérifié la stratégie de test et utilise des `server.test.ts` ciblés, des tests de routes, des tests HTTP ACP, le typecheck, le build, le lint, le grep des endpoints inline et `git diff --check`.