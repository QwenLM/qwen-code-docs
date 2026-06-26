# Conception de l'interface de détection d'inactivité du Daemon

## Contexte

### Problème

Qwen Daemon est déployé sur plusieurs machines en tant que service longue durée. Lorsque le Daemon reste longtemps sans exécuter de tâche, continuer à occuper les ressources de la machine est un gaspillage. Le planificateur externe (K8s HPA / Scaler personnalisé) a besoin d'un signal fiable pour déterminer si le Daemon est inactif, afin de procéder à une réduction de capacité (scale-in) et à un recyclage.

### État actuel

Interfaces actuellement disponibles :

| Interface                       | Informations retournées                         | Limites                                                                                   |
| ------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /health?deep=true`         | `{ sessions, pendingPermissions }`              | Seulement le nombre de sessions, impossible de distinguer « session active mais inactive » et « session en cours de travail » |
| `GET /workspace/:cwd/sessions`  | `hasActivePrompt` + `clientCount` par session   | Nécessite une requête supplémentaire, et ne fournit pas d'information temporelle (depuis combien de temps inactif ?) |

**Absences clés** :

1. Aucun indicateur agrégé de « prompt actif ou non »
2. Aucune « date de dernière activité », le système externe doit maintenir sa propre machine d'état pour calculer la durée d'inactivité
3. Aucune exposition du nombre de connexions SSE (le compteur interne `activeSseCount` existe mais n'est pas retourné par `/health`)
4. Aucune exposition de l'état de vie du channel (processus fils agent)

## Objectifs de conception

Fournir une interface permettant de juger l'inactivité **en un seul appel HTTP**, répondant aux exigences suivantes :

- Le planificateur externe peut déterminer en un seul GET si le Daemon peut être recyclé
- Prise en charge de la dimension temporelle (depuis combien de temps inactif), évitant au planificateur de maintenir un état
- Rétrocompatibilité avec le comportement existant de `/health`
- Aucune dépendance supplémentaire, utilisation de l'état interne existant

## Solution

### Enrichir la réponse de `GET /health?deep=true`

Ajouter les champs suivants à la réponse existante de `/health?deep=true` :

```jsonc
// GET /health?deep=true
{
  "status": "ok",

  // --- Champs existants (inchangés) ---
  "sessions": 2,
  "pendingPermissions": 0,

  // --- Nouveaux champs ---
  "activePrompts": 1, // Nombre de sessions exécutant actuellement un prompt
  "connectedClients": 3, // Nombre de connexions SSE actives
  "channelAlive": true, // Le processus fils agent est-il en vie
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // Horodatage de la dernière activité (ISO 8601)
  "idleSinceMs": 120000, // Nombre de millisecondes écoulées depuis la dernière activité
}
```

### Définition des champs

| Champ                | Type              | Sémantique                                                                               |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `activePrompts`      | `number`          | Nombre de sessions dont `promptActive === true`                                          |
| `connectedClients`   | `number`          | Nombre actuel de connexions SSE actives (`activeSseCount` déjà existant)                 |
| `channelAlive`       | `boolean`         | Le processus fils agent est-il en vie (`bridge.isChannelLive()` déjà existant)           |
| `lastActivityAt`     | `string \| null`  | Horodatage ISO du dernier début ou achèvement d'un prompt ; `null` si aucun prompt depuis le démarrage du daemon |
| `idleSinceMs`        | `number \| null`  | `Date.now() - lastActivityAt` ; `null` s'il n'y a aucun enregistrement d'activité       |

### Définition de l'« activité »

Les événements suivants sont considérés comme une « activité » et mettent à jour `lastActivityAt` :

- Début d'exécution d'un prompt (`promptActive` passe de false → true)
- Fin/échec d'un prompt (`promptActive` passe de true → false)
- Création d'une nouvelle session (`spawnOrAttach` réussi)
- Reprise/chargement d'une session (`loadSession` / `resumeSession` réussi)

Les événements suivants **ne sont pas** considérés comme une activité (pour éviter les faux positifs) :

- Connexion/déconnexion SSE
- Heartbeat
- La requête `/health` elle-même
- Requête/réponse de permission

### Règle de jugement d'inactivité (à titre de référence pour le planificateur externe)

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """Condition de recyclage suggérée : inactivité dépassant le seuil (par défaut 5 minutes)"""
    if health["activePrompts"] > 0:
        return False  # Des tâches en cours
    if health["connectedClients"] > 0:
        return False  # Des clients connectés
    if health["idleSinceMs"] is None:
        # Jamais eu d'activité — daemon froid venant de démarrer
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## Modifications de code concernées

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

Ajouter dans l'interface `AcpSessionBridge` :

```typescript
/** Nombre de sessions exécutant actuellement un prompt */
get activePromptCount(): number;

