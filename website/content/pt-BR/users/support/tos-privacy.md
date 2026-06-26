# Qwen Code: Termos de Serviço e Aviso de Privacidade

Qwen Code é uma ferramenta de assistente de codificação de IA de código aberto mantida pela equipe do Qwen Code. Este documento descreve os termos de serviço e políticas de privacidade que se aplicam ao usar os métodos de autenticação e serviços de modelo de IA do Qwen Code.

## Como determinar seu método de autenticação

O Qwen Code suporta três métodos de autenticação para acessar modelos de IA. Seu método de autenticação determina quais termos de serviço e políticas de privacidade se aplicam ao seu uso:

1. **Qwen OAuth** — Faça login com sua conta qwen.ai (nível gratuito descontinuado em 15/04/2026)
2. **Alibaba Cloud Coding Plan** — Use uma chave de API da Alibaba Cloud
3. **API Key** — Traga sua própria chave de API

Para cada método de autenticação, diferentes Termos de Serviço e Avisos de Privacidade podem se aplicar, dependendo do provedor de serviço subjacente.

| Método de Autenticação     | Provedor          | Termos de Serviço                                                   | Aviso de Privacidade                                                     |
| :------------------------ | :---------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Termos de Serviço do Qwen](https://qwen.ai/termsservice)              | [Política de Privacidade do Qwen](https://qwen.ai/privacypolicy)               |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | Veja [detalhes abaixo](#2-if-you-are-using-alibaba-cloud-coding-plan) | Veja [detalhes abaixo](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                   | Vários Provedores | Depende do provedor de API escolhido (OpenAI, Anthropic, etc.)      | Depende do provedor de API escolhido                                |

## 1. Se você está usando autenticação Qwen OAuth

Quando você se autentica usando sua conta qwen.ai, estes documentos de Termos de Serviço e Aviso de Privacidade se aplicam:

- **Termos de Serviço:** Seu uso é regido pelos [Termos de Serviço do Qwen](https://qwen.ai/termsservice).
- **Aviso de Privacidade:** A coleta e uso de seus dados estão descritos na [Política de Privacidade do Qwen](https://qwen.ai/privacypolicy).

Para detalhes sobre configuração de autenticação, cotas e recursos suportados, consulte [Configuração de Autenticação](../configuration/settings).

## 2. Se você está usando o Alibaba Cloud Coding Plan

Quando você se autentica usando uma chave de API da Alibaba Cloud, os Termos de Serviço e Aviso de Privacidade aplicáveis da Alibaba Cloud se aplicam.

O Alibaba Cloud Coding Plan está disponível em duas regiões:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Ao usar o Alibaba Cloud Coding Plan, você está sujeito aos termos e políticas de privacidade da Alibaba Cloud. Consulte a documentação deles para obter detalhes específicos sobre uso de dados, retenção e práticas de privacidade.

## 3. Se você está usando sua própria chave de API

Quando você se autentica usando chaves de API de outros provedores, os Termos de Serviço e Aviso de Privacidade aplicáveis dependem do provedor escolhido.

> [!important]
>
> Ao usar sua própria chave de API, você está sujeito aos termos e políticas de privacidade do provedor de API escolhido, não aos termos do Qwen Code. Consulte a documentação do seu provedor para obter detalhes específicos sobre uso de dados, retenção e práticas de privacidade.

O Qwen Code suporta vários provedores compatíveis com OpenAI. Consulte os termos de serviço e política de privacidade do seu provedor específico para obter informações detalhadas.

## Estatísticas de Uso e Telemetria

O Qwen Code pode coletar estatísticas de uso anônimas e dados de [telemetria](../../developers/development/telemetry) para melhorar a experiência do usuário e a qualidade do produto. Esta coleta de dados é opcional e pode ser controlada através das configurações.

### Quais Dados são Coletados

Quando ativado, o Qwen Code pode coletar:

- Estatísticas de uso anônimas (comandos executados, métricas de desempenho)
- Relatórios de erro e dados de falha
- Padrões de uso de recursos

### Coleta de Dados por Método de Autenticação

- **Qwen OAuth:** As estatísticas de uso são regidas pela política de privacidade do Qwen. Você pode optar por não participar através das configurações do Qwen Code.
- **Alibaba Cloud Coding Plan:** As estatísticas de uso são regidas pela política de privacidade da Alibaba Cloud. Você pode optar por não participar através das configurações do Qwen Code.
- **API Key:** Nenhum dado adicional é coletado pelo Qwen Code além do que seu provedor de API escolhido coleta.

## Perguntas Frequentes (FAQ)

### 1. Meu código, incluindo prompts e respostas, é usado para treinar modelos de IA?

Se seu código, incluindo prompts e respostas, é usado para treinar modelos de IA depende do seu método de autenticação e do provedor de serviço de IA específico que você usa:

- **Qwen OAuth**: O uso de dados é regido pela [Política de Privacidade do Qwen](https://qwen.ai/privacy). Consulte a política deles para obter detalhes específicos sobre coleta de dados e práticas de treinamento de modelos.

- **Alibaba Cloud Coding Plan**: O uso de dados é regido pela política de privacidade da Alibaba Cloud. Consulte a política deles para obter detalhes específicos sobre coleta de dados e práticas de treinamento de modelos.
- **Chave de API**: O uso dos dados depende inteiramente do provedor de API escolhido. Cada provedor possui suas próprias políticas de uso de dados. Analise a política de privacidade e os termos de serviço do seu provedor específico.

**Importante**: O Qwen Code em si não utiliza seus prompts, códigos ou respostas para treinamento de modelos. Qualquer uso de dados para fins de treinamento será regido pelas políticas do provedor de serviços de IA com o qual você se autentica.

### 2. O que são as Estatísticas de Uso e o que o controle de exclusão controla?

A configuração **Estatísticas de Uso** controla a coleta opcional de dados pelo Qwen Code para melhorar a experiência do usuário e a qualidade do produto.

Quando ativado, o Qwen Code pode coletar:

- Telemetria anônima (comandos executados, métricas de desempenho, uso de funcionalidades)
- Relatórios de erro e dados de falha
- Padrões gerais de uso

**O que NÃO é coletado pelo Qwen Code:**

- O conteúdo do seu código
- Prompts enviados para modelos de IA
- Respostas de modelos de IA
- Informações pessoais

A configuração Estatísticas de Uso controla apenas a coleta de dados pelo próprio Qwen Code. Ela não afeta quais dados seu provedor de serviços de IA escolhido (Qwen, OpenAI, etc.) pode coletar de acordo com suas próprias políticas de privacidade.

### 3. Como alternar entre métodos de autenticação?

Você pode alternar entre Qwen OAuth, Alibaba Cloud Coding Plan e sua própria chave de API a qualquer momento:

1. **Durante a inicialização**: Escolha seu método de autenticação preferido quando solicitado
2. **No CLI**: Use o comando `/auth` para reconfigurar seu método de autenticação
3. **Variáveis de ambiente**: Configure arquivos `.env` para autenticação automática com chave de API

Para instruções detalhadas, consulte a documentação [Configuração de Autenticação](../configuration/auth.md).
