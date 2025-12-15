# Execução e Deploy do Qwen Code

Este documento descreve como executar o Qwen Code e explica a arquitetura de deploy utilizada pelo Qwen Code.

## Executando o Qwen Code

Existem várias formas de executar o Qwen Code. A opção escolhida depende da forma como você pretende utilizá-lo.

---

### 1. Instalação padrão (Recomendado para usuários comuns)

Esta é a forma recomendada para que os usuários finais instalem o Qwen Code. Envolve baixar o pacote do Qwen Code a partir do registro NPM.

- **Instalação global:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Em seguida, execute o CLI de qualquer lugar:

  ```bash
  qwen
  ```

- **Execução via NPX:**

  ```bash
  # Executa a versão mais recente do NPM sem instalar globalmente
  npx @qwen-code/qwen-code
  ```

---

### 2. Executando em um sandbox (Docker/Podman)

Para segurança e isolamento, o Qwen Code pode ser executado dentro de um contêiner. Essa é a forma padrão que a CLI executa ferramentas que podem ter efeitos colaterais.

- **Diretamente do Registro:**
  Você pode executar a imagem do sandbox publicada diretamente. Isso é útil para ambientes onde você tem apenas o Docker e deseja executar a CLI.
  ```bash
  # Executar a imagem do sandbox publicada
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Usando a flag `--sandbox`:**
  Se você tiver o Qwen Code instalado localmente (usando a instalação padrão descrita acima), poderá instruí-lo a ser executado dentro do contêiner sandbox.
  ```bash
  qwen --sandbox -y -p "seu prompt aqui"
  ```

---

### 3. Executando a partir do código-fonte (Recomendado para contribuidores do Qwen Code)

Contribuidores do projeto vão querer executar o CLI diretamente a partir do código-fonte.

- **Modo de Desenvolvimento:**
  Este método fornece hot-reloading e é útil para desenvolvimento ativo.
  ```bash
  # A partir da raiz do repositório
  npm run start
  ```
- **Modo semelhante à produção (Pacote vinculado):**
  Este método simula uma instalação global ao vincular seu pacote local. É útil para testar uma build local em um fluxo de trabalho de produção.

  ```bash
  # Vincule o pacote cli local aos seus node_modules globais
  npm link packages/cli

  # Agora você pode executar sua versão local usando o comando `qwen`
  qwen
  ```

---

### 4. Executando o último commit do Qwen Code a partir do GitHub

Você pode executar a versão mais recentemente commitada do Qwen Code diretamente do repositório do GitHub. Isso é útil para testar funcionalidades ainda em desenvolvimento.

```bash

# Execute o CLI diretamente do branch principal no GitHub
npx https://github.com/QwenLM/qwen-code
```

## Arquitetura de deployment

Os métodos de execução descritos acima são possíveis graças aos seguintes componentes e processos arquiteturais:

**Pacotes NPM**

O projeto Qwen Code é um monorepo que publica pacotes principais no registro do NPM:

- `@qwen-code/qwen-code-core`: O backend, responsável pela lógica e execução de ferramentas.
- `@qwen-code/qwen-code`: A interface voltada para o usuário.

Esses pacotes são utilizados ao realizar a instalação padrão e ao executar o Qwen Code a partir do código-fonte.

**Processos de build e empacotamento**

Existem dois processos distintos de build, dependendo do canal de distribuição:

- **Publicação no NPM:** Para publicar no registro do NPM, o código-fonte em TypeScript dos pacotes `@qwen-code/qwen-code-core` e `@qwen-code/qwen-code` é transpilado para JavaScript padrão utilizando o TypeScript Compiler (`tsc`). O diretório resultante `dist/` é o que é publicado no pacote do NPM. Este é um método padrão para bibliotecas em TypeScript.

- **Execução via `npx` do GitHub:** Ao executar a versão mais recente do Qwen Code diretamente pelo GitHub, um processo diferente é acionado pelo script `prepare` no `package.json`. Esse script utiliza o `esbuild` para agrupar toda a aplicação e suas dependências em um único arquivo JavaScript autocontido. Esse bundle é criado dinamicamente na máquina do usuário e não é versionado no repositório.

**Imagem Docker sandbox**

O método de execução baseado em Docker é suportado pela imagem de contêiner `qwen-code-sandbox`. Essa imagem é publicada em um registro de contêineres e contém uma versão global pré-instalada do Qwen Code.

## Processo de release

O processo de release é automatizado através do GitHub Actions. O workflow de release executa as seguintes ações:

1.  Constrói os pacotes NPM usando `tsc`.
2.  Publica os pacotes NPM no registro de artefatos.
3.  Cria releases no GitHub com os assets empacotados.