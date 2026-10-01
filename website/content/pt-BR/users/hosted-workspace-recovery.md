# Recuperação de Workspace Hosted pelo operador


Use este procedimento apenas para um worker durable local-process em Linux no host original cuja captura incompleta do Hosted Shell reteve um lease de Workspace. Uma reinicialização entre `prepare` e `complete` não remove o fence; o operador ainda deve verificar que todos os writers potenciais estão parados e não podem ser reiniciados, e então submeter a prova com `complete`. A recuperação torna o Workspace físico disponível para novas sessões. Ela não finaliza, repete nem certifica a chamada Shell original.

O comando de manutenção é distribuído como `qwen-managed-agent-server-*-operator-recovery.jar`. Execute-o no host worker original como a conta de serviço do SO, usando as configurações de banco de dados do serviço, a chave de credencial do Runtime e `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`. Defina `QWEN_MANAGED_AGENT_RUNTIME_DURABLE_LOCAL_PROCESS=true`, `QWEN_MANAGED_AGENT_RUNTIME_PROVISIONER=local-process` e `QWEN_MANAGED_AGENT_RUNTIME_OPERATOR_RECOVERY_ENABLED=true` para este processo de manutenção. Mantenha o ambiente de banco de dados e credenciais privado. Aplique a migração do banco de dados do serviço antes de executar o comando. O comando não inicia um listener HTTP, scheduler ou worker.

1. Encontre o `runtime.runtimeBindingId` e `runtime.generation` da execução afetada. Se o registro da execução não estiver disponível, um DBA autorizado pode usar uma consulta somente leitura em `qwen_runtime_binding` para o `tenant_id` e `workspace_id` afetados para listar `binding_id`, `runtime_generation` e `binding_state`; inspecione cada candidato e use apenas aquele com o lease mantido correspondente e a captura Shell. Execute `java -jar qwen-managed-agent-server-*-operator-recovery.jar inspect <bindingId> <generation>`. Registre o `holderKey`, sessão do Runtime, chamada Shell, `captureStatus` e `captureReason` retornados. A recuperação requer um resultado Shell `producer_lost` salvo e um lease de Workspace exato e ainda mantido. Um worker legado não suportado, identidade de registro ausente ou holder ausente não podem ser reparados criando registros de identidade substitutos.
2. Execute `java -jar qwen-managed-agent-server-*-operator-recovery.jar prepare <bindingId> <generation> <holderKey> '<motivo do incidente>'`. Salve o `recoveryId` retornado. Um binding ativo ou bloqueado por recuperação é fenced como `OPERATOR_RECOVERY`; um binding já LOST permanece LOST e é excluído da varredura de recuperação em background. Nenhum lease de Workspace é liberado. Repetir a mesma conta de serviço do SO e motivo é seguro. Uma conta, motivo, geração ou holder registrado diferente é rejeitado. Registre o operador humano separadamente no registro do incidente; `operator_id` identifica a conta do SO executando o comando.
3. Pare o worker original e inspecione **todos** os writers possíveis para o Workspace, incluindo filhos desanexados e supervisores externos. Impeça que o worker original e os writers sejam reiniciados. Confirme que eles pararam. Morte de grupo de processos, pipe EOF, tempo decorrido e perda do PID pai sozinhos são insuficientes. Se isso não puder ser estabelecido, pare aqui e deixe o Workspace fenced.
4. Crie um arquivo JSON UTF-8 regular, não-symlink, de no máximo 8 KiB diretamente dentro do diretório privado de estado do Runtime, modo `0600`, com exatamente estes campos (substitua os valores de exemplo):

   ```json
   {
     "version": 1,
     "recoveryId": "<recoveryId>",
     "verifiedAt": "2026-09-29T03:00:00Z",
     "method": "host inspection",
     "actions": "Stopped worker and detached writers; disabled their external restart source; verified no writer remains",
     "restartPrevention": true
   }
   ```

   `verifiedAt` deve ser um horário de verificação UTC real não anterior ao `prepare` e não mais que cinco minutos à frente do relógio do host de manutenção. Registre passos concretos e a fonte de prevenção de reinicialização; nunca escreva a declaração antes de concluir essas verificações. Mantenha o arquivo e o registro do incidente privados.

5. Execute `java -jar qwen-managed-agent-server-*-operator-recovery.jar complete <recoveryId> <absoluteEvidenceFile>`. O comando verifica a identidade exata do worker salvo e, na mesma inicialização, sua ausência; após uma reinicialização do host original, verifica a identidade de inicialização alterada. Em seguida, faz tombstone do registro, persiste a declaração imutável e recupera apenas o holder original. Pode ser repetido com o **mesmo arquivo** após uma falha ou um erro temporário de banco de dados. Uma declaração alterada é rejeitada. A saída bem-sucedida é `completed`.

Após a conclusão, inicie uma **nova** sessão e verifique se ela pode usar o Workspace. Inspecione o turno original separadamente: sua saída parcial e efeitos incertos permanecem incertos, e nenhuma chamada Shell é repetida via replay. Não limpe tabelas SQL ou arquivos de registro manualmente para contornar uma recusa. Se o registro original estiver ausente ou corrompido, ou o worker for de um modo efêmero mais antigo, este procedimento não é suportado; escale com a evidência preservada em vez de fabricá-la.

O software pode verificar a identidade do worker registrado e o holder SQL exato, mas não pode provar que descendentes arbitrários que escaparam pararam. A declaração do operador é o limite de confiança para esse fato.
