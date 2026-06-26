# Télémétrie : Attributs de ressource personnalisés + Contrôles de cardinalité des métriques

> Issue associée : [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> Issue parente : [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> Basé sur la revue de code de la branche main de qwen-code en date du 2026-05-21

## 1. Contexte

qwen-code est déjà intégré au SDK OpenTelemetry, mais la façon dont les ressources sont construites le rend inutilisable dans deux scénarios de production courants :

1. **Impossible d'ajouter des dimensions personnalisées** : L'équipe d'exploitation souhaite ajouter des étiquettes `team` / `env` / `cost_center` / `user_id` à toutes les données de télémétrie, mais il n'existe actuellement aucun mécanisme pour le faire. Même la définition de la variable d'environnement standard `OTEL_RESOURCE_ATTRIBUTES` **ne fonctionne pas du tout**.
2. **Cardinalité des métriques incontrôlable** : `session.id` est injecté dans la couche Resource et est automatiquement attaché à chaque point de données métrique. Chaque session CLI génère une nouvelle valeur, ce qui fait exploser le backend de métriques (Prometheus / Alibaba Cloud ARMS Metrics / VictoriaMetrics) avec des séries temporelles illimitées.

Ces deux problèmes sont liés : résoudre le premier rendrait **encore plus facile** pour les utilisateurs d'ajouter des champs à haute cardinalité aux données, il est donc impératif de fournir le second en accompagnement.

## 2. État actuel

### 2.1 Construction de la ressource

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
  // Désactive les détecteurs de ressources asynchrones (hôte/processus/environnement) : ils laissent des attributs
  // en attente et déclenchent une erreur diag.error d'OTel à la lecture de tout attribut de ressource
  // avant que les détecteurs ne se soient stabilisés (par exemple, lors de la création de span HttpInstrumentation).
  autoDetectResources: false,
  ...
});
```

`autoDetectResources: false` désactive le `envDetector` standard d'OTel – c'est-à-dire la couche qui lit normalement `OTEL_RESOURCE_ATTRIBUTES` et `OTEL_SERVICE_NAME`. Cela a une raison (le détecteur est asynchrone et déclenche `diag.error` avant de se stabiliser), mais l'effet secondaire est que ces deux variables d'environnement standard sont **totalement inefficaces** dans qwen-code.

### 2.2 `session.id` est en réalité injecté trois fois

| Emplacement                   | Ligne                    | Impact                                  |
| ----------------------------- | ------------------------ | --------------------------------------- |
| Resource                      | `sdk.ts:160`             | Tous les signaux (spans / logs / metrics) |
| Par span                      | `session-tracing.ts:169` | spans                                   |
| Par log                       | `loggers.ts:128`         | logs                                    |
| **`getCommonAttributes()`**   | `metrics.ts:57`          | **Ajouté explicitement à chaque enregistrement métrique** |

Cela signifie que **retirer simplement `session.id` de la Resource ne suffit pas** – `getCommonAttributes()` de `baseMetricDefinition` dans `metrics.ts:57` est déployé via `...spread` dans plus de 30 points d'appel métriques, ce qui réinsère `session.id`.

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

Bonne nouvelle : tous les points d'appel métriques (30+) passent par cette seule fonction, c'est un goulot d'étranglement naturel.

### 2.3 Modèle de résolution de configuration

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` utilise une chaîne de priorité unifiée :

```
argv (plus haute)  >  QWEN_* env  >  OTEL_* env  >  settings.json (plus basse)
```

Les nouveaux éléments suivent ce même modèle.

### 2.4 État actuel du schéma des paramètres

`packages/cli/src/config/settingsSchema.ts:998-1018` définit le schéma JSON pour `telemetry` :

```ts
telemetry: {
  type: 'object',
  // ...
  jsonSchemaOverride: {
    type: 'object',
    properties: {
      includeSensitiveSpanAttributes: { ... },
    },
    additionalProperties: true,  // ← Aujourd'hui, les autres clés telemetry.* ne sont pas validées
  },
}
```

`additionalProperties: true` signifie qu'aujourd'hui, le schéma ne valide pas les autres champs comme `otlpEndpoint` / `otlpProtocol` / `resourceAttributes`. Lors de l'ajout des nouveaux champs `resourceAttributes` / `metrics`, il faut en profiter pour compléter le schéma ici, afin de faciliter l'autocomplétion IDE et le rendu de l'interface des paramètres.

### 2.5 Chemins de code hors du périmètre de cette conception

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` est le **canal de rapport d'usage propriétaire** de qwen-code (basé sur le protocole interne Alibaba RUM `RumResourceEvent`), totalement indépendant du SDK OTel. Il a son propre endpoint, proxy et modèle de données, **non affecté par cette conception**. Voir la section 3 pour plus de détails.

### 2.6 Variables d'environnement `OTEL_*` déjà prises en charge / non prises en charge

| Variable d'environnement                                         | Statut                     |
| ---------------------------------------------------------------- | -------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                                    | ✅ Pris en charge (`config.ts:79`) |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT`              | ✅ Pris en charge          |
| `OTEL_EXPORTER_OTLP_HEADERS`                                     | ✅ Lu directement par l'exporteur sous-jacent |
| `OTEL_TRACES_SAMPLER`                                            | ✅ Pris en charge (`tracer.ts:247`) |
| **`OTEL_RESOURCE_ATTRIBUTES`**                                   | ❌ Pas du tout pris en charge |
| **`OTEL_SERVICE_NAME`**                                          | ❌ Pas du tout pris en charge |
| **`OTEL_METRICS_INCLUDE_*`**                                     | ❌ Pas du tout pris en charge (style claude-code) |

## 3. Objectifs / Non-objectifs

### 3.1 Objectifs

- Permettre aux équipes d'exploitation d'ajouter des attributs de ressource personnalisés à tous les spans / logs / metrics exportés via OTLP en utilisant la variable d'environnement standard `OTEL_RESOURCE_ATTRIBUTES` et leur propre `settings.json`
- Faire en sorte que `OTEL_SERVICE_NAME` fonctionne conformément à la spécification OTel (y compris la priorité par rapport à `service.name` dans `OTEL_RESOURCE_ATTRIBUTES`)
- Par défaut, les métriques **ne doivent pas** porter `session.id` (protéger la cardinalité du backend)
- Fournir un interrupteur explicite pour permettre aux utilisateurs qui ont besoin d'une corrélation métrique-session de le réactiver
- Conserver `session.id` sur les spans et les logs (la corrélation des traces est impérative)
- Conserver `autoDetectResources: false`, ne pas régresser le bug corrigé de `diag.error`
- Mettre à jour `settingsSchema.ts` en conséquence pour rendre les nouveaux champs visibles dans l'interface des paramètres et l'IDE

### 3.2 Non-objectifs

