# Telemetrie: Benutzerdefinierte Resource-Attribute + Metrik-Kardinalitätssteuerung

> Zugehöriges Issue: [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> Übergeordnetes Issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> Basierend auf dem Code-Review des qwen-code main-Branches vom 21.05.2026

## 1. Hintergrund

qwen-code ist bereits mit dem OpenTelemetry SDK verbunden, aber die Art und Weise, wie die Resource konstruiert wird, macht sie in zwei häufigen Produktionsszenarien unbrauchbar:

1. **Keine Möglichkeit, benutzerdefinierte Dimensionen anzuhängen**: Die Betriebsseite möchte allen Telemetriedaten `team`/`env`/`cost_center`/`user_id`-Tags hinzufügen, aber derzeit gibt es keinen Mechanismus dafür. Selbst die Standard-Umgebungsvariable `OTEL_RESOURCE_ATTRIBUTES` hat **überhaupt keine Wirkung**.
2. **Kardinalität von Metriken außer Kontrolle**: `session.id` wird in die Resource-Ebene injiziert und automatisch an jeden Metrikdatenpunkt angehängt. Jede CLI-Sitzung erzeugt einen neuen Wert, was das Metrik-Backend (Prometheus / Alibaba Cloud ARMS Metric / VictoriaMetrics) mit unbegrenzten Time-Series überlastet.

Diese beiden Probleme sind miteinander verknüpft: Die Lösung des ersten Problems würde es Benutzern **leichter** machen, hochkardinale Felder zu den Daten hinzuzufügen, daher muss das zweite Problem parallel gelöst werden.

## 2. Aktueller Stand

### 2.1 Resource-Konstruktion

`packages/core/src/telemetry/sdk.ts:156-161`:

```ts
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  'session.id': config.getSessionId(),
});
```

`sdk.ts:274-278`:

```ts
sdk = new NodeSDK({
  resource,
  // Disable async host/process/env resource detectors: they leave attributes
  // pending and trigger an OTel diag.error on any resource attribute read
  // before the detectors settle (e.g. during HttpInstrumentation span creation).
  autoDetectResources: false,
  ...
});
```

`autoDetectResources: false` deaktiviert den standardmäßigen OTel `envDetector` – also die Ebene, die normalerweise `OTEL_RESOURCE_ATTRIBUTES` und `OTEL_SERVICE_NAME` liest. Dafür gibt es einen Grund (der Detector ist asynchron und löst vor dem Settle `diag.error` aus), aber der Nebeneffekt ist, dass diese beiden Standard-Umgebungsvariablen in qwen-code **vollständig unwirksam** sind.

### 2.2 `session.id` ist tatsächlich dreifach injiziert

| Position                      | Zeile                    | Auswirkung                             |
| ----------------------------- | ------------------------ | -------------------------------------- |
| Resource                      | `sdk.ts:160`             | Alle Signale (Spans / Logs / Metriken) |
| Pro Span                      | `session-tracing.ts:169` | Spans                                  |
| Pro Log                       | `loggers.ts:128`         | Logs                                   |
| **`getCommonAttributes()`**   | `metrics.ts:57`          | **Explizit pro Metrik-Record überlagert** |

Das heißt, **es reicht nicht, `session.id` einfach aus der Resource zu entfernen** – `getCommonAttributes()` in `metrics.ts:57` wird von über 30 Metrik-Aufrufstellen per `...spread` eingebunden und fügt `session.id` erneut ein.

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

Gute Nachricht: Alle Metrik-Aufrufstellen (30+) gehen durch diese eine Funktion – das ist ein natürlicher Engpass.

### 2.3 Config-Resolver-Muster

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` verwendet eine einheitliche Prioritätskette:

```
argv (höchste)  >  QWEN_* env  >  OTEL_* env  >  settings.json (niedrigste)
```

Neue Felder übernehmen dieses Muster.

### 2.4 Aktueller Stand des Settings-Schemas

`packages/cli/src/config/settingsSchema.ts:998-1018` definiert das JSON-Schema für `telemetry`:

```ts
telemetry: {
  type: 'object',
  // ...
  jsonSchemaOverride: {
    type: 'object',
    properties: {
      includeSensitiveSpanAttributes: { ... },
    },
    additionalProperties: true,  // ← Heute werden andere telemetry.*-Keys nicht validiert
  },
}
```

`additionalProperties: true` bedeutet, dass das Schema heute andere Felder wie `otlpEndpoint` / `otlpProtocol` / `resourceAttributes` nicht validiert. Beim Hinzufügen der neuen Felder `resourceAttributes` / `metrics` sollte hier das Schema ergänzt werden, um IDE-Autovervollständigung und die Darstellung in den Settings-UI zu ermöglichen.

### 2.5 Nicht im Entwurfsbereich liegende Codepfade

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` ist der **erstanbieterliche Nutzungsmeldekanal** von qwen-code (basiert auf dem internen Alibaba RUM-Protokoll `RumResourceEvent`) und völlig unabhängig vom OTel SDK. Es hat seinen eigenen Endpoint, Proxy und sein eigenes Datenmodell und **wird von diesem Entwurf nicht beeinflusst**. Siehe Abschnitt 3.

### 2.6 Unterstützte / nicht unterstützte `OTEL_*`-Umgebungsvariablen

| Umgebungsvariable                                         | Status                          |
| --------------------------------------------------------- | ------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                             | ✅ Unterstützt (`config.ts:79`) |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT`       | ✅ Unterstützt                  |
| `OTEL_EXPORTER_OTLP_HEADERS`                              | ✅ Wird direkt vom Exporter gelesen |
| `OTEL_TRACES_SAMPLER`                                     | ✅ Unterstützt (`tracer.ts:247`) |
| **`OTEL_RESOURCE_ATTRIBUTES`**                            | ❌ Überhaupt nicht unterstützt  |
| **`OTEL_SERVICE_NAME`**                                   | ❌ Überhaupt nicht unterstützt  |
| **`OTEL_METRICS_INCLUDE_*`**                              | ❌ Überhaupt nicht unterstützt (claude-code-Stil) |

## 3. Ziele / Nicht-Ziele

### 3.1 Ziele

- Betriebsteams sollen über die standardmäßige `OTEL_RESOURCE_ATTRIBUTES` und das eigene `settings.json` benutzerdefinierte Resource-Attribute an alle OTLP-exportierten Spans / Logs / Metriken anhängen können.
- `OTEL_SERVICE_NAME` soll gemäß der OTel-Spezifikation funktionieren (einschließlich der Priorität von `service.name` in `OTEL_RESOURCE_ATTRIBUTES`).
- Standardmäßig sollen Metriken **kein** `session.id` tragen (Schutz der Backend-Kardinalität).
- Ein expliziter Schalter soll es Benutzern, die eine Metrik-Level-Sitzungskorrelation benötigen, ermöglichen, diese wieder zu aktivieren.
- `session.id` soll auf Spans und Logs erhalten bleiben (Trace-Korrelation ist erforderlich).
- `autoDetectResources: false` soll erhalten bleiben, um den bereits behobenen Bug mit `diag.error` nicht zu verschlechtern.
- Das `settingsSchema.ts` soll entsprechend aktualisiert werden, sodass die neuen Felder für Settings-UI und IDE sichtbar sind.

### 3.2 Nicht-Ziele

- **`qwen-logger`-Erstanbieter-Meldung**: Ein völlig unabhängiger RUM-Kanal, der nicht in den Entwurfsbereich fällt. Seine Meldefelder (Device-ID, User-Agent usw.) werden durch das RUM-Protokoll bestimmt und sollten nicht durch benutzerdefinierte Resource-Attribute gestört werden. Wenn in Zukunft benutzerdefinierte Dimensionen für `qwen-logger` hinzugefügt werden sollen, ist dies ein separater, unabhängiger Entwurf.
- **Dynamischer Attribute-Hook pro Span**: Benutzern das Schreiben von Code / Hooks ermöglichen, um Attribute pro Span zu berechnen. claude-code hat dies auch nicht gelöst; die Komplexität ist hoch, der Nutzen gering.
- **Kardinalitätssteuerung von `service.version`**: Versionsänderungen sind selten (monatlich), das Time-Series-Wachstum ist kontrollierbar. Falls nötig, in v2 mit der OTel View API.
- **Per-Query Resource-Attrs im Agent-SDK-Format**: qwen-code hat derzeit kein SDK-Aufrufszenario.
- **Konfiguration von OTLP-Request-Headern (Auth-Header)**: Dies ist eine separate Issue-Linie (#3731 P1) und unabhängig von diesem Entwurf.
- **Resource-Attribute als CLI-Flag**: Umgebungsvariablen + settings.json decken bereits temporäre und Basis-Szenarien ab. Ein CLI-Flag würde die Befehlszeile aufblähen, ohne erkennbaren Mehrwert.

## 4. Entwurf

### 4.1 Gesamtschichtenmodell

```
┌─ Resource (sdk.ts:156)────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                     │
│                          > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                          > 'qwen-code'                        │
│   service.version     ← config.getCliVersion()  [reserviert]  │
│   ...Benutzer-Attrs   ← OTEL_RESOURCE_ATTRIBUTES              │
│                          + settings.resourceAttributes        │
│   ✗ session.id entfernt                                        │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id (session-tracing.ts:169, beibehalten)
       ├──→ Logs      ＋ session.id (loggers.ts:128, beibehalten)
       └──→ Metriken  ＋ getCommonAttributes() — Standard {}
                          toggle ON: { session.id }
```

### 4.2 Priorität / Merge-Reihenfolge

#### Allgemeine Attribute

Niedrig → Hoch:

1. `OTEL_RESOURCE_ATTRIBUTES` (Standard-OTel-Umgebungsvariable)
2. `settings.telemetry.resourceAttributes`
3. Eingebaute reservierte Keys (überschreiben alle gleichnamigen oben)

**Begründung**: Umgebungsvariablen sind temporäre Betriebszeit-Überschreibungen (CI / Debug auf einzelnen Maschinen), settings.json ist eine flottenweit ausgerollte Baseline, eingebaute sind Produktverträge – die Baseline sollte höhere Priorität als temporäre Variablen haben, und eingebaute sollten höchste Priorität haben.

#### Sonderbehandlung von `service.name`

`service.name` muss der [OTel-Spezifikation](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/) folgen:

> **`OTEL_SERVICE_NAME` hat Vorrang vor `service.name`, das mit der Variable `OTEL_RESOURCE_ATTRIBUTES` definiert wurde.**

Daher wird für `service.name` diese Prioritätskette separat angewendet (hoch → niedrig):

1. `OTEL_SERVICE_NAME` (höchste, gemäß OTel-Standard)
2. `settings.resourceAttributes.service.name` (Settings haben Vorrang vor Env, gemäß der allgemeinen Regel dieses Entwurfs)
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. Eingebauter Standard `'qwen-code'`

`service.name` kann über Settings überschrieben werden – es ist die Service-Identität. Es ist üblich und sinnvoll, dass Unternehmensflotten `service.name` über ein einheitliches `settings.json` konfigurieren. Ein Verbot würde GitOps-Verteilungsszenarien blockieren. `OTEL_SERVICE_NAME` als standardmäßiger OTel-Kanal mit „höchster Priorität" kann weiterhin in CI / beim Debuggen auf einzelnen Maschinen temporär die Settings überschreiben.

Konkrete Regeln:

| Quelle                                                   | Schreiben von `service.name` wirksam?                |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `OTEL_SERVICE_NAME=foo`                                  | ✅ Höchste Priorität (überschreibt jede andere Quelle) |
| `settings.resourceAttributes={ "service.name": "foo" }`  | ✅ Nur wirksam, wenn kein `OTEL_SERVICE_NAME` gesetzt |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`              | ✅ Nur wirksam, wenn keines der beiden obigen gesetzt |

### 4.3 Reservierte-Key-Strategie

| Key               | Kann vom Benutzer überschrieben werden?                                    | Begründung                                                                                                   |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `service.name`    | ✅ Sowohl Env-Var als auch Settings (siehe §4.2 Prioritätskette)           | Service-Identität, sollte vom Betrieb steuerbar sein                                                         |
| `service.version` | ❌ Wird aus jeder Quelle verworfen + warn                                  | Vertrauenswürdigkeit der Telemetrie – dem Benutzer soll es nicht erlaubt sein, die Version falsch anzugeben |
| `session.id`      | ❌ Wird aus jeder Quelle verworfen + warn (bei Metriken zusätzlicher Toggle für Laufzeit-Injektion) | Nur zur Laufzeit; ein Schreiben in die Resource würde den Metrik-Kardinalitäts-Toggle umgehen (Resource-Attrs werden automatisch an alle Signale angehängt) |
| `qwen.*`-Präfix   | ⚠️ Nicht reserviert, aber die Docs empfehlen, es für die Produktnutzung freizuhalten | Vermeidung zukünftiger Konflikte zwischen eingebauten und benutzerdefinierten Attrs |

**Reservierte Keys werden zentral als Konstante verwaltet**:

```ts
// telemetry/resource-attributes.ts (neue Datei)
/** Keys that cannot be overridden from any source (env or settings). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` steht **nicht** in der RESERVED-Liste – es hat seine eigene Prioritätskette (§4.2) und fällt nicht unter die Semantik „globales Überschreibungsverbot". RESERVED bedeutet „aus jeder Quelle geschrieben → warnen und verwerfen", einheitlich für die beiden Einstiegspunkte Env und Settings.

### 4.4 `OTEL_RESOURCE_ATTRIBUTES`-Parsing

Synchron implementiert, um den asynchronen envDetector von OTel zu umgehen:

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

Format streng nach OTel-Spezifikation: `key1=val1,key2=val2`, Werte percent-kodiert.

### 4.5 Metrik-Attribute-Filter

Einzige Änderungsstelle `metrics.ts:55-59`:

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

Aufrufstellen (30+) benötigen keine Änderungen – `...spread` auf ein leeres Objekt ist gleichbedeutend mit dem Nicht-Expandieren von Feldern.

### 4.6 Grenzfälle und Validierung

| Eingabe                                                           | Verhalten                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (leerer String)                     | Gibt `{}` zurück, normaler Start                                          |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (kein `=`)                         | Überspringt diesen Eintrag + `diag.warn`, parst den Rest weiter            |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (leerer Key)                    | Überspringt diesen Eintrag, parst den Rest weiter                          |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (leerer Wert)                | `a=''`, `b='2'` (OTel-Spezifikation erlaubt leere Werte)                 |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (ungültige Percent-Kodierung) | Behält den Rohwert `val%ZZbad` + `diag.warn`                         |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (doppelter Key)              | Letzter gewinnt `a=2` (entspricht der OTel SDK-Referenzimplementierung)    |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (enthält Leerzeichen)      | Wird automatisch getrimmt                                                  |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                      | `service.version` wird stillschweigend verworfen + `diag.warn`, andere Keys bleiben erhalten |
| `settings.resourceAttributes={ "service.name": "x" }`             | Wird akzeptiert (Settings können service.name setzen, siehe §4.2)          |
| `settings.resourceAttributes={ "service.version": "x" }`          | Wird stillschweigend verworfen + `diag.warn`                               |
| `settings.resourceAttributes={ "team": 123 }` (kein String)       | TypeScript-Typ verhindert; zur Laufzeit wird der JSON-Schema-Validator von Settings es ablehnen |
| Resource-Gesamtgröße > OTel-Limit (4KB?)                          | Wird vom zugrunde liegenden OTel SDK behandelt, nicht auf dieser Ebene validiert |

**Warum wird auf dieser Ebene keine Attribut-Key-Namensvalidierung durchgeführt** (z. B. das von OTel empfohlene Muster `[a-z][a-z0-9_.]*`)? Das OTel SDK validiert selbst beim Export; eine zusätzliche Validierung auf dieser Ebene wäre langsam und könnte vom SDK-Verhalten abweichen. Wir parsen nur das Format, keine semantische Validierung.

**Der obligatorische Schutz reservierter Keys gilt für beide Einstiegspunkte**:

```ts
// Angewendet auf env-geparste Attrs
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envAttrs[k];
  }
}

// Angewendet auf Settings-Attrs
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in settingsAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes cannot override "${k}"; ignoring`,
    );
    delete settingsAttrs[k];
  }
}
```

### 4.7 Lebenszyklus und Multiprozess

- **SDK-Init-Zeitpunkt**: Die Resource wird bei `initializeTelemetry()` einmalig konstruiert und ist **innerhalb des Prozesses unveränderlich**. Dies entspricht dem OTel SDK-Design.
- **Subagent-Fork**: Der Subagent von qwen-code läuft innerhalb desselben Prozesses (`subagent-runtime.ts`) und teilt die Resource. Sollte in Zukunft ein prozessübergreifender Subagent eingeführt werden, würde der Kindprozess das SDK **neu initialisieren** und die Env-Var und Settings erneut lesen – solange die Env weitergegeben wird, ist das Verhalten konsistent.
- **Hot-Reload**: Eine Änderung der Settings führt **nicht** zur Neukonstruktion der Resource. Damit die Änderung wirksam wird, muss der Bediener die CLI neu starten. Die Dokumentation sollte dies klarstellen.
- **`refreshSessionContext()`** (`sdk.ts:306`): Aktualisiert nur den Session-ALS-Kontext, **baut die Resource nicht neu** – da die Resource kein `session.id` mehr enthält (eine der Kernänderungen dieses Entwurfs).

## 5. Änderungen am Config-Schema

### 5.1 `TelemetrySettings`-Interface (`packages/core/src/config/config.ts:293`)

```ts
export interface TelemetrySettings {
  // ... bestehende Felder
  /** Statische Resource-Attribute, die an jeden Span/Log/Metrik angehängt werden. */
  resourceAttributes?: Record<string, string>;
  /** Per-Signal-Kardinalitätssteuerung. */
  metrics?: {
    /** session.id in Metrikdatenpunkte aufnehmen (Standard: false). */
    includeSessionId?: boolean;
  };
}
```

### 5.2 `Config`-Getter (gleiche Datei)

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

### 5.3 `resolveTelemetrySettings()` neu

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
  // ... bestehende Felder
  resourceAttributes,
  metrics: { includeSessionId: metricsIncludeSessionId },
};
```

