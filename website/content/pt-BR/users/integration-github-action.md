# GitHub Actions: qwen-code-action

## Visão geral

`qwen-code-action` é uma GitHub Action que integra o [Qwen Code] ao seu fluxo de desenvolvimento via [Qwen Code CLI]. Ela atua tanto como um agente autônomo para tarefas críticas de codificação rotineiras, quanto como um colaborador sob demanda ao qual você pode delegar trabalho rapidamente.

Use-a para realizar revisões de pull requests no GitHub, triagem de issues, análise e modificação de código, e muito mais, usando o [Qwen Code] de forma conversacional (ex.: `@qwencoder fix this issue`) diretamente nos seus repositórios do GitHub.

## Recursos

- **Automação**: Dispare workflows com base em eventos (ex.: abertura de issue) ou agendamentos (ex.: diariamente).
- **Colaboração sob demanda**: Dispare workflows em comentários de issues e pull requests mencionando o [Qwen Code CLI](./features/commands) (ex.: `@qwencoder /review`).
- **Extensível com ferramentas**: Aproveite os recursos de chamada de ferramentas dos modelos do [Qwen Code](../developers/tools/introduction.md) para interagir com outras CLIs, como a [GitHub CLI] (`gh`).
- **Personalizável**: Use um arquivo `QWEN.md` no seu repositório para fornecer instruções e contextos específicos do projeto para o [Qwen Code CLI](./features/commands).

## Início rápido

Comece a usar o Qwen Code CLI no seu repositório em apenas alguns minutos:

### 1. Obtenha uma API key do Qwen

Obtenha sua API key no [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (plataforma de IA da Alibaba Cloud)

### 2. Adicione-a como um Secret do GitHub

Armazene sua API key como um secret chamado `QWEN_API_KEY` no seu repositório:

- Vá em **Settings > Secrets and variables > Actions** do seu repositório
- Clique em **New repository secret**
- Name: `QWEN_API_KEY`, Value: sua API key

### 3. Atualize seu .gitignore

Adicione as seguintes entradas ao seu arquivo `.gitignore`:

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. Escolha um Workflow

Você tem duas opções para configurar um workflow:

**Opção A: Usar o comando setup (Recomendado)**

1. Inicie o Qwen Code CLI no seu terminal:

   ```shell
   qwen
   ```

2. No Qwen Code CLI no seu terminal, digite:

   ```
   /setup-github
   ```

**Opção B: Copiar workflows manualmente**

1. Copie os workflows pré-construídos do diretório [`examples/workflows`](./common-workflow) para o diretório `.github/workflows` do seu repositório. Nota: o workflow `qwen-dispatch.yml` também deve ser copiado, pois é ele que dispara a execução dos workflows.

### 5. Teste

**Revisão de Pull Request:**

- Abra um pull request no seu repositório e aguarde a revisão automática
- Comente `@qwencoder /review` em um pull request existente para disparar uma revisão manualmente

**Triagem de Issues:**

- Abra uma issue e aguarde a triagem automática
- Comente `@qwencoder /triage` em issues existentes para disparar a triagem manualmente

**Assistência Geral de IA:**

- Em qualquer issue ou pull request, mencione `@qwencoder` seguido da sua solicitação
- Exemplos:
  - `@qwencoder explique essa alteração de código`
  - `@qwencoder sugira melhorias para esta função`
  - `@qwencoder me ajude a depurar este erro`
  - `@qwencoder escreva testes unitários para este componente`

## Workflows

Esta action fornece vários workflows pré-construídos para diferentes casos de uso. Cada workflow foi projetado para ser copiado para o diretório `.github/workflows` do seu repositório e personalizado conforme necessário.

### Qwen Code Dispatch

Este workflow atua como um dispatcher central para o Qwen Code CLI, roteando solicitações para o workflow apropriado com base no evento disparador e no comando fornecido no comentário. Para um guia detalhado sobre como configurar o workflow de dispatch, acesse a [documentação do workflow Qwen Code Dispatch](./common-workflow).

### Triagem de Issues

Esta action pode ser usada para fazer a triagem de Issues do GitHub automaticamente ou em um agendamento. Para uma configuração funcional de triagem de issues, consulte o [workflow de triagem automatizada de issues](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Revisão de Pull Request

Esta action pode ser usada para revisar pull requests automaticamente quando são abertos. Para um guia detalhado sobre como configurar o sistema de revisão de pull requests, acesse a [documentação do workflow GitHub PR Review](./common-workflow).

### Assistente Qwen Code CLI

Este tipo de action pode ser usado para invocar um assistente de IA Qwen Code conversacional e de uso geral dentro de pull requests e issues para realizar uma ampla variedade de tarefas. Para um guia detalhado sobre como configurar o workflow geral do Qwen Code CLI, acesse a [documentação do workflow Qwen Code Assistant](./common-workflow).

## Configuração

### Inputs

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Opcional)\_ A API key para a API do Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Opcional, padrão: `latest`)\_ A versão do Qwen Code CLI a ser instalada. Pode ser "latest", "preview", "nightly", um número de versão específico ou uma branch, tag ou commit do git. Para mais informações, consulte os [releases do Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Opcional)\_ Habilita logs de depuração e streaming de output.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Opcional)\_ O modelo a ser usado com o Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Opcional, padrão: `You are a helpful assistant.`)_ Uma string passada para o [argumento `--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) do Qwen Code CLI.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Opcional)_ Uma string JSON escrita em `.qwen/settings.json` para configurar as configurações de _projeto_ da CLI.
  Para mais detalhes, consulte a documentação sobre [arquivos de configurações](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Opcional, padrão: `false`)\_ Se deve usar o Code Assist para acesso ao modelo Qwen Code em vez da API key padrão do Qwen Code.
  Para mais informações, consulte a [documentação do Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Opcional, padrão: `false`)\_ Se deve usar o Vertex AI para acesso ao modelo Qwen Code em vez da API key padrão do Qwen Code.
  Para mais informações, consulte a [documentação do Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Opcional)_ Uma lista de extensões do Qwen Code CLI a serem instaladas.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Opcional, padrão: `false`)\_ Se deve fazer o upload de artifacts para a GitHub Action.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Opcional, padrão: `false`)\_ Se deve ou não usar pnpm em vez de npm para instalar o qwen-code-cli

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Opcional, padrão: `${{ github.workflow }}`)\_ O nome do workflow do GitHub, usado para fins de telemetria.

<!-- END_AUTOGEN_INPUTS -->

### Outputs

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: O output resumido da execução do Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: O output de erro da execução do Qwen Code CLI, se houver.

<!-- END_AUTOGEN_OUTPUTS -->

### Variáveis de Repositório

Recomendamos definir os seguintes valores como variáveis de repositório para que possam ser reutilizadas em todos os workflows. Alternativamente, você pode defini-las inline como inputs da action em workflows individuais ou para substituir valores no nível do repositório.

| Nome               | Descrição                                               | Tipo     | Obrigatório | Quando Obrigatório             |
| ------------------ | --------------------------------------------------------- | -------- | -------- | ------------------------- |
| `DEBUG`            | Habilita logs de depuração para o Qwen Code CLI.              | Variable | Não       | Nunca                     |
| `QWEN_CLI_VERSION` | Controla qual versão do Qwen Code CLI é instalada. | Variable | Não       | Para fixar a versão da CLI   |
| `APP_ID`           | ID do GitHub App para autenticação personalizada.                  | Variable | Não       | Ao usar um GitHub App personalizado |

Para adicionar uma variável de repositório:

1. Vá em **Settings > Secrets and variables > Actions > New variable** do seu repositório.
2. Insira o nome e o valor da variável.
3. Salve.

Para detalhes sobre variáveis de repositório, consulte a [documentação do GitHub sobre variáveis][variables].

### Secrets

Você pode definir os seguintes secrets no seu repositório:

| Nome              | Descrição                                   | Obrigatório | Quando Obrigatório                              |
| ----------------- | --------------------------------------------- | -------- | ------------------------------------------ |
| `QWEN_API_KEY`    | Sua API key do Qwen do DashScope.             | Sim      | Obrigatório para todos os workflows que chamam o Qwen. |
| `APP_PRIVATE_KEY` | Chave privada do seu GitHub App (formato PEM). | Não       | Ao usar um GitHub App personalizado.                 |

Para adicionar um secret:

1. Vá em **Settings > Secrets and variables > Actions > New repository secret** do seu repositório.
2. Insira o nome e o valor do secret.
3. Salve.

Para mais informações, consulte a [documentação oficial do GitHub sobre como criar e usar secrets criptografados][secrets].

## Autenticação

Esta action requer autenticação na API do GitHub e, opcionalmente, nos serviços do Qwen Code.

### Autenticação do GitHub

Você pode se autenticar com o GitHub de duas formas:

1. **`GITHUB_TOKEN` padrão:** Para casos de uso mais simples, a action pode usar o
   `GITHUB_TOKEN` padrão fornecido pelo workflow.
2. **GitHub App personalizado (Recomendado):** Para uma autenticação mais segura e flexível,
   recomendamos criar um GitHub App personalizado.

Para instruções detalhadas de configuração para a autenticação do Qwen e do GitHub, acesse a
[**documentação de Autenticação**](./configuration/auth).

## Extensões

O Qwen Code CLI pode ser estendido com funcionalidades adicionais por meio de extensões.
Essas extensões são instaladas a partir do código-fonte em seus repositórios do GitHub.

Para instruções detalhadas sobre como configurar e configurar extensões, acesse a
[documentação de Extensões](./extension/introduction.md).

## Boas práticas

Para garantir a segurança, confiabilidade e eficiência dos seus workflows automatizados, recomendamos fortemente seguir nossas boas práticas. Estas diretrizes cobrem áreas-chave como segurança do repositório, configuração de workflows e monitoramento.

As principais recomendações incluem:

- **Proteger seu repositório:** Implementar proteção de branches e tags, e restringir aprovadores de pull requests.
- **Monitoramento e auditoria:** Revisar regularmente os logs das actions e habilitar o OpenTelemetry para obter insights mais profundos sobre desempenho e comportamento.

Para um guia completo sobre como proteger seu repositório e workflows, consulte nossa [**documentação de Boas Práticas**](./common-workflow).

## Personalização

Crie um arquivo QWEN.md na raiz do seu repositório para fornecer
contexto e instruções específicas do projeto para o [Qwen Code CLI](./common-workflow). Isso é útil para definir
convenções de codificação, padrões arquiteturais ou outras diretrizes que o modelo deve
seguir para um determinado repositório.
## Contribuindo

Contribuições são bem-vindas! Confira o **Guia de Contribuição** do Qwen Code CLI para mais detalhes sobre como começar.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context