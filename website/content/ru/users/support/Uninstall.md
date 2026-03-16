# Удаление

Способ удаления зависит от того, как вы запускали CLI. Следуйте инструкциям для npx или глобальной установки через npm.

## Способ 1: Использование npx

npx запускает пакеты из временного кеша без постоянной установки. Чтобы «удалить» CLI, необходимо очистить этот кеш — в результате будут удалены `qwen-code` и любые другие пакеты, ранее запущенные через npx.

Кеш npx — это каталог с именем `_npx`, расположенный внутри основного каталога кеша npm. Путь к кешу npm можно узнать, выполнив команду `npm config get cache`.

**Для macOS / Linux**

```bash

# Путь обычно выглядит так: ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Для Windows**

_Командная строка_

```cmd
:: Путь обычно выглядит так: %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell

# Путь обычно выглядит так: $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Способ 2: Использование npm (глобальная установка)

Если вы установили CLI глобально (например, `npm install -g @qwen-code/qwen-code`), используйте команду `npm uninstall` с флагом `-g`, чтобы удалить её.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Эта команда полностью удаляет пакет из вашей системы.