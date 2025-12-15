# Checkpointing

O Qwen Code inclui um recurso de Checkpointing que salva automaticamente um snapshot do estado do seu projeto antes que quaisquer modificações de arquivo sejam feitas por ferramentas com inteligência artificial. Isso permite que você experimente e aplique alterações de código com segurança, sabendo que pode reverter instantaneamente para o estado anterior à execução da ferramenta.

## Como Funciona

Quando você aprova uma ferramenta que modifica o sistema de arquivos (como `write_file` ou `edit`), a CLI cria automaticamente um "ponto de restauração". Este ponto de restauração inclui:

1.  **Um Snapshot do Git:** Um commit é feito em um repositório Git especial e oculto localizado no seu diretório home (`~/.qwen/history/<project_hash>`). Esse snapshot captura o estado completo dos arquivos do seu projeto naquele momento. Ele **não** interfere no repositório Git do seu próprio projeto.
2.  **Histórico da Conversa:** Toda a conversa que você teve com o agente até aquele ponto é salva.
3.  **A Chamada da Ferramenta:** A chamada específica da ferramenta que estava prestes a ser executada também é armazenada.

Se você quiser desfazer a alteração ou simplesmente voltar, pode usar o comando `/restore`. Restaurar um ponto de restauração irá:

- Reverter todos os arquivos do seu projeto para o estado capturado no snapshot.
- Restaurar o histórico da conversa na CLI.
- Repropor a chamada original da ferramenta, permitindo que você a execute novamente, a modifique ou simplesmente a ignore.

Todos os dados do ponto de restauração, incluindo o snapshot do Git e o histórico da conversa, são armazenados localmente na sua máquina. O snapshot do Git é armazenado no repositório oculto, enquanto o histórico da conversa e as chamadas das ferramentas são salvos em um arquivo JSON no diretório temporário do seu projeto, geralmente localizado em `~/.qwen/tmp/<project_hash>/checkpoints`.

## Habilitando o Recurso

O recurso de Checkpointing vem desabilitado por padrão. Para habilitá-lo, você pode usar uma flag de linha de comando ou editar seu arquivo `settings.json`.

### Usando a Flag de Linha de Comando

Você pode habilitar o checkpointing para a sessão atual usando a flag `--checkpointing` ao iniciar o Qwen Code:

```bash
qwen --checkpointing
```

### Usando o Arquivo `settings.json`

Para habilitar o checkpointing por padrão em todas as sessões, você precisa editar seu arquivo `settings.json`.

Adicione a seguinte chave ao seu `settings.json`:

```json
{
  "general": {
    "checkpointing": {
      "enabled": true
    }
  }
}
```

## Usando o Comando `/restore`

Uma vez habilitado, os checkpoints são criados automaticamente. Para gerenciá-los, utilize o comando `/restore`.

### Listar Checkpoints Disponíveis

Para ver uma lista de todos os checkpoints salvos para o projeto atual, basta executar:

```
/restore
```

A CLI exibirá uma lista dos arquivos de checkpoint disponíveis. Esses nomes de arquivo são normalmente compostos por um carimbo de data/hora, o nome do arquivo que estava sendo modificado e o nome da ferramenta que estava prestes a ser executada (por exemplo, `2025-06-22T10-00-00_000Z-meu-arquivo.txt-write_file`).

### Restaurar um Checkpoint Específico

Para restaurar seu projeto a partir de um checkpoint específico, utilize o arquivo de checkpoint da lista:

```
/restore <checkpoint_file>
```

Por exemplo:

```
/restore 2025-06-22T10-00-00_000Z-meu-arquivo.txt-write_file
```

Após executar o comando, seus arquivos e conversa serão imediatamente restaurados ao estado em que estavam quando o checkpoint foi criado, e o prompt original da ferramenta reaparecerá.