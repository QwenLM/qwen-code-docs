# Ferramentas de sistema de arquivos do Qwen Code

O Qwen Code oferece um conjunto abrangente de ferramentas para interagir com o sistema de arquivos local. Essas ferramentas permitem que o modelo leia, escreva, liste, pesquise e modifique arquivos e diretórios, tudo sob seu controle e, geralmente, com confirmação para operações sensíveis.

**Nota:** Todas as ferramentas de sistema de arquivos operam dentro de um `rootDirectory` (geralmente o diretório de trabalho atual onde você iniciou a CLI) por questões de segurança. Os caminhos fornecidos a essas ferramentas geralmente devem ser absolutos ou são resolvidos em relação a esse diretório raiz.

## 1. `list_directory` (ListFiles)

`list_directory` lista os nomes de arquivos e subdiretórios diretamente dentro de um caminho de diretório especificado. Opcionalmente, ele pode ignorar entradas que correspondam aos padrões glob fornecidos.

- **Nome da ferramenta:** `list_directory`
- **Nome de exibição:** ListFiles
- **Arquivo:** `ls.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o diretório a ser listado.
  - `ignore` (array de strings, opcional): Uma lista de padrões glob para excluir da listagem (ex.: `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, opcional): Indica se os padrões `.gitignore` devem ser respeitados ao listar arquivos. O padrão é `true`.
- **Comportamento:**
  - Retorna uma lista de nomes de arquivos e diretórios.
  - Indica se cada entrada é um diretório.
  - Ordena as entradas com diretórios primeiro e, em seguida, em ordem alfabética.
- **Saída (`llmContent`):** Uma string como: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmação:** Não.

## 2. `read_file` (ReadFile)

`read_file` lê e retorna o conteúdo de um arquivo especificado. Esta ferramenta lida com arquivos de texto e arquivos de mídia (imagens, PDFs, áudio, vídeo) cuja modalidade é suportada pelo modelo atual. Para arquivos de texto, é possível ler intervalos específicos de linhas. Arquivos de mídia cuja modalidade não é suportada pelo modelo atual são rejeitados com uma mensagem de erro útil. Outros tipos de arquivos binários geralmente são ignorados.

- **Nome da ferramenta:** `read_file`
- **Nome de exibição:** ReadFile
- **Arquivo:** `read-file.ts`
- **Parâmetros:**
  - `path` (string, obrigatório): O caminho absoluto para o arquivo a ser lido.
  - `offset` (number, opcional): Para arquivos de texto, o número da linha (base 0) para iniciar a leitura. Requer que `limit` seja definido.
  - `limit` (number, opcional): Para arquivos de texto, o número máximo de linhas a ler. Se omitido, lê um máximo padrão (ex.: 2000 linhas) ou o arquivo inteiro, se viável.
- **Comportamento:**
  - Para arquivos de texto: Retorna o conteúdo. Se `offset` e `limit` forem usados, retorna apenas esse intervalo de linhas. Indica se o conteúdo foi truncado devido a limites de linhas ou de comprimento de linha.
  - Para arquivos de mídia (imagens, PDFs, áudio, vídeo): Se o modelo atual suportar a modalidade do arquivo, retorna o conteúdo do arquivo como um objeto `inlineData` codificado em base64. Se o modelo não suportar a modalidade, retorna uma mensagem de erro com orientações (ex.: sugerindo skills ou ferramentas externas).
  - Para outros arquivos binários: Tenta identificá-los e ignorá-los, retornando uma mensagem indicando que se trata de um arquivo binário genérico.
