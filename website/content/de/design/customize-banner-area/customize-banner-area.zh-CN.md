# Banner-Bereich – Design für benutzerdefinierte Anpassung

> [!note]
> Erlaubt es dem Benutzer, das QWEN ASCII-Logo zu ersetzen, den Markennamen zu ändern oder das gesamte Banner auszublenden – untersagt jedoch das Entfernen von Laufzeitinformationen (Version, Authentifizierungsmethode, Modell, Arbeitsverzeichnis), die für Fehlerbehebung und Vertrauenswürdigkeit erforderlich sind.

## Übersicht

Beim Start von Qwen Code CLI wird oben im Terminal ein Banner angezeigt, bestehend aus dem QWEN ASCII-Logo und einem umrandeten Informationspanel. Verschiedene reale Szenarien erfordern eine Steuerung dieses Bereichs:

- **White-Label / Drittanbieter-Branding**: Wenn Qwen Code in Unternehmens- oder Team-eigene Produkte eingebettet wird, soll das eigene Branding anstelle des standardmäßigen „Qwen Code" angezeigt werden.
- **Personalisierung**: Einzelne Benutzer möchten das Terminal-Banner an Teamrichtlinien oder den eigenen Geschmack anpassen.
- **Multi-Tenant / Multi-Instanz-Unterscheidung**: In gemeinsam genutzten Umgebungen möchten verschiedene Teams schnell erkennen, welche Instanz sie gerade verwenden.

Die Design-Position ist denkbar einfach: **Das Branding ist austauschbar; die Laufzeitinformationen sind nicht austauschbar.**
Die Anpassung erlaubt es dem Benutzer lediglich, sein eigenes Branding darüberzulegen, **untersagt jedoch das Ausblenden von für die Fehlerbehebung wesentlichen Informationen**. Jede Entscheidung für „änderbar / nicht änderbar" in diesem Dokument basiert auf dieser Position.

