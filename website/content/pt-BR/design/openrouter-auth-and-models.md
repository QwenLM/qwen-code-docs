# Design de Autenticação e Gerenciamento de Modelos do OpenRouter

Este documento descreve a intenção de design por trás do fluxo de autenticação do OpenRouter e das
alterações no gerenciamento de modelos introduzidas com ele. O foco é intencionalmente nas escolhas
de produto e arquitetura, e não no histórico de implementação.

## Objetivos

- Permitir que os usuários se autentiquem com o OpenRouter tanto pela CLI quanto por `/auth`.
- Reutilizar o caminho de provedor compatível com OpenAI existente, em vez de adicionar um novo tipo
  de autenticação para o OpenRouter.
- Tornar a experiência de primeira execução utilizável, sem exigir que os usuários gerenciem centenas de
  modelos imediatamente.
- Manter um caminho claro para um gerenciamento de modelos mais robusto via `/manage-models`.

## Autenticação do OpenRouter

O OpenRouter é integrado como um provedor compatível com OpenAI:

- tipo de autenticação: `AuthType.USE_OPENAI`
- configurações do provedor: `modelProviders.openai`
- variável de ambiente da API key: `OPENROUTER_API_KEY`
- URL base: `https://openrouter.ai/api/v1`

Isso evita a introdução de um `AuthType` específico para o OpenRouter, já que o caminho do provedor de modelos
em tempo de execução já é compatível com OpenAI. Mantém o status de autenticação, a resolução de modelos,
a seleção de provedor e o esquema de configurações alinhados com a abstração de provedor existente.

Os fluxos voltados ao usuário são:

- `qwen auth openrouter --key <key>` para automação ou configuração direta da API key.
- `qwen auth openrouter` para OAuth baseado em navegador.
- `/auth` → API Key → OpenRouter para o fluxo da TUI.

O OAuth no navegador utiliza o fluxo PKCE do OpenRouter e grava a API key obtida nas
configurações antes de atualizar a autenticação como `AuthType.USE_OPENAI`.

## Gerenciamento de Modelos

O OpenRouter expõe um catálogo de modelos dinâmico e extenso. Gravar todos os modelos descobertos
em `modelProviders.openai` deixaria `/model` poluído e transformaria um campo de configurações de longo prazo
em um cache de um catálogo remoto.

A divisão principal do design é:

- **Catálogo**: o conjunto completo de modelos descobertos a partir de uma fonte como
  o OpenRouter.
- **Conjunto habilitado**: o subconjunto menor de modelos que deve aparecer em `/model` e
  ser persistido nas configurações do usuário.

Para o fluxo inicial do OpenRouter, a autenticação deve finalizar com um conjunto habilitado padrão
útil, em vez de interromper o usuário com um seletor extenso. O conjunto recomendado
deve ser pequeno, estável e priorizar modelos que permitam aos usuários testar o produto
com sucesso, incluindo modelos gratuitos quando disponíveis.

`/model` continua sendo um alternador rápido de modelos. Não deve se tornar o local onde
os usuários navegam e curam o catálogo completo de um provedor.

## `/manage-models`

Um gerenciamento de modelos mais robusto deve ficar em um ponto de entrada separado, `/manage-models`. Esse
fluxo deve permitir que os usuários:

- naveguem pelos modelos descobertos;
- pesquisem por id, nome de exibição, prefixo do provedor e tags derivadas, como `free` ou
  `vision`;
- vejam quais modelos estão habilitados no momento;
- habilitem ou desabilitem modelos em lote.

A dimensão de origem deve permanecer parte deste design. O OpenRouter é apenas a
primeira fonte de catálogo dinâmico; fontes futuras, como ModelScope e ModelStudio,
devem se encaixar na mesma estrutura. A complexidade da UI pode ser reduzida, mas a abstração
de origem subjacente deve permanecer disponível como ponto de extensão.

## Limites Atuais

Esta alteração deve fazer o mínimo necessário para tornar a autenticação e a configuração de modelos do OpenRouter
agradáveis:

- A autenticação via OAuth ou por API key configura o OpenRouter por meio do caminho
  de provedor compatível com OpenAI existente.
- O conjunto inicial de modelos habilitados é curado, em vez de despejar o catálogo completo
  nas configurações.
- O armazenamento, navegação, filtragem e gerenciamento em lote do catálogo completo são reservados para
  `/manage-models`.

O princípio de design é simples: a autenticação deve levar os usuários a um estado funcional
rapidamente, enquanto a curadoria de modelos deve ficar em um fluxo de gerenciamento dedicado.