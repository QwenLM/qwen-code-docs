# Modèle de capacité du démon et limites mémoire

## Contexte

L'issue [#8051](https://github.com/QwenLM/qwen-code/issues/8051) observe que
le démon limite les workspaces et sessions enregistrés par nombre, et que des
limites en nombre ne sont pas des limites mémoire.
[#8091](https://github.com/QwenLM/qwen-code/issues/8091) propose de livrer le
correctif en sept PR, dont [#8093](https://github.com/QwenLM/qwen-code/pull/8093)
est la première : un `ResourceBudget` à l'échelle du processus sur le heap
JavaScript du root du démon, avec quinze catégories d'octets, une admission
composée atomique, des baux divisibles et transférables, trois ordonnanceurs
équitables à portée `AsyncLocalStorage`, et un modèle de facturation par proxy
de heap qui tarifie une valeur JavaScript à deux octets par unité de code de
chaîne, 96 octets par nœud objet et 16 octets par propriété.

Ce document propose une décomposition différente du même problème. Il est
d'accord avec la prémisse de #8051 et avec l'instinct de #8091 de livrer
incrémentalement. Il est en désaccord sur quel processus détient la mémoire,
quel mécanisme peut la borner et quel changement doit arriver en premier.

Les trois constats ci-dessous proviennent d'une lecture du démon tel qu'il
existe aujourd'hui.

### Le démon n'est pas un seul processus

`ServeMode` est `http-bridge` (`packages/cli/src/serve/types.ts:18-35`) : le
démon préchauffe un enfant `qwen --acp` par runtime de workspace, et plusieurs
sessions d'un runtime se multiplexent sur cet enfant via
`connection.newSession()`. Le root du démon relaie le NDJSON ACP sur HTTP et
SSE. Le RSS par session d'environ 30–50 Mo — le chiffre au regard duquel
`maxSessions` est documenté dans `types.ts:58-68` — est dépensé à l'intérieur
de l'enfant, pas du root.

Le RSS agrégé des enfants est donc là où part la mémoire en régime permanent
multi-workspace, et un budget d'octets sur le heap du root ne l'observe pas,
ne le borne pas et ne le refuse pas.

C'est un argument contre un _registre universel du heap du root comme
frontière à l'échelle du démon_, pas contre la protection locale au root. Le
root possède toujours l'assemblage du NDJSON ACP, les anneaux de relecture
EventBus, les snapshots de sous-agents virtuels, le chargement des réglages,
l'export des sessions actives, les files HTTP et WebSocket et les caches à
portée de génération, et chacun d'eux peut l'épuiser indépendamment de tout
enfant. La partie 3 ci-dessous est entièrement un travail côté root pour
exactement cette raison.

### Le modèle de capacité est découplé de la mémoire de l'hôte

Trois knobs décident combien de mémoire le démon peut consommer. Chacun est
dérivé indépendamment, et aucun code ne les réconcilie :

| Knob                  | Dérivation                                                  | Emplacement                                                |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Workspaces enregistrés | constante fixe `25`                                         | `packages/acp-bridge/src/channel-control-timeouts.ts:7` |
| Sessions totales        | `maxSessionsPerWorkspace × workspaceCount`                  | `packages/cli/src/serve/run-qwen-serve.ts:391`          |
| Heap V8 par enfant     | `max(min(50% de la mémoire cgroup-ou-hôte, 16 Go), défaut V8)` | `packages/acp-bridge/src/spawnChannel.ts:18-36`         |

Le troisième est le significatif. `getAcpMemoryArgs()` calcule une valeur, la
met en cache dans une variable au niveau module et l'applique à **chaque**
enfant spawné. C'est une fraction de l'hôte, pas une part de quoi que ce soit.

Le terme `max(…, défaut V8)` n'est pas évident dans le code et compte double.
Le flag n'est émis que quand la cible calculée dépasse le `heap_size_limit`
**du démon spawneur lui-même** (`spawnChannel.ts:27-34`), donc sur des hôtes
où la cible est plus petite, le flag est abandonné et l'enfant hérite
silencieusement du défaut de V8 — qui est lui-même dérivé de la mémoire de
l'hôte. Mesuré sur un hôte de 3,4 Go : cible 1747 Mo, limite du démon
1795 Mo, flag abandonné, plafond de l'enfant 1795 Mo. Sur un hôte de 32 Go,
le défaut est d'environ 4 Go, la cible est de 16384 Mo et le flag est émis.

Le total autorisé est donc de 25 × 16 Go sur un hôte de 32 Go et de
25 × ~1,8 Go sur un hôte de 3,4 Go — un sur-engagement d'environ un facteur
douze dans les deux cas, et le seul effet de la garde aujourd'hui est de lever
un plafond, jamais d'en abaisser un. Cette dernière propriété est la raison
pour laquelle le changement ci-dessous doit explicitement la contourner.

Aucune comptabilité d'octets dans le processus root ne change aucun de ces
nombres, car le root n'est pas le processus qui les alloue.

### Le démon mesure la mémoire mais n'a pas de dénominateur

`DaemonMetricsRing` échantillonne déjà `rssBytes`, `heapUsedBytes`,
`cpuPercent` et `eventLoopLagP99Ms` toutes les cinq secondes dans un anneau de
180 buckets, donnant quinze minutes d'historique, et il sonde déjà le RSS de
l'enfant ACP principal avec une garde single-flight et une falaise d'obsolescence
de 30 secondes (`packages/cli/src/serve/daemon-metrics-ring.ts`, câblé dans
`run-qwen-serve.ts:4231-4377`). `GET /daemon/status` retourne tout cela.

Ce qui manque au démon, c'est un chiffre par lequel diviser. Il n'y a pas de
lecture de cgroup, pas de `heap_size_limit`, pas de ratio, pas de niveau de
pression, pas de code d'issue dérivé de la mémoire, pas de champ mémoire
`limits.*` et aucun flag CLI nulle part dans le processus du démon. Le
`MemoryPressureMonitor` de Core calcule tout cela, mais
`computeEffectiveMemoryLimit()` est une méthode privée
(`packages/core/src/services/memoryPressureMonitor.ts:766`) d'une classe
construite uniquement par `Config.initialize()`, que le démon n'appelle
jamais. Les enfants des workspaces secondaires et tous les workers de canal ne
rapportent aucun RSS.

Le démon peut dire combien d'octets il utilise et ne peut pas dire si c'est
beaucoup.

## Problème

Énoncé précisément : **le modèle de capacité du démon n'a aucun rapport avec
la mémoire de l'hôte, et le démon ne peut pas observer à quel point il est
proche de l'épuisement.** Séparément et indépendamment, un petit ensemble
énumérable de conteneurs du processus root est réellement sans limite —
n'importe lequel d'entre eux peut épuiser le root à lui seul, sans qu'un seul
enfant soit impliqué. Les deux sont réels ; aucun des deux n'est une raison de
construire une couche de comptabilité générale sur chaque allocation.

## Objectifs

- Dériver les knobs de capacité d'un seul chiffre mémoire, afin que le plafond
  de heap d'un enfant soit une part de quelque chose plutôt qu'une fraction de
  l'hôte répétée par enfant.
- Donner au démon un dénominateur, afin que la pression soit observable avant
  d'être fatale.
- Borner les conteneurs réellement sans limite, au niveau du conteneur.
- Borner l'_agrégat_ de nombreux conteneurs bornés individuellement, quand la
  multiplicité fait de la somme le vrai risque.
- Garder chaque changement independently revivable et indépendamment utile —
  et garder chacun honnête sur les chemins qu'il couvre.

## Non-objectifs

- Pas de registre d'octets à l'échelle du processus sur le heap du root, et
  pas de modèle de facturation par proxy de heap. Voir « Alternatives
  rejetées ».
- Pas de remédiation dans le travail d'observation : pas de GC forcé, pas
  d'éviction LRU, pas de fermeture de session, pas de terminaison de
  processus.
- Pas de changement du comportement mémoire du CLI interactif ou du compagnon
  IDE.
- Pas de _garantie_ mémoire RSS ou d'arbre de processus. La partie 1 borne
  l'old space V8 des enfants ACP ; les Buffers, les allocations natives, les
  workers de canal et les descendants MCP sont hors de son périmètre.
- Pas de couche d'ordonnancement générale maintenant. L'admission au moment du
  spawn est sur le chemin — c'est ce que tout budget d'enfants live
  applicable exige — mais elle attend les données de la partie 2, et les
  voies E/S intensives et processus attendent une preuve d'amplification de
  concurrence. Voir « Alternatives rejetées ».

## Principe de design

**Faire de la limite une propriété du conteneur, pas une promesse de
l'appelant.**

Une réservation déclarée par l'appelant ne vaut que ce que vaut l'appelant. Le
`runBufferedProcessOperation(scheduler, budget, cwd, operation, maximumBufferedBytes, task)`
de #8093 accepte un nombre d'octets que l'appelant affirme et rien ne le
réconcilie avec la sortie réelle du processus ; un appelant qui déclare 1 Mo
et émet 500 Mo laisse le registre rapporter la bonne santé pendant que le heap
grandit. Généraliser ce motif signifie que chacun des plusieurs centaines de
sites d'allocation doit se souvenir d'estimer, réserver et libérer sur chaque
chemin, pour toujours, sans assistance du compilateur. La couverture sera
partielle. Une couverture partielle n'est pas inutile — elle est correcte, et
normale, quand le statut et les capacités nomment exactement quels chemins
sont protégés, ce qui est une discipline que le propre plan de livraison de
#8093 impose déjà. Le mode d'échec est plus étroit que « partiel » : c'est
annoncer une garantie à l'échelle du démon au-dessus d'une comptabilité
incomplète, de sorte que les chemins comptabilisés commencent à refuser du
travail avec des 503 pendant que les chemins non comptabilisés sont ceux qui
épuisent le heap.

Ce principe est déjà le style maison, et le meilleur travail de ce dépôt le
suit :

- `readTextRangeFromHandle` prend deux budgets d'octets **requis** —
  `maxOutputBytes` pour ce qu'une lecture retourne et `maxScanBytes` pour ce
  qu'elle coûte — parce qu'« un appelant saisit un handle précisément quand il
  a besoin que la lecture soit bornée »
  ([`2026-07-29-handle-bound-text-range-reads.md`](./2026-07-29-handle-bound-text-range-reads.md)).
  Il vérifie l'accumulateur à chaque chunk, pas à chaque trame, parce qu'« une
  région sans retour à la ligne le ferait autrement grandir jusqu'à ce que
  tout le fichier soit résident »
  (`packages/core/src/utils/read-text-range.ts:350-353`).
- `packages/cli/src/serve/fs/policy.ts:33-62` sépare la troncature douce
  (`enforceReadSize`) du rejet dur (`enforceWriteSize`,
  `enforceReadBytesSize`), et dimensionne `MAX_WRITE_BYTES` délibérément sous
  la limite de corps Express afin qu'un corps qui survit au parseur survive à
  la gate de politique.
- La fenêtre de relecture bornée
  ([`2026-07-07-bounded-replay-snapshot-window.md`](./2026-07-07-bounded-replay-snapshot-window.md))
  plafonne la relecture retenue par octets sérialisés, conserve au moins une
  unité quand une seule unité dépasse le plafond et expose la perte comme un
  marqueur explicite `history_truncated` plutôt que de tronquer
  silencieusement. Sa note d'audit du tour 3 consigne directement la leçon :
  « Un plafond en nombre de tours ne borne pas la mémoire quand un tour
  contient une grande sortie d'outil. »

Le travail ci-dessous généralise ceux-là. Il n'ajoute pas un second paradigme
à côté d'eux.

## Design

### Partie 1 — Un budget, un dénominateur, rapportés avant d'être appliqués

Résoudre les chiffres mémoire du démon une fois et les rapporter. Rien ne les
consomme encore pour dimensionner un enfant, et cette retenue est le design,
pas une commodité de mise en scène.

```
availableMemoryMb        = limite cgroup, sinon os.totalmem()          (plafonné au total de l'hôte)
configuredBudgetMb  = --memory-budget-mb ?? floor(availableMemoryMb * 0.5)
effectiveBudgetMb   = min(configuredBudgetMb, availableMemoryMb)
rootReserveMb       = min(clamp(floor(effectiveBudgetMb * 0.1), 256, 1024), effectiveBudgetMb)
childPoolMb         = effectiveBudgetMb - rootReserveMb
legacyChildCeilingMb     = min(floor(availableMemoryMb * 0.5), 16384)     // ce qu'un enfant obtient aujourd'hui
insufficientMemory  = effectiveBudgetMb < 1024
```

Configuré et effectif sont séparés parce qu'ils divergent dans les deux
directions, et les fusionner produit un dénominateur que la machine ne peut
pas tenir. Un budget explicite plus grand que l'hôte est plafonné vers le bas.
Un budget dérivé sous le minimum documenté n'est **pas** remonté — un
brouillon antérieur faisait exactement cela, et un hôte de 768 Mo rapportait
en conséquence un budget de 1024 Mo, ce qui aurait empoisonné chaque ratio que
le travail d'observation est censé calculer. Un hôte trop petit est une
observation (`insufficientMemory`), pas une licence pour inventer de la
capacité.

`recommendedChildShareMb(budget, children)` est exporté et rapporté à la fois
au nombre d'enfants enregistrés et au nombre d'enfants live. Il n'est jamais
appliqué. L'écart entre ces deux nombres est la raison de les rapporter.

#### Pourquoi la part n'est pas appliquée

Diviser le pool par un nombre de workspaces échoue selon ses propres termes,
et ce document le proposait auparavant :

- **L'enregistrement n'est pas l'allocation.** Un runtime de workspace spawne
  son enfant paresseusement et `channelIdleTimeoutMs` vaut par défaut `0` —
  « tue le canal immédiatement »
  (`packages/acp-bridge/src/bridgeOptions.ts:415-422`) — donc un secondaire
  dormant n'a pas d'enfant. Le primaire préchauffé est l'exception.
- **Un diviseur par nombre enregistré a un coût réel et n'achète rien.** Sur
  un hôte de 32 Go avec 25 workspaces enregistrés et seul le primaire
  préchauffé live, cet enfant passerait d'un plafond de 16384 Mo à 614 Mo —
  une coupe de 26,7× causée par 24 enregistrements ne détenant aucune
  mémoire. Pendant ce temps, le plancher par enfant fait que les parts
  divisées dépassent quand même le pool : sur un hôte de 8 Go, 25 enfants au
  plancher de 512 Mo autorisent 12800 Mo contre un pool de 3687 Mo.
- **L'enregistrement dynamique ne laisse aucun nombre sain.** Un nombre au
  démarrage manque les workspaces ultérieurs ; le recalcul ne peut pas
  rétrécir le heap V8 d'un enfant en cours d'exécution ; le nombre enregistré
  actuel pénalise les workspaces dormants. Diviser plutôt par les enfants
  _live_ donne quand même des plafonds qui dépendent de l'ordre de spawn, et
  toujours aucune limite agrégée.

Le vrai contrôle est une admission au moment du spawn indexée sur les enfants
simultanément live, avec une politique déclarée pour ce qui arrive quand
l'enfant suivant dépasserait le pool. Cela a besoin des données que la partie
2 produit, donc c'est reporté plutôt que deviné.

#### Ce qu'une politique de capacité des enfants devra respecter quand elle arrivera

- **`--max-old-space-size` borne l'old space de V8, pas le RSS.** Il ne couvre
  pas les Buffers, les allocations externes et natives, la jeune génération,
  les workers de canal, les descendants MCP ni aucun autre processus enfant.
  Toute politique ici est une _politique de heap d'enfant_, jamais une
  garantie mémoire d'arbre de processus, et la réserve du root est une
  couverture plutôt qu'une comptabilité de ces consommateurs.
- **Appliquer une part est un changement de compatibilité même sans refus**,
  car cela modifie le GC et le comportement OOM des enfants. Cela ne peut pas
  être livré comme « rapport uniquement ».
- **Elle ne doit jamais lever un plafond.** Le clamp à
  `legacyChildCeilingMb` est ce qui rend la politique sûre à appliquer
  inconditionnellement ; sans lui, la constante de budget minimum et un flag
  explicite trop grand gonflent tous deux la part.
- **Le chemin de spawn a un piège.** `getAcpMemoryArgs()` n'émet
  `--max-old-space-size` que quand sa cible calculée dépasse le
  `heap_size_limit` _du démon spawneur lui-même_
  (`spawnChannel.ts:27-34`). Une part dérivée du budget est normalement en
  dessous, donc un changement naïf est silencieusement abandonné et le
  sur-engagement revient. Le test de régression doit affirmer que le flag
  survit à une valeur sous la propre limite du processus de test.

### Partie 2 — Observer, avec un dénominateur, avant d'appliquer

L'échantillonneur existant de cinq secondes gagne la limite mémoire effective,
`v8.getHeapStatistics().heap_size_limit`, et le RSS agrégé des enfants sur
**tous** les enfants de workspace et workers de canal plutôt que le principal
seul. Le statut gagne `runtime.memory { level, ratio, source }` et deux codes
sur l'union d'issues fermée dans `daemon-status.ts:70-85`.

Le flag de mode suit l'idiome établi `--mcp-client-budget` /
`--mcp-budget-mode` : `off | warn | enforce`, avec `warn` par défaut quand un
budget est défini, et `enforce` rejeté au démarrage jusqu'à ce qu'un changement
ultérieur le mérite. Rien dans cette partie ne remédie.

C'est délibérément promu avant le travail de plafonnement d'octets. C'est la
seule pièce dont la valeur ne dépend pas que le reste du design soit correct,
et chaque limite choisie plus tard devrait être calibrée sur ses données
plutôt que devinée. La table de limites de #8093 est un argument plus faible
pour cet ordre qu'elle n'y paraît, et la forme plus faible est la forme
honnête : `prompt: 384 MiB` est exactement `normalAdmissionBytes` et donc
redondant, mais les catégories à 256 MiB ne sont _pas_ mortes — une seule
catégorie atteignant 256 MiB contraint bien avant que l'usage normal total
atteigne le plafond de 384 MiB. Le problème de la table est simplement que les
constantes ne sont pas calibrées, ce que l'observation corrige.

### Partie 3 — Borner les conteneurs réellement sans limite

Ordonnés par risque mesuré, chacun livrable indépendamment.

**Le lecteur de trames NDJSON n'a aucune limite d'aucune sorte.**
`packages/acp-bridge/src/ndJsonStream.ts:35` déclare `pending: Uint8Array[]`,
pousse les octets de queue non terminés à `:92` et ne vérifie jamais un nombre
ni un total d'octets. `takeLineBytes` (`:96-111`) alloue ensuite une copie
contiguë unique du total accumulé, `TextDecoder.decode` produit une chaîne
UTF-16 d'environ le double, et `JSON.parse` construit à nouveau des objets —
environ une amplification par cinq sur une trame qui n'a pas de limite
supérieure. C'est le côté lecture du stdout de chaque enfant ACP spawné, et
`packages/cli/src/serve/large-pipe-frame-observer.ts:10` ne journalise que les
trames au-dessus de 256 KiB. Le correctif est un plafond d'octets de trame
vérifié à chaque chunk, une erreur fatale typée sur les flux gérés par le
démon, et une stratégie de mise en file sur le `ReadableStream` de messages
décodés à `:33`, qui ne consulte jamais `desiredSize` et est un second tampon
sans limite derrière un consommateur lent. `createStderrForwarder`
(`spawnChannel.ts:58-72`, 64 KiB avec un marqueur `[truncated]`) et le tampon
de log du worker de canal (`channel-worker-supervisor.ts:67-69`) sont les
modèles du dépôt.

**L'anneau de relecture d'EventBus ne borne que par nombre de trames.**
`packages/acp-bridge/src/eventBus.ts:473` expulse sur
`ring.length > ringSize`, par défaut 8000 trames, par session, réglable
jusqu'à un million. C'est voyant parce que tout ce qui entoure l'anneau est
déjà borné en octets : files par abonné à 2 MiB, rafale de relecture à 8 MiB,
journal à 8 MiB, relecture compactée à 4 MiB. L'anneau est le trou, et il
multiplie les trames sans limite ci-dessus par 8000. La taille sérialisée est
**déjà calculée et à portée** à `:459`, où elle est remise au moteur de
compactage ; l'appliquer à l'anneau est un total courant, une boucle
d'expulsion sur les deux bornes, et la garantie de conserver au moins une
unité que le moteur de compactage implémente déjà.

**Les transcriptions de sous-agents virtuels sont lues en entier.**
`packages/cli/src/serve/virtual-subagent-sessions.ts:331,385` appellent
`Buffer.alloc(size - this.offset)` avec `this.offset === 0` à la première
lecture, matérialisant toute la transcription `.jsonl` et, séparément, tout le
sidecar `.stream`, puis `.toString('utf8')`, puis `.split('\n')`, puis un
parse par ligne. `createSnapshotOnce` (`:593-620`) construit une seconde cible
et relit toute la transcription, laissant deux à trois copies live. Le lecteur
paginé et le motif de curseur d'octets déjà en cours sont le remplacement.

**Le chargement et l'export de session sont plafonnés asymétriquement.**
`packages/cli/src/serve/server/session-export.ts:83-108` passe un plafond
d'octets sur la branche archivée et appelle `loadSession()` sans plafond sur
la branche active — le même chemin non plafonné utilisé par le chargement et
la reprise du démon. Le plafond archivé est de 256 Mo de JSONL, qui parsent en
un à deux gigaoctets d'objets, donc aucune des deux branches n'est une vraie
limite. `session-transcript-reader.ts` est le modèle correct et est déjà
présent.

**Les fichiers de configuration fournis par le workspace sont lus sans gate de
taille.** `fs.readFileSync(path, 'utf-8')` sur le `.qwen/settings.json` du
workspace (`packages/cli/src/config/settings.ts:557,733`), les dossiers
fiables, le fast path de serve (synchrone, donc il bloque aussi la boucle
d'événements), et chaque `QWEN.md` découvert, vingt en parallèle
(`packages/core/src/utils/memoryDiscovery.ts:225,245`). Enregistrer un
workspace contenant un `settings.json` de deux gigaoctets épuise le démon sans
session, sans prompt et sans agent — l'attaque la moins coûteuse de l'ensemble,
et la plus éloignée de tout ce qu'un registre de heap remarquerait.

Enregistrés et reportés avec preuves : les chaînes d'écriture SSE et WebSocket
respectent la contre-pression mais ne bornent pas les octets en file
(`acp-http/sse-stream.ts:110-128`, `ws-stream.ts:58-82`) ; les tampons de
trames pré-attach ACP reflètent le `maxQueued` d'EventBus mais pas son
`maxQueuedBytes` (`connection-registry.ts:18,30`) ; la liste de sessions
organisée matérialise 50 000 résumés ; plusieurs caches par workspace
survivent à leur workspace.

### Partie 4 — De petits quotas agrégés là où la multiplicité compte

Borner un conteneur borne un conteneur. Cela ne borne pas _N_ d'entre eux, et
la forme du démon est de nombreuses petites choses bornées : 32 sessions par
workspace, 25 workspaces, un journal de 8 MiB et une relecture compactée de
4 MiB chacun. Chacune d'elles peut rester dans sa limite documentée pendant
que le total atteint plusieurs gigaoctets. La partie 3 seule ne produit donc
pas de limite agrégée, et affirmer le contraire répéterait l'erreur que ce
document reproche à #8093.

Ce qui est nécessaire est étroit : des compteurs par workspace et à l'échelle
du processus sur les anneaux retenus, les files, les caches et les grandes
opérations concurrentes, mis à jour aux points réels d'insertion et de
retrait. Deux propriétés empêchent cela de redevenir le registre de #8093 — il
compte les octets qu'un conteneur **retient réellement** plutôt qu'un coût
estimé d'objets V8, et il est maintenu là où la structure de données mute déjà
plutôt qu'à un appel de réservation séparé que chaque appelant doit se
rappeler. Le `maxQueuedBytes` par abonné existant d'`EventBus` est la forme à
copier ; il est déjà correct, juste pas agrégé.

Le périmètre et les constantes de ceci appartiennent après la partie 2, pour
la même raison que ses constantes.

### Helpers partagés, extraits au deuxième consommateur

`truncateUtf8` existe en deux copies privées. Un conteneur borné par nombre,
octets et TTL est correctement implémenté une fois
(`session-transcript-reader.ts:148-150`) et approximé ailleurs. REST et ACP
maintiennent deux mappings écrits à la main sur un seul ensemble de classes
d'erreur partagé, dont `FsError` (`fs/errors.ts:101`) est le seul membre
portant son propre statut HTTP. Chacun mérite d'être unifié quand un deuxième
consommateur apparaît dans ce travail, et pas avant.

## Alternatives rejetées

**Un registre d'octets à l'échelle du processus sur le heap du root (le
`ResourceBudget` de #8093).** Il budgète le root, là où la mémoire n'est pas ;
ses constantes de proxy de heap n'ont pas de rapport stable avec V8, qui
représente les chaînes comme des cordes, des slices ou des données externes et
tarife les objets par le partage de hidden classes, de sorte que l'erreur est
d'un facteur deux à cinq dans les deux directions ; et ses catégories sont
globales plutôt que par workspace, donc elles ne livrent pas l'isolation de
tenue que #8051 demande. Ses propres valeurs par défaut montrent la difficulté
de choisir des nombres sans mesure, comme noté ci-dessus.

Deux propriétés d'implémentation confirmées en exécutant la branche méritent
d'être consignées pour ne pas être re-dérivées plus tard.
`ResourceBudget.release()` et `ResourceBudgetLease.commitGrow()` sont publics
et non validés, de sorte qu'un seul appel parasite fait passer `usedBytes` en
négatif et chaque plafond ultérieur cesse silencieusement de contraindre ; et
`grow()` accepte un bail appartenant à un autre budget, ce qui corrompt les
deux. Séparément, `emergencyPoolBytes` devient `0` chaque fois que `capBytes`
est fourni (`resource-budget.ts:199-201`), de sorte que la réserve qui existe
pour rendre possibles l'arrêt et les réponses de surcharge disparaît
précisément quand un opérateur configure un budget — ce que ferait
`--memory-budget-mb`.

**Une nouvelle couche d'ordonnancement équitable, telle qu'écrite
(`FairDaemonBulkScheduler` et ses voies spawn et processus).** Chaque point
chaud énuméré ci-dessus est un problème de taille ; aucun n'est corrigé en
admettant moins d'opérations concurrentes. Les primitives de concurrence
existent déjà et sont utilisées : `createFifoTaskQueue(limit)`
(`extension-operation-scheduler.ts:31`) avec admission FIFO, défilement par
`AbortSignal` et `runUntilReleased` pour la libération anticipée de créneau ;
`PathMutexRegistry` pour les verrous indexés ; et
`createTotalSessionAdmissionController`
(`total-session-admission.ts:40-121`) pour l'admission en nombre avec
libération idempotente et erreurs typées, ce qui fournit aujourd'hui
l'isolation par workspace.

Les voies proposées portent aussi des défauts qui plaident contre leur
adoption comme fondation : l'`AbortSignal` est accepté mais jamais transmis à
la tâche, donc annuler une requête ne la défile que pendant qu'elle est en
file et laisse un processus enfant en cours d'exécution tenir son créneau ;
les acquisitions imbriquées et inter-voies sont des 503 durs propagés par
`AsyncLocalStorage` à tout le travail asynchrone hérité, ce qui échoue la
première fois qu'une opération de masse a légitimement besoin de spawner ; et
les voies spawn et processus fixent la limite active par workspace égale à la
limite globale, de sorte qu'un workspace peut occuper tous les créneaux. C'est
un argument pour reporter et réduire l'ordonnanceur, pas pour l'exclure, et le
brouillon antérieur de ce document le surestimait. Les primitives existantes
ne sont pas des substituts complets : `createFifoTaskQueue` n'a pas de limite
d'attente ni de timeout, `PathMutexRegistry` peut accumuler une chaîne de
promesses sans limite, et `createTotalSessionAdmissionController` limite les
nombres de sessions mais pas le spawn d'enfants, le décodage du système de
fichiers ou les processus externes. Plus décisif, **tout budget d'enfants live
applicable exige une admission au moment du spawn** — ce qui est précisément
une voie d'ordonnancement. Donc l'admission au spawn est sur le chemin ; les
voies E/S intensives et processus doivent attendre des mesures montrant une
amplification de concurrence ou une famine inter-workspace, et si l'équité par
workspace est nécessaire, un round-robin indexé sur la file existante fait
environ quarante lignes face à une primitive testée.

**`AsyncLocalStorage` sur le chemin de requête du démon.** Il n'y en a pas
aujourd'hui dans `packages/cli/src/serve` ni `packages/acp-bridge`.
L'attribution de workspace circule déjà explicitement comme
`WorkspaceRequestContext.workspaceCwd` (`workspace-service/types.ts:68-77`)
et comme `AuditContext` à travers la frontière du système de fichiers. Ajouter
une propagation implicite pour porter des données déjà portées explicitement
ajoute un mécanisme sans ajouter d'information.

## Compatibilité

Les chemins du CLI interactif, du compagnon IDE et du bridge d'intégration
directe sont inchangés : ils spawnent un enfant et conservent le plafond dérivé
de l'hôte.

La partie 1 ne change aucun argument de spawn d'enfant, donc il n'y a aucun
changement de la façon dont un enfant est dimensionné, sur aucun hôte. Le seul
nouveau comportement au démarrage est le rejet d'un `--memory-budget-mb` hors
plage, et un fil d'Ariane sur stderr quand un budget est explicitement défini
ou que l'hôte est sous le minimum documenté.

La discussion de compatibilité qui a sa place ici est celle de la politique de
capacité des enfants qui suit, et elle est reportée avec elle. Ce qui peut être
dit maintenant : cette politique abaissera les plafonds et ne devra jamais les
lever, ce sera un changement de compatibilité même sans refus, et elle a besoin
d'une règle d'admission pour le cas où un enfant déjà en cours d'exécution ne
peut pas être rétréci.

Aucun nouveau refus n'est introduit. Le seul nouvel échec au démarrage est la
forme de validation existante pour un `--memory-budget-mb` hors plage.
L'enregistrement de workspace, la restauration persistée et
`POST /workspaces` sont inchangés.

`maxSessions` et `maxTotalSessions` conservent leurs valeurs par défaut et
leur dérivation actuelles, et ce changement ne leur donne aucune nouvelle
limite. Un brouillon antérieur affirmait que `maxTotalSessions` était
transitivement borné parce que `workspaceCount` serait plafonné par le budget
; c'est faux pour cette PR, où le plafond de workspace reste le
`MAX_REGISTERED_WORKSPACES = 25` fixe et rien ne dérive une limite du budget.
Les sessions se multiplexent toujours sur un enfant par workspace, donc la
mémoire par session réside dans un heap d'enfant que rien ne borne
actuellement au-delà du propre plafond de V8. La documentation de `maxSessions`
doit être lue comme un levier d'équité et de descripteurs de fichiers, pas de
mémoire.

`limits.memory` et `runtime.memory` sur `GET /daemon/status` sont additifs et
optionnels dans le miroir SDK, donc les démons plus anciens parsent face aux
clients plus récents.

Les workers de canal spawnent `process.execPath` par workspace sans arguments
mémoire (`channel-worker-supervisor.ts:823`). Ils sont de réels consommateurs
de la mémoire de l'arbre du démon et ne sont pas couverts par le plafond par
enfant ; la réserve du root les couvre nominalement, et la partie 2 les
mesure.

## Plan de vérification

- Tester en unitaire l'arithmétique du budget sur des hôtes contraints et non
  contraints avec le chiffre de l'hôte injecté, y compris le plancher par
  enfant, le plafond de 16 Go, le clamp de sentinelle cgroup et la monotonicité
  de la part par enfant dans le nombre d'enfants.
- Tester en régression qu'un plafond dérivé du budget est émis même quand il
  tombe sous la propre limite de heap du démon spawneur. `getAcpMemoryArgs()`
  n'émet actuellement `--max-old-space-size` que quand la cible calculée
  dépasse la limite actuelle ; une valeur dérivée du budget est habituellement
  plus petite, donc un changement naïf abandonnerait silencieusement le flag
  et restaurerait le sur-engagement. C'est le test le plus important du
  premier changement.
- Affirmer que le budget effectif ne dépasse jamais la mémoire résolue de
  l'hôte, dans les deux directions : un budget explicite au-dessus de l'hôte
  est plafonné vers le bas, et un hôte sous le minimum documenté rapporte
  `insufficientMemory` plutôt que d'être remonté. Affirmer que la part
  consultative ne dépasse jamais `legacyChildCeilingMb` sur des tailles d'hôte
  de 768 Mo à 32 Go.
- Affirmer qu'aucun argument de spawn d'enfant ne change : les suites de spawn
  existantes passent sans modification, et `getAcpMemoryArgs` n'est pas touché
  à ce stade.
- De bout en bout : démarrer avec plusieurs valeurs de `--workspace` et lire
  `GET /daemon/status` ; `limits.memory` doit décrire l'hôte honnêtement et
  `runtime.memory` doit montrer `activeAcpChildren` sous
  `registeredWorkspaces` dès qu'un workspace devient idle — l'observation qui
  justifie d'indexer la politique ultérieure sur les enfants live.
- Pour la partie 2, affirmer un ratio fini sous cgroup v2, cgroup v1 et ni
  l'un ni l'autre ; affirmer la classification des niveaux ; affirmer qu'aucun
  chemin de remédiation n'existe ; confirmer que le RSS agrégé des enfants
  inclut les workspaces secondaires et les workers de canal. Puis exécuter le
  démon sous un usage réel et lire le résultat — ces données calibrent la
  partie 3.
- Pour chaque changement de la partie 3, le test d'acceptation est un
  avant/après contre une entrée réellement surdimensionnée : une seule trame
  NDJSON de plusieurs gigaoctets, un anneau de 8000 trames de grands
  événements, un `settings.json` de deux gigaoctets. Le démon doit refuser
  avec une erreur typée pendant que le RSS reste plat, là où aujourd'hui il
  grandit jusqu'à ce que le processus meure. Cette preuve est l'essentiel : un
  test qu'un registre est cohérent en interne n'est pas un test que la mémoire
  est bornée.
- `npm run build`, `npm run typecheck` et `npm run lint` sur chaque changement,
  plus les suites colocalisées des fichiers touchés.
