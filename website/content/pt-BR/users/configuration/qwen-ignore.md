# Ignorando Arquivos

Este documento fornece uma visão geral da funcionalidade Qwen Ignore (`.qwenignore`) do Qwen Code. O Qwen Code também reconhece arquivos de ignorar personalizados configurados por `context.fileFiltering.customIgnoreFiles`, que por padrão usam os arquivos de compatibilidade `.agentignore` e `.aiignore`.

O Qwen Code inclui a capacidade de ignorar arquivos automaticamente, de forma similar ao `.gitignore` (usado pelo Git). Adicionar caminhos ao `.qwenignore` ou a um arquivo de ignorar personalizado configurado fará com que eles sejam excluídos das ferramentas que suportam esse recurso, embora ainda permaneçam visíveis para outros serviços (como o Git).

## Como funciona

Quando você adiciona um caminho a um desses arquivos de ignorar, as ferramentas que respeitam as regras de ignorar do Qwen excluirão os arquivos e diretórios correspondentes de suas operações. Por exemplo, ao usar o comando [`read_many_files`](../../developers/tools/multi-file), quaisquer caminhos listados no `.qwenignore` ou nos arquivos de ignorar personalizados configurados serão automaticamente excluídos.

Na maior parte, esses arquivos de ignorar seguem as convenções dos arquivos `.gitignore`:

- Linhas em branco e linhas começando com `#` são ignoradas.
- Padrões glob padrão são suportados (como `*`, `?` e `[]`).
- Colocar uma `/` no final faz com que apenas diretórios sejam correspondidos.
- Colocar uma `/` no início ancora o caminho relativo ao arquivo de ignorar.
- `!` nega um padrão.

Você pode atualizar esses arquivos de ignorar a qualquer momento. Para aplicar as alterações, é necessário reiniciar sua sessão do Qwen Code.

## Como usar arquivos de ignorar

| Etapa                     | Descrição                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ativar regras de ignorar** | Crie o `.qwenignore`, um arquivo personalizado padrão (`.agentignore` / `.aiignore`) ou um arquivo de ignorar personalizado configurado na raiz do seu projeto |
| **Adicionar regras de ignorar** | Abra o arquivo de ignorar e adicione os caminhos a serem ignorados, exemplo: `/archive/` ou `apikeys.txt`                                           |

Por padrão, o Qwen Code lê `.qwenignore`, `.agentignore` e `.aiignore`.
Para usar um arquivo de ignorar personalizado diferente, configure:

```json
{
  "context": {
    "fileFiltering": {
      "customIgnoreFiles": [".cursorignore"]
    }
  }
}
```

O `.qwenignore` é sempre incluído quando `context.fileFiltering.respectQwenIgnore`
está habilitado. Os caminhos dos arquivos de ignorar personalizados são relativos à raiz do projeto.

### Exemplos de arquivos de ignorar

Você pode usar qualquer arquivo de ignorar suportado para ignorar diretórios e arquivos:

```
# Exclui o diretório /packages/ e todos os seus subdiretórios
/packages/

# Exclui o arquivo apikeys.txt
apikeys.txt
```

Você pode usar caracteres curinga no seu arquivo de ignorar com `*`:

```
# Exclui todos os arquivos .md
*.md
```

Por fim, você pode excluir arquivos e diretórios da exclusão usando `!`:

```
# Exclui todos os arquivos .md, exceto README.md
*.md
!README.md
```

Para remover caminhos de um arquivo de ignorar, exclua as linhas correspondentes.