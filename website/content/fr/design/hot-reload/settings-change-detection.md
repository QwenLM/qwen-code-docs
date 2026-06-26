# Détection des modifications du fichier de paramètres (sous-tâche 1 de l'issue #3696)

## Contexte

Qwen Code ne dispose actuellement d'aucun mécanisme de détection des modifications du fichier de paramètres. Les utilisateurs doivent redémarrer la session après avoir modifié `settings.json` pour que les changements soient pris en compte. Cette proposition implémente la couche d'infrastructure pour le système de rechargement à chaud #3696 : détection automatique et distribution d'événements pour les modifications du fichier de paramètres.

**Périmètre** : Cette sous-tâche est uniquement responsable de "détecter les changements de fichier → recharger → notifier les auditeurs". `Config` copie de nombreux champs de configuration au moment de la construction (`approvalMode`, `mcpServers`, `telemetry`, etc.), et ces instantanés ne sont PAS automatiquement mis à jour par cette sous-tâche. Seuls les consommateurs qui lisent `LoadedSettings.merged` en temps réel (par ex., le hook `useSettings()`, `disabledSkillNamesProvider`) verront immédiatement les changements. Les autres sous-tâches (reconnexion MCP, commande `/reload`) sont responsables de la mise à jour de l'état interne de Config.

## Décisions architecturales

### Emplacement du module : `packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` et les chemins des fichiers de paramètres se trouvent tous deux dans `packages/cli`
- `reloadScopeFromDisk()` est une méthode de `LoadedSettings`
- Le package core ne reçoit qu'une interface de cycle de vie minimale `{ stopWatching(): void }`, sans importer les types CLI comme `SettingScope`
- La distribution des événements de changement et la logique de rafraîchissement en aval sont entièrement câblées dans la couche CLI

### Stratégie de surveillance : Surveiller le répertoire parent + filtrage strict par chemin

Le flux d'écriture de `writeWithBackupSync` est `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)`, ce qui fait que le fichier cible disparaît brièvement. Surveiller directement le chemin du fichier ferait perdre la surveillance à chokidar. Par conséquent, nous surveillons le répertoire parent (`depth: 0`) et filtrons par **correspondance exacte du nom de base**, en ne répondant qu'aux événements de fichier `settings.json` et en ignorant `.tmp`, `.orig`, les fichiers temporaires de l'éditeur, etc. La sauvegarde `.orig` est un filet de sécurité temporaire et est **supprimée en cas de succès** (étape finale `unlink`), donc elle ne persiste jamais dans le répertoire de l'utilisateur.

### Gestion paresseuse des répertoires : Ne jamais créer `.qwen/` au démarrage

> **Effet secondaire sur le système de fichiers au démarrage (volontairement évité).** Le surveillant ne doit **jamais** créer `<projet>/.qwen/` (ou `~/.qwen/`) juste pour pouvoir le surveiller. Une version antérieure appelait `mkdirSync({ recursive: true })` pour tout répertoire de paramètres manquant, ce qui signifiait qu'un démarrage normal non-bare créait silencieusement `<projet>/.qwen/` même dans des projets qui n'avaient jamais eu de paramètres Qwen — polluant l'espace de travail et l'état git. La création de répertoire appartient uniquement à la _persistance_ des paramètres (`saveSettings()` effectue son propre `mkdirSync` lorsque l'utilisateur écrit effectivement des paramètres).

Pour toujours détecter un `settings.json` ajouté ultérieurement dans la session sans créer le répertoire et sans parcourir l'arborescence du projet, le surveillant utilise une stratégie en deux étapes, par portée, basée sur l'existence du **répertoire** :

- **`.qwen` existe au démarrage** → le surveiller directement (`watchTargetDir`, la stratégie ci-dessus).
- **`.qwen` manquant** → **surveiller le parent en amorçage** (`watchParentForDir`) : `chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })` où le prédicat `ignored` `(p) => p !== parentDir && basename(p) !== '.qwen'` ne laisse passer que l'entrée **`.qwen`**. Cela supprime toute agitation non liée au niveau racine et ne parcourt jamais l'arborescence. Une fois `.qwen` apparu, le surveillant **promeut** : il ferme le surveillant d'amorçage et démarre un surveillant cible sur `.qwen`, puis planifie un rafraîchissement pour récupérer un `settings.json` qui pourrait déjà se trouver à l'intérieur.

Détails de robustesse :

- **Protection TOCTOU** : après avoir armé le surveillant d'amorçage (qui utilise `ignoreInitial`), `existsSync(dir)` est revérifié ; si `.qwen` a été créé dans l'intervalle, la promotion a lieu immédiatement.
- **Rétrogradation en cas de suppression** : si `.qwen` lui-même est supprimé (`unlinkDir`), le surveillant cible rétrograde vers un surveillant d'amorçage parent afin qu'une future recréation soit toujours détectée.
- **Protection de génération** : `close()` de chokidar est asynchrone, donc un callback `'all'` obsolète provenant d'un surveillant en cours de démantèlement pourrait autrement redéclencher la promotion et empiler les surveillants. Un jeton de génération monotone par portée (incrémenté à chaque promotion/rétrogradation et à `stopWatching`) rend les callbacks obsolètes inopérants, garantissant au plus un surveillant actif par portée.

### Détection des modifications : Diff sémantique comme mécanisme principal de déduplication

Chaque fois que le surveillant se déclenche, il prend d'abord un instantané **de l'état en mémoire actuel avant le rechargement** (`JSON.stringify(file.settings)`), puis appelle `reloadScopeFromDisk()` pour recharger, et enfin compare les instantanés avant/après. Les auditeurs ne sont notifiés que lorsque le contenu sémantique a effectivement changé.

Point clé : la comparaison se fait entre l'état en mémoire **avant et après le rechargement**, et non par rapport à un instantané historique stocké. En effet, `setValue()` met à jour de manière synchrone `file.settings` en mémoire avant d'écrire sur le disque, donc lorsque le surveillant déclenche un rechargement, l'état en mémoire contient déjà la valeur auto-écrite — le rechargement produit le même contenu → pas de diff → pas de notification.

Cela supprime naturellement :

- Les événements en double provenant des auto-écritures (`setValue()` a déjà mis à jour la mémoire, le rechargement produit un contenu identique → pas de diff → pas de notification)
- Les modifications uniquement de format/commentaires (les paramètres résolus n'incluent pas les commentaires)
- Les sauvegardes d'éditeur sans modification du contenu
- Les événements chokidar en double

Limitation connue : `JSON.stringify` est sensible à l'ordre des clés. Si un utilisateur réorganise manuellement les clés dans settings.json sans changer les valeurs, cela déclenchera une notification supplémentaire inoffensive. Cela est acceptable ; il n'est pas nécessaire d'introduire une dépendance de comparaison profonde.

## Implémentation

### 1. Nouvelle classe `SettingsWatcher`

**Fichier** : `packages/cli/src/config/settingsWatcher.ts`

```typescript
export interface SettingsChangeEvent {
  scope: SettingScope;
  path: string;
  changeType: 'modified' | 'created' | 'deleted';
}

export type SettingsChangeListener = (
  events: SettingsChangeEvent[],
) => void | Promise<void>;

export class SettingsWatcher {
  private readonly settings: LoadedSettings;
  private readonly watchers: Map<SettingScope, FSWatcher> = new Map();
  // 'bootstrap' = surveille le parent pour `.qwen` ; 'target' = surveille `.qwen`
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // Jeton monotone par portée ; incrémenté en cas de promotion/rétrogradation pour annuler les callbacks obsolètes
  private readonly watchGeneration: Map<SettingScope, number> = new Map();
  private readonly changeListeners: Set<SettingsChangeListener> = new Set();
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingScopeChanges: Set<SettingScope> = new Set();
  private processing: boolean = false; // garde de sérialisation
  private started: boolean = false;

  static readonly DEBOUNCE_MS = 300;
  static readonly LISTENER_TIMEOUT_MS = 30_000;
}
```

**Méthodes principales** :

#### `startWatching()`

- Parcourt les portées Utilisateur et Espace de travail
- Se base sur l'existence du **répertoire** : surveille `.qwen` directement s'il existe, sinon surveille le parent en amorçage (voir [Gestion paresseuse des répertoires](#gestion-paresseuse-des-répertoires--ne-jamais-créer-qwen-au-démarrage))
- **Ne crée jamais** le répertoire — pas de `mkdirSync`
- `ignoreInitial: true`, `depth: 0` partout
- N'est pas appelée en mode bare

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // Ne jamais créer le répertoire ; la persistance des paramètres (saveSettings) en est propriétaire.
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` est le surveillant de répertoire parent + nom de base strict décrit ci-dessus (il rétrograde également vers un surveillant d'amorçage si `.qwen` lui-même est supprimé). `watchParentForDir` arme le surveillant d'amorçage dédié à `.qwen` et promeut une fois `.qwen` apparu :

```typescript
private watchParentForDir(scope: SettingScope, settingsPath: string): void {
  const dir = path.dirname(settingsPath);
  const parentDir = path.dirname(dir);
  const dirBasename = path.basename(dir); // ".qwen"
  const gen = this.bumpGeneration(scope);

  const watcher = watchFs(parentDir, {
    ignoreInitial: true,
    depth: 0,
    ignored: (filePath: string) =>
      filePath !== parentDir && path.basename(filePath) !== dirBasename,
  })
    .on('all', (_event: string, changedPath: string) => {
      if (this.watchGeneration.get(scope) !== gen) return; // callback obsolète
      if (path.basename(changedPath) !== dirBasename) return;
      void this.promoteScope(scope, settingsPath);
    })
    .on('error', (error: unknown) => {
      debugLogger.warn(`Erreur du surveillant d'amorçage des paramètres pour ${parentDir} :`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // Protection TOCTOU : `.qwen` a pu apparaître entre la vérification d'existence et maintenant.
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // protège contre la double promotion
  await this.replaceWatcher(scope); // incrémente la génération + attend la fermeture asynchrone
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // récupère un settings.json déjà présent dans .qwen
}
```

#### `stopWatching()` — Arrêt idempotent

```typescript
stopWatching(): void {
  if (!this.started) return;
  this.started = false;
  for (const [, watcher] of this.watchers) {
    watcher.close().catch((err) => debugLogger.warn('Erreur de fermeture du surveillant :', err));
  }
  this.watchers.clear();
  if (this.refreshTimer) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
  this.pendingScopeChanges.clear();
}
```

#### `scheduleRefresh(scope)` — Debounce de 300 ms + accumulation des portées

```typescript
private scheduleRefresh(scope: SettingScope): void {
  this.pendingScopeChanges.add(scope);
  if (this.refreshTimer) clearTimeout(this.refreshTimer);
  this.refreshTimer = setTimeout(() => {
    this.refreshTimer = null;
    void this.drainPendingChanges();
  }, SettingsWatcher.DEBOUNCE_MS);
}
```

#### `drainPendingChanges()` — Traitement sérialisé pour éviter la réentrance

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // le tour précédent est encore en cours ; il se videra en sortant
  this.processing = true;
  try {
    while (this.pendingScopeChanges.size > 0) {
      const scopes = new Set(this.pendingScopeChanges);
      this.pendingScopeChanges.clear();
      await this.handleChange(scopes);
    }
  } finally {
    this.processing = false;
  }
}
```

#### `handleChange(scopes)` — Rechargement + diff sémantique + notification

```typescript
private async handleChange(changedScopes: Set<SettingScope>): Promise<void> {
  const events: SettingsChangeEvent[] = [];

  for (const scope of changedScopes) {
    const file = this.settings.forScope(scope);

    // Instantané de l'état en mémoire actuel avant le rechargement (inclut les mutations de setValue())
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk a un try/catch interne ; en cas d'échec d'analyse, il préserve l'ancien état
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // Diff sémantique : ne notifier que lorsque le contenu a effectivement changé
    // Suppression d'auto-écriture : setValue() a déjà mis à jour la mémoire → le rechargement correspond → pas de notification
    if (afterSettings === beforeSettings) continue;

    events.push({
      scope,
      path: file.path,
      changeType: !existedBefore && existsNow ? 'created'
                : existedBefore && !existsNow ? 'deleted'
                : 'modified',
    });
  }

  if (events.length > 0) {
    await this.notifyListeners(events);
  }
}
```

#### `notifyListeners(events)` — `Promise.allSettled()` + délai de 30 s

Réutilise le modèle de notification des auditeurs de SkillManager (`packages/core/src/skills/skill-manager.ts:188-236`) : chaque auditeur est enveloppé dans une course contre un délai de 30 s, exécuté en parallèle via `Promise.allSettled`, les échecs ne se propagent pas.

#### `addChangeListener(listener)` — Retourne une fonction de désabonnement

### 2. Modifications de `LoadedSettings`

**Fichier** : `packages/cli/src/config/settings.ts`

**Aucune modification nécessaire**. Le mécanisme de diff sémantique est entièrement autonome dans le surveillant. `setValue()` met à jour la mémoire de manière synchrone → `saveSettings()` écrit sur le disque → le surveillant se déclenche → `reloadScopeFromDisk()` recharge → la comparaison de diff trouve un contenu identique → pas de notification. La chaîne se ferme naturellement.

### 3. Intégration dans Config (interface minimale)

**Fichier** : `packages/core/src/config/config.ts`

Ajouter à `ConfigParameters` :

```typescript
/** Gestionnaire de cycle de vie pour un surveillant de fichier externe. Arrêté lors de l'arrêt. */
settingsWatcher?: { stopWatching(): void };
```

Dans `Config.shutdown()`, arrêter le surveillant **avant** la vérification de `initialized` :

```typescript
async shutdown(): Promise<void> {
  try {
    // Arrêter le surveillant externe, quel que soit l'état d'initialisation
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... reste de la logique de nettoyage ...
  }
}
```

**Aucun `settingsChangeListeners` n'est ajouté à Config**. La distribution des événements de changement est entièrement gérée dans la couche CLI, où les auditeurs appellent directement les méthodes de rafraîchissement du core (par ex., `skillManager.refreshCache()`, `toolRegistry.restartMcpServers()`). Cela permet au core de rester ignorant de la sémantique des modifications de paramètres.

### 4. Câblage au démarrage

**Fichier** : `packages/cli/src/gemini.tsx`

Après `loadSettings()` et `loadCliConfig()` :

```typescript
// Créer le surveillant (ignorer en mode bare)
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// Passer le gestionnaire de cycle de vie du surveillant lors du chargement de la config CLI
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// Enregistrer l'auditeur de changement (les futures sous-tâches ajouteront ici la logique de rafraîchissement réelle)
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Paramètres modifiés :', events.map(e => `${e.scope}:${e.changeType}`));
  // Les sous-tâches 2-6 ajouteront :
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - drapeau needsRefresh
});
```

**Modification de la signature de `loadCliConfig`** (`packages/cli/src/config/config.ts`) : Ajouter un paramètre optionnel pour passer `settingsWatcher` à `ConfigParameters`.

## Gestion des cas limites

| Scénario                                | Gestion                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Le répertoire `.qwen` n'existe pas      | **Jamais créé.** Surveillance d'amorçage du parent (`depth: 0`, filtre uniquement `.qwen`), promotion dès que `.qwen` apparaît |
| `.qwen` créé après le démarrage         | Le surveillant d'amorçage détecte `addDir`, promeut vers un surveillant cible + planifie un rafraîchissement                 |
| `.qwen` supprimé après promotion        | Le surveillant cible détecte `unlinkDir` → rétrograde vers un surveillant d'amorçage parent                                  |
| Fichier supprimé                        | `reloadScopeFromDisk` détecte `!existsSync`, réinitialise à `{}`, le diff déclenche un événement `deleted`                    |
| Fichier créé après le démarrage (répertoire existant) | Le surveillant de répertoire détecte l'événement `add`, `reloadScopeFromDisk` lit le nouveau fichier                         |
| Callback obsolète durant promotion/rétrogradation | Le jeton de génération par portée rend le callback en vol du surveillant en cours de fermeture inopérant (pas d'empilement de surveillants) |
| Écritures atomiques de l'éditeur        | Surveillance de répertoire + filtrage strict du nom de base (exclut `.tmp`/`.orig`) + debounce de 300 ms                     |
| Événements de fichiers `.tmp`/`.orig`   | Le filtre de nom de base correspond exactement à `settings.json`, tous les autres noms de fichiers sont ignorés              |
| Auto-écriture (`setValue` → `saveSettings`) | Diff sémantique : le contenu rechargé correspond à l'instantané en mémoire → pas de notification                           |
| Auto-écriture concurrente avec modification externe | La modification externe change le contenu → le diff détecte le changement → notification correcte                          |
| Modifications uniquement de format/commentaires | `reloadScopeFromDisk` résout les paramètres sans commentaires → le diff correspond → pas de notification                    |
| Événements chokidar en double           | Le debounce + le diff sémantique offrent une double protection                                                              |
| Redirection `QWEN_HOME`                 | `getUserSettingsPath()` résout déjà le chemin ; le surveillant utilise le chemin résolu                                      |
| Mode bare                               | `startWatching()` n'est jamais appelée, surcharge nulle                                                                      |
| Échec de création du surveillant        | Exception capturée, avertissement journalisé, cette portée n'a pas de détection en temps réel mais la fonctionnalité n'est pas affectée |
| Échec d'analyse de `reloadScopeFromDisk` | try/catch interne (`settings.ts:501`) préserve l'ancien état → le diff avant/après correspond → pas de notification          |
| Changement d'ordre des clés (pas de changement de valeur) | `JSON.stringify` est sensible à l'ordre des clés ; peut produire une notification supplémentaire inoffensive               |
| Échec d'initialisation de Config        | `shutdown()` arrête le surveillant avant la vérification de `initialized`, évitant les fuites                                |
| Réentrance (auditeur encore en cours)   | Le drapeau `processing` + la boucle `drainPendingChanges` sérialisent le traitement                                          |
| JSON invalide                           | try/catch interne de `reloadScopeFromDisk` préserve l'ancien état                                                            |

## Analyse des performances

- Au plus 1 surveillant par portée (≤ 2 au total), chacun à `depth: 0` — surcharge minimale en descripteurs de fichier ; la promotion/rétrogradation échange les surveillants, ne les empile jamais
- `depth: 0` signifie **aucun parcours récursif** de l'arbre du projet, même pour le surveillant d'amorçage parent dans un grand monorepo. Le coût est limité aux enfants directs du répertoire parent : l'agitation non liée au niveau racine réveille chokidar pour un `readdir` + un passage de filtre `ignored` (`O(entrées de premier niveau)`) avant que l'événement ne soit supprimé — jamais une analyse récursive
- Le debounce de 300 ms garantit que les sauvegardes rapides de l'éditeur ne déclenchent pas plusieurs rechargements
- `reloadScopeFromDisk` utilise `readFileSync` synchrone, < 1 ms par appel
- La comparaison `JSON.stringify` est en O(n) mais les objets de paramètres font généralement < 10 Ko ; aucun stockage d'instantané supplémentaire nécessaire
- La notification des auditeurs s'exécute en parallèle via `Promise.allSettled`
- Pas de scrutation — purement basé sur les événements

## Fichiers à créer/modifier

**Nouveaux fichiers** :

- `packages/cli/src/config/settingsWatcher.ts` — classe de surveillance
- `packages/cli/src/config/settingsWatcher.test.ts` — tests unitaires

**Fichiers modifiés** :

- `packages/core/src/config/config.ts` — ajouter le champ `settingsWatcher` à `ConfigParameters`, appeler `stopWatching()` avant la vérification de `initialized` dans `Config.shutdown()`
- `packages/cli/src/config/config.ts` (`loadCliConfig`) — ajouter un paramètre optionnel pour passer `settingsWatcher`
- `packages/cli/src/gemini.tsx` — instancier le surveillant + câblage

**Aucune modification nécessaire** : `packages/cli/src/config/settings.ts` (le diff sémantique est autonome et ne nécessite aucune coopération de `LoadedSettings`)
## Plan de test

### Tests unitaires (`settingsWatcher.test.ts`)

Mock chokidar (en réutilisant le même modèle de mock que `skill-manager.test.ts`) :

1. **Cycle de vie** : `startWatching` crée les watchers, `stopWatching` ferme les watchers, les deux sont idempotents
2. **Filtrage des chemins** : Seuls les événements du nom de base `settings.json` déclenchent un rafraîchissement ; les fichiers `.tmp`/`.orig`/autres sont ignorés
3. **Debouncing** : Les événements rapides multiples fusionnent en un seul rechargement (`vi.useFakeTimers()`)
4. **Diff sémantique** : Contenu inchangé → l'écouteur n'est pas appelé ; contenu modifié → l'écouteur est appelé avec les événements corrects
5. **Suppression des auto-écritures** : Les événements du watcher déclenchés par `setValue()` sont naturellement filtrés par un diff identique
6. **Sérialisation** : Les nouveaux événements pendant `handleChange` sont accumulés, puis vidés une fois le traitement terminé
7. **Isolation des erreurs** : Les erreurs de chokidar ne plantent pas ; les exceptions d'un écouteur n'affectent pas les autres ; les échecs de `reloadScopeFromDisk` sont interceptés
8. **Timeout de l'écouteur** : Protection par timeout de 30s
9. **Surveillance paresseuse des répertoires** : Quand `.qwen` est absent, `mkdirSync` n'est jamais appelé ; un watcher bootstrap est armé sur le parent et son prédicat `ignored` autorise uniquement l'entrée `.qwen`
10. **Promotion / TOCTOU** : L'apparition de `.qwen` (via `addDir` ou la revérification post-armement) ferme le watcher bootstrap et ouvre un watcher cible sur `.qwen` + planifie un rafraîchissement
11. **Rétrogradation / recréation** : La suppression de `.qwen` (`unlinkDir`) réinitialise le bootstrap sur le parent ; une recréation ultérieure déclenche à nouveau une promotion
12. **Garde de génération** : Un callback obsolète provenant d'un watcher bootstrap déjà fermé ne crée pas un second watcher cible

### Vérification de régression

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### Vérification manuelle

Modifiez `~/.qwen/settings.json` pendant une session en cours et observez les logs de débogage pour les événements de modification.

---

## Sous-tâche de suivi : Supprimer les événements pour les paramètres nécessitant un redémarrage et les paramètres sensibles

> **Statut : la porte de suppression est implémentée ; deux modifications de schéma sont encore en attente de recherche.** La sous-tâche 1 ci-dessus émettait un seul `SettingsChangeEvent` par scope pour _toute_ modification sémantique. Ce suivi ajoute un filtre afin que les modifications confinées à des paramètres qui ne peuvent pas réellement prendre effet sans redémarrage — ou qui sont sensibles (identifiants) — n'avisent **pas** les écouteurs.
>
> - **Fait :** la porte de suppression basée sur `requiresRestart` dans `SettingsWatcher.handleChange()` ainsi que les tests unitaires (voir Mécanisme ci-dessous).
> - **En attente :** les deux corrections de schéma `requiresRestart` (`modelProviders` → `true`, `permissions.*` → conserver le rechargement à chaud), chacune conditionnée à la vérification préalable du chemin de lecture à l'exécution.

### Motivation

Certains paramètres sont lus exactement une fois au démarrage du processus (`Config.initialize()`, construction du générateur de contenu/client, lancement de processus enfants, indicateurs du runtime Node). Exemples explicitement mentionnés par l'utilisateur : **jetons API, `env` et fournisseurs de modèles**. Émettre un événement de rechargement à chaud pour ceux-ci est activement trompeur — l'écouteur « rafraîchirait » mais la nouvelle valeur ne s'appliquerait pas réellement tant que l'utilisateur ne redémarre pas `qwen-code`. Les valeurs sensibles (identifiants) ne doivent en outre pas être reconnectées dans une session en cours.

### Décision : Réutiliser l'indicateur `requiresRestart` du schéma (source unique de vérité)

`settingsSchema.ts` déclare déjà `requiresRestart: boolean` sur **chaque** clé, et `packages/cli/src/utils/settingsUtils.ts` expose déjà les recherches :

- `requiresRestart(key: string): boolean` — indicateur pour une clé en notation pointée
- `getFlattenedSchema()` — carte aplatie complète `clé → définition`
- `getRestartRequiredSettings()` — toutes les clés avec `requiresRestart: true`

Nous allons **réutiliser cet indicateur comme signal de suppression** plutôt que de maintenir une liste d'exclusion distincte écrite à la main (qui dériverait inévitablement du schéma). `requiresRestart: true` signifie déjà précisément « ne prendra pas effet sans redémarrage », ce qui est exactement la condition sous laquelle un événement doit être supprimé.

### Mécanisme (implémenté dans `SettingsWatcher.handleChange()`)

L'ancienne porte effectuait un diff de l'ensemble du fichier avec `JSON.stringify` et ne pouvait pas dire _quelles_ clés avaient changé. Elle est remplacée par un diff au niveau des feuilles + classification par clé :

1. **`collectChangedKeys(before, after)`** prend un instantané de l'état en mémoire avant le rechargement (`structuredClone`), puis parcourt before/after et collecte le chemin pointé de chaque feuille dont la valeur diffère. Les objets simples sont récursés ; les tableaux et primitives sont comparés entièrement (correspondant aux clés de tableau du schéma comme `permissions.allow`). Les clés ajoutées/supprimées apparaissent comme des feuilles modifiées, donc la création/suppression de fichier est couverte sans nécessiter une vérification d'existence séparée.
2. **`isRestartRequiredKey(path)`** résout chaque chemin modifié par rapport au schéma en utilisant la **clé de schéma la plus longue qui est un préfixe (ou égale) du chemin**. Les paramètres d'objets libres (`env`, `modelProviders`) sont des clés de schéma feuilles, donc `env.FOO` se résout en la définition `env`. Les clés inconnues sont par défaut **non** nécessitant un redémarrage, donc une modification que nous ne pouvons pas classer n'est jamais silencieusement supprimée.
3. Le scope notifie **uniquement si au moins une clé modifiée est rechargeable à chaud** (`!isRestartRequiredKey`). Si toutes les clés modifiées nécessitent un redémarrage, le scope ne produit aucun événement.

La forme de `SettingsChangeEvent` est inchangée (toujours `{ scope, path, changeType }`) ; le transport des clés modifiées survivantes sur l'événement est laissé comme une amélioration ultérieure possible. La suppression des auto-écritures (diff vide → aucun événement), le debounce, la sérialisation et le timeout de l'écouteur restent inchangés.

### Deux ajustements de schéma à rechercher et appliquer

Ces deux valeurs `requiresRestart` doivent être corrigées pour que l'approche de réutilisation se comporte comme prévu. **Chacune nécessite de vérifier le chemin de lecture réel à l'exécution avant de basculer l'indicateur.**

1. **`modelProviders` : `false` → `true`** (`settingsSchema.ts:294`)
   - Aujourd'hui il est marqué `requiresRestart: false`, donc avec l'approche de réutilisation il ne serait _pas_ supprimé — contredisant l'exigence que les modifications de fournisseur ne soient pas rechargées à chaud.
   - La configuration des fournisseurs (incluant `apiKey` / `baseUrl` par fournisseur) est consommée lorsque le client de modèle / générateur de contenu est construit au démarrage.
   - **Élément de recherche :** confirmer qu'il n'y a pas de relecture à l'exécution de `modelProviders` (rechercher dans la construction du générateur de contenu / client). Résultat attendu : le `false` est un bug latent ; basculer à `true`.

2. **`permissions.*` : conserver le rechargement à chaud** (`settingsSchema.ts:1560`, toute la sous-arborescence actuellement `requiresRestart: true`)
   - Les règles d'autorisation (`deny > ask > allow`) sont évaluées par appel d'outil et sont censées être les paramètres que les utilisateurs souhaitent le plus voir prendre effet immédiatement.
   - Toute la sous-arborescence `permissions` est `showInDialog: false`, donc son indicateur `requiresRestart` n'a actuellement **aucune signification dans l'interface** — fort indice que le `true` était une valeur par défaut plutôt qu'une décision délibérée « nécessite un redémarrage », donc la zone d'impact du basculement est faible.
   - **Élément de recherche :** confirmer que l'exécution relit les permissions en direct (par exemple via `config.getXxx()` au moment de l'évaluation) plutôt qu'à partir d'un instantané de démarrage. Si confirmé, définir la sous-arborescence `permissions` à `requiresRestart: false` afin qu'elle ne soit **pas** supprimée par le mécanisme de réutilisation.

> Remarque : comme `requiresRestart` est également affiché dans l'interface des paramètres / les invites de redémarrage, basculer ces indicateurs modifie également ce comportement. C'est acceptable et probablement plus correct, mais doit être mentionné dans la description de la PR.

### Critères d'acceptation

- Une modification touchant uniquement des clés nécessitant un redémarrage / sensibles (`security.auth.*`, `env`, `modelProviders`, `mcpServers`, `proxy`, …) n'émet **aucun** `SettingsChangeEvent`.
- Une modification d'une clé rechargeable à chaud (`ui.*`, `model.name`, `permissions.*` une fois basculé, …) émet toujours un événement.
- Une modification mixte (une clé nécessitant un redémarrage + une clé rechargeable à chaud) émet toujours un événement (la partie rechargeable à chaud a légitimement besoin d'être rafraîchie).
- Une modification d'une clé inconnue (hors schéma) émet toujours, plutôt que d'être silencieusement supprimée.

État des tests :

- **Fait** — le bloc `restart-required suppression` de `settingsWatcher.test.ts` couvre les cas totalement supprimés (`env`, `security.auth.apiKey`), totalement autorisés (`ui.theme`), mixtes et clés inconnues.
- **En attente (avec les basculements de schéma)** — les assertions `settingsSchema.test.ts` fixant les deux valeurs corrigées de `requiresRestart`, et un test du watcher affirmant que `permissions.*` n'est plus supprimé une fois basculé.