Entsprechendes Issue: [#3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Aufteilung des Bannerbereichs

Der aktuelle Banner wird von `Header` (eingehängt durch `AppHeader`) gerendert und lässt sich wie folgt aufteilen:

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo-Spalte ─────────┐  gap=2  ┌──── Informationspanel (mit Rahmen) ─┐
│   │                          │         │                                     │
│   │  ███ QWEN ASCII ███      │         │  ① Titel:    >_ Qwen Code (vX.Y.Z)  │
│   │  ███   ART ART  ███      │         │  ② Untertitel: «Leerzeile / benutzerdef. Überschreibung» │
│   │  ███ QWEN ASCII ███      │         │  ③ Status:    Qwen OAuth | qwen-…    │
│   │                          │         │  ④ Pfad:      ~/projects/example     │
│   └──────── A ───────────────┘         └──────────────── B ──────────────────┘│
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
                               Zuständig: AppHeader
                          │ Tipps-Komponente wird darunter gerendert (gesteuert durch ui.hideTips) │
```

Zwei Hauptblöcke:

- **A. Logo-Spalte** – Ein einzelner Block mit Farbverlauf-ASCII-Art.
  Aktuelle Quelle: `shortAsciiLogo` in `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Informationspanel** – Ein umrandeter Infokasten mit insgesamt vier Zeilen. Die zweite Zeile ist standardmäßig ein visueller Leerraum-Spacer, der optional durch einen vom Aufrufer bereitgestellten Untertitel ersetzt werden kann:
  - **B① Titel**: `>_ Qwen Code (vX.Y.Z)` – Markentext + Versionsnummer-Suffix.
  - **B② Untertitel / Spacer**: Standardmäßig eine einzelnes Leerzeichen; bei gesetztem `ui.customBannerSubtitle` wird der bereinigte einzeilige Untertitelstring gerendert (z.B. ein Fork mit `Built-in DataWorks Official Skills`).
  - **B③ Status**: `<Anzeigetyp Authentifizierung> | <Modell> (/model wechseln)`.
  - **B④ Pfad**: Das mit Tilde und verkürztem Arbeitsverzeichnis.

Die äußere Komponente `<AppHeader>` versteckt den Banner bereits bei Screenreader-Modus basierend auf `showBanner = !config.getScreenReader()` (im Screenreader-Modus Fallback auf reinen Text).

## Anpassungsregeln – Was geändert werden darf und was gesperrt ist

| Bereich                               | Aktuelle Quelle                           | Kategorie der Anpassung       | Grund für Sperrung / Freigabe                                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Logo-Spalte**                     | `shortAsciiLogo` (`AsciiArt.ts`)         | **Ersetzbar + automatisch ausblendbar** | Reiner Branding-Bereich. White-Label-Szenarien benötigen vollständige Kontrolle über die Optik. Das bestehende Verhalten „Logo bei schmalem Terminal automatisch ausblenden" bleibt erhalten. |
| **B①. Titeltext** (`>_ Qwen Code`)    | Hartcodiert in `Header.tsx`              | **Ersetzbar**                 | Branding-Bereich. Das führende `>_` ist Teil des bestehenden Brandings; wenn nicht gewünscht, lässt der Benutzer es in `customBannerTitle` einfach weg.                                           |
| **B①. Versionsnummer-Suffix** (`(vX.Y.Z)`) | `version`-Prop                          | **Gesperrt**                  | Notwendig für Fehlerbehebung und Support. Ohne dieses könnte die Frage „Welche Version verwendest du?" nur noch über `--version` beantwortet werden – ein echter Aufwand für den Support. Wir akzeptieren einen kleinen White-Label-Komfortverlust zugunsten der Erreichbarkeit des Supports. |
| **B②. Untertitel / Spacer-Zeile**      | Standardmäßig leer                       | **Ersetzbar**                 | Reiner Branding-/Kontext-Bereich. White-Label-Forks nutzen diese, um Build-Versionen zu taggen (z.B. „Built-in DataWorks Official Skills"). Bereinigungsregeln identisch mit Titel; nur einzeilig, keine Zeilenumbrüche, die das Layout zerstören würden. |
| **B③. Statuszeile** (Authentifizierung + Modell) | `formattedAuthType`-, `model`-Props      | **Gesperrt**                  | Betriebs- und Sicherheitssignal. Der Benutzer muss sehen, welche Anmeldeinformationen verwendet werden und welches Modell tatsächlich Tokens verbraucht. Jegliches Verstecken/Ersetzen wäre ein Footgun, selbst im White-Label-Szenario. |
| **B④. Pfadzeile** (Arbeitsverzeichnis) | `workingDirectory`-Prop                 | **Gesperrt**                  | Betriebsinformation. „In welchem Verzeichnis bin ich gerade?" ist eine häufige Frage; das Banner ist die einzige autoritative Antwort darauf.                                                     |
| **Gesamter Banner** (A + B)            | `<Header>`-Einhängepunkt in `AppHeader.tsx` | **Ausblendbar**               | Ein `ui.hideBanner: true` überspringt beide Blöcke A und B – analog zum bestehenden Screenreader-Schalter. `<Tips>` bleibt durch unabhängiges `ui.hideTips` gesteuert.                           |

Die obige Matrix entspricht genau vier Einstellungen:

| Einstellung                   | Standardwert | Effekt                                                                                                         | Betroffener Bereich |
| ----------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- | ------------------- |
| `ui.hideBanner`               | `false`      | Versteckt den gesamten Banner (Bereich A + B).                                                                 | A + B               |
| `ui.customBannerTitle`        | nicht gesetzt | Ersetzt den Markentext in B①. Das Versionsnummer-Suffix wird wie gehabt angehängt. Wird getrimmt; leerer String = Standard verwenden. | B① Markentext       |
| `ui.customBannerSubtitle`     | nicht gesetzt | Ersetzt den leeren Spacer in B② durch eine einzeilige Untertitelzeile. Wird bereinigt; maximal 160 Zeichen; leerer String = Spacer beibehalten (abwärtskompatibel). | B② Spacer-Zeile     |
| `ui.customAsciiArt`           | nicht gesetzt | Ersetzt Bereich A. Unterstützt drei Datenformen (siehe unten). Jeglicher Fehler fallbackt auf Standard.          | A                   |

**Absichtlich nicht bereitgestellt**:

- Kein Schalter zum „nur Verstecken des Versionsnummer-Suffixes".
- Kein Schalter zum „nur Verstecken der Authentifizierungs-/Modellzeile".
- Kein Schalter zum „nur Verstecken der Pfadzeile".
- Keine Einstiegsmöglichkeit zum Ändern der Verlaufsfarbe des Logos (Farbe wird vom Theme gesteuert).
- Keine Möglichkeit, die Reihenfolge oder Struktur des Informationspanels anzupassen.

Sollte in Zukunft ein Bedarf entstehen, ist dies als neues Feld separat zu bewerten und nicht aus den obigen drei Feldern abzuleiten.

## Benutzerkonfigurationsanleitung – Wie man Änderungen vornimmt

### Einschränkungen im Überblick

Jede Banner-Anpassung unterliegt diesen Obergrenzen. Bevor Sie manuell ASCII-Art erstellen, lesen Sie diese durch, damit der Parser nicht stillschweigend abschneidet oder ablehnt.

| Element                       | Obergrenze                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Zeichenanzahl Titel**       | **Maximal 80 Zeichen** (nach Bereinigung gezählt). Überschreitung wird abgeschnitten und eine `[BANNER]`-Warnung ausgegeben. Zeilenumbrüche und Steuerzeichen werden vor der Zählung entfernt. |
| **Zeichenanzahl Untertitel**  | **Maximal 160 Zeichen** (nach Bereinigung gezählt). Bereinigungspipeline identisch mit Titel; Überschreitung ebenfalls Warnung. |
| **Größe des ASCII-Art-Blocks**   | **Maximal 200 Zeilen × 200 Spalten**. Überschreitung wird abgeschnitten und `[BANNER]`-Warnung.                      |
| **Dateigröße ASCII-Art**     | **Maximal 64 KB**. Dateien größer als die Obergrenze werden nur bis zur Obergrenze gelesen, der Rest ignoriert.     |
| **Tatsächlich renderbare Breite des ASCII-Art** | Wird durch die Spaltenanzahl des Terminals beim Start bestimmt, **keine feste Zeichenanzahl**. Die genaue Formel und die verfügbaren Werte für verschiedene Terminalbreiten finden Sie weiter unten unter „Wie groß darf das Logo sein? – Breitenbudget". |

ASCII-Art hat **keine feste Obergrenze für die Zeichenanzahl** – nur die beiden oben genannten harten Limits für Zeilen/Spalten und das zur Laufzeit berechnete Breitenbudget. Derselbe Markenname mit 17 Zeichen kann je nach Schriftart in einer Zeile dargestellt werden oder nicht, abhängig von der visuellen Breite, nicht von der Buchstabenanzahl.

### Ablageort der Konfiguration

Alle vier Einstellungen befinden sich im Knoten `ui` der `settings.json`. Sowohl benutzerspezifische (`~/.qwen/settings.json`) als auch arbeitsbereichsspezifische (`.qwen/settings.json` im Projektstammverzeichnis) Einstellungen werden nach den üblichen Merge-Prioritäten verarbeitet (Workspace überschreibt User, System überschreibt Workspace).

`customAsciiArt` ist ein Sonderfall: Der Parser ersetzt nicht das gesamte Objekt als einen Wert durch einen höher priorisierten Scope, sondern traversiert tierweise nacheinander alle Scopes. Wenn ein User-Scope `{ small }` und ein Workspace-Scope `{ large }` definiert, werden beide wirksam – `small` stammt aus dem User-Scope, `large` aus dem Workspace-Scope. Dies ermöglicht zwei Dinge gleichzeitig:

1. Jeder `{ path }`-Eintrag wird relativ zu dem Verzeichnis der Datei aufgelöst, in der er deklariert ist (Workspace `.qwen/` vs. User `~/.qwen/`); bei alleiniger Betrachtung der gemergten Ansicht ginge der Scope-Kontext verloren.
2. Der Benutzer kann den standardmäßigen `large`-Tier in seinen persönlichen Einstellungen belassen und nur den `small`-Tier pro Arbeitsbereich überschreiben, ohne jedes Mal das gesamte Objekt neu schreiben zu müssen.

Wenn derselbe Tier in mehreren Scopes definiert ist, gilt die normale Priorität (System > Workspace > User). Wenn `customAsciiArt` in einem beliebigen Scope als einzelner String oder `{ path }` gesetzt wird, werden dennoch beide Tiers dieses Scopes gleichzeitig gefüllt.

### Gesamten Banner ausblenden

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

Die Startausgabe überspringt die Logo-Spalte und das Informationspanel. Tipps werden weiterhin angezeigt, es sei denn, `ui.hideTips` ist ebenfalls gesetzt.

### Markentitel ersetzen

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

Das Informationspanel rendert dann `Acme CLI (vX.Y.Z)`. Nach dem Setzen eines benutzerdefinierten Titels wird standardmäßig kein `>_`-Zeichen mehr angezeigt; um dies beizubehalten, schreiben Sie es selbst hin:
`"customBannerTitle": ">_ Acme CLI"`.

### Marken-Untertitel hinzufügen

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

Der Untertitel erscheint als separate Zeile in sekundärer Textfarbe und **ersetzt die standardmäßige leere Spacer-Zeile** (also die Zeile, die sich ursprünglich zwischen Titel und Authentifizierungs-/Modellzeile befand):

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① Titel
│ Built-in DataWorks Official Skills                      │  ← B② Untertitel
│ Qwen OAuth | qwen-coder ( /model wechseln)              │  ← B③ Status
│ ~/projects/example                                      │  ← B④ Pfad
└─────────────────────────────────────────────────────────┘
```

Einschränkungen:

- Nur eine einzige Zeile erlaubt. Zeilenumbrüche und andere Steuerbytes werden entfernt / zu Leerzeichen gefaltet, um zu vermeiden, dass Einfügefehler das Layout des Informationspanels zerreißen.
- Nach der Bereinigung maximal 160 Zeichen (etwas großzügiger als der Titel – Slogans, „powered by"-Phrasen usw. sind oft länger als Markennamen).
- Leer (oder als leerer String / nur Leerzeichen gesetzt) = standardmäßige leere Spacer-Zeile beibehalten – Abwärtskompatibilität ist das Standardverhalten.
- Der Untertitel ändert nichts am Verhalten der gesperrten Zeilen; Authentifizierung, Modell und Arbeitsverzeichnis sind immer sichtbar, unabhängig vom Zustand des Untertitels.

### ASCII-Art ersetzen – Inline-String

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Im JSON-String wird `\n` für Zeilenumbrüche verwendet. Diese ASCII-Art erhält denselben Farbverlauf des aktuellen Themes wie das Standard-Logo.

> **Haben Sie keine ASCII-Art zur Hand?** Jeder externe Generator ist verwendbar; fügen Sie das Ergebnis einfach ein. Der einfachste Weg ist `figlet`:
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt` und dann mit `customAsciiArt: { "path": "./brand.txt" }` darauf verweisen. Die CLI **rendert** keinen Text zur Laufzeit in ASCII-Art um – der Grund dafür wird weiter unten unter „Nicht im Designumfang" erläutert.

### ASCII-Art ersetzen – Externe Datei

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Vermeidet das Escapen langer mehrzeiliger Strings im JSON. Pfadauflösungsregeln:

- **Arbeitsbereichsbezogene Einstellung**: Relative Pfade relativ zum `.qwen/`-Verzeichnis des Workspace.
- **Benutzerbezogene Einstellung**: Relative Pfade relativ zu `~/.qwen/`.
- Absolute Pfade werden direkt verwendet.
- Die Datei wird **nur beim Start einmal gelesen**, bereinigt und zwischengespeichert. Änderungen an der Datei während der Sitzung führen nicht zu einem Neu-Rendering – bitte CLI neu starten.

### ASCII-Art ersetzen – Breitenabhängige Auswahl

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

Wenn das Terminal breit genug ist, wird bevorzugt `large` verwendet; andernfalls `small`; andernfalls wird die Logo-Spalte ausgeblendet (unter Verwendung der aktuellen Zwei-Spalten-Fallback-Strategie). Sowohl `small` als auch `large` können entweder ein String oder ein `{ path }` sein. Jeder Tier kann weggelassen werden: Fehlt er, wird direkt zum nächsten Tier übergegangen.

### Wie groß darf das Logo sein? – Breitenbudget

Weder Titel noch Art haben eine „harte Obergrenze für Zeichen", sondern nur ein **Breitenbudget**, das von der Spaltenanzahl des Terminals abhängt, sowie absolute harte Limits, um fehlerhafte Eingaben vom Einfrieren des Layouts abzuhalten:

| Element                              | Obergrenze                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Spaltenanzahl des Terminals beim Start | So viele, wie das Terminal meldet.                                                   |
| Äußerer Rand des Containers          | 4 Spalten (links 2 + rechts 2).                                                      |
| Abstand zwischen Logo-Spalte und Informationspanel | 2 Spalten.                                                                           |
| Mindestbreite des Informationspanels | 44 Spalten (40 Pfad + Rahmen + Innenabstand).                                        |
| **Verfügbare Breite für Art pro Tier beim Rendern** | `Terminalspalten − 4 − 2 − 44 = Terminalspalten − 50`.                               |
| Harte Obergrenze für bereinigtes Art pro Tier | 200 Spalten × 200 Zeilen. Überschreitung wird abgeschnitten und `[BANNER]`-Warnung.  |
| Harte Obergrenze für bereinigtes `customBannerTitle` | 80 Zeichen. Überschreitung wird abgeschnitten und `[BANNER]`-Warnung.                |

Häufige Terminalbreiten und die entsprechenden maximalen Logo-Breiten:

| Terminalspalten | Maximal renderbare Logo-Breite | Tatsächliche Bedeutung                                                         |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| 80              | 30                             | Die meisten figlet-Zeichen in „ANSI Shadow" benötigen 7–11 Spalten, maximal 3 Buchstaben. |
| 100             | 50                             | ANSI Shadow reicht für ein kurzes Wort (ca. 6 Buchstaben) oder zwei gestapelte kurze Wörter. |
| 120             | 70                             | Mehrzeilige Wortstapel-Art ist völlig ausreichend.                             |
| 200             | 150                            | Einzeilige lange Zeichenfolgen (z.B. ANSI Shadow für einen vollständigen Produktnamen) passen ebenfalls. |

Zwei Faustregeln beim Entwerfen von Art:

1. **Markennamen mit mehreren Wörtern lassen sich auf den meisten Terminals nicht in einer Zeile mit ANSI Shadow darstellen.** ANSI Shadow benötigt pro Buchstabe etwa 7–9 Spalten. Selbst ein 12-Zeichen-Markenname wie `Custom Agent` benötigt etwa 95 Spalten Art in einer Zeile – ein 100-Spalten-Terminal reicht nach Abzug des Informationspanels nicht mehr aus. Stapeln Sie die Wörter entweder, verwenden Sie eine schmalere figlet-Schriftart oder greifen Sie direkt zu einer kompakten einzeiligen Dekoration, z.B. `▶ Custom Agent ◀`.
2. **Wenn ein einzelner Tier sowohl „auf breiten Bildschirmen gut aussehen" als auch „auf schmalen Bildschirmen nicht sterben" soll, verwenden Sie die breitenabhängige Form `{ small, large }`.** Im folgenden Beispiel ist `large` eine gestapelte mehrzeilige Art für Terminals ≥ 104 Spalten, `small` eine einzeilige Dekoration mit 16 Spalten. Wenn das Terminal zu schmal für beides ist, wird die Logo-Spalte ausgeblendet.

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

In `banner-large.txt` wird die gestapelte ANSI-Shadow-Ausgabe (ca. 54 Spalten × 12 Zeilen) abgelegt, erzeugt mit folgendem Befehl:

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Drei Kombinationen

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

### Wie überprüfen

1. Speichern Sie `settings.json`, starten Sie `qwen` neu – die Banner-Analyse läuft nur einmal beim Start.
2. Passen Sie die Terminalbreite an und prüfen Sie, ob der Wechsel zwischen `small` / `large` wie erwartet funktioniert und die Logo-Spalte bei sehr schmaler Breite korrekt ausgeblendet wird.
3. Wenn das Ergebnis nicht den Erwartungen entspricht, prüfen Sie `~/.qwen/debug/<sessionId>.txt` (`latest.txt` zeigt auf die aktuelle Sitzung) und suchen Sie nach `[BANNER]` – jeder weiche Fehler gibt eine Warnung mit Begründung aus.

## Analyse-Pipeline

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
   │ 1. Normalisieren zu      │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. Jeden Tier auflösen:  │           │
   │    string → direkt       │           │  Je nach availableTerminalWidth
   │    {path} → fs.read      │           │  Tier auswählen
   │      O_NOFOLLOW          │           ▼
   │      ≤ 64 KB             │          Logo-Spalte rendern
   │ 3. Art bereinigen:        │          Informationspanel rendern:
   │    stripControlSeqs      │           Titel    = customBannerTitle
   │    ≤ 200 Zeilen × 200 Sp.│                   ?? '>_ Qwen Code'
   │ 4. Titel + Untertitel     │           Untertitel = customBannerSubtitle
   │    bereinigen (einzeilig, │                   ?? Leere Spacer-Zeile
   │    ≤ 80 / 160 Zeichen)    │           Status   = Gesperrt
   │ 5. Nach Quelle memoizen   │           Pfad     = Gesperrt
   └─────────────────────────┘
```

Der fünfstufige Analysealgorithmus läuft einmal beim Laden der Einstellungen und erneut nur bei Auslösung eines Einstellungs-Hot-Reload-Ereignisses:

1. **Normalisierung**. Bloßer `string` oder `{ path }` wird in `{ small: x, large: x }` umgewandelt. `{ small, large }`-Objekte werden unverändert durchgereicht.
2. **Tierweise Auflösung**. Für jede `AsciiArtSource`:
   - String: Direkt verwenden.
   - `{ path }`: Synchron lesen, mit `O_NOFOLLOW` zum Schutz vor Symlink-Angriffen (Windows fällt auf normales schreibgeschütztes Lesen zurück – die Konstante wird dort nicht exponiert), maximal 64 KB. Relative Pfade relativ zum *Verzeichnis der zugehörigen Einstellungsdatei*: Workspace-Einstellungen relativ zu `.qwen/` des Workspace, User-Einstellungen relativ zu `~/.qwen/`. Lesefehler → `[BANNER]`-Warnung, dieser Tier fällt auf Standard zurück.
3. **Bereinigung**. Banner-spezifischer Stripper: Entfernt OSC / CSI / SS2 / SS3-Einführungszeichen, ersetzt die restlichen C0 / C1-Steuerbytes (einschließlich DEL) durch Leerzeichen, behält aber `\n` bei, damit mehrzeilige ASCII-Art überlebt. Jede Zeile wird mit getrimmten nachgestellten Leerzeichen auf maximal 200 Zeilen × 200 Spalten abgeschnitten; Überschreitung erzeugt `[BANNER]`-Warnung.
4. **Tier-Auswahl zur Renderingzeit**. In `Header.tsx` wird bei gegebenem aufgelöstem `small` und `large` basierend auf dem aktuellen Breitenbudget (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`) ausgewählt:
   - Wenn `large` passt, wird `large` bevorzugt.
   - Sonst, wenn `small` passt, Fallback auf `small`.
   - Sonst: **Wenn der Benutzer jemals Custom-Art bereitgestellt hat**, wird die Logo-Spalte direkt ausgeblendet (unter Verwendung des `showLogo = false`-Zweigs) – ein Fallback auf das integrierte QWEN-Logo würde auf schmalen Terminals die White-Label-Bereitstellung stillschweigend zerstören. Das Informationspanel wird weiterhin gerendert.
   - Sonst (Benutzer hat überhaupt kein Custom-Art bereitgestellt) Fallback auf `shortAsciiLogo`, wobei die Breitenschwelle des Standardlogos entscheidet, ob es angezeigt wird.
5. **Sicherung**. Wenn beide Tiers aufgrund weicher Fehler (Datei fehlt, nach Bereinigung leer, fehlerhafte Konfiguration) letztendlich leer oder ungültig sind, wird wie bei nicht benutzerdefiniertem `shortAsciiLogo` gerendert, und es gelten die Breitenschwellen des Standardlogos. Die CLI **darf aufgrund einer fehlerhaften Banner-Konfiguration nicht abstürzen**.

Pseudocode für die Tier-Auswahl:

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
  return undefined; // Logo-Spalte ausblenden
}
```

## Settings Schema – Neuerungen

Im Objekt `ui` in `packages/cli/src/config/settingsSchema.ts` werden direkt nach `shellOutputMaxLines` vier Eigenschaften hinzugefügt:

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
  // Union-Typ, der sich im `type` der SettingDefinition nicht ausdrücken lässt.
  // Der override wird vom JSON-Schema-Generator unverändert ausgegeben, sodass VS Code
  // alle dokumentierten Formen akzeptiert (string, {path}, {small,large}) und nackte
  // Strings nicht rot markiert.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` folgt dem bestehenden Muster von `hideTips` (`showInDialog: true`); die drei anderen Freitextfelder (Titel, Untertitel, Art) erscheinen nicht im anwendungsinternen Einstellungsdialog – einen mehrzeiligen ASCII-Editor im TUI-Dialog zu bauen ist ein separates Projekt; fortgeschrittene Benutzer bearbeiten direkt `settings.json`.

