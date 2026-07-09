# Conception du rechargement à chaud du runtime LSP

## Contexte

Cette conception suit la même stratification que celle utilisée par
`mcp-runtime-reinitialization.md` : la CLI décide quand déclencher les rechargements,
et Core décide comment mettre à jour l'état du runtime. Elle réutilise également
les principes du watcher de `settings-change-detection.md` : aucun effet de bord
sur le système de fichiers au démarrage, changements avec debounce, diffs sémantiques,
listeners sérialisés, et les échecs des listeners n'affectent pas la session principale.

La différence clé entre LSP et MCP est que la configuration du serveur LSP ne se
trouve pas dans `settings.json`. Aujourd'hui, le service LSP natif utilise
`LspConfigLoader` pour lire le `.lsp.json` de l'espace de travail et les
déclarations `lspServers` des extensions activées, écrit le résultat dans le
`LspServerManager` à session unique via `NativeLspService.discoverAndPrepare()`,
et démarre enfin tous les serveurs configurés avec `start()`. Par conséquent,
`SettingsWatcher` seul ne peut pas détecter les modifications du `.lsp.json` de
l'espace de travail.

## Évaluation du code actuel

- Le démarrage de LSP est contrôlé uniquement par `--experimental-lsp` dans
  `packages/cli/src/config/config.ts`. Il n'y a actuellement pas de flag
  `--allowed-lsp-server-names` ni de paramètre équivalent de liste blanche CLI
  pour LSP ; le flag existant `--allowed-mcp-server-names` est exclusif à MCP.
- `NativeLspService` est construit une seule fois lors du chargement de la
  configuration de la CLI. Le chemin de démarrage appelle `discoverAndPrepare()`,
  puis `start()`, enveloppe ensuite le service dans `NativeLspClient` et
  l'attache à `Config`.
- `Config.setLspClient()` et `Config.setLspInitializationError()` lèvent
  actuellement des erreurs après l'initialisation, le rechargement à chaud du
  runtime ne doit donc pas remplacer l'objet client. Il doit conserver le
  `NativeLspClient` existant et ne faire qu'une réconciliation incrémentale du
  service sous-jacent.
- `LspConfigLoader` lit uniquement le `.lsp.json` de l'espace de travail et les
  `lspServers` des extensions actives. Le `.lsp.json` de l'espace de travail
  remplace la configuration des extensions par nom de serveur.
- `LspServerManager.setServerConfigs()` efface actuellement tous les handles ;
  il ne prend pas encore en charge la réconciliation incrémentale.
- Le dépôt actuel n'a pas de chemin de pool partagé pour LSP. Chaque session
  possède son propre `NativeLspService` et ses connexions sous-processus/socket.
  La conception doit laisser une limite pour un futur pool partagé, mais la v1
  implémente uniquement le mode session unique.

## Objectifs

Faire en sorte que les modifications de la configuration du serveur LSP prennent
effet sans redémarrer la session Qwen Code actuelle :

- démarrer un serveur lorsqu'il est ajouté ;
- arrêter un serveur lorsqu'il est supprimé, et le retirer du statut et du routage des outils ;
- redémarrer uniquement le serveur modifié lorsque sa configuration change ;
- maintenir les serveurs inchangés connectés et préserver leur état de préchauffe ;
- ne jamais démarrer de serveurs qui ne sont pas approuvés ou non autorisés ;
- permettre aux outils LSP et au statut `/lsp` d'observer le nouvel état du
  runtime via l'objet client existant.

## Hors objectifs

- Ne pas ajouter de pool de processus LSP partagé dans cette modification.
- Ne pas prendre en charge l'activation/désactivation de `--experimental-lsp` au
  runtime. Si LSP n'était pas activé au démarrage, il n'y a pas de service à
  recharger.
- Ne pas surveiller entièrement les changements d'installation/désinstallation
  des extensions qui affectent `lspServers` ; un `/reload` manuel couvrira les
  changements de configuration des extensions.

## Conception

### 1. Identifier chaque serveur LSP avec un hash stable

Ajouter un petit helper près du code de configuration LSP :

```ts
export function lspServerConfigHash(config: LspServerConfig): string;
```

Le hash doit être stable et basé sur la configuration du runtime normalisée
produite par `LspConfigLoader` :

- `name`
- `languages`
- `transport`
- `command`
- `args`
- `env`
- `initializationOptions`
- `settings`
- `extensionToLanguage`
- `workspaceFolder`
- `rootUri`
- `startupTimeout`
- `shutdownTimeout`
- `restartOnCrash`
- `maxRestarts`
- `trustRequired`
- `socket`