- **Rapport propriétaire `qwen-logger`** : Canal RUM totalement indépendant, hors du périmètre de cette conception. Ses champs de rapport (device id, user agent, etc.) sont déterminés par le protocole RUM et ne doivent pas être perturbés par les attributs de ressource utilisateur. Si à l'avenir on souhaite ajouter des dimensions personnalisées à `qwen-logger`, cela fera l'objet d'une conception indépendante distincte.
- **Hook d'attributs dynamique par span** : Permettre aux utilisateurs d'écrire du code / un hook pour calculer des attributs pour chaque span. claude-code n'a pas non plus résolu ce problème ; la complexité est élevée pour un faible bénéfice.
- **Contrôle de cardinalité `service.version`** : La fréquence des changements de version est limitée (mensuelle), la croissance des séries temporelles est maîtrisable. Si nécessaire, passer à v2 avec l'API OTel View.
- **Attributs de ressource par requête sous forme de SDK Agent** : qwen-code n'a actuellement aucun scénario d'appel SDK.
- **Configuration des en-têtes de requête OTLP (auth headers)** : Cela relève d'une autre ligne d'issue (#3731 P1), indépendante de cette conception.
- **Attributs de ressource sous forme de flag CLI** : Les variables d'environnement + settings.json couvrent déjà les scénarios temporaires et de base, un flag CLI rendrait la ligne de commande verbeuse sans gain évident.

## 4. Conception

### 4.1 Architecture générale

```
┌─ Resource（sdk.ts:156）─────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                      │
│                          > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                          > 'qwen-code'                         │
│   service.version     ← config.getCliVersion()  [réservé]      │
│   ...attributs util.  ← OTEL_RESOURCE_ATTRIBUTES               │
│                          + settings.resourceAttributes         │
│   ✗ session.id supprimé                                        │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id（session-tracing.ts:169, conservé）
       ├──→ Logs      ＋ session.id（loggers.ts:128, conservé）
       └──→ Metrics   ＋ getCommonAttributes() — par défaut {}
                          toggle ON: { session.id }
```

### 4.2 Ordre de priorité / fusion

#### Attributs généraux

Du plus bas au plus haut :

1. `OTEL_RESOURCE_ATTRIBUTES` (variable d'environnement OTel standard)
2. `settings.telemetry.resourceAttributes`
3. Clés réservées intégrées (écrasent toute valeur homonyme ci-dessus)

**Justification** : La variable d'environnement est une surcharge temporaire au niveau ops (CI / debug sur une seule machine), settings.json est une ligne de base déployée sur tout le parc, les clés intégrées sont un contrat produit – la ligne de base doit avoir une priorité supérieure à la variable temporaire, et les clés intégrées doivent avoir la priorité sur tout.

#### Traitement spécial pour `service.name`

`service.name` doit respecter la [spécification OTel](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/) :

> **`OTEL_SERVICE_NAME` a priorité sur `service.name` défini avec la variable `OTEL_RESOURCE_ATTRIBUTES`.**

Donc, pour `service.name`, on applique cette chaîne de priorité spécifique (du plus haut au plus bas) :

1. `OTEL_SERVICE_NAME` (le plus haut, conformément à la spécification OTel)
2. `settings.resourceAttributes.service.name` (settings prioritaire sur env, conforme à la règle générale de cette conception)
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. Valeur par défaut intégrée `'qwen-code'`

`service.name` peut être surchargé via les paramètres – c'est l'identité du service, et il est courant et raisonnable qu'un parc d'entreprise utilise un settings.json unifié pour configurer le service.name. L'interdire bloquerait le scénario de distribution GitOps. `OTEL_SERVICE_NAME` en tant que canal de "priorité la plus élevée" selon la spécification OTel peut toujours être utilisé pour une surcharge temporaire en CI / debug local.

Règles spécifiques :

| Source                                                          | Écriture de `service.name` effective ?    |
| --------------------------------------------------------------- | ----------------------------------------- |
| `OTEL_SERVICE_NAME=foo`                                         | ✅ Priorité la plus élevée (écrase toute autre source) |
| `settings.resourceAttributes={ "service.name": "foo" }`         | ✅ Uniquement si `OTEL_SERVICE_NAME` n'est pas défini |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`                     | ✅ Uniquement si aucun des deux ci-dessus n'est défini |

### 4.3 Stratégie des clés réservées

| Clé               | L'utilisateur peut-il écraser ?                                                                                 | Justification                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `service.name`    | ✅ Variable d'environnement + paramètres possibles (voir §4.2 chaîne de priorité)                               | Identité du service, doit pouvoir être contrôlée par l'ops                                        |
| `service.version` | ❌ Toute source est ignorée + avertissement                                                                     | Fiabilité de la télémétrie – ne pas permettre à l'utilisateur de mentir sur la version            |
| `session.id`      | ❌ Toute source est ignorée + avertissement (sur les métriques, un toggle supplémentaire contrôle l'injection runtime) | Uniquement runtime ; l'écrire dans Resource contournerait le toggle de cardinalité des métriques  |
| Préfixe `qwen.*`  | ⚠️ Non imposé, mais la documentation suggère de le réserver à l'usage propre du produit                         | Éviter les conflits futurs entre les attributs intégrés et ceux de l'utilisateur                   |

**Les clés réservées sont maintenues de manière centralisée dans une constante** :

```ts
// telemetry/resource-attributes.ts (nouveau fichier)
/** Clés qui ne peuvent pas être écrasées depuis quelque source que ce soit (env ou parameters). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` **n'est pas** dans la liste RESERVED – il suit sa propre chaîne de priorité (§4.2) et n'appartient pas à la sémantique "interdiction globale d'écraser". RESERVED signifie "toute source qui écrit ces clés sera avertie et ignorera", et s'applique uniformément aux deux entrées (env et parameters).

### 4.4 Analyse de `OTEL_RESOURCE_ATTRIBUTES`

Implémentation synchrone, contournant le `envDetector` asynchrone d'OTel :

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
        `Entrée malformée ignorée dans OTEL_RESOURCE_ATTRIBUTES : ${trimmed}`,
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
        `Encodage percent invalide dans OTEL_RESOURCE_ATTRIBUTES pour la clé "${key}", utilisation de la valeur brute`,
      );
      value = valueRaw;
    }
    out[key] = value; // clés en double : la dernière gagne (conforme aux implémentations de référence OTel)
  }
  return out;
}
```

Format strictement conforme à la spécification OTel : `key1=val1,key2=val2`, valeurs encodées en percent.

### 4.5 Filtre d'attributs de métrique

Seul point de modification `metrics.ts:55-59` :

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

Aucune modification aux points d'appel (30+) – un `...spread` d'un objet vide équivaut à ne déployer aucun champ.

### 4.6 Cas limites et validation

| Entrée                                                           | Comportement                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (chaîne vide)                      | Retourne `{}`, démarrage normal                                           |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (pas de `=`)                      | Ignore cet élément + `diag.warn`, continue l'analyse du reste             |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (clé vide)                     | Ignore cet élément, continue l'analyse du reste                           |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (valeur vide)                | `a=''`, `b='2'` (la spécification OTel autorise les valeurs vides)        |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (encodage percent invalide) | Conserve la valeur brute `val%ZZbad` + `diag.warn`                        |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (clé en double)             | La dernière écriture gagne `a=2` (conforme à l'implémentation de référence du SDK OTel) |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (avec espaces)            | Trim automatique                                                          |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                     | Ignore silencieusement `service.version` + `diag.warn`, conserve les autres clés |
| `settings.resourceAttributes={ "service.name": "x" }`            | Accepté (les paramètres peuvent définir service.name, voir §4.2)          |
| `settings.resourceAttributes={ "service.version": "x" }`         | Ignoré silencieusement + `diag.warn`                                      |
| `settings.resourceAttributes={ "team": 123 }` (non string)       | Bloqué par le type TypeScript ; à l'exécution, le validateur JSON schema des paramètres le rejette |
| Taille totale de la ressource > limite OTel (4 Ko ?)             | Géré par le SDK OTel sous-jacent, pas de validation à ce niveau           |

**Pourquoi ne pas effectuer de validation de nom de clé d'attribut à ce niveau** (comme le modèle recommandé par OTel `[a-z][a-z0-9_.]*`) : Le SDK OTel valide lui-même lors de l'exportation ; une validation redondante à ce niveau serait lente et risquerait de diverger du comportement du SDK. Nous ne faisons que l'analyse du format, pas la validation sémantique.

**La protection obligatoire des clés RESERVED s'applique aux deux entrées** :

```ts
// Appliqué aux attributs analysés depuis l'env
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES ne peut pas écraser "${k}" ; ignoré`);
    delete envAttrs[k];
  }
}

// Appliqué aux attributs des paramètres
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in settingsAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes ne peut pas écraser "${k}" ; ignoré`,
    );
    delete settingsAttrs[k];
  }
}
```

### 4.7 Cycle de vie et processus multiples

- **Moment d'initialisation du SDK** : La ressource est construite une fois lors de `initializeTelemetry()`, **immuable dans le processus**. Cela est cohérent avec la conception du SDK OTel.
- **Fork subagent** : Le subagent de qwen-code est dans le même processus (`subagent-runtime.ts`), il partage la ressource. Si à l'avenir un subagent inter-processus est introduit, le processus enfant **réinitialisera** le SDK, relira les variables d'environnement et les paramètres – tant que l'environnement est transmis, le comportement est cohérent.
- **Rechargement à chaud** : Une modification des paramètres **ne reconstruit pas** la ressource. L'opérateur doit redémarrer le CLI pour que cela prenne effet. La documentation doit le préciser clairement.
- **`refreshSessionContext()`** (`sdk.ts:306`) : Rafraîchit uniquement le contexte ALS de la session, **ne reconstruit pas** la ressource – car la ressource n'a plus `session.id` (l'un des changements centraux de cette conception).

## 5. Modifications du schéma de configuration

### 5.1 Interface `TelemetrySettings` (`packages/core/src/config/config.ts:293`)

```ts
export interface TelemetrySettings {
  // ... champs existants
  /** Attributs de ressource statiques attachés à chaque span/log/metric. */
  resourceAttributes?: Record<string, string>;
  /** Contrôles de cardinalité par signal. */
  metrics?: {
    /** Inclure session.id sur les points de données métriques (défaut : false). */
    includeSessionId?: boolean;
  };
}
```

### 5.2 Getter de `Config` (même fichier)

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

### 5.3 Nouveau contenu dans `resolveTelemetrySettings()`

```ts
const envResourceAttrs = parseOtelResourceAttributes(
  env['OTEL_RESOURCE_ATTRIBUTES'],
);
const settingsResourceAttrs = { ...(settings.resourceAttributes ?? {}) };

