# Fluxos de trabalho comuns

> Saiba mais sobre fluxos de trabalho comuns com o Qwen Code.

Cada tarefa neste documento inclui instruções claras, exemplos de comandos e boas práticas para ajudá-lo a tirar o máximo proveito do Qwen Code.

## Entenda novas bases de código

### Obtenha uma visão geral rápida da base de código

Suponha que você tenha acabado de ingressar em um novo projeto e precise entender sua estrutura rapidamente.

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
forneça-me uma visão geral desta base de código
```

**4. Aprofunde-se em componentes específicos**

```
explique os principais padrões de arquitetura utilizados aqui
```

```
quais são os principais modelos de dados?
```

```
como a autenticação é tratada?
```

> [!tip]
>
> - Comece com perguntas abrangentes e, em seguida, foque em áreas específicas  
> - Pergunte sobre convenções de codificação e padrões utilizados no projeto  
> - Solicite um glossário de termos específicos do projeto

### Localizar código relevante

Suppose você precisa localizar código relacionado a uma funcionalidade ou recurso específico.

**1. Peça ao Qwen Code para localizar os arquivos relevantes**

```
localize os arquivos que lidam com autenticação de usuários
```

**2. Obtenha contexto sobre como os componentes interagem**

```
como esses arquivos de autenticação funcionam em conjunto?
```

**3. Entenda o fluxo de execução**

```
rastreie o processo de login, desde o front-end até o banco de dados
```

> [!tip]
>
> - Seja específico sobre o que está procurando  
> - Use a linguagem de domínio do projeto

## Corrija bugs de forma eficiente

Suponha que você tenha encontrado uma mensagem de erro e precise localizar e corrigir sua origem.

**1. Compartilhe o erro com o Qwen Code**

```
Estou vendo um erro ao executar npm test
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
> - Informe ao Qwen Code o comando necessário para reproduzir o problema e obter o rastreamento de pilha (stack trace)
> - Mencione quaisquer etapas necessárias para reproduzir o erro
> - Avise ao Qwen Code se o erro ocorre de forma intermitente ou consistente

## Refatorar código

Suppose que você precisa atualizar um código antigo para usar padrões e práticas modernos.

**1. Identificar o código legado para refatoração**

```
encontrar usos de APIs obsoletas em nossa base de código
```

**2. Obter recomendações de refatoração**

```
sugerir como refatorar o arquivo utils.js para usar recursos modernos do JavaScript
```

**3. Aplicar as alterações com segurança**

```
refatorar o arquivo utils.js para usar recursos do ES 2024, mantendo o mesmo comportamento
```

**4. Verificar a refatoração**

```
executar os testes para o código refatorado
```

> [!tip]
>
> - Peça ao Qwen Code para explicar os benefícios da abordagem moderna  
> - Solicite que as alterações mantenham compatibilidade com versões anteriores sempre que necessário  
> - Faça a refatoração em pequenos incrementos testáveis

## Usar subagentes especializados

Suponha que você deseja usar subagentes de IA especializados para lidar com tarefas específicas de forma mais eficaz.

**1. Visualizar os subagentes disponíveis**

```
/agents
```

Isso mostra todos os subagentes disponíveis e permite criar novos.

**2. Usar subagentes automaticamente**

O Qwen Code delega automaticamente tarefas apropriadas para subagentes especializados:

```
revise minhas alterações recentes de código quanto a problemas de segurança
```

```
execute todos os testes e corrija quaisquer falhas
```

**3. Solicitar explicitamente subagentes específicos**

```
use o subagente code-reviewer para analisar o módulo de autenticação
```

```
peça ao subagente debugger investigar por que os usuários não conseguem fazer login
```

**4. Criar subagentes personalizados para seu fluxo de trabalho**

```
/agents
```

Em seguida, selecione “criar” e siga as instruções para definir:

- Um identificador exclusivo que descreva a finalidade do subagente (por exemplo, `code-reviewer`, `api-designer`).
- Quando o Qwen Code deve usar esse agente.
- Quais ferramentas ele pode acessar.
- Um prompt do sistema que descreva o papel e o comportamento do agente.

> [!tip]
>
> - Crie subagentes específicos para o projeto em `.qwen/agents/` para compartilhamento entre a equipe.
> - Use campos `description` descritivos para habilitar a delegação automática.
> - Limite o acesso às ferramentas apenas ao que cada subagente realmente precisa.
> - Saiba mais sobre [Subagentes](./features/sub-agents)
> - Saiba mais sobre [Modo de aprovação](./features/approval-mode)

## Trabalhe com testes

Suponha que você precise adicionar testes para código sem cobertura.

**1. Identifique o código não testado**

```
encontre funções em NotificationsService.swift que não são cobertas por testes
```

**2. Gere a estrutura básica dos testes**

```
adicione testes para o serviço de notificações
```

**3. Adicione casos de teste significativos**

```
adicione casos de teste para condições de borda no serviço de notificações
```

**4. Execute e verifique os testes**

```
execute os novos testes e corrija quaisquer falhas
```

O Qwen Code pode gerar testes que seguem os padrões e convenções já existentes no seu projeto. Ao solicitar testes, seja específico quanto ao comportamento que deseja verificar. O Qwen Code analisa seus arquivos de teste existentes para reproduzir o estilo, as frameworks e os padrões de asserção já utilizados.

Para uma cobertura abrangente, peça ao Qwen Code que identifique casos de borda que você possa ter deixado de considerar. O Qwen Code pode analisar os caminhos do seu código e sugerir testes para condições de erro, valores de fronteira e entradas inesperadas — situações facilmente negligenciadas.

## Criar pull requests

Suppose que você precisa criar um pull request bem documentado para suas alterações.

**1. Resuma suas alterações**

```
resuma as alterações que fiz no módulo de autenticação
```

**2. Gere um pull request com o Qwen Code**

```
crie um pull request
```

**3. Revise e refine**

```
melhore a descrição do pull request com mais contexto sobre as melhorias de segurança
```

**4. Adicione detalhes de testes**

```
adicione informações sobre como essas alterações foram testadas
```

> [!tip]
>
> - Peça diretamente ao Qwen Code para criar um pull request para você  
> - Revise o pull request gerado pelo Qwen Code antes de enviá-lo  
> - Peça ao Qwen Code para destacar possíveis riscos ou considerações

## Lidar com a documentação

Suponha que você precise adicionar ou atualizar a documentação do seu código.

**1. Identificar código sem documentação**

```
encontrar funções sem comentários JSDoc adequados no módulo auth
```

**2. Gerar documentação**

```
adicionar comentários JSDoc às funções sem documentação em auth.js
```

**3. Revisar e aprimorar**

```
melhorar a documentação gerada com mais contexto e exemplos
```

**4. Verificar a documentação**

```
verificar se a documentação segue os padrões do nosso projeto
```

> [!tip]
>
> - Especifique o estilo de documentação desejado (JSDoc, docstrings, etc.)
> - Peça exemplos na documentação
> - Solicite documentação para APIs públicas, interfaces e lógica complexa

## Arquivos e diretórios de referência

Use `@` para incluir rapidamente arquivos ou diretórios sem precisar esperar o Qwen Code ler seu conteúdo.

**1. Referenciar um único arquivo**

```
Explique a lógica em @src/utils/auth.js
```

Isso inclui todo o conteúdo do arquivo na conversa.

**2. Referenciar um diretório**

```
Qual é a estrutura de @src/components?
```

Isso fornece uma listagem do diretório com informações sobre os arquivos.

**3. Referenciar recursos MCP**

```
Mostre-me os dados de @github: repos/owner/repo/issues
```

Isso busca dados dos servidores MCP conectados usando o formato `@servidor: recurso`. Consulte [MCP](./features/mcp) para obter mais detalhes.

> [!tip]
>
> - Os caminhos de arquivo podem ser relativos ou absolutos  
> - Referências de arquivos com `@` adicionam o arquivo `QWEN.md` no diretório do arquivo referenciado e em seus diretórios pais ao contexto  
> - Referências de diretórios mostram listagens de arquivos, não seus conteúdos  
> - É possível referenciar vários arquivos em uma única mensagem (por exemplo, "`@arquivo1.js` e `@arquivo2.js`")