/** Horodatage de la dernière activité (ms epoch), null si aucune activité */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

Dans la fonction fabrique `createAcpSessionBridge` :

```typescript
// Nouveau suivi d'état
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

Appeler `touchActivity()` aux endroits suivants :

- `entry.promptActive = true` (ligne ~2528) — début de prompt
- `entry.promptActive = false` (lignes ~2551, 2559) — fin de prompt
- Après la création réussie d'une session par `doSpawn` (vers ligne ~1906)
- Après la réussite de `restoreSession`

Exposer dans l'objet retourné :

```typescript
get activePromptCount() {
  let count = 0;
  for (const entry of byId.values()) {
    if (entry.promptActive) count++;
  }
  return count;
},

get lastActivityAt() {
  return lastActivityTimestamp;
},
```

### 3. `packages/cli/src/serve/server.ts`

Modifier la branche `deep` dans `healthHandler` (ligne ~803) :

```typescript
const healthHandler = (req: Request, res: Response): void => {
  const deepQuery = req.query['deep'];
  const deep = deepQuery === '1' || deepQuery === 'true' || deepQuery === '';
  if (!deep) {
    res.status(200).json({ status: 'ok' });
    return;
  }
  try {
    const lastActivityAt = bridge.lastActivityAt;
    const now = Date.now();
    res.status(200).json({
      status: 'ok',
      // existants
      sessions: bridge.sessionCount,
      pendingPermissions: bridge.pendingPermissionCount,
      // nouveaux
      activePrompts: bridge.activePromptCount,
      connectedClients: getActiveSseCount(),
      channelAlive: bridge.isChannelLive(),
      lastActivityAt:
        lastActivityAt !== null ? new Date(lastActivityAt).toISOString() : null,
      idleSinceMs: lastActivityAt !== null ? now - lastActivityAt : null,
    });
  } catch (err) {
    writeStderrLine(
      `qwen serve: /health deep probe failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    res.status(503).json({ status: 'degraded' });
  }
};
```

### 4. `packages/cli/src/serve/server.test.ts`

Ajouter des cas de test couvrant :

- Exactitude des nouveaux champs retournés par `/health?deep=true`
- `activePrompts === 0` et `idleSinceMs === null` en l'absence de session
- `activePrompts > 0` et `idleSinceMs` mis à jour en continu pendant l'exécution d'un prompt
- `idleSinceMs` commence à augmenter après la fin du prompt

### 5. `packages/acp-bridge/src/bridge.test.ts`

Ajouter des cas de test couvrant :

- Valeurs de `activePromptCount` au cours du cycle de vie d'un prompt
- `lastActivityAt` est mis à jour après chaque événement d'activité
- Cumul correct de `activePromptCount` en cas de sessions parallèles

## Liste des fichiers modifiés

| Fichier                                      | Type de modification         | Description                                                                   |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts`     | Extension d'interface        | Ajout des propriétés `activePromptCount`, `lastActivityAt`                    |
| `packages/acp-bridge/src/bridge.ts`          | Implémentation logique       | Ajout du suivi de `lastActivityTimestamp` + getter                            |
| `packages/cli/src/serve/server.ts`           | Extension de réponse HTTP    | Ajout des nouveaux champs dans `/health?deep=true`                            |
| `packages/cli/src/serve/server.test.ts`      | Tests                        | Couverture des nouveaux champs de l'interface health                           |
| `packages/acp-bridge/src/bridge.test.ts`     | Tests                        | Couverture des nouvelles propriétés du bridge                                  |

## Compatibilité

- **Rétrocompatibilité** : les nouveaux champs sont ajoutés, aucun champ existant n'est modifié ou supprimé
- **`GET /health` (non deep)** : comportement inchangé, retourne uniquement `{ "status": "ok" }`
- **Gauge OTel** : le callback `registerDaemonGaugeCallbacks` existant pourra éventuellement être étendu avec une gauge `activePrompts`, mais cela ne fait pas partie de cette itération

## Extensions futures (hors périmètre actuel)

1. **Arrêt automatique** : paramètre `--auto-shutdown-idle-ms` intégré au daemon pour qu'il se termine tout seul après un temps d'inactivité (adapté aux scénarios systemd/Pod K8s)
2. **Exposition de métriques OTel** : enregistrer `activePrompts` et `idleSinceMs` comme gauges dans le compteur OTel
3. **Callback Webhook** : envoyer un événement au système externe quand le seuil d'inactivité est dépassé