### 5.4 `sdk.ts` Resource-Konstruktion geändert

```ts
const userAttrs = config.getTelemetryResourceAttributes();
// service.version is always built-in; service.name flows through userAttrs
// (it was already resolved with OTEL_SERVICE_NAME precedence in resolver).
const builtinServiceName = userAttrs['service.name'] ?? SERVICE_NAME;
const { 'service.name': _, 'service.version': __, ...nonReserved } = userAttrs;

const resource = resourceFromAttributes({
  ...nonReserved,
  [SemanticResourceAttributes.SERVICE_NAME]: builtinServiceName,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  // session.id deliberately NOT placed on Resource — see design doc §4.1
});
```

### 5.5 `settingsSchema.ts` geändert

`packages/cli/src/config/settingsSchema.ts:998-1018` `telemetry.jsonSchemaOverride.properties` hinzufügen:

```ts
{
  // ... bestehende includeSensitiveSpanAttributes
  resourceAttributes: {
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Static resource attributes attached to all telemetry data. ' +
      'Keys must be strings; values must be strings. ' +
      'Reserved keys (service.name, service.version) are silently dropped.',
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
          'Include session.id on every metric data point. ' +
          'WARNING: each CLI session creates a new value, causing unbounded ' +
          'metric time-series fan-out. Only enable for short-term debugging.',
      },
    },
  },
}
```

