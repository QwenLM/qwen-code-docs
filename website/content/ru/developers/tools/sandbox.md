---
description: "Настройте среду песочницы Qwen Code. Создавайте безопасные контейнеры Docker или Podman для изоляции выполнения кода, изменений файлов и проектных инструментов."
---

# Настройка среды песочницы (Docker/Podman)

## В настоящее время проект не поддерживает использование функции BUILD_SANDBOX после установки через npm-пакет

1. Для сборки кастомной песочницы необходимо получить доступ к скриптам сборки (scripts/build_sandbox.js) в репозитории с исходным кодом.
2. Эти скрипты сборки не входят в пакеты, публикуемые в npm.
3. В коде присутствуют жёстко заданные проверки путей, которые явно отклоняют запросы на сборку из окружений, отличных от репозитория с исходным кодом.

Если вам нужны дополнительные инструменты внутри контейнера (например, `git`, `python`, `rg`), создайте кастомный Dockerfile. Порядок действий следующий:

### 1. Сначала клонируйте репозиторий проекта Qwen Code: https://github.com/QwenLM/qwen-code.git

### 2. Убедитесь, что вы выполняете следующие действия в директории репозитория с исходным кодом

```bash
# 1. First, install the dependencies of the project
npm install

# 2. Build the Qwen Code project
npm run build

# 3. Verify that the dist directory has been generated
ls -la packages/cli/dist/

# 4. Create a global link in the CLI package directory
cd packages/cli
npm link

# 5. Verification link (it should now point to the source code)
which qwen
# Expected output: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# Or similar paths, but it should be a symbolic link

# 6. For details of the symbolic link, you can see the specific source code path
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# It should show that this is a symbolic link pointing to your source code directory

# 7.Test the version of qwen
qwen -v
# npm link will overwrite the global qwen. To avoid being unable to distinguish the same version number, you can uninstall the global CLI first

```

### 3. Создайте Dockerfile для песочницы в корневой директории вашего проекта

- Путь: `.qwen/sandbox.Dockerfile`

- Адрес официального образа: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# Based on the official Qwen sandbox image (It is recommended to explicitly specify the version)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43
# Add your extra tools here
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

### 4. Создайте первый образ песочницы в корневой директории вашего проекта

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# Observe whether the sandbox version of the tool you launched is consistent with the version of your custom image. If they are consistent, the startup will be successful
```

Это создаст образ, специфичный для проекта, на основе стандартного образа песочницы.

### Удаление npm link

- Если вы хотите восстановить официальную CLI Qwen, удалите npm link

```bash
# Method 1: Unlink globally
npm unlink -g @qwen-code/qwen-code

# Method 2: Remove it in the packages/cli directory
cd packages/cli
npm unlink

# Verification has been lifted
which qwen
# It should display "qwen not found"

# Reinstall the global version if necessary
npm install -g @qwen-code/qwen-code

# Verification Recovery
which qwen
qwen --version
```
