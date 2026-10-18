# Implantação de referência do Managed Agent


A distribuição de referência do Managed Agent é experimental. Sua topologia inicial aceita consiste em um plano de controle Java e seu Runtime Broker incorporado em um host Linux confiável, um banco de dados MySQL e um Qwen Hosted Harness compatível. O manifesto de compatibilidade em cada release é oficial para aquele release.

## Verificar e extrair

Baixe o arquivo, seu manifesto destacado e `SHA256SUMS.txt` a partir da mesma pré-release no GitHub. Verifique-os antes da extração:

```bash
sha256sum --check SHA256SUMS.txt
tar -xzf qwen-managed-agent-reference-<version>.tar.gz
cd qwen-managed-agent-reference-<version>
sha256sum --check SHA256SUMS
```

Inspecione `manifest.json`. Confirme que `source.revision` é a revisão avaliada, que `compatibility.qwenCodeVersion` corresponde à instalação do CLI/Harness e que `compatibility.databaseSchema.latestMigrationVersion` é aceitável para o banco de dados alvo. O release é inválido se qualquer verificação de checksum ou compatibilidade falhar.

## Pré-requisitos

- Linux no host confiável da aplicação.
- JDK 21 ou posterior.
- Node.js compatível com `compatibility.node` e Qwen Code compatível com `compatibility.qwenCodeVersion`.
- MySQL 8 com um banco de dados vazio ou um banco de dados previamente gerenciado por uma distribuição de referência compatível mais antiga.
- Diretórios privados e persistentes para o estado do Runtime e o Workspace autorizado.
- Credenciais estáveis do banco de dados, chave de credencial do Runtime e token do Harness armazenados fora do arquivo.

O arquivo Java não contém o CLI npm. Instale ou compile a revisão compatível exata do Qwen Code separadamente e localize seu `dist/cli.js` para os workers do Runtime.

## Iniciar o Hosted Harness

Escolha um token e um digest de capability e forneça os mesmos valores ao Harness e ao serviço Java:

```bash
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

QWEN_SERVER_TOKEN="$QWEN_MANAGED_AGENT_HARNESS_TOKEN" \
QWEN_HOSTED_HARNESS_CAPABILITY_DIGEST="$QWEN_MANAGED_AGENT_CAPABILITY_DIGEST" \
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

Mantenha o Harness no loopback. Anote a porta reportada; `--port` pode avançar caso a porta solicitada já esteja em uso.

## Iniciar o plano de controle Java

Em outro terminal, configure o mesmo Harness e o banco de dados:

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/qwen_managed_agent'
export SPRING_DATASOURCE_USERNAME='qwen'
export SPRING_DATASOURCE_PASSWORD='<private-password>'
export QWEN_MANAGED_AGENT_HARNESS_ENABLED='true'
export QWEN_MANAGED_AGENT_HARNESS_BASE_URL='http://127.0.0.1:4170'
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

bin/qwen-managed-agent-server
```

O launcher usa o JAR do servidor neste arquivo. O Spring Flyway aplica migrações progressivas do banco de dados antes de o serviço ficar pronto. Aguarde:

```bash
curl --fail http://127.0.0.1:8080/actuator/health
```

Esta configuração base suporta sessões hosted apenas de texto. Mantenha o listener no loopback a menos que um ingress assinado ou autenticado esteja configurado. A configuração completa de autenticação, API e capability está em `docs/server-reference.md`.

## Habilitar o caminho aceito de ferramentas em processo local

A execução de ferramentas requer a configuração existente de Runtime e Workspace em modo fail closed. No mínimo, configure:

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_WORKSPACE_ID='reference-workspace'
export QWEN_MANAGED_AGENT_WORKSPACE_CWD='/srv/qwen-workspace'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

Antes de admitir trabalho de arquivo, Shell ou Git filho, conclua o registro de armazenamento nativo e a verificação de identidade de montagem descritos em "Verified physical Workspace recovery" em `docs/server-reference.md`. Uma montagem não registrada ou ambígua deve permanecer indisponível. O Shell público e a publicidade de capability v2 permanecem desabilitados até que sua qualificação separada seja concluída.

## Atualização

1. Baixe e verifique o novo arquivo e leia ambos os manifestos. Confirme os novos requisitos de Qwen Code/Harness, Java, protocolo e banco de dados antes de mexer na implantação em execução.
2. Interrompa o novo ingress. Aguarde o trabalho admitido ser drenado conforme o procedimento de drenagem existente da implantação.
3. Faça backup do MySQL, `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`, da chave de credencial do Runtime e da distribuição antiga exata. Não rotacione a chave de credencial durante a atualização.
4. Pare o serviço Java e o Hosted Harness. Preserve o Workspace e o estado durável do Runtime.
5. Instale o Qwen Code/Harness compatível com o manifesto e inicie-o com o token e o digest de capability existentes.
6. Inicie o novo `bin/qwen-managed-agent-server` com as mesmas configurações de banco de dados e duráveis. O Flyway migra o schema para frente.
7. Exija uma resposta saudável do actuator, leia uma sessão e histórico existentes e conclua um novo turno sem ferramentas antes de reabrir o ingress. Requalifique qualquer capability opcional de ferramenta antes de habilitá-la.

Downgrade de banco de dados não é suportado. Se a inicialização ou validação falhar antes do tráfego ser retomado, corrija a configuração e tente novamente o mesmo artefato. Para retornar a uma versão cujo manifesto tenha um intervalo de schema mais antigo, restaure o backup do banco de dados pré-atualização e do estado do Runtime juntos antes de aceitar qualquer nova escrita; nunca execute um servidor mais antigo contra um banco de dados migrado por suposição.

