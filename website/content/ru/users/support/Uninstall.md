# Удаление

Метод удаления зависит от того, как вы запускали CLI. Следуйте инструкциям для npx или глобальной установки через npm.

## Метод 1: Использование npx

npx запускает пакеты из временного кэша без постоянной установки. Чтобы «удалить» CLI, необходимо очистить этот кэш, что приведет к удалению qwen-code и любых других пакетов, ранее запущенных с помощью npx.

Кэш npx — это каталог с именем `_npx` внутри основной папки кэша npm. Вы можете найти путь к кэшу npm, выполнив команду `npm config get cache`.

**Для macOS / Linux**

```bash

# Путь обычно ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Для Windows**

_Command Prompt_

```cmd
:: Путь обычно %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell

# Путь обычно $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Метод 2: Использование npm (Глобальная установка)

Если вы установили CLI глобально (например, `npm install -g @qwen-code/qwen-code`), используйте команду `npm uninstall` с флагом `-g`, чтобы удалить его.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Эта команда полностью удаляет пакет из вашей системы.