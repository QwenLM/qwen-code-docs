# Execução e Implantação do Qwen Code

Este documento descreve como executar o Qwen Code e explica a arquitetura de implantação que o Qwen Code utiliza.

## Executando o Qwen Code

Existem várias maneiras de executar o Qwen Code. A opção escolhida depende de como você pretende usá-lo.

---

### 1. Instalação padrão (Recomendado para usuários típicos)

Esta é a maneira recomendada para usuários finais instalarem o Qwen Code. Envolve baixar o pacote Qwen Code do registro NPM.

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
  # Execute a versão mais recente do NPM sem instalação global
  npx @qwen-code/qwen-code
  ```

---

### 2. Executando em um sandbox (Docker/Podman)

Para segurança e isolamento, o Qwen Code pode ser executado dentro de um contêiner. Esta é a forma padrão como a CLI executa ferramentas que podem ter efeitos colaterais.

- **Diretamente do Registro:**
  Você pode executar a imagem de sandbox publicada diretamente. Isso é útil para ambientes onde você só tem o Docker e deseja executar a CLI.
  ```bash
  # Execute a imagem de sandbox publicada
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Usando a flag `--sandbox`:**
  Se você tiver o Qwen Code instalado localmente (usando a instalação padrão descrita acima), pode instruí-lo a ser executado dentro do contêiner sandbox.
  ```bash
  qwen --sandbox -y -p "seu prompt aqui"
  ```

---

### 3. Executando a partir do código-fonte (Recomendado para contribuidores do Qwen Code)

Os contribuidores do projeto vão querer executar a CLI diretamente do código-fonte.

- **Modo de Desenvolvimento:**
  Este método fornece recarregamento automático (hot-reload) e é útil para desenvolvimento ativo.
  ```bash
  # A partir da raiz do repositório
  npm run start
  ```
- **Modo similar ao de produção (pacote vinculado):**
  Este método simula uma instalação global vinculando seu pacote local. É útil para testar uma build local em um fluxo de trabalho de produção.

  ```bash
  # Vincule o pacote cli local ao seu node_modules global
  npm link packages/cli

  # Agora você pode executar sua versão local usando o comando `qwen`
  qwen
  ```

---

### 4. Executando o commit mais recente do Qwen Code do GitHub

Você pode executar a versão mais recentemente commitada do Qwen Code diretamente do repositório GitHub. Isso é útil para testar funcionalidades ainda em desenvolvimento.

```bash
# Execute a CLI diretamente do branch main no GitHub
npx https://github.com/QwenLM/qwen-code
```

## Arquitetura de implantação

Os métodos de execução descritos acima são possíveis graças aos seguintes componentes e processos arquiteturais:

**Pacotes NPM**

O projeto Qwen Code é um monorepo que publica pacotes principais no registro NPM:

- `@qwen-code/qwen-code-core`: O backend, responsável pela lógica e execução de ferramentas.
- `@qwen-code/qwen-code`: O frontend voltado para o usuário.

Esses pacotes são usados ao realizar a instalação padrão e ao executar o Qwen Code a partir do código-fonte.

**Processos de build e empacotamento**

Existem dois processos de build distintos usados, dependendo do canal de distribuição:

- **Publicação no NPM:** Para publicação no registro NPM, o código-fonte TypeScript em `@qwen-code/qwen-code-core` e `@qwen-code/qwen-code` é transpilado para JavaScript padrão usando o TypeScript Compiler (`tsc`). O diretório `dist/` resultante é o que é publicado no pacote NPM. Esta é uma abordagem padrão para bibliotecas TypeScript.

- **Execução via `npx` do GitHub:** Ao executar a versão mais recente do Qwen Code diretamente do GitHub, um processo diferente é acionado pelo script `prepare` no `package.json`. Este script usa `esbuild` para empacotar toda a aplicação e suas dependências em um único arquivo JavaScript autocontido. Esse bundle é criado dinamicamente na máquina do usuário e não é versionado no repositório.

**Imagem de sandbox Docker**

O método de execução baseado em Docker é suportado pela imagem de contêiner `qwen-code-sandbox`. Esta imagem é publicada em um registro de contêineres e contém uma versão global pré-instalada do Qwen Code.

## Processo de release

O processo de release é automatizado por meio do GitHub Actions. O fluxo de trabalho de release realiza as seguintes ações:

1.  Build dos pacotes NPM usando `tsc`.
2.  Publicação dos pacotes NPM no registro de artefatos.
3.  Criação de releases no GitHub com assets empacotados.