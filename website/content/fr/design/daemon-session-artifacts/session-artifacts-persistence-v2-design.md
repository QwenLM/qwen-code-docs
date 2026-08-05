# Conception de la persistance V2 des Session Artifacts du démon Qwen Code

Ce document prolonge l'API V1 session artifact de la PR #5895 et conçoit la capacité de persistance V2. La conception V1 se trouve dans le même répertoire : [session-artifacts-daemon-api-implementation-design.md](./session-artifacts-daemon-api-implementation-design.md).

L'objectif de la V2 est de permettre la restauration des métadonnées d'artifacts après un redémarrage du démon ou un chargement/relecture de session, sans casser la sémantique des sessions live de la V1. La PR actuelle ne copie pas, ne fige pas et n'héberge pas le contenu des artifacts ; pour les fichiers du workspace, seuls le chemin, la taille, mtimeMs et sha256 sont enregistrés, comme vérification d'intégrité après restauration.

## 1. Conclusions de la conception

La V2 est une phase de persistance des métadonnées. Le périmètre d'implémentation de la PR #6259 est réduit à la restauration des métadonnées, au journal/snapshot/rebuild/fork remap JSONL des artifacts, à la restauration des métadonnées d'artifacts après redémarrage du démon/chargement/relecture, et à l'exposition de la persistance des métadonnées via REST/ACP/SDK. La rétention de contenu (pin de contenu de workspace, copie managed à portée de session, manifest, quota, TTL, GC/fsck à portée de session) n'est pas dans le périmètre actuel ; s'il existe un futur besoin réel d'audit/archivage, il devra faire l'objet d'une nouvelle conception d'archive de contenu, revue séparément. Les clients ne doivent pas déduire des fonctionnalités du nom de phase « V2 » ; ils doivent lire la capacité.

Capacités actuelles :

1. Restauration des métadonnées : par défaut, restaure les métadonnées structurées des artifacts et les références de ressources, sans copier le contenu réel.
2. Vérification d'intégrité du workspace : lors de l'enregistrement d'un artifact de workspace, taille + mtimeMs + sha256 sont notés ; lors du restore / GET, `available` / `missing` / `changed` est renvoyé selon le fichier en temps réel.

Capacités correspondantes :

- `session_artifacts_persistence` : prend en charge la persistance des métadonnées et la restauration lors du chargement/relecture de session.
- `session_artifacts_content_retention` : non déclarée actuellement ; si la conception de l'archive de contenu est relancée ultérieurement, elle ne devra être déclarée qu'une fois la copie/l'hébergement de contenu, les quotas, le manifest et le GC/fsck tous terminés.

Principes centraux :

- Le `SessionArtifactStore` de la V1 reste l'index mémoire faisant autorité pour la session live.
- La V2 ajoute un journal/snapshot JSONL des artifacts, utilisé pour initialiser l'état initial lors de la création du store live côté démon ; l'append JSONL doit être effectué par le chemin core/enfant ACP qui possède actuellement l'enregistrement du chat ; le store côté démon ne peut pas écrire directement dans la transcription.
- La V2 est JSONL-only par défaut. Le cache sidecar n'entre pas dans les critères de publication de la V2 ; ce n'est que si le coût mesuré du chargement de session est inacceptable qu'un cache supprimable sera conçu séparément.
- Ne pas récupérer localement le contenu des URL distantes.
- Ne pas copier par défaut les fichiers du workspace.
- Ne pas utiliser `source`, `clientId`, `trustedPublisher` fournis par le client comme base d'autorisation.
- Lors de la restauration, revalider systématiquement ; ne pas faire confiance aux anciennes métadonnées sur disque.

Réductions importantes de la PR actuelle :

- L'API publique de rétention de contenu, le magasin de contenu managed, pin/unpin, deleteContent, quota/manifest/fsck/gc et la capacité `session_artifacts_content_retention` ne sont pas livrés dans la PR #6259. La PR actuelle conserve uniquement le chemin de compatibilité downgrade/strip pour les anciens payloads de journal `pinned` / `contentRef`, afin d'éviter que d'anciens enregistrements ne cassent la restauration des métadonnées.
- Les détails pin/save, quota de contenu, GC/fsck de contenu managed conservés ci-dessous sont un plan pour une future archive de contenu, pas le contrat filaire ni les critères d'acceptation de la PR #6259 ; sauf si une sous-section est explicitement marquée comme HTTP mapping / comportement de métadonnées de la PR #6259, l'implémentation ne doit pas exposer ces API ou capacités dans #6259.
- La vue live actuelle et les métadonnées persistées utilisent le même ensemble visible de 200 entrées. Pour éviter une sur-restauration après redémarrage, l'éviction durable/restaurable au-delà de la limite écrit un événement remove `reason: "eviction"` ; cela équivaut à un prune des métadonnées dans cette implémentation, pas à un simple masquage live-only de la V1.
- Le DELETE explicite adopte actuellement le live-first : retrait d'abord du store live, et renvoi d'un warning lorsque l'écriture de la pierre tombale échoue. Cela masque prioritairement les éléments sensibles ; pendant la fenêtre d'échec, un redémarrage du démon peut encore restaurer cet artifact depuis l'ancien journal ; le client doit traiter le warning comme le signal que « la suppression n'est pas durable ».
- Le fork s'effectue actuellement par une écriture unique en création exclusive dans le fichier JSONL cible ; il ne stream pas les enregistrements d'artifacts forkés un par un, donc `session_artifact_fork_marker` n'est pas nécessaire pour détecter un lot partiel du chemin d'écriture actuel. Si le fork devient un jour du streaming, des marqueurs begin/complete seront alors introduits.

## 2. Sémantique visible par l'utilisateur

### 2.1 Rafraîchissement de page, changement et redémarrage

Le comportement après la V2 devrait être :

- Rafraîchissement de page : comme en V1, tant que le démon/la session est vivant, le frontend refait simplement `GET /session/:id/artifacts`.
- Changement de session : chaque session live conserve son propre store d'artifacts.
- Redémarrage de l'instance frontend : tant que le démon est vivant, GET du store live actuel.
- Redémarrage du démon/bridge : si la session est rechargée, la V2 restaure la liste d'artifacts depuis les métadonnées persistées.
- Chargement/relecture d'historique : si la session possède des enregistrements de persistance V2, restaure la liste d'artifacts ; sinon renvoie une liste vide.

La mise à niveau live de la V1 vers la V2 nécessite un traitement particulier : les artifacts live V1 déjà en mémoire n'ont pas de journal JSONL. Lorsque la V2 atteint ces sessions live pour la première fois, elle doit écrire un `session_artifact_snapshot` initial via le writer de persistance d'artifacts fourni par le propriétaire de l'enregistrement du chat, avant d'accepter de nouvelles mutations d'artifacts restaurables. Le backfill ne doit pas sérialiser le store live tel quel ; il doit réexécuter pour chaque artifact la validation d'ingestion, la minimisation de confidentialité et la matérialisation de `retention`. Lorsqu'un artifact individuel est non conforme, il est ignoré ou rétrogradé ; un seul mauvais enregistrement ne doit pas faire échouer tout le backfill. Si le writer est indisponible ou si le backfill échoue dans son ensemble, la session conserve le comportement V1 live-only et un warning structuré est enregistré ; l'utilisateur ne doit pas croire à tort que des artifacts live existants sont déjà restaurables.

Le backfill ne doit pas écrire en streaming les événements d'artifacts un par un dans le JSONL. L'implémentation doit d'abord effectuer en mémoire la validation, la minimisation et la rétrogradation, former un snapshot candidat complet, puis ajouter `session_artifact_snapshot` en une seule fois. Si la construction du candidat ou l'append du snapshot échoue, aucun état d'artifact durable partiel ne doit subsister. La PR actuelle n'implémente pas le backfill du store live V1 ; s'il est complété plus tard, le nombre d'entrées candidates, le nombre d'entrées ignorées et les raisons d'échec de validation devront être écrits dans une télémétrie structurée ou les métadonnées du snapshot, afin que fsck et les warnings de restauration puissent distinguer « complet mais avec des entrées ignorées par validation » et « écriture partielle/corrompue ».

### 2.2 Niveaux de rétention

Nouveau champ optionnel. Le chemin de mutation publique de la PR #6259 n'accepte que `ephemeral` et `restorable` ; l'ancien `pinned` des vieux journaux est rétrogradé en `restorable` metadata-only lors du restore / fork :

```ts
type ArtifactRetention = 'ephemeral' | 'restorable';
```

Signification :

- `ephemeral` : existe uniquement dans le store live. Non restauré après la disparition du démon/de la session.
- `restorable` : les métadonnées sont écrites dans le journal de persistance. Après chargement/relecture de session, restauré comme élément d'artifact, mais sans garantie que la ressource sous-jacente existe encore.

Règles par défaut :

- Résultat d'outil, `record_artifact`, artifact de hook : `restorable` par défaut, mais seules les métadonnées sont persistées.
- Artifact de POST client enregistré manuellement par l'utilisateur dans un frontend interactif : `restorable` par défaut ; il apparaît toujours dans la liste d'artifacts après restauration.
- POST client d'arrière-plan/automatisé : s'il ne s'agit que d'un état d'UI temporaire, il doit demander explicitement `retention: "ephemeral"` ; le SDK doit fournir un helper ephemeral explicite.
- Artifact `published` : `restorable` par défaut ; actuellement seul le locator publié est restauré, le contenu n'est pas hébergé.

Si l'enregistrement du chat est désactivé, la persistance des métadonnées est désactivée par défaut et la capacité n'est pas déclarée.

### 2.3 Sémantique de restauration des artifacts enregistrés par l'utilisateur

Les artifacts enregistrés manuellement par l'utilisateur doivent continuer à exister après la restauration V2, mais ce qui est restauré est un « élément de métadonnées d'artifact », pas une sauvegarde inconditionnelle du contenu.

Le résultat après restauration est distingué selon l'état de la ressource :

- `external_url` : restaure title, description, url, metadata. Le démon n'accède pas à l'URL distante ; si l'URL peut encore être ouverte est décidé lorsque le client clique.
- `workspace` : restaure workspacePath et metadata ; si le fichier est toujours dans le workspace et que taille + mtimeMs n'ont pas changé, ou si après un changement de mtime le sha256 correspond toujours à celui enregistré, `status: "available"` ; si le fichier a été supprimé, déplacé ou si le symlink s'échappe, `status: "missing"` ; si le fichier est toujours là mais que la taille ou le sha256 diffèrent de l'enregistrement, `status: "changed"`.
- `managed` : restaure managedId ; `available` seulement si le manifest du stockage managed peut toujours le résoudre.
- `published` : restaure le locator publié ; la confiance published n'est conservée que si la validation du manifest de l'éditeur de confiance réussit toujours.