## Rotacionar a chave de credencial do Runtime

Rotacione a chave de credencial separadamente de uma atualização de distribuição. Faça backup do banco de dados e das chaves atuais, configure o novo par ativo e mantenha o par antigo em `previous-credential-keys`:

```yaml
qwen:
  managed-agent:
    runtime-broker:
      credential-key-id: reference-v2
      credential-key: <base64-encoded-32-byte-v2-key>
      previous-credential-keys:
        '[reference-v1]': <base64-encoded-32-byte-v1-key>
```

Envolva cada chave de mapa em `[ ... ]`. O relaxed binder do Spring normaliza chaves simples — um ID como `legacy/v1`, `legacy:v1` ou `legacy v1` é vinculado como `legacyv1` esteja ele entre aspas no YAML ou não — então o ring nunca corresponde ao ID da chave persistida e as linhas escritas sob esse ID permanecem ilegíveis mesmo que a chave esteja configurada. A forma com colchetes preserva o ID exato.

Reinicie o plano de controle Java único, verifique se as vinculações existentes carregam e verifique se as novas linhas de vinculação registram `reference-v2`. Novos segredos usam apenas a chave ativa; linhas antigas permanecem criptografadas sob seu ID de chave registrado. O servidor não recriptografa linhas antigas na leitura, e remover uma chave ainda referenciada torna essas linhas ilegíveis.

Aposente `reference-v1` apenas quando nenhuma linha persistida o referenciar. `ma_runtime_binding.credential_key_id` e `ma_runtime_binding.runtime_credential_key_id` são as únicas referências persistidas; ambas armazenam bytes UTF-8. Selecione-os sem `CONVERT` para que a desduplicação permaneça exata em bytes, da mesma forma que a seleção de chave é: um valor convertido carrega o collation padrão do conjunto de caracteres e mesclaria dois IDs que diferem apenas em maiúsculas/minúsculas ou acento, ocultando uma chave que as linhas ainda referenciam.

```sql
SELECT DISTINCT credential_key_id AS key_id
FROM ma_runtime_binding WHERE credential_key_id IS NOT NULL
UNION
SELECT DISTINCT runtime_credential_key_id AS key_id
FROM ma_runtime_binding WHERE runtime_credential_key_id IS NOT NULL;
```

O resultado lista os IDs de chave que as linhas persistidas ainda requerem: espere apenas o ID ativo (`reference-v2`). Enquanto `reference-v1` aparecer, essa chave deve permanecer configurada.

O key ring é um mapa e não pode ser fornecido através de uma variável de ambiente `QWEN_MANAGED_AGENT_*`: o relaxed binding resolve silenciosamente uma forma de variável de ambiente para um ring vazio ou com chaves incorretas, sem erro de inicialização. Configure `previous-credential-keys` em um `application.yml` que o processo do servidor realmente carregue. A distribuição de referência não inclui arquivo de configuração, e o Spring resolve um `application.yml` externo em relação ao diretório de trabalho do processo (`./` e `./config/`), não em relação à raiz da distribuição; `bin/qwen-managed-agent-server` encaminha seus argumentos para a JVM, então `--spring.config.additional-location=file:<absolute-path>` fixa a localização. Uma implantação que depende apenas de variáveis de ambiente inicia com um ring vazio, então rotacionar `credential-key-id` sem configurar a chave anterior torna as linhas escritas sob ela ilegíveis.

O entry point de recuperação do operador lê o mesmo par ativo e o mapa `previous-credential-keys` que o servidor. Carregue o mesmo YAML externo para a recuperação, por exemplo com `SPRING_CONFIG_ADDITIONAL_LOCATION=file:<absolute-path>/application.yml`, e mantenha a nova chave ativa enquanto retém toda chave ainda referenciada por uma vinculação. Os mains de manutenção de CSI/migração, incluindo o probe CSI Hosted, ainda leem um único par de chaves de credencial; inicie esses entry points com a chave que criptografou sua vinculação alvo como o par ativo.

Após a configuração bem-sucedida do key ring, o servidor e o entry point de recuperação registram em log o ID ativo resolvido e os IDs configurados uma vez por instância de protetor. Esses IDs são identificadores não secretos já armazenados ao lado do texto cifrado; os diagnósticos fazem escape JSON de controles e caracteres não ASCII, preservam espaços e maiúsculas/minúsculas, e nunca incluem material de chave, texto cifrado ou tokens. Compare os IDs configurados com os IDs exatos retornados pela consulta de aposentadoria antes de usar a implantação rotacionada. Um erro de chave indisponível nomeia os IDs solicitados, ativos e configurados, para que um mapeamento normalizado silenciosamente ou digitado incorretamente possa ser localizado sem expor segredos. Este diagnóstico não prova que toda linha armazenada pode ser descriptografada.

## Recuperação do operador

`bin/qwen-managed-agent-operator-recovery` inicia o entry point de recuperação empacotado separadamente. Ele está desabilitado a menos que o ambiente específico de recuperação esteja configurado e não inicia o serviço HTTP nem o worker. Siga `docs/hosted-workspace-recovery.md`; nunca inferir parada física ou excluir linhas duráveis para remover uma cerca de segurança.

## Limite de escopo

Esta distribuição não certifica múltiplos planos de controle Java, takeover entre hosts, CSI público, retirement de Kubernetes, Shell público, publicidade v2 ou suporte de produção estável. Essas capabilities requerem evidência de release separada.