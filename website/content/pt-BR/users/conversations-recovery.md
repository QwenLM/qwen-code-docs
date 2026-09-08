# Bloqueios e recuperação de writer de Conversations

Daemons atualizados podem compartilhar Conversations e usar sessões diferentes
ao mesmo tempo. Uma sessão carregada ainda tem apenas um writer. A ativação ao
vivo pertence somente ao publicador exato do Live locator estável; perder a
publicação Live não desativa as conversas standalone.

## Uma conversa não abre

`session_writer_conflict` significa que o writer fence impediu o acesso. Pode
significar que outro processo tem a conversa aberta, ou que um lock residual
não pode ser recuperado com segurança. Não é prova de que outro writer esteja
ativo no momento. `session_writer_unavailable` significa que a propriedade não
pôde ser verificada; tentar novamente não autoriza ignorar essa verificação.
Archive e delete podem retornar HTTP 200 com um erro de writer para uma sessão
individual. Verifique cada item do resultado.

Feche a conversa no processo Qwen proprietário normalmente, e então use **Try
again** na conversa afetada. Você pode continuar usando outras sessões. Não
crie uma conversa substituta apenas para fazer o erro desaparecer.

Após um desligamento abrupto, um reboot do Linux ou uma reinicialização de
container em um novo namespace de PID pode deixar um registro de writer ativo
não selado com fence indefinidamente. Pode não haver proprietário sobrevivente
para fechar. Siga
[Operator recovery for a residual lock](#operator-recovery-for-a-residual-lock)
em vez de tentar repetidamente; esta release não recupera automaticamente entre
esses limites de identidade.

Se persistir, habilite o log de debug local (`QWEN_DEBUG_LOG_FILE=1`) ao
iniciar o daemon afetado e inspecione os diagnósticos do daemon e do filho ACP.
Os diagnósticos de aquisição de lease incluem o ID da sessão, o tipo de erro e
o `lockPath` exato resolvido a partir do armazenamento de runtime desse writer.
Não tente adivinhar um caminho de lock a partir do workspace principal ou de um
diretório home padrão. Os erros HTTP/ACP públicos omitem intencionalmente
caminhos e registros de propriedade. Mantenha os arquivos de diagnóstico em
sigilo; não publique tokens de proprietário ou conteúdos de lock não
editados.

## Qual estado pode se recuperar automaticamente?

Estas regras se aplicam a leases de writer de sessão. Registros de proprietário
global legados usam a verificação de compatibilidade mais limitada descrita
abaixo.

- O fechamento normal libera o lease. Um handoff selado certificado é aceito
  somente quando sua prova de transcrição ainda é válida.
- Um writer ativo morto só pode ser recuperado quando as verificações de
  identidade existentes estabelecem que seu processo pertence ao mesmo domínio
  de atividade verificada.
- Writers ativos ou travados permanecem com fence. Matar um daemon é
  insuficiente se seu filho writer ACP sobreviver.
- Identidade de boot/processo estrangeira ou ausente não é prova de morte. Um
  PID ausente no seu namespace não prova que um writer estrangeiro encerrou.
- Registros malformados, identidade de transcrição incerta e reivindicações de
  transição residuais falham com fail closed. O tempo decorrido sozinho nunca
  autoriza a assunção de controle.

## Recuperação operacional para um lock residual

1. Identifique a sessão e o armazenamento exatos afetados a partir dos
   diagnósticos locais. Preserve o log de falha e um backup privado de sua
   transcrição e artefatos de lock. Registre quais binários e hosts podem
   acessar este armazenamento.
2. Pare ou faça o fence de **todo writer possível**, incluindo filhos ACP
   desanexados, outros daemons, containers, namespaces e máquinas que
   compartilham o filesystem. Verifique o fence a partir do host/namespace
   relevante. Se não puder estabelecer isso, pare aqui e consulte um operador
   que possa.
3. Inspecione o registro exato e quaisquer artefatos associados de
   reivindicação/aposentadoria com um mantenedor. Determine se a última
   transcrição e prova de handoff são autoritativas. Não edite campos de
   identidade de propriedade para fabricar uma correspondência.
4. Somente após os writers estarem com fence e as evidências estiverem com
   backup, mova artefatos residuais verificados individualmente para o
   armazenamento de recuperação privado sob supervisão do operador. Nunca exclua
   recursivamente um diretório de lock ou remova todos os locks.
5. Inicie um daemon atualizado, restaure a sessão original e verifique seu
   último turno registrado antes de adicionar novos. Mantenha os backups até que
   a continuidade seja confirmada. Traga outros daemons atualizados de volta
   somente após essa verificação.

Não há API de force-unlock nem assunção de controle automática entre boots/TTL
nesta release. Quando a propriedade segura não pode ser estabelecida, mantenha
o fence.

## Upgrade coordenado e rollback

O cutover do backend e as alterações de erro local/retry do Web Shell devem ser
publicados na mesma release. Este **não é um upgrade rolling de versões mistas**:
daemons mais antigos podem criar um proprietário global depois que um daemon
atualizado já tiver iniciado.

Antes do upgrade, drene todas as sessões antigas e trabalhos agendados, pare
todos os daemons antigos e seus filhos ACP, preserve os dados de runtime e
somente então inicie os binários atualizados. Um daemon atualizado que encontrar
um proprietário legado ativo retorna
`503 conversation_runtime_in_use`; após esse proprietário sair, tente novamente
sem reiniciar. Somente um registro legado obsoleto revalidado exatamente é
aposentado. Estado legado malformado ou inseguro requer investigação do
operador.

O registro legado `conversations/runtime-owner.json` carrega um PID e nonce, mas
nenhum hostname, boot ID ou identidade de namespace de PID. Sua verificação de
compatibilidade só pode testar se aquele PID existe no próprio host e namespace
de PID do daemon atualizado. Não pode detectar um writer antigo que está ativo
em outro lugar no armazenamento compartilhado. Esta é outra razão para fazer o
fence de todo writer possível antes de iniciar um daemon atualizado; a
verificação não torna seguros os upgrades entre hosts ou namespaces mistos.

Antes do rollback, drene e faça o fence de todo daemon e writer atualizado
também. Inventarie registros de esquemas ativos, selados, reivindicações,
aposentados e estendidos. Confirme que o binário alvo entende cada esquema
retido e estado de handoff; nunca alimente um esquema não suportado para um
writer mais antigo ou exclua seu registro protetor para fazer o rollback
prosseguir. Se a compatibilidade não puder ser estabelecida, mantenha os writers
parados e use a recuperação guiada pelo mantenedor ou o backup coerente
pré-upgrade. Nunca restaure uma transcrição antiga sobre turnos autoritativos
posteriores sem contabilizar explicitamente esses turnos.
