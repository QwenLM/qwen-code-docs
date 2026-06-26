# Modo Auto

O Modo Auto usa um classificador LLM para avaliar cada chamada de ferramenta e decidir se deve aprová-la automaticamente. Ele fica entre o Modo Auto-Edit (que aprova automaticamente apenas edições de arquivos) e o Modo YOLO (que aprova tudo automaticamente).

Esta página é a referência para configurar e solucionar problemas do Modo Auto.
Para uma introdução, consulte a [Visão geral do Modo de Aprovação](./approval-mode.md#4-auto-mode---classifier-driven-approval).

## Como funciona

Quando você está no Modo Auto e o agente tenta executar uma ferramenta, o Qwen Code percorre três camadas em ordem:

1. **Fast-path acceptEdits** — Edições/Escritas cujo caminho de destino está dentro do workspace são aprovadas automaticamente sem invocar o classificador.
   **Exceção:** escritas nas superfícies de automodificação do próprio Qwen Code (`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`, nomes de arquivos de contexto configurados, `.qwen/rules/`, `.qwen/commands/`, `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`) e superfícies de persistência (`.git/`, `.husky/`, `package.json`, `.npmrc`, `Makefile`, `.github/workflows/`, etc.) passam pelo classificador mesmo quando estão dentro do workspace. Links simbólicos que apontam para caminhos protegidos são resolvidos e rejeitados também. Comandos shell que acessam esses caminhos via `cd && bash -lc '...'` ou outros wrappers também passam pelo classificador.
2. **Lista de permissão de ferramentas seguras** — Ferramentas internas de somente leitura e somente metadados (Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion, etc.) são aprovadas automaticamente sem invocar o classificador.
3. **Classificador LLM** — Todo o resto (comandos shell, buscas web, inicialização de subagentes, edições fora do workspace, ferramentas MCP) é enviado para um classificador de dois estágios:
   - **Estágio 1 (rápido)** — produz apenas `{ shouldBlock }`. Cerca de ~300ms.
     Se `shouldBlock` for `false`, a ação é permitida e a chamada prossegue.
   - **Estágio 2 (pensamento)** — só é executado quando o Estágio 1 disse bloquear. Usa revisão com cadeia de pensamento para reduzir falsos positivos do Estágio 1. Pode rebaixar o bloqueio do Estágio 1 para permitir. Produz o `reason` visível ao usuário no bloqueio.

O classificador usa seu modelo rápido configurado (`/model --fast`). Se nenhum modelo rápido estiver configurado, o modelo principal da sessão é usado.

## Regras rígidas ainda prevalecem

O Modo Auto **não** substitui regras de permissão rígidas. Antes do classificador ser executado:

- As regras `permissions.deny` bloqueiam a ação com o motivo da regra. O classificador nunca a vê.
- As regras `permissions.allow` com especificadores específicos (ex.: `Bash(git status)`, `Read(./docs/**)`) ainda permitem automaticamente sem o classificador — **exceto** quando a chamada resulta em uma escrita em um caminho protegido de automodificação ou persistência (veja a lista em "Como funciona"). Nesse caso, o Modo Auto reavalia a chamada através do classificador para que uma regra de permissão em `Bash(*)` não possa silenciosamente se tornar permissão para reescrever configurações, comandos, hooks, skills ou servidores MCP do Qwen Code.
- As regras `permissions.ask` forçam confirmação manual mesmo no Modo Auto.

## Regras de permissão muito amplas são removidas durante o Modo Auto

Regras como as seguintes permitiriam que o agente executasse código arbitrário sem revisão do classificador:

- `Bash` / `Bash(*)` / `Bash()` — permite automaticamente todos os comandos shell
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — curingas de interpretadores
- `Agent` / `Agent(coder)` — qualquer permissão na ferramenta Agent
- `Skill` / `Skill(pdf)` — qualquer permissão na ferramenta Skill

Ao entrar no Modo Auto, o Qwen Code remove temporariamente essas regras do conjunto de permissões ativo e exibe um aviso listando-as. As regras voltam assim que você sair do Modo Auto. O `settings.json` nunca é modificado.

Se você realmente precisa dessas regras amplas, use o Modo YOLO.

## Configurando dicas

O Modo Auto lê `permissions.autoMode` do seu `settings.json`. As entradas são descrições em linguagem natural, não padrões de regra — elas são injetadas de forma aditiva no prompt do sistema do classificador junto com os padrões internos.

Existem três categorias de dicas mais uma lista de ambiente:

- **`allow`** — ações que o classificador deve aprovar automaticamente.
- **`softDeny`** — ações destrutivas ou irreversíveis que o classificador deve bloquear **a menos que a solicitação explícita mais recente do usuário tenha pedido exatamente aquela ação e escopo**. Negativas suaves podem ser desfeitas por intenção do usuário; um "sim, faça tudo" genérico não conta.
- **`hardDeny`** — ações de limite de segurança que o classificador deve bloquear no Modo Auto independentemente de `autoMode.hints.allow` ou intenção recente do usuário. Isso é política do classificador, não uma regra de permissão determinística: não substitui `permissions.allow`. Use `permissions.deny` para ações que nunca devem ser permitidas pelo gerenciador de permissões.

```json
{
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": [
          "Running poetry install and poetry update in this Python project",
          "Cleaning build artifacts under ./dist or ./build",
          "Reading any file under /Users/me/code/"
        ],
        "softDeny": [
          "Editing Qwen Code settings unless I explicitly ask for the exact change",
          "Running migration scripts that touch the production DB"
        ],
        "hardDeny": [
          "Sending secrets or .env contents to any network endpoint",
          "Modifying anything under ~/.ssh or ~/.aws"
        ]
      },
      "environment": [
        "This is a private monorepo with strict commit signing",
        "Production credentials live in 1Password, never in plain files"
      ]
    }
  }
}
```
`hints.deny` ainda é aceito para compatibilidade com versões anteriores e é tratado como `softDeny`. Misturar os dois é aceitável — as entradas são concatenadas, `softDeny` primeiro.

### Limites de comprimento e quantidade

Para manter o prompt do sistema do classificador pequeno:

- Cada entrada é limitada a 200 caracteres (entradas mais longas são truncadas com um aviso).
- `hints.allow`, `hints.softDeny` e `hints.hardDeny` aceitam até 50 entradas cada.
- `environment` aceita até 20 entradas.

### Camadas entre arquivos de configuração

`autoMode` é mesclado entre configurações de sistema / usuário / workspace da mesma forma que outras configurações de permissão: arrays são concatenados e deduplicados.

## Interpretando a decisão

Quando o classificador bloqueia uma ação, a chamada de ferramenta falha com um dos seguintes textos de erro:

- **`Blocked by auto mode policy: <reason>`** — o classificador julgou a ação insegura. A razão vem do Estágio 2 do classificador.
- **`Auto mode classifier unavailable; action blocked for safety`** — a API do classificador estava inacessível, expirou ou retornou uma resposta não analisável. Este é um comportamento de falha-fechada: na dúvida, bloqueie.

Ambas as mensagens são seguidas por uma linha de orientação dizendo ao agente que a **ação negada especificamente** não deve ser concluída através de outra ferramenta, indireção de shell, script gerado, alias, symlink, alteração de configuração, hook, arquivo de comando, configuração MCP, payload codificado ou caminho equivalente. **Trabalhos seguros não relacionados e alternativas genuinamente mais seguras ainda são permitidos** — apenas tentativas de realizar a mesma intenção negada através de uma superfície diferente são bloqueadas.

Se a ação negada for genuinamente necessária, o agente deve parar e pedir sua aprovação explícita, em vez de contornar a negação.

### Idioma da razão do classificador

As razões do classificador são produzidas pelo LLM e não são traduzidas. Se você quiser razões em outros idiomas, adicione uma dica como `Respond reasons in Chinese` em `permissions.autoMode.environment`.

## Fallback para aprovação manual

O Modo Automático protege você contra travamentos:

- Após **3 bloqueios consecutivos de política**, a próxima chamada de ferramenta recai para o prompt padrão de aprovação manual. Isso captura o caso em que o agente continua tentando variantes menores de um comando proibido.
- Após **2 resultados consecutivos de indisponibilidade** (falhas na API do classificador), a próxima chamada de ferramenta também recai. Isso evita esperar por um classificador quebrado.

A sessão em si permanece no Modo Automático — apenas a única chamada de fallback passa por aprovação manual. Os contadores são reiniciados quando você aprova a chamada de fallback ou alterna de modo.

Se você estiver constantemente caindo em fallback, as causas mais prováveis são uma interrupção na API do classificador ou dicas que precisam de ajuste. Mude para o Modo Padrão enquanto investiga.

## Solução de problemas

**"O modo automático continua bloqueando meus comandos"**

Veja a razão na mensagem de erro. Se o classificador estiver sendo muito conservador para seu contexto, adicione uma entrada em `permissions.autoMode.hints.allow` descrevendo o padrão em linguagem natural. Exemplos:

- `"Building Docker images for this project (docker build ...)"`
- `"Running database migrations against the local test DB"`

**"Classificador do modo automático indisponível"**

A API do classificador não respondeu. Causas possíveis:

- Problema de rede entre você e o endpoint do modelo.
- O modelo rápido configurado não está mais disponível — verifique `/model --fast`.
- A transcrição é muito longa e excede a janela de contexto do modelo rápido.

Enquanto diagnostica, volte para o Modo Padrão: `/approval-mode default`.

**"Caindo em fallback para aprovação manual"**

Você atingiu a proteção de 3 bloqueios consecutivos ou 2 indisponibilidades consecutivas. Aprove ou rejeite o prompt como de costume. Após um fallback aprovado, o contador consecutivo é reiniciado.

**O classificador vê dados sensíveis nos meus prompts**

As entradas das ferramentas são projetadas através do método `toAutoClassifierInput` de cada ferramenta antes de chegarem ao classificador. Conteúdo de edição longo, prompts de busca web e prompts de subagente são truncados. Resultados de ferramentas (conteúdo de arquivos, páginas web) nunca são enviados ao classificador — apenas o texto do usuário e as chamadas de uso de ferramenta do assistente passam.

Se uma ferramenta específica está expondo campos que você prefere redigir, registre um problema com o nome da ferramenta; a projeção é por ferramenta e deve ser ajustada ao longo do tempo.

## Limitações

- **Não funciona offline.** O classificador requer uma chamada de LLM.
- **Adiciona latência no caminho lento.** Allowlist + acceptEdits cobrem a maioria das chamadas sem latência, mas um `run_shell_command` normalmente adiciona ~300ms (caminho rápido do classificador) ou ~3-5s (caminho lento com revisão de pensamento).
- **Não substitui regras `deny`.** O classificador é de melhor esforço. Para comandos que você tem certeza que nunca devem ser executados, coloque-os em `permissions.deny`.
- **Ferramentas MCP padrão para bloqueio conservador.** Ferramentas MCP de terceiros (`mcp__*`) optam por encaminhamento de argumentos através da substituição `toAutoClassifierInput`. Ferramentas que não optaram expõem apenas seu nome ao classificador — a maioria dessas chamadas é bloqueada de forma conservadora, a menos que você tenha escrito uma regra explícita de `allow`. Isso é falha-fechada por design (credenciais e conteúdo volumoso não vazam para o LLM do classificador). Se você confia em uma ferramenta MCP específica, adicione `permissions.allow: ["mcp__server__tool"]` para que ela ignore o classificador completamente.
## FAQ

**O Modo Automático envia meu código para terceiros?**

O Modo Automático reutiliza sua configuração de modelo existente — o mesmo endpoint do agente principal. Se você configurou o Qwen Code para usar um modelo auto-hospedado, o classificador também roda nesse endpoint.

**Meus segredos / conteúdo do `.env` chegarão ao classificador?**

O classificador vê apenas o que a projeção `toAutoClassifierInput` de cada ferramenta expõe:

- `read_file` e outras ferramentas somente leitura: não são invocadas (estão na lista de permissões do caminho rápido).
- `edit` / `write_file`: caminho do arquivo mais os primeiros 80 caracteres do conteúdo antigo/novo. O conteúdo completo não é encaminhado.
- `run_shell_command`: o comando completo (precisa ser — é isso que o classificador avalia).
- `web_fetch`: apenas a URL. O campo prompt não é encaminhado.
- `agent`: tipo do subagente mais o prompt completo. O prompt é a instrução que o subagente seguirá, então o classificador precisa dele completo para detectar ataques que tentariam direcionar o subagente a ações destrutivas — mesma razão pela qual `run_shell_command` encaminha o comando completo.

Os resultados das ferramentas (o conteúdo real retornado pelas ferramentas) são completamente removidos da transcrição do classificador.

Ferramentas MCP (`mcp__*`) seguem um padrão mais restrito: seus parâmetros não são encaminhados a menos que o autor da ferramenta MCP tenha explicitamente optado por meio da sobrescrita `toAutoClassifierInput`. O classificador vê o nome da ferramenta, mas nenhum argumento, então a maioria das chamadas MCP será bloqueada de forma conservadora, a menos que o usuário tenha escrito uma regra de permissão explícita. Isso é intencionalmente fail-closed — ferramentas de terceiros não devem vazar credenciais ou conteúdo volumoso de arquivos para o LLM do classificador sem intenção.

**Posso desabilitar a mensagem informativa da primeira vez?**

Ela aparece apenas uma vez por arquivo de configurações do usuário. Após descartar, `ui.autoModeAcknowledged: true` é definido nas suas configurações de usuário.

**Qual é a diferença entre isso e o Auto-Edit?**

O Auto-Edit aprova automaticamente edições de arquivos e nada mais — comandos de shell ainda perguntam. O Modo Automático usa um classificador para também aprovar automaticamente comandos de shell seguros e outras chamadas de ferramentas, enquanto ainda bloqueia os arriscados.

**Qual é a diferença entre isso e o YOLO?**

O YOLO aprova automaticamente tudo, sem qualquer revisão. O Modo Automático mantém o classificador no loop e bloqueia ações arriscadas.
