# Provedores de Modelo

O Qwen Code permite configurar vários provedores de modelo por meio da configuração `modelProviders` no seu `settings.json`. Isso possibilita alternar entre diferentes modelos e provedores de IA usando o comando `/model`.

## Visão Geral

Use `modelProviders` para declarar modelos por tipo de autenticação que o seletor `/model` pode alternar. As chaves devem ser tipos de autenticação válidos (`openai`, `anthropic`, `gemini`, etc.). Cada tipo de autenticação mapeia para um objeto `ProviderConfig` com um campo `protocol` e um campo `models` (a matriz de definições de modelo). Cada entrada em `models` requer um `id`; `envKey` é **opcional e recomendado** (quando omitido, ele cai para a chave de ambiente padrão do tipo de autenticação, ex: `OPENAI_API_KEY` para `openai`), com `name`, `description`, `baseUrl` e `generationConfig` opcionais. As credenciais nunca são persistidas nas configurações; o runtime as lê de `process.env[envKey]`. Os modelos Qwen OAuth permanecem codificados e não podem ser substituídos.

> [!note]
>
> Apenas o comando `/model` expõe tipos de autenticação não padrão. Anthropic, Gemini, etc., devem ser definidos via `modelProviders`. O comando `/auth` lista três opções de alto nível: **Alibaba ModelStudio** (com Coding Plan, Token Plan e Standard API Key no seu submenu), **Provedores Terceiros** e **Provedor Personalizado**. (O Qwen OAuth não é mais uma entrada selecionável no diálogo; seu nível gratuito foi descontinuado em 2026-04-15.)

> [!note]
>
> **Unicidade do modelo:** Modelos dentro do mesmo `authType` são identificados unicamente pela combinação de `id` + `baseUrl`. Isso significa que você pode definir o mesmo ID de modelo (ex: `"gpt-4o"`) várias vezes sob um único `authType` desde que cada entrada tenha um `baseUrl` diferente — por exemplo, um apontando diretamente para OpenAI e outro para um endpoint proxy. Se duas entradas compartilham tanto o mesmo `id` quanto o mesmo `baseUrl` (ou ambas omitem `baseUrl`), a primeira ocorrência vence e duplicatas subsequentes são ignoradas com um aviso.

## Exemplos de Configuração por Tipo de Autenticação

Abaixo estão exemplos de configuração abrangentes para diferentes tipos de autenticação, mostrando os parâmetros disponíveis e suas combinações.

### Tipos de Autenticação Suportados

As chaves do objeto `modelProviders` devem ser valores `authType` válidos. Os tipos de autenticação atualmente suportados são:

| Tipo de Autenticação | Descrição                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`             | APIs compatíveis com OpenAI (OpenAI, Azure OpenAI, servidores de inferência locais como vLLM/Ollama)                                           |
| `anthropic`          | API Anthropic Claude                                                                                                                          |
| `gemini`             | API Google Gemini                                                                                                                             |
| `qwen-oauth`         | Qwen OAuth (codificado, não pode ser substituído em `modelProviders`)                                                                         |
| `vertex-ai`          | Google Vertex AI (usa o protocolo `gemini` e o SDK `@google/genai` no modo Vertex AI; selecioná-lo define `GOOGLE_GENAI_USE_VERTEXAI=true`)    |

> [!warning]
> Se uma chave de tipo de autenticação desconhecida for usada (ex: um erro de digitação como `"openai-custom"`), uma chave não vazia é aceita como está como seu próprio grupo de tipo de autenticação, mas não será mapeada para um protocolo conhecido — portanto, seus modelos não funcionarão como pretendido e não se comportarão corretamente no seletor `/model`. Apenas chaves vazias (apenas espaços ou em branco) são ignoradas. Sempre use um dos valores de tipo de autenticação suportados listados acima.

### SDKs Usados para Requisições de API

O Qwen Code usa os seguintes SDKs oficiais para enviar requisições para cada provedor:

| Tipo de Autenticação | Pacote SDK                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `openai`             | [`openai`](https://www.npmjs.com/package/openai) - SDK oficial da OpenAI para Node.js              |
| `anthropic`          | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK oficial da Anthropic   |
| `gemini`             | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK oficial da Google GenAI        |
| `qwen-oauth`         | [`openai`](https://www.npmjs.com/package/openai) com provedor personalizado (compatível com DashScope) |

Isso significa que o `baseUrl` que você configurar deve ser compatível com o formato de API esperado pelo SDK correspondente. Por exemplo, ao usar o tipo de autenticação `openai`, o endpoint deve aceitar requisições no formato da API OpenAI.

### Provedores compatíveis com OpenAI (`openai`)

Este tipo de autenticação suporta não apenas a API oficial da OpenAI, mas também qualquer endpoint compatível com OpenAI, incluindo provedores agregados de modelos como OpenRouter e Requesty.
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

### Modelos Locais Auto-Hospedados (via API compatível com OpenAI)

A maioria dos servidores de inferência locais (vLLM, Ollama, LM Studio, etc.) fornecem um endpoint de API compatível com OpenAI. Configure-os usando o tipo de autenticação `openai` com um `baseUrl` local:

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
Para servidores locais que não exigem autenticação, você pode usar qualquer valor de espaço reservado para a chave da API:

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
> **Sobre `envKey`**: O campo `envKey` especifica o **nome de uma variável de ambiente**, não o valor real da chave da API. Para que a configuração funcione, você precisa garantir que a variável de ambiente correspondente esteja definida com sua chave real. Há duas maneiras de fazer isso:
>
> - **Opção 1: Usando um arquivo `.env`** (recomendado por segurança):
>   ```bash
>   # ~/.qwen/.env (ou raiz do projeto)
>   OPENAI_API_KEY=sk-sua-chave-real-aqui
>   ```
>   Certifique-se de adicionar `.env` ao seu `.gitignore` para evitar o vazamento acidental de segredos.
> - **Opção 2: Usando o campo `env` no `settings.json`** (conforme mostrado nos exemplos acima):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-sua-chave-real-aqui"
>     }
>   }
>   ```
>
> Cada exemplo de provedor inclui um campo `env` para ilustrar como a chave da API deve ser configurada.

## Plano de Codificação do Alibaba Cloud

O Plano de Codificação do Alibaba Cloud (Alibaba Cloud Coding Plan) fornece um conjunto pré-configurado de modelos Qwen otimizados para tarefas de codificação. Este recurso está disponível para usuários com acesso à API do Plano de Codificação do Alibaba Cloud e oferece uma experiência de configuração simplificada com atualizações automáticas de configuração do modelo.

### Visão Geral

Quando você se autentica com uma chave de API do Plano de Codificação do Alibaba Cloud usando o comando `/auth`, o Qwen Code configura automaticamente os seguintes modelos:

| ID do Modelo         | Nome                 | Descrição                                                 |
| -------------------- | -------------------- | --------------------------------------------------------- |
| `qwen3.5-plus`       | qwen3.5-plus         | Modelo avançado com pensamento habilitado                 |
| `qwen3.6-plus`       | qwen3.6-plus         | Modelo mais recente com pensamento habilitado (apenas assinantes Pro) |
| `qwen3.7-plus`       | qwen3.7-plus         | Modelo avançado com pensamento habilitado                 |
| `qwen3-coder-plus`   | qwen3-coder-plus     | Otimizado para tarefas de codificação                     |
| `qwen3-coder-next`   | qwen3-coder-next     | Modelo de codificação experimental                        |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Modelo max mais recente com pensamento habilitado         |
| `glm-5`              | glm-5                | Modelo GLM com pensamento habilitado                      |
| `glm-4.7`            | glm-4.7              | Modelo GLM com pensamento habilitado                      |
| `kimi-k2.5`          | kimi-k2.5            | Modelo Kimi com suporte a pensamento e visão/vídeo        |
| `MiniMax-M2.5`       | MiniMax-M2.5         | Modelo MiniMax com pensamento habilitado                  |

### Configuração

1. Obtenha uma chave de API do Plano de Codificação do Alibaba Cloud:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **Internacional**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Execute o comando `/auth` no Qwen Code
3. Selecione **Alibaba ModelStudio**, depois escolha **Coding Plan** no submenu
4. Selecione sua região
5. Digite sua chave de API quando solicitado

Os modelos serão configurados automaticamente e adicionados ao seu seletor `/model`.

### Regiões

O Plano de Codificação do Alibaba Cloud suporta duas regiões:

| Região               | Endpoint                                        | Descrição                    |
| -------------------- | ----------------------------------------------- | ---------------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpoint da China continental|
| Global/Internacional | `https://coding-intl.dashscope.aliyuncs.com/v1` | Endpoint internacional       |

A região é selecionada durante a autenticação e armazenada em `settings.json` na configuração `modelProviders`. Para trocar de região, execute novamente o comando `/auth` e selecione outra região.

### Armazenamento da Chave da API

Quando você configura o Coding Plan através do comando `/auth`, a chave da API é armazenada usando o nome de variável de ambiente reservado `BAILIAN_CODING_PLAN_API_KEY`. Por padrão, ela é armazenada no campo `env` do seu arquivo `settings.json`.

> [!warning]
>
> **Recomendação de segurança**: Para maior segurança, recomenda-se mover a chave da API do `settings.json` para um arquivo `.env` separado e carregá-la como variável de ambiente. Por exemplo:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=sua-chave-de-api-aqui
> ```
>
> Em seguida, certifique-se de que este arquivo seja adicionado ao seu `.gitignore` se você estiver usando configurações em nível de projeto.

### Atualizações Automáticas

As configurações de modelo do Coding Plan são versionadas. Quando o Qwen Code detecta uma versão mais recente do template do modelo, você será solicitado a atualizar. Aceitar a atualização irá:
- Substitua as configurações existentes do modelo Coding Plan pelas versões mais recentes
- Preserve quaisquer configurações de modelo personalizadas que você adicionou manualmente
- Alterne automaticamente para o primeiro modelo na configuração atualizada

O processo de atualização garante que você sempre tenha acesso às configurações e funcionalidades mais recentes do modelo sem intervenção manual.

### Configuração Manual (Avançada)

Se preferir configurar manualmente os modelos do Coding Plan, você pode adicioná-los ao seu `settings.json` como qualquer provedor compatível com OpenAI:

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
> - **Atualizações automáticas não serão aplicadas** a modelos do Coding Plan configurados manualmente

> [!warning]
>
> Se você também usa a configuração automática do Coding Plan, as atualizações automáticas podem sobrescrever suas configurações manuais se elas usarem o mesmo `envKey` e `baseUrl` da configuração automática. Para evitar isso, certifique-se de que sua configuração manual use um `envKey` diferente, se possível.

## Camadas de Resolução e Atomicidade

Os valores efetivos de auth/model/credential são escolhidos por campo usando a seguinte precedência (o primeiro presente vence). Você pode combinar `--auth-type` com `--model` para apontar diretamente para uma entrada de provedor; essas flags de CLI são processadas antes das outras camadas.

| Camada (maior → menor prioridade) | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| --------------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Sobrescritas programáticas        | `/auth`                             | Entrada `/auth`                                 | Entrada `/auth`                                       | Entrada `/auth`                                        | —                      | —                                 |
| Seleção do provedor de modelo     | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| Argumentos de CLI                 | `--auth-type`                       | `--model`                                       | `--openai-api-key` (ou equivalentes específicos do provedor) | `--openai-base-url` (ou equivalentes específicos do provedor) | —                      | —                                 |
| Variáveis de ambiente             | —                                   | Mapeamento específico do provedor (ex.: `OPENAI_MODEL`) | Mapeamento específico do provedor (ex.: `OPENAI_API_KEY`) | Mapeamento específico do provedor (ex.: `OPENAI_BASE_URL`) | —                      | —                                 |
| Configurações (`settings.json`)   | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| Padrão / calculado                | Recai para `AuthType.QWEN_OAUTH`    | Padrão interno (OpenAI ⇒ `qwen3.5-plus`)        | —                                                     | —                                                      | —                      | `Config.getProxy()` se configurado |

\*Quando presentes, as flags de auth da CLI sobrescrevem as configurações. Caso contrário, `security.auth.selectedType` ou o padrão implícito determinam o tipo de autenticação. Qwen OAuth e OpenAI são os únicos tipos de autenticação expostos sem configuração adicional.

> [!warning]
>
> **Descontinuação de `security.auth.apiKey` e `security.auth.baseUrl`:** Configurar diretamente credenciais de API via `security.auth.apiKey` e `security.auth.baseUrl` no `settings.json` está obsoleto. Essas configurações eram usadas em versões anteriores para credenciais inseridas pela interface do usuário, mas o fluxo de entrada de credenciais foi removido na versão 0.10.1. Esses campos serão completamente removidos em uma versão futura. **É fortemente recomendado migrar para `modelProviders`** para todas as configurações de modelo e credenciais. Use `envKey` em `modelProviders` para referenciar variáveis de ambiente para gerenciamento seguro de credenciais, em vez de codificar credenciais diretamente em arquivos de configuração.

## Camadas de Configuração de Geração: A Camada de Provedor Impermeável
A resolução de configuração segue um modelo de camadas estrito com uma regra crucial: **a camada modelProvider é impermeável**.

### Como funciona

1. **Quando um modelo modelProvider ESTÁ selecionado** (por exemplo, via comando `/model` escolhendo um modelo configurado pelo provedor):
   - O `generationConfig` inteiro do provedor é aplicado **atomicamente**
   - **A camada do provedor é completamente impermeável** — camadas inferiores (CLI, env, configurações) não participam da resolução do generationConfig
   - Todos os campos definidos em `modelProviders[].generationConfig` usam os valores do provedor
   - Todos os campos **não definidos** pelo provedor são definidos como `undefined` (não herdados das configurações)
   - Isso garante que as configurações do provedor atuem como um "pacote selado" completo e autônomo

   Se um modelo está listado em `modelProviders`, coloque todas as configurações de geração
   específicas desse modelo na entrada do provedor correspondente. Os valores
   de `model.generationConfig` do nível superior, incluindo `contextWindowSize`,
   `modalities`, `customHeaders` e `extra_body`, são ignorados para modelos
   do provedor. Configure esses campos em
   `modelProviders[authType][].generationConfig` para que sejam aplicados.

2. **Quando nenhum modelo modelProvider está selecionado** (por exemplo, usando `--model` com um ID de modelo bruto, ou usando CLI/env/configurações diretamente):
   - A resolução passa para as camadas inferiores
   - Os campos são preenchidos a partir de CLI → env → configurações → padrões
   - Isso cria um **Runtime Model** (veja a próxima seção)

### Precedência por campo para `generationConfig`

| Prioridade | Fonte                                       | Comportamento                                                                                                 |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1          | Sobrescritas programáticas                  | Mudanças em tempo de execução via `/model`, `/auth`                                                           |
| 2          | `modelProviders[authType][].generationConfig` | **Camada impermeável** - substitui completamente todos os campos do generationConfig; camadas inferiores não participam |
| 3          | `settings.model.generationConfig`           | Usado apenas para **Runtime Models** (quando nenhum modelo do provedor está selecionado)                      |
| 4          | Padrões do gerador de conteúdo              | Padrões específicos do provedor (ex.: OpenAI vs Gemini) - apenas para Runtime Models                           |

### Tratamento atômico de campos

Os campos a seguir são tratados como objetos atômicos - os valores do provedor substituem completamente o objeto inteiro, sem mesclagem:

- `samplingParams` - Temperature, top_p, max_tokens, etc.
- `customHeaders` - Cabeçalhos HTTP personalizados
- `extra_body` - Parâmetros extras do corpo da requisição

### Exemplo

```jsonc
// Configurações do usuário (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// Configuração dos modelProviders
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

