# Baseline de fortalecimento multi-workspace do daemon

Status: baseline de implementação atual e contrato de revisão para a issue
[#6378](https://github.com/QwenLM/qwen-code/issues/6378). Este documento
encerra a fase de fortalecimento; ele não é um roadmap para adicionar novas
funcionalidades ao daemon.

## Modelo de propriedade

Cada rota do daemon e operação subsequente pertence a exatamente uma destas
classes de propriedade:

| Propriedade               | Significado                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global do processo        | Um recurso de listener/processo compartilhado por todos os runtimes, como autenticação, limites de rate HTTP, limites de conexão, métricas e desligamento.                                                       |
| Primário legado           | Uma rota de compatibilidade cujo contrato tem como alvo intencionalmente o runtime primário. Omitir um seletor de workspace não é permissão para adivinhar outro proprietário.                                     |
| Qualificado por workspace | Uma rota resolve primeiro um id explícito de workspace, depois um cwd absoluto canônico codificado, e despacha apenas para esse runtime selecionado.                                                              |
| Proprietário de sessão ao vivo | Uma rota singular de sessão ao vivo varre os runtimes registrados em busca da ponte única que possui a sessão e despacha apenas para lá.                                                                     |
| Workspace persistido      | Uma rota resolve o workspace antes de ler sua sessão persistida ou armazenamento de organização; ela pode expor uma superfície somente leitura declarada para um secundário não confiável sem iniciar o ACP.     |

O workspace primário é o runtime da primeira inicialização e o padrão de
compatibilidade para rotas que documentam explicitamente esse fallback. Ele
não é um fallback genérico quando a resolução falha.

## Semântica de falha

| Estado                             | Comportamento exigido                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace ou sessão desconhecidos  | Fail closed com a resposta estável de incompatibilidade/não encontrado da rota. Não sondar nem executar contra o primário.                                                                                                                                                                   |
| Workspace não confiável            | Rejeitar execução e mutação apoiadas em runtime. Um secundário não confiável pode usar apenas superfícies somente leitura explicitamente documentadas, incluindo sistema de arquivos limitado e leituras de catálogo/transcrição persistidas, sem iniciar o ACP nem escrever estado de reparo. O pré-aquecimento do primário legado não autoriza requisições. |
| Proprietário ambíguo de sessão ao vivo | Retornar um erro de servidor porque o despacho não pode ser feito com segurança. Não executar em nenhuma ponte.                                                                                                                                                                        |
| Runtime em bootstrap               | Manter a atividade global do processo responsiva; trabalho apoiado em runtime aguarda ou reporta a falha de inicialização declarada. O deep health retorna `503` com um motivo enquanto a agregação está indisponível.                                                                      |
| Runtime em drenagem                | Recusar novo trabalho com a resposta estável de drenagem. Uma remoção não forçada faz rollback com `workspace_busy` se houver atividade; uma remoção forçada solicita terminação e limpeza limitada dos recursos ativos. O runtime permanece na contabilidade global do daemon até a remoção completar. |
| Runtime removido                   | Tratá-lo como desconhecido. Ele deve desaparecer das capabilities, do roteamento e da agregação de health antes que o mesmo workspace possa ser readicionado. A limpeza após o ponto de commit da persistência é de melhor esforço; falhas são registradas e não restauram o roteamento.   |

## Invariantes

- A resolução de workspace nunca faz fallback para o primário após um
  resultado desconhecido, não confiável, ambíguo, em drenagem ou removido.
- Ids de workspace têm precedência sobre seletores cwd codificados. Seletores
  cwd devem ser absolutos e canonicalizar para um runtime registrado.
- Cada runtime de workspace ativo possui seu snapshot de ambiente, ponte,
  serviços de workspace, limite de sistema de arquivos/confiança, estado de
  Voice e limite de recursos ACP/MCP. A produção tenta pré-aquecer a ponte
  primária para compatibilidade e tenta novamente no primeiro uso após uma
  falha de pré-aquecimento. Um secundário confiável inicia seu filho ACP sob
  demanda e, quando `mcp_workspace_pool` está habilitado, possui o pool dentro
  desse filho; um secundário não confiável não deve iniciar nenhum dos dois. O
  pré-aquecimento do primário não contorna os gates de confiança da rota. Um
  coordenador de Voice global do processo aplica o teto de admissão
  compartilhado enquanto rastreia leases por runtime proprietário. Chaves de
  ambiente com o mesmo nome não devem cruzar runtimes, e um overlay de
  workspace não deve alterar o ambiente do processo pai.
- Um único token do daemon autentica o processo; ele não é uma ACL por
  workspace. Limites de rate HTTP, tetos de listener, admissão total de
  sessões, métricas, desligamento e o raio de falha do processo também são
  globais do daemon.
- Quando `mcp_workspace_pool` é anunciado, os transportes MCP e a contagem de
  orçamento são compartilhados por sessões dentro de um runtime de workspace,
  nunca entre runtimes. Sem a tag, os clientes devem aceitar o gerenciador
  legado por sessão e o status `scope: 'session'`.
- Runtimes de inicialização/estáticos explícitos, incluindo o primário, não
  são removíveis. Runtimes secundários dinâmicos ou persistidos seguem regras
  de ciclo de vida de adição, drenagem, remoção e readição. Runtimes em
  drenagem permanecem visíveis ao deep health global do daemon até a remoção
  lógica completar. A remoção forçada aborta recursos ativos e realiza um
  teardown limitado de melhor esforço; um timeout de limpeza é registrado em
  log em vez de fazer rollback da remoção lógica.
- O `GET /health` raso permanece exatamente `200 {"status":"ok"}`. O deep
  health agrega runtimes ativos e em drenagem, retorna um `503` com motivo
  para falha de bootstrap ou agregação e nunca expõe caminhos de workspace.
  Veja [deep health global do daemon](./daemon-global-deep-health.md),
  implementado pelo [PR #6961](https://github.com/QwenLM/qwen-code/pull/6961).

## Contrato de revisão

Para toda rota do daemon nova ou alterada, os revisores devem nomear a classe
de propriedade e seguir a requisição através de ambiente, ponte, serviço,
sistema de arquivos, confiança e tratamento de falhas. Uma rota está
incompleta se qualquer consumidor subsequente puder silenciosamente usar o
estado primário após a resolução de propriedade falhar.

Descobertas de revisão são classificadas da seguinte forma:

- Regressões de correção, segurança, perda de dados, isolamento ou fail-open
  pertencem ao fortalecimento e bloqueiam a alteração afetada.
- Uma nova capability ou migração de um contrato intencionalmente somente
  primário recebe uma issue e um design separados; ela não expande este
  encerramento.
- Um refactor sem defeito concreto não entra no escopo do fortalecimento.

Após aproximadamente cinco rodadas de revisão, apenas correções de correção,
segurança, perda de dados e regressão devem expandir um PR de fortalecimento
ativo. Outras sugestões válidas são registradas como acompanhamentos para que
o guarda-chuva não permaneça aberto indefinidamente.

## Limites atuais explícitos

- `POST /session/:id/branch`, `POST /session/:id/fork` e
  `POST /session/:id/cd` permanecem primário-legado para uma sessão ao vivo
  pertencente a um secundário e retornam `non_primary_session_route_not_supported`.
- Canais nomeados gerenciados pelo daemon são agrupados por workspace
  proprietário e executam um worker por runtime proprietário. `--channel all`
  permanece intencionalmente somente primário.
- O daemon não fornece autenticação, limitação de rate ou isolamento de falha
  de processo por workspace. Implante daemons separados quando esses limites
  forem necessários.

## Regra de saída

Este baseline, seus testes de contrato, as guardas de rota/ambiente e o deep
health de todo o daemon são o encerramento fixo para #6378. Roteamento de
branch/fork e semântica de `cd` permanecem trabalho de funcionalidade
independente. Após os PRs de encerramento chegarem, descobertas futuras de
revisão devem ser registradas como issues focadas em vez de reabrir um balde
de fortalecimento ilimitado.