Zusätzlich sollte `additionalProperties: true` neu bewertet werden – derzeit ist es permissiv, es kann beibehalten oder auf strict umgestellt werden. Es wird empfohlen, es permissiv zu lassen, um keine breaking changes für andere nicht im Schema deklarierte `telemetry.*`-Felder zu verursachen, aber die Docs sollten klarstellen, dass „nicht deklarierte Felder ignoriert werden".

## 6. Dateiänderungsliste

| Datei                                                          | Änderung                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/sdk.ts`                           | Resource-Konstruktion geändert (Benutzer-Attrs mergen, `session.id` entfernen)  |
| `packages/core/src/telemetry/resource-attributes.ts` (neu)     | `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`-Konstante |
| `packages/core/src/telemetry/config.ts`                        | Resolver: `resourceAttributes` + `metrics.includeSessionId`-Parsing & Merge     |
| `packages/core/src/telemetry/metrics.ts`                       | `getCommonAttributes()`: Toggle-Tor hinzugefügt                                 |
| `packages/core/src/config/config.ts`                           | `TelemetrySettings`-Schema + zwei Getter                                         |
| `packages/cli/src/config/settingsSchema.ts`                    | `jsonSchemaOverride`: `resourceAttributes` + `metrics` hinzugefügt               |
| `docs/developers/development/telemetry.md`                     | Zwei Abschnitte „Resource attributes" + „Cardinality controls" + Migrationshinweise + Beispiele |
| `packages/core/src/telemetry/resource-attributes.test.ts` (neu) | Unit-Tests für den Parser (alle Fälle aus §4.6 abdecken)                        |
| `packages/core/src/telemetry/sdk.test.ts`                      | Merge-Priorität / reservierte Keys / `OTEL_SERVICE_NAME`                         |
| `packages/core/src/telemetry/metrics.test.ts`                  | session.id bei toggle off/on                                                   |
| `packages/core/src/telemetry/config.test.ts`                   | Merge von Env / Settings                                                        |
| `CHANGELOG.md` oder Release Notes                              | Breaking-Change-Hinweis für PR 2                                                |

## 7. Aufteilung in PRs

Nach Review-Freundlichkeit und Blast-Radius in drei PRs aufgeteilt:

### PR 1 — Custom resource attributes (additiv, keine Breaks)

- Neue Datei `resource-attributes.ts`: `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- `TelemetrySettings.resourceAttributes`-Feld + Resolver-Merge-Logik
- `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES` angebunden, gemäß §4.2 Priorität
- In die Resource gemerged (`sdk.ts`)
- `settingsSchema.ts`: `resourceAttributes`-JSON-Schema hinzugefügt
- **`session.id` wird in der Resource nicht angerührt**
- Docs: Abschnitt „Resource attributes" hinzugefügt
**Risiko**: Niedrig. Vollständig additiv, ohne bestehendes Verhalten zu ändern. Die exportierten Daten ändern sich nicht, es sei denn, der Benutzer setzt aktiv Umgebungsvariablen oder Einstellungen.

