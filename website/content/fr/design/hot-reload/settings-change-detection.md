# Détection des modifications du fichier de paramètres (Sous-tâche 1 de l'issue #3696)

## Contexte

Qwen Code ne dispose actuellement d'aucun mécanisme de détection des modifications du fichier de paramètres. Les utilisateurs doivent redémarrer la session après avoir modifié `settings.json` pour que les changements soient pris en compte. Cette proposition implémente la couche d'infrastructure pour le système de rechargement à chaud #3696 — détection automatique et émission d'événements pour les modifications du fichier de paramètres.

**Périmètre** : Cette sous-tâche est uniquement responsable de « détecter les changements de fichier → recharger → notifier les écouteurs ». `Config` copie de nombreux champs de paramètres au moment de la construction (`approvalMode`, `mcpServers`, `telemetry`, etc.), et ces instantanés ne sont PAS automatiquement mis à jour par cette sous-tâche. Seuls les consommateurs qui lisent `LoadedSettings.merged` en temps réel (par exemple, le hook `useSettings()`, `disabledSkillNamesProvider`) verront immédiatement les changements. Les autres sous-tâches (reconnexion MCP, commande `/reload`) sont responsables de pousser les mises à jour vers l'état interne de Config.

## Décisions architecturales

### Emplacement du module : `packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` et les chemins des fichiers de paramètres se trouvent tous deux dans `packages/cli`
- `reloadScopeFromDisk()` est une méthode de `LoadedSettings`
- Le package core ne reçoit qu'une interface de cycle de vie minimale `{ stopWatching(): void }`, sans importer les types CLI comme `SettingScope`
- La distribution des événements de changement et la logique de rafraîchissement en aval sont entièrement câblées dans la couche CLI

### Stratégie de surveillance : Surveiller le répertoire parent + filtrage strict par chemin

Le flux d'écriture `writeWithBackupSync` est `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)`, ce qui provoque une brève disparition du fichier cible. Surveiller directement le chemin du fichier ferait perdre la surveillance à chokidar. Par conséquent, nous surveillons le répertoire parent (`depth: 0`) et filtrons par **correspondance exacte du nom de base**, en ne répondant qu'aux événements de fichier `settings.json` et en ignorant `.tmp`, `.orig`, les fichiers temporaires de l'éditeur, etc. La sauvegarde `.orig` est un filet de sécurité en cours d'opération et est **supprimée en cas de succès** (étape finale `unlink`), donc elle ne persiste jamais dans le répertoire de l'utilisateur.

### Gestion paresseuse des répertoires : Ne jamais créer `.qwen/` au démarrage

> **Effet secondaire sur le système de fichiers au démarrage (volontairement évité).** Le watcher ne doit **jamais** créer `<projet>/.qwen/` (ou `~/.qwen/`) simplement pour pouvoir le surveiller. Une version antérieure appelait `mkdirSync({ recursive: true })` pour tout répertoire de paramètres manquant, ce qui signifiait qu'un démarrage normal non-bare créait silencieusement `<projet>/.qwen/` même dans des projets n'ayant jamais eu de paramètres Qwen — polluant l'espace de travail et le statut git. La création de répertoire est uniquement détenue par la _persistance_ des paramètres (`saveSettings()` fait son propre `mkdirSync` lorsque l'utilisateur écrit effectivement des paramètres).

Pour toujours détecter un `settings.json` ajouté plus tard dans la session sans créer le répertoire et sans récurser dans l'arborescence du projet, le watcher utilise une stratégie en deux étapes, par portée, basée sur l'existence du **répertoire** :

- **`.qwen` existe au démarrage** → le surveiller directement (`watchTargetDir`, la stratégie ci-dessus).
- **`.qwen` manquant** → **surveiller le parent en bootstrap** (`watchParentForDir`) : `chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })` où le prédicat `ignored` `(p) => p !== parentDir && basename(p) !== '.qwen'` n'autorise que l'entrée `.qwen`. Cela supprime tout le bruit de niveau supérieur non lié et ne récurse jamais. Une fois `.qwen` apparu, le watcher **promut** : il ferme le watcher bootstrap et démarre un watcher cible sur `.qwen`, puis planifie un rafraîchissement pour récupérer un éventuel `settings.json` déjà présent à l'intérieur.

Détails de robustesse :

- **Protection TOCTOU** : après avoir armé le watcher bootstrap (qui utilise `ignoreInitial`), `existsSync(dir)` est revérifié ; si `.qwen` a été créé dans l'intervalle, la promotion a lieu immédiatement.
- **Démotion en cas de suppression** : si `.qwen` lui-même est supprimé (`unlinkDir`), le watcher cible revient à un watcher bootstrap parent afin qu'une future recréation soit toujours détectée.
- **Protection de génération** : `close()` de chokidar est asynchrone, donc un callback `'all'` obsolète provenant d'un watcher en cours de démantèlement pourrait sinon redéclencher la promotion et empiler les watchers. Un jeton de génération monotone par portée (incrémenté à chaque promotion/démotion, et lors de `stopWatching`) rend les callbacks obsolètes inopérants, garantissant au plus un watcher actif par portée.

### Détection des changements : Diff sémantique comme mécanisme principal de déduplication

Chaque fois que le watcher se déclenche, il prend d'abord un instantané **de l'état en mémoire actuel avant le rechargement** (`JSON.stringify(file.settings)`), puis appelle `reloadScopeFromDisk()` pour recharger, et enfin compare les instantanés avant/après. Les écouteurs ne sont notifiés que lorsque le contenu sémantique a effectivement changé.

Point clé : la comparaison se fait entre l'état en mémoire **avant et après le rechargement**, et non par rapport à un instantané historique stocké. En effet, `setValue()` met à jour de manière synchrone `file.settings` en mémoire avant d'écrire sur le disque ; ainsi, lorsque le watcher déclenche un rechargement, l'état en mémoire contient déjà la valeur auto-écrite — le rechargement produit le même contenu → pas de diff → pas de notification.
Cela supprime naturellement :

