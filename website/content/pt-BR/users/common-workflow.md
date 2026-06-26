# Fluxos de trabalho comuns

> Aprenda sobre fluxos de trabalho comuns com o Qwen Code.

Cada tarefa neste documento inclui instruções claras, exemplos de comandos e práticas recomendadas para ajudá-lo a obter o máximo do Qwen Code.

## Entender bases de código novas

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
dê-me uma visão geral desta base de código
```

**4. Aprofunde-se em componentes específicos**

```
explique os principais padrões de arquitetura usados aqui
```

```
quais são os principais modelos de dados?
```

```
como a autenticação é tratada?
```

> [!tip]
>
> - Comece com perguntas amplas e depois foque em áreas específicas
> - Pergunte sobre convenções de código e padrões usados no projeto
> - Solicite um glossário de termos específicos do projeto

### Encontrar código relevante

Suponha que você precise localizar código relacionado a uma funcionalidade ou recurso específico.

**1. Peça ao Qwen Code para encontrar arquivos relevantes**

```
encontre os arquivos que lidam com autenticação de usuário
```

**2. Obtenha contexto sobre como os componentes interagem**

```
como esses arquivos de autenticação funcionam juntos?
```

**3. Entenda o fluxo de execução**

```
trace o processo de login do front-end até o banco de dados
```

> [!tip]
>
> - Seja específico sobre o que você está procurando
> - Use a linguagem de domínio do projeto

## Corrigir bugs com eficiência

Suponha que você encontrou uma mensagem de erro e precisa encontrar e corrigir sua origem.

**1. Compartilhe o erro com o Qwen Code**

```
Estou vendo um erro quando executo npm test
```

**2. Peça recomendações de correção**

```
sugira algumas maneiras de corrigir o @ts-ignore em user.ts
```

**3. Aplique a correção**

```
atualize user.ts para adicionar a verificação de nulo que você sugeriu
```

> [!tip]
>
> - Informe ao Qwen Code o comando para reproduzir o problema e obter um stack trace
> - Mencione quaisquer etapas para reproduzir o erro
> - Avise o Qwen Code se o erro é intermitente ou consistente

## Refatorar código

Suponha que você precise atualizar código antigo para usar padrões e práticas modernas.

**1. Identifique código legado para refatoração**

```
encontre uso de APIs obsoletas em nossa base de código
```

**2. Obtenha recomendações de refatoração**

```
sugira como refatorar utils.js para usar recursos modernos do JavaScript
```

**3. Aplique as alterações com segurança**

```
refatore utils.js para usar recursos do ES 2024 mantendo o mesmo comportamento
```

**4. Verifique a refatoração**

```
execute testes para o código refatorado
```

> [!tip]
>
> - Peça ao Qwen Code para explicar os benefícios da abordagem moderna
> - Solicite que as alterações mantenham compatibilidade com versões anteriores quando necessário
> - Faça a refatoração em incrementos pequenos e testáveis

## Usar subagentes especializados

Suponha que você queira usar subagentes de IA especializados para lidar com tarefas específicas de forma mais eficaz.

**1. Veja os subagentes disponíveis**

```
/agents
```

Isso mostra todos os subagentes disponíveis e permite criar novos.

**2. Use subagentes automaticamente**

O Qwen Code delega automaticamente tarefas apropriadas a subagentes especializados:

```
revise minhas alterações de código recentes em busca de problemas de segurança
```

```
execute todos os testes e corrija quaisquer falhas
```

**3. Solicite subagentes específicos explicitamente**

```
use o subagente code-reviewer para verificar o módulo de autenticação
```

```
faça o subagente debugger investigar por que os usuários não conseguem fazer login
```

**4. Crie subagentes personalizados para seu fluxo de trabalho**

```
/agents
```

Em seguida, selecione "create" e siga as instruções para definir:

- Um identificador único que descreve o propósito do subagente (por exemplo, `code-reviewer`, `api-designer`).
- Quando o Qwen Code deve usar este agente
- Quais ferramentas ele pode acessar
- Um prompt de sistema descrevendo o papel e o comportamento do agente

> [!tip]
>
> - Crie subagentes específicos do projeto em `.qwen/agents/` para compartilhamento com a equipe
> - Use campos `description` descritivos para permitir delegação automática
> - Limite o acesso a ferramentas ao que cada subagente realmente precisa
> - Saiba mais sobre [Sub Agents](./features/sub-agents)
> - Saiba mais sobre [Approval Mode](./features/approval-mode)

## Trabalhar com testes

Suponha que você precise adicionar testes para código não coberto.

**1. Identifique código não testado**

```
encontre funções em NotificationsService.swift que não são cobertas por testes
```

**2. Gere esqueleto de testes**

```
adicione testes para o serviço de notificação
```

**3. Adicione casos de teste significativos**

```
adicione casos de teste para condições de contorno no serviço de notificação
```

**4. Execute e verifique os testes**

```
execute os novos testes e corrija quaisquer falhas
```

O Qwen Code pode gerar testes que seguem os padrões e convenções existentes do seu projeto. Ao pedir testes, seja específico sobre qual comportamento você deseja verificar. O Qwen Code examina seus arquivos de teste existentes para corresponder ao estilo, frameworks e padrões de asserção já em uso.

Para cobertura abrangente, peça ao Qwen Code para identificar casos de contorno que você pode ter perdido. O Qwen Code pode analisar seus caminhos de código e sugerir testes para condições de erro, valores limites e entradas inesperadas que são fáceis de ignorar.

## Criar pull requests

Suponha que você precise criar um pull request bem documentado para suas alterações.

**1. Resuma suas alterações**

```
resuma as alterações que fiz no módulo de autenticação
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
> - Peça diretamente ao Qwen Code para criar um PR para você
> - Revise o PR gerado pelo Qwen Code antes de enviar
> - Peça ao Qwen Code para destacar riscos ou considerações potenciais

