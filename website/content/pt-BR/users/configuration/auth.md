# Autenticação

O menu `/auth` da primeira execução do Qwen Code possui três opções principais. Escolha aquela que melhor se adequa à forma como você deseja executar a CLI:

- **Alibaba ModelStudio**: configuração oficial recomendada. Abre um submenu com **Coding Plan** (para desenvolvedores individuais · cota semanal incluída), **Token Plan** (para equipes e empresas · faturamento baseado em uso com endpoint dedicado) ou **Standard API Key** (conecte-se com uma chave API do ModelStudio existente).
- **Provedores de Terceiros**: escolha um provedor integrado e conecte-se com uma chave API (DeepSeek, MiniMax, Z.AI, Idealab, ModelScope, OpenRouter, Requesty).
- **Provedor Personalizado**: conecte manualmente um servidor local, proxy ou provedor não suportado — compatível com OpenAI, Anthropic, Gemini e outros endpoints compatíveis.

> [!note]
>
> **O Qwen OAuth não é mais uma entrada selecionável no diálogo** — seu nível gratuito foi descontinuado em 15/04/2026. Ele permanece documentado abaixo apenas como um provedor descontinuado e codificado.

## Opção 1: Qwen OAuth (Descontinuado)

> [!warning]
>
> O nível gratuito do Qwen OAuth foi descontinuado em 15/04/2026. Tokens em cache existentes podem continuar funcionando por um breve período, mas novas solicitações serão rejeitadas. Por favor, mude para o Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) ou outro provedor. Execute `qwen` e use `/auth` para configurar.

- **Como funciona**: na primeira execução, o Qwen Code abre uma página de login no navegador. Após concluir, as credenciais são armazenadas em cache localmente, então geralmente você não precisará fazer login novamente.
- **Requisitos**: uma conta `qwen.ai` + acesso à internet (pelo menos para o primeiro login).
- **Benefícios**: sem gerenciamento de chave API, atualização automática de credenciais.
- **Custo e cota**: o nível gratuito foi descontinuado em 15/04/2026.

Inicie a CLI e siga o fluxo do navegador:

```bash
qwen
```

O Qwen OAuth não é mais oferecido como uma entrada selecionável no diálogo `/auth`; execute `/auth` e escolha uma das opções atuais (Alibaba ModelStudio, Provedores de Terceiros ou Provedor Personalizado).

> [!note]
>
> Em ambientes não interativos ou headless (por exemplo, CI, SSH, contêineres), você geralmente **não** consegue concluir o fluxo de login OAuth no navegador.
> Nesses casos, use o Alibaba Cloud Coding Plan ou o método de autenticação por chave API.

## 💳 Opção 2: Alibaba Cloud Coding Plan

Use esta opção se desejar custos previsíveis com diversas opções de modelo e cotas de uso mais altas.

- **Como funciona**: Assine o Coding Plan com uma taxa mensal fixa e configure o Qwen Code para usar o endpoint dedicado e sua chave API de assinatura.
- **Requisitos**: Obtenha uma assinatura ativa do Coding Plan no [Alibaba Cloud ModelStudio (Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) ou [Alibaba Cloud ModelStudio (intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), dependendo da região da sua conta.
- **Benefícios**: Diversas opções de modelo, cotas de uso mais altas, custos mensais previsíveis, acesso a uma ampla gama de modelos (Qwen, GLM, Kimi, Minimax e mais).
- **Custo e cota**: Consulte a documentação do Aliyun ModelStudio Coding Plan [Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

O Alibaba Cloud Coding Plan está disponível em duas regiões:

| Região                        | URL do Console                                                              |
| ----------------------------- | --------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing)  | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)            |
| Alibaba Cloud (intl)          | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)|

### Configuração interativa

Digite `qwen` no terminal para iniciar o Qwen Code, depois execute o comando `/auth`, selecione **Alibaba ModelStudio** e escolha **Coding Plan** no submenu. Escolha sua região e insira sua chave `sk-sp-xxxxxxxxx`.