## Code-Änderungspunkte

Die Änderungen sind gering. Nachfolgend sind für jede Stelle die Datei und die Zeilenbereiche auf dem aktuellen `main`-Branch angegeben.

`packages/cli/src/ui/components/AppHeader.tsx:53` – Erweiterung von `showBanner`:

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` – Übergabe der aufgelösten Banner-Daten an `<Header>`:

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

`packages/cli/src/ui/components/Header.tsx` – Erweiterung von `HeaderProps`:

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

`packages/cli/src/ui/components/Header.tsx:45-46` – Vor der Berechnung von `logoWidth` den Tier auswählen und mit dem vorhandenen Standard als Rückfall:

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

`packages/cli/src/ui/components/Header.tsx` – Titel aus Prop rendern, Untertitel ersetzt bei vorhandenem Prop die standardmäßige leere Spacer-Zeile:

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

**Neue Datei**: `packages/cli/src/ui/utils/customBanner.ts` – Parser.
Externes Interface:

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

Der Parser ist verantwortlich für die in der „Analyse-Pipeline" beschriebene Normalisierung, Datei-Lesen, Bereinigung und Caching. Er wird beim Start der CLI einmal aufgerufen und erneut bei Einstellungs-Hot-Reload-Ereignissen. Die Dateipfade jedes Scopes stammen direkt von `settings.system.path` / `settings.workspace.path` / `settings.user.path`, sodass jeder `{ path }` relativ zu der Datei aufgelöst wird, in der er deklariert ist; wenn `settings.isTrusted` falsch ist, wird der Workspace-Scope komplett übersprungen.

## Alternativen-Vergleich

Im Folgenden werden die fünf zuvor evaluierten Formen aufgeführt, damit zukünftige Maintainer den Designraum verstehen und bei Bedarf neu bewerten können.

### Option 1 – Drei flache Felder (empfohlen, deckungsgleich mit dem Issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Wirkung**: Minimaler Benutzeraufwand, eins-zu-eins mit der Beschreibung im Issue.
- **Vorteile**: Null Lernkurve; Dokumentation extrem einfach; konsistent mit bestehenden flachen `ui.*`-Feldern (`hideTips`, `customWittyPhrases` usw.).
- **Nachteile**: Drei semantisch zusammengehörige Schlüssel sind lose auf der obersten Ebene von `ui` verteilt; zukünftige Banner-spezifische Schalter (Farbverlauf, Untertitel usw.) müssten weiterhin als Geschwisterfelder zu `ui` hinzugefügt werden, ohne natürliche Gruppierung.

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

- **Wirkung**: Gleiche Funktionalität wie Option 1, aber nach Feature gruppiert.
- **Vorteile**: Zukünftige Banner-spezifische Schalter haben einen sauberen Namensraum; bessere Auffindbarkeit in `/settings`.
- **Nachteile**: Nicht vollständig deckungsgleich mit der Schreibweise im Issue; bestehende UI-Einstellungen sind überwiegend flach (nur `ui.accessibility` und `ui.statusLine` sind verschachtelt), was die Konsistenz beeinträchtigt; eine zusätzliche Ebene zum Merken.
### Lösung 3 – Banner-Profil-Vorgabe + Slot-Überschreibung

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* Slot-Überschreibungen unter 'branded' */ }
  }
}
```

