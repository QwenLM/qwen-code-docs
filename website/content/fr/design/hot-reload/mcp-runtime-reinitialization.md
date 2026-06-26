# Conception du rechargement à chaud du runtime MCP : reconnexion incrémentale pilotée par les paramètres (Sous-tâche 3 de l’issue #3696)

> [!note]
> Le périmètre initial de la sous-tâche 3 était la reconnexion runtime « MCP/LSP » ; cette MR livre **uniquement MCP**. LSP ne conserve qu’une ébauche + un TODO dans la Partie C, reporté à une MR ultérieure.

## Contexte

L’issue #3696 est l’issue de suivi globale du système de rechargement à chaud. La sous-tâche 1
(`SettingsWatcher` détection des changements de fichier) est fusionnée, mais **n’a encore aucun abonné** –
`gemini.tsx:784` démarre le watcher, et la [Conception de la sous-tâche 1](./settings-change-detection.md)
a explicitement laissé le branchement des écouteurs aux sous-tâches 2 à 6. Aujourd’hui, ajouter/supprimer/modifier un serveur MCP
dans `settings.json` (ou installer une extension) nécessite de redémarrer toute la session, ce qui perd
le contexte de la conversation.

Cette MR se concentre sur **MCP** et apporte deux choses : (a) un point d’entrée runtime qui pousse
les paramètres rechargés dans le `Config` actif ; (b) une reconnexion incrémentale MCP pilotée par
`SettingsWatcher`. La reconnexion runtime LSP appartient à cette sous-tâche mais n’est pas implémentée ici,
seulement un TODO Partie C.

**Observation centrale** : la réconciliation incrémentale « reconnecter par diff » existe déjà dans le code
(`discoverAllMcpToolsIncremental` pour session unique, `runDiscoverAllMcpToolsViaPool` pour pool partagé,
ne touchant que les serveurs modifiés via leur empreinte `connectionIdOf`). La seule lacune est que
`Config` ne peut pas mettre à jour son instantané des paramètres après le démarrage (`addMcpServers()` lance une exception,
`config.ts:3200`). Ajouter ce point d’entrée runtime constitue la **Partie A** ; le déclencher depuis le watcher
est la **Partie B** — c’est l’intégralité de cette MR. Deux compromis fermes : réutiliser la
réconciliation incrémentale existante plutôt que le `restartMcpServers()` qui efface tout (provoquant un trou « 0 outils ») ;
et le chemin du pool partagé doit ajouter la porte d’approbation `isMcpServerPendingApproval` pour correspondre
au chemin session unique (élément 4 de la Partie A). Voir « Architecture » ci-dessous pour la vue d’ensemble des composants et
« Conception » pour le flux pas à pas et les détails.

---

## Architecture

En une ligne : **brancher la réconciliation incrémentale déjà existante sur les modifications du fichier de paramètres**,
et combler la frontière de confiance ainsi que le retour d’interface utilisateur en cours de route. La modification se répartit par responsabilité
entre les packages CLI / Core, découplés via les méthodes de `Config` et un événement d’interface utilisateur :

```text
                    Package CLI                                   Package Core
 ┌──────────────────────────────────────────┐       ┌────────────────────────────────────┐
 │ SettingsWatcher  (sous-tâche 1, fusionné)   │       │ Config                              │
 │   └─[Partie B] hot-reload.ts                │ appelle│   └─[Partie A] reinitializeMcpServers │
 │       quand déclencher · recalcul du filtrage· porte│ ────▶ │       setMcpServers + réconciliation incr.│
 │                                             │       │         (McpClientManager pool/session unique)│
 │   └─[Partie D] useMcpApproval · modale d’approbation│ ◀──── │   └─[Partie A④] porte d’approbation chemin pool │
 │       en attente en milieu de session → nouvelle invite│ événement│                                     │
 │   └─[Partie E] vue /mcp status                │       └────────────────────────────────────┘
 │       afficher la raison « ignoré en raison de l’approbation » │
 └──────────────────────────────────────────┘
```

- **Principe de couche** : le core ne doit pas comprendre `settings.json` / la sémantique du watcher.
  « Quand déclencher » appartient au CLI (Partie B), « comment mettre à jour + réconcilier » appartient au Core
  (Partie A), cohérent avec la sous-tâche 1 ; la Partie B est l’unique consommateur de la Partie A, interagissant uniquement
  via les méthodes de `Config`.
- **Chemin principal** : modification des paramètres → Partie B reconstruit la liste souhaitée + listes de filtrage,
  porte temporisée → appelle Partie A → réconciliation incrémentale du Core (y compris la porte d’approbation du chemin pool) →
  émet `mcp-client-update` pour rafraîchir les indicateurs de statut.
- **Branche d’approbation** : si la réconciliation laisse un serveur filtré `pending`, la Partie D déclenche la
  modale d’approbation via l’événement `McpPendingApprovalChanged` ; la raison de l’ignorance est affichée par la Partie E dans la
  vue `/mcp`.
- **Prérequis strict** : les trois clés du schéma `mcpServers` / `mcp.allowed` / `mcp.excluded` doivent
  être basculées en rechargeable à chaud, sinon la porte de suppression de redémarrage nécessaire du watcher engloutit
  les modifications uniquement MCP et toute la chaîne est inerte (voir la note ⚠️ au début de « Conception »).

