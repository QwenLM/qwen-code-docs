# Visão Geral do Pacote

Este monorepo contém dois pacotes principais: `@qwen-code/qwen-code` e `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Este é o pacote principal do Qwen Code. Ele é responsável pela interface do usuário, análise de comandos e todas as outras funcionalidades voltadas ao usuário.

Quando este pacote é publicado, ele é empacotado em um único arquivo executável. Este pacote inclui todas as dependências do pacote, incluindo `@qwen-code/qwen-code-core`. Isso significa que, independentemente de o usuário instalar o pacote com `npm install -g @qwen-code/qwen-code` ou executá-lo diretamente com `npx @qwen-code/qwen-code`, ele estará usando este único executável autocontido.

## `@qwen-code/qwen-code-core`

Este pacote contém a lógica principal para a CLI. É responsável por fazer requisições de API para provedores configurados, lidar com autenticação e gerenciar o cache local.

Este pacote não é empacotado. Quando publicado, é publicado como um pacote padrão do Node.js com suas próprias dependências. Isso permite que seja usado como um pacote independente em outros projetos, se necessário. Todo o código JavaScript transpilado na pasta `dist` está incluído no pacote.

# Processo de Lançamento

Este projeto segue um processo de lançamento estruturado para garantir que todos os pacotes sejam versionados e publicados corretamente. O processo é projetado para ser o mais automatizado possível.

## Como Fazer um Lançamento

Os lançamentos são gerenciados por meio do fluxo de trabalho do GitHub Actions [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml). Para realizar um lançamento manual para um patch ou hotfix:

1.  Navegue até a aba **Actions** do repositório.
2.  Selecione o fluxo de trabalho **Release** da lista.
3.  Clique no botão suspenso **Run workflow**.
4.  Preencha as entradas necessárias:
    - **Version**: A versão exata para lançar (por exemplo, `v0.2.1`).
    - **Ref**: O branch ou SHA do commit do qual será feito o lançamento (padrão é `main`).
    - **Dry Run**: Deixe como `true` para testar o fluxo de trabalho sem publicar, ou defina como `false` para fazer um lançamento real.
5.  Clique em **Run workflow**.

## Tipos de Lançamentos

O projeto suporta múltiplos tipos de lançamentos:

### Lançamentos Estáveis

Lançamentos estáveis regulares para uso em produção.

### Lançamentos de Pré-visualização

Lançamentos semanais de pré-visualização toda terça-feira às 23:59 UTC para acesso antecipado às próximas funcionalidades.

### Versões Noturnas

Versões noturnas diárias à meia-noite UTC para testes de desenvolvimento bleeding-edge.

## Cronograma Automatizado de Lançamentos

- **Noturno**: Todos os dias à meia-noite UTC
- **Preview**: Todas as terças-feiras às 23:59 UTC
- **Estável**: Lançamentos manuais acionados pelos mantenedores

### Como Usar Diferentes Tipos de Lançamento

Para instalar a versão mais recente de cada tipo:

```bash

# Estável (padrão)
npm install -g @qwen-code/qwen-code

# Preview
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### Detalhes do Processo de Lançamento

Cada lançamento agendado ou manual segue estas etapas:

1.  Faz checkout do código especificado (mais recente da branch `main` ou commit específico).
2.  Instala todas as dependências.
3.  Executa a suíte completa de verificações `preflight` e testes de integração.
4.  Se todos os testes passarem, calcula o número de versão apropriado com base no tipo de lançamento.
5.  Compila e publica os pacotes no npm com a tag de distribuição apropriada.
6.  Cria um Release no GitHub para a versão.

### Tratamento de Falhas

Se qualquer etapa do fluxo de trabalho de lançamento falhar, ela criará automaticamente uma nova issue no repositório com as labels `bug` e uma label específica de falha (por exemplo, `nightly-failure`, `preview-failure`). A issue conterá um link para a execução do fluxo de trabalho que falhou, facilitando a depuração.

## Validação de Lançamento

Após publicar um novo lançamento, testes básicos devem ser realizados para garantir que os pacotes estejam funcionando conforme o esperado. Isso pode ser feito instalando os pacotes localmente e executando um conjunto de testes para verificar se estão funcionando corretamente.

