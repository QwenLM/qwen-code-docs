# Como Contribuir

Adoraríamos aceitar seus patches e contribuições para este projeto.

## Processo de Contribuição

### Revisões de Código

Todas as submissões, incluindo submissões de membros do projeto, requerem revisão. Usamos [pull requests do GitHub](https://docs.github.com/articles/about-pull-requests) para este propósito.

### Diretrizes de Pull Request

Para nos ajudar a revisar e mesclar seus PRs rapidamente, siga estas diretrizes. PRs que não atenderem a esses padrões podem ser fechados.

#### 1. Vincule a uma Issue Existente

Todos os PRs devem estar vinculados a uma issue existente em nosso tracker. Isso garante que cada alteração tenha sido discutida e esteja alinhada com os objetivos do projeto antes que qualquer código seja escrito.

- **Para correções de bugs:** O PR deve estar vinculado à issue do relatório do bug.
- **Para funcionalidades:** O PR deve estar vinculado à issue de solicitação ou proposta de funcionalidade que foi aprovada por um mantenedor.

Se não existir uma issue para sua alteração, por favor **abra uma primeiro** e aguarde feedback antes de começar a codificar.

#### 2. Mantenha Pequeno e Focado

Preferimos PRs pequenos e atômicos que abordem uma única issue ou adicionem uma funcionalidade específica e autocontida.

- **Faça:** Crie um PR que corrija um bug específico ou adicione uma funcionalidade específica.
- **Não faça:** Agrupe múltiplas alterações não relacionadas (por exemplo, uma correção de bug, uma nova funcionalidade e uma refatoração) em um único PR.

Alterações grandes devem ser divididas em uma série de PRs menores e lógicos que possam ser revisados e mesclados independentemente.

#### 3. Use Draft PRs para Trabalho em Andamento

Se você deseja obter feedback precoce sobre seu trabalho, utilize o recurso de **Draft Pull Request** do GitHub. Isso indica aos mantenedores que o PR ainda não está pronto para uma revisão formal, mas está aberto para discussão e feedback inicial.

#### 4. Certifique-se de que Todas as Verificações Passam

Antes de enviar seu PR, certifique-se de que todas as verificações automatizadas estão passando executando `npm run preflight`. Este comando executa todos os testes, linting e outras verificações de estilo.

#### 5. Atualize a Documentação

Se seu PR introduz uma mudança visível ao usuário (por exemplo, um novo comando, uma flag modificada ou uma alteração no comportamento), você também deve atualizar a documentação relevante no diretório `/docs`.

#### 6. Escreva Mensagens de Commit Claras e uma Boa Descrição do PR

Seu PR deve ter um título claro e descritivo, além de uma descrição detalhada das alterações. Siga o padrão [Conventional Commits](https://www.conventionalcommits.org/) para suas mensagens de commit.

- **Bom Título de PR:** `feat(cli): Add --json flag to 'config get' command`
- **Título Ruim de PR:** `Fiz algumas mudanças`

Na descrição do PR, explique o "porquê" por trás de suas alterações e vincule à issue relevante (ex.: `Fixes #123`).

## Configuração e Fluxo de Desenvolvimento

Esta seção orienta os colaboradores sobre como construir, modificar e entender a configuração de desenvolvimento deste projeto.

### Configurando o Ambiente de Desenvolvimento

**Pré-requisitos:**

1.  **Node.js**:
    - **Desenvolvimento:** Por favor, utilize o Node.js `~20.19.0`. Esta versão específica é necessária devido a um problema com uma dependência de desenvolvimento upstream. Você pode utilizar uma ferramenta como [nvm](https://github.com/nvm-sh/nvm) para gerenciar as versões do Node.js.
    - **Produção:** Para executar a CLI em um ambiente de produção, qualquer versão do Node.js `>=20` é aceitável.
2.  **Git**

### Processo de Build

Para clonar o repositório:

```bash
git clone https://github.com/QwenLM/qwen-code.git # Ou a URL do seu fork
cd qwen-code
```

Para instalar as dependências definidas no `package.json`, bem como as dependências raiz:

```bash
npm install
```

Para construir todo o projeto (todos os pacotes):

```bash
npm run build
```

Este comando geralmente compila o TypeScript para JavaScript, agrupa os recursos e prepara os pacotes para execução. Consulte `scripts/build.js` e os scripts em `package.json` para obter mais detalhes sobre o que acontece durante o build.

### Ativando o Sandbox

O [Sandboxing](#sandboxing) é altamente recomendado e requer, no mínimo, definir `QWEN_SANDBOX=true` no seu `~/.env` e garantir que um provedor de sandboxing (por exemplo, `macOS Seatbelt`, `docker` ou `podman`) esteja disponível. Veja [Sandboxing](#sandboxing) para mais detalhes.

Para construir tanto o utilitário CLI `qwen-code` quanto o contêiner do sandbox, execute `build:all` a partir do diretório raiz:

```bash
npm run build:all
```

Para pular a construção do contêiner do sandbox, você pode usar `npm run build` em vez disso.

### Executando

Para iniciar o aplicativo Qwen Code a partir do código-fonte (após a compilação), execute o seguinte comando a partir do diretório raiz:

```bash
npm start
```

Se você quiser executar a compilação do código-fonte fora da pasta qwen-code, pode utilizar `npm link path/to/qwen-code/packages/cli` (veja: [documentação](https://docs.npmjs.com/cli/v9/commands/npm-link)) para executar com `qwen-code`

### Executando Testes

Este projeto contém dois tipos de testes: testes unitários e testes de integração.

#### Testes Unitários

Para executar a suíte de testes unitários do projeto:

```bash
npm run test
```

Isso irá executar os testes localizados nos diretórios `packages/core` e `packages/cli`. Certifique-se de que todos os testes passem antes de enviar quaisquer alterações. Para uma verificação mais abrangente, é recomendado executar `npm run preflight`.

#### Testes de Integração

Os testes de integração são projetados para validar a funcionalidade de ponta a ponta do Qwen Code. Eles não são executados como parte do comando padrão `npm run test`.

Para executar os testes de integração, utilize o seguinte comando:

```bash
npm run test:e2e
```

Para obter informações mais detalhadas sobre o framework de testes de integração, consulte a [documentação de Testes de Integração](./docs/integration-tests.md).

### Linting e Verificações de Pré-voo

Para garantir a qualidade do código e a consistência da formatação, execute a verificação de pré-voo:

```bash
npm run preflight
```

Este comando irá executar o ESLint, o Prettier, todos os testes e outras verificações conforme definido no `package.json` do projeto.

_Dica Profissional_

após clonar, crie um arquivo de hook de precommit do git para garantir que seus commits estejam sempre limpos.

```bash
echo "

# Executar npm build e verificar erros
if ! npm run preflight; then
  echo "npm build falhou. Commit abortado."
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

Para fazer linting separadamente do código neste projeto, execute o seguinte comando a partir do diretório raiz:

```bash
npm run lint
```

### Convenções de Codificação

- Por favor, siga o estilo de codificação, padrões e convenções utilizados em toda a base de código existente.
- **Imports:** Preste atenção especial aos caminhos de importação. O projeto utiliza o ESLint para impor restrições sobre imports relativos entre pacotes.

### Estrutura do Projeto

- `packages/`: Contém os subpacotes individuais do projeto.
  - `cli/`: A interface de linha de comando.
  - `core/`: A lógica principal do backend para o Qwen Code.
- `docs/`: Contém toda a documentação do projeto.
- `scripts/`: Scripts utilitários para build, testes e tarefas de desenvolvimento.

Para uma arquitetura mais detalhada, consulte `docs/architecture.md`.

## Desenvolvimento da Documentação

Esta seção descreve como desenvolver e visualizar a documentação localmente.

### Pré-requisitos

1. Certifique-se de ter o Node.js (versão 18+) instalado
2. Tenha o npm ou yarn disponível

### Configurar o Site de Documentação Localmente

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

0.  Execute o CLI para depurar interativamente no VS Code com `F5`
1.  Inicie o CLI em modo de depuração a partir do diretório raiz:
    ```bash
    npm run debug
    ```
    Este comando executa `node --inspect-brk dist/index.js` dentro do diretório `packages/cli`, pausando a execução até que um depurador se conecte. Você pode então abrir `chrome://inspect` no seu navegador Chrome para se conectar ao depurador.
2.  No VS Code, utilize a configuração de inicialização "Attach" (encontrada em `.vscode/launch.json`).

Alternativamente, você pode usar a configuração "Launch Program" no VS Code caso prefira iniciar diretamente o arquivo atualmente aberto, mas recomenda-se geralmente usar 'F5'.

Para atingir um ponto de interrupção dentro do contêiner sandbox execute:

```bash
DEBUG=1 qwen-code
```

**Nota:** Se você tiver `DEBUG=true` em um arquivo `.env` do projeto, isso não afetará o qwen-code devido à exclusão automática. Utilize arquivos `.qwen-code/.env` para configurações específicas de depuração do qwen-code.

### React DevTools

Para depurar a interface do usuário baseada em React da CLI, você pode usar o React DevTools. O Ink, a biblioteca usada para a interface da CLI, é compatível com a versão 4.x do React DevTools.

1.  **Inicie o aplicativo Qwen Code no modo de desenvolvimento:**

    ```bash
    DEV=true npm start
    ```

2.  **Instale e execute o React DevTools versão 4.28.5 (ou a última versão compatível 4.x):**

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

> TBD

## Publicação Manual

Publicamos um artefato para cada commit em nosso registro interno. Mas se você precisar criar manualmente uma build local, execute os seguintes comandos:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```