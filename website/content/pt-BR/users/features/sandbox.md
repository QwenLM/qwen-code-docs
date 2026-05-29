---
description: "Entenda a sandbox do Qwen Code para limitar comandos e ações de arquivo arriscadas, executando tarefas de programação com IA com limites seguros."
---

# Sandbox

Este documento explica como executar o Qwen Code dentro de um sandbox para reduzir riscos quando as ferramentas executam comandos de shell ou modificam arquivos.

## Pré-requisitos

Antes de usar o sandbox, você precisa instalar e configurar o Qwen Code:

```bash
npm install -g @qwen-code/qwen-code
```

Para verificar a instalação

```bash
qwen --version
```

## Visão geral do sandbox

O sandbox isola operações potencialmente perigosas (como comandos de shell ou modificações em arquivos) do seu sistema host, fornecendo uma barreira de segurança entre a CLI e seu ambiente.

Os benefícios do uso de sandbox incluem:

- **Segurança**: Previne danos acidentais ao sistema ou perda de dados.
- **Isolamento**: Limita o acesso ao sistema de arquivos ao diretório do projeto.
- **Consistência**: Garante ambientes reproduzíveis em diferentes sistemas.
- **Proteção**: Reduz riscos ao trabalhar com código não confiável ou comandos experimentais.

> [!note]
>
> **Nota sobre nomenclatura:** Historicamente, algumas variáveis de ambiente relacionadas ao sandbox podem ter usado o prefixo `GEMINI_*`. Todas as novas variáveis de ambiente usam o prefixo `QWEN_*`.

## Métodos de sandbox

O método ideal de sandbox pode variar dependendo da sua plataforma e da sua solução de contêiner preferida.

### 1. macOS Seatbelt (somente macOS)

Sandbox leve e nativo que usa `sandbox-exec`.

**Perfil padrão**: `permissive-open` - restringe gravações fora do diretório do projeto, mas permite a maioria das outras operações e acesso de rede de saída.

**Ideal para**: Execução rápida, sem necessidade de Docker, com proteções robustas para gravação de arquivos.

### 2. Baseado em contêiner (Docker/Podman)

Sandbox multiplataforma com isolamento completo de processos.

Por padrão, o Qwen Code usa uma imagem de sandbox publicada (configurada no pacote da CLI) e fará o pull dela conforme necessário.

O sandbox em contêiner monta seu workspace e o diretório `~/.qwen` dentro do contêiner para que a autenticação e as configurações persistam entre as execuções.

**Ideal para**: Isolamento forte em qualquer SO, com ferramentas consistentes dentro de uma imagem conhecida.

### Escolhendo um método

- **No macOS**:
  - Use o Seatbelt quando quiser um sandbox leve (recomendado para a maioria dos usuários).
  - Use Docker/Podman quando precisar de um userland Linux completo (por exemplo, ferramentas que exigem binários Linux).
- **No Linux/Windows**:
  - Use Docker ou Podman.

## Início rápido

```bash
# Enable sandboxing with command flag
qwen -s -p "analyze the code structure"

# Or enable sandboxing for your shell session (recommended for CI / scripts)
export QWEN_SANDBOX=true   # true auto-picks a provider (see notes below)
qwen -p "run the test suite"

# Configure in settings.json
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
> - No **macOS**, `QWEN_SANDBOX=true` geralmente seleciona `sandbox-exec` (Seatbelt), se disponível.
> - No **Linux/Windows**, `QWEN_SANDBOX=true` exige que o `docker` ou `podman` esteja instalado.
> - Para forçar um provedor, defina `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Configuração

### Habilitar sandbox (em ordem de precedência)

1. **Variável de ambiente**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Flag/argumento de comando**: `-s`, `--sandbox` ou `--sandbox=<provider>`
3. **Arquivo de configurações**: `tools.sandbox` no seu `settings.json` (por exemplo, `{"tools": {"sandbox": true}}`).

> [!important]
>
> Se `QWEN_SANDBOX` estiver definida, ela **sobrescreve** a flag da CLI e o `settings.json`.

### Configurar a imagem do sandbox (Docker/Podman)

- **Flag da CLI**: `--sandbox-image <image>`
- **Variável de ambiente**: `QWEN_SANDBOX_IMAGE=<image>`
- **Arquivo de configurações**: `tools.sandboxImage` no seu `settings.json` (por exemplo, `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`)

Ordem de prioridade (da mais alta para a mais baixa):

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. Imagem padrão integrada ao pacote da CLI (por exemplo, `ghcr.io/qwenlm/qwen-code:<version>`)

`settings.env.QWEN_SANDBOX_IMAGE` também funciona como um mecanismo genérico de injeção de variáveis de ambiente, mas `tools.sandboxImage` é a configuração persistente preferida.

