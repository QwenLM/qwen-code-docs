# Autenticação

O menu `/auth` da primeira execução do Qwen Code tem três opções de nível superior. Escolha a que corresponde a como você deseja executar a CLI:

- **Alibaba ModelStudio**: configuração oficial recomendada. Abre um submenu com **Coding Plan** (para desenvolvedores individuais · cota semanal incluída), **Token Plan** (para equipes e empresas · cobrança baseada no uso com um endpoint dedicado) ou **Standard API Key** (conecte-se com uma API key existente do ModelStudio).
- **Third-party Providers**: escolha um provedor integrado e conecte-se com uma API key (DeepSeek, MiniMax, Z.AI, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider**: conecte manualmente um servidor local, proxy ou provedor não suportado — suporta OpenAI, Anthropic, Gemini e outros endpoints compatíveis.

> [!note]
>
> **Qwen OAuth** não é mais uma entrada selecionável no diálogo — sua camada gratuita foi descontinuada em 2026-04-15. Ele permanece documentado abaixo apenas como um provedor codificado e descontinuado.

## Opção 1: Qwen OAuth (Descontinuado)

> [!warning]
>
> A camada gratuita do Qwen OAuth foi descontinuada em 2026-04-15. Tokens em cache existentes podem continuar funcionando brevemente, mas novas requisições serão rejeitadas. Por favor, mude para o Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) ou outro provedor. Execute `qwen` e use `/auth` para configurar.

- **Como funciona**: na primeira inicialização, o Qwen Code abre uma página de login no navegador. Após concluir, as credenciais são armazenadas em cache localmente, então geralmente você não precisará fazer login novamente.
- **Requisitos**: uma conta `qwen.ai` + acesso à internet (pelo menos para o primeiro login).
- **Benefícios**: sem gerenciamento de API key, atualização automática de credenciais.
- **Custo e cota**: a camada gratuita foi descontinuada a partir de 2026-04-15.

Inicie a CLI e siga o fluxo do navegador:

```bash
qwen
```

O Qwen OAuth não é mais oferecido como uma entrada selecionável no diálogo `/auth`; execute `/auth` e escolha uma das opções atuais (Alibaba ModelStudio, Third-party Providers ou Custom Provider).

> [!note]
>
> Em ambientes não interativos ou sem interface gráfica (por exemplo, CI, SSH, contêineres), você normalmente **não consegue** concluir o fluxo de login do navegador via OAuth.
> Nesses casos, use o Alibaba Cloud Coding Plan ou o método de autenticação por API Key.

## 💳 Opção 2: Alibaba Cloud Coding Plan

Use esta opção se você deseja custos previsíveis com diversas opções de modelos e cotas de uso mais altas.

