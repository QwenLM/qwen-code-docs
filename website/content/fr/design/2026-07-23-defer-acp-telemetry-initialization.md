# Reporter l'initialisation de la télémétrie ACP après l'initialisation du protocole

- **Issue** : #7264 candidat 2
- **Périmètre** : démarrage de l'enfant ACP avec télémétrie activée
- **Statut** : implémenté et validé

## Problème

Un enfant ACP démarre actuellement la télémétrie depuis le constructeur de
`Config`. L'appel est fire-and-forget, mais le chargement et l'évaluation de
l'implémentation de télémétrie et de la chaîne d'exporters configurée entrent
quand même en compétition pour la même boucle d'événements et le même CPU que
l'amorçage du CLI, le chargement des modules ACP, l'initialisation de la
configuration d'amorçage et le gestionnaire `initialize` du protocole. Sur un
hôte contraint, les mesures du candidat 1 ont montré que cette compétition
rajoute du travail dans la fenêtre d'initialisation visible par
l'utilisateur.

Les événements de télémétrie utilisent déjà une garde d'initialisation : les
événements émis avant que le SDK ait fini de démarrer sont abandonnés.
Différer le démarrage étend donc une fenêtre de perte existante plutôt que
d'introduire un nouveau modèle de mise en mémoire tampon ou d'ordre.

## Conception

La configuration ACP définit l'option existante
`deferTelemetryInitialization`. Cela supprime le démarrage fire-and-forget
du constructeur sans modifier les chemins par défaut, headless, stream-JSON,
TUI interactive ou runtime du démon.

`runAcpAgent` utilise le hook existant d'observation des messages sur son
transport NDJSON pour mémoriser l'ID JSON-RPC d'une requête `initialize`
entrante. Le hook s'exécute après que la requête parsée a été mise en file
mais avant que sa continuation de lecture en attente puisse la traiter. Pour
les messages sortants, le même hook ne s'exécute qu'après que la réponse
encodée a été écrite avec succès dans le flux stdout sous-jacent. Lorsqu'une
réponse réussie avec l'ID mémorisé est observée, l'enfant démarre la
télémétrie via la façade single-flight existante, enregistre sa gauge de
boucle d'événements uniquement après que cette initialisation s'est
stabilisée, et efface l'ID mémorisé. Cet ordre est requis car l'API des
métriques met en cache un meter no-op si une gauge est enregistrée avant que
le SDK installe le meter provider global.

Cela crée une frontière définie par le transport : le chargement de la
télémétrie ne peut pas commencer avant que l'écriture de la réponse
d'initialisation ne se résolve. Cela ne dépend pas d'hypothèses sur
l'ordonnancement de la boucle d'événements.

## Propriété et consommateurs en aval

L'enfant ACP a un unique SDK de télémétrie global au processus et un unique
`Config` d'amorçage. L'option différée est à portée de config, tandis que
l'initialiseur final est global au processus et single-flight. Les configs
par session continuent de partager ce SDK global au processus et ne
possèdent pas de runtimes de télémétrie indépendants.

Les consommateurs affectés sont :

- **Enfant d'amorçage ACP** : passe d'une télémétrie démarrée par le
  constructeur à une télémétrie démarrée par l'écriture de la réponse.
  L'enregistrement de sa gauge de boucle d'événements passe derrière
  l'initialisation du SDK afin qu'un enregistrement précoce ne puisse pas
  désactiver définitivement toutes les métriques.
- **Création de session et prompts ACP** : conservent les gardes
  d'initialisation existantes ; des événements très précoces peuvent
  désormais être abandonnés plus longtemps pendant que le chargement du SDK
  se termine.
- **TUI interactive ordinaire** : conserve le démarrage post-premier-rendu
  via `startPostRenderPrefetches`.
- **CLI headless et stream-JSON** : conservent le démarrage par le
  constructeur.
- **Runtime parent/démon de `qwen serve`** : conserve son initialisation et
  son arrêt différés explicites du runtime du cœur.