- `npx -y @qwen-code/qwen-code@latest --version` para validar se o push funcionou como esperado, caso você não tenha feito uma tag rc ou dev
- `npx -y @qwen-code/qwen-code@<tag do lançamento> --version` para validar se a tag foi publicada corretamente
- _Isso é destrutivo localmente_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force &&  npm install @qwen-code/qwen-code@<versão>`
- É recomendável fazer testes básicos executando alguns comandos de llm e ferramentas para garantir que os pacotes estejam funcionando conforme o esperado. Vamos padronizar isso mais no futuro.

## Quando mesclar a alteração de versão, ou não?

O padrão acima para criação de patches ou releases de correção rápida a partir de commits atuais ou antigos deixa o repositório no seguinte estado:

1.  A Tag (`vX.Y.Z-patch.1`): Esta tag aponta corretamente para o commit original na branch main
    que contém o código estável que você pretendia lançar. Isso é crucial. Qualquer pessoa que faça
    checkout desta tag obtém exatamente o código que foi publicado.
2.  A Branch (`release-vX.Y.Z-patch.1`): Esta branch contém um novo commit em cima do
    commit marcado. Esse novo commit contém apenas a alteração do número da versão no package.json
    (e outros arquivos relacionados como package-lock.json).

Essa separação é boa. Mantém o histórico da sua branch main limpo de incrementos de versão específicos
de releases até que você decida mesclá-los.

Esta é a decisão crítica, e depende inteiramente da natureza do release.

### Merge de Volta para Patches Estáveis e Hotfixes

Na quase totalidade das vezes, você desejará fazer merge da branch `release-<tag>` de volta para `main` para qualquer lançamento estável de patch ou hotfix.

- Por quê? O motivo principal é atualizar a versão no package.json da main. Se você lançar a v1.2.1 a partir de um commit mais antigo, mas nunca fizer o merge do incremento de versão de volta, o package.json da sua branch main ainda dirá "version": "1.2.0". O próximo desenvolvedor que iniciar o trabalho para a próxima versão com novas funcionalidades (v1.3.0) estará criando uma branch a partir de uma base de código com um número de versão incorreto e antigo. Isso leva à confusão e exige ajuste manual da versão posteriormente.
- O Processo: Após a criação da branch release-v1.2.1 e após o pacote ter sido publicado com sucesso, você deve abrir um pull request para mesclar release-v1.2.1 na main. Este PR conterá apenas um commit: "chore: bump version to v1.2.1". É uma integração limpa e simples que mantém sua branch main sincronizada com a versão mais recentemente lançada.

### NÃO FAÇA MERGE DE VERSÕES PRÉ-LANÇAMENTO (RC, BETA, DEV)

Normalmente, você não faz merge das branches de lançamento para pré-lançamentos de volta na `main`.

- Por quê? Versões pré-lançamento (ex: v1.3.0-rc.1, v1.3.0-rc.2) são, por definição, instáveis e temporárias. Você não deseja poluir o histórico da sua branch principal com uma série de atualizações de versão para candidatos a lançamento. O package.json na main deve refletir a última versão estável lançada, não uma RC.
- O Processo: A branch release-v1.3.0-rc.1 é criada, acontece o npm publish --tag rc, e então... a branch cumpriu seu propósito. Você pode simplesmente excluí-la. O código para a RC já está na main (ou em uma branch de funcionalidade), então nenhum código funcional é perdido. A branch de lançamento era apenas um veículo temporário para o número da versão.

## Teste e Validação Locais: Alterações no Processo de Empacotamento e Publicação

Se você precisar testar o processo de lançamento sem realmente publicar no NPM ou criar um lançamento público no GitHub, é possível acionar o fluxo de trabalho manualmente pela interface do GitHub.

1.  Acesse a [aba Actions](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) do repositório.
2.  Clique no menu suspenso "Run workflow".
3.  Mantenha a opção `dry_run` marcada (`true`).
4.  Clique no botão "Run workflow".

Isso executará todo o processo de lançamento, mas irá pular as etapas `npm publish` e `gh release create`. Você pode inspecionar os logs do fluxo de trabalho para garantir que tudo está funcionando conforme esperado.

É fundamental testar localmente quaisquer alterações no processo de empacotamento e publicação antes de confirmá-las. Isso garante que os pacotes sejam publicados corretamente e que funcionem como esperado quando instalados por um usuário.

Para validar suas alterações, você pode realizar uma simulação ("dry run") do processo de publicação. Isso simulará o processo de publicação sem realmente publicar os pacotes no registro npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Este comando fará o seguinte:

1.  Compilar todos os pacotes.
2.  Executar todos os scripts prepublish.
3.  Criar os arquivos tarball dos pacotes que seriam publicados no npm.
4.  Imprimir um resumo dos pacotes que seriam publicados.

Você pode então inspecionar os arquivos tarball gerados para garantir que eles contenham os arquivos corretos e que os arquivos `package.json` tenham sido atualizados corretamente. Os arquivos tarball serão criados na raiz do diretório de cada pacote (por exemplo, `packages/cli/qwen-code-0.1.6.tgz`).

Ao realizar uma simulação, você pode ter certeza de que suas alterações no processo de empacotamento estão corretas e que os pacotes serão publicados com sucesso.

## Análise Profunda da Versão

O objetivo principal do processo de lançamento é pegar o código-fonte do diretório packages/, construí-lo e montar um
pacote limpo e autossuficiente em um diretório temporário `dist` na raiz do projeto. Este diretório `dist` é o que
realmente é publicado no NPM.

Aqui estão as etapas principais:

Etapa 1: Verificações de Sanidade e Versionamento Pré-Lançamento

- O que acontece: Antes que quaisquer arquivos sejam movidos, o processo garante que o projeto está em bom estado. Isso envolve executar testes,
  verificação de estilo (linting) e verificação de tipos (npm run preflight). O número da versão no package.json da raiz e em packages/cli/package.json
  é atualizado para a nova versão de lançamento.
- Por quê: Isso garante que apenas código de alta qualidade e funcional seja lançado. O versionamento é o primeiro passo para indicar um novo
  lançamento.

Etapa 2: Construção do Código-Fonte

- O que acontece: O código-fonte TypeScript em packages/core/src e packages/cli/src é compilado em JavaScript.
- Movimentação de arquivos:
  - packages/core/src/\*\*/\*.ts -> compilado para -> packages/core/dist/
  - packages/cli/src/\*\*/\*.ts -> compilado para -> packages/cli/dist/
- Por quê: O código TypeScript escrito durante o desenvolvimento precisa ser convertido em JavaScript puro que possa ser executado pelo
  Node.js. O pacote core é construído primeiro pois o pacote cli depende dele.

Etapa 3: Empacotamento e Montagem do Pacote Publicável Final

Esta é a etapa mais crítica onde os arquivos são movidos e transformados em seu estado final para publicação. O processo utiliza técnicas modernas de empacotamento para criar o pacote final.

1.  Criação do Pacote:
    - O que acontece: O script prepare-package.js cria um pacote de distribuição limpo no diretório `dist`.
    - Transformações principais:
      - Copia README.md e LICENSE para dist/
      - Copia pasta locales para internacionalização
      - Cria um package.json limpo para distribuição com apenas as dependências necessárias
      - Mantém as dependências de distribuição mínimas (sem dependências de tempo de execução embutidas)
      - Mantém dependências opcionais para node-pty

2.  O Pacote JavaScript é Criado:
    - O que acontece: O JavaScript construído de ambos packages/core/dist e packages/cli/dist é empacotado em um único
      arquivo JavaScript executável usando esbuild.
    - Localização do arquivo: dist/cli.js
    - Por quê: Isso cria um único arquivo otimizado que contém todo o código da aplicação necessário. Simplifica o pacote
      removendo a necessidade de resolução complexa de dependências no momento da instalação.

3.  Arquivos Estáticos e de Apoio são Copiados:
    - O que acontece: Arquivos essenciais que não fazem parte do código-fonte mas são necessários para que o pacote funcione corretamente
      ou seja bem descrito são copiados para o diretório `dist`.
    - Movimentação de arquivos:
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Arquivos vendor -> dist/vendor/
    - Por quê:
      - O README.md e LICENSE são arquivos padrão que devem ser incluídos em qualquer pacote NPM.
      - Locales suportam recursos de internacionalização
      - Arquivos vendor contêm dependências de tempo de execução necessárias

Etapa 4: Publicação no NPM

- O que acontece: O comando npm publish é executado dentro do diretório `dist` raiz.
- Por quê: Ao executar npm publish dentro do diretório `dist`, apenas os arquivos cuidadosamente montados na Etapa 3 são enviados
  para o registro NPM. Isso evita que código-fonte, arquivos de teste ou configurações de desenvolvimento sejam publicados acidentalmente,
  resultando em um pacote limpo e mínimo para os usuários.

Este processo garante que o artefato publicado final seja uma representação limpa, eficiente e com propósito do
projeto, em vez de uma cópia direta do espaço de trabalho de desenvolvimento.

## Espaços de Trabalho NPM

Este projeto utiliza [Espaços de Trabalho NPM](https://docs.npmjs.com/cli/v10/using-npm/workspaces) para gerenciar os pacotes dentro deste monorepo. Isso simplifica o desenvolvimento ao permitir que gerenciemos dependências e executemos scripts em múltiplos pacotes a partir da raiz do projeto.

### Como Funciona

O arquivo `package.json` na raiz define os espaços de trabalho para este projeto:

```json
{
  "workspaces": ["packages/*"]
}
```

Isso informa ao NPM que qualquer pasta dentro do diretório `packages` é um pacote separado que deve ser gerenciado como parte do espaço de trabalho.

### Benefícios dos Workspaces

- **Gerenciamento de Dependências Simplificado**: Executar `npm install` na raiz do projeto instalará todas as dependências para todos os pacotes no workspace e as vinculará entre si. Isso significa que você não precisa executar `npm install` em cada diretório de pacote.
- **Vinculação Automática**: Pacotes dentro do workspace podem depender uns dos outros. Quando você executa `npm install`, o NPM criará automaticamente links simbólicos entre os pacotes. Isso significa que quando você faz alterações em um pacote, essas alterações ficam imediatamente disponíveis para outros pacotes que dependem dele.
- **Execução de Scripts Simplificada**: Você pode executar scripts em qualquer pacote a partir da raiz do projeto usando a flag `--workspace`. Por exemplo, para executar o script `build` no pacote `cli`, você pode executar `npm run build --workspace @qwen-code/qwen-code`.