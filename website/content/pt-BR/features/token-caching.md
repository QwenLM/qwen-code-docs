# Cache de Tokens e Otimização de Custo

O Qwen Code otimiza automaticamente os custos da API por meio do cache de tokens ao usar autenticação por chave de API (por exemplo, provedores compatíveis com OpenAI). Esse recurso reutiliza instruções e contexto do sistema anteriores para reduzir o número de tokens processados em solicitações subsequentes.

**O cache de tokens está disponível para:**

- Usuários de chave de API (chave de API do Qwen)
- Usuários do Vertex AI (com configuração de projeto e localização)

**O cache de tokens não está disponível para:**

- Usuários OAuth (contas pessoais/empresariais do Google) - a API do Code Assist não suporta criação de conteúdo em cache neste momento

Você pode visualizar seu uso de tokens e as economias de tokens em cache usando o comando `/stats`. Quando houver tokens em cache disponíveis, eles serão exibidos na saída das estatísticas.