Ainsi, à la question « l'artifact enregistré par l'utilisateur existe-t-il encore après restauration ? », la réponse est : en V2, il devrait exister dans la liste, sauf si l'utilisateur l'a supprimé par DELETE, si les métadonnées ont été GC/pierre tombale, si la validation de restauration découvre que l'enregistrement est trop corrompu pour être affiché en toute sécurité, ou si l'enregistrement du chat / la persistance est désactivé. Si le contenu sous-jacent peut encore être ouvert dépend du type de stockage et de l'état de la ressource en temps réel ; les fichiers du workspace ne sont pas sauvegardés par le démon, et `changed` sert à éviter d'ouvrir silencieusement une mauvaise version.

Le démon ne peut pas déterminer « manuel » ou « arrière-plan » sur la seule base du payload de la requête. Dans l'implémentation, la source d'enregistrement interactive doit être identifiée par le principal de connexion, un helper SDK ou le chemin d'action UI ; un client dont l'intention interactive ne peut être confirmée doit être traité selon la `retention` explicite, avec `restorable` accepté par défaut, mais contraint par le quota de métadonnées de session et les enregistrements d'audit.

## 3. Modèle de données

### 3.1 Extension de l'artifact public

La V2 ajoute des champs optionnels sur l'artifact de réponse V1 :

```ts
interface DaemonSessionArtifact {
  // V1 fields...
  status: 'available' | 'missing' | 'changed';
  retention?: 'ephemeral' | 'restorable';
  persistedAt?: string;
  restoreState?: 'live' | 'restored' | 'unverified' | 'blocked';
  persistenceWarning?:
    | 'persistence_unavailable'
    | 'metadata_only_restore'
    | 'restore_validation_failed'
    | 'sticky_override_active';
  metadata?: {
    'qwen.workspace.sha256'?: string;
    'qwen.workspace.mtimeMs'?: number;
    [key: string]: string | number | boolean | null | undefined;
  };
}
```

Description des champs :

- `retention` : le niveau de persistance de l'artifact. L'ordre de résolution est : valeur explicite du corps de requête en premier ; pour les artifacts internes du système, la politique par défaut du démon selon §2.2 ; pour un POST client non spécifié, le `defaultRetention` configuré par l'utilisateur ; sans configuration, repli sur `restorable`. Ce n'est que lorsque la capacité de persistance n'est pas déclarée ou lors de la lecture d'enregistrements de l'ère V1 que le traitement live-only compatible V1 s'applique. Le writer V2 doit matérialiser `retention` lors de l'écriture du journal et ne peut pas dépendre d'un défaut optionnel.
- `persistedAt` : l'heure du dernier succès d'écriture des métadonnées sur disque.
- `restoreState` : indication de l'origine de la restauration ; ne remplace pas `status`.
- `persistenceWarning` : risque de persistance/restauration non bloquant ; le frontend peut l'utiliser pour afficher un état comme « cet artifact ne sera pas conservé après redémarrage ». La forme filaire actuelle est une chaîne fixe, pour éviter d'écrire un chemin absolu d'hôte, un identifiant, un token, un chemin de stockage interne ou un id de connexion dans la réponse. Une forme plus structurée `{ code, message }` peut être une extension compatible ultérieure.
- `status: "changed"` : réservé aux artifacts de workspace. Le démon écrit `sizeBytes`, `metadata["qwen.workspace.sha256"]` et `metadata["qwen.workspace.mtimeMs"]` lors de l'enregistrement ; après GET/list/restore, le refresh commence par un stat du fichier actuel, un changement de taille renvoie directement `changed`, si taille/mtime sont tous deux inchangés le fichier n'est pas relu, et ce n'est que si mtime a changé mais la taille est identique que le sha256 est recalculé en dernier recours.

### 3.2 Relation entre Status et restoreState

Le `status` V1 continue d'indiquer si la ressource actuelle est disponible :

- `available`
- `missing`
- `changed`

La V2 n'ajoute qu'un seul état d'intégrité de workspace : `changed`. Il signifie que le chemin est toujours accessible, mais que la taille du fichier en temps réel a changé, ou qu'après un changement de mtime le sha256 ne correspond pas aux métadonnées enregistrées. `blocked` n'est pas un `status`, il n'appartient qu'à `restoreState` :

- `restored` : restauré depuis les métadonnées persistées.
- `unverified` : métadonnées restaurées, mais la validation workspace/managed n'est pas encore terminée.
- `blocked` : lors de la restauration, une frontière de sécurité n'était pas satisfaite, par exemple une évasion de chemin de workspace.
- `live` : nouvellement produit dans le processus actuel ou confirmé après rafraîchissement.

## 4. Conception du stockage de persistance

### 4.1 Source de vérité JSONL-only

La V2 n'utilise par défaut que les enregistrements système du JSONL du chat :

1. Le journal JSONL est la source d'audit, la source de restauration et la source de migration entre versions.
2. `session_artifact_snapshot` est un point d'accélération de restauration dans le JSONL, pas un fichier indépendant.
3. Pas de cache sidecar introduit en V2. Le sidecar ajouterait des problèmes de synchronisation de chemins, de validation d'obsolescence, de coordination archive/unarchive/delete, de GC d'orphelins et de confiance du cache ; le chargement de session lit déjà le JSONL, et les enregistrements d'artifacts peuvent être extraits dans le même cycle de parsing.

Si un futur test réel nécessite un sidecar, il devra entrer comme conception séparée et satisfaire deux contraintes :

- Le sidecar ne peut être qu'un cache supprimable et ne peut pas porter la correction du protocole.
- Même en cas de succès du sidecar, la validation de restauration doit être exécutée pour chaque artifact ; la validation de restauration JSONL ne peut pas être contournée.

Le sidecar n'est pas une exigence de correction pour la persistance V2. Actuellement `loadSession()` lit le JSONL complet de la session pour la restauration et reconstruit l'arbre de conversation ; lorsque la restauration des artifacts extrait les enregistrements de snapshot/event dans le même cycle de lecture, aucun I/O fichier supplémentaire n'est ajouté. Donc, dans l'architecture actuelle, le sidecar ne peut économiser que le faible coût de parsing/relecture des enregistrements d'artifacts, et ne peut pas éliminer le coût de lecture principal du chargement de session.

Inclure le sidecar dans la PR actuelle élargirait nettement la surface d'implémentation :

- Ordre de double écriture JSONL et sidecar, fsync et récupération après crash.
- Validation, invalidation et fallback des sidecars obsolètes/corrompus.
- Synchronisation du cycle de vie du sidecar lors d'archive/unarchive/delete/fork/remap.
- Frontière de sécurité : si le sidecar est fiable, s'il peut contourner la validation de restauration.
- Nettoyage des sidecars/caches orphelins et matrice de tests supplémentaire.

Donc le critère de publication V2 reste JSONL-only. Le sidecar n'entrera dans une conception indépendante que lorsque l'une des conditions suivantes aura été prouvée par profilage ou par besoin produit :

- `loadSession()` n'a plus besoin de lire le JSONL complet, et le sidecar peut éviter un scan complet à froid.
- La liste d'artifacts doit pouvoir être affichée à froid sans charger l'historique de session.
- La restauration des artifacts mesurée, et non la reconstruction de l'historique de conversation, devient le coût principal du chargement de session.
- Une recherche d'artifacts entre sessions/projets ou un index global est nécessaire.

### 4.2 Propriété du writer JSONL et modèle de branche

Les enregistrements de persistance d'artifacts font partie de la transcription du chat et doivent suivre la sémantique parent/leaf existante de `ChatRecord` :

- L'append JSONL ne peut être effectué que par le processus possédant `ChatRecordingService.appendRecord` ou via un RPC explicite qu'il expose. Le `SessionArtifactStore` côté démon peut utiliser une file d'opérations pour coordonner l'état live, les SSE et l'ordre des requêtes de persistance, mais il ne peut pas ouvrir et écrire lui-même le JSONL du chat.
- Chaque `session_artifact_event` / `session_artifact_snapshot` doit être accroché au leaf de conversation actuel comme un `ChatRecord` système ordinaire, avec les `uuid` / `parentUuid` normaux.
- Le builder d'arbre du chat et le renderer doivent traiter les enregistrements système `session_artifact_*` comme des enregistrements à effet de bord : ils participent à l'ordre parent/leaf et à la relecture, mais ne sont pas rendus comme nœuds de conversation visibles par l'utilisateur. Au minimum, lors du chargement par d'anciennes versions d'un JSONL contenant des enregistrements V2, un sous-type système inconnu doit être traité comme un effet de bord opaque/ignoré, plutôt que de faire échouer le chargement de session.
- Le chargement/relecture de session n'applique que les enregistrements d'artifacts de la chaîne de leaf active. Les upsert/remove d'artifacts abandonnés dans une branche abandonnée par `/rewind` n'affectent plus la liste d'artifacts actuelle.
- Lors d'un `/rewind` ou de tout changement de leaf, le `SessionArtifactStore` live côté démon doit se réaligner sur l'état des artifacts de la nouvelle chaîne active : soit en réinitialisant depuis le résultat de relecture de la chaîne active, soit en écrivant un snapshot d'artifacts top-up vers la chaîne survivante pendant l'opération de rewind. La V2 adopte par défaut la sémantique à portée de branche ; les mutations hors branche ne doivent pas continuer à attendre dans la flat map live jusqu'au prochain redémarrage pour disparaître.
- Le fork/branch ne copie que les enregistrements d'artifacts de la chaîne active ; les enregistrements hors chaîne ne participent pas à la restauration de la session cible.
- Si une étape d'implémentation ne peut pas encore accrocher les enregistrements système d'artifacts à la chaîne de leaf active, elle ne doit pas déclarer la capacité `session_artifacts_persistence` ; sinon après un rewind, d'anciens upsert ou anciennes pierres tombales ressusciteraient.

Cela signifie que la V2 ne conçoit pas de fichier de log d'artifacts indépendant, ni de log latéral contournant l'arbre du chat. La correction de la persistance des artifacts provient de la même chaîne d'historique de chat active, pas de l'état mémoire actuel du démon.

### 4.3 Enregistrement système JSONL

Ajout à `ChatRecord.subtype` :

```ts
'session_artifact_event' | 'session_artifact_snapshot';
```

Payload :

