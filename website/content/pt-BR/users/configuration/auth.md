# Autenticação

O Qwen Code suporta dois métodos de autenticação. Escolha aquele que corresponde à forma como você deseja executar a CLI:

- **OAuth Qwen (recomendado)**: faça login com sua conta `qwen.ai` em um navegador.
- **Chave de API**: utilize uma chave de API para se conectar a qualquer provedor compatível. Mais flexível — suporta OpenAI, Anthropic, Google GenAI, Alibaba Cloud Bailian e outros endpoints compatíveis.

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

## 👍 Opção 1: Qwen OAuth (recomendado e gratuito)

Use esta opção se quiser a configuração mais simples e estiver usando modelos Qwen.

- **Como funciona**: na primeira inicialização, o Qwen Code abre uma página de login no navegador. Após finalizar, as credenciais são armazenadas em cache localmente, então normalmente você não precisará fazer login novamente.
- **Requisitos**: uma conta `qwen.ai` + acesso à internet (pelo menos para o primeiro login).
- **Benefícios**: sem gerenciamento de chaves de API, atualização automática de credenciais.
- **Custo e cota**: gratuito, com uma cota de **60 solicitações/minuto** e **1.000 solicitações/dia**.

Inicie a CLI e siga o fluxo do navegador:

```bash
qwen
```

> [!note]
>
> Em ambientes não interativos ou headless (por exemplo, CI, SSH, contêineres), geralmente **não é possível** concluir o fluxo de login OAuth no navegador.  
> Nesses casos, utilize o método de autenticação por chave de API.

## 🚀 Opção 2: API-KEY (flexível)

Use esta opção se quiser mais flexibilidade sobre qual provedor e modelo utilizar. Suporta múltiplos protocolos e provedores, incluindo OpenAI, Anthropic, Google GenAI, Alibaba Cloud Bailian, Azure OpenAI, OpenRouter, ModelScope ou um endpoint compatível auto-hospedado.

### Opção 1: Plano de Codificação (Aliyun Bailian)

Use esta opção se você deseja custos previsíveis com cotas de uso mais altas para o modelo qwen3-coder-plus.

