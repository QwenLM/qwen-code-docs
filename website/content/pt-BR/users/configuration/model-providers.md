# Provedores de Modelos

O Qwen Code permite configurar vários provedores de modelos por meio da configuração `modelProviders` no seu `settings.json`. Isso permite alternar entre diferentes modelos e provedores de IA usando o comando `/model`.

## Visão Geral

Use `modelProviders` para declarar modelos por id de provedor que podem ser alternados no seletor `/model`. Cada chave é um id de provedor e seu valor é **um array de definições de modelo** (`ModelConfig[]`). Para provedores integrados, a chave deve ser um tipo de auth válido (`openai`, `anthropic`, `gemini`, `vertex-ai`); um id de provedor personalizado (ex.: `idealab`) é permitido desde que você o mapeie para um protocolo via a configuração de nível superior [`providerProtocol`](#ids-de-provedor-personalizados-providerprotocol). Cada entrada de modelo requer um `id`; `envKey` é **opcional e recomendado** (quando omitido, usa a chave de ambiente padrão do tipo de auth, por exemplo, `OPENAI_API_KEY` para `openai`), com `name`, `description`, `baseUrl` e `generationConfig` opcionais. As credenciais nunca são persistidas nas configurações; o runtime as lê de `process.env[envKey]`. Os modelos Qwen OAuth permanecem hard-coded e não podem ser sobrescritos.

> [!note]
>
> Previews anteriores envolviam os modelos de cada provedor em um objeto `{ "protocol": ..., "models": [...] }`. Esse formato foi revertido — o valor atual é o array `ModelConfig[]` puro mostrado ao longo desta página. Uma entrada envolvida em um arquivo de configurações já migrado (`$version: 4`) é ignorada silenciosamente, então atualize quaisquer configurações antigas para o formato de array.

> [!note]
>
> Apenas o comando `/model` expõe tipos de autenticação não padrão. Anthropic, Gemini, etc., devem ser definidos via `modelProviders`. O comando `/auth` lista três opções de nível superior: **Alibaba ModelStudio** (com Coding Plan, Token Plan e Standard API Key em seu submenu), **Provedores de Terceiros** e **Provedor Personalizado**. (O Qwen OAuth não é mais uma entrada selecionável no diálogo; seu plano gratuito foi descontinuado em 15/04/2026.)

> [!note]
>
> **Unicidade do modelo:** Modelos dentro do mesmo `authType` são identificados exclusivamente pela combinação de `id` + `baseUrl`. Isso significa que você pode definir o mesmo ID de modelo (por exemplo, `"gpt-4o"`) várias vezes sob um único `authType`, desde que cada entrada tenha um `baseUrl` diferente — por exemplo, um apontando diretamente para a OpenAI e outro para um endpoint de proxy. Se duas entradas compartilharem o mesmo `id` e o mesmo `baseUrl` (ou ambas omitirem o `baseUrl`), a primeira ocorrência prevalece e as duplicatas subsequentes são ignoradas com um aviso.

### Rotas de geração de imagens

Defina `supportsImageGeneration: true` quando uma rota puder ser usada pela
ferramenta integrada `image_gen`. Essa capacidade é independente do suporte a
entrada de imagens como `capabilities.vision` ou
`generationConfig.modalities.image`.

Use `imageOnly: true` quando a rota for dedicada à geração de imagens e não
dever aparecer nos seletores de modelo comuns. Para compatibilidade retroativa,
`imageOnly: true` também implica capacidade de geração de imagens, então
configurações existentes não precisam ser migradas.

Uma rota de papel duplo pode ser selecionada tanto como modelo principal quanto
via `/model --image`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "omni-model",
        "envKey": "MODEL_API_KEY",
        "baseUrl": "https://gateway.example.com/model-api",
        "supportsImageGeneration": true
      }
    ]
  }
}
```

Uma rota dedicada de imagens define ambos os campos. A forma legada com apenas
`imageOnly: true` permanece válida:

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

A rota selecionada deve declarar um `baseUrl` HTTPS explícito e um `envKey`
não vazio. A geração de imagens usa o mesmo endpoint e a mesma credencial da
rota; se chat e geração de imagens requerem endpoints ou credenciais
diferentes, configure duas rotas.

## Exemplos de Configuração por Tipo de Autenticação

Abaixo estão exemplos abrangentes de configuração para diferentes tipos de autenticação, mostrando os parâmetros disponíveis e suas combinações.

### Tipos de Autenticação Suportados

As chaves do objeto `modelProviders` devem ser valores válidos de `authType`. Os tipos de autenticação suportados atualmente são:

| Auth Type    | Description                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | APIs compatíveis com OpenAI (OpenAI, Azure OpenAI, servidores de inferência locais como vLLM/Ollama)                                            |
| `anthropic`  | API Anthropic Claude                                                                                                                            |
| `gemini`     | API Google Gemini                                                                                                                               |
| `qwen-oauth` | Qwen OAuth (hard-coded, não pode ser sobrescrito em `modelProviders`)                                                                           |
| `vertex-ai`  | Google Vertex AI (usa o protocolo `gemini` e o SDK `@google/genai` no modo Vertex AI; selecioná-lo define `GOOGLE_GENAI_USE_VERTEXAI=true`)     |

> [!note]
> Entradas do Vertex AI podem autenticar com **Application Default Credentials**. Defina `GOOGLE_CLOUD_PROJECT` (e opcionalmente `GOOGLE_CLOUD_LOCATION`, cujo padrão é `global`) e deixe `envKey` não definido, junto com todas as outras fontes de chave que o resolvedor lê: `GOOGLE_API_KEY`, `settings.security.auth.apiKey` e as flags de CLI de chave. Qualquer valor de chave de API que chegue a uma entrada do Vertex ativa o modo Vertex Express do SDK Google, que ignora o projeto, a localização e suas credenciais ADC. Uma entrada que declara um `envKey` nunca é roteada para ADC, então uma chave que falhe ao ser injetada continuará falhando nessa variável em vez de autenticar silenciosamente como um principal diferente.

> [!warning]
> Um id de provedor que não é um protocolo integrado nem mapeado via `providerProtocol` (por exemplo, um erro de digitação como `"openai-custom"`) não pode ser roteado, então toda a sua entrada é **ignorada** com um aviso — seus modelos simplesmente não aparecerão no seletor `/model`. Use um dos valores de tipo de auth suportados acima para provedores integrados, ou adicione um mapeamento [`providerProtocol`](#ids-de-provedor-personalizados-providerprotocol) para um id personalizado.

### IDs de provedor personalizados (`providerProtocol`)

Os ids de provedor integrados (`openai`, `gemini`, `anthropic`, `vertex-ai`, `qwen-oauth`) são roteados para seu protocolo de SDK automaticamente. Para usar um id de provedor **personalizado** — por exemplo, para agrupar vários endpoints compatíveis com OpenAI sob um nome mais amigável — declare-o em `modelProviders` e mapeie-o para um protocolo integrado com a configuração de nível superior `providerProtocol`:

```json
{
  "modelProviders": {
    "idealab": [
      {
        "id": "my-model",
        "envKey": "IDEALAB_API_KEY",
        "baseUrl": "https://idealab.example.com/v1"
      }
    ]
  },
  "providerProtocol": {
    "idealab": "openai"
  }
}
```

Sem uma entrada `providerProtocol` correspondente, um id de provedor personalizado é ignorado (veja o aviso acima).

### SDKs Usados para Requisições de API

O Qwen Code usa os seguintes SDKs oficiais para enviar requisições para cada provedor:

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - SDK oficial OpenAI para Node.js              |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK oficial Anthropic  |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK oficial Google GenAI       |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) com provedor personalizado (compatível com DashScope) |

Isso significa que o `baseUrl` configurado deve ser compatível com o formato de API esperado pelo SDK correspondente. Por exemplo, ao usar o tipo de autenticação `openai`, o endpoint deve aceitar requisições no formato da API OpenAI.

### Provedores compatíveis com OpenAI (`openai`)

Este tipo de autenticação suporta não apenas a API oficial da OpenAI, mas também qualquer endpoint compatível com OpenAI, incluindo provedores de modelos agregados como OpenRouter e Requesty.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
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
          "retryInitialDelayMs": 3000,
          "retryMaxDelayMs": 30000,
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

Para um modelo de visão que também pode seguir a política normal do agent do Qwen Code e usar ferramentas, ative o roteamento de imagens de turno completo com ambas as capacidades:

```json
"capabilities": {
  "vision": true,
  "agent": true
}
```

Quando um modelo principal apenas de texto usa esse modelo como fallback de visão configurado, o turno completo com imagens permanece nesse provedor, modelo e endpoint exatos durante chamadas de ferramentas e retentativas. O próximo turno independente retorna ao modelo principal, e cada requisição de modelo recebe apenas modalidades de mídia suportadas pelo seu alvo. Omita `agent` (ou defina como `false`) para manter o fluxo mais seguro de transcrição Vision Bridge.

### Modelos Auto-hospedados Locais (via API compatível com OpenAI)

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
          "streamIdleTimeoutMs": 600000,
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

Para servidores OpenAI compatíveis locais ou em fila, `streamIdleTimeoutMs` controla por quanto tempo este modelo pode ficar silencioso entre chunks transmitidos. Ele sobrescreve o valor global de `QWEN_STREAM_IDLE_TIMEOUT_MS` para a entrada de provedor selecionada; defina como `0` para desativar o guarda de ociosidade. O limite separado de 15 minutos de tempo de vida do stream ainda se aplica a menos que `QWEN_STREAM_MAX_LIFETIME_MS` seja aumentado ou desativado.

Para servidores locais que não requerem autenticação, você pode usar qualquer valor de espaço reservado (placeholder) para a chave de API:

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> O parâmetro `extra_body` é **suportado apenas para provedores compatíveis com OpenAI** (`openai`, `qwen-oauth`). Ele é ignorado para os provedores Anthropic e Gemini.

> [!note]
>
> **Sobre `envKey`**: O campo `envKey` especifica o **nome de uma variável de ambiente**, não o valor real da chave de API. Para que a configuração funcione, você precisa garantir que a variável de ambiente correspondente esteja definida com sua chave de API real. Há duas maneiras de fazer isso:
>
> - **Opção 1: Usando um arquivo `.env`** (recomendado por segurança):
>   ```bash
>   # ~/.qwen/.env (ou raiz do projeto)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Certifique-se de adicionar `.env` ao seu `.gitignore` para evitar o commit acidental de secrets.
> - **Opção 2: Usando o campo `env` no `settings.json`** (como mostrado nos exemplos acima):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Cada exemplo de provedor inclui um campo `env` para ilustrar como a chave de API deve ser configurada.
## Alibaba Cloud Coding Plan

O Alibaba Cloud Coding Plan oferece um conjunto pré-configurado de modelos Qwen otimizados para tarefas de codificação. Este recurso está disponível para usuários com acesso à API do Alibaba Cloud Coding Plan e oferece uma experiência de configuração simplificada com atualizações automáticas da configuração dos modelos.

### Visão geral

Ao autenticar com uma chave de API do Alibaba Cloud Coding Plan usando o comando `/auth`, o Qwen Code configura automaticamente os seguintes modelos:

| ID do modelo           | Nome                 | Descrição                                               |
| ---------------------- | -------------------- | ------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Modelo avançado com raciocínio ativado                  |
| `qwen3.6-plus`         | qwen3.6-plus         | Modelo mais recente com raciocínio ativado (apenas para assinantes Pro) |
| `qwen3.7-plus`         | qwen3.7-plus         | Modelo avançado com raciocínio ativado                  |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Otimizado para tarefas de codificação                   |
| `qwen3-coder-next`     | qwen3-coder-next     | Modelo experimental de codificação                      |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Modelo max mais recente com raciocínio ativado          |
| `glm-5`                | glm-5                | Modelo GLM com raciocínio ativado                       |
| `glm-4.7`              | glm-4.7              | Modelo GLM com raciocínio ativado                       |
| `kimi-k2.5`            | kimi-k2.5            | Modelo Kimi com raciocínio e suporte a visão/vídeo      |
| `MiniMax-M2.5`         | MiniMax-M2.5         | Modelo MiniMax com raciocínio ativado                   |

