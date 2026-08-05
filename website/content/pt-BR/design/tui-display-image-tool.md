# Ferramenta de exibição de imagem da TUI

## Objetivo

Adicionar uma ferramenta `display_image` invocável pelo modelo que
pré-visualiza um PNG existente na UI interativa do terminal. A ferramenta é
somente de exibição: ela não fornece pixels da imagem ao modelo e não está
disponível nos registries headless, SDK, leitor de tela ou de subagente.

## Design

A ferramenta do core valida um caminho absoluto do workspace, o status de
arquivo regular, a assinatura PNG e um limite de tamanho de 8 MiB. Em caso
de sucesso, ela retorna um pequeno valor estruturado de exibição:

```ts
{
  type: 'terminal_image',
  filePath: '/absolute/workspace/path/image.png',
  mimeType: 'image/png',
}
```

Antes de retornar sucesso, a ferramenta pergunta a um provedor injetado pelo
CLI se o terminal atual tem um renderizador disponível. Protocolos nativos
passam imediatamente; o fallback verifica se `chafa` está disponível no
`PATH` sem renderizar o arquivo selecionado. Se nenhum renderizador estiver
disponível, a ferramenta retorna um erro de execução para que tanto a TUI
quanto o modelo saibam que a imagem não foi exibida. `llmContent` diz ao
modelo para usar `read_file` se precisar inspecionar a imagem. Bytes da
imagem e sequências de escape do terminal nunca entram no histórico do
modelo nem no valor de exibição persistido.

`ToolMessage` reconhece o valor estruturado e o delega a um componente da
TUI. O componente revalida o caminho contra o workspace atual antes de lê-lo.
A renderização é preparada durante o primeiro render do componente, porque
linhas de ferramenta concluídas entram imediatamente na região `Static`
somente de acréscimo do Ink; uma atualização assíncrona de estado seria
descartada ali. Terminais compatíveis com Kitty usam a abordagem existente
de imagem virtual e placeholder Unicode já usada para diagramas Mermaid.
Outros terminais tentam `chafa` com saída de símbolos. `chafa` recebe apenas
o mesmo ambiente com allowlist usado pelo renderizador Mermaid, então
credenciais de API não são encaminhadas. Se nenhum dos dois caminhos estiver
disponível, a TUI mostra um fallback de texto limitado nomeando a imagem.

As pré-visualizações têm teto de 72 colunas e 24 linhas, e depois são
reduzidas ainda mais para caber no espaço disponível do terminal. Uma
estimativa de célula de terminal de 8 por 16 pixels fornece um tamanho
natural conservador, de modo que imagens pequenas não sejam deliberadamente
ampliadas. Tanto a renderização nativa quanto a de `chafa` usam as mesmas
dimensões com proporção preservada.

A ferramenta é registrada apenas quando tudo isto for verdadeiro:

- a configuração principal é interativa;
- o modo SDK está desabilitado;
- o modo leitor de tela está desabilitado;
- o registry não está sendo criado para um subagente.

O modo bare mantém seu conjunto mínimo de ferramentas existente.

## Compatibilidade

A primeira versão suporta apenas PNG. Kitty e Ghostty usam posicionamento
nativo de imagem. Warp é intencionalmente excluído porque seu suporte a
Kitty não inclui a extensão de placeholder Unicode usada por este
renderizador, enquanto o posicionamento direto se desloca do conteúdo do
Ink durante o scrollback e o reflow do terminal. O posicionamento direto do
iTerm2 também é excluído porque seu protocolo de imagem inline é
posicionado por cursor e o caminho assíncrono existente do Ink já o trata
como inseguro. Warp, iTerm2, tmux, SSH e terminais sem caminho nativo ainda
podem renderizar por meio de `chafa` quando ele está instalado.

## Segurança e persistência

Tanto a ferramenta quanto o renderizador usam
`WorkspaceContext.isPathWithinWorkspace`, que resolve symlinks e impede
travessia para fora das raízes registradas do workspace. O renderizador
trata dados de `resultDisplay` restaurados como não confiáveis e repete essa
verificação. Sessões persistidas contêm apenas o caminho e o tipo MIME; se o
arquivo não existe mais, a restauração degrada para um aviso de texto.

A saída bruta do terminal é gerada apenas pelo renderizador confiável.
Strings controladas pelo modelo e conteúdos de arquivo nunca são escritos
diretamente no terminal.
