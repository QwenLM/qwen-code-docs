# Banner-Design für benutzerdefinierte Bereiche

> Ermöglicht Benutzern, das QWEN-ASCII-Logo zu ersetzen, den Markennamen zu ändern oder das gesamte Banner auszublenden –
> aber es ist nicht erlaubt, die Laufzeitinformationen (Versionsnummer, Authentifizierungsmethode, Modell,
> Arbeitsverzeichnis) zu entfernen, die für die Fehlerbehebung und Vertrauenswürdigkeit erforderlich sind.

## Überblick

Qwen Code CLI druckt beim Start ein Banner am oberen Rand des Terminals, das ein QWEN-ASCII-Logo und ein umrandetes Informationspanel enthält. Es gibt verschiedene reale Szenarien, in denen dieser Bereich kontrolliert werden muss:

- **White-Labeling / Branding von Drittanbietern**: Bei der Integration von Qwen Code in unternehmenseigene oder Teamprodukte muss die eigene Marke anstelle des standardmäßigen "Qwen Code" angezeigt werden.
- **Personalisierung**: Einzelne Benutzer möchten das Terminal-Banner an die Teamrichtlinien oder den persönlichen Geschmack anpassen.
- **Multi-Tenant / Multi-Instance-Unterscheidung**: In gemeinsam genutzten Umgebungen möchten verschiedene Teams schnell erkennen, welche Instanz sie gerade verwenden.

Der Design-Ansatz ist sehr einfach: **Markenerscheinungsbild austauschbar; Laufzeitinformationen nicht austauschbar**.
Die Anpassung erlaubt nur, dass Benutzer ihre eigene Marke darüberlegen, **aber nicht**, dass wichtige Informationen zur Fehlerbehebung ausgeblendet werden. Jede spätere Entscheidung, ob etwas "änderbar" oder "unveränderbar" ist, folgt aus diesem Ansatz.

