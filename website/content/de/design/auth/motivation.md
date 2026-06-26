# Motivation für die Auth-Provider-Registry

Bisher modellierte das Auth-Modul jeden Einrichtungspfad als separaten Flow: API-Schlüssel,
OAuth, Abonnementpläne und benutzerdefinierte Provider. In der Praxis erzeugen all diese
Pfade die gleiche Art von Ausgabe: Aktualisierungen der Provider-Konfiguration des Benutzers in
`~/.qwen/settings.json`.

Dieses Refactoring macht die Provider-Einrichtung zur gemeinsamen Abstraktion. Ein Provider
beschreibt, wie er angezeigt wird, wie Anmeldedaten gesammelt werden, welche Modelle er installiert
und welcher Settings-Patch angewendet werden soll. API-Schlüssel, OAuth, Coding-Pläne, Token-Pläne
und benutzerdefinierte Assistenten sind Einrichtungsmethoden für einen Provider, keine separaten
Auth-Architekturen.

## Ziele

- Benutzerseitige Abläufe in `/auth` leicht verständlich halten:
  - Alibaba ModelStudio für die Ersteinrichtung von Qwen (First-Party).
  - Drittanbieter-Provider für gängige integrierte Anbindungen wie DeepSeek,
    MiniMax und Z.AI.
  - OAuth-Provider wie OpenRouter.
  - Benutzerdefinierte Provider für lokale Server, Proxys oder nicht eingebaute Anbieter.
- Providerspezifische Daten in kleine deklarative Provider-Konfigurationen verschieben.
- Beiträge von Drittanbieter-Providern einfach gestalten: Das Hinzufügen eines gängigen Providers
  sollte in der Regel das Hinzufügen einer Provider-Konfiguration plus Tests bedeuten.
- Settings-Schreibvorgänge durch `ProviderInstallPlan` und
  `applyProviderInstallPlan` zentralisieren.
- UI-Gruppierung vom Installationsverhalten trennen. Gruppen helfen Benutzern bei der Navigation
  in `/auth`; sie sollten keine Settings-Logik steuern.
- Einen Pfad für die Modelllisten-Verwaltung und Provider-Metadaten vorsehen, sodass
  Provider-Modellaktualisierungen erkannt und sicher angewendet werden können.

## Architektur

Die neue Struktur trennt Provider-Definitionen, Installationslogik und UI-Status:

```text
packages/cli/src/auth/
├── allProviders.ts
├── providerConfig.ts
├── types.ts
├── install/
│   └── applyProviderInstallPlan.ts
└── providers/
    ├── alibaba/
    ├── custom/
    ├── oauth/
    └── thirdParty/
```

`ProviderConfig` ist der deklarative Vertrag für eingebaute Provider. Er enthält
das Provider-Label, das Protokoll, Basis-URL-Optionen, den Umgebungsvariablen-Schlüssel, die Modellliste,
Modell-Metadaten, UI-Gruppierung und das Einrichtungsverhalten.

`buildInstallPlan` wandelt eine Provider-Konfiguration und gesammelte Einrichtungseingaben in einen
`ProviderInstallPlan` um. Der Installationsplan ist das einzige Objekt, das der Settings-Schreiber
verstehen muss.

`applyProviderInstallPlan` wendet diesen Plan an, indem es Umgebungseinstellungen,
`modelProviders`, den ausgewählten Authtyp, eine optionale Modellauswahl und Provider-Metadaten
aktualisiert. Dies hält die Persistenz der Einstellungen unabhängig vom UI-Flow, der die Eingaben
gesammelt hat.

## Benutzerabläufe

`/auth` kann weiterhin verschiedene Einstiegspunkte anbieten, aber sie sollten alle auf demselben
Provider-Installationspfad zusammenlaufen:

1. **Alibaba ModelStudio**
   - Coding-Plan
   - Token-Plan
   - Standard-API-Schlüssel

2. **Drittanbieter-Provider**
   - Gängige Provider mit eingebauten Standardwerten.
   - Jeder Provider sollte seine eigene Basis-URL, seinen eigenen Env-Key, seine Standardmodelle und Modell-Metadaten besitzen.
   - Z.AI muss die setupspezifische Basis-URL verwenden:
     - Coding-Plan: `https://api.z.ai/api/coding/paas/v4`
     - Standard-API-Schlüssel: `https://api.z.ai/api/paas/v4`

3. **OAuth**
   - Browserbasierte Autorisierung für Routing-Plattformen wie OpenRouter.
   - OAuth-spezifische Mechaniken können in der Provider-Implementierung leben, das
     Endergebnis sollte aber dennoch ein Provider-Installationsplan sein.

4. **Benutzerdefinierter Provider**
   - Manuelle Einrichtung für lokale Server, Proxys oder nicht unterstützte Anbieter.
   - Der Assistent sammelt Protokoll, Basis-URL, API-Schlüssel, Modell-IDs und erweiterte
     Modelloptionen wie Denken, multimodale Eingabe, Kontextfenster und maximale Tokens.

## Modellbesitz und Aktualisierungen

Statische eingebaute Provider können Provider-Metadaten unter
`providerMetadata.<providerId>` speichern, einschließlich der Modelllistenversion und Basis-URL.
So kann Qwen Code erkennen, wenn sich die eingebaute Modellliste eines Providers ändert, und den
Benutzer auffordern, die eigenen Modelle zu aktualisieren, ohne nicht verwandte benutzerdefinierte
Modelle zu überschreiben.

Benutzerdefinierte Provider sind anders: Ihre Modellliste stammt vom Benutzer und sollte nicht
als automatisch aktualisierbare eingebaute Modellliste behandelt werden.

## Nicht-Ziele

- API-Schlüssel, OAuth, Coding-Plan oder Token-Plan nicht zur übergeordneten Settings-Architektur machen.
- Settings-Schreibvorgänge nicht an React-Komponenten oder CLI-Befehlshandler koppeln.
- UI-Gruppen nicht zu einer geschäftslogischen Achse machen.
- Von Mitwirkenden nicht verlangen, die gesamte Auth-UI zu verstehen, um einen einfachen Drittanbieter-Provider hinzuzufügen.
