# Leitura de Múltiplos Arquivos (`read_many_files`)

> [!note]
>
> `read_many_files` foi anteriormente exposto como uma ferramenta independente, mas foi refatorado para uma função utilitária interna. O modelo não o invoca mais diretamente — em vez disso, as ferramentas `read_file`, `glob` e `grep_search` cobrem a leitura de arquivos individuais e múltiplos. As informações abaixo são mantidas para referência.

## Descrição

`read_many_files` lê o conteúdo de vários arquivos especificados por caminhos ou padrões glob. O comportamento depende dos tipos de arquivo:

- Para arquivos de texto, esta ferramenta concatena seu conteúdo em uma única string.
- Para arquivos de imagem (por exemplo, PNG, JPEG), PDF, áudio (MP3, WAV) e vídeo (MP4, MOV), ele lê e retorna como dados codificados em base64, desde que sejam explicitamente solicitados por nome ou extensão.

`read_many_files` pode ser usado para realizar tarefas como obter uma visão geral de uma base de código, encontrar onde uma funcionalidade específica está implementada, revisar documentação ou reunir contexto de vários arquivos de configuração.

**Observação:** `read_many_files` procura arquivos seguindo os caminhos ou padrões glob fornecidos. Um caminho de diretório como `"/docs"` retornará um resultado vazio; a ferramenta requer um padrão como `"/docs/*"` ou `"/docs/*.md"` para identificar os arquivos relevantes.

### Argumentos

`read_many_files` aceita os seguintes argumentos:

- `paths` (list[string], obrigatório): Um array de padrões glob ou caminhos relativos ao diretório alvo da ferramenta (por exemplo, `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], opcional): Padrões glob para arquivos/diretórios a serem excluídos (por exemplo, `["**/*.log", "temp/"]`). Eles são adicionados às exclusões padrão se `useDefaultExcludes` for true.
- `include` (list[string], opcional): Padrões glob adicionais a serem incluídos. Eles são mesclados com `paths` (por exemplo, `["*.test.ts"]` para adicionar especificamente arquivos de teste se foram amplamente excluídos, ou `["images/*.jpg"]` para incluir tipos de imagem específicos).
- `recursive` (boolean, opcional): Se deve pesquisar recursivamente. Isso é controlado principalmente por `**` em padrões glob. O padrão é `true`.
- `useDefaultExcludes` (boolean, opcional): Se deve aplicar uma lista de padrões de exclusão padrão (por exemplo, `node_modules`, `.git`, arquivos binários que não sejam imagem/pdf). O padrão é `true`.
- `respect_git_ignore` (boolean, opcional): Se deve respeitar os padrões .gitignore ao encontrar arquivos. O padrão é true.

## Como usar `read_many_files` com Qwen Code

`read_many_files` procura por arquivos que correspondam aos padrões fornecidos em `paths` e `include`, respeitando os padrões de `exclude` e as exclusões padrão (se habilitado).

- Para arquivos de texto: lê o conteúdo de cada arquivo correspondente (tentando pular arquivos binários não solicitados explicitamente como imagem/PDF) e concatena em uma única string, com um separador `--- {filePath} ---` entre o conteúdo de cada arquivo. Usa codificação UTF-8 por padrão.
- A ferramenta insere um `--- End of content ---` após o último arquivo.
- Para arquivos de imagem e PDF: se solicitados explicitamente por nome ou extensão (por exemplo, `paths: ["logo.png"]` ou `include: ["*.pdf"]`), a ferramenta lê o arquivo e retorna seu conteúdo como uma string codificada em base64.
- A ferramenta tenta detectar e pular outros arquivos binários (aqueles que não correspondem a tipos comuns de imagem/PDF ou não são explicitamente solicitados) verificando a presença de bytes nulos em seu conteúdo inicial.

Uso:

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
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

Ler todos os arquivos JavaScript, mas incluir explicitamente arquivos de teste e todos os JPEGs em uma pasta `images`:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Notas importantes

- **Manipulação de arquivos binários:**
  - **Arquivos de Imagem/PDF/Áudio/Vídeo:** A ferramenta pode ler tipos comuns de imagem (PNG, JPEG, etc.), PDF, áudio (mp3, wav) e vídeo (mp4, mov), retornando-os como dados codificados em base64. Esses arquivos _devem_ ser explicitamente alvo dos padrões `paths` ou `include` (por exemplo, especificando o nome exato do arquivo como `video.mp4` ou um padrão como `*.mov`).
  - **Outros arquivos binários:** A ferramenta tenta detectar e pular outros tipos de arquivos binários examinando seu conteúdo inicial em busca de bytes nulos. A ferramenta exclui esses arquivos de sua saída.
- **Desempenho:** Ler um número muito grande de arquivos ou arquivos individuais muito grandes pode consumir muitos recursos.
- **Especificidade do caminho:** Certifique-se de que os caminhos e padrões glob estejam corretamente especificados em relação ao diretório alvo da ferramenta. Para arquivos de imagem/PDF, garanta que os padrões sejam específicos o suficiente para incluí-los.
- **Exclusões padrão:** Esteja ciente dos padrões de exclusão padrão (como `node_modules`, `.git`) e use `useDefaultExcludes=False` se precisar substituí-los, mas faça isso com cautela.