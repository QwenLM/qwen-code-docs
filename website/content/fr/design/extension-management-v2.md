# Gestion des extensions V2

## Statut

Ce design étend le protocole du démon `v1` sous la capacité additive
`extension_management_v2`. La capacité déjà publiée `workspace_extensions`
et les routes `/workspace/extensions/*` restent disponibles comme
adaptateur de compatibilité du workspace primaire.

## Modèle de ressources

Une extension installée est un artefact de niveau utilisateur dans
`QWEN_HOME/extensions`. L'activation est une politique, pas une seconde
copie de cet artefact :

1. Un remplacement exact de workspace (`enabled` ou `disabled`).
2. Un masque interne exact `inherit` créé pendant la migration des règles
   de chemin legacy.
3. Une règle de chemin V1 ordonnée.
4. Le défaut global.

L'identité du workspace utilise le chemin de workspace canonique du démon.
Une route de workspace sélectionne un runtime existant d'abord par id de
workspace, puis par cwd canonique. Les lectures sont autorisées pour les
runtimes non fiables ; les changements d'activation, le rafraîchissement et
l'installation à portée workspace exigent une cible fiable. La mutation
globale utilise l'authentification de mutation du démon normale et le
consentement d'installation, pas l'état de confiance du workspace qui a
initié la requête.

## Magasin et frontière de transaction

`ExtensionStore` est le seul writer des répertoires d'extension finaux et de
l'état d'activation V2. `ExtensionManager` reste la façade côté workspace,
mais le CLI, le TUI, la mise à jour automatique, le démon et les opérations
via le SDK délèguent les mutations au magasin.

L'organisation est :

```text
~/.qwen/
├── extensions/
└── extension-store/
    ├── lock
    ├── state.json
    ├── state.previous.json
    ├── staging/
    ├── rollback/
    └── transactions/
```

Le magasin et les artefacts partagent un système de fichiers afin que les
échanges d'artefacts soient des renommages de répertoires. Un mutex en
cours de processus et un verrou `proper-lockfile` sérialisent les commits à
travers tous les processus conscients de V2. Chaque mutation relit l'état
tout en détenant le verrou et incrémente une génération monotone, empêchant
les mises à jour perdues.

La préparation de l'installation/mise à jour a lieu hors du répertoire
d'artefact final. Le commit écrit un journal `prepared`, déplace l'ancien
artefact vers le rollback, déplace le staging en place et écrit
`state.json` atomiquement. Ce renommage d'état est le point de commit.
Avant lui, la récupération fait un rollback ; après lui, la récupération ne
fait que terminer la projection et le nettoyage. Une politique validée n'est
jamais annulée par rollback parce qu'un rafraîchissement de runtime a
échoué. Si une opération pré-commit et son rollback échouent tous les deux,
l'appelant reçoit les deux erreurs et le journal reste pour une récupération
fail closed ; le magasin ne continue pas à écrire à travers un état
d'artefact ambigu.

Les fichiers du magasin utilisent des permissions réservées au propriétaire
et des écritures atomiques sans suivi de liens. Les ids d'extension, les
chemins d'artefacts enfants directs, les chemins de transaction et les noms
sont validés. Les échecs sont signalés avec des sources expurgées des
identifiants.

## Migration V1 et projection de rétrogradation

Le premier processus conscient de V2 importe les règles ordonnées depuis
`extension-enablement.json` sans matérialiser l'ensemble courant des
workspaces enregistrés comme remplacements exacts. V2 écrit une projection
compatible après chaque commit d'état et stocke son hachage dans
`state.json`.

Si les hachages diffèrent, l'ordre de modification décide de la direction
de récupération : une projection plus ancienne est réparée depuis l'état V2
faisant autorité ; une projection modifiée après l'état V2 est traitée
comme une écriture séquentielle par un binaire rétrogradé et est
réimportée avec une nouvelle génération. Les writers V1 et V2 concurrents
partageant un même `QWEN_HOME` ne sont intentionnellement pas pris en
charge.

Effacer un remplacement de workspace public supprime normalement
l'enregistrement exact. Si une règle de chemin plus ancienne changerait
alors la valeur effective, le magasin écrit un masque interne `inherit`
afin que DELETE signifie toujours « hériter du défaut global ».

## API du démon

La surface globale est :

