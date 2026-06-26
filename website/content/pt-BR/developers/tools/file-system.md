# Ferramentas de sistema de arquivos do Qwen Code

O Qwen Code fornece um conjunto abrangente de ferramentas para interagir com o sistema de arquivos local. Essas ferramentas permitem que o modelo leia, escreva, liste, pesquise e modifique arquivos e diretórios, tudo sob seu controle e normalmente com confirmação para operações sensíveis.

**Nota:** Todas as ferramentas do sistema de arquivos operam dentro de um `rootDirectory` (geralmente o diretório de trabalho atual onde você iniciou a CLI) por segurança. Os caminhos que você fornece a essas ferramentas são geralmente esperados como absolutos ou são resolvidos relativamente a esse diretório raiz.

## 1. `list_directory` (ListFiles)

`list_directory` lista os nomes de arquivos e subdiretórios diretamente dentro de um caminho de diretório especificado. Opcionalmente, pode ignorar entradas que correspondam aos padrões glob fornecidos.

- **Nome da ferramenta:** `list_directory`
- **Nome de exibição:** ListFiles
- **Arquivo:** `ls.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o diretório a ser listado.
  - `ignore` (array de strings, opcional): Uma lista de padrões glob para excluir da listagem (ex.: `["*.log", ".git"]`).
  - `respect_git_ignore` (booleano, opcional): Se deve respeitar os padrões `.gitignore` ao listar arquivos. Padrão: `true`.
- **Comportamento:**
  - Retorna uma lista de nomes de arquivos e diretórios.
  - Indica se cada entrada é um diretório.
  - Ordena as entradas com diretórios primeiro, depois alfabeticamente.
- **Saída (`llmContent`):** Uma string como: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmação:** Não.

## 2. `read_file` (ReadFile)

`read_file` lê e retorna o conteúdo de um arquivo especificado. Esta ferramenta lida com arquivos de texto e arquivos de mídia (imagens, PDFs, áudio, vídeo) cuja modalidade é suportada pelo modelo atual. Para arquivos de texto, pode ler intervalos de linhas específicos. Arquivos de mídia cuja modalidade não é suportada pelo modelo atual são rejeitados com uma mensagem de erro útil. Outros tipos de arquivos binários são geralmente ignorados.

- **Nome da ferramenta:** `read_file`
- **Nome de exibição:** ReadFile
- **Arquivo:** `read-file.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o arquivo a ser lido.
  - `offset` (número, opcional): Para arquivos de texto, o número da linha baseado em 0 para começar a ler. Requer que `limit` seja definido.
  - `limit` (número, opcional): Para arquivos de texto, o número máximo de linhas a serem lidas. Se omitido, lê um máximo padrão (ex.: 2000 linhas) ou o arquivo inteiro se viável.
- **Comportamento:**
  - Para arquivos de texto: Retorna o conteúdo. Se `offset` e `limit` forem usados, retorna apenas aquele intervalo de linhas. Indica se o conteúdo foi truncado devido a limites de linha ou limites de comprimento de linha.
  - Para arquivos de mídia (imagens, PDFs, áudio, vídeo): Se o modelo atual suportar a modalidade do arquivo, retorna o conteúdo do arquivo como um objeto `inlineData` codificado em base64. Se o modelo não suportar a modalidade, retorna uma mensagem de erro com orientação (ex.: sugerindo skills ou ferramentas externas).
  - Para outros arquivos binários: Tenta identificá-los e ignorá-los, retornando uma mensagem indicando que é um arquivo binário genérico.
