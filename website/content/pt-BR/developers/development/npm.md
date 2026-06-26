# Visão Geral dos Pacotes

Este monorepositório contém dois pacotes principais: `@qwen-code/qwen-code` e `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Este é o pacote principal do Qwen Code. Ele é responsável pela interface do usuário, análise de comandos e todas as outras funcionalidades voltadas ao usuário.

Quando este pacote é publicado, ele é empacotado em um único arquivo executável. Esse pacote inclui todas as dependências do pacote, incluindo `@qwen-code/qwen-code-core`. Isso significa que, seja instalando o pacote com `npm install -g @qwen-code/qwen-code` ou executando-o diretamente com `npx @qwen-code/qwen-code`, o usuário estará utilizando este único executável autocontido.

## `@qwen-code/qwen-code-core`

Este pacote contém a lógica central da CLI. Ele é responsável por fazer requisições de API aos provedores configurados, gerenciar a autenticação e administrar o cache local.

Este pacote não é empacotado. Quando é publicado, é publicado como um pacote Node.js padrão com suas próprias dependências. Isso permite que seja usado como um pacote independente em outros projetos, se necessário. Todo o código JavaScript transpilado na pasta `dist` está incluído no pacote.

# Processo de Lançamento

Este projeto segue um processo de lançamento estruturado para garantir que todos os pacotes sejam versionados e publicados corretamente. O processo é projetado para ser o mais automatizado possível.

## Como Lançar

Os lançamentos são gerenciados através do workflow [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) do GitHub Actions. Para realizar um lançamento manual de um patch ou hotfix:

1.  Navegue até a aba **Actions** do repositório.
2.  Selecione o workflow **Release** na lista.
3.  Clique no botão do menu suspenso **Run workflow**.
4.  Preencha as entradas obrigatórias:
    - **Version**: A versão exata a ser lançada (ex.: `v0.2.1`).
    - **Ref**: O branch ou SHA do commit a partir do qual lançar (padrão: `main`).
    - **Dry Run**: Deixe como `true` para testar o workflow sem publicar, ou defina como `false` para realizar um lançamento ao vivo.
5.  Clique em **Run workflow**.

## Tipos de Lançamento

O projeto suporta vários tipos de lançamento:

### Lançamentos Estáveis

Lançamentos estáveis regulares para uso em produção.

### Lançamentos de Pré-visualização

Lançamentos de pré-visualização semanais toda terça-feira às 23:59 UTC para acesso antecipado a funcionalidades futuras.

### Lançamentos Noturnos

Lançamentos noturnos diários à meia-noite UTC para testes de desenvolvimento de ponta.

## Cronograma de Lançamentos Automatizados

- **Nightly**: Todos os dias à meia-noite UTC
- **Preview**: Toda terça-feira às 23:59 UTC
- **Stable**: Lançamentos manuais acionados pelos mantenedores

### Como Usar Diferentes Tipos de Lançamento

Para instalar a versão mais recente de cada tipo:

```bash
# Stable (default)
npm install -g @qwen-code/qwen-code

# Preview
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### Detalhes do Processo de Lançamento

Todo lançamento agendado ou manual segue estas etapas:

1.  Faz o checkout do código especificado (último do branch `main` ou commit específico).
2.  Instala todas as dependências.
3.  Executa a suíte completa de verificações `preflight` e testes de integração.
4.  Se todos os testes forem bem-sucedidos, calcula o número de versão apropriado com base no tipo de lançamento.
5.  Compila e publica os pacotes no npm com a dist-tag apropriada.
6.  Cria um GitHub Release para a versão.

### Tratamento de Falhas

Se alguma etapa do workflow de lançamento falhar, ele criará automaticamente uma nova issue no repositório com os rótulos `bug` e um rótulo de falha específico do tipo (ex.: `nightly-failure`, `preview-failure`). A issue conterá um link para a execução do workflow que falhou para facilitar a depuração.

## Validação de Lançamento

Após enviar um novo lançamento, testes de fumaça devem ser realizados para garantir que os pacotes estão funcionando conforme esperado. Isso pode ser feito instalando os pacotes localmente e executando um conjunto de testes para verificar se estão funcionando corretamente.

- `npx -y @qwen-code/qwen-code@latest --version` para validar que o push funcionou conforme esperado, se você não estava fazendo uma tag rc ou dev
- `npx -y @qwen-code/qwen-code@<release tag> --version` para validar que a tag foi enviada apropriadamente
- `_Isto é destrutivo localmente_ npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force &&  npm install @qwen-code/qwen-code@<version>`
- Recomenda-se realizar um teste de fumaça básico executando alguns comandos e ferramentas LLM para garantir que os pacotes estão funcionando conforme esperado. Vamos codificar isso mais no futuro.

## Quando mesclar a alteração de versão, ou não?

