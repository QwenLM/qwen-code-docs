# Posicionamento de notificações de tarefa na transcrição

Conclusões de tarefa em segundo plano são entradas do modelo, não prompts
criados pelo usuário. O caminho ao vivo do daemon já as identifica com
`_meta.source = "background_notification"`, mas o replay de histórico
anteriormente projetava registros persistidos de notificação como mensagens
de usuário sem marcação.

O replay de histórico preservará o papel persistido de entrada do modelo
enquanto adiciona o mesmo marcador de source usado pelas notificações ao
vivo. O adaptador de transcrição do Web Shell mapeará esse source, vindo de
um chunk de usuário ou de assistente, para uma mensagem de sistema
informativa. Novos registros também persistem o status estruturado de tarefa
existente, de modo que mensagens ao vivo e reproduzidas usam o mesmo rótulo
de concluído, com falha ou cancelado; registros mais antigos fazem fallback
para um rótulo genérico de notificação. O conteúdo da notificação é
renderizado inalterado ao lado de um ícone de status semântico. Isso mantém
as notificações tanto ao vivo quanto reproduzidas visíveis à esquerda sem
alterar a semântica compartilhada de replay para outros consumidores.
