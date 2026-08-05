# Guardrails de Prompt de Subagente

## Motivação

A ferramenta Agent atualmente incentiva uma ampla delegação paralela e diz que
a saída do subagente geralmente deve ser confiável. Os prompts embutidos também omitem
algumas expectativas de execução e verificação, enquanto os prompts Explore e fork
contêm orientação insegura ou contraditória.

## Design

- Dizer ao agente pai para delegar apenas trabalho limitado e independente, manter
  trabalho imediato de caminho crítico local, evitar trabalho duplicado e dar a agentes
  paralelos de escrita de código escopos de escrita disjuntos.
- Exigir que o pai revise alegações e mudanças de código antes de integrar ou
  retransmitir um resultado de subagente.
- Simplificar o prompt general-purpose e adicionar expectativas de escopo, preservação,
  verificação, incerteza e relato estruturado.
- Reduzir a superfície de ferramentas com estado do Explore removendo ferramentas de
  tarefa, memória e pergunta ao usuário da sua allowlist. Permitir pipelines de shell
  continuando a proibir escritas no seu prompt.
- Parar de exigir que agentes fork confirmem mudanças, a menos que a diretiva peça
  explicitamente um commit.

Herança de contexto e o comportamento padrão de execução em segundo plano estão fora
desta mudança.

## Verificação

Testes unitários focados assertam a orientação do pai, os conteúdos dos prompts embutidos,
a allowlist de ferramentas do Explore e a regra de relato de fork. O build do pacote core e
o typecheck fornecem a verificação mais ampla em tempo de compilação.
