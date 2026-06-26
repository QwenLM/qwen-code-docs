# Issue #4479 coordenação de estatísticas de uso de tokens

## Contexto

A issue #4479 solicita visibilidade diária do consumo de tokens do Qwen Code. O escopo foi
esclarecido na thread da issue para preferir um comando CLI, suporte a exportação, resumos
mensais e consumo de tokens por modelo. Um comentário de mantenedor também mencionou
coordenação com trabalhos de estatísticas adjacentes:

- #4252: métricas de tempo de geração em `/stats` como TTFT, duração da geração,
  e TPS.
- #4182: contadores de sessão sem conteúdo para diagnóstico de memória.

## Decisões de coordenação

1. **Usar `/stats`, não um novo comando de nível superior.**
   O uso de tokens é exposto como `/stats daily`, `/stats monthly` e
   `/stats export`, de modo que compartilhe a superfície de comandos de estatísticas existente
   com estatísticas de sessão e métricas futuras de geração.

2. **Persistir contadores de tokens como JSONL local.**
   Cada resposta da API anexa um registro sem conteúdo a
   `usage/token-usage-AAAA-MM.jsonl` no diretório de execução. Isso satisfaz
   agregação diária/mensal sem adicionar SQLite como nova dependência.

3. **Manter a semântica de tempo da #4252 separada.**
   Resumos de uso de tokens podem incluir `apiDurationMs`, que é a duração
   ponta a ponta da resposta da API existente proveniente de telemetria. É nomeado deliberadamente como
   duração da API e não deve ser apresentado como duração da geração, TTFT ou TPS.
   A #4252 continua sendo a responsável pelas métricas de tempo de geração.

4. **Manter os limites de privacidade e diagnóstico de memória da #4182.**
   Registros de uso armazenam apenas contadores agregados e dimensões estáveis: data local,
   mês, id de sessão, modelo, tipo de autenticação, origem, contadores de tokens e duração da API.
   Eles não armazenam texto de prompt, texto de resposta, conteúdo de ferramentas, caminhos de projeto,
   ids de prompt ou ids de resposta.

5. **Exportação permanece apenas agregada.**
   Exportações em CSV e JSON são resumos, não exportações de transcrição bruta. Elas agrupam por
   total, modelo, tipo de autenticação, modelo/tipo de autenticação e origem.

## Não objetivos

- Não implementar a instrumentação de TTFT/TPS/duração de geração da #4252 aqui.
- Não estender `/doctor memory` ou implementar a #4182 nesta alteração.
- Não adicionar um comando de barra separado de nível superior para uso de tokens.
