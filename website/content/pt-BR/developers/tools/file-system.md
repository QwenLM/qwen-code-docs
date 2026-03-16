# Ferramentas do sistema de arquivos do Qwen Code

O Qwen Code fornece um conjunto abrangente de ferramentas para interagir com o sistema de arquivos local. Essas ferramentas permitem que o modelo leia, grave, liste, pesquise e modifique arquivos e diretórios — tudo sob seu controle e, normalmente, com confirmação para operações sensíveis.

> [!note]  
> Todas as ferramentas do sistema de arquivos operam dentro de um `rootDirectory` (geralmente o diretório de trabalho atual onde você iniciou a CLI) por motivos de segurança. Os caminhos que você fornece a essas ferramentas geralmente devem ser absolutos ou são resolvidos em relação a esse diretório raiz.

## 1. `list_directory` (ListarArquivos)

O `list_directory` lista os nomes de arquivos e subdiretórios diretamente dentro de um caminho de diretório especificado. Opcionalmente, pode ignorar entradas que correspondam aos padrões glob fornecidos.

- **Nome da ferramenta:** `list_directory`
- **Nome exibido:** ListarArquivos
- **Arquivo:** `ls.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o diretório a ser listado.
  - `ignore` (matriz de strings, opcional): Uma lista de padrões glob a serem excluídos da listagem (por exemplo, `["*.log", ".git"]`).
  - `respect_git_ignore` (booleano, opcional): Indica se os padrões do `.gitignore` devem ser respeitados ao listar os arquivos. O valor padrão é `true`.
- **Comportamento:**
  - Retorna uma lista com os nomes dos arquivos e diretórios.
  - Indica se cada entrada é um diretório.
  - Ordena as entradas com os diretórios primeiro, seguidos pela ordem alfabética.
- **Saída (`llmContent`):** Uma string como: `Listagem de diretório para /caminho/para/seu/pasta:\n[DIR] subpasta1\narquivo1.txt\narquivo2.png`
- **Confirmação:** Não.

## 2. `read_file` (ReadFile)

O `read_file` lê e retorna o conteúdo de um arquivo especificado. Esta ferramenta lida com arquivos de texto e arquivos multimídia (imagens, PDFs, áudio, vídeo) cuja modalidade é suportada pelo modelo atual. Para arquivos de texto, é possível ler intervalos específicos de linhas. Arquivos multimídia cuja modalidade não é suportada pelo modelo atual são rejeitados com uma mensagem de erro útil. Outros tipos de arquivos binários são, em geral, ignorados.

- **Nome da ferramenta:** `read_file`
- **Nome exibido:** ReadFile
- **Arquivo:** `read-file.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o arquivo a ser lido.
  - `offset` (número, opcional): Para arquivos de texto, o número da linha de início (baseado em zero). Exige que `limit` também seja definido.
  - `limit` (número, opcional): Para arquivos de texto, o número máximo de linhas a serem lidas. Se omitido, lê um valor máximo padrão (por exemplo, 2000 linhas) ou todo o arquivo, se viável.
- **Comportamento:**
  - Para arquivos de texto: Retorna o conteúdo. Se `offset` e `limit` forem usados, retorna apenas esse trecho específico de linhas. Indica se o conteúdo foi truncado devido a limites de número de linhas ou de comprimento de linha.
  - Para arquivos multimídia (imagens, PDFs, áudio, vídeo): Se o modelo atual suportar a modalidade do arquivo, retorna o conteúdo como um objeto `inlineData` codificado em base64. Caso contrário, retorna uma mensagem de erro com orientações (por exemplo, sugerindo *skills* ou ferramentas externas).
  - Para outros arquivos binários: Tenta identificá-los e ignorá-los, retornando uma mensagem indicando que se trata de um arquivo binário genérico.
- **Saída:** (`llmContent`):
  - Para arquivos de texto: O conteúdo do arquivo, possivelmente precedido por uma mensagem de truncamento (por exemplo, `[Conteúdo do arquivo truncado: mostrando linhas 1–100 de 500 linhas totais...]\nConteúdo real do arquivo...`).
  - Para arquivos multimídia suportados: Um objeto contendo `inlineData`, com `mimeType` e `data` em base64 (por exemplo, `{ inlineData: { mimeType: 'image/png', data: 'stringcodificadaembase64' } }`).
  - Para arquivos multimídia não suportados: Uma string de mensagem de erro explicando que o modelo atual não suporta essa modalidade, com sugestões de alternativas.
  - Para outros arquivos binários: Uma mensagem como `Não é possível exibir o conteúdo do arquivo binário: /caminho/para/arquivo.bin`.
- **Confirmação:** Não.

## 3. `write_file` (WriteFile)

O `write_file` grava conteúdo em um arquivo especificado. Se o arquivo já existir, ele será sobrescrito. Se não existir, ele (e quaisquer diretórios pai necessários) será criado.

- **Nome da ferramenta:** `write_file`
- **Nome exibido:** WriteFile
- **Arquivo:** `write-file.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto para o arquivo no qual gravar.
  - `content` (string, obrigatório): O conteúdo a ser gravado no arquivo.
- **Comportamento:**
  - Grava o `content` fornecido no `file_path`.
  - Cria diretórios pai caso eles não existam.
- **Saída (`llmContent`):** Uma mensagem de sucesso, por exemplo: `Sobrescrita bem-sucedida do arquivo: /caminho/para/seu/arquivo.txt` ou `Criação e gravação bem-sucedidas no novo arquivo: /caminho/para/novo/arquivo.txt`.
- **Confirmação:** Sim. Exibe uma comparação (diff) das alterações e solicita aprovação do usuário antes de gravar.

## 4. `glob` (Glob)

O `glob` localiza arquivos que correspondem a padrões específicos de glob (por exemplo, `src/**/*.ts`, `*.md`), retornando caminhos absolutos ordenados por data de modificação (mais recente primeiro).

- **Nome da ferramenta:** `glob`
- **Nome exibido:** Glob
- **Arquivo:** `glob.ts`
- **Parâmetros:**
  - `pattern` (string, obrigatório): O padrão de glob a ser correspondido (por exemplo, `"*.py"`, `"src/**/*.js"`).
  - `path` (string, opcional): O diretório no qual realizar a busca. Se não for especificado, o diretório de trabalho atual será usado.
- **Comportamento:**
  - Busca arquivos que correspondam ao padrão de glob no diretório especificado.
  - Retorna uma lista de caminhos absolutos, ordenada com os arquivos mais recentemente modificados primeiro.
  - Respeita, por padrão, os padrões definidos nos arquivos `.gitignore` e `.qwenignore`.
  - Limita os resultados a 100 arquivos para evitar excesso de contexto.
- **Saída (`llmContent`):** Uma mensagem como: `Encontrados 5 arquivo(s) correspondendo a "*.ts" dentro de /path/to/search/dir, ordenados por data de modificação (mais recente primeiro):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 arquivos truncados] ...`
- **Confirmação:** Não.

## 5. `grep_search` (Grep)

O `grep_search` pesquisa um padrão de expressão regular no conteúdo dos arquivos de um diretório especificado. Pode filtrar arquivos usando um padrão *glob*. Retorna as linhas que contêm correspondências, juntamente com seus caminhos de arquivo e números de linha.

- **Nome da ferramenta:** `grep_search`
- **Nome exibido:** Grep
- **Arquivo:** `grep.ts` (com `ripGrep.ts` como alternativa)
- **Parâmetros:**
  - `pattern` (string, obrigatório): O padrão de expressão regular a ser pesquisado no conteúdo dos arquivos (por exemplo, `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, opcional): Arquivo ou diretório onde realizar a pesquisa. Valor padrão: diretório de trabalho atual.
  - `glob` (string, opcional): Padrão *glob* para filtrar arquivos (por exemplo, `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (número, opcional): Limita a saída às primeiras N linhas correspondentes. Opcional — mostra todas as correspondências se não for especificado.
- **Comportamento:**
  - Usa o *ripgrep* para buscas rápidas, quando disponível; caso contrário, recorre a uma implementação de busca baseada em JavaScript.
  - Retorna as linhas correspondentes com seus caminhos de arquivo e números de linha.
  - Por padrão, a busca é insensível a maiúsculas e minúsculas.
  - Respeita os padrões definidos nos arquivos `.gitignore` e `.qwenignore`.
  - Limita a saída para evitar sobrecarga de contexto.
- **Saída (`llmContent`):** Uma string formatada com as correspondências, por exemplo:

  ```
  Encontradas 3 correspondências para o padrão "myFunction" no caminho "." (filtro: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 linhas truncadas] ...
  ```

- **Confirmação:** Não.

### Exemplos de `grep_search`

Pesquise um padrão com limite padrão de resultados:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Pesquise um padrão com limite personalizado de resultados:

```
grep_search(pattern="function", path="src", limit=50)
```

Pesquise um padrão com filtragem de arquivos e limite personalizado de resultados:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Editar)

O comando `edit` substitui texto dentro de um arquivo. Por padrão, exige que `old_string` corresponda a uma única localização exclusiva; defina `replace_all` como `true` quando você desejar intencionalmente alterar todas as ocorrências. Esta ferramenta foi projetada para alterações precisas e direcionadas, exigindo um contexto significativo ao redor de `old_string` para garantir que ela modifique a localização correta.

- **Nome da ferramenta:** `edit`
- **Nome exibido:** Editar
- **Arquivo:** `edit.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto para o arquivo a ser modificado.
  - `old_string` (string, obrigatório): O texto literal exato a ser substituído.

    **CRÍTICO:** Essa string deve identificar de forma exclusiva a única instância a ser alterada. Ela deve incluir contexto suficiente ao redor do texto-alvo, correspondendo exatamente ao espaçamento em branco e à indentação. Se `old_string` estiver vazia, a ferramenta tentará criar um novo arquivo em `file_path` com `new_string` como conteúdo.

  - `new_string` (string, obrigatório): O texto literal exato que substituirá `old_string`.
  - `replace_all` (booleano, opcional): Substitui todas as ocorrências de `old_string`. O valor padrão é `false`.

- **Comportamento:**
  - Se `old_string` estiver vazia e `file_path` não existir, cria um novo arquivo com `new_string` como conteúdo.
  - Se `old_string` for fornecida, a ferramenta lê `file_path` e tenta encontrar exatamente uma ocorrência, a menos que `replace_all` seja `true`.
  - Se a correspondência for única (ou `replace_all` for `true`), o texto é substituído por `new_string`.
  - **Confiabilidade Aprimorada (Correção de Edição em Múltiplas Etapas):** Para melhorar significativamente a taxa de sucesso das edições — especialmente quando `old_string`, fornecida pelo modelo, pode não ser perfeitamente precisa — a ferramenta incorpora um mecanismo de correção de edição em múltiplas etapas.
    - Se `old_string` inicial não for encontrada ou corresponder a múltiplas localizações, a ferramenta pode usar o modelo Qwen para refinar iterativamente `old_string` (e potencialmente `new_string`).
    - Esse processo de autorreparação tenta identificar o segmento único que o modelo pretendia modificar, tornando a operação `edit` mais robusta mesmo com contexto inicial ligeiramente impreciso.
- **Condições de falha:** Apesar do mecanismo de correção, a ferramenta falhará se:
  - `file_path` não for um caminho absoluto ou estiver fora do diretório raiz.
  - `old_string` não estiver vazia, mas `file_path` não existir.
  - `old_string` estiver vazia, mas `file_path` já existir.
  - `old_string` não for encontrada no arquivo após as tentativas de correção.
  - `old_string` for encontrada múltiplas vezes, `replace_all` for `false` e o mecanismo de autorreparação não conseguir resolvê-la em uma única correspondência inequívoca.
- **Saída (`llmContent`):**
  - Em caso de sucesso: `Arquivo modificado com sucesso: /caminho/para/arquivo.txt (1 substituição).` ou `Novo arquivo criado: /caminho/para/novo_arquivo.txt com o conteúdo fornecido.`
  - Em caso de falha: Uma mensagem de erro explicando o motivo (por exemplo, `Falha ao editar: 0 ocorrências encontradas...`, `Falha ao editar porque o texto corresponde a múltiplas localizações...`).
- **Confirmação:** Sim. Exibe um diff das alterações propostas e solicita aprovação do usuário antes de gravar no arquivo.

Essas ferramentas do sistema de arquivos fornecem a base para que o Qwen Code compreenda e interaja com o contexto do seu projeto local.