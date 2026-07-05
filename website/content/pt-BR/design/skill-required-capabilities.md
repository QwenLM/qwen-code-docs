# Design de Capacidades Requeridas de Skills

Status: nota de design; este PR prossegue com a Opção B e deixa
`required-capabilities` como uma proposta futura.

## Contexto

O Web Shell pode renderizar blocos de código delimitados personalizados por meio de seu renderizador de markdown. A proposta do renderizador de gráficos usa um bloco de código delimitado `echarts-fulldata` para que o modelo possa retornar uma opção completa do ECharts e um payload de dataset que o Web Shell renderiza como um gráfico interativo.

Esse contrato de saída só é útil em clientes que podem renderizá-lo. Na CLI, em clientes ACP ou em qualquer outra superfície sem um renderizador correspondente, a mesma resposta apareceria como um grande bloco de código em vez de um gráfico.

A proposta inicial da skill de gráfico integrada dependia de texto para informar ao modelo que o formato é para o Web Shell. Esta é uma proteção suave. Se a skill for exposta em uma sessão não-Web-Shell, o modelo ainda poderá escolher um formato de saída que o cliente não consegue renderizar.

Para o PR atual, o Qwen Code mantém o ponto de extensão do renderizador no Web Shell, mas não inclui o `qwencode-viz` no core. O pacote Web Shell inclui um modelo de skill copiável e não carregado automaticamente, e os hosts devem instalar ou injetar essa skill somente quando também registrarem um renderizador `echarts-fulldata`.

## Problema

O Qwen Code precisa de uma maneira clara de decidir se uma skill específica de host deve ser mostrada ao modelo e aos usuários.

Para o `qwencode-viz`, a pergunta concreta é:

- O core deve suportar um campo de metadados de skill genérico `required-capabilities`?
- Ou o `qwencode-viz` não deve ser uma skill integrada do core, e sim fornecido apenas por clientes Web Shell que a instalam ou injetam?

## Objetivos

- Impedir que skills específicas de renderizador sejam expostas quando o cliente atual não puder satisfazer seu contrato de saída.
- Manter os lembretes de skill na inicialização, a ativação explícita de skills, a descoberta de comandos de barra e a validação de skills consistentes.
- Evitar codificar o `qwencode-viz` como um caso especial.
- Preservar o comportamento existente das skills quando nenhum requisito de capacidade for declarado.
- Manter o design extensível para capacidades futuras de host, não apenas para o ECharts.

## Não Objetivos

- Implementar o próprio renderizador do ECharts.
- Redesenhar toda a negociação de capacidades entre cliente e servidor.
- Alterar a semântica do frontmatter de skills existentes.
- Resolver alterações de capacidade em sessões compartilhadas de múltiplos clientes na primeira versão.

## Mecanismos Relacionados Atuais

A base de código já possui vários controles de visibilidade, mas nenhum representa capacidades de renderização do cliente:

- `disable-model-invocation`: impede que uma skill seja invocada automaticamente pelo modelo.
- `user-invocable`: controla se uma skill integrada está disponível como um comando.
- `paths`: restringe a disponibilidade da skill aos caminhos de workspace correspondentes.
- `skills.disabled`: desativa skills configuradas.
- `allowedTools`: atualmente usado pelo carregamento de skills integradas para ocultar skills orientadas a cron quando as ferramentas de cron não estão disponíveis.
- `supportedModes` do comando de barra: filtra comandos por modo de execução.
- Objetos de capacidade do Daemon e ACP: descrevem o suporte ao protocolo ou ao cliente, mas atualmente não estão conectados à exposição de skills.

Não existe um frontmatter de skill `required-capabilities` ou equivalente. Adicioná-lo seria um novo contrato de skill.

## Opção A: Adicionar `required-capabilities`

Adicionar um campo de frontmatter de skill genérico:

```yaml
---
name: qwencode-viz
description: Render analytical charts in Web Shell using echarts-fulldata fenced code blocks.
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
---
```

Quando o cliente/sessão atual não anuncia todas as capacidades listadas, a skill é tratada como indisponível.

### Nomenclatura de Capacidades

Use capacidades de string com namespace:

```text
markdown.codeBlock.echarts-fulldata
```

Isso mantém o campo genérico, tornando o contrato preciso:

- `markdown`: a capacidade pertence ao markdown renderizado.
- `codeBlock`: a capacidade se aplica à renderização de blocos de código delimitados.
- `echarts-fulldata`: a string de linguagem/info específica suportada pelo renderizador.

