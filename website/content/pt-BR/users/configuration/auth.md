# Autenticação

O Qwen Code oferece três métodos de autenticação. Escolha aquele que corresponde à forma como você deseja executar a CLI:

- **OAuth do Qwen**: faça login com sua conta `qwen.ai` em um navegador. Gratuito, com cota diária.
- **Plano de Codificação da Alibaba Cloud**: use uma chave de API da Alibaba Cloud. Assinatura paga com diversas opções de modelos e cotas mais altas.
- **Chave de API**: forneça sua própria chave de API. Flexível conforme suas necessidades — suporta endpoints compatíveis com OpenAI, Anthropic, Gemini e outros.

## Opção 1: OAuth do Qwen (Grátis)

Use esta opção se você deseja a configuração mais simples e estiver utilizando modelos Qwen.

- **Como funciona**: na primeira inicialização, o Qwen Code abre uma página de login no navegador. Após concluir o processo, as credenciais são armazenadas em cache localmente, portanto, normalmente você não precisará fazer login novamente.
- **Requisitos**: uma conta `qwen.ai` + acesso à internet (pelo menos para o primeiro login).
- **Vantagens**: sem gerenciamento de chaves de API, atualização automática de credenciais.
- **Custo e cota**: gratuito, com uma cota de **60 requisições/minuto** e **1.000 requisições/dia**.

Inicie a CLI e siga o fluxo no navegador:

```bash
qwen
```

> [!note]
>
> Em ambientes não interativos ou sem interface gráfica (por exemplo, CI, SSH, contêineres), normalmente **não é possível** concluir o fluxo de login no navegador via OAuth.  
> Nesses casos, use o Plano de Codificação da Alibaba Cloud ou o método de autenticação por chave de API.

## 💳 Opção 2: Plano de Codificação da Alibaba Cloud

Use esta opção se desejar custos previsíveis, com diversas opções de modelos e cotas de uso mais altas.

- **Como funciona**: Assine o Plano de Codificação com uma taxa mensal fixa e, em seguida, configure o Qwen Code para usar o endpoint dedicado e sua chave de API de assinatura.
- **Requisitos**: Obtenha uma assinatura ativa do Plano de Codificação no [Aliyun Bailian](https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan) ou na [Alibaba Cloud](https://bailian.console.alibabacloud.com/?tab=model#/efm/coding_plan), conforme a região da sua conta.
- **Benefícios**: Diversas opções de modelos, cotas de uso mais altas, custos mensais previsíveis e acesso a uma ampla variedade de modelos (Qwen, GLM, Kimi, Minimax e outros).
- **Custos e cotas**: Consulte a [documentação do Plano de Codificação da Aliyun Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

O Plano de Codificação da Alibaba Cloud está disponível em duas regiões:

| Região                           | URL do Console                                                               |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Aliyun Bailian (aliyun.com)      | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (alibabacloud.com) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Configuração interativa

Digite `qwen` no terminal para iniciar o Qwen Code, em seguida execute o comando `/auth` e selecione **Plano de Codificação da Alibaba Cloud**. Escolha sua região e insira sua chave `sk-sp-xxxxxxxxx`.

Após a autenticação, use o comando `/model` para alternar entre todos os modelos compatíveis com o Plano de Codificação da Alibaba Cloud (incluindo `qwen3.5-plus`, `qwen3-coder-plus`, `qwen3-coder-next`, `qwen3-max`, `glm-4.7` e `kimi-k2.5`).

### Alternativa: configurar via `settings.json`

Se preferir pular o fluxo interativo `/auth`, adicione o seguinte a `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Plano de Codificação)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus do Plano de Codificação da Alibaba Cloud",
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
> O Plano de Codificação usa um endpoint dedicado (`https://coding.dashscope.aliyuncs.com/v1`) diferente do endpoint padrão do Dashscope. Certifique-se de usar o `baseUrl` correto.

## 🚀 Opção 3: Chave de API (flexível)

Use esta opção se quiser se conectar a provedores de terceiros, como OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope ou um endpoint auto-hospedado. Suporta múltiplos protocolos e provedores.

### Recomendado: Configuração em um único arquivo via `settings.json`

A maneira mais simples de começar com a autenticação por chave de API é colocar todas as configurações em um único arquivo `~/.qwen/settings.json`. Abaixo há um exemplo completo e pronto para uso:

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

| Campo                        | Descrição                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Declara quais modelos estão disponíveis e como se conectar a eles. As chaves (`openai`, `anthropic`, `gemini`) representam o protocolo da API.            |
| `env`                        | Armazena as chaves de API diretamente no arquivo `settings.json` como alternativa (prioridade mais baixa — variáveis de ambiente definidas com `export` no shell e arquivos `.env` têm precedência). |
| `security.auth.selectedType` | Informa ao Qwen Code qual protocolo usar na inicialização (por exemplo, `openai`, `anthropic`, `gemini`). Sem isso, seria necessário executar `/auth` interativamente. |
| `model.name`                 | O modelo padrão a ser ativado quando o Qwen Code for iniciado. Deve corresponder a um dos valores de `id` presentes em `modelProviders`.               |

Após salvar o arquivo, basta executar `qwen` — nenhuma configuração interativa com `/auth` é necessária.

> [!tip]
>
> As seções abaixo explicam cada parte com mais detalhes. Se o exemplo rápido acima funcionar para você, sinta-se à vontade para pular diretamente para as [Notas de segurança](#security-notes).

O conceito central é o de **Provedores de Modelo** (`modelProviders`): o Qwen Code suporta múltiplos protocolos de API, não apenas o OpenAI. Você configura quais provedores e modelos estão disponíveis editando o arquivo `~/.qwen/settings.json` e pode alternar entre eles em tempo de execução usando o comando `/model`.

#### Protocolos compatíveis

| Protocolo             | Chave em `modelProviders` | Variáveis de ambiente                                                    | Provedores                                                                                   |
| --------------------- | ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Compatível com OpenAI | `openai`                  | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`                      | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud, qualquer endpoint compatível com OpenAI |
| Anthropic             | `anthropic`               | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`             | Claude da Anthropic                                                                         |
| Google GenAI          | `gemini`                  | `GEMINI_API_KEY`, `GEMINI_MODEL`                                         | Google Gemini                                                                               |

#### Etapa 1: Configure modelos e provedores em `~/.qwen/settings.json`

Defina quais modelos estão disponíveis para cada protocolo. Cada entrada de modelo exige, no mínimo, um `id` e um `envKey` (o nome da variável de ambiente que contém sua chave de API).

> [!important]
>
> Recomenda-se definir `modelProviders` no arquivo de escopo de usuário `~/.qwen/settings.json` para evitar conflitos de mesclagem entre as configurações do projeto e do usuário.

Edite o arquivo `~/.qwen/settings.json` (crie-o caso ainda não exista). É possível misturar vários protocolos em um único arquivo — abaixo há um exemplo com múltiplos provedores, mostrando apenas a seção `modelProviders`:

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
> Não se esqueça de também configurar `env`, `security.auth.selectedType` e `model.name` juntamente com `modelProviders` — consulte o [exemplo completo acima](#recommended-one-file-setup-via-settingsjson) como referência.

**Campos de `ModelConfig` (cada entrada dentro de `modelProviders`):**

| Campo              | Obrigatório | Descrição                                                                 |
| ------------------ | ----------- | ------------------------------------------------------------------------- |
| `id`               | Sim         | ID do modelo enviado à API (ex.: `gpt-4o`, `claude-sonnet-4-20250514`)   |
| `name`             | Não         | Nome exibido no seletor `/model` (valor padrão é o `id`)                 |
| `envKey`           | Sim         | Nome da variável de ambiente para a chave de API (ex.: `OPENAI_API_KEY`)  |
| `baseUrl`          | Não         | Substituição do endpoint da API (útil para proxies ou endpoints personalizados) |
| `generationConfig` | Não         | Ajuste fino de `timeout`, `maxRetries`, `samplingParams`, etc.           |

> [!note]
>
> Ao usar o campo `env` em `settings.json`, as credenciais são armazenadas em texto simples. Para maior segurança, prefira arquivos `.env` ou o comando shell `export` — consulte a [Etapa 2](#step-2-set-environment-variables).

Para o esquema completo de `modelProviders` e opções avançadas como `generationConfig`, `customHeaders` e `extra_body`, consulte a [Referência de Provedores de Modelos](model-providers.md).

#### Etapa 2: Definir variáveis de ambiente

O Qwen Code lê as chaves de API de variáveis de ambiente (especificadas por `envKey` na configuração do seu modelo). Há várias maneiras de fornecê-las, listadas abaixo da **maior para a menor prioridade**:

**1. Ambiente do shell / `export` (maior prioridade)**

Defina diretamente no perfil do seu shell (`~/.zshrc`, `~/.bashrc`, etc.) ou inline, antes de iniciar:

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

O Qwen Code carrega automaticamente o **primeiro** arquivo `.env` que encontrar (as variáveis **não são mescladas** entre múltiplos arquivos). Apenas as variáveis ainda não presentes em `process.env` são carregadas.

Ordem de busca (a partir do diretório atual, subindo até `/`):

1. `.qwen/.env` (recomendado — mantém as variáveis do Qwen Code isoladas de outras ferramentas)
2. `.env`

Se nenhum for encontrado, ele recorre ao seu **diretório home**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> Recomenda-se usar `.qwen/.env` em vez de `.env` para evitar conflitos com outras ferramentas. Algumas variáveis (como `DEBUG` e `DEBUG_MODE`) são excluídas dos arquivos `.env` no nível do projeto para não interferir no comportamento do Qwen Code.

**3. Campo `env` em `settings.json` (prioridade mais baixa)**

Você também pode definir chaves de API diretamente em `~/.qwen/settings.json`, na chave `env`. Essas variáveis são carregadas como **último recurso de fallback**, aplicadas apenas quando uma variável ainda não foi definida pelo ambiente do sistema ou pelos arquivos `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Essa é a abordagem usada no [exemplo de configuração em um único arquivo](#configuracao-recomendada-em-um-unico-arquivo-via-settingsjson) acima. É conveniente para manter tudo em um só lugar, mas lembre-se de que `settings.json` pode ser compartilhado ou sincronizado — prefira arquivos `.env` para segredos sensíveis.

**Resumo de prioridades:**

| Prioridade  | Origem                           | Comportamento de substituição                              |
| ----------- | -------------------------------- | ---------------------------------------------------------- |
| 1 (maior)   | Flags da CLI (`--openai-api-key`) | Sempre prevalece                                           |
| 2           | Ambiente do sistema (`export`, inline) | Substitui arquivos `.env` e `settings.json` → `env`         |
| 3           | Arquivo `.env`                   | Define apenas se não estiver presente no ambiente do sistema |
| 4 (menor)   | `settings.json` → `env`          | Define apenas se não estiver presente no ambiente do sistema nem em `.env` |

#### Etapa 3: Alternar modelos com `/model`

Após iniciar o Qwen Code, use o comando `/model` para alternar entre todos os modelos configurados. Os modelos são agrupados por protocolo:

```
/model
```

O seletor exibirá todos os modelos da sua configuração `modelProviders`, agrupados pelo respectivo protocolo (por exemplo, `openai`, `anthropic`, `gemini`). A sua seleção é persistida entre sessões.

Você também pode alternar modelos diretamente usando um argumento de linha de comando, o que é conveniente ao trabalhar em vários terminais.

```bash

# Em um terminal

qwen --model "qwen3-coder-plus"

# Em outro terminal

qwen --model "qwen3.5-plus"
```

## Observações sobre segurança

- Não envie chaves de API para controle de versão.
- Prefira o arquivo `.qwen/.env` para segredos específicos do projeto (e certifique-se de excluí-lo do Git).
- Trate a saída do seu terminal como sensível caso ela imprima credenciais para verificação.