// Supprimer les clés RESERVED des deux sources (avertir si l'utilisateur a essayé de les définir).
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envResourceAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES ne peut pas écraser "${k}" ; ignoré`);
    delete envResourceAttrs[k];
  }
  if (k in settingsResourceAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes ne peut pas écraser "${k}" ; ignoré`,
    );
    delete settingsResourceAttrs[k];
  }
}

// Fusion : env < settings (settings gagne en cas de conflit).
const merged: Record<string, string> = {
  ...envResourceAttrs,
  ...settingsResourceAttrs,
};

// Priorité service.name : OTEL_SERVICE_NAME (variable d'env spécifique) gagne sur
// tout le reste. settings a déjà écrasé env dans le spread ci-dessus.
if (env['OTEL_SERVICE_NAME']) {
  merged['service.name'] = env['OTEL_SERVICE_NAME'];
}

const resourceAttributes = merged;

const metricsIncludeSessionId =
  parseBooleanEnvFlag(env['QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID']) ??
  settings.metrics?.includeSessionId ??
  false;

return {
  // ... champs existants
  resourceAttributes,
  metrics: { includeSessionId: metricsIncludeSessionId },
};
```

### 5.4 Modifications de la construction de Resource dans `sdk.ts`

```ts
const userAttrs = config.getTelemetryResourceAttributes();
// service.version est toujours intégré ; service.name transite via userAttrs
// (il a déjà été résolu avec la priorité OTEL_SERVICE_NAME dans le resolver).
const builtinServiceName = userAttrs['service.name'] ?? SERVICE_NAME;
const { 'service.name': _, 'service.version': __, ...nonReserved } = userAttrs;

const resource = resourceFromAttributes({
  ...nonReserved,
  [SemanticResourceAttributes.SERVICE_NAME]: builtinServiceName,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  // session.id volontairement PAS placé sur Resource — voir doc de conception §4.1
});
```

### 5.5 Modifications de `settingsSchema.ts`

Dans `packages/cli/src/config/settingsSchema.ts:998-1018`, ajouter dans `telemetry.jsonSchemaOverride.properties` :

```ts
{
  // ... includeSensitiveSpanAttributes existant
  resourceAttributes: {
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Attributs de ressource statiques attachés à toutes les données de télémétrie. ' +
      'Les clés doivent être des chaînes ; les valeurs doivent être des chaînes. ' +
      'Les clés réservées (service.name, service.version) sont silencieusement supprimées.',
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
          'Inclure session.id sur chaque point de données métrique. ' +
          'ATTENTION : chaque session CLI crée une nouvelle valeur, provoquant un ' +
          'éclatement illimité des séries temporelles métriques. À activer uniquement pour un débogage à court terme.',
      },
    },
  },
}
```

Il faut aussi réévaluer `additionalProperties: true` – actuellement permissif, on peut le conserver ou le passer en strict. Il est suggéré de le garder permissif pour éviter des changements destructeurs sur d'autres champs `telemetry.*` non déclarés dans le schéma, mais la documentation doit préciser que "les champs non déclarés sont ignorés".

## 6. Liste des modifications de fichiers

| Fichier                                                        | Modification                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/core/src/telemetry/sdk.ts`                           | Modifier la construction de Resource (fusionner les attributs utilisateur, supprimer `session.id`) |
| `packages/core/src/telemetry/resource-attributes.ts` (nouveau) | `parseOtelResourceAttributes()` + constante `RESERVED_RESOURCE_ATTRIBUTE_KEYS` |
| `packages/core/src/telemetry/config.ts`                        | Ajouter `resourceAttributes` + `metrics.includeSessionId` dans le resolver (analyse et fusion) |
| `packages/core/src/telemetry/metrics.ts`                       | Ajouter un interrupteur dans `getCommonAttributes()`                           |
| `packages/core/src/config/config.ts`                           | Schéma `TelemetrySettings` + deux getters                                     |
| `packages/cli/src/config/settingsSchema.ts`                    | Ajouter `resourceAttributes` + `metrics` dans `jsonSchemaOverride`            |
| `docs/developers/development/telemetry.md`                     | Ajouter les sections "Resource attributes" + "Cardinality controls" + instructions de migration + exemples |
| `packages/core/src/telemetry/resource-attributes.test.ts` (nouveau) | Tests unitaires de l'analyseur (couvrant tous les cas de §4.6)            |
| `packages/core/src/telemetry/sdk.test.ts`                      | Priorité de fusion / clés réservées / `OTEL_SERVICE_NAME`                      |
| `packages/core/src/telemetry/metrics.test.ts`                  | Présence ou absence de `session.id` lorsque l'interrupteur est désactivé/activé |
| `packages/core/src/telemetry/config.test.ts`                   | Fusion env / paramètres                                                        |
| `CHANGELOG.md` ou notes de version                             | Notes de breaking change pour PR 2                                             |

