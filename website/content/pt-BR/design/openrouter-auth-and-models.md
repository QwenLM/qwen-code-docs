# Design de Autenticação e Gerenciamento de Modelos do OpenRouter

Este documento captura a intenção de design por trás do fluxo de autenticação do OpenRouter e das
mudanças no gerenciamento de modelos introduzidas com ele. Ele se concentra intencionalmente nas
escolhas de produto e arquitetura, não no histórico de implementação.

## Objetivos

- Permitir que os usuários autentiquem com o OpenRouter a partir da CLI e de `/auth`.
- Reutilizar o caminho existente de provedor compatível com OpenAI em vez de adicionar um novo tipo de autenticação para o OpenRouter.
- Tornar a experiência da primeira execução utilizável sem exigir que os usuários gerenciem centenas de modelos imediatamente.
- Manter um caminho claro para um gerenciamento de modelos mais rico via `/manage-models`.

## Autenticação OpenRouter

O OpenRouter é integrado como um provedor compatível com OpenAI:

- tipo de autenticação: `AuthType.USE_OPENAI`
- configurações do provedor: `modelProviders.openai`
- variável de ambiente da chave da API: `OPENROUTER_API_KEY`
- URL base: `https://openrouter.ai/api/v1`

Isso evita introduzir um `AuthType` específico do OpenRouter quando o caminho do provedor de modelos em tempo de execução já é compatível com OpenAI. Mantém o status de autenticação, resolução de modelos, seleção de provedores e esquema de configurações alinhados com a abstração de provedor existente.

Os fluxos voltados ao usuário são:

- `/auth` → OpenRouter para o fluxo TUI interativo.
- Variáveis de ambiente para automação ou configuração direta da chave da API:
  `OPENROUTER_API_KEY` mais `OPENAI_BASE_URL=https://openrouter.ai/api/v1`.
- `~/.qwen/settings.json` para configuração por script que precisa de entradas explícitas de provedores de modelos.

O OAuth do navegador usa o fluxo PKCE do OpenRouter e escreve a chave da API trocada nas configurações antes de atualizar a autenticação como `AuthType.USE_OPENAI`.

## Gerenciamento de Modelos

O OpenRouter expõe um catálogo de modelos grande e dinâmico. Escrever cada modelo descoberto em `modelProviders.openai` tornaria `/model` confuso e transformaria um campo de configurações de longo prazo em um cache de um catálogo remoto.

A divisão chave do design é:

- **Catálogo**: o conjunto completo de modelos descobertos a partir de uma fonte como o OpenRouter.
- **Conjunto habilitado**: o conjunto menor de modelos que devem aparecer em `/model` e ser persistidos nas configurações do usuário.

Para o fluxo inicial do OpenRouter, a autenticação deve terminar com um conjunto habilitado padrão útil, em vez de interromper o usuário com um seletor grande. O conjunto recomendado deve ser pequeno, estável e inclinado para modelos que permitam aos usuários experimentar o produto com sucesso, incluindo modelos gratuitos quando disponíveis.

`/model` continua sendo um trocador rápido de modelos. Não deve se tornar o local onde os usuários navegam e curam um catálogo completo de provedores.

## `/manage-models`

O gerenciamento mais rico de modelos pertence a um ponto de entrada separado `/manage-models`. Esse fluxo deve permitir que os usuários:

- naveguem pelos modelos descobertos;
- pesquisem por id, nome de exibição, prefixo do provedor e tags derivadas como `free` ou `vision`;
- vejam quais modelos estão atualmente habilitados;
- habilitem ou desabilitem modelos em lote.

A dimensão da fonte deve permanecer parte deste design. O OpenRouter é apenas a primeira fonte de catálogo dinâmico; fontes futuras como ModelScope e ModelStudio devem se encaixar no mesmo formato. A complexidade da UI pode ser reduzida, mas a abstração da fonte subjacente deve permanecer disponível como ponto de extensão.

## Limite Atual

Esta mudança deve fazer o mínimo necessário para tornar a autenticação e configuração de modelos do OpenRouter agradáveis:

- Autenticação OAuth ou baseada em chave configura o OpenRouter através do caminho de provedor compatível com OpenAI existente.
- O conjunto inicial de modelos habilitados é curado, em vez de despejar o catálogo completo nas configurações.
- Armazenamento completo do catálogo, navegação, filtragem e gerenciamento em lote são adiados para `/manage-models`.

O princípio de design é simples: a autenticação deve levar os usuários rapidamente a um estado funcional, enquanto a curadoria de modelos deve residir em um fluxo de gerenciamento dedicado.