```ts
interface SessionArtifactEventRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  changes: Array<{
    action: 'created' | 'updated' | 'removed';
    artifactId: string;
    artifact?: PersistedSessionArtifact;
    reason?: 'explicit' | 'eviction' | 'unpin_to_ephemeral';
  }>;
}

interface SessionArtifactSnapshotRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  artifacts: PersistedSessionArtifact[];
  tombstonedIds?: string[];
  stickyEphemeralIds: string[];
}

type PersistedSessionArtifact = Pick<
  DaemonSessionArtifact,
  | 'id'
  | 'kind'
  | 'storage'
  | 'source'
  | 'status'
  | 'title'
  | 'description'
  | 'workspacePath'
  | 'managedId'
  | 'url'
  | 'mimeType'
  | 'sizeBytes'
  | 'metadata'
  | 'createdAt'
  | 'updatedAt'
> & {
  retention: ArtifactRetention;
  persistedAt: string;
  clientRetained: boolean;
  toolCallId?: string;
  toolName?: string;
  hookEventName?: string;
};
```

`sequence` est un compteur de mutations durables au sein de chaque store d'artifacts de session, utilisé pour l'ordre des snapshots/events et le diagnostic d'anomalies. Lors de la restauration, l'ordre de la chaîne JSONL active fait toujours autorité ; `sequence` ne sert pas d'autorisation entre sessions ni de source d'ordre global.

`PersistedSessionArtifact` doit être une allowlist positive (`Pick` explicite ou interface indépendante), pas une exclusion négative `Omit<DaemonSessionArtifact, ...>`. Si `DaemonSessionArtifact` ajoute à l'avenir de nouveaux champs runtime-only, une assertion à la compilation doit obliger le mainteneur à décider explicitement s'ils entrent dans l'allowlist persistée, afin d'éviter la pollution du schéma.

N'écrire que la forme minimale de l'artifact après validation/normalisation du store. Sauf `clientRetained` et les indications d'affichage d'outil/hook, n'écrire ni champs internes V1 ni champs dérivés au runtime :

- ne pas écrire `identityKey`
- ne pas écrire `trustedPublisher`
- ne pas écrire le `workspaceCwd` absolu
- ne pas écrire de token de transport / principal d'authentification
- ne pas écrire `restoreState`
- ne pas écrire `persistenceWarning`
- ne pas écrire `clientId` ou le principal propriétaire du processus live ; `source` ne sert que d'indication d'affichage/audit et ne peut pas être utilisé pour l'autorisation

La suppression d'un artifact doit écrire un changement de pierre tombale, pour éviter qu'un ancien upsert ne ressuscite après la relecture de l'historique. La pierre tombale n'interdit pas définitivement la réapparition du même id : elle ne couvre que ses propres upsert antérieurs, jusqu'à ce qu'un upsert explicite avec une séquence plus élevée apparaisse. L'ancien `reason: "unpin_to_ephemeral"` des vieux journaux continue comme compatibilité d'override sticky : les upsert implicites/par défaut ultérieurs du même id d'artifact restent traités comme live-only ; seul un REST/ACP mutate route authentifié passant explicitement `retention: "restorable"` peut le supplanter ; la rétention tool/hook/arrière-plan/par défaut, le backfill de restauration et la ré-ingestion implicite ne peuvent pas supplanter l'override sticky.

L'override sticky ne peut pas exister uniquement dans des événements de pierre tombale historiques. Le writer de snapshot doit écrire les états `unpin_to_ephemeral` non encore supplantés explicitement dans `stickyEphemeralIds` ; le lecteur de restauration restaure d'abord l'ensemble sticky du snapshot, puis applique les upsert/remove postérieurs au snapshot. Sinon, après l'avancée de la baseline du snapshot, les anciennes pierres tombales n'ont plus besoin d'être relues et l'override sticky serait perdu.

### 4.4 Invariants du snapshot et des pierres tombales

Le snapshot d'artifacts ne sert qu'à réduire la quantité d'événements d'artifacts appliqués lors de la relecture ; il ne réduit pas la quantité de lecture du fichier JSONL lui-même.

Doit être satisfait :

- La génération de snapshot doit être exécutée en série dans la même file d'opérations d'artifacts, et strictement après toutes les mutations précédentes.
- Le snapshot est l'état actuel faisant autorité : il ne contient que les artifacts encore valides au moment de la génération du snapshot.
- `tombstonedIds` n'enregistre que les pierres tombales qui doivent encore couvrir d'anciens upsert après le snapshot ; les anciennes pierres tombales couvertes par le snapshot n'entrent plus dans le nouveau payload du snapshot, pour éviter que le tableau ne croisse indéfiniment avec l'historique.
- `stickyEphemeralIds` enregistre les ids d'artifacts actuellement encore sous override sticky ephemeral, même si la pierre tombale ancienne correspondante n'a plus besoin d'être relue ; cet état d'override doit être conservé.
- `stickyEphemeralIds` doit être borné, partager par défaut le même ordre de grandeur `maxPersistedMetadata` que la limite des métadonnées persistées, et compter dans le budget du working set du journal d'artifacts. Si la relecture d'anciens journaux `unpin_to_ephemeral` dépassait la limite de l'ensemble sticky, la restauration/le prune doit enregistrer un warning puis réessayer plus tard ; il ne doit ni croître silencieusement, ni裁剪 aléatoirement d'anciens overrides sticky, ni laisser un upsert implicite restaurer la persistance.
- Le snapshot peut contenir un id d'artifact déjà pierre-tombé, à condition que cette pierre tombale ait été supplantée par un upsert explicite de séquence plus élevée.
- Au chargement, choisir le dernier snapshot valide du plus récent au plus ancien, puis n'appliquer que les événements d'artifacts postérieurs à ce snapshot.
- Si le parsing du dernier snapshot échoue, enregistrer un warning `snapshot_invalid` et continuer à essayer le snapshot valide précédent ; un snapshot corrompu ne doit pas faire perdre toutes les métadonnées d'artifacts de la session.
- S'il n'existe aucun snapshot valide, permettre une relecture séquentielle unique des événements d'artifacts de la chaîne de leaf JSONL active. Un enregistrement d'artifact corrompu isolé doit être ignoré avec un warning ; ce n'est que lorsque l'ordre de la branche, l'enveloppe des enregistrements ou l'état des pierres tombales ne permettent plus d'établir un ordre fiable que les enregistrements de persistance d'artifacts de la session sont abandonnés.

L'avancée de la baseline du snapshot ici ne réécrit ni ne supprime les anciens enregistrements du JSONL. Les anciens `session_artifact_snapshot`, événements et pierres tombales restent dans la transcription du chat append-only ; le sous-système des artifacts avance simplement la baseline de restauration dans le dernier payload de snapshot et réinitialise le comptage du working set.

### 4.5 Consommation de stockage

La V2 n'écrit pas en double dans un sidecar, donc pas de stockage dupliqué de métadonnées JSONL + sidecar. La consommation de stockage se divise en journal de métadonnées et rétention de contenu :

- Une entrée de métadonnées fait généralement environ 0,5 Ko à 2 Ko, selon title, description, url et la taille des metadata.
- La limite de métadonnées persistées valides par session est alignée par défaut sur le store live à 200 entrées ; un snapshot unique fait environ 100 Ko à 400 Ko.
- Le journal JSONL conserve les événements incrémentaux, les snapshots et les pierres tombales ; la transcription du chat append-only croît elle-même.
- La rétention de contenu est la principale source d'espace, par exemple 50 Mo par artifact, 200 Mo par session, 1 Go par projet.

Stratégies de contrôle :

- Après que le journal d'événements d'artifacts atteint un seuil fixe, écrire un `session_artifact_snapshot`, par exemple tous les 100 mutations d'artifacts ou tous les 256 Ko de journal d'artifacts.
- Les enregistrements de persistance d'artifacts suivent le cycle de vie de la transcription du chat ; pas de GC de fichiers indépendant.
- Ajouter par session un budget en octets de working set du journal d'artifacts, par exemple 4 Mo. Ce budget mesure le working set d'artifacts qui doit être lu et appliqué lors de la restauration, c'est-à-dire le dernier snapshot valide plus les événements d'artifacts postérieurs ; les anciens enregistrements d'artifacts déjà couverts par un snapshot dans la transcription du chat ne doivent pas être comptés dans le budget, sinon le JSONL append-only deviendrait une limite unique non restaurable.
- Le writer doit suivre explicitement les octets du working set : après chaque écriture de snapshot, enregistrer la taille en octets d'artifacts de ce snapshot, la position d'append JSONL ou l'index de ligne comme `postSnapshotBase`, puis chaque append d'événement d'artifact augmente `postSnapshotEventBytes`. La vérification du budget utilise `snapshotBytes + postSnapshotEventBytes`, et les compteurs sont réinitialisés après le succès de l'avancée de la baseline du snapshot. Si le writer ne peut pas confirmer la position de base ou l'état des compteurs, il doit écrire un nouveau snapshot de manière prudente ; s'il ne peut toujours pas confirmer, rétrograder ou signaler une erreur, pas d'append sans limite.
- Lorsque le budget approche de la limite, essayer d'abord d'écrire un nouveau snapshot. Si le dernier snapshot plus les événements post-snapshot dépassent encore le budget, ne plus écrire de nouvelles métadonnées restaurables ; les artifacts ordinaires sont rétrogradés en `ephemeral` avec `persistenceWarning.code = "journal_budget_exceeded"`.
- Ne pas écrire d'octets de contenu dans le JSONL ; la PR #6259 n'écrit pas non plus de stockage de contenu d'artifacts géré par le démon.

## 5. Flux d'écriture et de restauration

### 5.1 Validation au moment de l'ingestion

Tout artifact entrant dans le store live et le JSONL doit subir une validation au moment de l'ingestion, et pas seulement une validation au moment du restore :

