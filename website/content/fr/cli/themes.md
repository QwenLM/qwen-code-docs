# Thèmes

Qwen Code prend en charge une variété de thèmes pour personnaliser son jeu de couleurs et son apparence. Vous pouvez changer de thème selon vos préférences via la commande `/theme` ou le paramètre de configuration `"theme":`.

## Thèmes disponibles

Qwen Code est livré avec une sélection de thèmes prédéfinis, que vous pouvez lister en utilisant la commande `/theme` dans le CLI :

- **Thèmes sombres :**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
- **Thèmes clairs :**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Xcode`

### Changer de thème

1. Saisissez `/theme` dans Qwen Code.
2. Une boîte de dialogue ou un prompt de sélection apparaît, listant les thèmes disponibles.
3. Utilisez les touches fléchées pour sélectionner un thème. Certaines interfaces peuvent offrir un aperçu en direct ou un surlignage pendant la sélection.
4. Confirmez votre choix pour appliquer le thème.

### Persistance des thèmes

Les thèmes sélectionnés sont enregistrés dans la [configuration](./configuration.md) de Qwen Code afin que vos préférences soient conservées d'une session à l'autre.

---

## Thèmes de couleurs personnalisés

Qwen Code vous permet de créer vos propres thèmes de couleurs personnalisés en les spécifiant dans votre fichier `settings.json`. Cela vous donne un contrôle total sur la palette de couleurs utilisée dans le CLI.

### Comment définir un thème personnalisé

Ajoutez un bloc `customThemes` à votre fichier `settings.json` utilisateur, projet ou système. Chaque thème personnalisé est défini comme un objet avec un nom unique et un ensemble de clés de couleur. Par exemple :

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

**Clés de couleur :**

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
- `DiffAdded` (optionnel, pour les lignes ajoutées dans les diffs)
- `DiffRemoved` (optionnel, pour les lignes supprimées dans les diffs)
- `DiffModified` (optionnel, pour les lignes modifiées dans les diffs)

**Propriétés requises :**

- `name` (doit correspondre à la clé dans l'objet `customThemes` et être une chaîne de caractères)
- `type` (doit être la chaîne `"custom"`)
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

Vous pouvez utiliser soit des codes hexadécimaux (ex. `#FF0000`) **ou** des noms de couleurs CSS standards (ex. `coral`, `teal`, `blue`) pour toute valeur de couleur. Consultez [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) pour une liste complète des noms supportés.

Vous pouvez définir plusieurs thèmes personnalisés en ajoutant davantage d'entrées à l'objet `customThemes`.

### Exemple de thème personnalisé

<img src="../assets/theme-custom.png" alt="Exemple de thème personnalisé" width="600" />

### Utilisation de votre thème personnalisé

- Sélectionnez votre thème personnalisé en utilisant la commande `/theme` dans Qwen Code. Votre thème personnalisé apparaîtra dans la boîte de dialogue de sélection des thèmes.
- Ou définissez-le comme thème par défaut en ajoutant `"theme": "MyCustomTheme"` dans votre fichier `settings.json`.
- Les thèmes personnalisés peuvent être définis au niveau utilisateur, projet ou système, et suivent la même [priorité de configuration](./configuration.md) que les autres paramètres.

---

## Thèmes sombres

### ANSI

<img src="../assets/theme-ansi.png" alt="Thème ANSI" width="600" />

### Atom OneDark

<img src="../assets/theme-atom-one.png" alt="Thème Atom One" width="600">

### Ayu

<img src="../assets/theme-ayu.png" alt="Thème Ayu" width="600">

### Default

<img src="../assets/theme-default.png" alt="Thème par défaut" width="600">

### Dracula

<img src="../assets/theme-dracula.png" alt="Thème Dracula" width="600">

### GitHub

<img src="../assets/theme-github.png" alt="GitHub theme" width="600">

## Thèmes clairs

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