Les clés des objets doivent être triées afin que l'ordre des propriétés JSON ne
provoque pas de redémarrages inutiles. L'ordre des tableaux reste significatif
car l'ordre des arguments de commande et la priorité des langues peuvent être
importants. Ne pas inclure les champs du runtime tels que l'identifiant du
processus, le statut, le nombre de redémarrages, les diagnostics ou l'état de
préchauffe.

Pour la compatibilité future avec un pool partagé, définir l'identité du pool
comme suit :

```text
lsp:<workspaceRoot>:<serverName>:<configHash>
```

Le gestionnaire de session unique v1 a seulement besoin de maintenir
`serverName -> configHash`, mais le même hash pourra être réutilisé directement
dans la clé du pool ultérieurement.

### 2. Ajouter la réconciliation incrémentale à `LspServerManager`

Le rechargement à chaud ne doit pas réutiliser `setServerConfigs()`, qui efface
tous les handles. Ajouter :

```ts
async reconcileServerConfigs(
  configs: LspServerConfig[],
): Promise<LspReconcileResult>
```

Flux :

1. Construire les maps souhaitées : `name -> config` et `name -> hash`.
2. Pour les handles existants dont le serveur n'existe plus, appeler le
   `stopServer()` existant, puis supprimer le handle.
3. Pour les handles existants dont le hash a changé, appeler `stopServer()`,
   remplacer le handle par `{ config, status: 'NOT_STARTED' }`, puis le
   démarrer.
4. Pour les nouveaux serveurs, créer `{ config, status: 'NOT_STARTED' }` et les
   démarrer.
5. Pour les serveurs dont le hash n'a pas changé, ne rien faire et conserver le
   handle existant.

Ajouter un champ privé :

```ts
private serverConfigHashes = new Map<string, string>();
```

Le vider dans `stopAll()` et `clearServerHandles()`.

Retourner :

```ts
interface LspReconcileResult {
  added: string[];
  removed: string[];
  restarted: string[];
  unchanged: string[];
  failed: string[];
}
```

`skipped` ne fait pas partie du résultat de `LspServerManager`. Le gestionnaire
ne traite que les configurations qui ont passé l'admission ; les serveurs rejetés
par l'admission sont agrégés dans le résultat au niveau du service par
`NativeLspService.reinitialize()`.

Concurrence :

- Ajouter une file d'attente de réconciliation dans `LspServerManager` ou
  `NativeLspService` afin que les réconciliations s'exécutent en série. L'arrêt
  et le démarrage du même processus ne doivent pas créer de conditions de
  concurrence.
- Si une nouvelle configuration arrive alors qu'un serveur est encore en cours de
  démarrage, attendre `handle.startingPromise` avant de l'arrêter. Réutiliser le
  verrou de démarrage existant au lieu d'ajouter un verrou supplémentaire par
  serveur.
- `stopServer()` lui-même doit attendre `handle.startingPromise` après avoir
  défini `stopRequested`, afin que les chemins `stopAll()`, de suppression et de
  redémarrage couvrent tous les redémarrages suite à un crash qui sont encore en
  train d'assigner leur connexion/processus.

Comportement en cas d'échec :

- Si un serveur nouvellement ajouté ou modifié échoue au démarrage, conserver le
  handle et le marquer comme `FAILED` afin que `/lsp` puisse expliquer l'échec.
- Ne pas compter un démarrage échoué comme `added` ou `restarted` ; le signaler
  dans `failed`.
- Ne pas mettre en cache le hash de configuration pour un démarrage échoué. Une
  sauvegarde ultérieure avec la même configuration doit réessayer au lieu d'être
  classée comme `unchanged`.
- Si le démarrage échoue après qu'une connexion ou un processus a été créé,
  libérer cette connexion/ce processus avant de retourner. Une initialisation
  échouée ne doit pas laisser un processus de serveur de langage ou une connexion
  socket actif derrière un handle `FAILED`.
- Si le démarrage échoue avant la création de la connexion, y compris en cas de
  rejet d'approbation, de chemin de commande non sécurisé ou de commande
  manquante, vider le hash de configuration mis en cache. Une réconciliation
  ultérieure avec la même configuration doit réessayer au lieu de traiter le
  handle échoué comme inchangé.
- Si un serveur supprimé log une erreur lors de l'arrêt, le supprimer quand même
  de la map des handles.
- L'échec de démarrage d'un serveur ne doit pas bloquer la réconciliation pour
  les autres serveurs.

Nettoyage des ressources :

