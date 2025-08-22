# Themes

Qwen Code unterstützt eine Vielzahl von Themes, um das Farbschema und das Erscheinungsbild anzupassen. Du kannst das Theme über den Befehl `/theme` oder über die Konfigurationseinstellung `"theme":` ändern, um es deinen Vorlieben anzupassen.

## Verfügbare Themes

Qwen Code wird mit einer Auswahl vordefinierter Themes geliefert, die du mithilfe des Befehls `/theme` innerhalb der CLI auflisten kannst:

- **Dark Themes:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
- **Light Themes:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Xcode`

### Themes ändern

1. Gib `/theme` in Qwen Code ein.
2. Ein Dialog oder eine Auswahl erscheint, in dem die verfügbaren Themes aufgelistet sind.
3. Wähle mit den Pfeiltasten ein Theme aus. Manche Oberflächen bieten eventuell eine Live-Vorschau oder markieren das aktuelle Theme.
4. Bestätige deine Auswahl, um das Theme zu übernehmen.

### Theme Persistence

Ausgewählte Themes werden in der [Konfiguration](./configuration.md) von Qwen Code gespeichert, sodass deine Präferenz über mehrere Sitzungen hinweg beibehalten wird.

---

## Custom Color Themes

Qwen Code ermöglicht es dir, eigene Custom Color Themes zu erstellen, indem du diese in deiner `settings.json`-Datei definierst. Dadurch hast du volle Kontrolle über die Farbpalette, die in der CLI verwendet wird.

### Wie du ein Custom Theme definierst

Füge einen `customThemes`-Block zu deiner `settings.json`-Datei auf User-, Projekt- oder Systemebene hinzu. Jedes Custom Theme wird als Objekt mit einem eindeutigen Namen und einem Satz von Farbschlüsseln definiert. Zum Beispiel:

```json
{
  "customThemes": {
    "MyCustomTheme": {
      "name": "MyCustomTheme",
      "type": "custom",
      "Background": "#181818",
      "Foreground": "#F8F8F2",
      "LightBlue": "#82AAFF",
      "AccentBlue": "#61AFEF",
      "AccentPurple": "#C678DD",
      "AccentCyan": "#56B6C2",
      "AccentGreen": "#98C379",
      "AccentYellow": "#E5C07B",
      "AccentRed": "#E06C75",
      "Comment": "#5C6370",
      "Gray": "#ABB2BF",
      "DiffAdded": "#A6E3A1",
      "DiffRemoved": "#F38BA8",
      "DiffModified": "#89B4FA",
      "GradientColors": ["#4796E4", "#847ACE", "#C3677F"]
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

**Erforderliche Properties:**

- `name` (muss mit dem Key im `customThemes`-Objekt übereinstimmen und ein String sein)
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

Du kannst entweder Hex-Codes (z. B. `#FF0000`) **oder** standardisierte CSS-Farbnamen (z. B. `coral`, `teal`, `blue`) für jeden Farbwert verwenden. Eine vollständige Liste der unterstützten Namen findest du unter [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).

Du kannst mehrere Custom Themes definieren, indem du weitere Einträge zum `customThemes`-Objekt hinzufügst.

### Beispiel für ein benutzerdefiniertes Theme

<img src="../assets/theme-custom.png" alt="Beispiel für ein benutzerdefiniertes Theme" width="600" />

### Verwendung deines benutzerdefinierten Themes

- Wähle dein benutzerdefiniertes Theme über den Befehl `/theme` in Qwen Code aus. Dein Theme wird dann im Theme-Auswahldialog angezeigt.
- Oder lege es als Standard fest, indem du `"theme": "MyCustomTheme"` in deiner `settings.json` hinzufügst.
- Benutzerdefinierte Themes können auf Benutzer-, Projekt- oder Systemebene festgelegt werden und folgen derselben [Konfigurationspriorität](./configuration.md) wie andere Einstellungen.

---

## Dark Themes

### ANSI

<img src="../assets/theme-ansi.png" alt="ANSI Theme" width="600" />

### Atom OneDark

<img src="../assets/theme-atom-one.png" alt="Atom One Theme" width="600">

### Ayu

<img src="../assets/theme-ayu.png" alt="Ayu Theme" width="600">

### Default

<img src="../assets/theme-default.png" alt="Standard Theme" width="600">

### Dracula

<img src="../assets/theme-dracula.png" alt="Dracula Theme" width="600">

### GitHub

<img src="../assets/theme-github.png" alt="GitHub Theme" width="600">

## Light Themes

### ANSI Light

<img src="../assets/theme-ansi-light.png" alt="ANSI Light Theme" width="600">

### Ayu Light

<img src="../assets/theme-ayu-light.png" alt="Ayu Light Theme" width="600">

### Default Light

<img src="../assets/theme-default-light.png" alt="Default Light Theme" width="600">

### GitHub Light

<img src="../assets/theme-github-light.png" alt="GitHub Light Theme" width="600">

### Google Code

<img src="../assets/theme-google-light.png" alt="Google Code Theme" width="600">

### Xcode

<img src="../assets/theme-xcode-light.png" alt="Xcode Light Theme" width="600">