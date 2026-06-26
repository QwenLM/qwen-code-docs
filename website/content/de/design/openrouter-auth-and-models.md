# OpenRouter Authentifizierung und Modellverwaltungsdesign

Dieses Dokument beschreibt die Design-Intention hinter dem OpenRouter-Authentifizierungsablauf und den damit eingeführten Änderungen an der Modellverwaltung. Es konzentriert sich bewusst auf die Produkt- und Architekturentscheidungen, nicht auf die Implementierungsgeschichte.

## Ziele

- Benutzern die Authentifizierung bei OpenRouter sowohl über die CLI als auch über `/auth` ermöglichen.
- Den bestehenden OpenAI-kompatiblen Provider-Pfad wiederverwenden, anstatt einen neuen Authentifizierungstyp für OpenRouter hinzuzufügen.
- Die Ersteinrichtung benutzbar machen, ohne dass Benutzer sofort hunderte Modelle verwalten müssen.
- Einen klaren Pfad zu einer umfangreicheren Modellverwaltung über `/manage-models` beibehalten.

## OpenRouter Authentifizierung

OpenRouter wird als OpenAI-kompatibler Anbieter integriert:

- Authentifizierungstyp: `AuthType.USE_OPENAI`
- Anbietereinstellungen: `modelProviders.openai`
- API-Key-Umgebungsvariable: `OPENROUTER_API_KEY`
- Basis-URL: `https://openrouter.ai/api/v1`

Dies vermeidet die Einführung eines OpenRouter-spezifischen `AuthType`, da der Laufzeit-Modell-Provider-Pfad bereits OpenAI-kompatibel ist. Es hält den Authentifizierungsstatus, die Modellauflösung, die Providerauswahl und das Einstellungsschema im Einklang mit der bestehenden Provider-Abstraktion.

Die benutzerseitigen Abläufe sind:

- `/auth` → OpenRouter für den interaktiven TUI-Ablauf.
- Umgebungsvariablen für Automatisierung oder direkte API-Key-Einrichtung: `OPENROUTER_API_KEY` plus `OPENAI_BASE_URL=https://openrouter.ai/api/v1`.
- `~/.qwen/settings.json` für scriptbasierte Einrichtung, die explizite Modell-Provider-Einträge benötigt.

Browser-OAuth verwendet den PKCE-Ablauf von OpenRouter und schreibt den ausgetauschten API-Key in die Einstellungen, bevor die Authentifizierung als `AuthType.USE_OPENAI` aktualisiert wird.

## Modellverwaltung

OpenRouter stellt einen großen dynamischen Modellkatalog bereit. Jedes entdeckte Modell in `modelProviders.openai` zu schreiben, würde `/model` überladen und ein langfristiges Einstellungsfeld in einen Cache eines entfernten Katalogs verwandeln.

Der entscheidende Design-Unterschied ist:

- **Katalog**: die vollständige Menge an Modellen, die von einer Quelle wie OpenRouter entdeckt wurden.
- **Aktivierte Menge**: die kleinere Menge an Modellen, die in `/model` erscheinen und in den Benutzereinstellungen gespeichert werden sollen.

Für den ersten OpenRouter-Ablauf sollte die Authentifizierung mit einer nützlichen Standard-Aktivierungsmenge enden, anstatt den Benutzer mit einer großen Auswahl zu unterbrechen. Die empfohlene Menge sollte klein, stabil und auf Modelle ausgerichtet sein, die es Benutzern ermöglichen, das Produkt erfolgreich zu testen, einschließlich kostenloser Modelle, sofern verfügbar.

`/model` bleibt ein schneller Modellwechsler. Es sollte nicht zum Ort werden, an dem Benutzer einen vollständigen Anbieterkatalog durchsuchen und kuratieren.

## `/manage-models`

Eine umfangreichere Modellverwaltung gehört in einen separaten Einstiegspunkt `/manage-models`. Dieser Ablauf sollte Benutzern Folgendes ermöglichen:

- entdeckte Modelle durchsuchen;
- nach ID, Anzeigename, Provider-Präfix und abgeleiteten Tags wie `free` oder `vision` suchen;
- sehen, welche Modelle derzeit aktiviert sind;
- Modelle stapelweise aktivieren oder deaktivieren.

Die Quellendimension muss Teil dieses Designs bleiben. OpenRouter ist nur die erste dynamische Katalogquelle; zukünftige Quellen wie ModelScope und ModelStudio sollten dem gleichen Muster folgen. Die UI-Komplexität kann reduziert werden, aber die zugrunde liegende Quellenabstraktion sollte als Erweiterungspunkt verfügbar bleiben.

## Aktuelle Abgrenzung

Diese Änderung sollte das Nötigste tun, um OpenRouter-Authentifizierung und Modelleinrichtung angenehm zu gestalten:

- OAuth- oder schlüsselbasierte Authentifizierung konfiguriert OpenRouter über den bestehenden OpenAI-kompatiblen Provider-Pfad.
- Die anfängliche aktivierte Modellmenge wird kuratiert, anstatt den vollständigen Katalog in die Einstellungen zu übernehmen.
- Vollständige Katalogspeicherung, Durchsuchen, Filtern und Stapelverwaltung werden auf `/manage-models` verschoben.

Das Designprinzip ist einfach: Authentifizierung sollte Benutzer schnell in einen funktionsfähigen Zustand bringen, während die Modellkuratierung in einem dedizierten Verwaltungsablauf stattfinden sollte.