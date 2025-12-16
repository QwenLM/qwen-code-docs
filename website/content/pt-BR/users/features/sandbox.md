# Sandbox

Este documento explica como executar o Qwen Code dentro de um sandbox para reduzir riscos quando ferramentas executam comandos shell ou modificam arquivos.

## Pré-requisitos

Antes de usar o sandboxing, você precisa instalar e configurar o Qwen Code:

```bash
npm install -g @qwen-code/qwen-code
```

Para verificar a instalação

```bash
qwen --version
```

## Visão geral do sandboxing

O sandboxing isola operações potencialmente perigosas (como comandos shell ou modificações de arquivos) do seu sistema host, fornecendo uma barreira de segurança entre a CLI e seu ambiente.

Os benefícios do sandboxing incluem:

- **Segurança**: Evita danos acidentais ao sistema ou perda de dados.
- **Isolamento**: Limita o acesso ao sistema de arquivos somente ao diretório do projeto.
- **Consistência**: Garante ambientes reproduzíveis em diferentes sistemas.
- **Segurança**: Reduz o risco ao trabalhar com código não confiável ou comandos experimentais.

> [!note]
>
> **Nota sobre nomenclatura:** Algumas variáveis de ambiente relacionadas ao sandbox ainda utilizam o prefixo `GEMINI_*` para manter compatibilidade com versões anteriores.

## Métodos de sandboxing

Seu método ideal de sandboxing pode variar dependendo da sua plataforma e da solução de contêineres preferida.

### 1. macOS Seatbelt (somente macOS)

Sandboxing leve e integrado usando `sandbox-exec`.

**Perfil padrão**: `permissive-open` - restringe gravações fora do diretório do projeto, mas permite a maioria das outras operações e acesso à rede de saída.

**Melhor para**: Rápido, não requer Docker, proteções robustas para gravações de arquivos.

### 2. Baseado em contêiner (Docker/Podman)

Sandboxing multiplataforma com isolamento completo de processos.

Por padrão, o Qwen Code usa uma imagem sandbox publicada (configurada no pacote da CLI) e a baixará conforme necessário.

**Melhor para**: Isolamento forte em qualquer sistema operacional, ferramentas consistentes dentro de uma imagem conhecida.

### Escolhendo um método

- **No macOS**:
  - Use o Seatbelt quando quiser sandboxing leve (recomendado para a maioria dos usuários).
  - Use Docker/Podman quando precisar de um ambiente completo do Linux (por exemplo, ferramentas que exigem binários do Linux).
- **No Linux/Windows**:
  - Use Docker ou Podman.

## Início rápido

```bash

# Ative o sandboxing com flag de comando
qwen -s -p "analyze the code structure"```

```markdown
# Ou habilite o sandbox para sua sessão do shell (recomendado para CI / scripts)
export GEMINI_SANDBOX=true   # true seleciona automaticamente um provedor (veja notas abaixo)
qwen -p "execute o conjunto de testes"

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
> - No **macOS**, `GEMINI_SANDBOX=true` geralmente seleciona `sandbox-exec` (Seatbelt), se disponível.
> - No **Linux/Windows**, `GEMINI_SANDBOX=true` requer que `docker` ou `podman` estejam instalados.
> - Para forçar um provedor, defina `GEMINI_SANDBOX=docker|podman|sandbox-exec`.

## Configuração

### Habilite o sandbox (em ordem de precedência)

1. **Variável de ambiente**: `GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Flag / argumento de comando**: `-s`, `--sandbox`, ou `--sandbox=<provedor>`
3. **Arquivo de configurações**: `tools.sandbox` no seu `settings.json` (ex.: `{"tools": {"sandbox": true}}`).

