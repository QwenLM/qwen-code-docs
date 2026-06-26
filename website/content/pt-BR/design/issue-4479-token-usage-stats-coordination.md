# Issue #4479 coordenação de estatísticas de uso de tokens

## Contexto

O Issue #4479 solicita visibilidade do consumo diário de tokens do Qwen Code. O escopo foi esclarecido na thread do issue para preferir um comando CLI, suporte a exportação, resumos mensais e consumo de tokens por modelo. Um comentário de um mantenedor também destacou a coordenação com trabalhos estatísticos adjacentes:

- #4252: métricas de tempo de geração no `/stats` como TTFT, duração da geração e TPS.
- #4182: contadores em escala de sessão sem conteúdo para diagnóstico de memória.

## Decisões de coordenação

1. **Use `/stats`, não um novo comando de nível superior.**
   O uso de tokens é exposto como `/stats daily`, `/stats monthly` e `/stats export` para que compartilhe a superfície de comandos de estatísticas existente com estatísticas de sessão e métricas de geração futuras.

2. **Persista os contadores de tokens como JSONL local.**
   Cada resposta da API anexa um registro sem conteúdo a `usage/token-usage-YYYY-MM.jsonl` no diretório de tempo de execução. Isso satisfaz a agregação diária/mensal sem adicionar SQLite como uma nova dependência.

3. **Mantenha a semântica de temporização do #4252 separada.**
   Os resumos de uso de tokens podem incluir `apiDurationMs`, que é a duração existente de resposta da API ponta a ponta da telemetria. Ele é intencionalmente nomeado como duração da API e não deve ser apresentado como duração da geração, TTFT ou TPS. O #4252 permanece como proprietário das métricas de temporização de geração.

4. **Mantenha os limites de privacidade e diagnóstico de memória do #4182.**
   Os registros de uso armazenam apenas contadores agregados e dimensões estáveis: data local, mês, id da sessão, modelo, tipo de autenticação, origem, contadores de tokens e duração da API. Eles não armazenam texto do prompt, texto da resposta, conteúdo de ferramentas, caminhos de projeto, ids de prompts ou ids de resposta.

5. **A exportação permanece apenas agregada.**
   As exportações CSV e JSON são resumos, não exportações de transcrição bruta. Elas agrupam por total, modelo, tipo de autenticação, modelo/tipo de autenticação e origem.

## Não objetivos

- Não implemente a instrumentação de TTFT/TPS/duração de geração do #4252 aqui.
- Não estenda `/doctor memory` nem implemente o #4182 nesta alteração.
- Não adicione um comando de barra de nível superior separado para uso de tokens.