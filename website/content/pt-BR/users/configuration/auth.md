# Autenticação

O Qwen Code suporta dois métodos de autenticação. Escolha o que corresponda à forma como você deseja executar a CLI:

- **OAuth Qwen (recomendado)**: faça login com sua conta `qwen.ai` em um navegador.
- **API compatível com OpenAI**: utilize uma chave de API (OpenAI ou qualquer provedor/endereço compatível com OpenAI).

![](https://img.alicdn.com/imgextra/i2/O1CN01IxI1bt1sNO543AVTT_!!6000000005754-0-tps-1958-822.jpg)

## Opção 1: Qwen OAuth (recomendado e gratuito) 👍

Use esta opção se quiser a configuração mais simples e estiver usando modelos Qwen.

- **Como funciona**: na primeira inicialização, o Qwen Code abre uma página de login no navegador. Após finalizar, as credenciais são armazenadas em cache localmente, então geralmente você não precisará fazer login novamente.
- **Requisitos**: uma conta `qwen.ai` + acesso à internet (pelo menos para o primeiro login).
- **Benefícios**: sem gerenciamento de chave de API, atualização automática de credenciais.
- **Custo e cota**: gratuito, com uma cota de **60 solicitações/minuto** e **1.000 solicitações/dia**.

Inicie a CLI e siga o fluxo do navegador:

```bash
qwen
```

## Opção 2: API compatível com OpenAI (chave de API)

Use esta opção se quiser usar modelos OpenAI ou qualquer provedor que exponha uma API compatível com OpenAI (por exemplo, OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian ou um endpoint compatível auto-hospedado).

### Recomendado: Plano de Codificação (baseado em assinatura) 🚀

Use isso se você quiser custos previsíveis com cotas de uso mais altas para o modelo qwen3-coder-plus.

> [!IMPORTANT]
>
> O Plano de Codificação está disponível apenas para usuários no continente chinês (região de Pequim).

- **Como funciona**: assine o Plano de Codificação com uma taxa mensal fixa, então configure o Qwen Code para usar o endpoint dedicado e sua chave de API de assinatura.
- **Requisitos**: uma assinatura ativa do Plano de Codificação da [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan).
- **Benefícios**: cotas de uso mais altas, custos mensais previsíveis, acesso ao mais recente modelo qwen3-coder-plus.
- **Custo e cota**: varia conforme o plano (veja tabela abaixo).

#### Preços e Cotas do Plano de Codificação

| Recurso             | Plano Básico Lite     | Plano Avançado Pro    |
| :------------------ | :-------------------- | :-------------------- |
| **Preço**           | ¥40/mês               | ¥200/mês              |
| **Limite de 5 horas** | Até 1.200 solicitações | Até 6.000 solicitações |
| **Limite Semanal**  | Até 9.000 solicitações | Até 45.000 solicitações|
| **Limite Mensal**   | Até 18.000 solicitações| Até 90.000 solicitações|
| **Modelo Suportado**| qwen3-coder-plus      | qwen3-coder-plus      |

#### Configuração Rápida para o Plano de Codificação

Quando você selecionar a opção compatível com OpenAI na CLI, insira estes valores:

- **Chave da API**: `sk-sp-xxxxx`
- **URL Base**: `https://coding.dashscope.aliyuncs.com/v1`
- **Modelo**: `qwen3-coder-plus`

> **Observação**: As chaves da API do Plano de Codificação têm o formato `sk-sp-xxxxx`, que é diferente das chaves padrão da API da Alibaba Cloud.

#### Configurar via Variáveis de Ambiente

Defina estas variáveis de ambiente para usar o Coding Plan:

```bash
export OPENAI_API_KEY="sua-chave-api-do-coding-plan"  # Formato: sk-sp-xxxxx
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Para mais detalhes sobre o Coding Plan, incluindo opções de assinatura e solução de problemas, consulte a [documentação completa do Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

### Outros provedores compatíveis com OpenAI

Se você estiver usando outros provedores (OpenAI, Azure, LLMs locais, etc.), utilize os seguintes métodos de configuração.

### Configurar via argumentos de linha de comando

```bash

# Apenas chave da API
qwen-code --openai-api-key "sua-chave-api-aqui"

# URL base personalizada (endpoint compatível com OpenAI)
qwen-code --openai-api-key "sua-chave-api-aqui" --openai-base-url "https://seu-endpoint.com/v1"

# Modelo personalizado
qwen-code --openai-api-key "sua-chave-api-aqui" --model "gpt-4o-mini"
```

### Configurar via variáveis de ambiente

Você pode definir essas variáveis em seu perfil do shell, CI ou em um arquivo `.env`:

```bash
export OPENAI_API_KEY="sua-chave-de-api-aqui"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # opcional
export OPENAI_MODEL="gpt-4o"                        # opcional
```

#### Persistindo variáveis de ambiente com `.env` / `.qwen/.env`

O Qwen Code irá carregar automaticamente as variáveis de ambiente do **primeiro** arquivo `.env` que encontrar (as variáveis **não são mescladas** entre múltiplos arquivos).

Ordem de busca:

1. A partir do **diretório atual**, subindo até `/`:
   1. `.qwen/.env`
   2. `.env`
2. Se nada for encontrado, ele recorre ao seu **diretório home**:
   - `~/.qwen/.env`
   - `~/.env`

Recomenda-se usar `.qwen/.env` para manter as variáveis do Qwen Code isoladas de outras ferramentas. Algumas variáveis (como `DEBUG` e `DEBUG_MODE`) são excluídas dos arquivos `.env` do projeto para evitar interferência no comportamento do qwen-code.

Exemplos:

```bash

# Configurações específicas do projeto (recomendado)
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

```bash

# Configurações para todos os usuários (disponível em todos os lugares)
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## Alternar método de autenticação (sem reiniciar)

Na interface do Qwen Code, execute:

```bash
/auth
```

## Ambientes não interativos / sem interface gráfica (CI, SSH, contêineres)

Em um terminal não interativo você normalmente **não pode** concluir o fluxo de login no navegador via OAuth.
Utilize o método de API compatível com OpenAI através de variáveis de ambiente:

- Defina pelo menos `OPENAI_API_KEY`.
- Opcionalmente defina `OPENAI_BASE_URL` e `OPENAI_MODEL`.

Se nenhuma dessas opções estiver definida em uma sessão não interativa, o Qwen Code será encerrado com um erro.

## Notas de segurança

- Não faça commit de chaves de API para o controle de versão.
- Prefira `.qwen/.env` para segredos locais do projeto (e mantenha-o fora do git).
- Trate a saída do seu terminal como sensível se ela imprimir credenciais para verificação.