> [!important]
>
> Se `GEMINI_SANDBOX` estiver definido, ele **substitui** a flag da CLI e o `settings.json`.
```

### Configurar a imagem do sandbox (Docker/Podman)

- **Flag da CLI**: `--sandbox-image <image>`
- **Variável de ambiente**: `GEMINI_SANDBOX_IMAGE=<image>`

Se você não definir nenhuma das duas, o Qwen Code usará a imagem padrão configurada no pacote da CLI (por exemplo, `ghcr.io/qwenlm/qwen-code:<version>`).

### Perfis do Seatbelt no macOS

Perfis integrados (definidos pela variável de ambiente `SEATBELT_PROFILE`):

- `permissive-open` (padrão): Restrições de escrita, rede permitida
- `permissive-closed`: Restrições de escrita, sem rede
- `permissive-proxied`: Restrições de escrita, rede via proxy
- `restrictive-open`: Restrições rigorosas, rede permitida
- `restrictive-closed`: Restrições máximas
- `restrictive-proxied`: Restrições rigorosas, rede via proxy

> [!tip]
>
> Comece com `permissive-open` e, se seu fluxo de trabalho ainda funcionar, mude para `restrictive-closed`.

### Perfis personalizados do Seatbelt (macOS)

Para usar um perfil personalizado do Seatbelt:

1. Crie um arquivo chamado `.qwen/sandbox-macos-<profile_name>.sb` no seu projeto.
2. Defina `SEATBELT_PROFILE=<profile_name>`.

### Flags personalizadas do Sandbox

Para sandboxing baseado em contêiner, você pode injetar flags personalizadas no comando `docker` ou `podman` usando a variável de ambiente `SANDBOX_FLAGS`. Isso é útil para configurações avançadas, como desativar recursos de segurança para casos de uso específicos.

**Exemplo (Podman)**:

Para desativar o rotulamento SELinux para montagens de volumes, você pode definir o seguinte:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Várias flags podem ser fornecidas como uma string separada por espaços:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Proxy de rede (todos os métodos do sandbox)

Se você quiser restringir o acesso à rede de saída a uma lista de permissões, pode executar um proxy local junto com o sandbox:

- Defina `GEMINI_SANDBOX_PROXY_COMMAND=<comando>`
- O comando deve iniciar um servidor proxy que escuta em `:::8877`

Isso é especialmente útil com perfis do Seatbelt do tipo `*-proxied`.

Para um exemplo funcional de proxy estilo lista de permissões, consulte: [Script de Proxy de Exemplo](/developers/examples/proxy-script).

## Tratamento de UID/GID no Linux

O sandbox trata automaticamente das permissões de usuário no Linux. Substitua essas permissões com:

```bash
export SANDBOX_SET_UID_GID=true   # Força o uso de UID/GID do host
export SANDBOX_SET_UID_GID=false  # Desativa o mapeamento de UID/GID
```

## Personalizando o ambiente sandbox (Docker/Podman)

Se você precisar de ferramentas extras dentro do contêiner (por exemplo, `git`, `python`, `rg`), crie um Dockerfile personalizado:

- Caminho: `.qwen/sandbox.Dockerfile`
- Em seguida, execute com: `BUILD_SANDBOX=1 qwen -s ...`

Isso cria uma imagem específica do projeto baseada na imagem padrão do sandbox.

## Solução de problemas

### Problemas comuns

**"Operation not permitted"**

- A operação requer acesso fora do sandbox.
- No macOS Seatbelt: tente um `SEATBELT_PROFILE` mais permissivo.
- No Docker/Podman: verifique se o workspace está montado e se o seu comando não requer acesso fora do diretório do projeto.

**Comandos ausentes**

- Sandbox em contêiner: adicione-os por meio de `.qwen/sandbox.Dockerfile` ou `.qwen/sandbox.bashrc`.
- Seatbelt: seus binários do host são usados, mas o sandbox pode restringir o acesso a alguns caminhos.

**Problemas de rede**

- Verifique se o perfil do sandbox permite rede.
- Confirme a configuração do proxy.

### Modo de depuração

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Nota:** Se você tiver `DEBUG=true` no arquivo `.env` de um projeto, isso não afetará a CLI devido à exclusão automática. Use os arquivos `.qwen/.env` para configurações de depuração específicas do Qwen Code.

### Inspecionar sandbox

```bash

# Verificar ambiente
qwen -s -p "run shell command: env | grep SANDBOX"

# Listar montagens
qwen -s -p "run shell command: mount | grep workspace"
```

## Notas de segurança

- O sandboxing reduz, mas não elimina todos os riscos.
- Use o perfil mais restritivo que permita seu trabalho.
- A sobrecarga do contêiner é mínima após a primeira pull/build.
- Aplicativos GUI podem não funcionar em sandboxes.

## Documentação relacionada

- [Configuração](../users/configuration/settings): Opções completas de configuração.
- [Comandos](../users/reference/cli-reference): Comandos disponíveis.
- [Solução de problemas](../users/support/troubleshooting): Solução de problemas geral.