Quando `gpt-4o` é selecionado dos modelProviders:

- `timeout` = 60000 (do provedor, sobrescreve as configurações)
- `samplingParams.temperature` = 0.2 (do provedor, substitui completamente o objeto das configurações)
- `samplingParams.max_tokens` = **undefined** (não definido no provedor, e a camada do provedor não herda das configurações — os campos são definidos explicitamente como undefined se não fornecidos)

Ao usar um modelo bruto via `--model gpt-4` (não de modelProviders, cria um Runtime Model):

- `timeout` = 30000 (das configurações)
- `samplingParams.temperature` = 0.5 (das configurações)
- `samplingParams.max_tokens` = 1000 (das configurações)

A estratégia de mesclagem para `modelProviders` em si é SUBSTITUIR: o `modelProviders` inteiro das configurações do projeto substituirá a seção correspondente nas configurações do usuário, em vez de mesclar as duas.

## Configuração de raciocínio / pensamento

O campo opcional `reasoning` em `generationConfig` controla a intensidade com que o modelo raciocina antes de responder. Os conversores Anthropic e Gemini sempre o respeitam. O pipeline compatível com OpenAI o respeita **a menos** que `generationConfig.samplingParams` esteja definido — veja a ressalva "Interação com `samplingParams`" abaixo.

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
            // A escala de quatro níveis:
            //   'low'    | 'medium' — mapeado pelo servidor para 'high' no DeepSeek
            //   'high'   — intensidade de raciocínio padrão
            //   'max'    — nível extra-forte específico do DeepSeek
            // Ou defina `false` para desabilitar o raciocínio completamente.
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```
### Comportamento por provedor

| Protocolo / provedor                        | Formato na requisição                                                           | Observações                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)  | Parâmetro plano `reasoning_effort: <effort>` no corpo                           | Quando `reasoning.effort` é definido no formato aninhado da configuração, ele é reescrito para o parâmetro plano `reasoning_effort`, e `'low'`/`'medium'` são normalizados para `'high'`, `'xhigh'` para `'max'` — espelhando a [compatibilidade reversa do lado do servidor](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) do DeepSeek. Os valores `samplingParams.reasoning_effort` ou `extra_body.reasoning_effort` no nível superior ignoram essa normalização e são enviados como estão. |
| **OpenAI** (outros servidores compatíveis)  | `reasoning: { effort, ... }` passado diretamente                               | Definido via `samplingParams` (ex.: `samplingParams.reasoning_effort` para GPT-5/série-o) quando o provedor espera um formato diferente.                                                                                                                                                                                                                                                                                                                  |
| **Anthropic** (`api.anthropic.com` real)    | `output_config: { effort }` mais o cabeçalho beta `effort-2025-11-24`           | O Anthropic real aceita apenas `'low'`/`'medium'`/`'high'`. `'max'` é **reduzido para `'high'`** com um log `debugLogger.warn` (uma vez por gerador); se precisar de esforço máximo, mude a baseURL para um endpoint compatível com DeepSeek que o suporte.                                                                                                                                                                                                |
| **Anthropic** (`api.deepseek.com/anthropic`) | Mesmo `output_config: { effort }` + cabeçalho beta                              | `'max'` é passado sem alterações.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Gemini** (`@google/genai`)                | `thinkingConfig: { includeThoughts: true, thinkingLevel }`                      | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, outros → `THINKING_LEVEL_UNSPECIFIED` (Gemini não tem nível `MAX`).                                                                                                                                                                                                                                                                                                                                           |

### `reasoning: false`

Definir `reasoning: false` (o booleano literal) desabilita explicitamente o pensamento em todos os provedores — útil para consultas secundárias baratas que não se beneficiam de raciocínio. Isso também é respeitado no nível da requisição via `request.config.thinkingConfig.includeThoughts: false` para chamadas pontuais (ex.: geração de sugestões).

Em uma baseURL `api.deepseek.com`, o pipeline da OpenAI emite o campo explícito `thinking: { type: 'disabled' }` que o DeepSeek V4+ exige — o padrão do lado do servidor é `'enabled'`, então simplesmente omitir `reasoning_effort` ainda pagaria latência/custo de pensamento. Backends DeepSeek auto-hospedados (sglang/vllm) e outros servidores compatíveis com OpenAI **não** recebem este campo; se precisar desabilitar o pensamento neles, injete `thinking: { type: 'disabled' }` (ou o parâmetro que sua estrutura de inferência expuser) via `samplingParams`/`extra_body`.

### Interação com `samplingParams` (apenas compatível com OpenAI)

> [!warning]
>
> Quando `generationConfig.samplingParams` é definido em um provedor compatível com OpenAI, o pipeline envia essas chaves para a requisição **diretamente** e pula completamente a injeção separada de `reasoning`. Portanto, uma configuração como `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` descartará silenciosamente o campo de raciocínio nas requisições OpenAI/DeepSeek.
>
> Se você definir `samplingParams`, inclua o parâmetro de raciocínio diretamente dentro dele — para DeepSeek, isso é `samplingParams.reasoning_effort`; para GPT-5/série-o, é `samplingParams.reasoning_effort` (o campo plano) ou `samplingParams.reasoning` (o objeto aninhado). Para OpenRouter e outros provedores, o nome do campo varia; consulte a documentação do provedor.
>
> Os conversores Anthropic e Gemini não são afetados — eles sempre leem `reasoning.effort` diretamente, independentemente de `samplingParams`.
### `budget_tokens`

Você pode definir um orçamento exato de tokens de raciocínio incluindo `budget_tokens` junto com `effort`:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Para Anthropic isso se torna `thinking.budget_tokens`. Para OpenAI/DeepSeek o campo é preservado, mas atualmente ignorado pelo servidor — `reasoning_effort` é o botão que realmente funciona.

## Modelos de Provedor vs Modelos de Runtime

O Qwen Code distingue entre dois tipos de configurações de modelo:

### Modelo de Provedor

- Definido na configuração `modelProviders`
- Possui um pacote de configuração completo e atômico
- Quando selecionado, sua configuração é aplicada como uma camada impermeável
- Aparece na lista de comando `/model` com metadados completos (nome, descrição, capacidades)
- Recomendado para fluxos de trabalho com múltiplos modelos e consistência em equipe

### Modelo de Runtime

- Criado dinamicamente ao usar IDs de modelo brutos via CLI (`--model`), variáveis de ambiente ou configurações
- Não definido em `modelProviders`
- A configuração é construída "projetando" através das camadas de resolução (CLI → env → configurações → padrões)
- Capturado automaticamente como um **RuntimeModelSnapshot** quando uma configuração completa é detectada
- Permite reuso sem precisar reinserir credenciais

### Ciclo de vida do RuntimeModelSnapshot

Quando você configura um modelo sem usar `modelProviders`, o Qwen Code cria automaticamente um RuntimeModelSnapshot para preservar sua configuração:

```bash
# Isto cria um RuntimeModelSnapshot com ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

