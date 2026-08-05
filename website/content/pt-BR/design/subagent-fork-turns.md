# `fork_turns` do subagente fork

## Resumo

Adicionar um parâmetro opcional `fork_turns` ao runtime destacado existente
`subagent_type: "fork"` da ferramenta Agent. Um fork continua herdando a
conversa completa do pai quando o parâmetro é omitido. Os chamadores podem
usar explicitamente:

- `all` para a conversa completa do pai, ou
- uma string de inteiro positivo como `"3"` para os três turnos de usuário
  reais mais recentes.

Subagentes comuns e teammates nomeados não aceitam `fork_turns` e continuam
iniciando sem histórico de conversa do pai.

## Objetivos

- Preservar o comportamento existente de histórico completo para chamadas de
  fork que omitem o parâmetro.
- Permitir que os chamadores limitem o histórico herdado de um fork sem
  alterar seu prompt do sistema, ferramentas, modelo, modo de aprovação,
  diretório de trabalho ou ciclo de vida destacado.
- Contar turnos de usuário reais em vez de mensagens brutas de API.
  Respostas de ferramenta e lembretes puramente de sistema não consomem a
  contagem de turnos requisitada.
- Manter o histórico de fork selecionado isolado de partes mutáveis de
  mensagens do pai.

## Não-objetivos

- Adicionar herança de contexto a subagentes especializados comuns ou
  teammates de equipe de agentes.
- Adicionar um modo de fork sem histórico. Chamadores que não querem o
  contexto do pai devem iniciar um subagente comum.
- Alterar disponibilidade de fork, regras de aninhamento, execução em segundo
  plano, recuperação de transcrição ou reutilização do prompt do sistema e
  das declarações de ferramenta do pai.

## Design

### Parâmetro e validação

`AgentParams.fork_turns` é opcional. O schema JSON aceita `all` ou uma string
correspondendo a `^[1-9][0-9]*$`. A omissão é normalizada para `all`,
preservando o comportamento existente do fork.

Fornecer `fork_turns` com qualquer tipo de subagente que não seja fork, sem
tipo de subagente explícito, ou ao iniciar um teammate nomeado é rejeitado.
`none`, zero, números negativos, decimais, valores com espaços em branco ao
redor e valores que não são string são rejeitados.

### Seleção do histórico

`all` usa o mesmo histórico curado do pai que o runtime de fork existente.

Para um valor numérico, o chat do pai remove seu contexto de inicialização
inicial antes de curar o histórico da conversa. Isso evita que a curadoria
coalesça o lembrete de inicialização com o primeiro prompt de usuário real. O
prefixo de inicialização original é então anexado à frente da janela
selecionada, de modo que o fork mantém o contexto de ambiente do pai.

Um turno de usuário real é uma mensagem de papel de usuário contendo conteúdo
que não seja respostas de função, texto vazio ou lembretes puramente de
sistema. A fatia selecionada começa no N-ésimo turno de usuário real mais
recente e inclui mensagens subsequentes do modelo, chamadas de ferramenta,
respostas de ferramenta e lembretes. Se existirem menos de N turnos reais,
todos os turnos reais disponíveis são selecionados.

Um resumo de histórico compactado é um prefixo sintético e não é incluído em
uma janela numérica; os chamadores devem usar `all` quando o fork precisa do
resumo compactado. O histórico final selecionado é clonado em profundidade,
de modo que fork e pai não compartilham partes aninhadas mutáveis de
mensagens.

A construção de fork existente ainda repara a fronteira final antes de enviar
a diretiva. Ela descarta uma mensagem final de usuário sem resposta e fecha
uma chamada de função do modelo aberta com respostas de espaço reservado
quando necessário.

## Revivificação em segundo plano

As mensagens iniciais selecionadas continuam usando o registro de bootstrap
de fork existente. A recuperação de transcrição portanto revivifica um fork
de histórico limitado com o mesmo histórico selecionado, instrução de sistema
do momento da inicialização, ferramentas e prompt de tarefa de sua execução
original.

## Compatibilidade e riscos

Chamadas de fork existentes permanecem como forks de histórico completo,
porque a omissão tem como padrão `all`. Chamadas existentes de subagente
comum e de teammate permanecem isoladas. Uma janela numérica pode omitir
fatos mais antigos ou resumos compactados, então a diretiva deve repetir
qualquer contexto mais antigo de que o fork ainda precise. Ela também
encurta o prefixo reutilizável do cache de histórico de conversa, enquanto o
prompt do sistema do pai, as ferramentas e o contexto de inicialização
permanecem compartilhados.
