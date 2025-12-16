# Desinstalar

O método de desinstalação depende de como você executou a CLI. Siga as instruções para npx ou uma instalação global via npm.

## Método 1: Usando npx

npx executa pacotes a partir de um cache temporário sem uma instalação permanente. Para "desinstalar" a CLI, você deve limpar este cache, o que removerá o qwen-code e quaisquer outros pacotes previamente executados com npx.

O cache do npx é um diretório chamado `_npx` dentro da sua pasta principal de cache do npm. Você pode encontrar o caminho do cache do npm executando `npm config get cache`.

**Para macOS / Linux**

```bash

# O caminho geralmente é ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Para Windows**

_Prompt de Comando_

```cmd
:: O caminho geralmente é %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell

# O caminho geralmente é $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Método 2: Usando npm (Instalação Global)

Se você instalou a CLI globalmente (por exemplo, `npm install -g @qwen-code/qwen-code`), use o comando `npm uninstall` com a flag `-g` para removê-la.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Este comando remove completamente o pacote do seu sistema.