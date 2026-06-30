# Memória

Cada sessão do Qwen Code começa com uma janela de contexto nova. Dois mecanismos transportam o conhecimento entre as sessões para que você não precise se explicar novamente todas as vezes:

- **QWEN.md** — instruções que _você_ escreve uma vez e o Qwen lê em cada sessão
- **Auto-memory** — anotações que o próprio Qwen escreve com base no que aprende sobre você

---

## QWEN.md: suas instruções para o Qwen

O QWEN.md é um arquivo de texto simples onde você escreve coisas que o Qwen deve sempre saber sobre o seu projeto ou suas preferências. Pense nele como um briefing permanente que é carregado no início de cada conversa.

### O que colocar no QWEN.md

Adicione coisas que, de outra forma, você teria que repetir em cada sessão:

- Comandos de build e teste (`npm run test`, `make build`)
- Convenções de código que sua equipe segue ("todos os novos arquivos devem ter comentários JSDoc")
- Decisões de arquitetura ("usamos o padrão repository, nunca chamamos o banco de dados diretamente dos controllers")
- Preferências pessoais ("sempre use pnpm, não npm")

Não inclua coisas que o Qwen pode descobrir lendo o seu código. O QWEN.md funciona melhor quando é curto e específico — quanto mais longo ele fica, menos confiavelmente o Qwen o segue.

### Onde criar o QWEN.md

| Arquivo | A quem se aplica |
| --- | --- |
| `~/.qwen/QWEN.md` | Você, em todos os seus projetos |
| `QWEN.md` na raiz do projeto | Toda a sua equipe (faça commit no controle de versão) |
| `.qwen/QWEN.local.md` | Apenas você, apenas neste projeto (mantenha fora do git) |

Você pode ter qualquer combinação deles. O Qwen carrega todos quando você inicia uma sessão.

Se o seu repositório já tiver um arquivo `AGENTS.md` para outras ferramentas de IA, o Qwen também o lê. Não há necessidade de duplicar instruções.

#### Quando usar `.qwen/QWEN.local.md`

Use-o para instruções **específicas do projeto, mas pessoais** — coisas que pertencem a este projeto, mas não devem ser compartilhadas com a equipe:

- Seu próprio ID de cluster, namespace do registro de contêineres ou conta em nuvem
- Um comando de debug pessoal com hardcode do seu ambiente local
- Anotações que você quer que o Qwen saiba sobre o seu trabalho em andamento, mas que não devem ir para o commit

Ele é carregado **depois** do `QWEN.md` compartilhado do projeto, então suas instruções locais podem complementar ou sobrescrever as da equipe.

**Você mesmo deve adicionar ao .gitignore.** Embora `.qwen/` seja frequentemente tratado como um diretório local, o qwen-code não gera um `.gitignore` para você, e alguns projetos dão commit em `.qwen/settings.json`. Adicione esta linha ao seu `.gitignore` (ou ao seu git ignore global):

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

### O que o Qwen salva

O Qwen procura por quatro tipos de coisas que valem a pena lembrar:

| O quê | Exemplos |
| --- | --- |
| **Sobre você** | Seu cargo, background, como você gosta de trabalhar |
| **Seu feedback** | Correções que você fez, abordagens que você confirmou |
| **Contexto do projeto** | Trabalho em andamento, decisões, metas não óbvias a partir do código |
| **Referências externas** | Dashboards, rastreadores de tickets, links de documentação que você mencionou |

O Qwen não salva tudo — apenas coisas que seriam realmente úteis na próxima vez.

### Onde é armazenado

Os arquivos da Auto-memory ficam em `~/.qwen/projects/<project>/memory/`. Todos os branches e worktrees do mesmo repositório compartilham a mesma pasta de memória, então o que o Qwen aprende em um branch fica disponível nos outros.

Tudo o que é salvo é markdown simples — você pode abrir, editar ou excluir qualquer arquivo a qualquer momento.

### Limpeza periódica

O Qwen revisa periodicamente suas memórias salvas para remover duplicatas e limpar entradas desatualizadas. Isso é executado automaticamente em segundo plano uma vez por dia, após o acúmulo de sessões suficientes. Você pode acioná-lo manualmente com `/dream` se quiser que seja executado agora.

Enquanto a limpeza está em execução, **✦ dreaming** aparece no canto da tela. Sua sessão continua normalmente.

### Ativando ou desativando

A Auto-memory está ativada por padrão. Para alterná-la, abra `/memory` e use os interruptores na parte superior. Você pode desativar apenas o salvamento automático, apenas a limpeza periódica ou ambos.

Você também pode configurá-los em `~/.qwen/settings.json` (aplica-se a todos os projetos) ou `.qwen/settings.json` (apenas este projeto):

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

### Team memory (compartilhada com colaboradores)

Por padrão, a auto-memory é **privada para você** — ela fica no seu diretório home e nunca é compartilhada. A Team memory é uma camada opcional que toda a equipe compartilha **através do git**.

