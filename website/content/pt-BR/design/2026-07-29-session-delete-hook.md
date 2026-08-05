# Hook SessionDelete

## Objetivo

Notificar um hook do usuário depois que uma sessão explicitamente selecionada
for removida.

## Contrato

- `SessionDelete` roda depois que `SessionService.removeSession` ou
  `removeSessions` reporta que uma transcrição foi removida.
- O hook é fire-and-forget. Sua saída e falha não podem desfazer ou atrasar
  uma remoção concluída.
- O payload contém os campos de hook normais do runtime de hooks mais
  `deleted_session_id`. O runtime de hooks é dono da configuração de hooks; a
  sessão removida pode estar inativa e não tem runtime de hooks ao vivo.
- O fluxo interativo `/delete` e o método de extensão `deleteSession`
  explícito do ACP emitem o evento. Limpeza, rollback, arquivamento,
  fechamento e remoção em lote via REST do daemon não emitem.

## Justificativa

`SessionEnd` descreve o ciclo de vida de uma conversa ativa. A remoção
permanente é trabalho de ciclo de vida de armazenamento e pode mirar uma
transcrição inativa, então precisa de um evento e identificador separados.
Executá-lo apenas após o sucesso impede que hooks deixem fluxos de fechar-e-
remover parcialmente concluídos.

A remoção via REST do daemon não tem dono `Config` ou `HookSystem` no
processo que remove transcrições. Conectar esse caminho exigiria um contrato
explícito de execução de hooks de workspace, em vez de reconstruir os hooks em
memória de uma sessão removida. Está intencionalmente fora do escopo desta
mudança.