- **Effekt**: Benutzer wählen aus benannten Profilen; fortgeschrittene Benutzer überschreiben bestimmte Slots im gewählten Profil.
- **Vorteile**: Bessere Onboarding-Erfahrung; Profile können von der CLI mitgeliefert werden.
- **Nachteile**: Deutlich höhere Komplexität; Profile sind eine langfristige Wartungsverpflichtung; im Issue wird offene Anpassbarkeit gefordert, keine Inhaltskuratierung.

### Lösung 4 – Gesamte Banner-Vorlage als Template-String

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Effekt**: Ein einzelnes freiformatiges Template, in das festgelegte Felder interpoliert werden.
- **Vorteile**: Maximale Flexibilität für unübliche Layouts.
- **Nachteile**: Die Layoutverantwortung wird auf den Benutzer abgewälzt; die Robustheit von Inks Zweispaltenlayout gegenüber Terminalbreiten geht verloren; leicht lassen sich Templates erstellen, die in schmalen Terminals zerbrechen; große Angriffsfläche für relativ geringen Nutzen.

### Lösung 5 – Plugin-/Hook-API

Einen Banner-Renderer-Hook über das Erweiterungssystem bereitstellen.

- **Effekt**: Code-Level-Anpassung; Erweiterungen können beliebige Inhalte rendern.
- **Vorteile**: Höchste Leistungsfähigkeit; Unternehmen können komplett gekapselte Branding-Plugins ausliefern.
- **Nachteile**: Riesige API-Oberfläche; beliebiges Terminal-Rendering erfordert Sicherheitsprüfung; für dieses Issue völlig überdimensioniert.