O snapshot:

- Captura o ID do modelo, chave da API, URL base e configuração de geração
- Persiste entre sessões (armazenado em memória durante o runtime)
- Aparece na lista do comando `/model` como uma opção de runtime
- Pode ser ativado usando `/model $runtime|openai|my-custom-model`

### Principais diferenças

| Aspecto                  | Modelo de Provedor                 | Modelo de Runtime                         |
| ------------------------ | ---------------------------------- | ----------------------------------------- |
| Fonte de configuração    | `modelProviders` nas configurações | CLI, env, camadas de configuração         |
| Atomicidade da config.   | Pacote completo e impermeável      | Em camadas, cada campo resolvido individualmente |
| Reusabilidade            | Sempre disponível na lista `/model` | Capturado como snapshot, aparece se completo |
| Compartilhamento em time | Sim (via configurações versionadas)| Não (local ao usuário)                    |
| Armazenamento de creds   | Apenas referência via `envKey`     | Pode capturar a chave real no snapshot    |

### Quando usar cada um

- **Use Modelos de Provedor** quando: você tem modelos padrão compartilhados em uma equipe, precisa de configurações consistentes ou quer evitar sobrescritas acidentais
- **Use Modelos de Runtime** quando: estiver testando rapidamente um novo modelo, usando credenciais temporárias ou trabalhando com endpoints ad-hoc

## Persistência de Seleção e Recomendações

> [!important]
>
> Defina `modelProviders` no escopo do usuário `~/.qwen/settings.json` sempre que possível e evite persistir sobrescritas de credenciais em qualquer escopo. Manter o catálogo de provedores nas configurações do usuário previne conflitos de merge/sobrescrita entre escopos de projeto e usuário e garante que atualizações via `/auth` e `/model` sempre gravem em um escopo consistente.

- `/model` e `/auth` persistem `model.name` (quando aplicável) e `security.auth.selectedType` no escopo gravável mais próximo que já define `modelProviders`; caso contrário, recorrem ao escopo do usuário. Isso mantém os arquivos de workspace/usuário em sincronia com o catálogo ativo de provedores.
- Sem `modelProviders`, o resolvedor mistura camadas de CLI/env/configurações, criando Modelos de Runtime. Isso é aceitável para configurações de provedor único, mas incômodo quando há trocas frequentes. Defina catálogos de provedores sempre que fluxos de trabalho com múltiplos modelos forem comuns, para que as trocas permaneçam atômicas, com atribuição de origem e depuráveis.
