# Telemetrie: Benutzerdefinierte Ressourcenattribute + Metrik-Kardinalitätskontrollen

> Begleitendes Issue: [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> Übergeordnetes Issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> Basierend auf dem Code-Review des qwen-code main-Zweigs vom 2026-05-21

## 1. Hintergrund

qwen-code ist bereits in das OpenTelemetry SDK integriert, aber die Art und Weise, wie die Resource konstruiert wird, macht sie in zwei häufigen Produktionsszenarien unbrauchbar:

1. **Benutzerdefinierte Dimensionen können nicht hinzugefügt werden**: Das Betriebsteam möchte allen Telemetriedaten die Labels `team` / `env` / `cost_center` / `user_id` hinzufügen, aber heute gibt es keinen Mechanismus dafür. Selbst das Setzen der standardmäßigen Umgebungsvariablen `OTEL_RESOURCE_ATTRIBUTES` funktioniert **überhaupt nicht**.
2. **Kardinalität von Metriken außer Kontrolle**: `session.id` wird in die Resource-Ebene injiziert und automatisch an jeden Metrikdatenpunkt angehängt. Jede CLI-Sitzung erzeugt einen neuen Wert, sodass das Metrik-Backend (Prometheus / Alibaba Cloud ARMS Metric / VictoriaMetrics) durch unbegrenzte Time Series überlastet wird.

Diese beiden Probleme sind gekoppelt: Die Lösung des ersten würde es Benutzern **erleichtern**, Daten mit hochkardinalen Feldern zu versehen, daher muss das zweite Problem parallel gelöst werden.

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

`autoDetectResources: false` deaktiviert den standardmäßigen OTel `envDetector` – also genau die Ebene, die normalerweise `OTEL_RESOURCE_ATTRIBUTES` und `OTEL_SERVICE_NAME` ausliest. Das hat einen Grund (die Detektoren sind asynchron und lösen vor dem Settlen einen `diag.error` aus), aber der Nebeneffekt ist, dass diese beiden Standard-Umgebungsvariablen in qwen-code **vollständig unwirksam** sind.

### 2.2 `session.id` ist tatsächlich eine dreifache Injektion

| Position                        | Zeile                     | Auswirkung                                  |
| ------------------------------- | ------------------------- | ------------------------------------------- |
| Resource                        | `sdk.ts:160`              | Alle Signale (Spans / Logs / Metriken)      |
| Pro Span                        | `session-tracing.ts:169`  | Spans                                       |
| Pro Log                         | `loggers.ts:128`          | Logs                                        |
| **`getCommonAttributes()`**     | `metrics.ts:57`           | **Explizite Überlagerung jedes Metrik-Records** |

Das bedeutet: **Allein das Entfernen von `session.id` aus der Resource reicht nicht** – `baseMetricDefinition.getCommonAttributes()` in `metrics.ts:57` wird von über 30 Metrik-Aufrufstellen per `...spread` eingebunden und setzt `session.id` erneut ein.

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

Gute Nachricht: Alle Metrik-Aufrufstellen (30+) gehen durch diese eine Funktion – ein natürlicher Engpass.

### 2.3 Config-Resolver-Muster

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` verwendet eine einheitliche Prioritätskette:

```
argv (höchste Priorität)  >  QWEN_*-Umgebungsvariablen  >  OTEL_*-Umgebungsvariablen  >  settings.json (niedrigste Priorität)
```

Neue Felder folgen diesem Muster.

### 2.4 Aktueller Stand des Einstellungsschemas

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
    additionalProperties: true,  // ← Validiert heute keine anderen telemetry.*-Schlüssel
  },
}
```

`additionalProperties: true` bedeutet, dass das Schema heute andere Felder wie `otlpEndpoint` / `otlpProtocol` / `resourceAttributes` alle durchlässt, ohne sie zu validieren. Wenn neue Felder wie `resourceAttributes` / `metrics` hinzugefügt werden, sollte das Schema hier entsprechend ergänzt werden, um IDE-Autovervollständigung und Einstellungs-UI-Rendering zu unterstützen.

### 2.5 Code-Pfade außerhalb des Entwurfsbereichs

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` ist der **First-Party-Reporting-Kanal** von qwen-code (basiert auf dem internen Ali-RUM-Protokoll `RumResourceEvent`), vollständig unabhängig vom OTel SDK. Es hat eigene Endpunkte, Proxys und Datenmodelle und **wird von diesem Entwurf nicht beeinflusst**. Siehe Abschnitt 3.

### 2.6 Unterstützte / nicht unterstützte `OTEL_*`-Umgebungsvariablen

| Umgebungsvariable                                       | Status                              |
| ------------------------------------------------------- | ----------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                           | ✅ Unterstützt (`config.ts:79`)     |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT`     | ✅ Unterstützt                      |
| `OTEL_EXPORTER_OTLP_HEADERS`                            | ✅ Wird direkt vom zugrunde liegenden Exporter gelesen |
| `OTEL_TRACES_SAMPLER`                                   | ✅ Unterstützt (`tracer.ts:247`)    |
| **`OTEL_RESOURCE_ATTRIBUTES`**                          | ❌ Gar nicht unterstützt            |
| **`OTEL_SERVICE_NAME`**                                 | ❌ Gar nicht unterstützt            |
| **`OTEL_METRICS_INCLUDE_*`**                            | ❌ Gar nicht unterstützt (im Stil von claude-code) |

## 3. Ziele / Nicht-Ziele

### 3.1 Ziele

- Dem Betriebsteam ermöglichen, über standardmäßige `OTEL_RESOURCE_ATTRIBUTES` und das eigene `settings.json` benutzerdefinierte Ressourcenattribute an alle OTLP-exportierten Spans/Logs/Metriken anzuhängen.
- `OTEL_SERVICE_NAME` gemäß der OTel-Spezifikation funktionieren lassen (einschließlich der Priorität mit `service.name` in `OTEL_RESOURCE_ATTRIBUTES`).
- Standardmäßig **kein** `session.id` in Metriken (Schutz der Kardinalität des Backends).
- Expliziten Schalter bereitstellen, damit Benutzer, die eine Sitzungskorrelation auf Metrikebene benötigen, diese wieder aktivieren können.
- `session.id` in Spans und Logs beibehalten (Trace-Korrelation ist zwingend erforderlich).
- `autoDetectResources: false` beibehalten, um den bereits behobenen Fehler mit `diag.error` nicht wieder einzuführen.
- Entsprechende Aktualisierung von `settingsSchema.ts`, um die neuen Felder für die Einstellungs-UI und IDE sichtbar zu machen.

### 3.2 Nicht-Ziele

- **`qwen-logger` First-Party-Reporting**: Vollständig unabhängiger RUM-Kanal, nicht im Rahmen dieses Entwurfs. Seine Reporting-Felder (Geräte-ID, User-Agent usw.) werden durch das RUM-Protokoll bestimmt und sollten nicht durch benutzerdefinierte Ressourcenattribute gestört werden. Sollten in Zukunft benutzerdefinierte Dimensionen für `qwen-logger` erforderlich sein, ist das ein separater, unabhängiger Entwurf.
- **Dynamischer Attribut-Hook pro Span**: Benutzern erlauben, Code/Hooks zu schreiben, um Attribute für jeden Span zu berechnen. claude-code hat das auch nicht gelöst – hohe Komplexität, geringer Nutzen.
- **Kardinalitätskontrolle für `service.version`**: Versionsänderungen sind selten (monatlich), der Anstieg der Time Series ist beherrschbar. Bei Bedarf in v2 mit Einführung der OTel View API.
- **Pro-Abfrage-Ressourcenattribute in Agent-SDK-Form**: qwen-code hat derzeit kein SDK-Aufrufszenario.
- **Konfiguration der OTLP-Request-Header (Auth-Header)**: Ist eine andere Issue-Linie (#3731 P1) und unabhängig von diesem Entwurf.
- **Ressourcenattribute in CLI-Flag-Form**: Umgebungsvariablen + `settings.json` decken sowohl temporäre als auch Basisszenarien ab. CLI-Flags würden die Befehlszeile aufblähen, ohne erkennbaren Nutzen.
## 4. Design

### 4.1 Allgemeine Schichtung

```
┌─ Resource（sdk.ts:156）────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                      │
│                          > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                          > 'qwen-code'                         │
│   service.version     ← config.getCliVersion()  [reserved]     │
│   ...user attrs       ← OTEL_RESOURCE_ATTRIBUTES               │
│                          + settings.resourceAttributes         │
│   ✗ session.id 移走                                            │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id（session-tracing.ts:169，保留）
       ├──→ Logs      ＋ session.id（loggers.ts:128，保留）
       └──→ Metrics   ＋ getCommonAttributes() — 默认 {}
                          toggle ON: { session.id }
```

### 4.2 Priorität / Merge-Reihenfolge

#### Allgemeine Attribute

Niedrig → Hoch:

1. `OTEL_RESOURCE_ATTRIBUTES`（Standard-OTel-Umgebungsvariable）
2. `settings.telemetry.resourceAttributes`
3. Integrierte reservierte Schlüssel (überschreiben jede gleichnamige Variable oben)

**Begründung**: Umgebungsvariablen dienen als temporäre Überschreibungen zur Laufzeit (CI / lokales Debugging), `settings.json` ist die fleet-weite Baseline, und integrierte Felder sind der Produktvertrag – die Baseline sollte höhere Priorität als temporäre Variablen haben, und integrierte Felder sollten über allem stehen.

#### Spezielle Behandlung von `service.name`

`service.name` muss der [OTel-Spezifikation](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/) folgen:

> **`OTEL_SERVICE_NAME` hat Vorrang vor `service.name`, das mit der Variable `OTEL_RESOURCE_ATTRIBUTES` definiert wurde.**

Daher gilt für `service.name` diese Prioritätskette (hoch → niedrig):

1. `OTEL_SERVICE_NAME` (höchste Priorität, gemäß OTel-Spezifikation)
2. `settings.resourceAttributes.service.name` (Einstellungen haben Vorrang vor ENV, konform mit den allgemeinen Regeln dieses Designs)
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. Integrierter Standardwert `'qwen-code'`

`service.name` darf über die Einstellungen überschrieben werden – es ist die Service-Identität, und es ist üblich und sinnvoll, dass ein Unternehmens-Fleet `service.name` über eine einheitliche `settings.json` konfiguriert; ein Verbot würde GitOps-Verteilungsszenarien blockieren. `OTEL_SERVICE_NAME` bleibt als „höchste Priorität“ gemäß OTel-Spezifikation erhalten und kann in CI / lokalem Debugging temporär die Einstellungen überschreiben.

Konkrete Regeln:

| Quelle                                                    | Überschreibt `service.name` wirksam?                          |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `OTEL_SERVICE_NAME=foo`                                  | ✅ Höchste Priorität (überschreibt jede andere Quelle)        |
| `settings.resourceAttributes={ "service.name": "foo" }`  | ✅ Nur wirksam, wenn kein `OTEL_SERVICE_NAME` gesetzt ist     |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`              | ✅ Nur wirksam, wenn keines der beiden obigen gesetzt ist     |

### 4.3 Strategie für reservierte Schlüssel

| Schlüssel         | Kann vom Benutzer überschrieben werden?                                                  | Begründung                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `service.name`    | ✅ ENV-Variable + Einstellungen (siehe §4.2 Prioritätskette)                             | Service-Identität, sollte vom Betrieb kontrolliert werden können                                           |
| `service.version` | ❌ Wird aus jeder Quelle verworfen + Warnung                                             | Vertrauenswürdigkeit der Telemetrie – Benutzer dürfen keine falsche Version angeben                        |
| `session.id`      | ❌ Wird aus jeder Quelle verworfen + Warnung (für Metriken gibt es zusätzlich einen Toggle zur Laufzeit-Injektion) | Laufzeit-spezifisch; wenn der Benutzer es in das Resource setzt, wird der Metrik-Kardinalitäts-Toggle umgangen (Resource-Attribute werden automatisch an alle Signale angehängt) |
| `qwen.*`-Präfix   | ⚠️ Nicht fest reserviert, aber docs empfehlen, es für Produktzwecke zu reservieren       | Vermeidung zukünftiger Konflikte zwischen eingebauten und benutzerdefinierten Attributen                   |

**Reservierte Schlüssel werden zentral als Konstante verwaltet:**

```ts
// telemetry/resource-attributes.ts (new file)
/** Keys that cannot be overridden from any source (env or settings). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` **nicht** in der RESERVED-Liste – es folgt seiner eigenen Prioritätskette (§4.2) und fällt nicht unter die Semantik „globales Überschreibeverbot“. RESERVED bedeutet: „Bei Überschreibung aus beliebiger Quelle wird gewarnt und verworfen“, und gilt einheitlich für ENV und Einstellungen als zwei Eingabepunkte.

### 4.4 Parsen von `OTEL_RESOURCE_ATTRIBUTES`

Synchrone Implementierung, die den asynchronen envDetector von OTel umgeht:

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

Format streng nach OTel-Spezifikation: `key1=val1,key2=val2`, Werte percent-codiert.

### 4.5 Metrik-Attribut-Filter

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
Aufrufstellen (30+ Stück) null Änderung – `...spread` eines leeren Objekts ist gleichbedeutend mit dem Nicht-Entfalten von Feldern.

### 4.6 Grenzfälle und Validierung

| Eingabe                                                          | Verhalten                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (leerer String)                    | Gibt `{}` zurück, Start normal                                          |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (kein `=`)                        | Element überspringen + `diag.warn`, restliche Elemente weiter parsen    |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (leerer Schlüssel)             | Element überspringen, restliche Elemente weiter parsen                  |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (leerer Wert)                | `a=''`, `b='2'` (OTel-Spezifikation erlaubt leere Werte)                |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (ungültige Percent-Codierung) | Original `val%ZZbad` beibehalten + `diag.warn`                     |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (doppelter Schlüssel)       | Letzterer gewinnt: `a=2` (entspricht OTel SDK-Referenzimplementierung)  |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (mit Leerzeichen)         | Automatisches Trimmen                                                    |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                     | `service.version` still verwerfen + `diag.warn`, andere Schlüssel behalten |
| `settings.resourceAttributes={ "service.name": "x" }`            | Akzeptiert (settings dürfen service.name, siehe §4.2)                   |
| `settings.resourceAttributes={ "service.version": "x" }`         | Still verwerfen + `diag.warn`                                            |
| `settings.resourceAttributes={ "team": 123 }` (kein String)      | TypeScript-Typ verhindert; bei Runtime-Eingabe lehnt settings JSON Schema Validator ab |
| Ressourcengröße insgesamt > OTel-Limit (4KB?)                    | Wird vom zugrundeliegenden OTel SDK behandelt, keine Prüfung in dieser Schicht |

**Warum keine Attribut-Schlüssel-Namensvalidierung in dieser Schicht** (wie von OTel empfohlenes Schema `[a-z][a-z0-9_.]*`): Das OTel SDK prüft selbst beim Export. Eine doppelte Prüfung wäre langsam und könnte vom SDK-Verhalten abweichen. Wir parsen nur das Format, keine semantische Validierung.

**Erzwungener Schutz von RESERVED-Schlüsseln gilt für beide Einstiegspunkte**:

```ts
// Angewendet auf umgebungsgeparste Attribute
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envAttrs[k];
  }
}

// Angewendet auf Settings-Attribute
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

- **SDK init-Zeitpunkt**: Resource wird einmalig in `initializeTelemetry()` erstellt, **innerhalb des Prozesses unveränderlich**. Dies entspricht dem OTel SDK-Design.
- **Subagent fork**: qwen-code-Subagent läuft innerhalb desselben Prozesses (`subagent-runtime.ts`) und teilt sich die Resource. Falls in Zukunft ein prozessübergreifender Subagent eingeführt wird, initialisiert der Kindprozess das SDK **neu**, liest erneut Umgebungsvariablen und Settings – solange die Umgebungsvariablen durchgereicht werden, ist das Verhalten konsistent.
- **Hot Reload**: Nach Änderung der Settings wird die Resource **nicht neu erstellt**. Ein Neustart der CLI ist erforderlich. Die Dokumentation sollte dies klarstellen.
- **`refreshSessionContext()`** (`sdk.ts:306`): Aktualisiert nur den Session-ALS-Kontext, **erstellt die Resource nicht neu** – da `session.id` nicht mehr auf der Resource vorhanden ist (eine der Kernänderungen dieses Designs).

## 5. Config Schema-Änderungen

### 5.1 `TelemetrySettings`-Interface (`packages/core/src/config/config.ts:293`)

```ts
export interface TelemetrySettings {
  // ... existing fields
  /** Statische Resource-Attribute, die an jeden Span/Log/Metric angehängt werden. */
  resourceAttributes?: Record<string, string>;
  /** Kardinalitätskontrollen pro Signal. */
  metrics?: {
    /** session.id in Metrikdatenpunkte einfügen (Standard: false). */
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

### 5.3 `resolveTelemetrySettings()` neu hinzugefügt

```ts
const envResourceAttrs = parseOtelResourceAttributes(
  env['OTEL_RESOURCE_ATTRIBUTES'],
);
const settingsResourceAttrs = { ...(settings.resourceAttributes ?? {}) };

// RESERVED-Schlüssel aus beiden Quellen entfernen (Warnung bei Benutzerversuch)
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

// Zusammenführen: env < settings (settings gewinnt bei Konflikten)
const merged: Record<string, string> = {
  ...envResourceAttrs,
  ...settingsResourceAttrs,
};

// service.name-Vorrang: OTEL_SERVICE_NAME (nur env-Ausweichmöglichkeit) überschreibt
// alles andere. settings haben in der Spread-Operation bereits env überschrieben.
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
### 5.4 Änderungen am Resource-Aufbau in `sdk.ts`

```ts
const userAttrs = config.getTelemetryResourceAttributes();
// service.version ist immer eingebaut; service.name kommt durch userAttrs
// (wurde bereits mit OTEL_SERVICE_NAME-Priorität im Resolver aufgelöst).
const builtinServiceName = userAttrs['service.name'] ?? SERVICE_NAME;
const { 'service.name': _, 'service.version': __, ...nonReserved } = userAttrs;

const resource = resourceFromAttributes({
  ...nonReserved,
  [SemanticResourceAttributes.SERVICE_NAME]: builtinServiceName,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  // session.id wird bewusst NICHT auf Resource gesetzt – siehe Design-Dokument §4.1
});
```

### 5.5 Änderungen in `settingsSchema.ts`

In `packages/cli/src/config/settingsSchema.ts:998-1018` bei `telemetry.jsonSchemaOverride.properties` hinzufügen:

```ts
{
  // ... bestehende includeSensitiveSpanAttributes
  resourceAttributes: {
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Statische Resource-Attribute, die an alle Telemetriedaten angehängt werden. ' +
      'Schlüssel müssen Strings sein; Werte müssen Strings sein. ' +
      'Reservierte Schlüssel (service.name, service.version) werden stillschweigend verworfen.',
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
          'session.id auf jedem Metrik-Datenpunkt einschließen. ' +
          'WARNUNG: Jede CLI-Sitzung erzeugt einen neuen Wert, was zu unbegrenztem ' +
          'Metrik-Zeitreihen-Fan-out führt. Nur für kurzfristiges Debugging aktivieren.',
      },
    },
  },
}
```

Ebenso sollte `additionalProperties: true` neu bewertet werden – derzeit permissiv, kann beibehalten oder strikt gemacht werden. Es wird empfohlen, permissiv zu lassen, um keine breaking changes für andere nicht im Schema deklarierte `telemetry.*`-Felder zu verursachen, aber in der Dokumentation klarstellen: „Nicht deklarierte Felder werden ignoriert."

## 6. Liste der Dateiänderungen

| Datei                                                           | Änderung                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/core/src/telemetry/sdk.ts`                           | Resource-Aufbau geändert (User-Attrs zusammengeführt, `session.id` entfernt)         |
| `packages/core/src/telemetry/resource-attributes.ts` (neu)     | `parseOtelResourceAttributes()` + Konstante `RESERVED_RESOURCE_ATTRIBUTE_KEYS`       |
| `packages/core/src/telemetry/config.ts`                        | Resolver: `resourceAttributes` + `metrics.includeSessionId` Parsing und Merge        |
| `packages/core/src/telemetry/metrics.ts`                       | `getCommonAttributes()` um Toggle-Gate erweitert                                     |
| `packages/core/src/config/config.ts`                           | `TelemetrySettings` Schema + zwei Getter                                             |
| `packages/cli/src/config/settingsSchema.ts`                    | `jsonSchemaOverride`: `resourceAttributes` + `metrics` hinzugefügt                   |
| `docs/developers/development/telemetry.md`                     | Abschnitte „Resource attributes“ + „Cardinality controls“ + Migrationshinweise + Beispiele |
| `packages/core/src/telemetry/resource-attributes.test.ts` (neu) | Unit-Tests für Parser (alle Fälle aus §4.6 abgedeckt)                               |
| `packages/core/src/telemetry/sdk.test.ts`                      | Merge-Priorität / reservierte Schlüssel / `OTEL_SERVICE_NAME`                        |
| `packages/core/src/telemetry/metrics.test.ts`                  | `session.id` erscheint bei toggle off/on                                             |
| `packages/core/src/telemetry/config.test.ts`                   | Umgebungsvariablen / Settings Merge                                                  |
| `CHANGELOG.md` oder Release Notes                              | Breaking-Change-Hinweis zu PR 2                                                      |

## 7. Aufteilung in mehrere PRs

Nach Review-Freundlichkeit und Blast Radius in drei PRs:

### PR 1 — Benutzerdefinierte Resource-Attribute (additiv, keine Brüche)

- Neue Datei `resource-attributes.ts`: `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- Feld `TelemetrySettings.resourceAttributes` + Resolver-Merge-Logik
- Anbindung von `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES` gemäß Priorität §4.2
- Merge in Resource (`sdk.ts`)
- `settingsSchema.ts`: `resourceAttributes` JSON-Schema hinzugefügt
- **Rührt** die Position von `session.id` auf Resource **nicht** an
- Docs: Abschnitt „Resource attributes"

**Risiko**: Niedrig. Vollständig additiv, kein bestehendes Verhalten wird geändert. Nur wenn Benutzer explizit Umgebungsvariablen oder Settings setzen, ändern sich die exportierten Daten.

### PR 2 — Cardinality-Kontrollen (semantischer Bruch)

- `session.id` aus Resource entfernen (Zeile `sdk.ts:160`)
- Toggle `metrics.includeSessionId` hinzufügen (Settings + Umgebungsvariable) + Gate in `getCommonAttributes()`
- `settingsSchema.ts`: `metrics` JSON-Schema hinzugefügt
- CHANGELOG / Migrationshinweise
- Snapshot-Tests sperren Metrics-Attributsatz (Regression verhindern)
- Docs: Abschnitt „Cardinality controls" + Migrationsleitfaden

**Risiko**: Mittel. Jede Prometheus-Abfrage / jedes Grafana-Dashboard / jede Alarmregel, die auf `session.id` in Metriken angewiesen ist, wird ungültig. Expliziter Release-Hinweis und ein Migrationsfenster von 1–2 Versionen sind nötig.

**Opt-in-Übergangslösung** (Kandidat, wird für dieses Issue **nicht empfohlen**):

> PR 2 könnte zunächst als „opt-out" ausgerollt werden – standardmäßig wird `session.id` weiterhin in Metriken injiziert, aber mit einer Warnmeldung „Diese Voreinstellung wird in v0.X umgekehrt". Nach einem Release die Voreinstellung umdrehen.

Nicht empfohlen, weil: (1) Die aktuelle Benutzergruppe von Qwen Code ist klein, der Schaden begrenzt; (2) dies ist ein Cardinality-Bug, je früher standardmäßig sicher, desto besser; (3) ein zweistufiger Rollout erhöht den Dokumentationsaufwand. Wenn der Eigentümer des übergeordneten Issues konservativer sein möchte, kann dies übernommen werden.
### PR 3 — Docs aufpolieren + Samples (Bereinigung)

- `docs/developers/development/telemetry.md` Beispiel ergänzen (siehe §10)
- Beispiele für die Integration von Alibaba Cloud ARMS / Prometheus / Grafana
- Füge `settings.json`-Ausschnitte für alle typischen Anwendungsfälle hinzu

## 8. Testplan

### 8.1 `parseOtelResourceAttributes()`-Unit-Tests

Parametrisierte Abdeckung aller Zeilen in Tabelle §4.6 (Empfehlung: vitest `it.each`):

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

### 8.2 Resolver-Merge-Tests

| Szenario                                                                               | Erwarteter `service.name`                                   | Erwartetes user attr                       |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| Alle leer                                                                              | `'qwen-code'`                                               | Nicht vorhanden                            |
| Nur env `OTEL_SERVICE_NAME=A`                                                          | `'A'`                                                       | —                                          |
| Nur env `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                                      | `'B'`                                                       | —                                          |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                     | `'A'` (OTEL_SERVICE_NAME hat Vorrang)                       | —                                          |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                                   | `'A'` (OTEL_SERVICE_NAME hat Vorrang)                       | —                                          |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}`               | `'C'` (settings haben Vorrang vor env, wenn kein OTEL_SERVICE_NAME) | —                                          |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`                               | `'qwen-code'`                                               | `team='y'` (settings haben Vorrang)        |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                                       | `'qwen-code'` + warn                                        | service.version bleibt echte CLI-Version   |
| `settings={service.version:fake}`                                                     | `'qwen-code'` + warn                                        | service.version bleibt echte CLI-Version   |

