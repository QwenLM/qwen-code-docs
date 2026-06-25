# Memória

Toda sessão do Qwen Code começa com uma janela de contexto nova. Dois mecanismos carregam conhecimento entre as sessões para que você não precise se explicar novamente toda vez:

- **QWEN.md** — instruções que _você_ escreve uma vez e o Qwen lê a cada sessão
- **Auto-memory** — notas que o Qwen escreve por conta própria com base no que aprende com você

---

## QWEN.md: suas instruções para o Qwen

QWEN.md é um arquivo de texto simples onde você escreve coisas que o Qwen deve sempre saber sobre seu projeto ou suas preferências. Pense nele como um briefing permanente que é carregado no início de cada conversa.

### O que colocar no QWEN.md

Adicione coisas que você teria que repetir a cada sessão:

- Comandos de build e teste (`npm run test`, `make build`)
- Convenções de código que sua equipe segue ("todos os novos arquivos devem ter comentários JSDoc")
- Decisões arquiteturais ("usamos o padrão repository, nunca chamamos o banco de dados diretamente dos controllers")
- Preferências pessoais ("sempre use pnpm, não npm")

Não inclua coisas que o Qwen pode descobrir lendo seu código. QWEN.md funciona melhor quando é curto e específico — quanto mais longo, menos confiavelmente o Qwen o segue.

### Onde criar o QWEN.md

| Arquivo                          | A quem se aplica                                |
| -------------------------------- | ----------------------------------------------- |
| `~/.qwen/QWEN.md`                | Você, em todos os seus projetos                 |
| `QWEN.md` na raiz do projeto     | Toda a sua equipe (commite no controle de versão) |
| `.qwen/QWEN.local.md`            | Apenas você, apenas neste projeto (mantenha fora do git) |

Você pode ter qualquer combinação deles. O Qwen carrega todos quando você inicia uma sessão.

Se seu repositório já tem um arquivo `AGENTS.md` para outras ferramentas de IA, o Qwen também o lê. Não há necessidade de duplicar instruções.

#### Quando usar `.qwen/QWEN.local.md`

Use-o para instruções **específicas do projeto, mas pessoais** — coisas que pertencem a este projeto mas não devem ser compartilhadas com a equipe:

- Seu próprio ID de cluster, namespace de registry de contêiner ou conta na nuvem
- Um comando de depuração pessoal que usa hardcode do seu ambiente local
- Notas que você quer que o Qwen saiba sobre seu trabalho em andamento, mas que não sejam commitadas

Ele é carregado **depois** do `QWEN.md` compartilhado do projeto, então suas instruções locais podem complementar ou substituir as da equipe.

**Você mesmo deve adicioná-lo ao `.gitignore`.** Embora `.qwen/` seja frequentemente tratado como um diretório local, o qwen-code não gera um `.gitignore` para você, e alguns projetos committam `.qwen/settings.json`. Adicione esta linha ao seu `.gitignore` (ou ao seu git ignore global):

```
.qwen/QWEN.local.md
```

### Gerar um automaticamente com `/init`

Execute `/init` e o Qwen analisará sua base de código para criar um QWEN.md inicial com comandos de build, instruções de teste e convenções que encontrar. Se um já existir, ele sugere adições em vez de substituir.

### Referenciar outros arquivos

Você pode apontar o QWEN.md para outros arquivos para que o Qwen também os leia:

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Use `@path/to/file` em qualquer lugar no QWEN.md. Caminhos relativos são resolvidos a partir do próprio arquivo QWEN.md.

---

## Auto-memory: o que o Qwen aprende sobre você

O auto-memory é executado em segundo plano. Após cada uma de suas conversas, o Qwen salva discretamente coisas úteis que aprendeu — suas preferências, feedback que você deu, contexto do projeto — para que possa usá-las em sessões futuras sem que você precise se repetir.

Isso é diferente do QWEN.md: você não o escreve, o Qwen o faz.

### O que o Qwen salva

O Qwen procura por quatro tipos de coisas que valem a pena lembrar:

| O quê                    | Exemplos                                                 |
| ------------------------ | -------------------------------------------------------- |
| **Sobre você**           | Seu cargo, histórico, como você gosta de trabalhar       |
| **Seu feedback**         | Correções que você fez, abordagens que você confirmou    |
| **Contexto do projeto**  | Trabalho em andamento, decisões, objetivos não óbvios a partir do código |
| **Referências externas** | Dashboards, rastreadores de tickets, links de documentação que você mencionou |

O Qwen não salva tudo — apenas coisas que seriam realmente úteis da próxima vez.

### Onde é armazenado

Os arquivos de auto-memory ficam em `~/.qwen/projects/<project>/memory/`. Todos os branches e worktrees do mesmo repositório compartilham a mesma pasta de memória, então o que o Qwen aprende em um branch está disponível nos outros.

Tudo salvo é markdown simples — você pode abrir, editar ou excluir qualquer arquivo a qualquer momento.

### Limpeza periódica

O Qwen periodicamente revisa suas memórias salvas para remover duplicatas e limpar entradas desatualizadas. Isso é executado automaticamente em segundo plano uma vez por dia após um número suficiente de sessões acumuladas. Você pode acioná-lo manualmente com `/dream` se quiser que seja executado agora.

Enquanto a limpeza está em execução, **✦ dreaming** aparece no canto da tela. Sua sessão continua normalmente.

### Ativando ou desativando

O auto-memory está ativado por padrão. Para alterná-lo, abra `/memory` e use os interruptores no topo. Você pode desligar apenas o salvamento automático, apenas a limpeza periódica, ou ambos.
Você também pode defini-las em `~/.qwen/settings.json` (aplica-se a todos os projetos) ou `.qwen/settings.json` (apenas neste projeto):

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

---

## Comandos

### `/memory`

Abre o painel de Memória. A partir daqui você pode:

- Ativar ou desativar o salvamento automático de memória
- Ativar ou desativar a limpeza periódica (dream)
- Abrir seu QWEN.md pessoal (`~/.qwen/QWEN.md`)
- Abrir o QWEN.md do projeto
- Navegar pela pasta de memória automática

### `/init`

Gera um QWEN.md inicial para o seu projeto. O Qwen lê seu código-fonte e preenche comandos de build, instruções de teste e convenções que descobre.

### `/remember <texto>`

Salva imediatamente algo na memória automática sem esperar que o Qwen capture automaticamente:

```
/remember sempre use snake_case para nomes de variáveis em Python
/remember o ambiente de staging está em staging.example.com
```

### `/forget <texto>`

Remove entradas da memória automática que correspondem à sua descrição:

```
/forget gambiarra antiga para o bug de login
```

### `/dream`

Executa a limpeza da memória agora, sem esperar pela agenda automática:

```
/dream
```

---

## Solução de problemas

### Qwen não está seguindo meu QWEN.md

Abra `/memory` para ver quais arquivos estão carregados. Se o seu arquivo não estiver listado, o Qwen não consegue vê-lo — certifique-se de que ele está na raiz do projeto ou em `~/.qwen/`.

Instruções funcionam melhor quando são específicas:

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

Se você tiver vários arquivos QWEN.md com instruções conflitantes, o Qwen pode se comportar de forma inconsistente. Revise-os e remova quaisquer contradições.

### Quero ver o que o Qwen salvou

Execute `/memory` e selecione **Abrir pasta de memória automática**. Todas as memórias salvas são arquivos markdown legíveis que você pode navegar, editar ou excluir.

### Qwen continua esquecendo coisas

Se a memória automática estiver ativada, mas o Qwen não parecer se lembrar das coisas entre sessões, tente executar `/dream` para forçar uma passagem de limpeza. Verifique também em `/memory` se ambas as opções estão habilitadas.

Para coisas que você sempre quer que o Qwen lembre, adicione-as ao QWEN.md — a memória automática é de melhor esforço, o QWEN.md é garantido.
