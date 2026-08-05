# Contrat de préchauffage ACP et compatibilité

## Contexte

Le démon expose `POST /workspace/acp/preheat` et
`GET /workspace/acp/status`, mais les clients publiés ne peuvent pas découvrir
ces routes via `/capabilities`. Le SDK TypeScript envoie également par défaut
les deux appels à travers son transport ACP actif alors qu'il s'agit de routes
REST du plan de contrôle du démon. Enfin, un waiter HTTP qui expire efface
actuellement la promise de préchauffage partagée du service de workspace alors
que l'initialisation du canal sous-jacent continue.

Ce changement rend les routes existantes du workspace primaire découvrables et
fiables. Il n'introduit pas d'état de disponibilité durable ni ne déplace la
barrière de la première Session. Une Session reste l'opération faisant
autorité : le préchauffage et la création de Session fusionnent à travers
l'initialisation partagée du canal du bridge, et la création de Session
revalide le canal après toute réponse de statut à un instant donné ou de
préchauffage.

## Capacités et périmètre

Le démon annonce deux tags de capacité v1 toujours actifs :

- `workspace_acp_preheat` pour `POST /workspace/acp/preheat`
- `workspace_acp_status` pour `GET /workspace/acp/status`

Chaque tag signifie que le contrat de la route nommée existe. Aucun tag ne dit
que le canal ACP est actuellement live. Les routes restent uniques et réservées
au workspace primaire. Les clients ne doivent pas les utiliser pour un
workspace secondaire ni retomber d'un workspace secondaire vers le runtime
primaire.

Le préchauffage qualifié par workspace nécessite des sémantiques distinctes de
propriété, de confiance, de drain et de limites de ressources, et est hors de
ce changement.

## Sémantique de réponse

`GET /workspace/acp/status` renvoie un snapshot à un instant donné :

```ts
{
  channelLive: boolean;
}
```

`POST /workspace/acp/preheat` préserve la forme de réponse existante :

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

Les invariants suivants s'appliquent :

- `ready` est toujours égal à `channelLive`.
- Un snapshot live renvoie `ready: true` sans `reason` ni `error`.
- Un timeout de waiter renvoie `reason: 'timeout'` uniquement si le canal
  n'est toujours pas live au moment où la réponse est construite.
- Une initialisation en échec, ou un préchauffage résolu qui n'a pas produit
  de canal live, renvoie `reason: 'error'`.
- `durationMs` est un entier fini et non négatif mesuré avec une horloge
  monotone. C'est le temps écoulé de l'appel HTTP en cours, pas la durée de
  vie d'une initialisation partagée que l'appel peut avoir rejointe.
- Le texte d'erreur visible par le client est stable et assaini. Les erreurs
  détaillées du processus enfant restent dans les journaux du démon.

Le timeout opérationnel et l'échec d'initialisation continuent d'utiliser
HTTP 200 afin que les clients existants puissent inspecter le résultat. Les
entrées invalides, l'authentification, la limite de débit et les échecs de
démarrage du runtime différé conservent leurs contrats d'erreur HTTP
existants.

## Concurrence et comportement en échec

Le service de workspace conserve une seule promise de préchauffage partagée
jusqu'à ce que cette promise se résolve. Chaque requête met la même promise en
course contre son propre timeout. Un timeout de waiter termine uniquement cette
requête ; il n'annule ni l'opération du bridge ni n'efface la promise
partagée. La résolution n'efface la promise que lorsque son identité
correspond encore à l'opération partagée en cours, de sorte qu'une complétion
plus ancienne ne puisse pas effacer une tentative plus récente.

Une fois l'opération partagée résolue, une requête ultérieure peut retenter si
le canal n'est pas live. Un canal qui se termine après une réponse réussie
n'est pas couvert par un bail : le statut rapporte le nouveau snapshot et la
prochaine Session ou le prochain préchauffage démarre un nouveau canal.

## Compatibilité client

Le SDK TypeScript envoie les deux routes via son chemin fetch REST quel que
soit le transport ACP configuré. Il ne récupère pas automatiquement les
capacités ; les appelants décident quand effectuer le précontrôle.

Le Web UI n'utilise les routes que dans son flux de bootstrap différé, sans
session. Il exige `workspace_acp_preheat`, conditionne l'optimisation
optionnelle de statut à `workspace_acp_status` et exige que le workspace
effectif corresponde exactement à `capabilities.workspaceCwd`. Une comparaison
exacte peut prudemment ignorer un préchauffage pour une orthographe
alternative du chemin primaire, mais elle ne peut pas préchauffer le mauvais
runtime.

Si un démon plus ancien omet les capacités, le Web UI n'effectue aucune
requête de statut ou de préchauffage ACP et la première Session suit le chemin
d'initialisation paresseux existant. L'échec du préchauffage reste best-effort
et ne peut pas faire échouer la connexion ou la création de Session.

## Non-objectifs

- Attendre le préchauffage avant la première Session
- Déplacer le préchauffage plus tôt dans le démarrage du démon ou du Web UI
- Un bail de disponibilité, une génération, un token ou un incrément de
  version de protocole
- Annuler l'initialisation partagée du canal lorsqu'un waiter HTTP expire
- Des routes de préchauffage ou de statut ACP qualifiées par workspace
- Prétendre à une amélioration de latence avec ce changement uniquement
  contractuel
