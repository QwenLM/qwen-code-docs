# Ferramenta Shell (`run_shell_command`)

Este documento descreve a ferramenta `run_shell_command` para o Qwen Code.

## Descrição

Use `run_shell_command` para interagir com o sistema subjacente, executar scripts ou realizar operações de linha de comando. `run_shell_command` executa um comando shell fornecido, incluindo comandos interativos que requerem entrada do usuário (por exemplo, `vim`, `git rebase -i`) se a configuração `tools.shell.enableInteractiveShell` estiver definida como `true`.

No Windows, os comandos são executados com `cmd.exe /c`. Em outras plataformas, são executados com `bash -c`.

### Argumentos

`run_shell_command` aceita os seguintes argumentos:

- `command` (string, obrigatório): O comando shell exato a ser executado.
- `description` (string, opcional): Uma breve descrição do propósito do comando, que será mostrada ao usuário.
- `directory` (string, opcional): O diretório (relativo à raiz do projeto) no qual o comando será executado. Se não for fornecido, o comando será executado na raiz do projeto.
- `is_background` (boolean, opcional): Indica se o comando deve ser executado em segundo plano. Se não especificado, o padrão é `false` (execução em primeiro plano). Defina como `true` para processos de longa duração, como servidores de desenvolvimento, watchers ou daemons que devem continuar rodando sem bloquear comandos subsequentes.

## Como usar `run_shell_command` com o Qwen Code

Ao usar `run_shell_command`, o comando é executado como um subprocesso. Se é executado em segundo plano ou em primeiro plano é controlado pelo parâmetro `is_background`. Não adicione `&` no final quando `is_background: true`: o caminho gerenciado de segundo plano é o próprio mecanismo de execução em segundo plano, e a ferramenta rejeita a chamada em vez de executá-la. A ferramenta retorna informações detalhadas sobre a execução, incluindo:

### O Parâmetro `is_background`

`is_background` é opcional — o schema da ferramenta requer apenas `command` — e quando omitido, o comando é executado em primeiro plano. A decisão que precisa ser explícita é, portanto, a outra: um comando que não vai parar por si só deve ser marcado como `is_background: true`, porque deixá-lo em primeiro plano bloqueia o turno até que expire o tempo limite.

### Execução em Segundo Plano vs Primeiro Plano

A ferramenta lida com a execução em segundo plano e em primeiro plano com base nesse parâmetro:

**Use execução em segundo plano (`is_background: true`) para:**

- Servidores de desenvolvimento de longa duração: `npm run start`, `npm run dev`, `yarn dev`
- Watchers de build: `npm run watch`, `webpack --watch`
- Servidores de banco de dados: `mongod`, `mysql`, `redis-server`
- Servidores web: `python -m http.server`, `php -S localhost:8000`
- Qualquer comando que se espera rodar indefinidamente até ser parado manualmente

**Use execução em primeiro plano (o padrão) para** comandos que terminam por si só, como builds, instalações, operações git e execuções de testes.

### Informações de Execução

A ferramenta retorna informações detalhadas sobre a execução, incluindo:

- `Command`: O comando que foi executado.
- `Directory`: O diretório onde o comando foi executado.
- `Stdout`: Saída do fluxo de saída padrão.
- `Stderr`: Saída do fluxo de erro padrão.
- `Error`: Qualquer mensagem de erro reportada pelo subprocesso.
- `Exit Code`: O código de saída do comando.
- `Signal`: O número do sinal, caso o comando tenha sido terminado por um sinal.
- `Background PIDs`: Uma lista de PIDs para quaisquer processos em segundo plano iniciados.

Uso:

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**Nota:** `is_background` é opcional. Omiti-lo executa o comando em primeiro plano, então o caso que precisa de um `true` explícito é um comando que não vai parar por si só.

## Exemplos de `run_shell_command`

Listar arquivos no diretório atual:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Executar um script em um diretório específico:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

Iniciar um servidor de desenvolvimento em segundo plano (abordagem recomendada):

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