## Lidar com documentação

Suponha que você precise adicionar ou atualizar documentação para seu código.

**1. Identifique código não documentado**

```
encontre funções sem comentários JSDoc adequados no módulo auth
```

**2. Gere documentação**

```
adicione comentários JSDoc às funções não documentadas em auth.js
```

**3. Revise e melhore**

```
melhore a documentação gerada com mais contexto e exemplos
```

**4. Verifique a documentação**

```
verifique se a documentação segue os padrões do nosso projeto
```

> [!tip]
>
> - Especifique o estilo de documentação desejado (JSDoc, docstrings, etc.)
> - Peça exemplos na documentação
> - Solicite documentação para APIs públicas, interfaces e lógica complexa

## Referenciar arquivos e diretórios

Use `@` para incluir rapidamente arquivos ou diretórios sem esperar que o Qwen Code os leia.

**1. Referencie um único arquivo**

```
Explique a lógica em @src/utils/auth.js
```

Isso inclui o conteúdo completo do arquivo na conversa.

**2. Referencie um diretório**

```
Qual é a estrutura de @src/components?
```

Isso fornece uma listagem de diretório com informações sobre arquivos.

**3. Referencie recursos do MCP**

```
Mostre-me os dados de @github: repos/owner/repo/issues
```

Isso busca dados de servidores MCP conectados usando o formato @servidor: recurso. Veja [MCP](./features/mcp) para detalhes.

> [!tip]
>
> - Os caminhos de arquivo podem ser relativos ou absolutos
> - Referências a arquivos com @ adicionam `QWEN.md` no diretório do arquivo e diretórios pais ao contexto
> - Referências a diretórios mostram listagens de arquivos, não conteúdos
> - Você pode referenciar vários arquivos em uma única mensagem (por exemplo, "`@file1.js` e `@file2.js`")

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
qwen --continue -p "Continue com minha tarefa"
```

Use `-p` (ou `--prompt`) com `--continue` para retomar a conversa mais recente no modo não interativo, perfeito para scripts ou automação.

**3. Exiba o seletor de conversas**

```bash
qwen --resume
```

Isso exibe um seletor de conversas interativo com uma visualização limpa em lista mostrando:

- Resumo da sessão (ou prompt inicial)
- Metadados: tempo decorrido, número de mensagens e branch git

Use as setas do teclado para navegar e pressione Enter para selecionar uma conversa. Pressione Esc para sair.

> [!tip]
>
> - O histórico de conversas é armazenado localmente em sua máquina
> - Use `--continue` para acesso rápido à sua conversa mais recente
> - Use `--resume` quando precisar selecionar uma conversa passada específica
> - Ao retomar, você verá todo o histórico da conversa antes de continuar
> - A conversa retomada começa com o mesmo modelo e configuração da original
>
> **Como funciona**:
>
> 1. **Armazenamento de Conversas**: Todas as conversas são salvas automaticamente localmente com seu histórico completo de mensagens
> 2. **Desserialização de Mensagens**: Ao retomar, todo o histórico de mensagens é restaurado para manter o contexto
> 3. **Estado das Ferramentas**: O uso de ferramentas e resultados da conversa anterior são preservados
> 4. **Restauração de Contexto**: A conversa retoma com todo o contexto anterior intacto
>
> **Exemplos**:
>
> ```bash
> # Continuar a conversa mais recente
> qwen --continue
>
> # Continuar a conversa mais recente com um prompt específico
> qwen --continue -p "Mostre-me nosso progresso"
>
> # Exibir seletor de conversas
> qwen --resume
>
> # Continuar a conversa mais recente no modo não interativo
> qwen --continue -p "Execute os testes novamente"
> ```

## Executar sessões paralelas do Qwen Code com Git worktrees

Suponha que você precise trabalhar em várias tarefas simultaneamente com isolamento completo de código entre instâncias do Qwen Code.

**1. Entenda Git worktrees**

Git worktrees permitem que você faça checkout de várias branches do mesmo repositório em diretórios separados. Cada worktree tem seu próprio diretório de trabalho com arquivos isolados, enquanto compartilha o mesmo histórico do Git. Saiba mais na [documentação oficial do Git worktree](https://git-scm.com/docs/git-worktree).

**2. Crie um novo worktree**

```bash
# Criar um novo worktree com uma nova branch
git worktree add ../project-feature-a -b feature-a

