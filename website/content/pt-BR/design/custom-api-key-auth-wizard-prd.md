# PRD do Assistente de Chave de API Personalizada com Autenticação

## Resumo

Melhorar a experiência de `/auth -> Chave de API -> Chave de API Personalizada` substituindo a tela atual com apenas documentação por um assistente de configuração no terminal para provedores de API personalizados.

O Qwen Code oferece suporte a vários protocolos de API através das chaves `authType` / `modelProviders`, incluindo `openai`, `anthropic` e `gemini`. Portanto, o assistente de configuração personalizada deve começar pedindo ao usuário que selecione o protocolo, depois coletar informações de endpoint, chave e modelo para esse protocolo.

O assistente guia os usuários através de:

```text
Selecionar Protocolo -> Inserir URL Base -> Inserir Chave de API -> Inserir IDs de Modelo -> Revisar JSON -> Salvar + autenticar
```

Isso mantém a configuração da chave de API personalizada dentro do Qwen Code, reduz a necessidade de editar manualmente o `settings.json` e torna a configuração final transparente ao mostrar o JSON gerado antes de salvar.

## Contexto

Atualmente, selecionar `Chave de API Personalizada` em `/auth` mostra uma tela de informações estática:

```text
Configuração Personalizada

Você pode configurar sua chave de API e modelos em settings.json

Consulte a documentação para instruções de configuração
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/

Esc para voltar
```

Isso exige que os usuários saiam da CLI, leiam a documentação, entendam o `settings.json`, configurem manualmente os `modelProviders`, escolham um `envKey`, adicionem chaves de API e então retornem ao Qwen Code. Os usuários relataram que esse fluxo é difícil e desconectado do resto da experiência `/auth`.

O caminho atual da Chave de API Padrão do ModelStudio já oferece um fluxo de configuração guiado:

```text
Chave de API Padrão do Alibaba Cloud ModelStudio
└─ Selecionar Região
   └─ Inserir Chave de API
      └─ Inserir IDs de Modelo
         └─ Salvar + autenticar
```

A configuração da chave de API personalizada deve oferecer uma experiência guiada semelhante, respeitando também que o Qwen Code oferece suporte a vários protocolos de provedores.

## Declaração do Problema

O caminho da chave de API personalizada atualmente é um beco sem saída dentro do `/auth`:

```text
/auth
└─ Selecionar Método de Autenticação
   ├─ Plano de Programação Alibaba Cloud
   ├─ Chave de API
   │  └─ Selecionar Tipo de Chave de API
   │     ├─ Chave de API Padrão do Alibaba Cloud ModelStudio
   │     │  ├─ Selecionar Região
   │     │  ├─ Inserir Chave de API
   │     │  ├─ Inserir IDs de Modelo
   │     │  └─ Salvar + autenticar
   │     │
   │     └─ Chave de API Personalizada
   │        └─ Tela apenas com documentação
   │
   └─ Qwen OAuth
```

Isso causa vários problemas de usabilidade:

- Os usuários não conseguem concluir a configuração do provedor personalizado a partir do `/auth`.
- Os usuários precisam entender conceitos de configuração de baixo nível antes de poderem autenticar.
- Os usuários podem não saber quais campos são obrigatórios: `authType`, `baseUrl`, `envKey`, `modelProviders`, `model.name` e `security.auth.selectedType`.
- Os usuários podem acidentalmente entrar em conflito com variáveis de ambiente existentes ou sobrescrever a configuração existente do provedor.
- Os usuários não recebem feedback imediato de autenticação após editar as configurações manualmente.

## Objetivos

1. Permitir que os usuários configurem um provedor de API personalizado completamente dentro do `/auth`.
2. Oferecer suporte aos principais protocolos que o Qwen Code suporta em `modelProviders`: `openai`, `anthropic` e `gemini`.
3. Manter o fluxo próximo ao fluxo existente do ModelStudio Padrão.
4. Tratar `baseUrl` como o equivalente de `region` para provedores personalizados.
5. Gerar automaticamente um `envKey` privado gerenciado pelo Qwen a partir do protocolo selecionado e do `baseUrl` informado.
6. Armazenar a chave de API em `settings.json.env`, consistente com o padrão atual de credenciais gerenciadas pelo Qwen.
7. Evitar conflitos com variáveis de ambiente do shell do usuário usando um nome de chave gerado específico do Qwen.
8. Mostrar o JSON gerado antes de salvar para que os usuários possam revisar as alterações exatas nas configurações.
9. Preservar entradas existentes de `modelProviders` não relacionadas.
10. Autenticar imediatamente após salvar e mostrar feedback de sucesso ou falha.

## Não-objetivos

1. Não exigir que os usuários insiram manualmente o `envKey`.
2. Não introduzir o nome do provedor como um conceito separado.
3. Não adicionar `generationConfig`, `capabilities` ou sobrescritas por modelo avançados ao assistente.
4. Não remover completamente o link da documentação; ele deve permanecer disponível para configuração avançada.
5. Não alterar os fluxos existentes do Plano de Programação ou da Chave de API Padrão do ModelStudio.
6. Não tentar detectar automaticamente o protocolo a partir do `baseUrl` na primeira versão; os usuários selecionam o protocolo explicitamente.

## Usuários-alvo

- Usuários que trazem seu próprio endpoint de API personalizado.
- Usuários configurando provedores como APIs compatíveis com OpenAI, APIs compatíveis com Anthropic, APIs compatíveis com Gemini, vLLM, Ollama, LM Studio ou gateways internos.
- Usuários que preferem configurar a autenticação pela CLI em vez de editar manualmente o `settings.json`.

## Protocolos Suportados

O assistente deve inicialmente expor estas opções de protocolo:

```text
openai
anthropic
gemini
```

Cada protocolo mapeia diretamente para uma chave `modelProviders` e um valor `security.auth.selectedType`.

| Opção de protocolo       | Chave de tipo de autenticação / modelProviders | Observações                                                                               |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Compatível com OpenAI    | `openai`                                       | OpenAI, OpenRouter, Fireworks, servidores locais compatíveis com OpenAI, gateways internos |
| Compatível com Anthropic | `anthropic`                                    | Endpoints compatíveis com Anthropic                                                       |
| Compatível com Gemini    | `gemini`                                       | Endpoints compatíveis com Gemini                                                         |

## Visão Geral da Experiência do Usuário

### Árvore `/auth` atualizada

```text
/auth
└─ Selecionar Método de Autenticação
   ├─ Plano de Programação Alibaba Cloud
   │  └─ Selecionar Região
   │     └─ Inserir Chave de API
   │        └─ Salvar + autenticar
   │
   ├─ Chave de API
   │  └─ Selecionar Tipo de Chave de API
   │     ├─ Chave de API Padrão do Alibaba Cloud ModelStudio
   │     │  ├─ Selecionar Região
   │     │  ├─ Inserir Chave de API
   │     │  ├─ Inserir IDs de Modelo
   │     │  └─ Salvar + autenticar
   │     │
   │     └─ Chave de API Personalizada
   │        ├─ Selecionar Protocolo
   │        ├─ Inserir URL Base
   │        ├─ Inserir Chave de API
   │        ├─ Inserir IDs de Modelo
   │        ├─ Revisar JSON gerado
   │        └─ Salvar + autenticar
   │
   └─ Qwen OAuth
```

### Máquina de estados da Chave de API Personalizada

```text
selecao-tipo-chave-api
  │
  └─ CHAVE_API_PERSONALIZADA
      │
      ▼
selecao-protocolo-personalizado
      │ Enter
      ▼
entrada-url-base-personalizada
      │ Enter
      │ gerar envKey a partir do protocolo + baseUrl
      ▼
entrada-chave-api-personalizada
      │ Enter
      ▼
entrada-id-modelo-personalizada
      │ Enter
      ▼
revisao-json-personalizada
      │ Enter
      ▼
salvar configurações + refreshAuth(protocoloSelecionado)
```

### Comportamento de escape

```text
revisao-json-personalizada
  Esc -> entrada-id-modelo-personalizada

entrada-id-modelo-personalizada
  Esc -> entrada-chave-api-personalizada

entrada-chave-api-personalizada
  Esc -> entrada-url-base-personalizada

entrada-url-base-personalizada
  Esc -> selecao-protocolo-personalizado

selecao-protocolo-personalizado
  Esc -> selecao-tipo-chave-api
```

## Design Detalhado da Interação

### Passo 1: Selecionar Protocolo

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · Selecionar Protocolo            │
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

- A chave `modelProviders` a ser atualizada.
- O valor `security.auth.selectedType` a ser persistido.
- O rótulo do protocolo mostrado nas telas seguintes.
- O tipo de autenticação `refreshAuth()` usado após salvar.

### Passo 2: Inserir URL Base

`baseUrl` é o equivalente da seleção de região para provedores personalizados. Deve vir antes da entrada da chave de API porque determina a qual endpoint a chave de API pertence.

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
- Remover espaços em branco no início e no final.
- Preservar a string normalizada conforme inserida, exceto a remoção de espaços.

Ao enviar válido:

- Gerar o `envKey` gerenciado pelo Qwen a partir do protocolo selecionado e do `baseUrl`.
- Avançar para a entrada da chave de API.

### Passo 3: Inserir Chave de API

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · Chave de API                    │
│                                                              │
│ Protocolo: Compatível com OpenAI                             │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Insira a chave de API para este endpoint.                    │
│                                                              │
│ Chave de API: sk-or-v1-••••••••••••••••_                     │
│                                                              │
│ Enter para continuar, Esc para voltar                        │
└──────────────────────────────────────────────────────────────┘
```

Validação:

- Obrigatório.
- Remover espaços em branco no início e no final.

Observações:

- A entrada pode usar inicialmente o comportamento de entrada de texto existente para consistência com fluxos próximos.
- A tela de revisão deve mascarar a chave de API.

### Passo 4: Inserir IDs de Modelo

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · IDs de Modelo                   │
│                                                              │
│ Protocolo: Compatível com OpenAI                             │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Insira um ou mais IDs de modelo, separados por vírgulas.     │
│                                                              │
│ IDs de Modelo: qwen/qwen3-coder,openai/gpt-4.1_              │
│                                                              │
│ Enter para continuar, Esc para voltar                        │
└──────────────────────────────────────────────────────────────┘
```

Validação:

- Obrigatório.
- Dividir por vírgula.
- Remover espaços em branco de cada ID de modelo.
- Remover entradas vazias.
- Deduplicar entradas preservando a ordem.
- Pelo menos um ID de modelo deve permanecer.

Nomenclatura do modelo:

- `id` e `name` devem ser iguais.
- Nenhum nome de provedor separado é solicitado ao usuário.

Exemplo:

```text
Entrada:
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

Normalizado:
qwen/qwen3-coder, openai/gpt-4.1
```

### Passo 5: Revisar JSON

Antes de salvar, mostrar o trecho JSON gerado que será escrito ou mesclado no `settings.json`.

Exemplo compatível com OpenAI:

```text
┌──────────────────────────────────────────────────────────────┐
│ Chave de API Personalizada · Revisar                         │
│                                                              │
│ O seguinte JSON será salvo no settings.json:                 │
│                                                              │
│ {                                                            │
│   "env": {                                                   │
│     "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1": │
│       "sk-••••••••••••••••"                                  │
│   },                                                         │
│   "modelProviders": {                                        │
│     "openai": [                                              │
│       {                                                      │
│         "id": "qwen/qwen3-coder",                            │
│         "name": "qwen/qwen3-coder",                          │
│         "baseUrl": "https://openrouter.ai/api/v1",           │
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
│     "name": "qwen/qwen3-coder"                               │
│   }                                                          │
│ }                                                            │
│                                                              │
│ Enter para salvar, Esc para voltar                           │
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

- Usar o protocolo selecionado como a chave `modelProviders`.
- Usar o protocolo selecionado como `security.auth.selectedType`.
- Usar o `envKey` gerado real.
- Mascarar a chave de API.
- Usar o `baseUrl` inserido pelo usuário.
- Usar `id === name` para cada modelo.
- Mostrar `model.name` definido como o primeiro ID de modelo normalizado.

Se o JSON for muito largo para o terminal atual, a quebra de linha é aceitável. O objetivo é transparência, não formatação perfeita para copiar e colar.

### Passo 6: Salvar e Autenticar

Ao pressionar Enter na tela de revisão:

```text
salvar:
  env[chaveEnvGerada] = chaveApi
  modelProviders[protocoloSelecionado] = [
    ...novas configurações personalizadas usando chaveEnvGerada,
    ...configurações existentes cujo envKey !== chaveEnvGerada
  ]
  security.auth.selectedType = protocoloSelecionado
  model.name = primeiroIdModelo
  recarregarConfigModelProviders()
  refreshAuth(protocoloSelecionado)
```

Mensagem de sucesso:

```text
Chave de API personalizada autenticada com sucesso. Configurações atualizadas com chave de ambiente gerada e configuração do provedor de modelo.
Dica: Use /model para alternar entre os modelos configurados.
```

A mensagem de falha deve preservar o padrão de falha de autenticação existente, com dicas adicionais voltadas ao usuário, se possível:

```text
Falha na autenticação. Mensagem: <erro>

Por favor, verifique:
- A URL Base é compatível com o protocolo selecionado
- A chave de API é válida para este endpoint
- O ID do modelo existe para este provedor
```

## Geração da Chave de Ambiente

O assistente não deve pedir aos usuários que insiram um `envKey`.

As chaves de API gerenciadas pelo Qwen são armazenadas em `settings.json.env`, portanto, a chave de ambiente deve ser gerada automaticamente sob um namespace específico do Qwen. Isso evita colisões com variáveis de ambiente gerenciadas pelo usuário e impede que vários endpoints personalizados se sobrescrevam.

### Formato

```text
QWEN_CUSTOM_API_KEY_${PROTOCOLO}_${URL_BASE_NORMALIZADA}
```

Incluir o protocolo evita colisões quando o mesmo endpoint é usado sob diferentes adaptadores de protocolo.

### Exemplos

```text
Protocolo: openai
URL Base: https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

Protocolo: openai
URL Base: https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

Protocolo: anthropic
URL Base: https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

Protocolo: gemini
URL Base: https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

Protocolo: openai
URL Base: http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### Regra de normalização

```text
protocolo
  -> remover espaços
  -> maiúsculas
  -> substituir todo caractere que não seja A-Z / 0-9 por _

urlBase
  -> remover espaços
  -> maiúsculas
  -> substituir todo caractere que não seja A-Z / 0-9 por _
  -> colapsar caracteres _ consecutivos
  -> remover _ iniciais/finais

retornar QWEN_CUSTOM_API_KEY_${PROTOCOLO_NORMALIZADO}_${URL_BASE_NORMALIZADA}
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
## Projeto de Escrita de Configurações

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

Para `anthropic`, a mesma estrutura é usada, exceto:

```text
modelProviders.anthropic
security.auth.selectedType = anthropic
refreshAuth(anthropic)
```

Para `gemini`, a mesma estrutura é usada, exceto:

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

Isso mantém o comportamento consistente com as regras de propriedade de `modelProviders` existentes.

### Backup

Antes de escrever, faça backup do arquivo de configurações de destino, de forma consistente com os fluxos existentes do Coding Plan e do ModelStudio Standard.

### Sincronização com o environment do processo

Após escrever `settings.json.env[generatedEnvKey]`, sincronize imediatamente:

```text
process.env[generatedEnvKey] = apiKey
```

Isso garante que `refreshAuth(selectedProtocol)` possa usar a chave recém-inserida na mesma sessão.

### Regra de mesclagem dos provedores de modelo

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

- Reconfigurar o mesmo protocolo + `baseUrl` substitui os modelos antigos para aquele endpoint.
- Configurar um protocolo ou `baseUrl` diferente usa uma chave de ambiente diferente e não sobrescreve endpoints customizados anteriores.
- Configurações do Coding Plan, ModelStudio Standard e outras são preservadas, a menos que usem a mesma chave de ambiente gerada sob o mesmo protocolo.
- As novas configurações são colocadas primeiro para que os modelos recém-configurados fiquem imediatamente visíveis e selecionados por padrão.

## Tratamento de Erros

### Erro de validação de protocolo

O protocolo deve ser um dos seguintes:

```text
openai
anthropic
gemini
```

### Erro de validação da Base URL

```text
Base URL não pode estar vazia.
```

```text
Base URL deve começar com http:// ou https://.
```

### Erro de validação da chave de API

```text
Chave de API não pode estar vazia.
```

### Erro de validação dos IDs de modelo

```text
IDs de modelo não podem estar vazios.
```

### Falha de autenticação

Use o mecanismo de falha existente sempre que possível, mas a mensagem exibida ao usuário deve ajudá-lo a se recuperar:

```text
Falha ao autenticar. Mensagem: <message>

Verifique:
- Se a Base URL é compatível com o protocolo selecionado
- Se a chave de API é válida para este endpoint
- Se o ID do modelo existe para este provedor
```

## Link para Documentação

O assistente ainda deve expor a documentação existente de provedores de modelo para usuários avançados.

Posicionamento recomendado:

- No rodapé da tela de revisão, ou
- Como texto secundário na tela da Base URL.

Texto sugerido:

```text
Precisa de generationConfig ou capacidades avançadas? Veja:
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## Notas de Implementação

Níveis de visão esperados no `AuthDialog`:

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

Tipo de protocolo customizado esperado:

```ts
type CustomApiProtocol =
  | AuthType.USE_OPENAI
  | AuthType.USE_ANTHROPIC
  | AuthType.USE_GEMINI;
```

Novo estado esperado no `AuthDialog`:

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

- Selecionar `/auth -> API Key -> Custom API Key` abre o assistente customizado em vez da página somente com documentação.
- O primeiro passo do assistente customizado pede o protocolo.
- O segundo passo pede a Base URL e exibe o protocolo selecionado.
- O terceiro passo pede a chave de API e exibe o protocolo e o endpoint selecionados.
- O quarto passo pede os IDs de modelo e exibe o protocolo e o endpoint selecionados.
- A etapa de revisão exibe o JSON gerado, incluindo a chave de API mascarada, o protocolo selecionado e a chave de ambiente gerada.
- Pressionar Enter na etapa de revisão salva as configurações e tenta autenticar.
- Pressionar Esc navega de volta um passo de cada vez.

### Configurações

- A chave de API é escrita em `settings.json.env[generatedEnvKey]`.
- `generatedEnvKey` é derivado do protocolo selecionado e da `baseUrl` usando o namespace privado da Qwen.
- `modelProviders[selectedProtocol]` recebe uma entrada por ID de modelo normalizado.
- Cada entrada de modelo customizado usa `id === name`.
- `security.auth.selectedType` é definido como o protocolo selecionado.
- `model.name` é definido como o primeiro ID de modelo normalizado.
- Entradas existentes em `modelProviders[selectedProtocol]` com uma `envKey` diferente são preservadas.
- Entradas existentes em `modelProviders[selectedProtocol]` com a mesma `generatedEnvKey` são substituídas.
- Entradas em outras chaves de protocolo de `modelProviders` são preservadas.

### Autenticação

- A chave de ambiente gerada é sincronizada com `process.env` antes da atualização de autenticação.
- O aplicativo recarrega a configuração do provedor de modelo antes de `refreshAuth(selectedProtocol)`.
- Autenticação bem-sucedida fecha o diálogo de autenticação e exibe uma mensagem de sucesso.
- Falha de autenticação mantém o usuário no fluxo de autenticação e exibe um erro acionável.

### Testes

- Adicionar ou atualizar testes do `AuthDialog` para cobrir o caminho do assistente customizado.
- Adicionar testes para seleção de protocolo.
- Adicionar testes para geração da chave de ambiente a partir do protocolo e da Base URL.
- Adicionar testes para normalização e deduplicação de IDs de modelo.
- Adicionar testes para comportamento de mesclagem de configurações:
  - mesma chave de ambiente gerada substitui entradas customizadas antigas sob o mesmo protocolo;
  - chaves de ambiente diferentes são preservadas;
  - outras chaves de protocolo são preservadas;
  - entradas do Coding Plan e do ModelStudio Standard são preservadas.
- Adicionar testes para pré-visualização do JSON gerado, quando aplicável.

## Perguntas em Aberto

1. A chave de API deve ser mascarada durante a digitação, ou apenas na tela de revisão?
2. Endpoints locais como `http://localhost:11434/v1` devem permitir chaves de API vazias ou placeholders para servidores que não exigem autenticação?
3. A pré-visualização do JSON gerado deve mostrar apenas o patch sendo aplicado, ou a árvore completa de configurações relevantes após a mesclagem?
4. O Vertex AI deve ser incluído neste assistente de chave de API customizada, ou permanecer fora porque sua configuração de autenticação difere de provedores simples com chave de API?

Para a primeira versão, os padrões recomendados são:

- Suportar `openai`, `anthropic` e `gemini`.
- Usar o comportamento de entrada existente durante a digitação.
- Exigir chave de API não vazia para consistência com fluxos de autenticação por chave de API.
- Mostrar o JSON no formato de patch que será salvo ou atualizado.
- Manter o Vertex AI fora do assistente de chave de API customizada até que uma decisão de produto separada seja tomada.