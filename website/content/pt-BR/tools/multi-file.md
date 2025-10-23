# Multi File Read Tool (`read_many_files`)

Este documento descreve a ferramenta `read_many_files` para o Qwen Code.

## Descrição

Use `read_many_files` para ler o conteúdo de vários arquivos especificados por caminhos ou padrões glob. O comportamento desta ferramenta depende dos arquivos fornecidos:

- Para arquivos de texto, esta ferramenta concatena seu conteúdo em uma única string.
- Para arquivos de imagem (por exemplo, PNG, JPEG), PDF, áudio (MP3, WAV) e vídeo (MP4, MOV), ela os lê e retorna como dados codificados em base64, desde que sejam explicitamente solicitados por nome ou extensão.

`read_many_files` pode ser usado para realizar tarefas como obter uma visão geral de uma base de código, encontrar onde uma funcionalidade específica está implementada, revisar documentação ou reunir contexto de vários arquivos de configuração.

**Nota:** `read_many_files` procura arquivos seguindo os caminhos ou padrões glob fornecidos. Um caminho de diretório como `"/docs"` retornará um resultado vazio; a ferramenta requer um padrão como `"/docs/*"` ou `"/docs/*.md"` para identificar os arquivos relevantes.

### Argumentos

`read_many_files` aceita os seguintes argumentos:

- `paths` (list[string], obrigatório): Um array de padrões glob ou caminhos relativos ao diretório alvo da ferramenta (ex.: `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], opcional): Padrões glob para arquivos/diretórios que devem ser excluídos (ex.: `["**/*.log", "temp/"]`). Esses padrões são adicionados às exclusões padrão se `useDefaultExcludes` for verdadeiro.
- `include` (list[string], opcional): Padrões glob adicionais para inclusão. Eles são mesclados com `paths` (ex.: `["*.test.ts"]` para incluir especificamente arquivos de teste que foram excluídos anteriormente, ou `["images/*.jpg"]` para incluir tipos específicos de imagem).
- `recursive` (boolean, opcional): Define se a busca deve ser recursiva. Esse comportamento é controlado principalmente pelo uso de `**` nos padrões glob. O valor padrão é `true`.
- `useDefaultExcludes` (boolean, opcional): Define se uma lista de padrões de exclusão padrão deve ser aplicada (ex.: `node_modules`, `.git`, arquivos binários que não sejam imagem/pdf). O valor padrão é `true`.
- `respect_git_ignore` (boolean, opcional): Define se os padrões do .gitignore devem ser respeitados ao localizar arquivos. O valor padrão é `true`.

## Como usar `read_many_files` com Qwen Code

`read_many_files` busca arquivos que correspondam aos padrões `paths` e `include` fornecidos, respeitando os padrões `exclude` e as exclusões padrão (se habilitadas).

- Para arquivos de texto: ele lê o conteúdo de cada arquivo correspondente (tentando pular arquivos binários que não foram explicitamente solicitados como imagem/PDF) e os concatena em uma única string, com um separador `--- {filePath} ---` entre o conteúdo de cada arquivo. Usa codificação UTF-8 por padrão.
- A ferramenta insere um `--- End of content ---` após o último arquivo.
- Para arquivos de imagem e PDF: se solicitados explicitamente por nome ou extensão (por exemplo, `paths: ["logo.png"]` ou `include: ["*.pdf"]`), a ferramenta lê o arquivo e retorna seu conteúdo como uma string codificada em base64.
- A ferramenta tenta detectar e pular outros arquivos binários (aqueles que não correspondem a tipos comuns de imagem/PDF ou que não foram explicitamente solicitados) verificando a presença de bytes nulos no início do conteúdo.

Uso:

```
read_many_files(paths=["Seus arquivos ou caminhos aqui."], include=["Arquivos adicionais para incluir."], exclude=["Arquivos para excluir."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## Exemplos de `read_many_files`

Ler todos os arquivos TypeScript no diretório `src`:

```
read_many_files(paths=["src/**/*.ts"])
```

Ler o README principal, todos os arquivos Markdown no diretório `docs`, e uma imagem específica de logo, excluindo um arquivo específico:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Ler todos os arquivos JavaScript mas incluir explicitamente os arquivos de teste e todas as imagens JPEG em uma pasta `images`:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Notas importantes

- **Manipulação de arquivos binários:**
  - **Arquivos de imagem/PDF/áudio/vídeo:** A ferramenta pode ler tipos comuns de imagens (PNG, JPEG, etc.), PDF, áudio (mp3, wav) e arquivos de vídeo (mp4, mov), retornando-os como dados codificados em base64. Esses arquivos _devem_ ser explicitamente direcionados pelos padrões `paths` ou `include` (por exemplo, especificando o nome exato do arquivo como `video.mp4` ou um padrão como `*.mov`).
  - **Outros arquivos binários:** A ferramenta tenta detectar e pular outros tipos de arquivos binários examinando seu conteúdo inicial em busca de bytes nulos. A ferramenta exclui esses arquivos de sua saída.
- **Performance:** Ler um número muito grande de arquivos ou arquivos individuais muito grandes pode ser intensivo em recursos.
- **Especificidade de caminhos:** Certifique-se de que os caminhos e padrões glob estão corretamente especificados em relação ao diretório de destino da ferramenta. Para arquivos de imagem/PDF, certifique-se de que os padrões sejam específicos o suficiente para incluí-los.
- **Exclusões padrão:** Esteja ciente dos padrões de exclusão padrão (como `node_modules`, `.git`) e use `useDefaultExcludes=False` se precisar substituí-los, mas faça isso com cautela.