## 7. Découpage en PR

Divisé en trois PR selon la convivialité de la revue et le rayon d'impact :

### PR 1 — Attributs de ressource personnalisés (additifs, sans rupture)

- Nouveau fichier `resource-attributes.ts` : `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- Champ `TelemetrySettings.resourceAttributes` + logique de fusion dans le resolver
- Intégration de `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES`, selon la priorité §4.2
- Fusion dans Resource (`sdk.ts`)
- Ajout du schéma JSON `resourceAttributes` dans `settingsSchema.ts`
- **Ne pas toucher** à l'emplacement de `session.id` sur la Resource
- Ajouter la section "Resource attributes" dans la documentation
**Risque** : faible. Complètement additif, ne modifie aucun comportement existant. Aucun changement dans les données exportées, sauf si l'utilisateur définit explicitement des variables d'environnement ou des paramètres.

### PR 2 — Contrôles de cardinalité (césure sémantique)

- Suppression de `session.id` de Resource (ligne `sdk.ts:160`)
- Ajout du toggle `metrics.includeSessionId` (settings + env) + porte `getCommonAttributes()`
- Ajout du schéma JSON `metrics` dans `settingsSchema.ts`
- CHANGELOG / notes de migration
- Tests snapshot qui figent l'ensemble des attributs de métrique (prévention de régression)
- Section "Contrôles de cardinalité" + guide de migration dans la doc

**Risque** : modéré. Toute requête Prometheus / tableau de bord Grafana / règle d'alerte qui dépend de `session.id` sur les métriques sera cassée. Nécessite une note de version explicite et une fenêtre de migration d'1 à 2 versions.

**Transition opt-in** (candidat, **déconseillé** pour cette itération) :

> La PR 2 pourrait d'abord être livrée en "opt-out" — `session.id` est toujours injecté dans les métriques par défaut, mais un warn log indique "this default will flip in v0.X". Un release plus tard, on inverse la valeur par défaut.

Raisons de ne pas adopter cette approche : (1) la base d'utilisateurs actuelle de qwen-code est petite, l'impact est limité ; (2) c'est un bug de cardinalité, mieux vaut sécuriser par défaut le plus tôt possible ; (3) un déploiement en deux temps alourdit la charge documentaire. Si le propriétaire de l'issue parente souhaite être plus conservateur, on peut l'adopter.

### PR 3 — Polissage de la doc + exemples (nettoyage)

- `docs/developers/development/telemetry.md` : ajout d'exemples (voir §10)
- Exemples d'intégration Aliyun ARMS / Prometheus / Grafana
- Ajout de snippets settings.json pour tous les cas d'usage typiques

## 8. Plan de test

### 8.1 Tests unitaires de `parseOtelResourceAttributes()`

Couverture paramétrée de toutes les lignes du tableau §4.6 (avec `vitest it.each` recommandé) :

```ts
it.each([
  ['', {}],
  ['a=1', { a: '1' }],
  ['a=1,b=2', { a: '1', b: '2' }],
  ['a=hello%20world', { a: 'hello world' }],
  ['a=val%ZZbad', { a: 'val%ZZbad' }], // invalid percent
  ['malformed', {}],
  ['=val', {}],
  ['a=', { a: '' }],
  ['a=1,a=2', { a: '2' }],
  [' a = 1 , b = 2 ', { a: '1', b: '2' }],
])('parses %j → %j', (input, expected) => {
  expect(parseOtelResourceAttributes(input)).toEqual(expected);
});
```

### 8.2 Tests de merge du Resolver

| Scénario                                                              | `service.name` attendu                               | Attribut utilisateur attendu     |
| --------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------- |
| Tout vide                                                             | `'qwen-code'`                                        | inexistant                       |
| Env seulement `OTEL_SERVICE_NAME=A`                                   | `'A'`                                                | —                                |
| Env seulement `OTEL_RESOURCE_ATTRIBUTES=service.name=B`               | `'B'`                                                | —                                |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`     | `'A'` (OTEL_SERVICE_NAME prioritaire)                | —                                |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                   | `'A'` (OTEL_SERVICE_NAME prioritaire)                | —                                |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}` | `'C'` (settings prioritaire sur env, pas de OTEL_SERVICE_NAME) | —                 |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`               | `'qwen-code'`                                        | `team='y'` (settings prioritaire) |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                       | `'qwen-code'` + warn                                 | service.version = version CLI réelle |
| `settings={service.version:fake}`                                     | `'qwen-code'` + warn                                 | service.version = version CLI réelle |