### PR 2 — Cardinality-Steuerung (semantischer Bruch)

- Entferne `session.id` aus Resource (Zeile `sdk.ts:160`)
- Füge `metrics.includeSessionId`-Toggle hinzu (settings + env) + `getCommonAttributes()`-Gate
- Füge in `settingsSchema.ts` das `metrics`-JSON-Schema hinzu
- CHANGELOG / Migrationshinweise
- Snapshot-Tests, die den Satz an Metrik-Attributen fixieren (Regression verhindern)
- Docs um Abschnitt "Cardinality-Steuerung" + Migrationsanleitung ergänzen

**Risiko**: Mittel. Jede Prometheus-Query / Grafana-Dashboard / Alarmregel, die auf `session.id` in Metriken angewiesen ist, wird ungültig. Erfordert expliziten Release-Hinweis und ein Migrationsfenster von 1–2 Versionen.

**Opt-in-Übergangslösung** (möglich, für dieses Release **nicht empfohlen**):

> PR 2 könnte zunächst als "Opt-out" implementiert werden – standardmäßig wird `session.id` weiterhin in Metriken injiziert, jedoch mit einem Warn-Log "this default will flip in v0.X". Ein Release später wird die Voreinstellung umgekehrt.

Gründe gegen die Empfehlung: (1) Der aktuelle qwen-code-Benutzerkreis ist klein, der Bruch begrenzt; (2) Es handelt sich um einen Cardinality-Bug – je früher standardmäßig sicher, desto besser; (3) Eine zweistufige Veröffentlichung erhöht den Dokumentationsaufwand. Falls der Verantwortliche des übergeordneten Issues konservativer sein möchte, könnte dieser Vorschlag angenommen werden.

