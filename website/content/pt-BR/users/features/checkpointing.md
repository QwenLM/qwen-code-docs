# Salvamento de Ponto de Verificação (Checkpointing)

O Qwen Code inclui um recurso de salvamento de ponto de verificação (checkpointing) que salva automaticamente uma captura de estado do seu projeto antes de quaisquer modificações de arquivos feitas por ferramentas com IA. Isso permite que você experimente e aplique alterações no código com segurança, sabendo que pode reverter imediatamente ao estado anterior à execução da ferramenta.

## Como Funciona

Quando você aprova uma ferramenta que modifica o sistema de arquivos (como `write_file` ou `edit`), a CLI cria automaticamente um “ponto de verificação” (*checkpoint*). Esse ponto de verificação inclui:

1.  **Um Instantâneo do Git:** Um *commit* é feito em um repositório Git especial e oculto localizado no seu diretório pessoal (`~/.qwen/history/<project_hash>`). Esse instantâneo captura o estado completo dos arquivos do seu projeto naquele momento. Ele **não interfere** com o repositório Git do seu próprio projeto.
2.  **Histórico da Conversa:** Toda a conversa que você teve com o agente até aquele ponto é salva.
3.  **Chamada da Ferramenta:** A chamada específica da ferramenta que estava prestes a ser executada também é armazenada.

Se você quiser desfazer a alteração ou simplesmente voltar ao estado anterior, pode usar o comando `/restore`. Restaurar um ponto de verificação fará o seguinte:

- Reverterá todos os arquivos do seu projeto para o estado capturado no instantâneo.
- Restaurará o histórico da conversa na CLI.
- Reapresentará a chamada original da ferramenta, permitindo que você a execute novamente, a modifique ou simplesmente a ignore.

Todos os dados dos pontos de verificação — incluindo o instantâneo do Git e o histórico da conversa — são armazenados localmente na sua máquina. O instantâneo do Git é armazenado no repositório oculto, enquanto o histórico da conversa e as chamadas das ferramentas são salvos em um arquivo JSON no diretório temporário do seu projeto, normalmente localizado em `~/.qwen/tmp/<project_hash>/checkpoints`.

## Habilitando o Recurso

O recurso de *checkpointing* está desabilitado por padrão. Para habilitá-lo, você pode usar uma *flag* de linha de comando ou editar seu arquivo `settings.json`.

### Usando a *Flag* de Linha de Comando

Você pode habilitar o *checkpointing* para a sessão atual usando a *flag* `--checkpointing` ao iniciar o Qwen Code:

```bash
qwen --checkpointing
```

### Usando o Arquivo `settings.json`

Para habilitar o *checkpointing* por padrão em todas as sessões, você precisa editar seu arquivo `settings.json`.

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

Uma vez habilitado, os *checkpoints* são criados automaticamente. Para gerenciá-los, use o comando `/restore`.

### Listar Pontos de Verificação Disponíveis

Para ver uma lista de todos os pontos de verificação salvos para o projeto atual, basta executar:

```
/restore
```

A CLI exibirá uma lista dos arquivos de ponto de verificação disponíveis. Esses nomes de arquivo normalmente são compostos por um carimbo de data/hora, o nome do arquivo que estava sendo modificado e o nome da ferramenta que estava prestes a ser executada (por exemplo: `2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Restaurar um Ponto de Verificação Específico

Para restaurar seu projeto para um ponto de verificação específico, use o arquivo de ponto de verificação da lista:

```
/restore <nome_do_arquivo_de_ponto_de_verificação>
```

Por exemplo:

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

Após executar o comando, seus arquivos e conversa serão restaurados imediatamente ao estado em que estavam no momento da criação do ponto de verificação, e o prompt original da ferramenta reaparecerá.