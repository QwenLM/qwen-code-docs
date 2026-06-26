# Sandbox

Este documento explica como executar o Qwen Code dentro de um sandbox para reduzir riscos quando as ferramentas executam comandos shell ou modificam arquivos.

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