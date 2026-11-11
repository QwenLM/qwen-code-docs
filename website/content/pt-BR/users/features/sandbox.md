# Sandbox

Este documento explica o confinamento de execução de ferramentas no Linux e os métodos existentes de sandbox para toda a CLI.

## Sandbox de execução de ferramentas no Linux

No Linux, instale `bwrap` (Bubblewrap) em `/usr/bin/bwrap` (o caminho do sistema suportado) para o limite mais forte suportado, e então habilite o sandbox de execução de ferramentas nas suas configurações de **Usuário** (`~/.qwen/settings.json`, ou o diretório selecionado por `QWEN_HOME`) ou nas configurações de **Sistema** do administrador:

```json
{
  "tools": {
    "executionSandbox": {
      "backend": "auto",
      "filesystem": "workspace-write",
      "network": "closed"
    }
  }
}
```

`filesystem` e `network` são obrigatórios. `backend` tem como padrão `auto`, que tenta o bwrap primeiro. Quando o bwrap não está disponível e `network` é `open`, `auto` pode usar o auxiliar Landlock incluído em kernels com Landlock ABI 3 ou mais recente. Defina `backend` como `bwrap` ou `landlock` para exigir essa implementação exata. O Landlock não pode impor `network: closed` ou ocultar caminhos mascarados explícitos. Qualquer um desses requisitos rejeita o Landlock antes que qualquer comando seja iniciado; o fallback automático nunca descarta uma máscara de caminho restante. Use `read-only` para negar gravações no workspace, ou `workspace-write` para permitir gravações dentro do workspace canônico atual. Cada comando também recebe um espaço temporário privado. As configurações comuns de `includeDirectories` não concedem acesso de gravação. Mantenha o workspace separado da instalação do Qwen, dos diretórios de configuração do usuário e de estado de runtime.

A CLI, o transporte do modelo, a autenticação e o armazenamento de sessão permanecem no host. Shell, terminal `!`, interpolação de shell do prompt, Monitor, Read/Write/Edit e chamadas suportadas de Agent/Code Mode aninhados em processo usam a mesma política de runtime. Com bwrap, `network: closed` bloqueia conexões ordinárias de host/IP externo dos comandos, enquanto `open` compartilha a rede do host. As leituras permanecem amplas: este modo não oculta segredos do host nem promete isolar sockets Unix de caminho e serviços do host. Approval e YOLO não expandem a política de sistema de arquivos ou rede. Os streams padrão são capabilities explícitas fornecidas pelo chamador: um socket já conectado, TTY ou dispositivo de caractere permanece utilizável mesmo com `network: closed`. O networking fechado não revoga esses descritores existentes; evite fornecer uma conexão de serviço host como stdin quando esse acesso não for desejado. O stdin de arquivo backed pelo host e FIFO nomeado requer o auxiliar de entrada Linux x64/arm64 incluído e é copiado através de um socket de stream Unix privado com sua metade de gravação fechada; os offsets de arquivo regular avançam apenas pelos bytes consumidos desse socket, e um escritor FIFO ocioso não atrasa a conclusão do comando. Leia o fd 0 diretamente: esta entrada é um socket em vez de um FIFO, e reabri-lo através de `/dev/stdin` ou `/proc/self/fd/0` não é suportado. SIGINT/SIGTERM cancelam o comando mas ainda drenam os bytes aceitos de stdout/stderr; uma saída fechada interrompe esse stream com exit 141 enquanto a outra saída válida drena.

O Landlock reporta aplicação `partial` porque restringe leituras, gravações e mutações de diretório por caminho, mas não cria namespaces PID ou de rede e não pode atualmente restringir todas as operações de metadados, incluindo `chmod`, `chown`, atributos estendidos e timestamps. Um comando Landlock pode ver processos do host e usa a rede do host. Descendentes desanexados retêm as restrições de sistema de arquivos do Landlock, mas não obtêm o limite de tempo de vida do namespace PID do bwrap. Descritores de arquivo abertos retêm seu acesso existente. O Qwen Code faz stream do stdin de arquivo backed pelo host e FIFO nomeado através de um socket privado somente leitura em vez de passar esses descritores para o payload; sockets, dispositivos de caractere e pipes anônimos podem ser compartilhados. Os streams padrão de saída permanecem como destinos explícitos do chamador. O descritor de status de execução fecha no exec do payload.

