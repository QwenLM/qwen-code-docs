# Registro persistente de workspaces do daemon

## Objetivo

Workspaces adicionados a partir do Web Shell sobrevivem a um reinício do processo
`qwen serve` quando o daemon é relançado com o mesmo workspace primário e
`QWEN_HOME`.

## Propriedade do estado

O registro dinâmico de workspaces é configuração privada do usuário para o daemon,
não configuração de projeto nem saída de runtime descartável. Os registros são
armazenados em:

```text
${QWEN_HOME:-~/.qwen}/daemon/workspaces/<primary-scope-sha256>.json
```

O hash de escopo é o SHA-256 completo do caminho canônico do workspace primário
(em minúsculas no Windows). O arquivo repete o caminho primário para que um escopo
divergente ou corrompido seja rejeitado em vez de aplicado silenciosamente.

```json
{
  "schemaVersion": 1,
  "primaryWorkspace": "/repo/main",
  "workspaces": ["/repo/service-a"]
}
```

Apenas caminhos secundários canônicos são armazenados. Confiança, ambiente, ids de
workspace, sessões e erros de runtime são rederivados a cada inicialização do daemon.

## Ciclo de vida

O daemon de produção lê o pequeno arquivo de registro depois de resolver e
canonizar o workspace primário. Caminhos armazenados válidos são mesclados após
as entradas explícitas de `--workspace`. Entradas explícitas são autoritativas:
um caminho explícito malformado ou indisponível continua sendo um erro de
inicialização, enquanto um caminho armazenado indisponível é pulado com um aviso
e mantido em disco para um reinício posterior.

Caminhos recuperados entram no loop normal de construção do runtime secundário
antes que `WorkspaceRegistry` e as superfícies Express/ACP sejam montadas. Isso
mantém capacidades, montagens ACP qualificadas por workspace, agregação de status
e o limite total padrão de sessões consistentes com o conjunto de runtimes
restaurado.

Para adições locais ao processo após a montagem do app, as rotas ACP qualificadas
por workspace permanecem montadas sempre que um registry existir e criam uma
montagem secundária confiável de forma preguiçosa no primeiro uso. Isso evita que
um snapshot de inicialização de workspace único torne um registro posterior via
Web Shell inutilizável até o reinício.

`POST /workspaces` aceita `persist: true`. Uma requisição persistente bem-sucedida
não é confirmada até que a atualização do arquivo de registro seja concluída com
sucesso. Repetir uma requisição persistente para um workspace já ativo promove ou
confirma seu registro armazenado e tem sucesso de forma idempotente. Chamadores
existentes que omitem `persist` mantêm o comportamento atual, local ao processo.

`GET /workspace-registrations` expõe o conjunto armazenado desejado para
gerenciamento. `DELETE /workspace-registrations/:id` esquece um registro
armazenado; um runtime ativo permanece vivo até o reinício. O workspace primário
nunca pode ser armazenado ou esquecido através desta superfície.

## Segurança e comportamento em falhas

- O armazenamento é limitado a 24 caminhos secundários, cada um não mais longo
  que o limite de caminho de workspace do daemon.
- Leituras rejeitam symlinks, arquivos não regulares, arquivos acima do tamanho,
  JSON malformado, versões de schema desconhecidas e divergências de escopo
  primário.
- Escritas usam um mutex em processo, um lock entre processos e o helper
  compartilhado de escrita atômica de arquivo com modo `0600` e sem seguir
  symlinks.
- Armazenamentos corrompidos nunca são tratados como vazios pelos caminhos de
  mutação, evitando que uma adição posterior sobrescreva dados recuperáveis.
- Confiança persistida está deliberadamente ausente; workspaces restaurados
  passam pelo cálculo atual de pasta confiável.
- Entradas armazenadas que estão ausentes, inacessíveis, aninhadas ou acima do
  limite ativo são puladas sem excluir a entrada desejada. Entradas duplicadas
  tornam o armazenamento inválido e nunca são regravadas implicitamente.

## Compatibilidade

A capacidade aditiva `persistent_workspace_registration` anuncia o novo contrato.
A opção de requisição do SDK e o campo de resposta `persisted` são aditivos.
`runQwenServe` é responsável pela restauração automática na inicialização.
Embeds diretos de `createServeApp` ganham as rotas de gerenciamento de
persistência apenas quando um armazenamento de registro é fornecido
explicitamente, e continuam responsáveis por restaurar seu registry de workspaces
injetado antes da criação do app.

## Fronteira de acompanhamento

A remoção a quente permanece separada: esquecer um registro afeta o próximo
reinício, mas não encerra sessões nem descarta uma bridge de workspace ativa.
