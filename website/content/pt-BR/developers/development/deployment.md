# Execução e Implantação do Qwen Code

Este documento descreve como executar o Qwen Code e explica a arquitetura de implantação utilizada pelo Qwen Code.

## Executando o Qwen Code

Há várias maneiras de executar o Qwen Code. A opção que você escolher depende de como pretende usá-lo.

---

### 1. Instalação padrão (Recomendada para usuários típicos)

Esta é a maneira recomendada para usuários finais instalarem o Qwen Code. Envolve baixar o pacote Qwen Code do registro NPM.

- **Instalação global:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Em seguida, execute a CLI de qualquer lugar:

  ```bash
  qwen
  ```

- **Execução com NPX:**

  ```bash
  # Execute a versão mais recente do NPM sem instalação global
  npx @qwen-code/qwen-code
  ```

### 2. Executando em um ambiente isolado (Docker/Podman)

Para segurança e isolamento, o Qwen Code pode ser executado dentro de um contêiner. Essa é a forma padrão como a CLI executa ferramentas que possam ter efeitos colaterais.

- **Diretamente do Registro:**
  Você pode executar a imagem publicada do ambiente isolado diretamente. Isso é útil em ambientes onde você tem apenas o Docker instalado e deseja executar a CLI.
  ```bash
  # Executa a imagem publicada do ambiente isolado
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Usando a flag `--sandbox`:**
  Se você tiver o Qwen Code instalado localmente (usando a instalação padrão descrita acima), poderá instruí-lo a executar dentro do contêiner do ambiente isolado.
  ```bash
  qwen --sandbox -y -p "seu prompt aqui"
  ```

### 3. Executando a partir do código-fonte (Recomendado para colaboradores do Qwen Code)

Colaboradores do projeto desejam executar a CLI diretamente a partir do código-fonte.

- **Modo de desenvolvimento:**
  Esse método fornece recarga automática (*hot-reloading*) e é útil durante o desenvolvimento ativo.
  ```bash
  # A partir da raiz do repositório
  npm run start
  ```
- **Modo semelhante ao de produção (pacote vinculado):**
  Esse método simula uma instalação global vinculando seu pacote local. É útil para testar uma compilação local em um fluxo de trabalho de produção.

  ```bash
  # Vincule o pacote local da CLI ao seu diretório global `node_modules`
  npm link packages/cli

  # Agora você pode executar sua versão local usando o comando `qwen`
  qwen
  ```

---

### 4. Executando o commit mais recente do Qwen Code do GitHub

Você pode executar diretamente a versão mais recentemente confirmada (*committed*) do Qwen Code a partir do repositório no GitHub. Isso é útil para testar recursos ainda em desenvolvimento.

```bash

# Executar a CLI diretamente do branch principal no GitHub
npx https://github.com/QwenLM/qwen-code

## Arquitetura de implantação

Os métodos de execução descritos acima são possíveis graças aos seguintes componentes arquiteturais e processos:

**Pacotes NPM**

O projeto Qwen Code é um monorepo que publica pacotes principais no registro NPM:

- `@qwen-code/qwen-code-core`: O backend, responsável pela lógica e pela execução de ferramentas.
- `@qwen-code/qwen-code`: O frontend voltado para o usuário.

Esses pacotes são utilizados tanto durante a instalação padrão quanto ao executar o Qwen Code diretamente da fonte.

**Processos de compilação e empacotamento**

Há dois processos distintos de compilação, dependendo do canal de distribuição:

- **Publicação no NPM:** Para publicar no registro NPM, o código-fonte em TypeScript dos pacotes `@qwen-code/qwen-code-core` e `@qwen-code/qwen-code` é transpilado para JavaScript padrão usando o Compilador TypeScript (`tsc`). O diretório resultante `dist/` é o que é publicado no pacote NPM. Trata-se de uma abordagem padrão para bibliotecas escritas em TypeScript.

- **Execução via `npx` no GitHub:** Ao executar a versão mais recente do Qwen Code diretamente do GitHub, um processo diferente é acionado pelo script `prepare` no arquivo `package.json`. Esse script usa o `esbuild` para empacotar toda a aplicação e suas dependências em um único arquivo JavaScript autocontido. Esse pacote é gerado dinamicamente na máquina do usuário e não é incluído no repositório.

**Imagem Docker do sandbox**

O método de execução baseado em Docker é suportado pela imagem de contêiner `qwen-code-sandbox`. Essa imagem é publicada em um registro de contêineres e contém uma versão global pré-instalada do Qwen Code.

## Processo de lançamento

O processo de lançamento é automatizado por meio do GitHub Actions. O fluxo de trabalho de lançamento executa as seguintes ações:

1.  Compila os pacotes NPM usando `tsc`.
2.  Publica os pacotes NPM no registro de artefatos.
3.  Cria versões no GitHub com os ativos agrupados.