### 8.3 Tests snapshot du contenu Resource

Avec `InMemorySpanExporter`, récupérer une span et affirmer :

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // clé
expect(span.resource.attributes['team']).toBe('platform'); // ajouté par l'utilisateur
```

### 8.4 Tests du toggle d'attribut de métrique

```ts
it('n'émet pas session.id sur les métriques par défaut', async () => {
  // émettre un compteur d'appel d'outil
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBeUndefined();
});

it('émet session.id quand le toggle est true', async () => {
  config.telemetrySettings.metrics = { includeSessionId: true };
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBe(KNOWN_SESSION_ID);
});
```

### 8.5 Tests de conservation du comportement des Spans / Logs

- Les spans ont toujours `session.id` (non affecté par le toggle metric)
- Les logs ont toujours `session.id` (non affecté par le toggle metric)

### 8.6 Protection contre les régressions

- `autoDetectResources: false` reste inchangé (assertion sur config)
- Aucun nouveau `diag.error` pendant le démarrage (capturer les logs diag OTel pour assertion)
- Tous les tests de télémétrie existants passent (CI)

### 8.7 Test des avertissements Diag

Vérifier que les entrées suivantes déclenchent une fois `diag.warn` :

- `settings.resourceAttributes = { 'service.version': 'x' }` (réservé)
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x` (réservé, env doit aussi warn)
- `OTEL_RESOURCE_ATTRIBUTES=malformed` (pas de `=`)
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ` (percent-encoding invalide)

Vérifier que les entrées suivantes **ne** déclenchent **pas** de warn (chemin valide) :

- `settings.resourceAttributes = { 'service.name': 'x' }` (settings permet de définir service.name)
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }` (OTEL_SERVICE_NAME prioritaire, pas besoin de warn)

## 9. Migration / Changements cassants

### 9.1 Changement cassant (PR 2)

**Disparition par défaut de `session.id` sur les métriques**. Cela affecte :

- Les agrégations `by (session_id)` / `group_left(session_id)` dans les requêtes Prometheus
- Les graphiques de dashboard Grafana découpés par session
- Toute règle d'alerte groupée par session.id

Remarque : `session.id` sur les spans et les logs **n'est pas affecté**.

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

⚠️ **Avertissement** : activer à long terme fait que le nombre de time-series métriques = nombre de sessions historiques, ce qui peut surcharger le backend. À utiliser uniquement pour du debug court terme.

**Option B** : Utiliser les spans / logs pour le découpage par session (recommandé)

- `session.id` est toujours présent sur les spans / logs, vous pouvez découper par session dans un backend de traces (Jaeger / Aliyun ARMS Tracing) / backend de logs (Loki / SLS)
- Ces deux types de données sont stockés par événement, la cardinalité n'explose pas
- Idéal pour une analyse drill-down au niveau session

### 9.3 Modèle de note de version

```
**Changement cassant (attribut de métrique) :**

L'attribut `session.id` n'est plus attaché aux points de données de métrique
par défaut. Cela protège les backends de métriques d'une explosion
illimitée de séries temporelles.

- Les spans et les logs ne sont pas affectés — `session.id` est toujours présent.
- Pour restaurer le comportement précédent (debug court terme uniquement), définir
  `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` ou dans settings.json :
  `telemetry.metrics.includeSessionId: true`.
- Pour une corrélation à long terme par session, interrogez les backends de traces / logs
  plutôt que les backends de métriques.

Voir docs/developers/development/telemetry.md "Migration" pour plus de détails.
```

## 10. Exemples de configuration (pour la documentation)

### 10.1 Découpage de toute la télémétrie par team / env

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

Effet : tous les spans / logs / métriques portent `team=platform` `env=prod` `cost_center=eng-123`.

### 10.2 Routage avec `OTEL_SERVICE_NAME` dans un collecteur partagé

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

Effet : `service.name=qwen-code-ci`, un collecteur OTel multi-tenant peut router vers différents backends selon service.name.

### 10.3 Configuration de base flotte + override local

Settings flotte de l'entreprise dans `~/.qwen/settings.json` (distribué par GitOps) :

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

