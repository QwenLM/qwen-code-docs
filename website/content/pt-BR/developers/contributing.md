# Como Contribuir

Adoraríamos receber seus patches e contribuições para este projeto.

## Processo de Contribuição

### Revisões de Código

Todas as submissões, inclusive de membros do projeto, exigem revisão. Utilizamos [solicitações de pull do GitHub](https://docs.github.com/articles/about-pull-requests) para esse fim.

### Diretrizes para Pull Requests

Para nos ajudar a revisar e mesclar seus PRs rapidamente, siga estas diretrizes. PRs que não atenderem a esses padrões podem ser fechados.

#### 1. Vincule a um Issue Existente

Todos os PRs devem estar vinculados a um issue existente em nosso rastreador. Isso garante que cada mudança tenha sido discutida e esteja alinhada com os objetivos do projeto antes de qualquer código ser escrito.

- **Para correções de bugs:** O PR deve estar vinculado ao issue do relatório de bug.
- **Para funcionalidades:** O PR deve estar vinculado ao issue de solicitação de funcionalidade ou proposta que foi aprovado por um mantenedor.

Se não existir um issue para sua mudança, por favor **abra um primeiro** e aguarde feedback antes de começar a codificar.

#### 2. Mantenha-o Pequeno e Focado

Preferimos PRs pequenos e atômicos que tratam de um único issue ou adicionam uma única funcionalidade autocontida.

- **Faça:** Crie um PR que corrija um bug específico ou adicione uma funcionalidade específica.
- **Não faça:** Agrupe múltiplas mudanças não relacionadas (por exemplo, uma correção de bug, uma nova funcionalidade e uma refatoração) em um único PR.

Como regra geral, comece a dividir um PR quando ele ultrapassar cerca de 1.200 linhas alteradas. PRs acima de cerca de 2.000 linhas alteradas devem ser divididos em uma série de PRs menores e lógicos que possam ser revisados e mesclados independentemente, ou explicar na descrição do PR por que a mudança precisa ser integrada em conjunto.

#### 3. Use PRs Rascunho para Trabalho em Andamento

Se você deseja obter feedback antecipado sobre seu trabalho, use o recurso **Draft Pull Request** do GitHub. Isso sinaliza para os mantenedores que o PR ainda não está pronto para uma revisão formal, mas está aberto para discussão e feedback inicial.

#### 4. Garanta que Todas as Verificações Passem

Antes de enviar seu PR, garanta que todas as verificações automatizadas estejam passando executando `npm run preflight`. Este comando executa todos os testes, linting e outras verificações de estilo.

#### 5. Atualize a Documentação

Se seu PR introduzir uma mudança visível ao usuário (por exemplo, um novo comando, uma flag modificada ou uma alteração de comportamento), você também deve atualizar a documentação relevante no diretório `/docs`.

#### 6. Escreva Mensagens de Commit Claras e uma Boa Descrição do PR

Seu PR deve ter um título claro e descritivo e uma descrição detalhada das mudanças. Siga o padrão [Conventional Commits](https://www.conventionalcommits.org/) para suas mensagens de commit.

- **Bom título de PR:** `feat(cli): Adicionar flag --json ao comando 'config get'`
- **Título ruim de PR:** `Algumas mudanças feitas`

Na descrição do PR, explique o "porquê" por trás de suas mudanças e vincule ao issue relevante (por exemplo, `Fixes #123`).

## Configuração de Desenvolvimento e Fluxo de Trabalho

Esta seção orienta os contribuidores sobre como construir, modificar e entender a configuração de desenvolvimento deste projeto.

### Configuração do Ambiente de Desenvolvimento

**Pré-requisitos:**

1.  **Node.js**:
    - **Desenvolvimento:** Use Node.js `>=22`. Ink 7 (usado pelo TUI) requer Node 22, e `react@^19.2.0` é o peer correspondente. Você pode usar uma ferramenta como [nvm](https://github.com/nvm-sh/nvm) para gerenciar versões do Node.js.
    - **Produção:** Para executar o CLI em um ambiente de produção, qualquer versão do Node.js `>=22` é aceitável.
2.  **Git**

### Processo de Build

Para clonar o repositório:

```bash
git clone https://github.com/QwenLM/qwen-code.git # Ou a URL do seu fork
cd qwen-code
```

Para instalar as dependências definidas em `package.json` e as dependências raiz:

```bash
npm install
```

Para construir todo o projeto (todos os pacotes):

```bash
npm run build
```

Este comando geralmente compila TypeScript para JavaScript, agrupa assets e prepara os pacotes para execução. Consulte `scripts/build.js` e os scripts em `package.json` para mais detalhes sobre o que acontece durante o build.

### Habilitando Sandboxing

[Sandboxing](#sandboxing) é altamente recomendado e requer, no mínimo, definir `QWEN_SANDBOX=true` no seu `~/.env` e garantir que um provedor de sandboxing (por exemplo, `macOS Seatbelt`, `docker` ou `podman`) esteja disponível. Consulte [Sandboxing](#sandboxing) para detalhes.

Para construir tanto o utilitário CLI `qwen` quanto o contêiner sandbox, execute `build:all` a partir do diretório raiz:

```bash
npm run build:all
```

Para pular a construção do contêiner sandbox, você pode usar `npm run build`.

### Execução

Para iniciar o aplicativo Qwen Code a partir do código-fonte (após o build), execute o seguinte comando a partir do diretório raiz:

```bash
npm start
```

Se você deseja executar o build de origem fora da pasta qwen-code, pode utilizar `npm link path/to/qwen-code/packages/cli` (veja: [docs](https://docs.npmjs.com/cli/v9/commands/npm-link)) para executar com `qwen`.

### Executando Testes

Este projeto contém dois tipos de testes: testes unitários e testes de integração.

#### Testes Unitários

Para executar a suíte de testes unitários do projeto:

```bash
npm run test
```

Isso executará os testes localizados nos diretórios `packages/core` e `packages/cli`. Certifique-se de que os testes passem antes de enviar qualquer alteração. Para uma verificação mais abrangente, é recomendado executar `npm run preflight`.

#### Testes de Integração

Os testes de integração são projetados para validar a funcionalidade de ponta a ponta do Qwen Code. Eles não são executados como parte do comando padrão `npm run test`.

Para executar os testes de integração, use o seguinte comando:

```bash
npm run test:e2e
```

Para obter informações mais detalhadas sobre o framework de testes de integração, consulte a [documentação de Testes de Integração](./development/integration-tests.md).

### Linting e Verificações de Preflight

Para garantir a qualidade do código e a consistência de formatação, execute a verificação preflight:

```bash
npm run preflight
```

Este comando executará ESLint, Prettier, todos os testes e outras verificações conforme definido no `package.json` do projeto.

_ProTip_

Após clonar, crie um arquivo de hook pre-commit do git para garantir que seus commits estejam sempre limpos.

```bash
echo "
# Executa npm build e verifica erros
if ! npm run preflight; then
  echo \"npm build falhou. Commit abortado.\"
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatação

Para formatar separadamente o código neste projeto, execute o seguinte comando a partir do diretório raiz:

```bash
npm run format
```

Este comando usa Prettier para formatar o código de acordo com as diretrizes de estilo do projeto.

#### Linting

Para executar o lint separadamente no código deste projeto, execute o seguinte comando a partir do diretório raiz:

```bash
npm run lint
```

### Convenções de Código

- Siga o estilo, padrões e convenções de código utilizados em toda a base de código existente.
- **Imports:** Preste atenção especial aos caminhos de import. O projeto usa ESLint para impor restrições sobre imports relativos entre pacotes.

### Estrutura do Projeto

- `packages/`: Contém os subpacotes individuais do projeto.
  - `cli/`: A interface de linha de comando.
  - `core/`: A lógica central de backend para o Qwen Code.
- `docs/`: Contém toda a documentação do projeto.
- `scripts/`: Scripts utilitários para tarefas de build, teste e desenvolvimento.

Para obter uma arquitetura mais detalhada, consulte `docs/architecture.md`.

## Desenvolvimento da Documentação

Esta seção descreve como desenvolver e visualizar a documentação localmente.

### Pré-requisitos

1. Certifique-se de ter o Node.js (versão 22+) instalado
2. Tenha npm ou yarn disponível

### Configuração do Site de Documentação Localmente

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

5. Abra [http://localhost:3000](http://localhost:3000) no seu navegador para ver o site de documentação com atualizações ao vivo conforme você faz alterações.

Quaisquer alterações feitas nos arquivos de documentação no diretório principal `docs` serão refletidas imediatamente no site de documentação.

## Depuração

### VS Code:

0. Execute o CLI para depurar interativamente no VS Code com `F5`
1. Inicie o CLI em modo de depuração a partir do diretório raiz:
    ```bash
    npm run debug
    ```
    Este comando executa `node --inspect-brk dist/index.js` dentro do diretório `packages/cli`, pausando a execução até que um depurador se conecte. Você pode então abrir `chrome://inspect` no seu navegador Chrome para conectar ao depurador.
2. No VS Code, use a configuração de inicialização "Attach" (encontrada em `.vscode/launch.json`).

Alternativamente, você pode usar a configuração "Launch Program" no VS Code se preferir iniciar o arquivo aberto diretamente, mas 'F5' é geralmente recomendado.

Para acertar um ponto de interrupção dentro do contêiner sandbox, execute:

```bash
DEBUG=1 qwen
```

**Nota:** Se você tiver `DEBUG=true` em um arquivo `.env` do projeto, isso não afetará `qwen` devido à exclusão automática. Use arquivos `.qwen/.env` para configurações de depuração específicas do `qwen`.

### React DevTools

Para depurar a interface de usuário baseada em React do CLI, você pode usar React DevTools. Ink, a biblioteca usada para a interface do CLI, é compatível com React DevTools versão 4.x.

1.  **Inicie o aplicativo Qwen Code em modo de desenvolvimento:**

    ```bash
    DEV=true npm start
    ```

2.  **Instale e execute React DevTools versão 4.28.5 (ou a versão compatível 4.x mais recente):**

    Você pode instalá-lo globalmente:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Ou executá-lo diretamente usando npx:

    ```bash
    npx react-devtools@4.28.5
    ```

    Seu aplicativo CLI em execução deve então se conectar ao React DevTools.

## Sandboxing

> Em breve

## Publicação Manual

Publicamos um artefato para cada commit em nosso registro interno. Mas se você precisar fazer um build local manualmente, execute os seguintes comandos:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```