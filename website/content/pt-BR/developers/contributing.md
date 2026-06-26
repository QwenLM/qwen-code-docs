# Como Contribuir

Adoraríamos receber suas correções e contribuições para este projeto.

## Processo de Contribuição

### Revisões de Código

Todas as submissões, incluindo as de membros do projeto, exigem revisão. Utilizamos [pull requests do GitHub](https://docs.github.com/articles/about-pull-requests) para esse fim.

### Diretrizes para Pull Requests

Para nos ajudar a revisar e mesclar seus PRs rapidamente, siga estas diretrizes. PRs que não atenderem a esses padrões poderão ser fechados.

#### 1. Vincule a um Issue Existente

Todos os PRs devem estar vinculados a um issue existente em nosso rastreador. Isso garante que cada mudança tenha sido discutida e esteja alinhada com os objetivos do projeto antes de qualquer código ser escrito.

- **Para correções de bugs:** O PR deve estar vinculado ao issue do relatório de bug.
- **Para funcionalidades:** O PR deve estar vinculado ao issue de solicitação ou proposta de funcionalidade que tenha sido aprovado por um mantenedor.

Se não existir um issue para sua alteração, **abra um primeiro** e aguarde feedback antes de começar a codificar.

#### 2. Mantenha Pequeno e Focado

Preferimos PRs pequenos e atômicos que abordem um único problema ou adicionem uma única funcionalidade autocontida.

- **Faça:** Crie um PR que corrija um bug específico ou adicione uma funcionalidade específica.
- **Não faça:** Agrupe várias alterações não relacionadas (ex.: correção de bug, nova funcionalidade e refatoração) em um único PR.

Como regra geral, comece a dividir um PR quando ele ultrapassar cerca de 1.200 linhas alteradas. PRs acima de cerca de 2.000 linhas alteradas devem ser divididos em uma série de PRs menores e lógicos que possam ser revisados e mesclados independentemente, ou explicar na descrição do PR por que a mudança precisa ser aplicada em conjunto.

#### 3. Use PRs Rascunho para Trabalho em Andamento

Se você gostaria de obter feedback antecipado sobre seu trabalho, utilize o recurso **Draft Pull Request** do GitHub. Isso sinaliza aos mantenedores que o PR ainda não está pronto para uma revisão formal, mas está aberto para discussão e feedback inicial.

#### 4. Garanta que Todas as Verificações Passem

Antes de enviar seu PR, garanta que todas as verificações automatizadas estejam passando executando `npm run preflight`. Este comando executa todos os testes, linting e outras verificações de estilo.

#### 5. Atualize a Documentação

Se seu PR introduzir uma mudança voltada ao usuário (ex.: um novo comando, uma flag modificada ou uma alteração de comportamento), você também deve atualizar a documentação relevante no diretório `/docs`.

#### 6. Escreva Mensagens de Commit Claras e uma Boa Descrição do PR

Seu PR deve ter um título claro e descritivo e uma descrição detalhada das alterações. Siga o padrão [Conventional Commits](https://www.conventionalcommits.org/) para suas mensagens de commit.

- **Bom título de PR:** `feat(cli): Adiciona flag --json ao comando 'config get'`
- **Mau título de PR:** `Fiz algumas alterações`

Na descrição do PR, explique o "porquê" por trás de suas alterações e vincule ao issue relevante (ex.: `Fixes #123`).

## Configuração e Fluxo de Trabalho de Desenvolvimento

Esta seção orienta os contribuidores sobre como construir, modificar e entender a configuração de desenvolvimento deste projeto.

### Configurando o Ambiente de Desenvolvimento

**Pré-requisitos:**

1.  **Node.js**:
    - **Desenvolvimento:** Use Node.js `>=22`. Ink 7 (usado pela TUI) requer Node 22, e `react@^19.2.0` é o peer correspondente. Você pode usar uma ferramenta como [nvm](https://github.com/nvm-sh/nvm) para gerenciar versões do Node.js.
    - **Produção:** Para executar a CLI em ambiente de produção, qualquer versão do Node.js `>=22` é aceitável.
2.  **Git**

### Processo de Build

Para clonar o repositório:

```bash
git clone https://github.com/QwenLM/qwen-code.git # Ou a URL do seu fork
cd qwen-code
```

Para instalar as dependências definidas em `package.json` bem como as dependências raiz:

```bash
npm install
```

Para construir todo o projeto (todos os pacotes):

```bash
npm run build
```

Este comando normalmente compila TypeScript para JavaScript, empacota assets e prepara os pacotes para execução. Consulte `scripts/build.js` e os scripts em `package.json` para mais detalhes sobre o que acontece durante o build.

### Habilitando o Sandboxing

[Sandboxing](#sandboxing) é altamente recomendado e requer, no mínimo, definir `QWEN_SANDBOX=true` em seu `~/.env` e garantir que um provedor de sandboxing (ex.: `macOS Seatbelt`, `docker` ou `podman`) esteja disponível. Veja [Sandboxing](#sandboxing) para detalhes.

Para construir tanto a utilidade CLI `qwen-code` quanto o contêiner de sandbox, execute `build:all` a partir do diretório raiz:

```bash
npm run build:all
```

Para pular a construção do contêiner de sandbox, você pode usar `npm run build`.

### Executando

Para iniciar o aplicativo Qwen Code a partir do código-fonte (após o build), execute o seguinte comando a partir do diretório raiz:

```bash
npm start
```

Se você quiser executar o build da fonte fora da pasta qwen-code, pode utilizar `npm link path/to/qwen-code/packages/cli` (veja: [docs](https://docs.npmjs.com/cli/v9/commands/npm-link)) para executar com `qwen-code`

### Executando Testes

Este projeto contém dois tipos de testes: testes unitários e testes de integração.

#### Testes Unitários

Para executar o conjunto de testes unitários do projeto:

```bash
npm run test
```
Isso executará os testes localizados nos diretórios `packages/core` e `packages/cli`. Garanta que todos os testes passem antes de enviar qualquer alteração. Para uma verificação mais abrangente, é recomendado executar `npm run preflight`.

#### Testes de Integração

Os testes de integração são projetados para validar a funcionalidade de ponta a ponta do Qwen Code. Eles não são executados como parte do comando padrão `npm run test`.

Para executar os testes de integração, utilize o seguinte comando:

```bash
npm run test:e2e
```

Para informações mais detalhadas sobre o framework de testes de integração, consulte a [documentação de Testes de Integração](./development/integration-tests.md).

### Linting e Verificações de Preflight

Para garantir a qualidade do código e a consistência da formatação, execute a verificação de preflight:

```bash
npm run preflight
```

Este comando executará ESLint, Prettier, todos os testes e outras verificações conforme definido no `package.json` do projeto.

_Dica Profissional_

após clonar, crie um arquivo de hook pre-commit do git para garantir que seus commits estejam sempre limpos.

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatação

Para formatar separadamente o código neste projeto, execute o seguinte comando a partir do diretório raiz:

```bash
npm run format
```

Este comando utiliza o Prettier para formatar o código de acordo com as diretrizes de estilo do projeto.

#### Linting

Para verificar o código separadamente com lint neste projeto, execute o seguinte comando a partir do diretório raiz:

```bash
npm run lint
```

### Convenções de Código

- Siga o estilo, os padrões e as convenções de código utilizados em toda a base de código existente.
- **Importações:** Preste atenção especial aos caminhos de importação. O projeto utiliza ESLint para impor restrições sobre importações relativas entre pacotes.

### Estrutura do Projeto

- `packages/`: Contém os sub-pacotes individuais do projeto.
  - `cli/`: A interface de linha de comando.
  - `core/`: A lógica central do backend do Qwen Code.
- `docs/`: Contém toda a documentação do projeto.
- `scripts/`: Scripts utilitários para tarefas de construção, teste e desenvolvimento.

Para uma arquitetura mais detalhada, consulte `docs/architecture.md`.

## Desenvolvimento da Documentação

Esta seção descreve como desenvolver e visualizar a documentação localmente.

### Pré-requisitos

1. Certifique-se de ter o Node.js (versão 22+) instalado
2. Tenha npm ou yarn disponíveis

### Configuração do Site de Documentação Local

Para trabalhar na documentação e visualizar as alterações localmente:

1. Navegue até o diretório `docs-site`:

   ```bash
   cd docs-site
   ```

2. Instale as dependências:

   ```bash
   npm install
   ```

3. Vincule o conteúdo da documentação do diretório principal `docs`:

   ```bash
   npm run link
   ```

   Isso cria um link simbólico de `../docs` para `content` no projeto docs-site, permitindo que o conteúdo da documentação seja servido pelo site Next.js.

4. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

5. Abra [http://localhost:3000](http://localhost:3000) no seu navegador para ver o site de documentação com atualizações em tempo real conforme você faz alterações.

Quaisquer alterações feitas nos arquivos de documentação no diretório principal `docs` serão refletidas imediatamente no site de documentação.

## Depuração

### VS Code:

0.  Execute o CLI para depuração interativa no VS Code com `F5`
1.  Inicie o CLI em modo de depuração a partir do diretório raiz:
    ```bash
    npm run debug
    ```
    Este comando executa `node --inspect-brk dist/index.js` dentro do diretório `packages/cli`, pausando a execução até que um depurador seja anexado. Você pode então abrir `chrome://inspect` no seu navegador Chrome para conectar ao depurador.
2.  No VS Code, use a configuração de inicialização "Attach" (encontrada em `.vscode/launch.json`).

Alternativamente, você pode usar a configuração "Launch Program" no VS Code se preferir iniciar diretamente o arquivo atualmente aberto, mas 'F5' é geralmente recomendado.

Para atingir um ponto de interrupção dentro do contêiner sandbox, execute:

```bash
DEBUG=1 qwen-code
```

**Nota:** Se você tiver `DEBUG=true` no arquivo `.env` de um projeto, isso não afetará o qwen-code devido à exclusão automática. Use arquivos `.qwen-code/.env` para configurações de depuração específicas do qwen-code.

### React DevTools

Para depurar a interface do CLI baseada em React, você pode usar o React DevTools. O Ink, a biblioteca usada para a interface do CLI, é compatível com a versão 4.x do React DevTools.

1.  **Inicie a aplicação Qwen Code no modo de desenvolvimento:**

    ```bash
    DEV=true npm start
    ```

2.  **Instale e execute o React DevTools versão 4.28.5 (ou a versão 4.x compatível mais recente):**

    Você pode instalá-lo globalmente:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Ou executá-lo diretamente usando npx:

    ```bash
    npx react-devtools@4.28.5
    ```

    Sua aplicação CLI em execução deve então conectar-se ao React DevTools.

## Sandboxing

> TBD

## Publicação Manual

Publicamos um artefato para cada commit em nosso registro interno. Mas se precisar gerar manualmente uma build local, execute os seguintes comandos:
```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```
