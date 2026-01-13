# Sandbox

Este documento explica como executar o Qwen Code dentro de um sandbox para reduzir riscos quando ferramentas executam comandos de shell ou modificam arquivos.

## Pré-requisitos

Antes de usar o sandboxing, você precisa instalar e configurar o Qwen Code:

```bash
npm install -g @qwen-code/qwen-code
```

Para verificar a instalação

```bash
qwen --version
```

## Visão geral da sandboxing

A sandboxing isola operações potencialmente perigosas (como comandos de shell ou modificações de arquivos) do seu sistema hospedeiro, fornecendo uma barreira de segurança entre o CLI e seu ambiente.

Os benefícios da sandboxing incluem:

- **Segurança**: Previne danos acidentais ao sistema ou perda de dados.
- **Isolamento**: Limita o acesso ao sistema de arquivos ao diretório do projeto.
- **Consistência**: Garante ambientes reproduzíveis em diferentes sistemas.
- **Segurança**: Reduz riscos ao trabalhar com código não confiável ou comandos experimentais.

> [!note]
>
> **Nota sobre nomenclatura:** Algumas variáveis de ambiente relacionadas à sandbox ainda utilizam o prefixo `GEMINI_*` para compatibilidade com versões anteriores.

## Métodos de sandboxing

Seu método ideal de sandboxing pode variar dependendo de sua plataforma e da solução de contêineres preferida.

### 1. macOS Seatbelt (somente macOS)

Sandboxing leve e integrado usando `sandbox-exec`.

**Perfil padrão**: `permissive-open` - restringe gravações fora do diretório do projeto, mas permite a maioria das outras operações e acesso à rede de saída.

**Melhor para**: Execução rápida, sem necessidade de Docker, proteção robusta para gravação de arquivos.

### 2. Baseado em contêiner (Docker/Podman)

Sandboxing multiplataforma com isolamento completo de processo.

Por padrão, o Qwen Code usa uma imagem de sandbox publicada (configurada no pacote CLI) e fará o download conforme necessário.

O sandbox de contêiner monta seu workspace e seu diretório `~/.qwen` dentro do contêiner para que autenticação e configurações persistam entre execuções.

**Melhor para**: Isolamento forte em qualquer sistema operacional, ferramentas consistentes dentro de uma imagem conhecida.

### Escolhendo um método

- **No macOS**:
  - Use Seatbelt quando quiser sandboxing leve (recomendado para a maioria dos usuários).
  - Use Docker/Podman quando precisar de um ambiente Linux completo (por exemplo, ferramentas que exigem binários Linux).
- **No Linux/Windows**:
  - Use Docker ou Podman.

## Início rápido

```bash

# Habilite o sandboxing com flag de comando
qwen -s -p "analise a estrutura do código"

# Ou habilite o sandboxing para sua sessão shell (recomendado para CI/scripts)
export GEMINI_SANDBOX=true   # true seleciona automaticamente um provedor (veja notas abaixo)
qwen -p "execute a suíte de testes"

# Configure em settings.json
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
> - No **macOS**, `GEMINI_SANDBOX=true` geralmente seleciona `sandbox-exec` (Seatbelt) se disponível.
> - No **Linux/Windows**, `GEMINI_SANDBOX=true` exige que `docker` ou `podman` estejam instalados.
> - Para forçar um provedor, defina `GEMINI_SANDBOX=docker|podman|sandbox-exec`.

## Configuração

### Habilitar sandboxing (em ordem de precedência)

1. **Variável de ambiente**: `GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Flag/comando de argumento**: `-s`, `--sandbox` ou `--sandbox=<provedor>`
3. **Arquivo de configurações**: `tools.sandbox` no seu `settings.json` (por exemplo, `{"tools": {"sandbox": true}}`).

> [!important]
>
> Se `GEMINI_SANDBOX` estiver definido, ele **substitui** a flag da CLI e o `settings.json`.

### Configurar a imagem do sandbox (Docker/Podman)

- **Flag da CLI**: `--sandbox-image <imagem>`
- **Variável de ambiente**: `GEMINI_SANDBOX_IMAGE=<imagem>`

Se você não definir nenhuma das opções acima, o Qwen Code usa a imagem padrão configurada no pacote da CLI (por exemplo, `ghcr.io/qwenlm/qwen-code:<versão>`).

