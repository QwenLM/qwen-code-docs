# Bail de writer de session P0a

## Problème

Une session persistée peut actuellement être chargée par un second processus Qwen alors que le processus d'origine produit et enregistre encore un tour. Les deux recorders mettent en cache le même UUID parent. Lorsqu'ils ajoutent indépendamment, la transcription JSONL obtient deux enfants non marqués de ce parent. La reprise suit la queue physique et peut donc masquer la réponse complète du premier processus.

L'incident de production avait exactement cet ordre : le processus d'origine a enregistré un résultat d'outil, le démon a chargé à neuf cette session, le processus d'origine a enregistré le travail d'outil restant et la réponse finale, puis le démon a enregistré plus tard un message utilisateur utilisant le résultat d'outil antérieur comme parent.

## Périmètre

P0a établit un seul writer inter-processus pour chaque `(base de runtime, ID de session)` ACP/démon et protège le chemin d'ajout linéaire ordinaire impliqué dans cet incident. Il inclut :

- un bail de token de propriétaire atomique avec récupération de processus mort ;
- un rechargement autoritaire de la transcription après acquisition du bail ;
- un fencing de propriétaire, d'identité de fichier et de longueur en octets sur chaque ajout JSONL ;
- l'admission de tour avant le début du travail utilisateur, cron, notification et coéquipier ;
- la réutilisation d'une session déjà live au sein d'un même démon ;
- des lectures avec barrière de propriétaire pour la relecture de transcription live et le rafraîchissement de l'historique Desktop ;
- des erreurs de conflit ACP/HTTP déterministes ; et
- le drain et la libération du bail à la fermeture de session et à l'initialisation échouée.

