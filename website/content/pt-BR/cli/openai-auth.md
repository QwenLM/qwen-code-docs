# Autenticação OpenAI

O Qwen Code CLI suporta autenticação OpenAI para usuários que desejam usar modelos OpenAI em vez dos modelos Gemini do Google.

## Métodos de Autenticação

### 1. Autenticação Interativa (Recomendado)

Quando você executar o CLI pela primeira vez e selecionar OpenAI como método de autenticação, será solicitado a inserir:

- **API Key**: Sua chave de API OpenAI em [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Base URL**: A URL base da API OpenAI (padrão é `https://api.openai.com/v1`)
- **Model**: O modelo OpenAI a ser usado (padrão é `gpt-4o`)

O CLI irá orientá-lo através de cada campo:

1. Insira sua API key e pressione Enter
2. Revise/modifique a base URL e pressione Enter
3. Revise/modifique o nome do modelo e pressione Enter

**Nota**: Você pode colar sua API key diretamente - o CLI suporta funcionalidade de colar e exibirá a chave completa para verificação.

### 2. Argumentos de Linha de Comando

Você também pode fornecer as credenciais da OpenAI via argumentos de linha de comando:

```bash

# Uso básico com API key
qwen-code --openai-api-key "your-api-key-here"

# Com URL base personalizada
qwen-code --openai-api-key "your-api-key-here" --openai-base-url "https://your-custom-endpoint.com/v1"

# Com modelo personalizado
qwen-code --openai-api-key "your-api-key-here" --model "gpt-4-turbo"
```

### 3. Variáveis de Ambiente

Defina as seguintes variáveis de ambiente no seu shell ou arquivo `.env`:

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # Opcional, valor padrão
export OPENAI_MODEL="gpt-4o"  # Opcional, padrão é gpt-4o
```

## Modelos Suportados

O CLI suporta todos os modelos OpenAI disponíveis através da API da OpenAI, incluindo:

- `gpt-4o` (padrão)
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- E outros modelos disponíveis

## Endpoints Customizados

Você pode usar endpoints customizados definindo a variável de ambiente `OPENAI_BASE_URL` ou usando o argumento de linha de comando `--openai-base-url`. Isso é útil para:

- Usar o Azure OpenAI
- Usar outras APIs compatíveis com OpenAI
- Usar servidores locais compatíveis com OpenAI

## Alternando Métodos de Autenticação

Para alternar entre métodos de autenticação, use o comando `/auth` na interface CLI.

## Notas de Segurança

- As API keys são armazenadas em memória durante a sessão
- Para armazenamento persistente, use variáveis de ambiente ou arquivos `.env`
- Nunca commite API keys no version control
- O CLI exibe as API keys em texto plano para verificação - certifique-se de que seu terminal está seguro