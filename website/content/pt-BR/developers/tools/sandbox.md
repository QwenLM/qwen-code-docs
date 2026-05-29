---
description: "Personalize o ambiente de sandbox do Qwen Code. Crie contêineres Docker ou Podman seguros para isolar execução de código por IA, alterações de arquivos e ferramentas do projeto."
---

# Personalizando o ambiente de sandbox (Docker/Podman)

## Atualmente, o projeto não oferece suporte ao uso de `BUILD_SANDBOX` após a instalação via pacote npm

1. Para criar uma sandbox personalizada, você precisa acessar os scripts de build (`scripts/build_sandbox.js`) no repositório do código-fonte.
2. Esses scripts de build não estão incluídos nos pacotes distribuídos pelo npm.
3. O código contém verificações de caminho hard-coded que rejeitam explicitamente solicitações de build de ambientes que não sejam o código-fonte.

Se você precisar de ferramentas adicionais dentro do container (por exemplo, `git`, `python`, `rg`), crie um Dockerfile personalizado. O procedimento específico é o seguinte:

### 1. Clone o projeto Qwen Code primeiro: https://github.com/QwenLM/qwen-code.git

### 2. Certifique-se de executar as operações a seguir no diretório do repositório do código-fonte

```bash
# 1. First, install the dependencies of the project
npm install

# 2. Build the Qwen Code project
npm run build

# 3. Verify that the dist directory has been generated
ls -la packages/cli/dist/

# 4. Create a global link in the CLI package directory
cd packages/cli
npm link

# 5. Verification link (it should now point to the source code)
which qwen
# Expected output: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# Or similar paths, but it should be a symbolic link

# 6. For details of the symbolic link, you can see the specific source code path
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# It should show that this is a symbolic link pointing to your source code directory

# 7.Test the version of qwen
qwen -v
# npm link will overwrite the global qwen. To avoid being unable to distinguish the same version number, you can uninstall the global CLI first

```

### 3. Crie o Dockerfile da sua sandbox no diretório raiz do seu projeto

- Caminho: `.qwen/sandbox.Dockerfile`

- Endereço da imagem oficial: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# Based on the official Qwen sandbox image (It is recommended to explicitly specify the version)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43
# Add your extra tools here
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

### 4. Crie a primeira imagem da sandbox no diretório raiz do seu projeto

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# Observe whether the sandbox version of the tool you launched is consistent with the version of your custom image. If they are consistent, the startup will be successful
```

Isso cria uma imagem específica do projeto com base na imagem padrão da sandbox.

### Remover o npm link

- Se quiser restaurar a CLI oficial do Qwen Code, remova o npm link

```bash
# Method 1: Unlink globally
npm unlink -g @qwen-code/qwen-code

# Method 2: Remove it in the packages/cli directory
cd packages/cli
npm unlink

# Verification has been lifted
which qwen
# It should display "qwen not found"

# Reinstall the global version if necessary
npm install -g @qwen-code/qwen-code

# Verification Recovery
which qwen
qwen --version
```
