# TUI-Abstandsoptimierung PR2 – Halbzeilenbänder und kompakte Abstände

## Hintergrund

PR1 hat den vertikalen Abstand der TUI vorläufig gestrafft, indem überflüssige Leerzeilen innerhalb von Tool-Gruppen entfernt wurden. In der praktischen Nutzung gibt es jedoch noch zwei Probleme mit der Benutzererfahrung:

1. **Fehlende visuelle Trennung zwischen Benutzernachrichten und Assistentenantworten** – In langen Unterhaltungen ist es schwer, schnell zu erkennen, "wo meine Frage beginnt".
2. **Blockabstände sind immer noch zu groß** – An den Übergängen zwischen Frage und Antwort befindet sich jeweils eine ganze Leerzeile, was Bildschirmplatz verschwendet.

## Diese Änderungen

### 1. Halbzeilenbänder für Benutzernachrichten

Über und unter der Benutzernachricht wird jeweils eine halbhelle Linie in halber Höhe hinzugefügt, und der Inhaltsbereich erhält dieselbe `backgroundColor`, wodurch ein nahtloses dreischichtiges Band entsteht:

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄   ← foreground = bandColor (untere Hälfte einfärben)
> Inhalt der Benutzerfrage    ← backgroundColor = bandColor (gesamter Zeilenhintergrund)
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   ← foreground = bandColor (obere Hälfte einfärben)
```

- Die Farbe wird über `subtleBandColor()` berechnet: Eine reine Helligkeitsverschiebung von 6 % basierend auf der Hintergrundfarbe (dunkles Terminal → etwas heller, helles Terminal → etwas dunkler), ohne Änderung des Farbtons.
- Terminals ohne 24-Bit-Farbunterstützung / Screenreader / `NO_COLOR`-Umgebungen fallen automatisch auf die normale Anzeige zurück (`marginTop=1`).
- Schutz vor negativer/Null-Breite.

### 2. Straffung der Frage-Antwort-Abstände

| Position | Vorher | Nachher |
| --- | --- | --- |
| Über der Benutzernachricht | 1 Leerzeile | 0 (visuelle Trennung durch das Band; bei Fallback bleibt `marginTop=1`) |
| Über der Modellausgabe | 1 Leerzeile | 1 Leerzeile (beibehalten, um Denkprozess und finale Ausgabe zu trennen) |
| Über Tool-Aufrufen/Statusmeldungen | 1 Leerzeile | 0 |
| Am Ende des Denk-Textes | Möglicherweise überflüssige Zeilenumbrüche | `trimEnd()` verhindert doppelte Leerzeilen |

Die Sequenz "Antwort → Tool-Aufruf → Antwort" innerhalb derselben Konversationsrunde enthält keine überflüssigen Leerzeilen mehr, was die Informationen kompakter und kohärenter macht.

## Vorher-Nachher-Vergleich

**Vorher:**

```
(1 Leerzeile)
> Lies bitte package.json
(1 Leerzeile)
✦ Okay, ich lese die Datei.
(1 Leerzeile)
┌ Read package.json ─────────┐
│ ✓ Read  package.json       │
└────────────────────────────┘
(1 Leerzeile)
✦ Hier ist der Dateiinhalt: ...

(1 Leerzeile)
┌─ Eingabefeld ─────────────┐
```

**Nachher:**

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
> Lies bitte package.json
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
✦ Okay, ich lese die Datei.
┌ Read package.json ─────────┐
│ ✓ Read  package.json       │
└────────────────────────────┘
(1 Leerzeile)
✦ Hier ist der Dateiinhalt: ...

(1 Leerzeile)
┌─ Eingabefeld ─────────────┐
```

## Unverändert

- Das Rahmenstyling für Tool-Aufrufe bleibt unverändert.
- Die Absatzabstände im Markdown-Text bleiben unverändert (1 Zeile ist bereits die kleinste Einheit im Terminal).
- Die Farbwerte für das dunkle/helle Theme bleiben unverändert.
- Die Abstände im Eingabebereich (Composer) bleiben unverändert bei `marginTop=1`.