# Ferramentas do sistema de arquivos do Qwen Code

O Qwen Code oferece um conjunto abrangente de ferramentas para interagir com o sistema de arquivos local. Essas ferramentas permitem que o modelo leia, escreva, liste, pesquise e modifique arquivos e diretórios, tudo sob seu controle e normalmente com confirmação para operações sensíveis.

**Nota:** Todas as ferramentas do sistema de arquivos operam dentro de um `rootDirectory` (geralmente o diretório de trabalho atual onde você iniciou o CLI) por motivos de segurança. Os caminhos que você fornece para essas ferramentas geralmente são esperados como absolutos ou são resolvidos relativamente a este diretório raiz.

## 1. `list_directory` (ReadFolder)

`list_directory` lista os nomes dos arquivos e subdiretórios diretamente dentro de um caminho de diretório especificado. Opcionalmente, pode ignorar entradas que correspondam a padrões glob fornecidos.

- **Nome da tool:** `list_directory`
- **Nome de exibição:** ReadFolder
- **Arquivo:** `ls.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o diretório a ser listado.
  - `ignore` (array de strings, opcional): Uma lista de padrões glob para excluir da listagem (ex.: `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, opcional): Se deve respeitar os padrões do `.gitignore` ao listar os arquivos. Padrão é `true`.
- **Comportamento:**
  - Retorna uma lista com os nomes dos arquivos e diretórios.
  - Indica se cada entrada é um diretório.
  - Ordena as entradas colocando os diretórios primeiro, seguidos por ordem alfabética.
- **Saída (`llmContent`):** Uma string como: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmação:** Não.

## 2. `read_file` (ReadFile)

`read_file` lê e retorna o conteúdo de um arquivo especificado. Esta tool lida com arquivos de texto, imagens (PNG, JPG, GIF, WEBP, SVG, BMP) e PDFs. Para arquivos de texto, ela pode ler intervalos específicos de linhas. Outros tipos de arquivos binários geralmente são ignorados.

