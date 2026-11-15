# Watcher de extensões ACP: medição da primeira sessão


Esta alteração ignora o watcher de arquivos de extensões interativo nos processos ACP. O daemon já é responsável pelo ciclo de vida de atualização de recursos. Sessões de terminal interativas continuam a construir o watcher. Este é o primeiro estágio da otimização da primeira sessão; ele **não** estabelece uma primeira sessão nova abaixo de 500 ms.

## Alteração e procedência

A base é o commit `2985fef4e9b9393601141c16031b2ba039181158` do main; o candidato medido é o commit `2aadc4b127ec24074e0e5ddfd402e978a0c43f5d` somente do watcher. A alteração de produção é uma guarda adicional de modo ACP. Tanto `--acp` quanto `--experimental-acp` são cobertos, junto com um controle que constrói o watcher para o modo interativo. Nenhuma alteração de inicialização do Core, seleção de recursos, prompt, autenticação, política de MCP ou implementação de pré-aquecimento está incluída.

Ambos os bundles usam a versão CLI 0.27.2. O pacote TypeScript chamador é ` @qwen-code/sdk` **0.1.32**. A versão do pacote e os hashes de entrada do SDK foram registrados antes e depois de cada execução. Digests completos do baseline, candidato e árvore de arquivos do SDK compilado também foram congelados e verificados ao redor da coorte de medição. O candidato foi construído em um worktree independente com instalação do lockfile pnpm 11.24.0 fixado, build completo, typecheck e bundle.

## Carga de trabalho e limite de tempo

A carga de trabalho instalada privada contém 31 recursos: 14 suítes de extensões e 17 Skills independentes, com 90 Skills customizadas, 3.944 arquivos e 81.931.741 bytes. Cada amostra materializa o mesmo inventário completo de recursos em um sistema de arquivos local case-sensitive. Nomes de recursos, arquivos fonte, conteúdo de negócio, manifests, caminhos locais, identificadores e logs brutos permanecem privados. Apenas contagens agregadas e tempos são publicados aqui.

O perfil preserva os hooks e define a allowlist de MCP como uma lista vazia. Não envia nenhum prompt, requisição de modelo ou chamada de ferramenta de negócio e não se conecta a servidores MCP externos configurados. O estado de ativação nativa instalada é semeado durante a preparação de fixtures fora do tempo. Isso representa um conjunto de recursos **já instalado e ativado**, com um processo fresco e estado de sessão fresco; não afirma que todos os caches derivados de recursos estejam vazios. Criação de fixtures, cópia de arquivos, semeadura de ativação nativa, construção de bundle e importação de módulos do SDK terminam antes de qualquer relógio começar.

Cada amostra tem um HOME fresco, diretório de runtime, TMPDIR, raiz de sessões persistidas e diretório de cache de compilação do Node inicialmente vazio. O daemon é iniciado através do seu ponto de entrada real de HTTP-bridge embutido com `preheatBridge: false`. O driver aguarda `runtimeReady`, depois verifica zero sessões de negócio e nenhum canal ACP ao vivo antes da sua primeira chamada ao SDK. Não há requisição HTTP de readiness ou capabilities antes dessa chamada. Um UUID fresco solicita um novo thread; o resultado deve ecoá-lo com `attached: false`. Mais duas chamadas com UUIDs frescos validam o comportamento de sessões subsequentes.

O limite da requisição ready é observado antes da construção do cliente SDK e da geração de UUID do chamador; ambos estão fora do relógio primário de create.

O relógio primário envolve o `await client.createOrAttachSession(...)` completo: descoberta de capabilities, o POST de sessão, análise do JSON de resposta e validação de identidade do SDK. A primeira requisição HTTP é `GET /capabilities`; sua duração sozinha **não** é uma medição de nova sessão. Os registros de requisição mantêm a sequência real para todas as três chamadas; chamadas posteriores não devem ser assumidas como omitindo verificações de capability.

O relatório também expõe o POST de sessão, o spawn do processo daemon até o limite da requisição daemon-ready, e o spawn do daemon até o primeiro resultado do SDK completo. Aguardar o daemon não cria um processo ACP: todo spawn ACP registrado deve ocorrer após o início da chamada ao SDK e a primeira requisição HTTP. O status do daemon deve reportar pré-aquecimento `not_scheduled`. Nenhum profiler de CPU, flush explícito de cache de compilação, cache de compilação de filhos desabilitado, sleep artificial ou sonda de inicialização aparece nas amostras formais.

## Resultados formais

**O primeiro create completo do SDK cai de 1096,1 ms para 772,9 ms na mediana: 323,2 ms / 29,48% menor. O candidato permanece acima de 500 ms em todas as amostras.**

Todos os valores abaixo estão em milissegundos, mostrados como mediana (mínimo–máximo), com oito primeiras sessões independentes por condição. Ambas as condições completam 8/8 tentativas, criando 24/24 novas sessões. Nenhuma amostra formal é excluída.

| Relógio                                 |               Baseline |        Somente watcher |
| --------------------------------------- | ---------------------: | ---------------------: |
| Primeiro create completo do SDK (primário) | 1096.1 (1078.3–1129.3) |    772.9 (758.4–824.1) |
| Primeiro POST de sessão + JSON          | 1075.7 (1058.8–1109.2) |    754.1 (739.3–798.5) |
| Spawn do daemon → listener observado    |    336.7 (322.5–341.5) |    329.2 (323.1–358.5) |
| Spawn do daemon → limite da requisição ready |    630.6 (618.7–644.5) |    605.3 (591.8–621.0) |
| Spawn do daemon → primeiro resultado do SDK | 1731.0 (1709.6–1748.0) | 1384.5 (1355.5–1427.0) |
| Primeiro GET de capabilities + JSON     |       18.7 (17.7–28.1) |       18.3 (18.1–25.1) |
| Primeiro HTTP → spawn ACP              |       14.2 (13.9–22.3) |       14.2 (14.1–24.6) |
| Segundo create completo do SDK          |       71.1 (65.1–79.6) |       74.0 (65.2–80.0) |
| Terceiro create completo do SDK         |       56.9 (53.7–63.7) |       54.4 (53.4–56.6) |

Amostras do primeiro create por rodada pareada:

| Rodada | Baseline | Somente watcher |
| ------ | -------: | --------------: |
| 1      |   1098.5 |          758.4 |
| 2      |   1078.3 |          771.1 |
| 3      |   1129.3 |          807.8 |
| 4      |   1110.2 |          760.1 |
| 5      |   1082.6 |          767.9 |
| 6      |   1089.2 |          774.8 |
| 7      |   1093.7 |          789.0 |
| 8      |   1110.5 |          824.1 |

O [resumo numérico público](./acp-extension-watcher-results.json) inclui todas as amostras formais, médias, medianas, intervalos, digests da árvore de compilação/build e contagens de aprovação/falha. É construído a partir de uma allowlist explícita; não contém inventário privado de recursos, conteúdos fonte, caminhos locais, UUIDs, tokens ou logs brutos.

Uma coorte anterior de seis tentativas foi abortada quando seu volume temporário de fixtures ficou sem espaço (cinco amostras completadas e uma falha de inicialização de sessão). Os logs de falha contêm `ENOSPC` na criação do diretório de runtime. Todos os seis processos fecharam normalmente; toda a coorte, incluindo seus tempos completados, é excluída. Um volume independente maior case-sensitive e dezesseis fixtures completamente frescos foram preparados antes de reiniciar a coorte formal. A evidência falha é retida localmente; não é repetida silenciosamente nos resultados.

Oito rodadas pareadas executaram serialmente, alternando ordem A/B e depois B/A. Todos os fixtures foram preparados antes da janela de medição exclusiva. Nenhum build, cópia de fixtures, outro benchmark ou teste foi executado concorrentemente sob esta tarefa. O cache de arquivos do SO não foi descartado; estas são medições de processo fresco e sessão fresca em um host, não medições de disco frio. Oito amostras por condição são poucas demais para estabelecer uma garantia de latência de cauda em produção.

Host: macOS 26.6.2, arm64; Node.js v26.7.0. Esta reconstrução local isolada usa o inventário privado de instalação pré-produção; não é uma medição de latência de produção ou pré-produção ao vivo. O objetivo de 500 ms se aplica ao primeiro create completo do SDK e permanece como trabalho subsequente além deste PR.

## Verificação funcional e limites

Execuções funcionais separadas comparam bundles congelados do baseline e somente watcher com o mesmo inventário completo instalado. Não são membros da coorte de tempo formal: chamadas de saúde e helper precedem algumas verificações funcionais.