O Landlock também tem uma superfície de dispositivo gravável mais restrita: concede gravações em `/dev/null`, mas não cria as montagens privadas `/dev` e `/proc` do bwrap. Abrir `/dev/full` ou `/dev/tty` para gravação e criar arquivos em `/dev/shm` são negados, então programas que requerem essas operações podem falhar. Use o diretório temporário privado exposto através de `TMPDIR`, `TMP` e `TEMP` para arquivos temporários. Streams padrão já abertos e fornecidos pelo chamador mantêm seu acesso existente. A sondagem de política Landlock na inicialização requer `/usr/bin/true`; um host sem ele falha na sondagem mesmo que seu kernel suporte Landlock.

As configurações de Workspace não podem habilitar, desabilitar ou modificar esta política, mesmo em um projeto confiável. A precedência efetiva é Sistema sobre Usuário sobre SystemDefaults, selecionando um objeto de política completo. Os valores devem ser literais; substituições de ambiente, campos desconhecidos e objetos incompletos são rejeitados. `--bare` e `--safe-mode` retêm o confinamento do operador. Mudanças requerem um novo runtime. Um arquivo de configurações SystemDefaults, Usuário ou Sistema malformado ou ilegível agora bloqueia a inicialização (código de saída de configuração 52), em vez de resetar silenciosamente a política desconhecida para configurações vazias. O erro nomeia o arquivo e a ação de reparo. Repare seu objeto JSON ou restaure o acesso de leitura, e então reinicie. Uma cópia `.corrupted` do Usuário é apenas uma referência; o arquivo original do operador nunca é limpo. A recuperação apenas de Workspace permanece disponível sem confinamento do operador. Configurações de Workspace vinculadas malformadas (incluindo um diretório `.qwen` vinculado ou um arquivo hard-linked) requerem reparo manual; a recuperação automática se recusa antes de alterar o original ou uma cópia de corrupção anterior. JSON vinculado válido permanece legível.

Este modo público inicial suporta a CLI headless ordinária e ambas as UIs de terminal. ACP, `qwen serve` e terminais web o rejeitam explicitamente. MCP/LSP, hooks/extensões executáveis, gerenciamento de worktree/arena, agentes externos, execução especulativa, checkpoints de arquivo, manutenção automática de skill/memória, e ferramentas de processo ou mutação não portadas são desabilitados ou rejeitados. Agentes em processo ordinários do mesmo workspace não podem adicionar hooks, servidores MCP, executores externos ou isolamento de worktree. Comandos de status personalizados, renderizadores externos de Markdown/imagem, detecção e conexão de IDE, restauração de arquivo e previews de diff Git do host são desabilitados. O rewind apenas de conversação permanece disponível.

Diagnósticos explícitos do operador como `/doctor`, abrir ou editar arquivos e pastas através de `/memory`, e alterar configurações através de `/skills` permanecem como ações de host confiáveis. Estes comandos de gerenciamento não são expostos como comandos invocáveis pelo modelo. Escolher um skill preenche o campo de entrada; submeter `/skill-name` atualmente reporta um erro de modo não suportado antes de preparar argumentos ou atualizar registros de uso. A execução de comando skill e a ferramenta Skill do modelo permanecem indisponíveis até que suas gravações de preparação sejam confinadas. A manutenção automática de memória e skill permanece desabilitada neste runtime mesmo que você altere suas configurações salvas.

Inspecione e verifique o limite ativo antes de executar uma tarefa:

```bash
qwen sandbox
qwen sandbox --verify
qwen sandbox -- sh -c 'printf "confined command\n"'
qwen -y -p "Update the project and run its tests"
```

Git worktrees vinculados recebem acesso de gravação apenas ao workspace admitido. O diretório comum do Git e metadados de worktree fora desse workspace permanecem somente leitura; este modo não autoriza implicitamente a alteração de metadados de repositório de outro checkout. Operações que requerem essas gravações podem ser recusadas.

