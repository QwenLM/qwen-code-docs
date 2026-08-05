# Bascule des skills du démon

## Objectif

Exposer le comportement d'activation/désactivation par workspace du panneau
`/skills` du CLI via le REST du démon et le SDK TypeScript, y compris le
rafraîchissement immédiat des sessions ACP actives.

## Contrat public

- `POST /workspace/skills/:name/enable`
- `POST /workspaces/:workspace/skills/:name/enable`
- Corps de requête : `{ "enabled": boolean }`
- SDK : `DaemonClient.setWorkspaceSkillEnabled` et
  `WorkspaceDaemonClient.setWorkspaceSkillEnabled`
- Capacité : `workspace_skill_toggle`

La réponse contient le nom canonique du skill, l'état demandé, si la
persistance a changé, l'état d'activation et les comptes de rafraîchissement
de sessions. `applied` signifie que toutes les sessions actives ont été
rafraîchies, `deferred` signifie qu'aucun enfant ACP n'était en cours
d'exécution, et `partial` signifie qu'au moins une session a échoué à se
rafraîchir après que la persistance a été validée.

## Sémantique

L'API modifie `skills.disabled` et `skills.enabled` du workspace si
nécessaire. La recherche de skill est insensible à la casse, mais le nom
découvert canonique est persisté. Activer un skill désactivé par défaut écrit
un opt-in explicite ; le désactiver supprime l'opt-in et écrit une
désactivation workspace dure. Mettre à jour une cible supprime les doublons
de cible et les variantes de casse sans supprimer les entrées orphelines des
skills indisponibles. Une seconde requête identique est un no-op.

La route rejette les états que le panneau du CLI ne peut pas basculer :

- skill inconnu : `404 skill_not_found` ;
- `userInvocable === false` : `409 skill_not_toggleable` ;
- skill provenant d'une extension inactive : `409 skill_not_toggleable` ;
- désactivé dans les défauts système, le scope utilisateur ou le scope
  système : `409 skill_not_toggleable` avec le scope verrouillant ;
- workspace non fiable : `403 untrusted_workspace`.

La vérification de verrou de scope et la lecture-modification-écriture du
workspace se déroulent dans le verrou de paramètres par workspace du démon.
Une écriture échouée s'arrête avant le rafraîchissement et la publication
d'événement.

## Disponibilité des skills versus `disable-model-invocation`

`skills.disabled` est une liste de refus dure de l'opérateur fusionnée en une
union insensible à la casse entre les scopes. `skills.defaultDisabled`
fournit des défauts surchargeables et `skills.enabled` fournit des opt-ins
explicites, avec la priorité `disabled > enabled > defaultDisabled`. Les
désactivations effectives suppriment les slash commands de skill
correspondants et les entrées de skills visibles par le modèle, et la
validation au moment de l'exécution rejette le skill. L'endpoint du démon
écrit les membres workspace de `disabled` et `enabled`.

`disable-model-invocation` est une métadonnée de SKILL.md. Elle masque un
skill de l'invocation par le modèle tout en préservant l'invocation directe
par l'utilisateur. L'opération ACP de skill géré existante édite cette
métadonnée et n'est intentionnellement pas réutilisée par cette API.

## Flux d'activation

1. Résoudre le skill canonique basculable depuis le snapshot de statut du
   workspace.
2. Sous le verrou de paramètres du workspace, relire tous les scopes,
   rejeter les verrous de scope supérieur et valider la liste workspace
   canonique.
3. Invalider le statut de skill mis en cache du démon.
4. Si un enfant ACP est live, invoquer `qwen/control/workspace/skills/refresh`.
5. L'enfant recharge les paramètres du scope workspace et rafraîchit toutes
   les sessions actives, y compris les sessions occupées.
6. Chaque session recharge ses propres paramètres workspace, reconstruit et
   pousse `available_commands_update`, et notifie les consommateurs de
   SkillManager.
7. Publier l'événement `settings_changed` workspace existant pour chaque clé
   de paramètres de skill modifiée.

Une requête modèle en cours ne peut pas être réécrite. Les vérifications
d'exécution de skill ultérieures, les snapshots de commandes et les contextes
de modèle lisent le nouvel état.

## Consommateurs en aval

- Fusion des paramètres : les listes système par défaut, utilisateur,
  workspace et système forment l'ensemble effectif des noms désactivés avec
  la priorité `disabled > enabled > defaultDisabled`.
- Statut du workspace : le mapping de skills ACP et local au démon expose
  l'état de désactivation, la raison de désactivation, le scope de
  verrouillage et `userInvocable` faux uniquement.
- Slash commands : la construction des commandes disponibles supprime les
  skills désactivés et envoie les métadonnées de commandes mises à jour aux
  clients du démon.
- Contexte du modèle : les écouteurs de changement de SkillManager
  rafraîchissent la description de l'outil Skill et le contexte des skills
  disponibles.
- Validation d'exécution : l'outil Skill relit le fournisseur de noms
  désactivés avant l'invocation, de sorte que les appels ultérieurs sont
  rejetés immédiatement.
- État des extensions : les skills d'extensions inactives restent non
  basculables même lorsqu'ils ne sont pas désactivés par les paramètres.
- Cache du démon : le snapshot de skills de l'enfant live mis en cache est
  invalidé après la persistance afin que les requêtes GET ultérieures ne
  puissent pas rejouer un état obsolète.
- Consommateurs du SDK : les clients du workspace primaire et les clients
  qualifiés par workspace partagent le contrat de réponse et d'erreur.
- Événements : les consommateurs existants de `settings_changed` observent
  chaque valeur `skills.disabled` ou `skills.enabled` validée ; il n'y a pas
  de nouveau type d'événement.

## Comportement en cas d'échec

- Échec de persistance : la requête HTTP échoue ; pas de rafraîchissement ACP
  ni d'événement.
- Aucun enfant : la persistance réussit avec `deferred` ; le prochain enfant
  charge le paramètre au démarrage.
- Échec de rafraîchissement par session : la persistance reste validée ; les
  sessions réussies restent rafraîchies et la réponse est `partial`.
- Conflit de transport de l'enfant : si l'enfant disparaît après la
  vérification de vivacité, la réponse est `deferred` ; les autres échecs de
  rafraîchissement sont signalés comme `partial`.