- `stopServer()` doit libérer les deux côtés d'un serveur possédé : arrêter
  proprement et terminer la connexion LSP, puis tuer le processus lancé s'il est
  toujours actif. Cela est important pour les transports `tcp`/`socket` qui ont
  été lancés avec une `command` ; fermer uniquement le socket ne suffit pas.
- `process.kill()` doit être isolé avec sa propre gestion des erreurs. Un
  processus qui se termine pendant le nettoyage ne doit pas interrompre le reste
  de la réconciliation.
- L'arrêt propre doit toujours avoir une attente bornée. Si la configuration du
  serveur ne spécifie pas `shutdownTimeout`, utiliser le délai d'arrêt par défaut
  au lieu d'attendre `connection.shutdown()` indéfiniment.
- Les minuteurs de délai d'arrêt doivent être effacés lorsque l'arrêt se termine
  ou échoue, afin qu'un délai important ne retienne pas le handle plus longtemps
  que nécessaire.
- La promesse `shutdown()` sous-jacente doit être observée même lorsque le délai
  gagne la course, afin qu'un rejet tardif côté serveur ne se manifeste pas comme
  un rejet non géré.
- `stopAll()` doit participer à la même file d'attente de réconciliation que le
  rechargement à chaud. Il ne suffit pas d'attendre la file d'attente actuelle
  puis d'itérer sur les handles, car une nouvelle réconciliation pourrait sinon
  s'insérer entre l'attente et le nettoyage des handles.
- `NativeLspService.stop()` doit également annuler toute opération
  `reinitialize()` en cours ou en file d'attente avant d'arrêter les serveurs.
  L'implémentation utilise une annulation coopérative avec `AbortController` :
  stop marque le service comme en cours d'arrêt, annule le rechargement actif,
  et chaque rechargement en file d'attente vérifie le signal avant de charger la
  configuration, de réconcilier, de vider le suivi des documents, de rejouer les
  documents ou d'attendre les délais de rejeu. Cela empêche l'arrêt de se bloquer
  indéfiniment sur un rechargement lent, tout en empêchant un rechargement annulé
  de démarrer de nouveaux processus LSP après `stopAll()`.
- Les redémarrages suite à un crash doivent également être sérialisés via la file
  d'attente de réconciliation, ou vider le hash lorsqu'ils échouent de manière
  permanente. Ils ne doivent pas démarrer un processus de remplacement en
  parallèle d'une réconciliation de changement de configuration.
- La réinitialisation du redémarrage suite à un crash doit isoler les erreurs de
  `connection.end()` et `process.kill()`. La réinitialisation s'exécute lorsque
  l'ancienne connexion/le vieux processus peut déjà être cassé, et les échecs de
  nettoyage ne doivent pas empêcher le redémarrage en file d'attente de se
  poursuivre.
- `NativeLspService.stop()` doit vider `openedDocuments` et `lastConnections`
  après `serverManager.stopAll()` afin qu'un service arrêté ne conserve pas
  d'anciens ensembles de documents ou objets de connexion.

### 3. Ajouter `NativeLspService.reinitialize()`

Ajouter :

```ts
async reinitialize(): Promise<LspServiceReinitializeResult>
```

Flux :

1. Si `requireTrustedWorkspace` est vrai et `!config.isTrustedFolder()`, appeler
   `serverManager.stopAll()` et retourner. Cela empêche les anciens processus LSP
   de continuer après que l'espace de travail devient non approuvé.
2. Utiliser le `LspConfigLoader` existant pour charger le `.lsp.json` de l'espace
   de travail et les configurations des extensions.
3. Fusionner les configurations en utilisant la précédence actuelle.
4. Appliquer le filtre d'admission LSP avant la réconciliation.
5. Appeler `serverManager.reconcileServerConfigs(serverConfigs)`.
6. Vider `openedDocuments` et `lastConnections` uniquement pour les serveurs
   supprimés et redémarrés avec succès ; préserver l'état des documents pour les
   serveurs inchangés et échoués. Les serveurs échoués conservent leur suivi de
   documents afin qu'un redémarrage réussi ultérieur puisse rejouer les mêmes
   documents ouverts.
7. Pour les serveurs redémarrés avec succès, rejouer `textDocument/didOpen` pour
   les documents qui étaient ouverts avant le redémarrage. Cela donne au serveur
   de remplacement le même contexte de documents sans attendre la prochaine
   requête de survol, de complétion ou de diagnostic pour rouvrir paresseusement
   chaque fichier. Après avoir rejoué un ou plusieurs documents pour un serveur,
   attendre le même délai d'ouverture de document utilisé par le
   `ensureDocumentOpen()` paresseux avant de signaler la fin du rechargement.

