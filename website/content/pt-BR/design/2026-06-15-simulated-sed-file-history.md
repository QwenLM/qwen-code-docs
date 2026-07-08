# Rastreamento de histórico de arquivos simulando `sed -i`

## Resumo

Suporte ao item B1 restante da issue #4204 tratando uma classe restrita de comandos shell `sed -i 's/pattern/replacement/flags' file` como edições de arquivo em vez de execuções de shell opacas.

O caminho simulado exibe uma prévia da alteração exata de texto na UI normal de confirmação de edição, registra o arquivo de destino com `FileHistoryService.trackEdit()`, grava através de `FileSystemService.writeTextFile()` e evita a criação de um shell. Isso permite que o `/rewind` capture edições in-place acionadas via shell, que são comuns em fluxos de trabalho de agentes.

## Escopo

Apenas substituições in-place simples são simuladas:

- `sed -i 's/foo/bar/' file`
- `sed -i '' -E 's/foo|bar/baz/g' file`
- `sed -i -e 's/foo/bar/' file`

Os comandos não são simulados quando incluem operadores de shell compostos, globs, múltiplos arquivos, substituições de comando, referências a variáveis de shell dentro da expressão sed, caminhos de arquivo expandidos por variáveis, sufixos de backup como `-i.bak`, flags sed não suportadas, expressões sed não suportadas ou execução em background. Nesses casos, o comportamento de execução de shell existente é mantido.

As flags de substituição suportadas são intencionalmente limitadas a `g` e ocorrências numéricas. Flags que podem afetar o stdout ou ter comportamento específico de sed da plataforma, como `p`, `I` e `M`, fazem fallback para o caminho do shell. Wrappers de shell com prefixo de ambiente também fazem fallback para que alterações de locale ou ambiente não possam ser ignoradas silenciosamente pelo simulador.

## Comportamento

A confirmação lê o arquivo de destino, aplica a substituição analisada em memória e retorna `ToolEditConfirmationDetails` com um diff de arquivo normal.

A execução relê o arquivo antes de gravar. Se o conteúdo do arquivo diferir do conteúdo usado para confirmação, a execução rejeita com `FILE_CHANGED_SINCE_READ` em vez de gravar uma alteração que o usuário não aprovou.

Se a prévia do arquivo falhar, o comando é confirmado e executado através do caminho de shell existente em vez de ser simulado.

A confirmação oculta as ações de modificação do editor externo porque o ShellTool não é uma ferramenta geral de edição de arquivos modificáveis. Se uma IDE ou host retornar um payload `newContent` inline ao aprovar o diff, o caminho simulado do sed grava esse conteúdo aprovado após a mesma proteção contra conteúdo desatualizado.

Antes de gravar, a execução chama `FileHistoryService.trackEdit(filePath)` para que o snapshot do histórico de arquivos da rodada atual capture um backup pré-edição. A chamada do histórico de arquivos é best-effort e nunca bloqueia a edição. A própria gravação usa `FileSystemService.writeTextFile()` com os metadados de leitura para que o comportamento de codificação, BOM e quebra de linha permaneça alinhado com as ferramentas Edit e WriteFile.

## Compatibilidade

Nenhuma alteração de esquema persistido é necessária. Esta é apenas mais uma fonte de edições de arquivos rastreadas dentro de um snapshot existente. Comandos de shell não suportados continuam através do caminho de shell existente, portanto, isso não altera a semântica genérica do shell.

## Fora do Escopo

O rastreamento genérico de mutação de shell continua adiado. Comandos como `perl -pi`, `python -c`, `awk`, `cat > file`, `mv`, scripts arbitrários e invocações `sed` de múltiplos arquivos não são simulados. Eles exigem uma análise mais ampla de efeitos de shell que o claude-code não suporta hoje e está fora do escopo do B1.