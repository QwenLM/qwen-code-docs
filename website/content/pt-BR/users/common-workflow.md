# Fluxos de trabalho comuns

> Conheça os fluxos de trabalho comuns com o Qwen Code.

Cada tarefa neste documento inclui instruções claras, exemplos de comandos e melhores práticas para ajudar você a aproveitar ao máximo o Qwen Code.

## Entender novas bases de código

### Obter uma visão geral rápida da base de código

Suponha que você acabou de entrar em um novo projeto e precisa entender sua estrutura rapidamente.

**1. Navegue até o diretório raiz do projeto**

```bash
cd /path/to/project
```

**2. Inicie o Qwen Code**

```bash
qwen
```

**3. Peça uma visão geral de alto nível**

```
give me an overview of this codebase
```

**4. Aprofunde-se em componentes específicos**

```
explain the main architecture patterns used here
```

```
what are the key data models?
```

```
how is authentication handled?
```

> [!tip]
>
> - Comece com perguntas amplas e depois vá para áreas específicas
> - Pergunte sobre convenções e padrões de código usados no projeto
> - Solicite um glossário de termos específicos do projeto

### Encontrar código relevante

Suponha que você precise localizar código relacionado a um recurso ou funcionalidade específica.

**1. Peça ao Qwen Code para encontrar arquivos relevantes**

```
find the files that handle user authentication
```

**2. Obtenha contexto sobre como os componentes interagem**

```
how do these authentication files work together?
```

**3. Entenda o fluxo de execução**

```
trace the login process from front-end to database
```

> [!tip]
>
> - Seja específico sobre o que está procurando
> - Use a linguagem de domínio do projeto

## Corrigir bugs com eficiência

Suponha que você encontrou uma mensagem de erro e precisa encontrar e corrigir sua origem.

**1. Compartilhe o erro com o Qwen Code**

```
I'm seeing an error when I run npm test
```

**2. Peça recomendações de correção**

```
suggest a few ways to fix the @ts-ignore in user.ts
```

**3. Aplique a correção**

```
update user.tsto add the null check you suggested
```

> [!tip]
>
> - Informe ao Qwen Code o comando para reproduzir o problema e obter um stack trace
> - Mencione quaisquer etapas para reproduzir o erro
> - Avise ao Qwen Code se o erro é intermitente ou consistente

## Refatorar código

Suponha que você precise atualizar código antigo para usar padrões e práticas modernas.

**1. Identifique código legado para refatoração**

```
find deprecated API usage in our codebase
```

**2. Obtenha recomendações de refatoração**

```
suggest how to refactor utils.js to use modern JavaScript features
```

**3. Aplique as alterações com segurança**

```
refactor utils.js to use ES 2024 features while maintaining the same behavior
```

**4. Verifique a refatoração**

```
run tests for the refactored code
```

> [!tip]
>
> - Peça ao Qwen Code para explicar os benefícios da abordagem moderna
> - Solicite que as alterações mantenham a compatibilidade com versões anteriores, quando necessário
> - Faça a refatoração em incrementos pequenos e testáveis

## Usar subagentes especializados

Suponha que você queira usar subagentes de IA especializados para lidar com tarefas específicas de forma mais eficaz.

**1. Visualize os subagentes disponíveis**

```
/agents
```

Isso mostra todos os subagentes disponíveis e permite criar novos.

**2. Use subagentes automaticamente**

O Qwen Code delega automaticamente tarefas apropriadas a subagentes especializados:

```
review my recent code changes for security issues
```

```
run all tests and fix any failures
```

**3. Solicite explicitamente subagentes específicos**

```
use the code-reviewer subagent to check the auth module
```

```
have the debugger subagent investigate why users can't log in
```

**4. Crie subagentes personalizados para seu fluxo de trabalho**

```
/agents
```

Em seguida, selecione "create" e siga as instruções para definir:

- Um identificador exclusivo que descreva o propósito do subagente (por exemplo, `code-reviewer`, `api-designer`).
- Quando o Qwen Code deve usar esse agente
- Quais ferramentas ele pode acessar
- Um prompt de sistema descrevendo a função e o comportamento do agente

> [!tip]
>
> - Crie subagentes específicos do projeto em `.qwen/agents/` para compartilhamento em equipe
> - Use campos `description` descritivos para permitir delegação automática
> - Limite o acesso às ferramentas ao que cada subagente realmente precisa
> - Saiba mais sobre [Sub Agents](./features/sub-agents)
> - Saiba mais sobre [Approval Mode](./features/approval-mode)

## Trabalhar com testes

Suponha que você precise adicionar testes para código não coberto.

**1. Identifique código não testado**

```
find functions in NotificationsService.swift that are not covered by tests
```

**2. Gere a estrutura de testes**

```
add tests for the notification service
```

**3. Adicione casos de teste relevantes**

```
add test cases for edge conditions in the notification service
```

**4. Execute e verifique os testes**

