# Exportação de Sessão Qualificada por Workspace

## Resumo

A issue #6378 exige que clientes exportem uma sessão persistida de um
workspace registrado explicitamente selecionado. A rota existente
`GET /session/:id/export` é intencionalmente vinculada ao workspace primário,
então reutilizá-la para uma sessão secundária ou retorna `404` ou pode
selecionar a transcrição errada quando o mesmo id de sessão existe em mais de
um workspace.

Esta alteração adiciona
`GET /workspaces/:workspace/session/:id/export?format=html|md|json|jsonl`, a
capability `workspace_session_export`, um método correspondente do
`WorkspaceDaemonClient` e documentação de apoio. A rota legado permanece
vinculada ao primário.

## Contrato

O seletor de workspace segue a regra existente de rotas plurais: id exato de
workspace registrado primeiro, depois um cwd absoluto codificado para URL após
canonicalização. O runtime selecionado deve ser confiável. As verificações de
resolução e confiança acontecem antes da validação de sessão ou formato.

A rota lê apenas o JSONL persistido ativo do workspace selecionado. Ela não
busca em outro workspace, não faz fallback para o primário, não resolve um
proprietário ao vivo, não inicia o ACP, não anexa um cliente nem carrega
configurações do workspace. Sessões arquivadas permanecem indisponíveis. O
sucesso usa o mesmo formatador, sanitização de nome de arquivo, tipo MIME,
política de cache e cabeçalhos de anexo que a rota de exportação legada.

Os erros preservam os formatos existentes de exportação/armazenamento, com
`400 workspace_mismatch`, `403 untrusted_workspace`,
`400 invalid_export_format`, `404 session_not_found` e os contratos existentes
`409 session_archived`, `session_archiving` e `session_conflict`.

## Capability e Compatibilidade

`workspace_session_export` é uma capability incondicional da v1 porque a rota
plural é útil para um primário de workspace único confiável selecionado por id
ou cwd. A confiança ainda é avaliada por requisição. A nova tag é independente
de `multi_workspace_sessions` e não pode ser inferida de `session_export` ou
`workspace_qualified_rest_core`; daemons lançados anunciam ambas as tags
antigas, mas não implementam esta rota.

Chamadores diretos do SDK recebem o erro HTTP normal quando chamam o novo
método contra um daemon mais antigo. A integração do Web Shell está fora desta
alteração, então seu comportamento existente de exportação somente primária
permanece inalterado.

## Concorrência e Segurança

A exportação retém o lock existente do coordenador de arquivamento
compartilhado, indexado por id de sessão, então arquivar e excluir não podem
mover nem remover o arquivo durante o replay. O coordenador permanece
conservadoramente global: ids idênticos em workspaces diferentes podem
serializar mesmo que seus arquivos sejam independentes. Renomear todas as
chaves de lock de arquivamento/exclusão está fora desta alteração.

Diferentemente do paginador limitado de transcrições persistidas, a
exportação completa materializa a transcrição inteira e não está disponível
para um workspace secundário não confiável. A exportação confiável existente
não tem novo orçamento de tamanho de resposta; adicionar um limite específico
de workspace faria os contratos de formato plural e legado divergirem. A
autenticação bearer do daemon, o nível de rate de leitura padrão de GET e as
verificações de confiança de workspace por requisição continuam a se aplicar.

Corridas de remoção de runtime usam o runtime selecionado na resolução da
requisição. A remoção não exclui o armazenamento de transcrições, então a
exportação não precisa de lease de runtime e não mantém um filho ACP vivo.

## SDK e Observabilidade

`WorkspaceDaemonClient.exportSession` reutiliza os tipos existentes de
resultado e formato de exportação e sempre usa REST nativo, incluindo quando o
cliente pai tem um transporte ACP. O auxiliar de requisição compartilhado
preserva token, identidade do cliente, timeout, parsing de erro, tipo de
conteúdo e comportamento de nome de arquivo de anexo.

A telemetria do daemon normaliza o novo caminho como
`GET /workspaces/:workspace/session/:id/export`, decodifica o id de sessão e
usa a resolução de workspace do middleware para o hash do workspace
selecionado.

## Alternativas Rejeitadas

- Rotear a exportação singular por proprietário ao vivo falha para sessões
  persistidas inativas e torna a propriedade ambígua após reinício.
- Adicionar um parâmetro de consulta `cwd` à rota legada muda um contrato de
  compatibilidade somente primário e é menos consistente que as rotas
  plurais de workspace existentes.
- Fazer fallback para o primário em caso de erro pode exportar a sessão de
  outro workspace quando ids colidem.
- Permitir exportação completa não confiável contornaria a política de leitura
  limitada projetada para o paginador de transcrições persistidas.

## Verificação

Os testes cobrem anúncio de capability, seletores por id/cwd, isolamento de
mesmo id, todos os formatos, cabeçalhos de resposta, limites de confiança e
arquivamento, alvos ausentes/desconhecidos, ausência de atividade de ponte,
atribuição de telemetria, transporte e codificação do SDK e coordenação de
arquivamento/exclusão. A verificação ponta a ponta usa diretórios isolados de
runtime e workspace com transcrições persistidas determinísticas.
