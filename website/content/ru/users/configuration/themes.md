# Темы

Qwen Code поддерживает множество тем для настройки цветовой схемы и внешнего вида. Вы можете изменить тему по своему вкусу с помощью команды `/theme` или параметра конфигурации `"ui.theme"`.

## Доступные темы

Qwen Code поставляется с набором предопределённых тем, которые можно вывести с помощью команды `/theme` в CLI:

- **Тёмные темы:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
  - `Qwen Dark`
  - `Shades Of Purple`
- **Светлые темы:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Qwen Light`
  - `Xcode`

### Смена темы

1.  Введите `/theme` в Qwen Code.
2.  Появится диалог или подсказка выбора со списком доступных тем.
3.  Используя клавиши со стрелками, выберите тему. В некоторых интерфейсах может отображаться предварительный просмотр или подсветка при выборе.
4.  Подтвердите выбор, чтобы применить тему.

**Примечание:** Если тема определена в вашем файле `settings.json` (по имени или пути к файлу), необходимо удалить параметр `"ui.theme"` из файла, прежде чем менять тему с помощью команды `/theme`.

### Сохранение темы

Выбранные темы сохраняются в [конфигурации](../configuration/settings) Qwen Code, чтобы ваши предпочтения запоминались между сеансами.

---

## Автоматическое определение темы

Когда тема установлена в `"auto"` (или оставлена не заданной), Qwen Code автоматически определяет, использует ли ваш терминал тёмный или светлый фон, и выбирает соответствующую тему Qwen (`Qwen Dark` или `Qwen Light`).

### Как включить

Установите тему `"auto"` в `settings.json`:

```json
{
  "ui": {
    "theme": "auto"
  }
}
```

Или выберите **Auto** в диалоге `/theme`. Это поведение по умолчанию, если тема явно не настроена.

### Методы определения

Qwen Code использует несколько методов определения в цепочке запасных вариантов. При запуске (асинхронный путь) порядок следующий:

| Приоритет | Метод                  | Платформа   | Как это работает                                                                                    |
| --------- | ---------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| 1         | `COLORFGBG`            | Все         | Читает переменную окружения `COLORFGBG` (устанавливается терминалами типа iTerm2, rxvt, Konsole)    |
| 2         | OSC 11                 | Все (TTY)   | Отправляет запрос `ESC]11;?` терминалу и извлекает цвет фона из ответа (~200 мс)                    |
| 3         | macOS system appearance | macOS only | Выполняет `defaults read -g AppleInterfaceStyle` для проверки, активен ли тёмный режим macOS        |
| 4         | Default                | Все         | Использует тёмную тему по умолчанию, если ни один метод не сработал                                |

Первый метод, вернувший результат, становится победителем. Определённое значение кэшируется на время сеанса, чтобы последующие разрешения темы (например, повторный выбор Auto в диалоге `/theme`) оставались согласованными.

### Когда использовать Auto

- **Большинству пользователей** — Auto хорошо работает, если фон терминала совпадает с темой ОС или если ваш терминал устанавливает `COLORFGBG` / поддерживает OSC 11.
- **Пользователям tmux / screen** — OSC 11 может не проходить через мультиплексоры. Определение переключается на `COLORFGBG` или системный вид macOS. Если ни один из них недоступен, используется тёмная тема по умолчанию. Установите конкретную тему, если автоопределение даёт неверный результат.
- **SSH-сеансы** — определение зависит от удалённой среды. Если `COLORFGBG` не передаётся, а удалённый терминал не отвечает на OSC 11, используется тёмная тема по умолчанию.

---

## Пользовательские цветовые темы

Qwen Code позволяет создавать собственные пользовательские цветовые темы, указывая их в файле `settings.json`. Это даёт вам полный контроль над цветовой палитрой, используемой в CLI.

### Как определить пользовательскую тему

Добавьте блок `customThemes` в файл `settings.json` пользователя, проекта или системы. Каждая пользовательская тема определяется как объект с уникальным именем и набором цветовых ключей. Например:

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

Вы можете использовать как шестнадцатеричные коды (например, `#FF0000`), **так и** стандартные названия цветов CSS (например, `coral`, `teal`, `blue`) для любого цвета. См. [названия цветов CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords) для полного списка поддерживаемых названий.

Вы можете определить несколько пользовательских тем, добавив больше записей в объект `customThemes`.

### Загрузка тем из файла

Помимо определения пользовательских тем в `settings.json`, вы также можете загрузить тему напрямую из JSON-файла, указав путь к файлу в `settings.json`. Это полезно для обмена темами или их отдельного хранения от основной конфигурации.

Чтобы загрузить тему из файла, укажите свойство `ui.theme` в вашем `settings.json` с путём к файлу темы:

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

Файл темы должен быть валидным JSON-файлом, который следует той же структуре, что и пользовательская тема, определённая в `settings.json`.

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

**Примечание по безопасности:** Для вашей безопасности Qwen Code загружает только файлы тем, находящиеся в вашей домашней директории. Если вы попытаетесь загрузить тему из-за пределов домашней директории, будет показано предупреждение, и тема не будет загружена. Это предотвращает загрузку потенциально вредоносных файлов тем из ненадёжных источников.

### Пример пользовательской темы

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### Использование пользовательской темы

- Выберите вашу пользовательскую тему с помощью команды `/theme` в Qwen Code. Ваша пользовательская тема появится в диалоге выбора темы.
- Или установите её по умолчанию, добавив `"theme": "MyCustomTheme"` в объект `ui` в вашем `settings.json`.
- Пользовательские темы могут быть заданы на уровне пользователя, проекта или системы и следуют тому же [приоритету конфигурации](../configuration/settings), что и другие настройки.

## Предпросмотр тем

|  Тёмная тема  |                                                                              Предпросмотр                                                                              |  Светлая тема  |                                                                              Предпросмотр                                                                              |
| :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI      |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light    |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark  |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light    | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu       | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default     |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light   | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula     |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code   | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub     | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode      | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |