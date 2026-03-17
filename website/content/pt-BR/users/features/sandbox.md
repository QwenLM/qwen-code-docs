# Sandbox

Este documento explica como executar o Qwen Code dentro de um sandbox para reduzir riscos quando ferramentas executam comandos de shell ou modificam arquivos.

## Pré-requisitos

Antes de usar o sandbox, você precisa instalar e configurar o Qwen Code:

```bash
npm install -g @qwen-code/qwen-code
```

Para verificar a instalação:

```bash
qwen --version
```

## Visão geral do sandboxing

O sandboxing isola operações potencialmente perigosas (como comandos de shell ou modificações de arquivos) do seu sistema host, fornecendo uma barreira de segurança entre a CLI e seu ambiente.

Os benefícios do sandboxing incluem:

- **Segurança**: Evita danos acidentais ao sistema ou perda de dados.
- **Isolamento**: Limita o acesso ao sistema de arquivos ao diretório do projeto.
- **Consistência**: Garante ambientes reproduzíveis em diferentes sistemas.
- **Segurança**: Reduz riscos ao trabalhar com código não confiável ou comandos experimentais.

> [!note]
>
> **Observação sobre nomenclatura:** Algumas variáveis de ambiente relacionadas ao sandboxing podem ter usado historicamente o prefixo `GEMINI_*`. Todas as novas variáveis de ambiente usam o prefixo `QWEN_*`.

## Métodos de sandboxing

O método ideal de sandboxing pode variar dependendo da sua plataforma e da solução de contêiner preferida.

### 1. Seatbelt do macOS (apenas macOS)

Sandboxing leve e embutido usando `sandbox-exec`.

**Perfil padrão**: `permissive-open` — restringe gravações fora do diretório do projeto, mas permite a maioria das outras operações e o acesso à rede de saída.

**Ideal para**: Execução rápida, sem necessidade de Docker, com proteções robustas para gravações de arquivos.

### 2. Baseado em contêiner (Docker/Podman)

Sandboxing multiplataforma com isolamento completo de processos.

Por padrão, o Qwen Code usa uma imagem de sandbox publicada (configurada no pacote da CLI) e a puxa conforme necessário.

O sandbox em contêiner monta seu workspace e seu diretório `~/.qwen` dentro do contêiner, garantindo que autenticação e configurações persistam entre execuções.

**Ideal para**: Isolamento robusto em qualquer sistema operacional, com ferramentas consistentes dentro de uma imagem conhecida.

### Escolhendo um método

- **No macOS**:
  - Use o Seatbelt quando você deseja uma sandbox leve (recomendado para a maioria dos usuários).
  - Use o Docker ou Podman quando você precisa de um ambiente completo de usuário Linux (por exemplo, ferramentas que exigem binários Linux).
- **No Linux/Windows**:
  - Use o Docker ou Podman.

## Início rápido

```bash

# Habilitar sandbox com sinalizador de comando
qwen -s -p "analise a estrutura do código"

# Ou habilitar sandbox para sua sessão de shell (recomendado para CI / scripts)
export QWEN_SANDBOX=true   # true escolhe automaticamente um provedor (veja as observações abaixo)
qwen -p "execute a suíte de testes"

# Configurar no settings.json
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **Observações sobre seleção do provedor:**
>
> - No **macOS**, `QWEN_SANDBOX=true` normalmente seleciona `sandbox-exec` (Seatbelt), se disponível.
> - No **Linux/Windows**, `QWEN_SANDBOX=true` exige que o `docker` ou `podman` esteja instalado.
> - Para forçar um provedor específico, defina `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Configuração

### Habilitar o sandboxing (na ordem de precedência)

1. **Variável de ambiente**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Flag ou argumento da linha de comando**: `-s`, `--sandbox` ou `--sandbox=<provedor>`
3. **Arquivo de configurações**: `tools.sandbox` no seu `settings.json` (por exemplo, `{"tools": {"sandbox": true}}`).

> [!important]
>
> Se `QWEN_SANDBOX` estiver definida, ela **substitui** a flag da CLI e o `settings.json`.

### Configurar a imagem do sandbox (Docker/Podman)

- **Flag da CLI**: `--sandbox-image <imagem>`
- **Variável de ambiente**: `QWEN_SANDBOX_IMAGE=<imagem>`

Se nenhuma delas for definida, o Qwen Code usa a imagem padrão configurada no pacote da CLI (por exemplo, `ghcr.io/qwenlm/qwen-code:<versão>`).

### Perfis Seatbelt do macOS

Perfis embutidos (definidos pela variável de ambiente `SEATBELT_PROFILE`):

