# Provedores de Modelos

O Qwen Code permite configurar múltiplos provedores de modelos por meio da configuração `modelProviders` no seu `settings.json`. Isso permite alternar entre diferentes modelos e provedores de IA usando o comando `/model`.

## Visão Geral

Use `modelProviders` para declarar listas curadas de modelos por tipo de autenticação que o seletor `/model` pode alternar. As chaves devem ser tipos de autenticação válidos (`openai`, `anthropic`, `gemini`, etc.). Cada entrada requer um `id` e **deve incluir `envKey`**, com `name`, `description`, `baseUrl` e `generationConfig` opcionais. As credenciais nunca são persistidas nas configurações; o runtime as lê de `process.env[envKey]`. Os modelos Qwen OAuth permanecem hard-coded e não podem ser sobrescritos.

> [!note]
>
> Apenas o comando `/model` expõe tipos de autenticação não padrão. Anthropic, Gemini, etc., devem ser definidos via `modelProviders`. O comando `/auth` lista Qwen OAuth, Alibaba Cloud Coding Plan e API Key como as opções de autenticação integradas.

> [!warning]
>
> **IDs de modelo duplicados no mesmo authType:** Definir múltiplos modelos com o mesmo `id` sob um único `authType` (ex.: duas entradas com `"id": "gpt-4o"` em `openai`) não é suportado atualmente. Se houver duplicatas, **a primeira ocorrência vence** e as subsequentes são ignoradas com um aviso. Observe que o campo `id` é usado tanto como identificador de configuração quanto como o nome real do modelo enviado à API, portanto, usar IDs únicos (ex.: `gpt-4o-creative`, `gpt-4o-balanced`) não é uma solução viável. Esta é uma limitação conhecida que planejamos resolver em uma versão futura.

## Exemplos de Configuração por Tipo de Autenticação

Abaixo estão exemplos completos de configuração para diferentes tipos de autenticação, mostrando os parâmetros disponíveis e suas combinações.

### Tipos de Autenticação Suportados

As chaves do objeto `modelProviders` devem ser valores válidos de `authType`. Os tipos de autenticação suportados atualmente são:

| Tipo de Autenticação | Descrição                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `openai`     | APIs compatíveis com OpenAI (OpenAI, Azure OpenAI, servidores de inferência locais como vLLM/Ollama) |
| `anthropic`  | API Anthropic Claude                                                                    |
| `gemini`     | API Google Gemini                                                                       |
| `qwen-oauth` | Qwen OAuth (hard-coded, não pode ser sobrescrito em `modelProviders`)                       |

> [!warning]
> Se uma chave de tipo de autenticação inválida for usada (ex.: um erro de digitação como `"openai-custom"`), a configuração será **ignorada silenciosamente** e os modelos não aparecerão no seletor `/model`. Sempre use um dos valores de tipo de autenticação suportados listados acima.

### SDKs Usados para Requisições de API

O Qwen Code usa os seguintes SDKs oficiais para enviar requisições a cada provedor:

| Tipo de Autenticação | Pacote SDK                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - SDK oficial OpenAI para Node.js                  |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK oficial Anthropic |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK oficial Google GenAI      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) com provedor customizado (compatível com DashScope)    |

Isso significa que o `baseUrl` configurado deve ser compatível com o formato de API esperado pelo SDK correspondente. Por exemplo, ao usar o tipo de autenticação `openai`, o endpoint deve aceitar requisições no formato da API OpenAI.

### Provedores compatíveis com OpenAI (`openai`)

Este tipo de autenticação suporta não apenas a API oficial da OpenAI, mas também qualquer endpoint compatível com OpenAI, incluindo provedores agregados de modelos como o OpenRouter.

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

