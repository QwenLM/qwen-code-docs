# Themes

Qwen Code unterstützt eine Vielzahl von Themes, um das Farbschema und die Darstellung anzupassen. Du kannst das Theme nach deinen Vorlieben über den Befehl `/theme` oder die Konfigurationseinstellung `"ui.theme"` ändern.

## Verfügbare Themes

Qwen Code wird mit einer Auswahl vordefinierter Themes ausgeliefert, die du über den Befehl `/theme` in der CLI auflisten kannst:

- **Dunkle Themes:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
  - `Qwen Dark`
  - `Shades Of Purple`
- **Helle Themes:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Qwen Light`
  - `Xcode`

### Themes ändern

1.  Gib `/theme` in Qwen Code ein.
2.  Ein Dialog- oder Auswahlfenster erscheint, das die verfügbaren Themes auflistet.
3.  Wähle mit den Pfeiltasten ein Theme aus. Einige Oberflächen bieten möglicherweise eine Live-Vorschau oder Hervorhebung während der Auswahl.
4.  Bestätige deine Auswahl, um das Theme anzuwenden.

**Hinweis:** Wenn ein Theme in deiner `settings.json`-Datei definiert ist (entweder durch Namen oder durch einen Dateipfad), musst du die Einstellung `"ui.theme"` aus der Datei entfernen, bevor du das Theme mit dem Befehl `/theme` ändern kannst.

### Persistenz der Themes

Ausgewählte Themes werden in der [Konfiguration](../configuration/settings) von Qwen Code gespeichert, sodass deine Präferenz über Sitzungen hinweg erhalten bleibt.

---

## Automatische Theme-Erkennung

Wenn das Theme auf `"auto"` gesetzt (oder nicht festgelegt) ist, erkennt Qwen Code automatisch, ob dein Terminal einen dunklen oder hellen Hintergrund verwendet, und wählt das passende Qwen-Theme (`Qwen Dark` oder `Qwen Light`) aus.

### Aktivierung

Setze das Theme in `settings.json` auf `"auto"`:

```json
{
  "ui": {
    "theme": "auto"
  }
}
```

Oder wähle **Auto** im `/theme`-Dialog aus. Dies ist das Standardverhalten, wenn kein Theme explizit konfiguriert ist.

### Erkennungsmethoden

Qwen Code verwendet mehrere Erkennungsmethoden in einer Fallback-Kette. Beim Start (asynchroner Pfad) ist die Reihenfolge:

| Priorität | Methode                  | Plattform   | Funktionsweise                                                                                         |
| --------- | ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| 1         | `COLORFGBG`              | Alle        | Liest die Umgebungsvariable `COLORFGBG` (gesetzt von Terminals wie iTerm2, rxvt, Konsole)             |
| 2         | OSC 11                   | Alle (TTY)  | Sendet eine `ESC]11;?`-Abfrage an das Terminal und analysiert die Hintergrundfarbe aus der Antwort (~200ms) |
| 3         | macOS-Systemdarstellung  | nur macOS   | Führt `defaults read -g AppleInterfaceStyle` aus, um zu prüfen, ob der macOS Dark Mode aktiv ist                    |
| 4         | Standard                 | Alle        | Fällt auf das dunkle Theme zurück, wenn keine Methode erfolgreich ist                                                       |

Die erste Methode, die ein Ergebnis liefert, gewinnt. Der erkannte Wert wird für die Sitzung zwischengespeichert, sodass nachfolgende Theme-Auflösungen (z. B. erneute Auswahl von Auto im `/theme`-Dialog) konsistent bleiben.

### Wann Auto verwendet werden sollte

- **Die meisten Benutzer** – Auto funktioniert gut, wenn dein Terminal-Hintergrund mit dem OS-Erscheinungsbild übereinstimmt oder dein Terminal `COLORFGBG` setzt / OSC 11 unterstützt.
- **tmux / screen-Benutzer** – OSC 11 wird möglicherweise nicht durch Multiplexer weitergeleitet. Die Erkennung fällt auf `COLORFGBG` oder die macOS-Systemdarstellung zurück. Wenn keines verfügbar ist, wird das Standard-Dunkeltheme verwendet. Setze ein bestimmtes Theme, wenn die automatische Erkennung das falsche Ergebnis liefert.
- **SSH-Sitzungen** – die Erkennung hängt von der entfernten Umgebung ab. Wenn `COLORFGBG` nicht weitergeleitet wird und das entfernte Terminal nicht auf OSC 11 antwortet, wird das Standard-Dunkeltheme verwendet.

---

## Benutzerdefinierte Farbthemes

Qwen Code ermöglicht es dir, eigene benutzerdefinierte Farbthemes zu erstellen, indem du sie in deiner `settings.json`-Datei angibst. Dies gibt dir die volle Kontrolle über die im CLI verwendete Farbpalette.

### Definieren eines benutzerdefinierten Themes

Füge einen `customThemes`-Block zu deiner Benutzer-, Projekt- oder System-`settings.json` hinzu. Jedes benutzerdefinierte Theme wird als Objekt mit einem eindeutigen Namen und einer Reihe von Farbschlüsseln definiert. Beispiel:

```json
{
  "ui": {
    "customThemes": {
      "MyCustomTheme": {
        "name": "MyCustomTheme",
        "type": "custom",
        "Background": "#181818",
        ...
      }
    }
  }
}
```

**Farbschlüssel:**

- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`
- `DiffAdded` (optional, für hinzugefügte Zeilen in Diffs)
- `DiffRemoved` (optional, für entfernte Zeilen in Diffs)
- `DiffModified` (optional, für geänderte Zeilen in Diffs)

