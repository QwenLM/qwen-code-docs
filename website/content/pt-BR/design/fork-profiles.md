# Perfis de Fork

## Resumo

Adiciona uma camada de perfis nomeados de nível de projeto sobre a allowlist de
execução de fork introduzida por #8066. Um chamador pode passar
`fork_profile: "<name>"` em vez de repetir `fork_tools`; o runtime resolve
`.qwen/fork-profiles/<name>.md` uma vez no lançamento e alimenta a lista de
ferramentas resultante no gate de execução existente.

Esta fase não adiciona nenhum novo mecanismo de autorização. O perfil resolvido
deve se comportar exatamente como a chamada inline equivalente de `fork_tools`.

## Formato de Arquivo

Perfis vivem sob a raiz do projeto ativo:

```text
.qwen/fork-profiles/<name>.md
```

Cada arquivo contém frontmatter YAML:

```markdown
---
name: ro-research
tools:
  - read_file
  - grep_search
  - glob
  - mcp__search__*
promptHint: |
  Work read-only. Prefer targeted searches and report evidence.
---
```

`name` e `tools` são obrigatórios. `promptHint` é opcional e limitado a 200
caracteres. O nome solicitado, o nome do arquivo e o nome do frontmatter devem
corresponder. Nomes têm 2–50 caracteres e contêm apenas letras, números, hífens ou
sublinhados, sem um separador no início ou no fim. Arquivos de perfil são apenas
frontmatter; um corpo Markdown não vazio é rejeitado para que orientações não
possam ser silenciosamente descartadas. Um perfil deve resolver para um arquivo
regular dentro do diretório de perfis do projeto e não pode exceder 64 KiB.

O campo `tools` usa o contrato exato de `fork_tools`. Uma lista vazia permanece
deny-all, `*` sozinho é inválido e a sintaxe de curinga MCP é inalterada.

O escopo de projeto é o único escopo de busca nesta fase. Perfis de nível de
usuário, precedência de escopo, perfis embutidos, listagem de perfis e UI de
gerenciamento são adiados. Modo seguro e modo bare rejeitam perfis de projeto
porque são personalizações locais. O modo AUTO trata escritas sob
`.qwen/fork-profiles/` como automodificação, então elas não podem usar o fast
path normal de edição no workspace.

## Resolução no Lançamento

`fork_profile` é válido apenas com `subagent_type: "fork"` e não pode ser
combinado com `fork_tools` ou um teammate nomeado. A invocação do Agente resolve o
perfil antes de construir o runtime do fork:

1. Valida o nome lógico solicitado antes de construir um caminho de sistema de
   arquivos.
2. Lê o perfil de projeto correspondente e analisa estritamente seu frontmatter
   YAML.
3. Valida a identidade nome de arquivo/frontmatter e a allowlist de ferramentas.
4. Vincula o perfil analisado a um snapshot de lançamento e expõe suas ferramentas
   efetivas e dica de prompt para classificação do modo AUTO.
5. Passa uma lista de ferramentas clonada como `ToolConfig.executionAllowedTools`.
6. Anexa `promptHint`, quando presente, à diretiva da tarefa do fork após o
   prefixo cacheável derivado do pai. O texto controlado pelo projeto é escapado e
   enquadrado como orientação após a diretiva, enquanto a restrição de execução
   autoritativa permanece por último.

Perfis ausentes ou inválidos fazem o lançamento falhar antes que o runtime do
agente, hooks, entrada de registro de segundo plano ou sidecar de transcrição
sejam criados.

## Runtime e Revivificação

O gate de execução existente permanece autoritativo. A resolução de perfil nem
altera declarações visíveis ao modelo nem contorna permissões normais para uma
ferramenta permitida.

A lista de ferramentas resolvida, não o nome ou caminho do perfil, é a política no
momento do lançamento. O sidecar existente `AgentMeta.executionAllowedTools` a
armazena, incluindo uma lista vazia deny-all. A revivificação a frio reaplica
aquele snapshot à superfície de ferramentas ativa atual e não relê um perfil que
pode ter mudado desde o lançamento.

O prompt da tarefa de lançamento já é parte da transcrição do fork, então a dica
de prompt resolvida segue o caminho existente de transcrição/revivificação sem uma
segunda busca de perfil.

## Limites

Esta fase não adiciona padrões de argumento de shell, sistemas de arquivos
overlay, integração `/btw`, reflexão automática/orquestração de enxame, perfis de
nível de usuário ou UI CRUD de perfis.

Perfis de fork são uma conveniência de chamador e camada de prompt controlada pelo
projeto, não um sandbox aplicado pelo administrador. Eles podem apenas estreitar a
superfície executável herdada do pai.
