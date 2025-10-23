# Desinstalando a CLI

O método de desinstalação depende de como você executou a CLI. Siga as instruções para `npx` ou para uma instalação global via `npm`.

## Método 1: Usando npx

O `npx` executa pacotes a partir de um cache temporário, sem fazer uma instalação permanente. Para "desinstalar" a CLI, você precisa limpar esse cache, o que removerá o `qwen-code` e quaisquer outros pacotes executados anteriormente com `npx`.

O cache do `npx` é um diretório chamado `_npx` dentro da pasta principal do cache do `npm`. Você pode descobrir o caminho do cache do `npm` executando `npm config get cache`.

**Para macOS / Linux**

```bash

# O caminho normalmente é ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Para Windows**

_Command Prompt_

```cmd
:: O caminho normalmente é %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell

# O caminho normalmente é $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Método 2: Usando npm (Instalação Global)

Se você instalou a CLI globalmente (ex.: `npm install -g @qwen-code/qwen-code`), use o comando `npm uninstall` com a flag `-g` para removê-la.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Esse comando remove completamente o pacote do seu sistema.