Entspricht dem Issue: [#3005](https://github.com/QwenLM/qwen-code/issues/3005).

## Aufteilung des Bannerbereichs

Das aktuell Banner wird von `Header` (gemountet durch `AppHeader`) gerendert und lässt sich wie folgt unterteilen:

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo-Spalte ───────┐  gap=2  ┌──── Infopanel (mit Rahmen) ───────┐ │
│   │                        │         │                                    │ │
│   │  ███ QWEN ASCII ███    │         │  ① Titel:     >_ Qwen Code (vX.Y.Z) │
│   │  ███   ART ART  ███    │         │  ② Untertitel: «Leerzeile / eigene Überschreibung» │
│   │  ███ QWEN ASCII ███    │         │  ③ Status:    Qwen OAuth | qwen-…   │
│   │                        │         │  ④ Pfad:      ~/projects/example    │
│   └──────── A ──────────┘         └──────────────── B ──────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                               Bereichszugehörigkeit: AppHeader
                          │ Tips-Komponente wird darunter gerendert (gesteuert durch ui.hideTips) │
```

Zwei Hauptblöcke:

- **A. Logo-Spalte** – Ein einzelner, farbverlaufshinterlegter ASCII-Art.
  Derzeitige Quelle: `shortAsciiLogo` in `packages/cli/src/ui/components/AsciiArt.ts`.
- **B. Infopanel** – umrandete Informationsbox mit insgesamt vier Zeilen. Die zweite Zeile ist standardmäßig ein visueller Platzhalter, der optional durch einen vom Aufrufer bereitgestellten Untertitel ersetzt werden kann:
  - **B①** Titel: `>_ Qwen Code (vX.Y.Z)` – Markentext mit Versionsnummer.
  - **B②** Untertitel / Platzhalter: Standardmäßig eine einzelne Leerzeichenzeile. Wenn `ui.customBannerSubtitle` gesetzt ist, wird ein bereinigter, einzeiliger Untertitel-String gerendert (z. B. für einen Fork `Built-in DataWorks Official Skills`).
  - **B③** Status: `<Authentifizierungstyp> | <Modell> (/model wechseln)`.
  - **B④** Pfad: Das mit Tilde-Operator gekürzte Arbeitsverzeichnis.

Die äußere `<AppHeader>`-Komponente versteckt das Banner bereits im Screenreader-Modus basierend auf `showBanner = !config.getScreenReader()` (im Screenreader-Modus wird auf reine Textausgabe zurückgegriffen).

## Anpassungsregeln – Was geändert werden kann und was gesperrt ist

| Bereich                              | Aktuelle Quelle                       | Anpassungskategorie       | Grund für Sperrung/Freigabe                                                                                                                                       |
| ------------------------------------ | ------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Logo-Spalte**                   | `shortAsciiLogo` (`AsciiArt.ts`)      | **Austauschbar + automatisch ausblendbar** | Reiner Markenbereich. White-Labeling-Szenarien benötigen vollständige visuelle Kontrolle. Das bestehende Verhalten bei schmalen Terminals („Logo automatisch ausblenden") bleibt erhalten. |
| **B①. Titeltext** (`>_ Qwen Code`)   | In `Header.tsx` hartcodiert           | **Austauschbar**          | Markenbereich. Die Zeichenfolge `>_` ist Teil der aktuellen Marke; wenn nicht gewünscht, kann der Benutzer sie in `customBannerTitle` weglassen.                   |
| **B①. Versionsnummer-Suffix** (`(vX.Y.Z)`) | `version`-Prop                         | **Gesperrt**              | Notwendig für Fehlerbehebung und Support. Wenn ausgeblendet, könnte nur noch durch `--version` beantwortet werden, welche Version verwendet wird – das ist ein echter Kostenfaktor im Support. Wir nehmen dafür eine geringfügige Einschränkung des White-Labeling-Erlebnisses in Kauf. |
| **B②. Untertitel / Platzhalterzeile** | Standardmäßig leer                    | **Austauschbar**          | Reiner Marken-/Kontextbereich. White-Label-Forks verwenden dies, um eine Build-Version zu taggen (z. B. "Built-in DataWorks Official Skills"). Die Bereinigungsregeln sind die gleichen wie für den Titel; es ist nur eine einzelne Zeile erlaubt, keine Zeilenumbrüche, die das Layout stören würden. |
| **B③. Statuszeile** (Auth + Modell)   | `formattedAuthType`-, `model`-Props   | **Gesperrt**              | Betriebs- und Sicherheitssignal. Der Benutzer muss die aktuell verwendeten Anmeldeinformationen und das Modell, das tatsächlich Tokens verbraucht, sehen. Jedes Ausblenden/Ersetzen wäre gefährlich – selbst in White-Labeling-Szenarien nicht erlaubt. |
| **B④. Pfadzeile** (Arbeitsverzeichnis) | `workingDirectory`-Prop                | **Gesperrt**              | Betriebsinformation. „In welchem Verzeichnis bin ich gerade?" ist eine häufige Frage; das Banner ist die einzige autoritative Quelle dafür.                     |
| **Gesamtes Banner** (A + B)          | `<Header>`-Mount in `AppHeader.tsx`   | **Ausblendbar**           | Ein `ui.hideBanner: true` überspringt sowohl Block A als auch Block B – analog zum bestehenden Screenreader-Modus-Switch. `<Tips>` wird weiterhin separat durch `ui.hideTips` gesteuert. |

Die obige Matrix entspricht genau vier Einstellungen:

| Einstellung                   | Standardwert | Effekt                                                                                                 | Betroffener Bereich |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ | ------------------- |
| `ui.hideBanner`               | `false`      | Blendet das gesamte Banner aus (Bereich A + B).                                                        | A + B               |
| `ui.customBannerTitle`        | nicht gesetzt| Ersetzt den Markentext in B①. Die Versionsnummer wird wie gehabt angehängt. Wird getrimmt; leerer String = Standard verwenden. | B① Markentext      |
| `ui.customBannerSubtitle`     | nicht gesetzt| Ersetzt den leeren Platzhalter in B② durch eine Untertitelzeile. Wird bereinigt; maximal 160 Zeichen; leerer String = leerer Platzhalter bleibt (abwärtskompatibel). | B② Platzhalterzeile |
| `ui.customAsciiArt`           | nicht gesetzt| Ersetzt Bereich A. Unterstützt drei Datenformen (siehe unten). Jeder Fehler führt zum Fallback auf das Standard-ASCII-Art. | A                  |
**Bewusst nicht bereitgestellte Funktionen**:

- Es wird kein Schalter zum "nur Ausblenden der Versionsnummer-Suffixe" bereitgestellt.
- Es wird kein Schalter zum "nur Ausblenden der Authentifizierungs-/Modellzeile" bereitgestellt.
- Es wird kein Schalter zum "nur Ausblenden der Pfadzeile" bereitgestellt.
- Es wird keine Änderungsmöglichkeit für die Farbverlaufsfarbe des Logos bereitgestellt (die Farbe wird vom Theme verwaltet).
- Es wird keine Möglichkeit zur Anpassung der Reihenfolge oder Struktur des Informationspanels bereitgestellt.

Sollte zukünftig tatsächlich Bedarf bestehen, muss dies als neues Feld separat evaluiert werden und nicht aus den drei oben genannten Feldern abgeleitet werden.

## Benutzerkonfigurationsanleitung – So ändern Sie es

### Einschränkungen im Überblick

Jede benutzerdefinierte Banner-Anpassung unterliegt den folgenden Limits. Lesen Sie diese vor dem manuellen Erstellen von ASCII-Art durch, um zu vermeiden, dass der Parser diese stillschweigend abschneidet oder ablehnt.

| Posten                         | Obergrenze                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zeichenanzahl des Titels**   | **80 Zeichen Obergrenze** (gezählt nach Bereinigung). Bei Überschreitung wird abgeschnitten und eine `[BANNER]`-Warnung ausgegeben. Zeilenumbrüche und Steuerzeichen werden vor dem Zählen entfernt. |
| **Zeichenanzahl des Untertitels** | **160 Zeichen Obergrenze** (gezählt nach Bereinigung). Die Bereinigungspipeline ist identisch mit der des Titels; bei Überschreitung wird ebenfalls eine `[BANNER]`-Warnung ausgegeben. |
| **ASCII-Art-Blockgröße**       | **200 Zeilen × 200 Spalten Obergrenze**. Bei Überschreitung wird abgeschnitten und eine `[BANNER]`-Warnung ausgegeben.                             |
| **ASCII-Art-Dateigröße**       | **64 KB Obergrenze**. Wenn die Datei größer ist, werden nur die Bytes bis zur Obergrenze gelesen, der Rest wird ignoriert.                         |
| **Tatsächlich darstellbare Breite von ASCII-Art** | Wird durch die Terminal-Spaltenanzahl beim Start bestimmt, **keine feste Zeichenanzahl**. Die genaue Formel und die verfügbaren Werte für verschiedene Terminalbreiten finden Sie im Abschnitt "Wie groß kann das Logo sein? – Breitenbudget". |

ASCII-Art hat **keine feste Zeichenbegrenzung** – nur die oben genannten harten Spalten-/Zeilenobergrenzen und das nach Start anhand der Terminal-Spaltenanzahl berechnete Breitenbudget. Dasselbe 17 Zeichen lange Markenlogo kann je nach Schriftart möglicherweise nicht in einer Zeile dargestellt werden, je nach visueller Breite und nicht nach Buchstabenanzahl.

### Speicherort der Konfiguration

Alle vier Einstellungen befinden sich im Knoten `ui` in `settings.json`. Es werden sowohl benutzerspezifische (`~/.qwen/settings.json`) als auch workspace-spezifische (`.qwen/settings.json` im Projektstammverzeichnis) Einstellungen unterstützt, die gemäß der standardmäßigen Merge-Priorität wirksam werden (Workspace überschreibt User, System überschreibt Workspace).

`customAsciiArt` ist ein Sonderfall: Der Parser ersetzt nicht das gesamte Objekt als einen Wert durch die höher priorisierte Sphäre, sondern durchläuft stattdessen schrittweise (tier) alle Sphären. Wenn die User-Einstellung `{ small }` definiert und die Workspace-Einstellung `{ large }` definiert, werden beide wirksam – `small` stammt vom User, `large` vom Workspace. Dadurch werden zwei Anforderungen gleichzeitig erfüllt:

1. Jeder `{ path }`-Eintrag wird relativ zu der Datei aufgelöst, in der er deklariert ist (Workspace `.qwen/` vs. User `~/.qwen/`); wenn man nur die zusammengeführte Ansicht betrachtet, geht diese Sphäreninformation verloren.
2. Benutzer können die standardmäßige `large`-Stufe in ihren persönlichen Einstellungen belassen und pro Workspace nur `small` überschreiben, ohne das gesamte Objekt jedes Mal neu schreiben zu müssen.

Wenn dieselbe Stufe in mehreren Sphären definiert ist, gilt dennoch die normale Priorität (System > Workspace > User). Wenn `customAsciiArt` in einer beliebigen Sphäre als einzelne Zeichenfolge oder `{ path }` gesetzt wird, werden gleichzeitig beide Stufen dieser Sphäre befüllt.

### Banner vollständig ausblenden

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

Die Startausgabe überspringt die Logo-Spalte und das Informationspanel. Sofern nicht auch `ui.hideTips` gesetzt ist, werden Tipps weiterhin angezeigt.

### Markentitel ersetzen

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

Das Informationspanel wird als `Acme CLI (vX.Y.Z)` dargestellt. Nach dem Setzen eines benutzerdefinierten Titels wird standardmäßig kein `>_`-Zeichen mehr angehängt; wenn Sie es behalten möchten, fügen Sie es selbst hinzu:
`"customBannerTitle": ">_ Acme CLI"`.

### Markenuntertitel hinzufügen

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

Der Untertitel wird in sekundärer Textfarbe in einer eigenen Zeile angezeigt und **ersetzt** die standardmäßige leere Spacer-Zeile (die Zeile, die sich ursprünglich zwischen dem Titel und der Authentifizierungs-/Modellzeile befand):

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① Titel
│ Built-in DataWorks Official Skills                      │  ← B② Untertitel
│ Qwen OAuth | qwen-coder ( /model wechseln)              │  ← B③ Status
│ ~/projects/example                                      │  ← B④ Pfad
└─────────────────────────────────────────────────────────┘
```

Einschränkungen:

- Nur eine einzelne Zeile erlaubt. Zeilenumbrüche und andere Steuerbytes werden entfernt / als Leerzeichen behandelt, um Layout-Probleme im Informationspanel durch Einfügen zu vermeiden.
- Obergrenze nach Bereinigung: 160 Zeichen (etwas großzügiger als beim Titel – Slogans / "powered by"-Texte sind oft länger als Markennamen).
- Leer lassen (oder als leeren String / nur Leerzeichen setzen) = die standardmäßige leere Spacer-Zeile beibehalten – Abwärtskompatibilität ist das Standardverhalten.
- Der Untertitel ändert nicht das Verhalten der fixierten Zeilen; Authentifizierung, Modell und Arbeitsverzeichnis sind immer sichtbar, unabhängig vom Zustand des Untertitels.

### ASCII-Art ersetzen – Inline-String

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

Verwenden Sie `\n` im JSON-String für Zeilenumbrüche. Diese ASCII-Art wird wie das Standard-Logo mit dem aktuellen Theme-Farbverlauf eingefärbt.

> **Sie haben keine ASCII-Art zur Hand?** Jeder externe Generator ist geeignet – fügen Sie das generierte Ergebnis einfach ein. Der einfachste Weg ist `figlet`:
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt`, dann verweisen Sie mit `customAsciiArt: { "path": "./brand.txt" }` auf diese Datei. Die CLI **rendert** keinen Text zur Laufzeit in ASCII-Art – der Grund dafür findet sich im Abschnitt "Nicht im Umfang dieses Designs".

### ASCII-Art ersetzen – Externe Datei

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

Vermeiden Sie die Escape-Sequenzen für lange mehrzeilige Strings im JSON. Pfadauflösungsregeln:

- **Workspace-Einstellungen**: Relative Pfade werden relativ zum `.qwen/`-Verzeichnis des Workspace aufgelöst.
- **Benutzerspezifische Einstellungen**: Relative Pfade werden relativ zu `~/.qwen/` aufgelöst.
- Absolute Pfade werden direkt verwendet.
- Die Datei wird **nur beim Start einmal gelesen**, nach der Bereinigung in den Cache geschrieben. Wenn die Datei während der Sitzung geändert wird, erfolgt keine Neuberechnung – starten Sie die CLI neu.

### ASCII-Art ersetzen – Breitenanpassung

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

Wenn das Terminal breit genug ist, wird bevorzugt `large` verwendet; andernfalls `small`; falls auch das nicht reicht, wird die Logo-Spalte ausgeblendet (gemäß der aktuellen Zwei-Spalten-Fallback-Strategie). `small` und `large` können jeweils entweder ein String oder ein `{ path }` sein. Jede Stufe kann weggelassen werden: Fehlt eine, wird automatisch zur nächsten Stufe übergegangen.

### Wie groß kann das Logo sein? – Breitenbudget

Weder der Titel noch die Art haben eine "harte Zeichenbegrenzung", sondern nur ein **Breitenbudget**, das von der Terminal-Spaltenanzahl abhängt, sowie absolute harte Limits, um zu verhindern, dass fehlerhafte Eingaben das Layout einfrieren:

| Posten                                 | Obergrenze                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Terminal-Spaltenanzahl beim Start      | So viele, wie das Terminal des Benutzers meldet.                                                                  |
| Container-Außenabstand                 | 4 Spalten (2 links + 2 rechts).                                                                                  |
| Abstand zwischen Logo-Spalte und Info-Panel | 2 Spalten.                                                                                                        |
| Mindestbreite des Informationspanels   | 44 Spalten (40 Pfad + Rahmen + Innenabstand).                                                                    |
| **Verfügbare Breite für jede Art-Stufe beim Rendern** | `Terminal-Spaltenanzahl − 4 − 2 − 44 = Terminal-Spaltenanzahl − 50`.                                            |
| Harte Obergrenze für bereinigte Art pro Stufe | 200 Spalten × 200 Zeilen. Bei Überschreitung wird abgeschnitten und eine `[BANNER]`-Warnung ausgegeben.           |
| Harte Obergrenze für `customBannerTitle` nach Bereinigung | 80 Zeichen. Bei Überschreitung wird abgeschnitten und eine `[BANNER]`-Warnung ausgegeben.                         |

Häufige Terminalbreiten und die entsprechenden Logo-Obergrenzen:

| Terminal-Spaltenanzahl | Maximal darstellbare Logo-Breite | Was das praktisch bedeutet                                                                   |
| ---------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| 80                     | 30                               | Die meisten figlet "ANSI Shadow"-Buchstaben sind 7–11 Spalten breit, maximal 3 Buchstaben.   |
| 100                    | 50                               | ANSI Shadow kann ein kurzes Wort (ca. 6 Buchstaben) oder zwei kurze gestapelte Wörter unterbringen. |
| 120                    | 70                               | Mehrzeilige, gestapelte Wort-Art ist völlig ausreichend.                                     |
| 200                    | 150                              | Einzelne lange Zeichenfolgen (z. B. ANSI Shadow des vollständigen Produktnamens) passen ebenfalls. |
Zwei Faustregeln für das Design von ASCII-Art:

1. **Mehrwörtige Markennamen lassen sich auf den meisten Terminals nicht in einer einzigen Zeile mit ANSI Shadow rendern.**  
   ANSI Shadow benötigt pro Buchstabe etwa 7–9 Spalten. Selbst ein 12 Zeichen langer Markenname wie `Custom Agent` würde etwa 95 Spalten Art in einer Zeile benötigen – ein 100-Spalten-Terminal reicht nach dem Einfügen des Info-Panels nicht mehr aus. Entweder die Wortzeilen stapeln (Line Break) oder eine schmalere Figlet-Schriftart verwenden, oder direkt eine kompakte einzeilige Verzierung wie `▶ Custom Agent ◀` nutzen.
2. **Wenn eine einzelne Konfiguration sowohl auf breiten Bildschirmen gut aussehen als auch auf schmalen nicht scheitern soll, verwende die `{ small, large }`-Breitenanpassung.** Im folgenden Beispiel ist `large` ein gestapeltes mehrzeiliges Art für Terminals ≥ 104 Spalten, `small` eine einzeilige Verzierung mit 16 Spalten. Wenn beides zu schmal ist, wird die Logo-Spalte einfach ausgeblendet.

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

In `banner-large.txt` wird die gestapelte ANSI Shadow Ausgabe (etwa 54 Spalten × 12 Zeilen) abgelegt, erzeugt mit folgendem Befehl:

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### Dreier-Kombination

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

### So überprüfst du es

1. Speichere `settings.json` und starte `qwen` neu – die Banner-Analyse läuft nur beim Start einmal.
2. Ändere die Terminalbreite und stelle sicher, dass der Wechsel zwischen `small` / `large` wie erwartet funktioniert und bei extrem schmaler Breite die Logo-Spalte korrekt ausgeblendet wird.
3. Falls das Ergebnis nicht deinen Erwartungen entspricht, sieh in `~/.qwen/debug/<sessionId>.txt` nach (der Symlink `latest.txt` zeigt auf die aktuelle Session), grep nach `[BANNER]` – bei jedem soft failure wird eine Warnzeile mit der Ursache ausgegeben.

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
   │ 1. Normalisieren in      │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. Jede Stufe auflösen: │           │
   │    string → direkt verwenden     │  Auswahl der Stufe anhand
   │    {path} → fs.read     │    verfügbarer Terminalbreite
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │         Rendern der Logo-Spalte
   │ 3. Art bereinigen:      │         Rendern des Info-Panels:
   │    stripControlSeqs     │           Titel    = customBannerTitle
   │    ≤ 200 Zeilen × 200 Spalten   │           ?? '>_ Qwen Code'
   │ 4. Titel + Untertitel    │           Untertitel = customBannerSubtitle
   │    bereinigen (einzeilig,│           ?? Leerzeile als Abstandshalter
   │    ≤ 80 / 160 Zeichen)  │           Status   = gesperrt
   │ 5. Nach Quelle memoizen │           Pfad     = gesperrt
   └─────────────────────────┘
```

Der fünfstufige Analyse-Algorithmus wird einmal beim Laden der Einstellungen ausgeführt und nur bei einem Hot-Reload-Ereignis der Einstellungen erneut gestartet:

1. **Normalisieren**. Ein nackter `string` oder `{ path }` wird in `{ small: x, large: x }` umgewandelt. Das `{ small, large }`-Objekt wird unverändert durchgelassen.
2. **Auflösen pro Stufe**. Für jede `AsciiArtSource`:
   - Zeichenkette: sofort verwenden.
   - `{ path }`: synchron lesen, mit `O_NOFOLLOW` als Schutz vor Symlink-Angriffen (unter Windows Rückfall auf normales Read-Only-Lesen – diese Konstante wird nicht exportiert). Maximalgröße 64 KB. Relative Pfadangaben beziehen sich auf das Verzeichnis der übergeordneten Einstellungsdatei: Workspace-Einstellungen relativ zum `.qwen/` des Workspace, User-Einstellungen relativ zu `~/.qwen/`. Lesefehler → `[BANNER]` warn, diese Stufe fällt auf den Standard zurück.
3. **Bereinigen**. Banner-spezifischer Stripper: Entfernt OSC‑/CSI‑/SS2‑/SS3‑Escape-Sequenzen, ersetzt verbleibende C0‑/C1‑Steuerzeichen (inkl. DEL) durch Leerzeichen, behält aber `\n` bei, damit mehrzeilige ASCII Art überlebt. Jede Zeile wird nach Tail‑Whitespace geschnitten und dann auf 200 Zeilen × 200 Spalten begrenzt; überschüssige Teile werden abgeschnitten und ein `[BANNER]` warn ausgegeben.
4. **Stufenauswahl zur Renderzeit**. In `Header.tsx` wird anhand des vorhandenen Platzbudgets (`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`) zwischen dem aufgelösten `small` und `large` gewählt:
   - Wenn `large` passt, bevorzugt `large`.
   - Sonst, wenn `small` passt, Rückfall auf `small`.
   - Sonst, **sofern der Benutzer überhaupt ein Custom Art angegeben hat**, wird die Logo-Spalte direkt ausgeblendet (Verwendung des Zweigs `showLogo = false`) – ein Rückfall auf das eingebaute QWEN-Logo würde bei schmalen Terminals die White-Label-Bereitstellung leise aufdecken. Das Info-Panel wird weiterhin gerendert.
   - Andernfalls (Benutzer hat gar kein Custom Art angegeben) Rückfall auf `shortAsciiLogo`, die Breitenschwelle des Standardlogos entscheidet über die Anzeige.
5. **Absicherung**. Falls beide Stufen aufgrund von Softfehlern (Datei fehlt, nach Bereinigung leer, fehlerhafte Konfiguration) letztendlich leer oder ungültig sind, wird nach nicht konfiguriertem Fallback `shortAsciiLogo` gerendert und die Breitenschwelle des Standardlogos angewendet. Die CLI **darf** wegen eines Banner-Konfigurationsfehlers nicht abstürzen.

Pseudocode zur Stufenauswahl:

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

## Ergänzungen zum Settings-Schema

In der Datei `packages/cli/src/config/settingsSchema.ts` werden im Objekt `ui` direkt nach `shellOutputMaxLines` vier weitere Eigenschaften hinzugefügt:

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
  // 运行时接受 SettingDefinition `type` 表达不出来的联合形态。
  // override 由 JSON-schema 生成器原样输出，让 VS Code 接受所有
  // 文档化的形态（string、{path}、{small,large}），不再把裸字符串
  // 标红。
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```
`hideBanner` übernimmt das bestehende Muster von `hideTips` (`showInDialog: true`);
Die drei weiteren Freitextfelder (Titel, Untertitel, Art) erscheinen nicht im Einstellungsdialog der Anwendung —
Ein mehrzeiliger ASCII-Editor im TUI-Dialog ist ein separates Projekt. Fortgeschrittene Benutzer bearbeiten direkt
die `settings.json`.

## Code-Änderungspunkte

Die Änderungen sind minimal. Nachfolgend sind die Dateien und die Zeilenbereiche im aktuellen `main`-Branch aufgeführt.

`packages/cli/src/ui/components/AppHeader.tsx:53` — Erweiterung von
`showBanner`:

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — Übergabe der geparsten
Banner-Daten an `<Header>`:

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

`packages/cli/src/ui/components/Header.tsx` — Erweiterung von `HeaderProps`:

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

`packages/cli/src/ui/components/Header.tsx:45-46` — Vor der Berechnung von
`logoWidth` wird zuerst `pickTier` aufgerufen, mit vorhandenen Standardwerten als Fallback:

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

`packages/cli/src/ui/components/Header.tsx` — Titel wird aus Prop gerendert,
Untertitel ersetzt die ursprüngliche leere Spacer-Zeile, wenn Prop wahr ist:

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

**Neue Datei**: `packages/cli/src/ui/utils/customBanner.ts` — Parser.
Externes Interface:

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

Der Parser übernimmt die in der obigen "Parsing-Pipeline" beschriebene Normalisierung, Dateilesen, Bereinigung und Caching.
Er wird beim Start der CLI einmal aufgerufen und erneut bei Hot-Reload-Ereignissen der Einstellungen. Die Dateipfade jedes Scopes stammen direkt aus `settings.system.path` / `settings.workspace.path` /
`settings.user.path`, daher wird jeder `{ path }` relativ zur Datei aufgelöst, in der er deklariert ist;
Wenn `settings.isTrusted` false ist, wird der Workspace-Scope komplett übersprungen.

## Alternativenvergleich

Nachfolgend sind 5 bewertete Varianten aufgeführt, um späteren Maintainern den Entwurfsraum zu verdeutlichen und ggf. eine Neubewertung zu ermöglichen.

### Variante 1 — Drei flache Felder (empfohlen, identisch mit Issue)

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **Effekt**: Minimale Benutzeroberfläche, eins-zu-eins mit Issue-Beschreibung.
- **Vorteile**: NULL Lernaufwand; extrem einfache Dokumentation; konsistent mit vorhandenen flachen `ui.*`-Feldern
  (`hideTips`, `customWittyPhrases` etc.).
- **Nachteile**: Drei semantisch verwandte Schlüssel liegen lose in `ui` auf oberster Ebene; zukünftige Banner-spezifische Schalter (Gradient, Untertitel etc.) müssten als weitere Geschwisterfelder in `ui` landen, keine natürliche Gruppierung möglich.

### Variante 2 — Verschachtelter `ui.banner`-Namespace

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

- **Effekt**: Gleiche Funktionalität wie Variante 1, aber funktional gruppiert.
- **Vorteile**: Sauberer Namespace für zukünftige Banner-spezifische Schalter; bessere Auffindbarkeit in `/settings`.
- **Nachteile**: Nicht exakt mit der Schreibweise im Issue übereinstimmend; vorhandene UI-Einstellungen sind überwiegend flach (nur `ui.accessibility` und `ui.statusLine` sind verschachtelt), Konsistenz leidet; eine zusätzliche Ebene, die der Benutzer sich merken muss.

### Variante 3 — Banner-Profil-Preset + Slot-Override

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* Slot-Overrides für 'branded' */ }
  }
}
```

- **Effekt**: Benutzer wählen aus benannten Presets; Fortgeschrittene überschreiben einzelne Slots im gewählten Preset.
- **Vorteile**: Bessere Onboarding-Erfahrung; Presets können von der CLI mitgeliefert werden.
- **Nachteile**: Deutlich höhere Komplexität; Presets sind langfristige Wartungsverpflichtung; das Issue fordert offene Anpassung, keine Content-Kuration.

### Variante 4 — Gesamter Banner-Vorlagen-String

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **Effekt**: Ein einziger Freiform-Vorlagenstring mit Slot-Interpolation.
- **Vorteile**: Höchste Flexibilität für nicht standardisierte Layouts.
- **Nachteile**: Layout-Verantwortung wird auf den Benutzer abgewälzt; die zweispaltige Ink-Anordnung verliert ihre Robustheit gegenüber Terminalbreiten; es können leicht Vorlagen erstellt werden, die auf schmalen Terminals zerbrechen; zu großer Schadenbereich für den geringen Nutzen.

### Variante 5 — Plugin / Hook-API

Exposition eines Banner-Renderer-Hooks über ein Erweiterungssystem.

- **Effekt**: Code-Level-Anpassung; Erweiterungen können beliebige Inhalte rendern.
- **Vorteile**: Höchste Leistungsfähigkeit; Unternehmen können vollständig gekapselte Branding-Plugins bereitstellen.
- **Nachteile**: Riesige API-Oberfläche; beliebiges Terminal-Rendering erfordert Sicherheitsüberprüfung; für dieses Issue völlig überdimensioniert.

### Empfehlung

**Variante 1 wird eingesetzt**. Sie erfüllt das Issue direkt, passt zum bestehenden `ui.*`-Stil und wird nicht durch einen Namespace eingeschränkt, solange wir noch nicht wissen, welche weiteren Banner-spezifischen Schalter es geben wird. Falls sich in Zukunft Geschwisterfelder ansammeln, ist die Migration zu Variante 2 additiv — `ui.banner.title` und `ui.customBannerTitle` können während einer Deprecation-Periode nebeneinander existieren.

## Sicherheit & Fehlerbehandlung

Benutzerdefinierte Banner-Inhalte werden **buchstabengetreu auf dem Terminal gerendert** und im Pfad-Modus zusätzlich **von der Festplatte gelesen**. Beide Pfade sind bei bösartigen oder manipulierten Einstellungen erreichbar. Das gleiche Bedrohungsmodell, das die Session-Title-Funktion adressiert, gilt auch hier.

| Aspekt | Schutzmaßnahme |
| :--- | :--- |
| ANSI / OSC-8 / CSI-Injektion in ASCII-Art / Titel / Untertitel | Banner-spezifischer Stripper (`sanitizeArt` / `sanitizeSingleLine`): Entfernt OSC-/CSI-/SS2-/SS3-Einführungssequenzen, ersetzt übrige C0-/C1-Steuerzeichen (inkl. DEL) durch Leerzeichen. Wird vor dem Rendern und vor dem Schreiben in den Cache angewendet. |
| Einfrieren des Starts durch übermäßig große Dateien | Dateilesen mit hartem Limit von 64 KB. |
| Einfrieren des Layouts durch pathologische ASCII-Art | Jedes Parsing-Ergebnis auf maximal 200 Zeilen × 200 Spalten begrenzt; Überschreitung wird abgeschnitten + `[BANNER]`-Warnung. |
| Symlink-Hijacking im Pfad-Modus | Dateilesen mit `O_NOFOLLOW` (unter Windows auf schreibgeschützt zurückgefallen; Konstante nicht exponiert). |
| Fehlende oder nicht lesbare Datei | Abfangen → `[BANNER]`-Warnung → Fallback auf Standard; niemals in die UI werfen. |
| Zeilenumbrüche oder Überlänge in Titel / Untertitel | Zeilenumbrüche durch Leerzeichen ersetzen, auf 80 (Titel) / 160 (Untertitel) Zeichen kürzen. |
| Nicht vertrauenswürdiger Workspace beeinflusst Rendering oder Dateilesen | Wenn `settings.isTrusted` false ist, überspringt der Parser `settings.workspace` komplett (konsistent mit dem Vertrauens-Gate der `settings.merged`-Ansicht). |
| Race-Condition bei Hot-Reload der Einstellungen | Parsing-Ergebnisse werden pro Aufruf nach Quelle (Pfad oder String) memoisiert; Reload führt den Parser erneut aus und liest betroffene Dateien neu. |
Zusammenfassung der Fehlermodi: Alle weichen Fehler landen letztendlich in `shortAsciiLogo` (oder dem gesperrten Standardtitel) + eine Zeile Debug-Log-Warnung. Kein Zweig darf einen harten Fehler verursachen (Ausnahme nach oben werfen).

## Nicht im Rahmen dieses Designs

Die folgenden Punkte sind bewusst ausgeschlossen. Jeder Punkt kann auf Basis von Benutzerfeedback als separater Vorschlag nachgereicht werden.

| Punkt                                             | Begründung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text in ASCII-Art umwandeln (Form `{ text: "xxxCode" }`) | Nach v1-Bewertung **abgelehnt**. Entweder Einführung einer Laufzeitabhängigkeit von `figlet` (ca. 2–3 MB unpacked mit einem Satz verfügbarer Schriftarten) oder selbst einen Single-Font-Renderer bereitstellen (~200 Zeilen Code + eine `.flf`-Schriftart, die wir selbst pflegen). Beide Wege bedeuten langfristigen Wartungsaufwand: Schriftartauswahl, Lizenzprüfung der Schriftarten, Issues wie „Meine Schriftart wird in Terminal X nicht richtig dargestellt", CJK-/Vollbreitenzeichenbehandlung. Der Anwendungsfall für diese Funktion (White-Labeling / Multi-Tenancy) hat fast immer ein fertiges ASCII-Art vom Designer, das nicht auf Standardschriftarten von figlet angewiesen ist. Benutzer, die heute eine Einzeiler-Generierung wünschen, können `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` verwenden – gleicher Effekt, null neue Abhängigkeiten, null internen Supportaufwand für Qwen Code. Sollte die Nachfrage in Zukunft steigen, ist diese Form reine Erweiterung: `AsciiArtSource` um `string \| {path} \| {text, font?}` erweitern, ohne bestehende Konfigurationen zu brechen. |
| `/banner` Slash-Befehl zur Online-Bearbeitung      | Das Einstellungs-UI ist der standardisierte Bearbeitungseinstieg; ein Online-Editor für mehrzeiliges ASCII ist ein separates Projekt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Benutzerdefinierte Farbverläufe / Einzelfarben      | Farben gehören zum Theme. Falls eine Erweiterung gewünscht ist, sollte ein separater Vorschlag eingereicht werden; Banner-Anpassung soll dieses Rad nicht neu erfinden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ASCII-Art per URL laden                            | Netzwerkanfragen beim Start bringen eine Reihe von Problemen mit sich: Fehlermodi, Caching, Sicherheitsprüfungen. Das Laden per `{path}`-Datei ist ein risikoarmes Äquivalent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Animationen (rotierendes Logo, Laufbandtitel)       | Erhöht die Rendering-Last und Barrierefreiheitsprobleme; der Anwendungsfall dieser Funktion benötigt sie nicht.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Banner-Ausrichtung in VSCode / Web-UI              | Diese beiden Endpunkte rendern derzeit kein Ink-Banner. Falls dies in Zukunft eingeführt wird, dient dieses Design als Referenz.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Dynamisches Neuladen bei Dateiänderungen             | Der Parser läuft nur beim Start und beim Neuladen der Einstellungen. Der Bedarf, mitten in einer Sitzung die Kunst zu wechseln, ist gering; „Neustart erforderlich" ist ein akzeptabler Kompromiss.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Ausblenden gesperrter Bereiche (Version/Auth/Model/Pfad) | Diese sind Laufzeitsignale; sie zu unterdrücken schadet dem Support und der Sicherheitslage mehr, als es dem White-Labeling-Szenario nützt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
## Validierungsplan

Nachfolgende Implementierungs-PRs sollten die folgenden End-to-End-Prüfungen bestehen:

1. In `~/.qwen/settings.json` wird `customBannerTitle: "Acme CLI"` und eine Inline-`customAsciiArt` gesetzt → beim Start von `qwen` wird der neue Titel und das neue ASCII-Kunstwerk angezeigt; der Versionsnummer-Suffix bleibt bestehen.
2. Setzen von `customBannerSubtitle: "Built-in Acme Skills"` → die Untertitelzeile erscheint in sekundärer Textfarbe zwischen der Titel- und der Authentifizierungs-/Modellzeile; Authentifizierung, Modell und Pfad sind weiterhin sichtbar. Nach dem Zurücksetzen erscheint wieder die leere Spacer-Zeile (abwärtskompatibel).
3. Setzen von `hideBanner: true` → `qwen` startet ohne Banner; Tipps und Hauptinhalt werden normal gerendert.
4. In workspace `settings.json` wird `customAsciiArt: { "path": "./brand.txt" }` gesetzt, `brand.txt` befindet sich zusammen mit `.qwen/` im selben Verzeichnis → beim Öffnen des Workspace wird es von der Festplatte geladen.
5. `customAsciiArt: { "small": "...", "large": "..." }` → Die Terminalgröße wird auf breit/mittel/schmal angepasst; bei breit wird "large" verwendet, bei mittel "small", bei schmal wird die Logo-Spalte ausgeblendet; das Informationspanel bleibt immer sichtbar.
6. In `customBannerTitle` **und** `customBannerSubtitle` wird jeweils `\x1b[31mhostile` injiziert → an beiden Stellen wird es als Literaltext gerendert, nicht als rote Farbe interpretiert.
7. `path` zeigt auf eine nicht existierende Datei → CLI startet normal; in `~/.qwen/debug/<sessionId>.txt` erscheint `[BANNER]` Warnung; Standard-Art wird gerendert.
8. Wenn ein Worktree bei deaktiviertem Workspace-Vertrauen geöffnet wird → das vom Workspace bereitgestellte `customAsciiArt` (einschließlich `{ path }`-Eintrag) wird stillschweigend ignoriert; die Einstellungen des user-scope bleiben wirksam.
