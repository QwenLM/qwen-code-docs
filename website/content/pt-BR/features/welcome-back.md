# Funcionalidade Welcome Back

A funcionalidade Welcome Back ajuda você a retomar seu trabalho de forma contínua, detectando automaticamente quando você retorna a um projeto com histórico de conversa existente e oferecendo a opção de continuar de onde parou.

## Visão Geral

Quando você inicia o Qwen Code em um diretório de projeto que contém um resumo de projeto gerado anteriormente (`.qwen/PROJECT_SUMMARY.md`), o diálogo Welcome Back aparecerá automaticamente, dando a você a opção de começar do zero ou continuar sua conversa anterior.

## Como Funciona

### Detecção Automática

A funcionalidade Welcome Back detecta automaticamente:

- **Arquivo de Resumo do Projeto:** Procura por `.qwen/PROJECT_SUMMARY.md` no diretório atual do seu projeto
- **Histórico de Conversa:** Verifica se há histórico de conversa significativo para retomar
- **Configurações:** Respeita sua configuração `enableWelcomeBack` (habilitada por padrão)

### Diálogo de Boas-vindas

Quando um resumo do projeto é encontrado, você verá um diálogo com:

- **Hora da Última Atualização:** Mostra quando o resumo foi gerado pela última vez
- **Objetivo Geral:** Exibe o objetivo principal da sua sessão anterior
- **Plano Atual:** Mostra o progresso das tarefas com indicadores de status:
  - `[DONE]` - Tarefas concluídas
  - `[IN PROGRESS]` - Tarefas em andamento
  - `[TODO]` - Tarefas planejadas
- **Estatísticas das Tarefas:** Resumo do total de tarefas, concluídas, em andamento e pendentes

### Opções

Você tem duas escolhas quando o diálogo de boas-vindas aparece:

1. **Iniciar nova sessão de chat**
   - Fecha o diálogo e inicia uma nova conversa
   - Nenhum contexto anterior é carregado

2. **Continuar conversa anterior**
   - Preenche automaticamente o campo de entrada com: `@.qwen/PROJECT_SUMMARY.md, Based on our previous conversation, Let's continue?`
   - Carrega o resumo do projeto como contexto para a IA
   - Permite que você continue de onde parou, de forma contínua

## Configuração

### Ativar/Desativar Welcome Back

Você pode controlar o recurso Welcome Back através das configurações:

**Via Diálogo de Configurações:**

1. Execute `/settings` no Qwen Code
2. Encontre "Enable Welcome Back" na categoria UI
3. Alterne a configuração entre ligado/desligado

**Via Arquivo de Configurações:**
Adicione ao seu `.qwen/settings.json`:

```json
{
  "enableWelcomeBack": true
}
```

**Localização das Configurações:**

- **Configurações do usuário:** `~/.qwen/settings.json` (afeta todos os projetos)
- **Configurações do projeto:** `.qwen/settings.json` (específico por projeto)

### Atalhos de Teclado

- **Escape:** Fecha o diálogo Welcome Back (padrão para "Iniciar nova sessão de chat")

## Integração com Outros Recursos

### Geração de Resumo do Projeto

O recurso Welcome Back funciona perfeitamente com o comando `/chat summary`:

1. **Gerar Resumo:** Use `/chat summary` para criar um resumo do projeto
2. **Detecção Automática:** Na próxima vez que você iniciar o Qwen Code neste projeto, o Welcome Back detectará o resumo
3. **Retomar Trabalho:** Escolha continuar e o resumo será carregado como contexto

### Confirmação de Saída

Ao sair com `/quit-confirm` e escolher "Generate summary and quit":

1. Um resumo do projeto é criado automaticamente
2. A próxima sessão acionará o diálogo do Welcome Back
3. Você pode continuar seu trabalho perfeitamente

## Estrutura de Arquivos

O recurso Welcome Back cria e utiliza:

```
seu-projeto/
├── .qwen/
│   └── PROJECT_SUMMARY.md    # Resumo do projeto gerado
```

### Formato do PROJECT_SUMMARY.md

O resumo gerado segue esta estrutura:

```markdown

# Project Summary

## Overall Goal

<!-- Frase única e concisa descrevendo o objetivo de alto nível -->
```

## Conhecimento Essencial

<!-- Fatos cruciais, convenções e restrições -->
<!-- Inclui: escolhas de tecnologia, decisões de arquitetura, preferências do usuário -->

## Ações Recentes

<!-- Resumo do trabalho significativo recente e resultados -->
<!-- Inclui: conquistas, descobertas, mudanças recentes -->

## Plano Atual

<!-- O roadmap atual de desenvolvimento e próximos passos -->
<!-- Usa marcadores de status: [DONE], [IN PROGRESS], [TODO] -->

---

## Metadados do Resumo

**Hora da atualização**: 2025-01-10T15:30:00.000Z