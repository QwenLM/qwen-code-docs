# Handoff certifié de l'écrivain de session

## Problème

L'arrêt géré coopératif libère actuellement chaque verrou d'écrivain de session avant que l'enfant ACP ne se termine. Cela corrige le chemin de remplacement ordinaire, mais ne permet pas de distinguer un écrivain qui a délibérément cessé d'enregistrer d'un écrivain d'hôte étranger qui a disparu sans libérer son verrou actif. Traiter le nom d'hôte, la visibilité du PID, l'âge du verrou ou l'inactivité de la transcription comme une preuve de mort permettrait à deux Pods vivants d'ajouter à la même transcription.

## Périmètre

Ce changement ajoute un état de handoff protégé en intégrité pour les écrivains ACP gérés. Après avoir fermé l'admission et drainé durablement le travail d'enregistreur accepté, un enfant géré fiable peut remplacer son verrou actif par un enregistrement scellé. Un remplacement géré fiable ne peut prendre possession qu'après avoir validé cet enregistrement par rapport à la transcription exacte demandée par le nouveau Config.

Les chemins de transcription doivent être absents ou résoudre vers le même fichier régulier ouvert pour la preuve. Un lien symbolique pendant n'est pas traité comme une transcription absente.

Le protocole reste soumis à la gate `experimental.sessionWriterLease`, qui est désactivée par défaut et figée en snapshot au démarrage du processus ACP. Les enregistreurs ACP autonomes, interactifs et headless ne bénéficient pas de la prise de contrôle certifiée. La fermeture normale par session libère toujours son verrou au lieu de laisser un enregistrement scellé.

Ce changement ne récupère pas un verrou actif laissé par un SIGKILL, un blocage de la boucle d'événements, un crash non géré ou un échec de stockage avant la fin du scellement. Il n'ajoute ni TTL, ni heartbeat, ni vol de nom d'hôte, ni consultation de l'API Kubernetes, ni endpoint de vol forcé par l'opérateur, ni bail de maintenance, ni prise en charge des versions mixtes. Ces cas de verrou actif nécessitent toujours une barrière d'écrivain externe faisant autorité et une récupération explicite.

## Enregistrements de verrou

Les nouveaux propriétaires écrivent des enregistrements au schéma v2. Un enregistrement actif conserve les diagnostics de propriétaire immuables existants et ajoute :

```json
{
  "schema_version": 2,
  "state": "active"
}
```

Un enregistrement scellé conserve les diagnostics du propriétaire précédent et ajoute :

```json
{
  "schema_version": 2,
  "state": "sealed",
  "sealed_at": "2026-07-28T00:00:00.000Z",
  "transcript": {
    "relative_path": "<clé de transcription relative au runtime>",
    "exists": true,
    "byte_length": 1234,
    "sha256": "<empreinte hexadécimale en minuscules>"
  }
}
```

La clé relative doit résoudre vers le chemin de transcription déjà fourni par le nouveau Config. Elle n'est jamais utilisée pour sélectionner un chemin de système de fichiers arbitraire. Les enregistrements au schéma v1 restent des enregistrements actifs valides pour la compatibilité lors d'un rollback, mais ils ne peuvent jamais être interprétés comme scellés.

## Revendication fixe

Le chemin de la revendication fixe est :

```text
<chemin du verrou primaire>.claim
```

Il sérialise les deux transitions qui retirent temporairement le chemin primaire : actif-vers-scellé et scellé-vers-actif. La revendication est créée avec la primitive existante d'écriture-synchronisation-et-lien-physique. Les erreurs de lien ambiguës sont réconciliées par rapport aux octets exacts de la revendication avant que la transition ne continue ou ne nettoie. Une revendication n'est jamais récupérée par PID, nom d'hôte ou âge. Toute revendication préexistante renvoie `session_writer_unavailable` ; un nettoyage manuel n'est autorisé qu'après une barrière d'écrivain externe faisant autorité.

L'acquisition ordinaire vérifie la revendication avant chaque tentative d'installation d'un verrou primaire manquant. Elle vérifie à nouveau après l'installation et ne retire que son propre candidat exact si une transition concurrente a acquis la revendication. Cela préserve le chemin rapide du verrou actif actuel et la récupération locale des propriétaires obsolètes tout en faisant respecter la transition de handoff par les deux chemins. Les écrivains en versions mixtes restent non pris en charge, car un écrivain plus ancien ne connaît pas la revendication fixe.

