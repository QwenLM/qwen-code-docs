# Темы

Qwen Code поддерживает различные темы для настройки цветовой схемы и внешнего вида. Вы можете изменить тему в соответствии со своими предпочтениями с помощью команды `/theme` или через настройку `"theme":` в конфигурации.

## Доступные темы

Qwen Code поставляется с набором предустановленных тем, список которых можно получить, используя команду `/theme` в CLI:

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

### Смена тем

1. Введите `/theme` в Qwen Code.
2. Появится диалоговое окно или приглашение к выбору, в котором будут перечислены доступные темы.
3. С помощью клавиш со стрелками выберите тему. В некоторых интерфейсах может отображаться предварительный просмотр или подсветка при выборе.
4. Подтвердите свой выбор, чтобы применить тему.

**Примечание:** Если тема определена в вашем файле `settings.json` (по имени или пути к файлу), вы должны удалить настройку `"theme"` из файла, прежде чем вы сможете изменить тему с помощью команды `/theme`.

### Сохранение тем

Выбранные темы сохраняются в [конфигурации](./configuration.md) Qwen Code, чтобы ваши предпочтения сохранялись между сессиями.

---

## Пользовательские цветовые темы

Qwen Code позволяет создавать собственные цветовые темы, указывая их в файле `settings.json`. Это дает вам полный контроль над цветовой палитрой, используемой в CLI.

### Как определить свою тему

Добавьте блок `customThemes` в ваш файл `settings.json` на уровне пользователя, проекта или системы. Каждая кастомная тема определяется как объект с уникальным именем и набором цветовых ключей. Например:

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

Для указания цветов вы можете использовать как hex-коды (например, `#FF0000`), **так и** стандартные CSS-названия цветов (например, `coral`, `teal`, `blue`). Полный список поддерживаемых названий можно найти здесь: [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).

Вы можете определить несколько кастомных тем, добавляя дополнительные записи в объект `customThemes`.

### Загрузка тем из файла

Помимо определения пользовательских тем в `settings.json`, вы также можете загрузить тему напрямую из JSON-файла, указав путь к файлу в вашем `settings.json`. Это удобно для обмена темами или хранения их отдельно от основной конфигурации.

Чтобы загрузить тему из файла, установите свойство `theme` в вашем `settings.json` равным пути к файлу темы:

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

Файл темы должен быть корректным JSON-файлом и следовать той же структуре, что и пользовательская тема, определенная в `settings.json`.

**Пример `my-theme.json`:**

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

**Примечание по безопасности:** В целях вашей безопасности Gemini CLI будет загружать только те файлы тем, которые находятся внутри вашей домашней директории. Если вы попытаетесь загрузить тему извне домашней директории, будет показано предупреждение, и тема не будет загружена. Это сделано для предотвращения загрузки потенциально вредоносных файлов тем из ненадежных источников.

### Пример пользовательской темы

<img src="../assets/theme-custom.png" alt="Пример пользовательской темы" width="600" />

### Использование вашей пользовательской темы

- Выберите свою тему с помощью команды `/theme` в Qwen Code. Ваша пользовательская тема появится в диалоге выбора тем.
- Либо установите её как тему по умолчанию, добавив `"theme": "MyCustomTheme"` в объект `ui` в вашем файле `settings.json`.
- Пользовательские темы можно задавать на уровне пользователя, проекта или системы и они подчиняются тому же [порядку приоритетов конфигурации](./configuration.md), что и другие настройки.

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