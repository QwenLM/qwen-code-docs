# Anpassung des Bannerbereich-Designs

> Erlauben Sie Benutzern, das QWEN-ASCII-Kunstwerk und den Markentitel zu ersetzen und das Banner vollständig auszublenden – ohne dass sie die Betriebsdaten (Version, Authentifizierung, Modell, Arbeitsverzeichnis) unterdrücken können, die Qwen Code debugbar und vertrauenswürdig machen.

## Übersicht

Die Qwen Code CLI gibt beim Start ein Banner aus, das ein QWEN-ASCII-Logo und ein umrandetes Informationsfeld enthält. Mehrere reale Anwendungsfälle wünschen eine gewisse Kontrolle über diese Oberfläche:

- **White-Label-Integration / Integration von Drittanbieter-Marken**: Unternehmen und Teams, die Qwen Code in ihre eigenen Produkte einbetten, möchten ihre eigene Markenidentität anzeigen, anstatt des Standard-„Qwen Code“.
- **Personalisierung**: Einzelpersonen möchten das Terminal-Banner an einen Teamstandard oder ihren eigenen Geschmack anpassen.
- **Abgrenzung zwischen mehreren Mandanten / Instanzen**: In gemeinsamen Umgebungen wünschen sich verschiedene Teams ein schnelles visuelles Signal, in welcher Instanz sie sich befinden.

Der Design-Ansatz ist einfach: **Marken-Chrome ist ersetzbar; Betriebsdaten sind es nicht**. Die Anpassung sollte es Benutzern erlauben, ihr eigenes Branding obenauf zu setzen, nicht aber die Informationen zu unterdrücken, die eine Sitzung debugbar machen. Diese Haltung bestimmt jede Entscheidung darüber, „was geändert werden kann vs. was gesperrt ist“ im restlichen Dokument.