Override temporaire local (sans modifier le fichier settings) :

```bash
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
# Les attributes deployment.environment / service.namespace du settings restent actifs
# En plus, cette exécution porte debug_run=true
```

### 10.4 Activation courte du metric session.id pour debug

```bash
# Exécution unique de debug
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "analyse d'investissement"
```

Désactiver immédiatement après, ne pas persister dans les settings.

### 10.5 Intégration Aliyun ARMS Metric (configuration recommandée)

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

| Dimension                      | claude-code                                      | qwen-code (ce design)                             | Justification                                      |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------- |
| Variable d'env standard OTel   | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ identique                                     | Contrat standard                                   |
| Priorité `OTEL_SERVICE_NAME`   | Suit la spéc OTel                                | ✅ suit la spéc                                  | La spéc le dit clairement                          |
| Nom du toggle Cardinality      | `OTEL_METRICS_INCLUDE_*`                         | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | Ne pollue pas l'espace de noms OTel standard       |
| Portée du toggle               | Métriques uniquement                             | ✅ métriques uniquement                          | Les spans/logs sont per-event, pas de problème de cardinalité |
| Valeur par défaut              | High-cardinality attribute par défaut false      | ✅ par défaut false                              | Priorité à la sécurité                             |
| Granularité par attribut       | Un toggle par attribut                           | ✅ identique                                     | Flexible, répond aux besoins réels de diagnostic   |
| Equivalent settings.json       | ❌ Non                                           | ✅ Oui, `telemetry.resourceAttributes` + `metrics` | Déploiement flotte d'entreprise (config de base)   |
| Hook dynamique par span        | ❌ Non                                           | ❌ Non                                           | Complexité élevée, claude-code non plus, pas pour cette itération |
| Multi-tenant `account_uuid`    | Oui                                             | ❌ Non                                           | qwen-code n'a pas cet attribut dans ses métriques  |
| Agent SDK `options.env`       | Oui                                             | ❌ Non                                           | qwen-code n'a pas de pattern équivalent            |
| Politique de clés réservées    | Ne permet pas d'écraser l'id intégré            | ✅ identique                                     | Fiabilité de la télémétrie                         |
| Canal de remontée propriétaire | claude-code a aussi son propre canal (séparé OTel) | ✅ qwen-logger également séparé               | Séparation des responsabilités canaux propriétaire / tiers |

**Les deux points les plus utiles à emprunter** :

1. **Convention de nommage** : `*_INCLUDE_*` indique immédiatement la sémantique, plus clair que les noms antonymiques (`*_EXCLUDE_*` / `*_DROP_*`)
2. **Portée restreinte** : ne gate que les métriques, pas les spans/logs — claude-code a visiblement déjà rencontré cette limite, nous en bénéficions directement

**Points où qwen-code fait mieux** :

- Support de settings.json : claude-code repose uniquement sur les variables d'env, ce qui n'est pas idéal pour les déploiements en flotte d'entreprise
- Politique explicite de clés réservées (`service.version` non modifiable) : réduit le risque de contamination de la télémétrie
- Isolation du canal propriétaire : qwen-logger utilise un canal indépendant, complètement découplé des paramètres OTel utilisateur

## 12. Travaux futurs (v2 + candidats)

- **Contrôle de cardinalité `service.version`** : utiliser l'API OTel View pour supprimer l'attribut au niveau métrique
- **Plus de toggles cardinality** : si à l'avenir des attributs comme `user.account_uuid` / `model` sont ajoutés aux métriques, ajouter les toggles si nécessaire
- **Hook dynamique d'attribut par span** : pourrait s'inspirer du système de hooks propriétaire de qwen-code, ajouter un callback `OnSpanStart(span, context) => attrs`. Nécessite une conception indépendante.
- **Validation de schéma des attributs Resource** : restreindre l'espace de noms des clés (par exemple interdire l'écrasement d'attributs internes hors préfixe `service.*`), actuellement la liste codée en dur des clés réservées suffit.
- **Rechargement à chaud du Resource** : quand settings.json est modifié dans le processus (scénario imaginé pour qwen-serve en démon), le Resource n'est pas reconstruit aujourd'hui. Si le scénario démon devient mature, on peut ajouter un chemin de rechargement.
- **Propagation de contexte subagent inter-processus** : lorsqu'un subagent traverse des processus, transmettre le contexte de trace parent (y compris le Resource) via les en-têtes standard de propagation de contexte OTel. Nécessite une conception indépendante.