### PR 3 — Docs-Polish + Samples (Cleanup)

- `docs/developers/development/telemetry.md` um Beispiele ergänzen (siehe §10)
- Beispiele für die Integration von Alibaba Cloud ARMS / Prometheus / Grafana
- Alle typischen Use-Cases als settings.json-Ausschnitte hinzufügen

## 8. Testplan

### 8.1 Unit-Tests für `parseOtelResourceAttributes()`

Parametrisierte Abdeckung aller Zeilen aus Tabelle §4.6 (empfohlen mit vitest `it.each`):

```ts
it.each([
  ['', {}],
  ['a=1', { a: '1' }],
  ['a=1,b=2', { a: '1', b: '2' }],
  ['a=hello%20world', { a: 'hello world' }],
  ['a=val%ZZbad', { a: 'val%ZZbad' }], // ungültiges Prozent
  ['malformed', {}],
  ['=val', {}],
  ['a=', { a: '' }],
  ['a=1,a=2', { a: '2' }],
  [' a = 1 , b = 2 ', { a: '1', b: '2' }],
])('parst %j → %j', (input, expected) => {
  expect(parseOtelResourceAttributes(input)).toEqual(expected);
});
```

### 8.2 Resolver-Merge-Tests

| Szenario                                                                  | Erwarteter `service.name`                         | Erwartetes user attr                       |
| ------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| Alle leer                                                                 | `'qwen-code'`                                     | Nicht vorhanden                            |
| Nur env `OTEL_SERVICE_NAME=A`                                             | `'A'`                                             | —                                          |
| Nur env `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                         | `'B'`                                             | —                                          |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`         | `'A'` (`OTEL_SERVICE_NAME` hat Vorrang)           | —                                          |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                       | `'A'` (`OTEL_SERVICE_NAME` hat Vorrang)           | —                                          |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}`   | `'C'` (Settings vor env, wenn `OTEL_SERVICE_NAME` fehlt) | —                                          |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`                   | `'qwen-code'`                                     | `team='y'` (Settings haben Vorrang)        |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                           | `'qwen-code'` + warn                              | service.version bleibt echte CLI-Version   |
| `settings={service.version:fake}`                                         | `'qwen-code'` + warn                              | service.version bleibt echte CLI-Version   |

