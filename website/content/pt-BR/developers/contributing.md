---
description: "Leia o guia de contribuição do Qwen Code para configurar ambiente, seguir regras de commit, rodar testes e enviar PRs com mais segurança."
---

# Como Contribuir

Adoraríamos aceitar seus patches e contribuições para este projeto.

## Processo de Contribuição

### Revisões de Código

Todas as submissões, incluindo as feitas por membros do projeto, exigem revisão. Utilizamos [pull requests do GitHub](https://docs.github.com/articles/about-pull-requests) para esse fim.

### Diretrizes para Pull Requests

Para nos ajudar a revisar e fazer merge dos seus PRs rapidamente, siga estas diretrizes. PRs que não atenderem a esses padrões poderão ser fechados.

#### 1. Vincule a uma Issue Existente

Todos os PRs devem ser vinculados a uma issue existente em nosso tracker. Isso garante que cada alteração tenha sido discutida e esteja alinhada aos objetivos do projeto antes que qualquer código seja escrito.

- **Para correções de bugs:** O PR deve ser vinculado à issue do relatório de bug.
- **Para novas funcionalidades:** O PR deve ser vinculado à issue de solicitação ou proposta de funcionalidade que tenha sido aprovada por um mantenedor.

Se não houver uma issue para sua alteração, **abra uma primeiro** e aguarde o feedback antes de começar a codificar.

#### 2. Mantenha Pequeno e Focado

Preferimos PRs pequenos e atômicos que resolvam uma única issue ou adicionem uma única funcionalidade independente.

- **Faça:** Crie um PR que corrija um bug específico ou adicione uma funcionalidade específica.
- **Não faça:** Agrupe várias alterações não relacionadas (ex.: correção de bug, nova funcionalidade e refatoração) em um único PR.

Alterações grandes devem ser divididas em uma série de PRs menores e lógicos, que possam ser revisados e incorporados independentemente.

#### 3. Use Draft PRs para Trabalho em Andamento

Se quiser obter feedback antecipado sobre seu trabalho, use o recurso **Draft Pull Request** do GitHub. Isso sinaliza aos mantenedores que o PR ainda não está pronto para uma revisão formal, mas está aberto para discussão e feedback inicial.

#### 4. Garanta que Todas as Verificações Passem

Antes de enviar seu PR, garanta que todas as verificações automatizadas estejam passando executando `npm run preflight`. Este comando executa todos os testes, linting e outras verificações de estilo.

#### 5. Atualize a Documentação

Se o seu PR introduzir uma alteração visível ao usuário (ex.: um novo comando, uma flag modificada ou uma mudança de comportamento), você também deve atualizar a documentação relevante no diretório `/docs`.

#### 6. Escreva Mensagens de Commit Claras e uma Boa Descrição de PR

Seu PR deve ter um título claro e descritivo, além de uma descrição detalhada das alterações. Siga o padrão [Conventional Commits](https://www.conventionalcommits.org/) para suas mensagens de commit.

- **Bom Título de PR:** `feat(cli): Add --json flag to 'config get' command`
- **Mau Título de PR:** `Made some changes`

Na descrição do PR, explique o "porquê" por trás das suas alterações e vincule à issue relevante (ex.: `Fixes #123`).

## Configuração e Fluxo de Trabalho de Desenvolvimento

Esta seção orienta os contribuidores sobre como compilar, modificar e entender a configuração de desenvolvimento deste projeto.

### Configurando o Ambiente de Desenvolvimento

**Pré-requisitos:**

1.  **Node.js**:
    - **Desenvolvimento:** Utilize o Node.js `~20.19.0`. Esta versão específica é necessária devido a um problema em uma dependência de desenvolvimento upstream. Você pode usar uma ferramenta como o [nvm](https://github.com/nvm-sh/nvm) para gerenciar versões do Node.js.
    - **Produção:** Para executar a CLI em um ambiente de produção, qualquer versão do Node.js `>=20` é aceitável.
2.  **Git**

### Processo de Build

Para clonar o repositório:

```bash
git clone https://github.com/QwenLM/qwen-code.git # Or your fork's URL
cd qwen-code
```

Para instalar as dependências definidas em `package.json`, bem como as dependências raiz:

```bash
npm install
```

Para compilar o projeto inteiro (todos os pacotes):

```bash
npm run build
```

Este comando geralmente compila TypeScript para JavaScript, empacota os assets e prepara os pacotes para execução. Consulte `scripts/build.js` e os scripts em `package.json` para mais detalhes sobre o que acontece durante o build.

### Habilitando o Sandboxing

O [Sandboxing](#sandboxing) é altamente recomendado e exige, no mínimo, definir `QWEN_SANDBOX=true` no seu `~/.env` e garantir que um provedor de sandboxing (ex.: `macOS Seatbelt`, `docker` ou `podman`) esteja disponível. Consulte [Sandboxing](#sandboxing) para detalhes.

Para compilar tanto o utilitário CLI `qwen-code` quanto o container de sandbox, execute `build:all` no diretório raiz:

```bash
npm run build:all
```

Para pular a compilação do container de sandbox, você pode usar `npm run build` em vez disso.

### Executando

Para iniciar a aplicação Qwen Code a partir do código-fonte (após a compilação), execute o seguinte comando no diretório raiz:

```bash
npm start
```

Se quiser executar o build do código-fonte fora da pasta qwen-code, você pode utilizar `npm link path/to/qwen-code/packages/cli` (consulte: [docs](https://docs.npmjs.com/cli/v9/commands/npm-link)) para executar com `qwen-code`

### Executando Testes

Este projeto contém dois tipos de testes: testes unitários e testes de integração.

#### Testes Unitários

Para executar a suíte de testes unitários do projeto:

```bash
npm run test
```

Isso executará os testes localizados nos diretórios `packages/core` e `packages/cli`. Garanta que os testes passem antes de enviar qualquer alteração. Para uma verificação mais abrangente, recomenda-se executar `npm run preflight`.

#### Testes de Integração

Os testes de integração são projetados para validar a funcionalidade end-to-end do Qwen Code. Eles não são executados como parte do comando padrão `npm run test`.

Para executar os testes de integração, use o seguinte comando:

```bash
npm run test:e2e
```

Para informações mais detalhadas sobre o framework de testes de integração, consulte a [documentação de Testes de Integração](./docs/integration-tests.md).

### Linting e Verificações de Preflight

Para garantir a qualidade do código e a consistência da formatação, execute a verificação de preflight:

```bash
npm run preflight
```

Este comando executará o ESLint, Prettier, todos os testes e outras verificações conforme definido no `package.json` do projeto.

_Dica Pro_

após clonar, crie um arquivo de git precommit hook para garantir que seus commits estejam sempre limpos.

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

Para formatar separadamente o código neste projeto, execute o seguinte comando no diretório raiz:

```bash
npm run format
```

Este comando usa o Prettier para formatar o código de acordo com as diretrizes de estilo do projeto.

#### Linting

Para executar o lint separadamente no código deste projeto, execute o seguinte comando no diretório raiz:

```bash
npm run lint
```

### Convenções de Codificação

- Siga o estilo de codificação, os padrões e as convenções usados em toda a base de código existente.
- **Imports:** Preste atenção especial aos caminhos de importação. O projeto usa ESLint para impor restrições a imports relativos entre pacotes.

### Estrutura do Projeto

- `packages/`: Contém os sub-pacotes individuais do projeto.
  - `cli/`: A interface de linha de comando.
  - `core/`: A lógica principal de backend do Qwen Code.
- `docs/`: Contém toda a documentação do projeto.
- `scripts/`: Scripts utilitários para tarefas de build, teste e desenvolvimento.

Para uma arquitetura mais detalhada, consulte `docs/architecture.md`.

## Desenvolvimento da Documentação

Esta seção descreve como desenvolver e visualizar a documentação localmente.

### Pré-requisitos

1. Certifique-se de ter o Node.js (versão 18+) instalado
2. Tenha o npm ou yarn disponível

### Configurando o Site de Documentação Localmente

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

Qualquer alteração feita nos arquivos de documentação no diretório principal `docs` será refletida imediatamente no site de documentação.

## Depuração

### VS Code:

0.  Execute a CLI para depurar interativamente no VS Code com `F5`
1.  Inicie a CLI no modo de depuração a partir do diretório raiz:
    ```bash
    npm run debug
    ```
    Este comando executa `node --inspect-brk dist/index.js` dentro do diretório `packages/cli`, pausando a execução até que um depurador se conecte. Você pode então abrir `chrome://inspect` no seu navegador Chrome para se conectar ao depurador.
2.  No VS Code, use a configuração de inicialização "Attach" (encontrada em `.vscode/launch.json`).

Alternativamente, você pode usar a configuração "Launch Program" no VS Code se preferir executar o arquivo aberto atualmente diretamente, mas 'F5' é geralmente recomendado.

Para atingir um breakpoint dentro do container de sandbox, execute:

```bash
DEBUG=1 qwen-code
```

**Nota:** Se você tiver `DEBUG=true` no arquivo `.env` de um projeto, isso não afetará o qwen-code devido à exclusão automática. Use arquivos `.qwen-code/.env` para configurações de depuração específicas do qwen-code.

### React DevTools

Para depurar a UI baseada em React da CLI, você pode usar o React DevTools. O Ink, biblioteca usada para a interface da CLI, é compatível com o React DevTools versão 4.x.

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

    Sua aplicação CLI em execução deve então se conectar ao React DevTools.

## Sandboxing

> TBD

## Publicação Manual

Publicamos um artifact para cada commit em nosso registry interno. Mas, se você precisar criar manualmente um build local, execute os seguintes comandos:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```