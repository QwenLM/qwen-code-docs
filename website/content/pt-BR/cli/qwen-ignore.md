# Ignorando Arquivos

Este documento fornece uma visão geral do recurso Qwen Ignore (`.qwenignore`) do Qwen Code.

O Qwen Code inclui a capacidade de ignorar arquivos automaticamente, similar ao `.gitignore` (usado pelo Git). Adicionar caminhos ao seu arquivo `.qwenignore` irá excluí-los das ferramentas que suportam este recurso, embora eles ainda sejam visíveis para outros serviços (como o Git).

## Como funciona

Quando você adiciona um caminho ao seu arquivo `.qwenignore`, as ferramentas que respeitam esse arquivo vão excluir arquivos e diretórios correspondentes de suas operações. Por exemplo, quando você usa o comando [`read_many_files`](./tools/multi-file.md), todos os caminhos listados no seu arquivo `.qwenignore` serão automaticamente ignorados.

Na maioria dos casos, o `.qwenignore` segue as mesmas convenções do `.gitignore`:

- Linhas em branco e linhas que começam com `#` são ignoradas.
- Padrões glob comuns são suportados (como `*`, `?` e `[]`).
- Colocar uma `/` no final faz com que o padrão corresponda apenas a diretórios.
- Colocar uma `/` no início fixa o caminho relativamente ao arquivo `.qwenignore`.
- O caractere `!` nega um padrão.

Você pode atualizar seu arquivo `.qwenignore` a qualquer momento. Para aplicar as mudanças, é necessário reiniciar sua sessão do Qwen Code.

## Como usar `.qwenignore`

Para habilitar `.qwenignore`:

1. Crie um arquivo chamado `.qwenignore` na raiz do diretório do seu projeto.

Para adicionar um arquivo ou diretório ao `.qwenignore`:

1. Abra seu arquivo `.qwenignore`.
2. Adicione o caminho ou arquivo que você deseja ignorar, por exemplo: `/archive/` ou `apikeys.txt`.

### Exemplos de `.qwenignore`

Você pode usar `.qwenignore` para ignorar diretórios e arquivos:

```

# Exclui seu diretório /packages/ e todos os subdiretórios
/packages/

# Exclui seu arquivo apikeys.txt
apikeys.txt
```

Você pode usar wildcards no seu arquivo `.qwenignore` com `*`:

```

# Exclui todos os arquivos .md
*.md
```

Por fim, você pode excluir arquivos e diretórios da exclusão com `!`:

```

# Exclui todos os arquivos .md exceto README.md
*.md
!README.md
```

Para remover caminhos do seu arquivo `.qwenignore`, delete as linhas relevantes.