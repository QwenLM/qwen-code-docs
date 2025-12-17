# Fluxos de trabalho comuns

> Aprenda sobre fluxos de trabalho comuns com o Qwen Code.

Cada tarefa neste documento inclui instruções claras, comandos de exemplo e práticas recomendadas para ajudá-lo a aproveitar ao máximo o Qwen Code.

## Entender novas bases de código

### Obter uma visão geral rápida da base de código

Suponha que você acabou de ingressar em um novo projeto e precisa entender rapidamente sua estrutura.

**1. Navegue até o diretório raiz do projeto**

```bash
cd /caminho/para/o/projeto
```

**2. Inicie o Qwen Code**

```bash
qwen
```

**3. Peça uma visão geral de alto nível**

```
me dê uma visão geral desta base de código
```

**4. Aprofunde-se em componentes específicos**

```
explique os principais padrões arquiteturais usados aqui
```

```
quais são os principais modelos de dados?
```

```
como é feita a autenticação?
```

> [!tip]
>
> - Comece com perguntas gerais e depois foque em áreas específicas
> - Pergunte sobre convenções e padrões de codificação utilizados no projeto
> - Solicite um glossário com termos específicos do projeto

### Encontrar código relevante

Suponha que você precise localizar código relacionado a um recurso ou funcionalidade específica.

**1. Peça ao Qwen Code para encontrar arquivos relevantes**

```
encontre os arquivos que tratam da autenticação de usuários
```

**2. Obtenha contexto sobre como os componentes interagem**

```
como esses arquivos de autenticação funcionam juntos?
```

**3. Entenda o fluxo de execução**

```
rastreie o processo de login do front-end até o banco de dados
```

> [!tip]
>
> - Seja específico sobre o que você está procurando
> - Use a linguagem do domínio do projeto

## Corrija bugs de forma eficiente

Suponha que você tenha encontrado uma mensagem de erro e precise encontrar e corrigir sua origem.

**1. Compartilhe o erro com o Qwen Code**

```
Estou vendo um erro quando executo npm test
```

**2. Peça recomendações de correção**

```
sugira algumas formas de corrigir o @ts-ignore em user.ts
```

**3. Aplique a correção**

```
atualize user.ts para adicionar a verificação de null que você sugeriu
```

> [!tip]
>
> - Informe ao Qwen Code o comando para reproduzir o problema e obter um stack trace
> - Mencione quaisquer etapas para reproduzir o erro
> - Avise ao Qwen Code se o erro é intermitente ou consistente

## Refatorar código

Suponha que você precise atualizar código antigo para usar padrões e práticas modernas.

**1. Identificar código legado para refatoração**

```
encontrar uso de API descontinuada em nossa base de código
```

**2. Obter recomendações de refatoração**

```
sugerir como refatorar utils.js para usar recursos modernos do JavaScript
```

**3. Aplicar as mudanças com segurança**

```
refatorar utils.js para usar recursos do ES 2024 mantendo o mesmo comportamento
```

**4. Verificar a refatoração**

```
executar testes para o código refatorado
```

> [!tip]
>
> - Peça ao Qwen Code para explicar os benefícios da abordagem moderna
> - Solicite que as alterações mantenham compatibilidade com versões anteriores quando necessário
> - Faça a refatoração em pequenos incrementos testáveis

## Usar subagentes especializados

Suponha que você queira usar subagentes de IA especializados para lidar com tarefas específicas de forma mais eficaz.

**1. Visualizar subagentes disponíveis**

```
/agents
```

Isso mostra todos os subagentes disponíveis e permite criar novos.

**2. Usar subagentes automaticamente**

O Qwen Code delega automaticamente tarefas apropriadas para subagentes especializados:

```
revisar minhas alterações de código recentes em busca de problemas de segurança
```

```
executar todos os testes e corrigir quaisquer falhas
```

**3. Solicitar explicitamente subagentes específicos**

```
usar o subagente code-reviewer para verificar o módulo de autenticação
```

```
pedir ao subagente debugger para investigar por que os usuários não conseguem fazer login
```

**4. Criar subagentes personalizados para seu fluxo de trabalho**

```
/agents
```

Em seguida, selecione "create" e siga as instruções para definir:

- Um identificador exclusivo que descreva a finalidade do subagente (por exemplo, `code-reviewer`, `api-designer`).
- Quando o Qwen Code deve usar este agente
- Quais ferramentas ele pode acessar
- Uma instrução do sistema descrevendo a função e o comportamento do agente

> [!tip]
>
> - Crie subagentes específicos do projeto em `.qwen/agents/` para compartilhamento em equipe
> - Use campos `description` descritivos para permitir delegação automática
> - Limite o acesso às ferramentas ao que cada subagente realmente precisa
> - Saiba mais sobre [Sub Agentes](./features/sub-agents)
> - Saiba mais sobre [Modo de Aprovação](./features/approval-mode)

## Trabalhe com testes

Suponha que você precise adicionar testes para código não coberto.

**1. Identifique o código não testado**

```
encontre funções em NotificationsService.swift que não estão cobertas por testes
```

**2. Gere a estrutura de testes**

```
adicione testes para o serviço de notificação
```

**3. Adicione casos de teste significativos**

```
adicione casos de teste para condições extremas no serviço de notificação
```

**4. Execute e verifique os testes**

```
execute os novos testes e corrija quaisquer falhas
```

O Qwen Code pode gerar testes que seguem os padrões e convenções existentes do seu projeto. Ao solicitar testes, seja específico sobre qual comportamento deseja verificar. O Qwen Code examina seus arquivos de teste existentes para corresponder ao estilo, frameworks e padrões de asserção já utilizados.

Para uma cobertura abrangente, peça ao Qwen Code para identificar casos extremos que você possa ter perdido. O Qwen Code pode analisar seus caminhos de código e sugerir testes para condições de erro, valores limite e entradas inesperadas que são fáceis de serem ignoradas.

## Criar pull requests

Suponha que você precise criar um pull request bem documentado para suas alterações.

**1. Resuma suas alterações**

```
resuma as mudanças que fiz no módulo de autenticação
```

**2. Gere um pull request com o Qwen Code**

```
crie um pr
```

**3. Revise e refine**

```
melhore a descrição do PR com mais contexto sobre as melhorias de segurança
```

**4. Adicione detalhes de teste**

```
adicione informações sobre como essas alterações foram testadas
```

> [!tip]
>
> - Peça diretamente ao Qwen Code para fazer um PR para você
> - Revise o PR gerado pelo Qwen Code antes de enviar
> - Peça ao Qwen Code para destacar riscos ou considerações potenciais

## Lidar com documentação

Suponha que você precise adicionar ou atualizar a documentação do seu código.

**1. Identificar código não documentado**

```
encontrar funções sem comentários JSDoc adequados no módulo de autenticação
```

**2. Gerar documentação**

```
adicionar comentários JSDoc às funções não documentadas em auth.js
```

**3. Revisar e aprimorar**

```
melhorar a documentação gerada com mais contexto e exemplos
```

**4. Verificar documentação**

```
verificar se a documentação segue nossos padrões de projeto
```

> [!tip]
>
> - Especifique o estilo de documentação desejado (JSDoc, docstrings, etc.)
> - Peça exemplos na documentação
> - Solicite documentação para APIs públicas, interfaces e lógica complexa

## Arquivos e diretórios de referência

Use `@` para incluir rapidamente arquivos ou diretórios sem esperar que o Qwen Code os leia.

**1. Referenciar um único arquivo**

```
Explique a lógica em @src/utils/auth.js
```

Isso inclui o conteúdo completo do arquivo na conversa.

**2. Referenciar um diretório**

```
Qual é a estrutura de @src/components?
```

Isso fornece uma listagem do diretório com informações dos arquivos.

**3. Referenciar recursos MCP**

```
Mostre-me os dados de @github: repos/owner/repo/issues
```

Isso busca dados de servidores MCP conectados usando o formato @servidor: recurso. Veja [MCP](./features/mcp) para detalhes.

> [!tip]
>
> - Caminhos de arquivo podem ser relativos ou absolutos
> - Referências de arquivos @ adicionam `QWEN.md` no diretório do arquivo e nos diretórios pai ao contexto
> - Referências de diretórios mostram listagens de arquivos, não conteúdos
> - Você pode referenciar vários arquivos em uma única mensagem (por exemplo, "`@arquivo 1.js` e `@arquivo 2.js`")

