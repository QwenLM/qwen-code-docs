# Design de Autenticação OpenRouter e Gerenciamento de Modelos

Este documento captura a intenção de design por trás do fluxo de autenticação do OpenRouter e das
mudanças no gerenciamento de modelos introduzidas com ele. Ele foca intencionalmente nas
escolhas de produto e arquitetura, e não no histórico de implementação.

## Objetivos

- Permitir que os usuários se autentiquem no OpenRouter tanto pela CLI quanto por `/auth`.
- Reutilizar o caminho de provedor compatível com OpenAI existente em vez de adicionar um novo tipo
  de autenticação para o OpenRouter.
- Tornar a experiência de primeiro uso utilizável sem exigir que os usuários gerenciem centenas de
  modelos imediatamente.
- Manter um caminho claro para um gerenciamento de modelos mais rico via `/manage-models`.

## Autenticação OpenRouter

O OpenRouter é integrado como um provedor compatível com OpenAI:

- tipo de autenticação: `AuthType.USE_OPENAI`
- configurações do provedor: `modelProviders.openai`
- variável de ambiente da chave de API: `OPENROUTER_API_KEY`
- URL base: `https://openrouter.ai/api/v1`

Isso evita introduzir um `AuthType` específico do OpenRouter quando o caminho do provedor
de modelo em tempo de execução já é compatível com OpenAI. Mantém o status de autenticação, a
resolução de modelos, a seleção de provedor e o esquema de configurações alinhados com a abstração
existente de provedor.

Os fluxos visíveis ao usuário são:

- `/auth` → OpenRouter para o fluxo interativo da TUI.
- Variáveis de ambiente para automação ou configuração direta da chave de API:
  `OPENROUTER_API_KEY` mais `OPENAI_BASE_URL=https://openrouter.ai/api/v1`.
- `~/.qwen/settings.json` para configuração por script que precisa de entradas explícitas de
  provedor de modelo.

O OAuth do navegador usa o fluxo PKCE do OpenRouter e grava a chave de API trocada nas
configurações antes de atualizar a autenticação como `AuthType.USE_OPENAI`.

## Gerenciamento de Modelos

O OpenRouter expõe um grande catálogo dinâmico de modelos. Escrever cada modelo descoberto
em `modelProviders.openai` tornaria `/model` confuso e transformaria um campo de configurações
de longo prazo em um cache de um catálogo remoto.

A divisão chave do design é:

- **Catálogo**: o conjunto completo de modelos descobertos a partir de uma fonte, como o
  OpenRouter.
- **Conjunto habilitado**: o conjunto menor de modelos que devem aparecer em `/model` e
  ser persistidos nas configurações do usuário.

Para o fluxo inicial do OpenRouter, a autenticação deve terminar com um conjunto habilitado padrão
útil, em vez de interromper o usuário com um seletor grande. O conjunto recomendado
deve ser pequeno, estável e inclinado a modelos que permitam aos usuários testar o produto com
sucesso, incluindo modelos gratuitos quando disponíveis.

`/model` continua sendo um alternador rápido de modelos. Não deve se tornar o lugar onde os
usuários navegam e curam um catálogo completo de provedor.

## `/manage-models`

O gerenciamento mais rico de modelos pertence a um ponto de entrada separado `/manage-models`. Esse
fluxo deve permitir que os usuários:

- naveguem pelos modelos descobertos;
- pesquisem por id, nome de exibição, prefixo do provedor e tags derivadas como `free` ou
  `vision`;
- vejam quais modelos estão atualmente habilitados;
- habilitem ou desabilitem modelos em lote.

A dimensão da fonte deve permanecer parte deste design. O OpenRouter é apenas a
primeira fonte de catálogo dinâmico; fontes futuras como ModelScope e ModelStudio
devem se encaixar na mesma estrutura. A complexidade da interface do usuário pode ser reduzida,
mas a abstração subjacente da fonte deve permanecer disponível como ponto de extensão.

## Limite Atual

Esta mudança deve fazer o mínimo necessário para tornar a autenticação e a configuração de modelos
do OpenRouter agradáveis:

- Autenticação OAuth ou baseada em chave configura o OpenRouter através do caminho de provedor
  compatível com OpenAI existente.
- O conjunto inicial de modelos habilitados é curado em vez de despejar o catálogo completo
  nas configurações.
- O armazenamento completo do catálogo, navegação, filtragem e gerenciamento em lote são adiados para
  `/manage-models`.

O princípio de design é simples: a autenticação deve levar os usuários a um estado funcional
rapidamente, enquanto a curadoria de modelos deve residir em um fluxo de gerenciamento dedicado.