Un acquéreur peut passer sa première vérification de revendication juste avant qu'une transition ne crée la revendication, puis installer son candidat actif pendant l'intervalle du chemin primaire de la transition. La transition reconnaît cet enregistrement actif au schéma v2 de la même session comme un candidat conscient de la revendication, préserve le prédécesseur retiré et attend que la seconde vérification obligatoire du candidat le retire avant de retenter le lien physique. Cette attente est bornée ; si le candidat se bloque ou se termine avant sa seconde vérification, la transition échoue en indisponible tout en conservant sa revendication et son prédécesseur retiré. Les successeurs inconnus, mal formés ou inter-sessions ne sont jamais retirés ni écrasés.

## Scellement

L'arrêt géré arrête de manière synchrone l'admission des sessions et des enregistreurs, puis démarre tous les terminaux d'écrivain en parallèle. Un terminal d'écrivain :

1. draine chaque opération d'enregistreur acceptée avant la coupure ;
2. ouvre la transcription attendue sans suivre de lien symbolique, vérifie le propriétaire existant et le snapshot de transcription, et hache les octets via ce descripteur de fichier maintenu ouvert ;
3. écrit et synchronise un candidat scellé unique au propriétaire ;
4. acquiert la revendication fixe et revalide le propriétaire actif ainsi que l'identité et les métadonnées de la transcription maintenue ouverte ;
5. renomme le primaire actif exact vers un chemin retiré unique au propriétaire ;
6. lie physiquement le candidat scellé vers le chemin primaire désormais absent, sans remplacement ; et
7. ne retire que ses enregistrements exacts retiré, candidat et revendication.

La transition du chemin primaire est logiquement atomique pour les écrivains coopérants, car chaque installation respecte la revendication fixe, et le lien physique final ne peut pas écraser un verrou créé par un autre processus. Une erreur après effet est réconciliée à partir des octets exacts des enregistrements. L'ancien propriétaire ne supprime ni n'écrase jamais un primaire inconnu.

Un échec de flush géré ou de preuve conserve le verrou actif. La fermeture normale par session préserve le comportement de libération existant, y compris le nettoyage par propriétaire exact. Si une libération normale est en concurrence avec l'arrêt géré et valide en premier, le primaire manquant est déjà un handoff sûr et le remplacement effectue une acquisition ordinaire.

Le nettoyage sur échec ne retire la revendication fixe qu'après avoir prouvé que le primaire exact d'avant la transition a été restauré. Si le rollback ne peut pas restaurer ou vérifier cet enregistrement, la revendication reste même lorsqu'un autre primaire apparaît, car ce chemin peut être un candidat d'acquisition ordinaire perdant qui se retirera de lui-même après avoir observé la revendication. Le rollback lui-même n'est tenté que tant que la revendication fixe contient encore l'enregistrement exact de cette transition ; une revendication manquante ou remplacée signifie que le primaire actuel ne doit pas être modifié. La récupération nécessite alors la même barrière d'écrivain externe faisant autorité que toute autre revendication résiduelle.

Les échecs avant le début de la transition primaire sont différents : le revendiquant n'a pas créé d'intervalle de chemin primaire ni déplacé le prédécesseur, il ne libère donc que sa propre revendication exacte, même si un autre prétendant certifié a déjà remplacé le primaire scellé observé. Cela empêche un prétendant perdant retardé de laisser une revendication en plan après que le gagnant est devenu actif.

## Prise de contrôle certifiée

Seul un Config créé sous un parent géré fiable active la prise de contrôle certifiée. Lorsque l'acquisition observe un enregistrement scellé, elle :

1. vérifie que la clé relative de l'enregistrement correspond à la transcription attendue du Config ;
2. ouvre et hache cette transcription hors de la revendication fixe, en conservant le descripteur de fichier et son identité ;
3. acquiert la revendication fixe ;
4. relit le primaire scellé exact et revalide le descripteur maintenu ouvert, l'identité du chemin, les métadonnées, la longueur en octets et l'empreinte ;
5. renomme le primaire scellé vers un chemin retiré unique au candidat ;
6. lie physiquement le candidat actif synchronisé depuis la revendication vers le chemin primaire, sans remplacement ; et
7. ne retire que l'enregistrement retiré exact et sa propre revendication.

