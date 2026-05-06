# Qwen Code: Termos de Serviço e Aviso de Privacidade

O Qwen Code é uma ferramenta de assistência de programação com IA de código aberto mantida pela equipe do Qwen Code. Este documento descreve os termos de serviço e as políticas de privacidade aplicáveis ao usar os métodos de autenticação e os serviços de modelos de IA do Qwen Code.

## Como determinar seu método de autenticação

O Qwen Code oferece suporte a três métodos de autenticação para acessar modelos de IA. Seu método de autenticação determina quais termos de serviço e políticas de privacidade se aplicam ao seu uso:

1. **Qwen OAuth** — Faça login com sua conta qwen.ai (plano gratuito descontinuado em 15/04/2026)
2. **Alibaba Cloud Coding Plan** — Use uma API key da Alibaba Cloud
3. **API Key** — Forneça sua própria API key

Para cada método de autenticação, podem ser aplicados Termos de Serviço e Avisos de Privacidade diferentes, dependendo do provedor de serviço subjacente.

| Método de Autenticação    | Provedor          | Termos de Serviço                                                  | Aviso de Privacidade                                               |
| :------------------------ | :---------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Qwen Terms of Service](https://qwen.ai/termsservice)              | [Qwen Privacy Policy](https://qwen.ai/privacypolicy)               |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | Consulte os [detalhes abaixo](#2-if-you-are-using-alibaba-cloud-coding-plan) | Consulte os [detalhes abaixo](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                   | Vários Provedores | Depende do provedor de API escolhido (OpenAI, Anthropic, etc.)     | Depende do provedor de API escolhido                               |

## 1. Se você estiver usando a Autenticação Qwen OAuth

Ao se autenticar usando sua conta qwen.ai, aplicam-se os seguintes documentos de Termos de Serviço e Aviso de Privacidade:

- **Termos de Serviço:** Seu uso é regido pelos [Termos de Serviço do Qwen](https://qwen.ai/termsservice).
- **Aviso de Privacidade:** A coleta e o uso dos seus dados são descritos na [Política de Privacidade do Qwen](https://qwen.ai/privacypolicy).

Para obter detalhes sobre a configuração de autenticação, cotas e recursos suportados, consulte [Configuração de Autenticação](../configuration/settings).

## 2. Se você estiver usando o Alibaba Cloud Coding Plan

Ao se autenticar usando uma API key da Alibaba Cloud, aplicam-se os Termos de Serviço e o Aviso de Privacidade aplicáveis da Alibaba Cloud.

O Alibaba Cloud Coding Plan está disponível em duas regiões:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Ao usar o Alibaba Cloud Coding Plan, você está sujeito aos termos e políticas de privacidade da Alibaba Cloud. Consulte a documentação deles para obter detalhes específicos sobre uso de dados, retenção e práticas de privacidade.

## 3. Se você estiver usando sua própria API Key

Ao se autenticar usando API keys de outros provedores, os Termos de Serviço e o Aviso de Privacidade aplicáveis dependem do provedor escolhido.

> [!important]
>
> Ao usar sua própria API key, você está sujeito aos termos e políticas de privacidade do provedor de API escolhido, e não aos termos do Qwen Code. Consulte a documentação do seu provedor para obter detalhes específicos sobre uso de dados, retenção e práticas de privacidade.

O Qwen Code oferece suporte a vários provedores compatíveis com OpenAI. Consulte os termos de serviço e a política de privacidade do seu provedor específico para obter informações detalhadas.

## Estatísticas de Uso e Telemetria

O Qwen Code pode coletar estatísticas de uso anônimas e dados de [telemetria](../../developers/development/telemetry) para melhorar a experiência do usuário e a qualidade do produto. Essa coleta de dados é opcional e pode ser controlada por meio de configurações.

### Quais Dados São Coletados

Quando ativado, o Qwen Code pode coletar:

- Estatísticas de uso anônimas (comandos executados, métricas de desempenho)
- Relatórios de erros e dados de falhas
- Padrões de uso de recursos

### Coleta de Dados por Método de Autenticação

- **Qwen OAuth:** As estatísticas de uso são regidas pela política de privacidade do Qwen. Você pode optar por não participar por meio das configurações do Qwen Code.
- **Alibaba Cloud Coding Plan:** As estatísticas de uso são regidas pela política de privacidade da Alibaba Cloud. Você pode optar por não participar por meio das configurações do Qwen Code.
- **API Key:** Nenhum dado adicional é coletado pelo Qwen Code além do que o provedor de API escolhido coleta.

## Perguntas Frequentes (FAQ)

### 1. Meu código, incluindo prompts e respostas, é usado para treinar modelos de IA?

Se o seu código, incluindo prompts e respostas, é usado para treinar modelos de IA depende do seu método de autenticação e do provedor de serviço de IA específico que você utiliza:

- **Qwen OAuth**: O uso de dados é regido pela [Política de Privacidade do Qwen](https://qwen.ai/privacy). Consulte a política deles para obter detalhes específicos sobre práticas de coleta de dados e treinamento de modelos.

- **Alibaba Cloud Coding Plan**: O uso de dados é regido pela política de privacidade da Alibaba Cloud. Consulte a política deles para obter detalhes específicos sobre práticas de coleta de dados e treinamento de modelos.

- **API Key**: O uso de dados depende inteiramente do provedor de API escolhido. Cada provedor possui suas próprias políticas de uso de dados. Consulte a política de privacidade e os termos de serviço do seu provedor específico.

**Importante**: O próprio Qwen Code não usa seus prompts, código ou respostas para treinamento de modelos. Qualquer uso de dados para fins de treinamento será regido pelas políticas do provedor de serviço de IA com o qual você se autentica.

### 2. O que são Estatísticas de Uso e o que a opção de desativação controla?

A configuração **Estatísticas de Uso** controla a coleta opcional de dados pelo Qwen Code para melhorar a experiência do usuário e a qualidade do produto.

Quando ativada, o Qwen Code pode coletar:

- Telemetria anônima (comandos executados, métricas de desempenho, uso de recursos)
- Relatórios de erros e dados de falhas
- Padrões gerais de uso

**O que NÃO é coletado pelo Qwen Code:**

- O conteúdo do seu código
- Prompts enviados aos modelos de IA
- Respostas dos modelos de IA
- Informações pessoais

A configuração Estatísticas de Uso controla apenas a coleta de dados pelo próprio Qwen Code. Ela não afeta quais dados o provedor de serviço de IA escolhido (Qwen, OpenAI, etc.) pode coletar de acordo com suas próprias políticas de privacidade.

### 3. Como alternar entre métodos de autenticação?

Você pode alternar entre Qwen OAuth, Alibaba Cloud Coding Plan e sua própria API key a qualquer momento:

1. **Durante a inicialização**: Escolha seu método de autenticação preferido quando solicitado
2. **Na CLI**: Use o comando `/auth` para reconfigurar seu método de autenticação
3. **Variáveis de ambiente**: Configure arquivos `.env` para autenticação automática com API key

Para instruções detalhadas, consulte a documentação de [Configuração de Autenticação](../configuration/settings#environment-variables-for-api-access).