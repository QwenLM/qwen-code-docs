---
description: "Compare os 3 métodos de autenticação do Qwen Code: API Key, Alibaba Cloud Coding Plan e OAuth. Escolha rápido o acesso ideal para cotas e modelos."
---

# Autenticação

O Qwen Code oferece suporte a três métodos de autenticação. Escolha aquele que melhor se adapta à forma como você deseja executar a CLI:

- **Qwen OAuth**: faça login com sua conta `qwen.ai` em um navegador. **Camada gratuita descontinuada em 2026-04-15** — mude para outro método.
- **Alibaba Cloud Coding Plan**: use uma chave de API da Alibaba Cloud. Assinatura paga com diversas opções de modelos e cotas mais altas.
- **API Key**: traga sua própria chave de API. Flexível para suas necessidades — oferece suporte a OpenAI, Anthropic, Gemini e outros endpoints compatíveis.

## Opção 1: Qwen OAuth (Descontinuado)

> [!warning]
>
> A camada gratuita do Qwen OAuth foi descontinuada em 2026-04-15. Tokens em cache existentes podem continuar funcionando por um breve período, mas novas solicitações serão rejeitadas. Por favor, mude para o Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) ou outro provedor. Execute `qwen auth` para configurar.

- **Como funciona**: na primeira inicialização, o Qwen Code abre uma página de login no navegador. Após concluir, as credenciais são armazenadas em cache localmente, então geralmente você não precisará fazer login novamente.
- **Requisitos**: uma conta `qwen.ai` + acesso à internet (pelo menos para o primeiro login).
- **Benefícios**: sem gerenciamento de chaves de API, atualização automática de credenciais.
- **Custo e cota**: a camada gratuita foi descontinuada a partir de 2026-04-15.

Inicie a CLI e siga o fluxo no navegador:

```bash
qwen
```

Ou autentique-se diretamente sem iniciar uma sessão:

```bash
qwen auth qwen-oauth
```

> [!note]
>
> Em ambientes não interativos ou headless (por exemplo, CI, SSH, contêineres), geralmente **não é possível** concluir o fluxo de login do OAuth no navegador.  
> Nesses casos, use o método de autenticação Alibaba Cloud Coding Plan ou API Key.

## 💳 Opção 2: Alibaba Cloud Coding Plan

Use esta opção se você quiser custos previsíveis com diversas opções de modelos e cotas de uso mais altas.

