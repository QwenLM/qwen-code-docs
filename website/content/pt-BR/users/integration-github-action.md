# GitHub Actions: qwen-code-action

## Visão geral

O `qwen-code-action` é uma GitHub Action que integra o [Qwen Code] ao seu fluxo de desenvolvimento por meio do [Qwen Code CLI]. Ele atua tanto como um agente autônomo para tarefas críticas de codificação rotineiras quanto como um colaborador sob demanda, ao qual você pode delegar trabalho rapidamente.

Use-o para realizar revisões de pull requests no GitHub, fazer triagem de issues, executar análise e modificação de código, entre outras tarefas, usando o [Qwen Code] de forma conversacional (por exemplo, `@qwencoder fix this issue`) diretamente dentro dos seus repositórios GitHub.

## Recursos

- **Automação**: Acione workflows com base em eventos (por exemplo, abertura de issue) ou agendamentos (por exemplo, execução noturna).
- **Colaboração sob demanda**: Acione workflows em comentários de issues e pull requests mencionando o [Qwen Code CLI](./features/commands) (por exemplo, `@qwencoder /review`).
- **Extensível com ferramentas**: Aproveite os recursos de chamada de ferramentas (tool-calling) dos modelos do [Qwen Code](../developers/tools/introduction.md) para interagir com outras CLIs, como a [GitHub CLI] (`gh`).
- **Personalizável**: Use um arquivo `QWEN.md` no seu repositório para fornecer instruções e contexto específicos do projeto ao [Qwen Code CLI](./features/commands).

## Início rápido

Comece a usar o Qwen Code CLI no seu repositório em apenas alguns minutos:

### 1. Obtenha uma Qwen API Key

Obtenha sua API key no [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (plataforma de IA da Alibaba Cloud)

### 2. Adicione-a como um GitHub Secret

Armazene sua API key como um secret chamado `QWEN_API_KEY` no seu repositório:

- Acesse **Settings > Secrets and variables > Actions** do seu repositório
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

### 4. Escolha um workflow

Você tem duas opções para configurar um workflow:

**Opção A: Use o comando de setup (Recomendado)**

1. Inicie o Qwen Code CLI no seu terminal:

   ```shell
   qwen
   ```

2. No Qwen Code CLI no seu terminal, digite:

   ```
   /setup-github
   ```

**Opção B: Copie os workflows manualmente**

1. Copie os workflows pré-configurados do diretório [`examples/workflows`](./common-workflow) para o diretório `.github/workflows` do seu repositório. Observação: o workflow `qwen-dispatch.yml` também deve ser copiado, pois é ele que aciona a execução dos workflows.

### 5. Teste na prática

**Revisão de Pull Request:**

- Abra um pull request no seu repositório e aguarde a revisão automática
- Comente `@qwencoder /review` em um pull request existente para acionar manualmente uma revisão

**Triagem de Issues:**

- Abra uma issue e aguarde a triagem automática
- Comente `@qwencoder /triage` em issues existentes para acionar manualmente a triagem

**Assistência Geral de IA:**

- Em qualquer issue ou pull request, mencione `@qwencoder` seguido da sua solicitação
- Exemplos:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## Workflows

Esta action oferece vários workflows pré-configurados para diferentes casos de uso. Cada workflow foi projetado para ser copiado para o diretório `.github/workflows` do seu repositório e personalizado conforme necessário.

### Qwen Code Dispatch

Este workflow atua como um dispatcher central para o Qwen Code CLI, roteando solicitações para o workflow apropriado com base no evento acionador e no comando fornecido no comentário. Para um guia detalhado sobre como configurar o workflow de dispatch, acesse a [documentação do workflow Qwen Code Dispatch](./common-workflow).

### Issue Triage

Esta action pode ser usada para fazer a triagem de GitHub Issues automaticamente ou de forma agendada. Para um guia detalhado sobre como configurar o sistema de triagem de issues, acesse a [documentação do workflow GitHub Issue Triage](./examples/workflows/issue-triage).

### Pull Request Review

Esta action pode ser usada para revisar pull requests automaticamente quando são abertos. Para um guia detalhado sobre como configurar o sistema de revisão de pull requests, acesse a [documentação do workflow GitHub PR Review](./common-workflow).

### Qwen Code CLI Assistant

Este tipo de action pode ser usado para invocar um assistente de IA Qwen Code conversacional e de propósito geral dentro de pull requests e issues para executar uma ampla variedade de tarefas. Para um guia detalhado sobre como configurar o workflow Qwen Code CLI de propósito geral, acesse a [documentação do workflow Qwen Code Assistant](./common-workflow).

## Configuração

### Inputs

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Opcional)\_ A API key para a Qwen API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Opcional, padrão: `latest`)\_ A versão do Qwen Code CLI a ser instalada. Pode ser "latest", "preview", "nightly", um número de versão específico ou uma branch, tag ou commit do git. Para mais informações, consulte [Qwen Code CLI releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Opcional)\_ Ativa o log de debug e o streaming de output.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Opcional)\_ O modelo a ser usado com o Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Opcional, padrão: `You are a helpful assistant.`)_ Uma string passada para o argumento [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) do Qwen Code CLI.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Opcional)_ Uma string JSON gravada em `.qwen/settings.json` para configurar as definições de _projeto_ da CLI.
  Para mais detalhes, consulte a documentação sobre [arquivos de configuração](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Opcional, padrão: `false`)\_ Indica se deve usar o Code Assist para acesso ao modelo Qwen Code em vez da API key padrão do Qwen Code.
  Para mais informações, consulte a [documentação do Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Opcional, padrão: `false`)\_ Indica se deve usar o Vertex AI para acesso ao modelo Qwen Code em vez da API key padrão do Qwen Code.
  Para mais informações, consulte a [documentação do Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Opcional)_ Uma lista de extensões do Qwen Code CLI a serem instaladas.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Opcional, padrão: `false`)\_ Indica se deve fazer upload de artifacts para a GitHub Action.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Opcional, padrão: `false`)\_ Indica se deve usar pnpm em vez de npm para instalar o qwen-code-cli

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Opcional, padrão: `${{ github.workflow }}`)\_ O nome do workflow do GitHub, usado para fins de telemetria.

<!-- END_AUTOGEN_INPUTS -->

### Outputs

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: O output resumido da execução do Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: O output de erro da execução do Qwen Code CLI, se houver.

<!-- END_AUTOGEN_OUTPUTS -->

### Variáveis do repositório

Recomendamos definir os seguintes valores como variáveis do repositório para que possam ser reutilizados em todos os workflows. Como alternativa, você pode defini-los inline como inputs da action em workflows individuais ou para substituir valores em nível de repositório.

| Nome               | Descrição                                               | Tipo     | Obrigatório | Quando obrigatório             |
| ------------------ | --------------------------------------------------------- | -------- | -------- | ------------------------- |
| `DEBUG`            | Ativa o log de debug para o Qwen Code CLI.              | Variável | Não       | Nunca                     |
| `QWEN_CLI_VERSION` | Controla qual versão do Qwen Code CLI é instalada. | Variável | Não       | Fixação da versão da CLI   |
| `APP_ID`           | ID do GitHub App para autenticação personalizada.                  | Variável | Não       | Uso de um GitHub App personalizado |

Para adicionar uma variável ao repositório:

1. Acesse **Settings > Secrets and variables > Actions > New variable** do seu repositório.
2. Insira o nome e o valor da variável.
3. Salve.

Para detalhes sobre variáveis de repositório, consulte a [documentação do GitHub sobre variáveis][variables].

### Secrets

Você pode definir os seguintes secrets no seu repositório:

| Nome              | Descrição                                   | Obrigatório | Quando obrigatório                              |
| ----------------- | --------------------------------------------- | -------- | ------------------------------------------ |
| `QWEN_API_KEY`    | Sua Qwen API key do DashScope.             | Sim      | Obrigatório para todos os workflows que chamam o Qwen. |
| `APP_PRIVATE_KEY` | Chave privada do seu GitHub App (formato PEM). | Não       | Uso de um GitHub App personalizado.                 |

Para adicionar um secret:

1. Acesse **Settings > Secrets and variables > Actions > New repository secret** do seu repositório.
2. Insira o nome e o valor do secret.
3. Salve.

Para mais informações, consulte a [documentação oficial do GitHub sobre criação e uso de secrets criptografados][secrets].

## Autenticação

Esta action requer autenticação na API do GitHub e, opcionalmente, nos serviços do Qwen Code.

### Autenticação no GitHub

Você pode se autenticar no GitHub de duas formas:

1. **`GITHUB_TOKEN` padrão:** Para casos de uso mais simples, a action pode usar o `GITHUB_TOKEN` padrão fornecido pelo workflow.
2. **GitHub App personalizado (Recomendado):** Para a autenticação mais segura e flexível, recomendamos criar um GitHub App personalizado.

Para instruções detalhadas de configuração para autenticação no Qwen e no GitHub, acesse a [**documentação de Autenticação**](./configuration/auth).

## Extensões

O Qwen Code CLI pode ser estendido com funcionalidades adicionais por meio de extensões.
Essas extensões são instaladas a partir do código-fonte em seus repositórios GitHub.

Para instruções detalhadas sobre como configurar extensões, acesse a [documentação de Extensões](../developers/extensions/extension).

## Boas práticas

Para garantir a segurança, confiabilidade e eficiência dos seus workflows automatizados, recomendamos fortemente seguir nossas boas práticas. Essas diretrizes cobrem áreas essenciais como segurança do repositório, configuração de workflows e monitoramento.

As principais recomendações incluem:

- **Proteção do seu repositório:** Implementar proteção de branches e tags e restringir aprovadores de pull requests.
- **Monitoramento e auditoria:** Revisar regularmente os logs das actions e ativar o OpenTelemetry para obter insights mais profundos sobre desempenho e comportamento.

Para um guia completo sobre como proteger seu repositório e workflows, consulte nossa [**documentação de Boas práticas**](./common-workflow).

## Personalização

Crie um arquivo `QWEN.md` na raiz do seu repositório para fornecer contexto e instruções específicos do projeto ao [Qwen Code CLI](./common-workflow). Isso é útil para definir convenções de código, padrões de arquitetura ou outras diretrizes que o modelo deve seguir para um determinado repositório.

## Contribuição

Contribuições são bem-vindas! Consulte o **Guia de Contribuição** do Qwen Code CLI para mais detalhes sobre como começar.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context