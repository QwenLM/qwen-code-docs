# Télémétrie : Attributs de ressource personnalisés + Contrôles de cardinalité des métriques

> Issue associée : [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> Issue parente : [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> Basé sur la revue de code de la branche main de qwen-code au 2026-05-21

## 1. Contexte

qwen-code est déjà intégré au SDK OpenTelemetry, mais la manière dont la Resource est construite le rend inutilisable dans deux scénarios de production courants :

1. **Impossibilité d'ajouter des dimensions personnalisées** : L'équipe ops souhaite ajouter des tags `team` / `env` / `cost_center` / `user_id` à toutes les données de télémétrie, mais il n'existe actuellement aucun mécanisme pour le faire. Même la définition de la variable d'environnement standard `OTEL_RESOURCE_ATTRIBUTES` **ne fonctionne pas du tout**.
2. **Perte de contrôle de la cardinalité des métriques** : `session.id` est injecté au niveau de la Resource, ce qui l'attache automatiquement à chaque point de données métrique. Chaque session CLI génère une nouvelle valeur, ce qui peut saturer le backend de métriques (Prometheus / Alibaba Cloud ARMS Metric / VictoriaMetrics) avec des séries temporelles illimitées.

Ces deux problèmes sont couplés : résoudre le premier permettrait aux utilisateurs **d'ajouter plus facilement** des champs à haute cardinalité aux données, il est donc indispensable de fournir le second en parallèle.

## 2. État actuel

### 2.1 Construction de la Resource

`packages/core/src/telemetry/sdk.ts:156-161` :

```ts
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  'session.id': config.getSessionId(),
});
```

`sdk.ts:274-278` :

```ts
sdk = new NodeSDK({
  resource,
  // Désactive les détecteurs asynchrones de ressources hôte/processus/environnement : ils laissent les attributs
  // en attente et déclenchent une erreur OTel diag.error lors de toute lecture d'attribut de ressource
  // avant la stabilisation des détecteurs (par exemple lors de la création d'une span HttpInstrumentation).
  autoDetectResources: false,
  ...
});
```

`autoDetectResources: false` désactive le `envDetector` standard d'OTel — celui qui lit normalement `OTEL_RESOURCE_ATTRIBUTES` et `OTEL_SERVICE_NAME`. Cela se justifie (les détecteurs sont asynchrones, ils déclenchent `diag.error` avant de se stabiliser), mais l'effet secondaire est que ces deux variables d'environnement standard sont **totalement inopérantes** dans qwen-code.

### 2.2 `session.id` est en fait injecté trois fois

| Emplacement                   | Ligne                     | Impact                                  |
| ----------------------------- | ------------------------- | --------------------------------------- |
| Resource                      | `sdk.ts:160`              | Tous les signaux (spans / logs / métriques) |
| Par span                      | `session-tracing.ts:169`  | spans                                   |
| Par log                       | `loggers.ts:128`          | logs                                    |
| **`getCommonAttributes()`**   | `metrics.ts:57`           | **Ajouté explicitement à chaque enregistrement métrique** |

Cela signifie que **retirer simplement `session.id` de la Resource ne suffit pas** — `baseMetricDefinition.getCommonAttributes()` de `metrics.ts:57` est utilisé par plus de 30 points d'appel de métriques via `...spread`, réinsérant `session.id`.

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

Bonnes nouvelles : tous les points d'appel de métriques (30+) passent par cette unique fonction, ce qui constitue un point de passage naturel.

### 2.3 Mode de résolution de la configuration

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` utilise une chaîne de priorité unifiée :

```
argv (plus haute)  >  variables QWEN_*  >  variables OTEL_*  >  settings.json (plus basse)
```

Les nouveaux champs suivront ce même motif.

### 2.4 État actuel du schéma de paramètres

`packages/cli/src/config/settingsSchema.ts:998-1018` définit le schéma JSON de `telemetry` :

```ts
telemetry: {
  type: 'object',
  // ...
  jsonSchemaOverride: {
    type: 'object',
    properties: {
      includeSensitiveSpanAttributes: { ... },
    },
    additionalProperties: true,  // ← aujourd'hui, les autres clés telemetry.* ne sont pas validées
  },
}
```

`additionalProperties: true` signifie qu'actuellement le schéma n'applique aucune validation aux autres champs comme `otlpEndpoint` / `otlpProtocol` / `resourceAttributes`. Lors de l'ajout des nouveaux champs `resourceAttributes` / `metrics`, il faudra mettre à jour le schéma en conséquence pour faciliter l'autocomplétion dans l'IDE et le rendu dans l'interface des paramètres.

### 2.5 Chemins de code hors du périmètre de conception

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` est le **canal de remontée propriétaire** de qwen-code (basé sur le protocole interne Alibaba RUM `RumResourceEvent`), totalement indépendant du SDK OTel. Il possède son propre endpoint, proxy et modèle de données, **et n'est pas concerné par cette conception**. Voir section 3.

### 2.6 Variables d'environnement `OTEL_*` supportées / non supportées

| Variable d'environnement                               | État actuel                     |
| ------------------------------------------------------ | ------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                          | ✅ Supporté (`config.ts:79`)   |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT`    | ✅ Supporté                    |
| `OTEL_EXPORTER_OTLP_HEADERS`                           | ✅ Lu directement par l'exporteur sous-jacent |
| `OTEL_TRACES_SAMPLER`                                  | ✅ Supporté (`tracer.ts:247`)  |
| **`OTEL_RESOURCE_ATTRIBUTES`**                         | ❌ Pas du tout supporté        |
| **`OTEL_SERVICE_NAME`**                                | ❌ Pas du tout supporté        |
| **`OTEL_METRICS_INCLUDE_*`**                           | ❌ Pas du tout supporté (style claude-code) |

## 3. Objectifs / Non-objectifs

### 3.1 Objectifs

- Permettre aux ops d'ajouter des attributs de ressource personnalisés à tous les spans / logs / métriques exportés via OTLP, en utilisant la variable d'environnement standard `OTEL_RESOURCE_ATTRIBUTES` et leur propre `settings.json`
- Faire en sorte que `OTEL_SERVICE_NAME` fonctionne conformément à la spécification OTel (y compris la priorité avec `service.name` dans `OTEL_RESOURCE_ATTRIBUTES`)
- Par défaut, les métriques **ne portent pas** `session.id` (protection de la cardinalité du backend)
- Fournir un commutateur explicite pour les utilisateurs qui ont besoin d'une corrélation au niveau métrique avec la session
- Conserver `session.id` sur les spans et les logs (corrélation de traces obligatoire)
- Conserver `autoDetectResources: false`, sans régresser le bug `diag.error` déjà corrigé
- Mettre à jour `settingsSchema.ts` en conséquence pour que les nouveaux champs soient visibles dans l'interface des paramètres et dans l'IDE

### 3.2 Non-objectifs

- **Remontée propriétaire `qwen-logger`** : Canal RUM totalement indépendant, hors périmètre de cette conception. Ses champs de remontée (device id, user agent, etc.) sont dictés par le protocole RUM et ne doivent pas être perturbés par des attributs de ressource utilisateur. Si à l'avenir on souhaite ajouter des dimensions personnalisées à `qwen-logger`, cela fera l'objet d'une conception distincte.
- **Hook d'attributs dynamiques par span** : Permettre à l'utilisateur d'écrire du code / un hook pour calculer des attributs par span. claude-code n'a pas non plus résolu ce point, la complexité est élevée pour un faible bénéfice.
- **Contrôle de cardinalité `service.version`** : La fréquence de changement de version est limitée (mensuelle), la croissance des séries temporelles est maîtrisable. Si nécessaire, passer en v2 avec l'API OTel View.
- **Attributs de ressource par requête sous forme de SDK Agent** : qwen-code n'a actuellement aucun scénario d'appel SDK.
- **Configuration des en-têtes de requête OTLP (auth headers)** : C'est une autre ligne d'issue (#3731 P1), indépendante de cette conception.
- **Attributs de ressource sous forme de flag CLI** : Les variables d'environnement et settings.json couvrent déjà les scénarios temporaires et de base ; un flag CLI alourdirait la ligne de commande sans gain significatif.
## 4. Conception

### 4.1 Couches générales

```
┌─ Resource（sdk.ts:156）────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                      │
│                          > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                          > 'qwen-code'                         │
│   service.version     ← config.getCliVersion()  [réservé]      │
│   ...user attrs       ← OTEL_RESOURCE_ATTRIBUTES               │
│                          + settings.resourceAttributes         │
│   ✗ session.id retiré                                          │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id（session-tracing.ts:169, conservé）
       ├──→ Logs      ＋ session.id（loggers.ts:128, conservé）
       └──→ Metrics   ＋ getCommonAttributes() — défaut {}
                          activé: { session.id }
```

### 4.2 Priorité / Ordre de fusion

#### Attributs généraux

Bas → Haut :

1. `OTEL_RESOURCE_ATTRIBUTES` (variable d'environnement OTel standard)
2. `settings.telemetry.resourceAttributes`
3. Clés réservées internes (écrasent toute homonyme ci-dessus)

**Justification** : La variable d'environnement est une surcharge temporaire en ops (CI / débogage machine), settings.json est une ligne de base déployée sur le parc, les clés internes sont un contrat produit — la ligne de base doit avoir une priorité plus élevée que la variable temporaire, et les clés internes doivent primer sur tout.

#### Traitement spécial de `service.name`

`service.name` doit respecter la [spécification OTel](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/) :

> **`OTEL_SERVICE_NAME` prend le pas sur `service.name` défini avec la variable `OTEL_RESOURCE_ATTRIBUTES`.**

Donc pour `service.name`, on applique cette chaîne de priorité (haut → bas) :

1. `OTEL_SERVICE_NAME` (plus élevé, imposé par la spécification OTel standard)
2. `settings.resourceAttributes.service.name` (settings prime sur env, suivant la règle générale de cette conception)
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. Défaut interne `'qwen-code'`

`service.name` peut être surchargé via settings — c'est l'identité du service, et configurer le service.name via un fichier settings.json unifié pour une flotte d'entreprise est une pratique courante et raisonnable ; l'interdire bloquerait les scénarios de distribution GitOps. `OTEL_SERVICE_NAME`, en tant que canal de « priorité la plus élevée » défini par la spécification OTel standard, peut toujours surcharger temporairement les settings en CI ou en débogage machine.

Règles spécifiques :

| Source                                                    | Écriture dans `service.name` active ?      |
| --------------------------------------------------------- | ------------------------------------------ |
| `OTEL_SERVICE_NAME=foo`                                   | ✅ Priorité maximale (écrase toute autre source) |
| `settings.resourceAttributes={ "service.name": "foo" }`   | ✅ Uniquement si `OTEL_SERVICE_NAME` est absent |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`               | ✅ Uniquement si les deux ci-dessus sont absents |

### 4.3 Stratégie des clés réservées

| Clé                | L'utilisateur peut-il surcharger ?                                                                 | Justification                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `service.name`     | ✅ Via env var et settings (voir §4.2 chaîne de priorité)                                          | Identité du service, doit pouvoir être contrôlée par les ops                                           |
| `service.version`  | ❌ Toute source rejetée + avertissement                                                           | Fiabilité de la télémétrie — ne pas autoriser l'utilisateur à mentir sur la version                    |
| `session.id`       | ❌ Toute source rejetée + avertissement (sur métrique, un toggle contrôle l'injection runtime)     | Runtime uniquement ; l'écrire dans Resource contournerait le toggle de cardinalité des métriques (l'attribut Resource s'attache automatiquement à tous les signaux) |
| Préfixe `qwen.*`   | ⚠️ Non réservé de force, mais les docs recommandent de le réserver à l'usage interne du produit     | Éviter les conflits futurs entre attributs internes et utilisateur                                     |

**Les clés réservées sont maintenues dans une constante centralisée** :

```ts
// telemetry/resource-attributes.ts (nouveau fichier)
/** Keys that cannot be overridden from any source (env or settings). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` **n'est pas** dans la liste RESERVED — il suit sa propre chaîne de priorité (§4.2), il n'a pas la sémantique « interdiction globale de surcharge ». RESERVED signifie « toute source qui écrit ces clés est avertie et la valeur est rejetée », valable uniformément pour les deux points d'entrée env et settings.

### 4.4 Analyse de `OTEL_RESOURCE_ATTRIBUTES`

Implémentation synchrone, contournant l'envDetector asynchrone natif d'OTel :

```ts
function parseOtelResourceAttributes(
  raw: string | undefined,
): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      diag.warn(
        `Skipping malformed OTEL_RESOURCE_ATTRIBUTES entry: ${trimmed}`,
      );
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const valueRaw = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    let value: string;
    try {
      value = decodeURIComponent(valueRaw);
    } catch {
      diag.warn(
        `Invalid percent-encoding in OTEL_RESOURCE_ATTRIBUTES for key "${key}", using raw value`,
      );
      value = valueRaw;
    }
    out[key] = value; // duplicate keys: last wins (matches OTel reference impls)
  }
  return out;
}
```

Format strictement selon la spécification OTel : `key1=val1,key2=val2`, valeurs encodées en percent-encoding.

### 4.5 Filtre d'attributs pour les métriques

唯一改动点 dans `metrics.ts:55-59` :

```ts
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => {
    const out: Attributes = {};
    if (config.getTelemetryMetricsIncludeSessionId()) {
      out['session.id'] = config.getSessionId();
    }
    return out;
  },
};
```
Zéro changement aux points d'appel (30+) — étaler (`...spread`) un objet vide équivaut à ne développer aucun champ.

### 4.6 Cas limites et validation

| Entrée                                                           | Comportement                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (chaîne vide)                      | Retourne `{}`, démarrage normal                                           |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (sans `=`)                        | Ignore cet élément + `diag.warn`, continue le reste                       |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (clé vide)                     | Ignore cet élément, continue le reste                                     |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (valeur vide)                | `a=''`, `b='2'` (la spéc OTel autorise les valeurs vides)                 |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (encodage pourcent invalide) | Conserve le `val%ZZbad` original + `diag.warn`                            |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (clé dupliquée)             | Dernière écriture gagne `a=2` (conforme à l'implémentation de référence OTel) |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (avec espaces)            | Trim automatique                                                          |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                     | Supprime silencieusement `service.version` + `diag.warn`, conserve les autres clés |
| `settings.resourceAttributes={ "service.name": "x" }`            | Accepté (settings peut définir service.name, voir §4.2)                   |
| `settings.resourceAttributes={ "service.version": "x" }`         | Supprime silencieusement + `diag.warn`                                    |
| `settings.resourceAttributes={ "team": 123 }` (non string)       | Le type TypeScript le bloque ; lors de l'exécution, le validateur JSON schema de settings le refuse |
| Taille totale de la ressource > limite OTel (4 Ko ?)             | Géré par le SDK OTel sous-jacent, pas de validation à ce niveau |

**Pourquoi ne pas faire la validation des noms d'attribut à ce niveau** (comme le motif `[a-z][a-z0-9_.]*` recommandé par OTel) : Le SDK OTel valide lui-même lors de l'exportation, une validation redondante à ce niveau serait lente et risquerait de diverger du comportement du SDK. Nous faisons uniquement l'analyse syntaxique, pas la validation sémantique.

**La protection obligatoire des clés RÉSERVÉES s'applique aux deux entrées** :

```ts
// s'applique aux attributs parsés depuis l'env
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envAttrs[k];
  }
}

// s'applique aux attributs de settings
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in settingsAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes cannot override "${k}"; ignoring`,
    );
    delete settingsAttrs[k];
  }
}
```

### 4.7 Cycle de vie et multi-processus

- **Moment de l'initialisation du SDK** : La ressource est construite une fois pour toutes dans `initializeTelemetry()`, **immuable au sein d'un processus**. C'est cohérent avec la conception du SDK OTel.
- **Fork du subagent** : Les subagents de qwen-code sont dans le même processus (`subagent-runtime.ts`), ils partagent la ressource. Si à l'avenir on introduit des subagents inter-processus, le sous-processus **réinitialisera le SDK**, relira les variables d'env et les settings — tant que l'env est transmis, le comportement est identique.
- **Rechargement à chaud** : Une modification des settings **ne reconstruit pas la ressource**. L'opérateur doit redémarrer le CLI pour que cela prenne effet. La documentation doit le préciser clairement.
- **`refreshSessionContext()`** (`sdk.ts:306`) : Rafraîchit uniquement le contexte ALS de la session, **ne reconstruit pas la ressource** — car il n'y a plus de `session.id` sur la ressource (l'un des changements principaux de cette conception).

## 5. Modifications du schéma de configuration

### 5.1 Interface `TelemetrySettings` (`packages/core/src/config/config.ts:293`)

```ts
export interface TelemetrySettings {
  // ... existing fields
  /** Static resource attributes attached to every span/log/metric. */
  resourceAttributes?: Record<string, string>;
  /** Per-signal cardinality controls. */
  metrics?: {
    /** Include session.id on metric data points (default: false). */
    includeSessionId?: boolean;
  };
}
```

### 5.2 Accesseur `Config` (même fichier)

```ts
class Config {
  getTelemetryResourceAttributes(): Record<string, string> {
    return this.telemetrySettings.resourceAttributes ?? {};
  }
  getTelemetryMetricsIncludeSessionId(): boolean {
    return this.telemetrySettings.metrics?.includeSessionId ?? false;
  }
}
```

### 5.3 Nouveau contenu de `resolveTelemetrySettings()`

```ts
const envResourceAttrs = parseOtelResourceAttributes(
  env['OTEL_RESOURCE_ATTRIBUTES'],
);
const settingsResourceAttrs = { ...(settings.resourceAttributes ?? {}) };

// Strip RESERVED keys from both sources (warn if user tried to set them).
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envResourceAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envResourceAttrs[k];
  }
  if (k in settingsResourceAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes cannot override "${k}"; ignoring`,
    );
    delete settingsResourceAttrs[k];
  }
}

// Merge: env < settings (settings wins on conflict).
const merged: Record<string, string> = {
  ...envResourceAttrs,
  ...settingsResourceAttrs,
};

// service.name precedence: OTEL_SERVICE_NAME (env-only escape) wins over
// everything else. settings already overwrote env in the spread above.
if (env['OTEL_SERVICE_NAME']) {
  merged['service.name'] = env['OTEL_SERVICE_NAME'];
}

const resourceAttributes = merged;

const metricsIncludeSessionId =
  parseBooleanEnvFlag(env['QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID']) ??
  settings.metrics?.includeSessionId ??
  false;

return {
  // ... existing fields
  resourceAttributes,
  metrics: { includeSessionId: metricsIncludeSessionId },
};
```
### 5.4 Modifications de la construction de la ressource `sdk.ts`

```ts
const userAttrs = config.getTelemetryResourceAttributes();
// service.version est toujours intégré ; service.name transite via userAttrs
// (il était déjà résolu avec la priorité OTEL_SERVICE_NAME dans le résolveur).
const builtinServiceName = userAttrs['service.name'] ?? SERVICE_NAME;
const { 'service.name': _, 'service.version': __, ...nonReserved } = userAttrs;

const resource = resourceFromAttributes({
  ...nonReserved,
  [SemanticResourceAttributes.SERVICE_NAME]: builtinServiceName,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  // session.id délibérément PAS placé sur la ressource — cf. doc de conception §4.1
});
```

### 5.5 Modifications de `settingsSchema.ts`

Dans `packages/cli/src/config/settingsSchema.ts:998-1018`, ajouter à `telemetry.jsonSchemaOverride.properties` :

```ts
{
  // ... includeSensitiveSpanAttributes existant
  resourceAttributes: {
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Attributs de ressource statiques attachés à toutes les données de télémétrie. ' +
      'Les clés doivent être des chaînes ; les valeurs doivent être des chaînes. ' +
      'Les clés réservées (service.name, service.version) sont silencieusement ignorées.',
    default: {},
  },
  metrics: {
    type: 'object',
    additionalProperties: false,
    properties: {
      includeSessionId: {
        type: 'boolean',
        default: false,
        description:
          'Inclure session.id sur chaque point de donnée de métrique. ' +
          'ATTENTION : chaque session CLI crée une nouvelle valeur, provoquant un ' +
          'éventail infini de séries temporelles de métriques. Activer uniquement pour un débogage à court terme.',
      },
    },
  },
}
```

Il faut aussi réévaluer `additionalProperties: true` — actuellement permissif, on peut le garder ou le rendre strict. Il est recommandé de garder la permissivité pour éviter les changements cassants sur d'autres champs `telemetry.*` non déclarés dans le schéma, mais la documentation doit préciser que « les champs non déclarés sont ignorés ».

## 6. Liste des modifications de fichiers

| Fichier                                                           | Modification                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/core/src/telemetry/sdk.ts`                              | Modification de la construction de la ressource (fusion user attrs, suppression de `session.id`) |
| `packages/core/src/telemetry/resource-attributes.ts` (nouveau)    | `parseOtelResourceAttributes()` + constante `RESERVED_RESOURCE_ATTRIBUTE_KEYS` |
| `packages/core/src/telemetry/config.ts`                           | Le résolveur ajoute l'analyse et la fusion de `resourceAttributes` + `metrics.includeSessionId` |
| `packages/core/src/telemetry/metrics.ts`                          | `getCommonAttributes()` ajoute une porte de basculement                     |
| `packages/core/src/config/config.ts`                              | Schéma `TelemetrySettings` + deux getters                                   |
| `packages/cli/src/config/settingsSchema.ts`                       | `jsonSchemaOverride` ajoute `resourceAttributes` + `metrics`                |
| `docs/developers/development/telemetry.md`                        | Ajout des sections « Resource attributes » + « Cardinality controls » + note de migration + exemples |
| `packages/core/src/telemetry/resource-attributes.test.ts` (nouveau) | Tests unitaires du parseur (couvrant tous les cas §4.6)                     |
| `packages/core/src/telemetry/sdk.test.ts`                         | Priorité de fusion / clés réservées / `OTEL_SERVICE_NAME`                   |
| `packages/core/src/telemetry/metrics.test.ts`                     | Apparition/disparition de `session.id` selon le basculement off/on          |
| `packages/core/src/telemetry/config.test.ts`                      | Fusion env / settings                                                        |
| `CHANGELOG.md` ou notes de version                                | Description du changement cassant de la PR 2                                |

## 7. Découpage en PR

Découpage en trois PR pour la convivialité de la revue et la réduction du rayon d'impact :

### PR 1 — Attributs de ressource personnalisés (additif, zéro cassure)

- Nouveau fichier `resource-attributes.ts` : `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- Champ `TelemetrySettings.resourceAttributes` + logique de fusion dans le résolveur
- Intégration de `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES`, avec priorité selon §4.2
- Fusion dans la ressource (`sdk.ts`)
- Ajout du schéma JSON `resourceAttributes` dans `settingsSchema.ts`
- **Ne touche pas** à la position de `session.id` sur la ressource
- Documentation : ajout de la section « Resource attributes »

**Risque** : faible. Totalement additif, ne modifie aucun comportement existant. Aucun changement dans les données exportées sauf si l'utilisateur définit activement des variables d'environnement ou des paramètres.

### PR 2 — Contrôles de cardinalité (cassure sémantique)

- Suppression de `session.id` de la ressource (la ligne `sdk.ts:160`)
- Ajout du basculement `metrics.includeSessionId` (settings + env) + porte `getCommonAttributes()`
- Ajout du schéma JSON `metrics` dans `settingsSchema.ts`
- CHANGELOG / note de migration
- Tests snapshot gelant l'ensemble des attributs de métrique (anti-régression)
- Documentation : ajout de la section « Cardinality controls » + guide de migration

**Risque** : moyen. Toute requête Prometheus / tableau Grafana / règle d'alerte qui dépend de `session.id` sur les métriques cessera de fonctionner. Nécessite une note de version explicite et une fenêtre de migration d'une ou deux versions.

**Solution transitoire opt-in** (candidat, **non recommandée** pour cette itération) :

> La PR 2 pourrait d'abord être déployée en mode « opt-out » — `session.id` est toujours injecté par défaut dans les métriques, mais un avertissement est émis « cette valeur par défaut sera inversée dans v0.X ». Un changement de valeur par défaut interviendrait une version plus tard.

Raisons de ne pas l'adopter : (1) la base d'utilisateurs actuelle de qwen-code est réduite, la surface de cassure est limitée ; (2) il s'agit d'un bug de cardinalité, mieux vaut sécuriser par défaut le plus tôt possible ; (3) un déploiement en deux étapes alourdit la charge documentaire. Si le propriétaire de l'issue parent souhaite être plus conservateur, cette solution peut être retenue.
### PR 3 — Révision de la doc + échantillons (nettoyage)

- Ajout d'exemples dans `docs/developers/development/telemetry.md` (voir §10)
- Exemples d'intégration Alibaba Cloud ARMS / Prometheus / Grafana
- Ajout de fragments `settings.json` pour tous les cas d'usage typiques

## 8. Plan de test

### 8.1 Tests unitaires de `parseOtelResourceAttributes()`

Couverture paramétrée de toutes les lignes du tableau §4.6 (avec `vitest it.each` de préférence) :

```ts
it.each([
  ['', {}],
  ['a=1', { a: '1' }],
  ['a=1,b=2', { a: '1', b: '2' }],
  ['a=hello%20world', { a: 'hello world' }],
  ['a=val%ZZbad', { a: 'val%ZZbad' }], // pourcentage invalide
  ['malformed', {}],
  ['=val', {}],
  ['a=', { a: '' }],
  ['a=1,a=2', { a: '2' }],
  [' a = 1 , b = 2 ', { a: '1', b: '2' }],
])('analyse %j → %j', (input, expected) => {
  expect(parseOtelResourceAttributes(input)).toEqual(expected);
});
```

### 8.2 Tests de fusion du resolver

| Scénario                                                                 | `service.name` attendu                                   | Attribut utilisateur attendu                |
| ------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------- |
| Tout vide                                                                | `'qwen-code'`                                            | Non présent                                 |
| Uniquement env `OTEL_SERVICE_NAME=A`                                     | `'A'`                                                    | —                                           |
| Uniquement env `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                 | `'B'`                                                    | —                                           |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`        | `'A'` (`OTEL_SERVICE_NAME` prioritaire)                  | —                                           |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                      | `'A'` (`OTEL_SERVICE_NAME` prioritaire)                  | —                                           |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}`  | `'C'` (settings prioritaire sur env, sans `OTEL_SERVICE_NAME`) | —                                           |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`                  | `'qwen-code'`                                            | `team='y'` (settings prioritaire)           |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                          | `'qwen-code'` + avertissement                           | `service.version` reste la vraie version CLI |
| `settings={service.version:fake}`                                        | `'qwen-code'` + avertissement                           | `service.version` reste la vraie version CLI |

### 8.3 Tests de snapshot du contenu de la ressource

Utiliser `InMemorySpanExporter` pour récupérer une span, assertions :

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // critique
expect(span.resource.attributes['team']).toBe('platform'); // ajouté par l'utilisateur
```

### 8.4 Tests du toggle d'attributs métriques

```ts
it('does not emit session.id on metrics by default', async () => {
  // émet un compteur d'appels d'outils
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBeUndefined();
});

it('emits session.id when toggle is true', async () => {
  config.telemetrySettings.metrics = { includeSessionId: true };
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBe(KNOWN_SESSION_ID);
});
```

### 8.5 Tests de conservation du comportement des spans / logs

- Les spans conservent `session.id` (non affecté par le toggle métrique)
- Les logs conservent `session.id` (non affecté par le toggle métrique)

### 8.6 Protection de régression

- `autoDetectResources: false` reste inchangé (assertion sur la configuration)
- Pas de nouveau `diag.error` pendant le démarrage (capturer les logs diag OTel pour assertion)
- Tous les tests de télémétrie existants passent (CI)

### 8.7 Tests d'avertissement Diag

Vérifier que les entrées suivantes déclenchent toutes un `diag.warn` :

- `settings.resourceAttributes = { 'service.version': 'x' }` (réservé)
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x` (réservé, env doit aussi avertir)
- `OTEL_RESOURCE_ATTRIBUTES=malformed` (sans `=`)
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ` (encodage pourcentage invalide)

Vérifier que les entrées suivantes **ne** déclenchent **pas** d'avertissement (chemin valide) :

- `settings.resourceAttributes = { 'service.name': 'x' }` (settings autorisent `service.name`)
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }` ( `OTEL_SERVICE_NAME` prioritaire, pas besoin d'avertissement)

## 9. Migration / Changements cassants

### 9.1 Changement cassant (PR 2)

**`session.id` disparaît par défaut des métriques**. Cela affecte :

- Les agrégations `by (session_id)` / `group_left(session_id)` dans les requêtes Prometheus
- Les graphiques par session dans les tableaux de bord Grafana
- Toute règle d'alerte groupée par `session.id`

Remarque : `session.id` sur les spans et logs **reste inchangé**.

### 9.2 Chemin de migration

Deux options dans la documentation :

**Option A** : Restaurer l'ancien comportement (recommandé pour debug court terme)

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

Ou dans `settings.json` :

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

⚠️ **Avertissement** : Activer durablement entraîne un nombre de séries temporelles métriques = nombre de sessions historiques, ce qui peut saturer le backend. À utiliser uniquement pour du debug court terme.

**Option B** : Utiliser les spans / logs pour la segmentation par session (recommandée)
- Les spans / logs contiennent toujours `session.id`, ce qui permet de filtrer par session dans les backends de traces (Jaeger, Aliyun ARMS Tracing, etc.) / de logs (Loki, SLS, etc.).
- Ces deux types de données étant stockés par événement, la cardinalité n’explose pas.
- Idéal pour l’analyse descendante (drill-down) par session.

### 9.3 Modèle de note de version

```
**Breaking change (metric attribute) :**

L'attribut `session.id` n'est plus attaché aux points de données des métriques par défaut.
Cela protège les backends de métriques d’un éclatement infini des séries temporelles.

- Les spans et les logs ne sont pas affectés — `session.id` reste présent.
- Pour restaurer le comportement précédent (débogage à court terme uniquement), définissez
  `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` ou dans settings.json :
  `telemetry.metrics.includeSessionId: true`.
- Pour une corrélation de session à long terme, interrogez les backends de traces / logs
  plutôt que les backends de métriques.

Voir docs/developers/development/telemetry.md « Migration » pour les détails.
```

## 10. Exemples de configuration (pour la documentation)

### 10.1 Segmenter toutes les télémétries par équipe / environnement

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

Résultat : tous les spans / logs / métriques portent `team=platform` `env=prod` `cost_center=eng-123`.

### 10.2 Utiliser `OTEL_SERVICE_NAME` pour router vers un collecteur partagé

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

Résultat : `service.name=qwen-code-ci`, le collecteur OTel multi‑locataire peut router en fonction de `service.name` vers différents backends.

### 10.3 Configuration de base de la flotte + surcharge ponctuelle

`~/.qwen/settings.json` de la flotte entreprise (distribué par GitOps) :

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

Surcharge temporaire par un opérateur sur une machine (sans modifier settings) :

```bash
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
# Les attributs deployment.environment / service.namespace de settings restent actifs
# En plus, cette exécution ajoute debug_run=true
```

### 10.4 Activer temporairement `session.id` dans les métriques pour le débogage

```bash
# Exécution de débogage unique
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "Analyse d'investissement"
```

Une fois terminé, désactivez ; ne pas persister dans settings.

### 10.5 Intégration des métriques Alibaba Cloud ARMS (configuration recommandée)

```json
{
  "telemetry": {
    "enabled": true,
    "otlpEndpoint": "http://<arms-endpoint>/api/v1/...",
    "otlpProtocol": "http",
    "resourceAttributes": {
      "team": "platform",
      "deployment.environment": "production"
    },
    "metrics": {
      "includeSessionId": false
    }
  }
}
```

## 11. Comparaison avec l'implémentation de claude-code

| Dimension                    | claude-code                                      | qwen-code (présente conception)                  | Justification                                 |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------- |
| Variable d'environnement OTel standard | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ Identique                                      | Contrat standard                                   |
| Priorité de `OTEL_SERVICE_NAME` | Respecte la spécification OTel                   | ✅ Respecte                                       | La spec est explicite                              |
| Nom du toggle de cardinalité | `OTEL_METRICS_INCLUDE_*`                         | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | Ne pollue pas l'espace de noms OTel standard        |
| Portée du toggle             | Métriques uniquement                             | ✅ Métriques uniquement                           | Les spans / logs sont par événement, pas de problème de cardinalité |
| Valeur par défaut            | Attribut de haute cardinalité désactivé par défaut | ✅ Désactivé par défaut                           | La sécurité avant tout                            |
| Granularité par attribut     | Un toggle par attribut                           | ✅ Identique                                      | Flexible, adapté aux besoins réels de diagnostic   |
| Équivalent dans settings.json | ❌ Aucun                                        | ✅ Présent : `telemetry.resourceAttributes` + `metrics` | Configuration de base pour les flottes entreprises |
| Hook dynamique par span      | ❌ Aucun                                        | ❌ Aucun                                          | Complexité élevée, claude-code n'a pas non plus, pas pour cette version |
| `account_uuid` multi‑locataire | Présent                                        | ❌ Absent                                         | qwen‑code n'a pas cet attribut dans les métriques   |
| Agent SDK `options.env`      | Présent                                        | ❌ Absent                                         | qwen‑code n'a pas de modèle équivalent             |
| Politique des clés réservées | Interdit d'écraser les ID intégrés              | ✅ Identique                                      | Fiabilité des télémétries                          |
| Canal de remontée propriétaire | claude‑code dispose aussi d'un canal propriétaire indépendant (isolé d'OTel) | ✅ qwen‑logger également isolé              | Séparation des responsabilités entre canaux propriétaire et tiers |