### 8.3 Snapshot-Tests für Resource-Inhalte

Mit `InMemorySpanExporter` einen Span holen und behaupten:

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // entscheidend
expect(span.resource.attributes['team']).toBe('platform'); // vom Benutzer hinzugefügt
```

### 8.4 Tests für Metrik-Attribut-Toggle

```ts
it('sendet standardmäßig kein session.id in Metriken', async () => {
  // einen Tool-Call-Zähler ausgeben
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBeUndefined();
});

it('sendet session.id, wenn der Toggle aktiviert ist', async () => {
  config.telemetrySettings.metrics = { includeSessionId: true };
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBe(KNOWN_SESSION_ID);
});
```

### 8.5 Tests für unverändertes Verhalten von Spans / Logs

- Spans enthalten weiterhin `session.id` (nicht vom Metrik-Toggle betroffen)
- Logs enthalten weiterhin `session.id` (nicht vom Metrik-Toggle betroffen)

### 8.6 Regressionsschutz

- `autoDetectResources: false` bleibt unverändert (Assertion auf config)
- Während des Starts tritt kein neues `diag.error` auf (OTel diag-Logs abfangen und behaupten)
- Alle bestehenden Telemetrie-Tests bestehen (CI)

### 8.7 Tests für diag-warn

Prüfen, dass die folgenden Eingaben jeweils einmal `diag.warn` auslösen:

- `settings.resourceAttributes = { 'service.version': 'x' }` (reserviert)
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x` (reserviert, env soll auch warnen)
- `OTEL_RESOURCE_ATTRIBUTES=malformed` (kein `=`)
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ` (ungültiges Prozent-Encoding)

Prüfen, dass die folgenden Eingaben **kein** warn auslösen (gültige Pfade):

- `settings.resourceAttributes = { 'service.name': 'x' }` (Settings erlauben das Setzen von service.name)
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }` (`OTEL_SERVICE_NAME` hat Vorrang, kein warn nötig)

