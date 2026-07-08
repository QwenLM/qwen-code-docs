# Persistência de Snapshot do Histórico de Arquivos

## Resumo

Esta alteração fecha as lacunas de persistência A+C para o histórico de arquivos do `/rewind` sem alterar o esquema JSONL persistido.

Os registros `file_history_snapshot` continuam sendo registros de sistema apenas para adição (append-only). A retomada reconstrói o histórico de arquivos lendo todos os registros de snapshot no histórico linear e deduplicando por `promptId` com a semântica last-wins. Isso significa que um snapshot atualizado para o mesmo prompt pode ser adicionado posteriormente sem reescrever os logs antigos.

## Registro de Atualização de Snapshot

`makeSnapshot(promptId)` ainda cria o snapshot no limite do turno e o chamador ainda o registra explicitamente. O caso ausente do último turno é tratado fornecendo ao `FileHistoryService` um callback opcional de registro. Quando `trackEdit(filePath)` adiciona com sucesso um novo backup ao snapshot mais recente, ou corrige uma entrada de backup com falha nesse snapshot, ele invoca o registrador com o snapshot atualizado.

Chamadas duplicadas de `trackEdit` para um arquivo já capturado e sem falhas não são registradas novamente porque o snapshot não foi alterado.

Erros do registrador são ignorados e registrados em log. A edição de arquivos deve permanecer como best-effort: a persistência do histórico de arquivos não deve causar falha nas ferramentas de edição ou gravação.

## Formato de Persistência

Nenhuma versão de esquema é adicionada. O payload existente já possui estrutura suficiente para reconstrução com compatibilidade com versões anteriores:

```json
{
  "type": "system",
  "subtype": "file_history_snapshot",
  "systemPayload": {
    "snapshots": []
  }
}
```

Logs antigos sem esses registros ainda são retomados sem o estado do histórico de arquivos. Registros de snapshot malformados são ignorados com um aviso, e registros válidos posteriores permanecem utilizáveis.

Nenhuma flag explícita `isSnapshotUpdate` é adicionada. Adicionar outro registro `file_history_snapshot` com o mesmo `promptId` tem o mesmo comportamento prático porque `SessionService.loadSession()` já aplica a deduplicação last-wins por `promptId`.

## Escopo

Isso é apenas A+C.

A cobertura simulada de `sed -i` do B1 é deixada para um PR separado. O rastreamento genérico de edição de shell, o limite de concorrência de `getDiffStats` e os motivos de falha por arquivo também são adiados. O Claude Code não suporta esses comportamentos hoje, então o qwen-code não deve adicioná-los como parte desta passagem de compatibilidade.

Nenhuma migração é necessária porque o formato do registro persistido não foi alterado.