O padrão acima para criar lançamentos de patch ou hotfix a partir de commits atuais ou antigos deixa o repositório no seguinte estado:

1.  A Tag (`vX.Y.Z-patch.1`): Esta tag aponta corretamente para o commit original no main que contém o código estável que você pretendia lançar. Isso é crucial. Qualquer pessoa que fizer checkout desta tag obtém exatamente o código que foi publicado.
2.  O Branch (`release-vX.Y.Z-patch.1`): Este branch contém um novo commit em cima do commit marcado. Esse novo commit contém apenas a alteração do número de versão no package.json (e outros arquivos relacionados, como package-lock.json).

Essa separação é boa. Ela mantém o histórico do branch main limpo de incrementos de versão específicos de lançamento até que você decida mesclá-los.

Esta é a decisão crítica, e depende inteiramente da natureza do lançamento.

### Mesclar de Volta para Patches Estáveis e Hotfixes

Você quase sempre deseja mesclar o branch `release-<tag>` de volta ao `main` para qualquer lançamento de patch estável ou hotfix.

- Por quê? A principal razão é atualizar a versão no package.json do main. Se você lançar v1.2.1 a partir de um commit antigo, mas nunca mesclar o incremento de versão de volta, o package.json do seu branch main ainda dirá "version": "1.2.0". O próximo desenvolvedor que começar a trabalhar no próximo lançamento de funcionalidade (v1.3.0) estará ramificando a partir de um codebase que tem um número de versão incorreto e mais antigo. Isso leva a confusão e requer incremento manual de versão mais tarde.
- O Processo: Após o branch release-v1.2.1 ser criado e o pacote ser publicado com sucesso, você deve abrir um pull request para mesclar release-v1.2.1 no main. Este PR conterá apenas um commit: "chore: bump version to v1.2.1". É uma integração limpa e simples que mantém seu branch main sincronizado com a versão lançada mais recente.

### NÃO Mesclar de Volta para Pré-lançamentos (RC, Beta, Dev)

Normalmente, você não mescla branches de lançamento de pré-lançamentos de volta ao `main`.

- Por quê? Versões de pré-lançamento (ex.: v1.3.0-rc.1, v1.3.0-rc.2) são, por definição, instáveis e temporárias. Você não quer poluir o histórico do seu branch main com uma série de incrementos de versão para release candidates. O package.json no main deve refletir a versão estável mais recente, não um RC.
- O Processo: O branch release-v1.3.0-rc.1 é criado, o npm publish --tag rc é executado, e então... o branch cumpriu seu propósito. Você pode simplesmente deletá-lo. O código do RC já está no main (ou em um branch de funcionalidade), então nenhum código funcional é perdido. O branch de lançamento foi apenas um veículo temporário para o número de versão.

## Teste e Validação Local: Alterações no Processo de Empacotamento e Publicação

Se você precisar testar o processo de lançamento sem realmente publicar no NPM ou criar um GitHub Release público, você pode acionar o workflow manualmente pela interface do GitHub.

1.  Vá para a [aba Actions](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) do repositório.
2.  Clique no menu suspenso "Run workflow".
3.  Deixe a opção `dry_run` marcada (`true`).
4.  Clique no botão "Run workflow".

Isso executará todo o processo de lançamento, mas pulará as etapas de `npm publish` e `gh release create`. Você pode inspecionar os logs do workflow para garantir que tudo está funcionando conforme esperado.

É crucial testar quaisquer alterações no processo de empacotamento e publicação localmente antes de confirmá-las. Isso garante que os pacotes serão publicados corretamente e que funcionarão conforme esperado quando instalados por um usuário.

Para validar suas alterações, você pode realizar uma execução de teste (dry run) do processo de publicação. Isso simulará o processo de publicação sem realmente publicar os pacotes no registro npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Este comando fará o seguinte:

1.  Compilar todos os pacotes.
2.  Executar todos os scripts prepublish.
3.  Criar os tarballs dos pacotes que seriam publicados no npm.
4.  Imprimir um resumo dos pacotes que seriam publicados.

Você pode então inspecionar os tarballs gerados para garantir que eles contêm os arquivos corretos e que os arquivos `package.json` foram atualizados corretamente. Os tarballs serão criados na raiz do diretório de cada pacote (ex.: `packages/cli/qwen-code-0.1.6.tgz`).

Ao realizar uma execução de teste (dry run), você pode ter confiança de que suas alterações no processo de empacotamento estão corretas e que os pacotes serão publicados com sucesso.

## Mergulho Profundo no Lançamento

O principal objetivo do processo de lançamento é pegar o código-fonte do diretório packages/, compilá-lo e montar um pacote limpo e autocontido em um diretório `dist` temporário na raiz do projeto. Esse diretório `dist` é o que realmente é publicado no NPM.

Aqui estão as etapas principais:

### Etapa 1: Verificações de Sanidade Pré-Lançamento e Versionamento

