# Visão Geral do Pacote

Este monorepo contém dois pacotes principais: `@qwen-code/qwen-code` e `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Este é o pacote principal do Qwen Code. Ele é responsável pela interface de usuário, análise de comandos e todas as demais funcionalidades voltadas ao usuário.

Quando este pacote é publicado, ele é empacotado em um único arquivo executável. Esse pacote inclui todas as dependências do pacote, incluindo `@qwen-code/qwen-code-core`. Isso significa que, independentemente de o usuário instalar o pacote com `npm install -g @qwen-code/qwen-code` ou executá-lo diretamente com `npx @qwen-code/qwen-code`, ele estará utilizando esse único executável autocontido.

## `@qwen-code/qwen-code-core`

Este pacote contém a lógica principal da CLI. Ele é responsável por fazer requisições à API para os provedores configurados, lidar com autenticação e gerenciar o cache local.

Este pacote não é empacotado (bundled). Ao ser publicado, ele é disponibilizado como um pacote padrão do Node.js, com suas próprias dependências. Isso permite que ele seja usado como um pacote independente em outros projetos, se necessário. Todo o código JavaScript transpilado na pasta `dist` é incluído no pacote.

# Processo de Lançamento

Este projeto segue um processo de lançamento estruturado para garantir que todos os pacotes sejam versionados e publicados corretamente. O processo é projetado para ser o mais automatizado possível.

## Como Lançar

Os lançamentos são gerenciados por meio do fluxo de trabalho do GitHub Actions [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml). Para realizar um lançamento manual de uma correção ou hotfix:

1.  Acesse a aba **Actions** (Ações) do repositório.
2.  Selecione o fluxo de trabalho **Release** (Lançamento) na lista.
3.  Clique no botão suspenso **Run workflow** (Executar fluxo de trabalho).
4.  Preencha as entradas obrigatórias:
    - **Version** (Versão): A versão exata a ser lançada (por exemplo, `v0.2.1`).
    - **Ref** (Referência): O branch ou o SHA do commit a partir do qual o lançamento será feito (o padrão é `main`).
    - **Dry Run** (Simulação): Deixe como `true` para testar o fluxo de trabalho sem publicar, ou defina como `false` para executar um lançamento real.
5.  Clique em **Run workflow** (Executar fluxo de trabalho).

## Tipos de Lançamento

O projeto suporta vários tipos de lançamento:

### Lançamentos Estáveis

Lançamentos estáveis regulares destinados ao uso em produção.

### Lançamentos Pré-visualização

Lançamentos pré-visualização semanais toda terça-feira às 23:59 UTC, para acesso antecipado a novos recursos.

### Lançamentos Noturnos

Lançamentos noturnos diários à meia-noite (UTC) para testes de desenvolvimento de ponta.

## Cronograma Automatizado de Lançamentos

- **Noturno**: Todos os dias à meia-noite (UTC)  
- **Pré-visualização**: Todas as terças-feiras às 23:59 (UTC)  
- **Estável**: Lançamentos manuais acionados pelos mantenedores

### Como Usar os Diferentes Tipos de Lançamento

Para instalar a versão mais recente de cada tipo:

```bash

# Estável (padrão)
npm install -g @qwen-code/qwen-code

# Pré-visualização
npm install -g @qwen-code/qwen-code@preview

