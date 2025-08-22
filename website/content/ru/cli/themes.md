# Темы

Qwen Code поддерживает различные темы для настройки цветовой схемы и внешнего вида. Вы можете изменить тему в соответствии со своими предпочтениями с помощью команды `/theme` или через настройку `"theme":` в конфигурации.

## Доступные темы

Qwen Code поставляется с набором предустановленных тем, которые можно посмотреть, введя команду `/theme` в CLI:

- **Темные темы:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
- **Светлые темы:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Xcode`

### Как изменить тему

1. Введите `/theme` в Qwen Code.
2. Появится диалоговое окно или список с доступными темами.
3. С помощью стрелок выберите нужную тему. В некоторых интерфейсах может быть доступен предпросмотр или подсветка выбранной темы.
4. Подтвердите выбор, чтобы применить тему.

### Сохранение тем

Выбранные темы сохраняются в [конфигурации](./configuration.md) Qwen Code, поэтому ваши предпочтения запоминаются между сессиями.

---

## Пользовательские цветовые темы

Qwen Code позволяет создавать собственные цветовые темы, указывая их в файле `settings.json`. Это дает вам полный контроль над цветовой палитрой, используемой в CLI.

### Как определить кастомную тему

Добавьте блок `customThemes` в ваш файл `settings.json` на уровне пользователя, проекта или системы. Каждая кастомная тема определяется как объект с уникальным именем и набором цветовых ключей. Например:

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

**Цветовые ключи:**

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
- `DiffAdded` (опционально, для добавленных строк в diff)
- `DiffRemoved` (опционально, для удалённых строк в diff)
- `DiffModified` (опционально, для изменённых строк в diff)

**Обязательные свойства:**

- `name` (должно совпадать с ключом в объекте `customThemes` и быть строкой)
- `type` (должно быть строкой `"custom"`)
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

Для любого цветового значения можно использовать либо hex-коды (например, `#FF0000`), **либо** стандартные CSS-названия цветов (например, `coral`, `teal`, `blue`). Полный список поддерживаемых названий смотрите здесь: [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).

Вы можете определить несколько кастомных тем, добавляя дополнительные записи в объект `customThemes`.

### Пример пользовательской темы

<img src="../assets/theme-custom.png" alt="Пример пользовательской темы" width="600" />

### Использование вашей пользовательской темы

- Выберите свою тему с помощью команды `/theme` в Qwen Code. Ваша пользовательская тема появится в диалоге выбора тем.
- Или установите её по умолчанию, добавив `"theme": "MyCustomTheme"` в ваш файл `settings.json`.
- Пользовательские темы можно задать на уровне пользователя, проекта или системы и они подчиняются тому же [порядку приоритета конфигурации](./configuration.md), что и другие настройки.

---

## Тёмные темы

### ANSI

<img src="../assets/theme-ansi.png" alt="Тема ANSI" width="600" />

### Atom OneDark

<img src="../assets/theme-atom-one.png" alt="Тема Atom One" width="600">

### Ayu

<img src="../assets/theme-ayu.png" alt="Тема Ayu" width="600">

### Default

<img src="../assets/theme-default.png" alt="Тема по умолчанию" width="600">

### Dracula

<img src="../assets/theme-dracula.png" alt="Тема Dracula" width="600">

### GitHub

<img src="../assets/theme-github.png" alt="GitHub theme" width="600">

## Светлые темы

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