- **Saída:** (`llmContent`):
  - Para arquivos de texto: O conteúdo do arquivo, potencialmente prefixado com uma mensagem de truncamento (ex.: `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Para arquivos de mídia suportados: Um objeto contendo `inlineData` com `mimeType` e `data` base64 (ex.: `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Para arquivos de mídia não suportados: Uma string de mensagem de erro explicando que o modelo atual não suporta esta modalidade, com sugestões de alternativas.
  - Para outros arquivos binários: Uma mensagem como `Cannot display content of binary file: /path/to/data.bin`.
- **Confirmação:** Não.

### Leitura de notebooks Jupyter

Para notebooks Jupyter (`.ipynb`), `read_file` analisa o JSON do notebook e retorna uma visualização estruturada e legível pelo modelo do notebook, em vez do JSON bruto. A saída renderizada inclui a linguagem do notebook, células ordenadas, IDs das células, fonte e saídas resumidas.

As células do notebook podem então ser editadas com `notebook_edit`. O modelo deve usar os IDs de célula mostrados por `read_file` ao direcionar uma célula.

`offset` e `limit` não são suportados para arquivos `.ipynb`. As leituras de notebook são tratadas como leituras estruturadas de arquivo completo; se a saída renderizada do notebook for truncada internamente por ser muito grande, `notebook_edit` rejeitará edições no nível da célula e pedirá que você reduza as saídas ou divida o notebook antes de editar.

## 3. `notebook_edit` (NotebookEdit)

`notebook_edit` edita arquivos de notebook Jupyter (`.ipynb`) com segurança no nível da célula. Use-o em vez de `edit` ou `write_file` ao alterar células do notebook.

- **Nome da ferramenta:** `notebook_edit`
- **Nome de exibição:** NotebookEdit
- **Arquivo:** `notebook-edit.ts`
- **Parâmetros:**
  - `notebook_path` (string, obrigatório): O caminho absoluto para o arquivo `.ipynb`.
  - `cell_id` (string, opcional): O ID da célula alvo mostrado por `read_file`. Necessário para `replace` e `delete`. Para `insert`, a nova célula é inserida após esta célula; se omitido, a nova célula é inserida no início.
  - `new_source` (string, opcional): A nova fonte da célula para `replace` e `insert`. Não é necessário para `delete`.
  - `cell_type` (`code` ou `markdown`, opcional): O tipo da célula para células inseridas, ou o tipo alvo ao substituir uma célula.
  - `edit_mode` (`replace`, `insert` ou `delete`, opcional): A operação de edição. Padrão: `replace`.
- **Comportamento:**
  - Requer que o notebook tenha sido lido primeiro com `read_file` na sessão atual.
  - Direciona células usando os IDs renderizados por `read_file`, incluindo IDs reais de células do notebook e IDs fallback `cell-N` exibidos.
  - Rejeita IDs de células renderizados ambíguos em vez de adivinhar.
  - Para células de código, limpa saídas obsoletas e redefine `execution_count` quando a fonte muda.
  - Preserva a formatação JSON do notebook, finais de linha, codificação e BOM quando possível.
  - Invalida o estado de leitura anterior após edições estruturais quando os IDs fallback exibidos podem mudar, então a próxima edição do notebook requer um novo `read_file`.
- **Saída (`llmContent`):** Uma mensagem de sucesso descrevendo a célula do notebook editada e, para operações que não sejam de exclusão, a fonte atualizada.
- **Confirmação:** Sim. Mostra um diff JSON do notebook e solicita aprovação do usuário antes de escrever, a menos que o modo de permissão atual ou as regras aprovem automaticamente ferramentas de edição.

### Exemplos de `notebook_edit`

Substituir uma célula de código:

```
notebook_edit(
  notebook_path="/caminho/para/analysis.ipynb",
  cell_id="load-data",
  new_source="result = 41 + 1\nprint(result)"
)
```

Inserir uma célula markdown após uma célula existente:

```
notebook_edit(
  notebook_path="/caminho/para/analysis.ipynb",
  edit_mode="insert",
  cell_id="summary",
  cell_type="markdown",
  new_source="## Descobertas\n\nOs dados limpos estão prontos para modelagem."
)
```

Excluir uma célula:

```
notebook_edit(
  notebook_path="/caminho/para/analysis.ipynb",
  edit_mode="delete",
  cell_id="old-experiment"
)
```

## 4. `write_file` (WriteFile)

`write_file` escreve conteúdo em um arquivo especificado. Se o arquivo existir, ele será sobrescrito. Se o arquivo não existir, ele (e quaisquer diretórios pai necessários) serão criados.

- **Nome da ferramenta:** `write_file`
- **Nome de exibição:** WriteFile
- **Arquivo:** `write-file.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto para o arquivo a ser escrito.
  - `content` (string, obrigatório): O conteúdo a ser escrito no arquivo.
- **Comportamento:**
  - Escreve o `content` fornecido no `file_path`.
  - Não escreve JSON bruto de notebook Jupyter. Use `notebook_edit` para edições de células `.ipynb`.
  - Cria diretórios pai se não existirem.
- **Saída (`llmContent`):** Uma mensagem de sucesso, ex.: `Successfully overwrote file: /path/to/your/file.txt` ou `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmação:** Sim. Mostra um diff das alterações e solicita aprovação do usuário antes de escrever.

## 5. `glob` (Glob)

`glob` encontra arquivos que correspondem a padrões glob específicos (ex.: `src/**/*.ts`, `*.md`), retornando caminhos absolutos ordenados por hora de modificação (mais recente primeiro).

- **Nome da ferramenta:** `glob`
- **Nome de exibição:** Glob
- **Arquivo:** `glob.ts`
- **Parâmetros:**
  - `pattern` (string, obrigatório): O padrão glob para corresponder (ex.: `"*.py"`, `"src/**/*.js"`).
  - `path` (string, opcional): O diretório para pesquisar. Se não especificado, o diretório de trabalho atual será usado.
- **Comportamento:**
  - Pesquisa por arquivos que correspondem ao padrão glob dentro do diretório especificado.
  - Retorna uma lista de caminhos absolutos, ordenados com os arquivos mais recentemente modificados primeiro.
  - Respeita .gitignore, .qwenignore e arquivos de ignorar Qwen personalizados configurados por padrão.
  - Limita os resultados a 100 arquivos para evitar estouro de contexto.
- **Saída (`llmContent`):** Uma mensagem como: `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **Confirmação:** Não.

## 6. `grep_search` (Grep)

`grep_search` pesquisa por um padrão de expressão regular dentro do conteúdo de arquivos em um diretório especificado. Pode filtrar arquivos por um padrão glob. Retorna as linhas contendo correspondências, junto com seus caminhos de arquivo e números de linha.

- **Nome da ferramenta:** `grep_search`
- **Nome de exibição:** Grep
- **Arquivo:** `grep.ts` (com `ripGrep.ts` como fallback)
- **Parâmetros:**
  - `pattern` (string, obrigatório): O padrão de expressão regular para pesquisar no conteúdo dos arquivos (ex.: `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, opcional): Arquivo ou diretório para pesquisar. Padrão: diretório de trabalho atual.
  - `glob` (string, opcional): Padrão glob para filtrar arquivos (ex.: `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (inteiro, opcional): Limitar a saída às primeiras N linhas correspondentes. Deve ser um número inteiro positivo. Opcional - mostra todas as correspondências se não especificado.
- **Comportamento:**
  - Usa ripgrep para pesquisa rápida quando disponível; caso contrário, usa uma implementação de pesquisa baseada em JavaScript.
  - Retorna linhas correspondentes com caminhos de arquivo e números de linha.
  - Insensível a maiúsculas/minúsculas por padrão.
  - Respeita .gitignore, .qwenignore e arquivos de ignorar Qwen personalizados.
  - Limita a saída para evitar estouro de contexto.
- **Saída (`llmContent`):** Uma string formatada de correspondências, ex.:

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

Pesquisar por um padrão com limitação de resultados padrão:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Pesquisar por um padrão com limitação de resultados personalizada:

```
grep_search(pattern="function", path="src", limit=50)
```

Pesquisar por um padrão com filtragem de arquivos e limitação de resultados personalizada:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 7. `edit` (Edit)

`edit` substitui texto dentro de um arquivo. Por padrão, requer que `old_string` corresponda a um único local único; defina `replace_all` como `true` quando você intencionalmente quiser alterar todas as ocorrências. Esta ferramenta foi projetada para alterações precisas e direcionadas e requer contexto significativo em torno de `old_string` para garantir que modifica o local correto.

- **Nome da ferramenta:** `edit`
- **Nome de exibição:** Edit
- **Arquivo:** `edit.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto para o arquivo a ser modificado.
  - `old_string` (string, obrigatório): O texto literal exato a ser substituído.

    **CRÍTICO:** Esta string deve identificar exclusivamente a única instância a ser alterada. Ela deve incluir contexto suficiente ao redor do texto alvo, correspondendo precisamente a espaços em branco e indentação. Se `old_string` estiver vazio, a ferramenta tenta criar um novo arquivo em `file_path` com `new_string` como conteúdo.

  - `new_string` (string, obrigatório): O texto literal exato para substituir `old_string`.
  - `replace_all` (booleano, opcional): Substituir todas as ocorrências de `old_string`. Padrão: `false`.

- **Comportamento:**
  - Não edita JSON bruto de notebook Jupyter. Use `notebook_edit` para edições de células `.ipynb`.
  - Se `old_string` estiver vazio e `file_path` não existir, cria um novo arquivo com `new_string` como conteúdo.
  - Se `old_string` for fornecido, lê o `file_path` e tenta encontrar exatamente uma ocorrência, a menos que `replace_all` seja verdadeiro.
  - Se a correspondência for única (ou `replace_all` for verdadeiro), substitui o texto por `new_string`.
  - **Confiabilidade Aprimorada (Correção de Edição em Múltiplos Estágios):** Para aumentar significativamente a taxa de sucesso das edições, especialmente quando o `old_string` fornecido pelo modelo pode não ser perfeitamente preciso, a ferramenta incorpora um mecanismo de correção de edição em múltiplos estágios.
    - Se o `old_string` inicial não for encontrado ou corresponder a vários locais, a ferramenta pode aproveitar o modelo Qwen para refinar iterativamente `old_string` (e potencialmente `new_string`).
    - Este processo de autocorreção tenta identificar o segmento único que o modelo pretendia modificar, tornando a operação `edit` mais robusta mesmo com contexto inicial ligeiramente imperfeito.
- **Condições de falha:** Apesar do mecanismo de correção, a ferramenta falhará se:
  - `file_path` não for absoluto ou estiver fora do diretório raiz.
  - `old_string` não estiver vazio, mas `file_path` não existir.
  - `old_string` estiver vazio, mas `file_path` já existir.
  - `old_string` não for encontrado no arquivo após tentativas de corrigi-lo.
  - `old_string` for encontrado várias vezes, `replace_all` for falso e o mecanismo de autocorreção não puder resolvê-lo para uma correspondência única e inequívoca.
- **Saída (`llmContent`):**
  - Em caso de sucesso: `Successfully modified file: /path/to/file.txt (1 replacements).` ou `Created new file: /path/to/new_file.txt with provided content.`
  - Em caso de falha: Uma mensagem de erro explicando o motivo (ex.: `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Confirmação:** Sim. Mostra um diff das alterações propostas e solicita aprovação do usuário antes de escrever no arquivo.

## Codificação de arquivos e comportamento específico de plataforma

### Detecção e preservação de codificação

Ao ler arquivos, o Qwen Code detecta a codificação do arquivo usando uma estratégia de várias etapas:

1. **UTF-8** — tentado primeiro (a maioria das ferramentas modernas gera UTF-8)
2. **chardet** — detecção estatística para conteúdo não UTF-8
3. **Codificação do sistema** — fallback para a página de código do SO (Windows `chcp` / Unix `LANG`)

Tanto `write_file` quanto `edit` preservam a codificação original e o BOM (byte order mark) de arquivos existentes. Se um arquivo foi lido como GBK com um BOM UTF-8, ele será escrito da mesma forma.

### Configurando codificação padrão para novos arquivos

A configuração `defaultFileEncoding` controla a codificação para arquivos **recém-criados** (não edições em arquivos existentes):

| Valor      | Comportamento                                                                 |
| ---------- | ----------------------------------------------------------------------------- |
| _(não definido)_ | UTF-8 sem BOM, com ajustes automáticos específicos de plataforma (veja abaixo) |
| `utf-8`    | UTF-8 sem BOM, sem ajustes automáticos                                        |
| `utf-8-bom` | UTF-8 com BOM para todos os novos arquivos                                   |

Defina em `.qwen/settings.json` ou `~/.qwen/settings.json`:

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows: CRLF para arquivos batch

No Windows, arquivos `.bat` e `.cmd` são automaticamente escritos com finais de linha CRLF (`\r\n`). Isso é necessário porque o `cmd.exe` usa CRLF como seu delimitador de linha — finais de linha apenas LF podem quebrar `if`/`else` multilinha, rótulos `goto` e loops `for`. Isso se aplica independentemente das configurações de codificação e apenas no Windows.

### Windows: BOM UTF-8 para scripts PowerShell

No Windows com uma **página de código do sistema não UTF-8** (ex.: GBK/cp936, Big5/cp950, Shift_JIS/cp932), arquivos `.ps1` recém-criados são automaticamente escritos com um BOM UTF-8. Isso é necessário porque o Windows PowerShell 5.1 (a versão integrada no Windows 10/11) lê scripts sem BOM usando a página de código ANSI do sistema. Sem um BOM, quaisquer caracteres não ASCII no script serão interpretados incorretamente.

Este BOM automático só se aplica quando:

- A plataforma é Windows
- A página de código do sistema não é UTF-8 (não é a página de código 65001)
- O arquivo é um novo arquivo `.ps1` (arquivos existentes mantêm sua codificação original)
- O usuário **não** definiu explicitamente `defaultFileEncoding` nas configurações

O PowerShell 7+ (pwsh) padrão é UTF-8 e lida com BOM de forma transparente, então o BOM é inofensivo lá.

Se você definir explicitamente `defaultFileEncoding` como `"utf-8"`, o BOM automático é desabilitado — esta é uma escotilha de escape intencional para repositórios ou ferramentas que rejeitam BOMs.

### Resumo

| Tipo de arquivo | Plataforma                       | Comportamento automático       |
| --------------- | -------------------------------- | ------------------------------ |
| `.bat`, `.cmd`  | Windows                          | Finais de linha CRLF           |
| `.ps1`          | Windows (página de código não UTF-8) | BOM UTF-8 em novos arquivos |
| Todos os outros | Todas                            | UTF-8 sem BOM (padrão)         |

Essas ferramentas de sistema de arquivos fornecem uma base para o Qwen Code entender e interagir com o contexto do seu projeto local.