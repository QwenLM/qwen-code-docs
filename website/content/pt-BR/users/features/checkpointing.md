---
description: "Aprenda Qwen Code Checkpointing para salvar e restaurar estados importantes em refatorações, experimentos e longas sessões de programação com IA."
---

# Checkpointing

O Qwen Code inclui um recurso de Checkpointing que salva automaticamente um snapshot do estado do seu projeto antes que qualquer modificação de arquivo seja feita por ferramentas com IA. Isso permite que você experimente e aplique alterações de código com segurança, sabendo que pode reverter instantaneamente para o estado anterior à execução da ferramenta.

## Como Funciona

Quando você aprova uma ferramenta que modifica o sistema de arquivos (como `write_file` ou `edit`), a CLI cria automaticamente um "checkpoint". Esse checkpoint inclui:

1.  **Um Snapshot Git:** Um commit é criado em um repositório Git especial e shadow localizado no seu diretório home (`~/.qwen/history/<project_hash>`). Esse snapshot captura o estado completo dos arquivos do seu projeto naquele momento. Ele **não** interfere no repositório Git do seu projeto.
2.  **Histórico de Conversa:** Toda a conversa que você teve com o agente até aquele ponto é salva.
3.  **A Chamada da Ferramenta:** A chamada específica da ferramenta que estava prestes a ser executada também é armazenada.

Se quiser desfazer a alteração ou simplesmente voltar, você pode usar o comando `/restore`. Restaurar um checkpoint irá:

- Reverter todos os arquivos do seu projeto para o estado capturado no snapshot.
- Restaurar o histórico de conversa na CLI.
- Reapresentar a chamada original da ferramenta, permitindo que você a execute novamente, a modifique ou simplesmente a ignore.

Todos os dados do checkpoint, incluindo o snapshot Git e o histórico de conversa, são armazenados localmente na sua máquina. O snapshot Git é armazenado no repositório shadow, enquanto o histórico de conversa e as chamadas de ferramenta são salvos em um arquivo JSON no diretório temporário do seu projeto, normalmente localizado em `~/.qwen/tmp/<project_hash>/checkpoints`.

## Habilitando o Recurso

O recurso de Checkpointing está desabilitado por padrão. Para habilitá-lo, você pode usar uma flag de linha de comando ou editar seu arquivo `settings.json`.

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

Uma vez habilitado, os checkpoints são criados automaticamente. Para gerenciá-los, use o comando `/restore`.

### Listando Checkpoints Disponíveis

Para ver uma lista de todos os checkpoints salvos para o projeto atual, basta executar:

```
/restore
```

A CLI exibirá uma lista de arquivos de checkpoint disponíveis. Esses nomes de arquivo geralmente são compostos por um timestamp, o nome do arquivo que está sendo modificado e o nome da ferramenta que estava prestes a ser executada (por exemplo, `2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Restaurando um Checkpoint Específico

Para restaurar seu projeto para um checkpoint específico, use o arquivo de checkpoint da lista:

```
/restore <checkpoint_file>
```

Por exemplo:

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

Após executar o comando, seus arquivos e a conversa serão restaurados imediatamente para o estado em que estavam quando o checkpoint foi criado, e o prompt original da ferramenta será exibido novamente.