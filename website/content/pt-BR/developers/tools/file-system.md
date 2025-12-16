# Ferramentas do sistema de arquivos do Qwen Code

O Qwen Code oferece um conjunto abrangente de ferramentas para interagir com o sistema de arquivos local. Essas ferramentas permitem que o modelo leia, escreva, liste, pesquise e modifique arquivos e diretórios, tudo sob seu controle e geralmente com confirmação para operações sensíveis.

**Nota:** Todas as ferramentas do sistema de arquivos operam dentro de um `rootDirectory` (geralmente o diretório de trabalho atual onde você iniciou a CLI) por motivos de segurança. Os caminhos fornecidos a essas ferramentas são geralmente esperados como absolutos ou são resolvidos em relação a este diretório raiz.

## 1. `list_directory` (ListFiles)

`list_directory` lista os nomes dos arquivos e subdiretórios diretamente dentro de um caminho de diretório especificado. Opcionalmente, pode ignorar entradas que correspondam a padrões glob fornecidos.

- **Nome da ferramenta:** `list_directory`
- **Nome de exibição:** ListFiles
- **Arquivo:** `ls.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o diretório a ser listado.
  - `ignore` (array de strings, opcional): Uma lista de padrões glob para excluir da listagem (ex.: `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, opcional): Se deve respeitar os padrões do `.gitignore` ao listar os arquivos. O valor padrão é `true`.
- **Comportamento:**
  - Retorna uma lista com os nomes dos arquivos e diretórios.
  - Indica se cada entrada é um diretório.
  - Ordena as entradas colocando primeiro os diretórios e depois em ordem alfabética.
- **Saída (`llmContent`):** Uma string como: `Directory listing for /caminho/para/sua/pasta:\n[DIR] subpasta1\narquivo1.txt\narquivo2.png`
- **Confirmação:** Não.

## 2. `read_file` (ReadFile)

`read_file` lê e retorna o conteúdo de um arquivo especificado. Esta ferramenta manipula arquivos de texto, imagens (PNG, JPG, GIF, WEBP, SVG, BMP) e PDF. Para arquivos de texto, ela pode ler intervalos específicos de linhas. Outros tipos de arquivos binários geralmente são ignorados.

- **Nome da ferramenta:** `read_file`
- **Nome de exibição:** ReadFile
- **Arquivo:** `read-file.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o arquivo a ser lido.
  - `offset` (número, opcional): Para arquivos de texto, o número da linha baseado em 0 a partir do qual começar a leitura. Requer que `limit` seja definido.
  - `limit` (número, opcional): Para arquivos de texto, o número máximo de linhas a serem lidas. Se omitido, lê um máximo padrão (por exemplo, 2000 linhas) ou o arquivo inteiro, se viável.
- **Comportamento:**
  - Para arquivos de texto: Retorna o conteúdo. Se `offset` e `limit` forem usados, retorna apenas esse trecho das linhas. Indica se o conteúdo foi truncado devido a limites de linhas ou limite de comprimento de linha.
  - Para arquivos de imagem e PDF: Retorna o conteúdo do arquivo como uma estrutura de dados codificada em base64 adequada para consumo pelo modelo.
  - Para outros arquivos binários: Tenta identificá-los e ignorá-los, retornando uma mensagem indicando que é um arquivo binário genérico.
- **Saída:** (`llmContent`):
  - Para arquivos de texto: O conteúdo do arquivo, potencialmente prefixado com uma mensagem de truncamento (por exemplo, `[Conteúdo do arquivo truncado: mostrando linhas 1-100 de 500 linhas totais...]\nConteúdo real do arquivo...`).
  - Para arquivos de imagem/PDF: Um objeto contendo `inlineData` com `mimeType` e `data` em base64 (por exemplo, `{ inlineData: { mimeType: 'image/png', data: 'stringcodificadabase64' } }`).
  - Para outros arquivos binários: Uma mensagem como `Não é possível exibir o conteúdo do arquivo binário: /caminho/para/dados.bin`.
- **Confirmação:** Não.

## 3. `write_file` (WriteFile)

`write_file` escreve conteúdo em um arquivo especificado. Se o arquivo existir, ele será sobrescrito. Se o arquivo não existir, ele (e quaisquer diretórios pais necessários) será criado.

- **Nome da ferramenta:** `write_file`
- **Nome de exibição:** WriteFile
- **Arquivo:** `write-file.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto para o arquivo a ser escrito.
  - `content` (string, obrigatório): O conteúdo a ser escrito no arquivo.