### Empfohlene Entscheidung

**Lösung 1 wird umgesetzt**. Sie erfüllt das Issue direkt, passt zum vorhandenen `ui.*`-Stil und wird nicht durch einen Namespace eingeschränkt, bevor wir wissen, welche weiteren Banner-spezifischen Schalter es noch geben wird. Falls in Zukunft verwandte Felder dazukommen, ist der Übergang zu Lösung 2 additiv – `ui.banner.title` und `ui.customBannerTitle` können während einer Abkündigungsfrist nebeneinander existieren.

## Sicherheit und Fehlerbehandlung

Benutzerdefinierte Banner-Inhalte werden **wörtlich an das Terminal gerendert**, bei der Pfad-Variante zusätzlich **von der Festplatte gelesen**. Beide Pfade sind bei geladenen oder manipulierten Einstellungen erreichbar. Das gleiche Bedrohungsmodell wie bei der Session-Title-Funktion gilt hier entsprechend.

| Aspekt                                                   | Schutzmaßnahme                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ANSI / OSC-8 / CSI Injection in ASCII-Art / Titel / Untertitel | Banner-spezifischer Stripper (`sanitizeArt` / `sanitizeSingleLine`): Entfernt OSC / CSI / SS2 / SS3-Einführungssequenzen, ersetzt übrige C0-/C1-Steuerbytes (inkl. DEL) durch Leerzeichen. Wird vor Rendering und Cacheschreiben angewendet. |
| Start einfrieren durch übergroße Datei                   | Datei-Lese-Hard-Limit von 64 KB.                                                                                                                                                                                                    |
| Layout einfrieren durch pathologische ASCII-Art          | Max. 200 Zeilen × 200 Spalten pro Parse-Ergebnis; Überstehendes wird abgeschnitten + `[BANNER]`-Warnung.                                                                                                                           |
| Symlink-Angriff auf Pfad-Variante                        | Dateilesen mit `O_NOFOLLOW` (unter Windows Fallback auf Nur-Lesen; Konstante nicht exponiert).                                                                                                                                     |
| Fehlende oder nicht lesbare Datei                        | Abfangen → `[BANNER]`-Warnung → Fallback auf Standard; wird niemals in die UI geworfen.                                                                                                                                           |
| Titel / Untertitel enthalten Zeilenumbrüche oder sind zu lang | Zeilenumbrüche durch Leerzeichen ersetzen, auf 80 (Titel) / 160 (Untertitel) Zeichen kürzen.                                                                                                                                       |
| Nicht vertrauenswürdiger Workspace beeinflusst Rendering oder Dateilesen | Wenn `settings.isTrusted` false ist, überspringt der Parser `settings.workspace` komplett (übereinstimmend mit der Vertrauensschranke der `settings.merged`-Ansicht).                                                              |
| Race-Condition bei Hot-Reload der Einstellungen          | Parse-Ergebnisse werden pro Aufruf nach Quelle (Pfad oder String) memoized; bei Reload wird der Parser erneut durchlaufen und betroffene Dateien neu gelesen.                                                                       |