| Partie  | Responsabilité                                                                                                                        | Couche       | Statut          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------- |
| **A**   | Configuration MCP mise à jour en runtime par `Config` + réconciliation incrémentale + porte d’approbation chemin pool                 | Core         | cette MR        |
| **B**   | abonnement au watcher, recalcul du filtrage, porte temporisée, appel de la Partie A                                                   | CLI          | cette MR        |
| **C**   | réinitialisation LSP                                                                                                                  | Core         | TODO (MR ultérieure) |
| **D**   | en attente en milieu de session déclenche la modale d’approbation (et corrige l’invite manquée #6)                                   | CLI          | suivi           |
| **E**   | `/mcp` affiche la raison « ignoré en raison de l’approbation »                                                                       | CLI          | suivi           |
| **F**   | sémantique d’admission : la liste blanche du CLI est une borne supérieure, `mcp.allowed: []` = tout refuser, et tool-not-found explique _pourquoi_ un serveur est indisponible | CLI + Core | suivi       |

« Conception » ci-dessous donne le flux de données pas à pas du fichier disque à la connexion active, ainsi que les
détails d’implémentation de chaque partie.

---

## Conception

Le diagramme ci-dessous montre le flux de données complet d’une modification de paramètres, depuis le « fichier disque » jusqu’à
« la connexion prend effet » (`[CLI]` = Partie B, `[Core]` = Partie A, `[sous-tâche 1]` = le watcher fusionné) :

```text
① L’utilisateur modifie .qwen/settings.json (ajoute/supprime/modifie mcpServers, ou mcp.excluded / mcp.allowed)
       │
       ▼
② [sous-tâche 1] SettingsWatcher détecte la modification du fichier
       │   · temporisation 300 ms : fusionne les sauvegardes consécutives
       │   · diff sémantique en entier : notifie uniquement si le contenu a vraiment changé (auto-écriture / purement formatage → pas de notification)
       ▼
③ [CLI · Partie B] le callback enregistré par registerMcpHotReload se déclenche (toute modification des paramètres l’atteint)
       │
       ├─ a. assembleMcpServers(settings.merged.mcpServers, cwd, topTier)
       │        → fusion par priorité dans la liste complète des serveurs `next` (incl. .mcp.json / --mcp-config / session)
       ├─ b. recalcule les listes de filtrage de connexion nextGating = { excluded, allowed, pending }
       └─ c. porte : mcpServersEqual(old, next) ET mcpGatingEqual(old, nextGating) sont tous deux « inchangés »
                → retour anticipé (ignore les modifications de thème/compétences et autres modifications non liées à MCP)
       │ (continuer seulement si mcpServers OU les listes de filtrage mcp ont changé ↓)
       ▼
④ [CLI→Core] pousse d’abord les listes de filtrage dans config (la découverte les lit pendant la réconciliation) :
       config.setExcludedMcpServers / setAllowedMcpServers / setPendingMcpServers
       │
       ▼
⑤ [Core · Partie A] config.reinitializeMcpServers(next)
       │   (protégé par un verrou « réconciliation en cours » pour éviter les conflits avec /reload)
       ├─ a. setMcpServers(next) : remplace l’instantané de la couche des paramètres (couches extension / runtime inchangées)
       └─ b. discoverAllMcpToolsIncremental : réconciliation incrémentale de type « reconcilier »
                · calcule l’empreinte connectionIdOf de chaque serveur, compare « souhaité » vs « en ligne »
                · ajouté → connecter ; supprimé → déconnecter + supprimer outils/invites ;
                  empreinte changée → déconnecter + supprimer anciens outils/invites, puis reconnecter avec nouvelle configuration ; inchangé → conserver
                · ignorer les serveurs désactivés/en attente/répertoire non fiable ; émettre mcp-client-update
       │
       ▼
⑥ [CLI · Partie B] Finalisation UI : mcp-client-update rafraîchit les indicateurs de statut MCP ;
       (optionnel) invites MCP modifiées → reloadCommands() ; set needsRefresh (sous-tâche 6)
```

> **Moment du déclenchement** : `registerMcpHotReload` s’exécute une seule fois au démarrage (attache l’écouteur,
> retourne un destructeur) ; le callback qu’elle enregistre se déclenche **à chaque modification des paramètres** via
> le watcher (c’est-à-dire à partir de l’étape ③) — c’est à ce moment que la réconciliation s’exécute effectivement.

> ⚠️ **Prérequis strict : trois clés du schéma MCP doivent être basculées en rechargeable à chaud (l’interrupteur caché
> à l’étape ②).** Le watcher possède une « porte de suppression de redémarrage nécessaire » : si **toutes** les clés
> touchées par une modification sont `requiresRestart: true`, il **n’émet aucun événement**. Mais `mcpServers` /
> `mcp.allowed` / `mcp.excluded` étaient toutes `true` — donc une modification uniquement MCP ne déclenchait jamais le callback et
> la Partie B était inerte. Cette MR **doit** basculer ces **trois feuilles** à `false` ; le nœud parent `mcp`
> et `mcp.serverCommand` réservé au démarrage restent `true` (la correspondance utilise
> `isRestartRequiredKey` avec correspondance de plus long préfixe + `flattenSchema`, la feuille gagne). Les trois ont `showInDialog: false`, donc
> le basculement ne change pas l’invite de redémarrage de la boîte de dialogue des paramètres ; l’impact est limité au chemin du watcher uniquement.

Ce qui suit décrit la Partie A (capacités du Core), la Partie B (câblage CLI), la Partie C (LSP, seulement TODO dans
cette MR) tour à tour.

### Partie A — Core : rendre Config modifiable en runtime pour la configuration MCP et déclencher la réconciliation incrémentale

**Fichier : `packages/core/src/config/config.ts`**

1. Ajouter un setter post-initialisation qui met à jour l’instantané des paramètres que la réconciliation lit :

   ```ts
   /**
    * Remplacement runtime (rechargement à chaud) de la map des serveurs MCP de la couche des paramètres.
    * Contrairement à addMcpServers(), il contourne la garde `initialized` et est un REMPLACEMENT
    * (pas une fusion), donc les suppressions prennent effet. La superposition runtime
    * (addRuntimeMcpServer) et les contributions d’extensions ne sont pas affectées – getMcpServers()
    * s’applique toujours par-dessus.
    */
   setMcpServers(servers: Record<string, MCPServerConfig> | undefined): void {
     this.mcpServers = servers;
   }
   ```

   `getMcpServers()` (`:3128`) superpose déjà les extensions + `runtimeMcpServers` par-dessus
   `this.mcpServers`, donc remplacer uniquement la couche des paramètres est sûr pour les entrées runtime/extension.

2. **Listes de filtrage de connexion** : les trois listes de noms qui décident si chaque serveur MCP peut
   se connecter — `excluded` (bloqué), `allowed` (si défini, seuls ceux-ci se connectent), `pending` (source filtrée,
   nécessite une approbation utilisateur avant connexion). Celles-ci sont distinctes de `mcpServers` (configuration serveur) :
   la première régit « **si** se connecter », la seconde « **quels serveurs et comment** ». Ajouter des setters
   pour ces trois listes que `getMcpServers()` / la découverte consultent : `setExcludedMcpServers()`
   existe (`:3167`) ; ajouter `setAllowedMcpServers()` (le champ est actuellement `readonly` et utilisé comme filtre
   à l’intérieur de `getMcpServers()`) plus un setter pour l’ensemble des approbations en attente.

3. Ajouter une méthode d’orchestration légère : d’abord mettre à jour la configuration, puis piloter la
   réconciliation incrémentale existante, protégée par un verrou partagé « réconciliation en cours » pour que `/reload`
   (sous-tâche 5) et le watcher n’entrent pas en conflit :

   ```ts
   /**
    * Applique une nouvelle map des serveurs MCP de la couche des paramètres et réconcilie de manière incrémentale
    * les connexions actives (connecter ce qui est ajouté, déconnecter ce qui est supprimé, redémarrer ce qui a changé ;
    * conserver inchangé ce qui ne change pas). Appeler avant initialize() est un no-op sûr.
    */
   async reinitializeMcpServers(servers: Record<string, MCPServerConfig> | undefined): Promise<void> {
     this.setMcpServers(servers);
     const registry = this.getToolRegistry();
     await registry.getMcpClientManager().discoverAllMcpToolsIncremental(this);
   }
   ```

   `discoverAllMcpToolsIncremental` vérifie déjà `isTrustedFolder()`, gère les serveurs désactivés/SDK,
   et émet `mcp-client-update` pour rafraîchir les indicateurs de statut de l’interface utilisateur. Serveur supprimé →
   libérer + supprimer outils/invites ; empreinte changée → libérer + acquérir à nouveau ; inchangé → conserver.

4. **Ajouter la vérification d’approbation en attente au chemin du pool partagé** (frontière de confiance, obligatoire dans cette
   MR) : le chemin session unique ignore les serveurs en attente d’approbation, mais quand un pool partagé existe
   `discoverAllMcpToolsIncremental` délègue à `runDiscoverAllMcpToolsViaPool`, et **le chemin pool
   ignore uniquement les désactivés/SDK, pas `isMcpServerPendingApproval`** (autour de
   `mcp-client-manager.ts:1461`). Sans ce correctif, en mode démon/pool partagé, un rechargement à chaud qui
   ajoute/modifie un serveur filtré `.mcp.json` / serveur d’espace de travail acquerrait une connexion pool et lancerait le
   processus **avant** l’approbation de l’utilisateur, contournant la porte d’approbation #4615. Correctif : ajouter
   la vérification `isMcpServerPendingApproval` dans le chemin pool **avant de construire `desiredIds` et avant
   l’acquisition**, rendant sa sémantique d’admission identique à celle du chemin session unique.

### Partie B — CLI : abonner SettingsWatcher → réconciliation MCP

**Nouveau fichier : `packages/cli/src/config/hot-reload.ts`**, câblé après
`settingsWatcher.startWatching()` (`:785`) dans `gemini.tsx`.

```ts
export function registerMcpHotReload(
  watcher: SettingsWatcher,
  settings: LoadedSettings,
  config: Config,
  topTierMcpServers: Record<string, MCPServerConfig> | undefined,
): () => void {
  return watcher.addChangeListener(async (events) => {
    // Reconstruire exactement comme Config boot l'a fait – y compris les sources du niveau supérieur (CLI/session).
    const next = assembleMcpServers(
      settings.merged.mcpServers,
      config.getTargetDir(),
      topTierMcpServers,
    );
    // Recalculer les listes de filtrage (excluded/allowed/pending) — [les paramètres au moment du rechargement à chaud prévalent],
    // voir la décision « position d’admission » ci-dessous ; pending est toujours recalculé selon la porte #4615.
    const nextGating = {
      excluded: recomputeExcluded(settings, next),
      allowed: recomputeAllowed(settings, next),
      pending: recomputePending(settings, next),
    };
    // Porte : ne réconcilier que si mcpServers OU les listes de filtrage mcp ont changé ;
    // si les deux sont inchangés, retour anticipé (ignorer les modifications de thème/compétences et autres modifications non liées à MCP).
    const serversChanged = !mcpServersEqual(
      config.getSettingsMcpServers(),
      next,
    );
    const gatingChanged = !mcpGatingEqual(config.getMcpGating(), nextGating);
    if (!serversChanged && !gatingChanged) return;
    // Pousser les listes de filtrage dans config avant la réconciliation (la découverte à l’intérieur de reinitializeMcpServers les lit).
    config.setExcludedMcpServers(nextGating.excluded);
    config.setAllowedMcpServers(nextGating.allowed);
    config.setPendingMcpServers(nextGating.pending);
    await config.reinitializeMcpServers(next);
    // Notifier l’UI : invites MCP modifiées → reloadCommands() ; set needsRefresh (sous-tâche 6).
  });
}
```

> **Décision sur la position d’admission (délibérée)** : le rechargement à chaud fait **prévaloir les paramètres actuels _dans_ la limite
> de `--allowed-mcp-server-names` du démarrage** — une modification runtime de `mcp.allowed` / `mcp.excluded` dans
> `settings.json` prend effet immédiatement, mais **ne fait que rétrécir l’admission, jamais l’élargir au-delà du
> drapeau de lancement** (voir Partie F pour la règle de borne supérieure et la sémantique `mcp.allowed: []`). Si aucun
> drapeau `--allowed-mcp-server-names` n’a été passé, les paramètres pilotent entièrement l’admission. **La porte d’approbation
> en attente (#4615) ne cède jamais** : un serveur filtré doit toujours être approuvé en premier (élément 4 de la Partie A).
>
> > _Historique_ : une révision antérieure permettait à une modification runtime des paramètres d’élargir l’admission au-delà du
> > drapeau de démarrage (traitant le drapeau comme une simple commodité de filtrage par nom). Une revue adverse a signalé cela comme un
> > assouplissement silencieux d’une limite de lancement ; la Partie F (élément K) inverse cela — le drapeau est désormais une
> > borne supérieure immuable.

Réutiliser les helpers existants — **ne pas** réimplémenter la logique de fusion :

- `assembleMcpServers(settings.mcpServers, cwd, topTierMcpServers)` —
  `packages/cli/src/config/mcpServers.ts:27` (correspond à l’appel de démarrage de Config à
  `packages/cli/src/config/config.ts:1812`).
- `SettingsWatcher.addChangeListener` renvoie une fonction de désabonnement (`settingsWatcher.ts:253`).
- `config.getSettingsMcpServers()` (`:3124`) comme pré-image pour le diff `mcpServers` ;
  `config.getMcpGating()` comme pré-image pour le diff des listes de filtrage (un petit nouveau getter renvoyant
  `{ excluded, allowed, pending }`, associé aux setters de la Partie A).

La porte utilise deux petites fonctions pures pour réduire la surface de déclenchement (éviter que les modifications de thème/compétences et
autres modifications non pertinentes ne déclenchent une réconciliation redondante, cohérent avec le diff sémantique propre du watcher),
utilisant toutes deux **`fast-deep-equal`** (le package cli doit le promouvoir d’une dépendance transitive à une dépendance directe) :

- `mcpServersEqual(a, b)` : l’ordre des clés d’objet n’a pas d’importance (élimine les faux positifs dus à l’ordre des serveurs /
  des champs), l’ordre des tableaux est sensible (`args` et autre ordre des arguments de commande a du sens) ;
  `undefined` ≡ `{}`.
- `mcpGatingEqual(a, b)` : `excluded` / `allowed` / `pending` comparés comme des **ensembles** (trier des copies d’abord) ;
  `undefined` ≡ `[]`. C’est précisément ce qui permet qu’« éditer seulement `mcp.excluded` / `mcp.allowed`,
  laisser `mcpServers` inchangé » déclenche quand même la réconciliation — comblant le fossé où diff uniquement
  `mcpServers` manquerait les modifications de filtrage.

La finalisation de l’UI rafraîchit les indicateurs de statut via l’événement existant `mcp-client-update`, en fixant
`needsRefresh` quand nécessaire (sous-tâche 6). Le socle de cette sous-tâche : la réconciliation au niveau config
se termine + l’émission existante rafraîchit le statut.

### Partie C — Réinitialisation LSP (non implémentée dans cette MR, TODO)

La configuration LSP provient de `.lsp.json` + configuration d’extension (**pas** `settings.json`), donc elle n’est **pas
déclenchée automatiquement par SettingsWatcher** ; sa reconnexion runtime doit être pilotée manuellement par la future
commande `/reload` (sous-tâche 5). `NativeLspService` (protégé par `--experimental-lsp`) a déjà
des méthodes de cycle de vie `discoverAndPrepare` / `start` / `stop`, suffisantes pour implémenter une primitive `reinitialize()`
exposée à `/reload` via `LspClient.reinitialize?()` + `Config.reinitializeLsp()`,
sans changements majeurs.

> **TODO (prochaine MR)** : implémenter `NativeLspService.reinitialize()` et son exposition via
> `Config.reinitializeLsp()`, avec une conception détaillée dans le document de cette MR (incluant le fait que
> `discoverAndPrepare()` appelle d’abord `clearServerHandles()`, empêchant un diff incrémental, donc la v1
> utilise stop-all → start-all, etc.). **Cette MR ne contient aucune modification de code LSP.**

### Partie D — Suivi : le rechargement à chaud déclenche la modale d’approbation runtime pour les serveurs filtrés (lié à #4615)

> Cette section a été ajoutée après le déploiement des Parties A/B, lors du débogage du constat « l’URL d’un serveur filtré a changé mais il
> ne se reconnecte pas ». Elle corrige la rupture où « le rechargement à chaud marque un serveur filtré comme en attente mais
> l’interface utilisateur n’affiche aucune modale d’approbation », et corrige incidemment une invite manquée causée par la logique de décision
> (problème #6 ci-dessous).

#### Contexte : la modale d’approbation n’était calculée qu’une seule fois au démarrage

Un serveur de source filtrée (`.mcp.json` du `project` et `.qwen/settings.json` du `workspace`, voir
`isGatedMcpScope`) voit son approbation utilisateur **liée au hachage de la configuration** (`mcpApprovals.ts`'s
`getState` : pas d’enregistrement, ou un enregistrement dont le hachage diffère de la configuration actuelle → `pending`). Donc si un
rechargement à chaud modifie la configuration d’un serveur filtré (même `httpUrl`), son changement de hachage invalide
l’ancienne approbation et il redevient `pending`.

La chaîne Partie A/B gère cela **correctement** : `recomputeMcpGating` le place dans `pending`,
`setPendingMcpServers` le pousse dans la découverte, et la réconciliation l’ignore (pas de connexion, état
`disconnected`). Mais **l’interface utilisateur n’affiche aucune modale d’approbation** — la cause racine est que `useMcpApproval`
(le hook qui pilote la modale d’approbation) calcule sa file d’attente **uniquement au montage**
via `useEffect(…, [config])`, et la référence `config` est stable pendant la session → l’effet ne se
relance jamais. Donc :

- le core marque le serveur en attente (la découverte l’ignore) ✓
- la file d’attente d’approbation de l’interface utilisateur ne se recalcule jamais → **pas de modale** ✗ (l’utilisateur voit seulement `disconnected`, sans moyen d’approuver)
Les deux chemins sont **déconnectés** à l'exécution.

#### Correction : connecter le cœur→UI via un événement, confier la décision à l'UI

1. **Ajouter l'événement** `AppEvent.McpPendingApprovalChanged` (`packages/cli/src/utils/events.ts`). Comme
   `appEvents` est dans la couche CLI et `hot-reload.ts` aussi, le listener peut émettre directement, sans
   **aucune modification du cœur**.

2. **`hot-reload.ts` émet après le reconcile** (placé après `await reinitializeMcpServers`, afin que
   `config.getMcpServers()` reflète déjà la nouvelle map ; émettre que le reconcile réussisse ou échoue—
   un serveur laissé en attente nécessite toujours une décision utilisateur).

3. **`useMcpApproval` extrait `computePending()`** : calculer une fois au montage (comportement existant)
   **plus** recalculer la file après abonnement à `McpPendingApprovalChanged` → une file non vide
   affiche la modale. `computePending` recalcule à partir des sources faisant autorité (la carte des serveurs
   actifs + le fichier d'approbation persistant), donc les serveurs déjà approuvés / déjà rejetés ne sont
   pas re-soumis.

#### Conception clé : déclencher l'émission sur "strictement en attente", pas sur une différence d'ensemble de noms (problème #6 / décision A1)

Notez que les deux prédicats sont **délibérément différents**, ce qui est le cœur de cette section :

| Fonction                        | Prédicat                                           | Utilisation                                                    |
| ------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `getPendingGatedMcpServers`     | `state !== 'approved'` (**inclut rejeté**)         | alimente la découverte : rejeté doit continuer à être **ignoré** |
| `getPromptableMcpServers` (nouveau) | `state === 'pending'` (**exclut rejeté**)          | alimente la modale : rejeté n'est **plus relancé**             |

La décision d'émission initiale utilisait "la différence d'ensemble de noms de `nextGating.pending` par rapport à la dernière fois" pour décider s'il fallait afficher la modale, ce qui avait une invite manquée (examiner le problème #6) :

- un serveur **rejeté** reste dans la liste `pending` à cause de `!== 'approved'` ;
- l'utilisateur **modifie ensuite la configuration de ce même serveur** (le hash change → il devient vraiment
  `pending` et devrait être redemandé), mais son nom était "déjà" dans la liste → la différence d'ensemble
  est vide → **aucun événement → invite manquée**.

Correction A1 : utiliser `getPromptableMcpServers(next, cwd)` (strictement `=== 'pending'`) pour décider de l'émission, confiant la vérité de la décision à `computePending`. Effet :

- après rejet, **modifier la configuration du même serveur** (le hash change) → `pending` à nouveau → **ré-invitation** ✓ (corrige #6)
- après rejet, une modification **non liée** (hash inchangé) → toujours `rejected` → non invitable → **aucune invitation** ✓
- déjà `approved` → pas d'invite ; un nouveau serveur soumis à approbation non décidé → invite ✓

#### Sémantique de rejet (confirmée après relecture)

`handleMcpApprovalSelect(REJECT)` : persiste `rejected` (lié au hash actuel), n'appelle **pas** `reconnect`, ne touche **pas** `config.pendingMcpServers` → la découverte continue d'ignorer → le serveur reste `disconnected`. Pas besoin de démonter activement l'ancienne connexion : l'émission a lieu après l'attente de `reinitializeMcpServers`, donc au moment où la modale apparaît, le reconcile a déjà démonté. Après un redémarrage de session, `computePending` lit `rejected` → non mis en file, reste déconnecté, comportement cohérent.

#### Ajout au flux de données (suite du ⑥ dans le diagramme d'aperçu du chapitre)

```text
⑥' [CLI · Partie D] après le reconcile, si un serveur soumis à approbation strictement en attente existe :
        hot-reload → appEvents.emit(McpPendingApprovalChanged)
        → useMcpApproval.computePending() recalcule la file → affiche la modale d'approbation
        → l'utilisateur approuve : approveMcpServerForSession + discoverToolsForServer (connexion avec nouvelle config)
          l'utilisateur rejette : persiste rejeté, reste déconnecté
```

#### Fichiers clés (Partie D)

| Fichier                                          | Modification                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/utils/events.ts`               | ajouter `AppEvent.McpPendingApprovalChanged`                                                                                     |
| `packages/cli/src/config/mcpApprovals.ts`        | ajouter `getPromptableMcpServers()` (strict `=== 'pending'`, distinct de `getPendingGatedMcpServers` qui inclut les rejetés)       |
| `packages/cli/src/config/hot-reload.ts`          | après reconcile, décider via `getPromptableMcpServers` ; si non vide, `appEvents.emit(McpPendingApprovalChanged)`                 |
| `packages/cli/src/ui/hooks/useMcpApproval.ts`    | extraire `computePending()` ; calculer une fois au montage + recalculer sur l'événement                                          |

#### Vérification (Partie D)

- `hot-reload.test.ts` : un serveur soumis à approbation nouvellement en attente → émission ; changement non soumis → pas d'émission ;
  **rejeter→modifier la config → émettre à nouveau** (l'ancienne différence d'ensemble de noms aurait donné 0 fois, verrouillant la régression #6) ; rejeter→modification non liée → pas d'émission.
- `mcpApprovals.test.ts` : la suite `getPromptableMcpServers` — aucune décision n'invite, rejeté n'invite pas (contrairement à `getPendingGatedMcpServers` qui continue d'ignorer), ré-invitation après changement de hash, approuvé n'invite pas.
- `useMcpApproval.test.ts` : un événement en cours de session fait apparaître la modale pour un nouveau serveur soumis ; un serveur déjà approuvé n'est pas ré-invité.

#### Problème connu / TODO rétrospectif (NON traité ici)

1. **Désaccord de clé `getTargetDir()` vs `getWorkingDir()` (risque B)** : le recalcul du filtrage
   (`recomputeMcpGating` → `getPendingGatedMcpServers`) utilise `config.getTargetDir()` comme
   racine du projet, tandis que `useMcpApproval` lit/écrit l'approbation en utilisant `config.getWorkingDir()`.
   Ils sont généralement égaux ; dès qu'ils divergent (cwd personnalisé ou différences de chemin réel de lien symbolique), l'approbation est écrite sous la clé cwd tandis que le filtrage interroge la clé targetDir → **après approbation, le filtrage ignore toujours et ne connecte jamais**. Un problème préexistant, non introduit par la Partie D. Recommandation : unifier sur une seule racine (penchant pour `getWorkingDir()`, c'est-à-dire le côté écriture de l'approbation), ou d'abord ajouter une assertion qu'elles sont égales à l'exécution.

### Partie E — Suivi : afficher dans `/mcp` pourquoi un serveur soumis à approbation a été ignoré pour approbation

> Cette section a été ajoutée après le déploiement de la Partie D, lors du débogage de « après avoir rejeté un serveur soumis à approbation puis l'avoir supprimé et ré-ajouté à l'identique, `/mcp` affiche Déconnecté sans aucune indication ». Conclusion d'abord : **ce n'est pas un bogue du cycle de vie des enregistrements ; le seul défaut est que la raison de l'ignorance est invisible**, donc nous n'ajoutons que de la visibilité et ne touchons ni au stockage d'approbation ni à la logique de reconcile.

#### Pourquoi « ne plus inviter » est conforme à la conception

Un enregistrement d'approbation est lié à **(projectRoot, serverName, hash)** et est **indépendant de la présence actuelle du serveur dans la configuration** — rien ne supprime un enregistrement lorsqu'un serveur disparaît de la config. Ainsi :

- **approuvé persiste déjà à travers une suppression/ré-ajout** : approuver (hash H) → supprimer → ré-ajouter à l'identique (toujours hash H) → `getState` retourne `approved` → reconnexion silencieuse. Une commodité intentionnelle.
- **rejeté correspondant à ce rejet validé sur le même « ré-ajout identique » est symétrique et cohérent** : un rejet validé reste en vigueur tant que le hash de config est inchangé ; la seule façon de le faire réapparaître est de **modifier la configuration (changer le hash)** (c'est-à-dire le chemin de ré-invitation strict-en-attente de `getPromptableMcpServers` de la Partie D).

> Par conséquent, nous **ne introduisons délibérément pas d'« oublier l'enregistrement lors de la suppression »** : cela laisserait les transitions de présence modifier des décisions persistantes, violant le principe que les décisions ne changent que via le hash ou une action explicite, et créant une asymétrie approuvé / rejeté.

#### Le véritable défaut et sa correction (visibilité uniquement)

`/mcp` (`ServerListStep` / `ServerDetailStep`) affichait un simple `Disconnected`, ce qui rendait « Je l'ai rejeté / en attente d'approbation » impossible à distinguer d'« une véritable erreur de connexion », de sorte que l'utilisateur ne connaissait pas le chemin de récupération (modifier la config pour changer le hash → ré-invitation). Correction : ajouter `approvalState?: 'pending' | 'rejected'` à `MCPServerDisplayInfo`, calculé dans `MCPManagementDialog.fetchServerData` en utilisant `loadMcpApprovals` + `isGatedMcpScope`, indexé par **`config.getWorkingDir()`** (laissé vide pour les serveurs non soumis / approuvés) ; les vues liste / détail, utilisant le modèle existant de surcharge `needsAuth`, affichent d'abord la raison (`rejected → « rejeté — modifiez la config pour ré-approuver »`, `pending → « nécessite une approbation »`, jaune d'avertissement), et excluent ces ignorances d'approbation non-erreur de l'indice de pied de page « voir les logs d'erreur ».

> Le fait d'indexer ici sur le côté écriture `getWorkingDir()` est exactement la direction recommandée par le « Problème connu 1 (risque B) » de la Partie D — lire et écrire l'approbation avec la même racine. La requête de filtrage existante de `hot-reload.ts` utilise toujours `getTargetDir()` (ils sont égaux aujourd'hui) ; cette section ne modifie pas son comportement. Elle **ne touche pas** au stockage `mcpApprovals.ts`, au chemin de suppression/reconnexion de `hot-reload.ts`, et n'ajoute aucune action d'approbation.

#### Fichiers clés (Partie E)

| Fichier                                                            | Modification                                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/mcp/types.ts`                      | `MCPServerDisplayInfo` ajoute `approvalState?: 'pending' \| 'rejected'`                         |
| `packages/cli/src/ui/components/mcp/MCPManagementDialog.tsx`       | `fetchServerData` calcule `approvalState`, indexé par `getWorkingDir()`                         |
| `packages/cli/src/ui/components/mcp/steps/ServerListStep.tsx`      | afficher la raison d'approbation ; exclure les ignorances d'approbation de l'indice « voir les logs d'erreur » |
| `packages/cli/src/ui/components/mcp/steps/ServerDetailStep.tsx`    | afficher la raison d'approbation (cohérente avec la liste)                                     |

#### Vérification (Partie E)

- `ServerListStep.test.tsx` : gated `rejected` → affiche le texte d'indice de ré-approbation ; `pending` → « nécessite une approbation » ; une ignorance d'approbation **n'affiche pas** l'indice « voir les logs d'erreur », tandis qu'une véritable erreur de connexion **l'affiche toujours**.
- Manuel : rejeter un serveur d'espace de travail → `/mcp` affiche la raison (pas un simple Déconnecté) → modifier sa config pour changer le hash → la modale de la Partie D réapparaît (le chemin de récupération existant, inchangé ici).

### Partie F — Suivi : sémantique d'admission (borne supérieure CLI, tout refuser, raisons d'indisponibilité)

> Ajouté après une troisième relecture contradictoire sur les Parties A/B. Trois améliorations d'admission connexes, regroupées car elles partagent la surface « quels serveurs peuvent se connecter, et comment expliquons-nous quand l'un ne le peut pas ». Éléments étiquetés K / H / B d'après leurs fils de relecture.

#### K — le drapeau de démarrage `--allowed-mcp-server-names` est une borne supérieure immuable

Inverse la position antérieure « les paramètres gagnent toujours » (voir la note de la Partie B). Au démarrage, `loadCliConfig` donne la priorité au drapeau sur `settings.mcp.allowed` ; mais le recalcul du hot-reload lisait `allowed` uniquement depuis les paramètres, donc toute modification des paramètres supprimait silencieusement une restriction de nom définie au lancement — assouplissant, en session, une limite qu'un opérateur avait définie précisément pour restreindre les commandes MCP locales pouvant être exécutées.

Correction : capturer la **valeur du drapeau seule** comme borne immuable sur `Config` (paramètre `cliAllowedMcpServerNames` → `getCliAllowedMcpServerNames()` ; distinct de `allowedMcpServers` mutable que hot-reload écrase). `recomputeMcpGating` limite ensuite la liste d'autorisation dérivée des paramètres à cette borne :

- drapeau passé + paramètres ont `mcp.allowed` → **intersection** (les paramètres peuvent restreindre dans la limite) ;
- drapeau passé + pas de `mcp.allowed` dans les paramètres → le **drapeau en totalité** ;
- pas de drapeau → les paramètres pilotent entièrement l'admission (inchangé).

Ainsi, une modification à l'exécution ne peut que restreindre l'admission MCP en dessous du drapeau de lancement, jamais l'élargir au-delà. `mcp.excluded` continue de restreindre davantage au moment de la découverte, cohérent avec « seulement plus strict, jamais plus laxiste ».

#### H — `mcp.allowed: []` signifie tout refuser, de manière cohérente au démarrage et au hot-reload

Le démarrage traite une liste d'autorisation vide comme tout refuser (`getMcpServers()` filtre quand `allowedMcpServers` est truthy, et `[]` est truthy). Le recalcul du hot-reload réduisait `[]` → `undefined` (« tout autoriser ») — donc modifier `mcp.allowed` en `[]` en espérant tout refuser laissait tous les serveurs accessibles. Correction : `recomputeMcpGating` préserve `[]` (seule une **clé absente** donne `undefined`), et `mcpGatingEqual` distingue absent (tout autoriser) de `[]` (tout refuser) pour `allowed` — sinon le changement serait considéré égal et ne déclencherait jamais de reconcile. `excluded` / `pending` conservent `undefined ≡ []` (tous deux « aucune entrée »).

#### B — outil introuvable explique _pourquoi_ un serveur est indisponible

`getMcpToolUnavailableMessage` distinguait auparavant uniquement « supprimé cette session » vs « non configuré ». Avec le filtrage d'admission, il classe maintenant le serveur propriétaire via une API cœur unique, `Config.getMcpServerUnavailableReason(name)`, couvrant chaque filtre :

| raison             | signification                                    | récupération suggérée par le message                     |
| ------------------ | ------------------------------------------------ | -------------------------------------------------------- |
| `removed`          | supprimé de la config fusionnée cette session    | le ré-ajouter aux paramètres                             |
| `not_allowed`      | filtré par `mcp.allowed` / la borne CLI          | l'ajouter à `mcp.allowed`                                |
| `excluded`         | listé dans `mcp.excluded`                        | le retirer de `mcp.excluded`                             |
| `pending_approval` | serveur soumis à approbation en attente (#4615)  | l'approuver (exécuter `/mcp`)                            |
| _(aucune)_         | configuré et admis                               | véritable « outil introuvable » (déconnecté / renommé)   |

Deux modifications de support : une méthode privée `getMergedMcpServers()` (la fusion **sans** le filtre de la liste d'autorisation) afin de pouvoir distinguer « configuré » de « filtré » ; et le suivi de suppression différencie maintenant cette **carte fusionnée indépendante du filtrage**, ce qui signifie qu'un serveur filtré par une liste d'autorisation restreinte n'est plus signalé comme `removed` (c'est `not_allowed`). Cela permet également de supprimer le paramètre `prevEffectiveServerNames` ajouté pour la correction antérieure de la restriction de la liste d'autorisation — le diff de la carte fusionnée n'est pas affecté par les setters de filtrage que l'appelant applique juste avant le reconcile.

#### Fichiers clés (Partie F)

| Fichier                                                | Modification                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts` (`loadCliConfig`)  | passer la valeur du drapeau `--allowed-mcp-server-names` seule comme `cliAllowedMcpServerNames`                                                                                                                                                                                                                                  |
| `packages/core/src/config/config.ts`                   | champ `cliAllowedMcpServerNames` + `getCliAllowedMcpServerNames()` (K) ; `getMergedMcpServers()` (non filtré) + `getMcpServerNames()` ; `McpServerUnavailableReason` + `getMcpServerUnavailableReason()` (B) ; le suivi de suppression différencie la carte fusionnée et `reinitializeMcpServers` supprime le paramètre `prevEffectiveServerNames` |
| `packages/cli/src/config/hot-reload.ts`                | `recomputeMcpGating` limite `allowed` à la borne de démarrage (K) et préserve `[]` (H) ; `mcpGatingEqual` fait qu'absent ≠ `[]` pour `allowed` (H)                                                                                                                                                                              |
| `packages/core/src/core/coreToolScheduler.ts`          | `getMcpToolUnavailableMessage` route selon `getMcpServerUnavailableReason` (B)                                                                                                                                                                                                                                                 |

#### Vérification (Partie F)

- `hot-reload.test.ts` : **K** — avec un drapeau de démarrage et aucune liste d'autorisation dans les paramètres, applique le drapeau en totalité ; une liste d'autorisation des paramètres est limitée au drapeau (ne peut pas l'élargir) et peut restreindre à l'intérieur ; sans le drapeau, les paramètres gagnent sans limite. **H** — `mcp.allowed: []` est transmis comme tout refuser ; `mcpGatingEqual` traite `allowed` absent vs `[]` comme différents (mais `excluded` undefined ≡ `[]`).
- `config.test.ts` : `getMcpServerUnavailableReason` retourne `not_allowed` / `excluded` / `pending_approval` / `removed` pour chaque filtre, et `undefined` pour un serveur configuré-admis ou jamais configuré.
- `coreToolScheduler.test.ts` : le message d'outil introuvable nomme le bon serveur et l'action de récupération selon la raison.

---

## Hors périmètre (autres sous-tâches)

- **L'ensemble de la reconnexion LSP à l'exécution** (`NativeLspService.reinitialize()` +
  `Config.reinitializeLsp()` + câblage) — reporté à une future MR, voir le TODO de la Partie C.
- La commande `/reload` (#5) — appelle `config.reinitializeMcpServers(currentSettings)` (le câblage LSP
  se branche une fois sa primitive arrivée dans une MR ultérieure) + rechargement des compétences/commandes.
- `clearAllCaches()` (#4) et la notification UI `needsRefresh` (#6).

## Fichiers clés

| Fichier                                            | Modification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/config/config.ts`               | `setMcpServers()`, `setAllowedMcpServers()` + setter pending, `getMcpGating()` (retourne `{ excluded, allowed, pending }`), `reinitializeMcpServers()` (avec un garde de reconcile en cours)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `packages/core/src/tools/mcp-client-manager.ts`    | ① ajouter `removePromptsByServer()` dans `removeServer()` et `removeRuntimeMcpServer()` ; ② dans le chemin du pool partagé `runDiscoverAllMcpToolsViaPool` (`:1461`), ajouter la vérification `isMcpServerPendingApproval` avant de construire `desiredIds` / avant d'acquérir (correspondant à l'admission session unique) ; ③ **ajouter le diff d'empreinte au chemin session unique** : une nouvelle map `connectionFingerprints` ; `discoverAllMcpToolsIncremental` déclenche également déconnexion+reconnexion pour un serveur qui est « connecté mais dont l'empreinte `connectionIdOf` a changé » (aligné avec le chemin du pool `desiredIds`), en vidant la map sur chaque chemin de démontage ; ④ **effacer les anciens outils/prompts avant reconnexion** : quand `discoverMcpToolsForServerInternal` remplace un client existant, `removeMcpToolsByServer` + `removePromptsByServer` avant re-découverte — car `disconnect()` ne touche pas au registre et `discover()` seulement ajoute/remplace par nom, sinon les outils supprimés/renommés par un changement de config persisteraient liés à un client fermé (et persisteraient aussi en cas d'échec de découverte), correspondant au nettoyage existant dans `removeServer` / `addRuntimeMcpServer` |
| `packages/cli/src/config/settingsSchema.ts`        | **prérequis** : basculer les trois clés `mcpServers` (`:274`), `mcp.allowed`, `mcp.excluded` de `requiresRestart: true` à `false`, afin que le watcher ne supprime plus les modifications uniquement MCP ; le parent `mcp` et `mcp.serverCommand` restent `true` (voir la note « Prérequis difficile » ci-dessus)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/cli/src/config/hot-reload.ts` _(nouveau)_ | `registerMcpHotReload()` : reconstruire via `assembleMcpServers(..., topTierMcpServers)` ; recalculer les listes de filtrage à partir des paramètres actuels (voir « décision sur la position d'admission ») ; filtrer via `mcpServersEqual` + `mcpGatingEqual` (construits sur `fast-deep-equal`) ; debounce + coalescer et revérifier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `packages/cli/package.json`                        | promouvoir `fast-deep-equal` d'une dépendance transitive à une dépendance **directe**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/cli/src/gemini.tsx`                      | appeler `registerMcpHotReload` après `:785` ; enregistrer le dispositif de nettoyage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Tests _(en parallèle du basculement de schéma)_    | `settingsSchema.test.ts` fixe les valeurs `requiresRestart` des trois clés MCP (incluant `mcp` / `mcp.serverCommand` restant `true`) ; `settingsWatcher.test.ts` ajoute deux régressions positives (« modifier uniquement `mcpServers` / uniquement `mcp.excluded` → toujours notifier ») ; `settingsUtils.test.ts` utilise son **propre schéma fictif**, sans rapport avec le vrai basculement, aucune modification nécessaire                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
> Les fichiers liés à LSP (`NativeLspService.ts` / `NativeLspClient.ts` / `lsp/types.ts`) ne sont pas modifiés dans cette MR, voir le TODO de la Partie C.

## Vérification

### A. Tests unitaires des capacités principales (core, `config.test.ts` / `mcp-client-manager.test.ts`)

1.  `setMcpServers` est un **remplacement (pas fusion)** et prend effet après l'initialisation (ne lève plus d'exception via la garde `initialized`).
2.  `reinitializeMcpServers` appelle d'abord `setMcpServers` puis `discoverAllMcpToolsIncremental` ; un appel avant `initialize()` est un **no-op sûr** (pas de levée d'exception, pas de connexion).
3.  Vérifier que `removeServer()` / `removeRuntimeMcpServer()` appellent désormais `removePromptsByServer()` (garde contre la fuite de prompts). Réutiliser les fixtures de `mcp-client-manager.test.ts` (qui importent déjà `connectionIdOf`).
    3b. **Différence d'empreinte en session unique** : un client mocké dont `getStatus()` renvoie toujours `CONNECTED`, exécuter `discoverAllMcpToolsIncremental` trois fois — la première connexion enregistre l'empreinte ; la même configuration réexécutée ne **provoque pas** de changement (`connect` reste à 1×) ; modifier `args` sur place (l'empreinte change) → déconnexion+reconnexion (`disconnect` 1×, `connect` 2×). Garantit que le chemin en session unique ne manque plus le cas "connecté mais config modifiée" comme étant un no-op (aligné avec `desiredIds` du pool partagé). Vérifier également que cet appel exécute `removeMcpToolsByServer` + `removePromptsByServer` pour ce serveur avant la redécouverte — garde "effacement des anciens outils/prompts avant reconnexion", empêchant que des outils supprimés/renommés par un changement de configuration persistent.

### A'. Garde d'intégration watcher↔schéma (cli, `settingsSchema.test.ts` / `settingsWatcher.test.ts`)

> Ces deux éléments sont des **ruptures d'intégration à gravité élevée** : une modification uniquement MCP est avalée par la porte de suppression "redémarrage requis" du watcher, donc le callback de la Partie B ne se déclenche jamais. Il **doit** y avoir une couverture réelle au niveau du watcher ; appeler directement le callback dans `hot-reload.test.ts` ne peut pas détecter cet échec.

3c. **Épinglage du schéma** (`settingsSchema.test.ts`) : `mcpServers` / `mcp.allowed` / `mcp.excluded` ont `requiresRestart` `false` ; le parent `mcp` et `mcp.serverCommand` sont `true`. Empêche que quelqu'un remette les clés MCP en "redémarrage requis" et tue silencieusement tout le hot-reload.
3d. **Le watcher réel ne supprime plus** (`settingsWatcher.test.ts`, avec un vrai `SettingsWatcher` - mock fs) : modifier uniquement `mcpServers` / uniquement `mcp.excluded` déclenche chacun **un** `SettingsChangeEvent` (il aurait été supprimé avant le basculement). C'est la garde de régression de bout en bout qui garantit que l'écouteur de la sous-tâche 3 peut effectivement se déclencher.

### B. Tests unitaires des branches de la porte abonné (cli, `hot-reload.test.ts`)

Simuler un `SettingsWatcher`, couvrant chaque branche de la porte :

4.  **Modification de `mcpServers`** → appeler `reinitializeMcpServers` avec la carte **assemblée** (incluant le niveau supérieur).
5.  **Modification uniquement de `mcp.excluded` (ou `mcp.allowed` / pending), sans toucher à `mcpServers`** → **déclenche tout de même** la réconciliation, et avant la réconciliation, appelle déjà `setExcludedMcpServers` / `setAllowedMcpServers` / `setPendingMcpServers`. Cela vérifie la branche `mcpGatingEqual` — la lacune corrigée : ne faire la différence que sur `mcpServers` manquerait ce changement.
6.  **Ni `mcpServers` ni les listes de contrôle `mcp` n'ont changé** (ex. modification de thème / compétences) → **n'appelle pas** `reinitializeMcpServers` (vérifie le retour anticipé quand les deux portes sont "inchangées").
7.  **Deux changements déclenchés pendant une réconciliation en cours** → coalesce et revérifie une fois de plus (ré-entrance).
8.  **Debounce** : plusieurs sauvegardes consécutives (< 300ms) déclenchent la réconciliation **une seule fois** (aligné avec le debounce de 300ms du watcher).

### C. Tests unitaires de fonctions pures d'aide de la porte (cli, `hot-reload.test.ts`)

9.  `mcpServersEqual` : ordre différent des clés, mêmes valeurs → `true` ; modification des champs de configuration imbriqués (`args` / `env` / `headers`) → `false` ; `undefined` vs `{}` → `true` ; ajout/suppression d'un serveur → `false` ; changement d'ordre du tableau `args` → `false` (l'ordre des arguments de commande a un sens).
10. `mcpGatingEqual` : les trois listes comparent de manière "indépendante de l'ordre" (`['a','b']` vs `['b','a']` → `true`) ; ajout/suppression d'un élément dans une liste → `false` ; `undefined` vs `[]` → `true`.

### D. Cas limites de la frontière de confiance (cli + core)

> Les deux sont des **points de frontière de confiance à gravité élevée**. L'élément 11 vérifie la limite d'admission (Partie F, élément K — les paramètres restreignent dans, jamais au-delà, du flag de démarrage) ; l'élément 12 correspond à la Partie A, élément 4 (vérification en attente du chemin du pool).

11. **Le hot-reload admet dans les limites, mais jamais au-delà du flag de démarrage** (la limite de la Partie F, élément K ; remplace l'ancienne position "les paramètres peuvent élargir"). Démarrer avec `--allowed-mcp-server-names=a,b` ; puis un changement de paramètres définit `mcp.allowed` à `[a, b, c]`. **Vérifier** : après réconciliation, `c` est **toujours exclu** (plafonné à la limite de lancement) tandis que `a` est admis ; une modification des paramètres réduisant à `[a]` prend effet ; sans flag de démarrage, la liste d'autorisation des paramètres gagne sans limite. (Voir Partie F → Vérification pour la matrice complète.)
    _Gardes_ : `recomputeMcpGating` intersecte la liste d'autorisation des paramètres avec `getCliAllowedMcpServerNames()` et ne l'élargit jamais au-delà.
12. **La porte d'approbation en attente n'est pas contournée en mode pool partagé** (risque élevé : connecter un serveur filtré avant approbation). En mode démon / pool partagé (`runDiscoverAllMcpToolsViaPool`), laisser un hot-reload de paramètres ajouter/modifier un serveur en attente d'approbation (`.mcp.json` / espace de travail). **Vérifier** : avant que l'utilisateur n'approuve, il **n'acquiert pas** de connexion au pool et ne démarre pas le processus ; un serveur rejeté et filtré reste déconnecté. Comparé au chemin en session unique qui ignore déjà les serveurs en attente, ce test protège le chemin du pool.
    _Gardes_ : Partie A, élément 4 — la vérification `isMcpServerPendingApproval` du chemin du pool avant la construction de `desiredIds` / avant l'acquisition.

### E. Cas limites de la réconciliation (couverture recommandée, vérification "incrémentale, pas de vidage complet")

13. **Vide ↔ non vide** : passer de 0 serveur à 1 (le premier), de 1 à 0 (le dernier) se réconcilient correctement, ne laissant aucune connexion / outil / prompt résiduel.
14. **Un changement d'empreinte ne touche que ce seul serveur** : modifier `command` / `url` / `env` / `headers` d'un serveur → seul lui se déconnecte+reconnecte, **toutes les autres connexions sont conservées** (vérifie qu'il n'y a pas de vidage complet, pas d'intervalle "0 outils").
15. **Dossier non fiable** : quand `isTrustedFolder()` est faux, le hot-reload est un no-op (n'établit aucune connexion).
16. **Bascule `mcp.excluded`** : ajouter un serveur en ligne à excluded → il se déconnecte + outils/prompts effacés ; le retirer de excluded → il se reconnecte.