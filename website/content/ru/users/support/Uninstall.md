# Удаление

Способ удаления зависит от того, как вы установили CLI.

## Способ 1: Использование npx

npx запускает пакеты из временного кэша без постоянной установки. Чтобы «удалить» CLI, необходимо очистить этот кэш, что приведёт к удалению qwen-code и любых других пакетов, ранее выполненных с помощью npx.

Кэш npx находится в каталоге с именем `_npx` внутри основной папки кэша npm. Путь к кэшу npm можно узнать, выполнив `npm config get cache`.

**Для macOS / Linux**

```bash
# Обычно путь выглядит так: ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Для Windows**

_Командная строка_

```cmd
:: Обычно путь выглядит так: %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# Обычно путь выглядит так: $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Способ 2: Использование npm (глобальная установка)

Если вы установили CLI глобально (например, `npm install -g @qwen-code/qwen-code`), используйте команду `npm uninstall` с флагом `-g`, чтобы удалить его.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Эта команда полностью удаляет пакет из вашей системы.

## Способ 3: Автономная установка

Если вы устанавливали через автономный установщик (`curl ... | bash` или `irm ... | iex`), используйте специальный скрипт удаления.

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

Установщик удаляет автономную среду выполнения, сгенерированную обёртку `qwen` и изменения PATH, внесённые установщиком. Ваша конфигурация Qwen Code (`~/.qwen`) по умолчанию сохраняется.