Exemplos futuros poderiam ser:

- `markdown.codeBlock.vega-lite`
- `markdown.codeBlock.mermaid-interactive`
- `artifact.openUrl`

### Metadados de Skill

Adicionar `requiredCapabilities?: string[]` à configuração da skill após analisar a chave de frontmatter `required-capabilities`.

Ambos os caminhos de análise de skill devem compreender o campo:

- `packages/core/src/skills/skill-load.ts`
- `packages/core/src/skills/skill-manager.ts`

O campo deve ser opcional. Ausente ou vazio significa que a skill não tem requisito de capacidade do cliente.

### Fonte de Capacidade em Runtime

Adicionar capacidades do cliente/sessão à configuração de runtime:

```ts
interface ConfigParameters {
  clientCapabilitiesProvider?: () => ReadonlySet<string>;
}
```

Expor um helper em `Config`, por exemplo:

```ts
config.getClientCapabilities(): ReadonlySet<string>
```

Em seguida, centralizar a verificação:

```ts
function skillMeetsRequiredCapabilities(skill: Skill, config: Config): boolean {
  return skill.config.requiredCapabilities.every((capability) =>
    config.getClientCapabilities().has(capability),
  );
}
```

### Pontos de Filtragem

O filtro de capacidade deve ser aplicado antes que as skills sejam expostas ao modelo ou ao usuário:

- `collectAvailableSkillEntries` em `packages/core/src/tools/skill-utils.ts` deve ignorar skills cujas capacidades requeridas estão faltando. Isso mantém os lembretes de skill na inicialização, lembretes de delta, validação de `SkillTool` e ativação invocável pelo modelo alinhados.
- `BundledSkillLoader` deve ignorar skills integradas indisponíveis ao criar comandos voltados para o usuário.
- `SkillCommandLoader` deve ignorar skills de sistema de arquivos indisponíveis ao criar comandos voltados para o usuário.

O invariante importante é que uma skill oculta do modelo não deve continuar aparecendo como um comando invocável, a menos que o projeto suporte intencionalmente uma substituição manual.

### Registro no Web Shell

O Web Shell deve anunciar o suporte ao renderizador explicitamente, em vez de depender da presença de um callback opaco `renderCodeBlock`.

Por exemplo:

```tsx
<WebShell
  customization={{
    markdown: {
      renderableCodeBlockLanguages: ['echarts-fulldata'],
      renderCodeBlock(info) {
        // render custom blocks
      },
    },
  }}
/>
```

O cliente Web Shell pode mapear isso para:

```text
markdown.codeBlock.echarts-fulldata
```

Isso torna a declaração de capacidade estável, mesmo que o callback do renderizador contenha lógica personalizada, fallbacks ou múltiplos idiomas suportados.

### Propagação no Daemon e ACP

Para sessões hospedadas ou baseadas em daemon, o conjunto de capacidades do cliente precisa chegar ao core antes que as skills sejam carregadas ou listadas. Uma versão mínima pode passar as capacidades ao criar uma sessão:

```ts
interface CreateSessionRequest {
  clientCapabilities?: string[];
}
```

O bridge do daemon, o SDK e o fluxo de criação de sessão ACP podem armazenar isso como uma configuração com escopo de sessão.

Para a primeira versão, as capacidades podem ter escopo de sessão. Se múltiplos clientes se conectarem à mesma sessão, o comportamento deve ser documentado como o uso das capacidades do momento da criação da sessão.

### Prós

- Mantém o `qwencode-viz` como uma skill integrada canônica.
- Impede que contratos de saída específicos de host vazem para clientes não suportados.
- Cria um mecanismo reutilizável para skills futuras específicas de renderizador ou de host.
- Torna a dependência explícita e testável.

### Contras

- Adiciona um novo campo de metadados de skill transversal.
- Requer a integração de capacidades de cliente/sessão nas superfícies Web Shell, daemon, SDK e ACP.
- Requer documentação cuidadosa para o comportamento de sessão compartilhada.
- Pode ser mais complexo do que o necessário se o `qwencode-viz` for a única skill esperada controlada por capacidade.

## Opção B: Skill Fornecida pelo Cliente

Não adicionar um campo genérico `required-capabilities`. Em vez disso, evitar integrar o `qwencode-viz` no core. O cliente Web Shell, ou qualquer cliente que suporte o renderizador, fornece a própria skill.

Modelos de distribuição possíveis:

- O host do Web Shell instala `.qwen/skills/qwencode-viz/SKILL.md`.
- O pacote Web Shell distribui um modelo de skill opcional e não carregado automaticamente que um host pode copiar ou instalar quando a renderização de gráficos está habilitada.
- A integração do Web Shell distribui um pacote de skill de extensão.
- A integração do Web Shell injeta instruções de modelo equivalentes somente quando seu renderizador de gráficos está habilitado.

Neste modelo, a skill está disponível apenas porque o cliente de renderização escolheu fornecê-la.

### Prós

- Alteração mínima no core.
- Nenhum novo contrato global de metadados de skill.
- A disponibilidade de capacidade é naturalmente de propriedade do cliente que implementa o renderizador.
- Evita a integração com daemon ou ACP, a menos que o cliente já tenha um mecanismo de injeção de skill.

### Contras

- Nenhuma skill integrada canônica, a menos que todos os clientes copiem o mesmo conteúdo.
- Mais carga para cada integrador do Web Shell.
- Usuários que alternam entre clientes podem ver uma disponibilidade de skill inconsistente.
- Não cria uma salvaguarda geral para skills futuras específicas de host.
- Mais difícil de testar no core porque a disponibilidade depende de instalação ou injeção externa.

## Recomendação

Para este PR, use a Opção B.

Isso mantém o sistema de skills do core inalterado e evita expor instruções `echarts-fulldata` em clientes não suportados. O hook do renderizador do Web Shell continua útil para qualquer renderizador de bloco de propriedade do host, enquanto as instruções de modelo específicas de gráficos se tornam um opt-in explícito do host.

A longo prazo, discuta isso como uma decisão de limite de produto/API.

Escolha a Opção A se os mantenedores esperam que o Qwen Code suporte mais contratos de saída renderizados pelo cliente ao longo do tempo. Nesse caso, `required-capabilities` é um pequeno contrato geral que garante que a exposição de skills seja correta entre CLI, Web Shell, ACP e clientes futuros.

Escolha a Opção B se for esperado que o `qwencode-viz` permaneça como uma extensão exclusiva do Web Shell e os mantenedores não queiram que as skills do core dependam de recursos de renderização do cliente. Nesse caso, a skill integrada atual deve ser removida do core e fornecida por clientes Web Shell que suportam `echarts-fulldata`.

O padrão futuro recomendado é a Opção A somente se os mantenedores estiverem confortáveis em tornar as capacidades de cliente/sessão parte do sistema de skills. Caso contrário, mantenha as skills de renderizador de host como propriedade do cliente.

## Questões em Aberto

- As capacidades devem ter escopo de sessão, escopo de requisição ou escopo de cliente?
- Capacidades ausentes devem ocultar comandos invocáveis pelo usuário ou apenas ocultar a ativação de skills invocáveis pelo modelo?
- Os nomes das capacidades devem ser strings de forma livre ou validados em relação a um registro conhecido?
- Skills indisponíveis devem ser totalmente ocultadas de `/skills` ou mostradas como desativadas com um motivo?
- Deve haver uma substituição manual para usuários que desejam intencionalmente emitir blocos brutos `echarts-fulldata` em clientes não suportados?
- O nome do campo deve ser `required-capabilities`, `requires-capabilities` ou `client-capabilities`?

## Plano de Validação

Se a Opção A for implementada, adicione testes para:

- Análise de frontmatter em ambos os caminhos de análise de skill.
- `collectAvailableSkillEntries` ocultando uma skill quando as capacidades estão ausentes.
- A mesma skill aparecendo quando as capacidades estão presentes.
- Interação com `paths`, `skills.disabled` e `disable-model-invocation`.
- Visibilidade de comandos de `BundledSkillLoader` e `SkillCommandLoader`.
- Mapeamento do Web Shell de linguagens de bloco de código suportadas para capacidades do cliente.
- Criação de sessão Daemon ou ACP preservando o conjunto de capacidades.
- Testes de integração de skills integradas existentes, para garantir que skills sem `required-capabilities` permaneçam inalteradas.

## Migração

Skills existentes não requerem migração porque o novo campo é opcional.

Para o caminho atual da Opção B, remova a skill de gráfico das skills integradas do core. O modelo do pacote Web Shell não deve ser carregado automaticamente pelo core; os hosts aderem instalando-o ou injetando-o.

Se a Opção A for aceita, adicione:

```yaml
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
```

a um futuro `qwencode-viz` integrado.

Se a Opção B for aceita, remova a skill de gráfico das skills integradas do core e documente como os clientes Web Shell podem instalá-la ou injetá-la quando registrarem um renderizador `echarts-fulldata`.