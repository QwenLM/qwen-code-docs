# Ignorando Arquivos

Este documento fornece uma visão geral do recurso Qwen Ignore (`.qwenignore`) do Qwen Code.

O Qwen Code inclui a capacidade de ignorar arquivos automaticamente, de forma semelhante ao `.gitignore` (usado pelo Git). Adicionar caminhos ao seu arquivo `.qwenignore` os exclui das ferramentas que dão suporte a esse recurso, embora eles ainda sejam visíveis para outros serviços (como o Git).

## Como funciona

Quando você adiciona um caminho ao seu arquivo `.qwenignore`, ferramentas que respeitam esse arquivo excluirão automaticamente os arquivos e diretórios correspondentes de suas operações. Por exemplo, ao usar o comando [`read_many_files`](../../developers/tools/multi-file), todos os caminhos listados no seu arquivo `.qwenignore` serão automaticamente ignorados.

Na maior parte, o `.qwenignore` segue as convenções dos arquivos `.gitignore`:

- Linhas em branco e linhas que começam com `#` são ignoradas.
- Padrões glob padrão são suportados (como `*`, `?` e `[]`).
- Colocar uma `/` no final corresponde apenas a diretórios.
- Colocar uma `/` no início fixa o caminho relativamente ao arquivo `.qwenignore`.
- O caractere `!` nega um padrão.

Você pode atualizar seu arquivo `.qwenignore` a qualquer momento. Para aplicar as alterações, é necessário reiniciar sua sessão do Qwen Code.

## Como usar o `.qwenignore`

| Etapa                   | Descrição                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| **Habilitar o .qwenignore** | Crie um arquivo chamado `.qwenignore` no diretório raiz do seu projeto                         |
| **Adicionar regras de exclusão** | Abra o arquivo `.qwenignore` e adicione os caminhos a serem ignorados, por exemplo: `/archive/` ou `apikeys.txt` |

### Exemplos de `.qwenignore`

Você pode usar o `.qwenignore` para ignorar diretórios e arquivos:

```
# Ignorar o diretório /packages/ e todos os seus subdiretórios
/packages/

# Ignorar o arquivo apikeys.txt
apikeys.txt
```

Você pode usar curingas no seu arquivo `.qwenignore` com o caractere `*`:

```
# Ignorar todos os arquivos .md
*.md
```

Por fim, você pode incluir novamente arquivos e diretórios excluídos anteriormente usando o caractere `!`:

```
# Excluir todos os arquivos .md, exceto README.md
*.md
!README.md
```

Para remover caminhos do seu arquivo `.qwenignore`, exclua as linhas relevantes.