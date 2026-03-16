# Desinstalar

O método de desinstalação depende de como você executou a CLI. Siga as instruções para npx ou para uma instalação global do npm.

## Método 1: Usando npx

O npx executa pacotes de um cache temporário sem realizar uma instalação permanente. Para “desinstalar” a CLI, você precisa limpar esse cache, o que removerá o `qwen-code` e quaisquer outros pacotes anteriormente executados com o npx.

O cache do npx é um diretório chamado `_npx` dentro da pasta principal de cache do npm. Você pode encontrar o caminho do cache do npm executando `npm config get cache`.

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

## Método 2: Usando npm (instalação global)

Se você instalou a CLI globalmente (por exemplo, `npm install -g @qwen-code/qwen-code`), use o comando `npm uninstall` com a flag `-g` para removê-la.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Esse comando remove completamente o pacote do seu sistema.