### Perfis Seatbelt do macOS

Perfis integrados (definidos via variável de ambiente `SEATBELT_PROFILE`):

- `permissive-open` (padrão): Restrições de escrita, rede permitida
- `permissive-closed`: Restrições de escrita, sem rede
- `permissive-proxied`: Restrições de escrita, rede via proxy
- `restrictive-open`: Restrições rigorosas, rede permitida
- `restrictive-closed`: Restrições máximas
- `restrictive-proxied`: Restrições rigorosas, rede via proxy

> [!tip]
>
> Comece com `permissive-open` e, em seguida, altere para `restrictive-closed` se o seu fluxo de trabalho ainda funcionar.

### Perfis Seatbelt personalizados (macOS)

Para usar um perfil Seatbelt personalizado:

1. Crie um arquivo chamado `.qwen/sandbox-macos-<nome_do_perfil>.sb` no seu projeto.
2. Defina `SEATBELT_PROFILE=<nome_do_perfil>`.

### Flags de Sandbox Personalizados

Para sandboxing baseado em contêineres, você pode injetar flags personalizadas no comando `docker` ou `podman` usando a variável de ambiente `SANDBOX_FLAGS`. Isso é útil para configurações avançadas, como desabilitar recursos de segurança para casos de uso específicos.

**Exemplo (Podman)**:

Para desabilitar a rotulagem SELinux para montagens de volume, você pode definir o seguinte:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Várias flags podem ser fornecidas como uma string separada por espaços:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Proxy de rede (todos os métodos de sandbox)

Se você quiser restringir o acesso à rede externa a uma lista de permissões, você pode executar um proxy local ao lado da sandbox:

- Defina `GEMINI_SANDBOX_PROXY_COMMAND=<comando>`
- O comando deve iniciar um servidor proxy que escute em `:::8877`

Isso é especialmente útil com perfis Seatbelt `*-proxied`.

Para ver um exemplo funcional de proxy baseado em lista de permissões, consulte: [Script de Proxy Exemplo](/developers/examples/proxy-script).

## Manipulação de UID/GID no Linux

No Linux, o Qwen Code habilita por padrão o mapeamento de UID/GID para que a sandbox seja executada como seu usuário (e reutilize o diretório montado `~/.qwen`). Substitua com:

```bash
export SANDBOX_SET_UID_GID=true   # Forçar UID/GID do host
export SANDBOX_SET_UID_GID=false  # Desabilitar mapeamento de UID/GID
```

## Solução de problemas

### Problemas comuns

**"Operação não permitida"**

- A operação requer acesso fora do sandbox.
- No Seatbelt do macOS: tente um `SEATBELT_PROFILE` mais permissivo.
- No Docker/Podman: verifique se o workspace está montado e se seu comando não requer acesso fora do diretório do projeto.

**Comandos ausentes**

- Sandbox de container: adicione-os via `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt: seus binários locais são usados, mas o sandbox pode restringir o acesso a alguns caminhos.

**Problemas de rede**

- Verifique se o perfil do sandbox permite rede.
- Verifique a configuração do proxy.

### Modo de depuração

```bash
DEBUG=1 qwen -s -p "comando de depuração"
```

**Observação:** Se você tiver `DEBUG=true` em um arquivo `.env` de um projeto, isso não afetará a CLI devido à exclusão automática. Use arquivos `.qwen/.env` para configurações de depuração específicas do Qwen Code.

### Inspecionar sandbox

```bash

# Verificar ambiente
qwen -s -p "executar comando shell: env | grep SANDBOX"

# Listar montagens
qwen -s -p "executar comando shell: mount | grep workspace"
```

## Notas de segurança

- O sandbox reduz, mas não elimina todos os riscos.
- Utilize o perfil mais restritivo que permita o seu trabalho.
- A sobrecarga do contêiner é mínima após o primeiro pull/build.
- Aplicações com interface gráfica podem não funcionar em sandboxes.

## Documentação relacionada

- [Configuração](../configuration/settings): Opções completas de configuração.
- [Comandos](../features/commands): Comandos disponíveis.
- [Solução de problemas](../support/troubleshooting): Solução geral de problemas.