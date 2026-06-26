# Motivation für die Auth Provider Registry

Das Auth-Modul modellierte früher jeden Einrichtungspfad als separaten Ablauf: API-Key, OAuth, Abonnementpläne und benutzerdefinierte Anbieter. In der Praxis erzeugen all diese Pfade die gleiche Art von Ausgabe: Aktualisierungen der Benutzer-Provider-Konfiguration in `~/.qwen/settings.json`.

Dieses Refactoring macht die Provider-Einrichtung zur gemeinsamen Abstraktion. Ein Provider beschreibt, wie er angezeigt wird, wie Anmeldedaten gesammelt werden, welche Modelle er installiert und welcher Konfigurationspatch angewendet werden soll. API-Keys, OAuth, Coding-Pläne, Token-Pläne und benutzerdefinierte Assistenten sind Einrichtungsmethoden für einen Provider, keine separaten Auth-Architekturen.

## Ziele

- Die benutzernahen Abläufe in `/auth` leicht verständlich halten:
  - Alibaba ModelStudio für die Einrichtung von Erstanbieter-Qwen.
  - Drittanbieter-Provider für gängige integrierte Integrationen wie DeepSeek, MiniMax und Z.AI.
  - OAuth-Provider wie OpenRouter.
  - Benutzerdefinierte Provider für lokale Server, Proxys oder nicht integrierte Provider.
- Provider-spezifische Daten in kleine deklarative Provider-Konfigurationen verschieben.
- Beiträge für Drittanbieter-Provider einfach machen: Das Hinzufügen eines gängigen Providers sollte normalerweise das Hinzufügen einer Provider-Konfiguration plus Tests bedeuten.
- Schreibvorgänge für Einstellungen über `ProviderInstallPlan` und `applyProviderInstallPlan` zentralisieren.
- UI-Gruppierung getrennt vom Installationsverhalten halten. Gruppen helfen Benutzern, `/auth` zu navigieren; sie sollten nicht die Einstellungslogik steuern.
- Einen Pfad für Modelllisten-Besitz und Provider-Metadaten beibehalten, sodass Provider-Modellaktualisierungen sicher erkannt und angewendet werden können.

## Architektur

Die neue Struktur trennt Provider-Definitionen, Installationslogik und UI-Zustand:

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

`ProviderConfig` ist der deklarative Vertrag für integrierte Provider. Er enthält das Provider-Label, das Protokoll, Basis-URL-Optionen, den Umgebungsschlüssel, die Modellliste, Modellmetadaten, UI-Gruppierung und das Einrichtungsverhalten.

`buildInstallPlan` wandelt eine Provider-Konfiguration und gesammelte Einrichtungseingaben in einen `ProviderInstallPlan` um. Der Installationsplan ist das einzige Objekt, das der Einstellungsschreiber verstehen muss.

`applyProviderInstallPlan` wendet diesen Plan an, indem es Umgebungseinstellungen, `modelProviders`, den ausgewählten Auth-Typ, eine optionale Modellauswahl und Provider-Metadaten aktualisiert. Dies hält die Einstellungspersistenz unabhängig vom UI-Ablauf, der die Eingaben gesammelt hat.

## Benutzerabläufe

`/auth` kann weiterhin verschiedene Einstiegspunkte bieten, aber alle sollten auf dem gleichen Provider-Installationspfad zusammenlaufen:

1. **Alibaba ModelStudio**
   - Coding Plan
   - Token Plan
   - Standard API key

2. **Drittanbieter-Provider**
   - Gängige Provider mit integrierten Standardwerten.
   - Jeder Provider sollte seine eigene Basis-URL, seinen Umgebungs-Key, seine Standardmodelle und Modellmetadaten besitzen.
   - Z.AI muss die einrichtungsspezifische Basis-URL verwenden:
     - Coding Plan: `https://api.z.ai/api/coding/paas/v4`
     - Standard API key: `https://api.z.ai/api/paas/v4`

3. **OAuth**
   - Browserbasierte Autorisierung für Routing-Plattformen wie OpenRouter.
   - OAuth-spezifische Mechanismen können in der Provider-Implementierung leben, aber das Endergebnis sollte immer noch ein Provider-Installationsplan sein.

4. **Benutzerdefinierter Provider**
   - Manuelle Einrichtung für lokale Server, Proxys oder nicht unterstützte Provider.
   - Der Assistent sammelt Protokoll, Basis-URL, API-Key, Modell-IDs und erweiterte Modelloptionen wie Denken, multimodale Eingabe, Kontextfenster und maximale Tokens.

## Modellbesitz und Aktualisierungen

Statische integrierte Provider können Provider-Metadaten unter `providerMetadata.<providerId>` persistieren, einschließlich der Modelllistenversion und Basis-URL. Dies ermöglicht es Qwen Code, zu erkennen, wenn sich die integrierte Modellliste eines Providers ändert, und den Benutzer aufzufordern, besessene Modelle zu aktualisieren, ohne nicht zugehörige benutzerdefinierte Modelle zu überschreiben.

Benutzerdefinierte Provider sind anders: Ihre Modellliste wird vom Benutzer erstellt und sollte nicht als automatisch aktualisierbare integrierte Modellliste behandelt werden.

## Nicht-Ziele

- Machen Sie API-Key, OAuth, Coding-Plan oder Token-Plan nicht zur übergeordneten Einstellungsarchitektur.
- Koppeln Sie Schreibvorgänge für Einstellungen nicht an React-Komponenten oder CLI-Befehlshandler.
- Machen Sie UI-Gruppen nicht zu einer Business-Logik-Achse.
- Verlangen Sie nicht von Mitwirkenden, die gesamte Auth-UI zu verstehen, um einen einfachen Drittanbieter-Provider hinzuzufügen.