## Retomar conversas anteriores

Suponha que você esteja trabalhando em uma tarefa com o Qwen Code e precise continuar de onde parou em uma sessão posterior.

O Qwen Code oferece duas opções para retomar conversas anteriores:

- `--continue` para continuar automaticamente a conversa mais recente
- `--resume` para exibir um seletor de conversas

**1. Continuar a conversa mais recente**

```bash
qwen --continue
```

Isso retoma imediatamente sua conversa mais recente sem nenhum prompt.

**2. Continuar no modo não interativo**

```bash
qwen --continue --p "Continue com minha tarefa"
```

Use `--print` com `--continue` para retomar a conversa mais recente no modo não interativo, perfeito para scripts ou automação.

**3. Mostrar seletor de conversas**

```bash
qwen --resume
```

Isso exibe um seletor de conversas interativo com uma visualização limpa em lista mostrando:

- Resumo da sessão (ou prompt inicial)
- Metadados: tempo decorrido, número de mensagens e branch do git

Use as setas para navegar e pressione Enter para selecionar uma conversa. Pressione Esc para sair.

> [!tip]
>
> - O histórico de conversas é armazenado localmente na sua máquina
> - Use `--continue` para acesso rápido à sua conversa mais recente
> - Use `--resume` quando precisar selecionar uma conversa anterior específica
> - Ao retomar, você verá todo o histórico da conversa antes de continuar
> - A conversa retomada começa com o mesmo modelo e configuração da original
>
> **Como funciona**:
>
> 1. **Armazenamento de Conversas**: Todas as conversas são salvas automaticamente localmente com seu histórico completo de mensagens
> 2. **Desserialização de Mensagens**: Ao retomar, todo o histórico de mensagens é restaurado para manter o contexto
> 3. **Estado das Ferramentas**: O uso de ferramentas e os resultados da conversa anterior são preservados
> 4. **Restauração de Contexto**: A conversa retoma com todo o contexto anterior intacto
>
> **Exemplos**:
>
> ```bash
> # Continuar a conversa mais recente
> qwen --continue
>
> # Continuar a conversa mais recente com um prompt específico
> qwen --continue --p "Mostre-me nosso progresso"
>
> # Mostrar seletor de conversas
> qwen --resume
>
> # Continuar a conversa mais recente no modo não interativo
> qwen --continue --p "Execute os testes novamente"
> ```

## Execute sessões paralelas do Qwen Code com worktrees do Git

Suponha que você precise trabalhar em múltiplas tarefas simultaneamente com isolamento completo de código entre as instâncias do Qwen Code.

**1. Entenda os worktrees do Git**