Nota: um `&` explícito não é um mecanismo de segundo plano gerenciado. Com `is_background: true` a ferramenta rejeita um `&` no final antes do comando ser executado; com `is_background=false` o shell destaca o processo, então a chamada retorna sem que o processo seja rastreado — não tem entrada de tarefa em segundo plano e `task_stop` não pode alcançá-lo. Sempre use `is_background=true` para um comando que deve ser executado em segundo plano.

Executar um comando de build em primeiro plano:

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

Iniciar múltiplos serviços em segundo plano:

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## Configuração

Você pode configurar o comportamento da ferramenta `run_shell_command` modificando seu arquivo `settings.json` ou usando o comando `/settings` no Qwen Code.

### Habilitando Comandos Interativos

A configuração `tools.shell.enableInteractiveShell` controla se os comandos shell são executados via `node-pty` (PTY interativo) ou o backend simples `child_process`. Quando habilitada, sessões interativas como `vim`, `git rebase -i` e programas TUI funcionam corretamente.

Quando a configuração é omitida, prompts one-shot explícitos usam `child_process`; sessões interativas de TUI, ACP, entrada stream-json, apenas stdin e entrada de arquivo usam PTY. Em builds do Windows **<= 19041** (antes da versão 2004 do Windows 10), o modo PTY faz fallback para `child_process` porque implementações mais antigas do ConPTY têm problemas conhecidos de confiabilidade (saída ausente, travamentos). Isso corresponde ao mesmo limite usado pelo VS Code ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Se o `node-pty` não estiver disponível em tempo de execução, a ferramenta também faz fallback para `child_process`.

Para substituir explicitamente o padrão, defina o valor em `settings.json`:

**Exemplo de `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "enableInteractiveShell": true
    }
  }
}
```

### Exibindo Cores na Saída

Para exibir cores na saída do shell, você precisa definir a configuração `tools.shell.showColor` como `true`. **Nota: Esta configuração só se aplica quando `tools.shell.enableInteractiveShell` está habilitado.**

**Exemplo de `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### Configurando o Pager

Você pode definir um pager personalizado para a saída do shell configurando a opção `tools.shell.pager`. O pager padrão é `cat` em plataformas que não sejam Windows. Nenhum padrão é definido no Windows. Defina `tools.shell.pager` como uma string vazia para desabilitar as variáveis de ambiente do pager. **Nota: Esta configuração só se aplica quando `tools.shell.enableInteractiveShell` está habilitado.**

**Exemplo de `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## Comandos Interativos

A ferramenta `run_shell_command` agora suporta comandos interativos integrando um pseudoterminal (pty). Isso permite que você execute comandos que requerem entrada do usuário em tempo real, como editores de texto (`vim`, `nano`), UIs baseadas em terminal (`htop`) e operações interativas de controle de versão (`git rebase -i`).

Quando um comando interativo está em execução, você pode enviar entradas para ele a partir do Qwen Code. Para focar no shell interativo, pressione `ctrl+f`. A saída do terminal, incluindo TUIs complexas, será renderizada corretamente.

## Notas importantes

- **Segurança:** Tenha cuidado ao executar comandos, especialmente aqueles construídos a partir da entrada do usuário, para evitar vulnerabilidades de segurança.
- **Tratamento de erros:** Verifique os campos `Stderr`, `Error` e `Exit Code` para determinar se um comando foi executado com sucesso.
- **Processos em segundo plano:** Apenas `is_background=true` inicia um processo em segundo plano rastreado: a ferramenta retorna imediatamente com o id do shell e o PID, e o processo continua executando. Um `&` no nível do shell não cria um — com `is_background: true` a ferramenta rejeita um `&` no final, e com `is_background=false` o shell destaca o comando sem que a ferramenta o rastreie.
- **Escolhas de execução em segundo plano:** O parâmetro `is_background` é opcional (o schema requer apenas `command`); defina `is_background: true` para um comando que não vai parar por si só, porque deixá-lo em primeiro plano bloqueia o turno até que expire o tempo limite. Use `is_background` em vez de `&` no nível do shell; isso fornece intenção mais clara e a ferramenta gerencia a configuração da execução em segundo plano.
- **Descrições de comandos:** Ao usar `is_background=true`, a descrição do comando incluirá um indicador `[background]` para mostrar claramente o modo de execução.

