# Conception de l'interface de détection d'inactivité du Daemon

## Contexte

### Problème

Qwen Daemon est déployé sur plusieurs machines en tant que service longue durée. Lorsque le Daemon n'exécute aucune tâche pendant une longue période, continuer à occuper les ressources de la machine est un gaspillage. Un ordonnanceur externe (K8s HPA / Scaler personnalisé) a besoin d'un signal fiable pour déterminer si le Daemon est inactif, afin de procéder à une réduction d'échelle et à une libération des ressources.

### Situation actuelle

Interfaces actuellement disponibles :

| Interface                        | Informations retournées                               | Limitations                                                                                  |
| -------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /health?deep=true`          | `{ sessions, pendingPermissions }`                    | Uniquement le nombre de sessions, impossible de distinguer "session inactive" et "session active" |
| `GET /workspace/:cwd/sessions`   | `hasActivePrompt` + `clientCount` pour chaque session | Nécessite une requête supplémentaire, et aucune information temporelle (inactivité depuis combien de temps ?) |

**Manques essentiels** :

1. Pas d'indicateur agrégé "présence d'un prompt actif"
2. Pas d'horodatage de dernière activité, le système externe doit maintenir une machine d'état pour calculer la durée d'inactivité
3. Pas d'exposition du nombre de connexions SSE (déjà maintenu en interne avec `activeSseCount`, mais non retourné par `/health`)
4. Pas d'exposition de l'état de vie du channel (processus fils agent)

## Objectifs de conception

Fournir une interface qui permet de **déterminer l'inactivité en un seul appel HTTP**, répondant aux exigences :

- L'ordonnanceur externe peut juger une éligibilité à la libération en un seul GET
- Prendre en compte la dimension temporelle (durée d'inactivité), évitant une maintenance externe de l'état
- Rétrocompatible avec le comportement actuel de `/health`
- Aucune dépendance supplémentaire, utilisation des états internes existants

## Proposition

### Enrichissement de la réponse `GET /health?deep=true`

Ajout de champs dans la réponse existante de `/health?deep=true` :

```jsonc
// GET /health?deep=true
{
  "status": "ok",

  // --- Champs existants (inchangés) ---
  "sessions": 2,
  "pendingPermissions": 0,

  // --- Nouveaux champs ---
  "activePrompts": 1, // Nombre de sessions en cours d'exécution d'un prompt
  "connectedClients": 3, // Nombre de connexions SSE actives
  "channelAlive": true, // Le processus fils agent est-il vivant
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // Horodatage de la dernière activité (ISO 8601)
  "idleSinceMs": 120000, // Millisecondes écoulées depuis la dernière activité
}
```

### Définition des champs

| Champ               | Type             | Sémantique                                                                             |
| ------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `activePrompts`     | `number`         | Nombre de sessions où `promptActive === true` actuellement                             |
| `connectedClients`  | `number`         | Nombre de connexions SSE actives (déjà présent sous `activeSseCount`)                  |
| `channelAlive`      | `boolean`        | Le processus fils agent est-il vivant (déjà présent sous `bridge.isChannelLive()`)     |
| `lastActivityAt`    | `string \| null` | Horodatage ISO de la dernière début ou fin de prompt ; `null` si aucun prompt depuis le démarrage du daemon |
| `idleSinceMs`       | `number \| null` | `Date.now() - lastActivityAt` ; `null` si aucune activité enregistrée                 |

### Définition de "activité"

Les événements suivants sont considérés comme une "activité" et mettent à jour `lastActivityAt` :

- Début d'exécution d'un prompt (`promptActive` passe de false à true)
- Fin/échec d'un prompt (`promptActive` passe de true à false)
- Création d'une nouvelle session (`spawnOrAttach` réussi)
- Reprise/chargement d'une session (`loadSession` / `resumeSession` réussi)

Ne **sont pas** considérés comme activité (pour éviter les erreurs de jugement) :

- Connexion/déconnexion SSE
- Heartbeat
- Requête `/health` elle-même
- Requête/réponse de permission

### Règle de jugement d'inactivité (à titre de référence pour l'ordonnanceur externe)

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """Condition suggérée pour libération : inactivité dépassant le seuil (défaut 5 minutes)"""
    if health["activePrompts"] > 0:
        return False  # Tâche en cours
    if health["connectedClients"] > 0:
        return False  # Clients connectés
    if health["idleSinceMs"] is None:
        # Jamais eu d'activité — daemon froid venant de démarrer
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## Modifications de code concernées

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

Ajouter dans l'interface `AcpSessionBridge` :

```typescript
/** Nombre de sessions en cours d'exécution d'un prompt */
get activePromptCount(): number;