- **Saída:** (`llmContent`):
  - Para arquivos de texto: O conteúdo do arquivo, possivelmente prefixado com uma mensagem de truncamento (ex.: `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - Para arquivos de mídia suportados: Um objeto contendo `inlineData` com `mimeType` e `data` em base64 (ex.: `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - Para arquivos de mídia não suportados: Uma string de mensagem de erro explicando que o modelo atual não suporta essa modalidade, com sugestões de alternativas.
  - Para outros arquivos binários: Uma mensagem como `Cannot display content of binary file: /path/to/data.bin`.
- **Confirmação:** Não.

## 3. `write_file` (WriteFile)

`write_file` grava conteúdo em um arquivo especificado. Se o arquivo existir, ele será sobrescrito. Se o arquivo não existir, ele (e quaisquer diretórios pai necessários) será criado.

- **Nome da ferramenta:** `write_file`
- **Nome de exibição:** WriteFile
- **Arquivo:** `write-file.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto para o arquivo a ser gravado.
  - `content` (string, obrigatório): O conteúdo a ser gravado no arquivo.
- **Comportamento:**
  - Grava o `content` fornecido no `file_path`.
  - Cria diretórios pai se eles não existirem.
- **Saída (`llmContent`):** Uma mensagem de sucesso, ex.: `Successfully overwrote file: /path/to/your/file.txt` ou `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmação:** Sim. Exibe um diff das alterações e solicita a aprovação do usuário antes da gravação.

## 4. `glob` (Glob)

`glob` encontra arquivos que correspondem a padrões glob específicos (ex.: `src/**/*.ts`, `*.md`), retornando caminhos absolutos ordenados por tempo de modificação (mais recente primeiro).

- **Nome da ferramenta:** `glob`
- **Nome de exibição:** Glob
- **Arquivo:** `glob.ts`
- **Parâmetros:**
  - `pattern` (string, obrigatório): O padrão glob para correspondência (ex.: `"*.py"`, `"src/**/*.js"`).
  - `path` (string, opcional): O diretório onde a busca será realizada. Se não especificado, o diretório de trabalho atual será usado.
- **Comportamento:**
  - Busca arquivos que correspondam ao padrão glob dentro do diretório especificado.
  - Retorna uma lista de caminhos absolutos, ordenados com os arquivos modificados mais recentemente primeiro.
  - Respeita os padrões .gitignore e .qwenignore por padrão.
  - Limita os resultados a 100 arquivos para evitar estouro de contexto.
- **Saída (`llmContent`):** Uma mensagem como: `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **Confirmação:** Não.

## 5. `grep_search` (Grep)

`grep_search` busca um padrão de expressão regular dentro do conteúdo de arquivos em um diretório especificado. Pode filtrar arquivos por um padrão glob. Retorna as linhas que contêm correspondências, juntamente com seus caminhos de arquivo e números de linha.

- **Nome da ferramenta:** `grep_search`
- **Nome de exibição:** Grep
- **Arquivo:** `grep.ts` (com `ripGrep.ts` como fallback)
- **Parâmetros:**
  - `pattern` (string, obrigatório): O padrão de expressão regular a ser buscado no conteúdo dos arquivos (ex.: `"function\\s+myFunction"`, `"log.*Error"`).
  - `path` (string, opcional): Arquivo ou diretório onde a busca será realizada. O padrão é o diretório de trabalho atual.
  - `glob` (string, opcional): Padrão glob para filtrar arquivos (ex.: `"*.js"`, `"src/**/*.{ts,tsx}"`).
  - `limit` (number, opcional): Limita a saída às primeiras N linhas correspondentes. Opcional - mostra todas as correspondências se não for especificado.
- **Comportamento:**
  - Usa ripgrep para buscas rápidas quando disponível; caso contrário, faz fallback para uma implementação de busca baseada em JavaScript.
  - Retorna as linhas correspondentes com caminhos de arquivo e números de linha.
  - Não diferencia maiúsculas de minúsculas por padrão.
  - Respeita os padrões .gitignore e .qwenignore.
  - Limita a saída para evitar estouro de contexto.
- **Saída (`llmContent`):** Uma string formatada com as correspondências, ex.:

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

Buscar um padrão com limitação padrão de resultados:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

Buscar um padrão com limitação personalizada de resultados:

```
grep_search(pattern="function", path="src", limit=50)
```

Buscar um padrão com filtragem de arquivos e limitação personalizada de resultados:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Edit)

`edit` substitui texto dentro de um arquivo. Por padrão, exige que `old_string` corresponda a um único local exclusivo; defina `replace_all` como `true` quando quiser intencionalmente alterar todas as ocorrências. Esta ferramenta foi projetada para alterações precisas e direcionadas e requer contexto significativo ao redor do `old_string` para garantir que modifique o local correto.

- **Nome da ferramenta:** `edit`
- **Nome de exibição:** Edit
- **Arquivo:** `edit.ts`
- **Parâmetros:**
  - `file_path` (string, obrigatório): O caminho absoluto para o arquivo a ser modificado.
  - `old_string` (string, obrigatório): O texto literal exato a ser substituído.

    **CRÍTICO:** Esta string deve identificar exclusivamente a única instância a ser alterada. Ela deve incluir contexto suficiente ao redor do texto alvo, correspondendo precisamente a espaços em branco e indentação. Se `old_string` estiver vazio, a ferramenta tentará criar um novo arquivo em `file_path` com `new_string` como conteúdo.

  - `new_string` (string, obrigatório): O texto literal exato para substituir `old_string`.
  - `replace_all` (boolean, opcional): Substitui todas as ocorrências de `old_string`. O padrão é `false`.

- **Comportamento:**
  - Se `old_string` estiver vazio e `file_path` não existir, cria um novo arquivo com `new_string` como conteúdo.
  - Se `old_string` for fornecido, lê o `file_path` e tenta encontrar exatamente uma ocorrência, a menos que `replace_all` seja true.
  - Se a correspondência for única (ou `replace_all` for true), substitui o texto por `new_string`.
  - **Confiabilidade Aprimorada (Correção de Edição em Múltiplos Estágios):** Para melhorar significativamente a taxa de sucesso das edições, especialmente quando o `old_string` fornecido pelo modelo pode não ser perfeitamente preciso, a ferramenta incorpora um mecanismo de correção de edição em múltiplos estágios.
    - Se o `old_string` inicial não for encontrado ou corresponder a múltiplos locais, a ferramenta pode utilizar o modelo Qwen para refinar iterativamente o `old_string` (e potencialmente o `new_string`).
    - Esse processo de autocorreção tenta identificar o segmento único que o modelo pretendia modificar, tornando a operação `edit` mais robusta mesmo com um contexto inicial ligeiramente imperfeito.
- **Condições de falha:** Apesar do mecanismo de correção, a ferramenta falhará se:
  - `file_path` não for absoluto ou estiver fora do diretório raiz.
  - `old_string` não estiver vazio, mas o `file_path` não existir.
  - `old_string` estiver vazio, mas o `file_path` já existir.
  - `old_string` não for encontrado no arquivo após as tentativas de correção.
  - `old_string` for encontrado múltiplas vezes, `replace_all` for false e o mecanismo de autocorreção não conseguir resolvê-lo para uma única correspondência inequívoca.
- **Saída (`llmContent`):**
  - Em caso de sucesso: `Successfully modified file: /path/to/file.txt (1 replacements).` ou `Created new file: /path/to/new_file.txt with provided content.`
  - Em caso de falha: Uma mensagem de erro explicando o motivo (ex.: `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`).
- **Confirmação:** Sim. Exibe um diff das alterações propostas e solicita a aprovação do usuário antes de gravar no arquivo.

## Codificação de arquivos e comportamento específico da plataforma

### Detecção e preservação de codificação

Ao ler arquivos, o Qwen Code detecta a codificação do arquivo usando uma estratégia em múltiplas etapas:

1. **UTF-8** — testado primeiro (a maioria das ferramentas modernas gera UTF-8)
2. **chardet** — detecção estatística para conteúdo não UTF-8
3. **Codificação do sistema** — faz fallback para a code page do SO (Windows `chcp` / Unix `LANG`)

Tanto `write_file` quanto `edit` preservam a codificação original e o BOM (byte order mark) de arquivos existentes. Se um arquivo foi lido como GBK com um BOM UTF-8, ele será gravado da mesma forma.

### Configurando a codificação padrão para novos arquivos

A configuração `defaultFileEncoding` controla a codificação para arquivos **recém-criados** (não para edições em arquivos existentes):

| Valor       | Comportamento                                                               |
| ----------- | --------------------------------------------------------------------------- |
| _(não definido)_ | UTF-8 sem BOM, com ajustes automáticos específicos da plataforma (veja abaixo) |
| `utf-8`     | UTF-8 sem BOM, sem ajustes automáticos                                    |
| `utf-8-bom` | UTF-8 com BOM para todos os novos arquivos                                |

Defina-o em `.qwen/settings.json` ou `~/.qwen/settings.json`:

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows: CRLF para arquivos batch

No Windows, arquivos `.bat` e `.cmd` são gravados automaticamente com finais de linha CRLF (`\r\n`). Isso é necessário porque o `cmd.exe` usa CRLF como delimitador de linha — finais apenas com LF podem quebrar blocos `if`/`else` de múltiplas linhas, rótulos `goto` e loops `for`. Isso se aplica independentemente das configurações de codificação e apenas no Windows.

### Windows: UTF-8 BOM para scripts PowerShell

No Windows com uma **code page de sistema não UTF-8** (ex.: GBK/cp936, Big5/cp950, Shift_JIS/cp932), arquivos `.ps1` recém-criados são gravados automaticamente com um BOM UTF-8. Isso é necessário porque o Windows PowerShell 5.1 (a versão integrada ao Windows 10/11) lê scripts sem BOM usando a code page ANSI do sistema. Sem um BOM, quaisquer caracteres não ASCII no script serão interpretados incorretamente.

Esse BOM automático só se aplica quando:

- A plataforma é Windows
- A code page do sistema não é UTF-8 (não é a code page 65001)
- O arquivo é um novo arquivo `.ps1` (arquivos existentes mantêm sua codificação original)
- O usuário **não** definiu explicitamente `defaultFileEncoding` nas configurações

O PowerShell 7+ (pwsh) usa UTF-8 por padrão e lida com o BOM de forma transparente, portanto, o BOM é inofensivo nele.

Se você definir explicitamente `defaultFileEncoding` como `"utf-8"`, o BOM automático será desativado — essa é uma válvula de escape intencional para repositórios ou ferramentas que rejeitam BOMs.

### Resumo

| Tipo de arquivo | Plataforma                    | Comportamento automático      |
| -------------- | ----------------------------- | --------------------------- |
| `.bat`, `.cmd` | Windows                       | Finais de linha CRLF          |
| `.ps1`         | Windows (code page não UTF-8) | BOM UTF-8 em novos arquivos   |
| Todos os outros| Todas                         | UTF-8 sem BOM (padrão)        |

Essas ferramentas de sistema de arquivos fornecem a base para que o Qwen Code compreenda e interaja com o contexto do seu projeto local.