### 8.3 Resource-Inhalts-Snapshot-Tests

Hole einen Span mit `InMemorySpanExporter` und behaupte:

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // entscheidend
expect(span.resource.attributes['team']).toBe('platform'); // vom Benutzer hinzugefügt
```

### 8.4 Metric-Attribut-Toggle-Tests

```ts
it('does not emit session.id on metrics by default', async () => {
  // emit one tool call counter
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

### 8.5 Spans/Logs-Verhalten-beibehalten-Tests

- spans haben weiterhin `session.id` (unbeeinflusst vom Metric-Toggle)
- logs haben weiterhin `session.id` (unbeeinflusst vom Metric-Toggle)

### 8.6 Regressionsschutz

- `autoDetectResources: false` bleibt unverändert (Assertion auf Config)
- Während des Starts treten keine neuen `diag.error` auf (OTel diag-Logs abfangen und assertion)
- Alle bestehenden Telemetrietests bestehen (CI)

### 8.7 Diag-warn-Tests

Überprüfe, dass die folgenden Eingaben jeweils einmal `diag.warn` auslösen:

- `settings.resourceAttributes = { 'service.version': 'x' }` (reserviert)
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x` (reserviert, env soll auch warnen)
- `OTEL_RESOURCE_ATTRIBUTES=malformed` (kein `=`)
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ` (ungültige Prozent-Kodierung)

Überprüfe, dass die folgenden Eingaben **kein** warn auslösen (gültige Pfade):

- `settings.resourceAttributes = { 'service.name': 'x' }` (settings erlauben service.name zu setzen)
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }` (OTEL_SERVICE_NAME hat Vorrang, kein warn nötig)

## 9. Migration / Breaking Changes

### 9.1 Breaking Changes (PR 2)

**`session.id` bei Metriken verschwindet standardmäßig.** Dies betrifft:

- Aggregationen in Prometheus-Queries mit `by (session_id)` / `group_left(session_id)`
- Diagramme im Grafana-Dashboard, die nach Session aufgeschlüsselt sind
- Alle Regeln, die Alarme nach session.id gruppieren

Hinweis: `session.id` auf Spans und Logs **bleibt unverändert**.

### 9.2 Migrationspfad

Das Dokument gibt zwei Optionen:

**Option A**: Altes Verhalten wiederherstellen (für kurzfristiges Debuggen empfohlen)

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

oder `settings.json`:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

⚠️ **Warnung**: Langfristiges Aktivieren führt dazu, dass die Anzahl der Metrik-Zeitreihen = Anzahl der historischen Sitzungen ist, was das Backend überlasten kann. Nur für kurzfristiges Debuggen.

**Option B**: Stattdessen Spans/Logs für Session-Aufschlüsselung verwenden (empfohlen)
- spans / logs tragen weiterhin `session.id`, Segmentierung im Trace-Backend (z. B. Jaeger / Aliyun ARMS Tracing) / Log-Backend (z. B. Loki / SLS) nach Session möglich
- Diese Datenarten werden ohnehin per-event gespeichert, Kardinalität explodiert nicht
- Geeignet für Session-Level-Drill-down-Analysen

### 9.3 Release-Notiz-Vorlage

```
**Breaking Change (Metrik-Attribut):**

Das Attribut `session.id` wird standardmäßig nicht mehr an Metrik-Datenpunkte angehängt.
Dies schützt Metrik-Backends vor unbegrenztem Time-Series-Fan-Out.

- Spans und Logs sind nicht betroffen – `session.id` ist weiterhin vorhanden.
- Zur Wiederherstellung des vorherigen Verhaltens (nur für kurzfristiges Debugging) setzen Sie
  `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` oder in settings.json:
  `telemetry.metrics.includeSessionId: true`.
- Für langfristige Session-Korrelation fragen Sie Trace-/Log-Backends ab, nicht Metrik-Backends.

Einzelheiten finden Sie in docs/developers/development/telemetry.md unter „Migration“.
```

## 10. Beispielkonfigurationen (für die Dokumentation)

### 10.1 Alle Telemetriedaten nach Team/Umgebung segmentieren

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

Effekt: Alle Span-/Log-/Metrik-Daten tragen `team=platform` `env=prod` `cost_center=eng-123`.

### 10.2 Routing im Shared Collector mit `OTEL_SERVICE_NAME`

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

Effekt: `service.name=qwen-code-ci`, der Multi-Tenant-OTel-Collector kann nach service.name an verschiedene Backends routen.

### 10.3 Fleet-Baseline + Einzelmaschinen-Override

`~/.qwen/settings.json` der Firmen-Fleet (GitOps-Verteilung):

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

Temporäres Override auf einer einzelnen Maschine für Ops (ohne settings zu ändern):

```bash
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
# deployment.environment / service.namespace aus settings gelten weiterhin
# dieser Lauf erhält zusätzlich debug_run=true
```

### 10.4 Kurzfristiges Debugging: Metrik-session.id aktivieren

```bash
# Einmaliger Debug-Durchlauf
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "Investitionsanalyse"
```

Nach dem Debuggen sofort deaktivieren, nicht in settings persistieren.

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

## 11. Vergleich mit der claude-code-Implementierung

| Dimension                        | claude-code                                      | qwen-code (dieses Design)                        | Entscheidungsgrundlage                              |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| Standard-OTel-Env-Vars           | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ gleich                                        | Standardvertrag                                     |
| `OTEL_SERVICE_NAME`-Priorität    | Folgt OTel-Spezifikation                         | ✅ folgt                                         | Spezifikation legt klar fest                        |
| Kardinalitäts-Toggle-Benennung   | `OTEL_METRICS_INCLUDE_*`                         | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | Verschmutzt nicht den OTel-Standard-Namespace       |
| Toggle-Wirkungsbereich           | Nur Metriken                                     | ✅ nur Metriken                                  | Spans/Logs sind per-event, kein Kardinalitätsproblem |
| Standardwert                     | Hochkardinalitäts-Attribut standardmäßig false   | ✅ standardmäßig false                           | Sicherheit zuerst                                   |
| Per-Attribut-Granularität        | Ein Toggle pro Attribut                          | ✅ gleich                                        | Flexibel, entspricht Diagnoseanforderungen          |
| settings.json-Äquivalent         | ❌ nicht vorhanden                               | ✅ `telemetry.resourceAttributes` + `metrics`    | Enterprise-Fleet-Base-Config                        |
| Per-Span-Dynamic-Hook            | ❌ nicht vorhanden                               | ❌ nicht vorhanden                               | Hohe Komplexität, claude-code hat das auch nicht, diese Iteration nicht |
| Multi-Tenant `account_uuid`      | Vorhanden                                        | ❌ nicht vorhanden                               | qwen-code-Metriken haben dieses Attribut nicht      |
| Agent SDK `options.env`          | Vorhanden                                        | ❌ nicht vorhanden                               | qwen-code hat kein Äquivalent                       |
| Schlüsselschutzstrategie         | Überschreiben von built-in-IDs nicht erlaubt     | ✅ gleich                                        | Vertrauenswürdigkeit der Telemetrie                 |
| Eigener Meldekanal               | claude-code hat ebenfalls eigenen Kanal (isoliert von OTel) | ✅ qwen-logger ebenfalls isoliert                | Trennung von Eigenkanal und Drittanbieterkanal      |

**Zwei besonders übernehmenswerte Punkte**:

1. **Namenskonvention**: `*_INCLUDE_*` – die Semantik ist sofort klar, besser als gegenteilige Namen (`*_EXCLUDE_*` / `*_DROP_*`)
2. **Begrenzter Geltungsbereich**: Nur Metriken werden gegated, nicht Spans/Logs – claude-code hat diese Grenze offenbar schon überschritten, wir profitieren direkt

**Was qwen-code besser macht**:

- settings.json-Unterstützung: claude-code verlässt sich komplett auf Env-Vars, das ist für Enterprise-Fleet-Szenarien ungünstig
- Klare Schlüsselschutzstrategie (`service.version` nicht überschreibbar): Reduziert die Wahrscheinlichkeit von verunreinigter Telemetrie
- Isolierter Eigenkanal: qwen-logger läuft über einen separaten Kanal, vollständig entkoppelt von den Benutzer-OTLP-Einstellungen

## 12. Zukünftige Arbeiten (v2 + Kandidaten)

- **Kardinalitätskontrolle für `service.version`**: Attribut auf Metrikebene mit der OTel View API droppen
- **Weitere Kardinalitäts-Toggles**: Falls in Zukunft `user.account_uuid` / `model` auf Metriken eingeführt werden, Toggles nach Bedarf ergänzen
- **Per-Span-Dynamic-Attribute-Hook**: Könnte an das hauseigene Hooks-System von qwen-code angelehnt werden, mit Callback `OnSpanStart(span, context) => attrs`. Erfordert separates Design.
- **Schema-Validierung für Resource-Attribute**: Einschränkung des Key-Namespace (z. B. Überschreiben von built-in-Attributen außerhalb des `service.*`-Präfix verbieten). Bisher reicht die hartkodierte Schlüsselliste aus.
- **Hot-Reload von Resource**: Wenn settings.json während der Prozesslaufzeit geändert wird (z. B. im qwen-serve-Daemon), wird derzeit kein neues Resource erstellt. Falls das Daemon-Szenario reift, kann ein Reload-Pfad ergänzt werden.
- **Kontextweitergabe für Subagenten über Prozessgrenzen hinweg**: Wenn ein Subagent prozessübergreifend läuft, den Trace-Kontext (inkl. Resource) des Elternprozesses über Standard-Header der OTel-Context-Propagation übergeben. Erfordert separates Design.