### Perfis do macOS Seatbelt

Perfis integrados (definidos pela variável de ambiente `SEATBELT_PROFILE`):

- `permissive-open` (padrão): Restrições de gravação, rede permitida
- `permissive-closed`: Restrições de gravação, sem rede
- `permissive-proxied`: Restrições de gravação, rede via proxy
- `restrictive-open`: Restrições rigorosas, rede permitida
- `restrictive-closed`: Restrições máximas
- `restrictive-proxied`: Restrições rigorosas, rede via proxy

> [!tip]
>
> Comece com `permissive-open` e, se o seu fluxo de trabalho continuar funcionando, restrinja para `restrictive-closed`.

### Perfis personalizados do Seatbelt (macOS)

Para usar um perfil personalizado do Seatbelt:

1. Crie um arquivo chamado `.qwen/sandbox-macos-<profile_name>.sb` no seu projeto.
2. Defina `SEATBELT_PROFILE=<profile_name>`.

### Flags personalizadas do sandbox

Para sandboxes baseados em contêiner, você pode injetar flags personalizadas no comando `docker` ou `podman` usando a variável de ambiente `SANDBOX_FLAGS`. Isso é útil para configurações avançadas, como desativar recursos de segurança para casos de uso específicos.

**Exemplo (Podman)**:

Para desativar a rotulagem SELinux para montagens de volume, você pode definir o seguinte:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Várias flags podem ser fornecidas como uma string separada por espaços:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Proxy de rede (todos os métodos de sandbox)

Se quiser restringir o acesso de rede de saída a uma allowlist, você pode executar um proxy local junto com o sandbox:

- Defina `QWEN_SANDBOX_PROXY_COMMAND=<command>`
- O comando deve iniciar um servidor proxy que escute em `:::8877`

Isso é especialmente útil com os perfis Seatbelt `*-proxied`.

Para um exemplo funcional de proxy estilo allowlist, consulte: [Example Proxy Script](/developers/examples/proxy-script).

## Tratamento de UID/GID no Linux

No Linux, o Qwen Code habilita por padrão o mapeamento de UID/GID para que o sandbox seja executado como seu usuário (e reutilize o `~/.qwen` montado). Substitua com:

```bash
export SANDBOX_SET_UID_GID=true   # Force host UID/GID
export SANDBOX_SET_UID_GID=false  # Disable UID/GID mapping
```

## Solução de problemas

### Problemas comuns

**"Operation not permitted"**

- A operação exige acesso fora do sandbox.
- No macOS Seatbelt: tente um `SEATBELT_PROFILE` mais permissivo.
- No Docker/Podman: verifique se o workspace está montado e se o seu comando não exige acesso fora do diretório do projeto.

**Comandos ausentes**

- Sandbox em contêiner: adicione-os via `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt: os binários do host são usados, mas o sandbox pode restringir o acesso a alguns caminhos.

**Java não disponível no sandbox Docker**

A imagem Docker oficial do Qwen Code é intencionalmente mínima para manter a imagem pequena, segura e rápida para fazer pull. Diferentes usuários exigem diferentes runtimes de linguagem (Java, Python, Node.js, etc.), e empacotar todos os ambientes em uma única imagem não é prático. Portanto, o Java **não está incluído por padrão** no sandbox Docker.

Se o seu fluxo de trabalho exigir Java, você pode estender a imagem base criando um `.qwen/sandbox.Dockerfile` no seu projeto:

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

Para mais detalhes sobre como personalizar o sandbox, consulte [Customizing the sandbox environment](/developers/tools/sandbox).

**Problemas de rede**

- Verifique se o perfil do sandbox permite acesso à rede.
- Verifique a configuração do proxy.

### Modo de depuração

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Nota:** Se você tiver `DEBUG=true` no arquivo `.env` de um projeto, ele não afetará a CLI devido à exclusão automática. Use arquivos `.qwen/.env` para configurações de depuração específicas do Qwen Code.

### Inspecionar o sandbox

```bash
# Check environment
qwen -s -p "run shell command: env | grep SANDBOX"

# List mounts
qwen -s -p "run shell command: mount | grep workspace"
```

## Notas de segurança

- O sandbox reduz, mas não elimina todos os riscos.
- Use o perfil mais restritivo que ainda permita o seu trabalho.
- O overhead do contêiner é mínimo após o primeiro pull/build.
- Aplicações GUI podem não funcionar em sandboxes.

## Documentação relacionada

- [Configuration](../configuration/settings): Opções completas de configuração.
- [Commands](../features/commands): Comandos disponíveis.
- [Troubleshooting](../support/troubleshooting): Solução de problemas geral.