- **Como funciona**: Assine o Coding Plan com uma taxa mensal fixa e, em seguida, configure o Qwen Code para usar o endpoint dedicado e sua API key de assinatura.
- **Requisitos**: Obtenha uma assinatura ativa do Coding Plan no [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) ou [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), dependendo da região da sua conta.
- **Benefícios**: Diversas opções de modelos, cotas de uso mais altas, custos mensais previsíveis, acesso a uma ampla gama de modelos (Qwen, GLM, Kimi, Minimax e mais).
- **Custo e cota**: Consulte a documentação do Aliyun ModelStudio Coding Plan[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

O Alibaba Cloud Coding Plan está disponível em duas regiões:

| Região                       | URL do Console                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Configuração interativa

Digite `qwen` no terminal para iniciar o Qwen Code, execute o comando `/auth`, selecione **Alibaba ModelStudio** e escolha **Coding Plan** no submenu. Escolha sua região e, em seguida, insira sua chave `sk-sp-xxxxxxxxx`.

Após a autenticação, use o comando `/model` para alternar entre todos os modelos suportados pelo Alibaba Cloud Coding Plan (incluindo qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 e MiniMax-M2.5).

### Configuração headless ou via script

Para CI, contêineres ou scripts, configure o Coding Plan com variáveis de ambiente ou `settings.json` em vez do comando removido `qwen auth coding-plan`.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Use `https://coding.dashscope.aliyuncs.com/v1` para o endpoint da China (Beijing) ou `https://coding-intl.dashscope.aliyuncs.com/v1` para o endpoint internacional.

### Alternativa: configurar via `settings.json`

Se preferir pular o fluxo interativo do `/auth`, adicione o seguinte ao `~/.qwen/settings.json`:

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
          "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
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

## 🚀 Opção 3: API Key (flexível)

Use esta opção se você deseja se conectar a provedores terceiros como OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope ou um endpoint auto-hospedado. Suporta múltiplos protocolos e provedores.

### Recomendado: Configuração em um único arquivo via `settings.json`

A maneira mais simples de começar com a autenticação por API Key é colocar tudo em um único arquivo `~/.qwen/settings.json`. Aqui está um exemplo completo e pronto para uso:

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

| Campo                        | Descrição                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Declara quais modelos estão disponíveis e como se conectar a eles. As chaves (`openai`, `anthropic`, `gemini`) representam o protocolo da API.              |
| `env`                        | Armazena API keys diretamente no `settings.json` como um fallback (menor prioridade — `export` do shell e arquivos `.env` têm precedência).                  |
| `security.auth.selectedType` | Informa ao Qwen Code qual protocolo usar na inicialização (por exemplo, `openai`, `anthropic`, `gemini`). Sem isso, você precisaria executar o `/auth` interativamente. |
| `model.name`                 | O modelo padrão a ser ativado quando o Qwen Code iniciar. Deve corresponder a um dos valores de `id` no seu `modelProviders`.                                |

Após salvar o arquivo, basta executar `qwen` — nenhuma configuração interativa do `/auth` é necessária.

> [!tip]
>
> As seções abaixo explicam cada parte com mais detalhes. Se o exemplo rápido acima funcionar para você, sinta-se à vontade para pular para as [Notas de segurança](#security-notes).

O conceito principal é **Model Providers** (`modelProviders`): o Qwen Code suporta múltiplos protocolos de API, não apenas o OpenAI. Você configura quais provedores e modelos estão disponíveis editando o `~/.qwen/settings.json` e, em seguida, alterna entre eles em tempo de execução com o comando `/model`.

#### Protocolos suportados

| Protocolo          | Chave `modelProviders` | Variáveis de ambiente                                                                                | Provedores                                                                                             |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Compatível com OpenAI | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (alias: `QWEN_MODEL`)                            | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, qualquer endpoint compatível com OpenAI |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                         | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                     | Google Gemini                                                                                         |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY`, `GOOGLE_MODEL` (define `GOOGLE_GENAI_USE_VERTEXAI=true`; usa o protocolo `gemini`) | Google Vertex AI                                                                                      |

#### Passo 1: Configurar modelos e provedores em `~/.qwen/settings.json`

Defina quais modelos estão disponíveis para cada protocolo. Cada entrada de modelo requer no mínimo um `id`; `envKey` (o nome da variável de ambiente que contém sua API key) é opcional e recomendado — quando omitido, ele usa o fallback para a chave de ambiente padrão do tipo de autenticação (por exemplo, `OPENAI_API_KEY` para `openai`).

> [!important]
>
> Recomenda-se definir `modelProviders` no `~/.qwen/settings.json` no escopo do usuário para evitar conflitos de merge entre as configurações do projeto e do usuário.

Edite o `~/.qwen/settings.json` (crie-o se não existir). Você pode misturar múltiplos protocolos em um único arquivo — aqui está um exemplo com múltiplos provedores mostrando apenas a seção `modelProviders`:

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
> Não se esqueça de também definir `env`, `security.auth.selectedType` e `model.name` junto com `modelProviders` — veja o [exemplo completo acima](#recommended-one-file-setup-via-settingsjson) como referência.

**Campos de `ModelConfig` (cada entrada dentro de `modelProviders`):**

| Campo              | Obrigatório | Descrição                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Sim      | ID do modelo enviado para a API (por exemplo, `gpt-4o`, `claude-sonnet-4-20250514`)                                                                               |
| `name`             | Não       | Nome de exibição no seletor `/model` (padrão para `id`)                                                                                             |
| `envKey`           | Não       | Nome da variável de ambiente para a API key (por exemplo, `OPENAI_API_KEY`); opcional/recomendado — usa o fallback para a chave de ambiente padrão do tipo de autenticação quando omitido |
| `baseUrl`          | Não       | Substituição do endpoint da API (útil para proxies ou endpoints personalizados)                                                                                     |
| `generationConfig` | Não       | Ajuste fino de `timeout`, `maxRetries`, `samplingParams`, etc.                                                                                          |

> [!note]
>
> Ao usar o campo `env` no `settings.json`, as credenciais são armazenadas em texto simples. Para uma segurança melhor, prefira arquivos `.env` ou `export` do shell — veja o [Passo 2](#step-2-set-environment-variables).

Para o esquema completo de `modelProviders` e opções avançadas como `generationConfig`, `customHeaders` e `extra_body`, consulte a [Referência de Model Providers](model-providers.md).

#### Passo 2: Definir variáveis de ambiente

O Qwen Code lê as API keys das variáveis de ambiente (especificadas por `envKey` na configuração do seu modelo). Há várias maneiras de fornecê-las, listadas abaixo da **maior para a menor prioridade**:

**1. Ambiente do shell / `export` (maior prioridade)**

Defina diretamente no perfil do seu shell (`~/.zshrc`, `~/.bashrc`, etc.) ou inline antes de iniciar:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / Compatível com OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Arquivos `.env`**

O Qwen Code carrega automaticamente o **primeiro** arquivo `.env` que encontrar (as variáveis **não são mescladas** entre vários arquivos). Apenas variáveis que ainda não estão presentes em `process.env` são carregadas.

Ordem de busca (a partir do diretório atual, subindo em direção a `/`):

1. `.qwen/.env` (preferido — mantém as variáveis do Qwen Code isoladas de outras ferramentas)
2. `.env`

Se nada for encontrado, ele usa o fallback para o seu **diretório home**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` é recomendado em vez de `.env` para evitar conflitos com outras ferramentas. Algumas variáveis (como `DEBUG` e `DEBUG_MODE`) são excluídas de arquivos `.env` no nível do projeto para evitar interferências no comportamento do Qwen Code.

**3. Campo `settings.json` → `env` (menor prioridade)**

Você também pode definir API keys diretamente no `~/.qwen/settings.json` sob a chave `env`. Elas são carregadas como o **fallback de menor prioridade** — aplicadas apenas quando uma variável ainda não foi definida pelo ambiente do sistema ou arquivos `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Esta é a abordagem usada no [exemplo de configuração em um único arquivo](#recommended-one-file-setup-via-settingsjson) acima. É conveniente para manter tudo em um só lugar, mas tenha em mente que o `settings.json` pode ser compartilhado ou sincronizado — prefira arquivos `.env` para segredos sensíveis.

**Resumo de prioridade:**

| Prioridade    | Fonte                         | Comportamento de substituição                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (maior) | Flags da CLI (`--openai-api-key`) | Sempre prevalece                                  |
| 2           | Env do sistema (`export`, inline)  | Substitui `.env` e `settings.json` → `env` |
| 3           | Arquivo `.env`                    | Define apenas se não estiver no env do sistema               |
| 4 (menor)  | `settings.json` → `env`        | Define apenas se não estiver no env do sistema ou `.env`     |

#### Passo 3: Alternar modelos com `/model`

Após iniciar o Qwen Code, use o comando `/model` para alternar entre todos os modelos configurados. Os modelos são agrupados por protocolo:

```
/model
```

O seletor mostrará todos os modelos da sua configuração `modelProviders`, agrupados por seu protocolo (por exemplo, `openai`, `anthropic`, `gemini`). Sua seleção é persistida entre as sessões.

Você também pode alternar modelos diretamente com um argumento de linha de comando, o que é conveniente ao trabalhar em múltiplos terminais.

```bash
# Em um terminal

qwen --model "qwen3-coder-plus"

# Em outro terminal

qwen --model "qwen3.5-plus"
```

## Comando de CLI `qwen auth` removido

O comando de CLI autônomo `qwen auth` foi removido. Use estas substituições em vez dele:

| Caso de uso anterior                | Substituição                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Configuração interativa de autenticação | Execute `qwen` e use `/auth`                                                                |
| Configuração do Coding Plan                | Use `/auth` ou defina `BAILIAN_CODING_PLAN_API_KEY` com a URL base do Coding Plan             |
| Configuração do OpenRouter                 | Use `/auth` ou defina `OPENROUTER_API_KEY` e `OPENAI_BASE_URL=https://openrouter.ai/api/v1` |
| Configuração do Requesty                   | Use `/auth` ou defina `REQUESTY_API_KEY` e `OPENAI_BASE_URL=https://router.requesty.ai/v1`  |
| Configuração de API key ou provedor personalizado | Configure `~/.qwen/settings.json`, `.env` ou variáveis de ambiente específicas do provedor       |
| Verificar autenticação atual     | Execute `/doctor` dentro do Qwen Code                                                              |
| Fluxo do navegador OAuth               | Execute `qwen` interativamente e use `/auth`; o OAuth não pode ser configurado apenas com variáveis de ambiente    |

Invocações legadas como `qwen auth status` agora exibem um aviso de remoção com esses caminhos de migração.

## Notas de segurança

- Não faça commit de API keys no controle de versão.
- Prefira `.qwen/.env` para segredos locais do projeto (e mantenha-o fora do git).
- Trate a saída do seu terminal como sensível se ela imprimir credenciais para verificação.