Le snapshot des documents ouverts doit être pris après que
`reconcileServerConfigs()` retourne et doit être limité à `reconcile.restarted`.
Les documents ouverts pendant que la réconciliation est en attente sont alors
inclus dans le snapshot de rejeu avant que le suivi ne soit vidé pour les
serveurs redémarrés.

La découverte initiale doit utiliser le même filtre d'admission avant d'appeler
`setServerConfigs()`. Cela maintient la cohérence du statut de démarrage et de
rechargement à chaud pour le filtrage `trustRequired` par serveur dans les
espaces de travail non approuvés.

Les échecs d'analyse de `.lsp.json` nécessitent un traitement spécial : ne pas
traiter l'échec d'analyse comme une configuration vide. Le watcher doit signaler
un événement de configuration invalide afin que la CLI puisse afficher une erreur
visible par l'utilisateur, mais il ne doit pas appeler `reinitialize()` pour cet
événement. `reinitialize()` doit préserver l'ancien état du runtime, ignorer la
réconciliation et écrire l'erreur dans le statut/logs. Seule la suppression du
fichier, ou l'analyse d'une configuration JSON vide valide, signifie que la
configuration souhaitée est vide.

Le démarrage à froid et le rechargement à chaud utilisent intentionnellement des
niveaux de strictesse d'analyse de configuration utilisateur différents :

- `loadUserConfigs()` reste indulgent pour la compatibilité au démarrage. Il
  ignore les entrées de serveur invalides et retourne les entrées valides qui
  peuvent être construites.
- `loadUserConfigsStrict()` est utilisé par le rechargement à chaud. Si le
  `.lsp.json` existant est syntaxiquement valide mais contient une forme de
  niveau supérieur invalide ou une entrée de serveur qui ne peut pas être
  construite, il retourne une erreur et `reinitialize()` ne réconcilie pas. Cela
  préserve l'état LSP actuellement en cours d'exécution pour les modifications
  invalides. Le chemin strict ne doit pas introduire de validation au niveau des
  champs que le démarrage à froid n'applique pas également, car cela rendrait une
  configuration valide au démarrage mais invalide lors de la sauvegarde suivante.
  Le renforcement de la validation des champs connus doit être traité comme une
  décision de compatibilité distincte pour le démarrage et le rechargement à
  chaud. Si le fichier est manquant ou est supprimé pendant le chargement strict,
  traiter ce `ENOENT` comme une configuration utilisateur vide valide, car la
  suppression de `.lsp.json` est le moyen explicite de supprimer tous les
  serveurs LSP utilisateur de l'espace de travail.
`NativeLspService.reinitialize()` renvoie un résultat au niveau du service :

```ts
interface LspServiceReinitializeResult {
  reconcile: LspReconcileResult;
  skipped: Array<{
    name: string;
    reason: 'server_trust_required';
  }>;
}
```

Ajoute une méthode optionnelle `reinitialize()` à `NativeLspClient` et la délègue au service. Pour éviter les assertions de type opaques dans `Config.reinitializeLsp()`, étends directement l'interface `LspClient` :

```ts
reinitialize?: () => Promise<LspServiceReinitializeResult>;
```

Ajoute à `Config` :

```ts
async reinitializeLsp(): Promise<LspServiceReinitializeResult | undefined>
```

Lorsque le LSP est désactivé ou qu'aucun client n'existe, cette méthode est une no-op. Cette méthode ne doit pas remplacer le client après `Config.initialize()`.

Étant donné que `setLspInitializationError()` rejette actuellement les appels après l'initialisation, ajoute un setter d'état privé sûr au runtime :

```ts
private setRuntimeLspInitializationError(error: Error | string | undefined): void
```

`reinitializeLsp()` l'utilise pour exposer les échecs de rechargement via `getLspStatusSnapshot()` sans assouplir l'API publique de mutation du client post-initialisation. Un résultat de réconciliation renvoyé avec des serveurs `failed` est un échec partiel, et non un succès complet. `reinitializeLsp()` doit définir `initializationError` dans ce cas et ne doit effacer l'erreur que lorsque le rechargement n'a aucun serveur en échec.

### 4. Limite d'admission et de permissions

Les vérifications de sécurité actuelles du LSP incluent :

- `--experimental-lsp` est le seul interrupteur d'activation ;
- la confiance de l'espace de travail (workspace trust) est vérifiée avant la découverte/démarrage ;
- le `trustRequired` de chaque serveur est défini sur true par défaut ;
- l'existence de la commande et la sécurité du chemin de la commande sont vérifiées avant le spawn ;
- `workspaceFolder` est contraint à la racine de l'espace de travail.

