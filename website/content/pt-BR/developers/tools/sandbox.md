## Personalizando o ambiente sandbox (Docker/Podman)

### Atualmente, o projeto não suporta o uso da função BUILD_SANDBOX após a instalação através do pacote npm

1. Para criar um sandbox personalizado, você precisa acessar os scripts de build (scripts/build_sandbox.js) no repositório do código-fonte.
2. Esses scripts de build não estão incluídos nos pacotes publicados pelo npm.
3. O código contém verificações de caminho hard-coded que rejeitam explicitamente requisições de build de ambientes que não sejam o código-fonte.

Se você precisar de ferramentas adicionais dentro do container (ex.: `git`, `python`, `rg`), crie um Dockerfile personalizado. A operação específica é a seguinte:

#### 1. Primeiro, clone o projeto qwen-code: https://github.com/QwenLM/qwen-code.git

#### 2. Certifique-se de executar as operações a seguir no diretório do repositório do código-fonte

```bash
# 1. Primeiro, instale as dependências do projeto
npm install

# 2. Compile o projeto Qwen Code
npm run build

# 3. Verifique se o diretório dist foi gerado
ls -la packages/cli/dist/

# 4. Crie um link global no diretório do pacote CLI
cd packages/cli
npm link

# 5. Verifique o link (agora ele deve apontar para o código-fonte)
which qwen
# Saída esperada: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# Ou caminho similar, mas deve ser um link simbólico

# 6. Para detalhes do link simbólico, você pode ver o caminho específico do código-fonte
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# Deve mostrar que este é um link simbólico apontando para seu diretório de código-fonte

# 7. Teste a versão do qwen
qwen -v
# O npm link substituirá o qwen global. Para evitar não conseguir distinguir o mesmo número de versão, você pode desinstalar a CLI global primeiro
```

#### 3. Crie seu Dockerfile sandbox no diretório raiz do seu próprio projeto

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

#### 4. Crie a primeira imagem sandbox no diretório raiz do seu projeto

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# Observe se a versão sandbox da ferramenta que você iniciou é consistente com a versão da sua imagem personalizada. Se forem consistentes, a inicialização será bem-sucedida
```

Isso cria uma imagem específica para o projeto baseada na imagem sandbox padrão.

#### Remover o npm link

- Se você quiser restaurar a CLI oficial do qwen, remova o npm link

```bash
# Método 1: Desvincular globalmente
npm unlink -g @qwen-code/qwen-code

# Método 2: Remover no diretório packages/cli
cd packages/cli
npm unlink

# Verificar se foi removido
which qwen
# Deve exibir "qwen not found"

# Reinstalar a versão global, se necessário
npm install -g @qwen-code/qwen-code

# Verificar a restauração
which qwen
qwen --version
```