# Noturno
npm install -g @qwen-code/qwen-code@nightly
```

### Detalhes do Processo de Lançamento

Todo lançamento agendado ou manual segue estas etapas:

1.  Obtém o código especificado (última versão do ramo `main` ou commit específico).
2.  Instala todas as dependências.
3.  Executa toda a suíte de verificações `preflight` e testes de integração.
4.  Se todos os testes forem bem-sucedidos, calcula o número de versão apropriado com base no tipo de lançamento.
5.  Compila e publica os pacotes no npm com a dist-tag apropriada.
6.  Cria um lançamento no GitHub para essa versão.

### Tratamento de Falhas

Se qualquer etapa do fluxo de trabalho de lançamento falhar, será criado automaticamente um novo problema no repositório com as etiquetas `bug` e uma etiqueta específica para o tipo de falha (por exemplo, `nightly-failure`, `preview-failure`). O problema conterá um link para a execução falhada do fluxo de trabalho, facilitando a depuração.

## Validação da Versão

Após publicar uma nova versão, é necessário realizar testes básicos (*smoke testing*) para garantir que os pacotes estão funcionando conforme o esperado. Isso pode ser feito instalando os pacotes localmente e executando um conjunto de testes para verificar se eles estão operando corretamente.

- `npx -y @qwen-code/qwen-code@latest --version` para validar se a publicação ocorreu conforme o esperado (caso você não esteja usando uma tag `rc` ou `dev`)
- `npx -y @qwen-code/qwen-code@<tag-da-versão> --version` para validar se a tag foi publicada corretamente
- _Esta ação é destrutiva localmente_: `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<versão>`
- Recomenda-se realizar testes básicos (*smoke testing*) executando alguns comandos e ferramentas de LLM para garantir que os pacotes estão funcionando conforme o esperado. Formalizaremos esse processo mais adiante.

## Quando mesclar a alteração de versão — ou não?

O padrão descrito acima para criar versões *patch* ou *hotfix* a partir de commits atuais ou anteriores deixa o repositório no seguinte estado:

1.  A *tag* (`vX.Y.Z-patch.1`): Essa *tag* aponta corretamente para o commit original na branch `main` que contém o código estável que você pretendeu publicar. Isso é crucial. Qualquer pessoa que fizer *checkout* dessa *tag* obterá exatamente o código que foi publicado.
2.  A branch (`release-vX.Y.Z-patch.1`): Essa branch contém um novo commit em cima do commit marcado pela *tag*. Esse novo commit contém apenas a alteração do número da versão no arquivo `package.json` (e em outros arquivos relacionados, como `package-lock.json`).

Essa separação é vantajosa, pois mantém o histórico da branch `main` limpo de atualizações de versão específicas de lançamento até que você decida mesclá-las.

Essa é a decisão crítica — e ela depende inteiramente da natureza do lançamento.

### Mesclar de volta para correções estáveis e correções emergenciais

Você quase sempre deseja mesclar a branch `release-<tag>` de volta para `main` ao fazer qualquer lançamento de correção estável ou correção emergencial.

- Por quê? O motivo principal é atualizar a versão no arquivo `package.json` da branch `main`. Se você lançar a versão `v1.2.1` a partir de um commit mais antigo, mas nunca mesclar essa atualização de versão de volta, o arquivo `package.json` da sua branch `main` continuará indicando `"version": "1.2.0"`. O próximo desenvolvedor que iniciar o trabalho para o próximo lançamento de funcionalidades (`v1.3.0`) fará o *branch* a partir de uma base de código com um número de versão incorreto e desatualizado. Isso gera confusão e exige a atualização manual da versão posteriormente.
- O processo: Após a criação da branch `release-v1.2.1` e a publicação bem-sucedida do pacote, você deve abrir uma *pull request* para mesclar `release-v1.2.1` na branch `main`. Essa *pull request* conterá apenas um único *commit*: `"chore: bump version to v1.2.1"`. Trata-se de uma integração limpa e simples que mantém sua branch `main` sincronizada com a versão mais recente lançada.

### NÃO FAÇA MERGE DE VOLTA PARA PRÉ-LANÇAMENTOS (RC, Beta, Dev)

Normalmente, você não faz o merge de branches de lançamento para pré-lançamentos de volta para `main`.

- Por quê? Versões pré-lançamento (por exemplo, v1.3.0-rc.1, v1.3.0-rc.2) são, por definição, instáveis e temporárias. Você não quer poluir o histórico da sua branch `main` com uma série de atualizações de versão para *release candidates*. O arquivo `package.json` em `main` deve refletir a versão mais recente estável, não um RC.
- O processo: A branch `release-v1.3.0-rc.1` é criada, o comando `npm publish --tag rc` é executado e, então... a branch cumpriu seu propósito. Você pode simplesmente excluí-la. O código para o RC já está em `main` (ou em uma branch de funcionalidade), portanto nenhum código funcional é perdido. A branch de lançamento foi apenas um veículo temporário para o número da versão.

## Testes e Validação Locais: Alterações no Processo de Empacotamento e Publicação

Se você precisar testar o processo de lançamento sem realmente publicar no NPM ou criar um lançamento público no GitHub, poderá acionar o fluxo de trabalho manualmente pela interface do GitHub.

1.  Acesse a [guia Ações](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) do repositório.
2.  Clique no menu suspenso "Executar fluxo de trabalho".
3.  Mantenha a opção `dry_run` marcada (`true`).
4.  Clique no botão "Executar fluxo de trabalho".

Isso executará todo o processo de lançamento, mas pulará as etapas `npm publish` e `gh release create`. Você pode inspecionar os logs do fluxo de trabalho para garantir que tudo está funcionando conforme o esperado.

É fundamental testar localmente quaisquer alterações no processo de empacotamento e publicação antes de confirmá-las. Isso garante que os pacotes sejam publicados corretamente e que funcionem conforme o esperado quando instalados por um usuário.

Para validar suas alterações, você pode executar uma simulação (dry run) do processo de publicação. Isso simulará o processo de publicação sem efetivamente publicar os pacotes no registro npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Este comando fará o seguinte:

1.  Compilará todos os pacotes.
2.  Executará todos os scripts de preparação para publicação (prepublish).
3.  Criará os arquivos tarball dos pacotes que seriam publicados no npm.
4.  Exibirá um resumo dos pacotes que seriam publicados.

Você poderá então inspecionar os arquivos tarball gerados para garantir que contenham os arquivos corretos e que os arquivos `package.json` tenham sido atualizados corretamente. Os arquivos tarball serão criados na raiz do diretório de cada pacote (por exemplo, `packages/cli/qwen-code-0.1.6.tgz`).

Ao executar uma simulação (dry run), você poderá ter certeza de que suas alterações no processo de empacotamento estão corretas e que os pacotes serão publicados com sucesso.

## Análise Detalhada do Lançamento

O principal objetivo do processo de lançamento é pegar o código-fonte do diretório `packages/`, compilá-lo e montar um pacote limpo e autocontido em um diretório temporário `dist` na raiz do projeto. Esse diretório `dist` é o que efetivamente é publicado no NPM.

A seguir estão as etapas principais:

Etapa 1: Verificações de Integridade Pré-Lançamento e Gerenciamento de Versões

- O que acontece: Antes de qualquer arquivo ser movido, o processo garante que o projeto esteja em um estado saudável. Isso envolve executar testes, verificação de estilo (linting) e checagem de tipos (npm run preflight). O número da versão no `package.json` da raiz e no `packages/cli/package.json` é atualizado para a nova versão de lançamento.
- Por quê: Isso garante que apenas código de alta qualidade e funcional seja lançado. O gerenciamento de versões é o primeiro passo para indicar um novo lançamento.

Etapa 2: Compilação do Código-Fonte

- O que acontece: O código-fonte TypeScript nos diretórios `packages/core/src` e `packages/cli/src` é compilado para JavaScript.
- Movimentação de arquivos:
  - `packages/core/src/**/*.ts` → compilado para → `packages/core/dist/`
  - `packages/cli/src/**/*.ts` → compilado para → `packages/cli/dist/`
- Por quê: O código TypeScript escrito durante o desenvolvimento precisa ser convertido em JavaScript puro, que pode ser executado pelo Node.js. O pacote `core` é compilado primeiro, pois o pacote `cli` depende dele.

Etapa 3: Empacotamento e Montagem do Pacote Final Publicável

Essa é a etapa mais crítica, na qual os arquivos são movidos e transformados em seu estado final para publicação. O processo utiliza técnicas modernas de empacotamento para criar o pacote final.

1.  Criação do Pacote de Distribuição:
    - O que acontece: O script `prepare-package.js` cria um pacote de distribuição limpo no diretório `dist`.
    - Principais transformações:
      - Copia `README.md` e `LICENSE` para `dist/`
      - Copia a pasta `locales` para suporte à internacionalização
      - Cria um `package.json` limpo para distribuição, contendo apenas as dependências necessárias
      - Mantém as dependências de distribuição ao mínimo (sem dependências de tempo de execução embutidas)
      - Preserva dependências opcionais para `node-pty`

2.  Criação do Pacote JavaScript:
    - O que acontece: O JavaScript compilado dos diretórios `packages/core/dist` e `packages/cli/dist` é empacotado em um único arquivo JavaScript executável usando `esbuild`.
    - Localização do arquivo: `dist/cli.js`
    - Por quê: Isso gera um único arquivo otimizado contendo todo o código da aplicação necessário. Simplifica o pacote, eliminando a necessidade de resolução complexa de dependências no momento da instalação.

3.  Cópia de Arquivos Estáticos e Auxiliares:
    - O que acontece: Arquivos essenciais — que não fazem parte do código-fonte, mas são necessários para o correto funcionamento ou boa documentação do pacote — são copiados para o diretório `dist`.
    - Movimentação de arquivos:
      - `README.md` → `dist/README.md`
      - `LICENSE` → `dist/LICENSE`
      - `locales/` → `dist/locales/`
      - Arquivos de fornecedor (vendor) → `dist/vendor/`
    - Por quê:
      - `README.md` e `LICENSE` são arquivos padrão que devem estar presentes em qualquer pacote NPM.
      - A pasta `locales` suporta recursos de internacionalização.
      - Os arquivos de fornecedor contêm dependências de tempo de execução necessárias.

Etapa 4: Publicação no NPM

- O que acontece: O comando `npm publish` é executado a partir do diretório `dist` na raiz do projeto.
- Por quê: Ao executar `npm publish` dentro do diretório `dist`, apenas os arquivos cuidadosamente montados na Etapa 3 são enviados ao registro NPM. Isso evita que código-fonte, arquivos de teste ou configurações de desenvolvimento sejam publicados acidentalmente, resultando em um pacote limpo e minimalista para os usuários.

Esse processo garante que o artefato final publicado seja uma representação intencional, limpa e eficiente do projeto, e não uma cópia direta do ambiente de desenvolvimento.

## Espaços de trabalho NPM

Este projeto usa [Espaços de trabalho NPM](https://docs.npmjs.com/cli/v10/using-npm/workspaces) para gerenciar os pacotes dentro deste monorepo. Isso simplifica o desenvolvimento, permitindo gerenciar dependências e executar scripts em vários pacotes diretamente da raiz do projeto.

### Como funciona

O arquivo `package.json` na raiz define os espaços de trabalho deste projeto:

```json
{
  "workspaces": ["packages/*"]
}
```

Isso informa ao NPM que qualquer pasta dentro do diretório `packages` é um pacote separado que deve ser gerenciado como parte do espaço de trabalho.

### Benefícios dos Espaços de Trabalho

- **Gerenciamento Simplificado de Dependências**: Executar `npm install` na raiz do projeto instalará todas as dependências de todos os pacotes no espaço de trabalho e as vinculará entre si. Isso significa que você não precisa executar `npm install` no diretório de cada pacote.
- **Vinculação Automática**: Pacotes dentro do espaço de trabalho podem depender uns dos outros. Ao executar `npm install`, o NPM criará automaticamente links simbólicos entre os pacotes. Isso significa que, ao fazer alterações em um pacote, essas alterações ficam imediatamente disponíveis para os outros pacotes que dele dependem.
- **Execução Simplificada de Scripts**: Você pode executar scripts em qualquer pacote a partir da raiz do projeto usando a flag `--workspace`. Por exemplo, para executar o script `build` no pacote `cli`, execute `npm run build --workspace @qwen-code/qwen-code`.