- **Nome da tool:** `read_file`
- **Nome de exibição:** ReadFile
- **Arquivo:** `read-file.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o arquivo a ser lido.
  - `offset` (number, opcional): Para arquivos de texto, o número da linha (base 0) a partir da qual começar a leitura. Requer que `limit` esteja definido.
  - `limit` (number, opcional): Para arquivos de texto, o número máximo de linhas a serem lidas. Se omitido, lê um máximo padrão (ex: 2000 linhas) ou o arquivo inteiro, se possível.
- **Comportamento:**
  - Para arquivos de texto: Retorna o conteúdo. Se `offset` e `limit` forem usados, retorna apenas aquele trecho de linhas. Indica se o conteúdo foi truncado devido a limites de linhas ou tamanho de linha.
  - Para arquivos de imagem e PDF: Retorna o conteúdo do arquivo como uma estrutura de dados codificada em base64, adequada para consumo pelo modelo.
  - Para outros arquivos binários: Tenta identificá-los e ignorá-los, retornando uma mensagem indicando que é um arquivo binário genérico.
- **Saída:** (`llmContent`):
  - Para arquivos de texto: O conteúdo do arquivo, possivelmente prefixado com uma mensagem de truncamento (ex: `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Para arquivos de imagem/PDF: Um objeto contendo `inlineData` com `mimeType` e `data` em base64 (ex: `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Para outros arquivos binários: Uma mensagem como `Cannot display content of binary file: /path/to/data.bin`.
- **Confirmação:** Não.

## 3. `write_file` (WriteFile)

`write_file` escreve conteúdo em um arquivo especificado. Se o arquivo já existir, ele será sobrescrito. Caso não exista, o arquivo (e quaisquer diretórios pais necessários) será criado.

- **Nome da tool:** `write_file`
- **Nome de exibição:** WriteFile
- **Arquivo:** `write-file.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto do arquivo onde o conteúdo será escrito.
  - `content` (string, obrigatório): O conteúdo a ser escrito no arquivo.
- **Comportamento:**
  - Escreve o `content` fornecido no `file_path`.
  - Cria os diretórios pais, caso eles não existam.
- **Saída (`llmContent`):** Uma mensagem de sucesso, por exemplo: `Successfully overwrote file: /path/to/your/file.txt` ou `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmação:** Sim. Mostra um diff das mudanças e solicita aprovação do usuário antes de escrever.

## 4. `glob` (FindFiles)

O `glob` encontra arquivos que correspondem a padrões específicos de glob (por exemplo, `src/**/*.ts`, `*.md`), retornando caminhos absolutos ordenados por data de modificação (do mais recente para o mais antigo).

- **Nome da ferramenta:** `glob`
- **Nome de exibição:** FindFiles
- **Arquivo:** `glob.ts`
- **Parâmetros:**
  - `pattern` (string, obrigatório): O padrão de glob a ser usado na busca (ex.: `"*.py"`, `"src/**/*.js"`).
  - `path` (string, opcional): O caminho absoluto do diretório onde a busca será feita. Se omitido, faz a busca no diretório raiz da ferramenta.
  - `case_sensitive` (boolean, opcional): Define se a busca deve diferenciar maiúsculas e minúsculas. O padrão é `false`.
  - `respect_git_ignore` (boolean, opcional): Define se os padrões do .gitignore devem ser respeitados ao buscar arquivos. O padrão é `true`.
- **Comportamento:**
  - Busca arquivos que correspondem ao padrão de glob dentro do diretório especificado.
  - Retorna uma lista de caminhos absolutos, ordenada com os arquivos modificados mais recentemente primeiro.
  - Ignora diretórios comuns como `node_modules` e `.git` por padrão.
- **Saída (`llmContent`):** Uma mensagem como: `Encontrado(s) 5 arquivo(s) correspondente(s) a "*.ts" em src, ordenado(s) por data de modificação (mais recentes primeiro):\nsrc/arquivo1.ts\nsrc/subpasta/arquivo2.ts...`
- **Confirmação:** Não.

## 5. `search_file_content` (SearchText)

`search_file_content` busca por um padrão de expressão regular (regex) dentro do conteúdo dos arquivos em um diretório especificado. Pode filtrar os arquivos usando um padrão glob. Retorna as linhas que contêm correspondências, juntamente com seus caminhos de arquivo e números de linha.

- **Nome da tool:** `search_file_content`
- **Nome de exibição:** SearchText
- **Arquivo:** `grep.ts`
- **Parâmetros:**
  - `pattern` (string, obrigatório): A expressão regular (regex) a ser buscada (ex.: `"function\s+myFunction"`).
  - `path` (string, opcional): O caminho absoluto para o diretório onde a busca será feita. Por padrão, usa o diretório atual.
  - `include` (string, opcional): Um padrão glob para filtrar quais arquivos serão pesquisados (ex.: `"*.js"`, `"src/**/*.{ts,tsx}"`). Se omitido, pesquisa a maioria dos arquivos (respeitando os ignores comuns).
  - `maxResults` (number, opcional): Número máximo de resultados retornados para evitar estouro de contexto (padrão: 20, máximo: 100). Use valores menores para buscas amplas e maiores para buscas específicas.
- **Comportamento:**
  - Usa `git grep` se disponível em um repositório Git para melhor performance; caso contrário, utiliza o `grep` do sistema ou uma implementação em JavaScript.
  - Retorna uma lista das linhas que possuem correspondência, cada uma prefixada com seu caminho relativo ao diretório de busca e número da linha.
  - Limita os resultados a no máximo 20 correspondências por padrão, para evitar sobrecarga de contexto. Quando os resultados são truncados, mostra um aviso claro com orientações sobre como refinar a busca.
- **Saída (`llmContent`):** Uma string formatada com as correspondências, por exemplo:

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  File: src/utils.ts
  L15: export function myFunction() {
  L22:   myFunction.call();
  ---
  File: src/index.ts
  L5: import { myFunction } from './utils';
  ---

  WARNING: Results truncated to prevent context overflow. To see more results:
  - Use a more specific pattern to reduce matches
  - Add file filters with the 'include' parameter (e.g., "*.js", "src/**")
  - Specify a narrower 'path' to search in a subdirectory
  - Increase 'maxResults' parameter if you need more matches (current: 20)
  ```

- **Confirmação:** Não.

### Exemplos de `search_file_content`

Buscar um padrão com limite padrão de resultados:

```
search_file_content(pattern="function\s+myFunction", path="src")
```

Buscar um padrão com limite personalizado de resultados:

```
search_file_content(pattern="function", path="src", maxResults=50)
```

Buscar um padrão com filtro de arquivos e limite personalizado de resultados:

```
search_file_content(pattern="function", include="*.js", maxResults=10)
```

## 6. `edit` (Editar)

`edit` substitui texto dentro de um arquivo. Por padrão, substitui uma única ocorrência, mas pode substituir múltiplas ocorrências quando `expected_replacements` é especificado. Esta ferramenta foi projetada para fazer alterações precisas e direcionadas, e requer contexto significativo em torno do `old_string` para garantir que modifique a localização correta.

- **Nome da ferramenta:** `edit`
- **Nome de exibição:** Editar
- **Arquivo:** `edit.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto para o arquivo a ser modificado.
  - `old_string` (string, obrigatório): O texto literal exato a ser substituído.

    **CRÍTICO:** Esta string deve identificar unicamente a instância a ser alterada. Deve incluir pelo menos 3 linhas de contexto _antes_ e _depois_ do texto alvo, combinando espaços em branco e indentação com precisão. Se `old_string` for vazia, a ferramenta tenta criar um novo arquivo em `file_path` com `new_string` como conteúdo.

  - `new_string` (string, obrigatório): O texto literal exato que substituirá `old_string`.
  - `expected_replacements` (número, opcional): O número de ocorrências a serem substituídas. O padrão é `1`.

- **Comportamento:**
  - Se `old_string` for vazia e `file_path` não existir, cria um novo arquivo com `new_string` como conteúdo.
  - Se `old_string` for fornecida, lê o `file_path` e tenta encontrar exatamente uma ocorrência de `old_string`.
  - Se uma ocorrência for encontrada, substitui-a por `new_string`.
  - **Confiabilidade Aprimorada (Correção de Edição em Várias Etapas):** Para melhorar significativamente a taxa de sucesso das edições, especialmente quando o `old_string` fornecido pelo modelo pode não ser perfeitamente preciso, a ferramenta incorpora um mecanismo de correção de edição em várias etapas.
    - Se o `old_string` inicial não for encontrado ou corresponder a múltiplas localizações, a ferramenta pode usar o modelo Qwen para refinar iterativamente o `old_string` (e potencialmente o `new_string`).
    - Este processo de auto-correção tenta identificar o segmento único que o modelo pretendia modificar, tornando a operação `edit` mais robusta mesmo com contexto inicial ligeiramente imperfeito.
- **Condições de falha:** Apesar do mecanismo de correção, a ferramenta falhará se:
  - `file_path` não for absoluto ou estiver fora do diretório raiz.
  - `old_string` não for vazia, mas `file_path` não existir.
  - `old_string` for vazia, mas `file_path` já existir.
  - `old_string` não for encontrado no arquivo após tentativas de corrigi-lo.
  - `old_string` for encontrado múltiplas vezes, e o mecanismo de auto-correção não conseguir resolvê-lo para uma única correspondência inequívoca.
- **Saída (`llmContent`):**
  - Em caso de sucesso: `Successfully modified file: /path/to/file.txt (1 replacements).` ou `Created new file: /path/to/new_file.txt with provided content.`
  - Em caso de falha: Uma mensagem de erro explicando o motivo (ex: `Failed to edit, 0 occurrences found...`, `Failed to edit, expected 1 occurrences but found 2...`).
- **Confirmação:** Sim. Mostra um diff das alterações propostas e pede aprovação do usuário antes de escrever no arquivo.

Essas ferramentas do sistema de arquivos fornecem uma base para que o Qwen Code entenda e interaja com o contexto do seu projeto local.