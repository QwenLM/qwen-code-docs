# Provedores de Modelos

O Qwen Code permite configurar vários provedores de modelos por meio da configuração `modelProviders` no seu `settings.json`. Isso permite alternar entre diferentes modelos e provedores de IA usando o comando `/model`.

## Visão Geral

Use `modelProviders` para declarar modelos por ID de provedor que o seletor `/model` pode alternar. Cada chave é um ID de provedor e seu valor é **um array de definições de modelo** (`ModelConfig[]`). Para provedores integrados, a chave deve ser um tipo de autenticação válido (`openai`, `anthropic`, `gemini`, `vertex-ai`); um ID de provedor personalizado (por exemplo, `idealab`) é permitido desde que você o mapeie para um protocolo através da configuração de nível superior [`providerProtocol`](#custom-provider-ids-providerprotocol). Cada entrada de modelo requer um `id`; `envKey` é **opcional e recomendado** (quando omitido, recua para a chave de env padrão do tipo de autenticação, por exemplo, `OPENAI_API_KEY` para `openai`), com `name`, `description`, `baseUrl` e `generationConfig` opcionais. As credenciais nunca são persistidas nas configurações; o tempo de execução as lê de `process.env[envKey]`. Os modelos Qwen OAuth gratuitos legados permanecem codificados rigidamente e não podem ser substituídos.

> [!note]
>
> Previews anteriores envolviam os modelos de cada provedor em um objeto `{ "protocol": ..., "models": [...] }`. Esse formato foi revertido — o valor atual é o array `ModelConfig[]` puro mostrado ao longo desta página. Uma entrada envolvida em um arquivo de configurações já migrado (`$version: 4`) é ignorada silenciosamente, então atualize quaisquer configurações antigas para o formato de array.

> [!note]
>
> Configure provedores de chave de API através de `modelProviders`, então selecione-os com `/model`. Para entrar na conta Qwen, escolha [**Conta Qwen com Assinatura**](https://chat.qwen.ai/?memberPlan=qwen_code) em `/auth`; nenhuma chave de API ou configuração manual de `modelProviders` é necessária. Use `/model` para escolher entre os modelos disponíveis com sua assinatura. Veja [Autenticação](./auth.md) para instruções de login.

> [!note]
>
> **Unicidade do Modelo:** Os modelos são identificados pelo seu protocolo de API efetivo, `id`, e `baseUrl` configurado. Você pode definir o mesmo modelo e URL com ambos `wireApi: "chat-completions"` e `wireApi: "responses"`, ou usar URLs diferentes para o mesmo modelo e API. Se as entradas compartilharem todos os três valores, a primeira ocorrência vence e duplicatas subsequentes são ignoradas com um aviso.

> [!note]
>
> **Recarga dinâmica vs. reinicialização:** Edições `modelProviders` em `settings.json` são detectadas por uma sessão interativa em execução sem reinicialização (o observador de arquivos tem um debounce de ~300ms; reabra `/model` para ver novas entradas, a seleção atual é mantida). Alterar o `wireApi` do modelo ativo cria uma rota diferente; selecione essa rota explicitamente ou reinicie para usá-la. Edições de API inválidas deixam o registro anterior utilizável. `providerProtocol` é lido uma vez na inicialização e **requer uma reinicialização**.

### Rotas de geração de imagens

Defina `supportsImageGeneration: true` quando uma rota puder ser usada pela ferramenta `image_gen` integrada. Essa capacidade é independente do suporte à entrada de imagens, como `capabilities.vision` ou `generationConfig.modalities.image`.

Use `imageOnly: true` quando a rota for dedicada à geração de imagens e não dever aparecer nos seletores de modelos comuns. Para compatibilidade com versões anteriores, `imageOnly: true` também implica capacidade de geração de imagens, portanto, as configurações existentes não precisam ser migradas.

Uma rota de função dupla pode ser selecionada tanto como o modelo principal quanto através de `/model --image`:

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

Uma rota de imagem dedicada define ambos os campos. A forma legada com apenas `imageOnly: true` permanece válida:

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

A rota selecionada deve declarar um `baseUrl` HTTPS explícito e um `envKey` não vazio. A geração de imagens usa o mesmo endpoint e credencial da rota; se chat e geração de imagens exigirem endpoints ou credenciais diferentes, configure duas rotas em vez disso.

### Rotas Live Voice

Defina `realtimeOnly: true` em uma rota que fala o protocolo DashScope Realtime (voz para voz). Tal rota nunca é oferecida como modelo de chat, rápido, visão, voz ou imagem; ela só pode ser escolhida como o modelo Live Voice através de `experimental.liveVoice.model` (um `modelId`, ou `provider:modelId` quando o mesmo id existe sob mais de um provedor).

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.5-omni-plus-realtime",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY",
        "realtimeOnly": true
      }
    ]
  },
  "experimental": {
    "liveVoice": {
      "enabled": true,
      "model": "qwen3.5-omni-plus-realtime",
      "voice": "Tina"
    }
  }
}
```

Quando o modelo selecionado nomeia uma rota `realtimeOnly`, o Live Voice lê a chave de API através do `envKey` da rota (primeiro o ambiente do processo, depois o bloco `env` de `settings.json`) e deriva o endpoint WebSocket do seu `baseUrl` (`https://<host>/compatible-mode/v1` torna-se `wss://<host>/api-ws/v1/realtime`). A rota deve declarar tanto `baseUrl` quanto `envKey`, e o host deve ser um endpoint DashScope.

Duas regras são deliberadas:

- As configurações do workspace nunca são consultadas, apenas as de nível de usuário e sistema. O `.qwen/settings.json` de um projeto não pode adicionar ou redirecionar uma rota Live Voice.
- Um `modelId` **simples** que não corresponde a nenhuma rota `realtimeOnly` usa os campos independentes `experimental.liveVoice.endpoint` e `experimental.liveVoice.apiKey` como antes, então as configurações existentes continuam funcionando inalteradas. Um seletor `provider:modelId` cujo provedor existe mas não possui tal rota é um erro: uma rota excluída ou digitada incorretamente nunca recorre silenciosamente a uma chave armazenada.
- Enquanto uma rota está selecionada, `experimental.liveVoice.apiKey` e `experimental.liveVoice.endpoint` não são usados, e a API de configuração se recusa a armazenar novos valores.

No caminho independente, as configurações Qwen Live do Web Shell definem o endpoint e o modelo diretamente. Digite a URL base compatível com OpenAI da região ou domínio dedicado ao qual sua chave pertence, como `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`; deixado vazio, o Live usa Pequim (`https://dashscope.aliyuncs.com/compatible-mode/v1`), e uma chave de outro lugar é rejeitada com `401`. A URL base é armazenada conforme digitada e convertida para `wss://<host>/api-ws/v1/realtime` quando uma chamada inicia; o host deve ser um endpoint DashScope ou `*.maas.aliyuncs.com`. Enquanto o Live Voice está ativo, um novo endpoint é verificado com um handshake Realtime antes de ser salvo.

## Substituir capacidades de raciocínio [#override-reasoning-capabilities]

Defina `capabilities.reasoning` em uma entrada de modelo para substituir seu formato de raciocínio, níveis de esforço oferecidos e padrão. Modelos conhecidos herdam campos omitidos do catálogo do provedor no endpoint selecionado; por exemplo, `"capabilities": { "reasoning": { "defaultEffort": "medium" } }` faz uma rota `qwen3.8-max` DashScope usar médio quando nenhum esforço explícito é selecionado. Para um alias desconhecido, declare todos os três campos:

```json
{
  "id": "company-model-v2",
  "baseUrl": "https://gateway.example.com/v1",
  "envKey": "COMPANY_MODEL_API_KEY",
  "capabilities": {
    "reasoning": {
      "profile": "openai-effort",
      "efforts": ["low", "medium", "high"],
      "defaultEffort": "medium"
    }
  }
}
```

`efforts` substitui o subconjunto suportado de `low/medium/high/xhigh/max`. Um padrão explícito deve pertencer a esse subconjunto. Os perfis reutilizam formatos existentes: Chat aceita `openai-effort`, `openai-reasoning`, `deepseek-openai`, `dashscope-effort`, `dashscope-thinking` e `qwen-chat-template`; Responses aceita `openai-reasoning`; Anthropic aceita `anthropic-manual`, `anthropic-adaptive` e `deepseek-anthropic`; Gemini/Vertex usa `gemini`. Os dois perfis somente de alternância omitem `efforts` e `defaultEffort`. O Gemini usa baixo/médio/alto. Um perfil adaptativo seleciona pensamento adaptativo mesmo quando um orçamento manual legado está configurado. Declarações completas de capacidades existentes continuam funcionando.

Alterações de raciocínio aplicam-se antes do próximo prompt do usuário. Suas solicitações, tentativas e agentes filhos compartilham a configuração de raciocínio capturada. Atualizações inválidas retêm a configuração anterior e registram o erro de modelo/campo. Declarações inválidas em novas sessões recorrem com segurança ao comportamento existente do modelo. Escolhas explícitas do usuário e substituições nativas do provedor em `reasoning`, `samplingParams` e `extra_body` mantêm sua precedência existente; um padrão de modelo não é salvo como escolha do usuário. Este mecanismo não altera os ciclos de vida de endpoint, credencial ou modelo de imagem.

## Exemplos de Configuração por Tipo de Autenticação

Abaixo estão exemplos abrangentes de configuração para diferentes tipos de autenticação, mostrando os parâmetros disponíveis e suas combinações.

### Tipos de Autenticação Suportados

Use um dos ids de provedor integrados abaixo, ou mapeie um id personalizado com `providerProtocol`:

| Protocolo efetivo | Descrição                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`           | APIs compatíveis com OpenAI. Padrão para Chat Completions; defina o `wireApi` de um modelo para `responses` para a API Responses.                             |
| `anthropic`        | API Anthropic Claude                                                                                                                            |
| `gemini`     | API Google Gemini                                                                                                                               |
| `vertex-ai`  | Google Vertex AI (usa o protocolo `gemini` e o SDK `@google/genai` no modo Vertex AI; selecioná-lo define `GOOGLE_GENAI_USE_VERTEXAI=true`)     |

> [!note]
> Entradas do Vertex AI podem autenticar com **Application Default Credentials**. Defina `GOOGLE_CLOUD_PROJECT` (e opcionalmente `GOOGLE_CLOUD_LOCATION`, cujo padrão é `global`) e deixe `envKey` não definido, junto com todas as outras fontes de chave que o resolvedor lê: `GOOGLE_API_KEY`, `settings.security.auth.apiKey` e as flags de CLI de chave. Qualquer valor de chave de API que chegue a uma entrada do Vertex ativa o modo Vertex Express do SDK Google, que ignora o projeto, a localização e suas credenciais ADC. Uma entrada que declara um `envKey` nunca é roteada para ADC, então uma chave que falhe ao ser injetada continuará falhando nessa variável em vez de autenticar silenciosamente como um principal diferente.

> [!warning]
> Um id de provedor que não seja nem um protocolo integrado nem mapeado via `providerProtocol` (por exemplo, um erro de digitação como `"openai-custom"`) não pode ser roteado, então sua entrada inteira é **ignorada** com um aviso — seus modelos simplesmente não aparecerão no seletor `/model`. Use um dos valores de tipo de autenticação suportados acima para provedores integrados, ou adicione um mapeamento [`providerProtocol`](#custom-provider-ids-providerprotocol) para um id personalizado.

### IDs de provedor personalizados (`providerProtocol`) [#custom-provider-ids-providerprotocol]

Ids de provedor integrados (`openai`, `gemini`, `anthropic`, `vertex-ai`, `qwen-oauth`) são roteados automaticamente para seu protocolo SDK. Para usar um id de provedor **personalizado** — por exemplo, para agrupar vários endpoints compatíveis com OpenAI sob um nome mais amigável — declare-o sob `modelProviders` e mapeie-o para um protocolo integrado com a configuração de nível superior `providerProtocol`:

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

### Selecionando a API OpenAI

Defina `wireApi` ao lado de `id`, `envKey` e `baseUrl` em um modelo compatível com OpenAI:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "my-model",
        "wireApi": "responses",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ]
  },
  "security": { "auth": { "selectedType": "openai" } },
  "model": { "name": "my-model" }
}
```

Os valores suportados são `chat-completions` e `responses`. Omitir `wireApi` usa Chat Completions para `openai`, incluindo provedores personalizados mapeados para `openai`. Outros valores, ou `wireApi` em um modelo Anthropic, Gemini, Vertex AI ou Qwen OAuth, são erros de configuração.

Use `openai` com `wireApi` por modelo para novas configurações. O formato `modelProviders.openai-responses` e os mapeamentos `providerProtocol` para `openai-responses` lançados na v0.23.3 permanecem legíveis. Mapeamentos explícitos de provedores têm precedência sobre nomes de bucket; `wireApi` explícito tem precedência sobre qualquer protocolo OpenAI. O carregamento não reescreve configurações nem altera referências de credenciais. A reconfiguração escreve as rotas selecionadas no novo formato e remove apenas suas entradas antigas correspondentes no escopo gravável; entradas sob um ID de provedor que contém um ponto são mantidas, e modelos, endpoints, APIs e escopos não relacionados permanecem inalterados. `api` não é um alias para `wireApi`.

`wireApi` é metadado de roteamento local; ele não pertence a `generationConfig` ou `extra_body` e não é enviado no corpo da solicitação. A nova configuração personalizada compartilha um slot de credencial para o mesmo endpoint OpenAI em ambas as APIs, portanto, rotacionar essa chave atualiza ambas as rotas. Modelos configurados manualmente podem usar referências `envKey` explícitas distintas quando credenciais independentes forem necessárias. Em `/auth` → Provedor Personalizado, selecione compatível com OpenAI e, em seguida, o formato da API.

Na inicialização, `selectedType: "openai"` pode resolver um modelo configurado explicitamente com `wireApi: "responses"` quando não houver uma rota Chat correspondente no endpoint configurado selecionado. O seletor de modelos e as sessões registradas retêm o protocolo efetivo (`openai` ou `openai-responses`) para que ambas as rotas possam ser selecionadas e retomadas independentemente. Nenhuma detecção de endpoint ou fallback automático ocorre quando uma solicitação de API falha.

### SDKs Usados para Requisições de API

O protocolo efetivo do modelo determina o transporte. Ambas as APIs OpenAI usam o grupo de provedores `openai`; `wireApi` seleciona Chat Completions ou Responses:

| Protocolo efetivo | Transporte                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `openai`           | [`openai`](https://www.npmjs.com/package/openai) - SDK oficial OpenAI para Node.js                                     |
| `openai-responses` | Chamadas HTTP/SSE diretas para `/v1/responses` (sem SDK); embeddings usam [`openai`](https://www.npmjs.com/package/openai) |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - SDK oficial Anthropic  |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - SDK oficial Google GenAI       |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) com provedor personalizado (compatível com DashScope) |

Isso significa que o `baseUrl` que você configura deve ser compatível com o formato de API esperado pelo transporte correspondente. Por exemplo, `wireApi: "responses"` requer um endpoint compatível com Responses.

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

Ao apontar uma entrada para um gateway hospedado compatível com OpenAI, defina `baseUrl` como a raiz `/v1` da API (por exemplo, `https://gateway.example.com/v1`) em vez do caminho completo `/v1/chat/completions` — o SDK anexa o caminho da solicitação por conta própria.

### OpenAI Responses API (`openai-responses`)

Use `openai` com `wireApi: "responses"` para direcionar ao endpoint `/v1/responses` da OpenAI. Quando o endpoint retorna raciocínio criptografado com texto de pensamento visível, ele reproduz o raciocínio dos turnos anteriores entre os turnos e `--resume` via `reasoning.encrypted_content`. Endpoints compatíveis que transmitem `response.reasoning_text.delta` também exibem seu raciocínio, mas endpoints sem `encrypted_content` não podem reproduzir o estado de raciocínio opaco. Use `reasoning.effort` (não `extra_body.enable_thinking`, usado pelas conexões Chat Completions) para controlar a intensidade do raciocínio.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-5.1",
        "wireApi": "responses",
        "name": "GPT-5.1 (Responses API)",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "reasoning": {
            "effort": "high"
          },
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

> [!note]
> `extra_body` neste wire é apenas preenchimento: uma chave é escrita no corpo da requisição apenas quando a requisição gerada não tem valor para ela, portanto não pode sobrescrever um campo que o pipeline já definiu (`model`, `input`, `reasoning`, `temperature`, `max_output_tokens`, ...). A chave legada `enable_thinking` é a única exceção até a isso — ela é removida em vez de encaminhada (não é um campo da Responses API) e traduzida para `reasoning.effort: "medium"` quando nenhum `reasoning` explícito está definido. Defina `reasoning.effort` diretamente em vez de `extra_body.enable_thinking` para este provedor.

### Anthropic (`anthropic`)

Claude Opus 5.5, Sonnet 5.5, Fable 5.1 e Mythos 5.1 rejeitam a seleção forçada de ferramentas. Para consultas laterais estruturadas, o Qwen Code usa seleção automática de ferramentas com uma instrução explícita de resposta de esquema nestes modelos. Modelos que suportam seleção forçada a mantêm. A seleção automática não garante uma chamada de ferramenta; consultas JSON laterais também podem ler um objeto JSON bruto do texto da resposta, sem cercas Markdown ou prosa circundante. Veja [restrições de escolha de ferramenta da Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use).

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

Para servidores locais compatíveis com OpenAI na fila ou lentos, `streamIdleTimeoutMs` controla quanto tempo este modelo pode ficar silencioso entre fragmentos transmitidos. Ele substitui o valor global `QWEN_STREAM_IDLE_TIMEOUT_MS` para a entrada do provedor selecionado; defina-o como `0` para desativar a proteção contra ociosidade. O limite separado de duração de fluxo de 15 minutos ainda se aplica, a menos que `QWEN_STREAM_MAX_LIFETIME_MS` seja aumentado ou desativado.

Para servidores locais que não exigem autenticação, você pode usar qualquer valor placeholder para a chave de API:

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> O parâmetro `extra_body` é **suportado apenas para provedores compatíveis com OpenAI** (`openai`, `qwen-oauth`). Ele é ignorado para provedores Anthropic e Gemini. Em `openai-responses`, a chave `enable_thinking` é traduzida em vez de encaminhada — consulte a nota sobre a [OpenAI Responses API](#openai-responses-api-openai-responses).

> [!note]
>
> **Sobre `envKey`**: O campo `envKey` especifica o **nome de uma variável de ambiente**, não o valor real da chave de API. Para que a configuração funcione, você precisa garantir que a variável de ambiente correspondente esteja definida com sua chave de API real. Há duas maneiras de fazer isso:
>
> - **Opção 1: Usando um arquivo `.env`** (recomendado por segurança):
>   ```bash
>   # ~/.qwen/.env (or project root)
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

#### Qwen3.x servido sob um nome de modelo personalizado

O controle de raciocínio e a janela de contexto são inferidos pelo ID do modelo. Se um servidor vLLM ou SGLang expõe um modelo Qwen3.x sob um ID que não começa com `qwen` (por exemplo, `--served-model-name chat`), nenhuma das regras se aplica: solicitações paralelas, como o classificador de permissões do modo automático, mantêm o raciocínio ativado, e a janela de contexto recua para o padrão de 200K. Declare ambos na entrada do modelo, conforme descrito em [Substituir capacidades de raciocínio](#override-reasoning-capabilities):

```json
{
  "id": "chat",
  "name": "Qwen3.6 35B A3B (vLLM)",
  "envKey": "VLLM_API_KEY",
  "baseUrl": "http://localhost:8000/v1",
  "capabilities": { "reasoning": { "profile": "qwen-chat-template" } },
  "generationConfig": { "contextWindowSize": 262144 }
}
```

`qwen-chat-template` envia `chat_template_kwargs.enable_thinking`, que esses servidores passam para o template de chat do Qwen; um campo `enable_thinking` no nível superior não é lido por eles. Defina `contextWindowSize` como o comprimento máximo do modelo do servidor (o vLLM o reporta como `max_model_len` em `/v1/models`). O Qwen Code envia definições de ferramentas em todas as solicitações, então o servidor também precisa ter chamadas de ferramentas e um analisador de raciocínio habilitados; no vLLM, isso significa `--enable-auto-tool-choice`, um `--tool-call-parser` para o modelo (por exemplo, `qwen3_xml`) e `--reasoning-parser qwen3`. Os nomes dos analisadores mudam entre as versões do servidor, portanto, consulte a documentação do seu servidor.

## Alibaba Cloud Coding Plan

O Alibaba Cloud Coding Plan fornece um conjunto pré-configurado de modelos Qwen otimizados para tarefas de codificação. Este recurso está disponível para usuários com acesso à API do Alibaba Cloud Coding Plan e oferece uma experiência de configuração simplificada com atualizações automáticas da configuração do modelo.

### Visão Geral

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
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Em seguida, certifique-se de que este arquivo foi adicionado ao seu `.gitignore` se você estiver usando configurações no nível do projeto.

### Atualizações Automáticas

As configurações dos modelos do Coding Plan são versionadas. Quando o Qwen Code detecta uma versão mais nova do template de modelo, você será solicitado a atualizar. Aceitar a atualização irá:

- Substituir as configurações existentes dos modelos do Coding Plan pelas versões mais recentes
- Preservar quaisquer configurações personalizadas de modelos que você tenha adicionado manualmente
- Deixe o modelo selecionado inalterado; se ele não estiver mais presente na configuração atualizada, use `/model` para escolher um novo

O processo de atualização renova as configurações e recursos dos modelos sem alterar o modelo selecionado.

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

\*Quando presentes, os sinalizadores de autenticação da CLI substituem as configurações. Caso contrário, `security.auth.selectedType` ou o padrão implícito determinam o tipo de autenticação. Veja [Autenticação](./auth.md) para opções de login. O provedor legado gratuito Qwen OAuth é separado da [Conta Qwen com Assinatura](https://chat.qwen.ai/?memberPlan=qwen_code).

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

   Se um modelo estiver listado em `modelProviders`, coloque todas as configurações de geração específicas do modelo na entrada do provedor correspondente. Valores `model.generationConfig` no nível superior, incluindo `contextWindowSize`, `modalities`, `customHeaders` e `extra_body`, são ignorados para modelos de provedores. Configure esses campos sob `modelProviders[authType][].generationConfig` para que sejam aplicados.

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

### Valores dinâmicos em `customHeaders` [#dynamic-values-in-customheaders]

Um valor `customHeaders` pode conter o placeholder `${session_id}`, que é expandido por solicitação com o ID da sessão atual do Qwen Code. Use-o para gateways que exigem um identificador estável por conversa — o OpenCode Go, por exemplo, rejeita solicitações sem `x-opencode-session`:

```json
{
  "generationConfig": {
    "customHeaders": {
      "x-opencode-session": "${session_id}"
    }
  }
}
```

Como o valor é resolvido por solicitação em vez de ser fixado no cliente do SDK, `/new` e `/resume` rotacionam-no sem reiniciar.

⚠️ **Dois passos são necessários.** A entrada do provedor acima é apenas metade da solução — um placeholder é inerte até que você também ative [`outboundCorrelation.allowDynamicHeaderValues`](./settings.md#outboundcorrelation):

```json
{
  "outboundCorrelation": {
    "allowDynamicHeaderValues": true
  }
}
```

Até que você faça isso, um valor contendo um placeholder é **descartado** em vez de enviado, e o Qwen Code imprime um aviso na inicialização nomeando o cabeçalho e esta configuração. O cabeçalho nunca é enviado com um `${session_id}` literal nele.

**Um cabeçalho é reservado.** Nos endpoints MaaS do QwenCloud — as entradas `/auth` `China — Qianwen AI Platform` e `International — QwenCloud` — o Qwen Code possui `X-DashScope-Source-Config` e escreve o valor de atribuição de primeira parte nele. Uma entrada sob esse nome — qualquer capitalização — é removida antes que a solicitação seja construída, então um placeholder `${session_id}` nela nunca sobrevive e `allowDynamicHeaderValues` não altera isso. O cabeçalho em si ainda é enviado; apenas o seu valor é substituído. Veja [`customHeaders`](./settings.md#model) para a mesma regra enunciada do lado das configurações.

A chave é global porque é uma decisão de consentimento, separada de _para onde_ o valor vai: um valor expandido leva o estado vivo da sessão a quem o recebe, e a chave controla apenas se `${session_id}` pode ser expandido. Ela não identifica qual fonte de configurações forneceu o cabeçalho.

**Nota de privacidade:** o ID da sessão é um identificador estável pela vida útil de uma conversa, então qualquer host para o qual você o enviar pode agrupar todas as solicitações daquela conversa. Quais hosts são esses é decidido por quais entradas de provedor carregam o cabeçalho — não há uma lista separada de hosts para manter sincronizada com seu `baseUrl`.

### Tratamento de campos atômicos

Os seguintes campos são tratados como objetos atômicos - os valores do provedor substituem completamente o objeto inteiro, não ocorrendo mesclagem:

- `samplingParams` - Temperatura, top_p, max_tokens, etc.
- `customHeaders` - Cabeçalhos HTTP personalizados (podem conter `${session_id}`; veja [Valores dinâmicos](#dynamic-values-in-customheaders))
- `extra_body` - Parâmetros extras do corpo da requisição

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
- `samplingParams.max_tokens` = **undefined** (não definido no provedor, e a camada do provedor não herda das configurações — campos são explicitamente definidos como undefined se não fornecidos)

Ao usar um modelo bruto via `--model gpt-4` (não de modelProviders, cria um Modelo Runtime):

- `timeout` = 30000 (das configurações)
- `samplingParams.temperature` = 0,5 (das configurações)
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
          // The effort tiers:
          //   'low'    — lightest reasoning
          //   'medium' | 'xhigh' — mapped to 'high' on DeepSeek
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

| Protocolo / provedor                           | Formato de transmissão                                                                             | Observações                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope** (família `qwen3.8-max`) | Parâmetro de corpo `reasoning_effort: <effort>` plano                                         | Os níveis `/effort` são passados diretamente para qualquer ID de modelo que comece com `qwen3.8-max` (incluindo snapshots datados e aliases `-latest`), as pré-visualizações `qwen-latest-series-invite-*` somente por convite e a família `qwen4*` (todos sem distinção entre maiúsculas e minúsculas); o DashScope aplica qualquer mapeamento específico do modelo. Esta escada da família termina em `xhigh`, então um `max` configurado é limitado a `xhigh` (registrado uma vez) em vez de enviado e rejeitado. Um `reasoning_effort` explícito em `samplingParams` ou `extra_body` é uma substituição literal e não é limitado. Quando `reasoning_effort` e `thinking_budget` entram em conflito, a precedência normal `extra_body` > `samplingParams` > `reasoning` mantém apenas o campo de maior prioridade; um par explícito na mesma camada mantém `reasoning_effort`, correspondendo ao comportamento do provedor antes da resolução entre camadas. Se um campo estático vencer, `/effort` reporta esse campo em vez de implicar que o nível solicitado está efetivo. Quando um nível de esforço vence, um `enable_thinking` conflitante também é descartado. Um `enable_thinking: false` explícito em `extra_body` é honrado em vez de descartado: ele substitui o nível configurado como `reasoning_effort: 'none'`, um dos poucos lugares onde `extra_body` não vence literalmente. Outros modelos Qwen continuam a mapear um esforço selecionado para `enable_thinking: true`; uma substituição `reasoning_effort` passa diretamente lá, a menos que conflite com um `thinking_budget` (um par que o DashScope rejeita), caso em que o `reasoning_effort` inerte é descartado e tanto `enable_thinking` quanto `thinking_budget` sobrevivem. |
| **OpenAI / DeepSeek** (`api.deepseek.com`)    | Parâmetro de corpo `reasoning_effort: <effort>` plano                                         | Quando `reasoning.effort` é definido na forma de configuração aninhada, ele é reescrito para `reasoning_effort` plano; para os modelos DeepSeek integrados, `'low'`, `'high'` e `'max'` passam diretamente e `'medium'`/`'xhigh'` são normalizados para `'high'` — espelhando o [mapeamento de esforço](https://api-docs.deepseek.com/guides/thinking_mode) do DeepSeek. Essa passagem direta e normalização descrevem o endpoint oficial: no MaaS e em hosts de terceiros, os IDs exatos `deepseek-v4-pro` / `deepseek-v4-flash` oferecem apenas `high`/`max` (um `low` configurado é elevado a `high`, e `xhigh` é normalizado para `max`), enquanto os aliases Flash mais recentes (`deepseek-v4.1-flash*`) mantêm `low`/`high`/`max` com `xhigh → high`. Substituições de nível superior `samplingParams.reasoning_effort` ou `extra_body.reasoning_effort` pulam essa normalização e são enviadas literalmente. `max` é aceito em um hostname real do DeepSeek e em qualquer ID de modelo `deepseek-v4*` (sem distinção entre maiúsculas e minúsculas, incluindo snapshots datados), que é reconhecido em qualquer host compatível com OpenAI (gateways de terceiros recebem o contrato estilo MaaS `enable_thinking`); outros modelos nomeados `deepseek` em outro host mantêm o teto genérico `xhigh`, correspondendo à restrição de hostname na própria remodelagem.                                                                                                                                                                                                                                                                                                                                           |
| **OpenAI / Z.ai** (`z.ai`, `bigmodel.cn`)     | Parâmetro de corpo plano `reasoning_effort: <effort>`                                         | GLM-5.2+ em um host Z.ai aceita a escada completa, incluindo `max`, e o campo aninhado `reasoning.effort` é reescrito para o campo plano. IDs GLM mais antigos e um modelo `glm-*` acessado em qualquer outro host mantêm o teto genérico `xhigh`: o nome do modelo sozinho não diz nada sobre o que esse endpoint aceita.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OpenAI** (outros servidores compatíveis)         | GPT-5 / GPT-6 Astra conhecidos: `reasoning_effort` plano; outros modelos: `reasoning` aninhado     | O esforço GPT é limitado em ambas as direções ao subconjunto suportado para o modelo conhecido. GPT-5.6 e GPT-6 Astra permitem `max`, enquanto modelos anteriores têm tetos mais baixos. Níveis abaixo do piso do modelo são elevados: GPT-5 Pro aceita apenas `high`; GPT-5.2 Pro, GPT-5.4 Pro e GPT-5.5 Pro elevam `low` para `medium`. OpenRouter mantém `reasoning` aninhado. Nomes de modelos desconhecidos mantêm o teto genérico `xhigh` e a forma aninhada. Valores de raciocínio explícitos em `samplingParams` / `extra_body` ignoram o limite do nível configurado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **OpenAI Responses** (`openai-responses`)     | `reasoning: { effort, summary: "auto" }` mais `include: ["reasoning.encrypted_content"]` | Cada nível passa verbatim sem limitação. `extra_body.enable_thinking: true` é traduzido para `reasoning: { effort: "medium" }` quando nenhum `reasoning` explícito está definido (e nunca é encaminhado por si só — não tem significado neste protocolo); prefira definir `reasoning.effort` diretamente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Anthropic** (real `api.anthropic.com`)      | `output_config: { effort }` mais o cabeçalho beta `effort-2025-11-24`                     | A API real da Anthropic aceita apenas `'low'`/`'medium'`/`'high'`. `'max'` é **limitado a `'high'`** com uma linha `debugLogger.warn` (uma vez por gerador); se você deseja esforço máximo, altere o baseURL para um endpoint compatível com DeepSeek que suporte isso.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Anthropic** (`api.deepseek.com/anthropic`)  | Mesmo `output_config: { effort }` + cabeçalho beta                                           | `'low'`, `'high'` e `'max'` passam sem alterações; `'medium'`/`'xhigh'` são mapeados para `'high'`, correspondendo ao mapeamento no lado do servidor do DeepSeek.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                  | `thinkingConfig: { includeThoughts: true, thinkingLevel }`                               | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, outros → `THINKING_LEVEL_UNSPECIFIED` (o Gemini não possui nível `MAX`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### `reasoning: false`

Definir `reasoning: false` (o booleano literal) desativa explicitamente o thinking em todos os provedores — útil para consultas secundárias baratas que não se beneficiam do raciocínio. Isso também é respeitado no nível da requisição via `request.config.thinkingConfig.includeThoughts: false` para chamadas pontuais (por exemplo, geração de sugestões).

Em um `api.deepseek.com` baseURL, o pipeline OpenAI emite o campo explícito `thinking: { type: 'disabled' }` exigido pelo DeepSeek V4+ — o padrão do lado do servidor é `'enabled'`, então simplesmente omitir `reasoning_effort` ainda incorreria em latência/custo de raciocínio. Backends DeepSeek auto-hospedados (sglang/vllm) e outros servidores compatíveis com OpenAI **não** recebem este campo; se você precisar desabilitar o raciocínio neles, injete `thinking: { type: 'disabled' }` (ou qualquer parâmetro que seu framework de inferência exponha) via `samplingParams`/`extra_body`. Qualquer id de modelo `deepseek-v4*` (sem distinção de maiúsculas/minúsculas) é a exceção: em qualquer host de terceiros compatível com OpenAI, ele segue o contrato MaaS e recebe `enable_thinking: false` quando o raciocínio está desabilitado. Em qualquer rota recém-reconhecida (um host de terceiros, ou um novo alias em um host estabelecido), uma declaração legada `capabilities.reasoning` sem um perfil de raciocínio mantém sua própria semântica de transmissão: o normalizador embutido recua e não achata nem reclassifica o esforço declarado ou estático. Uma declaração deve nomear o parâmetro que o modelo lê em `disableField` (`thinking`, `enable_thinking` ou `reasoning_effort`); uma que omite isso não resolve nenhuma capacidade, portanto nenhum campo de desativação é emitido e o padrão do servidor (raciocínio ativado) se aplica.

Para modelos GPT conhecidos que permitem desativação, endpoints não-OpenRouter recebem `reasoning_effort: 'none'`; OpenRouter recebe `reasoning: { enabled: false }` aninhado em vez disso. Modelos com raciocínio obrigatório rejeitam 'off' nos controles do modelo e omitem valores de desativação não suportados das solicitações, então `reasoning: false` não pode desligar o raciocínio deles. Uma capacidade de raciocínio explícita do modelo tem precedência sobre a lista de níveis embutida e seleciona o campo nativo de desativação; OpenRouter mantém seu comportamento de desativação no nível do provedor. O conjunto obrigatório embutido é `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.2-codex`, `gpt-5.3-codex`, `gpt-5.2-pro`, `gpt-5.4-pro`, `gpt-5.5-pro` e `gpt-6-astra`.

Em um `openrouter.ai` baseURL, o pipeline OpenAI emite o campo `reasoning: { enabled: false }` no nível do provedor do OpenRouter quando o raciocínio está desabilitado. Modelos com raciocínio obrigatório não recebem este campo de desativação. Outros servidores compatíveis com OpenAI não recebem automaticamente este campo específico do OpenRouter; use seu parâmetro nativo de desativação.

### Interação com `samplingParams` (apenas compatível com OpenAI)

> [!warning]
>
> Quando `generationConfig.samplingParams` é definido em um provedor compatível com OpenAI, o pipeline envia essas chaves para a rede **literalmente** e ignora completamente a injeção separada de `reasoning`. Portanto, uma configuração como `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` descartará silenciosamente o campo de raciocínio nas requisições OpenAI/DeepSeek. Um objeto `reasoning` colocado dentro de `samplingParams` é um valor próprio e é enviado inalterado: o teto de esforço acima se aplica apenas ao nível injetado pelo pipeline a partir de `/effort`.
>
> Modelos GPT-5 conhecidos e GPT-6 Astra mantêm o esforço configurado junto com chaves de amostragem não relacionadas. Por exemplo, `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` envia `temperature: 0.5` e `reasoning_effort: 'xhigh'` achatado no GPT-5.4, ou `'max'` no GPT-5.6 / GPT-6 Astra. Em um `openrouter.ai` baseURL, o mesmo nível limitado é enviado como `reasoning: { effort }` aninhado em vez disso. Em endpoints não-OpenRouter, substituições achatadas explícitas de raciocínio vencem; placeholders achatados nulos ou vazios permitem o nível configurado. No OpenRouter, uma substituição achatada de amostragem suprime o esforço aninhado configurado, a menos que capacidades explícitas do modelo o injetem; uma substituição achatada apenas no corpo extra não substitui o esforço aninhado configurado.
>
> Os modelos Qwen DashScope são outra exceção: seu provedor lê `reasoning` diretamente e mapeia para `reasoning_effort` ou `enable_thinking`. Nas famílias de esforço por níveis (`qwen3.8-max`, `qwen-latest-series-invite-*`, `qwen4*`), campos `samplingParams` específicos do provedor ainda têm precedência quando os parâmetros de transmissão entram em conflito; em híbridos qwen mais antigos, um nível de esforço configurado colapsa para `enable_thinking: true`, que substitui um valor `samplingParams.enable_thinking`.
>
> Para outros modelos, inclua o parâmetro de raciocínio do provedor diretamente ao usar `samplingParams` — para DeepSeek, isso é `samplingParams.reasoning_effort`. Modelos GPT conhecidos mapeiam o esforço configurado automaticamente; adicione uma substituição bruta apenas quando intencionalmente contornar esse mapeamento. Substituições brutas aninhadas `reasoning`, incluindo `null`, permanecem como uma substituição de objeto inteiro enquanto o raciocínio está habilitado. Desativar via `reasoning: false` ou `includeThoughts: false` no nível da solicitação remove o valor aninhado, incluindo substituições brutas em qualquer camada. Solicitações GPT não-OpenRouter então enviam `reasoning_effort: 'none'` quando a desativação é permitida; OpenRouter usa seu campo de desativação aninhado em vez disso. Modelos com raciocínio obrigatório não recebem nenhum substituto. Fora do OpenRouter, seu significado depende do gateway, então os controles do modelo mostram o padrão do modelo. Qualquer substituição bruta que bloqueie um nível configurado faz com que uma mudança explícita de nível falhe sem salvar uma preferência. A chave de raciocínio restaura padrões brutos configurados após a desativação apenas quando eles permitem o raciocínio. Se o estado bruto ou o padrão de raciocínio configurado estiver desligado, a chave de raciocínio não pode ser ligada e a preferência salva é retida. Isso também se aplica quando capacidades explícitas omitem um nível padrão ou expõem apenas uma alternância de raciocínio. Um comando padrão explícito ainda redefine a preferência. Remova a substituição bruta bloqueadora para escolher um nível diferente.
>
> Os conversores da Anthropic e do Gemini não são afetados — eles sempre leem `reasoning.effort` diretamente, independentemente de `samplingParams`.

### `budget_tokens`

Você pode fixar um orçamento exato de tokens de thinking incluindo `budget_tokens` junto com `effort`:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Para a Anthropic, isso se torna `thinking.budget_tokens`. Para OpenAI/DeepSeek, o campo é preservado, mas atualmente ignorado pelo servidor — `reasoning_effort` é o controle principal.

## Modelos de Provedor vs Modelos de Runtime

O Qwen Code distingue dois tipos de configurações de modelo:

### Modelo de Provedor

- Definido na configuração `modelProviders`
- Possui um pacote de configuração completo e atômico
- Quando selecionado, sua configuração é aplicada como uma camada impermeável
- Aparece na lista de comandos `/model` com metadados completos (nome, descrição, capacidades)
- Recomendado para fluxos de trabalho multimodelo e consistência da equipe

### Modelo de Runtime

- Criado dinamicamente ao usar IDs de modelo brutos via CLI (`--model`), variáveis de ambiente ou configurações
- Não definido em `modelProviders`
- A configuração é construída "projetando" através das camadas de resolução (CLI → env → configurações → padrões)
- Capturado automaticamente como um **RuntimeModelSnapshot** quando uma configuração completa é detectada
- Permite reutilização sem reinserir credenciais

### Ciclo de vida do RuntimeModelSnapshot

Quando você configura um modelo sem usar `modelProviders`, o Qwen Code cria automaticamente um RuntimeModelSnapshot para preservar sua configuração:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

O snapshot:

- Captura o ID do modelo, a chave da API, a URL base e a configuração de geração
- Persiste entre sessões (armazenado na memória durante a execução)
- Aparece na lista de comandos `/model` como uma opção de tempo de execução
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
- Sem `modelProviders`, o resolver mistura as camadas CLI/env/settings, criando Runtime Models. Isso é aceitável para configurações de provedor único, mas torna-se trabalhoso ao alternar frequentemente. Defina catálogos de provedores sempre que fluxos de trabalho com múltiplos modelos forem comuns, para que as mudanças permaneçam atômicas, atribuídas à fonte e depuráveis.
