# Visão Geral do Pacote

Este monorepo contém dois pacotes principais: `@qwen-code/qwen-code` e `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Este é o pacote principal para o Qwen Code. Ele é responsável pela interface do usuário, análise de comandos e todas as outras funcionalidades voltadas ao usuário.

Quando este pacote é publicado, ele é agrupado em um único arquivo executável. Este pacote inclui todas as dependências do pacote, incluindo `@qwen-code/qwen-code-core`. Isso significa que, quer um usuário instale o pacote com `npm install -g @qwen-code/qwen-code` ou o execute diretamente com `npx @qwen-code/qwen-code`, ele estará usando este único executável autocontido.

## `@qwen-code/qwen-code-core`

Este pacote contém a lógica central para o CLI. Ele é responsável por fazer requisições de API para provedores configurados, lidar com autenticação e gerenciar o cache local.

Este pacote não é empacotado. Quando é publicado, é publicado como um pacote Node.js padrão com suas próprias dependências. Isso permite que ele seja usado como um pacote independente em outros projetos, se necessário. Todo o código js transpilado na pasta `dist` está incluído no pacote.

# Processo de Release

Este projeto segue um processo de release estruturado para garantir que todos os pacotes sejam versionados e publicados corretamente. O processo foi projetado para ser o mais automatizado possível.

## Como Realizar um Release

Os releases são gerenciados por meio do workflow do GitHub Actions [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml). Para realizar um release manual de uma correção ou hotfix:

1.  Navegue até a aba **Actions** do repositório.
2.  Selecione o workflow **Release** na lista.
3.  Clique no botão dropdown **Run workflow**.
4.  Preencha os campos obrigatórios:
    - **Version**: A versão exata a ser lançada (ex.: `v0.2.1`).
    - **Ref**: O branch ou commit SHA a partir do qual será feito o release (o padrão é `main`).
    - **Dry Run**: Deixe como `true` para testar o workflow sem publicar, ou defina como `false` para realizar um release real.
5.  Clique em **Run workflow**.

## Tipos de Release

O projeto suporta múltiplos tipos de releases:

### Releases Estáveis

Releases estáveis regulares para uso em produção.

### Releases de Prévia

Releases de prévia semanais todas às terças-feiras às 23:59 UTC para acesso antecipado a novas funcionalidades.

### Versões Noturnas

Lançamentos noturnos diários à meia-noite UTC para testes de desenvolvimento de última geração.

## Cronograma de Lançamentos Automatizados

- **Noturno**: Todos os dias à meia-noite UTC
- **Prévia**: Toda terça-feira às 23:59 UTC
- **Estável**: Lançamentos manuais acionados pelos mantenedores

### Como Usar Diferentes Tipos de Lançamento

Para instalar a versão mais recente de cada tipo:

```bash

# Estável (padrão)
npm install -g @qwen-code/qwen-code

# Prévia
npm install -g @qwen-code/qwen-code@preview

# Noturno
npm install -g @qwen-code/qwen-code@nightly
```

### Detalhes do Processo de Release

Cada release agendado ou manual segue estas etapas:

1.  Faz checkout do código especificado (último da branch `main` ou commit específico).
2.  Instala todas as dependências.
3.  Executa a suite completa de verificações `preflight` e testes de integração.
4.  Se todos os testes forem bem-sucedidos, calcula o número de versão apropriado com base no tipo de release.
5.  Compila e publica os pacotes no npm com a dist-tag apropriada.
6.  Cria um GitHub Release para a versão.

### Tratamento de Falhas

Se qualquer etapa no fluxo de trabalho de release falhar, será criada automaticamente uma nova issue no repositório com as labels `bug` e uma label específica de falha por tipo (por exemplo, `nightly-failure`, `preview-failure`). A issue conterá um link para a execução do workflow que falhou, facilitando a depuração.

## Validação de Release

Após publicar uma nova release, deve-se realizar testes de smoke testing para garantir que os pacotes estejam funcionando conforme o esperado. Isso pode ser feito instalando os pacotes localmente e executando um conjunto de testes para verificar se estão operando corretamente.

- `npx -y @qwen-code/qwen-code@latest --version` para validar se o push funcionou como esperado, caso você não esteja utilizando uma tag rc ou dev
- `npx -y @qwen-code/qwen-code@<release tag> --version` para validar se a tag foi publicada adequadamente
- _Isso é destrutivo localmente_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`
- É recomendado realizar um smoke testing básico, executando alguns comandos e ferramentas de LLM para garantir que os pacotes estejam funcionando conforme o esperado. Iremos formalizar isso mais no futuro.

## Quando fazer o merge da alteração de versão, ou não?

O padrão acima para criar releases de patch ou hotfix a partir de commits atuais ou antigos deixa o repositório no seguinte estado:

