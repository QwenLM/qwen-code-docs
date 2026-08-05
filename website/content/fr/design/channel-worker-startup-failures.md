# Signalement des échecs de démarrage des workers de canal

## Contexte

[L'issue #6909](https://github.com/QwenLM/qwen-code/issues/6909) identifie une lacune de diagnostic dans les canaux gérés par le démon. Le rejet du `connect()` d'un adaptateur est journalisé par le worker, mais le worker ne signale ensuite que ready ou se termine avec `No channels connected.` Le superviseur, l'API de contrôle dynamique, le SDK et le CLI perdent donc l'erreur fournisseur exploitable.

Ce changement transporte les échecs de `connect()` bornés et assainis à travers la frontière de démarrage du worker. Il ne modifie pas l'analyse de la configuration, le chargement des extensions, la construction des adaptateurs, le comportement fail-fast du démarrage du démon, ni l'historique des échecs après démarrage.

## Comportement

- Si au moins un adaptateur sélectionné se connecte, le worker devient ready. Son snapshot courant contient les noms et raisons des canaux en échec, et l'activation dynamique renvoie toujours un succès avec `partial: true`.
- Si tous les adaptateurs échouent lors d'une activation dynamique, d'un remplacement ou d'un rechargement, la requête renvoie `502 channel_worker_start_failed` avec les échecs tentés. `state` décrit l'état courant après rollback ; les échecs tentés ne sont pas persistés dans cet état.
- Si tous les adaptateurs échouent lors du démarrage du démon, le démarrage reste fail-fast. Le listener du démon ne restant pas disponible, aucun GET ultérieur n'est promis.
- Une nouvelle génération de worker efface les échecs de démarrage de la génération précédente.

Seuls les rejets de `connect()` produisent ces enregistrements. `phase` est actuellement `connect` ; le SDK l'élargit délibérément à `string` afin qu'une future phase additive ne nécessite pas un changement de type avec rupture. Les valeurs de `code` des adaptateurs sont diagnostiques et ne constituent pas une taxonomie stable entre adaptateurs.

## Contrat

Un snapshot courant de worker peut contenir :

```ts
interface ChannelStartupFailure {
  channel: string;
  phase: 'connect';
  code?: string;
  message: string;
}

interface ChannelWorkerSnapshot {
  startupFailures?: ChannelStartupFailure[];
  startupFailuresTruncated?: boolean;
}
```

Un échec de démarrage dynamique peut en plus contenir des échecs annotés avec le workspace fiable du superviseur :

```ts
interface ChannelStartupAttemptFailure extends ChannelStartupFailure {
  workspaceCwd: string;
}
```

La chaîne d'erreur de premier niveau existante, les champs de rollback et l'état restent compatibles. Tous les nouveaux champs sont optionnels.

## IPC et cycle de vie

L'enfant envoie un message `channel_startup_failure` depuis chaque catch de `connect()` et attend `channel_startup_report_ack` avant d'essayer l'adaptateur suivant. Le parent valide, assainit, stocke, et ce n'est qu'ensuite qu'il acquitte l'élément. Le callback d'envoi n'est pas la frontière de durabilité : il prouve seulement que Node a accepté le message, tandis que l'ACK prouve que le superviseur l'a traité avant que le worker ne puisse se terminer de manière synchrone.

Au plus 64 échecs sont transférés. L'échec 65 produit un marqueur unique `channel_startup_failures_truncated`, qui est également acquitté ; les échecs ultérieurs restent uniquement sur stderr. Un seul rapport est en cours, donc l'ACK n'a pas besoin d'identifiant de requête.

Les messages du protocole de démarrage mal formés, trop longs, hors ordre ou non acquittables font échouer le démarrage borné et terminent l'enfant. Les messages IPC inconnus sans rapport conservent leur comportement existant. Le schéma ready existant et la validation sont intentionnellement inchangés.

Chaque chemin terminal avant ready enveloppe les échecs déjà acceptés dans `ChannelWorkerStartupError`. Les erreurs de réconciliation et de manager clonent ces détails tout en conservant séparément les problèmes de nettoyage ou de restauration en tant que `rollbackError`. Le workspace est ajouté depuis la configuration du superviseur, jamais depuis l'IPC de l'enfant.

## Sécurité et limites

Le worker et le superviseur normalisent tous deux les caractères de contrôle et invisibles, masquent exactement le jeton du démon et les valeurs d'environnement sensibles, appliquent des règles génériques d'identifiants et tronquent par point de code Unicode. La réponse HTTP d'échec dynamique et les frontières d'affichage du CLI valident à nouveau, appliquent le masquage générique, plafonnent la sortie et ignorent les entrées mal formées.

Les limites sont de 64 échecs, 128 points de code pour channel, 64 pour code et 512 pour message. Les objets d'échec et les snapshots sont clonés aux frontières de propriété pour empêcher les appelants de modifier l'état du superviseur.

## Alternatives rejetées

- Lire stderr dans le superviseur est ambigu, couple le comportement à la prose des journaux et ne peut pas fournir une attribution fiable au canal.
- Attendre uniquement le callback de `process.send()` est toujours en concurrence avec la sortie synchrone du worker.
- Persister une dernière tentative en échec changerait la sémantique du cycle de vie et recoupe le travail séparé de dernière erreur/historique ; les échecs dynamiques ne vivent au contraire que dans la réponse en échec.
- Inventer des catégories auth/réseau/config créerait une taxonomie instable entre adaptateurs. L'implémentation ne conserve qu'une chaîne fournie par l'adaptateur ou un code numérique fini.

## Vérification

La couverture unitaire exerce l'ordre des ACK, l'échec total/partiel, les chemins d'abandon et de timeout, les entrées de protocole mal formées, l'échec d'ACK, l'accès sûr aux exceptions, le masquage exact et générique, les copies profondes, la réinitialisation de génération, la troncature 64/65, la propagation du rollback, la validation HTTP, les exports SDK et le formatage CLI. Le test d'intégration réel du plugin-example utilise un port alloué localement puis fermé pour produire un `ECONNREFUSED` déterministe sans identifiants externes ni dépendances réseau.
