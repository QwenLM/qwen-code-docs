# Shell Tool (`run_shell_command`)

Este documento descreve a ferramenta `run_shell_command` para o Qwen Code.

## Descrição

Use `run_shell_command` para interagir com o sistema subjacente, executar scripts ou realizar operações na linha de comando. `run_shell_command` executa um determinado comando shell, incluindo comandos interativos que requerem entrada do usuário (por exemplo, `vim`, `git rebase -i`) se a configuração `tools.shell.enableInteractiveShell` estiver definida como `true`.

No Windows, os comandos são executados com `cmd.exe /c`. Em outras plataformas, eles são executados com `bash -c`.

### Argumentos

`run_shell_command` aceita os seguintes argumentos:

- `command` (string, obrigatório): O comando shell exato a ser executado.
- `description` (string, opcional): Uma breve descrição do propósito do comando, que será mostrada ao usuário.
- `directory` (string, opcional): O diretório (relativo à raiz do projeto) no qual o comando deve ser executado. Se não for informado, o comando é executado na raiz do projeto.
- `is_background` (boolean, obrigatório): Define se o comando deve ser executado em segundo plano. Esse parâmetro é obrigatório para garantir uma decisão explícita sobre o modo de execução do comando. Defina como `true` para processos de longa duração, como servidores de desenvolvimento, watchers ou daemons que devem continuar rodando sem bloquear comandos subsequentes. Defina como `false` para comandos pontuais que devem ser finalizados antes de prosseguir.

## Como usar `run_shell_command` com Qwen Code

Ao usar `run_shell_command`, o comando é executado como um subprocesso. Você pode controlar se os comandos rodam em background ou foreground usando o parâmetro `is_background`, ou adicionando explicitamente `&` aos comandos. A tool retorna informações detalhadas sobre a execução, incluindo:

### Parâmetro Background Obrigatório

O parâmetro `is_background` é **obrigatório** para todas as execuções de comando. Esse design garante que o LLM (e os usuários) precisem decidir explicitamente se cada comando deve ser executado em background ou foreground, promovendo um comportamento intencional e previsível na execução dos comandos. Ao tornar esse parâmetro obrigatório, evitamos que ocorra uma execução indesejada em foreground, o que poderia bloquear operações subsequentes ao lidar com processos de longa duração.

### Execução em Background vs Foreground

A ferramenta trata de forma inteligente a execução em background e foreground com base na sua escolha explícita:

**Use execução em background (`is_background: true`) para:**

- Servidores de desenvolvimento de longa duração: `npm run start`, `npm run dev`, `yarn dev`
- Watchers de build: `npm run watch`, `webpack --watch`
- Servidores de banco de dados: `mongod`, `mysql`, `redis-server`
- Servidores web: `python -m http.server`, `php -S localhost:8000`
- Qualquer comando que deve rodar indefinidamente até ser interrompido manualmente

**Use execução em foreground (`is_background: false`) para:**

- Comandos únicos: `ls`, `cat`, `grep`
- Comandos de build: `npm run build`, `make`
- Comandos de instalação: `npm install`, `pip install`
- Operações Git: `git commit`, `git push`
- Execução de testes: `npm test`, `pytest`

### Informações de Execução

A ferramenta retorna informações detalhadas sobre a execução, incluindo:

- `Command`: O comando que foi executado.
- `Directory`: O diretório onde o comando foi executado.
- `Stdout`: Saída do stream de saída padrão.
- `Stderr`: Saída do stream de erro padrão.
- `Error`: Qualquer mensagem de erro reportada pelo subprocesso.
- `Exit Code`: O código de saída do comando.
- `Signal`: O número do sinal caso o comando tenha sido terminado por um sinal.
- `Background PIDs`: Uma lista de PIDs para quaisquer processos em background iniciados.

Uso:

```bash
run_shell_command(command="Seus comandos.", description="Sua descrição do comando.", directory="Seu diretório de execução.", is_background=false)
```

**Nota:** O parâmetro `is_background` é obrigatório e deve ser explicitamente especificado para cada execução de comando.

## Exemplos de `run_shell_command`

Listar arquivos no diretório atual:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Executar um script em um diretório específico:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

Iniciar um servidor de desenvolvimento em background (abordagem recomendada):

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

Iniciar um servidor em background (alternativa com & explícito):

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

Executar um comando de build em foreground:

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

Iniciar múltiplos serviços em background:

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## Configuração

Você pode configurar o comportamento da ferramenta `run_shell_command` modificando seu arquivo `settings.json` ou usando o comando `/settings` no Qwen Code.

### Habilitando Comandos Interativos

Para habilitar comandos interativos, você precisa definir a configuração `tools.shell.enableInteractiveShell` como `true`. Isso utilizará o `node-pty` para execução de comandos shell, o que permite sessões interativas. Se o `node-pty` não estiver disponível, ele voltará para a implementação `child_process`, que não suporta comandos interativos.

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