- `workspacePath` : doit être un chemin relatif ; après resolve/realpath, ne doit pas s'échapper du workspace actuel.
- `url` : selon le type de stockage, valider le schéma, userinfo, les query/fragment ressemblant à des secrets.
- `managedId` : rejeter les formes de chemin, `..`, les chemins absolus, les séparateurs.
- `published` : ne peut provenir que d'un éditeur de confiance interne au démon ou d'un chemin validé par manifest ; ne peut pas être autoproclamé par le payload du client.
- Anciens `contentRef` / `expiresAt` : uniquement comme compatibilité d'entrée des vieux journaux ; s'ils apparaissent dans le payload du client, ils doivent être rejetés ou retirés ; la PR actuelle ne peut pas produire de nouveaux champs.
- `restoreState` / `persistenceWarning` : champs de réponse runtime-only ; s'ils apparaissent dans le payload du client, ils doivent être rejetés ou retirés et ne peuvent pas être écrits dans l'artifact persisté.
- `clientRetained` : ne peut être qu'un booléen, indiquant l'intention de rétention de l'utilisateur et une indication d'ordre stable ; ce n'est pas un signal d'autorisation. Seule une action REST/SDK/UI explicite peut le définir ; l'ingestion automatique d'arrière-plan ne peut pas se faire passer pour une rétention utilisateur.
- `metadata` : exécuter les vérifications primitives uniquement, limite de taille, clé/valeur secrètes et payload d'affichage dangereux.

En cas d'échec de validation :

- Entrée clairement malveillante ou hors limites : rejeter la requête.
- Peut contenir un locator sensible mais l'utilisateur souhaite toujours afficher l'artifact live : peut être rétrogradé en `ephemeral`, avec écriture de `persistenceWarning.code = "validation_downgraded"` ; ne doit pas être écrit dans le JSONL.

### 5.2 Flux d'écriture d'artifacts

Flux V1 :

```text
ingest input -> normalize/validate -> upsert live store -> publish artifact_changed
```

Flux V2 :

```text
ingest input
  -> normalize/validate
  -> in SessionArtifactStore operationQueue: compute effective mutation
  -> for restorable changes: request chat-recording writer append
     artifact journal/snapshot on the active leaf chain
  -> apply live-store mutation
  -> publish artifact_changed with effective retention/warning fields
```

La file d'opérations du `SessionArtifactStore` sérialise les mutations live, les requêtes de persistance et l'ordre SSE de la même session ; l'append JSONL réel reste effectué par le propriétaire de l'enregistrement du chat. Pour un artifact d'outil/hook ordinaire, si le writer de persistance est indisponible, il peut être rétrogradé en `ephemeral` live-only avant d'entrer dans le store live.

Si l'override sticky ephemeral a supprimé la persistance d'un upsert implicite/par défaut, l'artifact live doit porter `persistenceWarning.code = "sticky_override_active"`, et un log structuré `action=sticky_override_suppressed` ainsi qu'une métrique de compteur doivent être enregistrés. Sinon, lors du dépannage, on verrait une entrée d'upsert légitime sans enregistrement durable correspondant.

La PR actuelle n'a pas de vue paginée cachée des métadonnées persistées ; la liste live est l'ensemble de métadonnées exposé au client après restauration. Le traitement de la limite adopte donc une stratégie restreinte :

- Les artifacts `ephemeral` peuvent être simplement retirés de la vue live, sans écriture dans le journal.
- Lorsqu'un artifact `restorable` est supprimé par la limite, écrire un événement remove `reason: "eviction"`, pour éviter que le prochain chargement/relecture ne ressuscite toutes les entrées déjà supprimées.

### 5.3 Sémantique d'échec d'écriture

Distinguer deux entrées :

- Artifact d'outil/hook ordinaire : un échec de persistance ne doit pas faire échouer l'appel d'outil ; l'artifact peut toujours entrer dans le store live, mais il faut d'abord rétrograder la `retention` du store live en `ephemeral`, définir `persistenceWarning`, puis publier `artifact_changed`.
  Pour les mutations de suppression qui affectent le résultat de restauration, la PR actuelle distingue par raison :

- `eviction` : événement remove durable, garantissant que la limite de 200 entrées est toujours respectée après redémarrage.
- Unpin-`ephemeral` historique : lors de la lecture des vieux journaux, continuer à reconnaître l'événement remove durable et écrire l'id dans `stickyEphemeralIds` borné ; les upsert implicites/par défaut ultérieurs restent live-only, jusqu'à ce qu'un `retention: "restorable"` explicite les supplante.
- DELETE explicite : live-first. Retirer d'abord du store live et publier l'événement de suppression, puis écrire en best-effort la pierre tombale de suppression explicite. Si l'écriture de la pierre tombale échoue, la réponse renvoie un warning (actuellement un warning sous forme de chaîne), indiquant que la suppression n'est pas durable ; si le démon redémarre avant le succès de l'écriture complémentaire, l'ancien journal peut encore restaurer cet artifact.
- `deleteContent: true` n'appartient pas à l'API publique de la PR #6259. Le suivi de rétention de contenu définira le GC de contenu et le contrat de warning ; le DELETE explicite de la PR actuelle ne traite que la pierre tombale de métadonnées et le retrait live.

Warnings recommandés :

```text
[artifacts] session=<id> action=persist_failed artifact=<id> reason=<code>
[artifacts] session=<id> action=remove_not_persisted artifact=<id>
[artifacts] session=<id> action=sticky_override_suppressed artifact=<id> prior_reason=unpin_to_ephemeral
```

### 5.4 Flux de restauration

Lors du chargement/relecture de session :

1. `SessionService.loadSession()` lit le JSONL et extrait les enregistrements de snapshot/event d'artifacts dans le même cycle de parsing.
2. Sur la base de la chaîne de leaf active, extraire le dernier `session_artifact_snapshot` valide et les `session_artifact_event` postérieurs. Les enregistrements d'artifacts sur les branches abandonnées doivent être ignorés.
3. Reconstruire le snapshot d'artifacts, appliquer les pierres tombales.
4. Réexécuter la validation de restauration V2 pour chaque artifact.
5. Le résultat de chargement porte `artifactSnapshot` vers le bridge côté démon.
6. Le bridge du démon, lors de `createSessionEntry` / complétion de restauration, initialise le `SessionArtifactStore` côté démon avec le snapshot.
7. `GET /session/:id/artifacts` lit ce store côté démon.

Ne pas initialiser le `SessionArtifactStore` dans l'objet agent/session du processus enfant ACP : le store visible par l'API HTTP de production est créé dans le bridge côté démon.

`loadSession()` doit être read-only : il ne peut pas écrire de pierres tombales pendant le parsing, ni déclencher directement un GC de contenu. Si après restauration la limite live actuelle ou la politique est plus stricte que l'historique, le store côté démon, une fois créé et le writer de persistance disponible, écrit des événements remove `eviction` via la file d'opérations normale ; si le writer est indisponible, masquer seulement les éléments hors limite dans la vue live, avec un warning ; le prochain chargement peut encore revoir ces enregistrements en attente de suppression.

Le traitement du store live pendant rewind/relecture doit être cohérent avec le chargement : dès que le leaf actif change, le store live plat ne peut pas continuer à conserver des mutations d'artifacts hors branche. Si l'implémentation actuelle n'a pas de résultat de relecture de la chaîne active pour réinitialiser directement, un snapshot d'artifacts top-up doit être écrit à la fin du rewind, sinon la capacité de persistance ne peut pas être activée.

Le point d'intégration concret doit être un hook explicite, pas une réparation paresseuse au prochain GET. Il est recommandé que l'implémentation du rewind/changement de leaf appelle `onActiveLeafChanged(sessionId, artifactSnapshot)` du bridge du démon, ou porte un événement équivalent dans le résultat existant de chargement/relecture de session ; après réception, le store d'artifacts réinitialise ou écrit un snapshot top-up dans la file d'opérations de la même session.

### 5.5 Validation lors de la restauration

Lors de la restauration, revalider :

- `workspacePath` : doit toujours être un chemin relatif ; selon la racine du workspace au moment du restore, réexécuter resolve/realpath/stat ; ne doit pas s'échapper du workspace actuel. Après une relocalisation du workspace, si le même chemin relatif existe toujours, il peut être restauré comme `available` ; si le fichier manque ou si le nouveau layout du workspace est incohérent, restauré comme `missing`. La V2 ne fait pas de remapping automatique de chemin.
- `external_url` : n'autoriser que `http:` / `https:` ; rejeter les identifiants username/password ; les query/fragment ressemblant à des secrets doivent être masqués, rétrogradés en locator non ouvrable, ou l'artifact entier rétrogradé/bloqué.
- `published` : un locator `file:` peut être restauré, mais uniquement si la revalidation du manifest de l'éditeur de confiance réussit et si la cible appartient au stockage published géré par le démon. Un `external_url` ordinaire ne peut jamais passer par `file:`.
- `managedId` : rejeter les formes de chemin, `..`, les chemins absolus, les séparateurs.
- Ancien `contentRef` : validé et retiré uniquement comme entrée de vieux journal ; la PR #6259 ne résout pas le contenu via le manifest géré par le démon, et n'expose pas l'ancien `contentRef` comme une promesse de contenu ouvrable.
- `metadata` : réexécuter les vérifications primitives uniquement, limite de taille, clé/valeur secrètes et payload d'affichage dangereux.

En cas d'échec de restauration :

- Échec de sécurité : conserver l'entrée mais avec `restoreState: "blocked"`, `status: "missing"`, sans fournir de locator ouvrable.
- Ressource manquante : `status: "missing"`.
- Corruption de champ non sécuritaire : ignorer cet artifact, avec un warning.

### 5.6 Sémantique de branche / fork

Le `/branch` existant copie la chaîne d'enregistrements JSONL active et réécrit `sessionId`. Les enregistrements d'artifacts V2 ne sont copiés que depuis la chaîne de leaf active ; les enregistrements d'artifacts atterris sur une branche abandonnée après rewind n'entrent pas dans le fork. Lors de la copie, les ids d'artifacts doivent être traités explicitement :

- La même ressource doit recevoir un nouvel id d'artifact dans la nouvelle session, car l'identité V1 inclut `sessionId`.
- Lors de l'écriture du fork dans la session cible, l'id d'artifact doit être recalculé selon `sessionId + locator` cible.
- Les pierres tombales doivent aussi être réécrites avec les nouveaux ids de la session cible. Tant que l'id d'artifact de la pierre tombale peut être remappé en toute sécurité, elle doit être conservée dans la session cible, même si aucun upsert correspondant n'est trouvé temporairement dans la chaîne active cible ; une pierre tombale orpheline sans upsert correspondant est inoffensive, mais la supprimer pourrait faire perdre la suppression à un upsert ultérieur du même id.
- `forkedFrom` peut enregistrer l'id de session d'origine / l'id d'artifact d'origine, comme information d'audit, mais ne doit pas participer aux décisions de permission de la nouvelle session.
- Lorsque le fork hérite des métadonnées d'un ancien artifact `pinned`, il doit être rétrogradé en `restorable`, et l'ancien `contentRef` supprimé.
- La copie du fork doit réexécuter la validation d'ingestion/restauration, la minimisation de confidentialité et le masquage. Les locators dans workspace / url / metadata qui ne peuvent pas être exprimés en toute sécurité dans la session cible doivent être rétrogradés, retirés ou abandonnés ; ils ne doivent pas être copiés directement parce que la session source a passé la validation un jour.
- `managedId` ne doit pas être copié aveuglément depuis la session source. Si un nouveau `managedId` peut être dérivé dans la session cible depuis le workspace cible / le manifest géré par le démon, il doit être recalculé ; s'il ne peut pas être dérivé en toute sécurité, `managedId` doit être supprimé ou les métadonnées de cet artifact abandonnées.