- Ambas as condições passam 41/41 asserções de mudança externa e 18/18 asserções de ativação/ciclo de vida.
- Todos os oito snapshots de helper, oito menus de sessão existente após o helper, oito menus de sessão recém-criada e onze snapshots de ciclo de vida correspondem após correspondência de caminho de fixture e UUID.
- Leituras ordinárias preservam diferenças de propagação observadas: envelopes completos de workspace-Skill correspondem em 29/32 amostras, conteúdo de Skill em 31/32 e listas de comandos de sessão existente em 31/32. Uma substituição atômica aparece mais cedo no candidato em uma observação; a recriação de arquivo aparece brevemente mais cedo no baseline. Amostras posteriores ou o helper normal convergem. Edições/restaurações de Skill de extensão permanecem antigas em ambas as condições durante a janela de observação de três segundos e ficam corretas após o helper.
- Ambos os lados emitem oito eventos SSE públicos com a mesma sequência de tipo/fase. Os primeiros sete payloads correspondentes match; o último payload de reload atualiza as mesmas nove sessões com uma ordem de conclusão diferente. A ordem original do array é retida ao verificar igualdade.
- Respostas de nova sessão diferem naturalmente em UUID, tempo de criação e identidade do cliente. Outros campos de resposta correspondem; a criação real é asserida independentemente por eco de UUID e `attached: false`.

Apenas raízes de fixture e bundle, identificadores de workspace derivados dessas raízes e correspondência de UUID são normalizados. Para a comparação de negócio de workspace-Skill reportada separadamente, timestamp de observação e idade são excluídos; envelopes brutos permanecem intactos. Obsolescência de cache, flags de refresh, estado de ativação, geração, todos os campos de Skill/comando e ordem original do array não são apagados para fabricar igualdade. Essas observações não provam latência de propagação idêntica ou leituras ordinárias byte-idênticas.

Cada grupo funcional recebe um acknowledgement de fechamento normal e sai com código zero, sem sinal e sem fallback forçado. Uma observação escopada final do SO não encontra nenhum processo de benchmark correspondente. Amostras de tempo formais aplicam separadamente seu próprio acknowledgement de fechamento normal, status de saída zero, nenhum fallback forçado e desaparecimento de todo PID filho ACP registrado.

A suíte de testes unitários focada do CLI passa **129/129**, com build completo, typecheck, bundle, ESLint de arquivos alterados e verificações Prettier passando. A construção do watcher interativo é verificada por um controle unitário; uma execução end-to-end de UI de terminal interativo, Windows, Linux, execução de modelo, hooks executando em prompts e comportamento externo de MCP estão fora desta validação.

## Reproduzir com recursos sintéticos públicos

O gerador público cria recursos genéricos sem ler ou exportar a instalação privada. Usa 14 suítes, 17 Skills independentes e 90 manifests de Skill, mas seus bytes, formas de diretório, colocação de skills independentes, definições de hook e preparação de ativação diferem. Seus tempos podem reproduzir o procedimento e expor comportamento de escala; não podem reproduzir ou substituir os números da carga de trabalho privada acima.

Construa um baseline congelado e um candidato congelado a partir de seus respectivos commits usando `corepack pnpm install --frozen-lockfile`, `npm run build` e `npm run bundle`. A reprodução pública foi verificada com Node.js v26.7.0. Mantenha o build do SDK fixo, pare builds e cópia de recursos antes de medir e alterne os dois bundles serialmente. A partir deste checkout, execute uma amostra por diretório de saída fresco:

```sh
node scripts/benchmarks/acp-first-session/fixture.mjs /tmp/acp-synthetic-a /absolute/frozen-baseline/dist
node scripts/benchmarks/acp-first-session/fixture.mjs /tmp/acp-synthetic-b /absolute/frozen-candidate/dist

node scripts/benchmarks/acp-first-session/run.mjs /tmp/acp-synthetic-a/fixture.json
node scripts/benchmarks/acp-first-session/run.mjs /tmp/acp-synthetic-b/fixture.json
```

Prepare todos os fixtures frescos antes da coorte de medição. Um smoke sintético fresco completa todos os três creates e as verificações de no-preheat, identidade, fechamento, saída de filhos e hash de entrada registrada. Valida o procedimento e não contribui com nenhuma amostra para os resultados privados. Cada execução imprime um resumo numérico/booleano livre de caminhos e mantém evidência local detalhada no local de saída solicitado. Os recursos sintéticos não contêm hook SessionStart; nenhum prompt é enviado, então os hooks UserPromptSubmit criados não executam. Use pelo menos oito pares intercalados, retenha falhas, inspecione cada asserção de pré-aquecimento/sessão/spawn/fechamento e reporte todos os relógios. Não commite árvores de fixtures geradas localmente nem resultados brutos.

Se um PID ACP registrado ainda existir após o shutdown, o executor público marca o resultado como falha e registra um erro de limpeza para inspeção manual. A reutilização de PID impede que prove a identidade do processo, então o encerramento automático é limitado ao seu próprio handle de processo wrapper.

O trabalho restante abaixo de 500 ms deve reduzir a inicialização realizada após a primeira chamada ao SDK, com o mesmo limite de no-preheat e verificações funcionais. Está deliberadamente separado desta alteração de watcher de uma linha.