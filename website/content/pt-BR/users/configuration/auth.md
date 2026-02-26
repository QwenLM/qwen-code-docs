# Autenticação

O Qwen Code suporta dois métodos de autenticação. Escolha aquele que corresponde à forma como você deseja executar a CLI:

- **OAuth Qwen (recomendado)**: faça login com sua conta `qwen.ai` em um navegador.
- **Chave de API**: utilize uma chave de API para se conectar a qualquer provedor compatível. Mais flexível — suporta OpenAI, Anthropic, Google GenAI, Alibaba Cloud Bailian e outros endpoints compatíveis.

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

## 👍 Opção 1: Qwen OAuth (recomendado & gratuito)

Use esta opção se você quiser a configuração mais simples e estiver usando modelos Qwen.

- **Como funciona**: na primeira inicialização, o Qwen Code abre uma página de login no navegador. Após finalizar, as credenciais são armazenadas em cache localmente, então geralmente você não precisará fazer login novamente.
- **Requisitos**: uma conta `qwen.ai` + acesso à internet (pelo menos para o primeiro login).
- **Benefícios**: sem gerenciamento de chave de API, atualização automática de credenciais.
- **Custo & cota**: gratuito, com uma cota de **60 requisições/minuto** e **1.000 requisições/dia**.

Inicie a CLI e siga o fluxo do navegador:

```bash
qwen
```

> [!note]
>
> Em ambientes não interativos ou headless (por exemplo, CI, SSH, contêineres), você normalmente **não pode** completar o fluxo de login OAuth no navegador.  
> Nesses casos, utilize o método de autenticação por chave de API.

## 🚀 Opção 2: API-KEY (flexível)

Use esta opção se quiser mais flexibilidade sobre qual provedor e modelo utilizar. Suporta múltiplos protocolos e provedores, incluindo OpenAI, Anthropic, Google GenAI, Alibaba Cloud Bailian, Azure OpenAI, OpenRouter, ModelScope ou um endpoint compatível auto-hospedado.

### Recomendado: Configuração em um único arquivo via `settings.json`

A maneira mais simples de começar com autenticação por API-KEY é colocar tudo em um único arquivo `~/.qwen/settings.json`. Aqui está um exemplo completo e pronto para uso:

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
| `modelProviders`             | Declara quais modelos estão disponíveis e como se conectar a eles. As chaves (`openai`, `anthropic`, `gemini`, `vertex-ai`) representam o protocolo da API. |
| `env`                        | Armazena chaves de API diretamente no `settings.json` como fallback (prioridade mais baixa — os comandos `export` do shell e arquivos `.env` têm precedência). |
| `security.auth.selectedType` | Informa ao Qwen Code qual protocolo usar na inicialização (ex: `openai`, `anthropic`, `gemini`). Sem isso, você precisaria executar `/auth` interativamente. |
| `model.name`                 | O modelo padrão a ser ativado quando o Qwen Code iniciar. Deve corresponder a um dos valores de `id` em seus `modelProviders`.                   |

Após salvar o arquivo, basta executar `qwen` — nenhuma configuração interativa de `/auth` será necessária.

> [!tip]
>
> As seções abaixo explicam cada parte com mais detalhes. Se o exemplo rápido acima funcionar para você, sinta-se à vontade para pular direto para [Notas de segurança](#notas-de-seguran%C3%A7a).

### Opção 1: Plano de Codificação (Aliyun Bailian)

Use esta opção se desejar custos previsíveis com cotas de uso mais altas para o modelo qwen3-coder-plus.

- **Como funciona**: Inscreva-se no Plano de Codificação com uma taxa mensal fixa, então configure o Qwen Code para usar o endpoint dedicado e sua chave de API da assinatura.
- **Requisitos**: Obtenha uma assinatura ativa do Plano de Codificação em [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan).
- **Benefícios**: Cotas de uso mais altas, custos mensais previsíveis, acesso ao modelo mais recente qwen3-coder-plus.
- **Custo e cota**: Visualize a [documentação do Plano de Codificação da Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

Digite `qwen` no terminal para iniciar o Qwen Code, então digite o comando `/auth` e selecione `API-KEY`

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

Após inserir, selecione `Coding Plan`:

![](https://gw.alicdn.com/imgextra/i4/O1CN01Irk0AD1ebfop69o0r_!!6000000003890-2-tps-2308-830.png)

Insira sua chave `sk-sp-xxxxxxxxx`, então use o comando `/model` para alternar entre todos os modelos suportados pelo `Coding Plan` da Bailian (incluindo qwen3.5-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max, glm-4.7 e kimi-k2.5):

![](https://gw.alicdn.com/imgextra/i4/O1CN01fWArmf1kaCEgSmPln_!!6000000004699-2-tps-2304-1374.png)

**Alternativa: configurar o Plano de Codificação via `settings.json`**

Se preferir pular o fluxo interativo `/auth`, adicione o seguinte conteúdo a `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus do Plano de Codificação Bailian",
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
> O Plano de Codificação utiliza um endpoint dedicado (`https://coding.dashscope.aliyuncs.com/v1`) que é diferente do endpoint padrão do Dashscope. Certifique-se de usar o `baseUrl` correto.

### Opção 2: API-KEY de terceiros

Use esta opção se quiser se conectar a provedores de terceiros, como OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope ou um endpoint auto-hospedado.

O conceito principal é **Provedores de Modelos** (`modelProviders`): O Qwen Code suporta múltiplos protocolos de API, não apenas o OpenAI. Você configura quais provedores e modelos estão disponíveis editando o arquivo `~/.qwen/settings.json` e, em seguida, alterna entre eles em tempo de execução com o comando `/model`.

#### Protocolos suportados

| Protocolo         | Chave `modelProviders` | Variáveis de ambiente                                        | Provedores                                                                                          |
| ----------------- | -------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Compatível com OpenAI | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian, qualquer endpoint compatível com OpenAI |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                                    |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                       |
| Google Vertex AI  | `vertex-ai`          | `GOOGLE_API_KEY`, `GOOGLE_MODEL`                             | Google Vertex AI                                                                                    |

#### Passo 1: Configure modelos e provedores em `~/.qwen/settings.json`

Defina quais modelos estão disponíveis para cada protocolo. Cada entrada de modelo requer no mínimo um `id` e uma `envKey` (o nome da variável de ambiente que contém sua chave de API).

> [!important]
>
> É recomendado definir `modelProviders` no escopo do usuário em `~/.qwen/settings.json` para evitar conflitos de merge entre configurações de projeto e do usuário.

Edite `~/.qwen/settings.json` (crie se não existir). Você pode misturar múltiplos protocolos em um único arquivo — aqui está um exemplo multi-provedor mostrando apenas a seção `modelProviders`:

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
> Não se esqueça de também configurar `env`, `security.auth.selectedType` e `model.name` junto com `modelProviders` — veja o [exemplo completo acima](#recommended-one-file-setup-via-settingsjson) como referência.

**Campos de `ModelConfig` (cada entrada dentro de `modelProviders`):**

| Campo              | Obrigatório | Descrição                                                                 |
| ------------------ | ----------- | ------------------------------------------------------------------------- |
| `id`               | Sim         | ID do modelo enviado para a API (ex: `gpt-4o`, `claude-sonnet-4-20250514`) |
| `name`             | Não         | Nome exibido no seletor `/model` (padrão é `id`)                          |
| `envKey`           | Sim         | Nome da variável de ambiente para a chave de API (ex: `OPENAI_API_KEY`)   |
| `baseUrl`          | Não         | Substituição do endpoint da API (útil para proxies ou endpoints personalizados) |
| `generationConfig` | Não         | Ajuste fino de `timeout`, `maxRetries`, `samplingParams`, etc.            |

> [!note]
>
> Ao usar o campo `env` em `settings.json`, as credenciais são armazenadas em texto plano. Para melhor segurança, prefira arquivos `.env` ou `export` no shell — veja [Passo 2](#step-2-set-environment-variables).

Para ver o schema completo de `modelProviders` e opções avançadas como `generationConfig`, `customHeaders` e `extra_body`, consulte [Referência de Provedores de Modelo](model-providers.md).

#### Passo 2: Configurar variáveis de ambiente

O Qwen Code lê as chaves da API a partir de variáveis de ambiente (especificadas por `envKey` na sua configuração de modelo). Existem várias maneiras de fornecê-las, listadas abaixo em ordem **da maior para a menor prioridade**:

**1. Ambiente do shell / `export` (maior prioridade)**

Defina diretamente no seu perfil do shell (`~/.zshrc`, `~/.bashrc`, etc.) ou em linha antes de iniciar:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / compatível com OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Arquivos `.env`**

O Qwen Code carrega automaticamente o **primeiro** arquivo `.env` que encontra (as variáveis **não são mescladas** entre múltiplos arquivos). Apenas variáveis que ainda não estejam presentes em `process.env` são carregadas.

Ordem de busca (a partir do diretório atual, subindo em direção a `/`):

1. `.qwen/.env` (recomendado — mantém as variáveis do Qwen Code isoladas de outras ferramentas)
2. `.env`

Se nada for encontrado, ele recorre ao seu **diretório home**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` é recomendado em vez de `.env` para evitar conflitos com outras ferramentas. Algumas variáveis (como `DEBUG` e `DEBUG_MODE`) são excluídas de arquivos `.env` no nível do projeto para evitar interferência no comportamento do Qwen Code.

**3. `settings.json` → campo `env` (prioridade mais baixa)**

Você também pode definir chaves de API diretamente em `~/.qwen/settings.json` sob a chave `env`. Elas são carregadas como **fallback de prioridade mais baixa** — aplicadas apenas quando uma variável ainda não foi definida pelo ambiente do sistema ou por arquivos `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Essa é a abordagem usada no [exemplo de configuração em um único arquivo](#recommended-one-file-setup-via-settingsjson) acima. É conveniente para manter tudo em um só lugar, mas tenha cuidado pois `settings.json` pode ser compartilhado ou sincronizado — prefira arquivos `.env` para segredos sensíveis.

**Resumo de prioridades:**

| Prioridade  | Origem                          | Comportamento de substituição             |
| ----------- | ------------------------------- | ----------------------------------------- |
| 1 (maior)   | Flags da CLI (`--openai-api-key`) | Sempre vence                              |
| 2           | Ambiente do sistema (`export`, inline) | Substitui `.env` e `settings.env`         |
| 3           | Arquivo `.env`                  | Apenas define se não estiver no ambiente do sistema |
| 4 (menor)   | `settings.json` → `env`         | Apenas define se não estiver no ambiente do sistema ou em `.env` |

#### Passo 3: Alternar modelos com `/model`

Após iniciar o Qwen Code, utilize o comando `/model` para alternar entre todos os modelos configurados. Os modelos são agrupados por protocolo:

```
/model
```

O seletor mostrará todos os modelos da sua configuração `modelProviders`, agrupados pelo seu protocolo (por exemplo, `openai`, `anthropic`, `gemini`). Sua seleção é mantida entre sessões.

Você também pode alternar modelos diretamente com um argumento de linha de comando, o que é conveniente ao trabalhar em múltiplos terminais.

```bash

# Em um terminal

qwen --model "qwen3-coder-plus"

# Em outro terminal

qwen --model "qwen3-coder-next"
```

## Notas de segurança

- Não commite chaves de API para controle de versão.
- Prefira `.qwen/.env` para segredos locais do projeto (e mantenha fora do git).
- Trate a saída do seu terminal como sensível caso ela imprima credenciais para verificação.