- **Comportamento:**
  - Escreve o `content` fornecido no `file_path`.
  - Cria diretórios pais se eles não existirem.
- **Saída (`llmContent`):** Uma mensagem de sucesso, por exemplo, `Successfully overwrote file: /path/to/your/file.txt` ou `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmação:** Sim. Mostra um diff das alterações e solicita aprovação do usuário antes de escrever.

## 4. `glob` (Glob)

`glob` encontra arquivos que correspondem a padrões específicos de glob (por exemplo, `src/**/*.ts`, `*.md`), retornando caminhos absolutos ordenados por data de modificação (mais recentes primeiro).

- **Nome da ferramenta:** `glob`
- **Nome de exibição:** Glob
- **Arquivo:** `glob.ts`
- **Parâmetros:**
  - `pattern` (string, obrigatório): O padrão de glob a ser correspondido (por exemplo, `"*.py"`, `"src/**/*.js"`).
  - `path` (string, opcional): O diretório onde pesquisar. Se não especificado, o diretório de trabalho atual será usado.
- **Comportamento:**
  - Pesquisa arquivos que correspondem ao padrão de glob dentro do diretório especificado.
  - Retorna uma lista de caminhos absolutos, ordenados com os arquivos modificados mais recentemente primeiro.
  - Respeita os padrões de .gitignore e .qwenignore por padrão.
  - Limita os resultados a 100 arquivos para evitar estouro de contexto.
- **Saída (`llmContent`):** Uma mensagem como: `Encontrado(s) 5 arquivo(s) correspondendo a "*.ts" em /caminho/para/diretorio/de/busca, ordenado(s) por data de modificação (mais recentes primeiro):\n---\n/caminho/para/arquivo1.ts\n/caminho/para/subdiretorio/arquivo2.ts\n---\n[95 arquivos truncados] ...`
- **Confirmação:** Não.

## 5. `grep_search` (Grep)

`grep_search` busca por um padrão de expressão regular dentro do conteúdo dos arquivos em um diretório especificado. Pode filtrar arquivos por um padrão glob. Retorna as linhas que contêm correspondências, juntamente com seus caminhos de arquivo e números de linha.

- **Nome da ferramenta:** `grep_search`
- **Nome de exibição:** Grep
- **Arquivo:** `grep.ts` (com `ripGrep.ts` como alternativa)
- **Parâmetros:**
  - `pattern` (string, obrigatório): O padrão de expressão regular a ser pesquisado no conteúdo dos arquivos (por exemplo, `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, opcional): Arquivo ou diretório onde pesquisar. O padrão é o diretório de trabalho atual.
  - `glob` (string, opcional): Padrão glob para filtrar arquivos (por exemplo, `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (número, opcional): Limita a saída às primeiras N linhas correspondentes. Opcional - mostra todas as correspondências se não for especificado.
- **Comportamento:**
  - Usa ripgrep para pesquisa rápida quando disponível; caso contrário, usa uma implementação de pesquisa baseada em JavaScript.
  - Retorna linhas correspondentes com caminhos de arquivo e números de linha.
  - Não diferencia maiúsculas de minúsculas por padrão.
  - Respeita os padrões .gitignore e .qwenignore.
  - Limita a saída para evitar estouro de contexto.
- **Saída (`llmContent`):** Uma string formatada das correspondências, por exemplo:

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **Confirmação:** Não.

### Exemplos de `grep_search`

Buscar um padrão com limite de resultados padrão:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Buscar um padrão com limite de resultados personalizado:

```
grep_search(pattern="function", path="src", limit=50)
```

Buscar um padrão com filtro de arquivos e limite de resultados personalizado:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Editar)

`edit` substitui texto dentro de um arquivo. Por padrão, requer que `old_string` corresponda a uma única localização exclusiva; defina `replace_all` como `true` quando desejar intencionalmente alterar todas as ocorrências. Esta ferramenta foi projetada para mudanças precisas e direcionadas, exigindo contexto significativo ao redor do `old_string` para garantir que modifique a localização correta.

- **Nome da ferramenta:** `edit`
- **Nome de exibição:** Editar
- **Arquivo:** `edit.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto para o arquivo a ser modificado.
  - `old_string` (string, obrigatório): O texto literal exato a ser substituído.

    **CRÍTICO:** Esta string deve identificar exclusivamente a instância a ser alterada. Deve incluir contexto suficiente ao redor do texto alvo, correspondendo exatamente a espaços em branco e indentação. Se `old_string` estiver vazia, a ferramenta tentará criar um novo arquivo em `file_path` com `new_string` como conteúdo.

  - `new_string` (string, obrigatório): O texto literal exato que substituirá `old_string`.
  - `replace_all` (boolean, opcional): Substituir todas as ocorrências de `old_string`. O padrão é `false`.

- **Comportamento:**
  - Se `old_string` estiver vazio e `file_path` não existir, cria um novo arquivo com `new_string` como conteúdo.
  - Se `old_string` for fornecido, lê o `file_path` e tenta encontrar exatamente uma ocorrência, a menos que `replace_all` seja verdadeiro.
  - Se a correspondência for única (ou `replace_all` for verdadeiro), substitui o texto por `new_string`.
  - **Confiabilidade Aprimorada (Correção de Edição em Várias Etapas):** Para melhorar significativamente a taxa de sucesso das edições, especialmente quando o `old_string` fornecido pelo modelo pode não ser perfeitamente preciso, a ferramenta incorpora um mecanismo de correção de edição em várias etapas.
    - Se o `old_string` inicial não for encontrado ou corresponder a vários locais, a ferramenta pode utilizar o modelo Qwen para refinar iterativamente `old_string` (e potencialmente `new_string`).
    - Este processo de auto-correção tenta identificar o segmento único que o modelo pretendia modificar, tornando a operação `edit` mais robusta mesmo com contexto inicial ligeiramente imperfeito.
- **Condições de falha:** Apesar do mecanismo de correção, a ferramenta falhará se:
  - `file_path` não for absoluto ou estiver fora do diretório raiz.
  - `old_string` não estiver vazio, mas `file_path` não existir.
  - `old_string` estiver vazio, mas `file_path` já existir.
  - `old_string` não for encontrado no arquivo após tentativas de corrigi-lo.
  - `old_string` for encontrado várias vezes, `replace_all` for falso e o mecanismo de auto-correção não conseguir resolvê-lo para uma única correspondência inequívoca.
- **Saída (`llmContent`):**
  - Em caso de sucesso: `Successfully modified file: /caminho/para/arquivo.txt (1 substituição).` ou `Created new file: /caminho/para/novo_arquivo.txt com o conteúdo fornecido.`
  - Em caso de falha: Uma mensagem de erro explicando o motivo (por exemplo, `Falha ao editar, 0 ocorrências encontradas...`, `Falha ao editar porque o texto corresponde a vários locais...`).
- **Confirmação:** Sim. Mostra um diff das alterações propostas e solicita aprovação do usuário antes de gravar no arquivo.

Essas ferramentas do sistema de arquivos fornecem uma base para que o Qwen Code compreenda e interaja com o contexto do seu projeto local.