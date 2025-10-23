# Bem-vindo à documentação do Qwen Code

O Qwen Code é uma poderosa ferramenta de workflow AI via linha de comando adaptada do [**Gemini CLI**](https://github.com/google-gemini/gemini-cli) ([detalhes](./README.gemini.md)), especificamente otimizada para os modelos [Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder). Ele aprimora seu fluxo de desenvolvimento com compreensão avançada de código, tarefas automatizadas e assistência inteligente.

## 🚀 Por que escolher o Qwen Code?

- 🎯 **Free Tier:** Até 60 requisições/min e 2.000 requisições/dia com sua conta [QwenChat](https://chat.qwen.ai/).
- 🧠 **Modelo Avançado:** Especialmente otimizado para [Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder), oferecendo excelente compreensão e assistência com código.
- 🏆 **Recursos Completos:** Inclui subagents, Modo de Planejamento (Plan Mode), TodoWrite, suporte a modelos de visão e compatibilidade total com a API do OpenAI—tudo integrado de forma transparente.
- 🔧 **Ferramentas Integradas & Extensíveis:** Conta com operações no sistema de arquivos, execução de comandos shell, busca/web fetch e muito mais—facilmente extensíveis via Model Context Protocol (MCP) para integrações personalizadas.
- 💻 **Focado em Desenvolvedores:** Projetado para fluxos de trabalho baseados no terminal—ideal para entusiastas da linha de comando.
- 🛡️ **Open Source:** Licenciado sob Apache 2.0, garantindo máxima liberdade e transparência.

## Instalação

### Pré-requisitos

Certifique-se de ter o [Node.js versão 20](https://nodejs.org/en/download) ou superior instalado.

```bash
curl -qL https://www.npmjs.com/install.sh | sh
```

### Instalar via npm

```bash
npm install -g @qwen-code/qwen-code@latest
qwen --version
```

### Instalar a partir do código-fonte

```bash
git clone https://github.com/QwenLM/qwen-code.git
cd qwen-code
npm install
npm install -g .
```

### Instalar globalmente com Homebrew (macOS/Linux)

```bash
brew install qwen-code
```

## Quick Start

```bash

# Iniciar o Qwen Code
qwen

# Exemplos de comandos
> Explain this codebase structure
> Help me refactor this function
> Generate unit tests for this module
```

### Gerenciamento de Sessão

Controle o uso de tokens com limites configuráveis para otimizar custos e desempenho.

#### Configurar Limite de Tokens da Sessão

Crie ou edite o arquivo `.qwen/settings.json` no seu diretório home:

```json
{
  "sessionTokenLimit": 32000
}
```

#### Comandos de Sessão

- **`/compress`** - Comprime o histórico da conversa para continuar dentro dos limites de tokens
- **`/clear`** - Limpa todo o histórico da conversa e inicia uma nova
- **`/stats`** - Verifica o uso atual de tokens e os limites

> 📝 **Nota**: O limite de tokens da sessão se aplica a uma única conversa, não ao total de chamadas à API.

### Configuração do Modelo Vision

O Qwen Code inclui troca automática inteligente de modelos vision, que detecta imagens na sua entrada e pode alternar automaticamente para modelos com capacidade vision para análise multimodal. **Esse recurso está habilitado por padrão** - quando você incluir imagens nas suas consultas, verá um diálogo perguntando como deseja lidar com a troca do modelo vision.

#### Pular o Diálogo de Troca (Opcional)

Se você não quiser ver o diálogo interativo toda vez, configure o comportamento padrão no seu `.qwen/settings.json`:

```json
{
  "experimental": {
    "vlmSwitchMode": "once"
  }
}
```

**Modos disponíveis:**

- **`"once"`** - Alterna para o modelo de visão apenas para esta consulta e depois reverte
- **`"session"`** - Alterna para o modelo de visão durante toda a sessão
- **`"persist"`** - Continua com o modelo atual (sem troca)
- **Não definido** - Mostra o diálogo interativo toda vez (padrão)

#### Substituição por Linha de Comando

Você também pode definir o comportamento via linha de comando:

```bash

# Alterna uma vez por consulta
qwen --vlm-switch-mode once

# Alterna para toda a sessão
qwen --vlm-switch-mode session

# Nunca alterna automaticamente
qwen --vlm-switch-mode persist
```

#### Desativar Modelos de Visão (Opcional)

Para desativar completamente o suporte a modelos de visão, adicione ao seu `.qwen/settings.json`:

```json
{
  "experimental": {
    "visionModelPreview": false
  }
}
```

> 💡 **Dica**: No modo YOLO (`--yolo`), a troca de visão acontece automaticamente sem prompts quando imagens são detectadas.

### Autenticação

Escolha seu método de autenticação preferido com base nas suas necessidades:

#### 1. Qwen OAuth (🚀 Recomendado - Comece em 30 segundos)

A maneira mais fácil de começar - totalmente gratuito com cotas generosas:

```bash

# É só rodar esse comando e seguir a autenticação no browser
qwen
```

**O que acontece:**

1. **Setup Instantâneo**: O CLI abre seu browser automaticamente
2. **Login com Um Clique**: Autentique-se com sua conta qwen.ai
3. **Gerenciamento Automático**: Credenciais armazenadas localmente para uso futuro
4. **Zero Configuração**: Nenhuma configuração necessária - comece a codar direto!

**Benefícios do Plano Gratuito:**

- ✅ **2.000 requests/dia** (sem necessidade de contar tokens)
- ✅ Limite de **60 requests/minuto**
- ✅ **Atualização automática de credenciais**
- ✅ **Custo zero** para usuários individuais
- ℹ️ **Nota**: Pode haver fallback de modelo para manter a qualidade do serviço

#### 2. API Compatível com OpenAI

Use chaves de API do OpenAI ou de outros provedores compatíveis:

**Métodos de Configuração:**

1. **Variáveis de Ambiente**

   ```bash
   export OPENAI_API_KEY="your_api_key_here"
   export OPENAI_BASE_URL="your_api_endpoint"
   export OPENAI_MODEL="your_model_choice"
   ```

2. **Arquivo `.env` do Projeto**
   Crie um arquivo `.env` na raiz do seu projeto:
   ```env
   OPENAI_API_KEY=your_api_key_here
   OPENAI_BASE_URL=your_api_endpoint
   OPENAI_MODEL=your_model_choice
   ```

**Opções de Provedores de API**

> ⚠️ **Aviso Regional:**
>
> - **China Continental**: Use Alibaba Cloud Bailian ou ModelScope
> - **Internacional**: Use Alibaba Cloud ModelStudio ou OpenRouter

<details>
<summary><b>🇨🇳 Para Usuários na China Continental</b></summary>

**Opção 1: Alibaba Cloud Bailian** ([Solicitar Chave de API](https://bailian.console.aliyun.com/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**Opção 2: ModelScope (Plano Gratuito)** ([Solicitar Chave de API](https://modelscope.cn/docs/model-service/API-Inference/intro))

- ✅ **2.000 chamadas gratuitas à API por dia**
- ⚠️ Conecte sua conta da Aliyun para evitar erros de autenticação

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
export OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
```

</details>

<details>
<summary><b>🌍 Para Usuários Internacionais</b></summary>

**Opção 1: Alibaba Cloud ModelStudio** ([Solicitar Chave de API](https://modelstudio.console.alibabacloud.com/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**Opção 2: OpenRouter (Plano Gratuito Disponível)** ([Solicitar Chave de API](https://openrouter.ai/))

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_MODEL="qwen/qwen3-coder:free"
```

</details>

## Exemplos de Uso

### 🔍 Explorar Codebases

```bash
cd your-project/
qwen

# Análise de arquitetura
> Descreva as principais partes da arquitetura deste sistema
> Quais são as dependências principais e como elas interagem?
> Encontre todos os endpoints da API e seus métodos de autenticação
```

### 💻 Desenvolvimento de Código

```bash

# Refatoração
> Refatore esta função para melhorar a legibilidade e performance
> Converta esta classe para usar injeção de dependência
> Divida este módulo grande em componentes menores e focados

# Geração de código
> Crie um endpoint REST API para gerenciamento de usuários
> Gere testes unitários para o módulo de autenticação
> Adicione tratamento de erros a todas as operações de banco de dados
```

### 🔄 Automatizar Workflows

```bash

# Automação Git
> Analise commits do git dos últimos 7 dias, agrupados por feature
> Crie um changelog a partir dos commits recentes
> Encontre todos os comentários TODO e crie issues no GitHub
```

# Operações com arquivos
> Converter todas as imagens neste diretório para o formato PNG
> Renomear todos os arquivos de teste para seguir o padrão *.test.ts
> Encontrar e remover todas as instruções console.log

### 🐛 Debugging & Análise

```bash
# Análise de performance
> Identificar gargalos de performance neste componente React
> Encontrar todos os problemas de query N+1 na base de código

# Auditoria de segurança
> Verificar possíveis vulnerabilidades de SQL injection
> Encontrar todas as credenciais ou chaves de API hardcoded
```

## Tarefas Populares

### 📚 Entender Novas Bases de Código

```text
> Quais são os componentes principais da lógica de negócio?
> Quais mecanismos de segurança estão implementados?
> Como os dados fluem através do sistema?
> Quais são os principais padrões de design utilizados?
> Gerar um grafo de dependências para este módulo
```

### 🔨 Refatoração e Otimização de Código

```text
> Quais partes deste módulo podem ser otimizadas?
> Me ajude a refatorar esta classe para seguir os princípios SOLID
> Adicione tratamento adequado de erros e logging
> Converta callbacks para o padrão async/await
> Implemente caching para operações custosas
```

### 📝 Documentação e Testes

```text
> Gere comentários abrangentes em JSDoc para todas as APIs públicas
> Escreva testes unitários com casos extremos para este componente
> Crie documentação da API no formato OpenAPI
> Adicione comentários inline explicando algoritmos complexos
> Gere um README para este módulo
```

### 🚀 Aceleração do Desenvolvimento

```text
> Configure um novo servidor Express com autenticação
> Crie um componente React com TypeScript e testes
> Implemente um middleware de rate limiting
> Adicione migrações de banco de dados para o novo schema
> Configure um pipeline CI/CD para este projeto
```

## Comandos e Atalhos

### Comandos de Sessão

- `/help` - Exibe os comandos disponíveis
- `/clear` - Limpa o histórico da conversa
- `/compress` - Comprime o histórico para economizar tokens
- `/stats` - Mostra informações da sessão atual
- `/exit` ou `/quit` - Sai do Qwen Code

### Atalhos de Teclado

- `Ctrl+C` - Cancela a operação atual
- `Ctrl+D` - Sai (em linha vazia)
- `Up/Down` - Navega pelo histórico de comandos