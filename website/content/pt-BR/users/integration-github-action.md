## Github Actions：qwen-code-action

## Visão Geral

`qwen-code-action` é uma GitHub Action que integra o [Qwen Code] ao seu fluxo de trabalho de desenvolvimento por meio do [Qwen Code CLI]. Ele atua tanto como um agente autônomo para tarefas críticas de codificação rotineiras quanto como um colaborador sob demanda para quem você pode delegar trabalho rapidamente.

Use-o para realizar revisões de pull requests do GitHub, triagem de issues, análise e modificação de código e muito mais, usando o [Qwen Code] de forma conversacional (por exemplo, `@qwencoder corrija este problema`) diretamente dentro dos seus repositórios do GitHub.

## Recursos

- **Automação**: Acione fluxos de trabalho com base em eventos (por exemplo, abertura de issue) ou agendamentos (por exemplo, noturno).
- **Colaboração sob demanda**: Acione fluxos de trabalho em comentários de issues e pull requests mencionando o [Qwen Code CLI](./features/commands) (por exemplo, `@qwencoder /review`).
- **Extensível com ferramentas**: Aproveite as capacidades de chamada de ferramentas dos modelos [Qwen Code](../developers/tools/introduction.md) para interagir com outras CLIs como o [GitHub CLI] (`gh`).
- **Personalizável**: Use um arquivo `QWEN.md` no seu repositório para fornecer instruções e contexto específicos do projeto para o [Qwen Code CLI](./features/commands).

## Início Rápido

Comece a usar o Qwen Code CLI no seu repositório em apenas alguns minutos:

### 1. Obtenha uma Chave de API do Qwen

Obtenha sua chave de API no [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (plataforma de IA da Alibaba Cloud)

### 2. Adicione-a como um Segredo do GitHub

Armazene sua chave de API como um segredo chamado `QWEN_API_KEY` no seu repositório:

- Acesse **Configurações > Segredos e variáveis > Actions** do seu repositório
- Clique em **Novo segredo do repositório**
- Nome: `QWEN_API_KEY`, Valor: sua chave de API

### 3. Atualize seu .gitignore

Adicione as seguintes entradas ao seu arquivo `.gitignore`:

```gitignore
# configurações do qwen-code-cli
.qwen/

# credenciais do GitHub App
gha-creds-*.json
```

### 4. Escolha um Fluxo de Trabalho

Você tem duas opções para configurar um fluxo de trabalho:

**Opção A: Usar comando de configuração (Recomendado)**

1. Inicie o Qwen Code CLI no seu terminal:

   ```shell
   qwen
   ```

2. No Qwen Code CLI do seu terminal, digite:

   ```
   /setup-github
   ```

**Opção B: Copiar fluxos de trabalho manualmente**

1. Copie os fluxos de trabalho pré-construídos do diretório [`examples/workflows`](./common-workflow) para o diretório `.github/workflows` do seu repositório. Observação: o fluxo de trabalho `qwen-dispatch.yml` também deve ser copiado, pois ele aciona a execução dos fluxos de trabalho.

### 5. Experimente

**Revisão de Pull Request:**

- Abra um pull request no seu repositório e aguarde a revisão automática
- Comente `@qwencoder /review` em um pull request existente para acionar manualmente uma revisão

**Triagem de Issue:**

- Abra uma issue e aguarde a triagem automática
- Comente `@qwencoder /triage` em issues existentes para acionar manualmente a triagem

**Assistência Geral de IA:**

- Em qualquer issue ou pull request, mencione `@qwencoder` seguido da sua solicitação
- Exemplos:
  - `@qwencoder explique esta alteração de código`
  - `@qwencoder sugira melhorias para esta função`
  - `@qwencoder me ajude a depurar este erro`
  - `@qwencoder escreva testes de unidade para este componente`

## Fluxos de Trabalho

Esta ação fornece vários fluxos de trabalho pré-construídos para diferentes casos de uso. Cada fluxo de trabalho foi projetado para ser copiado para o diretório `.github/workflows` do seu repositório e personalizado conforme necessário.

### Despacho do Qwen Code

Esse fluxo de trabalho atua como um despachante central para o Qwen Code CLI, roteando solicitações para o fluxo de trabalho apropriado com base no evento de acionamento e no comando fornecido no comentário. Para um guia detalhado sobre como configurar o fluxo de trabalho de despacho, acesse a [documentação do fluxo de trabalho de despacho do Qwen Code](./common-workflow).

### Triagem de Issue

Esta ação pode ser usada para fazer triagem de issues do GitHub automaticamente ou em um agendamento. Para uma configuração funcional de triagem de issues, consulte o [fluxo de trabalho automatizado de triagem de issues](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Revisão de Pull Request

Esta ação pode ser usada para revisar automaticamente pull requests quando eles são abertos. Para um guia detalhado sobre como configurar o sistema de revisão de pull requests, acesse a [documentação do fluxo de trabalho de revisão de PR do GitHub](./common-workflow).

### Assistente Qwen Code CLI

Este tipo de ação pode ser usado para invocar um assistente de IA do Qwen Code de uso geral e conversacional dentro dos pull requests e issues para realizar uma ampla gama de tarefas. Para um guia detalhado sobre como configurar o fluxo de trabalho de uso geral do Qwen Code CLI, acesse a [documentação do fluxo de trabalho do Assistente Qwen Code](./common-workflow).

## Configuração

### Entradas

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Opcional)* A chave de API para a API do Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Opcional, padrão: `latest`)* A versão do Qwen Code CLI a ser instalada. Pode ser "latest", "preview", "nightly", um número de versão específico ou um branch, tag ou commit do git. Para mais informações, consulte [Lançamentos do Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).
- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Opcional)* — Ativa registro de depuração e streaming de saída.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Opcional)* — O modelo a ser usado com o Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: *(Opcional, padrão: `You are a helpful assistant.`)* Uma string passada para o argumento [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) da CLI Qwen Code.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: *(Opcional)* Uma string JSON gravada em `.qwen/settings.json` para configurar as configurações de *projeto* da CLI.
  Para mais detalhes, consulte a documentação sobre [arquivos de configuração](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Opcional, padrão: `false`)* — Se deve usar o Code Assist para acesso ao modelo Qwen Code em vez da chave de API Qwen Code padrão.
  Para mais informações, consulte a [documentação da CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Opcional, padrão: `false`)* — Se deve usar o Vertex AI para acesso ao modelo Qwen Code em vez da chave de API Qwen Code padrão.
  Para mais informações, consulte a [documentação da CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: *(Opcional)* Uma lista de extensões da CLI Qwen Code para instalar.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Opcional, padrão: `false`)* — Se deve enviar artefatos para a ação do GitHub.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Opcional, padrão: `false`)* — Se deve usar o pnpm em vez do npm para instalar o qwen-code-cli.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Opcional, padrão: `${{ github.workflow }}`)* — O nome do workflow do GitHub, usado para fins de telemetria.

<!-- END_AUTOGEN_INPUTS -->

### Saídas

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: A saída resumida da execução da CLI Qwen Code.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: A saída de erro da execução da CLI Qwen Code, se houver.

<!-- END_AUTOGEN_OUTPUTS -->

### Variáveis do Repositório

Recomendamos definir os seguintes valores como variáveis do repositório para que possam ser reutilizados em todos os workflows. Alternativamente, você pode defini-los inline como entradas de ação em workflows individuais ou para sobrescrever valores em nível de repositório.

| Nome               | Descrição                                                | Tipo     | Obrigatório | Quando Obrigatório       |
| ------------------ | -------------------------------------------------------- | -------- | ----------- | ------------------------- |
| `DEBUG`            | Ativa o registro de depuração para a CLI Qwen Code.      | Variável | Não         | Nunca                     |
| `QWEN_CLI_VERSION` | Controla qual versão da CLI Qwen Code é instalada.       | Variável | Não         | Fixar a versão da CLI     |
| `APP_ID`           | ID do GitHub App para autenticação personalizada.        | Variável | Não         | Usar um GitHub App personalizado |

Para adicionar uma variável de repositório:

1. Vá para **Configurações > Secrets and variables > Actions > New variable** do seu repositório.
2. Digite o nome e o valor da variável.
3. Salve.

Para obter detalhes sobre variáveis de repositório, consulte a [documentação do GitHub sobre variáveis][variables].

### Secrets

Você pode definir os seguintes segredos no seu repositório:

| Nome              | Descrição                                   | Obrigatório | Quando Obrigatório                              |
| ----------------- | ------------------------------------------- | ----------- | ---------------------------------------------- |
| `QWEN_API_KEY`    | Sua chave de API Qwen do DashScope.         | Sim         | Necessário para todos os workflows que chamam o Qwen. |
| `APP_PRIVATE_KEY` | Chave privada para seu GitHub App (formato PEM). | Não         | Usar um GitHub App personalizado.              |

Para adicionar um segredo:

1. Vá para **Configurações > Secrets and variables > Actions > New repository secret** do seu repositório.
2. Digite o nome e o valor do segredo.
3. Salve.

Para mais informações, consulte a [documentação oficial do GitHub sobre criação e uso de segredos criptografados][secrets].
## Autenticação

Esta ação requer autenticação na API do GitHub e, opcionalmente, nos serviços do Qwen Code.

### Autenticação no GitHub

Você pode autenticar-se no GitHub de duas maneiras:

1. **`GITHUB_TOKEN` padrão:** Para casos de uso mais simples, a ação pode usar o
   `GITHUB_TOKEN` padrão fornecido pelo workflow.
2. **GitHub App Personalizado (Recomendado):** Para a autenticação mais segura e flexível,
   recomendamos criar um GitHub App personalizado.

Para instruções detalhadas de configuração tanto para autenticação no Qwen quanto no GitHub, consulte a
[**documentação de Autenticação**](./configuration/auth).

## Extensões

A CLI do Qwen Code pode ser estendida com funcionalidades adicionais por meio de extensões.
Essas extensões são instaladas a partir do código-fonte de seus repositórios no GitHub.

Para instruções detalhadas sobre como configurar e personalizar extensões, consulte a
[documentação de Extensões](./extension/introduction.md).

## Boas Práticas

Para garantir a segurança, confiabilidade e eficiência de seus workflows automatizados, recomendamos fortemente seguir nossas boas práticas. Estas diretrizes cobrem áreas-chave como segurança do repositório, configuração do workflow e monitoramento.

Principais recomendações incluem:

- **Protegendo seu Repositório:** Implementando proteção de branches e tags, e restringindo aprovadores de pull requests.
- **Monitoramento e Auditoria:** Revisando regularmente os logs de ações e habilitando o OpenTelemetry para obter insights mais profundos sobre desempenho e comportamento.

Para um guia abrangente sobre como proteger seu repositório e workflows, consulte nossa [**documentação de Boas Práticas**](./common-workflow).

## Personalização

Crie um arquivo QWEN.md na raiz do seu repositório para fornecer
contexto e instruções específicas do projeto para a [CLI do Qwen Code](./common-workflow). Isso é útil para definir
convenções de código, padrões arquiteturais ou outras diretrizes que o modelo deve
seguir para um determinado repositório.

## Contribuindo

Contribuições são bem-vindas! Acesse o **Guia de Contribuição** da CLI do Qwen Code para mais detalhes sobre como começar.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context
