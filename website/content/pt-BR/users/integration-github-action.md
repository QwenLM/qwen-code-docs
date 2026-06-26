# Github Actions：qwen-code-action

## Visão Geral

`qwen-code-action` é uma GitHub Action que integra o [Qwen Code] ao seu fluxo de desenvolvimento através da [Qwen Code CLI]. Ela atua tanto como um agente autônomo para tarefas críticas de rotina de codificação, quanto como um colaborador sob demanda para o qual você pode delegar tarefas rapidamente.

Use-a para realizar revisões de pull requests do GitHub, triar issues, fazer análise e modificação de código, e muito mais usando o [Qwen Code] de forma conversacional (ex.: `@qwencoder corrija este problema`) diretamente dentro dos seus repositórios do GitHub.

## Funcionalidades

- **Automação**: Acione workflows com base em eventos (ex.: abertura de issue) ou agendamentos (ex.: noturno).
- **Colaboração sob demanda**: Acione workflows em comentários de issues e pull requests mencionando a [Qwen Code CLI](./features/commands) (ex.: `@qwencoder /review`).
- **Extensível com ferramentas**: Aproveite a capacidade de chamada de ferramentas dos modelos [Qwen Code](../developers/tools/introduction.md) para interagir com outras CLIs como a [GitHub CLI] (`gh`).
- **Customizável**: Use um arquivo `QWEN.md` no seu repositório para fornecer instruções e contexto específicos do projeto para a [Qwen Code CLI](./features/commands).

## Início Rápido

Comece a usar a Qwen Code CLI no seu repositório em apenas alguns minutos:

### 1. Obtenha uma Chave de API do Qwen

Obtenha sua chave de API no [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (plataforma de IA da Alibaba Cloud).

### 2. Adicione como um Segredo do GitHub

Armazene sua chave de API como um segredo chamado `QWEN_API_KEY` no seu repositório:

- Acesse **Settings > Secrets and variables > Actions** do seu repositório.
- Clique em **New repository secret**.
- Nome: `QWEN_API_KEY`, Valor: sua chave de API.

### 3. Atualize seu .gitignore

Adicione as seguintes entradas ao seu arquivo `.gitignore`:

```gitignore
# configurações do qwen-code-cli
.qwen/

# credenciais do GitHub App
gha-creds-*.json
```

### 4. Escolha um Workflow

Você tem duas opções para configurar um workflow:

**Opção A: Usar o comando setup (Recomendado)**

1. Inicie a Qwen Code CLI no seu terminal:

   ```shell
   qwen
   ```

2. Na Qwen Code CLI do seu terminal, digite:

   ```
   /setup-github
   ```

**Opção B: Copiar workflows manualmente**

1. Copie os workflows pré-construídos do diretório [`examples/workflows`](./common-workflow) para o diretório `.github/workflows` do seu repositório. Nota: o workflow `qwen-dispatch.yml` também deve ser copiado, pois é ele que aciona a execução dos workflows.

### 5. Teste

**Revisão de Pull Request:**

- Abra um pull request no seu repositório e aguarde a revisão automática.
- Comente `@qwencoder /review` em um pull request existente para acionar uma revisão manualmente.

**Triagem de Issue:**

- Abra uma issue e aguarde a triagem automática.
- Comente `@qwencoder /triage` em issues existentes para acionar a triagem manualmente.

**Assistência Geral com IA:**

- Em qualquer issue ou pull request, mencione `@qwencoder` seguido da sua solicitação.
- Exemplos:
  - `@qwencoder explique esta alteração de código`
  - `@qwencoder sugira melhorias para esta função`
  - `@qwencoder ajude-me a depurar este erro`
  - `@qwencoder escreva testes unitários para este componente`

## Workflows

Esta ação fornece vários workflows pré-construídos para diferentes casos de uso. Cada workflow foi projetado para ser copiado para o diretório `.github/workflows` do seu repositório e customizado conforme necessário.

### Dispatch do Qwen Code

Este workflow atua como um despachante central para a Qwen Code CLI, roteando solicitações para o workflow apropriado com base no evento que o acionou e no comando fornecido no comentário. Para um guia detalhado sobre como configurar o workflow de dispatch, acesse a [documentação do workflow Qwen Code Dispatch](./common-workflow).

### Triagem de Issue

Esta ação pode ser usada para triar issues do GitHub automaticamente ou em um agendamento. Para uma configuração funcional de triagem de issues, veja o [workflow de triagem automatizada de issues](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Revisão de Pull Request

Esta ação pode ser usada para revisar automaticamente pull requests quando eles são abertos. Para um guia detalhado sobre como configurar o sistema de revisão de pull requests, acesse a [documentação do workflow de Revisão de PR no GitHub](./common-workflow).

### Assistente da Qwen Code CLI

Este tipo de ação pode ser usado para invocar um assistente de IA conversacional de propósito geral do Qwen Code dentro de pull requests e issues para realizar uma ampla gama de tarefas. Para um guia detalhado sobre como configurar o workflow de propósito geral da Qwen Code CLI, acesse a [documentação do workflow do Assistente Qwen Code](./common-workflow).

## Configuração

### Inputs

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Opcional)\_ A chave de API para a API do Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Opcional, padrão: `latest`)\_ A versão da Qwen Code CLI a ser instalada. Pode ser "latest", "preview", "nightly", um número de versão específico, ou um branch, tag ou commit do git. Para mais informações, veja [Lançamentos da Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Opcional)\_ Habilita logging de depuração e streaming de saída.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Opcional)\_ O modelo a ser usado com o Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Opcional, padrão: `You are a helpful assistant.`)_ Uma string passada para o argumento [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) da Qwen Code CLI.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Opcional)_ Uma string JSON gravada em `.qwen/settings.json` para configurar as configurações de _projeto_ da CLI.
  Para mais detalhes, veja a documentação sobre [arquivos de configuração](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Opcional, padrão: `false`)\_ Se deve usar o Code Assist para acesso ao modelo Qwen Code em vez da chave de API padrão do Qwen.
  Para mais informações, veja a [documentação da Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Opcional, padrão: `false`)\_ Se deve usar o Vertex AI para acesso ao modelo Qwen Code em vez da chave de API padrão do Qwen.
  Para mais informações, veja a [documentação da Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Opcional)_ Uma lista de extensões da Qwen Code CLI para instalar.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Opcional, padrão: `false`)\_ Se deve fazer upload de artefatos para a GitHub Action.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Opcional, padrão: `false`)\_ Se deve usar pnpm em vez de npm para instalar o qwen-code-cli.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Opcional, padrão: `${{ github.workflow }}`)\_ O nome do workflow do GitHub, usado para fins de telemetria.