### Configuração

1. Obtenha uma chave de API do Alibaba Cloud Coding Plan:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **Internacional**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Execute o comando `/auth` no Qwen Code
3. Selecione **Alibaba ModelStudio** e, em seguida, escolha **Coding Plan** no submenu
4. Selecione sua região
5. Insira sua chave de API quando solicitado

Os modelos serão configurados automaticamente e adicionados ao seu seletor `/model`.

### Regiões

O Alibaba Cloud Coding Plan oferece suporte a duas regiões:

| Região               | Endpoint                                        | Descrição             |
| -------------------- | ----------------------------------------------- | --------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpoint da China continental |
| Global/Internacional | `https://coding-intl.dashscope.aliyuncs.com/v1` | Endpoint internacional  |

A região é selecionada durante a autenticação e armazenada em `settings.json` na configuração `modelProviders`. Para alternar regiões, execute o comando `/auth` novamente e selecione uma região diferente.

### Armazenamento da chave de API

Ao configurar o Coding Plan por meio do comando `/auth`, a chave de API é armazenada usando o nome de variável de ambiente reservado `BAILIAN_CODING_PLAN_API_KEY`. Por padrão, ela é armazenada no campo `env` do seu arquivo `settings.json`.

> [!warning]
>
> **Recomendação de segurança**: Para uma segurança melhor, recomenda-se mover a chave de API do `settings.json` para um arquivo `.env` separado e carregá-la como uma variável de ambiente. Por exemplo:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=sua-chave-de-api-aqui
> ```
>
> Em seguida, certifique-se de que este arquivo foi adicionado ao seu `.gitignore` se você estiver usando configurações no nível do projeto.

### Atualizações automáticas

As configurações dos modelos do Coding Plan são versionadas. Quando o Qwen Code detecta uma versão mais recente do template do modelo, você será solicitado a atualizar. Aceitar a atualização irá:

- Substituir as configurações existentes dos modelos do Coding Plan pelas versões mais recentes
- Preservar quaisquer configurações de modelos personalizados que você adicionou manualmente
- Alternar automaticamente para o primeiro modelo na configuração atualizada

O processo de atualização garante que você sempre tenha acesso às configurações e aos recursos de modelos mais recentes sem intervenção manual.

### Configuração manual (Avançado)

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
> Ao usar a configuração manual:
>
> - Você pode usar qualquer nome de variável de ambiente para `envKey`
> - Você não precisa configurar `codingPlan.*`
> - **As atualizações automáticas não se aplicarão** aos modelos do Coding Plan configurados manualmente

> [!warning]
>
> Se você também usar a configuração automática do Coding Plan, as atualizações automáticas poderão substituir suas configurações manuais se elas usarem o mesmo `envKey` e `baseUrl` que a configuração automática. Para evitar isso, certifique-se de que sua configuração manual use um `envKey` diferente, se possível.

## Camadas de Resolução e Atomicidade

Os valores efetivos de auth/model/credential são escolhidos por campo usando a seguinte precedência (o primeiro presente vence). Você pode combinar `--auth-type` com `--model` para apontar diretamente para uma entrada de provedor; essas flags de CLI são executadas antes de outras camadas.

| Camada (maior → menor prioridade) | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| --------------------------------- | ----------------------------------- | ----------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Substituições programáticas       | `/auth`                             | Entrada do `/auth`                              | Entrada do `/auth`                                   | Entrada do `/auth`                                     | —                      | —                                 |
| Seleção de provedor de modelo     | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                          | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| Argumentos de CLI                 | `--auth-type`                       | `--model`                                       | `--openai-api-key`                                   | `--openai-base-url`                                    | —                      | —                                 |
| Variáveis de ambiente             | —                                   | Mapeamento específico do provedor (ex.: `OPENAI_MODEL`) | Mapeamento específico do provedor (ex.: `OPENAI_API_KEY`) | Mapeamento específico do provedor (ex.: `OPENAI_BASE_URL`) | —                      | —                                 |
| Configurações (`settings.json`)   | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                               | `security.auth.baseUrl`                                | —                      | —                                 |
| Padrão / computado                | Fallback para `AuthType.QWEN_OAUTH` | Padrão integrado (OpenAI ⇒ `qwen3.5-plus`)      | —                                                    | —                                                      | —                      | `Config.getProxy()` se configurado |

\*Quando presentes, as flags de auth de CLI substituem as configurações. Caso contrário, `security.auth.selectedType` ou o padrão implícito determinam o tipo de auth. Qwen OAuth e OpenAI são os únicos tipos de auth exibidos sem configuração extra.

> [!note]
>
> `--openai-api-key` e `--openai-base-url` são as únicas flags de CLI de credenciais. Elas se aplicam ao provedor compatível com OpenAI ativo, independentemente do seu nome — não existem flags de credenciais `--anthropic-*` / `--gemini-*`. Credenciais específicas do provedor que não são passadas na CLI são resolvidas a partir de variáveis de ambiente (veja a linha abaixo).

> [!warning]
>
> **Descontinuação de `security.auth.apiKey` e `security.auth.baseUrl`:** Configurar diretamente as credenciais da API via `security.auth.apiKey` e `security.auth.baseUrl` no `settings.json` foi descontinuado. Essas configurações eram usadas em versões históricas para credenciais inseridas por meio da UI, mas o fluxo de entrada de credenciais foi removido na versão 0.10.1. Esses campos serão totalmente removidos em uma versão futura. **É altamente recomendável migrar para `modelProviders`** para todas as configurações de modelo e credenciais. Use `envKey` em `modelProviders` para referenciar variáveis de ambiente para um gerenciamento seguro de credenciais, em vez de codificá-las diretamente nos arquivos de configurações.

## Camadas de Configuração de Geração: A Camada Impermeável do Provedor

A resolução de configuração segue um modelo de camadas estrito com uma regra crucial: **a camada modelProvider é impermeável**.

### Como funciona

1. **Quando um modelo modelProvider ESTÁ selecionado** (por exemplo, via comando `/model` escolhendo um modelo configurado pelo provedor):
   - Todo o `generationConfig` do provedor é aplicado **atomicamente**
   - **A camada do provedor é completamente impermeável** — camadas inferiores (CLI, env, configurações) não participam da resolução do generationConfig
   - Todos os campos definidos em `modelProviders[].generationConfig` usam os valores do provedor
   - Todos os campos **não definidos** pelo provedor são definidos como `undefined` (não herdados das configurações)
   - Isso garante que as configurações do provedor atuem como um "pacote selado" completo e autossuficiente

   Se um modelo estiver listado em `modelProviders`, coloque todas as
   configurações de geração específicas do modelo na entrada do provedor correspondente. Os valores
   de `model.generationConfig` de nível superior, incluindo `contextWindowSize`,
   `modalities`, `customHeaders` e `extra_body`, são ignorados para modelos
   do provedor. Configure esses campos em
   `modelProviders[authType][].generationConfig` para que sejam aplicados.

2. **Quando NENHUM modelo modelProvider está selecionado** (por exemplo, usando `--model` com um ID de modelo bruto, ou usando CLI/env/configurações diretamente):
   - A resolução passa para as camadas inferiores
   - Os campos são preenchidos de CLI → env → configurações → padrões
   - Isso cria um **Modelo de Runtime** (veja a próxima seção)

### Precedência por campo para `generationConfig`

| Prioridade | Origem                                        | Comportamento                                                                                                 |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1          | Substituições programáticas                   | Alterações de runtime `/model`, `/auth`                                                                       |
| 2          | `modelProviders[authType][].generationConfig` | **Camada impermeável** - substitui completamente todos os campos de generationConfig; camadas inferiores não participam |
| 3          | `settings.model.generationConfig`             | Usado apenas para **Modelos de Runtime** (quando nenhum modelo de provedor está selecionado)                  |
| 4          | Padrões do gerador de conteúdo                | Padrões específicos do provedor (ex.: OpenAI vs Gemini) - apenas para Modelos de Runtime                      |

### Tratamento de campos atômicos

Os seguintes campos são tratados como objetos atômicos - os valores do provedor substituem completamente o objeto inteiro, não ocorrendo mesclagem:

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

// Configuração de modelProviders
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

Quando `gpt-4o` é selecionado em `modelProviders`:

- `timeout` = 60000 (do provedor, sobrescreve as configurações)
- `samplingParams.temperature` = 0.2 (do provedor, substitui completamente o objeto de configurações)
- `samplingParams.max_tokens` = **undefined** (não definido no provedor, e a camada do provedor não herda das configurações — os campos são explicitamente definidos como undefined se não forem fornecidos)

Ao usar um modelo bruto via `--model gpt-4` (não proveniente de `modelProviders`, cria um Runtime Model):

- `timeout` = 30000 (das configurações)
- `samplingParams.temperature` = 0.5 (das configurações)
- `samplingParams.max_tokens` = 1000 (das configurações)

A estratégia de mesclagem para o próprio `modelProviders` é REPLACE (substituir): todo o `modelProviders` das configurações do projeto substituirá a seção correspondente nas configurações do usuário, em vez de mesclar os dois.

## Configuração de reasoning / thinking

O campo opcional `reasoning` em `generationConfig` controla o quão agressivamente o modelo raciocina antes de responder. Os conversores da Anthropic e do Gemini sempre o respeitam. O pipeline compatível com OpenAI o respeita **a menos que** `generationConfig.samplingParams` esteja definido — veja a ressalva "Interação com `samplingParams`" abaixo.

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
          // A escala de quatro níveis:
          //   'low'    | 'medium' — mapeado pelo servidor para 'high' no DeepSeek
          //   'high'   — intensidade de raciocínio padrão
          //   'max'    — nível extra-forte específico do DeepSeek
          // Ou defina como `false` para desativar o raciocínio completamente.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### Comportamento por provedor

| Protocolo / provedor                          | Formato na rede                                                           | Notas                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope** (família `qwen3.8-max`) | Parâmetro de corpo plano `reasoning_effort: <effort>`                     | Os níveis de `/effort` são passados literalmente para qualquer id de modelo que comece com `qwen3.8-max` (incluindo snapshots datados e aliases `-latest`); o DashScope aplica qualquer mapeamento específico do modelo. A escada desta família para em `xhigh`, então um `max` configurado é limitado a `xhigh` (registrado uma vez) em vez de enviado e rejeitado. Um `reasoning_effort` explícito em `samplingParams` ou `extra_body` é uma substituição literal e não é limitado. Quando `reasoning_effort` e `thinking_budget` conflitam, a precedência normal `extra_body` > `samplingParams` > `reasoning` mantém apenas o campo de maior prioridade; um par explícito da mesma camada mantém `reasoning_effort`, correspondendo ao comportamento do provedor antes da resolução entre camadas. Se um campo estático vencer, `/effort` reporta esse campo em vez de implicar que o nível solicitado está efetivo. Quando um nível de esforço vence, um `enable_thinking` conflitante também é descartado. Um `enable_thinking: false` explícito em `extra_body` é respeitado em vez de descartado: ele sobrescreve o nível configurado como `reasoning_effort: 'none'`, um dos poucos lugares onde `extra_body` não vence literalmente. Outros modelos Qwen continuam mapeando o esforço selecionado para `enable_thinking: true`; um override de `reasoning_effort` é passado literalmente, a menos que conflite com um `thinking_budget` (par que o DashScope rejeita), caso em que o `reasoning_effort` inerte é descartado e ambos `enable_thinking` e `thinking_budget` sobrevivem. |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | Parâmetro de corpo plano `reasoning_effort: <effort>`                     | Quando `reasoning.effort` é definido na estrutura de configuração aninhada, ele é reescrito para o `reasoning_effort` plano e `'low'`/`'medium'` são normalizados para `'high'`, `'xhigh'` para `'max'` — espelhando a [compatibilidade retroativa do lado do servidor](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) do DeepSeek. Substituições de `samplingParams.reasoning_effort` ou `extra_body.reasoning_effort` de nível superior ignoram essa normalização e são enviadas literalmente. `max` é aceito apenas em um hostname real do DeepSeek; um modelo com nome `deepseek` em outro host mantém o teto genérico `xhigh`, correspondendo ao gate de hostname na própria reestruturação. |
| **OpenAI / Z.ai** (`z.ai`, `bigmodel.cn`)    | Parâmetro de corpo plano `reasoning_effort: <effort>`                     | GLM-5.2+ em um host Z.ai aceita a escada completa, incluindo `max`, e o `reasoning.effort` aninhado é reescrito para o campo plano. IDs GLM mais antigos e um modelo `glm-*` alcançado em qualquer outro host mantêm o teto genérico `xhigh`: o nome do modelo sozinho não diz o que aquele endpoint aceita. |
| **OpenAI** (outros servidores compatíveis)        | `reasoning: { effort, ... }` passado literalmente                 | Um `max` configurado é limitado a `xhigh` (registrado uma vez), pois `max` é uma extensão do fornecedor em vez de parte da escada genérica do OpenAI. Defina via `samplingParams` (por exemplo, `samplingParams.reasoning_effort` para GPT-5/série o) quando o provedor espera uma estrutura diferente; um valor explícito de `samplingParams` / `extra_body` não é limitado. |
| **Anthropic** (`api.anthropic.com` real)     | `output_config: { effort }` mais o header beta `effort-2025-11-24` | A Anthropic real aceita apenas `'low'`/`'medium'`/`'high'`. `'max'` é **limitado a `'high'`** com uma linha de `debugLogger.warn` (uma vez por gerador); se você quiser o esforço máximo, mude o baseURL para um endpoint compatível com DeepSeek que o suporte.                                                                                                                                                                                  |
| **Anthropic** (`api.deepseek.com/anthropic`) | Mesmo `output_config: { effort }` + header beta                       | `'max'` é passado sem alterações.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, outros → `THINKING_LEVEL_UNSPECIFIED` (o Gemini não tem nível `MAX`).                                                                                                                                                                                                                                                                                                                    |

### `reasoning: false`

Definir `reasoning: false` (o booleano literal) desativa explicitamente o thinking em todos os provedores — útil para consultas secundárias baratas que não se beneficiam do raciocínio. Isso também é respeitado no nível da requisição via `request.config.thinkingConfig.includeThoughts: false` para chamadas pontuais (por exemplo, geração de sugestões).

Em um baseURL `api.deepseek.com`, o pipeline OpenAI emite o campo explícito `thinking: { type: 'disabled' }` que o DeepSeek V4+ exige — o padrão do lado do servidor é `'enabled'`, então simplesmente omitir `reasoning_effort` ainda incorreria em latência/custo de thinking. Backends DeepSeek auto-hospedados (sglang/vllm) e outros servidores compatíveis com OpenAI **não** recebem este campo; se você precisar desativar o thinking neles, injete `thinking: { type: 'disabled' }` (ou qualquer outro controle que seu framework de inferência exponha) via `samplingParams`/`extra_body`.

Em um baseURL `openrouter.ai`, o pipeline OpenAI emite o campo `reasoning: { enabled: false }` no nível do provedor do OpenRouter quando o raciocínio está desativado. Outros servidores compatíveis com OpenAI não recebem este campo específico do OpenRouter; use `samplingParams`/`extra_body` para o controle nativo de desativação deles.

### Interação com `samplingParams` (apenas compatível com OpenAI)

> [!warning]
>
> Quando `generationConfig.samplingParams` é definido em um provedor compatível com OpenAI, o pipeline envia essas chaves para a rede **literalmente** e ignora completamente a injeção separada de `reasoning`. Portanto, uma configuração como `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` descartará silenciosamente o campo de raciocínio nas requisições OpenAI/DeepSeek. Um objeto `reasoning` colocado dentro de `samplingParams` é um valor próprio e é enviado inalterado: o teto de esforço acima se aplica apenas ao nível injetado pelo pipeline a partir de `/effort`.
>
> Os modelos Qwen do DashScope são uma exceção: seu provedor lê `reasoning` diretamente e o mapeia para `reasoning_effort` ou `enable_thinking`. Na família qwen3.8-max, os campos específicos de `samplingParams` do provedor ainda têm precedência quando os parâmetros de rede conflitam; em qwen híbridos mais antigos, um nível de esforço configurado colapsa para `enable_thinking: true`, que sobrescreve um valor de `samplingParams.enable_thinking`.
>
> Se você definir `samplingParams`, inclua o controle de raciocínio diretamente dentro dele — para o DeepSeek é `samplingParams.reasoning_effort`, para GPT-5/série o é `samplingParams.reasoning_effort` (seu campo plano) ou `samplingParams.reasoning` (o objeto aninhado). Para OpenRouter e outros provedores, o nome do campo varia; consulte a documentação do provedor.
>
> Os conversores da Anthropic e do Gemini não são afetados — eles sempre leem `reasoning.effort` diretamente, independentemente de `samplingParams`.

### `budget_tokens`

Você pode fixar um orçamento exato de tokens de thinking incluindo `budget_tokens` junto com `effort`:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Para a Anthropic, isso se torna `thinking.budget_tokens`. Para OpenAI/DeepSeek, o campo é preservado, mas atualmente ignorado pelo servidor — `reasoning_effort` é o controle principal.

## Provider Models vs Runtime Models

O Qwen Code distingue dois tipos de configurações de modelo:

### Provider Model

- Definido na configuração `modelProviders`
- Possui um pacote de configuração completo e atômico
- Quando selecionado, sua configuração é aplicada como uma camada impermeável
- Aparece na lista de comandos `/model` com metadados completos (nome, descrição, capacidades)
- Recomendado para fluxos de trabalho multimodelo e consistência da equipe

### Runtime Model

- Criado dinamicamente ao usar IDs de modelo brutos via CLI (`--model`), variáveis de ambiente ou configurações
- Não definido em `modelProviders`
- A configuração é construída "projetando" através das camadas de resolução (CLI → env → settings → defaults)
- Capturado automaticamente como um **RuntimeModelSnapshot** quando uma configuração completa é detectada
- Permite reutilização sem a necessidade de inserir as credenciais novamente

### Ciclo de vida do RuntimeModelSnapshot

Quando você configura um modelo sem usar `modelProviders`, o Qwen Code cria automaticamente um RuntimeModelSnapshot para preservar sua configuração:

```bash
# Isso cria um RuntimeModelSnapshot com o ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