- **Nettoyage à la sortie du processus** : conserve `Config.shutdown()`. Un
  enfant qui se déconnecte avant une initialisation réussie du protocole ne
  démarre jamais la télémétrie. Si la déconnexion entre en concurrence avec
  un import juste démarré, le catch interne de l'initialiseur empêche un
  rejet non géré et le chemin externe ACP termine quand même le processus.
  Bien que `shutdownTelemetry()` puisse attendre un initialiseur en cours,
  `Config.shutdown()` ne l'appelle qu'après que le SDK rapporte être
  initialisé, donc le nettoyage actuel de la config peut sauter une
  initialisation encore en cours.

## Comportement en cas d'échec et de compatibilité

- Télémétrie désactivée reste un no-op de la façade après la réponse et ne
  charge aucun module lourd de télémétrie.
- Les événements d'amorçage one-shot émis avant la réponse, y compris
  l'événement initial `qwen-code.auth` et un événement précoce
  `qwen-code.config`, sont définitivement absents de la télémétrie ACP
  plutôt que simplement retardés. C'est le coût accepté du déplacement de
  l'initialisation du SDK derrière la réponse ; le changement ne synthétise
  ni ne met en mémoire tampon des événements de remplacement.
- Une requête `initialize` malformée ou rejetée ne démarre pas la
  télémétrie. Une requête initialize valide ultérieure peut encore la
  démarrer.
- Un échec d'écriture sur stdout n'exécute pas le hook de message envoyé,
  donc la télémétrie n'est pas démarrée pour une réponse que le client n'a
  pas reçue.
- Des réponses JSON-RPC répétées ou sans rapport ne peuvent pas démarrer la
  télémétrie car l'ID de requête et la forme de la réponse réussie doivent
  tous deux correspondre ; l'ID mémorisé est consommé une seule fois.
- Le chargement du SDK reste fire-and-forget et best-effort. Son
  implémentation existante rattrape les échecs d'import, d'assemblage et de
  démarrage.
- Aucun changement de forme du protocole, de capacité, de timing
  d'authentification, de sélection de provider, de comportement MCP ou de
  surface de configuration de la télémétrie.

## Alternatives rejetées

- **Démarrer dans `QwenAgent.initialize()`** : c'est avant que le
  gestionnaire ne retourne, et donc avant que le SDK puisse sérialiser ou
  écrire la réponse.
- **Utiliser `queueMicrotask`, `setImmediate` ou un timer après le retour du
  gestionnaire** : aucun ne prouve que la file d'écriture privée du SDK est
  terminée, et un timer ajoute une politique de latence arbitraire.
- **Envelopper ou forker `AgentSideConnection`** : inutile car le flux NDJSON
  local au package expose déjà des observations de messages après écriture.
- **Attendre la première réponse de session** : pourrait supprimer plus de
  compétition mais élargit la fenêtre d'événements abandonnés au-delà du
  candidat 2 et n'initialise jamais la télémétrie pour un canal initialisé
  mais idle.
- **Mettre en mémoire tampon la télémétrie précoce** : change sensiblement
  la sémantique de la télémétrie et la propriété mémoire ; le candidat 2
  accepte explicitement les événements précoces abandonnés.

## Vérification

Les tests unitaires couvrent le report de la config ACP et l'ordre exact du
transport : aucun démarrage à la réception, sur réponse sans rapport, sur
réponse d'erreur ou sur écriture échouée ; un unique démarrage après que la
réponse réussie correspondante a été écrite. Les tests de transport existants
prouvent que les hooks d'envoi s'exécutent après l'écriture sous-jacente et
sont sautés en cas de rejet de l'écriture.

Le bundle de release est exercé à travers le véritable chemin parent/enfant
ACP avec la télémétrie activée et désactivée. Les vérifications de
compatibilité couvrent les canaux à froid et préchauffés, les premières
sessions concurrentes, le mode session unique legacy, la déconnexion
précoce, le nettoyage et la production d'enregistrements outfile.

Le changement n'est fusionné que s'il passe la porte 2C4G de #7264 : 30
démarrages à froid séquentiels appariés alternés rapportant
`channel.initialize`, enfant process→réponse initialize, requête de session
à froid, process→première session, pic RSS, comportement préchauffé et
compatibilité télémétrie activée/désactivée. Comme le travail est déplacé
plus tard plutôt que supprimé, la porte doit rapporter à la fois le timing
d'initialisation et celui de première session ; un gain simplement repayé
avant la première session n'est pas traité comme une optimisation réussie.

