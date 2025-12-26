# Themes

Qwen Code unterstützt eine Vielzahl von Themes, um das Farbschema und das Erscheinungsbild anzupassen. Sie können das Theme über den Befehl `/theme` oder die Konfigurationseinstellung `"theme":` ändern, um Ihren Vorlieben zu entsprechen.

## Verfügbare Themes

Qwen Code enthält eine Auswahl vordefinierter Themes, die Sie mit dem Befehl `/theme` in der CLI auflisten können:

- **Dunkle Themes:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
- **Helle Themes:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Xcode`

### Themawechsel

1.  Geben Sie `/theme` in Qwen Code ein.
2.  Ein Dialog oder eine Auswahlabfrage erscheint und listet die verfügbaren Themen auf.
3.  Verwenden Sie die Pfeiltasten, um ein Thema auszuwählen. Einige Oberflächen bieten möglicherweise eine Live-Vorschau oder eine Hervorhebung während der Auswahl.
4.  Bestätigen Sie Ihre Auswahl, um das Thema anzuwenden.

**Hinweis:** Wenn ein Thema in Ihrer `settings.json`-Datei definiert ist (entweder per Name oder durch einen Dateipfad), müssen Sie die Einstellung `"theme"` aus der Datei entfernen, bevor Sie das Thema über den Befehl `/theme` ändern können.

### Themenspeicherung

Ausgewählte Themen werden in der [Konfiguration](../configuration/settings) von Qwen Code gespeichert, sodass Ihre Präferenz über Sitzungen hinweg beibehalten wird.

---

## Benutzerdefinierte Farbthemen

Qwen Code ermöglicht es Ihnen, eigene benutzerdefinierte Farbthemen zu erstellen, indem Sie diese in Ihrer `settings.json`-Datei angeben. Dadurch erhalten Sie vollständige Kontrolle über die im CLI verwendete Farbpalette.

### So definieren Sie ein benutzerdefiniertes Theme

Fügen Sie einen `customThemes`-Block zu Ihrer Benutzer-, Projekt- oder Systemdatei `settings.json` hinzu. Jedes benutzerdefinierte Theme wird als Objekt mit einem eindeutigen Namen und einem Satz von Farbschlüsseln definiert. Beispiel:

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

Sie können entweder Hex-Codes (z.B. `#FF0000`) **oder** Standard-CSS-Farbnamen (z.B. `coral`, `teal`, `blue`) für beliebige Farbwerte verwenden. Eine vollständige Liste der unterstützten Namen finden Sie unter [CSS-Farbnamen](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).

Sie können mehrere benutzerdefinierte Themes definieren, indem Sie weitere Einträge zum `customThemes`-Objekt hinzufügen.

### Laden von Themes aus einer Datei

Neben der Definition von benutzerdefinierten Themes in `settings.json` können Sie auch direkt aus einer JSON-Datei ein Theme laden, indem Sie den Dateipfad in Ihrer `settings.json` angeben. Dies ist nützlich, um Themes zu teilen oder sie separat von Ihrer Hauptkonfiguration zu halten.

Um ein Theme aus einer Datei zu laden, setzen Sie die `theme`-Eigenschaft in Ihrer `settings.json` auf den Pfad Ihrer Theme-Datei:

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

Die Theme-Datei muss eine gültige JSON-Datei sein, die der gleichen Struktur folgt wie ein benutzerdefiniertes Theme, das in `settings.json` definiert ist.

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

**Sicherheitshinweis:** Zu Ihrer Sicherheit lädt das Gemini CLI nur Theme-Dateien, die sich innerhalb Ihres Home-Verzeichnisses befinden. Wenn Sie versuchen, ein Theme außerhalb Ihres Home-Verzeichnisses zu laden, wird eine Warnung angezeigt und das Theme wird nicht geladen. Dies dient dazu, das Laden potenziell schädlicher Theme-Dateien aus nicht vertrauenswürdigen Quellen zu verhindern.

### Beispiel für ein benutzerdefiniertes Theme

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### Verwendung Ihres benutzerdefinierten Themes

- Wählen Sie Ihr benutzerdefiniertes Theme mit dem Befehl `/theme` in Qwen Code aus. Ihr benutzerdefiniertes Theme wird im Theme-Auswahldialog angezeigt.
- Alternativ können Sie es als Standard festlegen, indem Sie `"theme": "MyCustomTheme"` zum `ui`-Objekt in Ihrer `settings.json` hinzufügen.
- Benutzerdefinierte Themes können auf Benutzer-, Projekt- oder Systemebene festgelegt werden und folgen der gleichen [Konfigurationspriorität](../configuration/settings) wie andere Einstellungen.

## Theme-Vorschau

|  Dunkles Theme  |                                                                                Vorschau                                                                                |  Helles Theme  |                                                                                Vorschau                                                                                |
| :----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI     |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |