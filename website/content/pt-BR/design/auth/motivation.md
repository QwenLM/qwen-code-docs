# Motivação do Registro de Provedores de Autenticação

O módulo de autenticação costumava modelar cada caminho de configuração como um fluxo separado: chave de API, OAuth, planos de assinatura e provedores personalizados. Na prática, todos esses caminhos produzem o mesmo tipo de saída: atualizações na configuração do provedor do usuário em `~/.qwen/settings.json`.

Esta refatoração torna a configuração do provedor a abstração compartilhada. Um provedor descreve como é exibido, como as credenciais são coletadas, quais modelos instala e qual patch de configurações deve ser aplicado. Chaves de API, OAuth, planos de codificação, planos de tokens e assistentes personalizados são métodos de configuração para um provedor, não arquiteturas de autenticação separadas.

## Objetivos

- Manter os fluxos voltados ao usuário em `/auth` fáceis de entender:
  - Alibaba ModelStudio para configuração de primeira parte do Qwen.
  - Provedores de terceiros para integrações comuns integradas, como DeepSeek, MiniMax e Z.AI.
  - Provedores OAuth, como OpenRouter.
  - Provedores personalizados para servidores locais, proxies ou provedores que não são integrados.
- Mover dados específicos de cada provedor para configurações de provedor declarativas e pequenas.
- Tornar as contribuições de provedores de terceiros simples: adicionar um provedor comum geralmente deve significar adicionar uma configuração de provedor mais testes.
- Centralizar as gravações de configurações por meio de `ProviderInstallPlan` e `applyProviderInstallPlan`.
- Manter o agrupamento da interface separado do comportamento de instalação. Os grupos ajudam os usuários a navegar em `/auth`; eles não devem conduzir a lógica de configurações.
- Preservar um caminho para a propriedade da lista de modelos e metadados do provedor, para que as atualizações do modelo do provedor possam ser detectadas e aplicadas com segurança.

## Arquitetura

A nova estrutura separa as definições de provedor, a lógica de instalação e o estado da interface:

```text
packages/cli/src/auth/
├── allProviders.ts
├── providerConfig.ts
├── types.ts
├── install/
│   └── applyProviderInstallPlan.ts
└── providers/
    ├── alibaba/
    ├── custom/
    ├── oauth/
    └── thirdParty/
```

`ProviderConfig` é o contrato declarativo para provedores integrados. Ele contém o rótulo do provedor, protocolo, opções de URL base, chave de ambiente, lista de modelos, metadados do modelo, agrupamento na interface e comportamento de configuração.

`buildInstallPlan` converte uma configuração de provedor e as entradas de configuração coletadas em um `ProviderInstallPlan`. O plano de instalação é o único objeto que o gravador de configurações precisa entender.

`applyProviderInstallPlan` aplica esse plano atualizando as configurações de ambiente, `modelProviders`, o tipo de autenticação selecionado, a seleção opcional de modelos e os metadados do provedor. Isso mantém a persistência das configurações independente do fluxo da interface que coletou as entradas.

## Fluxos do usuário

`/auth` ainda pode apresentar diferentes pontos de entrada, mas todos devem convergir para o mesmo caminho de instalação do provedor:

1. **Alibaba ModelStudio**
   - Plano de Codificação
   - Plano de Tokens
   - Chave de API padrão

2. **Provedores de Terceiros**
   - Provedores comuns com valores padrão integrados.
   - Cada provedor deve ter sua própria URL base, chave de ambiente, modelos padrão e metadados do modelo.
   - A Z.AI deve usar a URL base específica da configuração:
     - Plano de Codificação: `https://api.z.ai/api/coding/paas/v4`
     - Chave de API padrão: `https://api.z.ai/api/paas/v4`

3. **OAuth**
   - Autorização baseada em navegador para plataformas de roteamento como OpenRouter.
   - Mecanismos específicos do OAuth podem viver na implementação do provedor, mas o resultado final ainda deve ser um plano de instalação do provedor.

4. **Provedor Personalizado**
   - Configuração manual para servidores locais, proxies ou provedores não suportados.
   - O assistente coleta protocolo, URL base, chave de API, IDs de modelo e opções avançadas de modelo, como raciocínio, entrada multimodal, janela de contexto e tokens máximo.

## Propriedade e atualizações de modelos

Provedores estáticos integrados podem persistir metadados do provedor em `providerMetadata.<providerId>`, incluindo a versão da lista de modelos e a URL base. Isso permite que o Qwen Code detecte quando a lista de modelos integrados de um provedor muda e solicite ao usuário que atualize os modelos pertencentes, sem sobrescrever modelos personalizados não relacionados.

Provedores personalizados são diferentes: sua lista de modelos é criada pelo usuário e não deve ser tratada como uma lista de modelos integrados atualizável automaticamente.

## Não objetivos

- Não tornar a chave de API, OAuth, plano de codificação ou plano de tokens a arquitetura de configurações de nível superior.
- Não acoplar gravações de configurações a componentes React ou manipuladores de comandos CLI.
- Não tornar grupos da interface um eixo de lógica de negócios.
- Não exigir que contribuidores entendam toda a interface de autenticação para adicionar um provedor de terceiros simples.