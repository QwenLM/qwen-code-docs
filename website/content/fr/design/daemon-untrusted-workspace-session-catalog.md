# Catalogue de sessions en lecture seule des workspaces non fiables

## Résumé

Les démons multi-workspaces exposent un catalogue étroit en lecture seule
pour les workspaces enregistrés non primaires dont l'état de confiance au
démarrage est `false`. Le catalogue contient les résumés de sessions
persistées et le sidecar d'organisation des sessions. Il ne s'attache pas à
une session, ne démarre pas d'enfant ACP, ne fusionne pas l'état runtime
live et n'interprète pas les définitions de capacités contrôlées par le
workspace.

Il s'agit d'une liste d'autorisation de routes, pas d'une ACL de workspace.
Un client qui détient le token bearer du démon peut lire les données
autorisées de chaque workspace enregistré. La confiance continue de
contrôler l'exécution et les mutations ; elle ne crée pas de principal
d'authentification distinct.

## Invariants de sécurité

Chaque nouveau chemin de lecture de workspace non fiable autorisé doit
satisfaire toutes ces conditions :

- Ne pas appeler `loadSettings()` ni aucun chemin de migration/réparation de
  paramètres.
- Ne pas créer, réparer, réécrire ni modifier d'une autre manière le
  stockage.
- Supprimer la journalisation de debug sur fichier tant que le lecteur de
  catalogue est actif, afin qu'un enregistrement mal formé ne puisse pas
  créer ou compléter un journal de debug comme effet de bord de lecture.
- Ne pas appeler `ensureChannel()` ni aucun autre chemin de démarrage
  d'enfant ACP.
- Ne pas interroger ni fusionner l'état live du bridge du runtime non
  fiable.
- Ne pas exécuter de commandes externes.
- Ne pas découvrir ni analyser les agents, skills, hooks, la configuration
  MCP du workspace ou d'autres définitions de capacités contrôlées par le
  projet.

L'implémentation impose la frontière d'état live avec une politique de
lecture interne `mergeLive: false` sur toutes les formes de liste de
sessions : par défaut, organisée et filtrée par `parentSessionId`. La même
frontière de lecture asynchrone supprime uniquement la journalisation de
debug sur fichier pour les lectures de catalogue non fiable ; les requêtes
fiables et la journalisation hors de cette frontière sont inchangées. Un
stockage absent produit un catalogue vide, et les entrées mal formées
suivent le comportement de lecture best-effort existant sans réparer les
fichiers.

## Matrice des routes

Le tableau décrit un workspace secondaire non fiable sauf indication
contraire.

| Surface                                     | Résultat          | Source de données et contraintes                                                      |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `GET /workspace/:id/sessions`               | 200               | Fichiers de sessions persistées uniquement ; sélecteur id ou cwd canonique encodé     |
| `GET /workspaces/:workspace/sessions`       | 200               | Même catalogue persisté uniquement                                                    |
| `GET /workspace/:id/session-groups`         | 200               | Sidecar d'organisation uniquement ; tout id enregistré ou cwd encodé                  |
| `GET /workspaces/:workspace/session-groups` | 200               | Sidecar d'organisation uniquement                                                     |
| Lecture de fichier, octets, stat, liste, glob | Comportement existant | La politique de lecture du système de fichiers existante est inchangée          |
| GET/requête de confiance du workspace       | Comportement existant | La sémantique existante de configuration de confiance est inchangée               |
| `/capabilities`, `/daemon/status`           | Comportement existant | Les diagnostics du démon existants sont inchangés                                 |
| Mutations plurielles de session/groupe      | 403               | La porte de confiance des mutations reste inchangée                                   |
| Mutations singulières de groupe             | Comportement existant | Restent réservées au primaire ; les sélecteurs secondaires échouent en fail closed |
| Paramètres, permissions, providers          | 403               | Le chargement des paramètres peut migrer, sauvegarder ou réparer des fichiers        |
| Mémoire                                     | 403               | La réponse courante inclut les chemins de mémoire globale plutôt qu'une projection workspace uniquement |
| Env                                         | 403               | Expose la présence d'identifiants et les diagnostics de proxy/hôte                    |
| Preflight                                   | 403               | Peut exécuter des sondes git, npm, ripgrep ou autres                                  |
| MCP, outils, hooks                          | 403               | Couplé à l'état live du bridge ou à la configuration du projet                        |
| Skills, agents                              | 403               | Découvre et analyse des définitions contrôlées par le projet                          |
| Transcription                               | 403               | Le chemin courant peut démarrer ACP et l'initialisation du curseur peut écrire une clé HMAC |
| Export, statut/contexte/tâches de session   | 403               | Aucune implémentation persistée uniquement qualifiée par workspace                    |
| ACP HTTP/WebSocket, voix, canaux            | Rejeté            | Capacités d'exécution, de processus ou de runtime de longue durée                     |