- **O que acontece:** Antes de qualquer arquivo ser movido, o processo garante que o projeto esteja em bom estado. Isso envolve executar testes, linting e verificação de tipos (`npm run preflight`). O número de versão no package.json raiz e em packages/cli/package.json é atualizado para a nova versão de lançamento.
- **Por quê:** Isso garante que apenas código de alta qualidade e funcional seja lançado. O versionamento é o primeiro passo para sinalizar um novo lançamento.

### Etapa 2: Compilação do Código-Fonte

- **O que acontece:** O código-fonte TypeScript em packages/core/src e packages/cli/src é compilado em JavaScript.
- **Movimentação de arquivos:**
  - packages/core/src/\*_/_.ts -> compilado para -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> compilado para -> packages/cli/dist/
- **Por quê:** O código TypeScript escrito durante o desenvolvimento precisa ser convertido em JavaScript puro que possa ser executado pelo Node.js. O pacote core é compilado primeiro, pois o pacote cli depende dele.

### Etapa 3: Empacotamento e Montagem do Pacote Final Publicável

Esta é a etapa mais crítica, onde os arquivos são movidos e transformados em seu estado final para publicação. O processo usa técnicas modernas de empacotamento para criar o pacote final.

1.  **Criação do Pacote:**
    - **O que acontece:** O script prepare-package.js cria um pacote de distribuição limpo no diretório `dist`.
    - **Transformações principais:**
      - Copia README.md e LICENSE para dist/
      - Copia a pasta locales para internacionalização
      - Cria um package.json limpo para distribuição com apenas as dependências necessárias
      - Mantém as dependências de distribuição mínimas (sem dependências de runtime empacotadas)
      - Mantém dependências opcionais para node-pty

2.  **O Pacote JavaScript é Criado:**
    - **O que acontece:** O JavaScript compilado de ambos os pacotes (packages/core/dist e packages/cli/dist) é empacotado em um único arquivo JavaScript executável usando o esbuild.
    - **Localização do arquivo:** dist/cli.js
    - **Por quê:** Isso cria um único arquivo otimizado que contém todo o código de aplicação necessário. Simplifica o pacote removendo a necessidade de resolução complexa de dependências no momento da instalação.

3.  **Arquivos Estáticos e de Suporte são Copiados:**
    - **O que acontece:** Arquivos essenciais que não fazem parte do código-fonte, mas são necessários para o pacote funcionar corretamente ou serem bem descritos, são copiados para o diretório `dist`.
    - **Movimentação de arquivos:**
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Arquivos vendor -> dist/vendor/
    - **Por quê:**
      - O README.md e LICENSE são arquivos padrão que devem ser incluídos em qualquer pacote NPM.
      - Locales suportam funcionalidades de internacionalização.
      - Arquivos vendor contêm dependências de runtime necessárias.

### Etapa 4: Publicação no NPM

- **O que acontece:** O comando npm publish é executado de dentro do diretório raiz `dist`.
- **Por quê:** Ao executar npm publish de dentro do diretório `dist`, apenas os arquivos que montamos cuidadosamente na Etapa 3 são enviados para o registro NPM. Isso evita que qualquer código-fonte, arquivos de teste ou configurações de desenvolvimento sejam publicados acidentalmente, resultando em um pacote limpo e mínimo para os usuários.

Esse processo garante que o artefato final publicado seja uma representação proposital, limpa e eficiente do projeto, em vez de uma cópia direta do espaço de trabalho de desenvolvimento.

## NPM Workspaces

Este projeto utiliza [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) para gerenciar os pacotes dentro deste monorepositório. Isso simplifica o desenvolvimento, permitindo gerenciar dependências e executar scripts em vários pacotes a partir da raiz do projeto.

### Como Funciona

O arquivo `package.json` raiz define os workspaces para este projeto:

```json
{
  "workspaces": ["packages/*"]
}
```

Isso informa ao NPM que qualquer pasta dentro do diretório `packages` é um pacote separado que deve ser gerenciado como parte do espaço de trabalho.

### Benefícios dos Workspaces

- **Gerenciamento Simplificado de Dependências**: Executar `npm install` a partir da raiz do projeto instalará todas as dependências para todos os pacotes no workspace e os vinculará. Isso significa que você não precisa executar `npm install` no diretório de cada pacote.
- **Vinculação Automática**: Pacotes dentro do workspace podem depender uns dos outros. Quando você executa `npm install`, o NPM criará automaticamente symlinks entre os pacotes. Isso significa que, quando você faz alterações em um pacote, as alterações ficam imediatamente disponíveis para outros pacotes que dependem dele.
- **Execução Simplificada de Scripts**: Você pode executar scripts em qualquer pacote a partir da raiz do projeto usando a flag `--workspace`. Por exemplo, para executar o script `build` no pacote `cli`, você pode executar `npm run build --workspace @qwen-code/qwen-code`.