Após a autenticação, use o comando `/model` para alternar entre todos os modelos suportados pelo Alibaba Cloud Coding Plan (incluindo qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 e MiniMax-M2.5).

### Configuração headless ou por script

Para CI, contêineres ou scripts, configure o Coding Plan com variáveis de ambiente ou `settings.json` em vez do comando removido `qwen auth coding-plan`.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Use `https://coding.dashscope.aliyuncs.com/v1` para o endpoint da China (Beijing) ou `https://coding-intl.dashscope.aliyuncs.com/v1` para o endpoint internacional.

### Alternativa: configurar via `settings.json`

Se preferir pular o fluxo interativo `/auth`, adicione o seguinte ao `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus (Coding Plan)",
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
          "description": "qwen3-coder-plus do Alibaba Cloud Coding Plan",
          "envKey": "BAILIAN_CODING_PLAN_API_KEY"
        }
      ]
    }
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> O Coding Plan usa um endpoint dedicado (`https://coding.dashscope.aliyuncs.com/v1`) que é diferente do endpoint padrão do Dashscope. Certifique-se de usar o `baseUrl` correto.

## 🚀 Opção 3: Chave API (flexível)

Use esta opção se quiser se conectar a provedores terceiros como OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope ou um endpoint auto-hospedado. Suporta múltiplos protocolos e provedores.

### Recomendado: Configuração em um arquivo via `settings.json`

A maneira mais simples de começar com autenticação por chave API é colocar tudo em um único arquivo `~/.qwen/settings.json`. Aqui está um exemplo completo e pronto para uso:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
          "description": "Qwen3-Coder via Dashscope",
          "envKey": "DASHSCOPE_API_KEY"
        }
      ]
    }
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

O que cada campo faz:

| Campo                        | Descrição                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Declara quais modelos estão disponíveis e como se conectar a eles. As chaves (`openai`, `anthropic`, `gemini`) representam o protocolo da API.           |
| `env`                        | Armazena chaves API diretamente no `settings.json` como fallback (prioridade mais baixa — `export` do shell e arquivos `.env` têm precedência).          |
| `security.auth.selectedType` | Informa ao Qwen Code qual protocolo usar na inicialização (por exemplo, `openai`, `anthropic`, `gemini`). Sem isso, você precisaria executar `/auth` interativamente. |
| `model.name`                 | O modelo padrão a ser ativado quando o Qwen Code iniciar. Deve corresponder a um dos valores `id` em seus `modelProviders`.                              |

Após salvar o arquivo, basta executar `qwen` — nenhuma configuração interativa `/auth` é necessária.

