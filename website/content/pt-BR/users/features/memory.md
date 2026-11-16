# Memória

Cada sessão do Qwen Code começa com uma janela de contexto nova. Três mecanismos transportam o conhecimento entre as sessões para que você não precise se explicar novamente todas as vezes:

- **QWEN.md** — instruções que _você_ escreve uma vez e o Qwen lê em cada sessão
- **Auto-memory** — notas que o próprio Qwen escreve com base no que aprende sobre você
- **Memória externa (`context_search`)** — uma ferramenta MCP opcional que o Qwen chama sob demanda para pesquisar no Mem0 ou em um índice de sessão local

---

## QWEN.md: suas instruções para o Qwen

O QWEN.md é um arquivo de texto simples onde você escreve coisas que o Qwen deve sempre saber sobre o seu projeto ou suas preferências. Pense nele como um briefing permanente que é carregado no início de cada conversa.

### O que colocar no QWEN.md

Adicione coisas que, de outra forma, você teria que repetir em todas as sessões:

- Comandos de build e teste (`npm run test`, `make build`)
- Convenções de código que sua equipe segue ("todos os novos arquivos devem ter comentários JSDoc")
- Decisões de arquitetura ("usamos o padrão repository, nunca chamamos o banco de dados diretamente dos controllers")
- Preferências pessoais ("sempre use pnpm, não npm")
- Uma política de verificação para trabalho de alto risco — por exemplo, "verifique no banco de dados antes de concluir" (veja [Enforce evidence-based conclusions](../common-workflow.md#enforce-evidence-based-conclusions) para um modelo pronto)

Não inclua coisas que o Qwen pode descobrir lendo o seu código. O QWEN.md funciona melhor quando é curto e específico — quanto maior ele fica, menos confiavelmente o Qwen o segue.

### Onde criar o QWEN.md

| Arquivo | A quem se aplica |
| ----------------------------- | ------------------------------------------------ |
| `~/.qwen/QWEN.md`             | Você, em todos os seus projetos                    |
| `QWEN.md` na raiz do projeto | Toda a sua equipe (faça commit no controle de versão)    |
| `.qwen/QWEN.local.md`         | Apenas você, apenas neste projeto (mantenha fora do git) |

Você pode ter qualquer combinação deles. O Qwen carrega todos quando você inicia uma sessão.

Se o seu repositório já tiver um arquivo `AGENTS.md` para outras ferramentas de IA, o Qwen também o lê. Não há necessidade de duplicar instruções.

#### Quando usar o `.qwen/QWEN.local.md`

Use-o para instruções **específicas do projeto, mas pessoais** — coisas que pertencem a este projeto, mas não devem ser compartilhadas com a equipe:

- Seu próprio ID de cluster, namespace do registro de contêineres ou conta em nuvem
- Um comando de debug pessoal que faz hardcode do seu ambiente local
- Notas que você quer que o Qwen saiba sobre o seu trabalho em andamento, mas sem dar commit

Ele é carregado **depois** do `QWEN.md` compartilhado do projeto, então suas instruções locais podem complementar ou sobrescrever as da equipe.

**Você mesmo deve adicionar ao .gitignore.** Embora o `.qwen/` seja frequentemente tratado como um diretório local, o qwen-code não gera um `.gitignore` para você, e alguns projetos dão commit em `.qwen/settings.json`. Adicione esta linha ao seu `.gitignore` (ou ao seu git ignore global):

```
.qwen/QWEN.local.md
```

### Gerar um automaticamente com `/init`

Execute `/init` e o Qwen analisará sua base de código para criar um QWEN.md inicial com comandos de build, instruções de teste e convenções que ele encontrar. Se já existir um, ele sugerirá adições em vez de sobrescrever.

### Referenciar outros arquivos

Você pode apontar o QWEN.md para outros arquivos para que o Qwen também os leia:

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Use `@path/to/file` em qualquer lugar do QWEN.md. Caminhos relativos são resolvidos a partir do próprio arquivo QWEN.md.

---

## Auto-memory: o que o Qwen aprende sobre você

A Auto-memory é executada em segundo plano. Após cada uma das suas conversas, o Qwen salva silenciosamente coisas úteis que aprendeu — suas preferências, feedback que você deu, contexto do projeto — para que possa usá-las em sessões futuras sem que você precise se repetir.

Isso é diferente do QWEN.md: você não o escreve, o Qwen escreve.

Quando um turno que responde a uma mensagem retransmitida por um [canal](./channels/overview) — GitHub, Telegram, DingTalk e os outros — termina, o Qwen não executa extração e não agenda nenhuma [limpeza periódica](#limpeza-periódica): o remetente frequentemente não é você, e extrair após cada mensagem retransmitida adicionaria chamadas de modelo a cada uma. Em uma sessão que também aceita seus próprios prompts, como uma vinculada a um pull request, a extração após seu próximo prompt ainda lê a conversa recente, então mensagens retransmitidas ainda presentes nela podem ser aprendidas. A recordação de memória não é afetada: uma resposta a uma mensagem de canal pode usar o que já está salvo. Um chat de canal mantém contexto durável na [memória de canal](./channels/overview#channel-memory) em vez disso.

### O que o Qwen salva

O Qwen procura por quatro tipos de coisas que valem a pena lembrar:

| O quê | Exemplos |
| ----------------------- | ------------------------------------------------ |
| **Sobre você**           | Seu cargo, experiência, como você gosta de trabalhar              |
| **Seu feedback**       | Correções que você fez, abordagens que você confirmou           |
| **Contexto do projeto**     | Trabalho em andamento, decisões, metas não óbvias a partir do código |
| **Referências externas** | Dashboards, rastreadores de tickets, links de documentação que você mencionou    |

O Qwen não salva tudo — apenas coisas que seriam realmente úteis na próxima vez.

### Onde é armazenado

Os arquivos da Auto-memory ficam em `~/.qwen/projects/<project>/memory/`. Todos os branches do mesmo checkout compartilham a mesma pasta de memória, então o que o Qwen aprende em um branch fica disponível nos outros. Cada git worktree vinculado obtém sua própria pasta de memória, correspondendo ao isolamento por worktree de chats e outros estados de sessão — convenções de todo o repositório que você deseja em cada worktree pertencem à [memória da equipe](#memória-da-equipe-compartilhada-com-colaboradores).

Tudo o que é salvo é markdown simples — você pode abrir, editar ou excluir qualquer arquivo a qualquer momento.

O `MEMORY.md` é um índice compacto, em vez do repositório de memória completo. Seu corpo gerado e a porção carregada nos prompts compartilham um limite de 200 linhas e 25.000 unidades de código UTF-16; avisos de truncamento são adicionados separadamente. As quebras de linha são normalizadas antes do orçamento do prompt. Sob pressão de tamanho, entradas ordinárias completas (até 150 unidades de código) recebem espaço antes de entradas mais longas, e entradas retidas mantêm sua ordem original. Uma entrada que não cabe é ignorada por completo, então seu link Markdown nunca é cortado no meio. Mantenha os detalhes nos arquivos de tópico vinculados.

Quando a reconstrução omite entradas, o aviso salvo relata a contagem descartada e até três nomes para cada limite: o limite de varredura do arquivo de tópico e o orçamento do corpo do índice. As contagens permanecem separadas porque uma entrada de equipe agrupada pode representar vários arquivos. O aviso permanece visível quando o índice é carregado em um prompt enquanto for o último parágrafo do arquivo. Insira novos ponteiros de índice acima do aviso final para preservá-lo. A omissão do índice não exclui os arquivos de tópico vinculados. Para pressão do corpo do índice, mescle arquivos de tópico ou remova os obsoletos, ou encurte seus nomes e descrições de frontmatter. Um link muito longo já não tem descrição: encurte o caminho do arquivo de tópico ou o nome do frontmatter em vez disso. Editar apenas o índice gerado não sobrevive à próxima reconstrução. Para o limite de varredura de contagem de arquivos, mescle arquivos de tópico ou remova os obsoletos; editar apenas o índice gerado não reduz o número de arquivos varridos.

O aviso para um índice parcialmente carregado distingue os orçamentos de linha e caractere. Encurtar descrições pode ajudar com o orçamento total de caracteres mesmo quando nenhuma entrada excede o comprimento de linha ordinário. Para entradas que correspondem ao formato gerado, esse conselho considera nomes e links, incluindo links agrupados; remova ou mescle entradas quando esses links sozinhos consumirem o orçamento. Formatos editados manualmente ou sufixos agrupados que poderiam ser texto de descrição recebem possíveis remédios sem a promessa de que encurtar caberá. Se o limite de contagem de entradas for excedido, as entradas ainda devem ser removidas ou mescladas: encurtar uma descrição não reduz o número de entradas. Quando ambos os orçamentos são excedidos, reduzir o índice para 200 entradas ainda pode exigir descrições mais curtas ou menos entradas para atender ao orçamento de caracteres; o aviso relata a contagem real de candidatos. Encurtar para 150 unidades por entrada nem sempre é suficiente para atender ao total de 25.000 unidades.

Um aviso final limitado de parágrafo único do writer é excluído do orçamento do prompt. Quando todas as entradas salvas cabem, o Qwen preserva esse aviso sem afirmar que mais entradas foram omitidas durante o carregamento. Regenerar um índice saturado pode preencher o espaço liberado por descrições mais curtas, então o tamanho do arquivo salvo não precisa encolher imediatamente. Para memória de projeto, usuário e equipe, edite o frontmatter `description` dos arquivos de tópico e verifique o índice regenerado. Uma descrição vazia pode fazer fallback para o tipo de memória, então encurtar o frontmatter não garante que todas as entradas caberão. Edições diretas de linha do índice podem ser substituídas pela próxima escrita gerenciada. Mantenha os alvos de link completos mesmo quando um link exceder 150 unidades; encurte metadados de exibição ou remova/mescle arquivos de tópico em vez de cortar links.

#### Memória fixada (Pinned)

Coloque documentos curados manualmente que a manutenção automática de memória deve preservar em `pinned/` em um diretório de memória gerenciada, por exemplo `~/.qwen/projects/<project>/memory/pinned/architecture.md` ou `~/.qwen/memories/pinned/preferences.md`. Use o mesmo frontmatter que outros documentos de memória. Arquivos fixados válidos são legíveis pelo Qwen e incluídos na próxima vez que o `MEMORY.md` for reconstruído, sob os mesmos limites de tamanho e contagem de arquivos que outros documentos de memória.

Apenas o diretório `pinned/` de nível superior diretamente dentro de uma raiz de memória gerenciada é protegido; diretórios aninhados como `memory/project/pinned/` são memória gravável comum. A extração automática e os workers do Dream correspondem ao nome de diretório reservado sem diferenciar maiúsculas de minúsculas.

A extração automática é instruída a deixar os registros fixados e suas entradas de índice válidas inalterados, enquanto o Dream é instruído a pular `pinned/` durante a consolidação. Tanto a extração automática quanto os workers bifurcados do Dream, incluindo a limpeza em segundo plano, aplicam o limite de arquivos fixados em suas ferramentas de escrita e edição, incluindo caminhos que resolvem através de um symlink para `pinned/`; sua política existente de shell somente leitura bloqueia a exclusão por linha de comando. Você ainda controla esses arquivos diretamente e pode removê-los com uma solicitação explícita de `/forget`.

> **Nota:** O comando slash `/dream` visível é executado no Agent principal. Ele recebe a mesma instrução de skip, mas ainda não recebe o gate determinístico por turno do worker bifurcado.

### Limpeza periódica

O Qwen revisa periodicamente suas memórias salvas para remover duplicatas e limpar entradas desatualizadas. Isso é executado automaticamente em segundo plano uma vez por dia, após o acúmulo de sessões suficientes. Você pode acioná-lo manualmente com `/dream` se quiser que seja executado agora.

Sua sessão continua normalmente enquanto a limpeza é executada em segundo plano.

### Ativando ou desativando

A Auto-memory está ativada por padrão. Para alterná-la, abra `/memory` e use os interruptores na parte superior. Você pode desativar apenas o salvamento automático, apenas a limpeza periódica ou ambos.

Você também pode defini-los em `~/.qwen/settings.json` (aplica-se a todos os projetos) ou `.qwen/settings.json` (apenas para este projeto):

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

### Recordação estruturada (opt-in)

Por padrão, o Qwen lê a memória como um índice plano `MEMORY.md`. O protocolo estruturado substitui isso por uma árvore de memória hierárquica, injeta apenas a subárvore relevante para sua solicitação atual e dá ao Qwen uma ferramenta `search_memory` para puxar entradas completas sob demanda — o que custa menos tokens quando uma coleção de memória cresce além de alguns arquivos.

Está desativado por padrão. Ative-o no `settings.json` (reinício necessário):

```json
{
  "memory": {
    "enableStructuredRecall": true
  }
}
```

ou para uma única execução com `QWEN_CODE_MEMORY_STRUCTURED_RECALL=1`.

Ativá-lo inicia uma migração de metadados em segundo plano: cada arquivo de memória ganha o frontmatter (categoria, palavras-chave, cenários de uso) que a recordação precisa. Ele é executado em pequenos lotes de no máximo 10 arquivos por turno e apenas reescreve o frontmatter, nunca o corpo de uma nota. Enquanto a configuração estiver desativada, a migração nunca é agendada, então nada é reescrito e nenhuma chamada de modelo em segundo plano é feita.

### Memória da equipe (compartilhada com colaboradores)

Por padrão, a auto-memory é **privada para você** — ela fica no seu diretório home e nunca é compartilhada. A memória da equipe é uma camada opcional que toda a equipe compartilha **através do git**.

Quando ativada, o Qwen ganha um terceiro diretório de memória em `.qwen/team-memory/` **dentro do repositório**. Ele usa o mesmo layout de um arquivo por memória e o índice `MEMORY.md` que as camadas privadas. Como é enviado para o repo via commit, é compartilhado com todos os colaboradores da maneira normal: você faz `git pull` para receber as memórias dos colegas e commit/push para compartilhar as suas. O Qwen direciona o conhecimento durável e de todo o projeto para cá — convenções que todo contribuidor deve seguir, ponteiros de referência compartilhados (trackers, dashboards) — enquanto notas pessoais e de rápida decadência permanecem privadas.

Ative-a por projeto (ou globalmente) no `settings.json`:

```json
{
  "memory": {
    "enableTeamMemory": true
  }
}
```

Ela está **desativada por padrão**. Tenha estas ressalvas em mente:

- **Ela é controlada por versão e visível para todos com acesso ao repo.** Trate a memória da equipe como um commit no repo.
- **Secrets são bloqueados.** Escrita em `.qwen/team-memory/` é verificada em busca de credenciais (API keys, tokens, chaves privadas); um secret detectado é rejeitado, nunca é escrito. A verificação é uma rede de segurança, não uma garantia — não coloque dados sensíveis lá.
- **As alterações são revisáveis.** As escritas na memória da equipe aparecem no `git status` / diff do PR como qualquer outro arquivo, para que possam ser revisadas antes de serem commitadas. No modo de aprovação padrão, o Qwen também pergunta antes de cada escrita na equipe; no modo `AUTO_EDIT`/YOLO (onde você optou pela aprovação automática), elas são aplicadas sem um prompt, mas ainda aparecem no diff.
- **O diretório deve ser rastreado pelo git.** Se o `.gitignore` do seu projeto exclui `.qwen/*`, reinclua o caminho para que possa ser compartilhado:

  ```gitignore
  !.qwen/team-memory/
  !.qwen/team-memory/**
  ```

  Ressalva: use a forma de ignore com file-glob (`.qwen/*`), não uma forma de diretório com uma barra no final (`.qwen/`). Um ignore em forma de diretório faz com que o git pule a pasta inteiramente, então uma reinclusão com `!` abaixo dele é uma não-operação (no-op) e a camada da equipe permanece silenciosamente vazia no git. O Qwen avisa uma vez na inicialização quando a camada está ativada, mas seu diretório está no git-ignored ou fora de qualquer repositório git, para que essa configuração incorreta não passe despercebida.

`QWEN_CODE_MEMORY_TEAM=1` / `=0` sobrescreve a configuração para uma única execução.

### Sincronização automática do git (opcional)

Por padrão, você compartilha a memória da equipe com o fluxo de trabalho normal do git (`pull` para receber, `commit`/`push` para compartilhar). Para que o Qwen faça isso para você, ative a sincronização:

```json
{
  "memory": {
    "enableTeamMemory": true,
    "enableTeamMemorySync": true
  }
}
```

Quando ativada, no início da sessão, o Qwen sincroniza da melhor forma possível (best-effort) o diretório `.qwen/team-memory/`: ele reconstrói o índice compartilhado `MEMORY.md`, faz fast-forward-pull das atualizações dos colaboradores **primeiro**, depois faz commit das suas alterações de memória da equipe por cima, e faz push **apenas daquele commit de sincronização** (via um refspec explícito de branch único) — para que o índice que você carrega reflita o mais recente. Ele apenas faz **stage** do diretório da equipe (suas outras alterações de trabalho nunca são commitadas), e nunca bloqueia a sessão em caso de falha do git. Desativado por padrão. `QWEN_CODE_MEMORY_TEAM_SYNC=1` / `=0` sobrescreve a configuração para uma única execução.

Duas coisas para saber antes de ativá-la:

- **O fast-forward pull atua em todo o seu branch atual, não apenas no `.qwen/team-memory/`** (o git não tem pull com escopo de caminho). Portanto, a sincronização fará fast-forward do seu branch para a ponta remota. O push, por outro lado, tem escopo: ele publica **apenas o commit que esta sincronização acabou de criar**, então ele nunca faz push de outros commits não enviados que você tenha — se o seu branch já estiver à frente do upstream, a sincronização faz commit localmente e pula o push. Ative-a em branches onde o fast-forward pull é aceitável — ou execute-a em um checkout dedicado.
- **Um branch divergente é deixado intacto** (`--ff-only` nunca faz merge). Quando isso acontece, a sincronização simplesmente não faz nada naquela sessão; resolva a divergência (`git pull`) e ela retoma. Um branch sem upstream (sem configuração de rastreamento) ainda faz commit localmente, mas pula o push — não há para onde fazer push.

---

## Comandos

### `/memory`

Abre o painel de Memória. No Web Shell, os arquivos permanecem somente leitura quando seu texto completo não está disponível, incluindo arquivos que excedem o limite de conteúdo, arquivos que mudam durante uma leitura e arquivos com marca de ordem de byte ou UTF-8 inválido. Se um arquivo mudou durante uma leitura, selecione sua aba de memória novamente para tentar novamente.

A partir daqui você pode:

- Ativar ou desativar o salvamento da auto-memory
- Ativar ou desativar a limpeza periódica (dream)
- Abrir seu QWEN.md pessoal (`~/.qwen/QWEN.md`)
- Abrir o QWEN.md do projeto
- Navegar na pasta da auto-memory

### `/memory migrate-team`

Migra a camada de **memória da equipe** (`.qwen/team-memory/`) para o formato de metadados estruturados: cada arquivo ganha o frontmatter (nome, descrição, categoria, palavras-chave, cenários de uso) que a recordação de memória precisa. A memória pessoal e do projeto é migrada automaticamente em segundo plano quando a [recordação estruturada](#recordação-estruturada-opt-in) é ativada; a memória da equipe é compartilhada através do git, então a reescrita é executada apenas mediante solicitação explícita e aparece como um commit revisável. Execute-o uma vez por repositório em um workspace confiável com a memória da equipe ativada.

### `/init`

Gera um QWEN.md inicial para o seu projeto. O Qwen lê sua base de código e preenche comandos de build, instruções de teste e convenções que descobre.

### `/remember <text>`

Salva imediatamente algo na auto-memory sem esperar que o Qwen o capture automaticamente:

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

Remove entradas da auto-memory que correspondem à sua descrição:

```
/forget old workaround for the login bug
```

### `/dream`

Executa a limpeza de memória agora em vez de esperar pelo agendamento automático:

```
/dream
```

---

## Memória externa (`context_search`)

Além do `QWEN.md` e da auto-memory, o Qwen Code pode consultar serviços de memória externos e índices de sessão locais através da ferramenta MCP `context_search`. Diferentemente do `QWEN.md` e da auto-memory, o `context_search` é chamado pelo modelo sob demanda — nada é recordado ou enviado automaticamente em cada turno:

- **Mem0 (adaptador integrado):** Configure `memory.mem0` em `~/.qwen/settings.json` para conectar ao Mem0 Platform V3, PolarDB ou Mem0 OSS auto-hospedado. Veja [Mem0](./mem0.md) para configuração e confirmação de escrita opcional.
- **Servidores External Context MCP Profile v1:** Qualquer servidor MCP stdio ou HTTP que implemente o contrato `context_search({ query })` pode ser registrado com `qwen mcp add` ou `mcpServers` em `settings.json` (defina `"includeTools": ["context_search"]` para que apenas `context_search` seja exposto para um servidor Profile v1).

Cada entrada registra seu próprio servidor, e mais de um pode estar ativo ao mesmo tempo — o Qwen expõe o `context_search` de cada servidor separadamente (por exemplo, `mcp__external-context__context_search` e `mcp__deja-context__context_search`) e o modelo escolhe entre eles, então ative apenas o corpus que você deseja pesquisar, ou nomeie o backend em sua solicitação.

Independentemente do backend que você usar, as correspondências que o `context_search` retorna são adicionadas ao contexto do Qwen e enviadas ao provedor de modelo configurado para a sessão, e as chamadas são sujeitas a aprovação, a menos que você as permita — um índice local mantém a pesquisa local, não os resultados. No Auto Mode, a consulta e uma cópia limitada dos argumentos também vão para o modelo classificador.

### deja-vu

Uma CLI local e servidor MCP que indexa as transcrições de sessão que agentes de codificação (Qwen Code, Claude Code, Codex, Cursor e outros) já escrevem em disco usando pesquisa BM25 local, sem chamadas de modelo ou chaves de API necessárias para construir ou consultar o índice.

- **Repositório:** https://github.com/vshulcz/deja-vu
- **Custo:** Gratuito e open source (MIT)
- **Melhor para:** Pesquisar sessões anteriores no Qwen Code e outros agentes de codificação locais na mesma máquina

#### Ferramentas disponíveis

- `context_search` — Pesquisar transcrições de sessão locais indexadas (`deja mcp --context-search`)

#### Configuração

1. Instale o binário `deja` (por exemplo, `brew install deja-vu`, `npm install -g @vshulcz/deja-vu`, ou dos [GitHub releases](https://github.com/vshulcz/deja-vu/releases)) e construa o índice inicial (`deja index`).
2. Registre o servidor usando um dos métodos abaixo:

**Método 1: Comando CLI**

```bash
qwen mcp add deja-context deja mcp --context-search --timeout 8000 --include-tools context_search
```

**Método 2: `settings.json`**

```json
{
  "mcpServers": {
    "deja-context": {
      "command": "deja",
      "args": ["mcp", "--context-search"],
      "timeout": 8000,
      "includeTools": ["context_search"]
    }
  }
}
```

3. Reinicie o Qwen Code para que o novo servidor MCP seja carregado na inicialização da sessão, depois execute `/mcp` para confirmar que `deja-context` está conectado (veja [MCP Servers](./mcp.md)).

Para remover o servidor posteriormente, execute `qwen mcp remove deja-context` (ou exclua a entrada `deja-context` de `mcpServers` em `~/.qwen/settings.json`) e reinicie o Qwen Code.

---

## Solução de problemas

### O Qwen não está seguindo meu QWEN.md

Abra `/memory` para ver quais arquivos estão carregados. Se o seu arquivo não estiver listado, o Qwen não pode vê-lo — certifique-se de que está na raiz do projeto ou em `~/.qwen/`.

As instruções funcionam melhor quando são específicas:

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

Se você tiver vários arquivos QWEN.md com instruções conflitantes, o Qwen pode se comportar de forma inconsistente. Revise-os e remova quaisquer contradições.

### Quero ver o que o Qwen salvou

Execute `/memory` e selecione **Abrir pasta da auto-memory**. Todas as memórias salvas são arquivos markdown legíveis que você pode navegar, editar ou excluir.

### O Qwen continua esquecendo as coisas

Se a auto-memory estiver ativada, mas o Qwen não parecer lembrar das coisas entre as sessões, tente executar `/dream` para forçar uma passagem de limpeza. Verifique também `/memory` para confirmar se ambos os interruptores estão ativados.

Para coisas que você sempre quer que o Qwen lembre, adicione-as ao QWEN.md em vez disso — a auto-memory é best-effort, o QWEN.md é garantido.