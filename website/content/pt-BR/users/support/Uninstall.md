# Desinstalação

O método de desinstalação depende de como você instalou a CLI.

## Método 1: Usando npx

O npx executa pacotes a partir de um cache temporário, sem uma instalação permanente. Para "desinstalar" a CLI, você precisa limpar esse cache, o que removerá o qwen-code e quaisquer outros pacotes executados anteriormente com npx.

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

## Método 3: Instalação Independente

Se você instalou através do instalador independente (`curl ... | bash` ou `irm ... | iex`), use o script de desinstalação dedicado.

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

O desinstalador remove o runtime independente, o wrapper `qwen` gerado e as alterações no PATH gerenciadas pelo instalador. Sua configuração do Qwen Code (`~/.qwen`) é preservada por padrão.