> [!tip]
>
> As seções abaixo explicam cada parte em mais detalhes. Se o exemplo rápido acima funcionar para você, sinta-se à vontade para pular para [Notas de segurança](#notas-de-segurança).

O conceito chave é **Provedores de Modelo** (`modelProviders`): O Qwen Code suporta múltiplos protocolos de API, não apenas OpenAI. Você configura quais provedores e modelos estão disponíveis editando `~/.qwen/settings.json` e depois alterna entre eles em tempo de execução com o comando `/model`.

#### Protocolos suportados

| Protocolo          | Chave `modelProviders` | Variáveis de ambiente                                                                                      | Provedores                                                                                                  |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Compatível com OpenAI | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`                                                        | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, qualquer endpoint compatível com OpenAI |
| Anthropic          | `anthropic`            | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                               | Anthropic Claude                                                                                            |
| Google GenAI       | `gemini`               | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                           | Google Gemini                                                                                               |
| Vertex AI          | `vertex-ai`            | `GOOGLE_API_KEY`, `GOOGLE_MODEL` (define `GOOGLE_GENAI_USE_VERTEXAI=true`; usa o protocolo `gemini`)        | Google Vertex AI                                                                                            |

#### Passo 1: Configurar modelos e provedores em `~/.qwen/settings.json`

Defina quais modelos estão disponíveis para cada protocolo. Cada entrada de modelo requer no mínimo um `id`; `envKey` (o nome da variável de ambiente que armazena sua chave API) é opcional e recomendado — quando omitido, usa a chave de ambiente padrão do tipo de autenticação (por exemplo, `OPENAI_API_KEY` para `openai`).

> [!important]
>
> É recomendado definir `modelProviders` no `~/.qwen/settings.json` de escopo do usuário para evitar conflitos de mesclagem entre configurações de projeto e de usuário.

Edite `~/.qwen/settings.json` (crie-o se não existir). Você pode misturar vários protocolos em um único arquivo — aqui está um exemplo de múltiplos provedores mostrando apenas a seção `modelProviders`:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "envKey": "OPENAI_API_KEY",
          "baseUrl": "https://api.openai.com/v1"
        }
      ]
    },
    "anthropic": {
      "protocol": "anthropic",
      "models": [
        {
          "id": "claude-sonnet-4-20250514",
          "name": "Claude Sonnet 4",
          "envKey": "ANTHROPIC_API_KEY"
        }
      ]
    },
    "gemini": {
      "protocol": "gemini",
      "models": [
        {
          "id": "gemini-2.5-pro",
          "name": "Gemini 2.5 Pro",
          "envKey": "GEMINI_API_KEY"
        }
      ]
    }
  }
}
```

> [!tip]
>
> Não se esqueça de também definir `env`, `security.auth.selectedType` e `model.name` juntamente com `modelProviders` — veja o [exemplo completo acima](#recomendado-configuracao-em-um-arquivo-via-settingsjson) para referência.

**Campos de `ModelConfig` (cada entrada dentro de `modelProviders`):**

| Campo              | Obrigatório | Descrição                                                                                                                                                     |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Sim         | ID do modelo enviado para a API (por exemplo, `gpt-4o`, `claude-sonnet-4-20250514`)                                                                            |
| `name`             | Não         | Nome de exibição no seletor `/model` (padrão é `id`)                                                                                                          |
| `envKey`           | Não         | Nome da variável de ambiente para a chave API (por exemplo, `OPENAI_API_KEY`); opcional/recomendado — usa a chave de ambiente padrão do tipo de autenticação quando omitido |
| `baseUrl`          | Não         | Substituição do endpoint da API (útil para proxies ou endpoints personalizados)                                                                               |
| `generationConfig` | Não         | Ajuste fino de `timeout`, `maxRetries`, `samplingParams`, etc.                                                                                                 |

> [!note]
>
> Ao usar o campo `env` no `settings.json`, as credenciais são armazenadas em texto simples. Para maior segurança, prefira arquivos `.env` ou `export` do shell — veja [Passo 2](#passo-2-definir-variaveis-de-ambiente).

Para o esquema completo de `modelProviders` e opções avançadas como `generationConfig`, `customHeaders` e `extra_body`, consulte [Referência de Provedores de Modelo](model-providers.md).

#### Passo 2: Definir variáveis de ambiente

O Qwen Code lê chaves API de variáveis de ambiente (especificadas por `envKey` na configuração do seu modelo). Existem várias maneiras de fornecê-las, listadas abaixo da **maior para a menor prioridade**:

**1. Ambiente do shell / `export` (maior prioridade)**

Defina diretamente no seu perfil do shell (`~/.zshrc`, `~/.bashrc`, etc.) ou inline antes de iniciar:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / compatível com OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Arquivos `.env`**

O Qwen Code carrega automaticamente o **primeiro** arquivo `.env` que encontrar (as variáveis **não são mescladas** entre vários arquivos). Apenas variáveis que ainda não estão presentes em `process.env` são carregadas.

Ordem de busca (a partir do diretório atual, subindo até `/`):

1. `.qwen/.env` (preferido — mantém as variáveis do Qwen Code isoladas de outras ferramentas)
2. `.env`

Se nada for encontrado, ele usa como fallback o **diretório home**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` é recomendado em vez de `.env` para evitar conflitos com outras ferramentas. Algumas variáveis (como `DEBUG` e `DEBUG_MODE`) são excluídas de arquivos `.env` no nível do projeto para evitar interferir no comportamento do Qwen Code.

**3. `settings.json` → campo `env` (menor prioridade)**

Você também pode definir chaves API diretamente em `~/.qwen/settings.json` sob a chave `env`. Elas são carregadas como **fallback de menor prioridade** — aplicadas apenas quando uma variável ainda não foi definida pelo ambiente do sistema ou por arquivos `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Esta é a abordagem usada no [exemplo de configuração em um arquivo](#recomendado-configuracao-em-um-arquivo-via-settingsjson) acima. É conveniente para manter tudo em um só lugar, mas lembre-se de que `settings.json` pode ser compartilhado ou sincronizado — prefira arquivos `.env` para segredos sensíveis.

**Resumo de prioridades:**

| Prioridade   | Fonte                           | Comportamento de substituição                     |
| ------------ | ------------------------------- | ------------------------------------------------- |
| 1 (maior)    | Flags da CLI (`--openai-api-key`)| Sempre vence                                      |
| 2            | Ambiente do sistema (`export`, inline) | Substitui `.env` e `settings.json` → `env` |
| 3            | Arquivo `.env`                  | Só define se não estiver no ambiente do sistema   |
| 4 (menor)    | `settings.json` → `env`         | Só define se não estiver no sistema ou `.env`     |

#### Passo 3: Alternar modelos com `/model`

Após iniciar o Qwen Code, use o comando `/model` para alternar entre todos os modelos configurados. Os modelos são agrupados por protocolo:

```
/model
```

O seletor mostrará todos os modelos da sua configuração `modelProviders`, agrupados por seu protocolo (por exemplo, `openai`, `anthropic`, `gemini`). Sua seleção é persistida entre sessões.

Você também pode alternar modelos diretamente com um argumento de linha de comando, o que é conveniente ao trabalhar em vários terminais.

```bash
# Em um terminal

qwen --model "qwen3-coder-plus"

# Em outro terminal

qwen --model "qwen3.5-plus"
```

## Comando CLI `qwen auth` removido

O comando CLI independente `qwen auth` foi removido. Use estes substitutos:

| Caso de uso anterior              | Substituto                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Configuração interativa de autenticação | Execute `qwen`, depois use `/auth`                                                              |
| Configuração do Coding Plan       | Use `/auth` ou defina `BAILIAN_CODING_PLAN_API_KEY` com a URL base do Coding Plan                   |
| Configuração do OpenRouter        | Use `/auth` ou defina `OPENROUTER_API_KEY` e `OPENAI_BASE_URL=https://openrouter.ai/api/v1`         |
| Configuração do Requesty          | Use `/auth` ou defina `REQUESTY_API_KEY` e `OPENAI_BASE_URL=https://router.requesty.ai/v1`          |
| Configuração de chave API ou provedor personalizado | Configure `~/.qwen/settings.json`, `.env` ou variáveis de ambiente específicas do provedor |
| Verificar autenticação atual       | Execute `/doctor` dentro do Qwen Code                                                               |
| Fluxo OAuth no navegador          | Execute `qwen` interativamente e use `/auth`; OAuth não pode ser configurado apenas com variáveis de ambiente |

Invocações legadas como `qwen auth status` agora exibem um aviso de remoção com esses caminhos de migração.

## Notas de segurança

- Não comprometa chaves API no controle de versão.
- Prefira `.qwen/.env` para segredos locais do projeto (e mantenha-o fora do git).
- Trate a saída do terminal como sensível se ela exibir credenciais para verificação.