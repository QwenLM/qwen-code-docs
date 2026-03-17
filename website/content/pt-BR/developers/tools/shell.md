# Ferramenta Shell (`run_shell_command`)

Este documento descreve a ferramenta `run_shell_command` para o Qwen Code.

## Descrição

Use `run_shell_command` para interagir com o sistema subjacente, executar scripts ou realizar operações na linha de comando. A `run_shell_command` executa um comando shell especificado, incluindo comandos interativos que exigem entrada do usuário (por exemplo, `vim`, `git rebase -i`), caso a configuração `tools.shell.enableInteractiveShell` esteja definida como `true`.

No Windows, os comandos são executados com `cmd.exe /c`. Em outras plataformas, eles são executados com `bash -c`.

### Argumentos

`run_shell_command` aceita os seguintes argumentos:

- `command` (string, obrigatório): O comando de shell exato a ser executado.
- `description` (string, opcional): Uma breve descrição da finalidade do comando, que será exibida ao usuário.
- `directory` (string, opcional): O diretório (relativo à raiz do projeto) no qual o comando será executado. Se não for fornecido, o comando será executado na raiz do projeto.
- `is_background` (booleano, obrigatório): Indica se o comando deve ser executado em segundo plano. Esse parâmetro é obrigatório para garantir uma decisão explícita sobre o modo de execução do comando. Defina como `true` para processos de longa duração, como servidores de desenvolvimento, observadores (*watchers*) ou *daemons*, que devem continuar em execução sem bloquear comandos subsequentes. Defina como `false` para comandos únicos que devem ser concluídos antes de prosseguir.

## Como usar `run_shell_command` com o Qwen Code

Ao usar `run_shell_command`, o comando é executado como um subprocesso. Você pode controlar se os comandos são executados em segundo plano ou em primeiro plano usando o parâmetro `is_background`, ou adicionando explicitamente `&` aos comandos. A ferramenta retorna informações detalhadas sobre a execução, incluindo:

### Parâmetro de Fundo Obrigatório

O parâmetro `is_background` é **obrigatório** para todas as execuções de comando. Esse projeto garante que o LLM (e os usuários) precisem decidir explicitamente se cada comando deve ser executado em segundo plano ou em primeiro plano, promovendo um comportamento intencional e previsível na execução de comandos. Ao tornar esse parâmetro obrigatório, evitamos uma execução acidental em primeiro plano, o que poderia bloquear operações subsequentes ao lidar com processos de longa duração.

### Execução em segundo plano vs execução em primeiro plano

A ferramenta lida de forma inteligente com a execução em segundo plano e em primeiro plano, com base na sua escolha explícita:

**Use a execução em segundo plano (`is_background: true`) para:**

- Servidores de desenvolvimento de longa duração: `npm run start`, `npm run dev`, `yarn dev`
- Observadores de build: `npm run watch`, `webpack --watch`
- Servidores de banco de dados: `mongod`, `mysql`, `redis-server`
- Servidores web: `python -m http.server`, `php -S localhost:8000`
- Qualquer comando esperado para executar indefinidamente até ser interrompido manualmente

**Use a execução em primeiro plano (`is_background: false`) para:**

- Comandos únicos: `ls`, `cat`, `grep`
- Comandos de build: `npm run build`, `make`
- Comandos de instalação: `npm install`, `pip install`
- Operações do Git: `git commit`, `git push`
- Execuções de testes: `npm test`, `pytest`

### Informações de Execução

A ferramenta retorna informações detalhadas sobre a execução, incluindo:

- `Command`: O comando que foi executado.
- `Directory`: O diretório onde o comando foi executado.
- `Stdout`: Saída do fluxo de saída padrão.
- `Stderr`: Saída do fluxo de erro padrão.
- `Error`: Qualquer mensagem de erro relatada pelo subprocesso.
- `Exit Code`: O código de saída do comando.
- `Signal`: O número do sinal, caso o comando tenha sido encerrado por um sinal.
- `Background PIDs`: Uma lista de PIDs dos processos em segundo plano iniciados.

Uso:

```bash
run_shell_command(command="Seus comandos.", description="Sua descrição do comando.", directory="Seu diretório de execução.", is_background=false)
```

**Observação:** O parâmetro `is_background` é obrigatório e deve ser explicitamente especificado em toda execução de comando.

## Exemplos de `run_shell_command`