Quando ativada, o Qwen ganha um terceiro diretório de memória em `.qwen/team-memory/` **dentro do repositório**. Ele usa o mesmo layout de um arquivo por memória e o índice `MEMORY.md` das camadas privadas. Como é commitada no repositório, é compartilhada com todos os colaboradores da maneira normal: você usa `git pull` para receber as memórias dos colegas e commit/push para compartilhar as suas. O Qwen direciona o conhecimento durável e de todo o projeto para cá — convenções que todo contribuidor deve seguir, ponteiros de referência compartilhados (trackers, dashboards) — enquanto anotações pessoais e de rápida expiração permanecem privadas.

Ative-a por projeto (ou globalmente) no `settings.json`:

```json
{
  "memory": {
    "enableTeamMemory": true
  }
}
```

Ela está **desativada por padrão**. Tenha estas ressalvas em mente:

- **Ela é controlada por versão e visível para todos com acesso ao repositório.** Trate a team memory como um commit no repositório.
- **Secrets são bloqueados.** Escrita em `.qwen/team-memory/` é verificada em busca de credenciais (API keys, tokens, chaves privadas); um secret detectado é rejeitado, nunca é escrito. A verificação é uma rede de segurança, não uma garantia — não coloque dados confidenciais lá.
- **As alterações são revisáveis.** As escritas na team memory aparecem no `git status` / diff do PR como qualquer outro arquivo, para que possam ser revisadas antes do commit. No modo de aprovação padrão, o Qwen também pergunta antes de cada escrita na team memory; no modo `AUTO_EDIT`/YOLO (onde você optou pela aprovação automática), elas são aplicadas sem um prompt, mas ainda aparecem no diff.
- **O diretório deve ser rastreado pelo git.** Se o `.gitignore` do seu projeto exclui `.qwen/*`, reinclua o caminho para que possa ser compartilhado:

  ```gitignore
  !.qwen/team-memory/
  !.qwen/team-memory/**
  ```

  Ressalva: use a forma de ignore com file-glob (`.qwen/*`), não a forma de diretório com uma barra no final (`.qwen/`). Um ignore no formato de diretório faz o git pular a pasta inteiramente, então uma reinclusão com `!` abaixo dele é uma não-operação (no-op) e a camada da equipe permanece silenciosamente vazia no git. O Qwen avisa uma vez na inicialização quando a camada está ativada, mas seu diretório está no git-ignored ou fora de qualquer repositório git, para que essa configuração incorreta não passe despercebida.

`QWEN_CODE_MEMORY_TEAM=1` / `=0` sobrescreve a configuração para uma única execução.

### Sincronização automática com git (opcional)

Por padrão, você compartilha a team memory com o fluxo de trabalho normal do git (`pull` para receber, `commit`/`push` para compartilhar). Para que o Qwen faça isso por você, ative a sincronização:

```json
{
  "memory": {
    "enableTeamMemory": true,
    "enableTeamMemorySync": true
  }
}
```

Quando ativada, no início da sessão, o Qwen sincroniza da melhor forma possível o diretório `.qwen/team-memory/`: ele reconstrói o índice compartilhado `MEMORY.md`, faz pull com fast-forward das atualizações dos colaboradores **primeiro**, depois faz commit das suas alterações da team memory por cima, e faz push **apenas desse commit de sincronização** (via um refspec explícito de branch único) — para que o índice que você carrega reflita o mais recente. Ele apenas faz **stage** do diretório da equipe (suas outras alterações de trabalho nunca são commitadas), e nunca bloqueia a sessão em caso de falha no git. Desativado por padrão. `QWEN_CODE_MEMORY_TEAM_SYNC=1` / `=0` sobrescreve a configuração para uma única execução.

Duas coisas para saber antes de ativá-la:

- **O pull com fast-forward atua em todo o seu branch atual, não apenas em `.qwen/team-memory/`** (o git não tem pull com escopo de caminho). Portanto, a sincronização fará fast-forward do seu branch para a ponta remota. O push, por outro lado, tem escopo: ele publica **apenas o commit que esta sincronização acabou de criar**, então ele nunca faz push de outros commits não enviados que você tenha — se o seu branch já estiver à frente do upstream, a sincronização faz commit localmente e pula o push. Ative-a em branches onde o pull com fast-forward é aceitável — ou execute-a em um checkout dedicado.
- **Um branch divergente é deixado intacto** (`--ff-only` nunca faz merge). Quando isso acontece, a sincronização simplesmente não faz nada naquela sessão; resolva a divergência (`git pull`) e ela retoma. Um branch sem upstream (sem configuração de rastreamento) ainda faz commit localmente, mas pula o push — não há para onde fazer push.

---

## Comandos

### `/memory`

Abre o painel de Memória. A partir daqui você pode:

- Ativar ou desativar o salvamento da auto-memory
- Ativar ou desativar a limpeza periódica (dream)
- Abrir seu QWEN.md pessoal (`~/.qwen/QWEN.md`)
- Abrir o QWEN.md do projeto
- Navegar pela pasta da auto-memory

### `/init`

Gera um QWEN.md inicial para o seu projeto. O Qwen lê sua base de código e preenche com comandos de build, instruções de teste e convenções que ele descobre.

### `/remember <text>`

Salva imediatamente algo na auto-memory sem esperar o Qwen capturar automaticamente:

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

Para coisas que você sempre quer que o Qwen lembre, adicione-as ao QWEN.md — a auto-memory é "best-effort" (melhor esforço), o QWEN.md é garantido.