Les sélecteurs de workspace inconnus absolus, imbriqués ou non enregistrés
continuent d'échouer en fail closed avec la réponse
`400 workspace_mismatch` existante. Un sélecteur singulier legacy mal formé
conserve son message de validation `400` existant. Aucun des deux cas ne
retombe sur le workspace primaire. Les routes plurielles continuent de
renvoyer `403 untrusted_workspace` pour un workspace primaire non fiable.
Les routes singulières primaires conservent leur comportement de
compatibilité existant.

## Sémantique du catalogue de sessions

Le mode persisté uniquement conserve les comportements existants
d'`archiveState`, `view=organized`, `group`, `parentSessionId`, du curseur
et de la taille de page. Il ne remplit jamais les interactions en attente,
les erreurs de tour ni l'état client depuis le runtime live ; les défauts
existants du résumé persisté tels que `clientCount: 0` et
`hasActivePrompt: false` restent compatibles au niveau du wire. Il n'appelle
jamais `bridge.listWorkspaceSessions()`.

Les workspaces secondaires et primaires fiables conservent la fusion
persisté/live existante. Aucune route, aucun champ de wire, aucun schéma ni
aucun tag de capacité n'est ajouté : les anciens clients continuent de
gérer le `403`, tandis que le Web Shell embarqué consomme la nouvelle
réponse `200` lorsqu'il est livré avec le démon.

## Comportement du Web Shell

Un workspace secondaire non fiable reste extensible et est étiqueté à la
fois `untrusted` et `read-only`. Son extension effectue une lecture de
catalogue. Un changement de `reloadToken` effectue une autre lecture, mais
le polling habituel de dix secondes est désactivé car ce démon ne peut pas
créer de sessions dans ce workspace.

L'extension ne sélectionne ni n'active le workspace. Les sessions persistées
sont rendues comme des lignes non interactives avec `role="note"` et un nom
accessible qui inclut le nom de la session, la date et une explication selon
laquelle le workspace doit être fiable avant qu'une session puisse être
ouverte. La ligne ne lie aucune activation souris ou clavier et ne reçoit
pas le style de session active. Le comportement des workspaces fiables est
inchangé. Un primaire non fiable reste désactivé en attendant un design
séparé du mode sans échec primaire.

## Comportement en cas d'échec et compatibilité

- Un stockage de sessions ou d'organisation absent renvoie un catalogue
  vide.
- Les enregistrements JSONL non analysables et non objets sont ignorés par
  le lecteur de session existant. Ce changement n'ajoute pas de validation
  de schéma pour les enregistrements objets structurellement invalides.
- Un sidecar d'organisation illisible renvoie la vue de lecture vide
  existante et un warning ; les lectures ne le réparent pas.
- Les échecs de requête du Web Shell conservent l'état vide existant et le
  warning de console.
- Le GET de confiance continue d'observer la configuration de confiance
  courante sur disque et indique aux appelants que les changements runtime
  nécessitent un redémarrage. Il n'est pas converti en snapshot de
  démarrage dans ce changement.

## Travail différé

- Un chargeur de snapshot de paramètres et de confiance sans effets de bord.
- Une projection de mémoire workspace uniquement.
- Une inspection rédigée de l'environnement et de la configuration.
- Un inventaire des skills et agents qui n'analyse pas les définitions du
  projet.
- Un lecteur de transcription local au démon qui ne démarre ni ACP ni
  l'initialisation d'une clé HMAC de curseur, plus un visualiseur de
  sessions véritablement en lecture seule.
- L'application dynamique de la confiance, la reconstruction du runtime et
  le retrait/drain des workspaces.
