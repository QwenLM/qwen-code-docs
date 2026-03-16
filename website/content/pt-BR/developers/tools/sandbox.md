## Personalizando o ambiente sandbox (Docker/Podman)

### Atualmente, o projeto não suporta o uso da função `BUILD_SANDBOX` após a instalação via pacote npm

1. Para criar um sandbox personalizado, você precisa acessar os scripts de compilação (`scripts/build_sandbox.js`) no repositório de código-fonte.
2. Esses scripts de compilação não estão incluídos nos pacotes publicados pelo npm.
3. O código contém verificações de caminho embutidas que rejeitam explicitamente solicitações de compilação provenientes de ambientes que não sejam de código-fonte.

Se você precisar de ferramentas adicionais dentro do contêiner (por exemplo, `git`, `python`, `rg`), crie um Dockerfile personalizado. A operação específica é a seguinte:

#### 1. Clone primeiro o projeto Qwen Code: https://github.com/QwenLM/qwen-code.git

#### 2. Certifique-se de executar a seguinte operação no diretório do repositório de código-fonte

```bash

# 1. Primeiro, instale as dependências do projeto
npm install

# 2. Compile o projeto Qwen Code
npm run build

# 3. Verifique se o diretório `dist` foi gerado  
ls -la packages/cli/dist/

# 4. Crie um link global no diretório do pacote CLI  
cd packages/cli  
npm link  

# 5. Verifique o link (agora ele deve apontar para o código-fonte)  
which qwen  

# Saída esperada: `/xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen`  

# Ou caminhos semelhantes, mas deve ser um link simbólico  

# 6. Para detalhes sobre o link simbólico, você pode visualizar o caminho específico do código-fonte  
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code  

# Deve mostrar que este é um link simbólico apontando para seu diretório de código-fonte  

# 7. Teste a versão do `qwen`  
qwen -v  

# O `npm link` substituirá o `qwen` global. Para evitar confusão com números de versão idênticos, você pode desinstalar primeiro a CLI global  

```

#### 3. Crie seu Dockerfile de sandbox no diretório raiz do seu projeto

- Caminho: `.qwen/sandbox.Dockerfile`

- Endereço da imagem oficial no repositório: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash

# Baseado na imagem oficial de sandbox do Qwen (recomenda-se especificar explicitamente a versão)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# Adicione aqui suas ferramentas adicionais
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. Crie a primeira imagem de sandbox no diretório raiz do seu projeto

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# Verifique se a versão da ferramenta em sandbox que você iniciou é compatível com a versão da sua imagem personalizada. Se forem compatíveis, a inicialização será bem-sucedida
```

Isso cria uma imagem específica para o projeto com base na imagem padrão de sandbox.

#### Remover o link npm

- Se desejar restaurar a CLI oficial do qwen, remova o link npm

```bash

# Método 1: Desvincular globalmente
npm unlink -g @qwen-code/qwen-code

# Método 2: Remover no diretório packages/cli
cd packages/cli
npm unlink

# Verificação de que a desvinculação foi realizada
which qwen

# Deve exibir "qwen não encontrado"

# Reinstalar a versão global, se necessário
npm install -g @qwen-code/qwen-code

# Verificação da recuperação
which qwen
qwen --version