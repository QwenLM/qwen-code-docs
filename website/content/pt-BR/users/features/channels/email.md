# Email

Use uma caixa de correio dedicada para enviar tarefas ao Qwen Code via IMAP e receber respostas em texto simples por SMTP. A primeira conexão ignora mensagens já presentes na pasta selecionada. Conexões posteriores retomam o cursor UID salvo.

## Configurar e iniciar

Ative IMAP e SMTP para a caixa de correio e exporte suas credenciais para o ambiente do processo que executa o Qwen Code. Adicione este canal ao `settings.json`:

```json
{
  "channels": {
    "agent-mail": {
      "type": "email",
      "address": "agent @example.com",
      "imapHost": "imap.example.com",
      "imapUser": "agent @example.com",
      "imapPassword": "$AGENT_IMAP_PASSWORD",
      "smtpHost": "smtp.example.com",
      "smtpUser": "agent @example.com",
      "smtpPassword": "$AGENT_SMTP_PASSWORD",
      "privatePolicy": "allowlist",
      "allowedUsers": ["you @example.com"],
      "sessionScope": "chat_thread",
      "cwd": "/path/to/workspace"
    }
  }
}
```

Execute `qwen channel start agent-mail`. Os campos de senha aceitam as referências `$ENV_VAR` existentes; mantenha senhas em texto fora das configurações. O adapter desativa o log de protocolo e reporta falhas de conexão sem expor credenciais.

TLS implícito usa por padrão a porta 993 do IMAP e a porta 465 do SMTP. Para STARTTLS, defina `imapSecure` ou `smtpSecure` como `false`; as portas padrão passam a ser 143 e 587, respectivamente. STARTTLS e verificação de certificado permanecem obrigatórios. Substitua `imapPort` e `smtpPort` quando necessário. Para uma CA privada, configure `NODE_EXTRA_CA_CERTS` do Node antes de iniciar o Qwen Code.

| Opção | Padrão | Significado |
| --- | --- | --- |
| `folder` | `INBOX` | Uma pasta IMAP somente leitura |
| `pollInterval` | `60000` | Intervalo de polling em milissegundos |
| `maxMessageBytes` | `10485760` | Tamanho máximo da mensagem bruta; mensagens maiores são ignoradas |
| `maxAttachmentBytes` | `5242880` | Tamanho máximo de cada anexo; anexos maiores são omitidos |
| `maxTextLength` | `32000` | Máximo de caracteres de texto antes do corte de histórico citado/assinatura |
| `proactiveRecipients` | `[]` | Endereços de caixa de correio exatos permitidos para entrega proativa |

No máximo 16 anexos são encaminhados. Imagens PNG, JPEG, GIF e WebP usam a entrada de imagem existente; outros arquivos são armazenados em caminhos privados gerados durante a tarefa. Partes de calendário e mensagens/relatórios encapsulados não são suportados. HTML é convertido para texto sem carregar recursos remotos. As opções comuns de canal `cwd`, `model`, `instructions` e `sessionScope` se aplicam. O escopo padrão `chat_thread` separa remetentes e threads; escolher `single` compartilha explicitamente uma sessão do agente.

## Acesso e respostas

`privatePolicy` suporta `allowlist` (padrão), `open` e `disabled`; o legado `senderPolicy` também é reconhecido. Emparelhamento não é suportado nesta primeira versão. Endereços em `allowedUsers` e `operators` são normalizados para minúsculas; nomes de exibição não concedem acesso. Endereços ASCII puros são suportados. Use um provedor de caixa de correio que filtre e-mails forjados: uma allowlist de From não autentica o remetente.

Responda ao e-mail do agente para continuar a conversa. `Message-ID`, `In-Reply-To` e `References` associam a conversa ao seu remetente. As respostas têm como destino apenas esse remetente; `Reply-To`, CC, BCC e endereços dentro da tarefa não podem alterar os destinatários SMTP. Resultados de tarefas em segundo plano respondem por meio da thread aceita salva após o término do turno de origem. Remetentes no-reply podem iniciar tarefas, mas não recebem resposta. E-mails gerados pelo agente, automáticos, de listas de discussão e relatórios de entrega são ignorados.

Comandos de texto como `/help`, `/status` e respostas de permissão funcionam no corpo do e-mail. O e-mail usa `followup` como padrão e suporta `steer`. `collect` é rejeitado porque mensagens em buffer sobrevivem ao seu handler de admissão e não podem manter uma claim de conclusão durável individual. A admissão permanece ativa enquanto uma tarefa aguarda. Até 32 entregas ordinárias podem estar em andamento; um slot adicional permite respostas de controle e respostas de ocupado. Novas tarefas na capacidade máxima recebem uma solicitação para reenviar após o término de uma tarefa ativa.

A entrega proativa é desativada a menos que `proactiveRecipients` contenha o destino exato. Um destino proativo em thread também deve resolver para um remetente/thread conhecido e atualmente permitido. Destinos desconhecidos falham sem selecionar outro destinatário ou criar uma thread substituta. O adapter retém 256 rotas de resposta recentes, até 64 identificadores por rota e 1024 identidades de entrada recentes. O progresso de UID do IMAP continua a impedir o replay de entregas mais antigas após a expiração dessas entradas de metadados; uma rota de thread evictada não pode receber respostas proativas até que outra mensagem aceita a restaure.

## Recuperação

O estado reside em `$QWEN_HOME/channels/<workspace>/email-<account-hash>/state.json` (QWEN_HOME padrão é `~/.qwen`). O nome do canal, o workspace canônico e o endpoint/usuário/pasta da caixa de correio determinam o armazenamento. Apenas um processo pode ser seu proprietário. A troca de conta estabelece uma baseline separada; mudanças de UIDVALIDITY também ignoram o conteúdo existente da pasta.

O adapter persiste um UID em andamento antes de iniciar uma tarefa e um ID de mensagem `outboundPending` antes de cada envio SMTP, incluindo envios proativos. Remove cada registro após a conclusão da operação correspondente. Se o processo parar durante a execução ou o SMTP retornar um resultado incerto, o registro permanece. A reinicialização reporta o caminho do estado, UIDs pendentes e IDs de mensagens de saída e se recusa a fazer replay deles. Pare o canal, inspecione a caixa de correio e os efeitos colaterais da tarefa, e remova apenas UIDs reconciliados do array `pending` do estado e IDs de saída reconciliados de `outboundPending` antes de reiniciar. Mantenha o cursor e os metadados de thread intactos. Não exclua o arquivo de estado como mecanismo de retry: sua ausência cria uma nova baseline e ignora e-mails existentes.

Identificadores de thread de e-mail e o progresso de admissão sobrevivem a reinicializações. A restauração do histórico do agente segue o runtime do canal: o caminho standalone `channel start` atual não restaura suas sessões de agente salvas na inicialização a frio, enquanto workers do daemon restauram suas rotas.

Efeitos colaterais do agente, aceitação SMTP e um cursor local não podem ser confirmados em uma única transação. Parar o canal bloqueia turnos na fila antes que iniciem trabalho do agente. Operações já em execução no agente ainda podem ser concluídas. Esta política de recuperação evita a reexecução automática de trabalho incerto; requer reconciliação pelo operador após interrupção. Estado corrompido/ilegível também impede a inicialização. Diretórios de anexos antigos são removidos após a reconciliação e antes de receber novo trabalho.

OAuth do provedor, saída HTML rica, gerenciamento de caixa de correio, S/MIME, PGP e tratamento de calendário estão fora do escopo desta versão.