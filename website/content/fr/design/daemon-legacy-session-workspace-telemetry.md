# Télémétrie du workspace des sessions historiques

## Contexte

Le middleware de télémétrie du démon classe les requêtes HTTP avant que les
gestionnaires de routes Express ne s'exécutent. Les routes singulières
historiques de session peuvent se résoudre vers n'importe quel workspace
enregistré, mais le middleware ne peut pas connaître le runtime sélectionné à
partir de l'URL seule. Résoudre le propriétaire live à la fois dans le
middleware et dans le gestionnaire duplique le travail et peut diverger si le
registre change entre les deux consultations.

Ce design donne à chaque route explicite historique `/session`, `/sessions` et
`/permission` un span de requête stable tout en attribuant les routes
dynamiques au runtime sélectionné par le gestionnaire.

## Inventaire des routes

Le catalogue de routes contient les 48 routes historiques explicites. Chaque
entrée déclare sa méthode HTTP, son gabarit de chemin Express, son étiquette
de route canonique, et l'un des deux modes d'attribution :

- `handler_resolved` (41 routes) : `POST /session`, load/resume, la route
  historique de transcription, et chaque route singulière de session qui
  résout un propriétaire live. Le gestionnaire publie le workspace du runtime
  sélectionné dans la télémétrie.
- `pre_resolved` (7 routes) : l'export historique, l'action A2UI,
  l'organisation historique, les trois mutations batch globales, et le vote de
  permission global. Ces routes restent liées au workspace primaire.

Le correspondant du catalogue suit les défauts pertinents d'Express 5 : les
segments statiques sont insensibles à la casse, un slash final est accepté, et
les segments de paramètre sont décodés uniquement après que leur frontière de
chemin brut a été capturée. Un id de session malformé est conservé comme sa
valeur brute. Les ids de requête de permission sont décodés avant leur
validation existante de longueur et de jeu de caractères. Le `http.route`
émis utilise toujours le gabarit canonique du catalogue.

## Attribution différée

Les requêtes résolues par le gestionnaire démarrent sans
`qwen-code.workspace.hash`. Le middleware stocke un contexte privé sur la
réponse Express. Le code de la route appelle
`setDaemonTelemetryWorkspace(res, runtime.workspaceCwd)` après qu'un runtime
unique a été sélectionné. Le setter est best-effort et le premier choix gagne :
une valeur identique répétée est idempotente et une valeur différente
ultérieure est ignorée.

Les quatre points de publication sont :

1. `requireSessionRuntime`, partagé par les routes à propriétaire live.
2. La création de session après la sélection du workspace.
3. Le chargement/reprise de session après la sélection du runtime cible.
4. La résolution de transcription historique après qu'un propriétaire unique
   live ou persisté est trouvé.

La publication précède les vérifications ultérieures de confiance, de
secondaire non pris en charge, de conflit et de validation de requête. Par
conséquent, ces échecs conservent le runtime sélectionné de façon unique. Les
requêtes qui échouent avant la sélection unique, y compris les cas introuvable,
ambigu et de workspace non concordant, omettent le hash du workspace.
L'attribution utilise `runtime.workspaceCwd`, pas le cwd demandé ou temporaire
d'une session.

À la `finish` ou à la `close` de la réponse, le middleware hache le workspace
publié, définit l'attribut du span, enregistre la réponse et termine le span.
La résolution, le hachage et les mises à jour du span sont best-effort et ne
peuvent pas affecter le traitement de la requête ni le règlement des
métriques. Le contexte est effacé après un règlement.

Les requêtes pré-résolues continuent de hacher le workspace sélectionné par le
middleware au démarrage du span. Retirer le callback de propriétaire live du
middleware garantit qu'un propriétaire live n'est résolu au plus qu'une fois
par requête.

## Streaming et métriques

Les 48 routes du catalogue créent des spans de requête. Une réponse
`GET /session/:id/events` réussie termine son span lorsque la connexion SSE se
ferme, mais elle est exclue du comptage/durée ordinaire des requêtes HTTP et
de l'anneau des métriques de statut du Web Shell, car sa durée est celle de la
durée de vie de la connexion. Les échecs de handshake SSE sont enregistrés
comme des requêtes HTTP courtes ordinaires.

`POST /session/:id/generate` est une opération SSE bornée à portée de requête.
Sa connexion se termine lorsque la génération s'achève, donc sa durée reste
une latence de requête significative et continue d'entrer dans les métriques
HTTP ordinaires.

Les requêtes de heartbeat restent dans les métriques HTTP OpenTelemetry mais
demeurent exclues de l'anneau des métriques de statut. `GET /daemon/status`
reste également exclu uniquement de cet anneau. Une garde de règlement
partagée empêche les enregistrements dupliqués lorsque `finish` et `close` se
déclenchent tous les deux.

Les métriques HTTP et l'anneau de métriques du Web Shell restent globaux au
démon. Ajouter une dimension de workspace aux métriques exige une revue
séparée de cardinalité et de compatibilité des dashboards.

## Compatibilité et limites

Ce changement ne modifie pas les routes, les schémas de requête ou de réponse,
les SDK, les capacités, la persistance, l'authentification, l'ordre de la
confiance, les baux d'archives, le mapping d'erreurs du bridge, ni l'exécution
des sessions. Il n'ajoute pas d'attributs publics de télémétrie.

Le middleware de télémétrie est installé après l'authentification bearer, le
rate limiting et le parsing JSON, de sorte que les requêtes rejetées par ces
portes antérieures restent hors de cette couverture de spans de requête. Les
HEAD/OPTIONS implicites, le comportement de l'access-log, la normalisation de
chemin du rate-limit, les routes de groupes de sessions de workspace,
l'organisation qualifiée par workspace, la télémétrie ACP/WebSocket, et
l'activation de l'exécution de branche/fork/cd secondaire sont hors périmètre.

## Vérification

- Une garde de dérive compare les routes historiques explicites enregistrées
  dans Express au catalogue et affirme l'inventaire 48/41/7.
- Les tests du correspondant couvrent la casse, le slash final, le slash
  encodé, Unicode, l'encodage malformé, la validation d'id de permission, la
  non-concordance de méthode/chemin, et les étiquettes canoniques.
- Les tests du middleware couvrent l'attribution différée, le premier choix
  gagnant, le cache de hash, les échecs de télémétrie, le règlement unique,
  les métriques SSE, le heartbeat, et les exclusions de statut.
- Les tests de routes couvrent la publication pour propriétaire live,
  création, restauration et transcription, pour les cas primaire, secondaire,
  non fiable, absent, ambigu et conflit.
- Un test d'outfile à double workspace vérifie les hashes secondaire, lié au
  primaire, et omis, sans exposer les chemins bruts de workspace.
