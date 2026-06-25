# Ignorando Arquivos

Este documento fornece uma visão geral do recurso Qwen Ignore (`.qwenignore`) do Qwen Code. O Qwen Code também reconhece arquivos de ignore personalizados configurados por `context.fileFiltering.customIgnoreFiles`, cujo padrão são os arquivos de compatibilidade `.agentignore` e `.aiignore`.

O Qwen Code inclui a capacidade de ignorar automaticamente arquivos, de forma similar ao `.gitignore` (usado pelo Git). Adicionar caminhos ao `.qwenignore` ou a um arquivo de ignore personalizado configurado irá excluí-los das ferramentas que suportam este recurso, embora eles ainda fiquem visíveis para outros serviços (como o Git).

## Como funciona

Quando você adiciona um caminho a um desses arquivos de ignore, as ferramentas que respeitam as regras de ignore do Qwen excluirão arquivos e diretórios correspondentes de suas operações. Por exemplo, ao usar o comando [`read_many_files`](../../developers/tools/multi-file), qualquer caminho presente no `.qwenignore` ou em arquivos de ignore personalizados configurados será automaticamente excluído.

Na maioria dos casos, esses arquivos de ignore seguem as convenções dos arquivos `.gitignore`:

- Linhas em branco e linhas começando com `#` são ignoradas.
- Padrões glob padrão são suportados (como `*`, `?` e `[]`).
- Colocar uma `/` no final corresponde apenas a diretórios.
- Colocar uma `/` no início ancora o caminho em relação ao arquivo de ignore.
- `!` nega um padrão.

Você pode atualizar esses arquivos de ignore a qualquer momento. Para aplicar as alterações, é necessário reiniciar sua sessão do Qwen Code.

## Como usar arquivos de ignore

| Etapa                    | Descrição                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ativar regras de ignore** | Crie um `.qwenignore`, um arquivo personalizado padrão (`.agentignore` / `.aiignore`) ou um arquivo de ignore personalizado configurado no diretório raiz do seu projeto |
| **Adicionar regras de ignore**    | Abra o arquivo de ignore e adicione caminhos a serem ignorados, exemplo: `/archive/` ou `apikeys.txt`                                                           |

Por padrão, o Qwen Code lê `.qwenignore`, `.agentignore` e `.aiignore`.
Para usar um arquivo de ignore personalizado diferente, configure:

```json
{
  "context": {
    "fileFiltering": {
      "customIgnoreFiles": [".cursorignore"]
    }
  }
}
```

`.qwenignore` está sempre incluído quando `context.fileFiltering.respectQwenIgnore`
está habilitado. Os caminhos dos arquivos de ignore personalizados são relativos à raiz do projeto.

### Exemplos de arquivos de ignore

Você pode usar qualquer arquivo de ignore suportado para ignorar diretórios e arquivos:

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

Você pode usar curingas no seu arquivo de ignore com `*`:

```
# Exclude all .md files
*.md
```

Finalmente, você pode excluir arquivos e diretórios da exclusão com `!`:

```
# Exclude all .md files except README.md
*.md
!README.md
```

Para remover caminhos de um arquivo de ignore, exclua as linhas relevantes.
