# Ignorando arquivos

Este documento fornece uma visão geral do recurso Qwen Ignore (`.qwenignore`) do Qwen Code.

O Qwen Code inclui a capacidade de ignorar arquivos automaticamente, de forma semelhante ao `.gitignore` (usado pelo Git). Adicionar caminhos ao seu arquivo `.qwenignore` os excluirá das ferramentas que suportam esse recurso, embora eles ainda permaneçam visíveis para outros serviços (como o Git).

## Como funciona

Quando você adiciona um caminho ao seu arquivo `.qwenignore`, as ferramentas que respeitam esse arquivo excluirão os arquivos e diretórios correspondentes de suas operações. Por exemplo, ao usar o comando [`read_many_files`](../../developers/tools/multi-file), todos os caminhos presentes no seu arquivo `.qwenignore` serão automaticamente excluídos.

Na maior parte, o `.qwenignore` segue as convenções dos arquivos `.gitignore`:

- Linhas em branco e linhas que começam com `#` são ignoradas.
- Padrões glob padrão são suportados (como `*`, `?` e `[]`).
- Colocar um `/` no final faz com que apenas diretórios sejam correspondidos.
- Colocar um `/` no início ancora o caminho em relação ao arquivo `.qwenignore`.
- O `!` nega um padrão.

Você pode atualizar seu arquivo `.qwenignore` a qualquer momento. Para aplicar as alterações, é necessário reiniciar sua sessão do Qwen Code.

## Como usar o `.qwenignore`

| Etapa                  | Descrição                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Ativar .qwenignore** | Crie um arquivo chamado `.qwenignore` no diretório raiz do seu projeto                 |
| **Adicionar regras**   | Abra o arquivo `.qwenignore` e adicione os caminhos a serem ignorados, exemplo: `/archive/` ou `apikeys.txt` |

### Exemplos de `.qwenignore`

Você pode usar o `.qwenignore` para ignorar diretórios e arquivos:

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

Você pode usar curingas no seu arquivo `.qwenignore` com `*`:

```
# Exclude all .md files
*.md
```

Por fim, você pode reverter a exclusão de arquivos e diretórios com `!`:

```
# Exclude all .md files except README.md
*.md
!README.md
```

Para remover caminhos do seu arquivo `.qwenignore`, exclua as linhas correspondentes.