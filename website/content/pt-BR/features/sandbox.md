# Sandboxing no Qwen Code

Este documento fornece um guia sobre sandboxing no Qwen Code, incluindo pré-requisitos, início rápido e configuração.

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

O sandboxing isola operações potencialmente perigosas (como comandos shell ou modificações de arquivos) do seu sistema host, fornecendo uma barreira de segurança entre as operações da IA e o seu ambiente.

Os benefícios do sandboxing incluem:

- **Segurança**: Evita danos acidentais ao sistema ou perda de dados.
- **Isolamento**: Limita o acesso ao sistema de arquivos apenas ao diretório do projeto.
- **Consistência**: Garante ambientes reproduzíveis em diferentes sistemas.
- **Segurança**: Reduz o risco ao trabalhar com código não confiável ou comandos experimentais.

## Métodos de sandboxing

Seu método ideal de sandboxing pode variar dependendo da sua plataforma e da solução de container que você prefere.

### 1. macOS Seatbelt (somente macOS)

Sandboxing leve e integrado usando `sandbox-exec`.

**Perfil padrão**: `permissive-open` – restringe escritas fora do diretório do projeto, mas permite a maioria das outras operações.

### 2. Baseado em container (Docker/Podman)

Sandboxing multiplataforma com isolamento completo de processos.

**Nota**: Requer a construção da imagem do sandbox localmente ou o uso de uma imagem publicada no registry da sua organização.

## Quickstart

```bash

# Ativar sandboxing com flag de comando
qwen -s -p "analyze the code structure"

# Usar variável de ambiente
export GEMINI_SANDBOX=true
qwen -p "run the test suite"

# Configurar no settings.json
{
  "tools": {
    "sandbox": "docker"
  }
}
```

## Configuração

### Ativar sandboxing (em ordem de precedência)

1. **Flag de comando**: `-s` ou `--sandbox`
2. **Variável de ambiente**: `GEMINI_SANDBOX=true|docker|podman|sandbox-exec`
3. **Arquivo de configuração**: `"sandbox": true` no objeto `tools` do seu arquivo `settings.json` (ex.: `{"tools": {"sandbox": true}}`).

### Perfis Seatbelt no macOS

Perfis built-in (definidos via variável de ambiente `SEATBELT_PROFILE`):

- `permissive-open` (padrão): Restrições de escrita, rede permitida
- `permissive-closed`: Restrições de escrita, sem rede
- `permissive-proxied`: Restrições de escrita, rede via proxy
- `restrictive-open`: Restrições rigorosas, rede permitida
- `restrictive-closed`: Restrições máximas

### Custom Sandbox Flags

Para sandboxing baseado em containers, você pode injetar flags customizadas no comando `docker` ou `podman` usando a variável de ambiente `SANDBOX_FLAGS`. Isso é útil para configurações avançadas, como desabilitar features de segurança para casos de uso específicos.

**Exemplo (Podman)**:

Para desabilitar o labeling SELinux para mounts de volume, você pode definir:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Múltiplas flags podem ser fornecidas como uma string separada por espaços:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

## Linux UID/GID handling

O sandbox automaticamente lida com permissões de usuário no Linux. Sobrescreva essas permissões com:

```bash
export SANDBOX_SET_UID_GID=true   # Força UID/GID do host
export SANDBOX_SET_UID_GID=false  # Desabilita mapeamento UID/GID
```

## Troubleshooting

### Problemas comuns

**"Operation not permitted"**

- A operação requer acesso fora do sandbox.
- Tente usar um profile mais permissivo ou adicione pontos de montagem.

**Comandos ausentes**

- Adicione ao Dockerfile personalizado.
- Instale via `sandbox.bashrc`.

**Problemas de rede**

- Verifique se o profile do sandbox permite acesso à rede.
- Confirme a configuração do proxy.

### Modo de depuração (debug)

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Nota:** Se você tiver `DEBUG=true` no arquivo `.env` de um projeto, isso não afetará a CLI devido à exclusão automática. Use arquivos `.qwen/.env` para configurações específicas de debug do Qwen Code.

### Inspecionar o sandbox

```bash

# Verificar ambiente
qwen -s -p "run shell command: env | grep SANDBOX"

# Listar montagens
qwen -s -p "run shell command: mount | grep workspace"
```

## Notas de segurança

- O sandboxing reduz, mas não elimina todos os riscos.
- Use o profile mais restritivo que permita seu trabalho.
- O overhead do container é mínimo após a primeira build.
- Aplicativos GUI podem não funcionar dentro de sandboxes.

## Documentação relacionada

- [Configuration](./cli/configuration.md): Opções completas de configuração.
- [Commands](./cli/commands.md): Comandos disponíveis.
- [Troubleshooting](./troubleshooting.md): Solução de problemas geral.