Le remap de fork est un critère de publication : si un chemin ne peut pas réécrire en toute sécurité les ids d'artifacts et les pierres tombales, les enregistrements de persistance d'artifacts doivent être abandonnés lors du fork, et l'id d'artifact de la session source ne doit pas être transmis tel quel à la nouvelle session. Si l'implémentation actuelle du fork possède un mécanisme de top-up du type `file_history_snapshot`, les artifacts ne peuvent générer un top-up que depuis le résultat de relecture de la chaîne active, et non être complétés tels quels depuis le store live actuel du démon, sinon des artifacts qui n'appartiennent plus à l'historique après rewind seraient introduits dans la nouvelle session.

L'implémentation actuelle du fork n'ajoute pas enregistrement par enregistrement, mais génère d'abord la liste complète des enregistrements cibles depuis la chaîne active source, puis écrit dans le fichier JSONL cible par création exclusive ; si l'écriture échoue, le fichier de session cible n'est pas utilisé comme fork réussi. Donc la PR actuelle n'écrit pas de `session_artifact_fork_marker`. Si à l'avenir le fork devient un append en streaming ou une copie par lots inter-processus, des marqueurs begin/complete, une vérification de comptage et des règles de récupération `fork_incomplete` seront alors introduits.

La sémantique de rewind du fork est à portée de branche : la session cible ne copie que le résultat de la chaîne active actuelle. Si l'utilisateur rewind avant un DELETE explicite puis fork, cette pierre tombale DELETE n'est de toute façon pas dans la chaîne active, et la réapparition de l'artifact dans la nouvelle branche est le comportement attendu des branches historiques. Si le produit a besoin d'une sémantique de « suppression non rewindable globale » ou d'effacement de confidentialité, cela doit faire l'objet d'une conception de politique séparée, et ne doit pas être mélangé au modèle de branche par défaut de la V2.

L'amplification de fork des métadonnées est acceptée en V2 comme un compromis borné : le fork nécessite la permission de mutation de session, chaque fork reste soumis à la limite de 200 métadonnées persistées, chaque entrée de métadonnées est petite, et il n'hérite pas des octets de contenu. La V2 n'introduit pas de quota de métadonnées au niveau projet ; l'implémentation doit enregistrer une métrique/un log du nombre d'artifacts forkés, et si un abus réel apparaît, un plafond au niveau projet sera introduit.

## 6. Conception de l'API

### 6.1 Capacité

Ajout à `GET /capabilities` :

```json
"session_artifacts_persistence"
```

Ce n'est que lorsque l'implémentation de la PR de rétention de contenu devient disponible qu'elle est déclarée en même temps :

```json
"session_artifacts_content_retention"
```

Actuellement `/capabilities` est une liste de chaînes de fonctionnalités, donc `enabled: false` ne peut pas exprimer « l'implémentation existe mais est actuellement désactivée ». Les règles sont :

- Déclarer la chaîne de fonctionnalité correspondante uniquement lorsque le comportement est disponible et activé dans la configuration actuelle.
- Lorsque l'enregistrement du chat est désactivé, la persistance des métadonnées désactivée ou le writer indisponible, ne pas déclarer `session_artifacts_persistence`.
- Déclarer `session_artifacts_content_retention` uniquement lorsque la sauvegarde explicite de contenu de workspace, les quotas, le manifest, le GC/fsck à portée de session de la future archive de contenu sont tous disponibles. La PR #6259 ne déclare pas cette capacité.
- Si le client a besoin de lire les limites/la rétention par défaut, un endpoint de configuration ou une requête de configuration SDK doit être conçu séparément ; ne pas mélanger des détails structurés dans le contrat de capacité actuel en chaînes seules.

### 6.2 Ajout d'artifact

`POST /session/:id/artifacts` autorise en option :

```json
{
  "title": "Report",
  "kind": "html",
  "storage": "workspace",
  "workspacePath": "reports/run.html",
  "retention": "restorable",
  "clientRetained": true
}
```

Limites :

- Le client peut demander `ephemeral` ou `restorable`.
- Le client ne peut pas demander `pinned`.
- `clientRetained` est optionnel, et indique uniquement l'intention de rétention de l'utilisateur et une indication d'ordre ; le serveur doit valider la source selon §5.1 et ne doit pas l'utiliser comme autorisation.

### 6.3 Pin/save d'artifact

La PR #6259 n'expose pas d'endpoint pin/save. L'archivage de contenu explicite, l'archive de contenu, pin/save et la rétention de contenu associée appartiennent au suivi de rétention de contenu ; avant qu'il n'atterrisse, l'implémentation ne doit pas exposer d'API de rétention de contenu.

### 6.4 Unpin

La PR #6259 n'expose pas d'endpoint unpin et ne génère pas de nouvelles pierres tombales unpin. L'ancien `reason: "unpin_to_ephemeral"` des vieux journaux continue uniquement d'être relu comme entrée de compatibilité, pour éviter un changement de sémantique de restauration de l'historique. Pour retirer de la liste, utiliser toujours le DELETE V1.

### 6.5 Suppression d'artifact

Le DELETE de la V2 reste idempotent comme en V1 et adopte la sémantique live-first de la PR actuelle :

- Retirer d'abord l'artifact du store live, pour que la suppression visible par l'utilisateur prenne effet immédiatement.
- Puis ajouter en best-effort la pierre tombale remove de `session_artifact_event` ; après le succès de la pierre tombale, l'artifact ne ressuscite plus lors de la restauration des métadonnées.
- En cas d'échec de la pierre tombale, renvoyer un résultat de mutation réussi mais avec un warning ; l'artifact est supprimé pendant le cycle de vie actuel du démon, mais si le démon redémarre avant la persistance de la pierre tombale, l'ancien artifact durable peut encore être restauré. L'utilisateur ou l'UI de niveau supérieur peut réessayer le DELETE après la récupération du stockage.
- DELETE reste idempotent pour un artifact inexistant ; si une pierre tombale durable existe déjà, un DELETE répété n'a pas besoin de réécrire la même pierre tombale.
- Le DELETE de la PR #6259 n'accepte pas `deleteContent` et ne déclenche pas de GC de contenu géré par le démon ; les anciennes métadonnées `contentRef` sont seulement rétrogradées ou supprimées lors du restore/de la sérialisation.

### 6.6 Réponses de mutation

La PR #6259 ne livre que la réponse de mutation DELETE.

Succès :

- DELETE : `200 OK` renvoie `{ "deleted": true, "artifactId": string, "warnings"?: [...] }`.
- Si la persistance de la pierre tombale du DELETE échoue, renvoyer toujours un résultat de mutation `200 OK`, avec la raison de l'échec de persistance dans `warnings` ; l'implémentation actuelle utilise un warning sous forme de chaîne, par exemple `remove_not_persisted`. Cela signifie que la suppression live a pris effet mais n'est pas garantie après redémarrage, et ne doit pas être affichée comme un succès de suppression durable.

Échec :

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "retention must be ephemeral or restorable"
  }
}
```

HTTP mapping de la PR #6259 :

- `400 VALIDATION_FAILED` : body invalide, le client demande `pinned`, l'artifact n'existe pas, le quota de métadonnées est plein sans candidat supprimable, ou le writer est indisponible alors que la mutation doit être strictement durable.
- `403 FORBIDDEN` : permission de mutation de session manquante.
- DELETE reste idempotent ; un artifact inexistant renvoie un résultat de mutation vide plutôt qu'une erreur.
- Un échec de persistance de la pierre tombale du DELETE renvoie `200 OK` + warning, car la suppression live actuelle a pris effet mais n'est pas garantie après redémarrage.

Des codes d'erreur HTTP plus fins `INVALID_ARGUMENT`, `NOT_FOUND`, `CONFLICT`, `METADATA_QUOTA_EXCEEDED`, `QUOTA_EXCEEDED` ou `PERSISTENCE_UNAVAILABLE` sont un polish d'API ultérieur et n'appartiennent pas au contrat filaire de la PR actuelle.

## 7. Conception de la sécurité

### 7.1 Principes d'autorisation

Ne pas utiliser le `clientId` public comme frontière d'autorisation. La frontière de confiance HTTP réelle de la V2 reste le bearer token du démon + les permissions read/mutate au niveau route ; dans le modèle d'authentification actuel, `session_owner` ne peut pas être émis en toute sécurité ni persisté après un redémarrage du démon. Donc la V2 n'introduit pas de niveau de propriétaire plus fort que le détenteur de token.

Le principal interne ne sert qu'à l'audit, à la politique par défaut et à la prévention de l'usurpation de payload ; ce n'est pas une source d'autorisation durable :

```ts
type ArtifactPrincipal =
  | { kind: 'token_holder' }
  | { kind: 'client_connection'; id: string }
  | { kind: 'trusted_publisher'; id: string }
  | { kind: 'hook'; extensionId: string };
