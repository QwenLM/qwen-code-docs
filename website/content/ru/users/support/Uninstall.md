# Удаление

Способ удаления зависит от того, как вы запускали CLI. Следуйте инструкциям для npx или глобальной установки через npm.

## Способ 1: Использование npx

npx запускает пакеты из временного кеша без их постоянной установки. Чтобы «удалить» CLI, необходимо очистить этот кеш. Это удалит qwen-code и все остальные пакеты, которые ранее запускались через npx.

Кеш npx — это директория `_npx`, расположенная внутри основной папки кеша npm. Узнать путь к кешу npm можно, выполнив команду `npm config get cache`.

**Для macOS / Linux**

```bash
# Путь обычно ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Для Windows**

_Командная строка_

```cmd
:: Путь обычно %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# Путь обычно $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Способ 2: Использование npm (глобальная установка)

Если вы установили CLI глобально (например, `npm install -g @qwen-code/qwen-code`), используйте команду `npm uninstall` с флагом `-g` для его удаления.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Эта команда полностью удалит пакет из вашей системы.