- Les événements en double provenant des auto-écritures (`setValue()` a déjà mis à jour la mémoire, un rechargement produit un contenu identique → pas de diff → pas de notification)
- Les modifications de format/uniquement de commentaires (les paramètres résolus n'incluent pas les commentaires)
- Les sauvegardes d'éditeur sans modification de contenu
- Les événements chokidar en double

Limitation connue : `JSON.stringify` est sensible à l'ordre des clés. Si un utilisateur réorganise manuellement les clés dans settings.json sans modifier les valeurs, cela déclenchera une notification supplémentaire inoffensive. C'est acceptable ; il n'est pas nécessaire d'introduire une dépendance deep-equal.

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
  // 'bootstrap' = surveillance du parent pour `.qwen` ; 'target' = surveillance de `.qwen`
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // Jeton monotone par scope ; incrémenté lors de promote/demote pour invalider les callbacks obsolètes
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

- Parcourt les scopes Utilisateur et Espace de travail
- Se ramifie selon l'existence du **répertoire** : surveille `.qwen` directement s'il existe, sinon surveille le parent en mode bootstrap (voir [Gestion paresseuse des répertoires](#lazy-directory-handling-never-create-qwen-at-startup))
- **Ne crée jamais** le répertoire — pas de `mkdirSync`
- `ignoreInitial: true`, `depth: 0` partout
- Pas appelée en mode minimal

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // Ne jamais créer le répertoire ; la persistance des paramètres (saveSettings) s'en charge.
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` est le watcher répertoire-parent + basename strict décrit ci-dessus (il rétrograde également vers un watcher bootstrap si `.qwen` lui-même est supprimé). `watchParentForDir` arme le watcher bootstrap `.qwen` uniquement et promeut une fois que `.qwen` apparaît :

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
      debugLogger.warn(`Erreur du watcher bootstrap des paramètres pour ${parentDir}:`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // Garde TOCTOU : `.qwen` peut être apparu entre la vérification d'existence et ici.
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // empêche la double promotion
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
    watcher.close().catch((err) => debugLogger.warn('Erreur de fermeture du watcher :', err));
  }
  this.watchers.clear();
  if (this.refreshTimer) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
  this.pendingScopeChanges.clear();
}
```

#### `scheduleRefresh(scope)` — Anti-rebond de 300 ms + accumulation des scopes

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
#### `drainPendingChanges()` — Traitement sérialisé pour éviter la ré-entrance

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // le tour précédent est encore en cours ; il se videra à la sortie
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

    // Instantané de l'état mémoire actuel avant le rechargement (inclut les mutations setValue())
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk a un try/catch interne ; en cas d'échec d'analyse, il conserve l'ancien état
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // Diff sémantique : notifier uniquement si le contenu a réellement changé
    // Suppression des auto-écritures : setValue() a déjà mis à jour la mémoire → le rechargement correspond → pas de notification
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

#### `notifyListeners(events)` — `Promise.allSettled()` + timeout de 30s

Réutilise le modèle de notification des écouteurs de SkillManager (`packages/core/src/skills/skill-manager.ts:188-236`) : chaque écouteur est enveloppé dans une course contre un timeout de 30s, exécuté en parallèle via `Promise.allSettled`, les échecs ne se propagent pas.

#### `addChangeListener(listener)` — Retourne une fonction de désabonnement

### 2. Modifications de `LoadedSettings`

**Fichier** : `packages/cli/src/config/settings.ts`

**Aucune modification nécessaire**. Le mécanisme de diff sémantique est entièrement autonome dans le watcher. `setValue()` met à jour la mémoire de manière synchrone → `saveSettings()` écrit sur le disque → le watcher se déclenche → `reloadScopeFromDisk()` recharge → la comparaison par diff trouve un contenu identique → pas de notification. La chaîne se ferme naturellement.

### 3. Intégration dans la configuration (interface minimale)

**Fichier** : `packages/core/src/config/config.ts`

Ajouter à `ConfigParameters` :

```typescript
/** Gestionnaire de cycle de vie pour un watcher de fichiers externe. Arrêté lors de l'arrêt. */
settingsWatcher?: { stopWatching(): void };
```

Dans `Config.shutdown()`, arrêter le watcher **avant** la vérification `initialized` :

```typescript
async shutdown(): Promise<void> {
  try {
    // Arrêter le watcher externe quel que soit l'état d'initialisation
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... suite de la logique de nettoyage ...
  }
}
```

**Aucun `settingsChangeListeners` n'est ajouté à Config**. La distribution des événements de modification est entièrement gérée dans la couche CLI, où les écouteurs appellent directement les méthodes de rafraîchissement du noyau (par exemple, `skillManager.refreshCache()`, `toolRegistry.restartMcpServers()`). Cela maintient le noyau ignorant de la sémantique des modifications de paramètres.

### 4. Câblage au démarrage

**Fichier** : `packages/cli/src/gemini.tsx`

Après `loadSettings()` et `loadCliConfig()` :

```typescript
// Créer le watcher (ignorer en mode bare)
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// Passer le gestionnaire de cycle de vie du watcher lors du chargement de la config CLI
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// Enregistrer un écouteur de modifications (les sous-tâches futures ajouteront la logique de rafraîchissement réelle ici)
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Paramètres modifiés :', events.map(e => `${e.scope}:${e.changeType}`));
  // Les sous-tâches 2-6 ajouteront :
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - le flag needsRefresh
});
```

**Changement de signature de `loadCliConfig`** (`packages/cli/src/config/config.ts`) : Ajouter un paramètre optionnel pour passer `settingsWatcher` à `ConfigParameters`.

## Gestion des cas limites

| Scénario                                | Gestion                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Le répertoire `.qwen` n'existe pas      | **Jamais créé.** Surveiller le parent en mode bootstrap (`depth: 0`, filtre `.qwen` uniquement), promouvoir une fois que `.qwen` apparaît |
| `.qwen` créé après le démarrage         | Le watcher bootstrap détecte `addDir`, promeut en watcher cible + planifie un rafraîchissement                        |
| `.qwen` supprimé après promotion        | Le watcher cible détecte `unlinkDir` → rétrograde en watcher bootstrap du parent                               |
| Fichier supprimé                        | `reloadScopeFromDisk` détecte `!existsSync`, réinitialise à `{}`, le diff déclenche un événement `deleted`                    |
| Fichier créé après le démarrage (répertoire existant) | Le watcher de répertoire détecte l'événement `add`, `reloadScopeFromDisk` lit le nouveau fichier                               |
| Callback obsolète lors de la promotion/rétrogradation | Le jeton de génération par portée fait que le callback en vol du watcher fermé est ignoré (pas d'empilement de watchers)       |
| Écritures atomiques de l'éditeur        | Surveillance de répertoire + filtrage strict du nom de base (exclut `.tmp`/`.orig`) + regroupement par debounce de 300ms          |
| Événements de fichiers `.tmp`/`.orig`   | Le filtre du nom de base correspond exactement à `settings.json`, tous les autres noms de fichiers sont ignorés                                |
| Auto-écriture (`setValue` → `saveSettings`) | Diff sémantique : le contenu rechargé correspond à l'instantané mémoire → pas de notification                                    |
| Auto-écriture concurrente avec une modification externe | La modification externe change le contenu → le diff détecte le changement → notifie correctement                                  |
| Modifications de format/commentaires uniquement | `reloadScopeFromDisk` résout les paramètres sans commentaires → le diff correspond → pas de notification                     |
| Événements chokidar en double           | Le regroupement par debounce + le diff sémantique offrent une double protection                                                   |
| Redirection `QWEN_HOME`                  | `getUserSettingsPath()` résout déjà le chemin ; le watcher utilise le chemin résolu                             |
| Mode bare                               | `startWatching()` n'est jamais appelé, zéro surcoût                                                              |
| Échec de création du watcher            | Exception capturée, avertissement journalisé, cette portée n'a pas de détection en temps réel mais la fonctionnalité n'est pas affectée       |
| Échec d'analyse de `reloadScopeFromDisk` | try/catch interne (`settings.ts:501`) conserve l'ancien état → le diff avant/après correspond → pas de notification      |
| Changement d'ordre des clés (pas de changement de valeur) | `JSON.stringify` est sensible à l'ordre des clés ; peut produire une notification supplémentaire inoffensive                       |
| Échec d'initialisation de la configuration | `shutdown()` arrête le watcher avant la vérification `initialized`, empêchant les fuites                                       |
| Ré-entrance (écouteur toujours en cours) | Le flag `processing` + la boucle `drainPendingChanges` sérialisent le traitement                                          |
| JSON invalide                           | try/catch interne de `reloadScopeFromDisk` conserve l'ancien état                                                  |
## Analyse des performances

- Au maximum 1 watcher par scope (≤ 2 au total), chacun à `depth: 0` — surcharge minimale des descripteurs de fichiers ; promotion/démotion des watchers d'échange, jamais d'empilement
- `depth: 0` signifie **pas de parcours récursif** de l'arborescence du projet, même pour le watcher bootstrap parent dans un grand monorepo. Le coût est limité aux enfants directs du répertoire parent : les modifications non liées de niveau supérieur réveillent chokidar pour un passage `readdir` + filtre `ignored` (`O(entrées de niveau supérieur)`) avant que l'événement ne soit supprimé — jamais de scan récursif
- Le délai de 300 ms garantit que les sauvegardes rapides de l'éditeur ne déclenchent pas plusieurs rechargements
- `reloadScopeFromDisk` utilise `readFileSync` synchrone, < 1 ms par appel
- La comparaison `JSON.stringify` est en O(n) mais les objets de paramètres font généralement moins de 10 Ko ; aucun stockage supplémentaire d'instantané n'est nécessaire
- La notification des écouteurs s'exécute en parallèle via `Promise.allSettled`
- Pas de scrutation — purement piloté par les événements

## Fichiers à créer/modifier

**Nouveaux fichiers** :

- `packages/cli/src/config/settingsWatcher.ts` — classe watcher
- `packages/cli/src/config/settingsWatcher.test.ts` — tests unitaires

**Fichiers modifiés** :

- `packages/core/src/config/config.ts` — ajouter le champ `settingsWatcher` à `ConfigParameters`, appeler `stopWatching()` avant la vérification `initialized` dans `Config.shutdown()`
- `packages/cli/src/config/config.ts` (`loadCliConfig`) — ajouter un paramètre optionnel pour passer `settingsWatcher`
- `packages/cli/src/gemini.tsx` — instanciation du watcher + câblage

**Aucune modification nécessaire** : `packages/cli/src/config/settings.ts` (la différence sémantique est autonome et ne nécessite aucune coopération de `LoadedSettings`)

## Plan de test

### Tests unitaires (`settingsWatcher.test.ts`)

Mocker chokidar (en réutilisant le modèle de mock de `skill-manager.test.ts`) :

1. **Cycle de vie** : `startWatching` crée les watchers, `stopWatching` ferme les watchers, les deux sont idempotents
2. **Filtrage des chemins** : Seuls les événements de nom de base `settings.json` déclenchent un rafraîchissement ; les fichiers `.tmp`/`.orig`/autres sont ignorés
3. **Délai de temporisation** : Plusieurs événements rapides fusionnent en un seul rechargement (`vi.useFakeTimers()`)
4. **Différence sémantique** : Contenu inchangé → écouteur non appelé ; contenu modifié → écouteur appelé avec les événements corrects
5. **Suppression auto-écriture** : Les événements du watcher déclenchés par `setValue()` sont naturellement filtrés par une différence identique
6. **Sérialisation** : Les nouveaux événements pendant `handleChange` sont accumulés, vidés après la fin du traitement
7. **Isolation des erreurs** : Les erreurs de chokidar ne plantent pas ; les exceptions d'écouteur n'affectent pas les autres écouteurs ; les échecs de `reloadScopeFromDisk` sont interceptés
8. **Délai d'expiration de l'écouteur** : Protection de temporisation de 30 s
9. **Surveillance paresseuse des répertoires** : lorsque `.qwen` est manquant, `mkdirSync` n'est jamais appelé ; un watcher bootstrap est armé sur le parent et son prédicat `ignored` n'autorise que l'entrée `.qwen`
10. **Promotion / TOCTOU** : L'apparition de `.qwen` (via `addDir` ou la revérification post-arm) ferme le watcher bootstrap et ouvre un watcher cible sur `.qwen` + planifie un rafraîchissement
11. **Démotion / recréation** : La suppression de `.qwen` (`unlinkDir`) rebootstrap sur le parent ; une recréation ultérieure repromotionne
12. **Protection de génération** : Un callback obsolète d'un watcher bootstrap déjà fermé ne crée pas un deuxième watcher cible

### Vérification de régression

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### Vérification manuelle

Modifier `~/.qwen/settings.json` pendant une session en cours et observer la sortie du journal de débogage pour les événements de modification.

---

## Sous-tâche de suivi : supprimer les événements pour les paramètres nécessitant un redémarrage et les paramètres sensibles

> **Statut : porte de suppression implémentée ; deux modifications de schéma
> toujours en attente de recherche.** La sous-tâche 1 ci-dessus émettait un seul
> `SettingsChangeEvent` par scope pour tout changement sémantique. Ce suivi
> ajoute un filtre pour que les changements limités aux paramètres qui ne peuvent
> pas vraiment prendre effet sans redémarrage — ou qui sont sensibles
> (informations d'identification) — **ne** notifient **pas** les écouteurs.
>
> - **Fait :** la porte de suppression basée sur `requiresRestart` dans
>   `SettingsWatcher.handleChange()` ainsi que les tests unitaires (voir
>   Mécanisme ci-dessous).
> - **En attente :** les deux corrections de schéma `requiresRestart`
>   (`modelProviders` → `true`, `permissions.*` → garder rechargeable à chaud),
>   chacune conditionnée par la vérification préalable du chemin de lecture
>   d'exécution.

### Motivation

Certains paramètres sont lus exactement une fois lors du démarrage du processus (`Config.initialize()`,
construction du générateur de contenu/client, lancement de processus enfant, indicateurs d'exécution Node).
Exemples explicitement mentionnés par l'utilisateur : **tokens API, `env`, et fournisseurs de modèles**.
Émettre un événement de rechargement à chaud pour ceux-ci est activement trompeur — l'écouteur
« rechargerait » mais la nouvelle valeur ne s'appliquerait pas vraiment tant que l'utilisateur
ne redémarre pas `qwen-code`. Les valeurs sensibles (informations d'identification) ne devraient
en outre pas être reconnectées via une session en cours.

### Décision : réutiliser le drapeau `requiresRestart` du schéma (source unique de vérité)

`settingsSchema.ts` déclare déjà `requiresRestart: boolean` sur **chaque** clé,
et `packages/cli/src/utils/settingsUtils.ts` expose déjà les recherches :
- `requiresRestart(key: string): boolean` — indicateur pour une clé dot-path
- `getFlattenedSchema()` — carte aplatie complète `clé → définition`
- `getRestartRequiredSettings()` — toutes les clés avec `requiresRestart: true`

Nous allons **réutiliser cet indicateur comme signal de suppression** plutôt que de maintenir une liste noire distincte rédigée à la main (qui dériverait inévitablement du schéma). `requiresRestart: true` signifie déjà exactement « ne prendra effet qu'après un redémarrage », ce qui est précisément la condition dans laquelle un événement doit être supprimé.

### Mécanisme (implémenté dans `SettingsWatcher.handleChange()`)

L'ancienne barrière effectuait un diff `JSON.stringify` sur l'ensemble du fichier et ne pouvait pas dire _quelles_ clés avaient changé. Elle est remplacée par un diff au niveau des feuilles + une classification par clé :

1. **`collectChangedKeys(before, after)`** prend un instantané de l'état en mémoire avant le rechargement (`structuredClone`), puis parcourt avant/après et collecte le dot-path de chaque feuille dont la valeur diffère. Les objets simples sont parcourus récursivement ; les tableaux et les primitives sont comparés dans leur ensemble (ce qui correspond aux clés de type tableau du schéma comme `permissions.allow`). Les clés ajoutées/supprimées apparaissent comme des feuilles modifiées, ce qui couvre la création/suppression de fichier sans vérification d'existence séparée.
2. **`isRestartRequiredKey(path)`** résout chaque chemin modifié par rapport au schéma en utilisant la **clé de schéma la plus longue qui est un préfixe de (ou égale à)** le chemin. Les paramètres d'objet libre (`env`, `modelProviders`) sont des clés de schéma de type feuille, donc `env.FOO` est résolu vers la définition `env`. Les clés inconnues sont considérées par défaut comme ne nécessitant pas de redémarrage, donc une modification que nous ne pouvons pas classer n'est jamais supprimée silencieusement.
3. La portée notifie **uniquement si au moins une clé modifiée est rechargable à chaud** (`!isRestartRequiredKey`). Si toutes les clés modifiées nécessitent un redémarrage, la portée ne produit aucun événement.

La forme de `SettingsChangeEvent` reste inchangée (toujours `{ scope, path, changeType }`) ; le fait de porter les clés modifiées restantes sur l'événement est laissé comme une amélioration future possible. La suppression d'auto-écriture (diff vide → aucun événement), le debounce, la sérialisation et le comportement de timeout d'écouteur sont tous inchangés.

### Deux ajustements de schéma à rechercher et appliquer

Ces deux valeurs de `requiresRestart` doivent être corrigées pour que l'approche de réutilisation se comporte comme prévu. **Chacune nécessite de vérifier le chemin de lecture réel au moment de l'exécution avant d'inverser l'indicateur.**

1. **`modelProviders`: `false` → `true`** (`settingsSchema.ts:294`)
   - Actuellement marqué `requiresRestart: false`, donc avec l'approche de réutilisation il ne serait _pas_ supprimé — ce qui contredit l'exigence que les changements de fournisseur ne soient pas rechargés à chaud.
   - La configuration du fournisseur (y compris `apiKey` / `baseUrl` par fournisseur) est consommée lorsque le client de modèle / générateur de contenu est construit au démarrage.
   - **Point de recherche :** confirmer qu'il n'y a pas de relecture au runtime de `modelProviders` (rechercher la construction client / générateur de contenu). Résultat attendu : le `false` est un bug latent ; inverser à `true`.

2. **`permissions.*`: garder rechargeable à chaud** (`settingsSchema.ts:1560`, tout le sous-arbre actuellement `requiresRestart: true`)
   - Les règles d'autorisation (`deny > ask > allow`) sont évaluées par appel d'outil et sont censées être les paramètres que les utilisateurs souhaitent le plus voir prendre effet immédiatement.
   - Tout le sous-arbre `permissions` a `showInDialog: false`, donc son indicateur `requiresRestart` n'a actuellement **aucune signification dans l'interface utilisateur** — fort indice que le `true` était une valeur par défaut plutôt qu'une décision délibérée de « nécessite un redémarrage », donc le rayon d'impact de son inversion est faible.
   - **Point de recherche :** confirmer que le runtime relit les permissions en direct (par ex. via `config.getXxx()` au moment de l'évaluation) plutôt qu'à partir d'un instantané de démarrage. Si confirmé, définir le sous-arbre `permissions` à `requiresRestart: false` afin qu'il ne soit **pas** supprimé par le mécanisme de réutilisation.

> Remarque : étant donné que `requiresRestart` est également affiché dans l'interface utilisateur des paramètres / les invites de redémarrage, inverser ces indicateurs modifie également ce comportement. C'est acceptable et sans doute plus correct, mais doit être mentionné dans la description de la PR.

### Acceptation

- Une modification touchant uniquement des clés nécessitant un redémarrage/sensibles (`security.auth.*`, `env`, `modelProviders`, `mcpServers`, `proxy`, …) n'émet **aucun** `SettingsChangeEvent`.
- Une modification d'une clé rechargeable à chaud (`ui.*`, `model.name`, `permissions.*` une fois inversé, …) émet toujours un événement.
- Une modification mixte (une clé nécessitant un redémarrage + une clé rechargeable à chaud) émet toujours un événement (la partie rechargeable à chaud doit légitimement être rafraîchie).
- Une modification d'une clé inconnue (hors schéma) émet toujours, plutôt que d'être supprimée silencieusement.

État des tests :

- **Fait** — le bloc `restart-required suppression` de `settingsWatcher.test.ts` couvre les cas tout-supprimé (`env`, `security.auth.apiKey`), tout-autorisé (`ui.theme`), mixte et clé inconnue.
- **En attente (avec les inversions de schéma)** — les assertions de `settingsSchema.test.ts` fixant les deux valeurs corrigées de `requiresRestart`, et un test du watcher affirmant que `permissions.*` n'est plus supprimé une fois inversé.
