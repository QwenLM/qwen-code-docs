# Memória

Cada sessão do Qwen Code começa com uma janela de contexto limpa. Dois mecanismos transportam o conhecimento entre as sessões para que você não precise se explicar novamente toda vez:

- **QWEN.md** — instruções que _você_ escreve uma vez e o Qwen lê em cada sessão
- **Auto-memory** — notas que o Qwen escreve sozinho com base no que aprende sobre você

---

## QWEN.md: suas instruções para o Qwen

O QWEN.md é um arquivo de texto simples onde você escreve informações que o Qwen deve sempre saber sobre seu projeto ou suas preferências. Pense nele como um briefing permanente que é carregado no início de cada conversa.

### O que colocar no QWEN.md

Adicione informações que, de outra forma, você teria que repetir em cada sessão:

- Comandos de build e teste (`npm run test`, `make build`)
- Convenções de código que sua equipe segue ("todos os novos arquivos devem ter comentários JSDoc")
- Decisões de arquitetura ("usamos o padrão repository, nunca chamamos o banco de dados diretamente dos controllers")
- Preferências pessoais ("use sempre pnpm, não npm")

Não inclua coisas que o Qwen consegue descobrir lendo seu código. O QWEN.md funciona melhor quando é curto e específico — quanto maior ele fica, menos confiável é a adesão do Qwen às instruções.

### Onde criar o QWEN.md

| Arquivo                       | A quem se aplica                              |
| ----------------------------- | --------------------------------------------- |
| `~/.qwen/QWEN.md`             | Você, em todos os seus projetos               |
| `QWEN.md` na raiz do projeto  | Toda a sua equipe (faça commit no controle de versão) |

Você pode usar ambos. O Qwen carrega todos os arquivos QWEN.md que encontra ao iniciar uma sessão — o seu pessoal mais qualquer um no projeto.

Se seu repositório já tiver um arquivo `AGENTS.md` para outras ferramentas de IA, o Qwen também o lê. Não há necessidade de duplicar instruções.

### Gerar um automaticamente com `/init`

Execute `/init` e o Qwen analisará sua base de código para criar um QWEN.md inicial com comandos de build, instruções de teste e convenções que encontrar. Se um já existir, ele sugerirá adições em vez de sobrescrevê-lo.

### Referenciar outros arquivos

Você pode apontar o QWEN.md para outros arquivos para que o Qwen também os leia:

```markdown
Consulte @README.md para uma visão geral do projeto.

# Convenções

- Fluxo de trabalho Git: @docs/git-workflow.md
```

Use `@path/to/file` em qualquer lugar do QWEN.md. Caminhos relativos são resolvidos a partir do próprio arquivo QWEN.md.

---

## Auto-memory: o que o Qwen aprende sobre você

O Auto-memory é executado em segundo plano. Após cada uma de suas conversas, o Qwen salva silenciosamente informações úteis que aprendeu — suas preferências, feedback que você deu, contexto do projeto — para que possa usá-las em sessões futuras sem que você precise se repetir.

Isso é diferente do QWEN.md: você não o escreve, o Qwen escreve.

### O que o Qwen salva

O Qwen procura quatro tipos de informações que valem a pena lembrar:

| O quê                   | Exemplos                                                 |
| ----------------------- | -------------------------------------------------------- |
| **Sobre você**          | Sua função, experiência, como você gosta de trabalhar    |
| **Seu feedback**        | Correções que você fez, abordagens que você confirmou    |
| **Contexto do projeto** | Trabalho em andamento, decisões, metas não óbvias no código |
| **Referências externas**| Dashboards, rastreadores de tickets, links de docs que você mencionou |

O Qwen não salva tudo — apenas informações que seriam realmente úteis na próxima vez.

### Onde é armazenado

Os arquivos do Auto-memory ficam em `~/.qwen/projects/<project>/memory/`. Todos os branches e worktrees do mesmo repositório compartilham a mesma pasta de memória, então o que o Qwen aprende em um branch fica disponível nos outros.

Tudo o que é salvo é markdown puro — você pode abrir, editar ou excluir qualquer arquivo a qualquer momento.

### Limpeza periódica

Periodicamente, o Qwen revisa suas memórias salvas para remover duplicatas e limpar entradas desatualizadas. Isso é executado automaticamente em segundo plano uma vez por dia, após o acúmulo de sessões suficientes. Você pode acioná-lo manualmente com `/dream` se quiser executá-lo agora.

Enquanto a limpeza está em execução, **✦ dreaming** aparece no canto da tela. Sua sessão continua normalmente.

### Ativar ou desativar

O Auto-memory está ativado por padrão. Para alterná-lo, abra `/memory` e use as chaves na parte superior. Você pode desativar apenas o salvamento automático, apenas a limpeza periódica ou ambos.

Você também pode configurá-los em `~/.qwen/settings.json` (aplica-se a todos os projetos) ou `.qwen/settings.json` (apenas para este projeto):

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

Abre o painel Memory. A partir dele, você pode:

- Ativar ou desativar o salvamento do auto-memory
- Ativar ou desativar a limpeza periódica (dream)
- Abrir seu QWEN.md pessoal (`~/.qwen/QWEN.md`)
- Abrir o QWEN.md do projeto
- Navegar pela pasta do auto-memory

### `/init`

Gera um QWEN.md inicial para seu projeto. O Qwen lê sua base de código e preenche comandos de build, instruções de teste e convenções que descobre.

### `/remember <text>`

Salva imediatamente algo no auto-memory sem esperar que o Qwen o capture automaticamente:

```
/remember use sempre snake_case para nomes de variáveis Python
/remember o ambiente de staging está em staging.example.com
```

### `/forget <text>`

Remove entradas do auto-memory que correspondem à sua descrição:

```
/forget workaround antigo para o bug de login
```

### `/dream`

Executa a limpeza de memória agora em vez de esperar pelo agendamento automático:

```
/dream
```

---

## Solução de problemas

### O Qwen não está seguindo meu QWEN.md

Abra `/memory` para ver quais arquivos estão carregados. Se seu arquivo não estiver na lista, o Qwen não consegue vê-lo — certifique-se de que ele está na raiz do projeto ou em `~/.qwen/`.

As instruções funcionam melhor quando são específicas:

- ✓ `Use indentação de 2 espaços para arquivos TypeScript`
- ✗ `Formate o código de forma bonita`

Se você tiver vários arquivos QWEN.md com instruções conflitantes, o Qwen pode ter um comportamento inconsistente. Revise-os e remova quaisquer contradições.

### Quero ver o que o Qwen salvou

Execute `/memory` e selecione **Abrir pasta do auto-memory**. Todas as memórias salvas são arquivos markdown legíveis que você pode navegar, editar ou excluir.

### O Qwen continua esquecendo coisas

Se o auto-memory estiver ativado, mas o Qwen não parecer lembrar as coisas entre as sessões, tente executar `/dream` para forçar uma execução de limpeza. Verifique também `/memory` para confirmar se ambas as chaves estão ativadas.

Para coisas que você sempre quer que o Qwen lembre, adicione-as ao QWEN.md — o auto-memory funciona no melhor esforço (best-effort), enquanto o QWEN.md é garantido.