- **Como funciona**: Inscreva-se no Plano de Codificação com uma taxa mensal fixa, então configure o Qwen Code para usar o endpoint dedicado e sua chave de API da assinatura.
- **Requisitos**: Obtenha uma assinatura ativa do Plano de Codificação em [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan).
- **Benefícios**: Cotas de uso mais altas, custos mensais previsíveis, acesso ao mais recente modelo qwen3-coder-plus.
- **Custo e cota**: Consulte a [documentação do Plano de Codificação da Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

Digite `qwen` no terminal para iniciar o Qwen Code, então digite o comando `/auth` e selecione `API-KEY`

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

Após inserir, selecione `Coding Plan`:

![](https://gw.alicdn.com/imgextra/i4/O1CN01Irk0AD1ebfop69o0r_!!6000000003890-2-tps-2308-830.png)

Insira sua chave `sk-sp-xxxxxxxxx`, então utilize o comando `/model` para alternar entre todos os modelos suportados pelo `Coding Plan` da Bailian:

![](https://gw.alicdn.com/imgextra/i4/O1CN01fWArmf1kaCEgSmPln_!!6000000004699-2-tps-2304-1374.png)

### Opção 2: API-KEY de terceiros

Use esta opção se quiser se conectar a provedores de terceiros, como OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope ou um endpoint auto-hospedado.

O conceito principal é **Provedores de Modelos** (`modelProviders`): o Qwen Code suporta múltiplos protocolos de API, não apenas o OpenAI. Você configura quais provedores e modelos estão disponíveis editando o arquivo `~/.qwen/settings.json` e, em seguida, alterna entre eles em tempo de execução com o comando `/model`.

#### Protocolos suportados

| Protocolo         | Chave em `modelProviders` | Variáveis de ambiente                                        | Provedores                                                                                          |
| ----------------- | ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Compatível com OpenAI | `openai`                  | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian, qualquer endpoint compatível com OpenAI |
| Anthropic         | `anthropic`               | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                                    |
| Google GenAI      | `gemini`                  | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                       |
| Google Vertex AI  | `vertex-ai`               | `GOOGLE_API_KEY`, `GOOGLE_MODEL`                             | Google Vertex AI                                                                                    |

#### Passo 1: Configure `modelProviders` em `~/.qwen/settings.json`

Defina quais modelos estão disponíveis para cada protocolo. Cada entrada de modelo requer no mínimo um `id` e um `envKey` (o nome da variável de ambiente que contém sua chave de API).

> [!important]
>
> É recomendado definir `modelProviders` no escopo do usuário em `~/.qwen/settings.json` para evitar conflitos de merge entre configurações de projeto e do usuário.

Edite `~/.qwen/settings.json` (crie se não existir):

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

Você pode misturar múltiplos protocolos e modelos em uma única configuração. Os campos de `ModelConfig` são:

| Campo              | Obrigatório | Descrição                                                                 |
| ------------------ | ----------- | ------------------------------------------------------------------------- |
| `id`               | Sim         | ID do modelo enviado à API (ex: `gpt-4o`, `claude-sonnet-4-20250514`)   |
| `name`             | Não         | Nome exibido no seletor `/model` (padrão é `id`)                          |
| `envKey`           | Sim         | Nome da variável de ambiente para a chave de API (ex: `OPENAI_API_KEY`) |
| `baseUrl`          | Não         | Substituição do endpoint da API (útil para proxies ou endpoints customizados) |
| `generationConfig` | Não         | Ajuste fino de `timeout`, `maxRetries`, `samplingParams`, etc.          |

> [!note]
>
> As credenciais **nunca** são armazenadas em `settings.json`. O tempo de execução as lê da variável de ambiente especificada em `envKey`.

Para ver o esquema completo de `modelProviders` e opções avançadas como `generationConfig`, `customHeaders` e `extra_body`, consulte [Referência de Configurações → modelProviders](settings.md#modelproviders).

#### Passo 2: Configurar variáveis de ambiente

O Qwen Code lê as chaves de API a partir de variáveis de ambiente (especificadas por `envKey` na configuração do seu modelo). Existem várias maneiras de fornecê-las, listadas abaixo da **maior para a menor prioridade**:

**1. Ambiente do shell / `export` (maior prioridade)**

Configure diretamente no seu perfil do shell (`~/.zshrc`, `~/.bashrc`, etc.) ou em linha antes de iniciar:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / compatível com OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Arquivos `.env`**

O Qwen Code carrega automaticamente o **primeiro** arquivo `.env` que encontra (as variáveis **não são mescladas** entre múltiplos arquivos). Apenas variáveis que ainda não estão presentes em `process.env` são carregadas.

Ordem de busca (a partir do diretório atual, subindo em direção a `/`):

1. `.qwen/.env` (recomendado — mantém as variáveis do Qwen Code isoladas de outras ferramentas)
2. `.env`

Se nada for encontrado, ele recorre ao seu **diretório home**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` é recomendado em vez de `.env` para evitar conflitos com outras ferramentas. Algumas variáveis (como `DEBUG` e `DEBUG_MODE`) são excluídas de arquivos `.env` no nível do projeto para evitar interferência no comportamento do Qwen Code.

**3. `settings.json` → campo `env` (prioridade mais baixa)**

Você também pode definir variáveis de ambiente diretamente em `~/.qwen/settings.json` sob a chave `env`. Elas são carregadas como **fallback de prioridade mais baixa** — aplicadas apenas quando uma variável ainda não foi definida pelo ambiente do sistema ou por arquivos `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY":"sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "GEMINI_API_KEY": "AIza..."
  },
  "modelProviders": {
    ...
  }
}
```

> [!note]
>
> Isso é útil quando você deseja manter toda a configuração (provedores + credenciais) em um único arquivo. No entanto, tenha em mente que `settings.json` pode ser compartilhado ou sincronizado — prefira arquivos `.env` para segredos sensíveis.

**Resumo de prioridades:**

| Prioridade  | Fonte                          | Comportamento de substituição            |
| ----------- | ------------------------------ | ---------------------------------------- |
| 1 (maior)   | Flags da CLI (`--openai-api-key`) | Sempre vence                             |
| 2           | Ambiente do sistema (`export`, inline) | Substitui `.env` e `settings.env`        |
| 3           | Arquivo `.env`                 | Define apenas se não estiver no ambiente do sistema |
| 4 (menor)   | `settings.json` → `env`        | Define apenas se não estiver no ambiente do sistema ou `.env` |

#### Passo 3: Alternar modelos com `/model`

Após iniciar o Qwen Code, utilize o comando `/model` para alternar entre todos os modelos configurados. Os modelos são agrupados por protocolo:

```
/model
```

O seletor mostrará todos os modelos da sua configuração `modelProviders`, agrupados pelo seu protocolo (por exemplo, `openai`, `anthropic`, `gemini`). Sua seleção é mantida entre sessões.

Você também pode alternar modelos diretamente com um argumento de linha de comando, o que é conveniente ao trabalhar em múltiplos terminais.

```bash

# Em um terminal

qwen --model "qwen3-coder-plus"

# Em outro terminal

qwen --model "qwen3-coder-next"
```

## Notas de segurança

- Não commite chaves de API para controle de versão.
- Prefira `.qwen/.env` para segredos locais do projeto (e mantenha fora do git).
- Trate a saída do seu terminal como sensível se ela imprimir credenciais para verificação.