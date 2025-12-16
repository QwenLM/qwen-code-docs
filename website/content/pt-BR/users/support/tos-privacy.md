# Qwen Code: Termos de Serviço e Aviso de Privacidade

O Qwen Code é uma ferramenta de assistente de codificação AI de código aberto mantida pela equipe do Qwen Code. Este documento descreve os termos de serviço e as políticas de privacidade que se aplicam ao usar os métodos de autenticação e os serviços do modelo AI do Qwen Code.

## Como determinar seu método de autenticação

O Qwen Code suporta dois principais métodos de autenticação para acessar modelos de IA. Seu método de autenticação determina quais termos de serviço e políticas de privacidade se aplicam ao seu uso:

1. **Qwen OAuth** - Faça login com sua conta qwen.ai
2. **API compatível com OpenAI** - Use chaves de API de vários provedores de modelos de IA

Para cada método de autenticação, diferentes Termos de Serviço e Avisos de Privacidade podem ser aplicáveis dependendo do provedor de serviço subjacente.

| Método de Autenticação | Provedor          | Termos de Serviço                                                              | Aviso de Privacidade                                  |
| :--------------------- | :---------------- | :----------------------------------------------------------------------------- | :---------------------------------------------------- |
| Qwen OAuth             | Qwen AI           | [Termos de Serviço da Qwen](https://qwen.ai/termsservice)                      | [Política de Privacidade da Qwen](https://qwen.ai/privacypolicy) |
| API compatível com OpenAI | Vários Provedores | Depende do provedor de API escolhido (OpenAI, Alibaba Cloud, ModelScope, etc.) | Depende do provedor de API escolhido                 |

## 1. Se você estiver usando a Autenticação OAuth do Qwen

Quando você se autentica usando sua conta qwen.ai, estes documentos de Termos de Serviço e Aviso de Privacidade se aplicam:

- **Termos de Serviço:** Seu uso é regido pelos [Termos de Serviço do Qwen](https://qwen.ai/termsservice).
- **Aviso de Privacidade:** A coleta e o uso dos seus dados são descritos na [Política de Privacidade do Qwen](https://qwen.ai/privacypolicy).

Para detalhes sobre a configuração da autenticação, cotas e recursos suportados, consulte [Configuração de Autenticação](../users/configuration/settings).

## 2. Se você estiver usando Autenticação de API Compatível com OpenAI

Quando você se autentica usando chaves de API de provedores compatíveis com OpenAI, os Termos de Serviço e Aviso de Privacidade aplicáveis dependem do seu provedor escolhido.

> [!important]
>
> Ao usar autenticação de API compatível com OpenAI, você está sujeito aos termos e políticas de privacidade do seu provedor de API escolhido, não aos termos do Qwen Code. Por favor, consulte a documentação do seu provedor para obter detalhes específicos sobre uso de dados, retenção e práticas de privacidade.

O Qwen Code suporta vários provedores compatíveis com OpenAI. Por favor, consulte os termos de serviço e política de privacidade do seu provedor específico para informações detalhadas.

## Estatísticas de Uso e Telemetria

O Qwen Code pode coletar estatísticas de uso anônimas e dados de [telemetria](/developers/development/telemetry) para melhorar a experiência do usuário e a qualidade do produto. Esta coleta de dados é opcional e pode ser controlada através das configurações.

### Quais Dados São Coletados

Quando habilitado, o Qwen Code pode coletar:

- Estatísticas de uso anônimas (comandos executados, métricas de desempenho)
- Relatórios de erro e dados de falhas
- Padrões de uso de recursos

### Coleta de Dados por Método de Autenticação

- **Qwen OAuth:** As estatísticas de uso são regidas pela política de privacidade da Qwen. Você pode desativar essa coleta por meio das configurações do Qwen Code.
- **API compatível com OpenAI:** O Qwen Code não coleta dados adicionais além daqueles coletados pelo provedor de API escolhido.

### 1. Meu código, incluindo prompts e respostas, é usado para treinar modelos de IA?

Se seu código, incluindo prompts e respostas, é usado para treinar modelos de IA depende do seu método de autenticação e do provedor específico de serviço de IA que você utiliza:

- **Qwen OAuth**: O uso dos dados é regido pela [Política de Privacidade da Qwen](https://qwen.ai/privacy). Por favor, consulte a política deles para obter detalhes específicos sobre coleta de dados e práticas de treinamento de modelos.

- **API compatível com OpenAI**: O uso dos dados depende inteiramente do provedor de API escolhido. Cada provedor tem suas próprias políticas de uso de dados. Por favor, revise a política de privacidade e os termos de serviço do seu provedor específico.

**Importante**: O Qwen Code em si não usa seus prompts, código ou respostas para treinamento de modelos. Qualquer uso de dados para fins de treinamento seria regido pelas políticas do provedor de serviço de IA com o qual você se autentica.

### 2. O que são Estatísticas de Uso e o que controla a opção de desativação?

A configuração de **Estatísticas de Uso** controla a coleta opcional de dados pelo Qwen Code para melhorar a experiência do usuário e a qualidade do produto.

Quando ativada, o Qwen Code pode coletar:

- Telemetria anônima (comandos executados, métricas de desempenho, uso de recursos)
- Relatórios de erro e dados de falhas
- Padrões gerais de uso

**O que NÃO é coletado pelo Qwen Code:**

- O conteúdo do seu código
- Prompts enviados aos modelos de IA
- Respostas dos modelos de IA
- Informações pessoais

A configuração de Estatísticas de Uso controla apenas a coleta de dados realizada pelo próprio Qwen Code. Ela não afeta quais dados seu provedor de serviço de IA escolhido (Qwen, OpenAI, etc.) pode coletar de acordo com suas próprias políticas de privacidade.

### 3. Como faço para alternar entre métodos de autenticação?

Você pode alternar entre autenticação via OAuth do Qwen e autenticação compatível com a API do OpenAI a qualquer momento:

1. **Durante a inicialização**: Escolha seu método de autenticação preferido quando solicitado
2. **Dentro da CLI**: Use o comando `/auth` para reconfigurar seu método de autenticação
3. **Variáveis de ambiente**: Configure arquivos `.env` para autenticação automática compatível com a API do OpenAI

Para instruções detalhadas, consulte a documentação de [Configuração de Autenticação](../users/configuration/settings#environment-variables-for-api-access).