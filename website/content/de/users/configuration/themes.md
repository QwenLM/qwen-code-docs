# Themes

Qwen Code unterstützt eine Vielzahl von Themes, um das Farbschema und Erscheinungsbild anzupassen. Sie können das Theme über den Befehl `/theme` oder die Einstellung `"ui.theme"` in der Konfiguration ändern.

## Verfügbare Themes

Qwen Code enthält eine Auswahl vordefinierter Themes, die Sie mit dem Befehl `/theme` in der CLI auflisten können:

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

1.  Geben Sie `/theme` in Qwen Code ein.
2.  Ein Dialog oder eine Auswahlaufforderung erscheint und listet die verfügbaren Themes auf.
3.  Wählen Sie mit den Pfeiltasten ein Theme aus. Einige Oberflächen bieten möglicherweise eine Live-Vorschau oder Hervorhebung während der Auswahl.
4.  Bestätigen Sie Ihre Auswahl, um das Theme anzuwenden.

**Hinweis:** Wenn ein Theme in Ihrer `settings.json`-Datei definiert ist (entweder durch Namen oder einen Dateipfad), müssen Sie die Einstellung `"ui.theme"` aus der Datei entfernen, bevor Sie das Theme mit dem Befehl `/theme` ändern können.

### Theme-Persistenz

Ausgewählte Themes werden in der [Konfiguration](../configuration/settings) von Qwen Code gespeichert, sodass Ihre Präferenz über Sitzungen hinweg erhalten bleibt.

---

## Automatische Theme-Erkennung

Wenn das Theme auf `"auto"` gesetzt (oder nicht gesetzt) ist, erkennt Qwen Code automatisch, ob Ihr Terminal einen dunklen oder hellen Hintergrund verwendet, und wählt das passende Qwen-Theme (`Qwen Dark` oder `Qwen Light`) aus.

### So aktivieren Sie die automatische Erkennung

Setzen Sie das Theme in `settings.json` auf `"auto"`:

```json
{
  "ui": {
    "theme": "auto"
  }
}
```

Oder wählen Sie im Dialog `/theme` die Option **Auto**. Dies ist das Standardverhalten, wenn kein Theme explizit konfiguriert ist.

### Erkennungsmethoden

Qwen Code verwendet mehrere Erkennungsmethoden in einer Fallback-Kette. Beim Start (asynchroner Pfad) ist die Reihenfolge:

| Priorität | Methode               | Plattform   | Funktionsweise                                                                                         |
| --------- | --------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| 1         | `COLORFGBG`           | Alle        | Liest die Umgebungsvariable `COLORFGBG` (gesetzt von Terminals wie iTerm2, rxvt, Konsole)               |
| 2         | OSC 11                | Alle (TTY)  | Sendet eine Abfrage `ESC]11;?` an das Terminal und parst die Hintergrundfarbe aus der Antwort (~200ms) |
| 3         | macOS-Systemdarstellung | nur macOS | Führt `defaults read -g AppleInterfaceStyle` aus, um zu prüfen, ob der macOS Dark Mode aktiv ist        |
| 4         | Standard              | Alle        | Fallback auf dunkles Theme, wenn keine Methode erfolgreich ist                                          |

Die erste Methode, die ein Ergebnis liefert, gewinnt. Der erkannte Wert wird für die Sitzung zwischengespeichert, sodass nachfolgende Theme-Auflösungen (z. B. erneutes Auswählen von Auto im `/theme`-Dialog) konsistent bleiben.

### Wann Auto verwenden

