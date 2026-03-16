# GitHub Actions: qwen-code-action

## Visão geral

O `qwen-code-action` é uma ação do GitHub que integra o [Qwen Code] ao seu fluxo de trabalho de desenvolvimento por meio da [CLI do Qwen Code]. Ele atua tanto como um agente autônomo para tarefas críticas e rotineiras de programação quanto como um colaborador sob demanda ao qual você pode delegar rapidamente tarefas.

Use-o para realizar revisões de pull requests no GitHub, triagem de problemas, análise e modificação de código, entre outras atividades, usando o [Qwen Code] de forma conversacional (por exemplo, `@qwencoder corrija este problema`) diretamente dentro dos seus repositórios no GitHub.

## Recursos

- **Automação**: Dispare fluxos de trabalho com base em eventos (por exemplo, abertura de uma issue) ou agendamentos (por exemplo, diariamente à noite).
- **Colaboração sob demanda**: Dispare fluxos de trabalho por meio de comentários em issues e pull requests mencionando a [CLI do Qwen Code](./features/commands) (por exemplo, `@qwencoder /review`).
- **Extensível com ferramentas**: Aproveite as capacidades de chamada de ferramentas dos modelos [Qwen Code](../developers/tools/introduction.md) para interagir com outras CLIs, como a [GitHub CLI] (`gh`).
- **Personalizável**: Use um arquivo `QWEN.md` no seu repositório para fornecer instruções e contexto específicos ao projeto para a [CLI do Qwen Code](./features/commands).

## Início rápido

Comece a usar a CLI do Qwen Code no seu repositório em apenas alguns minutos:

### 1. Obtenha uma chave de API do Qwen

