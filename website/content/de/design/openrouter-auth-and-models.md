# Design der OpenRouter-Authentifizierung und Modellverwaltung

Dieses Dokument beschreibt die Designabsicht hinter dem OpenRouter-Auth-Flow und den
damit eingeführten Änderungen an der Modellverwaltung. Es konzentriert sich bewusst auf
Produkt- und Architektur-Entscheidungen, nicht auf die Implementierungshistorie.

## Ziele

- Ermöglicht Benutzern die Authentifizierung bei OpenRouter sowohl über die CLI als auch über `/auth`.
- Wiederverwendung des bestehenden OpenAI-kompatiblen Provider-Pfads, anstatt einen neuen Auth-
Typ für OpenRouter hinzuzufügen.
- Die Erststart-Erfahrung nutzbar machen, ohne Benutzer sofort mit der Verwaltung Hunderter
Modelle zu belasten.
- Einen klaren Weg zu einer umfassenderen Modellverwaltung über `/manage-models` offenhalten.

## OpenRouter-Authentifizierung

OpenRouter ist als OpenAI-kompatibler Provider integriert:

- Auth-Typ: `AuthType.USE_OPENAI`
- Provider-Einstellungen: `modelProviders.openai`
- API-Key-Umgebungsvariable: `OPENROUTER_API_KEY`
- Base-URL: `https://openrouter.ai/api/v1`

Dies vermeidet die Einführung eines OpenRouter-spezifischen `AuthType`, da der Laufzeit-
Provider-Pfad für Modelle bereits OpenAI-kompatibel ist. Dadurch bleiben Auth-Status, Modell-
Auflösung, Provider-Auswahl und Settings-Schema mit der bestehenden Provider-Abstraktion synchron.

Die benutzerseitigen Abläufe sind:

- `qwen auth openrouter --key <key>` für Automatisierung oder direktes API-Key-Setup.
- `qwen auth openrouter` für browserbasiertes OAuth.
- `/auth` → API Key → OpenRouter für den TUI-Ablauf.

Browser-OAuth nutzt den PKCE-Flow von OpenRouter und schreibt den ausgetauschten API-Key in die
Einstellungen, bevor die Authentifizierung als `AuthType.USE_OPENAI` aktualisiert wird.

## Modellverwaltung

OpenRouter stellt einen großen dynamischen Modellkatalog bereit. Jedes entdeckte Modell
in `modelProviders.openai` zu schreiben, würde `/model` unübersichtlich machen und ein langfristiges
Settings-Feld in einen Cache eines Remote-Katalogs verwandeln.

Die zentrale Design-Trennung ist:

- **Katalog**: Die vollständige Menge an Modellen, die von einer Quelle wie
OpenRouter entdeckt wurden.
- **Aktivierte Menge**: Die kleinere Menge an Modellen, die in `/model` erscheinen und
in den Benutzereinstellungen persistiert werden sollen.

Beim initialen OpenRouter-Ablauf sollte die Authentifizierung mit einer nützlichen Standard-
Aktivierungsmenge enden, anstatt den Benutzer mit einem großen Auswahldialog zu unterbrechen. Die empfohlene Menge
sollte klein, stabil und auf Modelle ausgerichtet sein, die Benutzern einen erfolgreichen Produkttest
ermöglichen, einschließlich kostenloser Modelle, falls verfügbar.

`/model` bleibt ein schneller Modell-Switcher. Es sollte nicht zum Ort werden, an dem
Benutzer einen vollständigen Provider-Katalog durchsuchen und kuratieren.

## `/manage-models`

Umfassendere Modellverwaltung gehört in einen separaten Einstiegspunkt `/manage-models`. Dieser
Ablauf sollte Benutzern ermöglichen:

- entdeckte Modelle zu durchsuchen;
- nach ID, Anzeigenamen, Provider-Präfix und abgeleiteten Tags wie `free` oder
`vision` zu suchen;
- zu sehen, welche Modelle aktuell aktiviert sind;
- Modelle stapelweise zu aktivieren oder zu deaktivieren.

Die Quell-Dimension muss Teil dieses Designs bleiben. OpenRouter ist nur die
erste dynamische Katalogquelle; zukünftige Quellen wie ModelScope und ModelStudio
sollten in dieselbe Struktur passen. Die UI-Komplexität kann reduziert werden, aber die zugrunde liegende
Quellen-Abstraktion sollte als Erweiterungspunkt verfügbar bleiben.

## Aktueller Umfang

Diese Änderung sollte das Nötigste tun, um OpenRouter-Authentifizierung und Modell-Setup
angenehm zu gestalten:

- OAuth- oder key-basierte Authentifizierung konfiguriert OpenRouter über den bestehenden
OpenAI-kompatiblen Provider-Pfad.
- Die initiale aktivierte Modellmenge wird kuratiert, anstatt den vollständigen Katalog
in die Einstellungen zu schreiben.
- Vollständige Katalogspeicherung, Durchsuchen, Filtern und Stapelverwaltung werden auf
`/manage-models` verschoben.

Das Designprinzip ist einfach: Die Authentifizierung sollte Benutzer schnell in einen funktionsfähigen
Zustand bringen, während die Modellkuratierung in einem dedizierten Verwaltungsablauf stattfinden sollte.