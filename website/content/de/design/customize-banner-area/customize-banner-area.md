# Anpassung des Bannerbereich-Designs

> Erlauben Sie Benutzern, die QWEN-ASCII-Kunst zu ersetzen, den Markentitel zu ersetzen und
> das Banner vollständig auszublenden – ohne ihnen zu erlauben, die Betriebsdaten
> (Version, Authentifizierung, Modell, Arbeitsverzeichnis) zu unterdrücken, die Qwen Code
> debuggbar und vertrauenswürdig machen.

## Übersicht

Die Qwen Code CLI gibt beim Start ein Banner aus, das ein QWEN-ASCII-Logo
und ein umrandetes Info-Panel enthält. Mehrere reale Anwendungsfälle möchten eine gewisse Kontrolle
über diese Oberfläche haben:

- **White-Label / Integration von Drittanbieter-Marken**: Unternehmen und Teams,
  die Qwen Code in ihre eigenen Produkte einbetten, möchten ihre Markenidentität
  anzeigen, anstatt der Standardbezeichnung "Qwen Code".
- **Personalisierung**: Einzelpersonen möchten das Terminal-Banner an einen
  Teamstandard oder ihren eigenen Geschmack anpassen.
- **Multi-Tenant-/Multi-Instanz-Unterscheidung**: In gemeinsam genutzten Umgebungen
  möchten verschiedene Teams ein schnelles visuelles Signal, in welcher Instanz sie sich
  befinden.

Die Designhaltung ist einfach: **Branding ist ersetzbar; Betriebsdaten
nicht**. Die Anpassung sollte es Benutzern erlauben, ihr eigenes Branding oben drauf zu setzen,
nicht die Informationen zu unterdrücken, die eine Session debuggbar machen.
Diese Haltung treibt jede Entscheidung über "was geändert werden kann vs. was gesperrt ist"
im Rest dieses Dokuments.

