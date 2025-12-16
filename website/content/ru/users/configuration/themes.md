# Темы

Qwen Code поддерживает различные темы для настройки цветовой схемы и внешнего вида. Вы можете изменить тему в соответствии со своими предпочтениями с помощью команды `/theme` или параметра конфигурации `"theme":`.

## Доступные темы

Qwen Code поставляется с набором предопределенных тем, которые можно просмотреть с помощью команды `/theme` в интерфейсе командной строки:

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
2. Появится диалоговое окно или приглашение к выбору, где будут перечислены доступные темы.
3. С помощью клавиш со стрелками выберите тему. Некоторые интерфейсы могут предоставлять предварительный просмотр или подсветку при выборе.
4. Подтвердите свой выбор, чтобы применить тему.

**Примечание:** Если тема определена в вашем файле `settings.json` (по имени или пути к файлу), вы должны удалить настройку `"theme"` из файла, прежде чем сможете изменить тему с помощью команды `/theme`.

### Сохранение тем

Выбранные темы сохраняются в [конфигурации](./configuration.md) Qwen Code, поэтому ваши предпочтения запоминаются между сессиями.

---

## Пользовательские цветовые темы

Qwen Code позволяет создавать собственные пользовательские цветовые темы, указывая их в файле `settings.json`. Это дает вам полный контроль над цветовой палитрой, используемой в CLI.

### Как определить пользовательскую тему

Добавьте блок `customThemes` в ваш файл `settings.json` на уровне пользователя, проекта или системы. Каждая пользовательская тема определяется как объект с уникальным именем и набором цветовых ключей. Например:

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
- `DiffAdded` (необязательно, для добавленных строк в diff)
- `DiffRemoved` (необязательно, для удалённых строк в diff)
- `DiffModified` (необязательно, для изменённых строк в diff)

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

Вы можете использовать либо шестнадцатеричные коды (например, `#FF0000`), **либо** стандартные CSS-названия цветов (например, `coral`, `teal`, `blue`) для любого значения цвета. Полный список поддерживаемых названий см. в разделе [CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords).

Вы можете определить несколько пользовательских тем, добавляя дополнительные записи в объект `customThemes`.

### Загрузка тем из файла

В дополнение к определению пользовательских тем в `settings.json`, вы также можете загрузить тему непосредственно из JSON-файла, указав путь к файлу в вашем `settings.json`. Это удобно для обмена темами или хранения их отдельно от основной конфигурации.

Чтобы загрузить тему из файла, установите свойство `theme` в вашем `settings.json` на путь к файлу темы:

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

Файл темы должен быть корректным JSON-файлом, который следует той же структуре, что и пользовательская тема, определенная в `settings.json`.

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



<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### Использование вашей пользовательской темы

- Выберите свою пользовательскую тему с помощью команды `/theme` в Qwen Code. Ваша пользовательская тема появится в диалоговом окне выбора тем.
- Или установите её по умолчанию, добавив `"theme": "MyCustomTheme"` в объект `ui` в вашем файле `settings.json`.
- Пользовательские темы можно задавать на уровне пользователя, проекта или системы и они следуют тому же [порядку приоритета конфигурации](./configuration.md), что и другие настройки.

## Предварительный просмотр тем

| Темная тема | Предварительный просмотр | Светлая тема | Предварительный просмотр |
| :-: | :-: | :-: | :-: |
| ANSI | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | ANSI Light | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Atom OneDark | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Ayu Light | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Ayu | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Default | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | GitHub Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Dracula | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Google Code | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| GitHub | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Xcode | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |