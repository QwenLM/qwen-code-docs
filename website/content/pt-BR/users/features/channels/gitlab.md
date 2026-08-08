# GitLab

Este guia cobre a configuração de um canal do Qwen Code que monitora todos do GitLab e responde a menções em issues e merge requests.

## Pré-requisitos

- Uma conta no GitLab (ou uma conta de bot dedicada)
- Um Personal Access Token do GitLab com os scopes `read_api` e `api`

## Criando um Token

1. Vá em **Preferences → Access Tokens**
2. Crie um token com estes scopes:
   - **read_api** — ler todos e dados do projeto
   - **api** — postar notas (comentários) em issues/MRs
3. Salve o token de forma segura como variável de ambiente

## Configuração

Adicione o canal em `~/.qwen/settings.json`:

```json
{
  "channels": {
    "my-gitlab": {
      "type": "gitlab",
      "token": "$GITLAB_TOKEN",
      "pollInterval": 60000,
      "senderPolicy": "open",
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "action_prompt_template": {
        "mentioned": "Project: %project% | URL: %project_url% | Author: %author% | Type: %target_type% | IID: %iid% | Title: %title% | Description: %description% | TodoID: %todo_id%"
      }
    }
  }
}
```

Defina o token como variável de ambiente:

```bash
export GITLAB_TOKEN="glpat-your_token_here"
```

### GitLab Self-hosted

Para instâncias self-hosted, defina `baseUrl`:

```json
{
  "baseUrl": "https://gitlab.example.com"
}
```

## Opções de Configuração

| Opção                    | Padrão                    | Descrição                                                  |
| ------------------------ | ------------------------- | ---------------------------------------------------------- |
| `token`                  | (obrigatório)             | PAT com os scopes `read_api` + `api`                       |
| `pollInterval`           | `60000`                   | Intervalo de polling em ms                                 |
| `baseUrl`                | `https://gitlab.com`      | URL da instância GitLab                                    |
| `action_prompt_template` | (obrigatório para processamento) | Mapeia nomes de ações do GitLab para templates de metadados |
| `groupPolicy`            | `"disabled"`              | Deve ser `"open"`, `"allowlist"` com o projeto listado, ou `"pairing"` com o projeto aprovado |
| `senderPolicy`           | `"allowlist"`             | Quem pode acionar o bot                                    |

## action_prompt_template

Este campo controla quais ações de todo são processadas e como os metadados são renderizados. Apenas ações com um template configurado são disparadas; todas as outras são ignoradas e marcadas como concluídas.

```json
{
  "action_prompt_template": {
    "mentioned": "Project: %project% | Author: %author% | Title: %title%"
  }
}
```

A ação `directly_addressed` (comentário que começa com `@bot`) usa automaticamente o template `mentioned` como fallback se não estiver configurada explicitamente.

### Chaves de Ação Disponíveis

| Chave                 | Gatilho                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `mentioned`           | Alguém @menciona o bot em um comentário ou descrição (não no início)      |
| `directly_addressed`  | Um comentário **começa com** `@bot` (usa o template `mentioned` como fallback) |
| `assigned`            | Alguém atribui o bot a uma issue/MR                                       |
| `review_requested`    | Alguém solicita o bot como reviewer em uma MR                             |
| `approval_required`   | Uma MR requer a aprovação do bot (regras de aprovação)                    |
| `marked`              | Alguém marca o comentário/issue/MR do bot (estrela)                       |
| `build_failed`        | Um pipeline CI/CD falha na branch/MR do bot                               |
| `unmergeable`         | Uma MR envolvendo o bot se torna não-mergeável (conflitos)                |
| `merge_train_removed` | Uma MR é removida do merge train                                          |

Apenas as chaves presentes em `action_prompt_template` são processadas. Ações não configuradas são ignoradas e marcadas como concluídas silenciosamente.

### Variáveis de Template

| Variável        | Valor                              |
| --------------- | ---------------------------------- |
| `%project%`     | Caminho do projeto (ex.: `owner/repo`) |
| `%project_url%` | URL completa do projeto            |
| `%author%`      | Username do autor do todo          |
| `%target_type%` | `Issue` ou `MergeRequest`          |
| `%iid%`         | ID interno da issue/MR             |
| `%title%`       | Título da issue/MR                 |
| `%description%` | Corpo da descrição da issue/MR     |
| `%todo_id%`     | ID do todo no GitLab               |
| `%%`            | `%` literal (escape)               |

Variáveis desconhecidas são preservadas como estão na saída.

### Montagem do Prompt

O template é renderizado em `envelope.metadata` (contexto estruturado). O texto que disparou a ação (`todo.body` ou descrição) vai para `envelope.text` (prompt principal). A classe base monta o prompt final enviado ao agente:

```
[alice] please fix this bug

Project: owner/repo | URL: https://gitlab.com/owner/repo | Author: alice | Type: Issue | IID: 42 | Title: Test Issue | Description: ... | TodoID: 100
```

- Linha 1: prefixo `[sender]` + `envelope.text` (com `@bot` removido)
- Linha 3: `envelope.metadata` (template renderizado, sanitizado)