# Ou criar um worktree com uma branch existente
git worktree add ../project-bugfix bugfix-123
```

Isso cria um novo diretório com uma cópia de trabalho separada do seu repositório.

**3. Execute Qwen Code em cada worktree**

```bash
# Navegue até seu worktree
cd ../project-feature-a

# Execute Qwen Code neste ambiente isolado
qwen
```

**4. Execute Qwen Code em outro worktree**

```bash
cd ../project-bugfix
qwen
```

**5. Gerencie seus worktrees**

```bash
# Liste todos os worktrees
git worktree list

# Remova um worktree quando terminar
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Cada worktree tem seu próprio estado de arquivo independente, tornando-o perfeito para sessões paralelas do Qwen Code
> - Alterações feitas em um worktree não afetam outros, evitando que instâncias do Qwen Code interfiram entre si
> - Todos os worktrees compartilham o mesmo histórico do Git e conexões remotas
> - Para tarefas longas, você pode ter o Qwen Code trabalhando em um worktree enquanto continua o desenvolvimento em outro
> - Use nomes de diretório descritivos para identificar facilmente para qual tarefa cada worktree é
> - Lembre-se de inicializar seu ambiente de desenvolvimento em cada novo worktree de acordo com a configuração do seu projeto. Dependendo da sua stack, isso pode incluir:
>   - Projetos JavaScript: Executar instalação de dependências (`npm install`, `yarn`)
>   - Projetos Python: Configurar ambientes virtuais ou instalar com gerenciadores de pacotes
>   - Outras linguagens: Seguir o processo de configuração padrão do seu projeto

## Usar o Qwen Code como um utilitário no estilo Unix

### Adicionar Qwen Code ao seu processo de verificação

Suponha que você queira usar o Qwen Code como um linter ou revisor de código.

**Adicione Qwen Code ao seu script de build:**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'você é um linter. por favor, veja as alterações em relação à main e relate quaisquer problemas relacionados a erros de digitação. reporte o nome do arquivo e o número da linha em uma linha, e uma descrição do problema na segunda linha. não retorne nenhum outro texto.'"
    }
}
```

> [!tip]
>
> - Use o Qwen Code para revisão automatizada de código em seu pipeline CI/CD
> - Personalize o prompt para verificar problemas específicos relevantes para seu projeto
> - Considere criar vários scripts para diferentes tipos de verificação

### Pipe para entrada, pipe para saída

Suponha que você queira canalizar dados para o Qwen Code e obter dados em um formato estruturado de volta.

**Canalize dados através do Qwen Code:**

```bash
cat build-error.txt | qwen -p 'explique concisamente a causa raiz deste erro de build' > output.txt
```

> [!tip]
>
> - Use pipes para integrar o Qwen Code em scripts shell existentes
> - Combine com outras ferramentas Unix para fluxos de trabalho poderosos
> - Considere usar --output-format para saída estruturada

### Controlar o formato de saída

Suponha que você precise da saída do Qwen Code em um formato específico, especialmente ao integrar o Qwen Code em scripts ou outras ferramentas.

**1. Use formato texto (padrão)**

```bash
cat data.txt | qwen -p 'resuma estes dados' --output-format text > summary.txt
```

Isso gera apenas a resposta em texto simples do Qwen Code (comportamento padrão).

**2. Use formato JSON**

```bash
cat code.py | qwen -p 'analise este código em busca de bugs' --output-format json > analysis.json
```

Isso gera um array JSON de mensagens com metadados incluindo custo e duração.

**3. Use formato JSON em streaming**

```bash
cat log.txt | qwen -p 'parseie este arquivo de log em busca de erros' --output-format stream-json
```

Isso gera uma série de objetos JSON em tempo real enquanto o Qwen Code processa a solicitação. Cada mensagem é um objeto JSON válido, mas a saída inteira não é um JSON válido se concatenada.

> [!tip]
>
> - Use `--output-format text` para integrações simples onde você só precisa da resposta do Qwen Code
> - Use `--output-format json` quando precisar do log completo da conversa
> - Use `--output-format stream-json` para saída em tempo real de cada turno da conversa

## Perguntar ao Qwen Code sobre suas capacidades

O Qwen Code tem acesso integrado à sua documentação e pode responder perguntas sobre seus próprios recursos e limitações.

### Exemplos de perguntas

```
o Qwen Code pode criar pull requests?
```

```
como o Qwen Code lida com permissões?
```

```
quais comandos de barra estão disponíveis?
```

```
como uso MCP com o Qwen Code?
```

```
como configuro o Qwen Code para Amazon Bedrock?
```

```
quais são as limitações do Qwen Code?
```

> [!note]
>
> O Qwen Code fornece respostas baseadas em documentação para essas perguntas. Para exemplos executáveis e demonstrações práticas, consulte as seções de fluxo de trabalho específicas acima.

> [!tip]
>
> - O Qwen Code sempre tem acesso à documentação mais recente do Qwen Code, independentemente da versão que você está usando
> - Faça perguntas específicas para obter respostas detalhadas
> - O Qwen Code pode explicar recursos complexos como integração MCP, configurações empresariais e fluxos de trabalho avançados