- `permissive-open` (padrão): Restrições de gravação, rede permitida  
- `permissive-closed`: Restrições de gravação, sem rede  
- `permissive-proxied`: Restrições de gravação, rede via proxy  
- `restrictive-open`: Restrições rigorosas, rede permitida  
- `restrictive-closed`: Restrições máximas  
- `restrictive-proxied`: Restrições rigorosas, rede via proxy  

> [!tip]  
>  
> Comece com `permissive-open` e, se seu fluxo de trabalho ainda funcionar, progrida para `restrictive-closed`.

### Perfis Seatbelt personalizados (macOS)

Para usar um perfil Seatbelt personalizado:

1. Crie um arquivo chamado `.qwen/sandbox-macos-<nome_do_perfil>.sb` no seu projeto.  
2. Defina `SEATBELT_PROFILE=<nome_do_perfil>`.

### Flags Personalizados de Sandbox

Para sandboxing baseado em contêineres, você pode injetar flags personalizadas no comando `docker` ou `podman` usando a variável de ambiente `SANDBOX_FLAGS`. Isso é útil para configurações avançadas, como desabilitar recursos de segurança para casos de uso específicos.

**Exemplo (Podman)**:

Para desabilitar a rotulagem SELinux em montagens de volumes, você pode definir o seguinte:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Várias flags podem ser fornecidas como uma string separada por espaços:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Proxy de rede (todos os métodos de sandbox)

Se você quiser restringir o acesso à rede de saída a uma lista de permissões, pode executar um proxy local ao lado do sandbox:

- Defina `QWEN_SANDBOX_PROXY_COMMAND=<comando>`
- O comando deve iniciar um servidor proxy que escute em `:::8877`

Isso é especialmente útil com perfis Seatbelt do tipo `*-proxied`.

Para um exemplo funcional de proxy com lista de permissões, consulte: [Script de Exemplo de Proxy](/developers/examples/proxy-script).

## Manipulação de UID/GID no Linux

No Linux, o Qwen Code habilita por padrão o mapeamento de UID/GID para que o ambiente isolado seja executado como seu usuário (e reutilize o diretório montado `~/.qwen`). Substitua esse comportamento com:

```bash
export SANDBOX_SET_UID_GID=true   # Força o uso do UID/GID do host
export SANDBOX_SET_UID_GID=false  # Desabilita o mapeamento de UID/GID
```

## Solução de problemas

### Problemas comuns

**"Operação não permitida"**

- A operação exige acesso fora do ambiente isolado (sandbox).
- No macOS com Seatbelt: tente usar um `SEATBELT_PROFILE` mais permissivo.
- No Docker/Podman: verifique se o workspace está montado e se seu comando não exige acesso fora do diretório do projeto.

**Comandos ausentes**

- Ambiente isolado em contêiner: adicione-os por meio de `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt: os binários do sistema hospedeiro são utilizados, mas o ambiente isolado pode restringir o acesso a alguns caminhos.

**Java indisponível no ambiente isolado Docker**

A imagem oficial do Docker do Qwen Code é intencionalmente mínima para manter o tamanho reduzido, a segurança elevada e o tempo de download rápido. Diferentes usuários exigem ambientes de execução de linguagens distintas (Java, Python, Node.js, etc.), e empacotar todos esses ambientes em uma única imagem não é prático. Por isso, o Java **não está incluído por padrão** no ambiente isolado Docker.

Se seu fluxo de trabalho exigir Java, você pode estender a imagem base criando um arquivo `.qwen/sandbox.Dockerfile` no seu projeto:

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Em seguida, reconstrua a imagem do ambiente isolado:

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

Para obter mais detalhes sobre como personalizar o ambiente isolado, consulte [Personalizando o ambiente isolado](/developers/tools/sandbox).

**Problemas de rede**

- Verifique se o perfil do ambiente isolado permite acesso à rede.
- Confira a configuração do proxy.

### Modo de depuração

```bash
DEBUG=1 qwen -s -p "comando de depuração"
```

**Observação:** Se você tiver `DEBUG=true` em um arquivo `.env` de um projeto, isso não afetará a CLI devido à exclusão automática. Use arquivos `.qwen/.env` para configurações de depuração específicas do Qwen Code.

### Inspecionar sandbox

```bash

# Verificar o ambiente
qwen -s -p "executar comando shell: env | grep SANDBOX"

# Listar pontos de montagem
qwen -s -p "executar comando shell: mount | grep workspace"
```

## Observações de segurança

- O sandbox reduz, mas não elimina todos os riscos.
- Utilize o perfil mais restritivo que permita realizar seu trabalho.
- A sobrecarga do contêiner é mínima após o primeiro pull ou build.
- Aplicativos com interface gráfica (GUI) podem não funcionar em sandboxes.

## Documentação relacionada

- [Configuração](../configuration/settings): Opções completas de configuração.
- [Comandos](../features/commands): Comandos disponíveis.
- [Solução de problemas](../support/troubleshooting): Solução de problemas geral.