## 9. Migration / Breaking Changes

### 9.1 Breaking Change (PR 2)

**Das `session.id` in Metriken fehlt standardmäßig**. Dies betrifft:

- Prometheus-Queries mit `by (session_id)` / `group_left(session_id)` Aggregationen
- Grafana-Dashboards mit nach Sitzung unterteilten Diagrammen
- Regeln, die nach `session.id` gruppieren

Hinweis: `session.id` in Spans und Logs **bleibt unberührt**.

### 9.2 Migrationspfad

In der Dokumentation werden zwei Optionen angeboten:

**Option A**: Altes Verhalten wiederherstellen (kurzzeitiges Debugging empfohlen)

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

Oder in `settings.json`:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

⚠️ **Warnung**: Langfristig aktiviert führt dies dazu, dass die Anzahl der Metrik-Zeitreihen = der Anzahl historischer Sitzungen ist und das Backend überlastet. Nur für kurzfristiges Debugging verwenden.

**Option B**: Stattdessen Spans / Logs für Sitzungs-Slicing verwenden (empfohlen)

- Spans / Logs enthalten weiterhin `session.id`. Sie können in Trace-Backends (z. B. Jaeger / Aliyun ARMS Tracing) / Log-Backends (z. B. Loki / SLS) nach Sitzung slicen
- Diese Daten sind ohnehin pro Event gespeichert, die Cardinality explodiert nicht
- Geeignet für Session-Level-Drill-Down-Analysen

### 9.3 Release-Hinweis-Vorlage

```
**Breaking change (Metrik-Attribut):**

Das Attribut `session.id` wird standardmäßig nicht mehr an Metrik-Datenpunkte
angehängt. Dies schützt Metrik-Backends vor unbegrenzter Ausbreitung von Zeitreihen.

- Spans und Logs sind nicht betroffen – `session.id` ist weiterhin vorhanden.
- Um das vorherige Verhalten wiederherzustellen (nur kurzfristiges Debugging), setzen Sie
  `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` oder in settings.json:
  `telemetry.metrics.includeSessionId: true`.
- Für langfristige Sitzungskorrelation fragen Sie Trace-/Log-Backends anstelle von Metrik-Backends ab.

Weitere Details finden Sie unter docs/developers/development/telemetry.md „Migration“.
```

## 10. Beispielkonfigurationen (für die Dokumentation)

### 10.1 Alle Telemetriedaten nach Team / Umgebung slicen

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

Effekt: Alle Spans / Logs / Metriken enthalten `team=platform`, `env=prod`, `cost_center=eng-123`.

### 10.2 Mit `OTEL_SERVICE_NAME` in einem gemeinsamen Collector routen

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

Effekt: `service.name=qwen-code-ci`. Ein Multi-Tenant-OTel-Collector kann nach service.name an verschiedene Backends routen.

### 10.3 Fleet-Baseline + Einzelne Rechner-Überschreibung

Firmenweites `~/.qwen/settings.json` (GitOps-Verteilung):

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

Einzelner Operateur überschreibt temporär (ohne Einstellungen zu ändern):

```bash
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
# deployment.environment / service.namespace aus den Einstellungen bleiben erhalten
# Dieser Lauf erhält zusätzlich debug_run=true
```

### 10.4 Kurzfristiges Debugging: Metrik-session.id aktivieren

```bash
# Einmaliger Debug-Lauf
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "Investitionsanalyse"
```

Danach sofort deaktivieren, nicht in den Einstellungen persistieren.

### 10.5 Alibaba Cloud ARMS Metric-Anbindung (empfohlene Konfiguration)

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

## 11. Vergleich mit claude-code-Implementierung