Zusammenfassung der Fehlermodi: Alle weichen Fehler führen letztlich zu `shortAsciiLogo` (oder festgelegtem Standardtitel) + einer Debug-Log-Warnung. Kein Zweig darf einen harten Fehler (Exception nach oben) produzieren.

## Nicht im Entwurf enthalten

Folgende Punkte wurden bewusst ausgeschlossen. Jeder kann auf Basis von Benutzerfeedback in einem separaten Vorschlag nachgereicht werden.

| Punkt                                                | Grund für Nichteinbeziehung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text in ASCII-Art umwandeln (Form `{ text: "xxxCode" }`) | Nach v1-Bewertung **abgelehnt**. Entweder man bringt die Laufzeitabhängigkeit `figlet` mit (ca. 2–3 MB unpacked inkl. eines Satzes nutzbarer Fonts) oder man vendort einen eigenen Single-Font-Renderer (~200 Codezeilen + eine selbst gepflegte `.flf`-Fontdatei). Beide Wege verursachen langfristige Wartungskosten: Schriftauswahl, Lizenzprüfung, Issues wie „mein Font rendert in Terminal X falsch“, CJK-/Vollbreitenzeichenbehandlung. Der Anwendungsfall, der diese Funktion treibt (White-Label / Multi-Tenant), wird mit hoher Wahrscheinlichkeit fertige ASCII-Art vom Designer liefern, nicht auf figlet-Standardfonts angewiesen sein. Benutzer, die sich eine Einzeiler-Generierung wünschen, können heute `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` nutzen – gleicher Effekt, null neue Abhängigkeiten, kein interner Qwen Code-Supportaufwand. Falls die Nachfrage steigt, ist diese Form rein additiv: Erweiterung von `AsciiArtSource` um `string \| {path} \| {text, font?}`, ohne bestehende Konfigurationen zu brechen. |
| `/banner`-Slash-Befehl zur Online-Bearbeitung        | Das Einstellungs-UI ist der normative Editor; ein mehrzeiliger ASCII-Online-Editor ist ein separates Projekt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Benutzerdefinierte Farbverläufe / Einzelfarben       | Farbe gehört zum Theme. Falls nötig, eigener Vorschlag – Banner-Anpassung soll diese Fläche nicht neu erfinden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ASCII-Art von URL laden                              | Netzwerkanfragen beim Start bringen viele Probleme mit sich: Fehlermodi, Caching, Sicherheitsprüfung. Der `{path}`-Dateiladepfad ist ein risikoarmes Äquivalent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Animation (rotierendes Logo, Laufschrift-Titel)      | Erhöht Rendering-Aufwand und Barrierefreiheitsprobleme; der Anwendungsfall dieser Funktion benötigt dies nicht.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Banner-Anpassung für VSCode / Web-UI                 | Diese beiden Endpoints rendern derzeit kein Ink-Banner. Falls in Zukunft eingeführt, dient dieser Entwurf als Referenz.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Dynamisches Neuladen bei Dateiänderungen             | Der Parser läuft nur beim Start und beim Reload der Einstellungen. Der Bedarf, mid-session die Art zu wechseln, ist gering; „Neustart erforderlich“ ist ein akzeptabler Kompromiss.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Einzelnes Ausblenden von gesperrten Bereichen (version / auth / model / path) | Dies sind Laufzeitsignale; ihr Ausblenden schadet Support- und Sicherheitslage mehr, als es White-Label-Szenarien nützt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Validierungsplan