Le rechargement à chaud (hot reload) doit préserver ces vérifications et les terminer avant de démarrer un nouveau serveur ou de redémarrer un serveur modifié. La règle clé est : ne pas faire le spawn d'abord pour décider ensuite si le serveur est autorisé.

Le fichier `.lsp.json` de l'espace de travail est une entrée contrôlée par l'espace de travail. Les configurations utilisateur doivent donc toujours être traitées comme `trustRequired: true`, même si le fichier déclare explicitement `"trustRequired": false`. Les configurations LSP fournies par les extensions peuvent toujours utiliser leur valeur `trustRequired` déclarée. Cela empêche un espace de travail non fiable d'abaisser sa propre limite de confiance.

Les variables d'environnement de `.lsp.json` sont également contrôlées par l'espace de travail. Le spawn au runtime peut fusionner les surcharges d'environnement autorisées, mais les variables d'injection de code telles que `NODE_OPTIONS`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES` et `DYLD_LIBRARY_PATH` ne doivent pas être écrasées par la configuration LSP. `PATH` est autorisé pour le processus serveur réel afin de préserver les configurations courantes de toolchain. Le sondage de l'existence des commandes peut conserver les valeurs d'environnement régulières fournies par la configuration dont les sondes peuvent avoir besoin, mais il ne doit pas utiliser le `PATH` fourni par la configuration lors de la résolution des noms de commandes bruts. Cela empêche un `PATH` d'espace de travail malveillant de rediriger une sonde telle que `clangd --version` vers un exécutable non désiré avant le chemin de démarrage réel. Le filtrage des clés d'environnement sensibles, y compris le filtre `PATH` réservé aux sondes, doit être insensible à la casse afin que les noms d'environnement insensibles à la casse de style Windows tels que `Path`, `node_options` ou `Ld_PreLoad` ne puissent pas contourner la liste de refus (denylist).

Limite de la liste d'autorisation (allow-list) :

- Le dépôt actuel ne prend pas en charge de liste d'autorisation CLI pour les noms de serveurs LSP. J'ai confirmé que le LSP n'a que `--experimental-lsp` ; les paramètres de liste d'autorisation sont exclusifs au MCP.
- Si cette fonctionnalité ajoute `--allowed-lsp-server-names`, elle doit se comporter comme la liste d'autorisation de démarrage du MCP et agir comme une limite supérieure pour toute la durée de vie de la session. La configuration au runtime peut restreindre cet ensemble, mais elle ne doit pas l'étendre au-delà de la limite supérieure de démarrage CLI.
- Stocke la limite supérieure de démarrage dans `ConfigParameters.lsp` :

```ts
cliAllowedLspServerNames?: string[];
```

Expose un getter pour cela. Ne lis pas la limite supérieure à partir de paramètres mutables.

L'admission doit être extraite dans une fonction pure :

```ts
filterLspServerConfigs(configs, {
  workspaceTrusted,
  requireTrustedWorkspace,
  cliAllowedServerNames,
}): {
  admitted: LspServerConfig[];
  skipped: Array<{
    name: string;
    reason: 'server_trust_required';
  }>;
}
```

Même s'il n'y a pas aujourd'hui de magasin d'approbation LSP ou de liste d'autorisation CLI, cet assistant rend la limite de sécurité explicite et laisse la place à de futures portes d'approbation basées sur le hachage. Si un futur flag `--allowed-lsp-server-names` est ajouté, il devra ajouter une raison `not_allowed` à ce moment-là au lieu de transporter un chemin de liste d'autorisation non connecté dans la v1.

La sémantique de confiance doit correspondre au chemin de démarrage actuel :

- Si `requireTrustedWorkspace` est true et que l'espace de travail n'est pas fiable, `NativeLspService.reinitialize()` arrête tous les serveurs au niveau du service et retourne. Il n'entre pas dans le filtre d'admission et ne préserve pas les anciens serveurs.
- Si `requireTrustedWorkspace` est false, le service ne court-circuite pas globalement, mais le filtre d'admission ignore toujours les serveurs individuels avec `trustRequired: true`.
- Si l'espace de travail est fiable, `trustRequired` ne bloque pas le serveur.

### 5. Déclenchement

Deux chemins de déclenchement sont nécessaires.

#### Déclenchement automatique par l'espace de travail `.lsp.json`

Ajoute un `LspConfigWatcher` restreint dans le CLI, modélisé d'après `SettingsWatcher` mais avec une responsabilité plus réduite :

- surveille uniquement la racine de l'espace de travail et correspond strictement au nom de base `.lsp.json` ;
- ne crée aucun répertoire ni fichier ;
- applique un debounce de 300 ms ;
- compare le `.lsp.json` avant/après en utilisant parse + canonicalize afin que les changements de formatage uniquement ne déclenchent pas de rechargement ;
- traite `ENOENT` comme une suppression ;
- distingue les échecs d'analyse JSON des autres échecs de lecture. Les deux doivent notifier l'écouteur avec un événement de configuration invalide visible par l'utilisateur et préserver l'ancien état du runtime, mais le message d'erreur doit indiquer si le fichier était un JSON invalide ou illisible ;
- la suppression du fichier est un événement distinct et doit notifier l'écouteur de rechargement, produisant une configuration d'espace de travail vide ;
- exécute les callbacks en série ;
- utilise le timeout de l'écouteur et l'isolation des défaillances correspondant à `SettingsWatcher` ;
- avance le snapshot sémantique stocké uniquement après que la notification de l'écouteur a réussi. Si l'écouteur lève une exception ou dépasse le timeout, conserve le snapshot précédent afin que l'enregistrement du même contenu relance le rechargement.

Enregistre le watcher uniquement lorsque `config.isLspEnabled()` et que le client prend en charge `reinitialize()`. Lors d'un changement, appelle :

```ts
await config.reinitializeLsp();
```

Émets ensuite un événement de runtime explicite tel que `AppEvent.LspStatusChanged`. Les surfaces d'UI telles que `/lsp`, `/about` ou `/status` peuvent s'abonner à cet événement pour se rafraîchir. Si la réconciliation renvoie des échecs partiels, émets l'événement de changement de statut avant de relancer l'exception au watcher ; cela permet à l'UI d'observer les serveurs redémarrés avec succès tandis que le watcher conserve l'ancien snapshot sémantique pour une nouvelle tentative. En cas d'échec, affiche également une erreur visible par l'utilisateur via `AppEvent.LogError` ; inclus le message d'erreur sous-jacent du parseur/démarrage lorsqu'il est disponible, et ne te contente pas d'écrire un log de debug.

#### Déclenchement manuel par `/reload`

Lorsque la future commande `/reload` sera disponible, elle devra appeler les deux :

```ts
await config.reinitializeMcpServers(...);
await config.reinitializeLsp();
```

Le rechargement manuel fournit également le chemin de repli pour les modifications des `lspServers` des extensions, car ces modifications peuvent ne pas correspondre à un événement de fichier `.lsp.json` de l'espace de travail.

## Session unique et pool partagé

État actuel : seul le mode session unique existe. Le dépôt n'a pas d'équivalent LSP au pool de transport MCP.

v1 : implémente la réconciliation incrémentale à l'intérieur de `LspServerManager`. Chaque session possède son propre processus et socket.

Futur pool partagé : conserve `NativeLspService` comme consommateur et remplace les internes de `LspServerManager` par l'acquisition/libération de :

```text
lsp:<workspaceRoot>:<name>:<hash>
```

entrées du pool. Le filtrage d'admission doit toujours se produire avant l'acquisition, correspondant au correctif du pool partagé MCP, afin que les serveurs non autorisés ou non fiables ne puissent pas être démarrés via le chemin du pool.

## Plan de tests unitaires

Priorise les tests unitaires. Les tests d'intégration contre de vrais serveurs LSP sont lents et dépendants de l'environnement, ils ne sont donc pas requis.

### Tests du cœur (Core)

`packages/core/src/lsp/configHash.test.ts`

- le hachage ignore l'ordre des clés de l'objet ;
- les modifications de la commande, de l'ordre des args, de l'env, des paramètres, du dossier de l'espace de travail, du socket et de l'exigence de confiance modifient le hachage ;
- le hachage exclut les champs status/process/runtime.

`packages/core/src/lsp/LspServerManager.test.ts`

- l'ajout d'un serveur le démarre exactement une fois ;
- la suppression d'un serveur l'arrête et le supprime des handles ;
- les changements de hachage arrêtent l'ancien handle et en démarrent un nouveau ;
- un hachage inchangé n'arrête/démarre pas et préserve l'identité du handle ;
- un échec de démarrage après la création de la connexion libère la connexion et le processus possédé ;
- l'arrêt d'un serveur `tcp`/`socket` lancé par `command` ferme la connexion et tue le processus possédé ;
- les timers de timeout d'arrêt sont effacés lorsque l'arrêt se termine en premier ;
- l'absence de `shutdownTimeout` utilise toujours le timeout d'arrêt par défaut et ne peut pas bloquer la réconciliation indéfiniment ;
- `stopAll()` attend les démarrages en cours avant de libérer les ressources ;
- `stopAll()` est sérialisé via la file d'attente de réconciliation et ne peut pas s'exécuter simultanément avec une réconciliation ultérieure ;
- les erreurs de `process.kill()` sont loguées et n'interrompent pas le nettoyage ;
- l'échec de démarrage d'un serveur n'affecte pas la réconciliation d'un autre serveur ;
- les réconciliations simultanées s'exécutent en série ;
- `stopAll()` et `clearServerHandles()` effacent la hash map ;
- les démarrages échoués sont rapportés dans `failed`, ne sont pas rapportés comme ajoutés/redémarrés, et ne mettent pas en cache leur hachage de configuration ;
- les échecs de démarrage initiaux effacent le hachage en cache afin qu'une réconciliation ultérieure avec la même configuration réessaie ;
- les redémarrages après crash se sérialisent avec la réconciliation et effacent les hachages en cache en cas d'échec permanent ;
- la réinitialisation du redémarrage après crash ignore les erreurs de nettoyage de connexion/processus et continue le redémarrage en file d'attente ;
- le sondage de l'existence des commandes conserve les valeurs d'environnement régulières fournies par la configuration, mais n'utilise pas le `PATH` fourni par la configuration, et les surcharges d'environnement d'injection de code sont filtrées avant le spawn ;
- la valeur de retour de la réconciliation contient added/removed/restarted/unchanged/failed, et non les admissions ignorées.

Mock `createLspConnection`, l'initialisation et l'arrêt dans les tests. Ne démarre pas de vrais serveurs de langage.

`packages/core/src/lsp/NativeLspService.test.ts`

- `reinitialize()` charge la configuration de l'espace de travail et des extensions et passe la configuration fusionnée à la réconciliation du manager ;
- un échec d'analyse de `.lsp.json` préserve l'ancien état du runtime et n'appelle pas la réconciliation du manager ;
- le rechargement à chaud strict rejette les formes de niveau supérieur invalides et les entrées de serveur qui ne peuvent pas être construites sans réconciliation, tandis que le démarrage à froid continue de charger les entrées valides du même fichier ;
- la suppression de `.lsp.json` traite la configuration de l'espace de travail comme vide et déclenche la réconciliation ;
- le chargement strict traite `ENOENT` comme une configuration utilisateur vide, y compris la course à la suppression où le fichier disparaît entre la notification du watcher et le rechargement ;
- un espace de travail non fiable arrête tous les serveurs et ne réconcilie/démarre pas ;
- la découverte initiale applique le même filtre d'admission `trustRequired` par serveur que le rechargement à chaud ;
- le `.lsp.json` de l'espace de travail ne peut pas se désengager de `trustRequired` ;
- si une liste d'autorisation CLI est implémentée, la limite supérieure filtre les configurations admises ;
- la valeur de retour au niveau du service agrège les raisons d'admission ignorées ;
- les serveurs redémarrés/supprimés effacent uniquement leur propre suivi de documents.
- les serveurs en échec n'effacent pas le suivi des documents et peuvent rejouer ces documents après un redémarrage réussi ultérieur.
- les serveurs redémarrés rejouent `textDocument/didOpen` pour les documents précédemment ouverts après que le serveur de remplacement est prêt, puis attendent le délai de traitement d'ouverture de document.
- les documents ouverts pendant que la réconciliation est en attente sont inclus dans le snapshot de rejeu pour les serveurs redémarrés.
- `stop()` annule le délai de rejeu en cours et les appels `reinitialize()` en file d'attente avant qu'ils ne puissent démarrer de nouveaux serveurs.
- `stop()` efface les caches de suivi des documents après avoir arrêté tous les serveurs.

`packages/core/src/config/config.test.ts`

- `reinitializeLsp()` est une no-op lorsqu'il est désactivé ou qu'aucun client n'existe ;
- lorsqu'il est activé et que le client prend en charge `reinitialize`, il délègue l'appel ;
- lorsque reinitialize lève une exception, le snapshot de statut expose l'erreur d'initialisation/rechargement.
- lorsque reinitialize renvoie des échecs partiels, le snapshot de statut expose une erreur d'initialisation/rechargement jusqu'à ce qu'un rechargement ultérieur entièrement réussi l'efface.
### Tests CLI

`packages/cli/src/config/lspConfigWatcher.test.ts`

- ne crée pas `.lsp.json` ;
- détecte la création/modification/suppression ;
- ignore les fichiers non liés ;
- ignore les modifications de formatage uniquement après une analyse canonique ;
- un échec d'analyse émet une notification de configuration invalide pour un retour visible par l'utilisateur
  et ne déclenche pas la réinitialisation du LSP ;
- un échec de lecture autre que ENOENT émet un message d'échec de lecture visible par l'utilisateur et ne
  déclenche pas la réinitialisation du LSP ;
- la suppression de `.lsp.json` déclenche l'écouteur de rechargement ;
- les événements de fichier dupliqués sont filtrés par anti-rebond ;
- les écouteurs lents s'exécutent en série ;
- un échec d'écouteur n'avance pas le snapshot stocké et le même contenu peut
  être retenté par une notification ultérieure.

`packages/cli/src/ui/AppContainer.test.tsx` ou le test d'événement correspondant

- `AppEvent.LspStatusChanged` déclenche l'actualisation de l'UI ;
- un échec de rechargement émet une erreur visible par l'utilisateur via `AppEvent.LogError`.
- un échec partiel de réconciliation émet tout de même `AppEvent.LspStatusChanged` avant que
  l'écouteur ne rejette, afin que l'état de l'UI puisse refléter les parties réussies du rechargement.

`packages/cli/src/config/config.test.ts`

- conserver l'assertion existante selon laquelle `--experimental-lsp` construit et
  démarre le LSP natif ;
- si `--allowed-lsp-server-names` est ajouté, le parseur prend en charge les valeurs
  séparées par des virgules et les flags répétés, et les stocke comme limite supérieure au démarrage.

`packages/cli/src/ui/commands/lspCommand.test.ts`

- si `LspStatusSnapshot` expose les raisons d'ignoré, la sortie de statut peut afficher
  les serveurs ignorés/non autorisés.

Objectifs de couverture : les nouvelles fonctions pures doivent être proches de 100 % ; la couverture
des branches de l'écouteur doit être comparable à celle de `SettingsWatcher` ; la réconciliation du gestionnaire doit couvrir
ajout/suppression/modification/inchangé/échec/concurrence.

## Revue stricte

### Conclusion

1. **v1 ne doit pas utiliser stop-all/start-all.**
   Cette implémentation est la plus simple, mais chaque sauvegarde redémarrerait les
   serveurs de langage inchangés et perdrait l'état préchargé. Le gestionnaire actuel dispose déjà
   de méthodes de cycle de vie par serveur, et la réconciliation incrémentale représente une quantité
   de code supplémentaire gérable.

2. **Ne pas intégrer les modifications de `.lsp.json` dans `SettingsWatcher`.**
   `SettingsWatcher` est responsable des rechargements dans le scope des paramètres. Le faire surveiller
   des fichiers d'espace de travail arbitraires brouillerait le contrat et rendrait le comportement
   MCP/paramètres plus difficile à raisonner. Un écouteur `.lsp.json` séparé et restreint est
   plus clair.

3. **Ne pas remplacer `NativeLspClient` après l'initialisation.**
   `Config.setLspClient()` interdit explicitement la mutation post-init. La mise à jour du
   service derrière l'adaptateur évite d'étendre l'API du cycle de vie.

4. **L'admission doit se faire avant le spawn du processus ou l'acquisition du pool.**
   C'est le même risque que celui mentionné dans la conception du pool partagé MCP. Même si
   le LSP n'a pas de pool aujourd'hui, les résultats de rechargement au niveau du service doivent renvoyer
   les raisons d'ignoré du filtrage pré-démarrage, afin qu'un futur chemin de pool ne démarre pas
   accidentellement un serveur rejeté.

5. **Une nouvelle allow-list CLI pour le LSP est optionnelle, mais si elle est ajoutée, elle doit constituer une limite
   supérieure.**
   Le code actuel n'a pas d'allow-list pour le LSP. La conception ne doit pas permettre aux paramètres d'
   étendre les restrictions de la ligne de commande au runtime, sinon elle serait plus faible que la sémantique
   de sécurité du hot-reload MCP.

### Risques restants

- Les `lspServers` de l'extension peuvent changer sans que `.lsp.json` ne change. L'écouteur
  automatique ne couvre pas toutes les modifications du système de fichiers de l'extension ; le `/reload` manuel
  couvre ce chemin.
- Certains serveurs de langage ne tolèrent pas bien les redémarrages rapides. La réconciliation
  sérialisée et l'anti-rebond réduisent le risque, mais les tests doivent couvrir les changements
  rapides et consécutifs.
- Les serveurs TCP/socket peuvent être des démons gérés en externe. La réconciliation doit fermer
  la connexion, mais elle ne doit assumer la propriété du processus que lorsque ce
  processus a spawné le serveur via `command`.