# Qwen Code: Termos de Serviço e Aviso de Privacidade

O Qwen Code é uma ferramenta de assistente de programação com IA de código aberto mantida pela equipe do Qwen Code. Este documento descreve os termos de serviço e as políticas de privacidade aplicáveis ao uso dos métodos de autenticação do Qwen Code e dos serviços de modelos de IA.

## Como determinar seu método de autenticação

O Qwen Code oferece três métodos de autenticação para acessar modelos de IA. Seu método de autenticação define quais termos de serviço e políticas de privacidade se aplicam ao seu uso:

1. **OAuth do Qwen** — Faça login com sua conta qwen.ai (cota diária gratuita)
2. **Plano de Codificação da Alibaba Cloud** — Use uma chave de API da Alibaba Cloud
3. **Chave de API** — Forneça sua própria chave de API

Para cada método de autenticação, diferentes Termos de Serviço e Avisos de Privacidade podem se aplicar, dependendo do provedor de serviço subjacente.

| Método de Autenticação     | Provedor          | Termos de Serviço                                                   | Aviso de Privacidade                                               |
| :------------------------- | :---------------- | :------------------------------------------------------------------ | :----------------------------------------------------------------- |
| OAuth do Qwen              | Qwen AI           | [Termos de Serviço do Qwen](https://qwen.ai/termsservice)           | [Política de Privacidade do Qwen](https://qwen.ai/privacypolicy)   |
| Plano de Codificação da Alibaba Cloud | Alibaba Cloud     | Veja os [detalhes abaixo](#2-se-você-está-usando-o-plano-de-codificação-da-alibaba-cloud) | Veja os [detalhes abaixo](#2-se-você-está-usando-o-plano-de-codificação-da-alibaba-cloud) |
| Chave de API               | Vários Provedores | Depende do provedor de API escolhido (OpenAI, Anthropic etc.)      | Depende do provedor de API escolhido                               |

## 1. Se você estiver usando a autenticação OAuth do Qwen

Quando você se autentica com sua conta qwen.ai, estes documentos se aplicam:

- **Termos de Serviço:** O seu uso é regido pelos [Termos de Serviço do Qwen](https://qwen.ai/termsservice).
- **Aviso de Privacidade:** A coleta e o uso dos seus dados são descritos na [Política de Privacidade do Qwen](https://qwen.ai/privacypolicy).

Para obter detalhes sobre a configuração da autenticação, cotas e recursos compatíveis, consulte [Configuração de Autenticação](../configuration/settings).

## 2. Se você estiver usando o Alibaba Cloud Coding Plan

Ao se autenticar com uma chave de API do Alibaba Cloud, os Termos de Serviço e Aviso de Privacidade aplicáveis do Alibaba Cloud passam a vigorar.

O Alibaba Cloud Coding Plan está disponível em duas regiões:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)  
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Ao usar o Alibaba Cloud Coding Plan, você está sujeito aos termos e políticas de privacidade do Alibaba Cloud. Consulte a documentação deles para obter detalhes específicos sobre o uso de dados, retenção e práticas de privacidade.

## 3. Se você estiver usando sua própria chave de API

Ao se autenticar com chaves de API de outros provedores, os Termos de Serviço e Aviso de Privacidade aplicáveis dependem do provedor escolhido.

> [!important]
>
> Ao usar sua própria chave de API, você está sujeito aos termos e políticas de privacidade do provedor de API escolhido, e não aos termos do Qwen Code. Consulte a documentação do seu provedor para obter detalhes específicos sobre o uso de dados, retenção e práticas de privacidade.

O Qwen Code oferece suporte a diversos provedores compatíveis com a OpenAI. Consulte os Termos de Serviço e a Política de Privacidade do seu provedor específico para obter informações detalhadas.

## Estatísticas de uso e telemetria

O Qwen Code pode coletar estatísticas anônimas de uso e dados de [telemetria](../../developers/development/telemetry) para melhorar a experiência do usuário e a qualidade do produto. Essa coleta de dados é opcional e pode ser controlada por meio das configurações.

### Quais Dados São Coletados

Quando habilitado, o Qwen Code pode coletar:

- Estatísticas de uso anônimas (comandos executados, métricas de desempenho)
- Relatórios de erros e dados de falhas
- Padrões de uso de recursos

### Coleta de Dados por Método de Autenticação

- **OAuth do Qwen:** As estatísticas de uso são regidas pela política de privacidade do Qwen. Você pode optar por não participar nas configurações do Qwen Code.
- **Plano Alibaba Cloud Coding:** As estatísticas de uso são regidas pela política de privacidade da Alibaba Cloud. Você pode optar por não participar nas configurações do Qwen Code.
- **Chave de API:** O Qwen Code não coleta dados adicionais além dos que seu provedor de API escolhido já coleta.

## Perguntas Frequentes (FAQ)

### 1. Meu código, incluindo prompts e respostas, é usado para treinar modelos de IA?

Se o seu código, incluindo prompts e respostas, é usado para treinar modelos de IA depende do seu método de autenticação e do provedor específico de serviço de IA que você utiliza:

- **OAuth do Qwen**: O uso de dados é regido pela [Política de Privacidade do Qwen](https://qwen.ai/privacy). Consulte essa política para obter detalhes específicos sobre coleta de dados e práticas de treinamento de modelos.

- **Plano de Codificação da Alibaba Cloud**: O uso de dados é regido pela política de privacidade da Alibaba Cloud. Consulte essa política para obter detalhes específicos sobre coleta de dados e práticas de treinamento de modelos.

- **Chave de API**: O uso de dados depende inteiramente do provedor de API escolhido por você. Cada provedor possui suas próprias políticas de uso de dados. Revise a política de privacidade e os termos de serviço do seu provedor específico.

**Importante**: O Qwen Code em si não utiliza seus prompts, código ou respostas para treinamento de modelos. Qualquer uso de dados com finalidade de treinamento será regido pelas políticas do provedor de serviço de IA com o qual você se autenticar.

### 2. O que são Estatísticas de Uso e o que controla a opção de recusa?

A configuração **Estatísticas de Uso** controla a coleta opcional de dados pelo Qwen Code para melhorar a experiência do usuário e a qualidade do produto.

Quando ativada, o Qwen Code pode coletar:

- Telemetria anônima (comandos executados, métricas de desempenho, uso de recursos)
- Relatórios de erros e dados de falhas
- Padrões gerais de uso

**O que NÃO é coletado pelo Qwen Code:**

- Seu código
- Solicitações enviadas aos modelos de IA
- Respostas dos modelos de IA
- Informações pessoais

A configuração Estatísticas de Uso controla apenas a coleta de dados pelo próprio Qwen Code. Ela não afeta quais dados seu provedor de serviço de IA escolhido (Qwen, OpenAI etc.) pode coletar, conforme suas próprias políticas de privacidade.

### 3. Como alternar entre os métodos de autenticação?

Você pode alternar entre a autenticação OAuth do Qwen, o Plano de Codificação da Alibaba Cloud e sua própria chave de API a qualquer momento:

1. **Durante a inicialização**: Escolha seu método de autenticação preferido quando solicitado  
2. **No CLI**: Use o comando `/auth` para reconfigurar seu método de autenticação  
3. **Variáveis de ambiente**: Configure arquivos `.env` para autenticação automática com chave de API  

Para instruções detalhadas, consulte a documentação [Configuração de Autenticação](../configuration/settings#environment-variables-for-api-access).