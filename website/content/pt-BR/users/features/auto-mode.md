# Modo Automático

O Modo Automático usa um classificador LLM para avaliar cada chamada de ferramenta e decidir se deve aprová-la automaticamente. Ele fica entre o Auto-Edit (que aprova automaticamente apenas edições de arquivos) e o YOLO (que aprova tudo automaticamente).

Esta página é a referência para configurar e solucionar problemas do Modo Automático.
Para uma introdução, veja a
[Visão geral do Modo de Aprovação](./approval-mode.md#4-auto-mode---classifier-driven-approval).

## Como funciona

Quando você está no Modo Automático e o agente tenta executar uma ferramenta, o Qwen Code
percorre três camadas em ordem:

1. **Atalho acceptEdits** — Edições/Escritas cujo caminho de destino está dentro
   do workspace são aprovadas automaticamente sem invocar o classificador.
   **Exceção:** escritas nas superfícies de auto-modificação do Qwen Code
   (`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`,
   nomes de arquivos de contexto configurados, `.qwen/rules/`, `.qwen/commands/`,
   `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`) e
   superfícies de persistência (`.git/`, `.husky/`, `package.json`, `.npmrc`,
   `Makefile`, `.github/workflows/`, etc.) passam pelo classificador
   mesmo quando estão dentro do workspace. Symlinks que apontam para caminhos
   protegidos também são resolvidos e rejeitados. Comandos shell que alcançam esses
   caminhos via `cd && bash -lc '...'` ou outros wrappers também passam pelo
   classificador.
2. **Lista de permissões de ferramentas seguras** — Ferramentas internas somente leitura e somente metadados
   (Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion, etc.) são
   aprovadas automaticamente sem invocar o classificador.
3. **Classificador LLM** — Todo o resto (comandos shell, buscas web,
   spawn de subagentes, edições fora do workspace, ferramentas MCP) é enviado para
   um classificador de dois estágios:
   - **Estágio 1 (rápido)** — retorna apenas `{ shouldBlock }`. Cerca de ~300ms.
     Se `shouldBlock` for `false`, a ação é permitida e a chamada
     prossegue.
   - **Estágio 2 (com raciocínio)** — só executa quando o Estágio 1 disse bloquear. Usa
     revisão com cadeia de pensamento para reduzir falsos positivos do Estágio 1. Pode
     rebaixar o bloqueio do Estágio 1 para permitir. Retorna o `reason`
     visível ao usuário quando bloqueia.

O classificador usa seu modelo rápido configurado
(`/model --fast`). Se nenhum modelo rápido estiver configurado, o modelo
da sessão principal é usado.

## Regras rígidas ainda prevalecem

O Modo Automático **não** substitui regras de permissão rígidas. Antes do classificador
executar:

- Regras `permissions.deny` bloqueiam a ação com o motivo da regra. O
  classificador nunca a vê.
- Regras `permissions.allow` com especificadores específicos (por exemplo,
  `Bash(git status)`, `Read(./docs/**)`) ainda permitem automaticamente sem o
  classificador — **exceto** quando a chamada resulta em uma escrita em um
  caminho de auto-modificação ou persistência protegido (veja a lista em
  "Como funciona"). Nesse caso, o Modo Automático reavalia a chamada através
  do classificador, para que uma regra de permissão em `Bash(*)` não possa silenciosamente
  se transformar em permissão para reescrever configurações, comandos, hooks,
  skills ou servidores MCP do Qwen Code.
- Regras `permissions.ask` forçam confirmação manual mesmo no Modo Automático.

## Regras de permissão muito amplas são removidas durante o Modo Automático

Regras como as seguintes permitiriam que o agente executasse código arbitrário
sem revisão do classificador:

- `Bash` / `Bash(*)` / `Bash()` — permite automaticamente todo comando shell
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — curingas de interpretador
- `Agent` / `Agent(coder)` — qualquer permissão na ferramenta Agent
- `Skill` / `Skill(pdf)` — qualquer permissão na ferramenta Skill

Ao entrar no Modo Automático, o Qwen Code remove temporariamente essas regras do
conjunto de permissões ativo e exibe um aviso listando-as. As regras
voltam no momento em que você sai do Modo Automático. O `settings.json` nunca é
modificado.

Se você realmente precisa dessas regras amplas, use o modo YOLO.

## Configurando dicas

O Modo Automático lê `permissions.autoMode` do seu `settings.json`. As
entradas são descrições em linguagem natural, não padrões de regra — elas são
injetadas de forma aditiva no prompt de sistema do classificador, junto com os
padrões internos.

Existem três categorias de dicas, além de uma lista de ambiente:

- **`allow`** — ações que o classificador deve aprovar automaticamente.
- **`softDeny`** — ações destrutivas ou irreversíveis que o classificador
  deve bloquear **a menos que a solicitação explícita mais recente do usuário tenha pedido
  exatamente aquela ação e escopo**. Negativas suaves podem ser ignoradas por
  intenção do usuário; um "sim, faça o que for preciso" genérico não conta.
- **`hardDeny`** — ações de fronteira de segurança que o classificador deve bloquear
  no Modo Automático independentemente de `autoMode.hints.allow` ou da
  intenção recente do usuário. Isso é política do classificador, não uma regra de permissão
  determinística: não sobrescreve `permissions.allow`. Use `permissions.deny`
  para ações que nunca devem ser permitidas pelo gerenciador de permissões.

```json
{
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": [
          "Executar poetry install e poetry update neste projeto Python",
          "Limpar artefatos de build em ./dist ou ./build",
          "Ler qualquer arquivo em /Users/me/code/"
        ],
        "softDeny": [
          "Editar configurações do Qwen Code a menos que eu peça explicitamente a alteração exata",
          "Executar scripts de migração que tocam no banco de dados de produção"
        ],
        "hardDeny": [
          "Enviar segredos ou conteúdo .env para qualquer endpoint de rede",
          "Modificar qualquer coisa em ~/.ssh ou ~/.aws"
        ]
      },
      "environment": [
        "Este é um monorepo privado com assinatura de commit rigorosa",
        "Credenciais de produção estão no 1Password, nunca em arquivos simples"
      ]
    }
  }
}
```

`hints.deny` ainda é aceito para compatibilidade reversa e é tratado
como `softDeny`. Misturar ambos é permitido — as entradas são concatenadas, `softDeny`
primeiro.

### Limites de comprimento e quantidade

Para manter o prompt de sistema do classificador pequeno:

- Cada entrada tem no máximo 200 caracteres (entradas mais longas são truncadas
  com um aviso).
- `hints.allow`, `hints.softDeny` e `hints.hardDeny` aceitam até 50
  entradas cada.
- `environment` aceita até 20 entradas.

### Combinação entre arquivos de configuração

`autoMode` é combinado entre configurações de sistema / usuário / workspace da
mesma forma que outras configurações de permissão: arrays são concatenados e
deduplicados.

## Lendo a decisão

Quando o classificador bloqueia uma ação, a chamada da ferramenta falha com um
dos seguintes textos de erro:

- **`Blocked by auto mode policy: <motivo>`** —
  o classificador julgou a ação insegura. O motivo vem do Estágio
  2 do classificador.
- **`Auto mode classifier unavailable; action blocked for safety`** —
  a API do classificador estava inacessível, expirou ou retornou uma
  resposta não analisável. Este é um comportamento de falha-fechada: na dúvida,
  bloqueie.

Ambas as mensagens são seguidas por uma linha de orientação informando ao agente
que a **ação negada especificamente** não deve ser concluída através de outra
ferramenta, indireção de shell, script gerado, alias, symlink, mudança de
configuração, hook, arquivo de comando, configuração MCP, payload codificado
ou caminho equivalente. **Trabalho seguro não relacionado e alternativas genuinamente
mais seguras ainda são permitidas** — apenas tentativas de realizar a mesma
intenção negada através de uma superfície diferente são bloqueadas.

Se a ação negada for genuinamente necessária, o agente deve parar e
pedir sua aprovação explícita, em vez de contornar a negação.

### Idioma dos motivos do classificador

Os motivos do classificador são gerados pelo LLM e não são traduzidos. Se você
quiser motivos em outro idioma, adicione uma dica como
`Responda os motivos em português` a `permissions.autoMode.environment`.

## Fallback para aprovação manual

O Modo Automático protege você de ficar travado:

- Após **3 bloqueios consecutivos por política**, a próxima chamada de ferramenta cai para
  o prompt padrão de aprovação manual. Isso captura o caso em que o
  agente continua tentando pequenas variações de um comando proibido.
- Após **2 resultados consecutivos de indisponibilidade** (falhas na API do classificador)
  a próxima chamada de ferramenta também cai para fallback. Isso evita esperar por um
  classificador quebrado.

A sessão em si permanece no Modo Automático — apenas a chamada de fallback única
passa por aprovação manual. Os contadores são redefinidos quando você aprova a
chamada de fallback ou muda de modo.

Se você se vir constantemente atingindo o fallback, as causas mais prováveis
são uma interrupção na API do classificador ou dicas que precisam de ajustes. Mude para
o Modo Padrão enquanto investiga.

## Solução de problemas

**"O modo automático continua bloqueando meus comandos"**

Veja o motivo na mensagem de erro. Se o classificador estiver sendo muito
conservador para seu contexto, adicione uma entrada em
`permissions.autoMode.hints.allow` descrevendo o padrão em
linguagem natural. Exemplos:

- `"Construir imagens Docker para este projeto (docker build ...)"`
- `"Executar migrações de banco de dados no banco de teste local"`

**"Classificador do modo automático indisponível"**

A API do classificador não respondeu. Causas possíveis:

- Problema de rede entre você e o endpoint do modelo.
- O modelo rápido configurado não está mais disponível — verifique `/model --fast`.
- O transcrição está muito longa e excede a janela de contexto do modelo rápido.

Enquanto diagnostica, volte ao Modo Padrão: `/approval-mode default`.

**"Caindo para aprovação manual"**

Você atingiu o limite de 3 bloqueios consecutivos ou 2 indisponibilidades consecutivas.
Aprove ou rejeite o prompt como faria normalmente. Após uma
chamada de fallback aprovada, o contador consecutivo é redefinido.

**O classificador vê dados sensíveis nos meus prompts**

As entradas das ferramentas são projetadas através do método `toAutoClassifierInput`
de cada ferramenta antes de chegarem ao classificador. Conteúdo longo de edição, prompts de
busca web e prompts de subagentes são truncados. Resultados de ferramentas (conteúdos de
arquivos, páginas web) nunca são enviados ao classificador — apenas o texto do usuário
e as chamadas de ferramentas do assistente passam por ele.

Se uma ferramenta específica estiver expondo campos que você prefere ocultar, abra uma issue
com o nome da ferramenta; a projeção é por ferramenta e deve ser
ajustada ao longo do tempo.

## Limitações

- **Não funciona offline.** O classificador requer uma chamada LLM.
- **Adiciona latência no caminho lento.** A lista de permissões + acceptEdits cobrem a maioria
  das chamadas sem latência, mas um `run_shell_command` tipicamente adiciona
  ~300ms (caminho rápido do classificador) ou ~3-5s (caminho lento com revisão
  com raciocínio).
- **Não substitui regras `deny`.** O classificador é de melhor esforço.
  Para comandos que você tem certeza que nunca devem ser executados, coloque-os em
  `permissions.deny`.
- **Ferramentas MCP padrão para bloqueio conservador.** Ferramentas MCP de terceiros
  (`mcp__*`) optam por encaminhamento de argumentos através da sobrescrita
  `toAutoClassifierInput`. Ferramentas que não optaram expõem
  apenas seu nome ao classificador — a maioria dessas chamadas é
  bloqueada de forma conservadora, a menos que você tenha escrito uma regra `allow`
  explícita. Isso é falha-fechada por design (credenciais e conteúdo
  volumoso não vazam para o LLM do classificador). Se você confia em uma
  ferramenta MCP específica, adicione `permissions.allow: ["mcp__server__tool"]` para que
  ela ignore o classificador completamente.

## FAQ

**O Modo Automático envia meu código para terceiros?**

O Modo Automático reutiliza sua configuração de modelo existente — mesmo endpoint que
o agente principal. Se você configurou o Qwen Code para usar um modelo
auto-hospedado, o classificador também executa contra esse endpoint.

**Meus segredos / conteúdo `.env` chegarão ao classificador?**

O classificador vê apenas o que a projeção `toAutoClassifierInput` de cada ferramenta
expõe:

- `read_file` e outras ferramentas somente leitura: não são invocadas (estão na
  lista de permissões de atalho).
- `edit` / `write_file`: caminho do arquivo mais os primeiros 80 caracteres do
  conteúdo antigo/novo. O conteúdo completo não é encaminhado.
- `run_shell_command`: o comando completo (é necessário — é o que o
  classificador julga).
- `web_fetch`: apenas a URL. O campo `prompt` não é encaminhado.
- `agent`: tipo do subagente mais o prompt completo. O prompt é a
  instrução que o subagente seguirá, então o classificador precisa dele
  por completo para detectar ataques que direcionariam o subagente para
  ações destrutivas — mesma razão pela qual `run_shell_command` encaminha o
  comando completo.

Os resultados das ferramentas (o conteúdo real retornado pelas ferramentas) são removidos
da transcrição do classificador por completo.

Ferramentas MCP (`mcp__*`) seguem um padrão mais rigoroso: seus parâmetros não
são encaminhados a menos que o autor da ferramenta MCP tenha optado explicitamente via a
sobrescrita `toAutoClassifierInput`. O classificador vê o nome da ferramenta
mas nenhum argumento, então a maioria das chamadas MCP será bloqueada
de forma conservadora, a menos que o usuário tenha escrito uma regra explícita de permissão. Isso é
falha-fechada por design — ferramentas de terceiros não devem vazar credenciais ou
conteúdo de arquivo volumoso para o LLM do classificador sem intenção.

**Posso desabilitar a mensagem informativa da primeira vez?**

Ela só aparece uma vez por arquivo de configuração do usuário. Após descartá-la,
`ui.autoModeAcknowledged: true` é definido em suas configurações de usuário.

**Como isso é diferente do Auto-Edit?**

O Auto-Edit aprova automaticamente edições de arquivos e nada mais — comandos
shell ainda perguntam. O Modo Automático usa um classificador para também aprovar automaticamente
comandos shell seguros e outras chamadas de ferramenta, enquanto ainda bloqueia as
arriscadas.

**Como isso é diferente do YOLO?**

O YOLO aprova automaticamente tudo sem qualquer revisão. O Modo Automático tem o
classificador no loop e bloqueia ações arriscadas.