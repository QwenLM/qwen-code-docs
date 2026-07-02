# Modo Auto

O Modo Auto usa um classificador LLM para avaliar cada chamada de ferramenta e decidir
se deve aprová-la automaticamente. Ele fica entre o Auto-Edit (que aprova
automaticamente apenas edições de arquivos) e o YOLO (que aprova tudo automaticamente).

Esta página é a referência para configurar e solucionar problemas do Modo Auto.
Para uma introdução, consulte a
[visão geral do Modo de Aprovação](./approval-mode.md#4-auto-mode---classifier-driven-approval).

## Como funciona

Quando você está no Modo Auto e o agente tenta executar uma ferramenta, o Qwen Code
percorre três camadas em ordem:

1. **caminho rápido acceptEdits** — Edit / Write cujo caminho de destino está dentro
   do workspace é aprovado automaticamente sem invocar o classificador.
   **Exceção:** escritas nas próprias superfícies de automodificação do Qwen Code
   (`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`,
   nomes de arquivos de contexto configurados, `.qwen/rules/`, `.qwen/commands/`,
   `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`) e
   superfícies de persistência (`.git/`, `.husky/`, `package.json`, `.npmrc`,
   `Makefile`, `.github/workflows/`, etc.) são roteadas através do classificador
   mesmo quando estão dentro do workspace. Symlinks que apontam para caminhos
   protegidos também são resolvidos e rejeitados. Comandos shell que alcançam esses
   caminhos via `cd && bash -lc '...'` ou outros wrappers também passam pelo
   classificador.
2. **allowlist de ferramentas seguras** — Ferramentas integradas somente de leitura
   e somente de metadados (Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion, etc.)
   são aprovadas automaticamente sem invocar o classificador.
3. **classificador LLM** — Todo o resto (comandos shell, buscas na web,
   spawn de sub-agentes, edições fora do workspace, ferramentas MCP) é enviado para
   um classificador de dois estágios:
   - **Estágio 1 (rápido)** — retorna apenas `{ shouldBlock }`. Cerca de ~300ms.
     Se `shouldBlock` for `false`, a ação é permitida e a chamada
     prossegue.
   - **Estágio 2 (pensamento)** — executado apenas quando o Estágio 1 indicou bloqueio. Usa
     revisão chain-of-thought para reduzir falsos positivos do Estágio 1. Pode
     rebaixar o bloqueio do Estágio 1 para permissão. Retorna o `reason`
     visível para o usuário em caso de bloqueio.

O classificador usa o seu modelo rápido configurado
(`/model --fast`). Se nenhum modelo rápido estiver configurado, o modelo da sessão
principal é usado.

> [!tip]
>
> Comandos shell que o sistema de permissões detecta como somente leitura (por exemplo,
> `ls`, `cat`, `git log`) são aprovados automaticamente antes de chegar ao
> classificador. Defina `permissions.autoMode.classifyAllShell: true` para
> sobrescrever isso e rotear todos os comandos shell através do classificador —
> consulte [Classificar todos os comandos shell](#classify-all-shell-commands) abaixo.

## Regras rígidas ainda vencem

O Modo Auto **não** substitui as regras rígidas de permissão. Antes do classificador
ser executado:

- As regras `permissions.deny` bloqueiam a ação com o motivo da regra. O
  classificador nunca a vê.
- As regras `permissions.allow` com especificadores específicos (por exemplo,
  `Bash(git status)`, `Read(./docs/**)`) ainda são permitidas automaticamente sem o
  classificador — **exceto** quando a chamada é resolvida como uma escrita em um
  caminho protegido de automodificação ou persistência (veja a lista em
  "Como funciona"). Nesse caso, o Modo Auto reavalia a chamada através
  do classificador para que uma regra de permissão em `Bash(*)` não se transforme silenciosamente
  em permissão para reescrever configurações, comandos, hooks,
  skills ou servidores MCP do Qwen Code.
- As regras `permissions.ask` forçam a confirmação manual mesmo no Modo Auto.

## Regras de permissão amplas demais são removidas no Modo Auto

Regras como as seguintes permitiriam que o agente executasse código arbitrário
sem a revisão do classificador:

- `Bash` / `Bash(*)` / `Bash()` — permite automaticamente todos os comandos shell
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — wildcards de interpretadores
- `Agent` / `Agent(coder)` — qualquer permissão na ferramenta Agent
- `Skill` / `Skill(pdf)` — qualquer permissão na ferramenta Skill

Ao entrar no Modo Auto, o Qwen Code remove temporariamente essas regras do
conjunto de permissões ativas e exibe um aviso listando-as. As regras
voltam no momento em que você sai do Modo Auto. O `settings.json` nunca é
modificado.

Se você realmente precisa dessas regras amplas, use o modo YOLO.

## Configurando dicas (hints)

O Modo Auto lê `permissions.autoMode` do seu `settings.json`. As
entradas são descrições em linguagem natural, não padrões de regras — elas são
injetadas de forma aditiva no prompt do sistema do classificador junto com os
padrões integrados.

Existem três categorias de dicas mais uma lista de ambiente:

- **`allow`** — ações que o classificador deve aprovar automaticamente.
- **`softDeny`** — ações destrutivas ou irreversíveis que o classificador
  deve bloquear **a menos que a solicitação explícita mais recente do usuário tenha pedido
  exatamente essa ação e escopo**. Os soft denies podem ser anulados pela
  intenção do usuário; um "sim, faça o que quiser" genérico não conta.
- **`hardDeny`** — ações que cruzam limites de segurança que o classificador deve bloquear
  no Modo Auto, independentemente de `autoMode.hints.allow` ou da intenção recente do
  usuário. Esta é uma política do classificador, não uma regra de permissão
  determinística: ela não sobrescreve `permissions.allow`. Use `permissions.deny`
  para ações que nunca devem ser permitidas pelo gerenciador de permissões.

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

`hints.deny` ainda é aceito para compatibilidade com versões anteriores e é tratado
como `softDeny`. Misturar ambos não tem problema — as entradas são concatenadas, `softDeny`
primeiro.

### Limites de tamanho e contagem

Para manter o prompt do sistema do classificador pequeno:

- Cada entrada tem o limite de 200 caracteres (entradas mais longas são truncadas
  com um aviso).
- `hints.allow`, `hints.softDeny` e `hints.hardDeny` aceitam até 50
  entradas cada.
- `environment` aceita até 20 entradas.

### Mesclagem entre arquivos de configurações

`autoMode` é mesclado nas configurações de sistema / usuário / workspace da mesma
forma que outras configurações de permissão: os arrays são concatenados e
desduplicados.

### Classificar todos os comandos shell

Por padrão, comandos shell somente leitura (`ls`, `cat`, `git status`, …) são
aprovados automaticamente sem invocar o classificador — o sistema de permissões
os detecta como seguros na camada 3 e ignora o classificador completamente. Defina
`classifyAllShell` como `true` para forçar **todos** os comandos shell a passarem pelo
classificador, incluindo os somente leitura:

```json
{
  "permissions": {
    "autoMode": {
      "classifyAllShell": true
    }
  }
}
```

Isso é útil para ambientes de produção ou de alta segurança onde você
deseja defesa em profundidade: mesmo comandos aparentemente inofensivos são revisados pelo
classificador antes da execução. A contrapartida é a latência adicionada (~300ms
por chamada shell somente leitura) e a dependência da disponibilidade do classificador — se
a API do classificador estiver inacessível, os comandos shell somente leitura também serão
bloqueados (fail-closed).

> [!note]
>
> `classifyAllShell` afeta apenas comandos shell (`run_shell_command` e
> `monitor`). Ferramentas integradas somente leitura (`read_file`, `grep_search`,
> `glob`, `list_directory`, etc.) não são afetadas e continuam usando a
> allowlist do caminho rápido.

## Lendo a decisão

Quando o classificador bloqueia uma ação, a chamada da ferramenta falha com um dos
seguintes textos de erro:

- **`Blocked by auto mode policy: <reason>`** —
  o classificador considerou a ação insegura. O motivo vem do Estágio
  2 do classificador.
- **`Auto mode classifier unavailable; action blocked for safety`** —
  a API do classificador estava inacessível, expirou o tempo limite ou retornou uma
  resposta não analisável. Este é um comportamento fail-closed: na dúvida,
  bloqueie.

Ambas as mensagens são seguidas por uma linha de orientação final informando ao agente
que a **ação negada especificamente** não deve ser concluída através de
outra ferramenta, indireção de shell, script gerado, alias, symlink,
alteração de configuração, hook, arquivo de comando, configuração MCP, payload codificado
ou caminho equivalente. **Trabalhos seguros não relacionados e alternativas
genuinamente mais seguras ainda são permitidos** — apenas tentativas de realizar a mesma
intenção negada através de uma superfície diferente são bloqueadas.

Se a ação negada for genuinamente necessária, o agente deve parar e
pedir sua aprovação explícita em vez de contornar a negação.

### Idioma dos motivos do classificador

Os motivos do classificador são produzidos pelo LLM e não são traduzidos. Se você
deseja motivos em outro idioma, adicione uma dica como
`Responder motivos em português` em `permissions.autoMode.environment`.

## Retorno para aprovação manual

O Modo Auto protege você de ficar travado:

- Após **3 bloqueios consecutivos por política**, a próxima chamada de ferramenta retorna ao
  prompt padrão de aprovação manual. Isso captura o caso em que o
  agente continua tentando variantes menores de um comando proibido.
- Após **2 resultados consecutivos de indisponibilidade** (falhas na API do classificador)
  a próxima chamada de ferramenta também retorna. Isso evita a espera por um
  classificador quebrado.

A sessão em si permanece no Modo Auto — apenas a única chamada de fallback
passa pela aprovação manual. Os contadores são resetados quando você aprova a
chamada de fallback ou muda de modo.

Se você perceber que está constantemente atingindo o fallback, as causas mais prováveis
são uma interrupção na API do classificador ou dicas que precisam de ajuste. Mude para
o Modo Padrão enquanto investiga.

## Solução de problemas

**"O Modo Auto continua bloqueando meus comandos"**

Olhe o motivo na mensagem de erro. Se o classificador estiver sendo muito
conservador para o seu contexto, adicione uma entrada em
`permissions.autoMode.hints.allow` descrevendo o padrão em
linguagem natural. Exemplos:

- `"Construir imagens Docker para este projeto (docker build ...)"`
- `"Executar migrações de banco de dados no banco de dados de teste local"`

**"Classificador do Modo Auto indisponível"**

A API do classificador não respondeu. Possíveis causas:

- Problema de rede entre você e o endpoint do modelo.
- O modelo rápido configurado não está mais disponível — verifique `/model --fast`.
- A transcrição é muito longa e excede a janela de contexto do modelo rápido.

Enquanto diagnostica, volte para o Modo Padrão: `/approval-mode default`.

**"Retornando para aprovação manual"**

Você atingiu o limite de 3 bloqueios consecutivos ou 2 indisponibilidades consecutivas.
Aprove ou rejeite o prompt como faria normalmente. Após uma
aprovação de fallback, o contador consecutivo é resetado.

**O classificador vê dados confidenciais nos meus prompts**

As entradas das ferramentas são projetadas através do método `toAutoClassifierInput`
de cada ferramenta antes de chegarem ao classificador. Conteúdo longo de edição, prompts de busca
web e prompts de sub-agentes são truncados. Os resultados das ferramentas (conteúdo
de arquivos, páginas web) nunca são enviados ao classificador — apenas o texto do
usuário e as chamadas de uso de ferramentas do assistente passam por ele.

Se uma ferramenta específica estiver expondo campos que você prefere redigir, abra uma issue
com o nome da ferramenta; a projeção é por ferramenta e deve ser
refinada ao longo do tempo.

## Limitações

- **Não funciona offline.** O classificador requer uma chamada LLM.
- **Adiciona latência no caminho lento.** A allowlist + acceptEdits cobrem a maioria
  das chamadas sem latência, mas um `run_shell_command` tipicamente adiciona
  ~300ms (caminho rápido do classificador) ou ~3-5s (caminho lento com revisão
  de pensamento).
- **Não é um substituto para regras `deny`.** O classificador é "best-effort".
  Para comandos que você tem certeza que nunca devem ser executados, coloque-os em
  `permissions.deny`.
- **Ferramentas MCP têm bloqueio conservador por padrão.** Ferramentas MCP de terceiros
  (`mcp__*`) optam pelo encaminhamento de argumentos via sobrescrita
  `toAutoClassifierInput`. Ferramentas que não optaram expõem apenas seu nome ao
  classificador — a maioria dessas chamadas é bloqueada conservadoramente, a menos que você tenha
  escrito uma regra `allow` explícita. Isso é fail-closed por design (credenciais e
  conteúdo volumoso não vazam para o LLM do classificador). Se você confia em uma
  ferramenta MCP específica, adicione `permissions.allow: ["mcp__server__tool"]` para
  que ela ignore o classificador completamente.

## FAQ

**O Modo Auto envia meu código para terceiros?**

O Modo Auto reutiliza sua configuração de modelo existente — o mesmo endpoint do
agente principal. Se você configurou o Qwen Code para usar um modelo auto-hospedado,
o classificador também é executado nesse endpoint.

**Meus segredos / conteúdos de `.env` chegarão ao classificador?**

O classificador vê apenas o que a projeção `toAutoClassifierInput` de cada ferramenta
expõe:

- `read_file` e outras ferramentas somente leitura: não invocadas (estão na
  allowlist do caminho rápido).
- `edit` / `write_file`: file_path mais os primeiros 80 caracteres do
  conteúdo antigo/novo. O conteúdo completo não é encaminhado.
- `run_shell_command`: o comando completo (é necessário — é isso que o
  classificador avalia).
- `web_fetch`: apenas a URL. O campo prompt não é encaminhado.
- `agent`: tipo do subagente mais o prompt completo. O prompt é a
  instrução que o sub-agente seguirá, então o classificador precisa dele por completo
  para detectar ataques que direcionariam o sub-agente a ações destrutivas —
  pelo mesmo motivo `run_shell_command` encaminha o comando completo.

Os resultados das ferramentas (o conteúdo real retornado pelas ferramentas) são totalmente
removidos da transcrição do classificador.

As ferramentas MCP (`mcp__*`) seguem um padrão mais restrito: seus parâmetros
não são encaminhados a menos que o autor da ferramenta MCP tenha optado explicitamente via
sobrescrita `toAutoClassifierInput`. O classificador vê o nome da ferramenta,
mas nenhum argumento, então a maioria das chamadas MCP será bloqueada conservadoramente,
a menos que o usuário tenha escrito uma regra de permissão explícita. Isso é fail-
closed por design — ferramentas de terceiros não devem vazar credenciais ou
conteúdo volumoso de arquivos para o LLM do classificador sem intenção.

**Posso desativar a mensagem de informação da primeira vez?**

Ela é exibida apenas uma vez por arquivo de configurações do usuário. Após o descarte,
`ui.autoModeAcknowledged: true` é definido nas suas configurações de usuário.

**Como isso é diferente do Auto-Edit?**

O Auto-Edit aprova automaticamente edições de arquivos e nada mais — comandos shell
ainda pedem confirmação. O Modo Auto usa um classificador para também aprovar automaticamente
comandos shell seguros e outras chamadas de ferramentas, enquanto ainda bloqueia as arriscadas.

**Como isso é diferente do YOLO?**

O YOLO aprova tudo automaticamente sem nenhuma revisão. O Modo Auto tem o
classificador no loop e bloqueia ações arriscadas.