**Les deux points les plus utiles à reprendre** :

1. **Convention de nommage** : `*_INCLUDE_*` indique immédiatement la sémantique, plus claire que des noms inversés (`*_EXCLUDE_*` / `*_DROP_*`).
2. **Périmètre restreint** : ne filtrer que les métriques, pas les spans/logs — claude‑code a visiblement déjà heurté cette limite, nous en bénéficions directement.

**Ce que qwen‑code fait mieux** :

- Prise en charge de settings.json : claude‑code repose entièrement sur des variables d'environnement, peu adapté aux flottes d'entreprise.
- Politique explicite des clés réservées (`service.version` non écrasable) : réduit le risque de pollution des télémétries.
- Isolation du canal propriétaire : qwen‑logger passe par un canal indépendant, totalement découplé des réglages OTLP de l'utilisateur.

## 12. Travaux futurs (v2 + candidats)

- **Contrôle de cardinalité de `service.version`** : utiliser l'API OTel View pour supprimer l'attribut au niveau des métriques.
- **Davantage de toggles de cardinalité** : si à l'avenir des attributs comme `user.account_uuid` / `model` sont ajoutés aux métriques, ajouter des toggles au besoin.
- **Hook d'attributs dynamiques par span** : s'inspirer du système de hooks de qwen‑code, ajouter un callback `OnSpanStart(span, context) => attrs`. Conception indépendante nécessaire.
- **Validation du schéma des attributs de ressource** : limiter l'espace de nommage des clés (par exemple interdire d'écraser les attributs intégrés autres que le préfixe `service.*`). Actuellement, une liste codée en dur de clés réservées suffit.
- **Rechargement à chaud des ressources** : lorsque settings.json est modifié dans le processus (scénario daemon qwen‑serve), la ressource n'est pas reconstruite actuellement. Si le scénario daemon devient mature, ajouter un chemin de rechargement.
- **Propagation du contexte entre sous‑agents inter‑processus** : lorsqu'un sous‑agent traverse des processus, transmettre le contexte de trace parent (y compris la ressource) via les en‑têtes standard de propagation de contexte OTel. Conception indépendante nécessaire.
