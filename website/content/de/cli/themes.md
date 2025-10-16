# Themes

Qwen Code unterstützt eine Vielzahl von Themes, um das Farbschema und das Erscheinungsbild anzupassen. Du kannst das Theme über den Befehl `/theme` oder die Konfigurationseinstellung `"theme":` ändern, um es deinen Vorlieben anzupassen.

## Verfügbare Themes

Qwen Code wird mit einer Auswahl vordefinierter Themes geliefert, die du mithilfe des Befehls `/theme` innerhalb der CLI auflisten kannst:

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

### Themes ändern

1.  Gib `/theme` in Qwen Code ein.
2.  Ein Dialog oder eine Auswahl-Eingabeaufforderung erscheint, in der die verfügbaren Themes aufgelistet sind.
3.  Wähle mit den Pfeiltasten ein Theme aus. Manche Oberflächen bieten eventuell eine Live-Vorschau oder markieren das aktuelle Element beim Auswählen.
4.  Bestätige deine Auswahl, um das Theme anzuwenden.

**Hinweis:** Wenn in deiner `settings.json`-Datei bereits ein Theme definiert ist (entweder über den Namen oder einen Dateipfad), musst du den `"theme"`-Eintrag aus der Datei entfernen, bevor du das Theme über den `/theme`-Befehl ändern kannst.

### Speichern von Themes

Ausgewählte Themes werden in der [Konfiguration](./configuration.md) von Qwen Code gespeichert, sodass deine Präferenz auch über mehrere Sitzungen hinweg beibehalten wird.

---

## Benutzerdefinierte Farb-Themes

Qwen Code erlaubt dir, eigene benutzerdefinierte Farb-Themes zu erstellen, indem du diese in deiner `settings.json`-Datei definierst. Dadurch hast du volle Kontrolle über die Farbpalette, die in der CLI verwendet wird.

### Wie du ein benutzerdefiniertes Theme definierst

Füge einen `customThemes`-Block zu deiner `settings.json`-Datei auf Benutzer-, Projekt- oder Systemebene hinzu. Jedes benutzerdefinierte Theme wird als Objekt mit einem eindeutigen Namen und einer Reihe von Farbschlüsseln definiert. Zum Beispiel:

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

Du kannst entweder Hex-Codes (z. B. `#FF0000`) **oder** Standard-CSS-Farbnamen (z. B. `coral`, `teal`, `blue`) für jeden Farbwert verwenden. Eine vollständige Liste der unterstützten Namen findest du unter [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).

Du kannst mehrere benutzerdefinierte Themes definieren, indem du weitere Einträge zum `customThemes`-Objekt hinzufügst.

### Themes aus einer Datei laden

Neben der Definition eigener Themes in der `settings.json` kannst du auch direkt ein Theme aus einer JSON-Datei laden, indem du den Dateipfad in deiner `settings.json` angibst. Das ist nützlich, um Themes zu teilen oder sie separat von deiner Hauptkonfiguration zu halten.

Um ein Theme aus einer Datei zu laden, setze die `theme`-Property in deiner `settings.json` auf den Pfad zu deiner Theme-Datei:

```json
{
  "theme": "/path/to/your/theme.json"
}
```

Die Theme-Datei muss eine gültige JSON-Datei sein und dieselbe Struktur aufweisen wie ein benutzerdefiniertes Theme, das in der `settings.json` definiert ist.

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

**Sicherheitshinweis:** Aus Sicherheitsgründen lädt der Gemini CLI nur Theme-Dateien, die sich innerhalb deines Home-Verzeichnisses befinden. Wenn du versuchst, ein Theme von außerhalb deines Home-Verzeichnisses zu laden, wird eine Warnung angezeigt und das Theme wird nicht geladen. Dies verhindert das Laden potenziell schädlicher Theme-Dateien aus nicht vertrauenswürdigen Quellen.

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

<img src="../assets/theme-github.png" alt="GitHub theme" width="600">

## Light Themes

### ANSI Light

<img src="../assets/theme-ansi-light.png" alt="ANSI Light theme" width="600">

### Ayu Light

<img src="../assets/theme-ayu-light.png" alt="Ayu Light theme" width="600">

### Default Light

<img src="../assets/theme-default-light.png" alt="Default Light theme" width="600">

### GitHub Light

<img src="../assets/theme-github-light.png" alt="GitHub Light theme" width="600">

### Google Code

<img src="../assets/theme-google-light.png" alt="Google Code theme" width="600">

### Xcode

<img src="../assets/theme-xcode-light.png" alt="Xcode Light theme" width="600">