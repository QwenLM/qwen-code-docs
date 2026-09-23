# Qwen Code: Termos de Serviço e Aviso de Privacidade

O Qwen Code é uma ferramenta assistente de codificação de IA de código aberto mantida pela equipe do Qwen Code. Este documento descreve os termos de serviço e as políticas de privacidade aplicáveis ao usar os métodos de autenticação e os serviços de modelo de IA do Qwen Code.

## Como determinar seu método de autenticação

O Qwen Code suporta quatro métodos de autenticação para acessar modelos de IA. Seu método de autenticação determina quais termos de serviço e políticas de privacidade se aplicam ao seu uso:

1. **Qwen OAuth** — Faça login com sua conta qwen.ai (camada gratuita descontinuada em 15/04/2026)
2. **Alibaba Cloud Coding Plan** — Use uma chave de API da Alibaba Cloud
3. **API Key** — Use sua própria chave de API
4. **Vertex AI** — Use o Google Cloud Vertex AI

Para cada método de autenticação, diferentes Termos de Serviço e Avisos de Privacidade podem ser aplicados, dependendo do provedor de serviço subjacente.

| Método de Autenticação     | Provedor          | Termos de Serviço                                                   | Aviso de Privacidade                                                     |
| :------------------------- | :---------------- | :------------------------------------------------------------------ | :----------------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Termos de Serviço do Qwen](https://qwen.ai/termsservice)           | [Política de Privacidade do Qwen](https://qwen.ai/privacypolicy)         |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | Veja [detalhes abaixo](#2-se-voc%C3%AA-est%C3%A1-usando-o-alibaba-cloud-coding-plan) | Veja [detalhes abaixo](#2-se-voc%C3%AA-est%C3%A1-usando-o-alibaba-cloud-coding-plan) |
| API Key                   | Vários Provedores | Depende do provedor de API escolhido (OpenAI, Anthropic, etc.)      | Depende do provedor de API escolhido                                     |
| Vertex AI                 | Google Cloud      | [Termos do Google Cloud](https://cloud.google.com/terms)            | [Privacidade do Google Cloud](https://cloud.google.com/privacy)          |

## 1. Se você está usando autenticação Qwen OAuth

Quando você se autentica usando sua conta qwen.ai, estes documentos de Termos de Serviço e Aviso de Privacidade se aplicam:

- **Termos de Serviço:** Seu uso é regido pelos [Termos de Serviço do Qwen](https://qwen.ai/termsservice).
- **Aviso de Privacidade:** A coleta e o uso de seus dados são descritos na [Política de Privacidade do Qwen](https://qwen.ai/privacypolicy).

Para detalhes sobre configuração de autenticação, cotas e recursos suportados, consulte [Configuração de Autenticação](../configuration/settings).

## 2. Se você está usando o Alibaba Cloud Coding Plan

Quando você se autentica usando uma chave de API da Alibaba Cloud, os Termos de Serviço e o Aviso de Privacidade aplicáveis da Alibaba Cloud vigoram.

O Alibaba Cloud Coding Plan está disponível em duas regiões:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Ao usar o Alibaba Cloud Coding Plan, você está sujeito aos termos e políticas de privacidade da Alibaba Cloud. Consulte a documentação deles para obter detalhes específicos sobre uso, retenção e práticas de privacidade de dados.

## 3. Se você está usando sua própria chave de API

Quando você se autentica usando chaves de API de outros provedores, os Termos de Serviço e o Aviso de Privacidade aplicáveis dependem do provedor escolhido.

> [!important]
>
> Ao usar sua própria chave de API, você está sujeito aos termos e políticas de privacidade do provedor de API escolhido, e não aos termos do Qwen Code. Consulte a documentação do seu provedor para obter detalhes específicos sobre uso, retenção e práticas de privacidade de dados.

O Qwen Code suporta vários provedores compatíveis com OpenAI. Consulte os termos de serviço e a política de privacidade do seu provedor específico para obter informações detalhadas.

## 4. Se você está usando o Vertex AI

Quando você se autentica com o Google Cloud Vertex AI, os Termos de Serviço e o Aviso de Privacidade aplicáveis são os do Google Cloud.

> [!important]
>
> Ao usar o Vertex AI, você está sujeito aos [Termos de Serviço do Google Cloud](https://cloud.google.com/terms) e ao [Aviso de Privacidade do Google Cloud](https://cloud.google.com/privacy), e não aos termos do Qwen Code. Consulte a documentação do Google Cloud para obter detalhes específicos sobre uso, retenção e práticas de privacidade de dados.

## Extensão do Chrome e Browser Use

A extensão do Chrome do Qwen Code conecta o Chrome ao Qwen Code em execução no seu computador. O painel lateral exibe o aplicativo web local do Qwen Code, e o Browser Use troca comandos e resultados do navegador por meio de um host de Native Messaging local. A seguir, são descritos os dados tratados para tarefas de navegador, separadamente das estatísticas de uso opcionais descritas abaixo.

### Dados do navegador usados nas suas tarefas

As ferramentas do navegador podem acessar títulos e URLs de abas HTTP(S) abertas, texto e estrutura da página, capturas de tela, resultados de interação com o navegador e informações de depuração, como mensagens do console, atividade de rede e cookies. Buscas explícitas no histórico do navegador retornam URLs correspondentes, títulos de páginas e horários de visita dentro dos limites da consulta solicitada. Dependendo das páginas e tarefas que você escolher, esses resultados podem conter identificadores pessoais, informações de saúde, informações financeiras ou de pagamento, informações de autenticação, comunicações pessoais e informações de localização. A extensão também usa informações de origem de navegação para associar novas páginas abertas por uma ação recente do assistente à mesma sessão do navegador.

Essas funcionalidades suportam as tarefas de navegador e o trabalho de desenvolvimento web que você solicita ao Qwen Code. As ferramentas do navegador operam no seu perfil do Chrome, incluindo páginas onde você está conectado. Escolha as páginas e tarefas que você compartilha com o assistente de acordo.

### Processamento local e provedores de IA

A extensão envia comandos e resultados do navegador para o Qwen Code no mesmo computador. O Qwen Code pode incluir esses resultados no contexto da conversa e transmiti-los ao provedor de IA configurado para aquela sessão. Os termos de privacidade, retenção e treinamento de modelos do provedor se aplicam conforme descrito em outras partes deste aviso. A conexão local da extensão é uma parte desse fluxo de dados; o processamento subsequente pode ocorrer no provedor de IA escolhido por você.

### Dados armazenados e controles do usuário

A extensão armazena preferências de conexão, um token de autenticação opcional do daemon local e um identificador persistente da instância do navegador no armazenamento local da extensão do Chrome. Também armazena o estado de propriedade de abas e sessões no armazenamento de sessão do Chrome para suportar a limpeza após a reinicialização do service worker em segundo plano.

Resultados do navegador incluídos nas conversas do Qwen Code ou salvos pelas ferramentas do navegador podem permanecer em registros locais de conversas, capturas de tela, downloads ou outros arquivos de saída. Gerencie esses registros usando os controles aplicáveis do Qwen Code e do sistema de arquivos. A retenção pelo provedor de IA é regida separadamente pelo provedor selecionado.

Você pode desativar ou desinstalar a extensão do Chrome no gerenciador de extensões do Chrome para interromper a integração com o navegador. Limpar o armazenamento da extensão remove suas preferências salvas, token e identificador de instância. Remover a extensão deixa o aplicativo do Qwen Code instalado separadamente, seu host de Native Messaging, conversas e arquivos locais, e cópias já enviadas a um provedor de IA para serem gerenciados separadamente.

### Uso limitado dos dados do navegador

O uso e a transferência de dados recebidos pela extensão do Chrome pelo Qwen Code seguem a [Política de Dados do Usuário da Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/user-data), incluindo seus requisitos de Uso Limitado. Os dados do navegador são usados para fornecer o propósito único da extensão: conectar o Chrome ao Qwen Code para assistência de navegador solicitada pelo usuário. Eles não são vendidos, usados para publicidade ou usados para determinar capacidade de crédito ou elegibilidade para empréstimos. As transferências são limitadas a fornecer essa funcionalidade, incluindo o processamento pelo provedor de IA que você configurar, e outros usos permitidos por essa política.

Para perguntas sobre o tratamento de dados do navegador, entre em contato com a equipe pelo [rastreador de issues do Qwen Code](https://github.com/QwenLM/qwen-code/issues). Compartilhe apenas os detalhes necessários para explicar a pergunta; remova credenciais e conteúdo de páginas privadas dos relatórios públicos.

## Estatísticas de Uso e Telemetria

O Qwen Code pode coletar estatísticas de uso anônimas e dados de [telemetria](../../developers/development/telemetry) para melhorar a experiência do usuário e a qualidade do produto. Esta coleta de dados é opcional e pode ser controlada através das configurações.

### Quais Dados São Coletados

Quando ativada, o Qwen Code pode coletar:

- Estatísticas de uso anônimas (comandos executados, métricas de desempenho)
- Relatórios de erro e dados de falhas
- Padrões de uso de funcionalidades

### Coleta de Dados por Método de Autenticação

- **Qwen OAuth:** As estatísticas de uso são regidas pela política de privacidade do Qwen. Você pode desativá-las através das configurações do Qwen Code.
- **Alibaba Cloud Coding Plan:** As estatísticas de uso são regidas pela política de privacidade da Alibaba Cloud. Você pode desativá-las através das configurações do Qwen Code.
- **API Key:** Nenhum dado adicional é coletado pelo Qwen Code além daquilo que seu provedor de API escolhido coleta.
- **Vertex AI:** As estatísticas de uso são regidas pela política de privacidade do Google Cloud. Nenhum dado adicional é coletado pelo Qwen Code além daquilo que o Google Cloud coleta.

## Perguntas Frequentes (FAQ)

### 1. Meu código, incluindo prompts e respostas, é usado para treinar modelos de IA?

Se seu código, incluindo prompts e respostas, é usado para treinar modelos de IA depende do seu método de autenticação e do provedor de serviço de IA específico que você utiliza:

- **Qwen OAuth**: O uso de dados é regido pela [Política de Privacidade do Qwen](https://qwen.ai/privacypolicy). Consulte a política deles para obter detalhes específicos sobre coleta de dados e práticas de treinamento de modelos.

- **Alibaba Cloud Coding Plan**: O uso de dados é regido pela política de privacidade da Alibaba Cloud. Consulte a política deles para obter detalhes específicos sobre coleta de dados e práticas de treinamento de modelos.

- **API Key**: O uso de dados depende inteiramente do provedor de API escolhido. Cada provedor tem suas próprias políticas de uso de dados. Revise a política de privacidade e os termos de serviço do seu provedor específico.

- **Vertex AI**: O uso de dados é regido pelos [Termos de Serviço do Google Cloud](https://cloud.google.com/terms) e pelo [Aviso de Privacidade](https://cloud.google.com/privacy). Consulte as políticas do Google Cloud para obter detalhes específicos sobre coleta de dados e práticas de treinamento de modelos.

**Importante**: O Qwen Code em si não usa seus prompts, código ou respostas para treinamento de modelos. Qualquer uso de dados para fins de treinamento seria regido pelas políticas do provedor de serviço de IA com o qual você se autentica.

### 2. O que são Estatísticas de Uso e o que o controle de desativação faz?

A configuração **Estatísticas de Uso** controla a coleta opcional de dados pelo Qwen Code para melhorar a experiência do usuário e a qualidade do produto.

Quando ativada, o Qwen Code pode coletar:

- Telemetria anônima (comandos executados, métricas de desempenho, uso de funcionalidades)
- Relatórios de erro e dados de falhas
- Padrões gerais de uso

**O que NÃO é coletado pelo Qwen Code:**

- O conteúdo do seu código
- Prompts enviados para modelos de IA
- Respostas dos modelos de IA
- Informações pessoais

A configuração de Estatísticas de Uso controla apenas a coleta de dados pelo próprio Qwen Code. Ela não afeta quais dados seu provedor de serviço de IA escolhido (Qwen, OpenAI, etc.) pode coletar de acordo com suas próprias políticas de privacidade.

### 3. Como faço para alternar entre os métodos de autenticação?

Você pode alternar entre Qwen OAuth, Alibaba Cloud Coding Plan, sua própria chave de API e Vertex AI a qualquer momento:

1. **Durante a inicialização**: Escolha seu método de autenticação preferido quando solicitado
2. **Dentro da CLI**: Use o comando `/auth` para reconfigurar seu método de autenticação
3. **Variáveis de ambiente**: Configure arquivos `.env` para autenticação automática com chave de API

Para instruções detalhadas, consulte a documentação [Configuração de Autenticação](../configuration/auth.md).