Der nachfolgende Implementierungs-PR sollte die folgenden End-to-End-Prüfungen durchlaufen:

1. `~/.qwen/settings.json` setzt `customBannerTitle: "Acme CLI"` und eine Inline-`customAsciiArt` → nach Start von `qwen` wird der neue Titel und die neue ASCII-Art angezeigt; das Versionssuffix bleibt erhalten.
2. Setzen von `customBannerSubtitle: "Built-in Acme Skills"` → die Untertitelzeile erscheint in sekundärer Textfarbe zwischen Titel und Authentifizierungs-/Modellzeile; Authentifizierung, Modell und Pfad bleiben sichtbar. Nach Entfernen der Einstellung wird wieder die leere Spacer-Zeile angezeigt (Abwärtskompatibilität).
3. Setzen von `hideBanner: true` → `qwen` startet ohne Banner; Tipps und Hauptinhalt werden normal gerendert.
4. Im Workspace `settings.json` wird `customAsciiArt: { "path": "./brand.txt" }` gesetzt, `brand.txt` befindet sich im selben Verzeichnis `.qwen/` → beim Öffnen des Workspace wird von der Festplatte geladen.
5. `customAsciiArt: { "small": "...", "large": "..." }` → Terminalgröße in den Stufen breit / mittel / schmal ändern; bei breiter Größe wird große, bei mittlerer kleine Art angezeigt, bei schmaler Größe wird die Logo-Spalte ausgeblendet; das Informationspanel bleibt immer sichtbar.
6. In `customBannerTitle` **und** `customBannerSubtitle` wird jeweils `\x1b[31mhostile` injiziert → beide Stellen rendern als Literaltext, werden nicht als rot interpretiert.
7. `path` zeigt auf eine nicht existierende Datei → CLI startet normal; in `~/.qwen/debug/<sessionId>.txt` erscheint eine `[BANNER]`-Warnung; Standard-Art wird gerendert.
8. Bei deaktiviertem Workspace-Vertrauen wird ein Worktree geöffnet → die vom Workspace bereitgestellte `customAsciiArt` (einschließlich `{ path }`-Eintrag) wird stillschweigend ignoriert; Einstellungen im Benutzerbereich sind weiterhin wirksam.