# Themes

Qwen Code unterstützt eine Vielzahl von Themes, um das Farbschema und das Erscheinungsbild anzupassen. Sie können das Theme über den Befehl `/theme` oder die Konfigurationseinstellung `"theme":` entsprechend Ihren Vorlieben ändern.

## Verfügbare Themes

Qwen Code wird mit einer Auswahl vordefinierter Themes geliefert, die Sie mithilfe des Befehls `/theme` innerhalb der CLI auflisten können:

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

### Ändern von Themes

1.  Gib `/theme` in Qwen Code ein.
2.  Es erscheint ein Dialog oder eine Auswahl-Eingabeaufforderung mit einer Liste der verfügbaren Themes.
3.  Wähle mithilfe der Pfeiltasten ein Theme aus. Einige Oberflächen bieten möglicherweise eine Live-Vorschau oder Hervorhebung beim Auswählen.
4.  Bestätige deine Auswahl, um das Theme anzuwenden.

**Hinweis:** Wenn in deiner `settings.json`-Datei ein Theme definiert ist (entweder über den Namen oder einen Dateipfad), musst du die Einstellung `"theme"` aus der Datei entfernen, bevor du das Theme mithilfe des Befehls `/theme` ändern kannst.

### Speicherung von Themes

Ausgewählte Themes werden in der [Konfiguration](./configuration.md) von Qwen Code gespeichert, sodass deine Präferenz auch über mehrere Sitzungen hinweg beibehalten wird.

---

## Benutzerdefinierte Farb-Themes

Qwen Code ermöglicht es dir, eigene benutzerdefinierte Farb-Themes zu erstellen, indem du diese in deiner `settings.json`-Datei definierst. Dadurch erhältst du vollständige Kontrolle über die in der CLI verwendete Farbpalette.

### So definierst du ein benutzerdefiniertes Theme

Füge einen `customThemes`-Block zu deiner `settings.json`-Datei auf Benutzer-, Projekt- oder Systemebene hinzu. Jedes benutzerdefinierte Theme wird als Objekt mit einem eindeutigen Namen und einer Reihe von Farbschlüsseln definiert. Zum Beispiel:

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

Du kannst entweder Hex-Codes (z. B. `#FF0000`) **oder** standardisierte CSS-Farbnamen (z. B. `coral`, `teal`, `blue`) für jeden Farbwert verwenden. Eine vollständige Liste der unterstützten Namen findest du unter [CSS-Farbnamen](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).

Du kannst mehrere benutzerdefinierte Themes definieren, indem du weitere Einträge zum `customThemes`-Objekt hinzufügst.

### Laden von Themes aus einer Datei

Zusätzlich zur Definition benutzerdefinierter Themes in der `settings.json` kannst du auch ein Theme direkt aus einer JSON-Datei laden, indem du den Dateipfad in deiner `settings.json` angibst. Dies ist nützlich, um Themes zu teilen oder sie separat von deiner Hauptkonfiguration zu halten.

Um ein Theme aus einer Datei zu laden, setze die Eigenschaft `theme` in deiner `settings.json` auf den Pfad deiner Theme-Datei:

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

Die Theme-Datei muss eine gültige JSON-Datei sein, die dieselbe Struktur wie ein benutzerdefiniertes Theme in der `settings.json` aufweist.

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

**Sicherheitshinweis:** Zu deiner Sicherheit lädt die Gemini CLI nur Theme-Dateien, die sich innerhalb deines Home-Verzeichnisses befinden. Wenn du versuchst, ein Theme von außerhalb deines Home-Verzeichnisses zu laden, wird eine Warnung angezeigt und das Theme wird nicht geladen. Dies dient dazu, das Laden potenziell schädlicher Theme-Dateien aus nicht vertrauenswürdigen Quellen zu verhindern.

### Beispiel für ein benutzerdefiniertes Theme



<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### Verwenden Ihres benutzerdefinierten Themes

- Wählen Sie Ihr benutzerdefiniertes Theme über den Befehl `/theme` in Qwen Code aus. Ihr benutzerdefiniertes Theme wird im Theme-Auswahldialog angezeigt.
- Oder legen Sie es als Standard fest, indem Sie `"theme": "MyCustomTheme"` zum `ui`-Objekt in Ihrer `settings.json` hinzufügen.
- Benutzerdefinierte Themes können auf Benutzer-, Projekt- oder Systemebene festgelegt werden und folgen derselben [Konfigurationspriorität](./configuration.md) wie andere Einstellungen.

## Themes Vorschau

| Dunkles Theme | Vorschau | Helles Theme | Vorschau |
| :-: | :-: | :-: | :-: |
| ANSI | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | ANSI Light | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Atom OneDark | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Ayu Light | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Ayu | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Default | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | GitHub Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Dracula | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Google Code | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| GitHub | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Xcode | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |