# Execução e Deploy do Qwen Code

Este documento descreve como executar o Qwen Code e explica a arquitetura de deploy utilizada por ele.

## Executando o Qwen Code

Existem várias maneiras de executar o Qwen Code. A opção escolhida depende de como você pretende utilizá-lo.

---

### 1. Instalação padrão (Recomendada para usuários comuns)

Esta é a maneira recomendada para usuários finais instalarem o Qwen Code. Ela envolve baixar o pacote do Qwen Code do registro do NPM.

- **Instalação global:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Em seguida, execute a CLI de qualquer lugar:

  ```bash
  qwen
  ```

- **Execução via NPX:**

  ```bash
  # Executa a versão mais recente do NPM sem uma instalação global
  npx @qwen-code/qwen-code
  ```

---

### 2. Execução em sandbox (Docker/Podman)

Por questões de segurança e isolamento, o Qwen Code pode ser executado dentro de um container. Esta é a forma padrão como a CLI executa ferramentas que podem gerar efeitos colaterais.

- **Diretamente do Registry:**
  Você pode executar a imagem de sandbox publicada diretamente. Isso é útil para ambientes onde você possui apenas o Docker e deseja executar a CLI.
  ```bash
  # Executa a imagem de sandbox publicada
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Usando a flag `--sandbox`:**
  Se você tiver o Qwen Code instalado localmente (usando a instalação padrão descrita acima), poderá instruí-lo a ser executado dentro do container de sandbox.
  ```bash
  qwen --sandbox -y -p "seu prompt aqui"
  ```

---

### 3. Execução a partir do código-fonte (Recomendada para contribuidores do Qwen Code)

Os contribuidores do projeto vão querer executar a CLI diretamente a partir do código-fonte.

- **Modo de desenvolvimento:**
  Este método oferece hot-reloading e é útil para o desenvolvimento ativo.
  ```bash
  # A partir da raiz do repositório
  npm run start
  ```
- **Modo semelhante à produção (Pacote vinculado):**
  Este método simula uma instalação global vinculando seu pacote local. É útil para testar um build local em um fluxo de trabalho de produção.

  ```bash
  # Vincula o pacote cli local ao seu node_modules global
  npm link packages/cli

  # Agora você pode executar sua versão local usando o comando `qwen`
  qwen
  ```

---

### 4. Executando o commit mais recente do Qwen Code no GitHub

Você pode executar a versão mais recente com commit do Qwen Code diretamente do repositório no GitHub. Isso é útil para testar recursos ainda em desenvolvimento.

```bash
# Executa a CLI diretamente da branch main no GitHub
npx https://github.com/QwenLM/qwen-code
```

## Arquitetura de deploy

Os métodos de execução descritos acima são possibilitados pelos seguintes componentes e processos arquiteturais:

**Pacotes NPM**

O projeto Qwen Code é um monorepo que publica pacotes principais no registro do NPM:

- `@qwen-code/qwen-code-core`: O backend, responsável pela lógica e execução de ferramentas.
- `@qwen-code/qwen-code`: O frontend voltado para o usuário.

Esses pacotes são usados ao realizar a instalação padrão e ao executar o Qwen Code a partir do código-fonte.

**Processos de build e empacotamento**

Existem dois processos de build distintos, dependendo do canal de distribuição:

- **Publicação no NPM:** Para publicar no registro do NPM, o código-fonte TypeScript em `@qwen-code/qwen-code-core` e `@qwen-code/qwen-code` é transpilado para JavaScript padrão usando o TypeScript Compiler (`tsc`). O diretório `dist/` resultante é o que é publicado no pacote NPM. Esta é uma abordagem padrão para bibliotecas TypeScript.

- **Execução via `npx` no GitHub:** Ao executar a versão mais recente do Qwen Code diretamente do GitHub, um processo diferente é acionado pelo script `prepare` no `package.json`. Este script usa o `esbuild` para empacotar toda a aplicação e suas dependências em um único arquivo JavaScript autossuficiente. Esse bundle é criado dinamicamente na máquina do usuário e não é commitado no repositório.

**Imagem de sandbox Docker**

O método de execução baseado em Docker é suportado pela imagem de container `qwen-code-sandbox`. Esta imagem é publicada em um registro de containers e contém uma versão global pré-instalada do Qwen Code.

## Processo de release

O processo de release é automatizado por meio do GitHub Actions. O workflow de release executa as seguintes ações:

1.  Faz o build dos pacotes NPM usando `tsc`.
2.  Publica os pacotes NPM no registro de artefatos.
3.  Cria releases no GitHub com os assets empacotados.