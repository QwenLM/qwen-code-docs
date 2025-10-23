# Configuração de Autenticação

O Qwen Code suporta dois principais métodos de autenticação para acessar modelos de IA. Escolha o método que melhor se adapta ao seu caso de uso:

1.  **Qwen OAuth (Recomendado):**
    - Use esta opção para fazer login com sua conta qwen.ai.
    - Durante a inicialização, o Qwen Code irá direcioná-lo para a página de autenticação do qwen.ai. Após autenticado, suas credenciais serão armazenadas localmente para que o login web possa ser ignorado nas execuções subsequentes.
    - **Requisitos:**
      - Conta válida no qwen.ai
      - Conexão com a internet para autenticação inicial
    - **Benefícios:**
      - Acesso direto aos modelos Qwen
      - Atualização automática de credenciais
      - Não é necessário gerenciar manualmente as API keys

    **Primeiros Passos:**

    ```bash
    # Inicie o Qwen Code e siga o fluxo OAuth
    qwen
    ```

    O CLI abrirá automaticamente seu navegador e o guiará pelo processo de autenticação.

    **Para usuários que autenticam usando sua conta qwen.ai:**

    **Cota:**
    - 60 requisições por minuto
    - 2.000 requisições por dia
    - O uso de tokens não se aplica

    **Custo:** Grátis

    **Observações:** Uma cota específica para diferentes modelos não está definida; pode ocorrer fallback de modelo para preservar a qualidade da experiência compartilhada.

2.  **<a id="openai-api"></a>API compatível com OpenAI:**
    - Use chaves de API do OpenAI ou de outros provedores compatíveis.
    - Este método permite utilizar diversos modelos de IA através de chaves de API.

    **Métodos de Configuração:**

    a) **Variáveis de Ambiente:**

    ```bash
    export OPENAI_API_KEY="your_api_key_here"
    export OPENAI_BASE_URL="your_api_endpoint"  # Opcional
    export OPENAI_MODEL="your_model_choice"     # Opcional
    ```

    b) **Arquivo `.env` do Projeto:**
    Crie um arquivo `.env` na raiz do seu projeto:

    ```env
    OPENAI_API_KEY=your_api_key_here
    OPENAI_BASE_URL=your_api_endpoint
    OPENAI_MODEL=your_model_choice
    ```

    **Provedores Suportados:**
    - OpenAI (https://platform.openai.com/api-keys)
    - Alibaba Cloud Bailian
    - ModelScope
    - OpenRouter
    - Azure OpenAI
    - Qualquer API compatível com OpenAI

## Alternando Métodos de Autenticação

Para alternar entre métodos de autenticação durante uma sessão, use o comando `/auth` na interface CLI:

```bash

# Dentro do CLI, digite:
/auth
```

Isso permitirá que você reconfigure seu método de autenticação sem reiniciar a aplicação.

### Persistindo Variáveis de Ambiente com Arquivos `.env`

Você pode criar um arquivo **`.qwen/.env`** no diretório do seu projeto ou no seu diretório home. Criar um arquivo simples **`.env`** também funciona, mas `.qwen/.env` é recomendado para manter as variáveis do Qwen Code isoladas de outras ferramentas.

**Importante:** Algumas variáveis de ambiente (como `DEBUG` e `DEBUG_MODE`) são automaticamente excluídas dos arquivos `.env` do projeto para evitar interferência no comportamento do qwen-code. Use arquivos `.qwen/.env` para variáveis específicas do qwen-code.

O Qwen Code carrega automaticamente as variáveis de ambiente do **primeiro** arquivo `.env` que encontrar, usando a seguinte ordem de busca:

1. Começando no **diretório atual** e subindo até `/`, para cada diretório ele verifica:
   1. `.qwen/.env`
   2. `.env`
2. Se nenhum arquivo for encontrado, ele usa como fallback o seu **diretório home**:
   - `~/.qwen/.env`
   - `~/.env`

> **Importante:** A busca para no **primeiro** arquivo encontrado—as variáveis **não são mescladas** entre múltiplos arquivos.

#### Exemplos

**Substituições específicas do projeto** (têm precedência quando você está dentro do projeto):

```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

**Configurações globais do usuário** (disponíveis em todos os diretórios):

```bash
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## Modo Não Interativo / Ambientes Headless

Ao executar o Qwen Code em um ambiente não interativo, você não pode usar o fluxo de login OAuth.
Em vez disso, é necessário configurar a autenticação usando variáveis de ambiente.

O CLI irá detectar automaticamente se está sendo executado em um terminal não interativo e usará o
método compatível com a API do OpenAI, caso esteja configurado:

1.  **API Compatível com OpenAI:**
    - Defina a variável de ambiente `OPENAI_API_KEY`.
    - Opcionalmente, defina `OPENAI_BASE_URL` e `OPENAI_MODEL` para endpoints personalizados.
    - O CLI utilizará essas credenciais para autenticar junto ao provedor da API.

**Exemplo para ambientes headless:**

Se nenhuma dessas variáveis de ambiente estiver definida em uma sessão não interativa, o CLI será encerrado com um erro.

Para orientações completas sobre como usar o Qwen Code programaticamente e em
fluxos de automação, consulte o [Guia do Modo Headless](../headless.md).