# Desinstalar

Seu método de desinstalação depende de como você instalou a CLI.

## Método 1: Usando npx

O npx executa pacotes de um cache temporário sem uma instalação permanente. Para "desinstalar" a CLI, você deve limpar esse cache, o que removerá o qwen-code e quaisquer outros pacotes executados anteriormente com o npx.

O cache do npx é um diretório chamado `_npx` dentro da pasta principal do cache do npm. Você pode encontrar o caminho do cache do npm executando `npm config get cache`.

**Para macOS / Linux**

```bash
# The path is typically ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Para Windows**

_Command Prompt_

```cmd
:: The path is typically %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# The path is typically $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Método 2: Usando npm (Instalação Global)

Se você instalou a CLI globalmente (por exemplo, `npm install -g @qwen-code/qwen-code`), use o comando `npm uninstall` com a flag `-g` para removê-la.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Este comando remove completamente o pacote do seu sistema.

## Método 3: Instalação Autônoma

Se você instalou através do instalador autônomo (`curl ... | bash` ou `irm ... | iex`), use o script de desinstalação dedicado.

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

O desinstalador remove o runtime autônomo, o wrapper `qwen` gerado e as alterações de PATH gerenciadas pelo instalador. Sua configuração do Qwen Code (`~/.qwen`) é preservada por padrão.