## Retomar conversas anteriores

Suponha que você tenha estado trabalhando em uma tarefa com o Qwen Code e precise retomá-la mais tarde, na mesma sessão ou em outra.

O Qwen Code oferece duas opções para retomar conversas anteriores:

- `--continue` para retomar automaticamente a conversa mais recente
- `--resume` para exibir um seletor de conversas

**1. Retomar a conversa mais recente**

```bash
qwen --continue
```

Isso retoma imediatamente sua conversa mais recente, sem nenhuma solicitação adicional.

**2. Retomar em modo não interativo**

```bash
qwen --continue --p "Continue com minha tarefa"
```

Use `--print` junto com `--continue` para retomar a conversa mais recente em modo não interativo — ideal para scripts ou automações.

**3. Exibir o seletor de conversas**

```bash
qwen --resume
```

Isso exibe um seletor interativo de conversas com uma lista limpa mostrando:

- Resumo da sessão (ou o prompt inicial)
- Metadados: tempo decorrido, contagem de mensagens e branch do Git

Use as setas para navegar e pressione Enter para selecionar uma conversa. Pressione Esc para sair.

> [!tip]
>
> - O histórico de conversas é armazenado localmente em sua máquina
> - Use `--continue` para acessar rapidamente sua conversa mais recente
> - Use `--resume` quando precisar selecionar uma conversa específica do passado
> - Ao retomar, você verá todo o histórico da conversa antes de continuar
> - A conversa retomada inicia com o mesmo modelo e configuração da original
>
> **Como funciona**:
>
> 1. **Armazenamento de conversas**: Todas as conversas são salvas automaticamente localmente, com todo o histórico de mensagens
> 2. **Daserialização de mensagens**: Ao retomar, todo o histórico de mensagens é restaurado para manter o contexto
> 3. **Estado das ferramentas**: O uso de ferramentas e seus resultados da conversa anterior são preservados
> 4. **Restauração de contexto**: A conversa retomada mantém intacto todo o contexto anterior
>
> **Exemplos**:
>
> ```bash
> # Retomar a conversa mais recente
> qwen --continue
>
> # Retomar a conversa mais recente com um prompt específico
> qwen --continue --p "Mostre-me nosso progresso"
>
> # Exibir o seletor de conversas
> qwen --resume
>
> # Retomar a conversa mais recente em modo não interativo
> qwen --continue --p "Execute os testes novamente"
> ```

## Execute sessões paralelas do Qwen Code com worktrees do Git

Suponha que você precise trabalhar em várias tarefas simultaneamente, com isolamento completo de código entre instâncias do Qwen Code.

**1. Entenda as worktrees do Git**

As worktrees do Git permitem fazer checkout de múltiplas branches do mesmo repositório em diretórios separados. Cada worktree possui seu próprio diretório de trabalho com arquivos isolados, enquanto compartilha o mesmo histórico do Git. Saiba mais na [documentação oficial do `git worktree`](https://git-scm.com/docs/git-worktree).

**2. Crie uma nova worktree**

```bash

# Crie uma nova worktree com uma nova branch
git worktree add ../project-feature-a -b feature-a

# Ou crie uma worktree com uma branch existente
git worktree add ../project-bugfix bugfix-123
```

Isso cria um novo diretório com uma cópia de trabalho separada do seu repositório.

**3. Execute o Qwen Code em cada worktree**

```bash

# Navegue até sua worktree
cd ../project-feature-a

# Executar o Qwen Code neste ambiente isolado  
qwen  
```

**4. Executar o Qwen Code em outra worktree**

```bash
cd ../project-bugfix
qwen
```

**5. Gerenciar suas worktrees**

```bash

# Listar todas as worktrees
git worktree list

# Remover uma worktree ao finalizar
git worktree remove ../project-feature-a
```

> [!tip]
>
> - Cada worktree possui seu próprio estado de arquivos independente, tornando-a ideal para sessões paralelas do Qwen Code
> - Alterações feitas em uma worktree não afetam as demais, evitando que instâncias do Qwen Code interfiram umas nas outras
> - Todas as worktrees compartilham o mesmo histórico do Git e conexões remotas
> - Para tarefas de longa duração, você pode deixar o Qwen Code trabalhando em uma worktree enquanto continua o desenvolvimento em outra
> - Use nomes descritivos para os diretórios para identificar facilmente a finalidade de cada worktree
> - Lembre-se de inicializar seu ambiente de desenvolvimento em cada nova worktree conforme a configuração do seu projeto. Dependendo da sua stack, isso pode incluir:
>   - Projetos JavaScript: Executar a instalação de dependências (`npm install`, `yarn`)
>   - Projetos Python: Configurar ambientes virtuais ou instalar com gerenciadores de pacotes
>   - Outras linguagens: Seguir o processo padrão de configuração do seu projeto

## Usar o Qwen Code como um utilitário no estilo Unix

### Adicionar o Qwen Code ao seu processo de verificação

Suponha que você deseja usar o Qwen Code como um *linter* ou revisor de código.

**Adicione o Qwen Code ao seu script de build:**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'você é um linter. Analise as alterações em comparação com a branch main e relate quaisquer problemas relacionados a erros de digitação. Informe o nome do arquivo e o número da linha em uma única linha, e uma descrição do problema na linha seguinte. Não retorne nenhum outro texto.'"
    }
}
```

> [!tip]
>
> - Use o Qwen Code para revisão automatizada de código em seu pipeline de CI/CD  
> - Personalize o *prompt* para verificar problemas específicos relevantes ao seu projeto  
> - Considere criar vários scripts para diferentes tipos de verificação

### Entrada por pipe, saída por pipe

Suponha que você deseja enviar dados para o Qwen Code por meio de um pipe e obter de volta dados em um formato estruturado.

**Enviar dados por pipe ao Qwen Code:**

```bash
cat build-error.txt | qwen -p 'explique de forma concisa a causa raiz deste erro de compilação' > output.txt
```

> [!tip]
>
> - Use pipes para integrar o Qwen Code a scripts de shell existentes  
> - Combine com outras ferramentas Unix para criar fluxos de trabalho poderosos  
> - Considere usar a opção `--output-format` para obter saída estruturada

### Controlar o formato de saída

Suponha que você precise da saída do Qwen Code em um formato específico, especialmente ao integrar o Qwen Code em scripts ou outras ferramentas.

**1. Usar o formato de texto (padrão)**

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

Isso gera uma série de objetos JSON em tempo real, à medida que o Qwen Code processa a solicitação. Cada mensagem é um objeto JSON válido, mas a saída completa não é um JSON válido se concatenada.

> [!tip]
>
> - Use `--output-format text` para integrações simples nas quais você precisa apenas da resposta do Qwen Code  
> - Use `--output-format json` quando você precisar do registro completo da conversa  
> - Use `--output-format stream-json` para saída em tempo real de cada turno da conversa

## Pergunte ao Qwen Code sobre suas capacidades

O Qwen Code tem acesso embutido à sua própria documentação e pode responder perguntas sobre seus recursos e limitações.

### Exemplos de perguntas

```
O Qwen Code pode criar pull requests?
```

```
Como o Qwen Code lida com permissões?
```

```
Quais comandos com barra estão disponíveis?
```

```
Como usar o MCP com o Qwen Code?
```

```
Como configurar o Qwen Code para o Amazon Bedrock?
```

```
Quais são as limitações do Qwen Code?
```

> [!note]
>
> O Qwen Code fornece respostas baseadas na documentação para essas perguntas. Para exemplos executáveis e demonstrações práticas, consulte as seções de fluxo de trabalho específicas acima.

> [!tip]
>
> - O Qwen Code sempre tem acesso à documentação mais recente do Qwen Code, independentemente da versão que você está usando  
> - Faça perguntas específicas para obter respostas detalhadas  
> - O Qwen Code pode explicar recursos complexos, como integração com MCP, configurações empresariais e fluxos de trabalho avançados