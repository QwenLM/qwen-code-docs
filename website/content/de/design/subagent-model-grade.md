# Subagent-Modellstufen-Auswahl

## Ziel

Das Modell darf beim Starten eines regulären Subagents eine vom Nutzer
definierte Modellstufe wählen, ohne dass Provider-spezifische Modell-IDs
im Agent-Tool-Schema sichtbar werden.

```json
{
  "agents": {
    "modelGrades": {
      "small": "fast",
      "high": "qwen-max"
    },
    "allowedGrades": ["small", "high"]
  }
}
```

Das Agent-Tool bietet `model: "small" | "high"` an und löst die gewählte
Stufe unmittelbar nach dem Laden der Subagent-Konfiguration auf.

## Auflösung

Der effektive Modell-Selektor verwendet diese Priorität:

1. Ein explizites Modell eines Nicht-Built-in-Agents (nicht `inherit`)
2. Eine erlaubte Stufe, abgebildet über `agents.modelGrades`
3. Die eingebaute Explore-Modell-Einstellung
4. Das geerbte Eltern-Modell

Unbekannte oder nicht erlaubte Stufen werden abgelehnt. Forks lehnen den
Parameter ab, weil sie das Modell und den Prompt-Cache des Elternteils
erben müssen. Benannte Teammates lehnen ihn ebenfalls ab, weil ihr
Backend-Modell-Override konkrete Modell-IDs statt Stufen-Selektoren
akzeptiert.

Nur konfigurierte, erlaubte Stufennamen werden in das dynamische
Tool-Schema aufgenommen. Konkrete Modell-Selektoren bleiben den
Nutzer-Settings vorbehalten.

## Verifikation

- Settings-Schema und CLI-zu-Core-Konfigurationsweiterleitung
- Stufenauflösung, Allowlist-Filterung und Custom-Agent-Priorität
- Dynamisches Agent-Tool-Schema ohne konkrete Modell-IDs
- Regulärer Vordergrund- und Hintergrund-Dispatch mit dem aufgelösten
  Modell
- Fork-Validierung
