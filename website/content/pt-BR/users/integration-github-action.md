# Github Actions: qwen-code-action

## Visão Geral

`qwen-code-action` é uma GitHub Action que integra o [Qwen Code] ao seu fluxo de desenvolvimento por meio da [CLI do Qwen Code]. Ela atua tanto como um agente autônomo para tarefas rotineiras críticas de codificação quanto como um colaborador sob demanda ao qual você pode rapidamente delegar trabalho.

Utilize-a para realizar revisões de pull requests no GitHub, triagem de issues, análise e modificação de código, e muito mais, utilizando o [Qwen Code] de forma conversacional (por exemplo, `@qwencoder fix this issue`) diretamente dentro dos seus repositórios do GitHub.

## Recursos

- **Automação**: Acione fluxos de trabalho com base em eventos (por exemplo, abertura de issues) ou agendamentos (por exemplo, noturnos).
- **Colaboração sob demanda**: Acione fluxos de trabalho nos comentários de issues e pull requests mencionando o [Qwen Code CLI](./features/commands) (por exemplo, `@qwencoder /review`).
- **Extensível com Ferramentas**: Aproveite os recursos de chamada de ferramentas dos modelos do [Qwen Code](../developers/tools/introduction.md) para interagir com outras CLIs como o [GitHub CLI] (`gh`).
- **Personalizável**: Utilize um arquivo `QWEN.md` em seu repositório para fornecer instruções e contexto específicos do projeto ao [Qwen Code CLI](./features/commands).

## Início Rápido

Comece a usar o Qwen Code CLI em seu repositório em apenas alguns minutos:

### 1. Obtenha uma chave de API do Qwen

Obtenha sua chave de API no [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (plataforma de IA da Alibaba Cloud)

### 2. Adicione como um segredo do GitHub

Armazene sua chave de API como um segredo chamado `QWEN_API_KEY` em seu repositório:

- Vá para **Configurações > Segredos e variáveis > Ações** do seu repositório
- Clique em **Novo segredo de repositório**
- Nome: `QWEN_API_KEY`, Valor: sua chave de API

### 3. Atualize seu .gitignore

Adicione as seguintes entradas ao seu arquivo `.gitignore`:

```gitignore

# Configurações do qwen-code-cli
.qwen/

# Credenciais do GitHub App
gha-creds-*.json
```

### 4. Escolha um fluxo de trabalho

Você tem duas opções para configurar um fluxo de trabalho:

**Opção A: Usar o comando de configuração (Recomendado)**

1. Inicie o Qwen Code CLI em seu terminal:

   ```shell
   qwen
   ```

2. No Qwen Code CLI em seu terminal, digite:

   ```
   /setup-github
   ```

**Opção B: Copiar manualmente os fluxos de trabalho**

1. Copie os fluxos de trabalho pré-construídos do diretório [`examples/workflows`](./common-workflow) para o diretório `.github/workflows` do seu repositório. Nota: o fluxo de trabalho `qwen-dispatch.yml` também deve ser copiado, pois é ele que aciona a execução dos fluxos de trabalho.

### 5. Experimente

**Revisão de Pull Request:**

- Abra um pull request em seu repositório e aguarde a revisão automática
- Comente `@qwencoder /review` em um pull request existente para acionar manualmente uma revisão

**Triagem de Issues:**

- Abra uma issue e aguarde a triagem automática
- Comente `@qwencoder /triage` em issues existentes para acionar manualmente a triagem

**Assistência Geral com IA:**

- Em qualquer issue ou pull request, mencione `@qwencoder` seguido da sua solicitação
- Exemplos:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## Fluxos de Trabalho

Esta ação fornece diversos fluxos de trabalho pré-construídos para diferentes casos de uso. Cada fluxo é projetado para ser copiado no diretório `.github/workflows` do seu repositório e personalizado conforme necessário.

### Qwen Code Dispatch

Este workflow atua como um dispatcher central para o Qwen Code CLI, roteando solicitações para o workflow apropriado com base no evento de gatilho e no comando fornecido no comentário. Para um guia detalhado sobre como configurar o workflow de dispatch, vá para a [documentação do workflow Qwen Code Dispatch](./common-workflow).

### Triagem de Issues

Esta ação pode ser usada para triar automaticamente ou em horário programado as Issues do GitHub. Para um guia detalhado sobre como configurar o sistema de triagem de issues, vá para a [documentação do workflow de Triagem de Issues do GitHub](./examples/workflows/issue-triage).

### Revisão de Pull Request

Esta ação pode ser usada para revisar automaticamente os pull requests quando eles são abertos. Para um guia detalhado sobre como configurar o sistema de revisão de pull requests, vá para a [documentação do workflow de Revisão de PR do GitHub](./common-workflow).

### Assistente CLI do Qwen Code

Este tipo de ação pode ser usado para invocar um assistente de IA conversacional de propósito geral do Qwen Code dentro dos pull requests e issues para realizar uma ampla gama de tarefas. Para um guia detalhado sobre como configurar o fluxo de trabalho CLI do Qwen Code de propósito geral, vá para a [documentação do fluxo de trabalho do Assistente do Qwen Code](./common-workflow).

## Configuração

### Entradas

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Opcional)\_ A chave da API para a API do Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Opcional, padrão: `latest`)\_ A versão do Qwen Code CLI a ser instalada. Pode ser "latest", "preview", "nightly", um número de versão específico ou uma branch, tag ou commit do git. Para mais informações, consulte [Qwen Code CLI releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Opcional)\_ Ativa o log de depuração e o streaming da saída.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Opcional)\_ O modelo a ser usado com o Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Opcional, padrão: `You are a helpful assistant.`)_ Uma string passada para o argumento [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) do Qwen Code CLI.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Opcional)_ Uma string JSON escrita em `.qwen/settings.json` para configurar as definições do projeto da CLI.
  Para mais detalhes, consulte a documentação sobre [arquivos de configurações](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Opcional, padrão: `false`)\_ Se deve usar o Code Assist para acesso ao modelo Qwen Code em vez da chave padrão da API Qwen Code.
  Para mais informações, consulte a [documentação do Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Opcional, padrão: `false`)\_ Se deve usar o Vertex AI para acesso ao modelo Qwen Code em vez da chave padrão da API Qwen Code.
  Para mais informações, consulte a [documentação do Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Opcional)_ Uma lista de extensões do Qwen Code CLI a serem instaladas.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Opcional, padrão: `false`)\_ Se deve fazer upload dos artefatos para a action do GitHub.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Opcional, padrão: `false`)\_ Se deve usar pnpm em vez de npm para instalar o qwen-code-cli

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Opcional, padrão: `${{ github.workflow }}`)\_ O nome do workflow do GitHub, usado para fins de telemetria.

<!-- END_AUTOGEN_INPUTS -->

### Saídas

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: A saída resumida da execução do Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: A saída de erro da execução do Qwen Code CLI, se houver.

<!-- END_AUTOGEN_OUTPUTS -->

### Variáveis do Repositório

Recomendamos definir os seguintes valores como variáveis do repositório para que possam ser reutilizados em todos os fluxos de trabalho. Alternativamente, você pode defini-los inline como entradas de ação em fluxos de trabalho individuais ou para substituir valores no nível do repositório.

| Nome               | Descrição                                                  | Tipo     | Obrigatório | Quando Necessário          |
| ------------------ | ---------------------------------------------------------- | -------- | ----------- | -------------------------- |
| `DEBUG`            | Habilita o log de depuração para o Qwen Code CLI.          | Variável | Não         | Nunca                      |
| `QWEN_CLI_VERSION` | Controla qual versão do Qwen Code CLI é instalada.        | Variável | Não         | Fixar a versão da CLI      |
| `APP_ID`           | ID do GitHub App para autenticação personalizada.          | Variável | Não         | Usando um GitHub App customizado |

Para adicionar uma variável do repositório:

1. Vá para **Configurações > Segredos e variáveis > Ações > Nova variável** do seu repositório.
2. Insira o nome e o valor da variável.
3. Salve.

Para mais detalhes sobre variáveis do repositório, consulte a [documentação do GitHub sobre variáveis][variables].

### Segredos

Você pode definir os seguintes segredos em seu repositório:

| Nome              | Descrição                                      | Obrigatório | Quando Necessário                          |
| ----------------- | ---------------------------------------------- | ----------- | ------------------------------------------ |
| `QWEN_API_KEY`    | Sua chave de API do Qwen via DashScope.        | Sim         | Necessário para todos os fluxos que chamam o Qwen. |
| `APP_PRIVATE_KEY` | Chave privada do seu GitHub App (formato PEM). | Não         | Ao usar um GitHub App personalizado.       |

Para adicionar um segredo:

1. Acesse **Settings > Secrets and variables > Actions > New repository secret** no seu repositório.
2. Informe o nome e o valor do segredo.
3. Salve.

Para mais informações, consulte a [documentação oficial do GitHub sobre criação e uso de segredos criptografados][secrets].

## Autenticação

Esta ação requer autenticação na API do GitHub e, opcionalmente, nos serviços do Qwen Code.

### Autenticação no GitHub

Você pode se autenticar no GitHub de duas maneiras:

1. **`GITHUB_TOKEN` padrão:** Para casos de uso mais simples, a action pode usar o
   `GITHUB_TOKEN` padrão fornecido pelo workflow.
2. **GitHub App personalizado (Recomendado):** Para uma autenticação mais segura e flexível,
   recomendamos criar um GitHub App personalizado.

Para instruções detalhadas de configuração tanto para autenticação no Qwen quanto no GitHub, acesse a
[**documentação de Autenticação**](./configuration/auth).

## Extensões

O Qwen Code CLI pode ser estendido com funcionalidades adicionais por meio de extensões.
Essas extensões são instaladas a partir do código-fonte de seus repositórios no GitHub.

Para instruções detalhadas sobre como configurar e usar extensões, acesse a
[documentação de Extensões](../developers/extensions/extension).

## Melhores Práticas

Para garantir a segurança, confiabilidade e eficiência dos seus fluxos de trabalho automatizados, recomendamos fortemente seguir nossas melhores práticas. Essas diretrizes abrangem áreas importantes, como segurança do repositório, configuração de fluxos de trabalho e monitoramento.

Principais recomendações incluem:

- **Proteção do Repositório:** Implementar proteção de branches e tags, além de restringir os aprovadores de pull requests.
- **Monitoramento e Auditoria:** Revisar regularmente os logs de actions e habilitar o OpenTelemetry para obter insights mais profundos sobre desempenho e comportamento.

Para um guia completo sobre como proteger seu repositório e fluxos de trabalho, consulte nossa [**documentação de Melhores Práticas**](./common-workflow).

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