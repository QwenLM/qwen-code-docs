# PRD do Assistente de Autenticação com Chave de API Personalizada

## Resumo

Melhorar a experiência de `/auth -> Chave de API -> Chave de API Personalizada` substituindo a tela atual de apenas documentação por um assistente de configuração no terminal para provedores de API personalizados.

O Qwen Code suporta múltiplos protocolos de API através das chaves `authType` / `modelProviders`, incluindo `openai`, `anthropic` e `gemini`. Portanto, o assistente de configuração personalizada deve começar perguntando ao usuário para selecionar o protocolo, depois coletar as informações de endpoint, chave e modelo para aquele protocolo.

O assistente guia os usuários através de:

```text
Selecionar Protocolo -> Inserir URL Base -> Inserir Chave de API -> Inserir IDs de Modelo -> Revisar JSON -> Salvar + autenticar
```

Isso mantém a configuração da chave de API personalizada dentro do Qwen Code, reduz a necessidade de editar manualmente o `settings.json` e torna a configuração final transparente ao exibir o JSON gerado antes de salvar.

## Contexto

Atualmente, selecionar `Chave de API Personalizada` em `/auth` mostra uma tela de informações estática:

```text
Configuração Personalizada

Você pode configurar sua chave de API e modelos em settings.json

Consulte a documentação para instruções de configuração
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/

Esc para voltar
```

Isso exige que os usuários saiam do CLI, leiam a documentação, entendam o `settings.json`, configurem manualmente `modelProviders`, escolham um `envKey`, adicionem chaves de API e depois retornem ao Qwen Code. Usuários relataram que esse fluxo é difícil e desconectado do restante da experiência de `/auth`.

O caminho atual da chave de API padrão do ModelStudio já oferece um fluxo de configuração guiado:

```text
Chave de API Padrão do ModelStudio da Alibaba Cloud
└─ Selecionar Região
   └─ Inserir Chave de API
      └─ Inserir IDs de Modelo
         └─ Salvar + autenticar
```

A configuração da chave de API personalizada deve oferecer uma experiência guiada semelhante, respeitando também que o Qwen Code suporta múltiplos protocolos de provedores.

## Declaração do Problema

O caminho da chave de API personalizada é atualmente um beco sem saída dentro de `/auth`:

```text
/auth
└─ Selecionar Método de Autenticação
   ├─ Plano de Codificação da Alibaba Cloud
   ├─ Chave de API
   │  └─ Selecionar Tipo de Chave de API
   │     ├─ Chave de API Padrão do ModelStudio da Alibaba Cloud
   │     │  ├─ Selecionar Região
   │     │  ├─ Inserir Chave de API
   │     │  ├─ Inserir IDs de Modelo
   │     │  └─ Salvar + autenticar
   │     │
   │     └─ Chave de API Personalizada
   │        └─ Tela de apenas documentação
   │
   └─ OAuth do Qwen
```

Isso causa vários problemas de usabilidade:

- Usuários não conseguem finalizar a configuração do provedor personalizado a partir de `/auth`.
- Usuários precisam entender conceitos de baixo nível das configurações antes de poderem autenticar.
- Usuários podem não saber quais campos são obrigatórios: `authType`, `baseUrl`, `envKey`, `modelProviders`, `model.name` e `security.auth.selectedType`.
- Usuários podem, acidentalmente, entrar em conflito com variáveis de ambiente existentes ou sobrescrever configurações de provedores existentes.
- Usuários não recebem feedback imediato de autenticação após editar as configurações manualmente.

## Objetivos

1. Permitir que os usuários configurem um provedor de API personalizado completamente dentro de `/auth`.
2. Suportar os principais protocolos que o Qwen Code aceita em `modelProviders`: `openai`, `anthropic` e `gemini`.
3. Manter o fluxo próximo ao fluxo padrão existente do ModelStudio.
4. Tratar `baseUrl` como o equivalente de `region` para provedores personalizados.
5. Gerar automaticamente um `envKey` privado gerenciado pelo Qwen a partir do protocolo selecionado e do `baseUrl` informado.
6. Armazenar a chave de API em `settings.json.env`, de acordo com o padrão atual de credenciais gerenciadas pelo Qwen.
7. Evitar conflitos com variáveis de ambiente do shell do usuário usando um nome de chave gerado específico do Qwen.
8. Exibir o JSON gerado antes de salvar para que os usuários possam revisar exatamente as alterações nas configurações.
9. Preservar entradas existentes de `modelProviders` não relacionadas.
10. Autenticar imediatamente após salvar e exibir feedback de sucesso ou falha.

## Não objetivos

1. Não exigir que os usuários insiram manualmente o `envKey`.
2. Não introduzir o nome do provedor como um conceito separado.
3. Não adicionar `generationConfig`, `capabilities` ou sobrescritas por modelo avançados ao assistente.
4. Não remover o link da documentação completamente; ele deve permanecer disponível para configurações avançadas.
5. Não alterar os fluxos existentes de Plano de Codificação ou chave de API padrão do ModelStudio.
6. Não tentar detectar automaticamente o protocolo a partir do `baseUrl` na primeira versão; os usuários selecionam o protocolo explicitamente.

## Usuários-Alvo

- Usuários que trazem seu próprio endpoint de API personalizado.
- Usuários configurando provedores como APIs compatíveis com OpenAI, APIs compatíveis com Anthropic, APIs compatíveis com Gemini, vLLM, Ollama, LM Studio ou gateways internos.
- Usuários que preferem configurar a autenticação a partir do CLI em vez de editar manualmente o `settings.json`.

## Protocolos Suportados

O assistente deve inicialmente expor estas opções de protocolo:

```text
openai
anthropic
gemini
```

Cada protocolo mapeia diretamente para uma chave `modelProviders` e um valor `security.auth.selectedType`.

| Opção de protocolo      | Chave de authType / modelProviders | Observações                                                                         |
| ----------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Compatível com OpenAI   | `openai`                            | OpenAI, OpenRouter, Fireworks, servidores locais compatíveis com OpenAI, gateways internos |
| Compatível com Anthropic| `anthropic`                         | Endpoints compatíveis com Anthropic                                                |
| Compatível com Gemini   | `gemini`                            | Endpoints compatíveis com Gemini                                                   |
## Visão Geral da Experiência do Usuário

### Árvore `/auth` atualizada

```text
/auth
└─ Selecione o Método de Autenticação
   ├─ Alibaba Cloud Coding Plan
   │  └─ Selecione a Região
   │     └─ Insira a Chave de API
   │        └─ Salvar + autenticar
   │
   ├─ Chave de API
   │  └─ Selecione o Tipo de Chave de API
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ Selecione a Região
   │     │  ├─ Insira a Chave de API
   │     │  ├─ Insira os IDs dos Modelos
   │     │  └─ Salvar + autenticar
   │     │
   │     └─ Chave de API Personalizada (Custom API Key)
   │        ├─ Selecione o Protocolo
   │        ├─ Insira a URL Base
   │        ├─ Insira a Chave de API
   │        ├─ Insira os IDs dos Modelos
   │        ├─ Revise o JSON gerado
   │        └─ Salvar + autenticar
   │
   └─ Qwen OAuth
```

### Máquina de Estados da Chave de API Personalizada

```text
api-key-type-select
  │
  └─ CUSTOM_API_KEY
      │
      ▼
custom-protocol-select
      │ Enter
      ▼
custom-base-url-input
      │ Enter
      │ generate envKey from protocol + baseUrl
      ▼
custom-api-key-input
      │ Enter
      ▼
custom-model-id-input
      │ Enter
      ▼
custom-review-json
      │ Enter
      ▼
salvar configurações + refreshAuth(selectedProtocol)
```

### Comportamento de Voltar (Escape)

```text
custom-review-json
  Esc -> custom-model-id-input

custom-model-id-input
  Esc -> custom-api-key-input

custom-api-key-input
  Esc -> custom-base-url-input

custom-base-url-input
  Esc -> custom-protocol-select

custom-protocol-select
  Esc -> api-key-type-select
```

## Detalhamento do Design de Interação

### Passo 1: Selecione o Protocolo

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · Selecione o Protocolo           │
│                                                              │
│  ◉ Compatível com OpenAI                                     │
│    OpenAI, OpenRouter, Fireworks, vLLM, Ollama, LM Studio    │
│                                                              │
│  ○ Compatível com Anthropic                                  │
│    Endpoints compatíveis com Anthropic                       │
│                                                              │
│  ○ Compatível com Gemini                                     │
│    Endpoints compatíveis com Gemini                          │
│                                                              │
│ Enter para selecionar, ↑↓ para navegar, Esc para voltar      │
└──────────────────────────────────────────────────────────────┘
```

O protocolo selecionado determina:

- A chave em `modelProviders` a ser atualizada.
- O valor de `security.auth.selectedType` a ser persistido.
- O rótulo do protocolo exibido nas telas seguintes.
- O tipo de autenticação a ser usado no `refreshAuth()` após salvar.

### Passo 2: Insira a URL Base

`baseUrl` é o equivalente ao seletor de região para provedores customizados. Deve vir antes da inserção da chave de API porque determina a qual endpoint a chave pertence.

Para compatível com OpenAI:

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · URL Base                        │
│                                                              │
│ Protocolo: Compatível com OpenAI                             │
│                                                              │
│ Insira o endpoint da API compatível com OpenAI.              │
│                                                              │
│ URL Base: https://openrouter.ai/api/v1_                      │
│                                                              │
│ Exemplos:                                                    │
│   OpenAI:      https://api.openai.com/v1                     │
│   OpenRouter: https://openrouter.ai/api/v1                   │
│   Fireworks:  https://api.fireworks.ai/inference/v1          │
│   Ollama:     http://localhost:11434/v1                      │
│   LM Studio:  http://localhost:1234/v1                       │
│                                                              │
│ Enter para continuar, Esc para voltar                        │
└──────────────────────────────────────────────────────────────┘
```

Para compatível com Anthropic:

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · URL Base                        │
│                                                              │
│ Protocolo: Compatível com Anthropic                          │
│                                                              │
│ Insira o endpoint da API compatível com Anthropic.           │
│                                                              │
│ URL Base: https://api.anthropic.com/v1_                      │
│                                                              │
│ Enter para continuar, Esc para voltar                        │
└──────────────────────────────────────────────────────────────┘
```

Para compatível com Gemini:

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · URL Base                        │
│                                                              │
│ Protocolo: Compatível com Gemini                             │
│                                                              │
│ Insira o endpoint da API compatível com Gemini.              │
│                                                              │
│ URL Base: https://generativelanguage.googleapis.com_         │
│                                                              │
│ Enter para continuar, Esc para voltar                        │
└──────────────────────────────────────────────────────────────┘
```
Validação:

- Obrigatório.
- Deve começar com `http://` ou `https://`.
- Remove espaços em branco do início e do fim.
- Preserva a string normalizada como informada, exceto pela remoção de espaços.

Ao enviar com sucesso:

- Gera o `envKey` gerenciado pelo Qwen a partir do protocolo selecionado e do `baseUrl`.
- Avança para a entrada da chave da API.

### Etapa 3: Inserir a Chave da API

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · Chave da API                    │
│                                                              │
│ Protocolo: Compatível com OpenAI                             │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Insira a chave da API para este endpoint.                    │
│                                                              │
│ Chave da API: sk-or-v1-••••••••••••••••_                     │
│                                                              │
│ Enter para continuar, Esc para voltar                        │
└──────────────────────────────────────────────────────────────┘
```

Validação:

- Obrigatório.
- Remove espaços em branco do início e do fim.

Observações:

- O campo de entrada pode usar inicialmente o comportamento de entrada de texto existente para consistência com fluxos próximos.
- A tela de revisão deve ocultar a chave da API.

### Etapa 4: Inserir os IDs dos Modelos

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · IDs dos Modelos                  │
│                                                              │
│ Protocolo: Compatível com OpenAI                             │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Insira um ou mais IDs de modelo, separados por vírgulas.    │
│                                                              │
│ IDs dos Modelos: qwen/qwen3-coder,openai/gpt-4.1_            │
│                                                              │
│ Enter para continuar, Esc para voltar                        │
└──────────────────────────────────────────────────────────────┘
```

Validação:

- Obrigatório.
- Separar por vírgula.
- Remover espaços em branco de cada ID de modelo.
- Remover entradas vazias.
- Deduplicar entradas preservando a ordem.
- Pelo menos um ID de modelo deve permanecer.

Nomeação do modelo:

- `id` e `name` devem ser iguais.
- Nenhum nome de provedor separado é solicitado ao usuário.

Exemplo:

```text
Entrada:
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

Normalizado:
qwen/qwen3-coder, openai/gpt-4.1
```

### Etapa 5: Revisar JSON

Antes de salvar, mostre o trecho JSON gerado que será escrito ou mesclado no `settings.json`.

Exemplo compatível com OpenAI:

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · Revisão                          │
│                                                              │
│ O seguinte JSON será salvo em settings.json:                  │
│                                                              │
│ {                                                            │
│   "env": {                                                   │
│     "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1": │
│       "sk-••••••••••••••••"                                  │
│   },                                                         │
│   "modelProviders": {                                        │
│     "openai": [                                              │
│       {                                                      │
│         "id": "qwen/qwen3-coder",                           │
│         "name": "qwen/qwen3-coder",                         │
│         "baseUrl": "https://openrouter.ai/api/v1",          │
│         "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1" │
│       }                                                      │
│     ]                                                        │
│   },                                                         │
│   "security": {                                              │
│     "auth": {                                                │
│       "selectedType": "openai"                               │
│     }                                                        │
│   },                                                         │
│   "model": {                                                 │
│     "name": "qwen/qwen3-coder"                              │
│   }                                                          │
│ }                                                            │
│                                                              │
│ Enter para salvar, Esc para voltar                            │
└──────────────────────────────────────────────────────────────┘
```

Exemplo compatível com Anthropic:

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1": "sk-••••"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-sonnet-4-5",
        "name": "claude-sonnet-4-5",
        "baseUrl": "https://api.anthropic.com/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "anthropic"
    }
  },
  "model": {
    "name": "claude-sonnet-4-5"
  }
}
```
O JSON exibido deve:

- Usar o protocolo selecionado como chave de `modelProviders`.
- Usar o protocolo selecionado como `security.auth.selectedType`.
- Usar o valor real gerado para `envKey`.
- Mascarar a chave da API.
- Usar a `baseUrl` fornecida pelo usuário.
- Usar `id === name` para cada modelo.
- Mostrar `model.name` definido como o primeiro ID de modelo normalizado.

Caso o JSON seja largo demais para o terminal atual, a quebra de linha é aceitável. O objetivo é transparência, não formatação perfeita para copiar e colar.

### Etapa 6: Salvar e Autenticar

Ao pressionar Enter na tela de revisão:

```text
save:
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...new custom configs using generatedEnvKey,
    ...existing configs whose envKey !== generatedEnvKey
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

Mensagem de sucesso:

```text
Chave de API personalizada autenticada com sucesso. Configurações atualizadas com a chave de ambiente gerada e a configuração do provedor de modelo.
Dica: Use /model para alternar entre os modelos configurados.
```

Mensagem de falha deve preservar o padrão de falha de autenticação existente, com dicas adicionais voltadas ao usuário, se possível:

```text
Falha na autenticação. Mensagem: <error>

Verifique:
- Se a URL base é compatível com o protocolo selecionado
- Se a chave da API é válida para este endpoint
- Se o ID do modelo existe para este provedor
```

## Geração de Chave de Ambiente (Env Key)

O assistente não deve pedir que o usuário informe um `envKey`.

Chaves de API gerenciadas pelo Qwen são armazenadas em `settings.json.env`, portanto a chave de ambiente deve ser gerada automaticamente sob um namespace específico do Qwen. Isso evita colisões com variáveis de ambiente gerenciadas pelo usuário e impede que vários endpoints personalizados se sobrescrevam.

### Formato

```text
QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

A inclusão do protocolo evita colisões quando o mesmo endpoint é usado com adaptadores de protocolo diferentes.

### Exemplos

```text
Protocol: openai
Base URL: https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

Protocol: openai
Base URL: https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

Protocol: anthropic
Base URL: https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

Protocol: gemini
Base URL: https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

Protocol: openai
Base URL: http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### Regra de normalização

```text
protocol
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _

baseUrl
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _
  -> collapse consecutive _ characters
  -> remove leading/trailing _

return QWEN_CUSTOM_API_KEY_${NORMALIZED_PROTOCOL}_${NORMALIZED_BASE_URL}
```

Pseudocódigo:

```ts
function generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string {
  const normalize = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

  return `QWEN_CUSTOM_API_KEY_${normalize(protocol)}_${normalize(baseUrl)}`;
}
```

## Design de Gravação de Configurações (Settings Write Design)

Dada a entrada do usuário:

```text
Protocol: openai
Base URL: https://openrouter.ai/api/v1
API key: sk-or-v1-xxx
Model IDs: qwen/qwen3-coder,openai/gpt-4.1
```

O assistente deve produzir:

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1": "sk-or-v1-xxx"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen/qwen3-coder",
        "name": "qwen/qwen3-coder",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      },
      {
        "id": "openai/gpt-4.1",
        "name": "openai/gpt-4.1",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen/qwen3-coder"
  }
}
```

Para `anthropic`, a mesma estrutura é utilizada, exceto:

```text
modelProviders.anthropic
security.auth.selectedType = anthropic
refreshAuth(anthropic)
```

Para `gemini`, a mesma estrutura é utilizada, exceto:

```text
modelProviders.gemini
security.auth.selectedType = gemini
refreshAuth(gemini)
```

### Escopo de persistência

Use a mesma estratégia de escopo de persistência da seleção de modelo e dos fluxos de chave de API existentes:

```text
getPersistScopeForModelSelection(settings)
```

Isso mantém o comportamento consistente com as regras de posse de `modelProviders` existentes.

### Backup

Antes de gravar, faça backup do arquivo de configurações de destino, de forma consistente com os fluxos existentes do Coding Plan e do ModelStudio Standard.

### Sincronização com env do processo

Após gravar `settings.json.env[generatedEnvKey]`, sincronize imediatamente:

```text
process.env[generatedEnvKey] = apiKey
```

Isso garante que `refreshAuth(selectedProtocol)` possa usar a chave recém-inserida na mesma sessão.
### Regra de mesclagem de provedor de modelo

Para a chave de ambiente gerada:

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Atualize `modelProviders[selectedProtocol]` da seguinte forma:

```text
newConfigs = normalizedModelIds.map(modelId => ({
  id: modelId,
  name: modelId,
  baseUrl,
  envKey: generatedEnvKey,
}))

existingConfigs = settings.merged.modelProviders?.[selectedProtocol] ?? []

preservedConfigs = existingConfigs.filter(config =>
  config.envKey !== generatedEnvKey
)

updatedConfigs = [
  ...newConfigs,
  ...preservedConfigs,
]
```

Justificativa:

- Reconfigurar o mesmo protocolo + `baseUrl` substitui modelos antigos para esse endpoint.
- Configurar um protocolo ou `baseUrl` diferente usa uma chave de ambiente diferente e não sobrescreve endpoints personalizados anteriores.
- Coding Plan, ModelStudio Standard e outras configurações do usuário são preservadas, a menos que usem a mesma chave de ambiente gerada sob o mesmo protocolo.
- Novas configurações são colocadas primeiro para que os modelos recém-configurados fiquem imediatamente visíveis e selecionados por padrão.

## Tratamento de Erros

### Erro de validação de protocolo

O protocolo deve ser um dos:

```text
openai
anthropic
gemini
```

### Erro de validação de URL base

```text
Base URL cannot be empty.
```

```text
Base URL must start with http:// or https://.
```

### Erro de validação de chave de API

```text
API key cannot be empty.
```

### Erro de validação de IDs de modelo

```text
Model IDs cannot be empty.
```

### Falha de autenticação

Use o mecanismo de falha existente quando possível, mas o erro exibido ao usuário deve ajudar na recuperação:

```text
Failed to authenticate. Message: <message>

Please check:
- Base URL is compatible with the selected protocol
- API key is valid for this endpoint
- Model ID exists for this provider
```

## Link de Documentação

O assistente ainda deve expor a documentação existente de provedores de modelo para usuários avançados.

Posicionamento recomendado:

- No rodapé da tela de revisão, ou
- Como texto secundário na tela de URL base.

Texto sugerido:

```text
Need advanced generationConfig or capabilities? See:
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## Notas de Implementação

Níveis de visualização esperados do `AuthDialog`:

```ts
type ViewLevel =
  | 'main'
  | 'region-select'
  | 'api-key-input'
  | 'api-key-type-select'
  | 'alibaba-standard-region-select'
  | 'alibaba-standard-api-key-input'
  | 'alibaba-standard-model-id-input'
  | 'custom-protocol-select'
  | 'custom-base-url-input'
  | 'custom-api-key-input'
  | 'custom-model-id-input'
  | 'custom-review-json';
```

Tipo de protocolo personalizado esperado:

```ts
type CustomApiProtocol =
  | AuthType.USE_OPENAI
  | AuthType.USE_ANTHROPIC
  | AuthType.USE_GEMINI;
```

Novo estado esperado em `AuthDialog`:

```ts
const [customProtocol, setCustomProtocol] = useState<CustomApiProtocol>(
  AuthType.USE_OPENAI,
);
const [customProtocolIndex, setCustomProtocolIndex] = useState<number>(0);
const [customBaseUrl, setCustomBaseUrl] = useState('');
const [customBaseUrlError, setCustomBaseUrlError] = useState<string | null>(
  null,
);
const [customApiKey, setCustomApiKey] = useState('');
const [customApiKeyError, setCustomApiKeyError] = useState<string | null>(null);
const [customModelIds, setCustomModelIds] = useState('');
const [customModelIdsError, setCustomModelIdsError] = useState<string | null>(
  null,
);
```

Nova ação de UI esperada:

```ts
handleCustomApiKeySubmit: (
  protocol: CustomApiProtocol,
  baseUrl: string,
  apiKey: string,
  modelIdsInput: string,
) => Promise<void>;
```

Funções auxiliares esperadas:

```ts
generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string
normalizeCustomModelIds(modelIdsInput: string): string[]
maskApiKey(apiKey: string): string
```

## Critérios de Aceitação

### UX

- Selecionar `/auth -> Chave de API -> Chave de API Personalizada` abre o assistente personalizado em vez da página somente de documentação.
- A primeira etapa do assistente personalizado solicita o protocolo.
- A segunda etapa solicita a URL base e exibe o protocolo selecionado.
- A terceira etapa solicita a chave de API e exibe o protocolo e endpoint selecionados.
- A quarta etapa solicita IDs de modelo e exibe o protocolo e endpoint selecionados.
- A etapa de revisão exibe o JSON gerado, incluindo a chave de API mascarada, o protocolo selecionado e a chave de ambiente gerada.
- Pressionar Enter na etapa de revisão salva as configurações e tenta a autenticação.
- Pressionar Esc navega de volta um passo de cada vez.

### Configurações

- A chave de API é gravada em `settings.json.env[generatedEnvKey]`.
- `generatedEnvKey` é derivado do protocolo selecionado e da `baseUrl` usando o namespace privado do Qwen.
- `modelProviders[selectedProtocol]` recebe uma entrada por ID de modelo normalizado.
- Cada entrada de modelo personalizado usa `id === name`.
- `security.auth.selectedType` é definido como o protocolo selecionado.
- `model.name` é definido como o primeiro ID de modelo normalizado.
- Entradas existentes sob `modelProviders[selectedProtocol]` com um `envKey` diferente são preservadas.
- Entradas existentes sob `modelProviders[selectedProtocol]` com o mesmo `envKey` gerado são substituídas.
- Entradas sob outras chaves de protocolo em `modelProviders` são preservadas.
### Autenticação

- A chave de ambiente gerada é sincronizada com `process.env` antes da atualização da autenticação.
- O aplicativo recarrega a configuração do provedor de modelo antes de `refreshAuth(selectedProtocol)`.
- Autenticação bem-sucedida fecha o diálogo de autenticação e exibe uma mensagem de sucesso.
- Autenticação falha mantém o usuário no fluxo de autenticação e exibe um erro acionável.

### Testes

- Adicione ou atualize os testes do `AuthDialog` para cobrir o caminho do assistente personalizado.
- Adicione testes para seleção de protocolo.
- Adicione testes para geração de chave de ambiente a partir do protocolo e URL base.
- Adicione testes para normalização e deduplicação de ID de modelo.
- Adicione testes para comportamento de mesclagem de configurações:
  - a mesma chave de ambiente gerada substitui entradas personalizadas antigas sob o mesmo protocolo;
  - chaves de ambiente diferentes são preservadas;
  - chaves de ambiente de outros protocolos são preservadas;
  - entradas do Coding Plan e do ModelStudio Standard são preservadas.
- Adicione testes para visualização do JSON gerado, quando aplicável.

## Perguntas em Aberto

1. A entrada da chave de API deve ser mascarada durante a digitação, ou apenas mascarada na tela de revisão?
2. Endpoints locais como `http://localhost:11434/v1` devem permitir chaves de API vazias ou temporárias para servidores que não exigem autenticação?
3. A visualização do JSON gerado deve mostrar apenas o patch que está sendo aplicado, ou a subárvore completa de configurações relevantes resultante após a mesclagem?
4. O Vertex AI deve ser incluído neste assistente de chave de API personalizada, ou permanecer fora porque sua configuração de autenticação difere de provedores simples de chave de API?

Para a primeira versão, os padrões recomendados são:

- Suporte a `openai`, `anthropic` e `gemini`.
- Use o comportamento de entrada existente durante a digitação.
- Exija chave de API não vazia para consistência com fluxos de autenticação por chave de API.
- Mostre o JSON no estilo patch que será salvo ou atualizado.
- Mantenha o Vertex AI fora do assistente de chave de API personalizada até que uma decisão separada de produto seja tomada.