- **Como funciona**: Assine o Coding Plan com uma taxa mensal fixa e configure o Qwen Code para usar o endpoint dedicado e sua chave de API de assinatura.
- **Requisitos**: Obtenha uma assinatura ativa do Coding Plan em [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) ou [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), dependendo da região da sua conta.
- **Benefícios**: Diversas opções de modelos, cotas de uso mais altas, custos mensais previsíveis e acesso a uma ampla gama de modelos (Qwen, GLM, Kimi, Minimax e outros).
- **Custo e cota**: Consulte a documentação do Aliyun ModelStudio Coding Plan[Pequim](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[internacional](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

O Alibaba Cloud Coding Plan está disponível em duas regiões:

| Região                       | URL do Console                                                               |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Pequim)  | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (internacional)| [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Configuração interativa

Você pode configurar a autenticação do Coding Plan de duas formas:

**Opção A: Pelo terminal (recomendado para a primeira configuração)**

```bash
# Interativo — solicita a região e a chave de API
qwen auth coding-plan

# Ou não interativo — passe a região e a chave diretamente
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx
```

**Opção B: Dentro de uma sessão do Qwen Code**

Digite `qwen` no terminal para iniciar o Qwen Code, execute o comando `/auth` e selecione **Alibaba Cloud Coding Plan**. Escolha sua região e insira sua chave `sk-sp-xxxxxxxxx`.

Após a autenticação, use o comando `/model` para alternar entre todos os modelos compatíveis com o Alibaba Cloud Coding Plan (incluindo qwen3.5-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max, glm-4.7 e kimi-k2.5).

### Alternativa: configurar via `settings.json`

Se preferir pular o fluxo interativo `/auth`, adicione o seguinte a `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
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

Use esta opção se quiser se conectar a provedores de terceiros, como OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope ou um endpoint auto-hospedado. Oferece suporte a múltiplos protocolos e provedores.

### Recomendado: Configuração em um único arquivo via `settings.json`

A maneira mais simples de começar com a autenticação por API Key é colocar tudo em um único arquivo `~/.qwen/settings.json`. Aqui está um exemplo completo e pronto para uso:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder via Dashscope",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
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
| `env`                        | Armazena chaves de API diretamente no `settings.json` como fallback (menor prioridade — `export` no shell e arquivos `.env` têm precedência).                  |
| `security.auth.selectedType` | Informa ao Qwen Code qual protocolo usar na inicialização (por exemplo, `openai`, `anthropic`, `gemini`). Sem isso, você precisaria executar `/auth` interativamente. |
| `model.name`                 | O modelo padrão a ser ativado quando o Qwen Code inicia. Deve corresponder a um dos valores `id` em seus `modelProviders`.                                |

Após salvar o arquivo, basta executar `qwen` — nenhuma configuração interativa `/auth` é necessária.

> [!tip]
>
> As seções abaixo explicam cada parte com mais detalhes. Se o exemplo rápido acima funcionar para você, sinta-se à vontade para pular diretamente para [Notas de segurança](#security-notes).

O conceito principal é **Model Providers** (`modelProviders`): o Qwen Code oferece suporte a múltiplos protocolos de API, não apenas OpenAI. Você configura quais provedores e modelos estão disponíveis editando `~/.qwen/settings.json` e, em seguida, alterna entre eles em tempo de execução com o comando `/model`.

#### Protocolos compatíveis

| Protocolo          | Chave `modelProviders` | Variáveis de ambiente                                        | Provedores                                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Compatível com OpenAI | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud, qualquer endpoint compatível com OpenAI |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                            |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                               |

#### Etapa 1: Configurar modelos e provedores em `~/.qwen/settings.json`

Defina quais modelos estão disponíveis para cada protocolo. Cada entrada de modelo requer no mínimo um `id` e um `envKey` (o nome da variável de ambiente que contém sua chave de API).

> [!important]
>
> Recomenda-se definir `modelProviders` no `~/.qwen/settings.json` de escopo do usuário para evitar conflitos de merge entre as configurações do projeto e do usuário.

Edite `~/.qwen/settings.json` (crie-o se não existir). Você pode misturar múltiplos protocolos em um único arquivo — aqui está um exemplo com vários provedores mostrando apenas a seção `modelProviders`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> Não se esqueça de também definir `env`, `security.auth.selectedType` e `model.name` junto com `modelProviders` — consulte o [exemplo completo acima](#recommended-one-file-setup-via-settingsjson) como referência.

**Campos de `ModelConfig` (cada entrada dentro de `modelProviders`):**

| Campo              | Obrigatório | Descrição                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `id`               | Sim      | ID do modelo enviado à API (por exemplo, `gpt-4o`, `claude-sonnet-4-20250514`) |
| `name`             | Não       | Nome de exibição no seletor `/model` (padrão: `id`)               |
| `envKey`           | Sim      | Nome da variável de ambiente para a chave de API (por exemplo, `OPENAI_API_KEY`)    |
| `baseUrl`          | Não       | Substituição do endpoint da API (útil para proxies ou endpoints personalizados)       |
| `generationConfig` | Não       | Ajuste fino de `timeout`, `maxRetries`, `samplingParams`, etc.            |

> [!note]
>
> Ao usar o campo `env` no `settings.json`, as credenciais são armazenadas em texto simples. Para maior segurança, prefira arquivos `.env` ou `export` no shell — consulte a [Etapa 2](#step-2-set-environment-variables).

Para o esquema completo de `modelProviders` e opções avançadas como `generationConfig`, `customHeaders` e `extra_body`, consulte [Referência de Model Providers](model-providers.md).

#### Etapa 2: Definir variáveis de ambiente

O Qwen Code lê chaves de API a partir de variáveis de ambiente (especificadas por `envKey` na configuração do seu modelo). Existem várias formas de fornecê-las, listadas abaixo da **maior para a menor prioridade**:

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

O Qwen Code carrega automaticamente o **primeiro** arquivo `.env` que encontra (as variáveis **não são mescladas** entre vários arquivos). Apenas variáveis que ainda não estão presentes em `process.env` são carregadas.

Ordem de busca (a partir do diretório atual, subindo em direção a `/`):

1. `.qwen/.env` (recomendado — mantém as variáveis do Qwen Code isoladas de outras ferramentas)
2. `.env`

Se nada for encontrado, ele recorre ao seu **diretório home**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> Recomenda-se `.qwen/.env` em vez de `.env` para evitar conflitos com outras ferramentas. Algumas variáveis (como `DEBUG` e `DEBUG_MODE`) são excluídas de arquivos `.env` em nível de projeto para evitar interferência no comportamento do Qwen Code.

**3. Campo `env` em `settings.json` (menor prioridade)**

Você também pode definir chaves de API diretamente em `~/.qwen/settings.json` sob a chave `env`. Elas são carregadas como o **fallback de menor prioridade** — aplicadas apenas quando uma variável ainda não está definida pelo ambiente do sistema ou por arquivos `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Esta é a abordagem usada no [exemplo de configuração em um único arquivo](#recommended-one-file-setup-via-settingsjson) acima. É conveniente para manter tudo em um só lugar, mas lembre-se de que `settings.json` pode ser compartilhado ou sincronizado — prefira arquivos `.env` para segredos sensíveis.

**Resumo de prioridades:**

| Prioridade    | Fonte                         | Comportamento de substituição                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (maior) | Flags da CLI (`--openai-api-key`) | Sempre vence                                  |
| 2           | Env do sistema (`export`, inline)  | Substitui `.env` e `settings.json` → `env` |
| 3           | Arquivo `.env`                    | Define apenas se não estiver no env do sistema               |
| 4 (menor)  | `settings.json` → `env`        | Define apenas se não estiver no env do sistema ou `.env`     |

#### Etapa 3: Alternar modelos com `/model`

Após iniciar o Qwen Code, use o comando `/model` para alternar entre todos os modelos configurados. Os modelos são agrupados por protocolo:

```
/model
```

O seletor mostrará todos os modelos da sua configuração `modelProviders`, agrupados por protocolo (por exemplo, `openai`, `anthropic`, `gemini`). Sua seleção é persistida entre sessões.

Você também pode alternar modelos diretamente com um argumento de linha de comando, o que é conveniente ao trabalhar em vários terminais.

```bash
# Em um terminal

qwen --model "qwen3-coder-plus"

# Em outro terminal

qwen --model "qwen3.5-plus"
```

## Comando CLI `qwen auth`

Além do comando slash `/auth` dentro da sessão, o Qwen Code fornece um comando CLI `qwen auth` independente para gerenciar a autenticação diretamente pelo terminal — sem precisar iniciar uma sessão interativa primeiro.

### Modo interativo

Execute `qwen auth` sem argumentos para obter um menu interativo:

```bash
qwen auth
```

Você verá um seletor com navegação por setas:

```
Select authentication method:

  Alibaba Cloud Coding Plan - Paid · Up to 6,000 requests/5 hrs · All Alibaba Cloud Coding Plan Models
  API Key - Bring your own API key
  Qwen OAuth - Discontinued — switch to Coding Plan or API Key

(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)
```

### Subcomandos

| Comando                                              | Descrição                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | Configuração interativa de autenticação                  |
| `qwen auth coding-plan`                              | Autenticar com Alibaba Cloud Coding Plan       |
| `qwen auth coding-plan --region china --key sk-sp-…` | Configuração não interativa do Coding Plan (para scripts) |
| `qwen auth api-key`                                  | Autenticar com uma API key                      |
| `qwen auth qwen-oauth`                               | Autenticar com Qwen OAuth (descontinuado)       |
| `qwen auth status`                                   | Mostrar status atual da autenticação                |

**Exemplos:**

```bash
# Autenticar com Qwen OAuth diretamente
qwen auth qwen-oauth

# Configurar Coding Plan interativamente (solicita região e chave)
qwen auth coding-plan

# Configurar Coding Plan de forma não interativa (útil para CI/scripts)
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx

# Configurar API key (ModelStudio Standard ou provedor personalizado)
qwen auth api-key

# Verificar sua configuração de auth atual
qwen auth status
```

## Notas de segurança

- Não faça commit de chaves de API no controle de versão.
- Prefira `.qwen/.env` para segredos locais do projeto (e mantenha-o fora do git).
- Trate a saída do seu terminal como sensível se ela imprimir credenciais para verificação.