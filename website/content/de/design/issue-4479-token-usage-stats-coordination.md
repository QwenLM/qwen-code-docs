# Issue #4479 Token-Verbrauchsstatistik-Koordination

## Kontext

Issue #4479 fordert eine tägliche Sichtbarkeit des Qwen-Code-Tokenverbrauchs. Der Umfang wurde im Issue-Thread präzisiert: Bevorzugt werden ein CLI-Befehl, Export-Unterstützung, monatliche Zusammenfassungen und der Tokenverbrauch pro Modell. Ein Kommentar eines Maintainers wies außerdem auf die Koordination mit benachbarten Statistikarbeiten hin:

- #4252: Generierungs-Timing-Metriken in `/stats` wie TTFT, Generierungsdauer und TPS.
- #4182: Inhaltsfreie Sitzungszähler für Speicherdiagnose.

## Koordinationsentscheidungen

1. **Verwende `/stats`, keinen neuen Befehl auf oberster Ebene.**
   Der Tokenverbrauch wird als `/stats daily`, `/stats monthly` und `/stats export` bereitgestellt, sodass er die bestehende Befehlsfläche der Statistik mit Sitzungsstatistiken und zukünftigen Generierungsmetriken teilt.

2. **Persistiere Token-Zähler als lokales JSONL.**
   Jede API-Antwort fügt einen inhaltsfreien Datensatz an `usage/token-usage-YYYY-MM.jsonl` im Laufzeitverzeichnis an. Dies erfüllt die tägliche/monatliche Aggregation, ohne SQLite als neue Abhängigkeit hinzuzufügen.

3. **Behalte die Timing-Semantik von #4252 separat.**
   Zusammenfassungen des Tokenverbrauchs können `apiDurationMs` enthalten – die bestehende End-to-End-API-Antwortdauer aus der Telemetrie. Sie wird bewusst als API-Dauer bezeichnet und darf nicht als Generierungsdauer, TTFT oder TPS dargestellt werden. #4252 bleibt der Eigentümer für Generierungs-Timing-Metriken.

4. **Behalte die Datenschutz- und Speicherdiagnose-Grenzen von #4182.**
   Nutzungsdatensätze speichern nur aggregierte Zähler und stabile Dimensionen: lokales Datum, Monat, Sitzungs-ID, Modell, Authentifizierungstyp, Quelle, Token-Zähler und API-Dauer. Sie speichern keinen Prompt-Text, Antworttext, Tool-Inhalt, Projektpfade, Prompt-IDs oder Antwort-IDs.

5. **Export bleibt nur aggregiert.**
   CSV- und JSON-Exporte sind Zusammenfassungen, keine Rohdaten-Transkriptexporte. Sie gruppieren nach Gesamt, Modell, Authentifizierungstyp, Modell/Authentifizierungstyp und Quelle.

## Nicht-Ziele

- Implementiere hier nicht die TTFT-/TPS-/Generierungsdauer-Instrumentierung von #4252.
- Erweitere `/doctor memory` nicht und implementiere #4182 in dieser Änderung nicht.
- Füge keinen separaten Tokenverbrauchs-Befehl auf oberster Ebene hinzu.