- **Die meisten Benutzer** – Auto funktioniert gut, wenn Ihr Terminalhintergrund mit dem OS-Erscheinungsbild übereinstimmt oder Ihr Terminal `COLORFGBG` setzt / OSC 11 unterstützt.
- **tmux / screen-Benutzer** – OSC 11 wird möglicherweise nicht durch Multiplexer weitergeleitet. Die Erkennung fällt auf `COLORFGBG` oder die macOS-Systemdarstellung zurück. Wenn keines verfügbar ist, wird das Standard-Dunkeltheme verwendet. Setzen Sie ein bestimmtes Theme, wenn die Auto-Erkennung das falsche Ergebnis liefert.
- **SSH-Sitzungen** – Die Erkennung hängt von der Remote-Umgebung ab. Wenn `COLORFGBG` nicht weitergeleitet wird und das Remote-Terminal nicht auf OSC 11 antwortet, wird das Standard-Dunkeltheme verwendet.

---

## Benutzerdefinierte Farbthemes

Qwen Code ermöglicht es Ihnen, eigene benutzerdefinierte Farbthemes zu erstellen, indem Sie diese in Ihrer `settings.json`-Datei angeben. Dies gibt Ihnen die vollständige Kontrolle über die im CLI verwendete Farbpalette.

### So definieren Sie ein benutzerdefiniertes Theme

Fügen Sie einen `customThemes`-Block in Ihre Benutzer-, Projekt- oder System-`settings.json`-Datei ein. Jedes benutzerdefinierte Theme wird als Objekt mit einem eindeutigen Namen und einer Reihe von Farbschlüsseln definiert. Zum Beispiel:

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

Sie können entweder Hex-Codes (z. B. `#FF0000`) **oder** standardmäßige CSS-Farbnamen (z. B. `coral`, `teal`, `blue`) für jeden Farbwert verwenden. Eine vollständige Liste der unterstützten Namen finden Sie unter [CSS-Farbnamen](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).
Sie können mehrere benutzerdefinierte Themes definieren, indem Sie weitere Einträge zum `customThemes`-Objekt hinzufügen.

### Laden von Themes aus einer Datei

Zusätzlich zur Definition benutzerdefinierter Themes in `settings.json` können Sie ein Theme auch direkt aus einer JSON-Datei laden, indem Sie den Dateipfad in Ihrer `settings.json` angeben. Dies ist nützlich, um Themes zu teilen oder sie von Ihrer Hauptkonfiguration getrennt zu halten.

Um ein Theme aus einer Datei zu laden, setzen Sie die Eigenschaft `ui.theme` in Ihrer `settings.json` auf den Pfad Ihrer Theme-Datei:

```json
{
  "ui": {
    "theme": "/pfad/zu/ihrer/theme.json"
  }
}
```

Die Theme-Datei muss eine gültige JSON-Datei sein, die der gleichen Struktur wie ein benutzerdefiniertes Theme in `settings.json` folgt.

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

**Sicherheitshinweis:** Zu Ihrer Sicherheit lädt Qwen Code nur Theme-Dateien, die sich in Ihrem Home-Verzeichnis befinden. Wenn Sie versuchen, ein Theme von außerhalb Ihres Home-Verzeichnisses zu laden, wird eine Warnung angezeigt und das Theme wird nicht geladen. Dies verhindert das Laden potenziell schädlicher Theme-Dateien aus nicht vertrauenswürdigen Quellen.

### Beispiel für ein benutzerdefiniertes Theme

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### Verwenden Ihres benutzerdefinierten Themes

- Wählen Sie Ihr benutzerdefiniertes Theme mit dem Befehl `/theme` in Qwen Code aus. Ihr benutzerdefiniertes Theme wird im Theme-Auswahldialog angezeigt.
- Oder legen Sie es als Standard fest, indem Sie `"theme": "MyCustomTheme"` zum `ui`-Objekt in Ihrer `settings.json` hinzufügen.
- Benutzerdefinierte Themes können auf Benutzer-, Projekt- oder Systemebene festgelegt werden und folgen der gleichen [Konfigurationspriorität](../configuration/settings) wie andere Einstellungen.

## Vorschau der Themes

|  Dark Theme  |                                                                                Vorschau                                                                                |  Light Theme  |                                                                                Vorschau                                                                                |
| :----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI     |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
