# Um Skill Autofix Único para Execuções Locais e de CI

## Contexto

O Qwen Code já tem um skill Autofix pertencente ao repositório usado pelo
GitHub Actions. Ele contém triagem de feedback de review e regras de
verificação, enquanto o workflow possui agendamento, filtragem de confiança,
credenciais, gravações no GitHub e orçamentos de rodada.

O Autofix local deve reutilizar esse skill em vez de adicionar um skill
empacotado ou um segundo motor de manutenção. Sua entrada é a árvore de
trabalho atual, não um pull request remoto: alterações staged, unstaged e
untracked são revisadas juntas.

## Design

O `.qwen/skills/autofix/SKILL.md` existente permanece o único skill Autofix.
Ele tem dois caminhos de entrada:

- Uma invocação direta de `/autofix` revisa e corrige a árvore de trabalho
  atual de forma síncrona.
- O runner existente do Actions fornece um de `assess-candidates`,
  `develop-issue` ou `address-review` mais arquivos confiáveis preparados
  pelo workflow.

O caminho local executa repetidamente o comando de review legível por máquina
existente:

```bash
env -u SANDBOX QWEN_SANDBOX=true "${QWEN_CODE_CLI:-qwen}" review run --approval-mode auto --effort high --json --quiet
```

O comando executa como um shell gerenciado em segundo plano para que o seu
próprio timeout, em vez do limite mais curto da ferramenta de primeiro plano,
permaneça autoritativo. O Autofix ainda espera por ele de forma síncrona: a
TUI interativa retoma a partir da notificação de tarefa do terminal, enquanto
sessões ACP, stream-json e headless inspecionam o sidecar de status com uma
cadência limitada e crescente. Fingerprints da árvore de trabalho em torno do
review e imediatamente antes da convergência tornam qualquer efeito colateral
do review ou edição concorrente um resultado `BLOCKED` visível.

O review headless aninhado usa o modo de aprovação Auto dentro do sandbox do
Qwen. O Autofix limpa um marcador `SANDBOX` herdado antes da inicialização
para que ele não possa contornar a contenção; um classificador de aprovação ou
sandbox indisponível produz um review incompleto e falha fail closed. Antes do
lançamento, o Autofix explica que o review pode executar verificações
definidas pelo repositório em um processo em sandbox que retém credenciais do
modelo e acesso de rede, então requer confirmação explícita de que o usuário
confia no repositório. Se existirem arquivos untracked e não ignorados, o
Autofix também os lista antes que seu conteúdo entre no contexto do modelo de
review. Execuções não interativas param com `BLOCKED` quando a confirmação não
está disponível. No Windows, o Autofix local requer Git Bash/MSYS porque o
fluxo de review empacotado usa sintaxe de shell POSIX; cmd.exe e PowerShell
nativos falham fail closed antes de o review iniciar.

Após cada review completo, o Autofix lê o relatório emitido, verifica toda
descoberta contra o código, aplica um lote de correção mínimo e coerente,
executa as verificações relevantes mais estreitas e revisa a árvore de
trabalho resultante novamente. Ele não faz polling do GitHub nem usa `/loop`.

Não há contagem fixa de rodadas locais. O processo para com evidência:

- `NO_CHANGES`: a árvore de trabalho estava limpa antes do review.
- `CONVERGED`: um review completo sem limite não tem descobertas acionáveis e
  todas as verificações necessárias passam.
- `BLOCKED`: a evidência do review está incompleta, uma verificação necessária
  não tem correção segura no escopo ou uma decisão de mantenedor/produto é
  necessária.
- `STALLED`: a mesma descoberta acionável sobrevive sem uma nova hipótese,
  nenhum progresso na árvore de trabalho é feito ou as mudanças oscilam.

O Autofix local nunca faz stage, commit, push, reescreve histórico, muda o
índice ou grava no GitHub. O estado staged existente do usuário permanece
intacto; as correções são deixadas como mudanças na árvore de trabalho para
inspeção.

## Fronteira do workflow

O GitHub Actions mantém toda a política determinística: gatilhos, autorização,
checkout, seleção de feedback confiável, retry e orçamentos de rodada, marcas
d'água, commits, pushes, comentários e gates finais. Apenas a política de
decisão do modelo pertence ao skill. Em particular, o workflow pode marcar
feedback como adiado enquanto o skill decide como um agente deve tratar essa
seção.

## Alternativas rejeitadas

- Um skill Autofix empacotado colidiria com o skill do repositório e dividiria
  o contrato do modelo.
- `on`, `off` ou `status` controlariam o workflow remoto em vez de corrigir
  mudanças locais.
- Um novo watcher, agendador ou máquina de estados de runtime duplica a
  infraestrutura existente de review e do Actions.
- Um limite fixo de rodadas locais pode interromper um reparo em progresso;
  condições de parada baseadas em progresso limitam execuções que não
  convergem sem impor um total arbitrário.