P0a ne rend pas transactionnels le changement de session, le rewind, la branche/fork, la migration de répertoire de travail, la maintenance archive/delete/rename, ni la réparation de transcription. Il n'introduit pas non plus d'entrée de registre d'initialisation qui sérialiserait chaque chargement/reprise du même démon par rapport à la fermeture ; un chargement répété réutilise le propriétaire après que ce propriétaire est enregistré, tandis que le bail inter-processus rejette toujours un second writer pendant l'initialisation. La fusion complète des résultats de chargement/fermeture appartient à P0b. Le changement de session et la migration de racine de persistance passent en fail closed (refus en cas d'échec) tant qu'une Config ACP possède un bail. Le changement logique de répertoire de travail d'ACP reste pris en charge car il garde le recorder et SessionService liés à la racine de persistance d'origine. Le rewind de même propriétaire se charge via ce SessionService épinglé à la Config, sous la barrière d'écriture du recorder ; rename et branch conservent leurs chemins existants de recorder ou de flush-avant-copie. L'archive/delete du démon et la maintenance des sessions non live conservent leur sémantique existante. La maintenance concurrente depuis l'extérieur du propriétaire live reste non prise en charge et fait partie de la frontière P0b. Les recorders CLI interactifs et headless conservent leur comportement existant sans bail afin que `/clear`, `/resume`, `/branch` et `/cd` ne régressent pas ; ils ne doivent pas écrire la même session simultanément avec un propriétaire ACP jusqu'à ce que P0b élargisse le protocole.

Le protocole est conditionné par `experimental.sessionWriterLease` et est désactivé par défaut. La valeur effective est prise en snapshot depuis la Config de démarrage lorsque l'enfant ACP démarre et reste fixe pour chaque session servie par ce processus ; les rechargements de paramètres par session ne peuvent pas la modifier. Son activation nécessite un redémarrage du processus. Le paramètre n'affecte que les recorders ACP/démon ; les recorders interactifs et headless continuent d'utiliser le chemin legacy même lorsque le paramètre est activé.

## Invariants

1. Au plus un processus ACP coopératif possède un bail de writer de session sous une base de runtime.
2. Un recorder ACP avec bail est inactif jusqu'à ce qu'il possède le bail et ait rechargé la transcription tout en le détenant.
3. Les données de prévisualisation chargées avant le bail ne sont jamais la queue autoritaire du recorder.
4. Chaque ajout ACP avec bail vérifie le token de propriétaire, l'état dur de la transcription et la longueur en octets. Une dérive d'horodatage uniquement n'est acceptée qu'après une vérification stable du contenu.
5. Un échec de propriété ou d'intégrité de transcription rejette définitivement les tours de premier niveau ultérieurs dans cette Config ACP avec bail.
6. Un démon ne construit jamais une seconde Config accessible en écriture pour une session déjà live dans ce démon.
7. Une entrée live n'est supprimée qu'après que son recorder a drainé et libéré le bail.
8. Les racines de sortie du runtime sont épinglées par Config afin que le verrou et la transcription ne puissent pas se résoudre à travers différents contextes de workspace asynchrones.

## Protocole de bail

Le verrou est stocké dans :

```text
<runtime base>/tmp/session-writer-locks/<encoded session id>.lock
```

Son enregistrement immuable contient un token de propriétaire aléatoire, le PID, l'hôte, le type de processus, l'heure d'acquisition, la version de Qwen et (si disponible) une identité stable de démarrage de processus du système d'exploitation. Linux utilise l'ID de démarrage du noyau plus les ticks de démarrage du processus, afin que les corrections d'horloge ne puissent pas faire paraître obsolète un propriétaire live. Darwin normalise la sonde de démarrage de processus sur la locale C et UTC afin que deux processus avec des environnements différents comparent la même identité. L'identité distingue la réutilisation de PID lorsque la plateforme l'expose de manière fiable. Un propriétaire d'un hôte étranger et tout état dont la sécurité ne peut pas être prouvée passent en fail closed.

L'acquisition crée un enregistrement temporaire entièrement écrit et le lie atomiquement au nom du verrou. Un propriétaire live valide renvoie `session_writer_conflict`. Un propriétaire local mort valide peut être renommé, revérifié et récupéré. Les gardes de récupération forment des générations de propriétaire bornées afin qu'un autre processus puisse récupérer si un récupérateur plante lui-même. Un verrou malformé, lien symbolique ou non régulier renvoie `session_writer_unavailable` plutôt que d'être deviné obsolète.

Le bail prend en snapshot l'existence de la transcription, son identité de fichier, ses métadonnées de sécurité, sa longueur en octets et un état SHA-256 incrémental en mémoire. Les changements d'existence, de longueur, de device/inode, de mode, de propriétaire/groupe et de nombre de liens passent en fail closed. Les horodatages de création, de changement et de modification sont indicatifs : une dérive d'horodatage uniquement déclenche une vérification stable du contenu complet à travers une seule poignée de fichier et n'est acceptée que si le digest est inchangé. Les attributs étendus et les entrées ACL qui ne changent pas le mode ne sont pas empreintés séparément. Lorsqu'une telle opération apparaît comme une dérive d'horodatage, elle est acceptée après la même vérification de contenu si tout l'état dur reste inchangé ; si le système de fichiers n'expose aucune différence d'horodatage observée, l'opération n'est pas détectée. `appendJsonLine` applique la même vérification après l'ouverture de sa poignée d'ajout, fait avancer un digest candidat avec les octets connus, et valide le digest et l'état attendu uniquement après un ajout durable réussi, une vérification du chemin post-écriture et une vérification finale du propriétaire. La création d'une nouvelle transcription utilise une création exclusive.

L'acquisition d'une transcription existante effectue une lecture en streaming O(n) pour établir la base du digest, en utilisant un tampon borné à 1 Mio ; les ajouts ordinaires restent incrémentaux. Un scan de réconciliation exige que les horodatages restent stables de son état de pré-lecture à son état de post-lecture et retente une instabilité d'horodatage uniquement au plus trois fois. Cet intervalle de stabilité est nécessaire car un digest séquentiel peut correspondre au contenu attendu même lorsqu'un writer non coopératif modifie un offset déjà lu derrière le curseur de lecture. Si les horodatages continuent de changer, le bail renvoie `session_writer_unavailable` au lieu d'accepter un snapshot potentiellement déchiré.

Le digest incrémental est une vérification de compatibilité de processus live, pas une preuve persistée pour un transfert certifié. Un writer non coopératif peut encore écraser un préfixe de même longueur pendant un ajout sans laisser de différence d'horodatage visible à l'une des observations d'état de ce processus. Fermer cette frontière existante exigerait un scan O(n) inconditionnel post-écriture, rendrait quadratiques les ajouts répétés, et est hors de P0a.

## Activation et fermeture

Lorsque le gate de fonctionnalité est activé, un `Config.initialize()` ACP acquiert le bail avant l'initialisation des extensions, hooks, outils, modèles ou du planificateur. Tout en détenant le bail, il résout l'état actif/archivé, recharge la transcription active lorsqu'elle existe, vérifie que la transcription n'a pas changé pendant le rechargement, remplace toute prévisualisation antérieure au verrou et active le recorder. Les Configs ACP sans l'opt-in et toutes les Configs non ACP continuent via le chemin de recorder legacy sans acquérir ce bail P0a.

Tout échec d'initialisation ultérieur ferme le recorder et libère le bail. L'arrêt normal et la fermeture de session ACP finalisent les métadonnées en attente, drainent la file du recorder, libèrent le token de propriétaire, et seulement alors suppriment l'entrée de session live. Le nettoyage est vérifié par identité afin qu'une initialisation plus ancienne échouée ne puisse pas fermer une entrée plus récente de même ID. Le nettoyage d'acquisition utilise la libération single-flight à enregistrement exact du bail ; un échec terminal conserve le verrou primaire, les appels de libération ultérieurs observent le même échec au lieu de tenter un second renommage, et un autre writer reste soumis au fencing jusqu'à la récupération à la sortie du processus. Un refus définitif de l'enfant laisse la session live afin que la fermeture puisse être retentée. Le drain de fermeture est borné ; un timeout ou un échec de transport a un résultat inconnu, donc le bridge termine le canal ACP partagé et ses baux possédés par le processus deviennent récupérables comme obsolètes. Les autres sessions sur ce canal sont également récupérées par cette action de récupération.

## Contrat d'erreur

| Type                         | JSON-RPC | HTTP | Signification                                             |
| ---------------------------- | -------: | ---: | --------------------------------------------------------- |
| `session_writer_conflict`    | `-32020` |  409 | Un autre processus live possède la session.               |
| `session_writer_lost`        | `-32021` |  409 | Cette Config ne possède plus son verrou.                  |
| `session_transcript_changed` | `-32022` |  409 | Le JSONL a changé en dehors de la séquence d'ajout attendue. |
| `session_writer_unavailable` | `-32023` |  503 | La propriété n'a pas pu être vérifiée en toute sécurité.  |

Les réponses externes utilisent des messages fixes et `errorKind` ; elles n'exposent ni le PID, ni l'hôte, ni le token de propriétaire, ni le chemin du verrou, ni celui de la transcription.

Un chemin de transcription lien symbolique ou non régulier sans base antérieure de fichier régulier est `session_writer_unavailable`. Une fois qu'un bail a établi une base de fichier régulier, remplacer ce chemin par un lien symbolique ou un autre fichier non régulier est un remplacement externe de transcription et est classé comme `session_transcript_changed`.

## Compatibilité et déploiement

Le protocole ne coordonne que les writers ACP dont la fonctionnalité est activée. Le déploiement et le rollback doivent drainer les anciens processus writer ACP/démon avant d'activer ou de désactiver le paramètre. Une opération ACP à versions ou configurations mixtes n'est pas sûre car un writer legacy ignore le verrou. L'accès interactif ou headless concurrent à la même session persistée reste hors de P0a et n'est pas pris en charge jusqu'à P0b.

Le système de fichiers du runtime doit prendre en charge les liens physiques dans le même répertoire avec un comportement atomique sans remplacement. Si ce prérequis n'est pas disponible, l'acquisition échoue en fail closed avec `session_writer_unavailable`.

Les transcriptions branchées existantes ne sont pas réparées automatiquement. P0a empêche une nouvelle branche de chargement obsolète après le déploiement ; la réparation et la sémantique explicite de branche restent un travail séparé.

## Vérification

La couverture unitaire exerce les gates désactivé-par-défaut et opt-in explicite, la contention de verrou, la récupération de propriétaire mort et de récupérateur planté, les verrous malformés et non réguliers, la libération concurrente de token de propriétaire, les pré-vérifications de libération bornée, les échecs de nettoyage terminal, les transcriptions tronquées et modifiées externement, la réconciliation d'horodatage uniquement, le remplacement in-place et atomique de même longueur, les changements de métadonnées de sécurité, la comptabilité d'octets UTF-8, l'activation/fencing/fermeture du recorder, le rechargement autoritaire, le nettoyage d'initialisation, l'épinglage de racine de runtime, l'admission de tour, la réutilisation de relecture du même démon, la compatibilité d'enregistrement désactivé, le comportement du recorder interactif legacy et l'assainissement des erreurs. La couverture Darwin vérifie également que des processus avec des fuseaux horaires différents dérivent la même identité de propriétaire. La gestion de la réutilisation de PID est implémentée mais n'est pas revendiquée comme preuve de test car la sonde de démarrage de processus dépend de la plateforme.

Avec le gate de fonctionnalité activé, une régression réelle à deux processus recrée la chronologie de l'incident : le processus A détient le writer après une queue de résultat d'outil, le processus B est rejeté avant de charger comme writer, A ajoute sa réponse finale et ferme, puis B acquiert, recharge cette réponse finale et ajoute l'enregistrement utilisateur suivant avec la réponse finale comme parent.

La couverture Desktop vérifie qu'un conflit de writer est présenté à l'utilisateur au lieu de remplacer silencieusement la session persistée demandée par une nouvelle session. Le rafraîchissement de l'historique live est servi à travers la barrière d'écriture du propriétaire et le SessionService épinglé à la Config, y compris après un `/cd` logique.
