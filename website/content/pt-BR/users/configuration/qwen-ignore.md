# Ignorando Arquivos

Este documento fornece uma visão geral do recurso Qwen Ignore (`.qwenignore`) do Qwen Code.

O Qwen Code inclui a capacidade de ignorar arquivos automaticamente, semelhante ao `.gitignore` (usado pelo Git). Adicionar caminhos ao seu arquivo `.qwenignore` irá excluí-los de ferramentas que suportam esse recurso, embora eles ainda estejam visíveis para outros serviços (como o Git).

## Como funciona

Quando você adiciona um caminho ao seu arquivo `.qwenignore`, ferramentas que respeitam esse arquivo irão excluir arquivos e diretórios correspondentes de suas operações. Por exemplo, quando você usa o comando [`read_many_files`](../../developers/tools/multi-file), quaisquer caminhos no seu arquivo `.qwenignore` serão automaticamente excluídos.

Na maior parte, `.qwenignore` segue as convenções dos arquivos `.gitignore`:

- Linhas em branco e linhas que começam com `#` são ignoradas.
- Padrões glob padrão são suportados (como `*`, `?` e `[]`).
- Colocar uma `/` no final irá corresponder apenas a diretórios.
- Colocar uma `/` no início fixa o caminho em relação ao arquivo `.qwenignore`.
- `!` nega um padrão.

Você pode atualizar seu arquivo `.qwenignore` a qualquer momento. Para aplicar as alterações, você deve reiniciar sua sessão do Qwen Code.

## Como usar `.qwenignore`

| Etapa                  | Descrição                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Habilitar .qwenignore** | Crie um arquivo chamado `.qwenignore` no diretório raiz do seu projeto                 |
| **Adicionar regras de exclusão** | Abra o arquivo `.qwenignore` e adicione os caminhos a serem ignorados, exemplo: `/archive/` ou `apikeys.txt` |

### Exemplos de `.qwenignore`

Você pode usar `.qwenignore` para ignorar diretórios e arquivos:

```

# Excluir seu diretório /packages/ e todos os subdiretórios
/packages/

# Excluir seu arquivo apikeys.txt
apikeys.txt
```

Você pode usar curingas no seu arquivo `.qwenignore` com `*`:

```

# Excluir todos os arquivos .md
*.md
```

Finalmente, você pode excluir arquivos e diretórios da exclusão com `!`:

# Excluir todos os arquivos .md exceto README.md
*.md
!README.md
```

Para remover caminhos do seu arquivo `.qwenignore`, exclua as linhas relevantes.