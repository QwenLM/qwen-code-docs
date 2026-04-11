# Visão Geral do Pacote

Este monorepo contém dois pacotes principais: `@qwen-code/qwen-code` e `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Este é o pacote principal do Qwen Code. Ele é responsável pela interface do usuário, análise de comandos e todas as outras funcionalidades voltadas ao usuário.

Quando este pacote é publicado, ele é agrupado (bundled) em um único arquivo executável. Este bundle inclui todas as dependências do pacote, incluindo `@qwen-code/qwen-code-core`. Isso significa que, independentemente de o usuário instalar o pacote com `npm install -g @qwen-code/qwen-code` ou executá-lo diretamente com `npx @qwen-code/qwen-code`, ele estará usando este único executável autossuficiente.

## `@qwen-code/qwen-code-core`

Este pacote contém a lógica principal da CLI. Ele é responsável por fazer requisições de API para os provedores configurados, gerenciar a autenticação e administrar o cache local.

Este pacote não é agrupado (bundled). Quando é publicado, é distribuído como um pacote Node.js padrão com suas próprias dependências. Isso permite que ele seja usado como um pacote independente em outros projetos, se necessário. Todo o código JS transpilado na pasta `dist` está incluído no pacote.

# Processo de Release

Este projeto segue um processo de release estruturado para garantir que todos os pacotes sejam versionados e publicados corretamente. O processo foi projetado para ser o mais automatizado possível.

## Como Realizar um Release

Os releases são gerenciados pelo workflow do GitHub Actions [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml). Para realizar um release manual de um patch ou hotfix:

1.  Acesse a aba **Actions** do repositório.
2.  Selecione o workflow **Release** na lista.
3.  Clique no botão suspenso **Run workflow**.
4.  Preencha os inputs obrigatórios:
    - **Version**: A versão exata a ser lançada (ex.: `v0.2.1`).
    - **Ref**: A branch ou o SHA do commit de onde o release será feito (padrão: `main`).
    - **Dry Run**: Mantenha como `true` para testar o workflow sem publicar, ou defina como `false` para realizar um release real.
5.  Clique em **Run workflow**.

## Tipos de Release

O projeto suporta múltiplos tipos de release:

### Releases Estáveis

Releases estáveis regulares para uso em produção.

### Releases de Preview

Releases de preview semanais todas as terças-feiras às 23:59 UTC para acesso antecipado a funcionalidades futuras.

### Releases Nightly

Releases nightly diários à meia-noite UTC para testes de desenvolvimento de ponta.

## Cronograma Automatizado de Releases

- **Nightly**: Todos os dias à meia-noite UTC
- **Preview**: Todas as terças-feiras às 23:59 UTC
- **Stable**: Releases manuais acionados pelos mantenedores

### Como Usar Diferentes Tipos de Release

Para instalar a versão mais recente de cada tipo:

```bash
# Stable (default)
npm install -g @qwen-code/qwen-code

# Preview
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### Detalhes do Processo de Release

Todo release agendado ou manual segue estas etapas:

1.  Faz checkout do código especificado (mais recente da branch `main` ou um commit específico).
2.  Instala todas as dependências.
3.  Executa o conjunto completo de verificações `preflight` e testes de integração.
4.  Se todos os testes passarem, calcula o número de versão apropriado com base no tipo de release.
5.  Compila e publica os pacotes no npm com a dist-tag apropriada.
6.  Cria um GitHub Release para a versão.

### Tratamento de Falhas

Se qualquer etapa do workflow de release falhar, uma nova issue será criada automaticamente no repositório com as labels `bug` e uma label de falha específica do tipo (ex.: `nightly-failure`, `preview-failure`). A issue conterá um link para a execução falha do workflow para facilitar a depuração.

## Validação do Release

Após o push de um novo release, deve-se realizar smoke testing para garantir que os pacotes estão funcionando conforme o esperado. Isso pode ser feito instalando os pacotes localmente e executando um conjunto de testes para verificar o funcionamento correto.

