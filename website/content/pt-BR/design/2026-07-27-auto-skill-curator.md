# Curador Automático de Skills

## Problema

O Qwen Code pode extrair skills de projeto reutilizáveis de conversas com uso
intenso de ferramentas, mas auto-skills aceitas apenas se acumulam. O agente
de revisão existente pode criar ou atualizar skills com
`source: auto-skill` e é explicitamente proibido de removê-las. Gating por
caminho e `skills.disabled` reduzem ruído no prompt, mas não mantêm a
biblioteca em disco.

## Escopo

Adicionar um pequeno gerenciador de ciclo de vida determinístico para
auto-skills de projeto:

- Rastrear invocações bem-sucedidas de skills de projeto cujo diretório começa
  com `auto-skill-` e cujo frontmatter contém `source: auto-skill`.
- Marcar uma skill gerenciada como obsoleta (stale) após 30 dias sem
  atividade.
- Arquivá-la após 90 dias sem atividade movendo seu diretório inteiro para
  fora de `.qwen/skills/`, para `.qwen/archived-skills/`.
- Permitir que skills gerenciadas individuais sejam fixadas (pinned) fora das
  transições automáticas.
- Executar o passe determinístico no máximo uma vez a cada 7 dias durante a
  inicialização da configuração quando Auto Skill está habilitado e o
  workspace é confiável.
- Expor `/curator`, `/curator status`, `/curator run [--dry-run]` e
  `/curator pin|unpin|restore <directory>` nas superfícies de comando
  interativa, não interativa e ACP.

Esta primeira versão não usa um LLM, não consolida skills sobrepostas, não
gerencia skills pessoais/bundled/de extensão/aprendidas/criadas manualmente,
não remove nada permanentemente e não introduz thresholds configuráveis.

## Posse e persistência

O curador é resolvido apenas a partir de `Config.getProjectRoot()`. Seu estado
fica em `<project>/.qwen/skill-curator.json`, e pacotes arquivados ficam em
`<project>/.qwen/archived-skills/`. Não há fallback para o workspace
primário do processo, diretório home ou outra sessão ativa. Isso mantém
sessões de daemon e multi-workspace isoladas.

O estado é indexado pelo nome do diretório da auto-skill porque essa é a
unidade movida para dentro e para fora do arquivo. Cada registro armazena o
nome da skill do frontmatter, hora da primeira observação, último uso
bem-sucedido, contagem de uso, estado de ciclo de vida, estado de fixação e
hora opcional de arquivamento. Escritas são serializadas com um lock
entre processos e commitadas atomicamente.

Estado corrompido é uma falha dura, sem mutação. O curador não deve inferir
que uso ausente significa inatividade quando sua evidência persistida não
pode ser lida.

## Elegibilidade e segurança

Um diretório é gerenciado pelo curador somente quando todas as condições são
verdadeiras:

1. É um diretório direto, não symlink, sob a raiz de skills do projeto.
2. Seu nome começa com `auto-skill-`.
3. Contém um `SKILL.md` regular, não symlink.
4. O frontmatter YAML de abertura contém exatamente `source: auto-skill`.

Esse marcador duplo impede o curador de mover conteúdo criado manualmente,
aprendido, de extensão, bundled, pessoal, malformado ou ligado via symlink.
Arquivar e restaurar nunca sobrescrevem uma skill existente. Uma colisão de
destino pula apenas aquele pacote para que manutenção não relacionada possa
continuar. Nomes de diretórios arquivados são mostrados como reservados no
prompt de revisão e rejeitados pelo seu guard de permissão de escrita,
enquanto o staging de confirmação ainda faz snapshot apenas das skills ativas.
Se a persistência de estado falhar após movimentações, o passe tenta mover
cada pacote de volta antes de reportar o erro.

Status somente leitura e previews de dry-run permanecem disponíveis em modo
seguro e workspaces não confiáveis. Aplicar um passe de manutenção, fixar,
desafixar e restaurar exigem um workspace confiável fora do modo seguro.

## Atividade e transições

Uma invocação bem-sucedida da ferramenta Skill ou de comando slash direto de
skill atualiza best-effort um registro de auto-skill elegível, mesmo enquanto
a geração automática de skills está desabilitada. Isso mantém a atividade
observada independente do interruptor que controla geração e manutenção
agendada. Invocações falhas, com skill desabilitada ou bloqueadas por hook
não contam.

Para uma skill ativa, a atividade é a mais recente entre:

- a última invocação bem-sucedida persistida;
- a hora persistida da primeira observação;
- a hora persistida de restauração; e
- a hora de modificação do manifesto da skill.

Incluir a hora de modificação impede que uma skill aprimorada recentemente
seja arquivada meramente porque ainda não foi invocada de novo.

A primeira observação de cada skill elegível semeia `firstSeenAt = now` em vez
de inferir inatividade de um timestamp antigo do sistema de arquivos. A
primeira observação automática também semeia `lastRunAt` e então espera um
intervalo completo de 7 dias. Um `/curator run` explícito contorna o intervalo
mas preserva a carência de primeira observação por skill; `--dry-run` reporta
os mesmos candidatos de semeio e transição sem mover diretórios ou mudar
estado. Registros fixados contornam transições de obsoleto e arquivamento até
serem explicitamente desafixados.

## Pontos de integração

- `Config.initialize`: executa o passe determinístico devido antes de
  `SkillManager` escanear o sistema de arquivos.
- `SkillTool`: registra uma invocação bem-sucedida de skill gerenciada.
- `SkillCommandLoader` e os processadores de comando interativo/não
  interativo: registram invocações diretas bem-sucedidas de comando slash; o
  ACP reutiliza o processador não interativo.
- `SkillManager`: seu caminho de refresh existente é usado após arquivamento
  ou restauração manual para que as superfícies de modelo e comando slash
  correspondam imediatamente ao disco.
- `BuiltinCommandLoader`: publica o novo comando `/curator`.

Nenhum outro consumidor deve escrever estado do curador ou mover pacotes de
skill gerenciados.

## Verificação

Testes unitários cobrem elegibilidade, semeio de primeira execução,
thresholds de obsoleto/arquivamento, não mutação em dry-run, proteção de uso
recente, proteção de modificação recente, comportamento fail closed para
estado corrompido, tratamento de colisão, restauração e a superfície de
comando. Testes existentes da ferramenta Skill verificam que apenas
carregamentos bem-sucedidos registram uso. Build e typecheck cobrem a
exportação entre pacotes e o registro de comando.
