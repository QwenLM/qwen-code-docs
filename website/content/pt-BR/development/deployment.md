# Execução e Deploy do Qwen Code

Este documento descreve como rodar o Qwen Code e explica a arquitetura de deploy utilizada pelo Qwen Code.

## Rodando o Qwen Code

Existem várias formas de rodar o Qwen Code. A opção que você escolher depende de como pretende usá-lo.

---

### 1. Instalação padrão (Recomendado para usuários comuns)

Esta é a forma recomendada para usuários finais instalarem o Qwen Code. Envolve baixar o pacote do Qwen Code do registro do NPM.

- **Instalação global:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Depois, execute o CLI de qualquer lugar:

  ```bash
  qwen
  ```

- **Execução via NPX:**

  ```bash
  # Executa a última versão do NPM sem instalar globalmente
  npx @qwen-code/qwen-code
  ```

---

### 2. Executando em um sandbox (Docker/Podman)

Para segurança e isolamento, o Qwen Code pode ser executado dentro de um container. Essa é a forma padrão como a CLI executa ferramentas que podem ter efeitos colaterais.

- **Diretamente do Registry:**
  Você pode executar a imagem publicada do sandbox diretamente. Isso é útil para ambientes onde você tem apenas o Docker e quer rodar a CLI.
  ```bash
  # Executar a imagem publicada do sandbox
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Usando a flag `--sandbox`:**
  Se você tiver o Qwen Code instalado localmente (usando a instalação padrão descrita acima), poderá instruí-lo para rodar dentro do container sandbox.
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
- **Modo semelhante à produção (Pacote linkado):**
  Este método simula uma instalação global ao linkar seu pacote local. É útil para testar uma build local em um workflow de produção.

  ```bash
  # Linka o pacote cli local para seus node_modules globais
  npm link packages/cli

  # Agora você pode executar sua versão local usando o comando `qwen`
  qwen
  ```

---

### 4. Executando o último commit do Qwen Code do GitHub

Você pode executar a versão mais recentemente commitada do Qwen Code diretamente do repositório do GitHub. Isso é útil para testar features que ainda estão em desenvolvimento.

```bash

# Execute o CLI diretamente da branch principal no GitHub
npx https://github.com/QwenLM/qwen-code
```

## Arquitetura de deployment

Os métodos de execução descritos acima são possíveis graças aos seguintes componentes e processos arquiteturais:

**Pacotes NPM**

O projeto Qwen Code é um monorepo que publica pacotes principais no registry do NPM:

- `@qwen-code/qwen-code-core`: O backend, responsável pela lógica e execução de ferramentas.
- `@qwen-code/qwen-code`: O frontend voltado ao usuário.

Esses pacotes são utilizados tanto durante a instalação padrão quanto ao executar o Qwen Code a partir do código-fonte.

**Processos de build e empacotamento**

Existem dois processos distintos de build, dependendo do canal de distribuição:

- **Publicação no NPM:** Para publicar no registry do NPM, o código-fonte TypeScript em `@qwen-code/qwen-code-core` e `@qwen-code/qwen-code` é transpilado para JavaScript padrão usando o TypeScript Compiler (`tsc`). O diretório `dist/` resultante é o que é publicado no pacote NPM. Este é um processo padrão para bibliotecas TypeScript.

- **Execução via `npx` do GitHub:** Ao executar a versão mais recente do Qwen Code diretamente do GitHub, um processo diferente é acionado pelo script `prepare` no `package.json`. Esse script utiliza o `esbuild` para empacotar toda a aplicação e suas dependências em um único arquivo JavaScript autocontido. Esse bundle é criado dinamicamente na máquina do usuário e não é versionado no repositório.

**Imagem Docker sandbox**

O método de execução baseado em Docker é suportado pela imagem de container `qwen-code-sandbox`. Essa imagem é publicada em um registry de containers e contém uma versão global pré-instalada do Qwen Code.

## Processo de release

O processo de release é automatizado através do GitHub Actions. O workflow de release executa as seguintes ações:

1.  Build dos pacotes NPM usando `tsc`.
2.  Publicação dos pacotes NPM no artifact registry.
3.  Criação de releases no GitHub com os assets empacotados.