# Registre de la phase 1 du daemon multi-espaces de travail

## Résumé

La phase 1 introduit le registre interne à runtime unique pour `qwen serve` ainsi que les deux garde-fous désormais mentionnés dans l'issue #6378 : l'identité à l'échelle du daemon et la gestion de l'argument `--workspace` répétable. Le daemon ne sert toujours qu'un seul espace de travail principal. Le comportement des routes et de l'API reste inchangé, sauf que plusieurs valeurs explicites pour `--workspace` échouent désormais de manière explicite au lieu de retomber dans l'ancien chemin à espace de travail unique. Le nom du fichier de log du daemon et l'identifiant d'instance du service de télémétrie passent également, de manière intentionnelle, d'une identité à l'échelle de l'espace de travail à une identité à l'échelle du daemon ; les notes de version de la PR doivent mentionner cette migration.

Le registre constitue la future frontière interne pour le déploiement multi-espaces de travail de l'issue #6378, mais cette étape évite intentionnellement l'extension du protocole/schéma et n'active pas le comportement CLI multi-espaces de travail.

## Conception

- `WorkspaceRuntime` encapsule les objets serve actuels à espace de travail unique : `workspaceCwd`, `AcpSessionBridge`, `DaemonWorkspaceService`, la fabrique de système de fichiers des routes REST, et le registre actuel des expéditeurs client-MCP.
- `WorkspaceRegistry` expose uniquement `primary`, `list()`, et la recherche exacte `getByWorkspaceCwd()`.
- `createServeApp` construit d'abord la pile existante bridge/service/fsFactory, puis l'encapsule en tant que runtime principal.
- Les `app.locals.fsFactory` et `app.locals.boundWorkspace` existants restent en place pour les routes de fichiers actuelles. `app.locals.workspaceRegistry` est additif.
- Les modules de routes conservent leurs signatures actuelles. La couche d'assemblage du serveur transmet désormais les valeurs depuis `workspaceRegistry.primary`.
- Les noms de fichiers de log du daemon et les identifiants d'instance du service de télémétrie sont à l'échelle du daemon (`serve-<pid>.log`, `daemon:<pid>`). Le hachage de l'espace de travail reste un attribut sur les enregistrements de log/télémétrie au lieu de faire partie de l'identité du daemon.
- `runQwenServe` accepte la structure d'exécution possible de yargs où `workspace` est un tableau. Une valeur unique se comporte toujours comme l'espace de travail unique existant ; plusieurs valeurs provoquent une erreur au démarrage jusqu'à ce que la prise en charge multi-espaces de travail soit activée.

## Limites

- Pas encore de prise en charge de `--workspace` répétable ; les valeurs répétées sont rejetées.
- Pas de `workspaces[]` dans `/capabilities` ou le statut du daemon.
- Aucun changement de type SDK.
- Pas de routes au pluriel `/workspaces/:workspace/...`.
- Pas d'index de propriété de session, de surcouche d'environnement, de `maxTotalSessions`, ni de comportement de worker ACP/voix/canal qualifié par espace de travail.

## Notes d'audit

La fabrique de système de fichiers des routes est nommée `routeFileSystemFactory` car la production distingue actuellement l'accès aux fichiers du bridge de l'accès aux fichiers des routes REST. Le registre ne doit pas fusionner ces limites.

`ClientMcpSenderRegistry` reste l'actuelle carte à daemon unique à l'échelle du processus dans cette phase. Le runtime stocke uniquement l'instance existante ; l'isolation client-MCP à l'échelle de l'espace de travail est une préoccupation ultérieure pour le multi-espaces de travail.

`SessionArchiveCoordinator` et `WorkspaceRememberTaskLane` restent les collaborateurs actuels de l'assemblage du serveur. Ils ne font pas partie des responsabilités principales du registre dans la phase 1.

Le middleware de télémétrie du daemon résout désormais le cwd de l'espace de travail au moment de la requête, même si la phase 1 résout toujours au principal. Cela préserve le comportement actuel tout en évitant une fermeture de hachage de l'espace de travail principal qui serait incorrecte une fois que les routes qualifiées par espace de travail seront déployées.

## Vérification

Des tests ciblés couvrent la recherche exacte dans le registre, l'exposition des `locals` de `createServeApp`, la préservation de la fabrique de système de fichiers de route injectée, le comportement des `locals` des routes de fichiers existantes, l'identité de log/télémétrie à l'échelle du daemon, le hachage de l'espace de travail au moment de la requête, les formes simples/répétées de `--workspace` de yargs, le chemin du tableau à espace de travail unique, et le garde-fou de démarrage pour les `--workspace` répétés. La vérification finale doit exécuter les tests ciblés de serve, ainsi que le build et le typecheck du dépôt.