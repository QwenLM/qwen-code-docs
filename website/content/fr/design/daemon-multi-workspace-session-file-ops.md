# Rewind et shell de sessions multi-workspaces du démon

## Statut

Design d'implémentation final. Ce document remplace l'affirmation réservée au
primaire de la Phase 2a pour les snapshots de rewind, le rewind et le shell de
session live.

## Problème

Le démon expose des API de session singulières, tandis qu'un démon
multi-workspaces possède un bridge par runtime de workspace. La plupart des
routes de session live résolvent déjà le propriétaire de la session, mais les
snapshots de rewind, le rewind et le shell étaient encore liés au bridge
primaire ou rejetaient un propriétaire secondaire. Cela rendait une session
secondaire live valide indiscernable d'une route non prise en charge pour les
clients.

## Décision

Conserver l'API REST singulière et résoudre le runtime live propriétaire à
chaque requête :

- `GET /session/:id/rewind/snapshots` utilise un routage en lecture conscient
  du propriétaire.
- `POST /session/:id/rewind` et `POST /session/:id/shell` utilisent un routage
  mutable conscient du propriétaire et le coordinateur d'archives de session
  partagé.
- Les appels rewind du SDK sélectionnent toujours le REST direct, même lorsque
  le client est configuré avec le transport ACP. Cela préserve la porte
  stricte des mutations REST.
- Le shell du SDK conserve son transport configuré. Le transport REST par
  défaut gagne le routage par propriétaire ; un client ACP qualifié par
  workspace conserve `_qwen/session/shell`.
- Aucune API REST de session qualifiée par workspace, aucune méthode ACP de
  rewind, aucun changement du cœur, aucun changement de l'enfant ACP, ni
  aucune migration de FileHistory n'est introduit.

## Propriété et autorisation

Le registre de workspaces recherche l'id de session dans tous les résumés de
bridge live. Exactement un propriétaire fiable dispatche vers ce runtime.
Aucun propriétaire renvoie `404 session_not_found` ; un propriétaire non
fiable renvoie `403 untrusted_workspace` ; plusieurs propriétaires renvoient
`500 ambiguous_session_owner`. Les trois issues se produisent avant que
l'opération du bridge cible ne s'exécute. Les sessions persistées doivent
d'abord être chargées ou reprises dans un runtime.

Le rewind et le shell conservent `mutate({ strict: true })`. Le shell exige
en plus une activation effective du shell, un id de client valide lié à la
session, et une commande non vide. Le rewind transmet un id de client
optionnel et n'accepte `rewindFiles` que s'il est omis ou booléen. Omis
signifie `true` ; tout autre type JSON renvoie
`400 invalid_rewind_files_flag`.

## Frontières de comportement

Le shell démarre dans le cwd du workspace de la session propriétaire et n'est
pas un sandbox de chemin de système de fichiers. Le rewind ne restaure que les
snapshots enregistrés pour `edit` et `write_file`. Il n'annule pas les
changements de shell, Git, scripts ou manuels. La restauration des fichiers
est best-effort : la conversation peut déjà être rewindée lorsque la réponse
rapporte `rewound: false` avec `filesFailed[]`. Les prompts actifs conservent
`409 session_busy` et `Retry-After: 5` ; les cibles invalides conservent
`400 invalid_rewind_target`. Le Web Shell continue de demander
`rewindFiles: false`.

L'agencement existant `~/.qwen/file-history/<sessionId>` est inchangé. Une
collision d'UUID live échoue donc en fail closed par ambiguïté de
propriétaire plutôt que de sélectionner le runtime primaire.

## Capacités

`multi_workspace_session_rewind` est annoncé uniquement tant que plus d'un
runtime existe. `multi_workspace_session_shell` exige en plus une activation
effective du shell de session, ce qui signifie à la fois le flag d'activation
et un token configuré.

Le preflight côté client est additif :

- Rewind primaire : `session_rewind`.
- Rewind secondaire : `session_rewind` et `multi_workspace_session_rewind`.
- Shell primaire : `session_shell_command`.
- Shell secondaire : `session_shell_command` et
  `multi_workspace_session_shell`.

Les clients natifs ACP utilisent l'initialize `_qwen.methods` ; le démon
n'annonce pas de méthode vendor ACP de rewind.

## Vérification

La couverture unitaire fixe le dispatch par propriétaire, zéro appel aux
bridges non propriétaires, les échecs de confiance et d'ambiguïté, l'ordre de
validation strict, la sémantique de `rewindFiles`, le fallback REST du SDK, le
transport shell inchangé, l'annonce conditionnelle des capacités, et
l'absence de mappings ACP de rewind. Les tests d'ACP de workspace conservent
l'invariant selon lequel une connexion A ne peut pas opérer une session B
tandis qu'un shell B qualifié par workspace réussit.

Le scénario E2E crée une session et des edits suivis dans le workspace B,
vérifie que les snapshots et le cwd du shell sont à portée de B, teste les
deux modes de fichiers du rewind, prouve qu'un fichier créé par shell survit
au rewind, et enregistre les issues occupé, restauration partielle, et
secondaire non fiable.