Le bail effectue ensuite le rechargement de session faisant autorité et la barrière de transcription existants avant l'activation de l'enregistreur. Deux remplaçants en concurrence sur le même enregistrement scellé peuvent produire au plus un propriétaire actif. Un perdant reçoit un résultat de conflit ou d'indisponibilité selon qu'il observe le primaire actif du gagnant ou une revendication en cours/résiduelle.

## Contrat d'échec

| Condition                                                                          | Résultat                           |
| ---------------------------------------------------------------------------------- | ---------------------------------- |
| Propriétaire actif valide, y compris un enregistrement à PID mort ou d'hôte étranger | `session_writer_conflict` / 409    |
| La preuve scellée ne correspond pas à la transcription attendue                     | `session_transcript_changed` / 409 |
| Enregistrement mal formé, chemin non régulier, revendication résiduelle ou résultat de système de fichiers incertain | `session_writer_unavailable` / 503 |
| L'écrivain actuel ne possède plus son enregistrement actif exact                    | `session_writer_lost` / 409        |

Les erreurs publiques restent assainies. Les journaux de scellement et de prise de contrôle réussis incluent l'ID de session, le nom d'hôte/PID précédent et l'heure de scellement, mais jamais le jeton de propriétaire ni le chemin de transcription.

## Compatibilité et déploiement

La gate de fonctionnalité doit rester désactivée pendant un déploiement en versions mixtes. L'activer ou la désactiver nécessite de drainer les anciens processus ACP. Un lecteur au schéma v2 accepte toujours les enregistrements actifs au schéma v1, mais un lecteur plus ancien ne comprend pas le schéma v2. Le rollback nécessite donc de drainer tous les nouveaux écrivains et de confirmer qu'il ne reste aucun enregistrement actif, scellé ou de revendication de ce protocole.

Un écrivain qui n'acquiert pas de bail — par exemple une session `qwen --resume` simple, car les enregistreurs autonomes, interactifs et headless s'exécutent hors de ce protocole — peut encore ajouter à une transcription qu'un écrivain géré a scellée. Cet ajout invalide la preuve scellée, de sorte qu'une prise de contrôle certifiée ultérieure de la même session échoue en fail closed avec `session_transcript_changed` et le démon reste en barrière jusqu'à ce qu'une barrière d'écrivain externe faisant autorité efface l'enregistrement résiduel. Le déploiement doit donc tenir les écrivains sans bail éloignés de toute transcription participant au handoff certifié.

Le hachage est intentionnellement effectué au scellement et à la prise de contrôle plutôt que d'ajouter une empreinte incrémentale à chaque ajout. Cela garde la première implémentation petite et rend la preuve indépendante de la mémoire du processus. Une transcription très volumineuse peut amener le scellement géré à dépasser l'échéance du parent ; cela échoue en fail closed avec le verrou actif conservé et est observable comme un arrêt non propre.

## Vérification

La couverture unitaire et multiprocessus doit prouver :

- les verrous actifs au schéma v1 et v2 conservent leur comportement live/obsolète existant ;
- l'acquisition gérée ne récupère jamais un verrou actif à PID mort ou d'hôte étranger ;
- un scellement réussi enregistre la clé relative exacte, l'existence, la longueur en octets et l'empreinte SHA-256 ;
- un remplacement certifié recharge la transcription scellée et devient actif ;
- deux remplaçants en concurrence sur un enregistrement scellé élisent exactement un propriétaire ;
- la modification, le remplacement, la troncature de la transcription, la corruption de la preuve, les enregistrements scellés mal formés et les revendications résiduelles échouent en fail closed ;
- les échecs avant et après chaque transition de chemin primaire n'écrasent ni ne supprime jamais un successeur inconnu ;
- un échec de flush géré conserve le primaire actif ;
- la fermeture normale de l'enregistreur libère au lieu de sceller ; et
- les chemins désactivés par défaut et ACP autonome restent inchangés.