## Résultats

Le contrôle était `origin/main` à
`14f1f2bb365280a6e1d4a45b452f7992f1928187` ; le candidat était le même commit
plus exactement ce changement du working tree. Les deux bundles de release
ont été construits depuis le même lockfile et testés sur l'hôte Linux fourni
avec 2 vCPU, environ 3,5 GiB de RAM, sans swap, et Node.js bundlé 22.23.1.

Avec la télémétrie outfile activée, 30 démarrages à froid appariés alternés
ont produit :

| Métrique                             | Contrôle P50 / P95   | Candidat P50 / P95    | Delta P50    |
| ------------------------------------ | -------------------- | --------------------- | ------------ |
| `channel.initialize`                 | 942,1 / 1245,0 ms    | 898,3 / 1002,4 ms     | **-43,8 ms** |
| Enfant process→réponse initialize    | 947,0 / 1249,8 ms    | 903,0 / 998,4 ms      | **-43,9 ms** |
| `POST /session` à froid              | 1235,5 / 1591,7 ms   | 1245,1 / 1462,0 ms    | +9,6 ms      |
| Process→première session             | 1833,1 / 2190,6 ms   | 1845,5 / 2417,0 ms    | +12,4 ms     |
| Pic RSS                              | 418,7 / 443,6 MiB    | 406,7 / 438,4 MiB     | -11,9 MiB    |

La distribution appariée montrait `channel.initialize` plus rapide dans 26
des 30 paires avec un delta de médiane appariée de -44,2 ms. La requête de
session à froid et process→première session avaient des deltas de médiane
appariée de +15,0 ms et +13,8 ms respectivement, avec des victoires du
candidat dans 13/30 et 11/30 paires. L'intervalle bootstrap à 95 % apparié
de process→première session était de -2,8 à +27,5 ms, donc cette exécution
n'a établi ni une régression ni une amélioration de bout en bout. Le
changement ne revendique donc que le gain direct à la frontière
d'initialisation ACP.

Dans la phase préchauffée de 30 paires de la même exécution,
`channel.initialize` s'est amélioré de 950,5 / 1323,7 ms à 908,4 / 964,4 ms
P50/P95. La requête de session déjà préchauffée est passée de 82,1 / 94,8 ms
à 83,7 / 131,6 ms, tandis que process→session passait de 3683,5 / 4105,0 ms
à 3686,1 / 3749,2 ms. Les médianes appariées de session et de
process→session étaient de +1,4 ms et +1,0 ms respectivement. Deux outliers
de session isolés du candidat et plusieurs outliers d'initialisation du
contrôle ont élargi les valeurs P95 non appariées ; les médianes appariées
sont restées neutres. Aucun changement de mémoire préchauffée n'est
revendiqué.

Les exécutions fonctionnelles du candidat ont passé les premières sessions
concurrentes, la télémétrie désactivée avec zéro enregistrement, et le mode
session unique legacy. Les 120 exécutions de benchmark avec télémétrie
activée ont rapporté un profil de démarrage valide et un outfile non vide,
et chaque exécution s'est terminée sans processus résiduel. Un smoke du
bundle de release à travers le client ACP officiel a en plus attendu au-delà
de l'intervalle d'export des métriques et confirmé à la fois
`qwen-code.session.count` et `qwen-code.acp.event_loop.lag`, en se gardant
contre un enregistrement sur un meter no-op en cache. Deux smokes de prompt
live avec télémétrie activée contre l'endpoint OpenAI-compatible disponible
se sont tous deux terminés et ont produit des outfiles de télémétrie non
vides. Les tests de smoke directs du bundle ACP ont aussi passé les deux
frontières de déconnexion précoce : un EOF avant initialize s'est terminé
proprement sans démarrer la télémétrie, tandis qu'un EOF immédiatement après
une réponse initialize réussie s'est terminé proprement après création de
l'outfile, sans aucune sortie stderr dans les deux cas.

Les artefacts bruts de l'hôte sont sous :

- `/root/qwen-7264-c2-20260723/results/fixed-formal-rerun/2026-07-23T05-14-14.236Z`
- `/root/qwen-7264-c2-20260723/results/prompt-smoke/2026-07-23T03-23-26.883Z`