```

Règles d'autorisation :

- list : nécessite la permission read de session.
- add ephemeral/restorable : nécessite la permission mutate de session.
- delete metadata : nécessite la permission mutate de session. La garde de suppression même-principal V1 ne peut servir que de garde UX de processus live et d'indication d'audit ; elle dépend du contexte de connexion actuel et ne peut pas prouver le propriétaire de l'artifact après un redémarrage du démon. Après restauration, la propriété ne peut pas être usurpée depuis le `clientId` public ; l'autorisation de suppression se réduit à la permission mutate au niveau session et enregistre un audit `ownership_unverified`.
- Archive de contenu / suppression de contenu : non activé dans la PR actuelle. Si à l'avenir l'archive de contenu est relancée, elle nécessitera la permission mutate de session, une capacité indépendante, un appel REST/SDK explicite, et une correspondance de principal créateur vérifiable dans le processus actuel ou une politique explicite d'override/administration ; une session d'arrière-plan/un hook ne peut pas initier directement une suppression de contenu.

Si un véritable `session_owner` est nécessaire à l'avenir, une capacité ou une ACL durable par session doit d'abord être conçue, et ne doit pas être supposée implicitement dans ce document V2.

### 7.2 Frontière de la future archive de contenu

Cette section est le plan de la future archive de contenu, et n'appartient ni au périmètre d'implémentation ni à l'acceptation de la PR #6259.

Pas de copie par défaut :

- Contenu des URL externes
- Fichiers de workspace arbitraires
- Liens ordinaires de l'assistant

Si à l'avenir l'archive de contenu est activée, les sources pouvant être envisagées :

- Les artifacts `published` générés par `ArtifactTool` / éditeur de confiance.
- Les artifacts de workspace explicitement épinglés par l'utilisateur, dont le fichier est dans le workspace et dont le type/la taille sont contrôlables.
- Les artifacts managed uploadés ou enregistrés par le client, à condition d'être reçus et validés via l'API du démon.

Le stockage d'artifacts géré par le démon doit avoir une racine claire :

- La racine de contenu `managed_copy` se trouve dans la zone de contenu d'artifacts du répertoire de données du démon, par exemple `<daemonDataDir>/artifacts/content/`.
- La racine de fichiers `published` se trouve dans la zone d'artifacts publiés du répertoire de données du démon, par exemple `<daemonDataDir>/artifacts/published/`, ou dans une racine équivalente possédée par le démon déclarée par la configuration ; l'id de racine doit être écrit dans le manifest de l'éditeur.
- Le JSONL ne doit pas conserver de chemins absolus d'hôte directement fiables. Lors du restore, seuls l'id de racine du manifest et le locator relatif peuvent être lus ; après resolve/realpath, ils doivent toujours se trouver dans la racine correspondante, et l'évasion de symlink/chemin doit être rejetée.
- Le manifest de l'éditeur de confiance enregistre au minimum l'id de l'éditeur, l'id de l'artifact, l'id de la racine de stockage, le chemin relatif ou l'id de contenu, sha256, sizeBytes et createdAt. Le locator `file:` ne peut être régénéré que par ce manifest, et ne peut pas provenir du payload du client ni d'un ancien champ JSONL.

La copie de contenu doit être sûre contre les courses :

- La vérification de confinement du workspace passe.
- N'autoriser que les fichiers réguliers ; rejeter les répertoires, FIFO, périphériques, sockets et autres fichiers spéciaux.
- Ouvrir le fichier avec une sémantique no-follow ; sur Linux, `openat2(RESOLVE_NO_SYMLINKS)` peut être utilisé, et sur les autres plateformes, une combinaison disponible de no-follow/revalidation de handle ouvert.
- Après l'ouverture, exécuter fstat/revalidation sur le handle de fichier, pour confirmer qu'il s'agit toujours d'un fichier régulier, toujours dans le confinement du workspace.
- Rejeter les hardlinks avec un nombre de liens anormal, sauf allowlist explicite ultérieure.
- Lors de la lecture, imposer un max bytes par flux ; ne pas faire d'abord confiance à la taille du stat.
- Hacher exactement les octets copiés, et enregistrer sha256, taille, mimeType.
- Avant l'ouverture/le téléchargement du contenu conservé, revalider le manifest/hash.

### 7.3 Confidentialité et informations sensibles

Avant la persistance, une minimisation doit être effectuée :

- Ne pas conserver les chemins absolus de l'hôte.
- Ne pas conserver username/password d'URL.
- Les query/fragment ressemblant à des secrets des URL externes doivent être rejetés, masqués, ou l'artifact rétrogradé en `ephemeral` / locator non ouvrable ; ne doivent pas être écrits tels quels dans le JSONL.
- Les metadata utilisent une allowlist ou une denylist de clés secrètes ; les clé/valeur `token`, `password`, `secret`, `cookie`, `authorization` etc. doivent être rejetées, masquées, ou rétrogradées en `ephemeral`.
- Les metadata restent limitées à 4 Ko.
- title/description/metadata continuent d'exécuter les vérifications de payload d'affichage dangereux.
- `persistenceWarning.message`, même comme simple champ de réponse live, doit utiliser un gabarit sans chemin ou un texte désensibilisé ; les chemins d'hôte, identifiants, tokens, racines de contenu, ids de connexion ne doivent pas être écrits dans le warning.

Paramètres pouvant être ajoutés ultérieurement :

```json
{
  "sessionArtifacts": {
    "persistence": {
      "enabled": true,
      "defaultRetention": "restorable",
      "maxLiveArtifacts": 200,
      "maxPersistedMetadata": 200,
      "snapshotThresholdMutations": 100,
      "snapshotThresholdBytes": 262144,
      "contentRetention": {
        "enabled": false,
        "maxArtifactBytes": 52428800,
        "maxTotalBytes": 268435456,
        "maxTtlDays": 365,
        "ttlScanIntervalSeconds": 900
      }
    }
  }
}
```

La PR actuelle n'ajoute pas de schéma de configuration opérateur ; les valeurs ci-dessus sont publiées sous forme de constantes de code, et la disponibilité du comportement est exprimée via la capacité. Exposer ces valeurs comme réglages opérateur est une amélioration ultérieure, et le client ne doit pas déduire les détails de configuration des chaînes de capacité.

## 8. Quota, GC et stabilité

### 8.1 Quota de métadonnées

Défauts recommandés :

- La limite du store live reste 200.
- La limite de métadonnées persistées par session est 200, alignée sur le store live.
- Un enregistrement de snapshot conserve au plus 200 artifacts actuellement valides.

La limite du store live est aussi la limite de l'ensemble visible de restauration dans l'implémentation actuelle :

- L'éviction live V2 doit éliminer en priorité les artifacts `ephemeral`.
- S'il faut choisir la vue live parmi les artifacts durables, l'implémentation actuelle effectue une sélection déterministe selon réservation de source, source, status, retention, clientRetained et ordre d'insertion.
- Lorsqu'un artifact durable est éliminé par la limite live, l'implémentation actuelle écrit un événement remove `reason: "eviction"`, pour garantir que la prochaine restauration ne ressuscite pas à répétition des éléments déjà éliminés par le démon.
- `clientRetained` est l'intention de rétention de l'utilisateur ; il entre dans `PersistedSessionArtifact`, pour un ordre stable après restauration et la sélection de la limite live ; c'est une protection d'ordre, pas une protection absolue.

Dépassement de la limite de métadonnées persistées :

- `ephemeral` n'écrit de toute façon pas dans le journal, n'est pas compté dans le quota de métadonnées persistées, et n'est soumis qu'à la limite du store live.
- `restorable` doit être supprimé selon un ordre déterministe avec écriture d'un événement remove `eviction` : supprimer d'abord les artifacts `restorable` non `clientRetained` ; s'il n'y a toujours pas d'espace, supprimer ensuite les artifacts `restorable` `clientRetained`. `clientRetained` est une protection d'ordre, pas une protection absolue.

Le seed de restauration ne peut pas dépasser la limite du store live ; si l'historique contient plus d'artifacts persistés valides que la limite live actuelle, le store côté démarre le sous-ensemble visible selon les mêmes règles déterministes, et écrit via la file d'opérations des événements remove `eviction` pour les éléments durables supprimés. Le processus de parsing de `loadSession()` lui-même reste read-only et ne peut pas écrire directement un prune durable.

### 8.2 Quota de contenu

Cette section relève du périmètre d'implémentation de la PR de rétention de contenu ultérieure ; la PR #6259 n'introduit pas de quota de magasin de contenu.

Défauts recommandés pour la PR de découpage ultérieure :

- Artifact unique : 50 Mo.
- Total du magasin de contenu : 256 Mo.

Lorsque la limite est atteinte :

- Un nouveau pin/save renvoie `QUOTA_EXCEEDED`.
- Ne pas supprimer automatiquement le contenu épinglé encore référencé par les artifacts live de la session actuelle.
- Le fork n'hérite pas du contentRef épinglé, pour éviter que le fork ne contourne le quota.

### 8.3 GC

Cette section relève du périmètre d'implémentation de la PR de rétention de contenu ultérieure. Le GC ne traite que les copies managed à portée de session gérées par le démon :

- Le manifest de contenu conserve `sessionId` et `artifactId` ; le GC ne supprime que le contenu dont le manifest appartient à la session actuelle et qui n'est pas dans l'ensemble de références live actuel `contentRefs()`.
- `pinWorkspaceFile()`, le GC et le nettoyage tmp sont sérialisés par la même file d'écriture, avec un bail en cours pour éviter que le GC/pin concurrent ne supprime un contenu fraîchement copié mais pas encore journalisé.
- L'expiration de `expiresAt`, via un prune léger avant `GET /artifacts`, rétrograde l'artifact épinglé en `restorable`, supprime `contentRef` puis déclenche le GC.
- close / suppression explicite / unpin / endpoint GC explicite effectuent tous un balayage best-effort ; un échec de GC ne bloque pas le flux prompt/tool.

Déclencheurs du GC :

- Suppression d'artifact, unpin, vérification d'expiration TTL, fermeture de session ou `POST /session/:id/artifacts/gc` explicite.
- Les entrées `.tmp` obsolètes sont nettoyées pendant le GC.

La reconstruction de références à portée projet, le suivi des scans incomplets, la période de grâce des orphelins et la bibliothèque globale d'artifacts sont des améliorations ultérieures. Les frontières de sécurité de la future archive de contenu doivent provenir de « ne pas hériter de contentRef entre sessions » et « ne supprimer que le contenu dont le manifest appartient à la session actuelle et qui n'est pas référencé par les références live actuelles ».

### 8.4 Cohérence en cas de crash

Exigences :

- Les mutations du store d'artifacts sont sérielles.
- Un échec d'append du journal JSONL ne corrompt pas le store live.
- DELETE explicite live-first : le retrait du store live ne doit pas être bloqué par un échec du journal ; le warning de réponse indique aux clients quand la pierre tombale n'était pas durable.
- Le DELETE explicite avec `deleteContent: true` n'est disponible que dans le suivi de rétention de contenu ; cette PR doit exécuter en best-effort un GC de contenu à portée de session après le retrait live et exposer les warnings de suppression de contenu.
- L'éviction par la limite live des artifacts durables écrit un événement remove `eviction`, pour que la restauration respecte la limite.
- Le lecteur tolère les JSONL tronqués et les enregistrements d'artifacts corrompus.
- En cas d'anomalie d'ordre pierre tombale / snapshot, choisir de ne pas restaurer plutôt que de deviner.

Ordre d'écriture de la future archive de contenu :

1. Copier le contenu vers un chemin de staging, hacher exactement les octets copiés, et fsync les octets.
2. Déplacer atomiquement vers la racine de contenu gérée par le démon, écrire le manifest de contenu et le fsync.
3. Ajouter l'événement du journal d'artifacts, référencer ce contentRef, et fsync le JSONL.
4. Mettre à jour le store live et publier `artifact_changed`.

Si l'étape 2 réussit mais qu'un crash survient avant l'étape 3, il restera un contenu orphelin sans référence de journal ; c'est permis, et le futur GC à portée de session le supprimera en best-effort après avoir confirmé que le manifest n'est pas référencé par les références live actuelles. Si l'étape 3 réussit, la restauration doit pouvoir trouver le contenu via le manifest. L'API explicite ne peut renvoyer un succès qu'après le succès de l'étape 3.

### 8.5 Coûts de lecture de fichiers, CPU et I/O

La V2 doit éviter que la restauration des artifacts ne devienne un nouveau goulot d'étranglement du chargement de session.

Recommandations pour le chemin de lecture :

1. Lorsque `SessionService.loadSession()` lit déjà le JSONL, extraire les enregistrements d'artifacts dans le même cycle de parsing.
2. Trouver le dernier `session_artifact_snapshot` valide, et ne relire que les événements d'artifacts postérieurs.
3. Sans snapshot valide, permettre un scan séquentiel unique des enregistrements d'artifacts, mais ne pas scanner le même fichier à répétition dans le flux de chargement.

Limites du coût CPU :

- La restauration des métadonnées ne fait que du parsing JSON et de la validation de champs, avec une complexité O(nombre d'artifacts + nombre d'événements après le dernier snapshot).
- La restauration d'`external_url` n'effectue aucune requête réseau.
- Le chargement/relecture de `workspace` ne restaure que les métadonnées ; le refresh GET/list refait un stat sur un fichier de workspace unique ou un lot, sous les limites TTL/lot, et n'hache que si nécessaire, pour distinguer `available` / `missing` / `changed`.
- La restauration de `managed` / `published` ne consulte que le manifest, sans lire le contenu des gros fichiers.
- Le hachage du contenu de workspace n'est pas exécuté intégralement pendant la phase de parsing JSONL de `loadSession()`. Le refresh GET/list utilise d'abord taille + mtimeMs comme porte de stat bon marché ; ce n'est que si le stat indique une possible réécriture à taille identique que le flux du fichier est lu pour calculer le sha256.

Limites du coût I/O :

- La V2 ne lit pas de fichiers sidecar supplémentaires.
- La validation d'état du workspace réutilise la stratégie TTL/lot de la V1, et ne fait pas de stat illimité sur tous les artifacts dans le chemin chaud du GET.
- Pour les gros fichiers de workspace, ne pas lire le contenu pendant la phase de restauration ; lors de l'enregistrement, le flux du fichier en temps réel est lu pour calculer le sha256, et lors des refresh ultérieurs, le flux du fichier n'est relu que si taille/mtimeMs indiquent un changement possible, sans copie vers le stockage géré par le démon.

Défauts recommandés :

- Limite du snapshot d'artifacts à 200 entrées.
- Taille de lot de restauration d'état de workspace 20, cohérente avec la V1.
- Seuil de snapshot du journal d'artifacts à 100 mutations ou 256 Ko.
- Le sha256 de workspace est effectué de manière synchrone lors de l'enregistrement ; la validation d'état après restauration est un refresh paresseux TTL/lot, et taille + mtimeMs évitent de refaire un hachage complet sur les fichiers inchangés.

### 8.6 Observabilité

Les nouveaux chemins d'échec de la V2 doivent avoir des logs structurés, au format existant :

```text
[artifacts] session=<id> action=<action> key=value
```

Actions recommandées :

- `persist_failed`
- `retention_downgraded`
- `restore_skipped`
- `restore_blocked`
- `remove_not_persisted`
- `eviction`
- `fork_artifact_discarded`
- `fork_incomplete`
- `snapshot_invalid`
- `sticky_override_suppressed`
- `tombstone_conflict`
- `v2_writer_version_gate_failed`

Le futur checker / l'archive de contenu peut ajouter des actions fsck, copie de contenu, TTL, GC ; la PR #6259 ne produit pas ces logs.

Ces logs ne remplacent pas `persistenceWarning` dans l'API/SSE, mais servent au dépannage en production.

Métriques recommandées :

- counter : `artifact_journal_append_total{result,reason}`
- counter : `artifact_restore_total{result,restore_state}`
- gauge : `artifact_pending_tombstone_count`
- gauge : `artifact_metadata_quota_used{session}`
- counter : `artifact_sticky_override_suppressed_total`

Le mode d'exportation réutilise le mécanisme de télémétrie/métriques existant du démon ; s'il n'existe pas actuellement d'endpoint Prometheus, ils doivent au moins entrer dans le sink de télémétrie structurée et pouvoir être agrégés par session/projet.

Les outils de diagnostic sont une amélioration ultérieure et n'appartiennent pas au contrat filaire de la PR #6259. Un checker metadata-only peut scanner le journal/snapshot/pierres tombales d'artifacts et les échecs de validation de restauration ; le checker de contenu complet, après la reconception de la future archive de contenu, scannera les manifests de contenu et le stockage géré par le démon. Le futur CLI ou API interne au démon (par exemple `qwen artifact fsck`) doit prendre en charge le dry-run :

- Le mode metadata-only rapporte les incohérences snapshot/pierre tombale et les échecs de validation de restauration.
- Le mode contenu complet rapporte les `contentRef` pendants, les manifests manquants et le contenu orphelin.
- Read-only par défaut ; le mode réparation ne peut effectuer que des actions sûres vérifiables, comme régénérer un snapshot ou marquer un contenu orphelin en attente de GC.

## 9. Plan d'implémentation

Voici les jalons d'implémentation au sein de la même phase de conception V2. Ils peuvent être découpés en PRs côté ingénierie ; à l'extérieur, les capacités réellement disponibles sont exposées par les capacités.

### Jalon A : types et service de persistance

- Ajouter un lecteur/writer de persistance d'artifacts :
  - Le writer se situe du côté du propriétaire de l'enregistrement du chat, ou est exposé par ce côté via un RPC explicite ; il est responsable d'ajouter les enregistrements d'événement/snapshot à la chaîne de leaf active.
  - Le lecteur se situe dans le chemin de parsing/relecture de `SessionService.loadSession()`, responsable de la reconstruction du snapshot d'artifacts depuis la chaîne de leaf active.
  - Partager la validation de restauration, les vérifications de cohérence snapshot/pierre tombale et la normalisation de la forme persistée.
- Étendre `ChatRecord.subtype` et l'union `systemPayload`.
- Ajouter `artifactSnapshot?` au résultat de chargement.
- Le checker metadata-only est une amélioration ultérieure ; il peut détecter en dry-run les enregistrements d'artifacts corrompus, les incohérences snapshot/pierre tombale et les échecs de validation de restauration.

### Jalon B : intégration du store côté démon

- Le `createSessionEntry` du bridge du démon prend en charge le seed d'artifacts.
- `SessionArtifactStore` prend en charge le seed d'artifacts.
- `upsertMany()` calcule dans la file d'opérations la `retention` effective, le prune de quota et la vue live, puis fait ajouter par le writer les enregistrements durables.
- `remove()` distingue le DELETE explicite et l'éviction ; le DELETE explicite est live-first avec écriture best-effort de la pierre tombale, l'éviction durable écrit dans le journal. L'ancien `unpin_to_ephemeral` n'est conservé en compatibilité que dans la relecture du journal / l'état sticky du snapshot.
- Le snapshot de backfill lors de la première activation de la V2 sur une session live V1 n'est pas dans le périmètre d'implémentation de la PR actuelle ; l'implémentation actuelle restaure depuis le journal/snapshot V2 nouvellement écrit.
- Conserver la forme des événements `artifact_changed` V1 inchangée, avec uniquement des champs optionnels ajoutés.

### Jalon C : intégration du chargement/relecture

- `SessionService.loadSession()` extrait les enregistrements de snapshot/event d'artifacts depuis la chaîne de leaf active, en ignorant les branches abandonnées.
- Le résultat de chargement confie le snapshot au bridge du démon, plutôt que de seeder le store dans le processus enfant ACP.
- L'écriture du prune au-delà de la limite de restauration ne peut être effectuée qu'après la création du store côté démon et la disponibilité du writer ; le processus de parsing du chargement reste read-only.
- Après rewind/changement de leaf, le store live côté démon se réaligne sur le résultat de relecture de la chaîne active, ou fixe l'état actuel de la chaîne survivante par un snapshot d'artifacts top-up.
- Le rewind/changement de leaf doit appeler un hook explicite, par exemple `onActiveLeafChanged(sessionId, artifactSnapshot)`, pour que le store côté démon effectue le reseed/top-up dans la file d'opérations.
- Lors de la relecture de l'historique, les artifacts de même identité ne sont pas recréés en double.
- `/branch` copie les enregistrements d'artifacts depuis la chaîne active et remappe les ids de session/d'artifact ; le chemin d'écriture actuel en création exclusive fichier complet n'a pas besoin de marqueur de fork.

### Jalon D : REST/SDK

- Ajouter les champs optionnels aux types du SDK.
- `POST /session/:id/artifacts` prend en charge `retention: "ephemeral" | "restorable"`.
- `POST /session/:id/artifacts` prend en charge l'indication booléenne `clientRetained`, et rejette les champs runtime réservés au démon transmis par le client.
- L'UI à porte de capacité.

### Jalon E : future archive de contenu

N'appartient pas à la PR #6259. S'il existe un futur besoin d'audit/archivage, il faudra concevoir séparément le manifest de contenu de workspace géré par le démon, le quota, la copie sûre contre les courses, la validation par hash, le GC/fsck protégé par file d'écriture/bail, et la liaison de contenu des artifacts publiés.

## 10. Plan de test

La PR #6259 doit actuellement couvrir :

- Après l'append du journal de métadonnées, le redémarrage/chargement du démon restaure la liste d'artifacts.
- L'append du journal d'artifacts s'effectue par le propriétaire de l'enregistrement du chat dans la chaîne de leaf active ; le store côté démon ne peut pas écrire directement dans le JSONL.
- Après `/rewind`, les upsert/remove d'artifacts sur les branches abandonnées ne participent pas à la restauration et ne sont pas copiés dans le fork.
- Après `/rewind`, le store live s'aligne immédiatement avec l'état des artifacts de la chaîne active ; la liste d'artifacts ne change pas seulement au redémarrage du démon.
- Le snapshot de backfill lors de la mise à niveau d'une session live V1 vers la V2 est une amélioration ultérieure ; les tests de la PR actuelle doivent confirmer que les anciens artifacts live non écrits dans le journal V2 ne sont pas signalés à tort comme restaurables.
- Après une pierre tombale DELETE, le chargement ne ressuscite pas l'artifact.
- Après la relecture d'une pierre tombale historique `unpin_to_ephemeral`, le chargement ne ressuscite pas l'artifact.
- Après un `unpin_to_ephemeral` historique, un re-upsert implicite/par défaut du même id d'artifact reste live-only ; un `restorable` explicite peut supplanter l'override sticky.
- Après l'avancée de la baseline du snapshot, `stickyEphemeralIds` maintient toujours les re-upsert implicites/par défaut en live-only, avec production du log/métrique/warning `sticky_override_suppressed`.
- Lorsque `stickyEphemeralIds` atteint la limite, l'unpin-to-ephemeral historique renvoie une erreur ou est reporté, sans perte silencieuse des anciens overrides sticky.
- DELETE explicite live-first : retrait immédiat de la vue live ; si l'écriture de la pierre tombale échoue, la réponse porte un warning ; les tests couvrent que le retrait live n'est pas bloqué par un échec de persistance.
- L'éviction d'artifacts durables écrit un événement remove `eviction` ; après restauration, la limite live n'est pas dépassée.
- Avancée de la baseline du snapshot : le snapshot périodique compresse la liste d'artifacts actuelle, les pierres tombales explicites ne croissent plus sans limite après le succès du snapshot, `stickyEphemeralIds` conserve l'état sticky.
- Les trois états fichier présent/manquant/évasion de symlink lors de l'ingestion et du restore des artifacts de workspace.
- Relocalisation de la racine du workspace : restauré comme available si le même chemin relatif existe ; restauré comme missing s'il manque ou si le layout est incohérent ; pas de remap de chemin.
- L'URL externe ne restaure que les métadonnées, sans requête réseau.
- Les query/fragment d'URL portant des secrets et les clé/valeur des metadata ne sont pas écrits dans le JSONL.
- Le `file:` local publié n'est restauré que si la revalidation du manifest de confiance réussit.
- `managedId` rejette les séparateurs, `..`, les chemins absolus et les formes de chemin lors de l'ingestion, du restore et du remap de fork ; le fork ne doit pas copier aveuglément le `managedId` de la session source.
- Les enregistrements JSONL corrompus sont ignorés sans affecter les autres artifacts.
- Lorsque l'enregistrement du chat / la persistance est désactivé, la restauration des métadonnées n'est ni déclarée ni activée.
- Lorsqu'un artifact d'outil échoue à persister, il est rétrogradé en live-only, visible par le client via `persistenceWarning`.
- Le traitement des sessionId/id des enregistrements d'artifacts lors du branch/fork, en utilisant uniquement le résultat de relecture de la chaîne active.
- Écriture fichier complet du fork : après remap de la chaîne active, écriture par création exclusive dans le JSONL cible, un échec ne produit pas un fork réussi ; si le fork devient un jour du streaming, des tests de marqueurs begin/complete seront ajoutés.
- Lorsque le fork / le restore lit un ancien artifact `pinned`, il est rétrogradé en restorable, sans hériter du contentRef.
- Les pierres tombales orphelines sont conservées lors du remap de fork et remappées en toute sécurité ; seules les pierres tombales ne pouvant pas être remappées en toute sécurité sont abandonnées.
- Le remap de fork réexécute la validation, la minimisation de confidentialité et le masquage ; les locators dangereux sont retirés, rétrogradés ou abandonnés.
- Le seed de restauration et un POST concurrent sont sérialisés, sans écriture perdue ni duplication.
- Limites de quota : 200 entrées, prune à 201 entrées, deux niveaux d'ordre clientRetained/non-clientRetained, suppression selon des règles déterministes même si tout est clientRetained restorable.
- Setter clientRetained : la requête d'ajout d'artifact peut définir l'indication booléenne ; l'ingestion automatique d'arrière-plan ne peut pas usurper la rétention utilisateur.
- Trois états de workspace : lors de l'enregistrement, écriture de taille + `metadata["qwen.workspace.sha256"]` + `metadata["qwen.workspace.mtimeMs"]` ; le refresh GET/list distingue `available`, `missing` et `changed`, et les fichiers inchangés n'empruntent que le chemin rapide du stat.
- Autorisation : cas autorisés et refusés des chemins d'audit token-holder/principal ; la garde même-principal live V1 sert uniquement d'indication UX/audit live, pas de frontière de sécurité durable.
- Avancée de la baseline du snapshot JSONL : déclenchement par seuil, relecture post-snapshot bornée, le payload du snapshot ne porte plus les pierres tombales explicites déjà couvertes, une pierre tombale sticky supplantée autorise la réapparition explicite du même id, `stickyEphemeralIds` conserve l'état sticky ; le fichier JSONL lui-même n'est pas réécrit par le sous-système d'artifacts.
- Fallback de dernier snapshot corrompu : repli sur un snapshot valide plus ancien ou une relecture séquentielle unique des artifacts.
- Défauts de rétention : artifact d'outil sans rétention explicite, `pinned` de POST client rejeté.
- Capacité : la liste de chaînes n'est déclarée que lorsque le comportement est actuellement disponible ; ne pas dépendre de détails `enabled:false`.
- Idempotence de la relecture : relire deux fois le même historique de session ne duplique pas les artifacts.
- Un ancien client SDK ignorant les champs optionnels peut toujours afficher les artifacts V1.
- Compatibilité de rollback V2 -> V1 : un ancien démon doit pouvoir parser ou ignorer le sous-type `system` inconnu, sans faire planter le chargement de session ; après rollback, la non-restauration de la persistance des artifacts est une dégradation acceptable. Si la version minimale actuellement prise en charge ne peut pas le garantir, le writer V2 doit être à porte de capacité au-delà des versions prenant en charge les enregistrements système inconnus.
- Preflight de rollback : la version ancienne minimale prise en charge du démon charge un JSONL contenant des événements/snapshots V2 ; si des marqueurs de fork sont ajoutés à l'avenir, la fixture de rollback sera étendue.
- La PR #6259 couvre le contrat de réponse de l'API de métadonnées : corps de succès de suppression, échec de validation de quota de métadonnées, warning `remove_not_persisted` / `persistence_unavailable`, mapping actuel 400/403/200+warning.

La future archive de contenu / le checker couvre séparément :

- `deleteContent: true` expose un warning `content_delete_preserved` lorsque la pierre tombale/le GC de contenu présente un risque.
- Lors du pin/save de contenu, rejet des symlinks, fichiers spéciaux, flux surdimensionnés, hardlinks anormaux et échange TOCTOU.
- Dry-run du checker metadata-only : enregistrements corrompus, fallback de snapshot, pierres tombales orphelines, échecs de validation de restauration.
- Dry-run du checker de contenu complet : `contentRef` pendants, manifest manquant, contenu orphelin et stratégie de réparation GC.

## 11. Ce qui est déconseillé en V2

- Récupérer automatiquement les liens markdown ordinaires.
- Scanner automatiquement les changements de fichiers du workspace.
- Copier par défaut le contenu de tous les artifacts de workspace.
- Faire du polling de joignabilité des URL externes.
- Utiliser `clientId` comme justificatif d'autorisation de suppression.
- Faire du remapping automatique de chemin pour les workspaces relocalisés.
- Faire de grandes quantités de vérifications fs/réseau dans le chemin chaud du GET.
- Transformer un échec de persistance en échec d'un tour d'outil ordinaire.
- Introduire un cache sidecar sans mesure prouvant que c'est nécessaire.

## 12. Recommandation de périmètre de publication

Il est recommandé de publier la V2 comme une phase de conception complète, mais les capacités sont exposées par capacité :

- `session_artifacts_persistence` peut d'abord publier la restauration des métadonnées.
- `session_artifacts_content_retention` n'est pas publiée actuellement ; la future archive de contenu nécessite une reconception et une déclaration de capacité indépendante.
- Restaurer par défaut les métadonnées des artifacts explicitement enregistrés.
- Les artifacts enregistrés manuellement par l'utilisateur sont `restorable` par défaut et continuent d'apparaître dans la liste après chargement/relecture de session.
- La documentation utilisateur précise : la restauration des métadonnées restaure l'« index des produits », pas une « sauvegarde du contenu des produits » ; l'état `changed` du workspace indique seulement que le fichier en temps réel ne correspond plus à la taille enregistrée, ou qu'après un changement de mtime le hash ne correspond plus.

Procédure de rollback :

- Les enregistrements V2 restent dans le JSONL du chat et ne sont pas supprimés lors du rollback ; lorsque l'ancien démon peut ignorer le sous-type `system` inconnu, le chargement de session doit continuer à fonctionner mais sans restaurer la persistance des artifacts.
- Le stockage de contenu géré par le démon n'appartient pas à la PR #6259 ; la PR de rétention de contenu ultérieure doit définir séparément le processus de nettoyage des octets conservés après rollback.
- Si la version ancienne minimale actuellement prise en charge ne peut pas ignorer en toute sécurité les enregistrements système V2, le writer doit être à porte de capacité au-delà des versions sûres, ou un garde de migration doit être fourni avant la mise à niveau, empêchant l'écriture d'enregistrements V2.
- Avant la publication, le CI doit charger avec la version ancienne minimale prise en charge du démon un JSONL contenant `session_artifact_event` et `session_artifact_snapshot`, et affirmer que le chargement de session réussit et que les sous-types inconnus sont ignorés. Avant la première initialisation du writer V2, la porte de version/fonctionnalité doit aussi être vérifiée ; en cas d'échec, refuser d'écrire des enregistrements V2, enregistrer `v2_writer_version_gate_failed` et conserver le comportement V1. Si des marqueurs de fork sont ajoutés à l'avenir, ce sous-type sera inclus dans la fixture de rollback.
- Après rollback, le client ne peut pas dépendre de `session_artifacts_persistence` / `session_artifacts_content_retention`, car l'ancien démon ne déclare pas ces capacités.

Cela permet d'expliquer clairement la sémantique complète de la V2 actuelle : restaurer la liste par défaut, ne pas conserver le contenu, utiliser taille/mtime/hash du workspace pour éviter d'ouvrir silencieusement une mauvaise version, tout en évitant de refaire un hachage complet répété sur les fichiers inchangés.