```
run the new tests and fix any failures
```

O Qwen Code pode gerar testes que seguem os padrões e convenções existentes do seu projeto. Ao solicitar testes, seja específico sobre qual comportamento deseja verificar. O Qwen Code examina seus arquivos de teste existentes para corresponder ao estilo, aos frameworks e aos padrões de asserção já em uso.

Para uma cobertura abrangente, peça ao Qwen Code para identificar casos de borda que você possa ter perdido. O Qwen Code pode analisar seus caminhos de código e sugerir testes para condições de erro, valores limite e entradas inesperadas que são fáceis de ignorar.

## Criar pull requests

Suponha que você precise criar um pull request bem documentado para suas alterações.

**1. Resuma suas alterações**

```
summarize the changes I've made to the authentication module
```

**2. Gere um pull request com o Qwen Code**

```
create a pr
```

**3. Revise e refine**

```
enhance the PR description with more context about the security improvements
```

**4. Adicione detalhes de teste**

```
add information about how these changes were tested
```

> [!tip]
>
> - Peça diretamente ao Qwen Code para criar um PR para você
> - Revise o PR gerado pelo Qwen Code antes de enviar
> - Peça ao Qwen Code para destacar riscos ou considerações potenciais

## Gerenciar documentação

Suponha que você precise adicionar ou atualizar a documentação do seu código.

**1. Identifique código sem documentação**

```
find functions without proper JSDoc comments in the auth module
```

**2. Gere a documentação**

```
add JSDoc comments to the undocumented functions in auth.js
```

**3. Revise e aprimore**

```
improve the generated documentation with more context and examples
```

**4. Verifique a documentação**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - Especifique o estilo de documentação desejado (JSDoc, docstrings, etc.)
> - Solicite exemplos na documentação
> - Peça documentação para APIs públicas, interfaces e lógica complexa

## Referenciar arquivos e diretórios

Use `@` para incluir rapidamente arquivos ou diretórios sem esperar o Qwen Code lê-los.

**1. Referencie um único arquivo**

```
Explain the logic in @src/utils/auth.js
```

Isso inclui o conteúdo completo do arquivo na conversa.

**2. Referencie um diretório**

```
What's the structure of @src/components?
```

Isso fornece uma listagem do diretório com informações dos arquivos.

**3. Referencie recursos MCP**

```
Show me the data from @github: repos/owner/repo/issues
```

Isso busca dados de servidores MCP conectados usando o formato @server: resource. Consulte [MCP](./features/mcp) para detalhes.

> [!tip]
>
> - Os caminhos de arquivo podem ser relativos ou absolutos
> - Referências de arquivo `@` adicionam `QWEN.md` no diretório do arquivo e nos diretórios pais ao contexto
> - Referências de diretório mostram listagens de arquivos, não conteúdos
> - Você pode referenciar vários arquivos em uma única mensagem (por exemplo, "`@file 1.js` e `@file 2.js`")

## Retomar conversas anteriores

Suponha que você estava trabalhando em uma tarefa com o Qwen Code e precisa continuar de onde parou em uma sessão posterior.

O Qwen Code oferece duas opções para retomar conversas anteriores:

- `--continue` para continuar automaticamente a conversa mais recente
- `--resume` para exibir um seletor de conversas

**1. Continue a conversa mais recente**

```bash
qwen --continue
```

Isso retoma imediatamente sua conversa mais recente sem nenhum prompt.

**2. Continue no modo não interativo**

```bash
qwen --continue --p "Continue with my task"
```

Use `--print` com `--continue` para retomar a conversa mais recente no modo não interativo, perfeito para scripts ou automação.

**3. Exiba o seletor de conversas**

```bash
qwen --resume
```

Isso exibe um seletor de conversas interativo com uma visualização em lista limpa mostrando:

- Resumo da sessão (ou prompt inicial)
- Metadados: tempo decorrido, contagem de mensagens e branch do git

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
> 1. **Armazenamento de conversas**: Todas as conversas são salvas automaticamente no local com seu histórico completo de mensagens
> 2. **Desserialização de mensagens**: Ao retomar, todo o histórico de mensagens é restaurado para manter o contexto
> 3. **Estado das ferramentas**: O uso e os resultados das ferramentas da conversa anterior são preservados
> 4. **Restauração de contexto**: A conversa é retomada com todo o contexto anterior intacto
>
> **Exemplos**:
>
> ```bash
> # Continue most recent conversation
> qwen --continue
>
> # Continue most recent conversation with a specific prompt
> qwen --continue --p "Show me our progress"
>
> # Show conversation picker
> qwen --resume
>
> # Continue most recent conversation in non-interactive mode
> qwen --continue --p "Run the tests again"
> ```

## Executar sessões paralelas do Qwen Code com Git worktrees

Suponha que você precise trabalhar em várias tarefas simultaneamente com isolamento completo de código entre instâncias do Qwen Code.

**1. Entenda os Git worktrees**

Os Git worktrees permitem fazer checkout de múltiplos branches do mesmo repositório em diretórios separados. Cada worktree tem seu próprio diretório de trabalho com arquivos isolados, compartilhando o mesmo histórico do Git. Saiba mais na [documentação oficial do Git worktree](https://git-scm.com/docs/git-worktree).

**2. Crie um novo worktree**

```bash
# Create a new worktree with a new branch
git worktree add ../project-feature-a -b feature-a

# Or create a worktree with an existing branch
git worktree add ../project-bugfix bugfix-123
```

Isso cria um novo diretório com uma cópia de trabalho separada do seu repositório.

**3. Execute o Qwen Code em cada worktree**

```bash
# Navigate to your worktree
cd ../project-feature-a

# Run Qwen Code in this isolated environment
qwen
```

**4. Execute o Qwen Code em outro worktree**

```bash
cd ../project-bugfix
qwen
```

**5. Gerencie seus worktrees**

```bash
# List all worktrees
git worktree list

# Remove a worktree when done
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Cada worktree tem seu próprio estado de arquivo independente, tornando-o perfeito para sessões paralelas do Qwen Code
> - As alterações feitas em um worktree não afetarão os outros, evitando que instâncias do Qwen Code interfiram umas nas outras
> - Todos os worktrees compartilham o mesmo histórico do Git e conexões remotas
> - Para tarefas de longa duração, você pode deixar o Qwen Code trabalhando em um worktree enquanto continua o desenvolvimento em outro
> - Use nomes de diretório descritivos para identificar facilmente a tarefa de cada worktree
> - Lembre-se de inicializar seu ambiente de desenvolvimento em cada novo worktree de acordo com a configuração do seu projeto. Dependendo da sua stack, isso pode incluir:
>   - Projetos JavaScript: Executar a instalação de dependências (`npm install`, `yarn`)
>   - Projetos Python: Configurar ambientes virtuais ou instalar com gerenciadores de pacotes
>   - Outras linguagens: Seguir o processo de configuração padrão do seu projeto

## Usar o Qwen Code como um utilitário estilo Unix

### Adicionar o Qwen Code ao seu processo de verificação

Suponha que você queira usar o Qwen Code como um linter ou revisor de código.

**Adicione o Qwen Code ao seu script de build:**

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
> - Use o Qwen Code para revisão automática de código no seu pipeline de CI/CD
> - Personalize o prompt para verificar problemas específicos relevantes ao seu projeto
> - Considere criar vários scripts para diferentes tipos de verificação

### Entrada e saída via pipe

Suponha que você queira enviar dados via pipe para o Qwen Code e receber dados de volta em um formato estruturado.

**Envie dados via pipe pelo Qwen Code:**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - Use pipes para integrar o Qwen Code a scripts shell existentes
> - Combine com outras ferramentas Unix para fluxos de trabalho poderosos
> - Considere usar `--output-format` para saída estruturada

### Controlar o formato de saída

Suponha que você precise da saída do Qwen Code em um formato específico, especialmente ao integrá-lo a scripts ou outras ferramentas.

**1. Use o formato de texto (padrão)**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

Isso gera apenas a resposta em texto simples do Qwen Code (comportamento padrão).

**2. Use o formato JSON**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

Isso gera um array JSON de mensagens com metadados, incluindo custo e duração.

**3. Use o formato JSON em streaming**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

Isso gera uma série de objetos JSON em tempo real conforme o Qwen Code processa a solicitação. Cada mensagem é um objeto JSON válido, mas a saída inteira não é um JSON válido se concatenada.

> [!tip]
>
> - Use `--output-format text` para integrações simples onde você só precisa da resposta do Qwen Code
> - Use `--output-format json` quando precisar do log completo da conversa
> - Use `--output-format stream-json` para saída em tempo real de cada turno da conversa

## Perguntar ao Qwen Code sobre seus recursos

O Qwen Code tem acesso integrado à sua documentação e pode responder perguntas sobre seus próprios recursos e limitações.

### Perguntas de exemplo

```
can Qwen Code create pull requests?
```

```
how does Qwen Code handle permissions?
```

```
what slash commands are available?
```

```
how do I use MCP with Qwen Code?
```

```
how do I configure Qwen Code for Amazon Bedrock?
```

```
what are the limitations of Qwen Code?
```

> [!note]
>
> O Qwen Code fornece respostas baseadas em documentação para essas perguntas. Para exemplos executáveis e demonstrações práticas, consulte as seções de fluxo de trabalho específicas acima.

> [!tip]
>
> - O Qwen Code sempre tem acesso à documentação mais recente do Qwen Code, independentemente da versão que você está usando
> - Faça perguntas específicas para obter respostas detalhadas
> - O Qwen Code pode explicar recursos complexos como integração com MCP, configurações empresariais e fluxos de trabalho avançados