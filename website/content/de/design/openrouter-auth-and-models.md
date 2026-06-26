# OpenRouter Auth und Model Management Design

Dieses Dokument beschreibt die Design-Intention hinter dem OpenRouter-Authentifizierungsablauf und den damit eingeführten Änderungen im Modellmanagement. Es konzentriert sich bewusst auf die Produkt- und Architekturentscheidungen, nicht auf die Implementierungsgeschichte.

## Goals

- Benutzern ermöglichen, sich sowohl über die CLI als auch über `/auth` bei OpenRouter zu authentifizieren.
- Den bestehenden, mit OpenAI kompatiblen Provider-Pfad wiederverwenden, anstatt einen neuen Auth-Typ für OpenRouter hinzuzufügen.
- Die Erstnutzungserfahrung nutzbar machen, ohne dass Benutzer sofort Hunderte von Modellen verwalten müssen.
- Einen klaren Pfad zu umfassenderem Modellmanagement über `/manage-models` beibehalten.

## OpenRouter Auth

OpenRouter ist als OpenAI-kompatibler Provider integriert:

- Auth-Typ: `AuthType.USE_OPENAI`
- Provider-Einstellungen: `modelProviders.openai`
- API-Key-Umgebungsvariable: `OPENROUTER_API_KEY`
- Basis-URL: `https://openrouter.ai/api/v1`

Dies vermeidet die Einführung eines OpenRouter-spezifischen `AuthType`, da der Laufzeit-Modell-Provider-Pfad bereits OpenAI-kompatibel ist. So bleiben Auth-Status, Modellauflösung, Providerauswahl und Einstellungsschema mit der bestehenden Provider-Abstraktion konsistent.

Die benutzerseitigen Abläufe sind:

- `/auth` → OpenRouter für den interaktiven TUI-Ablauf.
- Umgebungsvariablen für Automatisierung oder direkte API-Key-Einrichtung: `OPENROUTER_API_KEY` plus `OPENAI_BASE_URL=https://openrouter.ai/api/v1`.
- `~/.qwen/settings.json` für skriptgesteuerte Einrichtung, die explizite Modell-Provider-Einträge benötigt.

Browser OAuth nutzt den PKCE-Ablauf von OpenRouter und schreibt den ausgetauschten API-Key in die Einstellungen, bevor die Authentifizierung als `AuthType.USE_OPENAI` aktualisiert wird.

## Model Management

OpenRouter bietet einen großen, dynamischen Modellkatalog. Jedes entdeckte Modell in `modelProviders.openai` zu schreiben, würde `/model` überladen und ein langfristiges Einstellungsfeld in einen Cache eines externen Katalogs verwandeln.

Der entscheidende Design-Split ist:

- **Katalog**: die vollständige Menge an Modellen, die von einer Quelle wie OpenRouter entdeckt wurden.
- **Aktivierte Menge**: die kleinere Menge an Modellen, die in `/model` erscheinen und in den Benutzereinstellungen gespeichert werden sollen.

Für den ersten OpenRouter-Ablauf sollte die Authentifizierung mit einem nützlichen Standard-Aktivierungssatz enden, anstatt den Benutzer mit einer großen Auswahl zu unterbrechen. Der empfohlene Satz sollte klein, stabil und auf Modelle ausgerichtet sein, die es Benutzern ermöglichen, das Produkt erfolgreich auszuprobieren, einschließlich kostenloser Modelle, wenn verfügbar.

`/model` bleibt ein schneller Modellwechsler. Es sollte nicht der Ort werden, an dem Benutzer einen vollständigen Providerkatalog durchsuchen und kuratieren.

## `/manage-models`

Umfassenderes Modellmanagement gehört in einen separaten Einstiegspunkt `/manage-models`. Dieser Ablauf sollte es Benutzern ermöglichen:

- entdeckte Modelle durchzublättern;
- nach ID, Anzeigename, Provider-Präfix und abgeleiteten Tags wie `free` oder `vision` zu suchen;
- zu sehen, welche Modelle derzeit aktiviert sind;
- Modelle in Stapeln zu aktivieren oder zu deaktivieren.

Die Quellendimension muss Teil dieses Designs bleiben. OpenRouter ist nur die erste dynamische Katalogquelle; zukünftige Quellen wie ModelScope und ModelStudio sollten in die gleiche Form passen. Die UI-Komplexität kann reduziert werden, aber die zugrunde liegende Quellenabstraktion sollte als Erweiterungspunkt verfügbar bleiben.

## Current Boundary

Diese Änderung sollte das Mindeste tun, um die OpenRouter-Authentifizierung und Modelleinrichtung angenehm zu gestalten:

- OAuth- oder schlüsselbasierte Authentifizierung konfiguriert OpenRouter über den bestehenden, mit OpenAI kompatiblen Provider-Pfad.
- Der anfängliche aktivierte Modellsatz ist kuratiert, anstatt den vollständigen Katalog in die Einstellungen zu übernehmen.
- Die vollständige Katalog-Speicherung, das Durchsuchen, Filtern und die Stapelverwaltung werden auf `/manage-models` verschoben.

Das Designprinzip ist einfach: Die Authentifizierung sollte Benutzer schnell in einen funktionsfähigen Zustand versetzen, während die Modellkuratierung in einem dedizierten Verwaltungsablauf stattfinden sollte.
