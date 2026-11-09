# Autenticação

O menu `/auth` da primeira execução do Qwen Code possui cinco opções de nível superior. Escolha a que corresponde à forma como você deseja executar o CLI:

- [**Conta Qwen com Assinatura**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli): faça login com sua conta Qwen por meio do **Qwen OAuth** para acessar o **Qwen Code e Agent** com sua **assinatura Plus ou Pro** do [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli). Se você ainda não tem uma assinatura, visite [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) para assinar o Plus ou Pro, depois retorne ao Qwen Code e selecione [**Conta Qwen com Assinatura**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).
- **QwenCloud**: configuração oficial recomendada. Abre um submenu com **Token Plan** (assinatura com cota mensal de Créditos · endpoint dedicado, edições Personal e Team) ou **Standard API Key** (pague pelo uso). Em seguida, escolha explicitamente a plataforma — **China — Plataforma AI Qianwen** ou **International — QwenCloud** — para que o idioma da interface nunca determine seu endpoint. Ambos os métodos de acesso também habilitam a ferramenta integrada [`web_search`](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) sem configuração adicional.
- **Alibaba ModelStudio**: abre um submenu com **Coding Plan** (para desenvolvedores individuais · cota semanal incluída), **Token Plan** (para equipes e empresas · cobrança baseada em uso com endpoint dedicado) ou **Standard API Key** (conecte-se com uma chave de API existente do ModelStudio). O Token Plan e a Standard API Key também habilitam a ferramenta integrada [`web_search`](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) sem configuração adicional. Credenciais, endpoints e modelos salvos do ModelStudio continuam funcionando inalterados.
- **Third-party Providers**: escolha um provedor integrado e conecte-se com uma API key (DeepSeek, Grok, MiniMax, Z.AI, Kimi, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider**: conecte manualmente um servidor local, proxy ou provedor não suportado — suporta OpenAI, Anthropic, Gemini e outros endpoints compatíveis.

## **Opção 1: Qwen OAuth —** [**Conta Qwen com Assinatura**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)

O Qwen OAuth permite que você faça login com sua conta Qwen e use sua **assinatura Plus ou Pro** do [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) para acessar o **Qwen Code e Agent**. No menu da primeira execução ou no diálogo `/auth`, escolha [**Conta Qwen com Assinatura**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) para começar.

- **Como funciona**: selecione [**Conta Qwen com Assinatura**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) e siga o fluxo de login no navegador para autorizar o Qwen Code com sua conta Qwen.
- **Requisitos**: uma conta Qwen com uma **assinatura Plus ou Pro** ativa do [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) e acesso à internet.
- **Benefícios**: acesse o **Qwen Code e Agent** através da sua assinatura Qwen sem configurar manualmente uma chave de API.
- **Custo e cota**: o uso está sujeito ao seu plano de assinatura. Visite [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) para detalhes dos planos Plus e Pro.

### **Configuração interativa**

1. Se você ainda não tem uma assinatura, visite [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) e assine o **Plus ou Pro**. Se você já tem uma assinatura ativa, continue com a próxima etapa.
2. Inicie o Qwen Code no seu terminal:

   ```bash
   qwen
   ```

3. No menu da primeira execução, escolha [**Conta Qwen com Assinatura**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli). Se o Qwen Code já estiver em execução, digite `/auth` para abrir o menu de autenticação e selecione a mesma opção.
4. Conclua o fluxo de login e autorização no navegador usando a **mesma conta Qwen que você usou para assinar** em [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).
5. Retorne ao Qwen Code para começar a trabalhar com sua assinatura.

Para ambientes não interativos onde você não pode concluir o fluxo de login no navegador, como CI ou contêineres desassistidos, use um método de autenticação baseado em chave de API.

## ☁️ Opção 2: QwenCloud

A entrada oficial da plataforma. Escolha-a quando sua chave de API vier da Plataforma AI Qianwen (China) ou do QwenCloud (Internacional).

- **Como funciona**: escolha um método de acesso, depois escolha explicitamente a plataforma — o idioma da interface nunca determina seu endpoint. Insira a chave emitida por essa plataforma e o Qwen Code configura o endpoint correspondente.
- **Métodos de acesso**: **Token Plan** (uma assinatura com cota mensal de Créditos em um endpoint dedicado; edições Personal e Team) ou **Standard API Key** (pague pelo uso). O Coding Plan _não_ é oferecido aqui — é um produto do Alibaba ModelStudio, veja a Opção 3.
- **Requisitos**: uma chave do Token Plan (prefixada com `sk-sp-`) gerada no console do Token Plan, ou uma chave pague-pelo-uso (prefixada com `sk-` ou `sk-ws-`) da página de chaves de API da plataforma.
- **Benefícios**: ambos os métodos de acesso habilitam a ferramenta integrada [`web_search`](../../developers/tools/web-search.md) sem configuração adicional.

| Plataforma                | Método de acesso | Endpoint                                                      | Chave de API                                                                             |
| ------------------------- | ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| China — Qianwen AI Platform        | Chave de API padrão | `https://maas.qianwenaiapi.com/compatible-mode/v1`            | [Chaves de API](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) |
| China — Qianwen AI Platform        | Token Plan       | `https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1` | [Token Plan](https://platform.qianwenai.com/docs/token-plan/overview)                    |
| Internacional — QwenCloud | Chave de API padrão | `https://maas.qwencloudapi.com/compatible-mode/v1`            | [Chaves de API](https://docs.qwencloud.com/developer-guides/administration/api-keys)          |
| Internacional — QwenCloud | Token Plan       | `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` | [Token Plan](https://docs.qwencloud.com/token-plan/overview)                             |

### Configuração interativa

Digite `qwen` no terminal para iniciar o Qwen Code, execute o comando `/auth`, selecione **QwenCloud** e escolha **Token Plan** ou **Chave de API padrão** no submenu. Escolha a plataforma (**China — Qianwen AI Platform** ou **Internacional — QwenCloud**) e insira sua chave de API.

O Qwen Code verifica a lista de modelos do endpoint na inicialização com sua chave armazenada; consulte [Atualizações de provedores integrados](#built-in-provider-updates).

### Configuração headless ou via script

Para CI, contêineres ou scripts, configure a plataforma com variáveis de ambiente em vez do fluxo interativo `/auth`.

```bash
# Pay-as-you-go (Standard API Key), International
export QWENCLOUD_API_KEY="sk-your-api-key"
export OPENAI_BASE_URL="https://maas.qwencloudapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

```bash
# Token Plan, China
export QWENCLOUD_TOKEN_PLAN_API_KEY="sk-sp-your-api-key"
export OPENAI_BASE_URL="https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

### Alternativa: configurar via `settings.json`

Se preferir pular o fluxo interativo do `/auth`, adicione o seguinte ao `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-max",
        "name": "qwen3.8-max (QwenCloud)",
        "baseUrl": "https://maas.qwencloudapi.com/compatible-mode/v1",
        "description": "qwen3.8-max from QwenCloud Standard API Key",
        "envKey": "QWENCLOUD_API_KEY"
      }
    ]
  },
  "env": {
    "QWENCLOUD_API_KEY": "sk-your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.8-max"
  }
}
```

> [!note]
>
> `capabilities` é a única marca de provedor que nunca é inferida pelo nome do modelo, portanto, uma entrada escrita manualmente resolve sem declaração de raciocínio e `/effort` oferece a lista de tiers genéricos em vez dos tiers curados `low` / `medium` / `xhigh` do QwenCloud. Use `/auth` para instalar o provedor quando desejar o conjunto curado.

Assim como as outras chaves específicas de provedor, `QWENCLOUD_API_KEY` e `QWENCLOUD_TOKEN_PLAN_API_KEY` entram em vigor quando uma entrada de provedor `settings.json` as declara como `envKey`; para selecionar a autenticação compatível com OpenAI apenas com variáveis de ambiente, exporte `OPENAI_API_KEY`.

> [!note]
>
> QwenCloud e Alibaba ModelStudio são entradas separadas com chaves de ambiente e endpoints distintos. A escolha do QwenCloud não reescreve nem exclui credenciais, endpoints ou seleções de modelo salvos do ModelStudio.

## 💳 Opção 3: Alibaba Cloud Coding Plan [#-option-3-alibaba-cloud-coding-plan]

Use esta opção se você deseja custos previsíveis com diversas opções de modelos e cotas de uso mais altas.

- **Como funciona**: Assine o Coding Plan com uma taxa mensal fixa e, em seguida, configure o Qwen Code para usar o endpoint dedicado e sua API key de assinatura.
- **Requisitos**: Obtenha uma assinatura ativa do Coding Plan no [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) ou [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), dependendo da região da sua conta.
- **Benefícios**: Diversas opções de modelos, cotas de uso mais altas, custos mensais previsíveis, acesso a uma ampla gama de modelos (Qwen, GLM, Kimi, Minimax e mais).
- **Custo e cota**: Consulte a documentação do Aliyun ModelStudio Coding Plan[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

O Alibaba Cloud Coding Plan está disponível em duas regiões:

| Região                       | URL do Console                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Pequim) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (internacional)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Configuração interativa

Digite `qwen` no terminal para iniciar o Qwen Code, execute o comando `/auth`, selecione **Alibaba ModelStudio** e escolha **Coding Plan** no submenu. Escolha sua região e, em seguida, insira sua chave `sk-sp-xxxxxxxxx`.

O Qwen Code verifica a lista de modelos do endpoint na inicialização com sua chave armazenada; consulte [Atualizações de provedores integrados](#built-in-provider-updates).

Após a autenticação, use o comando `/model` para alternar entre todos os modelos suportados pelo Alibaba Cloud Coding Plan (incluindo qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 e MiniMax-M2.5).

### Configuração headless ou via script

Para CI, contêineres ou scripts, configure o Coding Plan com variáveis de ambiente ou `settings.json` em vez do comando removido `qwen auth coding-plan`.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Use `https://coding.dashscope.aliyuncs.com/v1` para o endpoint da China (Beijing) ou `https://coding-intl.dashscope.aliyuncs.com/v1` para o endpoint internacional.

### Alternativa: configurar via `settings.json`

Se preferir pular o fluxo interativo do `/auth`, adicione o seguinte ao `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> O Coding Plan usa um endpoint dedicado (`https://coding.dashscope.aliyuncs.com/v1`) que é diferente do endpoint padrão do Dashscope. Certifique-se de usar o `baseUrl` correto.

## 🪙 Opção 4: Alibaba Cloud Token Plan

Use esta opção se sua equipe ou empresa prefere cobrança baseada no uso em um endpoint dedicado do ModelStudio.

- **Como funciona**: Assine o Token Plan no Alibaba Cloud ModelStudio e, em seguida, configure o Qwen Code para usar o endpoint do Token Plan específico da região e sua API key. Você é cobrado pelo uso real de tokens em vez de uma taxa mensal fixa.
- **Requisitos**: Obtenha uma API key do Token Plan no [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) ou [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model), dependendo da região da sua conta.
- **Benefícios**: Cobrança baseada no uso para equipes e empresas, endpoints dedicados específicos por região, acesso a uma ampla gama de modelos (Qwen, DeepSeek, GLM, Kimi, Minimax e mais).
- **Custo e cota**: Consulte a documentação do Token Plan do Alibaba Cloud ModelStudio [Beijing](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model).

O Token Plan está disponível em duas regiões, cada uma com seu próprio endpoint dedicado:

| Região                    | Endpoint                                                                 | URL do Console                                                                                         |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| China (Pequim)           | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`     | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing)                         |
| Singapura (Internacional) | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1) |

### Configuração interativa

Digite `qwen` no terminal para iniciar o Qwen Code, execute o comando `/auth`, selecione **Alibaba ModelStudio** e escolha **Token Plan** no submenu. Escolha sua região (**China (Pequim)** ou **Singapura (Internacional)**) e insira sua chave de API. O assistente exibe então sua etapa final (Etapa 3/3 · IDs de Modelo), onde você escolhe os IDs de modelo a configurar: os modelos atendidos por seu endpoint são oferecidos lá e aplicados somente quando você os seleciona explicitamente. As chaves de API do ModelStudio Token Plan não têm requisito de prefixo, diferentemente das chaves do Coding Plan, que começam com `sk-sp-`, e das chaves separadas do QwenCloud Token Plan da Opção 2, que também começam com `sk-sp-`.

Após a autenticação, use o comando `/model` para navegar e alternar entre os modelos configurados para o seu Token Plan. A linha de modelos evolui com o tempo, portanto, ela intencionalmente não é listada aqui; a descoberta de modelos a partir do endpoint acontece durante a etapa de configuração do `/auth` acima (a própria lista do endpoint é oferecida ali e deve ser selecionada explicitamente), e o `/model` então mostra os modelos configurados para o seu plano.

O Qwen Code também verifica a lista de modelos do endpoint na inicialização com sua chave de API armazenada, conforme descrito em [Atualizações de provedores integrados](#built-in-provider-updates).

### Configuração headless ou via script

Para CI, contêineres ou scripts, configure o Token Plan com variáveis de ambiente ou `settings.json` em vez do fluxo interativo do `/auth`.

```bash
export BAILIAN_TOKEN_PLAN_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.7-plus"
```

Use `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` para o endpoint da China (Beijing) ou `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` para o endpoint internacional (Singapura). Substitua `qwen3.7-plus` por qualquer modelo incluído no seu plano.

Observe que `BAILIAN_TOKEN_PLAN_API_KEY` é uma chave específica do provedor: ela entra em vigor quando a entrada do provedor no `settings.json` na próxima seção existe, porque essa entrada a declara como a `envKey`. Para selecionar a autenticação compatível com OpenAI apenas com variáveis de ambiente, exporte `OPENAI_API_KEY` em vez disso — chaves específicas do provedor não selecionam o tipo de autenticação sozinhas.

### Alternativa: configurar via `settings.json`

Se preferir pular o fluxo interativo do `/auth`, adicione o seguinte ao `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "name": "qwen3.7-plus (Token Plan)",
        "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        "description": "qwen3.7-plus from Alibaba Cloud Token Plan",
        "envKey": "BAILIAN_TOKEN_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_TOKEN_PLAN_API_KEY": "your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.7-plus"
  }
}
```

> [!note]
>
> O Token Plan usa endpoints dedicados e específicos por região (`*.maas.aliyuncs.com`) que são diferentes do endpoint padrão do DashScope. Certifique-se de que o `baseUrl` corresponde à região da sua assinatura.

## 🚀 Opção 5: Chave de API (flexível)

Use esta opção se você deseja se conectar a provedores terceiros como OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope ou um endpoint auto-hospedado. Suporta múltiplos protocolos e provedores.

### Recomendado: Configuração em um único arquivo via `settings.json` [#recommended-one-file-setup-via-settingsjson]

A maneira mais simples de começar com a autenticação por API Key é colocar tudo em um único arquivo `~/.qwen/settings.json`. Aqui está um exemplo completo e pronto para uso:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder via Dashscope",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

O que cada campo faz:

| Campo                        | Descrição                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Declara quais modelos estão disponíveis e como se conectar a eles. As chaves (`openai`, `anthropic`, `gemini`) representam o protocolo da API.              |
| `env`                        | Armazena API keys diretamente no `settings.json` como um fallback (menor prioridade — `export` do shell e arquivos `.env` têm precedência).                  |
| `security.auth.selectedType` | Informa ao Qwen Code qual protocolo usar na inicialização (por exemplo, `openai`, `anthropic`, `gemini`). Sem isso, você precisaria executar o `/auth` interativamente. |
| `model.name`                 | O modelo padrão a ser ativado quando o Qwen Code iniciar. Deve corresponder a um dos valores de `id` no seu `modelProviders`.                                |

Após salvar o arquivo, basta executar `qwen` — nenhuma configuração interativa do `/auth` é necessária.

> [!tip]
>
> As seções abaixo explicam cada parte com mais detalhes. Se o exemplo rápido acima funcionar para você, sinta-se à vontade para pular para as [Notas de segurança](#security-notes).

O conceito principal é **Model Providers** (`modelProviders`): o Qwen Code suporta múltiplos protocolos de API, não apenas o OpenAI. Você configura quais provedores e modelos estão disponíveis editando o `~/.qwen/settings.json` e, em seguida, alterna entre eles em tempo de execução com o comando `/model`.

#### Protocolos suportados

| Protocolo          | Chave `modelProviders` | Variáveis de ambiente                                                                                | Provedores                                                                                             |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Compatível com OpenAI | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (alias: `QWEN_MODEL`)                            | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, qualquer endpoint compatível com OpenAI |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                         | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                     | Google Gemini                                                                                         |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY` + `GOOGLE_MODEL` (define `GOOGLE_GENAI_USE_VERTEXAI=true`) ou `GOOGLE_CLOUD_PROJECT` + `GOOGLE_MODEL` (ADC sem chave); usa o protocolo `gemini` | Google Vertex AI                                                                                      |

#### Passo 1: Configurar modelos e provedores em `~/.qwen/settings.json`

Defina quais modelos estão disponíveis para cada protocolo. Cada entrada de modelo requer no mínimo um `id`; `envKey` (o nome da variável de ambiente que contém sua API key) é opcional e recomendado — quando omitido, ele usa o fallback para a chave de ambiente padrão do tipo de autenticação (por exemplo, `OPENAI_API_KEY` para `openai`).

> [!important]
>
> Recomenda-se definir `modelProviders` no `~/.qwen/settings.json` no escopo do usuário para evitar conflitos de merge entre as configurações do projeto e do usuário.

Edite o `~/.qwen/settings.json` (crie-o se não existir). Você pode misturar múltiplos protocolos em um único arquivo — aqui está um exemplo com múltiplos provedores mostrando apenas a seção `modelProviders`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> Não se esqueça de também definir `env`, `security.auth.selectedType` e `model.name` junto com `modelProviders` — veja o [exemplo completo acima](#recommended-one-file-setup-via-settingsjson) como referência.

**Campos de `ModelConfig` (cada entrada dentro de `modelProviders`):**

| Campo              | Obrigatório | Descrição                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Sim      | ID do modelo enviado para a API (por exemplo, `gpt-4o`, `claude-sonnet-4-20250514`)                                                                               |
| `wireApi`          | Não       | Formato de solicitação compatível com OpenAI: `chat-completions` ou `responses`. Omitir para herdar o protocolo do provedor.                                        |
| `name`             | Não       | Nome de exibição no seletor `/model` (padrão para `id`)                                                                                             |
| `envKey`           | Não       | Nome da variável de ambiente para a API key (por exemplo, `OPENAI_API_KEY`); opcional/recomendado — usa o fallback para a chave de ambiente padrão do tipo de autenticação quando omitido |
| `baseUrl`          | Não       | Substituição do endpoint da API (útil para proxies ou endpoints personalizados)                                                                                     |
| `generationConfig` | Não       | Ajuste fino de `timeout`, `maxRetries`, `samplingParams`, etc.                                                                                          |

> [!note]
>
> Ao usar o campo `env` no `settings.json`, as credenciais são armazenadas em texto simples. Para uma segurança melhor, prefira arquivos `.env` ou `export` do shell — veja o [Passo 2](#step-2-set-environment-variables).

Para o esquema completo de `modelProviders` e opções avançadas como `generationConfig`, `customHeaders` e `extra_body`, consulte a [Referência de Model Providers](./model-providers.md).

#### Passo 2: Definir variáveis de ambiente [#step-2-set-environment-variables]

O Qwen Code lê as API keys das variáveis de ambiente (especificadas por `envKey` na configuração do seu modelo). Há várias maneiras de fornecê-las, listadas abaixo da **maior para a menor prioridade**:

**1. Ambiente do shell / `export` (maior prioridade)**

Defina diretamente no perfil do seu shell (`~/.zshrc`, `~/.bashrc`, etc.) ou inline antes de iniciar:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-compatible
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Arquivos `.env`**

O Qwen Code carrega automaticamente o **primeiro** arquivo `.env` que encontrar (as variáveis **não são mescladas** entre vários arquivos). Apenas variáveis que ainda não estão presentes em `process.env` são carregadas.

Ordem de busca (a partir do diretório atual, subindo em direção a `/`):

1. `.qwen/.env` (preferido — mantém as variáveis do Qwen Code isoladas de outras ferramentas)
2. `.env`

Se nada for encontrado, ele usa o fallback para o seu **diretório home**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` é recomendado em vez de `.env` para evitar conflitos com outras ferramentas. Algumas variáveis (como `DEBUG` e `DEBUG_MODE`) são excluídas de arquivos `.env` no nível do projeto para evitar interferências no comportamento do Qwen Code.

**3. Campo `settings.json` → `env` (menor prioridade)**

Você também pode definir API keys diretamente no `~/.qwen/settings.json` sob a chave `env`. Elas são carregadas como o **fallback de menor prioridade** — aplicadas apenas quando uma variável ainda não foi definida pelo ambiente do sistema ou arquivos `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Esta é a abordagem usada no [exemplo de configuração em um único arquivo](#recommended-one-file-setup-via-settingsjson) acima. É conveniente para manter tudo em um só lugar, mas tenha em mente que o `settings.json` pode ser compartilhado ou sincronizado — prefira arquivos `.env` para segredos sensíveis.

**Resumo de prioridade:**

| Prioridade    | Fonte                         | Comportamento de substituição                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (maior) | Flags da CLI (`--openai-api-key`) | Sempre prevalece                                  |
| 2           | Env do sistema (`export`, inline)  | Substitui `.env` e `settings.json` → `env` |
| 3           | Arquivo `.env`                    | Define apenas se não estiver no env do sistema               |
| 4 (menor)  | `settings.json` → `env`        | Define apenas se não estiver no env do sistema ou `.env`     |

#### Passo 3: Alternar modelos com `/model`

Após iniciar o Qwen Code, use o comando `/model` para alternar entre todos os modelos configurados. Os modelos são agrupados por protocolo:

```
/model
```

O seletor mostrará todos os modelos da sua configuração `modelProviders`, agrupados por seu protocolo (por exemplo, `openai`, `anthropic`, `gemini`). Sua seleção é persistida entre as sessões.

Você também pode alternar modelos diretamente com um argumento de linha de comando, o que é conveniente ao trabalhar em vários terminais.

```bash
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## Atualizações de provedores integrados [#built-in-provider-updates]

Provedores instalados com uma lista de modelos integrada podem oferecer uma **Atualização de Provedor Integrado** quando um preset mais recente é lançado.

QwenCloud (Token Plan e Chave de API padrão) e Alibaba ModelStudio (Coding Plan, Token Plan e Chave de API padrão) também verificam `/models` na inicialização. Essa verificação usa a variável de chave de API específica do provedor salva por `/auth` (por exemplo, `BAILIAN_TOKEN_PLAN_API_KEY`), incluindo valores de `settings.env`. Uma chave fornecida apenas por meio de sinalizador de CLI, `OPENAI_API_KEY` ou configurações genéricas de autenticação não habilita essa verificação; chaves genéricas não são encaminhadas aos endpoints de outros provedores.

A descoberta bem-sucedida limita a atualização aos modelos integrados servidos pela sua chave, preservando os modelos adicionados pelo usuário. Ela também pode oferecer uma atualização quando o conjunto servido muda sem um lançamento de predefinição, como após a troca de planos. A descoberta por si só mantém o modelo selecionado; depois que você se afasta dele, uma verificação posterior na inicialização pode oferecer sua remoção. Se a filtragem não deixar nenhum modelo integrado para instalar, a configuração do provedor existente é mantida sem solicitar confirmação. Quando apenas o conjunto servido muda, a atualização adiciona somente os modelos recém-servidos, portanto, um modelo que você deixou de fora durante `/auth` não será readicionado. Se nada fosse mudar, a verificação é registrada sem um prompt.

Se a descoberta estiver indisponível, falhar ou não corresponder a nenhum modelo integrado, uma atualização de predefinição usará a lista completa de modelos integrados; uma instalação já atualizada permanece inalterada. Provedores sem descoberta continuam a usar a lista integrada.

**Mais tarde** aguarda 24 horas antes de perguntar novamente sobre a mesma versão ou conjunto servido; uma mudança diferente ainda pode gerar um prompt. Atualizar, pular ou registrar silenciosamente uma decisão mais nova limpa o adiamento anterior. **Pular** mantém sua configuração, incluindo os modelos retidos: uma versão de predefinição pulada não é oferecida novamente até que uma mais nova seja lançada, e um conjunto servido pulado não é oferecido novamente até que ele mude.

## Comando de CLI `qwen auth` removido

O comando de CLI autônomo `qwen auth` foi removido. Use estas substituições em vez dele:

| Caso de uso anterior                | Substituição                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Configuração interativa de autenticação | Execute `qwen` e use `/auth`                                                                |
| Configuração do Coding Plan                | Use `/auth` ou defina `BAILIAN_CODING_PLAN_API_KEY` com a URL base do Coding Plan             |
| Configuração do Token Plan                 | Use `/auth` ou defina `BAILIAN_TOKEN_PLAN_API_KEY` com a URL base do Token Plan para sua região |
| Configuração do OpenRouter                 | Use `/auth` ou defina `OPENROUTER_API_KEY` e `OPENAI_BASE_URL=https://openrouter.ai/api/v1` |
| Configuração do Requesty                   | Use `/auth` ou defina `REQUESTY_API_KEY` e `OPENAI_BASE_URL=https://router.requesty.ai/v1`  |
| Configuração de API key ou provedor personalizado | Configure `~/.qwen/settings.json`, `.env` ou variáveis de ambiente específicas do provedor       |
| Verificar autenticação atual     | Execute `/doctor` dentro do Qwen Code                                                              |
| Fluxo do navegador OAuth               | Execute `qwen` interativamente e use `/auth`; o OAuth não pode ser configurado apenas com variáveis de ambiente    |

Invocações legadas como `qwen auth status` exibem um aviso de remoção que resume esses caminhos de migração, incluindo uma entrada do Token Plan com as URLs base para ambas as regiões.

## Notas de segurança [#security-notes]

- Não faça commit de API keys no controle de versão.
- Prefira `.qwen/.env` para segredos locais do projeto (e mantenha-o fora do git).
- Trate a saída do seu terminal como sensível se ela imprimir credenciais para verificação.