O snapshot:

- Captura o ID do modelo, API key, base URL e configuração de geração
- Persiste entre sessões (armazenado em memória durante a execução)
- Aparece na lista de comandos `/model` como uma opção de runtime
- Pode ser alternado usando `/model $runtime|openai|my-custom-model`

### Principais diferenças

| Aspecto                  | Provider Model                    | Runtime Model                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Fonte da configuração    | `modelProviders` nas configurações      | Camadas CLI, env, settings                  |
| Atomicidade da configuração | Pacote completo e impermeável     | Em camadas, cada campo resolvido independentemente |
| Reutilização             | Sempre disponível na lista `/model` | Capturado como snapshot, aparece se completo  |
| Compartilhamento em equipe            | Sim (via configurações commitadas)      | Não (local do usuário)                            |
| Armazenamento de credenciais      | Referência apenas via `envKey`       | Pode capturar a chave real no snapshot         |

### Quando usar cada um

- **Use Provider Models** quando: Você tem modelos padrão compartilhados em uma equipe, precisa de configurações consistentes ou deseja evitar substituições acidentais
- **Use Runtime Models** quando: Testando rapidamente um novo modelo, usando credenciais temporárias ou trabalhando com endpoints ad-hoc

## Persistência de Seleção e Recomendações

> [!important]
>
> Defina `modelProviders` no escopo do usuário `~/.qwen/settings.json` sempre que possível e evite persistir substituições de credenciais em qualquer escopo. Manter o catálogo de provedores nas configurações do usuário evita conflitos de mesclagem/substituição entre os escopos do projeto e do usuário, e garante que as atualizações de `/auth` e `/model` sempre gravem de volta em um escopo consistente.

- `/model` e `/auth` persistem `model.name` (quando aplicável) e `security.auth.selectedType` no escopo gravável mais próximo que já define `modelProviders`; caso contrário, eles recorrem ao escopo do usuário. Isso mantém os arquivos de workspace/usuário sincronizados com o catálogo de provedores ativo.
- Sem `modelProviders`, o resolvedor mistura as camadas CLI/env/settings, criando Runtime Models. Isso é adequado para configurações de provedor único, mas trabalhoso ao alternar com frequência. Defina catálogos de provedores sempre que fluxos de trabalho multimodelo forem comuns, para que as alternâncias permaneçam atômicas, com origem atribuída e depuráveis.