### Mostrando Cores na Saída

Para mostrar cores na saída do shell, você precisa definir a configuração `tools.shell.showColor` como `true`. **Nota: Esta configuração só se aplica quando `tools.shell.enableInteractiveShell` está habilitado.**

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

Você pode definir um pager customizado para a saída do shell configurando a opção `tools.shell.pager`. O pager padrão é `cat`. **Nota: Essa configuração só se aplica quando `tools.shell.enableInteractiveShell` está habilitado.**

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

A tool `run_shell_command` agora suporta comandos interativos por meio da integração de um pseudo-terminal (pty). Isso permite que você execute comandos que requerem entrada do usuário em tempo real, como editores de texto (`vim`, `nano`), interfaces baseadas em terminal (`htop`) e operações interativas de controle de versão (`git rebase -i`).

Quando um comando interativo está em execução, você pode enviar entradas para ele diretamente do Qwen Code. Para focar no shell interativo, pressione `ctrl+f`. A saída do terminal, incluindo TUIs complexas, será renderizada corretamente.

## Notas importantes

- **Segurança:** Tenha cuidado ao executar comandos, especialmente aqueles construídos a partir de entrada do usuário, para evitar vulnerabilidades de segurança.
- **Tratamento de erros:** Verifique os campos `Stderr`, `Error` e `Exit Code` para determinar se um comando foi executado com sucesso.
- **Processos em segundo plano:** Quando `is_background=true` ou quando um comando contém `&`, a ferramenta retornará imediatamente e o processo continuará sendo executado em segundo plano. O campo `Background PIDs` conterá o ID do processo em segundo plano.
- **Opções de execução em segundo plano:** O parâmetro `is_background` é obrigatório e fornece controle explícito sobre o modo de execução. Você também pode adicionar `&` ao comando para execução manual em segundo plano, mas o parâmetro `is_background` ainda deve ser especificado. O parâmetro fornece uma intenção mais clara e trata automaticamente a configuração da execução em segundo plano.
- **Descrições de comandos:** Ao usar `is_background=true`, a descrição do comando incluirá um indicador `[background]` para mostrar claramente o modo de execução.

## Variáveis de Ambiente

Quando `run_shell_command` executa um comando, ele define a variável de ambiente `QWEN_CODE=1` no ambiente do subprocesso. Isso permite que scripts ou ferramentas detectem se estão sendo executados a partir da CLI.

## Restrições de Comandos

Você pode restringir os comandos que podem ser executados pela ferramenta `run_shell_command` usando as configurações `tools.core` e `tools.exclude` no seu arquivo de configuração.

- `tools.core`: Para restringir `run_shell_command` a um conjunto específico de comandos, adicione entradas na lista `core` dentro da categoria `tools` no formato `run_shell_command(<comando>)`. Por exemplo, `"tools": {"core": ["run_shell_command(git)"]}` permitirá apenas comandos `git`. Incluir o `run_shell_command` genérico age como um curinga, permitindo qualquer comando não explicitamente bloqueado.
- `tools.exclude`: Para bloquear comandos específicos, adicione entradas na lista `exclude` dentro da categoria `tools` no formato `run_shell_command(<comando>)`. Por exemplo, `"tools": {"exclude": ["run_shell_command(rm)"]}` bloqueará comandos `rm`.

A lógica de validação foi projetada para ser segura e flexível:

1.  **Encadeamento de Comandos Desativado**: A ferramenta automaticamente divide comandos encadeados com `&&`, `||`, ou `;` e valida cada parte separadamente. Se alguma parte do encadeamento for inválida, todo o comando é bloqueado.
2.  **Correspondência por Prefixo**: A ferramenta usa correspondência por prefixo. Por exemplo, se você permitir `git`, poderá executar `git status` ou `git log`.
3.  **Precedência da Lista de Bloqueio**: A lista `tools.exclude` é sempre verificada primeiro. Se um comando corresponder a um prefixo bloqueado, ele será negado, mesmo que também corresponda a um prefixo permitido em `tools.core`.

### Exemplos de Restrição de Comandos

**Permitir apenas prefixos de comandos específicos**

Para permitir apenas os comandos `git` e `npm`, e bloquear todos os outros:

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

Para bloquear o comando `rm` e permitir todos os outros:

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

Se um prefixo de comando estiver tanto em `tools.core` quanto em `tools.exclude`, ele será bloqueado.

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

Para bloquear todos os comandos shell, adicione o wildcard `run_shell_command` em `tools.exclude`:

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

As restrições específicas por comando em `excludeTools` para `run_shell_command` são baseadas em correspondência simples de strings e podem ser facilmente contornadas. Este recurso **não é um mecanismo de segurança** e não deve ser utilizado como base para executar código não confiável com segurança. É recomendado usar `coreTools` para selecionar explicitamente os comandos que podem ser executados.