Listar arquivos no diretório atual:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Executar um script em um diretório específico:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Executar meu script personalizado", is_background=false)
```

Iniciar um servidor de desenvolvimento em segundo plano (abordagem recomendada):

```bash
run_shell_command(command="npm run dev", description="Iniciar servidor de desenvolvimento em segundo plano", is_background=true)
```

Iniciar um servidor em segundo plano (alternativa com `&` explícito):

```bash
run_shell_command(command="npm run dev &", description="Iniciar servidor de desenvolvimento em segundo plano", is_background=false)
```

Executar um comando de build em primeiro plano:

```bash
run_shell_command(command="npm run build", description="Compilar o projeto", is_background=false)
```

Iniciar múltiplos serviços em segundo plano:

```bash
run_shell_command(command="docker-compose up", description="Iniciar todos os serviços", is_background=true)
```

## Configuração

Você pode configurar o comportamento da ferramenta `run_shell_command` modificando seu arquivo `settings.json` ou usando o comando `/settings` no Qwen Code.

### Habilitando Comandos Interativos

A configuração `tools.shell.enableInteractiveShell` controla se os comandos de shell são executados via `node-pty` (PTY interativo) ou pelo backend simples `child_process`. Quando habilitada, sessões interativas como `vim`, `git rebase -i` e programas com interface textual (TUI) funcionam corretamente.

Essa configuração tem valor padrão `true` na maioria das plataformas. Em versões do Windows **<= 19041** (anteriores à versão 2004 do Windows 10), o valor padrão é `false`, pois implementações mais antigas do ConPTY apresentam problemas conhecidos de confiabilidade (saída ausente, travamentos). Esse comportamento segue o mesmo critério adotado pelo VS Code ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). Se o `node-pty` não estiver disponível em tempo de execução, a ferramenta recorre automaticamente ao `child_process`, independentemente do valor dessa configuração.

Para substituir explicitamente o valor padrão, defina-o no arquivo `settings.json`:

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

Para exibir cores na saída do shell, você precisa definir a configuração `tools.shell.showColor` como `true`. **Observação: essa configuração só tem efeito quando `tools.shell.enableInteractiveShell` estiver habilitado.**

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

### Configurando o Paginador

Você pode definir um paginador personalizado para a saída do shell configurando `tools.shell.pager`. O paginador padrão é `cat`. **Observação: essa configuração só tem efeito quando `tools.shell.enableInteractiveShell` estiver habilitado.**

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

A ferramenta `run_shell_command` agora suporta comandos interativos ao integrar um pseudo-terminal (pty). Isso permite executar comandos que exigem entrada do usuário em tempo real, como editores de texto (`vim`, `nano`), interfaces de usuário baseadas em terminal (`htop`) e operações interativas de controle de versão (`git rebase -i`).

Enquanto um comando interativo estiver em execução, você poderá enviar entradas para ele diretamente do Qwen Code. Para focar no shell interativo, pressione `ctrl+f`. A saída do terminal, incluindo TUIs complexas, será renderizada corretamente.

## Observações importantes

- **Segurança:** Tenha cuidado ao executar comandos, especialmente aqueles construídos a partir de entradas do usuário, para evitar vulnerabilidades de segurança.
- **Tratamento de erros:** Verifique os campos `Stderr`, `Error` e `Código de saída` para determinar se um comando foi executado com sucesso.
- **Processos em segundo plano:** Quando `is_background=true` ou quando um comando contém `&`, a ferramenta retornará imediatamente e o processo continuará sendo executado em segundo plano. O campo `IDs de processo em segundo plano` conterá o ID do processo em segundo plano.
- **Opções de execução em segundo plano:** O parâmetro `is_background` é obrigatório e fornece controle explícito sobre o modo de execução. Você também pode adicionar `&` ao comando para execução manual em segundo plano, mas o parâmetro `is_background` ainda deve ser especificado. Esse parâmetro expressa uma intenção mais clara e configura automaticamente a execução em segundo plano.
- **Descrições de comandos:** Ao usar `is_background=true`, a descrição do comando incluirá um indicador `[em segundo plano]` para mostrar claramente o modo de execução.

## Variáveis de ambiente

Quando `run_shell_command` executa um comando, ele define a variável de ambiente `QWEN_CODE=1` no ambiente do subprocesso. Isso permite que scripts ou ferramentas detectem se estão sendo executados dentro da CLI.

## Restrições de Comandos

Você pode restringir os comandos que podem ser executados pela ferramenta `run_shell_command` usando as configurações `tools.core` e `tools.exclude` no seu arquivo de configuração.

- `tools.core`: Para restringir a `run_shell_command` a um conjunto específico de comandos, adicione entradas à lista `core` na categoria `tools`, no formato `run_shell_command(<comando>)`. Por exemplo, `"tools": {"core": ["run_shell_command(git)"]}` permitirá apenas comandos `git`. Incluir a forma genérica `run_shell_command` age como um curinga, permitindo qualquer comando que não seja explicitamente bloqueado.
- `tools.exclude`: Para bloquear comandos específicos, adicione entradas à lista `exclude` na categoria `tools`, no formato `run_shell_command(<comando>)`. Por exemplo, `"tools": {"exclude": ["run_shell_command(rm)"]}` bloqueará comandos `rm`.

A lógica de validação foi projetada para ser segura e flexível:

1.  **Cadeias de comandos desabilitadas**: A ferramenta divide automaticamente comandos encadeados com `&&`, `||` ou `;` e valida cada parte separadamente. Se qualquer parte da cadeia for proibida, todo o comando será bloqueado.
2.  **Correspondência por prefixo**: A ferramenta usa correspondência por prefixo. Por exemplo, se você permitir `git`, poderá executar `git status` ou `git log`.
3.  **Precedência da lista de bloqueio**: A lista `tools.exclude` é sempre verificada primeiro. Se um comando corresponder a um prefixo bloqueado, ele será negado, mesmo que também corresponda a um prefixo permitido em `tools.core`.

### Exemplos de Restrição de Comandos

**Permitir apenas prefixos específicos de comandos**

Para permitir apenas os comandos `git` e `npm`, e bloquear todos os demais:

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

**Bloquear prefixos específicos de comandos**

Para bloquear `rm` e permitir todos os demais comandos:

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

Se um prefixo de comando estiver presente tanto em `tools.core` quanto em `tools.exclude`, ele será bloqueado.

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

**Bloquear todos os comandos de shell**

Para bloquear todos os comandos de shell, adicione o curinga `run_shell_command` a `tools.exclude`:

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: Bloqueado  
- `qualquer outro comando`: Bloqueado

## Observação de Segurança para `excludeTools`

As restrições específicas por comando em `excludeTools` para `run_shell_command` baseiam-se em correspondência simples por string e podem ser facilmente contornadas. Este recurso **não é um mecanismo de segurança** e não deve ser usado como base para executar código não confiável com segurança. Recomenda-se usar `coreTools` para selecionar explicitamente os comandos que podem ser executados.