- `npx -y @qwen-code/qwen-code@latest --version` para validar se o push funcionou conforme o esperado, caso não esteja usando uma tag `rc` ou `dev`
- `npx -y @qwen-code/qwen-code@<release tag> --version` para validar se a tag foi enviada corretamente
- _Isso é destrutivo localmente_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force &&  npm install @qwen-code/qwen-code@<version>`
- Recomenda-se realizar um smoke testing básico executando alguns comandos e ferramentas de LLM para garantir que os pacotes estão funcionando conforme o esperado. Formalizaremos isso melhor no futuro.

## Quando fazer merge da alteração de versão, ou não?

O padrão acima para criar releases de patch ou hotfix a partir de commits atuais ou mais antigos deixa o repositório no seguinte estado:

1.  A Tag (`vX.Y.Z-patch.1`): Esta tag aponta corretamente para o commit original na `main` que contém o código estável que você pretendia lançar. Isso é crucial. Qualquer pessoa que fizer checkout desta tag obterá exatamente o código que foi publicado.
2.  A Branch (`release-vX.Y.Z-patch.1`): Esta branch contém um novo commit sobre o commit com a tag. Esse novo commit contém apenas a alteração do número de versão no `package.json` (e outros arquivos relacionados, como `package-lock.json`).

Essa separação é positiva. Ela mantém o histórico da sua branch `main` limpo de bumps de versão específicos de release até que você decida fazer o merge deles.

Esta é a decisão crítica e depende inteiramente da natureza do release.

### Merge Back para Patches Estáveis e Hotfixes

Quase sempre você vai querer fazer merge da branch `release-<tag>` de volta para a `main` para qualquer release de patch estável ou hotfix.

- Por quê? O principal motivo é atualizar a versão no `package.json` da `main`. Se você lançar a v1.2.1 a partir de um commit mais antigo, mas nunca fizer merge do bump de versão de volta, o `package.json` da sua branch `main` ainda dirá `"version": "1.2.0"`. O próximo desenvolvedor que iniciar o trabalho para o próximo release de funcionalidade (v1.3.0) criará uma branch a partir de uma codebase com um número de versão antigo e incorreto. Isso gera confusão e exige um bump de versão manual posteriormente.
- O Processo: Após a criação da branch `release-v1.2.1` e a publicação bem-sucedida do pacote, você deve abrir um pull request para fazer merge da `release-v1.2.1` na `main`. Este PR conterá apenas um commit: `"chore: bump version to v1.2.1"`. É uma integração limpa e simples que mantém sua branch `main` sincronizada com a versão lançada mais recente.

### NÃO faça Merge Back para Pré-Releases (RC, Beta, Dev)

Normalmente, você não faz merge de branches de release para pré-releases de volta na `main`.

- Por quê? Versões de pré-release (ex.: v1.3.0-rc.1, v1.3.0-rc.2) são, por definição, instáveis e temporárias. Você não quer poluir o histórico da sua branch `main` com uma série de bumps de versão para release candidates. O `package.json` na `main` deve refletir a versão do release estável mais recente, não uma RC.
- O Processo: A branch `release-v1.3.0-rc.1` é criada, o `npm publish --tag rc` é executado e, então... a branch cumpriu seu propósito. Você pode simplesmente excluí-la. O código da RC já está na `main` (ou em uma branch de feature), então nenhum código funcional é perdido. A branch de release foi apenas um veículo temporário para o número da versão.

## Testes Locais e Validação: Alterações no Processo de Empacotamento e Publicação

Se você precisar testar o processo de release sem realmente publicar no NPM ou criar um GitHub Release público, pode acionar o workflow manualmente pela interface do GitHub.

1.  Acesse a [aba Actions](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) do repositório.
2.  Clique no menu suspenso "Run workflow".
3.  Mantenha a opção `dry_run` marcada (`true`).
4.  Clique no botão "Run workflow".

Isso executará todo o processo de release, mas pulará as etapas `npm publish` e `gh release create`. Você pode inspecionar os logs do workflow para garantir que tudo está funcionando conforme o esperado.

É crucial testar localmente qualquer alteração no processo de empacotamento e publicação antes de fazer o commit. Isso garante que os pacotes serão publicados corretamente e funcionarão conforme o esperado quando instalados por um usuário.

Para validar suas alterações, você pode realizar um dry run do processo de publicação. Isso simulará a publicação sem realmente enviar os pacotes para o registro do npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Este comando fará o seguinte:

1.  Compilar todos os pacotes.
2.  Executar todos os scripts de `prepublish`.
3.  Criar os tarballs dos pacotes que seriam publicados no npm.
4.  Exibir um resumo dos pacotes que seriam publicados.

Em seguida, você pode inspecionar os tarballs gerados para garantir que eles contenham os arquivos corretos e que os arquivos `package.json` tenham sido atualizados corretamente. Os tarballs serão criados na raiz do diretório de cada pacote (ex.: `packages/cli/qwen-code-0.1.6.tgz`).

Ao realizar um dry run, você pode ter certeza de que suas alterações no processo de empacotamento estão corretas e que os pacotes serão publicados com sucesso.

## Aprofundamento no Processo de Release

O objetivo principal do processo de release é pegar o código-fonte do diretório `packages/`, compilá-lo e montar um pacote limpo e autossuficiente em um diretório `dist` temporário na raiz do projeto. É este diretório `dist` que realmente é publicado no NPM.

Aqui estão as etapas principais:

Etapa 1: Verificações de Sanidade Pré-Release e Versionamento

- O que acontece: Antes de qualquer arquivo ser movido, o processo garante que o projeto está em um bom estado. Isso envolve executar testes, linting e verificação de tipos (`npm run preflight`). O número da versão no `package.json` da raiz e no `packages/cli/package.json` é atualizado para a nova versão do release.
- Por quê: Isso garante que apenas código de alta qualidade e funcional seja lançado. O versionamento é o primeiro passo para sinalizar um novo release.

Etapa 2: Compilação do Código-Fonte

- O que acontece: O código-fonte TypeScript em `packages/core/src` e `packages/cli/src` é compilado para JavaScript.
- Movimentação de arquivos:
  - packages/core/src/\*_/_.ts -> compilado para -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> compilado para -> packages/cli/dist/
- Por quê: O código TypeScript escrito durante o desenvolvimento precisa ser convertido em JavaScript puro que possa ser executado pelo Node.js. O pacote `core` é compilado primeiro, pois o pacote `cli` depende dele.

Etapa 3: Bundling e Montagem do Pacote Final Publicável

Esta é a etapa mais crítica, onde os arquivos são movidos e transformados em seu estado final para publicação. O processo utiliza técnicas modernas de bundling para criar o pacote final.

1.  Criação do Bundle:
    - O que acontece: O script `prepare-package.js` cria um pacote de distribuição limpo no diretório `dist`.
    - Transformações principais:
      - Copia `README.md` e `LICENSE` para `dist/`
      - Copia a pasta `locales` para internacionalização
      - Cria um `package.json` limpo para distribuição com apenas as dependências necessárias
      - Mantém as dependências de distribuição mínimas (sem deps de runtime empacotadas)
      - Mantém dependências opcionais para `node-pty`

2.  O Bundle JavaScript é Criado:
    - O que acontece: O JavaScript compilado de `packages/core/dist` e `packages/cli/dist` é agrupado em um único arquivo JavaScript executável usando `esbuild`.
    - Localização do arquivo: `dist/cli.js`
    - Por quê: Isso cria um único arquivo otimizado que contém todo o código necessário da aplicação. Simplifica o pacote ao remover a necessidade de resolução complexa de dependências no momento da instalação.

3.  Arquivos Estáticos e de Suporte são Copiados:
    - O que acontece: Arquivos essenciais que não fazem parte do código-fonte, mas são necessários para o funcionamento correto do pacote ou para uma boa descrição, são copiados para o diretório `dist`.
    - Movimentação de arquivos:
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Arquivos de vendor -> dist/vendor/
    - Por quê:
      - `README.md` e `LICENSE` são arquivos padrão que devem ser incluídos em qualquer pacote NPM.
      - `Locales` oferecem suporte a recursos de internacionalização
      - Arquivos de vendor contêm dependências de runtime necessárias

Etapa 4: Publicação no NPM

- O que acontece: O comando `npm publish` é executado de dentro do diretório `dist` na raiz.
- Por quê: Ao executar `npm publish` de dentro do diretório `dist`, apenas os arquivos cuidadosamente montados na Etapa 3 são enviados para o registro do NPM. Isso impede que código-fonte, arquivos de teste ou configurações de desenvolvimento sejam publicados acidentalmente, resultando em um pacote limpo e mínimo para os usuários.

Este processo garante que o artefato final publicado seja uma representação limpa, eficiente e feita sob medida do projeto, em vez de uma cópia direta do workspace de desenvolvimento.

## NPM Workspaces

Este projeto utiliza [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) para gerenciar os pacotes dentro deste monorepo. Isso simplifica o desenvolvimento ao permitir gerenciar dependências e executar scripts em vários pacotes a partir da raiz do projeto.

### Como Funciona

O arquivo `package.json` na raiz define os workspaces para este projeto:

```json
{
  "workspaces": ["packages/*"]
}
```

Isso informa ao NPM que qualquer pasta dentro do diretório `packages` é um pacote separado que deve ser gerenciado como parte do workspace.

### Benefícios dos Workspaces

- **Gerenciamento Simplificado de Dependências**: Executar `npm install` na raiz do projeto instalará todas as dependências para todos os pacotes no workspace e as vinculará. Isso significa que você não precisa executar `npm install` no diretório de cada pacote.
- **Vinculação Automática**: Pacotes dentro do workspace podem depender uns dos outros. Quando você executa `npm install`, o NPM criará automaticamente symlinks entre os pacotes. Isso significa que, ao fazer alterações em um pacote, as mudanças ficam imediatamente disponíveis para outros pacotes que dependem dele.
- **Execução Simplificada de Scripts**: Você pode executar scripts em qualquer pacote a partir da raiz do projeto usando a flag `--workspace`. Por exemplo, para executar o script `build` no pacote `cli`, você pode rodar `npm run build --workspace @qwen-code/qwen-code`.