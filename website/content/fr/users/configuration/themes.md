# Thèmes

Qwen Code prend en charge une variété de thèmes pour personnaliser son schéma de couleurs et son apparence. Vous pouvez changer de thème selon vos préférences via la commande `/theme` ou le paramètre de configuration `"theme":`.

## Thèmes disponibles

Qwen Code est livré avec une sélection de thèmes prédéfinis, que vous pouvez lister en utilisant la commande `/theme` dans l'interface en ligne de commande :

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

1.  Saisissez `/theme` dans Qwen Code.
2.  Une boîte de dialogue ou une invite de sélection s'affiche, listant les thèmes disponibles.
3.  À l'aide des flèches directionnelles, sélectionnez un thème. Certaines interfaces peuvent offrir un aperçu en direct ou surligner le thème pendant la sélection.
4.  Confirmez votre sélection pour appliquer le thème.

**Remarque :** Si un thème est défini dans votre fichier `settings.json` (soit par son nom, soit par un chemin de fichier), vous devez supprimer le paramètre `"theme"` du fichier avant de pouvoir changer de thème à l'aide de la commande `/theme`.

### Persistance du thème

Les thèmes sélectionnés sont enregistrés dans la [configuration](../configuration/settings) de Qwen Code afin que vos préférences soient conservées entre les sessions.

---

## Thèmes de couleurs personnalisés

Qwen Code vous permet de créer vos propres thèmes de couleurs personnalisés en les spécifiant dans votre fichier `settings.json`. Cela vous donne un contrôle total sur la palette de couleurs utilisée dans le CLI.

### Comment définir un thème personnalisé

Ajoutez un bloc `customThemes` à votre fichier `settings.json` utilisateur, de projet ou système. Chaque thème personnalisé est défini comme un objet avec un nom unique et un ensemble de clés de couleurs. Par exemple :

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

**Clés de couleurs :**

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
- `DiffAdded` (facultatif, pour les lignes ajoutées dans les différences)
- `DiffRemoved` (facultatif, pour les lignes supprimées dans les différences)
- `DiffModified` (facultatif, pour les lignes modifiées dans les différences)

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

Vous pouvez utiliser soit des codes hexadécimaux (par exemple, `#FF0000`) **soit** des noms de couleurs CSS standard (par exemple, `coral`, `teal`, `blue`) pour n'importe quelle valeur de couleur. Consultez la [liste des noms de couleurs CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) pour voir la liste complète des noms pris en charge.

Vous pouvez définir plusieurs thèmes personnalisés en ajoutant davantage d'entrées à l'objet `customThemes`.

### Chargement de thèmes à partir d'un fichier

En plus de définir des thèmes personnalisés dans `settings.json`, vous pouvez également charger un thème directement à partir d'un fichier JSON en spécifiant le chemin du fichier dans votre `settings.json`. Cela est utile pour partager des thèmes ou les garder séparés de votre configuration principale.

Pour charger un thème à partir d'un fichier, définissez la propriété `theme` dans votre `settings.json` avec le chemin vers votre fichier de thème :

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

Le fichier de thème doit être un fichier JSON valide qui suit la même structure qu'un thème personnalisé défini dans `settings.json`.

**Exemple `my-theme.json` :**

```json
{
  "name": "Mon thème fichier",
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

**Note de sécurité :** Pour votre sécurité, Gemini CLI ne chargera que les fichiers de thème situés dans votre répertoire personnel. Si vous tentez de charger un thème situé en dehors de votre répertoire personnel, un avertissement s'affichera et le thème ne sera pas chargé. Ceci permet d'éviter le chargement de fichiers de thème potentiellement malveillants provenant de sources non fiables.

### Exemple de thème personnalisé

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### Utilisation de votre thème personnalisé

- Sélectionnez votre thème personnalisé à l'aide de la commande `/theme` dans Qwen Code. Votre thème personnalisé apparaîtra dans la boîte de dialogue de sélection de thème.
- Ou, définissez-le comme thème par défaut en ajoutant `"theme": "MyCustomTheme"` à l'objet `ui` dans votre fichier `settings.json`.
- Les thèmes personnalisés peuvent être définis au niveau utilisateur, projet ou système, et suivent la même [priorité de configuration](../configuration/settings) que les autres paramètres.

## Aperçu des thèmes

|  Thème sombre  |                                                                                Aperçu                                                                                |  Thème clair  |                                                                                Aperçu                                                                                |
| :------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI       |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu        | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default      |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula      |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub      | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |