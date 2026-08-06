# GitHub

Este guia cobre a configuração de um canal do Qwen Code que monitora notificações do GitHub e responde a menções, solicitações de review, atribuições e atividade de threads seguidas.

## Pré-requisitos

- Uma conta do GitHub autenticada com as permissões necessárias para ler notificações e publicar comentários
- O [GitHub CLI](https://cli.github.com/) instalado no host que executa o Qwen Code ao usar autenticação local do `gh`

Use uma conta de bot dedicada quando a conta autenticada também precisar operar o canal. O GitHub não gera uma notificação utilizável para a atividade da própria conta, e o adapter ignora seus próprios comentários para evitar loops de resposta.

## Autenticação

Para reutilizar o login do GitHub CLI no host do Qwen Code, autentique o `gh` e defina explicitamente `useLocalGh: true` na configuração do canal:

```bash
gh auth login
```

A autenticação local do `gh` é global para a conta e pode expor notificações de todos os repositórios visíveis para aquela conta do GitHub. Habilite-a apenas quando o operador do workspace for confiável para usar aquela conta. Caso contrário, configure um PAT dedicado.

Para o GitHub Enterprise Server, autentique o mesmo host usado por `baseUrl`:

```bash
gh auth login --hostname github.example.com
```

Você também pode configurar um classic personal access token (PAT). Um `token` explícito sobrescreve a autenticação local do `gh`. O PAT precisa destes escopos:

- **notifications** — ler threads de notificação
- **public_repo** (ou **repo** para repos privados) — publicar comentários

## Configuração

Adicione o canal em `~/.qwen/settings.json`:

```json
{
  "channels": {
    "my-github": {
      "type": "github",
      "useLocalGh": true,
      "pollInterval": 60000,
      "reasonFilter": ["mention", "review_requested", "assign"],
      "senderPolicy": "allowlist",
      "allowedUsers": ["operator-github-username"],
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "blockStreaming": "off",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Para sobrescrever a autenticação local do `gh` com um PAT, adicione `"token": "$GITHUB_TOKEN"` ao canal e defina a variável de ambiente antes de iniciar o Qwen Code:

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

A conta autenticada não pode acionar seu próprio canal. Se essa conta precisar operar o canal, autentique uma conta de bot separada e coloque apenas contas de operador em `allowedUsers`. A inicialização rejeita uma allowlist contendo apenas a conta autenticada e avisa quando ela aparece junto a outros operadores.

### GitHub Enterprise

Para o GitHub Enterprise Server, defina `baseUrl`:

```json
{
  "baseUrl": "https://github.example.com/api/v3"
}
```

A autenticação local do `gh` requer um `baseUrl` HTTPS para que a credencial do host do daemon não seja enviada por HTTP em texto plano.

## Opções de Configuração

| Opção                     | Padrão                   | Descrição                                                                                    |
| ------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `token`                   | não definido             | PAT clássico opcional com escopo `notifications`; sobrescreve a autenticação local do `gh`   |
| `useLocalGh`              | `false`                  | Reutilizar explicitamente a autenticação do GitHub CLI da conta do host do daemon            |
| `pollInterval`            | `60000`                  | Intervalo de poll em ms                                                                      |
| `baseUrl`                 | `https://api.github.com` | URL base da API (para GHE)                                                                   |
| `groupPolicy`             | `"disabled"`             | Deve ser `"open"` para que as notificações fluam                                             |
| `senderPolicy`            | `"allowlist"`            | Quem pode acionar o bot                                                                      |
| `groups.*.requireMention` | `true`                   | Exigir @menções para comentários comuns; motivos de notificação direcionados ainda executam  |
| `blockStreaming`          | `"off"`                  | Sempre forçado para `"off"`; chunks intermediários do modelo não são publicados; `"on"` não é suportado |
| `reasonFilter`            | não definido             | Allowlist opcional de motivos de notificação do GitHub a processar                           |

Use `reasonFilter` para descartar classes de notificação ruidosas como `ci_activity` ou `state_change`. Não use `reasonFilter: ["mention"]` como substituto para `groups.*.requireMention`: o motivo `mention` do GitHub é persistente no nível da thread, então novas @menções reais podem chegar depois sob `comment`, `subscribed`, `author` ou outros motivos e seriam ignoradas.

Valores válidos de `reasonFilter` são `mention`, `review_requested`, `assign`, `author`, `comment`, `ci_activity`, `manual`, `state_change`, `subscribed`, `team_mention`, `security_alert`, `approval_requested`, `invitation`, `member_feature_requested` e `security_advisory_credit`.

Notificações filtradas são marcadas como lidas apenas após todo o trabalho aceito na janela de poll ser concluído. Remover o filtro posteriormente não irá reprocessar notificações que o canal já ignorou.

## ⚠️ Segurança

Em um **repositório público**, definir `senderPolicy: "open"` permite que **qualquer usuário do GitHub** que acionar um motivo de notificação suportado envie prompts que controlam o agente no seu `cwd`. Isso inclui ler código, gastar tokens, publicar comentários e (sujeito à política de permissões) executar ferramentas.

Sempre use `senderPolicy: "allowlist"` com `allowedUsers` explícito em repos públicos.

Entradas de allowlist e pairing seguem o **username**, não o ID imutável da conta. Se um usuário na allowlist renomear sua conta do GitHub, remova a entrada obsoleta — o GitHub libera o username antigo para qualquer outra pessoa reivindicar, e o novo detentor herdaria a autorização da allowlist/pairing.

## Detecção de Menções

O adapter detecta menções escaneando o texto de comentários e os bodies de issues ou PRs de primeiro contato por `@bot-username` usando uma regex case-insensitive. Ele não confia apenas em `reason: "mention"` porque esse valor é persistente no nível da thread. Outros motivos selecionam prompts de review, triagem, thread seguida ou fallback.

## Como Funciona

O adapter usa a Notifications API do GitHub como sinal de ativação:

1. **Poll** `GET /notifications` para threads não lidas
2. **Enumera** comentários via `listComments` dentro de uma janela de tempo baseada em cursor
3. **Persiste o trabalho aceito** antes do dispatch, incluindo o envelope de origem e chaves de deduplicação
4. **Dispatch** por motivo de notificação: correspondência estrita de menção, review de pull request, triagem de issue, agregação de comentários de thread seguida, ou fallback por comentário
5. **Confirma a janela de poll** apenas após o trabalho aceito ser concluído: marca notificações como lidas e avança o cursor
6. **Fallback de primeiro contato**: um body de issue/PR não lido e novo pode ser processado quando nenhum comentário foi despachado; notificações de menção ainda requerem uma menção real no body

A janela de comentários é `(previousCursor, currentMaxUpdatedAt]`. Tarefas aceitas, em execução e com falha são armazenadas em `~/.qwen/channels/<workspace-scope>/` com permissões de arquivo privadas. Na reinicialização, o canal recupera essas tarefas antes de fazer poll do GitHub novamente. Tarefas com falha são tentadas até três vezes, depois se tornam terminais; tarefas canceladas são terminais e não são reexecutadas. Uma tarefa cuja resposta final já foi publicada, suprimida ou enfileirada para retry definitivo de não-escrita não é reexecutada.

O cursor de notificação não avança enquanto houver tarefas recuperáveis, ou quando o estado de tarefas recebidas não pode ser lido ou escrito. Isso evita que uma falha de crash ou do agente perca um comentário aceito e preserva as chaves de deduplicação necessárias para evitar um segundo dispatch a partir do feed de notificações.

Atividade que não é comentário (push, alterações de label) atualiza o `updated_at` da notificação, mas produz zero novos comentários na janela, então threads rebuscadas são ignoradas sem acionar o agente.

## Feedback de Resposta

Para um comentário de issue ou pull request aceito, o canal adiciona a reação `👀` do GitHub enquanto o agente está trabalhando, depois a remove quando a execução é concluída, falha ou é cancelada. Ambas as operações são best-effort: uma falha de API de reação ou permissão é registrada e nunca impede a resposta final.

### Output apenas final

O canal do GitHub sempre força entrega final-only. O adapter define `blockStreaming` como `"off"`, então chunks intermediários do modelo nunca são publicados como comentários separados e `blockStreaming: "on"` não é suportado.

```json
{
  "blockStreaming": "off"
}
```

Se o GitHub retornar uma falha de entrega definitiva de não-escrita, como uma resposta de rate-limit, o canal armazena a resposta final em `~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-pending-deliveries.json` com permissões de arquivo privadas e a reprocessa na próxima inicialização do canal. A tarefa recebida correspondente permanece no estado `reply_pending` até que essa entrega seja bem-sucedida ou atinja uma falha terminal definitiva. Falhas de entrega ambíguas não são reprocessadas automaticamente porque o GitHub pode ter criado o comentário.

## Limitações Conhecidas

- **A primeira inicialização ignora notificações não lidas existentes.** O cursor é inicializado para "agora" no primeiro lançamento. Notificações criadas antes do bot iniciar não são processadas, a menos que a thread receba nova atividade depois.
- Se um usuário marcar uma notificação como lida no github.com antes do ciclo de poll do bot, o bot não irá processá-la.
- O bot não lê comentários antes da janela de poll atual; notificações `author` e `comment` podem agregar até 20 comentários dessa janela.
- Comentários de review inline de PR e bodies de resumo de review não são enumerados; apenas comentários de issue/PR são processados.
- A credencial selecionada deve suportar a Notifications API. PATs fine-grained não a suportam; use autenticação local do `gh` ou um PAT clássico com escopo `notifications`.

## Iniciando o Canal

```bash
qwen channel start my-github
```
