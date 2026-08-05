# Restauração de Roster de Agentes em Background

## Contexto

Sidecars de agentes em background e transcrições JSONL persistem a identidade
lógica e o histórico, enquanto o `BackgroundTaskRegistry` indexa as tarefas
endereçáveis da sessão atual. O carregador de retomada atualmente restaura
apenas sidecars deixados no estado `running`. Agentes concluídos, portanto,
desaparecem do registry depois que sua sessão pai é restaurada, mesmo com suas
transcrições permanecendo disponíveis. O modelo também não tem nenhuma
ferramenta para consultar o registry.

## Objetivos

- Restaurar agentes em background concluídos recentes com seus IDs de tarefa
  originais.
- Adicionar uma ferramenta `list_agents` chamável pelo modelo para descoberta
  sob demanda.
- Manter `send_message(task_id)` como a operação de continuação.
- Dar ao modelo um lembrete curto e único após a restauração.
- Aplicar o mesmo comportamento de restauração aos pontos de entrada TUI,
  headless e ACP.

## Não objetivos

- Persistir um runtime JavaScript ao vivo através do encerramento do processo.
- Substituir a ferramenta `task_list` do Agent Teams.
- Restaurar agentes com falha ou cancelados.
- Reconstruir isolamento de worktree temporário.

## Design

A varredura do diretório de sessão aceita sidecars tanto `running` quanto
`completed`. Entradas em execução tornam-se pausadas, preservando o
comportamento existente de trabalho interrompido. Entradas concluídas
permanecem concluídas, são marcadas como já notificadas e retêm os caminhos de
transcrição e metadados necessários para a revivificação via `send_message`.

Novos sidecars persistem se o lançamento original foi em background. Entradas
concluídas são restauradas apenas quando esse marcador é explicitamente
verdadeiro, então sidecars concluídos de foreground e legados sem marcador não
são expostos como agentes em background reutilizáveis. Sidecars legados em
execução mantêm o comportamento de recuperação existente.

O carregador verifica o nome de arquivo do sidecar e o dono da sessão pai antes
do registro. Uma linha retida com transcrição ausente, identidade de
transcrição divergente, isolamento incompatível ou diretório de trabalho
conflitante permanece visível, mas é marcada como não continuável. Linhas
isoladas por worktree são tratadas da mesma forma porque seu contexto de posse
temporário não pode ser reconstruído com segurança. Apenas as entradas
concluídas retidas mais novas são restauradas; entradas em execução não estão
sujeitas a esse limite.

`list_agents` lê o registry ao vivo e retorna agentes em background com um
`task_id` estável, descrição, tipo, status, capacidade de continuação e
qualquer motivo de bloqueio. Ele não varre o disco. A ferramenta pertence ao
chamador e é excluída de subagentes e teammates.

Após a restauração, o próximo prompt comum de usuário de nível superior recebe
um único lembrete de sistema para chamar `list_agents` e depois `send_message`.
Comandos slash e continuações de turno interrompido não consomem esse lembrete.
O modo bare não o recebe.

Trocas de sessão limpam o registry em memória antes de carregar um novo roster.
O rollback de retomada com falha limpa entradas parcialmente restauradas antes
de restaurar a sessão antiga, e o branch é bloqueado enquanto trabalho em
background ainda está ativo.

## Validação

- Sidecars em execução e concluídos são restaurados com IDs estáveis e estados
  corretos.
- Sidecars de foreground e com dono errado são excluídos.
- Estado retido inseguro é visível, mas não pode ser continuado.
- Entradas concluídas restauradas não emitem notificações de conclusão
  duplicadas.
- `send_message` consegue reviver uma entrada concluída restaurada compatível.
- TUI, headless e ACP restauram o roster e entregam o lembrete uma única vez.
- Caminhos de novo, limpar, branch e retomada com falha não vazam um roster
  anterior.