Dies wird verfolgt unter [Issue #3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Taxonomie der Bannerbereiche

Heute wird das Banner von `Header` (eingebunden von `AppHeader`) gerendert und gliedert sich in folgende Bereiche:

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

Die beiden obersten Boxen sind:

- **A. Logo-Spalte** — ein einzelner ASCII-Kunstblock mit einem Farbverlauf. Stammt heute aus `shortAsciiLogo` in `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Info-Panel** — eine umrandete Box mit vier Zeilen. Die zweite Zeile ist standardmäßig ein leerer visueller Abstandshalter, optional ersetzt durch einen vom Aufrufer bereitgestellten Untertitel:
  - **B①** Titel: `>_ Qwen Code (vX.Y.Z)` — Markentext + Versionssuffix.
  - **B②** Untertitel / Abstandshalter: standardmäßig eine leere Einzel-Leerzeichen-Zeile. Wenn `ui.customBannerSubtitle` gesetzt ist, belegt dieser String diese Zeile (z. B. könnte ein Fork `Built-in DataWorks Official Skills` verwenden).
  - **B③** Status: `<auth display type> | <model> ( /model to change)`.
  - **B④** Pfad: ein mit Tilde abgekürztes Arbeitsverzeichnis.

Das Ganze wird von `<AppHeader>` umschlossen, das das Banner bereits über `showBanner = !config.getScreenReader()` steuert (Bildschirmlesemodus fällt auf einfache Ausgabe zurück).

## Anpassungsregeln – was geändert werden kann, was gesperrt ist

| Region                                      | Heutige Quelle                      | Anpassungskategorie              | Begründung                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Logo-Spalte**                          | `shortAsciiLogo` (`AsciiArt.ts`)    | **Ersetzbar + automatisch ausblendbar** | Reine Markenoberfläche. White-Label benötigt volle Kontrolle über das Visuelle. Der bestehende Fallback „automatisch ausblenden bei schmalen Terminals“ bleibt erhalten.                                                |
| **B①. Titel – Markentext** (`>_ Qwen Code`) | Fest codiert in `Header.tsx`        | **Ersetzbar**                    | Markenoberfläche. Das führende `>_`-Glyph ist Teil der bestehenden Marke; wenn ein Benutzer es nicht haben möchte, lässt er es einfach aus `customBannerTitle` weg.                                                   |
| **B①. Titel – Versionssuffix** (`(vX.Y.Z)`) | `version`-Prop                      | **Gesperrt**                     | Kritisch für Fehlerberichte. Das Ausblenden macht die Frage „Welche Version verwendest du?“ nur über `--version` beantwortbar, was in Support-Workflows echte Kosten verursacht. Wir tauschen einen kleinen White-Label-Verlust gegen Support-Nachvollziehbarkeit. |
| **B②. Untertitel / Abstandshalter-Zeile**   | standardmäßig leer                  | **Ersetzbar**                    | Reine Marken-/Kontextoberfläche. Wird von White-Label-Forks verwendet, um den Build zu kennzeichnen (z. B. „Built-in DataWorks Official Skills“). Wie der Titel bereinigt; nur eine Zeile – keine zeilenumbruchsbrechenden Zeilenumbrüche.                     |
| **B③. Statuszeile** (Authentifizierung + Modell) | `formattedAuthType`, `model`-Props | **Gesperrt**                     | Betriebs- und Sicherheitssignal. Benutzer müssen immer sehen, welche Anmeldeinformationen verwendet werden und welches Modell ihre Token verbraucht. Das Unterdrücken ist selbst für White-Label-Szenarien ein Eigentor.  |
| **B④. Pfadzeile** (Arbeitsverzeichnis)      | `workingDirectory`-Prop             | **Gesperrt**                     | Betrieblich. „In welchem Verzeichnis bin ich?“ ist eine ständige Frage; das Banner ist die kanonische Antwort.                                                                                                         |
| **Gesamtes Banner** (A + B)                 | `<Header>`-Mount in `AppHeader.tsx` | **Ausblendbar**                  | Ein einzelnes `ui.hideBanner: true` überspringt beide Bereiche – gleiche Form wie die bestehende Bildschirmleser-Sperre. `<Tips>` wird weiterhin unabhängig von `ui.hideTips` gesteuert.                                |
Die Matrix wird in vier Einstellungen übersetzt, nicht mehr:

| Einstellung               | Standard | Auswirkung                                                                                                                            | Betroffener Bereich |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `ui.hideBanner`           | `false`  | Blendet das gesamte Banner aus (Bereiche A + B).                                                                                      | A + B               |
| `ui.customBannerTitle`    | nicht gesetzt | Ersetzt den Markentext in B①. Das Versionssuffix wird weiterhin angehängt. Bereinigt; ein leerer String bedeutet "Standard verwenden". | B① Markentext       |
| `ui.customBannerSubtitle` | nicht gesetzt | Ersetzt die leere Abstandszeile B② durch eine einzeilige Unterüberschrift. Bereinigt; auf 160 Zeichen begrenzt; leer bedeutet "leere Abstandszeile behalten". | B② Abstandszeile    |
| `ui.customAsciiArt`       | nicht gesetzt | Ersetzt Bereich A. Drei akzeptierte Formen (siehe unten). Fällt bei Fehlern auf den Standard zurück.                                  | A                   |

Was **nicht** angeboten wird, und zwar absichtlich:

- Keine Einstellung blendet nur das Versionssuffix aus.
- Keine Einstellung blendet nur die Authentifizierungs-/Modellzeile aus.
- Keine Einstellung blendet nur die Pfadzeile aus.
- Keine Einstellung ändert die Verlaufsfarben des Logos (das Theme besitzt diese).
- Keine Einstellung ordnet das Info-Panel neu oder ändert seine Struktur.

Falls die Implementierung später eine dieser Funktionen bereitstellen muss, sollten dies neue Felder mit eigener Begründung sein – nicht von den drei obigen Feldern abgeleitet.

## Benutzerkonfigurationsanleitung – wie man sie ändert

### Grenzen auf einen Blick

Für jede Banner-Anpassung gelten einige Begrenzungen. Denken Sie daran, bevor Sie eine Grafik von Hand erstellen, damit der Resolver Ihre Eingabe nicht kürzt oder ablehnt.

| Was                             | Grenzwert                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Zeichenanzahl des Titels**    | **maximal 80 Zeichen** (nach der Bereinigung). Längere werden gekürzt und ein `[BANNER]` Warnhinweis wird protokolliert. Zeilenumbrüche und Steuerzeichen werden vor dieser Längenermittlung entfernt. |
| **Zeichenanzahl der Unterüberschrift** | **maximal 160 Zeichen** (nach der Bereinigung). Gleiche Bereinigungspipeline wie der Titel; gleicher `[BANNER]` Warnhinweis bei Kürzung.                                                             |
| **Größe des ASCII-Art-Blocks**  | **maximal 200 Zeilen × 200 Spalten** pro Stufe. Größere werden passend gekürzt und ein `[BANNER]` Warnhinweis wird protokolliert.                                                              |
| **Dateigröße der ASCII-Art-Datei auf der Festplatte** | **maximal 64 KB**. Größere Dateien werden bis zur Grenze gelesen; der Rest wird ignoriert.                                                                                                    |
| **Breite der ASCII-Art, die gerendert wird** | Wird durch die Terminal-Spalten beim Start bestimmt, **keine** feste Zeichenanzahl. Siehe „Wie breit kann das Logo sein?" unten für die Formel und die Zahlen pro Terminal.                     |

Es gibt **keine feste Zeichenanzahlbegrenzung für das ASCII-Art** – nur die obigen Grenzen für Spalten/Zeilen und das pro Start verfügbare Breitenbudget. Ein 17‑Zeichen langer Markenname, der in einer Schriftart gut dargestellt werden würde, erfordert möglicherweise Stapelung oder eine dichtere Schriftart in einer anderen; der begrenzende Faktor ist die visuelle Breite, nicht die Anzahl der Buchstaben.

### Wo die Einstellungen leben

Alle vier Einstellungen befinden sich unter `ui` in `settings.json`. Sowohl die Benutzerebene (`~/.qwen/settings.json`) als auch die Arbeitsbereichsebene (`.qwen/settings.json` im Projektstammverzeichnis) werden mit der standardmäßigen Zusammenführungsrangfolge unterstützt (Arbeitsbereich überschreibt Benutzer, System überschreibt Arbeitsbereich).

`customAsciiArt` wird speziell behandelt: Anstatt das gesamte Objekt als einen Wert zu behandeln, den der Bereich mit höherer Rangfolge ersetzt, durchläuft der Resolver die Bereiche pro Stufe. Wenn die Benutzereinstellungen `{ small }` definieren und die Arbeitsbereichseinstellungen `{ large }` definieren, tragen beide bei – `small` vom Benutzer, `large` vom Arbeitsbereich. Dadurch funktionieren zwei Dinge gleichzeitig:

1. Jeder `{ path }`-Eintrag wird gegen die Datei aufgelöst, die ihn deklariert hat (Arbeitsbereich `.qwen/` vs. Benutzer `~/.qwen/`); die zusammengeführte Ansicht allein würde diese Bereichsinformation verlieren.
2. Benutzer können eine standardmäßige `large`-Stufe in ihren persönlichen Einstellungen behalten und nur `small` pro Arbeitsbereich überschreiben, ohne das gesamte Objekt erneut angeben zu müssen.

Wenn dieselbe Stufe in mehreren Bereichen definiert ist, gilt die normale Rangfolge (System überschreibt Arbeitsbereich überschreibt Benutzer). Das Setzen von `customAsciiArt` auf einen einfachen String oder `{ path }` in einem beliebigen Bereich füllt dennoch beide Stufen in diesem Bereich.

### Das Banner vollständig ausblenden

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

Die Startausgabe überspringt sowohl die Logo-Spalte als auch das Info-Panel. Tipps werden weiterhin angezeigt, es sei denn, `ui.hideTips` ist ebenfalls `true`.
### Ersetzen des Markentitels

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

Wird als `Acme CLI (vX.Y.Z)` im Infopanel angezeigt. Das `>_`-Glyph wird entfernt, wenn ein benutzerdefinierter Titel gesetzt wird; wenn Sie es zurückhaben möchten, fügen Sie es selbst hinzu: `"customBannerTitle": ">_ Acme CLI"`.

### Hinzufügen eines Marken-Untertitels

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

Zeigt den Untertitel in einer eigenen Zeile an, in der sekundären Textfarbe, anstelle des leeren Abstandshalters, der sich normalerweise zwischen dem Titel und der Authentifizierungs-/Modellzeile befindet:

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① Titel
│ Built-in DataWorks Official Skills                      │  ← B② Untertitel
│ Qwen OAuth | qwen-coder ( /model to change)             │  ← B③ Status
│ ~/projects/example                                      │  ← B④ Pfad
└─────────────────────────────────────────────────────────┘
```

Einschränkungen:

- Nur einzelne Zeile. Zeilenumbrüche und andere Steuerbytes werden entfernt / zu Leerzeichen umgewandelt, damit ein versehentliches Einfügen das Layout des Infopanels nicht zerstört.
- Bereinigt und auf 160 Zeichen begrenzt (großzügiger als die Titelgrenze, da Slogans / „Powered by“-Zeilen oft etwas länger sind).
- Lassen Sie das Feld ungesetzt (oder setzen Sie es auf einen leeren String / Leerraum), um die vorhandene leere Abstandshalterzeile zu behalten – Abwärtskompatibilität ist die Voreinstellung.
- Der Untertitel ändert nicht, welche Zeilen gesperrt sind; Authentifizierung, Modell und Arbeitsverzeichnis sind unabhängig vom Zustand des Untertitels immer sichtbar.

### Ersetzen der ASCII-Kunst – Inline-Zeichenfolge

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Verwenden Sie `\n`, um Zeilenumbrüche in den JSON-String einzubetten. Die Grafik wird mit dem aktiven Verlaufschema gerendert, genau wie das Standardlogo.

> **Haben Sie keine ASCII-Kunst zur Hand?** Verwenden Sie einen beliebigen externen Generator und fügen Sie das Ergebnis ein. Der einfachste Weg ist `figlet`:
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` und zeigen Sie dann mit
> `customAsciiArt: { "path": "./brand.txt" }` darauf. Die CLI rendert Text-zu-Kunst nicht zur Laufzeit – siehe den Abschnitt _Außerhalb des Geltungsbereichs_ für die Begründung.

### Ersetzen der ASCII-Kunst – externe Datei

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Vermeidet das JSON-Escapen einer mehrzeiligen Zeichenfolge. Pfadauflösungsregeln:

- **Arbeitsbereichseinstellungen**: relative Pfade werden relativ zum Arbeitsbereich `.qwen/`-Verzeichnis aufgelöst.
- **Benutzereinstellungen**: relative Pfade werden relativ zu `~/.qwen/` aufgelöst.
- Absolute Pfade werden unverändert verwendet.
- Die Datei wird **einmalig beim Start** gelesen, bereinigt und zwischengespeichert. Das Bearbeiten der Datei während der Sitzung rendert das Banner nicht neu – starten Sie die CLI neu.

### Ersetzen der ASCII-Kunst – breitenabhängig

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

`large` wird bevorzugt, wenn das Terminal breit genug ist; ansonsten wird `small` verwendet; ansonsten wird die Logo-Spalte ausgeblendet (die vorhandene Zweispalten-Fallback). Jede Stufe kann ein String oder `{ path }` sein. Jede Stufe kann weggelassen werden: Eine fehlende Stufe fällt einfach auf den nächsten Schritt zurück.

### Wie breit darf das Logo sein? – das Größenbudget

Es gibt keine harte Zeichenanzahlbegrenzung für den Titel oder die Kunst. Es gibt ein **Breitenbudget**, das von den Terminalspalten und einer absoluten Obergrenze bestimmt wird, um zu verhindern, dass eine fehlerhafte Datei das Layout einfrieren lässt:

| Einstellung                                          | Grenze                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Terminalspalten beim Start                           | Was auch immer das Terminal des Benutzers meldet.                      |
| Äußerer Rand des Containers                          | 4 Spalten (2 links + 2 rechts).                                        |
| Abstand zwischen Logo und Infopanel                  | 2 Spalten.                                                             |
| Minimale Breite des Infopanels                       | 44 Spalten (40 Pfad + Rand + Abstand).                                 |
| **Verfügbare Logobreite** (pro Stufe, Renderzeit)    | `terminalCols − 4 − 2 − 44 = terminalCols − 50`.                      |
| Absolute Obergrenze für jede Kunststufe (nach Bereinigung) | 200 Spalten × 200 Zeilen. Alles darüber wird abgeschnitten + `[BANNER]`-Warnung. |
| Absolute Obergrenze für `customBannerTitle` (nach Bereinigung) | 80 Zeichen. Alles darüber wird abgeschnitten + `[BANNER]`-Warnung. |

Lesen des Budgets bei gängigen Terminalbreiten:

| Terminal-Spalten | Max. darstellbare Logobreite | Was das in der Praxis bedeutet                                           |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------ |
| 80               | 30                           | Die meisten figlet „ANSI Shadow“-Buchstaben sind ~7–11 Spalten – maximal 3 Buchstaben. |
| 100              | 50                           | Ein kurzes Wort in ANSI Shadow (~6 Buchstaben) oder zwei kurze gestapelte Wörter. |
| 120              | 70                           | Gestapelte mehrzeilige Wortkunst passt bequem.                           |
| 200              | 150                          | Lange Inline-Zeichenfolgen wie vollständige Produktnamen in ANSI Shadow passen. |
Zwei praktische Konsequenzen beim Entwerfen deines Banners:

1. **Ein mehrteiliger Markenname wird auf den meisten Terminals nicht als einzelne ANSI-Shadow-Zeile dargestellt.** Bei ~7–9 Spalten pro ANSI-Shadow-Buchstabe ist eine 12-Zeichen-Marke wie `Custom Agent` bereits etwa 95 Spalten Kunst auf einer Zeile – schon mehr, als ein 100-Spalten-Terminal neben dem Info-Panel übrig hat. Staple die Wörter entweder auf mehrere Zeilen, wähle eine dichtere Figlet-Schriftart oder verwende eine kompakte einzeilige Textdekoration wie `▶ Custom Agent ◀`.
2. **Verwende die breitenabhängige `{ small, large }`-Form**, wenn eine einzelne Stufe dich zwingen würde, zwischen „sieht breit toll aus / stirbt schmal" und „sieht schmal gut aus / verschwendet Platz breit" zu wählen. Das folgende Beispiel stapelt die Wörter für ein ≥104-Spalten-Terminal in `large` und fällt auf eine 16-Spalten-einzeilige Dekoration in `small` zurück.

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

Wobei `banner-large.txt` die gestapelte ANSI-Shadow-Ausgabe (~54 Spalten × 12 Zeilen) enthält, z. B. generiert durch:

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

### So überprüfst du deine Änderung

1. Speichere `settings.json` und starte eine neue `qwen`-Sitzung – die Bannerauflösung wird einmalig beim Start ausgeführt.
2. Ändere die Größe des Terminals, um zu bestätigen, dass die `small`- / `large`-Stufen wie erwartet wechseln und die Logo-Spalte bei sehr schmalen Breiten verschwindet.
3. Wenn etwas nicht wie erwartet erscheint, sieh dir `~/.qwen/debug/<sessionId>.txt` an (der Symlink `latest.txt` zeigt auf die aktuelle Sitzung) und grep nach `[BANNER]` – jeder weiche Fehler protokolliert eine Warnzeile mit dem zugrundeliegenden Grund.

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

Der fünfstufige Auflösungsalgorithmus läuft einmal, wenn die Einstellungen geladen werden, und erneut nur bei Ereignissen zum Neuladen der Einstellungen:

1. **Normalisieren**. Ein nackter `string` oder `{ path }` wird zu `{ small: x, large: x }`. Ein `{ small, large }`-Objekt wird durchgereicht.
2. **Jede Stufe auflösen**. Für jede `AsciiArtSource`:
   - Wenn es ein String ist, verwende ihn wie gegeben.
   - Wenn es `{ path }` ist, lese die Datei synchron mit `O_NOFOLLOW`-Schutz (Windows: einfaches Read-Only – die Konstante wird nicht bereitgestellt), begrenzt auf 64 KB. Relative Pfade werden relativ zum _Verzeichnis der besitzenden Einstellungsdatei_ aufgelöst – Arbeitsbereichseinstellungen relativ zum Arbeitsbereich `.qwen/`, Benutzereinstellungen relativ zu `~/.qwen/`. Ein Lesefehler protokolliert eine `[BANNER]`-Warnung und fällt auf den Standard für diese Stufe zurück.
3. **Bereinigen**. Ein bannereigener Stripper entfernt OSC-/CSI-/SS2-/SS3-Führungssequenzen und ersetzt jedes andere C0-/C1-Steuerbyte (und DEL) durch ein Leerzeichen, während `\n` erhalten bleibt, damit mehrzeilige Kunst überlebt. Entferne nachgestellte Leerzeichen pro Zeile und begrenze dann auf 200 Zeilen × 200 Spalten. Alles, was über die Grenze hinausgeht, wird abgeschnitten und eine `[BANNER]`-Warnung protokolliert.
4. **Laufzeit-Stufenauswahl**. In `Header.tsx` wird bei gegebenem `small` und `large` das vorhandene Breitenbudget ausgewertet (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`):
   - Bevorzuge `large`, wenn es passt.
   - Sonst falle auf `small` zurück, wenn es passt.
   - Sonst, **wenn der Benutzer benutzerdefinierte Kunst bereitgestellt hat**, verstecke die Logo-Spalte vollständig (der vorhandene `showLogo = false`-Zweig) – ein Zurückfallen auf das gebündelte QWEN-Logo würde hier eine White-Label-Bereitstellung auf schmalen Terminals stillschweigend rückgängig machen. Das Info-Panel wird weiterhin gerendert.
   - Sonst (wenn überhaupt keine benutzerdefinierte Kunst bereitgestellt wurde) falle auf `shortAsciiLogo` durch und lasse die vorhandene Breitenschranke entscheiden, ob das Standard-Logo angezeigt oder versteckt wird.