```text
GET    /extensions
POST   /extensions/install
POST   /extensions/check-updates
POST   /extensions/:extensionId/update
DELETE /extensions/:extensionId
PUT    /extensions/:extensionId/activation
GET    /extensions/operations/:operationId
```

L'installation exige un consentement explicite et une activation initiale :

```ts
type InitialActivation =
  | { scope: 'user' }
  | { scope: 'workspace'; workspaceId: string };
```

L'endpoint d'installation du démon accepte les sources Git HTTPS, GitHub
Release et npm sous la politique de réseau public. Les sources SSH et
locales/liées restent des fonctionnalités locales du CLI. La mise à jour
préserve l'id d'extension, le nom du manifeste, les paramètres et la
politique d'activation. « Déjà à jour » est un résultat réussi
`updated: false`. La désinstallation est idempotente et supprime à la fois
l'artefact et la politique.

La projection de workspace est :

```text
GET    /workspaces/:workspace/extensions
PUT    /workspaces/:workspace/extensions/:extensionId/activation
DELETE /workspaces/:workspace/extensions/:extensionId/activation
POST   /workspaces/:workspace/extensions/refresh
```

Elle n'a intentionnellement aucune route de mutation d'artefact de
workspace. Les entrées de projection incluent le défaut, la valeur exacte
de workspace, la valeur effective et la source. La génération souhaitée et
la génération appliquée localement sont des champs de réponse de premier
niveau.

Les mutations potentiellement lentes renvoient `202`, `Location` et
`Retry-After`. L'enregistrement d'opération est en mémoire locale du démon,
conserve au plus 100 enregistrements terminaux et peut disparaître au
redémarrage. La récupération du catalogue/magasin fait autorité. Le timeout
de polling du SDK arrête uniquement le polling ; il n'annule jamais un
travail accepté.

Le démon admet au plus 10 opérations d'extension non terminées. Une file
FIFO de préparation à l'échelle du démon exécute au plus deux
téléchargements, extractions, conversions ou vérifications de mise à jour
d'une seule extension à la fois. L'installation et la mise à jour utilisent
un cycle de vie explicite `prepare -> commit/dispose` : la préparation
possède les fichiers de staging et les snapshots d'identifiants avec
révision, mais ne modifie ni le magasin, ni le cache, ni le runtime, ni les
identifiants sélectionnés par l'artefact installé. Les mutations préparées
entrent dans une file de commit FIFO séparée à concurrence unique dans
l'ordre où la préparation se termine. L'activation et la désinstallation
n'entrent que dans la file de commit ; check-updates n'entre que dans la
file de préparation. Le rafraîchissement manuel est sérialisé via la file
de commit. Son timeout HTTP libère cette lane afin qu'un rafraîchissement de
runtime bloqué ne puisse pas bloquer définitivement les mutations
d'extension ultérieures ; le rafraîchissement déjà démarré peut encore se
stabiliser ensuite. Les paramètres sensibles sont mis en staging comme un
seul bundle de secrets atomique sous une révision par préparation. Un
sélecteur non secret enregistre cette révision et ce backend de stockage
sécurisé à l'intérieur de l'artefact en staging, afin que seul le commit de
l'artefact gagnant active un bundle complet. Le commit du magasin est donc
le point de durabilité et libère immédiatement la lane de commit. Le
rechargement d'extension, la synchronisation legacy des paramètres par clé,
le rafraîchissement du runtime du gestionnaire, le nettoyage des fichiers
préparés et la réconciliation du runtime du démon s'exécutent en dehors.
Ces étapes post-commit n'occupent aucun des deux emplacements, de sorte que
les commits ultérieurs peuvent avancer pendant qu'une génération antérieure
est appliquée ou nettoyée.

Détruire une mutation préparée supprime son snapshot d'identifiants non
sélectionné, et un commit réussi supprime le snapshot précédemment
sélectionné de manière best-effort. Un crash dur du processus avant la
destruction peut laisser une entrée inaccessible dans le backend sécurisé ;
aucun sélecteur d'artefact n'y fait référence, elle ne peut donc pas
devenir active ni être confondue avec les identifiants validés.

