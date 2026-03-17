# Provedores de Modelos

O Qwen Code permite configurar vários provedores de modelos por meio da configuração `modelProviders` no seu arquivo `settings.json`. Isso permite alternar entre diferentes modelos de IA e provedores usando o comando `/model`.

## Visão geral

Use `modelProviders` para declarar listas de modelos curadas por tipo de autenticação, entre as quais o seletor `/model` pode alternar. As chaves devem ser tipos de autenticação válidos (`openai`, `anthropic`, `gemini`, etc.). Cada entrada exige um `id` e **deve incluir `envKey`**, com campos opcionais `name`, `description`, `baseUrl` e `generationConfig`. As credenciais nunca são persistidas nas configurações; o tempo de execução lê-as de `process.env[envKey]`. Os modelos OAuth do Qwen permanecem codificados diretamente e não podem ser substituídos.

> [!note]
>
> Apenas o comando `/model` expõe tipos de autenticação não padrão. Anthropic, Gemini etc. devem ser definidos via `modelProviders`. O comando `/auth` lista o OAuth do Qwen, o Plano de Codificação da Alibaba Cloud e a chave de API como opções de autenticação internas.

> [!warning]
>
> **IDs de modelo duplicadas dentro do mesmo `authType`:** Definir vários modelos com o mesmo `id` sob um único `authType` (por exemplo, duas entradas com `"id": "gpt-4o"` em `openai`) atualmente não é suportado. Se houver duplicatas, **a primeira ocorrência prevalece**, e as ocorrências subsequentes são ignoradas com um aviso. Observe que o campo `id` é usado tanto como identificador de configuração quanto como nome real do modelo enviado à API; portanto, usar IDs únicos (por exemplo, `gpt-4o-creative`, `gpt-4o-balanced`) não é uma solução viável. Trata-se de uma limitação conhecida que planejamos resolver em uma versão futura.

## Exemplos de Configuração por Tipo de Autenticação

Abaixo estão exemplos abrangentes de configuração para diferentes tipos de autenticação, mostrando os parâmetros disponíveis e suas combinações.

### Tipos de Autenticação Suportados

As chaves do objeto `modelProviders` devem ser valores válidos de `authType`. Atualmente, os tipos de autenticação suportados são:

| Tipo de Autenticação | Descrição                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `openai`              | APIs compatíveis com OpenAI (OpenAI, Azure OpenAI, servidores locais de inferência como vLLM/Ollama) |
| `anthropic`           | API Anthropic Claude                                                                            |
| `gemini`              | API Google Gemini                                                                               |
| `qwen-oauth`          | OAuth Qwen (codificado diretamente, não pode ser substituído em `modelProviders`)               |

> [!warning]
> Se uma chave inválida de tipo de autenticação for usada (por exemplo, um erro de digitação como `"openai-custom"`), a configuração será **ignorada silenciosamente**, e os modelos não aparecerão no seletor `/model`. Sempre use um dos valores de tipo de autenticação suportados listados acima.

### SDKs usados para requisições à API

O Qwen Code usa os seguintes SDKs oficiais para enviar requisições a cada provedor:

| Tipo de Autenticação | Pacote do SDK                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `openai`              | [`openai`](https://www.npmjs.com/package/openai) — SDK oficial do OpenAI para Node.js             |
| `anthropic`           | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) — SDK oficial da Anthropic |
| `gemini`              | [`@google/genai`](https://www.npmjs.com/package/@google/genai) — SDK oficial do Google GenAI       |
| `qwen-oauth`          | [`openai`](https://www.npmjs.com/package/openai) com provedor personalizado (compatível com DashScope) |

Isso significa que a URL base (`baseUrl`) que você configurar deve ser compatível com o formato de API esperado pelo SDK correspondente. Por exemplo, ao usar o tipo de autenticação `openai`, o endpoint deve aceitar requisições no formato da API do OpenAI.

### Provedores compatíveis com OpenAI (`openai`)

Esse tipo de autenticação suporta não apenas a API oficial da OpenAI, mas também qualquer endpoint compatível com OpenAI, incluindo provedores agregados de modelos como o OpenRouter.

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

### Modelos Auto-hospedados Localmente (via API compatível com OpenAI)

A maioria dos servidores locais de inferência (vLLM, Ollama, LM Studio, etc.) fornece um endpoint de API compatível com OpenAI. Configure-os usando o tipo de autenticação `openai` com um `baseUrl` local:

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

# Para Ollama (sem autenticação necessária)
export OLLAMA_API_KEY="ollama"

# Para vLLM (se nenhuma autenticação estiver configurada)
export VLLM_API_KEY="não-necessária"
```

> [!note]
>
> O parâmetro `extra_body` é **suportado apenas por provedores compatíveis com OpenAI** (`openai`, `qwen-oauth`). Ele é ignorado pelos provedores Anthropic e Gemini.

## Plano de Codificação da Alibaba Cloud

O Plano de Codificação da Alibaba Cloud fornece um conjunto pré-configurado de modelos Qwen otimizados para tarefas de programação. Esse recurso está disponível para usuários com acesso à API do Plano de Codificação da Alibaba Cloud e oferece uma experiência de configuração simplificada, com atualizações automáticas da configuração dos modelos.

### Visão geral

Quando você se autentica com uma chave de API do Alibaba Cloud Coding Plan usando o comando `/auth`, o Qwen Code configura automaticamente os seguintes modelos:

| ID do modelo           | Nome                 | Descrição                              |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Modelo avançado com raciocínio habilitado |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Otimizado para tarefas de programação |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Versão mais recente do modelo max com raciocínio habilitado |

### Configuração

1. Obtenha uma chave de API do Alibaba Cloud Coding Plan:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **Internacional**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Execute o comando `/auth` no Qwen Code
3. Selecione **Alibaba Cloud Coding Plan**
4. Selecione sua região
5. Insira sua chave de API quando solicitado

Os modelos serão configurados automaticamente e adicionados ao seu seletor `/model`.

### Regiões

O Alibaba Cloud Coding Plan suporta duas regiões:

| Região               | Endpoint                                        | Descrição                    |
| -------------------- | ----------------------------------------------- | ---------------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpoint para a China continental |
| Global/Internacional | `https://coding-intl.dashscope.aliyuncs.com/v1` | Endpoint internacional       |

A região é selecionada durante a autenticação e armazenada em `settings.json`, na chave `codingPlan.region`. Para alternar entre regiões, execute novamente o comando `/auth` e selecione uma região diferente.

### Armazenamento da Chave de API

Ao configurar o Coding Plan por meio do comando `/auth`, a chave de API é armazenada usando o nome de variável de ambiente reservado `BAILIAN_CODING_PLAN_API_KEY`. Por padrão, ela é armazenada no campo `env` do seu arquivo `settings.json`.

> [!warning]
>
> **Recomendação de Segurança**: Para maior segurança, recomenda-se mover a chave de API do arquivo `settings.json` para um arquivo `.env` separado e carregá-la como uma variável de ambiente. Por exemplo:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=sua-chave-de-api-aqui
> ```
>
> Em seguida, certifique-se de adicionar esse arquivo ao seu `.gitignore`, caso você esteja usando configurações no nível do projeto.

### Atualizações Automáticas

As configurações do modelo de Plano de Codificação são versionadas. Quando o Qwen Code detecta uma versão mais recente do modelo, você será solicitado a atualizá-lo. Ao aceitar a atualização, ocorrerá o seguinte:

- As configurações existentes do modelo de Plano de Codificação serão substituídas pelas versões mais recentes  
- Quaisquer configurações personalizadas de modelo que você tenha adicionado manualmente serão preservadas  
- A mudança será feita automaticamente para o primeiro modelo na configuração atualizada  

O processo de atualização garante que você sempre tenha acesso às configurações e recursos mais recentes dos modelos, sem necessidade de intervenção manual.

### Configuração Manual (Avançado)

Se preferir configurar manualmente os modelos do Coding Plan, você pode adicioná-los ao seu arquivo `settings.json`, assim como faria com qualquer provedor compatível com OpenAI:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder via Coding Plan da Alibaba Cloud",
        "envKey": "SEU_NOME_DE_VARIAVEL_DE_AMBIENTE_PERSONALIZADO",
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
> - Não é necessário configurar `codingPlan.*`
> - **Atualizações automáticas não serão aplicadas** a modelos do Coding Plan configurados manualmente

> [!warning]
>
> Se você também usar a configuração automática do Coding Plan, as atualizações automáticas poderão sobrescrever suas configurações manuais caso elas utilizem a mesma `envKey` e o mesmo `baseUrl` da configuração automática. Para evitar isso, certifique-se de que sua configuração manual utilize uma `envKey` diferente, sempre que possível.

## Camadas de Resolução e Atomicidade

Os valores efetivos de autenticação, modelo e credenciais são escolhidos por campo usando a seguinte ordem de precedência (o primeiro valor presente é utilizado). É possível combinar `--auth-type` com `--model` para apontar diretamente a uma entrada de provedor; essas flags da CLI são processadas antes das demais camadas.

| Camada (mais alta → mais baixa) | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| ------------------------------ | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Substituições programáticas      | `/auth`                             | Entrada de `/auth`                              | Entrada de `/auth`                                  | Entrada de `/auth`                                   | —                      | —                                 |
| Seleção do provedor de modelo    | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| Argumentos da CLI                | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (ou equivalentes específicos do provedor) | `--openaiBaseUrl` (ou equivalentes específicos do provedor) | —                      | —                                 |
| Variáveis de ambiente            | —                                   | Mapeamento específico do provedor (ex.: `OPENAI_MODEL`) | Mapeamento específico do provedor (ex.: `OPENAI_API_KEY`) | Mapeamento específico do provedor (ex.: `OPENAI_BASE_URL`) | —                      | —                                 |
| Configurações (`settings.json`)  | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Valor padrão / calculado         | Usa `AuthType.QWEN_OAUTH` como fallback | Valor padrão embutido (OpenAI ⇒ `qwen3-coder-plus`) | —                                                   | —                                                    | —                      | `Config.getProxy()` se configurado |

\*Quando presentes, as flags de autenticação da CLI substituem as configurações. Caso contrário, o tipo de autenticação é determinado por `security.auth.selectedType` ou pelo valor padrão implícito. Qwen OAuth e OpenAI são os únicos tipos de autenticação disponíveis sem necessidade de configuração adicional.

> [!warning]
>
> **Depreciação de `security.auth.apiKey` e `security.auth.baseUrl`:** A configuração direta de credenciais de API via `security.auth.apiKey` e `security.auth.baseUrl` em `settings.json` está obsoleta. Essas configurações eram usadas em versões anteriores para credenciais inseridas pela interface gráfica, mas o fluxo de entrada de credenciais foi removido na versão 0.10.1. Esses campos serão totalmente removidos em uma versão futura. **Recomenda-se fortemente migrar para `modelProviders`** para todas as configurações de modelos e credenciais. Use `envKey` em `modelProviders` para referenciar variáveis de ambiente, garantindo um gerenciamento seguro de credenciais, em vez de codificá-las diretamente nos arquivos de configuração.

## Camadas de Configuração de Geração: A Camada do Provedor Impermeável

A resolução de configuração segue um modelo estrito de camadas com uma regra crucial: **a camada `modelProvider` é impermeável**.

### Como funciona

1. **Quando um modelo de `modelProvider` É selecionado** (por exemplo, usando o comando `/model` para escolher um modelo configurado no provedor):
   - Toda a `generationConfig` do provedor é aplicada **atomicamente**
   - **A camada do provedor é completamente impermeável** — camadas inferiores (CLI, variáveis de ambiente, configurações) não participam de forma alguma na resolução da `generationConfig`
   - Todos os campos definidos em `modelProviders[].generationConfig` usam os valores do provedor
   - Todos os campos **não definidos** pelo provedor são definidos como `undefined` (não são herdados das configurações)
   - Isso garante que as configurações do provedor atuem como um “pacote selado” completo e autossuficiente

2. **Quando NENHUM modelo de `modelProvider` é selecionado** (por exemplo, usando `--model` com um ID de modelo bruto, ou usando CLI/variáveis de ambiente/configurações diretamente):
   - A resolução “desce” para as camadas inferiores
   - Os campos são preenchidos na ordem: CLI → variáveis de ambiente → configurações → valores padrão
   - Isso cria um **Modelo em Tempo de Execução** (veja a próxima seção)

### Precedência por campo para `generationConfig`

| Prioridade | Origem                                                | Comportamento                                                                                                                              |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1          | Substituições programáticas                           | Alterações em tempo de execução nas rotas `/model` e `/auth`                                                                               |
| 2          | `modelProviders[authType][].generationConfig`         | **Camada impermeável** — substitui completamente todos os campos de `generationConfig`; camadas inferiores não participam                  |
| 3          | `settings.model.generationConfig`                     | Usado apenas para **Modelos em Tempo de Execução** (quando nenhum modelo do provedor está selecionado)                                    |
| 4          | Valores padrão do gerador de conteúdo                 | Valores padrão específicos do provedor (por exemplo, OpenAI vs Gemini) — aplicáveis apenas a Modelos em Tempo de Execução                |

### Tratamento de campos atômicos

Os seguintes campos são tratados como objetos atômicos — os valores fornecidos substituem completamente o objeto inteiro; nenhuma mesclagem ocorre:

- `samplingParams` — Temperatura, `top_p`, `max_tokens`, etc.
- `customHeaders` — Cabeçalhos HTTP personalizados
- `extra_body` — Parâmetros adicionais no corpo da requisição

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

Quando `gpt-4o` é selecionado a partir de `modelProviders`:

- `timeout` = 60000 (do provedor, substitui as configurações)
- `samplingParams.temperature` = 0.2 (do provedor, substitui completamente o objeto de configurações)
- `samplingParams.max_tokens` = **indefinido** (não definido no provedor, e a camada de provedor não herda das configurações — os campos são explicitamente definidos como indefinidos se não forem fornecidos)

Ao usar um modelo bruto via `--model gpt-4` (não proveniente de `modelProviders`, cria um Modelo em Tempo de Execução):

- `timeout` = 30000 (das configurações)
- `samplingParams.temperature` = 0.5 (das configurações)
- `samplingParams.max_tokens` = 1000 (das configurações)

A estratégia de mesclagem para `modelProviders` em si é SUBSTITUIR: toda a seção `modelProviders` das configurações do projeto substituirá a seção correspondente nas configurações do usuário, em vez de mesclar as duas.

## Modelos do Provedor vs Modelos de Tempo de Execução

O Qwen Code distingue entre dois tipos de configurações de modelo:

### Modelo do Provedor

- Definido na configuração `modelProviders`
- Possui um pacote de configuração completo e atômico
- Quando selecionado, sua configuração é aplicada como uma camada impermeável
- Aparece na lista de comandos `/model` com metadados completos (nome, descrição, capacidades)
- Recomendado para fluxos de trabalho com múltiplos modelos e consistência em equipes

### Modelo de Tempo de Execução

- Criado dinamicamente ao usar IDs de modelo brutos via CLI (`--model`), variáveis de ambiente ou configurações
- Não definido em `modelProviders`
- A configuração é construída por "projeção" através das camadas de resolução (CLI → ambiente → configurações → padrões)
- Capturado automaticamente como um **RuntimeModelSnapshot** quando uma configuração completa é detectada
- Permite reutilização sem precisar inserir novamente as credenciais

### Ciclo de vida do RuntimeModelSnapshot

Quando você configura um modelo sem usar `modelProviders`, o Qwen Code cria automaticamente um RuntimeModelSnapshot para preservar sua configuração:

```bash

# Isso cria um RuntimeModelSnapshot com ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

O snapshot:

- Captura o ID do modelo, a chave de API, a URL base e a configuração de geração
- Persiste entre sessões (armazenado na memória durante a execução)
- Aparece na lista de comandos `/model` como uma opção de tempo de execução
- Pode ser selecionado usando `/model $runtime|openai|my-custom-model`

### Principais diferenças

| Aspecto                   | Modelo de Provedor                     | Modelo de Execução                              |
| ------------------------- | -------------------------------------- | ----------------------------------------------- |
| Origem da configuração    | `modelProviders` nas configurações     | CLI, variáveis de ambiente, camadas de configurações |
| Atomicidade da configuração | Pacote completo e impermeável         | Camadas, cada campo resolvido independentemente |
| Reutilização              | Sempre disponível na lista `/model`    | Capturado como instantâneo; aparece apenas se completo |
| Compartilhamento em equipe | Sim (por meio de configurações confirmadas) | Não (local ao usuário)                          |
| Armazenamento de credenciais | Referência apenas via `envKey`        | Pode capturar a chave real no instantâneo       |

### Quando usar cada um

- **Use Modelos Provedores** quando: você tiver modelos padrão compartilhados entre uma equipe, precisar de configurações consistentes ou quiser evitar substituições acidentais  
- **Use Modelos em Tempo de Execução** quando: estiver testando rapidamente um novo modelo, usando credenciais temporárias ou trabalhando com endpoints ad hoc

## Persistência de Seleção e Recomendações

> [!important]
>
> Defina `modelProviders` no arquivo `~/.qwen/settings.json` no escopo do usuário sempre que possível e evite persistir substituições de credenciais em qualquer escopo. Manter o catálogo de provedores nas configurações do usuário evita conflitos de mesclagem/substituição entre os escopos de projeto e de usuário, garantindo que as atualizações de `/auth` e `/model` sejam sempre gravadas de volta em um escopo consistente.

- `/model` e `/auth` persistem `model.name` (quando aplicável) e `security.auth.selectedType` no escopo gravável mais próximo que já defina `modelProviders`; caso contrário, recorrem ao escopo do usuário. Isso mantém os arquivos do workspace/usuário sincronizados com o catálogo de provedores ativo.
- Sem `modelProviders`, o resolvedor mistura as camadas da CLI, de variáveis de ambiente e de configurações, criando Modelos em Tempo de Execução. Isso é aceitável em configurações com um único provedor, mas inconveniente ao alternar frequentemente entre provedores. Defina catálogos de provedores sempre que fluxos de trabalho com múltiplos modelos forem comuns, para que as alternâncias permaneçam atômicas, atribuídas à sua origem e depuráveis.