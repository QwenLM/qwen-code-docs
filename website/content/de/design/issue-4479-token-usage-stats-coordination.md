# Issue #4479 Koordination der Token-Verbrauchsstatistiken

## Kontext

Issue #4479 fordert tägliche Transparenz über den Token-Verbrauch von Qwen Code. Der Umfang wurde im Issue-Thread präzisiert: Bevorzugt werden ein CLI-Befehl, Exportunterstützung, monatliche Zusammenfassungen und der Token-Verbrauch pro Modell. Ein Kommentar eines Maintainers wies auch auf die Koordination mit benachbarten Statistikarbeiten hin:

- #4252: Generierungs-Timing-Metriken in `/stats` wie TTFT, Generierungsdauer und TPS.
- #4182: inhaltsfreie Sitzungszähler im Sitzungsmaßstab für Speicherdiagnosen.

## Koordinationsentscheidungen

1. **`/stats` verwenden, keinen neuen Befehl auf oberster Ebene.**
   Der Token-Verbrauch wird als `/stats daily`, `/stats monthly` und `/stats export` bereitgestellt, sodass er die bestehende Statistik-Befehlsoberfläche mit Sitzungsstatistiken und zukünftigen Generierungsmetriken teilt.

2. **Token-Zähler als lokales JSONL persistieren.**
   Jede API-Antwort fügt einen inhaltsfreien Datensatz an `usage/token-usage-YYYY-MM.jsonl` im Runtime-Verzeichnis an. Dies erfüllt die tägliche/monatliche Aggregation, ohne SQLite als neue Abhängigkeit hinzuzufügen.

3. **Timing-Semantik von #4252 getrennt halten.**
   Token-Verbrauchszusammenfassungen können `apiDurationMs` enthalten, die bestehende End-to-End-API-Antwortdauer aus der Telemetrie. Sie wird bewusst als API-Dauer bezeichnet und darf nicht als Generierungsdauer, TTFT oder TPS dargestellt werden. #4252 bleibt für Generierungs-Timing-Metriken zuständig.

4. **Datenschutz- und Speicherdiagnosegrenzen von #4182 beibehalten.**
   Verbrauchsdatensätze speichern nur aggregierte Zähler und stabile Dimensionen: lokales Datum, Monat, Sitzungs-ID, Modell, Authentifizierungstyp, Quelle, Token-Zähler und API-Dauer. Sie speichern keinen Prompt-Text, Antworttext, Tool-Inhalt, Projektpfade, Prompt-IDs oder Antwort-IDs.

5. **Export bleibt aggregiert.**
   CSV- und JSON-Exporte sind Zusammenfassungen, keine Rohdatenexporte. Sie gruppieren nach Gesamt, Modell, Authentifizierungstyp, Modell/Authentifizierungstyp und Quelle.

## Nicht-Ziele

- Die TTFT/TPS/Generierungsdauer-Instrumentierung von #4252 hier nicht implementieren.
- `/doctor memory` nicht erweitern oder #4182 in dieser Änderung implementieren.
- Keinen separaten Token-Verbrauchs-Slash-Befehl auf oberster Ebene hinzufügen.
