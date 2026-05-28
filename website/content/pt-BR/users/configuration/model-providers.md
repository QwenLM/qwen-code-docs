---
description: "Configure Qwen Code modelProviders para OpenAI, Anthropic, Gemini e outros modelos, gerenciando API keys, troca de modelos e governança da equipe."
---

# Provedores de Modelos

O Qwen Code permite que você configure vários provedores de modelos por meio da configuração `modelProviders` no seu `settings.json`. Isso permite alternar entre diferentes modelos e provedores de IA usando o comando `/model`.

## Visão Geral

Use `modelProviders` para declarar listas de modelos curadas por tipo de autenticação que o seletor `/model` pode alternar. As chaves devem ser tipos de autenticação válidos (`openai`, `anthropic`, `gemini`, etc.). Cada entrada requer um `id` e **deve incluir `envKey`**, com `name`, `description`, `baseUrl` e `generationConfig` opcionais. As credenciais nunca são persistidas nas configurações; o runtime as lê de `process.env[envKey]`. Os modelos Qwen OAuth permanecem hard-coded e não podem ser sobrescritos.

> [!note]
>
> Apenas o comando `/model` expõe tipos de autenticação não padrão. Anthropic, Gemini, etc., devem ser definidos via `modelProviders`. O comando `/auth` lista Qwen OAuth, Alibaba Cloud Coding Plan e API Key como as opções de autenticação integradas.

> [!warning]
>
> **IDs de modelo duplicados no mesmo authType:** Definir vários modelos com o mesmo `id` sob um único `authType` (por exemplo, duas entradas com `"id": "gpt-4o"` em `openai`) atualmente não é suportado. Se houver duplicatas, **a primeira ocorrência vence** e as duplicatas subsequentes são ignoradas com um aviso. Observe que o campo `id` é usado tanto como identificador de configuração quanto como o nome real do modelo enviado à API, portanto, usar IDs únicos (por exemplo, `gpt-4o-creative`, `gpt-4o-balanced`) não é uma solução viável. Esta é uma limitação conhecida que planejamos resolver em uma versão futura.

## Exemplos de Configuração por Tipo de Autenticação

Abaixo estão exemplos abrangentes de configuração para diferentes tipos de autenticação, mostrando os parâmetros disponíveis e suas combinações.

### Tipos de Autenticação Suportados

As chaves do objeto `modelProviders` devem ser valores válidos de `authType`. Os tipos de autenticação atualmente suportados são:

| Auth Type    | Descrição                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `openai`     | APIs compatíveis com OpenAI (OpenAI, Azure OpenAI, servidores de inferência locais como vLLM/Ollama) |
| `anthropic`  | API Anthropic Claude                                                                    |
| `gemini`     | API Google Gemini                                                                       |
| `qwen-oauth` | Qwen OAuth (hard-coded, não pode ser sobrescrito em `modelProviders`)                       |

> [!warning]
> Se uma chave de tipo de autenticação inválida for usada (por exemplo, um erro de digitação como `"openai-custom"`), a configuração será **ignorada silenciosamente** e os modelos não aparecerão no seletor `/model`. Sempre use um dos valores de tipo de autenticação suportados listados acima.

### SDKs Usados para Requisições de API

O Qwen Code usa os seguintes SDKs oficiais para enviar requisições a cada provedor:

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - SDK oficial OpenAI para Node.js                  |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK oficial Anthropic |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK oficial Google GenAI      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) com provedor personalizado (compatível com DashScope)    |

Isso significa que o `baseUrl` que você configurar deve ser compatível com o formato de API esperado pelo SDK correspondente. Por exemplo, ao usar o tipo de autenticação `openai`, o endpoint deve aceitar requisições no formato da API OpenAI.

### Provedores compatíveis com OpenAI (`openai`)

Este tipo de autenticação suporta não apenas a API oficial da OpenAI, mas também qualquer endpoint compatível com OpenAI, incluindo provedores de modelos agregados como o OpenRouter.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "enableCacheControl": true,
          "contextWindowSize": 128000,
          "modalities": {
            "image": true
          },
          "customHeaders": {
            "X-Client-Request-ID": "req-123"
          },
          "extra_body": {
            "enable_thinking": true,
            "service_tier": "priority"
          },
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 4096,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.1
          }
        }
      },
      {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 30000,
          "samplingParams": {
            "temperature": 0.5,
            "max_tokens": 2048
          }
        }
      },
      {
        "id": "openai/gpt-4o",
        "name": "GPT-4o (via OpenRouter)",
        "envKey": "OPENROUTER_API_KEY",
        "baseUrl": "https://openrouter.ai/api/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      }
    ]
  }
}
```

### Anthropic (`anthropic`)

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "contextWindowSize": 200000,
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 8192,
            "top_p": 0.9
          }
        }
      },
      {
        "id": "claude-3-opus",
        "name": "Claude 3 Opus",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 180000,
          "samplingParams": {
            "temperature": 0.3,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "capabilities": {
          "vision": true
        },
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 2,
          "contextWindowSize": 1000000,
          "schemaCompliance": "auto",
          "samplingParams": {
            "temperature": 0.4,
            "top_p": 0.95,
            "max_tokens": 8192,
            "top_k": 40
          }
        }
      }
    ]
  }
}
```

### Modelos Locais Self-Hosted (via API compatível com OpenAI)

A maioria dos servidores de inferência locais (vLLM, Ollama, LM Studio, etc.) fornece um endpoint de API compatível com OpenAI. Configure-os usando o tipo de autenticação `openai` com um `baseUrl` local:

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen2.5-7b",
        "name": "Qwen2.5 7B (Ollama)",
        "envKey": "OLLAMA_API_KEY",
        "baseUrl": "http://localhost:11434/v1",
        "generationConfig": {
          "timeout": 300000,
          "maxRetries": 1,
          "contextWindowSize": 32768,
          "samplingParams": {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 4096
          }
        }
      },
      {
        "id": "llama-3.1-8b",
        "name": "Llama 3.1 8B (vLLM)",
        "envKey": "VLLM_API_KEY",
        "baseUrl": "http://localhost:8000/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 2,
          "contextWindowSize": 128000,
          "samplingParams": {
            "temperature": 0.6,
            "max_tokens": 8192
          }
        }
      },
      {
        "id": "local-model",
        "name": "Local Model (LM Studio)",
        "envKey": "LMSTUDIO_API_KEY",
        "baseUrl": "http://localhost:1234/v1",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": {
            "temperature": 0.5
          }
        }
      }
    ]
  }
}
```

Para servidores locais que não exigem autenticação, você pode usar qualquer valor de placeholder para a API key:

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> O parâmetro `extra_body` é **suportado apenas para provedores compatíveis com OpenAI** (`openai`, `qwen-oauth`). Ele é ignorado para provedores Anthropic e Gemini.

> [!note]
>
> **Sobre `envKey`**: O campo `envKey` especifica o **nome de uma variável de ambiente**, e não o valor real da API key. Para que a configuração funcione, você precisa garantir que a variável de ambiente correspondente esteja definida com sua API key real. Existem duas maneiras de fazer isso:
>
> - **Opção 1: Usando um arquivo `.env`** (recomendado por segurança):
>   ```bash
>   # ~/.qwen/.env (or project root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Certifique-se de adicionar `.env` ao seu `.gitignore` para evitar o commit acidental de segredos.
> - **Opção 2: Usando o campo `env` no `settings.json`** (como mostrado nos exemplos acima):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Cada exemplo de provedor inclui um campo `env` para ilustrar como a API key deve ser configurada.

## Alibaba Cloud Coding Plan

O Alibaba Cloud Coding Plan fornece um conjunto pré-configurado de modelos Qwen otimizados para tarefas de codificação. Este recurso está disponível para usuários com acesso à API do Alibaba Cloud Coding Plan e oferece uma experiência de configuração simplificada com atualizações automáticas de configuração de modelo.

### Visão Geral

Quando você se autentica com uma API key do Alibaba Cloud Coding Plan usando o comando `/auth`, o Qwen Code configura automaticamente os seguintes modelos:

| Model ID               | Name                 | Descrição                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Modelo avançado com thinking habilitado   |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Otimizado para tarefas de codificação             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Modelo max mais recente com thinking habilitado |

### Configuração

1. Obtenha uma API key do Alibaba Cloud Coding Plan:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Execute o comando `/auth` no Qwen Code
3. Selecione **Alibaba Cloud Coding Plan**
4. Selecione sua região
5. Insira sua API key quando solicitado

Os modelos serão configurados automaticamente e adicionados ao seu seletor `/model`.

### Regiões

O Alibaba Cloud Coding Plan suporta duas regiões:

| Region               | Endpoint                                        | Descrição             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpoint da China continental |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Endpoint internacional  |

A região é selecionada durante a autenticação e armazenada no `settings.json` em `codingPlan.region`. Para alternar regiões, execute novamente o comando `/auth` e selecione uma região diferente.

### Armazenamento da API Key

Quando você configura o Coding Plan por meio do comando `/auth`, a API key é armazenada usando o nome de variável de ambiente reservado `BAILIAN_CODING_PLAN_API_KEY`. Por padrão, ela é armazenada no campo `env` do seu arquivo `settings.json`.

> [!warning]
>
> **Recomendação de Segurança**: Para maior segurança, recomenda-se mover a API key do `settings.json` para um arquivo `.env` separado e carregá-la como variável de ambiente. Por exemplo:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Em seguida, certifique-se de adicionar este arquivo ao seu `.gitignore` se estiver usando configurações em nível de projeto.

### Atualizações Automáticas

As configurações de modelo do Coding Plan são versionadas. Quando o Qwen Code detecta uma versão mais recente do template de modelo, você será solicitado a atualizar. Aceitar a atualização irá:

- Substituir as configurações de modelo existentes do Coding Plan pelas versões mais recentes
- Preservar quaisquer configurações de modelo personalizadas que você adicionou manualmente
- Alternar automaticamente para o primeiro modelo na configuração atualizada

O processo de atualização garante que você sempre tenha acesso às configurações e recursos mais recentes dos modelos sem intervenção manual.

### Configuração Manual (Avançado)

Se preferir configurar manualmente os modelos do Coding Plan, você pode adicioná-los ao seu `settings.json` como qualquer provedor compatível com OpenAI:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder via Alibaba Cloud Coding Plan",
        "envKey": "YOUR_CUSTOM_ENV_KEY",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
>
> Ao usar configuração manual:
>
> - Você pode usar qualquer nome de variável de ambiente para `envKey`
> - Você não precisa configurar `codingPlan.*`
> - **As atualizações automáticas não se aplicarão** aos modelos do Coding Plan configurados manualmente

> [!warning]
>
> Se você também usar a configuração automática do Coding Plan, as atualizações automáticas podem sobrescrever suas configurações manuais se elas usarem o mesmo `envKey` e `baseUrl` da configuração automática. Para evitar isso, certifique-se de que sua configuração manual use um `envKey` diferente, se possível.

## Camadas de Resolução e Atomicidade

Os valores efetivos de auth/modelo/credenciais são escolhidos por campo usando a seguinte precedência (o primeiro presente vence). Você pode combinar `--auth-type` com `--model` para apontar diretamente para uma entrada de provedor; essas flags de CLI são executadas antes de outras camadas.

| Layer (highest → lowest)   | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Programmatic overrides     | `/auth`                             | `/auth` input                                   | `/auth` input                                       | `/auth` input                                        | —                      | —                                 |
| Model provider selection   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI arguments              | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (or provider-specific equivalents) | `--openaiBaseUrl` (or provider-specific equivalents) | —                      | —                                 |
| Environment variables      | —                                   | Provider-specific mapping (e.g. `OPENAI_MODEL`) | Provider-specific mapping (e.g. `OPENAI_API_KEY`)   | Provider-specific mapping (e.g. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Settings (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Default / computed         | Falls back to `AuthType.QWEN_OAUTH` | Built-in default (OpenAI ⇒ `qwen3-coder-plus`)  | —                                                   | —                                                    | —                      | `Config.getProxy()` if configured |

\*Quando presentes, as flags de auth da CLI sobrescrevem as configurações. Caso contrário, `security.auth.selectedType` ou o padrão implícito determinam o tipo de autenticação. Qwen OAuth e OpenAI são os únicos tipos de autenticação expostos sem configuração adicional.

> [!warning]
>
> **Descontinuação de `security.auth.apiKey` e `security.auth.baseUrl`:** Configurar credenciais de API diretamente via `security.auth.apiKey` e `security.auth.baseUrl` no `settings.json` está descontinuado. Essas configurações eram usadas em versões históricas para credenciais inseridas pela UI, mas o fluxo de entrada de credenciais foi removido na versão 0.10.1. Esses campos serão completamente removidos em uma versão futura. **É altamente recomendável migrar para `modelProviders`** para todas as configurações de modelo e credenciais. Use `envKey` em `modelProviders` para referenciar variáveis de ambiente para gerenciamento seguro de credenciais, em vez de hardcodar credenciais em arquivos de configuração.

## Camadas de Configuração de Geração: A Camada Impermeável do Provedor

A resolução de configuração segue um modelo de camadas estrito com uma regra crucial: **a camada modelProvider é impermeável**.

### Como funciona

1. **Quando um modelo modelProvider É selecionado** (por exemplo, via comando `/model` escolhendo um modelo configurado pelo provedor):
   - Todo o `generationConfig` do provedor é aplicado **atomicamente**
   - **A camada do provedor é completamente impermeável** — camadas inferiores (CLI, env, settings) não participam da resolução do generationConfig
   - Todos os campos definidos em `modelProviders[].generationConfig` usam os valores do provedor
   - Todos os campos **não definidos** pelo provedor são definidos como `undefined` (não herdados das configurações)
   - Isso garante que as configurações do provedor atuem como um "pacote selado" completo e independente

2. **Quando NENHUM modelo modelProvider é selecionado** (por exemplo, usando `--model` com um ID de modelo bruto, ou usando CLI/env/settings diretamente):
   - A resolução passa para as camadas inferiores
   - Os campos são preenchidos a partir de CLI → env → settings → defaults
   - Isso cria um **Runtime Model** (veja a próxima seção)

### Precedência por campo para `generationConfig`

| Priority | Source                                        | Behavior                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Programmatic overrides                        | Alterações em tempo de execução `/model`, `/auth`                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **Camada impermeável** - substitui completamente todos os campos de generationConfig; camadas inferiores não participam |
| 3        | `settings.model.generationConfig`             | Usado apenas para **Runtime Models** (quando nenhum modelo de provedor é selecionado)                                    |
| 4        | Content-generator defaults                    | Padrões específicos do provedor (por exemplo, OpenAI vs Gemini) - apenas para Runtime Models                            |

### Tratamento atômico de campos

Os seguintes campos são tratados como objetos atômicos - os valores do provedor substituem completamente o objeto inteiro, sem mesclagem:

- `samplingParams` - Temperature, top_p, max_tokens, etc.
- `customHeaders` - Headers HTTP personalizados
- `extra_body` - Parâmetros extras do corpo da requisição

### Exemplo

```json
// User settings (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders configuration
{
  "modelProviders": {
    "openai": [{
      "id": "gpt-4o",
      "envKey": "OPENAI_API_KEY",
      "generationConfig": {
        "timeout": 60000,
        "samplingParams": { "temperature": 0.2 }
      }
    }]
  }
}
```

Quando `gpt-4o` é selecionado do modelProviders:

- `timeout` = 60000 (do provedor, sobrescreve as configurações)
- `samplingParams.temperature` = 0.2 (do provedor, substitui completamente o objeto das configurações)
- `samplingParams.max_tokens` = **undefined** (não definido no provedor, e a camada do provedor não herda das configurações — os campos são explicitamente definidos como undefined se não fornecidos)

Ao usar um modelo bruto via `--model gpt-4` (não do modelProviders, cria um Runtime Model):

- `timeout` = 30000 (das configurações)
- `samplingParams.temperature` = 0.5 (das configurações)
- `samplingParams.max_tokens` = 1000 (das configurações)

A estratégia de merge para o próprio `modelProviders` é REPLACE: todo o `modelProviders` das configurações do projeto sobrescreverá a seção correspondente nas configurações do usuário, em vez de mesclar os dois.

## Configuração de Reasoning / thinking

O campo opcional `reasoning` em `generationConfig` controla o quão agressivamente o modelo raciocina antes de responder. Os conversores Anthropic e Gemini sempre o respeitam. O pipeline compatível com OpenAI o respeita **a menos que** `generationConfig.samplingParams` esteja definido — veja a ressalva "Interação com `samplingParams`" abaixo.

```jsonc
{
  "modelProviders": {
    "openai": [
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "baseUrl": "https://api.deepseek.com/v1",
        "envKey": "DEEPSEEK_API_KEY",
        "generationConfig": {
          // The four-tier scale:
          //   'low'    | 'medium' — server-mapped to 'high' on DeepSeek
          //   'high'   — default reasoning intensity
          //   'max'    — DeepSeek-specific extra-strong tier
          // Or set `false` to disable reasoning entirely.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### Comportamento por provedor

| Protocol / provider                          | Wire shape                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | Flat `reasoning_effort: <effort>` body parameter                     | Quando `reasoning.effort` é definido na forma de configuração aninhada, ele é reescrito para `reasoning_effort` plano e `'low'`/`'medium'` são normalizados para `'high'`, `'xhigh'` para `'max'` — espelhando a [back-compat do lado do servidor](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) do DeepSeek. Substituições de nível superior `samplingParams.reasoning_effort` ou `extra_body.reasoning_effort` ignoram essa normalização e são enviadas literalmente. |
| **OpenAI** (other compatible servers)        | `reasoning: { effort, ... }` passed through verbatim                 | Defina via `samplingParams` (por exemplo, `samplingParams.reasoning_effort` para GPT-5/o-series) quando o provedor esperar um formato diferente.                                                                                                                                                                                                                                                                                                |
| **Anthropic** (real `api.anthropic.com`)     | `output_config: { effort }` plus the `effort-2025-11-24` beta header | O Anthropic real aceita apenas `'low'`/`'medium'`/`'high'`. `'max'` é **limitado a `'high'`** com uma linha `debugLogger.warn` (uma vez por gerador); se quiser esforço máximo, altere o baseURL para um endpoint compatível com DeepSeek que o suporte.                                                                                                                                                                                  |
| **Anthropic** (`api.deepseek.com/anthropic`) | Same `output_config: { effort }` + beta header                       | `'max'` é passado inalterado.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, outros → `THINKING_LEVEL_UNSPECIFIED` (Gemini não possui nível `MAX`).                                                                                                                                                                                                                                                                                                                    |

### `reasoning: false`

Definir `reasoning: false` (o booleano literal) desabilita explicitamente o thinking em todos os provedores — útil para consultas secundárias baratas que não se beneficiam do raciocínio. Isso também é respeitado no nível da requisição via `request.config.thinkingConfig.includeThoughts: false` para chamadas únicas (por exemplo, geração de sugestões).

Em um baseURL `api.deepseek.com`, o pipeline OpenAI emite o campo explícito `thinking: { type: 'disabled' }` que o DeepSeek V4+ exige — o padrão do lado do servidor é `'enabled'`, então simplesmente omitir `reasoning_effort` ainda incorreria em latência/custo de thinking. Backends DeepSeek self-hosted (sglang/vllm) e outros servidores compatíveis com OpenAI **não** recebem este campo; se precisar desabilitar o thinking neles, injete `thinking: { type: 'disabled' }` (ou qualquer controle que seu framework de inferência exponha) via `samplingParams`/`extra_body`.

### Interação com `samplingParams` (apenas compatível com OpenAI)

> [!warning]
>
> Quando `generationConfig.samplingParams` é definido em um provedor compatível com OpenAI, o pipeline envia essas chaves para a rede **literalmente** e ignora completamente a injeção separada de `reasoning`. Portanto, uma configuração como `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` descartará silenciosamente o campo reasoning nas requisições OpenAI/DeepSeek.
>
> Se você definir `samplingParams`, inclua o controle de reasoning diretamente nele — para DeepSeek é `samplingParams.reasoning_effort`, para GPT-5/o-series é `samplingParams.reasoning_effort` (seu campo plano) ou `samplingParams.reasoning` (o objeto aninhado). Para OpenRouter e outros provedores, o nome do campo varia; consulte a documentação do provedor.
>
> Os conversores Anthropic e Gemini não são afetados — eles sempre leem `reasoning.effort` diretamente, independentemente de `samplingParams`.

### `budget_tokens`

Você pode fixar um orçamento exato de tokens de thinking incluindo `budget_tokens` junto com `effort`:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Para Anthropic, isso se torna `thinking.budget_tokens`. Para OpenAI/DeepSeek, o campo é preservado, mas atualmente ignorado pelo servidor — `reasoning_effort` é o parâmetro que realmente importa.

## Provider Models vs Runtime Models

O Qwen Code distingue entre dois tipos de configurações de modelo:

### Provider Model

- Definido na configuração `modelProviders`
- Possui um pacote de configuração completo e atômico
- Quando selecionado, sua configuração é aplicada como uma camada impermeável
- Aparece na lista do comando `/model` com metadados completos (name, description, capabilities)
- Recomendado para fluxos de trabalho com múltiplos modelos e consistência em equipe

### Runtime Model

- Criado dinamicamente ao usar IDs de modelo brutos via CLI (`--model`), variáveis de ambiente ou configurações
- Não definido em `modelProviders`
- A configuração é construída "projetando" através das camadas de resolução (CLI → env → settings → defaults)
- Capturado automaticamente como um **RuntimeModelSnapshot** quando uma configuração completa é detectada
- Permite reutilização sem precisar inserir credenciais novamente

### Ciclo de vida do RuntimeModelSnapshot

Quando você configura um modelo sem usar `modelProviders`, o Qwen Code cria automaticamente um RuntimeModelSnapshot para preservar sua configuração:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

O snapshot:

- Captura o ID do modelo, API key, base URL e generation config
- Persiste entre sessões (armazenado em memória durante o runtime)
- Aparece na lista do comando `/model` como uma opção de runtime
- Pode ser alternado usando `/model $runtime|openai|my-custom-model`

### Principais diferenças

| Aspect                  | Provider Model                    | Runtime Model                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Configuration source    | `modelProviders` nas configurações      | Camadas CLI, env, settings                  |
| Configuration atomicity | Pacote completo e impermeável     | Em camadas, cada campo resolvido independentemente |
| Reusability             | Sempre disponível na lista `/model` | Capturado como snapshot, aparece se completo  |
| Team sharing            | Sim (via configurações commitadas)      | Não (local do usuário)                            |
| Credential storage      | Referência apenas via `envKey`       | Pode capturar a chave real no snapshot         |

### Quando usar cada um

- **Use Provider Models** quando: Você tem modelos padrão compartilhados em uma equipe, precisa de configurações consistentes ou quer evitar substituições acidentais
- **Use Runtime Models** quando: Testar rapidamente um novo modelo, usar credenciais temporárias ou trabalhar com endpoints ad-hoc

## Persistência de Seleção e Recomendações

> [!important]
>
> Defina `modelProviders` no `~/.qwen/settings.json` de escopo de usuário sempre que possível e evite persistir substituições de credenciais em qualquer escopo. Manter o catálogo de provedores nas configurações do usuário evita conflitos de merge/substituição entre os escopos de projeto e usuário e garante que as atualizações `/auth` e `/model` sempre gravem de volta em um escopo consistente.

- `/model` e `/auth` persistem `model.name` (quando aplicável) e `security.auth.selectedType` no escopo gravável mais próximo que já define `modelProviders`; caso contrário, eles fazem fallback para o escopo do usuário. Isso mantém os arquivos de workspace/usuário sincronizados com o catálogo de provedores ativo.
- Sem `modelProviders`, o resolvedor mistura as camadas CLI/env/settings, criando Runtime Models. Isso é aceitável para configurações de provedor único, mas trabalhoso ao alternar frequentemente. Defina catálogos de provedores sempre que fluxos de trabalho com múltiplos modelos forem comuns, para que as alternâncias permaneçam atômicas, com origem atribuída e depuráveis.