Para servidores locais que não exigem autenticação, você pode usar qualquer valor placeholder para a API key:

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
>   # ~/.qwen/.env (ou raiz do projeto)
>   OPENAI_API_KEY=sk-sua-api-key-real-aqui
>   ```
>   Certifique-se de adicionar `.env` ao seu `.gitignore` para evitar o commit acidental de segredos.
> - **Opção 2: Usando o campo `env` no `settings.json`** (como mostrado nos exemplos acima):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-sua-api-key-real-aqui"
>     }
>   }
>   ```
>
> Cada exemplo de provedor inclui um campo `env` para ilustrar como a API key deve ser configurada.

## Alibaba Cloud Coding Plan

O Alibaba Cloud Coding Plan fornece um conjunto pré-configurado de modelos Qwen otimizados para tarefas de codificação. Este recurso está disponível para usuários com acesso à API do Alibaba Cloud Coding Plan e oferece uma experiência de configuração simplificada com atualizações automáticas de configuração de modelos.

### Visão Geral

Quando você se autentica com uma API key do Alibaba Cloud Coding Plan usando o comando `/auth`, o Qwen Code configura automaticamente os seguintes modelos:

| ID do Modelo               | Nome                 | Descrição                            |
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

| Região               | Endpoint                                        | Descrição             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpoint da China continental |
| Global/Internacional | `https://coding-intl.dashscope.aliyuncs.com/v1` | Endpoint internacional  |

A região é selecionada durante a autenticação e armazenada no `settings.json` em `codingPlan.region`. Para alternar regiões, execute novamente o comando `/auth` e selecione uma região diferente.

### Armazenamento da API Key

Quando você configura o Coding Plan por meio do comando `/auth`, a API key é armazenada usando o nome de variável de ambiente reservado `BAILIAN_CODING_PLAN_API_KEY`. Por padrão, ela é armazenada no campo `env` do seu arquivo `settings.json`.

