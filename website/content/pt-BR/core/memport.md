# Memory Import Processor

O Memory Import Processor é um recurso que permite modularizar seus arquivos de contexto (por exemplo, `QWEN.md`) importando conteúdo de outros arquivos usando a sintaxe `@file.md`.

## Visão Geral

Esse recurso permite dividir arquivos de contexto grandes (por exemplo, `QWEN.md`) em componentes menores e mais gerenciáveis, que podem ser reutilizados em diferentes contextos. O import processor suporta caminhos relativos e absolutos, com recursos de segurança integrados para prevenir imports circulares e garantir a segurança no acesso aos arquivos.

## Sintaxe

Use o símbolo `@` seguido do caminho do arquivo que você deseja importar:

```markdown

# Arquivo QWEN.md principal

Este é o conteúdo principal.

@./components/instructions.md

Mais conteúdo aqui.

@./shared/configuration.md
```

## Formatos de Caminho Suportados

### Caminhos Relativos

- `@./file.md` - Importa do mesmo diretório
- `@../file.md` - Importa do diretório pai
- `@./components/file.md` - Importa de um subdiretório

### Caminhos Absolutos

- `@/absolute/path/to/file.md` - Import usando caminho absoluto

## Exemplos

### Import Básico

```markdown

# My QWEN.md

Bem-vindo ao meu projeto!

@./getting-started.md

## Funcionalidades

@./features/overview.md
```

### Imports Aninhados

Os arquivos importados podem conter, eles mesmos, imports, criando uma estrutura aninhada:

```markdown

# main.md

@./header.md
@./content.md
@./footer.md
```

```markdown

# header.md

# Cabeçalho do Projeto

@./shared/title.md
```

## Recursos de Segurança

### Detecção de Import Circular

O processador detecta e previne automaticamente imports circulares:

```markdown

# file-a.md

@./file-b.md

# file-b.md

@./file-a.md <!-- Isso será detectado e evitado -->
```

### Segurança no Acesso a Arquivos

A função `validateImportPath` garante que os imports sejam permitidos apenas a partir de diretórios específicos, evitando acesso a arquivos sensíveis fora do escopo permitido.

### Profundidade Máxima de Importação

Para prevenir recursão infinita, existe uma profundidade máxima configurável para importações (padrão: 5 níveis).

## Tratamento de Erros

### Arquivos Ausentes

Se um arquivo referenciado não existir, a importação falhará de forma elegante com um comentário de erro na saída.

### Erros de Acesso a Arquivos

Problemas de permissão ou outros erros do sistema de arquivos são tratados de forma elegante com mensagens de erro apropriadas.

## Detecção de Regiões de Código

O processador de importação utiliza a biblioteca `marked` para detectar blocos de código e spans de código inline, garantindo que as importações `@` dentro dessas regiões sejam ignoradas corretamente. Isso proporciona um tratamento robusto de blocos de código aninhados e estruturas Markdown complexas.

## Estrutura da Árvore de Importação

O processador retorna uma árvore de importação que mostra a hierarquia dos arquivos importados. Isso ajuda os usuários a depurar problemas com seus arquivos de contexto, mostrando quais arquivos foram lidos e suas relações de importação.

Exemplo de estrutura de árvore:

```
 Memory Files
 L project: QWEN.md
            L a.md
              L b.md
                L c.md
              L d.md
                L e.md
                  L f.md
            L included.md
```

A árvore preserva a ordem em que os arquivos foram importados e mostra a cadeia completa de importação para fins de depuração.

## Comparação com a Abordagem `/memory` do Claude Code (`claude.md`)

O recurso `/memory` do Claude Code (como visto em `claude.md`) produz um documento plano e linear concatenando todos os arquivos incluídos, sempre marcando os limites dos arquivos com comentários claros e nomes de caminhos. Ele não apresenta explicitamente a hierarquia de imports, mas o LLM recebe todos os conteúdos e caminhos dos arquivos, o que é suficiente para reconstruir a hierarquia se necessário.

Nota: A árvore de imports é principalmente para clareza durante o desenvolvimento e tem relevância limitada para o consumo do LLM.

## Referência da API

### `processImports(content, basePath, debugMode?, importState?)`

Processa declarações de import no conteúdo do arquivo de contexto.

**Parâmetros:**

- `content` (string): O conteúdo a ser processado para resolver os imports
- `basePath` (string): O caminho do diretório onde o arquivo atual está localizado
- `debugMode` (boolean, opcional): Se deve habilitar o log de debug (padrão: false)
- `importState` (ImportState, opcional): Estado usado para rastrear e prevenir imports circulares

**Retorna:** Promise&lt;ProcessImportsResult&gt; - Objeto contendo o conteúdo processado e a árvore de imports

### `ProcessImportsResult`

```typescript
interface ProcessImportsResult {
  content: string; // O conteúdo processado com os imports resolvidos
  importTree: MemoryFile; // Estrutura em árvore mostrando a hierarquia dos imports
}
```

### `MemoryFile`

```typescript
interface MemoryFile {
  path: string; // O caminho do arquivo
  imports?: MemoryFile[]; // Imports diretos, na ordem em que foram importados
}
```

### `validateImportPath(importPath, basePath, allowedDirectories)`

Valida os caminhos de importação para garantir que sejam seguros e estejam dentro dos diretórios permitidos.

**Parâmetros:**

- `importPath` (string): O caminho de importação a ser validado
- `basePath` (string): O diretório base para resolver caminhos relativos
- `allowedDirectories` (string[]): Array de caminhos de diretórios permitidos

**Retorna:** boolean - Se o caminho de importação é válido

### `findProjectRoot(startDir)`

Encontra a raiz do projeto procurando por um diretório `.git` subindo a partir do diretório inicial fornecido. Implementada como uma função **async** usando APIs do sistema de arquivos non-blocking para evitar bloquear o event loop do Node.js.

**Parâmetros:**

- `startDir` (string): O diretório onde iniciar a busca

**Retorna:** Promise&lt;string&gt; - O diretório raiz do projeto (ou o diretório inicial caso nenhum `.git` seja encontrado)

## Boas Práticas

1. **Use nomes de arquivos descritivos** para componentes importados
2. **Mantenha imports rasos** - evite cadeias de importação muito profundas
3. **Documente sua estrutura** - mantenha uma hierarquia clara dos arquivos importados
4. **Teste seus imports** - garanta que todos os arquivos referenciados existem e são acessíveis
5. **Use caminhos relativos** quando possível para melhor portabilidade

## Solução de Problemas

### Problemas Comuns

1. **Import não funcionando**: Verifique se o arquivo existe e se o caminho está correto
2. **Avisos de import circular**: Revise sua estrutura de importação em busca de referências circulares
3. **Erros de permissão**: Garanta que os arquivos sejam legíveis e estejam dentro dos diretórios permitidos
4. **Problemas de resolução de caminho**: Use caminhos absolutos se os caminhos relativos não estiverem resolvendo corretamente

### Modo Debug

Habilite o modo debug para ver logs detalhados do processo de importação:

```typescript
const result = await processImports(content, basePath, true);
```