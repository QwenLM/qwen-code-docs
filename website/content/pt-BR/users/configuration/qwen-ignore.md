# Ignorando Arquivos

Este documento fornece uma visão geral do recurso Qwen Ignore (`.qwenignore`) do Qwen Code.

O Qwen Code inclui a capacidade de ignorar arquivos automaticamente, semelhante ao `.gitignore` (usado pelo Git). Adicionar caminhos ao seu arquivo `.qwenignore` os excluirá das ferramentas que suportam este recurso, embora eles ainda sejam visíveis para outros serviços (como o Git).

## Como funciona

Quando você adiciona um caminho ao seu arquivo `.qwenignore`, as ferramentas que respeitam este arquivo irão excluir arquivos e diretórios correspondentes de suas operações. Por exemplo, quando você usa o comando [`read_many_files`](../../developers/tools/multi-file), quaisquer caminhos presentes no seu arquivo `.qwenignore` serão automaticamente excluídos.

Na maioria dos casos, o `.qwenignore` segue as convenções dos arquivos `.gitignore`:

- Linhas em branco e linhas iniciadas com `#` são ignoradas.
- Padrões glob comuns são suportados (como `*`, `?` e `[]`).
- Colocar uma `/` no final fará com que apenas diretórios sejam correspondidos.
- Colocar uma `/` no início fixa o caminho relativo ao arquivo `.qwenignore`.
- `!` nega um padrão.

Você pode atualizar seu arquivo `.qwenignore` a qualquer momento. Para aplicar as alterações, é necessário reiniciar sua sessão do Qwen Code.

## Como usar `.qwenignore`

| Passo                     | Descrição                                                    |
| ------------------------- | ------------------------------------------------------------ |
| **Habilitar .qwenignore** | Crie um arquivo chamado `.qwenignore` no diretório raiz do seu projeto |
| **Adicionar regras de ignorar** | Abra o arquivo `.qwenignore` e adicione caminhos para ignorar, exemplo: `/archive/` ou `apikeys.txt` |

### Exemplos de `.qwenignore`

Você pode usar `.qwenignore` para ignorar diretórios e arquivos:

```

# Exclui seu diretório /packages/ e todos os subdiretórios
/packages/

# Exclui seu arquivo apikeys.txt
apikeys.txt
```

Você pode usar curingas no seu arquivo `.qwenignore` com `*`:

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

Para remover caminhos do seu arquivo `.qwenignore`, exclua as linhas relevantes.