Obtenha sua chave de API no [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (plataforma de IA da Alibaba Cloud)

### 2. Adicione-o como um Segredo do GitHub

Armazene sua chave de API como um segredo chamado `QWEN_API_KEY` no seu repositório:

- Acesse as **Configurações > Segredos e variáveis > Ações** do seu repositório
- Clique em **Novo segredo do repositório**
- Nome: `QWEN_API_KEY`, Valor: sua chave de API

### 3. Atualize seu `.gitignore`

Adicione as seguintes entradas ao seu arquivo `.gitignore`:

```gitignore

# Configurações do qwen-code-cli
.qwen/

# Credenciais do GitHub App
gha-creds-*.json
```

### 4. Escolha um Fluxo de Trabalho

Você tem duas opções para configurar um fluxo de trabalho:

**Opção A: Usar o comando de configuração (Recomendado)**

1. Inicie a CLI do Qwen Code no seu terminal:

   ```shell
   qwen
   ```

2. Na CLI do Qwen Code no seu terminal, digite:

   ```
   /setup-github
   ```

**Opção B: Copiar manualmente os fluxos de trabalho**

1. Copie os fluxos de trabalho pré-construídos do diretório [`examples/workflows`](./common-workflow) para o diretório `.github/workflows` do seu repositório. Observação: o fluxo de trabalho `qwen-dispatch.yml` também deve ser copiado, pois ele dispara a execução dos demais fluxos de trabalho.

### 5. Experimente

**Revisão de Pull Request:**

- Abra uma pull request no seu repositório e aguarde a revisão automática
- Comente `@qwencoder /review` em uma pull request existente para acionar manualmente uma revisão

**Classificação de Issues:**

- Abra uma issue e aguarde a classificação automática
- Comente `@qwencoder /triage` em issues existentes para acionar manualmente a classificação

**Assistência Geral com IA:**

- Em qualquer issue ou pull request, mencione `@qwencoder` seguido da sua solicitação
- Exemplos:
  - `@qwencoder explique essa alteração de código`
  - `@qwencoder sugira melhorias para essa função`
  - `@qwencoder me ajude a depurar esse erro`
  - `@qwencoder escreva testes unitários para esse componente`

## Fluxos de Trabalho

Esta ação fornece diversos fluxos de trabalho pré-construídos para diferentes casos de uso. Cada fluxo de trabalho foi projetado para ser copiado no diretório `.github/workflows` do seu repositório e personalizado conforme necessário.

### Qwen Code Dispatch

Este fluxo de trabalho atua como um despachante central para a CLI do Qwen Code, roteando solicitações para o fluxo de trabalho apropriado com base no evento que o acionou e no comando fornecido no comentário. Para um guia detalhado sobre como configurar o fluxo de trabalho de despacho, acesse a [documentação do fluxo de trabalho Qwen Code Dispatch](./common-workflow).

### Triagem de Issues

Esta ação pode ser usada para triar automaticamente issues do GitHub ou em uma agenda programada. Para um guia detalhado sobre como configurar o sistema de triagem de issues, acesse a [documentação do fluxo de trabalho de triagem de issues do GitHub](./examples/workflows/issue-triage).

### Revisão de Pull Requests

Esta ação pode ser usada para revisar automaticamente pull requests assim que forem abertas. Para um guia detalhado sobre como configurar o sistema de revisão de pull requests, acesse a [documentação do fluxo de trabalho de revisão de PRs do GitHub](./common-workflow).

### Assistente CLI do Qwen Code

Esse tipo de ação pode ser usado para invocar um assistente de IA generalista e conversacional do Qwen Code dentro de pull requests e issues, a fim de executar uma ampla variedade de tarefas. Para obter um guia detalhado sobre como configurar o fluxo de trabalho generalista do Qwen Code CLI, acesse a [documentação do fluxo de trabalho do Assistente Qwen Code](./common-workflow).

## Configuração

### Entradas

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Opcional)* A chave de API para a API do Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Opcional, padrão: `latest`)* A versão da CLI do Qwen Code a ser instalada. Pode ser `"latest"`, `"preview"`, `"nightly"`, um número de versão específico ou um branch, tag ou commit do Git. Para mais informações, consulte as [versões da CLI do Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Opcional)* Habilita o registro de depuração e o streaming de saída.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Opcional)* O modelo a ser usado com o Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: *(Opcional, padrão: `You are a helpful assistant.`)* Uma string passada ao argumento [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) da CLI do Qwen Code.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: *(Opcional)* Uma string JSON gravada em `.qwen/settings.json` para configurar as configurações _do projeto_ da CLI.  
  Para mais detalhes, consulte a documentação sobre [arquivos de configurações](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Opcional, padrão: `false`)* Indica se deve usar o Code Assist para acessar o modelo Qwen Code, em vez da chave de API padrão do Qwen Code.  
  Para mais informações, consulte a [documentação da CLI do Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Opcional, padrão: `false`)* Indica se deve usar o Vertex AI para acessar o modelo Qwen Code, em vez da chave de API padrão do Qwen Code.  
  Para mais informações, consulte a [documentação da CLI do Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: *(Opcional)* Uma lista de extensões da CLI do Qwen Code a serem instaladas.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Opcional, padrão: `false`)* Indica se os artefatos devem ser enviados para a ação do GitHub.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Opcional, padrão: `false`)* Indica se o pnpm deve ser usado, em vez do npm, para instalar a `qwen-code-cli`.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Opcional, padrão: `${{ github.workflow }}`)* O nome do fluxo de trabalho do GitHub, usado para fins de telemetria.

<!-- END_AUTOGEN_INPUTS -->

### Saídas

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: A saída resumida da execução da CLI do Qwen Code.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: A saída de erro da execução da CLI do Qwen Code, se houver.

<!-- END_AUTOGEN_OUTPUTS -->

### Variáveis do repositório

Recomendamos definir os seguintes valores como variáveis do repositório para que possam ser reutilizados em todos os fluxos de trabalho. Alternativamente, você pode defini-los diretamente como entradas de ação em fluxos de trabalho individuais ou para substituir os valores definidos no nível do repositório.

| Nome               | Descrição                                                   | Tipo     | Obrigatório | Quando é obrigatório         |
| ------------------ | ----------------------------------------------------------- | -------- | ----------- | ---------------------------- |
| `DEBUG`            | Habilita o registro de depuração para a CLI do Qwen Code.   | Variável | Não         | Nunca                        |
| `QWEN_CLI_VERSION` | Controla qual versão da CLI do Qwen Code será instalada.    | Variável | Não         | Ao fixar a versão da CLI     |
| `APP_ID`           | ID do Aplicativo GitHub para autenticação personalizada.     | Variável | Não         | Ao usar um Aplicativo GitHub personalizado |

Para adicionar uma variável do repositório:

1. Acesse as **Configurações > Segredos e variáveis > Actions > Nova variável** do seu repositório.
2. Insira o nome e o valor da variável.
3. Salve.

Para obter mais detalhes sobre variáveis do repositório, consulte a [documentação do GitHub sobre variáveis][variables].

### Segredos

Você pode definir os seguintes segredos no seu repositório:

| Nome              | Descrição                                           | Obrigatório | Quando é obrigatório                              |
| ----------------- | --------------------------------------------------- | ----------- | ------------------------------------------------- |
| `QWEN_API_KEY`    | Sua chave de API do Qwen obtida no DashScope.      | Sim         | Obrigatória em todos os fluxos de trabalho que chamam o Qwen. |
| `APP_PRIVATE_KEY` | Chave privada do seu aplicativo GitHub (formato PEM). | Não         | Ao usar um aplicativo GitHub personalizado.        |

Para adicionar um segredo:

1. Acesse as **Configurações > Segredos e variáveis > Actions > Novo segredo do repositório** do seu repositório.
2. Insira o nome e o valor do segredo.
3. Salve.

Para mais informações, consulte a [documentação oficial do GitHub sobre como criar e usar segredos criptografados][secrets].

## Autenticação

Esta ação exige autenticação na API do GitHub e, opcionalmente, nos serviços do Qwen Code.

### Autenticação no GitHub

Você pode se autenticar no GitHub de duas maneiras:

1. **`GITHUB_TOKEN` padrão:** Para casos de uso mais simples, a ação pode usar o
   `GITHUB_TOKEN` padrão fornecido pelo fluxo de trabalho.
2. **Aplicativo GitHub personalizado (recomendado):** Para autenticação mais segura e flexível,
   recomendamos criar um aplicativo GitHub personalizado.

Para instruções detalhadas sobre a configuração da autenticação tanto do Qwen quanto do GitHub, acesse a
[**documentação de autenticação**](./configuration/auth).

## Extensões

A CLI do Qwen Code pode ser estendida com funcionalidades adicionais por meio de extensões.
Essas extensões são instaladas diretamente do código-fonte em seus repositórios no GitHub.

Para instruções detalhadas sobre como configurar e personalizar extensões, acesse a
[documentação de extensões](../developers/extensions/extension).

## Melhores Práticas

Para garantir a segurança, confiabilidade e eficiência de seus fluxos de trabalho automatizados, recomendamos fortemente que você siga nossas melhores práticas. Essas diretrizes abrangem áreas essenciais, como segurança do repositório, configuração de fluxos de trabalho e monitoramento.

As principais recomendações incluem:

- **Proteção do Seu Repositório:** Implementação de proteção de branches e tags, além de restrição dos aprovadores de pull requests.
- **Monitoramento e Auditoria:** Revisão regular dos logs das ações e ativação do OpenTelemetry para obter insights mais profundos sobre desempenho e comportamento.

Para um guia completo sobre como proteger seu repositório e fluxos de trabalho, consulte nossa [**documentação de Melhores Práticas**](./common-workflow).

## Personalização

Crie um arquivo QWEN.md na raiz do seu repositório para fornecer contexto e instruções específicas ao projeto para a [CLI do Qwen Code](./common-workflow). Isso é útil para definir convenções de codificação, padrões arquitetônicos ou outras diretrizes que o modelo deve seguir em um determinado repositório.

## Contribuindo

Contribuições são bem-vindas! Confira o **Guia de Contribuição** da CLI do Qwen Code para obter mais detalhes sobre como começar.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context