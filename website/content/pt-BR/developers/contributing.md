# Como Contribuir

Seria ótimo receber suas correções e contribuições para este projeto.

## Processo de Contribuição

### Revisões de Código

Todas as submissões, incluindo as feitas por membros do projeto, exigem revisão. Para esse fim, usamos [pull requests do GitHub](https://docs.github.com/articles/about-pull-requests).

### Diretrizes para Pull Requests

Para nos ajudar a revisar e mesclar suas pull requests rapidamente, siga estas diretrizes. Pull requests que não atenderem a esses critérios podem ser fechadas.

#### 1. Vincule-se a uma Issue Existente

Todos os PRs devem estar vinculados a uma issue existente em nosso sistema de acompanhamento. Isso garante que toda alteração tenha sido discutida e esteja alinhada com os objetivos do projeto antes mesmo de qualquer código ser escrito.

- **Para correções de bugs:** O PR deve estar vinculado à issue que relata o bug.
- **Para novas funcionalidades:** O PR deve estar vinculado à issue de solicitação ou proposta de funcionalidade que tenha sido aprovada por um mantenedor.

Se não houver uma issue para sua alteração, por favor **crie uma primeiro** e aguarde o retorno antes de começar a codificar.

#### 2. Mantenha-o Pequeno e Focado

Preferimos PRs pequenos e atômicos que resolvam uma única issue ou adicionem uma única funcionalidade autocontida.

- **Faça:** Crie um PR que corrija um bug específico ou adicione uma funcionalidade específica.
- **Não faça:** Agrupe várias alterações não relacionadas (por exemplo, uma correção de bug, uma nova funcionalidade e uma refatoração) em um único PR.

Alterações extensas devem ser divididas em uma série de PRs menores e logicamente coerentes, que possam ser revisados e mesclados de forma independente.

#### 3. Use PRs em rascunho para trabalho em andamento

Se você deseja obter feedback inicial sobre seu trabalho, use a funcionalidade **Pull Request em rascunho** do GitHub. Isso sinaliza aos mantenedores que a PR ainda não está pronta para uma revisão formal, mas está aberta para discussão e feedback inicial.

#### 4. Certifique-se de que todas as verificações passem

Antes de enviar sua PR, certifique-se de que todas as verificações automatizadas estejam aprovadas executando `npm run preflight`. Esse comando executa todos os testes, verificação de linting e outras verificações de estilo.

#### 5. Atualize a documentação

Se sua PR introduzir uma alteração visível ao usuário (por exemplo, um novo comando, uma flag modificada ou uma mudança no comportamento), você também deve atualizar a documentação relevante no diretório `/docs`.

#### 6. Escreva mensagens de commit claras e uma boa descrição de PR

Seu PR deve ter um título claro e descritivo, além de uma descrição detalhada das alterações realizadas. Siga o padrão [Conventional Commits](https://www.conventionalcommits.org/) para suas mensagens de commit.

- **Título de PR bom:** `feat(cli): Adicionar a flag --json ao comando 'config get'`
- **Título de PR ruim:** `Fiz algumas alterações`

Na descrição do PR, explique o "porquê" das suas alterações e vincule à issue relevante (por exemplo, `Fixes #123`).

## Configuração e fluxo de desenvolvimento

Esta seção orienta os colaboradores sobre como compilar, modificar e compreender a configuração de desenvolvimento deste projeto.

### Configurando o Ambiente de Desenvolvimento

**Pré-requisitos:**

1.  **Node.js**:
    - **Desenvolvimento:** Use o Node.js `~20.19.0`. Essa versão específica é necessária devido a um problema com uma dependência de desenvolvimento de terceiros. Você pode usar uma ferramenta como [nvm](https://github.com/nvm-sh/nvm) para gerenciar versões do Node.js.
    - **Produção:** Para executar a CLI em um ambiente de produção, qualquer versão do Node.js `>=20` é aceitável.
2.  **Git**

### Processo de Build

Para clonar o repositório:

```bash
git clone https://github.com/QwenLM/qwen-code.git # Ou a URL do seu fork
cd qwen-code
```

Para instalar as dependências definidas em `package.json`, bem como as dependências raiz:

```bash
npm install
```

Para compilar todo o projeto (todos os pacotes):

```bash
npm run build
```

Esse comando normalmente compila TypeScript para JavaScript, empacota os recursos e prepara os pacotes para execução. Consulte os arquivos `scripts/build.js` e os scripts definidos em `package.json` para obter mais detalhes sobre o que ocorre durante o processo de build.

### Habilitando o Sandbox

O [sandbox](#sandboxing) é altamente recomendado e exige, no mínimo, definir `QWEN_SANDBOX=true` no seu arquivo `~/.env` e garantir que um provedor de sandbox (por exemplo, `macOS Seatbelt`, `docker` ou `podman`) esteja disponível. Consulte [Sandbox](#sandboxing) para obter detalhes.

Para compilar tanto o utilitário de linha de comando `qwen-code` quanto o contêiner do sandbox, execute `build:all` a partir do diretório raiz:

```bash
npm run build:all
```

Para pular a compilação do contêiner do sandbox, você pode usar `npm run build` em vez disso.

### Executando

Para iniciar a aplicação Qwen Code a partir do código-fonte (após a compilação), execute o seguinte comando a partir do diretório raiz:

```bash
npm start
```

Se você deseja executar a compilação do código-fonte fora da pasta `qwen-code`, pode utilizar `npm link path/to/qwen-code/packages/cli` (consulte: [documentação](https://docs.npmjs.com/cli/v9/commands/npm-link)) para executar com o comando `qwen-code`.

### Executando Testes

Este projeto contém dois tipos de testes: testes unitários e testes de integração.

#### Testes de Unidade

Para executar a suíte de testes de unidade do projeto:

```bash
npm run test
```

Isso executará os testes localizados nos diretórios `packages/core` e `packages/cli`. Certifique-se de que todos os testes passem antes de enviar quaisquer alterações. Para uma verificação mais abrangente, recomenda-se executar `npm run preflight`.

#### Testes de Integração

Os testes de integração são projetados para validar a funcionalidade ponta a ponta do Qwen Code. Eles não são executados como parte do comando padrão `npm run test`.

Para executar os testes de integração, use o seguinte comando:

```bash
npm run test:e2e
```

Para obter informações mais detalhadas sobre a estrutura de testes de integração, consulte a [documentação de Testes de Integração](./docs/integration-tests.md).

### Verificação de Linting e Pré-voo

Para garantir a qualidade do código e a consistência de formatação, execute a verificação pré-voo:

```bash
npm run preflight
```

Este comando executa o ESLint, o Prettier, todos os testes e outras verificações definidas no arquivo `package.json` do projeto.

_Dica profissional_

Após clonar o repositório, crie um *hook* de pré-commit do Git para garantir que seus commits sempre estejam limpos.

```bash
echo "

# Executa npm build e verifica erros
if ! npm run preflight; then
  echo "Falha ao executar npm build. Commit abortado."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatação

Para formatar separadamente o código deste projeto, execute o seguinte comando a partir do diretório raiz:

```bash
npm run format
```

Este comando usa o Prettier para formatar o código de acordo com as diretrizes de estilo do projeto.

#### Linting

Para executar separadamente o linting do código neste projeto, execute o seguinte comando a partir do diretório raiz:

```bash
npm run lint
```

### Convenções de Codificação

- Adira ao estilo de codificação, aos padrões e às convenções utilizados em todo o código existente.
- **Importações:** Preste atenção especial aos caminhos das importações. O projeto usa o ESLint para impor restrições sobre importações relativas entre pacotes.

### Estrutura do Projeto

- `packages/`: Contém os subpacotes individuais do projeto.
  - `cli/`: A interface de linha de comando.
  - `core/`: A lógica principal do backend do Qwen Code.
- `docs/`: Contém toda a documentação do projeto.
- `scripts/`: Scripts utilitários para compilação, testes e tarefas de desenvolvimento.

Para uma arquitetura mais detalhada, consulte `docs/architecture.md`.

## Desenvolvimento da Documentação

Esta seção descreve como desenvolver e visualizar a documentação localmente.

### Pré-requisitos

1. Certifique-se de ter o Node.js (versão 18 ou superior) instalado.
2. Tenha o npm ou o yarn disponíveis.

### Configurar o Site da Documentação Localmente

Para trabalhar na documentação e visualizar as alterações localmente:

1. Acesse o diretório `docs-site`:

   ```bash
   cd docs-site
   ```

2. Instale as dependências:

   ```bash
   npm install
   ```

3. Crie um link simbólico para o conteúdo da documentação a partir do diretório principal `docs`:

   ```bash
   npm run link
   ```

   Isso cria um link simbólico de `../docs` para `content` no projeto `docs-site`, permitindo que o conteúdo da documentação seja servido pelo site Next.js.

4. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

5. Abra [http://localhost:3000](http://localhost:3000) no seu navegador para visualizar o site da documentação com atualizações em tempo real conforme você faz alterações.

Quaisquer alterações feitas nos arquivos de documentação no diretório principal `docs` serão refletidas imediatamente no site da documentação.

## Depuração

### VS Code:

0.  Execute a CLI para depurar interativamente no VS Code com `F5`.
1.  Inicie a CLI em modo de depuração a partir do diretório raiz:
    ```bash
    npm run debug
    ```
    Este comando executa `node --inspect-brk dist/index.js` dentro do diretório `packages/cli`, pausando a execução até que um depurador seja anexado. Em seguida, você pode abrir `chrome://inspect` no seu navegador Chrome para se conectar ao depurador.
2.  No VS Code, use a configuração de inicialização "Attach" (encontrada em `.vscode/launch.json`).

Como alternativa, você pode usar a configuração "Launch Program" no VS Code, caso prefira iniciar diretamente o arquivo atualmente aberto, mas recomenda-se geralmente o uso de `F5`.

Para atingir um ponto de interrupção dentro do contêiner sandbox, execute:

```bash
DEBUG=1 qwen-code
```

**Observação:** Se você tiver `DEBUG=true` em um arquivo `.env` de um projeto, isso não afetará o `qwen-code`, pois ele é automaticamente excluído. Use arquivos `.qwen-code/.env` para configurações específicas de depuração do `qwen-code`.

### React DevTools

Para depurar a interface do usuário baseada em React da CLI, você pode usar o React DevTools. O Ink, a biblioteca usada para a interface da CLI, é compatível com a versão 4.x do React DevTools.

1.  **Inicie a aplicação Qwen Code em modo de desenvolvimento:**

    ```bash
    DEV=true npm start
    ```

2.  **Instale e execute o React DevTools versão 4.28.5 (ou a versão mais recente compatível da série 4.x):**

    Você pode instalá-lo globalmente:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Ou executá-lo diretamente usando o `npx`:

    ```bash
    npx react-devtools@4.28.5
    ```

    Sua aplicação CLI em execução deverá então se conectar ao React DevTools.

## Sandbox

> A definir

## Publicação manual

Publicamos um artefato para cada commit no nosso registro interno. No entanto, se você precisar gerar manualmente uma compilação local, execute os seguintes comandos:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```