/** Dernier horodatage d'activité (ms epoch), null si aucune activité */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

Dans la fonction factory `createAcpSessionBridge` :

```typescript
// Nouveau suivi d'état
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

Appeler `touchActivity()` aux endroits suivants :

- `entry.promptActive = true` (~ ligne 2528) — début de prompt
- `entry.promptActive = false` (~ lignes 2551, 2559) — fin de prompt
- après la création réussie d'une session dans `doSpawn` (~ autour de la ligne 1906)
- après la réussite de `restoreSession`

Exposer dans l'objet retourné :

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

Modifier la branche `deep` dans `healthHandler` (~ ligne 803) :

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
      // Existants
      sessions: bridge.sessionCount,
      pendingPermissions: bridge.pendingPermissionCount,
      // Nouveaux
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

Nouveaux cas de test couvrant :

- L'exactitude des nouveaux champs retournés par `/health?deep=true`
- `activePrompts === 0` et `idleSinceMs === null` lorsqu'aucune session n'est active
- Pendant l'exécution d'un prompt : `activePrompts > 0` et `idleSinceMs` rafraîchi en continu
- Après la fin d'un prompt : `idleSinceMs` commence à augmenter

### 5. `packages/acp-bridge/src/bridge.test.ts`

Nouveaux cas de test couvrant :

- L'évolution de `activePromptCount` pendant le cycle de vie d'un prompt
- Le rafraîchissement de `lastActivityAt` après chaque événement d'activité
- L'accumulation correcte de `activePromptCount` lors de sessions parallèles multiples

## Liste des fichiers modifiés

| Fichier                                     | Type de modification | Description                                          |
| ------------------------------------------- | -------------------- | ---------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts`    | Extension d'interface | Ajout des propriétés `activePromptCount`, `lastActivityAt` |
| `packages/acp-bridge/src/bridge.ts`         | Implémentation logique | Ajout du suivi `lastActivityTimestamp` + getter       |
| `packages/cli/src/serve/server.ts`          | Extension de réponse HTTP | `/health?deep=true` ajoute de nouveaux champs         |
| `packages/cli/src/serve/server.test.ts`     | Tests                | Couverture des nouveaux champs de l'endpoint health   |
| `packages/acp-bridge/src/bridge.test.ts`    | Tests                | Couverture des nouvelles propriétés du bridge         |

## Compatibilité

- **Rétrocompatible** : les nouveaux champs sont ajoutés, aucun champ existant n'est modifié ou supprimé.
- **`GET /health` (non deep)** : comportement inchangé, retourne toujours `{ "status": "ok" }`.
- **OTel Gauge** : les `registerDaemonGaugeCallbacks` existants pourront éventuellement être étendus pour ajouter un gauge `activePrompts`, mais cela ne fait pas partie du périmètre actuel.

## Extensions futures (hors périmètre actuel)

1. **Arrêt automatique** : paramètre `--auto-shutdown-idle-ms` intégré au daemon pour se terminer automatiquement après une période d'inactivité (adapté aux scénarios systemd/K8s Pod).
2. **Exposition de métriques OTel** : enregistrement de `activePrompts` et `idleSinceMs` en tant que gauges dans le compteur OTel.
3. **Callback Webhook** : envoi proactif d'événements à un système externe lorsque le seuil d'inactivité est dépassé.