1.  A Tag (`vX.Y.Z-patch.1`): Esta tag aponta corretamente para o commit original na branch main
    que contém o código estável que você pretendia lançar. Isso é crucial. Qualquer pessoa que fizer
    checkout desta tag obtém exatamente o código que foi publicado.
2.  A Branch (`release-vX.Y.Z-patch.1`): Esta branch contém um novo commit acima do
    commit marcado. Esse novo commit contém apenas a alteração do número da versão no package.json
    (e outros arquivos relacionados como package-lock.json).

Essa separação é boa. Ela mantém o histórico da sua branch principal limpo de aumentos de versão
específicos do release até que você decida fazer o merge deles.

Esta é a decisão crítica, e depende inteiramente da natureza do release.

### Merge Back para Patches Estáveis e Hotfixes

Você quase sempre deve fazer o merge da branch `release-<tag>` de volta para `main` para qualquer
patch estável ou release de hotfix.

- Por quê? O principal motivo é atualizar a versão no package.json do main. Se você lançar
  v1.2.1 a partir de um commit mais antigo mas nunca fizer o merge da atualização de versão de volta,
  o package.json da sua branch main ainda dirá "version": "1.2.0". O próximo desenvolvedor que começar
  a trabalhar na próxima release de feature (v1.3.0) estará criando uma branch a partir de uma base
  de código que tem um número de versão incorreto e desatualizado. Isso gera confusão e requer
  atualização manual da versão posteriormente.
- O Processo: Após a branch release-v1.2.1 ser criada e o pacote ser publicado com sucesso,
  você deve abrir um pull request para fazer o merge de release-v1.2.1 em main. Este PR
  conterá apenas um commit: "chore: bump version to v1.2.1". É uma integração limpa e simples
  que mantém sua branch main sincronizada com a última versão lançada.

### NÃO Faça Merge de Volta para Pré-Lançamentos (RC, Beta, Dev)

Normalmente você não faz merge das branches de release para pré-lançamentos de volta para `main`.

- Por quê? Versões de pré-lançamento (ex.: v1.3.0-rc.1, v1.3.0-rc.2) são, por definição, instáveis e temporárias. Você não quer poluir o histórico da sua branch principal com uma série de atualizações de versão para candidatos a release. O package.json em main deve refletir a versão mais recente estável, e não um RC.
- O processo: A branch release-v1.3.0-rc.1 é criada, o npm publish --tag rc acontece e então... a branch cumpriu seu propósito. Você pode simplesmente excluí-la. O código do RC já está em main (ou em uma branch de feature), então nenhum código funcional é perdido. A branch de release foi apenas um veículo temporário para o número da versão.

## Teste e Validação Local: Alterações no Processo de Empacotamento e Publicação

Se você precisar testar o processo de release sem realmente publicar no NPM ou criar uma release pública no GitHub, poderá acionar o workflow manualmente pela interface do GitHub.

1.  Acesse a [aba Actions](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) do repositório.
2.  Clique no dropdown "Run workflow".
3.  Mantenha a opção `dry_run` marcada (`true`).
4.  Clique no botão "Run workflow".

Isso executará todo o processo de release, mas pulará as etapas de `npm publish` e `gh release create`. Você pode inspecionar os logs do workflow para garantir que tudo está funcionando conforme o esperado.

É fundamental testar localmente quaisquer alterações no processo de empacotamento e publicação antes de fazer commit delas. Isso garante que os pacotes sejam publicados corretamente e que funcionem como esperado quando instalados por um usuário.

Para validar suas alterações, você pode realizar uma simulação (dry run) do processo de publicação. Isso simulará o processo de publicação sem efetivamente publicar os pacotes no registro do npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Este comando fará o seguinte:

1.  Compilará todos os pacotes.
2.  Executará todos os scripts de prepublish.
3.  Criará os arquivos tarball dos pacotes que seriam publicados no npm.
4.  Exibirá um resumo dos pacotes que seriam publicados.

Você pode então inspecionar os tarballs gerados para garantir que contenham os arquivos corretos e que os arquivos `package.json` tenham sido atualizados adequadamente. Os tarballs serão criados na raiz do diretório de cada pacote (por exemplo, `packages/cli/qwen-code-0.1.6.tgz`).

Ao realizar uma simulação, você pode ter confiança de que suas alterações no processo de empacotamento estão corretas e que os pacotes serão publicados com sucesso.

## Análise Profunda do Release

O objetivo principal do processo de release é pegar o código-fonte do diretório packages/, compilá-lo e montar um pacote limpo e autocontido em um diretório temporário `dist` na raiz do projeto. Este diretório `dist` é o que realmente é publicado no NPM.

Aqui estão as etapas principais:

Etapa 1: Verificações de Sanidade e Versionamento Pré-Release

- O que acontece: Antes que qualquer arquivo seja movido, o processo garante que o projeto esteja em bom estado. Isso envolve executar testes, linting e verificação de tipos (npm run preflight). O número da versão no package.json raiz e em packages/cli/package.json é atualizado para a nova versão de release.
- Por quê: Isso garante que apenas código de alta qualidade e funcional seja liberado. O versionamento é o primeiro passo para sinalizar uma nova release.

Etapa 2: Compilação do Código-Fonte

- O que acontece: O código-fonte TypeScript em packages/core/src e packages/cli/src é compilado em JavaScript.
- Movimentação de arquivos:
  - packages/core/src/\*_/_.ts -> compilado para -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> compilado para -> packages/cli/dist/
- Por quê: O código TypeScript escrito durante o desenvolvimento precisa ser convertido em JavaScript simples que pode ser executado pelo Node.js. O pacote core é construído primeiro pois o pacote cli depende dele.

Etapa 3: Empacotamento e Montagem do Pacote Final Publicável

Esta é a etapa mais crítica onde os arquivos são movidos e transformados em seu estado final para publicação. O processo utiliza técnicas modernas de bundling para criar o pacote final.

1.  Criação do Bundle:
    - O que acontece: O script prepare-package.js cria um pacote de distribuição limpo no diretório `dist`.
    - Transformações principais:
      - Copia README.md e LICENSE para dist/
      - Copia a pasta locales para internacionalização
      - Cria um package.json limpo para distribuição com apenas as dependências necessárias
      - Inclui dependências de runtime como tiktoken
      - Mantém dependências opcionais para node-pty

2.  O Bundle JavaScript é Criado:
    - O que acontece: O JavaScript compilado de ambos packages/core/dist e packages/cli/dist é empacotado em um único arquivo JavaScript executável usando esbuild.
    - Local do arquivo: dist/cli.js
    - Por quê: Isso cria um único arquivo otimizado que contém todo o código de aplicação necessário. Simplifica o pacote removendo a necessidade de resolução complexa de dependências no momento da instalação.

3.  Arquivos Estáticos e de Suporte são Copiados:
    - O que acontece: Arquivos essenciais que não fazem parte do código-fonte mas são necessários para o funcionamento correto do pacote ou para descrevê-lo adequadamente são copiados para o diretório `dist`.
    - Movimentação de arquivos:
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Arquivos Vendor -> dist/vendor/
    - Por quê:
      - O README.md e LICENSE são arquivos padrão que devem ser incluídos em qualquer pacote NPM.
      - Locales suportam recursos de internacionalização
      - Arquivos Vendor contêm dependências de runtime necessárias

Etapa 4: Publicação no NPM

- O que acontece: O comando npm publish é executado de dentro do diretório raiz `dist`.
- Por quê: Ao executar npm publish de dentro do diretório `dist`, apenas os arquivos que montamos cuidadosamente na Etapa 3 são enviados ao registro do NPM. Isso previne que código-fonte, arquivos de teste ou configurações de desenvolvimento sejam acidentalmente publicados, resultando em um pacote limpo e minimalista para os usuários.

Este processo garante que o artefato final publicado seja uma representação proposital, limpa e eficiente do projeto, ao invés de uma cópia direta do workspace de desenvolvimento.

## NPM Workspaces

Este projeto utiliza [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) para gerenciar os pacotes dentro deste monorepo. Isso simplifica o desenvolvimento ao permitir que gerenciemos dependências e executemos scripts em vários pacotes a partir da raiz do projeto.

### Como Funciona

O arquivo `package.json` na raiz define os workspaces para este projeto:

```json
{
  "workspaces": ["packages/*"]
}
```

Isso informa ao NPM que qualquer pasta dentro do diretório `packages` é um pacote separado que deve ser gerenciado como parte do workspace.

### Benefícios dos Workspaces

- **Gerenciamento Simplificado de Dependências**: Executar `npm install` a partir da raiz do projeto instalará todas as dependências de todos os pacotes no workspace e os vinculará juntos. Isso significa que você não precisa executar `npm install` no diretório de cada pacote.
- **Vinculação Automática**: Pacotes dentro do workspace podem depender uns dos outros. Quando você executa `npm install`, o NPM criará automaticamente links simbólicos entre os pacotes. Isso significa que quando você faz alterações em um pacote, as alterações ficam imediatamente disponíveis para outros pacotes que dependem dele.
- **Execução Simplificada de Scripts**: Você pode executar scripts em qualquer pacote a partir da raiz do projeto usando a flag `--workspace`. Por exemplo, para executar o script `build` no pacote `cli`, você pode executar `npm run build --workspace @qwen-code/qwen-code`.