**Erforderliche Eigenschaften:**

- `name` (muss mit dem Schlüssel im `customThemes`-Objekt übereinstimmen und ein String sein)
- `type` (muss der String `"custom"` sein)
- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`

Du kannst für jeden Farbwert entweder Hex-Codes (z. B. `#FF0000`) **oder** standardmäßige CSS-Farbnamen (z. B. `coral`, `teal`, `blue`) verwenden. Eine vollständige Liste der unterstützten Namen findest du unter [CSS-Farbnamen](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).

Du kannst mehrere benutzerdefinierte Themes definieren, indem du weitere Einträge zum `customThemes`-Objekt hinzufügst.

### Themes aus einer Datei laden

Zusätzlich zur Definition benutzerdefinierter Themes in `settings.json` kannst du ein Theme auch direkt aus einer JSON-Datei laden, indem du den Dateipfad in deiner `settings.json` angibst. Dies ist nützlich, um Themes zu teilen oder sie getrennt von deiner Hauptkonfiguration zu halten.

Um ein Theme aus einer Datei zu laden, setze die Eigenschaft `ui.theme` in deiner `settings.json` auf den Pfad deiner Theme-Datei:

```json
{
  "ui": {
    "theme": "/pfad/zu/deinem/theme.json"
  }
}
```

Die Theme-Datei muss eine gültige JSON-Datei sein, die derselben Struktur wie ein benutzerdefiniertes Theme in `settings.json` folgt.

**Beispiel `my-theme.json`:**

```json
{
  "name": "My File Theme",
  "type": "custom",
  "Background": "#282A36",
  "Foreground": "#F8F8F2",
  "LightBlue": "#82AAFF",
  "AccentBlue": "#61AFEF",
  "AccentPurple": "#BD93F9",
  "AccentCyan": "#8BE9FD",
  "AccentGreen": "#50FA7B",
  "AccentYellow": "#F1FA8C",
  "AccentRed": "#FF5555",
  "Comment": "#6272A4",
  "Gray": "#ABB2BF",
  "DiffAdded": "#A6E3A1",
  "DiffRemoved": "#F38BA8",
  "DiffModified": "#89B4FA",
  "GradientColors": ["#4796E4", "#847ACE", "#C3677F"]
}
```

**Sicherheitshinweis:** Aus Sicherheitsgründen lädt Qwen Code nur Theme-Dateien, die sich in deinem Home-Verzeichnis befinden. Wenn du versuchst, ein Theme von außerhalb deines Home-Verzeichnisses zu laden, wird eine Warnung angezeigt und das Theme wird nicht geladen. Dies soll verhindern, dass potenziell schädliche Theme-Dateien aus nicht vertrauenswürdigen Quellen geladen werden.

### Beispiel für ein benutzerdefiniertes Theme

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### Verwenden deines benutzerdefinierten Themes

- Wähle dein benutzerdefiniertes Theme mit dem Befehl `/theme` in Qwen Code aus. Dein benutzerdefiniertes Theme wird im Theme-Auswahldialog angezeigt.
- Oder setze es als Standard, indem du `"theme": "MyCustomTheme"` zum `ui`-Objekt in deiner `settings.json` hinzufügst.
- Benutzerdefinierte Themes können auf Benutzer-, Projekt- oder Systemebene festgelegt werden und folgen derselben [Konfigurationspriorität](../configuration/settings) wie andere Einstellungen.

## Vorschau der Themes

|  Dunkles Theme  |                                                                                Vorschau                                                                                |  Helles Theme  |                                                                                Vorschau                                                                                |
| :----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI     |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |