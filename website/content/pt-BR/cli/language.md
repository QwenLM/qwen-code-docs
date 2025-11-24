# Comando Language

O comando `/language` permite que você personalize as configurações de idioma tanto para a interface do usuário (UI) do Qwen Code quanto para a saída do modelo de linguagem. Este comando suporta duas funcionalidades distintas:

1. Definir o idioma da UI para a interface do Qwen Code
2. Definir o idioma de saída para o modelo de linguagem (LLM)

## Configurações de Idioma da UI

Para alterar o idioma da UI do Qwen Code, utilize o subcomando `ui`:

```
/language ui [zh-CN|en-US]
```

### Idiomas Disponíveis para a UI

- **zh-CN**: Chinês Simplificado (简体中文)
- **en-US**: Inglês

### Exemplos

```
/language ui zh-CN    # Define o idioma da UI como Chinês Simplificado
/language ui en-US    # Define o idioma da UI como Inglês
```

### Subcomandos de Idioma da UI

Você também pode usar subcomandos diretos para conveniência:

- `/language ui zh-CN` ou `/language ui zh` ou `/language ui 中文`
- `/language ui en-US` ou `/language ui en` ou `/language ui english`

## Configurações de Idioma de Saída do LLM

Para definir o idioma das respostas do modelo de linguagem, utilize o subcomando `output`:

```
/language output <language>
```

Este comando gera um arquivo de regra de idioma que instrui o LLM a responder no idioma especificado. O arquivo de regra é salvo em `~/.qwen/output-language.md`.

### Exemplos

```
/language output 中文      # Define o idioma de saída do LLM como chinês
/language output English   # Define o idioma de saída do LLM como inglês
/language output 日本語    # Define o idioma de saída do LLM como japonês
```

## Visualizando Configurações Atuais

Quando usado sem argumentos, o comando `/language` exibe as configurações de idioma atuais:

```
/language
```

Isso mostrará:

- Idioma atual da interface (UI)
- Idioma atual de saída do LLM (se configurado)
- Subcomandos disponíveis

## Notas

- As alterações no idioma da interface têm efeito imediato e recarregam todas as descrições de comandos
- As configurações de idioma de saída do LLM são persistidas em um arquivo de regras que é automaticamente incluído no contexto do modelo
- Para solicitar pacotes de idiomas adicionais para a interface, por favor abra uma issue no GitHub