O relatório nomeia o limite da ferramenta, backend solicitado/efetivo, nível de aplicação, ABI do Landlock quando aplicável, workspace, sistema de arquivos e política de rede de comando. `--verify` verifica gravações no workspace, negação contra um arquivo conhecido como gravável no host, a identidade esperada de namespace PID privado ou compartilhado, e o namespace de rede selecionado. Uma sondagem de backend aprovada estabelece admissão, não viabilidade autenticada de sessão completa sob todas as configurações de ambiente herdadas. Execute uma tarefa ordinária depois para testar suas ferramentas e serviços necessários. Se a verificação não puder criar seu fixture temporário do lado do host, verifique `TMPDIR` e permissões de diretório; isso é separado de uma recusa de limite. Erros de configuração de backend falham antes da execução do payload e nunca reexecutam o comando no host. O subcomando de um comando encaminha argumentos literais e stdin redirecionado enquanto preserva stdout e stderr byte a byte; use o terminal `!` para comandos PTY interativos.

### Migrando do bwrap de CLI inteira

Substitua `--sandbox bwrap` e remova `tools.sandbox: "bwrap"`, `QWEN_SANDBOX=bwrap`, `QWEN_SANDBOX_NET` e `QWEN_SANDBOX_PROXY_COMMAND`, e então configure `tools.executionSandbox` como acima. Reinicie a partir de um shell fora do sandbox antigo; `SANDBOX=bwrap` herdado é rejeitado. `proxied` não é uma política de rede suportada. Não combine este modo com Docker, Podman, Seatbelt ou um marcador de sandbox de CLI inteira herdado. Configurações antigas do bwrap produzem um erro explícito de migração.

Os métodos Docker, Podman e macOS Seatbelt abaixo ainda executam toda a CLI em seu ambiente existente.

## Pré-requisitos

Antes de usar o sandboxing, você precisa instalar e configurar o Qwen Code:

```bash
npm install -g @qwen-code/qwen-code
```

Para verificar a instalação:

```bash
qwen --version
```

## Visão geral do sandboxing

O sandboxing isola operações potencialmente perigosas (como comandos shell ou modificações de arquivos) do seu sistema host, fornecendo uma barreira de segurança entre a CLI e seu ambiente.

Os benefícios do sandboxing incluem:

- **Segurança**: Evita danos acidentais ao sistema ou perda de dados.
- **Isolamento**: Limita o acesso ao sistema de arquivos ao diretório do projeto.
- **Consistência**: Garante ambientes reproduzíveis em diferentes sistemas.
- **Segurança**: Reduz riscos ao trabalhar com código não confiável ou comandos experimentais.

> [!note]
>
> **Nota sobre nomenclatura:** Algumas variáveis de ambiente relacionadas ao sandbox podem ter usado o prefixo `GEMINI_*` historicamente. Todas as novas variáveis de ambiente usam o prefixo `QWEN_*`.

## Métodos de sandboxing

Seu método ideal de sandboxing pode variar dependendo da sua plataforma e da sua solução de contêiner preferida.

### 1. macOS Seatbelt (somente macOS)

Sandboxing leve e integrado usando `sandbox-exec`.

**Perfil padrão**: `permissive-open` — restringe gravações fora do diretório do projeto, mas permite a maioria das outras operações e acesso de rede de saída.

**Melhor para**: Rápido, sem necessidade de Docker, fortes proteções para gravações de arquivos.

### 2. Baseado em contêiner (Docker/Podman)

Sandboxing multiplataforma com isolamento completo de processos.

Por padrão, o Qwen Code usa uma imagem de sandbox publicada (configurada no pacote CLI) e a baixará conforme necessário.

O sandbox do contêiner monta seu workspace e seu diretório `~/.qwen` dentro do contêiner para que a autenticação e as configurações persistam entre as execuções.

**Melhor para**: Isolamento forte em qualquer SO, ferramentas consistentes dentro de uma imagem conhecida.

