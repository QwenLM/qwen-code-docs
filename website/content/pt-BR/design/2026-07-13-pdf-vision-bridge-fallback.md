# Fallback de vision bridge para PDF

## Contexto

`read_file` prioriza texto para PDFs quando o modelo primário não tem suporte nativo a PDF. A extração de texto ainda pode falhar em documentos escaneados, e uma única página densa pode exceder o orçamento seguro de 12 mil tokens para resultado de ferramenta. Retornar páginas renderizadas diretamente não é seguro para um provider somente texto, enquanto tratar todo resultado de texto grande como imagem tornaria leituras comuns de múltiplas páginas mais lentas e menos precisas.

## Design

A camada de processamento de arquivo pode preparar um candidato interno de vision bridge, exclusivo para PDF. Essa opção é separada da preservação existente de imagens não suportadas usada por anexos interativos `@`, então leituras comuns de imagem não mudam. Um candidato contém partes de imagem renderizadas, o motivo do gatilho, o intervalo real de páginas renderizadas, metadata estruturado de continuação e o erro original de extração de texto a restaurar caso a transcrição não possa ser concluída. O metadata de continuação distingue páginas sabidamente existentes de páginas que podem existir quando a contagem de páginas não está disponível.

Candidatos são criados apenas quando a extração de texto do PDF falha ou quando uma leitura explícita ou efetiva de página única ainda excede 12 mil tokens estimados. Overflow de texto em múltiplas páginas, gates de intervalo de páginas de documentos grandes e gates de tamanho de arquivo mantêm sua orientação existente. A renderização começa na primeira página solicitada e processa no máximo quatro páginas por chamada de `read_file`. O intervalo solicitado é aparado para a contagem real de páginas do PDF quando conhecida: um documento de seis páginas solicitado como `pages: "4-8"` renderiza as páginas 4-6 e não inventa as páginas 7-8. Quando a contagem de páginas não está disponível, uma renderização curta e não truncada em bytes é tratada como fim de arquivo; uma renderização completa de quatro páginas ou truncamento em bytes reporta apenas que páginas adicionais solicitadas podem existir.

`ReadFileTool` habilita a preparação apenas quando o modelo primário é somente texto e um modelo de vision bridge está configurado ou disponível. Ele invoca o bridge antes de construir a resposta final da ferramenta, passando apenas as páginas de imagem renderizadas mais o contexto estruturado de páginas do PDF. O bridge é instruído a rotular as seções de transcrição com os números originais de página do PDF. A orientação de continuação é anexada após a transcrição e aponta apenas para o PDF original, nunca para as imagens renderizadas temporárias.

Em caso de sucesso, `read_file` retorna transcrição automática não confiável e com perdas, sem dados de imagem. Um aviso de exibição estruturado divulga o modelo de visão selecionado, o endpoint quando conhecido, o intervalo de páginas transcrito e a continuação conhecida ou possível. A TUI renderiza esse aviso mesmo quando a saída de leitura bem-sucedida está recolhida e quando o detalhe do transcript está expandido; ACP, saída estruturada não interativa e exportações de sessão incluem o mesmo texto no conteúdo da chamada de ferramenta, em vez de depender de saída bruta opaca. Em falha do bridge, saída vazia, timeout ou mudanças de seleção de modelo, os dados de imagem são descartados e o erro original exato do PDF é restaurado para o modelo, enquanto a tentativa do bridge permanece visível apenas na exibição do usuário. O cancelamento do usuário é propagado. Consequentemente, nenhuma imagem candidata pode chegar a um provider primário somente texto através de um resultado de ferramenta.

Um `visionModel` configurado explicitamente é tratado como autorização para usar esse modelo mesmo quando ele está hospedado em outro provider. O aviso existente do bridge reporta o endpoint real, para que a fronteira de dados permaneça visível.

## Compatibilidade

O schema público de `read_file` é inalterado. Modelos PDF nativos, modelos primários com capacidade de visão, configurações sem modelo de bridge, leituras comuns de PNG/JPEG e o comportamento existente de imagens interativas mantêm seus caminhos atuais. A resolução interativa de PDF via `@` também se beneficia do fallback de overflow de página única.

## Verificação

A cobertura de testes unitários exercita intervalos solicitados que não começam na página 1, requisições que se estendem além do fim real do documento, contagens de páginas desconhecidas, truncamento em bytes, renderizações vazias, overflow de página única versus múltiplas páginas, sucesso e falhas do bridge, cancelamento, mudanças de configuração, divulgação de endpoint nas superfícies TUI/ACP/exportação, prompts com números de página e o invariante de que resultados somente texto não contêm `inlineData`. A verificação E2E compara a baseline global com o build local usando um PDF escaneado de seis páginas, um PDF denso de página única e um PDF de múltiplas páginas com muito texto.