<!-- END_AUTOGEN_INPUTS -->

### Outputs

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: A saída resumida da execução da Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: A saída de erro da execução da Qwen Code CLI, se houver.

<!-- END_AUTOGEN_OUTPUTS -->

### Variáveis do Repositório

Recomendamos definir os seguintes valores como variáveis do repositório para que possam ser reutilizados em todos os workflows. Alternativamente, você pode defini-los inline como inputs de ação em workflows individuais ou para sobrescrever valores no nível do repositório.

| Nome               | Descrição                                                | Tipo     | Obrigatório | Quando Obrigatório             |
| ------------------ | -------------------------------------------------------- | -------- | ----------- | ------------------------------ |
| `DEBUG`            | Habilita logging de depuração para a Qwen Code CLI.      | Variável | Não         | Nunca                          |
| `QWEN_CLI_VERSION` | Controla qual versão da Qwen Code CLI é instalada.       | Variável | Não         | Ao fixar a versão da CLI       |
| `APP_ID`           | ID do GitHub App para autenticação personalizada.        | Variável | Não         | Ao usar um GitHub App personalizado |

Para adicionar uma variável do repositório:

1. Acesse **Settings > Secrets and variables > Actions > New variable** do seu repositório.
2. Insira o nome e o valor da variável.
3. Salve.

Para detalhes sobre variáveis do repositório, consulte a [documentação do GitHub sobre variáveis][variables].

### Segredos

Você pode definir os seguintes segredos no seu repositório:

| Nome              | Descrição                                  | Obrigatório | Quando Obrigatório                              |
| ----------------- | ------------------------------------------ | ----------- | ----------------------------------------------- |
| `QWEN_API_KEY`    | Sua chave de API do Qwen do DashScope.     | Sim         | Obrigatório para todos os workflows que chamam o Qwen. |
| `APP_PRIVATE_KEY` | Chave privada para seu GitHub App (formato PEM). | Não         | Ao usar um GitHub App personalizado.            |

Para adicionar um segredo:

1. Acesse **Settings > Secrets and variables > Actions > New repository secret** do seu repositório.
2. Insira o nome e o valor do segredo.
3. Salve.

Para mais informações, consulte a [documentação oficial do GitHub sobre criação e uso de segredos criptografados][secrets].

## Autenticação

Esta ação requer autenticação na API do GitHub e, opcionalmente, nos serviços do Qwen Code.

### Autenticação do GitHub

Você pode autenticar no GitHub de duas formas:

1. **`GITHUB_TOKEN` padrão:** Para casos de uso mais simples, a ação pode usar o
   `GITHUB_TOKEN` padrão fornecido pelo workflow.
2. **GitHub App personalizado (Recomendado):** Para a autenticação mais segura e
   flexível, recomendamos criar um GitHub App personalizado.

Para instruções detalhadas de configuração tanto para autenticação no Qwen quanto no GitHub, acesse a
[**documentação de Autenticação**](./configuration/auth).

## Extensões

A Qwen Code CLI pode ser estendida com funcionalidades adicionais através de extensões.
Essas extensões são instaladas a partir do código-fonte de seus repositórios no GitHub.

Para instruções detalhadas sobre como configurar e configurar extensões, acesse a
[documentação de Extensões](./extension/introduction.md).

## Melhores Práticas

Para garantir a segurança, confiabilidade e eficiência dos seus workflows automatizados, recomendamos fortemente seguir nossas melhores práticas. Essas diretrizes cobrem áreas-chave como segurança do repositório, configuração de workflow e monitoramento.

Recomendações principais incluem:

- **Protegendo seu Repositório:** Implementando proteção de branches e tags, e restringindo aprovadores de pull requests.
- **Monitoramento e Auditoria:** Revisando regularmente os logs das ações e habilitando OpenTelemetry para insights mais profundos sobre desempenho e comportamento.

Para um guia abrangente sobre como proteger seu repositório e workflows, consulte nossa [**documentação de Melhores Práticas**](./common-workflow).

## Customização

Crie um arquivo QWEN.md na raiz do seu repositório para fornecer
contexto e instruções específicos do projeto para a [Qwen Code CLI](./common-workflow). Isso é útil para definir
convenções de codificação, padrões arquiteturais ou outras diretrizes que o modelo
deve seguir para um determinado repositório.

## Contribuindo

Contribuições são bem-vindas! Consulte o **Guia de Contribuição** da Qwen Code CLI para mais detalhes sobre como começar.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context