## Variáveis de Ambiente

Quando `run_shell_command` executa um comando, ele define a variável de ambiente `QWEN_CODE=1` no ambiente do subprocesso. Isso permite que scripts ou ferramentas detectem se estão sendo executados de dentro da CLI.

## Restrições de Comandos

Você pode restringir os comandos que podem ser executados pela ferramenta `run_shell_command` usando as configurações `tools.core` e `tools.exclude` no seu arquivo de configuração.

- `tools.core`: Para restringir `run_shell_command` a um conjunto específico de comandos, adicione entradas à lista `core` sob a categoria `tools` no formato `run_shell_command(<comando>)`. Por exemplo, `"tools": {"core": ["run_shell_command(git)"]}` permitirá apenas comandos `git`. Incluir o `run_shell_command` genérico atua como um curinga, permitindo qualquer comando que não esteja explicitamente bloqueado.
- `tools.exclude`: Para bloquear comandos específicos, adicione entradas à lista `exclude` sob a categoria `tools` no formato `run_shell_command(<comando>)`. Por exemplo, `"tools": {"exclude": ["run_shell_command(rm)"]}` bloqueará comandos `rm`.

A lógica de validação é projetada para ser segura e flexível:

1.  **Encadeamento de Comandos Desabilitado**: A ferramenta divide automaticamente comandos encadeados com `&&`, `||` ou `;` e valida cada parte separadamente. Se qualquer parte da cadeia não for permitida, o comando inteiro é bloqueado.
2.  **Correspondência de Prefixo**: A ferramenta usa correspondência de prefixo. Por exemplo, se você permitir `git`, poderá executar `git status` ou `git log`.
3.  **Precedência da Lista de Bloqueio**: A lista `tools.exclude` é sempre verificada primeiro. Se um comando corresponder a um prefixo bloqueado, ele será negado, mesmo que também corresponda a um prefixo permitido em `tools.core`.

### Exemplos de Restrição de Comandos

**Permitir apenas prefixos de comandos específicos**

Para permitir apenas comandos `git` e `npm`, e bloquear todos os outros:

```json
{
  "tools": {
    "core": ["run_shell_command(git)", "run_shell_command(npm)"]
  }
}
```

- `git status`: Permitido
- `npm install`: Permitido
- `ls -l`: Bloqueado

**Bloquear prefixos de comandos específicos**

Para bloquear `rm` e permitir todos os outros comandos:

```json
{
  "tools": {
    "core": ["run_shell_command"],
    "exclude": ["run_shell_command(rm)"]
  }
}
```

- `rm -rf /`: Bloqueado
- `git status`: Permitido
- `npm install`: Permitido

**A lista de bloqueio tem precedência**

Se um prefixo de comando estiver em ambos `tools.core` e `tools.exclude`, ele será bloqueado.

```json
{
  "tools": {
    "core": ["run_shell_command(git)"],
    "exclude": ["run_shell_command(git push)"]
  }
}
```

- `git push origin main`: Bloqueado
- `git status`: Permitido

**Bloquear todos os comandos shell**

Para bloquear todos os comandos shell, adicione o curinga `run_shell_command` a `tools.exclude`:

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: Bloqueado
- `qualquer outro comando`: Bloqueado

## Nota de Segurança para `excludeTools`

Restrições específicas de comandos em `excludeTools` para `run_shell_command` são baseadas em correspondência simples de strings e podem ser facilmente contornadas. Este recurso **não é um mecanismo de segurança** e não deve ser usado para executar código não confiável com segurança. Recomenda-se usar `coreTools` para selecionar explicitamente os comandos que podem ser executados.