> [!warning]
>
> **Recomendação de Segurança**: Para maior segurança, recomenda-se mover a API key do `settings.json` para um arquivo `.env` separado e carregá-la como variável de ambiente. Por exemplo:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=sua-api-key-aqui
> ```
>
> Em seguida, certifique-se de adicionar este arquivo ao seu `.gitignore` se estiver usando configurações em nível de projeto.

### Atualizações Automáticas

As configurações de modelo do Coding Plan são versionadas. Quando o Qwen Code detecta uma versão mais recente do template de modelo, você será solicitado a atualizar. Aceitar a atualização irá:

- Substituir as configurações de modelo do Coding Plan existentes pelas versões mais recentes
- Preservar quaisquer configurações de modelo customizadas que você adicionou manualmente
- Alternar automaticamente para o primeiro modelo na configuração atualizada

O processo de atualização garante que você sempre tenha acesso às configurações e recursos de modelo mais recentes sem intervenção manual.

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
> - Não é necessário configurar `codingPlan.*`
> - **As atualizações automáticas não se aplicarão** aos modelos do Coding Plan configurados manualmente

> [!warning]
>
> Se você também usar a configuração automática do Coding Plan, as atualizações automáticas podem sobrescrever suas configurações manuais se elas usarem o mesmo `envKey` e `baseUrl` da configuração automática. Para evitar isso, certifique-se de que sua configuração manual use um `envKey` diferente, se possível.

## Camadas de Resolução e Atomicidade

Os valores efetivos de auth/modelo/credenciais são escolhidos por campo usando a seguinte precedência (o primeiro presente vence). Você pode combinar `--auth-type` com `--model` para apontar diretamente para uma entrada de provedor; essas flags de CLI são executadas antes de outras camadas.

| Camada (maior → menor)   | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Sobrescritas programáticas     | `/auth`                             | Entrada `/auth`                                   | Entrada `/auth`                                       | Entrada `/auth`                                        | —                      | —                                 |
| Seleção de provedor de modelo   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| Argumentos de CLI              | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (ou equivalentes específicos do provedor) | `--openaiBaseUrl` (ou equivalentes específicos do provedor) | —                      | —                                 |
| Variáveis de ambiente      | —                                   | Mapeamento específico do provedor (ex.: `OPENAI_MODEL`) | Mapeamento específico do provedor (ex.: `OPENAI_API_KEY`)   | Mapeamento específico do provedor (ex.: `OPENAI_BASE_URL`)   | —                      | —                                 |
| Configurações (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Padrão / calculado         | Fallback para `AuthType.QWEN_OAUTH` | Padrão integrado (OpenAI ⇒ `qwen3-coder-plus`)  | —                                                   | —                                                    | —                      | `Config.getProxy()` se configurado |

\*Quando presentes, as flags de auth da CLI substituem as configurações. Caso contrário, `security.auth.selectedType` ou o padrão implícito determinam o tipo de autenticação. Qwen OAuth e OpenAI são os únicos tipos de autenticação expostos sem configuração extra.

> [!warning]
>
> **Depreciação de `security.auth.apiKey` e `security.auth.baseUrl`:** Configurar credenciais de API diretamente via `security.auth.apiKey` e `security.auth.baseUrl` no `settings.json` está depreciado. Essas configurações eram usadas em versões históricas para credenciais inseridas pela UI, mas o fluxo de entrada de credenciais foi removido na versão 0.10.1. Esses campos serão completamente removidos em uma versão futura. **É altamente recomendável migrar para `modelProviders`** para todas as configurações de modelo e credenciais. Use `envKey` em `modelProviders` para referenciar variáveis de ambiente para gerenciamento seguro de credenciais, em vez de hardcodar credenciais em arquivos de configuração.

## Camadas de Configuração de Geração: A Camada Impermeável do Provedor

A resolução de configuração segue um modelo de camadas estrito com uma regra crucial: **a camada modelProvider é impermeável**.

### Como funciona

1. **Quando um modelo modelProvider É selecionado** (ex.: via comando `/model` escolhendo um modelo configurado por provedor):
   - Todo o `generationConfig` do provedor é aplicado **atomicamente**
   - **A camada do provedor é completamente impermeável** — camadas inferiores (CLI, env, configurações) não participam da resolução do generationConfig de forma alguma
   - Todos os campos definidos em `modelProviders[].generationConfig` usam os valores do provedor
   - Todos os campos **não definidos** pelo provedor são definidos como `undefined` (não herdados das configurações)
   - Isso garante que as configurações do provedor atuem como um "pacote selado" completo e autossuficiente
2. **Quando NENHUM modelo modelProvider é selecionado** (ex.: usando `--model` com um ID de modelo bruto, ou usando CLI/env/configurações diretamente):
   - A resolução passa para as camadas inferiores
   - Os campos são preenchidos a partir de CLI → env → configurações → padrões
   - Isso cria um **Modelo de Runtime** (veja a próxima seção)

### Precedência por campo para `generationConfig`

| Prioridade | Fonte                                        | Comportamento                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Sobrescritas programáticas                        | Alterações em runtime `/model`, `/auth`                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **Camada impermeável** - substitui completamente todos os campos generationConfig; camadas inferiores não participam |
| 3        | `settings.model.generationConfig`             | Usado apenas para **Modelos de Runtime** (quando nenhum modelo de provedor é selecionado)                                    |
| 4        | Padrões do gerador de conteúdo                    | Padrões específicos do provedor (ex.: OpenAI vs Gemini) - apenas para Modelos de Runtime                            |

### Tratamento atômico de campos

Os seguintes campos são tratados como objetos atômicos - os valores do provedor substituem completamente o objeto inteiro, sem mesclagem:

- `samplingParams` - Temperature, top_p, max_tokens, etc.
- `customHeaders` - Headers HTTP customizados
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

Quando `gpt-4o` é selecionado em modelProviders:

- `timeout` = 60000 (do provedor, substitui configurações)
- `samplingParams.temperature` = 0.2 (do provedor, substitui completamente o objeto de configurações)
- `samplingParams.max_tokens` = **undefined** (não definido no provedor, e a camada do provedor não herda das configurações — campos são explicitamente definidos como undefined se não fornecidos)

Ao usar um modelo bruto via `--model gpt-4` (não de modelProviders, cria um Modelo de Runtime):

- `timeout` = 30000 (das configurações)
- `samplingParams.temperature` = 0.5 (das configurações)
- `samplingParams.max_tokens` = 1000 (das configurações)

A estratégia de merge para o próprio `modelProviders` é REPLACE: todo o `modelProviders` das configurações do projeto substituirá a seção correspondente nas configurações do usuário, em vez de mesclar os dois.

## Modelos de Provedor vs Modelos de Runtime

O Qwen Code distingue entre dois tipos de configurações de modelo:

### Modelo de Provedor

- Definido na configuração `modelProviders`
- Possui um pacote de configuração completo e atômico
- Quando selecionado, sua configuração é aplicada como uma camada impermeável
- Aparece na lista do comando `/model` com metadados completos (nome, descrição, capabilities)
- Recomendado para fluxos de trabalho com múltiplos modelos e consistência em equipe

### Modelo de Runtime

- Criado dinamicamente ao usar IDs de modelo brutos via CLI (`--model`), variáveis de ambiente ou configurações
- Não definido em `modelProviders`
- A configuração é construída "projetando" através das camadas de resolução (CLI → env → configurações → padrões)
- Capturado automaticamente como um **RuntimeModelSnapshot** quando uma configuração completa é detectada
- Permite reutilização sem precisar inserir credenciais novamente

### Ciclo de vida do RuntimeModelSnapshot

Quando você configura um modelo sem usar `modelProviders`, o Qwen Code cria automaticamente um RuntimeModelSnapshot para preservar sua configuração:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

O snapshot:

- Captura o ID do modelo, API key, base URL e configuração de geração
- Persiste entre sessões (armazenado em memória durante o runtime)
- Aparece na lista do comando `/model` como uma opção de runtime
- Pode ser alternado usando `/model $runtime|openai|my-custom-model`

### Principais diferenças

| Aspecto                  | Modelo de Provedor                    | Modelo de Runtime                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Fonte de configuração    | `modelProviders` nas configurações      | Camadas CLI, env, configurações                  |
| Atomicidade da configuração | Pacote completo e impermeável     | Em camadas, cada campo resolvido independentemente |
| Reutilização             | Sempre disponível na lista `/model` | Capturado como snapshot, aparece se completo  |
| Compartilhamento em equipe            | Sim (via configurações commitadas)      | Não (local do usuário)                            |
| Armazenamento de credenciais      | Referência apenas via `envKey`       | Pode capturar a key real no snapshot         |

### Quando usar cada um

- **Use Modelos de Provedor** quando: Você tem modelos padrão compartilhados em uma equipe, precisa de configurações consistentes ou quer evitar substituições acidentais
- **Use Modelos de Runtime** quando: Testar rapidamente um novo modelo, usar credenciais temporárias ou trabalhar com endpoints ad-hoc

## Persistência de Seleção e Recomendações

> [!important]
>
> Defina `modelProviders` no `settings.json` de escopo de usuário (`~/.qwen/settings.json`) sempre que possível e evite persistir substituições de credenciais em qualquer escopo. Manter o catálogo de provedores nas configurações do usuário evita conflitos de merge/substituição entre escopos de projeto e usuário e garante que as atualizações `/auth` e `/model` sempre gravem de volta em um escopo consistente.

- `/model` e `/auth` persistem `model.name` (quando aplicável) e `security.auth.selectedType` no escopo gravável mais próximo que já define `modelProviders`; caso contrário, fazem fallback para o escopo do usuário. Isso mantém os arquivos de workspace/usuário sincronizados com o catálogo de provedores ativo.
- Sem `modelProviders`, o resolvedor mistura as camadas CLI/env/configurações, criando Modelos de Runtime. Isso é aceitável para configurações de provedor único, mas trabalhoso ao alternar frequentemente. Defina catálogos de provedores sempre que fluxos de trabalho com múltiplos modelos forem comuns, para que as alternâncias permaneçam atômicas, com origem atribuída e depuráveis.