Você **não** precisa de uma variável `%body%` — o texto do comentário/descrição é sempre o conteúdo principal do prompt, e o template fornece contexto complementar abaixo dele.

## ⚠️ Segurança

Em um **projeto público**, definir `senderPolicy: "open"` permite que **qualquer usuário do GitLab** que @mencionar o bot envie prompts que controlam o agente no seu `cwd`.

Sempre use `senderPolicy: "allowlist"` com `allowedUsers` explícito em projetos públicos.

Note que sob `groupPolicy: "pairing"`, o acesso é concedido por projeto: uma vez que um projeto é aprovado, **qualquer usuário do GitLab** pode controlar o bot através das issues e merge requests daquele projeto. Todo o tráfego do GitLab é tráfego de grupo, então `senderPolicy` e `allowedUsers` não controlam os membros de um projeto aprovado. As aprovações são indexadas pelo caminho do projeto (`owner/repo`), que muda em renomeações ou transferências — revogue aprovações de grupo obsoletas após qualquer renomeação, transferência ou exclusão de projeto.

## Detecção de Menção

O adapter sempre define `isMentioned = true` nos envelopes disparados, porque o GitLab já determinou a menção ao criar o todo. A configuração `action_prompt_template` é o filtro real de eventos — apenas ações com um template configurado são processadas. A menção `@bot` é removida do texto da mensagem antes do disparo via `stripBotMention`.

### ⚠️ groupPolicy Deve Ser "open", "allowlist" ou "pairing"

`groupPolicy` deve ser definido como `"open"`, `"allowlist"` com o projeto explicitamente listado, ou `"pairing"` para que os todos sejam processados. Sob `"pairing"`, a primeira menção de um projeto não aprovado cria uma solicitação de pareamento de grupo; aprove-a uma vez com `qwen channel pairing approve`, e os todos daquele projeto serão disparados a partir daí. O valor padrão `"disabled"` descarta todas as menções: os todos são marcados como concluídos e o cursor avança, mas nenhum disparo ocorre. Uma rejeição é registrada no log (`preflight rejected reason=group_disabled`), mas o todo ainda é consumido. Se o bot não estiver respondendo a menções, verifique se `groupPolicy` não está como `"disabled"`.

## Como Funciona

O adapter usa a API de Todos do GitLab como fonte de mensagens:

1. **Poll** `GET /todos?state=pending` para novos todos
2. **Drenagem do primeiro poll**: se o cursor nunca foi inicializado (`initialized: false`), todos os todos pendentes são marcados como concluídos sem disparo e o cursor avança para o ID máximo de todo. Isso evita um flood de backlog na primeira inicialização.
3. **Limpar todos obsoletos**: todos com `id <= cursor` são marcados como concluídos (melhor esforço) para evitar que sejam re-buscados em cada poll
4. **Filtrar** por `id > cursor` e `action_prompt_template` configurado
5. **Detectar tipo de menção** via âncora `target_url`:
   - `#note_123` presente → menção em comentário → texto é `todo.body` (o comentário)
   - Sem âncora → menção em descrição → texto é a descrição da issue/MR
6. **Disparar** o envelope via `handleInbound` (requer `groupPolicy: "open"`, `"allowlist"` com o projeto listado, ou `"pairing"` com o projeto aprovado)
7. **Avançar cursor** e **marcar todo como concluído** (melhor esforço)

O cursor (`lastProcessedId`) avança independentemente do sucesso ou falha do disparo. Disparos com falha postam um comentário de erro ⚠️ na issue/MR e não são re-tentados — o usuário pode @mencionar o bot novamente para disparar um novo todo.

## Feedback de Resposta

Para uma menção em comentário aceita (nota com âncora `#note_`), o canal adiciona um award emoji 👀 na nota enquanto o agente está trabalhando, e o remove quando a execução completa, falha ou é cancelada. Ambas as operações são de melhor esforço: uma falha de API ou permissão de award emoji é registrada no log e nunca impede a resposta final.

Menções em descrição (sem âncora `#note_`) não recebem award emoji porque não há uma nota específica para reagir.

## Limitações Conhecidas

- **A primeira execução ignora todos pendentes existentes.** O cursor é inicializado como `{ lastProcessedId: 0, initialized: false }` no primeiro lançamento. No primeiro ciclo de poll, todos os todos pendentes pré-existentes são marcados como concluídos sem disparo (a flag `initialized` controla essa drenagem única), evitando um flood de backlog.
- O bot não lê o histórico de conversas anteriores — apenas o conteúdo que disparou a ação é processado.
- **Notas confidenciais (internas):** Se alguém @mencionar o bot em uma nota confidencial, o corpo do todo contém esse texto interno e o agente irá processá-lo. A resposta do bot é sempre postada como uma nota **pública**, podendo expor discussões internas. A API de todos do GitLab não expõe a visibilidade da nota, então o adapter não consegue filtrar isso. Evite @mencionar o bot em notas confidenciais.
- Requer os scopes `read_api` + `api` no PAT. Tokens de nível de grupo ou de projeto funcionam se possuírem esses scopes.
- Todos para Epics, Designs e Alerts são ignorados (apenas Issues e MRs são processados).

## Iniciando o Canal

```bash
qwen channel start my-gitlab
```
