# hooks FileChanged


Use `FileChanged` para observar arquivos alterados pelo Qwen Code, comandos shell, editores
ou outros processos. Ele é executado em sessões locais e não gerenciadas. Consulte o
[guia de Hooks](./hooks.md) para configuração de hooks, executores e regras de confiança.

## Entrada do evento

A entrada inclui os [campos comuns de hook](./hooks.md#hook-input-structure) e:

```json
{
  "file_path": "/home/me/work/demo/.envrc",
  "event": "change"
}
```

`file_path` é absoluto. `event` é `add`, `change` ou `unlink` para adição, modificação
ou exclusão de um arquivo observado. O `session_id` e `cwd` comuns pertencem à sessão
de escuta; eles não identificam o escritor. Múltiplas sessões observando um diretório
compartilhado podem receber suas alterações. O conteúdo do arquivo não é incluído.

Somente eventos de arquivo são entregues. Eventos `addDir` e `unlinkDir` do próprio
diretório não são entregues. Integrações que rastreiam o ciclo de vida da raiz observada
devem verificar o estado do sistema de arquivos (por exemplo, com `stat`) e reconciliar
de forma independente; o `unlink` de um filho não prova que a raiz foi removida.

## Observar nomes de arquivos no diretório de trabalho

Adicione um hook `FileChanged` com nomes de arquivos literais separados por `|`:

```json
{
  "hooks": {
    "FileChanged": [
      {
        "matcher": ".envrc|.env",
        "hooks": [
          {
            "type": "command",
            "name": "configuration-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

Isso registra `.envrc` e `.env` no cwd da sessão. O registro estático não expande globs
nem varre diretórios recursivamente. Matchers omitidos ou vazios, `*` e `.*` não registram
caminhos estáticos; esses hooks recebem eventos dos caminhos observados da sessão,
incluindo caminhos dinâmicos. Os eventos são filtrados pelo nome base do arquivo usando as
[regras de matcher existentes](./hooks.md#matcher-patterns).

Padrões regex filtram caminhos já observados; registre seus arquivos ou diretórios
explicitamente através de `watchPaths`.

Raízes estáticas aceitam apenas nomes de arquivos literais simples, incluindo dotfiles.
Metacaracteres regex/glob e separadores de caminho não criam raízes estáticas.
Diretórios existentes e caminhos que não podem ser inspecionados são excluídos; arquivos
ausentes podem ser observados para criação. A descoberta estática de arquivos observa seu
diretório pai enquanto exclui entradas não relacionadas antes da travessia. Use
`watchPaths` explícitos para diretórios recursivos. Alterar o diretório de trabalho da
sessão realoca as raízes estáticas antes que a realocação termine; raízes dinâmicas
absolutas explícitas permanecem inalteradas.

## Observar diretórios e caminhos fora do cwd

Um hook síncrono `SessionStart` bem-sucedido pode registrar arquivos ou diretórios
absolutos através de `hookSpecificOutput.watchPaths`. Os diretórios são observados
recursivamente, incluindo filhos criados posteriormente. A descoberta recursiva ignora
as subárvores `.git` e `node_modules`. Para observar um caminho dentro deles, registre
esse arquivo ou diretório explicitamente. Tipos de arquivo especiais são ignorados, e
diretórios comuns não têm limite de profundidade. O registro inicial aguarda a prontidão
do watcher antes que `SessionStart` retorne.

A descoberta recursiva ignora arquivos temporários de escrita atômica nomeados
`<target>.<12 lowercase hex characters>.tmp`, incluindo renomeações atrasadas e órfãos.
Registrar explicitamente tal arquivo ainda o observa. Diretórios com este sufixo
permanecem atravessáveis, e outros arquivos `.tmp` são observados normalmente.

Por exemplo, registre pastas de memória:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "watch-memory-folders",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/watch-memory.mjs\""
          }
        ]
      }
    ],
    "FileChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "memory-file-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

Faça com que `watch-memory.mjs` imprima este JSON no stdout. Substitua os caminhos de
exemplo pelas pastas absolutas reais mostradas por `/memory`:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "watchPaths": [
      "/home/me/.qwen/projects/demo/memory",
      "/home/me/.qwen/memories"
    ]
  }
}
```

O hook `FileChanged` não tem matcher, então recebe alterações em todos os diretórios
registrados. Seu handler lê o JSON do evento do stdin. Escolha um destino de log ou
sincronização fora dos caminhos observados para evitar acionar o handler com suas
próprias escritas.

## Atualizar caminhos dinâmicos

Para vários workspaces no mesmo sistema de arquivos, registre todos os seus diretórios
de memória reais em uma lista. Encaminhe notificações usando `file_path` e seu próprio
mapeamento de diretório para workspace, em vez do `cwd` da sessão de escuta. Sessões
independentes podem observar a mesma raiz compartilhada, então deduplique o trabalho no
handler de negócio. Raízes em outro contêiner ou instância remota precisam de um watcher
no proprietário desse sistema de arquivos; registrar seus caminhos no host não os observa.

Saídas síncronas bem-sucedidas de `SessionStart` e `FileChanged` podem definir
`watchPaths`. Inclua o `hookEventName` correspondente em `hookSpecificOutput`.

| Saída | Efeito nos caminhos dinâmicos |
| --------------------------------------- | ---------------------------------- |
| Uma lista de arquivos ou diretórios absolutos | Substitui a lista dinâmica anterior |
| `[]` | Limpa a lista dinâmica |
| `watchPaths` omitido ou inválido | Mantém a lista dinâmica anterior |
| Saída de um hook assíncrono | Não registra nem altera caminhos |

Quando vários hooks retornam listas, a última lista válida e explicitamente fornecida na
ordem de execução dos hooks prevalece. Todas as entradas devem ser caminhos absolutos;
uma entrada inválida torna a lista inválida. Registros de nomes de arquivo estáticos
permanecem ativos após uma substituição ou limpeza dinâmica.

Para limpar caminhos dinâmicos de um handler `FileChanged`, retorne:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "FileChanged",
    "watchPaths": []
  }
}
```

## Limites de observação

A varredura inicial do diretório não é repetida. Eventos nativos do sistema de arquivos
de uma escrita recente podem chegar após o registro. Arquivos de link simbólico e raízes
de diretório registrados explicitamente observam seus alvos, incluindo links em caminhos
ancestrais. As notificações usam o alias configurado; registrar múltiplos aliases para
um alvo produz uma notificação para cada alias. Atualize o registro após redirecionar um
link. Links simbólicos descobertos dentro de uma raiz recursiva não são atravessados.
Eventos são relatados após as escritas estabilizarem.
A observação é no melhor esforço: coalescimento do sistema de arquivos, caminhos
inacessíveis, tempo de inatividade do processo e reconfiguração de caminho podem deixar
lacunas. Integrações que requerem uma cópia sincronizada completa devem lidar com
varreduras iniciais, reconciliação e nova tentativa. Falhas de watcher ou hook são
registradas em log e deixam a operação de arquivo originadora inalterada.

`FileChanged` não pode vetar ou desfazer uma escrita nem adicionar contexto de modelo.
Somente caminhos registrados explicitamente são observados: pastas de memória não são
registradas automaticamente, e não há um evento dedicado de ativação/desativação de
memória automática. Um hook que escreve um arquivo observado pode acionar a si mesmo;
evite essas escritas ou deduplique o trabalho.

Ambientes de execução SSH, workers de sandbox shell e dispatchers gerenciados não iniciam
um watcher de sistema de arquivos local. As regras normais de ativação e confiança de
hooks ainda se aplicam. A observação para quando sua sessão proprietária é encerrada.
