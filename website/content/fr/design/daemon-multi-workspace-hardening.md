# Baseline de durcissement multi-workspaces du démon

Statut : baseline d'implémentation actuelle et contrat de revue pour l'issue
[#6378](https://github.com/QwenLM/qwen-code/issues/6378). Ce document clôt la
phase de durcissement ; ce n'est pas une feuille de route pour ajouter de
nouvelles fonctionnalités au démon.

## Modèle de propriété

Chaque route du démon et chaque opération en aval appartient à exactement une
de ces classes de propriété :

| Propriété                  | Signification                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Globale au processus       | Une ressource de listener/processus partagée par tous les runtimes, comme l'authentification, les limites de rate HTTP, les limites de connexions, les métriques et l'arrêt.                                                        |
| Primaire historique        | Une route de compatibilité dont le contrat cible intentionnellement le runtime primaire. Omettre un sélecteur de workspace n'est pas une permission de deviner un autre propriétaire.                                              |
| Qualifiée par workspace    | Une route résout d'abord un id de workspace explicite, puis un cwd canonique absolu encodé, et dispatche uniquement vers ce runtime sélectionné.                                                                                    |
| Propriétaire de session live | Une route singulière de session live parcourt les runtimes enregistrés à la recherche du bridge unique qui possède la session et dispatche uniquement vers celui-ci.                                                               |
| Workspace persisté         | Une route résout le workspace avant de lire son stockage persisté de sessions ou d'organisation ; elle peut exposer une surface en lecture seule déclarée pour un secondaire non fiable sans démarrer ACP.                          |

Le workspace primaire est le premier runtime au démarrage et le défaut de
compatibilité pour les routes qui documentent explicitement ce fallback. Ce
n'est pas un fallback générique lorsque la résolution échoue.

## Sémantique d'échec

| État                              | Comportement requis                                                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace ou session inconnu      | Fail closed (refus en cas d'échec) avec la réponse stable de non-concordance/introuvable de la route. Ne pas sonder ni exécuter contre le primaire.                                                                                                                                       |
| Workspace non fiable              | Rejeter l'exécution et la mutation soutenues par le runtime. Un secondaire non fiable ne peut utiliser que les surfaces en lecture seule explicitement documentées, y compris les lectures bornées du système de fichiers et des catalogues/transcriptions persistés, sans démarrer ACP ni écrire d'état de réparation. Le préchauffage du primaire historique n'autorise pas les requêtes. |
| Propriétaire de session live ambigu | Renvoyer une erreur serveur, car le dispatch ne peut pas être effectué de façon sûre. N'exécuter sur aucun bridge.                                                                                                                                                                        |
| Runtime en cours de bootstrap     | Garder la liveness globale au processus réactive ; le travail soutenu par le runtime attend ou signale l'échec de démarrage déclaré. Le deep health renvoie `503` avec une raison tant que l'agrégation est indisponible.                                                                 |
| Runtime en cours de drain         | Refuser le nouveau travail avec la réponse stable de drain. Un retrait non forcé fait un rollback avec `workspace_busy` s'il existe une activité ; un retrait forcé demande la terminaison et un nettoyage borné des ressources actives. Le runtime reste dans la comptabilité globale du démon jusqu'à la fin du retrait. |
| Runtime retiré                    | Le traiter comme inconnu. Il doit disparaître des capacités, du routage et de l'agrégation de health avant que le même workspace puisse être réajouté. Le nettoyage après le point de commit de persistance est best-effort ; les échecs sont journalisés et ne restaurent pas le routage. |

## Invariants

- La résolution de workspace ne retombe jamais sur le primaire après un
  résultat inconnu, non fiable, ambigu, en drain ou retiré.
- Les ids de workspace priment sur les sélecteurs de cwd encodés. Les
  sélecteurs de cwd doivent être absolus et se canonicaliser vers un runtime
  enregistré.
- Chaque runtime de workspace actif possède son snapshot d'environnement, son
  bridge, ses services de workspace, sa frontière de système de fichiers/confiance,
  son état Voice, et sa frontière de ressources ACP/MCP. La production tente de
  préchauffer le bridge primaire pour la compatibilité et retente à la
  première utilisation après un échec de préchauffage. Un secondaire fiable
  démarre son enfant ACP à la demande et, lorsque `mcp_workspace_pool` est
  activé, possède le pool dans cet enfant ; un secondaire non fiable ne doit
  démarrer aucun des deux. Le préchauffage du primaire ne contourne pas les
  portes de confiance des routes. Un coordinateur Voice global au processus
  applique le plafond d'admission partagé tout en suivant les baux par runtime
  propriétaire. Les clés d'environnement de même nom ne doivent pas traverser
  les runtimes, et un overlay de workspace ne doit pas muter l'environnement
  du processus parent.
- Un token de démon unique authentifie le processus ; ce n'est pas une ACL par
  workspace. Les limites de rate HTTP, les plafonds de listener, l'admission
  totale de sessions, les métriques, l'arrêt, et le rayon de défaillance du
  processus sont également globaux au démon.
- Lorsque `mcp_workspace_pool` est annoncé, les transports MCP et la
  comptabilité du budget sont partagés par les sessions à l'intérieur d'un
  même runtime de workspace, jamais entre runtimes. Sans le tag, les clients
  doivent accepter le gestionnaire historique par session et le statut
  `scope: 'session'`.
- Les runtimes de démarrage/statiques explicites, y compris le primaire, ne
  sont pas retirables. Les runtimes secondaires dynamiques ou persistés
  suivent les règles de cycle de vie d'ajout, de drain, de retrait et de
  réajout. Les runtimes en cours de drain restent visibles pour le health
  global du démon jusqu'à la fin du retrait logique. Le retrait forcé
  interrompt les ressources actives et effectue un démantèlement borné
  best-effort ; un timeout de nettoyage est journalisé plutôt que de faire un
  rollback du retrait logique.
- Le `GET /health` shallow reste exactement `200 {"status":"ok"}`. Le deep
  health agrège les runtimes actifs et en cours de drain, renvoie un `503`
  avec raison en cas d'échec de bootstrap ou d'agrégation, et n'expose jamais
  les chemins de workspace. Voir
  [deep health global du démon](./daemon-global-deep-health.md), implémenté
  par [PR #6961](https://github.com/QwenLM/qwen-code/pull/6961).

## Contrat de revue

Pour chaque route du démon nouvelle ou modifiée, les relecteurs doivent nommer
la classe de propriété et suivre la requête à travers l'environnement, le
bridge, les services, le système de fichiers, la confiance, et le traitement
des échecs. Une route est incomplète si un consommateur en aval peut utiliser
silencieusement l'état primaire après l'échec de la résolution de propriété.

Les constats de revue sont classés comme suit :

- Les régressions de correction, de sécurité, de perte de données, d'isolation
  ou de fail-open relèvent du durcissement et bloquent le changement concerné.
- Une nouvelle capacité ou la migration d'un contrat intentionnellement
  primaire uniquement obtient une issue et un design séparés ; cela n'étend
  pas cette clôture.
- Un refactoring sans défaut concret n'entre pas dans le périmètre du
  durcissement.

Après environ cinq tours de revue, seuls les correctifs de correction, de
sécurité, de perte de données et de régression doivent étendre une PR de
durcissement active. Les autres suggestions valides sont enregistrées comme
suivis afin que le parapluie ne reste pas ouvert indéfiniment.

## Limites actuelles explicites

- `POST /session/:id/branch`, `POST /session/:id/fork` et
  `POST /session/:id/cd` restent primaire historique pour une session live
  possédée par un secondaire et renvoient `non_primary_session_route_not_supported`.
- Les canaux nommés gérés par le démon sont regroupés par workspace
  propriétaire et exécutent un worker par runtime propriétaire.
  `--channel all` reste intentionnellement réservé au primaire.
- Le démon ne fournit pas d'authentification, de rate limiting ou d'isolation
  de défaillance de processus par workspace. Déployez des démons séparés
  lorsque ces frontières sont requises.

## Règle de sortie

Cette baseline, ses tests de contrat, les gardes de routes/environnement, et
le deep health à l'échelle du démon constituent la clôture fixe de #6378. Le
routage de branche/fork et la sémantique de `cd` restent un travail de
fonctionnalité indépendant. Après l'arrivée des PR de clôture, les futurs
constats de revue devraient être déposés comme des issues ciblées plutôt que
de rouvrir un seau de durcissement illimité.
