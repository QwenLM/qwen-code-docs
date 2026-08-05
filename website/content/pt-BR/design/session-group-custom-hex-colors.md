# Cores Hex personalizadas para grupos de sessão nomeados

## Problema

Grupos de sessão nomeados atualmente compartilham o enum de cores de seis valores
usado pelas tags de cor de sessão rápida. O daemon rejeita qualquer outro valor
com `invalid_group_color`, o SDK TypeScript expõe a mesma union fechada, e o
editor do WebShell oferece apenas um select predefinido. Os usuários não podem
alinhar grupos nomeados com a paleta de um projeto existente nem distinguir
visualmente um catálogo de grupos maior.

Rastreado em [#6744](https://github.com/QwenLM/qwen-code/issues/6744).

## Alterações propostas

| Camada         | Alteração                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core           | Separar as cores predefinidas de tag de sessão das cores de exibição de grupos nomeados. Grupos nomeados aceitam predefinições ou `#RRGGBB` de seis dígitos; tags rápidas continuam apenas com predefinições. Normalizar valores Hex válidos para minúsculas antes da persistência. |
| REST e ACP     | Manter a validação de tags rápidas apenas com predefinições e passar as cores de grupos nomeados para a validação do core.                                                                                     |
| TypeScript SDK | Exportar tipos de cor predefinidos e Hex. Entrada/saída de grupos usa a union deles; a organização de sessão continua usando cores predefinidas.                                                               |
| WebShell       | Manter as opções predefinidas e adicionar uma opção Custom com um seletor de cor nativo e um campo de texto Hex. Renderizar os pontos de grupos personalizados com uma cor de fundo inline.                     |

## Decisões

- Aceitar apenas `#RRGGBB` de seis dígitos. Formas de três, quatro e oito
  dígitos são rejeitadas para que todo valor persistido tenha um único formato
  previsível.
- Aparar espaços em branco ao redor e canonicalizar valores Hex para minúsculas
  no core. Os clientes podem normalizar antes para feedback imediato, mas o
  core permanece como autoridade.
- Não expandir as tags de cor de sessão rápida. Seu catálogo de seis valores
  permanece uma dimensão de ordenação/filtragem compacta e continua compatível
  com versões anteriores.
- Manter a versão do schema do sidecar em 1. O campo armazenado continua sendo
  uma string e valores predefinidos antigos permanecem válidos.
- Clientes existentes que não reconhecem uma classe Hex devem falhar com
  segurança. O WebShell renderiza pontos de grupos Hex por meio de um
  `background-color` inline.

## Arquivos

- `packages/core/src/services/session-organization-service.ts`
- `packages/core/src/services/session-organization-service.test.ts`
- `packages/cli/src/serve/routes/session.ts`
- `packages/cli/src/serve/acp-http/dispatch.ts`
- `packages/cli/src/serve/server/session-list.ts`
- `packages/acp-bridge/src/bridgeTypes.ts`
- `packages/sdk-typescript/src/daemon/types.ts`
- `packages/sdk-typescript/src/daemon/index.ts`
- `packages/sdk-typescript/src/index.ts`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`
- `packages/web-shell/client/components/SessionOverviewPanel.tsx`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.test.tsx`
- `packages/web-shell/client/i18n.tsx`

## Fora do escopo

- Cores personalizadas para tags de sessão rápida.
- Canais alfa, gradientes, cores CSS nomeadas ou formas Hex curtas.
- Alterar o formato do sidecar de grupos ou migrar valores existentes.

## Questões em aberto

Nenhuma. Os caminhos existentes de erro estruturado e persistência de grupos
podem ser estendidos sem um bump de versão do protocolo.
