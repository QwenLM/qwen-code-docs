# Autenticação

O Qwen Code suporta dois métodos de autenticação. Escolha aquele que corresponde à forma como você deseja executar a CLI:

- **Qwen OAuth (recomendado)**: faça login com sua conta `qwen.ai` em um navegador.
- **API compatível com OpenAI**: use uma chave de API (OpenAI ou qualquer provedor/ponto de extremidade compatível com OpenAI).

## Opção 1: Qwen OAuth (recomendado e gratuito) 👍

Use esta opção se quiser a configuração mais simples e estiver usando modelos Qwen.

- **Como funciona**: na primeira inicialização, o Qwen Code abre uma página de login no navegador. Após concluir, as credenciais são armazenadas localmente, então geralmente não será necessário fazer login novamente.
- **Requisitos**: uma conta `qwen.ai` + acesso à internet (pelo menos para o primeiro login).
- **Benefícios**: sem gerenciamento de chaves de API, atualização automática de credenciais.
- **Custo e cota**: gratuito, com uma cota de **60 solicitações por minuto** e **2.000 solicitações por dia**.

Inicie a CLI e siga o fluxo do navegador:

```bash
qwen
```

## Opção 2: API compatível com OpenAI (chave de API)

Use esta opção se você deseja utilizar modelos da OpenAI ou qualquer provedor que expõe uma API compatível com a OpenAI (por exemplo, OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian ou um endpoint compatível auto-hospedado).

### Início rápido (interativo, recomendado para uso local)

Quando você escolhe a opção compatível com OpenAI na CLI, ela solicitará:

- **Chave de API**
- **URL base** (padrão: `https://api.openai.com/v1`)
- **Modelo** (padrão: `gpt-4o`)

> **Nota:** a CLI pode exibir a chave em texto simples para verificação. Certifique-se de que seu terminal não está sendo gravado ou compartilhado.

### Configurar via argumentos de linha de comando

```bash

# Apenas chave de API
qwen-code --openai-api-key "sua-chave-de-api-aqui"

# URL base personalizada (endpoint compatível com OpenAI)
qwen-code --openai-api-key "sua-chave-de-api-aqui" --openai-base-url "https://seu-endpoint.com/v1"

# Modelo personalizado
qwen-code --openai-api-key "sua-chave-de-api-aqui" --model "gpt-4o-mini"
```

### Configurar via variáveis de ambiente

Você pode definir essas variáveis no seu perfil do shell, CI ou em um arquivo `.env`:

```bash
export OPENAI_API_KEY="sua-chave-de-api-aqui"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # opcional
export OPENAI_MODEL="gpt-4o"                        # opcional
```

#### Persistindo variáveis de ambiente com `.env` / `.qwen/.env`

O Qwen Code carregará automaticamente as variáveis de ambiente do **primeiro** arquivo `.env` encontrado (variáveis **não são mescladas** entre múltiplos arquivos).

Ordem de busca:

1. A partir do **diretório atual**, subindo até `/`:
   1. `.qwen/.env`
   2. `.env`
2. Se nada for encontrado, ele recorre ao seu **diretório home**:
   - `~/.qwen/.env`
   - `~/.env`

O arquivo `.qwen/.env` é recomendado para manter as variáveis do Qwen Code isoladas de outras ferramentas. Algumas variáveis (como `DEBUG` e `DEBUG_MODE`) são excluídas dos arquivos `.env` do projeto para evitar interferência no comportamento do qwen-code.

Exemplos:

```bash

# Configurações específicas do projeto (recomendado)
```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="sua-chave-de-api"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

```bash
# Configurações globais do usuário (disponíveis em todos os lugares)
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="sua-chave-de-api"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## Alternar método de autenticação (sem reiniciar)

Na interface do Qwen Code, execute:

```bash
/auth
```

## Ambientes não interativos / headless (CI, SSH, contêineres)

Em um terminal não interativo, geralmente **não é possível** concluir o fluxo de login via navegador OAuth.
Utilize o método compatível com a API OpenAI através de variáveis de ambiente:

- Defina pelo menos `OPENAI_API_KEY`.
- Opcionalmente defina `OPENAI_BASE_URL` e `OPENAI_MODEL`.

Se nenhuma dessas variáveis estiver definida em uma sessão não interativa, o Qwen Code será encerrado com um erro.

## Notas de segurança

- Não commite chaves de API no controle de versão.
- Prefira `.qwen/.env` para segredos locais do projeto (e mantenha-o fora do git).
- Trate a saída do seu terminal como sensível se ela imprimir credenciais para verificação.