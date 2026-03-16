# Ferramenta de Leitura de Múltiplos Arquivos (`read_many_files`)

Este documento descreve a ferramenta `read_many_files` para o Qwen Code.

## Descrição

Use `read_many_files` para ler o conteúdo de vários arquivos especificados por caminhos ou padrões glob. O comportamento dessa ferramenta depende dos arquivos fornecidos:

- Para arquivos de texto, essa ferramenta concatena seu conteúdo em uma única string.
- Para arquivos de imagem (por exemplo, PNG, JPEG), PDF, áudio (MP3, WAV) e vídeo (MP4, MOV), ela os lê e os retorna como dados codificados em base64, desde que sejam explicitamente solicitados pelo nome ou pela extensão.

`read_many_files` pode ser usado para executar tarefas como obter uma visão geral de uma base de código, identificar onde determinada funcionalidade é implementada, revisar documentação ou reunir contexto de vários arquivos de configuração.

**Observação:** `read_many_files` procura arquivos seguindo os caminhos ou padrões glob fornecidos. Um caminho de diretório como `"/docs"` retornará um resultado vazio; a ferramenta exige um padrão como `"/docs/*"` ou `"/docs/*.md"` para identificar os arquivos relevantes.

### Argumentos

`read_many_files` aceita os seguintes argumentos:

- `paths` (lista[string], obrigatório): Um array de padrões glob ou caminhos relativos ao diretório-alvo da ferramenta (por exemplo, `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (lista[string], opcional): Padrões glob para arquivos/diretórios a serem excluídos (por exemplo, `["**/*.log", "temp/"]`). Esses padrões são adicionados às exclusões padrão se `useDefaultExcludes` for verdadeiro.
- `include` (lista[string], opcional): Padrões glob adicionais para inclusão. Esses padrões são mesclados com `paths` (por exemplo, `["*.test.ts"]` para adicionar especificamente arquivos de teste caso tenham sido amplamente excluídos, ou `["images/*.jpg"]` para incluir tipos específicos de imagens).
- `recursive` (booleano, opcional): Se deve pesquisar recursivamente. Isso é controlado principalmente pelo uso de `**` nos padrões glob. O valor padrão é `true`.
- `useDefaultExcludes` (booleano, opcional): Se deve aplicar uma lista de padrões de exclusão padrão (por exemplo, `node_modules`, `.git`, arquivos binários não relacionados a imagens/PDF). O valor padrão é `true`.
- `respect_git_ignore` (booleano, opcional): Se deve respeitar os padrões do arquivo `.gitignore` ao localizar arquivos. O valor padrão é `true`.

## Como usar `read_many_files` com o Qwen Code

O `read_many_files` pesquisa arquivos que correspondam aos padrões fornecidos em `paths` e `include`, respeitando ao mesmo tempo os padrões em `exclude` e as exclusões padrão (se ativadas).

- Para arquivos de texto: lê o conteúdo de cada arquivo correspondente (tentando ignorar arquivos binários não solicitados explicitamente como imagens/PDF) e concatena-o em uma única string, com um separador `--- {filePath} ---` entre o conteúdo de cada arquivo. Usa codificação UTF-8 por padrão.
- A ferramenta insere `--- Fim do conteúdo ---` após o último arquivo.
- Para arquivos de imagem e PDF: se solicitados explicitamente pelo nome ou extensão (por exemplo, `paths: ["logo.png"]` ou `include: ["*.pdf"]`), a ferramenta lê o arquivo e retorna seu conteúdo como uma string codificada em base64.
- A ferramenta tenta detectar e ignorar outros arquivos binários (aqueles que não correspondem aos tipos comuns de imagem/PDF ou não foram solicitados explicitamente) verificando a presença de bytes nulos no início de seu conteúdo.

Uso:

```
read_many_files(paths=["Seus arquivos ou caminhos aqui."], include=["Arquivos adicionais para incluir."], exclude=["Arquivos para excluir."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Exemplos de `read_many_files`

Ler todos os arquivos TypeScript no diretório `src`:

```
read_many_files(paths=["src/**/*.ts"])
```

Ler o README principal, todos os arquivos Markdown no diretório `docs` e uma imagem de logotipo específica, excluindo um arquivo específico:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Ler todos os arquivos JavaScript, mas incluir explicitamente os arquivos de teste e todas as imagens JPEG na pasta `images`:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Observações importantes

- **Manipulação de arquivos binários:**
  - **Arquivos de imagem/PDF/áudio/vídeo:** A ferramenta pode ler tipos comuns de imagens (PNG, JPEG etc.), PDF, áudio (mp3, wav) e vídeo (mp4, mov), retornando-os como dados codificados em base64. Esses arquivos _devem_ ser explicitamente direcionados pelos padrões `paths` ou `include` (por exemplo, especificando o nome exato do arquivo, como `video.mp4`, ou um padrão como `*.mov`).
  - **Outros arquivos binários:** A ferramenta tenta detectar e ignorar outros tipos de arquivos binários examinando seu conteúdo inicial em busca de bytes nulos. Esses arquivos são excluídos da saída da ferramenta.
- **Desempenho:** Ler um número muito grande de arquivos ou arquivos individuais muito grandes pode consumir muitos recursos.
- **Especificidade de caminhos:** Certifique-se de que os caminhos e padrões glob sejam especificados corretamente em relação ao diretório-alvo da ferramenta. Para arquivos de imagem/PDF, garanta que os padrões sejam específicos o suficiente para incluí-los.
- **Exclusões padrão:** Esteja ciente dos padrões de exclusão padrão (como `node_modules`, `.git`) e use `useDefaultExcludes=False` caso precise substituí-los, mas faça isso com cautela.