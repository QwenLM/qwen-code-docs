# Provedores de Modelos

O Qwen Code permite que você configure múltiplos provedores de modelos através da configuração `modelProviders` em seu `settings.json`. Isso possibilita alternar entre diferentes modelos e provedores de IA usando o comando `/model`.

## Visão Geral

Use `modelProviders` para declarar listas de modelos curadas por tipo de autenticação que o seletor `/model` pode alternar. As chaves devem ser tipos de autenticação válidos (`openai`, `anthropic`, `gemini`, `vertex-ai`, etc.). Cada entrada requer um `id` e **deve incluir `envKey`**, com campos opcionais `name`, `description`, `baseUrl` e `generationConfig`. As credenciais nunca são persistidas nas configurações; o tempo de execução as lê de `process.env[envKey]`. Os modelos OAuth da Qwen permanecem codificados e não podem ser substituídos.

> [!note]
> Apenas o comando `/model` expõe tipos de autenticação não padrão. Anthropic, Gemini, Vertex AI, etc., devem ser definidos via `modelProviders`. O comando `/auth` lista intencionalmente apenas os fluxos integrados de OAuth da Qwen e OpenAI.

> [!warning]
> **IDs de modelo duplicados dentro do mesmo authType:** Definir múltiplos modelos com o mesmo `id` sob um único `authType` (por exemplo, duas entradas com `"id": "gpt-4o"` em `openai`) atualmente não é suportado. Se houver duplicatas, **a primeira ocorrência prevalece** e as duplicatas subsequentes são ignoradas com um aviso. Observe que o campo `id` é usado tanto como identificador de configuração quanto como o nome real do modelo enviado à API, então usar IDs únicos (por exemplo, `gpt-4o-criativo`, `gpt-4o-equilibrado`) não é uma solução viável. Esta é uma limitação conhecida que pretendemos resolver em uma versão futura.

## Exemplos de Configuração por Tipo de Autenticação

A seguir estão exemplos abrangentes de configuração para diferentes tipos de autenticação, mostrando os parâmetros disponíveis e suas combinações.

### Tipos de Autenticação Suportados

As chaves do objeto `modelProviders` devem ser valores válidos de `authType`. Atualmente, os tipos de autenticação suportados são:

| Tipo de Autenticação | Descrição                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `openai`             | APIs compatíveis com OpenAI (OpenAI, Azure OpenAI, servidores de inferência locais como vLLM/Ollama) |
| `anthropic`          | API Anthropic Claude                                                                          |
| `gemini`             | API Google Gemini                                                                             |
| `vertex-ai`          | Google Vertex AI                                                                              |
| `qwen-oauth`         | Qwen OAuth (pré-definido, não pode ser substituído em `modelProviders`)                      |

> [!warning]
> Se uma chave de tipo de autenticação inválida for usada (por exemplo, um erro de digitação como `"openai-custom"`), a configuração será **ignorada silenciosamente** e os modelos não aparecerão no seletor `/model`. Sempre utilize um dos valores de tipo de autenticação suportados listados acima.

### SDKs Usadas para Requisições de API

O Qwen Code utiliza os seguintes SDKs oficiais para enviar requisições a cada provedor:

