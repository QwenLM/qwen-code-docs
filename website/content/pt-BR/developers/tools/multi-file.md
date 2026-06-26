# Leitura de Múltiplos Arquivos (`read_many_files`)

> [!note]
>
> `read_many_files` foi anteriormente exposto como uma ferramenta independente, mas foi refatorado para uma função utilitária interna. O modelo não o invoca mais diretamente — em vez disso, as ferramentas `read_file`, `glob` e `grep_search` cobrem a leitura individual e de múltiplos arquivos. As informações abaixo são mantidas para referência.

## Descrição

`read_many_files` lê o conteúdo de múltiplos arquivos especificados por caminhos ou padrões glob. O comportamento depende dos tipos de arquivo:

- Para arquivos de texto, esta ferramenta concatena seu conteúdo em uma única string.
- Para arquivos de imagem (ex.: PNG, JPEG), PDF, áudio (MP3, WAV) e vídeo (MP4, MOV), ela os lê e retorna como dados codificados em base64, desde que sejam explicitamente solicitados por nome ou extensão.

`read_many_files` pode ser usado para realizar tarefas como obter uma visão geral de um codebase, encontrar onde uma funcionalidade específica é implementada, revisar documentação ou reunir contexto a partir de múltiplos arquivos de configuração.

**Nota:** `read_many_files` procura por arquivos seguindo os caminhos ou padrões glob fornecidos. Um caminho de diretório como `"/docs"` retornará um resultado vazio; a ferramenta requer um padrão como `"/docs/*"` ou `"/docs/*.md"` para identificar os arquivos relevantes.

### Argumentos

`read_many_files` aceita os seguintes argumentos:

- `paths` (list[string], obrigatório): Um array de padrões glob ou caminhos relativos ao diretório alvo da ferramenta (ex.: `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], opcional): Padrões glob para arquivos/diretórios a serem excluídos (ex.: `["**/*.log", "temp/"]`). Eles são adicionados às exclusões padrão se `useDefaultExcludes` for verdadeiro.
- `include` (list[string], opcional): Padrões glob adicionais para incluir. Eles são mesclados com `paths` (ex.: `["*.test.ts"]` para adicionar especificamente arquivos de teste se eles foram amplamente excluídos, ou `["images/*.jpg"]` para incluir tipos específicos de imagem).
- `recursive` (boolean, opcional): Se a pesquisa deve ser recursiva. Isso é controlado principalmente por `**` nos padrões glob. Padrão: `true`.
- `useDefaultExcludes` (boolean, opcional): Se deve aplicar uma lista de padrões de exclusão padrão (ex.: `node_modules`, `.git`, arquivos binários que não sejam imagem/PDF). Padrão: `true`.
- `respect_git_ignore` (boolean, opcional): Se deve respeitar os padrões do .gitignore ao encontrar arquivos. Padrão: true.

## Como usar `read_many_files` com Qwen Code

`read_many_files` busca arquivos que correspondam aos padrões fornecidos em `paths` e `include`, respeitando os padrões de `exclude` e as exclusões padrão (se ativadas).

- Para arquivos de texto: lê o conteúdo de cada arquivo encontrado (tentando ignorar arquivos binários que não sejam explicitamente solicitados como imagem/PDF) e concatena em uma única string, com um separador `--- {filePath} ---` entre o conteúdo de cada arquivo. Usa codificação UTF-8 por padrão.
- A ferramenta insere um `--- End of content ---` após o último arquivo.
- Para arquivos de imagem e PDF: se solicitados explicitamente por nome ou extensão (ex.: `paths: ["logo.png"]` ou `include: ["*.pdf"]`), a ferramenta lê o arquivo e retorna seu conteúdo como uma string codificada em base64.
- A ferramenta tenta detectar e ignorar outros arquivos binários (aqueles que não correspondem a tipos comuns de imagem/PDF ou não foram solicitados explicitamente) verificando a presença de bytes nulos em seu conteúdo inicial.

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
  - **Arquivos de imagem/PDF/Áudio/Vídeo:** A ferramenta pode ler tipos comuns de imagem (PNG, JPEG, etc.), PDF, áudio (mp3, wav) e vídeo (mp4, mov), retornando-os como dados codificados em base64. Esses arquivos _devem_ ser explicitamente alvo dos padrões `paths` ou `include` (ex.: especificando o nome exato do arquivo como `video.mp4` ou um padrão como `*.mov`).
  - **Outros arquivos binários:** A ferramenta tenta detectar e ignorar outros tipos de arquivos binários examinando seu conteúdo inicial em busca de bytes nulos. A ferramenta exclui esses arquivos de sua saída.
- **Desempenho:** Ler um número muito grande de arquivos ou arquivos individuais muito grandes pode consumir muitos recursos.
- **Especificidade do caminho:** Certifique-se de que os caminhos e padrões glob estejam corretamente especificados em relação ao diretório alvo da ferramenta. Para arquivos de imagem/PDF, garanta que os padrões sejam específicos o suficiente para incluí-los.
- **Exclusões padrão:** Esteja ciente dos padrões de exclusão padrão (como `node_modules`, `.git`) e use `useDefaultExcludes=False` se precisar sobrescrevê-los, mas faça isso com cautela.
