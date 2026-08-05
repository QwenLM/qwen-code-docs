# Capabilities Ativas na Retomada de Fork

## Problema

Transcrições de segundo plano de fork legadas persistiam a instrução de sistema
renderizada do pai e declarações de ferramentas inline. Reproduzir em replay
aquelas declarações do momento do lançamento enquanto a execução usa o
`ToolRegistry` atual pode deixar uma ferramenta removida ou alterada visível ao
modelo, mesmo que ela não possa ser executada.

## Design

Mantém as mensagens de bootstrap e de runtime do fork como sua identidade durável.
Na retomada, reconstrói sua superfície executável a partir da sessão pai atual:

- usa a instrução de sistema renderizada do pai atual;
- toma os nomes de ferramentas anunciados do pai atual e resolve seus esquemas por
  meio do registro atual do agente retomado;
- inclui lembretes atuais de MCP, ferramenta adiada e Skill no turno de
  continuação, enquanto declara listagens de capability anteriores obsoletas;
- deixa a tarefa pausada quando o prompt pai atual ou a superfície de ferramentas
  não pode ser reconstruída.

Instruções de sistema e declarações de ferramentas do momento do lançamento
permanecem legíveis em transcrições antigas para compatibilidade, mas a retomada
não as trata mais como autoridade executável. Novas transcrições persistem o
histórico herdado e o prompt da tarefa, não snapshots de capability; o estado
atual do runtime é autoritativo.

Restrições de execução do momento do lançamento são diferentes de snapshots de
capability. Quando um fork usa `fork_tools`, sua política `executionAllowedTools`
é armazenada no sidecar `AgentMeta` e reaplicada após a superfície de ferramentas
ativa ser reconstruída. Uma lista persistida vazia permanece deny-all; um campo
ausente permanece irrestrito.

## Consequências

Ferramentas removidas não são mais anunciadas após a retomada, e ferramentas
alteradas usam seus esquemas atuais. Um fork retomado pode ganhar uma ferramenta
que está recém-disponível ao seu pai apenas quando sua política de execução
persistida também permite aquela ferramenta. Isso favorece consistência ativa
sobre replay byte-idêntico sem enfraquecer uma restrição explícita de lançamento.
A revinculação também pode invalidar o prefixo de prompt-cache antigo, o que é
preferível a enviar capabilities obsoletas.