| Tipo de Autenticação   | Pacote SDK                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `openai`               | [`openai`](https://www.npmjs.com/package/openai) - SDK oficial do OpenAI para Node.js           |
| `anthropic`            | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK oficial do Anthropic |
| `gemini` / `vertex-ai` | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK oficial do Google GenAI    |
| `qwen-oauth`           | [`openai`](https://www.npmjs.com/package/openai) com provedor personalizado (compatível com DashScope) |

Isso significa que o `baseUrl` que você configurar deve ser compatível com o formato de API esperado pelo SDK correspondente. Por exemplo, ao usar o tipo de autenticação `openai`, o endpoint deve aceitar requisições no formato da API do OpenAI.

### Provedores compatíveis com OpenAI (`openai`)

Este tipo de autenticação suporta não apenas a API oficial da OpenAI, mas também qualquer endpoint compatível com OpenAI, incluindo provedores agregados de modelos como o OpenRouter.

```json
{
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

### Google Vertex AI (`vertex-ai`)

```json
{
  "modelProviders": {
    "vertex-ai": [
      {
        "id": "gemini-1.5-pro-vertex",
        "name": "Gemini 1.5 Pro (Vertex AI)",
        "envKey": "GOOGLE_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "generationConfig": {
          "timeout": 90000,
          "contextWindowSize": 2000000,
          "samplingParams": {
            "temperature": 0.2,
            "max_tokens": 8192
          }
        }
      }
    ]
  }
}
```

### Modelos auto-hospedados locais (via API compatível com OpenAI)

A maioria dos servidores de inferência locais (vLLM, Ollama, LM Studio, etc.) fornecem um endpoint de API compatível com OpenAI. Configure-os usando o tipo de autenticação `openai` com uma `baseUrl` local:

```json
{
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
        "name": "Modelo Local (LM Studio)",
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

Para servidores locais que não exigem autenticação, você pode usar qualquer valor fictício para a chave da API:

```bash

# Para Ollama (não é necessária autenticação)
export OLLAMA_API_KEY="ollama"

# Para vLLM (se nenhuma autenticação estiver configurada)
export VLLM_API_KEY="not-needed"
```

> [!note]
> O parâmetro `extra_body` **é suportado apenas para provedores compatíveis com OpenAI** (`openai`, `qwen-oauth`). Ele é ignorado para provedores Anthropic, Gemini e Vertex AI.

## Plano de Codificação Bailian

O Plano de Codificação Bailian fornece um conjunto pré-configurado de modelos Qwen otimizados para tarefas de codificação. Este recurso está disponível para usuários com acesso à API Bailian e oferece uma experiência de configuração simplificada com atualizações automáticas da configuração do modelo.

### Visão Geral

Quando você se autentica com uma chave de API do Bailian Coding Plan usando o comando `/auth`, o Qwen Code configura automaticamente os seguintes modelos:

| ID do Modelo           | Nome                 | Descrição                                           |
| ---------------------- | -------------------- | --------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Modelo avançado com raciocínio habilitado           |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Otimizado para tarefas de programação               |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Último modelo max com raciocínio habilitado         |

### Configuração

1. Obtenha uma chave de API do plano Bailian Coding:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **Internacional**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Execute o comando `/auth` no Qwen Code
3. Selecione o método de autenticação por API-KEY
4. Selecione sua região (China ou Global/Internacional)
5. Insira sua chave de API quando solicitado

Os modelos serão configurados automaticamente e adicionados ao seu seletor `/model`.

### Regiões

O Bailian Coding Plan suporta duas regiões:

| Região               | Endpoint                                        | Descrição                        |
| -------------------- | ----------------------------------------------- | -------------------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpoint para a China continental |
| Global/Internacional | `https://coding-intl.dashscope.aliyuncs.com/v1` | Endpoint internacional            |

A região é selecionada durante a autenticação e armazenada em `settings.json` sob `codingPlan.region`. Para alternar entre regiões, execute novamente o comando `/auth` e selecione uma região diferente.

### Armazenamento da Chave de API

Quando você configura o Coding Plan através do comando `/auth`, a chave de API é armazenada usando o nome de variável de ambiente reservado `BAILIAN_CODING_PLAN_API_KEY`. Por padrão, ela é armazenada no campo `settings.env` do seu arquivo `settings.json`.

> [!warning]
> **Recomendação de Segurança**: Para maior segurança, recomenda-se mover a chave de API do `settings.json` para um arquivo `.env` separado e carregá-la como uma variável de ambiente. Por exemplo:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=sua-chave-de-api-aqui
> ```
>
> Em seguida, certifique-se de adicionar este arquivo ao seu `.gitignore` se estiver usando configurações no nível do projeto.

### Atualizações Automáticas

As configurações do modelo Coding Plan são versionadas. Quando o Qwen Code detectar uma versão mais recente do modelo de template, você será solicitado a atualizar. Aceitar a atualização irá:

- Substituir as configurações existentes do modelo Coding Plan pelas versões mais recentes
- Preservar quaisquer configurações personalizadas de modelo que você tenha adicionado manualmente
- Alternar automaticamente para o primeiro modelo na configuração atualizada

O processo de atualização garante que você sempre tenha acesso às configurações e recursos mais recentes do modelo sem intervenção manual.

### Configuração Manual (Avançado)

Se você preferir configurar manualmente os modelos do Coding Plan, pode adicioná-los ao seu `settings.json` como qualquer provedor compatível com OpenAI:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder via Bailian Coding Plan",
        "envKey": "YOUR_CUSTOM_ENV_KEY",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
> Ao usar a configuração manual:

> - Você pode usar qualquer nome de variável de ambiente para `envKey`
> - Não é necessário configurar `codingPlan.*`
> - **Atualizações automáticas não serão aplicadas** aos modelos do Coding Plan configurados manualmente

> [!warning]
> Se você também usar a configuração automática do Coding Plan, atualizações automáticas podem sobrescrever suas configurações manuais se elas usarem o mesmo `envKey` e `baseUrl` da configuração automática. Para evitar isso, certifique-se de que sua configuração manual utilize um `envKey` diferente, se possível.

## Camadas de Resolução e Atomicidade

Os valores efetivos de autenticação/modelo/credenciais são escolhidos por campo usando a seguinte precedência (a primeira presente vence). Você pode combinar `--auth-type` com `--model` para apontar diretamente para uma entrada de provedor; essas flags da CLI são executadas antes das outras camadas.

| Camada (mais alta → mais baixa) | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Substituições programáticas      | `/auth`                             | entrada `/auth`                                 | entrada `/auth`                                     | entrada `/auth`                                      | —                      | —                                 |
| Seleção de provedor de modelo    | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| Argumentos da CLI                | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (ou equivalentes específicos do provedor) | `--openaiBaseUrl` (ou equivalentes específicos do provedor) | —                      | —                                 |
| Variáveis de ambiente            | —                                   | Mapeamento específico do provedor (ex: `OPENAI_MODEL`) | Mapeamento específico do provedor (ex: `OPENAI_API_KEY`) | Mapeamento específico do provedor (ex: `OPENAI_BASE_URL`) | —                      | —                                 |
| Configurações (`settings.json`)  | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Padrão / computado               | Retorna para `AuthType.QWEN_OAUTH`  | Padrão embutido (OpenAI ⇒ `qwen3-coder-plus`)   | —                                                   | —                                                    | —                      | `Config.getProxy()` se configurado |

\*Quando presentes, as flags de autenticação da CLI substituem as configurações. Caso contrário, `security.auth.selectedType` ou o padrão implícito determinam o tipo de autenticação. O Qwen OAuth e o OpenAI são os únicos tipos de autenticação disponíveis sem configuração adicional.

> [!warning]
> **Descontinuação de `security.auth.apiKey` e `security.auth.baseUrl`:** A configuração direta de credenciais de API via `security.auth.apiKey` e `security.auth.baseUrl` em `settings.json` está obsoleta. Essas configurações eram usadas em versões anteriores para credenciais inseridas pela interface gráfica, mas o fluxo de entrada de credenciais foi removido na versão 0.10.1. Esses campos serão completamente removidos em uma versão futura. **É fortemente recomendado migrar para `modelProviders`** para todas as configurações de modelo e credenciais. Use `envKey` em `modelProviders` para referenciar variáveis de ambiente para gerenciamento seguro de credenciais em vez de codificar credenciais nos arquivos de configuração.

## Camadas de Configuração de Geração: A Camada Provedora Impermeável

A resolução da configuração segue um modelo de camadas estrito com uma regra crucial: **a camada modelProvider é impermeável**.

### Como funciona

1. **Quando um modelo modelProvider ESTÁ selecionado** (por exemplo, via comando `/model` escolhendo um modelo configurado pelo provedor):
   - Todo o `generationConfig` do provedor é aplicado **atomicamente**
   - **A camada do provedor é completamente impermeável** — camadas inferiores (CLI, env, configurações) não participam da resolução do generationConfig
   - Todos os campos definidos em `modelProviders[].generationConfig` usam os valores do provedor
   - Todos os campos **não definidos** pelo provedor são definidos como `undefined` (não herdados das configurações)
   - Isso garante que as configurações do provedor atuem como um "pacote selado" completo e autossuficiente

2. **Quando NENHUM modelo modelProvider está selecionado** (por exemplo, usando `--model` com um ID de modelo bruto, ou usando CLI/env/configurações diretamente):
   - A resolução cai para as camadas inferiores
   - Os campos são preenchidos de CLI → env → configurações → padrões
   - Isso cria um **Modelo de Runtime** (veja a próxima seção)

### Precedência por campo para `generationConfig`

| Prioridade | Origem                                        | Comportamento                                                                                             |
| ---------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1          | Substituições programáticas                   | Alterações em tempo de execução em `/model`, `/auth`                                                      |
| 2          | `modelProviders[authType][].generationConfig` | **Camada impermeável** - substitui completamente todos os campos de generationConfig; camadas inferiores não participam |
| 3          | `settings.model.generationConfig`             | Utilizado apenas para **Modelos em Tempo de Execução** (quando nenhum modelo provedor está selecionado) |
| 4          | Padrões do gerador de conteúdo                | Padrões específicos do provedor (por exemplo, OpenAI vs Gemini) - apenas para Modelos em Tempo de Execução |

### Tratamento de campo atômico

Os seguintes campos são tratados como objetos atômicos - os valores do provedor substituem completamente o objeto inteiro, nenhuma mesclagem ocorre:

- `samplingParams` - Temperature, top_p, max_tokens, etc.
- `customHeaders` - Cabeçalhos HTTP personalizados
- `extra_body` - Parâmetros extras do corpo da requisição

### Exemplo

```json
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

Quando `gpt-4o` é selecionado de modelProviders:

- `timeout` = 60000 (do provedor, substitui as configurações)
- `samplingParams.temperature` = 0.2 (do provedor, substitui completamente o objeto de configurações)
- `samplingParams.max_tokens` = **indefinido** (não definido no provedor, e a camada do provedor não herda das configurações — os campos são explicitamente definidos como indefinidos se não forem fornecidos)

Ao usar um modelo bruto via `--model gpt-4` (não de modelProviders, cria um Modelo de Execução):

- `timeout` = 30000 (das configurações)
- `samplingParams.temperature` = 0.5 (das configurações)
- `samplingParams.max_tokens` = 1000 (das configurações)

A estratégia de mesclagem para `modelProviders` em si é SUBSTITUIR: todo o `modelProviders` das configurações do projeto substituirá a seção correspondente nas configurações do usuário, em vez de mesclar os dois.

## Modelos de Provedor vs Modelos de Execução

O Qwen Code distingue entre dois tipos de configurações de modelo:

### Modelo de Provedor

- Definido na configuração `modelProviders`
- Possui um pacote completo e atômico de configuração
- Quando selecionado, sua configuração é aplicada como uma camada impermeável
- Aparece na lista do comando `/model` com metadados completos (nome, descrição, capacidades)
- Recomendado para fluxos de trabalho com múltiplos modelos e consistência em equipe

### Modelo de Execução

- Criado dinamicamente ao usar IDs de modelo brutos via CLI (`--model`), variáveis de ambiente ou configurações
- Não definido em `modelProviders`
- A configuração é construída por meio de "projeção" através das camadas de resolução (CLI → env → configurações → padrões)
- Capturado automaticamente como um **RuntimeModelSnapshot** quando uma configuração completa é detectada
- Permite reutilização sem precisar reinserir credenciais

### Ciclo de vida do RuntimeModelSnapshot

Quando você configura um modelo sem usar `modelProviders`, o Qwen Code cria automaticamente um RuntimeModelSnapshot para preservar sua configuração:

```bash

# Isso cria um RuntimeModelSnapshot com ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

O snapshot:

- Captura o ID do modelo, chave de API, URL base e configuração de geração
- Persiste entre sessões (armazenado na memória durante a execução)
- Aparece na lista do comando `/model` como uma opção de tempo de execução
- Pode ser alternado usando `/model $runtime|openai|my-custom-model`

### Principais diferenças

| Aspecto                 | Modelo de Provedor                | Modelo de Tempo de Execução                |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Fonte de configuração   | `modelProviders` nas configurações | CLI, ambiente, camadas de configurações    |
| Atomicidade da configuração | Pacote completo e impermeável   | Camadas, cada campo resolvido independentemente |
| Reutilização            | Sempre disponível na lista `/model` | Capturado como instantâneo, aparece se completo |
| Compartilhamento em equipe | Sim (via configurações commitadas) | Não (local ao usuário)                     |
| Armazenamento de credenciais | Referência apenas via `envKey` | Pode capturar a chave real no instantâneo  |

### Quando usar cada um

- **Use Modelos de Provedor** quando: Você tem modelos padrão compartilhados entre uma equipe, precisa de configurações consistentes ou deseja evitar substituições acidentais
- **Use Modelos de Execução** quando: Testar rapidamente um novo modelo, usar credenciais temporárias ou trabalhar com endpoints ad-hoc

## Persistência de Seleção e Recomendações

> [!important]
> Defina `modelProviders` no escopo do usuário em `~/.qwen/settings.json` sempre que possível e evite persistir substituições de credenciais em qualquer escopo. Manter o catálogo de provedores nas configurações do usuário evita conflitos de mesclagem/substituição entre os escopos de projeto e usuário e garante que atualizações de `/auth` e `/model` sejam sempre gravadas de volta para um escopo consistente.

- `/model` e `/auth` persistem `model.name` (quando aplicável) e `security.auth.selectedType` no escopo gravável mais próximo que já define `modelProviders`; caso contrário, recorrem ao escopo do usuário. Isso mantém os arquivos de workspace/usuário sincronizados com o catálogo de provedores ativo.
- Sem `modelProviders`, o resolvedor mistura camadas CLI/env/configurações, criando Modelos de Execução. Isso é aceitável para configurações de único provedor, mas trabalhoso quando há trocas frequentes. Defina catálogos de provedores sempre que fluxos de trabalho com múltiplos modelos forem comuns, para que as trocas permaneçam atômicas, atribuídas por fonte e depuráveis.