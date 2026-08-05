# Compartilhamento de Cache de Compressão de Chat

## Contexto

A compressão de chat atualmente envia uma side query fria com uma instrução de
sistema dedicada, sem declarações de ferramentas da sessão principal e com uma
cópia da conversa com mídia reduzida. Provedores cuja chave de cache de prompt
começa com ferramentas e a instrução de sistema não conseguem reutilizar o
prefixo em cache da sessão principal.

## Design

A compressão primeiro tenta uma requisição especializada de turno único quando
todos os seguintes forem verdadeiros:

- o modelo de compressão é o modelo principal atual;
- o provedor ativo é Anthropic ou DashScope e o controle de cache está
  habilitado;
- o chat tem uma contagem de tokens de prompt reportada pelo provedor para
  ancorar a estimativa;
- a contagem efetiva de tokens de prompt mais a reserva limitada de saída da
  compressão cabe na janela de contexto do modelo.

A requisição usa a configuração de geração efetiva do turno atual, incluindo
substituições de ferramentas por requisição usadas por subagentes, e o
histórico curado completo, incluindo mídia. A filtragem normal de modalidade do
modelo é aplicada quando a requisição é enviada, então mídia suportada
permanece inalterada e mídia não suportada usa os mesmos placeholders de
outras requisições de modelo. A instrução de compressão existente é anexada
como a última mensagem de usuário. Nada consome nem executa chamadas de função
desta requisição. Uma resposta contendo uma chamada de função, uma resposta
vazia, um snapshot de estado malformado ou um erro de requisição é descartada
e tentada novamente uma vez através da side query fria existente. Sua entrada
com mídia reduzida é construída preguiçosamente apenas quando esse fallback é
necessário. Cancelamento não dispara o fallback.

Usar o `GeminiChat` atual mantém a requisição no escopo da sessão ao vivo. O
cache de fork global do processo não é usado intencionalmente porque ele retém
apenas uma cauda curta de histórico e pode pertencer a outra sessão
concorrente.

Sessões usando um modelo de compactação distinto permanecem no caminho
existente porque sua identidade de cache difere da sessão principal.
Históricos contendo mídia usam o caminho compartilhado primeiro para que o
prefixo inalterado voltado ao provedor possa reutilizar o cache da sessão
principal.

## Verificação

Testes unitários afirmam a construção exata de system, tools, histórico
completo e diretiva final; gates de provedor/modelo; preservação de mídia no
caminho compartilhado; preflight de janela; redução de mídia após fallback;
fallback de chamada de ferramenta e resposta malformada; e comportamento de
cancelamento. Testes de provedor devem comparar o prefixo serializado da
requisição e o uso de tokens em cache para o turno principal e a requisição de
compressão.