5. **Fallback**. Wenn beide Stufen aufgrund von weichen Fehlern (fehlende Datei, Bereinigung hat alles abgelehnt, fehlerhafte Konfiguration) leer oder ungültig sind, verhalte dich so, als ob keine Anpassung vorgenommen wurde: rendere `shortAsciiLogo` und folge der Standard-Logo-Breitenschranke. Die CLI darf niemals bei einem Banner-Konfigurationsfehler abstürzen.
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
  return undefined; // logo column hidden
}
```

## Ergänzungen zum Einstellungsschema

Vier neue Eigenschaften werden dem `ui`-Objekt in
`packages/cli/src/config/settingsSchema.ts` hinzugefügt, unmittelbar nach
`shellOutputMaxLines`:

```ts
hideBanner: {
  type: 'boolean',
  label: 'Hide Banner',
  category: 'UI',
  requiresRestart: false,
  default: false,
  description: 'Hide the startup ASCII banner and info panel.',
  showInDialog: true,
},
customBannerTitle: {
  type: 'string',
  label: 'Custom Banner Title',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Replace the default ">_ Qwen Code" title shown in the banner info panel. The version suffix is always appended.',
  showInDialog: false,
},
customBannerSubtitle: {
  type: 'string',
  label: 'Custom Banner Subtitle',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Optional subtitle line rendered between the banner title and the auth/model line. When unset, the info panel keeps its blank spacer row.',
  showInDialog: false,
},
customAsciiArt: {
  type: 'object',
  label: 'Custom ASCII Art',
  category: 'UI',
  requiresRestart: false,
  default: undefined,
  description:
    'Replace the default QWEN ASCII art. Accepts an inline string, {"path": "..."}, or {"small": ..., "large": ...} for width-aware selection.',
  showInDialog: false,
  // The runtime accepts a union the SettingDefinition `type` field can't
  // express. The override is emitted verbatim by the JSON-schema generator
  // so VS Code accepts every documented shape (string, {path}, or
  // {small,large}) without flagging the bare-string form.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` spiegelt das bestehende `hideTips`-Muster wider (`showInDialog:
true`). Die drei frei formbaren Felder (Titel, Untertitel, ASCII-Kunst) bleiben
außerhalb des Einstellungsdialogs der Anwendung, da ein mehrzeiliger
ASCII-Editor im TUI-Dialog ein eigenes Projekt wäre; Power-User bearbeiten
`settings.json` direkt.

## Anpassungen der Verkabelung

Die Implementierungsberührungspunkte sind klein. Jeder wird unten mit der
Datei und dem Zeilenbereich aus dem aktuellen `main`-Branch beschrieben.

`packages/cli/src/ui/components/AppHeader.tsx:53` — erweitere `showBanner`:

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — übergib das aufgelöste
Banner an `<Header>`:

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

`packages/cli/src/ui/components/Header.tsx:45-46` — wähle die Stufe vor der
Berechnung von `logoWidth`, mit dem bestehenden Standard als untere Grenze:

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

`packages/cli/src/ui/components/Header.tsx` — zeige den Titel aus der
Eigenschaft an und verwende die Untertitel-Eigenschaft anstelle der leeren
Abstandszeile, wenn gesetzt:

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

**Neue Datei**: `packages/cli/src/ui/utils/customBanner.ts` — der Resolver.
Exportiert:

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

Der Resolver führt die Normalisierung, Dateilesevorgänge, Bereinigung und
Zwischenspeicherung durch, wie in der obigen Auflösungspipeline beschrieben.
Er wird einmal beim CLI-Start aufgerufen und bei Hot-Reload-Ereignissen der
Einstellungen erneut ausgeführt. Dateipfade pro Bereich stammen direkt aus
`settings.system.path` / `settings.workspace.path` / `settings.user.path`,
sodass jedes `{ path }` gegen die Datei aufgelöst wird, die es deklariert hat;
Arbeitsbereichseinstellungen werden vollständig übersprungen, wenn
`settings.isTrusted` falsch ist.

## Alternative Ansätze erwogen
Es wurden fünf Ausprägungen dieses Features in Betracht gezogen. Sie sind hier aufgeführt, damit zukünftige Beitragende den Entwurfsraum verstehen und die Wahl bei geänderten Randbedingungen erneut prüfen können.

### Option 1 – Drei flache Einstellungen (EMPFOHLEN, entspricht dem Issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Wirkung**: minimale Benutzeroberfläche; genau das, was das Issue verlangt.
- **Vorteile**: keine Lernkurve; trivial dokumentierbar; konsistent mit bestehenden flachen `ui.*`-Eigenschaften (`hideTips`, `customWittyPhrases` usw.).
- **Nachteile**: drei Top-Level-Schlüssel, die konzeptionell zusammengehören, sind nicht gruppiert; zukünftige Banner-spezifische Optionen (Farbverlauf, Untertitel) würden weitere Geschwister zu `ui` hinzufügen, anstatt sauber zu verschachteln.

### Option 2 – Verschachtelter `ui.banner`-Namespace

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

- **Wirkung**: gleiche Fähigkeiten wie Option 1, nach Feature organisiert.
- **Vorteile**: sauberer Namespace für zukünftige Banner-spezifische Optionen; einfachere Auffindbarkeit über `/settings`.
- **Nachteile**: weicht vom exakten Wortlaut des Issues ab; vorhandene UI-Einstellungen sind meist flach (nur `ui.accessibility` und `ui.statusLine` verschachteln), daher ist die Konsistenz gemischt; fügt eine Verschachtelungsebene hinzu, die sich der Benutzer merken muss.

### Option 3 – Banner-Profil-Voreinstellungen + Slot-Override

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* slot overrides for 'branded' */ }
  }
}
```

- **Wirkung**: Benutzer wählen aus benannten Profilen; fortgeschrittene Benutzer überschreiben Slots innerhalb eines gewählten Profils.
- **Vorteile**: schönes Onboarding-Erlebnis; Profile sind im CLI enthalten.
- **Nachteile**: erhebliche Komplexität; Profile sind eine Wartungsverpflichtung; das Issue verlangt nach roher Anpassung, nicht nach Kuratierung.

### Option 4 – Ganzer Banner-Override (einzelne Zeichenkette-Vorlage)

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Wirkung**: einzelne freie Vorlage mit festen Variablen, die ersetzt werden.
- **Vorteile**: maximale Flexibilität für nicht standardmäßige Layouts.
- **Nachteile**: implementiert Layout im Benutzerbereich neu; verliert Inks Zweispalten-Resilienz gegenüber Terminalbreite; sehr einfach, eine Vorlage zu schreiben, die auf schmalen Terminals bricht; großer Einflussbereich für ein kleines Feature.

### Option 5 – Plugin-/Hook-API

Einen Banner-Renderer-Hook über das Erweiterungssystem bereitstellen.

- **Wirkung**: Anpassung auf Code-Ebene; Erweiterungen können alles rendern.
- **Vorteile**: maximale Leistungsfähigkeit; ermöglicht Unternehmen, ein versiegeltes Branding-Plugin auszuliefern.
- **Nachteile**: große API-Oberfläche; benötigt Sicherheitsüberprüfung für willkürliches Terminal-Rendering; für das Issue massiv überdimensioniert.

### Empfehlung

**Option 1** wird empfohlen. Sie erfüllt das Issue wörtlich, fügt sich in den bestehenden `ui.*`-Stil ein und vermeidet, eine Entscheidung über einen verschachtelten Namespace zu erzwingen, bevor wir wissen, wie zukünftige Banner-spezifische Optionen tatsächlich aussehen. Wenn sich zukünftig Geschwister ansammeln, ist eine Migration zu Option 2 additiv – `ui.banner.title` und `ui.customBannerTitle` können während eines Abkündigungszeitraums koexistieren.

## Sicherheit & Fehlerbehandlung

Der benutzerdefinierte Banner-Inhalt wird unverändert im Terminal gerendert UND, in der Pfadform, von der Festplatte gelesen. Beide Oberflächen sind angreifbar, wenn eine feindliche oder kompromittierte Einstellungsdatei geladen wird. Das gleiche Bedrohungsmodell wie bei der Session-Titel-Funktion gilt hier.

| Bedenken                                                                   | Absicherung                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ANSI/OSC-8/CSI-Injection in Art, Titel oder Untertitel                     | Banner-spezifischer Stripper (`sanitizeArt`/`sanitizeSingleLine`): entfernt OSC/CSI/SS2/SS3-Führer und ersetzt jedes andere C0/C1-Steuerbyte (und DEL) durch ein Leerzeichen. Wird vor dem Rendern und vor dem Cache-Schreibvorgang angewendet. |
| Überlange Datei friert Start ein                                           | 64 KB harte Grenze für Dateilesevorgänge.                                                                                                                                                                                            |
| Pathologisches Art friert Layout ein                                       | 200 Zeilen × 200 Spalten Grenze für jeden aufgelösten String. Überschüssiges wird abgeschnitten; eine `[BANNER]`-Warnung wird protokolliert.                                                                                         |
| Symlink-Umleitung bei der Pfadform                                         | `O_NOFOLLOW` bei Dateilesevorgängen (Windows: reines Lesen; Konstante nicht verfügbar).                                                                                                                                              |
| Fehlende oder nicht lesbare Datei                                          | Abfangen, `[BANNER]`-Warnung protokollieren, auf Standard zurückfallen. Nie in die UI werfen.                                                                                                                                        |
| Titel oder Untertitel mit Zeilenumbrüchen/übermäßiger Länge                | Zeilenumbrüche zu Leerzeichen gefaltet; auf 80 (Titel) / 160 (Untertitel) Zeichen begrenzt.                                                                                                                                          |
| Nicht vertrauenswürdiger Workspace, der Rendering oder Dateilesevorgänge beeinflusst | Wenn `settings.isTrusted` falsch ist, überspringt der Resolver `settings.workspace` vollständig (entspricht der Vertrauensprüfung, die `settings.merged` anwendet).                                                                 |
| Race-Condition beim Neuladen von Einstellungen                             | Die Auflösung wird pro Aufruf nach Quelle (Pfad oder String-Hash) memoisiert. Neuladungen führen den Resolver erneut aus und lesen betroffene Dateien neu ein.                                                                       |
Zusammenfassung der Fehlermodi: Jeder weiche Fehler endet in `shortAsciiLogo` (oder dem gesperrten Standardtitel) plus einer Debug-Log-Warnung. Harte Fehler (ausgelöste Ausnahmen) sind in keinem Zweig des Resolvers zulässig.

## Nicht im Fokus

Diese wurden geprüft und bewusst zurückgestellt. Jeder Punkt kann als separates Follow-up behandelt werden, falls Bedarf seitens der Nutzer entsteht.

| Punkt                                                             | Warum nicht                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text-zu-ASCII-Rendering (`{ text: "xxxCode" }`-Form)               | Geprüft und für v1 abgelehnt. Die Aufnahme würde entweder eine `figlet`-Laufzeitabhängigkeit (~2–3 MB entpackt, sobald ein brauchbarer Satz an Fonts enthalten ist) oder einen gebündelten Einzelfont-Renderer (~200 Zeilen + eine `.flf`-Fontdatei, die wir besitzen würden) erfordern. Beide Optionen bringen dauerhaften Wartungsaufwand mit sich: Schriftauswahl, Schriftlizenzverfolgung, Probleme wie „Mein Font wird auf Terminal X nicht richtig dargestellt“ sowie CJK-/Breitzeichen-Handling. Der treibende Anwendungsfall für diese Funktion (White-Label-/Multi-Tenant) hat fast immer einen Designer, der bewusst ASCII-Kunst erstellt, anstatt sich auf einen Standard-figlet-Font zu verlassen. Anwender, die eine einzeilige Generierung wünschen, können dies bereits mit `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` erreichen – gleiches Ergebnis, keine zusätzliche Abhängigkeit, kein Supportaufwand innerhalb von Qwen Code. Sollte später Bedarf entstehen, ist diese Form rein additiv: Erweiterung von `AsciiArtSource` um `string \| {path} \| {text, font?}` ohne bestehende Konfigurationen zu brechen. |
| `/banner`-Slash-Befehl zur Live-Bearbeitung                       | Die Einstellungs-UI ist die kanonische Oberfläche zur Bearbeitung. Ein Live-Editor für mehrzeilige ASCII-Kunst ist ein eigenes Projekt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Benutzerdefinierte Verlaufsfarben / farbliche Überschreibungen pro Zeile | Das Theme besitzt die Farben. Ein separates Proposal kann den Theme-Vertrag erweitern; die Banner-Anpassung sollte diese Oberfläche nicht duplizieren.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| URL-geladene ASCII-Kunst                                          | Netzwerkabruf beim Start ist ein eigenes Fass – Fehlermodi, Caching, Sicherheitsprüfung. Die Dateipfad-Form ist das risikoärmere Äquivalent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Animation (drehendes Logo, Laufschrift-Titel)                     | Erhöht die Rendering-Last und bringt Barrierefreiheitsbedenken mit sich; keiner der Anwendungsfälle benötigt dies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| VSCode-/Web-UI-Banner-Gleichheit                                  | Diese Oberflächen rendern derzeit das Ink-Banner nicht. Sollten sie ein Banner erhalten, ist dieses Design die Referenz.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Dynamisches Neuladen bei Dateiänderung                            | Der Resolver läuft nur beim Start und beim Neuladen der Einstellungen. Änderungen der Kunst mitten in der Sitzung sind so selten, dass „Neustart, um die Änderung zu übernehmen“ der akzeptable Kompromiss ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Ausblenden nur einzelner gesperrter Regionen (Version, Auth, Modell, Pfad) | Dies sind operative Signale; ihre Unterdrückung schadet dem Support und der Sicherheitslage mehr, als sie White-Label-Szenarien nützt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
## Prüfplan

Für den endgültigen Implementierungs-PR sollten die folgenden End-to-End-Prüfungen erfolgreich sein.

1. `~/.qwen/settings.json` mit `customBannerTitle: "Acme CLI"` und einem Inline-`customAsciiArt`-String → `qwen` zeigt den neuen Titel und die neue Grafik; Versionssuffix bleibt erhalten.
2. `customBannerSubtitle: "Built-in Acme Skills"` → Die Untertitelzeile wird zwischen der Titel- und der Authentifizierungs-/Modellzeile in der sekundären Textfarbe dargestellt; Auth, Modell und Pfad bleiben sichtbar. Wird der Eintrag entfernt, wird die leere Abstandszeile wiederhergestellt (Rückwärtskompatibilität).
3. `hideBanner: true` → `qwen` startet ohne Banner; Tipps und Chat werden normal dargestellt.
4. `customAsciiArt: { "path": "./brand.txt" }` in einer Workspace-`settings.json`, mit `brand.txt` daneben in `.qwen/` → lädt von der Platte beim Öffnen des Workspace.
5. `customAsciiArt: { "small": "...", "large": "..." }` → Größe des Terminals zwischen breit / mittel / schmal ändern; große Grafik bei breiten Fenstern, kleine Grafik bei mittleren Fenstern, Logo-Spalte bei schmalen Fenstern ausgeblendet, Info-Panel immer sichtbar.
6. Injiziere `\x1b[31mhostile` in `customBannerTitle` **und** `customBannerSubtitle` → beide werden als wörtlicher Text dargestellt, nicht als rot interpretiert.
7. Zeige mit `path` auf eine fehlende Datei → CLI startet; `[BANNER]`-Warnung erscheint in `~/.qwen/debug/<sessionId>.txt`; Standardgrafik wird dargestellt.
8. Öffne den Worktree mit deaktiviertem Workspace-Vertrauen → Workspace-definierte `customAsciiArt` (einschließlich `{ path }`-Einträgen) wird stillschweigend ignoriert; Einstellungen im Benutzerbereich werden weiterhin angewendet.
9. `npm test` und `npm run typecheck` bestehen für das CLI-Paket; Unit-Tests in `customBanner.test.ts` decken jede akzeptierte Form und jeden Fehlerpfad ab (fehlende Datei, zu große Datei, ANSI-Injection, ungültiges Objekt).
