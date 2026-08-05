# Compatibilidade de provider para nomes de ferramenta MCP

## Problema

O Qwen Code atualmente aceita nomes de ferramenta MCP usando o conjunto de
caracteres do Gemini. Nomes como `literature.search_pubmed` tornam-se
`mcp__server__literature.search_pubmed`, que o Gemini aceita, mas endpoints
OpenAI-compatíveis e Anthropic-compatíveis mais estritos podem rejeitar antes
que a ferramenta possa rodar.

O mesmo nome bruto é reconstruído independentemente para registro,
persistência de permissão, busca de reconexão, truncamento de saída e
histórico restaurado. Alterar apenas a requisição de provider, portanto,
faria o nome visível ao modelo diferir da chave de registro.

## Design

Usar uma única regra determinística de normalização segura para provider em
nomes de ferramenta MCP:

- Preservar nomes que já correspondem a `^[A-Za-z][A-Za-z0-9_-]*$` e têm no
  máximo 63 caracteres.
- Substituir caracteres não suportados, garantir um primeiro caractere
  alfabético e anexar um hash curto estável sempre que normalização ou
  truncamento for necessário.
- Manter o nome final com 63 caracteres ou menos, o que é aceito pelo Gemini e
  por providers OpenAI-compatíveis e Anthropic-compatíveis mais estritos.
- Usar o nome registrado ao longo de uma invocação MCP em vez de reconstruí-lo
  a partir dos nomes brutos de servidor e ferramenta.
- Normalizar nomes MCP no histórico restaurado de requisições OpenAI e
  Anthropic para que sessões criadas antes da mudança permaneçam enviáveis.
- Continuar correspondendo entradas legadas de permissão e de ferramenta
  desativada do MCP carregando o alias exato pré-normalização derivado dos
  nomes brutos de servidor e ferramenta. Isso também preserva nomes truncados
  pelo algoritmo anterior de truncamento no meio sem ampliar correspondências
  curinga.

Nenhuma tabela de aliases específica de provider é introduzida. Nomes
existentes legais permanecem byte a byte inalterados, então o comportamento do
Gemini e ferramentas embutidas normais não são afetados.

Nomes restaurados produzidos pelo algoritmo anterior de truncamento no meio já
são seguros para provider e permanecem inalterados em mensagens históricas.
Seu meio removido não pode ser reconstruído de forma confiável, então
conversores não adivinham um novo nome baseado em hash; a compatibilidade
exata de permissão e ferramenta desativada, em vez disso, usa o alias de nome
bruto disponível durante o registro MCP.

## Verificação

- Testes unitários para nomes válidos, inválidos, em colisão, longos, estáveis
  e idempotentes.
- Testes de ferramenta MCP para registro, regras de permissão, busca de
  reconexão e ferramentas desativadas.
- Testes de conversor OpenAI e Anthropic para histórico restaurado contendo
  nomes MCP com pontos.
- Build e typecheck do pacote core.
