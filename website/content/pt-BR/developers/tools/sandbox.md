## Personalizando o ambiente sandbox (Docker/Podman)

### Atualmente, o projeto não suporta o uso da função BUILD_SANDBOX após a instalação através do pacote npm

1. Para construir um sandbox personalizado, você precisa acessar os scripts de construção (scripts/build_sandbox.js) no repositório do código-fonte.
2. Esses scripts de construção não estão incluídos nos pacotes lançados pelo npm.
3. O código contém verificações de caminho fixas que rejeitam explicitamente solicitações de construção de ambientes que não sejam de código-fonte.

Se você precisar de ferramentas extras dentro do contêiner (por exemplo, `git`, `python`, `rg`), crie um Dockerfile personalizado. A operação específica é a seguinte:

#### 1. Clone primeiro o projeto qwen code, https://github.com/QwenLM/qwen-code.git

#### 2. Certifique-se de executar a seguinte operação no diretório do repositório de código-fonte

```bash

# 1. Primeiro, instale as dependências do projeto
npm install

# 2. Construa o projeto Qwen Code
npm run build
```

# 3. Verifique se o diretório dist foi gerado
ls -la packages/cli/dist/

# 4. Crie um link global no diretório do pacote CLI
cd packages/cli
npm link

# 5. Verificação do link (agora deve apontar para o código-fonte)
which qwen

# Saída esperada: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen

# Ou caminhos semelhantes, mas deve ser um link simbólico

# 6. Para detalhes do link simbólico, você pode ver o caminho específico do código-fonte
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code

# Deve mostrar que este é um link simbólico apontando para seu diretório de código-fonte

# 7. Teste a versão do qwen
qwen -v

# npm link irá sobrescrever o qwen global. Para evitar não conseguir distinguir o mesmo número de versão, você pode desinstalar primeiro o CLI global
```

#### 3. Crie seu Dockerfile de sandbox no diretório raiz do seu projeto

- Caminho: `.qwen/sandbox.Dockerfile`

- Endereço da imagem oficial: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash

# Baseado na imagem oficial do sandbox Qwen (recomenda-se especificar explicitamente a versão)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# Adicione suas ferramentas extras aqui
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. Crie a primeira imagem de sandbox no diretório raiz do seu projeto

```bash
GEMINI_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# Verifique se a versão da ferramenta sandbox que você iniciou é consistente com a versão da sua imagem personalizada. Se forem consistentes, a inicialização será bem-sucedida
```

Isso cria uma imagem específica para o projeto baseada na imagem padrão do sandbox.

#### Remover link npm

- Se desejar restaurar o CLI oficial do qwen, remova o link npm

```bash

# Método 1: Desvincular globalmente
npm unlink -g @qwen-code/qwen-code

# Método 2: Remover no diretório packages/cli
cd packages/cli
npm unlink

# Verificação foi removida
which qwen

# Deve exibir "qwen not found"

# Reinstale a versão global se necessário
npm install -g @qwen-code/qwen-code

# Recuperação da verificação
which qwen
qwen --version
```