Dies wird verfolgt unter [Issue #3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Taxonomie der Bannerregionen

Heute wird das Banner von `Header` (eingebunden von `AppHeader`) gerendert und
unterteilt sich in die folgenden Regionen:

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo Column ─────┐  gap=2  ┌──── Info Panel (bordered) ──────────┐  │
│   │                      │         │                                     │  │
│   │  ███ QWEN ASCII ███  │         │  ① Title:    >_ Qwen Code (vX.Y.Z)  │  │
│   │  ███   ART ART  ███  │         │  ② Subtitle: «blank, or override»   │  │
│   │  ███ QWEN ASCII ███  │         │  ③ Status:   Qwen OAuth | qwen-…    │  │
│   │                      │         │  ④ Path:     ~/projects/example     │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              region: AppHeader
                          │ Tips component renders below (governed by ui.hideTips) │
```

Die beiden übergeordneten Boxen sind:

- **A. Logo-Spalte** — ein einzelner ASCII-Art-Block mit einem Farbverlauf. Stammt
  heute aus `shortAsciiLogo` in
  `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Info-Panel** — eine umrandete Box mit vier Zeilen. Die zweite
  Zeile ist standardmäßig ein leerer visueller Abstandshalter, optional ersetzt durch einen
  vom Aufrufer bereitgestellten Untertitel:
  - **B①** Titel: `>_ Qwen Code (vX.Y.Z)` — Markentext + Versionssuffix.
  - **B②** Untertitel / Abstandshalter: standardmäßig leere Zeile mit einem Leerzeichen. Wenn
    `ui.customBannerSubtitle` gesetzt ist, nimmt dieser String diese Zeile ein (z. B.
    könnte ein Fork `Built-in DataWorks Official Skills` verwenden).
  - **B③** Status: `<auth display type> | <model> ( /model to change)`.
  - **B④** Pfad: ein tildeifiziertes, verkürztes Arbeitsverzeichnis.

Das Ganze wird von `<AppHeader>` umschlossen, welches das Banner bereits
auf `showBanner = !config.getScreenReader()` begrenzt (Screenreader-Modus
fällt auf einfache Ausgabe zurück).

## Anpassungsregeln – was geändert werden kann, was gesperrt ist

| Region                                      | Heutige Quelle                      | Kategorie der Anpassung          | Begründung                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Logo-Spalte**                          | `shortAsciiLogo` (`AsciiArt.ts`)    | **Ersetzbar + automatisch ausblendbar** | Reine Markenoberfläche. White-Label benötigt volle Kontrolle über das Visuelle. Der bestehende "Auto-Hide bei schmalen Terminals"-Fallback bleibt erhalten.                                                                      |
| **B①. Titel – Markentext** (`>_ Qwen Code`) | Hartcodiert in `Header.tsx`          | **Ersetzbar**                 | Markenoberfläche. Das führende `>_`-Glyph ist Teil der bestehenden Marke; wenn ein Benutzer es entfernen möchte, lässt er es einfach aus `customBannerTitle` weg.                                                                  |
| **B①. Titel – Versionssuffix** (`(vX.Y.Z)`) | `version`-Prop                      | **Gesperrt**                      | Kritisch für Fehlerberichte. Das Verstecken macht die Frage "Welche Version hast du?" nur über `--version` beantwortbar, was in Support-Workflows echte Kosten verursacht. Wir tauschen einen kleinen White-Label-Verlust gegen Support-Nachvollziehbarkeit. |
| **B②. Untertitel / Abstandshalter-Zeile**               | standardmäßig leer                    | **Ersetzbar**                 | Reine Marken-/Kontextoberfläche. Wird von White-Label-Forks verwendet, um den Build zu kennzeichnen (z. B. "Built-in DataWorks Official Skills"). Wie der Titel bereinigt; nur eine Zeile – keine layoutbrechenden Zeilenumbrüche.               |
| **B③. Statuszeile** (Auth + Modell)          | `formattedAuthType`-, `model`-Props  | **Gesperrt**                      | Betriebs- und Sicherheitssignal. Benutzer müssen immer sehen, welche Anmeldeinformationen verwendet werden und welches Modell ihre Tokens ausgibt. Das Unterdrücken ist selbst für White-Label-Szenarien ein Eigentor.                       |
| **B④. Pfadzeile** (Arbeitsverzeichnis)       | `workingDirectory`-Prop             | **Gesperrt**                      | Betrieblich. "In welchem Verzeichnis bin ich?" ist eine ständige Frage; das Banner ist die kanonische Antwort.                                                                                                          |
| **Gesamtes Banner** (A + B)                    | `<Header>`-Einbindung in `AppHeader.tsx` | **Ausblendbar**                    | Ein einzelnes `ui.hideBanner: true` überspringt beide Regionen – gleiches Verhalten wie das bestehende Screenreader-Gate. `<Tips>` wird weiterhin unabhängig von `ui.hideTips` gesteuert.                                         |

Die Matrix ergibt vier Einstellungen, nicht mehr:

| Einstellung                   | Standard | Effekt                                                                                                                               | Betroffene Region |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `ui.hideBanner`           | `false` | Versteckt das gesamte Banner (Regionen A + B).                                                                                             | A + B           |
| `ui.customBannerTitle`    | nicht gesetzt   | Ersetzt den Markentext in B①. Das Versionssuffix wird weiterhin angehängt. Getrimmt; ein leerer String bedeutet "Standard verwenden".                   | B① Markentext   |
| `ui.customBannerSubtitle` | nicht gesetzt   | Ersetzt die leere Abstandshalterzeile B② durch einen einzeiligen Untertitel. Bereinigt; auf 160 Zeichen begrenzt; leer bedeutet "leeren Abstandshalter behalten". | B② Abstandshalter       |
| `ui.customAsciiArt`       | nicht gesetzt   | Ersetzt Region A. Drei akzeptierte Formen (siehe unten). Fällt bei Fehlern auf Standard zurück.                                            | A               |

Was **nicht** angeboten wird, absichtlich:

- Keine Einstellung versteckt nur das Versionssuffix.
- Keine Einstellung versteckt nur die Auth/Modell-Zeile.
- Keine Einstellung versteckt nur die Pfadzeile.
- Keine Einstellung ändert die Farbverlaufsfarben des Logos (das Theme ist dafür zuständig).
- Keine Einstellung ordnet das Info-Panel neu oder strukturiert es um.

Falls die Implementierung später eine davon bereitstellen muss, sollten sie
neue Felder mit eigener Begründung sein – nicht von den drei obigen Feldern abgeleitet.

## Benutzerkonfigurationsleitfaden – wie man Änderungen vornimmt

### Limits auf einen Blick

Eine Handvoll Limits gelten für jede Banneranpassung. Behalten Sie sie im Hinterkopf, bevor Sie von Hand Kunst erstellen, damit der Resolver Ihre Eingabe nicht abschneidet oder ablehnt.

| Was                             | Limit                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zeichenanzahl des Titels**        | **80 Zeichen max** (nach Bereinigung). Alles Längere wird abgeschnitten und eine `[BANNER]`-Warnung wird protokolliert. Zeilenumbrüche und Steuerzeichen werden vor der Längenmessung entfernt. |
| **Zeichenanzahl des Untertitels**     | **160 Zeichen max** (nach Bereinigung). Gleiche Bereinigungspipeline wie der Titel; gleiche `[BANNER]`-Warnung bei Abschneidung.                                                             |
| **Größe des ASCII-Art-Blocks**         | **200 Zeilen × 200 Spalten max** pro Stufe. Alles Größere wird auf das Passende abgeschnitten und eine `[BANNER]`-Warnung wird protokolliert.                                                              |
| **Dateigröße der ASCII-Art auf Disc**  | **64 KB max**. Größere Dateien werden bis zum Limit gelesen; der Rest wird ignoriert.                                                                                                    |
| **Breite der ASCII-Art beim Rendern** | Wird von den Terminal-Spalten beim Start bestimmt, **nicht** eine feste Zeichenanzahl. Siehe "Wie breit kann das Logo sein?" unten für die Formel und Zahlen pro Terminal.                     |

Es gibt **kein festes Zeichenanzahllimit für die ASCII-Kunst** – nur die
Spalten-/Zeilengrenzen oben und das startzeitliche Breitenbudget.

### Wo Einstellungen gespeichert werden

Alle vier Einstellungen befinden sich unter `ui` in `settings.json`. Sowohl benutzerebene
(`~/.qwen/settings.json`) als auch Arbeitsbereichsebene (`.qwen/settings.json` im
Projektstamm) werden mit der standardmäßigen Zusammenführungspriorität unterstützt
(Arbeitsbereich überschreibt Benutzer, System überschreibt Arbeitsbereich).

`customAsciiArt` wird speziell behandelt: Anstatt das gesamte Objekt
als einen Wert zu behandeln, der durch den Bereich mit höherer Priorität ersetzt wird,
durchläuft der Resolver die Bereiche pro Stufe. Wenn die Benutzereinstellungen `{ small }` definieren
und die Arbeitsbereichseinstellungen `{ large }` definieren, tragen beide bei – `small` vom Benutzer,
`large` vom Arbeitsbereich. Dies hält zwei Dinge gleichzeitig funktionsfähig:

1. Jeder `{ path }`-Eintrag wird gegen die Datei aufgelöst, die ihn deklariert hat
   (Arbeitsbereich `.qwen/` vs. Benutzer `~/.qwen/`); die alleinige zusammengeführte Ansicht würde
   diese Bereichsinformation verlieren.
2. Benutzer können eine Standard-`large`-Stufe in ihren persönlichen Einstellungen behalten und
   nur `small` pro Arbeitsbereich überschreiben, ohne das gesamte Objekt erneut angeben zu müssen.

Wenn dieselbe Stufe in mehreren Bereichen definiert ist, gilt die normale Priorität
(System > Arbeitsbereich > Benutzer). Das Setzen von `customAsciiArt` auf einen bloßen
String oder `{ path }` in einem Bereich füllt trotzdem beide Stufen in diesem Bereich.

### Banner vollständig ausblenden

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

Die Startausgabe überspringt sowohl die Logo-Spalte als auch das Info-Panel. Tipps
werden weiterhin gerendert, es sei denn, `ui.hideTips` ist ebenfalls `true`.

### Markentitel ersetzen

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

Wird im Info-Panel als `Acme CLI (vX.Y.Z)` gerendert. Das `>_`-Glyph wird
entfernt, wenn ein benutzerdefinierter Titel gesetzt ist; wenn Sie es zurück haben möchten, fügen Sie es
selbst hinzu: `"customBannerTitle": ">_ Acme CLI"`.

### Markenuntertitel hinzufügen

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

Rendert den Untertitel in einer eigenen Zeile, in der sekundären Textfarbe,
anstelle des leeren Abstandshalters, der normalerweise zwischen Titel und
Auth/Modell-Zeile sitzt:

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① Titel
│ Built-in DataWorks Official Skills                      │  ← B② Untertitel
│ Qwen OAuth | qwen-coder ( /model to change)             │  ← B③ Status
│ ~/projects/example                                      │  ← B④ Pfad
└─────────────────────────────────────────────────────────┘
```

Einschränkungen:

- Nur eine Zeile. Zeilenumbrüche und andere Steuerbytes werden entfernt /
  zu Leerzeichen umgewandelt, damit ein versehentliches Einfügen das Layout des Info-Panels
  nicht zerstören kann.
- Bereinigt und auf 160 Zeichen begrenzt (lockerer als die Titelbegrenzung, weil
  Slogans / "powered by"-Zeilen oft etwas länger sind).
- Lassen Sie das Feld ungesetzt (oder setzen Sie es auf einen leeren String / Leerzeichen),
  um die bestehende leere Abstandshalterzeile zu behalten – Rückwärtskompatibilität ist der Standard.
- Der Untertitel ändert nicht, welche Zeilen gesperrt sind; Auth, Modell
  und Arbeitsverzeichnis sind immer sichtbar, unabhängig vom Zustand des Untertitels.

### ASCII-Art ersetzen – Inline-String

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Verwenden Sie `\n`, um Zeilenumbrüche innerhalb des JSON-Strings einzubetten. Die Kunst wird
mit dem aktiven Farbverlaufsthema gerendert, genau wie das Standardlogo.

> **Keine ASCII-Kunst zur Hand?** Verwenden Sie einen externen Generator und fügen Sie
> das Ergebnis ein. Der einfachste Weg ist `figlet`:
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` und dann zeigen Sie
> `customAsciiArt: { "path": "./brand.txt" }` darauf. Die CLI rendert Text nicht zur Laufzeit in Kunst – siehe den Abschnitt _Out of scope_ für den Grund.

### ASCII-Art ersetzen – externe Datei

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Vermeidet JSON-Escaping eines mehrzeiligen Strings. Pfadauflösungsregeln:

- **Arbeitsbereichseinstellungen**: relative Pfade werden gegen das Arbeitsverzeichnis
  `.qwen/` aufgelöst.
- **Benutzereinstellungen**: relative Pfade werden gegen `~/.qwen/` aufgelöst.
- Absolute Pfade werden unverändert verwendet.
- Die Datei wird **einmal beim Start** gelesen, bereinigt und zwischengespeichert. Das Bearbeiten
  der Datei während einer Sitzung rendert das Banner nicht neu – starten Sie die CLI neu.

### ASCII-Art ersetzen – breitenabhängig

```jsonc
{
  "ui": {
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

`large` wird bevorzugt, wenn das Terminal breit genug ist; andernfalls wird `small`
verwendet; ansonsten wird die Logo-Spalte ausgeblendet (der bestehende zweispaltige Fallback). Jede Stufe kann ein String oder `{ path }` sein. Jede Stufe kann
weggelassen werden: Eine fehlende Stufe fällt einfach auf den nächsten Schritt zurück.

### Wie breit kann das Logo sein? – Das Größenbudget

Es gibt kein festes Zeichenanzahllimit für den Titel oder die Kunst. Es gibt ein
**Breitenbudget**, das von den Terminal-Spalten bestimmt wird, und eine absolute harte Grenze, um zu verhindern, dass eine fehlerhafte Datei das Layout einfriert:

| Parameter                                             | Limit                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Terminal-Spalten beim Start                      | Was auch immer das Terminal des Benutzers meldet.                     |
| Äußerer Rand des Containers                           | 4 Spalten (2 links + 2 rechts).                                      |
| Abstand zwischen Logo und Info-Panel                  | 2 Spalten.                                                           |
| Mindestbreite des Info-Panels                         | 44 Spalten (40 Pfad + Rand + Auffüllung).                            |
| **Verfügbare Logobreite** (pro Stufe, zur Renderzeit) | `terminalCols − 4 − 2 − 44 = terminalCols − 50`.                    |
| Harte Grenze pro Kunststufe (nach Bereinigung)        | 200 Spalten × 200 Zeilen. Alles Darüberhinausgehende wird abgeschnitten + `[BANNER]`-Warnung. |
| Harte Grenze für `customBannerTitle` (nach Bereinigung)  | 80 Zeichen. Alles Darüberhinausgehende wird abgeschnitten + `[BANNER]`-Warnung. |

Das Budget bei gängigen Terminalbreiten:

| Terminal-Spalten | Maximale Logobreite, die gerendert wird | Was das in der Praxis bedeutet                                           |
| ------------- | --------------------------- | --------------------------------------------------------------------- |
| 80            | 30                          | Die meisten figlet "ANSI Shadow"-Buchstaben sind ~7–11 Spalten – max. 3 Buchstaben. |
| 100           | 50                          | Ein kurzes Wort in ANSI Shadow (~6 Buchstaben) oder zwei kurze Wörter gestapelt. |
| 120           | 70                          | Gestapelte mehrzeilige Wortkunst passt bequem.                        |
| 200           | 150                         | Lange Inline-Strings wie vollständige Produktnamen in ANSI Shadow passen. |

Zwei praktische Auswirkungen beim Gestalten Ihrer Kunst:

1. **Eine mehrwortige Marke wird oft nicht als einzelne ANSI-Shadow-Zeile auf den meisten Terminals gerendert.** Bei ~7–9 Spalten pro ANSI-Shadow-Buchstaben ist selbst eine 12-zeichende Marke wie `Custom Agent` ungefähr 95 Spalten Kunst auf einer Zeile – bereits mehr, als ein 100-Spalten-Terminal neben dem Info-Panel entbehren kann. Stapeln Sie entweder die Wörter auf mehreren Zeilen, wählen Sie eine dichtere figlet-Schriftart oder verwenden Sie eine kompakte einzeilige Textdekoration wie `▶ Custom Agent ◀`.
2. **Verwenden Sie die breitenbewusste `{ small, large }`-Form**, wenn eine einzelne Stufe Sie zwingen würde, zwischen "sieht breit großartig aus / stirbt schmal" und "sieht schmal in Ordnung aus / verschwendet breit Platz" zu wählen. Das folgende Beispiel stapelt die Wörter für ein ≥104-Spalten-Terminal in `large` und fällt auf eine 16-Spalten-einzeilige Dekoration in `small` zurück.

```jsonc
{
  "ui": {
    "customBannerTitle": "Custom Agent",
    "customAsciiArt": {
      "small": "▶ Custom Agent ◀",
      "large": { "path": "./banner-large.txt" },
    },
  },
}
```

Wobei `banner-large.txt` die gestapelte ANSI-Shadow-Ausgabe enthält
(~54 Spalten × 12 Zeilen), z. B. generiert durch:

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Alle drei kombinieren

```jsonc
{
  "ui": {
    "hideBanner": false,
    "customBannerTitle": "Acme CLI",
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

### So überprüfen Sie Ihre Änderung

1. Speichern Sie `settings.json` und starten Sie eine neue `qwen`-Sitzung – die Bannerauflösung läuft einmal beim Start.
2. Ändern Sie die Terminalgröße, um zu bestätigen, dass die Stufen `small` / `large` wie erwartet wechseln und die Logo-Spalte bei sehr schmalen Breiten verschwindet.
3. Wenn etwas nicht wie erwartet erscheint, schauen Sie in
   `~/.qwen/debug/<sessionId>.txt` (der Symlink `latest.txt` zeigt auf
   die aktuelle Sitzung) und suchen Sie mit `grep` nach `[BANNER]` – jeder weiche Fehler
   protokolliert eine Warnzeile mit dem zugrundeliegenden Grund.

## Auflösungspipeline

```
   settings.json                              packages/cli/src/ui/components/
   ─────────────                              ──────────────────────────────
   {                                          AppHeader.tsx
     "ui": {                                    │
       "hideBanner": false,                     │  showBanner =
       "customBannerTitle": "Acme",             │      !screenReader
       "customBannerSubtitle": "Built-in …",    │   && !ui.hideBanner
       "customAsciiArt": …                      │
     }                                          │
   }                                            ▼
        │                              <Header
        ▼                                customAsciiArt={resolved.asciiArt}
   loadSettings()                        customBannerTitle={resolved.title}
   merge user / workspace                customBannerSubtitle={resolved.subtitle}
        │                                version=… model=… authType=…
        ▼                                workingDirectory=… />
   resolveCustomBanner(settings)                  │
   ┌─────────────────────────┐                    ▼
   │ 1. normalize to         │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. resolve each tier:   │           │
   │    string → as-is       │           │  pick tier by
   │    {path} → fs.read     │           │    availableTerminalWidth
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │         render Logo Column
   │ 3. sanitize art:        │         render Info Panel:
   │    stripControlSeqs     │           Title    = customBannerTitle
   │    ≤ 200 lines × 200    │                   ?? '>_ Qwen Code'
   │    cols                 │           Subtitle = customBannerSubtitle
   │ 4. sanitize title +     │                   ?? blank spacer row
   │    subtitle (single-    │           Status   = locked
   │    line, ≤ 80 / 160     │           Path     = locked
   │    chars)               │
   │ 5. memoize by source    │
   └─────────────────────────┘
```
Der fünfstufige Auflösungsalgorithmus wird einmal beim Laden der Einstellungen ausgeführt und erneut nur bei Ereignissen zum Neuladen der Einstellungen:

1. **Normalisieren**. Ein einfacher `string` oder `{ path}` wird zu `{ small: x, large: x }`. Ein `{ small, large }`-Objekt wird unverändert durchgereicht.
2. **Jede Stufe auflösen**. Für jede `AsciiArtSource`:
   - Wenn es ein String ist, wird er unverändert verwendet.
   - Wenn es `{ path}` ist, wird die Datei synchron mit `O_NOFOLLOW`-Schutz gelesen (Windows: einfacher Read-Only — die Konstante ist nicht verfügbar), begrenzt auf 64 KB. Relative Pfade werden relativ zum *Verzeichnis der besitzenden Einstellungsdatei* aufgelöst — Workspace-Einstellungen gegen das Workspace `.qwen/`, Benutzereinstellungen gegen `~/.qwen/`. Lesefehler loggen eine `[BANNER]`-Warnung und fallen auf die Standardeinstellung für diese Stufe zurück.
3. **Bereinigen**. Ein bannerspezifischer Stripper entfernt OSC-/CSI-/SS2-/SS3-Führungszeichen und ersetzt jedes andere C0-/C1-Steuerbyte (und DEL) durch ein Leerzeichen, während `\n` erhalten bleibt, damit mehrzeilige Kunst überlebt. Entferne abschließende Leerzeichen pro Zeile, begrenze dann auf 200 Zeilen × 200 Spalten. Alles, was über dem Limit liegt, wird abgeschnitten und eine `[BANNER]`-Warnung wird geloggt.
4. **Renderzeit-Stufenauswahl**. In `Header.tsx`, gegeben das aufgelöste `small` und `large`, bewerte das vorhandene Breitenbudget (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`):
   - Bevorzuge `large`, wenn es passt.
   - Sonst falle auf `small` zurück, wenn es passt.
   - Sonst, **wenn der Benutzer benutzerdefinierte Kunst bereitgestellt hat**, verstecke die Logo-Spalte vollständig (der bestehende `showLogo = false`-Zweig) — ein Rückfall auf das mitgelieferte QWEN-Logo würde hier eine White-Label-Bereitstellung auf schmalen Terminals stillschweigend rückgängig machen. Das Info-Panel wird weiterhin gerendert.
   - Sonst (es wurde überhaupt keine benutzerdefinierte Kunst bereitgestellt) falle auf `shortAsciiLogo` durch und lasse die vorhandene Breitengrenze entscheiden, ob das Standard-Logo angezeigt oder ausgeblendet wird.
5. **Rückfall**. Wenn beide Stufen leer oder aufgrund weicher Fehler ungültig sind (fehlende Datei, Bereinigung hat alles abgelehnt, fehlerhafte Konfiguration), verhalte dich so, als ob keine Anpassung gesetzt worden wäre: rendere `shortAsciiLogo` und folge der Standard-Logo-Breitengrenze. Die CLI darf nie wegen eines Banner-Konfigurationsfehlers abstürzen.

Pseudocode für die Stufenauswahl:

```ts
function pickTier(
  small: string | undefined,
  large: string | undefined,
  availableWidth: number,
  logoGap: number,
  minInfoPanelWidth: number,
): string | undefined {
  for (const candidate of [large, small]) {
    if (!candidate) continue;
    const w = getAsciiArtWidth(candidate);
    if (availableWidth >= w + logoGap + minInfoPanelWidth) {
      return candidate;
    }
  }
  return undefined; // Logo-Spalte ausgeblendet
}
```

## Schema-Erweiterungen für Einstellungen

Vier neue Eigenschaften werden dem `ui`-Objekt in `packages/cli/src/config/settingsSchema.ts` angehängt, unmittelbar nach `shellOutputMaxLines`:

```ts
hideBanner: {
  type: 'boolean',
  label: 'Banner ausblenden',
  category: 'UI',
  requiresRestart: false,
  default: false,
  description: 'Das Start-ASCII-Banner und das Info-Panel ausblenden.',
  showInDialog: true,
},
customBannerTitle: {
  type: 'string',
  label: 'Benutzerdefinierter Bannertitel',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Ersetzt den standardmäßigen Titel ">_ Qwen Code", der im Banner-Info-Panel angezeigt wird. Der Version-Suffix wird immer angehängt.',
  showInDialog: false,
},
customBannerSubtitle: {
  type: 'string',
  label: 'Benutzerdefinierter Banner-Untertitel',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Optionale Untertitelzeile, die zwischen dem Bannertitel und der Authentifizierungs/Modell-Zeile gerendert wird. Wenn nicht gesetzt, behält das Info-Panel seine leere Abstandszeile.',
  showInDialog: false,
},
customAsciiArt: {
  type: 'object',
  label: 'Benutzerdefinierte ASCII-Kunst',
  category: 'UI',
  requiresRestart: false,
  default: undefined,
  description:
    'Ersetzt die standardmäßige QWEN-ASCII-Kunst. Akzeptiert einen Inline-String, {"path": "..."} oder {"small": ..., "large": ...} für breitenabhängige Auswahl.',
  showInDialog: false,
  // Die Laufzeit akzeptiert eine Vereinigung, die das `type`-Feld von SettingDefinition
  // nicht ausdrücken kann. Der Override wird vom JSON-Schema-Generator wörtlich ausgegeben,
  // sodass VS Code jede dokumentierte Form (string, {path} oder {small,large}) akzeptiert,
  // ohne die bloße String-Form zu beanstanden.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` spiegelt das bestehende `hideTips`-Muster wider (`showInDialog: true`). Die drei Freiformfelder (Titel, Untertitel, Kunst) bleiben außerhalb des In-App-Einstellungsdialogs, da ein mehrzeiliger ASCII-Editor im TUI-Dialog ein eigenes Projekt wäre; Power-User bearbeiten `settings.json` direkt.

## Änderungen der Verkabelung

Die Implementierungsberührungspunkte sind klein. Jeder wird unten mit der Datei und dem Zeilenbereich aus dem aktuellen `main` beschrieben.

`packages/cli/src/ui/components/AppHeader.tsx:53` — erweitere `showBanner`:

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — übergebe das aufgelöste Banner an `<Header>`:

```tsx
<Header
  version={version}
  authDisplayType={authDisplayType}
  model={model}
  workingDirectory={targetDir}
  customAsciiArt={resolvedBanner?.asciiArt /* { small?, large? } */}
  customBannerTitle={resolvedBanner?.title /* string | undefined */}
  customBannerSubtitle={resolvedBanner?.subtitle /* string | undefined */}
/>
```

`packages/cli/src/ui/components/Header.tsx` — erweitere `HeaderProps`:

```ts
interface HeaderProps {
  customAsciiArt?: { small?: string; large?: string };
  customBannerTitle?: string;
  customBannerSubtitle?: string;
  version: string;
  authDisplayType?: AuthDisplayType;
  model: string;
  workingDirectory: string;
}
```

`packages/cli/src/ui/components/Header.tsx:45-46` — wähle die Stufe vor der Berechnung von `logoWidth`, mit dem bestehenden Standard als Untergrenze:

```ts
const tier = pickTier(
  customAsciiArt?.small,
  customAsciiArt?.large,
  availableTerminalWidth,
  logoGap,
  minInfoPanelWidth,
);
const displayLogo = tier ?? shortAsciiLogo;
```

`packages/cli/src/ui/components/Header.tsx` — rendere den Titel aus der Prop und verwende die Untertitel-Prop anstelle der leeren Abstandszeile, wenn gesetzt:

```tsx
<Text bold color={theme.text.accent}>
  {customBannerTitle ? customBannerTitle : '>_ Qwen Code'}
</Text>
…
{customBannerSubtitle ? (
  <Text color={theme.text.secondary}>{customBannerSubtitle}</Text>
) : (
  <Text> </Text>
)}
```

**Neue Datei**: `packages/cli/src/ui/utils/customBanner.ts` — der Resolver. Exportiert:

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

Der Resolver führt die oben beschriebene Normalisierung, Dateilesevorgänge, Bereinigung und Zwischenspeicherung durch. Er wird einmal beim CLI-Start aufgerufen und bei Ereignissen zum Neuladen von Einstellungen erneut ausgeführt. Geltungsbereichsspezifische Dateipfade stammen direkt von `settings.system.path` / `settings.workspace.path` / `settings.user.path`, sodass jedes `{ path}` gegen die Datei aufgelöst wird, die es deklariert hat; Workspace-Einstellungen werden vollständig übersprungen, wenn `settings.isTrusted` `false` ist.

## Betrachtete alternative Ansätze

Fünf Formen dieser Funktion wurden in Betracht gezogen. Sie sind hier aufgeführt, damit zukünftige Mitwirkende den Designraum verstehen und die Wahl bei sich ändernden Randbedingungen überdenken können.

### Option 1 — Drei flache Einstellungen (EMPFOHLEN, entspricht dem Issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Effekt**: minimale Benutzeroberfläche; genau das, was das Issue verlangt.
- **Vorteile**: keine Lernkurve; trivial dokumentierbar; konsistent mit bestehenden flachen `ui.*`-Eigenschaften (`hideTips`, `customWittyPhrases` usw.).
- **Nachteile**: drei Schlüssel auf oberster Ebene, die konzeptionell zusammengehören, sind nicht gruppiert; zukünftige Banner-spezifische Knöpfe (Farbverlauf, Untertitel) würden weitere Geschwister zu `ui` hinzufügen, anstatt sauber zu verschachteln.

### Option 2 — Verschachtelter `ui.banner`-Namensraum

```jsonc
{
  "ui": {
    "banner": {
      "hide": false,
      "title": "Acme CLI",
      "asciiArt": { "path": "./brand.txt" },
    },
  },
}
```

- **Effekt**: gleiche Fähigkeiten wie Option 1, nach Funktion organisiert.
- **Vorteile**: sauberer Namensraum für zukünftige Banner-spezifische Knöpfe; einfachere Auffindbarkeit via `/settings`.
- **Nachteile**: weicht vom genauen Wortlaut des Issues ab; bestehende UI-Einstellungen sind meist flach (nur `ui.accessibility` und `ui.statusLine` verschachteln), daher ist die Konsistenz gemischt; fügt eine Verschachtelungsebene hinzu, die Benutzer sich merken müssen.

### Option 3 — Banner-Profil-Voreinstellungen + Slot-Overrides

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* slot overrides for 'branded' */ }
  }
}
```

- **Effekt**: Benutzer wählen aus benannten Voreinstellungen; fortgeschrittene Benutzer überschreiben Slots innerhalb eines gewählten Profils.
- **Vorteile**: schöne Onboarding-UX; Voreinstellungen werden mit der CLI ausgeliefert.
- **Nachteile**: erhebliche Komplexität; Voreinstellungen sind eine Wartungsverpflichtung; das Issue verlangt nach roher Anpassung, nicht nach Kuratierung.

### Option 4 — Ganzes Banner überschreiben (einzelne String-Vorlage)

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Effekt**: einzelne freie Vorlage mit ausgefüllten, festen Variablen.
- **Vorteile**: maximale Flexibilität für nicht standardmäßige Layouts.
- **Nachteile**: Implementiert Layout im Benutzerbereich neu; verliert Inks Zweispalten-Resilienz gegenüber Terminalbreite; sehr einfach, eine Vorlage zu schreiben, die auf schmalen Terminals bricht; große Schadensbreite für eine kleine Funktion.

### Option 5 — Plugin-/Hook-API

Einen Banner-Renderer-Hook über das Erweiterungssystem bereitstellen.

- **Effekt**: Code-Level-Anpassung; Erweiterungen können alles rendern.
- **Vorteile**: maximale Leistungsfähigkeit; ermöglicht Unternehmen, ein versiegeltes Branding-Plugin auszuliefern.
- **Nachteile**: große API-Oberfläche; benötigt Sicherheitsüberprüfung für willkürliches Terminal-Rendering; massiv überdimensioniert für das Issue.

### Empfehlung

**Option 1** wird empfohlen. Sie erfüllt das Issue wörtlich, fügt sich in den bestehenden `ui.*`-Stil ein und vermeidet, eine Entscheidung für einen verschachtelten Namensraum zu erzwingen, bevor wir wissen, wie andere Banner-spezifische Knöpfe tatsächlich aussehen. Wenn sich in Zukunft Geschwister ansammeln, ist die Migration zu Option 2 additiv – `ui.banner.title` und `ui.customBannerTitle` können während eines Deprecation-Fensters koexistieren.

## Sicherheit & Fehlerbehandlung

Der benutzerdefinierte Bannerinhalt wird wörtlich im Terminal gerendert UND in der Pfad-Form von der Festplatte gelesen. Beide Oberflächen sind angreifbar, wenn eine feindliche oder kompromittierte Einstellungsdatei geladen wird. Dasselbe Bedrohungsmodell, das die Sitzungstitel-Funktion antreibt, gilt hier.

| Bedenken                                                 | Schutz                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ANSI-/OSC-8-/CSI-Injection in Kunst, Titel oder Untertitel | Bannerspezifischer Stripper (`sanitizeArt` / `sanitizeSingleLine`): entfernt OSC-/CSI-/SS2-/SS3-Führungszeichen und ersetzt jedes andere C0-/C1-Steuerbyte (und DEL) durch ein Leerzeichen. Vor Render und Cache-Schreibvorgang angewendet. |
| Übergroße Datei friert den Start ein                    | 64 KB Hartgrenze für Dateilesevorgänge.                                                                                                                                                                             |
| Pathologische Kunst friert das Layout ein               | 200 Zeilen × 200 Spalten Grenze für jeden aufgelösten String. Überschuss wird abgeschnitten; eine `[BANNER]`-Warnung wird geloggt.                                                                                  |
| Symlink-Umleitung bei der Pfadform                      | `O_NOFOLLOW` bei Dateilesevorgängen (Windows: einfacher Read-Only; Konstante nicht verfügbar).                                                                                                                       |
| Fehlende oder nicht lesbare Datei                       | Abfangen, `[BANNER]`-Warnung loggen, auf Standard zurückfallen. Niemals in die UI werfen.                                                                                                                            |
| Titel oder Untertitel mit Zeilenumbrüchen / übermäßiger Länge | Zeilenumbrüche in Leerzeichen umgewandelt; auf 80 (Titel) / 160 (Untertitel) Zeichen begrenzt.                                                                                                                         |
| Nicht vertrauenswürdiger Workspace beeinflusst Rendering oder Dateilesevorgänge | Wenn `settings.isTrusted` `false` ist, überspringt der Resolver `settings.workspace` vollständig (spiegelt die Vertrauensschranke wider, die `settings.merged` anwendet).                                            |
| Wettlaufbedingung beim Neuladen von Einstellungen        | Die Auflösung wird pro Aufruf nach Quelle (Pfad oder String-Hash) memoisiert. Neuladungen führen den Resolver erneut aus und lesen betroffene Dateien neu.                                                              |

Fehlermodus-Zusammenfassung: jeder weiche Fehler endet in `shortAsciiLogo` (oder dem gesperrten Standardtitel) plus einer Debug-Log-Warnung. Harte Fehler (geworfene Ausnahmen) sind in keinem Zweig des Resolvers erlaubt.

## Außerhalb des Rahmens

Diese wurden in Betracht gezogen und bewusst zurückgestellt. Jeder kann ein separater Folgepunkt sein, wenn Nutzerbedarf aufkommt.

| Element                                                              | Warum nicht                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text-zu-ASCII-Rendering (`{ text: "xxxCode" }`-Form)                 | In Betracht gezogen und für v1 abgelehnt. Dies würde entweder eine `figlet`-Laufzeitabhängigkeit (~2–3 MB entpackt, sobald eine brauchbare Schriftenauswahl enthalten ist) oder einen eingekauften Einzelfont-Renderer (~200 Zeilen + eine `.flf`-Schriftdatei, die wir besitzen) erfordern. Beide Optionen bringen kontinuierliche Oberfläche: Schriftauswahl, Schriftlizenzverfolgung, „Meine Schriftart rendert nicht richtig auf Terminal X“-Probleme und CJK-/Breitzeichen-Handling. Der treibende Anwendungsfall für diese Funktion (White-Label / Multi-Tenant) hat fast immer einen Designer, der absichtliche ASCII-Kunst produziert, und verlässt sich nicht auf eine Standard-Figlet-Schriftart. Benutzer, die eine einzeilige Generierung wünschen, können dies bereits mit `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` erreichen — gleiches Ergebnis, keine zusätzliche Abhängigkeit, keine Support-Last innerhalb von Qwen Code. Falls später Bedarf aufkommt, ist diese Form rein additiv: Erweitere `AsciiArtSource` um `string \| {path} \| {text, font?}` ohne bestehende Konfiguration zu brechen. |
| `/banner`-Slash-Befehl für Live-Bearbeitung                          | Die Einstellungs-UX ist die kanonische Bearbeitungsoberfläche. Ein Live-Editor für mehrzeilige ASCII-Kunst ist ein eigenes Projekt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Benutzerdefinierte Farbverlaufsfarben / farbliche Überschreibungen pro Zeile | Das Theme besitzt Farben. Ein separater Vorschlag kann den Theme-Vertrag erweitern; Banner-Anpassung sollte diese Oberfläche nicht duplizieren.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| URL-geladene ASCII-Kunst                                               | Netzwerkabruf beim Start ist ein eigenes Fass — Fehlermodi, Zwischenspeicherung, Sicherheitsüberprüfung. Die Dateipfad-Form ist das risikoärmere Äquivalent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Animation (drehendes Logo, Laufschrift-Titel)                         | Fügt Rendering-Last und Barrierefreiheitsbedenken hinzu; nichts in den Anwendungsfällen benötigt es.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VSCode-/Web-UI-Banner-Parität                                         | Diese Oberflächen rendern das Ink-Banner heute nicht. Wenn sie ein Banner bekommen, ist dieses Design die Referenz.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Dynamisches Neuladen bei Dateiänderung                                | Der Resolver läuft nur beim Start und beim Neuladen von Einstellungen. Änderungen an der Kunst während der Sitzung sind selten genug, um „Neustart, damit es wirksam wird“ als akzeptablen Kompromiss zu betrachten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Ausblenden nur einzelner gesperrter Bereiche (Version, Auth, Modell, Pfad) | Dies sind operative Signale; sie zu unterdrücken schadet dem Support und der Sicherheitslage mehr, als es White-Label-Szenarien hilft.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
## Verifikationsplan

Für den letztendlichen Implementierungs-PR sollten die folgenden End-to-End-Prüfungen erfolgreich sein.

1. `~/.qwen/settings.json` mit `customBannerTitle: "Acme CLI"` und einem Inline-`customAsciiArt`-String → `qwen` zeigt den neuen Titel und das Artwork; Versionssuffix bleibt erhalten.
2. `customBannerSubtitle: "Built-in Acme Skills"` → die Untertitelzeile wird zwischen dem Titel und der Auth/Model-Zeile in der sekundären Textfarbe dargestellt; Auth, Model und Pfad bleiben sichtbar. Das Entfernen stellt die leere Abstandszeile wieder her (Abwärtskompatibilität).
3. `hideBanner: true` → `qwen` startet ohne Banner; Tipps und Chat werden normal angezeigt.
4. `customAsciiArt: { "path": "./brand.txt" }` in einer Workspace-`settings.json`, mit `brand.txt` daneben in `.qwen/` → lädt von der Disk beim Öffnen des Workspace.
5. `customAsciiArt: { "small": "...", "large": "..." }` → Terminal zwischen breit/mittel/schmal skalieren; `large` bei breiten Breiten, `small` bei mittleren Breiten, Logo-Spalte bei schmalen Breiten ausgeblendet, Info-Panel immer sichtbar.
6. `\x1b[31mhostile` in `customBannerTitle` _und_ `customBannerSubtitle` einfügen → beide werden als roher Text dargestellt, nicht als Rot interpretiert.
7. `path` auf eine fehlende Datei verweisen → CLI startet; `[BANNER]`-Warnung erscheint in `~/.qwen/debug/<sessionId>.txt`; Standard-Artwork wird angezeigt.
8. Worktree mit deaktiviertem Workspace-Vertrauen öffnen → workspace-definierte `customAsciiArt` (einschließlich `{ path }`-Einträge) wird stillschweigend ignoriert; Benutzerbereichseinstellungen werden weiterhin angewendet.
9. `npm test` und `npm run typecheck` bestehen für das CLI-Paket; Unit-Tests in `customBanner.test.ts` decken jede akzeptierte Form und jeden Fehlerpfad ab (fehlende Datei, zu große Datei, ANSI-Injection, fehlerhaftes Objekt).