### Escolhendo um método

- **No macOS**:
  - Use o Seatbelt quando quiser um sandboxing leve (recomendado para a maioria dos usuários).
  - Use Docker/Podman quando precisar de um ambiente Linux completo (ex.: ferramentas que exigem binários Linux).
- **No Linux/Windows**:
  - Use Docker ou Podman.

## Início rápido

```bash
# Habilitar sandboxing com flag de comando
qwen -s -p "analisar a estrutura do código"

# Ou habilitar sandboxing para sua sessão de shell (recomendado para CI / scripts)
export QWEN_SANDBOX=true   # true escolhe automaticamente um provedor (veja notas abaixo)
qwen -p "executar o conjunto de testes"

# Configurar no settings.json
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **Notas sobre seleção de provedor:**
>
> - No **macOS**, `QWEN_SANDBOX=true` normalmente seleciona `sandbox-exec` (Seatbelt) se disponível.
> - No **Linux/Windows**, `QWEN_SANDBOX=true` requer que `docker` ou `podman` estejam instalados.
> - Para forçar um provedor, defina `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Configuração

### Habilitar sandboxing (em ordem de precedência)

1. **Variável de ambiente**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Flag de comando / argumento**: `-s`, `--sandbox` ou `--sandbox=<provedor>`
3. **Arquivo de configurações**: `tools.sandbox` no seu `settings.json` (ex.: `{"tools": {"sandbox": true}}`).

> [!important]
>
> Se `QWEN_SANDBOX` estiver definida, ela **substitui** a flag da CLI e o `settings.json`.

`--sandbox` e `-s` aceitam um valor opcional: `true`, `false`, `docker`, `podman` ou `sandbox-exec`. Para seleção automática com um prompt, use `qwen --sandbox=true "query"` ou `qwen --sandbox -p "query"`. Diferente do antigo parser apenas booleano, `qwen --sandbox "query"` agora trata `query` como um valor de backend e rejeita um backend desconhecido. Opções antes de `--` usam a mesma gramática mesmo após palavras posicionais; use `-p "..."` para texto de opção literal dentro de um prompt. `--` interrompe a análise de opções, mas seus tokens finais não são encaminhados como o prompt do comando padrão. Flags de sandbox de sessão não são aceitas em subcomandos de gerenciamento, cujos aliases `-s` retêm seu próprio significado.

### Configurar a imagem do sandbox (Docker/Podman)

- **Flag da CLI**: `--sandbox-image <imagem>`
- **Variável de ambiente**: `QWEN_SANDBOX_IMAGE=<imagem>`
- **Arquivo de configurações**: `tools.sandboxImage` no seu `settings.json` (ex.: `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`)

Ordem de prioridade (da maior para a menor):

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. Imagem padrão interna do pacote CLI (por exemplo `ghcr.io/qwenlm/qwen-code:<versão>`)

`settings.env.QWEN_SANDBOX_IMAGE` também funciona como um mecanismo genérico de injeção de env, mas `tools.sandboxImage` é a configuração persistente preferida.

Imagens personalizadas são gerenciadas pelo usuário. Reconstrua-as com uma instalação atualizada do Qwen Code para receber a handoff segura de atualização; imagens mais antigas podem ainda usar seu atualizador em processo original.

### Perfis do macOS Seatbelt

Perfis integrados (definidos via variável de ambiente `SEATBELT_PROFILE`):

- `permissive-open` (padrão): Restrições de gravação, rede permitida
- `permissive-closed`: Restrições de gravação, sem rede
- `permissive-proxied`: Restrições de gravação, rede via proxy
- `restrictive-open`: Restrições severas, rede permitida
- `restrictive-closed`: Restrições máximas
- `restrictive-proxied`: Restrições severas, rede via proxy

> [!tip]
>
> Comece com `permissive-open` e depois restrinja para `restrictive-closed` se seu fluxo de trabalho ainda funcionar.

### Perfis personalizados do Seatbelt (macOS)

Para usar um perfil personalizado do Seatbelt:

1. Crie um arquivo chamado `.qwen/sandbox-macos-<nome_do_perfil>.sb` no seu projeto.
2. Defina `SEATBELT_PROFILE=<nome_do_perfil>`.

### Flags personalizadas do sandbox

Para sandboxing baseado em contêiner, você pode injetar flags personalizadas no comando `docker` ou `podman` usando a variável de ambiente `SANDBOX_FLAGS`. Isso é útil para configurações avançadas, como desabilitar recursos de segurança para casos de uso específicos.

**Exemplo (Podman)**:

Para desabilitar a rotulagem SELinux para montagens de volume, você pode definir o seguinte:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Múltiplas flags podem ser fornecidas como uma string separada por espaços:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=valor"
```

### Proxy de rede (todos os métodos de sandbox)

Se você quiser restringir o acesso de rede de saída a uma lista de permissões, você pode executar um proxy local junto com o sandbox:

- Defina `QWEN_SANDBOX_PROXY_COMMAND=<comando>`
- O comando deve iniciar um servidor proxy que escute em `:::8877`

Isso é especialmente útil com perfis `*-proxied` do Seatbelt.

Para um exemplo funcional de proxy no estilo de lista de permissões, consulte: [Exemplo de script de proxy](../../developers/examples/proxy-script.md).

## Tratamento de UID/GID no Linux

No Linux, o Qwen Code padrão habilita o mapeamento de UID/GID para que o sandbox seja executado como seu usuário (e reutilize o `~/.qwen` montado). Substitua com:

```bash
export SANDBOX_SET_UID_GID=true   # Forçar UID/GID do host
export SANDBOX_SET_UID_GID=false  # Desabilitar mapeamento de UID/GID
```

## Solução de problemas

### Problemas comuns

**"Operação não permitida"**

- A operação requer acesso fora do sandbox.
- No macOS Seatbelt: tente um `SEATBELT_PROFILE` mais permissivo.
- No Docker/Podman: verifique se o workspace está montado e se seu comando não requer acesso fora do diretório do projeto.

**Comandos ausentes**

- Sandbox de contêiner: adicione-os via `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt: seus binários do host são usados, mas o sandbox pode restringir o acesso a alguns caminhos.

**Java não disponível no sandbox Docker**

A imagem Docker oficial do Qwen Code é intencionalmente mínima para manter a imagem pequena, segura e rápida de baixar. Diferentes usuários precisam de diferentes runtimes de linguagem (Java, Python, Node.js, etc.), e agrupar todos os ambientes em uma única imagem não é prático. Portanto, o Java **não está incluído por padrão** no sandbox Docker.

Se seu fluxo de trabalho exigir Java, você pode estender a imagem base criando um `.qwen/sandbox.Dockerfile` no seu projeto:

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Em seguida, reconstrua a imagem do sandbox:

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

Para mais detalhes sobre personalização do sandbox, consulte [Personalizando o ambiente do sandbox](../../developers/tools/sandbox.md).

**Problemas de rede**

- Verifique se o perfil do sandbox permite rede.
- Verifique a configuração do proxy.

### Modo de depuração

```bash
DEBUG=1 qwen -s -p "comando de depuração"
```

**Nota:** Se você tiver `DEBUG=true` em um arquivo `.env` do projeto, isso não afetará a CLI devido à exclusão automática. Use arquivos `.qwen/.env` para configurações de depuração específicas do Qwen Code.

### Inspecionar sandbox

```bash
# Verificar ambiente
qwen -s -p "executar comando shell: env | grep SANDBOX"

# Listar montagens
qwen -s -p "executar comando shell: mount | grep workspace"
```

## Notas de segurança

- O sandboxing reduz, mas não elimina todos os riscos.
- Use o perfil mais restritivo que permita seu trabalho.
- A sobrecarga do contêiner é mínima após o primeiro pull/build.
- Aplicações GUI podem não funcionar em sandboxes.

## Documentação relacionada

- [Configuração](../configuration/settings): Opções completas de configuração.
- [Comandos](../features/commands): Comandos disponíveis.
- [Solução de problemas](../support/troubleshooting): Solução de problemas gerais.