| Dimension                         | claude-code                                      | qwen-code (dieses Design)                       | Entscheidungsgrundlage                             |
| --------------------------------- | ------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------- |
| Standard-OTel-Env-Var             | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ Konsistent                                   | Standardvertrag                                    |
| Priorität `OTEL_SERVICE_NAME`     | Befolgt OTel-Spezifikation                       | ✅ Befolgt                                      | Spezifikation legt es klar fest                    |
| Cardinality-Schalter-Benennung    | `OTEL_METRICS_INCLUDE_*`                          | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | Verschmutzt nicht den Standard-OTel-Namensraum     |
| Schalter-Geltungsbereich          | Nur Metrik                                       | ✅ Nur Metrik                                   | Spans/Logs sind pro Event, kein Cardinality-Problem |
| Standardwert                      | High-Cardinality-Attribut standardmäßig false    | ✅ Standardmäßig false                          | Sicherheit zuerst                                  |
| Pro-Attribut-Granularität         | Ein Toggle pro Attribut                          | ✅ Konsistent                                   | Flexibel, entspricht praktischen Diagnoseanforderungen |
| Settings.json-Äquivalent           | ❌ Nicht vorhanden                               | ✅ Vorhanden (`telemetry.resourceAttributes` + `metrics`) | Unternehmens-Fleet-Bereitstellung von Basis-Konfiguration |
| Dynamischer Hook pro Span         | ❌ Nicht vorhanden                               | ❌ Nicht vorhanden                              | Hohe Komplexität, claude-code hat es auch nicht; wird in diesem Release nicht umgesetzt |
| Multi-Tenant `account_uuid`       | Vorhanden                                        | ❌ Nicht vorhanden                              | qwen-code-Metriken enthalten dieses Attribut nicht |
| Agent SDK `options.env`           | Vorhanden                                        | ❌ Nicht vorhanden                              | qwen-code hat kein äquivalentes Muster             |
| Reservierte-Schlüssel-Strategie   | Erlaubt Überschreibung von built-in IDs nicht    | ✅ Konsistent                                   | Telemetrie-Vertrauenswürdigkeit                    |
| Erstanbieter-Meldekana             | claude-code hat auch unabhängigen Erstanbieter-Kanal (getrennt von OTel) | ✅ qwen-logger ebenfalls getrennt              | Trennung der Verantwortung zwischen Erst- und Drittanbieter |

**Zwei am meisten lohnende Übernahmen**:

1. **Namenskonvention**: `*_INCLUDE_*` zeigt sofort die Semantik, klarer als gegenteilige Namen (`*_EXCLUDE_*` / `*_DROP_*`)
2. **Eingeschränkter Geltungsbereich**: Nur Metrik-Gate, kein Gate für Span/Log – claude-code hat offensichtlich diese Grenze überschritten, wir profitieren direkt

**Punkte, bei denen qwen-code besser abschneidet**:

- Unterstützung von settings.json: claude-code verlässt sich vollständig auf Env-Vars, was für Unternehmens-Fleet-Szenarien ungünstig ist
- Klare reservierte Schlüsselstrategie (`service.version` kann nicht überschrieben werden): Verringert die Wahrscheinlichkeit, dass Telemetrie verunreinigt wird
- Trennung der Erstanbieter-Meldung: qwen-logger läuft über einen unabhängigen Kanal, vollständig entkoppelt von den OTLP-Einstellungen des Benutzers

## 12. Zukünftige Arbeiten (v2 + Kandidaten)

- **`service.version`-Cardinality-Steuerung**: Mit dem OTel View API das Attribut auf Metrikebene entfernen
- **Weitere Cardinality-Toggles**: Falls in Zukunft Attribute wie `user.account_uuid` / `model` in Metriken eingeführt werden, können Toggles nach Bedarf ergänzt werden
- **Dynamischer Attribut-Hook pro Span**: Könnte das hauseigene Hooks-System von qwen-code nutzen, um einen `OnSpanStart(span, context) => attrs`-Callback hinzuzufügen. Erfordert separates Design.
- **Validierung des Resource-Attribut-Schemas**: Einschränkung des Key-Namensraums (z. B. Überschreiben von built-in-Attributen mit `service.*`-Präfix verbieten) – derzeit reicht eine hartcodierte Liste reservierter Schlüssel.
- **Hot-Reload von Resource**: Wenn settings.json innerhalb des Prozesses geändert wird (z. B. im qwen-serve-Daemon-Szenario), wird derzeit die Resource nicht neu erstellt. Wenn der Daemon reifer wird, könnte ein Reload-Pfad hinzugefügt werden.
- **Context-Propagation für Subagenten über Prozesse hinweg**: Wenn ein Subagent prozessübergreifend läuft, den Trace-Context (einschließlich Resource) des übergeordneten Prozesses über standardisierte OTel-Context-Propagation-Header übertragen. Erfordert separates Design.