# Chips de ícones de menção do Web Shell

## Problema

O menu de menção @ personalizado pode inserir referências de extensões, arquivos e MCP, mas os itens aceitos eram renderizados como texto simples no composer. Um caminho anterior do composer renderizava essas referências como chips de ícones. A arquitetura de menção personalizada atual também precisa de uma maneira para que itens de menção definidos pelo host, como tabelas, usem a mesma renderização de chips.

## Design

- Manter o menu de menção @ responsável por escolher e inserir o texto.
- Permitir que os itens de menção forneçam opcionalmente um `composerTag` que descreve a referência inserida.
- Continuar criando automaticamente tags do composer para os provedores integrados de arquivos, extensões e MCP, para que as menções integradas existentes recuperem os chips de ícones sem alterações no host.
- Adicionar uma prop `composerTagIcons` no `WebShell` para que os hosts possam registrar URLs de ícones por `composerTag.kind`.
- Resolver os ícones no momento da renderização do composer por meio de um helper que verifica os ícones personalizados primeiro e faz fallback para os ícones integrados.
- Armazenar as URLs de ícones resolvidas apenas nos dados internos de decoração inline e removê-las dos valores públicos das tags do composer.

## Escopo

Esta alteração cobre o registro e a renderização de ícones de tags do composer para itens de menção @ aceitos e tags inline inseridas programaticamente. Ela não altera as linhas visíveis do seletor de menção @ nem adiciona uma nova API de registro de provedores além da superfície existente de `atProviders`.

## Riscos

- As URLs de ícones personalizados são aplicadas por meio de máscaras CSS, portanto, os valores de URL devem ser escapados antes de escrever as propriedades personalizadas do CSS.
- As decorações inline existentes precisam ser atualizadas se `composerTagIcons` for alterado enquanto houver texto no editor.