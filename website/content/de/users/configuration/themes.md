# Themes

Qwen Code unterstützt eine Vielzahl von Themes, um Farbschema und Erscheinungsbild anzupassen. Sie können das Theme über den Befehl `/theme` oder die Konfigurationseinstellung `"theme":` an Ihre Vorlieben anpassen.

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

### Themenvorschläge ändern

1.  Geben Sie `/theme` in Qwen Code ein.
2.  Ein Dialogfeld oder eine Auswahlaufforderung wird angezeigt, die alle verfügbaren Themen auflistet.
3.  Wählen Sie mithilfe der Pfeiltasten ein Thema aus. Einige Benutzeroberflächen bieten möglicherweise eine Live-Vorschau oder markieren das ausgewählte Thema.
4.  Bestätigen Sie Ihre Auswahl, um das Thema anzuwenden.

**Hinweis:** Falls ein Thema in Ihrer Datei `settings.json` definiert ist (entweder über den Namen oder einen Dateipfad), müssen Sie die Einstellung `"theme"` aus der Datei entfernen, bevor Sie das Thema mithilfe des Befehls `/theme` ändern können.

### Themenspeicherung

Ausgewählte Themen werden in der [Konfiguration](../configuration/settings) von Qwen Code gespeichert, sodass Ihre Präferenz über mehrere Sitzungen hinweg beibehalten wird.

---

## Benutzerdefinierte Farbthemen

Qwen Code ermöglicht es Ihnen, eigene benutzerdefinierte Farbthemen zu erstellen, indem Sie diese in Ihrer Datei `settings.json` angeben. Dadurch erhalten Sie vollständige Kontrolle über die Farbpalette, die in der CLI verwendet wird.

### So definieren Sie ein benutzerdefiniertes Thema

Fügen Sie einen `customThemes`-Block in Ihre Benutzer-, Projekt- oder Systemdatei `settings.json` ein. Jedes benutzerdefinierte Thema wird als Objekt mit einem eindeutigen Namen und einer Reihe von Farbschlüsseln definiert. Beispiel:

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
- `DiffAdded` (optional, für hinzugefügte Zeilen in Diff-Ansichten)
- `DiffRemoved` (optional, für entfernte Zeilen in Diff-Ansichten)
- `DiffModified` (optional, für geänderte Zeilen in Diff-Ansichten)

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

Für alle Farbwerte können Sie entweder Hexadezimalcodes (z. B. `#FF0000`) **oder** standardmäßige CSS-Farbnamen (z. B. `coral`, `teal`, `blue`) verwenden. Eine vollständige Liste der unterstützten Namen finden Sie unter [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).

Sie können mehrere benutzerdefinierte Themen definieren, indem Sie weitere Einträge zum `customThemes`-Objekt hinzufügen.

### Themes aus einer Datei laden

Neben der Definition benutzerdefinierter Themes in `settings.json` können Sie ein Theme auch direkt aus einer JSON-Datei laden, indem Sie den Dateipfad in Ihrer `settings.json` angeben. Dies ist nützlich, um Themes zu teilen oder sie von Ihrer Hauptkonfiguration zu trennen.

Um ein Theme aus einer Datei zu laden, legen Sie die Eigenschaft `theme` in Ihrer `settings.json` auf den Pfad Ihrer Themendatei fest:

```json
{
  "ui": {
    "theme": "/pfad/zur/ihrem/theme.json"
  }
}
```

Die Themendatei muss eine gültige JSON-Datei sein, die dieselbe Struktur wie ein in `settings.json` definiertes benutzerdefiniertes Theme aufweist.

**Beispiel `my-theme.json`:**

```json
{
  "name": "Mein Datei-Theme",
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

**Sicherheitshinweis:** Aus Sicherheitsgründen lädt die Gemini-CLI Theme-Dateien nur dann, wenn sie sich innerhalb Ihres Home-Verzeichnisses befinden. Wenn Sie versuchen, ein Theme außerhalb Ihres Home-Verzeichnisses zu laden, wird eine Warnung angezeigt und das Theme wird nicht geladen. Dies verhindert das Laden potenziell schädlicher Theme-Dateien aus nicht vertrauenswürdigen Quellen.

### Beispiel für ein benutzerdefiniertes Thema

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### Verwenden Ihres benutzerdefinierten Themas

- Wählen Sie Ihr benutzerdefiniertes Thema mithilfe des `/theme`-Befehls in Qwen Code aus. Ihr benutzerdefiniertes Thema wird im Dialogfeld zur Themenauswahl angezeigt.
- Alternativ legen Sie es als Standard fest, indem Sie `"theme": "MyCustomTheme"` zum `ui`-Objekt in Ihrer `settings.json` hinzufügen.
- Benutzerdefinierte Themen können auf Benutzer-, Projekt- oder Systemebene festgelegt werden und folgen derselben [Konfigurationspriorität](../configuration/settings) wie andere Einstellungen.

## Themes-Vorschau

| Dunkles Theme |                                                                                Vorschau                                                                                | Helles Theme |                                                                                Vorschau                                                                                |
| :----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI     |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |