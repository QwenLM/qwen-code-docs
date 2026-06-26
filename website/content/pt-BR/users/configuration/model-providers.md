# Provedores de Modelo

O Qwen Code permite que você configure vários provedores de modelo através da configuração `modelProviders` no seu `settings.json`. Isso permite alternar entre diferentes modelos e provedores de IA usando o comando `/model`.

## Visão Geral

Use `modelProviders` para declarar modelos por tipo de autenticação que o seletor `/model` pode alternar. As chaves devem ser tipos de autenticação válidos (`openai`, `anthropic`, `gemini`, etc.). Cada tipo de autenticação mapeia para um objeto `ProviderConfig` com um campo `protocol` e um campo `models` (a matriz de definições de modelo). Cada entrada em `models` requer um `id`; `envKey` é **opcional e recomendado** (quando omitido, ele retorna à chave de ambiente padrão do tipo de autenticação, ex.: `OPENAI_API_KEY` para `openai`), com `name`, `description`, `baseUrl` e `generationConfig` opcionais. As credenciais nunca são persistidas nas configurações; o runtime as lê de `process.env[envKey]`. Os modelos do Qwen OAuth permanecem codificados e não podem ser substituídos.

> [!note]
>
> Apenas o comando `/model` expõe tipos de autenticação não padrão. Anthropic, Gemini, etc., devem ser definidos via `modelProviders`. O comando `/auth` lista três opções de alto nível: **Alibaba ModelStudio** (com Coding Plan, Token Plan e Standard API Key em seu submenu), **Third-party Providers** e **Custom Provider**. (O Qwen OAuth não é mais uma entrada de diálogo selecionável; seu nível gratuito foi descontinuado em 15/04/2026.)

> [!note]
>
> **Unicidade do modelo:** Modelos dentro do mesmo `authType` são identificados exclusivamente pela combinação de `id` + `baseUrl`. Isso significa que você pode definir o mesmo ID de modelo (ex.: `"gpt-4o"`) várias vezes sob um único `authType` desde que cada entrada tenha um `baseUrl` diferente — por exemplo, um apontando diretamente para OpenAI e outro para um endpoint proxy. Se duas entradas compartilharem o mesmo `id` e o mesmo `baseUrl` (ou ambas omitirem `baseUrl`), a primeira ocorrência vence e as duplicatas subsequentes são ignoradas com um aviso.

## Exemplos de Configuração por Tipo de Autenticação

Abaixo estão exemplos abrangentes de configuração para diferentes tipos de autenticação, mostrando os parâmetros disponíveis e suas combinações.

### Tipos de Autenticação Suportados

As chaves do objeto `modelProviders` devem ser valores `authType` válidos. Atualmente, os tipos de autenticação suportados são:

| Tipo de Autenticação | Descrição                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`             | APIs compatíveis com OpenAI (OpenAI, Azure OpenAI, servidores de inferência locais como vLLM/Ollama)                                                               |
| `anthropic`          | API Anthropic Claude                                                                                                                                              |
| `gemini`             | API Google Gemini                                                                                                                                                 |
| `qwen-oauth`         | Qwen OAuth (codificado, não pode ser substituído em `modelProviders`)                                                                                              |
| `vertex-ai`          | Google Vertex AI (usa o protocolo `gemini` e o SDK `@google/genai` no modo Vertex AI; selecioná-lo define `GOOGLE_GENAI_USE_VERTEXAI=true`)                        |

> [!warning]
> Se uma chave de tipo de autenticação desconhecida for usada (ex.: um erro de digitação como `"openai-custom"`), uma chave não vazia é aceita como está como seu próprio grupo de tipo de autenticação, mas ela não será mapeada para um protocolo conhecido — portanto, seus modelos não funcionarão como esperado e não se comportarão corretamente no seletor `/model`. Apenas chaves em branco (apenas espaços ou vazias) são ignoradas. Sempre use um dos valores de tipo de autenticação suportados listados acima.

### SDKs Usados para Requisições de API

O Qwen Code usa os seguintes SDKs oficiais para enviar requisições a cada provedor:

| Tipo de Autenticação | Pacote SDK                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `openai`             | [`openai`](https://www.npmjs.com/package/openai) - SDK oficial OpenAI Node.js                              |
| `anthropic`          | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK oficial Anthropic             |
| `gemini`             | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK oficial Google GenAI                  |
| `qwen-oauth`         | [`openai`](https://www.npmjs.com/package/openai) com provedor customizado (compatível com DashScope)       |

Isso significa que o `baseUrl` que você configurar deve ser compatível com o formato de API esperado pelo SDK correspondente. Por exemplo, ao usar o tipo de autenticação `openai`, o endpoint deve aceitar requisições no formato da API OpenAI.

### Provedores compatíveis com OpenAI (`openai`)

Este tipo de autenticação suporta não apenas a API oficial da OpenAI, mas também qualquer endpoint compatível com OpenAI, incluindo provedores de modelo agregados como OpenRouter e Requesty.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
        },
        {
          "id": "openai/gpt-4o-mini",
          "name": "GPT-4o Mini (via Requesty)",
          "envKey": "REQUESTY_API_KEY",
          "baseUrl": "https://router.requesty.ai/v1",
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
}
```

### Anthropic (`anthropic`)

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": {
      "protocol": "anthropic",
      "models": [
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
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": {
      "protocol": "gemini",
      "models": [
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
}
```

### Modelos Locais Auto-hospedados (via API compatível com OpenAI)

A maioria dos servidores de inferência locais (vLLM, Ollama, LM Studio, etc.) fornece um endpoint de API compatível com OpenAI. Configure-os usando o tipo de autenticação `openai` com um `baseUrl` local:

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
}
```

Para servidores locais que não exigem autenticação, você pode usar qualquer valor de placeholder para a chave da API:

```bash
# Para Ollama (sem autenticação necessária)
export OLLAMA_API_KEY="ollama"

# Para vLLM (se nenhuma autenticação estiver configurada)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> O parâmetro `extra_body` é **suportado apenas para provedores compatíveis com OpenAI** (`openai`, `qwen-oauth`). Ele é ignorado para provedores Anthropic e Gemini.

> [!note]
>
> **Sobre `envKey`**: O campo `envKey` especifica o **nome de uma variável de ambiente**, não o valor real da chave da API. Para a configuração funcionar, você precisa garantir que a variável de ambiente correspondente esteja definida com sua chave real da API. Existem duas formas de fazer isso:
>
> - **Opção 1: Usando um arquivo `.env`** (recomendado por segurança):
>   ```bash
>   # ~/.qwen/.env (ou raiz do projeto)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Certifique-se de adicionar `.env` ao seu `.gitignore` para evitar o commit acidental de segredos.
> - **Opção 2: Usando o campo `env` no `settings.json`** (conforme mostrado nos exemplos acima):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Cada exemplo de provedor inclui um campo `env` para ilustrar como a chave da API deve ser configurada.

## Alibaba Cloud Coding Plan

O Alibaba Cloud Coding Plan fornece um conjunto pré-configurado de modelos Qwen otimizados para tarefas de codificação. Este recurso está disponível para usuários com acesso à API do Alibaba Cloud Coding Plan e oferece uma experiência de configuração simplificada com atualizações automáticas de configuração do modelo.

### Visão Geral

Quando você se autentica com uma chave de API do Alibaba Cloud Coding Plan usando o comando `/auth`, o Qwen Code configura automaticamente os seguintes modelos:

| ID do Modelo           | Nome                  | Descrição                                        |
| ---------------------- | --------------------- | ------------------------------------------------ |
| `qwen3.5-plus`         | qwen3.5-plus          | Modelo avançado com thinking habilitado           |
| `qwen3.6-plus`         | qwen3.6-plus          | Modelo mais recente com thinking habilitado (apenas assinantes Pro) |
| `qwen3.7-plus`         | qwen3.7-plus          | Modelo avançado com thinking habilitado           |
| `qwen3-coder-plus`     | qwen3-coder-plus      | Otimizado para tarefas de codificação            |
| `qwen3-coder-next`     | qwen3-coder-next      | Modelo de codificação experimental               |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23  | Modelo max mais recente com thinking habilitado  |
| `glm-5`                | glm-5                 | Modelo GLM com thinking habilitado               |
| `glm-4.7`              | glm-4.7               | Modelo GLM com thinking habilitado               |
| `kimi-k2.5`            | kimi-k2.5             | Modelo Kimi com suporte a thinking e visão/vídeo |
| `MiniMax-M2.5`         | MiniMax-M2.5          | Modelo MiniMax com thinking habilitado            |

### Configuração

1. Obtenha uma chave de API do Alibaba Cloud Coding Plan:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **Internacional**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Execute o comando `/auth` no Qwen Code
3. Selecione **Alibaba ModelStudio**, depois escolha **Coding Plan** no submenu
4. Selecione sua região
5. Digite sua chave de API quando solicitado

Os modelos serão configurados automaticamente e adicionados ao seletor `/model`.

### Regiões

O Alibaba Cloud Coding Plan suporta duas regiões:

| Região                | Endpoint                                        | Descrição                      |
| --------------------- | ----------------------------------------------- | ------------------------------ |
| China                 | `https://coding.dashscope.aliyuncs.com/v1`      | Endpoint da China continental  |
| Global/Internacional  | `https://coding-intl.dashscope.aliyuncs.com/v1` | Endpoint internacional         |

A região é selecionada durante a autenticação e armazenada no `settings.json` sob a configuração `modelProviders`. Para trocar de região, execute novamente o comando `/auth` e selecione uma região diferente.

### Armazenamento da Chave da API

Quando você configura o Coding Plan através do comando `/auth`, a chave da API é armazenada usando o nome de variável de ambiente reservado `BAILIAN_CODING_PLAN_API_KEY`. Por padrão, ela é armazenada no campo `env` do seu arquivo `settings.json`.

> [!warning]
>
> **Recomendação de Segurança**: Para maior segurança, é recomendado mover a chave da API do `settings.json` para um arquivo `.env` separado e carregá-la como uma variável de ambiente. Por exemplo:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=sua-chave-aqui
> ```
>
> Em seguida, certifique-se de que este arquivo seja adicionado ao seu `.gitignore` se você estiver usando configurações em nível de projeto.

### Atualizações Automáticas

As configurações de modelo do Coding Plan são versionadas. Quando o Qwen Code detecta uma versão mais recente do modelo de template, você será solicitado a atualizar. Aceitar a atualização irá:

- Substituir as configurações existentes dos modelos do Coding Plan pelas versões mais recentes
- Preservar quaisquer configurações de modelo personalizadas que você tenha adicionado manualmente
- Alternar automaticamente para o primeiro modelo na configuração atualizada

O processo de atualização garante que você sempre tenha acesso às configurações e recursos mais recentes do modelo sem intervenção manual.

### Configuração Manual (Avançado)

Se você preferir configurar manualmente os modelos do Coding Plan, pode adicioná-los ao seu `settings.json` como qualquer provedor compatível com OpenAI:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
}
```

> [!note]
>
> Ao usar configuração manual:
>
> - Você pode usar qualquer nome de variável de ambiente para `envKey`
> - Você não precisa configurar `codingPlan.*`
> - **Atualizações automáticas não se aplicarão** a modelos do Coding Plan configurados manualmente

> [!warning]
>
> Se você também usa a configuração automática do Coding Plan, as atualizações automáticas podem sobrescrever suas configurações manuais se elas usarem o mesmo `envKey` e `baseUrl` da configuração automática. Para evitar isso, certifique-se de que sua configuração manual use um `envKey` diferente, se possível.

## Camadas de Resolução e Atomicidade

Os valores efetivos de auth/model/credential são escolhidos por campo usando a seguinte precedência (a primeira ocorrência vence). Você pode combinar `--auth-type` com `--model` para apontar diretamente para uma entrada de provedor; essas flags de CLI são executadas antes das outras camadas.

| Camada (mais alta → mais baixa) | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| ------------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Substituições programáticas     | `/auth`                             | Entrada `/auth`                                 | Entrada `/auth`                                       | Entrada `/auth`                                        | —                      | —                                 |
| Seleção de provedor de modelo   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| Argumentos de CLI               | `--auth-type`                       | `--model`                                       | `--openai-api-key` (ou equivalentes específicos do provedor) | `--openai-base-url` (ou equivalentes específicos do provedor) | —                      | —                                 |
| Variáveis de ambiente           | —                                   | Mapeamento específico do provedor (ex.: `OPENAI_MODEL`) | Mapeamento específico do provedor (ex.: `OPENAI_API_KEY`) | Mapeamento específico do provedor (ex.: `OPENAI_BASE_URL`) | —                      | —                                 |
| Configurações (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| Padrão / calculado              | Retorna para `AuthType.QWEN_OAUTH` | Padrão interno (OpenAI ⇒ `qwen3.5-plus`)        | —                                                     | —                                                      | —                      | `Config.getProxy()` se configurado |
Quando presentes, as flags de autenticação da CLI substituem as configurações. Caso contrário, `security.auth.selectedType` ou o padrão implícito determinam o tipo de autenticação. Qwen OAuth e OpenAI são os únicos tipos de autenticação que aparecem sem configuração extra.

> [!warning]
>
> **Descontinuação de `security.auth.apiKey` e `security.auth.baseUrl`:** Configurar diretamente credenciais de API via `security.auth.apiKey` e `security.auth.baseUrl` em `settings.json` está obsoleto. Essas configurações eram usadas em versões anteriores para credenciais inseridas através da interface, mas o fluxo de entrada de credenciais foi removido na versão 0.10.1. Estes campos serão totalmente removidos em uma versão futura. **É altamente recomendável migrar para `modelProviders`** para todas as configurações de modelo e credenciais. Use `envKey` em `modelProviders` para referenciar variáveis de ambiente para gerenciamento seguro de credenciais, em vez de codificar credenciais em arquivos de configuração.

## Camada de Configuração de Geração: A Camada Impermeável do Provider

A resolução de configuração segue um modelo de camadas estrito com uma regra crucial: **a camada modelProvider é impermeável**.

### Como funciona

1. **Quando um modelo modelProvider ESTÁ selecionado** (ex.: via comando `/model` escolhendo um modelo configurado pelo provider):
   - Todo o `generationConfig` do provider é aplicado **atomicamente**
   - **A camada do provider é completamente impermeável** — as camadas inferiores (CLI, env, settings) não participam da resolução do generationConfig
   - Todos os campos definidos em `modelProviders[].generationConfig` usam os valores do provider
   - Todos os campos **não definidos** pelo provider são definidos como `undefined` (não herdados das configurações)
   - Isso garante que as configurações do provider atuem como um "pacote selado" completo e autocontido

   Se um modelo está listado em `modelProviders`, coloque todas as configurações de geração específicas do modelo na entrada correspondente do provider. Os valores de `model.generationConfig` no nível superior, incluindo `contextWindowSize`, `modalities`, `customHeaders` e `extra_body`, são ignorados para modelos de provider. Configure esses campos em `modelProviders[authType][].generationConfig` para que sejam aplicados.

2. **Quando nenhum modelo modelProvider está selecionado** (ex.: usando `--model` com um ID de modelo bruto, ou usando CLI/env/settings diretamente):
   - A resolução passa para as camadas inferiores
   - Os campos são preenchidos a partir de CLI → env → settings → defaults
   - Isso cria um **Runtime Model** (veja a próxima seção)

### Precedência por campo para `generationConfig`

| Prioridade | Origem                                        | Comportamento                                                                                                 |
| ---------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1          | Sobrescritas programáticas                    | Mudanças em tempo de execução via `/model`, `/auth`                                                             |
| 2          | `modelProviders[authType][].generationConfig` | **Camada impermeável** - substitui completamente todos os campos de generationConfig; camadas inferiores não participam |
| 3          | `settings.model.generationConfig`             | Usado apenas para **Runtime Models** (quando nenhum modelo de provider está selecionado)                        |
| 4          | Padrões do gerador de conteúdo                | Padrões específicos do provider (ex.: OpenAI vs Gemini) - apenas para Runtime Models                            |

### Tratamento atômico de campos

Os seguintes campos são tratados como objetos atômicos - os valores do provider substituem completamente o objeto inteiro, não ocorre mesclagem:

- `samplingParams`
- `customHeaders`
- `extra_body`

### Exemplo

```jsonc
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
    "openai": {
      "protocol": "openai",
      "models": [{
        "id": "gpt-4o",
        "envKey": "OPENAI_API_KEY",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": { "temperature": 0.2 }
        }
      }]
    }
  }
}
```

Quando `gpt-4o` é selecionado a partir de modelProviders:

- `timeout` = 60000 (do provider, substitui as configurações)
- `samplingParams.temperature` = 0.2 (do provider, substitui completamente o objeto das configurações)
- `samplingParams.max_tokens` = **undefined** (não definido no provider, e a camada do provider não herda das configurações — os campos são explicitamente definidos como undefined se não forem fornecidos)

Ao usar um modelo bruto via `--model gpt-4` (não de modelProviders, cria um Runtime Model):

- `timeout` = 30000 (das configurações)
- `samplingParams.temperature` = 0.5 (das configurações)
- `samplingParams.max_tokens` = 1000 (das configurações)

A estratégia de mesclagem para o próprio `modelProviders` é REPLACE: todo o `modelProviders` das configurações do projeto substituirá a seção correspondente nas configurações do usuário, em vez de mesclar os dois.

## Configuração de raciocínio / pensamento

O campo opcional `reasoning` em `generationConfig` controla o quanto o modelo raciocina antes de responder. Os conversores Anthropic e Gemini sempre o respeitam. O pipeline compatível com OpenAI o respeita **a menos que** `generationConfig.samplingParams` esteja definido — veja a ressalva "Interação com `samplingParams`" abaixo.

```jsonc
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
  },
}
```

### Comportamento por provider

| Protocolo / provider                          | Forma na requisição                                                           | Observações                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | Parâmetro simples no corpo `reasoning_effort: <effort>`                     | Quando `reasoning.effort` está definido na forma de configuração aninhada, ele é reescrito para o parâmetro simples `reasoning_effort` e `'low'`/`'medium'` são normalizados para `'high'`, `'xhigh'` para `'max'` — espelhando a [compatibilidade retroativa do lado do servidor](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) do DeepSeek. Sobrescritas no nível superior como `samplingParams.reasoning_effort` ou `extra_body.reasoning_effort` ignoram essa normalização e enviam o valor literalmente. |
| **OpenAI** (outros servidores compatíveis)        | `reasoning: { effort, ... }` passado literalmente                 | Defina via `samplingParams` (ex.: `samplingParams.reasoning_effort` para séries GPT-5/o) quando o provider esperar uma forma diferente.                                                                                                                                                                                                                                                                                                |
| **Anthropic** (`api.anthropic.com` real)     | `output_config: { effort }` mais o cabeçalho beta `effort-2025-11-24` | O Anthropic real aceita apenas `'low'`/`'medium'`/`'high'`. `'max'` é **limitado a `'high'`** com uma linha `debugLogger.warn` (uma vez por gerador); se quiser esforço máximo, altere a baseURL para um endpoint compatível com DeepSeek que suporte isso.                                                                                                                                                                                  |
| **Anthropic** (`api.deepseek.com/anthropic`) | Mesmo `output_config: { effort }` + cabeçalho beta                       | `'max'` é passado inalterado.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, outros → `THINKING_LEVEL_UNSPECIFIED` (Gemini não possui nível `MAX`).                                                                                                                                                                                                                                                                                                                    |

### `reasoning: false`

Definir `reasoning: false` (o booleano literal) desabilita explicitamente o pensamento em todos os providers — útil para consultas secundárias baratas que não se beneficiam de raciocínio. Isso também é respeitado no nível da requisição via `request.config.thinkingConfig.includeThoughts: false` para chamadas pontuais (ex.: geração de sugestões).

Em uma baseURL `api.deepseek.com`, o pipeline OpenAI emite o campo explícito `thinking: { type: 'disabled' }` que o DeepSeek V4+ exige — o padrão do lado do servidor é `'enabled'`, então simplesmente omitir `reasoning_effort` ainda incorreria em latência/custo de pensamento. Backends DeepSeek auto-hospedados (sglang/vllm) e outros servidores compatíveis com OpenAI **não** recebem esse campo; se você precisar desabilitar o pensamento neles, injete `thinking: { type: 'disabled' }` (ou o parâmetro que seu framework de inferência expuser) via `samplingParams`/`extra_body`.

### Interação com `samplingParams` (apenas compatível com OpenAI)

> [!warning]
>
> Quando `generationConfig.samplingParams` está definido em um provider compatível com OpenAI, o pipeline envia essas chaves para a requisição **literalmente** e ignora completamente a injeção separada de `reasoning`. Portanto, uma configuração como `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` descartará silenciosamente o campo reasoning em requisições OpenAI/DeepSeek.
>
> Se você definir `samplingParams`, inclua o parâmetro de raciocínio diretamente dentro dele — para DeepSeek isso é `samplingParams.reasoning_effort`, para as séries GPT-5/o é `samplingParams.reasoning_effort` (campo simples) ou `samplingParams.reasoning` (objeto aninhado). Para OpenRouter e outros providers, o nome do campo varia; consulte a documentação do provider.
>
> Os conversores Anthropic e Gemini não são afetados — eles sempre leem `reasoning.effort` diretamente, independentemente de `samplingParams`.

### `budget_tokens`

Você pode fixar um orçamento exato de tokens de pensamento incluindo `budget_tokens` junto com `effort`:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Para Anthropic isso se torna `thinking.budget_tokens`. Para OpenAI/DeepSeek o campo é preservado, mas atualmente ignorado pelo servidor — `reasoning_effort` é o parâmetro principal.

## Modelos Provider vs Runtime Models

O Qwen Code distingue entre dois tipos de configurações de modelo:

### Provider Model

- Definido na configuração `modelProviders`
- Possui um pacote de configuração completo e atômico
- Quando selecionado, sua configuração é aplicada como uma camada impermeável
- Aparece na lista do comando `/model` com metadados completos (nome, descrição, capacidades)
- Recomendado para fluxos de trabalho multi-modelo e consistência em equipe

### Runtime Model

- Criado dinamicamente ao usar IDs de modelo brutos via CLI (`--model`), variáveis de ambiente ou configurações
- Não definido em `modelProviders`
- A configuração é construída "projetando" através das camadas de resolução (CLI → env → settings → defaults)
- Capturado automaticamente como um **RuntimeModelSnapshot** quando uma configuração completa é detectada
- Permite reutilização sem reinserir credenciais

### Ciclo de vida do RuntimeModelSnapshot

Quando você configura um modelo sem usar `modelProviders`, o Qwen Code cria automaticamente um RuntimeModelSnapshot para preservar sua configuração:

```bash
# Isso cria um RuntimeModelSnapshot com ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

O snapshot:

- Captura o ID do modelo, chave da API, URL base e configuração de geração
- Persiste entre sessões (armazenado em memória durante a execução)
- Aparece na lista do comando `/model` como uma opção de runtime
- Pode ser ativado usando `/model $runtime|openai|my-custom-model`

### Principais diferenças

| Aspecto                  | Provider Model                    | Runtime Model                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Fonte de configuração    | `modelProviders` nas configurações      | Camadas CLI, env, settings                  |
| Atomicidade da configuração | Pacote completo e impermeável     | Em camadas, cada campo resolvido independentemente |
| Reutilização             | Sempre disponível na lista `/model` | Capturado como snapshot, aparece se completo  |
| Compartilhamento em equipe  | Sim (via configurações commitadas)      | Não (local ao usuário)                            |
| Armazenamento de credenciais      | Referência via `envKey` apenas         | Pode capturar a chave real no snapshot         |

### Quando usar cada um

- **Use Provider Models** quando: Você tem modelos padrão compartilhados em uma equipe, precisa de configurações consistentes ou deseja evitar sobrescritas acidentais
- **Use Runtime Models** quando: Testar rapidamente um novo modelo, usar credenciais temporárias ou trabalhar com endpoints ad-hoc

## Persistência de Seleção e Recomendações

> [!important]
>
> Defina `modelProviders` no escopo do usuário `~/.qwen/settings.json` sempre que possível e evite persistir sobrescritas de credenciais em qualquer escopo. Manter o catálogo de providers nas configurações do usuário previne conflitos de mesclagem/substituição entre os escopos de projeto e usuário e garante que as atualizações via `/auth` e `/model` sempre escrevam de volta para um escopo consistente.

- `/model` e `/auth` persistem `model.name` (quando aplicável) e `security.auth.selectedType` no escopo gravável mais próximo que já define `modelProviders`; caso contrário, eles retornam ao escopo do usuário. Isso mantém os arquivos do workspace/usuário sincronizados com o catálogo ativo de providers.
- Sem `modelProviders`, o resolvedor mistura camadas CLI/env/settings, criando Runtime Models. Isso é aceitável para configurações de um único provider, mas incômodo quando há trocas frequentes. Defina catálogos de providers sempre que fluxos de trabalho multi-modelo forem comuns, para que as trocas permaneçam atômicas, atribuídas à fonte e depuráveis.