Os worktrees do Git permitem fazer checkout de múltiplos ramos do mesmo repositório em diretórios separados. Cada worktree possui seu próprio diretório de trabalho com arquivos isolados, compartilhando ao mesmo tempo o histórico do Git. Saiba mais na [documentação oficial do Git worktree](https://git-scm.com/docs/git-worktree).

**2. Crie um novo worktree**

```bash

# Cria um novo worktree com um novo ramo
git worktree add ../project-feature-a -b feature-a

# Ou cria um worktree com um ramo existente
git worktree add ../project-bugfix bugfix-123
```

Isso cria um novo diretório com uma cópia de trabalho separada do seu repositório.

**3. Execute o Qwen Code em cada worktree**

```bash

# Navegue até seu worktree
cd ../project-feature-a

# Execute o código Qwen neste ambiente isolado
qwen
```

**4. Execute o código Qwen em outra árvore de trabalho**

```bash
cd ../project-bugfix
qwen
```

**5. Gerencie suas árvores de trabalho**

```bash

# Liste todas as árvores de trabalho
git worktree list

```markdown
# Remova uma worktree quando terminar
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Cada worktree possui seu próprio estado de arquivos independente, tornando-a perfeita para sessões paralelas do Qwen Code
> - Alterações feitas em uma worktree não afetam outras, evitando que instâncias do Qwen Code interfiram umas nas outras
> - Todas as worktrees compartilham o mesmo histórico Git e conexões remotas
> - Para tarefas de longa duração, você pode ter o Qwen Code trabalhando em uma worktree enquanto continua o desenvolvimento em outra
> - Use nomes de diretórios descritivos para identificar facilmente qual tarefa cada worktree está destinada
> - Lembre-se de inicializar seu ambiente de desenvolvimento em cada nova worktree de acordo com a configuração do seu projeto. Dependendo da sua stack, isso pode incluir:
>   - Projetos JavaScript: Execução da instalação de dependências (`npm install`, `yarn`)
>   - Projetos Python: Configuração de ambientes virtuais ou instalação com gerenciadores de pacotes
>   - Outras linguagens: Seguir o processo padrão de configuração do seu projeto

## Use Qwen Code como um utilitário no estilo unix

### Adicione Qwen Code ao seu processo de verificação

Suponha que você queira usar o Qwen Code como um linter ou revisor de código.

**Adicione Qwen Code ao seu script de build:**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'you are a linter. please look at the changes vs. main and report any issues related to typos. report the filename and line number on one line, and a description of the issue on the second line. do not return any other text.'"
    }
}
```

> [!tip]
>
> - Use Qwen Code para revisão automática de código em seu pipeline de CI/CD
> - Personalize o prompt para verificar problemas específicos relevantes ao seu projeto
> - Considere criar vários scripts para diferentes tipos de verificação

### Pipe in, pipe out

Suponha que você queira direcionar dados para o Qwen Code e obter de volta dados em um formato estruturado.

**Direcione dados através do Qwen Code:**

```bash
cat build-error.txt | qwen -p 'explique de forma concisa a causa raiz deste erro de build' > output.txt
```

> [!tip]
>
> - Use pipes para integrar o Qwen-Code em scripts shell existentes
> - Combine com outras ferramentas Unix para fluxos de trabalho poderosos
> - Considere usar --output-format para saída estruturada

### Controlar o formato de saída

Suponha que você precise da saída do Qwen Code em um formato específico, especialmente ao integrar o Qwen Code em scripts ou outras ferramentas.

**1. Usar o formato texto (padrão)**

```bash
cat data.txt | qwen -p 'resuma esses dados' --output-format text > summary.txt
```

Isso gera apenas a resposta em texto simples do Qwen Code (comportamento padrão).

**2. Usar o formato JSON**

```bash
cat code.py | qwen -p 'analise este código em busca de bugs' --output-format json > analysis.json
```

Isso gera um array JSON de mensagens com metadados, incluindo custo e duração.

**3. Usar o formato JSON em streaming**

```bash
cat log.txt | qwen -p 'analise este arquivo de log em busca de erros' --output-format stream-json
```

Isso gera uma série de objetos JSON em tempo real conforme o Qwen Code processa a solicitação. Cada mensagem é um objeto JSON válido, mas a saída completa não será um JSON válido se concatenada.

> [!tip]
>
> - Use `--output-format text` para integrações simples onde você só precisa da resposta do Qwen Code
> - Use `--output-format json` quando precisar do log completo da conversa
> - Use `--output-format stream-json` para saída em tempo real de cada turno da conversa

## Pergunte ao Qwen Code sobre seus recursos

O Qwen Code tem acesso integrado à sua documentação e pode responder perguntas sobre seus próprios recursos e limitações.

### Exemplos de perguntas

```
o Qwen Code pode criar pull requests?
```

```
como o Qwen Code lida com permissões?
```

```
quais comandos slash estão disponíveis?
```

```
como uso o MCP com o Qwen Code?
```

```
como configuro o Qwen Code para o Amazon Bedrock?
```

```
quais são as limitações do Qwen Code?
```

> [!note]
>
> O Qwen Code fornece respostas baseadas na documentação para essas perguntas. Para exemplos executáveis e demonstrações práticas, consulte as seções específicas de fluxos de trabalho acima.

> [!tip]
>
> - O Qwen Code sempre tem acesso à documentação mais recente do Qwen Code, independentemente da versão que você estiver usando
> - Faça perguntas específicas para obter respostas detalhadas
> - O Qwen Code pode explicar recursos complexos como integração com MCP, configurações corporativas e fluxos de trabalho avançados