L'échéance de préparation démarre lorsqu'une opération acquiert pour la
première fois un emplacement de préparation, pas pendant qu'elle attend.
L'abandon est propagé aux opérations réseau et aux flux actifs de scan et
d'extraction d'archives. Une tâche démarrée continue d'occuper son
emplacement jusqu'à ce que sa promesse sous-jacente se stabilise, même si
elle ignore l'abandon. Le commit n'est pas annulable. Les mises à jour
préparées portent la génération de l'artefact cible : les changements
d'extension ou d'activation sans rapport se rebasent en toute sécurité,
tandis qu'une mise à jour obsolète du même artefact échoue avec
`extension_conflict`.

Les métadonnées npm distantes sont diffusées en continu avec un plafond de
réponse de 10 MiB. Les archives npm et GitHub ont des plafonds de
téléchargement séparés de 100 MiB, des échéances de requête, des limites de
redirection et une validation des entrées d'archive avant l'extraction.

## Réconciliation du runtime

Un commit réussi invalide le statut local et rafraîchit les runtimes
affectés. Les changements globaux d'artefact/défaut réconcilient tous les
runtimes de ce démon ; un remplacement exact de workspace ne réconcilie que
sa cible. La réconciliation du runtime rafraîchit les caches d'extension et
de skills, les outils d'extension, la mémoire hiérarchique, les
instructions système du chat actif et les commandes disponibles. Un
composant en échec ne saute pas les composants de rafraîchissement restants ;
le RPC de session signale l'échec combiné après que tous les composants ont
été tentés. La réconciliation de génération du runtime utilise un FIFO à
l'échelle du démon partagé par les mutations et le poller de génération. Une
mutation réserve sa position au callback de commit durable, afin que les
générations ultérieures ne puissent pas rafraîchir un runtime en premier
même lorsque le travail post-commit antérieur se termine plus tard. Le
bridge ACP borne chaque rafraîchissement de session à 30 secondes. Si le
rafraîchissement agrégé dépasse encore l'échéance de la route, le
contrôleur libère la lane de commit sans annuler le RPC sous-jacent.
Appliquer la génération N satisfait aussi les attentes pour les générations
plus anciennes, et un rafraîchissement tardif de génération inférieure ne
peut donc pas faire reculer la génération appliquée. Un échec partiel de
rafraîchissement ou un échec de rechargement/nettoyage post-commit produit
`succeeded_with_warnings` avec des diagnostics spécifiques au workspace ou
au commit, sans rollback de l'artefact.

La migration des workspaces legacy traite un artefact validé comme échoué
uniquement lorsqu'il n'a pas pu être rechargé. Les avertissements de
synchronisation de compatibilité des paramètres, de nettoyage ou de
rafraîchissement du runtime ne déclenchent pas une nouvelle tentative pour
un artefact déjà installé durablement. Les appelants de mise à jour
reçoivent les détails des avertissements ; les avertissements de
compatibilité et de nettoyage utilisent un état distinct `updated with
warnings`, tandis que les échecs de rechargement ou de rafraîchissement du
runtime restent `updated, needs restart`.

Le watcher de fichiers d'extension observe uniquement
`extension-store/state.json` pour la génération de politique et continue
d'observer le contenu des extensions installées/liées pour les changements
de commandes, skills, agents, hooks et MCP. Un polling de génération de 30
secondes répare les événements de système de fichiers manqués et borne la
convergence pour les autres démons qui partagent le magasin.

## Compatibilité

`workspace_extensions` reste la capacité de la surface singulière existante.
Ses gestionnaires appellent les mêmes gestionnaire/coordinateur et adaptent
les réponses : l'activation de projet devient un remplacement du workspace
primaire ; l'activation utilisateur conserve le comportement legacy
d'effacement de règle ; la mutation globale réconcilie chaque runtime
local. L'endpoint d'opération legacy remappe la complétion avec
avertissements V2 vers le statut d'erreur de rafraîchissement legacy
publié.

Les clients doivent vérifier `extension_management_v2` ; ni le mode démon
ni une autre capacité de workspace n'impliquent cette API. La proposition
abandonnée `workspace_qualified_extensions` ne fait pas partie du
protocole.

## Non-objectifs

- Des copies d'artefact par workspace.
- Un registre de démon ou un protocole d'accusé de réception distant.
- L'annulation par l'utilisateur des opérations acceptées.
- Les écritures concurrentes d'un ancien binaire et d'un binaire conscient
  de V2 sur un même `QWEN_HOME`.
- La suppression de l'adaptateur V1 avant une future migration de
  protocole v2.
